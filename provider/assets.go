package provider

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type serverRevisionInfo struct {
	ServerRevision string `json:"server_revision"`
	ReloadRequired bool   `json:"reload_required,omitempty"`
}

const assetBasePlaceholder = "__LCMD_ASSET_BASE__"

const contentRevisionFileName = ".lpk-content-revision"

const assetRevisionLength = 24

const legacyServiceWorkerRetirementPath = "runtime/static/app/bootstrap/legacy_service_worker_retirement.js"

func resolvePluginRoot() string {
	exe, err := os.Executable()
	if err == nil {
		root := filepath.Dir(exe)
		if _, statErr := os.Stat(filepath.Join(root, "runtime", "static", "index.html")); statErr == nil {
			return root
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}
	return "."
}

func computeContentRevision(rootDir string) string {
	hash := sha256.New()
	if exe, err := os.Executable(); err == nil {
		if data, readErr := os.ReadFile(exe); readErr == nil {
			_, _ = hash.Write([]byte("exe\x00"))
			_, _ = hash.Write(data)
			_, _ = hash.Write([]byte{0})
		}
	}

	staticRoot := filepath.Join(rootDir, "runtime")
	var paths []string
	_ = filepath.WalkDir(staticRoot, func(path string, entry fs.DirEntry, err error) error {
		if err == nil && entry != nil && !entry.IsDir() {
			paths = append(paths, path)
		}
		return nil
	})
	sort.Strings(paths)
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		rel, err := filepath.Rel(rootDir, path)
		if err != nil {
			rel = path
		}
		_, _ = hash.Write([]byte(filepath.ToSlash(rel)))
		_, _ = hash.Write([]byte{0})
		_, _ = hash.Write(data)
		_, _ = hash.Write([]byte{0})
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func computeServerRevision(rootDir string) string {
	contentRevision := computeContentRevision(rootDir)
	startEpoch := strconv.FormatInt(time.Now().UnixNano(), 36)
	return contentRevision + ":" + startEpoch + ":" + strconv.Itoa(os.Getpid())
}

func computeAssetVersion(rootDir string) string {
	revision := declaredContentRevision(rootDir)
	if revision == "" {
		revision = computeContentRevision(rootDir)
	}
	return composeAssetVersion(declaredAssetVersion(rootDir), revision)
}

func composeAssetVersion(version string, revision string) string {
	version = strings.TrimSpace(version)
	revision = strings.TrimSpace(revision)
	if len(revision) > assetRevisionLength {
		revision = revision[:assetRevisionLength]
	}
	if version == "" {
		return "content-" + revision
	}
	return version + "-" + revision
}

func declaredContentRevision(rootDir string) string {
	data, err := os.ReadFile(filepath.Join(rootDir, contentRevisionFileName))
	if err != nil {
		return ""
	}
	revision := strings.TrimSpace(string(data))
	if len(revision) != sha256.Size*2 {
		return ""
	}
	if _, err := hex.DecodeString(revision); err != nil {
		return ""
	}
	return strings.ToLower(revision)
}

func declaredAssetVersion(rootDir string) string {
	if data, err := os.ReadFile(filepath.Join(rootDir, ".lpk-version")); err == nil {
		if version := strings.TrimSpace(string(data)); isValidAssetVersion(version) {
			return version
		}
	}
	if data, err := os.ReadFile(filepath.Join(rootDir, "package.yml")); err == nil {
		if version := packageVersion(data); isValidAssetVersion(version) {
			return version
		}
	}
	return ""
}

func packageVersion(data []byte) string {
	for _, line := range strings.Split(string(data), "\n") {
		if strings.TrimLeft(line, " \t") != line || !strings.HasPrefix(line, "version:") {
			continue
		}
		return strings.TrimSpace(strings.TrimPrefix(line, "version:"))
	}
	return ""
}

func isValidAssetVersion(version string) bool {
	if version == "" || len(version) > 128 {
		return false
	}
	for _, char := range version {
		switch {
		case char >= 'a' && char <= 'z':
		case char >= 'A' && char <= 'Z':
		case char >= '0' && char <= '9':
		case strings.ContainsRune("._+-", char):
		default:
			return false
		}
	}
	return true
}

func (s *pluginServer) currentAssetVersion() string {
	declaredVersion := declaredAssetVersion(s.rootDir)
	if revision := declaredContentRevision(s.rootDir); revision != "" {
		return composeAssetVersion(declaredVersion, revision)
	}
	if declaredVersion == "" && isValidAssetVersion(s.assetVersion) {
		return s.assetVersion
	}
	if declaredVersion != "" && isValidAssetVersion(s.assetVersion) && strings.HasPrefix(s.assetVersion, declaredVersion+"-") {
		return s.assetVersion
	}
	return computeAssetVersion(s.rootDir)
}

func (s *pluginServer) currentServerRevision() string {
	baseRevision := strings.TrimSpace(s.serverRevision)
	if baseRevision == "" {
		baseRevision = "runtime"
	}
	return baseRevision + ":assets=" + s.currentAssetVersion()
}

func staticFileServer(root string) http.Handler {
	return staticFileServerWithCachePolicy(root, false)
}

func staticFileServerWithCachePolicy(root string, immutable bool) http.Handler {
	files := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w = staticAssetResponseWriter{ResponseWriter: w, gzipSize: -1}
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		ext := filepath.Ext(r.URL.Path)
		if immutable && ext != "" && ext != ".html" {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			switch ext {
			case ".html":
				w.Header().Set("Cache-Control", "no-store")
			case ".css", ".js", ".json", ".wasm", ".webmanifest":
				w.Header().Set("Cache-Control", "no-cache")
			}
		}
		switch ext {
		case ".wasm":
			w.Header().Set("Content-Type", "application/wasm")
		case ".js":
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		case ".webmanifest":
			w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
		}
		if servePrecompressedAsset(w, r, http.Dir(root)) {
			return
		}
		files.ServeHTTP(w, r)
	})
}

