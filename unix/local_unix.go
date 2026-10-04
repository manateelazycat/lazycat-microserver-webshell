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
	"syscall"
	"time"

	"github.com/creack/pty"
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
	*os.File
	tty    string
	cmd    *exec.Cmd
	once   sync.Once
	reader io.Reader
}

func (p *localPTY) Read(dst []byte) (int, error) { return p.reader.Read(dst) }

func (p *localPTY) TTYName() string                 { return p.tty }
func (p *localPTY) InitialWorkingDirectory() string { return p.cmd.Dir }
func (p *localPTY) Close() error {
	p.once.Do(func() { killLocalSession(p.cmd); _ = p.File.Close() })
	return nil
}

func (LocalPlatform) StartPTY(cmd *exec.Cmd) (core.PTY, error) {
	master, slave, err := pty.Open()
	if err != nil {
		return nil, err
	}
	defer slave.Close()
	cmd.Stdin, cmd.Stdout, cmd.Stderr = slave, slave, slave
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true}
	if err := cmd.Start(); err != nil {
		_ = master.Close()
		return nil, err
	}
	return &localPTY{File: master, tty: strings.TrimPrefix(slave.Name(), "/dev/"), cmd: cmd, reader: localtools.NewTextReader(master)}, nil
}
func (LocalPlatform) ResizePTY(stream core.PTY, cols, rows, x, y int) error {
	p, ok := stream.(*localPTY)
	if !ok {
		return errors.New("unexpected local PTY")
	}
	return pty.Setsize(p.File, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows), X: uint16(x), Y: uint16(y)})
}
func (LocalPlatform) KillCommand(cmd *exec.Cmd) error { return KillCommand(cmd) }

var _ core.Platform = LocalPlatform{}
