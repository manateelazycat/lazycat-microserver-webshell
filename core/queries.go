package core

import (
	"bytes"
	"fmt"
	"strings"
	"time"
)

const (
	maxPendingTerminalQuery           = 64
	maxPendingKittyGraphicsQuery      = 4096
	primaryDeviceAttributesResponse   = "\x1b[?1;2c"
	secondaryDeviceAttributesResponse = "\x1b[>0;0;0c"
	defaultTerminalForegroundColor    = "#00cd00"
	defaultTerminalBackgroundColor    = "#000000"
	defaultTerminalCursorColor        = "#00cd00"
	generatedCursorReportWindow       = 2 * time.Second
)

func (p *terminalPane) filterTerminalQueryOutput(data []byte) []byte {
	if len(data) == 0 {
		return nil
	}

	p.mu.Lock()
	buffer := append(p.terminalQueryPending, data...)
	p.terminalQueryPending = nil
	p.mu.Unlock()

	var output []byte
	for len(buffer) > 0 {
		index := bytes.IndexByte(buffer, '\x1b')
		if index < 0 {
			output = append(output, buffer...)
			return output
		}
		if index > 0 {
			output = append(output, buffer[:index]...)
			buffer = buffer[index:]
		}
		if len(buffer) == 1 {
			p.setTerminalQueryPending(buffer)
			return output
		}
		switch buffer[1] {
		case '_':
			if len(buffer) < len("\x1b_G;") {
				p.setTerminalQueryPending(buffer)
				return output
			}
			if buffer[2] != 'G' {
				output = append(output, buffer[0])
				buffer = buffer[1:]
				continue
			}
			separator := bytes.IndexByte(buffer, ';')
			if separator < 0 {
				if len(buffer) <= maxPendingTerminalQuery {
					p.setTerminalQueryPending(buffer)
					return output
				}
				output = append(output, buffer...)
				return output
			}
			if !kittyGraphicsQueryControl(buffer[3:separator]) {
				output = append(output, buffer...)
				return output
			}
			end, ok := findAPCTerminator(buffer)
			if !ok {
				if len(buffer) <= maxPendingKittyGraphicsQuery {
					p.setTerminalQueryPending(buffer)
					return output
				}
				output = append(output, buffer...)
				return output
			}
			sequence := buffer[:end]
			if response, ok := kittyGraphicsQueryResponse(sequence); ok {
				responseData := []byte(response)
				p.expectGeneratedInput(responseData, 1)
				_ = p.writeGeneratedInput(responseData)
				buffer = buffer[end:]
				continue
			}
			output = append(output, sequence...)
			buffer = buffer[end:]
		case '[':
			if len(buffer) == 2 {
				p.setTerminalQueryPending(buffer)
				return output
			}
			final := -1
			for i := 2; i < len(buffer); i++ {
				if buffer[i] >= 0x40 && buffer[i] <= 0x7e {
					final = i
					break
				}
				if i >= maxPendingTerminalQuery {
					break
				}
			}
			if final < 0 {
				if len(buffer) <= maxPendingTerminalQuery {
					p.setTerminalQueryPending(buffer)
					return output
				}
				output = append(output, buffer[0])
				buffer = buffer[1:]
				continue
			}
			sequence := buffer[:final+1]
			if response, ok := terminalQueryResponse(sequence); ok {
				responseData := []byte(response)
				p.expectGeneratedInput(responseData, 1)
				_ = p.writeGeneratedInput(responseData)
				buffer = buffer[final+1:]
				continue
			}
			if response, ok := terminalClientGeneratedResponse(sequence); ok {
				p.expectGeneratedInput([]byte(response), 1)
			} else if isCursorPositionQuery(sequence) {
				p.expectGeneratedCursorReport(1)
			}
			output = append(output, sequence...)
			buffer = buffer[final+1:]
		case ']':
			end, ok := findOSCTerminator(buffer)
			if !ok {
				if len(buffer) <= maxPendingTerminalQuery {
					p.setTerminalQueryPending(buffer)
					return output
				}
				output = append(output, buffer[0])
				buffer = buffer[1:]
				continue
			}
			sequence := buffer[:end]
			if response, ok := p.terminalOSCQueryResponse(sequence); ok {
				responseData := []byte(response)
				p.expectGeneratedInput(responseData, 1)
				_ = p.writeGeneratedInput(responseData)
				buffer = buffer[end:]
				continue
			}
			output = append(output, sequence...)
			buffer = buffer[end:]
		case 'Z':
			responseData := []byte(primaryDeviceAttributesResponse)
			p.expectGeneratedInput(responseData, 1)
			_ = p.writeGeneratedInput(responseData)
			buffer = buffer[2:]
		default:
			output = append(output, buffer[0])
			buffer = buffer[1:]
		}
	}
	return output
}

func (p *terminalPane) setTerminalQueryPending(data []byte) {
	p.mu.Lock()
	p.terminalQueryPending = append(p.terminalQueryPending[:0], data...)
	p.mu.Unlock()
}

