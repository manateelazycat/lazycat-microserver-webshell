import { installFullscreenTuiContextMenuAdapter } from "../common/index.js";
import { isCodexFullscreenTouchCandidate } from "./codex_fullscreen_touch.js";

export const isCodexFullscreenContextMenuCandidate = (
  session,
  { mouseTracking = false, button = -1, contextMenuSuppressed = false } = {},
) => (
  isCodexFullscreenTouchCandidate(session, { mouseTracking })
  && Number(button) === 2
  && contextMenuSuppressed !== true
);

export const installCodexFullscreenContextMenuAdapter = (options = {}) => (
  installFullscreenTuiContextMenuAdapter(options)
);
