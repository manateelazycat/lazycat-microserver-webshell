//go:build linux || darwin

package unix

import (
	"errors"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
	sys "golang.org/x/sys/unix"
	"lcmd-webshell/core"
	"lcmd-webshell/localtools"
	"strings"
)

func (p LocalPlatform) SSHCommand(command string, _ bool) *exec.Cmd {
	base := p.Command(core.Launch{RootDir: p.DefaultWorkingDirectory()})
	cmd := exec.Command(base.Path, "-c", command)
	cmd.Dir, cmd.Env = base.Dir, base.Env
	return cmd
}
func (LocalPlatform) StartSSHCommand(cmd *exec.Cmd) error {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}
func (LocalPlatform) KillSSHCommand(cmd *exec.Cmd) error {
	killLocalSession(cmd)
	return KillCommand(cmd)
}
func (LocalPlatform) ExitSSHSignal(cmd *exec.Cmd) string {
	if cmd.ProcessState == nil {
		return ""
	}
	status, ok := cmd.ProcessState.Sys().(syscall.WaitStatus)
	if !ok || !status.Signaled() {
		return ""
	}
	names := map[syscall.Signal]string{syscall.SIGABRT: "ABRT", syscall.SIGALRM: "ALRM", syscall.SIGFPE: "FPE", syscall.SIGHUP: "HUP", syscall.SIGILL: "ILL", syscall.SIGINT: "INT", syscall.SIGKILL: "KILL", syscall.SIGPIPE: "PIPE", syscall.SIGQUIT: "QUIT", syscall.SIGSEGV: "SEGV", syscall.SIGTERM: "TERM", syscall.SIGUSR1: "USR1", syscall.SIGUSR2: "USR2"}
	return names[status.Signal()]
}

func (LocalPlatform) SignalSSHCommand(cmd *exec.Cmd, stream core.PTY, name string) error {
	signals := map[string]syscall.Signal{"ABRT": syscall.SIGABRT, "ALRM": syscall.SIGALRM, "FPE": syscall.SIGFPE, "HUP": syscall.SIGHUP, "ILL": syscall.SIGILL, "INT": syscall.SIGINT, "KILL": syscall.SIGKILL, "PIPE": syscall.SIGPIPE, "QUIT": syscall.SIGQUIT, "SEGV": syscall.SIGSEGV, "TERM": syscall.SIGTERM, "USR1": syscall.SIGUSR1, "USR2": syscall.SIGUSR2}
	signal, ok := signals[name]
	if !ok || cmd.Process == nil {
		return errors.New("unsupported process signal")
	}
	group := cmd.Process.Pid
	if terminal, ok := stream.(*localPTY); ok {
		foreground, err := sys.IoctlGetInt(int(terminal.Fd()), sys.TIOCGPGRP)
		if err != nil {
			return err
		}
		if foreground > 1 {
			group = foreground
		}
	}
	if group <= 1 {
		return errors.New("process group unavailable")
	}
	return syscall.Kill(-group, signal)
}
func (LocalPlatform) StartSSHPTY(cmd *exec.Cmd, size core.ShellSize, modes map[uint8]uint32) (core.PTY, error) {
	master, slave, err := pty.Open()
	if err != nil {
		return nil, err
	}
	defer slave.Close()
	fail := func(err error) (core.PTY, error) { master.Close(); return nil, err }
	if err = applySSHModes(int(slave.Fd()), modes); err != nil {
		return fail(err)
	}
	if err = pty.Setsize(master, &pty.Winsize{Cols: uint16(size.Cols), Rows: uint16(size.Rows), X: uint16(size.PixelWidth), Y: uint16(size.PixelHeight)}); err != nil {
		return fail(err)
	}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = slave, slave, slave
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true}
	if err = cmd.Start(); err != nil {
		return fail(err)
	}
	return &localPTY{File: master, tty: strings.TrimPrefix(slave.Name(), "/dev/"), cmd: cmd, reader: localtools.NewTextReader(master)}, nil
}
