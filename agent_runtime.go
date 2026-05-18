package main

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	agentInstallPath        = "/usr/local/bin/lcmd-webshell-agent"
	agentManifestPath       = "/usr/local/bin/.lcmd-webshell-agent.manifest"
	defaultAgentSocketPath  = "/tmp/lcmd-webshell-agent.sock"
	agentLogPath            = "/tmp/lcmd-webshell-agent.log"
	agentReadyMarker        = "__LCMD_WEBSHELL_AGENT_READY__"
	agentInstallCachePrefix = agentProtocolVersion + "\t"
)

func agentSelectorHash(selector string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(selector)))
	return hex.EncodeToString(sum[:])
}

type agentScope struct {
	Selector  string
	AccountID string
}

func normalizeAgentScope(selector, accountID string) agentScope {
	return agentScope{
		Selector:  strings.TrimSpace(selector),
		AccountID: strings.TrimSpace(accountID),
	}
}

func (s agentScope) cacheKey() string {
	selector := strings.TrimSpace(s.Selector)
	accountID := strings.TrimSpace(s.AccountID)
	if accountID == "" {
		return selector
	}
	return selector + "\x00" + accountID
}

func (s agentScope) hash() string {
	sum := sha256.Sum256([]byte(s.cacheKey()))
	return hex.EncodeToString(sum[:])
}

func agentSocketPath(selector string) string {
	if strings.TrimSpace(selector) == "" {
		return defaultAgentSocketPath
	}
	return "/tmp/lcmd-webshell-agent-" + agentSelectorHash(selector) + ".sock"
}

func scopedAgentSocketPath(scope agentScope) string {
	if strings.TrimSpace(scope.Selector) == "" {
		return defaultAgentSocketPath
	}
	return "/tmp/lcmd-webshell-agent-" + scope.hash() + ".sock"
}

func agentLogPathForSelector(selector string) string {
	if strings.TrimSpace(selector) == "" {
		return agentLogPath
	}
	return "/tmp/lcmd-webshell-agent-" + agentSelectorHash(selector) + ".log"
}

func scopedAgentLogPath(scope agentScope) string {
	if strings.TrimSpace(scope.Selector) == "" {
		return agentLogPath
	}
	return "/tmp/lcmd-webshell-agent-" + scope.hash() + ".log"
}

var persistentAgentCache = struct {
	sync.Mutex
	installed map[string]string
	running   map[string]bool
	username  map[string]string
}{
	installed: make(map[string]string),
	running:   make(map[string]bool),
	username:  make(map[string]string),
}

var agentRuntimeArchiveCache = struct {
	sync.Mutex
	ready    bool
	payload  []byte
	manifest string
}{}

func requestAgentWorkspaceState(ctx context.Context, scope agentScope, cols, rows, terminalScrollback int) (workspaceState, error) {
	response, err := requestPersistentAgent(ctx, scope, agentRequest{
		Type:               "state",
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
	})
	if err != nil {
		return workspaceState{}, err
	}
	if response.State == nil {
		return workspaceState{}, errors.New("agent returned empty workspace state")
	}
	return *response.State, nil
}

func requestAgentWorkspaceAction(ctx context.Context, scope agentScope, cols, rows, terminalScrollback int, action workspaceActionRequest) (workspaceState, error) {
	response, err := requestPersistentAgent(ctx, scope, agentRequest{
		Type:               "action",
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
		Action:             &action,
	})
	if err != nil {
		return workspaceState{}, err
	}
	if response.State == nil {
		return workspaceState{}, errors.New("agent returned empty workspace state")
	}
	return *response.State, nil
}

func requestAgentWorkspaceActivity(ctx context.Context, scope agentScope, cols, rows, terminalScrollback int) (workspaceActivityState, error) {
	response, err := requestPersistentAgent(ctx, scope, agentRequest{
		Type:               "activity",
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
	})
	if err != nil {
		return workspaceActivityState{}, err
	}
	if response.Activity == nil {
		return workspaceActivityState{}, errors.New("agent returned empty activity state")
	}
	return *response.Activity, nil
}

func requestPersistentAgent(ctx context.Context, scope agentScope, request agentRequest) (agentResponse, error) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	username, err := ensurePersistentAgent(ctx, scope)
	if err != nil {
		return agentResponse{}, err
	}
	request.Selector = scope.Selector
	request.AccountID = scope.AccountID
	request.Username = username

	response, err := runPersistentAgentRequest(ctx, scope, request)
	if err == nil {
		return response, nil
	}
	markPersistentAgentNotRunning(scope)
	username, ensureErr := ensurePersistentAgent(ctx, scope)
	if ensureErr != nil {
		return agentResponse{}, err
	}
	request.Username = username
	return runPersistentAgentRequest(ctx, scope, request)
}

