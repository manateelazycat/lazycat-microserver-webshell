import { Ghostty } from "../../../ghostty-web.js";

export const snapshotCheckpointProtocol = "ghostty-snapshot-v1";
const maxSnapshotBytes = 256 * 1024 * 1024;
const maxCompressedBytes = 16 * 1024 * 1024;
const renderDirtyFull = 2;

let checkpointWASMMismatchReported = false;

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
    // A restore starts from a fresh instance so linear memory grown by the
    // previous session is released with it.
    ghostty.newCheckpointInstance = instantiate;
    return ghostty;
  };
  return instantiate();
}

export function validateSnapshotCheckpoint(ghostty, checkpoint) {
  if (checkpoint?.protocol !== snapshotCheckpointProtocol)
    throw new Error("Terminal checkpoint protocol mismatch; update the terminal service protocol");
  // GHOSTSNP is portable across builds; a different hash is diagnostic only.
  if (checkpoint.wasm_sha256 !== ghostty.wasmSHA256 && !checkpointWASMMismatchReported) {
    checkpointWASMMismatchReported = true;
    // Let the page deduplicate warnings across panes and Worker restarts.
    globalThis.postMessage({
      type: "checkpoint-wasm-mismatch",
      browser: ghostty.wasmSHA256,
      checkpoint: checkpoint.wasm_sha256,
    });
  }
  const size = checkpoint.snapshot_bytes;
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxSnapshotBytes)
    throw new Error("Terminal checkpoint snapshot size is invalid");
  if (typeof checkpoint.snapshot_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(checkpoint.snapshot_sha256))
    throw new Error("Terminal checkpoint snapshot checksum is invalid");
  for (const key of ["cols", "rows", "scrollback_lines", "scrollback_bytes"])
    if (!Number.isSafeInteger(checkpoint[key]) || checkpoint[key] < 0) throw new Error(`Invalid checkpoint ${key}`);
  if (!checkpoint.cols || !checkpoint.rows || checkpoint.cols > 65535 || checkpoint.rows > 65535
    || checkpoint.scrollback_lines > 100000 || checkpoint.scrollback_bytes > 128 * 1024 * 1024)
    throw new Error("Terminal checkpoint geometry exceeds limits");
  if (!Array.isArray(checkpoint.chunks) || !checkpoint.chunks.length || checkpoint.chunks.length > 256)
    throw new Error("Terminal checkpoint chunks are invalid");
}

async function inflateSnapshot(checkpoint) {
  const size = checkpoint.snapshot_bytes;
  const chunks = checkpoint.chunks.map((part) => Uint8Array.from(atob(part), (c) => c.charCodeAt(0)));
  if (chunks.reduce((total, chunk) => total + chunk.byteLength, 0) > maxCompressedBytes)
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
  if (offset !== size || await digest(bytes) !== checkpoint.snapshot_sha256) throw new Error("Terminal checkpoint checksum mismatch");
  return bytes;
}

// Decode a GHOSTSNP snapshot into `native`, which must already have the
// checkpoint geometry. The wrapper handle stays valid; on failure the existing
// terminal state is left untouched.
export async function restoreSnapshotCheckpoint(ghostty, native, checkpoint, config = {}) {
  validateSnapshotCheckpoint(ghostty, checkpoint);
  const bytes = await inflateSnapshot(checkpoint);
  const exports = native.exports;
  if (typeof exports?.ghostty_terminal_snapshot_restore !== "function"
    || typeof exports.ghostty_terminal_checkpoint_theme !== "function" || !(native.memory instanceof WebAssembly.Memory))
    throw new Error("Incompatible terminal checkpoint wrapper ABI");
  if (native.cols !== checkpoint.cols || native.rows !== checkpoint.rows)
    throw new Error("Terminal checkpoint geometry does not match the restore target");
  const data = exports.ghostty_wasm_alloc_u8_array(bytes.byteLength) >>> 0;
  if (!data) throw new Error("Terminal checkpoint allocation failed");
  let restored = 0;
  try {
    new Uint8Array(native.memory.buffer, data, bytes.byteLength).set(bytes);
    restored = exports.ghostty_terminal_snapshot_restore(native.handle, data, bytes.byteLength, checkpoint.cols, checkpoint.rows);
  } finally { exports.ghostty_wasm_free_u8_array(data, bytes.byteLength); }
  if (restored !== 1) throw new Error("Terminal checkpoint snapshot could not be decoded");
  // The snapshot carries the server's explicit scrollback byte limit.
  native.logicalScrollbackLimit = checkpoint.scrollback_lines;
  native.scrollbackByteCapacity = checkpoint.scrollback_bytes;
  native.renderStateCurrent = false;
  native.renderDirtyState = renderDirtyFull;
  // Keep this browser's defaults while preserving program-set OSC overrides.
  const ptr = exports.ghostty_wasm_alloc_u8_array(80) >>> 0;
  if (!ptr) throw new Error("Terminal checkpoint theme allocation failed");
  try {
    const values = new DataView(native.memory.buffer, ptr, 80);
    values.setUint32(0, checkpoint.scrollback_bytes, true);
    [config.fgColor, config.bgColor, config.cursorColor, ...Array.from({ length: 16 }, (_, i) => config.palette?.[i])]
      .forEach((value, index) => values.setUint32(4 + index * 4, value || 0, true));
    exports.ghostty_terminal_checkpoint_theme(native.handle, ptr);
  } finally { exports.ghostty_wasm_free_u8_array(ptr, 80); }
}
