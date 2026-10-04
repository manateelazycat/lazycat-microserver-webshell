package provider

import (
	"context"
	"errors"
	"github.com/gorilla/websocket"
	"lcmd-webshell/core"
	"lcmd-webshell/internal/pkg/fonts"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

type pluginServer struct {
	terminalRuntime        *core.Runtime
	rootDir                string
	fontDir                string
	assetVersion           string
	serverRevision         string
	workspaces             *WorkspaceManager
	workspaceRecovery      workspaceRecoveryStore
	adminInfoResolver      func(context.Context) (adminInfo, error)
	instancesResolver      func(context.Context) ([]instanceSummary, error)
	instanceRetryDelays    []time.Duration
	deployUIDResolver      func() string
	publishHTTPClient      *http.Client
	attachmentBackend      attachmentUploadBackend
	attachmentFilesBackend attachmentFileBackend

	settingsMu sync.Mutex
	devicesMu  sync.Mutex
	devices    map[string]webshellDeviceRecord
	deviceNow  func() time.Time
}

type agentStartupErrorResponse struct {
	Error string `json:"error"`
}

type apiErrorResponse struct {
	Error string `json:"error"`
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

const webshellDeviceTTL = 1500 * time.Millisecond

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const lightosctlPath = "/lzcinit/lightosctl"

func Run(runtime *core.Runtime) {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	rootDir := resolvePluginRoot()
	fontDir := fonts.ResolveDir(rootDir)
	server := &pluginServer{
		rootDir:           rootDir,
		terminalRuntime:   runtime,
		fontDir:           fontDir,
		assetVersion:      computeAssetVersion(rootDir),
		serverRevision:    computeServerRevision(rootDir),
		workspaces:        NewWorkspaceManager(rootDir, runtime),
		workspaceRecovery: newFileWorkspaceRecoveryStore(resolveWorkspaceRecoveryDir(fontDir, rootDir)),
	}
	if err := server.run(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func (s *pluginServer) run(ctx context.Context) error {
	if s.workspaces == nil {
		s.workspaces = NewWorkspaceManager(s.rootDir, s.terminalRuntime)
	}
	if s.assetVersion == "" {
		s.assetVersion = computeAssetVersion(s.rootDir)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:8080")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/service-worker.js", s.handleLegacyServiceWorkerRetirement)
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
	mux.HandleFunc("/api/agent/protocol-update", s.handleAgentProtocolUpdate)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.Handle("/assets/", versionedStaticFileServer(filepath.Join(s.rootDir, "runtime", "static"), s.currentAssetVersion))
	mux.Handle("/static/", http.StripPrefix("/static/", staticFileServer(filepath.Join(s.rootDir, "runtime", "static"))))

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

func (s *pluginServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(r.URL.Query().Get("mode")) == "queue" || strings.TrimSpace(r.URL.Query().Get("mode")) == "unified" {
		if err := s.attachPersistentPaneQueue(w, r); err != nil {
			log.Printf("websocket queue attach failed: %v", err)
		}
		return
	}
	cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
	if err := s.attachPersistentPane(w, r, cols, rows); err != nil {
		log.Printf("websocket attach failed: %v", err)
		return
	}
}

func parseTerminalSize(colsText, rowsText string) (int, int) {
	return ParsePositiveInt(colsText), ParsePositiveInt(rowsText)
}
