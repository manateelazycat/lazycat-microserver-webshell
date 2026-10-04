package core

import (
	"bytes"
	"regexp"
	"time"
)

type terminalGeneratedEcho struct {
	raw    []byte
	quoted []byte
}

const maxPendingGeneratedEchoOutput = 128

func (p *terminalPane) addGeneratedEchoFilter(data []byte) {
	if len(data) == 0 {
		return
	}
	echo := terminalGeneratedEcho{
		raw:    append([]byte(nil), data...),
		quoted: ttyEchoControlBytes(data),
	}
	p.mu.Lock()
	p.generatedEchoPending = append(p.generatedEchoPending, echo)
	p.mu.Unlock()
}

func (p *terminalPane) expectGeneratedInput(data []byte, count int) {
	if len(data) == 0 || count <= 0 {
		return
	}
	p.mu.Lock()
	if p.pendingGeneratedInputs == nil {
		p.pendingGeneratedInputs = make(map[string]int)
	}
	p.pendingGeneratedInputs[string(data)] += count
	p.mu.Unlock()
}

func (p *terminalPane) expectGeneratedCursorReport(count int) {
	if count <= 0 {
		return
	}
	now := time.Now()
	p.mu.Lock()
	p.pendingCursorReports += count
	p.pendingCursorReportUntil = now.Add(generatedCursorReportWindow)
	p.mu.Unlock()
}

func (p *terminalPane) consumeExpectedGeneratedInput(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	key := string(data)
	now := time.Now()
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.pendingGeneratedInputs == nil || p.pendingGeneratedInputs[key] <= 0 {
		if p.cursorReportWindowActiveLocked(now) && p.pendingCursorReports > 0 && isCursorPositionReport(data) {
			p.pendingCursorReports--
			p.pendingCursorReportUntil = now.Add(generatedCursorReportWindow)
			return true
		}
		return false
	}
	p.pendingGeneratedInputs[key]--
	if p.pendingGeneratedInputs[key] <= 0 {
		delete(p.pendingGeneratedInputs, key)
	}
	if len(p.pendingGeneratedInputs) == 0 {
		p.pendingGeneratedInputs = nil
	}
	return true
}

func (p *terminalPane) cursorReportWindowActiveLocked(now time.Time) bool {
	if p.pendingCursorReportUntil.IsZero() {
		p.pendingCursorReports = 0
		return false
	}
	if !now.Before(p.pendingCursorReportUntil) {
		p.pendingCursorReports = 0
		p.pendingCursorReportUntil = time.Time{}
		return false
	}
	return true
}

var cursorPositionReportTailPattern = regexp.MustCompile(`^(?:\[\d{1,4};\d{1,4}R|\[\d{1,4}R|\d{1,4};\d{1,4}R|;\d{1,4}R|\d{1,4}R|\dR)+$`)

func isCursorPositionReport(data []byte) bool {
	if len(data) < len("\x1b[1;1R") || data[0] != '\x1b' || data[1] != '[' || data[len(data)-1] != 'R' {
		return false
	}
	parts := bytes.Split(data[2:len(data)-1], []byte(";"))
	if len(parts) != 2 {
		return false
	}
	for _, part := range parts {
		if len(part) == 0 || len(part) > 4 {
			return false
		}
		for _, b := range part {
			if b < '0' || b > '9' {
				return false
			}
		}
	}
	return true
}

func isCursorPositionReportTail(data []byte) bool {
	return cursorPositionReportTailPattern.Match(data)
}

func (p *terminalPane) consumeGeneratedCursorReportInput(data []byte) (bool, []byte) {
	if len(data) == 0 {
		return false, nil
	}
	fullReport := isCursorPositionReport(data)
	tailReport := isCursorPositionReportTail(data)
	if !fullReport && !tailReport {
		return false, nil
	}
	now := time.Now()
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.cursorReportWindowActiveLocked(now) {
		return false, nil
	}
	if fullReport && p.pendingCursorReports > 0 {
		p.pendingCursorReports--
		p.pendingCursorReportUntil = now.Add(generatedCursorReportWindow)
		return false, append([]byte(nil), data...)
	}
	return true, nil
}

func (p *terminalPane) filterGeneratedInputEcho(data []byte) []byte {
	if len(data) == 0 {
		return nil
	}

	p.mu.Lock()
	pending := append([]terminalGeneratedEcho(nil), p.generatedEchoPending...)
	buffer := append(p.generatedEchoOutputPending, data...)
	p.generatedEchoPending = nil
	p.generatedEchoOutputPending = nil
	p.mu.Unlock()

	if len(pending) == 0 {
		return buffer
	}

	var output []byte
	for len(buffer) > 0 {
		matched := false
		for index := 0; index < len(pending); index++ {
			if len(pending[index].raw) > 0 && bytes.HasPrefix(buffer, pending[index].raw) {
				buffer = buffer[len(pending[index].raw):]
				pending = append(pending[:index], pending[index+1:]...)
				matched = true
				break
			}
			if len(pending[index].quoted) > 0 && bytes.HasPrefix(buffer, pending[index].quoted) {
				buffer = buffer[len(pending[index].quoted):]
				pending = append(pending[:index], pending[index+1:]...)
				matched = true
				break
			}
		}
		if matched {
			continue
		}

		if keep := generatedEchoPrefixMatchLen(buffer, pending); keep > 0 {
			emit := len(buffer) - keep
			if emit > 0 {
				output = append(output, buffer[:emit]...)
			}
			p.mu.Lock()
			p.generatedEchoPending = append(p.generatedEchoPending, pending...)
			p.generatedEchoOutputPending = append(p.generatedEchoOutputPending[:0], buffer[emit:]...)
			p.mu.Unlock()
			return output
		}

		output = append(output, buffer[0])
		buffer = buffer[1:]
	}

	p.mu.Lock()
	p.generatedEchoPending = append(p.generatedEchoPending, pending...)
	p.mu.Unlock()
	return output
}

func generatedEchoPrefixMatchLen(buffer []byte, pending []terminalGeneratedEcho) int {
	maxKeep := min(len(buffer), maxPendingGeneratedEchoOutput)
	for _, echo := range pending {
		echoKeep := len(echo.raw) - 1
		if quotedKeep := len(echo.quoted) - 1; quotedKeep > echoKeep {
			echoKeep = quotedKeep
		}
		maxKeep = min(maxKeep, echoKeep)
	}
	for keep := maxKeep; keep > 0; keep-- {
		suffix := buffer[len(buffer)-keep:]
		for _, echo := range pending {
			if len(echo.raw) > keep && bytes.Equal(suffix, echo.raw[:keep]) {
				return keep
			}
			if len(echo.quoted) > keep && bytes.Equal(suffix, echo.quoted[:keep]) {
				return keep
			}
		}
	}
	return 0
}

func ttyEchoControlBytes(data []byte) []byte {
	var output []byte
	for _, b := range data {
		switch {
		case b == 0x7f:
			output = append(output, '^', '?')
		case b < 0x20:
			output = append(output, '^', b+0x40)
		default:
			output = append(output, b)
		}
	}
	return output
}
