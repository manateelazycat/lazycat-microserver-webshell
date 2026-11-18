package launcher

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

type Artifact struct {
	Version          string `json:"version,omitempty"`
	ReleaseID        string `json:"release_id"`
	OS               string `json:"os"`
	Arch             string `json:"arch"`
	Binary           string `json:"binary"`
	LauncherProtocol int    `json:"launcher_protocol"`
	HostProtocol     int    `json:"host_protocol,omitempty"`
	ChannelProtocol  int    `json:"channel_protocol"`
	TerminalProtocol string `json:"terminal_protocol"`
	ArtifactID       string `json:"artifact_id"`
	DownloadPath     string `json:"download_path"`
	Compression      string `json:"compression"`
	CompressedSize   int64  `json:"compressed_size"`
	CompressedSHA256 string `json:"compressed_sha256"`
	BinarySize       int64  `json:"binary_size"`
	BinarySHA256     string `json:"binary_sha256"`
	updateError      string
	target           *Artifact
}

var lightosDigest = regexp.MustCompile(`^[a-f0-9]{64}$`)
var lightosLPKVersion = regexp.MustCompile(`^[0-9A-Za-z._+-]{1,128}$`)

func (m Artifact) version() string {
	if m.Version != "" {
		return m.Version
	}
	return m.BinarySHA256
}

func (m Artifact) valid() bool {
	name := "terminal-core"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return (m.Version == "" || lightosLPKVersion.MatchString(m.Version)) && m.OS == runtime.GOOS && m.Arch == runtime.GOARCH && m.Binary == name && m.LauncherProtocol == 5 && m.ChannelProtocol == 0 && m.Compression == "gzip" && lightosDigest.MatchString(m.ReleaseID) && lightosDigest.MatchString(m.BinarySHA256) && m.ArtifactID == m.BinarySHA256 && lightosDigest.MatchString(m.CompressedSHA256) && m.DownloadPath == "/api/client-runtime/artifacts/"+m.ArtifactID && m.BinarySize > 0 && m.BinarySize <= 256<<20 && m.CompressedSize > 0 && m.CompressedSize <= 100_000_000 && m.TerminalProtocol != ""
}
func lightosGet(ctx context.Context, client *http.Client, base, endpoint, token string) (*http.Response, error) {
	u, err := url.Parse(base)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return nil, errors.New("LightOS runtime requires HTTPS")
	}
	endpoint = strings.Replace(endpoint, "/api/client-runtime/", "/api/client-runtime/session/", 1)
	u.Path = endpoint
	u.RawQuery = ""
	if parsed, e := url.Parse(endpoint); e == nil {
		u.Path = parsed.Path
		u.RawQuery = parsed.RawQuery
	}
	r, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	r.Header.Set("X-Lightos-Runtime-Token", token)
	r.Header.Set("Cache-Control", "no-cache")
	response, err := client.Do(r)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, &lightosHTTPError{response.StatusCode}
	}
	return response, nil
}

type lightosHTTPError struct{ status int }

func (e *lightosHTTPError) Error() string { return fmt.Sprintf("LightOS returned HTTP %d", e.status) }

func retryableLightosArtifactError(err error) bool {
	var he *lightosHTTPError
	if errors.As(err, &he) {
		return he.status >= 500
	}
	var certificate *tls.CertificateVerificationError
	if errors.As(err, &certificate) {
		return false
	}
	var network net.Error
	return errors.As(err, &network) || errors.Is(err, io.ErrUnexpectedEOF)
}

func verifyLightosFile(file, hash string, size int64) bool {
	f, e := os.Open(file)
	if e != nil {
		return false
	}
	defer f.Close()
	h := sha256.New()
	n, e := io.Copy(h, io.LimitReader(f, size+1))
	return e == nil && n == size && hex.EncodeToString(h.Sum(nil)) == hash
}

