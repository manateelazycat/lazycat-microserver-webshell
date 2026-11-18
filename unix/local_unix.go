//go:build linux || darwin

package unix

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	terminalpty "gitee.com/linakesi/hportal/misc/cli/pty"
	"lcmd-webshell/core"
	"lcmd-webshell/localtools"
)

// LocalPlatform never uses the Linux container user-switch/bootstrap scripts.
type LocalPlatform struct {
	Platform
	ToolsDir string
}

func (LocalPlatform) DefaultWorkingDirectory() string {
	home, _ := os.UserHomeDir()
	return home
}

func (p LocalPlatform) Command(launch core.Launch) *exec.Cmd {
	shell := localAccountShell()
	args := []string{"-i"}
	if runtime.GOOS == "darwin" {
		args = []string{"-il"}
	}
	if filepath.Base(shell) == "fish" {
		args = []string{"--interactive"}
		if runtime.GOOS == "darwin" {
			args = append(args, "--login")
		}
	}
	cmd := exec.Command(shell, args...)
	cmd.Env = core.LocalEnvironment(os.Environ())
	cmd.Env = append(cmd.Env, "SHELL="+shell)
	if p.ToolsDir != "" {
		cmd.Env = append(cmd.Env, "PATH="+p.ToolsDir+string(os.PathListSeparator)+os.Getenv("PATH"), "LIGHTOS_CLIENT_TERMINAL_WRAPPER_DIR="+p.ToolsDir)
	}
	locale := "C.UTF-8"
	if runtime.GOOS == "darwin" {
		locale = "en_US.UTF-8"
	}
	for _, key := range []string{"LC_ALL", "LC_CTYPE", "LANG"} {
		value := strings.ToUpper(os.Getenv(key))
		if strings.Contains(value, "UTF-8") || strings.Contains(value, "UTF8") {
			locale = os.Getenv(key)
			break
		}
	}
	for _, key := range []string{"LANG", "LC_ALL", "LC_CTYPE"} {
		value := strings.ToUpper(os.Getenv(key))
		if !strings.Contains(value, "UTF-8") && !strings.Contains(value, "UTF8") {
			cmd.Env = append(cmd.Env, key+"="+locale)
		}
	}
	cmd.Dir = launch.InitialCWD
	if cmd.Dir == "" {
		cmd.Dir = launch.RootDir
	}
	if stat, err := os.Stat(cmd.Dir); err != nil || !stat.IsDir() {
		cmd.Dir = launch.RootDir
	}
	return cmd
}

func localAccountShell() string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	accountShell := ""
	if u, err := user.Current(); err == nil {
		if runtime.GOOS == "darwin" {
			if out, err := exec.CommandContext(ctx, "/usr/bin/dscl", ".", "-read", "/Users/"+u.Username, "UserShell").Output(); err == nil {
				_, accountShell, _ = strings.Cut(strings.TrimSpace(string(out)), ":")
			}
		} else if out, err := exec.CommandContext(ctx, "getent", "passwd", u.Uid).Output(); err == nil {
			parts := strings.Split(strings.TrimSpace(string(out)), ":")
			if len(parts) >= 7 {
				accountShell = parts[6]
			}
		}
	}
	defaults := []string{accountShell, os.Getenv("SHELL"), "/bin/bash", "/bin/sh"}
	if runtime.GOOS == "darwin" {
		defaults = []string{accountShell, os.Getenv("SHELL"), "/bin/zsh", "/bin/bash", "/bin/sh"}
	}
	for _, candidate := range defaults {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if resolved, err := exec.LookPath(candidate); err == nil {
			return resolved
		}
	}
	return "/bin/sh"
}

type localPTY struct {
	*terminalpty.PTY
	tty    string
	cmd    *exec.Cmd
	once   sync.Once
	reader io.Reader
}

func (p *localPTY) Read(dst []byte) (int, error) { return p.reader.Read(dst) }

func (p *localPTY) TTYName() string                 { return p.tty }
func (p *localPTY) InitialWorkingDirectory() string { return p.cmd.Dir }
func (p *localPTY) Close() error {
	p.once.Do(func() { killLocalSession(p.cmd); _ = p.PTY.Close() })
	return nil
}

func (LocalPlatform) StartPTY(cmd *exec.Cmd) (core.PTY, error) {
	return startLocalPTY(cmd, core.ShellSize{Cols: 120, Rows: 32}, nil)
}
func startLocalPTY(cmd *exec.Cmd, size core.ShellSize, prepare func(int) error) (core.PTY, error) {
	terminal, err := terminalpty.New(size.Cols, size.Rows)
	if err != nil {
		return nil, err
	}
	fail := func(err error) (core.PTY, error) { _ = terminal.Close(); return nil, err }
	if prepare != nil {
		slave := terminal.Pty.(interface{ Slave() *os.File }).Slave()
		if err := prepare(int(slave.Fd())); err != nil {
			return fail(err)
		}
	}
	if err := resizeLocalPTY(terminal, size.Cols, size.Rows, size.PixelWidth, size.PixelHeight); err != nil {
		return fail(err)
	}
	if err := terminal.Start(cmd); err != nil {
		return fail(err)
	}
	return &localPTY{PTY: terminal, tty: strings.TrimPrefix(terminal.Name(), "/dev/"), cmd: cmd, reader: localtools.NewTextReader(terminal)}, nil
}
func resizeLocalPTY(terminal *terminalpty.PTY, cols, rows, x, y int) error {
	return terminal.Pty.(interface {
		SetWinsize(int, int, int, int) error
	}).SetWinsize(cols, rows, x, y)
}
func (LocalPlatform) WaitCommand(cmd *exec.Cmd) error { return terminalpty.Wait(cmd) }
func (LocalPlatform) ResizePTY(stream core.PTY, cols, rows, x, y int) error {
	p, ok := stream.(*localPTY)
	if !ok {
		return errors.New("unexpected local PTY")
	}
	return resizeLocalPTY(p.PTY, cols, rows, x, y)
}
func (LocalPlatform) KillCommand(cmd *exec.Cmd) error { return KillCommand(cmd) }

var _ core.Platform = LocalPlatform{}
