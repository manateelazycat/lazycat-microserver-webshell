package fonts

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	DefaultDir = "/lzcapp/var/fonts"
	DirEnv     = "WEBSHELL_FONT_DIR"
	MaxBytes   = 50 << 20

	DefaultTerminalScrollback = 5000
	MinTerminalScrollback     = 100
	MaxTerminalScrollback     = 100000
	DefaultTerminalFontID     = "03e60d3c1a9f8bef4e1f78836f80aacb9ec005260a6b094f5bfc10043bb115ab"
)

var (
	ErrBadRequest            = errors.New("bad font request")
	idPattern                = regexp.MustCompile(`^[a-f0-9]{64}$`)
	mobileShortcutIDPattern  = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
	desktopShortcutIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

type Store struct {
	Dir        string
	BundledDir string
}

type State struct {
	TerminalFontID                 string               `json:"terminal_font_id"`
	TerminalSymbolFont             *SymbolDescriptor    `json:"terminal_symbol_font,omitempty"`
	TerminalScrollback             int                  `json:"terminal_scrollback"`
	DesktopMouseClipboardEnabled   bool                 `json:"desktop_mouse_clipboard_enabled"`
	MobilePixelScrollEnabled       bool                 `json:"mobile_pixel_scroll_enabled"`
	MobileDoubleTapReminderEnabled bool                 `json:"mobile_double_tap_reminder_enabled"`
	MobileShortcuts                MobileShortcutRows   `json:"mobile_shortcuts"`
	DesktopShortcuts               *DesktopShortcutList `json:"desktop_shortcuts,omitempty"`
	Fonts                          []Descriptor         `json:"fonts"`
}

type Settings struct {
	TerminalFontID                 string               `json:"terminal_font_id"`
	TerminalFontSystemDefault      bool                 `json:"terminal_font_system_default,omitempty"`
	TerminalScrollback             int                  `json:"terminal_scrollback"`
	DesktopMouseClipboardEnabled   *bool                `json:"desktop_mouse_clipboard_enabled,omitempty"`
	MobilePixelScrollEnabled       *bool                `json:"mobile_pixel_scroll_enabled,omitempty"`
	MobileDoubleTapReminderEnabled *bool                `json:"mobile_double_tap_reminder_enabled,omitempty"`
	MobileShortcuts                *MobileShortcutRows  `json:"mobile_shortcuts,omitempty"`
	DesktopShortcuts               *DesktopShortcutList `json:"desktop_shortcuts"`
	DeletedBuiltinFontIDs          []string             `json:"deleted_builtin_font_ids,omitempty"`
}

type MobileShortcutRows [][]MobileShortcut

type MobileShortcut struct {
	ID             string                  `json:"id"`
	Label          string                  `json:"label"`
	Action         string                  `json:"action,omitempty"`
	InputKey       string                  `json:"input_key,omitempty"`
	InputModifiers MobileShortcutModifiers `json:"input_modifiers,omitempty"`
	Kind           string                  `json:"kind,omitempty"`
	Icon           string                  `json:"icon,omitempty"`
	AriaLabel      string                  `json:"aria_label,omitempty"`
}

type MobileShortcutModifiers struct {
	Ctrl  bool `json:"ctrl,omitempty"`
	Alt   bool `json:"alt,omitempty"`
	Shift bool `json:"shift,omitempty"`
}

type DesktopShortcutList []DesktopShortcut

type DesktopShortcut struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Action   string `json:"action"`
	Shortcut string `json:"shortcut"`
}

type Metadata struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Family     string `json:"family"`
	Filename   string `json:"filename"`
	MIME       string `json:"mime"`
	Size       int64  `json:"size"`
	UploadedAt string `json:"uploaded_at"`
	Extension  string `json:"extension"`
	SourceName string `json:"source_name"`
}

type Descriptor struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Family     string `json:"family"`
	Filename   string `json:"filename"`
	MIME       string `json:"mime"`
	Size       int64  `json:"size"`
	UploadedAt string `json:"uploaded_at"`
	URL        string `json:"url"`
	SourceName string `json:"source_name"`
	Builtin    bool   `json:"builtin,omitempty"`
}

type SymbolDescriptor struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Family   string `json:"family"`
	Filename string `json:"filename"`
	MIME     string `json:"mime"`
	Size     int64  `json:"size"`
	URL      string `json:"url"`
	SHA256   string `json:"sha256"`
}

type File struct {
	Path string
	MIME string
}

type bundledFont struct {
	ID       string
	Label    string
	Family   string
	Filename string
	File     string
	MIME     string
	SHA256   string
}

type symbolFont struct {
	ID       string
	Label    string
	Family   string
	Filename string
	File     string
	MIME     string
	SHA256   string
}

var bundledFonts = []bundledFont{
	{
		ID:       "03e60d3c1a9f8bef4e1f78836f80aacb9ec005260a6b094f5bfc10043bb115ab",
		Label:    "Hack Nerd Font",
		Family:   "WebShellBuiltin_HackNerdFont",
		Filename: "HackNerdFontMono-Regular.ttf",
		File:     "HackNerdFontMono-Regular.ttf",
		MIME:     "font/ttf",
		SHA256:   "03e60d3c1a9f8bef4e1f78836f80aacb9ec005260a6b094f5bfc10043bb115ab",
	},
	{
		ID:       "f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c",
		Label:    "JetBrainsMono Nerd Font",
		Family:   "WebShellBuiltin_JetBrainsMonoNerdFont",
		Filename: "JetBrainsMonoNerdFontMono-Regular.ttf",
		File:     "JetBrainsMonoNerdFontMono-Regular.ttf",
		MIME:     "font/ttf",
		SHA256:   "f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c",
	},
	{
		ID:       "ad88c69cb6a497db9f2714e4b414817aabbee621484a1560bfdb3fd73abdd564",
		Label:    "FiraCode Nerd Font",
		Family:   "WebShellBuiltin_FiraCodeNerdFont",
		Filename: "FiraCodeNerdFontMono-Regular.ttf",
		File:     "FiraCodeNerdFontMono-Regular.ttf",
		MIME:     "font/ttf",
		SHA256:   "ad88c69cb6a497db9f2714e4b414817aabbee621484a1560bfdb3fd73abdd564",
	},
	{
		ID:       "3cb52e923ca3981cecca9ea7307186e424e8521cbc5643fd0b5b5b1d7daa53d9",
		Label:    "MesloLGS Nerd Font",
		Family:   "WebShellBuiltin_MesloLGSNerdFont",
		Filename: "MesloLGSNerdFontMono-Regular.ttf",
		File:     "MesloLGSNerdFontMono-Regular.ttf",
		MIME:     "font/ttf",
		SHA256:   "3cb52e923ca3981cecca9ea7307186e424e8521cbc5643fd0b5b5b1d7daa53d9",
	},
}

