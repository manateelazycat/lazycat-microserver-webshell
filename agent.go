package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"hash/crc32"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"lcmd-webshell/internal/pkg/fonts"

	"github.com/gorilla/websocket"
)

const (
	agentProtocolVersion = "lcmd-webshell-agent-v8"

	agentFrameBinary         = byte('B')
	agentFrameText           = byte('T')
	agentFrameInput          = byte('I')
	agentFrameGeneratedInput = byte('G')
	agentFrameResize         = byte('R')
	agentFrameLock           = byte('L')
	agentFrameDetach         = byte('D')

	agentMaxFramePayload = 32 << 20
	agentReconcileMarker = "__LCMD_WEBSHELL_AGENT_RECONCILED__"
)

type fastBinaryHeader struct {
	ProtocolVersion   int    `json:"protocol_version"`
	Selector          string `json:"selector"`
	PaneID            string `json:"pane_id"`
	HistoryGeneration string `json:"history_generation,omitempty"`
	Sequence          uint64 `json:"sequence"`
	StartCursor       string `json:"start_cursor"`
	EndCursor         string `json:"end_cursor"`
	Length            int    `json:"length"`
	Checksum          string `json:"checksum"`
}

const fastBinaryProtocolVersion = 1

func encodeFastBinaryFrame(selector, paneID, historyGeneration string, sequence, startCursor uint64, payload []byte) ([]byte, error) {
	endCursor := startCursor + uint64(len(payload))
	checksum := crc32.ChecksumIEEE(payload)
	var checksumBytes [4]byte
	binary.BigEndian.PutUint32(checksumBytes[:], checksum)
	header, err := json.Marshal(fastBinaryHeader{
		ProtocolVersion:   fastBinaryProtocolVersion,
		Selector:          selector,
		PaneID:            paneID,
		HistoryGeneration: historyGeneration,
		Sequence:          sequence,
		StartCursor:       strconv.FormatUint(startCursor, 10),
		EndCursor:         strconv.FormatUint(endCursor, 10),
		Length:            len(payload),
		Checksum:          hex.EncodeToString(checksumBytes[:]),
	})
	if err != nil {
		return nil, err
	}
	frame := make([]byte, 8+len(header)+len(payload))
	copy(frame[:4], []byte("LCF1"))
	binary.BigEndian.PutUint32(frame[4:8], uint32(len(header)))
	copy(frame[8:], header)
	copy(frame[8+len(header):], payload)
	return frame, nil
}

type agentRequest struct {
	Type                 string                  `json:"type"`
	Selector             string                  `json:"selector,omitempty"`
	AccountID            string                  `json:"account_id,omitempty"`
	Username             string                  `json:"username,omitempty"`
	PaneID               string                  `json:"pane_id,omitempty"`
	Cols                 int                     `json:"cols,omitempty"`
	Rows                 int                     `json:"rows,omitempty"`
	TerminalScrollback   int                     `json:"terminal_scrollback,omitempty"`
	HistoryGeneration    string                  `json:"history_generation,omitempty"`
	WorkspaceGeneration  string                  `json:"workspace_generation,omitempty"`
	CacheProtocolVersion int                     `json:"cache_protocol_version,omitempty"`
	LocalBaseCursor      string                  `json:"local_base_cursor,omitempty"`
	LocalEndCursor       string                  `json:"local_end_cursor,omitempty"`
	HistoryReplayMode    string                  `json:"history_replay_mode,omitempty"`
	IntegrityProtocol    string                  `json:"integrity_protocol,omitempty"`
	Action               *workspaceActionRequest `json:"action,omitempty"`
	CloseIdle            bool                    `json:"close_idle,omitempty"`
}

type agentResponse struct {
	OK       bool                    `json:"ok"`
	Version  string                  `json:"version,omitempty"`
	Error    string                  `json:"error,omitempty"`
	State    *workspaceState         `json:"state,omitempty"`
	Activity *workspaceActivityState `json:"activity,omitempty"`
}

type agentDaemon struct {
	mu        sync.Mutex
	selector  string
	accountID string
	username  string
	workspace *terminalWorkspace
}

