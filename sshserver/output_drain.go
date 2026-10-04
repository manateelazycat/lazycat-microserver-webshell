package sshserver

import (
	"context"
	"io"
	"time"
)

// Only stalled output has a deadline. Large outputs may take arbitrarily long
// while bytes continue to reach the SSH client.
type progressWriter struct {
	io.Writer
	activity chan<- struct{}
	failure  chan<- error
}

func (w progressWriter) Write(data []byte) (int, error) {
	n, err := w.Writer.Write(data)
	if n > 0 {
		select {
		case w.activity <- struct{}{}:
		default:
		}
	}
	if err != nil && w.failure != nil {
		select {
		case w.failure <- err:
		default:
		}
	}
	return n, err
}

func drainOutput(ctx context.Context, done <-chan struct{}, activity <-chan struct{}) bool {
	// Give a slow, still-progressing WebSocket frame time to complete.
	idle := time.NewTimer(150 * time.Second)
	defer idle.Stop()
	for {
		select {
		case <-ctx.Done():
			return false
		case <-done:
			return true
		case <-activity:
			if !idle.Stop() {
				select {
				case <-idle.C:
				default:
				}
			}
			idle.Reset(150 * time.Second)
		case <-idle.C:
			return false
		}
	}
}
