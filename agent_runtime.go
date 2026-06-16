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
	"log"
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
	commandOutputSnippetMax = 1024
	websocketReadTimeout    = 30 * time.Second
	websocketWriteTimeout   = 5 * time.Second
)

func agentSelectorHash(selector string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(selector)))
	return hex.EncodeToString(sum[:])
}

type agentScope struct {
	Selector  string
	AccountID string
}

type persistentAgentStartupTrace struct {
	scope      agentScope
	socketPath string
	logPath    string
	entries    []string
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

func newPersistentAgentStartupTrace(scope agentScope) *persistentAgentStartupTrace {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	return &persistentAgentStartupTrace{
		scope:      scope,
		socketPath: scopedAgentSocketPath(scope),
		logPath:    scopedAgentLogPath(scope),
	}
}

func (t *persistentAgentStartupTrace) add(format string, args ...any) {
	if t == nil {
		return
	}
	t.entries = append(t.entries, fmt.Sprintf(format, args...))
}

func (t *persistentAgentStartupTrace) addCommandResult(stage string, output []byte, err error) {
	if t == nil {
		return
	}
	text := strings.TrimSpace(string(output))
	if text == "" {
		text = "<empty>"
	}
	if err != nil {
		t.add("%s failed: err=%v output=%s", stage, err, text)
		return
	}
	t.add("%s succeeded: output=%s", stage, text)
}

func commandOutputSnippet(output []byte) string {
	text := strings.TrimSpace(string(output))
	if text == "" {
		return "<empty>"
	}
	runes := []rune(text)
	if len(runes) <= commandOutputSnippetMax {
		return text
	}
	return string(runes[:commandOutputSnippetMax]) + "..."
}

func (t *persistentAgentStartupTrace) String() string {
	if t == nil {
		return ""
	}
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("selector=%s account=%s socket=%s log=%s", t.scope.Selector, t.scope.AccountID, t.socketPath, t.logPath))
	for _, entry := range t.entries {
		builder.WriteString("\n")
		builder.WriteString(entry)
	}
	return builder.String()
}

func (t *persistentAgentStartupTrace) errorf(format string, args ...any) error {
	message := fmt.Sprintf(format, args...)
	trace := strings.TrimSpace(t.String())
	if trace == "" {
		log.Printf("persistent webshell agent startup failed: %s", message)
		rememberPersistentAgentStartupError(t.scope, message)
		return errors.New(message)
	}
	log.Printf("persistent webshell agent startup failed: %s\n%s", message, trace)
	fullMessage := fmt.Sprintf("%s\nagent startup trace:\n%s", message, trace)
	rememberPersistentAgentStartupError(t.scope, fullMessage)
	return errors.New(fullMessage)
}

var persistentAgentCache = struct {
	sync.Mutex
	installed     map[string]string
	running       map[string]bool
	username      map[string]string
	startupErrors map[string]string
	notices       map[string]string
}{
	installed:     make(map[string]string),
	running:       make(map[string]bool),
	username:      make(map[string]string),
	startupErrors: make(map[string]string),
	notices:       make(map[string]string),
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

func rememberPersistentAgentStartupError(scope agentScope, message string) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	message = strings.TrimSpace(message)
	if scope.Selector == "" || scope.AccountID == "" || message == "" {
		return
	}
	persistentAgentCache.Lock()
	persistentAgentCache.startupErrors[scope.cacheKey()] = message
	persistentAgentCache.Unlock()
}

func clearPersistentAgentStartupError(scope agentScope) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	if scope.Selector == "" || scope.AccountID == "" {
		return
	}
	persistentAgentCache.Lock()
	delete(persistentAgentCache.startupErrors, scope.cacheKey())
	persistentAgentCache.Unlock()
}

func latestPersistentAgentStartupError(scope agentScope) string {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	persistentAgentCache.Lock()
	message := persistentAgentCache.startupErrors[scope.cacheKey()]
	persistentAgentCache.Unlock()
	return strings.TrimSpace(message)
}

func rememberPersistentAgentNotice(scope agentScope, message string) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	message = strings.TrimSpace(message)
	if scope.Selector == "" || scope.AccountID == "" || message == "" {
		return
	}
	persistentAgentCache.Lock()
	persistentAgentCache.notices[scope.cacheKey()] = message
	persistentAgentCache.Unlock()
}

