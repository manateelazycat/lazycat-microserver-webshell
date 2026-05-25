package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type stubAttachmentBackend struct {
	calls []stubAttachmentCall
	err   error
}

type stubAttachmentFileBackend struct {
	listResponse  attachmentFileListResponse
	listResponses map[string]attachmentFileListResponse
	statResponse  []attachmentFileEntry
	files         map[string]string
	err           error
}

type stubAttachmentCall struct {
	scope    agentScope
	username string
	filename string
	data     string
}

func (b *stubAttachmentBackend) UploadAttachment(ctx context.Context, scope agentScope, username string, filename string, content io.Reader) (attachmentUploadResult, error) {
	data, err := io.ReadAll(content)
	if err != nil {
		return attachmentUploadResult{}, err
	}
	b.calls = append(b.calls, stubAttachmentCall{
		scope:    scope,
		username: username,
		filename: filename,
		data:     string(data),
	})
	if b.err != nil {
		return attachmentUploadResult{}, b.err
	}
	return attachmentUploadResult{
		Name: sanitizeAttachmentFilename(filename),
		Path: "/tmp/" + sanitizeAttachmentFilename(filename),
		Size: int64(len(data)),
	}, nil
}

func (b *stubAttachmentFileBackend) ListAttachmentFiles(ctx context.Context, scope agentScope, username string, path string) (attachmentFileListResponse, error) {
	if b.err != nil {
		return attachmentFileListResponse{}, b.err
	}
	if b.listResponses != nil {
		return b.listResponses[path], nil
	}
	return b.listResponse, nil
}

func (b *stubAttachmentFileBackend) StatAttachmentFiles(ctx context.Context, scope agentScope, username string, paths []string) ([]attachmentFileEntry, error) {
	if b.err != nil {
		return nil, b.err
	}
	return append([]attachmentFileEntry(nil), b.statResponse...), nil
}

func (b *stubAttachmentFileBackend) OpenAttachmentFile(ctx context.Context, scope agentScope, username string, path string) (io.ReadCloser, error) {
	if b.err != nil {
		return nil, b.err
	}
	data, ok := b.files[path]
	if !ok {
		return nil, errors.New("missing file")
	}
	return io.NopCloser(strings.NewReader(data)), nil
}

func newAttachmentTestServer(backend attachmentUploadBackend) *pluginServer {
	return newAttachmentTestServerWithFiles(backend, nil)
}

func newAttachmentTestServerWithFiles(backend attachmentUploadBackend, fileBackend attachmentFileBackend) *pluginServer {
	return &pluginServer{
		instancesResolver: func(context.Context) ([]instanceSummary, error) {
			return []instanceSummary{
				{Name: "alpha", OwnerDeployID: "deploy-a", Status: "running", Username: "alice"},
				{Name: "beta", OwnerDeployID: "deploy-b", Status: "running", Username: "bob"},
			}, nil
		},
		attachmentBackend:      backend,
		attachmentFilesBackend: fileBackend,
	}
}

