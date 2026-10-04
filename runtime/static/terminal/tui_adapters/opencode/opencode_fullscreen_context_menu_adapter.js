import { installFullscreenTuiContextMenuAdapter } from "../common/index.js";
import { isOpencodeFullscreenTouchCandidate } from "./opencode_fullscreen_touch.js";

export const isOpencodeFullscreenContextMenuCandidate = (
  session,
  { mouseTracking = false, button = -1, contextMenuSuppressed = false } = {},
) => (
  isOpencodeFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 2
  && contextMenuSuppressed !== true
);

export const installOpencodeFullscreenContextMenuAdapter = (options = {}) => (
  installFullscreenTuiContextMenuAdapter(options)
);
