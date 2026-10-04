package core

import (
	"context"
	"path/filepath"
	"strings"
	"time"
)

type paneActivityTarget struct {
	ID  string
	TTY string
}

func (w *terminalWorkspace) refreshActivity(ctx context.Context) (WorkspaceActivityState, error) {
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
	var activities map[string]PaneActivity
	var err error
	if w.localPTY {
		activities, err = w.runtime.platform.ScanActivities(ctx, ttys)
	} else {
		activities, err = w.runtime.targets.ScanActivities(ctx, selector, ttys)
	}
	if err == nil {
		checkedAt := time.Now()
		w.mu.Lock()
		for _, target := range targets {
			pane := w.panes[target.ID]
			if pane == nil {
				continue
			}
			activity, found := activities[target.TTY]
			if !found {
				continue
			}
			pane.mu.Lock()
			pane.busy = activity.Busy
			pane.command = activity.Command
			pane.commandLine = activity.CommandLine
			if activity.CWD != "" {
				pane.cwd = activity.CWD
			}
			pane.activityCheckedAt = checkedAt
			pane.mu.Unlock()
		}
		w.refreshAutoTabLabelsLocked()
		w.mu.Unlock()
	}

	return WorkspaceActivityState{
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

func unixMillis(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixNano() / int64(time.Millisecond)
}
