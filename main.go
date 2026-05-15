package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

type pluginServer struct {
	rootDir    string
	workspaces *workspaceManager
}

type instanceSummary struct {
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

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const lightosctlPath = "/lzcinit/lightosctl"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &pluginServer{
		rootDir:    resolvePluginRoot(),
		workspaces: newWorkspaceManager(resolvePluginRoot()),
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

func (s *pluginServer) run(ctx context.Context) error {
	if s.workspaces == nil {
		s.workspaces = newWorkspaceManager(s.rootDir)
	}
	defer s.workspaces.closeAll()

	listener, err := net.Listen("tcp", "127.0.0.1:8080")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/instances", s.handleInstances)
	mux.HandleFunc("/api/lightos-admin-info", s.handleLightOSAdminInfo)
	mux.HandleFunc("/api/workspace", s.handleWorkspace)
	mux.HandleFunc("/api/workspace/activity", s.handleWorkspaceActivity)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.Handle("/static/", http.StripPrefix("/static/", staticFileServer(filepath.Join(s.rootDir, "runtime", "static"))))

	return s.serveHTTP(ctx, listener, mux)
}

func staticFileServer(root string) http.Handler {
	files := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch filepath.Ext(r.URL.Path) {
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
	items, err := listInstances(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
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
	info, err := resolveLightOSAdminInfo(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
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

func validateInstanceSelector(value string) error {
	name, ownerDeployID, ok := strings.Cut(strings.TrimSpace(value), "@")
	if !ok || strings.TrimSpace(name) == "" || strings.TrimSpace(ownerDeployID) == "" {
		return errors.New("invalid instance selector")
	}
	return nil
}

func instanceSelector(item instanceSummary) string {
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
