package provider

import "net/http"

// Inspection uses normal authorization. New runtimes provide read-only metadata;
// deployed PC cores can use their established workspace read path for compatibility.
func (s *pluginServer) handleWorkspaceInspection(w http.ResponseWriter, r *http.Request, accountID, selector string) {
	var state WorkspaceState
	var err error
	if isClientTarget(selector) {
		if err = s.authorizeClientTarget(r.Context(), r.Header, accountID, selector); err != nil {
			writeClientTerminalError(w, err)
			return
		}
		state, err = s.clientWorkspaceInspection(r.Context(), r.Header, NormalizeAgentScope(selector, accountID))
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
		applyAgentWorkspaceCapabilities(&state, response.Version)
	}
	state.ServerRevision = s.currentServerRevision()
	writeJSON(w, state)
}
