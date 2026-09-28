import { isCodexTerminalIdentity } from "./theme_adapter.js";

// Codex's fullscreen transcript claims mouse events; its inline mode does not.
export const isCodexFullscreenTouchCandidate = (session, { mouseTracking = false } = {}) => (
  isCodexTerminalIdentity(session) && mouseTracking === true
);
