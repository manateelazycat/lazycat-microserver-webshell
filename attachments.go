package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	maxAttachmentUploadCount   = 32
	maxAttachmentUploadBytes   = int64(2 << 30)
	maxAttachmentDownloadCount = 64
	maxAttachmentArchiveCount  = 4096
)

var errAttachmentTooLarge = errors.New("attachment file is too large")
var errAttachmentBadRequest = errors.New("bad attachment request")

type attachmentUploadBackend interface {
	UploadAttachment(ctx context.Context, scope agentScope, username string, filename string, content io.Reader) (attachmentUploadResult, error)
}

type attachmentFileBackend interface {
	ListAttachmentFiles(ctx context.Context, scope agentScope, username string, path string) (attachmentFileListResponse, error)
	StatAttachmentFiles(ctx context.Context, scope agentScope, username string, paths []string) ([]attachmentFileEntry, error)
	OpenAttachmentFile(ctx context.Context, scope agentScope, username string, path string) (io.ReadCloser, error)
}

type lightOSAttachmentUploadBackend struct{}
type lightOSAttachmentFileBackend struct{}
type clientAttachmentUploadBackend struct {
	server *pluginServer
	header http.Header
}
type clientAttachmentFileBackend struct {
	server *pluginServer
	header http.Header
}

type attachmentUploadResult struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

type attachmentUploadResponse struct {
	Files []attachmentUploadResult `json:"files"`
}

type attachmentFileEntry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	Modified int64  `json:"modified"`
}

type attachmentFileListResponse struct {
	Path    string                `json:"path"`
	Parent  string                `json:"parent,omitempty"`
	Entries []attachmentFileEntry `json:"entries"`
}

type attachmentArchiveSource struct {
	Name     string
	Path     string
	Type     string
	Modified int64
}

func (b clientAttachmentUploadBackend) UploadAttachment(ctx context.Context, scope agentScope, username string, filename string, content io.Reader) (attachmentUploadResult, error) {
	if b.server == nil {
		return attachmentUploadResult{}, errors.New("client attachment proxy is unavailable")
	}
	reader, writer := io.Pipe()
	multipartWriter := multipart.NewWriter(writer)
	errCh := make(chan error, 1)
	doneCh := make(chan struct{})
	go func() {
		defer close(doneCh)
		part, err := multipartWriter.CreateFormFile("file", sanitizeAttachmentFilename(filename))
		if err == nil {
			_, err = io.Copy(part, content)
		}
		if closeErr := multipartWriter.Close(); err == nil {
			err = closeErr
		}
		if err != nil {
			_ = writer.CloseWithError(err)
			errCh <- err
			return
		}
		errCh <- writer.Close()
	}()
	resp, err := b.server.clientTerminalRequest(ctx, b.header, scope.Selector, http.MethodPost, "/attachments", nil, reader, multipartWriter.FormDataContentType())
	if err != nil {
		_ = reader.Close()
		select {
		case pipeErr := <-errCh:
			if pipeErr != nil && !errors.Is(pipeErr, io.ErrClosedPipe) {
				return attachmentUploadResult{}, pipeErr
			}
		case <-doneCh:
		case <-ctx.Done():
			return attachmentUploadResult{}, ctx.Err()
		}
		return attachmentUploadResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_ = reader.Close()
		return attachmentUploadResult{}, clientTerminalResponseError(resp, "client attachment upload")
	}
	var response attachmentUploadResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 10<<20)).Decode(&response); err != nil {
		_ = reader.Close()
		return attachmentUploadResult{}, err
	}
	_ = reader.Close()
	if pipeErr := <-errCh; pipeErr != nil && !errors.Is(pipeErr, io.ErrClosedPipe) {
		return attachmentUploadResult{}, pipeErr
	}
	if len(response.Files) != 1 {
		return attachmentUploadResult{}, errors.New("client attachment upload returned invalid response")
	}
	return response.Files[0], nil
}

func (b clientAttachmentFileBackend) ListAttachmentFiles(ctx context.Context, scope agentScope, username string, path string) (attachmentFileListResponse, error) {
	var response attachmentFileListResponse
	err := b.clientAttachmentJSON(ctx, scope.Selector, http.MethodGet, "/attachments/files", map[string]string{"path": path}, nil, &response)
	return response, err
}

