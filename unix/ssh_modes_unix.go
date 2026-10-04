//go:build linux || darwin

package unix

import sys "golang.org/x/sys/unix"

// RFC 4254 opcode numbers; no dependency on the SSH module in platform code.
func applySSHModes(fd int, modes map[uint8]uint32) error {
	if len(modes) == 0 {
		return nil
	}
	t, err := sys.IoctlGetTermios(fd, sshTermiosGet)
	if err != nil {
		return err
	}
	chars := map[uint8]int{1: sys.VINTR, 2: sys.VQUIT, 3: sys.VERASE, 4: sys.VKILL, 5: sys.VEOF, 6: sys.VEOL, 7: sys.VEOL2, 8: sys.VSTART, 9: sys.VSTOP, 10: sys.VSUSP, 12: sys.VREPRINT, 13: sys.VWERASE, 14: sys.VLNEXT, 18: sys.VDISCARD}
	input := map[uint8]sshTermFlag{30: sys.IGNPAR, 31: sys.PARMRK, 32: sys.INPCK, 33: sys.ISTRIP, 34: sys.INLCR, 35: sys.IGNCR, 36: sys.ICRNL, 38: sys.IXON, 39: sys.IXANY, 40: sys.IXOFF, 41: sys.IMAXBEL}
	local := map[uint8]sshTermFlag{50: sys.ISIG, 51: sys.ICANON, 53: sys.ECHO, 54: sys.ECHOE, 55: sys.ECHOK, 56: sys.ECHONL, 57: sys.NOFLSH, 58: sys.TOSTOP, 59: sys.IEXTEN, 60: sys.ECHOCTL, 61: sys.ECHOKE, 62: sys.PENDIN}
	output := map[uint8]sshTermFlag{70: sys.OPOST, 72: sys.ONLCR, 73: sys.OCRNL, 74: sys.ONOCR, 75: sys.ONLRET}
	control := map[uint8]sshTermFlag{92: sys.PARENB, 93: sys.PARODD}
	set := func(dst *sshTermFlag, flag sshTermFlag, value uint32) {
		if value != 0 {
			*dst |= flag
		} else {
			*dst &^= flag
		}
	}
	for op, value := range modes {
		if index, ok := chars[op]; ok {
			if value == 255 {
				t.Cc[index] = sshDisabledChar
			} else {
				t.Cc[index] = uint8(value)
			}
			continue
		}
		if flag, ok := input[op]; ok {
			set(&t.Iflag, flag, value)
			continue
		}
		if flag, ok := local[op]; ok {
			set(&t.Lflag, flag, value)
			continue
		}
		if flag, ok := output[op]; ok {
			set(&t.Oflag, flag, value)
			continue
		}
		if flag, ok := control[op]; ok {
			set(&t.Cflag, flag, value)
			continue
		}
		switch op {
		case 90:
			if value != 0 {
				t.Cflag = t.Cflag&^sys.CSIZE | sys.CS7
			}
		case 91:
			if value != 0 {
				t.Cflag = t.Cflag&^sys.CSIZE | sys.CS8
			}
		default:
			if err := applySSHModeExtra(t, op, value); err != nil {
				return err
			}
		}
	}
	return sys.IoctlSetTermios(fd, sshTermiosSet, t)
}
