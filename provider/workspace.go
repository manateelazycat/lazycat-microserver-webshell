package provider

import (
	"encoding/json"
	"github.com/gorilla/websocket"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *pluginServer) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if isClientTarget(selector) {
		cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
		s.handleClientWorkspace(w, r, accountID, selector, cols, rows, s.currentTerminalScrollback())
		return
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return
	}
	scope := NormalizeAgentScope(selector, accountID)
	cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
	terminalScrollback, restoreEpoch := s.currentTerminalRuntimeSettings()

	switch r.Method {
	case http.MethodGet:
		var state WorkspaceState
		var err error
		if restoreEpoch == "" {
			state, err = requestAgentWorkspaceState(r.Context(), scope, cols, rows, terminalScrollback)
		} else {
			state, err = s.requestWorkspaceStateWithRecovery(r.Context(), scope, cols, rows, terminalScrollback, restoreEpoch)
		}
		if err != nil {
			if writeAgentProtocolMismatch(w, err) {
				return
			}
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		state.ServerRevision = s.currentServerRevision()
		state.AgentNotice = consumePersistentAgentNotice(scope)
		writeJSON(w, state)
	case http.MethodPost:
		var request WorkspaceActionRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if request.Action == "restore_workspace" || request.Recovery != nil {
			http.Error(w, "workspace recovery is not a public action", http.StatusBadRequest)
			return
		}
		var state WorkspaceState
		var err error
		if restoreEpoch == "" {
			state, err = requestAgentWorkspaceAction(r.Context(), scope, cols, rows, terminalScrollback, request)
		} else {
			state, err = s.requestWorkspaceActionWithRecovery(r.Context(), scope, cols, rows, terminalScrollback, restoreEpoch, request)
		}
		if err != nil {
			if writeAgentProtocolMismatch(w, err) {
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		state.ServerRevision = s.currentServerRevision()
		state.AgentNotice = consumePersistentAgentNotice(scope)
		writeJSON(w, state)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *pluginServer) handleWorkspaceActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	if isClientTarget(selector) {
		cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
		s.handleClientWorkspaceActivity(w, r, accountID, selector, cols, rows, s.currentTerminalScrollback())
		return
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return
	}
	scope := NormalizeAgentScope(selector, accountID)
	cols, rows := parseTerminalSize(r.URL.Query().Get("cols"), r.URL.Query().Get("rows"))
	terminalScrollback, restoreEpoch := s.currentTerminalRuntimeSettings()
	var state WorkspaceActivityState
	var err error
	if restoreEpoch == "" {
		state, err = requestAgentWorkspaceActivity(r.Context(), scope, cols, rows, terminalScrollback)
	} else {
		state, err = s.requestWorkspaceActivityWithRecovery(r.Context(), scope, cols, rows, terminalScrollback, restoreEpoch)
	}
	if err != nil {
		if writeAgentProtocolMismatch(w, err) {
			return
		}
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	state.ServerRevision = s.currentServerRevision()
	writeJSON(w, state)
}

func (s *pluginServer) attachPersistentPane(w http.ResponseWriter, r *http.Request, cols, rows int) error {
	selector := strings.TrimSpace(r.URL.Query().Get("name"))
	paneID := strings.TrimSpace(r.URL.Query().Get("pane"))
	if selector == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return nil
	}
	if paneID == "" {
		http.Error(w, "pane is required", http.StatusBadRequest)
		return nil
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return nil
	}
	if isClientTarget(selector) {
		return s.attachClientPane(w, r, accountID, selector, paneID, cols, rows, s.currentTerminalScrollback())
	}
	if err := s.authorizeInstanceSelector(r.Context(), selector); err != nil {
		writeAuthorizationError(w, err)
		return nil
	}
	return s.attachAgentPane(w, r, NormalizeAgentScope(selector, accountID), paneID, cols, rows, s.currentTerminalScrollback(), historySyncRequestFromQuery(r))
}

func historySyncRequestFromQuery(r *http.Request) HistorySyncRequest {
	if r == nil {
		return HistorySyncRequest{}
	}
	query := r.URL.Query()
	request := HistorySyncRequest{
		Generation:          strings.TrimSpace(query.Get("history_generation")),
		WorkspaceGeneration: strings.TrimSpace(query.Get("workspace_generation")),
		ForceSnapshot:       strings.TrimSpace(query.Get("history_replay_mode")) == "snapshot",
		IntegrityProtocol:   strings.TrimSpace(query.Get("integrity_protocol")),
	}
	baseText := strings.TrimSpace(query.Get("local_base_cursor"))
	endText := strings.TrimSpace(query.Get("local_end_cursor"))
	if request.Generation == "" || len(request.Generation) > 128 || baseText == "" || endText == "" {
		return request
	}
	base, baseErr := strconv.ParseUint(baseText, 10, 64)
	end, endErr := strconv.ParseUint(endText, 10, 64)
	if baseErr != nil || endErr != nil || base > end {
		return request
	}
	request.LocalBase = base
	request.LocalEnd = end
	request.HasRange = true
	return request
}

func terminalThemeFromRequest(r *http.Request) (string, string, string) {
	if r == nil {
		return "", "", ""
	}
	query := r.URL.Query()
	return query.Get("fg"), query.Get("bg"), query.Get("cursor")
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func writeWebSocketJSON(conn *websocket.Conn, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_ = conn.SetWriteDeadline(time.Now().Add(websocketWriteTimeout))
	err = conn.WriteMessage(websocket.TextMessage, data)
	_ = conn.SetWriteDeadline(time.Time{})
	return err
}