func (b clientAttachmentFileBackend) StatAttachmentFiles(ctx context.Context, scope agentScope, username string, paths []string) ([]attachmentFileEntry, error) {
	var response []attachmentFileEntry
	query := make(map[string][]string, 1)
	for _, path := range paths {
		query["path"] = append(query["path"], path)
	}
	err := b.clientAttachmentJSONWithValues(ctx, scope.Selector, http.MethodGet, "/attachments/stat", query, nil, &response)
	return response, err
}

func (b clientAttachmentFileBackend) OpenAttachmentFile(ctx context.Context, scope agentScope, username string, path string) (io.ReadCloser, error) {
	if b.server == nil {
		return nil, errors.New("client attachment proxy is unavailable")
	}
	resp, err := b.server.clientTerminalRequest(ctx, b.header, scope.Selector, http.MethodGet, "/attachments/open", map[string][]string{"path": []string{path}}, nil, "")
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		return nil, clientTerminalResponseError(resp, "client attachment open")
	}
	return resp.Body, nil
}

func (b clientAttachmentFileBackend) clientAttachmentJSON(ctx context.Context, selector, method, path string, query map[string]string, body any, out any) error {
	values := make(map[string][]string, len(query))
	for key, value := range query {
		if strings.TrimSpace(value) != "" {
			values[key] = []string{value}
		}
	}
	return b.clientAttachmentJSONWithValues(ctx, selector, method, path, values, body, out)
}

func (b clientAttachmentFileBackend) clientAttachmentJSONWithValues(ctx context.Context, selector, method, path string, query map[string][]string, body any, out any) error {
	if b.server == nil {
		return errors.New("client attachment proxy is unavailable")
	}
	var reader io.Reader
	contentType := ""
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
		contentType = "application/json"
	}
	resp, err := b.server.clientTerminalRequest(ctx, b.header, selector, method, path, query, reader, contentType)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return clientTerminalResponseError(resp, "client attachment request")
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 10<<20)).Decode(out)
}

func (s *pluginServer) handleAttachments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if isClientTarget(selector) {
		if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
			writeClientTerminalError(w, err)
			return
		}
		s.handleAttachmentUploadWithBackend(w, r, normalizeAgentScope(selector, accountID), "", clientAttachmentUploadBackend{server: s, header: r.Header})
		return
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return
	}
	username, err := s.resolveAttachmentUsername(r.Context(), selector)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	s.handleAttachmentUploadWithBackend(w, r, normalizeAgentScope(selector, accountID), username, s.attachmentUploadBackend())
}

func (s *pluginServer) handleAttachmentUploadWithBackend(w http.ResponseWriter, r *http.Request, scope agentScope, username string, backend attachmentUploadBackend) {
	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "invalid upload", http.StatusBadRequest)
		return
	}

	var response attachmentUploadResponse
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			http.Error(w, "invalid upload", http.StatusBadRequest)
			return
		}
		if part.FormName() != "file" {
			_ = part.Close()
			continue
		}
		if len(response.Files) >= maxAttachmentUploadCount {
			_ = part.Close()
			http.Error(w, "too many files", http.StatusBadRequest)
			return
		}
		limited := limitAttachmentReader(part)
		result, err := backend.UploadAttachment(r.Context(), scope, username, part.FileName(), limited)
		closeErr := part.Close()
		if err != nil {
			if isClientTarget(scope.Selector) {
				writeClientTerminalError(w, err)
			} else {
				writeAttachmentUploadError(w, err)
			}
			return
		}
		if limited.TooLarge() {
			http.Error(w, errAttachmentTooLarge.Error(), http.StatusRequestEntityTooLarge)
			return
		}
		if closeErr != nil {
			http.Error(w, "invalid upload", http.StatusBadRequest)
			return
		}
		response.Files = append(response.Files, result)
	}
	if len(response.Files) == 0 {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	writeJSONStatus(w, http.StatusCreated, response)
}

func (s *pluginServer) handleAttachmentFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	scope, username, ok := s.resolveAttachmentRequestScope(w, r)
	if !ok {
		return
	}
	state, err := s.attachmentFileBackendForRequest(r, scope).ListAttachmentFiles(r.Context(), scope, username, r.URL.Query().Get("path"))
	if err != nil {
		if isClientTarget(scope.Selector) {
			writeClientTerminalError(w, err)
		} else {
			writeAttachmentFileError(w, err)
		}
		return
	}
	writeJSON(w, state)
}

