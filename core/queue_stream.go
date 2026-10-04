package core

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gorilla/websocket"
	"io"
	"strconv"
	"strings"
	"sync"
	"time"
)

type terminalQueueOutbound struct {
	sequence          uint64
	binarySequence    uint64
	messageType       int
	payload           []byte
	startCursor       uint64
	endCursor         uint64
	byteCost          int
	replayBurstStart  bool
	replayBurstFinish bool
}

type terminalQueuePaneStream struct {
	broker       *terminalQueueBroker
	subscription terminalQueueSubscription
	order        uint64

	ctx    context.Context
	cancel context.CancelFunc

	connection QueueConnection
	stdin      io.WriteCloser
	stdout     io.ReadCloser
	stderr     bytes.Buffer
	stderrLog  QueueLog

	stdinMu sync.Mutex
	stopMu  sync.Mutex
	stopped bool
	exited  chan struct{}

	mu                  sync.Mutex
	active              bool
	overloaded          bool
	priority            int
	terminalControl     bool
	nextSequence        uint64
	binarySequence      uint64
	awaitingTurnAck     bool
	turnAckCursor       uint64
	turnAckSequence     uint64
	window              terminalQueueWindow
	replayBurstActive   bool
	pendingTurnCursor   uint64
	pendingTurnSequence uint64
	buffer              []terminalQueueOutbound
	bufferBytes         int
	hasCursor           bool
	cursor              uint64
}

func (s *terminalQueuePaneStream) priorityAndOrder() (int, uint64) {
	s.mu.Lock()
	priority := s.priority
	s.mu.Unlock()
	return priority, s.order
}

func (s *terminalQueuePaneStream) matches(subscription terminalQueueSubscription) bool {
	return s.matchesIdentity(subscription.StreamID, subscription.ChannelGeneration)
}

func (s *terminalQueuePaneStream) matchesIdentity(streamID string, generation uint64) bool {
	return s.subscription.StreamID == strings.TrimSpace(streamID) && s.subscription.ChannelGeneration == generation
}

func (s *terminalQueuePaneStream) deactivate() {
	s.mu.Lock()
	s.active = false
	s.buffer = nil
	s.bufferBytes = 0
	s.mu.Unlock()
}

func (s *terminalQueuePaneStream) stop() {
	s.stopMu.Lock()
	if s.stopped {
		s.stopMu.Unlock()
		return
	}
	s.stopped = true
	s.stopMu.Unlock()
	s.stdinMu.Lock()
	if s.stdin != nil {
		_ = WriteAgentFrame(s.stdin, AgentFrameDetach, nil)
		_ = s.stdin.Close()
	}
	s.stdinMu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	if s.connection.Kill == nil || s.exited == nil {
		return
	}
	go func() {
		select {
		case <-s.exited:
		case <-time.After(2 * time.Second):
			_ = s.connection.Kill()
		}
	}()
}

func (s *terminalQueuePaneStream) WriteAgentFrame(frameType byte, payload []byte) error {
	s.stopMu.Lock()
	defer s.stopMu.Unlock()
	if s.stopped {
		return errors.New("queue pane stream is closed")
	}
	s.stdinMu.Lock()
	defer s.stdinMu.Unlock()
	return WriteAgentFrame(s.stdin, frameType, payload)
}

func (s *terminalQueuePaneStream) waitForBufferCapacity() bool {
	for {
		s.mu.Lock()
		ready := s.active && !s.overloaded && s.bufferBytes < terminalQueuePaneBufferHighWater
		s.mu.Unlock()
		if ready {
			return true
		}
		if s.isStopped() {
			return false
		}
		select {
		case <-s.ctx.Done():
			return false
		case <-time.After(2 * time.Millisecond):
		}
	}
}

