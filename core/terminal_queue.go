package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gorilla/websocket"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type terminalQueueBroker struct {
	backend            QueueBackend
	ctx                context.Context
	cancel             context.CancelFunc
	scope              AgentScope
	transportRole      string
	maxSubscriptions   int
	allowOrdinaryInput bool
	writeMessage       func(int, []byte) error

	mu        sync.Mutex
	streams   map[string]*terminalQueuePaneStream
	nextOrder uint64
	wake      chan struct{}
	done      chan struct{}
}

func NewTerminalQueueBroker(ctx context.Context, scope AgentScope, transportRole string, writer func(int, []byte) error, backend QueueBackend) *terminalQueueBroker {
	brokerCtx, cancel := context.WithCancel(ctx)
	role := strings.TrimSpace(transportRole)
	if role != "fast" && role != "unified" {
		role = "queue"
	}
	maxSubscriptions := terminalQueueMaxSubscriptions
	if role == "fast" {
		maxSubscriptions = terminalFastMaxSubscriptions
	}
	return &terminalQueueBroker{
		ctx:                brokerCtx,
		backend:            backend,
		cancel:             cancel,
		scope:              NormalizeAgentScope(scope.Selector, scope.AccountID),
		transportRole:      role,
		maxSubscriptions:   maxSubscriptions,
		allowOrdinaryInput: role == "fast" || role == "unified",
		writeMessage:       writer,
		streams:            make(map[string]*terminalQueuePaneStream),
		wake:               make(chan struct{}, 1),
		done:               make(chan struct{}),
	}
}

func (b *terminalQueueBroker) Close() {
	b.cancel()
	b.mu.Lock()
	streams := make([]*terminalQueuePaneStream, 0, len(b.streams))
	for _, stream := range b.streams {
		streams = append(streams, stream)
	}
	b.streams = make(map[string]*terminalQueuePaneStream)
	b.mu.Unlock()
	for _, stream := range streams {
		stream.deactivate()
		stream.stop()
	}
	select {
	case <-b.done:
	case <-time.After(2 * time.Second):
	}
}

func (b *terminalQueueBroker) signalWriter() {
	select {
	case b.wake <- struct{}{}:
	default:
	}
}

func (b *terminalQueueBroker) streamSnapshot() []*terminalQueuePaneStream {
	b.mu.Lock()
	streams := make([]*terminalQueuePaneStream, 0, len(b.streams))
	for _, stream := range b.streams {
		streams = append(streams, stream)
	}
	b.mu.Unlock()
	sort.Slice(streams, func(i, j int) bool {
		leftPriority, leftOrder := streams[i].priorityAndOrder()
		rightPriority, rightOrder := streams[j].priorityAndOrder()
		if leftPriority != rightPriority {
			return leftPriority < rightPriority
		}
		return leftOrder < rightOrder
	})
	return streams
}

func (b *terminalQueueBroker) RunWriter() {
	defer close(b.done)
	for {
		select {
		case <-b.ctx.Done():
			return
		case <-b.wake:
		}
		for {
			wrote := false
			for _, stream := range b.streamSnapshot() {
				target := stream.targetSequence()
				if target == 0 {
					continue
				}
				startedAt := time.Now()
				writtenBytes := 0
				turnCursor := uint64(0)
				turnSequence := uint64(0)
				for {
					entry, ok := stream.popThrough(target, writtenBytes)
					if !ok {
						break
					}
					if err := b.writeOutbound(stream, entry); err != nil {
						b.cancel()
						return
					}
					wrote = true
					if entry.messageType == websocket.BinaryMessage {
						turnCursor = entry.endCursor
						turnSequence = entry.binarySequence
					}
					writtenBytes += entry.byteCost
					if writtenBytes >= terminalQueueRoundByteBudget || time.Since(startedAt) >= terminalQueueRoundTimeBudget {
						break
					}
				}
				if cursor, sequence, acknowledge := stream.finishTurn(turnCursor, turnSequence); acknowledge {
					if err := b.writePaneControl(stream, map[string]any{
						"type":             "queue-turn-complete",
						"applied_cursor":   strconv.FormatUint(cursor, 10),
						"applied_sequence": strconv.FormatUint(sequence, 10),
					}); err != nil {
						b.cancel()
						return
					}
				}
			}
			if !wrote {
				break
			}
		}
	}
}

func (b *terminalQueueBroker) writePaneControl(stream *terminalQueuePaneStream, control any) error {
	payload, err := json.Marshal(control)
	if err != nil {
		return err
	}
	data, err := json.Marshal(TerminalQueueServerMessage{
		Type:              "pane-control",
		ProtocolVersion:   TerminalQueueProtocolVersion,
		PaneID:            stream.subscription.PaneID,
		StreamID:          stream.subscription.StreamID,
		ChannelGeneration: stream.subscription.ChannelGeneration,
		Payload:           payload,
	})
	if err != nil {
		return err
	}
	return b.writeMessage(websocket.TextMessage, data)
}

