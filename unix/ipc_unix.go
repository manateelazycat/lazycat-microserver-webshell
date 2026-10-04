//go:build linux || darwin

package unix

import (
	"errors"
	"fmt"
	"net"
	"os"
	"syscall"
	"time"
)

func acquireAgentDaemonLock(socketPath string) (*os.File, error) {
	lockPath := socketPath + ".lock"
	lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open agent daemon lock failed: %w", err)
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = lock.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return nil, fmt.Errorf("agent daemon already running for socket %s", socketPath)
		}
		return nil, fmt.Errorf("lock agent daemon failed: %w", err)
	}
	return lock, nil
}

func removeStaleAgentSocket(socketPath string) error {
	info, err := os.Lstat(socketPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("stat existing agent socket failed: %w", err)
	}
	if info.Mode()&os.ModeSocket == 0 {
		return fmt.Errorf("agent socket path is occupied by a non-socket file: %s", socketPath)
	}
	conn, dialErr := net.DialTimeout("unix", socketPath, 200*time.Millisecond)
	if dialErr == nil {
		_ = conn.Close()
		return fmt.Errorf("agent socket is already accepting connections: %s", socketPath)
	}
	if err := os.Remove(socketPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove stale agent socket failed: %w", err)
	}
	return nil
}

func removeAgentSocketIfOwned(socketPath string, owned os.FileInfo) {
	current, err := os.Lstat(socketPath)
	if err != nil || !os.SameFile(owned, current) {
		return
	}
	_ = os.Remove(socketPath)
}
