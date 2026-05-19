//go:build unix

package main

import "syscall"

const agentOpenFilesLimit = 524288

func raiseAgentOpenFilesLimit() error {
	var current syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_NOFILE, &current); err != nil {
		return err
	}
	target := uint64(agentOpenFilesLimit)
	if current.Cur >= target && current.Max >= target {
		return nil
	}
	next := syscall.Rlimit{Cur: current.Cur, Max: current.Max}
	if next.Max < target {
		next.Max = target
	}
	if next.Cur < target {
		next.Cur = target
	}
	if next.Cur > next.Max {
		next.Cur = next.Max
	}
	return syscall.Setrlimit(syscall.RLIMIT_NOFILE, &next)
}
