package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	lzcsdk "gitee.com/linakesi/lzc-sdk/lang/go"
	"github.com/gorilla/websocket"
)

type clientTerminalTicketRequest struct {
	ID string `json:"id"`
}

type clientTerminalTicket struct {
	ClientInstanceID    string `json:"client_instance_id"`
	DeviceAPIURL        string `json:"device_api_url"`
	TerminalServiceName string `json:"terminal_service_name"`
	Ticket              string `json:"ticket"`
	ExpiresAt           string `json:"expires_at"`
}

var newClientTerminalHTTPClient = func() *http.Client {
	return &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}, Timeout: 30 * time.Second}
}

var resolveClientDeviceAPIAuthToken = clientDeviceAPIAuthToken

type clientTerminalStatusError struct {
	label  string
	status int
	body   string
}

func (e clientTerminalStatusError) Error() string {
	label := strings.TrimSpace(e.label)
	if label == "" {
		label = "client terminal"
	}
	return fmt.Sprintf("%s returned %d: %s", label, e.status, e.body)
}

func (s *pluginServer) handleClientWorkspace(w http.ResponseWriter, r *http.Request, accountID, selector string, cols, rows int) {
	log.Printf("client terminal workspace request: method=%s selector=%s account_present=%t cols=%d rows=%d", r.Method, selector, accountID != "", cols, rows)
	if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
		log.Printf("client terminal workspace auth failed: method=%s selector=%s account_present=%t err=%v", r.Method, selector, accountID != "", err)
		writeClientTerminalError(w, err)
		return
	}
	switch r.Method {
	case http.MethodGet:
		state, err := s.clientWorkspaceState(r.Context(), r.Header, selector, cols, rows)
		if err != nil {
			log.Printf("client terminal workspace state failed: selector=%s err=%v", selector, err)
			writeClientTerminalError(w, err)
			return
		}
		state.ServerRevision = s.serverRevision
		log.Printf("client terminal workspace state ready: selector=%s tabs=%d active_tab=%s", selector, len(state.Tabs), state.ActiveTabID)
		writeJSON(w, state)
	case http.MethodPost:
		var request workspaceActionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			log.Printf("client terminal workspace action decode failed: selector=%s err=%v", selector, err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Printf("client terminal workspace action request: selector=%s action=%s tab=%s pane=%s cols=%d rows=%d", selector, request.Action, request.TabID, request.PaneID, cols, rows)
		state, err := s.clientWorkspaceAction(r.Context(), r.Header, selector, cols, rows, request)
		if err != nil {
			log.Printf("client terminal workspace action failed: selector=%s action=%s err=%v", selector, request.Action, err)
			writeClientTerminalError(w, err)
			return
		}
		state.ServerRevision = s.serverRevision
		log.Printf("client terminal workspace action ready: selector=%s action=%s tabs=%d active_tab=%s", selector, request.Action, len(state.Tabs), state.ActiveTabID)
		writeJSON(w, state)
	default:
		log.Printf("client terminal workspace method not allowed: method=%s selector=%s", r.Method, selector)
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *pluginServer) handleClientWorkspaceActivity(w http.ResponseWriter, r *http.Request, accountID, selector string, cols, rows int) {
	log.Printf("client terminal activity request: method=%s selector=%s account_present=%t cols=%d rows=%d", r.Method, selector, accountID != "", cols, rows)
	if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
		log.Printf("client terminal activity auth failed: selector=%s account_present=%t err=%v", selector, accountID != "", err)
		writeClientTerminalError(w, err)
		return
	}
	state, err := s.clientWorkspaceActivity(r.Context(), r.Header, selector, cols, rows)
	if err != nil {
		log.Printf("client terminal activity failed: selector=%s err=%v", selector, err)
		writeClientTerminalError(w, err)
		return
	}
	state.ServerRevision = s.serverRevision
	log.Printf("client terminal activity ready: selector=%s panes=%d", selector, len(state.Panes))
	writeJSON(w, state)
}

