import { createTerminalMouseLifecycle } from "./mouse_lifecycle.js";
import {
  encodeTerminalMouseSequence,
  terminalMouseButtonFromButtons,
  terminalMouseButtonFromEvent,
  terminalMouseEventFromTouch,
  terminalMouseTrackingState,
} from "./mouse_model.js";

const defaultMoveThresholdPx = 8;
const defaultTapDurationMs = 320;
const defaultMaxWheelSteps = 10;

export function createTerminalMouseController({
  documentObject = globalThis.document,
  lifecycleFactory = createTerminalMouseLifecycle,
  cellFromPoint = () => null,
  activateSession = () => {},
  clearSelection = () => {},
  sendInput = () => {},
  reassertSize = () => {},
  isTouchLayout = () => false,
  requiresTouchKeyboardDoubleTap = () => false,
  isDeferredTouchClickSession = () => false,
  isKeyboardClaimed = () => false,
  shouldPreserveTouchDefault = (event) => isKeyboardClaimed(event) === true,
  registerSessionCleanup = () => {},
  now = () => globalThis.performance?.now?.() || Date.now(),
  moveThresholdPx = defaultMoveThresholdPx,
  tapDurationMs = defaultTapDurationMs,
  maxWheelSteps = defaultMaxWheelSteps,
} = {}) {
  const lifecycle = lifecycleFactory({ documentObject });
  const claimedEvents = new WeakSet();
  const cleanupRegisteredSessions = new WeakSet();
  const installedSessions = new WeakSet();
  const sessions = new Set();
  let started = false;
  let disposed = false;
  const eventTime = (event) => Number.isFinite(event?.timeStamp) && event.timeStamp >= 0 ? event.timeStamp : now();

  const start = () => {
    if (started || disposed) {
      return;
    }
    started = true;
    lifecycle.start();
  };

  const ensureSessionCleanup = (session) => {
    if (!session || cleanupRegisteredSessions.has(session)) {
      return;
    }
    cleanupRegisteredSessions.add(session);
    registerSessionCleanup(session, () => disposeSession(session));
  };

  const trackingState = (session) => disposed ? null : terminalMouseTrackingState(session);

  const encode = (session, event, action, button = -1) => {
    if (disposed) {
      return "";
    }
    const state = trackingState(session);
    if (!state) {
      return "";
    }
    const cell = cellFromPoint(session, event?.clientX, event?.clientY);
    return encodeTerminalMouseSequence({
      trackingState: state,
      cell,
      event,
      action,
      button,
    });
  };

  const sendClick = (session, event, touch = null) => {
    if (disposed || !session) {
      return false;
    }
    const mouseEvent = touch ? terminalMouseEventFromTouch(event, touch) : event;
    const press = encode(session, mouseEvent, "press", 0);
    if (!press) {
      return false;
    }
    const release = encode(session, mouseEvent, "release", 0);
    sendInput(session, press + release);
    return true;
  };

  const sendWheel = (session, steps, event, touch) => {
    if (disposed || !session) {
      return false;
    }
    const count = Math.abs(Math.trunc(Number(steps) || 0));
    if (!count) {
      return false;
    }
    const wheelEvent = terminalMouseEventFromTouch(event, touch, {
      deltaX: 0,
      deltaY: Math.sign(steps),
    });
    const sequence = encode(session, wheelEvent, "wheel");
    if (!sequence) {
      return false;
    }
    sendInput(session, sequence.repeat(count));
    return true;
  };

  const stopEvent = (event, { preventDefault = true } = {}) => {
    if (preventDefault) {
      event?.preventDefault?.();
    }
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  };

  const installSession = (session) => {
    if (disposed || installedSessions.has(session)) {
      return;
    }
    const shell = session?.shellEl;
    const host = session?.terminalHost;
    if (!shell || !host || !session?.term) {
      return;
    }
    start();
    installedSessions.add(session);
    sessions.add(session);
    ensureSessionCleanup(session);

    const isTerminalMouseTarget = (target) => target?.closest?.(".terminal-host") === host;
    const mouseState = {
      activeButton: -1,
      lastMoveSequence: "",
    };
    const touchMouseState = {
      identifier: -1,
      active: false,
      deferredClick: false,
      lastX: 0,
      lastY: 0,
    };
    const deferredTouchState = {
      active: false,
      startedAt: 0,
      startX: 0,
      startY: 0,
      moved: false,
      wheelRemainderY: 0,
    };

    const sendMouseSequence = (event, action, button = -1) => {
      const sequence = encode(session, event, action, button);
      if (!sequence) {
        return false;
      }
      if (action === "move") {
        if (sequence === mouseState.lastMoveSequence) {
          return true;
        }
        mouseState.lastMoveSequence = sequence;
      } else {
        mouseState.lastMoveSequence = "";
      }
      reassertSize(session, event);
      sendInput(session, sequence);
      return true;
    };

    const mouseEventFromTouch = (event, touch = null, extra = {}) => terminalMouseEventFromTouch(event, touch, {
      fallbackX: touchMouseState.lastX,
      fallbackY: touchMouseState.lastY,
      ...extra,
    });

    const flushDeferredTouchWheel = (event, touch) => {
      if (!deferredTouchState.moved || !deferredTouchState.wheelRemainderY) {
        return;
      }
      const renderer = session.term?.renderer;
      const rowHeight = Math.max(
        moveThresholdPx,
        Number(renderer?.getMetrics?.().height) || Number(renderer?.charHeight) || 18,
      );
      const rawSteps = deferredTouchState.wheelRemainderY / rowHeight;
      const wholeSteps = rawSteps > 0 ? Math.floor(rawSteps) : Math.ceil(rawSteps);
      if (!wholeSteps) {
        return;
      }
      const stepCount = Math.min(Math.abs(wholeSteps), maxWheelSteps);
      const direction = wholeSteps > 0 ? 1 : -1;
      const wheelEvent = mouseEventFromTouch(event, touch, {
        deltaX: 0,
        deltaY: direction,
      });
      for (let index = 0; index < stepCount; index += 1) {
        sendMouseSequence(wheelEvent, "wheel");
      }
      deferredTouchState.wheelRemainderY -= direction * stepCount * rowHeight;
    };

    const changedTouchForActiveMouse = (event) => {
      const touches = Array.from(event?.changedTouches || []);
      return touches.find((touch) => touch.identifier === touchMouseState.identifier) || null;
    };

    const resetTouchMouseState = () => {
      touchMouseState.identifier = -1;
      touchMouseState.active = false;
      touchMouseState.deferredClick = false;
      touchMouseState.lastX = 0;
      touchMouseState.lastY = 0;
    };

    const resetDeferredTouchState = () => {
      deferredTouchState.active = false;
      deferredTouchState.startedAt = 0;
      deferredTouchState.startX = 0;
      deferredTouchState.startY = 0;
      deferredTouchState.moved = false;
      deferredTouchState.wheelRemainderY = 0;
    };

    const finishDeferredTouchTap = (event, touch) => {
      if (isKeyboardClaimed(event)) {
        resetDeferredTouchState();
        return;
      }
      const currentTime = eventTime(event);
      const isTap = (
        event.type === "touchend"
        && deferredTouchState.active
        && touch
        && !deferredTouchState.moved
        && Math.abs(touch.clientX - deferredTouchState.startX) < moveThresholdPx
        && Math.abs(touch.clientY - deferredTouchState.startY) < moveThresholdPx
        && currentTime >= deferredTouchState.startedAt
        && currentTime - deferredTouchState.startedAt <= tapDurationMs
        && requiresTouchKeyboardDoubleTap()
        && isDeferredTouchClickSession(session)
        && trackingState(session)
      );
      if (isTap) {
        const mouseEvent = mouseEventFromTouch(event, touch);
        sendMouseSequence(mouseEvent, "press", 0);
        sendMouseSequence(mouseEvent, "release", 0);
      }
      resetDeferredTouchState();
    };

    const handleMouseDown = (event) => {
      if (claimedEvents.has(event)) {
        mouseState.activeButton = -1;
        mouseState.lastMoveSequence = "";
        return;
      }
      if (!isTerminalMouseTarget(event.target)) {
        return;
      }
      if (!trackingState(session)) {
        mouseState.activeButton = -1;
        mouseState.lastMoveSequence = "";
        return;
      }
      const button = terminalMouseButtonFromEvent(event);
      if (button < 0) {
        return;
      }
      stopEvent(event);
      activateSession(session);
      mouseState.activeButton = button;
      sendMouseSequence(event, "press", button);
    };

    const handleMouseMove = (event) => {
      if (claimedEvents.has(event)) {
        return;
      }
      const state = trackingState(session);
      if (!state) {
        mouseState.lastMoveSequence = "";
        return;
      }
      const button = terminalMouseButtonFromButtons(event.buttons, mouseState.activeButton);
      const hasCapturedButton = mouseState.activeButton >= 0;
      const isLocalTarget = isTerminalMouseTarget(event.target);
      if (!hasCapturedButton && !isLocalTarget) {
        return;
      }
      if (hasCapturedButton || (isLocalTarget && state.any)) {
        stopEvent(event);
      }
      sendMouseSequence(event, "move", hasCapturedButton ? button : -1);
    };

    const handleMouseUp = (event) => {
      if (claimedEvents.has(event)) {
        mouseState.activeButton = -1;
        mouseState.lastMoveSequence = "";
        return;
      }
      const hadActiveButton = mouseState.activeButton >= 0;
      const state = trackingState(session);
      if (!state && !hadActiveButton) {
        return;
      }
      const button = terminalMouseButtonFromEvent(event);
      const releasedButton = mouseState.activeButton >= 0 ? mouseState.activeButton : button;
      mouseState.activeButton = terminalMouseButtonFromButtons(event.buttons, mouseState.activeButton);
      if (mouseState.activeButton === releasedButton) {
        mouseState.activeButton = -1;
      }
      mouseState.lastMoveSequence = "";
      if (!state) {
        return;
      }
      if (hadActiveButton || isTerminalMouseTarget(event.target)) {
        stopEvent(event);
        sendMouseSequence(event, "release", releasedButton);
      }
    };

    const handleWheel = (event) => {
      if (!isTerminalMouseTarget(event.target) || !trackingState(session)) {
        return;
      }
      if (sendMouseSequence(event, "wheel")) {
        stopEvent(event);
      }
    };

    const handleClickLike = (event) => {
      if (claimedEvents.has(event)) {
        return;
      }
      if (isTerminalMouseTarget(event.target) && trackingState(session)) {
        stopEvent(event);
      }
    };

    const handleTouchStart = (event) => {
      const state = trackingState(session);
      if (
        !isTouchLayout()
        || event.touches.length !== 1
        || !isTerminalMouseTarget(event.target)
        || !state
      ) {
        resetTouchMouseState();
        resetDeferredTouchState();
        return;
      }
      const touch = event.touches[0];
      const deferredClick = requiresTouchKeyboardDoubleTap() && isDeferredTouchClickSession(session);
      const preservePageFocus = deferredClick && documentObject.hasFocus() !== true;
      stopEvent(event, { preventDefault: !preservePageFocus });
      activateSession(session);
      clearSelection(session);
      touchMouseState.identifier = touch.identifier;
      touchMouseState.active = true;
      touchMouseState.lastX = touch.clientX;
      touchMouseState.lastY = touch.clientY;
      touchMouseState.deferredClick = deferredClick;
      if (touchMouseState.deferredClick) {
        deferredTouchState.active = true;
        deferredTouchState.startedAt = eventTime(event);
        deferredTouchState.startX = touch.clientX;
        deferredTouchState.startY = touch.clientY;
        deferredTouchState.moved = false;
        deferredTouchState.wheelRemainderY = 0;
      } else {
        resetDeferredTouchState();
        sendMouseSequence(mouseEventFromTouch(event, touch), "press", 0);
      }
    };

    const handleTouchMove = (event) => {
      if (!touchMouseState.active || !trackingState(session)) {
        return;
      }
      const touch = Array.from(event.touches || []).find((item) => item.identifier === touchMouseState.identifier) || null;
      if (!touch) {
        return;
      }
      const previousY = touchMouseState.lastY;
      stopEvent(event);
      touchMouseState.lastX = touch.clientX;
      touchMouseState.lastY = touch.clientY;
      if (touchMouseState.deferredClick) {
        deferredTouchState.wheelRemainderY += previousY - touch.clientY;
        if (
          Math.abs(touch.clientX - deferredTouchState.startX) >= moveThresholdPx
          || Math.abs(touch.clientY - deferredTouchState.startY) >= moveThresholdPx
        ) {
          deferredTouchState.moved = true;
        }
        flushDeferredTouchWheel(event, touch);
        return;
      }
      sendMouseSequence(mouseEventFromTouch(event, touch), "move", 0);
    };

    const finishTouchMouse = (event) => {
      if (!touchMouseState.active) {
        return;
      }
      const touch = changedTouchForActiveMouse(event);
      const preserveDefault = shouldPreserveTouchDefault(event) === true;
      stopEvent(event, { preventDefault: !preserveDefault });
      if (touch) {
        touchMouseState.lastX = touch.clientX;
        touchMouseState.lastY = touch.clientY;
      }
      if (touchMouseState.deferredClick) {
        if (preserveDefault) {
          resetDeferredTouchState();
        } else {
          finishDeferredTouchTap(event, touch);
        }
      } else {
        sendMouseSequence(mouseEventFromTouch(event, touch), "release", 0);
      }
      resetTouchMouseState();
    };

    const listenerOptions = { capture: true, passive: false };
    lifecycle.listenSession(session, shell, "mousedown", handleMouseDown, listenerOptions);
    lifecycle.listenSession(session, shell, "mousemove", handleMouseMove, listenerOptions);
    lifecycle.listenSession(session, shell, "wheel", handleWheel, listenerOptions);
    lifecycle.listenSession(session, shell, "click", handleClickLike, listenerOptions);
    lifecycle.listenSession(session, shell, "dblclick", handleClickLike, listenerOptions);
    lifecycle.listenSession(session, shell, "auxclick", handleClickLike, listenerOptions);
    lifecycle.listenSession(session, shell, "contextmenu", handleClickLike, listenerOptions);
    lifecycle.listenSession(session, shell, "touchstart", handleTouchStart, listenerOptions);
    lifecycle.listenSession(session, shell, "touchmove", handleTouchMove, listenerOptions);
    lifecycle.listenSession(session, shell, "touchend", finishTouchMouse, listenerOptions);
    lifecycle.listenSession(session, shell, "touchcancel", finishTouchMouse, listenerOptions);
    lifecycle.listenSession(session, documentObject, "mousemove", handleMouseMove, listenerOptions);
    lifecycle.listenSession(session, documentObject, "mouseup", handleMouseUp, listenerOptions);
    lifecycle.addSessionCleanup(session, () => {
      mouseState.activeButton = -1;
      mouseState.lastMoveSequence = "";
      resetTouchMouseState();
      resetDeferredTouchState();
    });
  };

  function disposeSession(session) {
    if (!session) {
      return;
    }
    lifecycle.disposeSession(session);
    installedSessions.delete(session);
    sessions.delete(session);
  }

  return Object.freeze({
    claimEvent(event) {
      if (disposed || !event || (typeof event !== "object" && typeof event !== "function")) {
        return false;
      }
      claimedEvents.add(event);
      return true;
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const session of [...sessions]) {
        disposeSession(session);
      }
      lifecycle.dispose();
    },

    disposeSession,
    encode,

    hasTracking(session) {
      return Boolean(trackingState(session));
    },

    installSession,
    sendClick,
    sendWheel,
    start,
    trackingState,
  });
}
