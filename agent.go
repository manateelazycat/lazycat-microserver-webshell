package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"lcmd-webshell/internal/pkg/fonts"

	"github.com/gorilla/websocket"
)

const (
	agentProtocolVersion = "lcmd-webshell-agent-v5"

	agentFrameBinary         = byte('B')
	agentFrameText           = byte('T')
	agentFrameInput          = byte('I')
	agentFrameGeneratedInput = byte('G')
	agentFrameResize         = byte('R')
	agentFrameLock           = byte('L')
	agentFrameDetach         = byte('D')

	agentMaxFramePayload = 32 << 20
)

type agentRequest struct {
	Type               string                  `json:"type"`
	Selector           string                  `json:"selector,omitempty"`
	AccountID          string                  `json:"account_id,omitempty"`
	Username           string                  `json:"username,omitempty"`
	PaneID             string                  `json:"pane_id,omitempty"`
	Cols               int                     `json:"cols,omitempty"`
	Rows               int                     `json:"rows,omitempty"`
	TerminalScrollback int                     `json:"terminal_scrollback,omitempty"`
	Action             *workspaceActionRequest `json:"action,omitempty"`
	CloseIdle          bool                    `json:"close_idle,omitempty"`
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
		username := fs.String("username", "", "instance login username")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return runAgentDaemon(*socketPath, *selector, *accountID, *username)
	case "request":
		fs := flag.NewFlagSet("agent request", flag.ContinueOnError)
		socketPath := fs.String("socket", defaultAgentSocketPath, "unix socket path")
		encoded := fs.String("request", "", "base64 encoded request")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return runAgentRequestClient(*socketPath, *encoded)
	case "attach":
		fs := flag.NewFlagSet("agent attach", flag.ContinueOnError)
		socketPath := fs.String("socket", defaultAgentSocketPath, "unix socket path")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		paneID := fs.String("pane", "", "pane id")
		cols := fs.Int("cols", 0, "terminal columns")
		rows := fs.Int("rows", 0, "terminal rows")
		terminalScrollback := fs.Int("terminal-scrollback", fonts.DefaultTerminalScrollback, "terminal scrollback lines")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return runAgentAttachClient(*socketPath, *selector, *accountID, *paneID, *cols, *rows, *terminalScrollback)
	default:
		return fmt.Errorf("unknown agent command %q", args[0])
	}
}

func runAgentDaemon(socketPath, selector, accountID, username string) error {
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
	_ = os.Remove(socketPath)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return fmt.Errorf("listen agent unix socket failed: %w", err)
	}
	defer listener.Close()
	_ = os.Chmod(socketPath, 0o600)

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
		workspace := &terminalWorkspace{
			selector:          d.selector,
			username:          d.username,
			rootDir:           "/",
			localPTY:          true,
			historyLimitBytes: historyLimitBytes,
			panes:             make(map[string]*terminalPane),
			nextTabID:         1,
			nextPaneID:        1,
		}
		if err := workspace.createTabLocked("", "", normalizeCols(request.Cols), normalizeRows(request.Rows)); err != nil {
			return nil, err
		}
		d.workspace = workspace
	}
	if d.workspace.selector == "" {
		d.workspace.selector = d.selector
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
	pane := workspace.getPane(request.PaneID)
	if pane == nil {
		_ = writeAgentControlFrame(conn, map[string]any{"type": "process-exit", "message": "pane not found", "exit_code": -1})
		return
	}
	if request.Cols > 0 && request.Rows > 0 {
		_ = pane.resize(request.Cols, request.Rows)
	}
	history, client, allowGeneratedInputDuringReplay, err := pane.attachClient()
	if err != nil {
		_ = writeAgentControlFrame(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return
	}
	inputLockOwner := fmt.Sprintf("attach:%p", conn)
	defer func() {
		pane.setInputBlockedBy(inputLockOwner, false)
		pane.detachClient(client)
		client.close()
	}()

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		if !writeAgentHistoryReplay(conn, workspace.selector, pane.id, history, allowGeneratedInputDuringReplay) {
			return
		}
		for {
			select {
			case outbound := <-client.send:
				client.dequeued(len(outbound.payload))
				frameType := agentFrameBinary
				if outbound.messageType == websocket.TextMessage {
					frameType = agentFrameText
				}
				if err := writeAgentFrame(conn, frameType, outbound.payload); err != nil {
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
			if err := json.Unmarshal(payload, &message); err == nil && message.Cols > 0 && message.Rows > 0 {
				_ = pane.resize(message.Cols, message.Rows)
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
	_, err = io.Copy(os.Stdout, conn)
	return err
}

func runAgentAttachClient(socketPath, selector, accountID, paneID string, cols, rows, terminalScrollback int) error {
	if strings.TrimSpace(paneID) == "" {
		return errors.New("pane is required")
	}
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		return err
	}
	defer conn.Close()
	request := agentRequest{
		Type:               "attach",
		Selector:           strings.TrimSpace(selector),
		AccountID:          strings.TrimSpace(accountID),
		PaneID:             paneID,
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
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

func writeAgentHistoryReplay(w io.Writer, selector, paneID string, history paneHistorySnapshot, allowGeneratedInput bool) bool {
	if err := writeAgentControlFrame(w, map[string]any{
		"type":                  "history-replay-start",
		"selector":              selector,
		"pane_id":               paneID,
		"allow_generated_input": allowGeneratedInput,
	}); err != nil {
		return false
	}
	for _, chunk := range history.chunks {
		for len(chunk) > 0 {
			chunkSize := historyReplayChunk
			if len(chunk) < chunkSize {
				chunkSize = len(chunk)
			}
			if err := writeAgentFrame(w, agentFrameBinary, chunk[:chunkSize]); err != nil {
				return false
			}
			chunk = chunk[chunkSize:]
		}
	}
	return writeAgentControlFrame(w, map[string]any{
		"type":     "history-replay-complete",
		"selector": selector,
		"pane_id":  paneID,
	}) == nil
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
