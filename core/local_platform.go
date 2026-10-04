package core

import (
	"context"
	"os/exec"
	"sync"
)

// Local cancellation also covers PTYs that are still initializing a checkpoint.
// Revocation cannot wait behind workspace locks before terminating a new shell.
type localPlatform struct {
	Platform
	ctx   context.Context
	stops sync.Map
}

func (p *localPlatform) StartPTY(cmd *exec.Cmd) (PTY, error) {
	if err := p.ctx.Err(); err != nil {
		return nil, err
	}
	pty, err := p.Platform.StartPTY(cmd)
	if err != nil {
		return nil, err
	}
	stop := context.AfterFunc(p.ctx, func() { _ = pty.Close(); _ = p.Platform.KillCommand(cmd) })
	p.stops.Store(cmd, stop)
	return pty, nil
}
func (p *localPlatform) WaitCommand(cmd *exec.Cmd) error {
	defer func() {
		if stop, ok := p.stops.LoadAndDelete(cmd); ok {
			stop.(func() bool)()
		}
	}()
	return p.Platform.WaitCommand(cmd)
}
