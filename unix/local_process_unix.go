//go:build linux || darwin

package unix

import (
	"context"
	unixsys "golang.org/x/sys/unix"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Capture the owned terminal session before closing the PTY (which can orphan
// shell jobs). Never search by executable name or touch another user's session.
func killLocalSession(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "ps", "-axo", "pid=,ppid=").Output()
	if err == nil {
		type entry struct{ pid, parent, session int }
		var entries []entry
		for _, line := range strings.Split(string(out), "\n") {
			fields := strings.Fields(line)
			if len(fields) != 2 {
				continue
			}
			p, _ := strconv.Atoi(fields[0])
			parent, _ := strconv.Atoi(fields[1])
			session, _ := unixsys.Getsid(p)
			entries = append(entries, entry{p, parent, session})
		}
		owned := map[int]bool{pid: true}
		for changed := true; changed; {
			changed = false
			for _, e := range entries {
				if e.pid > 1 && !owned[e.pid] && (owned[e.parent] || e.session == pid) {
					owned[e.pid] = true
					changed = true
				}
			}
		}
		for p := range owned {
			if p != pid {
				_ = syscall.Kill(p, syscall.SIGKILL)
			}
		}
	}
	_ = cmd.Process.Kill()
}
