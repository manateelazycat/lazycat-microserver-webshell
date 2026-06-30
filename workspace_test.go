package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"lcmd-webshell/internal/pkg/fonts"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func newTestPaneHistory(chunks ...string) paneHistory {
	var history paneHistory
	for _, chunk := range chunks {
		history.append([]byte(chunk))
	}
	return history
}

func testInstancesResolver(items []instanceSummary) func(context.Context) ([]instanceSummary, error) {
	return func(context.Context) ([]instanceSummary, error) {
		copied := append([]instanceSummary(nil), items...)
		return copied, nil
	}
}

func testPluginServerWithInstances() *pluginServer {
	return &pluginServer{
		instancesResolver: testInstancesResolver(testInstanceSummaries()),
		deployUIDResolver: func() string { return "deploy-a" },
	}
}

func testWorkspaceWithTabs(tabIDs ...string) *terminalWorkspace {
	workspace := &terminalWorkspace{
		selector:   "test",
		panes:      make(map[string]*terminalPane),
		nextTabID:  len(tabIDs) + 1,
		nextPaneID: len(tabIDs) + 1,
	}
	for index, tabID := range tabIDs {
		paneID := "pane-" + strconv.Itoa(index+1)
		workspace.panes[paneID] = &terminalPane{
			id:      paneID,
			clients: make(map[*paneClient]struct{}),
			done:    make(chan struct{}),
		}
		workspace.tabs = append(workspace.tabs, &terminalTab{
			ID:           tabID,
			Label:        tabID,
			ActivePaneID: paneID,
			Layout:       &layoutNode{Type: "leaf", PaneID: paneID},
			PaneIDs:      []string{paneID},
		})
	}
	if len(tabIDs) > 0 {
		workspace.setActiveTabLocked(tabIDs[0])
	}
	return workspace
}

func requireRecentTabIDs(t *testing.T, workspace *terminalWorkspace, want ...string) {
	t.Helper()
	got := workspace.snapshot().RecentTabIDs
	if !slices.Equal(got, want) {
		t.Fatalf("RecentTabIDs = %v, want %v", got, want)
	}
}

func testInstanceSummaries() []instanceSummary {
	return []instanceSummary{
		{Name: "alpha", OwnerDeployID: "deploy-a", Status: "running", Username: "alice"},
		{Name: "beta", OwnerDeployID: "deploy-b", Status: "running", Username: "bob"},
		{Name: "gamma", OwnerDeployID: "deploy-a", Status: "stopped", Username: "alice"},
	}
}

func TestBuildInstanceShellBootstrapScriptUsesConfiguredUser(t *testing.T) {
	script := buildInstanceShellBootstrapScript("admin", "")
	if !containsAll(script,
		"user='admin'",
		`__webshell_shell="$shell"`,
		`export SHELL="$__webshell_shell"`,
		`setpriv --reuid "$uid" --regid "$gid" --init-groups "$__webshell_shell"`,
		`exec su -s "$__webshell_shell" "$user"`,
		`/run/catlink/shell-env.sh`,
		`XDG_CONFIG_HOME="$xdg_config_home"`,
	) {
		t.Fatalf("expected configured user login script, got:\n%s", script)
	}
	if strings.Contains(script, `__webshell_user="$(id -un`) {
		t.Fatalf("configured user login script should not resolve the current root shell, got:\n%s", script)
	}
	if containsAll(script, `su -s /bin/sh -c`) {
		t.Fatalf("configured user login script should not use non-interactive su -c wrapper, got:\n%s", script)
	}
}

func TestBuildInstanceShellBootstrapScriptConfiguresClaudeTUIDefault(t *testing.T) {
	for _, script := range []string{
		buildInstanceShellBootstrapScript("root", ""),
		buildInstanceShellBootstrapScript("admin", ""),
	} {
		if !containsAll(script,
			`__webshell_claude_settings_file="$__webshell_claude_config_dir/settings.json"`,
			`command -v claude >/dev/null 2>&1`,
			`Object.prototype.hasOwnProperty.call(settings, "tui")`,
			`settings.tui = "default";`,
			`printf '%s\n' '{"tui":"default"}' > "$__webshell_claude_settings_file"`,
		) {
			t.Fatalf("expected Claude TUI default bootstrap, got:\n%s", script)
		}
		if strings.Contains(script, "/tui default") {
			t.Fatalf("bootstrap should configure Claude settings, not inject slash commands:\n%s", script)
		}
	}
}

func TestLightOSManifestEnablesMultiInstance(t *testing.T) {
	data, err := os.ReadFile("lzc-manifest.yml")
	if err != nil {
		t.Fatalf("ReadFile(lzc-manifest.yml) error = %v", err)
	}
	if !containsAll(string(data), "application:", "multi_instance: true") {
		t.Fatalf("expected lzc-manifest.yml to enable multi_instance, got:\n%s", data)
	}
}

func TestRuntimeInstanceSelectorSupportsClientInstances(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	if !containsAll(string(data), "item?.selector", "item?.target", "item?.client_instance_id", "client:${clientInstanceID}") {
		t.Fatalf("expected runtime instanceSelector to support client instance selectors")
	}
}

func TestHandleInstancesLoadsVisibleInstancesFromLightOSAdmin(t *testing.T) {
	var upstreamPaths []string
	var upstreamAccepts []string
	var upstreamUserIDs []string
	var upstreamUserRoles []string
	server := &pluginServer{
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "https://admin.example/root/"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			upstreamPaths = append(upstreamPaths, request.URL.Path)
			upstreamAccepts = append(upstreamAccepts, request.Header.Get("Accept"))
			upstreamUserIDs = append(upstreamUserIDs, request.Header.Get(lightOSUserIDHeader))
			upstreamUserRoles = append(upstreamUserRoles, request.Header.Get("X-HC-User-Role"))
			body := `[{"name":"alpha","owner_deploy_id":"deploy-a","status":"running","username":"alice"}]`
			if request.URL.Path == "/root/api/client-instances" {
				body = `[{"id":"client-a","name":"Alice PC","platform":"darwin","status":"running","owner_user_id":"alice"}]`
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
				Request:    request,
			}, nil
		})},
	}
	request := httptest.NewRequest(http.MethodGet, "/api/instances", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	request.Header.Set("X-HC-User-Role", "NORMAL")
	recorder := httptest.NewRecorder()

	server.handleInstances(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleInstances status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var items []instanceSummary
	if err := json.NewDecoder(recorder.Body).Decode(&items); err != nil {
		t.Fatalf("decode instances error = %v", err)
	}
	for _, want := range []string{"/root/api/webshell/instances", "/root/api/client-instances"} {
		if !slices.Contains(upstreamPaths, want) {
			t.Fatalf("upstream paths = %v, missing %q", upstreamPaths, want)
		}
	}
	for _, got := range upstreamAccepts {
		if got != "application/json" {
			t.Fatalf("upstream Accepts = %q, want application/json", upstreamAccepts)
		}
	}
	for _, got := range upstreamUserIDs {
		if got != "login-user-a" {
			t.Fatalf("upstream %s values = %q, want login-user-a", lightOSUserIDHeader, upstreamUserIDs)
		}
	}
	for _, got := range upstreamUserRoles {
		if got != "NORMAL" {
			t.Fatalf("upstream roles = %q, want NORMAL", upstreamUserRoles)
		}
	}
	if len(items) != 2 || items[0].Name != "alpha" || items[0].OwnerDeployID != "deploy-a" || instanceSelector(items[0]) != "alpha@deploy-a" {
		t.Fatalf("instances = %+v, want alpha container first", items)
	}
	if items[1].Name != "Alice PC" || items[1].Selector != "client:client-a" || instanceSelector(items[1]) != "client:client-a" {
		t.Fatalf("instances = %+v, want client instance selector", items)
	}
}

func TestHandleInstancesDedupesSwitchInstanceListBySelector(t *testing.T) {
	server := &pluginServer{
		instancesResolver: testInstancesResolver([]instanceSummary{
			{Name: "alpha", OwnerDeployID: "deploy-a", Status: "running"},
			{Name: "alpha", OwnerDeployID: "deploy-a", Status: "running", Username: "alice"},
			{Name: "beta", OwnerDeployID: "deploy-b", Status: "running", Username: "bob"},
			{Selector: "client:client-a", Name: "Alice PC", Status: "running"},
		}),
	}
	request := httptest.NewRequest(http.MethodGet, "/api/instances", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleInstances(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleInstances status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var items []instanceSummary
	if err := json.NewDecoder(recorder.Body).Decode(&items); err != nil {
		t.Fatalf("decode instances error = %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("instances = %+v, want duplicate selector removed", items)
	}
	if items[0].Name != "alpha" || items[0].OwnerDeployID != "deploy-a" || items[0].Username != "alice" {
		t.Fatalf("first instance = %+v, want merged alpha details", items[0])
	}
	if instanceSelector(items[1]) != "beta@deploy-b" || instanceSelector(items[2]) != "client:client-a" {
		t.Fatalf("instances = %+v, want beta and client entries preserved", items)
	}
}

func TestHandleInstancesRequiresAccountHeader(t *testing.T) {
	server := testPluginServerWithInstances()
	recorder := httptest.NewRecorder()

	server.handleInstances(recorder, httptest.NewRequest(http.MethodGet, "/api/instances", nil))

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("handleInstances status = %d, want 401", recorder.Code)
	}
}

func TestAuthorizeInstanceSelectorAllowsVisibleSelector(t *testing.T) {
	server := testPluginServerWithInstances()

	if err := server.authorizeInstanceSelector(context.Background(), "alpha@deploy-a"); err != nil {
		t.Fatalf("authorize own selector error = %v", err)
	}
	if err := server.authorizeInstanceSelector(context.Background(), "beta@deploy-b"); err != nil {
		t.Fatalf("authorize visible selector error = %v", err)
	}
	if err := server.authorizeInstanceSelector(context.Background(), "invalid"); err == nil || !strings.Contains(err.Error(), "invalid instance selector") {
		t.Fatalf("authorize invalid selector error = %v, want invalid selector", err)
	}
}

func TestHandleWorkspaceClientTargetProxiesRemoteWorkspaceAfterVisibilityCheck(t *testing.T) {
	var requestedPaths []string
	oldHTTPClient := newClientTerminalHTTPClient
	oldAuthToken := resolveClientDeviceAPIAuthToken
	defer func() {
		newClientTerminalHTTPClient = oldHTTPClient
		resolveClientDeviceAPIAuthToken = oldAuthToken
	}()
	resolveClientDeviceAPIAuthToken = func(context.Context, string) (string, error) {
		return "device-auth-token", nil
	}
	newClientTerminalHTTPClient = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			requestedPaths = append(requestedPaths, request.URL.Path)
			if request.Header.Get("lzc_dapi_auth_token") != "device-auth-token" {
				t.Fatalf("device api auth token header = %q", request.Header.Get("lzc_dapi_auth_token"))
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body: io.NopCloser(strings.NewReader(`{
					"selector":"client:client-a",
					"active_tab_id":"tab-1",
					"tabs":[{"id":"tab-1","label":"Shell 1","active_pane_id":"pane-1","layout":{"type":"leaf","paneId":"pane-1"},"panes":[{"id":"pane-1","cols":120,"rows":32,"busy":false,"exited":false,"exit_code":0}]}]
				}`)),
				Request: request,
			}, nil
		})}
	}
	server := &pluginServer{
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "http://lightos-admin.local"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			requestedPaths = append(requestedPaths, request.URL.Path)
			body := `[{"id":"client-a","name":"Alice PC","platform":"darwin","status":"running","owner_user_id":"alice"}]`
			if request.URL.Path == "/api/client-instances/terminal-ticket" {
				body = `{"client_instance_id":"client-a","device_api_url":"https://device.example.com","terminal_service_name":"cloud.lazycat.lightos.client-terminal.client-a","ticket":"ticket","expires_at":"2026-06-11T08:01:00Z"}`
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(body)),
				Request:    request,
			}, nil
		})},
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/workspace?name=client:client-a", nil)
	request.Header.Set(lightOSUserIDHeader, "alice")
	server.handleWorkspace(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleWorkspace status = %d, want 200; body=%q", recorder.Code, recorder.Body.String())
	}
	for _, want := range []string{"/api/client-instances", "/api/client-instances/terminal-ticket", "/s/cloud.lazycat.lightos.client-terminal.client-a/workspace"} {
		if !slices.Contains(requestedPaths, want) {
			t.Fatalf("requested paths = %v, missing %q", requestedPaths, want)
		}
	}
}

func TestHandleWorkspaceClientTargetRejectsInvisibleClient(t *testing.T) {
	server := &pluginServer{
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "http://lightos-admin.local"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(`[{"id":"client-b","name":"Bob PC","platform":"linux","status":"running","owner_user_id":"bob"}]`)),
				Request:    request,
			}, nil
		})},
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/workspace?name=client:client-a", nil)
	request.Header.Set(lightOSUserIDHeader, "alice")
	server.handleWorkspace(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("handleWorkspace status = %d, want 403; body=%q", recorder.Code, recorder.Body.String())
	}
}

func TestAuthorizeOwnedInstanceSelectorRejectsForeignSelector(t *testing.T) {
	server := testPluginServerWithInstances()

	if err := server.authorizeOwnedInstanceSelector(context.Background(), "alpha@deploy-a"); err != nil {
		t.Fatalf("authorize own selector error = %v", err)
	}
	if err := server.authorizeOwnedInstanceSelector(context.Background(), "beta@deploy-b"); !errors.Is(err, errInstanceForbidden) {
		t.Fatalf("authorize foreign selector error = %v, want errInstanceForbidden", err)
	}
}

