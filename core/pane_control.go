package core

import (
	"encoding/json"
	"github.com/gorilla/websocket"
	"strings"
)

func handleTerminalControlMessage(pane *terminalPane, payload []byte, client *paneClient) bool {
	var message TerminalControlMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		if data, ok := strings.CutPrefix(string(payload), "input:"); ok {
			_ = pane.writeInput([]byte(data))
			return true
		}
		return true
	}
	switch message.Type {
	case "input":
		pane.updateTerminalThemeColors(message.Foreground, message.Background, message.Cursor)
		if message.Data != "" {
			if message.Generated {
				_ = pane.writeGeneratedInput([]byte(message.Data))
			} else {
				if message.ResizeEpoch != "" {
					if err := pane.applyResize(message, client); err != nil {
						return true
					}
					_ = pane.writeInputWithDimensions([]byte(message.Data), 0, 0, 0, 0)
				} else {
					if err := pane.applyLegacyInputResize(message.Cols, message.Rows, message.PixelWidth, message.PixelHeight, client); err != nil {
						// Keep the input itself usable, but never let a legacy client
						// silently overwrite a geometry owned by an epoch-aware client.
						_ = pane.writeInputWithDimensions([]byte(message.Data), 0, 0, 0, 0)
						return true
					}
					_ = pane.writeInputWithDimensions(
						[]byte(message.Data),
						0,
						0,
						0,
						0,
					)
				}
			}
		}
	case "resize":
		if message.Cols > 0 && message.Rows > 0 {
			_ = pane.applyResize(message, client)
		}
	case "theme":
		pane.updateTerminalThemeColors(message.Foreground, message.Background, message.Cursor)
	case "input_lock":
		// Compatibility no-op for older direct clients during rolling upgrades.
	case "ping":
		data, err := json.Marshal(map[string]any{"type": "pong"})
		if err == nil {
			client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: data})
		}
	case "detach":
		return false
	}
	return true
}