func (b *terminalQueueBroker) writeOutbound(stream *terminalQueuePaneStream, entry terminalQueueOutbound) error {
	if entry.messageType == websocket.BinaryMessage {
		frame, err := encodeTerminalQueueBinaryFrame(terminalQueueBinaryHeader{
			ProtocolVersion:   TerminalQueueProtocolVersion,
			PaneID:            stream.subscription.PaneID,
			StreamID:          stream.subscription.StreamID,
			ChannelGeneration: stream.subscription.ChannelGeneration,
			StartCursor:       strconv.FormatUint(entry.startCursor, 10),
			EndCursor:         strconv.FormatUint(entry.endCursor, 10),
			Sequence:          entry.binarySequence,
			Checksum:          terminalPayloadChecksum(entry.payload),
			HistoryGeneration: stream.subscription.HistoryGeneration,
		}, entry.payload)
		if err != nil {
			return err
		}
		return b.writeMessage(websocket.BinaryMessage, frame)
	}
	return b.writePaneControl(stream, json.RawMessage(entry.payload))
}

func (b *terminalQueueBroker) ReplaceSubscriptions(subscriptions []terminalQueueSubscription, terminalScrollback int) error {
	subscriptionsReceivedAt := time.Now()
	maxSubscriptions := b.maxSubscriptions
	if maxSubscriptions <= 0 {
		maxSubscriptions = terminalQueueMaxSubscriptions
	}
	if len(subscriptions) > maxSubscriptions {
		return fmt.Errorf("too many %s subscriptions: %d", b.transportRole, len(subscriptions))
	}
	type desiredStream struct {
		subscription terminalQueueSubscription
		syncRequest  HistorySyncRequest
	}
	desired := make(map[string]desiredStream, len(subscriptions))
	desiredOrder := make([]string, 0, len(subscriptions))
	for _, subscription := range subscriptions {
		normalized, syncRequest, err := validateTerminalQueueSubscription(subscription)
		if err != nil {
			return err
		}
		if _, exists := desired[normalized.PaneID]; exists {
			return fmt.Errorf("duplicate queue pane subscription: %s", normalized.PaneID)
		}
		desired[normalized.PaneID] = desiredStream{subscription: normalized, syncRequest: syncRequest}
		desiredOrder = append(desiredOrder, normalized.PaneID)
	}

	b.mu.Lock()
	removed := make([]*terminalQueuePaneStream, 0)
	for paneID, stream := range b.streams {
		want, exists := desired[paneID]
		if exists && stream.matches(want.subscription) {
			delete(desired, paneID)
			continue
		}
		delete(b.streams, paneID)
		removed = append(removed, stream)
	}
	b.mu.Unlock()
	for _, stream := range removed {
		stream.deactivate()
		stream.stop()
	}

	for subscriptionIndex, paneID := range desiredOrder {
		want, exists := desired[paneID]
		if !exists {
			continue
		}
		stream, err := b.startPaneStream(
			want.subscription,
			want.syncRequest,
			terminalScrollback,
			subscriptionsReceivedAt,
			subscriptionIndex,
			len(desiredOrder),
		)
		if err != nil {
			b.WritePaneError(want.subscription.PaneID, want.subscription.StreamID, want.subscription.ChannelGeneration, err)
			continue
		}
		b.mu.Lock()
		if existing := b.streams[want.subscription.PaneID]; existing != nil {
			b.mu.Unlock()
			stream.deactivate()
			stream.stop()
			continue
		}
		b.nextOrder++
		stream.order = b.nextOrder
		b.streams[want.subscription.PaneID] = stream
		b.mu.Unlock()
		b.signalWriter()
		go stream.run()
	}
	return nil
}

