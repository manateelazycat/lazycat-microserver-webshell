import { installFullscreenTuiContextMenuAdapter } from "../common/index.js";
import { isGrokFullscreenTouchCandidate } from "./grok_fullscreen_touch.js";

export const isGrokFullscreenContextMenuCandidate = (
  session,
  {
    mouseTracking = false,
    button = -1,
    contextMenuSuppressed = false,
  } = {},
) => (
  isGrokFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 2
  && contextMenuSuppressed !== true
);

export const installGrokFullscreenContextMenuAdapter = (options = {}) => (
  installFullscreenTuiContextMenuAdapter(options)
);
