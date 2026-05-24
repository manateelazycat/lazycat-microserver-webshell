package fonts

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorePersistsUploadedFontSelectionAndDelete(t *testing.T) {
	store := Store{Dir: t.TempDir()}

	font, err := store.StoreUpload("JetBrainsMono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	if font.Label != "JetBrainsMono" {
		t.Fatalf("StoreUpload() label = %q, want %q", font.Label, "JetBrainsMono")
	}
	if _, err := os.Stat(store.dataPath(Metadata{ID: font.ID, Filename: font.Filename, Extension: ".woff2"})); err != nil {
		t.Fatalf("font data not persisted: %v", err)
	}

	if err := store.SaveSelection(font.ID); err != nil {
		t.Fatalf("SaveSelection() error = %v", err)
	}
	state, err := store.State()
	if err != nil {
		t.Fatalf("State() error = %v", err)
	}
	if state.TerminalFontID != font.ID || len(state.Fonts) != 1 {
		t.Fatalf("State() = %+v, want selected font and one descriptor", state)
	}
	if state.TerminalScrollback != DefaultTerminalScrollback {
		t.Fatalf("TerminalScrollback = %d, want %d", state.TerminalScrollback, DefaultTerminalScrollback)
	}
	if !state.DesktopMouseClipboardEnabled {
		t.Fatalf("DesktopMouseClipboardEnabled = false, want true")
	}
	if !state.MobileDoubleTapReminderEnabled {
		t.Fatalf("MobileDoubleTapReminderEnabled = false, want true")
	}

	if err := store.Delete(font.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() after Delete() error = %v", err)
	}
	if state.TerminalFontID != "" || len(state.Fonts) != 0 {
		t.Fatalf("State() after Delete() = %+v, want empty state", state)
	}
}

func TestStoreUsesFilenameForWebFontLabel(t *testing.T) {
	store := Store{Dir: t.TempDir()}

	font, err := store.StoreUpload("霞鹜文楷.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}
	if font.Label != "霞鹜文楷" {
		t.Fatalf("StoreUpload() label = %q, want %q", font.Label, "霞鹜文楷")
	}
	if font.Filename != "霞鹜文楷.woff2" {
		t.Fatalf("StoreUpload() filename = %q, want %q", font.Filename, "霞鹜文楷.woff2")
	}
}

func TestStoreRejectsUploadedFontOverMaxBytes(t *testing.T) {
	store := Store{Dir: t.TempDir()}

	_, err := store.StoreUpload("Huge.woff2", "font/woff2", io.LimitReader(zeroReader{}, MaxBytes+1))
	if !errors.Is(err, ErrBadRequest) {
		t.Fatalf("StoreUpload() error = %v, want ErrBadRequest", err)
	}
	if !strings.Contains(err.Error(), "font must be between 1 byte and 50 MB") {
		t.Fatalf("StoreUpload() error = %q, want 50 MB limit message", err.Error())
	}
}

func TestStoreDefaultsInvalidAndPersistsScrollback(t *testing.T) {
	store := Store{Dir: t.TempDir()}

	state, err := store.State()
	if err != nil {
		t.Fatalf("State() error = %v", err)
	}
	if state.TerminalScrollback != DefaultTerminalScrollback {
		t.Fatalf("default TerminalScrollback = %d, want %d", state.TerminalScrollback, DefaultTerminalScrollback)
	}
	if !state.DesktopMouseClipboardEnabled {
		t.Fatalf("default DesktopMouseClipboardEnabled = false, want true")
	}
	if !state.MobilePixelScrollEnabled {
		t.Fatalf("default MobilePixelScrollEnabled = false, want true")
	}
	if !state.MobileDoubleTapReminderEnabled {
		t.Fatalf("default MobileDoubleTapReminderEnabled = false, want true")
	}

	writeSettingsJSON(t, store, map[string]any{
		"terminal_font_id":    "",
		"terminal_scrollback": 0,
	})
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() with invalid scrollback error = %v", err)
	}
	if state.TerminalScrollback != DefaultTerminalScrollback {
		t.Fatalf("invalid TerminalScrollback = %d, want default %d", state.TerminalScrollback, DefaultTerminalScrollback)
	}
	if !state.DesktopMouseClipboardEnabled {
		t.Fatalf("missing DesktopMouseClipboardEnabled = false, want true")
	}
	if !state.MobilePixelScrollEnabled {
		t.Fatalf("missing MobilePixelScrollEnabled = false, want true")
	}
	if !state.MobileDoubleTapReminderEnabled {
		t.Fatalf("missing MobileDoubleTapReminderEnabled = false, want true")
	}

	if err := store.SaveScrollback(12000); err != nil {
		t.Fatalf("SaveScrollback() error = %v", err)
	}
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() after SaveScrollback error = %v", err)
	}
	if state.TerminalScrollback != 12000 {
		t.Fatalf("TerminalScrollback = %d, want 12000", state.TerminalScrollback)
	}
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	clear(p)
	return len(p), nil
}

