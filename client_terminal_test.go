package main

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadWebSocketDialFailureClassifiesBadGateway(t *testing.T) {
	response := &http.Response{
		StatusCode: http.StatusBadGateway,
		Header:     http.Header{"Content-Type": []string{"text/plain"}},
		Body:       io.NopCloser(strings.NewReader("upstream unavailable")),
	}

	failure := readWebSocketDialFailure(errors.New("websocket: bad handshake"), response)

	if failure.code != "client_terminal_service_unavailable" {
		t.Fatalf("code = %q, want client_terminal_service_unavailable", failure.code)
	}
	if !strings.Contains(failure.userMessage, "target_status=502") || !strings.Contains(failure.userMessage, "upstream unavailable") {
		t.Fatalf("unexpected user message: %q", failure.userMessage)
	}
	if !strings.Contains(failure.message, "target_status=502") || !strings.Contains(failure.message, "target_body=upstream unavailable") {
		t.Fatalf("unexpected technical message: %q", failure.message)
	}
}

func TestReadWebSocketDialFailureMapsForbidden(t *testing.T) {
	response := &http.Response{
		StatusCode: http.StatusForbidden,
		Header:     http.Header{"Content-Type": []string{"text/plain"}},
		Body:       io.NopCloser(strings.NewReader("forbidden")),
	}

	failure := readWebSocketDialFailure(errors.New("websocket: bad handshake"), response)

	if failure.code != "client_terminal_forbidden" {
		t.Fatalf("code = %q, want client_terminal_forbidden", failure.code)
	}
	if failure.userMessage != errInstanceForbidden.Error() {
		t.Fatalf("userMessage = %q, want account access error", failure.userMessage)
	}
}

func TestWriteClientTerminalErrorPreservesNonAuthStatusFailure(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeClientTerminalError(recorder, clientTerminalStatusError{label: "client terminal", status: http.StatusBadGateway, body: "agent unavailable"})

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", recorder.Code)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, "client terminal returned 502") || !strings.Contains(body, "agent unavailable") {
		t.Fatalf("body = %q, want terminal status details", body)
	}
	if strings.Contains(body, "instance is not accessible by current account") {
		t.Fatalf("body = %q, should not be mapped to account access error", body)
	}
}

func TestWriteClientTerminalErrorMapsAuthStatusFailure(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeClientTerminalError(recorder, clientTerminalStatusError{label: "client terminal ticket", status: http.StatusForbidden, body: "forbidden"})

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "instance is not accessible by current account") {
		t.Fatalf("body = %q, want account access error", recorder.Body.String())
	}
}
