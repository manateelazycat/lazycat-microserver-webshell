package core

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"io"
	"strconv"
	"strings"
)

type fastBinaryHeader struct {
	ProtocolVersion   int    `json:"protocol_version"`
	Selector          string `json:"selector"`
	PaneID            string `json:"pane_id"`
	HistoryGeneration string `json:"history_generation,omitempty"`
	Sequence          uint64 `json:"sequence"`
	StartCursor       string `json:"start_cursor"`
	EndCursor         string `json:"end_cursor"`
	Length            int    `json:"length"`
	Checksum          string `json:"checksum"`
}

const fastBinaryProtocolVersion = 1

func encodeFastBinaryFrame(selector, paneID, historyGeneration string, sequence, startCursor uint64, payload []byte) ([]byte, error) {
	endCursor := startCursor + uint64(len(payload))
	checksum := crc32.ChecksumIEEE(payload)
	var checksumBytes [4]byte
	binary.BigEndian.PutUint32(checksumBytes[:], checksum)
	header, err := json.Marshal(fastBinaryHeader{
		ProtocolVersion:   fastBinaryProtocolVersion,
		Selector:          selector,
		PaneID:            paneID,
		HistoryGeneration: historyGeneration,
		Sequence:          sequence,
		StartCursor:       strconv.FormatUint(startCursor, 10),
		EndCursor:         strconv.FormatUint(endCursor, 10),
		Length:            len(payload),
		Checksum:          hex.EncodeToString(checksumBytes[:]),
	})
	if err != nil {
		return nil, err
	}
	frame := make([]byte, 8+len(header)+len(payload))
	copy(frame[:4], []byte("LCF1"))
	binary.BigEndian.PutUint32(frame[4:8], uint32(len(header)))
	copy(frame[8:], header)
	copy(frame[8+len(header):], payload)
	return frame, nil
}

type AgentRequest struct {
	CheckpointProtocol  string                  `json:"checkpoint_protocol,omitempty"`
	Type                string                  `json:"type"`
	Selector            string                  `json:"selector,omitempty"`
	AccountID           string                  `json:"account_id,omitempty"`
	Username            string                  `json:"username,omitempty"`
	PaneID              string                  `json:"pane_id,omitempty"`
	Cols                int                     `json:"cols,omitempty"`
	Rows                int                     `json:"rows,omitempty"`
	TerminalScrollback  int                     `json:"terminal_scrollback,omitempty"`
	HistoryGeneration   string                  `json:"history_generation,omitempty"`
	WorkspaceGeneration string                  `json:"workspace_generation,omitempty"`
	LocalBaseCursor     string                  `json:"local_base_cursor,omitempty"`
	LocalEndCursor      string                  `json:"local_end_cursor,omitempty"`
	HistoryReplayMode   string                  `json:"history_replay_mode,omitempty"`
	IntegrityProtocol   string                  `json:"integrity_protocol,omitempty"`
	Action              *WorkspaceActionRequest `json:"action,omitempty"`
	CloseIdle           bool                    `json:"close_idle,omitempty"`
}

type AgentResponse struct {
	OK       bool                    `json:"ok"`
	Version  string                  `json:"version,omitempty"`
	Error    string                  `json:"error,omitempty"`
	State    *WorkspaceState         `json:"state,omitempty"`
	Activity *WorkspaceActivityState `json:"activity,omitempty"`
}

func writeAgentControlFrame(w io.Writer, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return WriteAgentFrame(w, AgentFrameText, data)
}

func WriteAgentFrame(w io.Writer, frameType byte, payload []byte) error {
	if len(payload) > agentMaxFramePayload {
		return fmt.Errorf("agent frame payload too large: %d", len(payload))
	}
	header := [5]byte{frameType}
	binary.BigEndian.PutUint32(header[1:], uint32(len(payload)))
	if _, err := w.Write(header[:]); err != nil {
		return err
	}
	if len(payload) == 0 {
		return nil
	}
	_, err := w.Write(payload)
	return err
}

func ReadAgentFrame(r io.Reader) (byte, []byte, error) {
	var header [5]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return 0, nil, err
	}
	size := int(binary.BigEndian.Uint32(header[1:]))
	if size < 0 || size > agentMaxFramePayload {
		return 0, nil, fmt.Errorf("agent frame payload too large: %d", size)
	}
	payload := make([]byte, size)
	if size > 0 {
		if _, err := io.ReadFull(r, payload); err != nil {
			return 0, nil, err
		}
	}
	return header[0], payload, nil
}

func bytesTrimSpace(data []byte) []byte {
	return []byte(strings.TrimSpace(string(data)))
}
