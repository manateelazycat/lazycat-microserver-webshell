//go:build windows

package sshserver

import "lcmd-webshell/windows"

func protectKeyStorage(path string, directory bool) error {
	return windows.ProtectPrivateStorage(path, directory)
}
