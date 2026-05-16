package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"lcmd-webshell/internal/pkg/fonts"
)

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

func TestHandleSettingsDefaultsDesktopMouseClipboardEnabled(t *testing.T) {
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
}

func TestHandleSettingsPatchDesktopMouseClipboardPreservesFontAndScrollback(t *testing.T) {
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
	request := httptest.NewRequest(http.MethodPut, "/api/settings", strings.NewReader(`{"desktop_mouse_clipboard_enabled":false}`))
	request.Header.Set("Content-Type", "application/json")
	server.handleSettings(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleSettings() status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var state fonts.State
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 44000 || state.DesktopMouseClipboardEnabled {
		t.Fatalf("State = %+v, want selected font, scrollback 44000, and disabled mouse clipboard", state)
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
		TerminalFontID:               font.ID,
		TerminalScrollback:           33000,
		DesktopMouseClipboardEnabled: &disabled,
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
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 33000 || state.DesktopMouseClipboardEnabled {
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

func TestHandleSettingsRejectsInvalidMobileShortcutsWithoutWriting(t *testing.T) {
	for _, body := range []string{
		`{"mobile_shortcuts":[[{"id":"dup","label":"A","input_key":"a"}],[{"id":"dup","label":"B","input_key":"b"}]]}`,
		`{"mobile_shortcuts":[[{"id":"bad space","label":"A","input_key":"a"}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-action","label":"A","action":"unknown"}],[]]}`,
		`{"mobile_shortcuts":[[{"id":"bad-action-mod","label":"A","action":"copy","input_modifiers":{"ctrl":true}}],[]]}`,
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
		{name: "SourceCodePro-Regular.woff2", data: "source"},
		{name: "FiraCode-Regular.woff2", data: "fira"},
		{name: "Hack-Regular.woff2", data: "hack"},
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
	if len(state.Fonts) != 3 {
		t.Fatalf("bundled font count = %d, want 3: %+v", len(state.Fonts), state.Fonts)
	}
	if state.TerminalFontID != fonts.DefaultTerminalFontID {
		t.Fatalf("default TerminalFontID = %q, want Hack %q", state.TerminalFontID, fonts.DefaultTerminalFontID)
	}
	if state.Fonts[0].Label != "Source Code Pro" || !state.Fonts[0].Builtin {
		t.Fatalf("first bundled font = %+v, want Source Code Pro builtin", state.Fonts[0])
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
	if contentType := recorder.Header().Get("Content-Type"); contentType != "font/woff2" {
		t.Fatalf("Content-Type = %q, want font/woff2", contentType)
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
	if len(state.Fonts) != 2 {
		t.Fatalf("bundled font count after delete = %d, want 2: %+v", len(state.Fonts), state.Fonts)
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
		history: []byte("\x1b[c"),
	}

	history, client, allowGeneratedInput, err := pane.attachClient()
	if err != nil {
		t.Fatalf("attachClient returned error: %v", err)
	}
	if string(history) != "\x1b[c" {
		t.Fatalf("unexpected history: %q", string(history))
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

func TestTerminalPaneKeepsNonDeviceAttributeCSI(t *testing.T) {
	pane := &terminalPane{}
	input := []byte("before\x1b[31mcolor\x1b[1cafter")

	filtered := pane.filterTerminalQueryOutput(input)
	if string(filtered) != string(input) {
		t.Fatalf("unexpected filtered output: %q", string(filtered))
	}
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

func TestPluginServerTerminalInputLockOwnersAreIndependent(t *testing.T) {
	server := &pluginServer{}
	server.setTerminalInputBlocked("demo@owner", "one", true)
	server.setTerminalInputBlocked("demo@owner", "two", true)
	server.setTerminalInputBlocked("demo@owner", "one", false)
	if !server.terminalInputBlocked("demo@owner", "") {
		t.Fatal("expected terminal input to stay blocked while another owner holds the lock")
	}
	server.setTerminalInputBlocked("demo@owner", "two", false)
	if server.terminalInputBlocked("demo@owner", "") {
		t.Fatal("expected terminal input to be unblocked after all owners release")
	}
}

func TestPluginServerTerminalInputLockMatchesClient(t *testing.T) {
	server := &pluginServer{}
	server.setTerminalInputBlocked("demo@owner", serverRevisionInputLockOwner("client-one"), true)
	if !server.terminalInputBlocked("demo@owner", "client-one") {
		t.Fatal("expected matching client to be blocked")
	}
	if server.terminalInputBlocked("demo@owner", "client-two") {
		t.Fatal("expected different client to remain unblocked")
	}
	if !server.terminalInputBlocked("demo@owner", "") {
		t.Fatal("expected legacy websocket without client id to be blocked by any active lock")
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

func TestAgentHistoryReplayFramesIncludeSelectorAndPane(t *testing.T) {
	var out bytes.Buffer
	if !writeAgentHistoryReplay(&out, "demo@owner", "pane-1", []byte("hello"), false) {
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

func TestHandleAgentAttachControlMessageDropsInputWhenServerLocked(t *testing.T) {
	var blocked bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &blocked, []byte(`{"type":"input","data":"8;36R"}`), true) {
		t.Fatal("blocked input message should keep the connection open")
	}
	if blocked.Len() != 0 {
		t.Fatalf("expected blocked input to be dropped, got %d framed bytes", blocked.Len())
	}

	var allowed bytes.Buffer
	if !handleAgentAttachControlMessage(nil, &sync.Mutex{}, &allowed, []byte(`{"type":"input","data":"6;55R"}`), false) {
		t.Fatal("allowed input message should keep the connection open")
	}
	frameType, payload, err := readAgentFrame(&allowed)
	if err != nil {
		t.Fatalf("reading forwarded input frame returned error: %v", err)
	}
	if frameType != agentFrameInput || string(payload) != "6;55R" {
		t.Fatalf("unexpected forwarded frame: type=%q payload=%q", frameType, string(payload))
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