func TestStoreSettingsUpdatesPreserveOtherFields(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	font, err := store.StoreUpload("Mono.woff2", "font/woff2", strings.NewReader("font-data"))
	if err != nil {
		t.Fatalf("StoreUpload() error = %v", err)
	}

	if err := store.SaveScrollback(22000); err != nil {
		t.Fatalf("SaveScrollback() error = %v", err)
	}
	disabled := false
	settings, err := store.ReadSettings()
	if err != nil {
		t.Fatalf("ReadSettings() error = %v", err)
	}
	settings.DesktopMouseClipboardEnabled = &disabled
	settings.MobileDoubleTapReminderEnabled = &disabled
	if err := store.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings(mouse disabled) error = %v", err)
	}
	if err := store.SaveSelection(font.ID); err != nil {
		t.Fatalf("SaveSelection() error = %v", err)
	}
	state, err := store.State()
	if err != nil {
		t.Fatalf("State() error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 22000 || state.DesktopMouseClipboardEnabled || state.MobileDoubleTapReminderEnabled {
		t.Fatalf("State() = %+v, want selected font, scrollback 22000, disabled mouse clipboard, and disabled double tap reminder", state)
	}

	if err := store.SaveScrollback(33000); err != nil {
		t.Fatalf("SaveScrollback(second) error = %v", err)
	}
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() after second SaveScrollback error = %v", err)
	}
	if state.TerminalFontID != font.ID || state.TerminalScrollback != 33000 || state.DesktopMouseClipboardEnabled || state.MobileDoubleTapReminderEnabled {
		t.Fatalf("State() = %+v, want selected font preserved, scrollback 33000, disabled mouse clipboard, and disabled double tap reminder", state)
	}

	if err := store.Delete(font.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() after Delete error = %v", err)
	}
	if state.TerminalFontID != "" || state.TerminalScrollback != 33000 || state.DesktopMouseClipboardEnabled || state.MobileDoubleTapReminderEnabled {
		t.Fatalf("State() after Delete = %+v, want default font, preserved scrollback, disabled mouse clipboard, and disabled double tap reminder", state)
	}
}

