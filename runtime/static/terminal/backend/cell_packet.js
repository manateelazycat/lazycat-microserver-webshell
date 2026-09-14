// Compact transferable rows. Complex graphemes are sparse side data.
export function packRows(lines, columns, getText = null) {
  const bytes = new Uint8Array(lines.length * columns * 16);
  const view = new DataView(bytes.buffer);
  const texts = [];
  for (let row = 0; row < lines.length; row += 1) {
    if (!lines[row]) throw new Error("Terminal row is unavailable");
    for (let col = 0; col < columns; col += 1) {
      const cell = lines[row][col];
      const index = row * columns + col;
      const offset = index * 16;
      view.setUint32(offset, cell?.codepoint || 0, true);
      bytes[offset + 4] = cell?.fg_r || 0;
      bytes[offset + 5] = cell?.fg_g || 0;
      bytes[offset + 6] = cell?.fg_b || 0;
      bytes[offset + 7] = cell?.bg_r || 0;
      bytes[offset + 8] = cell?.bg_g || 0;
      bytes[offset + 9] = cell?.bg_b || 0;
      bytes[offset + 10] = cell?.flags || 0;
      bytes[offset + 11] = cell?.width ?? 1;
      view.setUint16(offset + 12, cell?.hyperlink_id || 0, true);
      bytes[offset + 14] = cell?.grapheme_len || 0;
      if (cell?.grapheme_len) texts.push([index, cell.text || getText?.(row, col) || " "]);
    }
  }
  return { bytes, texts, columns, rows: lines.length };
}

export function unpackRows(packet) {
  const { bytes, columns, rows } = packet;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== columns * rows * 16) throw new Error("Invalid terminal cell packet");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const texts = new Map(packet.texts);
  return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => {
    const index = row * columns + col;
    const offset = index * 16;
    const codepoint = view.getUint32(offset, true);
    return {
      codepoint,
      fg_r: bytes[offset + 4], fg_g: bytes[offset + 5], fg_b: bytes[offset + 6],
      bg_r: bytes[offset + 7], bg_g: bytes[offset + 8], bg_b: bytes[offset + 9],
      flags: bytes[offset + 10], width: bytes[offset + 11],
      hyperlink_id: view.getUint16(offset + 12, true), grapheme_len: bytes[offset + 14],
      text: texts.get(index) ?? String.fromCodePoint(codepoint || 32),
    };
  }));
}
