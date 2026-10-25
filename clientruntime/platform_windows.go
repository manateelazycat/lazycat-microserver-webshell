//go:build windows

package main

import (
	"lcmd-webshell/core"
	windowsplatform "lcmd-webshell/windows"
	"os"
)

func newPlatform() (core.Platform, func(), error) {
	platform, err := windowsplatform.New()
	return platform, func() {}, err
}
func shutdownSignals() []os.Signal { return []os.Signal{os.Interrupt} }
