package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type terminalQueueTestWriteCloser struct {
	*bytes.Buffer
}

func (writer terminalQueueTestWriteCloser) Close() error { return nil }

func TestTerminalQueueBinaryFrameCarriesLogicalStreamAndCursor(t *testing.T) {
	header := terminalQueueBinaryHeader{
		ProtocolVersion:   terminalQueueProtocolVersion,
		PaneID:            "pane-3",
		StreamID:          "stream-7",
		ChannelGeneration: 12,
		StartCursor:       "40",
		EndCursor:         "45",
	}
	frame, err := encodeTerminalQueueBinaryFrame(header, []byte("hello"))
	if err != nil {
		t.Fatalf("encodeTerminalQueueBinaryFrame() error = %v", err)
	}
	if string(frame[:4]) != terminalQueueBinaryMagic {
		t.Fatalf("binary magic = %q", frame[:4])
	}
	headerSize := int(binary.BigEndian.Uint32(frame[4:8]))
	var decoded terminalQueueBinaryHeader
	if err := json.Unmarshal(frame[8:8+headerSize], &decoded); err != nil {
		t.Fatalf("decode queue header: %v", err)
	}
	if !reflect.DeepEqual(decoded, header) {
		t.Fatalf("decoded header = %+v, want %+v", decoded, header)
	}
	if got := string(frame[8+headerSize:]); got != "hello" {
		t.Fatalf("binary payload = %q", got)
	}
}

func TestTerminalQueueBinaryFrameAddsSequenceAndChecksum(t *testing.T) {
	header := terminalQueueBinaryHeader{
		ProtocolVersion:   terminalQueueProtocolVersion,
		PaneID:            "pane-1",
		StreamID:          "stream-1",
		ChannelGeneration: 1,
		StartCursor:       "7",
		EndCursor:         "12",
		Sequence:          4,
		Checksum:          terminalPayloadChecksum([]byte("hello")),
		HistoryGeneration: "history-2",
	}
	payload := []byte("hello")
	frame, err := encodeTerminalQueueBinaryFrame(header, payload)
	if err != nil {
		t.Fatalf("encodeTerminalQueueBinaryFrame() error = %v", err)
	}
	headerSize := int(binary.BigEndian.Uint32(frame[4:8]))
	var decoded terminalQueueBinaryHeader
	if err := json.Unmarshal(frame[8:8+headerSize], &decoded); err != nil {
		t.Fatalf("decode queue header: %v", err)
	}
	if decoded.Sequence != 4 || decoded.HistoryGeneration != "history-2" {
		t.Fatalf("decoded sequencing metadata = %+v", decoded)
	}
	if decoded.Checksum != terminalPayloadChecksum(payload) {
		t.Fatalf("checksum = %q, want %q", decoded.Checksum, terminalPayloadChecksum(payload))
	}
}

func TestTerminalQueueWebSocketRequiresAccountHeader(t *testing.T) {
	server := &pluginServer{}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/ws?mode=queue&name=demo@owner", nil)
	server.handleWebSocket(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("queue websocket status = %d, want 401", recorder.Code)
	}
}

func TestTerminalQueueWebSocketRejectsClientTargets(t *testing.T) {
	server := &pluginServer{}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/ws?mode=queue&name=client:device-one", nil)
	request.Header.Set(lightOSUserIDHeader, "user-one")
	server.handleWebSocket(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("client queue websocket status = %d, want 400", recorder.Code)
	}
}

func TestValidateTerminalQueueSubscriptionRequiresCompleteCursorRange(t *testing.T) {
	base := terminalQueueSubscription{
		PaneID:            "pane-1",
		StreamID:          "stream-1",
		ChannelGeneration: 1,
	}
	if _, _, err := validateTerminalQueueSubscription(base); err != nil {
		t.Fatalf("minimal subscription rejected: %v", err)
	}
	incomplete := base
	incomplete.HistoryGeneration = "generation-1"
	if _, _, err := validateTerminalQueueSubscription(incomplete); err == nil {
		t.Fatal("expected incomplete history range to be rejected")
	}
	invalid := base
	invalid.HistoryGeneration = "generation-1"
	invalid.LocalBaseCursor = "20"
	invalid.LocalEndCursor = "10"
	if _, _, err := validateTerminalQueueSubscription(invalid); err == nil {
		t.Fatal("expected reversed history range to be rejected")
	}
	valid := base
	valid.HistoryGeneration = "generation-1"
	valid.LocalBaseCursor = "10"
	valid.LocalEndCursor = "20"
	_, syncRequest, err := validateTerminalQueueSubscription(valid)
	if err != nil {
		t.Fatalf("valid history range rejected: %v", err)
	}
	if !syncRequest.hasRange || syncRequest.localBase != 10 || syncRequest.localEnd != 20 {
		t.Fatalf("sync request = %+v", syncRequest)
	}
}

