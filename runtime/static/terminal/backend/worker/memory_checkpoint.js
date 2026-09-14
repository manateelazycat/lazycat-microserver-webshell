import { Ghostty } from "../../../ghostty-web.js";

const digest = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function loadCheckpointGhostty(wasmURL) {
  const response = await fetch(wasmURL);
  if (!response.ok) throw new Error(`Ghostty WASM load failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  const hash = await digest(bytes);
  const instantiate = () => {
    const ghostty = new Ghostty(new WebAssembly.Instance(module, { env: { log() {} } }));
    ghostty.wasmSHA256 = hash;
    ghostty.newCheckpointInstance = instantiate;
    return ghostty;
  };
  return instantiate();
}

export function validateMemoryCheckpoint(ghostty, checkpoint) {
  if (checkpoint?.protocol !== "ghostty-memory-v1" || checkpoint.wasm_sha256 !== ghostty.wasmSHA256)
    throw new Error("Terminal checkpoint WASM version mismatch; update the terminal service protocol");
  const size = checkpoint.memory_bytes;
  if (!Number.isSafeInteger(size) || size < 65536 || size > 256 * 1024 * 1024 || size % 65536 !== 0)
    throw new Error("Terminal checkpoint memory size is invalid");
  for (const key of ["handle", "stack", "cols", "rows", "scrollback_lines", "scrollback_bytes"])
    if (!Number.isSafeInteger(checkpoint[key]) || checkpoint[key] < 0) throw new Error(`Invalid checkpoint ${key}`);
  if (!checkpoint.cols || !checkpoint.rows || checkpoint.cols > 65535 || checkpoint.rows > 65535
    || checkpoint.scrollback_lines > 100000 || checkpoint.scrollback_bytes > 128 * 1024 * 1024)
    throw new Error("Terminal checkpoint geometry exceeds limits");
  if (!Array.isArray(checkpoint.chunks) || !checkpoint.chunks.length || checkpoint.chunks.length > 256)
    throw new Error("Terminal checkpoint chunks are invalid");
}

export async function restoreMemoryCheckpoint(ghostty, native, checkpoint, config = {}) {
  validateMemoryCheckpoint(ghostty, checkpoint);
  const size = checkpoint.memory_bytes;
  const chunks = checkpoint.chunks.map((part) => Uint8Array.from(atob(part), (c) => c.charCodeAt(0)));
  if (chunks.reduce((total, chunk) => total + chunk.byteLength, 0) > 16 * 1024 * 1024)
    throw new Error("Terminal checkpoint compressed data exceeds limit");
  const reader = new Blob(chunks).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > size) throw new Error("Terminal checkpoint expands beyond its declared size");
      bytes.set(value, offset); offset += value.byteLength;
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (offset !== size || await digest(bytes) !== checkpoint.memory_sha256) throw new Error("Terminal checkpoint checksum mismatch");
  // This bridge is intentionally bound to the pinned WASM + wrapper ABI. The
  // Worker owns the only terminal in this module; no UI key encoder shares it.
  const stack = native.exports?.__webshell_checkpoint_stack;
  if (!(stack instanceof WebAssembly.Global) || !(native.memory instanceof WebAssembly.Memory)
    || typeof native.initCellPool !== "function" || size < native.memory.buffer.byteLength
    || checkpoint.handle <= 0 || checkpoint.handle >= size || checkpoint.stack >= size)
    throw new Error("Incompatible terminal checkpoint wrapper ABI");
  const pages = (size - native.memory.buffer.byteLength) / 65536;
  if (pages > 0) native.memory.grow(pages);
  new Uint8Array(native.memory.buffer).set(bytes);
  stack.value = checkpoint.stack;
  native.handle = checkpoint.handle;
  native._cols = checkpoint.cols;
  native._rows = checkpoint.rows;
  native.logicalScrollbackLimit = checkpoint.scrollback_lines;
  native.scrollbackByteCapacity = checkpoint.scrollback_bytes;
  native.inputBufferPtr = native.inputBufferSize = 0;
  native.viewportBufferPtr = native.viewportBufferSize = native.graphemeBufferPtr = 0;
  native.graphemeBuffer = null;
  native.renderStateCurrent = false;
  native.renderDirtyState = 2;
  native.cellPool = [];
  native.initCellPool();
  // Keep this browser's defaults while preserving program-set OSC overrides.
  const setTheme = native.exports.ghostty_terminal_checkpoint_theme;
  if (typeof setTheme !== "function") throw new Error("Terminal checkpoint theme ABI unavailable");
  const ptr = native.exports.ghostty_wasm_alloc_u8_array(80);
  if (!ptr) throw new Error("Terminal checkpoint theme allocation failed");
  try {
    const values = new DataView(native.memory.buffer, ptr, 80);
    values.setUint32(0, checkpoint.scrollback_bytes, true);
    [config.fgColor, config.bgColor, config.cursorColor, ...Array.from({ length: 16 }, (_, i) => config.palette?.[i])]
      .forEach((value, index) => values.setUint32(4 + index * 4, value || 0, true));
    setTheme(native.handle, ptr);
  } finally { native.exports.ghostty_wasm_free_u8_array(ptr, 80); }
}
