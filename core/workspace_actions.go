package core

import (
	"errors"
	"fmt"
	"strings"
)

func (w *terminalWorkspace) applyAction(request WorkspaceActionRequest) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	switch request.Action {
	case "create_tab":
		return w.createTabLocked(request.TabID, request.PaneID, NormalizeCols(request.Cols), NormalizeRows(request.Rows))
	case "rename_tab":
		return w.renameTabLocked(request.TabID, request.Label)
	case "close_tab":
		return w.closeTabLocked(request.TabID)
	case "close_other_tabs":
		return w.closeOtherTabsLocked(request.TabID)
	case "split_pane":
		return w.splitPaneLocked(request.TabID, request.PaneID, request.Direction, NormalizeCols(request.Cols), NormalizeRows(request.Rows))
	case "close_pane":
		return w.closePaneLocked(request.TabID, request.PaneID)
	case "restart_pane":
		return w.restartExitedPaneLocked(request.TabID, request.PaneID, NormalizeCols(request.Cols), NormalizeRows(request.Rows))
	case "move_pane_to_tab":
		return w.movePaneToTabLocked(request.TabID, request.PaneID)
	case "move_tab":
		return w.moveTabLocked(request.TabID, request.Position)
	case "reorder_tab":
		return w.reorderTabLocked(request.TabID, request.BeforeTabID)
	case "activate_tab":
		return w.activateTabLocked(request.TabID, request.RecentTabIDs)
	case "activate_pane":
		return w.activatePaneLocked(request.TabID, request.PaneID)
	case "update_layout":
		return w.updateLayoutLocked(request.TabID, request.Layout, request.ActivePaneID)
	default:
		return errors.New("unknown workspace action")
	}
}

func (w *terminalWorkspace) createTabLocked(sourceTabID, sourcePaneID string, cols, rows int) error {
	initialCWD := w.resolveSourcePaneCWDLocked(sourceTabID, sourcePaneID)
	pane, err := w.newPaneLocked(cols, rows, initialCWD)
	if err != nil {
		return err
	}
	tabID := w.nextTabIDStringLocked()
	label := displayPathLabel(initialCWD)
	if label == "" {
		label = fmt.Sprintf("Shell %d", w.nextTabID-1)
	}
	tab := &terminalTab{
		ID:           tabID,
		Label:        label,
		ActivePaneID: pane.id,
		Layout:       &layoutNode{Type: "leaf", PaneID: pane.id},
		PaneIDs:      []string{pane.id},
	}
	w.insertTabAfterSourceLocked(tab, sourceTabID)
	w.setActiveTabLocked(tab.ID)
	return nil
}

func (w *terminalWorkspace) insertTabAfterSourceLocked(tab *terminalTab, sourceTabID string) {
	insertAt := len(w.tabs)
	sourceFound := false
	sourceTabID = strings.TrimSpace(sourceTabID)
	if sourceTabID != "" {
		if index, sourceTab := w.findTabIndexLocked(sourceTabID); sourceTab != nil {
			insertAt = index + 1
			sourceFound = true
		}
	}
	if !sourceFound {
		if index, activeTab := w.findTabIndexLocked(w.activeTab); activeTab != nil {
			insertAt = index + 1
		}
	}
	if insertAt >= len(w.tabs) {
		w.tabs = append(w.tabs, tab)
		return
	}
	w.tabs = append(w.tabs, nil)
	copy(w.tabs[insertAt+1:], w.tabs[insertAt:])
	w.tabs[insertAt] = tab
}

func (w *terminalWorkspace) renameTabLocked(tabID, label string) error {
	tab := w.findTabLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	label = strings.TrimSpace(label)
	if label == "" {
		return errors.New("label is required")
	}
	tab.Label = label
	tab.CustomLabel = true
	return nil
}