var terminalSymbolFont = symbolFont{
	ID:       "f0f624d9b474bea1662cf7e862d44aebe1ae1f6c7f9cb7a0ca5d0e5ac9561c60",
	Label:    "Nerd Font Symbols",
	Family:   "WebShellNerdSymbols",
	Filename: "SymbolsNerdFontMono-Regular.ttf",
	File:     "SymbolsNerdFontMono-Regular.ttf",
	MIME:     "font/ttf",
	SHA256:   "f0f624d9b474bea1662cf7e862d44aebe1ae1f6c7f9cb7a0ca5d0e5ac9561c60",
}

var defaultMobileShortcuts = MobileShortcutRows{
	{
		{ID: "sticky-ctrl", Label: "Ctrl+", Action: "sticky_ctrl", Kind: "modifier", AriaLabel: "Sticky Control"},
		{ID: "sticky-alt", Label: "Alt+", Action: "sticky_alt", Kind: "modifier", AriaLabel: "Sticky Alt"},
		{ID: "sticky-shift", Label: "Shift+", Action: "sticky_shift", Kind: "modifier", AriaLabel: "Sticky Shift"},
		{ID: "tab", Label: "Tab", InputKey: "tab", AriaLabel: "Tab"},
		{ID: "return", Label: "Return", InputKey: "enter", Kind: "primary", AriaLabel: "Return"},
		{ID: "arrow-up", Label: "\u2191", InputKey: "arrow_up", Kind: "nav", AriaLabel: "Up Arrow"},
		{ID: "arrow-down", Label: "\u2193", InputKey: "arrow_down", Kind: "nav", AriaLabel: "Down Arrow"},
		{ID: "arrow-left", Label: "\u2190", InputKey: "arrow_left", Kind: "nav", AriaLabel: "Left Arrow"},
		{ID: "arrow-right", Label: "\u2192", InputKey: "arrow_right", Kind: "nav", AriaLabel: "Right Arrow"},
		{ID: "copy", Label: "Copy", Action: "copy", AriaLabel: "Copy"},
		{ID: "paste", Label: "Paste", Action: "paste", AriaLabel: "Paste"},
		{ID: "page-up", Label: "PageUp", Action: "page_up", AriaLabel: "Page Up"},
		{ID: "page-down", Label: "PageDown", Action: "page_down", AriaLabel: "Page Down"},
	},
	{
		{ID: "mobile-menu", Label: "Menu", Action: "open_mobile_menu", Kind: "menu", Icon: "menu", AriaLabel: "Menu"},
		{ID: "ctrl-e", Label: "Ctrl+E", InputKey: "e", InputModifiers: MobileShortcutModifiers{Ctrl: true}, AriaLabel: "Control E"},
		{ID: "ctrl-c", Label: "Ctrl+C", InputKey: "c", InputModifiers: MobileShortcutModifiers{Ctrl: true}, Kind: "primary", AriaLabel: "Control C"},
		{ID: "swap-tab", Label: "Swap", Action: "swap_tab", AriaLabel: "切换最近两个终端"},
		{ID: "shift-tab", Label: "Shift+Tab", InputKey: "tab", InputModifiers: MobileShortcutModifiers{Shift: true}, AriaLabel: "Shift Tab"},
		{ID: "tilde", Label: "~", InputKey: "~", Kind: "symbol", AriaLabel: "Tilde"},
		{ID: "slash", Label: "/", InputKey: "/", Kind: "symbol", AriaLabel: "Slash"},
		{ID: "dash", Label: "-", InputKey: "-", Kind: "symbol", AriaLabel: "Dash"},
		{ID: "dollar", Label: "$", InputKey: "$", Kind: "symbol", AriaLabel: "Dollar Sign"},
		{ID: "esc", Label: "Esc", InputKey: "escape", Kind: "primary", AriaLabel: "Escape"},
		{ID: "zoom-in", Label: "Zoom+", Action: "zoom_in", Kind: "modifier", AriaLabel: "Zoom In"},
		{ID: "zoom-out", Label: "Zoom-", Action: "zoom_out", Kind: "modifier", AriaLabel: "Zoom Out"},
		{ID: "home", Label: "Home", InputKey: "home", AriaLabel: "Home"},
		{ID: "end", Label: "End", InputKey: "end", AriaLabel: "End"},
		{ID: "touch-feedback", Label: "Shock On", Action: "toggle_touch_feedback", Kind: "feedback", AriaLabel: "Shock On"},
	},
}

var allowedMobileShortcutInputKeys = map[string]bool{
	"space":       true,
	"arrow_up":    true,
	"arrow_down":  true,
	"arrow_left":  true,
	"arrow_right": true,
	"tab":         true,
	"enter":       true,
	"escape":      true,
	"home":        true,
	"end":         true,
}