func handleAgentCommand(args []string) bool {
	if len(args) == 0 || args[0] != "agent" {
		return false
	}
	if err := runAgentCommand(args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	return true
}

func runAgentCommand(args []string) error {
	if len(args) == 0 {
		return errors.New("missing agent command")
	}
	switch args[0] {
	case "version":
		fmt.Println(agentProtocolVersion)
		return nil
	case "daemon":
		fs := flag.NewFlagSet("agent daemon", flag.ContinueOnError)
		socketPath := fs.String("socket", defaultAgentSocketPath, "unix socket path")
		readyFile := fs.String("ready-file", "", "readiness marker path")
		username := fs.String("username", "", "instance login username")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return runAgentDaemon(*socketPath, *readyFile, *selector, *accountID, *username)
	case "request":
		fs := flag.NewFlagSet("agent request", flag.ContinueOnError)
		socketPath := fs.String("socket", defaultAgentSocketPath, "unix socket path")
		encoded := fs.String("request", "", "base64 encoded request")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return runAgentRequestClient(*socketPath, *encoded)
	case "reconcile":
		fs := flag.NewFlagSet("agent reconcile", flag.ContinueOnError)
		socketPath := fs.String("socket", defaultAgentSocketPath, "unix socket path")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		replaceActive := fs.Bool("replace-active", false, "replace the active daemon after a confirmed protocol mismatch")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		count, err := reconcileAgentDaemons(*socketPath, *selector, *accountID, *replaceActive)
		if err != nil {
			return err
		}
		fmt.Printf("%s\t%d\n", agentReconcileMarker, count)
		return nil
	case "attach":
		fs := flag.NewFlagSet("agent attach", flag.ContinueOnError)
		socketPath := fs.String("socket", defaultAgentSocketPath, "unix socket path")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		paneID := fs.String("pane", "", "pane id")
		cols := fs.Int("cols", 0, "terminal columns")
		rows := fs.Int("rows", 0, "terminal rows")
		terminalScrollback := fs.Int("terminal-scrollback", fonts.DefaultTerminalScrollback, "terminal scrollback lines")
		historyGeneration := fs.String("history-generation", "", "terminal history generation")
		workspaceGeneration := fs.String("workspace-generation", "", "terminal workspace generation")
		cacheProtocolVersion := fs.Int("cache-protocol-version", 0, "terminal cache protocol version")
		localBaseCursor := fs.String("local-base-cursor", "", "local terminal history base cursor")
		localEndCursor := fs.String("local-end-cursor", "", "local terminal history end cursor")
		historyReplayMode := fs.String("history-replay-mode", "", "terminal history replay mode")
		integrityProtocol := fs.String("integrity-protocol", "", "terminal binary integrity protocol")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return runAgentAttachClient(*socketPath, *selector, *accountID, *paneID, *cols, *rows, *terminalScrollback, *cacheProtocolVersion, *workspaceGeneration, *historyGeneration, *localBaseCursor, *localEndCursor, *historyReplayMode, *integrityProtocol)
	default:
		return fmt.Errorf("unknown agent command %q", args[0])
	}
}

func runAgentDaemon(socketPath, readyFile, selector, accountID, username string) error {
	if err := resetAgentDaemonSignalDisposition(); err != nil {
		return fmt.Errorf("reset agent daemon signal disposition failed: %w", err)
	}
	if err := raiseAgentOpenFilesLimit(); err != nil {
		return fmt.Errorf("raise agent open files limit failed: %w", err)
	}
	socketPath = strings.TrimSpace(socketPath)
	if socketPath == "" {
		return errors.New("agent socket path is required")
	}
	if err := os.MkdirAll(filepath.Dir(socketPath), 0o755); err != nil {
		return fmt.Errorf("create agent socket directory failed: %w", err)
	}
	lock, err := acquireAgentDaemonLock(socketPath)
	if err != nil {
		return err
	}
	defer func() {
		_ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
		_ = lock.Close()
	}()
	if err := removeStaleAgentSocket(socketPath); err != nil {
		return err
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return fmt.Errorf("listen agent unix socket failed: %w", err)
	}
	socketInfo, err := os.Lstat(socketPath)
	if err != nil {
		_ = listener.Close()
		return fmt.Errorf("stat agent unix socket failed: %w", err)
	}
	defer func() {
		_ = listener.Close()
		removeAgentSocketIfOwned(socketPath, socketInfo)
	}()
	_ = os.Chmod(socketPath, 0o600)
	if err := writeAgentReadyFile(readyFile); err != nil {
		return fmt.Errorf("write agent readiness marker failed: %w", err)
	}

	daemon := &agentDaemon{
		selector:  strings.TrimSpace(selector),
		accountID: strings.TrimSpace(accountID),
		username:  strings.TrimSpace(username),
	}
	for {
		conn, err := listener.Accept()
		if err != nil {
			return fmt.Errorf("accept agent unix socket connection failed: %w", err)
		}
		go daemon.handleConn(conn)
	}
}

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

func writeAgentReadyFile(readyFile string) error {
	readyFile = strings.TrimSpace(readyFile)
	if readyFile == "" {
		return nil
	}
	dir := filepath.Dir(readyFile)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(dir, ".lcmd-webshell-agent.ready.*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := io.WriteString(temporary, agentReadyMarker+"\n"); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, readyFile)
}

func (d *agentDaemon) handleConn(conn net.Conn) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return
	}
	var request agentRequest
	if err := json.Unmarshal(bytesTrimSpace(line), &request); err != nil {
		_ = json.NewEncoder(conn).Encode(agentResponse{OK: false, Version: agentProtocolVersion, Error: err.Error()})
		return
	}
	switch strings.TrimSpace(request.Type) {
	case "ping":
		d.mu.Lock()
		err := d.validateRequestSelectorLocked(request.Selector)
		if err == nil {
			err = d.validateRequestAccountLocked(request.AccountID)
		}
		d.mu.Unlock()
		response := agentResponse{OK: err == nil, Version: agentProtocolVersion}
		if err != nil {
			response.Error = err.Error()
		}
		_ = json.NewEncoder(conn).Encode(response)
	case "state":
		state, err := d.workspaceState(context.Background(), request)
		d.writeStateResponse(conn, state, err)
	case "action":
		state, err := d.applyWorkspaceAction(context.Background(), request)
		d.writeStateResponse(conn, state, err)
	case "activity":
		activity, err := d.workspaceActivity(context.Background(), request)
		response := agentResponse{OK: err == nil, Version: agentProtocolVersion, Activity: activity}
		if err != nil {
			response.Error = err.Error()
		}
		_ = json.NewEncoder(conn).Encode(response)
	case "attach":
		d.handleAttach(context.Background(), conn, reader, request)
	default:
		_ = json.NewEncoder(conn).Encode(agentResponse{OK: false, Version: agentProtocolVersion, Error: "unknown request type"})
	}
}

