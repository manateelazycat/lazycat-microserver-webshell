package main

import "testing"

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
		{PID: 10, Comm: "bash", Cmd: "/bin/bash", FD0: "/dev/pts/1", Pgrp: 10, TTYNr: 34816, TPgid: 20},
		{PID: 20, Comm: "vim", Cmd: "/usr/bin/vim file.txt", FD0: "/dev/pts/1", Pgrp: 20, TTYNr: 34816, TPgid: 20},
		{PID: 30, Comm: "sleep", Cmd: "/usr/bin/sleep 9", FD0: "/dev/pts/2", Pgrp: 30, TTYNr: 34817, TPgid: 30},
	}
	activity := resolveTTYActivity("/dev/pts/1", processes)
	if !activity.Busy {
		t.Fatalf("expected tty to be busy: %+v", activity)
	}
	if activity.Command != "vim" {
		t.Fatalf("expected foreground command vim, got %q", activity.Command)
	}
}

func TestResolveTTYActivityTreatsIdleShellAsNotBusy(t *testing.T) {
	processes := []procInfo{
		{PID: 10, Comm: "bash", Cmd: "-bash", FD0: "/dev/pts/1", Pgrp: 10, TTYNr: 34816, TPgid: 10},
	}
	activity := resolveTTYActivity("/dev/pts/1", processes)
	if activity.Busy {
		t.Fatalf("expected idle shell to be not busy: %+v", activity)
	}
	if activity.Command != "bash" {
		t.Fatalf("expected fallback command bash, got %q", activity.Command)
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
