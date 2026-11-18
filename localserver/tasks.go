package localserver

// Busy includes retained tasks and live publication tunnels, not only viewers.
func (s *Server) Busy() bool {
	s.mu.Lock()
	active := len(s.sockets) > 0
	s.mu.Unlock()
	if active || s.activeRequests.Load() > 0 || s.local.HasTasks() {
		return true
	}
	if ssh, ok := s.ssh.(interface{ Busy() bool }); ok {
		return ssh.Busy()
	}
	return false
}
