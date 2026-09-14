package main

import (
	"strconv"
	"time"
)

// Protected by terminalPane.mu, like the checkpoint itself.
type checkpointResizeObservation struct {
	AtUnixMS     int64   `json:"at_unix_ms"`
	FromCols     int     `json:"from_cols"`
	FromRows     int     `json:"from_rows"`
	ToCols       int     `json:"to_cols"`
	ToRows       int     `json:"to_rows"`
	MemoryBefore uint32  `json:"memory_before"`
	MemoryAfter  uint32  `json:"memory_after"`
	DurationMS   float64 `json:"duration_ms"`
	NativeError  string  `json:"native_error,omitempty"`
	Error        string  `json:"error,omitempty"`
}

func (e *terminalCheckpointEngine) memoryBytes() uint32 {
	if e == nil || e.module == nil || e.module.IsClosed() {
		return 0
	}
	return e.module.Memory().Size()
}

// Read static error text without allocating in a potentially exhausted WASM heap.
func (e *terminalCheckpointEngine) nativeResizeError() string {
	ptr, err := e.call("ghostty_terminal_resize_error_ptr")
	if err != nil {
		return "unavailable"
	}
	length, err := e.call("ghostty_terminal_resize_error_len")
	if err != nil || length > 256 {
		return "unavailable"
	}
	if length == 0 {
		return "unspecified_native_failure"
	}
	data, ok := e.module.Memory().Read(uint32(ptr), uint32(length))
	if !ok {
		return "unavailable"
	}
	return string(data)
}

func (p *terminalPane) checkpointDiagnostics() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	e := p.checkpoint
	if e == nil {
		return nil
	}
	result := map[string]any{
		"memory_measurement": "wasm_linear_memory_size",
		"memory_bytes":       e.memoryBytes(), "memory_limit_bytes": terminalCheckpointMaxMemory,
		"scrollback_capacity_bytes": e.capacity, "scrollback_lines": e.scrollback,
		"checkpoint_cols": e.cols, "checkpoint_rows": e.rows, "pane_cols": p.cols, "pane_rows": p.rows,
		"history_cursor": strconv.FormatUint(p.history.end, 10), "pending_bytes": len(e.pending),
		"skipped_resizes": e.skippedResizes, "observed_unix_ms": time.Now().UnixMilli(),
	}
	if n := len(e.resizeObservations); n > 0 {
		result["last_resize"] = e.resizeObservations[n-1]
	}
	if e.err != nil {
		result["error"] = e.err.Error()
		result["recent_resizes"] = append([]checkpointResizeObservation(nil), e.resizeObservations...)
	}
	return result
}