func buildAttachmentMultipart(t *testing.T, files map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for filename, data := range files {
		part, err := writer.CreateFormFile("file", filename)
		if err != nil {
			t.Fatalf("CreateFormFile(%q) error = %v", filename, err)
		}
		if _, err := io.WriteString(part, data); err != nil {
			t.Fatalf("write %q error = %v", filename, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close error = %v", err)
	}
	return &body, writer.FormDataContentType()
}

func TestHandleAttachmentsUploadsMultipleFiles(t *testing.T) {
	backend := &stubAttachmentBackend{}
	server := newAttachmentTestServer(backend)
	body, contentType := buildAttachmentMultipart(t, map[string]string{
		"first.txt":  "hello",
		"second.log": "world",
	})
	request := httptest.NewRequest(http.MethodPost, "/api/attachments?name=alpha@deploy-a", body)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachments(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("handleAttachments status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response attachmentUploadResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if len(response.Files) != 2 {
		t.Fatalf("file count = %d, want 2: %+v", len(response.Files), response.Files)
	}
	if len(backend.calls) != 2 {
		t.Fatalf("backend calls = %d, want 2", len(backend.calls))
	}
	for _, call := range backend.calls {
		if call.scope.Selector != "alpha@deploy-a" || call.scope.AccountID != "login-user-a" {
			t.Fatalf("backend scope = %+v", call.scope)
		}
		if call.username != "alice" {
			t.Fatalf("backend username = %q, want alice", call.username)
		}
	}
}

func TestHandleAttachmentsRequiresAccount(t *testing.T) {
	server := newAttachmentTestServer(&stubAttachmentBackend{})
	body, contentType := buildAttachmentMultipart(t, map[string]string{"file.txt": "data"})
	request := httptest.NewRequest(http.MethodPost, "/api/attachments?name=alpha@deploy-a", body)
	request.Header.Set("Content-Type", contentType)
	recorder := httptest.NewRecorder()

	server.handleAttachments(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("handleAttachments status = %d, want 401", recorder.Code)
	}
}

func TestHandleAttachmentsRejectsUnauthorizedInstance(t *testing.T) {
	server := newAttachmentTestServer(&stubAttachmentBackend{})
	body, contentType := buildAttachmentMultipart(t, map[string]string{"file.txt": "data"})
	request := httptest.NewRequest(http.MethodPost, "/api/attachments?name=missing@deploy-z", body)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachments(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("handleAttachments status = %d, want 403", recorder.Code)
	}
}

func TestHandleAttachmentsRejectsTooManyFiles(t *testing.T) {
	backend := &stubAttachmentBackend{}
	server := newAttachmentTestServer(backend)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for i := 0; i < maxAttachmentUploadCount+1; i++ {
		part, err := writer.CreateFormFile("file", "file.txt")
		if err != nil {
			t.Fatalf("CreateFormFile error = %v", err)
		}
		_, _ = io.WriteString(part, "x")
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/attachments?name=alpha@deploy-a", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachments(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("handleAttachments status = %d, want 400", recorder.Code)
	}
	if len(backend.calls) != maxAttachmentUploadCount {
		t.Fatalf("backend calls = %d, want %d", len(backend.calls), maxAttachmentUploadCount)
	}
}

func TestHandleAttachmentsPropagatesTooLarge(t *testing.T) {
	server := newAttachmentTestServer(&stubAttachmentBackend{err: errAttachmentTooLarge})
	body, contentType := buildAttachmentMultipart(t, map[string]string{"big.bin": "data"})
	request := httptest.NewRequest(http.MethodPost, "/api/attachments?name=alpha@deploy-a", body)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachments(recorder, request)

	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("handleAttachments status = %d, want 413", recorder.Code)
	}
}

func TestAttachmentLimitReaderAllowsExactLimit(t *testing.T) {
	reader := &attachmentLimitReader{reader: strings.NewReader("abc"), limit: 3}
	data, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll exact limit error = %v", err)
	}
	if string(data) != "abc" {
		t.Fatalf("data = %q, want abc", data)
	}
	if reader.TooLarge() {
		t.Fatal("reader marked exact limit as too large")
	}
}

func TestAttachmentLimitReaderRejectsOverLimit(t *testing.T) {
	reader := &attachmentLimitReader{reader: strings.NewReader("abcd"), limit: 3}
	_, err := io.ReadAll(reader)
	if !errors.Is(err, errAttachmentTooLarge) {
		t.Fatalf("ReadAll error = %v, want errAttachmentTooLarge", err)
	}
	if !reader.TooLarge() {
		t.Fatal("reader did not mark over-limit content")
	}
}

func TestSanitizeAttachmentFilename(t *testing.T) {
	tests := map[string]string{
		"../../etc/passwd": "passwd",
		" notes?.txt ":     "notes-.txt",
		"\x00\x01":         "clipboard.txt",
		"---":              "clipboard.txt",
		"":                 "clipboard.txt",
	}
	for input, want := range tests {
		if got := sanitizeAttachmentFilename(input); got != want {
			t.Fatalf("sanitizeAttachmentFilename(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestBuildAttachmentPathReservationScriptUsesSanitizedName(t *testing.T) {
	script := buildAttachmentPathReservationScript("../../bad name?.txt")
	if !containsAll(script, "base='bad name-.txt'", "dir=/tmp", "stem='bad name-'", "set -C", "reserve \"$candidate\"") {
		t.Fatalf("reservation script did not use sanitized name:\n%s", script)
	}
}

func TestBuildAttachmentUploadScriptChownsUserFile(t *testing.T) {
	script := buildAttachmentUploadScript("/tmp/a.upload", "/tmp/a", "alice")
	if !containsAll(script, "cat > \"$tmp\"", "chown \"$uid:$gid\" \"$tmp\"", "mv -f \"$tmp\" \"$final\"", "if [ \"$complete\" != 1 ]; then rm -f \"$final\"; fi") {
		t.Fatalf("upload script missing expected steps:\n%s", script)
	}
}

func TestHandleAttachmentFilesListsFiles(t *testing.T) {
	fileBackend := &stubAttachmentFileBackend{
		listResponse: attachmentFileListResponse{
			Path:   "/home/alice",
			Parent: "/home",
			Entries: []attachmentFileEntry{
				{Name: "note.txt", Path: "/home/alice/note.txt", Type: "file", Size: 4},
			},
		},
	}
	server := newAttachmentTestServerWithFiles(&stubAttachmentBackend{}, fileBackend)
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/files?name=alpha@deploy-a&path=/home/alice", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachmentFiles(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleAttachmentFiles status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response attachmentFileListResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response error = %v", err)
	}
	if response.Path != "/home/alice" || len(response.Entries) != 1 || response.Entries[0].Name != "note.txt" {
		t.Fatalf("response = %+v, want listed file", response)
	}
}

func TestHandleAttachmentDownloadSingleFile(t *testing.T) {
	fileBackend := &stubAttachmentFileBackend{
		statResponse: []attachmentFileEntry{{Name: "note.txt", Path: "/home/alice/note.txt", Type: "file", Size: 5}},
		files:        map[string]string{"/home/alice/note.txt": "hello"},
	}
	server := newAttachmentTestServerWithFiles(&stubAttachmentBackend{}, fileBackend)
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/download?name=alpha@deploy-a&path=/home/alice/note.txt", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachmentDownload(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleAttachmentDownload status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Body.String(); got != "hello" {
		t.Fatalf("body = %q, want hello", got)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/octet-stream" {
		t.Fatalf("Content-Type = %q, want application/octet-stream", contentType)
	}
	if disposition := recorder.Header().Get("Content-Disposition"); !strings.Contains(disposition, "note.txt") {
		t.Fatalf("Content-Disposition = %q, want filename", disposition)
	}
}

func TestHandleAttachmentDownloadMultipleFilesAsZip(t *testing.T) {
	fileBackend := &stubAttachmentFileBackend{
		statResponse: []attachmentFileEntry{
			{Name: "a.txt", Path: "/home/alice/a.txt", Type: "file", Size: 1},
			{Name: "b.txt", Path: "/home/alice/b.txt", Type: "file", Size: 1},
		},
		files: map[string]string{
			"/home/alice/a.txt": "a",
			"/home/alice/b.txt": "b",
		},
	}
	server := newAttachmentTestServerWithFiles(&stubAttachmentBackend{}, fileBackend)
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/download?name=alpha@deploy-a&path=/home/alice/a.txt&path=/home/alice/b.txt", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachmentDownload(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleAttachmentDownload status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/zip" {
		t.Fatalf("Content-Type = %q, want application/zip", contentType)
	}
	reader, err := zip.NewReader(bytes.NewReader(recorder.Body.Bytes()), int64(recorder.Body.Len()))
	if err != nil {
		t.Fatalf("zip.NewReader error = %v", err)
	}
	if len(reader.File) != 2 {
		t.Fatalf("zip entries = %d, want 2", len(reader.File))
	}
	got := make(map[string]string)
	for _, file := range reader.File {
		rc, err := file.Open()
		if err != nil {
			t.Fatalf("open zip file %q error = %v", file.Name, err)
		}
		data, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("read zip file %q error = %v", file.Name, err)
		}
		got[file.Name] = string(data)
	}
	if got["a.txt"] != "a" || got["b.txt"] != "b" {
		t.Fatalf("zip contents = %+v, want a/b", got)
	}
}