func TestWorkspacePersistsRecentTabsForSwap(t *testing.T) {
	workspace := testWorkspaceWithTabs("tab-1", "tab-2", "tab-3")
	requireRecentTabIDs(t, workspace, "tab-1")

	if err := workspace.applyAction(workspaceActionRequest{Action: "activate_tab", TabID: "tab-2"}); err != nil {
		t.Fatalf("activate tab-2 error = %v", err)
	}
	requireRecentTabIDs(t, workspace, "tab-2", "tab-1")

	if err := workspace.applyAction(workspaceActionRequest{Action: "activate_tab", TabID: "tab-3"}); err != nil {
		t.Fatalf("activate tab-3 error = %v", err)
	}
	requireRecentTabIDs(t, workspace, "tab-3", "tab-2")

	if err := workspace.applyAction(workspaceActionRequest{Action: "activate_tab", TabID: "tab-2"}); err != nil {
		t.Fatalf("activate tab-2 again error = %v", err)
	}
	requireRecentTabIDs(t, workspace, "tab-2", "tab-3")

	if err := workspace.applyAction(workspaceActionRequest{Action: "close_tab", TabID: "tab-3"}); err != nil {
		t.Fatalf("close tab-3 error = %v", err)
	}
	requireRecentTabIDs(t, workspace, "tab-2")
}

func TestWorkspaceAcceptsClientRecentTabsForSwap(t *testing.T) {
	workspace := testWorkspaceWithTabs("tab-1", "tab-2", "tab-3")
	workspace.activeTab = "tab-1"
	workspace.recentTabs = nil

	if err := workspace.applyAction(workspaceActionRequest{
		Action:       "activate_tab",
		TabID:        "tab-2",
		RecentTabIDs: []string{"tab-2", "tab-3"},
	}); err != nil {
		t.Fatalf("activate tab-2 with client recents error = %v", err)
	}
	requireRecentTabIDs(t, workspace, "tab-2", "tab-3")
}

func TestHandleSettingsFontsUploadsMultipleFonts(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, item := range []struct {
		filename string
		data     string
	}{
		{filename: "First.woff2", data: "first-font-data"},
		{filename: "Second.woff2", data: "second-font-data"},
	} {
		part, err := writer.CreateFormFile("font", item.filename)
		if err != nil {
			t.Fatalf("CreateFormFile(%q) error = %v", item.filename, err)
		}
		if _, err := io.WriteString(part, item.data); err != nil {
			t.Fatalf("writing %q error = %v", item.filename, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/settings/fonts", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()
	server.handleSettingsFonts(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("handleSettingsFonts() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	uploadedFonts := make([]fonts.Descriptor, 0)
	for _, font := range state.Fonts {
		if !font.Builtin {
			uploadedFonts = append(uploadedFonts, font)
		}
	}
	if len(uploadedFonts) != 2 {
		t.Fatalf("uploaded font count = %d, want 2: %+v", len(uploadedFonts), state.Fonts)
	}
	if state.TerminalFontID == "" || state.TerminalFontID != uploadedFonts[1].ID {
		t.Fatalf("TerminalFontID = %q, want last uploaded font %q", state.TerminalFontID, uploadedFonts[1].ID)
	}
}

func TestHandlePublishProxyForwardsListRequest(t *testing.T) {
	t.Setenv(lightOSRequireCookieAuthEnv, "false")
	t.Setenv(lazyCatAppDeployUIDEnv, "deploy-user")
	var upstreamPath string
	var upstreamQuery string
	var upstreamAccept string
	var upstreamUserID string
	server := &pluginServer{
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "https://admin.example/root/"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			upstreamPath = request.URL.Path
			upstreamQuery = request.URL.RawQuery
			upstreamAccept = request.Header.Get("Accept")
			upstreamUserID = request.Header.Get(lightOSUserIDHeader)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`[{"id":"pub-1"}]`)),
				Request:    request,
			}, nil
		})},
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/publish/list?scope=current", nil)
	request.Header.Set("Accept", "application/json")
	server.handlePublishProxy(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handlePublishProxy() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if upstreamPath != "/root/api/publish/list" || upstreamQuery != "scope=current" {
		t.Fatalf("upstream URL path/query = %q?%q, want /root/api/publish/list?scope=current", upstreamPath, upstreamQuery)
	}
	if upstreamAccept != "application/json" {
		t.Fatalf("upstream Accept = %q, want application/json", upstreamAccept)
	}
	if upstreamUserID != "deploy-user" {
		t.Fatalf("upstream %s = %q, want deploy-user", lightOSUserIDHeader, upstreamUserID)
	}
	if strings.TrimSpace(recorder.Body.String()) != `[{"id":"pub-1"}]` {
		t.Fatalf("response body = %q", recorder.Body.String())
	}
}

func TestHandlePublishProxyRequiresAccountForListByDefault(t *testing.T) {
	server := &pluginServer{}
	recorder := httptest.NewRecorder()

	server.handlePublishProxy(recorder, httptest.NewRequest(http.MethodGet, "/api/publish/list", nil))

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("handlePublishProxy() status = %d, want 401", recorder.Code)
	}
}

func TestHandlePublishProxyUsesInternalLightOSAdminURLWhenBundled(t *testing.T) {
	t.Setenv(lightOSRequireCookieAuthEnv, "false")
	t.Setenv(lazyCatAppDeployUIDEnv, "deploy-user")
	t.Setenv(lazyCatAppIDEnv, lightOSAdminAppID)
	var upstreamURL string
	server := &pluginServer{
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "https://admin.example/root/"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			upstreamURL = request.URL.String()
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"ready":true}`)),
				Request:    request,
			}, nil
		})},
	}

	recorder := httptest.NewRecorder()
	server.handlePublishProxy(recorder, httptest.NewRequest(http.MethodGet, "/api/publish/status", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("handlePublishProxy() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if upstreamURL != "http://127.0.0.1:18081/api/publish/status" {
		t.Fatalf("upstream URL = %q, want internal lightos-admin URL", upstreamURL)
	}
}

func TestHandlePublishProxyUsesInternalLightOSAdminURLFromConfig(t *testing.T) {
	t.Setenv(lightOSRequireCookieAuthEnv, "false")
	t.Setenv(lazyCatAppDeployUIDEnv, "deploy-user")
	t.Setenv(lazyCatAppIDEnv, "")
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("LIGHTOS_ADMIN_INTERNAL_BASE_URL=http://127.0.0.1:18081\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatalf("Chdir(%s) error = %v", root, err)
	}
	defer func() {
		if err := os.Chdir(previousDir); err != nil {
			t.Fatalf("restore cwd error = %v", err)
		}
	}()
	var upstreamURL string
	server := &pluginServer{
		rootDir: root,
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "https://admin.example/root/"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			upstreamURL = request.URL.String()
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"ready":true}`)),
				Request:    request,
			}, nil
		})},
	}

	recorder := httptest.NewRecorder()
	server.handlePublishProxy(recorder, httptest.NewRequest(http.MethodGet, "/api/publish/status", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("handlePublishProxy() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if upstreamURL != "http://127.0.0.1:18081/api/publish/status" {
		t.Fatalf("upstream URL = %q, want internal lightos-admin URL from config", upstreamURL)
	}
}

func TestHandlePublishProxyForwardsInstallMultipartRequest(t *testing.T) {
	t.Setenv(lightOSRequireCookieAuthEnv, "false")
	t.Setenv(lazyCatAppDeployUIDEnv, "deploy-user")
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("id", "pub-1"); err != nil {
		t.Fatalf("WriteField(id) error = %v", err)
	}
	part, err := writer.CreateFormFile("icon", "icon.png")
	if err != nil {
		t.Fatalf("CreateFormFile(icon) error = %v", err)
	}
	if _, err := io.WriteString(part, "png-data"); err != nil {
		t.Fatalf("writing icon part error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close error = %v", err)
	}

	var upstreamContentType string
	var upstreamPayload string
	server := &pluginServer{
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "http://admin.local"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			upstreamContentType = request.Header.Get("Content-Type")
			data, err := io.ReadAll(request.Body)
			if err != nil {
				t.Fatalf("ReadAll(upstream body) error = %v", err)
			}
			upstreamPayload = string(data)
			return &http.Response{
				StatusCode: http.StatusCreated,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
				Request:    request,
			}, nil
		})},
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/publish/http/install-shell-lpk", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	server.handlePublishProxy(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("handlePublishProxy() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if !strings.HasPrefix(upstreamContentType, "multipart/form-data; boundary=") {
		t.Fatalf("upstream Content-Type = %q, want multipart/form-data", upstreamContentType)
	}
	if !strings.Contains(upstreamPayload, `name="id"`) || !strings.Contains(upstreamPayload, "pub-1") || !strings.Contains(upstreamPayload, "png-data") {
		t.Fatalf("upstream multipart payload missing expected fields: %q", upstreamPayload)
	}
}

