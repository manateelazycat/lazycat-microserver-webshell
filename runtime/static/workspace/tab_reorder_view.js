export function createWorkspaceTabReorderView({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  tabsElement = null,
} = {}) {
  const animationTimers = new Map();
  let autoScrollFrame = 0;
  let autoScrollStep = 0;

  const requestFrame = (callback) => windowObject?.requestAnimationFrame?.(callback) || 0;
  const cancelFrame = (frame) => windowObject?.cancelAnimationFrame?.(frame);

  const clearAnimation = (button) => {
    const timer = animationTimers.get(button);
    if (timer) windowObject?.clearTimeout?.(timer);
    animationTimers.delete(button);
    button?.classList?.remove("is-reordering");
    button?.style?.removeProperty("transition");
    button?.style?.removeProperty("transform");
  };

  const tabRects = () => new Map(Array.from(
    tabsElement?.querySelectorAll?.(".tab:not(.is-dragging)") || [],
    (button) => [button, button.getBoundingClientRect()],
  ));

  const animateReorder = (beforeRects) => {
    for (const button of tabsElement?.querySelectorAll?.(".tab:not(.is-dragging)") || []) {
      const before = beforeRects.get(button);
      if (!before) continue;
      const after = button.getBoundingClientRect();
      const dx = before.left - after.left;
      if (Math.abs(dx) < 0.5) continue;
      clearAnimation(button);
      button.style.transition = "none";
      button.style.transform = `translate3d(${Math.round(dx)}px, 0, 0)`;
      button.getBoundingClientRect();
      button.classList.add("is-reordering");
      button.style.removeProperty("transition");
      requestFrame(() => button.style.removeProperty("transform"));
      const timer = windowObject?.setTimeout?.(() => clearAnimation(button), 180) || 0;
      animationTimers.set(button, timer);
    }
  };

  const begin = (state) => {
    const rect = state.button.getBoundingClientRect();
    const placeholder = documentObject.createElement("div");
    placeholder.className = "tab-reorder-placeholder";
    placeholder.style.width = `${Math.round(rect.width)}px`;
    placeholder.style.height = `${Math.round(rect.height)}px`;
    tabsElement.insertBefore(placeholder, state.button);
    documentObject.body.appendChild(state.button);
    state.placeholder = placeholder;
    state.button.classList.add("is-dragging");
    Object.assign(state.button.style, {
      position: "fixed",
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(rect.top)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      zIndex: "90",
      transform: "translate3d(0, 0, 0)",
    });
    tabsElement.classList.add("is-reordering");
    documentObject.body.classList.add("is-tab-reordering");
  };

  const moveDraggedButton = (state) => {
    state.button.style.transform = `translate3d(${Math.round(state.lastX - state.startX)}px, 0, 0)`;
  };

  const updatePlaceholder = (state) => {
    if (!state.placeholder?.parentNode) return;
    const candidates = Array.from(tabsElement.querySelectorAll(".tab:not(.is-dragging)"));
    const before = candidates.find((button) => {
      const rect = button.getBoundingClientRect();
      return state.lastX < rect.left + rect.width / 2;
    }) || null;
    if (before === state.placeholder.nextElementSibling || (!before && state.placeholder === tabsElement.lastElementChild)) return;
    const beforeRects = tabRects();
    tabsElement.insertBefore(state.placeholder, before);
    animateReorder(beforeRects);
  };

  const stopAutoScroll = () => {
    if (autoScrollFrame) cancelFrame(autoScrollFrame);
    autoScrollFrame = 0;
    autoScrollStep = 0;
  };

  const updateAutoScroll = (state) => {
    const rect = tabsElement?.getBoundingClientRect?.();
    if (!rect || !state.dragging) return stopAutoScroll();
    const edge = Math.min(48, rect.width / 3);
    const leftDistance = state.lastX - rect.left;
    const rightDistance = rect.right - state.lastX;
    let step = 0;
    if (leftDistance >= 0 && leftDistance < edge) step = -Math.ceil((1 - leftDistance / edge) * 12);
    else if (rightDistance >= 0 && rightDistance < edge) step = Math.ceil((1 - rightDistance / edge) * 12);
    autoScrollStep = step;
    if (!step || autoScrollFrame) return;
    const tick = () => {
      if (!state.dragging || !autoScrollStep) return stopAutoScroll();
      const previous = tabsElement.scrollLeft;
      tabsElement.scrollLeft += autoScrollStep;
      if (tabsElement.scrollLeft !== previous) updatePlaceholder(state);
      autoScrollFrame = requestFrame(tick);
    };
    autoScrollFrame = requestFrame(tick);
  };

  const finish = (state) => {
    stopAutoScroll();
    for (const button of [...animationTimers.keys()]) clearAnimation(button);
    if (state?.button && state?.placeholder?.parentNode) {
      state.placeholder.parentNode.insertBefore(state.button, state.placeholder);
      state.placeholder.remove();
    }
    if (state?.button) {
      state.button.classList.remove("is-dragging");
      for (const property of ["position", "left", "top", "width", "height", "z-index", "transform"]) {
        state.button.style.removeProperty(property);
      }
    }
    tabsElement?.classList?.remove("is-reordering");
    documentObject?.body?.classList?.remove("is-tab-reordering");
  };

  const restoreOrder = (tabIds, getButton) => {
    for (const tabId of tabIds || []) {
      const button = getButton(tabId);
      if (button) tabsElement?.appendChild?.(button);
    }
  };

  const beforeTabId = (state) => state?.button?.nextElementSibling?.dataset?.tabId || "";

  const dispose = () => {
    stopAutoScroll();
    for (const button of [...animationTimers.keys()]) clearAnimation(button);
  };

  return Object.freeze({
    beforeTabId,
    begin,
    dispose,
    finish,
    moveDraggedButton,
    restoreOrder,
    updateAutoScroll,
    updatePlaceholder,
  });
}