func (w *terminalWorkspace) closeTabLocked(tabID string) error {
	index, tab := w.findTabIndexLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	for _, paneID := range tab.PaneIDs {
		if pane := w.panes[paneID]; pane != nil {
			delete(w.panes, paneID)
			pane.close()
		}
	}
	w.tabs = append(w.tabs[:index], w.tabs[index+1:]...)
	if w.activeTab == tabID {
		nextActiveTab := ""
		if len(w.tabs) > 0 {
			nextActiveTab = w.tabs[min(index, len(w.tabs)-1)].ID
		}
		w.setActiveTabLocked(nextActiveTab)
	} else {
		w.pruneRecentTabsLocked()
	}
	return nil
}

func (w *terminalWorkspace) closeOtherTabsLocked(tabID string) error {
	if w.findTabLocked(tabID) == nil {
		return errors.New("tab not found")
	}
	for i := len(w.tabs) - 1; i >= 0; i-- {
		if w.tabs[i].ID != tabID {
			if err := w.closeTabLocked(w.tabs[i].ID); err != nil {
				return err
			}
		}
	}
	w.setActiveTabLocked(tabID)
	return nil
}

func (w *terminalWorkspace) splitPaneLocked(tabID, paneID, direction string, cols, rows int) error {
	tab := w.findTabLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	if !tab.hasPane(paneID) {
		return errors.New("pane not found")
	}
	if direction != "vertical" && direction != "horizontal" {
		return errors.New("invalid split direction")
	}
	initialCWD := w.resolveSourcePaneCWDLocked(tabID, paneID)
	pane, err := w.newPaneLocked(cols, rows, initialCWD)
	if err != nil {
		return err
	}
	if !splitLayoutNode(tab.Layout, paneID, direction, pane.id) {
		tab.Layout = &layoutNode{
			Type:      "split",
			Direction: direction,
			Children: []*layoutNode{
				{Type: "leaf", PaneID: paneID, Size: 50},
				{Type: "leaf", PaneID: pane.id, Size: 50},
			},
		}
	}
	tab.PaneIDs = append(tab.PaneIDs, pane.id)
	tab.ActivePaneID = pane.id
	w.setActiveTabLocked(tab.ID)
	return nil
}

func (w *terminalWorkspace) closePaneLocked(tabID, paneID string) error {
	tab := w.findTabLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	return w.closePaneInTabLocked(tab, paneID)
}

func (w *terminalWorkspace) closePaneInTabLocked(tab *terminalTab, paneID string) error {
	if !tab.hasPane(paneID) {
		return errors.New("pane not found")
	}
	nextActivePaneID := tab.ActivePaneID
	if tab.ActivePaneID == paneID {
		nextActivePaneID, _ = adjacentPaneID(tab.Layout, paneID)
	}
	if pane := w.panes[paneID]; pane != nil {
		delete(w.panes, paneID)
		pane.close()
	}
	tab.removePane(paneID)
	tab.Layout = removePaneFromLayoutNode(tab.Layout, paneID)
	paneIDs := collectLayoutPaneIDs(tab.Layout, nil)
	tab.ActivePaneID = firstExistingPaneID(nextActivePaneID, paneIDs)
	if tab.ActivePaneID == "" && len(paneIDs) > 0 {
		tab.ActivePaneID = paneIDs[0]
	}
	if len(tab.PaneIDs) == 0 || tab.Layout == nil {
		return w.closeTabLocked(tab.ID)
	}
	return nil
}