func TestHandlePublishProxyCreateRequiresOwnedInstance(t *testing.T) {
	upstreamCalled := false
	server := testPluginServerWithInstances()
	server.adminInfoResolver = func(context.Context) (adminInfo, error) {
		return adminInfo{BaseURL: "http://admin.local"}, nil
	}
	server.publishHTTPClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		upstreamCalled = true
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
			Request:    request,
		}, nil
	})}

	request := httptest.NewRequest(http.MethodPost, "/api/publish/http/create", strings.NewReader(`{"instance_name":"beta@deploy-b","upstream":"http://127.0.0.1:8080"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()
	server.handlePublishProxy(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("handlePublishProxy() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if upstreamCalled {
		t.Fatal("foreign publish create should not be forwarded upstream")
	}
}

func TestHandlePublishProxyCreateForwardsOwnedInstanceBody(t *testing.T) {
	var upstreamPayload string
	server := testPluginServerWithInstances()
	server.adminInfoResolver = func(context.Context) (adminInfo, error) {
		return adminInfo{BaseURL: "http://admin.local"}, nil
	}
	server.publishHTTPClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		data, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatalf("ReadAll(upstream body) error = %v", err)
		}
		upstreamPayload = string(data)
		return &http.Response{
			StatusCode: http.StatusCreated,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
			Request:    request,
		}, nil
	})}
	body := `{"instance_name":"alpha@deploy-a","upstream":"http://127.0.0.1:8080"}`
	request := httptest.NewRequest(http.MethodPost, "/api/publish/http/create", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()
	server.handlePublishProxy(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("handlePublishProxy() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if upstreamPayload != body {
		t.Fatalf("upstream payload = %q, want %q", upstreamPayload, body)
	}
}

func TestHandlePublishProxyRejectsUnknownRouteAndMethod(t *testing.T) {
	server := &pluginServer{}

	recorder := httptest.NewRecorder()
	server.handlePublishProxy(recorder, httptest.NewRequest(http.MethodGet, "/api/publish/http/create", nil))
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET create status = %d, want 405", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	server.handlePublishProxy(recorder, httptest.NewRequest(http.MethodGet, "/api/publish/../settings", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("unknown route status = %d, want 404", recorder.Code)
	}
}

func TestHandlePublishProxyReturnsJSONBadGatewayOnUpstreamFailure(t *testing.T) {
	t.Setenv(lightOSRequireCookieAuthEnv, "false")
	t.Setenv(lazyCatAppDeployUIDEnv, "deploy-user")
	server := &pluginServer{
		adminInfoResolver: func(context.Context) (adminInfo, error) {
			return adminInfo{BaseURL: "http://admin.local"}, nil
		},
		publishHTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			return nil, errors.New("dial failed")
		})},
	}

	recorder := httptest.NewRecorder()
	server.handlePublishProxy(recorder, httptest.NewRequest(http.MethodGet, "/api/publish/status", nil))

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("handlePublishProxy() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if !strings.HasPrefix(recorder.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", recorder.Header().Get("Content-Type"))
	}
	var payload apiErrorResponse
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode error response error = %v", err)
	}
	if !strings.Contains(payload.Error, "dial failed") {
		t.Fatalf("error payload = %q, want to contain dial failed", payload.Error)
	}
}

func TestHandleSettingsPatchScrollbackPreservesFont(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	store := server.fontStore()
	font, err := store.StoreUpload("Mono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	if err := store.SaveSelection(font.ID); err != nil {
		t.Fatalf("SaveSelection() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"terminal_scrollback":22000}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 22000 {
		t.Fatalf("State = %+v, want selected font and scrollback 22000", state)
	}
}

func TestHandleSettingsPatchLineHeightPreservesFontAndScrollback(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	store := server.fontStore()
	font, err := store.StoreUpload("Mono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	if err := store.SaveSettings(fonts.Settings{
		TerminalFontID:            font.ID,
		TerminalScrollback:        22000,
		TerminalLineHeightPercent: fonts.DefaultTerminalLineHeightPercent,
	}); err != nil {
		t.Fatalf("SaveSettings() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"terminal_line_height_percent":135}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 22000 || state.TerminalLineHeightPercent != 135 {
		t.Fatalf("State = %+v, want selected font, scrollback 22000, and line height 135", state)
	}
}

func TestHandleSettingsDefaultsDesktopMouseClipboardMobilePixelScrollAndDoubleTapReminderEnabled(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}

	recorder := httptest.NewRecorder()
	server.handleSettings(recorder, httptest.NewRequest(http.MethodGet, "/api/settings", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(GET) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if !state.DesktopMouseClipboardEnabled {
		t.Fatalf("DesktopMouseClipboardEnabled = false, want default true")
	}
	if !state.MobilePixelScrollEnabled {
		t.Fatalf("MobilePixelScrollEnabled = false, want default true")
	}
	if !state.MobileDoubleTapReminderEnabled {
		t.Fatalf("MobileDoubleTapReminderEnabled = false, want default true")
	}
	if state.TerminalLineHeightPercent != fonts.DefaultTerminalLineHeightPercent {
		t.Fatalf("TerminalLineHeightPercent = %d, want default %d", state.TerminalLineHeightPercent, fonts.DefaultTerminalLineHeightPercent)
	}
}

func TestHandleSettingsPatchDesktopMouseClipboardMobilePixelScrollAndDoubleTapReminderPreservesFontAndScrollback(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	store := server.fontStore()
	font, err := store.StoreUpload("Mono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	if err := store.SaveSelection(font.ID); err != nil {
		t.Fatalf("SaveSelection() error = %v", err)
	}
	if err := store.SaveScrollback(44000); err != nil {
		t.Fatalf("SaveScrollback() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"desktop_mouse_clipboard_enabled":false,"mobile_pixel_scroll_enabled":false,"mobile_double_tap_reminder_enabled":false}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 44000 || state.DesktopMouseClipboardEnabled || state.MobilePixelScrollEnabled || state.MobileDoubleTapReminderEnabled {
		t.Fatalf("State = %+v, want selected font, scrollback 44000, disabled mouse clipboard, disabled mobile pixel scroll, and disabled double tap reminder", state)
	}
}

func TestHandleSettingsPatchFontPreservesScrollback(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	store := server.fontStore()
	font, err := store.StoreUpload("Mono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	if err := store.SaveScrollback(33000); err != nil {
		t.Fatalf("SaveScrollback() error = %v", err)
	}
	disabled := false
	settings, err := store.ReadSettings()
	if err != nil {
		t.Fatalf("ReadSettings() error = %v", err)
	}
	settings.DesktopMouseClipboardEnabled = &disabled
	if err := store.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings() error = %v", err)
	}

	recorder := httptest.NewRecorder()
	body := `{"terminal_font_id":` + strconv.Quote(font.ID) + `}`
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 33000 || state.DesktopMouseClipboardEnabled {
		t.Fatalf("State = %+v, want selected font, preserved scrollback, and disabled mouse clipboard", state)
	}
}

func TestHandleSettingsDefaultsMobileShortcuts(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}

	recorder := httptest.NewRecorder()
	server.handleSettings(recorder, httptest.NewRequest(http.MethodGet, "/api/settings", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if len(state.MobileShortcuts) != 2 || len(state.MobileShortcuts[0]) == 0 || len(state.MobileShortcuts[1]) == 0 {
		t.Fatalf("MobileShortcuts = %+v, want default two non-empty rows", state.MobileShortcuts)
	}
	row := state.MobileShortcuts[0]
	tabIndex := -1
	continueIndex := -1
	returnIndex := -1
	for index, shortcut := range row {
		switch shortcut.ID {
		case "tab":
			tabIndex = index
		case "continue":
			continueIndex = index
			if shortcut.Text != "continue" || shortcut.Label != "Continue" {
				t.Fatalf("MobileShortcuts[0][%d] = %+v, want Continue text shortcut", index, shortcut)
			}
		case "return":
			returnIndex = index
		}
	}
	if tabIndex < 0 || continueIndex < 0 || returnIndex < 0 || tabIndex > continueIndex || continueIndex > returnIndex {
		t.Fatalf("MobileShortcuts[0] = %+v, want tab before Continue before return", row)
	}
	row = state.MobileShortcuts[1]
	ctrlCIndex := -1
	swapIndex := -1
	dollarIndex := -1
	escIndex := -1
	for index, shortcut := range row {
		switch shortcut.ID {
		case "ctrl-c":
			ctrlCIndex = index
		case "swap-tab":
			swapIndex = index
			if shortcut.Action != "swap_tab" || shortcut.Label != "Swap" {
				t.Fatalf("MobileShortcuts[1][%d] = %+v, want Swap action", index, shortcut)
			}
		case "dollar":
			dollarIndex = index
		case "esc":
			escIndex = index
		}
	}
	if ctrlCIndex < 0 || swapIndex < 0 || ctrlCIndex > swapIndex {
		t.Fatalf("MobileShortcuts[1] = %+v, want Swap after Ctrl+C", row)
	}
	if dollarIndex < 0 || escIndex < 0 || dollarIndex > escIndex {
		t.Fatalf("MobileShortcuts[1] = %+v, want Esc after $", row)
	}
}

func TestHandleSettingsAcceptsSwapMobileShortcut(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}

	body := `{"mobile_shortcuts":[[{"id":"swap","label":"Swap","action":"swap_tab"}],[]]}`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if got := state.MobileShortcuts[0][0]; got.Action != "swap_tab" || got.Label != "Swap" {
		t.Fatalf("MobileShortcuts[0][0] = %+v, want swap_tab", got)
	}
}

func TestHandleSettingsAcceptsTextMobileShortcut(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}

	body := `{"mobile_shortcuts":[[{"id":"continue","label":"Continue","text":"continue","kind":"primary"}],[]]}`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if got := state.MobileShortcuts[0][0]; got.Text != "continue" || got.Label != "Continue" || got.Kind != "primary" {
		t.Fatalf("MobileShortcuts[0][0] = %+v, want Continue text shortcut", got)
	}
}

func TestHandleSettingsPatchMobileShortcutsPreservesExistingSettings(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	store := server.fontStore()
	font, err := store.StoreUpload("Mono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	disabled := false
	settings := fonts.Settings{
		TerminalFontID:                 font.ID,
		TerminalScrollback:             33000,
		DesktopMouseClipboardEnabled:   &disabled,
		MobileDoubleTapReminderEnabled: &disabled,
	}
	if err := store.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings() error = %v", err)
	}

	body := `{"mobile_shortcuts":[[{"id":"custom-a","label":"Ctrl+C","input_key":"c","input_modifiers":{"ctrl":true}}],[{"id":"custom-paste","label":"Paste","action":"paste"}]]}`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 33000 || state.DesktopMouseClipboardEnabled || state.MobileDoubleTapReminderEnabled {
		t.Fatalf("State = %+v, want preserved existing settings", state)
	}
	if got := state.MobileShortcuts[0][0]; got.ID != "custom-a" || !got.InputModifiers.Ctrl {
		t.Fatalf("MobileShortcuts[0][0] = %+v, want custom ctrl shortcut", got)
	}
}

func TestHandleSettingsPatchDesktopShortcutsPreservesExistingSettings(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	store := server.fontStore()
	font, err := store.StoreUpload("Mono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	disabled := false
	settings := fonts.Settings{
		TerminalFontID:               font.ID,
		TerminalScrollback:           33000,
		DesktopMouseClipboardEnabled: &disabled,
	}
	if err := store.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings() error = %v", err)
	}

	body := `{"desktop_shortcuts":[{"id":"custom-copy","label":"Copy","action":"copy_terminal","shortcut":"Command + c"}]}`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 33000 || state.DesktopMouseClipboardEnabled {
		t.Fatalf("State = %+v, want preserved existing settings", state)
	}
	if state.DesktopShortcuts == nil || len(*state.DesktopShortcuts) != 1 {
		t.Fatalf("DesktopShortcuts = %+v, want one custom shortcut", state.DesktopShortcuts)
	}
	if got := (*state.DesktopShortcuts)[0]; got.ID != "custom-copy" || got.Action != "copy_terminal" || got.Shortcut != "Command + c" {
		t.Fatalf("DesktopShortcuts[0] = %+v, want custom copy shortcut", got)
	}
}

func TestHandleSettingsMobileShortcutsNullRestoresDefaultAndEmptyRowsAreExplicit(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"mobile_shortcuts":[[],[]]}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(empty) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode empty response error = %v", err)
	}
	if len(state.MobileShortcuts) != 2 || len(state.MobileShortcuts[0]) != 0 || len(state.MobileShortcuts[1]) != 0 {
		t.Fatalf("MobileShortcuts after empty save = %+v, want two empty rows", state.MobileShortcuts)
	}

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"mobile_shortcuts":null}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(reset) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	state = fonts.State{}
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode reset response error = %v", err)
	}
	if len(state.MobileShortcuts) != 2 || len(state.MobileShortcuts[0]) == 0 || len(state.MobileShortcuts[1]) == 0 {
		t.Fatalf("MobileShortcuts after reset = %+v, want default two non-empty rows", state.MobileShortcuts)
	}
}

func TestHandleSettingsDesktopShortcutsNullRestoresDefaultAndEmptyListIsExplicit(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"desktop_shortcuts":[]}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(empty) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode empty response error = %v", err)
	}
	if state.DesktopShortcuts == nil || len(*state.DesktopShortcuts) != 0 {
		t.Fatalf("DesktopShortcuts after empty save = %+v, want empty list", state.DesktopShortcuts)
	}

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"desktop_shortcuts":null}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(reset) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	state = fonts.State{}
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode reset response error = %v", err)
	}
	if state.DesktopShortcuts != nil {
		t.Fatalf("DesktopShortcuts after reset = %+v, want nil/default client config", state.DesktopShortcuts)
	}
}

func TestHandleSettingsAcceptsAttachmentDesktopShortcuts(t *testing.T) {
	server := &pluginServer{fontDir: t.TempDir()}
	body := `{"desktop_shortcuts":[{"id":"attachment-clipboard","label":"从剪贴板导入附件","action":"attachment_clipboard","shortcut":"Ctrl + Shift + a"},{"id":"attachment-file","label":"上传附件文件","action":"attachment_file","shortcut":"Ctrl + Shift + e"}]}`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.DesktopShortcuts == nil || len(*state.DesktopShortcuts) != 2 {
		t.Fatalf("DesktopShortcuts = %+v, want two attachment shortcuts", state.DesktopShortcuts)
	}
	if got := (*state.DesktopShortcuts)[0]; got.Action != "attachment_clipboard" || got.Shortcut != "Ctrl + Shift + a" {
		t.Fatalf("DesktopShortcuts[0] = %+v, want attachment clipboard shortcut", got)
	}
	if got := (*state.DesktopShortcuts)[1]; got.Action != "attachment_file" || got.Shortcut != "Ctrl + Shift + e" {
		t.Fatalf("DesktopShortcuts[1] = %+v, want attachment file shortcut", got)
	}
}

func TestHandleSettingsRejectsInvalidMobileShortcutsWithoutWriting(t *testing.T) {
	for _, body := range []string{
		`{"mobile_shortcuts":[[{"id":"dup","label":"A","input_key":"a"}],[{"id":"dup","label":"B","input_key":"b"}]]}`,
		`{"mobile_shortcuts":[[{"id":"bad space","label":"A","input_key":"a"}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-action","label":"A","action":"unknown"}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-action-mod","label":"A","action":"copy","input_modifiers":{"ctrl":true}}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-text-mod","label":"A","text":"continue","input_modifiers":{"ctrl":true}}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-text-empty","label":"A","text":""}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-shape-text-action","label":"A","action":"copy","text":"copy"}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-label","label":"","input_key":"a"}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-shape","label":"A","input_key":"a"}]]}`,
	} {
		t.Run(body, func(t *testing.T) {
			server := &pluginServer{fontDir: t.TempDir()}
			initial := fonts.MobileShortcutRows{{{ID: "keep", Label: "Keep", InputKey: "k"}}, {}}
			settings := fonts.Settings{TerminalScrollback: fonts.DefaultTerminalScrollback, MobileShortcuts: &initial}
			if err := server.fontStore().SaveSettings(settings); err != nil {
				t.Fatalf("SaveSettings() error = %v", err)
			}

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			server.handleSettings(recorder, request)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			state, err := server.fontStore().State()
			if err != nil {
				t.Fatalf("State() error = %v", err)
			}
			if got := state.MobileShortcuts[0][0]; got.ID != "keep" {
				t.Fatalf("MobileShortcuts after rejected write = %+v, want preserved keep", state.MobileShortcuts)
			}
		})
	}
}

func TestHandleSettingsRejectsInvalidDesktopShortcutsWithoutWriting(t *testing.T) {
	for _, body := range []string{
		`{"desktop_shortcuts":[{"id":"dup","label":"A","action":"copy_terminal","shortcut":"Ctrl + Shift + c"},{"id":"dup","label":"B","action":"paste_terminal","shortcut":"Ctrl + Shift + v"}]}`,
		`{"desktop_shortcuts":[{"id":"bad space","label":"A","action":"copy_terminal","shortcut":"Ctrl + Shift + c"}]}`,
		`{"desktop_shortcuts":[{"id":"bad-action","label":"A","action":"unknown","shortcut":"Ctrl + Shift + c"}]}`,
		`{"desktop_shortcuts":[{"id":"bad-label","label":"","action":"copy_terminal","shortcut":"Ctrl + Shift + c"}]}`,
		`{"desktop_shortcuts":[{"id":"bad-shortcut","label":"A","action":"copy_terminal","shortcut":"Ctrl + Shift"}]}`,
		`{"desktop_shortcuts":[{"id":"dup-a","label":"A","action":"copy_terminal","shortcut":"Ctrl + Shift + c"},{"id":"dup-b","label":"B","action":"paste_terminal","shortcut":"Ctrl + Shift + c"}]}`,
	} {
		t.Run(body, func(t *testing.T) {
			server := &pluginServer{fontDir: t.TempDir()}
			initial := fonts.DesktopShortcutList{{ID: "keep", Label: "Keep", Action: "copy_terminal", Shortcut: "Ctrl + Shift + c"}}
			settings := fonts.Settings{TerminalScrollback: fonts.DefaultTerminalScrollback, DesktopShortcuts: &initial}
			if err := server.fontStore().SaveSettings(settings); err != nil {
				t.Fatalf("SaveSettings() error = %v", err)
			}

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			server.handleSettings(recorder, request)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			state, err := server.fontStore().State()
			if err != nil {
				t.Fatalf("State() error = %v", err)
			}
			if state.DesktopShortcuts == nil || len(*state.DesktopShortcuts) != 1 || (*state.DesktopShortcuts)[0].ID != "keep" {
				t.Fatalf("DesktopShortcuts after rejected write = %+v, want preserved keep", state.DesktopShortcuts)
			}
		})
	}
}

