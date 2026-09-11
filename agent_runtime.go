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
	agentInstallPath            = "/usr/local/bin/lcmd-webshell-agent"
	agentManifestPath           = "/usr/local/bin/.lcmd-webshell-agent.manifest"
	defaultAgentSocketPath      = "/tmp/lcmd-webshell-agent.sock"
	agentLogPath                = "/tmp/lcmd-webshell-agent.log"
	agentReadyMarker            = "__LCMD_WEBSHELL_AGENT_READY__"
	agentInstallCachePrefix     = agentProtocolVersion + "\t"
	commandOutputSnippetMax     = 1024
	unknownAgentProtocolVersion = "unknown"
	websocketReadTimeout        = 30 * time.Second
	websocketWriteTimeout       = 5 * time.Second
	agentEnsureTimeout          = 60 * time.Second
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

type unsupportedAgentProtocolError struct {
	version string
}

func (e *unsupportedAgentProtocolError) Error() string {
	return fmt.Sprintf("unsupported agent protocol %q", e.version)
}

func isUnsupportedAgentProtocolError(err error) bool {
	var protocolErr *unsupportedAgentProtocolError
	return errors.As(err, &protocolErr)
}

func unsupportedAgentProtocolVersion(err error) string {
	var protocolErr *unsupportedAgentProtocolError
	if !errors.As(err, &protocolErr) {
		return ""
	}
	return strings.TrimSpace(protocolErr.version)
}

func isCurrentAgentProtocolVersion(version string) bool {
	return strings.TrimSpace(version) == agentProtocolVersion
}

func isAttachCompatibleAgentProtocolVersion(version string) bool {
	switch strings.TrimSpace(version) {
	case agentProtocolVersion, "lcmd-webshell-agent-v12", "lcmd-webshell-agent-v11", "lcmd-webshell-agent-v10", "lcmd-webshell-agent-v9":
		return true
	default:
		return false
	}
}

func agentProtocolUpdateState(version string) (available bool, required bool) {
	version = strings.TrimSpace(version)
	if version == "" || isCurrentAgentProtocolVersion(version) {
		return false, false
	}
	return true, !isAttachCompatibleAgentProtocolVersion(version)
}

func isContainerUnavailableError(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "container does not exist")
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

func agentManifestSHA256(manifest string) (string, error) {
	parts := strings.SplitN(strings.TrimSpace(manifest), "\t", 2)
	if len(parts) != 2 || parts[0] != agentProtocolVersion {
		return "", fmt.Errorf("invalid agent manifest %q", manifest)
	}
	hash := strings.TrimSpace(parts[1])
	decoded, err := hex.DecodeString(hash)
	if err != nil || len(decoded) != sha256.Size {
		return "", fmt.Errorf("invalid agent manifest sha256 %q", hash)
	}
	return hash, nil
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

type persistentAgentEnsureFlight struct {
	done     chan struct{}
	username string
	err      error
	waiters  int
}

type persistentAgentEnsureCoordinator struct {
	sync.Mutex
	flights map[string]*persistentAgentEnsureFlight
}

var persistentAgentEnsures persistentAgentEnsureCoordinator

func (c *persistentAgentEnsureCoordinator) do(ctx context.Context, key string, ensure func(context.Context) (string, error)) (string, error) {
	c.Lock()
	if c.flights == nil {
		c.flights = make(map[string]*persistentAgentEnsureFlight)
	}
	flight := c.flights[key]
	if flight == nil {
		flight = &persistentAgentEnsureFlight{done: make(chan struct{})}
		c.flights[key] = flight
		go func() {
			sharedCtx, cancel := context.WithTimeout(context.Background(), agentEnsureTimeout)
			defer cancel()
			username, err := ensure(sharedCtx)

			c.Lock()
			flight.username = username
			flight.err = err
			delete(c.flights, key)
			close(flight.done)
			c.Unlock()
		}()
	}
	flight.waiters++
	c.Unlock()

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-flight.done:
		return flight.username, flight.err
	}
}

func applyAgentWorkspaceCapabilities(state *workspaceState, version string) {
	if state == nil {
		return
	}
	state.AgentCapabilities = nil
	if isCurrentAgentProtocolVersion(version) {
		state.AgentCapabilities = []string{"tab_reorder_anchor"}
	}
}

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
	applyAgentWorkspaceCapabilities(response.State, response.Version)
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
	applyAgentWorkspaceCapabilities(response.State, response.Version)
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