func (w *terminalWorkspace) movePaneToTabLocked(tabID, paneID string) error {
	source := w.findTabLocked(tabID)
	if source == nil {
		return errors.New("tab not found")
	}
	if len(source.PaneIDs) <= 1 {
		return errors.New("cannot move the last pane")
	}
	if !source.hasPane(paneID) {
		return errors.New("pane not found")
	}
	nextActivePaneID := source.ActivePaneID
	if source.ActivePaneID == paneID {
		nextActivePaneID, _ = adjacentPaneID(source.Layout, paneID)
	}
	source.removePane(paneID)
	source.Layout = removePaneFromLayoutNode(source.Layout, paneID)
	sourcePaneIDs := collectLayoutPaneIDs(source.Layout, nil)
	source.ActivePaneID = firstExistingPaneID(nextActivePaneID, sourcePaneIDs)
	if source.ActivePaneID == "" && len(sourcePaneIDs) > 0 {
		source.ActivePaneID = sourcePaneIDs[0]
	}

	tabIDNext := w.nextTabIDStringLocked()
	tab := &terminalTab{
		ID:           tabIDNext,
		Label:        fmt.Sprintf("%s %d", source.Label, len(w.tabs)+1),
		ActivePaneID: paneID,
		Layout:       &layoutNode{Type: "leaf", PaneID: paneID},
		PaneIDs:      []string{paneID},
	}
	w.insertTabAfterSourceLocked(tab, source.ID)
	w.setActiveTabLocked(tab.ID)
	return nil
}

func (w *terminalWorkspace) moveTabLocked(tabID, position string) error {
	index, tab := w.findTabIndexLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	if len(w.tabs) <= 1 {
		return nil
	}
	target := index
	switch position {
	case "first":
		target = 0
	case "left":
		target = max(0, index-1)
	case "right":
		target = min(len(w.tabs)-1, index+1)
	case "last":
		target = len(w.tabs) - 1
	default:
		return errors.New("invalid tab position")
	}
	if target == index {
		return nil
	}
	w.tabs = append(w.tabs[:index], w.tabs[index+1:]...)
	w.tabs = append(w.tabs[:target], append([]*terminalTab{tab}, w.tabs[target:]...)...)
	w.setActiveTabLocked(tab.ID)
	return nil
}

func (w *terminalWorkspace) reorderTabLocked(tabID, beforeTabID string) error {
	index, tab := w.findTabIndexLocked(strings.TrimSpace(tabID))
	if tab == nil {
		return errors.New("tab not found")
	}
	beforeTabID = strings.TrimSpace(beforeTabID)
	if beforeTabID == tab.ID {
		return errors.New("tab cannot be ordered before itself")
	}
	if beforeTabID != "" && w.findTabLocked(beforeTabID) == nil {
		return errors.New("before tab not found")
	}

	w.tabs = append(w.tabs[:index], w.tabs[index+1:]...)
	if beforeTabID == "" {
		w.tabs = append(w.tabs, tab)
		return nil
	}
	target, _ := w.findTabIndexLocked(beforeTabID)
	w.tabs = append(w.tabs, nil)
	copy(w.tabs[target+1:], w.tabs[target:])
	w.tabs[target] = tab
	return nil
}

func (w *terminalWorkspace) activateTabLocked(tabID string, recentTabIDs []string) error {
	tab := w.findTabLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	if recentTabIDs != nil {
		w.setRecentTabsLocked(append([]string{tab.ID}, recentTabIDs...))
		w.activeTab = tab.ID
	} else {
		w.setActiveTabLocked(tab.ID)
	}
	return nil
}

func (w *terminalWorkspace) activatePaneLocked(tabID, paneID string) error {
	tab := w.findTabLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	if !tab.hasPane(paneID) {
		return errors.New("pane not found")
	}
	tab.ActivePaneID = paneID
	w.setActiveTabLocked(tab.ID)
	return nil
}

func (w *terminalWorkspace) updateLayoutLocked(tabID string, layout *layoutNode, activePaneID string) error {
	tab := w.findTabLocked(tabID)
	if tab == nil {
		return errors.New("tab not found")
	}
	if layout == nil {
		return errors.New("layout is required")
	}
	normalized := cloneLayout(layout)
	if err := validateLayoutForTab(normalized, tab); err != nil {
		return err
	}
	tab.Layout = normalized
	if activePaneID != "" {
		if !tab.hasPane(activePaneID) {
			return errors.New("active pane not found")
		}
		tab.ActivePaneID = activePaneID
	}
	return nil
}
