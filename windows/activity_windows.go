//go:build windows

package windows

import (
	"context"
	win "golang.org/x/sys/windows"
	"lcmd-webshell/core"
	"os/exec"
	"unsafe"
)

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
	type entry struct {
		pid, parent uint32
		name        string
	}
	var entries []entry
	e := win.ProcessEntry32{Size: uint32(unsafe.Sizeof(win.ProcessEntry32{}))}
	for err = win.Process32First(snapshot, &e); err == nil; err = win.Process32Next(snapshot, &e) {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		entries = append(entries, entry{e.ProcessID, e.ParentProcessID, win.UTF16ToString(e.ExeFile[:])})
	}
	p.panes.Range(func(key, value any) bool {
		cmd, t := key.(*exec.Cmd), value.(*terminal)
		if !wanted[t.id] {
			return true
		}
		activity := core.PaneActivity{TTY: t.id, Command: "powershell.exe"}
		owned := map[uint32]bool{uint32(cmd.Process.Pid): true}
		for changed := true; changed; {
			changed = false
			for _, child := range entries {
				if !owned[child.pid] && owned[child.parent] {
					owned[child.pid] = true
					changed = true
					activity.Busy = true
					activity.Command = child.name
					activity.CommandLine = child.name
				}
			}
		}
		result[t.id] = activity
		return true
	})
	return result, nil
}
