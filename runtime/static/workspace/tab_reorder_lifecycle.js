export function createWorkspaceTabReorderLifecycle({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  tabsElement = null,
} = {}) {
  let disposed = false;
  let started = false;
  const persistentCleanups = [];
  const transientCleanups = [];

  const listen = (target, type, listener, options, bucket) => {
    if (disposed || !target?.addEventListener) return () => {};
    target.addEventListener(type, listener, options);
    const cleanup = () => target.removeEventListener(type, listener, options);
    bucket.push(cleanup);
    return cleanup;
  };

  const clearTransient = () => {
    for (const cleanup of transientCleanups.splice(0)) cleanup();
  };

  const start = ({ onPointerDown, onContextMenu, onClick, onKeyDown, onBlur } = {}) => {
    if (started || disposed) return false;
    started = true;
    listen(tabsElement, "pointerdown", onPointerDown, { capture: true }, persistentCleanups);
    listen(tabsElement, "contextmenu", onContextMenu, { capture: true }, persistentCleanups);
    listen(tabsElement, "click", onClick, { capture: true }, persistentCleanups);
    listen(documentObject, "keydown", onKeyDown, { capture: true }, persistentCleanups);
    listen(windowObject, "blur", onBlur, undefined, persistentCleanups);
    return true;
  };

  const trackPointer = ({ onMove, onEnd, onCancel } = {}) => {
    clearTransient();
    listen(documentObject, "pointermove", onMove, { capture: true, passive: false }, transientCleanups);
    listen(documentObject, "pointerup", onEnd, { capture: true, passive: false }, transientCleanups);
    listen(documentObject, "pointercancel", onCancel, { capture: true }, transientCleanups);
  };

  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    clearTransient();
    for (const cleanup of persistentCleanups.splice(0)) cleanup();
    return true;
  };

  return Object.freeze({ clearTransient, dispose, start, trackPointer });
}