func runPersistentAgentRequest(ctx context.Context, scope agentScope, request agentRequest) (agentResponse, error) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	data, err := json.Marshal(request)
	if err != nil {
		return agentResponse{}, err
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", scope.Selector, agentInstallPath, "agent", "request", "--socket", scopedAgentSocketPath(scope), "--request", encoded).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return agentResponse{}, err
		}
		return agentResponse{}, fmt.Errorf("%w: %s", err, text)
	}
	var response agentResponse
	if err := json.Unmarshal(bytes.TrimSpace(output), &response); err != nil {
		return agentResponse{}, err
	}
	if !response.OK {
		if response.Error == "" {
			response.Error = "agent request failed"
		}
		return response, errors.New(response.Error)
	}
	if response.Version != "" && response.Version != agentProtocolVersion {
		return agentResponse{}, fmt.Errorf("unsupported agent protocol %q", response.Version)
	}
	return response, nil
}

func ensurePersistentAgent(ctx context.Context, scope agentScope) (string, error) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return "", err
	}
	if scope.AccountID == "" {
		return "", errors.New("account id is required")
	}
	cacheKey := scope.cacheKey()
	username, err := cachedInstanceUsername(ctx, scope.Selector)
	if err != nil {
		return "", err
	}
	persistentAgentCache.Lock()
	previousManifest := persistentAgentCache.installed[cacheKey]
	persistentAgentCache.Unlock()
	manifest, err := ensureAgentBinaryInstalled(ctx, scope)
	if err != nil {
		return "", err
	}
	if previousManifest != "" && previousManifest != manifest {
		markPersistentAgentNotRunning(scope)
	}

	persistentAgentCache.Lock()
	running := persistentAgentCache.running[cacheKey] && persistentAgentCache.installed[cacheKey] == manifest
	persistentAgentCache.Unlock()
	if running {
		return username, nil
	}

	if ok := pingPersistentAgent(ctx, scope); ok {
		persistentAgentCache.Lock()
		persistentAgentCache.running[cacheKey] = true
		persistentAgentCache.Unlock()
		return username, nil
	}
	if err := startPersistentAgent(ctx, scope, username); err != nil {
		return "", err
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if ok := pingPersistentAgent(ctx, scope); ok {
			persistentAgentCache.Lock()
			persistentAgentCache.running[cacheKey] = true
			persistentAgentCache.Unlock()
			return username, nil
		}
		time.Sleep(120 * time.Millisecond)
	}
	return "", errors.New("persistent webshell agent did not become ready")
}

func cachedInstanceUsername(ctx context.Context, selector string) (string, error) {
	persistentAgentCache.Lock()
	username, ok := persistentAgentCache.username[selector]
	persistentAgentCache.Unlock()
	if ok {
		return username, nil
	}
	username, err := resolveInstanceLoginUser(ctx, selector)
	if err != nil {
		return "", err
	}
	persistentAgentCache.Lock()
	persistentAgentCache.username[selector] = username
	persistentAgentCache.Unlock()
	return username, nil
}

func markPersistentAgentNotRunning(scope agentScope) {
	persistentAgentCache.Lock()
	delete(persistentAgentCache.running, scope.cacheKey())
	persistentAgentCache.Unlock()
}

func ensureAgentBinaryInstalled(ctx context.Context, scope agentScope) (string, error) {
	payload, manifest, err := cachedAgentRuntimeArchive()
	if err != nil {
		return "", err
	}
	cacheKey := scope.cacheKey()
	persistentAgentCache.Lock()
	if persistentAgentCache.installed[cacheKey] == manifest {
		persistentAgentCache.Unlock()
		return manifest, nil
	}
	persistentAgentCache.Unlock()

	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	checkScript := strings.Join([]string{
		"set -eu",
		"manifest_path=" + shellScriptQuote(agentManifestPath),
		"expected=" + shellScriptQuote(manifest),
		"if [ -x " + shellScriptQuote(agentInstallPath) + " ] && [ \"$(cat \"$manifest_path\" 2>/dev/null || true)\" = \"$expected\" ]; then",
		"  printf '%s\\n' " + shellScriptQuote(agentReadyMarker),
		"fi",
	}, "\n")
	output, err := exec.CommandContext(checkCtx, lightosctlPath, "exec", scope.Selector, "/bin/sh", "-lc", checkScript).CombinedOutput()
	if err == nil && strings.TrimSpace(string(output)) == agentReadyMarker {
		persistentAgentCache.Lock()
		persistentAgentCache.installed[cacheKey] = manifest
		persistentAgentCache.Unlock()
		return manifest, nil
	}

	installCtx, installCancel := context.WithTimeout(ctx, 30*time.Second)
	defer installCancel()
	installScript := strings.Join([]string{
		"set -eu",
		"mkdir -p " + shellScriptQuote(filepath.Dir(agentInstallPath)),
		"tar -xpf - -C /",
		"chmod 755 " + shellScriptQuote(agentInstallPath),
		"printf '%s\\n' " + shellScriptQuote(agentReadyMarker),
	}, "\n")
	command := exec.CommandContext(installCtx, lightosctlPath, "exec", "-i", scope.Selector, "/bin/sh", "-lc", installScript)
	command.Stdin = bytes.NewReader(payload)
	output, err = command.CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return "", err
		}
		return "", fmt.Errorf("%w: %s", err, text)
	}
	if strings.TrimSpace(string(output)) != agentReadyMarker {
		return "", errors.New("persistent webshell agent install did not complete")
	}
	persistentAgentCache.Lock()
	persistentAgentCache.installed[cacheKey] = manifest
	persistentAgentCache.Unlock()
	return manifest, nil
}