func TestHandleSettingsRejectsInvalidScrollbackWithoutWriting(t *testing.T) {
	for _, body := range []string{
		`{"terminal_scrollback":99}`,
		`{"terminal_scrollback":100001}`,
		`{"terminal_scrollback":"5000"}`,
	} {
		t.Run(body, func(t *testing.T) {
			server := &pluginServer{fontDir: t.TempDir()}
			store := server.fontStore()
			if err := store.SaveScrollback(44000); err != nil {
				t.Fatalf("SaveScrollback() error = %v", err)
			}

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			server.handleSettings(recorder, request)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			state, err := store.State()
			if err != nil {
				t.Fatalf("State() error = %v", err)
			}
			if state.TerminalScrollback != 44000 {
				t.Fatalf("TerminalScrollback = %d, want preserved 44000", state.TerminalScrollback)
			}
		})
	}
}

func TestHandleSettingsRejectsInvalidLineHeightWithoutWriting(t *testing.T) {
	for _, body := range []string{
		`{"terminal_line_height_percent":0}`,
		`{"terminal_line_height_percent":99}`,
		`{"terminal_line_height_percent":161}`,
		`{"terminal_line_height_percent":"120"}`,
	} {
		t.Run(body, func(t *testing.T) {
			server := &pluginServer{fontDir: t.TempDir()}
			store := server.fontStore()
			if err := store.SaveSettings(fonts.Settings{
				TerminalScrollback:        fonts.DefaultTerminalScrollback,
				TerminalLineHeightPercent: 135,
			}); err != nil {
				t.Fatalf("SaveSettings() error = %v", err)
			}

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			server.handleSettings(recorder, request)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			state, err := store.State()
			if err != nil {
				t.Fatalf("State() error = %v", err)
			}
			if state.TerminalLineHeightPercent != 135 {
				t.Fatalf("TerminalLineHeightPercent = %d, want preserved 135", state.TerminalLineHeightPercent)
			}
		})
	}
}

