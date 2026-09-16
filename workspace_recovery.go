package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

const (
	workspaceRecoveryVersion        = 1
	workspaceRecoveryMaxBytes       = 1 << 20
	workspaceRecoveryMaxTabs        = 64
	workspaceRecoveryMaxPanes       = 256
	workspaceRecoveryMaxLayoutDepth = 32
)

type workspaceRecoveryDocument struct {
	Version             int                    `json:"version"`
	Epoch               string                 `json:"epoch"`
	WorkspaceGeneration string                 `json:"workspace_generation"`
	ActiveTabID         string                 `json:"active_tab_id"`
	RecentTabIDs        []string               `json:"recent_tab_ids,omitempty"`
	Tabs                []workspaceRecoveryTab `json:"tabs"`
}

type workspaceRecoveryTab struct {
	ID           string                  `json:"id"`
	Label        string                  `json:"label"`
	CustomLabel  bool                    `json:"custom_label"`
	ActivePaneID string                  `json:"active_pane_id"`
	Layout       *layoutNode             `json:"layout"`
	Panes        []workspaceRecoveryPane `json:"panes"`
}

type workspaceRecoveryPane struct {
	ID  string `json:"id"`
	CWD string `json:"cwd,omitempty"`
}

type workspaceRecoveryStore interface {
	Load(scope agentScope, epoch string) (workspaceRecoveryDocument, bool, error)
	Save(scope agentScope, document workspaceRecoveryDocument) error
	MergeActivity(scope agentScope, epoch string, activity workspaceActivityState) error
}

type fileWorkspaceRecoveryStore struct {
	dir string
	mu  sync.Mutex
}

var workspaceRecoveryOperationLocks sync.Map

func workspaceRecoveryOperationLock(scope agentScope) *sync.Mutex {
	value, _ := workspaceRecoveryOperationLocks.LoadOrStore(scope.cacheKey(), &sync.Mutex{})
	return value.(*sync.Mutex)
}

func newFileWorkspaceRecoveryStore(dir string) workspaceRecoveryStore {
	return &fileWorkspaceRecoveryStore{dir: strings.TrimSpace(dir)}
}

func resolveWorkspaceRecoveryDir(fontDir string, rootDir string) string {
	if parent := strings.TrimSpace(filepath.Dir(fontDir)); parent != "" && parent != "." {
		return filepath.Join(parent, "workspaces")
	}
	return filepath.Join(rootDir, ".webshell-data", "workspaces")
}

func (s *fileWorkspaceRecoveryStore) path(scope agentScope) string {
	return filepath.Join(s.dir, scope.hash()+".json")
}

func (s *fileWorkspaceRecoveryStore) Load(scope agentScope, epoch string) (workspaceRecoveryDocument, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked(scope, epoch)
}

func (s *fileWorkspaceRecoveryStore) loadLocked(scope agentScope, epoch string) (workspaceRecoveryDocument, bool, error) {
	epoch = strings.TrimSpace(epoch)
	if epoch == "" || s.dir == "" {
		return workspaceRecoveryDocument{}, false, nil
	}
	file, err := os.Open(s.path(scope))
	if errors.Is(err, os.ErrNotExist) {
		return workspaceRecoveryDocument{}, false, nil
	}
	if err != nil {
		return workspaceRecoveryDocument{}, false, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, workspaceRecoveryMaxBytes+1))
	if err != nil {
		return workspaceRecoveryDocument{}, false, err
	}
	if len(data) > workspaceRecoveryMaxBytes {
		return workspaceRecoveryDocument{}, false, errors.New("workspace recovery file is too large")
	}
	var document workspaceRecoveryDocument
	if err := json.Unmarshal(data, &document); err != nil {
		return workspaceRecoveryDocument{}, false, fmt.Errorf("decode workspace recovery file: %w", err)
	}
	if strings.TrimSpace(document.Epoch) != epoch {
		return workspaceRecoveryDocument{}, false, nil
	}
	if err := validateWorkspaceRecoveryDocument(document); err != nil {
		return workspaceRecoveryDocument{}, false, err
	}
	return document, true, nil
}

func (s *fileWorkspaceRecoveryStore) Save(scope agentScope, document workspaceRecoveryDocument) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(scope, document)
}

