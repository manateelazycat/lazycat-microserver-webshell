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
)

var (
	ErrBadRequest = errors.New("bad font request")
	idPattern     = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

type Store struct {
	Dir string
}

type State struct {
	TerminalFontID string       `json:"terminal_font_id"`
	Fonts          []Descriptor `json:"fonts"`
}

type Settings struct {
	TerminalFontID string `json:"terminal_font_id"`
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
}

type File struct {
	Path string
	MIME string
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
	return State{TerminalFontID: selected, Fonts: fonts}, nil
}

func (s Store) ReadSettings() (Settings, error) {
	data, err := os.ReadFile(s.settingsPath())
	if errors.Is(err, os.ErrNotExist) {
		return Settings{}, nil
	}
	if err != nil {
		return Settings{}, err
	}
	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return Settings{}, err
	}
	settings.TerminalFontID = strings.TrimSpace(settings.TerminalFontID)
	return settings, nil
}

func (s Store) SaveSelection(id string) error {
	id = strings.TrimSpace(id)
	if id != "" {
		if !ValidID(id) {
			return fmt.Errorf("%w: invalid font id", ErrBadRequest)
		}
		if _, err := s.ReadMetadata(id); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("%w: font not found", ErrBadRequest)
			}
			return err
		}
	}
	if err := s.ensureDir(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(Settings{TerminalFontID: id}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.settingsPath(), append(data, '\n'), 0o644)
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
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		return nil, err
	}
	fonts := make([]Descriptor, 0)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" || entry.Name() == "settings.json" {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		metadata, err := s.ReadMetadata(id)
		if err != nil {
			continue
		}
		fonts = append(fonts, metadata.Descriptor())
	}
	sort.Slice(fonts, func(i, j int) bool {
		return strings.ToLower(fonts[i].Label) < strings.ToLower(fonts[j].Label)
	})
	return fonts, nil
}

func (s Store) File(id string) (File, error) {
	metadata, err := s.ReadMetadata(id)
	if err != nil {
		return File{}, err
	}
	return File{Path: s.dataPath(metadata), MIME: metadata.MIME}, nil
}

func (s Store) Delete(id string) error {
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
