import {
  grokExecutableNamePattern,
  isClaudeFullscreenContextMenuCandidate,
  isClaudeFullscreenDesktopSelectionCandidate,
  isClaudeFullscreenTouchCandidate,
  isGrokExecutableToken,
  isGrokFullscreenContextMenuCandidate,
  isGrokFullscreenDesktopSelectionCandidate,
  isGrokFullscreenTouchCandidate,
  isGrokTerminalSession,
  isOfficialGrokEntrypoint,
} from "../tui_adapters/index.js";

const noop = () => {};

export const stripTerminalCommandTokenQuotes = (value) => {
  const token = String(value || "").trim();
  if (token.length < 2) {
    return token;
  }
  const quote = token[0];
  return (quote === "\"" || quote === "'") && token[token.length - 1] === quote
    ? token.slice(1, -1)
    : token;
};

export const terminalCommandLineTokens = (value) => (
  String(value || "").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
).map(stripTerminalCommandTokenQuotes);

export const terminalExecutableName = (value) => {
  const normalized = stripTerminalCommandTokenQuotes(value).replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

export {
  grokExecutableNamePattern,
  isGrokExecutableToken,
  isGrokTerminalSession,
  isOfficialGrokEntrypoint,
};

export const terminalLocationDescription = (session) => (
  `会话=${String(session?.name || "unknown")}, tab=${String(session?.tabId || "unknown")}, 分屏=${String(session?.id || "unknown")}`
);

/**
 * Coordinates terminal-only policy decisions without owning session or
 * transport state. All renderer and layout operations are injected.
 */
export function createTerminalPolicyController({
  windowObject = globalThis.window,
  isDialogOpen = () => false,
  captureViewport = () => null,
  normalizeBottomViewport = noop,
  hasMouseTracking = () => false,
  isTouchSelectionLayout = () => false,
  shouldSuppressContextMenu = () => false,
  claudeTouchCandidate = isClaudeFullscreenTouchCandidate,
  claudeContextMenuCandidate = isClaudeFullscreenContextMenuCandidate,
  claudeDesktopSelectionCandidate = isClaudeFullscreenDesktopSelectionCandidate,
  grokTouchCandidate = isGrokFullscreenTouchCandidate,
  grokContextMenuCandidate = isGrokFullscreenContextMenuCandidate,
  grokDesktopSelectionCandidate = isGrokFullscreenDesktopSelectionCandidate,
} = {}) {
  let disposed = false;

  const isClaudeFullscreenTouchSession = (session) => claudeTouchCandidate(session, {
    mouseTracking: hasMouseTracking(session) === true,
  });

  const isClaudeFullscreenContextMenuEvent = (session, event) => claudeContextMenuCandidate(session, {
    mouseTracking: hasMouseTracking(session) === true,
    button: event?.button,
    contextMenuSuppressed: shouldSuppressContextMenu(event),
  });

  const isClaudeFullscreenDesktopSelectionEvent = (session, event) => claudeDesktopSelectionCandidate(session, {
    mouseTracking: hasMouseTracking(session) === true,
    button: event?.button,
    touchSelectionLayout: isTouchSelectionLayout(),
    applicationModifier: Boolean(event?.ctrlKey || event?.altKey || event?.metaKey),
  });

  const isGrokFullscreenTouchSession = (session) => grokTouchCandidate(session, {
    mouseTracking: hasMouseTracking(session) === true,
  });

  const isGrokFullscreenContextMenuEvent = (session, event) => grokContextMenuCandidate(session, {
    mouseTracking: hasMouseTracking(session) === true,
    button: event?.button,
    contextMenuSuppressed: shouldSuppressContextMenu(event),
  });

  const isGrokFullscreenDesktopSelectionEvent = (session, event) => grokDesktopSelectionCandidate(session, {
    mouseTracking: hasMouseTracking(session) === true,
    button: event?.button,
    touchSelectionLayout: isTouchSelectionLayout(),
    applicationModifier: Boolean(event?.ctrlKey || event?.altKey || event?.metaKey),
  });

  const scrollTerminalToBottomForUserInput = (session) => {
    if (disposed || !session || session.closed || session.exitExpected || isDialogOpen()) {
      return false;
    }
    const term = session.term;
    if (!term || typeof term.scrollToBottom !== "function") {
      return false;
    }
    try {
      const atBottom = captureViewport(term)?.atBottom === true;
      term.stopTouchInertia?.();
      if (term.scrollAnimationFrame) {
        windowObject?.cancelAnimationFrame?.(term.scrollAnimationFrame);
        term.scrollAnimationFrame = void 0;
      }
      term.scrollAnimationStartTime = void 0;
      term.scrollAnimationStartY = void 0;
      term.scrollAnimationLastFrameTime = void 0;
      if (atBottom) {
        normalizeBottomViewport(term);
      } else {
        term.scrollToBottom();
      }
      return true;
    } catch (error) {
      return false;
    }
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
    isClaudeFullscreenContextMenuEvent,
    isClaudeFullscreenDesktopSelectionEvent,
    isClaudeFullscreenTouchSession,
    isDisposed: () => disposed,
    isGrokFullscreenContextMenuEvent,
    isGrokFullscreenDesktopSelectionEvent,
    isGrokFullscreenTouchSession,
    isGrokTerminalSession,
    scrollTerminalToBottomForUserInput,
    terminalLocationDescription,
  });
}
