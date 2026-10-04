package unix

import (
	"errors"
	sys "golang.org/x/sys/unix"
)

type sshTermFlag = uint32

const sshDisabledChar = 0
const sshTermiosGet = sys.TCGETS
const sshTermiosSet = sys.TCSETS

func applySSHModeExtra(t *sys.Termios, op uint8, value uint32) error {
	var flag uint32
	switch op {
	case 37:
		flag = sys.IUCLC
		if value != 0 {
			t.Iflag |= flag
		} else {
			t.Iflag &^= flag
		}
	case 42:
		flag = sys.IUTF8
		if value != 0 {
			t.Iflag |= flag
		} else {
			t.Iflag &^= flag
		}
	case 52:
		flag = sys.XCASE
		if value != 0 {
			t.Lflag |= flag
		} else {
			t.Lflag &^= flag
		}
	case 71:
		flag = sys.OLCUC
		if value != 0 {
			t.Oflag |= flag
		} else {
			t.Oflag &^= flag
		}
	case 16:
		t.Cc[sys.VSWTC] = uint8(value)
	case 128, 129:
		rates := map[uint32]uint32{0: sys.B0, 50: sys.B50, 75: sys.B75, 110: sys.B110, 134: sys.B134, 150: sys.B150, 200: sys.B200, 300: sys.B300, 600: sys.B600, 1200: sys.B1200, 1800: sys.B1800, 2400: sys.B2400, 4800: sys.B4800, 9600: sys.B9600, 19200: sys.B19200, 38400: sys.B38400, 57600: sys.B57600, 115200: sys.B115200, 230400: sys.B230400}
		rate, ok := rates[value]
		if !ok {
			return errors.New("unsupported terminal speed")
		}
		if op == 129 {
			t.Cflag = t.Cflag&^sys.CBAUD | rate
			t.Ospeed = rate
		} else {
			t.Cflag = t.Cflag&^sys.CIBAUD | rate<<sys.IBSHIFT
			t.Ispeed = rate
		}
	}
	return nil
}
