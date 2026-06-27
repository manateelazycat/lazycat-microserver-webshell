//go:build !linux

package main

import (
	"os/signal"
	"syscall"
)

func resetAgentDaemonSignalDisposition() error {
	signal.Reset(syscall.SIGINT, syscall.SIGQUIT)
	return nil
}
