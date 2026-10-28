export function createInstancesLifecycle({
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
      return;
    }
    target.addEventListener(type, listener, options);
    listeners.push([target, type, listener, options]);
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const [target, type, listener, options] of listeners.splice(0)) {
        target.removeEventListener?.(type, listener, options);
      }
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      listen(elements.button, "click", handlers.onToggleSwitcher);
      listen(elements.list, "click", handlers.onSelectInstance);
      listen(elements.homeButton, "click", handlers.onNavigateHome);
      listen(documentObject, "pointerdown", handlers.onDocumentPointerDown);
      listen(documentObject, "keydown", handlers.onDocumentKeyDown, true);
      listen(windowObject, "popstate", handlers.onPopState);
      listen(windowObject, "resize", handlers.onViewportChange);
      listen(windowObject?.visualViewport, "resize", handlers.onViewportChange);
      listen(windowObject?.visualViewport, "scroll", handlers.onViewportChange);
    },
  };
}
