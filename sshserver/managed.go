package sshserver

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"lcmd-webshell/core"
	"lcmd-webshell/localserver"
)

// StartManaged uses the existing authenticated HTTP listener. Failure of SSH
// key storage disables only SSH, not the user's browser workspace.
func StartManaged(ctx context.Context, config localserver.Config, stateDir string, platform core.Platform) (*localserver.Server, error) {
	return StartManagedWithMetrics(ctx, config, stateDir, platform, nil)
}

// The optional metrics source is independent of the SSH switch and lifetime.
func StartManagedWithMetrics(ctx context.Context, config localserver.Config, stateDir string, platform core.Platform, metrics core.HostMetricsSource) (*localserver.Server, error) {
	ctx, cancel := context.WithCancel(ctx)
	owner := sha256.Sum256([]byte(config.BoxID + "\x00" + config.AccountID + "\x00" + config.DeviceID))
	ssh, initErr := New(ctx, Binding{BoxID: config.BoxID, AccountID: config.AccountID, DeviceID: config.DeviceID, Epoch: config.Epoch},
		filepath.Join(stateDir, "ssh", hex.EncodeToString(owner[:])), platform)
	handler := &managedHandler{config: config, server: ssh, ctx: ctx, cancel: cancel, used: make(map[string]int64), unavailable: initErr != nil}
	server, err := localserver.StartWithServices(ctx, config, platform, localserver.Services{SSH: handler, Metrics: metrics})
	if err != nil {
		_ = handler.Close()
	}
	return server, err
}

type managedHandler struct {
	config      localserver.Config
	server      *Server
	unavailable bool
	ctx         context.Context
	cancel      context.CancelFunc
	mu          sync.Mutex
	used        map[string]int64
}

func (h *managedHandler) Close() error {
	h.cancel()
	if h.server != nil {
		return h.server.Close()
	}
	return nil
}

func (h *managedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var purpose string
	switch {
	case r.URL.Path == "/ssh/status" && r.Method == http.MethodGet:
		purpose = "ssh-status"
	case r.URL.Path == "/ssh/config" && r.Method == http.MethodPut:
		purpose = "ssh-config"
	case r.URL.Path == "/ssh/connect" && r.Method == http.MethodGet:
		purpose = "ssh-tunnel"
	default:
		http.NotFound(w, r)
		return
	}
	grant, ok := h.authorize(r, purpose)
	if h.ctx.Err() != nil || !ok {
		http.Error(w, "SSH authorization denied", http.StatusUnauthorized)
		return
	}
	if h.unavailable {
		http.Error(w, "SSH local storage unavailable", http.StatusServiceUnavailable)
		return
	}
	switch purpose {
	case "ssh-status":
		h.writeStatus(w, h.server.Status())
	case "ssh-config":
		h.configure(w, r, grant)
	case "ssh-tunnel":
		h.tunnel(w, r, grant)
	}
}

// Tunnel admission tickets are single-use. Established sessions follow the
// explicit revocation, not the short admission-ticket expiry.
func (h *managedHandler) consume(grant ticketGrant) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now().Unix()
	for nonce, expiry := range h.used {
		if expiry <= now {
			delete(h.used, nonce)
		}
	}
	if _, exists := h.used[grant.nonce]; exists || len(h.used) >= 256 || grant.expires <= now {
		return false
	}
	h.used[grant.nonce] = grant.expires
	return true
}
