const seed = 2166136261;
const mix = (hash, value) => Math.imul(hash ^ value, 16777619) >>> 0;
const hex = (value) => value.toString(16).padStart(8, "0");
export const diagnosticCellLimit = 50000;

// No terminal strings leave this module. Hashes are comparison hints, not a
// cryptographic proof. Shapes describe columns, including wide-cell spacers.
export function describeCellTuples(cols, rows, tupleAt) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1
    || cols * rows > diagnosticCellLimit) return { status: "cell_limit", cols, rows, limit: diagnosticCellLimit };
  const lines = [];
  for (let row = 0; row < rows; row += 1) {
    let hash = seed, nonSpace = 0, wide = 0, continuation = 0, graphemes = 0, shape = "", available = true;
    for (let col = 0; col < cols; col += 1) {
      const tuple = tupleAt(row * cols + col);
      if (!tuple) { available = false; break; }
      const [cp, width, extra] = tuple;
      for (const value of tuple) hash = mix(hash, value);
      const occupied = (cp > 32 && cp !== 160) || extra > 0;
      if (occupied) nonSpace += 1;
      if (width === 2) wide += 1;
      if (width === 0) continuation += 1;
      if (extra) graphemes += 1;
      shape += width === 0 ? "_" : width === 2 ? "W" : extra ? "g" : !occupied ? "." : cp > 127 ? "u" : "a";
    }
    lines.push({ row, available, ...(available ? { hash: hex(hash), nonSpace, wide, continuation, graphemes, shape } : {}) });
  }
  return { status: "captured", cols, rows, hashAlgorithm: "fnv1a-u32-v1", lines };
}

export function describeCells(cells, cols, rows) {
  return describeCellTuples(cols, rows, (index) => {
    const cell = cells?.[index];
    if (!cell) return null;
    let extraHash = seed;
    if (cell.grapheme_len) {
      if (typeof cell.text !== "string") return null;
      for (const cp of Array.from(cell.text).slice(1)) extraHash = mix(extraHash, cp.codePointAt(0));
    }
    return [cell.codepoint || 0, cell.width ?? 1, cell.grapheme_len || 0, extraHash];
  });
}

export function compareCellDescriptions(left, right) {
  if (left?.status !== "captured" || right?.status !== "captured") return { comparable: false, reason: "unavailable" };
  if (left.cols !== right.cols || left.rows !== right.rows) return { comparable: false, reason: "geometry_changed" };
  const differentRows = [], unavailableRows = [];
  for (let row = 0; row < left.rows; row += 1) {
    const a = left.lines[row], b = right.lines[row];
    if (!a?.available || !b?.available) unavailableRows.push(row);
    else if (a.hash !== b.hash) differentRows.push(row);
  }
  return { comparable: unavailableRows.length === 0, differentRows, unavailableRows };
}
