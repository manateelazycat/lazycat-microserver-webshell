package core

import (
	"encoding/json"
	"errors"
	"github.com/gorilla/websocket"
	"strings"
	"time"
)

func (p *terminalPane) applyLegacyInputResize(cols, rows, pixelWidth, pixelHeight int, source *paneClient) error {
	if cols <= 0 || rows <= 0 {
		return nil
	}
	p.resizeMu.Lock()
	defer p.resizeMu.Unlock()
	p.mu.Lock()
	currentEpoch := p.resizeEpoch
	currentCols := p.cols
	currentRows := p.rows
	currentPixelWidth := p.pixelWidth
	currentPixelHeight := p.pixelHeight
	owner := p.resizeOwner
	p.mu.Unlock()
	if currentEpoch != 0 && (owner == nil || owner != source) && (NormalizeCols(cols) != currentCols || NormalizeRows(rows) != currentRows || (pixelWidth > 0 && normalizeTerminalPixelDimension(pixelWidth) != currentPixelWidth) || (pixelHeight > 0 && normalizeTerminalPixelDimension(pixelHeight) != currentPixelHeight)) {
		p.enqueueResizeError(source, currentEpoch, "resize_owner_active")
		return errors.New("resize owner is active")
	}
	if err := p.resizeWithPixelsUnlocked(cols, rows, pixelWidth, pixelHeight); err != nil {
		return err
	}
	if source != nil {
		p.mu.Lock()
		p.resizeOwner = source
		p.mu.Unlock()
	}
	return nil
}

func (p *terminalPane) updateTerminalThemeColors(foreground, background, cursor string) {
	foreground = normalizeTerminalHexColor(foreground, "")
	background = normalizeTerminalHexColor(background, "")
	cursor = normalizeTerminalHexColor(cursor, "")
	if foreground == "" && background == "" && cursor == "" {
		return
	}
	p.mu.Lock()
	if foreground != "" {
		p.terminalForegroundColor = foreground
	}
	if background != "" {
		p.terminalBackgroundColor = background
	}
	if cursor != "" {
		p.terminalCursorColor = cursor
	}
	p.mu.Unlock()
}

func (p *terminalPane) resize(cols, rows int) error {
	return p.resizeWithPixels(cols, rows, 0, 0)
}

func (p *terminalPane) resizeWithPixels(cols, rows, pixelWidth, pixelHeight int) error {
	p.resizeMu.Lock()
	defer p.resizeMu.Unlock()
	return p.resizeWithPixelsUnlocked(cols, rows, pixelWidth, pixelHeight)
}

func (p *terminalPane) resizeWithPixelsUnlocked(cols, rows, pixelWidth, pixelHeight int) error {
	cols = NormalizeCols(cols)
	rows = NormalizeRows(rows)
	pixelWidth = normalizeTerminalPixelDimension(pixelWidth)
	pixelHeight = normalizeTerminalPixelDimension(pixelHeight)
	p.mu.Lock()
	if p.closing {
		p.mu.Unlock()
		return errTerminalPaneClosing
	}
	if pixelWidth == 0 {
		pixelWidth = p.pixelWidth
	}
	if pixelHeight == 0 {
		pixelHeight = p.pixelHeight
	}
	if p.cols == cols && p.rows == rows && p.pixelWidth == pixelWidth && p.pixelHeight == pixelHeight {
		p.mu.Unlock()
		return nil
	}
	ptyFile := p.ptyFile
	exited := p.exited
	p.cols = cols
	p.rows = rows
	p.pixelWidth = pixelWidth
	p.pixelHeight = pixelHeight
	p.resizeCheckpointLocked(cols, rows, p.historyLimitBytes/averageHistoryBytesPerLine)
	p.mu.Unlock()
	if exited || ptyFile == nil {
		return nil
	}
	if err := p.workspace.runtime.platform.ResizePTY(ptyFile, cols, rows, pixelWidth, pixelHeight); err != nil {
		return err
	}
	return nil
}

