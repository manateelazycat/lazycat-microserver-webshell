package core

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

func (d *agentDaemon) ensureWorkspaceLocked(request AgentRequest) (*terminalWorkspace, error) {
	if d.closed {
		return nil, errors.New("terminal access disabled")
	}
	if err := d.validateRequestSelectorLocked(request.Selector); err != nil {
		return nil, err
	}
	if err := d.validateRequestAccountLocked(request.AccountID); err != nil {
		return nil, err
	}
	if username := strings.TrimSpace(request.Username); username != "" || d.username == "" {
		d.username = username
	}
	historyLimitBytes := historyLimitBytesForTerminalScrollback(request.TerminalScrollback)
	if d.workspace == nil {
		workspaceGeneration, err := NewHistoryGeneration()
		if err != nil {
			return nil, fmt.Errorf("create workspace generation: %w", err)
		}
		workspace := &terminalWorkspace{
			selector:            d.selector,
			runtime:             d.runtime,
			workspaceGeneration: workspaceGeneration,
			username:            d.username,
			rootDir:             d.runtime.platform.DefaultWorkingDirectory(),
			localPTY:            true,
			historyLimitBytes:   historyLimitBytes,
			panes:               make(map[string]*terminalPane),
			nextTabID:           1,
			nextPaneID:          1,
		}
		if err := workspace.createTabLocked("", "", NormalizeCols(request.Cols), NormalizeRows(request.Rows)); err != nil {
			return nil, err
		}
		d.workspace = workspace
	}
	if d.workspace.selector == "" {
		d.workspace.selector = d.selector
	}
	if d.workspace.workspaceGeneration == "" {
		workspaceGeneration, err := NewHistoryGeneration()
		if err != nil {
			return nil, fmt.Errorf("create workspace generation: %w", err)
		}
		d.workspace.workspaceGeneration = workspaceGeneration
	}
	if d.workspace.username == "" || strings.TrimSpace(request.Username) != "" {
		d.workspace.username = d.username
	}
	d.workspace.setHistoryLimitBytes(historyLimitBytes)
	if len(d.workspace.tabs) == 0 {
		if err := d.workspace.createTabLocked("", "", NormalizeCols(request.Cols), NormalizeRows(request.Rows)); err != nil {
			return nil, err
		}
	}
	return d.workspace, nil
}

func (d *agentDaemon) validateRequestSelectorLocked(selector string) error {
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return nil
	}
	if d.selector != "" && d.selector != selector {
		return fmt.Errorf("agent selector mismatch: daemon %q, request %q", d.selector, selector)
	}
	if d.workspace != nil && d.workspace.selector != "" && d.workspace.selector != selector {
		return fmt.Errorf("agent workspace selector mismatch: workspace %q, request %q", d.workspace.selector, selector)
	}
	d.selector = selector
	return nil
}

func (d *agentDaemon) validateRequestAccountLocked(accountID string) error {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		if d.accountID != "" {
			return errors.New("agent account is required")
		}
		return nil
	}
	if d.accountID != "" && d.accountID != accountID {
		return fmt.Errorf("agent account mismatch: daemon %q, request %q", d.accountID, accountID)
	}
	d.accountID = accountID
	return nil
}

func (d *agentDaemon) WorkspaceState(ctx context.Context, request AgentRequest) (WorkspaceState, error) {
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		return WorkspaceState{}, err
	}
	return workspace.snapshot(), nil
}

func (d *agentDaemon) applyWorkspaceAction(ctx context.Context, request AgentRequest) (WorkspaceState, error) {
	if request.Action == nil {
		return WorkspaceState{}, errors.New("action is required")
	}
	if request.Action.Action == "restore_workspace" {
		return d.restoreWorkspace(request)
	}
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		return WorkspaceState{}, err
	}
	if request.Action.Action == "create_tab" || request.Action.Action == "split_pane" {
		_, _ = workspace.refreshActivity(ctx)
	}
	if err := workspace.applyAction(*request.Action); err != nil {
		return WorkspaceState{}, err
	}
	return workspace.snapshot(), nil
}

func (d *agentDaemon) restoreWorkspace(request AgentRequest) (WorkspaceState, error) {
	if request.Action == nil || request.Action.Recovery == nil {
		return WorkspaceState{}, errors.New("workspace recovery document is required")
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return WorkspaceState{}, errors.New("terminal access disabled")
	}
	if err := d.validateRequestSelectorLocked(request.Selector); err != nil {
		return WorkspaceState{}, err
	}
	if err := d.validateRequestAccountLocked(request.AccountID); err != nil {
		return WorkspaceState{}, err
	}
	if username := strings.TrimSpace(request.Username); username != "" || d.username == "" {
		d.username = username
	}
	historyLimitBytes := historyLimitBytesForTerminalScrollback(request.TerminalScrollback)
	restored, err := newRecoveredTerminalWorkspace(
		d.runtime,
		*request.Action.Recovery,
		d.selector,
		d.username,
		historyLimitBytes,
		NormalizeCols(request.Cols),
		NormalizeRows(request.Rows),
	)
	if err != nil {
		return WorkspaceState{}, err
	}
	previous := d.workspace
	d.workspace = restored
	if previous != nil {
		previous.closeAllPanes()
	}
	return restored.snapshot(), nil
}

func (d *agentDaemon) workspaceActivity(ctx context.Context, request AgentRequest) (*WorkspaceActivityState, error) {
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		return nil, err
	}
	state, err := workspace.refreshActivity(ctx)
	return &state, err
}
