package core

import (
	"fmt"
	"strconv"
	"strings"
)

// Leave more than a normal 512 KiB live turn of headroom in the 4 MiB queue.
const terminalQueueReplayBurstMaxBytes = 3_500_000

func terminalQueueReplayBurstBytes(subscription terminalQueueSubscription, message map[string]any) int {
	if (subscription.FlowControl != "turn-ack-v1" && subscription.FlowControl != terminalQueueWindowProtocol) || subscription.ReplayBurstLimitBytes <= 0 || message["sync_mode"] != "snapshot" {
		return 0
	}
	start, startErr := strconv.ParseUint(strings.TrimSpace(fmt.Sprint(message["delta_from_cursor"])), 10, 64)
	end, endErr := strconv.ParseUint(strings.TrimSpace(fmt.Sprint(message["delta_to_cursor"])), 10, 64)
	limit := min(subscription.ReplayBurstLimitBytes, terminalQueueReplayBurstMaxBytes)
	if startErr != nil || endErr != nil || end <= start || end-start > uint64(limit) {
		return 0
	}
	return int(end - start)
}

// Scheduling still yields to other panes. An admitted snapshot waits for
// consumption only after its completion control has also been sent.
func (s *terminalQueuePaneStream) finishTurn(cursor, sequence uint64) (uint64, uint64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.active || s.overloaded {
		return 0, 0, false
	}
	if sequence != 0 {
		s.pendingTurnCursor = cursor
		s.pendingTurnSequence = sequence
	}
	if s.replayBurstActive || s.pendingTurnSequence == 0 {
		return 0, 0, false
	}
	cursor, sequence = s.pendingTurnCursor, s.pendingTurnSequence
	s.pendingTurnCursor, s.pendingTurnSequence = 0, 0
	if s.subscription.FlowControl == "turn-ack-v1" {
		s.awaitingTurnAck = true
		s.turnAckCursor = cursor
		s.turnAckSequence = sequence
	}
	if s.usesWindow() {
		s.window.boundaries = append(s.window.boundaries, terminalQueueConsumedBoundary{
			cursor: cursor, sequence: sequence, bytes: s.window.currentTurnBytes,
		})
		s.window.currentTurnBytes = 0
	}
	return cursor, sequence, true
}