func TestHandleAttachmentDownloadDirectoryAsZip(t *testing.T) {
	fileBackend := &stubAttachmentFileBackend{
		statResponse: []attachmentFileEntry{
			{Name: "docs", Path: "/home/alice/docs", Type: "dir"},
		},
		listResponses: map[string]attachmentFileListResponse{
			"/home/alice/docs": {
				Path: "/home/alice/docs",
				Entries: []attachmentFileEntry{
					{Name: "a.txt", Path: "/home/alice/docs/a.txt", Type: "file", Size: 1},
					{Name: "nested", Path: "/home/alice/docs/nested", Type: "dir"},
				},
			},
			"/home/alice/docs/nested": {
				Path: "/home/alice/docs/nested",
				Entries: []attachmentFileEntry{
					{Name: "b.txt", Path: "/home/alice/docs/nested/b.txt", Type: "file", Size: 1},
				},
			},
		},
		files: map[string]string{
			"/home/alice/docs/a.txt":        "a",
			"/home/alice/docs/nested/b.txt": "b",
		},
	}
	server := newAttachmentTestServerWithFiles(&stubAttachmentBackend{}, fileBackend)
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/download?name=alpha@deploy-a&path=/home/alice/docs", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachmentDownload(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("handleAttachmentDownload status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/zip" {
		t.Fatalf("Content-Type = %q, want application/zip", contentType)
	}
	if disposition := recorder.Header().Get("Content-Disposition"); !strings.Contains(disposition, "docs.zip") {
		t.Fatalf("Content-Disposition = %q, want docs.zip", disposition)
	}
	reader, err := zip.NewReader(bytes.NewReader(recorder.Body.Bytes()), int64(recorder.Body.Len()))
	if err != nil {
		t.Fatalf("zip.NewReader error = %v", err)
	}
	got := make(map[string]string)
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			got[file.Name] = "<dir>"
			continue
		}
		rc, err := file.Open()
		if err != nil {
			t.Fatalf("open zip file %q error = %v", file.Name, err)
		}
		data, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("read zip file %q error = %v", file.Name, err)
		}
		got[file.Name] = string(data)
	}
	if got["docs/"] != "<dir>" || got["docs/a.txt"] != "a" || got["docs/nested/"] != "<dir>" || got["docs/nested/b.txt"] != "b" {
		t.Fatalf("zip contents = %+v, want docs directory tree", got)
	}
}

