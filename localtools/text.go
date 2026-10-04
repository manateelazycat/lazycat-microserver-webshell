package localtools

import (
	"bytes"
	"golang.org/x/text/encoding/simplifiedchinese"
	"io"
	"strings"
	"unicode/utf8"
)

// DecodeText preserves the previous PC-only GB18030/Latin-1 mojibake handling.
// Containers never call this adapter; their byte stream remains unchanged.
func DecodeText(data []byte) []byte {
	if utf8.Valid(data) {
		return repairUnicode(data)
	}
	if legacyPrefix(data) != len(data) {
		return data
	}
	decoded, err := simplifiedchinese.GB18030.NewDecoder().Bytes(data)
	if err != nil || bytes.Contains(decoded, []byte("\ufffd")) {
		return data
	}
	high := 0
	for _, b := range data {
		if b >= 128 {
			high++
		}
	}
	chinese := chineseCount(string(decoded))
	if high > 0 && (chinese >= 2 || chinese >= 1 && high <= 4) {
		return decoded
	}
	return data
}

func chineseCount(text string) int {
	count := 0
	for _, r := range text {
		if r >= 0x3400 && r <= 0x9fff || r >= 0xf900 && r <= 0xfaff {
			count++
		}
	}
	return count
}
func repairUnicode(data []byte) []byte {
	text := string(data)
	if chineseCount(text) > 0 {
		return data
	}
	raw := make([]byte, 0, len(data))
	high := 0
	for _, r := range text {
		if r > 255 {
			return data
		}
		raw = append(raw, byte(r))
		if r >= 128 {
			high++
		}
	}
	if high < 2 {
		return data
	}
	decoded, err := simplifiedchinese.GB18030.NewDecoder().Bytes(raw)
	if err != nil || strings.ContainsRune(string(decoded), '\ufffd') || chineseCount(string(decoded)) < 2 {
		return data
	}
	roundtrip, err := simplifiedchinese.GB18030.NewEncoder().Bytes(decoded)
	if err == nil && bytes.Equal(roundtrip, raw) {
		return decoded
	}
	return data
}
func legacyPrefix(data []byte) int {
	i := 0
	for i < len(data) {
		if data[i] < 128 {
			i++
			continue
		}
		if data[i] < 0x81 || data[i] > 0xfe || i+1 >= len(data) {
			break
		}
		second := data[i+1]
		if second >= 0x30 && second <= 0x39 {
			if i+3 >= len(data) || data[i+2] < 0x81 || data[i+2] > 0xfe || data[i+3] < 0x30 || data[i+3] > 0x39 {
				break
			}
			i += 4
			continue
		}
		if second >= 0x40 && second <= 0xfe && second != 0x7f {
			i += 2
			continue
		}
		break
	}
	return i
}

type textReader struct {
	source          io.Reader
	pending, output []byte
	err             error
}

func NewTextReader(source io.Reader) io.Reader { return &textReader{source: source} }
func (r *textReader) Read(dst []byte) (int, error) {
	if len(dst) == 0 {
		return 0, nil
	}
	for len(r.output) == 0 && r.err == nil {
		buf := make([]byte, 32768)
		n, err := r.source.Read(buf)
		r.err = err
		data := append(r.pending, buf[:n]...)
		r.pending = nil
		if err != nil {
			r.output = DecodeText(data)
			break
		}
		index := 0
		for index < len(data) {
			if !utf8.FullRune(data[index:]) {
				r.pending = append([]byte(nil), data[index:]...)
				r.output = repairUnicode(data[:index])
				break
			}
			value, size := utf8.DecodeRune(data[index:])
			if value == utf8.RuneError && size == 1 {
				head := data[:index]
				tail := data[index:]
				count := legacyPrefix(tail)
				if count == 0 {
					if len(tail) < 4 && tail[0] >= 0x81 && tail[0] <= 0xfe {
						r.pending = append([]byte(nil), tail...)
						r.output = append([]byte(nil), head...)
					} else {
						r.output = data
					}
				} else {
					r.output = append(append([]byte(nil), head...), DecodeText(tail[:count])...)
					r.pending = append([]byte(nil), tail[count:]...)
				}
				break
			}
			index += size
		}
		if index == len(data) {
			r.output = repairUnicode(data)
		}
	}
	n := copy(dst, r.output)
	r.output = r.output[n:]
	if n > 0 {
		return n, nil
	}
	return 0, r.err
}