func (s *pluginServer) attachClientPane(w http.ResponseWriter, r *http.Request, accountID, selector, paneID string, cols, rows int) error {
	log.Printf("client terminal websocket attach request: selector=%s pane=%s account_present=%t cols=%d rows=%d", selector, paneID, accountID != "", cols, rows)
	if err := s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
		log.Printf("client terminal websocket auth failed: selector=%s pane=%s account_present=%t err=%v", selector, paneID, accountID != "", err)
		writeClientTerminalError(w, err)
		return nil
	}
	ticket, authToken, err := s.clientTerminalDialInfo(r.Context(), r.Header, selector)
	if err != nil {
		log.Printf("client terminal websocket dial info failed: selector=%s pane=%s err=%v", selector, paneID, err)
		writeClientTerminalError(w, err)
		return nil
	}
	log.Printf("client terminal websocket dial info ready: selector=%s pane=%s client_instance=%s service=%s device_api=%s auth_token_present=%t expires_at=%s", selector, paneID, ticket.ClientInstanceID, ticket.TerminalServiceName, safeURLOrigin(ticket.DeviceAPIURL), authToken != "", ticket.ExpiresAt)
	targetURL, err := clientTerminalURL(ticket, "/ws")
	if err != nil {
		log.Printf("client terminal websocket target url failed: selector=%s pane=%s err=%v", selector, paneID, err)
		writeClientTerminalError(w, err)
		return nil
	}
	query := targetURL.Query()
	query.Set("pane", paneID)
	if cols > 0 {
		query.Set("cols", fmt.Sprintf("%d", cols))
	}
	if rows > 0 {
		query.Set("rows", fmt.Sprintf("%d", rows))
	}
	if foreground, background, cursor := terminalThemeFromRequest(r); foreground != "" || background != "" || cursor != "" {
		if foreground != "" {
			query.Set("fg", foreground)
		}
		if background != "" {
			query.Set("bg", background)
		}
		if cursor != "" {
			query.Set("cursor", cursor)
		}
	}
	query.Set("ticket", ticket.Ticket)
	targetURL.RawQuery = query.Encode()

	source, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("client terminal websocket source upgrade failed: selector=%s pane=%s err=%v", selector, paneID, err)
		return err
	}
	defer source.Close()
	log.Printf("client terminal websocket source upgraded: selector=%s pane=%s target=%s", selector, paneID, sanitizeClientTerminalURL(targetURL.String()))

	headers := http.Header{}
	headers.Set("lzc_dapi_auth_token", authToken)
	dialer := websocket.Dialer{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}
	target, dialResponse, err := dialer.DialContext(r.Context(), websocketHTTPToWS(targetURL.String()), headers)
	if err != nil {
		failure := readWebSocketDialFailure(err, dialResponse)
		log.Printf("client terminal websocket target dial failed: selector=%s pane=%s target=%s status=%d location=%s content_type=%s body=%q err=%v", selector, paneID, sanitizeClientTerminalURL(targetURL.String()), failure.status, failure.location, failure.contentType, failure.body, err)
		_ = writeWebSocketJSON(source, map[string]any{
			"type":              "process-exit",
			"exit_code":         -1,
			"message":           failure.userMessage,
			"technical_message": failure.message,
			"error_code":        failure.code,
			"retryable":         true,
		})
		return nil
	}
	defer target.Close()
	log.Printf("client terminal websocket target connected: selector=%s pane=%s target=%s", selector, paneID, sanitizeClientTerminalURL(targetURL.String()))

	errCh := make(chan error, 2)
	go proxyWebSocketMessages("browser->client-terminal", source, target, errCh)
	go proxyWebSocketMessages("client-terminal->browser", target, source, errCh)
	err = <-errCh
	log.Printf("client terminal websocket proxy ended: selector=%s pane=%s err=%v", selector, paneID, err)
	return nil
}

func (s *pluginServer) clientWorkspaceState(ctx context.Context, header http.Header, selector string, cols, rows int) (workspaceState, error) {
	var state workspaceState
	err := s.clientTerminalJSON(ctx, header, selector, http.MethodGet, "/workspace", map[string]string{"cols": fmt.Sprintf("%d", cols), "rows": fmt.Sprintf("%d", rows)}, nil, &state)
	return state, err
}

