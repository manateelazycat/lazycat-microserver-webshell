package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"lcmd-webshell/internal/pkg/fonts"

	"github.com/gorilla/websocket"
)

type pluginServer struct {
	rootDir                string
	fontDir                string
	serverRevision         string
	workspaces             *workspaceManager
	adminInfoResolver      func(context.Context) (adminInfo, error)
	instancesResolver      func(context.Context) ([]instanceSummary, error)
	deployUIDResolver      func() string
	publishHTTPClient      *http.Client
	attachmentBackend      attachmentUploadBackend
	attachmentFilesBackend attachmentFileBackend

	settingsMu   sync.Mutex
	inputLocksMu sync.Mutex
	inputLocks   map[string]map[string]time.Time
	devicesMu    sync.Mutex
	devices      map[string]webshellDeviceRecord
	deviceNow    func() time.Time
}

type instanceSummary struct {
	Selector      string `json:"selector,omitempty"`
	Name          string `json:"name"`
	OwnerDeployID string `json:"owner_deploy_id"`
	Status        string `json:"status"`
	Username      string `json:"username,omitempty"`
}

type adminInfo struct {
	DeployID string `json:"deploy_id"`
	Domain   string `json:"domain"`
	BaseURL  string `json:"base_url"`
}

type serverRevisionInfo struct {
	ServerRevision string `json:"server_revision"`
	ReloadRequired bool   `json:"reload_required,omitempty"`
}

type agentStartupErrorResponse struct {
	Error string `json:"error"`
}

type apiErrorResponse struct {
	Error string `json:"error"`
}

type clientInstanceSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Platform    string `json:"platform"`
	Status      string `json:"status"`
	OwnerUserID string `json:"owner_user_id"`
	WebshellURL string `json:"webshell_url"`
}

const lightOSUserIDHeader = "X-HC-USER-ID"
const lightOSRequireCookieAuthEnv = "LIGHTOS_REQUIRE_COOKIE_AUTH"
const lazyCatAppDeployUIDEnv = "LAZYCAT_APP_DEPLOY_UID"
const lazyCatDeployUIDEnv = "LAZYCAT_DEPLOY_UID"
const lazyCatUserIDEnv = "LAZYCAT_USER_ID"
const lazyCatUserUIDEnv = "LAZYCAT_USER_UID"
const lazyCatAppDeployIDEnv = "LAZYCAT_APP_DEPLOY_ID"
const lazyCatDeployIDEnv = "LAZYCAT_DEPLOY_ID"
const lazyCatAppIDEnv = "LAZYCAT_APP_ID"
const lightOSAdminInternalBaseURLEnv = "LIGHTOS_ADMIN_INTERNAL_BASE_URL"
const lightOSAdminAppID = "cloud.lazycat.lightos.entry"
const defaultLightOSAdminInternalBaseURL = "http://127.0.0.1:18081"
const serverRevisionInputLockTTL = 60 * time.Second
const webshellDeviceTTL = 1500 * time.Millisecond

var errInstanceForbidden = errors.New("instance is not accessible by current account")
var errInvalidPublishCreatePayload = errors.New("invalid publish create payload")
var errClientTerminalProxyUnavailable = errors.New("client terminal proxy is not available yet")

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const lightosctlPath = "/lzcinit/lightosctl"

var allowedPublishProxyRoutes = map[string]string{
	"/api/publish/list":                   http.MethodGet,
	"/api/publish/status":                 http.MethodGet,
	"/api/publish/http/create":            http.MethodPost,
	"/api/publish/http/update":            http.MethodPost,
	"/api/publish/http/delete":            http.MethodPost,
	"/api/publish/http/install-shell-lpk": http.MethodPost,
}

