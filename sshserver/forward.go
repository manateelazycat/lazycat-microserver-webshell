package sshserver

import (
	"context"
	"net"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

type tcpChannel struct {
	Host       string
	Port       uint32
	Origin     string
	OriginPort uint32
}
type forwardRequest struct {
	Address string
	Port    uint32
}

func tcpAddress(host string, port uint32) string {
	return net.JoinHostPort(host, strconv.Itoa(int(port)))
}
func validHost(host string) bool { return len(host) <= 253 && !strings.ContainsAny(host, "\x00\r\n") }
func (p *peer) direct(next ssh.NewChannel) {
	var request tcpChannel
	if ssh.Unmarshal(next.ExtraData(), &request) != nil || !validHost(request.Host) || request.Host == "" || request.Port == 0 || request.Port > 65535 {
		_ = next.Reject(ssh.Prohibited, "invalid TCP destination")
		return
	}
	ctx, cancel := context.WithTimeout(p.ctx, 30*time.Second)
	target, err := (&net.Dialer{}).DialContext(ctx, "tcp", tcpAddress(request.Host, request.Port))
	cancel()
	if err != nil {
		_ = next.Reject(ssh.ConnectionFailed, "TCP destination unavailable")
		return
	}
	if !p.valid() {
		target.Close()
		_ = next.Reject(ssh.Prohibited, "SSH authorization expired")
		return
	}
	channel, requests, err := next.Accept()
	if err != nil {
		target.Close()
		return
	}
	p.ready()
	go ssh.DiscardRequests(requests)
	bridge(p.ctx, channel, target)
}
func (p *peer) handleRequests(requests <-chan *ssh.Request) {
	defer close(p.requestsDone)
	for {
		select {
		case <-p.ctx.Done():
			return
		case request, ok := <-requests:
			if !ok {
				return
			}
			accepted := false
			var reply []byte
			if p.valid() {
				switch request.Type {
				case "tcpip-forward":
					accepted, reply = p.listenForward(request.Payload)
				case "cancel-tcpip-forward":
					accepted = p.cancelForward(request.Payload)
				case "keepalive@openssh.com":
					accepted = true
				}
			}
			if request.WantReply {
				_ = request.Reply(accepted, reply)
			}
		}
	}
}
func (p *peer) listenForward(payload []byte) (bool, []byte) {
	var request forwardRequest
	if len(payload) > 1024 || ssh.Unmarshal(payload, &request) != nil || !validHost(request.Address) || request.Port > 65535 {
		return false, nil
	}
	host := request.Address
	if host == "localhost" {
		host = "127.0.0.1"
	}
	if host == "*" {
		host = ""
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.listeners) >= 16 {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(p.ctx, 5*time.Second)
	defer cancel()
	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", tcpAddress(host, request.Port))
	if err != nil {
		return false, nil
	}
	if !p.valid() {
		ln.Close()
		return false, nil
	}
	port := uint32(ln.Addr().(*net.TCPAddr).Port)
	key := tcpAddress(request.Address, port)
	if _, exists := p.listeners[key]; exists {
		ln.Close()
		return false, nil
	}
	p.listeners[key] = ln
	p.ready()
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		for {
			target, err := ln.Accept()
			if err != nil {
				return
			}
			if !p.valid() || !p.acquire() {
				target.Close()
				continue
			}
			p.wg.Add(1)
			go func() {
				defer p.wg.Done()
				defer p.release()
				origin := target.RemoteAddr().(*net.TCPAddr)
				data := tcpChannel{request.Address, port, origin.IP.String(), uint32(origin.Port)}
				channel, requests, err := p.conn.OpenChannel("forwarded-tcpip", ssh.Marshal(data))
				if err != nil {
					target.Close()
					return
				}
				go ssh.DiscardRequests(requests)
				bridge(p.ctx, channel, target)
			}()
		}
	}()
	if request.Port == 0 {
		return true, ssh.Marshal(struct{ Port uint32 }{port})
	}
	return true, nil
}
func (p *peer) cancelForward(payload []byte) bool {
	var request forwardRequest
	if ssh.Unmarshal(payload, &request) != nil {
		return false
	}
	key := tcpAddress(request.Address, request.Port)
	p.mu.Lock()
	defer p.mu.Unlock()
	ln := p.listeners[key]
	if ln == nil {
		return false
	}
	delete(p.listeners, key)
	_ = ln.Close()
	return true
}
