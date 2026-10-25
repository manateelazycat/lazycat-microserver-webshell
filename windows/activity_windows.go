//go:build windows

package windows

import (
	"context"
	"errors"
	win "golang.org/x/sys/windows"
	"lcmd-webshell/core"
	"os/exec"
	"strings"
	"unsafe"
)

type activityProcess struct {
	pid     uint32
	name    string
	created uint64
}

func isActivityShell(name string) bool {
	switch strings.ToLower(name) {
	case "cmd.exe", "powershell.exe", "pwsh.exe":
		return true
	}
	return false
}

// Prefer the most recently launched branch of the pane's shell, unwrapping
// nested shells but retaining the application launcher. A TUI's helper
// children must not replace its identity just because they appear later in
// the process snapshot. ConPTY has no POSIX foreground process group API.
func selectActivityProcess(ctx context.Context, root uint32, parentCreated uint64, children map[uint32][]activityProcess, visited map[uint32]bool) *activityProcess {
	if ctx.Err() != nil || visited[root] {
		return nil
	}
	visited[root] = true
	var selected *activityProcess
	for _, child := range children[root] {
		if ctx.Err() != nil {
			return nil
		}
		switch strings.ToLower(child.name) {
		case "conhost.exe", "openconsole.exe":
			continue
		}
		child.created = activityProcessCreated(child.pid)
		if child.created == 0 || child.created < parentCreated {
			continue
		}
		if selected == nil || child.created > selected.created || child.created == selected.created && child.pid > selected.pid {
			copy := child
			selected = &copy
		}
	}
	if selected != nil && isActivityShell(selected.name) {
		if child := selectActivityProcess(ctx, selected.pid, selected.created, children, visited); child != nil {
			return child
		}
	}
	return selected
}

func (p *Platform) ScanActivities(ctx context.Context, ttys []string) (map[string]core.PaneActivity, error) {
	wanted := map[string]bool{}
	for _, tty := range ttys {
		wanted[tty] = true
	}
	result := make(map[string]core.PaneActivity)
	snapshot, err := win.CreateToolhelp32Snapshot(win.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer win.CloseHandle(snapshot)
	children := make(map[uint32][]activityProcess)
	e := win.ProcessEntry32{Size: uint32(unsafe.Sizeof(win.ProcessEntry32{}))}
	for err = win.Process32First(snapshot, &e); err == nil; err = win.Process32Next(snapshot, &e) {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		children[e.ParentProcessID] = append(children[e.ParentProcessID], activityProcess{
			pid: e.ProcessID, name: win.UTF16ToString(e.ExeFile[:]),
		})
	}
	if !errors.Is(err, win.ERROR_NO_MORE_FILES) {
		return nil, err
	}
	p.panes.Range(func(key, value any) bool {
		cmd, t := key.(*exec.Cmd), value.(*terminal)
		if !wanted[t.id] {
			return true
		}
		activity := core.PaneActivity{TTY: t.id, Command: "powershell.exe"}
		root := uint32(cmd.Process.Pid)
		if created := activityProcessCreated(root); created != 0 {
			if child := selectActivityProcess(ctx, root, created, children, make(map[uint32]bool)); child != nil {
				activity.Busy = true
				activity.Command = child.name
				activity.CommandLine = activityProcessCommandLine(child.pid, child.created)
			}
		}
		result[t.id] = activity
		return true
	})
	return result, ctx.Err()
}
