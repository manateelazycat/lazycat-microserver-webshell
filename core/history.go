package core

import (
	"lcmd-webshell/internal/pkg/fonts"
)

type paneHistory struct {
	chunks [][]byte
	bytes  int
	base   uint64
	end    uint64
}

type paneHistorySnapshot struct {
	checkpoint         *terminalMemoryCheckpoint
	checkpointFallback bool
	chunks             [][]byte
	generation         string
	syncMode           string
	serverBase         uint64
	serverEnd          uint64
	deltaFrom          uint64
	deltaTo            uint64
	resizeEpoch        uint64
	cols               int
	rows               int
	pixelWidth         int
	pixelHeight        int
}

func historyLimitBytesForTerminalScrollback(scrollback int) int {
	if err := fonts.ValidateTerminalScrollback(scrollback); err != nil {
		scrollback = fonts.DefaultTerminalScrollback
	}
	return scrollback * averageHistoryBytesPerLine
}

func makeHistoryChunks(data []byte) [][]byte {
	if len(data) == 0 {
		return nil
	}
	chunks := make([][]byte, 0, (len(data)+historyChunkMaxBytes-1)/historyChunkMaxBytes)
	for len(data) > 0 {
		chunkSize := min(len(data), historyChunkMaxBytes)
		chunk := append([]byte(nil), data[:chunkSize]...)
		chunks = append(chunks, chunk)
		data = data[chunkSize:]
	}
	return chunks
}

func (h *paneHistory) append(chunk []byte) {
	if len(chunk) == 0 {
		return
	}
	h.chunks = append(h.chunks, chunk)
	h.bytes += len(chunk)
	h.end += uint64(len(chunk))
}

func (h *paneHistory) trim(limit int) {
	if limit <= 0 || h.bytes <= limit {
		return
	}

	dropBytes := h.bytes - limit
	for dropBytes > 0 && len(h.chunks) > 0 {
		chunk := h.chunks[0]
		if dropBytes >= len(chunk) {
			dropBytes -= len(chunk)
			h.bytes -= len(chunk)
			h.base += uint64(len(chunk))
			h.chunks[0] = nil
			h.chunks = h.chunks[1:]
			continue
		}

		// A byte limit is a hard bound. Do not retain a whole chunk when only
		// part of its prefix needs to be discarded.
		h.chunks[0] = append([]byte(nil), chunk[dropBytes:]...)
		h.bytes -= dropBytes
		h.base += uint64(dropBytes)
		dropBytes = 0
	}
	if h.bytes < 0 {
		h.bytes = 0
	}
}

func (h *paneHistory) snapshot() paneHistorySnapshot {
	return paneHistorySnapshot{
		chunks:     append([][]byte(nil), h.chunks...),
		serverBase: h.base,
		serverEnd:  h.end,
		deltaFrom:  h.base,
		deltaTo:    h.end,
	}
}

func (h *paneHistory) snapshotFrom(cursor uint64) paneHistorySnapshot {
	if cursor < h.base {
		cursor = h.base
	}
	if cursor > h.end {
		cursor = h.end
	}
	snapshot := paneHistorySnapshot{
		serverBase: h.base,
		serverEnd:  h.end,
		deltaFrom:  cursor,
		deltaTo:    h.end,
	}
	if cursor >= h.end {
		return snapshot
	}
	skip := cursor - h.base
	for _, chunk := range h.chunks {
		chunkBytes := uint64(len(chunk))
		if skip >= chunkBytes {
			skip -= chunkBytes
			continue
		}
		if skip > 0 {
			chunk = chunk[skip:]
			skip = 0
		}
		snapshot.chunks = append(snapshot.chunks, chunk)
	}
	return snapshot
}

func (s paneHistorySnapshot) bytes() []byte {
	var total int
	for _, chunk := range s.chunks {
		total += len(chunk)
	}
	if total == 0 {
		return nil
	}
	data := make([]byte, 0, total)
	for _, chunk := range s.chunks {
		data = append(data, chunk...)
	}
	return data
}