func TestTerminalQueueWriterUsesFixedRoundTargetAndVisitsOtherPanes(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var orderMu sync.Mutex
	var order []string
	var callbackErr error
	var first *terminalQueuePaneStream
	broker := newTerminalQueueBroker(ctx, agentScope{}, "", "queue", func(messageType int, payload []byte) error {
		if messageType != websocket.TextMessage {
			orderMu.Lock()
			callbackErr = fmt.Errorf("message type = %d, want text", messageType)
			orderMu.Unlock()
			return callbackErr
		}
		var message terminalQueueServerMessage
		if err := json.Unmarshal(payload, &message); err != nil {
			orderMu.Lock()
			callbackErr = fmt.Errorf("decode server message: %w", err)
			orderMu.Unlock()
			return callbackErr
		}
		orderMu.Lock()
		order = append(order, message.PaneID)
		if len(order) == 1 {
			first.enqueue(terminalQueueOutbound{messageType: websocket.TextMessage, payload: []byte(`{"type":"late"}`), byteCost: 1})
		}
		orderMu.Unlock()
		return nil
	})
	first = &terminalQueuePaneStream{
		broker:       broker,
		subscription: terminalQueueSubscription{PaneID: "pane-1", StreamID: "s1", ChannelGeneration: 1},
		order:        1,
		active:       true,
	}
	second := &terminalQueuePaneStream{
		broker:       broker,
		subscription: terminalQueueSubscription{PaneID: "pane-2", StreamID: "s2", ChannelGeneration: 1},
		order:        2,
		active:       true,
	}
	broker.streams[first.subscription.PaneID] = first
	broker.streams[second.subscription.PaneID] = second
	first.enqueue(terminalQueueOutbound{messageType: websocket.TextMessage, payload: []byte(`{"type":"first"}`), byteCost: 1})
	second.enqueue(terminalQueueOutbound{messageType: websocket.TextMessage, payload: []byte(`{"type":"second"}`), byteCost: 1})
	go broker.runWriter()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		orderMu.Lock()
		complete := len(order) >= 3 || callbackErr != nil
		orderMu.Unlock()
		if complete {
			break
		}
		time.Sleep(time.Millisecond)
	}
	broker.close()
	orderMu.Lock()
	gotOrder := append([]string(nil), order...)
	gotErr := callbackErr
	orderMu.Unlock()
	if gotErr != nil {
		t.Fatal(gotErr)
	}
	if !reflect.DeepEqual(gotOrder, []string{"pane-1", "pane-2", "pane-1"}) {
		t.Fatalf("writer order = %v, want fixed-target round robin", gotOrder)
	}
}

func TestTerminalQueueWriterEmitsOneRenderBoundaryAfterBinaryTurn(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var mu sync.Mutex
	var messageTypes []int
	var controlType string
	broker := newTerminalQueueBroker(ctx, agentScope{}, "", "queue", func(messageType int, payload []byte) error {
		mu.Lock()
		defer mu.Unlock()
		messageTypes = append(messageTypes, messageType)
		if messageType == websocket.TextMessage {
			var message terminalQueueServerMessage
			if err := json.Unmarshal(payload, &message); err != nil {
				return err
			}
			var control map[string]any
			if err := json.Unmarshal(message.Payload, &control); err != nil {
				return err
			}
			controlType = fmt.Sprint(control["type"])
		}
		return nil
	})
	stream := &terminalQueuePaneStream{
		broker:       broker,
		subscription: terminalQueueSubscription{PaneID: "pane-1", StreamID: "s1", ChannelGeneration: 1},
		order:        1,
		active:       true,
	}
	broker.streams["pane-1"] = stream
	stream.enqueue(terminalQueueOutbound{
		messageType: websocket.BinaryMessage,
		payload:     []byte("hello"),
		startCursor: 10,
		endCursor:   15,
		byteCost:    5,
	})
	go broker.runWriter()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		complete := len(messageTypes) >= 2
		mu.Unlock()
		if complete {
			break
		}
		time.Sleep(time.Millisecond)
	}
	broker.close()
	mu.Lock()
	gotTypes := append([]int(nil), messageTypes...)
	gotControl := controlType
	mu.Unlock()
	if !reflect.DeepEqual(gotTypes, []int{websocket.BinaryMessage, websocket.TextMessage}) {
		t.Fatalf("message types = %v, want binary plus turn boundary", gotTypes)
	}
	if gotControl != "queue-turn-complete" {
		t.Fatalf("turn control = %q, want queue-turn-complete", gotControl)
	}
}

