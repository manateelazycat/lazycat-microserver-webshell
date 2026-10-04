package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

var errInstanceForbidden = errors.New("instance is not accessible by current account")

func currentRequestAccountID(r *http.Request) string {
	if r == nil {
		return ""
	}
	if accountID := strings.TrimSpace(r.Header.Get(lightOSUserIDHeader)); accountID != "" {
		return accountID
	}
	if lightOSCookieAuthRequired() {
		return ""
	}
	return currentDeployUIDFromEnv()
}

func lightOSCookieAuthRequired() bool {
	switch strings.ToLower(lightOSConfigValue(lightOSRequireCookieAuthEnv)) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func writeAuthorizationError(w http.ResponseWriter, err error) {
	var discoveryErr *instanceDiscoveryError
	switch {
	case err == nil:
		return
	case errors.As(err, &discoveryErr):
		http.Error(w, err.Error(), discoveryErr.HTTPStatusCode())
	case errors.Is(err, errInstanceForbidden):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, errClientTerminalProxyUnavailable):
		http.Error(w, err.Error(), http.StatusNotImplemented)
	case strings.Contains(err.Error(), "account id is required"):
		http.Error(w, err.Error(), http.StatusUnauthorized)
	case strings.Contains(err.Error(), "deploy uid is required"):
		http.Error(w, err.Error(), http.StatusUnauthorized)
	case strings.Contains(err.Error(), "invalid instance selector"):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case strings.Contains(err.Error(), "invalid client target"):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, errInvalidPublishCreatePayload):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusBadGateway)
	}
}

func (s *pluginServer) authorizeInstanceSelector(ctx context.Context, selector string) error {
	selector = strings.TrimSpace(selector)
	if err := validateInstanceSelector(selector); err != nil {
		return err
	}
	items, err := s.listVisibleInstances(ctx)
	if err != nil {
		return err
	}
	for _, item := range items {
		if instanceSelector(item) == selector {
			return nil
		}
	}
	return errInstanceForbidden
}

func (s *pluginServer) authorizeClientTarget(ctx context.Context, header http.Header, accountID, target string) error {
	id, err := parseClientTargetID(target)
	if err != nil {
		return err
	}
	items, err := s.listLightOSAdminClientInstances(ctx, header, accountID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if strings.TrimSpace(item.ID) == id {
			return nil
		}
	}
	return errInstanceForbidden
}

func (s *pluginServer) authorizeOwnedInstanceSelector(ctx context.Context, selector string) error {
	selector = strings.TrimSpace(selector)
	if err := validateInstanceSelector(selector); err != nil {
		return err
	}
	items, err := s.listOwnedInstances(ctx)
	if err != nil {
		return err
	}
	for _, item := range items {
		if instanceSelector(item) == selector {
			return nil
		}
	}
	return errInstanceForbidden
}

func (s *pluginServer) authorizePublishProxyRequest(r *http.Request) error {
	if r == nil || r.URL.Path != "/api/publish/http/create" {
		return nil
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		return errors.New("account id is required")
	}
	data, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	_ = r.Body.Close()
	r.Body = io.NopCloser(bytes.NewReader(data))
	r.ContentLength = int64(len(data))

	var payload publishCreateRequest
	if err := json.Unmarshal(data, &payload); err != nil {
		return fmt.Errorf("%w: %v", errInvalidPublishCreatePayload, err)
	}
	if isClientTarget(payload.InstanceName) {
		return s.authorizeClientTarget(r.Context(), r.Header, accountID, payload.InstanceName)
	}
	return s.authorizeOwnedInstanceSelector(r.Context(), payload.InstanceName)
}
