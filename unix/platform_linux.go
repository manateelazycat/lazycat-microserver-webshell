//go:build linux

package unix

import (
	"context"
	"net"
	"os"
	"os/exec"

	"lcmd-webshell/core"
)

// Platform wires existing Linux behavior. macOS support is a later phase;
// shared PTY/IPC primitives are already isolated in *_unix.go files.
func (Platform) DefaultWorkingDirectory() string { return "/" }

func (Platform) Command(launch core.Launch) *exec.Cmd {
	command := exec.Command("/bin/sh", "-lc", BuildInstanceShellBootstrapScript(launch.Username, launch.InitialCWD))
	if launch.RootDir != "" {
		command.Dir = launch.RootDir
	}
	command.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor", "LANG=C.UTF-8", "LC_ALL=C.UTF-8")
	return command
}
func (Platform) KillCommand(cmd *exec.Cmd) error { return KillCommand(cmd) }
func (Platform) ScanActivities(ctx context.Context, ttys []string) (map[string]core.PaneActivity, error) {
	return ScanLocalActivities(ctx, ttys)
}
func (Platform) ValidTTY(value string) bool                { return privateTTYPattern.MatchString(value) }
func (Platform) ResetAgentSignals() error                  { return resetAgentDaemonSignalDisposition() }
func (Platform) RaiseAgentOpenFilesLimit() error           { return raiseAgentOpenFilesLimit() }
func (Platform) DefaultAgentSocketPath() string            { return "/tmp/lcmd-webshell-agent.sock" }
func (Platform) DialAgent(socket string) (net.Conn, error) { return net.Dial("unix", socket) }
func (Platform) ReconcileAgents(socket, selector, account string, replace, force bool) (int, error) {
	return reconcileAgentDaemonsWithOptions(socket, selector, account, replace, force)
}

var _ core.Platform = Platform{}
