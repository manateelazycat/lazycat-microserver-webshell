//go:build windows

package windows

import (
	"errors"
	"io"
	"strconv"
	"sync"
	"unsafe"

	terminalpty "gitee.com/linakesi/hportal/misc/cli/pty"
	win "golang.org/x/sys/windows"
)

type terminal struct {
	*terminalpty.PTY
	job    win.Handle
	id     string
	cwd    string
	once   sync.Once
	reader io.Reader
}

func (t *terminal) Read(dst []byte) (int, error) { return t.reader.Read(dst) }

func fmtPID(pid int) string                         { return "conpty-" + strconv.Itoa(pid) }
func (t *terminal) TTYName() string                 { return t.id }
func (t *terminal) InitialWorkingDirectory() string { return t.cwd }
func (t *terminal) SupportsCWDReports() bool        { return true }
func (t *terminal) Close() error {
	t.once.Do(func() {
		// Kill before closing the console: ClosePseudoConsole can otherwise wait
		// for a running child while the reader is already stopping.
		_ = win.TerminateJobObject(t.job, 1)
		_ = win.CloseHandle(t.job)
		_ = t.PTY.Close()
	})
	return nil
}

func newTerminalJob() (win.Handle, error) {
	job, err := win.CreateJobObject(nil, nil)
	if err != nil {
		return 0, err
	}
	info := win.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = win.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	_, err = win.SetInformationJobObject(job, win.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)))
	if err != nil {
		win.CloseHandle(job)
		return 0, err
	}
	return job, nil
}

func resumeOwnedProcess(pid uint32) error {
	snapshot, err := win.CreateToolhelp32Snapshot(win.TH32CS_SNAPTHREAD, 0)
	if err != nil {
		return err
	}
	defer win.CloseHandle(snapshot)
	entry := win.ThreadEntry32{Size: uint32(unsafe.Sizeof(win.ThreadEntry32{}))}
	for err = win.Thread32First(snapshot, &entry); err == nil; err = win.Thread32Next(snapshot, &entry) {
		if entry.OwnerProcessID != pid {
			continue
		}
		thread, err := win.OpenThread(win.THREAD_SUSPEND_RESUME, false, entry.ThreadID)
		if err != nil {
			return err
		}
		_, err = win.ResumeThread(thread)
		win.CloseHandle(thread)
		return err
	}
	return errors.New("new terminal process thread is unavailable")
}
