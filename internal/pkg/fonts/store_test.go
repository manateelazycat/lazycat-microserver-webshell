package fonts

import (
	"os"
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
