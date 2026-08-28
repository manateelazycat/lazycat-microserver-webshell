package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"net/http"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	terminalQueueProtocolVersion       = 1
	terminalQueueMaxSubscriptions      = 1024
	terminalFastMaxSubscriptions       = 1
	terminalQueuePaneBufferLimit       = 4 << 20
	terminalQueuePaneBufferHighWater   = 3 << 20
	terminalQueueRoundByteBudget       = 512 << 10
	terminalQueueRoundTimeBudget       = 8 * time.Millisecond
	terminalQueueBinaryPayloadMaxBytes = 512 << 10
	terminalQueueBinaryMagic           = "LCQ1"
	terminalQueueBinaryPrefixSize      = 8
)

type terminalQueueCheckpointCapability struct {
	Protocol     string `json:"protocol"`
	MaxTailBytes int    `json:"max_tail_bytes"`
}

type terminalQueueSubscription struct {
	PaneID                 string                              `json:"pane_id"`
	StreamID               string                              `json:"stream_id"`
	ChannelGeneration      uint64                              `json:"channel_generation"`
	Cols                   int                                 `json:"cols,omitempty"`
	Rows                   int                                 `json:"rows,omitempty"`
	PixelWidth             int                                 `json:"pixel_width,omitempty"`
	PixelHeight            int                                 `json:"pixel_height,omitempty"`
	CacheProtocol          int                                 `json:"cache_protocol_version,omitempty"`
	WorkspaceGeneration    string                              `json:"workspace_generation,omitempty"`
	HistoryGeneration      string                              `json:"history_generation,omitempty"`
	LocalBaseCursor        string                              `json:"local_base_cursor,omitempty"`
	LocalEndCursor         string                              `json:"local_end_cursor,omitempty"`
	HistoryReplayMode      string                              `json:"history_replay_mode,omitempty"`
	FlowControl            string                              `json:"flow_control,omitempty"`
	CheckpointCapabilities []terminalQueueCheckpointCapability `json:"checkpoint_capabilities,omitempty"`
	Priority               int                                 `json:"priority,omitempty"`
	Foreground             string                              `json:"foreground,omitempty"`
	Background             string                              `json:"background,omitempty"`
	Cursor                 string                              `json:"cursor,omitempty"`
}

type terminalQueueClientMessage struct {
	Type              string                      `json:"type"`
	ProtocolVersion   int                         `json:"protocol_version,omitempty"`
	PaneID            string                      `json:"pane_id,omitempty"`
	StreamID          string                      `json:"stream_id,omitempty"`
	ChannelGeneration uint64                      `json:"channel_generation,omitempty"`
	Subscriptions     []terminalQueueSubscription `json:"subscriptions,omitempty"`
	Control           json.RawMessage             `json:"control,omitempty"`
	Data              string                      `json:"data,omitempty"`
	Priority          int                         `json:"priority,omitempty"`
}

type terminalQueueServerMessage struct {
	Type              string          `json:"type"`
	ProtocolVersion   int             `json:"protocol_version"`
	PaneID            string          `json:"pane_id,omitempty"`
	StreamID          string          `json:"stream_id,omitempty"`
	ChannelGeneration uint64          `json:"channel_generation,omitempty"`
	State             string          `json:"state,omitempty"`
	Message           string          `json:"message,omitempty"`
	Payload           json.RawMessage `json:"payload,omitempty"`
}

type terminalQueueBinaryHeader struct {
	ProtocolVersion   int    `json:"protocol_version"`
	PaneID            string `json:"pane_id"`
	StreamID          string `json:"stream_id"`
	ChannelGeneration uint64 `json:"channel_generation"`
	StartCursor       string `json:"start_cursor"`
	EndCursor         string `json:"end_cursor"`
	Sequence          uint64 `json:"sequence"`
	Checksum          string `json:"checksum"`
	HistoryGeneration string `json:"history_generation,omitempty"`
}

