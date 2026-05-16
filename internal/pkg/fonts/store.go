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
)

const (
	DefaultDir = "/lzcapp/var/fonts"
	DirEnv     = "WEBSHELL_FONT_DIR"
	MaxBytes   = 10 << 20

	DefaultTerminalScrollback = 5000
	MinTerminalScrollback     = 100
	MaxTerminalScrollback     = 100000
)

var (
	ErrBadRequest = errors.New("bad font request")
	idPattern     = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

type Store struct {
	Dir        string
	BundledDir string
}

type State struct {
	TerminalFontID               string       `json:"terminal_font_id"`
	TerminalScrollback           int          `json:"terminal_scrollback"`
	DesktopMouseClipboardEnabled bool         `json:"desktop_mouse_clipboard_enabled"`
	Fonts                        []Descriptor `json:"fonts"`
}

type Settings struct {
	TerminalFontID               string   `json:"terminal_font_id"`
	TerminalScrollback           int      `json:"terminal_scrollback"`
	DesktopMouseClipboardEnabled *bool    `json:"desktop_mouse_clipboard_enabled,omitempty"`
	DeletedBuiltinFontIDs        []string `json:"deleted_builtin_font_ids,omitempty"`
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
	SHA256   string
}

var bundledFonts = []bundledFont{
	{
		ID:       "2d5d4248c42ce44927e41d57630a4d621235b31764b91350464fc32bd1cb1538",
		Label:    "Source Code Pro",
		Family:   "WebShellBuiltin_SourceCodePro",
		Filename: "SourceCodePro-Regular.woff2",
		File:     "SourceCodePro-Regular.woff2",
		SHA256:   "714eee29b70d191f5bf4b3a06b68f2c50522b1303d31c7d44dcefdcc5f9defd0",
	},
	{
		ID:       "69adbdf6a8befb71fa19adfa9137ecbee9237b157206100b9bfbc6ed65fc79c3",
		Label:    "Fira Code",
		Family:   "WebShellBuiltin_FiraCode",
		Filename: "FiraCode-Regular.woff2",
		File:     "FiraCode-Regular.woff2",
		SHA256:   "a6ce59520b90e15d7062ffef214f94c8add5a4085c0bbb1683602ef227a4d1fe",
	},
	{
		ID:       "8a463de46a8fe098f88b5ae22239889eccce14767918d9d6a132d61e6635e3c2",
		Label:    "Hack",
		Family:   "WebShellBuiltin_Hack",
		Filename: "Hack-Regular.woff2",
		File:     "Hack-Regular.woff2",
		SHA256:   "0b0ef254dfc7afc172528e3166eace813989e1cf77f576ddae5f5e8fb2897c06",
	},
}

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
	selected := strings.TrimSpace(settings.TerminalFontID)
	if selected != "" && !fontExists(fonts, selected) {
		selected = ""
	}
	return State{
		TerminalFontID:               selected,
		TerminalScrollback:           settings.TerminalScrollback,
		DesktopMouseClipboardEnabled: desktopMouseClipboardEnabled(settings),
		Fonts:                        fonts,
	}, nil
}

func (s Store) ReadSettings() (Settings, error) {
	data, err := os.ReadFile(s.settingsPath())
	if errors.Is(err, os.ErrNotExist) {
		return Settings{
			TerminalScrollback:           DefaultTerminalScrollback,
			DesktopMouseClipboardEnabled: boolPtr(true),
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
		return Descriptor{}, fmt.Errorf("%w: font must be between 1 byte and 10 MB", ErrBadRequest)
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
		return File{Path: s.bundledPath(font), MIME: "font/woff2"}, nil
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
		MIME:       "font/woff2",
		Size:       info.Size(),
		URL:        "/api/settings/fonts/" + font.ID + "/file?v=" + font.SHA256[:12],
		SourceName: font.Label,
		Builtin:    true,
	}, true
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

func (s Store) bundledPath(font bundledFont) string {
	return filepath.Join(s.BundledDir, font.File)
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

func desktopMouseClipboardEnabled(settings Settings) bool {
	if settings.DesktopMouseClipboardEnabled == nil {
		return true
	}
	return *settings.DesktopMouseClipboardEnabled
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
