package serverlog

import (
	"bytes"
	"fmt"
	"io"
	"lcmd-webshell/core"
	"log"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	serverLogHistoryLimit     = 512
	serverLogMessageLimit     = 8 << 10
	serverLogSubscriberBuffer = 128
)

type serverLogEvent struct {
	Sequence uint64 `json:"server_log_seq"`
	UnixMS   int64  `json:"server_unix_ms"`
	Level    string `json:"level"`
	Source   string `json:"source,omitempty"`
	Message  string `json:"message"`
}

type serverLogHub struct {
	output io.Writer

	mu          sync.Mutex
	sequence    uint64
	history     []serverLogEvent
	nextClient  uint64
	subscribers map[uint64]chan serverLogEvent
}

var processServerLogHub = newServerLogHub(os.Stderr)

func init() {
	// Keep the normal server log destination while making the same records
	// available to an explicitly enabled diagnostic WebSocket subscription.
	log.SetOutput(processServerLogHub)
}

func newServerLogHub(output io.Writer) *serverLogHub {
	if output == nil {
		output = io.Discard
	}
	return &serverLogHub{
		output:      output,
		history:     make([]serverLogEvent, 0, serverLogHistoryLimit),
		subscribers: make(map[uint64]chan serverLogEvent),
	}
}

func (h *serverLogHub) Write(data []byte) (int, error) {
	if h == nil {
		return len(data), nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.output != nil {
		_, _ = h.output.Write(data)
	}
	h.appendTextLocked("go", string(data))
	return len(data), nil
}

func (h *serverLogHub) publish(source, message string) {
	if h == nil {
		return
	}
	h.mu.Lock()
	h.appendTextLocked(source, message)
	h.mu.Unlock()
}

func (h *serverLogHub) appendTextLocked(source, text string) {
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) > serverLogMessageLimit {
			line = line[:serverLogMessageLimit] + "..."
		}
		h.sequence++
		event := serverLogEvent{
			Sequence: h.sequence,
			UnixMS:   time.Now().UnixMilli(),
			Level:    classifyServerLogLevel(line),
			Source:   strings.TrimSpace(source),
			Message:  redactServerLog(line),
		}
		h.history = append(h.history, event)
		if len(h.history) > serverLogHistoryLimit {
			h.history = h.history[len(h.history)-serverLogHistoryLimit:]
		}
		for _, subscriber := range h.subscribers {
			select {
			case subscriber <- event:
			default:
				// Diagnostics must never make the request path wait for a browser.
			}
		}
	}
}

func (h *serverLogHub) subscribe(after uint64, sinceUnixMS int64) ([]serverLogEvent, <-chan serverLogEvent, func()) {
	if h == nil {
		return nil, nil, func() {}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.nextClient++
	clientID := h.nextClient
	channel := make(chan serverLogEvent, serverLogSubscriberBuffer)
	h.subscribers[clientID] = channel
	history := make([]serverLogEvent, 0, len(h.history))
	for _, event := range h.history {
		if event.Sequence > after && (sinceUnixMS <= 0 || event.UnixMS >= sinceUnixMS) {
			history = append(history, event)
		}
	}
	return history, channel, func() {
		h.mu.Lock()
		if current, ok := h.subscribers[clientID]; ok {
			delete(h.subscribers, clientID)
			close(current)
		}
		h.mu.Unlock()
	}
}

func classifyServerLogLevel(message string) string {
	lower := strings.ToLower(message)
	if strings.Contains(lower, "fatal") || strings.Contains(lower, "panic") || strings.Contains(lower, "error") || strings.Contains(lower, "failed") {
		return "error"
	}
	if strings.Contains(lower, "warn") || strings.Contains(lower, "retry") {
		return "warn"
	}
	return "info"
}

var serverLogSensitiveValuePattern = regexp.MustCompile(`(?i)(authorization|token|cookie|password|credential)=([^ ]+)`)

func redactServerLog(message string) string {
	return serverLogSensitiveValuePattern.ReplaceAllString(message, "$1=[redacted]")
}

type Writer struct {
	hub     *serverLogHub
	source  string
	mu      sync.Mutex
	pending []byte
}

func (w *Writer) Write(data []byte) (int, error) {
	if w == nil || w.hub == nil {
		return len(data), nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.pending = append(w.pending, data...)
	for {
		index := bytes.IndexByte(w.pending, '\n')
		if index < 0 {
			break
		}
		w.hub.publish(w.source, string(w.pending[:index]))
		w.pending = w.pending[index+1:]
	}
	if len(w.pending) > serverLogMessageLimit {
		w.hub.publish(w.source, string(w.pending[:serverLogMessageLimit]))
		w.pending = w.pending[serverLogMessageLimit:]
	}
	return len(data), nil
}

func (w *Writer) Flush() {
	if w == nil || w.hub == nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(bytes.TrimSpace(w.pending)) > 0 {
		w.hub.publish(w.source, string(w.pending))
	}
	w.pending = nil
}

func Enabled(query string) bool {
	return strings.EqualFold(strings.TrimSpace(query), "1") || strings.EqualFold(strings.TrimSpace(query), "true")
}

func StartForwarder(writeJSON func(any) error, after uint64, sinceUnixMS int64) func() {
	history, events, unsubscribe := processServerLogHub.subscribe(after, sinceUnixMS)
	stopped := make(chan struct{})
	var stopOnce sync.Once
	stop := func() {
		stopOnce.Do(func() {
			unsubscribe()
			close(stopped)
		})
	}
	for _, event := range history {
		if err := writeJSON(serverLogEventMessage(event)); err != nil {
			stop()
			return func() {}
		}
	}
	go func() {
		for {
			select {
			case <-stopped:
				return
			case event, ok := <-events:
				if !ok {
					return
				}
				if writeJSON(serverLogEventMessage(event)) != nil {
					stop()
					return
				}
			}
		}
	}()
	return stop
}

func serverLogEventMessage(event serverLogEvent) map[string]any {
	return map[string]any{
		"type":             "server-log",
		"protocol_version": core.TerminalQueueProtocolVersion,
		"server_log_seq":   event.Sequence,
		"server_unix_ms":   event.UnixMS,
		"level":            event.Level,
		"source":           event.Source,
		"message":          event.Message,
	}
}

func ParseSince(value string) int64 {
	var since int64
	_, _ = fmt.Sscanf(strings.TrimSpace(value), "%d", &since)
	return since
}

func ParseAfter(value string) uint64 {
	var after uint64
	_, _ = fmt.Sscanf(strings.TrimSpace(value), "%d", &after)
	return after
}
