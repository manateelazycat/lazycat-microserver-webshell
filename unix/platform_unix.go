//go:build linux || darwin

package unix

import "os/exec"

type Platform struct{}

func (Platform) WaitCommand(cmd *exec.Cmd) error { return cmd.Wait() }
