package fonts

import (
	"errors"
	"strings"

	"golang.org/x/image/font/sfnt"
)

func ParseDisplayName(data []byte) (string, error) {
	font, err := sfnt.Parse(data)
	if err != nil {
		return "", err
	}
	var buffer sfnt.Buffer
	for _, nameID := range []sfnt.NameID{
		sfnt.NameIDTypographicFamily,
		sfnt.NameIDWWSFamily,
		sfnt.NameIDFamily,
		sfnt.NameIDFull,
		sfnt.NameIDCompatibleFull,
		sfnt.NameIDPostScript,
	} {
		name, err := font.Name(&buffer, nameID)
		if err != nil {
			continue
		}
		if name = cleanDisplayName(name); name != "" {
			return name, nil
		}
	}
	return "", errors.New("font name table does not contain a readable family name")
}

func cleanDisplayName(value string) string {
	value = strings.ReplaceAll(value, "\x00", "")
	value = strings.Join(strings.Fields(value), " ")
	value = strings.TrimSpace(value)
	if strings.Contains(value, "\ufffd") {
		return ""
	}
	return value
}