var allowedMobileShortcutActions = map[string]bool{
	"sticky_ctrl":           true,
	"sticky_alt":            true,
	"sticky_shift":          true,
	"copy":                  true,
	"paste":                 true,
	"page_up":               true,
	"page_down":             true,
	"swap_tab":              true,
	"zoom_in":               true,
	"zoom_out":              true,
	"toggle_touch_feedback": true,
	"open_mobile_menu":      true,
}

var allowedDesktopShortcutActions = func() map[string]bool {
	actions := map[string]bool{
		"fullscreen":           true,
		"new_tab":              true,
		"close_tab":            true,
		"close_other_tabs":     true,
		"rename_tab":           true,
		"next_tab":             true,
		"previous_tab":         true,
		"last_tab":             true,
		"move_tab_to_first":    true,
		"move_tab_left":        true,
		"move_tab_right":       true,
		"move_tab_to_last":     true,
		"vertical_split":       true,
		"horizontal_split":     true,
		"select_up":            true,
		"select_down":          true,
		"select_left":          true,
		"select_right":         true,
		"close_pane":           true,
		"theme":                true,
		"switch_container":     true,
		"copy_terminal":        true,
		"paste_terminal":       true,
		"search_terminal":      true,
		"select_all_terminal":  true,
		"attachment_clipboard": true,
		"attachment_file":      true,
	}
	for i := 1; i <= 9; i++ {
		actions[fmt.Sprintf("tab_%d", i)] = true
	}
	return actions
}()

func ResolveDir(rootDir string) string {
	if dir := strings.TrimSpace(os.Getenv(DirEnv)); dir != "" {
		return dir
	}
	if stat, err := os.Stat("/lzcapp/var"); err == nil && stat.IsDir() {
		return DefaultDir
	}
	if dir := strings.TrimSpace(os.Getenv("XDG_DATA_HOME")); dir != "" {
		return filepath.Join(dir, "lazycat-webshell", "fonts")
	}
	if dir, err := os.UserConfigDir(); err == nil && strings.TrimSpace(dir) != "" {
		return filepath.Join(dir, "lazycat-webshell", "fonts")
	}
	return filepath.Join(rootDir, ".webshell-data", "fonts")
}

func ValidID(id string) bool {
	return idPattern.MatchString(id)
}

func (s Store) State() (State, error) {
	fonts, err := s.List()
	if err != nil {
		return State{}, err
	}
	settings, err := s.ReadSettings()
	if err != nil {
		return State{}, err
	}
	symbolFont := s.terminalSymbolFontDescriptor()
	selected := strings.TrimSpace(settings.TerminalFontID)
	if selected != "" && !fontExists(fonts, selected) {
		selected = ""
	}
	if selected == "" && !settings.TerminalFontSystemDefault && fontExists(fonts, DefaultTerminalFontID) {
		selected = DefaultTerminalFontID
	}
	return State{
		TerminalFontID:                 selected,
		TerminalSymbolFont:             symbolFont,
		TerminalScrollback:             settings.TerminalScrollback,
		DesktopMouseClipboardEnabled:   desktopMouseClipboardEnabled(settings),
		MobilePixelScrollEnabled:       mobilePixelScrollEnabled(settings),
		MobileDoubleTapReminderEnabled: mobileDoubleTapReminderEnabled(settings),
		MobileShortcuts:                effectiveMobileShortcuts(settings),
		DesktopShortcuts:               effectiveDesktopShortcuts(settings),
		Fonts:                          fonts,
	}, nil
}

func (s Store) ReadSettings() (Settings, error) {
	data, err := os.ReadFile(s.settingsPath())
	if errors.Is(err, os.ErrNotExist) {
		return Settings{
			TerminalScrollback:             DefaultTerminalScrollback,
			DesktopMouseClipboardEnabled:   boolPtr(true),
			MobilePixelScrollEnabled:       boolPtr(true),
			MobileDoubleTapReminderEnabled: boolPtr(true),
			MobileShortcuts:                nil,
			DesktopShortcuts:               nil,
		}, nil
	}
	if err != nil {
		return Settings{}, err
	}
	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return Settings{}, err
	}
	settings.TerminalFontID = strings.TrimSpace(settings.TerminalFontID)
	settings.TerminalScrollback = normalizeTerminalScrollback(settings.TerminalScrollback)
	settings.DesktopMouseClipboardEnabled = normalizeDesktopMouseClipboardEnabled(settings.DesktopMouseClipboardEnabled)
	settings.MobilePixelScrollEnabled = normalizeMobilePixelScrollEnabled(settings.MobilePixelScrollEnabled)
	settings.MobileDoubleTapReminderEnabled = normalizeMobileDoubleTapReminderEnabled(settings.MobileDoubleTapReminderEnabled)
	if settings.MobileShortcuts != nil {
		normalized, err := normalizeMobileShortcuts(*settings.MobileShortcuts)
		if err != nil {
			settings.MobileShortcuts = nil
		} else {
			settings.MobileShortcuts = &normalized
		}
	}
	if settings.DesktopShortcuts != nil {
		normalized, err := normalizeDesktopShortcuts(*settings.DesktopShortcuts)
		if err != nil {
			settings.DesktopShortcuts = nil
		} else {
			settings.DesktopShortcuts = &normalized
		}
	}
	settings.DeletedBuiltinFontIDs = normalizeDeletedBuiltinFontIDs(settings.DeletedBuiltinFontIDs)
	return settings, nil
}

func (s Store) SaveSelection(id string) error {
	id = strings.TrimSpace(id)
	settings, err := s.ReadSettings()
	if err != nil {
		return err
	}
	settings.TerminalFontID = id
	settings.TerminalFontSystemDefault = id == ""
	return s.SaveSettings(settings)
}

func (s Store) SaveScrollback(scrollback int) error {
	settings, err := s.ReadSettings()
	if err != nil {
		return err
	}
	settings.TerminalScrollback = scrollback
	return s.SaveSettings(settings)
}

