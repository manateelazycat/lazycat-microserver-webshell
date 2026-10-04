//go:build darwin

package unix

import (
	"context"
	"errors"
	"lcmd-webshell/core"
	"net"
	"os/exec"
	"regexp"
)

func (Platform) DefaultWorkingDirectory() string      { return LocalPlatform{}.DefaultWorkingDirectory() }
func (Platform) Command(launch core.Launch) *exec.Cmd { return LocalPlatform{}.Command(launch) }
func (Platform) KillCommand(cmd *exec.Cmd) error      { return KillCommand(cmd) }
func (Platform) ScanActivities(ctx context.Context, ttys []string) (map[string]core.PaneActivity, error) {
	return scanDarwinActivities(ctx, ttys)
}

var localTTY = regexp.MustCompile(`^ttys[0-9]+$`)

func (Platform) ValidTTY(value string) bool                { return localTTY.MatchString(value) }
func (Platform) ResetAgentSignals() error                  { return resetAgentDaemonSignalDisposition() }
func (Platform) RaiseAgentOpenFilesLimit() error           { return raiseAgentOpenFilesLimit() }
func (Platform) DefaultAgentSocketPath() string            { return "/tmp/lcmd-webshell-agent.sock" }
func (Platform) DialAgent(socket string) (net.Conn, error) { return net.Dial("unix", socket) }
func (Platform) ReconcileAgents(string, string, string, bool, bool) (int, error) {
	return 0, errors.New("standalone agent reconciliation is Linux-only; use the managed local runtime")
}
