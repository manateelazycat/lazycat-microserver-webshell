//go:build windows

package windows

import (
	"errors"
	"os/exec"
	"sync"
	"syscall"

	win "golang.org/x/sys/windows"
	"lcmd-webshell/core"
)

type commandJob struct {
	job      win.Handle
	once     sync.Once
	closeErr error
}

func (j *commandJob) close() error {
	j.once.Do(func() {
		killErr := win.TerminateJobObject(j.job, 1)
		closeErr := win.CloseHandle(j.job)
		if killErr != nil && closeErr != nil {
			j.closeErr = errors.Join(killErr, closeErr)
		}
	})
	return j.closeErr
}

func (p *Platform) SSHCommand(command string, terminal bool) *exec.Cmd {
	base := p.Command(core.Launch{RootDir: p.DefaultWorkingDirectory()})
	args := []string{"-NoLogo"}
	if !terminal {
		args = append(args, "-NonInteractive")
	}
	command = "[Console]::InputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $OutputEncoding=[Text.UTF8Encoding]::new(); " + command
	args = append(args, "-Command", command)
	cmd := exec.Command("powershell.exe", args...)
	cmd.Env, cmd.Dir = base.Env, base.Dir
	return cmd
}
func (p *Platform) StartSSHCommand(cmd *exec.Cmd) error {
	job, err := newTerminalJob()
	if err != nil {
		return err
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: win.CREATE_SUSPENDED | win.CREATE_NEW_PROCESS_GROUP}
	if err = cmd.Start(); err != nil {
		win.CloseHandle(job)
		return err
	}
	process, err := win.OpenProcess(win.PROCESS_SET_QUOTA|win.PROCESS_TERMINATE, false, uint32(cmd.Process.Pid))
	if err == nil {
		err = win.AssignProcessToJobObject(job, process)
		win.CloseHandle(process)
	}
	if err == nil {
		err = resumeOwnedProcess(uint32(cmd.Process.Pid))
	}
	if err != nil {
		cmd.Process.Kill()
		cmd.Wait()
		win.CloseHandle(job)
		return err
	}
	p.commands.Store(cmd, &commandJob{job: job})
	return nil
}
func (p *Platform) KillSSHCommand(cmd *exec.Cmd) error {
	if job, ok := p.commands.LoadAndDelete(cmd); ok {
		return job.(*commandJob).close()
	}
	return nil
}
func (p *Platform) ExitSSHSignal(*exec.Cmd) string { return "" }
func (p *Platform) SignalSSHCommand(cmd *exec.Cmd, stream core.PTY, name string) error {
	switch name {
	case "INT":
		if stream != nil {
			_, err := stream.Write([]byte{3})
			return err
		}
		return errors.New("INT requires a Windows terminal")
	case "TERM", "KILL":
		if stream != nil {
			return stream.Close()
		}
		return p.KillSSHCommand(cmd)
	default:
		return errors.New("signal is not supported on Windows")
	}
}
func (p *Platform) StartSSHPTY(cmd *exec.Cmd, size core.ShellSize, modes map[uint8]uint32) (core.PTY, error) {
	// ConPTY has no POSIX termios. Accept its normal cooked terminal contract;
	// reject requests for raw/no-echo modes rather than silently claiming success.
	for _, op := range []uint8{50, 51, 53} {
		if value, ok := modes[op]; ok && value == 0 {
			return nil, errors.New("requested terminal mode is not supported by ConPTY")
		}
	}
	terminal, err := p.StartPTY(cmd)
	if err == nil {
		err = p.ResizePTY(terminal, size.Cols, size.Rows, size.PixelWidth, size.PixelHeight)
		if err != nil {
			_ = p.KillCommand(cmd)
			if cmd.Process != nil {
				_, _ = cmd.Process.Wait()
			}
		}
	}
	return terminal, err
}