func TestCollectAttachmentArchiveSourcesSkipsRepeatedResolvedDirectory(t *testing.T) {
	fileBackend := &stubAttachmentFileBackend{
		listResponses: map[string]attachmentFileListResponse{
			"/home/alice/docs": {
				Path: "/home/alice/docs",
				Entries: []attachmentFileEntry{
					{Name: "again", Path: "/home/alice/docs/again", Type: "dir"},
				},
			},
			"/home/alice/docs/again": {
				Path: "/home/alice/docs",
				Entries: []attachmentFileEntry{
					{Name: "loop", Path: "/home/alice/docs/again/loop", Type: "dir"},
				},
			},
		},
	}
	server := newAttachmentTestServerWithFiles(&stubAttachmentBackend{}, fileBackend)

	sources, err := server.collectAttachmentArchiveSources(context.Background(), fileBackend, agentScope{Selector: "alpha@deploy-a", AccountID: "login-user-a"}, "alice", []attachmentFileEntry{
		{Name: "docs", Path: "/home/alice/docs", Type: "dir"},
	})

	if err != nil {
		t.Fatalf("collectAttachmentArchiveSources error = %v", err)
	}
	if len(sources) != 1 || sources[0].Name != "docs/" {
		t.Fatalf("sources = %+v, want only root directory", sources)
	}
}

func TestUniqueAttachmentArchivePathAvoidsFileDirectoryCollision(t *testing.T) {
	seen := make(map[string]int)
	if got := uniqueAttachmentArchivePath("docs/", seen); got != "docs/" {
		t.Fatalf("first path = %q, want docs/", got)
	}
	if got := uniqueAttachmentArchivePath("docs", seen); got != "docs-2" {
		t.Fatalf("colliding file path = %q, want docs-2", got)
	}
	if got := uniqueAttachmentArchivePath("docs/", seen); got != "docs-3/" {
		t.Fatalf("colliding directory path = %q, want docs-3/", got)
	}
}

func TestHandleAttachmentDownloadRequiresPath(t *testing.T) {
	server := newAttachmentTestServerWithFiles(&stubAttachmentBackend{}, &stubAttachmentFileBackend{})
	request := httptest.NewRequest(http.MethodGet, "/api/attachments/download?name=alpha@deploy-a", nil)
	request.Header.Set(lightOSUserIDHeader, "login-user-a")
	recorder := httptest.NewRecorder()

	server.handleAttachmentDownload(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("handleAttachmentDownload status = %d, want 400", recorder.Code)
	}
}
