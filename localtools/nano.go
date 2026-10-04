package localtools

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

func InstallNanoWrapper(executable string) (string, func(), error) {
	dir, err := os.MkdirTemp("", "lightos-terminal-tools-")
	if err != nil {
		return "", nil, err
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	quoted := "'" + strings.ReplaceAll(executable, "'", "'\\''") + "'"
	script := "#!/bin/sh\nexec " + quoted + " nano \"$@\"\n"
	if err := os.WriteFile(filepath.Join(dir, "nano"), []byte(script), 0700); err != nil {
		cleanup()
		return "", nil, err
	}
	return dir, cleanup, nil
}

// RunNano edits a UTF-8 temporary copy for legacy files, then commits only after
// nano exits successfully, preserving the previous PC wrapper's conversion rule.
func RunNano(arguments []string) int {
	wrapper := os.Getenv("LIGHTOS_CLIENT_TERMINAL_WRAPPER_DIR")
	var paths []string
	for _, p := range filepath.SplitList(os.Getenv("PATH")) {
		if p != wrapper {
			paths = append(paths, p)
		}
	}
	_ = os.Setenv("PATH", strings.Join(paths, string(os.PathListSeparator)))
	nano, err := exec.LookPath("nano")
	if err != nil {
		fmt.Fprintln(os.Stderr, "nano is unavailable")
		return 127
	}
	dir, err := os.MkdirTemp("", "lightos-nano-")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer os.RemoveAll(dir)
	type target struct {
		original, temporary string
		mode                os.FileMode
	}
	var targets []target
	args := append([]string(nil), arguments...)
	for _, index := range editableArguments(args) {
		original, err := filepath.Abs(args[index])
		if err != nil {
			continue
		}
		stat, err := os.Stat(original)
		if err != nil || !stat.Mode().IsRegular() {
			continue
		}
		data, err := os.ReadFile(original)
		if err != nil {
			continue
		}
		decoded := DecodeText(data)
		if bytes.Equal(decoded, data) {
			continue
		}
		temporary := filepath.Join(dir, fmt.Sprintf("%d-%s", index, filepath.Base(original)))
		if err := os.WriteFile(temporary, decoded, stat.Mode().Perm()); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		targets = append(targets, target{original, temporary, stat.Mode()})
		args[index] = temporary
	}
	cmd := exec.Command(nano, args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		if e, ok := err.(*exec.ExitError); ok {
			return e.ExitCode()
		}
		fmt.Fprintln(os.Stderr, err)
		return 127
	}
	for _, t := range targets {
		updated, err := os.ReadFile(t.temporary)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		if !utf8.Valid(updated) {
			continue
		}
		if err := os.WriteFile(t.original, updated, t.mode.Perm()); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		if err := os.Chmod(t.original, t.mode); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
	}
	return 0
}

var nanoPosition = regexp.MustCompile(`^\+\d+(,\d+)?$`)

func editableArguments(args []string) []int {
	long := " backupdir brackets fill guidestripe matchbrackets operatingdir punct quotestr speller syntax tabsize wordchars "
	short := "CQTYors"
	var indexes []int
	positional, skip := false, false
	for i, arg := range args {
		if skip {
			skip = false
			continue
		}
		if !positional {
			if arg == "--" {
				positional = true
				continue
			}
			if nanoPosition.MatchString(arg) {
				continue
			}
			if strings.HasPrefix(arg, "-") && arg != "-" {
				if strings.HasPrefix(arg, "--") {
					skip = !strings.Contains(arg, "=") && strings.Contains(long, " "+strings.TrimPrefix(arg, "--")+" ")
				} else {
					skip = len(arg) == 2 && strings.ContainsRune(short, rune(arg[1]))
				}
				continue
			}
		}
		indexes = append(indexes, i)
	}
	return indexes
}
