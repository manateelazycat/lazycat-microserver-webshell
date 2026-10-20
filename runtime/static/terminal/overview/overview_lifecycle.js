export function createTerminalOverviewLifecycle({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  elements = {},
  handlers = {},
} = {}) {
  const listeners = [];
  let started = false;
  let disposed = false;

  const listen = (target, type, listener, options) => {
    if (!target?.addEventListener || typeof listener !== "function") {
      return () => {};
    }
    target.addEventListener(type, listener, options);
    const entry = [target, type, listener, options];
    listeners.push(entry);
    return () => {
      const index = listeners.indexOf(entry);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
      target.removeEventListener?.(type, listener, options);
    };
  };

  return Object.freeze({
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const [target, type, listener, options] of listeners.splice(0)) {
        target.removeEventListener?.(type, listener, options);
      }
    },
    listenTransient: listen,
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      listen(elements.toggle, "click", handlers.onToggle);
      listen(elements.close, "click", handlers.onClose);
      listen(elements.newTab, "click", handlers.onNewTab);
      listen(elements.root, "click", handlers.onRootClick);
      listen(elements.root, "pointerdown", handlers.onCardPointerDown);
      listen(elements.grid, "scroll", handlers.onGridScroll, { passive: true });
      listen(documentObject, "touchstart", handlers.onEdgeSwipeStart, { capture: true, passive: true });
      listen(documentObject, "touchend", handlers.onEdgeSwipeEnd, { capture: true, passive: true });
      listen(documentObject, "touchcancel", handlers.onEdgeSwipeEnd, { capture: true, passive: true });
      listen(windowObject, "resize", handlers.onResize);
    },
  });
}
