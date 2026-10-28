// Owns vertical pointer gestures only. Persistence and workspace mutations are
// explicit commands supplied by the PC workspace owner.
export function createDesktopWorkspaceReorderController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  list,
  canDrag = () => false,
  isRenaming = () => false,
  onStart = () => {},
  onDrop = async () => {},
  onFinish = () => {},
  onError = () => {},
} = {}) {
  const listeners = [];
  const transient = [];
  const animations = new Map();
  let gesture = null;
  let disposed = false;
  let suppressClickUntil = 0;
  let scrollFrame = 0;
  const now = () => windowObject.performance.now();
  const listen = (target, type, callback, options, bucket = listeners) => {
    target.addEventListener(type, callback, options);
    bucket.push(() => target.removeEventListener(type, callback, options));
  };
  const descriptor = (target) => {
    const session = target.closest(".desktop-workspace-session-select")?.closest(".desktop-workspace-session");
    const instance = target.closest(".desktop-workspace-instance-name")?.closest(".desktop-workspace-instance");
    if (session) return {
      kind: "session", element: session, container: session.parentElement,
      selector: session.closest("[data-selector]").dataset.selector, tabId: session.dataset.tabId,
    };
    if (instance) return { kind: "instance", element: instance, container: list, selector: instance.dataset.selector };
    return null;
  };
  const id = (element, kind) => kind === "session" ? element.dataset.tabId : element.dataset.selector;
  const items = (state) => [...state.container.children].filter((element) => element !== state.element
    && element.classList.contains(state.kind === "session" ? "desktop-workspace-session" : "desktop-workspace-instance"));
  const stopTracking = () => {
    for (const remove of transient.splice(0)) remove();
    if (scrollFrame) windowObject.cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  };
  const restoreOrder = (state) => {
    const all = new Map([...items(state), state.element].map((element) => [id(element, state.kind), element]));
    const tail = state.kind === "session" ? state.container.querySelector(":scope > .desktop-workspace-message") : null;
    for (const key of state.originalOrder) {
      const element = all.get(key);
      if (element) state.container.insertBefore(element, tail);
    }
  };
  const finish = ({ cancel = false, event } = {}) => {
    const state = gesture;
    if (!state) return;
    gesture = null;
    stopTracking();
    windowObject.clearTimeout(state.holdTimer);
    if (!state.dragging) return;
    event?.preventDefault();
    event?.stopPropagation();
    suppressClickUntil = now() + 350;
    state.placeholder.before(state.element);
    state.placeholder.remove();
    state.element.classList.remove("is-desktop-workspace-dragging");
    for (const property of ["position", "left", "top", "width", "height", "transform", "z-index", "pointer-events", "margin"]) {
      state.element.style.removeProperty(property);
    }
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    documentObject.body.classList.remove("is-desktop-workspace-reordering");
    const rect = list.getBoundingClientRect();
    const inside = !event || (event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom);
    if (cancel || !inside) restoreOrder(state);
    else {
      const order = [...state.container.children].filter((element) =>
        element.classList.contains(state.kind === "session" ? "desktop-workspace-session" : "desktop-workspace-instance"))
        .map((element) => id(element, state.kind));
      const key = state.kind === "session" ? state.tabId : state.selector;
      const beforeId = order[order.indexOf(key) + 1] || "";
      if (beforeId !== (state.originalOrder[state.originalOrder.indexOf(key) + 1] || "")) {
        Promise.resolve(onDrop({ kind: state.kind, selector: state.selector, tabId: state.tabId, beforeId, order }))
          .catch(onError);
      }
    }
    onFinish();
  };
  const place = (state) => {
    const candidates = items(state);
    const before = candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      const height = state.kind === "instance" ? Math.min(40, rect.height) : rect.height;
      return state.lastY < rect.top + height / 2;
    }) || null;
    const tail = state.kind === "session" ? state.container.querySelector(":scope > .desktop-workspace-message") : null;
    const reference = before || tail;
    if (state.placeholder.nextElementSibling === reference || (!reference && state.placeholder === state.container.lastElementChild)) return;
    const rects = new Map(candidates.map((element) => [element, element.getBoundingClientRect()]));
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    state.container.insertBefore(state.placeholder, reference);
    if (windowObject.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const element of candidates) {
      const delta = rects.get(element).top - element.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) continue;
      animations.set(element, element.animate([
        { transform: `translateY(${delta}px)` }, { transform: "translateY(0)" },
      ], { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }));
    }
  };
  const autoScroll = (state) => {
    if (scrollFrame) return;
    const tick = () => {
      scrollFrame = 0;
      if (gesture !== state || !state.dragging) return;
      const rect = list.getBoundingClientRect();
      const edge = Math.min(48, rect.height / 3);
      const distance = state.lastY < rect.top + edge ? state.lastY - rect.top - edge
        : state.lastY > rect.bottom - edge ? state.lastY - rect.bottom + edge : 0;
      if (!distance) return;
      const prior = list.scrollTop;
      list.scrollTop += Math.sign(distance) * Math.min(12, Math.ceil(Math.abs(distance) / 3));
      if (list.scrollTop !== prior) place(state);
      scrollFrame = windowObject.requestAnimationFrame(tick);
    };
    scrollFrame = windowObject.requestAnimationFrame(tick);
  };
  const begin = (state) => {
    if (gesture !== state || state.dragging) return;
    state.dragging = true;
    const rect = state.element.getBoundingClientRect();
    state.placeholder = documentObject.createElement("div");
    state.placeholder.className = "desktop-workspace-reorder-placeholder";
    state.placeholder.dataset.kind = state.kind;
    state.placeholder.style.height = `${rect.height}px`;
    state.element.before(state.placeholder);
    documentObject.body.append(state.element);
    state.element.classList.add("is-desktop-workspace-dragging");
    Object.assign(state.element.style, {
      position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, zIndex: "90", pointerEvents: "none", margin: "0",
    });
    documentObject.body.classList.add("is-desktop-workspace-reordering");
    listen(documentObject, "touchmove", (event) => event.preventDefault(), { capture: true, passive: false }, transient);
    Promise.resolve(onStart(state)).catch(onError);
  };

  return Object.freeze({
    isDragging: () => gesture?.dragging === true,
    validate(groups) {
      if (!gesture) return;
      const group = groups.find((item) => item.selector === gesture.selector);
      if (!group || (gesture.kind === "session" && !group.tabs.some((tab) => tab.id === gesture.tabId))) {
        finish({ cancel: true });
      }
    },
    cancel: () => finish({ cancel: true }),
    start() {
      listen(list, "pointerdown", (event) => {
        if (disposed || gesture || event.isPrimary === false || event.button !== 0 || isRenaming()
          || event.target.closest("input, textarea, [data-desktop-action='close']")) return;
        const source = descriptor(event.target);
        if (!source || !canDrag(source)) return;
        const order = [source.element, ...items(source)].sort((left, right) =>
          left.compareDocumentPosition(right) & 2 ? 1 : -1).map((element) => id(element, source.kind));
        if (order.length < 2) return;
        const state = { ...source, pointerId: event.pointerId, pointerType: event.pointerType,
          startY: event.clientY, startX: event.clientX, lastY: event.clientY, originalOrder: order, dragging: false };
        gesture = state;
        if (event.pointerType === "touch") state.holdTimer = windowObject.setTimeout(() => begin(state), 320);
        listen(documentObject, "pointermove", (move) => {
          if (gesture !== state || move.pointerId !== state.pointerId) return;
          state.lastY = move.clientY;
          if (!state.dragging) {
            if (Math.hypot(move.clientX - state.startX, move.clientY - state.startY) < 8) return;
            if (state.pointerType === "touch") return finish({ cancel: true });
            begin(state);
          }
          move.preventDefault();
          state.element.style.transform = `translateY(${Math.round(state.lastY - state.startY)}px)`;
          place(state);
          autoScroll(state);
        }, { capture: true, passive: false }, transient);
        listen(documentObject, "pointerup", (up) => {
          if (up.pointerId === state.pointerId) finish({ event: up });
        }, { capture: true, passive: false }, transient);
        listen(documentObject, "pointercancel", () => finish({ cancel: true }), { capture: true }, transient);
      });
      listen(list, "click", (event) => {
        if (now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true });
      listen(documentObject, "contextmenu", (event) => {
        if (gesture?.pointerType !== "touch") return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true });
      listen(documentObject, "keydown", (event) => {
        if (event.key === "Escape" && gesture) {
          event.preventDefault();
          finish({ cancel: true });
        }
      }, { capture: true });
      listen(windowObject, "blur", () => finish({ cancel: true }));
    },
    dispose() {
      disposed = true;
      finish({ cancel: true });
      stopTracking();
      for (const remove of listeners.splice(0)) remove();
    },
  });
}
