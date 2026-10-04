//go:build !windows

package sshserver

import (
	"net"
	"os"
	"path/filepath"
)

func listenForwardedAgent(dir string) (net.Listener, string, error) {
	path := filepath.Join(dir, "agent.sock")
	ln, err := net.Listen("unix", path)
	if err == nil {
		err = os.Chmod(path, 0600)
		if err != nil {
			ln.Close()
		}
	}
	return ln, path, err
}
