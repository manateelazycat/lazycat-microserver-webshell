package lightosterminal

import (
	"net"
	"os"
	"path/filepath"
)

// 地址仅通过父子管道交付，HTTP 业务入口不监听 TCP。Windows 也使用 Go 的 Unix 域套接字支持。
func openPrivateIPC() (net.Listener, string, func(), error) {
	directory, err := os.MkdirTemp("", "lzc-")
	if err != nil {
		return nil, "", nil, err
	}
	address := filepath.Join(directory, "s")
	listener, err := net.Listen("unix", address)
	if err != nil {
		os.RemoveAll(directory)
		return nil, "", nil, err
	}
	cleanup := func() { listener.Close(); os.RemoveAll(directory) }
	return listener, "unix:" + address, cleanup, nil
}