func (s *fileWorkspaceRecoveryStore) saveLocked(scope agentScope, document workspaceRecoveryDocument) error {
	if s.dir == "" || strings.TrimSpace(document.Epoch) == "" {
		return nil
	}
	if err := validateWorkspaceRecoveryDocument(document); err != nil {
		return err
	}
	data, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if len(data) > workspaceRecoveryMaxBytes {
		return errors.New("workspace recovery document is too large")
	}
	path := s.path(scope)
	if existing, readErr := os.ReadFile(path); readErr == nil && bytes.Equal(existing, data) {
		return nil
	}
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(s.dir, ".workspace-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

func (s *fileWorkspaceRecoveryStore) MergeActivity(scope agentScope, epoch string, activity workspaceActivityState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	document, found, err := s.loadLocked(scope, epoch)
	if err != nil || !found {
		return err
	}
	panes := make(map[string]*workspaceRecoveryPane)
	for tabIndex := range document.Tabs {
		for paneIndex := range document.Tabs[tabIndex].Panes {
			pane := &document.Tabs[tabIndex].Panes[paneIndex]
			panes[pane.ID] = pane
		}
	}
	changed := false
	for _, summary := range activity.Panes {
		pane := panes[summary.ID]
		cwd := normalizeRecoveryCWD(summary.CWD)
		if pane != nil && cwd != "" && pane.CWD != cwd {
			pane.CWD = cwd
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return s.saveLocked(scope, document)
}

func workspaceRecoveryDocumentFromState(epoch string, state workspaceState) workspaceRecoveryDocument {
	document := workspaceRecoveryDocument{
		Version:             workspaceRecoveryVersion,
		Epoch:               strings.TrimSpace(epoch),
		WorkspaceGeneration: strings.TrimSpace(state.WorkspaceGeneration),
		ActiveTabID:         strings.TrimSpace(state.ActiveTabID),
		RecentTabIDs:        append([]string{}, state.RecentTabIDs...),
		Tabs:                make([]workspaceRecoveryTab, 0, len(state.Tabs)),
	}
	for _, tab := range state.Tabs {
		recoveryTab := workspaceRecoveryTab{
			ID:           strings.TrimSpace(tab.ID),
			Label:        tab.Label,
			CustomLabel:  tab.CustomLabel,
			ActivePaneID: strings.TrimSpace(tab.ActivePaneID),
			Layout:       cloneLayout(tab.Layout),
			Panes:        make([]workspaceRecoveryPane, 0, len(tab.Panes)),
		}
		for _, pane := range tab.Panes {
			recoveryTab.Panes = append(recoveryTab.Panes, workspaceRecoveryPane{
				ID:  strings.TrimSpace(pane.ID),
				CWD: normalizeRecoveryCWD(pane.CWD),
			})
		}
		document.Tabs = append(document.Tabs, recoveryTab)
	}
	return document
}

func normalizeRecoveryCWD(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 4096 || !filepath.IsAbs(value) {
		return ""
	}
	return filepath.Clean(value)
}

func validateWorkspaceRecoveryDocument(document workspaceRecoveryDocument) error {
	if document.Version != workspaceRecoveryVersion {
		return fmt.Errorf("unsupported workspace recovery version %d", document.Version)
	}
	if strings.TrimSpace(document.Epoch) == "" || len(document.Epoch) > 128 {
		return errors.New("invalid workspace recovery epoch")
	}
	if strings.TrimSpace(document.WorkspaceGeneration) == "" || len(document.WorkspaceGeneration) > 128 {
		return errors.New("invalid workspace recovery generation")
	}
	if len(document.Tabs) > workspaceRecoveryMaxTabs {
		return errors.New("invalid workspace recovery tab count")
	}
	if len(document.Tabs) == 0 {
		if document.ActiveTabID != "" || len(document.RecentTabIDs) != 0 {
			return errors.New("invalid empty workspace recovery state")
		}
		return nil
	}
	tabIDs := make(map[string]bool, len(document.Tabs))
	paneIDs := make(map[string]bool)
	for _, tab := range document.Tabs {
		if _, ok := numericWorkspaceID(tab.ID, "tab-"); !ok || tabIDs[tab.ID] {
			return errors.New("invalid or duplicate recovered tab id")
		}
		tabIDs[tab.ID] = true
		if len(tab.Label) > 16<<10 || len(tab.Panes) == 0 || len(paneIDs)+len(tab.Panes) > workspaceRecoveryMaxPanes {
			return errors.New("invalid recovered tab")
		}
		localPaneIDs := make(map[string]bool, len(tab.Panes))
		for _, pane := range tab.Panes {
			if _, ok := numericWorkspaceID(pane.ID, "pane-"); !ok || paneIDs[pane.ID] {
				return errors.New("invalid or duplicate recovered pane id")
			}
			if pane.CWD != "" && normalizeRecoveryCWD(pane.CWD) != pane.CWD {
				return errors.New("invalid recovered working directory")
			}
			paneIDs[pane.ID] = true
			localPaneIDs[pane.ID] = true
		}
		if !localPaneIDs[tab.ActivePaneID] {
			return errors.New("invalid recovered active pane")
		}
		if err := validateRecoveryLayoutDepth(tab.Layout, 0); err != nil {
			return err
		}
		candidate := &terminalTab{PaneIDs: make([]string, 0, len(tab.Panes))}
		for _, pane := range tab.Panes {
			candidate.PaneIDs = append(candidate.PaneIDs, pane.ID)
		}
		if err := validateLayoutForTab(cloneLayout(tab.Layout), candidate); err != nil {
			return fmt.Errorf("invalid recovered layout: %w", err)
		}
	}
	if !tabIDs[document.ActiveTabID] {
		return errors.New("invalid recovered active tab")
	}
	for _, tabID := range document.RecentTabIDs {
		if !tabIDs[tabID] {
			return errors.New("invalid recovered recent tab")
		}
	}
	return nil
}

func validateRecoveryLayoutDepth(node *layoutNode, depth int) error {
	if node == nil || depth > workspaceRecoveryMaxLayoutDepth {
		return errors.New("invalid recovered layout depth")
	}
	for _, child := range node.Children {
		if err := validateRecoveryLayoutDepth(child, depth+1); err != nil {
			return err
		}
	}
	return nil
}

func numericWorkspaceID(value string, prefix string) (int, bool) {
	if !strings.HasPrefix(value, prefix) {
		return 0, false
	}
	number, err := strconv.Atoi(strings.TrimPrefix(value, prefix))
	return number, err == nil && number > 0
}

func newRecoveredTerminalWorkspace(document workspaceRecoveryDocument, selector, username string, historyLimitBytes, cols, rows int) (*terminalWorkspace, error) {
	if err := validateWorkspaceRecoveryDocument(document); err != nil {
		return nil, err
	}
	workspaceGeneration, err := newHistoryGeneration()
	if err != nil {
		return nil, err
	}
	workspace := &terminalWorkspace{
		selector:            selector,
		workspaceGeneration: workspaceGeneration,
		username:            username,
		rootDir:             "/",
		localPTY:            true,
		historyLimitBytes:   historyLimitBytes,
		panes:               make(map[string]*terminalPane),
		nextTabID:           1,
		nextPaneID:          1,
	}
	failed := true
	defer func() {
		if failed {
			workspace.closeAllPanes()
		}
	}()
	for _, recoveredTab := range document.Tabs {
		tab := &terminalTab{
			ID:           recoveredTab.ID,
			Label:        recoveredTab.Label,
			CustomLabel:  recoveredTab.CustomLabel,
			ActivePaneID: recoveredTab.ActivePaneID,
			Layout:       cloneLayout(recoveredTab.Layout),
			PaneIDs:      make([]string, 0, len(recoveredTab.Panes)),
		}
		for _, recoveredPane := range recoveredTab.Panes {
			pane, paneErr := newTerminalPane(workspace, recoveredPane.ID, normalizeCols(cols), normalizeRows(rows), recoveredPane.CWD)
			if paneErr != nil {
				return nil, paneErr
			}
			workspace.panes[pane.id] = pane
			tab.PaneIDs = append(tab.PaneIDs, pane.id)
			if number, ok := numericWorkspaceID(pane.id, "pane-"); ok && number >= workspace.nextPaneID {
				workspace.nextPaneID = number + 1
			}
		}
		workspace.tabs = append(workspace.tabs, tab)
		if number, ok := numericWorkspaceID(tab.ID, "tab-"); ok && number >= workspace.nextTabID {
			workspace.nextTabID = number + 1
		}
	}
	if len(workspace.tabs) == 0 {
		if err := workspace.createTabLocked("", "", normalizeCols(cols), normalizeRows(rows)); err != nil {
			return nil, err
		}
		failed = false
		return workspace, nil
	}
	workspace.activeTab = document.ActiveTabID
	workspace.setRecentTabsLocked(document.RecentTabIDs)
	failed = false
	return workspace, nil
}

func (s *pluginServer) saveWorkspaceRecovery(scope agentScope, epoch string, state workspaceState) {
	if strings.TrimSpace(epoch) == "" || s.workspaceRecovery == nil {
		return
	}
	document := workspaceRecoveryDocumentFromState(epoch, state)
	if err := s.workspaceRecovery.Save(scope, document); err != nil {
		log.Printf("workspace recovery save failed: scope=%s err=%v", scope.Selector, err)
	}
}

func (s *pluginServer) requestWorkspaceStateWithRecovery(ctx context.Context, scope agentScope, cols, rows, terminalScrollback int, epoch string) (workspaceState, error) {
	if s.workspaceRecovery == nil || strings.TrimSpace(epoch) == "" {
		return requestAgentWorkspaceState(ctx, scope, cols, rows, terminalScrollback)
	}
	operationLock := workspaceRecoveryOperationLock(scope)
	operationLock.Lock()
	defer operationLock.Unlock()
	state, version, err := requestAgentWorkspaceStateWithVersion(ctx, scope, cols, rows, terminalScrollback)
	if err != nil {
		return workspaceState{}, err
	}
	document, found, loadErr := s.workspaceRecovery.Load(scope, epoch)
	if loadErr != nil {
		log.Printf("workspace recovery load failed: scope=%s err=%v", scope.Selector, loadErr)
		found = false
	}
	if found && document.WorkspaceGeneration != state.WorkspaceGeneration {
		if !isCurrentAgentProtocolVersion(version) {
			return workspaceState{}, &unsupportedAgentProtocolError{version: version}
		}
		state, err = requestAgentWorkspaceRestore(ctx, scope, cols, rows, terminalScrollback, document)
		if err != nil {
			return workspaceState{}, err
		}
	}
	s.saveWorkspaceRecovery(scope, epoch, state)
	return state, nil
}

func (s *pluginServer) requestWorkspaceActionWithRecovery(ctx context.Context, scope agentScope, cols, rows, terminalScrollback int, epoch string, action workspaceActionRequest) (workspaceState, error) {
	if s.workspaceRecovery == nil || strings.TrimSpace(epoch) == "" {
		return requestAgentWorkspaceAction(ctx, scope, cols, rows, terminalScrollback, action)
	}
	operationLock := workspaceRecoveryOperationLock(scope)
	operationLock.Lock()
	defer operationLock.Unlock()
	document, found, loadErr := s.workspaceRecovery.Load(scope, epoch)
	if loadErr != nil {
		log.Printf("workspace recovery load before action failed: scope=%s err=%v", scope.Selector, loadErr)
		found = false
	}
	state, version, err := requestAgentWorkspaceActionWithVersion(ctx, scope, cols, rows, terminalScrollback, action)
	if err != nil {
		return workspaceState{}, err
	}
	if found && document.WorkspaceGeneration != state.WorkspaceGeneration {
		if !isCurrentAgentProtocolVersion(version) {
			return workspaceState{}, &unsupportedAgentProtocolError{version: version}
		}
		if _, err := requestAgentWorkspaceRestore(ctx, scope, cols, rows, terminalScrollback, document); err != nil {
			return workspaceState{}, err
		}
		state, _, err = requestAgentWorkspaceActionWithVersion(ctx, scope, cols, rows, terminalScrollback, action)
		if err != nil {
			return workspaceState{}, err
		}
	}
	s.saveWorkspaceRecovery(scope, epoch, state)
	return state, nil
}

func (s *pluginServer) mergeWorkspaceRecoveryActivity(scope agentScope, epoch string, activity workspaceActivityState) {
	if strings.TrimSpace(epoch) == "" || s.workspaceRecovery == nil {
		return
	}
	if err := s.workspaceRecovery.MergeActivity(scope, epoch, activity); err != nil {
		log.Printf("workspace recovery activity merge failed: scope=%s err=%v", scope.Selector, err)
	}
}

func (s *pluginServer) requestWorkspaceActivityWithRecovery(ctx context.Context, scope agentScope, cols, rows, terminalScrollback int, epoch string) (workspaceActivityState, error) {
	if s.workspaceRecovery == nil || strings.TrimSpace(epoch) == "" {
		return requestAgentWorkspaceActivity(ctx, scope, cols, rows, terminalScrollback)
	}
	operationLock := workspaceRecoveryOperationLock(scope)
	operationLock.Lock()
	defer operationLock.Unlock()
	activity, err := requestAgentWorkspaceActivity(ctx, scope, cols, rows, terminalScrollback)
	if err != nil {
		return workspaceActivityState{}, err
	}
	s.mergeWorkspaceRecoveryActivity(scope, epoch, activity)
	return activity, nil
}