func agentConnectionErrorPayload(err error) map[string]any {
	message := "persistent webshell agent connection failed"
	if err != nil && strings.TrimSpace(err.Error()) != "" {
		message = strings.TrimSpace(err.Error())
	}
	return map[string]any{
		"type":      "connection-error",
		"message":   message,
		"retryable": true,
	}
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
	return parsePersistentAgentResponse(output)
}

func parsePersistentAgentResponse(output []byte) (agentResponse, error) {
	trimmed := bytes.TrimSpace(output)
	if len(trimmed) == 0 {
		return agentResponse{}, errors.New("agent returned an empty response")
	}
	var response agentResponse
	if err := json.Unmarshal(trimmed, &response); err != nil {
		return agentResponse{}, fmt.Errorf("invalid agent response: %w: output=%s", err, commandOutputSnippet(output))
	}
	version := strings.TrimSpace(response.Version)
	if version == "" {
		version = unknownAgentProtocolVersion
	}
	if !isAttachCompatibleAgentProtocolVersion(version) {
		return agentResponse{}, &unsupportedAgentProtocolError{version: version}
	}
	if !response.OK {
		if response.Error == "" {
			response.Error = "agent request failed"
		}
		return response, errors.New(response.Error)
	}
	return response, nil
}

func ensurePersistentAgent(ctx context.Context, scope agentScope) (string, error) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	startedAt := time.Now()
	log.Printf("persistent agent ensure start: scope=%s", scope.Selector)
	if err := validateInstanceSelector(scope.Selector); err != nil {
		log.Printf("persistent agent ensure complete: scope=%s duration_ms=%d success=false err=%v", scope.Selector, time.Since(startedAt).Milliseconds(), err)
		return "", err
	}
	if scope.AccountID == "" {
		err := errors.New("account id is required")
		log.Printf("persistent agent ensure complete: scope=%s duration_ms=%d success=false err=%v", scope.Selector, time.Since(startedAt).Milliseconds(), err)
		return "", err
	}
	username, err := persistentAgentEnsures.do(ctx, scope.cacheKey(), func(sharedCtx context.Context) (string, error) {
		return ensurePersistentAgentOnce(sharedCtx, scope)
	})
	log.Printf("persistent agent ensure complete: scope=%s duration_ms=%d success=%t", scope.Selector, time.Since(startedAt).Milliseconds(), err == nil)
	return username, err
}

