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
	"strings"
	"testing"
)

type stubAttachmentBackend struct {
	calls []stubAttachmentCall
	err   error
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

func newAttachmentTestServer(backend attachmentUploadBackend) *pluginServer {
	return &pluginServer{
		instancesResolver: func(context.Context) ([]instanceSummary, error) {
			return []instanceSummary{
				{Name: "alpha", OwnerDeployID: "deploy-a", Status: "running", Username: "alice"},
				{Name: "beta", OwnerDeployID: "deploy-b", Status: "running", Username: "bob"},
			}, nil
		},
		attachmentBackend: backend,
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
