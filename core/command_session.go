package core

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

// CommandSession owns a non-PTY command. Pipes are owned here, rather than by
// exec.Cmd.Wait, so process exit cannot close a pipe before its reader drains it.
type CommandSession struct {
	cmd            *exec.Cmd
	platform       SSHPlatform
	Stdin          io.WriteCloser
	Stdout, Stderr io.ReadCloser
	done           chan struct{}
	once           sync.Once
	waitErr        error
	closeErr       error
}

func StartShellCommand(ctx context.Context, platform Platform, command string, env []string) (*CommandSession, error) {
	p, ok := platform.(SSHPlatform)
	if !ok {
		return nil, errors.New("command execution unavailable")
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	cmd := p.SSHCommand(command, false)
	cmd.Env = ShellEnvironment(cmd.Env, env)
	var files []*os.File
	pipe := func() (*os.File, *os.File, error) {
		r, w, err := os.Pipe()
		if err == nil {
			files = append(files, r, w)
		}
		return r, w, err
	}
	defer func() {
		for _, f := range files {
			_ = f.Close()
		}
	}()
	in, input, err := pipe()
	if err != nil {
		return nil, err
	}
	output, out, err := pipe()
	if err != nil {
		return nil, err
	}
	errorsOut, errout, err := pipe()
	if err != nil {
		return nil, err
	}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = in, out, errout
	if err = p.StartSSHCommand(cmd); err != nil {
		return nil, err
	}
	_ = in.Close()
	_ = out.Close()
	_ = errout.Close()
	files = nil
	s := &CommandSession{cmd: cmd, platform: p, Stdin: input, Stdout: output, Stderr: errorsOut, done: make(chan struct{})}
	go func() { s.waitErr = cmd.Wait(); close(s.done) }()
	context.AfterFunc(ctx, func() { _ = s.Close() })
	return s, nil
}
func (s *CommandSession) Done() <-chan struct{} { return s.done }
func (s *CommandSession) ExitCode() uint32 {
	<-s.done
	if s.cmd.ProcessState != nil && s.cmd.ProcessState.ExitCode() >= 0 {
		return uint32(s.cmd.ProcessState.ExitCode())
	}
	if s.waitErr != nil {
		return 255
	}
	return 0
}
func (s *CommandSession) ExitSignal() string { <-s.done; return s.platform.ExitSSHSignal(s.cmd) }
func (s *CommandSession) Signal(name string) error {
	select {
	case <-s.done:
		return errors.New("command exited")
	default:
	}
	return s.platform.SignalSSHCommand(s.cmd, nil, name)
}
func (s *CommandSession) Close() error {
	s.once.Do(func() {
		s.closeErr = s.platform.KillSSHCommand(s.cmd)
		_ = s.Stdin.Close()
		_ = s.Stdout.Close()
		_ = s.Stderr.Close()
		select {
		case <-s.done:
		case <-time.After(2 * time.Second):
			s.closeErr = errors.Join(s.closeErr, errors.New("command process cleanup timed out"))
		}
	})
	return s.closeErr
}
