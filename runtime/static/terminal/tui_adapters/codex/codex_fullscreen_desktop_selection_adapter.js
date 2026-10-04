import { installFullscreenTuiDesktopSelectionAdapter } from "../common/index.js";
import { isCodexFullscreenTouchCandidate } from "./codex_fullscreen_touch.js";

export const isCodexFullscreenDesktopSelectionCandidate = (
  session,
  {
    mouseTracking = false,
    button = -1,
    touchSelectionLayout = false,
  } = {},
) => (
  isCodexFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 0
  && touchSelectionLayout !== true
);

export const installCodexFullscreenDesktopSelectionAdapter = (options = {}) => (
  installFullscreenTuiDesktopSelectionAdapter(options)
);
