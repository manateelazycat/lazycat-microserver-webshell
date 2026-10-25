export const compareTerminalSelectionCells = (left, right) => {
  if (!left || !right) {
    return 0;
  }
  if (left.absoluteRow !== right.absoluteRow) {
    return left.absoluteRow - right.absoluteRow;
  }
  return left.col - right.col;
};

export const normalizeTerminalSelectionCells = (start, end) => {
  if (!start || !end) {
    return null;
  }
  return compareTerminalSelectionCells(start, end) <= 0
    ? { start, end }
    : { start: end, end: start };
};

export const previousTerminalSelectionCell = (cols, cell) => {
  const width = Math.max(1, Math.floor(Number(cols) || 1));
  if (!cell) {
    return null;
  }
  if (cell.col > 0) {
    return { col: cell.col - 1, absoluteRow: cell.absoluteRow };
  }
  return { col: width - 1, absoluteRow: Math.max(0, cell.absoluteRow - 1) };
};

export const nextTerminalSelectionCell = (cols, cell) => {
  const width = Math.max(1, Math.floor(Number(cols) || 1));
  if (!cell) {
    return null;
  }
  if (cell.col < width - 1) {
    return { col: cell.col + 1, absoluteRow: cell.absoluteRow };
  }
  return { col: 0, absoluteRow: cell.absoluteRow + 1 };
};

export const terminalSelectionRange = (manager) => {
  if (!manager?.selectionStart || !manager?.selectionEnd) {
    return null;
  }
  let startCol = Number(manager.selectionStart.col);
  let startRow = Number(manager.selectionStart.absoluteRow);
  let endCol = Number(manager.selectionEnd.col);
  let endRow = Number(manager.selectionEnd.absoluteRow);
  if (![startCol, startRow, endCol, endRow].every(Number.isFinite)) {
    return null;
  }
  startCol = Math.max(0, Math.floor(startCol));
  startRow = Math.max(0, Math.floor(startRow));
  endCol = Math.max(0, Math.floor(endCol));
  endRow = Math.max(0, Math.floor(endRow));
  if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
    [startCol, endCol] = [endCol, startCol];
    [startRow, endRow] = [endRow, startRow];
  }
  return { startCol, startRow, endCol, endRow };
};

const terminalSelectionLineAt = (manager, absoluteRow, scrollback) => {
  if (!manager?.wasmTerm || absoluteRow < 0) {
    return null;
  }
  return absoluteRow < scrollback
    ? manager.wasmTerm.getScrollbackLine?.(absoluteRow) || null
    : manager.wasmTerm.getLine?.(absoluteRow - scrollback) || null;
};

const terminalSelectionCodepointText = (codepoint) => {
  const value = Number(codepoint || 0);
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return "";
  }
  return String.fromCodePoint(value);
};

const terminalSelectionCellText = (manager, cell, absoluteRow, column, scrollback) => {
  if (!cell) {
    return { text: " ", content: false };
  }
  if (Number(cell?.width ?? 1) === 0) {
    return { text: "", content: false };
  }
  if (!cell.codepoint) {
    return { text: " ", content: false };
  }
  const text = typeof cell.text === "string" ? cell.text : cell.grapheme_len > 0
    ? (absoluteRow < scrollback
      ? manager.wasmTerm?.getScrollbackGraphemeString?.(absoluteRow, column)
      : manager.wasmTerm?.getGraphemeString?.(absoluteRow - scrollback, column))
    : terminalSelectionCodepointText(cell.codepoint);
  if (!text) {
    return { text: " ", content: false };
  }
  return { text, content: Boolean(text.trim()) };
};

