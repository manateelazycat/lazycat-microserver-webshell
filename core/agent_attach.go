package core

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/gorilla/websocket"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
)

func (d *agentDaemon) handleAttach(ctx context.Context, conn net.Conn, reader *bufio.Reader, request AgentRequest) {
	attachStartedAt := time.Now()
	d.mu.Lock()
	workspace, err := d.ensureWorkspaceLocked(request)
	d.mu.Unlock()
	if err != nil {
		_ = writeAgentControlFrame(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return
	}
	workspaceReadyAt := time.Now()
	syncRequest := HistorySyncRequest{
		Generation:          strings.TrimSpace(request.HistoryGeneration),
		WorkspaceGeneration: strings.TrimSpace(request.WorkspaceGeneration),
		ForceSnapshot:       strings.TrimSpace(request.HistoryReplayMode) == "snapshot",
		IntegrityProtocol:   strings.TrimSpace(request.IntegrityProtocol),
	}
	base, baseErr := strconv.ParseUint(strings.TrimSpace(request.LocalBaseCursor), 10, 64)
	end, endErr := strconv.ParseUint(strings.TrimSpace(request.LocalEndCursor), 10, 64)
	if syncRequest.Generation != "" && baseErr == nil && endErr == nil && base <= end {
		syncRequest.LocalBase = base
		syncRequest.LocalEnd = end
		syncRequest.HasRange = true
	}
	pane, replayIdentity, err := workspace.paneForAttach(request.PaneID, syncRequest)
	if err != nil {
		if strings.Contains(err.Error(), "workspace generation") || strings.Contains(err.Error(), "pane not found") {
			_ = writeAgentControlFrame(conn, map[string]any{
				"type":     "workspace-refresh-required",
				"selector": workspace.selector,
				"reason":   err.Error(),
			})
			return
		}
		_ = writeAgentControlFrame(conn, map[string]any{"type": "process-exit", "message": err.Error(), "exit_code": -1})
		return
	}
	paneResolvedAt := time.Now()
	syncRequest.CheckpointProtocol = request.CheckpointProtocol
	history, client, allowGeneratedInputDuringReplay, exit, err := pane.attachClient(syncRequest)
	if err != nil {
		if errors.Is(err, errTerminalPaneClosing) {
			// Membership can change after paneForAttach releases workspace.mu.
			_ = writeAgentControlFrame(conn, map[string]any{
				"type": "workspace-refresh-required", "selector": workspace.selector, "reason": err.Error(),
			})
			return
		}
		if request.CheckpointProtocol == TerminalMemoryCheckpointProtocol {
			_ = writeAgentControlFrame(conn, map[string]any{"type": "terminal-checkpoint-error", "selector": workspace.selector,
				"pane_id": request.PaneID, "message": err.Error(), "checkpoint_diagnostics": pane.checkpointDiagnostics()})
			return
		}
		_ = writeAgentControlFrame(conn, map[string]any{
			"type":          "process-exit",
			"message":       err.Error(),
			"exit_code":     -1,
			"authoritative": true,
			"pane_id":       request.PaneID,
		})
		return
	}
	historyReadyAt := time.Now()
	// Retained failure evidence also reaches browsers attaching via raw history.
	if diagnostics := pane.checkpointDiagnostics(); diagnostics != nil {
		_ = writeAgentControlFrame(conn, map[string]any{"type": "terminal-checkpoint-diagnostic", "selector": workspace.selector,
			"pane_id": request.PaneID, "checkpoint_diagnostics": diagnostics})
	}
	defer func() {
		pane.detachClient(client)
		client.close()
	}()

	writerDone := make(chan struct{})
	fastSequence := uint64(1)
	fastCursor := history.deltaFrom
	go func() {
		defer func() {
			// A closed/overflowed subscriber must also wake the attach reader.
			// Otherwise the Provider can keep an apparently healthy stream whose
			// agent writer has exited and will never produce output again.
			_ = conn.Close()
			close(writerDone)
		}()
		_ = writeAgentControlFrame(conn, map[string]any{
			"type":                               "agent-attach-ready",
			"server_unix_ms":                     historyReadyAt.UnixMilli(),
			"agent_attach_started_unix_ms":       attachStartedAt.UnixMilli(),
			"agent_workspace_ready_duration_ms":  workspaceReadyAt.Sub(attachStartedAt).Milliseconds(),
			"agent_pane_resolve_duration_ms":     paneResolvedAt.Sub(workspaceReadyAt).Milliseconds(),
			"agent_history_snapshot_duration_ms": historyReadyAt.Sub(paneResolvedAt).Milliseconds(),
			"agent_attach_prepare_duration_ms":   historyReadyAt.Sub(attachStartedAt).Milliseconds(),
		})
		if !writeAgentHistoryReplay(conn, replayIdentity, history, allowGeneratedInputDuringReplay, request.IntegrityProtocol == "fast-v1", &fastSequence, &fastCursor) {
			return
		}
		if exit.exited {
			_ = writeAgentControlFrame(conn, exit.controlPayload(pane.selector, pane.id))
			return
		}
		for {
			select {
			case outbound := <-client.send:
				client.dequeued(len(outbound.payload))
				payload := outbound.payload
				if request.IntegrityProtocol == "fast-v1" && outbound.messageType == websocket.BinaryMessage {
					frame, encodeErr := encodeFastBinaryFrame(replayIdentity.selector, replayIdentity.paneID, history.generation, fastSequence, fastCursor, payload)
					if encodeErr != nil {
						return
					}
					fastSequence++
					fastCursor += uint64(len(payload))
					payload = frame
				}
				frameType := agentFrameBinary
				if outbound.messageType == websocket.TextMessage {
					frameType = AgentFrameText
				}
				if err := WriteAgentFrame(conn, frameType, payload); err != nil {
					return
				}
				if outbound.closeAfter {
					return
				}
			case <-client.done:
				return
			}
		}
	}()

	for {
		frameType, payload, err := ReadAgentFrame(reader)
		if err != nil {
			client.close()
			_ = conn.Close()
			<-writerDone
			return
		}
		switch frameType {
		case AgentFrameInput:
			_ = pane.writeInput(payload)
		case AgentFrameGeneratedInput:
			_ = pane.writeGeneratedInput(payload)
		case AgentFrameResize:
			var message TerminalControlMessage
			if err := json.Unmarshal(payload, &message); err == nil {
				switch message.Type {
				case "resize":
					if message.Cols > 0 && message.Rows > 0 {
						if message.ResizeEpoch == "" {
							_ = pane.applyLegacyInputResize(message.Cols, message.Rows, message.PixelWidth, message.PixelHeight, client)
						} else {
							_ = pane.applyResize(message, client)
						}
					}
				case "theme":
					pane.updateTerminalThemeColors(message.Foreground, message.Background, message.Cursor)
				}
			}
		case AgentFrameDetach:
			client.close()
			_ = conn.Close()
			<-writerDone
			return
		}
	}
}

func writeAgentHistoryReplay(w io.Writer, identity terminalReplayIdentity, history paneHistorySnapshot, allowGeneratedInput bool, integrity bool, sequence, cursor *uint64) bool {
	historyBytes := 0
	for _, chunk := range history.chunks {
		historyBytes += len(chunk)
	}
	replayStartedAt := time.Now()
	replayFrames := 0
	start := map[string]any{
		"type":                          "history-replay-start",
		"resize_protocol":               "epoch-v1",
		"selector":                      identity.selector,
		"pane_id":                       identity.paneID,
		"allow_generated_input":         allowGeneratedInput,
		"history_generation":            history.generation,
		"server_base_cursor":            strconv.FormatUint(history.serverBase, 10),
		"server_end_cursor":             strconv.FormatUint(history.serverEnd, 10),
		"sync_mode":                     history.syncMode,
		"delta_from_cursor":             strconv.FormatUint(history.deltaFrom, 10),
		"delta_to_cursor":               strconv.FormatUint(history.deltaTo, 10),
		"resize_epoch":                  formatTerminalResizeEpoch(history.resizeEpoch),
		"cols":                          history.cols,
		"rows":                          history.rows,
		"pixel_width":                   history.pixelWidth,
		"pixel_height":                  history.pixelHeight,
		"server_history_bytes":          historyBytes,
		"server_history_chunks":         len(history.chunks),
		"server_replay_frames":          0,
		"server_replay_started_unix_ms": replayStartedAt.UnixMilli(),
	}
	if integrity {
		start["integrity_protocol"] = "fast-v1"
	}
	if identity.workspaceGeneration != "" && identity.tabID != "" {
		start["workspace_generation"] = identity.workspaceGeneration
		start["tab_id"] = identity.tabID
	}
	if history.checkpoint != nil {
		checkpoint := history.checkpoint
		checkpoint.Parts = (len(checkpoint.Compressed) + 65535) / 65536
		for index, offset := 0, 0; offset < len(checkpoint.Compressed); index, offset = index+1, offset+65536 {
			part := checkpoint.Compressed[offset:min(offset+65536, len(checkpoint.Compressed))]
			if err := writeAgentControlFrame(w, map[string]any{"type": "terminal-checkpoint-part", "selector": identity.selector,
				"pane_id": identity.paneID, "history_generation": history.generation, "cursor": checkpoint.Cursor,
				"index": index, "data": base64.StdEncoding.EncodeToString(part)}); err != nil {
				return false
			}
		}
		start["memory_checkpoint"] = checkpoint
		start["recovery_baseline"] = TerminalMemoryCheckpointProtocol
	} else {
		start["recovery_baseline"] = "raw-history"
		if history.checkpointFallback {
			start["checkpoint_fallback"] = "parser_failed"
		}
	}
	if err := writeAgentControlFrame(w, start); err != nil {
		return false
	}
	pending := make([]byte, 0, historyReplayChunk)
	flushPending := func() bool {
		if len(pending) == 0 {
			return true
		}
		replayFrames++
		if integrity {
			frame, err := encodeFastBinaryFrame(identity.selector, identity.paneID, history.generation, *sequence, *cursor, pending)
			if err != nil || WriteAgentFrame(w, agentFrameBinary, frame) != nil {
				return false
			}
			*sequence = *sequence + 1
			*cursor += uint64(len(pending))
		} else if err := WriteAgentFrame(w, agentFrameBinary, pending); err != nil {
			return false
		}
		pending = pending[:0]
		return true
	}
	for _, chunk := range history.chunks {
		for len(chunk) > 0 {
			available := historyReplayChunk - len(pending)
			if available == 0 {
				if !flushPending() {
					return false
				}
				available = historyReplayChunk
			}
			chunkSize := min(len(chunk), available)
			pending = append(pending, chunk[:chunkSize]...)
			chunk = chunk[chunkSize:]
		}
	}
	if !flushPending() {
		return false
	}
	complete := map[string]any{
		"type":                           "history-replay-complete",
		"selector":                       identity.selector,
		"pane_id":                        identity.paneID,
		"history_generation":             history.generation,
		"history_cursor":                 strconv.FormatUint(history.deltaTo, 10),
		"server_history_bytes":           historyBytes,
		"server_history_chunks":          len(history.chunks),
		"server_replay_frames":           replayFrames,
		"server_replay_started_unix_ms":  replayStartedAt.UnixMilli(),
		"server_replay_finished_unix_ms": time.Now().UnixMilli(),
		"server_replay_duration_ms":      time.Since(replayStartedAt).Milliseconds(),
	}
	if identity.workspaceGeneration != "" && identity.tabID != "" {
		complete["workspace_generation"] = identity.workspaceGeneration
		complete["tab_id"] = identity.tabID
	}
	return writeAgentControlFrame(w, complete) == nil
}