func (s *pluginServer) clientWorkspaceActivity(ctx context.Context, header http.Header, selector string, cols, rows int) (workspaceActivityState, error) {
	var state workspaceActivityState
	err := s.clientTerminalJSON(ctx, header, selector, http.MethodGet, "/activity", map[string]string{"cols": fmt.Sprintf("%d", cols), "rows": fmt.Sprintf("%d", rows)}, nil, &state)
	return state, err
}

func (s *pluginServer) clientWorkspaceAction(ctx context.Context, header http.Header, selector string, cols, rows int, request workspaceActionRequest) (workspaceState, error) {
	var state workspaceState
	err := s.clientTerminalJSON(ctx, header, selector, http.MethodPost, "/workspace", map[string]string{"cols": fmt.Sprintf("%d", cols), "rows": fmt.Sprintf("%d", rows)}, request, &state)
	return state, err
}

func (s *pluginServer) clientTerminalJSON(ctx context.Context, header http.Header, selector, method, path string, query map[string]string, body any, out any) error {
	log.Printf("client terminal json request start: selector=%s method=%s path=%s", selector, method, path)
	values := make(map[string][]string, len(query))
	for key, value := range query {
		if value != "" && value != "0" {
			values[key] = []string{value}
		}
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
	resp, err := s.clientTerminalRequest(ctx, header, selector, method, path, values, reader, contentType)
	if err != nil {
		log.Printf("client terminal json request failed: selector=%s method=%s path=%s err=%v", selector, method, path, err)
		return err
	}
	defer resp.Body.Close()
	log.Printf("client terminal json response: selector=%s method=%s path=%s status=%d", selector, method, path, resp.StatusCode)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := clientTerminalResponseError(resp, "client terminal")
		log.Printf("client terminal json non-2xx: selector=%s method=%s path=%s err=%v", selector, method, path, err)
		return err
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 10<<20)).Decode(out); err != nil {
		log.Printf("client terminal json decode failed: selector=%s method=%s path=%s err=%v", selector, method, path, err)
		return err
	}
	log.Printf("client terminal json decoded: selector=%s method=%s path=%s", selector, method, path)
	return nil
}

func (s *pluginServer) clientTerminalRequest(ctx context.Context, header http.Header, selector, method, path string, query map[string][]string, body io.Reader, contentType string) (*http.Response, error) {
	log.Printf("client terminal request start: selector=%s method=%s path=%s", selector, method, path)
	ticket, authToken, err := s.clientTerminalDialInfo(ctx, header, selector)
	if err != nil {
		log.Printf("client terminal request dial info failed: selector=%s method=%s path=%s err=%v", selector, method, path, err)
		return nil, err
	}
	targetURL, err := clientTerminalURL(ticket, path)
	if err != nil {
		log.Printf("client terminal request target url failed: selector=%s method=%s path=%s err=%v", selector, method, path, err)
		return nil, err
	}
	values := targetURL.Query()
	for key, items := range query {
		for _, value := range items {
			if strings.TrimSpace(value) != "" {
				values.Add(key, value)
			}
		}
	}
	values.Set("ticket", ticket.Ticket)
	targetURL.RawQuery = values.Encode()
	log.Printf("client terminal request target ready: selector=%s method=%s path=%s target=%s auth_token_present=%t", selector, method, path, sanitizeClientTerminalURL(targetURL.String()), authToken != "")

	req, err := http.NewRequestWithContext(ctx, method, targetURL.String(), body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("lzc_dapi_auth_token", authToken)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := newClientTerminalHTTPClient().Do(req)
	if err != nil {
		log.Printf("client terminal request failed: selector=%s method=%s path=%s target=%s err=%v", selector, method, path, sanitizeClientTerminalURL(targetURL.String()), err)
		return nil, err
	}
	return resp, nil
}

func clientTerminalResponseError(resp *http.Response, label string) error {
	if resp == nil {
		return fmt.Errorf("%s returned no response", label)
	}
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return clientTerminalStatusError{label: label, status: resp.StatusCode, body: strings.TrimSpace(string(data))}
}

func writeClientTerminalError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	var statusErr clientTerminalStatusError
	if errors.As(err, &statusErr) {
		if statusErr.status == http.StatusUnauthorized || statusErr.status == http.StatusForbidden {
			http.Error(w, errInstanceForbidden.Error(), statusErr.status)
			return
		}
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	switch {
	case errors.Is(err, errInstanceForbidden):
		http.Error(w, err.Error(), http.StatusForbidden)
	case strings.Contains(err.Error(), "account id is required"):
		http.Error(w, err.Error(), http.StatusUnauthorized)
	case strings.Contains(err.Error(), "invalid client target"):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusBadGateway)
	}
}

