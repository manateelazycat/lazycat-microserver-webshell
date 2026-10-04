package core

import (
	"context"
	"fmt"
	"lcmd-webshell/internal/pkg/fonts"
	"sync"
)

type WorkspaceManager struct {
	rootDir string
	runtime *Runtime

	mu         sync.Mutex
	workspaces map[string]*terminalWorkspace
}

func NewWorkspaceManager(rootDir string, runtime *Runtime) *WorkspaceManager {
	return &WorkspaceManager{
		rootDir:    rootDir,
		runtime:    runtime,
		workspaces: make(map[string]*terminalWorkspace),
	}
}

func (m *WorkspaceManager) getOrCreate(ctx context.Context, selector string, cols, rows int) (*terminalWorkspace, error) {
	if err := m.runtime.targets.ValidateSelector(selector); err != nil {
		return nil, err
	}
	m.mu.Lock()
	if workspace := m.workspaces[selector]; workspace != nil {
		m.mu.Unlock()
		return workspace, nil
	}
	m.mu.Unlock()

	username, err := m.runtime.targets.ResolveUsername(ctx, selector)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if workspace := m.workspaces[selector]; workspace != nil {
		return workspace, nil
	}
	workspaceGeneration, err := NewHistoryGeneration()
	if err != nil {
		return nil, fmt.Errorf("create workspace generation: %w", err)
	}
	workspace := &terminalWorkspace{
		manager:             m,
		runtime:             m.runtime,
		selector:            selector,
		workspaceGeneration: workspaceGeneration,
		username:            username,
		rootDir:             m.rootDir,
		historyLimitBytes:   historyLimitBytesForTerminalScrollback(fonts.DefaultTerminalScrollback),
		panes:               make(map[string]*terminalPane),
		nextTabID:           1,
		nextPaneID:          1,
	}
	if err := workspace.createTabLocked("", "", NormalizeCols(cols), NormalizeRows(rows)); err != nil {
		return nil, err
	}
	m.workspaces[selector] = workspace
	return workspace, nil
}

func (m *WorkspaceManager) closeAll() {
	m.mu.Lock()
	workspaces := make([]*terminalWorkspace, 0, len(m.workspaces))
	for _, workspace := range m.workspaces {
		workspaces = append(workspaces, workspace)
	}
	m.workspaces = make(map[string]*terminalWorkspace)
	m.mu.Unlock()

	for _, workspace := range workspaces {
		workspace.closeAllPanes()
	}
}