func (d *agentDaemon) writeStateResponse(w io.Writer, state workspaceState, err error) {
	response := agentResponse{OK: err == nil, Version: agentProtocolVersion}
	if err != nil {
		response.Error = err.Error()
	} else {
		response.State = &state
	}
	_ = json.NewEncoder(w).Encode(response)
}

func (d *agentDaemon) ensureWorkspaceLocked(request agentRequest) (*terminalWorkspace, error) {
	if err := d.validateRequestSelectorLocked(request.Selector); err != nil {
		return nil, err
	}
	if err := d.validateRequestAccountLocked(request.AccountID); err != nil {
		return nil, err
	}
	if username := strings.TrimSpace(request.Username); username != "" || d.username == "" {
		d.username = username
	}
	historyLimitBytes := historyLimitBytesForTerminalScrollback(request.TerminalScrollback)
	if d.workspace == nil {
		workspaceGeneration, err := newHistoryGeneration()
		if err != nil {
			return nil, fmt.Errorf("create workspace generation: %w", err)
		}
		workspace := &terminalWorkspace{
			selector:            d.selector,
			cacheScopeID:        terminalCacheScopeID(d.accountID),
			workspaceGeneration: workspaceGeneration,
			username:            d.username,
			rootDir:             "/",
			localPTY:            true,
			historyLimitBytes:   historyLimitBytes,
			panes:               make(map[string]*terminalPane),
			nextTabID:           1,
			nextPaneID:          1,
		}
		if err := workspace.createTabLocked("", "", normalizeCols(request.Cols), normalizeRows(request.Rows)); err != nil {
			return nil, err
		}
		d.workspace = workspace
	}
	if d.workspace.selector == "" {
		d.workspace.selector = d.selector
	}
	if d.workspace.cacheScopeID == "" && d.accountID != "" {
		d.workspace.cacheScopeID = terminalCacheScopeID(d.accountID)
	}
	if d.workspace.workspaceGeneration == "" {
		workspaceGeneration, err := newHistoryGeneration()
		if err != nil {
			return nil, fmt.Errorf("create workspace generation: %w", err)
		}
		d.workspace.workspaceGeneration = workspaceGeneration
	}
	if d.workspace.username == "" || strings.TrimSpace(request.Username) != "" {
		d.workspace.username = d.username
	}
	d.workspace.setHistoryLimitBytes(historyLimitBytes)
	if len(d.workspace.tabs) == 0 {
		if err := d.workspace.createTabLocked("", "", normalizeCols(request.Cols), normalizeRows(request.Rows)); err != nil {
			return nil, err
		}
	}
	return d.workspace, nil
}

