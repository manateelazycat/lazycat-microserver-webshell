import { terminalSelectionRange } from "../selection/index.js";

const retired = () => Object.assign(new Error("Terminal backend operation was retired"), { code: "BACKEND_CANCELLED" });
const requireCurrentIdentity = (term, backend, identity) => {
  if (term.backendIdentity?.() === identity) return;
  const error = Object.assign(new Error("Terminal operation crossed a connection boundary"), { code: "BACKEND_CONNECTION_CHANGED" });
  // Its bytes/geometry may already be applied in native memory. Invalidate
  // that engine rather than reusing it with an older acknowledged cursor.
  backend.fail(error);
  throw error;
};

// DOM/Canvas/input stay in UI. Native mutations await the worker; reads use
// only its last complete frame.
export function installBackendTerminalAdapter(term) {
  term.writeInternal = async (data, callback) => {
    const backend = term.wasmTerm;
    const generation = backend.generation;
    const identity = term.backendIdentity?.();
    const frame = await backend.write(data);
    if (term.isDisposed || term.wasmTerm !== backend || generation !== backend.generation) throw retired();
    requireCurrentIdentity(term, backend, identity);
    term.renderFullNextFrame = true;
    term.processTerminalResponses();
    if ((typeof data === "string" && data.includes("\x07")) || (data instanceof Uint8Array && data.includes(7))) term.bellEmitter.fire();
    term.linkDetector?.invalidateCache();
    if ((term.viewportY || 0) <= 0.01 && (term.targetViewportY || 0) <= 0.01) {
      term.scrollToBottom();
    } else {
      const added = Math.max(0, frame.serial - frame.writeStartSerial);
      const length = backend.getScrollbackLength();
      term.viewportY = Math.min(length, Math.max(0, term.viewportY + added));
      term.targetViewportY = Math.min(length, Math.max(0, (term.targetViewportY || 0) + added));
      term.scrollEmitter.fire(Math.floor(term.viewportY));
    }
    if (typeof data === "string" && data.includes("\x1B]")) term.checkForTitleChange(data);
    term.requestRender({ full: true, throttle: true });
    if (callback) requestAnimationFrame(callback);
  };
  term.writeReplay = async (data) => {
    term.beginRenderSuppression();
    try { await term.write(data); }
    finally { term.endRenderSuppression({ render: false }); }
  };
  term.resize = (cols, rows) => {
    term.assertOpen();
    const backend = term.wasmTerm;
    if (cols === term.cols && rows === term.rows && backend.isReady && !term.backendResizePending) {
      if (term.renderer.resize(cols, rows)) term.requestRender({ full: true });
      return undefined;
    }
    const generation = backend.generation;
    const identity = term.backendIdentity?.();
    term.backendResizePending = true;
    const promise = backend.resize(cols, rows).then(() => {
      if (term.isDisposed || term.wasmTerm !== backend || generation !== backend.generation) throw retired();
      requireCurrentIdentity(term, backend, identity);
      term.cancelRenderLoop();
      term.cols = backend.cols;
      term.rows = backend.rows;
      term.renderer.resize(term.cols, term.rows);
      term.resizeEmitter.fire({ cols: term.cols, rows: term.rows });
      term.requestRender({ full: true });
    }).finally(() => {
      if (generation === backend.generation) term.backendResizePending = false;
    });
    promise.catch(() => {});
    return promise;
  };
  term.reset = () => {
    term.assertOpen();
    term.cancelRenderLoop();
    term.backendResizePending = false;
    term.__kittyGraphics?.clear();
    term.currentTitle = "";
    term.wasmTerm.resetBackend(term.buildWasmConfig());
  };
  term.clear = () => {
    const promise = term.wasmTerm.write("\x1B[2J\x1B[H").then(() => term.requestRender({ full: true }));
    promise.catch(() => {});
    return promise;
  };
  const renderNow = term.renderNow.bind(term);
  term.renderNow = (...args) => {
    const backend = term.wasmTerm;
    if (!backend?.isReady || term.backendResizePending || backend.cols !== term.cols || backend.rows !== term.rows) return false;
    if (!backend.getViewport()) return false;
    return renderNow(...args);
  };
  term.getSelectionAsync = () => {
    const range = terminalSelectionRange(term.selectionManager);
    return range ? term.wasmTerm.text(range) : Promise.resolve("");
  };
  let previewKey = "";
  let previewText = "";
  let previewPending = false;
  term.getSelectionPreview = () => {
    const range = terminalSelectionRange(term.selectionManager);
    if (!range) { previewKey = ""; previewText = ""; return ""; }
    const backend = term.wasmTerm;
    const key = `${backend.generation}:${backend.frame?.historyEpoch}:${backend.frame?.alternate}:${JSON.stringify(range)}`;
    if (!backend.isReady) return "";
    if (key !== previewKey && !previewPending) {
      previewPending = true;
      backend.text(range).then((text) => {
        if (!term.isDisposed && backend === term.wasmTerm) {
          previewKey = key;
          previewText = text;
        }
      }).catch(() => {
        previewKey = key;
        previewText = "";
      }).finally(() => {
        previewPending = false;
        if (!term.isDisposed) term.selectionChangeEmitter.fire();
      });
    }
    return key === previewKey ? previewText : "";
  };
}
