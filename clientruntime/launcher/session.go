package launcher

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"runtime"
	"time"
)

type sessionTransport struct {
	base     http.RoundTripper
	instance string
}

func (t sessionTransport) CloseIdleConnections() {
	if transport, ok := t.base.(interface{ CloseIdleConnections() }); ok {
		transport.CloseIdleConnections()
	}
}
func (t sessionTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("X-Lightos-Runtime-Instance", t.instance)
	return t.base.RoundTrip(r)
}
func sessionClient(config Config) (*http.Client, error) {
	u, e := url.Parse(config.AdminURL)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("verified HTTPS LightOS origin required")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.ResponseHeaderTimeout = 20 * time.Second
	transport.TLSHandshakeTimeout = 10 * time.Second
	if config.ProxyURL != "" {
		proxy, e := url.Parse(config.ProxyURL)
		if e != nil || proxy.Host == "" {
			return nil, errors.New("invalid host proxy")
		}
		transport.Proxy = http.ProxyURL(proxy)
	}
	return &http.Client{Transport: sessionTransport{transport, config.InstanceID}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, nil
}
func sessionPost(ctx context.Context, client *http.Client, config Config, endpoint string, body any, result any) error {
	data, e := json.Marshal(body)
	if e != nil {
		return e
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(ctx, http.MethodPost, config.AdminURL+"/api/client-runtime/session/"+endpoint, bytes.NewReader(data))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Lightos-Runtime-Token", config.AccessToken)
	response, e := client.Do(req)
	if e != nil {
		return e
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return &lightosHTTPError{response.StatusCode}
	}
	if result == nil {
		_, e = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
		return e
	}
	return json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(result)
}
func heartbeat(ctx context.Context, client *http.Client, config Config, child *worker) (*Artifact, error) {
	_, connected, registration := child.state()
	body := map[string]any{"id": config.InstanceID, "runtime_arch": runtime.GOARCH, "terminal_connected": connected && child.alive()}
	for key, value := range registration {
		body[key] = value
	}
	var reply struct {
		Runtime *Artifact `json:"client_runtime"`
	}
	e := sessionPost(ctx, client, config, "heartbeat", body, &reply)
	return reply.Runtime, e
}
