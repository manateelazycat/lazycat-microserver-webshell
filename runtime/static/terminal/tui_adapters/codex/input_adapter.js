import { isCodexTerminalIdentity } from "./theme_adapter.js";

// Preserve Shift+Enter as a distinct key instead of collapsing it to CR.
// Codex's editor accepts CSI-u Enter with the Shift modifier.
const modifiedEnterInput = (session, { shift, ctrl, alt, meta }) => (
  isCodexTerminalIdentity(session) && shift && !ctrl && !alt && !meta ? "\x1b[13;2u" : ""
);

export const resolveCodexKeyInput = (session, event) => {
  if (event?.key !== "Enter" || event.isComposing || event.keyCode === 229) return "";
  return modifiedEnterInput(session, {
    shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey,
  });
};

export const resolveCodexShortcutInput = (session, shortcut, sticky = {}) => {
  if (shortcut?.inputKey !== "enter" || shortcut.text) return "";
  const modifiers = shortcut.inputModifiers || {};
  return modifiedEnterInput(session, {
    shift: modifiers.shift === true || sticky.shift === true,
    ctrl: modifiers.ctrl === true || sticky.ctrl === true,
    alt: modifiers.alt === true || sticky.alt === true,
    meta: false,
  });
};
