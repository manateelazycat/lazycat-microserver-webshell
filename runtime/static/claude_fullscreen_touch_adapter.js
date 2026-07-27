import {
  createClaudeFullscreenTouchGesture,
  resolveClaudeFullscreenTouchCompletion,
} from "./claude_fullscreen_touch.js";

export const installClaudeFullscreenTouchAdapter = ({
  shell,
  shouldStart,
  cellFromPoint,
  activatePane,
  markContextMenuCandidate,
  blurInput,
  suppressTouchScroll,
  applySelection,
  updateSelectionHandles,
  updateSelectionAutoScroll,
  stopSelectionAutoScroll,
  clearSelectionIfTapOutside,
  hasSelection,
  consumeKeyboardClaim,
  prepareMouseInput,
  rowHeight,
  sendWheel,
  sendClick,
  registerCleanup,
  moveThresholdPx = 8,
  longPressDelayMs = 450,
}) => {
  if (!shell) {
    return;
  }

  const gesture = createClaudeFullscreenTouchGesture({ moveThresholdPx });
  let startCell = null;
  let longPressTimer = 0;
  let selectionAutoScrollState = null;
  let mouseInputPrepared = false;

  const stopEvent = (event, { preventDefault = true } = {}) => {
    if (preventDefault && event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const clearLongPressTimer = () => {
    if (!longPressTimer) {
      return;
    }
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  };

  const clearState = ({ cancelGesture = true } = {}) => {
    clearLongPressTimer();
    stopSelectionAutoScroll(selectionAutoScrollState);
    selectionAutoScrollState = null;
    startCell = null;
    mouseInputPrepared = false;
    if (cancelGesture) {
      gesture.cancel();
    }
  };

  const ensureMouseInputPrepared = (event) => {
    if (mouseInputPrepared) {
      return;
    }
    mouseInputPrepared = true;
    prepareMouseInput(event);
  };

  const activeTouch = (event, changed = false) => {
    const snapshot = gesture.snapshot();
    if (snapshot.phase === "idle") {
      return null;
    }
    const touches = Array.from(changed ? event?.changedTouches || [] : event?.touches || []);
    return touches.find((touch) => touch.identifier === snapshot.identifier) || null;
  };

  const applySelectionAtPoint = (point) => {
    const current = point ? cellFromPoint(point.clientX, point.clientY) : null;
    if (!startCell || !current) {
      return false;
    }
    activatePane();
    applySelection(startCell, current);
    return true;
  };

  const beginSelection = () => {
    if (!gesture.beginSelection()) {
      return;
    }
    const snapshot = gesture.snapshot();
    if (!applySelectionAtPoint({ clientX: snapshot.lastX, clientY: snapshot.lastY })) {
      clearState();
      return;
    }
    clearLongPressTimer();
    blurInput();
    suppressTouchScroll();
    selectionAutoScrollState = {
      lastX: snapshot.lastX,
      lastY: snapshot.lastY,
      autoScrollTimer: 0,
      autoScrollDirection: 0,
      autoScrollApplyPoint: null,
    };
  };

  const handleTouchStart = (event) => {
    clearState();
    if (!shouldStart(event)) {
      return;
    }
    const touch = event.touches[0];
    const cell = cellFromPoint(touch.clientX, touch.clientY);
    if (!cell) {
      return;
    }
    startCell = cell;
    gesture.start(touch);
    activatePane();
    markContextMenuCandidate(touch);
    longPressTimer = window.setTimeout(beginSelection, longPressDelayMs);
    stopEvent(event, { preventDefault: false });
  };

  const handleTouchMove = (event) => {
    if (gesture.snapshot().phase === "idle") {
      return;
    }
    if (event.touches.length !== 1) {
      stopEvent(event);
      clearState();
      return;
    }
    const touch = activeTouch(event);
    if (!touch) {
      stopEvent(event);
      clearState();
      return;
    }
    stopEvent(event);
    const snapshot = gesture.move(touch);
    if (selectionAutoScrollState) {
      selectionAutoScrollState.lastX = touch.clientX;
      selectionAutoScrollState.lastY = touch.clientY;
    }
    if (snapshot.phase === "scrolling") {
      clearLongPressTimer();
      stopSelectionAutoScroll(selectionAutoScrollState);
      selectionAutoScrollState = null;
      suppressTouchScroll();
      const steps = gesture.takeWheelSteps(rowHeight(), 10);
      if (steps) {
        ensureMouseInputPrepared(event);
        sendWheel(steps, event, touch);
      }
      return;
    }
    if (snapshot.phase !== "selecting") {
      return;
    }
    suppressTouchScroll();
    if (applySelectionAtPoint(touch) && selectionAutoScrollState) {
      updateSelectionAutoScroll(selectionAutoScrollState, applySelectionAtPoint);
    }
  };

  const finishTouch = (event) => {
    const snapshot = gesture.snapshot();
    if (snapshot.phase === "idle") {
      return;
    }
    const touch = activeTouch(event, true);
    const keyboardClaimed = consumeKeyboardClaim(event);
    stopEvent(event, { preventDefault: !keyboardClaimed });
    if (event.type === "touchcancel" || !touch) {
      const wasSelecting = snapshot.phase === "selecting";
      clearState();
      if (wasSelecting) {
        suppressTouchScroll();
        updateSelectionHandles();
      }
      return;
    }
    const outcome = resolveClaudeFullscreenTouchCompletion(
      gesture.finish(snapshot.identifier),
      { keyboardClaimed },
    );
    clearState({ cancelGesture: false });
    if (outcome === "keyboard" || outcome === "scrolling") {
      return;
    }
    if (outcome === "selecting") {
      suppressTouchScroll();
      updateSelectionHandles();
      return;
    }
    if (outcome === "tap") {
      if (clearSelectionIfTapOutside(touch) || hasSelection()) {
        return;
      }
      ensureMouseInputPrepared(event);
      sendClick(event, touch);
    }
  };

  shell.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
  shell.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
  shell.addEventListener("touchend", finishTouch, { capture: true, passive: false });
  shell.addEventListener("touchcancel", finishTouch, { capture: true, passive: false });
  registerCleanup(() => {
    shell.removeEventListener("touchstart", handleTouchStart, { capture: true });
    shell.removeEventListener("touchmove", handleTouchMove, { capture: true });
    shell.removeEventListener("touchend", finishTouch, { capture: true });
    shell.removeEventListener("touchcancel", finishTouch, { capture: true });
    clearState();
  });
};
