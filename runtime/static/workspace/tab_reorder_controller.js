import { createWorkspaceTabReorderLifecycle } from "./tab_reorder_lifecycle.js";
import { createWorkspaceTabReorderView } from "./tab_reorder_view.js";

const reorderCapability = "tab_reorder_anchor";

export function createWorkspaceTabReorderController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  tabsElement = null,
  getOrderedTabs = () => [],
  getTab = () => null,
  activateTab = () => false,
  isTouchReorderLayout = () => false,
  isRenaming = () => false,
  postWorkspaceAction = async () => {},
  refreshWorkspace = async () => {},
  showToast = () => {},
  lifecycleFactory = createWorkspaceTabReorderLifecycle,
  viewFactory = createWorkspaceTabReorderView,
} = {}) {
  const moveThresholdPx = 8;
  const touchHoldDelayMs = 320;
  const lifecycle = lifecycleFactory({ documentObject, windowObject, tabsElement });
  const view = viewFactory({ documentObject, windowObject, tabsElement });
  let disposed = false;
  let started = false;
  let supported = false;
  let gesture = null;
  let committing = false;
  let suppressClickUntil = 0;
  let suppressTouchContextMenuUntil = 0;
  let suppressTouchContextMenuTabId = "";

  const now = () => windowObject?.performance?.now?.() ?? Date.now();
  const orderedTabs = () => Array.from(getOrderedTabs?.() || []);

  const clearHoldTimer = (state) => {
    if (!state?.holdTimer) return;
    windowObject?.clearTimeout?.(state.holdTimer);
    state.holdTimer = 0;
  };

  const releaseCapture = (state) => {
    try {
      if (state?.button?.hasPointerCapture?.(state.pointerId)) {
        state.button.releasePointerCapture(state.pointerId);
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  };

  const restoreOriginalOrder = (state) => {
    view.restoreOrder(state?.originalTabIds, (tabId) => getTab(tabId)?.button || null);
  };

  const cancelGesture = ({ restore = true } = {}) => {
    const state = gesture;
    if (!state) return false;
    gesture = null;
    lifecycle.clearTransient();
    clearHoldTimer(state);
    releaseCapture(state);
    if (state.dragging) {
      view.finish(state);
      if (restore) restoreOriginalOrder(state);
    }
    return true;
  };

  const beginDrag = (state) => {
    if (!state || state !== gesture || state.dragging || committing) return false;
    clearHoldTimer(state);
    state.dragging = true;
    view.begin(state);
    return true;
  };

  const commit = async (state, beforeTabId) => {
    committing = true;
    documentObject?.body?.classList?.add("is-tab-reorder-committing");
    try {
      await postWorkspaceAction("reorder_tab", {
        tab_id: state.tabId,
        before_tab_id: beforeTabId,
      }, {
        focus: false,
        preferStateActiveTab: false,
        preserveLocalState: true,
      });
    } catch (error) {
      restoreOriginalOrder(state);
      showToast(error?.message || "标签排序失败。");
      try {
        await refreshWorkspace({ focus: false, reason: "tab_reorder_failed" });
      } catch {
        // The restored local order remains usable until normal refresh recovery succeeds.
      }
    } finally {
      committing = false;
      documentObject?.body?.classList?.remove("is-tab-reorder-committing");
    }
  };

  const finishGesture = (event, { cancel = false } = {}) => {
    const state = gesture;
    if (!state || (event?.pointerId != null && event.pointerId !== state.pointerId)) return;
    gesture = null;
    lifecycle.clearTransient();
    clearHoldTimer(state);
    releaseCapture(state);
    if (!state.dragging) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    view.finish(state);
    suppressClickUntil = now() + 350;
    if (cancel) {
      restoreOriginalOrder(state);
      return;
    }
    const beforeTabId = view.beforeTabId(state);
    const originalBeforeTabId = state.originalTabIds[state.originalIndex + 1] || "";
    if (beforeTabId === originalBeforeTabId) return;
    void commit(state, beforeTabId);
  };

  const handleMove = (event) => {
    const state = gesture;
    if (!state || event?.pointerId !== state.pointerId) return;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    const distance = Math.hypot(state.lastX - state.startX, state.lastY - state.startY);
    if (!state.dragging) {
      if (distance < moveThresholdPx) return;
      if (!state.dragReady) {
        cancelGesture();
        return;
      }
      beginDrag(state);
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    view.moveDraggedButton(state);
    view.updatePlaceholder(state);
    view.updateAutoScroll(state);
  };

  const handlePointerDown = (event) => {
    const button = event?.target?.closest?.(".tab");
    const pointerType = String(event?.pointerType || "mouse");
    if (
      !button
      || committing
      || gesture
      || event?.isPrimary === false
      || orderedTabs().length <= 1
      || (pointerType === "mouse" && event.button !== 0)
      || event.target?.closest?.(".tab-close")
      || isRenaming(button.dataset?.tabId)
      || !supported
      || (pointerType === "touch" && !isTouchReorderLayout())
    ) return;

    const tabId = button.dataset?.tabId || "";
    const originalTabs = orderedTabs();
    const originalIndex = originalTabs.findIndex((tab) => tab.id === tabId);
    if (originalIndex < 0) return;

    activateTab(tabId, { focus: false });
    gesture = {
      pointerId: event.pointerId,
      pointerType,
      tabId,
      button,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      originalIndex,
      originalTabIds: originalTabs.map((tab) => tab.id),
      dragReady: pointerType !== "touch",
      dragging: false,
      placeholder: null,
      holdTimer: 0,
    };
    if (pointerType === "touch") {
      event.preventDefault?.();
      suppressTouchContextMenuUntil = now() + touchHoldDelayMs + 1200;
      suppressTouchContextMenuTabId = tabId;
      const state = gesture;
      state.holdTimer = windowObject?.setTimeout?.(() => {
        if (gesture === state && !state.dragging) {
          state.dragReady = true;
          beginDrag(state);
        }
      }, touchHoldDelayMs) || 0;
    }
    button.setPointerCapture?.(event.pointerId);
    lifecycle.trackPointer({
      onMove: handleMove,
      onEnd: (nextEvent) => finishGesture(nextEvent),
      onCancel: (nextEvent) => finishGesture(nextEvent, { cancel: true }),
    });
  };

  const handleContextMenu = (event) => {
    const tabId = event?.target?.closest?.(".tab")?.dataset?.tabId || "";
    if (
      !tabId
      || tabId !== suppressTouchContextMenuTabId
      || now() >= suppressTouchContextMenuUntil
      || event?.sourceCapabilities?.firesTouchEvents === false
    ) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };

  const beforeApplyWorkspaceState = (state) => {
    supported = Array.isArray(state?.agent_capabilities)
      && state.agent_capabilities.includes(reorderCapability);
    if (gesture && !committing) cancelGesture();
  };

  const start = () => {
    if (started || disposed) return false;
    started = true;
    return lifecycle.start({
      onPointerDown: handlePointerDown,
      onContextMenu: handleContextMenu,
      onClick: (event) => {
        if (now() >= suppressClickUntil) return;
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
      },
      onKeyDown: (event) => {
        if (event?.key === "Escape" && gesture) {
          event.preventDefault?.();
          cancelGesture();
        }
      },
      onBlur: () => cancelGesture(),
    });
  };

  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    cancelGesture();
    committing = false;
    documentObject?.body?.classList?.remove("is-tab-reorder-committing");
    view.dispose();
    lifecycle.dispose();
    return true;
  };

  return Object.freeze({ beforeApplyWorkspaceState, dispose, isSupported: () => supported, start });
}
