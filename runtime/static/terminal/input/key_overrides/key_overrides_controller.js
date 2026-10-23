import {
  BACKTAB_SEQUENCE,
  applyStickyShiftInput,
  shortcutKeyFromEventCode,
} from "../../../settings/index.js";

const noop = () => {};

const isKeyboardEvent = (event, KeyboardEventCtor) => (
  typeof KeyboardEventCtor === "function"
    ? event instanceof KeyboardEventCtor
    : Boolean(event && event.type === "keydown")
);

export function isPrintableAsciiCharacter(value) {
  const points = Array.from(String(value || ""));
  if (points.length !== 1) {
    return false;
  }
  const codePoint = points[0].codePointAt(0);
  return Number.isFinite(codePoint) && codePoint >= 0x20 && codePoint <= 0x7e;
}

export function terminalAltMetaInputFromEvent(
  event,
  {
    KeyboardEventCtor = globalThis.KeyboardEvent,
    shortcutKeyFromEventCode: shortcutKeyFromEventCodeFn = shortcutKeyFromEventCode,
    applyStickyShiftInput: applyStickyShiftInputFn = applyStickyShiftInput,
  } = {},
) {
  if (!isKeyboardEvent(event, KeyboardEventCtor) || !event.altKey || event.ctrlKey || event.metaKey) {
    return "";
  }
  if (event.getModifierState?.("AltGraph")) {
    return "";
  }
  let key = String(event.key || "");
  if (!isPrintableAsciiCharacter(key)) {
    key = shortcutKeyFromEventCodeFn(event);
    if (event.shiftKey) {
      key = applyStickyShiftInputFn(key) || key;
    }
  }
  if (!isPrintableAsciiCharacter(key)) {
    return "";
  }
  return `\x1b${key}`;
}

/**
 * Owns terminal custom-key handling while delegating all feature state to the
 * injected callbacks. A disposed or closed session can never emit input.
 */
export function createTerminalKeyOverridesController({
  KeyboardEventCtor = globalThis.KeyboardEvent,
  backtabSequence = BACKTAB_SEQUENCE,
  handleFontSizeShortcut = noop,
  resolveKeyInput = () => "",
  hasStickyModifiers = () => false,
  shouldApplyStickyTextInput = () => false,
  consumeStickyInput = () => "",
  sendInput = noop,
  registerSessionCleanup = noop,
} = {}) {
  let disposed = false;
  const handlers = new WeakMap();
  const boundSessions = new WeakSet();
  const disposedSessions = new WeakSet();

  const disposeSession = (session) => {
    if (!session || disposedSessions.has(session)) {
      return false;
    }
    disposedSessions.add(session);
    const handler = handlers.get(session);
    handlers.delete(session);
    if (session.term?.customKeyEventHandler === handler) {
      try {
        session.term.attachCustomKeyEventHandler(null);
      } catch (error) {
      }
    }
    return true;
  };

  const installSession = (session) => {
    const term = session?.term;
    if (disposed || !session || session.closed || disposedSessions.has(session)) {
      return false;
    }
    if (boundSessions.has(session)) {
      return true;
    }
    if (typeof term?.attachCustomKeyEventHandler !== "function") {
      return false;
    }
    const handler = (event) => {
      if (disposed || disposedSessions.has(session) || session.closed) {
        return false;
      }
      if (handleFontSizeShortcut(event)) {
        return true;
      }
      const adaptedInput = resolveKeyInput(session, event);
      if (adaptedInput) {
        term.input(adaptedInput, true);
        return true;
      }
      const altMetaInput = terminalAltMetaInputFromEvent(event, { KeyboardEventCtor });
      if (altMetaInput) {
        term.input(altMetaInput, true);
        return true;
      }
      if (
        hasStickyModifiers()
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey
        && shouldApplyStickyTextInput(event.key, "")
      ) {
        const input = consumeStickyInput(event.key);
        if (input) {
          sendInput(session, input);
        }
        return true;
      }
      if (event.key !== "Tab" || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return false;
      }
      term.input(backtabSequence, true);
      return true;
    };
    term.attachCustomKeyEventHandler(handler);
    handlers.set(session, handler);
    boundSessions.add(session);
    registerSessionCleanup(session, () => disposeSession(session));
    return true;
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    return true;
  };

  return Object.freeze({
    dispose,
    disposeSession,
    installSession,
    isDisposed: () => disposed,
  });
}
