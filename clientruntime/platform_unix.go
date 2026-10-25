//go:build linux || darwin

package main

import (
	"lcmd-webshell/core"
	"lcmd-webshell/localtools"
	unixplatform "lcmd-webshell/unix"
	"os"
	"syscall"
)

func newPlatform() (core.Platform, func(), error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, nil, err
	}
	dir, cleanup, err := localtools.InstallNanoWrapper(executable)
	if err != nil {
		return nil, nil, err
	}
	return unixplatform.LocalPlatform{ToolsDir: dir}, cleanup, nil
}
func shutdownSignals() []os.Signal { return []os.Signal{os.Interrupt, syscall.SIGTERM, syscall.SIGHUP} }
