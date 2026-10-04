//go:build linux

package unix

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func reconcileAgentDaemons(socketPath, selector, accountID string, replaceActive bool) (int, error) {
	return reconcileAgentDaemonsWithOptions(socketPath, selector, accountID, replaceActive, false)
}

func reconcileAgentDaemonsWithOptions(socketPath, selector, accountID string, replaceActive, forceProtocolReplacement bool) (int, error) {
	socketPath = strings.TrimSpace(socketPath)
	selector = strings.TrimSpace(selector)
	accountID = strings.TrimSpace(accountID)
	if socketPath == "" {
		return 0, errors.New("agent socket path is required")
	}
	activePID, err := activeAgentSocketPID(socketPath)
	if err != nil {
		return 0, err
	}
	pids, err := matchingAgentDaemonPIDs(socketPath, selector, accountID)
	if err != nil {
		return 0, err
	}
	activeMatchesScope := activePID == 0
	for _, pid := range pids {
		if pid == activePID {
			activeMatchesScope = true
			break
		}
	}
	if replaceActive && !activeMatchesScope {
		return 0, fmt.Errorf("active agent socket owner pid %d does not match selector/account scope", activePID)
	}
	if replaceActive && activePID != 0 {
		version, protocolErr := activeAgentSocketProtocolVersion(socketPath, selector, accountID)
		if protocolErr == nil && version == AgentProtocolVersion {
			return 0, nil
		}
		if protocolErr != nil && !forceProtocolReplacement {
			return 0, protocolErr
		}
	}
	victims := make([]int, 0, len(pids))
	if replaceActive {
		if activePID != 0 {
			victims = append(victims, activePID)
		}
	} else {
		for _, pid := range pids {
			if pid == os.Getpid() || pid == activePID {
				continue
			}
			victims = append(victims, pid)
		}
	}
	for _, pid := range victims {
		if err := syscall.Kill(pid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
			return 0, fmt.Errorf("terminate agent daemon %d failed: %w", pid, err)
		}
	}
	if err := waitForAgentDaemonExit(victims, socketPath, selector, accountID, 750*time.Millisecond); err == nil {
		return len(victims), nil
	}
	for _, pid := range victims {
		if !agentDaemonPIDMatches(pid, socketPath, selector, accountID) {
			continue
		}
		if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			return 0, fmt.Errorf("kill agent daemon %d failed: %w", pid, err)
		}
	}
	if err := waitForAgentDaemonExit(victims, socketPath, selector, accountID, 750*time.Millisecond); err != nil {
		return 0, err
	}
	return len(victims), nil
}

func activeAgentSocketProtocolVersion(socketPath, selector, accountID string) (string, error) {
	conn, err := net.DialTimeout("unix", socketPath, 500*time.Millisecond)
	if err != nil {
		return "", fmt.Errorf("connect active agent for protocol verification failed: %w", err)
	}
	defer conn.Close()
	if err := conn.SetDeadline(time.Now().Add(time.Second)); err != nil {
		return "", err
	}
	if err := json.NewEncoder(conn).Encode(AgentRequest{Type: "ping", Selector: selector, AccountID: accountID}); err != nil {
		return "", fmt.Errorf("write active agent protocol verification failed: %w", err)
	}
	var response AgentResponse
	if err := json.NewDecoder(conn).Decode(&response); err != nil {
		return "", fmt.Errorf("read active agent protocol verification failed: %w", err)
	}
	if !response.OK {
		return "", fmt.Errorf("active agent protocol verification failed: %s", strings.TrimSpace(response.Error))
	}
	version := strings.TrimSpace(response.Version)
	if version == "" {
		return "", errors.New("active agent protocol verification returned an empty version")
	}
	return version, nil
}

func activeAgentSocketPID(socketPath string) (int, error) {
	info, err := os.Lstat(socketPath)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("stat agent socket for reconciliation failed: %w", err)
	}
	if info.Mode()&os.ModeSocket == 0 {
		return 0, fmt.Errorf("agent socket path is occupied by a non-socket file: %s", socketPath)
	}
	conn, err := net.DialTimeout("unix", socketPath, 500*time.Millisecond)
	if err != nil {
		if errors.Is(err, syscall.ECONNREFUSED) || errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("connect agent socket for reconciliation failed: %w", err)
	}
	defer conn.Close()
	unixConn, ok := conn.(*net.UnixConn)
	if !ok {
		return 0, errors.New("agent socket connection is not unix")
	}
	raw, err := unixConn.SyscallConn()
	if err != nil {
		return 0, err
	}
	var credentials *syscall.Ucred
	var socketErr error
	if err := raw.Control(func(fd uintptr) {
		credentials, socketErr = syscall.GetsockoptUcred(int(fd), syscall.SOL_SOCKET, syscall.SO_PEERCRED)
	}); err != nil {
		return 0, err
	}
	if socketErr != nil {
		return 0, socketErr
	}
	if credentials == nil || credentials.Pid <= 0 {
		return 0, errors.New("agent socket peer pid is unavailable")
	}
	return int(credentials.Pid), nil
}

func matchingAgentDaemonPIDs(socketPath, selector, accountID string) ([]int, error) {
	paths, err := filepath.Glob("/proc/[0-9]*/cmdline")
	if err != nil {
		return nil, err
	}
	result := make([]int, 0)
	for _, path := range paths {
		pid, err := strconv.Atoi(filepath.Base(filepath.Dir(path)))
		if err != nil || pid <= 0 {
			continue
		}
		if agentDaemonPIDMatches(pid, socketPath, selector, accountID) {
			result = append(result, pid)
		}
	}
	return result, nil
}

func agentDaemonPIDMatches(pid int, socketPath, selector, accountID string) bool {
	data, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "cmdline"))
	if err != nil {
		return false
	}
	data = bytes.TrimRight(data, "\x00")
	if len(data) == 0 {
		return false
	}
	rawArgs := bytes.Split(data, []byte{0})
	args := make([]string, 0, len(rawArgs))
	for _, arg := range rawArgs {
		args = append(args, string(arg))
	}
	return agentDaemonArgsMatch(args, socketPath, selector, accountID)
}

func agentDaemonArgsMatch(args []string, socketPath, selector, accountID string) bool {
	if len(args) < 3 || args[1] != "agent" || args[2] != "daemon" {
		return false
	}
	processSocket, socketFound := agentDaemonArgValue(args[3:], "--socket")
	processSelector, selectorFound := agentDaemonArgValue(args[3:], "--selector")
	processAccountID, accountFound := agentDaemonArgValue(args[3:], "--account")
	return socketFound && selectorFound && accountFound &&
		strings.TrimSpace(processSocket) == socketPath &&
		strings.TrimSpace(processSelector) == selector &&
		strings.TrimSpace(processAccountID) == accountID
}

func agentDaemonArgValue(args []string, name string) (string, bool) {
	prefix := name + "="
	for index, arg := range args {
		if arg == name {
			if index+1 >= len(args) {
				return "", false
			}
			return args[index+1], true
		}
		if strings.HasPrefix(arg, prefix) {
			return strings.TrimPrefix(arg, prefix), true
		}
	}
	return "", false
}

func waitForAgentDaemonExit(pids []int, socketPath, selector, accountID string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		remaining := 0
		for _, pid := range pids {
			if agentDaemonPIDMatches(pid, socketPath, selector, accountID) {
				remaining++
			}
		}
		if remaining == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%d agent daemon process(es) did not exit", remaining)
		}
		time.Sleep(25 * time.Millisecond)
	}
}