func TestStoreMergeSettingsDropsMissingSelectedFont(t *testing.T) {
	store := Store{Dir: t.TempDir()}
	missingID := strings.Repeat("a", 64)

	settings, err := store.MergeSettings(Settings{
		TerminalFontID:                 missingID,
		TerminalScrollback:             24000,
		DesktopMouseClipboardEnabled:   boolPtr(false),
		MobileDoubleTapReminderEnabled: boolPtr(false),
	}, true)
	if err != nil {
		t.Fatalf("MergeSettings() error = %v", err)
	}
	if settings.TerminalFontID != "" || settings.TerminalScrollback != 24000 || desktopMouseClipboardEnabled(settings) || mobileDoubleTapReminderEnabled(settings) {
		t.Fatalf("MergeSettings() = %+v, want missing font cleared, scrollback preserved, disabled mouse clipboard, and disabled double tap reminder", settings)
	}
	state, err := store.State()
	if err != nil {
		t.Fatalf("State() error = %v", err)
	}
	if state.TerminalFontID != "" || state.TerminalScrollback != 24000 || state.DesktopMouseClipboardEnabled || state.MobileDoubleTapReminderEnabled {
		t.Fatalf("State() = %+v, want missing font cleared, scrollback preserved, disabled mouse clipboard, and disabled double tap reminder", state)
	}

	if _, err := store.MergeSettings(Settings{
		TerminalFontID:               missingID,
		TerminalScrollback:           26000,
		DesktopMouseClipboardEnabled: boolPtr(true),
	}, false); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("MergeSettings(prune=false) error = %v, want ErrBadRequest", err)
	}
}

func TestStoreListsSelectsServesAndDeletesBundledFonts(t *testing.T) {
	bundledDir := t.TempDir()
	writeBundledFont(t, bundledDir, "HackNerdFontMono-Regular.ttf", "hack")
	writeBundledFont(t, bundledDir, "JetBrainsMonoNerdFontMono-Regular.ttf", "jetbrains")
	writeBundledFont(t, bundledDir, "FiraCodeNerdFontMono-Regular.ttf", "fira")
	writeBundledFont(t, bundledDir, "MesloLGSNerdFontMono-Regular.ttf", "meslo")
	store := Store{Dir: t.TempDir(), BundledDir: bundledDir}

	state, err := store.State()
	if err != nil {
		t.Fatalf("State() error = %v", err)
	}
	if len(state.Fonts) != 4 {
		t.Fatalf("bundled font count = %d, want 4: %+v", len(state.Fonts), state.Fonts)
	}
	if state.TerminalFontID != DefaultTerminalFontID {
		t.Fatalf("default TerminalFontID = %q, want Hack Nerd Font %q", state.TerminalFontID, DefaultTerminalFontID)
	}
	for index, want := range []string{"Hack Nerd Font", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "MesloLGS Nerd Font"} {
		if state.Fonts[index].Label != want {
			t.Fatalf("font[%d].Label = %q, want %q", index, state.Fonts[index].Label, want)
		}
		if !state.Fonts[index].Builtin {
			t.Fatalf("font[%d].Builtin = false, want true", index)
		}
		if state.Fonts[index].MIME != "font/ttf" {
			t.Fatalf("font[%d].MIME = %q, want font/ttf", index, state.Fonts[index].MIME)
		}
		if !strings.Contains(state.Fonts[index].URL, "?v=") {
			t.Fatalf("font[%d].URL = %q, want cache version", index, state.Fonts[index].URL)
		}
	}

	selectedID := state.Fonts[1].ID
	if err := store.SaveSelection(selectedID); err != nil {
		t.Fatalf("SaveSelection(bundled) error = %v", err)
	}
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() after SaveSelection error = %v", err)
	}
	if state.TerminalFontID != selectedID {
		t.Fatalf("TerminalFontID = %q, want %q", state.TerminalFontID, selectedID)
	}

	file, err := store.File(selectedID)
	if err != nil {
		t.Fatalf("File(bundled) error = %v", err)
	}
	if file.MIME != "font/ttf" || filepath.Base(file.Path) != "JetBrainsMonoNerdFontMono-Regular.ttf" {
		t.Fatalf("File(bundled) = %+v, want JetBrainsMono Nerd Font ttf", file)
	}

	if err := store.Delete(selectedID); err != nil {
		t.Fatalf("Delete(bundled) error = %v", err)
	}
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() after Delete(bundled) error = %v", err)
	}
	if state.TerminalFontID != "" {
		t.Fatalf("TerminalFontID after Delete(bundled) = %q, want empty", state.TerminalFontID)
	}
	if fontExists(state.Fonts, selectedID) {
		t.Fatalf("deleted bundled font %q is still listed: %+v", selectedID, state.Fonts)
	}
	if _, err := store.File(selectedID); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("File(deleted bundled) error = %v, want os.ErrNotExist", err)
	}
	if err := store.SaveSelection(selectedID); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("SaveSelection(deleted bundled) error = %v, want ErrBadRequest", err)
	}
}