type terminalQueueOutbound struct {
	sequence       uint64
	binarySequence uint64
	messageType    int
	payload        []byte
	startCursor    uint64
	endCursor      uint64
	byteCost       int
}

type terminalQueuePaneStream struct {
	broker       *terminalQueueBroker
	subscription terminalQueueSubscription
	order        uint64

	ctx    context.Context
	cancel context.CancelFunc

	command *exec.Cmd
	stdin   io.WriteCloser
	stdout  io.ReadCloser
	stderr  bytes.Buffer

	stdinMu sync.Mutex
	stopMu  sync.Mutex
	stopped bool
	exited  chan struct{}

	mu              sync.Mutex
	active          bool
	overloaded      bool
	priority        int
	terminalControl bool
	nextSequence    uint64
	binarySequence  uint64
	awaitingTurnAck bool
	turnAckCursor   uint64
	turnAckSequence uint64
	buffer          []terminalQueueOutbound
	bufferBytes     int
	hasCursor       bool
	cursor          uint64
}

type terminalQueueBroker struct {
	ctx                context.Context
	cancel             context.CancelFunc
	scope              agentScope
	clientID           string
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

func (s *pluginServer) attachPersistentPaneQueue(w http.ResponseWriter, r *http.Request) error {
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return nil
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return nil
	}
	if isClientTarget(selector) {
		http.Error(w, "queue websocket is not supported for client targets", http.StatusBadRequest)
		return nil
	}
	transportRole := strings.TrimSpace(r.URL.Query().Get("transport_role"))
	if transportRole == "" {
		transportRole = "queue"
	}
	if transportRole != "queue" && transportRole != "fast" && transportRole != "unified" {
		http.Error(w, "unsupported terminal transport role", http.StatusBadRequest)
		return nil
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return nil
	}
	if !websocket.IsWebSocketUpgrade(r) {
		http.Error(w, "websocket upgrade is required", http.StatusBadRequest)
		return nil
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()
	conn.EnableWriteCompression(false)
	conn.SetReadLimit(websocketReadLimit)

	var writeMu sync.Mutex
	writeMessage := func(messageType int, payload []byte) error {
		return writeWebSocketMessageLocked(conn, &writeMu, messageType, payload)
	}
	writeJSON := func(payload any) error {
		data, marshalErr := json.Marshal(payload)
		if marshalErr != nil {
			return marshalErr
		}
		return writeMessage(websocket.TextMessage, data)
	}

	_ = writeJSON(terminalQueueServerMessage{
		Type:            "queue-state",
		ProtocolVersion: terminalQueueProtocolVersion,
		State:           "agent-preparing",
	})

	scope := normalizeAgentScope(selector, accountID)
	if _, err := ensurePersistentAgent(r.Context(), scope); err != nil {
		payload, _ := json.Marshal(agentConnectionErrorPayload(err))
		_ = writeJSON(terminalQueueServerMessage{
			Type:            "queue-error",
			ProtocolVersion: terminalQueueProtocolVersion,
			Message:         err.Error(),
			Payload:         payload,
		})
		return nil
	}
	if err := pingPersistentAgentError(r.Context(), scope); err != nil {
		rememberIncompatiblePersistentAgentNotice(scope, err)
		markPersistentAgentNotRunning(scope)
		if _, ensureErr := ensurePersistentAgent(r.Context(), scope); ensureErr != nil {
			payload, _ := json.Marshal(agentConnectionErrorPayload(ensureErr))
			_ = writeJSON(terminalQueueServerMessage{
				Type:            "queue-error",
				ProtocolVersion: terminalQueueProtocolVersion,
				Message:         ensureErr.Error(),
				Payload:         payload,
			})
			return nil
		}
	}

	clientID := strings.TrimSpace(r.URL.Query().Get("client_id"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.URL.Query().Get("client"))
	}
	broker := newTerminalQueueBroker(context.Background(), scope, clientID, transportRole, writeMessage)
	defer broker.close()
	go broker.runWriter()

	if err := writeJSON(terminalQueueServerMessage{
		Type:            "queue-ready",
		ProtocolVersion: terminalQueueProtocolVersion,
		State:           "open",
	}); err != nil {
		return nil
	}

	_ = conn.SetReadDeadline(time.Now().Add(websocketReadTimeout))
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			return nil
		}
		_ = conn.SetReadDeadline(time.Now().Add(websocketReadTimeout))
		if messageType != websocket.TextMessage {
			continue
		}
		var message terminalQueueClientMessage
		if err := json.Unmarshal(payload, &message); err != nil {
			_ = writeJSON(terminalQueueServerMessage{
				Type:            "queue-error",
				ProtocolVersion: terminalQueueProtocolVersion,
				Message:         "invalid queue control message",
			})
			continue
		}
		switch strings.TrimSpace(message.Type) {
		case "replace-subscriptions":
			if message.ProtocolVersion != terminalQueueProtocolVersion {
				_ = writeJSON(terminalQueueServerMessage{
					Type:            "queue-error",
					ProtocolVersion: terminalQueueProtocolVersion,
					Message:         "unsupported queue protocol version",
				})
				continue
			}
			if err := broker.replaceSubscriptions(message.Subscriptions, s.currentTerminalScrollback()); err != nil {
				_ = writeJSON(terminalQueueServerMessage{
					Type:            "queue-error",
					ProtocolVersion: terminalQueueProtocolVersion,
					Message:         err.Error(),
				})
			}
		case "pane-control":
			if err := broker.handlePaneControl(message); err != nil {
				broker.writePaneError(message.PaneID, message.StreamID, message.ChannelGeneration, err)
			}
		case "pane-input":
			message.Control, _ = json.Marshal(map[string]any{
				"type": "input",
				"data": message.Data,
			})
			if err := broker.handlePaneControl(message); err != nil {
				broker.writePaneError(message.PaneID, message.StreamID, message.ChannelGeneration, err)
			}
		case "set-priority":
			if err := broker.setPriority(message); err != nil {
				broker.writePaneError(message.PaneID, message.StreamID, message.ChannelGeneration, err)
			}
		case "queue-ping":
			_ = writeJSON(terminalQueueServerMessage{
				Type:            "queue-pong",
				ProtocolVersion: terminalQueueProtocolVersion,
			})
		}
	}
}

