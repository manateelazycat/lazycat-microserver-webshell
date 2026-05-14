package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

type pluginServer struct {
	rootDir string
}

type instanceSummary struct {
	Name          string `json:"name"`
	OwnerDeployID string `json:"owner_deploy_id"`
	Status        string `json:"status"`
}

type adminInfo struct {
	DeployID string `json:"deploy_id"`
	Domain   string `json:"domain"`
	BaseURL  string `json:"base_url"`
}

type webSocketClientMessage struct {
	messageType int
	payload     []byte
	err         error
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const lightosctlPath = "/lzcinit/lightosctl"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &pluginServer{
		rootDir: resolvePluginRoot(),
	}
	if err := server.run(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func resolvePluginRoot() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func (s *pluginServer) run(ctx context.Context) error {
	listener, err := net.Listen("tcp", "127.0.0.1:8080")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/instances", s.handleInstances)
	mux.HandleFunc("/api/lightos-admin-info", s.handleLightOSAdminInfo)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Join(s.rootDir, "runtime", "static")))))

	return s.serveHTTP(ctx, listener, mux)
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
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if err := validateInstanceSelector(selector); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	var writeMu sync.Mutex
	writeMessage := func(messageType int, payload []byte) bool {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(messageType, payload) == nil
	}
	writeTextMessage := func(text string) {
		_ = writeMessage(websocket.TextMessage, []byte(text))
	}
	writeControlMessage := func(payload any) {
		data, err := json.Marshal(payload)
		if err != nil {
			return
		}
		_ = writeMessage(websocket.TextMessage, data)
	}

	cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
	if cols <= 0 {
		cols = 120
	}
	if rows <= 0 {
		rows = 32
	}

	command := exec.CommandContext(ctx, lightosctlPath, "exec", "-ti", selector, "/bin/sh", "-lc", buildShellBootstrapScript())
	command.Dir = s.rootDir
	command.Env = append(os.Environ(), "TERM=xterm-256color")

	ptyFile, err := pty.Start(command)
	if err != nil {
		writeTextMessage(fmt.Sprintf("[webshell error] %v", err))
		return
	}
	defer func() {
		_ = ptyFile.Close()
	}()
	if err := pty.Setsize(ptyFile, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}); err != nil {
		writeTextMessage(fmt.Sprintf("[webshell error] %v", err))
		return
	}

	done := make(chan struct{})
	waitErr := make(chan error, 1)
	clientMessages := make(chan webSocketClientMessage, 16)
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			n, err := ptyFile.Read(buf)
			if n > 0 {
				if ok := writeMessage(websocket.BinaryMessage, append([]byte(nil), buf[:n]...)); !ok {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()
	go func() {
		waitErr <- command.Wait()
	}()
	go func() {
		defer close(clientMessages)
		for {
			messageType, message, err := conn.ReadMessage()
			next := webSocketClientMessage{
				messageType: messageType,
				payload:     message,
				err:         err,
			}
			select {
			case clientMessages <- next:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			_ = killCommand(command)
			<-done
			<-waitErr
			return
		case err := <-waitErr:
			if err != nil && !errors.Is(err, os.ErrProcessDone) {
				writeTextMessage(fmt.Sprintf("[webshell error] %v", err))
			}
			<-done
			exitMessage := map[string]any{
				"type":      "process-exit",
				"exit_code": processExitCode(err),
			}
			if err != nil && !errors.Is(err, os.ErrProcessDone) {
				exitMessage["message"] = err.Error()
			}
			writeControlMessage(exitMessage)
			return
		case clientMessage, ok := <-clientMessages:
			if !ok || clientMessage.err != nil {
				_ = killCommand(command)
				<-done
				<-waitErr
				return
			}
			switch {
			case bytes.HasPrefix(clientMessage.payload, []byte("resize:")):
				cols, rows = parseTerminalSizeFromPayload(clientMessage.payload)
				if cols > 0 && rows > 0 {
					_ = pty.Setsize(ptyFile, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
				}
			case bytes.HasPrefix(clientMessage.payload, []byte("input:")):
				_, _ = io.WriteString(ptyFile, strings.TrimPrefix(string(clientMessage.payload), "input:"))
			default:
				_, _ = ptyFile.Write(clientMessage.payload)
			}
		}
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

func parseTerminalSizeFromPayload(message []byte) (int, int) {
	parts := strings.SplitN(strings.TrimPrefix(string(message), "resize:"), ",", 2)
	if len(parts) != 2 {
		return 0, 0
	}
	return parsePositiveInt(parts[0]), parsePositiveInt(parts[1])
}

func buildShellBootstrapScript() string {
	return strings.Join([]string{
		"if [ -f /run/catlink/shell-env.sh ]; then . /run/catlink/shell-env.sh; fi",
		`exec "${SHELL:-/bin/sh}"`,
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
