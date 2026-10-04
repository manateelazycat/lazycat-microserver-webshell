package core

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gorilla/websocket"
	"io"
	"lcmd-webshell/internal/pkg/fonts"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type terminalPane struct {
	workspace *terminalWorkspace
	id        string
	selector  string
	rootDir   string

	mu                         sync.Mutex
	writeMu                    sync.Mutex
	resizeMu                   sync.Mutex
	outputMu                   sync.Mutex
	cmd                        *exec.Cmd
	ptyFile                    PTY
	clients                    map[*paneClient]struct{}
	history                    paneHistory
	checkpoint                 *terminalCheckpointEngine
	checkpointFailure          *checkpointFailure
	checkpointCreatedAt        int64
	historyGeneration          string
	historyLimitBytes          int
	cols                       int
	rows                       int
	pixelWidth                 int
	pixelHeight                int
	resizeEpoch                uint64
	resizeOwner                *paneClient
	tty                        string
	busy                       bool
	command                    string
	commandLine                string
	cwd                        string
	activityCheckedAt          time.Time
	controlPending             []byte
	localCWDPending            []byte
	localCWDReports            bool
	terminalQueryPending       []byte
	terminalForegroundColor    string
	terminalBackgroundColor    string
	terminalCursorColor        string
	pendingGeneratedInputs     map[string]int
	pendingCursorReports       int
	pendingCursorReportUntil   time.Time
	generatedEchoPending       []terminalGeneratedEcho
	generatedEchoOutputPending []byte
	hasAttached                bool
	closing                    bool
	exited                     bool
	exitCode                   int
	exitText                   string
	exitRetained               bool
	done                       chan struct{}
}

func newTerminalPane(workspace *terminalWorkspace, paneID string, cols, rows int, initialCWD string) (*terminalPane, error) {
	historyGeneration, err := NewHistoryGeneration()
	if err != nil {
		return nil, fmt.Errorf("create history generation: %w", err)
	}
	launch := Launch{Selector: workspace.selector, Username: workspace.username, RootDir: workspace.rootDir, InitialCWD: initialCWD}
	var command *exec.Cmd
	if workspace.localPTY {
		command = workspace.runtime.platform.Command(launch)
	} else {
		command = workspace.runtime.targets.Command(launch)
	}
	ptyFile, err := workspace.runtime.platform.StartPTY(command)
	if err != nil {
		return nil, err
	}
	historyLimitBytes := workspace.historyLimitBytes
	if historyLimitBytes <= 0 {
		historyLimitBytes = historyLimitBytesForTerminalScrollback(fonts.DefaultTerminalScrollback)
	}
	pane := &terminalPane{
		workspace:         workspace,
		id:                paneID,
		selector:          workspace.selector,
		rootDir:           workspace.rootDir,
		cmd:               command,
		ptyFile:           ptyFile,
		clients:           make(map[*paneClient]struct{}),
		historyLimitBytes: historyLimitBytes,
		historyGeneration: historyGeneration,
		cols:              NormalizeCols(cols),
		rows:              NormalizeRows(rows),
		cwd:               strings.TrimSpace(initialCWD),
		done:              make(chan struct{}),
	}
	_ = workspace.runtime.platform.ResizePTY(ptyFile, pane.cols, pane.rows, 0, 0)
	if named, ok := ptyFile.(interface{ TTYName() string }); ok {
		pane.tty = named.TTYName()
	}
	if local, ok := ptyFile.(interface{ InitialWorkingDirectory() string }); ok && pane.cwd == "" {
		pane.cwd = local.InitialWorkingDirectory()
	}
	if reports, ok := ptyFile.(interface{ SupportsCWDReports() bool }); ok {
		pane.localCWDReports = reports.SupportsCWDReports()
	}
	if workspace.localPTY {
		pane.checkpoint, err = newTerminalCheckpointEngine(pane.cols, pane.rows, historyLimitBytes/averageHistoryBytesPerLine)
		if err != nil {
			_ = ptyFile.Close()
			_ = workspace.runtime.platform.KillCommand(command)
			return nil, fmt.Errorf("initialize terminal recovery state: %w", err)
		}
		pane.checkpointCreatedAt = time.Now().UnixMilli()
	}
	go pane.readLoop()
	return pane, nil
}

func (p *terminalPane) readLoop() {
	waitErr := make(chan error, 1)
	go func() {
		waitErr <- p.workspace.runtime.platform.WaitCommand(p.cmd)
	}()

	buf := make([]byte, 32768)
	for {
		n, err := p.ptyFile.Read(buf)
		if n > 0 {
			p.appendOutput(buf[:n])
		}
		if err != nil {
			break
		}
	}
	_ = p.ptyFile.Close()

	var err error
	select {
	case err = <-waitErr:
	case <-time.After(2 * time.Second):
		_ = p.workspace.runtime.platform.KillCommand(p.cmd)
		err = <-waitErr
	}
	p.markExited(err)
}

