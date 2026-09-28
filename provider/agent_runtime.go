package provider

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
	"github.com/gorilla/websocket"
	"io"
	"lcmd-webshell/core"
	"lcmd-webshell/internal/serverlog"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	agentInstallPath            = "/usr/local/bin/lcmd-webshell-agent"
	agentManifestPath           = "/usr/local/bin/.lcmd-webshell-agent.manifest"
	defaultAgentSocketPath      = "/tmp/lcmd-webshell-agent.sock"
	agentLogPath                = "/tmp/lcmd-webshell-agent.log"
	agentReadyMarker            = "__LCMD_WEBSHELL_AGENT_READY__"
	agentInstallCachePrefix     = AgentProtocolVersion + "\t"
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

type persistentAgentStartupTrace struct {
	scope      AgentScope
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
	return strings.TrimSpace(version) == AgentProtocolVersion
}

// v27 and later implement these workspace features.
func supportsWorkspaceRecovery(version string) bool {
	if strings.TrimSpace(version) == "lcmd-webshell-agent-v39" {
		return true
	}
	return isCurrentAgentProtocolVersion(version) || strings.TrimSpace(version) == "lcmd-webshell-agent-v38" || strings.TrimSpace(version) == "lcmd-webshell-agent-v37" || strings.TrimSpace(version) == "lcmd-webshell-agent-v36" || strings.TrimSpace(version) == "lcmd-webshell-agent-v35" || strings.TrimSpace(version) == "lcmd-webshell-agent-v34" || strings.TrimSpace(version) == "lcmd-webshell-agent-v33" || strings.TrimSpace(version) == "lcmd-webshell-agent-v32" || strings.TrimSpace(version) == "lcmd-webshell-agent-v31" || strings.TrimSpace(version) == "lcmd-webshell-agent-v30" || strings.TrimSpace(version) == "lcmd-webshell-agent-v29" || strings.TrimSpace(version) == "lcmd-webshell-agent-v28" || strings.TrimSpace(version) == "lcmd-webshell-agent-v27"
}

