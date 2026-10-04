package provider

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var errInvalidPublishCreatePayload = errors.New("invalid publish create payload")

var errClientTerminalProxyUnavailable = errors.New("client terminal proxy is not available yet")

var allowedPublishProxyRoutes = map[string]string{
	"/api/publish/list":                   http.MethodGet,
	"/api/publish/status":                 http.MethodGet,
	"/api/publish/http/create":            http.MethodPost,
	"/api/publish/http/update":            http.MethodPost,
	"/api/publish/http/delete":            http.MethodPost,
	"/api/publish/http/install-shell-lpk": http.MethodPost,
}

func (s *pluginServer) handlePublishProxy(w http.ResponseWriter, r *http.Request) {
	expectedMethod, ok := allowedPublishProxyRoutes[r.URL.Path]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if r.Method != expectedMethod {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if err := s.authorizePublishProxyRequest(r); err != nil {
		writeAuthorizationError(w, err)
		return
	}

	info, err := s.resolveLightOSAdminInfo(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	targetURL, err := buildLightOSAdminURL(resolvePublishProxyLightOSAdminBaseURL(info), r.URL)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	request, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	request.ContentLength = r.ContentLength
	copyPublishProxyRequestHeaders(request.Header, r.Header)
	setPublishProxyAuthHeaders(request.Header, r.Header, accountID)

	response, err := s.publishClient().Do(request)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	defer response.Body.Close()

	copyPublishProxyResponseHeaders(w.Header(), response.Header)
	w.WriteHeader(response.StatusCode)
	if _, err := io.Copy(w, response.Body); err != nil {
		log.Printf("publish proxy response copy failed: %v", err)
	}
}

type publishCreateRequest struct {
	InstanceName string `json:"instance_name"`
}

func resolvePublishProxyLightOSAdminBaseURL(info adminInfo) string {
	if value := strings.TrimSpace(lightOSConfigValue(lightOSAdminInternalBaseURLEnv)); value != "" {
		return value
	}
	if strings.TrimSpace(os.Getenv(lazyCatAppIDEnv)) == lightOSAdminAppID {
		return defaultLightOSAdminInternalBaseURL
	}
	return info.BaseURL
}

func joinURLPath(basePath, requestPath string) string {
	basePath = strings.TrimRight(strings.TrimSpace(basePath), "/")
	requestPath = "/" + strings.TrimLeft(strings.TrimSpace(requestPath), "/")
	if basePath == "" {
		return requestPath
	}
	return basePath + requestPath
}

func (s *pluginServer) publishClient() *http.Client {
	if s != nil && s.publishHTTPClient != nil {
		return s.publishHTTPClient
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func copyPublishProxyRequestHeaders(dst, src http.Header) {
	for key, values := range src {
		if !isPublishProxyRequestHeaderAllowed(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func setPublishProxyAuthHeaders(dst, src http.Header, accountID string) {
	if dst == nil {
		return
	}
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return
	}
	for _, key := range []string{"X-HC-User-ID", "X-HC-USER-ID", "X-HC-User-Role", "X-HC-Device-ID", "X-HC-Login-Time"} {
		dst.Del(key)
	}
	dst.Set(lightOSUserIDHeader, accountID)
	for _, key := range []string{"X-HC-User-Role", "X-HC-Device-ID", "X-HC-Login-Time"} {
		if value := firstHeaderValueAnyCase(src, key); value != "" {
			dst.Set(key, value)
		}
	}
}

func firstHeaderValueAnyCase(header http.Header, key string) string {
	for actualKey, values := range header {
		if !strings.EqualFold(actualKey, key) {
			continue
		}
		for _, value := range values {
			if trimmed := strings.TrimSpace(value); trimmed != "" {
				return trimmed
			}
		}
	}
	return ""
}

func isPublishProxyRequestHeaderAllowed(key string) bool {
	switch http.CanonicalHeaderKey(key) {
	case "Accept", "Accept-Language", "Authorization", "Content-Type", "Cookie", "X-Csrf-Token", "X-Requested-With":
		return true
	default:
		return false
	}
}

func copyPublishProxyResponseHeaders(dst, src http.Header) {
	for key, values := range src {
		if !isPublishProxyResponseHeaderAllowed(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func isPublishProxyResponseHeaderAllowed(key string) bool {
	switch http.CanonicalHeaderKey(key) {
	case "Content-Type", "Cache-Control", "Set-Cookie":
		return true
	default:
		return false
	}
}

func writeAPIError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if encodeErr := json.NewEncoder(w).Encode(apiErrorResponse{Error: strings.TrimSpace(err.Error())}); encodeErr != nil {
		log.Printf("api error response encode failed: %v", encodeErr)
	}
}
