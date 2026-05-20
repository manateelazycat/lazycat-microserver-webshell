//go:build unix

package main

import "syscall"

const agentOpenFilesLimit = 65535

func raiseAgentOpenFilesLimit() error {
	var current syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_NOFILE, &current); err != nil {
		return err
	}
	target := uint64(agentOpenFilesLimit)
	if current.Cur >= target {
		return nil
	}
	next := syscall.Rlimit{Cur: target, Max: target}
	_ = syscall.Setrlimit(syscall.RLIMIT_NOFILE, &next)
	return nil
}
