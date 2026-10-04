//go:build windows

package sshserver

import (
	"net"
	"path/filepath"

	"github.com/Microsoft/go-winio"
	win "golang.org/x/sys/windows"
)

func listenForwardedAgent(dir string) (net.Listener, string, error) {
	user, err := win.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, "", err
	}
	path := `\\.\pipe\` + filepath.Base(dir)
	ln, err := winio.ListenPipe(path, &winio.PipeConfig{SecurityDescriptor: "D:P(A;;GA;;;SY)(A;;GA;;;" + user.User.Sid.String() + ")", InputBufferSize: 65536, OutputBufferSize: 65536})
	return ln, path, err
}