func versionedStaticFileServer(root string, currentAssetVersion func() string) http.Handler {
	files := staticFileServerWithCachePolicy(root, true)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assetVersion := ""
		if currentAssetVersion != nil {
			assetVersion = strings.TrimSpace(currentAssetVersion())
		}
		prefix := "/assets/" + assetVersion + "/"
		if !isValidAssetVersion(assetVersion) || !strings.HasPrefix(r.URL.Path, prefix) {
			http.NotFound(w, r)
			return
		}
		assetPath := strings.TrimPrefix(r.URL.Path, prefix)
		if assetPath == "" || strings.Contains(assetPath, "\\") || path.Clean("/"+assetPath) != "/"+assetPath {
			http.NotFound(w, r)
			return
		}
		http.StripPrefix(prefix, files).ServeHTTP(w, r)
	})
}

func (s *pluginServer) handleLegacyServiceWorkerRetirement(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	data, err := os.ReadFile(filepath.Join(s.rootDir, legacyServiceWorkerRetirementPath))
	if err != nil {
		http.Error(w, "service worker retirement script is unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Service-Worker-Allowed", "/")
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(data)
}

func (s *pluginServer) handleIndex(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/", "":
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		data, err := os.ReadFile(filepath.Join(s.rootDir, "runtime", "static", "index.html"))
		if err != nil {
			http.Error(w, "webshell index is unavailable", http.StatusInternalServerError)
			return
		}
		data = bytes.ReplaceAll(data, []byte(assetBasePlaceholder), []byte("."+versionedAssetBase(s.currentAssetVersion())))
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		writeCompressedPage(w, r, data)
	default:
		http.NotFound(w, r)
	}
}

func versionedAssetBase(assetVersion string) string {
	return "/assets/" + assetVersion + "/"
}

func (s *pluginServer) handleServerRevision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	serverRevision := s.currentServerRevision()
	info := serverRevisionInfo{ServerRevision: serverRevision}
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	accountID := currentRequestAccountID(r)
	clientID := strings.TrimSpace(r.URL.Query().Get("client_id"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.URL.Query().Get("client"))
	}
	if selector != "" && clientID != "" {
		if accountID == "" {
			http.Error(w, "account id is required", http.StatusUnauthorized)
			return
		}
		if isClientTarget(selector) {
			if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
				writeAuthorizationError(w, err)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			writeJSON(w, info)
			return
		}
		if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
			writeAuthorizationError(w, err)
			return
		}
		scope := NormalizeAgentScope(selector, accountID)
		if strings.TrimSpace(r.URL.Query().Get("terminal_input_blocked")) != "" {
			// Compatibility with older pages during rolling upgrades. Input locks
			// no longer have state or affect terminal writes.
			w.Header().Set("Cache-Control", "no-store")
			writeJSON(w, info)
			return
		}
		changed, err := observeServerRevisionState(r.Context(), scope, clientID, serverRevision)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		info.ReloadRequired = changed
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, info)
}

func observeServerRevisionState(ctx context.Context, scope AgentScope, clientID, revision string) (bool, error) {
	scope = NormalizeAgentScope(scope.Selector, scope.AccountID)
	if err := validateInstanceSelector(scope.Selector); err != nil {
		return false, err
	}
	if scope.AccountID == "" {
		return false, errors.New("account id is required")
	}
	sum := sha256.Sum256([]byte(scope.CacheKey() + "\x00" + strings.TrimSpace(clientID)))
	key := hex.EncodeToString(sum[:])
	script := strings.Join([]string{
		"set -eu",
		"dir=/tmp/lcmd-webshell-server-revision",
		"file=\"$dir\"/" + ShellScriptQuote(key),
		"current=" + ShellScriptQuote(revision),
		"mkdir -p \"$dir\"",
		"previous=\"$(cat \"$file\" 2>/dev/null || true)\"",
		"if [ \"$previous\" = \"$current\" ]; then printf '%s\\n' unchanged; exit 0; fi",
		"printf '%s\\n' \"$current\" > \"$file\"",
		"if [ -n \"$previous\" ]; then printf '%s\\n' changed; else printf '%s\\n' initialized; fi",
	}, "\n")
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	output, err := exec.CommandContext(reqCtx, lightosctlPath, "exec", scope.Selector, "/bin/sh", "-lc", script).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return false, err
		}
		return false, fmt.Errorf("%w: %s", err, text)
	}
	return strings.TrimSpace(string(output)) == "changed", nil
}
