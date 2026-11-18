//go:build !windows

package launcher

import "os/exec"

func configureChild(cmd *exec.Cmd) {}
