package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	maxAttachmentUploadCount = 32
	maxAttachmentUploadBytes = int64(2 << 30)
)

var errAttachmentTooLarge = errors.New("attachment file is too large")

type attachmentUploadBackend interface {
	UploadAttachment(ctx context.Context, scope agentScope, username string, filename string, content io.Reader) (attachmentUploadResult, error)
}

type lightOSAttachmentUploadBackend struct{}

type attachmentUploadResult struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

type attachmentUploadResponse struct {
	Files []attachmentUploadResult `json:"files"`
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
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return
	}
	username, err := s.resolveAttachmentUsername(r.Context(), selector)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "invalid upload", http.StatusBadRequest)
		return
	}

	scope := normalizeAgentScope(selector, accountID)
	backend := s.attachmentUploadBackend()
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
			writeAttachmentUploadError(w, err)
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

func (s *pluginServer) attachmentUploadBackend() attachmentUploadBackend {
	if s != nil && s.attachmentBackend != nil {
		return s.attachmentBackend
	}
	return lightOSAttachmentUploadBackend{}
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
