package core

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"lcmd-webshell/internal/pkg/fonts"
	"strconv"
	"strings"
)

const (
	defaultTerminalCols        = 120
	defaultTerminalRows        = 32
	averageHistoryBytesPerLine = 350
	historyChunkMaxBytes       = 32 << 10
	clientQueueLimit           = 8 << 20
	historyReplayChunk         = 512 << 10
	WebsocketReadLimit         = 10 << 20
	terminalPTYInputChunkBytes = 16 << 10
)

var errTerminalPaneClosing = errors.New("pane is closing")

type paneExitSnapshot struct {
	exited   bool
	exitCode int
	message  string
	retained bool
}

func (e paneExitSnapshot) controlPayload(selector, paneID string) map[string]any {
	payload := map[string]any{
		"type":          "process-exit",
		"exit_code":     e.exitCode,
		"authoritative": true,
		"selector":      selector,
		"pane_id":       paneID,
		"retained":      e.retained,
	}
	if e.message != "" {
		payload["message"] = e.message
	}
	return payload
}

func parseTerminalResizeEpoch(value string) (uint64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	epoch, err := strconv.ParseUint(value, 10, 64)
	if err != nil || epoch == 0 {
		return 0, false
	}
	return epoch, true
}

func formatTerminalResizeEpoch(epoch uint64) string {
	if epoch == 0 {
		return ""
	}
	return strconv.FormatUint(epoch, 10)
}

func (w *terminalWorkspace) snapshot() WorkspaceState {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.refreshAutoTabLabelsLocked()
	w.pruneRecentTabsLocked()

	state := WorkspaceState{
		Selector:            w.selector,
		WorkspaceGeneration: w.workspaceGeneration,
		ActiveTabID:         w.activeTab,
		RecentTabIDs:        append([]string{}, w.recentTabs...),
		Tabs:                make([]tabState, 0, len(w.tabs)),
	}
	for _, tab := range w.tabs {
		nextTab := tabState{
			ID:           tab.ID,
			Label:        tab.Label,
			CustomLabel:  tab.CustomLabel,
			ActivePaneID: tab.ActivePaneID,
			Layout:       cloneLayout(tab.Layout),
			Panes:        make([]paneSummary, 0, len(tab.PaneIDs)),
		}
		for _, paneID := range tab.PaneIDs {
			if pane := w.panes[paneID]; pane != nil {
				nextTab.Panes = append(nextTab.Panes, pane.summary())
			}
		}
		state.Tabs = append(state.Tabs, nextTab)
	}
	return state
}

func (w *terminalWorkspace) appendRecentTabLocked(items []string, tabID string) []string {
	tabID = strings.TrimSpace(tabID)
	if tabID == "" || w.findTabLocked(tabID) == nil {
		return items
	}
	for _, item := range items {
		if item == tabID {
			return items
		}
	}
	return append(items, tabID)
}

func (w *terminalWorkspace) pruneRecentTabsLocked() {
	next := make([]string, 0, 2)
	for _, tabID := range w.recentTabs {
		next = w.appendRecentTabLocked(next, tabID)
		if len(next) >= 2 {
			break
		}
	}
	w.recentTabs = next
}

func (w *terminalWorkspace) setRecentTabsLocked(tabIDs []string) {
	next := make([]string, 0, 2)
	for _, tabID := range tabIDs {
		next = w.appendRecentTabLocked(next, tabID)
		if len(next) >= 2 {
			break
		}
	}
	w.recentTabs = next
}

func (w *terminalWorkspace) rememberRecentTabLocked(tabID string) {
	tabID = strings.TrimSpace(tabID)
	if tabID == "" || w.findTabLocked(tabID) == nil {
		w.pruneRecentTabsLocked()
		return
	}

	next := make([]string, 0, 2)
	for _, candidate := range append([]string{tabID, w.activeTab}, w.recentTabs...) {
		next = w.appendRecentTabLocked(next, candidate)
		if len(next) >= 2 {
			break
		}
	}
	w.recentTabs = next
}

func (w *terminalWorkspace) setActiveTabLocked(tabID string) {
	tabID = strings.TrimSpace(tabID)
	if tabID == "" {
		w.activeTab = ""
		w.pruneRecentTabsLocked()
		return
	}
	if w.findTabLocked(tabID) == nil {
		w.pruneRecentTabsLocked()
		return
	}
	w.rememberRecentTabLocked(tabID)
	w.activeTab = tabID
}

func (w *terminalWorkspace) newPaneLocked(cols, rows int, initialCWD string) (*terminalPane, error) {
	paneID := w.nextPaneIDStringLocked()
	pane, err := newTerminalPane(w, paneID, cols, rows, initialCWD)
	if err != nil {
		return nil, err
	}
	w.panes[pane.id] = pane
	return pane, nil
}

func (w *terminalWorkspace) nextTabIDStringLocked() string {
	id := fmt.Sprintf("tab-%d", w.nextTabID)
	w.nextTabID++
	return id
}

