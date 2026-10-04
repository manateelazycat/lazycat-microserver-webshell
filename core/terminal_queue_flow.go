package core

import (
	"errors"
	"github.com/gorilla/websocket"
)

const terminalQueueWindowProtocol = "window-ack-v1"

const terminalQueueWindowBytes = 1 << 20

const terminalQueueWindowTurns = 256

type terminalQueueConsumedBoundary struct {
	cursor, sequence uint64
	bytes            int
}

// Protected by the stream mutex. Bound bytes and marker count independently:
// tiny TUI writes must not turn the acknowledgement ledger into an unbounded queue.
type terminalQueueWindow struct {
	inFlight, currentTurnBytes int
	boundaries                 []terminalQueueConsumedBoundary
	ackCursor, ackSequence     uint64
}

func (s *terminalQueuePaneStream) usesWindow() bool {
	return s.subscription.FlowControl == terminalQueueWindowProtocol
}

func (s *terminalQueuePaneStream) windowAllows(entry terminalQueueOutbound) bool {
	if !s.usesWindow() || s.replayBurstActive || entry.messageType != websocket.BinaryMessage {
		return true
	}
	return len(s.window.boundaries) < terminalQueueWindowTurns && s.window.inFlight+entry.byteCost <= terminalQueueWindowBytes
}

func (s *terminalQueuePaneStream) acknowledgeWindow(cursor, sequence uint64) error {
	// Called with s.mu held. Repeated cumulative acknowledgement is harmless.
	if sequence == s.window.ackSequence && cursor == s.window.ackCursor {
		return nil
	}
	for index, boundary := range s.window.boundaries {
		if boundary.sequence != sequence || boundary.cursor != cursor {
			continue
		}
		for _, consumed := range s.window.boundaries[:index+1] {
			s.window.inFlight -= consumed.bytes
		}
		s.window.boundaries = append([]terminalQueueConsumedBoundary(nil), s.window.boundaries[index+1:]...)
		s.window.ackCursor, s.window.ackSequence = cursor, sequence
		return nil
	}
	return errors.New("queue consumption acknowledgement does not match a sent boundary")
}
