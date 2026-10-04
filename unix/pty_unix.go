//go:build linux || darwin

package unix

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/creack/pty"
	"lcmd-webshell/core"
)

func (Platform) StartPTY(command *exec.Cmd) (core.PTY, error) { return pty.Start(command) }
func (Platform) ResizePTY(stream core.PTY, cols, rows, pixelWidth, pixelHeight int) error {
	file, ok := stream.(*os.File)
	if !ok {
		return fmt.Errorf("unsupported Unix PTY stream %T", stream)
	}
	return pty.Setsize(file, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows), X: uint16(pixelWidth), Y: uint16(pixelHeight)})
}
