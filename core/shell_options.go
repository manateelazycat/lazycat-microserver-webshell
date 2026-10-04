package core

import (
	"context"
	"errors"
	"strings"
)

type ShellOptions struct {
	Term    string
	Size    ShellSize
	Command string
	Execute bool
	Env     []string
	Modes   map[uint8]uint32
}

func ShellEnvironment(base, extra []string) []string {
	result := append([]string(nil), base...)
	for _, item := range extra {
		key, _, ok := strings.Cut(item, "=")
		if !ok {
			continue
		}
		filtered := result[:0]
		for _, old := range result {
			k, _, _ := strings.Cut(old, "=")
			if !strings.EqualFold(k, key) {
				filtered = append(filtered, old)
			}
		}
		result = append(filtered, item)
	}
	return result
}

func (s *ShellSessions) OpenWithOptions(ctx context.Context, options ShellOptions) (*ShellSession, error) {
	return s.open(ctx, options)
}

func (s *ShellSession) ExitSignal() string {
	<-s.done
	if p, ok := s.owner.platform.(SSHPlatform); ok {
		return p.ExitSSHSignal(s.cmd)
	}
	return ""
}

func (s *ShellSession) Signal(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return errors.New("terminal session closed")
	}
	p, ok := s.owner.platform.(SSHPlatform)
	if !ok {
		return errors.New("terminal signals unavailable")
	}
	return p.SignalSSHCommand(s.cmd, s.stream, name)
}
