package core

import (
	"fmt"
)

func (p *terminalPane) attachClient(syncRequest HistorySyncRequest) (paneHistorySnapshot, *paneClient, bool, paneExitSnapshot, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closing {
		return paneHistorySnapshot{}, nil, false, paneExitSnapshot{}, errTerminalPaneClosing
	}
	if p.historyGeneration == "" {
		generation, err := NewHistoryGeneration()
		if err != nil {
			return paneHistorySnapshot{}, nil, false, paneExitSnapshot{}, fmt.Errorf("create history generation: %w", err)
		}
		p.historyGeneration = generation
	}
	history := p.history.snapshot()
	history.generation = p.historyGeneration
	history.resizeEpoch = p.resizeEpoch
	history.cols = p.cols
	history.rows = p.rows
	history.pixelWidth = p.pixelWidth
	history.pixelHeight = p.pixelHeight
	history.syncMode = "snapshot"
	history.checkpointFallback = p.checkpoint != nil && p.checkpoint.err != nil
	// A stopped parser must never block this pane's history/live subscription.
	// Keep the same raw-history limit and snapshot boundary; no parser rebuild.
	if !history.checkpointFallback && syncRequest.CheckpointProtocol == TerminalMemoryCheckpointProtocol && p.checkpoint != nil {
		checkpoint, err := p.checkpoint.snapshot(p.history.end)
		if err != nil {
			return paneHistorySnapshot{}, nil, false, paneExitSnapshot{}, fmt.Errorf("terminal recovery checkpoint unavailable: %w", err)
		}
		if checkpoint != nil {
			history.checkpoint = checkpoint
			history.deltaFrom = p.history.end - uint64(len(p.checkpoint.pending))
			history.serverBase = min(history.serverBase, history.deltaFrom)
			history.chunks = nil
			if len(p.checkpoint.pending) > 0 {
				history.chunks = [][]byte{append([]byte(nil), p.checkpoint.pending...)}
			}
		}
	}
	if !history.checkpointFallback && history.checkpoint == nil && !syncRequest.ForceSnapshot && syncRequest.HasRange && syncRequest.Generation == p.historyGeneration && syncRequest.LocalEnd >= p.history.base && syncRequest.LocalEnd <= p.history.end {
		history = p.history.snapshotFrom(syncRequest.LocalEnd)
		history.generation = p.historyGeneration
		history.resizeEpoch = p.resizeEpoch
		history.cols = p.cols
		history.rows = p.rows
		history.pixelWidth = p.pixelWidth
		history.pixelHeight = p.pixelHeight
		history.syncMode = "delta"
		if syncRequest.LocalEnd == p.history.end {
			history.syncMode = "current"
		}
	}
	allowGeneratedInputDuringReplay := history.syncMode == "snapshot" && !p.hasAttached
	p.hasAttached = true
	client := &paneClient{
		send: make(chan paneOutbound, 256),
		done: make(chan struct{}),
	}
	p.clients[client] = struct{}{}
	exit := paneExitSnapshot{
		exited:   p.exited,
		exitCode: p.exitCode,
		message:  p.exitText,
		retained: p.exitRetained,
	}
	return history, client, allowGeneratedInputDuringReplay, exit, nil
}

func (p *terminalPane) detachClient(client *paneClient) {
	p.resizeMu.Lock()
	defer p.resizeMu.Unlock()
	p.mu.Lock()
	delete(p.clients, client)
	ownerReleased := p.resizeOwner == client
	if ownerReleased {
		p.resizeOwner = nil
	}
	clients := make([]*paneClient, 0, len(p.clients))
	if ownerReleased {
		for attached := range p.clients {
			clients = append(clients, attached)
		}
	}
	cols := p.cols
	rows := p.rows
	pixelWidth := p.pixelWidth
	pixelHeight := p.pixelHeight
	epoch := p.resizeEpoch
	p.mu.Unlock()
	if ownerReleased {
		p.enqueueResizeOwnerReleased(epoch, cols, rows, pixelWidth, pixelHeight, clients)
	}
}
