package main

import (
	"errors"
	"io"
	"net/http"
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
	if !strings.Contains(failure.userMessage, "target_status=502") || strings.Contains(failure.userMessage, "upstream unavailable") {
		t.Fatalf("unexpected user message: %q", failure.userMessage)
	}
	if !strings.Contains(failure.message, "target_status=502") || !strings.Contains(failure.message, "target_body=upstream unavailable") {
		t.Fatalf("unexpected technical message: %q", failure.message)
	}
}
