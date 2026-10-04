package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"time"
)

type instanceSummary struct {
	Selector      string `json:"selector,omitempty"`
	Name          string `json:"name"`
	OwnerDeployID string `json:"owner_deploy_id"`
	Status        string `json:"status"`
	Username      string `json:"username,omitempty"`
}

type clientInstanceSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Platform    string `json:"platform"`
	Status      string `json:"status"`
	OwnerUserID string `json:"owner_user_id"`
	WebshellURL string `json:"webshell_url"`
}

var defaultInstanceRetryDelays = []time.Duration{100 * time.Millisecond, 300 * time.Millisecond}

type instanceDiscoveryAttemptError struct {
	Kind       string
	StatusCode int
	Retryable  bool
	Err        error
}

func (e *instanceDiscoveryAttemptError) Error() string {
	if e == nil || e.Err == nil {
		return "instance discovery failed"
	}
	return e.Err.Error()
}

func (e *instanceDiscoveryAttemptError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

type instanceDiscoveryError struct {
	Stage      string
	Kind       string
	StatusCode int
	Attempts   int
	Err        error
}

func (e *instanceDiscoveryError) Error() string {
	if e == nil {
		return "instance discovery failed"
	}
	detail := "instance discovery failed"
	if e.Err != nil {
		detail = e.Err.Error()
	}
	kind := strings.TrimSpace(e.Kind)
	if kind == "" {
		kind = "request"
	}
	return fmt.Sprintf("instances %s %s failed after %d attempt(s): %s", e.Stage, kind, e.Attempts, detail)
}

func (e *instanceDiscoveryError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func (e *instanceDiscoveryError) HTTPStatusCode() int {
	if e != nil && e.StatusCode >= 400 && e.StatusCode <= 599 {
		return e.StatusCode
	}
	return http.StatusBadGateway
}

func (s *pluginServer) handleInstances(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	items, err := s.listRequestVisibleInstances(r.Context(), r.Header, accountID)
	if err != nil {
		writeAuthorizationError(w, err)
		return
	}
	items = dedupeInstanceSummaries(items)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(items); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func listInstances(ctx context.Context) ([]instanceSummary, error) {
	output, err := exec.CommandContext(ctx, lightosctlPath, "ps").CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return nil, err
		}
		return nil, fmt.Errorf("%w: %s", err, text)
	}
	var items []instanceSummary
	if err := json.Unmarshal(output, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *pluginServer) listInstances(ctx context.Context) ([]instanceSummary, error) {
	if s != nil && s.instancesResolver != nil {
		return s.instancesResolver(ctx)
	}
	return listInstances(ctx)
}

func (s *pluginServer) listRequestVisibleInstances(ctx context.Context, header http.Header, accountID string) ([]instanceSummary, error) {
	if s != nil && s.instancesResolver != nil {
		return s.instancesResolver(ctx)
	}
	delays := defaultInstanceRetryDelays
	if s != nil && s.instanceRetryDelays != nil {
		delays = s.instanceRetryDelays
	}
	info, err := retryInstanceDiscovery(ctx, delays, "admin-info", func() (adminInfo, error) {
		info, err := s.resolveLightOSAdminInfo(ctx)
		if err != nil {
			return adminInfo{}, &instanceDiscoveryAttemptError{Kind: "resolve", Retryable: true, Err: err}
		}
		return info, nil
	})
	if err != nil {
		return nil, err
	}
	items, err := retryInstanceDiscovery(ctx, delays, "webshell-instances", func() ([]instanceSummary, error) {
		return s.listLightOSAdminWebshellInstancesWithInfo(ctx, header, accountID, info)
	})
	if err != nil {
		return nil, err
	}
	clientItems, err := retryInstanceDiscovery(ctx, delays, "client-instances", func() ([]clientInstanceSummary, error) {
		return s.listLightOSAdminClientInstancesWithInfo(ctx, header, accountID, info)
	})
	if err != nil {
		return nil, err
	}
	items = append(items, clientInstanceSummariesToInstances(clientItems)...)
	return items, nil
}

func retryInstanceDiscovery[T any](ctx context.Context, delays []time.Duration, stage string, operation func() (T, error)) (T, error) {
	var zero T
	for attempt := 1; ; attempt++ {
		value, err := operation()
		if err == nil {
			return value, nil
		}
		attemptErr := &instanceDiscoveryAttemptError{Kind: "request", Err: err}
		var typedAttemptErr *instanceDiscoveryAttemptError
		if errors.As(err, &typedAttemptErr) {
			attemptErr = typedAttemptErr
		}
		canRetry := attemptErr.Retryable && ctx.Err() == nil && attempt <= len(delays)
		if !canRetry {
			return zero, &instanceDiscoveryError{
				Stage:      stage,
				Kind:       attemptErr.Kind,
				StatusCode: attemptErr.StatusCode,
				Attempts:   attempt,
				Err:        attemptErr.Err,
			}
		}
		log.Printf("[instances] stage=%s kind=%s attempt=%d/%d status=%d retry=true", stage, attemptErr.Kind, attempt, len(delays)+1, attemptErr.StatusCode)
		timer := time.NewTimer(delays[attempt-1])
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return zero, &instanceDiscoveryError{
				Stage:      stage,
				Kind:       attemptErr.Kind,
				StatusCode: attemptErr.StatusCode,
				Attempts:   attempt,
				Err:        ctx.Err(),
			}
		case <-timer.C:
		}
	}
}

func dedupeInstanceSummaries(items []instanceSummary) []instanceSummary {
	if len(items) == 0 {
		return items
	}
	result := make([]instanceSummary, 0, len(items))
	indexBySelector := make(map[string]int, len(items))
	for _, item := range items {
		selector := instanceSelector(item)
		if selector == "" {
			result = append(result, item)
			continue
		}
		index, ok := indexBySelector[selector]
		if !ok {
			indexBySelector[selector] = len(result)
			result = append(result, item)
			continue
		}
		result[index] = mergeDuplicateInstanceSummary(result[index], item)
	}
	return result
}

func mergeDuplicateInstanceSummary(current, next instanceSummary) instanceSummary {
	if instanceSummaryCompletenessScore(next) > instanceSummaryCompletenessScore(current) {
		current, next = next, current
	}
	if strings.TrimSpace(current.Selector) == "" {
		current.Selector = strings.TrimSpace(next.Selector)
	}
	if strings.TrimSpace(current.Name) == "" {
		current.Name = strings.TrimSpace(next.Name)
	}
	if strings.TrimSpace(current.OwnerDeployID) == "" {
		current.OwnerDeployID = strings.TrimSpace(next.OwnerDeployID)
	}
	if strings.TrimSpace(current.Status) == "" {
		current.Status = strings.TrimSpace(next.Status)
	}
	if strings.TrimSpace(current.Username) == "" {
		current.Username = strings.TrimSpace(next.Username)
	}
	return current
}

func instanceSummaryCompletenessScore(item instanceSummary) int {
	score := 0
	if strings.TrimSpace(item.Selector) != "" {
		score += 8
	}
	if strings.TrimSpace(item.Name) != "" {
		score += 4
	}
	if strings.TrimSpace(item.OwnerDeployID) != "" {
		score += 4
	}
	if strings.TrimSpace(item.Username) != "" {
		score += 2
	}
	if strings.TrimSpace(item.Status) != "" {
		score++
	}
	return score
}

func (s *pluginServer) listLightOSAdminWebshellInstances(ctx context.Context, header http.Header, accountID string) ([]instanceSummary, error) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return nil, errors.New("account id is required")
	}
	info, err := s.resolveLightOSAdminInfo(ctx)
	if err != nil {
		return nil, err
	}
	return s.listLightOSAdminWebshellInstancesWithInfo(ctx, header, accountID, info)
}