func (s *pluginServer) clientTerminalDialInfo(ctx context.Context, header http.Header, selector string) (clientTerminalTicket, string, error) {
	clientID, err := parseClientTargetID(selector)
	if err != nil {
		log.Printf("client terminal dial info parse selector failed: selector=%s err=%v", selector, err)
		return clientTerminalTicket{}, "", err
	}
	info, err := s.resolveLightOSAdminInfo(ctx)
	if err != nil {
		log.Printf("client terminal dial info resolve admin failed: client_id=%s err=%v", clientID, err)
		return clientTerminalTicket{}, "", err
	}
	log.Printf("client terminal dial info requesting ticket: client_id=%s admin=%s copied_auth_headers=%t", clientID, safeURLOrigin(info.BaseURL), hasClientTerminalAuthHeaders(header))
	data, err := json.Marshal(clientTerminalTicketRequest{ID: clientID})
	if err != nil {
		return clientTerminalTicket{}, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(info.BaseURL, "/")+"/api/client-instances/terminal-ticket", bytes.NewReader(data))
	if err != nil {
		return clientTerminalTicket{}, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	copyClientTerminalAuthHeaders(req.Header, header)
	resp, err := s.publishHTTPClientOrDefault().Do(req)
	if err != nil {
		log.Printf("client terminal dial info ticket request failed: client_id=%s admin=%s err=%v", clientID, safeURLOrigin(info.BaseURL), err)
		return clientTerminalTicket{}, "", err
	}
	defer resp.Body.Close()
	log.Printf("client terminal dial info ticket response: client_id=%s status=%d", clientID, resp.StatusCode)
	if resp.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		body := strings.TrimSpace(string(payload))
		log.Printf("client terminal dial info ticket non-200: client_id=%s status=%d body=%s", clientID, resp.StatusCode, body)
		return clientTerminalTicket{}, "", clientTerminalStatusError{label: "client terminal ticket", status: resp.StatusCode, body: body}
	}
	var ticket clientTerminalTicket
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&ticket); err != nil {
		log.Printf("client terminal dial info ticket decode failed: client_id=%s err=%v", clientID, err)
		return clientTerminalTicket{}, "", err
	}
	log.Printf("client terminal dial info ticket decoded: client_id=%s ticket_client=%s service=%s device_api=%s ticket_present=%t expires_at=%s", clientID, ticket.ClientInstanceID, ticket.TerminalServiceName, safeURLOrigin(ticket.DeviceAPIURL), ticket.Ticket != "", ticket.ExpiresAt)
	authToken, err := resolveClientDeviceAPIAuthToken(ctx, ticket.DeviceAPIURL)
	if err != nil {
		log.Printf("client terminal dial info auth token failed: client_id=%s device_api=%s err=%v", clientID, safeURLOrigin(ticket.DeviceAPIURL), err)
		return clientTerminalTicket{}, "", err
	}
	log.Printf("client terminal dial info ready: client_id=%s service=%s device_api=%s auth_token_present=%t", clientID, ticket.TerminalServiceName, safeURLOrigin(ticket.DeviceAPIURL), authToken != "")
	return ticket, authToken, nil
}

func (s *pluginServer) publishHTTPClientOrDefault() *http.Client {
	if s != nil && s.publishHTTPClient != nil {
		return s.publishHTTPClient
	}
	return http.DefaultClient
}

func copyClientTerminalAuthHeaders(dst, src http.Header) {
	for _, key := range []string{"Cookie", "Lzc-Auth-Token", "Lzc-Api-Auth-Token", "X-HC-User-ID", "X-HC-User-Role", "X-HC-Device-ID", "X-HC-Login-Time"} {
		for _, value := range src.Values(key) {
			dst.Add(key, value)
		}
	}
}

