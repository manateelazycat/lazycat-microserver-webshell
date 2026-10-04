package unix

import sys "golang.org/x/sys/unix"

type sshTermFlag = uint64

const sshDisabledChar = 255
const sshTermiosGet = sys.TIOCGETA
const sshTermiosSet = sys.TIOCSETA

func applySSHModeExtra(t *sys.Termios, op uint8, value uint32) error {
	switch op {
	case 11:
		t.Cc[sys.VDSUSP] = uint8(value)
	case 17:
		t.Cc[sys.VSTATUS] = uint8(value)
	case 42:
		if value != 0 {
			t.Iflag |= sys.IUTF8
		} else {
			t.Iflag &^= sys.IUTF8
		}
	case 128:
		t.Ispeed = uint64(value)
	case 129:
		t.Ospeed = uint64(value)
	}
	return nil
}