func (s *pluginServer) listLightOSAdminWebshellInstancesWithInfo(ctx context.Context, header http.Header, accountID string, info adminInfo) ([]instanceSummary, error) {
	targetURL, err := buildLightOSAdminURL(resolvePublishProxyLightOSAdminBaseURL(info), &url.URL{Path: "/api/webshell/instances"})
	if err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "request", Err: err}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "request", Err: err}
	}
	copyPublishProxyRequestHeaders(request.Header, header)
	setPublishProxyAuthHeaders(request.Header, header, accountID)
	request.Header.Set("Accept", "application/json")

	response, err := s.publishClient().Do(request)
	if err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "transport", Retryable: true, Err: err}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = response.Status
		}
		return nil, &instanceDiscoveryAttemptError{
			Kind:       "upstream",
			StatusCode: response.StatusCode,
			Retryable:  response.StatusCode == http.StatusBadGateway || response.StatusCode == http.StatusServiceUnavailable || response.StatusCode == http.StatusGatewayTimeout,
			Err:        errors.New(message),
		}
	}
	var items []instanceSummary
	if err := json.NewDecoder(response.Body).Decode(&items); err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "decode", Err: err}
	}
	return items, nil
}

func (s *pluginServer) listLightOSAdminClientInstances(ctx context.Context, header http.Header, accountID string) ([]clientInstanceSummary, error) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return nil, errors.New("account id is required")
	}
	info, err := s.resolveLightOSAdminInfo(ctx)
	if err != nil {
		return nil, err
	}
	return s.listLightOSAdminClientInstancesWithInfo(ctx, header, accountID, info)
}