func TestTerminalQueueTurnAckReleasesWriter(t *testing.T) {
	broker := newTerminalQueueBroker(context.Background(), agentScope{}, "", "queue", func(int, []byte) error { return nil })
	stream := &terminalQueuePaneStream{
		broker:          broker,
		subscription:    terminalQueueSubscription{PaneID: "pane-1", StreamID: "s1", ChannelGeneration: 1, FlowControl: "turn-ack-v1"},
		active:          true,
		awaitingTurnAck: true,
		turnAckCursor:   42,
		turnAckSequence: 7,
	}
	if err := stream.acknowledgeTurn("42:7"); err != nil {
		t.Fatalf("acknowledgeTurn() error = %v", err)
	}
	stream.mu.Lock()
	defer stream.mu.Unlock()
	if stream.awaitingTurnAck || stream.turnAckCursor != 0 || stream.turnAckSequence != 0 {
		t.Fatalf("turn ACK state was not cleared: awaiting=%v cursor=%d sequence=%d", stream.awaitingTurnAck, stream.turnAckCursor, stream.turnAckSequence)
	}
}

func TestTerminalQueueTurnAckRejectsStaleBoundary(t *testing.T) {
	broker := newTerminalQueueBroker(context.Background(), agentScope{}, "", "queue", func(int, []byte) error { return nil })
	stream := &terminalQueuePaneStream{
		broker:          broker,
		subscription:    terminalQueueSubscription{PaneID: "pane-1", StreamID: "s1", ChannelGeneration: 1, FlowControl: "turn-ack-v1"},
		active:          true,
		awaitingTurnAck: true,
		turnAckCursor:   42,
		turnAckSequence: 7,
	}
	if err := stream.acknowledgeTurn("41:7"); err == nil {
		t.Fatal("stale queue turn acknowledgement must be rejected")
	}
	stream.mu.Lock()
	defer stream.mu.Unlock()
	if !stream.awaitingTurnAck || stream.turnAckCursor != 42 || stream.turnAckSequence != 7 {
		t.Fatal("stale acknowledgement changed the pending turn boundary")
	}
}

