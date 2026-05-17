package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestStaticFileServerCacheHeaders(t *testing.T) {
	root := t.TempDir()
	files := map[string]string{
		"page.html": "html",
		"main.js":   "console.log('ok');",
		"style.css": "body {}",
		"data.json": "{}",
		"app.wasm":  "\x00asm",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0o600); err != nil {
			t.Fatalf("WriteFile(%s) error = %v", name, err)
		}
	}

	handler := staticFileServer(root)

	tests := []struct {
		path             string
		wantCacheControl string
		wantContentType  string
	}{
		{path: "/page.html", wantCacheControl: "no-store"},
		{path: "/main.js", wantCacheControl: "no-cache", wantContentType: "text/javascript; charset=utf-8"},
		{path: "/style.css", wantCacheControl: "no-cache"},
		{path: "/data.json", wantCacheControl: "no-cache"},
		{path: "/app.wasm", wantCacheControl: "no-cache", wantContentType: "application/wasm"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, tt.path, nil))

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
			}
			if cacheControl := recorder.Header().Get("Cache-Control"); cacheControl != tt.wantCacheControl {
				t.Fatalf("Cache-Control = %q, want %q", cacheControl, tt.wantCacheControl)
			}
			if tt.wantContentType != "" {
				if contentType := recorder.Header().Get("Content-Type"); contentType != tt.wantContentType {
					t.Fatalf("Content-Type = %q, want %q", contentType, tt.wantContentType)
				}
			}
		})
	}
}