func newTerminalQueueBroker(ctx context.Context, scope agentScope, clientID, transportRole string, writer func(int, []byte) error) *terminalQueueBroker {
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
		cancel:             cancel,
		scope:              normalizeAgentScope(scope.Selector, scope.AccountID),
		clientID:           strings.TrimSpace(clientID),
		transportRole:      role,
		maxSubscriptions:   maxSubscriptions,
		allowOrdinaryInput: role == "fast" || role == "unified",
		writeMessage:       writer,
		streams:            make(map[string]*terminalQueuePaneStream),
		wake:               make(chan struct{}, 1),
		done:               make(chan struct{}),
	}
}

func (b *terminalQueueBroker) close() {
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

func (b *terminalQueueBroker) runWriter() {
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
				wroteBinary := false
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
					wroteBinary = wroteBinary || entry.messageType == websocket.BinaryMessage
					if entry.messageType == websocket.BinaryMessage {
						turnCursor = entry.endCursor
						turnSequence = entry.binarySequence
					}
					writtenBytes += entry.byteCost
					if writtenBytes >= terminalQueueRoundByteBudget || time.Since(startedAt) >= terminalQueueRoundTimeBudget {
						break
					}
				}
				if wroteBinary {
					stream.markTurnAwaitingAck(turnCursor, turnSequence)
					if err := b.writePaneControl(stream, map[string]any{
						"type":             "queue-turn-complete",
						"applied_cursor":   strconv.FormatUint(turnCursor, 10),
						"applied_sequence": strconv.FormatUint(turnSequence, 10),
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
	data, err := json.Marshal(terminalQueueServerMessage{
		Type:              "pane-control",
		ProtocolVersion:   terminalQueueProtocolVersion,
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
			ProtocolVersion:   terminalQueueProtocolVersion,
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

func terminalPayloadChecksum(payload []byte) string {
	value := crc32.ChecksumIEEE(payload)
	var encoded [4]byte
	binary.BigEndian.PutUint32(encoded[:], value)
	return hex.EncodeToString(encoded[:])
}

func encodeTerminalQueueBinaryFrame(header terminalQueueBinaryHeader, payload []byte) ([]byte, error) {
	headerData, err := json.Marshal(header)
	if err != nil {
		return nil, err
	}
	if len(headerData) == 0 || len(headerData) > 64<<10 {
		return nil, errors.New("queue binary header is too large")
	}
	frame := make([]byte, terminalQueueBinaryPrefixSize+len(headerData)+len(payload))
	copy(frame[:4], terminalQueueBinaryMagic)
	binary.BigEndian.PutUint32(frame[4:8], uint32(len(headerData)))
	copy(frame[8:8+len(headerData)], headerData)
	copy(frame[8+len(headerData):], payload)
	return frame, nil
}

func validateTerminalQueueSubscription(subscription terminalQueueSubscription) (terminalQueueSubscription, historySyncRequest, error) {
	subscription.PaneID = strings.TrimSpace(subscription.PaneID)
	subscription.StreamID = strings.TrimSpace(subscription.StreamID)
	subscription.WorkspaceGeneration = strings.TrimSpace(subscription.WorkspaceGeneration)
	subscription.HistoryGeneration = strings.TrimSpace(subscription.HistoryGeneration)
	subscription.HistoryReplayMode = strings.TrimSpace(subscription.HistoryReplayMode)
	subscription.FlowControl = strings.TrimSpace(subscription.FlowControl)
	if subscription.FlowControl != "" && subscription.FlowControl != "turn-ack-v1" {
		return subscription, historySyncRequest{}, errors.New("unsupported queue flow control")
	}
	if subscription.PaneID == "" || len(subscription.PaneID) > 128 {
		return subscription, historySyncRequest{}, errors.New("invalid queue pane id")
	}
	if subscription.StreamID == "" || len(subscription.StreamID) > 128 {
		return subscription, historySyncRequest{}, errors.New("invalid queue stream id")
	}
	if subscription.ChannelGeneration == 0 {
		return subscription, historySyncRequest{}, errors.New("invalid queue channel generation")
	}
	if len(subscription.WorkspaceGeneration) > 128 || len(subscription.HistoryGeneration) > 128 {
		return subscription, historySyncRequest{}, errors.New("invalid queue history identity")
	}
	syncRequest := historySyncRequest{
		cacheProtocolVersion: subscription.CacheProtocol,
		workspaceGeneration:  subscription.WorkspaceGeneration,
		generation:           subscription.HistoryGeneration,
		forceSnapshot:        subscription.HistoryReplayMode == "snapshot",
	}
	baseText := strings.TrimSpace(subscription.LocalBaseCursor)
	endText := strings.TrimSpace(subscription.LocalEndCursor)
	if subscription.HistoryGeneration != "" || baseText != "" || endText != "" {
		if subscription.HistoryGeneration == "" || baseText == "" || endText == "" {
			return subscription, historySyncRequest{}, errors.New("incomplete queue history range")
		}
		base, baseErr := strconv.ParseUint(baseText, 10, 64)
		end, endErr := strconv.ParseUint(endText, 10, 64)
		if baseErr != nil || endErr != nil || base > end {
			return subscription, historySyncRequest{}, errors.New("invalid queue history range")
		}
		syncRequest.localBase = base
		syncRequest.localEnd = end
		syncRequest.hasRange = true
	}
	return subscription, syncRequest, nil
}

func (b *terminalQueueBroker) replaceSubscriptions(subscriptions []terminalQueueSubscription, terminalScrollback int) error {
	maxSubscriptions := b.maxSubscriptions
	if maxSubscriptions <= 0 {
		maxSubscriptions = terminalQueueMaxSubscriptions
	}
	if len(subscriptions) > maxSubscriptions {
		return fmt.Errorf("too many %s subscriptions: %d", b.transportRole, len(subscriptions))
	}
	type desiredStream struct {
		subscription terminalQueueSubscription
		syncRequest  historySyncRequest
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

	for _, paneID := range desiredOrder {
		want, exists := desired[paneID]
		if !exists {
			continue
		}
		stream, err := b.startPaneStream(want.subscription, want.syncRequest, terminalScrollback)
		if err != nil {
			b.writePaneError(want.subscription.PaneID, want.subscription.StreamID, want.subscription.ChannelGeneration, err)
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

func (b *terminalQueueBroker) startPaneStream(subscription terminalQueueSubscription, syncRequest historySyncRequest, terminalScrollback int) (*terminalQueuePaneStream, error) {
	streamCtx, cancel := context.WithCancel(b.ctx)
	command := exec.CommandContext(streamCtx, lightosctlPath, persistentAgentAttachCommandArgs(
		b.scope,
		subscription.PaneID,
		subscription.Cols,
		subscription.Rows,
		terminalScrollback,
		syncRequest,
	)...)
	stdout, err := command.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	stdin, err := command.StdinPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	stream := &terminalQueuePaneStream{
		broker:       b,
		subscription: subscription,
		ctx:          streamCtx,
		cancel:       cancel,
		command:      command,
		stdin:        stdin,
		stdout:       stdout,
		active:       true,
		priority:     clampTerminalStreamPriority(subscription.Priority),
		exited:       make(chan struct{}),
	}
	command.Stderr = &stream.stderr
	if err := command.Start(); err != nil {
		cancel()
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, err
	}
	go func() {
		_ = command.Wait()
		close(stream.exited)
	}()
	if subscription.Foreground != "" || subscription.Background != "" || subscription.Cursor != "" {
		themeMessage := terminalControlMessage{
			Type:       "theme",
			Foreground: subscription.Foreground,
			Background: subscription.Background,
			Cursor:     subscription.Cursor,
		}
		if payload, err := json.Marshal(themeMessage); err == nil {
			_ = stream.writeAgentFrame(agentFrameResize, payload)
		}
	}
	stream.enqueueControl(map[string]any{"type": "agent-preparing"})
	return stream, nil
}

func clampTerminalStreamPriority(value int) int {
	if value < 0 {
		return 0
	}
	if value > 3 {
		return 3
	}
	return value
}

func (s *terminalQueuePaneStream) priorityAndOrder() (int, uint64) {
	s.mu.Lock()
	priority := s.priority
	s.mu.Unlock()
	return priority, s.order
}

func (b *terminalQueueBroker) setPriority(message terminalQueueClientMessage) error {
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

func (b *terminalQueueBroker) handlePaneControl(message terminalQueueClientMessage) error {
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
	var control terminalControlMessage
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
			return stream.writeAgentFrame(agentFrameGeneratedInput, []byte(control.Data))
		}
		return stream.writeAgentFrame(agentFrameInput, []byte(control.Data))
	case "resize", "theme":
		return stream.writeAgentFrame(agentFrameResize, message.Control)
	case "input_lock":
		return stream.writeAgentFrame(agentFrameLock, message.Control)
	case "queue-turn-ack":
		return stream.acknowledgeTurn(control.Data)
	default:
		return fmt.Errorf("unsupported queue pane control type: %s", control.Type)
	}
}

func (b *terminalQueueBroker) writePaneError(paneID, streamID string, generation uint64, err error) {
	if b.writeMessage == nil {
		return
	}
	payload, _ := json.Marshal(agentConnectionErrorPayload(err))
	data, marshalErr := json.Marshal(terminalQueueServerMessage{
		Type:              "pane-control",
		ProtocolVersion:   terminalQueueProtocolVersion,
		PaneID:            strings.TrimSpace(paneID),
		StreamID:          strings.TrimSpace(streamID),
		ChannelGeneration: generation,
		Payload:           payload,
	})
	if marshalErr == nil {
		_ = b.writeMessage(websocket.TextMessage, data)
	}
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
		_ = writeAgentFrame(s.stdin, agentFrameDetach, nil)
		_ = s.stdin.Close()
	}
	s.stdinMu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	if s.command == nil || s.exited == nil {
		return
	}
	go func() {
		select {
		case <-s.exited:
		case <-time.After(2 * time.Second):
			_ = killCommand(s.command)
		}
	}()
}

func (s *terminalQueuePaneStream) writeAgentFrame(frameType byte, payload []byte) error {
	s.stopMu.Lock()
	defer s.stopMu.Unlock()
	if s.stopped {
		return errors.New("queue pane stream is closed")
	}
	s.stdinMu.Lock()
	defer s.stdinMu.Unlock()
	return writeAgentFrame(s.stdin, frameType, payload)
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
		frameType, payload, err := readAgentFrame(s.stdout)
		if err != nil {
			if s.isStopped() || errors.Is(err, context.Canceled) {
				return
			}
			text := strings.TrimSpace(s.stderr.String())
			if text != "" {
				if isPaneNotFoundAttachError(text) {
					s.enqueueControl(map[string]any{
						"type":     "workspace-refresh-required",
						"selector": s.broker.scope.Selector,
						"reason":   text,
					})
				} else if !s.hasTerminalControl() {
					s.enqueueControl(agentConnectionErrorPayload(errors.New(text)))
				}
			} else if !s.hasTerminalControl() {
				s.enqueueControl(agentConnectionErrorPayload(err))
			}
			return
		}
		switch frameType {
		case agentFrameBinary:
			s.enqueueBinary(payload)
		case agentFrameText:
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
	if err := json.Unmarshal(payload, &message); err == nil {
		typeName := strings.TrimSpace(fmt.Sprint(message["type"]))
		s.mu.Lock()
		switch typeName {
		case "history-replay-start":
			if cursor, err := strconv.ParseUint(strings.TrimSpace(fmt.Sprint(message["delta_from_cursor"])), 10, 64); err == nil {
				s.cursor = cursor
				s.hasCursor = true
			}
		case "history-replay-complete":
			if cursor, err := strconv.ParseUint(strings.TrimSpace(fmt.Sprint(message["history_cursor"])), 10, 64); err != nil || !s.hasCursor || cursor != s.cursor {
				s.mu.Unlock()
				s.overload("queue history cursor is not continuous")
				return
			}
		case "process-exit", "workspace-refresh-required":
			s.terminalControl = true
		}
		s.mu.Unlock()
	}
	s.enqueue(terminalQueueOutbound{messageType: websocket.TextMessage, payload: append([]byte(nil), payload...), byteCost: len(payload)})
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

func (s *terminalQueuePaneStream) markTurnAwaitingAck(cursor, sequence uint64) {
	if s.subscription.FlowControl != "turn-ack-v1" {
		return
	}
	s.mu.Lock()
	if s.active && !s.overloaded {
		s.awaitingTurnAck = true
		s.turnAckCursor = cursor
		s.turnAckSequence = sequence
	}
	s.mu.Unlock()
}

func (s *terminalQueuePaneStream) targetSequence() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.active || s.awaitingTurnAck || len(s.buffer) == 0 {
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
	if alreadyWritten > 0 && entry.byteCost > 0 && alreadyWritten+entry.byteCost > terminalQueueRoundByteBudget {
		return terminalQueueOutbound{}, false
	}
	s.buffer[0] = terminalQueueOutbound{}
	s.buffer = s.buffer[1:]
	s.bufferBytes -= entry.byteCost
	if s.bufferBytes < 0 {
		s.bufferBytes = 0
	}
	return entry, true
}