func TestTerminalQueueWaitsAtHighWaterUntilWriterConsumes(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream := &terminalQueuePaneStream{
		ctx:    ctx,
		broker: &terminalQueueBroker{wake: make(chan struct{}, 1)},
		active: true,
	}
	stream.enqueue(terminalQueueOutbound{
		messageType: websocket.BinaryMessage,
		payload:     make([]byte, terminalQueuePaneBufferHighWater),
		startCursor: 0,
		endCursor:   terminalQueuePaneBufferHighWater,
		byteCost:    terminalQueuePaneBufferHighWater,
	})
	ready := make(chan bool, 1)
	go func() { ready <- stream.waitForBufferCapacity() }()
	select {
	case got := <-ready:
		if got {
			t.Fatal("stream reported capacity while at high water")
		}
	case <-time.After(20 * time.Millisecond):
	}
	stream.popThrough(1, 0)
	select {
	case got := <-ready:
		if !got {
			t.Fatal("stream did not resume after writer consumed the buffered turn")
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("stream remained paused after writer consumption")
	}
}

func TestTerminalQueueBinaryPayloadIsSplitIntoContinuousFrames(t *testing.T) {
	broker := &terminalQueueBroker{wake: make(chan struct{}, 1)}
	stream := &terminalQueuePaneStream{
		broker:       broker,
		active:       true,
		hasCursor:    true,
		cursor:       100,
		subscription: terminalQueueSubscription{PaneID: "pane-1", StreamID: "stream-1", ChannelGeneration: 1},
	}
	payload := bytes.Repeat([]byte{'x'}, terminalQueueBinaryPayloadMaxBytes*2+17)
	stream.enqueueBinary(payload)
	stream.mu.Lock()
	defer stream.mu.Unlock()
	if len(stream.buffer) != 3 {
		t.Fatalf("split frame count = %d, want 3", len(stream.buffer))
	}
	cursor := uint64(100)
	for index, entry := range stream.buffer {
		if entry.byteCost > terminalQueueBinaryPayloadMaxBytes {
			t.Fatalf("frame %d size = %d, exceeds %d", index, entry.byteCost, terminalQueueBinaryPayloadMaxBytes)
		}
		if entry.startCursor != cursor || entry.endCursor-entry.startCursor != uint64(entry.byteCost) {
			t.Fatalf("frame %d range = %d-%d, want start %d and length %d", index, entry.startCursor, entry.endCursor, cursor, entry.byteCost)
		}
		if entry.binarySequence != uint64(index+1) {
			t.Fatalf("frame %d sequence = %d, want %d", index, entry.binarySequence, index+1)
		}
		cursor = entry.endCursor
	}
	if cursor != 100+uint64(len(payload)) {
		t.Fatalf("final cursor = %d, want %d", cursor, 100+uint64(len(payload)))
	}
}

func TestTerminalQueueBinarySequenceIgnoresInterleavedControlFrames(t *testing.T) {
	stream := &terminalQueuePaneStream{
		broker: &terminalQueueBroker{wake: make(chan struct{}, 1)},
		active: true,
	}
	stream.enqueueText([]byte(`{"type":"history-replay-start","delta_from_cursor":"0"}`))
	stream.enqueueBinary([]byte("one"))
	stream.enqueueText([]byte(`{"type":"queue-turn-complete"}`))
	stream.enqueueBinary([]byte("two"))

	stream.mu.Lock()
	defer stream.mu.Unlock()
	if stream.overloaded {
		t.Fatal("interleaved control frame unexpectedly overloaded stream")
	}
	if len(stream.buffer) != 4 {
		t.Fatalf("buffer length = %d, want 4", len(stream.buffer))
	}
	if stream.buffer[1].binarySequence != 1 || stream.buffer[3].binarySequence != 2 {
		t.Fatalf("binary sequences = %d, %d, want 1, 2", stream.buffer[1].binarySequence, stream.buffer[3].binarySequence)
	}
}

func TestTerminalQueueRejectsOrdinaryInput(t *testing.T) {
	broker := newTerminalQueueBroker(context.Background(), agentScope{}, "", "queue", func(int, []byte) error { return nil })
	stream := &terminalQueuePaneStream{
		broker:       broker,
		subscription: terminalQueueSubscription{PaneID: "pane-1", StreamID: "s1", ChannelGeneration: 1},
		active:       true,
	}
	broker.streams["pane-1"] = stream
	control, _ := json.Marshal(terminalControlMessage{Type: "input", Data: "pwd\n"})
	err := broker.handlePaneControl(terminalQueueClientMessage{
		Type:              "pane-control",
		PaneID:            "pane-1",
		StreamID:          "s1",
		ChannelGeneration: 1,
		Control:           control,
	})
	if err == nil {
		t.Fatal("ordinary queue input must be rejected")
	}
}

func TestTerminalUnifiedTransportAllowsOrdinaryInputAcrossMultipleStreams(t *testing.T) {
	broker := newTerminalQueueBroker(context.Background(), agentScope{}, "", "unified", func(int, []byte) error { return nil })
	for _, paneID := range []string{"pane-1", "pane-2", "pane-3"} {
		var stdin bytes.Buffer
		stream := &terminalQueuePaneStream{
			broker:       broker,
			subscription: terminalQueueSubscription{PaneID: paneID, StreamID: "stream-" + paneID, ChannelGeneration: 1},
			stdin:        terminalQueueTestWriteCloser{Buffer: &stdin},
			active:       true,
		}
		broker.streams[paneID] = stream
		control, _ := json.Marshal(terminalControlMessage{Type: "input", Data: paneID + "\n"})
		err := broker.handlePaneControl(terminalQueueClientMessage{
			Type:              "pane-control",
			PaneID:            paneID,
			StreamID:          "stream-" + paneID,
			ChannelGeneration: 1,
			Control:           control,
		})
		if err != nil {
			t.Fatalf("ordinary unified input for %s rejected: %v", paneID, err)
		}
		if stdin.Len() == 0 {
			t.Fatalf("ordinary unified input for %s was not forwarded", paneID)
		}
	}
	if broker.maxSubscriptions != terminalQueueMaxSubscriptions || !broker.allowOrdinaryInput {
		t.Fatalf("unified broker policy = max %d, ordinary=%v", broker.maxSubscriptions, broker.allowOrdinaryInput)
	}
}

func TestTerminalUnifiedPriorityOrdersActivePaneWithoutRemovingOthers(t *testing.T) {
	broker := newTerminalQueueBroker(context.Background(), agentScope{}, "", "unified", func(int, []byte) error { return nil })
	for index, paneID := range []string{"pane-1", "pane-2", "pane-3"} {
		broker.streams[paneID] = &terminalQueuePaneStream{
			broker:       broker,
			subscription: terminalQueueSubscription{PaneID: paneID, StreamID: "stream-" + paneID, ChannelGeneration: 1},
			active:       true,
			priority:     2,
			order:        uint64(index + 1),
		}
	}
	message := terminalQueueClientMessage{
		PaneID:            "pane-3",
		StreamID:          "stream-pane-3",
		ChannelGeneration: 1,
		Priority:          0,
	}
	if err := broker.setPriority(message); err != nil {
		t.Fatalf("setPriority() error = %v", err)
	}
	ordered := broker.streamSnapshot()
	if len(ordered) != 3 || ordered[0].subscription.PaneID != "pane-3" {
		t.Fatalf("priority order = %v", []string{ordered[0].subscription.PaneID, ordered[1].subscription.PaneID, ordered[2].subscription.PaneID})
	}
}

func TestTerminalFastTransportAllowsOneOrdinaryInputStream(t *testing.T) {
	broker := newTerminalQueueBroker(context.Background(), agentScope{}, "", "fast", func(int, []byte) error { return nil })
	var stdin bytes.Buffer
	stream := &terminalQueuePaneStream{
		broker:       broker,
		subscription: terminalQueueSubscription{PaneID: "pane-1", StreamID: "s1", ChannelGeneration: 1},
		stdin:        terminalQueueTestWriteCloser{Buffer: &stdin},
		active:       true,
	}
	broker.streams["pane-1"] = stream
	control, _ := json.Marshal(terminalControlMessage{Type: "input", Data: "pwd\n"})
	err := broker.handlePaneControl(terminalQueueClientMessage{
		Type:              "pane-control",
		PaneID:            "pane-1",
		StreamID:          "s1",
		ChannelGeneration: 1,
		Control:           control,
	})
	if err != nil {
		t.Fatalf("ordinary fast input rejected: %v", err)
	}
	if stdin.Len() == 0 {
		t.Fatal("ordinary fast input was not forwarded to the agent")
	}
	if broker.maxSubscriptions != 1 || !broker.allowOrdinaryInput {
		t.Fatalf("fast broker policy = max %d, ordinary=%v", broker.maxSubscriptions, broker.allowOrdinaryInput)
	}
}

func TestTerminalQueueStreamAcceptsContinuousReplayCursor(t *testing.T) {
	stream := &terminalQueuePaneStream{
		broker: &terminalQueueBroker{wake: make(chan struct{}, 1)},
		active: true,
	}
	stream.enqueueText([]byte(`{"type":"history-replay-start","delta_from_cursor":"10"}`))
	stream.enqueueBinary([]byte("hello"))
	stream.enqueueText([]byte(`{"type":"history-replay-complete","history_cursor":"15"}`))

	stream.mu.Lock()
	defer stream.mu.Unlock()
	if stream.overloaded {
		t.Fatal("continuous replay cursor unexpectedly requested resynchronization")
	}
	if !stream.hasCursor || stream.cursor != 15 {
		t.Fatalf("stream cursor = %d, hasCursor=%v, want 15/true", stream.cursor, stream.hasCursor)
	}
	if len(stream.buffer) != 3 {
		t.Fatalf("buffer length = %d, want replay start, binary, and completion", len(stream.buffer))
	}
	if stream.buffer[1].startCursor != 10 || stream.buffer[1].endCursor != 15 {
		t.Fatalf("binary cursor range = %d..%d, want 10..15", stream.buffer[1].startCursor, stream.buffer[1].endCursor)
	}
}

func TestTerminalQueueStreamRequestsResyncForWrongReplayCompletionCursor(t *testing.T) {
	stream := &terminalQueuePaneStream{
		broker: &terminalQueueBroker{wake: make(chan struct{}, 1)},
		active: true,
	}
	stream.enqueueText([]byte(`{"type":"history-replay-start","delta_from_cursor":"10"}`))
	stream.enqueueBinary([]byte("hi"))
	stream.enqueueText([]byte(`{"type":"history-replay-complete","history_cursor":"13"}`))

	stream.mu.Lock()
	defer stream.mu.Unlock()
	if !stream.overloaded {
		t.Fatal("wrong replay completion cursor must request resynchronization")
	}
	if len(stream.buffer) != 1 {
		t.Fatalf("buffer length = %d, want only resync error", len(stream.buffer))
	}
	var payload map[string]any
	if err := json.Unmarshal(stream.buffer[0].payload, &payload); err != nil {
		t.Fatalf("decode resync payload: %v", err)
	}
	if payload["type"] != "connection-error" || payload["resync_required"] != true {
		t.Fatalf("resync payload = %#v", payload)
	}
}