func TestHandleSettingsServesBundledFonts(t *testing.T) {
	rootDir := t.TempDir()
	bundledDir := filepath.Join(rootDir, "runtime", "fonts", "preinstalled")
	if err := os.MkdirAll(bundledDir, 0o755); err != nil {
		t.Fatalf("MkdirAll bundled font dir error = %v", err)
	}
	for _, item := range []struct {
		name string
		data string
	}{
		{name: "HackNerdFontMono-Regular.ttf", data: "hack"},
		{name: "JetBrainsMonoNerdFontMono-Regular.ttf", data: "jetbrains"},
		{name: "FiraCodeNerdFontMono-Regular.ttf", data: "fira"},
		{name: "MesloLGSNerdFontMono-Regular.ttf", data: "meslo"},
		{name: "SymbolsNerdFontMono-Regular.ttf", data: "symbols"},
	} {
		if err := os.WriteFile(filepath.Join(bundledDir, item.name), []byte(item.data), 0o644); err != nil {
			t.Fatalf("write bundled font %q error = %v", item.name, err)
		}
	}
	server := &pluginServer{rootDir: rootDir, fontDir: t.TempDir()}

	recorder := httptest.NewRecorder()
	server.handleSettings(recorder, httptest.NewRequest(http.MethodGet, "/api/settings", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(GET) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode settings response error = %v", err)
	}
	if len(state.Fonts) != 4 {
		t.Fatalf("bundled font count = %d, want 4: %+v", len(state.Fonts), state.Fonts)
	}
	if state.TerminalFontID != fonts.DefaultTerminalFontID {
		t.Fatalf("default TerminalFontID = %q, want Hack Nerd Font %q", state.TerminalFontID, fonts.DefaultTerminalFontID)
	}
	if state.Fonts[0].Label != "Hack Nerd Font" || !state.Fonts[0].Builtin {
		t.Fatalf("first bundled font = %+v, want Hack Nerd Font builtin", state.Fonts[0])
	}
	if state.TerminalSymbolFont == nil {
		t.Fatal("TerminalSymbolFont = nil, want bundled Nerd Font symbol descriptor")
	}
	if state.TerminalSymbolFont.Family != "WebShellNerdSymbols" || state.TerminalSymbolFont.MIME != "font/ttf" {
		t.Fatalf("TerminalSymbolFont = %+v, want Nerd Font symbols ttf", state.TerminalSymbolFont)
	}

	selectedID := state.Fonts[0].ID
	body := strings.NewReader(`{"terminal_font_id":"` + selectedID + `"}`)
	recorder = httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/settings", body)
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(PUT) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	state = fonts.State{}
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode saved settings response error = %v", err)
	}
	if state.TerminalFontID != selectedID {
		t.Fatalf("TerminalFontID = %q, want %q", state.TerminalFontID, selectedID)
	}

	recorder = httptest.NewRecorder()
	server.handleSettingsFont(recorder, httptest.NewRequest(http.MethodGet, "/api/settings/fonts/"+selectedID+"/file", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettingsFont(file) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "font/ttf" {
		t.Fatalf("Content-Type = %q, want font/ttf", contentType)
	}

	recorder = httptest.NewRecorder()
	server.handleSettingsFont(recorder, httptest.NewRequest(http.MethodGet, "/api/settings/fonts/"+state.TerminalSymbolFont.ID+"/file", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettingsFont(symbol file) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "font/ttf" {
		t.Fatalf("symbol Content-Type = %q, want font/ttf", contentType)
	}

	recorder = httptest.NewRecorder()
	server.handleSettingsFont(recorder, httptest.NewRequest(http.MethodDelete, "/api/settings/fonts/"+selectedID, nil))
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("handleSettingsFont(DELETE) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	server.handleSettings(recorder, httptest.NewRequest(http.MethodGet, "/api/settings", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings(GET after DELETE) status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	state = fonts.State{}
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode settings after delete response error = %v", err)
	}
	if state.TerminalFontID != "" {
		t.Fatalf("TerminalFontID after bundled delete = %q, want empty", state.TerminalFontID)
	}
	if len(state.Fonts) != 3 {
		t.Fatalf("bundled font count after delete = %d, want 3: %+v", len(state.Fonts), state.Fonts)
	}
	for _, font := range state.Fonts {
		if font.ID == selectedID {
			t.Fatalf("deleted bundled font still listed: %+v", state.Fonts)
		}
	}

	recorder = httptest.NewRecorder()
	server.handleSettingsFont(recorder, httptest.NewRequest(http.MethodGet, "/api/settings/fonts/"+selectedID+"/file", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("handleSettingsFont(deleted file) status = %d, want 404, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestBuildInstanceShellBootstrapScriptKeepsRootCompatibility(t *testing.T) {
	script := buildInstanceShellBootstrapScript("root", "")
	if containsAll(script, "exec su -s") {
		t.Fatalf("root compatibility script should not use su wrapper, got:\n%s", script)
	}
	if !containsAll(script,
		`__webshell_user="$(id -un 2>/dev/null || true)"`,
		`__webshell_shell="$(printf '%s\n' "$__webshell_entry" | cut -d: -f7)"`,
		`export SHELL="$__webshell_shell"`,
		`exec "$__webshell_shell"`,
	) {
		t.Fatalf("expected configured root shell bootstrap, got:\n%s", script)
	}
	if strings.Contains(script, `exec "${SHELL:-/bin/sh}"`) {
		t.Fatalf("root shell bootstrap should not execute inherited SHELL directly, got:\n%s", script)
	}
}

func TestBuildInstanceShellBootstrapScriptQuotesUsername(t *testing.T) {
	script := buildInstanceShellBootstrapScript("dev'user", "")
	if !containsAll(script, `user='dev'"'"'user'`) {
		t.Fatalf("expected shell-quoted username, got:\n%s", script)
	}
}

func TestBuildInstanceShellBootstrapScriptUsesInitialCWD(t *testing.T) {
	script := buildInstanceShellBootstrapScript("root", "/home/demo/project")
	if !containsAll(script, `__webshell_initial_cwd='/home/demo/project'`, `cd "$__webshell_initial_cwd"`) {
		t.Fatalf("expected root shell bootstrap to cd to initial cwd, got:\n%s", script)
	}
	userScript := buildInstanceShellBootstrapScript("admin", "/home/demo/project")
	if !containsAll(userScript, `__webshell_initial_cwd='/home/demo/project'`, `cd "$__webshell_initial_cwd"`, `setpriv --reuid "$uid"`) {
		t.Fatalf("expected user shell bootstrap to cd before dropping privileges, got:\n%s", userScript)
	}
}

func TestTerminalPaneFirstAttachAllowsGeneratedInputDuringReplay(t *testing.T) {
	pane := &terminalPane{
		clients: make(map[*paneClient]struct{}),
		history: newTestPaneHistory("\x1b[c"),
	}

	history, client, allowGeneratedInput, err := pane.attachClient()
	if err != nil {
		t.Fatalf("attachClient returned error: %v", err)
	}
	if got := string(history.bytes()); got != "\x1b[c" {
		t.Fatalf("unexpected history: %q", got)
	}
	if !allowGeneratedInput {
		t.Fatal("expected first attach to allow generated terminal input during replay")
	}
	pane.detachClient(client)

	_, client, allowGeneratedInput, err = pane.attachClient()
	if err != nil {
		t.Fatalf("second attachClient returned error: %v", err)
	}
	if allowGeneratedInput {
		t.Fatal("expected later attaches to suppress generated terminal input during replay")
	}
	pane.detachClient(client)
}

func TestHistoryLimitBytesForTerminalScrollback(t *testing.T) {
	if got, want := historyLimitBytesForTerminalScrollback(5000), 5000*averageHistoryBytesPerLine; got != want {
		t.Fatalf("historyLimitBytesForTerminalScrollback(5000) = %d, want %d", got, want)
	}
	if got, want := historyLimitBytesForTerminalScrollback(fonts.MinTerminalScrollback), fonts.MinTerminalScrollback*averageHistoryBytesPerLine; got != want {
		t.Fatalf("historyLimitBytesForTerminalScrollback(min) = %d, want %d", got, want)
	}
	if got, want := historyLimitBytesForTerminalScrollback(0), fonts.DefaultTerminalScrollback*averageHistoryBytesPerLine; got != want {
		t.Fatalf("historyLimitBytesForTerminalScrollback(0) = %d, want default %d", got, want)
	}
}

func TestTerminalPaneAppendOutputUsesDynamicHistoryLimit(t *testing.T) {
	workspace := &terminalWorkspace{}
	pane := &terminalPane{
		workspace:         workspace,
		clients:           make(map[*paneClient]struct{}),
		historyLimitBytes: 5,
	}

	pane.appendOutput([]byte("hello"))
	pane.appendOutput([]byte(" world"))

	if got, want := string(pane.history.snapshot().bytes()), " world"; got != want {
		t.Fatalf("pane history = %q, want %q", got, want)
	}
}

func TestTerminalWorkspaceSetHistoryLimitTrimsExistingPanes(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1", history: newTestPaneHistory("123456", "7890"), historyLimitBytes: 10},
			"pane-2": {id: "pane-2", history: newTestPaneHistory("ab", "cdef"), historyLimitBytes: 10},
		},
	}

	workspace.setHistoryLimitBytesLocked(4)

	if got := workspace.historyLimitBytes; got != 4 {
		t.Fatalf("workspace historyLimitBytes = %d, want 4", got)
	}
	if got, want := string(workspace.panes["pane-1"].history.snapshot().bytes()), "7890"; got != want {
		t.Fatalf("pane-1 history = %q, want %q", got, want)
	}
	if got, want := string(workspace.panes["pane-2"].history.snapshot().bytes()), "cdef"; got != want {
		t.Fatalf("pane-2 history = %q, want %q", got, want)
	}
	if got := workspace.panes["pane-1"].historyLimitBytes; got != 4 {
		t.Fatalf("pane-1 historyLimitBytes = %d, want 4", got)
	}
}

func TestTerminalPaneAppendOutputSplitsOversizedHistoryChunks(t *testing.T) {
	pane := &terminalPane{
		clients:           make(map[*paneClient]struct{}),
		historyLimitBytes: historyChunkMaxBytes * 3,
	}
	input := strings.Repeat("a", historyChunkMaxBytes+17)

	pane.appendOutput([]byte(input))

	if got, want := len(pane.history.chunks), 2; got != want {
		t.Fatalf("history chunk count = %d, want %d", got, want)
	}
	if got, want := len(pane.history.chunks[0]), historyChunkMaxBytes; got != want {
		t.Fatalf("first history chunk size = %d, want %d", got, want)
	}
	if got, want := len(pane.history.chunks[1]), 17; got != want {
		t.Fatalf("second history chunk size = %d, want %d", got, want)
	}
	if len(pane.history.chunks[0]) > 0 && len(pane.history.chunks[1]) > 0 && &pane.history.chunks[0][0] == &pane.history.chunks[1][0] {
		t.Fatal("expected oversized append to create independent chunk backing arrays")
	}
	if got := string(pane.history.snapshot().bytes()); got != input {
		t.Fatal("history chunks did not preserve oversized input")
	}
}

func TestTerminalPaneAppendOutputBroadcastsAllGeneratedChunks(t *testing.T) {
	pane := &terminalPane{
		clients:           make(map[*paneClient]struct{}),
		historyLimitBytes: historyChunkMaxBytes * 3,
	}
	_, client, _, err := pane.attachClient()
	if err != nil {
		t.Fatalf("attachClient returned error: %v", err)
	}
	defer pane.detachClient(client)
	input := strings.Repeat("b", historyChunkMaxBytes+11)

	pane.appendOutput([]byte(input))

	var got strings.Builder
	for i := 0; i < 2; i++ {
		select {
		case outbound := <-client.send:
			client.dequeued(len(outbound.payload))
			got.Write(outbound.payload)
		default:
			t.Fatalf("expected generated chunk %d to be queued", i+1)
		}
	}
	if got.String() != input {
		t.Fatal("queued chunks did not preserve oversized output")
	}
}

func TestPaneHistoryTrimRebuildsRemainingChunkSlice(t *testing.T) {
	history := newTestPaneHistory("drop", "keep")
	original := history.chunks

	history.trim(4)

	if got, want := string(history.snapshot().bytes()), "keep"; got != want {
		t.Fatalf("history = %q, want %q", got, want)
	}
	if len(history.chunks) != cap(history.chunks) {
		t.Fatalf("expected trim to rebuild chunk slice, len=%d cap=%d", len(history.chunks), cap(history.chunks))
	}
	if len(original) > 0 && original[0] != nil {
		t.Fatal("expected dropped chunk reference to be cleared")
	}
}

func TestTerminalPaneAttachSnapshotSurvivesLaterTrim(t *testing.T) {
	pane := &terminalPane{
		clients:           make(map[*paneClient]struct{}),
		history:           newTestPaneHistory("old", "keep"),
		historyLimitBytes: 4,
	}

	history, client, _, err := pane.attachClient()
	if err != nil {
		t.Fatalf("attachClient returned error: %v", err)
	}
	defer pane.detachClient(client)

	pane.appendOutput([]byte("newer"))

	if got, want := string(history.bytes()), "oldkeep"; got != want {
		t.Fatalf("snapshot history = %q, want %q", got, want)
	}
	if got, want := string(pane.history.snapshot().bytes()), "newer"; got != want {
		t.Fatalf("current history = %q, want %q", got, want)
	}
}

func TestTerminalPaneAttachClientQueuesLaterOutput(t *testing.T) {
	pane := &terminalPane{
		clients:           make(map[*paneClient]struct{}),
		history:           newTestPaneHistory("before"),
		historyLimitBytes: 1024,
	}

	history, client, _, err := pane.attachClient()
	if err != nil {
		t.Fatalf("attachClient returned error: %v", err)
	}
	defer pane.detachClient(client)

	pane.appendOutput([]byte("after"))

	if got, want := string(history.bytes()), "before"; got != want {
		t.Fatalf("snapshot history = %q, want %q", got, want)
	}
	select {
	case outbound := <-client.send:
		client.dequeued(len(outbound.payload))
		if got, want := string(outbound.payload), "after"; got != want {
			t.Fatalf("queued payload = %q, want %q", got, want)
		}
	default:
		t.Fatal("expected attach-time client to receive later output")
	}
}

func TestTerminalPaneRespondsToPrimaryDeviceAttributes(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("before\x1b[cafter"))
	if string(filtered) != "beforeafter" {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, primaryDeviceAttributesResponse)
}

func TestTerminalPaneRespondsToSplitPrimaryDeviceAttributes(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("before\x1b["))
	if string(filtered) != "before" {
		t.Fatalf("unexpected first filtered output: %q", string(filtered))
	}
	filtered = pane.filterTerminalQueryOutput([]byte("0cafter"))
	if string(filtered) != "after" {
		t.Fatalf("unexpected second filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, primaryDeviceAttributesResponse)
}

func TestTerminalPaneRespondsToSecondaryDeviceAttributes(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("\x1b[>0c"))
	if len(filtered) != 0 {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, secondaryDeviceAttributesResponse)
}

func TestTerminalPaneRespondsToOSCForegroundColor(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("before\x1b]10;?\aafter"))
	if string(filtered) != "beforeafter" {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, terminalOSCColorResponse("10", defaultTerminalForegroundColor))
}

func TestTerminalPaneRespondsToOSCColorWhenInputBlocked(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	pane.setInputBlocked(true)
	filtered := pane.filterTerminalQueryOutput([]byte("\x1b]10;?\a"))
	if len(filtered) != 0 {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, terminalOSCColorResponse("10", defaultTerminalForegroundColor))
}

func TestTerminalPaneRespondsToOSCBackgroundColor(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("\x1b]11;?\x1b\\"))
	if len(filtered) != 0 {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, terminalOSCColorResponse("11", defaultTerminalBackgroundColor))
}

func TestTerminalPaneRespondsToOSCCursorColor(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("\x1b]12;?\a"))
	if len(filtered) != 0 {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, terminalOSCColorResponse("12", defaultTerminalCursorColor))
}

func TestTerminalPaneRespondsToSplitOSCColorQuery(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("before\x1b]11;"))
	if string(filtered) != "before" {
		t.Fatalf("unexpected first filtered output: %q", string(filtered))
	}
	filtered = pane.filterTerminalQueryOutput([]byte("?\x1b\\after"))
	if string(filtered) != "after" {
		t.Fatalf("unexpected second filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, terminalOSCColorResponse("11", defaultTerminalBackgroundColor))
}

func TestTerminalPaneRespondsToOSCColorFromTheme(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()
	pane.updateTerminalThemeColors("#403513", "#fdf6e3", "#403513")

	filtered := pane.filterTerminalQueryOutput([]byte("\x1b]11;?\a"))
	if len(filtered) != 0 {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, "\x1b]11;rgb:fdfd/f6f6/e3e3\a")
}

func TestTerminalPaneThemeControlUpdatesOSCColor(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	if !handleTerminalControlMessage(pane, []byte(`{"type":"theme","foreground":"#403513","background":"#fdf6e3","cursor":"#403513"}`), nil) {
		t.Fatal("theme control message should keep the connection open")
	}
	filtered := pane.filterTerminalQueryOutput([]byte("\x1b]11;?\a"))
	if len(filtered) != 0 {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	assertTerminalQueryResponse(t, reader, "\x1b]11;rgb:fdfd/f6f6/e3e3\a")
}

func TestTerminalPaneKeepsNonQueryOSC(t *testing.T) {
	pane := &terminalPane{}
	input := []byte("before\x1b]0;title\aafter")

	filtered := pane.filterTerminalQueryOutput(input)
	if string(filtered) != string(input) {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
}

func TestTerminalPaneGeneratedInputBypassesInputBlock(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	pane.setInputBlocked(true)
	if err := pane.writeInput([]byte("user")); err != nil {
		t.Fatalf("blocked user input returned error: %v", err)
	}
	generated := []byte("\x1b]10;rgb:0000/cdcd/0000\a")
	pane.expectGeneratedInput(generated, 1)
	if err := pane.writeGeneratedInput(generated); err != nil {
		t.Fatalf("generated input returned error: %v", err)
	}
	assertTerminalQueryOutput(t, pane, reader, string(generated))
}

func TestTerminalPaneInputAppliesClientSize(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()
	pane.cols = 80
	pane.rows = 24

	if err := pane.writeInputWithSize([]byte("pc"), 132, 43); err != nil {
		t.Fatalf("writeInputWithSize returned error: %v", err)
	}
	pane.mu.Lock()
	cols := pane.cols
	rows := pane.rows
	pane.mu.Unlock()
	if cols != 132 || rows != 43 {
		t.Fatalf("pane size = %dx%d, want 132x43", cols, rows)
	}
	assertTerminalQueryOutput(t, pane, reader, "pc")
}

func TestTerminalControlInputAppliesClientSize(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()
	pane.cols = 80
	pane.rows = 24

	if !handleTerminalControlMessage(pane, []byte(`{"type":"input","data":"mobile","cols":41,"rows":18}`), nil) {
		t.Fatal("input control message should keep the connection open")
	}
	pane.mu.Lock()
	cols := pane.cols
	rows := pane.rows
	pane.mu.Unlock()
	if cols != 41 || rows != 18 {
		t.Fatalf("pane size = %dx%d, want 41x18", cols, rows)
	}
	assertTerminalQueryOutput(t, pane, reader, "mobile")
}

func TestTerminalPaneFiltersGeneratedInputEcho(t *testing.T) {
	pane := &terminalPane{}
	pane.addGeneratedEchoFilter([]byte("\x1b[45;1R"))

	filtered := pane.filterGeneratedInputEcho([]byte("before^[[45;1Rafter"))
	if string(filtered) != "beforeafter" {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
}

func TestTerminalPaneFiltersSplitGeneratedInputEcho(t *testing.T) {
	pane := &terminalPane{}
	pane.addGeneratedEchoFilter([]byte("\x1b[45;1R"))

	filtered := pane.filterGeneratedInputEcho([]byte("before^["))
	if string(filtered) != "before" {
		t.Fatalf("unexpected first filtered output: %q", string(filtered))
	}
	filtered = pane.filterGeneratedInputEcho([]byte("[45;1Rafter"))
	if string(filtered) != "after" {
		t.Fatalf("unexpected second filtered output: %q", string(filtered))
	}
}

func TestTerminalPaneKeepsUnregisteredGeneratedInputEchoText(t *testing.T) {
	pane := &terminalPane{}
	input := []byte("before^[[45;1Rafter")

	filtered := pane.filterGeneratedInputEcho(input)
	if string(filtered) != string(input) {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
}

func TestTerminalPaneKeepsNonDeviceAttributeCSI(t *testing.T) {
	pane := &terminalPane{}
	input := []byte("before\x1b[31mcolor\x1b[1cafter")

	filtered := pane.filterTerminalQueryOutput(input)
	if string(filtered) != string(input) {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
}

func TestTerminalPaneDedupesGeneratedCursorReports(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("\x1b[6n"))
	if string(filtered) != "\x1b[6n" {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	if err := pane.writeGeneratedInput([]byte("\x1b[38;3R")); err != nil {
		t.Fatalf("first generated cursor report returned error: %v", err)
	}
	if err := pane.writeGeneratedInput([]byte("\x1b[38;3R")); err != nil {
		t.Fatalf("duplicate generated cursor report returned error: %v", err)
	}
	assertTerminalQueryOutput(t, pane, reader, "\x1b[38;3R")
}

func TestTerminalPaneDedupesPlainCursorReports(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("\x1b[6n"))
	if string(filtered) != "\x1b[6n" {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	if err := pane.writeInput([]byte("\x1b[38;3R")); err != nil {
		t.Fatalf("first plain cursor report returned error: %v", err)
	}
	if err := pane.writeInput([]byte("\x1b[24;1R")); err != nil {
		t.Fatalf("duplicate plain cursor report returned error: %v", err)
	}
	assertTerminalQueryOutput(t, pane, reader, "\x1b[38;3R")
}

func TestTerminalPaneDropsPlainCursorReportTailsInQueryWindow(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	filtered := pane.filterTerminalQueryOutput([]byte("\x1b[6n"))
	if string(filtered) != "\x1b[6n" {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
	if err := pane.writeInput([]byte("38;3R")); err != nil {
		t.Fatalf("tail cursor report returned error: %v", err)
	}
	if err := pane.writeInput([]byte("[24;1R")); err != nil {
		t.Fatalf("bracketed tail cursor report returned error: %v", err)
	}
	if err := pane.writeInput([]byte("6R")); err != nil {
		t.Fatalf("short tail cursor report returned error: %v", err)
	}
	if err := pane.writeInput([]byte(";3R")); err != nil {
		t.Fatalf("semicolon tail cursor report returned error: %v", err)
	}
	if err := pane.writeInput([]byte(";3R38;3R")); err != nil {
		t.Fatalf("combined tail cursor report returned error: %v", err)
	}
	if err := pane.writeGeneratedInput([]byte("\x1b[39;4R")); err != nil {
		t.Fatalf("expected generated cursor report returned error: %v", err)
	}
	assertTerminalQueryOutput(t, pane, reader, "\x1b[39;4R")
}

func TestTerminalPaneAllowsCursorReportTextOutsideQueryWindow(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	if err := pane.writeInput([]byte("38;3R")); err != nil {
		t.Fatalf("plain text cursor report tail returned error: %v", err)
	}
	assertTerminalQueryOutput(t, pane, reader, "38;3R")
}

func TestTerminalPaneDropsUnexpectedGeneratedCursorReport(t *testing.T) {
	pane, reader, cleanup := newTerminalQueryTestPane(t)
	defer cleanup()

	if err := pane.writeGeneratedInput([]byte("\x1b[38;3R")); err != nil {
		t.Fatalf("unexpected generated cursor report returned error: %v", err)
	}
	if pane.pendingCursorReports != 0 {
		t.Fatalf("unexpected pending cursor report count: %d", pane.pendingCursorReports)
	}
	pane.expectGeneratedCursorReport(1)
	if err := pane.writeGeneratedInput([]byte("\x1b[39;4R")); err != nil {
		t.Fatalf("expected generated cursor report returned error: %v", err)
	}
	assertTerminalQueryResponse(t, reader, "\x1b[39;4R")
}

func TestTerminalPaneInputLockDropsWrites(t *testing.T) {
	pane := &terminalPane{}
	pane.setInputBlocked(true)
	if err := pane.writeInput([]byte("blocked")); err != nil {
		t.Fatalf("blocked writeInput returned error: %v", err)
	}
	pane.setInputBlocked(false)
	if err := pane.writeInput([]byte("unblocked")); err == nil {
		t.Fatal("expected unblocked writeInput without pty to fail")
	}
}

func TestTerminalPaneInputLockOwnersAreIndependent(t *testing.T) {
	pane := &terminalPane{}
	pane.setInputBlockedBy("one", true)
	pane.setInputBlockedBy("two", true)
	pane.setInputBlockedBy("one", false)
	if err := pane.writeInput([]byte("still blocked")); err != nil {
		t.Fatalf("writeInput should stay blocked while another owner holds the lock: %v", err)
	}
	pane.setInputBlockedBy("two", false)
	if err := pane.writeInput([]byte("unblocked")); err == nil {
		t.Fatal("expected writeInput to fail after all input locks are released")
	}
}

func TestTerminalControlInputLockTogglesPaneWrites(t *testing.T) {
	pane := &terminalPane{}
	if !handleTerminalControlMessage(pane, []byte(`{"type":"input_lock","blocked":true}`), nil) {
		t.Fatal("input_lock control message should keep the connection open")
	}
	if err := pane.writeInput([]byte("blocked")); err != nil {
		t.Fatalf("writeInput should be dropped while locked: %v", err)
	}
	if !handleTerminalControlMessage(pane, []byte(`{"type":"input_lock","blocked":false}`), nil) {
		t.Fatal("input unlock control message should keep the connection open")
	}
	if err := pane.writeInput([]byte("unblocked")); err == nil {
		t.Fatal("expected writeInput to fail after input lock is released")
	}
}

func TestTerminalPTYInputChunkLimitIsBelowWebSocketReadLimit(t *testing.T) {
	if terminalPTYInputChunkBytes <= 0 {
		t.Fatal("terminalPTYInputChunkBytes must be positive")
	}
	if terminalPTYInputChunkBytes > 16<<10 {
		t.Fatalf("terminalPTYInputChunkBytes = %d, want at most 16KiB", terminalPTYInputChunkBytes)
	}
	if terminalPTYInputChunkBytes >= websocketReadLimit {
		t.Fatalf("terminalPTYInputChunkBytes = %d must stay below websocketReadLimit = %d", terminalPTYInputChunkBytes, websocketReadLimit)
	}
}

func TestPluginServerTerminalInputLockOwnersAreIndependent(t *testing.T) {
	server := &pluginServer{}
	scope := normalizeAgentScope("demo@owner", "user-a")
	server.setTerminalInputBlocked(scope, "one", true)
	server.setTerminalInputBlocked(scope, "two", true)
	server.setTerminalInputBlocked(scope, "one", false)
	if !server.terminalInputBlocked(scope, "") {
		t.Fatal("expected terminal input to stay blocked while another owner holds the lock")
	}
	server.setTerminalInputBlocked(scope, "two", false)
	if server.terminalInputBlocked(scope, "") {
		t.Fatal("expected terminal input to be unblocked after all owners release")
	}
}

func TestPluginServerTerminalInputLockMatchesClient(t *testing.T) {
	server := &pluginServer{}
	scope := normalizeAgentScope("demo@owner", "user-a")
	server.setTerminalInputBlocked(scope, serverRevisionInputLockOwner("client-one"), true)
	if !server.terminalInputBlocked(scope, "client-one") {
		t.Fatal("expected matching client to be blocked")
	}
	if server.terminalInputBlocked(scope, "client-two") {
		t.Fatal("expected different client to remain unblocked")
	}
	if !server.terminalInputBlocked(scope, "") {
		t.Fatal("expected legacy websocket without client id to be blocked by any active lock")
	}
}

func TestPluginServerTerminalInputLockClearsExplicitly(t *testing.T) {
	server := &pluginServer{}
	scope := normalizeAgentScope("demo@owner", "user-a")
	clientID := "client-one"
	server.setTerminalInputBlocked(scope, serverRevisionInputLockOwner(clientID), true)
	server.setTerminalInputBlocked(scope, serverRevisionInputLockOwner(clientID), false)
	if server.terminalInputBlocked(scope, clientID) {
		t.Fatal("expected matching client lock to be cleared explicitly")
	}
}

func TestPluginServerTerminalInputLockExpires(t *testing.T) {
	server := &pluginServer{}
	scope := normalizeAgentScope("demo@owner", "user-a")
	clientID := "client-one"
	owner := serverRevisionInputLockOwner(clientID)
	server.setTerminalInputBlocked(scope, owner, true)
	key := scope.cacheKey()
	server.inputLocksMu.Lock()
	server.inputLocks[key][owner] = time.Now().Add(-time.Second)
	server.inputLocksMu.Unlock()
	if server.terminalInputBlocked(scope, clientID) {
		t.Fatal("expected expired matching client lock to be ignored")
	}
}

func TestPluginServerTerminalInputLockIsAccountScoped(t *testing.T) {
	server := &pluginServer{}
	first := normalizeAgentScope("demo@owner", "user-a")
	second := normalizeAgentScope("demo@owner", "user-b")
	server.setTerminalInputBlocked(first, serverRevisionInputLockOwner("client-one"), true)
	if server.terminalInputBlocked(second, "client-one") {
		t.Fatal("expected input lock to stay scoped to the owning account")
	}
}

func TestAgentSocketPathIsSelectorScoped(t *testing.T) {
	a := agentSocketPath("a@owner")
	b := agentSocketPath("b@owner")
	if a == b {
		t.Fatalf("expected distinct socket paths, got %q", a)
	}
	if !strings.HasPrefix(a, "/tmp/lcmd-webshell-agent-") || !strings.HasSuffix(a, ".sock") {
		t.Fatalf("unexpected selector socket path %q", a)
	}
	if len(a) >= 108 {
		t.Fatalf("selector socket path is too long for common unix socket limits: %d", len(a))
	}
	if agentSocketPath("") != defaultAgentSocketPath {
		t.Fatalf("empty selector should keep default socket path")
	}
}

func TestScopedAgentSocketPathIncludesAccount(t *testing.T) {
	first := normalizeAgentScope("demo@owner", "user-a")
	second := normalizeAgentScope("demo@owner", "user-b")
	if first.cacheKey() == second.cacheKey() {
		t.Fatal("expected distinct cache keys for different accounts")
	}
	firstPath := scopedAgentSocketPath(first)
	secondPath := scopedAgentSocketPath(second)
	if firstPath == secondPath {
		t.Fatalf("expected distinct scoped socket paths, got %q", firstPath)
	}
	if firstPath != scopedAgentSocketPath(normalizeAgentScope(" demo@owner ", " user-a ")) {
		t.Fatal("expected scoped socket path to be stable after trimming")
	}
	if !strings.HasPrefix(firstPath, "/tmp/lcmd-webshell-agent-") || !strings.HasSuffix(firstPath, ".sock") {
		t.Fatalf("unexpected scoped socket path %q", firstPath)
	}
	if len(firstPath) >= 108 {
		t.Fatalf("scoped socket path is too long for common unix socket limits: %d", len(firstPath))
	}
}

func TestAgentDaemonRejectsMismatchedSelector(t *testing.T) {
	daemon := &agentDaemon{
		selector: "a@owner",
		workspace: &terminalWorkspace{
			selector: "a@owner",
			panes:    make(map[string]*terminalPane),
		},
	}
	if err := daemon.validateRequestSelectorLocked("b@owner"); err == nil {
		t.Fatal("expected mismatched selector to be rejected")
	}
	if daemon.selector != "a@owner" {
		t.Fatalf("mismatched request changed daemon selector to %q", daemon.selector)
	}
}

func TestAgentDaemonRejectsMismatchedAccount(t *testing.T) {
	daemon := &agentDaemon{accountID: "user-a"}
	if err := daemon.validateRequestAccountLocked("user-b"); err == nil {
		t.Fatal("expected mismatched account to be rejected")
	}
	if err := daemon.validateRequestAccountLocked(""); err == nil {
		t.Fatal("expected empty account to be rejected when daemon is account-scoped")
	}
}

func TestHandleWorkspaceRequiresAccountHeader(t *testing.T) {
	server := &pluginServer{}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/workspace?name=demo@owner", nil)
	server.handleWorkspace(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("handleWorkspace status = %d, want 401", recorder.Code)
	}
}

func TestHandleWorkspaceAllowsVisibleSelector(t *testing.T) {
	server := testPluginServerWithInstances()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/workspace?name=beta@deploy-b", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	server.handleWorkspace(recorder, request)
	if recorder.Code == http.StatusForbidden {
		t.Fatalf("handleWorkspace status = %d, should allow visible selector", recorder.Code)
	}
}

func TestHandleWorkspaceActivityRequiresAccountHeader(t *testing.T) {
	server := &pluginServer{}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/workspace/activity?name=demo@owner", nil)
	server.handleWorkspaceActivity(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("handleWorkspaceActivity status = %d, want 401", recorder.Code)
	}
}

func TestHandleWorkspaceActivityAllowsVisibleSelector(t *testing.T) {
	server := testPluginServerWithInstances()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/workspace/activity?name=beta@deploy-b", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	server.handleWorkspaceActivity(recorder, request)
	if recorder.Code == http.StatusForbidden {
		t.Fatalf("handleWorkspaceActivity status = %d, should allow visible selector", recorder.Code)
	}
}

func TestAttachPersistentPaneRequiresAccountHeader(t *testing.T) {
	server := &pluginServer{}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/ws?name=demo@owner&pane=pane-1", nil)
	if err := server.attachPersistentPane(recorder, request, 80, 24); err != nil {
		t.Fatalf("attachPersistentPane returned error: %v", err)
	}
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("attachPersistentPane status = %d, want 401", recorder.Code)
	}
}

func TestAttachPersistentPaneAllowsVisibleSelector(t *testing.T) {
	server := testPluginServerWithInstances()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/ws?name=beta@deploy-b&pane=pane-1", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	if err := server.attachPersistentPane(recorder, request, 80, 24); err != nil {
		t.Fatalf("attachPersistentPane returned error: %v", err)
	}
	if recorder.Code == http.StatusForbidden {
		t.Fatalf("attachPersistentPane status = %d, should allow visible selector", recorder.Code)
	}
}

func TestHandleServerRevisionRequiresAccountHeaderForScopedState(t *testing.T) {
	server := &pluginServer{}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/server-revision?name=demo@owner&client_id=client-one", nil)
	server.handleServerRevision(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("handleServerRevision status = %d, want 401", recorder.Code)
	}
}

func TestHandleServerRevisionAllowsVisibleSelector(t *testing.T) {
	server := testPluginServerWithInstances()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/server-revision?name=beta@deploy-b&client_id=client-one", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	server.handleServerRevision(recorder, request)
	if recorder.Code == http.StatusForbidden {
		t.Fatalf("handleServerRevision status = %d, should allow visible selector", recorder.Code)
	}
}

func TestHandleServerRevisionInputLockOnlyRequestDoesNotProbeRevision(t *testing.T) {
	server := testPluginServerWithInstances()
	scope := normalizeAgentScope("beta@deploy-b", "login-user-a")
	clientID := "client-one"
	server.setTerminalInputBlocked(scope, serverRevisionInputLockOwner(clientID), true)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/server-revision?name=beta@deploy-b&client_id=client-one&terminal_input_blocked=false", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	server.handleServerRevision(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleServerRevision status = %d, want 200; body=%q", recorder.Code, recorder.Body.String())
	}
	if server.terminalInputBlocked(scope, clientID) {
		t.Fatal("expected explicit startup unlock to clear matching client input lock")
	}
	var info serverRevisionInfo
	if err := json.Unmarshal(recorder.Body.Bytes(), &info); err != nil {
		t.Fatalf("unmarshal server revision response: %v", err)
	}
	if info.ReloadRequired {
		t.Fatal("input lock only request should not run revision observation or request reload")
	}
}

func TestAgentHistoryReplayFramesIncludeSelectorAndPane(t *testing.T) {
	var out bytes.Buffer
	history := paneHistorySnapshot{chunks: [][]byte{[]byte("hello")}}
	if !writeAgentHistoryReplay(&out, "demo@owner", "pane-1", history, false) {
		t.Fatal("writeAgentHistoryReplay returned false")
	}

	frameType, payload, err := readAgentFrame(&out)
	if err != nil {
		t.Fatalf("reading replay start returned error: %v", err)
	}
	if frameType != agentFrameText {
		t.Fatalf("expected text start frame, got %q", frameType)
	}
	var start map[string]any
	if err := json.Unmarshal(payload, &start); err != nil {
		t.Fatalf("unmarshal replay start returned error: %v", err)
	}
	if start["type"] != "history-replay-start" || start["selector"] != "demo@owner" || start["pane_id"] != "pane-1" {
		t.Fatalf("unexpected replay start payload: %+v", start)
	}

	frameType, payload, err = readAgentFrame(&out)
	if err != nil {
		t.Fatalf("reading replay history returned error: %v", err)
	}
	if frameType != agentFrameBinary || string(payload) != "hello" {
		t.Fatalf("unexpected replay history frame: type=%q payload=%q", frameType, string(payload))
	}

	frameType, payload, err = readAgentFrame(&out)
	if err != nil {
		t.Fatalf("reading replay complete returned error: %v", err)
	}
	if frameType != agentFrameText {
		t.Fatalf("expected text complete frame, got %q", frameType)
	}
	var complete map[string]any
	if err := json.Unmarshal(payload, &complete); err != nil {
		t.Fatalf("unmarshal replay complete returned error: %v", err)
	}
	if complete["type"] != "history-replay-complete" || complete["selector"] != "demo@owner" || complete["pane_id"] != "pane-1" {
		t.Fatalf("unexpected replay complete payload: %+v", complete)
	}
}

func TestAgentHistoryReplayWritesMultipleChunksInOrder(t *testing.T) {
	var out bytes.Buffer
	history := paneHistorySnapshot{chunks: [][]byte{[]byte("one"), []byte("two")}}
	if !writeAgentHistoryReplay(&out, "demo@owner", "pane-1", history, false) {
		t.Fatal("writeAgentHistoryReplay returned false")
	}

	frameType, _, err := readAgentFrame(&out)
	if err != nil {
		t.Fatalf("reading replay start returned error: %v", err)
	}
	if frameType != agentFrameText {
		t.Fatalf("expected text start frame, got %q", frameType)
	}
	for _, want := range []string{"one", "two"} {
		frameType, payload, err := readAgentFrame(&out)
		if err != nil {
			t.Fatalf("reading replay chunk returned error: %v", err)
		}
		if frameType != agentFrameBinary || string(payload) != want {
			t.Fatalf("unexpected replay chunk: type=%q payload=%q want=%q", frameType, string(payload), want)
		}
	}
	frameType, _, err = readAgentFrame(&out)
	if err != nil {
		t.Fatalf("reading replay complete returned error: %v", err)
	}
	if frameType != agentFrameText {
		t.Fatalf("expected text complete frame, got %q", frameType)
	}
}

func TestAgentHistoryReplayWritesStartAndCompleteForEmptyHistory(t *testing.T) {
	var out bytes.Buffer
	if !writeAgentHistoryReplay(&out, "demo@owner", "pane-1", paneHistorySnapshot{}, true) {
		t.Fatal("writeAgentHistoryReplay returned false")
	}

	frameType, payload, err := readAgentFrame(&out)
	if err != nil {
		t.Fatalf("reading replay start returned error: %v", err)
	}
	if frameType != agentFrameText {
		t.Fatalf("expected text start frame, got %q", frameType)
	}
	var start map[string]any
	if err := json.Unmarshal(payload, &start); err != nil {
		t.Fatalf("unmarshal replay start returned error: %v", err)
	}
	if start["type"] != "history-replay-start" || start["allow_generated_input"] != true {
		t.Fatalf("unexpected replay start payload: %+v", start)
	}

	frameType, payload, err = readAgentFrame(&out)
	if err != nil {
		t.Fatalf("reading replay complete returned error: %v", err)
	}
	if frameType != agentFrameText {
		t.Fatalf("expected text complete frame, got %q", frameType)
	}
	var complete map[string]any
	if err := json.Unmarshal(payload, &complete); err != nil {
		t.Fatalf("unmarshal replay complete returned error: %v", err)
	}
	if complete["type"] != "history-replay-complete" {
		t.Fatalf("unexpected replay complete payload: %+v", complete)
	}
}

func TestHandleAgentAttachControlMessageDropsInputWhenServerLocked(t *testing.T) {
	var blocked bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &blocked, []byte(`{"type":"input","data":"8;36R"}`), true, nil) {
		t.Fatal("blocked input message should keep the connection open")
	}
	if blocked.Len() != 0 {
		t.Fatalf("expected blocked input to be dropped, got %d framed bytes", blocked.Len())
	}

	var allowed bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &allowed, []byte(`{"type":"input","data":"6;55R"}`), false, nil) {
		t.Fatal("allowed input message should keep the connection open")
	}
	frameType, payload, err := readAgentFrame(&allowed)
	if err != nil {
		t.Fatalf("reading forwarded input frame returned error: %v", err)
	}
	if frameType != agentFrameInput || string(payload) != "6;55R" {
		t.Fatalf("unexpected forwarded frame: type=%q payload=%q", frameType, string(payload))
	}

	var sized bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &sized, []byte(`{"type":"input","data":"pc","cols":132,"rows":43}`), false, nil) {
		t.Fatal("sized input message should keep the connection open")
	}
	frameType, payload, err = readAgentFrame(&sized)
	if err != nil {
		t.Fatalf("reading forwarded sized resize frame returned error: %v", err)
	}
	if frameType != agentFrameResize {
		t.Fatalf("unexpected sized resize frame type: %q", frameType)
	}
	var resizeMessage terminalControlMessage
	if err := json.Unmarshal(payload, &resizeMessage); err != nil {
		t.Fatalf("unmarshal sized resize frame returned error: %v", err)
	}
	if resizeMessage.Type != "resize" || resizeMessage.Cols != 132 || resizeMessage.Rows != 43 {
		t.Fatalf("unexpected sized resize frame payload: %+v", resizeMessage)
	}
	frameType, payload, err = readAgentFrame(&sized)
	if err != nil {
		t.Fatalf("reading forwarded sized input frame returned error: %v", err)
	}
	if frameType != agentFrameInput || string(payload) != "pc" {
		t.Fatalf("unexpected sized input frame: type=%q payload=%q", frameType, string(payload))
	}

	var themed bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &themed, []byte(`{"type":"input","data":"light","foreground":"#403513","background":"#fdf6e3","cursor":"#403513"}`), false, nil) {
		t.Fatal("themed input message should keep the connection open")
	}
	frameType, payload, err = readAgentFrame(&themed)
	if err != nil {
		t.Fatalf("reading forwarded theme frame returned error: %v", err)
	}
	if frameType != agentFrameResize {
		t.Fatalf("unexpected theme frame type: %q", frameType)
	}
	var themeMessage terminalControlMessage
	if err := json.Unmarshal(payload, &themeMessage); err != nil {
		t.Fatalf("unmarshal forwarded theme frame returned error: %v", err)
	}
	if themeMessage.Type != "theme" || themeMessage.Foreground != "#403513" || themeMessage.Background != "#fdf6e3" || themeMessage.Cursor != "#403513" {
		t.Fatalf("unexpected forwarded theme frame payload: %+v", themeMessage)
	}
	frameType, payload, err = readAgentFrame(&themed)
	if err != nil {
		t.Fatalf("reading forwarded themed input frame returned error: %v", err)
	}
	if frameType != agentFrameInput || string(payload) != "light" {
		t.Fatalf("unexpected themed input frame: type=%q payload=%q", frameType, string(payload))
	}

	var themeOnly bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &themeOnly, []byte(`{"type":"theme","foreground":"#403513","background":"#fdf6e3","cursor":"#403513"}`), false, nil) {
		t.Fatal("theme message should keep the connection open")
	}
	frameType, payload, err = readAgentFrame(&themeOnly)
	if err != nil {
		t.Fatalf("reading forwarded theme-only frame returned error: %v", err)
	}
	if frameType != agentFrameResize {
		t.Fatalf("unexpected theme-only frame type: %q", frameType)
	}
	if err := json.Unmarshal(payload, &themeMessage); err != nil {
		t.Fatalf("unmarshal forwarded theme-only frame returned error: %v", err)
	}
	if themeMessage.Type != "theme" || themeMessage.Background != "#fdf6e3" {
		t.Fatalf("unexpected forwarded theme-only frame payload: %+v", themeMessage)
	}

	var generated bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &generated, []byte(`{"type":"input","data":"\u001b[45;1R","generated":true}`), false, nil) {
		t.Fatal("generated input message should keep the connection open")
	}
	frameType, payload, err = readAgentFrame(&generated)
	if err != nil {
		t.Fatalf("reading forwarded generated input frame returned error: %v", err)
	}
	if frameType != agentFrameGeneratedInput || string(payload) != "\x1b[45;1R" {
		t.Fatalf("unexpected generated frame: type=%q payload=%q", frameType, string(payload))
	}

	var blockedGenerated bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &blockedGenerated, []byte(`{"type":"input","data":"\u001b]10;rgb:0000/cdcd/0000\u0007","generated":true}`), true, nil) {
		t.Fatal("blocked generated input message should keep the connection open")
	}
	frameType, payload, err = readAgentFrame(&blockedGenerated)
	if err != nil {
		t.Fatalf("reading blocked generated input frame returned error: %v", err)
	}
	if frameType != agentFrameGeneratedInput || string(payload) != "\x1b]10;rgb:0000/cdcd/0000\a" {
		t.Fatalf("unexpected blocked generated frame: type=%q payload=%q", frameType, string(payload))
	}
}