func main() {
	if handleAgentCommand(os.Args[1:]) {
		return
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	rootDir := resolvePluginRoot()
	server := &pluginServer{
		rootDir:        rootDir,
		fontDir:        fonts.ResolveDir(rootDir),
		serverRevision: computeServerRevision(rootDir),
		workspaces:     newWorkspaceManager(rootDir),
	}
	if err := server.run(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func resolvePluginRoot() string {
	exe, err := os.Executable()
	if err == nil {
		root := filepath.Dir(exe)
		if _, statErr := os.Stat(filepath.Join(root, "runtime", "static", "index.html")); statErr == nil {
			return root
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}
	return "."
}

func computeServerRevision(rootDir string) string {
	hash := sha256.New()
	if exe, err := os.Executable(); err == nil {
		if data, readErr := os.ReadFile(exe); readErr == nil {
			_, _ = hash.Write([]byte("exe\x00"))
			_, _ = hash.Write(data)
			_, _ = hash.Write([]byte{0})
		}
	}

	staticRoot := filepath.Join(rootDir, "runtime")
	var paths []string
	_ = filepath.WalkDir(staticRoot, func(path string, entry fs.DirEntry, err error) error {
		if err == nil && entry != nil && !entry.IsDir() {
			paths = append(paths, path)
		}
		return nil
	})
	sort.Strings(paths)
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		rel, err := filepath.Rel(rootDir, path)
		if err != nil {
			rel = path
		}
		_, _ = hash.Write([]byte(filepath.ToSlash(rel)))
		_, _ = hash.Write([]byte{0})
		_, _ = hash.Write(data)
		_, _ = hash.Write([]byte{0})
	}
	contentRevision := hex.EncodeToString(hash.Sum(nil))
	startEpoch := strconv.FormatInt(time.Now().UnixNano(), 36)
	return contentRevision + ":" + startEpoch + ":" + strconv.Itoa(os.Getpid())
}

func (s *pluginServer) run(ctx context.Context) error {
	if s.workspaces == nil {
		s.workspaces = newWorkspaceManager(s.rootDir)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:8080")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/instances", s.handleInstances)
	mux.HandleFunc("/api/lightos-admin-info", s.handleLightOSAdminInfo)
	mux.HandleFunc("/api/publish/", s.handlePublishProxy)
	mux.HandleFunc("/api/server-revision", s.handleServerRevision)
	mux.HandleFunc("/api/devices", s.handleDevices)
	mux.HandleFunc("/api/devices/heartbeat", s.handleDeviceHeartbeat)
	mux.HandleFunc("/api/devices/offline", s.handleDeviceOffline)
	mux.HandleFunc("/api/settings", s.handleSettings)
	mux.HandleFunc("/api/settings/fonts", s.handleSettingsFonts)
	mux.HandleFunc("/api/settings/fonts/", s.handleSettingsFont)
	mux.HandleFunc("/api/attachments", s.handleAttachments)
	mux.HandleFunc("/api/attachments/files", s.handleAttachmentFiles)
	mux.HandleFunc("/api/attachments/download", s.handleAttachmentDownload)
	mux.HandleFunc("/api/workspace", s.handleWorkspace)
	mux.HandleFunc("/api/workspace/activity", s.handleWorkspaceActivity)
	mux.HandleFunc("/api/agent/startup-error", s.handleAgentStartupError)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.Handle("/static/", http.StripPrefix("/static/", staticFileServer(filepath.Join(s.rootDir, "runtime", "static"))))

	return s.serveHTTP(ctx, listener, mux)
}

func staticFileServer(root string) http.Handler {
	files := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ext := filepath.Ext(r.URL.Path)
		switch ext {
		case ".html":
			w.Header().Set("Cache-Control", "no-store")
		case ".css", ".js", ".json", ".wasm":
			w.Header().Set("Cache-Control", "no-cache")
		}
		switch ext {
		case ".wasm":
			w.Header().Set("Content-Type", "application/wasm")
		case ".js":
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		}
		files.ServeHTTP(w, r)
	})
}

func (s *pluginServer) serveHTTP(ctx context.Context, listener net.Listener, mux http.Handler) error {
	httpServer := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		errCh <- httpServer.Serve(listener)
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		return err
	}
}

func (s *pluginServer) handleIndex(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/", "":
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, filepath.Join(s.rootDir, "runtime", "static", "index.html"))
	default:
		http.NotFound(w, r)
	}
}