func (s Store) StoreUpload(filename, contentType string, reader io.Reader) (Descriptor, error) {
	filename = sanitizeFilename(filename)
	extension, err := validateFilename(filename)
	if err != nil {
		return Descriptor{}, err
	}
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = mime.TypeByExtension(extension)
	}
	contentType = normalizeMIME(contentType, extension)
	if err := validateMIME(contentType); err != nil {
		return Descriptor{}, err
	}

	data, err := io.ReadAll(io.LimitReader(reader, MaxBytes+1))
	if err != nil {
		return Descriptor{}, err
	}
	if len(data) == 0 || len(data) > MaxBytes {
		return Descriptor{}, fmt.Errorf("%w: font must be between 1 byte and %s", ErrBadRequest, maxBytesLabel())
	}
	fontName, err := displayNameForUpload(data, filename, extension)
	if err != nil {
		return Descriptor{}, err
	}
	if err := s.ensureDir(); err != nil {
		return Descriptor{}, err
	}
	sum := sha256.Sum256(data)
	id := hex.EncodeToString(sum[:])
	metadata := Metadata{
		ID:         id,
		Label:      fontName,
		Family:     "WebShellFont_" + id[:12],
		Filename:   filename,
		MIME:       contentType,
		Size:       int64(len(data)),
		UploadedAt: time.Now().UTC().Format(time.RFC3339),
		Extension:  extension,
		SourceName: fontName,
	}
	if err := os.WriteFile(s.dataPath(metadata), data, 0o644); err != nil {
		return Descriptor{}, err
	}
	if err := s.WriteMetadata(metadata); err != nil {
		return Descriptor{}, err
	}
	return metadata.Descriptor(), nil
}

func (s Store) List() ([]Descriptor, error) {
	if err := s.ensureDir(); err != nil {
		return nil, err
	}
	settings, err := s.ReadSettings()
	if err != nil {
		return nil, err
	}
	deletedBuiltinFonts := deletedBuiltinFontSet(settings)
	fonts := make([]Descriptor, 0, len(bundledFonts))
	for _, font := range bundledFonts {
		if deletedBuiltinFonts[font.ID] {
			continue
		}
		if descriptor, ok := s.bundledDescriptor(font); ok {
			fonts = append(fonts, descriptor)
		}
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		return nil, err
	}
	uploadedFonts := make([]Descriptor, 0)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" || entry.Name() == "settings.json" {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		metadata, err := s.ReadMetadata(id)
		if err != nil {
			continue
		}
		uploadedFonts = append(uploadedFonts, metadata.Descriptor())
	}
	sort.Slice(uploadedFonts, func(i, j int) bool {
		return strings.ToLower(uploadedFonts[i].Label) < strings.ToLower(uploadedFonts[j].Label)
	})
	fonts = append(fonts, uploadedFonts...)
	return fonts, nil
}

func (s Store) File(id string) (File, error) {
	if id == terminalSymbolFont.ID {
		if err := s.ensureTerminalSymbolFontAvailable(); err != nil {
			return File{}, err
		}
		return File{Path: s.terminalSymbolFontPath(), MIME: terminalSymbolFont.MIME}, nil
	}
	if font, ok := bundledFontByID(id); ok {
		settings, err := s.ReadSettings()
		if err != nil {
			return File{}, err
		}
		if deletedBuiltinFontSet(settings)[id] {
			return File{}, os.ErrNotExist
		}
		if err := s.ensureBundledFontAvailable(id); err != nil {
			return File{}, err
		}
		return File{Path: s.bundledPath(font), MIME: font.MIME}, nil
	}
	metadata, err := s.ReadMetadata(id)
	if err != nil {
		return File{}, err
	}
	return File{Path: s.dataPath(metadata), MIME: metadata.MIME}, nil
}

func (s Store) Delete(id string) error {
	if _, ok := bundledFontByID(id); ok {
		settings, err := s.ReadSettings()
		if err != nil {
			return err
		}
		deletedBuiltinFonts := deletedBuiltinFontSet(settings)
		if deletedBuiltinFonts[id] {
			return os.ErrNotExist
		}
		if err := s.ensureBundledFontAvailable(id); err != nil {
			return err
		}
		settings.DeletedBuiltinFontIDs = append(settings.DeletedBuiltinFontIDs, id)
		if settings.TerminalFontID == id {
			settings.TerminalFontID = ""
			settings.TerminalFontSystemDefault = true
		}
		return s.WriteSettings(settings)
	}
	metadata, err := s.ReadMetadata(id)
	if err != nil {
		return err
	}
	_ = os.Remove(s.dataPath(metadata))
	if err := os.Remove(s.metadataPath(id)); err != nil {
		return err
	}
	settings, err := s.ReadSettings()
	if err != nil {
		return err
	}
	if settings.TerminalFontID == id {
		return s.SaveSelection("")
	}
	return nil
}

func (s Store) ReadMetadata(id string) (Metadata, error) {
	if !ValidID(id) {
		return Metadata{}, fmt.Errorf("%w: invalid font id", ErrBadRequest)
	}
	data, err := os.ReadFile(s.metadataPath(id))
	if err != nil {
		return Metadata{}, err
	}
	var metadata Metadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return Metadata{}, err
	}
	if !ValidID(metadata.ID) || metadata.ID != id {
		return Metadata{}, fmt.Errorf("%w: invalid font metadata", ErrBadRequest)
	}
	if metadata.Extension == "" {
		metadata.Extension = filepath.Ext(metadata.Filename)
	}
	return metadata, nil
}

func (s Store) WriteMetadata(metadata Metadata) error {
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.metadataPath(metadata.ID), append(data, '\n'), 0o644)
}