func (s *terminalQueuePaneStream) run() {
	defer s.stop()
	for {
		if !s.waitForBufferCapacity() {
			return
		}
		frameType, payload, err := ReadAgentFrame(s.stdout)
		if err != nil {
			if s.isStopped() || errors.Is(err, context.Canceled) {
				return
			}
			text := strings.TrimSpace(s.stderr.String())
			if text != "" {
				if IsPaneNotFoundAttachError(text) {
					s.enqueueControl(map[string]any{
						"type":     "workspace-refresh-required",
						"selector": s.broker.scope.Selector,
						"reason":   text,
					})
				} else if !s.hasTerminalControl() {
					s.enqueueControl(AgentConnectionErrorPayload(errors.New(text)))
				}
			} else if !s.hasTerminalControl() {
				s.enqueueControl(AgentConnectionErrorPayload(err))
			}
			return
		}
		switch frameType {
		case agentFrameBinary:
			s.enqueueBinary(payload)
		case AgentFrameText:
			s.enqueueText(payload)
		}
	}
}

func (s *terminalQueuePaneStream) isStopped() bool {
	s.stopMu.Lock()
	stopped := s.stopped
	s.stopMu.Unlock()
	return stopped
}

func (s *terminalQueuePaneStream) hasTerminalControl() bool {
	s.mu.Lock()
	terminal := s.terminalControl
	s.mu.Unlock()
	return terminal
}

func (s *terminalQueuePaneStream) enqueueControl(payload any) {
	data, err := json.Marshal(payload)
	if err == nil {
		s.enqueueText(data)
	}
}

func (s *terminalQueuePaneStream) enqueueText(payload []byte) {
	var message map[string]any
	entry := terminalQueueOutbound{messageType: websocket.TextMessage}
	if err := json.Unmarshal(payload, &message); err == nil {
		typeName := strings.TrimSpace(fmt.Sprint(message["type"]))
		if typeName == "terminal-checkpoint-diagnostic" || typeName == "terminal-checkpoint-error" || typeName == "resize-applied" {
			LogCheckpointDiagnostic(s.broker.scope, s.subscription.PaneID, payload)
		}
		s.mu.Lock()
		switch typeName {
		case "history-replay-start":
			if cursor, err := strconv.ParseUint(strings.TrimSpace(fmt.Sprint(message["delta_from_cursor"])), 10, 64); err == nil {
				s.cursor = cursor
				s.hasCursor = true
			}
			if size := terminalQueueReplayBurstBytes(s.subscription, message); size > 0 {
				message["replay_burst_bytes"] = size
				if encoded, err := json.Marshal(message); err == nil {
					payload = encoded
					entry.replayBurstStart = true
				}
			}
		case "history-replay-complete":
			if cursor, err := strconv.ParseUint(strings.TrimSpace(fmt.Sprint(message["history_cursor"])), 10, 64); err != nil || !s.hasCursor || cursor != s.cursor {
				s.mu.Unlock()
				s.overload("queue history cursor is not continuous")
				return
			}
			entry.replayBurstFinish = true
		case "process-exit", "workspace-refresh-required", "terminal-checkpoint-error":
			s.terminalControl = true
			entry.replayBurstFinish = true
		case "connection-error":
			entry.replayBurstFinish = true
		}
		s.mu.Unlock()
	}
	entry.payload = append([]byte(nil), payload...)
	entry.byteCost = len(payload)
	s.enqueue(entry)
}

func (s *terminalQueuePaneStream) enqueueBinary(payload []byte) {
	if len(payload) == 0 {
		return
	}
	s.mu.Lock()
	if !s.hasCursor {
		s.mu.Unlock()
		s.overload("queue output arrived before history cursor")
		return
	}
	if s.bufferBytes+len(payload) > terminalQueuePaneBufferLimit {
		s.mu.Unlock()
		s.overload("queue pane buffer exceeded its limit")
		return
	}
	startCursor := s.cursor
	s.cursor += uint64(len(payload))
	s.mu.Unlock()
	for offset := 0; offset < len(payload); {
		end := offset + terminalQueueBinaryPayloadMaxBytes
		if end > len(payload) {
			end = len(payload)
		}
		chunk := append([]byte(nil), payload[offset:end]...)
		s.mu.Lock()
		s.binarySequence++
		sequence := s.binarySequence
		chunkStart := startCursor + uint64(offset)
		chunkEnd := chunkStart + uint64(len(chunk))
		s.mu.Unlock()
		s.enqueue(terminalQueueOutbound{
			messageType:    websocket.BinaryMessage,
			payload:        chunk,
			startCursor:    chunkStart,
			endCursor:      chunkEnd,
			binarySequence: sequence,
			byteCost:       len(chunk),
		})
		offset = end
	}
}