func (d *agentDaemon) validateRequestSelectorLocked(selector string) error {
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return nil
	}
	if d.selector != "" && d.selector != selector {
		return fmt.Errorf("agent selector mismatch: daemon %q, request %q", d.selector, selector)
	}
	if d.workspace != nil && d.workspace.selector != "" && d.workspace.selector != selector {
		return fmt.Errorf("agent workspace selector mismatch: workspace %q, request %q", d.workspace.selector, selector)
	}
	d.selector = selector
	return nil
}

func (d *agentDaemon) validateRequestAccountLocked(accountID string) error {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		if d.accountID != "" {
			return errors.New("agent account is required")
		}
		return nil
	}
	if d.accountID != "" && d.accountID != accountID {
		return fmt.Errorf("agent account mismatch: daemon %q, request %q", d.accountID, accountID)
	}
	d.accountID = accountID
	return nil
}

func (d *agentDaemon) workspaceState(ctx context.Context, request agentRequest) (workspaceState, error) {
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		return workspaceState{}, err
	}
	return workspace.snapshot(), nil
}

func (d *agentDaemon) applyWorkspaceAction(ctx context.Context, request agentRequest) (workspaceState, error) {
	if request.Action == nil {
		return workspaceState{}, errors.New("action is required")
	}
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		return workspaceState{}, err
	}
	if request.Action.Action == "create_tab" || request.Action.Action == "split_pane" {
		_, _ = workspace.refreshActivity(ctx)
	}
	if err := workspace.applyAction(*request.Action); err != nil {
		return workspaceState{}, err
	}
	return workspace.snapshot(), nil
}

func (d *agentDaemon) workspaceActivity(ctx context.Context, request agentRequest) (*workspaceActivityState, error) {
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		return nil, err
	}
	state, err := workspace.refreshActivity(ctx)
	return &state, err
}