func (s Store) WriteSettings(settings Settings) error {
	settings.TerminalFontID = strings.TrimSpace(settings.TerminalFontID)
	settings.TerminalScrollback = normalizeTerminalScrollback(settings.TerminalScrollback)
	settings.DesktopMouseClipboardEnabled = normalizeDesktopMouseClipboardEnabled(settings.DesktopMouseClipboardEnabled)
	settings.MobilePixelScrollEnabled = normalizeMobilePixelScrollEnabled(settings.MobilePixelScrollEnabled)
	settings.MobileDoubleTapReminderEnabled = normalizeMobileDoubleTapReminderEnabled(settings.MobileDoubleTapReminderEnabled)
	if settings.MobileShortcuts != nil {
		normalized, err := normalizeMobileShortcuts(*settings.MobileShortcuts)
		if err != nil {
			return err
		}
		settings.MobileShortcuts = &normalized
	}
	if settings.DesktopShortcuts != nil {
		normalized, err := normalizeDesktopShortcuts(*settings.DesktopShortcuts)
		if err != nil {
			return err
		}
		settings.DesktopShortcuts = &normalized
	}
	settings.DeletedBuiltinFontIDs = normalizeDeletedBuiltinFontIDs(settings.DeletedBuiltinFontIDs)
	if err := s.ensureDir(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	path := s.settingsPath()
	tmp, err := os.CreateTemp(s.Dir, ".settings-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = os.Remove(tmpPath)
	}()
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o644); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func (s Store) SaveSettings(settings Settings) error {
	settings.TerminalFontID = strings.TrimSpace(settings.TerminalFontID)
	settings.DesktopMouseClipboardEnabled = normalizeDesktopMouseClipboardEnabled(settings.DesktopMouseClipboardEnabled)
	settings.MobilePixelScrollEnabled = normalizeMobilePixelScrollEnabled(settings.MobilePixelScrollEnabled)
	settings.MobileDoubleTapReminderEnabled = normalizeMobileDoubleTapReminderEnabled(settings.MobileDoubleTapReminderEnabled)
	if settings.MobileShortcuts != nil {
		normalized, err := normalizeMobileShortcuts(*settings.MobileShortcuts)
		if err != nil {
			return err
		}
		settings.MobileShortcuts = &normalized
	}
	if settings.DesktopShortcuts != nil {
		normalized, err := normalizeDesktopShortcuts(*settings.DesktopShortcuts)
		if err != nil {
			return err
		}
		settings.DesktopShortcuts = &normalized
	}
	settings.DeletedBuiltinFontIDs = normalizeDeletedBuiltinFontIDs(settings.DeletedBuiltinFontIDs)
	if err := ValidateTerminalScrollback(settings.TerminalScrollback); err != nil {
		return err
	}
	if err := s.validateSelection(settings.TerminalFontID, settings); err != nil {
		return err
	}
	return s.WriteSettings(settings)
}

func (s Store) MergeSettings(settings Settings, pruneMissingSelection bool) (Settings, error) {
	settings.TerminalFontID = strings.TrimSpace(settings.TerminalFontID)
	settings.DesktopMouseClipboardEnabled = normalizeDesktopMouseClipboardEnabled(settings.DesktopMouseClipboardEnabled)
	settings.MobilePixelScrollEnabled = normalizeMobilePixelScrollEnabled(settings.MobilePixelScrollEnabled)
	settings.MobileDoubleTapReminderEnabled = normalizeMobileDoubleTapReminderEnabled(settings.MobileDoubleTapReminderEnabled)
	if settings.MobileShortcuts != nil {
		normalized, err := normalizeMobileShortcuts(*settings.MobileShortcuts)
		if err != nil {
			return Settings{}, err
		}
		settings.MobileShortcuts = &normalized
	}
	if settings.DesktopShortcuts != nil {
		normalized, err := normalizeDesktopShortcuts(*settings.DesktopShortcuts)
		if err != nil {
			return Settings{}, err
		}
		settings.DesktopShortcuts = &normalized
	}
	settings.DeletedBuiltinFontIDs = normalizeDeletedBuiltinFontIDs(settings.DeletedBuiltinFontIDs)
	if pruneMissingSelection {
		fonts, err := s.List()
		if err != nil {
			return Settings{}, err
		}
		if settings.TerminalFontID != "" && !fontExists(fonts, settings.TerminalFontID) {
			settings.TerminalFontID = ""
		}
	}
	if err := s.SaveSettings(settings); err != nil {
		return Settings{}, err
	}
	return settings, nil
}

func (s Store) validateSelection(id string, settings Settings) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	if !ValidID(id) {
		return fmt.Errorf("%w: invalid font id", ErrBadRequest)
	}
	if _, ok := bundledFontByID(id); ok {
		if deletedBuiltinFontSet(settings)[id] {
			return fmt.Errorf("%w: font not found", ErrBadRequest)
		}
		if err := s.ensureBundledFontAvailable(id); err != nil {
			return err
		}
		return nil
	}
	if _, err := s.ReadMetadata(id); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("%w: font not found", ErrBadRequest)
		}
		return err
	}
	return nil
}

func (m Metadata) Descriptor() Descriptor {
	return Descriptor{
		ID:         m.ID,
		Label:      m.Label,
		Family:     m.Family,
		Filename:   m.Filename,
		MIME:       m.MIME,
		Size:       m.Size,
		UploadedAt: m.UploadedAt,
		URL:        "/api/settings/fonts/" + m.ID + "/file",
		SourceName: m.SourceName,
	}
}

func (s Store) bundledDescriptor(font bundledFont) (Descriptor, bool) {
	if strings.TrimSpace(s.BundledDir) == "" {
		return Descriptor{}, false
	}
	path := s.bundledPath(font)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return Descriptor{}, false
	}
	return Descriptor{
		ID:         font.ID,
		Label:      font.Label,
		Family:     font.Family,
		Filename:   font.Filename,
		MIME:       font.MIME,
		Size:       info.Size(),
		URL:        "/api/settings/fonts/" + font.ID + "/file?v=" + font.SHA256[:12],
		SourceName: font.Label,
		Builtin:    true,
	}, true
}