// Work only around the touched logical line. Never scan the full scrollback
// or infer a soft wrap from a visually full row (TUI columns may be unrelated).
export const terminalTouchStringRange = (term, point) => {
  const manager = term?.selectionManager;
  const backend = manager?.wasmTerm;
  if (!backend || !point || !Number.isInteger(point.absoluteRow) || !Number.isInteger(point.col)) return null;
  const scrollback = Math.max(0, Math.floor(backend.getScrollbackLength?.() || 0));
  const rows = Math.max(0, Number(term.rows) || 0);
  const rowCache = new Map();
  const rowAt = (row) => {
    if (rowCache.has(row)) return rowCache.get(row);
    const line = terminalSelectionLineAt(manager, row, scrollback);
    if (!line) return null;
    const glyphs = [];
    const columns = Math.min(line.length, Number(term.cols) || line.length);
    for (let col = 0; col < columns; col += 1) {
      const cell = line[col];
      if (cell?.width === 0) continue;
      const { text } = terminalSelectionCellText(manager, cell, row, col, scrollback);
      glyphs.push({
        text,
        padding: !cell?.codepoint,
        start: { col, absoluteRow: row },
        end: { col: Math.min(columns - 1, col + Math.max(1, Number(cell?.width) || 1) - 1), absoluteRow: row },
      });
    }
    rowCache.set(row, glyphs);
    return glyphs;
  };
  const wrapped = (row) => row >= scrollback && row < scrollback + rows
    && backend.isRowWrapped?.(row - scrollback) === true;
  const touchedRow = rowAt(point.absoluteRow);
  if (!touchedRow) return null;
  const target = touchedRow.find((glyph) => point.col >= glyph.start.col && point.col <= glyph.end.col);
  if (!target) return null;

  let first = point.absoluteRow;
  let last = first;
  let count = touchedRow.length;
  while (first > scrollback && last - first < 31 && count < 8192 && wrapped(first - 1)) {
    const previous = rowAt(first - 1);
    if (!previous || count + previous.length > 8192) break;
    first -= 1;
    count += previous.length;
  }
  while (last - first < 31 && count < 8192 && wrapped(last) && last + 1 < scrollback + rows) {
    const next = rowAt(last + 1);
    if (!next || count + next.length > 8192) break;
    last += 1;
    count += next.length;
  }
  const glyphs = [];
  for (let row = first; row <= last; row += 1) {
    const line = rowAt(row) || [];
    let length = line.length;
    // A wide glyph may wrap with an unused final cell. Real spaces stay boundaries.
    if (wrapped(row)) while (length > 0 && line[length - 1].padding && line[length - 1] !== target) length -= 1;
    glyphs.push(...line.slice(0, length));
  }
  const index = glyphs.indexOf(target);
  if (index < 0) return null;
  const boundaryAt = (position) => {
    const text = glyphs[position]?.text || "";
    if (!text || /[\s，。！？；：、…“”‘（）【】《》「」『』〈〉\[\]{}()<>"`,;!|\u2500-\u259f]/u.test(text)) return true;
    if (/^[’']$/u.test(text)) {
      return !/\p{L}/u.test(glyphs[position - 1]?.text || "")
        || !/\p{L}/u.test(glyphs[position + 1]?.text || "");
    }
    return false;
  };
  if (boundaryAt(index)) return { start: target.start, end: target.end };
  let start = index;
  let end = index;
  while (start > 0 && !boundaryAt(start - 1)) start -= 1;
  while (end + 1 < glyphs.length && !boundaryAt(end + 1)) end += 1;
  const token = glyphs.slice(start, end + 1).map((glyph) => glyph.text).join("");
  if (/\p{Script=Han}/u.test(token) && !/[\\/]/u.test(token)) {
    const chineseBoundaryAt = (position) => {
      const text = glyphs[position].text;
      const before = glyphs[position - 1]?.text || "";
      const after = glyphs[position + 1]?.text || "";
      if (text === "?") return true;
      if (text === ":") return !/\d/u.test(before) || !/\d/u.test(after);
      if (text === ".") return !/[a-z\d]/i.test(before) || !/[a-z\d]/i.test(after);
      return false;
    };
    let left = index;
    let right = index;
    if (chineseBoundaryAt(index)) return { start: target.start, end: target.end };
    while (left > start && !chineseBoundaryAt(left - 1)) left -= 1;
    while (right < end && !chineseBoundaryAt(right + 1)) right += 1;
    start = left;
    end = right;
  }
  // Keep URL/path punctuation inside a token, excluding sentence punctuation after it.
  while (end > index && /^[.:?]$/u.test(glyphs[end].text)) end -= 1;
  return { start: glyphs[start].start, end: glyphs[end].end };
};

export const extendTerminalSelectionCells = (range, cell) => ({
  start: compareTerminalSelectionCells(cell, range.start) < 0 ? cell : range.start,
  end: compareTerminalSelectionCells(cell, range.end) > 0 ? cell : range.end,
});

export const terminalSelectionText = (manager) => {
  const range = terminalSelectionRange(manager);
  if (!range || !manager?.wasmTerm) {
    return "";
  }
  const scrollback = Math.max(0, Math.floor(manager.wasmTerm.getScrollbackLength?.() || 0));
  let text = "";
  for (let absoluteRow = range.startRow; absoluteRow <= range.endRow; absoluteRow += 1) {
    const line = terminalSelectionLineAt(manager, absoluteRow, scrollback);
    if (!line) {
      continue;
    }
    const startCol = absoluteRow === range.startRow ? range.startCol : 0;
    const endCol = absoluteRow === range.endRow ? range.endCol : Math.max(0, line.length - 1);
    let lineText = "";
    let lastContentLength = -1;
    for (let column = startCol; column <= endCol; column += 1) {
      const cellText = terminalSelectionCellText(manager, line[column], absoluteRow, column, scrollback);
      lineText += cellText.text;
      if (cellText.content) {
        lastContentLength = lineText.length;
      }
    }
    lineText = lastContentLength >= 0 ? lineText.substring(0, lastContentLength) : "";
    text += lineText;
    if (absoluteRow < range.endRow) {
      text += "\n";
    }
  }
  return text;
};

export const currentTerminalSelectionCells = (session) => {
  const manager = session?.term?.selectionManager;
  if (!manager?.selectionStart || !manager?.selectionEnd) {
    return null;
  }
  return normalizeTerminalSelectionCells(
    { col: manager.selectionStart.col, absoluteRow: manager.selectionStart.absoluteRow },
    { col: manager.selectionEnd.col, absoluteRow: manager.selectionEnd.absoluteRow },
  );
};

export const terminalSelectionContainsCell = (selection, cell) => {
  if (!selection || !cell) {
    return false;
  }
  if (cell.absoluteRow < selection.start.absoluteRow || cell.absoluteRow > selection.end.absoluteRow) {
    return false;
  }
  if (selection.start.absoluteRow === selection.end.absoluteRow) {
    return cell.col >= selection.start.col && cell.col <= selection.end.col;
  }
  if (cell.absoluteRow === selection.start.absoluteRow) {
    return cell.col >= selection.start.col;
  }
  if (cell.absoluteRow === selection.end.absoluteRow) {
    return cell.col <= selection.end.col;
  }
  return true;
};
