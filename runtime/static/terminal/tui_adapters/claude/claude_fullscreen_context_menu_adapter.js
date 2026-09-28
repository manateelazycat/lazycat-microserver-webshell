import { installFullscreenTuiContextMenuAdapter } from "../common/index.js";
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

export const installClaudeFullscreenContextMenuAdapter = (options = {}) => (
  installFullscreenTuiContextMenuAdapter(options)
);
