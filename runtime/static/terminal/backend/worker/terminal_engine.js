import { packRows } from "../cell_packet.js";
import { loadCheckpointGhostty, restoreMemoryCheckpoint, validateMemoryCheckpoint } from "./memory_checkpoint.js";

const privateModes = [1, 6, 7, 9, 25, 47, 1000, 1002, 1003, 1004, 1005, 1006, 1007, 1015, 1016, 1047, 1049, 2004, 2026, 2027];
const ansiModes = [2, 4, 12, 20];
const encoder = new TextEncoder();

export function createTerminalEngine() {
  let native = null;
  let ghostty = null;
  let revision = 0;
  let historyEpoch = 0;
  let serial = 0;
  let previousGeneration = 0;
  let terminalConfig = {};

  const trackHistory = () => {
    const generation = native.getScrollbackGeneration();
    serial += (generation - previousGeneration) >>> 0;
    previousGeneration = generation;
  };
  const historyRange = (start, end) => {
    const length = native.getScrollbackLength();
    const base = serial - length;
    const first = Math.max(base, Math.floor(start));
    const last = Math.min(serial, Math.ceil(end));
    const lines = [];
    for (let row = first; row < last; row += 1) lines.push(native.getScrollbackLine(row - base));
    return { start: first, epoch: historyEpoch, packet: packRows(lines, native.cols) };
  };
  const snapshot = (viewportY = 0, includeFrame = true) => {
    native.update();
    const length = native.getScrollbackLength();
    const responses = [];
    let responseBytes = 0;
    while (native.hasResponse()) {
      const response = native.readResponse();
      if (!response) break;
      responses.push(response);
      responseBytes += response.length;
      if (responseBytes > 256 * 1024) throw new Error("Terminal response queue exceeded capacity");
    }
    const top = serial - Math.min(length, Math.max(0, Math.ceil(viewportY)));
    const frame = {
      terminalState: true,
      revision, historyEpoch, serial, scrollback: length,
      cols: native.cols, rows: native.rows,
      cursor: native.getCursor(), colors: native.getColors(),
      alternate: native.isAlternateScreen(), mouseTracking: native.hasMouseTracking(),
      modes: Object.fromEntries([
        ...privateModes.map((mode) => [`d${mode}`, native.getMode(mode, false)]),
        ...ansiModes.map((mode) => [`a${mode}`, native.getMode(mode, true)]),
      ]),
      responses,
    };
    if (includeFrame) {
      const cells = native.getViewport();
      if (!cells || cells.length < native.cols * native.rows) throw new Error("Terminal viewport is incomplete");
      const lines = Array.from({ length: native.rows }, (_, row) => cells.slice(row * native.cols, (row + 1) * native.cols));
      frame.wrapped = lines.map((_, row) => native.isRowWrapped(row));
      frame.viewport = packRows(lines, native.cols, (row, col) => native.getGraphemeString(row, col));
      frame.history = historyRange(top - 32, Math.min(serial, top + native.rows + 32));
    }
    native.markClean();
    return frame;
  };

  return Object.freeze({
    async init({ wasmURL, cols, rows, config }, timing = null) {
      terminalConfig = config || {};
      const startedAt = timing ? performance.now() : 0;
      ghostty = await loadCheckpointGhostty(wasmURL);
      const loadedAt = timing ? performance.now() : 0;
      native = ghostty.createTerminal(cols, rows, config);
      historyEpoch += 1;
      revision += 1;
      previousGeneration = native.getScrollbackGeneration();
      const createdAt = timing ? performance.now() : 0;
      const frame = snapshot();
      if (timing) Object.assign(timing, {
        wasmLoadMs: loadedAt - startedAt,
        engineCreateMs: createdAt - loadedAt,
        snapshotMs: performance.now() - createdAt,
      });
      return frame;
    },
    write({ data, viewportY, visible = true }, timing = null) {
      if (!native) throw new Error("Terminal backend is not initialized");
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      const writeStartSerial = serial;
      const parseStartedAt = timing ? performance.now() : 0;
      native.write(bytes);
      const parsedAt = timing ? performance.now() : 0;
      trackHistory();
      revision += 1;
      const result = { ...snapshot(viewportY, visible), writeStartSerial };
      if (timing) {
        timing.parseMs = parsedAt - parseStartedAt;
        timing.snapshotMs = performance.now() - parsedAt;
      }
      return result;
    },
    async restore({ checkpoint }) {
      validateMemoryCheckpoint(ghostty, checkpoint);
      const restoredGhostty = ghostty.newCheckpointInstance();
      const restored = restoredGhostty.createTerminal(checkpoint.cols, checkpoint.rows, { scrollbackLimit: checkpoint.scrollback_lines });
      await restoreMemoryCheckpoint(restoredGhostty, restored, checkpoint, terminalConfig);
      native.free();
      ghostty = restoredGhostty;
      native = restored;
      historyEpoch += 1;
      revision += 1;
      previousGeneration = native.getScrollbackGeneration();
      serial = native.getScrollbackLength();
      return snapshot();
    },
    resize({ cols, rows, viewportY }) {
      native.resize(cols, rows);
      trackHistory();
      historyEpoch += 1;
      revision += 1;
      return snapshot(viewportY);
    },
    read({ start, end, epoch }) {
      if (epoch !== historyEpoch) return { stale: true };
      if (end - start > 1024) throw new Error("Terminal history request exceeds capacity");
      return historyRange(start, end);
    },
    native: () => native,
    historyIdentity: () => ({ epoch: historyEpoch, base: serial - native.getScrollbackLength() }),
    snapshot,
    dispose() { native?.free(); native = ghostty = null; },
  });
}
