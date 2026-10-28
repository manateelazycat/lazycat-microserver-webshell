package provider

import (
	"context"
	"errors"
	"net/http"
	"time"
)

// The dedicated inspection route is optional on deployed PC terminal cores.
// Its absence says nothing about whether the established workspace route works.
func (s *pluginServer) clientWorkspaceInspection(ctx context.Context, header http.Header, scope AgentScope) (WorkspaceState, error) {
	key := scope.CacheKey()
	now := time.Now()
	if value, ok := s.clientWorkspaceInspectionFallbacks.Load(key); ok {
		if expiry, valid := value.(time.Time); valid && now.Before(expiry) {
			return s.clientWorkspaceState(ctx, header, scope.Selector, 0, 0, 0)
		}
		s.clientWorkspaceInspectionFallbacks.Delete(key)
	}

	var state WorkspaceState
	err := s.clientTerminalJSON(ctx, header, scope.Selector, http.MethodGet, "/workspace/inspect", nil, nil, &state)
	if err == nil {
		return state, nil
	}
	var status clientTerminalStatusError
	if !errors.As(err, &status) || status.label != "client terminal" ||
		(status.status != http.StatusNotFound && status.status != http.StatusMethodNotAllowed) {
		return WorkspaceState{}, err
	}

	// Remember only the route choice, scoped to this Provider, account and target.
	// Re-probe after a minute so a restarted/upgraded service returns to inspection.
	// Record before fallback: a slow legacy read must not repeat the failed probe
	// on every browser retry and exhaust the client gateway timeout again.
	s.clientWorkspaceInspectionFallbacks.Range(func(key, value any) bool {
		if expiry, ok := value.(time.Time); !ok || !now.Before(expiry) {
			s.clientWorkspaceInspectionFallbacks.Delete(key)
		}
		return true
	})
	s.clientWorkspaceInspectionFallbacks.Store(key, now.Add(time.Minute))

	// Use exactly the established read path, without recovery, resize parameters,
	// scrollback updates, activate actions, reconnection or process replacement.
	// Older cores retain their normal first-workspace initialization semantics.
	return s.clientWorkspaceState(ctx, header, scope.Selector, 0, 0, 0)
}
