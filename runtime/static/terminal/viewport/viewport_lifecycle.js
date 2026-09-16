const noop = () => {};

export function createTerminalViewportLifecycle({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
} = {}) {
  let disposed = false;
  let started = false;
  const listeners = [];
  const timers = new Map();
  const frames = new Map();

  const listen = (target, type, callback, options) => {
    if (disposed || typeof target?.addEventListener !== "function") {
      return noop;
    }
    const wrapped = (event) => {
      if (!disposed) {
        callback(event);
      }
    };
    target.addEventListener(type, wrapped, options);
    listeners.push({ target, type, callback: wrapped, options });
    return () => target.removeEventListener(type, wrapped, options);
  };

  const clearTimeoutKey = (key) => {
    const handle = timers.get(key);
    if (!handle) {
      return false;
    }
    timers.delete(key);
    windowObject.clearTimeout(handle);
    return true;
  };

  const timeout = (key, callback, delay = 0) => {
    if (disposed) {
      return 0;
    }
    clearTimeoutKey(key);
    const handle = windowObject.setTimeout(() => {
      if (timers.get(key) !== handle) {
        return;
      }
      timers.delete(key);
      if (!disposed) {
        callback();
      }
    }, delay);
    timers.set(key, handle);
    return handle;
  };

  const clearFrameKey = (key) => {
    const handle = frames.get(key);
    if (!handle) {
      return false;
    }
    frames.delete(key);
    windowObject.cancelAnimationFrame(handle);
    return true;
  };

  const frame = (key, callback) => {
    if (disposed || frames.has(key)) {
      return 0;
    }
    const handle = windowObject.requestAnimationFrame(() => {
      if (frames.get(key) !== handle) {
        return;
      }
      frames.delete(key);
      if (!disposed) {
        callback();
      }
    });
    frames.set(key, handle);
    return handle;
  };

  return Object.freeze({
    start(handlers = {}, { listenVisualViewport = false } = {}) {
      if (disposed || started) {
        return false;
      }
      started = true;
      const zoomOptions = { capture: true, passive: false };
      for (const type of ["touchstart", "touchmove", "gesturestart", "gesturechange", "gestureend"]) {
        listen(windowObject, type, handlers.onPreventZoom || noop, zoomOptions);
        listen(documentObject, type, handlers.onPreventZoom || noop, zoomOptions);
      }
      listen(windowObject, "resize", handlers.onWindowResize || noop);
      if (listenVisualViewport) {
        listen(windowObject?.visualViewport, "resize", handlers.onVisualViewport || noop);
        listen(windowObject?.visualViewport, "scroll", handlers.onVisualViewport || noop);
      }
      listen(windowObject, "orientationchange", handlers.onOrientationChange || noop);
      listen(windowObject?.screen?.orientation, "change", handlers.onOrientationChange || noop);
      return true;
    },
    timeout,
    clearTimeout: clearTimeoutKey,
    hasTimeout: (key) => timers.has(key),
    hasFrame: (key) => frames.has(key),
    frame,
    clearFrame: clearFrameKey,
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      for (const { target, type, callback, options } of listeners.splice(0)) {
        target.removeEventListener(type, callback, options);
      }
      for (const handle of timers.values()) {
        windowObject.clearTimeout(handle);
      }
      timers.clear();
      for (const handle of frames.values()) {
        windowObject.cancelAnimationFrame(handle);
      }
      frames.clear();
      return true;
    },
  });
}
