//go:build darwin

package unix

import (
	"os/signal"
	"syscall"
)

func resetAgentDaemonSignalDisposition() error {
	signal.Reset(syscall.SIGINT, syscall.SIGQUIT)
	return nil
}
