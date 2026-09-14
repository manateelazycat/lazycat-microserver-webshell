import { describeCellTuples, compareCellDescriptions, diagnosticCellLimit } from "../cell_diagnostics.js";

// One read-only native observation on the ordered Worker lane. Do not call
// update/getViewport/markClean/snapshot: observing must not repair a stale cache.
export function captureNativeRenderDiagnostics(native) {
  const capture = native?.exports?.ghostty_terminal_diagnostic_cells;
  if (!capture) return { status: "native_diagnostics_unavailable" };
  const cells = native.cols * native.rows;
  if (cells > diagnosticCellLimit) return { status: "cell_limit", cells, limit: diagnosticCellLimit };
  const words = 16 + cells * 8;
  const ptr = native.exports.ghostty_wasm_alloc_u8_array(words * 4);
  if (!ptr) return { status: "allocation_failed" };
  try {
    const count = capture(native.handle, ptr, words);
    if (count !== words) return { status: "native_read_failed", code: count };
    const data = new Uint32Array(native.memory.buffer, ptr, words);
    const [abi, cols, rows, x, y, top, bottom, left, right, pendingWrap, alternate, cachedCols, cachedRows, cacheValid] = data;
    if (abi !== 1) return { status: "unsupported_abi", abi };
    const raw = describeCellTuples(cols, rows, (index) => data.subarray(16 + index * 4, 20 + index * 4));
    const cached = cacheValid ? describeCellTuples(cols, rows,
      (index) => data.subarray(16 + cells * 4 + index * 4, 20 + cells * 4 + index * 4))
      : { status: "geometry_unavailable", cols: cachedCols, rows: cachedRows };
    return { status: "captured", raw, cached, rawVsCached: compareCellDescriptions(raw, cached),
      cursor: { x, y, pendingWrap: Boolean(pendingWrap) },
      scrollingRegion: { top, bottom, left, right, coordinateBase: 0 }, alternate: Boolean(alternate) };
  } finally {
    native.exports.ghostty_wasm_free_u8_array(ptr, words * 4);
  }
}
