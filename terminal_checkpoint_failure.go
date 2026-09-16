package main

import (
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

var terminalCheckpointWASMDigest = checkpointHash(terminalCheckpointWASM)

func checkpointWASMHash() string { return terminalCheckpointWASMDigest }

type checkpointCallFailure struct {
	Operation       string `json:"operation"`
	InputBytes      int    `json:"input_bytes,omitempty"`
	ParserBytes     int    `json:"parser_bytes,omitempty"`
	InputSHA256     string `json:"input_sha256,omitempty"`
	MemoryBefore    uint32 `json:"memory_before"`
	MemoryAfter     uint32 `json:"memory_after"`
	Cols            int    `json:"requested_cols,omitempty"`
	Rows            int    `json:"requested_rows,omitempty"`
	ScrollbackLines int    `json:"requested_scrollback_lines,omitempty"`
}

// One immutable report per pane. Subsequent attach/resize observations must not
// replace the original failure time and range or count as fresh parser failures.
type checkpointFailure struct {
	AtUnixMS      int64                         `json:"at_unix_ms"`
	Operation     string                        `json:"operation"`
	Error         string                        `json:"error"`
	BatchFrom     string                        `json:"batch_from_cursor"`
	BatchTo       string                        `json:"batch_to_cursor"`
	HistoryBase   string                        `json:"history_base_cursor"`
	HistoryBytes  int                           `json:"history_bytes"`
	HistoryLimit  int                           `json:"history_limit_bytes"`
	Cols          int                           `json:"cols"`
	Rows          int                           `json:"rows"`
	PendingBefore int                           `json:"pending_bytes_before"`
	PendingAfter  int                           `json:"pending_bytes_after"`
	Call          *checkpointCallFailure        `json:"call,omitempty"`
	RecentResizes []checkpointResizeObservation `json:"recent_resizes,omitempty"`
}

func (p *terminalPane) resizeCheckpointLocked(cols, rows, lines int) {
	e := p.checkpoint
	if e == nil {
		return
	}
	pendingBefore := len(e.pending)
	e.resize(cols, rows, lines)
	p.recordCheckpointFailureLocked("resize", p.history.end, p.history.end, pendingBefore)
}

// Under pane.mu. The failed engine remains stopped; attach uses the existing
// bounded raw history instead. No healthy snapshots, replay journal or retries.
func (p *terminalPane) recordCheckpointFailureLocked(operation string, from, to uint64, pendingBefore int) {
	e := p.checkpoint
	if e == nil || e.err == nil || p.checkpointFailure != nil {
		return
	}
	p.checkpointFailure = &checkpointFailure{AtUnixMS: time.Now().UnixMilli(), Operation: operation,
		Error: boundedCheckpointError(e.err), BatchFrom: strconv.FormatUint(from, 10), BatchTo: strconv.FormatUint(to, 10),
		HistoryBase: strconv.FormatUint(p.history.base, 10), HistoryBytes: p.history.bytes, HistoryLimit: p.historyLimitBytes,
		Cols: e.cols, Rows: e.rows, PendingBefore: pendingBefore, PendingAfter: len(e.pending), Call: e.failedCall,
		RecentResizes: append([]checkpointResizeObservation(nil), e.resizeObservations...)}
	payload, err := json.Marshal(map[string]any{
		"type": "terminal-checkpoint-diagnostic", "selector": p.selector, "pane_id": p.id,
		"checkpoint_diagnostics": p.checkpointDiagnosticsLocked(),
	})
	if err != nil {
		return
	}
	log.Printf("terminal checkpoint diagnostic: %s", payload)
	for client := range p.clients {
		client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: payload})
	}
}

func boundedCheckpointError(err error) string {
	if err == nil {
		return ""
	}
	text := err.Error()
	if len(text) > 8192 {
		text = text[:8192] + " [truncated]"
	}
	return text
}
