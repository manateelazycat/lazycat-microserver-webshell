//go:build darwin

package unix

import (
	"context"
	"lcmd-webshell/core"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func scanDarwinActivities(ctx context.Context, ttys []string) (map[string]core.PaneActivity, error) {
	ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	wanted := make(map[string]bool, len(ttys))
	for _, tty := range ttys {
		if localTTY.MatchString(tty) {
			wanted[tty] = true
		}
	}
	result := make(map[string]core.PaneActivity)
	if len(wanted) == 0 {
		return result, nil
	}
	out, err := exec.CommandContext(ctx, "/bin/ps", "-axo", "pid=,stat=,tty=,comm=").Output()
	if err != nil {
		return nil, err
	}
	pids := make(map[string]string)
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 || !wanted[fields[2]] {
			continue
		}
		if _, err := strconv.Atoi(fields[0]); err != nil {
			continue
		}
		tty := fields[2]
		command := strings.Join(fields[3:], " ")
		name := filepath.Base(command)
		busy := strings.Contains(fields[1], "+") && name != "bash" && name != "zsh" && name != "fish" && name != "sh" && name != "-zsh" && name != "-bash"
		if current, ok := result[tty]; ok && (current.Busy || !busy) {
			continue
		}
		result[tty] = core.PaneActivity{TTY: tty, Busy: busy, Command: name, CommandLine: command}
		pids[tty] = fields[0]
	}
	var selected []string
	byPID := map[string]string{}
	for tty, pid := range pids {
		selected = append(selected, pid)
		byPID[pid] = tty
	}
	if len(selected) > 0 {
		out, err = exec.CommandContext(ctx, "/usr/sbin/lsof", "-a", "-p", strings.Join(selected, ","), "-d", "cwd", "-Fn").Output()
		if err == nil {
			tty := ""
			for _, line := range strings.Split(string(out), "\n") {
				if strings.HasPrefix(line, "p") {
					tty = byPID[strings.TrimPrefix(line, "p")]
				}
				if tty != "" && strings.HasPrefix(line, "n") {
					a := result[tty]
					a.CWD = line[1:]
					result[tty] = a
				}
			}
		}
	}
	return result, nil
}
