export function createDesktopSidebarResizeController({
  documentObject = document,
  windowObject = window,
  sidebar,
  handle,
  storage,
  storageKey,
  isEnabled = () => false,
  onStart = () => null,
  onResize = () => {},
  onEnd = () => {},
  onLayoutChange = () => {},
} = {}) {
  const shell = sidebar.parentElement;
  const listeners = [];
  let preferredWidth = 248;
  let width = 0;
  let drag = null;
  let frame = 0;
  let disposed = false;
  try {
    const stored = Number(storage?.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0) preferredWidth = stored;
  } catch {}

  const limits = () => {
    const max = Math.floor(shell.getBoundingClientRect().width / 3);
    return { min: Math.min(160, max), max };
  };
  const sync = ({ notify = true } = {}) => {
    if (disposed) return;
    const { min, max } = limits();
    const next = Math.round(Math.max(min, Math.min(preferredWidth, max)));
    handle.setAttribute("aria-valuemin", String(min));
    handle.setAttribute("aria-valuemax", String(max));
    handle.setAttribute("aria-valuenow", String(next));
    if (next === width) return;
    width = next;
    shell.style.setProperty("--desktop-workspace-sidebar-width", `${width}px`);
    if (notify && isEnabled()) {
      if (drag) onResize(drag.context);
      else onLayoutChange();
    }
  };
  const save = () => { try { storage?.setItem(storageKey, String(preferredWidth)); } catch {} };
  const flush = () => {
    if (frame) windowObject.cancelAnimationFrame(frame);
    frame = 0;
    sync();
  };
  const finish = ({ cancel = false } = {}) => {
    if (!drag) return;
    const current = drag;
    if (cancel) preferredWidth = current.previousWidth;
    flush();
    drag = null;
    documentObject.body.classList.remove("is-desktop-workspace-resizing");
    if (handle.hasPointerCapture(current.pointerId)) handle.releasePointerCapture(current.pointerId);
    onEnd(current.context);
    if (!cancel) save();
  };
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };

  listen(handle, "pointerdown", (event) => {
    if (disposed || !isEnabled() || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    handle.focus({ preventScroll: true });
    drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, previousWidth: preferredWidth, context: onStart() };
    handle.setPointerCapture(event.pointerId);
    documentObject.body.classList.add("is-desktop-workspace-resizing");
  });
  listen(handle, "pointermove", (event) => {
    if (event.pointerId !== drag?.pointerId) return;
    const { min, max } = limits();
    preferredWidth = Math.max(min, Math.min(max, drag.startWidth + event.clientX - drag.startX));
    if (!frame) frame = windowObject.requestAnimationFrame(() => { frame = 0; sync(); });
  });
  listen(handle, "pointerup", (event) => { if (event.pointerId === drag?.pointerId) finish(); });
  listen(handle, "pointercancel", (event) => { if (event.pointerId === drag?.pointerId) finish({ cancel: true }); });
  listen(handle, "lostpointercapture", (event) => { if (event.pointerId === drag?.pointerId) finish(); });
  listen(handle, "keydown", (event) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      event.stopPropagation();
      finish({ cancel: true });
      return;
    }
    if (!isEnabled() || drag || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const { min, max } = limits();
    const step = event.shiftKey ? 40 : 12;
    preferredWidth = event.key === "Home" ? min : event.key === "End" ? max
      : Math.max(min, Math.min(max, width + (event.key === "ArrowLeft" ? -step : step)));
    const context = onStart();
    sync({ notify: false });
    onResize(context);
    onEnd(context);
    save();
  });
  listen(windowObject, "resize", () => sync());
  listen(windowObject, "blur", () => finish());
  sync({ notify: false });

  return Object.freeze({
    finish,
    sync,
    dispose() {
      finish();
      disposed = true;
      if (frame) windowObject.cancelAnimationFrame(frame);
      for (const remove of listeners) remove();
      shell.style.removeProperty("--desktop-workspace-sidebar-width");
    },
  });
}
