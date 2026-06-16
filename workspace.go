package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"lcmd-webshell/internal/pkg/fonts"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

const (
	defaultTerminalCols = 120
	defaultTerminalRows = 32

	averageHistoryBytesPerLine = 350
	historyChunkMaxBytes       = 32 << 10
	clientQueueLimit           = 8 << 20
	historyReplayChunk         = 256 << 10
	websocketReadLimit         = 10 << 20
	terminalPTYInputChunkBytes = 16 << 10
)

type workspaceManager struct {
	rootDir string

	mu         sync.Mutex
	workspaces map[string]*terminalWorkspace
}

type terminalWorkspace struct {
	manager           *workspaceManager
	selector          string
	username          string
	rootDir           string
	localPTY          bool
	historyLimitBytes int

	mu         sync.Mutex
	tabs       []*terminalTab
	activeTab  string
	recentTabs []string
	panes      map[string]*terminalPane
	nextTabID  int
	nextPaneID int
}

type terminalTab struct {
	ID           string
	Label        string
	CustomLabel  bool
	ActivePaneID string
	Layout       *layoutNode
	PaneIDs      []string
}

type layoutNode struct {
	Type      string        `json:"type"`
	Direction string        `json:"direction,omitempty"`
	PaneID    string        `json:"paneId,omitempty"`
	Children  []*layoutNode `json:"children,omitempty"`
	Size      float64       `json:"size,omitempty"`
}

type terminalPane struct {
	workspace *terminalWorkspace
	id        string
	selector  string
	rootDir   string

	mu                         sync.Mutex
	writeMu                    sync.Mutex
	cmd                        *exec.Cmd
	ptyFile                    *os.File
	clients                    map[*paneClient]struct{}
	history                    paneHistory
	historyLimitBytes          int
	cols                       int
	rows                       int
	tty                        string
	busy                       bool
	command                    string
	commandLine                string
	cwd                        string
	activityCheckedAt          time.Time
	controlPending             []byte
	terminalQueryPending       []byte
	pendingGeneratedInputs     map[string]int
	pendingCursorReports       int
	pendingCursorReportUntil   time.Time
	generatedEchoPending       []terminalGeneratedEcho
	generatedEchoOutputPending []byte
	hasAttached                bool
	inputBlockers              map[string]struct{}
	exited                     bool
	exitCode                   int
	exitText                   string
	done                       chan struct{}
}

type paneClient struct {
	send chan paneOutbound
	done chan struct{}
	once sync.Once

	mu          sync.Mutex
	queuedBytes int
}

type paneOutbound struct {
	messageType int
	payload     []byte
	closeAfter  bool
}

type paneHistory struct {
	chunks [][]byte
	bytes  int
}

type paneHistorySnapshot struct {
	chunks [][]byte
}

type workspaceState struct {
	Selector       string     `json:"selector"`
	ServerRevision string     `json:"server_revision,omitempty"`
	AgentNotice    string     `json:"agent_notice,omitempty"`
	ActiveTabID    string     `json:"active_tab_id"`
	RecentTabIDs   []string   `json:"recent_tab_ids"`
	Tabs           []tabState `json:"tabs"`
}

type tabState struct {
	ID           string        `json:"id"`
	Label        string        `json:"label"`
	CustomLabel  bool          `json:"custom_label"`
	ActivePaneID string        `json:"active_pane_id"`
	Layout       *layoutNode   `json:"layout"`
	Panes        []paneSummary `json:"panes"`
}

type paneSummary struct {
	ID                string `json:"id"`
	Cols              int    `json:"cols"`
	Rows              int    `json:"rows"`
	TTY               string `json:"tty,omitempty"`
	Busy              bool   `json:"busy"`
	Command           string `json:"command,omitempty"`
	CommandLine       string `json:"command_line,omitempty"`
	CWD               string `json:"cwd,omitempty"`
	ActivityCheckedAt int64  `json:"activity_checked_at,omitempty"`
	Exited            bool   `json:"exited"`
	ExitCode          int    `json:"exit_code"`
}

type workspaceActionRequest struct {
	Action       string      `json:"action"`
	TabID        string      `json:"tab_id"`
	PaneID       string      `json:"pane_id"`
	RecentTabIDs []string    `json:"recent_tab_ids,omitempty"`
	Direction    string      `json:"direction"`
	Label        string      `json:"label"`
	Layout       *layoutNode `json:"layout"`
	ActivePaneID string      `json:"active_pane_id"`
	Cols         int         `json:"cols"`
	Rows         int         `json:"rows"`
	Position     string      `json:"position"`
}

type workspaceActivityState struct {
	Selector       string        `json:"selector"`
	ServerRevision string        `json:"server_revision,omitempty"`
	Panes          []paneSummary `json:"panes"`
	Error          string        `json:"error,omitempty"`
}

type terminalControlMessage struct {
	Type      string `json:"type"`
	Cols      int    `json:"cols"`
	Rows      int    `json:"rows"`
	Data      string `json:"data"`
	Blocked   bool   `json:"blocked,omitempty"`
	Generated bool   `json:"generated,omitempty"`
}

func newWorkspaceManager(rootDir string) *workspaceManager {
	return &workspaceManager{
		rootDir:    rootDir,
		workspaces: make(map[string]*terminalWorkspace),
	}
}

func historyLimitBytesForTerminalScrollback(scrollback int) int {
	if err := fonts.ValidateTerminalScrollback(scrollback); err != nil {
		scrollback = fonts.DefaultTerminalScrollback
	}
	return scrollback * averageHistoryBytesPerLine
}

func (m *workspaceManager) getOrCreate(ctx context.Context, selector string, cols, rows int) (*terminalWorkspace, error) {
	if err := validateInstanceSelector(selector); err != nil {
		return nil, err
	}
	m.mu.Lock()
	if workspace := m.workspaces[selector]; workspace != nil {
		m.mu.Unlock()
		return workspace, nil
	}
	m.mu.Unlock()

	username, err := resolveInstanceLoginUser(ctx, selector)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if workspace := m.workspaces[selector]; workspace != nil {
		return workspace, nil
	}
	workspace := &terminalWorkspace{
		manager:           m,
		selector:          selector,
		username:          username,
		rootDir:           m.rootDir,
		historyLimitBytes: historyLimitBytesForTerminalScrollback(fonts.DefaultTerminalScrollback),
		panes:             make(map[string]*terminalPane),
		nextTabID:         1,
		nextPaneID:        1,
	}
	if err := workspace.createTabLocked("", "", normalizeCols(cols), normalizeRows(rows)); err != nil {
		return nil, err
	}
	m.workspaces[selector] = workspace
	return workspace, nil
}

