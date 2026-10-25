package lightosterminal

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"time"
)

func register(ctx context.Context, config Config, address string, registration Registration) error {
	endpoint, err := url.Parse(config.GatewayAddress)
	if err != nil {
		return errors.New("invalid terminal service gateway")
	}
	host, _, err := net.SplitHostPort(endpoint.Host)
	if err != nil || endpoint.Scheme != "http" || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() || endpoint.User != nil || endpoint.Path != "" || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return errors.New("terminal service gateway must be loopback HTTP")
	}
	endpoint.Path = "/terminal-service"
	body, err := json.Marshal(map[string]string{
		"service_name": registration.ServiceName, "address": address,
		"credential": registration.Credential, "box_id": config.BoxID,
	})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("X-LZC-LOCAL-AUTH", config.GatewayCredential)
	req.Header.Set("Content-Type", "application/json")
	// Bypass desktop/system proxies and redirects for this private local API.
	transport := &http.Transport{}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("terminal service registration failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return errors.New("terminal service registration rejected")
	}
	return nil
}