func isAttachCompatibleAgentProtocolVersion(version string) bool {
	if strings.TrimSpace(version) == "lcmd-webshell-agent-v39" {
		return true
	}
	switch strings.TrimSpace(version) {
	case AgentProtocolVersion, "lcmd-webshell-agent-v38", "lcmd-webshell-agent-v37", "lcmd-webshell-agent-v36", "lcmd-webshell-agent-v35", "lcmd-webshell-agent-v34", "lcmd-webshell-agent-v33", "lcmd-webshell-agent-v32", "lcmd-webshell-agent-v31", "lcmd-webshell-agent-v30", "lcmd-webshell-agent-v29", "lcmd-webshell-agent-v28", "lcmd-webshell-agent-v27", "lcmd-webshell-agent-v26", "lcmd-webshell-agent-v25", "lcmd-webshell-agent-v24", "lcmd-webshell-agent-v23", "lcmd-webshell-agent-v22", "lcmd-webshell-agent-v21", "lcmd-webshell-agent-v20", "lcmd-webshell-agent-v19", "lcmd-webshell-agent-v18", "lcmd-webshell-agent-v17", "lcmd-webshell-agent-v16", "lcmd-webshell-agent-v15", "lcmd-webshell-agent-v14", "lcmd-webshell-agent-v13", "lcmd-webshell-agent-v12", "lcmd-webshell-agent-v11", "lcmd-webshell-agent-v10", "lcmd-webshell-agent-v9":
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

func agentSocketPath(selector string) string {
	if strings.TrimSpace(selector) == "" {
		return defaultAgentSocketPath
	}
	return "/tmp/lcmd-webshell-agent-" + agentSelectorHash(selector) + ".sock"
}

func scopedAgentSocketPath(scope AgentScope) string {
	if strings.TrimSpace(scope.Selector) == "" {
		return defaultAgentSocketPath
	}
	return "/tmp/lcmd-webshell-agent-" + scope.Hash() + ".sock"
}

func agentLogPathForSelector(selector string) string {
	if strings.TrimSpace(selector) == "" {
		return agentLogPath
	}
	return "/tmp/lcmd-webshell-agent-" + agentSelectorHash(selector) + ".log"
}

func scopedAgentLogPath(scope AgentScope) string {
	if strings.TrimSpace(scope.Selector) == "" {
		return agentLogPath
	}
	return "/tmp/lcmd-webshell-agent-" + scope.Hash() + ".log"
}

func newPersistentAgentStartupTrace(scope AgentScope) *persistentAgentStartupTrace {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
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
	if len(parts) != 2 || parts[0] != AgentProtocolVersion {
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

func applyAgentWorkspaceCapabilities(state *WorkspaceState, version string) {
	if state == nil {
		return
	}
	state.AgentCapabilities = nil
	if supportsWorkspaceRecovery(version) {
		state.AgentCapabilities = []string{"tab_reorder_anchor", "workspace_restart_restore"}
	}
}

func requestAgentWorkspaceStateWithVersion(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int) (WorkspaceState, string, error) {
	response, err := requestPersistentAgent(ctx, scope, AgentRequest{
		Type:               "state",
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
	})
	if err != nil {
		return WorkspaceState{}, "", err
	}
	if response.State == nil {
		return WorkspaceState{}, response.Version, errors.New("agent returned empty workspace state")
	}
	applyAgentWorkspaceCapabilities(response.State, response.Version)
	return *response.State, response.Version, nil
}

func requestAgentWorkspaceState(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int) (WorkspaceState, error) {
	state, _, err := requestAgentWorkspaceStateWithVersion(ctx, scope, cols, rows, terminalScrollback)
	return state, err
}

func requestAgentWorkspaceRestore(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int, document WorkspaceRecoveryDocument) (WorkspaceState, error) {
	response, err := requestPersistentAgent(ctx, scope, AgentRequest{
		Type:               "action",
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
		Action: &WorkspaceActionRequest{
			Action:   "restore_workspace",
			Recovery: &document,
		},
	})
	if err != nil {
		return WorkspaceState{}, err
	}
	if !supportsWorkspaceRecovery(response.Version) {
		return WorkspaceState{}, &unsupportedAgentProtocolError{version: response.Version}
	}
	if response.State == nil {
		return WorkspaceState{}, errors.New("agent returned empty restored workspace state")
	}
	applyAgentWorkspaceCapabilities(response.State, response.Version)
	return *response.State, nil
}

func requestAgentWorkspaceActionWithVersion(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int, action WorkspaceActionRequest) (WorkspaceState, string, error) {
	response, err := requestPersistentAgent(ctx, scope, AgentRequest{
		Type:               "action",
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
		Action:             &action,
	})
	if err != nil {
		return WorkspaceState{}, "", err
	}
	if response.State == nil {
		return WorkspaceState{}, response.Version, errors.New("agent returned empty workspace state")
	}
	applyAgentWorkspaceCapabilities(response.State, response.Version)
	return *response.State, response.Version, nil

}

func requestAgentWorkspaceAction(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int, action WorkspaceActionRequest) (WorkspaceState, error) {
	state, _, err := requestAgentWorkspaceActionWithVersion(ctx, scope, cols, rows, terminalScrollback, action)
	return state, err
}

func requestAgentWorkspaceActivity(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int) (WorkspaceActivityState, error) {
	response, err := requestPersistentAgent(ctx, scope, AgentRequest{
		Type:               "activity",
		Cols:               cols,
		Rows:               rows,
		TerminalScrollback: terminalScrollback,
	})
	if err != nil {
		return WorkspaceActivityState{}, err
	}
	if response.Activity == nil {
		return WorkspaceActivityState{}, errors.New("agent returned empty activity state")
	}
	return *response.Activity, nil
}

func requestPersistentAgent(ctx context.Context, scope AgentScope, request AgentRequest) (AgentResponse, error) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	username, err := ensurePersistentAgent(ctx, scope)
	if err != nil {
		return AgentResponse{}, err
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
		return AgentResponse{}, err
	}
	request.Username = username
	return runPersistentAgentRequest(ctx, scope, request)
}

func rememberPersistentAgentStartupError(scope AgentScope, message string) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	message = strings.TrimSpace(message)
	if scope.Selector == "" || scope.AccountID == "" || message == "" {
		return
	}
	persistentAgentCache.Lock()
	persistentAgentCache.startupErrors[scope.CacheKey()] = message
	persistentAgentCache.Unlock()
}

func clearPersistentAgentStartupError(scope AgentScope) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	if scope.Selector == "" || scope.AccountID == "" {
		return
	}
	persistentAgentCache.Lock()
	delete(persistentAgentCache.startupErrors, scope.CacheKey())
	persistentAgentCache.Unlock()
}

func latestPersistentAgentStartupError(scope AgentScope) string {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	persistentAgentCache.Lock()
	message := persistentAgentCache.startupErrors[scope.CacheKey()]
	persistentAgentCache.Unlock()
	return strings.TrimSpace(message)
}

func rememberPersistentAgentNotice(scope AgentScope, message string) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	message = strings.TrimSpace(message)
	if scope.Selector == "" || scope.AccountID == "" || message == "" {
		return
	}
	persistentAgentCache.Lock()
	persistentAgentCache.notices[scope.CacheKey()] = message
	persistentAgentCache.Unlock()
}