func (m *workspaceManager) closeAll() {
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

func (s *pluginServer) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if isClientTarget(selector) {
		cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
		s.handleClientWorkspace(w, r, accountID, selector, cols, rows)
		return
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return
	}
	scope := normalizeAgentScope(selector, accountID)
	cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))

	switch r.Method {
	case http.MethodGet:
		state, err := requestAgentWorkspaceState(r.Context(), scope, cols, rows, s.currentTerminalScrollback())
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		state.ServerRevision = s.serverRevision
		state.AgentNotice = consumePersistentAgentNotice(scope)
		writeJSON(w, state)
	case http.MethodPost:
		var request workspaceActionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		state, err := requestAgentWorkspaceAction(r.Context(), scope, cols, rows, s.currentTerminalScrollback(), request)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		state.ServerRevision = s.serverRevision
		state.AgentNotice = consumePersistentAgentNotice(scope)
		writeJSON(w, state)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *pluginServer) handleWorkspaceActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if isClientTarget(selector) {
		cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
		s.handleClientWorkspaceActivity(w, r, accountID, selector, cols, rows)
		return
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return
	}
	scope := normalizeAgentScope(selector, accountID)
	cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
	state, err := requestAgentWorkspaceActivity(r.Context(), scope, cols, rows, s.currentTerminalScrollback())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	state.ServerRevision = s.serverRevision
	writeJSON(w, state)
}

func (s *pluginServer) attachPersistentPane(w http.ResponseWriter, r *http.Request, cols, rows int) error {
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	paneID := strings.TrimSpace(r.URL.Query().Get("pane"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return nil
	}
	if paneID == "" {
		http.Error(w, "pane is required", http.StatusBadRequest)
		return nil
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return nil
	}
	if isClientTarget(selector) {
		return s.attachClientPane(w, r, accountID, selector, paneID, cols, rows)
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return nil
	}
	return s.attachAgentPane(w, r, normalizeAgentScope(selector, accountID), paneID, cols, rows, s.currentTerminalScrollback())
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func writeWebSocketJSON(conn *websocket.Conn, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_ = conn.SetWriteDeadline(time.Now().Add(websocketWriteTimeout))
	err = conn.WriteMessage(websocket.TextMessage, data)
	_ = conn.SetWriteDeadline(time.Time{})
	return err
}

func handleTerminalControlMessage(pane *terminalPane, payload []byte, client *paneClient) bool {
	var message terminalControlMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		if data, ok := strings.CutPrefix(string(payload), "input:"); ok {
			_ = pane.writeInput([]byte(data))
			return true
		}
		return true
	}
	switch message.Type {
	case "input":
		if message.Data != "" {
			if message.Generated {
				_ = pane.writeGeneratedInput([]byte(message.Data))
			} else {
				_ = pane.writeInput([]byte(message.Data))
			}
		}
	case "resize":
		if message.Cols > 0 && message.Rows > 0 {
			_ = pane.resize(message.Cols, message.Rows)
		}
	case "input_lock":
		pane.setInputBlocked(message.Blocked)
	case "ping":
		data, err := json.Marshal(map[string]any{"type": "pong"})
		if err == nil {
			client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: data})
		}
	case "detach":
		return false
	}
	return true
}