func ensureLightosArtifact(ctx context.Context, client *http.Client, base, token, cache string, hint *Artifact) (string, Artifact, error) {
	var manifest Artifact
	if err := os.MkdirAll(cache, 0700); err != nil {
		return "", manifest, err
	}
	scope := sha256.Sum256([]byte(base))
	pointer := filepath.Join(cache, hex.EncodeToString(scope[:])+".json")
	var previous Artifact
	if b, e := os.ReadFile(pointer); e == nil {
		_ = json.Unmarshal(b, &previous)
	}
	fallback := func(err error) (string, Artifact, error) {
		if ctx.Err() == nil && retryableLightosArtifactError(err) && hint != nil && hint.valid() && previous.valid() && previous.TerminalProtocol == hint.TerminalProtocol {
			folder := filepath.Join(cache, previous.BinarySHA256)
			if verifyLightosFile(filepath.Join(folder, previous.Binary), previous.BinarySHA256, previous.BinarySize) {
				previous.updateError = "Runtime update unavailable; using a compatible cached artifact"
				previous.target = hint
				return folder, previous, nil
			}
		}
		return "", manifest, err
	}
	if hint != nil && hint.valid() {
		manifest = *hint
	} else {
		response, err := lightosGet(ctx, client, base, "/api/client-runtime/manifest?os="+runtime.GOOS+"&arch="+runtime.GOARCH, token)
		if err != nil {
			return fallback(err)
		}
		err = json.NewDecoder(io.LimitReader(response.Body, 32769)).Decode(&manifest)
		response.Body.Close()
		if err != nil || !manifest.valid() {
			return "", manifest, errors.New("invalid or unsupported runtime manifest")
		}
	}
	folder := filepath.Join(cache, manifest.BinarySHA256)
	if verifyLightosFile(filepath.Join(folder, manifest.Binary), manifest.BinarySHA256, manifest.BinarySize) {
		if err := writeLightosJSON(filepath.Join(folder, "manifest.json"), manifest); err != nil {
			return "", manifest, err
		}
		return folder, manifest, writeArtifactPointer(pointer, manifest)
	}
	stage, err := os.MkdirTemp(cache, ".download-")
	if err != nil {
		return "", manifest, err
	}
	defer os.RemoveAll(stage)
	response, err := lightosGet(ctx, client, base, manifest.DownloadPath, token)
	if err != nil {
		return fallback(err)
	}
	compressed := &io.LimitedReader{R: response.Body, N: manifest.CompressedSize + 1}
	archiveHash := sha256.New()
	z, err := gzip.NewReader(io.TeeReader(compressed, archiveHash))
	if err != nil {
		response.Body.Close()
		return "", manifest, err
	}
	err = copyLightosArtifact(filepath.Join(stage, manifest.Binary), z, manifest.BinarySHA256, manifest.BinarySize, 0700)
	z.Close()
	response.Body.Close()
	if err != nil {
		return "", manifest, err
	}
	if compressed.N != 1 || hex.EncodeToString(archiveHash.Sum(nil)) != manifest.CompressedSHA256 {
		return "", manifest, errors.New("runtime compressed checksum mismatch")
	}
	if err = writeLightosJSON(filepath.Join(stage, "manifest.json"), manifest); err != nil {
		return "", manifest, err
	}
	if ctx.Err() != nil {
		return "", manifest, ctx.Err()
	}
	if _, e := os.Stat(folder); e == nil {
		if err = os.Rename(folder, folder+".invalid-"+randomID()); err != nil {
			return "", manifest, err
		}
	}
	if err = os.Rename(stage, folder); err != nil {
		return "", manifest, err
	}
	return folder, manifest, writeArtifactPointer(pointer, manifest)
}

func copyLightosArtifact(file string, reader io.Reader, hash string, size int64, mode os.FileMode) error {
	f, e := os.OpenFile(file, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if e != nil {
		return e
	}
	h := sha256.New()
	n, e := io.Copy(io.MultiWriter(f, h), io.LimitReader(reader, size+1))
	closeErr := f.Close()
	if e != nil {
		return e
	}
	if closeErr != nil {
		return closeErr
	}
	if n != size || hex.EncodeToString(h.Sum(nil)) != hash {
		return errors.New("runtime artifact checksum mismatch")
	}
	return nil
}

func writeLightosJSON(file string, value any) error {
	b, e := json.Marshal(value)
	if e != nil {
		return e
	}
	f, e := os.CreateTemp(filepath.Dir(file), ".state-")
	if e != nil {
		return e
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, e = f.Write(append(b, '\n')); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(tmp, file)
}

// Seed the compatible-cache pointer with the host-verified launcher artifact.
func rememberArtifact(base, folder string, artifact Artifact) error {
	scope := sha256.Sum256([]byte(base))
	if err := writeLightosJSON(filepath.Join(folder, "manifest.json"), artifact); err != nil {
		return err
	}
	return writeArtifactPointer(filepath.Join(filepath.Dir(folder), hex.EncodeToString(scope[:])+".json"), artifact)
}

func writeArtifactPointer(pointer string, artifact Artifact) error {
	if err := writeLightosJSON(pointer, artifact); err != nil {
		return err
	}
	if artifact.HostProtocol == 1 {
		file := filepath.Join(filepath.Dir(pointer), "host1-"+artifact.OS+"-"+artifact.Arch+"-"+filepath.Base(pointer))
		return writeLightosJSON(file, artifact.BinarySHA256)
	}
	return nil
}