func (s *pluginServer) handleAttachmentDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	scope, username, ok := s.resolveAttachmentRequestScope(w, r)
	if !ok {
		return
	}
	paths := normalizeAttachmentDownloadPaths(r.URL.Query()["path"])
	if len(paths) == 0 {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}
	if len(paths) > maxAttachmentDownloadCount {
		http.Error(w, "too many files", http.StatusBadRequest)
		return
	}
	backend := s.attachmentFileBackendForRequest(r, scope)
	entries, err := backend.StatAttachmentFiles(r.Context(), scope, username, paths)
	if err != nil {
		if isClientTarget(scope.Selector) {
			writeClientTerminalError(w, err)
		} else {
			writeAttachmentFileError(w, err)
		}
		return
	}
	if len(entries) != len(paths) {
		http.Error(w, "invalid file selection", http.StatusBadGateway)
		return
	}
	if len(entries) == 1 && entries[0].Type != "dir" {
		s.serveSingleAttachmentDownload(w, r, backend, scope, username, entries[0])
		return
	}
	s.serveAttachmentZipDownload(w, r, backend, scope, username, entries)
}

func (s *pluginServer) resolveAttachmentRequestScope(w http.ResponseWriter, r *http.Request) (agentScope, string, bool) {
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return agentScope{}, "", false
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return agentScope{}, "", false
	}
	if isClientTarget(selector) {
		if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
			writeClientTerminalError(w, err)
			return agentScope{}, "", false
		}
		return normalizeAgentScope(selector, accountID), "", true
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return agentScope{}, "", false
	}
	username, err := s.resolveAttachmentUsername(r.Context(), selector)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return agentScope{}, "", false
	}
	return normalizeAgentScope(selector, accountID), username, true
}

func (s *pluginServer) attachmentUploadBackendForRequest(r *http.Request, scope agentScope) attachmentUploadBackend {
	if isClientTarget(scope.Selector) {
		return clientAttachmentUploadBackend{server: s, header: r.Header}
	}
	return s.attachmentUploadBackend()
}

func (s *pluginServer) attachmentFileBackendForRequest(r *http.Request, scope agentScope) attachmentFileBackend {
	if isClientTarget(scope.Selector) {
		return clientAttachmentFileBackend{server: s, header: r.Header}
	}
	return s.attachmentFileBackend()
}

func (s *pluginServer) serveSingleAttachmentDownload(w http.ResponseWriter, r *http.Request, backend attachmentFileBackend, scope agentScope, username string, entry attachmentFileEntry) {
	reader, err := backend.OpenAttachmentFile(r.Context(), scope, username, entry.Path)
	if err != nil {
		writeAttachmentFileError(w, err)
		return
	}
	defer reader.Close()
	filename := sanitizeAttachmentFilename(entry.Name)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", attachmentDisposition(filename))
	if entry.Size >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(entry.Size, 10))
	}
	if _, err := io.Copy(w, reader); err != nil {
		return
	}
}

func (s *pluginServer) serveAttachmentZipDownload(w http.ResponseWriter, r *http.Request, backend attachmentFileBackend, scope agentScope, username string, entries []attachmentFileEntry) {
	sources, err := s.collectAttachmentArchiveSources(r.Context(), backend, scope, username, entries)
	if err != nil {
		writeAttachmentFileError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", attachmentDisposition(attachmentZipFilename(entries)))
	zipWriter := zip.NewWriter(w)
	for _, source := range sources {
		header := &zip.FileHeader{
			Name:   source.Name,
			Method: zip.Deflate,
		}
		if source.Modified > 0 {
			header.SetModTime(time.Unix(source.Modified, 0))
		}
		if source.Type == "dir" {
			header.Method = zip.Store
			if _, err := zipWriter.CreateHeader(header); err != nil {
				_ = zipWriter.Close()
				return
			}
			continue
		}
		reader, err := backend.OpenAttachmentFile(r.Context(), scope, username, source.Path)
		if err != nil {
			_ = zipWriter.Close()
			return
		}
		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			_ = reader.Close()
			_ = zipWriter.Close()
			return
		}
		_, copyErr := io.Copy(writer, reader)
		closeErr := reader.Close()
		if copyErr != nil || closeErr != nil {
			_ = zipWriter.Close()
			return
		}
	}
	_ = zipWriter.Close()
}