func (s Store) terminalSymbolFontDescriptor() *SymbolDescriptor {
	if err := s.ensureTerminalSymbolFontAvailable(); err != nil {
		return nil
	}
	info, err := os.Stat(s.terminalSymbolFontPath())
	if err != nil || info.IsDir() {
		return nil
	}
	return &SymbolDescriptor{
		ID:       terminalSymbolFont.ID,
		Label:    terminalSymbolFont.Label,
		Family:   terminalSymbolFont.Family,
		Filename: terminalSymbolFont.Filename,
		MIME:     terminalSymbolFont.MIME,
		Size:     info.Size(),
		URL:      "/api/settings/fonts/" + terminalSymbolFont.ID + "/file?v=" + terminalSymbolFont.SHA256[:12],
		SHA256:   terminalSymbolFont.SHA256,
	}
}

func (s Store) ensureBundledFontAvailable(id string) error {
	font, ok := bundledFontByID(id)
	if !ok {
		return fmt.Errorf("%w: font not found", ErrBadRequest)
	}
	if strings.TrimSpace(s.BundledDir) == "" {
		return fmt.Errorf("%w: font not found", ErrBadRequest)
	}
	info, err := os.Stat(s.bundledPath(font))
	if errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("%w: font not found", ErrBadRequest)
	}
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("%w: font not found", ErrBadRequest)
	}
	return nil
}

func (s Store) ensureTerminalSymbolFontAvailable() error {
	if strings.TrimSpace(s.BundledDir) == "" {
		return os.ErrNotExist
	}
	info, err := os.Stat(s.terminalSymbolFontPath())
	if errors.Is(err, os.ErrNotExist) {
		return os.ErrNotExist
	}
	if err != nil {
		return err
	}
	if info.IsDir() {
		return os.ErrNotExist
	}
	return nil
}

func (s Store) bundledPath(font bundledFont) string {
	return filepath.Join(s.BundledDir, font.File)
}

func (s Store) terminalSymbolFontPath() string {
	return filepath.Join(s.BundledDir, terminalSymbolFont.File)
}

func bundledFontByID(id string) (bundledFont, bool) {
	for _, font := range bundledFonts {
		if font.ID == id {
			return font, true
		}
	}
	return bundledFont{}, false
}

func normalizeDeletedBuiltinFontIDs(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	normalized := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if _, ok := bundledFontByID(id); !ok {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, id)
	}
	return normalized
}

func normalizeTerminalScrollback(value int) int {
	if value < MinTerminalScrollback || value > MaxTerminalScrollback {
		return DefaultTerminalScrollback
	}
	return value
}

func normalizeDesktopMouseClipboardEnabled(value *bool) *bool {
	if value == nil {
		return boolPtr(true)
	}
	enabled := *value
	return &enabled
}

func normalizeMobilePixelScrollEnabled(value *bool) *bool {
	if value == nil {
		return boolPtr(true)
	}
	enabled := *value
	return &enabled
}

func normalizeMobileDoubleTapReminderEnabled(value *bool) *bool {
	if value == nil {
		return boolPtr(true)
	}
	enabled := *value
	return &enabled
}

func DefaultMobileShortcuts() MobileShortcutRows {
	return cloneMobileShortcuts(defaultMobileShortcuts)
}

func effectiveMobileShortcuts(settings Settings) MobileShortcutRows {
	if settings.MobileShortcuts == nil {
		return DefaultMobileShortcuts()
	}
	normalized, err := normalizeMobileShortcuts(*settings.MobileShortcuts)
	if err != nil {
		return DefaultMobileShortcuts()
	}
	return normalized
}

func effectiveDesktopShortcuts(settings Settings) *DesktopShortcutList {
	if settings.DesktopShortcuts == nil {
		return nil
	}
	normalized, err := normalizeDesktopShortcuts(*settings.DesktopShortcuts)
	if err != nil {
		return nil
	}
	cloned := cloneDesktopShortcuts(normalized)
	return &cloned
}

func cloneMobileShortcuts(rows MobileShortcutRows) MobileShortcutRows {
	cloned := make(MobileShortcutRows, 2)
	for rowIndex := 0; rowIndex < 2; rowIndex++ {
		if rowIndex >= len(rows) || rows[rowIndex] == nil {
			cloned[rowIndex] = []MobileShortcut{}
			continue
		}
		cloned[rowIndex] = append([]MobileShortcut(nil), rows[rowIndex]...)
	}
	return cloned
}

func cloneDesktopShortcuts(list DesktopShortcutList) DesktopShortcutList {
	if list == nil {
		return nil
	}
	cloned := make(DesktopShortcutList, len(list))
	copy(cloned, list)
	return cloned
}

func normalizeMobileShortcuts(rows MobileShortcutRows) (MobileShortcutRows, error) {
	if len(rows) != 2 {
		return nil, fmt.Errorf("%w: mobile shortcuts must contain exactly two rows", ErrBadRequest)
	}
	normalized := make(MobileShortcutRows, 2)
	seen := make(map[string]struct{})
	total := 0
	for rowIndex := 0; rowIndex < 2; rowIndex++ {
		normalized[rowIndex] = make([]MobileShortcut, 0, len(rows[rowIndex]))
		for _, shortcut := range rows[rowIndex] {
			next, err := normalizeMobileShortcut(shortcut)
			if err != nil {
				return nil, err
			}
			if _, ok := seen[next.ID]; ok {
				return nil, fmt.Errorf("%w: duplicate mobile shortcut id", ErrBadRequest)
			}
			seen[next.ID] = struct{}{}
			normalized[rowIndex] = append(normalized[rowIndex], next)
			total++
			if total > 64 {
				return nil, fmt.Errorf("%w: too many mobile shortcuts", ErrBadRequest)
			}
		}
	}
	return normalized, nil
}

