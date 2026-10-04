package serverlog

// NewWriter preserves the process-wide diagnostics stream without exposing
// its hub or subscriber state to terminal and Provider modules.
func NewWriter(source string) *Writer { return &Writer{hub: processServerLogHub, source: source} }
