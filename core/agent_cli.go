package core

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"lcmd-webshell/internal/pkg/fonts"
	"os"
	"strings"
)

func (rt *Runtime) HandleAgentCommand(args []string) bool {
	if len(args) == 0 || args[0] != "agent" {
		return false
	}
	if err := rt.runAgentCommand(args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	return true
}

func (rt *Runtime) runAgentCommand(args []string) error {
	if len(args) == 0 {
		return errors.New("missing agent command")
	}
	switch args[0] {
	case "version":
		fmt.Println(AgentProtocolVersion)
		return nil
	case "daemon":
		fs := flag.NewFlagSet("agent daemon", flag.ContinueOnError)
		socketPath := fs.String("socket", rt.platform.DefaultAgentSocketPath(), "unix socket path")
		readyFile := fs.String("ready-file", "", "readiness marker path")
		username := fs.String("username", "", "instance login username")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return rt.runAgentDaemon(*socketPath, *readyFile, *selector, *accountID, *username)
	case "request":
		fs := flag.NewFlagSet("agent request", flag.ContinueOnError)
		socketPath := fs.String("socket", rt.platform.DefaultAgentSocketPath(), "unix socket path")
		encoded := fs.String("request", "", "base64 encoded request")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return rt.runAgentRequestClient(*socketPath, *encoded)
	case "reconcile":
		fs := flag.NewFlagSet("agent reconcile", flag.ContinueOnError)
		socketPath := fs.String("socket", rt.platform.DefaultAgentSocketPath(), "unix socket path")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		replaceActive := fs.Bool("replace-active", false, "replace the active daemon after a confirmed protocol mismatch")
		forceProtocolReplacement := fs.Bool("force-protocol-replacement", false, "replace an active daemon whose ping protocol cannot be decoded")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		count, err := rt.platform.ReconcileAgents(*socketPath, *selector, *accountID, *replaceActive, *forceProtocolReplacement)
		if err != nil {
			return err
		}
		fmt.Printf("%s\t%d\n", AgentReconcileMarker, count)
		return nil
	case "attach":
		fs := flag.NewFlagSet("agent attach", flag.ContinueOnError)
		socketPath := fs.String("socket", rt.platform.DefaultAgentSocketPath(), "unix socket path")
		selector := fs.String("selector", "", "instance selector")
		accountID := fs.String("account", "", "webshell account id")
		paneID := fs.String("pane", "", "pane id")
		cols := fs.Int("cols", 0, "terminal columns")
		rows := fs.Int("rows", 0, "terminal rows")
		terminalScrollback := fs.Int("terminal-scrollback", fonts.DefaultTerminalScrollback, "terminal scrollback lines")
		checkpointProtocol := fs.String("checkpoint-protocol", "", "terminal state checkpoint protocol")
		historyGeneration := fs.String("history-generation", "", "terminal history generation")
		workspaceGeneration := fs.String("workspace-generation", "", "terminal workspace generation")
		localBaseCursor := fs.String("local-base-cursor", "", "local terminal history base cursor")
		localEndCursor := fs.String("local-end-cursor", "", "local terminal history end cursor")
		historyReplayMode := fs.String("history-replay-mode", "", "terminal history replay mode")
		integrityProtocol := fs.String("integrity-protocol", "", "terminal binary integrity protocol")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		return rt.runAgentAttachClient(*socketPath, *selector, *accountID, *paneID, *cols, *rows, *terminalScrollback, *workspaceGeneration, *historyGeneration, *localBaseCursor, *localEndCursor, *historyReplayMode, *integrityProtocol, *checkpointProtocol)
	default:
		return fmt.Errorf("unknown agent command %q", args[0])
	}
}

func (rt *Runtime) runAgentRequestClient(socketPath, encodedRequest string) error {
	if strings.TrimSpace(encodedRequest) == "" {
		return errors.New("request is required")
	}
	requestData, err := base64.StdEncoding.DecodeString(encodedRequest)
	if err != nil {
		return err
	}
	conn, err := rt.platform.DialAgent(socketPath)
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

func (rt *Runtime) runAgentAttachClient(socketPath, selector, accountID, paneID string, cols, rows, terminalScrollback int, workspaceGeneration, historyGeneration, localBaseCursor, localEndCursor, historyReplayMode, integrityProtocol string, checkpointProtocol ...string) error {
	if strings.TrimSpace(paneID) == "" {
		return errors.New("pane is required")
	}
	conn, err := rt.platform.DialAgent(socketPath)
	if err != nil {
		return err
	}
	defer conn.Close()
	request := AgentRequest{
		Type:                "attach",
		Selector:            strings.TrimSpace(selector),
		AccountID:           strings.TrimSpace(accountID),
		PaneID:              paneID,
		Cols:                cols,
		Rows:                rows,
		TerminalScrollback:  terminalScrollback,
		WorkspaceGeneration: strings.TrimSpace(workspaceGeneration),
		HistoryGeneration:   strings.TrimSpace(historyGeneration),
		LocalBaseCursor:     strings.TrimSpace(localBaseCursor),
		LocalEndCursor:      strings.TrimSpace(localEndCursor),
		HistoryReplayMode:   strings.TrimSpace(historyReplayMode),
		IntegrityProtocol:   strings.TrimSpace(integrityProtocol),
	}
	if len(checkpointProtocol) > 0 {
		request.CheckpointProtocol = checkpointProtocol[0]
	}
	data, err := json.Marshal(request)
	if err != nil {
		return err
	}
	if _, err := conn.Write(append(data, '\n')); err != nil {
		return err
	}
	outputDone := make(chan error, 1)
	go func() {
		_, err := io.Copy(os.Stdout, conn)
		outputDone <- err
	}()
	inputDone := make(chan error, 1)
	go func() {
		_, err := io.Copy(conn, os.Stdin)
		if unixConn, ok := conn.(interface{ CloseWrite() error }); ok {
			_ = unixConn.CloseWrite()
		}
		inputDone <- err
	}()
	select {
	case err := <-outputDone:
		// This function owns the attach CLI process. EOF must finish it even
		// when Provider stdin is idle, so the Provider can observe stdout EOF.
		// Returning from main also retires the process's blocked stdin reader.
		return err
	case err := <-inputDone:
		if err != nil {
			return err
		}
		return <-outputDone
	}
}
