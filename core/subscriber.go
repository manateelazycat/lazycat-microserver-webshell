package core

import (
	"github.com/gorilla/websocket"
	"sync"
)

type paneClient struct {
	send chan paneOutbound
	done chan struct{}
	once sync.Once

	mu          sync.Mutex
	queuedBytes int
	pending     []paneOutbound
}

type paneOutbound struct {
	messageType int
	payload     []byte
	closeAfter  bool
}

func (c *paneClient) enqueue(outbound paneOutbound) bool {
	payloadSize := len(outbound.payload)
	c.mu.Lock()
	select {
	case <-c.done:
		c.mu.Unlock()
		return false
	default:
	}
	if c.queuedBytes+payloadSize > clientQueueLimit {
		c.mu.Unlock()
		c.close()
		return false
	}
	c.queuedBytes += payloadSize
	// History replay can keep the writer busy while many small live writes
	// arrive. Preserve the byte budget without disconnecting at 256 messages.
	// Once a backlog exists, append behind it to preserve control/data order.
	if len(c.pending) == 0 {
		select {
		case c.send <- outbound:
			c.mu.Unlock()
			return true
		default:
		}
	}
	if len(c.pending) > 0 {
		last := &c.pending[len(c.pending)-1]
		if last.messageType == websocket.BinaryMessage && outbound.messageType == websocket.BinaryMessage &&
			!last.closeAfter && !outbound.closeAfter && len(last.payload)+payloadSize <= historyChunkMaxBytes {
			last.payload = append(last.payload, outbound.payload...)
			c.mu.Unlock()
			return true
		}
	}
	if len(c.pending) >= clientQueueLimit/historyChunkMaxBytes {
		c.queuedBytes -= payloadSize
		c.mu.Unlock()
		c.close()
		return false
	}
	if outbound.messageType == websocket.BinaryMessage {
		// PTY payloads can be shared by subscribers. A coalesced tail must own
		// its storage until it is transferred to the writer through send.
		data := make([]byte, payloadSize, max(payloadSize, historyChunkMaxBytes))
		copy(data, outbound.payload)
		outbound.payload = data
	}
	c.pending = append(c.pending, outbound)
	c.mu.Unlock()
	return true
}

func (c *paneClient) dequeued(size int) {
	if size <= 0 {
		return
	}
	c.mu.Lock()
	c.queuedBytes -= size
	if c.queuedBytes < 0 {
		c.queuedBytes = 0
	}
	for len(c.pending) > 0 {
		select {
		case c.send <- c.pending[0]:
			c.pending[0] = paneOutbound{}
			c.pending = c.pending[1:]
		default:
			c.mu.Unlock()
			return
		}
	}
	c.pending = nil
	c.mu.Unlock()
}

func (c *paneClient) close() {
	c.once.Do(func() {
		close(c.done)
	})
}