func (s *pluginServer) handleInstances(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	items, err := s.listRequestVisibleInstances(r.Context(), r.Header, accountID)
	if err != nil {
		writeAuthorizationError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(items); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *pluginServer) handleLightOSAdminInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	info, err := s.resolveLightOSAdminInfo(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *pluginServer) handlePublishProxy(w http.ResponseWriter, r *http.Request) {
	expectedMethod, ok := allowedPublishProxyRoutes[r.URL.Path]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if r.Method != expectedMethod {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if err := s.authorizePublishProxyRequest(r); err != nil {
		writeAuthorizationError(w, err)
		return
	}

	info, err := s.resolveLightOSAdminInfo(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	targetURL, err := buildLightOSAdminURL(resolvePublishProxyLightOSAdminBaseURL(info), r.URL)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	request, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	request.ContentLength = r.ContentLength
	copyPublishProxyRequestHeaders(request.Header, r.Header)
	setPublishProxyAuthHeaders(request.Header, r.Header, accountID)

	response, err := s.publishClient().Do(request)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	defer response.Body.Close()

	copyPublishProxyResponseHeaders(w.Header(), response.Header)
	w.WriteHeader(response.StatusCode)
	if _, err := io.Copy(w, response.Body); err != nil {
		log.Printf("publish proxy response copy failed: %v", err)
	}
}

func (s *pluginServer) handleServerRevision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	info := serverRevisionInfo{ServerRevision: s.serverRevision}
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	accountID := currentRequestAccountID(r)
	clientID := strings.TrimSpace(r.URL.Query().Get("client_id"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.URL.Query().Get("client"))
	}
	if selector != "" && clientID != "" {
		if accountID == "" {
			http.Error(w, "account id is required", http.StatusUnauthorized)
			return
		}
		if isClientTarget(selector) {
			if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
				writeAuthorizationError(w, err)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			writeJSON(w, info)
			return
		}
		if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
			writeAuthorizationError(w, err)
			return
		}
		scope := normalizeAgentScope(selector, accountID)
		if blockedText := strings.TrimSpace(r.URL.Query().Get("terminal_input_blocked")); blockedText != "" {
			s.setTerminalInputBlocked(scope, serverRevisionInputLockOwner(clientID), parseBoolQuery(blockedText))
			w.Header().Set("Cache-Control", "no-store")
			writeJSON(w, info)
			return
		}
		changed, err := observeServerRevisionState(r.Context(), scope, clientID, s.serverRevision)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		info.ReloadRequired = changed
		if changed {
			s.setTerminalInputBlocked(scope, serverRevisionInputLockOwner(clientID), true)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, info)
}

func serverRevisionInputLockOwner(clientID string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(clientID)))
	return "server-revision:" + hex.EncodeToString(sum[:])
}

func parseBoolQuery(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on", "blocked", "lock", "locked":
		return true
	default:
		return false
	}
}

func currentRequestAccountID(r *http.Request) string {
	if r == nil {
		return ""
	}
	if accountID := strings.TrimSpace(r.Header.Get(lightOSUserIDHeader)); accountID != "" {
		return accountID
	}
	if lightOSCookieAuthRequired() {
		return ""
	}
	return currentDeployUIDFromEnv()
}

func lightOSCookieAuthRequired() bool {
	switch strings.ToLower(lightOSConfigValue(lightOSRequireCookieAuthEnv)) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func currentDeployUIDFromEnv() string {
	for _, name := range []string{
		lazyCatAppDeployUIDEnv,
		lazyCatDeployUIDEnv,
		lazyCatUserIDEnv,
		lazyCatUserUIDEnv,
		lazyCatAppDeployIDEnv,
		lazyCatDeployIDEnv,
		lazyCatAppIDEnv,
	} {
		if uid := strings.TrimSpace(os.Getenv(name)); uid != "" {
			return uid
		}
	}
	return ""
}

func lightOSConfigValue(name string) string {
	if value, ok := os.LookupEnv(name); ok {
		return strings.TrimSpace(value)
	}
	for _, filename := range lightOSConfigEnvFiles() {
		if value, ok := readLightOSConfigFileValue(filename, name); ok {
			return value
		}
	}
	return ""
}

func lightOSConfigEnvFiles() []string {
	files := []string{"/lzcapp/pkg/content/.env", "/lzcapp/run/.env"}
	if exe, err := os.Executable(); err == nil {
		files = append(files, filepath.Join(filepath.Dir(exe), ".env"))
	}
	if cwd, err := os.Getwd(); err == nil {
		files = append(files, filepath.Join(cwd, ".env"))
	}
	return files
}

func readLightOSConfigFileValue(filename, name string) (string, bool) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return "", false
	}
	prefix := name + "="
	exportPrefix := "export " + prefix
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		switch {
		case strings.HasPrefix(line, prefix):
			return unquoteLightOSConfigValue(strings.TrimSpace(strings.TrimPrefix(line, prefix))), true
		case strings.HasPrefix(line, exportPrefix):
			return unquoteLightOSConfigValue(strings.TrimSpace(strings.TrimPrefix(line, exportPrefix))), true
		}
	}
	return "", false
}

func unquoteLightOSConfigValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 {
		quote := value[0]
		if (quote == '"' || quote == '\'') && value[len(value)-1] == quote {
			return strings.TrimSpace(value[1 : len(value)-1])
		}
	}
	return value
}

func writeAuthorizationError(w http.ResponseWriter, err error) {
	switch {
	case err == nil:
		return
	case errors.Is(err, errInstanceForbidden):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, errClientTerminalProxyUnavailable):
		http.Error(w, err.Error(), http.StatusNotImplemented)
	case strings.Contains(err.Error(), "account id is required"):
		http.Error(w, err.Error(), http.StatusUnauthorized)
	case strings.Contains(err.Error(), "deploy uid is required"):
		http.Error(w, err.Error(), http.StatusUnauthorized)
	case strings.Contains(err.Error(), "invalid instance selector"):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case strings.Contains(err.Error(), "invalid client target"):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, errInvalidPublishCreatePayload):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusBadGateway)
	}
}

func (s *pluginServer) setTerminalInputBlocked(scope agentScope, owner string, blocked bool) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	owner = strings.TrimSpace(owner)
	if scope.Selector == "" || scope.AccountID == "" || owner == "" {
		return
	}
	key := scope.cacheKey()
	s.inputLocksMu.Lock()
	defer s.inputLocksMu.Unlock()
	if blocked {
		if s.inputLocks == nil {
			s.inputLocks = make(map[string]map[string]time.Time)
		}
		if s.inputLocks[key] == nil {
			s.inputLocks[key] = make(map[string]time.Time)
		}
		s.inputLocks[key][owner] = time.Now().Add(serverRevisionInputLockTTL)
		log.Printf("terminal input lock set: scope=%s owner=%s ttl=%s", scope.Selector, owner, serverRevisionInputLockTTL)
		return
	}
	if s.inputLocks == nil || s.inputLocks[key] == nil {
		return
	}
	if _, ok := s.inputLocks[key][owner]; ok {
		delete(s.inputLocks[key], owner)
		log.Printf("terminal input lock cleared: scope=%s owner=%s", scope.Selector, owner)
	}
	if len(s.inputLocks[key]) == 0 {
		delete(s.inputLocks, key)
	}
}

func (s *pluginServer) expireTerminalInputLocksLocked(scope agentScope, key string, now time.Time) {
	if s.inputLocks == nil || s.inputLocks[key] == nil {
		return
	}
	for owner, expiresAt := range s.inputLocks[key] {
		if !expiresAt.IsZero() && !expiresAt.After(now) {
			delete(s.inputLocks[key], owner)
			log.Printf("terminal input lock expired: scope=%s owner=%s", scope.Selector, owner)
		}
	}
	if len(s.inputLocks[key]) == 0 {
		delete(s.inputLocks, key)
	}
}

func (s *pluginServer) terminalInputBlocked(scope agentScope, clientID string) bool {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	s.inputLocksMu.Lock()
	defer s.inputLocksMu.Unlock()
	key := scope.cacheKey()
	s.expireTerminalInputLocksLocked(scope, key, time.Now())
	locks := s.inputLocks[key]
	if len(locks) == 0 {
		return false
	}
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return true
	}
	_, blocked := locks[serverRevisionInputLockOwner(clientID)]
	return blocked
}