func TestHandleAgentAttachControlMessageUsesConnectionLocalInputLock(t *testing.T) {
	var out bytes.Buffer
	localBlocked := false
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &out, []byte(`{"type":"input_lock","blocked":true}`), false, &localBlocked) {
		t.Fatal("input_lock control message should keep the connection open")
	}
	if !localBlocked {
		t.Fatal("expected local input lock to be enabled")
	}
	if out.Len() != 0 {
		t.Fatalf("expected input_lock to stay local, got %d framed bytes", out.Len())
	}
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &out, []byte(`{"type":"input_lock","blocked":false}`), true, &localBlocked) {
		t.Fatal("input unlock control message should keep the connection open")
	}
	if localBlocked {
		t.Fatal("expected local input lock to be disabled")
	}
	if out.Len() != 0 {
		t.Fatalf("expected input unlock to stay local, got %d framed bytes", out.Len())
	}
}

func newTerminalQueryTestPane(t *testing.T) (*terminalPane, *os.File, func()) {
	t.Helper()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe returned error: %v", err)
	}
	pane := &terminalPane{ptyFile: writer}
	return pane, reader, func() {
		_ = reader.Close()
		_ = writer.Close()
	}
}

func assertTerminalQueryResponse(t *testing.T, reader io.Reader, expected string) {
	t.Helper()
	buf := make([]byte, len(expected))
	if _, err := io.ReadFull(reader, buf); err != nil {
		t.Fatalf("reading terminal query response returned error: %v", err)
	}
	if string(buf) != expected {
		t.Fatalf("unexpected terminal query response: %q", string(buf))
	}
}

