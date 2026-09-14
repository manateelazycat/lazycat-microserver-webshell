// Diagnostic-only tap: never replace bytes or invoke terminal operations.
const active = new WeakMap();
const encoder = new TextEncoder();
const limit = 256 * 1024;
const size = (data) => typeof data === "string" ? data.length : data?.byteLength || 0;
const bytesOf = (data) => typeof data === "string" ? encoder.encode(data) : data;
const describe = (bytes) => {
  let hash = 2166136261, cr = 0, lf = 0;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    if (byte === 13) cr += 1;
    if (byte === 10) lf += 1;
  }
  return { bytes: bytes.length, hash: hash.toString(16).padStart(8, "0"), cr, lf };
};
const byteClass = (byte) => byte === undefined ? "END" : byte === 13 ? "CR" : byte === 10 ? "LF"
  : byte === 27 ? "ESC" : byte === 9 ? "TAB" : byte < 32 ? `C0:${byte}` : byte < 127 ? "ASCII" : "HIGH";
const context = (bytes, at) => Array.from(bytes.subarray(Math.max(0, at - 8), at + 16), byteClass);
const buffers = (term) => ({ text: term.__kittyGraphics?.inputBuffer?.length || 0,
  control: term.__kittyGraphics?.terminalControlBuffer?.length || 0 });

export function observeParsedTerminalWrite(term, data) {
  const entry = active.get(term);
  if (!entry) return;
  try {
    if (!entry.isActive()) return;
    entry.parts += 1;
    if (entry.truncated || size(data) > limit) { entry.truncated = true; return; }
    const bytes = bytesOf(data);
    if (!(bytes instanceof Uint8Array) || entry.length + bytes.length > limit) { entry.truncated = true; return; }
    entry.chunks.push(bytes.slice());
    entry.length += bytes.length;
  } catch { entry.truncated = true; }
}

export function beginTerminalWriteComparison(term, data, isActive, complete) {
  if (!isActive()) return;
  // Overlap cannot be attributed safely; do not alter normal write ordering.
  const previous = active.get(term);
  if (previous) previous.overlap = true;
  const entry = { isActive, chunks: [], length: 0, parts: 0, overlap: Boolean(previous), truncated: size(data) > limit };
  let source = null;
  if (!entry.truncated) {
    const bytes = bytesOf(data);
    if (bytes instanceof Uint8Array && bytes.length <= limit) source = bytes.slice();
    else entry.truncated = true;
  }
  const before = buffers(term), startedAt = performance.now();
  const convertEol = term.options?.convertEol === true;
  active.set(term, entry);
  return (completed) => {
    if (active.get(term) === entry) active.delete(term);
    if (!isActive()) return;
    const metadata = { convertEol, completed, parserWrites: entry.parts, bufferBefore: before,
      bufferAfter: buffers(term), durationMs: performance.now() - startedAt, limit };
    if (entry.truncated || entry.overlap || !source) {
      complete({ ...metadata, comparable: false, reason: entry.overlap ? "overlapping_writes" : "capture_limit" });
      return;
    }
    const parsed = new Uint8Array(entry.length);
    let offset = 0;
    for (const chunk of entry.chunks) { parsed.set(chunk, offset); offset += chunk.length; }
    let first = 0;
    while (first < source.length && first < parsed.length && source[first] === parsed[first]) first += 1;
    const equal = first === source.length && first === parsed.length;
    let i = 0, j = 0, insertedCR = 0;
    while (i < source.length && j < parsed.length) {
      if (source[i] === 10 && parsed[j] === 13 && parsed[j + 1] === 10) { insertedCR += 1; j += 1; }
      if (source[i] !== parsed[j]) break;
      i += 1; j += 1;
    }
    complete({ ...metadata, comparable: true, source: describe(source), parser: describe(parsed), equal,
      onlyCRInsertedBeforeLF: !equal && i === source.length && j === parsed.length && insertedCR > 0,
      insertedCR, firstDifference: equal ? null : { offset: first,
        source: byteClass(source[first]), parser: byteClass(parsed[first]),
        sourceContext: context(source, first), parserContext: context(parsed, first) } });
  };
}
