package terminalgo

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func download(ctx context.Context, destination, filename string, asset archive) error {
	// Reuse the existing lzc-core mirror when the pinned release is available.
	// The committed digest, not the mirror response, is the trust anchor.
	bases := []string{"http://dl.corp.linakesi.cn/go.dev", "https://dl.google.com/go"}
	if custom := strings.TrimSpace(os.Getenv("TERMINAL_GO_DOWNLOAD_BASE")); custom != "" {
		// An explicit mirror is exclusive, including for offline CI networks.
		bases = []string{strings.TrimRight(custom, "/")}
	}
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 2 * time.Minute}
	var last error
	for _, base := range bases {
		source, err := url.Parse(base + "/" + filename)
		if err != nil || (source.Scheme != "http" && source.Scheme != "https") || source.Host == "" || source.User != nil || source.RawQuery != "" || source.Fragment != "" {
			return fmt.Errorf("TERMINAL_GO_DOWNLOAD_BASE must be an HTTP(S) directory URL without credentials, query or fragment")
		}
		fmt.Fprintf(os.Stderr, "Downloading terminal Go: %s (timeout 2m, SHA-256 pinned)\n", source)
		last = downloadOne(ctx, client, source.String(), destination, asset)
		if last == nil {
			return nil
		}
		fmt.Fprintf(os.Stderr, "Terminal Go download failed: %v\n", last)
		if ctx.Err() != nil {
			break
		}
	}
	return fmt.Errorf("cannot prepare terminal Go: %w; prewarm the cache or set TERMINAL_GO_DOWNLOAD_BASE to a reachable mirror", last)
}

func downloadOne(ctx context.Context, client *http.Client, source, destination string, asset archive) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned HTTP %d", response.StatusCode)
	}
	file, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, io.LimitReader(response.Body, asset.Size+1))
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	return verifyArchive(destination, asset)
}
