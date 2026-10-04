package sshserver

import (
	"net"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Reads use a pipe so SSH admission deadlines and WebSocket heartbeats have
// independent readers/deadlines. Writes complete the WebSocket frame before
// returning: a final exit-status must not be lost in an asynchronous pipe pump.
type websocketStream struct {
	net.Conn
	ws       *websocket.Conn
	mu       sync.Mutex
	deadline time.Time
}

func (s *websocketStream) Write(data []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	written := 0
	for len(data) > 0 {
		// Bound a stalled network frame, never the lifetime of the SSH task.
		deadline := time.Now().Add(120 * time.Second)
		if !s.deadline.IsZero() && s.deadline.Before(deadline) {
			deadline = s.deadline
		}
		if err := s.ws.SetWriteDeadline(deadline); err != nil {
			return written, err
		}
		n := min(len(data), 16<<10)
		if err := s.ws.WriteMessage(websocket.BinaryMessage, data[:n]); err != nil {
			return written, err
		}
		written += n
		data = data[n:]
	}
	return written, nil
}

func (s *websocketStream) SetWriteDeadline(deadline time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deadline = deadline
	return nil
}

func (s *websocketStream) SetDeadline(deadline time.Time) error {
	if err := s.Conn.SetReadDeadline(deadline); err != nil {
		return err
	}
	return s.SetWriteDeadline(deadline)
}

func (s *websocketStream) Close() error {
	_ = s.ws.Close()
	return s.Conn.Close()
}
