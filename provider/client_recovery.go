package provider

import (
	"context"
	"log"
	"net/http"
	"slices"
)

// Client lifecycle is separate from container installation/reconciliation.
// Only the account-scoped recovery document store is shared.
func (s *pluginServer) clientWorkspaceWithRecovery(ctx context.Context, header http.Header, scope AgentScope, cols, rows, scrollback int, action *WorkspaceActionRequest) (WorkspaceState, error) {
	_, epoch := s.currentTerminalRuntimeSettings()
	if s.workspaceRecovery == nil || epoch == "" {
		if action != nil {
			return s.clientWorkspaceAction(ctx, header, scope.Selector, cols, rows, scrollback, *action)
		}
		return s.clientWorkspaceState(ctx, header, scope.Selector, cols, rows, scrollback)
	}
	lock := workspaceRecoveryOperationLock(scope)
	lock.Lock()
	defer lock.Unlock()
	state, err := s.clientWorkspaceState(ctx, header, scope.Selector, cols, rows, scrollback)
	if err != nil {
		return WorkspaceState{}, err
	}
	supported := state.WorkspaceGeneration != "" && slices.Contains(state.AgentCapabilities, "workspace_restart_restore")
	if supported {
		document, found, loadErr := s.workspaceRecovery.Load(scope, epoch)
		if loadErr != nil {
			log.Printf("client workspace recovery load failed: %v", loadErr)
		}
		if loadErr == nil && found && document.WorkspaceGeneration != state.WorkspaceGeneration {
			state, err = s.clientWorkspaceAction(ctx, header, scope.Selector, cols, rows, scrollback,
				WorkspaceActionRequest{Action: "restore_workspace", Recovery: &document})
			if err != nil {
				return WorkspaceState{}, err
			}
		}
	}
	if action != nil {
		state, err = s.clientWorkspaceAction(ctx, header, scope.Selector, cols, rows, scrollback, *action)
		if err != nil {
			return WorkspaceState{}, err
		}
	}
	if supported {
		s.saveWorkspaceRecovery(scope, epoch, state)
	}
	return state, nil
}
