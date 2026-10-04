const fields = ["stage", "caller", "retry", "reason", "source_bytes", "target_bytes", "source_string_bytes", "target_string_bytes",
  "source_cols", "source_rows", "target_cols", "target_rows", "uri_bytes", "id_bytes", "uri_offset", "id_offset",
  "metadata_valid", "styles", "grapheme_bytes", "hyperlink_bytes", "request_bytes", "chunk_bytes", "request_chunks", "bitmap_words",
  "free_chunks", "largest_free_run", "bitmap_offset", "chunks_offset"];

// Fixed numeric ABI, read after the failed native call. Never calls a parser,
// redraws, retries or allocates inside WASM while observing the error.
export function readAllocationDiagnostics(native, operation) {
  try {
    const ptr = native?.exports?.ghostty_terminal_allocation_diagnostics_ptr?.();
    const length = native?.exports?.ghostty_terminal_allocation_diagnostics_len?.();
    if (!ptr || length !== (4 + 8 * 32) * 4) return { status: "unavailable" };
    const words = new Uint32Array(native.memory.buffer, ptr, length / 4);
    if (words[0] !== 1 || words[2] > 8) return { status: "invalid_abi" };
    const errorPtr = native.exports[`ghostty_terminal_${operation}_error_ptr`]?.();
    const errorLen = native.exports[`ghostty_terminal_${operation}_error_len`]?.();
    const lastNativeError = errorPtr && Number.isInteger(errorLen) && errorLen <= 256
      ? new TextDecoder().decode(new Uint8Array(native.memory.buffer, errorPtr, errorLen)) : "unavailable";
    return { status: "captured", operation: words[1], last_native_error: lastNativeError,
      total_observations: words[3], truncated: words[3] > words[2],
      records: Array.from({ length: words[2] }, (_, index) => Object.fromEntries(fields.map((name, field) => [name, words[4 + index * 32 + field]]))) };
  } catch { return { status: "unavailable" }; }
}