func (s *pluginServer) collectAttachmentArchiveSources(ctx context.Context, backend attachmentFileBackend, scope agentScope, username string, entries []attachmentFileEntry) ([]attachmentArchiveSource, error) {
	sources := make([]attachmentArchiveSource, 0, len(entries))
	names := make(map[string]int, len(entries))
	visitedDirs := make(map[string]struct{})
	for _, entry := range entries {
		if entry.Type == "dir" {
			rootName := uniqueAttachmentArchivePath(entry.Name+"/", names)
			rootPrefix := strings.TrimSuffix(rootName, "/")
			if err := appendAttachmentArchiveDirSource(ctx, backend, scope, username, entry, rootName, rootPrefix, names, visitedDirs, &sources); err != nil {
				return nil, err
			}
			continue
		}
		sources = append(sources, attachmentArchiveSource{
			Name:     uniqueAttachmentArchivePath(entry.Name, names),
			Path:     entry.Path,
			Type:     "file",
			Modified: entry.Modified,
		})
		if len(sources) > maxAttachmentArchiveCount {
			return nil, fmt.Errorf("%w: too many files", errAttachmentBadRequest)
		}
	}
	return sources, nil
}

func appendAttachmentArchiveDirSource(ctx context.Context, backend attachmentFileBackend, scope agentScope, username string, entry attachmentFileEntry, archiveName, archivePrefix string, names map[string]int, visitedDirs map[string]struct{}, sources *[]attachmentArchiveSource) error {
	resolvedKey := strings.TrimSpace(entry.Path)
	if resolvedKey != "" {
		if _, ok := visitedDirs[resolvedKey]; ok {
			return nil
		}
		visitedDirs[resolvedKey] = struct{}{}
	}
	if !strings.HasSuffix(archiveName, "/") {
		archiveName += "/"
	}
	response, err := backend.ListAttachmentFiles(ctx, scope, username, entry.Path)
	if err != nil {
		return err
	}
	resolvedPath := strings.TrimSpace(response.Path)
	if resolvedPath != "" && resolvedPath != resolvedKey {
		if _, ok := visitedDirs[resolvedPath]; ok {
			return nil
		}
		visitedDirs[resolvedPath] = struct{}{}
	}
	*sources = append(*sources, attachmentArchiveSource{
		Name:     archiveName,
		Type:     "dir",
		Modified: entry.Modified,
	})
	if len(*sources) > maxAttachmentArchiveCount {
		return fmt.Errorf("%w: too many files", errAttachmentBadRequest)
	}
	for _, child := range response.Entries {
		child.Name = strings.TrimSpace(child.Name)
		child.Path = strings.TrimSpace(child.Path)
		if child.Name == "" || child.Path == "" {
			continue
		}
		childArchiveName := uniqueAttachmentArchivePath(archivePrefix+"/"+child.Name, names)
		if child.Type == "dir" {
			if err := appendAttachmentArchiveDirSource(ctx, backend, scope, username, child, childArchiveName+"/", childArchiveName, names, visitedDirs, sources); err != nil {
				return err
			}
			continue
		}
		*sources = append(*sources, attachmentArchiveSource{
			Name:     childArchiveName,
			Path:     child.Path,
			Type:     "file",
			Modified: child.Modified,
		})
		if len(*sources) > maxAttachmentArchiveCount {
			return fmt.Errorf("%w: too many files", errAttachmentBadRequest)
		}
	}
	return nil
}

func (s *pluginServer) attachmentUploadBackend() attachmentUploadBackend {
	if s != nil && s.attachmentBackend != nil {
		return s.attachmentBackend
	}
	return lightOSAttachmentUploadBackend{}
}

func (s *pluginServer) attachmentFileBackend() attachmentFileBackend {
	if s != nil && s.attachmentFilesBackend != nil {
		return s.attachmentFilesBackend
	}
	return lightOSAttachmentFileBackend{}
}

func (s *pluginServer) resolveAttachmentUsername(ctx context.Context, selector string) (string, error) {
	items, err := s.listVisibleInstances(ctx)
	if err != nil {
		return "", err
	}
	for _, item := range items {
		if instanceSelector(item) == selector {
			return strings.TrimSpace(item.Username), nil
		}
	}
	return "", errors.New("instance not found")
}

func writeAttachmentUploadError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errAttachmentTooLarge):
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
	case errors.Is(err, context.Canceled):
		http.Error(w, "upload canceled", http.StatusRequestTimeout)
	default:
		http.Error(w, err.Error(), http.StatusBadGateway)
	}
}

func writeAttachmentFileError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errAttachmentBadRequest):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, context.Canceled):
		http.Error(w, "download canceled", http.StatusRequestTimeout)
	default:
		http.Error(w, err.Error(), http.StatusBadGateway)
	}
}

