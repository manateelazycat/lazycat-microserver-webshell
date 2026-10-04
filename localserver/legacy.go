package localserver

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"
	"lcmd-webshell/core"
)

// Keep the existing MCP single-pane endpoint. Browser workspaces use Unified;
// this is only a wire adapter over the same Core session, not another runtime.
func (s *Server) legacyPane(w http.ResponseWriter, r *http.Request) {
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
	q := r.URL.Query()
	stream, err := s.local.Open(ctx, core.NormalizeAgentScope("client:"+s.config.InstanceID, s.config.AccountID),
		q.Get("pane"), core.ParsePositiveInt(q.Get("cols")), core.ParsePositiveInt(q.Get("rows")),
		core.ParsePositiveInt(q.Get("terminal_scrollback")), core.HistorySyncRequest{WorkspaceGeneration: q.Get("workspace_generation")}, nil)
	if err != nil {
		return
	}
	defer stream.Kill()
	conn.SetReadLimit(core.WebsocketReadLimit)
	go func() {
		defer conn.Close()
		for {
			kind, data, err := core.ReadAgentFrame(stream.Output)
			if err != nil {
				return
			}
			messageType := websocket.BinaryMessage
			if kind == core.AgentFrameText {
				messageType = websocket.TextMessage
			}
			if conn.WriteMessage(messageType, data) != nil {
				return
			}
		}
	}()
	for {
		kind, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if kind == websocket.BinaryMessage {
			if core.WriteAgentFrame(stream.Input, core.AgentFrameInput, data) != nil {
				return
			}
			continue
		}
		var message core.TerminalControlMessage
		if json.Unmarshal(data, &message) != nil {
			continue
		}
		frame := core.AgentFrameResize
		if message.Type == "input" {
			frame = core.AgentFrameInput
			if message.Generated {
				frame = core.AgentFrameGeneratedInput
			}
			data = []byte(message.Data)
		}
		if core.WriteAgentFrame(stream.Input, frame, data) != nil {
			return
		}
	}
}
