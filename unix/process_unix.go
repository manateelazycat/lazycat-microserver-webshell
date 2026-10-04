//go:build linux || darwin

package unix

import (
	"errors"
	"os"
	"os/exec"
)

func KillCommand(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}
	if err := command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	return nil
}
