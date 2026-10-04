package sshserver

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"golang.org/x/crypto/ssh"
)

type sessionServices struct {
	ctx              context.Context
	cancel           context.CancelFunc
	env              []string
	listeners        []net.Listener
	dirs             []string
	wg               sync.WaitGroup
	hasAgent, hasX11 bool
}

func (s *sessionServices) init() {
	if s.cancel == nil {
		s.ctx, s.cancel = context.WithCancel(s.ctx)
	}
}
func (s *sessionServices) close() {
	if s.cancel != nil {
		s.cancel()
	}
	for _, ln := range s.listeners {
		_ = ln.Close()
	}
	s.wg.Wait()
	for _, dir := range s.dirs {
		_ = os.RemoveAll(dir)
	}
}
func (s *sessionServices) agent(p *peer) error {
	if s.hasAgent {
		return errors.New("agent forwarding already requested")
	}
	s.init()
	dir, err := os.MkdirTemp("", "lightos-ssh-agent-")
	if err != nil {
		return err
	}
	ln, path, err := listenForwardedAgent(dir)
	if err != nil {
		os.RemoveAll(dir)
		return err
	}
	s.dirs = append(s.dirs, dir)
	s.listeners = append(s.listeners, ln)
	s.env = append(s.env, "SSH_AUTH_SOCK="+path)
	s.hasAgent = true
	s.serve(p, ln, "auth-agent@openssh.com", false, func(net.Conn) []byte { return nil })
	return nil
}
func (s *sessionServices) x11(p *peer, payload []byte) error {
	var r struct {
		Single           bool
		Protocol, Cookie string
		Screen           uint32
	}
	if s.hasX11 || len(payload) > 1024 || ssh.Unmarshal(payload, &r) != nil || r.Protocol != "MIT-MAGIC-COOKIE-1" || r.Screen > 255 {
		return errors.New("unsupported X11 request")
	}
	cookie, err := hex.DecodeString(r.Cookie)
	if err != nil || len(cookie) != 16 {
		return errors.New("invalid X11 cookie")
	}
	s.init()
	var ln net.Listener
	display := 10
	for ; display < 1000; display++ {
		ln, err = net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(6000+display)))
		if err == nil {
			break
		}
	}
	if err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "lightos-ssh-x11-")
	if err != nil {
		ln.Close()
		return err
	}
	path := filepath.Join(dir, "Xauthority")
	// FamilyWild works with both hostname/unix and localhost Xlib lookups. The
	// private file contains only the fake cookie supplied by the SSH client.
	data := []byte{255, 255}
	for _, field := range [][]byte{nil, []byte(strconv.Itoa(display)), []byte(r.Protocol), cookie} {
		data = binary.BigEndian.AppendUint16(data, uint16(len(field)))
		data = append(data, field...)
	}
	if err = os.WriteFile(path, data, 0600); err != nil {
		ln.Close()
		os.RemoveAll(dir)
		return err
	}
	s.dirs = append(s.dirs, dir)
	s.listeners = append(s.listeners, ln)
	s.hasX11 = true
	s.env = append(s.env, "DISPLAY=localhost:"+strconv.Itoa(display)+"."+strconv.Itoa(int(r.Screen)), "XAUTHORITY="+path)
	s.serve(p, ln, "x11", r.Single, func(c net.Conn) []byte {
		a := c.RemoteAddr().(*net.TCPAddr)
		return ssh.Marshal(struct {
			Address string
			Port    uint32
		}{a.IP.String(), uint32(a.Port)})
	})
	return nil
}
func (s *sessionServices) serve(p *peer, ln net.Listener, kind string, single bool, payload func(net.Conn) []byte) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			target, err := ln.Accept()
			if err != nil {
				return
			}
			if !p.valid() || s.ctx.Err() != nil || !p.acquire() {
				target.Close()
				continue
			}
			s.wg.Add(1)
			go func() {
				defer s.wg.Done()
				defer p.release()
				channel, requests, err := p.conn.OpenChannel(kind, payload(target))
				if err != nil {
					target.Close()
					return
				}
				go ssh.DiscardRequests(requests)
				bridge(s.ctx, channel, target)
			}()
			if single {
				ln.Close()
				return
			}
		}
	}()
}
