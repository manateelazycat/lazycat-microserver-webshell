package sshserver

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

type configRequest struct {
	Revision     uint64 `json:"revision"`
	Enabled      bool   `json:"enabled"`
	PasswordHash string `json:"password_hash"`
}

func (h *managedHandler) configure(w http.ResponseWriter, r *http.Request, grant ticketGrant) {
	control := http.NewResponseController(w)
	_ = control.SetReadDeadline(time.Now().Add(15 * time.Second))
	defer control.SetReadDeadline(time.Time{})
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "invalid SSH configuration", http.StatusBadRequest)
		return
	}
	digest := sha256.Sum256(body)
	expected, _ := hex.DecodeString(grant.bodyHash)
	if subtle.ConstantTimeCompare(digest[:], expected) != 1 {
		http.Error(w, "SSH configuration authorization mismatch", http.StatusUnauthorized)
		return
	}
	var cfg configRequest
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&cfg) != nil || decoder.Decode(new(any)) != io.EOF || cfg.Revision != grant.revision {
		http.Error(w, "invalid SSH configuration", http.StatusBadRequest)
		return
	}
	if h.ctx.Err() != nil || r.Context().Err() != nil || grant.expires <= time.Now().Unix() {
		http.Error(w, "SSH access disabled", http.StatusUnauthorized)
		return
	}
	if err := h.server.Apply(Config{Revision: cfg.Revision, Enabled: cfg.Enabled, PasswordHash: cfg.PasswordHash}); err != nil {
		http.Error(w, "SSH configuration not applied", http.StatusConflict)
		return
	}
	h.writeStatus(w, h.server.Status())
}

func (h *managedHandler) writeStatus(w http.ResponseWriter, status Status) {
	admission := h.config.AdmissionAllowed == nil || h.config.AdmissionAllowed()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Enabled          bool   `json:"enabled"`
		AdmissionAllowed bool   `json:"admission_allowed"`
		Revision         uint64 `json:"revision"`
		Fingerprint      string `json:"host_key_fingerprint"`
		Connections      int    `json:"connections"`
	}{status.Enabled, admission, status.Revision, status.HostKeyFingerprint, status.Connections})
}
