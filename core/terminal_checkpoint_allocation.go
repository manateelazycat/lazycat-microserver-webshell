package core

import "encoding/binary"

// Fixed native ABI: four header words and up to eight 32-word numeric records.
// Reading this report neither allocates in WASM nor retries the failed call.
var allocationDiagnosticFields = []string{
	"stage", "caller", "retry", "reason", "source_bytes", "target_bytes", "source_string_bytes", "target_string_bytes",
	"source_cols", "source_rows", "target_cols", "target_rows", "uri_bytes", "id_bytes", "uri_offset", "id_offset",
	"metadata_valid", "styles", "grapheme_bytes", "hyperlink_bytes", "request_bytes", "chunk_bytes", "request_chunks", "bitmap_words",
	"free_chunks", "largest_free_run", "bitmap_offset", "chunks_offset",
}

type allocationDiagnosticReport struct {
	Status    string              `json:"status"`
	Operation uint32              `json:"operation,omitempty"`
	Total     uint32              `json:"total_observations,omitempty"`
	Truncated bool                `json:"truncated,omitempty"`
	Records   []map[string]uint32 `json:"records,omitempty"`
}

func (e *terminalCheckpointEngine) nativeAllocationDiagnostics() *allocationDiagnosticReport {
	unavailable := &allocationDiagnosticReport{Status: "unavailable"}
	ptr, err := e.call("ghostty_terminal_allocation_diagnostics_ptr")
	if err != nil {
		return unavailable
	}
	length, err := e.call("ghostty_terminal_allocation_diagnostics_len")
	if err != nil || length != (4+8*32)*4 {
		return unavailable
	}
	data, ok := e.module.Memory().Read(uint32(ptr), uint32(length))
	if !ok || binary.LittleEndian.Uint32(data) != 1 {
		return unavailable
	}
	count := binary.LittleEndian.Uint32(data[8:])
	if count > 8 {
		return unavailable
	}
	result := &allocationDiagnosticReport{Status: "captured", Operation: binary.LittleEndian.Uint32(data[4:]),
		Total: binary.LittleEndian.Uint32(data[12:])}
	result.Truncated = result.Total > count
	for index := uint32(0); index < count; index++ {
		record := make(map[string]uint32, len(allocationDiagnosticFields))
		for field, name := range allocationDiagnosticFields {
			record[name] = binary.LittleEndian.Uint32(data[16+index*128+uint32(field)*4:])
		}
		result.Records = append(result.Records, record)
	}
	return result
}