func observeServerRevisionState(ctx context.Context, scope agentScope, clientID, revision string) (bool, error) {
	scope = normalizeAgentScope(scope.Selector, scope.AccountID)
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return false, err
	}
	if scope.AccountID == "" {
		return false, errors.New("account id is required")
	}
	sum := sha256.Sum256([]byte(scope.cacheKey() + "\x00" + strings.TrimSpace(clientID)))
	key := hex.EncodeToString(sum[:])
	script := strings.Join([]string{
		"set -eu",
		"dir=/tmp/lcmd-webshell-server-revision",
		"file=\"$dir\"/" + shellScriptQuote(key),
		"current=" + shellScriptQuote(revision),
		"mkdir -p \"$dir\"",
		"previous=\"$(cat \"$file\" 2>/dev/null || true)\"",
		"if [ \"$previous\" = \"$current\" ]; then printf '%s\\n' unchanged; exit 0; fi",
		"printf '%s\\n' \"$current\" > \"$file\"",
		"if [ -n \"$previous\" ]; then printf '%s\\n' changed; else printf '%s\\n' initialized; fi",
	}, "\n")
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", scope.Selector, "/bin/sh", "-lc", script).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return false, err
		}
		return false, fmt.Errorf("%w: %s", err, text)
	}
	return strings.TrimSpace(string(output)) == "changed", nil
}

func (s *pluginServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
	if err := s.attachPersistentPane(w, r, cols, rows); err != nil {
		log.Printf("websocket attach failed: %v", err)
		return
	}
}

func processExitCode(err error) int {
	if err == nil || errors.Is(err, os.ErrProcessDone) {
		return 0
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	return -1
}

func killCommand(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}
	if err := command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	return nil
}

func parseTerminalSize(colsText, rowsText string) (int, int) {
	return parsePositiveInt(colsText), parsePositiveInt(rowsText)
}

func parsePositiveInt(text string) int {
	n, err := strconv.Atoi(strings.TrimSpace(text))
	if err != nil || n <= 0 {
		return 0
	}
	return n
}

func buildShellBootstrapScript(initialCWD string) string {
	return strings.Join([]string{
		buildCurrentUserShellResolveScript(),
		buildTerminalSessionBootstrapScript(initialCWD),
		`exec "$__webshell_shell"`,
	}, "\n")
}

func buildCurrentUserShellResolveScript() string {
	return strings.Join([]string{
		`__webshell_user="$(id -un 2>/dev/null || true)"`,
		`__webshell_entry="$(getent passwd "$__webshell_user" 2>/dev/null || true)"`,
		`__webshell_shell="$(printf '%s\n' "$__webshell_entry" | cut -d: -f7)"`,
		`if [ -z "$__webshell_shell" ]; then __webshell_shell="${SHELL:-/bin/sh}"; fi`,
		`unset __webshell_user __webshell_entry`,
	}, "\n")
}

func buildTerminalSessionBootstrapScript(initialCWD string) string {
	return strings.Join([]string{
		`__webshell_tty="$(tty 2>/dev/null || true)"`,
		`case "$__webshell_tty" in /dev/pts/[0-9]*) printf '\033]777;webshell-tty=%s\a' "$__webshell_tty";; esac`,
		`unset __webshell_tty`,
		"if [ -f /run/catlink/shell-env.sh ]; then . /run/catlink/shell-env.sh; fi",
		`export SHELL="$__webshell_shell"`,
		buildInitialCWDChangeScript(initialCWD),
	}, "\n")
}

func listInstances(ctx context.Context) ([]instanceSummary, error) {
	output, err := exec.CommandContext(ctx, lightosctlPath, "ps").CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return nil, err
		}
		return nil, fmt.Errorf("%w: %s", err, text)
	}
	var items []instanceSummary
	if err := json.Unmarshal(output, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *pluginServer) listInstances(ctx context.Context) ([]instanceSummary, error) {
	if s != nil && s.instancesResolver != nil {
		return s.instancesResolver(ctx)
	}
	return listInstances(ctx)
}

