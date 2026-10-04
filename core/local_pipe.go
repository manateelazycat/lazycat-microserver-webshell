package core

import (
	"io"
	"net"
	"sync"
)

// The process-backed adapter has an OS pipe buffer. Give the in-process attach
// the same bounded input behavior: its startup diagnostic can precede the
// agent's input loop while the broker sends the initial theme.
type localAttachInput struct {
	conn   net.Conn
	writes chan []byte
	done   chan struct{}
	once   sync.Once
}

func newLocalAttachInput(conn net.Conn) *localAttachInput {
	w := &localAttachInput{conn: conn, writes: make(chan []byte, 4), done: make(chan struct{})}
	go func() {
		defer w.Close()
		for {
			select {
			case <-w.done:
				return
			case data := <-w.writes:
				if _, err := conn.Write(data); err != nil {
					return
				}
			}
		}
	}()
	return w
}
func (w *localAttachInput) Write(data []byte) (int, error) {
	written := 0
	for len(data) > 0 {
		size := min(len(data), 16<<10)
		select {
		case <-w.done:
			return written, io.ErrClosedPipe
		default:
		}
		chunk := append([]byte(nil), data[:size]...)
		select {
		case <-w.done:
			return written, io.ErrClosedPipe
		case w.writes <- chunk:
			written += size
			data = data[size:]
		}
	}
	return written, nil
}
func (w *localAttachInput) Close() error {
	w.once.Do(func() { close(w.done); _ = w.conn.Close() })
	return nil
}