func (w *terminalWorkspace) nextPaneIDStringLocked() string {
	id := fmt.Sprintf("pane-%d", w.nextPaneID)
	w.nextPaneID++
	return id
}

func (w *terminalWorkspace) resolveSourcePaneCWDLocked(tabID, paneID string) string {
	sourcePaneID := strings.TrimSpace(paneID)
	if sourcePaneID == "" {
		tab := w.findTabLocked(tabID)
		if tab == nil {
			tab = w.findTabLocked(w.activeTab)
		}
		if tab == nil {
			return ""
		}
		sourcePaneID = strings.TrimSpace(tab.ActivePaneID)
	}
	pane := w.panes[sourcePaneID]
	if pane == nil {
		return ""
	}
	pane.mu.Lock()
	defer pane.mu.Unlock()
	return pane.cwd
}

func (w *terminalWorkspace) retainFailedFinalPane(paneID string, exitCode int) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, tab := range w.tabs {
		if tab.hasPane(paneID) {
			// Keep an abnormally exited final pane as a stable failure result. If it
			// were removed, ensureWorkspaceLocked would create another default pane
			// on the next state request and a startup failure would oscillate forever.
			if exitCode != 0 && len(w.tabs) == 1 && len(tab.PaneIDs) == 1 {
				if pane := w.panes[paneID]; pane != nil {
					pane.mu.Lock()
					pane.exitRetained = true
					pane.mu.Unlock()
				}
				return true
			}
			return false
		}
	}
	return false
}

func (w *terminalWorkspace) removePaneAfterExit(paneID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, tab := range w.tabs {
		if tab.hasPane(paneID) {
			_ = w.closePaneInTabLocked(tab, paneID)
			return
		}
	}
}

func (w *terminalWorkspace) closeAllPanes() {
	w.mu.Lock()
	panes := make([]*terminalPane, 0, len(w.panes))
	for _, pane := range w.panes {
		panes = append(panes, pane)
	}
	w.panes = make(map[string]*terminalPane)
	w.tabs = nil
	w.activeTab = ""
	w.recentTabs = nil
	w.mu.Unlock()

	for _, pane := range panes {
		pane.close()
	}
}

func (w *terminalWorkspace) getPane(paneID string) *terminalPane {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.panes[paneID]
}

type terminalReplayIdentity struct {
	selector            string
	workspaceGeneration string
	tabID               string
	paneID              string
}

func (w *terminalWorkspace) paneForAttach(paneID string, syncRequest HistorySyncRequest) (*terminalPane, terminalReplayIdentity, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	identity := terminalReplayIdentity{
		selector:            w.selector,
		workspaceGeneration: w.workspaceGeneration,
		paneID:              paneID,
	}
	if syncRequest.WorkspaceGeneration != "" && syncRequest.WorkspaceGeneration != w.workspaceGeneration {
		return nil, identity, errors.New("workspace generation mismatch")
	}
	pane := w.panes[paneID]
	if pane == nil {
		return nil, identity, errors.New("pane not found")
	}
	for _, tab := range w.tabs {
		if tab.hasPane(paneID) {
			identity.tabID = tab.ID
			return pane, identity, nil
		}
	}
	return nil, identity, errors.New("pane tab not found")
}

func (w *terminalWorkspace) setHistoryLimitBytes(limit int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.setHistoryLimitBytesLocked(limit)
}

func (w *terminalWorkspace) setHistoryLimitBytesLocked(limit int) {
	if limit <= 0 {
		limit = historyLimitBytesForTerminalScrollback(fonts.DefaultTerminalScrollback)
	}
	w.historyLimitBytes = limit
	for _, pane := range w.panes {
		pane.mu.Lock()
		if pane.closing {
			pane.mu.Unlock()
			continue
		}
		pane.historyLimitBytes = limit
		pane.trimHistoryLocked()
		pane.resizeCheckpointLocked(pane.cols, pane.rows, limit/averageHistoryBytesPerLine)
		pane.mu.Unlock()
	}
}

func (w *terminalWorkspace) findTabLocked(tabID string) *terminalTab {
	_, tab := w.findTabIndexLocked(tabID)
	return tab
}

func (w *terminalWorkspace) findTabIndexLocked(tabID string) (int, *terminalTab) {
	for index, tab := range w.tabs {
		if tab.ID == tabID {
			return index, tab
		}
	}
	return -1, nil
}

func (t *terminalTab) hasPane(paneID string) bool {
	for _, id := range t.PaneIDs {
		if id == paneID {
			return true
		}
	}
	return false
}

func (t *terminalTab) removePane(paneID string) {
	next := t.PaneIDs[:0]
	for _, id := range t.PaneIDs {
		if id != paneID {
			next = append(next, id)
		}
	}
	t.PaneIDs = next
}

func NewHistoryGeneration() (string, error) {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return hex.EncodeToString(data), nil
}