func (s *pluginServer) listRequestVisibleInstances(ctx context.Context, header http.Header, accountID string) ([]instanceSummary, error) {
	if s != nil && s.instancesResolver != nil {
		return s.instancesResolver(ctx)
	}
	items, err := s.listLightOSAdminWebshellInstances(ctx, header, accountID)
	if err != nil {
		return nil, err
	}
	clientItems, err := s.listLightOSAdminClientInstances(ctx, header, accountID)
	if err != nil {
		return nil, err
	}
	items = append(items, clientInstanceSummariesToInstances(clientItems)...)
	return items, nil
}

func (s *pluginServer) listLightOSAdminWebshellInstances(ctx context.Context, header http.Header, accountID string) ([]instanceSummary, error) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return nil, errors.New("account id is required")
	}
	info, err := s.resolveLightOSAdminInfo(ctx)
	if err != nil {
		return nil, err
	}
	targetURL, err := buildLightOSAdminURL(resolvePublishProxyLightOSAdminBaseURL(info), &url.URL{Path: "/api/webshell/instances"})
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	copyPublishProxyRequestHeaders(request.Header, header)
	setPublishProxyAuthHeaders(request.Header, header, accountID)
	request.Header.Set("Accept", "application/json")

	response, err := s.publishClient().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = response.Status
		}
		return nil, errors.New(message)
	}
	var items []instanceSummary
	if err := json.NewDecoder(response.Body).Decode(&items); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *pluginServer) listLightOSAdminClientInstances(ctx context.Context, header http.Header, accountID string) ([]clientInstanceSummary, error) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return nil, errors.New("account id is required")
	}
	info, err := s.resolveLightOSAdminInfo(ctx)
	if err != nil {
		return nil, err
	}
	targetURL, err := buildLightOSAdminURL(resolvePublishProxyLightOSAdminBaseURL(info), &url.URL{Path: "/api/client-instances"})
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	copyPublishProxyRequestHeaders(request.Header, header)
	setPublishProxyAuthHeaders(request.Header, header, accountID)
	request.Header.Set("Accept", "application/json")

	response, err := s.publishClient().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = response.Status
		}
		return nil, errors.New(message)
	}
	var items []clientInstanceSummary
	if err := json.NewDecoder(response.Body).Decode(&items); err != nil {
		return nil, err
	}
	return items, nil
}

func clientInstanceSummariesToInstances(items []clientInstanceSummary) []instanceSummary {
	result := make([]instanceSummary, 0, len(items))
	for _, item := range items {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = "PC Client"
		}
		status := strings.TrimSpace(item.Status)
		if status == "" {
			status = "running"
		}
		result = append(result, instanceSummary{
			Selector: "client:" + id,
			Name:     name,
			Status:   status,
		})
	}
	return result
}

func (s *pluginServer) currentDeployUID() string {
	if s != nil && s.deployUIDResolver != nil {
		return strings.TrimSpace(s.deployUIDResolver())
	}
	return currentDeployUIDFromEnv()
}

func (s *pluginServer) listOwnedInstances(ctx context.Context) ([]instanceSummary, error) {
	items, err := s.listInstances(ctx)
	if err != nil {
		return nil, err
	}
	for _, ownerID := range s.currentOwnerDeployIDs(ctx) {
		filtered := filterInstancesByOwnerDeployID(items, ownerID)
		if len(filtered) > 0 {
			return filtered, nil
		}
	}
	return items, nil
}

func (s *pluginServer) listVisibleInstances(ctx context.Context) ([]instanceSummary, error) {
	return s.listInstances(ctx)
}

func (s *pluginServer) currentOwnerDeployIDs(ctx context.Context) []string {
	var ids []string
	seen := make(map[string]struct{})
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		ids = append(ids, value)
	}
	add(s.currentDeployUID())
	if info, err := s.resolveLightOSAdminInfo(ctx); err == nil {
		add(info.DeployID)
	}
	return ids
}

