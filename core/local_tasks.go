package core

// HasTasks observes existing panes without creating a workspace or starting PTYs.
func (l *Local) HasTasks() bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	l.daemon.mu.Lock()
	defer l.daemon.mu.Unlock()
	w := l.daemon.workspace
	if w == nil {
		return false
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, p := range w.panes {
		p.mu.Lock()
		active := !p.exited
		p.mu.Unlock()
		if active {
			return true
		}
	}
	return false
}
