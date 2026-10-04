package core

import (
	"crypto/sha256"
	"encoding/json"
	"log"
	"sync"
	"time"
)

var checkpointLogDedup = struct {
	sync.Mutex
	seen map[[32]byte]time.Time
}{seen: make(map[[32]byte]time.Time)}

// LogCheckpointDiagnostic copies a bounded first-failure report into the
// receiving process's log. The daemon and each relay share this implementation;
// wire data, recovery decisions and per-pane locks are not changed by logging.
func LogCheckpointDiagnostic(scope AgentScope, paneID string, payload []byte) {
	if len(payload) > 128<<10 {
		return
	}
	var message struct {
		Type       string                     `json:"type"`
		Checkpoint map[string]json.RawMessage `json:"checkpoint_diagnostics"`
	}
	if json.Unmarshal(payload, &message) != nil {
		return
	}
	switch message.Type {
	case "terminal-checkpoint-diagnostic", "terminal-checkpoint-error", "resize-applied":
	default:
		return
	}
	var failure string
	if json.Unmarshal(message.Checkpoint["error"], &failure) != nil || failure == "" {
		return
	}
	var first struct {
		At int64 `json:"at_unix_ms"`
	}
	_ = json.Unmarshal(message.Checkpoint["first_failure"], &first)
	identity, _ := json.Marshal([]any{scope.CacheKey(), paneID, first.At,
		string(message.Checkpoint["pane_created_unix_ms"]), string(message.Checkpoint["wasm_sha256"]), failure})
	key := sha256.Sum256(identity)
	now := time.Now()
	checkpointLogDedup.Lock()
	if _, exists := checkpointLogDedup.seen[key]; exists {
		checkpointLogDedup.Unlock()
		return
	}
	if len(checkpointLogDedup.seen) >= 512 {
		var oldest [32]byte
		var at time.Time
		for candidate, value := range checkpointLogDedup.seen {
			if at.IsZero() || value.Before(at) {
				oldest, at = candidate, value
			}
		}
		delete(checkpointLogDedup.seen, oldest)
	}
	checkpointLogDedup.seen[key] = now
	checkpointLogDedup.Unlock()
	report := map[string]any{"selector": scope.Selector, "pane_id": paneID, "kind": "terminal_checkpoint_failure"}
	for _, name := range []string{"agent_protocol", "wasm_sha256", "pane_created_unix_ms", "error", "fallback_mode",
		"first_failure", "memory_bytes", "memory_limit_bytes", "checkpoint_cols", "checkpoint_rows", "pane_cols", "pane_rows", "observed_unix_ms"} {
		if value := message.Checkpoint[name]; len(value) > 0 {
			report[name] = value
		}
	}
	if len(failure) > 8192 {
		report["error"] = failure[:8192] + " [truncated]"
	}
	data, err := json.Marshal(report)
	if err != nil {
		return
	}
	if len(data) > 64<<10 {
		delete(report, "first_failure")
		report["details_omitted"] = "first_failure_exceeds_log_limit"
		data, _ = json.Marshal(report)
	}
	if len(data) > 64<<10 {
		data, _ = json.Marshal(map[string]any{"selector": scope.Selector, "pane_id": paneID,
			"kind": "terminal_checkpoint_failure", "details_omitted": "diagnostic_exceeds_log_limit"})
	}
	log.Printf("terminal checkpoint diagnostic: %s", data)
}
