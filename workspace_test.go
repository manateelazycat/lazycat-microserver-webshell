package main

import (
	"strings"
	"testing"
)

func TestBuildInstanceShellBootstrapScriptUsesConfiguredUser(t *testing.T) {
	script := buildInstanceShellBootstrapScript("admin", "")
	if !containsAll(script,
		"user='admin'",
		`setpriv --reuid "$uid" --regid "$gid" --init-groups "$__webshell_shell"`,
		`exec su -s "$__webshell_shell" "$user"`,
		`/run/catlink/shell-env.sh`,
	) {
		t.Fatalf("expected configured user login script, got:\n%s", script)
	}
	if containsAll(script, `su -s /bin/sh -c`) {
		t.Fatalf("configured user login script should not use non-interactive su -c wrapper, got:\n%s", script)
	}
}

func TestBuildInstanceShellBootstrapScriptKeepsRootCompatibility(t *testing.T) {
	script := buildInstanceShellBootstrapScript("root", "")
	if containsAll(script, "exec su -s") {
		t.Fatalf("root compatibility script should not use su wrapper, got:\n%s", script)
	}
	if !containsAll(script, `exec "${SHELL:-/bin/sh}"`) {
		t.Fatalf("expected original shell bootstrap, got:\n%s", script)
	}
}

func TestBuildInstanceShellBootstrapScriptQuotesUsername(t *testing.T) {
	script := buildInstanceShellBootstrapScript("dev'user", "")
	if !containsAll(script, `user='dev'"'"'user'`) {
		t.Fatalf("expected shell-quoted username, got:\n%s", script)
	}
}

func TestBuildInstanceShellBootstrapScriptUsesInitialCWD(t *testing.T) {
	script := buildInstanceShellBootstrapScript("root", "/home/demo/project")
	if !containsAll(script, `__webshell_initial_cwd='/home/demo/project'`, `cd "$__webshell_initial_cwd"`) {
		t.Fatalf("expected root shell bootstrap to cd to initial cwd, got:\n%s", script)
	}
	userScript := buildInstanceShellBootstrapScript("admin", "/home/demo/project")
	if !containsAll(userScript, `__webshell_initial_cwd='/home/demo/project'`, `cd "$__webshell_initial_cwd"`, `setpriv --reuid "$uid"`) {
		t.Fatalf("expected user shell bootstrap to cd before dropping privileges, got:\n%s", userScript)
	}
}

func TestParseProcStatWithSpacesAndParenInComm(t *testing.T) {
	stat := "1234 (my shell) S 1 2222 3333 34816 4444 0 0 0 0 0 0"
	info, err := parseProcStat(stat)
	if err != nil {
		t.Fatalf("parseProcStat returned error: %v", err)
	}
	if info.PID != 1234 || info.Comm != "my shell" || info.Pgrp != 2222 || info.TTYNr != 34816 || info.TPgid != 4444 {
		t.Fatalf("unexpected proc stat parse: %+v", info)
	}
}

func TestResolveTTYActivityUsesForegroundProcessGroup(t *testing.T) {
	processes := []procInfo{
		{PID: 10, Comm: "bash", Cmd: "/bin/bash", CWD: "/home/demo", FD0: "/dev/pts/1", Pgrp: 10, TTYNr: 34816, TPgid: 20},
		{PID: 20, Comm: "vim", Cmd: "/usr/bin/vim file.txt", CWD: "/home/demo/project", FD0: "/dev/pts/1", Pgrp: 20, TTYNr: 34816, TPgid: 20},
		{PID: 30, Comm: "sleep", Cmd: "/usr/bin/sleep 9", FD0: "/dev/pts/2", Pgrp: 30, TTYNr: 34817, TPgid: 30},
	}
	activity := resolveTTYActivity("/dev/pts/1", processes)
	if !activity.Busy {
		t.Fatalf("expected tty to be busy: %+v", activity)
	}
	if activity.Command != "vim" {
		t.Fatalf("expected foreground command vim, got %q", activity.Command)
	}
	if activity.CWD != "/home/demo/project" {
		t.Fatalf("expected foreground cwd, got %q", activity.CWD)
	}
}

