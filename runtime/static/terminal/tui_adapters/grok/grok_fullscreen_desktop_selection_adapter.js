import { installFullscreenTuiDesktopSelectionAdapter } from "../common/index.js";
import { isGrokFullscreenTouchCandidate } from "./grok_fullscreen_touch.js";

export const isGrokFullscreenDesktopSelectionCandidate = (
  session,
  {
    mouseTracking = false,
    button = -1,
    touchSelectionLayout = false,
    applicationModifier = false,
  } = {},
) => (
  isGrokFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 0
  && touchSelectionLayout !== true
  && applicationModifier !== true
);

export const installGrokFullscreenDesktopSelectionAdapter = (options = {}) => (
  installFullscreenTuiDesktopSelectionAdapter(options)
);