func (p *terminalPane) applyResize(message TerminalControlMessage, source *paneClient) error {
	resizeStartedAt := time.Now()
	epoch, hasEpoch := parseTerminalResizeEpoch(message.ResizeEpoch)
	if !hasEpoch {
		if strings.TrimSpace(message.ResizeEpoch) != "" {
			p.enqueueResizeError(source, 0, "invalid_resize_epoch")
			return errors.New("invalid resize epoch")
		}
		p.resizeMu.Lock()
		defer p.resizeMu.Unlock()
		p.mu.Lock()
		legacyEpoch := p.resizeEpoch
		owner := p.resizeOwner
		p.mu.Unlock()
		if legacyEpoch == 0 || (owner != nil && owner == source) {
			if err := p.resizeWithPixelsUnlocked(message.Cols, message.Rows, message.PixelWidth, message.PixelHeight); err != nil {
				return err
			}
			if source != nil {
				p.mu.Lock()
				p.resizeOwner = source
				p.mu.Unlock()
			}
			return nil
		}
		p.enqueueResizeError(source, legacyEpoch, "resize_owner_active")
		return errors.New("resize owner is active")
	}

	p.resizeMu.Lock()
	defer p.resizeMu.Unlock()

	p.mu.Lock()
	currentEpoch := p.resizeEpoch
	currentCols := p.cols
	currentRows := p.rows
	currentPixelWidth := p.pixelWidth
	currentPixelHeight := p.pixelHeight
	p.mu.Unlock()

	cols := NormalizeCols(message.Cols)
	rows := NormalizeRows(message.Rows)
	pixelWidth := normalizeTerminalPixelDimension(message.PixelWidth)
	pixelHeight := normalizeTerminalPixelDimension(message.PixelHeight)
	if pixelWidth == 0 {
		pixelWidth = currentPixelWidth
	}
	if pixelHeight == 0 {
		pixelHeight = currentPixelHeight
	}
	if epoch < currentEpoch {
		p.enqueueResizeError(source, epoch, "stale_resize_epoch")
		return errors.New("stale resize epoch")
	}
	if epoch == currentEpoch && (cols != currentCols || rows != currentRows || pixelWidth != currentPixelWidth || pixelHeight != currentPixelHeight) {
		p.enqueueResizeError(source, epoch, "resize_epoch_conflict")
		return errors.New("resize epoch conflict")
	}
	// A resize from an attached client owns the shared PTY geometry until
	// that client detaches. A stale epoch alone must not keep an offline
	// device as the owner forever.
	p.mu.Lock()
	ownerActive := p.resizeOwner != nil
	owner := p.resizeOwner
	p.mu.Unlock()
	if ownerActive && !message.Claim && epoch != currentEpoch && source != owner {
		p.enqueueResizeError(source, epoch, "resize_owner_active")
		return errors.New("resize owner is active")
	}
	outputWaitStartedAt := time.Now()
	p.outputMu.Lock()
	outputWaitMS := float64(time.Since(outputWaitStartedAt).Microseconds()) / 1000
	if err := p.resizeWithPixelsUnlocked(cols, rows, pixelWidth, pixelHeight); err != nil {
		p.outputMu.Unlock()
		p.enqueueResizeError(source, epoch, "pty_resize_failed")
		return err
	}
	p.mu.Lock()
	p.resizeEpoch = epoch
	if source != nil {
		p.resizeOwner = source
	}
	currentCols = p.cols
	currentRows = p.rows
	currentPixelWidth = p.pixelWidth
	currentPixelHeight = p.pixelHeight
	clients := make([]*paneClient, 0, len(p.clients))
	for client := range p.clients {
		clients = append(clients, client)
	}
	p.mu.Unlock()
	p.enqueueResizeApplied(epoch, currentCols, currentRows, currentPixelWidth, currentPixelHeight, clients,
		map[string]any{"apply_duration_ms": float64(time.Since(resizeStartedAt).Microseconds()) / 1000, "output_lock_wait_ms": outputWaitMS})
	p.outputMu.Unlock()
	return nil
}

func (p *terminalPane) enqueueResizeOwnerReleased(epoch uint64, cols, rows, pixelWidth, pixelHeight int, clients []*paneClient) {
	payload, err := json.Marshal(map[string]any{
		"type":         "resize-owner-released",
		"selector":     p.selector,
		"pane_id":      p.id,
		"resize_epoch": formatTerminalResizeEpoch(epoch),
		"cols":         cols,
		"rows":         rows,
		"pixel_width":  pixelWidth,
		"pixel_height": pixelHeight,
	})
	if err != nil {
		return
	}
	for _, client := range clients {
		client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: payload})
	}
}

func (p *terminalPane) enqueueResizeApplied(epoch uint64, cols, rows, pixelWidth, pixelHeight int, clients []*paneClient, timing map[string]any) {
	payload, err := json.Marshal(map[string]any{
		"type":                   "resize-applied",
		"checkpoint_diagnostics": p.checkpointDiagnostics(),
		"resize_diagnostics":     timing,
		"selector":               p.selector,
		"pane_id":                p.id,
		"resize_epoch":           formatTerminalResizeEpoch(epoch),
		"cols":                   cols,
		"rows":                   rows,
		"pixel_width":            pixelWidth,
		"pixel_height":           pixelHeight,
	})
	if err != nil {
		return
	}
	for _, client := range clients {
		client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: payload})
	}
}

func (p *terminalPane) enqueueResizeError(client *paneClient, epoch uint64, reason string) {
	if client == nil {
		return
	}
	p.mu.Lock()
	currentEpoch := p.resizeEpoch
	cols := p.cols
	rows := p.rows
	pixelWidth := p.pixelWidth
	pixelHeight := p.pixelHeight
	p.mu.Unlock()
	payload, err := json.Marshal(map[string]any{
		"type":          "resize-error",
		"selector":      p.selector,
		"pane_id":       p.id,
		"resize_epoch":  formatTerminalResizeEpoch(epoch),
		"applied_epoch": formatTerminalResizeEpoch(currentEpoch),
		"cols":          cols,
		"rows":          rows,
		"pixel_width":   pixelWidth,
		"pixel_height":  pixelHeight,
		"reason":        reason,
		"retryable":     reason == "pty_resize_failed",
	})
	if err == nil {
		p.outputMu.Lock()
		client.enqueue(paneOutbound{messageType: websocket.TextMessage, payload: payload})
		p.outputMu.Unlock()
	}
}
