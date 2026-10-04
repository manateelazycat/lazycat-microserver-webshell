package localserver

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"lcmd-webshell/core"
)

func (s *Server) queue(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet && r.URL.Query().Get("transport_role") == "" && r.URL.Query().Get("pane") != "" {
		s.legacyPane(w, r)
		return
	}
	if r.Method != http.MethodGet || r.URL.Query().Get("transport_role") != "unified" {
		http.Error(w, "client terminal requires unified transport", http.StatusBadRequest)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.sockets[conn] = struct{}{}
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.sockets, conn); s.mu.Unlock() }()
	ctx, cancel := context.WithCancel(s.ctx)
	defer cancel()
	conn.SetReadLimit(core.WebsocketReadLimit)
	var mu sync.Mutex
	write := func(kind int, data []byte) error {
		mu.Lock()
		defer mu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		return conn.WriteMessage(kind, data)
	}
	writeJSON := func(value any) error {
		data, err := json.Marshal(value)
		if err != nil {
			return err
		}
		return write(websocket.TextMessage, data)
	}
	scope := core.NormalizeAgentScope("client:"+s.config.InstanceID, s.config.AccountID)
	broker := core.NewTerminalQueueBroker(ctx, scope, "unified", write, s.local)
	go broker.RunWriter()
	defer broker.Close()
	// Match the container handshake: the shared frontend waits for queue-ready
	// before treating the service as ready and starting its health checks.
	if writeJSON(core.TerminalQueueServerMessage{Type: "queue-ready", ProtocolVersion: core.TerminalQueueProtocolVersion, State: "open", ServerUnixMS: time.Now().UnixMilli(),
		AgentProtocolVersion: core.AgentProtocolVersion, PreferredAgentProtocolVersion: core.AgentProtocolVersion}) != nil {
		return
	}
	s.setScrollback(core.ParsePositiveInt(r.URL.Query().Get("terminal_scrollback")))
	for {
		_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		kind, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if kind != websocket.TextMessage {
			continue
		}
		var msg core.TerminalQueueClientMessage
		if json.Unmarshal(data, &msg) != nil {
			_ = writeJSON(core.TerminalQueueServerMessage{Type: "queue-error", ProtocolVersion: core.TerminalQueueProtocolVersion, Message: "invalid queue control message"})
			continue
		}
		switch strings.TrimSpace(msg.Type) {
		case "replace-subscriptions":
			if msg.ProtocolVersion != core.TerminalQueueProtocolVersion {
				_ = writeJSON(core.TerminalQueueServerMessage{Type: "queue-error", ProtocolVersion: core.TerminalQueueProtocolVersion, Message: "unsupported queue protocol version"})
				continue
			}
			if err := broker.ReplaceSubscriptions(msg.Subscriptions, int(s.scrollback.Load())); err != nil {
				_ = writeJSON(core.TerminalQueueServerMessage{Type: "queue-error", ProtocolVersion: core.TerminalQueueProtocolVersion, Message: err.Error()})
			}
		case "pane-control", "pane-input":
			if msg.Type == "pane-input" {
				msg.Control, _ = json.Marshal(map[string]string{"type": "input", "data": msg.Data})
			}
			if err := broker.HandlePaneControl(msg); err != nil {
				broker.WritePaneError(msg.PaneID, msg.StreamID, msg.ChannelGeneration, err)
			}
		case "set-priority":
			if err := broker.SetPriority(msg); err != nil {
				broker.WritePaneError(msg.PaneID, msg.StreamID, msg.ChannelGeneration, err)
			}
		case "queue-ping":
			_ = writeJSON(core.TerminalQueueServerMessage{Type: "queue-pong", ProtocolVersion: core.TerminalQueueProtocolVersion})
		}
	}
}