func TestResolveTTYActivityTreatsIdleShellAsNotBusy(t *testing.T) {
	processes := []procInfo{
		{PID: 10, Comm: "bash", Cmd: "-bash", CWD: "/home/demo", FD0: "/dev/pts/1", Pgrp: 10, TTYNr: 34816, TPgid: 10},
	}
	activity := resolveTTYActivity("/dev/pts/1", processes)
	if activity.Busy {
		t.Fatalf("expected idle shell to be not busy: %+v", activity)
	}
	if activity.Command != "bash" {
		t.Fatalf("expected fallback command bash, got %q", activity.Command)
	}
	if activity.CWD != "/home/demo" {
		t.Fatalf("expected idle shell cwd, got %q", activity.CWD)
	}
}

func TestParseProcScanOutputIncludesCWD(t *testing.T) {
	output := []byte("P\t10\t/dev/pts/1\t/home/demo/project\t/bin/bash\t10 (bash) S 1 10 10 34816 10 0 0\n")
	processes := parseProcScanOutput(output)
	if len(processes) != 1 {
		t.Fatalf("expected one process, got %+v", processes)
	}
	if processes[0].CWD != "/home/demo/project" || processes[0].Cmd != "/bin/bash" {
		t.Fatalf("unexpected parsed process: %+v", processes[0])
	}
}

func TestRefreshAutoTabLabelsUsesActivePaneCWD(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1", cwd: "/home/demo/project", command: "bash"},
			"pane-2": {id: "pane-2", cwd: "/tmp", command: "bash"},
		},
		tabs: []*terminalTab{
			{ID: "tab-1", Label: "Shell 1", ActivePaneID: "pane-2", PaneIDs: []string{"pane-1", "pane-2"}},
			{ID: "tab-2", Label: "Manual", CustomLabel: true, ActivePaneID: "pane-1", PaneIDs: []string{"pane-1"}},
		},
	}
	workspace.refreshAutoTabLabelsLocked()
	if workspace.tabs[0].Label != "tmp" {
		t.Fatalf("expected active pane path label tmp, got %q", workspace.tabs[0].Label)
	}
	if workspace.tabs[1].Label != "Manual" {
		t.Fatalf("expected manual label to be preserved, got %q", workspace.tabs[1].Label)
	}
}

func TestResolveSourcePaneCWDLockedUsesRequestedPane(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1", cwd: "/home/demo/project"},
		},
		tabs:      []*terminalTab{{ID: "tab-1", ActivePaneID: "pane-1", PaneIDs: []string{"pane-1"}}},
		activeTab: "tab-1",
	}
	if got := workspace.resolveSourcePaneCWDLocked("tab-1", "pane-1"); got != "/home/demo/project" {
		t.Fatalf("expected source cwd, got %q", got)
	}
}

