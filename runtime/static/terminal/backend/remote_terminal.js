import { unpackRows } from "./cell_packet.js";

const cancelled = () => Object.assign(new Error("Terminal backend generation changed"), { code: "BACKEND_CANCELLED" });

export class RemoteTerminal {
  constructor({ workerFactory, wasmURL, cols, rows, config, onChange, onError, viewport, visible, onDispose, diagnosticsEnabled, onDiagnostic }) {
    Object.assign(this, { workerFactory, wasmURL, cols, rows, config, onChange, onError, viewport, visible, onDispose, diagnosticsEnabled, onDiagnostic });
    this.isRemote = true;
    this.generation = 0;
    this.nextID = 1;
    this.pending = new Map();
    this.history = new Map();
    this.reads = new Map();
    this.responses = [];
    this.pendingBytes = 0;
    this.disposed = false;
    this.restart(config);
  }
  diagnostic(event, details = {}) {
    if (!this.diagnosticsEnabled?.()) return;
    // Diagnostics must never change RPC completion or failure handling.
    try {
      this.onDiagnostic?.(event, {
        eventAt: performance.now(), workerGeneration: this.generation,
        pendingRequests: this.pending.size, pendingBytes: this.pendingBytes,
        cols: this.cols, rows: this.rows, ...details,
      });
    } catch {}
  }
  restart(config = this.config) {
    if (this.disposed) throw cancelled();
    if (this.worker) this.diagnostic("backend_restart", { reason: "terminal_reset" });
    this.worker?.terminate();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(cancelled()); }
    this.pending.clear();
    this.pendingBytes = 0;
    this.generation += 1;
    this.config = config;
    this.failed = false;
    this.checkpointRestorePending = false;
    this.frame = null;
    this.lines = null;
    this.viewportCells = null;
    this.viewportRevision = -1;
    this.snapshotPending = null;
    this.history.clear();
    this.reads.clear();
    this.responses = [];
    const generation = this.generation;
    try { this.worker = this.workerFactory(); }
    catch (error) { this.failed = true; this.onError?.(error); throw error; }
    this.diagnostic("backend_created");
    this.worker.onmessage = ({ data }) => {
      if (generation !== this.generation || this.disposed) return;
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      this.pendingBytes -= pending.bytes;
      clearTimeout(pending.timer);
      const replyAt = pending.startedAt !== null ? performance.now() : 0;
      const completeDiagnostic = (extra = {}) => {
        if (pending.startedAt !== null) {
          this.diagnostic("backend_rpc_complete", {
            requestID: data.id, operation: pending.type, roundTripMs: replyAt - pending.startedAt,
            bytes: pending.bytes, requestCopyMs: pending.requestCopyMs, postMessageMs: pending.postMessageMs,
            ...data.timing, ...extra, error: data.error || extra.error || "",
          });
        }
      };
      if (data.error) {
        completeDiagnostic();
        const error = new Error(data.error);
        error.code = data.fatal ? "BACKEND_FAILURE" : data.code;
        pending.reject(error);
        if (data.fatal) this.fail(error);
        return;
      }
      try {
        const frameTiming = pending.startedAt !== null ? {} : null;
        const acceptAt = frameTiming ? performance.now() : 0;
        if (data.result?.terminalState) this.acceptFrame(data.result, frameTiming);
        if (frameTiming) completeDiagnostic({ ...frameTiming,
          frameAcceptMs: performance.now() - acceptAt, rpcTotalMs: performance.now() - pending.startedAt });
        pending.resolve(data.result);
      } catch (error) { completeDiagnostic({ error: error.message }); pending.reject(error); this.fail(error); }
    };
    this.worker.onerror = (event) => {
      if (generation !== this.generation || this.disposed) return;
      event.preventDefault?.();
      this.fail(new Error(event.message || "Terminal backend worker failed"));
    };
    this.worker.onmessageerror = () => {
      if (generation === this.generation && !this.disposed) this.fail(new Error("Terminal backend message could not be decoded"));
    };
    this.ready = this.request("init", { wasmURL: this.wasmURL, cols: this.cols, rows: this.rows, config });
    return this.ready;
  }
  fail(error) {
    if (this.failed || this.disposed) return;
    this.failed = true;
    error.code ||= "BACKEND_FAILURE";
    this.diagnostic("backend_failed", { error: error.message });
    this.worker?.terminate();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.pendingBytes = 0;
    this.onError?.(error);
  }
  request(type, payload = {}) {
    const promise = new Promise((resolve, reject) => {
      if (this.disposed || this.failed) { reject(cancelled()); return; }
      const bytes = payload.data?.byteLength ?? (typeof payload.data === "string" ? payload.data.length * 2 : 0);
      if (this.pending.size >= 64 || this.pendingBytes + bytes > 4 * 1024 * 1024) {
        const error = new Error("Terminal backend queue exceeded capacity");
        reject(error);
        this.fail(error);
        return;
      }
      const id = this.nextID++;
      const timeout = type === "init" ? 20000 : 15000;
      let deadline = performance.now() + timeout;
      const checkTimeout = () => {
        const pending = this.pending.get(id);
        if (!pending) return;
        if (globalThis.document?.hidden || performance.now() - deadline > 2000) {
          // A suspended UI cannot observe timely worker replies. Start a fresh
          // observation window instead of killing a healthy backend on resume.
          deadline = performance.now() + timeout;
          pending.timer = setTimeout(checkTimeout, timeout);
          return;
        }
        this.fail(new Error(`Terminal backend ${type} timed out`));
      };
      const timer = setTimeout(checkTimeout, timeout);
      const measured = this.diagnosticsEnabled?.() === true && ["init", "resize", "snapshot", "write", "restore"].includes(type);
      const startedAt = measured ? performance.now() : null;
      const pending = { resolve, reject, timer, bytes, type, startedAt };
      this.pending.set(id, pending);
      this.pendingBytes += bytes;
      if (measured) this.diagnostic("backend_rpc_start", { requestID: id, operation: type, bytes });
      try {
        // The UI output/history owners retain their own bytes until confirmed.
        const transfers = [];
        const copyAt = measured ? performance.now() : 0;
        if (payload.data instanceof Uint8Array) {
          payload = { ...payload, data: payload.data.slice() };
          transfers.push(payload.data.buffer);
        }
        const postAt = measured ? performance.now() : 0;
        if (measured) pending.requestCopyMs = postAt - copyAt;
        this.worker.postMessage({ id, type, payload, ...(measured ? { diagnostics: true } : {}) }, transfers);
        if (measured) pending.postMessageMs = performance.now() - postAt;
      } catch (error) { this.fail(error); }
    });
    // Some initialization/clear callers intentionally enqueue without awaiting.
    // Failures are still reported through the backend's single error path.
    promise.catch(() => {});
    return promise;
  }
  acceptFrame(frame, timing = null) {
    const unpackAt = timing ? performance.now() : 0;
    if (this.frame && frame.revision < this.frame.revision) return;
    if (frame.viewport && (frame.viewport.columns !== frame.cols || frame.viewport.rows !== frame.rows)) throw new Error("Terminal frame geometry mismatch");
    if (this.frame?.historyEpoch !== frame.historyEpoch) this.history.clear();
    if (frame.viewport) {
      this.lines = unpackRows(frame.viewport);
      this.viewportCells = this.lines.flat();
      this.viewportRevision = frame.revision;
    }
    this.cols = frame.cols;
    this.rows = frame.rows;
    this.frame = frame;
    this.responses.push(...frame.responses);
    this.acceptHistory(frame.history);
    if (timing) timing.frameUnpackMs = performance.now() - unpackAt;
    this.dirty = true;
    this.onChange?.();
  }
  acceptHistory(range) {
    if (!range?.packet || range.epoch !== this.frame?.historyEpoch) return;
    const rows = unpackRows(range.packet);
    for (let index = 0; index < rows.length; index += 1) {
      const key = range.start + index;
      this.history.delete(key);
      this.history.set(key, rows[index]);
    }
    const base = this.frame.serial - this.frame.scrollback;
    for (const key of this.history.keys()) if (key < base) this.history.delete(key);
    while (this.history.size > Math.max(512, this.rows * 4)) this.history.delete(this.history.keys().next().value);
  }
  get isReady() { return Boolean(this.frame && !this.failed && !this.disposed && !this.checkpointRestorePending); }
  get isFrameReady() { return this.isReady && this.viewportRevision === this.frame.revision && Boolean(this.viewportCells); }
  get isPending() { return this.pending.size > 0; }
  // Read cached UI data only: diagnostics must not fetch a frame or repair it.
  getRenderDiagnostics(viewportY = 0) {
    const frame = this.frame;
    const offset = Math.max(0, Math.min(frame?.scrollback || 0, Math.floor(viewportY || 0)));
    const rowStep = Math.max(1, Math.ceil(this.rows / 256));
    const colStep = Math.max(1, Math.ceil(this.cols * Math.min(this.rows, 256) / 50000));
    const rows = [];
    const background = frame?.colors?.background;
    for (let row = 0; frame && row < this.rows; row += rowStep) {
      const cells = row < offset ? this.history.get(frame.serial - offset + row) : this.lines?.[row - offset];
      if (!cells) { rows.push({ row, available: false }); continue; }
      let nonSpace = 0, visibleGlyphs = 0, coloredBackground = 0, sampledCells = 0;
      for (let col = 0; col < this.cols; col += colStep) {
        const cell = cells[col];
        if (!cell) continue;
        sampledCells += 1;
        const hasGlyph = (cell.codepoint > 32 && cell.codepoint !== 160) || cell.grapheme_len > 0;
        if (hasGlyph) nonSpace += 1;
        if (hasGlyph && !(cell.flags & 32)
          && (cell.fg_r !== cell.bg_r || cell.fg_g !== cell.bg_g || cell.fg_b !== cell.bg_b)) visibleGlyphs += 1;
        const inverse = Boolean(cell.flags & 16);
        if (background && ((inverse ? cell.fg_r : cell.bg_r) !== background.r
          || (inverse ? cell.fg_g : cell.bg_g) !== background.g
          || (inverse ? cell.fg_b : cell.bg_b) !== background.b)) coloredBackground += 1;
      }
      rows.push({ row, available: true, sampledCells, nonSpace, visibleGlyphs, coloredBackground });
    }
    return {
      source: "cached_ui_frame", ready: this.isReady, frameReady: this.isFrameReady,
      failed: this.failed, generation: this.generation, revision: frame?.revision,
      viewportRevision: this.viewportRevision, historyEpoch: frame?.historyEpoch,
      cols: this.cols, rows: this.rows, scrollback: frame?.scrollback, serial: frame?.serial,
      viewportY: offset, cursor: frame?.cursor, colors: frame?.colors, alternate: frame?.alternate,
      modes: frame?.modes, wrapped: frame?.wrapped,
      pendingRequests: this.pending.size, pendingBytes: this.pendingBytes,
      pendingOperations: [...this.pending.values()].map((entry) => entry.type),
      snapshotPending: Boolean(this.snapshotPending), cachedHistoryRows: this.history.size,
      rowStep, colStep, rowContent: rows,
    };
  }
  write(data) { return this.request("write", { data, viewportY: this.viewport?.() || 0, visible: this.visible?.() !== false }); }
  restoreCheckpoint(checkpoint) {
    const generation = this.generation;
    this.checkpointRestorePending = true;
    return this.request("restore", { checkpoint }).finally(() => {
      if (this.generation === generation) { this.checkpointRestorePending = false; this.onChange?.(); }
    });
  }
  resize(cols, rows) { return this.request("resize", { cols, rows, viewportY: this.viewport?.() || 0 }); }
  resetBackend(config) { return this.restart(config); }
  getDimensions() { return { cols: this.cols, rows: this.rows }; }
  getCursor() { return this.frame?.cursor || { x: 0, y: 0, visible: false }; }
  getColors() { return this.frame?.colors || null; }
  getViewport() {
    if (this.isReady && this.viewportRevision !== this.frame.revision) {
      if (!this.snapshotPending) {
        const generation = this.generation;
        const promise = this.request("snapshot", { viewportY: this.viewport?.() || 0 }).finally(() => {
          if (generation === this.generation && this.snapshotPending === promise) this.snapshotPending = null;
        });
        promise.catch(() => {});
        this.snapshotPending = promise;
      }
      return null;
    }
    return this.isReady ? this.viewportCells : null;
  }
  getLine(row) { return this.getViewport() ? this.lines?.[row] || null : null; }
  getScrollbackLength() { return this.frame?.scrollback || 0; }
  getScrollbackGeneration() { return this.frame?.serial || 0; }
  getMode(mode, ansi = false) { return this.frame?.modes?.[`${ansi ? "a" : "d"}${mode}`] === true; }
  hasBracketedPaste() { return this.getMode(2004); }
  hasFocusEvents() { return this.getMode(1004); }
  hasMouseTracking() { return this.frame?.mouseTracking === true; }
  isAlternateScreen() { return this.frame?.alternate === true; }
  isRowWrapped(row) { return this.frame?.wrapped?.[row] === true; }
  getHyperlinkUri() { return null; }
  needsFullRedraw() { return this.dirty === true; }
  isRowDirty() { return this.dirty === true; }
  update() { return this.dirty ? 2 : 0; }
  ensureRenderStateCurrent() {}
  markClean() { this.dirty = false; }
  clearDirty() { this.markClean(); }
  hasResponse() { return this.responses.length > 0; }
  readResponse() { return this.responses.shift() || null; }
  getGraphemeString(row, col) { return this.lines?.[row]?.[col]?.text || " "; }
  getScrollbackGraphemeString(row, col) { return this.getScrollbackLine(row)?.[col]?.text || " "; }
  getScrollbackLine(row) {
    if (!this.isReady || row < 0 || row >= this.frame.scrollback) return null;
    const absolute = this.frame.serial - this.frame.scrollback + row;
    const line = this.history.get(absolute);
    if (line) return line;
    this.prepareRange(row, row + Math.max(64, this.rows)).catch(() => {});
    return null;
  }
  async prepareRange(start, end) {
    if (!this.isReady) await this.ready;
    const generation = this.generation;
    const epoch = this.frame.historyEpoch;
    const base = this.frame.serial - this.frame.scrollback;
    for (let row = Math.floor(Math.max(0, start) / 64) * 64; row < Math.min(end, this.frame.scrollback); row += 64) {
      const first = base + Math.floor(row / 64) * 64;
      const key = `${epoch}:${first}`;
      let promise = this.reads.get(key);
      if (!promise) {
        promise = this.request("read", { start: first, end: first + 64, epoch }).then((result) => {
          if (generation === this.generation && !result.stale) this.acceptHistory(result);
        }).finally(() => {
          if (this.reads.get(key) === promise) this.reads.delete(key);
          if (generation === this.generation) this.onChange?.();
        });
        this.reads.set(key, promise);
      }
      await promise;
    }
  }
  text(range = null) {
    return this.request("text", { range, historyEpoch: this.frame?.historyEpoch, historyBase: this.frame ? this.frame.serial - this.frame.scrollback : 0 });
  }
  search(query) { return this.request("search", { query }); }
  findLink(row, col) {
    return this.request("link", { row, col, historyEpoch: this.frame?.historyEpoch, historyBase: this.frame ? this.frame.serial - this.frame.scrollback : 0 });
  }
  async readRows(start, end) {
    if (!this.getViewport() && this.snapshotPending) await this.snapshotPending;
    const frame = this.frame;
    if (!this.isReady) throw new Error("Terminal backend is not ready");
    const result = [];
    const base = frame.serial - frame.scrollback;
    for (let row = start; row < Math.min(end, frame.scrollback); row += 64) {
      const range = await this.request("read", { start: base + row, end: base + Math.min(row + 64, end, frame.scrollback), epoch: frame.historyEpoch });
      if (range.stale || this.frame.historyEpoch !== frame.historyEpoch || this.frame.revision !== frame.revision) throw new Error("Terminal history changed during read");
      result.push(...unpackRows(range.packet));
    }
    for (let row = Math.max(start, frame.scrollback); row < end; row += 1) result.push(this.lines[row - frame.scrollback]);
    return result;
  }
  free() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker?.terminate();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(cancelled()); }
    this.pending.clear();
    this.reads.clear();
    this.history.clear();
    this.frame = this.lines = this.viewportCells = null;
    this.responses = [];
    this.onDispose?.(this);
  }
}
