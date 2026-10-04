package sshserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"regexp"
	"sort"
	"sync"
	"time"

	"lcmd-webshell/core"
)

const replayLimit = 1 << 20

var sessionName = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type retainedShell struct {
	id       string
	terminal *core.ShellSession
	mu       sync.Mutex
	inputMu  sync.Mutex
	history  []byte
	base     uint64
	changed  chan struct{}
	ended    bool
	endedAt  time.Time
	attached bool
	revision uint64
}

func (s *Server) newTerminal(access Access, name string, options core.ShellOptions) (*retainedShell, error) {
	if name == "" {
		var bytes [12]byte
		if _, err := rand.Read(bytes[:]); err != nil {
			return nil, err
		}
		name = hex.EncodeToString(bytes[:])
	}
	if !sessionName.MatchString(name) {
		return nil, errors.New("invalid session name")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.currentLocked(access) {
		return nil, errors.New("SSH authorization expired")
	}
	if _, ok := s.retained[name]; ok {
		return nil, errors.New("session name already exists")
	}
	if len(s.retained) >= 32 {
		// Exited sessions are kept for result retrieval until capacity is needed.
		// Never evict a running task to make room for a new one.
		var oldest *retainedShell
		for _, candidate := range s.retained {
			candidate.mu.Lock()
			eligible := candidate.ended && !candidate.attached
			endedAt := candidate.endedAt
			candidate.mu.Unlock()
			if eligible && (oldest == nil || endedAt.Before(oldest.endedAt)) {
				oldest = candidate
			}
		}
		if oldest == nil {
			return nil, errors.New("too many retained terminals; use lightos-session kill")
		}
		delete(s.retained, oldest.id)
	}
	terminal, err := s.shells.OpenWithOptions(s.workCtx, options)
	if err != nil {
		return nil, err
	}
	r := &retainedShell{id: name, terminal: terminal, changed: make(chan struct{}), revision: access.Revision}
	s.retained[name] = r
	go r.readOutput()
	// A shell may exit while background children still hold its PTY open.
	go func() {
		<-terminal.Done()
		timer := time.NewTimer(time.Second)
		defer timer.Stop()
		<-timer.C
		_ = terminal.Close()
	}()
	return r, nil
}
func (r *retainedShell) notify() { close(r.changed); r.changed = make(chan struct{}) }
func (r *retainedShell) readOutput() {
	defer func() { r.mu.Lock(); r.ended = true; r.endedAt = time.Now(); r.notify(); r.mu.Unlock() }()
	buf := make([]byte, 32<<10)
	for {
		n, err := r.terminal.Read(buf)
		if n > 0 {
			r.mu.Lock()
			r.history = append(r.history, buf[:n]...)
			if len(r.history) > replayLimit {
				drop := len(r.history) - replayLimit
				r.base += uint64(drop)
				copy(r.history, r.history[drop:])
				r.history = r.history[:replayLimit]
			}
			r.notify()
			r.mu.Unlock()
		}
		if err != nil {
			return
		}
	}
}
func (s *Server) attachTerminal(access Access, id string) (*retainedShell, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.currentLocked(access) {
		return nil, errors.New("SSH authorization expired")
	}
	r := s.retained[id]
	if r == nil || r.revision != access.Revision {
		return nil, errors.New("session unavailable")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.attached {
		return nil, errors.New("session already attached")
	}
	r.attached = true
	return r, nil
}
func (s *Server) detachTerminal(r *retainedShell) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r.mu.Lock()
	defer r.mu.Unlock()
	r.attached = false
	if s.retained[r.id] != r {
		return
	}
	if r.ended {
		delete(s.retained, r.id)
		return
	}
}
func (s *Server) killTerminal(access Access, id string) error {
	s.mu.Lock()
	if !s.currentLocked(access) {
		s.mu.Unlock()
		return errors.New("SSH authorization expired")
	}
	r := s.retained[id]
	if r == nil {
		s.mu.Unlock()
		return errors.New("session unavailable")
	}
	delete(s.retained, id)
	s.mu.Unlock()
	return r.terminal.Close()
}
func (s *Server) closeRetained() {
	s.mu.Lock()
	items := s.retained
	s.retained = make(map[string]*retainedShell)
	s.mu.Unlock()
	for _, r := range items {
		_ = r.terminal.Close()
	}
}

type terminalInfo struct {
	ID       string `json:"id"`
	Attached bool   `json:"attached"`
	Exited   bool   `json:"exited"`
}

func (s *Server) listTerminals(access Access) []terminalInfo {
	result := make([]terminalInfo, 0)
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.currentLocked(access) {
		return result
	}
	for _, r := range s.retained {
		r.mu.Lock()
		result = append(result, terminalInfo{r.id, r.attached, r.ended})
		r.mu.Unlock()
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result
}
func (r *retainedShell) chunk(cursor uint64) ([]byte, uint64, <-chan struct{}, bool, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	lost := cursor < r.base
	if lost {
		cursor = r.base
	}
	offset := int(cursor - r.base)
	n := min(len(r.history)-offset, 32<<10)
	data := append([]byte(nil), r.history[offset:offset+n]...)
	return data, cursor + uint64(n), r.changed, r.ended, lost
}
func (r *retainedShell) writeInput(ctx context.Context, data []byte) (int, error) {
	r.inputMu.Lock()
	defer r.inputMu.Unlock()
	if ctx.Err() != nil {
		return 0, ctx.Err()
	}
	r.mu.Lock()
	ended := r.ended
	r.mu.Unlock()
	if ended {
		return 0, io.EOF
	}
	return r.terminal.Write(data)
}