func TestDisplayPathLabelMatchesLightOSAdminAutoRename(t *testing.T) {
	cases := map[string]string{
		"/":                   "ROOT",
		"/home/demo/project":  "project",
		"/home/demo/project/": "project",
		"":                    "",
	}
	for input, want := range cases {
		if got := displayPathLabel(input); got != want {
			t.Fatalf("displayPathLabel(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestMoveTabLocked(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-1",
	}
	if err := workspace.moveTabLocked("tab-1", "right"); err != nil {
		t.Fatalf("move right returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-2", "tab-1", "tab-3")
	if workspace.activeTab != "tab-1" {
		t.Fatalf("expected moved tab to stay active, got %q", workspace.activeTab)
	}
	if err := workspace.moveTabLocked("tab-1", "last"); err != nil {
		t.Fatalf("move last returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-2", "tab-3", "tab-1")
	if err := workspace.moveTabLocked("tab-1", "first"); err != nil {
		t.Fatalf("move first returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-2", "tab-3")
}

func TestInsertTabAfterSourceLockedUsesRequestedTab(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-1",
	}
	workspace.insertTabAfterSourceLocked(&terminalTab{ID: "tab-new"}, "tab-2")
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-2", "tab-new", "tab-3")
}

func TestInsertTabAfterSourceLockedFallsBackToActiveTab(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-2",
	}
	workspace.insertTabAfterSourceLocked(&terminalTab{ID: "tab-new"}, "missing-tab")
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-2", "tab-new", "tab-3")
}

func TestCloseActiveTabSelectsRightThenLeftNeighbor(t *testing.T) {
	workspace := &terminalWorkspace{
		tabs: []*terminalTab{
			{ID: "tab-1"},
			{ID: "tab-2"},
			{ID: "tab-3"},
		},
		activeTab: "tab-2",
	}
	if err := workspace.closeTabLocked("tab-2"); err != nil {
		t.Fatalf("close tab-2 returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-1", "tab-3")
	if workspace.activeTab != "tab-3" {
		t.Fatalf("expected right neighbor tab-3 to become active, got %q", workspace.activeTab)
	}

	if err := workspace.closeTabLocked("tab-3"); err != nil {
		t.Fatalf("close tab-3 returned error: %v", err)
	}
	assertTabOrder(t, workspace.tabs, "tab-1")
	if workspace.activeTab != "tab-1" {
		t.Fatalf("expected left neighbor tab-1 to become active, got %q", workspace.activeTab)
	}
}

func TestClosePaneSelectsAdjacentSiblingWhenActivePaneExits(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1"},
			"pane-2": {id: "pane-2"},
			"pane-3": {id: "pane-3"},
		},
	}
	tab := &terminalTab{
		ID:           "tab-1",
		ActivePaneID: "pane-2",
		PaneIDs:      []string{"pane-1", "pane-2", "pane-3"},
		Layout: &layoutNode{
			Type:      "split",
			Direction: "vertical",
			Children: []*layoutNode{
				{Type: "leaf", PaneID: "pane-1"},
				{
					Type:      "split",
					Direction: "horizontal",
					Children: []*layoutNode{
						{Type: "leaf", PaneID: "pane-2"},
						{Type: "leaf", PaneID: "pane-3"},
					},
				},
			},
		},
	}
	if err := workspace.closePaneInTabLocked(tab, "pane-2"); err != nil {
		t.Fatalf("closePaneInTabLocked returned error: %v", err)
	}
	if tab.ActivePaneID != "pane-3" {
		t.Fatalf("expected adjacent sibling pane-3 to become active, got %q", tab.ActivePaneID)
	}
}

func TestClosePaneKeepsExistingActivePaneWhenInactivePaneExits(t *testing.T) {
	workspace := &terminalWorkspace{
		panes: map[string]*terminalPane{
			"pane-1": {id: "pane-1"},
			"pane-2": {id: "pane-2"},
		},
	}
	tab := &terminalTab{
		ID:           "tab-1",
		ActivePaneID: "pane-1",
		PaneIDs:      []string{"pane-1", "pane-2"},
		Layout: &layoutNode{
			Type:      "split",
			Direction: "vertical",
			Children: []*layoutNode{
				{Type: "leaf", PaneID: "pane-1"},
				{Type: "leaf", PaneID: "pane-2"},
			},
		},
	}
	if err := workspace.closePaneInTabLocked(tab, "pane-2"); err != nil {
		t.Fatalf("closePaneInTabLocked returned error: %v", err)
	}
	if tab.ActivePaneID != "pane-1" {
		t.Fatalf("expected active pane to remain pane-1, got %q", tab.ActivePaneID)
	}
}

func TestFilterPrivateControlOutputAcrossChunks(t *testing.T) {
	pane := &terminalPane{}
	first := pane.filterPrivateControlOutput([]byte("hello \x1b]777;webshell-"))
	if string(first) != "hello " {
		t.Fatalf("unexpected first output %q", string(first))
	}
	second := pane.filterPrivateControlOutput([]byte("tty=/dev/pts/3\a world"))
	if string(second) != " world" {
		t.Fatalf("unexpected second output %q", string(second))
	}
	if pane.tty != "/dev/pts/3" {
		t.Fatalf("expected tty to be captured, got %q", pane.tty)
	}
}

func assertTabOrder(t *testing.T, tabs []*terminalTab, want ...string) {
	t.Helper()
	if len(tabs) != len(want) {
		t.Fatalf("tab count mismatch: got %d want %d", len(tabs), len(want))
	}
	for index := range want {
		if tabs[index].ID != want[index] {
			t.Fatalf("tab at index %d = %q, want %q", index, tabs[index].ID, want[index])
		}
	}
}

func containsAll(text string, values ...string) bool {
	for _, value := range values {
		if !strings.Contains(text, value) {
			return false
		}
	}
	return true
}
