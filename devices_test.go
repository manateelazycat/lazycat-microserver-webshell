package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandleDeviceHeartbeatAndListDevices(t *testing.T) {
	now := time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)
	server := &pluginServer{deviceNow: func() time.Time { return now }}
	request := httptest.NewRequest(http.MethodPost, "/api/devices/heartbeat", strings.NewReader(`{"client_id":"client-a","device_name":"Mac Safari","platform":"macOS"}`))
	request.Header.Set(lightOSUserIDHeader, "alice")
	recorder := httptest.NewRecorder()

	server.handleDeviceHeartbeat(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("handleDeviceHeartbeat status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/devices", nil)
	listRequest.Header.Set(lightOSUserIDHeader, "alice")
	listRecorder := httptest.NewRecorder()
	server.handleDevices(listRecorder, listRequest)

	if listRecorder.Code != http.StatusOK {
		t.Fatalf("handleDevices status = %d, body = %s", listRecorder.Code, listRecorder.Body.String())
	}
	var devices []webshellDeviceRecord
	if err := json.NewDecoder(listRecorder.Body).Decode(&devices); err != nil {
		t.Fatalf("decode devices error = %v", err)
	}
	if len(devices) != 1 {
		t.Fatalf("device count = %d, want 1: %+v", len(devices), devices)
	}
	device := devices[0]
	if device.ClientID != "client-a" || device.DeviceName != "Mac Safari" || device.Platform != "macOS" || device.AccountID != "alice" {
		t.Fatalf("device = %+v, want client-a Mac Safari macOS alice", device)
	}
}

func TestDeviceHeartbeatDeduplicatesClientAndAccount(t *testing.T) {
	now := time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)
	server := &pluginServer{deviceNow: func() time.Time { return now }}

	first := httptest.NewRequest(http.MethodPost, "/api/devices/heartbeat", strings.NewReader(`{"client_id":"client-a","device_name":"Mac Safari","platform":"macOS"}`))
	first.Header.Set(lightOSUserIDHeader, "alice")
	server.handleDeviceHeartbeat(httptest.NewRecorder(), first)

	now = now.Add(3 * time.Second)
	second := httptest.NewRequest(http.MethodPost, "/api/devices/heartbeat", strings.NewReader(`{"client_id":"client-a","device_name":"Mac Chrome","platform":"macOS"}`))
	second.Header.Set(lightOSUserIDHeader, "alice")
	server.handleDeviceHeartbeat(httptest.NewRecorder(), second)

	devices := server.listDevices("alice")
	if len(devices) != 1 {
		t.Fatalf("device count = %d, want 1: %+v", len(devices), devices)
	}
	if devices[0].DeviceName != "Mac Chrome" || !devices[0].LastSeenAt.Equal(now) {
		t.Fatalf("device = %+v, want updated Mac Chrome at %s", devices[0], now)
	}
}

func TestDeviceListExcludesExpiredDevices(t *testing.T) {
	now := time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)
	server := &pluginServer{deviceNow: func() time.Time { return now }}
	server.upsertDevice(webshellDeviceRecord{
		ClientID:   "client-a",
		DeviceName: "Mac Safari",
		Platform:   "macOS",
		AccountID:  "alice",
		LastSeenAt: now,
	})

	now = now.Add(webshellDeviceTTL + time.Millisecond)

	if devices := server.listDevices("alice"); len(devices) != 0 {
		t.Fatalf("device count = %d, want 0: %+v", len(devices), devices)
	}
}

func TestHandleDeviceOfflineRemovesDevice(t *testing.T) {
	now := time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)
	server := &pluginServer{deviceNow: func() time.Time { return now }}
	server.upsertDevice(webshellDeviceRecord{
		ClientID:   "client-a",
		DeviceName: "Mac Safari",
		Platform:   "macOS",
		AccountID:  "alice",
		LastSeenAt: now,
	})
	request := httptest.NewRequest(http.MethodPost, "/api/devices/offline", strings.NewReader(`{"client_id":"client-a"}`))
	request.Header.Set(lightOSUserIDHeader, "alice")
	recorder := httptest.NewRecorder()

	server.handleDeviceOffline(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("handleDeviceOffline status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if devices := server.listDevices("alice"); len(devices) != 0 {
		t.Fatalf("device count = %d, want 0: %+v", len(devices), devices)
	}
}

func TestHandleDevicesRequiresAccountHeader(t *testing.T) {
	t.Setenv(lightOSRequireCookieAuthEnv, "")
	server := &pluginServer{}
	recorder := httptest.NewRecorder()

	server.handleDevices(recorder, httptest.NewRequest(http.MethodGet, "/api/devices", nil))

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("handleDevices status = %d, want 401", recorder.Code)
	}
}