func findOSCTerminator(sequence []byte) (int, bool) {
	if len(sequence) < 2 || sequence[0] != '\x1b' || sequence[1] != ']' {
		return -1, false
	}
	for index := 2; index < len(sequence); index++ {
		switch sequence[index] {
		case '\a':
			return index + 1, true
		case '\x1b':
			if index+1 < len(sequence) && sequence[index+1] == '\\' {
				return index + 2, true
			}
		}
	}
	return -1, false
}

func findAPCTerminator(sequence []byte) (int, bool) {
	if len(sequence) < 3 || sequence[0] != '\x1b' || sequence[1] != '_' {
		return -1, false
	}
	for index := 2; index < len(sequence); index++ {
		if sequence[index] == '\x1b' && index+1 < len(sequence) && sequence[index+1] == '\\' {
			return index + 2, true
		}
	}
	return -1, false
}

func terminalQueryResponse(sequence []byte) (string, bool) {
	if len(sequence) < 3 || sequence[0] != '\x1b' || sequence[1] != '[' || sequence[len(sequence)-1] != 'c' {
		return "", false
	}
	params := string(sequence[2 : len(sequence)-1])
	switch params {
	case "", "0":
		return primaryDeviceAttributesResponse, true
	case ">", ">0":
		return secondaryDeviceAttributesResponse, true
	default:
		return "", false
	}
}

func (p *terminalPane) terminalOSCQueryResponse(sequence []byte) (string, bool) {
	if len(sequence) < len("\x1b]10;?\a") || sequence[0] != '\x1b' || sequence[1] != ']' {
		return "", false
	}
	terminator := 0
	switch {
	case sequence[len(sequence)-1] == '\a':
		terminator = len(sequence) - 1
	case len(sequence) >= 2 && sequence[len(sequence)-2] == '\x1b' && sequence[len(sequence)-1] == '\\':
		terminator = len(sequence) - 2
	default:
		return "", false
	}
	switch string(sequence[2:terminator]) {
	case "10;?":
		return terminalOSCColorResponse("10", p.terminalForegroundColorValue()), true
	case "11;?":
		return terminalOSCColorResponse("11", p.terminalBackgroundColorValue()), true
	case "12;?":
		return terminalOSCColorResponse("12", p.terminalCursorColorValue()), true
	default:
		return "", false
	}
}

func (p *terminalPane) terminalForegroundColorValue() string {
	p.mu.Lock()
	value := p.terminalForegroundColor
	p.mu.Unlock()
	return normalizeTerminalHexColor(value, defaultTerminalForegroundColor)
}

func (p *terminalPane) terminalBackgroundColorValue() string {
	p.mu.Lock()
	value := p.terminalBackgroundColor
	p.mu.Unlock()
	return normalizeTerminalHexColor(value, defaultTerminalBackgroundColor)
}

func (p *terminalPane) terminalCursorColorValue() string {
	p.mu.Lock()
	value := p.terminalCursorColor
	p.mu.Unlock()
	return normalizeTerminalHexColor(value, defaultTerminalCursorColor)
}

func terminalOSCColorResponse(code, color string) string {
	color = normalizeTerminalHexColor(color, defaultTerminalForegroundColor)
	return fmt.Sprintf("\x1b]%s;rgb:%s/%s/%s\a", code, strings.Repeat(color[1:3], 2), strings.Repeat(color[3:5], 2), strings.Repeat(color[5:7], 2))
}

func terminalClientGeneratedResponse(sequence []byte) (string, bool) {
	if bytes.Equal(sequence, []byte("\x1b[5n")) {
		return "\x1b[0n", true
	}
	return "", false
}

func kittyGraphicsQueryResponse(sequence []byte) (string, bool) {
	if len(sequence) < len("\x1b_Ga=q;i=1\x1b\\") || sequence[0] != '\x1b' || sequence[1] != '_' {
		return "", false
	}
	if sequence[len(sequence)-2] != '\x1b' || sequence[len(sequence)-1] != '\\' {
		return "", false
	}
	body := sequence[3 : len(sequence)-2]
	control, _, _ := bytes.Cut(body, []byte(";"))
	attributes := make(map[string]string)
	for _, part := range bytes.Split(control, []byte(",")) {
		key, value, ok := bytes.Cut(part, []byte("="))
		if ok {
			attributes[string(key)] = string(value)
		}
	}
	if attributes["a"] != "q" {
		return "", false
	}
	imageID := attributes["i"]
	if imageID == "" {
		return "", false
	}
	for _, char := range imageID {
		if char < '0' || char > '9' {
			return "", false
		}
	}
	message := "OK"
	if transmission := attributes["t"]; transmission != "" && transmission != "d" {
		message = "EINVAL: only direct transmission is supported"
	} else if format := attributes["f"]; format != "" && format != "24" && format != "32" && format != "100" {
		message = "EINVAL: image format is unsupported"
	} else if compression := attributes["o"]; compression != "" && compression != "z" {
		message = "EINVAL: compression is unsupported"
	}
	return fmt.Sprintf("\x1b_Gi=%s;%s\x1b\\", imageID, message), true
}

func kittyGraphicsQueryControl(control []byte) bool {
	for _, part := range bytes.Split(control, []byte(",")) {
		if bytes.Equal(part, []byte("a=q")) {
			return true
		}
	}
	return false
}

func isCursorPositionQuery(sequence []byte) bool {
	return bytes.Equal(sequence, []byte("\x1b[6n"))
}