func consumePersistentAgentNotice(scope AgentScope) string {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	if scope.Selector == "" || scope.AccountID == "" {
		return ""
	}
	persistentAgentCache.Lock()
	defer persistentAgentCache.Unlock()
	message := strings.TrimSpace(persistentAgentCache.notices[scope.CacheKey()])
	delete(persistentAgentCache.notices, scope.CacheKey())
	return message
}

func runPersistentAgentRequest(ctx context.Context, scope AgentScope, request AgentRequest) (AgentResponse, error) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	data, err := json.Marshal(request)
	if err != nil {
		return AgentResponse{}, err
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", scope.Selector, agentInstallPath, "agent", "request", "--socket", scopedAgentSocketPath(scope), "--request", encoded).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return AgentResponse{}, err
		}
		return AgentResponse{}, fmt.Errorf("%w: %s", err, text)
	}
	return parsePersistentAgentResponse(output)
}

func parsePersistentAgentResponse(output []byte) (AgentResponse, error) {
	trimmed := bytes.TrimSpace(output)
	if len(trimmed) == 0 {
		return AgentResponse{}, errors.New("agent returned an empty response")
	}
	var response AgentResponse
	if err := json.Unmarshal(trimmed, &response); err != nil {
		return AgentResponse{}, fmt.Errorf("invalid agent response: %w: output=%s", err, commandOutputSnippet(output))
	}
	version := strings.TrimSpace(response.Version)
	if version == "" {
		version = unknownAgentProtocolVersion
	}
	if !isAttachCompatibleAgentProtocolVersion(version) {
		return AgentResponse{}, &unsupportedAgentProtocolError{version: version}
	}
	if !response.OK {
		if response.Error == "" {
			response.Error = "agent request failed"
		}
		return response, errors.New(response.Error)
	}
	return response, nil
}

func ensurePersistentAgent(ctx context.Context, scope AgentScope) (string, error) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
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
	username, err := persistentAgentEnsures.do(ctx, scope.CacheKey(), func(sharedCtx context.Context) (string, error) {
		return ensurePersistentAgentOnce(sharedCtx, scope)
	})
	log.Printf("persistent agent ensure complete: scope=%s duration_ms=%d success=%t", scope.Selector, time.Since(startedAt).Milliseconds(), err == nil)
	return username, err
}

