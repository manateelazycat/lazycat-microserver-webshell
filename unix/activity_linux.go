//go:build linux

package unix

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var privateTTYPattern = regexp.MustCompile(`^/dev/pts/[0-9]+$`)

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

const ProcScanScript = `for d in /proc/[0-9]*; do
  pid="${d##*/}"
  stat="$(cat "$d/stat" 2>/dev/null)" || continue
  fd0="$(readlink "$d/fd/0" 2>/dev/null || true)"
  cwd="$(readlink "$d/cwd" 2>/dev/null || true)"
  cmd="$(tr '\000\011\012\015' '    ' < "$d/cmdline" 2>/dev/null || true)"
  printf 'P\t%s\t%s\t%s\t%s\t%s\n' "$pid" "$fd0" "$cwd" "$cmd" "$stat"
done`

func ScanLocalActivities(ctx context.Context, ttys []string) (map[string]PaneActivity, error) {
	scanCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	return scanProcActivities(scanCtx, "/proc", ttys)
}

func scanProcActivities(ctx context.Context, procRoot string, ttys []string) (map[string]PaneActivity, error) {
	result := make(map[string]PaneActivity, len(ttys))
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
		result[tty] = PaneActivity{TTY: tty}
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
		result[tty] = ResolveTTYActivity(tty, processes)
	}
	return result, nil
}

func NormalizeActivityTTYs(ttys []string) (map[string]PaneActivity, []string) {
	result := make(map[string]PaneActivity, len(ttys))
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
		result[tty] = PaneActivity{TTY: tty}
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

func ParseProcScanOutput(output []byte) []procInfo {
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

func ResolveTTYActivity(tty string, processes []procInfo) PaneActivity {
	activity := PaneActivity{TTY: tty}
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
