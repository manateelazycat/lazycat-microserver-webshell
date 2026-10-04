package core

import (
	"bytes"
	"net/url"
	"path/filepath"
)

// CWD reports only describe the authorized shell; they grant no permission.
func (p *terminalPane) filterLocalCWDOutput(data []byte) []byte {
	prefix := []byte("\x1b]777;webshell-cwd=")
	p.mu.Lock()
	defer p.mu.Unlock()
	buffer := append(p.localCWDPending, data...)
	p.localCWDPending = nil
	var output []byte
	for len(buffer) > 0 {
		index := bytes.Index(buffer, prefix)
		if index < 0 {
			keep := privatePrefixSuffixLen(buffer, prefix)
			emit := len(buffer) - keep
			output = append(output, buffer[:emit]...)
			p.localCWDPending = append([]byte(nil), buffer[emit:]...)
			break
		}
		output = append(output, buffer[:index]...)
		buffer = buffer[index:]
		end, length := findPrivateControlTerminator(buffer[len(prefix):])
		if end < 0 {
			if len(buffer) > 16384 {
				output = append(output, buffer...)
			} else {
				p.localCWDPending = append([]byte(nil), buffer...)
			}
			break
		}
		value, err := url.PathUnescape(string(buffer[len(prefix) : len(prefix)+end]))
		if err == nil && len(value) <= 4096 && filepath.IsAbs(value) && bytes.IndexByte([]byte(value), 0) < 0 {
			p.cwd = filepath.Clean(value)
		}
		buffer = buffer[len(prefix)+end+length:]
	}
	return output
}