func normalizeMobileShortcut(shortcut MobileShortcut) (MobileShortcut, error) {
	next := MobileShortcut{
		ID:             strings.TrimSpace(shortcut.ID),
		Label:          strings.TrimSpace(shortcut.Label),
		Action:         strings.TrimSpace(shortcut.Action),
		InputKey:       strings.TrimSpace(shortcut.InputKey),
		InputModifiers: shortcut.InputModifiers,
		Kind:           strings.TrimSpace(shortcut.Kind),
		Icon:           strings.TrimSpace(shortcut.Icon),
		AriaLabel:      strings.TrimSpace(shortcut.AriaLabel),
	}
	if !mobileShortcutIDPattern.MatchString(next.ID) {
		return MobileShortcut{}, fmt.Errorf("%w: invalid mobile shortcut id", ErrBadRequest)
	}
	labelLen := utf8.RuneCountInString(next.Label)
	if labelLen < 1 || labelLen > 16 {
		return MobileShortcut{}, fmt.Errorf("%w: mobile shortcut label must be 1-16 characters", ErrBadRequest)
	}
	hasAction := next.Action != ""
	hasInputKey := next.InputKey != ""
	if hasAction == hasInputKey {
		return MobileShortcut{}, fmt.Errorf("%w: mobile shortcut must have exactly one action or input key", ErrBadRequest)
	}
	if hasAction {
		if next.InputModifiers.Ctrl || next.InputModifiers.Alt || next.InputModifiers.Shift {
			return MobileShortcut{}, fmt.Errorf("%w: mobile shortcut action cannot have input modifiers", ErrBadRequest)
		}
		if !allowedMobileShortcutActions[next.Action] {
			return MobileShortcut{}, fmt.Errorf("%w: invalid mobile shortcut action", ErrBadRequest)
		}
		next.InputModifiers = MobileShortcutModifiers{}
	} else if !validMobileShortcutInputKey(next.InputKey) {
		return MobileShortcut{}, fmt.Errorf("%w: invalid mobile shortcut input key", ErrBadRequest)
	}
	return next, nil
}

func validMobileShortcutInputKey(key string) bool {
	if allowedMobileShortcutInputKeys[key] {
		return true
	}
	if utf8.RuneCountInString(key) != 1 {
		return false
	}
	r, _ := utf8.DecodeRuneInString(key)
	return r >= 0x20 && r != 0x7f
}

func normalizeDesktopShortcuts(list DesktopShortcutList) (DesktopShortcutList, error) {
	if list == nil {
		return nil, nil
	}
	if len(list) > 64 {
		return nil, fmt.Errorf("%w: too many desktop shortcuts", ErrBadRequest)
	}
	normalized := make(DesktopShortcutList, 0, len(list))
	seenIDs := make(map[string]struct{}, len(list))
	seenShortcuts := make(map[string]struct{}, len(list))
	for _, shortcut := range list {
		next, err := normalizeDesktopShortcut(shortcut)
		if err != nil {
			return nil, err
		}
		if _, ok := seenIDs[next.ID]; ok {
			return nil, fmt.Errorf("%w: duplicate desktop shortcut id", ErrBadRequest)
		}
		if _, ok := seenShortcuts[next.Shortcut]; ok {
			return nil, fmt.Errorf("%w: duplicate desktop shortcut", ErrBadRequest)
		}
		seenIDs[next.ID] = struct{}{}
		seenShortcuts[next.Shortcut] = struct{}{}
		normalized = append(normalized, next)
	}
	return normalized, nil
}

func normalizeDesktopShortcut(shortcut DesktopShortcut) (DesktopShortcut, error) {
	next := DesktopShortcut{
		ID:       strings.TrimSpace(shortcut.ID),
		Label:    strings.TrimSpace(shortcut.Label),
		Action:   strings.TrimSpace(shortcut.Action),
		Shortcut: strings.TrimSpace(shortcut.Shortcut),
	}
	if !desktopShortcutIDPattern.MatchString(next.ID) {
		return DesktopShortcut{}, fmt.Errorf("%w: invalid desktop shortcut id", ErrBadRequest)
	}
	labelLen := utf8.RuneCountInString(next.Label)
	if labelLen < 1 || labelLen > 32 {
		return DesktopShortcut{}, fmt.Errorf("%w: desktop shortcut label must be 1-32 characters", ErrBadRequest)
	}
	if !allowedDesktopShortcutActions[next.Action] {
		return DesktopShortcut{}, fmt.Errorf("%w: invalid desktop shortcut action", ErrBadRequest)
	}
	normalizedShortcut, err := normalizeDesktopShortcutDefinition(next.Shortcut)
	if err != nil {
		return DesktopShortcut{}, err
	}
	next.Shortcut = normalizedShortcut
	return next, nil
}

func normalizeDesktopShortcutDefinition(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("%w: invalid desktop shortcut", ErrBadRequest)
	}
	state := desktopShortcutState{}
	for _, part := range strings.Split(value, "+") {
		token := normalizeDesktopShortcutToken(part)
		switch token {
		case "ctrl":
			state.ctrl = true
		case "shift":
			state.shift = true
		case "alt":
			state.alt = true
		case "super":
			state.super = true
		default:
			state.key = token
		}
	}
	return state.serialize()
}

type desktopShortcutState struct {
	ctrl  bool
	shift bool
	alt   bool
	super bool
	key   string
}

func (s desktopShortcutState) serialize() (string, error) {
	if s.key == "" {
		return "", fmt.Errorf("%w: invalid desktop shortcut", ErrBadRequest)
	}
	parts := make([]string, 0, 5)
	if s.ctrl {
		parts = append(parts, "Ctrl")
	}
	if s.shift {
		parts = append(parts, "Shift")
	}
	if s.alt {
		parts = append(parts, "Alt")
	}
	if s.super {
		parts = append(parts, "Command")
	}
	parts = append(parts, s.key)
	return strings.Join(parts, " + "), nil
}

