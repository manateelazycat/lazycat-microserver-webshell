package sshserver

import (
	"context"
	"io"
	"net"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// peer owns connection-scoped resources, including all forwarded listeners.
// Detached terminals have a separate configuration-scoped lifetime.
type peer struct {
	ctx          context.Context
	cancel       context.CancelFunc
	server       *Server
	conn         *ssh.ServerConn
	raw          net.Conn
	access       Access
	readyOnce    sync.Once
	slots        chan struct{}
	wg           sync.WaitGroup
	requestsDone chan struct{}
	mu           sync.Mutex
	listeners    map[string]net.Listener
}

func newPeer(ctx context.Context, s *Server, c *ssh.ServerConn, raw net.Conn, a Access) *peer {
	ctx, cancel := context.WithCancel(ctx)
	return &peer{ctx: ctx, cancel: cancel, server: s, conn: c, raw: raw, access: a, slots: make(chan struct{}, 32), requestsDone: make(chan struct{}), listeners: make(map[string]net.Listener)}
}
func (p *peer) valid() bool {
	if p.ctx.Err() != nil {
		return false
	}
	p.server.mu.Lock()
	defer p.server.mu.Unlock()
	return p.server.currentLocked(p.access)
}
func (p *peer) ready() { p.readyOnce.Do(func() { _ = p.raw.SetDeadline(time.Time{}) }) }
func (p *peer) close() {
	p.cancel()
	_ = p.conn.Close()
	<-p.requestsDone
	p.mu.Lock()
	for _, ln := range p.listeners {
		_ = ln.Close()
	}
	p.mu.Unlock()
	p.wg.Wait()
}
func (p *peer) acquire() bool {
	select {
	case p.slots <- struct{}{}:
		return true
	default:
		return false
	}
}
func (p *peer) release() { <-p.slots }
func (p *peer) accept(next ssh.NewChannel) {
	if !p.valid() || !p.acquire() {
		_ = next.Reject(ssh.ResourceShortage, "SSH channel unavailable")
		return
	}
	switch next.ChannelType() {
	case "session", "direct-tcpip":
	default:
		p.release()
		_ = next.Reject(ssh.UnknownChannelType, "unsupported SSH channel")
		return
	}
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		defer p.release()
		if next.ChannelType() == "direct-tcpip" {
			p.direct(next)
			return
		}
		channel, requests, err := next.Accept()
		if err != nil {
			return
		}
		defer channel.Close()
		stop := context.AfterFunc(p.ctx, func() { _ = channel.Close() })
		defer stop()
		p.session(channel, requests)
	}()
}

// Preserve half-close: stdin EOF does not discard a target's final response.
func bridge(ctx context.Context, channel ssh.Channel, target net.Conn) {
	defer channel.Close()
	defer target.Close()
	stop := context.AfterFunc(ctx, func() { _ = channel.Close(); _ = target.Close() })
	defer stop()
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = io.Copy(target, channel)
		if c, ok := target.(interface{ CloseWrite() error }); ok {
			_ = c.CloseWrite()
		} else {
			_ = target.Close()
		}
	}()
	_, _ = io.Copy(channel, target)
	_ = channel.CloseWrite()
	_ = channel.Close()
	_ = target.Close()
	<-done
}
