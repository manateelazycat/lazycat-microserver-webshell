import { createTerminalOverviewLifecycle } from "./overview_lifecycle.js";
import { createTerminalOverviewPreviewController } from "./preview_controller.js";
import { createTerminalOverviewView } from "./overview_view.js";

const noop = () => {};

export function createTerminalOverviewController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  terminalArea = documentObject?.getElementById?.("terminalArea"),
  view = createTerminalOverviewView({ documentObject, windowObject, terminalArea }),
  lifecycleFactory = createTerminalOverviewLifecycle,
  getOrderedTabs = () => [],
  getActiveTabId = () => "",
  getActiveName = () => "",
  workspaceLocationURL = () => windowObject?.location?.href || "",
  isMobileLayout = () => false,
  isFrameHoldCurrent = () => false,
  canPersistPreview = () => false,
  previewController = null,
  onPreviewError = noop,
  prepareOpen = noop,
  isBlockingOverlayOpen = () => false,
  createTab = async () => {},
  activateTab = noop,
  closeTab = noop,
  canReorderTabs = () => false,
  reorderTab = async () => {},
  showToast = noop,
  measureTask = (_name, task) => task(),
} = {}) {
  const mobileOverviewSwipeEdgeWidth = 24;
  const mobileOverviewSwipeAxisThreshold = 12;
  const mobileOverviewSwipeNativeBackBlockDistance = 4;
  const mobileOverviewSwipeOpenDistance = 56;
  const mobileOverviewSwipeMaxVerticalTravel = 40;
  const mobileOverviewHistoryGuardStateKey = "webshellMobileOverviewGuard";
  const tabOverviewDragMoveThresholdPx = 8;
  const tabOverviewDragHoldDelayMs = 320;
  const tabOverviewDragAutoScrollEdgePx = 58;
  const tabOverviewDragAutoScrollMaxStepPx = 14;

  let started = false;
  let disposed = false;
  let tabOverviewRenderFrame = 0;
  let tabOverviewFocusFrame = 0;
  let tabOverviewDragState = null;
  let tabOverviewSuppressClickUntil = 0;
  let mobileOverviewEdgeSwipe = null;
  let dragTrackingCleanups = [];
  let dragTouchMoveCleanup = null;
  const ownedFrames = new Set();
  const tabOverviewReorderAnimationTimers = new Map();
  const overviewPreview = previewController || createTerminalOverviewPreviewController({
    documentObject,
    windowObject,
    canCapturePane: canPersistPreview,
    onReady: () => scheduleTabOverviewRender(),
    onError: onPreviewError,
  });

  const orderedTabsSnapshot = () => Array.from(getOrderedTabs?.() || []);
  const hasTab = (tabId) => orderedTabsSnapshot().some((tab) => tab?.id === tabId);
  const now = () => windowObject?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now();

  const requestFrame = (callback) => {
    if (typeof windowObject?.requestAnimationFrame !== "function") {
      return windowObject?.setTimeout?.(callback, 0) || 0;
    }
    let frame = 0;
    frame = windowObject.requestAnimationFrame(() => {
      ownedFrames.delete(frame);
      callback();
    });
    ownedFrames.add(frame);
    return frame;
  };

  const cancelFrame = (frame) => {
    if (!frame) {
      return;
    }
    ownedFrames.delete(frame);
    if (typeof windowObject?.cancelAnimationFrame === "function") {
      windowObject.cancelAnimationFrame(frame);
      return;
    }
    windowObject?.clearTimeout?.(frame);
  };

  const paneOverviewSource = (pane) => {
    const liveCanvas = pane?.term?.canvas || pane?.term?.element?.querySelector?.("canvas");
    const liveFrame = pane?.renderReady && pane?.hasPresentedFrame ? liveCanvas : null;
    const heldFrame = isFrameHoldCurrent(pane) ? pane.terminalFrameHold : null;
    const persistedFrame = overviewPreview.get(pane);
    if (!liveFrame && !heldFrame && !persistedFrame) {
      overviewPreview.prepare(pane);
    }
    return liveFrame || heldFrame || persistedFrame;
  };

  const renderTabOverview = () => measureTask("tab overview render", () => {
    if (disposed || !view.elements?.grid || tabOverviewDragState?.dragging) {
      return;
    }
    if (tabOverviewDragState) {
      finishTabOverviewDrag({ cancel: true });
    }
    const orderedTabs = orderedTabsSnapshot();
    const previewItems = view.renderTabs?.({
      orderedTabs,
      activeTabId: getActiveTabId(),
      mobileLayout: isMobileLayout(),
    }) || [];
    for (const item of previewItems) {
      view.drawPreview?.(item.canvas, item.tab, paneOverviewSource);
    }
  });

  function scheduleTabOverviewRender() {
    if (disposed || !isTabOverviewOpen() || tabOverviewRenderFrame) {
      return;
    }
    tabOverviewRenderFrame = requestFrame(() => {
      tabOverviewRenderFrame = 0;
      renderTabOverview();
    });
  }

  const stopTabOverviewDragTracking = () => {
    for (const cleanup of dragTrackingCleanups.splice(0)) {
      cleanup();
    }
    dragTouchMoveCleanup?.();
    dragTouchMoveCleanup = null;
  };

  const stopTabOverviewDragAutoScroll = (state) => {
    if (state?.autoScrollFrame) {
      cancelFrame(state.autoScrollFrame);
      state.autoScrollFrame = 0;
    }
    if (state) {
      state.autoScrollStep = 0;
    }
  };

  const getTabOverviewReorderRects = () => {
    const grid = view.elements?.grid;
    if (!grid) {
      return new Map();
    }
    return new Map(
      Array.from(grid.querySelectorAll(".tab-overview-card:not(.is-dragging)"))
        .map((card) => [card, card.getBoundingClientRect()]),
    );
  };

  const cancelTabOverviewReorderAnimationTimer = (card) => {
    const timer = tabOverviewReorderAnimationTimers.get(card);
    if (!timer) {
      return;
    }
    windowObject?.clearTimeout?.(timer);
    tabOverviewReorderAnimationTimers.delete(card);
  };

  const clearTabOverviewReorderAnimation = (card) => {
    cancelTabOverviewReorderAnimationTimer(card);
    card.classList.remove("is-reordering");
    card.style.removeProperty("transition");
    card.style.removeProperty("transform");
  };

  const animateTabOverviewReorder = (beforeRects) => {
    const grid = view.elements?.grid;
    if (!grid || !beforeRects.size) {
      return;
    }
    for (const card of grid.querySelectorAll(".tab-overview-card:not(.is-dragging)")) {
      const before = beforeRects.get(card);
      if (!before) {
        continue;
      }
      const after = card.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        continue;
      }
      cancelTabOverviewReorderAnimationTimer(card);
      card.classList.remove("is-reordering");
      card.style.transition = "none";
      card.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`;
      card.getBoundingClientRect();
      card.style.removeProperty("transition");
      card.classList.add("is-reordering");
      requestFrame(() => card.style.removeProperty("transform"));
      const cleanupTimer = windowObject?.setTimeout?.(() => {
        if (tabOverviewReorderAnimationTimers.get(card) === cleanupTimer) {
          tabOverviewReorderAnimationTimers.delete(card);
          card.classList.remove("is-reordering");
        }
      }, 180) || 0;
      tabOverviewReorderAnimationTimers.set(card, cleanupTimer);
    }
  };

  const clearTabOverviewReorderAnimations = () => {
    for (const card of [...tabOverviewReorderAnimationTimers.keys()]) {
      clearTabOverviewReorderAnimation(card);
    }
    const grid = view.elements?.grid;
    for (const card of grid?.querySelectorAll?.(".tab-overview-card.is-reordering") || []) {
      clearTabOverviewReorderAnimation(card);
    }
  };

  const resetTabOverviewDraggedCard = (state) => {
    const grid = view.elements?.grid;
    const card = state?.card;
    const placeholder = state?.placeholder;
    if (state?.longPressTimer) {
      windowObject?.clearTimeout?.(state.longPressTimer);
      state.longPressTimer = 0;
    }
    stopTabOverviewDragAutoScroll(state);
    clearTabOverviewReorderAnimations();
    if (!card) {
      return;
    }
    try {
      if (state?.pointerId != null && card.hasPointerCapture?.(state.pointerId)) {
        card.releasePointerCapture(state.pointerId);
      }
    } catch (error) {
    }
    card.classList.remove("is-dragging");
    for (const property of ["position", "left", "top", "width", "height", "z-index", "transform"]) {
      card.style.removeProperty(property);
    }
    if (placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
    } else if (grid && !grid.contains(card)) {
      grid.appendChild(card);
    }
    grid?.classList.remove("is-dragging");
    documentObject?.body?.classList?.remove("is-tab-overview-dragging");
  };

  const moveTabToOverviewIndex = async (tabId, targetIndex) => {
    const ordered = orderedTabsSnapshot();
    const currentIndex = ordered.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) {
      return;
    }
    const safeTarget = Math.max(0, Math.min(targetIndex, ordered.length - 1));
    if (safeTarget === currentIndex) {
      return;
    }
    const desired = ordered.filter((tab) => tab.id !== tabId);
    desired.splice(safeTarget, 0, ordered[currentIndex]);
    const beforeTabId = desired[safeTarget + 1]?.id || "";
    await reorderTab(tabId, beforeTabId);
  };

  function finishTabOverviewDrag({ cancel = false } = {}) {
    const state = tabOverviewDragState;
    if (!state) {
      return;
    }
    stopTabOverviewDragTracking();
    const grid = view.elements?.grid;
    const placeholder = state.placeholder;
    const orderedCards = Array.from(grid?.children || [])
      .filter((child) => child.classList?.contains("tab-overview-card") || child.classList?.contains("tab-overview-card-placeholder"));
    const targetIndex = placeholder ? orderedCards.indexOf(placeholder) : state.originalIndex;
    const shouldMove = state.dragging && !cancel && targetIndex >= 0 && targetIndex !== state.originalIndex;
    resetTabOverviewDraggedCard(state);
    tabOverviewDragState = null;
    if (!state.dragging) {
      return;
    }
    tabOverviewSuppressClickUntil = now() + 350;
    if (shouldMove) {
      moveTabToOverviewIndex(state.tabId, targetIndex).catch((error) => {
        showToast(error?.message || "标签排序失败。");
        scheduleTabOverviewRender();
      });
    }
  }

  function handleTabOverviewDragEnd(event) {
    if (tabOverviewDragState && event?.pointerId !== tabOverviewDragState.pointerId) {
      return;
    }
    if (tabOverviewDragState?.dragging) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    }
    finishTabOverviewDrag();
  }

  function handleTabOverviewDragCancel(event) {
    if (tabOverviewDragState && event?.pointerId !== tabOverviewDragState.pointerId) {
      return;
    }
    finishTabOverviewDrag({ cancel: true });
  }

  function handleTabOverviewDragTouchMove(event) {
    if (!tabOverviewDragState?.dragging) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  const beginTabOverviewDrag = (state) => {
    const grid = view.elements?.grid;
    if (!grid || state.dragging) {
      return;
    }
    if (state.longPressTimer) {
      windowObject?.clearTimeout?.(state.longPressTimer);
      state.longPressTimer = 0;
    }
    const rect = state.card.getBoundingClientRect();
    const placeholder = documentObject.createElement("div");
    placeholder.className = "tab-overview-card-placeholder";
    placeholder.style.height = `${Math.round(rect.height)}px`;
    grid.insertBefore(placeholder, state.card);
    documentObject.body.appendChild(state.card);
    state.card.classList.add("is-dragging");
    state.card.style.position = "fixed";
    state.card.style.left = `${Math.round(rect.left)}px`;
    state.card.style.top = `${Math.round(rect.top)}px`;
    state.card.style.width = `${Math.round(rect.width)}px`;
    state.card.style.height = `${Math.round(rect.height)}px`;
    state.card.style.zIndex = "110";
    state.card.style.transform = "translate3d(0, 0, 0)";
    state.dragging = true;
    state.placeholder = placeholder;
    grid.classList.add("is-dragging");
    documentObject.body.classList.add("is-tab-overview-dragging");
    if (state.pointerType !== "mouse") {
      dragTouchMoveCleanup = lifecycle.listenTransient(
        documentObject,
        "touchmove",
        handleTabOverviewDragTouchMove,
        { capture: true, passive: false },
      );
    }
  };

  const findTabOverviewPlaceholderTarget = (state) => {
    const grid = view.elements?.grid;
    if (!grid) {
      return null;
    }
    const cards = Array.from(grid.querySelectorAll(".tab-overview-card:not(.is-dragging)"));
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (
        state.lastY < rect.top + rect.height / 2
        || (state.lastY <= rect.bottom && state.lastX < rect.left + rect.width / 2)
      ) {
        return card;
      }
    }
    return null;
  };

  const updateTabOverviewDragPlaceholder = (state) => {
    const grid = view.elements?.grid;
    if (!grid || !state.placeholder) {
      return;
    }
    const before = findTabOverviewPlaceholderTarget(state);
    if (before === state.placeholder.nextElementSibling || (!before && state.placeholder === grid.lastElementChild)) {
      return;
    }
    const beforeRects = getTabOverviewReorderRects();
    if (before) {
      grid.insertBefore(state.placeholder, before);
    } else {
      grid.appendChild(state.placeholder);
    }
    animateTabOverviewReorder(beforeRects);
  };

  const updateTabOverviewDragAutoScroll = (state) => {
    const grid = view.elements?.grid;
    if (!grid || !state.dragging) {
      stopTabOverviewDragAutoScroll(state);
      return;
    }
    const rect = grid.getBoundingClientRect();
    const topDistance = state.lastY - rect.top;
    const bottomDistance = rect.bottom - state.lastY;
    let step = 0;
    if (topDistance >= 0 && topDistance < tabOverviewDragAutoScrollEdgePx) {
      step = -Math.ceil((1 - topDistance / tabOverviewDragAutoScrollEdgePx) * tabOverviewDragAutoScrollMaxStepPx);
    } else if (bottomDistance >= 0 && bottomDistance < tabOverviewDragAutoScrollEdgePx) {
      step = Math.ceil((1 - bottomDistance / tabOverviewDragAutoScrollEdgePx) * tabOverviewDragAutoScrollMaxStepPx);
    }
    state.autoScrollStep = step;
    if (!step) {
      stopTabOverviewDragAutoScroll(state);
      return;
    }
    if (state.autoScrollFrame) {
      return;
    }
    const tick = () => {
      if (tabOverviewDragState !== state || !state.dragging || !state.autoScrollStep) {
        stopTabOverviewDragAutoScroll(state);
        return;
      }
      const beforeScrollTop = grid.scrollTop;
      grid.scrollTop += state.autoScrollStep;
      if (grid.scrollTop !== beforeScrollTop) {
        updateTabOverviewDragPlaceholder(state);
      }
      state.autoScrollFrame = requestFrame(tick);
    };
    state.autoScrollFrame = requestFrame(tick);
  };

  function handleTabOverviewDragMove(event) {
    const state = tabOverviewDragState;
    if (!state || event?.pointerId !== state.pointerId) {
      return;
    }
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    const dx = state.lastX - state.startX;
    const dy = state.lastY - state.startY;
    if (!state.dragging) {
      if (Math.hypot(dx, dy) < tabOverviewDragMoveThresholdPx) {
        return;
      }
      if (state.pointerType !== "mouse" && !state.dragReady) {
        finishTabOverviewDrag({ cancel: true });
        return;
      }
      beginTabOverviewDrag(state);
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    state.card.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`;
    updateTabOverviewDragPlaceholder(state);
    updateTabOverviewDragAutoScroll(state);
  }

  function handleTabOverviewCardPointerDown(event) {
    const card = view.closestCard?.(event?.target);
    if (
      !card
      || !canReorderTabs()
      || event?.isPrimary === false
      || !isTabOverviewOpen()
      || orderedTabsSnapshot().length <= 1
      || (event.pointerType === "mouse" && event.button !== 0)
      || view.closestCloseButton?.(event.target)
    ) {
      return;
    }
    const ordered = orderedTabsSnapshot();
    const tabId = card.dataset?.tabId || "";
    const originalIndex = ordered.findIndex((tab) => tab.id === tabId);
    if (originalIndex < 0) {
      return;
    }
    finishTabOverviewDrag({ cancel: true });
    tabOverviewDragState = {
      pointerId: event.pointerId,
      tabId,
      card,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerType: event.pointerType,
      originalIndex,
      dragReady: event.pointerType === "mouse",
      dragging: false,
      placeholder: null,
      longPressTimer: 0,
      autoScrollFrame: 0,
      autoScrollStep: 0,
    };
    if (event.pointerType !== "mouse") {
      const state = tabOverviewDragState;
      state.longPressTimer = windowObject?.setTimeout?.(() => {
        if (tabOverviewDragState === state && !state.dragging) {
          state.dragReady = true;
          beginTabOverviewDrag(state);
        }
      }, tabOverviewDragHoldDelayMs) || 0;
    }
    card.setPointerCapture?.(event.pointerId);
    dragTrackingCleanups = [
      lifecycle.listenTransient(documentObject, "pointermove", handleTabOverviewDragMove, { capture: true, passive: false }),
      lifecycle.listenTransient(documentObject, "pointerup", handleTabOverviewDragEnd, { capture: true, passive: false }),
      lifecycle.listenTransient(documentObject, "pointercancel", handleTabOverviewDragCancel, { capture: true }),
    ];
  }

  const isTabOverviewOpen = () => !disposed && view.isOpen?.() === true;

  const closeTabOverview = () => {
    finishTabOverviewDrag({ cancel: true });
    if (tabOverviewRenderFrame) {
      cancelFrame(tabOverviewRenderFrame);
      tabOverviewRenderFrame = 0;
    }
    if (tabOverviewFocusFrame) {
      cancelFrame(tabOverviewFocusFrame);
      tabOverviewFocusFrame = 0;
    }
    view.setOpen?.(false);
  };

  const openTabOverview = () => {
    if (disposed || !view.elements?.root) {
      return;
    }
    prepareOpen();
    view.setOpen?.(true);
    renderTabOverview();
    scheduleTabOverviewRender();
    tabOverviewFocusFrame = requestFrame(() => {
      tabOverviewFocusFrame = 0;
      if (!disposed && isTabOverviewOpen()) {
        view.focusActiveCard?.();
      }
    });
  };

  const selectTabFromOverview = (tabId) => {
    if (!hasTab(tabId)) {
      return;
    }
    closeTabOverview();
    activateTab(tabId);
  };

  const closeTabFromOverview = (tabId) => {
    if (hasTab(tabId)) {
      closeTab(tabId);
    }
  };

  const handleTabOverviewClick = (event) => {
    if (now() < tabOverviewSuppressClickUntil) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    const target = event?.target;
    if (view.isBackdropTarget?.(target)) {
      closeTabOverview();
      return;
    }
    const closeButton = view.closestCloseButton?.(target);
    if (closeButton) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      closeTabFromOverview(closeButton.dataset?.tabOverviewClose);
      return;
    }
    const cardButton = view.closestCardButton?.(target);
    if (cardButton) {
      selectTabFromOverview(cardButton.dataset?.tabId);
      return;
    }
    const card = view.closestCard?.(target);
    if (card) {
      selectTabFromOverview(card.dataset?.tabId);
      return;
    }
    if (!view.isHeaderTarget?.(target)) {
      closeTabOverview();
    }
  };

  const currentHistoryStateObject = () => {
    const state = windowObject?.history?.state;
    return state && typeof state === "object" ? state : {};
  };

  const historyStateWithoutMobileOverviewGuard = () => {
    const state = { ...currentHistoryStateObject() };
    delete state[mobileOverviewHistoryGuardStateKey];
    return state;
  };

  const withMobileOverviewHistoryGuard = (state = currentHistoryStateObject()) => ({
    ...state,
    [mobileOverviewHistoryGuardStateKey]: true,
  });

  const ensureMobileOverviewHistoryGuard = () => {
    if (!isMobileLayout()) {
      return;
    }
    const state = currentHistoryStateObject();
    if (state[mobileOverviewHistoryGuardStateKey]) {
      return;
    }
    windowObject?.history?.pushState?.(withMobileOverviewHistoryGuard(state), "", windowObject?.location?.href);
  };

  const refreshMobileOverviewHistoryGuardForUserGesture = () => {
    if (!isMobileLayout()) {
      return;
    }
    const state = currentHistoryStateObject();
    if (!state[mobileOverviewHistoryGuardStateKey]) {
      windowObject?.history?.pushState?.(withMobileOverviewHistoryGuard(state), "", windowObject?.location?.href);
      return;
    }
    windowObject?.history?.replaceState?.(withMobileOverviewHistoryGuard(state), "", windowObject?.location?.href);
  };

  const updateWorkspaceLocation = ({ name, url, replace = false } = {}) => {
    const currentState = currentHistoryStateObject();
    const nextState = { ...currentState, name };
    if (!replace) {
      delete nextState[mobileOverviewHistoryGuardStateKey];
    } else if (currentState[mobileOverviewHistoryGuardStateKey]) {
      nextState[mobileOverviewHistoryGuardStateKey] = true;
    }
    if (replace) {
      windowObject?.history?.replaceState?.(nextState, "", url);
    } else {
      windowObject?.history?.pushState?.(nextState, "", url);
    }
    ensureMobileOverviewHistoryGuard();
  };

  const hasBlockingOverviewGestureOverlayOpen = () => Boolean(
    isTabOverviewOpen() || isBlockingOverlayOpen()
  );

  const openTabOverviewFromHistoryBack = () => {
    if (!isMobileLayout()) {
      return false;
    }
    const state = currentHistoryStateObject();
    if (state[mobileOverviewHistoryGuardStateKey]) {
      return false;
    }
    let restoredState = state;
    const activeName = String(getActiveName() || "").trim();
    if (activeName) {
      restoredState = {
        ...historyStateWithoutMobileOverviewGuard(),
        name: activeName,
      };
      windowObject?.history?.replaceState?.(
        restoredState,
        "",
        workspaceLocationURL(activeName, getActiveTabId()),
      );
    }
    windowObject?.history?.pushState?.(withMobileOverviewHistoryGuard(restoredState), "", windowObject?.location?.href);
    if (!hasBlockingOverviewGestureOverlayOpen()) {
      openTabOverview();
    }
    return true;
  };

  const resetMobileOverviewEdgeSwipe = () => {
    mobileOverviewEdgeSwipe = null;
  };

  const handleMobileOverviewEdgeSwipeStart = (event) => {
    if (!isMobileLayout() || event?.touches?.length !== 1 || hasBlockingOverviewGestureOverlayOpen()) {
      resetMobileOverviewEdgeSwipe();
      return;
    }
    const touch = event.touches[0];
    const viewportWidth = Math.max(
      1,
      Math.round(
        windowObject?.visualViewport?.width
        || windowObject?.innerWidth
        || documentObject?.documentElement?.clientWidth
        || 1,
      ),
    );
    let edge = "";
    if (touch.clientX <= mobileOverviewSwipeEdgeWidth) {
      edge = "left";
    } else if (viewportWidth - touch.clientX <= mobileOverviewSwipeEdgeWidth) {
      edge = "right";
    }
    if (!edge) {
      resetMobileOverviewEdgeSwipe();
      return;
    }
    refreshMobileOverviewHistoryGuardForUserGesture();
    mobileOverviewEdgeSwipe = {
      edge,
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
      opened: false,
    };
  };

  const handleMobileOverviewEdgeSwipeMove = (event) => {
    if (!mobileOverviewEdgeSwipe || event?.touches?.length !== 1) {
      return;
    }
    if (mobileOverviewEdgeSwipe.opened) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    if (!isMobileLayout() || hasBlockingOverviewGestureOverlayOpen()) {
      resetMobileOverviewEdgeSwipe();
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - mobileOverviewEdgeSwipe.startX;
    const deltaY = touch.clientY - mobileOverviewEdgeSwipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const directedDeltaX = mobileOverviewEdgeSwipe.edge === "left" ? deltaX : -deltaX;
    if (directedDeltaX < -mobileOverviewSwipeAxisThreshold) {
      resetMobileOverviewEdgeSwipe();
      return;
    }
    if (!mobileOverviewEdgeSwipe.horizontal) {
      if (absY > mobileOverviewSwipeAxisThreshold && absY > absX) {
        resetMobileOverviewEdgeSwipe();
        return;
      }
      if (directedDeltaX >= mobileOverviewSwipeNativeBackBlockDistance && absX > absY) {
        event.preventDefault?.();
        event.stopPropagation?.();
      }
      if (directedDeltaX > mobileOverviewSwipeAxisThreshold && absX > absY * 1.2) {
        mobileOverviewEdgeSwipe.horizontal = true;
      }
    }
    if (!mobileOverviewEdgeSwipe?.horizontal) {
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    if (
      !mobileOverviewEdgeSwipe.opened
      && directedDeltaX >= mobileOverviewSwipeOpenDistance
      && absY <= mobileOverviewSwipeMaxVerticalTravel
    ) {
      mobileOverviewEdgeSwipe.opened = true;
      openTabOverview();
    }
  };

  const lifecycle = lifecycleFactory({
    documentObject,
    windowObject,
    elements: view.elements,
    handlers: {
      onToggle: (event) => {
        event?.preventDefault?.();
        openTabOverview();
      },
      onClose: (event) => {
        event?.preventDefault?.();
        closeTabOverview();
      },
      onNewTab: (event) => {
        event?.preventDefault?.();
        Promise.resolve(createTab()).then(() => closeTabOverview()).catch((error) => {
          showToast(error?.message || String(error));
        });
      },
      onRootClick: handleTabOverviewClick,
      onCardPointerDown: handleTabOverviewCardPointerDown,
      onEdgeSwipeStart: handleMobileOverviewEdgeSwipeStart,
      onEdgeSwipeMove: handleMobileOverviewEdgeSwipeMove,
      onEdgeSwipeEnd: resetMobileOverviewEdgeSwipe,
      onResize: () => {
        ensureMobileOverviewHistoryGuard();
        scheduleTabOverviewRender();
      },
    },
  });

  return Object.freeze({
    close: closeTabOverview,
    consumeHistoryBack: openTabOverviewFromHistoryBack,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      finishTabOverviewDrag({ cancel: true });
      stopTabOverviewDragTracking();
      if (tabOverviewRenderFrame) {
        cancelFrame(tabOverviewRenderFrame);
        tabOverviewRenderFrame = 0;
      }
      if (tabOverviewFocusFrame) {
        cancelFrame(tabOverviewFocusFrame);
        tabOverviewFocusFrame = 0;
      }
      for (const frame of [...ownedFrames]) {
        cancelFrame(frame);
      }
      clearTabOverviewReorderAnimations();
      resetMobileOverviewEdgeSwipe();
      overviewPreview.dispose();
      lifecycle.dispose?.();
      view.setOpen?.(false);
    },
    capturePreview: (pane, options) => overviewPreview.capture(pane, options),
    captureAllPreviews: (panes, options) => overviewPreview.captureAll(panes, options),
    deletePreview: (pane) => overviewPreview.delete(pane),
    isOpen: isTabOverviewOpen,
    open: openTabOverview,
    scheduleRender: scheduleTabOverviewRender,
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start?.();
      overviewPreview.cleanup();
      ensureMobileOverviewHistoryGuard();
    },
    updateWorkspaceLocation,
  });
}
