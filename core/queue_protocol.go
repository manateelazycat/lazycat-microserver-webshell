package core

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"hash/crc32"
	"strconv"
	"strings"
	"time"
)

const (
	TerminalQueueProtocolVersion       = 1
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
	CheckpointProtocol     string                              `json:"checkpoint_protocol,omitempty"`
	PaneID                 string                              `json:"pane_id"`
	StreamID               string                              `json:"stream_id"`
	ChannelGeneration      uint64                              `json:"channel_generation"`
	Cols                   int                                 `json:"cols,omitempty"`
	Rows                   int                                 `json:"rows,omitempty"`
	PixelWidth             int                                 `json:"pixel_width,omitempty"`
	PixelHeight            int                                 `json:"pixel_height,omitempty"`
	WorkspaceGeneration    string                              `json:"workspace_generation,omitempty"`
	HistoryGeneration      string                              `json:"history_generation,omitempty"`
	LocalBaseCursor        string                              `json:"local_base_cursor,omitempty"`
	LocalEndCursor         string                              `json:"local_end_cursor,omitempty"`
	HistoryReplayMode      string                              `json:"history_replay_mode,omitempty"`
	FlowControl            string                              `json:"flow_control,omitempty"`
	ReplayBurstLimitBytes  int                                 `json:"replay_burst_limit_bytes,omitempty"`
	CheckpointCapabilities []terminalQueueCheckpointCapability `json:"checkpoint_capabilities,omitempty"`
	Priority               int                                 `json:"priority,omitempty"`
	Foreground             string                              `json:"foreground,omitempty"`
	Background             string                              `json:"background,omitempty"`
	Cursor                 string                              `json:"cursor,omitempty"`
}

type TerminalQueueClientMessage struct {
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

type TerminalQueueServerMessage struct {
	Type                            string          `json:"type"`
	ProtocolVersion                 int             `json:"protocol_version"`
	PaneID                          string          `json:"pane_id,omitempty"`
	StreamID                        string          `json:"stream_id,omitempty"`
	ChannelGeneration               uint64          `json:"channel_generation,omitempty"`
	State                           string          `json:"state,omitempty"`
	ServerUnixMS                    int64           `json:"server_unix_ms,omitempty"`
	ServerPrepareDurationMS         int64           `json:"server_prepare_duration_ms,omitempty"`
	ServerAgentEnsureDurationMS     int64           `json:"server_agent_ensure_duration_ms,omitempty"`
	ServerAgentValidationDurationMS int64           `json:"server_agent_validation_duration_ms,omitempty"`
	AgentProtocolVersion            string          `json:"agent_protocol_version,omitempty"`
	PreferredAgentProtocolVersion   string          `json:"preferred_agent_protocol_version,omitempty"`
	AgentProtocolUpdateAvailable    bool            `json:"agent_protocol_update_available,omitempty"`
	AgentProtocolUpdateRequired     bool            `json:"agent_protocol_update_required,omitempty"`
	Message                         string          `json:"message,omitempty"`
	Payload                         json.RawMessage `json:"payload,omitempty"`
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

func validateTerminalQueueSubscription(subscription terminalQueueSubscription) (terminalQueueSubscription, HistorySyncRequest, error) {
	if len(subscription.Foreground) > 64 || len(subscription.Background) > 64 || len(subscription.Cursor) > 64 {
		return subscription, HistorySyncRequest{}, errors.New("invalid terminal theme")
	}
	subscription.PaneID = strings.TrimSpace(subscription.PaneID)
	subscription.StreamID = strings.TrimSpace(subscription.StreamID)
	subscription.WorkspaceGeneration = strings.TrimSpace(subscription.WorkspaceGeneration)
	subscription.HistoryGeneration = strings.TrimSpace(subscription.HistoryGeneration)
	subscription.HistoryReplayMode = strings.TrimSpace(subscription.HistoryReplayMode)
	subscription.FlowControl = strings.TrimSpace(subscription.FlowControl)
	if subscription.CheckpointProtocol != "" && subscription.CheckpointProtocol != TerminalMemoryCheckpointProtocol {
		return subscription, HistorySyncRequest{}, errors.New("unsupported terminal checkpoint protocol")
	}
	if subscription.FlowControl != "" && subscription.FlowControl != "turn-ack-v1" && subscription.FlowControl != terminalQueueWindowProtocol {
		return subscription, HistorySyncRequest{}, errors.New("unsupported queue flow control")
	}
	if subscription.PaneID == "" || len(subscription.PaneID) > 128 {
		return subscription, HistorySyncRequest{}, errors.New("invalid queue pane id")
	}
	if subscription.StreamID == "" || len(subscription.StreamID) > 128 {
		return subscription, HistorySyncRequest{}, errors.New("invalid queue stream id")
	}
	if subscription.ChannelGeneration == 0 {
		return subscription, HistorySyncRequest{}, errors.New("invalid queue channel generation")
	}
	if len(subscription.WorkspaceGeneration) > 128 || len(subscription.HistoryGeneration) > 128 {
		return subscription, HistorySyncRequest{}, errors.New("invalid queue history identity")
	}
	syncRequest := HistorySyncRequest{
		WorkspaceGeneration: subscription.WorkspaceGeneration,
		Generation:          subscription.HistoryGeneration,
		ForceSnapshot:       subscription.HistoryReplayMode == "snapshot",
	}
	baseText := strings.TrimSpace(subscription.LocalBaseCursor)
	endText := strings.TrimSpace(subscription.LocalEndCursor)
	if subscription.HistoryGeneration != "" || baseText != "" || endText != "" {
		if subscription.HistoryGeneration == "" || baseText == "" || endText == "" {
			return subscription, HistorySyncRequest{}, errors.New("incomplete queue history range")
		}
		base, baseErr := strconv.ParseUint(baseText, 10, 64)
		end, endErr := strconv.ParseUint(endText, 10, 64)
		if baseErr != nil || endErr != nil || base > end {
			return subscription, HistorySyncRequest{}, errors.New("invalid queue history range")
		}
		syncRequest.LocalBase = base
		syncRequest.LocalEnd = end
		syncRequest.HasRange = true
	}
	return subscription, syncRequest, nil
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
