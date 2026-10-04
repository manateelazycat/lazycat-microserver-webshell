package core

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// ShellSessions owns ephemeral interactive shells independently of browser tabs.
// It shares Platform PTY/environment/cleanup behavior, not the workspace layout.
type ShellSessions struct {
	mu        sync.Mutex
	platform  Platform
	cancel    context.CancelFunc
	ctx       context.Context
	closed    bool
	failure   error
	closeOnce sync.Once
	sessions  map[*ShellSession]struct{}
}

type ShellSize struct{ Cols, Rows, PixelWidth, PixelHeight int }

func (s ShellSize) Validate() error {
	if s.Cols < 1 || s.Rows < 1 || s.Cols > 4096 || s.Rows > 4096 || s.Cols*s.Rows > 1<<20 || s.PixelWidth < 0 || s.PixelHeight < 0 || s.PixelWidth > 65535 || s.PixelHeight > 65535 {
		return errors.New("invalid terminal size")
	}
	return nil
}

func NewShellSessions(ctx context.Context, platform Platform) *ShellSessions {
	ctx, cancel := context.WithCancel(ctx)
	s := &ShellSessions{ctx: ctx, cancel: cancel, platform: platform, sessions: make(map[*ShellSession]struct{})}
	context.AfterFunc(ctx, s.Close)
	return s
}

func (s *ShellSessions) Open(ctx context.Context, term string, size ShellSize) (*ShellSession, error) {
	return s.open(ctx, ShellOptions{Term: term, Size: size})
}

func (s *ShellSessions) open(ctx context.Context, options ShellOptions) (*ShellSession, error) {
	term, size := options.Term, options.Size
	if err := size.Validate(); err != nil {
		return nil, err
	}
	if len(term) == 0 || len(term) > 64 {
		return nil, errors.New("invalid terminal type")
	}
	for _, ch := range term {
		if ch < 33 || ch > 126 {
			return nil, errors.New("invalid terminal type")
		}
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	cmd := s.platform.Command(Launch{RootDir: s.platform.DefaultWorkingDirectory()})
	if options.Execute {
		p, ok := s.platform.(SSHPlatform)
		if !ok {
			return nil, errors.New("command execution unavailable")
		}
		cmd = p.SSHCommand(options.Command, true)
	}
	cmd.Env = ShellEnvironment(cmd.Env, options.Env)
	env := make([]string, 0, len(cmd.Env)+1)
	for _, entry := range cmd.Env {
		key, _, _ := strings.Cut(entry, "=")
		if !strings.EqualFold(key, "TERM") {
			env = append(env, entry)
		}
	}
	cmd.Env = append(env, "TERM="+term)
	s.mu.Lock()
	if s.closed || s.failure != nil || s.ctx.Err() != nil || ctx.Err() != nil {
		s.mu.Unlock()
		return nil, errors.New("terminal access disabled")
	}
	if len(s.sessions) >= 32 {
		s.mu.Unlock()
		return nil, errors.New("too many terminal sessions")
	}
	var stream PTY
	var err error
	if p, ok := s.platform.(SSHPlatform); ok {
		stream, err = p.StartSSHPTY(cmd, size, options.Modes)
	} else {
		stream, err = s.platform.StartPTY(cmd)
	}
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session := &ShellSession{owner: s, cmd: cmd, stream: stream, done: make(chan struct{})}
	s.sessions[session] = struct{}{}
	s.mu.Unlock()
	go func() { session.waitErr = s.platform.WaitCommand(cmd); close(session.done) }()
	stop := context.AfterFunc(ctx, func() { _ = session.Close() })
	session.mu.Lock()
	session.stop = stop
	if session.closed {
		stop()
	}
	session.mu.Unlock()
	if err = session.Resize(size); err != nil {
		_ = session.Close()
		return nil, err
	}
	return session, nil
}

func (s *ShellSessions) Close() {
	s.closeOnce.Do(func() {
		s.cancel()
		s.mu.Lock()
		s.closed = true
		items := make([]*ShellSession, 0, len(s.sessions))
		for item := range s.sessions {
			items = append(items, item)
		}
		s.mu.Unlock()
		for _, item := range items {
			_ = item.Close()
		}
	})
}

func (s *ShellSessions) CleanupError() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.failure
}

type ShellSession struct {
	owner     *ShellSessions
	cmd       *exec.Cmd
	stream    PTY
	done      chan struct{}
	waitErr   error
	mu        sync.Mutex
	closed    bool
	stop      func() bool
	closeOnce sync.Once
	closeErr  error
}

func (s *ShellSession) Read(p []byte) (int, error)  { return s.stream.Read(p) }
func (s *ShellSession) Write(p []byte) (int, error) { return s.stream.Write(p) }
func (s *ShellSession) Done() <-chan struct{}       { return s.done }
func (s *ShellSession) ExitCode() uint32 {
	<-s.done
	if s.cmd.ProcessState != nil {
		code := s.cmd.ProcessState.ExitCode()
		if code >= 0 {
			return uint32(code)
		}
	}
	if s.waitErr == nil {
		return 0
	}
	return 255
}
func (s *ShellSession) Resize(size ShellSize) error {
	if err := size.Validate(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return errors.New("terminal session closed")
	}
	return s.owner.platform.ResizePTY(s.stream, size.Cols, size.Rows, size.PixelWidth, size.PixelHeight)
}
func (s *ShellSession) Close() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		if s.stop != nil {
			s.stop()
		}
		s.mu.Unlock()
		_ = s.stream.Close()
		s.closeErr = s.owner.platform.KillCommand(s.cmd)
		timer := time.NewTimer(2 * time.Second)
		defer timer.Stop()
		select {
		case <-s.done:
		case <-timer.C:
			s.closeErr = errors.New("terminal process cleanup timed out")
		}
		s.owner.mu.Lock()
		if s.closeErr != nil {
			s.owner.failure = s.closeErr
		} else {
			delete(s.owner.sessions, s)
		}
		s.owner.mu.Unlock()
	})
	return s.closeErr
}