func clientDeviceAPIAuthToken(ctx context.Context, deviceAPIURL string) (string, error) {
	gateway, err := lzcsdk.NewAPIGateway(ctx)
	if err != nil {
		return "", err
	}
	defer gateway.Close()
	device, err := gateway.NewDeviceProxy(deviceAPIURL)
	if err != nil {
		return "", err
	}
	defer device.Close()
	token, err := device.GetAuthToken(ctx)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(token.Token), nil
}

func clientTerminalURL(ticket clientTerminalTicket, path string) (*url.URL, error) {
	base, err := url.Parse(strings.TrimRight(ticket.DeviceAPIURL, "/"))
	if err != nil {
		return nil, err
	}
	if base.Scheme == "" || base.Host == "" || ticket.TerminalServiceName == "" {
		return nil, errors.New("invalid client terminal dial info")
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/s/" + strings.Trim(ticket.TerminalServiceName, "/") + path
	return base, nil
}

func websocketHTTPToWS(value string) string {
	if strings.HasPrefix(value, "https://") {
		return "wss://" + strings.TrimPrefix(value, "https://")
	}
	if strings.HasPrefix(value, "http://") {
		return "ws://" + strings.TrimPrefix(value, "http://")
	}
	return value
}

func proxyWebSocketMessages(label string, src, dst *websocket.Conn, errCh chan<- error) {
	messages := 0
	bytesTotal := 0
	for {
		messageType, data, err := src.ReadMessage()
		if err != nil {
			errCh <- fmt.Errorf("%s read failed after messages=%d bytes=%d: %w", label, messages, bytesTotal, err)
			return
		}
		messages++
		bytesTotal += len(data)
		if messages <= 5 {
			log.Printf("client terminal websocket proxy message: direction=%s type=%d bytes=%d messages=%d total_bytes=%d", label, messageType, len(data), messages, bytesTotal)
		}
		if err := dst.WriteMessage(messageType, data); err != nil {
			errCh <- fmt.Errorf("%s write failed after messages=%d bytes=%d: %w", label, messages, bytesTotal, err)
			return
		}
	}
}

type websocketDialFailure struct {
	status      int
	location    string
	contentType string
	body        string
	message     string
	userMessage string
	code        string
}

func readWebSocketDialFailure(err error, response *http.Response) websocketDialFailure {
	failure := websocketDialFailure{
		message:     err.Error(),
		userMessage: err.Error(),
		code:        "client_terminal_websocket_dial_failed",
	}
	if response == nil {
		return failure
	}
	failure.status = response.StatusCode
	failure.location = response.Header.Get("Location")
	failure.contentType = response.Header.Get("Content-Type")
	data, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
	_ = response.Body.Close()
	failure.body = strings.TrimSpace(string(data))
	if failure.status > 0 {
		failure.message = fmt.Sprintf("%s; target_status=%d", err.Error(), failure.status)
		if failure.body != "" {
			failure.message += "; target_body=" + failure.body
		}
		if failure.status == http.StatusUnauthorized || failure.status == http.StatusForbidden {
			failure.userMessage = errInstanceForbidden.Error()
			failure.code = "client_terminal_forbidden"
		} else if failure.body != "" {
			failure.userMessage = fmt.Sprintf("Client terminal connection failed (target_status=%d): %s", failure.status, failure.body)
		} else {
			failure.userMessage = fmt.Sprintf("Client terminal connection failed. Please restart the desktop client or turn LightOS access off and on again. (target_status=%d)", failure.status)
		}
		if failure.status == http.StatusBadGateway {
			failure.code = "client_terminal_service_unavailable"
		}
	}
	return failure
}

func safeURLOrigin(value string) string {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "unavailable"
	}
	return parsed.Scheme + "://" + parsed.Host
}

func sanitizeClientTerminalURL(value string) string {
	parsed, err := url.Parse(value)
	if err != nil {
		return "unavailable"
	}
	query := parsed.Query()
	if query.Has("ticket") {
		query.Set("ticket", "[redacted]")
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func hasClientTerminalAuthHeaders(header http.Header) bool {
	for _, key := range []string{"Cookie", "Lzc-Auth-Token", "Lzc-Api-Auth-Token", "X-HC-User-ID", "X-HC-User-Role", "X-HC-Device-ID", "X-HC-Login-Time"} {
		if len(header.Values(key)) > 0 {
			return true
		}
	}
	return false
}