func cachedAgentRuntimeArchive() ([]byte, string, error) {
	agentRuntimeArchiveCache.Lock()
	defer agentRuntimeArchiveCache.Unlock()
	if agentRuntimeArchiveCache.ready {
		return agentRuntimeArchiveCache.payload, agentRuntimeArchiveCache.manifest, nil
	}

	payload, manifest, err := buildAgentRuntimeArchive()
	if err != nil {
		return nil, "", err
	}
	agentRuntimeArchiveCache.payload = payload
	agentRuntimeArchiveCache.manifest = manifest
	agentRuntimeArchiveCache.ready = true
	return payload, manifest, nil
}

func buildAgentRuntimeArchive() ([]byte, string, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, "", err
	}
	data, err := os.ReadFile(executable)
	if err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(data)
	manifest := agentInstallCachePrefix + hex.EncodeToString(sum[:])
	var buffer bytes.Buffer
	writer := tar.NewWriter(&buffer)
	if err := writeAgentTarFile(writer, strings.TrimPrefix(agentInstallPath, "/"), data, 0o755); err != nil {
		_ = writer.Close()
		return nil, "", err
	}
	if err := writeAgentTarFile(writer, strings.TrimPrefix(agentManifestPath, "/"), []byte(manifest), 0o644); err != nil {
		_ = writer.Close()
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return buffer.Bytes(), manifest, nil
}

func writeAgentTarFile(writer *tar.Writer, name string, data []byte, mode int64) error {
	if strings.TrimSpace(name) == "" || strings.HasPrefix(filepath.Clean(name), "..") {
		return fmt.Errorf("invalid agent archive path %q", name)
	}
	if err := writer.WriteHeader(&tar.Header{Name: filepath.ToSlash(name), Mode: mode, Size: int64(len(data))}); err != nil {
		return err
	}
	if len(data) == 0 {
		return nil
	}
	_, err := writer.Write(data)
	return err
}

func pingPersistentAgent(ctx context.Context, scope agentScope) bool {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := runPersistentAgentRequest(ctx, scope, agentRequest{Type: "ping", Selector: scope.Selector, AccountID: scope.AccountID})
	return err == nil
}

func startPersistentAgent(ctx context.Context, scope agentScope, username string) error {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	startCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	socketPath := scopedAgentSocketPath(scope)
	logPath := scopedAgentLogPath(scope)
	script := fmt.Sprintf(`set -eu
agent=%s
socket=%s
log=%s
legacy_socket=%s
rm -f "$socket"
if [ "$legacy_socket" != "$socket" ]; then
  rm -f "$legacy_socket" 2>/dev/null || true
fi
if command -v setsid >/dev/null 2>&1; then
  setsid "$agent" agent daemon --socket "$socket" --selector %s --account %s --username %s </dev/null >>"$log" 2>&1 &
else
  nohup "$agent" agent daemon --socket "$socket" --selector %s --account %s --username %s </dev/null >>"$log" 2>&1 &
fi
printf '%%s\n' %s
`, shellScriptQuote(agentInstallPath), shellScriptQuote(socketPath), shellScriptQuote(logPath), shellScriptQuote(defaultAgentSocketPath), shellScriptQuote(scope.Selector), shellScriptQuote(scope.AccountID), shellScriptQuote(username), shellScriptQuote(scope.Selector), shellScriptQuote(scope.AccountID), shellScriptQuote(username), shellScriptQuote(agentReadyMarker))
	output, err := exec.CommandContext(startCtx, lightosctlPath, "exec", scope.Selector, "/bin/sh", "-lc", script).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return err
		}
		return fmt.Errorf("%w: %s", err, text)
	}
	if strings.TrimSpace(string(output)) != agentReadyMarker {
		return errors.New("persistent webshell agent start did not complete")
	}
	return nil
}