func ensurePersistentAgentOnce(ctx context.Context, scope agentScope) (string, error) {
	trace := newPersistentAgentStartupTrace(scope)
	trace.add("ensure started")
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

	preInstallResponse, preInstallPingErr := pingPersistentAgentResponse(ctx, scope)
	preInstallRunning := preInstallPingErr == nil
	if preInstallRunning {
		trace.add("pre-install ping succeeded")
		if !isCurrentAgentProtocolVersion(preInstallResponse.Version) {
			trace.add("compatible agent protocol %s remains active until explicit update to %s", preInstallResponse.Version, agentProtocolVersion)
			markPersistentAgentRunning(scope)
			clearPersistentAgentStartupError(scope)
			return username, nil
		}
	} else {
		trace.add("pre-install ping failed: %v", preInstallPingErr)
		rememberIncompatiblePersistentAgentNotice(scope, preInstallPingErr)
		if isUnsupportedAgentProtocolError(preInstallPingErr) {
			trace.add("active daemon protocol differs; waiting for explicit update before installing the packaged agent")
			return username, preInstallPingErr
		}
		if isContainerUnavailableError(preInstallPingErr) {
			return "", trace.errorf("persistent webshell agent target container unavailable: %v", preInstallPingErr)
		}
	}

	persistentAgentCache.Lock()
	previousManifest := persistentAgentCache.installed[cacheKey]
	persistentAgentCache.Unlock()
	manifest, err := ensureAgentBinaryInstalled(ctx, scope, trace)
	if err != nil {
		if preInstallRunning {
			trace.add("agent install failed while compatible daemon is running; reusing daemon: %v", err)
			markPersistentAgentRunning(scope)
			clearPersistentAgentStartupError(scope)
			return username, nil
		}
		return "", trace.errorf("persistent webshell agent install failed: %v", err)
	}
	if previousManifest != "" && previousManifest != manifest {
		trace.add("installed manifest changed, marking agent not running")
		markPersistentAgentNotRunning(scope)
	}
	if err := reconcilePersistentAgentDaemons(ctx, scope, false, trace); err != nil {
		if preInstallRunning {
			trace.add("daemon reconciliation failed while compatible daemon is running; reusing daemon: %v", err)
			markPersistentAgentRunning(scope)
			clearPersistentAgentStartupError(scope)
			return username, nil
		}
		return "", trace.errorf("persistent webshell agent daemon reconciliation failed: %v", err)
	}

	preStartPingErr := pingPersistentAgentError(ctx, scope)
	if preStartPingErr == nil {
		trace.add("pre-start ping succeeded")
		markPersistentAgentRunning(scope)
		clearPersistentAgentStartupError(scope)
		return username, nil
	}
	trace.add("pre-start ping failed: %v", preStartPingErr)
	rememberIncompatiblePersistentAgentNotice(scope, preStartPingErr)
	if isUnsupportedAgentProtocolError(preStartPingErr) {
		trace.add("active daemon requires an explicit protocol update")
		return username, preStartPingErr
	}
	if err := startPersistentAgent(ctx, scope, username, trace); err != nil {
		trace.add("start command failed: %v", err)
		if pingErr := pingPersistentAgentError(ctx, scope); pingErr == nil {
			trace.add("post-start-failure ping succeeded; reusing concurrent daemon")
			markPersistentAgentRunning(scope)
			clearPersistentAgentStartupError(scope)
			return username, nil
		} else {
			trace.add("post-start-failure ping failed: %v", pingErr)
		}
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
		select {
		case <-ctx.Done():
			return "", trace.errorf("persistent webshell agent readiness wait canceled: %v", ctx.Err())
		case <-time.After(120 * time.Millisecond):
		}
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
	if !isUnsupportedAgentProtocolError(err) {
		return
	}
	rememberPersistentAgentNotice(scope, "检测到终端服务协议待更新，请在终端右上角查看详情。")
}

func ensureAgentBinaryInstalled(ctx context.Context, scope agentScope, trace *persistentAgentStartupTrace) (string, error) {
	payload, manifest, err := cachedAgentRuntimeArchive()
	if err != nil {
		return "", err
	}
	expectedHash, err := agentManifestSHA256(manifest)
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
		"agent=" + shellScriptQuote(agentInstallPath),
		"manifest_path=" + shellScriptQuote(agentManifestPath),
		"expected=" + shellScriptQuote(manifest),
		"expected_hash=" + shellScriptQuote(expectedHash),
		"if [ -x \"$agent\" ] && [ \"$(cat \"$manifest_path\" 2>/dev/null || true)\" = \"$expected\" ]; then",
		"  if command -v sha256sum >/dev/null 2>&1; then",
		"    set -- $(sha256sum \"$agent\")",
		"  elif command -v busybox >/dev/null 2>&1; then",
		"    set -- $(busybox sha256sum \"$agent\")",
		"  else",
		"    printf 'sha256sum is unavailable\\n' >&2",
		"    exit 127",
		"  fi",
		"  actual_hash=$1",
		"  [ \"$actual_hash\" = \"$expected_hash\" ] || exit 0",
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
	installScript := buildAgentInstallScript(manifest, agentInstallPath, agentManifestPath)
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

func buildAgentInstallScript(manifest, installPath, manifestPath string) string {
	installPath = filepath.Clean(installPath)
	manifestPath = filepath.Clean(manifestPath)
	installDir := filepath.Dir(installPath)
	manifestDir := filepath.Dir(manifestPath)
	agentArchivePath := strings.TrimPrefix(installPath, string(filepath.Separator))
	manifestArchivePath := strings.TrimPrefix(manifestPath, string(filepath.Separator))
	expectedHash, err := agentManifestSHA256(manifest)
	if err != nil {
		return "printf '%s\\n' " + shellScriptQuote(err.Error()) + " >&2; exit 1"
	}
	return strings.Join([]string{
		"set -eu",
		"agent=" + shellScriptQuote(installPath),
		"manifest_path=" + shellScriptQuote(manifestPath),
		"expected=" + shellScriptQuote(manifest),
		"expected_hash=" + shellScriptQuote(expectedHash),
		"stage_parent=" + shellScriptQuote(installDir),
		"agent_archive_path=" + shellScriptQuote(filepath.ToSlash(agentArchivePath)),
		"manifest_archive_path=" + shellScriptQuote(filepath.ToSlash(manifestArchivePath)),
		"mkdir -p \"$stage_parent\" " + shellScriptQuote(manifestDir),
		"stage=\"$stage_parent/.lcmd-webshell-agent.install.$$\"",
		"cleanup() { rm -rf \"$stage\" 2>/dev/null || true; }",
		"trap cleanup 0 1 2 15",
		"rm -rf \"$stage\"",
		"mkdir -p \"$stage\"",
		"tar -xpf - -C \"$stage\"",
		"new_agent=\"$stage/$agent_archive_path\"",
		"new_manifest=\"$stage/$manifest_archive_path\"",
		"if [ ! -f \"$new_agent\" ] || [ ! -f \"$new_manifest\" ]; then",
		"  printf 'agent archive is incomplete\\n' >&2",
		"  exit 1",
		"fi",
		"if [ \"$(cat \"$new_manifest\")\" != \"$expected\" ]; then",
		"  printf 'agent archive manifest mismatch\\n' >&2",
		"  exit 1",
		"fi",
		"if command -v sha256sum >/dev/null 2>&1; then",
		"  set -- $(sha256sum \"$new_agent\")",
		"elif command -v busybox >/dev/null 2>&1; then",
		"  set -- $(busybox sha256sum \"$new_agent\")",
		"else",
		"  printf 'sha256sum is unavailable\\n' >&2",
		"  exit 127",
		"fi",
		"actual_hash=$1",
		"if [ \"$actual_hash\" != \"$expected_hash\" ]; then",
		"  printf 'agent archive sha256 mismatch\\n' >&2",
		"  exit 1",
		"fi",
		"chmod 755 \"$new_agent\"",
		"mv -f \"$new_agent\" \"$agent\"",
		"chmod 644 \"$new_manifest\"",
		"mv -f \"$new_manifest\" \"$manifest_path\"",
		"printf '%s\\n' " + shellScriptQuote(agentReadyMarker),
	}, "\n")
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

func pingPersistentAgentResponse(ctx context.Context, scope agentScope) (agentResponse, error) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	startedAt := time.Now()
	log.Printf("persistent agent ping start: scope=%s", scope.Selector)
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	response, err := runPersistentAgentRequest(ctx, scope, agentRequest{Type: "ping", Selector: scope.Selector, AccountID: scope.AccountID})
	log.Printf("persistent agent ping complete: scope=%s duration_ms=%d success=%t", scope.Selector, time.Since(startedAt).Milliseconds(), err == nil)
	return response, err
}

func pingPersistentAgentError(ctx context.Context, scope agentScope) error {
	_, err := pingPersistentAgentResponse(ctx, scope)
	return err
}

func reconcilePersistentAgentDaemons(ctx context.Context, scope agentScope, replaceActive bool, trace *persistentAgentStartupTrace) error {
	reconcileCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	args := []string{
		"exec",
		scope.Selector,
		agentInstallPath,
		"agent",
		"reconcile",
		"--socket",
		scopedAgentSocketPath(scope),
		"--selector",
		scope.Selector,
		"--account",
		scope.AccountID,
	}
	stage := "daemon reconcile"
	if replaceActive {
		args = append(args, "--replace-active", "--force-protocol-replacement")
		stage = "incompatible daemon reconcile"
	}
	output, err := exec.CommandContext(reconcileCtx, lightosctlPath, args...).CombinedOutput()
	trace.addCommandResult(stage, output, err)
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return err
		}
		return fmt.Errorf("%w: %s", err, text)
	}
	fields := strings.Fields(strings.TrimSpace(string(output)))
	if len(fields) != 2 || fields[0] != agentReconcileMarker {
		return fmt.Errorf("agent daemon reconciliation did not complete: output=%q", strings.TrimSpace(string(output)))
	}
	count, err := strconv.Atoi(fields[1])
	if err != nil || count < 0 {
		return fmt.Errorf("invalid agent daemon reconciliation count: output=%q", strings.TrimSpace(string(output)))
	}
	trace.add("%s removed %d process(es)", stage, count)
	return nil
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
ready="$socket.ready.$$"
expected_ready=%s
if [ ! -x "$agent" ]; then
  printf 'agent executable is missing: %%s\n' "$agent" >&2
  exit 127
fi
rm -f "$ready"
trap 'rm -f "$ready"' 0 1 2 15
if command -v setsid >/dev/null 2>&1; then
  setsid "$agent" agent daemon --socket "$socket" --ready-file "$ready" --selector %s --account %s --username %s </dev/null >>"$log" 2>&1 &
else
  nohup "$agent" agent daemon --socket "$socket" --ready-file "$ready" --selector %s --account %s --username %s </dev/null >>"$log" 2>&1 &
fi
pid=$!
attempt=0
while [ "$attempt" -lt 100 ]; do
  if [ "$(cat "$ready" 2>/dev/null || true)" = "$expected_ready" ] && kill -0 "$pid" 2>/dev/null; then
    printf '%%s\n' %s
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    status=0
    wait "$pid" || status=$?
    printf 'agent daemon exited before readiness: status=%%s\n' "$status" >&2
    exit "$status"
  fi
  attempt=$((attempt + 1))
  sleep 0.05
done
printf 'agent daemon readiness timed out\n' >&2
exit 1
`, shellScriptQuote(agentInstallPath), shellScriptQuote(socketPath), shellScriptQuote(logPath), shellScriptQuote(agentReadyMarker), shellScriptQuote(scope.Selector), shellScriptQuote(scope.AccountID), shellScriptQuote(username), shellScriptQuote(scope.Selector), shellScriptQuote(scope.AccountID), shellScriptQuote(username), shellScriptQuote(agentReadyMarker))
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
			writeClientTerminalError(w, err)
			return
		}
		cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
		if _, err := s.clientWorkspaceActivity(r.Context(), r.Header, selector, cols, rows, s.currentTerminalScrollback()); err != nil {
			writeJSON(w, agentStartupErrorResponse{Error: err.Error()})
			return
		}
		writeJSON(w, agentStartupErrorResponse{})
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

func (s *pluginServer) attachAgentPane(w http.ResponseWriter, r *http.Request, scope agentScope, paneID string, cols, rows, terminalScrollback int, syncRequest historySyncRequest) error {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	log.Printf("terminal pane attach start: scope=%s pane=%s cols=%d rows=%d scrollback=%d", scope.Selector, paneID, cols, rows, terminalScrollback)
	if !websocket.IsWebSocketUpgrade(r) {
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
	var writeJSON = func(payload any) error {
		return writeWebSocketJSONLocked(conn, &writeMu, payload)
	}
	var stopServerLogs func()
	if serverLogDiagnosticsEnabled(r.URL.Query().Get("server_logs")) {
		stopServerLogs = startServerLogForwarder(writeJSON, parseServerLogAfter(r.URL.Query().Get("server_log_after")), parseServerLogSince(r.URL.Query().Get("server_log_since_ms")))
		defer stopServerLogs()
	}
	_ = writeJSON(map[string]any{
		"type":           "agent-preparing",
		"server_unix_ms": time.Now().UnixMilli(),
	})

	if _, err := ensurePersistentAgent(r.Context(), scope); err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, agentConnectionErrorPayload(err))
		return nil
	}
	if err := pingPersistentAgentError(r.Context(), scope); err != nil {
		log.Printf("persistent webshell agent ping before attach failed: scope=%s account=%s err=%v", scope.Selector, scope.AccountID, err)
		rememberIncompatiblePersistentAgentNotice(scope, err)
		markPersistentAgentNotRunning(scope)
		if _, ensureErr := ensurePersistentAgent(r.Context(), scope); ensureErr != nil {
			_ = writeWebSocketJSONLocked(conn, &writeMu, agentConnectionErrorPayload(ensureErr))
			return nil
		}
	}
	attachCtx, cancelAttach := context.WithCancel(context.Background())
	defer cancelAttach()
	command := exec.CommandContext(attachCtx, lightosctlPath, persistentAgentAttachCommandArgs(scope, paneID, cols, rows, terminalScrollback, syncRequest)...)
	stdout, err := command.StdoutPipe()
	if err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, agentConnectionErrorPayload(err))
		return nil
	}
	stdin, err := command.StdinPipe()
	if err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, agentConnectionErrorPayload(err))
		return nil
	}
	var stderr bytes.Buffer
	stderrLog := &serverLogWriter{
		hub:    processServerLogHub,
		source: fmt.Sprintf("lightosctl pane=%s", paneID),
	}
	stderrCapture := io.MultiWriter(&stderr, stderrLog)
	command.Stderr = stderrCapture
	if err := command.Start(); err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, agentConnectionErrorPayload(err))
		return nil
	}
	if foreground, background, cursor := terminalThemeFromRequest(r); foreground != "" || background != "" || cursor != "" {
		themeMessage := terminalControlMessage{Type: "theme", Foreground: foreground, Background: background, Cursor: cursor}
		if payload, err := json.Marshal(themeMessage); err == nil {
			_ = writeAgentFrame(stdin, agentFrameResize, payload)
		}
	}
	waitDone := make(chan error, 1)
	go func() {
		err := command.Wait()
		stderrLog.flush()
		waitDone <- err
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
		for {
			frameType, payload, err := readAgentFrame(stdout)
			if err != nil {
				if text := strings.TrimSpace(stderr.String()); text != "" {
					if isPaneNotFoundAttachError(text) {
						_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{
							"type":     "workspace-refresh-required",
							"selector": scope.Selector,
							"reason":   text,
						})
					} else {
						markPersistentAgentNotRunning(scope)
						_ = writeWebSocketJSONLocked(conn, &writeMu, agentConnectionErrorPayload(errors.New(text)))
					}
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
		}
	}()

	_ = conn.SetReadDeadline(time.Now().Add(websocketReadTimeout))
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			stopAttach()
			<-writerDone
			return nil
		}
		_ = conn.SetReadDeadline(time.Now().Add(websocketReadTimeout))
		switch messageType {
		case websocket.BinaryMessage:
			if len(payload) > 0 {
				_ = writeAgentFrame(stdin, agentFrameInput, payload)
			}
		case websocket.TextMessage:
			keepOpen := handleAgentAttachControlMessage(conn, &writeMu, stdin, payload)
			if !keepOpen {
				stopAttach()
				<-writerDone
				return nil
			}
		}
	}
}

func persistentAgentAttachCommandArgs(scope agentScope, paneID string, cols, rows, terminalScrollback int, syncRequest historySyncRequest) []string {
	commandArgs := []string{
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
	}
	if syncRequest.workspaceGeneration != "" {
		commandArgs = append(commandArgs, "--workspace-generation", syncRequest.workspaceGeneration)
	}
	if syncRequest.generation != "" {
		commandArgs = append(commandArgs, "--history-generation", syncRequest.generation)
	}
	if syncRequest.hasRange {
		commandArgs = append(commandArgs,
			"--local-base-cursor", strconv.FormatUint(syncRequest.localBase, 10),
			"--local-end-cursor", strconv.FormatUint(syncRequest.localEnd, 10),
		)
	}
	if syncRequest.forceSnapshot {
		commandArgs = append(commandArgs, "--history-replay-mode", "snapshot")
	}
	if syncRequest.integrityProtocol != "" {
		commandArgs = append(commandArgs, "--integrity-protocol", syncRequest.integrityProtocol)
	}
	return commandArgs
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

func handleAgentAttachControlMessage(conn *websocket.Conn, writeMu *sync.Mutex, stdin io.Writer, payload []byte) bool {
	var message terminalControlMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		if data, ok := strings.CutPrefix(string(payload), "input:"); ok {
			_ = writeAgentFrame(stdin, agentFrameInput, []byte(data))
		}
		return true
	}
	switch message.Type {
	case "input":
		if message.Data != "" {
			if message.Foreground != "" || message.Background != "" || message.Cursor != "" {
				themeMessage := terminalControlMessage{Type: "theme", Foreground: message.Foreground, Background: message.Background, Cursor: message.Cursor}
				if payload, err := json.Marshal(themeMessage); err == nil {
					_ = writeAgentFrame(stdin, agentFrameResize, payload)
				}
			}
			frameType := agentFrameInput
			if message.Generated {
				frameType = agentFrameGeneratedInput
			} else if message.Cols > 0 && message.Rows > 0 {
				resizeMessage := terminalControlMessage{
					Type:        "resize",
					Cols:        message.Cols,
					Rows:        message.Rows,
					PixelWidth:  message.PixelWidth,
					PixelHeight: message.PixelHeight,
					ResizeEpoch: message.ResizeEpoch,
				}
				if payload, err := json.Marshal(resizeMessage); err == nil {
					_ = writeAgentFrame(stdin, agentFrameResize, payload)
				}
			}
			_ = writeAgentFrame(stdin, frameType, []byte(message.Data))
		}
	case "resize":
		if message.Cols > 0 && message.Rows > 0 {
			data, _ := json.Marshal(message)
			_ = writeAgentFrame(stdin, agentFrameResize, data)
		}
	case "theme":
		data, _ := json.Marshal(message)
		_ = writeAgentFrame(stdin, agentFrameResize, data)
	case "input_lock":
		// Compatibility no-op for older pages during rolling upgrades.
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
