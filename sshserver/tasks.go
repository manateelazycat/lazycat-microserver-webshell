package sshserver

func (h *managedHandler) Busy() bool {
	if h.server == nil {
		return false
	}
	s := h.server
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.connections) > 0 {
		return true
	}
	for _, shell := range s.retained {
		shell.mu.Lock()
		active := !shell.ended
		shell.mu.Unlock()
		if active {
			return true
		}
	}
	return false
}
