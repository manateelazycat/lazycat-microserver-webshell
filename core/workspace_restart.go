package core

import (
	"errors"
)

// Explicit recovery replaces only an exited pane. A fresh identity also lets
// other windows retire their retained error state through membership sync.
func (w *terminalWorkspace) restartExitedPaneLocked(tabID, paneID string, cols, rows int) error {
	tab := w.findTabLocked(tabID)
	old := w.panes[paneID]
	if tab == nil || old == nil || !tab.hasPane(paneID) {
		return errors.New("terminal to restart no longer exists")
	}
	old.mu.Lock()
	exited := old.exited
	cwd := old.cwd
	old.mu.Unlock()
	if !exited {
		return errors.New("only an exited terminal can be recreated")
	}
	pane, err := w.newPaneLocked(cols, rows, cwd)
	if err != nil {
		return err
	}
	for index, id := range tab.PaneIDs {
		if id == paneID {
			tab.PaneIDs[index] = pane.id
		}
	}
	var replace func(*layoutNode)
	replace = func(node *layoutNode) {
		if node == nil {
			return
		}
		if node.Type == "leaf" && node.PaneID == paneID {
			node.PaneID = pane.id
		}
		for _, child := range node.Children {
			replace(child)
		}
	}
	replace(tab.Layout)
	if tab.ActivePaneID == paneID {
		tab.ActivePaneID = pane.id
	}
	delete(w.panes, paneID)
	old.close()
	w.setActiveTabLocked(tab.ID)
	return nil
}
