// Text queries execute beside the native history, never copy all cells to UI.
export function queryTerminalText(native, type, { query = "", range = null, row: targetRow = -1, col: targetCol = -1 } = {}) {
  const scrollback = native.getScrollbackLength();
  const total = scrollback + native.rows;
  const viewport = native.getViewport();
  const matches = [];
  const parts = [];
  const needle = String(query).toLowerCase();
  let text = "";
  let positions = [];
  let outputLength = 0;
  let link = null;
  let linkScanned = false;
  const finishLine = () => {
    if (type === "link") {
      const index = positions.findIndex((position) => position.row === targetRow && position.col === targetCol);
      if (index >= 0) {
        linkScanned = true;
        const pattern = /(?:https?:\/\/|mailto:|ftp:\/\/|ssh:\/\/|git:\/\/|tel:|magnet:|gemini:\/\/|gopher:\/\/|news:)[\w\-.~:\/?#@!$&*+,;=%]+/gi;
        for (const match of text.matchAll(pattern)) {
          const url = match[0].replace(/[.,;!?)\]]+$/, "");
          if (index >= match.index && index < match.index + url.length) {
            link = { url, start: positions[match.index], end: positions[match.index + url.length - 1] };
            break;
          }
        }
      }
    } else if (type === "search") {
      const lower = text.toLowerCase();
      for (let offset = lower.indexOf(needle); needle && offset >= 0; offset = lower.indexOf(needle, offset + needle.length)) {
        const position = positions[offset];
        if (position) matches.push({ ...position, length: String(query).length });
        if (matches.length > 100000) throw Object.assign(new Error("Too many search matches"), { code: "TOO_MANY_MATCHES" });
      }
    } else {
      parts.push(text.trimEnd());
      outputLength += text.length + 1;
      if (outputLength > 32 * 1024 * 1024) throw Object.assign(new Error("Terminal text exceeds export capacity"), { code: "TEXT_TOO_LARGE" });
    }
    text = "";
    positions = [];
  };
  const first = Math.max(0, range?.startRow ?? 0);
  const last = Math.min(total - 1, range?.endRow ?? total - 1);
  for (let row = first; row <= last; row += 1) {
    const line = row < scrollback ? native.getScrollbackLine(row) : viewport.slice((row - scrollback) * native.cols, (row - scrollback + 1) * native.cols);
    if (!line) throw new Error("Terminal history changed during text query");
    const startCol = row === first ? range?.startCol ?? 0 : 0;
    const endCol = row === last ? range?.endCol ?? native.cols - 1 : native.cols - 1;
    let rowText = "";
    const rowPositions = [];
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = line[col];
      if (cell?.width === 0) continue;
      const value = cell?.text ?? (cell?.grapheme_len ? native.getGraphemeString(row - scrollback, col) : String.fromCodePoint(cell?.codepoint || 32));
      rowText += value;
      if (type === "search" || type === "link") for (let index = 0; index < value.length; index += 1) rowPositions.push({ row, col });
    }
    const wrapped = !range && (row < scrollback ? rowText.trimEnd().length >= native.cols : native.isRowWrapped(row - scrollback));
    if (!wrapped) rowText = rowText.trimEnd();
    text += rowText;
    if (type === "search" || type === "link") for (const position of rowPositions.slice(0, rowText.length)) positions.push(position);
    if (!wrapped) finishLine();
    if (linkScanned || (type === "link" && row > targetRow && !wrapped)) break;
    if (text.length > 32 * 1024 * 1024) throw new Error("Terminal logical line exceeds query capacity");
  }
  if (text) finishLine();
  return type === "link" ? link : type === "search" ? matches : parts.join("\n");
}