func (s *terminalQueuePaneStream) enqueue(entry terminalQueueOutbound) {
	s.mu.Lock()
	if !s.active || s.overloaded {
		s.mu.Unlock()
		return
	}
	if s.bufferBytes+entry.byteCost > terminalQueuePaneBufferLimit {
		s.mu.Unlock()
		s.overload("queue pane buffer exceeded its limit")
		return
	}
	s.nextSequence++
	entry.sequence = s.nextSequence
	s.buffer = append(s.buffer, entry)
	s.bufferBytes += entry.byteCost
	s.mu.Unlock()
	s.broker.signalWriter()
}

func (s *terminalQueuePaneStream) overload(reason string) {
	payload, _ := json.Marshal(map[string]any{
		"type":            "connection-error",
		"message":         reason,
		"retryable":       true,
		"resync_required": true,
	})
	s.mu.Lock()
	if !s.active || s.overloaded {
		s.mu.Unlock()
		return
	}
	s.overloaded = true
	s.replayBurstActive = false
	s.pendingTurnCursor = 0
	s.pendingTurnSequence = 0
	s.awaitingTurnAck = false
	s.window = terminalQueueWindow{}
	s.buffer = nil
	s.bufferBytes = 0
	s.nextSequence++
	s.buffer = append(s.buffer, terminalQueueOutbound{
		sequence:    s.nextSequence,
		messageType: websocket.TextMessage,
		payload:     payload,
		byteCost:    len(payload),
	})
	s.bufferBytes = len(payload)
	s.mu.Unlock()
	s.broker.signalWriter()
	go s.stop()
}

func (s *terminalQueuePaneStream) acknowledgeTurn(value string) error {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 2 {
		return errors.New("invalid queue turn acknowledgement")
	}
	cursor, cursorErr := strconv.ParseUint(parts[0], 10, 64)
	sequence, sequenceErr := strconv.ParseUint(parts[1], 10, 64)
	if cursorErr != nil || sequenceErr != nil {
		return errors.New("invalid queue turn acknowledgement")
	}
	s.mu.Lock()
	if s.usesWindow() {
		err := s.acknowledgeWindow(cursor, sequence)
		s.mu.Unlock()
		if err == nil {
			s.broker.signalWriter()
		}
		return err
	}
	if s.subscription.FlowControl != "turn-ack-v1" || !s.awaitingTurnAck || cursor != s.turnAckCursor || sequence != s.turnAckSequence {
		s.mu.Unlock()
		return errors.New("queue turn acknowledgement does not match")
	}
	s.awaitingTurnAck = false
	s.turnAckCursor = 0
	s.turnAckSequence = 0
	s.mu.Unlock()
	s.broker.signalWriter()
	return nil
}

func (s *terminalQueuePaneStream) targetSequence() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.active || s.awaitingTurnAck || len(s.buffer) == 0 {
		return 0
	}
	if !s.windowAllows(s.buffer[0]) {
		return 0
	}
	return s.buffer[len(s.buffer)-1].sequence
}

func (s *terminalQueuePaneStream) popThrough(target uint64, alreadyWritten int) (terminalQueueOutbound, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.active || len(s.buffer) == 0 || s.buffer[0].sequence > target {
		return terminalQueueOutbound{}, false
	}
	entry := s.buffer[0]
	if !s.windowAllows(entry) {
		return terminalQueueOutbound{}, false
	}
	if alreadyWritten > 0 && entry.byteCost > 0 && alreadyWritten+entry.byteCost > terminalQueueRoundByteBudget {
		return terminalQueueOutbound{}, false
	}
	s.buffer[0] = terminalQueueOutbound{}
	s.buffer = s.buffer[1:]
	// Apply markers in wire order, independently of the agent reader's lead.
	if entry.replayBurstStart {
		s.replayBurstActive = true
	}
	if entry.replayBurstFinish {
		s.replayBurstActive = false
	}
	if s.usesWindow() && entry.messageType == websocket.BinaryMessage {
		s.window.inFlight += entry.byteCost
		s.window.currentTurnBytes += entry.byteCost
	}
	s.bufferBytes -= entry.byteCost
	if s.bufferBytes < 0 {
		s.bufferBytes = 0
	}
	return entry, true
}