func (w *terminalWorkspace) applyAction(request workspaceActionRequest) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	switch request.Action {
	case "create_tab":
		return w.createTabLocked(request.TabID, request.PaneID, normalizeCols(request.Cols), normalizeRows(request.Rows))
	case "rename_tab":
		return w.renameTabLocked(request.TabID, request.Label)
	case "close_tab":
		return w.closeTabLocked(request.TabID)
	case "close_other_tabs":
		return w.closeOtherTabsLocked(request.TabID)
	case "split_pane":
		return w.splitPaneLocked(request.TabID, request.PaneID, request.Direction, normalizeCols(request.Cols), normalizeRows(request.Rows))
	case "close_pane":
		return w.closePaneLocked(request.TabID, request.PaneID)
	case "move_pane_to_tab":
		return w.movePaneToTabLocked(request.TabID, request.PaneID)
	case "move_tab":
		return w.moveTabLocked(request.TabID, request.Position)
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

func (w *terminalWorkspace) snapshot() workspaceState {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.refreshAutoTabLabelsLocked()
	w.pruneRecentTabsLocked()

	state := workspaceState{
		Selector:     w.selector,
		ActiveTabID:  w.activeTab,
		RecentTabIDs: append([]string{}, w.recentTabs...),
		Tabs:         make([]tabState, 0, len(w.tabs)),
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

type paneActivityTarget struct {
	ID  string
	TTY string
}

type paneActivity struct {
	TTY         string
	Busy        bool
	Command     string
	CommandLine string
	CWD         string
}

func (w *terminalWorkspace) refreshActivity(ctx context.Context) (workspaceActivityState, error) {
	w.mu.Lock()
	targets := make([]paneActivityTarget, 0, len(w.panes))
	for _, pane := range w.panes {
		pane.mu.Lock()
		if !pane.exited && pane.tty != "" {
			targets = append(targets, paneActivityTarget{ID: pane.id, TTY: pane.tty})
		}
		pane.mu.Unlock()
	}
	selector := w.selector
	w.mu.Unlock()

	ttys := make([]string, 0, len(targets))
	for _, target := range targets {
		ttys = append(ttys, target.TTY)
	}
	var activities map[string]paneActivity
	var err error
	if w.localPTY {
		activities, err = scanLocalActivities(ctx, ttys)
	} else {
		activities, err = scanContainerActivities(ctx, selector, ttys)
	}
	if err == nil {
		checkedAt := time.Now()
		w.mu.Lock()
		for _, target := range targets {
			pane := w.panes[target.ID]
			if pane == nil {
				continue
			}
			activity := activities[target.TTY]
			pane.mu.Lock()
			pane.busy = activity.Busy
			pane.command = activity.Command
			pane.commandLine = activity.CommandLine
			pane.cwd = activity.CWD
			pane.activityCheckedAt = checkedAt
			pane.mu.Unlock()
		}
		w.refreshAutoTabLabelsLocked()
		w.mu.Unlock()
	}

	return workspaceActivityState{
		Selector: selector,
		Panes:    w.snapshotPaneSummaries(),
	}, err
}

func (w *terminalWorkspace) snapshotPaneSummaries() []paneSummary {
	w.mu.Lock()
	defer w.mu.Unlock()
	items := make([]paneSummary, 0, len(w.panes))
	for _, tab := range w.tabs {
		for _, paneID := range tab.PaneIDs {
			if pane := w.panes[paneID]; pane != nil {
				items = append(items, pane.summary())
			}
		}
	}
	return items
}

func (w *terminalWorkspace) refreshAutoTabLabelsLocked() {
	for _, tab := range w.tabs {
		if tab == nil || tab.CustomLabel {
			continue
		}
		label := w.resolveAutoTabLabelLocked(tab)
		if label != "" {
			tab.Label = label
		}
	}
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

func (w *terminalWorkspace) resolveAutoTabLabelLocked(tab *terminalTab) string {
	if tab == nil {
		return ""
	}
	pane := w.panes[tab.ActivePaneID]
	if pane == nil {
		for _, paneID := range tab.PaneIDs {
			if candidate := w.panes[paneID]; candidate != nil {
				pane = candidate
				break
			}
		}
	}
	if pane == nil {
		return ""
	}
	pane.mu.Lock()
	cwd := pane.cwd
	command := pane.command
	pane.mu.Unlock()
	if label := displayPathLabel(cwd); label != "" {
		return label
	}
	if command = strings.TrimSpace(command); command != "" {
		return command
	}
	return ""
}

func displayPathLabel(path string) string {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	switch cleaned {
	case "", ".":
		return ""
	case string(filepath.Separator):
		return "ROOT"
	default:
		return filepath.Base(cleaned)
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

func (w *terminalWorkspace) handlePaneExited(paneID string) {
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
		pane.historyLimitBytes = limit
		pane.trimHistoryLocked()
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

func newTerminalPane(workspace *terminalWorkspace, paneID string, cols, rows int, initialCWD string) (*terminalPane, error) {
	var command *exec.Cmd
	if workspace.localPTY {
		command = exec.Command("/bin/sh", "-lc", buildInstanceShellBootstrapScript(workspace.username, initialCWD))
	} else {
		command = exec.Command(lightosctlPath, "exec", "-ti", workspace.selector, "/bin/sh", "-lc", buildInstanceShellBootstrapScript(workspace.username, initialCWD))
	}
	if workspace.rootDir != "" {
		command.Dir = workspace.rootDir
	}
	command.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
	)
	ptyFile, err := pty.Start(command)
	if err != nil {
		return nil, err
	}
	historyLimitBytes := workspace.historyLimitBytes
	if historyLimitBytes <= 0 {
		historyLimitBytes = historyLimitBytesForTerminalScrollback(fonts.DefaultTerminalScrollback)
	}
	pane := &terminalPane{
		workspace:         workspace,
		id:                paneID,
		selector:          workspace.selector,
		rootDir:           workspace.rootDir,
		cmd:               command,
		ptyFile:           ptyFile,
		clients:           make(map[*paneClient]struct{}),
		historyLimitBytes: historyLimitBytes,
		cols:              normalizeCols(cols),
		rows:              normalizeRows(rows),
		cwd:               strings.TrimSpace(initialCWD),
		done:              make(chan struct{}),
	}
	_ = pty.Setsize(ptyFile, &pty.Winsize{Cols: uint16(pane.cols), Rows: uint16(pane.rows)})
	go pane.readLoop()
	return pane, nil
}

func buildInstanceShellBootstrapScript(username, initialCWD string) string {
	if instanceCommandNeedsUserSwitch(username) {
		return buildUserLoginShellBootstrapScript(username, initialCWD)
	}
	return buildShellBootstrapScript(initialCWD)
}

func instanceCommandNeedsUserSwitch(username string) bool {
	switch strings.TrimSpace(username) {
	case "", "root":
		return false
	default:
		return true
	}
}

func buildUserShellBootstrapScript(username string) string {
	return fmt.Sprintf(`PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
user=%s
uid=$(id -u "$user" 2>/dev/null) || {
  echo "webshell user was not found."
  exit 127
}
gid=$(id -g "$user" 2>/dev/null) || {
  echo "webshell user was not found."
  exit 127
}
entry=$(getent passwd "$user" 2>/dev/null) || {
  echo "webshell user entry was not found."
  exit 127
}
home=$(printf '%%s\n' "$entry" | cut -d: -f6)
shell=$(printf '%%s\n' "$entry" | cut -d: -f7)
if [ -z "$home" ]; then
  home=/
fi
if [ -z "$shell" ]; then
  shell=/bin/sh
fi
if [ ! -d "$home" ]; then
  mkdir -p "$home"
fi
if [ "$(stat -c '%%u' "$home" 2>/dev/null || true)" != "$uid" ] || [ "$(stat -c '%%g' "$home" 2>/dev/null || true)" != "$gid" ]; then
  chown "$uid:$gid" "$home"
fi
xdg_config_home="$home/.config"
if [ ! -d "$xdg_config_home" ]; then
  mkdir -p "$xdg_config_home" 2>/dev/null || true
fi
if [ -d "$xdg_config_home" ]; then
  chown "$uid:$gid" "$xdg_config_home" 2>/dev/null || true
fi
xdg_runtime_dir="/run/user/$uid"
if [ ! -d "$xdg_runtime_dir" ]; then
  xdg_runtime_dir=""
fi
`, shellScriptQuote(username))
}

func buildUserLoginShellBootstrapScript(username, initialCWD string) string {
	return buildUserShellBootstrapScript(username) + `__webshell_shell="$shell"
` + buildTerminalSessionBootstrapScript(initialCWD) + `
if [ -z "$__webshell_initial_cwd" ]; then
  cd "$home" 2>/dev/null || cd /
fi
export XDG_CONFIG_HOME="$xdg_config_home"
if [ -n "$xdg_runtime_dir" ]; then
  export XDG_RUNTIME_DIR="$xdg_runtime_dir"
else
  unset XDG_RUNTIME_DIR
fi
if command -v setpriv >/dev/null 2>&1; then
  exec env HOME="$home" USER="$user" LOGNAME="$user" SHELL="$__webshell_shell" XDG_CONFIG_HOME="$xdg_config_home" setpriv --reuid "$uid" --regid "$gid" --init-groups "$__webshell_shell"
fi
if command -v su >/dev/null 2>&1; then
  export HOME="$home" USER="$user" LOGNAME="$user" SHELL="$__webshell_shell"
  exec su -s "$__webshell_shell" "$user"
fi
echo "setpriv or su is required for webshell login session."
exit 127
`
}

func buildInitialCWDChangeScript(initialCWD string) string {
	cwd := strings.TrimSpace(initialCWD)
	if cwd == "" || !strings.HasPrefix(cwd, "/") {
		return `__webshell_initial_cwd=""`
	}
	return fmt.Sprintf(`__webshell_initial_cwd=%s
cd "$__webshell_initial_cwd" 2>/dev/null || __webshell_initial_cwd=""`, shellScriptQuote(cwd))
}

func shellScriptQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}

func (p *terminalPane) readLoop() {
	waitErr := make(chan error, 1)
	go func() {
		waitErr <- p.cmd.Wait()
	}()

	buf := make([]byte, 32768)
	for {
		n, err := p.ptyFile.Read(buf)
		if n > 0 {
			p.appendOutput(buf[:n])
		}
		if err != nil {
			break
		}
	}
	_ = p.ptyFile.Close()

	var err error
	select {
	case err = <-waitErr:
	case <-time.After(2 * time.Second):
		_ = killCommand(p.cmd)
		err = <-waitErr
	}
	p.markExited(err)
}

func (p *terminalPane) appendOutput(data []byte) {
	if len(data) == 0 {
		return
	}
	filtered := p.filterGeneratedInputEcho(data)
	filtered = p.filterTerminalQueryOutput(filtered)
	filtered = p.filterPrivateControlOutput(filtered)
	if len(filtered) == 0 {
		return
	}
	chunks := makeHistoryChunks(filtered)
	var clients []*paneClient

	p.mu.Lock()
	if !p.exited {
		for _, chunk := range chunks {
			p.history.append(chunk)
		}
		p.trimHistoryLocked()
		clients = make([]*paneClient, 0, len(p.clients))
		for client := range p.clients {
			clients = append(clients, client)
		}
	}
	p.mu.Unlock()

	for _, client := range clients {
		for _, chunk := range chunks {
			client.enqueue(paneOutbound{messageType: websocket.BinaryMessage, payload: chunk})
		}
	}
}

func makeHistoryChunks(data []byte) [][]byte {
	if len(data) == 0 {
		return nil
	}
	chunks := make([][]byte, 0, (len(data)+historyChunkMaxBytes-1)/historyChunkMaxBytes)
	for len(data) > 0 {
		chunkSize := min(len(data), historyChunkMaxBytes)
		chunk := append([]byte(nil), data[:chunkSize]...)
		chunks = append(chunks, chunk)
		data = data[chunkSize:]
	}
	return chunks
}

func (p *terminalPane) trimHistoryLocked() {
	limit := p.historyLimitBytes
	if limit <= 0 {
		limit = historyLimitBytesForTerminalScrollback(fonts.DefaultTerminalScrollback)
		p.historyLimitBytes = limit
	}
	p.history.trim(limit)
}

func (h *paneHistory) append(chunk []byte) {
	if len(chunk) == 0 {
		return
	}
	h.chunks = append(h.chunks, chunk)
	h.bytes += len(chunk)
}

func (h *paneHistory) trim(limit int) {
	if limit <= 0 || h.bytes <= limit {
		return
	}
	dropCount := 0
	dropBytes := 0
	for len(h.chunks)-dropCount > 1 && h.bytes-dropBytes > limit {
		chunk := h.chunks[dropCount]
		dropBytes += len(chunk)
		dropCount++
	}
	if dropCount == 0 {
		return
	}
	for i := 0; i < dropCount; i++ {
		h.chunks[i] = nil
	}
	remaining := append([][]byte(nil), h.chunks[dropCount:]...)
	h.chunks = remaining
	h.bytes -= dropBytes
	if h.bytes < 0 {
		h.bytes = 0
	}
}

func (h *paneHistory) snapshot() paneHistorySnapshot {
	return paneHistorySnapshot{chunks: append([][]byte(nil), h.chunks...)}
}

func (s paneHistorySnapshot) bytes() []byte {
	var total int
	for _, chunk := range s.chunks {
		total += len(chunk)
	}
	if total == 0 {
		return nil
	}
	data := make([]byte, 0, total)
	for _, chunk := range s.chunks {
		data = append(data, chunk...)
	}
	return data
}

const (
	maxPendingTerminalQuery           = 64
	primaryDeviceAttributesResponse   = "\x1b[?1;2c"
	secondaryDeviceAttributesResponse = "\x1b[>0;0;0c"
	generatedCursorReportWindow       = 2 * time.Second
)

type terminalGeneratedEcho struct {
	raw    []byte
	quoted []byte
}

const maxPendingGeneratedEchoOutput = 128

func (p *terminalPane) addGeneratedEchoFilter(data []byte) {
	if len(data) == 0 {
		return
	}
	echo := terminalGeneratedEcho{
		raw:    append([]byte(nil), data...),
		quoted: ttyEchoControlBytes(data),
	}
	p.mu.Lock()
	p.generatedEchoPending = append(p.generatedEchoPending, echo)
	p.mu.Unlock()
}

func (p *terminalPane) expectGeneratedInput(data []byte, count int) {
	if len(data) == 0 || count <= 0 {
		return
	}
	p.mu.Lock()
	if p.pendingGeneratedInputs == nil {
		p.pendingGeneratedInputs = make(map[string]int)
	}
	p.pendingGeneratedInputs[string(data)] += count
	p.mu.Unlock()
}

func (p *terminalPane) expectGeneratedCursorReport(count int) {
	if count <= 0 {
		return
	}
	now := time.Now()
	p.mu.Lock()
	p.pendingCursorReports += count
	p.pendingCursorReportUntil = now.Add(generatedCursorReportWindow)
	p.mu.Unlock()
}

func (p *terminalPane) consumeExpectedGeneratedInput(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	key := string(data)
	now := time.Now()
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.pendingGeneratedInputs == nil || p.pendingGeneratedInputs[key] <= 0 {
		if p.cursorReportWindowActiveLocked(now) && p.pendingCursorReports > 0 && isCursorPositionReport(data) {
			p.pendingCursorReports--
			p.pendingCursorReportUntil = now.Add(generatedCursorReportWindow)
			return true
		}
		return false
	}
	p.pendingGeneratedInputs[key]--
	if p.pendingGeneratedInputs[key] <= 0 {
		delete(p.pendingGeneratedInputs, key)
	}
	if len(p.pendingGeneratedInputs) == 0 {
		p.pendingGeneratedInputs = nil
	}
	return true
}

func (p *terminalPane) cursorReportWindowActiveLocked(now time.Time) bool {
	if p.pendingCursorReportUntil.IsZero() {
		p.pendingCursorReports = 0
		return false
	}
	if !now.Before(p.pendingCursorReportUntil) {
		p.pendingCursorReports = 0
		p.pendingCursorReportUntil = time.Time{}
		return false
	}
	return true
}

var cursorPositionReportTailPattern = regexp.MustCompile(`^(?:\[\d{1,4};\d{1,4}R|\[\d{1,4}R|\d{1,4};\d{1,4}R|;\d{1,4}R|\d{1,4}R|\dR)+$`)

func isCursorPositionReport(data []byte) bool {
	if len(data) < len("\x1b[1;1R") || data[0] != '\x1b' || data[1] != '[' || data[len(data)-1] != 'R' {
		return false
	}
	parts := bytes.Split(data[2:len(data)-1], []byte(";"))
	if len(parts) != 2 {
		return false
	}
	for _, part := range parts {
		if len(part) == 0 || len(part) > 4 {
			return false
		}
		for _, b := range part {
			if b < '0' || b > '9' {
				return false
			}
		}
	}
	return true
}

func isCursorPositionReportTail(data []byte) bool {
	return cursorPositionReportTailPattern.Match(data)
}

func (p *terminalPane) consumeGeneratedCursorReportInput(data []byte) (bool, []byte) {
	if len(data) == 0 {
		return false, nil
	}
	fullReport := isCursorPositionReport(data)
	tailReport := isCursorPositionReportTail(data)
	if !fullReport && !tailReport {
		return false, nil
	}
	now := time.Now()
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.cursorReportWindowActiveLocked(now) {
		return false, nil
	}
	if fullReport && p.pendingCursorReports > 0 {
		p.pendingCursorReports--
		p.pendingCursorReportUntil = now.Add(generatedCursorReportWindow)
		return false, append([]byte(nil), data...)
	}
	return true, nil
}

func (p *terminalPane) filterGeneratedInputEcho(data []byte) []byte {
	if len(data) == 0 {
		return nil
	}

	p.mu.Lock()
	pending := append([]terminalGeneratedEcho(nil), p.generatedEchoPending...)
	buffer := append(p.generatedEchoOutputPending, data...)
	p.generatedEchoPending = nil
	p.generatedEchoOutputPending = nil
	p.mu.Unlock()

	if len(pending) == 0 {
		return buffer
	}

	var output []byte
	for len(buffer) > 0 {
		matched := false
		for index := 0; index < len(pending); index++ {
			if len(pending[index].raw) > 0 && bytes.HasPrefix(buffer, pending[index].raw) {
				buffer = buffer[len(pending[index].raw):]
				pending = append(pending[:index], pending[index+1:]...)
				matched = true
				break
			}
			if len(pending[index].quoted) > 0 && bytes.HasPrefix(buffer, pending[index].quoted) {
				buffer = buffer[len(pending[index].quoted):]
				pending = append(pending[:index], pending[index+1:]...)
				matched = true
				break
			}
		}
		if matched {
			continue
		}

		if keep := generatedEchoPrefixMatchLen(buffer, pending); keep > 0 {
			emit := len(buffer) - keep
			if emit > 0 {
				output = append(output, buffer[:emit]...)
			}
			p.mu.Lock()
			p.generatedEchoPending = append(p.generatedEchoPending, pending...)
			p.generatedEchoOutputPending = append(p.generatedEchoOutputPending[:0], buffer[emit:]...)
			p.mu.Unlock()
			return output
		}

		output = append(output, buffer[0])
		buffer = buffer[1:]
	}

	p.mu.Lock()
	p.generatedEchoPending = append(p.generatedEchoPending, pending...)
	p.mu.Unlock()
	return output
}

func generatedEchoPrefixMatchLen(buffer []byte, pending []terminalGeneratedEcho) int {
	maxKeep := min(len(buffer), maxPendingGeneratedEchoOutput)
	for _, echo := range pending {
		echoKeep := len(echo.raw) - 1
		if quotedKeep := len(echo.quoted) - 1; quotedKeep > echoKeep {
			echoKeep = quotedKeep
		}
		maxKeep = min(maxKeep, echoKeep)
	}
	for keep := maxKeep; keep > 0; keep-- {
		suffix := buffer[len(buffer)-keep:]
		for _, echo := range pending {
			if len(echo.raw) > keep && bytes.Equal(suffix, echo.raw[:keep]) {
				return keep
			}
			if len(echo.quoted) > keep && bytes.Equal(suffix, echo.quoted[:keep]) {
				return keep
			}
		}
	}
	return 0
}

func ttyEchoControlBytes(data []byte) []byte {
	var output []byte
	for _, b := range data {
		switch {
		case b == 0x7f:
			output = append(output, '^', '?')
		case b < 0x20:
			output = append(output, '^', b+0x40)
		default:
			output = append(output, b)
		}
	}
	return output
}

func (p *terminalPane) filterTerminalQueryOutput(data []byte) []byte {
	if len(data) == 0 {
		return nil
	}

	p.mu.Lock()
	buffer := append(p.terminalQueryPending, data...)
	p.terminalQueryPending = nil
	p.mu.Unlock()

	var output []byte
	for len(buffer) > 0 {
		index := bytes.IndexByte(buffer, '\x1b')
		if index < 0 {
			output = append(output, buffer...)
			return output
		}
		if index > 0 {
			output = append(output, buffer[:index]...)
			buffer = buffer[index:]
		}
		if len(buffer) == 1 {
			p.setTerminalQueryPending(buffer)
			return output
		}
		switch buffer[1] {
		case '[':
			if len(buffer) == 2 {
				p.setTerminalQueryPending(buffer)
				return output
			}
			final := -1
			for i := 2; i < len(buffer); i++ {
				if buffer[i] >= 0x40 && buffer[i] <= 0x7e {
					final = i
					break
				}
				if i >= maxPendingTerminalQuery {
					break
				}
			}
			if final < 0 {
				if len(buffer) <= maxPendingTerminalQuery {
					p.setTerminalQueryPending(buffer)
					return output
				}
				output = append(output, buffer[0])
				buffer = buffer[1:]
				continue
			}
			sequence := buffer[:final+1]
			if response, ok := terminalQueryResponse(sequence); ok {
				responseData := []byte(response)
				p.expectGeneratedInput(responseData, 1)
				_ = p.writeGeneratedInput(responseData)
				buffer = buffer[final+1:]
				continue
			}
			if response, ok := terminalClientGeneratedResponse(sequence); ok {
				p.expectGeneratedInput([]byte(response), 1)
			} else if isCursorPositionQuery(sequence) {
				p.expectGeneratedCursorReport(1)
			}
			output = append(output, sequence...)
			buffer = buffer[final+1:]
		case 'Z':
			responseData := []byte(primaryDeviceAttributesResponse)
			p.expectGeneratedInput(responseData, 1)
			_ = p.writeGeneratedInput(responseData)
			buffer = buffer[2:]
		default:
			output = append(output, buffer[0])
			buffer = buffer[1:]
		}
	}
	return output
}

func (p *terminalPane) setTerminalQueryPending(data []byte) {
	p.mu.Lock()
	p.terminalQueryPending = append(p.terminalQueryPending[:0], data...)
	p.mu.Unlock()
}

func terminalQueryResponse(sequence []byte) (string, bool) {
	if len(sequence) < 3 || sequence[0] != '\x1b' || sequence[1] != '[' || sequence[len(sequence)-1] != 'c' {
		return "", false
	}
	params := string(sequence[2 : len(sequence)-1])
	switch params {
	case "", "0":
		return primaryDeviceAttributesResponse, true
	case ">", ">0":
		return secondaryDeviceAttributesResponse, true
	default:
		return "", false
	}
}

func terminalClientGeneratedResponse(sequence []byte) (string, bool) {
	if bytes.Equal(sequence, []byte("\x1b[5n")) {
		return "\x1b[0n", true
	}
	return "", false
}

func isCursorPositionQuery(sequence []byte) bool {
	return bytes.Equal(sequence, []byte("\x1b[6n"))
}

var privateTTYPattern = regexp.MustCompile(`^/dev/pts/[0-9]+$`)

func (p *terminalPane) filterPrivateControlOutput(data []byte) []byte {
	const maxPendingControl = 512
	prefix := []byte("\x1b]777;webshell-tty=")

	p.mu.Lock()
	buffer := append(p.controlPending, data...)
	p.controlPending = nil
	p.mu.Unlock()

	var output []byte
	for len(buffer) > 0 {
		index := bytes.Index(buffer, prefix)
		if index < 0 {
			keep := privatePrefixSuffixLen(buffer, prefix)
			emit := len(buffer) - keep
			if emit > 0 {
				output = append(output, buffer[:emit]...)
			}
			p.mu.Lock()
			p.controlPending = append(p.controlPending[:0], buffer[emit:]...)
			p.mu.Unlock()
			return output
		}
		if index > 0 {
			output = append(output, buffer[:index]...)
			buffer = buffer[index:]
		}
		end, terminatorLength := findPrivateControlTerminator(buffer[len(prefix):])
		if end < 0 {
			if len(buffer) > maxPendingControl {
				output = append(output, buffer[0])
				buffer = buffer[1:]
				continue
			}
			p.mu.Lock()
			p.controlPending = append(p.controlPending[:0], buffer...)
			p.mu.Unlock()
			return output
		}
		value := string(buffer[len(prefix) : len(prefix)+end])
		if privateTTYPattern.MatchString(value) {
			p.mu.Lock()
			p.tty = value
			p.mu.Unlock()
		}
		buffer = buffer[len(prefix)+end+terminatorLength:]
	}
	return output
}

func privatePrefixSuffixLen(buffer, prefix []byte) int {
	maxKeep := min(len(buffer), len(prefix)-1)
	for keep := maxKeep; keep > 0; keep-- {
		if bytes.Equal(buffer[len(buffer)-keep:], prefix[:keep]) {
			return keep
		}
	}
	return 0
}

func findPrivateControlTerminator(data []byte) (int, int) {
	for index := 0; index < len(data); index++ {
		switch data[index] {
		case '\a':
			return index, 1
		case '\x1b':
			if index+1 < len(data) && data[index+1] == '\\' {
				return index, 2
			}
		}
	}
	return -1, 0
}

func (p *terminalPane) markExited(err error) {
	exitCode := processExitCode(err)
	exitText := ""
	if err != nil && !errors.Is(err, os.ErrProcessDone) {
		exitText = err.Error()
	}
	payload := map[string]any{
		"type":      "process-exit",
		"exit_code": exitCode,
	}
	if exitText != "" {
		payload["message"] = exitText
	}
	data, _ := json.Marshal(payload)

	var clients []*paneClient
	p.mu.Lock()
	if !p.exited {
		p.exited = true
		p.exitCode = exitCode
		p.exitText = exitText
		for client := range p.clients {
			clients = append(clients, client)
		}
	}
	p.mu.Unlock()

	for _, client := range clients {
		client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: data, closeAfter: true})
	}
	p.workspace.handlePaneExited(p.id)
	close(p.done)
}

func (p *terminalPane) attachClient() (paneHistorySnapshot, *paneClient, bool, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.exited {
		return paneHistorySnapshot{}, nil, false, errors.New("pane has exited")
	}
	history := p.history.snapshot()
	allowGeneratedInputDuringReplay := !p.hasAttached
	p.hasAttached = true
	client := &paneClient{
		send: make(chan paneOutbound, 256),
		done: make(chan struct{}),
	}
	p.clients[client] = struct{}{}
	return history, client, allowGeneratedInputDuringReplay, nil
}

func (p *terminalPane) detachClient(client *paneClient) {
	p.mu.Lock()
	delete(p.clients, client)
	p.mu.Unlock()
}

func (p *terminalPane) writeInput(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	dropInput, generatedInput := p.consumeGeneratedCursorReportInput(data)
	if dropInput {
		return nil
	}
	if len(generatedInput) > 0 {
		p.addGeneratedEchoFilter(generatedInput)
		data = generatedInput
	}
	return p.writePTYInput(data)
}

func (p *terminalPane) writePTYInput(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	p.mu.Lock()
	ptyFile := p.ptyFile
	inputBlocked := len(p.inputBlockers) > 0
	exited := p.exited
	p.mu.Unlock()
	if inputBlocked {
		return nil
	}
	if exited || ptyFile == nil {
		return errors.New("pane is not running")
	}
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	for len(data) > 0 {
		chunk := data
		if len(chunk) > terminalPTYInputChunkBytes {
			chunk = chunk[:terminalPTYInputChunkBytes]
		}
		n, err := ptyFile.Write(chunk)
		if n > 0 {
			data = data[n:]
		}
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}

func (p *terminalPane) writeGeneratedInput(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	if !p.consumeExpectedGeneratedInput(data) {
		return nil
	}
	p.addGeneratedEchoFilter(data)
	return p.writePTYInput(data)
}

func (p *terminalPane) setInputBlocked(blocked bool) {
	p.setInputBlockedBy("global", blocked)
}

func (p *terminalPane) setInputBlockedBy(owner string, blocked bool) {
	owner = strings.TrimSpace(owner)
	if owner == "" {
		owner = "global"
	}
	p.mu.Lock()
	if blocked {
		if p.inputBlockers == nil {
			p.inputBlockers = make(map[string]struct{})
		}
		p.inputBlockers[owner] = struct{}{}
	} else if p.inputBlockers != nil {
		delete(p.inputBlockers, owner)
		if len(p.inputBlockers) == 0 {
			p.inputBlockers = nil
		}
	}
	p.mu.Unlock()
}

func (p *terminalPane) resize(cols, rows int) error {
	cols = normalizeCols(cols)
	rows = normalizeRows(rows)
	p.mu.Lock()
	p.cols = cols
	p.rows = rows
	ptyFile := p.ptyFile
	exited := p.exited
	p.mu.Unlock()
	if exited || ptyFile == nil {
		return nil
	}
	return pty.Setsize(ptyFile, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

func (p *terminalPane) close() {
	p.mu.Lock()
	ptyFile := p.ptyFile
	clients := make([]*paneClient, 0, len(p.clients))
	for client := range p.clients {
		clients = append(clients, client)
	}
	p.mu.Unlock()

	for _, client := range clients {
		client.close()
	}
	if ptyFile != nil {
		_ = ptyFile.Close()
	}
	_ = killCommand(p.cmd)
}

func (p *terminalPane) summary() paneSummary {
	p.mu.Lock()
	defer p.mu.Unlock()
	return paneSummary{
		ID:                p.id,
		Cols:              p.cols,
		Rows:              p.rows,
		TTY:               p.tty,
		Busy:              p.busy,
		Command:           p.command,
		CommandLine:       p.commandLine,
		CWD:               p.cwd,
		Exited:            p.exited,
		ExitCode:          p.exitCode,
		ActivityCheckedAt: unixMillis(p.activityCheckedAt),
	}
}

func unixMillis(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixNano() / int64(time.Millisecond)
}

type procInfo struct {
	PID   int
	Comm  string
	Cmd   string
	CWD   string
	FD0   string
	Pgrp  int
	TTYNr int
	TPgid int
}

const procScanScript = `for d in /proc/[0-9]*; do
  pid="${d##*/}"
  stat="$(cat "$d/stat" 2>/dev/null)" || continue
  fd0="$(readlink "$d/fd/0" 2>/dev/null || true)"
  cwd="$(readlink "$d/cwd" 2>/dev/null || true)"
  cmd="$(tr '\000\011\012\015' '    ' < "$d/cmdline" 2>/dev/null || true)"
  printf 'P\t%s\t%s\t%s\t%s\t%s\n' "$pid" "$fd0" "$cwd" "$cmd" "$stat"
done`

func scanContainerActivities(ctx context.Context, selector string, ttys []string) (map[string]paneActivity, error) {
	result, uniqueTTYs := normalizeActivityTTYs(ttys)
	if len(uniqueTTYs) == 0 {
		return result, nil
	}

	scanCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	output, err := exec.CommandContext(scanCtx, lightosctlPath, "exec", selector, "/bin/sh", "-lc", procScanScript).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return result, err
		}
		return result, fmt.Errorf("%w: %s", err, text)
	}
	processes := parseProcScanOutput(output)
	for _, tty := range uniqueTTYs {
		result[tty] = resolveTTYActivity(tty, processes)
	}
	return result, nil
}

func scanLocalActivities(ctx context.Context, ttys []string) (map[string]paneActivity, error) {
	scanCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	return scanProcActivities(scanCtx, "/proc", ttys)
}

func scanProcActivities(ctx context.Context, procRoot string, ttys []string) (map[string]paneActivity, error) {
	result := make(map[string]paneActivity, len(ttys))
	uniqueTTYs := make([]string, 0, len(ttys))
	seen := make(map[string]struct{}, len(ttys))
	for _, tty := range ttys {
		tty = strings.TrimSpace(tty)
		if !privateTTYPattern.MatchString(tty) {
			continue
		}
		if _, ok := seen[tty]; ok {
			continue
		}
		seen[tty] = struct{}{}
		uniqueTTYs = append(uniqueTTYs, tty)
		result[tty] = paneActivity{TTY: tty}
	}
	if len(uniqueTTYs) == 0 {
		return result, nil
	}

	ttySet := make(map[string]struct{}, len(uniqueTTYs))
	for _, tty := range uniqueTTYs {
		ttySet[tty] = struct{}{}
	}

	entries, err := os.ReadDir(procRoot)
	if err != nil {
		return result, err
	}

	type procCandidate struct {
		info procInfo
		dir  string
	}
	candidates := make([]procCandidate, 0, len(entries))
	foregroundByTTYNr := make(map[int]int, len(uniqueTTYs))
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		if !entry.IsDir() || !isProcPIDDirName(entry.Name()) {
			continue
		}
		dir := filepath.Join(procRoot, entry.Name())
		statData, err := os.ReadFile(filepath.Join(dir, "stat"))
		if err != nil {
			continue
		}
		info, err := parseProcStat(string(statData))
		if err != nil || info.TTYNr == 0 || info.TPgid <= 0 {
			continue
		}
		if fd0, err := os.Readlink(filepath.Join(dir, "fd", "0")); err == nil {
			info.FD0 = strings.TrimSpace(fd0)
		}
		candidates = append(candidates, procCandidate{info: info, dir: dir})
		if _, ok := ttySet[info.FD0]; ok {
			foregroundByTTYNr[info.TTYNr] = info.TPgid
		}
	}
	if len(foregroundByTTYNr) == 0 {
		return result, nil
	}

	processes := make([]procInfo, 0, len(candidates))
	for _, candidate := range candidates {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		_, isRequestedTTY := ttySet[candidate.info.FD0]
		foregroundPgrp, hasTargetTTY := foregroundByTTYNr[candidate.info.TTYNr]
		if !isRequestedTTY && (!hasTargetTTY || candidate.info.Pgrp != foregroundPgrp) {
			continue
		}
		info := candidate.info
		info.Cmd = readProcCmdline(filepath.Join(candidate.dir, "cmdline"))
		info.CWD = readProcLink(filepath.Join(candidate.dir, "cwd"))
		processes = append(processes, info)
	}
	sort.Slice(processes, func(i, j int) bool {
		return processes[i].PID < processes[j].PID
	})
	for _, tty := range uniqueTTYs {
		result[tty] = resolveTTYActivity(tty, processes)
	}
	return result, nil
}

func normalizeActivityTTYs(ttys []string) (map[string]paneActivity, []string) {
	result := make(map[string]paneActivity, len(ttys))
	uniqueTTYs := make([]string, 0, len(ttys))
	seen := make(map[string]struct{}, len(ttys))
	for _, tty := range ttys {
		tty = strings.TrimSpace(tty)
		if !privateTTYPattern.MatchString(tty) {
			continue
		}
		if _, ok := seen[tty]; ok {
			continue
		}
		seen[tty] = struct{}{}
		uniqueTTYs = append(uniqueTTYs, tty)
		result[tty] = paneActivity{TTY: tty}
	}
	return result, uniqueTTYs
}

func isProcPIDDirName(name string) bool {
	if name == "" {
		return false
	}
	for _, r := range name {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func readProcCmdline(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for i, b := range data {
		switch b {
		case 0, '\t', '\n', '\r':
			data[i] = ' '
		}
	}
	return strings.TrimSpace(string(data))
}

func readProcLink(path string) string {
	value, err := os.Readlink(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func parseProcScanOutput(output []byte) []procInfo {
	lines := strings.Split(string(output), "\n")
	processes := make([]procInfo, 0, len(lines))
	for _, line := range lines {
		if !strings.HasPrefix(line, "P\t") {
			continue
		}
		parts := strings.SplitN(line, "\t", 6)
		if len(parts) != 6 {
			continue
		}
		pid, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}
		info, err := parseProcStat(parts[5])
		if err != nil {
			continue
		}
		info.PID = pid
		info.FD0 = strings.TrimSpace(parts[2])
		info.CWD = strings.TrimSpace(parts[3])
		info.Cmd = strings.TrimSpace(parts[4])
		processes = append(processes, info)
	}
	sort.Slice(processes, func(i, j int) bool {
		return processes[i].PID < processes[j].PID
	})
	return processes
}

func parseProcStat(stat string) (procInfo, error) {
	stat = strings.TrimSpace(stat)
	open := strings.IndexByte(stat, '(')
	close := strings.LastIndexByte(stat, ')')
	if open < 0 || close <= open {
		return procInfo{}, errors.New("invalid proc stat")
	}
	rest := strings.Fields(strings.TrimSpace(stat[close+1:]))
	if len(rest) < 6 {
		return procInfo{}, errors.New("short proc stat")
	}
	pgrp, err := strconv.Atoi(rest[2])
	if err != nil {
		return procInfo{}, err
	}
	ttyNr, err := strconv.Atoi(rest[4])
	if err != nil {
		return procInfo{}, err
	}
	tpgid, err := strconv.Atoi(rest[5])
	if err != nil {
		return procInfo{}, err
	}
	pid, _ := strconv.Atoi(strings.TrimSpace(stat[:open]))
	return procInfo{
		PID:   pid,
		Comm:  stat[open+1 : close],
		Pgrp:  pgrp,
		TTYNr: ttyNr,
		TPgid: tpgid,
	}, nil
}

func resolveTTYActivity(tty string, processes []procInfo) paneActivity {
	activity := paneActivity{TTY: tty}
	var anchor *procInfo
	for index := range processes {
		process := &processes[index]
		if process.FD0 == tty && process.TTYNr != 0 && process.TPgid > 0 {
			anchor = process
			if process.Pgrp == process.TPgid {
				break
			}
		}
	}
	if anchor == nil {
		return activity
	}

	var fallback string
	var fallbackCommandLine string
	var fallbackCWD string
	for index := range processes {
		process := processes[index]
		if process.TTYNr != anchor.TTYNr || process.Pgrp != anchor.TPgid {
			continue
		}
		display := displayCommand(process)
		if fallback == "" {
			fallback = display
		}
		if fallbackCommandLine == "" {
			fallbackCommandLine = process.Cmd
		}
		if fallbackCWD == "" {
			fallbackCWD = process.CWD
		}
		if !isIdleShellCommand(display, process.Comm) {
			activity.Busy = true
			activity.Command = display
			activity.CommandLine = process.Cmd
			activity.CWD = process.CWD
			if activity.CWD == "" {
				activity.CWD = fallbackCWD
			}
			return activity
		}
	}
	activity.Command = fallback
	activity.CommandLine = fallbackCommandLine
	activity.CWD = fallbackCWD
	return activity
}

func displayCommand(process procInfo) string {
	fields := strings.Fields(process.Cmd)
	if len(fields) > 0 {
		command := filepath.Base(fields[0])
		command = strings.TrimPrefix(command, "-")
		if command != "" {
			return command
		}
	}
	command := strings.TrimPrefix(strings.TrimSpace(process.Comm), "-")
	if command != "" {
		return command
	}
	return ""
}

func isIdleShellCommand(command, comm string) bool {
	name := strings.TrimPrefix(strings.TrimSpace(command), "-")
	if name == "" {
		name = strings.TrimPrefix(strings.TrimSpace(comm), "-")
	}
	switch name {
	case "", "sh", "bash", "dash", "ash", "zsh", "fish", "ksh", "csh", "tcsh", "login", "su", "sudo":
		return true
	default:
		return false
	}
}

func (c *paneClient) enqueue(outbound paneOutbound) bool {
	payloadSize := len(outbound.payload)
	c.mu.Lock()
	select {
	case <-c.done:
		c.mu.Unlock()
		return false
	default:
	}
	if c.queuedBytes+payloadSize > clientQueueLimit {
		c.mu.Unlock()
		c.close()
		return false
	}
	c.queuedBytes += payloadSize
	c.mu.Unlock()

	select {
	case c.send <- outbound:
		return true
	case <-c.done:
		c.dequeued(payloadSize)
		return false
	default:
		c.dequeued(payloadSize)
		c.close()
		return false
	}
}

func (c *paneClient) dequeued(size int) {
	if size <= 0 {
		return
	}
	c.mu.Lock()
	c.queuedBytes -= size
	if c.queuedBytes < 0 {
		c.queuedBytes = 0
	}
	c.mu.Unlock()
}

func (c *paneClient) close() {
	c.once.Do(func() {
		close(c.done)
	})
}

func splitLayoutNode(node *layoutNode, targetPaneID, direction, newPaneID string) bool {
	if node == nil {
		return false
	}
	if node.Type == "leaf" && node.PaneID == targetPaneID {
		outerSize := node.Size
		node.Type = "split"
		node.Direction = direction
		node.PaneID = ""
		node.Children = []*layoutNode{
			{Type: "leaf", PaneID: targetPaneID, Size: 50},
			{Type: "leaf", PaneID: newPaneID, Size: 50},
		}
		node.Size = outerSize
		return true
	}
	for _, child := range node.Children {
		if splitLayoutNode(child, targetPaneID, direction, newPaneID) {
			return true
		}
	}
	return false
}

func removePaneFromLayoutNode(node *layoutNode, paneID string) *layoutNode {
	if node == nil {
		return nil
	}
	if node.Type == "leaf" {
		if node.PaneID == paneID {
			return nil
		}
		return cloneLayout(node)
	}
	children := make([]*layoutNode, 0, len(node.Children))
	for _, child := range node.Children {
		if next := removePaneFromLayoutNode(child, paneID); next != nil {
			children = append(children, next)
		}
	}
	if len(children) == 0 {
		return nil
	}
	if len(children) == 1 {
		if node.Size > 0 {
			children[0].Size = node.Size
		}
		return children[0]
	}
	next := cloneLayout(node)
	next.Children = children
	share := 100 / float64(len(children))
	for _, child := range next.Children {
		if child.Size <= 0 {
			child.Size = share
		}
	}
	return next
}

func validateLayoutForTab(node *layoutNode, tab *terminalTab) error {
	seen := make(map[string]int)
	if err := validateLayoutNode(node, tab, seen); err != nil {
		return err
	}
	if len(seen) != len(tab.PaneIDs) {
		return errors.New("layout does not include every pane")
	}
	for _, paneID := range tab.PaneIDs {
		if seen[paneID] != 1 {
			return errors.New("layout pane set does not match tab")
		}
	}
	return nil
}

func validateLayoutNode(node *layoutNode, tab *terminalTab, seen map[string]int) error {
	if node == nil {
		return errors.New("layout node is required")
	}
	switch node.Type {
	case "leaf":
		if !tab.hasPane(node.PaneID) {
			return errors.New("layout references unknown pane")
		}
		seen[node.PaneID]++
		if seen[node.PaneID] > 1 {
			return errors.New("layout references pane more than once")
		}
		node.Direction = ""
		node.Children = nil
	case "split":
		if node.Direction != "vertical" && node.Direction != "horizontal" {
			return errors.New("invalid layout direction")
		}
		if len(node.Children) < 2 {
			return errors.New("split layout needs at least two children")
		}
		node.PaneID = ""
		totalSized := 0.0
		for _, child := range node.Children {
			if err := validateLayoutNode(child, tab, seen); err != nil {
				return err
			}
			if child.Size < 5 {
				child.Size = 5
			}
			if child.Size > 95 {
				child.Size = 95
			}
			totalSized += child.Size
		}
		if totalSized <= 0 {
			share := 100 / float64(len(node.Children))
			for _, child := range node.Children {
				child.Size = share
			}
		}
	default:
		return errors.New("invalid layout node type")
	}
	return nil
}

func collectLayoutPaneIDs(node *layoutNode, result []string) []string {
	if node == nil {
		return result
	}
	if node.Type == "leaf" {
		return append(result, node.PaneID)
	}
	for _, child := range node.Children {
		result = collectLayoutPaneIDs(child, result)
	}
	return result
}

func adjacentPaneID(node *layoutNode, paneID string) (string, bool) {
	if node == nil {
		return "", false
	}
	if node.Type == "leaf" {
		return "", node.PaneID == paneID
	}
	for index, child := range node.Children {
		candidate, contains := adjacentPaneID(child, paneID)
		if !contains {
			continue
		}
		if candidate != "" {
			return candidate, true
		}
		if index+1 < len(node.Children) {
			return firstLayoutPaneID(node.Children[index+1]), true
		}
		if index > 0 {
			return lastLayoutPaneID(node.Children[index-1]), true
		}
		return "", true
	}
	return "", false
}

func firstLayoutPaneID(node *layoutNode) string {
	if node == nil {
		return ""
	}
	if node.Type == "leaf" {
		return node.PaneID
	}
	for _, child := range node.Children {
		if paneID := firstLayoutPaneID(child); paneID != "" {
			return paneID
		}
	}
	return ""
}

func lastLayoutPaneID(node *layoutNode) string {
	if node == nil {
		return ""
	}
	if node.Type == "leaf" {
		return node.PaneID
	}
	for index := len(node.Children) - 1; index >= 0; index-- {
		if paneID := lastLayoutPaneID(node.Children[index]); paneID != "" {
			return paneID
		}
	}
	return ""
}

func firstExistingPaneID(current string, paneIDs []string) string {
	for _, paneID := range paneIDs {
		if paneID == current {
			return current
		}
	}
	if len(paneIDs) == 0 {
		return ""
	}
	return paneIDs[0]
}

func cloneLayout(node *layoutNode) *layoutNode {
	if node == nil {
		return nil
	}
	next := &layoutNode{
		Type:      node.Type,
		Direction: node.Direction,
		PaneID:    node.PaneID,
		Size:      node.Size,
	}
	if len(node.Children) > 0 {
		next.Children = make([]*layoutNode, 0, len(node.Children))
		for _, child := range node.Children {
			next.Children = append(next.Children, cloneLayout(child))
		}
	}
	return next
}

func normalizeCols(cols int) int {
	if cols <= 0 {
		return defaultTerminalCols
	}
	return min(cols, 500)
}

func normalizeRows(rows int) int {
	if rows <= 0 {
		return defaultTerminalRows
	}
	return min(rows, 300)
}

func sortedPaneIDs(panes map[string]*terminalPane) []string {
	ids := make([]string, 0, len(panes))
	for id := range panes {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