func ensurePersistentAgentOnce(ctx context.Context, scope AgentScope) (string, error) {
	lifecycle := persistentAgentLifecycleLock(scope)
	lifecycle.RLock()
	defer lifecycle.RUnlock()
	if err := ctx.Err(); err != nil {
		return "", err
	}
	trace := newPersistentAgentStartupTrace(scope)
	trace.add("ensure started")
	cacheKey := scope.CacheKey()
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
			trace.add("compatible agent protocol %s remains active until explicit update to %s", preInstallResponse.Version, AgentProtocolVersion)
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

func markPersistentAgentNotRunning(scope AgentScope) {
	persistentAgentCache.Lock()
	delete(persistentAgentCache.running, scope.CacheKey())
	persistentAgentCache.Unlock()
}

func markPersistentAgentRunning(scope AgentScope) {
	persistentAgentCache.Lock()
	persistentAgentCache.running[scope.CacheKey()] = true
	persistentAgentCache.Unlock()
}

func persistentAgentRunningCached(scope AgentScope) bool {
	persistentAgentCache.Lock()
	running := persistentAgentCache.running[scope.CacheKey()]
	persistentAgentCache.Unlock()
	return running
}

func rememberIncompatiblePersistentAgentNotice(scope AgentScope, err error) {
	if !isUnsupportedAgentProtocolError(err) {
		return
	}
	rememberPersistentAgentNotice(scope, "检测到终端服务协议待更新，请在终端右上角查看详情。")
}

func ensureAgentBinaryInstalled(ctx context.Context, scope AgentScope, trace *persistentAgentStartupTrace) (string, error) {
	payload, manifest, err := cachedAgentRuntimeArchive()
	if err != nil {
		return "", err
	}
	expectedHash, err := agentManifestSHA256(manifest)
	if err != nil {
		return "", err
	}
	trace.add("agent archive ready: manifest=%s payload_bytes=%d", manifest, len(payload))
	cacheKey := scope.CacheKey()
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
		"agent=" + ShellScriptQuote(agentInstallPath),
		"manifest_path=" + ShellScriptQuote(agentManifestPath),
		"expected=" + ShellScriptQuote(manifest),
		"expected_hash=" + ShellScriptQuote(expectedHash),
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
		"  printf '%s\\n' " + ShellScriptQuote(agentReadyMarker),
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
		return "printf '%s\\n' " + ShellScriptQuote(err.Error()) + " >&2; exit 1"
	}
	return strings.Join([]string{
		"set -eu",
		"agent=" + ShellScriptQuote(installPath),
		"manifest_path=" + ShellScriptQuote(manifestPath),
		"expected=" + ShellScriptQuote(manifest),
		"expected_hash=" + ShellScriptQuote(expectedHash),
		"stage_parent=" + ShellScriptQuote(installDir),
		"agent_archive_path=" + ShellScriptQuote(filepath.ToSlash(agentArchivePath)),
		"manifest_archive_path=" + ShellScriptQuote(filepath.ToSlash(manifestArchivePath)),
		"mkdir -p \"$stage_parent\" " + ShellScriptQuote(manifestDir),
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
		"printf '%s\\n' " + ShellScriptQuote(agentReadyMarker),
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

func pingPersistentAgent(ctx context.Context, scope AgentScope) bool {
	return pingPersistentAgentError(ctx, scope) == nil
}

func pingPersistentAgentResponse(ctx context.Context, scope AgentScope) (AgentResponse, error) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	startedAt := time.Now()
	log.Printf("persistent agent ping start: scope=%s", scope.Selector)
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	response, err := runPersistentAgentRequest(ctx, scope, AgentRequest{Type: "ping", Selector: scope.Selector, AccountID: scope.AccountID})
	log.Printf("persistent agent ping complete: scope=%s duration_ms=%d success=%t", scope.Selector, time.Since(startedAt).Milliseconds(), err == nil)
	return response, err
}

func pingPersistentAgentError(ctx context.Context, scope AgentScope) error {
	_, err := pingPersistentAgentResponse(ctx, scope)
	return err
}

func reconcilePersistentAgentDaemons(ctx context.Context, scope AgentScope, replaceActive bool, trace *persistentAgentStartupTrace) error {
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
	if len(fields) != 2 || fields[0] != AgentReconcileMarker {
		return fmt.Errorf("agent daemon reconciliation did not complete: output=%q", strings.TrimSpace(string(output)))
	}
	count, err := strconv.Atoi(fields[1])
	if err != nil || count < 0 {
		return fmt.Errorf("invalid agent daemon reconciliation count: output=%q", strings.TrimSpace(string(output)))
	}
	trace.add("%s removed %d process(es)", stage, count)
	return nil
}

func startPersistentAgent(ctx context.Context, scope AgentScope, username string, trace *persistentAgentStartupTrace) error {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
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
`, ShellScriptQuote(agentInstallPath), ShellScriptQuote(socketPath), ShellScriptQuote(logPath), ShellScriptQuote(agentReadyMarker), ShellScriptQuote(scope.Selector), ShellScriptQuote(scope.AccountID), ShellScriptQuote(username), ShellScriptQuote(scope.Selector), ShellScriptQuote(scope.AccountID), ShellScriptQuote(username), ShellScriptQuote(agentReadyMarker))
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

func persistentAgentStartupTimeoutError(ctx context.Context, scope AgentScope, trace *persistentAgentStartupTrace) error {
	snippet := readPersistentAgentLogTail(ctx, scope, 80)
	if strings.TrimSpace(snippet) == "" {
		trace.add("agent log tail: <empty>")
	} else {
		trace.add("agent log tail:\n%s", snippet)
	}
	message := fmt.Sprintf("persistent webshell agent did not become ready: selector=%s account=%s socket=%s log=%s", scope.Selector, scope.AccountID, scopedAgentSocketPath(scope), scopedAgentLogPath(scope))
	return trace.errorf("%s", message)
}

func readPersistentAgentLogTail(ctx context.Context, scope AgentScope, lines int) string {
	if lines <= 0 {
		lines = 80
	}
	logPath := scopedAgentLogPath(scope)
	script := "tail -n " + strconv.Itoa(lines) + " " + ShellScriptQuote(logPath) + " 2>/dev/null || true"
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
		Error: latestPersistentAgentStartupError(NormalizeAgentScope(selector, accountID)),
	})
}

func (s *pluginServer) attachAgentPane(w http.ResponseWriter, r *http.Request, scope AgentScope, paneID string, cols, rows, terminalScrollback int, syncRequest HistorySyncRequest) error {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
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
	conn.SetReadLimit(WebsocketReadLimit)

	var writeMu sync.Mutex
	var writeJSON = func(payload any) error {
		return writeWebSocketJSONLocked(conn, &writeMu, payload)
	}
	var stopServerLogs func()
	if Enabled(r.URL.Query().Get("server_logs")) {
		stopServerLogs = StartForwarder(writeJSON, ParseAfter(r.URL.Query().Get("server_log_after")), ParseSince(r.URL.Query().Get("server_log_since_ms")))
		defer stopServerLogs()
	}
	_ = writeJSON(map[string]any{
		"type":           "agent-preparing",
		"server_unix_ms": time.Now().UnixMilli(),
	})

	if _, err := ensurePersistentAgent(r.Context(), scope); err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, AgentConnectionErrorPayload(err))
		return nil
	}
	if err := pingPersistentAgentError(r.Context(), scope); err != nil {
		log.Printf("persistent webshell agent ping before attach failed: scope=%s account=%s err=%v", scope.Selector, scope.AccountID, err)
		rememberIncompatiblePersistentAgentNotice(scope, err)
		markPersistentAgentNotRunning(scope)
		if _, ensureErr := ensurePersistentAgent(r.Context(), scope); ensureErr != nil {
			_ = writeWebSocketJSONLocked(conn, &writeMu, AgentConnectionErrorPayload(ensureErr))
			return nil
		}
	}
	attachCtx, cancelAttach := context.WithCancel(context.Background())
	defer cancelAttach()
	command := exec.CommandContext(attachCtx, lightosctlPath, persistentAgentAttachCommandArgs(scope, paneID, cols, rows, terminalScrollback, syncRequest)...)
	stdout, err := command.StdoutPipe()
	if err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, AgentConnectionErrorPayload(err))
		return nil
	}
	stdin, err := command.StdinPipe()
	if err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, AgentConnectionErrorPayload(err))
		return nil
	}
	var stderr bytes.Buffer
	stderrLog := serverlog.NewWriter(fmt.Sprintf("lightosctl pane=%s", paneID))
	stderrCapture := io.MultiWriter(&stderr, stderrLog)
	command.Stderr = stderrCapture
	if err := command.Start(); err != nil {
		_ = writeWebSocketJSONLocked(conn, &writeMu, AgentConnectionErrorPayload(err))
		return nil
	}
	if foreground, background, cursor := terminalThemeFromRequest(r); foreground != "" || background != "" || cursor != "" {
		themeMessage := TerminalControlMessage{Type: "theme", Foreground: foreground, Background: background, Cursor: cursor}
		if payload, err := json.Marshal(themeMessage); err == nil {
			_ = WriteAgentFrame(stdin, AgentFrameResize, payload)
		}
	}
	waitDone := make(chan error, 1)
	go func() {
		err := command.Wait()
		stderrLog.Flush()
		waitDone <- err
	}()
	var stopOnce sync.Once
	stopAttach := func() {
		stopOnce.Do(func() {
			_ = WriteAgentFrame(stdin, AgentFrameDetach, nil)
			_ = stdin.Close()
			cancelAttach()
		})
	}
	defer func() {
		stopAttach()
		select {
		case <-waitDone:
		case <-time.After(2 * time.Second):
			_ = KillCommand(command)
			<-waitDone
		}
	}()

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		for {
			frameType, payload, err := ReadAgentFrame(stdout)
			if err != nil {
				if text := strings.TrimSpace(stderr.String()); text != "" {
					if IsPaneNotFoundAttachError(text) {
						_ = writeWebSocketJSONLocked(conn, &writeMu, map[string]any{
							"type":     "workspace-refresh-required",
							"selector": scope.Selector,
							"reason":   text,
						})
					} else {
						markPersistentAgentNotRunning(scope)
						_ = writeWebSocketJSONLocked(conn, &writeMu, AgentConnectionErrorPayload(errors.New(text)))
					}
				}
				_ = conn.Close()
				return
			}
			messageType := websocket.BinaryMessage
			if frameType == AgentFrameText {
				messageType = websocket.TextMessage
				core.LogCheckpointDiagnostic(scope, paneID, payload)
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
				_ = WriteAgentFrame(stdin, AgentFrameInput, payload)
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

func persistentAgentAttachCommandArgs(scope AgentScope, paneID string, cols, rows, terminalScrollback int, syncRequest HistorySyncRequest) []string {
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
		strconv.Itoa(NormalizeCols(cols)),
		"--rows",
		strconv.Itoa(NormalizeRows(rows)),
		"--terminal-scrollback",
		strconv.Itoa(terminalScrollback),
	}
	if syncRequest.WorkspaceGeneration != "" {
		commandArgs = append(commandArgs, "--workspace-generation", syncRequest.WorkspaceGeneration)
	}
	if syncRequest.Generation != "" {
		commandArgs = append(commandArgs, "--history-generation", syncRequest.Generation)
	}
	if syncRequest.HasRange {
		commandArgs = append(commandArgs,
			"--local-base-cursor", strconv.FormatUint(syncRequest.LocalBase, 10),
			"--local-end-cursor", strconv.FormatUint(syncRequest.LocalEnd, 10),
		)
	}
	if syncRequest.ForceSnapshot {
		commandArgs = append(commandArgs, "--history-replay-mode", "snapshot")
	}
	if syncRequest.IntegrityProtocol != "" {
		commandArgs = append(commandArgs, "--integrity-protocol", syncRequest.IntegrityProtocol)
	}
	if syncRequest.CheckpointProtocol == TerminalMemoryCheckpointProtocol {
		// v39/v40 share the initialized-page WASM fingerprint. Earlier agents remain
		// wire-compatible but must replay bytes instead of exporting an incompatible heap.
		quoted := make([]string, 0, len(commandArgs)-3)
		for _, arg := range commandArgs[3:] {
			quoted = append(quoted, ShellScriptQuote(arg))
		}
		script := "set -- " + strings.Join(quoted, " ") + "\n" +
			"case \"$(" + ShellScriptQuote(agentInstallPath) + " agent version)\" in\n" +
			ShellScriptQuote(AgentProtocolVersion) + "|lcmd-webshell-agent-v39)\n" +
			"set -- \"$@\" --checkpoint-protocol " + ShellScriptQuote(TerminalMemoryCheckpointProtocol) + "\n;;\nesac\nexec \"$@\""
		return []string{"exec", "-i", scope.Selector, "/bin/sh", "-c", script}
	}
	return commandArgs
}

func handleAgentAttachControlMessage(conn *websocket.Conn, writeMu *sync.Mutex, stdin io.Writer, payload []byte) bool {
	var message TerminalControlMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		if data, ok := strings.CutPrefix(string(payload), "input:"); ok {
			_ = WriteAgentFrame(stdin, AgentFrameInput, []byte(data))
		}
		return true
	}
	switch message.Type {
	case "input":
		if message.Data != "" {
			if message.Foreground != "" || message.Background != "" || message.Cursor != "" {
				themeMessage := TerminalControlMessage{Type: "theme", Foreground: message.Foreground, Background: message.Background, Cursor: message.Cursor}
				if payload, err := json.Marshal(themeMessage); err == nil {
					_ = WriteAgentFrame(stdin, AgentFrameResize, payload)
				}
			}
			frameType := AgentFrameInput
			if message.Generated {
				frameType = AgentFrameGeneratedInput
			} else if message.Cols > 0 && message.Rows > 0 {
				resizeMessage := TerminalControlMessage{
					Type:        "resize",
					Cols:        message.Cols,
					Rows:        message.Rows,
					PixelWidth:  message.PixelWidth,
					PixelHeight: message.PixelHeight,
					ResizeEpoch: message.ResizeEpoch,
				}
				if payload, err := json.Marshal(resizeMessage); err == nil {
					_ = WriteAgentFrame(stdin, AgentFrameResize, payload)
				}
			}
			_ = WriteAgentFrame(stdin, frameType, []byte(message.Data))
		}
	case "resize":
		if message.Cols > 0 && message.Rows > 0 {
			data, _ := json.Marshal(message)
			_ = WriteAgentFrame(stdin, AgentFrameResize, data)
		}
	case "theme":
		data, _ := json.Marshal(message)
		_ = WriteAgentFrame(stdin, AgentFrameResize, data)
	case "input_lock":
		// Compatibility no-op for older pages during rolling upgrades.
	case "ping":
		_ = writeWebSocketJSONLocked(conn, writeMu, map[string]any{"type": "pong"})
	case "detach":
		_ = WriteAgentFrame(stdin, AgentFrameDetach, nil)
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
