//go:build !windows

package sshserver

// Unix uses the existing mode checks and O_EXCL/0600 key creation in hostkey.go.
func protectKeyStorage(string, bool) error { return nil }
