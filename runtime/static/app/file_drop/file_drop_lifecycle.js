export function createAppFileDropLifecycle({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  handlers = {},
} = {}) {
  const listeners = [];
  let started = false;
  let disposed = false;

  const listen = (target, type, listener, options) => {
    if (!target?.addEventListener || typeof listener !== "function") {
      return;
    }
    target.addEventListener(type, listener, options);
    listeners.push([target, type, listener, options]);
  };

  return {
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      for (const [target, type, listener, options] of listeners.splice(0)) {
        target.removeEventListener?.(type, listener, options);
      }
      return true;
    },
    start() {
      if (started || disposed) {
        return false;
      }
      started = true;
      const options = { capture: true };
      listen(windowObject, "dragenter", handlers.onDragEnter, options);
      listen(windowObject, "dragover", handlers.onDragOver, options);
      listen(windowObject, "dragleave", handlers.onDragLeave, options);
      listen(windowObject, "drop", handlers.onDrop, options);
      listen(documentObject, "dragend", handlers.onDragEnd, options);
      return true;
    },
  };
}
