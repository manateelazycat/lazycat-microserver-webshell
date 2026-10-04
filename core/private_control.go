package core

import (
	"bytes"
)

func (p *terminalPane) filterPrivateControlOutput(data []byte) []byte {
	const maxPendingControl = 512
	prefix := []byte("\x1b]777;webshell-tty=")

	p.mu.Lock()
	buffer := append(p.controlPending, data...)
	p.controlPending = nil
	p.mu.Unlock()

	var output []byte
	for len(buffer) > 0 {
		index := bytes.Index(buffer, prefix)
		if index < 0 {
			keep := privatePrefixSuffixLen(buffer, prefix)
			emit := len(buffer) - keep
			if emit > 0 {
				output = append(output, buffer[:emit]...)
			}
			p.mu.Lock()
			p.controlPending = append(p.controlPending[:0], buffer[emit:]...)
			p.mu.Unlock()
			return output
		}
		if index > 0 {
			output = append(output, buffer[:index]...)
			buffer = buffer[index:]
		}
		end, terminatorLength := findPrivateControlTerminator(buffer[len(prefix):])
		if end < 0 {
			if len(buffer) > maxPendingControl {
				output = append(output, buffer[0])
				buffer = buffer[1:]
				continue
			}
			p.mu.Lock()
			p.controlPending = append(p.controlPending[:0], buffer...)
			p.mu.Unlock()
			return output
		}
		value := string(buffer[len(prefix) : len(prefix)+end])
		if p.workspace.runtime.platform.ValidTTY(value) {
			p.mu.Lock()
			p.tty = value
			p.mu.Unlock()
		}
		buffer = buffer[len(prefix)+end+terminatorLength:]
	}
	return output
}

func privatePrefixSuffixLen(buffer, prefix []byte) int {
	maxKeep := min(len(buffer), len(prefix)-1)
	for keep := maxKeep; keep > 0; keep-- {
		if bytes.Equal(buffer[len(buffer)-keep:], prefix[:keep]) {
			return keep
		}
	}
	return 0
}

func findPrivateControlTerminator(data []byte) (int, int) {
	for index := 0; index < len(data); index++ {
		switch data[index] {
		case '\a':
			return index, 1
		case '\x1b':
			if index+1 < len(data) && data[index+1] == '\\' {
				return index, 2
			}
		}
	}
	return -1, 0
}