func assertTerminalQueryOutput(t *testing.T, pane *terminalPane, reader io.Reader, expected string) {
	t.Helper()
	if pane.ptyFile != nil {
		_ = pane.ptyFile.Close()
		pane.ptyFile = nil
	}
	data, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("reading terminal query output returned error: %v", err)
	}
	if string(data) != expected {
		t.Fatalf("unexpected terminal query output: %q", string(data))
	}
}

func TestParseProcStatWithSpacesAndParenInComm(t *testing.T) {
	stat := "1234 (my shell) S 1 2222 3333 34816 4444 0 0 0 0 0 0"
	info, err := parseProcStat(stat)
	if err != nil {
		t.Fatalf("parseProcStat returned error: %v", err)
	}
	if info.PID != 1234 || info.Comm != "my shell" || info.Pgrp != 2222 || info.TTYNr != 34816 || info.TPgid != 4444 {
		t.Fatalf("unexpected proc stat parse: %+v", info)
	}
}

func TestResolveTTYActivityUsesForegroundProcessGroup(t *testing.T) {
	processes := []procInfo{
		{PID: 10, Comm: "bash", Cmd: "/bin/bash", CWD: "/home/demo", FD0: "/dev/pts/1", Pgrp: 10, TTYNr: 34816, TPgid: 20},
		{PID: 20, Comm: "vim", Cmd: "/usr/bin/vim file.txt", CWD: "/home/demo/project", FD0: "/dev/pts/1", Pgrp: 20, TTYNr: 34816, TPgid: 20},
		{PID: 30, Comm: "sleep", Cmd: "/usr/bin/sleep 9", FD0: "/dev/pts/2", Pgrp: 30, TTYNr: 34817, TPgid: 30},
	}
	activity := resolveTTYActivity("/dev/pts/1", processes)
	if !activity.Busy {
		t.Fatalf("expected tty to be busy: %+v", activity)
	}
	if activity.Command != "vim" {
		t.Fatalf("expected foreground command vim, got %q", activity.Command)
	}
	if activity.CommandLine != "/usr/bin/vim file.txt" {
		t.Fatalf("expected foreground command line, got %q", activity.CommandLine)
	}
	if activity.CWD != "/home/demo/project" {
		t.Fatalf("expected foreground cwd, got %q", activity.CWD)
	}
}

func TestResolveTTYActivityTreatsIdleShellAsNotBusy(t *testing.T) {
	processes := []procInfo{
		{PID: 10, Comm: "bash", Cmd: "-bash", CWD: "/home/demo", FD0: "/dev/pts/1", Pgrp: 10, TTYNr: 34816, TPgid: 10},
	}
	activity := resolveTTYActivity("/dev/pts/1", processes)
	if activity.Busy {
		t.Fatalf("expected idle shell to be not busy: %+v", activity)
	}
	if activity.Command != "bash" {
		t.Fatalf("expected fallback command bash, got %q", activity.Command)
	}
	if activity.CommandLine != "-bash" {
		t.Fatalf("expected fallback command line, got %q", activity.CommandLine)
	}
	if activity.CWD != "/home/demo" {
		t.Fatalf("expected idle shell cwd, got %q", activity.CWD)
	}
}

