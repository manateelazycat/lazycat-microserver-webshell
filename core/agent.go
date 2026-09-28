package core

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	// v27 falls back to bounded raw history when a pane's checkpoint parser
	// fails, retaining diagnostics without rebuilding it. WASM is unchanged from v26.
	// v29 adds the local runtime; existing wire and checkpoint formats are unchanged.
	// v30 aligns the local Unified ready message with the container handshake.
	// v31 adds independent local shell sessions for the optional SSH adapter.
	// v32 adds optional managed SSH routes with purpose-scoped authorization.
	// v33 accepts non-empty SSH passwords without bcrypt's input limit and allows
	// 120 seconds for interactive authentication. Browser/checkpoint wire is unchanged.
	// v34 adds optional, on-demand host metrics for client instance cards.
	// v35 updates Chinese instance terminology; wire and checkpoint formats are unchanged.
	// v36 adds SSH exec, file transfer, forwarding, terminal modes and resume.
	// v37 separates SSH admission from the lifetime of owned terminal tasks.
	// v38 adds native allocation safety/diagnostics and changes the checkpoint WASM hash.
	// v39 initializes reused WASM page cells before publishing their new managed tables.
	AgentProtocolVersion = "lcmd-webshell-agent-v39"

	agentFrameBinary         = byte('B')
	AgentFrameText           = byte('T')
	AgentFrameInput          = byte('I')
	AgentFrameGeneratedInput = byte('G')
	AgentFrameResize         = byte('R')
	AgentFrameDetach         = byte('D')

	agentMaxFramePayload = 32 << 20
	AgentReconcileMarker = "__LCMD_WEBSHELL_AGENT_RECONCILED__"
)

type agentDaemon struct {
	runtime   *Runtime
	mu        sync.Mutex
	selector  string
	accountID string
	username  string
	workspace *terminalWorkspace
	closed    bool
}

func (rt *Runtime) runAgentDaemon(socketPath, readyFile, selector, accountID, username string) error {
	if err := rt.platform.ResetAgentSignals(); err != nil {
		return fmt.Errorf("reset agent daemon signal disposition failed: %w", err)
	}
	if err := rt.platform.RaiseAgentOpenFilesLimit(); err != nil {
		return fmt.Errorf("raise agent open files limit failed: %w", err)
	}
	socketPath = strings.TrimSpace(socketPath)
	if socketPath == "" {
		return errors.New("agent socket path is required")
	}
	if err := os.MkdirAll(filepath.Dir(socketPath), 0o755); err != nil {
		return fmt.Errorf("create agent socket directory failed: %w", err)
	}
	listener, cleanup, err := rt.platform.ListenAgent(socketPath)
	if err != nil {
		return err
	}
	defer cleanup()
	if err := writeAgentReadyFile(readyFile); err != nil {
		return fmt.Errorf("write agent readiness marker failed: %w", err)
	}

	daemon := &agentDaemon{
		selector:  strings.TrimSpace(selector),
		runtime:   rt,
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
	var request AgentRequest
	if err := json.Unmarshal(bytesTrimSpace(line), &request); err != nil {
		_ = json.NewEncoder(conn).Encode(AgentResponse{OK: false, Version: AgentProtocolVersion, Error: err.Error()})
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
		response := AgentResponse{OK: err == nil, Version: AgentProtocolVersion}
		if err != nil {
			response.Error = err.Error()
		}
		_ = json.NewEncoder(conn).Encode(response)
	case "state":
		state, err := d.WorkspaceState(context.Background(), request)
		d.writeStateResponse(conn, state, err)
	case "action":
		state, err := d.applyWorkspaceAction(context.Background(), request)
		d.writeStateResponse(conn, state, err)
	case "activity":
		activity, err := d.workspaceActivity(context.Background(), request)
		response := AgentResponse{OK: err == nil, Version: AgentProtocolVersion, Activity: activity}
		if err != nil {
			response.Error = err.Error()
		}
		_ = json.NewEncoder(conn).Encode(response)
	case "attach":
		d.handleAttach(context.Background(), conn, reader, request)
	default:
		_ = json.NewEncoder(conn).Encode(AgentResponse{OK: false, Version: AgentProtocolVersion, Error: "unknown request type"})
	}
}

func (d *agentDaemon) writeStateResponse(w io.Writer, state WorkspaceState, err error) {
	response := AgentResponse{OK: err == nil, Version: AgentProtocolVersion}
	if err != nil {
		response.Error = err.Error()
	} else {
		response.State = &state
	}
	_ = json.NewEncoder(w).Encode(response)
}
