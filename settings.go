package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"lcmd-webshell/internal/pkg/fonts"
)

type settingsPatch struct {
	TerminalFontID                 optionalString           `json:"terminal_font_id"`
	TerminalScrollback             optionalInt              `json:"terminal_scrollback"`
	DesktopMouseClipboardEnabled   optionalBool             `json:"desktop_mouse_clipboard_enabled"`
	MobilePixelScrollEnabled       optionalBool             `json:"mobile_pixel_scroll_enabled"`
	MobileDoubleTapReminderEnabled optionalBool             `json:"mobile_double_tap_reminder_enabled"`
	MobileShortcuts                optionalMobileShortcuts  `json:"mobile_shortcuts"`
	DesktopShortcuts               optionalDesktopShortcuts `json:"desktop_shortcuts"`
}

type optionalString struct {
	Value string
	Set   bool
	Null  bool
}

type optionalInt struct {
	Value int
	Set   bool
	Null  bool
}

type optionalBool struct {
	Value bool
	Set   bool
	Null  bool
}

type optionalMobileShortcuts struct {
	Value fonts.MobileShortcutRows
	Set   bool
	Null  bool
}

type optionalDesktopShortcuts struct {
	Value fonts.DesktopShortcutList
	Set   bool
	Null  bool
}

func (o *optionalString) UnmarshalJSON(data []byte) error {
	o.Set = true
	o.Value = ""
	o.Null = bytes.Equal(bytes.TrimSpace(data), []byte("null"))
	if o.Null {
		return nil
	}
	return json.Unmarshal(data, &o.Value)
}

func (o *optionalInt) UnmarshalJSON(data []byte) error {
	o.Set = true
	o.Null = bytes.Equal(bytes.TrimSpace(data), []byte("null"))
	if o.Null {
		return nil
	}
	var value int
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	o.Value = value
	return nil
}

func (o *optionalBool) UnmarshalJSON(data []byte) error {
	o.Set = true
	o.Value = false
	o.Null = bytes.Equal(bytes.TrimSpace(data), []byte("null"))
	if o.Null {
		return nil
	}
	return json.Unmarshal(data, &o.Value)
}

func (o *optionalMobileShortcuts) UnmarshalJSON(data []byte) error {
	o.Set = true
	o.Value = nil
	o.Null = bytes.Equal(bytes.TrimSpace(data), []byte("null"))
	if o.Null {
		return nil
	}
	return json.Unmarshal(data, &o.Value)
}

func (o *optionalDesktopShortcuts) UnmarshalJSON(data []byte) error {
	o.Set = true
	o.Value = nil
	o.Null = bytes.Equal(bytes.TrimSpace(data), []byte("null"))
	if o.Null {
		return nil
	}
	return json.Unmarshal(data, &o.Value)
}

func (s *pluginServer) fontStore() fonts.Store {
	return fonts.Store{
		Dir:        s.fontDir,
		BundledDir: filepath.Join(s.rootDir, "runtime", "fonts", "preinstalled"),
	}
}

func (s *pluginServer) currentTerminalScrollback() int {
	s.settingsMu.Lock()
	settings, err := s.fontStore().ReadSettings()
	s.settingsMu.Unlock()
	if err != nil {
		return fonts.DefaultTerminalScrollback
	}
	return settings.TerminalScrollback
}

