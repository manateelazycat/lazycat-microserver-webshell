package sshserver

import (
	"context"
	"errors"
	"net"
	"time"

	"golang.org/x/crypto/ssh"
)

const authenticationTimeout = 120 * time.Second

// ServeConn takes ownership of the stream. The caller must have verified the
// hportal tunnel and its purpose-scoped ticket before supplying Access. SSH
// password authentication is an additional gate, never a substitute for it.
func (s *Server) ServeConn(ctx context.Context, raw net.Conn, access Access) error {
	if raw == nil {
		return errors.New("SSH stream is missing")
	}
	defer raw.Close()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	stop := context.AfterFunc(ctx, func() { _ = raw.Close() })
	defer stop()
	c := &connection{raw: raw, cancel: cancel}
	s.mu.Lock()
	if !s.currentLocked(access) || len(s.connections) >= 32 || ctx.Err() != nil {
		s.mu.Unlock()
		return errors.New("SSH access unavailable")
	}
	s.connections[c] = struct{}{}
	s.wg.Add(1)
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.connections, c); s.mu.Unlock(); s.wg.Done() }()
	algorithms := ssh.SupportedAlgorithms()
	config := &ssh.ServerConfig{MaxAuthTries: 3, ServerVersion: "SSH-2.0-LightOS", Config: ssh.Config{KeyExchanges: algorithms.KeyExchanges, Ciphers: algorithms.Ciphers, MACs: algorithms.MACs}}
	config.PasswordCallback = func(metadata ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
		s.mu.Lock()
		valid := s.currentLocked(access) && metadata.User() == s.binding.AccountID
		if time.Since(s.authWindow) >= time.Minute {
			s.authWindow = time.Now()
			s.authChecks = 0
		}
		valid = valid && s.authChecks < 30
		if valid {
			s.authChecks++
		}
		hash := s.config.PasswordHash
		s.mu.Unlock()
		if !valid || !verifyPassword(hash, password) {
			return nil, errors.New("SSH authentication denied")
		}
		s.mu.Lock()
		valid = s.currentLocked(access)
		s.mu.Unlock()
		if !valid || ctx.Err() != nil {
			return nil, errors.New("SSH authentication revoked")
		}
		return nil, nil
	}
	config.AddHostKey(s.key)
	// NewServerConn includes human host-key confirmation and password entry.
	// Keep an absolute bound, but allow enough time for interactive clients.
	_ = raw.SetDeadline(time.Now().Add(authenticationTimeout))
	conn, channels, requests, err := ssh.NewServerConn(raw, config)
	if err != nil {
		return err
	}
	defer conn.Close()
	// Authentication is bounded. An authenticated SSH connection may remain
	// idle while local or dynamic forwarding waits for its first connection.
	_ = raw.SetDeadline(time.Time{})
	peer := newPeer(ctx, s, conn, raw, access)
	defer peer.close()
	go peer.handleRequests(requests)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case next, ok := <-channels:
			if !ok {
				return nil
			}
			peer.accept(next)
		}
	}
}
