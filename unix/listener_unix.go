//go:build linux || darwin

package unix

import (
	"fmt"
	"net"
	"os"
	"syscall"
)

func (Platform) ListenAgent(socketPath string) (net.Listener, func(), error) {
	lock, err := acquireAgentDaemonLock(socketPath)
	if err != nil {
		return nil, nil, err
	}
	unlock := func() { _ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN); _ = lock.Close() }
	if err := removeStaleAgentSocket(socketPath); err != nil {
		unlock()
		return nil, nil, err
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		unlock()
		return nil, nil, fmt.Errorf("listen agent unix socket failed: %w", err)
	}
	info, err := os.Lstat(socketPath)
	if err != nil {
		_ = listener.Close()
		unlock()
		return nil, nil, fmt.Errorf("stat agent unix socket failed: %w", err)
	}
	_ = os.Chmod(socketPath, 0600)
	return listener, func() { _ = listener.Close(); removeAgentSocketIfOwned(socketPath, info); unlock() }, nil
}