func (s *pluginServer) listLightOSAdminClientInstancesWithInfo(ctx context.Context, header http.Header, accountID string, info adminInfo) ([]clientInstanceSummary, error) {
	targetURL, err := buildLightOSAdminURL(resolvePublishProxyLightOSAdminBaseURL(info), &url.URL{Path: "/api/client-instances"})
	if err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "request", Err: err}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "request", Err: err}
	}
	copyPublishProxyRequestHeaders(request.Header, header)
	setPublishProxyAuthHeaders(request.Header, header, accountID)
	request.Header.Set("Accept", "application/json")

	response, err := s.publishClient().Do(request)
	if err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "transport", Retryable: true, Err: err}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = response.Status
		}
		return nil, &instanceDiscoveryAttemptError{
			Kind:       "upstream",
			StatusCode: response.StatusCode,
			Retryable:  response.StatusCode == http.StatusBadGateway || response.StatusCode == http.StatusServiceUnavailable || response.StatusCode == http.StatusGatewayTimeout,
			Err:        errors.New(message),
		}
	}
	var items []clientInstanceSummary
	if err := json.NewDecoder(response.Body).Decode(&items); err != nil {
		return nil, &instanceDiscoveryAttemptError{Kind: "decode", Err: err}
	}
	return items, nil
}

func clientInstanceSummariesToInstances(items []clientInstanceSummary) []instanceSummary {
	result := make([]instanceSummary, 0, len(items))
	for _, item := range items {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = "PC Client"
		}
		status := strings.TrimSpace(item.Status)
		if status == "" {
			status = "running"
		}
		result = append(result, instanceSummary{
			Selector: "client:" + id,
			Name:     name,
			Status:   status,
		})
	}
	return result
}

func (s *pluginServer) currentDeployUID() string {
	if s != nil && s.deployUIDResolver != nil {
		return strings.TrimSpace(s.deployUIDResolver())
	}
	return currentDeployUIDFromEnv()
}

func (s *pluginServer) listOwnedInstances(ctx context.Context) ([]instanceSummary, error) {
	items, err := s.listInstances(ctx)
	if err != nil {
		return nil, err
	}
	for _, ownerID := range s.currentOwnerDeployIDs(ctx) {
		filtered := filterInstancesByOwnerDeployID(items, ownerID)
		if len(filtered) > 0 {
			return filtered, nil
		}
	}
	return items, nil
}

func (s *pluginServer) listVisibleInstances(ctx context.Context) ([]instanceSummary, error) {
	return s.listInstances(ctx)
}

func (s *pluginServer) currentOwnerDeployIDs(ctx context.Context) []string {
	var ids []string
	seen := make(map[string]struct{})
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		ids = append(ids, value)
	}
	add(s.currentDeployUID())
	if info, err := s.resolveLightOSAdminInfo(ctx); err == nil {
		add(info.DeployID)
	}
	return ids
}

func filterInstancesByOwnerDeployID(items []instanceSummary, ownerID string) []instanceSummary {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return nil
	}
	filtered := make([]instanceSummary, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item.OwnerDeployID) == ownerID {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func validateInstanceSelector(value string) error {
	name, ownerDeployID, ok := strings.Cut(strings.TrimSpace(value), "@")
	if !ok || strings.TrimSpace(name) == "" || strings.TrimSpace(ownerDeployID) == "" {
		return errors.New("invalid instance selector")
	}
	return nil
}

func isClientTarget(value string) bool {
	return strings.HasPrefix(strings.TrimSpace(value), "client:")
}

func parseClientTargetID(value string) (string, error) {
	value = strings.TrimSpace(value)
	id, ok := strings.CutPrefix(value, "client:")
	id = strings.TrimSpace(id)
	if !ok || id == "" {
		return "", errors.New("invalid client target")
	}
	return id, nil
}

func instanceSelector(item instanceSummary) string {
	if selector := strings.TrimSpace(item.Selector); selector != "" {
		return selector
	}
	name := strings.TrimSpace(item.Name)
	ownerDeployID := strings.TrimSpace(item.OwnerDeployID)
	if name == "" || ownerDeployID == "" {
		return ""
	}
	return name + "@" + ownerDeployID
}

func resolveInstanceLoginUser(ctx context.Context, selector string) (string, error) {
	if err := validateInstanceSelector(selector); err != nil {
		return "", err
	}
	items, err := listInstances(ctx)
	if err != nil {
		return "", err
	}
	for _, item := range items {
		if instanceSelector(item) == selector {
			return strings.TrimSpace(item.Username), nil
		}
	}
	return "", errors.New("instance not found")
}
