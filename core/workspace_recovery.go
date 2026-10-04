package core

import (
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	workspaceRecoveryVersion        = 1
	WorkspaceRecoveryMaxBytes       = 1 << 20
	workspaceRecoveryMaxTabs        = 64
	workspaceRecoveryMaxPanes       = 256
	workspaceRecoveryMaxLayoutDepth = 32
)

type WorkspaceRecoveryDocument struct {
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
	Panes        []WorkspaceRecoveryPane `json:"panes"`
}

type WorkspaceRecoveryPane struct {
	ID  string `json:"id"`
	CWD string `json:"cwd,omitempty"`
}

func WorkspaceRecoveryDocumentFromState(epoch string, state WorkspaceState) WorkspaceRecoveryDocument {
	document := WorkspaceRecoveryDocument{
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
			Panes:        make([]WorkspaceRecoveryPane, 0, len(tab.Panes)),
		}
		for _, pane := range tab.Panes {
			recoveryTab.Panes = append(recoveryTab.Panes, WorkspaceRecoveryPane{
				ID:  strings.TrimSpace(pane.ID),
				CWD: NormalizeRecoveryCWD(pane.CWD),
			})
		}
		document.Tabs = append(document.Tabs, recoveryTab)
	}
	return document
}

func NormalizeRecoveryCWD(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 4096 || strings.IndexByte(value, 0) >= 0 {
		return ""
	}
	// A Linux Provider can persist a Windows client's native CWD. Preserve that
	// spelling here; the receiving platform validates/canonicalizes it again.
	if !filepath.IsAbs(value) {
		drive := len(value) >= 3 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= 'a' && value[0] <= 'z')) && value[1] == ':' && (value[2] == '\\' || value[2] == '/')
		if drive || strings.HasPrefix(value, `\\`) {
			return value
		}
		return ""
	}
	return filepath.Clean(value)
}

func ValidateWorkspaceRecoveryDocument(document WorkspaceRecoveryDocument) error {
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
			if pane.CWD != "" && NormalizeRecoveryCWD(pane.CWD) != pane.CWD {
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

func newRecoveredTerminalWorkspace(runtime *Runtime, document WorkspaceRecoveryDocument, selector, username string, historyLimitBytes, cols, rows int) (*terminalWorkspace, error) {
	if err := ValidateWorkspaceRecoveryDocument(document); err != nil {
		return nil, err
	}
	workspaceGeneration, err := NewHistoryGeneration()
	if err != nil {
		return nil, err
	}
	workspace := &terminalWorkspace{
		selector:            selector,
		runtime:             runtime,
		workspaceGeneration: workspaceGeneration,
		username:            username,
		rootDir:             runtime.platform.DefaultWorkingDirectory(),
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
			pane, paneErr := newTerminalPane(workspace, recoveredPane.ID, NormalizeCols(cols), NormalizeRows(rows), recoveredPane.CWD)
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
		if err := workspace.createTabLocked("", "", NormalizeCols(cols), NormalizeRows(rows)); err != nil {
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