func (s *pluginServer) attachAgentPane(w http.ResponseWriter, r *http.Request, scope agentScope, paneID string, cols, rows, terminalScrollback int) error {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	if _, err := ensurePersistentAgent(r.Context(), scope); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return nil
	}
	clientID := strings.TrimSpace(r.URL.Query().Get("client_id"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.URL.Query().Get("client"))
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()
	conn.EnableWriteCompression(false)
	conn.SetReadLimit(websocketReadLimit)

	attachCtx, cancelAttach := context.WithCancel(context.Background())
	defer cancelAttach()
	command := exec.CommandContext(
		attachCtx,
		lightosctlPath,
		"exec",
		"-i",
		scope.Selector,
		agentInstallPath,
		"agent",
		"attach",
		"--socket",
		scopedAgentSocketPath(scope),
		"--selector",
		scope.Selector,
		"--account",
		scope.AccountID,
		"--pane",
		paneID,
		"--cols",
		strconv.Itoa(normalizeCols(cols)),
		"--rows",
		strconv.Itoa(normalizeRows(rows)),
		"--terminal-scrollback",
		strconv.Itoa(terminalScrollback),
	)
	stdout, err := command.StdoutPipe()
	if err != nil {
		_ = writeWebSocketJSON(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return nil
	}
	stdin, err := command.StdinPipe()
	if err != nil {
		_ = writeWebSocketJSON(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return nil
	}
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		_ = writeWebSocketJSON(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return nil
	}
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- command.Wait()
	}()
	var stopOnce sync.Once
	stopAttach := func() {
		stopOnce.Do(func() {
			_ = writeAgentFrame(stdin, agentFrameDetach, nil)
			_ = stdin.Close()
			cancelAttach()
		})
	}
	defer func() {
		stopAttach()
		select {
		case <-waitDone:
		case <-time.After(2 * time.Second):
			_ = killCommand(command)
			<-waitDone
		}
	}()

	var writeMu sync.Mutex
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		for {
			frameType, payload, err := readAgentFrame(stdout)
			if err != nil {
				if text := strings.TrimSpace(stderr.String()); text != "" {
					_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{"type": "process-exit", "message": text, "exit_code": -1})
				}
				_ = conn.Close()
				return
			}
			messageType := websocket.BinaryMessage
			if frameType == agentFrameText {
				messageType = websocket.TextMessage
			}
			writeMu.Lock()
			err = conn.WriteMessage(messageType, payload)
			writeMu.Unlock()
			if err != nil {
				_ = conn.Close()
				return
			}
		}
	}()

	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			stopAttach()
			<-writerDone
			return nil
		}
		switch messageType {
		case websocket.BinaryMessage:
			if len(payload) > 0 && !s.terminalInputBlocked(scope, clientID) {
				_ = writeAgentFrame(stdin, agentFrameInput, payload)
			}
		case websocket.TextMessage:
			keepOpen := handleAgentAttachControlMessage(conn, &writeMu, stdin, payload, s.terminalInputBlocked(scope, clientID))
			if !keepOpen {
				stopAttach()
				<-writerDone
				return nil
			}
		}
	}
}

func handleAgentAttachControlMessage(conn *websocket.Conn, writeMu *sync.Mutex, stdin io.Writer, payload []byte, inputBlocked bool) bool {
	var message terminalControlMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		if data, ok := strings.CutPrefix(string(payload), "input:"); ok {
			if !inputBlocked {
				_ = writeAgentFrame(stdin, agentFrameInput, []byte(data))
			}
		}
		return true
	}
	switch message.Type {
	case "input":
		if message.Data != "" && !inputBlocked {
			frameType := agentFrameInput
			if message.Generated {
				frameType = agentFrameGeneratedInput
			}
			_ = writeAgentFrame(stdin, frameType, []byte(message.Data))
		}
	case "resize":
		if message.Cols > 0 && message.Rows > 0 {
			data, _ := json.Marshal(message)
			_ = writeAgentFrame(stdin, agentFrameResize, data)
		}
	case "input_lock":
		data, _ := json.Marshal(message)
		_ = writeAgentFrame(stdin, agentFrameLock, data)
	case "ping":
		_ = writeWebSocketJSONLocked(conn, writeMu, map[string]any{"type": "pong"})
	case "detach":
		_ = writeAgentFrame(stdin, agentFrameDetach, nil)
		return false
	}
	return true
}

func writeWebSocketJSONLocked(conn *websocket.Conn, mu *sync.Mutex, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	mu.Lock()
	defer mu.Unlock()
	return conn.WriteMessage(websocket.TextMessage, data)
}
