import {
  createTerminalOverviewPreviewStore,
  terminalOverviewPreviewIdentity,
  terminalOverviewPreviewKey,
} from "./preview_store.js";

const noop = () => {};

const canvasForPane = (pane) => (
  pane?.term?.canvas
  || pane?.term?.renderer?.getCanvas?.()
  || pane?.term?.element?.querySelector?.("canvas")
);

const defaultDecodePreviewBlob = async (blob, { windowObject }) => {
  const createImageBitmapImpl = windowObject?.createImageBitmap || globalThis.createImageBitmap;
  if (typeof createImageBitmapImpl === "function") {
    return createImageBitmapImpl(blob);
  }
  const URLObject = windowObject?.URL || globalThis.URL;
  const ImageCtor = windowObject?.Image || globalThis.Image;
  if (!URLObject?.createObjectURL || typeof ImageCtor !== "function") {
    throw new Error("Terminal overview preview image decode is unavailable.");
  }
  const objectURL = URLObject.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new ImageCtor();
      let settled = false;
      const finish = (value, error = null) => {
        if (settled) {
          return;
        }
        settled = true;
        image.onload = null;
        image.onerror = null;
        error ? reject(error) : resolve(value);
      };
      image.onload = () => finish(image);
      image.onerror = () => finish(null, new Error("Terminal overview preview image decode failed."));
      image.src = objectURL;
      if (typeof image.decode === "function") {
        image.decode().then(() => finish(image)).catch(() => {});
      }
    });
  } finally {
    URLObject.revokeObjectURL?.(objectURL);
  }
};

const encodeCanvas = (canvas, type = "image/webp", quality = 0.78) => new Promise((resolve, reject) => {
  if (!canvas || typeof canvas.toBlob !== "function") {
    reject(new Error("Terminal overview preview canvas encoding is unavailable."));
    return;
  }
  canvas.toBlob((blob) => {
    if (blob && Number(blob.size || 0) > 0) {
      resolve(blob);
    } else {
      reject(new Error("Terminal overview preview canvas encoding returned no data."));
    }
  }, type, quality);
});