func consumePersistentAgentNotice(scope agentScope) string {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	if scope.Selector == "" || scope.AccountID == "" {
		return ""
	}
	persistentAgentCache.Lock()
	defer persistentAgentCache.Unlock()
	message := strings.TrimSpace(persistentAgentCache.notices[scope.cacheKey()])
	delete(persistentAgentCache.notices, scope.cacheKey())
	return message
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
		return agentResponse{}, fmt.Errorf("invalid agent response: %w: output=%s", err, commandOutputSnippet(output))
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
	trace := newPersistentAgentStartupTrace(scope)
	trace.add("ensure started")
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return "", err
	}
	if scope.AccountID == "" {
		return "", errors.New("account id is required")
	}
	cacheKey := scope.cacheKey()
	username, err := cachedInstanceUsername(ctx, scope.Selector)
	if err != nil {
		trace.add("resolve username failed: %v", err)
		return "", trace.errorf("persistent webshell agent username resolve failed")
	}
	trace.add("resolved username=%s", username)

	if persistentAgentRunningCached(scope) {
		trace.add("agent running cache hit")
		clearPersistentAgentStartupError(scope)
		return username, nil
	}

	if err := pingPersistentAgentError(ctx, scope); err == nil {
		trace.add("pre-install ping succeeded")
		markPersistentAgentRunning(scope)
		clearPersistentAgentStartupError(scope)
		return username, nil
	} else {
		trace.add("pre-install ping failed: %v", err)
		rememberIncompatiblePersistentAgentNotice(scope, err)
	}

	persistentAgentCache.Lock()
	previousManifest := persistentAgentCache.installed[cacheKey]
	persistentAgentCache.Unlock()
	manifest, err := ensureAgentBinaryInstalled(ctx, scope, trace)
	if err != nil {
		return "", trace.errorf("persistent webshell agent install failed: %v", err)
	}
	if previousManifest != "" && previousManifest != manifest {
		trace.add("installed manifest changed, marking agent not running")
		markPersistentAgentNotRunning(scope)
	}

	if err := pingPersistentAgentError(ctx, scope); err == nil {
		trace.add("pre-start ping succeeded")
		markPersistentAgentRunning(scope)
		clearPersistentAgentStartupError(scope)
		return username, nil
	} else {
		trace.add("pre-start ping failed: %v", err)
		rememberIncompatiblePersistentAgentNotice(scope, err)
	}
	if err := startPersistentAgent(ctx, scope, username, trace); err != nil {
		return "", trace.errorf("persistent webshell agent start failed: %v", err)
	}
	deadline := time.Now().Add(3 * time.Second)
	attempt := 0
	for time.Now().Before(deadline) {
		attempt++
		if err := pingPersistentAgentError(ctx, scope); err == nil {
			trace.add("ready ping attempt %d succeeded", attempt)
			markPersistentAgentRunning(scope)
			clearPersistentAgentStartupError(scope)
			return username, nil
		} else {
			trace.add("ready ping attempt %d failed: %v", attempt, err)
		}
		time.Sleep(120 * time.Millisecond)
	}
	return "", persistentAgentStartupTimeoutError(ctx, scope, trace)
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

func markPersistentAgentRunning(scope agentScope) {
	persistentAgentCache.Lock()
	persistentAgentCache.running[scope.cacheKey()] = true
	persistentAgentCache.Unlock()
}

func persistentAgentRunningCached(scope agentScope) bool {
	persistentAgentCache.Lock()
	running := persistentAgentCache.running[scope.cacheKey()]
	persistentAgentCache.Unlock()
	return running
}

func rememberIncompatiblePersistentAgentNotice(scope agentScope, err error) {
	if err == nil || !strings.Contains(err.Error(), "unsupported agent protocol") {
		return
	}
	rememberPersistentAgentNotice(scope, "WebShell agent 协议已更新，旧终端会话无法复用，已创建新的终端会话。")
}

