import { installFullscreenTuiDesktopSelectionAdapter } from "../common/index.js";
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

export const installClaudeFullscreenDesktopSelectionAdapter = (options = {}) => (
  installFullscreenTuiDesktopSelectionAdapter(options)
);