func normalizeDesktopShortcutToken(token string) string {
	raw := strings.TrimSpace(token)
	if raw == "" {
		return ""
	}
	lower := strings.ToLower(raw)
	switch lower {
	case "control", "ctrl":
		return "ctrl"
	case "shift":
		return "shift"
	case "alt", "option":
		return "alt"
	case "meta", "command", "cmd", "super":
		return "super"
	case "pageup":
		return "page_up"
	case "pagedown":
		return "page_down"
	case "return":
		return "enter"
	case "esc", "escape":
		return "escape"
	case " ":
		return "space"
	}
	if len(raw) == 1 {
		return lower
	}
	if strings.HasPrefix(lower, "f") && len(lower) <= 3 {
		return lower
	}
	return strings.ReplaceAll(lower, " ", "_")
}

func desktopMouseClipboardEnabled(settings Settings) bool {
	if settings.DesktopMouseClipboardEnabled == nil {
		return true
	}
	return *settings.DesktopMouseClipboardEnabled
}

func mobilePixelScrollEnabled(settings Settings) bool {
	if settings.MobilePixelScrollEnabled == nil {
		return true
	}
	return *settings.MobilePixelScrollEnabled
}

func mobileDoubleTapReminderEnabled(settings Settings) bool {
	if settings.MobileDoubleTapReminderEnabled == nil {
		return true
	}
	return *settings.MobileDoubleTapReminderEnabled
}

func boolPtr(value bool) *bool {
	return &value
}

func ValidateTerminalScrollback(value int) error {
	if value < MinTerminalScrollback || value > MaxTerminalScrollback {
		return fmt.Errorf("%w: terminal scrollback must be between %d and %d", ErrBadRequest, MinTerminalScrollback, MaxTerminalScrollback)
	}
	return nil
}

func deletedBuiltinFontSet(settings Settings) map[string]bool {
	deleted := make(map[string]bool, len(settings.DeletedBuiltinFontIDs))
	for _, id := range settings.DeletedBuiltinFontIDs {
		deleted[id] = true
	}
	return deleted
}

func (s Store) ensureDir() error {
	return os.MkdirAll(s.Dir, 0o755)
}

func (s Store) settingsPath() string {
	return filepath.Join(s.Dir, "settings.json")
}

func (s Store) metadataPath(id string) string {
	return filepath.Join(s.Dir, id+".json")
}

func (s Store) dataPath(metadata Metadata) string {
	extension := metadata.Extension
	if extension == "" {
		extension = filepath.Ext(metadata.Filename)
	}
	return filepath.Join(s.Dir, metadata.ID+extension)
}

func fontExists(fonts []Descriptor, id string) bool {
	for _, font := range fonts {
		if font.ID == id {
			return true
		}
	}
	return false
}

func maxBytesLabel() string {
	if MaxBytes%(1<<20) == 0 {
		return fmt.Sprintf("%d MB", MaxBytes/(1<<20))
	}
	if MaxBytes%(1<<10) == 0 {
		return fmt.Sprintf("%d KB", MaxBytes/(1<<10))
	}
	return fmt.Sprintf("%d bytes", MaxBytes)
}

func validateFilename(filename string) (string, error) {
	if strings.TrimSpace(filename) == "" || filename != filepath.Base(filename) {
		return "", fmt.Errorf("%w: invalid font filename", ErrBadRequest)
	}
	extension := strings.ToLower(filepath.Ext(filename))
	switch extension {
	case ".woff", ".woff2", ".ttf", ".otf":
		return extension, nil
	default:
		return "", fmt.Errorf("%w: only .woff, .woff2, .ttf and .otf are allowed", ErrBadRequest)
	}
}

func displayNameForUpload(data []byte, filename, extension string) (string, error) {
	switch extension {
	case ".ttf", ".otf":
		fontName, err := ParseDisplayName(data)
		if err != nil {
			return "", fmt.Errorf("%w: unable to read real font name: %v", ErrBadRequest, err)
		}
		return fontName, nil
	case ".woff", ".woff2":
		return filenameLabel(filename), nil
	default:
		return "", fmt.Errorf("%w: only .woff, .woff2, .ttf and .otf are allowed", ErrBadRequest)
	}
}

func filenameLabel(filename string) string {
	label := strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	label = strings.NewReplacer("_", " ", "-", " ").Replace(label)
	label = strings.Join(strings.Fields(label), " ")
	if label == "" {
		return "上传字体"
	}
	return label
}

func validateMIME(mimeType string) error {
	mimeType = strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0]))
	switch mimeType {
	case "font/woff", "font/woff2", "font/ttf", "font/otf",
		"application/font-woff", "application/font-woff2",
		"application/x-font-ttf", "application/x-font-otf",
		"application/octet-stream":
		return nil
	default:
		return fmt.Errorf("%w: unsupported font MIME type", ErrBadRequest)
	}
}

func normalizeMIME(mimeType, extension string) string {
	normalized := strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0]))
	if normalized != "" && normalized != "application/octet-stream" {
		return normalized
	}
	switch strings.ToLower(extension) {
	case ".woff2":
		return "font/woff2"
	case ".woff":
		return "font/woff"
	case ".ttf":
		return "font/ttf"
	case ".otf":
		return "font/otf"
	default:
		return normalized
	}
}

func sanitizeFilename(filename string) string {
	clean := strings.ReplaceAll(strings.TrimSpace(filename), "\x00", "")
	base := filepath.Base(clean)
	if index := strings.LastIndex(base, `\`); index >= 0 {
		base = base[index+1:]
	}
	base = strings.TrimSpace(base)
	if base == "." || base == string(filepath.Separator) || base == "" {
		return ""
	}
	return base
}