func ensureAgentBinaryInstalled(ctx context.Context, scope agentScope, trace *persistentAgentStartupTrace) (string, error) {
	payload, manifest, err := cachedAgentRuntimeArchive()
	if err != nil {
		return "", err
	}
	trace.add("agent archive ready: manifest=%s payload_bytes=%d", manifest, len(payload))
	cacheKey := scope.cacheKey()
	persistentAgentCache.Lock()
	cacheHit := persistentAgentCache.installed[cacheKey] == manifest
	persistentAgentCache.Unlock()
	if cacheHit {
		trace.add("install cache hit, verifying installed binary")
	}

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
	trace.addCommandResult("install check", output, err)
	if err == nil && strings.TrimSpace(string(output)) == agentReadyMarker {
		persistentAgentCache.Lock()
		persistentAgentCache.installed[cacheKey] = manifest
		persistentAgentCache.Unlock()
		trace.add("installed binary already matches manifest")
		return manifest, nil
	}
	if cacheHit {
		trace.add("install cache stale, reinstalling")
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
	trace.addCommandResult("install", output, err)
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
	return pingPersistentAgentError(ctx, scope) == nil
}

func pingPersistentAgentError(ctx context.Context, scope agentScope) error {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := runPersistentAgentRequest(ctx, scope, agentRequest{Type: "ping", Selector: scope.Selector, AccountID: scope.AccountID})
	return err
}

func startPersistentAgent(ctx context.Context, scope agentScope, username string, trace *persistentAgentStartupTrace) error {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	startCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	socketPath := scopedAgentSocketPath(scope)
	logPath := scopedAgentLogPath(scope)
	trace.add("start command prepared: socket=%s log=%s", socketPath, logPath)
	script := fmt.Sprintf(`set -eu
agent=%s
socket=%s
log=%s
legacy_socket=%s
if [ ! -x "$agent" ]; then
  printf 'agent executable is missing: %%s\n' "$agent" >&2
  exit 127
fi
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
	trace.addCommandResult("start", output, err)
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return err
		}
		return fmt.Errorf("%w: %s", err, text)
	}
	if strings.TrimSpace(string(output)) != agentReadyMarker {
		return fmt.Errorf("persistent webshell agent start did not complete: selector=%s account=%s socket=%s log=%s output=%q", scope.Selector, scope.AccountID, socketPath, logPath, strings.TrimSpace(string(output)))
	}
	return nil
}

func persistentAgentStartupTimeoutError(ctx context.Context, scope agentScope, trace *persistentAgentStartupTrace) error {
	snippet := readPersistentAgentLogTail(ctx, scope, 80)
	if strings.TrimSpace(snippet) == "" {
		trace.add("agent log tail: <empty>")
	} else {
		trace.add("agent log tail:\n%s", snippet)
	}
	message := fmt.Sprintf("persistent webshell agent did not become ready: selector=%s account=%s socket=%s log=%s", scope.Selector, scope.AccountID, scopedAgentSocketPath(scope), scopedAgentLogPath(scope))
	return trace.errorf("%s", message)
}

func readPersistentAgentLogTail(ctx context.Context, scope agentScope, lines int) string {
	if lines <= 0 {
		lines = 80
	}
	logPath := scopedAgentLogPath(scope)
	script := "tail -n " + strconv.Itoa(lines) + " " + shellScriptQuote(logPath) + " 2>/dev/null || true"
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", scope.Selector, "/bin/sh", "-lc", script).CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func (s *pluginServer) handleAgentStartupError(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if isClientTarget(selector) {
		if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
			writeAuthorizationError(w, err)
			return
		}
		writeAuthorizationError(w, errClientTerminalProxyUnavailable)
		return
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return
	}
	writeJSON(w, agentStartupErrorResponse{
		Error: latestPersistentAgentStartupError(normalizeAgentScope(selector, accountID)),
	})
}

func (s *pluginServer) attachAgentPane(w http.ResponseWriter, r *http.Request, scope agentScope, paneID string, cols, rows, terminalScrollback int) error {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	if !websocket.IsWebSocketUpgrade(r) {
		http.Error(w, "websocket upgrade is required", http.StatusBadRequest)
		return nil
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()
	conn.EnableWriteCompression(false)
	conn.SetReadLimit(websocketReadLimit)

	var writeMu sync.Mutex
	_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{"type": "agent-preparing"})

	if _, err := ensurePersistentAgent(r.Context(), scope); err != nil {
		_ = writeWebSocketMessageLocked(conn, &writeMu, websocket.TextMessage, []byte("\r\n[webshell error]\r\n"+err.Error()+"\r\n"))
		return nil
	}
	if err := pingPersistentAgentError(r.Context(), scope); err != nil {
		log.Printf("persistent webshell agent ping before attach failed: scope=%s account=%s err=%v", scope.Selector, scope.AccountID, err)
		rememberIncompatiblePersistentAgentNotice(scope, err)
		markPersistentAgentNotRunning(scope)
		if _, ensureErr := ensurePersistentAgent(r.Context(), scope); ensureErr != nil {
			_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{"type": "process-exit", "message": ensureErr.Error(), "exit_code": -1, "retryable": true})
			return nil
		}
	}
	clientID := strings.TrimSpace(r.URL.Query().Get("client_id"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.URL.Query().Get("client"))
	}

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
		_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return nil
	}
	stdin, err := command.StdinPipe()
	if err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return nil
	}
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
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

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		forwardedFrames := 0
		for {
			frameType, payload, err := readAgentFrame(stdout)
			if err != nil {
				if text := strings.TrimSpace(stderr.String()); text != "" {
					response := map[string]any{"type": "process-exit", "message": text, "exit_code": -1}
					if forwardedFrames == 0 && isRetryableAgentAttachError(text) {
						response["retryable"] = true
						markPersistentAgentNotRunning(scope)
					}
					if isPaneNotFoundAttachError(text) {
						response["retryable"] = false
					}
					_ = writeWebSocketJSONLocked(conn, &writeMu, response)
				}
				_ = conn.Close()
				return
			}
			messageType := websocket.BinaryMessage
			if frameType == agentFrameText {
				messageType = websocket.TextMessage
			}
			err = writeWebSocketMessageLocked(conn, &writeMu, messageType, payload)
			if err != nil {
				_ = conn.Close()
				return
			}
			forwardedFrames++
		}
	}()

	_ = conn.SetReadDeadline(time.Now().Add(websocketReadTimeout))
	localInputBlocked := false
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			stopAttach()
			<-writerDone
			return nil
		}
		_ = conn.SetReadDeadline(time.Now().Add(websocketReadTimeout))
		inputBlocked := localInputBlocked || s.terminalInputBlocked(scope, clientID)
		switch messageType {
		case websocket.BinaryMessage:
			if len(payload) > 0 && !inputBlocked {
				_ = writeAgentFrame(stdin, agentFrameInput, payload)
			}
		case websocket.TextMessage:
			keepOpen := handleAgentAttachControlMessage(conn, &writeMu, stdin, payload, inputBlocked, &localInputBlocked)
			if !keepOpen {
				stopAttach()
				<-writerDone
				return nil
			}
		}
	}
}

func isPaneNotFoundAttachError(message string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(message)), "pane not found")
}

func isRetryableAgentAttachError(message string) bool {
	text := strings.ToLower(strings.TrimSpace(message))
	if text == "" || isPaneNotFoundAttachError(text) {
		return false
	}
	for _, marker := range []string{
		"broken pipe",
		"connection refused",
		"deadline exceeded",
		"i/o timeout",
		"no such file or directory",
		"socket",
		"unsupported agent protocol",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func handleAgentAttachControlMessage(conn *websocket.Conn, writeMu *sync.Mutex, stdin io.Writer, payload []byte, inputBlocked bool, localInputBlocked *bool) bool {
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
		if localInputBlocked != nil {
			*localInputBlocked = message.Blocked
		}
	case "ping":
		_ = writeWebSocketJSONLocked(conn, writeMu, map[string]any{"type": "pong"})
	case "detach":
		_ = writeAgentFrame(stdin, agentFrameDetach, nil)
		return false
	}
	return true
}

func writeWebSocketMessageLocked(conn *websocket.Conn, mu *sync.Mutex, messageType int, payload []byte) error {
	mu.Lock()
	defer mu.Unlock()
	_ = conn.SetWriteDeadline(time.Now().Add(websocketWriteTimeout))
	err := conn.WriteMessage(messageType, payload)
	_ = conn.SetWriteDeadline(time.Time{})
	return err
}

func writeWebSocketJSONLocked(conn *websocket.Conn, mu *sync.Mutex, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return writeWebSocketMessageLocked(conn, mu, websocket.TextMessage, data)
}
