package provider

import "net/http"

// Inspection uses the normal authorization boundary, but bypasses workspace
// initialization and restart recovery for both container and client instances.
func (s *pluginServer) handleWorkspaceInspection(w http.ResponseWriter, r *http.Request, accountID, selector string) {
	var state WorkspaceState
	var err error
	if isClientTarget(selector) {
		if err = s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
			writeClientTerminalError(w, err)
			return
		}
		err = s.clientTerminalJSON(r.Context(), r.Header, selector, http.MethodGet, "/workspace/inspect", nil, nil, &state)
		if err != nil {
			writeClientTerminalError(w, err)
			return
		}
	} else {
		if err = s.authorizeInstanceSelector(r.Context(), selector); err != nil {
			writeAuthorizationError(w, err)
			return
		}
		response, requestErr := requestPersistentAgent(r.Context(), NormalizeAgentScope(selector, accountID), AgentRequest{Type: "inspect"})
		if requestErr != nil {
			if response.Version != "" && response.Error == "unknown request type" {
				requestErr = &unsupportedAgentProtocolError{version: response.Version}
			}
			if !writeAgentProtocolMismatch(w, requestErr) {
				http.Error(w, requestErr.Error(), http.StatusBadGateway)
			}
			return
		}
		if response.State == nil {
			http.Error(w, "agent returned empty workspace inspection", http.StatusBadGateway)
			return
		}
		state = *response.State
	}
	state.ServerRevision = s.currentServerRevision()
	writeJSON(w, state)
}