func filterInstancesByOwnerDeployID(items []instanceSummary, ownerID string) []instanceSummary {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return nil
	}
	filtered := make([]instanceSummary, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item.OwnerDeployID) == ownerID {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func (s *pluginServer) authorizeInstanceSelector(ctx context.Context, selector string) error {
	selector = strings.TrimSpace(selector)
	if err := validateInstanceSelector(selector); err != nil {
		return err
	}
	items, err := s.listVisibleInstances(ctx)
	if err != nil {
		return err
	}
	for _, item := range items {
		if instanceSelector(item) == selector {
			return nil
		}
	}
	return errInstanceForbidden
}

func (s *pluginServer) authorizeClientTarget(ctx context.Context, header http.Header, accountID, target string) error {
	id, err := parseClientTargetID(target)
	if err != nil {
		return err
	}
	items, err := s.listLightOSAdminClientInstances(ctx, header, accountID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if strings.TrimSpace(item.ID) == id {
			return nil
		}
	}
	return errInstanceForbidden
}

func (s *pluginServer) authorizeOwnedInstanceSelector(ctx context.Context, selector string) error {
	selector = strings.TrimSpace(selector)
	if err := validateInstanceSelector(selector); err != nil {
		return err
	}
	items, err := s.listOwnedInstances(ctx)
	if err != nil {
		return err
	}
	for _, item := range items {
		if instanceSelector(item) == selector {
			return nil
		}
	}
	return errInstanceForbidden
}

type publishCreateRequest struct {
	InstanceName string `json:"instance_name"`
}

func (s *pluginServer) authorizePublishProxyRequest(r *http.Request) error {
	if r == nil || r.URL.Path != "/api/publish/http/create" {
		return nil
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		return errors.New("account id is required")
	}
	data, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	_ = r.Body.Close()
	r.Body = io.NopCloser(bytes.NewReader(data))
	r.ContentLength = int64(len(data))

	var payload publishCreateRequest
	if err := json.Unmarshal(data, &payload); err != nil {
		return fmt.Errorf("%w: %v", errInvalidPublishCreatePayload, err)
	}
	return s.authorizeOwnedInstanceSelector(r.Context(), payload.InstanceName)
}

func validateInstanceSelector(value string) error {
	name, ownerDeployID, ok := strings.Cut(strings.TrimSpace(value), "@")
	if !ok || strings.TrimSpace(name) == "" || strings.TrimSpace(ownerDeployID) == "" {
		return errors.New("invalid instance selector")
	}
	return nil
}

func isClientTarget(value string) bool {
	return strings.HasPrefix(strings.TrimSpace(value), "client:")
}

func parseClientTargetID(value string) (string, error) {
	value = strings.TrimSpace(value)
	id, ok := strings.CutPrefix(value, "client:")
	id = strings.TrimSpace(id)
	if !ok || id == "" {
		return "", errors.New("invalid client target")
	}
	return id, nil
}

func instanceSelector(item instanceSummary) string {
	if selector := strings.TrimSpace(item.Selector); selector != "" {
		return selector
	}
	name := strings.TrimSpace(item.Name)
	ownerDeployID := strings.TrimSpace(item.OwnerDeployID)
	if name == "" || ownerDeployID == "" {
		return ""
	}
	return name + "@" + ownerDeployID
}

func resolveInstanceLoginUser(ctx context.Context, selector string) (string, error) {
	if err := validateInstanceSelector(selector); err != nil {
		return "", err
	}
	items, err := listInstances(ctx)
	if err != nil {
		return "", err
	}
	for _, item := range items {
		if instanceSelector(item) == selector {
			return strings.TrimSpace(item.Username), nil
		}
	}
	return "", errors.New("instance not found")
}

func resolveLightOSAdminInfo(ctx context.Context) (adminInfo, error) {
	output, err := exec.CommandContext(ctx, lightosctlPath, "system", "admin-info", "--json").CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return adminInfo{}, err
		}
		return adminInfo{}, fmt.Errorf("%w: %s", err, text)
	}
	var info adminInfo
	if err := json.Unmarshal(output, &info); err != nil {
		return adminInfo{}, err
	}
	info.DeployID = strings.TrimSpace(info.DeployID)
	info.Domain = strings.TrimSpace(info.Domain)
	info.BaseURL = strings.TrimSpace(info.BaseURL)
	if info.BaseURL == "" {
		return adminInfo{}, errors.New("lightos-admin base_url is unavailable")
	}
	if _, err := parseLightOSAdminBaseURL(info.BaseURL); err != nil {
		return adminInfo{}, err
	}
	return info, nil
}

