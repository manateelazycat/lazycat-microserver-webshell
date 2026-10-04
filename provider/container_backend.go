package provider

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"

	"lcmd-webshell/core"
	"lcmd-webshell/internal/serverlog"
	unixplatform "lcmd-webshell/unix"
)

// ContainerTargets keeps discovery, login-user resolution and lightosctl out
// of the reusable terminal runtime. Shell construction preserves the existing
// Linux guest bootstrap, independently of the Provider's transport protocol.
type ContainerTargets struct{}

func (ContainerTargets) ValidateSelector(selector string) error {
	return validateInstanceSelector(selector)
}
func (ContainerTargets) ResolveUsername(ctx context.Context, selector string) (string, error) {
	return resolveInstanceLoginUser(ctx, selector)
}
func (ContainerTargets) Command(launch core.Launch) *exec.Cmd {
	command := exec.Command(lightosctlPath, "exec", "-ti", launch.Selector, "/bin/sh", "-lc", unixplatform.BuildInstanceShellBootstrapScript(launch.Username, launch.InitialCWD))
	if launch.RootDir != "" {
		command.Dir = launch.RootDir
	}
	command.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor", "LANG=C.UTF-8", "LC_ALL=C.UTF-8")
	return command
}
func (ContainerTargets) ScanActivities(ctx context.Context, selector string, ttys []string) (map[string]core.PaneActivity, error) {
	return scanContainerActivities(ctx, selector, ttys)
}

type containerQueueBackend struct{}

func (containerQueueBackend) Open(ctx context.Context, scope core.AgentScope, paneID string, cols, rows, scrollback int, request core.HistorySyncRequest, stderr io.Writer) (core.QueueConnection, error) {
	cmd := exec.CommandContext(ctx, lightosctlPath, persistentAgentAttachCommandArgs(scope, paneID, cols, rows, scrollback, request)...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return core.QueueConnection{}, err
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		_ = stdout.Close()
		return core.QueueConnection{}, err
	}
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return core.QueueConnection{}, err
	}
	return core.QueueConnection{Input: stdin, Output: stdout, Wait: cmd.Wait, Kill: func() error { return unixplatform.KillCommand(cmd) }}, nil
}
func (containerQueueBackend) Log(paneID string) core.QueueLog {
	return serverlog.NewWriter(fmt.Sprintf("lightosctl pane=%s", paneID))
}

var _ core.TargetAccess = ContainerTargets{}
var _ core.QueueBackend = containerQueueBackend{}