func (p *terminalPane) appendOutput(data []byte) {
	if len(data) == 0 {
		return
	}
	filtered := p.filterGeneratedInputEcho(data)
	filtered = p.filterTerminalQueryOutput(filtered)
	filtered = p.filterPrivateControlOutput(filtered)
	if p.localCWDReports {
		filtered = p.filterLocalCWDOutput(filtered)
	}
	if len(filtered) == 0 {
		return
	}
	chunks := makeHistoryChunks(filtered)
	p.outputMu.Lock()
	defer p.outputMu.Unlock()
	var clients []*paneClient
	p.mu.Lock()
	// Read may already have returned bytes when close starts. Check lifecycle
	// under the same mutex that protects checkpoint disposal before parsing.
	if !p.closing && !p.exited {
		outputFrom := p.history.end
		pendingBefore := 0
		if p.checkpoint != nil {
			pendingBefore = len(p.checkpoint.pending)
		}
		p.checkpoint.write(filtered)
		for _, chunk := range chunks {
			p.history.append(chunk)
		}
		p.trimHistoryLocked()
		p.recordCheckpointFailureLocked("write", outputFrom, p.history.end, pendingBefore)
		clients = make([]*paneClient, 0, len(p.clients))
		for client := range p.clients {
			clients = append(clients, client)
		}
	}
	p.mu.Unlock()

	for _, client := range clients {
		for _, chunk := range chunks {
			client.enqueue(paneOutbound{messageType: websocket.BinaryMessage, payload: chunk})
		}
	}
}

func (p *terminalPane) trimHistoryLocked() {
	limit := p.historyLimitBytes
	if limit <= 0 {
		limit = historyLimitBytesForTerminalScrollback(fonts.DefaultTerminalScrollback)
		p.historyLimitBytes = limit
	}
	p.history.trim(limit)
}

func (p *terminalPane) markExited(err error) {
	exitCode := processExitCode(err)
	exitText := ""
	if err != nil && !errors.Is(err, os.ErrProcessDone) {
		exitText = err.Error()
	}
	var clients []*paneClient
	p.mu.Lock()
	if !p.exited {
		p.exited = true
		p.exitCode = exitCode
		p.exitText = exitText
		for client := range p.clients {
			clients = append(clients, client)
		}
	}
	p.mu.Unlock()
	retained := p.workspace.retainFailedFinalPane(p.id, exitCode)
	exit := paneExitSnapshot{exited: true, exitCode: exitCode, message: exitText, retained: retained}
	data, _ := json.Marshal(exit.controlPayload(p.selector, p.id))

	for _, client := range clients {
		client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: data, closeAfter: true})
	}
	if !retained {
		p.workspace.removePaneAfterExit(p.id)
	}
	close(p.done)
}

func (p *terminalPane) writeInput(data []byte) error {
	return p.writeInputWithSize(data, 0, 0)
}

func (p *terminalPane) writeInputWithSize(data []byte, cols, rows int) error {
	return p.writeInputWithDimensions(data, cols, rows, 0, 0)
}

func (p *terminalPane) writeInputWithDimensions(data []byte, cols, rows, pixelWidth, pixelHeight int) error {
	if len(data) == 0 {
		return nil
	}
	if cols > 0 && rows > 0 {
		_ = p.resizeWithPixels(cols, rows, pixelWidth, pixelHeight)
	}
	dropInput, generatedInput := p.consumeGeneratedCursorReportInput(data)
	if dropInput {
		return nil
	}
	if len(generatedInput) > 0 {
		p.addGeneratedEchoFilter(generatedInput)
		data = generatedInput
	}
	return p.writePTYInput(data)
}

func (p *terminalPane) writePTYInput(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	p.mu.Lock()
	ptyFile := p.ptyFile
	notRunning := p.closing || p.exited
	p.mu.Unlock()
	if notRunning || ptyFile == nil {
		return errors.New("pane is not running")
	}
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	for len(data) > 0 {
		chunk := data
		if len(chunk) > terminalPTYInputChunkBytes {
			chunk = chunk[:terminalPTYInputChunkBytes]
		}
		n, err := ptyFile.Write(chunk)
		if n > 0 {
			data = data[n:]
		}
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}

func (p *terminalPane) writeGeneratedPTYInput(data []byte) error {
	return p.writePTYInput(data)
}

func (p *terminalPane) writeGeneratedInput(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	if !p.consumeExpectedGeneratedInput(data) {
		return nil
	}
	p.addGeneratedEchoFilter(data)
	return p.writeGeneratedPTYInput(data)
}

func (p *terminalPane) close() {
	p.mu.Lock()
	if p.closing {
		p.mu.Unlock()
		return
	}
	// Do not use exited here: readLoop still owns process exit status and done.
	// Waiting for readLoop here would deadlock callers holding workspace.mu.
	p.closing = true
	p.checkpoint.close()
	ptyFile := p.ptyFile
	clients := make([]*paneClient, 0, len(p.clients))
	for client := range p.clients {
		clients = append(clients, client)
	}
	p.mu.Unlock()

	for _, client := range clients {
		client.close()
	}
	if ptyFile != nil {
		_ = ptyFile.Close()
	}
	_ = p.workspace.runtime.platform.KillCommand(p.cmd)
}

func (p *terminalPane) summary() paneSummary {
	p.mu.Lock()
	defer p.mu.Unlock()
	return paneSummary{
		ID:                p.id,
		Cols:              p.cols,
		Rows:              p.rows,
		PixelWidth:        p.pixelWidth,
		PixelHeight:       p.pixelHeight,
		TTY:               p.tty,
		Busy:              p.busy,
		Command:           p.command,
		CommandLine:       p.commandLine,
		CWD:               p.cwd,
		Exited:            p.exited,
		ExitCode:          p.exitCode,
		ExitMessage:       p.exitText,
		ExitRetained:      p.exitRetained,
		ActivityCheckedAt: unixMillis(p.activityCheckedAt),
	}
}
