package provider

import (
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// This is an account preference owned by the public LightOS Admin API, not by
// the Provider's terminal settings or workspace persistence.
func (s *pluginServer) handleInstanceOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	info, err := s.resolveLightOSAdminInfo(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	target, err := buildLightOSAdminURL(resolvePublishProxyLightOSAdminBaseURL(info), &url.URL{Path: "/unsafe_api/instance-order"})
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	request, err := http.NewRequestWithContext(r.Context(), r.Method, target, http.MaxBytesReader(w, r.Body, 16384))
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	copyPublishProxyRequestHeaders(request.Header, r.Header)
	setPublishProxyAuthHeaders(request.Header, r.Header, accountID)
	// Preserve the actual Provider origin for the public API allowlist, including
	// the built-in Provider reached through the internal loopback transport.
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	if strings.TrimSpace(os.Getenv(lazyCatAppIDEnv)) == lightOSAdminAppID {
		request.Host = r.Host
	}
	request.Header.Set("Origin", scheme+"://"+r.Host)
	response, err := s.publishClient().Do(request)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, err)
		return
	}
	defer response.Body.Close()
	copyPublishProxyResponseHeaders(w.Header(), response.Header)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
}
