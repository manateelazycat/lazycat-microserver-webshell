package sshserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
	"lcmd-webshell/core"
)

func (st *sessionState) startExec(command string) bool {
	if handled, ok := st.startSCP(command); handled {
		return ok
	}
	options := st.options
	options.Command = command
	options.Execute = true
	options.Env = st.environment()
	if st.hasPTY {
		terminal, err := st.peer.server.shells.OpenWithOptions(st.ctx, options)
		if err != nil {
			return st.fail(err)
		}
		st.signal, st.resize, st.exitSignal = terminal.Signal, terminal.Resize, terminal.ExitSignal
		st.run = func() uint32 {
			defer terminal.Close()
			go func() { _, _ = io.Copy(terminal, st.channel) }()
			output := make(chan struct{})
			activity := make(chan struct{}, 1)
			failure := make(chan error, 1)
			go func() {
				defer close(output)
				_, _ = io.Copy(progressWriter{Writer: st.channel, activity: activity, failure: failure}, terminal)
			}()
			select {
			case <-terminal.Done():
			case <-st.ctx.Done():
				return 255
			}
			if !drainOutput(st.ctx, output, activity) {
				return 255
			}
			select {
			case <-failure:
				return 255
			default:
			}
			return terminal.ExitCode()
		}
		return true
	}
	process, err := core.StartShellCommand(st.ctx, st.peer.server.platform, command, options.Env)
	if err != nil {
		return st.fail(err)
	}
	st.signal, st.exitSignal = process.Signal, process.ExitSignal
	st.run = func() uint32 {
		defer func() {
			if err := process.Close(); err != nil {
				st.peer.server.recordCommandCleanup(err)
			}
		}()
		go func() { _, _ = io.Copy(process.Stdin, st.channel); _ = process.Stdin.Close() }()
		activity := make(chan struct{}, 1)
		outputErr := make(chan error, 2)
		var output sync.WaitGroup
		output.Add(2)
		go func() {
			defer output.Done()
			_, err := io.Copy(progressWriter{Writer: st.channel, activity: activity}, process.Stdout)
			outputErr <- err
		}()
		go func() {
			defer output.Done()
			_, err := io.Copy(progressWriter{Writer: st.channel.Stderr(), activity: activity}, process.Stderr)
			outputErr <- err
		}()
		drained := make(chan struct{})
		go func() { output.Wait(); close(drained) }()
		select {
		case <-process.Done():
		case <-st.ctx.Done():
			return 255
		}
		if !drainOutput(st.ctx, drained, activity) {
			return 255
		}
		firstErr, secondErr := <-outputErr, <-outputErr
		if firstErr != nil || secondErr != nil {
			return 255
		}
		return process.ExitCode()
	}
	return true
}

// The SSH session owns EOF/status/close ordering; the SFTP server owns files.
type subsystemStream struct{ ssh.Channel }

func (subsystemStream) Close() error { return nil }

func (st *sessionState) startSFTP() bool {
	server, err := sftp.NewServer(subsystemStream{st.channel}, sftp.WithServerWorkingDirectory(st.peer.server.platform.DefaultWorkingDirectory()))
	if err != nil {
		return st.fail(err)
	}
	st.run = func() uint32 {
		defer server.Close()
		err := server.Serve()
		if err != nil && err != io.EOF {
			return 1
		}
		return 0
	}
	return true
}
func (st *sessionState) sessionCommand(command string) bool {
	args := strings.Fields(command)
	if len(args) == 2 && args[1] == "list" {
		st.run = func() uint32 {
			if json.NewEncoder(st.channel).Encode(st.peer.server.listTerminals(st.peer.access)) != nil {
				return 1
			}
			return 0
		}
		return true
	}
	if len(args) == 3 && args[1] == "kill" {
		st.run = func() uint32 {
			if err := st.peer.server.killTerminal(st.peer.access, args[2]); err != nil {
				fmt.Fprintln(st.channel.Stderr(), err)
				return 1
			}
			return 0
		}
		return true
	}
	if !st.hasPTY {
		return st.fail(errors.New("session new/attach requires ssh -tt"))
	}
	if len(args) == 3 && args[1] == "attach" {
		return st.startTerminal(args[2], true)
	}
	if len(args) >= 2 && args[1] == "new" && len(args) <= 3 {
		name := ""
		if len(args) == 3 {
			name = args[2]
		}
		return st.startTerminal(name, false)
	}
	return st.fail(errors.New("usage: lightos-session list | new [name] | attach <id> | kill <id>"))
}
func (st *sessionState) startTerminal(id string, existing bool) bool {
	s := st.peer.server
	if !existing {
		options := st.options
		options.Env = st.environment()
		r, err := s.newTerminal(st.peer.access, id, options)
		if err != nil {
			return st.fail(err)
		}
		id = r.id
	}
	terminal, err := s.attachTerminal(st.peer.access, id)
	if err != nil {
		return st.fail(err)
	}
	if err = terminal.terminal.Resize(st.options.Size); err != nil {
		s.detachTerminal(terminal)
		return st.fail(err)
	}
	st.signal, st.resize, st.exitSignal = terminal.terminal.Signal, terminal.terminal.Resize, terminal.terminal.ExitSignal
	st.run = func() uint32 {
		defer s.detachTerminal(terminal)
		// Agent/X11 listeners belong to this transport. Existing shells retain their
		// paths, but those capabilities stop working when the owning transport ends.
		fmt.Fprintf(st.channel.Stderr(), "LightOS session %s. Resume: ssh -tt <connection-options> lightos-session attach %s\r\n", id, id)
		ctx, cancel := context.WithCancel(st.ctx)
		defer cancel()
		go func() {
			buf := make([]byte, 32<<10)
			for {
				n, err := st.channel.Read(buf)
				if n > 0 {
					if ctx.Err() != nil {
						return
					}
					if _, e := terminal.writeInput(ctx, buf[:n]); e != nil {
						return
					}
				}
				if err != nil {
					return
				}
			}
		}()
		cursor := uint64(0)
		for {
			data, next, changed, ended, lost := terminal.chunk(cursor)
			if lost {
				fmt.Fprint(st.channel.Stderr(), "\r\n[Earlier session output was discarded; replay is limited to 1 MiB.]\r\n")
			}
			if len(data) > 0 {
				if _, err := st.channel.Write(data); err != nil {
					return 255
				}
				cursor = next
				continue
			}
			if ended {
				return terminal.terminal.ExitCode()
			}
			select {
			case <-ctx.Done():
				return 255
			case <-changed:
			}
		}
	}
	return true
}
