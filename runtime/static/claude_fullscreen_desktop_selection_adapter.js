import { isClaudeFullscreenTouchCandidate } from "./claude_fullscreen_touch.js";

export const isClaudeFullscreenDesktopSelectionCandidate = (
  session,
  {
    mouseTracking = false,
    button = -1,
    touchSelectionLayout = false,
    applicationModifier = false,
  } = {},
) => (
  isClaudeFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 0
  && touchSelectionLayout !== true
  && applicationModifier !== true
);

export const installClaudeFullscreenDesktopSelectionAdapter = ({
  shell,
  shouldStart,
  claimEvent,
  sendClick,
  registerCleanup,
  moveThresholdPx = 4,
}) => {
  if (!shell) {
    return;
  }

  let selectionState = null;
  let primaryClickPending = false;

  const resetSelection = () => {
    selectionState = null;
  };

  const handleMouseDown = (event) => {
    primaryClickPending = false;
    resetSelection();
    if (!shouldStart(event)) {
      return;
    }
    selectionState = {
      startX: Number(event.clientX) || 0,
      startY: Number(event.clientY) || 0,
      shiftKey: Boolean(event.shiftKey),
      altKey: Boolean(event.altKey),
      ctrlKey: Boolean(event.ctrlKey),
      metaKey: Boolean(event.metaKey),
      moved: false,
    };
    claimEvent(event);
  };

  const handleMouseMove = (event) => {
    const state = selectionState;
    if (!state) {
      return;
    }
    if ((Number(event?.buttons) & 1) === 0) {
      claimEvent(event);
      state.moved = true;
      return;
    }
    claimEvent(event);
    if (
      Math.hypot(
        (Number(event.clientX) || 0) - state.startX,
        (Number(event.clientY) || 0) - state.startY,
      ) >= moveThresholdPx
    ) {
      state.moved = true;
    }
  };

  const handleMouseUp = (event) => {
    const state = selectionState;
    if (!state || Number(event?.button) !== 0) {
      return;
    }
    claimEvent(event);
    resetSelection();
    const moved = state.moved || Math.hypot(
      (Number(event.clientX) || 0) - state.startX,
      (Number(event.clientY) || 0) - state.startY,
    ) >= moveThresholdPx;
    if (moved) {
      primaryClickPending = false;
      return;
    }
    primaryClickPending = true;
    sendClick({
      clientX: state.startX,
      clientY: state.startY,
      shiftKey: state.shiftKey,
      altKey: state.altKey,
      ctrlKey: state.ctrlKey,
      metaKey: state.metaKey,
    });
  };

  const handleClick = (event) => {
    if (!primaryClickPending || Number(event?.button) !== 0) {
      return;
    }
    primaryClickPending = false;
    claimEvent(event);
  };

  shell.addEventListener("mousedown", handleMouseDown, { capture: true, passive: false });
  shell.addEventListener("click", handleClick, { capture: true, passive: false });
  document.addEventListener("mousemove", handleMouseMove, { capture: true, passive: false });
  document.addEventListener("mouseup", handleMouseUp, { capture: true, passive: false });
  registerCleanup(() => {
    shell.removeEventListener("mousedown", handleMouseDown, { capture: true });
    shell.removeEventListener("click", handleClick, { capture: true });
    document.removeEventListener("mousemove", handleMouseMove, { capture: true });
    document.removeEventListener("mouseup", handleMouseUp, { capture: true });
    primaryClickPending = false;
    resetSelection();
  });
};
