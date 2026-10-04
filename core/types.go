package core

import (
	"sync"
)

type terminalWorkspace struct {
	runtime             *Runtime
	manager             *WorkspaceManager
	selector            string
	workspaceGeneration string
	username            string
	rootDir             string
	localPTY            bool
	historyLimitBytes   int

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

type HistorySyncRequest struct {
	CheckpointProtocol  string
	Generation          string
	WorkspaceGeneration string
	LocalBase           uint64
	LocalEnd            uint64
	HasRange            bool
	ForceSnapshot       bool
	IntegrityProtocol   string
}

type WorkspaceState struct {
	Selector            string     `json:"selector"`
	ServerRevision      string     `json:"server_revision,omitempty"`
	AgentNotice         string     `json:"agent_notice,omitempty"`
	AgentCapabilities   []string   `json:"agent_capabilities,omitempty"`
	WorkspaceGeneration string     `json:"workspace_generation,omitempty"`
	ActiveTabID         string     `json:"active_tab_id"`
	RecentTabIDs        []string   `json:"recent_tab_ids"`
	Tabs                []tabState `json:"tabs"`
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
	PixelWidth        int    `json:"pixel_width,omitempty"`
	PixelHeight       int    `json:"pixel_height,omitempty"`
	TTY               string `json:"tty,omitempty"`
	Busy              bool   `json:"busy"`
	Command           string `json:"command,omitempty"`
	CommandLine       string `json:"command_line,omitempty"`
	CWD               string `json:"cwd,omitempty"`
	ActivityCheckedAt int64  `json:"activity_checked_at,omitempty"`
	Exited            bool   `json:"exited"`
	ExitCode          int    `json:"exit_code"`
	ExitMessage       string `json:"exit_message,omitempty"`
	ExitRetained      bool   `json:"exit_retained,omitempty"`
}

type WorkspaceActionRequest struct {
	Action       string                     `json:"action"`
	TabID        string                     `json:"tab_id"`
	BeforeTabID  string                     `json:"before_tab_id,omitempty"`
	PaneID       string                     `json:"pane_id"`
	RecentTabIDs []string                   `json:"recent_tab_ids,omitempty"`
	Direction    string                     `json:"direction"`
	Label        string                     `json:"label"`
	Layout       *layoutNode                `json:"layout"`
	ActivePaneID string                     `json:"active_pane_id"`
	Cols         int                        `json:"cols"`
	Rows         int                        `json:"rows"`
	Position     string                     `json:"position"`
	Recovery     *WorkspaceRecoveryDocument `json:"recovery,omitempty"`
}

type WorkspaceActivityState struct {
	Selector       string        `json:"selector"`
	ServerRevision string        `json:"server_revision,omitempty"`
	Panes          []paneSummary `json:"panes"`
	Error          string        `json:"error,omitempty"`
}

type TerminalControlMessage struct {
	Type        string `json:"type"`
	Cols        int    `json:"cols"`
	Rows        int    `json:"rows"`
	PixelWidth  int    `json:"pixel_width,omitempty"`
	PixelHeight int    `json:"pixel_height,omitempty"`
	ResizeEpoch string `json:"resize_epoch,omitempty"`
	Claim       bool   `json:"claim,omitempty"`
	Data        string `json:"data"`
	Generated   bool   `json:"generated,omitempty"`
	Foreground  string `json:"foreground,omitempty"`
	Background  string `json:"background,omitempty"`
	Cursor      string `json:"cursor,omitempty"`
}

type PaneActivity struct {
	TTY         string
	Busy        bool
	Command     string
	CommandLine string
	CWD         string
}
