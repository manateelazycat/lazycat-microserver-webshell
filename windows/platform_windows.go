//go:build windows

package windows

import (
	"errors"
	"net"
	"os"
	"os/exec"
	"sync"
	"syscall"

	terminalpty "gitee.com/linakesi/hportal/misc/cli/pty"
	win "golang.org/x/sys/windows"
	"lcmd-webshell/core"
	"lcmd-webshell/localtools"
)

type Platform struct {
	panes    sync.Map // *exec.Cmd -> *terminal; handles belong to this runtime only
	commands sync.Map // non-PTY SSH commands -> owned Job Object
	rootJob  win.Handle
}

func New() (*Platform, error) {
	job, err := newTerminalJob()
	if err != nil {
		return nil, err
	}
	if err := win.AssignProcessToJobObject(job, win.CurrentProcess()); err != nil {
		win.CloseHandle(job)
		return nil, err
	}
	// Held until process exit, including forced termination.
	return &Platform{rootJob: job}, nil
}

func (*Platform) DefaultWorkingDirectory() string { home, _ := os.UserHomeDir(); return home }
func (*Platform) Command(launch core.Launch) *exec.Cmd {
	cmd := exec.Command("powershell.exe", "-NoLogo", "-NoExit", "-Command",
		"[Console]::InputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); chcp 65001 > $null; "+
			"$global:LightOSTerminalOriginalPrompt=$function:prompt; "+
			"function global:prompt { $promptText = & $global:LightOSTerminalOriginalPrompt; [Console]::Write([char]27+']777;webshell-cwd='+[Uri]::EscapeDataString($ExecutionContext.SessionState.Path.CurrentFileSystemLocation.Path)+[char]7); $promptText }")
	cmd.Env = core.LocalEnvironment(os.Environ())
	cmd.Dir = launch.InitialCWD
	if cmd.Dir == "" {
		cmd.Dir = launch.RootDir
	}
	if stat, err := os.Stat(cmd.Dir); err != nil || !stat.IsDir() {
		cmd.Dir = launch.RootDir
	}
	return cmd
}

func (p *Platform) StartPTY(cmd *exec.Cmd) (core.PTY, error) {
	console, err := terminalpty.New(120, 32)
	if err != nil {
		return nil, err
	}
	job, err := newTerminalJob()
	if err != nil {
		_ = console.Close()
		return nil, err
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: win.CREATE_SUSPENDED}
	if err := console.Start(cmd); err != nil {
		_ = win.CloseHandle(job)
		_ = console.Close()
		return nil, err
	}
	pid := uint32(cmd.Process.Pid)
	fail := func(err error) (core.PTY, error) {
		_ = cmd.Process.Kill()
		_ = cmd.Process.Release()
		_ = win.CloseHandle(job)
		_ = console.Close()
		return nil, err
	}
	process, err := win.OpenProcess(win.PROCESS_SET_QUOTA|win.PROCESS_TERMINATE, false, pid)
	if err != nil {
		return fail(err)
	}
	defer win.CloseHandle(process)
	// Assign before resuming: even immediately spawned grandchildren inherit
	// the kill-on-close job. Failure is fatal, never silently run uncontained.
	if err := win.AssignProcessToJobObject(job, process); err != nil {
		return fail(err)
	}
	if err := resumeOwnedProcess(pid); err != nil {
		return fail(err)
	}
	t := &terminal{PTY: console, job: job, id: fmtPID(int(pid)), reader: localtools.NewTextReader(console), cwd: cmd.Dir}
	p.panes.Store(cmd, t)
	return t, nil
}

func (p *Platform) WaitCommand(cmd *exec.Cmd) error { return terminalpty.Wait(cmd) }
func (p *Platform) KillCommand(cmd *exec.Cmd) error {
	if t, ok := p.panes.LoadAndDelete(cmd); ok {
		return t.(*terminal).Close()
	}
	return nil
}
func (*Platform) ResizePTY(stream core.PTY, cols, rows, _, _ int) error {
	t, ok := stream.(*terminal)
	if !ok {
		return errors.New("unexpected ConPTY stream")
	}
	return t.Resize(cols, rows)
}
func (*Platform) ValidTTY(string) bool            { return false }
func (*Platform) ResetAgentSignals() error        { return nil }
func (*Platform) RaiseAgentOpenFilesLimit() error { return nil }
func (*Platform) DefaultAgentSocketPath() string  { return "" }
func (*Platform) ListenAgent(string) (net.Listener, func(), error) {
	return nil, nil, errors.New("use the managed local runtime")
}
func (*Platform) DialAgent(string) (net.Conn, error) {
	return nil, errors.New("use the managed local runtime")
}
func (*Platform) ReconcileAgents(string, string, string, bool, bool) (int, error) {
	return 0, errors.New("use the managed local runtime")
}

var _ core.Platform = (*Platform)(nil)