func (d *agentDaemon) handleAttach(ctx context.Context, conn net.Conn, reader *bufio.Reader, request agentRequest) {
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		_ = writeAgentControlFrame(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return
	}
	syncRequest := historySyncRequest{
		generation:           strings.TrimSpace(request.HistoryGeneration),
		workspaceGeneration:  strings.TrimSpace(request.WorkspaceGeneration),
		cacheProtocolVersion: request.CacheProtocolVersion,
		forceSnapshot:        strings.TrimSpace(request.HistoryReplayMode) == "snapshot",
		integrityProtocol:    strings.TrimSpace(request.IntegrityProtocol),
	}
	base, baseErr := strconv.ParseUint(strings.TrimSpace(request.LocalBaseCursor), 10, 64)
	end, endErr := strconv.ParseUint(strings.TrimSpace(request.LocalEndCursor), 10, 64)
	if syncRequest.generation != "" && baseErr == nil && endErr == nil && base <= end {
		syncRequest.localBase = base
		syncRequest.localEnd = end
		syncRequest.hasRange = true
	}
	pane, replayIdentity, err := workspace.paneForAttach(request.PaneID, syncRequest)
	if err != nil {
		if strings.Contains(err.Error(), "workspace generation") || strings.Contains(err.Error(), "cache protocol") || strings.Contains(err.Error(), "pane not found") {
			_ = writeAgentControlFrame(conn, map[string]any{
				"type":                   "workspace-refresh-required",
				"selector":               workspace.selector,
				"cache_protocol_version": terminalCacheProtocolVersion,
				"reason":                 err.Error(),
			})
			return
		}
		_ = writeAgentControlFrame(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return
	}
	history, client, allowGeneratedInputDuringReplay, err := pane.attachClient(syncRequest)
	if err != nil {
		_ = writeAgentControlFrame(conn, map[string]any{
			"type":          "process-exit",
			"message":       err.Error(),
			"exit_code":     -1,
			"authoritative": true,
			"pane_id":       request.PaneID,
		})
		return
	}
	inputLockOwner := fmt.Sprintf("attach:%p", conn)
	defer func() {
		pane.setInputBlockedBy(inputLockOwner, false)
		pane.detachClient(client)
		client.close()
	}()

	writerDone := make(chan struct{})
	fastSequence := uint64(1)
	fastCursor := history.deltaFrom
	go func() {
		defer close(writerDone)
		if !writeAgentHistoryReplay(conn, replayIdentity, history, allowGeneratedInputDuringReplay, request.IntegrityProtocol == "fast-v1", &fastSequence, &fastCursor) {
			return
		}
		for {
			select {
			case outbound := <-client.send:
				client.dequeued(len(outbound.payload))
				payload := outbound.payload
				if request.IntegrityProtocol == "fast-v1" && outbound.messageType == websocket.BinaryMessage {
					frame, encodeErr := encodeFastBinaryFrame(replayIdentity.selector, replayIdentity.paneID, history.generation, fastSequence, fastCursor, payload)
					if encodeErr != nil {
						return
					}
					fastSequence++
					fastCursor += uint64(len(payload))
					payload = frame
				}
				frameType := agentFrameBinary
				if outbound.messageType == websocket.TextMessage {
					frameType = agentFrameText
				}
				if err := writeAgentFrame(conn, frameType, payload); err != nil {
					return
				}
				if outbound.closeAfter {
					return
				}
			case <-client.done:
				return
			}
		}
	}()

	for {
		frameType, payload, err := readAgentFrame(reader)
		if err != nil {
			client.close()
			<-writerDone
			return
		}
		switch frameType {
		case agentFrameInput:
			_ = pane.writeInput(payload)
		case agentFrameGeneratedInput:
			_ = pane.writeGeneratedInput(payload)
		case agentFrameResize:
			var message terminalControlMessage
			if err := json.Unmarshal(payload, &message); err == nil {
				switch message.Type {
				case "resize":
					if message.Cols > 0 && message.Rows > 0 {
						if message.ResizeEpoch == "" {
							_ = pane.applyLegacyInputResize(message.Cols, message.Rows, message.PixelWidth, message.PixelHeight, client)
						} else {
							_ = pane.applyResize(message, client)
						}
					}
				case "theme":
					pane.updateTerminalThemeColors(message.Foreground, message.Background, message.Cursor)
				}
			}
		case agentFrameLock:
			var message terminalControlMessage
			if err := json.Unmarshal(payload, &message); err == nil {
				pane.setInputBlockedBy(inputLockOwner, message.Blocked)
			}
		case agentFrameDetach:
			client.close()
			<-writerDone
			return
		}
	}
}

func runAgentRequestClient(socketPath, encodedRequest string) error {
	if strings.TrimSpace(encodedRequest) == "" {
		return errors.New("request is required")
	}
	requestData, err := base64.StdEncoding.DecodeString(encodedRequest)
	if err != nil {
		return err
	}
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.Write(append(requestData, '\n')); err != nil {
		return err
	}
	written, err := io.Copy(os.Stdout, conn)
	if err != nil {
		return err
	}
	if written == 0 {
		return io.ErrUnexpectedEOF
	}
	return nil
}

func runAgentAttachClient(socketPath, selector, accountID, paneID string, cols, rows, terminalScrollback, cacheProtocolVersion int, workspaceGeneration, historyGeneration, localBaseCursor, localEndCursor, historyReplayMode, integrityProtocol string) error {
	if strings.TrimSpace(paneID) == "" {
		return errors.New("pane is required")
	}
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		return err
	}
	defer conn.Close()
	request := agentRequest{
		Type:                 "attach",
		Selector:             strings.TrimSpace(selector),
		AccountID:            strings.TrimSpace(accountID),
		PaneID:               paneID,
		Cols:                 cols,
		Rows:                 rows,
		TerminalScrollback:   terminalScrollback,
		CacheProtocolVersion: cacheProtocolVersion,
		WorkspaceGeneration:  strings.TrimSpace(workspaceGeneration),
		HistoryGeneration:    strings.TrimSpace(historyGeneration),
		LocalBaseCursor:      strings.TrimSpace(localBaseCursor),
		LocalEndCursor:       strings.TrimSpace(localEndCursor),
		HistoryReplayMode:    strings.TrimSpace(historyReplayMode),
		IntegrityProtocol:    strings.TrimSpace(integrityProtocol),
	}
	data, err := json.Marshal(request)
	if err != nil {
		return err
	}
	if _, err := conn.Write(append(data, '\n')); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() {
		_, err := io.Copy(os.Stdout, conn)
		done <- err
	}()
	_, copyErr := io.Copy(conn, os.Stdin)
	if unixConn, ok := conn.(*net.UnixConn); ok {
		_ = unixConn.CloseWrite()
	}
	if copyErr != nil {
		return copyErr
	}
	return <-done
}

