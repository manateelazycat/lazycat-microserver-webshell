//go:build linux

package unix

import (
	"syscall"
	"unsafe"
)

type agentSigaction struct {
	handler  uintptr
	flags    uint64
	restorer uintptr
	mask     uint64
}

func resetAgentDaemonSignalDisposition() error {
	for _, signal := range []syscall.Signal{syscall.SIGINT, syscall.SIGQUIT} {
		if err := resetAgentSignalDisposition(signal); err != nil {
			return err
		}
	}
	return nil
}

func resetAgentSignalDisposition(signal syscall.Signal) error {
	var action agentSigaction
	_, _, errno := syscall.Syscall6(
		syscall.SYS_RT_SIGACTION,
		uintptr(signal),
		uintptr(unsafe.Pointer(&action)),
		0,
		unsafe.Sizeof(action.mask),
		0,
		0,
	)
	if errno != 0 {
		return errno
	}
	return nil
}
