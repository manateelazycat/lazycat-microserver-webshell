package provider

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"path"
	"strconv"
	"strings"
)

// Static gzip representations are generated alongside the Vite output. Serve
// the original resource when a sidecar is absent (including source-tree runs).
func servePrecompressedAsset(w http.ResponseWriter, r *http.Request, root http.FileSystem) bool {
	switch path.Ext(r.URL.Path) {
	case ".js", ".css", ".wasm", ".json", ".svg", ".webmanifest":
	default:
		return false
	}
	w.Header().Add("Vary", "Accept-Encoding")
	useGzip, acceptable := negotiateStaticEncoding(r, true)
	if !useGzip {
		if !acceptable {
			http.Error(w, "no acceptable content encoding", http.StatusNotAcceptable)
		}
		return !acceptable
	}

	original, err := root.Open(r.URL.Path)
	if err != nil {
		return false // Preserve the file server's not-found/error handling.
	}
	defer original.Close()
	info, err := original.Stat()
	if err != nil || info.IsDir() {
		return false
	}
	compressed, err := root.Open(r.URL.Path + ".gz")
	if err == nil {
		defer compressed.Close()
		compressedInfo, statErr := compressed.Stat()
		if statErr == nil && !compressedInfo.IsDir() {
			w.Header().Set("Content-Encoding", "gzip")
			// Always send a complete gzip stream, not a partial stream or a
			// multipart envelope incorrectly labelled as gzip content.
			if r.Header.Get("Range") != "" {
				r = r.Clone(r.Context())
				r.Header.Del("Range")
			}
			http.ServeContent(staticAssetResponseWriter{w, compressedInfo.Size()}, r,
				path.Base(r.URL.Path), info.ModTime(), compressed)
			return true
		}
	}
	if _, acceptable := negotiateStaticEncoding(r, false); !acceptable {
		http.Error(w, "no acceptable content encoding", http.StatusNotAcceptable)
		return true
	}
	return false
}

type staticAssetResponseWriter struct {
	http.ResponseWriter
	gzipSize int64
}

func (w staticAssetResponseWriter) WriteHeader(status int) {
	if status == http.StatusOK && w.gzipSize >= 0 {
		// ServeContent omits the size for Content-Encoding responses; the
		// precompressed file already has a known, final size.
		w.Header().Set("Content-Length", strconv.FormatInt(w.gzipSize, 10))
		w.Header().Set("Accept-Ranges", "none")
	} else if status >= http.StatusBadRequest {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Del("Content-Encoding")
	}
	w.ResponseWriter.WriteHeader(status)
}

func writeCompressedPage(w http.ResponseWriter, r *http.Request, data []byte) {
	w.Header().Add("Vary", "Accept-Encoding")
	useGzip, acceptable := negotiateStaticEncoding(r, true)
	if !acceptable {
		http.Error(w, "no acceptable content encoding", http.StatusNotAcceptable)
		return
	}
	if useGzip {
		var compressed bytes.Buffer
		writer, _ := gzip.NewWriterLevel(&compressed, gzip.BestSpeed)
		if _, err := writer.Write(data); err != nil {
			http.Error(w, "compress page failed", http.StatusInternalServerError)
			return
		}
		if err := writer.Close(); err != nil {
			http.Error(w, "compress page failed", http.StatusInternalServerError)
			return
		}
		data = compressed.Bytes()
		w.Header().Set("Content-Encoding", "gzip")
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	if r.Method != http.MethodHead {
		_, _ = w.Write(data)
	}
}

// Keep negotiation local to the independent provider. Explicit identity/gzip
// preferences, q=0 and wildcard refusals apply to both HTML and static assets.
func negotiateStaticEncoding(r *http.Request, gzipAvailable bool) (useGzip, acceptable bool) {
	qualities := make(map[string]float64)
	for _, item := range strings.Split(strings.Join(r.Header.Values("Accept-Encoding"), ","), ",") {
		parts := strings.Split(item, ";")
		quality := 1.0
		for _, parameter := range parts[1:] {
			key, value, ok := strings.Cut(strings.TrimSpace(parameter), "=")
			if ok && strings.EqualFold(strings.TrimSpace(key), "q") {
				parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
				if err != nil || !(parsed >= 0 && parsed <= 1) {
					quality = 0
				} else {
					quality = parsed
				}
			}
		}
		qualities[strings.ToLower(strings.TrimSpace(parts[0]))] = quality
	}
	gzipQuality, explicitGzip := qualities["gzip"]
	if !explicitGzip {
		gzipQuality = qualities["*"]
	}
	identityQuality, explicitIdentity := qualities["identity"]
	if !explicitIdentity {
		identityQuality = 1
		if wildcard, present := qualities["*"]; present && wildcard == 0 {
			identityQuality = 0
		}
	}
	if gzipAvailable && gzipQuality > 0 && (!explicitIdentity || gzipQuality >= identityQuality) {
		return true, true
	}
	return false, identityQuality > 0
}