func (s *pluginServer) resolveLightOSAdminInfo(ctx context.Context) (adminInfo, error) {
	if s != nil && s.adminInfoResolver != nil {
		return s.adminInfoResolver(ctx)
	}
	return resolveLightOSAdminInfo(ctx)
}

func parseLightOSAdminBaseURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return nil, err
	}
	if parsed == nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, errors.New("invalid lightos-admin base_url")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("invalid lightos-admin base_url scheme")
	}
	return parsed, nil
}

func buildLightOSAdminURL(baseURL string, requestURL *url.URL) (string, error) {
	base, err := parseLightOSAdminBaseURL(baseURL)
	if err != nil {
		return "", err
	}
	target := *base
	target.Path = joinURLPath(base.Path, requestURL.Path)
	target.RawQuery = requestURL.RawQuery
	target.Fragment = ""
	return target.String(), nil
}

func resolvePublishProxyLightOSAdminBaseURL(info adminInfo) string {
	if value := strings.TrimSpace(lightOSConfigValue(lightOSAdminInternalBaseURLEnv)); value != "" {
		return value
	}
	if strings.TrimSpace(os.Getenv(lazyCatAppIDEnv)) == lightOSAdminAppID {
		return defaultLightOSAdminInternalBaseURL
	}
	return info.BaseURL
}

func joinURLPath(basePath, requestPath string) string {
	basePath = strings.TrimRight(strings.TrimSpace(basePath), "/")
	requestPath = "/" + strings.TrimLeft(strings.TrimSpace(requestPath), "/")
	if basePath == "" {
		return requestPath
	}
	return basePath + requestPath
}

func (s *pluginServer) publishClient() *http.Client {
	if s != nil && s.publishHTTPClient != nil {
		return s.publishHTTPClient
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func copyPublishProxyRequestHeaders(dst, src http.Header) {
	for key, values := range src {
		if !isPublishProxyRequestHeaderAllowed(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func setPublishProxyAuthHeaders(dst, src http.Header, accountID string) {
	if dst == nil {
		return
	}
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return
	}
	for _, key := range []string{"X-HC-User-ID", "X-HC-USER-ID", "X-HC-User-Role", "X-HC-Device-ID", "X-HC-Login-Time"} {
		dst.Del(key)
	}
	dst.Set(lightOSUserIDHeader, accountID)
	for _, key := range []string{"X-HC-User-Role", "X-HC-Device-ID", "X-HC-Login-Time"} {
		if value := firstHeaderValueAnyCase(src, key); value != "" {
			dst.Set(key, value)
		}
	}
}

func firstHeaderValueAnyCase(header http.Header, key string) string {
	for actualKey, values := range header {
		if !strings.EqualFold(actualKey, key) {
			continue
		}
		for _, value := range values {
			if trimmed := strings.TrimSpace(value); trimmed != "" {
				return trimmed
			}
		}
	}
	return ""
}

func isPublishProxyRequestHeaderAllowed(key string) bool {
	switch http.CanonicalHeaderKey(key) {
	case "Accept", "Accept-Language", "Authorization", "Content-Type", "Cookie", "X-Csrf-Token", "X-Requested-With":
		return true
	default:
		return false
	}
}

func copyPublishProxyResponseHeaders(dst, src http.Header) {
	for key, values := range src {
		if !isPublishProxyResponseHeaderAllowed(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func isPublishProxyResponseHeaderAllowed(key string) bool {
	switch http.CanonicalHeaderKey(key) {
	case "Content-Type", "Cache-Control", "Set-Cookie":
		return true
	default:
		return false
	}
}

func writeAPIError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if encodeErr := json.NewEncoder(w).Encode(apiErrorResponse{Error: strings.TrimSpace(err.Error())}); encodeErr != nil {
		log.Printf("api error response encode failed: %v", encodeErr)
	}
}
