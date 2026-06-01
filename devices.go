package main

import (
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

type webshellDeviceRecord struct {
	ClientID   string    `json:"client_id"`
	DeviceName string    `json:"device_name"`
	Platform   string    `json:"platform"`
	AccountID  string    `json:"account_id"`
	LastSeenAt time.Time `json:"last_seen_at"`
}

type webshellDeviceHeartbeatRequest struct {
	ClientID   string `json:"client_id"`
	DeviceName string `json:"device_name"`
	Platform   string `json:"platform"`
}

type webshellDeviceOfflineRequest struct {
	ClientID string `json:"client_id"`
}

func (s *pluginServer) handleDeviceHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	var payload webshellDeviceHeartbeatRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		http.Error(w, "invalid device heartbeat payload", http.StatusBadRequest)
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		http.Error(w, "invalid device heartbeat payload", http.StatusBadRequest)
		return
	}
	device := webshellDeviceRecord{
		ClientID:   strings.TrimSpace(payload.ClientID),
		DeviceName: strings.TrimSpace(payload.DeviceName),
		Platform:   strings.TrimSpace(payload.Platform),
		AccountID:  accountID,
		LastSeenAt: s.now(),
	}
	if device.ClientID == "" {
		http.Error(w, "client_id is required", http.StatusBadRequest)
		return
	}
	if device.DeviceName == "" {
		device.DeviceName = "Unknown Browser"
	}
	if device.Platform == "" {
		device.Platform = "Unknown"
	}
	s.upsertDevice(device)
	w.WriteHeader(http.StatusNoContent)
}

func (s *pluginServer) handleDeviceOffline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	var payload webshellDeviceOfflineRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		http.Error(w, "invalid device offline payload", http.StatusBadRequest)
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		http.Error(w, "invalid device offline payload", http.StatusBadRequest)
		return
	}
	clientID := strings.TrimSpace(payload.ClientID)
	if clientID == "" {
		http.Error(w, "client_id is required", http.StatusBadRequest)
		return
	}
	s.removeDevice(clientID, accountID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *pluginServer) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	accountID := currentRequestAccountID(r)
	if accountID == "" {
		http.Error(w, "account id is required", http.StatusUnauthorized)
		return
	}
	writeJSON(w, s.listDevices(accountID))
}

func (s *pluginServer) upsertDevice(device webshellDeviceRecord) {
	if s == nil {
		return
	}
	s.devicesMu.Lock()
	defer s.devicesMu.Unlock()
	now := s.now()
	s.expireDevicesLocked(now)
	if s.devices == nil {
		s.devices = make(map[string]webshellDeviceRecord)
	}
	key := webshellDeviceKey(device.ClientID, device.AccountID)
	if existing, ok := s.devices[key]; ok && existing.LastSeenAt.After(device.LastSeenAt) {
		return
	}
	s.devices[key] = device
}

func (s *pluginServer) removeDevice(clientID, accountID string) {
	if s == nil {
		return
	}
	s.devicesMu.Lock()
	defer s.devicesMu.Unlock()
	if len(s.devices) == 0 {
		return
	}
	s.expireDevicesLocked(s.now())
	delete(s.devices, webshellDeviceKey(clientID, accountID))
}

func (s *pluginServer) listDevices(accountID string) []webshellDeviceRecord {
	if s == nil {
		return nil
	}
	accountID = strings.TrimSpace(accountID)
	s.devicesMu.Lock()
	defer s.devicesMu.Unlock()
	now := s.now()
	s.expireDevicesLocked(now)
	devices := make([]webshellDeviceRecord, 0, len(s.devices))
	for _, device := range s.devices {
		if strings.TrimSpace(device.AccountID) != accountID {
			continue
		}
		devices = append(devices, device)
	}
	sort.Slice(devices, func(left, right int) bool {
		return devices[left].LastSeenAt.After(devices[right].LastSeenAt)
	})
	return devices
}

func (s *pluginServer) expireDevicesLocked(now time.Time) {
	if s == nil || len(s.devices) == 0 {
		return
	}
	cutoff := now.Add(-webshellDeviceTTL)
	for key, device := range s.devices {
		if !device.LastSeenAt.After(cutoff) {
			delete(s.devices, key)
		}
	}
}

func (s *pluginServer) now() time.Time {
	if s != nil && s.deviceNow != nil {
		return s.deviceNow()
	}
	return time.Now()
}

func webshellDeviceKey(clientID, accountID string) string {
	return strings.TrimSpace(accountID) + "\x00" + strings.TrimSpace(clientID)
}