func writeAgentHistoryReplay(w io.Writer, identity terminalReplayIdentity, history paneHistorySnapshot, allowGeneratedInput bool, integrity bool, sequence, cursor *uint64) bool {
	start := map[string]any{
		"type":                  "history-replay-start",
		"resize_protocol":       "epoch-v1",
		"selector":              identity.selector,
		"pane_id":               identity.paneID,
		"allow_generated_input": allowGeneratedInput,
		"history_generation":    history.generation,
		"server_base_cursor":    strconv.FormatUint(history.serverBase, 10),
		"server_end_cursor":     strconv.FormatUint(history.serverEnd, 10),
		"sync_mode":             history.syncMode,
		"delta_from_cursor":     strconv.FormatUint(history.deltaFrom, 10),
		"delta_to_cursor":       strconv.FormatUint(history.deltaTo, 10),
		"resize_epoch":          formatTerminalResizeEpoch(history.resizeEpoch),
		"cols":                  history.cols,
		"rows":                  history.rows,
		"pixel_width":           history.pixelWidth,
		"pixel_height":          history.pixelHeight,
	}
	if integrity {
		start["integrity_protocol"] = "fast-v1"
	}
	if identity.cacheProtocolVersion == terminalCacheProtocolVersion && identity.cacheScopeID != "" && identity.workspaceGeneration != "" && identity.tabID != "" {
		start["cache_protocol_version"] = terminalCacheProtocolVersion
		start["cache_scope_id"] = identity.cacheScopeID
		start["workspace_generation"] = identity.workspaceGeneration
		start["tab_id"] = identity.tabID
	}
	if err := writeAgentControlFrame(w, start); err != nil {
		return false
	}
	for _, chunk := range history.chunks {
		for len(chunk) > 0 {
			chunkSize := historyReplayChunk
			if len(chunk) < chunkSize {
				chunkSize = len(chunk)
			}
			if integrity {
				frame, err := encodeFastBinaryFrame(identity.selector, identity.paneID, history.generation, *sequence, *cursor, chunk[:chunkSize])
				if err != nil || writeAgentFrame(w, agentFrameBinary, frame) != nil {
					return false
				}
				*sequence = *sequence + 1
				*cursor += uint64(chunkSize)
			} else if err := writeAgentFrame(w, agentFrameBinary, chunk[:chunkSize]); err != nil {
				return false
			}
			chunk = chunk[chunkSize:]
		}
	}
	complete := map[string]any{
		"type":               "history-replay-complete",
		"selector":           identity.selector,
		"pane_id":            identity.paneID,
		"history_generation": history.generation,
		"history_cursor":     strconv.FormatUint(history.deltaTo, 10),
	}
	if identity.cacheProtocolVersion == terminalCacheProtocolVersion && identity.workspaceGeneration != "" && identity.tabID != "" {
		complete["cache_protocol_version"] = terminalCacheProtocolVersion
		complete["workspace_generation"] = identity.workspaceGeneration
		complete["tab_id"] = identity.tabID
	}
	return writeAgentControlFrame(w, complete) == nil
}

func writeAgentControlFrame(w io.Writer, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return writeAgentFrame(w, agentFrameText, data)
}

func writeAgentFrame(w io.Writer, frameType byte, payload []byte) error {
	if len(payload) > agentMaxFramePayload {
		return fmt.Errorf("agent frame payload too large: %d", len(payload))
	}
	header := [5]byte{frameType}
	binary.BigEndian.PutUint32(header[1:], uint32(len(payload)))
	if _, err := w.Write(header[:]); err != nil {
		return err
	}
	if len(payload) == 0 {
		return nil
	}
	_, err := w.Write(payload)
	return err
}

func readAgentFrame(r io.Reader) (byte, []byte, error) {
	var header [5]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return 0, nil, err
	}
	size := int(binary.BigEndian.Uint32(header[1:]))
	if size < 0 || size > agentMaxFramePayload {
		return 0, nil, fmt.Errorf("agent frame payload too large: %d", size)
	}
	payload := make([]byte, size)
	if size > 0 {
		if _, err := io.ReadFull(r, payload); err != nil {
			return 0, nil, err
		}
	}
	return header[0], payload, nil
}

func bytesTrimSpace(data []byte) []byte {
	return []byte(strings.TrimSpace(string(data)))
}
