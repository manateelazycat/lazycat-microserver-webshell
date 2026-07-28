import { isClaudeFullscreenTouchCandidate } from "./claude_fullscreen_touch.js";

export const isClaudeFullscreenContextMenuCandidate = (
  session,
  {
    mouseTracking = false,
    button = -1,
    contextMenuSuppressed = false,
  } = {},
) => (
  isClaudeFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 2
  && contextMenuSuppressed !== true
);

export const installClaudeFullscreenContextMenuAdapter = ({
  shell,
  shouldStart,
  claimEvent,
  registerCleanup,
}) => {
  if (!shell) {
    return;
  }

  let secondaryMouseActive = false;

  const handleMouseDown = (event) => {
    if (!shouldStart(event)) {
      return;
    }
    secondaryMouseActive = true;
    claimEvent(event);
  };

  const handleMouseMove = (event) => {
    if (!secondaryMouseActive) {
      return;
    }
    if ((Number(event?.buttons) & 2) === 0) {
      secondaryMouseActive = false;
      return;
    }
    claimEvent(event);
  };

  const handleMouseUp = (event) => {
    if (!secondaryMouseActive || Number(event?.button) !== 2) {
      return;
    }
    secondaryMouseActive = false;
    claimEvent(event);
  };

  const handleClickLike = (event) => {
    if (shouldStart(event)) {
      claimEvent(event);
    }
  };

  shell.addEventListener("mousedown", handleMouseDown, { capture: true, passive: false });
  shell.addEventListener("contextmenu", handleClickLike, { capture: true, passive: false });
  shell.addEventListener("auxclick", handleClickLike, { capture: true, passive: false });
  document.addEventListener("mousemove", handleMouseMove, { capture: true, passive: false });
  document.addEventListener("mouseup", handleMouseUp, { capture: true, passive: false });
  registerCleanup(() => {
    shell.removeEventListener("mousedown", handleMouseDown, { capture: true });
    shell.removeEventListener("contextmenu", handleClickLike, { capture: true });
    shell.removeEventListener("auxclick", handleClickLike, { capture: true });
    document.removeEventListener("mousemove", handleMouseMove, { capture: true });
    document.removeEventListener("mouseup", handleMouseUp, { capture: true });
    secondaryMouseActive = false;
  });
};