func writeJSONStatus(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		return
	}
}

type attachmentLimitReader struct {
	reader   io.Reader
	read     int64
	limit    int64
	tooLarge bool
}

func limitAttachmentReader(reader io.Reader) *attachmentLimitReader {
	return &attachmentLimitReader{reader: reader, limit: maxAttachmentUploadBytes}
}

func (r *attachmentLimitReader) Read(p []byte) (int, error) {
	limit := r.limit
	if limit <= 0 {
		limit = maxAttachmentUploadBytes
	}
	if r.read >= limit {
		var probe [1]byte
		n, err := r.reader.Read(probe[:])
		if n > 0 {
			r.tooLarge = true
			return 0, errAttachmentTooLarge
		}
		return 0, err
	}
	remaining := limit - r.read
	if int64(len(p)) > remaining {
		p = p[:remaining]
	}
	if len(p) == 0 {
		return 0, errAttachmentTooLarge
	}
	n, err := r.reader.Read(p)
	r.read += int64(n)
	return n, err
}

func (r *attachmentLimitReader) BytesRead() int64 {
	if r == nil {
		return 0
	}
	return r.read
}

func (r *attachmentLimitReader) TooLarge() bool {
	return r != nil && r.tooLarge
}

func (lightOSAttachmentUploadBackend) UploadAttachment(ctx context.Context, scope agentScope, username string, filename string, content io.Reader) (attachmentUploadResult, error) {
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return attachmentUploadResult{}, err
	}
	if strings.TrimSpace(scope.AccountID) == "" {
		return attachmentUploadResult{}, errors.New("account id is required")
	}
	limited, ok := content.(*attachmentLimitReader)
	if !ok {
		limited = limitAttachmentReader(content)
	}
	name := sanitizeAttachmentFilename(filename)
	finalPath, err := reserveAttachmentPath(ctx, scope.Selector, name)
	if err != nil {
		return attachmentUploadResult{}, err
	}
	tmpPath := finalPath + ".upload-" + randomAttachmentToken()
	script := buildAttachmentUploadScript(tmpPath, finalPath, username)
	command := exec.CommandContext(ctx, lightosctlPath, "exec", "-i", scope.Selector, "/bin/sh", "-lc", script)
	command.Stdin = limited
	output, err := command.CombinedOutput()
	if limited.TooLarge() {
		_ = cleanupAttachmentUploadPaths(ctx, scope.Selector, tmpPath, finalPath)
		return attachmentUploadResult{}, errAttachmentTooLarge
	}
	if err != nil {
		_ = cleanupAttachmentUploadPaths(ctx, scope.Selector, tmpPath, finalPath)
		text := strings.TrimSpace(string(output))
		if errors.Is(err, errAttachmentTooLarge) {
			return attachmentUploadResult{}, err
		}
		if text == "" {
			return attachmentUploadResult{}, err
		}
		return attachmentUploadResult{}, fmt.Errorf("%w: %s", err, text)
	}
	return attachmentUploadResult{
		Name: name,
		Path: finalPath,
		Size: limited.BytesRead(),
	}, nil
}

func (lightOSAttachmentFileBackend) ListAttachmentFiles(ctx context.Context, scope agentScope, username string, path string) (attachmentFileListResponse, error) {
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return attachmentFileListResponse{}, err
	}
	output, err := runAttachmentJSONCommand(ctx, scope.Selector, username, buildAttachmentListScript(path))
	if err != nil {
		return attachmentFileListResponse{}, err
	}
	var response attachmentFileListResponse
	if err := json.Unmarshal(output, &response); err != nil {
		return attachmentFileListResponse{}, err
	}
	return response, nil
}

func (lightOSAttachmentFileBackend) StatAttachmentFiles(ctx context.Context, scope agentScope, username string, paths []string) ([]attachmentFileEntry, error) {
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("%w: path is required", errAttachmentBadRequest)
	}
	output, err := runAttachmentJSONCommand(ctx, scope.Selector, username, buildAttachmentStatScript(paths))
	if err != nil {
		return nil, err
	}
	var entries []attachmentFileEntry
	if err := json.Unmarshal(output, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func (lightOSAttachmentFileBackend) OpenAttachmentFile(ctx context.Context, scope agentScope, username string, path string) (io.ReadCloser, error) {
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return nil, err
	}
	normalized := strings.TrimSpace(path)
	if normalized == "" || strings.Contains(normalized, "\x00") {
		return nil, fmt.Errorf("%w: invalid path", errAttachmentBadRequest)
	}
	reader, writer := io.Pipe()
	command := exec.CommandContext(ctx, lightosctlPath, "exec", "-i", scope.Selector, "/bin/sh", "-lc", buildAttachmentCatScript(normalized, username))
	command.Stdout = writer
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		_ = writer.Close()
		return nil, err
	}
	go func() {
		err := command.Wait()
		_ = writer.CloseWithError(commandOutputError(err, stderr.String()))
	}()
	return reader, nil
}

