package core

import (
	"context"
	"io"
	"net"
	"os/exec"
)

// PTY exposes only the stream operations needed by the terminal engine.
// Native descriptors and OS-specific resize/process APIs stay in adapters.
type PTY interface{ io.ReadWriteCloser }
type Launch struct{ Selector, Username, RootDir, InitialCWD string }

type Platform interface {
	DefaultWorkingDirectory() string
	Command(Launch) *exec.Cmd
	StartPTY(*exec.Cmd) (PTY, error)
	WaitCommand(*exec.Cmd) error
	ResizePTY(PTY, int, int, int, int) error
	KillCommand(*exec.Cmd) error
	ScanActivities(context.Context, []string) (map[string]PaneActivity, error)
	ValidTTY(string) bool
	ResetAgentSignals() error
	RaiseAgentOpenFilesLimit() error
	DefaultAgentSocketPath() string
	ListenAgent(string) (net.Listener, func(), error)
	DialAgent(string) (net.Conn, error)
	ReconcileAgents(string, string, string, bool, bool) (int, error)
}

// SSHPlatform is optional: container/browser Platform implementations need not
// implement SSH-specific launch, termios or process-group operations. The bool
// in SSHCommand indicates whether the command will run inside a PTY.
type SSHPlatform interface {
	SSHCommand(string, bool) *exec.Cmd
	StartSSHPTY(*exec.Cmd, ShellSize, map[uint8]uint32) (PTY, error)
	StartSSHCommand(*exec.Cmd) error
	KillSSHCommand(*exec.Cmd) error
	SignalSSHCommand(*exec.Cmd, PTY, string) error
	ExitSSHSignal(*exec.Cmd) string
}

// TargetAccess is an integration boundary, not part of the OS implementation.
// The current Provider supplies container discovery and remote command access.
type TargetAccess interface {
	ValidateSelector(string) error
	ResolveUsername(context.Context, string) (string, error)
	Command(Launch) *exec.Cmd
	ScanActivities(context.Context, string, []string) (map[string]PaneActivity, error)
}

type Runtime struct {
	platform Platform
	targets  TargetAccess
}

func NewRuntime(platform Platform, targets TargetAccess) *Runtime {
	return &Runtime{platform: platform, targets: targets}
}

type QueueLog interface {
	io.Writer
	Flush()
}

// Each broker receives its own backend. Multiplexing, bounds and ACK handling
// do not know how a target's persistent agent is reached.
type QueueBackend interface {
	Open(context.Context, AgentScope, string, int, int, int, HistorySyncRequest, io.Writer) (QueueConnection, error)
	Log(string) QueueLog
}

// QueueConnection is an attach stream, not a terminal process. Closing it must
// detach the viewer without killing the workspace's PTY.
type QueueConnection struct {
	Input  io.WriteCloser
	Output io.ReadCloser
	Wait   func() error
	Kill   func() error
}

const agentReadyMarker = "__LCMD_WEBSHELL_AGENT_READY__"
