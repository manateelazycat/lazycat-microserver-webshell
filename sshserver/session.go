package sshserver

import (
	"context"
	"encoding/binary"
	"fmt"
	"strings"

	"golang.org/x/crypto/ssh"
	"lcmd-webshell/core"
)

type ptyRequest struct {
	Term                                string
	Cols, Rows, PixelWidth, PixelHeight uint32
	Modes                               string
}
type windowRequest struct{ Cols, Rows, PixelWidth, PixelHeight uint32 }

func shellSize(cols, rows, width, height uint32) core.ShellSize {
	return core.ShellSize{Cols: int(cols), Rows: int(rows), PixelWidth: int(width), PixelHeight: int(height)}
}
func parseModes(data string) (map[uint8]uint32, bool) {
	modes := make(map[uint8]uint32)
	if len(data) > 2048 {
		return nil, false
	}
	for len(data) > 0 {
		op := data[0]
		data = data[1:]
		if op == 0 {
			return modes, len(data) == 0
		}
		if op >= 160 {
			return modes, true
		}
		if len(data) < 4 {
			return nil, false
		}
		modes[op] = binary.BigEndian.Uint32([]byte(data[:4]))
		data = data[4:]
	}
	return nil, false
}

type sessionState struct {
	peer       *peer
	ctx        context.Context
	channel    ssh.Channel
	options    core.ShellOptions
	hasPTY     bool
	started    bool
	envBytes   int
	run        func() uint32
	signal     func(string) error
	exitSignal func() string
	resize     func(core.ShellSize) error
	services   sessionServices
}

func (p *peer) session(channel ssh.Channel, requests <-chan *ssh.Request) {
	ctx, cancel := context.WithCancel(p.ctx)
	state := &sessionState{peer: p, ctx: ctx, channel: channel}
	state.services.ctx = ctx
	var done <-chan uint32
	defer func() {
		cancel()
		_ = channel.Close()
		if done != nil {
			<-done
		}
		state.services.close()
	}()
	for {
		select {
		case <-ctx.Done():
			return
		case code := <-done:
			done = nil
			if state.exitSignal != nil && state.exitSignal() != "" {
				_, _ = channel.SendRequest("exit-signal", false, ssh.Marshal(struct {
					Signal            string
					CoreDump          bool
					Message, Language string
				}{state.exitSignal(), false, "", ""}))
			} else {
				_, _ = channel.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{code}))
			}
			_ = channel.CloseWrite()
			return
		case request, ok := <-requests:
			if !ok {
				return
			}
			accepted := false
			if p.valid() {
				accepted = state.request(request)
			}
			if request.WantReply {
				_ = request.Reply(accepted, nil)
			}
			if accepted && state.run != nil {
				run := state.run
				state.run = nil
				state.started = true
				p.ready()
				result := make(chan uint32, 1)
				done = result
				go func() { result <- run() }()
			}
		}
	}
}
func (st *sessionState) request(request *ssh.Request) bool {
	switch request.Type {
	case "pty-req":
		var r ptyRequest
		if st.started || st.hasPTY || len(request.Payload) > 4096 || ssh.Unmarshal(request.Payload, &r) != nil {
			return false
		}
		modes, ok := parseModes(r.Modes)
		if !ok {
			return false
		}
		if r.Cols == 0 {
			r.Cols = 120
		}
		if r.Rows == 0 {
			r.Rows = 32
		}
		size := shellSize(r.Cols, r.Rows, r.PixelWidth, r.PixelHeight)
		if size.Validate() != nil || len(r.Term) == 0 || len(r.Term) > 64 {
			return false
		}
		for _, c := range r.Term {
			if c < 33 || c > 126 {
				return false
			}
		}
		st.options.Term, st.options.Size, st.options.Modes = r.Term, size, modes
		st.hasPTY = true
		return true
	case "env":
		var r struct{ Name, Value string }
		if st.started || len(request.Payload) > 8192 || ssh.Unmarshal(request.Payload, &r) != nil || !allowedEnv(r.Name) || strings.ContainsRune(r.Value, 0) || len(st.options.Env) >= 64 || st.envBytes+len(request.Payload) > 16384 {
			return false
		}
		st.options.Env = append(st.options.Env, r.Name+"="+r.Value)
		st.envBytes += len(request.Payload)
		return true
	case "window-change":
		var r windowRequest
		if !st.hasPTY || ssh.Unmarshal(request.Payload, &r) != nil {
			return false
		}
		size := shellSize(r.Cols, r.Rows, r.PixelWidth, r.PixelHeight)
		if size.Validate() != nil {
			return false
		}
		st.options.Size = size
		return st.resize == nil || st.resize(size) == nil
	case "signal":
		var r struct{ Name string }
		return st.started && st.signal != nil && ssh.Unmarshal(request.Payload, &r) == nil && st.signal(r.Name) == nil
	case "auth-agent-req@openssh.com":
		return !st.started && len(request.Payload) == 0 && st.services.agent(st.peer) == nil
	case "x11-req":
		return !st.started && st.services.x11(st.peer, request.Payload) == nil
	case "shell":
		if st.started || !st.hasPTY || len(request.Payload) != 0 {
			return false
		}
		return st.startTerminal("", false)
	case "exec":
		var r struct{ Command string }
		if st.started || len(request.Payload) > 65536 || ssh.Unmarshal(request.Payload, &r) != nil || strings.ContainsRune(r.Command, 0) {
			return false
		}
		if r.Command == "lightos-session" || strings.HasPrefix(r.Command, "lightos-session ") {
			return st.sessionCommand(r.Command)
		}
		return st.startExec(r.Command)
	case "subsystem":
		var r struct{ Name string }
		if st.started || st.hasPTY || ssh.Unmarshal(request.Payload, &r) != nil || r.Name != "sftp" {
			return false
		}
		return st.startSFTP()
	}
	return false
}
func allowedEnv(name string) bool {
	if name == "LANG" || name == "LANGUAGE" || name == "TERM" || name == "COLORTERM" {
		return true
	}
	if !strings.HasPrefix(name, "LC_") || len(name) > 64 {
		return false
	}
	for _, c := range name {
		if c != '_' && (c < 'A' || c > 'Z') {
			return false
		}
	}
	return true
}
func (st *sessionState) fail(err error) bool {
	_, _ = fmt.Fprintf(st.channel.Stderr(), "LightOS SSH: %s\n", err)
	return false
}
func (st *sessionState) environment() []string {
	return append(append([]string(nil), st.options.Env...), st.services.env...)
}