func runAttachmentJSONCommand(ctx context.Context, selector, username, script string) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", selector, "/bin/sh", "-lc", buildAttachmentUserScopedScript(username, script)).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return nil, err
		}
		return nil, fmt.Errorf("%w: %s", err, text)
	}
	return output, nil
}

func commandOutputError(err error, output string) error {
	if err == nil {
		return nil
	}
	text := strings.TrimSpace(output)
	if text == "" {
		return err
	}
	return fmt.Errorf("%w: %s", err, text)
}

func buildAttachmentUserScopedScript(username, script string) string {
	if !instanceCommandNeedsUserSwitch(username) {
		return script
	}
	return strings.Join([]string{
		buildUserShellBootstrapScript(username),
		"script=" + shellScriptQuote(script),
		"if command -v setpriv >/dev/null 2>&1; then",
		"  exec env HOME=\"$home\" USER=\"$user\" LOGNAME=\"$user\" XDG_CONFIG_HOME=\"$xdg_config_home\" setpriv --reuid \"$uid\" --regid \"$gid\" --init-groups /bin/sh -lc \"$script\"",
		"fi",
		"if command -v su >/dev/null 2>&1; then",
		"  export HOME=\"$home\" USER=\"$user\" LOGNAME=\"$user\" XDG_CONFIG_HOME=\"$xdg_config_home\"",
		"  exec su -s /bin/sh \"$user\" -c \"$script\"",
		"fi",
		"echo 'setpriv or su is required for webshell file browser.' >&2",
		"exit 127",
	}, "\n")
}

func buildAttachmentListScript(path string) string {
	target := strings.TrimSpace(path)
	if target == "" {
		target = "."
	}
	return strings.Join([]string{
		"set -eu",
		attachmentJSONShellFunction(),
		"target=" + shellScriptQuote(target),
		"if [ ! -d \"$target\" ]; then echo 'path is not a directory' >&2; exit 1; fi",
		"dir=$(cd \"$target\" 2>/dev/null && pwd -P) || exit 1",
		"parent=$(dirname \"$dir\")",
		"printf '{\"path\":'",
		"json_string \"$dir\"",
		"printf ',\"parent\":'",
		"json_string \"$parent\"",
		"printf ',\"entries\":['",
		"first=1",
		"for item in \"$dir\"/* \"$dir\"/.[!.]* \"$dir\"/..?*; do",
		"  [ -e \"$item\" ] || continue",
		"  name=${item##*/}",
		"  [ \"$name\" = . ] || [ \"$name\" = .. ] && continue",
		"  type=file",
		"  if [ -d \"$item\" ]; then type=dir; elif [ -L \"$item\" ]; then type=link; fi",
		"  size=$(stat -c '%s' \"$item\" 2>/dev/null || printf 0)",
		"  modified=$(stat -c '%Y' \"$item\" 2>/dev/null || printf 0)",
		"  if [ \"$first\" = 1 ]; then first=0; else printf ','; fi",
		"  printf '{\"name\":'",
		"  json_string \"$name\"",
		"  printf ',\"path\":'",
		"  json_string \"$item\"",
		"  printf ',\"type\":'",
		"  json_string \"$type\"",
		"  printf ',\"size\":%s,\"modified\":%s}' \"$size\" \"$modified\"",
		"done",
		"printf ']}'",
	}, "\n")
}