func (s *pluginServer) handleSettings(w http.ResponseWriter, r *http.Request) {
	store := s.fontStore()
	switch r.Method {
	case http.MethodGet:
		s.settingsMu.Lock()
		state, err := store.State()
		s.settingsMu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, state)
	case http.MethodPut:
		var payload settingsPatch
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			http.Error(w, "invalid settings payload", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			http.Error(w, "invalid settings payload", http.StatusBadRequest)
			return
		}
		if payload.TerminalScrollback.Set && !payload.TerminalScrollback.Null {
			if err := fonts.ValidateTerminalScrollback(payload.TerminalScrollback.Value); err != nil {
				writeSettingsError(w, err)
				return
			}
		}
		s.settingsMu.Lock()
		settings, err := store.ReadSettings()
		updateFont := payload.TerminalFontID.Set && !payload.TerminalFontID.Null
		if err == nil {
			if updateFont {
				settings.TerminalFontID = strings.TrimSpace(payload.TerminalFontID.Value)
				settings.TerminalFontSystemDefault = settings.TerminalFontID == ""
			}
			if payload.TerminalScrollback.Set && !payload.TerminalScrollback.Null {
				settings.TerminalScrollback = payload.TerminalScrollback.Value
			}
			if payload.DesktopMouseClipboardEnabled.Set && !payload.DesktopMouseClipboardEnabled.Null {
				settings.DesktopMouseClipboardEnabled = &payload.DesktopMouseClipboardEnabled.Value
			}
			if payload.MobilePixelScrollEnabled.Set && !payload.MobilePixelScrollEnabled.Null {
				settings.MobilePixelScrollEnabled = &payload.MobilePixelScrollEnabled.Value
			}
			if payload.MobileDoubleTapReminderEnabled.Set && !payload.MobileDoubleTapReminderEnabled.Null {
				settings.MobileDoubleTapReminderEnabled = &payload.MobileDoubleTapReminderEnabled.Value
			}
			if payload.MobileShortcuts.Set {
				if payload.MobileShortcuts.Null {
					settings.MobileShortcuts = nil
				} else {
					settings.MobileShortcuts = &payload.MobileShortcuts.Value
				}
			}
			if payload.DesktopShortcuts.Set {
				if payload.DesktopShortcuts.Null {
					settings.DesktopShortcuts = nil
				} else {
					settings.DesktopShortcuts = &payload.DesktopShortcuts.Value
				}
			}
			_, err = store.MergeSettings(settings, !updateFont)
		}
		var state fonts.State
		if err == nil {
			state, err = store.State()
		}
		s.settingsMu.Unlock()
		if err != nil {
			writeSettingsError(w, err)
			return
		}
		writeJSON(w, state)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *pluginServer) handleSettingsFonts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	const maxFontUploadCount = 32
	const maxFontUploadMemory = 32 << 20
	if err := r.ParseMultipartForm(maxFontUploadMemory); err != nil {
		http.Error(w, "invalid upload", http.StatusBadRequest)
		return
	}
	headers := r.MultipartForm.File["font"]
	if len(headers) == 0 {
		http.Error(w, "font file is required", http.StatusBadRequest)
		return
	}
	if len(headers) > maxFontUploadCount {
		http.Error(w, "too many font files", http.StatusBadRequest)
		return
	}

	store := s.fontStore()
	var selectedFontID string
	for _, header := range headers {
		file, err := header.Open()
		if err != nil {
			writeSettingsError(w, err)
			return
		}
		font, err := store.StoreUpload(header.Filename, header.Header.Get("Content-Type"), file)
		closeErr := file.Close()
		if err != nil {
			writeSettingsError(w, err)
			return
		}
		if closeErr != nil {
			writeSettingsError(w, closeErr)
			return
		}
		selectedFontID = font.ID
	}
	s.settingsMu.Lock()
	err := store.SaveSelection(selectedFontID)
	var state fonts.State
	if err == nil {
		state, err = store.State()
	}
	s.settingsMu.Unlock()
	if err != nil {
		writeSettingsError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(state)
}

func (s *pluginServer) handleSettingsFont(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/settings/fonts/")
	id, suffix, _ := strings.Cut(path, "/")
	if !fonts.ValidID(id) {
		http.Error(w, "invalid font id", http.StatusBadRequest)
		return
	}
	store := s.fontStore()
	if suffix == "file" {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		file, err := store.File(id)
		if err != nil {
			writeSettingsError(w, err)
			return
		}
		w.Header().Set("Content-Type", file.MIME)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(w, r, file.Path)
		return
	}
	if suffix != "" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	s.settingsMu.Lock()
	err := store.Delete(id)
	s.settingsMu.Unlock()
	if err != nil {
		writeSettingsError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeSettingsError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, fonts.ErrBadRequest) {
		status = http.StatusBadRequest
	} else if errors.Is(err, os.ErrNotExist) {
		status = http.StatusNotFound
	}
	http.Error(w, err.Error(), status)
}
