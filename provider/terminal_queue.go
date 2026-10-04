package provider

import (
	"context"
	"encoding/json"
	"github.com/gorilla/websocket"
	"net/http"
	"strings"
	"sync"
	"time"
)

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
		if r.URL.Query().Get("transport_role") != "unified" {
			http.Error(w, "client terminal requires unified transport", http.StatusBadRequest)
			return nil
		}
		return s.attachClientPane(w, r, accountID, selector, "", 0, 0, s.currentTerminalScrollback())
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
	queueAcceptedAt := time.Now()
	defer conn.Close()
	conn.EnableWriteCompression(false)
	conn.SetReadLimit(WebsocketReadLimit)

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

	var stopServerLogs func()
	if Enabled(r.URL.Query().Get("server_logs")) {
		stopServerLogs = StartForwarder(writeJSON, ParseAfter(r.URL.Query().Get("server_log_after")), ParseSince(r.URL.Query().Get("server_log_since_ms")))
		defer stopServerLogs()
	}

	_ = writeJSON(TerminalQueueServerMessage{
		Type:            "queue-state",
		ProtocolVersion: TerminalQueueProtocolVersion,
		State:           "agent-preparing",
		ServerUnixMS:    queueAcceptedAt.UnixMilli(),
	})

	scope := NormalizeAgentScope(selector, accountID)
	agentEnsureStartedAt := time.Now()
	_, ensureErr := ensurePersistentAgent(r.Context(), scope)
	agentEnsureFinishedAt := time.Now()
	agentProtocolCurrent := unsupportedAgentProtocolVersion(ensureErr)
	agentProtocolUpdateRequired := agentProtocolCurrent != ""
	if ensureErr != nil && !agentProtocolUpdateRequired {
		payload, _ := json.Marshal(AgentConnectionErrorPayload(ensureErr))
		_ = writeJSON(TerminalQueueServerMessage{
			Type:            "queue-error",
			ProtocolVersion: TerminalQueueProtocolVersion,
			Message:         ensureErr.Error(),
			Payload:         payload,
		})
		return nil
	}
	agentValidationStartedAt := agentEnsureFinishedAt
	if !agentProtocolUpdateRequired {
		response, validationErr := pingPersistentAgentResponse(r.Context(), scope)
		if validationErr == nil {
			agentProtocolCurrent = strings.TrimSpace(response.Version)
		} else if version := unsupportedAgentProtocolVersion(validationErr); version != "" {
			agentProtocolCurrent = version
			agentProtocolUpdateRequired = true
		} else {
			markPersistentAgentNotRunning(scope)
			_, retryErr := ensurePersistentAgent(r.Context(), scope)
			if retryErr != nil {
				payload, _ := json.Marshal(AgentConnectionErrorPayload(retryErr))
				_ = writeJSON(TerminalQueueServerMessage{
					Type:            "queue-error",
					ProtocolVersion: TerminalQueueProtocolVersion,
					Message:         retryErr.Error(),
					Payload:         payload,
				})
				return nil
			}
			response, validationErr = pingPersistentAgentResponse(r.Context(), scope)
			if validationErr != nil {
				payload, _ := json.Marshal(AgentConnectionErrorPayload(validationErr))
				_ = writeJSON(TerminalQueueServerMessage{
					Type:            "queue-error",
					ProtocolVersion: TerminalQueueProtocolVersion,
					Message:         validationErr.Error(),
					Payload:         payload,
				})
				return nil
			}
			agentProtocolCurrent = strings.TrimSpace(response.Version)
		}
	}
	if agentProtocolCurrent == "" {
		agentProtocolCurrent = AgentProtocolVersion
	}
	agentProtocolUpdateAvailable, versionRequiresUpdate := agentProtocolUpdateState(agentProtocolCurrent)
	agentProtocolUpdateRequired = agentProtocolUpdateRequired || versionRequiresUpdate

	broker := NewTerminalQueueBroker(context.Background(), scope, transportRole, writeMessage, containerQueueBackend{})
	defer broker.Close()
	go broker.RunWriter()

	queueReadyAt := time.Now()
	if err := writeJSON(TerminalQueueServerMessage{
		Type:                            "queue-ready",
		ProtocolVersion:                 TerminalQueueProtocolVersion,
		State:                           "open",
		ServerUnixMS:                    queueReadyAt.UnixMilli(),
		ServerPrepareDurationMS:         queueReadyAt.Sub(queueAcceptedAt).Milliseconds(),
		ServerAgentEnsureDurationMS:     agentEnsureFinishedAt.Sub(agentEnsureStartedAt).Milliseconds(),
		ServerAgentValidationDurationMS: queueReadyAt.Sub(agentValidationStartedAt).Milliseconds(),
		AgentProtocolVersion:            agentProtocolCurrent,
		PreferredAgentProtocolVersion:   AgentProtocolVersion,
		AgentProtocolUpdateAvailable:    agentProtocolUpdateAvailable,
		AgentProtocolUpdateRequired:     agentProtocolUpdateRequired,
	}); err != nil {
		return nil
	}
	if agentProtocolUpdateRequired {
		return holdTerminalQueueForProtocolUpdate(conn, writeJSON)
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
		var message TerminalQueueClientMessage
		if err := json.Unmarshal(payload, &message); err != nil {
			_ = writeJSON(TerminalQueueServerMessage{
				Type:            "queue-error",
				ProtocolVersion: TerminalQueueProtocolVersion,
				Message:         "invalid queue control message",
			})
			continue
		}
		switch strings.TrimSpace(message.Type) {
		case "replace-subscriptions":
			if message.ProtocolVersion != TerminalQueueProtocolVersion {
				_ = writeJSON(TerminalQueueServerMessage{
					Type:            "queue-error",
					ProtocolVersion: TerminalQueueProtocolVersion,
					Message:         "unsupported queue protocol version",
				})
				continue
			}
			if err := broker.ReplaceSubscriptions(message.Subscriptions, s.currentTerminalScrollback()); err != nil {
				_ = writeJSON(TerminalQueueServerMessage{
					Type:            "queue-error",
					ProtocolVersion: TerminalQueueProtocolVersion,
					Message:         err.Error(),
				})
			}
		case "pane-control":
			if err := broker.HandlePaneControl(message); err != nil {
				broker.WritePaneError(message.PaneID, message.StreamID, message.ChannelGeneration, err)
			}
		case "pane-input":
			message.Control, _ = json.Marshal(map[string]any{
				"type": "input",
				"data": message.Data,
			})
			if err := broker.HandlePaneControl(message); err != nil {
				broker.WritePaneError(message.PaneID, message.StreamID, message.ChannelGeneration, err)
			}
		case "set-priority":
			if err := broker.SetPriority(message); err != nil {
				broker.WritePaneError(message.PaneID, message.StreamID, message.ChannelGeneration, err)
			}
		case "queue-ping":
			_ = writeJSON(TerminalQueueServerMessage{
				Type:            "queue-pong",
				ProtocolVersion: TerminalQueueProtocolVersion,
			})
		}
	}
}

func holdTerminalQueueForProtocolUpdate(conn *websocket.Conn, writeJSON func(any) error) error {
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
		var message TerminalQueueClientMessage
		if json.Unmarshal(payload, &message) == nil && strings.TrimSpace(message.Type) == "queue-ping" {
			_ = writeJSON(TerminalQueueServerMessage{
				Type:            "queue-pong",
				ProtocolVersion: TerminalQueueProtocolVersion,
			})
		}
	}
}