export function createTerminalOverviewPreviewController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  store = createTerminalOverviewPreviewStore({
    indexedDBObject: windowObject?.indexedDB || globalThis.indexedDB,
  }),
  canCapturePane = () => false,
  decodePreviewBlob = (blob) => defaultDecodePreviewBlob(blob, { windowObject }),
  onReady = noop,
  onError = noop,
  captureDelayMs = 320,
  maxPreviewWidth = 640,
  maxPreviewHeight = 400,
} = {}) {
  let disposed = false;
  const states = new Map();

  const stateFor = (pane) => {
    let state = states.get(pane);
    if (!state) {
      state = {
        captureSeq: 0,
        captureTimer: 0,
        loadSeq: 0,
        loadPromise: null,
        prepared: null,
      };
      states.set(pane, state);
    }
    return state;
  };

  const identityForPane = (pane) => terminalOverviewPreviewIdentity(pane);

  const recordMatchesPane = (pane, record) => {
    const identity = identityForPane(pane);
    if (!identity || !record || terminalOverviewPreviewKey(identity) !== String(record.key || "")) {
      return false;
    }
    const currentHistoryGeneration = String(pane?.historyGeneration || "").trim();
    return !currentHistoryGeneration
      || currentHistoryGeneration === String(record.historyGeneration || "").trim();
  };

  const clearPrepared = (pane, { removeState = false } = {}) => {
    const state = states.get(pane);
    if (!state) {
      return false;
    }
    state.loadSeq += 1;
    state.loadPromise = null;
    state.prepared?.image?.close?.();
    state.prepared = null;
    if (removeState && !state.captureTimer) {
      states.delete(pane);
    }
    return true;
  };

  const get = (pane) => {
    const state = states.get(pane);
    if (!recordMatchesPane(pane, state?.prepared?.record) || !state?.prepared?.image) {
      if (state?.prepared) {
        clearPrepared(pane);
      }
      return null;
    }
    return state.prepared.image;
  };

  const prepare = (pane) => {
    if (disposed || !pane || pane.closed) {
      return Promise.resolve(null);
    }
    const current = get(pane);
    if (current) {
      return Promise.resolve(current);
    }
    const state = stateFor(pane);
    if (state.loadPromise) {
      return state.loadPromise;
    }
    const identity = identityForPane(pane);
    if (!identity) {
      return Promise.resolve(null);
    }
    state.loadSeq += 1;
    const loadSeq = state.loadSeq;
    const identityKey = terminalOverviewPreviewKey(identity);
    let promise = null;
    promise = (async () => {
      const record = await store.load(identity);
      if (!record || !recordMatchesPane(pane, record)) {
        return null;
      }
      const image = await decodePreviewBlob(record.blob);
      if (
        disposed
        || pane.closed
        || state.loadSeq !== loadSeq
        || terminalOverviewPreviewKey(identityForPane(pane)) !== identityKey
        || !recordMatchesPane(pane, record)
      ) {
        image?.close?.();
        return null;
      }
      state.prepared?.image?.close?.();
      state.prepared = { image, record };
      onReady(pane, image);
      return image;
    })().catch((error) => {
      onError(pane, error);
      return null;
    }).finally(() => {
      if (state.loadPromise === promise) {
        state.loadPromise = null;
      }
    });
    state.loadPromise = promise;
    return promise;
  };

  const capture = async (pane, captureSeq) => {
    const state = stateFor(pane);
    state.captureTimer = 0;
    if (disposed || pane?.closed || state.captureSeq !== captureSeq || !canCapturePane(pane)) {
      return false;
    }
    const identity = identityForPane(pane);
    const source = canvasForPane(pane);
    const sourceWidth = Math.max(0, Math.floor(Number(source?.width) || 0));
    const sourceHeight = Math.max(0, Math.floor(Number(source?.height) || 0));
    if (!identity || !source || sourceWidth <= 0 || sourceHeight <= 0) {
      return false;
    }
    const scale = Math.min(
      1,
      Math.max(1, Number(maxPreviewWidth) || 640) / sourceWidth,
      Math.max(1, Number(maxPreviewHeight) || 400) / sourceHeight,
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = documentObject?.createElement?.("canvas");
    const context = canvas?.getContext?.("2d");
    if (!canvas || !context) {
      return false;
    }
    canvas.width = width;
    canvas.height = height;
    context.drawImage(source, 0, 0, width, height);
    const identityKey = terminalOverviewPreviewKey(identity);
    const historyGeneration = String(pane.historyGeneration || "").trim();
    const renderGeneration = Math.max(0, Math.floor(Number(pane.renderGeneration) || 0));
    const blob = await encodeCanvas(canvas);
    if (
      disposed
      || pane.closed
      || state.captureSeq !== captureSeq
      || !canCapturePane(pane)
      || terminalOverviewPreviewKey(identityForPane(pane)) !== identityKey
      || String(pane.historyGeneration || "").trim() !== historyGeneration
      || Math.max(0, Math.floor(Number(pane.renderGeneration) || 0)) !== renderGeneration
    ) {
      return false;
    }
    await store.save(identity, blob, {
      historyGeneration,
      width,
      height,
      sourceWidth,
      sourceHeight,
      renderGeneration,
    });
    if (state.prepared) {
      clearPrepared(pane);
    }
    onReady(pane, null);
    return true;
  };

  const scheduleCapture = (pane, { immediate = false } = {}) => {
    if (disposed || !pane || pane.closed || !canCapturePane(pane)) {
      return false;
    }
    const state = stateFor(pane);
    state.captureSeq += 1;
    if (immediate) {
      if (state.captureTimer) {
        windowObject?.clearTimeout?.(state.captureTimer);
        state.captureTimer = 0;
      }
      capture(pane, state.captureSeq).catch((error) => onError(pane, error));
      return true;
    }
    if (state.captureTimer) {
      return true;
    }
    state.captureTimer = windowObject?.setTimeout?.(() => {
      capture(pane, state.captureSeq).catch((error) => onError(pane, error));
    }, Math.max(0, Number(captureDelayMs) || 0)) || 0;
    return true;
  };

  return Object.freeze({
    capture: scheduleCapture,
    captureAll(panes, options) {
      let scheduled = 0;
      for (const pane of panes || []) {
        if (scheduleCapture(pane, options)) {
          scheduled += 1;
        }
      }
      return scheduled;
    },
    cleanup: () => store.cleanup().catch(() => 0),
    release(pane) {
      const state = states.get(pane);
      if (!state) return;
      if (state.captureTimer) windowObject?.clearTimeout?.(state.captureTimer);
      state.captureTimer = 0;
      state.captureSeq += 1;
      clearPrepared(pane, { removeState: true });
    },
    delete(pane) {
      if (!pane) {
        return Promise.resolve(false);
      }
      const state = states.get(pane);
      if (state?.captureTimer) {
        windowObject?.clearTimeout?.(state.captureTimer);
        state.captureTimer = 0;
      }
      if (state) {
        state.captureSeq += 1;
        clearPrepared(pane, { removeState: true });
      }
      return store.delete(identityForPane(pane)).catch((error) => {
        onError(pane, error);
        return false;
      });
    },
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      for (const [pane, state] of states) {
        if (state.captureTimer) {
          windowObject?.clearTimeout?.(state.captureTimer);
        }
        state.captureSeq += 1;
        clearPrepared(pane);
      }
      states.clear();
      store.dispose?.();
      return true;
    },
    get,
    prepare,
  });
}

export { defaultDecodePreviewBlob };
