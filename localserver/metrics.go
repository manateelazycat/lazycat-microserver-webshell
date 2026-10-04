package localserver

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"
)

// Called only after the normal gateway, box, account/device/epoch ticket checks.
func (s *Server) hostMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.metrics == nil {
		http.Error(w, "host metrics unavailable", http.StatusNotImplemented)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	value, err := s.metrics.Snapshot(ctx)
	if err != nil || ctx.Err() != nil || s.ctx.Err() != nil {
		http.Error(w, "host metrics unavailable", http.StatusServiceUnavailable)
		return
	}
	digest := sha256.Sum256([]byte(s.config.Epoch))
	value.Generation = hex.EncodeToString(digest[:])
	reply(w, http.StatusOK, value)
}
