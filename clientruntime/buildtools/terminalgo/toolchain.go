// Package terminalgo prepares a pinned build-only toolchain. It has no runtime
// dependencies and must not be imported by client or mobile entry points.
package terminalgo

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

//go:embed manifest.json
var manifestJSON []byte

type archive struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

// Environment isolates this command's toolchain selection from user go env,
// inherited GOROOT and workspaces, without changing any global settings.
func Environment(goos, goarch, cgo string) []string {
	env := make([]string, 0, len(os.Environ())+5)
	for _, value := range os.Environ() {
		key, _, _ := strings.Cut(value, "=")
		switch strings.ToUpper(key) {
		case "GOROOT", "GOTOOLCHAIN", "GOWORK", "GOOS", "GOARCH", "CGO_ENABLED":
		default:
			env = append(env, value)
		}
	}
	return append(env, "GOROOT=", "GOTOOLCHAIN=local", "GOWORK=off", "GOOS="+goos, "GOARCH="+goarch, "CGO_ENABLED="+cgo)
}

// Ensure returns an absolute, verified Go executable for the host, not the
// compilation target. Completed caches are usable without network access.
func Ensure(ctx context.Context) (string, error) {
	var manifest struct {
		Version  string             `json:"version"`
		Archives map[string]archive `json:"archives"`
	}
	if err := json.Unmarshal(manifestJSON, &manifest); err != nil {
		return "", err
	}
	host := runtime.GOOS + "-" + runtime.GOARCH
	asset, ok := manifest.Archives[host]
	if !ok {
		return "", fmt.Errorf("no pinned terminal Go toolchain for host %s", host)
	}
	cache := os.Getenv("TERMINAL_GO_CACHE")
	if cache == "" {
		base, err := os.UserCacheDir()
		if err != nil {
			return "", err
		}
		cache = filepath.Join(base, "lazycat", "terminal-go")
	}
	cache, err := filepath.Abs(cache)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(cache, 0700); err != nil {
		return "", err
	}
	name := manifest.Version + "." + host
	installed := filepath.Join(cache, name+"-"+asset.SHA256[:16])
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	lock := installed + ".lock"
	for {
		if _, err := os.Stat(installed); err == nil {
			return checkedGo(ctx, installed, manifest.Version, host, asset)
		} else if !os.IsNotExist(err) {
			return "", err
		}
		if err := os.Mkdir(lock, 0700); err == nil {
			break
		} else if !os.IsExist(err) {
			return "", err
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("waiting for terminal Go cache lock %s: %w; check the owning build before removing a stale lock", lock, ctx.Err())
		case <-time.After(time.Second):
		}
	}
	defer os.Remove(lock)
	// Another process may have published between our initial check and lock.
	if _, err := os.Stat(installed); err == nil {
		return checkedGo(ctx, installed, manifest.Version, host, asset)
	}
	stage, err := os.MkdirTemp(cache, ".prepare-"+name+"-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(stage)
	extension := ".tar.gz"
	if runtime.GOOS == "windows" {
		extension = ".zip"
	}
	archivePath := filepath.Join(stage, "archive"+extension)
	if err = download(ctx, archivePath, name+extension, asset); err != nil {
		return "", err
	}
	if err = extract(ctx, archivePath, stage); err != nil {
		return "", err
	}
	if _, err = checkedGo(ctx, stage, manifest.Version, host, asset); err != nil {
		return "", err
	}
	if err = os.Rename(stage, installed); err != nil {
		return "", err
	}
	fmt.Fprintf(os.Stderr, "Terminal Go ready: %s (%s)\n", manifest.Version, host)
	return goPath(installed), nil
}

func goPath(dir string) string {
	name := "go"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(dir, "go", "bin", name)
}

func checkedGo(ctx context.Context, dir, version, host string, asset archive) (string, error) {
	extension := ".tar.gz"
	if runtime.GOOS == "windows" {
		extension = ".zip"
	}
	if err := verifyArchive(filepath.Join(dir, "archive"+extension), asset); err != nil {
		return "", fmt.Errorf("invalid terminal Go cache %s: %w", dir, err)
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, goPath(dir), "version")
	command.Env = Environment(runtime.GOOS, runtime.GOARCH, "0")
	output, err := command.CombinedOutput()
	expected := "go version " + version + " " + strings.ReplaceAll(host, "-", "/")
	if err != nil || strings.TrimSpace(string(output)) != expected {
		return "", fmt.Errorf("invalid terminal Go executable in %s: expected %q, got %q (%v)", dir, expected, strings.TrimSpace(string(output)), err)
	}
	return goPath(dir), nil
}

func verifyArchive(path string, asset archive) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, io.LimitReader(file, asset.Size+1))
	if err != nil {
		return err
	}
	if size != asset.Size || fmt.Sprintf("%x", hash.Sum(nil)) != asset.SHA256 {
		return fmt.Errorf("archive size or SHA-256 mismatch")
	}
	return nil
}