func buildAttachmentStatScript(paths []string) string {
	lines := []string{
		"set -eu",
		attachmentJSONShellFunction(),
		"printf '['",
		"first=1",
	}
	for _, path := range paths {
		lines = append(lines,
			"item="+shellScriptQuote(path),
			"if [ ! -f \"$item\" ] && [ ! -d \"$item\" ]; then echo 'selected path is not a file or directory' >&2; exit 1; fi",
			"name=${item##*/}",
			"type=file",
			"if [ -d \"$item\" ]; then type=dir; fi",
			"size=$(stat -c '%s' \"$item\" 2>/dev/null || printf 0)",
			"modified=$(stat -c '%Y' \"$item\" 2>/dev/null || printf 0)",
			"if [ \"$first\" = 1 ]; then first=0; else printf ','; fi",
			"printf '{\"name\":'",
			"json_string \"$name\"",
			"printf ',\"path\":'",
			"json_string \"$item\"",
			"printf ',\"type\":'",
			"json_string \"$type\"",
			"printf ',\"size\":%s,\"modified\":%s}' \"$size\" \"$modified\"",
		)
	}
	lines = append(lines, "printf ']'")
	return strings.Join(lines, "\n")
}

func buildAttachmentCatScript(path, username string) string {
	script := strings.Join([]string{
		"set -eu",
		"file=" + shellScriptQuote(path),
		"if [ ! -f \"$file\" ]; then echo 'selected path is not a file' >&2; exit 1; fi",
		"exec cat -- \"$file\"",
	}, "\n")
	return buildAttachmentUserScopedScript(username, script)
}

func attachmentJSONShellFunction() string {
	return `json_string() {
  LC_ALL=C awk 'BEGIN {
    s = ARGV[1]
    ARGV[1] = ""
    printf "\""
    for (i = 1; i <= length(s); i++) {
      c = substr(s, i, 1)
      if (c == "\\") printf "\\\\"
      else if (c == "\"") printf "\\\""
      else if (c == "\b") printf "\\b"
      else if (c == "\f") printf "\\f"
      else if (c == "\n") printf "\\n"
      else if (c == "\r") printf "\\r"
      else if (c == "\t") printf "\\t"
      else printf "%s", c
    }
    printf "\""
  }' "$1"
}`
}

func normalizeAttachmentDownloadPaths(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	paths := make([]string, 0, len(values))
	for _, value := range values {
		path := strings.TrimSpace(value)
		if path == "" || strings.Contains(path, "\x00") {
			continue
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		paths = append(paths, path)
	}
	return paths
}

func attachmentDisposition(filename string) string {
	name := sanitizeAttachmentFilename(filename)
	return mime.FormatMediaType("attachment", map[string]string{"filename": name})
}

func attachmentZipFilename(entries []attachmentFileEntry) string {
	if len(entries) == 1 && entries[0].Type == "dir" {
		name := sanitizeAttachmentFilename(entries[0].Name)
		if !strings.HasSuffix(strings.ToLower(name), ".zip") {
			name += ".zip"
		}
		return name
	}
	return "webshell-files.zip"
}

func uniqueAttachmentArchivePath(name string, seen map[string]int) string {
	cleaned := sanitizeAttachmentArchivePath(name)
	key := strings.TrimSuffix(cleaned, "/")
	if key == "" {
		key = cleaned
	}
	count := seen[key]
	seen[key] = count + 1
	if count == 0 {
		return cleaned
	}
	isDir := strings.HasSuffix(cleaned, "/")
	base := strings.TrimSuffix(cleaned, "/")
	dir, file := filepath.Split(base)
	ext := filepath.Ext(file)
	stem := strings.TrimSuffix(file, ext)
	next := dir + fmt.Sprintf("%s-%d%s", stem, count+1, ext)
	if isDir {
		next += "/"
	}
	return next
}

func sanitizeAttachmentArchivePath(name string) string {
	parts := strings.FieldsFunc(strings.TrimSpace(name), func(r rune) bool {
		return r == '/' || r == '\\'
	})
	cleaned := make([]string, 0, len(parts))
	for _, part := range parts {
		cleanedPart := sanitizeAttachmentFilename(part)
		if cleanedPart == "clipboard.txt" && strings.Trim(part, ". ") == "" {
			continue
		}
		cleaned = append(cleaned, cleanedPart)
	}
	if len(cleaned) == 0 {
		cleaned = append(cleaned, "download")
	}
	result := strings.Join(cleaned, "/")
	if strings.HasSuffix(strings.TrimSpace(name), "/") || strings.HasSuffix(strings.TrimSpace(name), "\\") {
		result += "/"
	}
	return result
}

func cleanupAttachmentUploadPaths(ctx context.Context, selector, tmpPath, finalPath string) error {
	reqCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	script := strings.Join([]string{
		"rm -f " + shellScriptQuote(tmpPath) + " " + shellScriptQuote(finalPath),
	}, "\n")
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", selector, "/bin/sh", "-lc", script).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return err
		}
		return fmt.Errorf("%w: %s", err, text)
	}
	return nil
}

