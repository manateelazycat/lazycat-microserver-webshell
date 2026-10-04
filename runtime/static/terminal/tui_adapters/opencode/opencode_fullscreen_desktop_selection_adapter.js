import { installFullscreenTuiDesktopSelectionAdapter } from "../common/index.js";
import { isOpencodeFullscreenTouchCandidate } from "./opencode_fullscreen_touch.js";

export const isOpencodeFullscreenDesktopSelectionCandidate = (
  session,
  { mouseTracking = false, button = -1, touchSelectionLayout = false } = {},
) => (
  isOpencodeFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 0
  && touchSelectionLayout !== true
);

export const installOpencodeFullscreenDesktopSelectionAdapter = (options = {}) => (
  installFullscreenTuiDesktopSelectionAdapter(options)
);