func (b *terminalQueueBroker) startPaneStream(
	subscription terminalQueueSubscription,
	syncRequest HistorySyncRequest,
	terminalScrollback int,
	subscriptionsReceivedAt time.Time,
	subscriptionIndex int,
	subscriptionCount int,
) (*terminalQueuePaneStream, error) {
	processStartRequestedAt := time.Now()
	syncRequest.CheckpointProtocol = subscription.CheckpointProtocol
	streamCtx, cancel := context.WithCancel(b.ctx)
	stream := &terminalQueuePaneStream{
		broker:       b,
		subscription: subscription,
		ctx:          streamCtx,
		cancel:       cancel,
		active:       true,
		priority:     clampTerminalStreamPriority(subscription.Priority),
		exited:       make(chan struct{}),
	}
	stderrLog := b.backend.Log(subscription.PaneID)
	stream.stderrLog = stderrLog
	connection, err := b.backend.Open(streamCtx, b.scope, subscription.PaneID, subscription.Cols, subscription.Rows, terminalScrollback, syncRequest, io.MultiWriter(&stream.stderr, stderrLog))
	if err != nil {
		cancel()
		return nil, err
	}
	stream.connection = connection
	stream.stdin = connection.Input
	stream.stdout = connection.Output
	go func() {
		_ = connection.Wait()
		stderrLog.Flush()
		close(stream.exited)
	}()
	if subscription.Foreground != "" || subscription.Background != "" || subscription.Cursor != "" {
		themeMessage := TerminalControlMessage{
			Type:       "theme",
			Foreground: subscription.Foreground,
			Background: subscription.Background,
			Cursor:     subscription.Cursor,
		}
		if payload, err := json.Marshal(themeMessage); err == nil {
			_ = stream.WriteAgentFrame(AgentFrameResize, payload)
		}
	}
	processStartedAt := time.Now()
	stream.enqueueControl(map[string]any{
		"type":                                "logical-attach-start",
		"server_unix_ms":                      processStartedAt.UnixMilli(),
		"queue_subscription_received_unix_ms": subscriptionsReceivedAt.UnixMilli(),
		"queue_wait_duration_ms":              processStartRequestedAt.Sub(subscriptionsReceivedAt).Milliseconds(),
		"process_start_duration_ms":           processStartedAt.Sub(processStartRequestedAt).Milliseconds(),
		"subscription_index":                  subscriptionIndex + 1,
		"subscription_count":                  subscriptionCount,
	})
	stream.enqueueControl(map[string]any{"type": "agent-preparing", "server_unix_ms": processStartedAt.UnixMilli()})
	return stream, nil
}

func (b *terminalQueueBroker) SetPriority(message TerminalQueueClientMessage) error {
	paneID := strings.TrimSpace(message.PaneID)
	b.mu.Lock()
	stream := b.streams[paneID]
	b.mu.Unlock()
	if stream == nil || !stream.matchesIdentity(message.StreamID, message.ChannelGeneration) {
		return errors.New("unified pane stream is not active")
	}
	stream.mu.Lock()
	stream.priority = clampTerminalStreamPriority(message.Priority)
	stream.mu.Unlock()
	b.signalWriter()
	return nil
}

func (b *terminalQueueBroker) HandlePaneControl(message TerminalQueueClientMessage) error {
	paneID := strings.TrimSpace(message.PaneID)
	b.mu.Lock()
	stream := b.streams[paneID]
	b.mu.Unlock()
	if stream == nil || !stream.matchesIdentity(message.StreamID, message.ChannelGeneration) {
		return errors.New("queue pane stream is not active")
	}
	if len(message.Control) == 0 {
		return errors.New("queue pane control payload is required")
	}
	var control TerminalControlMessage
	if err := json.Unmarshal(message.Control, &control); err != nil {
		return errors.New("invalid queue pane control payload")
	}
	switch control.Type {
	case "ping":
		stream.enqueueControl(map[string]any{"type": "pong"})
		return nil
	case "input":
		if !control.Generated && !b.allowOrdinaryInput {
			return errors.New("ordinary input requires a fast terminal channel")
		}
		if control.Data == "" {
			return nil
		}
		if control.Generated {
			return stream.WriteAgentFrame(AgentFrameGeneratedInput, []byte(control.Data))
		}
		return stream.WriteAgentFrame(AgentFrameInput, []byte(control.Data))
	case "resize", "theme":
		return stream.WriteAgentFrame(AgentFrameResize, message.Control)
	case "input_lock":
		// Compatibility no-op for older pages during rolling upgrades.
		return nil
	case "queue-turn-ack":
		return stream.acknowledgeTurn(control.Data)
	default:
		return fmt.Errorf("unsupported queue pane control type: %s", control.Type)
	}
}

func (b *terminalQueueBroker) WritePaneError(paneID, streamID string, generation uint64, err error) {
	if b.writeMessage == nil {
		return
	}
	payload, _ := json.Marshal(AgentConnectionErrorPayload(err))
	data, marshalErr := json.Marshal(TerminalQueueServerMessage{
		Type:              "pane-control",
		ProtocolVersion:   TerminalQueueProtocolVersion,
		PaneID:            strings.TrimSpace(paneID),
		StreamID:          strings.TrimSpace(streamID),
		ChannelGeneration: generation,
		Payload:           payload,
	})
	if marshalErr == nil {
		_ = b.writeMessage(websocket.TextMessage, data)
	}
}