func TestParseProcScanOutputIncludesCWD(t *testing.T) {
	output := []byte("P\t10\t/dev/pts/1\t/home/demo/project\t/bin/bash\t10 (bash) S 1 10 10 34816 10 0 0\n")
	processes := parseProcScanOutput(output)
	if len(processes) != 1 {
		t.Fatalf("expected one process, got %+v", processes)
	}
	if processes[0].CWD != "/home/demo/project" || processes[0].Cmd != "/bin/bash" {
		t.Fatalf("unexpected parsed process: %+v", processes[0])
	}
}

func TestScanProcActivitiesUsesForegroundProcessGroup(t *testing.T) {
	procRoot := t.TempDir()
	writeFakeProc(t, procRoot, fakeProc{
		pid:     10,
		comm:    "bash",
		pgrp:    10,
		ttyNr:   34816,
		tpgid:   20,
		fd0:     "/dev/pts/1",
		cwd:     "/home/demo",
		cmdline: "/bin/bash\x00",
	})
	writeFakeProc(t, procRoot, fakeProc{
		pid:     20,
		comm:    "vim",
		pgrp:    20,
		ttyNr:   34816,
		tpgid:   20,
		fd0:     "/dev/pts/1",
		cwd:     "/home/demo/project",
		cmdline: "/usr/bin/vim\x00file.txt\x00",
	})
	writeFakeProc(t, procRoot, fakeProc{
		pid:     30,
		comm:    "sleep",
		pgrp:    30,
		ttyNr:   34817,
		tpgid:   30,
		fd0:     "/dev/pts/2",
		cwd:     "/tmp",
		cmdline: "/usr/bin/sleep\x009\x00",
	})

	activities, err := scanProcActivities(context.Background(), procRoot, []string{"/dev/pts/1"})
	if err != nil {
		t.Fatalf("scanProcActivities returned error: %v", err)
	}
	activity := activities["/dev/pts/1"]
	if !activity.Busy {
		t.Fatalf("expected tty to be busy: %+v", activity)
	}
	if activity.Command != "vim" {
		t.Fatalf("expected foreground command vim, got %q", activity.Command)
	}
	if activity.CommandLine != "/usr/bin/vim file.txt" {
		t.Fatalf("expected normalized command line, got %q", activity.CommandLine)
	}
	if activity.CWD != "/home/demo/project" {
		t.Fatalf("expected foreground cwd, got %q", activity.CWD)
	}
	if _, ok := activities["/dev/pts/2"]; ok {
		t.Fatalf("unexpected activity for unrequested tty: %+v", activities)
	}
}

func TestScanProcActivitiesTreatsIdleShellAsNotBusy(t *testing.T) {
	procRoot := t.TempDir()
	writeFakeProc(t, procRoot, fakeProc{
		pid:     10,
		comm:    "bash",
		pgrp:    10,
		ttyNr:   34816,
		tpgid:   10,
		fd0:     "/dev/pts/1",
		cwd:     "/home/demo",
		cmdline: "-bash\x00",
	})

	activities, err := scanProcActivities(context.Background(), procRoot, []string{"/dev/pts/1"})
	if err != nil {
		t.Fatalf("scanProcActivities returned error: %v", err)
	}
	activity := activities["/dev/pts/1"]
	if activity.Busy {
		t.Fatalf("expected idle shell to be not busy: %+v", activity)
	}
	if activity.Command != "bash" || activity.CommandLine != "-bash" || activity.CWD != "/home/demo" {
		t.Fatalf("unexpected idle shell activity: %+v", activity)
	}
}

func TestScanProcActivitiesSkipsBrokenProcesses(t *testing.T) {
	procRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(procRoot, "not-a-pid"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(procRoot, "99"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(procRoot, "99", "stat"), []byte("bad stat"), 0o644); err != nil {
		t.Fatal(err)
	}
	writeFakeProc(t, procRoot, fakeProc{
		pid:   11,
		comm:  "top",
		pgrp:  11,
		ttyNr: 34816,
		tpgid: 11,
		fd0:   "/dev/pts/1",
	})

	activities, err := scanProcActivities(context.Background(), procRoot, []string{"/dev/pts/1"})
	if err != nil {
		t.Fatalf("scanProcActivities returned error: %v", err)
	}
	activity := activities["/dev/pts/1"]
	if !activity.Busy || activity.Command != "top" {
		t.Fatalf("expected fallback command from stat comm, got %+v", activity)
	}
}

func TestRefreshAutoTabLabelsUsesActivePaneCWD(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1", cwd: "/home/demo/project", command: "bash"},
			"pane-2": {id: "pane-2", cwd: "/tmp", command: "bash"},
		},
		tabs: []*terminalTab{
			{ID: "tab-1", Label: "Shell 1", ActivePaneID: "pane-2", PaneIDs: []string{"pane-1", "pane-2"}},
			{ID: "tab-2", Label: "Manual", CustomLabel: true, ActivePaneID: "pane-1", PaneIDs: []string{"pane-1"}},
		},
	}
	workspace.refreshAutoTabLabelsLocked()
	if workspace.tabs[0].Label != "tmp" {
		t.Fatalf("expected active pane path label tmp, got %q", workspace.tabs[0].Label)
	}
	if workspace.tabs[1].Label != "Manual" {
		t.Fatalf("expected manual label to be preserved, got %q", workspace.tabs[1].Label)
	}
}

func TestResolveSourcePaneCWDLockedUsesRequestedPane(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1", cwd: "/home/demo/project"},
		},
		tabs:      []*terminalTab{{ID: "tab-1", ActivePaneID: "pane-1", PaneIDs: []string{"pane-1"}}},
		activeTab: "tab-1",
	}
	if got := workspace.resolveSourcePaneCWDLocked("tab-1", "pane-1"); got != "/home/demo/project" {
		t.Fatalf("expected source cwd, got %q", got)
	}
}

type fakeProc struct {
	pid     int
	comm    string
	pgrp    int
	ttyNr   int
	tpgid   int
	fd0     string
	cwd     string
	cmdline string
}

func writeFakeProc(t *testing.T, procRoot string, proc fakeProc) {
	t.Helper()
	dir := filepath.Join(procRoot, strconv.Itoa(proc.pid))
	if err := os.MkdirAll(filepath.Join(dir, "fd"), 0o755); err != nil {
		t.Fatal(err)
	}
	stat := strconv.Itoa(proc.pid) + " (" + proc.comm + ") S 1 " + strconv.Itoa(proc.pgrp) + " 3333 " + strconv.Itoa(proc.ttyNr) + " " + strconv.Itoa(proc.tpgid) + " 0 0 0 0 0 0\n"
	if err := os.WriteFile(filepath.Join(dir, "stat"), []byte(stat), 0o644); err != nil {
		t.Fatal(err)
	}
	if proc.fd0 != "" {
		if err := os.Symlink(proc.fd0, filepath.Join(dir, "fd", "0")); err != nil {
			t.Fatal(err)
		}
	}
	if proc.cwd != "" {
		if err := os.Symlink(proc.cwd, filepath.Join(dir, "cwd")); err != nil {
			t.Fatal(err)
		}
	}
	if proc.cmdline != "" {
		if err := os.WriteFile(filepath.Join(dir, "cmdline"), []byte(proc.cmdline), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestDisplayPathLabelMatchesLightOSAdminAutoRename(t *testing.T) {
	cases := map[string]string{
		"/":                   "ROOT",
		"/home/demo/project":  "project",
		"/home/demo/project/": "project",
		"":                    "",
	}
	for input, want := range cases {
		if got := displayPathLabel(input); got != want {
			t.Fatalf("displayPathLabel(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestMoveTabLocked(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-1",
	}
	if err := workspace.moveTabLocked("tab-1", "right"); err != nil {
		t.Fatalf("move right returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-2", "tab-1", "tab-3")
	if workspace.activeTab != "tab-1" {
		t.Fatalf("expected moved tab to stay active, got %q", workspace.activeTab)
	}
	if err := workspace.moveTabLocked("tab-1", "last"); err != nil {
		t.Fatalf("move last returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-2", "tab-3", "tab-1")
	if err := workspace.moveTabLocked("tab-1", "first"); err != nil {
		t.Fatalf("move first returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-2", "tab-3")
}

func TestInsertTabAfterSourceLockedUsesRequestedTab(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-1",
	}
	workspace.insertTabAfterSourceLocked(&terminalTab{ID: "tab-new"}, "tab-2")
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-2", "tab-new", "tab-3")
}

func TestInsertTabAfterSourceLockedFallsBackToActiveTab(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-2",
	}
	workspace.insertTabAfterSourceLocked(&terminalTab{ID: "tab-new"}, "missing-tab")
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-2", "tab-new", "tab-3")
}

func TestCloseActiveTabSelectsRightThenLeftNeighbor(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-2",
	}
	if err := workspace.closeTabLocked("tab-2"); err != nil {
		t.Fatalf("close tab-2 returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-3")
	if workspace.activeTab != "tab-3" {
		t.Fatalf("expected right neighbor tab-3 to become active, got %q", workspace.activeTab)
	}

	if err := workspace.closeTabLocked("tab-3"); err != nil {
		t.Fatalf("close tab-3 returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-1")
	if workspace.activeTab != "tab-1" {
		t.Fatalf("expected left neighbor tab-1 to become active, got %q", workspace.activeTab)
	}
}

func TestCloseTabDropsPaneHistoryBeforeNewTab(t *testing.T) {
	workspace := testWorkspaceWithTabs("tab-1", "tab-2")
	closedPaneID := workspace.tabs[1].ActivePaneID
	workspace.panes[closedPaneID].history = newTestPaneHistory("old closed tab output")
	workspace.activeTab = "tab-2"

	if err := workspace.closeTabLocked("tab-2"); err != nil {
		t.Fatalf("close tab-2 returned error: %v", err)
	}
	if _, ok := workspace.panes[closedPaneID]; ok {
		t.Fatalf("closed pane %s should be removed from workspace", closedPaneID)
	}

	pane := &terminalPane{id: "pane-new", clients: make(map[*paneClient]struct{}), done: make(chan struct{})}
	workspace.panes[pane.id] = pane
	tab := &terminalTab{
		ID:           "tab-new",
		Label:        "tab-new",
		ActivePaneID: pane.id,
		Layout:       &layoutNode{Type: "leaf", PaneID: pane.id},
		PaneIDs:      []string{pane.id},
	}
	workspace.insertTabAfterSourceLocked(tab, "")
	workspace.setActiveTabLocked(tab.ID)

	if got := string(pane.history.snapshot().bytes()); got != "" {
		t.Fatalf("new pane history = %q, want empty", got)
	}
}

func TestClosePaneSelectsAdjacentSiblingWhenActivePaneExits(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1"},
			"pane-2": {id: "pane-2"},
			"pane-3": {id: "pane-3"},
		},
	}
	tab := &terminalTab{
		ID:           "tab-1",
		ActivePaneID: "pane-2",
		PaneIDs:      []string{"pane-1", "pane-2", "pane-3"},
		Layout: &layoutNode{
			Type:      "split",
			Direction: "vertical",
			Children: []*layoutNode{
				{Type: "leaf", PaneID: "pane-1"},
				{
					Type:      "split",
					Direction: "horizontal",
					Children: []*layoutNode{
						{Type: "leaf", PaneID: "pane-2"},
						{Type: "leaf", PaneID: "pane-3"},
					},
				},
			},
		},
	}
	if err := workspace.closePaneInTabLocked(tab, "pane-2"); err != nil {
		t.Fatalf("closePaneInTabLocked returned error: %v", err)
	}
	if tab.ActivePaneID != "pane-3" {
		t.Fatalf("expected adjacent sibling pane-3 to become active, got %q", tab.ActivePaneID)
	}
}

func TestClosePaneKeepsExistingActivePaneWhenInactivePaneExits(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1"},
			"pane-2": {id: "pane-2"},
		},
	}
	tab := &terminalTab{
		ID:           "tab-1",
		ActivePaneID: "pane-1",
		PaneIDs:      []string{"pane-1", "pane-2"},
		Layout: &layoutNode{
			Type:      "split",
			Direction: "vertical",
			Children: []*layoutNode{
				{Type: "leaf", PaneID: "pane-1"},
				{Type: "leaf", PaneID: "pane-2"},
			},
		},
	}
	if err := workspace.closePaneInTabLocked(tab, "pane-2"); err != nil {
		t.Fatalf("closePaneInTabLocked returned error: %v", err)
	}
	if tab.ActivePaneID != "pane-1" {
		t.Fatalf("expected active pane to remain pane-1, got %q", tab.ActivePaneID)
	}
}

func TestFilterPrivateControlOutputAcrossChunks(t *testing.T) {
	pane := &terminalPane{}
	first := pane.filterPrivateControlOutput([]byte("hello \x1b]777;webshell-"))
	if string(first) != "hello " {
		t.Fatalf("unexpected first output %q", string(first))
	}
	second := pane.filterPrivateControlOutput([]byte("tty=/dev/pts/3\a world"))
	if string(second) != " world" {
		t.Fatalf("unexpected second output %q", string(second))
	}
	if pane.tty != "/dev/pts/3" {
		t.Fatalf("expected tty to be captured, got %q", pane.tty)
	}
}

func assertTabOrder(t *testing.T, tabs []*terminalTab, want ...string) {
	t.Helper()
	if len(tabs) != len(want) {
		t.Fatalf("tab count mismatch: got %d want %d", len(tabs), len(want))
	}
	for index := range want {
		if tabs[index].ID != want[index] {
			t.Fatalf("tab at index %d = %q, want %q", index, tabs[index].ID, want[index])
		}
	}
}

func containsAll(text string, values ...string) bool {
	for _, value := range values {
		if !strings.Contains(text, value) {
			return false
		}
	}
	return true
}
