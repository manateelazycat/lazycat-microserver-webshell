package core

import (
	"strings"
)

func AgentConnectionErrorPayload(err error) map[string]any {
	message := "persistent webshell agent connection failed"
	if err != nil && strings.TrimSpace(err.Error()) != "" {
		message = strings.TrimSpace(err.Error())
	}
	return map[string]any{
		"type":      "connection-error",
		"message":   message,
		"retryable": true,
	}
}

func IsPaneNotFoundAttachError(message string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(message)), "pane not found")
}

func isRetryableAgentAttachError(message string) bool {
	text := strings.ToLower(strings.TrimSpace(message))
	if text == "" || IsPaneNotFoundAttachError(text) {
		return false
	}
	for _, marker := range []string{
		"broken pipe",
		"connection refused",
		"deadline exceeded",
		"i/o timeout",
		"no such file or directory",
		"socket",
		"unsupported agent protocol",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}