func reserveAttachmentPath(ctx context.Context, selector, filename string) (string, error) {
	script := buildAttachmentPathReservationScript(filename)
	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", selector, "/bin/sh", "-lc", script).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return "", err
		}
		return "", fmt.Errorf("%w: %s", err, text)
	}
	path := strings.TrimSpace(string(output))
	if !strings.HasPrefix(path, "/tmp/") || strings.Contains(path, "\x00") {
		return "", errors.New("invalid attachment path")
	}
	return path, nil
}

func buildAttachmentPathReservationScript(filename string) string {
	base := sanitizeAttachmentFilename(filename)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	if stem == "" {
		stem = "attachment"
	}
	return strings.Join([]string{
		"set -eu",
		"dir=/tmp",
		"base=" + shellScriptQuote(base),
		"stem=" + shellScriptQuote(stem),
		"ext=" + shellScriptQuote(ext),
		"reserve() {",
		"  candidate=\"$1\"",
		"  if (set -C; : > \"$candidate\") 2>/dev/null; then",
		"    chmod 600 \"$candidate\" 2>/dev/null || true",
		"    printf '%s\\n' \"$candidate\"",
		"    exit 0",
		"  fi",
		"}",
		"candidate=\"$dir/$base\"",
		"reserve \"$candidate\"",
		"suffix=$(date +%Y%m%d-%H%M%S 2>/dev/null || printf '%s' upload)",
		"i=1",
		"while [ \"$i\" -le 999 ]; do",
		"  candidate=\"$dir/$stem-$suffix-$i$ext\"",
		"  reserve \"$candidate\"",
		"  i=$((i + 1))",
		"done",
		"echo 'unable to reserve attachment path' >&2",
		"exit 1",
	}, "\n")
}

func buildAttachmentUploadScript(tmpPath, finalPath, username string) string {
	lines := []string{
		"set -eu",
		"tmp=" + shellScriptQuote(tmpPath),
		"final=" + shellScriptQuote(finalPath),
		"complete=0",
		"rm -f \"$tmp\"",
		"cleanup() { rm -f \"$tmp\"; if [ \"$complete\" != 1 ]; then rm -f \"$final\"; fi; }",
		"trap cleanup INT TERM HUP EXIT",
		"cat > \"$tmp\"",
		"chmod 600 \"$tmp\" 2>/dev/null || true",
	}
	if instanceCommandNeedsUserSwitch(username) {
		lines = append(lines, buildAttachmentChownScript(username))
	}
	lines = append(lines,
		"mv -f \"$tmp\" \"$final\"",
		"complete=1",
		"trap - INT TERM HUP EXIT",
	)
	return strings.Join(lines, "\n")
}

func buildAttachmentChownScript(username string) string {
	return strings.Join([]string{
		"user=" + shellScriptQuote(username),
		"uid=$(id -u \"$user\" 2>/dev/null || true)",
		"gid=$(id -g \"$user\" 2>/dev/null || true)",
		"if [ -n \"$uid\" ] && [ -n \"$gid\" ]; then chown \"$uid:$gid\" \"$tmp\" 2>/dev/null || true; fi",
	}, "\n")
}

func sanitizeAttachmentFilename(filename string) string {
	name := filepath.Base(strings.ReplaceAll(strings.TrimSpace(filename), "\\", "/"))
	name = strings.Trim(name, ". ")
	if name == "" || name == "." || name == string(filepath.Separator) {
		return "clipboard.txt"
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case r == 0 || r < 0x20 || r == 0x7f:
			b.WriteByte('-')
		case strings.ContainsRune(`/\:*?"<>|`, r):
			b.WriteByte('-')
		default:
			b.WriteRune(r)
		}
	}
	cleaned := strings.Trim(b.String(), ". ")
	if cleaned == "" || strings.Trim(cleaned, "-_") == "" {
		return "clipboard.txt"
	}
	if len(cleaned) > 180 {
		ext := filepath.Ext(cleaned)
		stem := strings.TrimSuffix(cleaned, ext)
		maxStem := 180 - len(ext)
		if maxStem < 1 {
			return cleaned[:180]
		}
		if len(stem) > maxStem {
			stem = stem[:maxStem]
		}
		cleaned = stem + ext
	}
	return cleaned
}

func randomAttachmentToken() string {
	var data [6]byte
	if _, err := rand.Read(data[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(data[:])
}