func TestStoreExplicitSystemDefaultOverridesDefaultHack(t *testing.T) {
	bundledDir := t.TempDir()
	writeBundledFont(t, bundledDir, "HackNerdFontMono-Regular.ttf", "hack")
	store := Store{Dir: t.TempDir(), BundledDir: bundledDir}

	state, err := store.State()
	if err != nil {
		t.Fatalf("State() error = %v", err)
	}
	if state.TerminalFontID != DefaultTerminalFontID {
		t.Fatalf("default TerminalFontID = %q, want Hack Nerd Font %q", state.TerminalFontID, DefaultTerminalFontID)
	}

	if err := store.SaveSelection(""); err != nil {
		t.Fatalf("SaveSelection(system default) error = %v", err)
	}
	state, err = store.State()
	if err != nil {
		t.Fatalf("State() after SaveSelection error = %v", err)
	}
	if state.TerminalFontID != "" {
		t.Fatalf("TerminalFontID after explicit system default = %q, want empty", state.TerminalFontID)
	}
}

func TestStoreExposesTerminalSymbolFontSeparately(t *testing.T) {
	bundledDir := t.TempDir()
	writeBundledFont(t, bundledDir, terminalSymbolFont.File, "symbols")
	store := Store{Dir: t.TempDir(), BundledDir: bundledDir}

	state, err := store.State()
	if err != nil {
		t.Fatalf("State() error = %v", err)
	}
	if len(state.Fonts) != 0 {
		t.Fatalf("Fonts = %+v, want symbol font hidden from selectable fonts", state.Fonts)
	}
	if state.TerminalSymbolFont == nil {
		t.Fatal("TerminalSymbolFont = nil, want descriptor")
	}
	if state.TerminalSymbolFont.ID != terminalSymbolFont.ID || state.TerminalSymbolFont.Family != terminalSymbolFont.Family {
		t.Fatalf("TerminalSymbolFont = %+v, want configured symbol font", state.TerminalSymbolFont)
	}
	if !strings.Contains(state.TerminalSymbolFont.URL, "?v=") {
		t.Fatalf("TerminalSymbolFont.URL = %q, want cache version", state.TerminalSymbolFont.URL)
	}

	file, err := store.File(terminalSymbolFont.ID)
	if err != nil {
		t.Fatalf("File(symbol) error = %v", err)
	}
	if file.MIME != "font/ttf" || filepath.Base(file.Path) != terminalSymbolFont.File {
		t.Fatalf("File(symbol) = %+v, want symbol ttf", file)
	}
	if err := store.SaveSelection(terminalSymbolFont.ID); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("SaveSelection(symbol) error = %v, want ErrBadRequest", err)
	}
	if err := store.Delete(terminalSymbolFont.ID); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Delete(symbol) error = %v, want os.ErrNotExist", err)
	}
}

func writeBundledFont(t *testing.T, dir, name, data string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(data), 0o644); err != nil {
		t.Fatalf("write bundled font %q error = %v", name, err)
	}
}

func writeSettingsJSON(t *testing.T, store Store, value any) {
	t.Helper()
	if err := store.ensureDir(); err != nil {
		t.Fatalf("ensureDir() error = %v", err)
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent() error = %v", err)
	}
	if err := os.WriteFile(store.settingsPath(), append(data, '\n'), 0o644); err != nil {
		t.Fatalf("write settings error = %v", err)
	}
}
