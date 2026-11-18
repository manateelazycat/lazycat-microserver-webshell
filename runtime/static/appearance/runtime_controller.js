const DEFAULT_CURSOR_BLINK_HOLD_MS = 700;

const hexToRGB = (value) => {
  const normalized = String(value || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
};

const colorKey = (rgb) => Array.isArray(rgb) ? rgb.join(",") : "";

const themeColorValues = (theme) => {
  const xterm = theme?.xterm || {};
  return [
    xterm.foreground,
    xterm.background,
    xterm.black,
    xterm.red,
    xterm.green,
    xterm.yellow,
    xterm.blue,
    xterm.magenta,
    xterm.cyan,
    xterm.white,
    xterm.brightBlack,
    xterm.brightRed,
    xterm.brightGreen,
    xterm.brightYellow,
    xterm.brightBlue,
    xterm.brightMagenta,
    xterm.brightCyan,
    xterm.brightWhite,
  ];
};

export const buildAppearanceThemeColorMap = (fromTheme, toTheme) => {
  const from = themeColorValues(fromTheme);
  const to = themeColorValues(toTheme);
  const map = new Map();
  for (let index = 0; index < from.length; index += 1) {
    const fromRGB = hexToRGB(from[index]);
    const toRGB = hexToRGB(to[index]);
    if (fromRGB && toRGB) {
      const css = `rgb(${toRGB[0]}, ${toRGB[1]}, ${toRGB[2]})`;
      map.set(colorKey(fromRGB), css);
      // The worker hands a black default foreground/background to the core as
      // #000001 (terminal_engine.js), so its cells report that value.
      if (index < 2 && colorKey(fromRGB) === "0,0,0") {
        map.set("0,0,1", css);
      }
    }
  }
  return map;
};

/**
 * Bridges the appearance controller and live terminal presentation state.
 * It owns only theme adaptation and cursor-hold timers; transport, replay and
 * session registries stay behind injected callbacks.
 */
export function createAppearanceRuntimeController({
  windowObject = globalThis.window,
  getActiveTheme = () => null,
  getTerminalTheme = () => ({}),
  getSessions = () => [],
  beginPresentationHold = () => {},
  isRenderAllowed = () => false,
  installThemeMapper = () => {},
  installCellSeam = () => {},
  refreshTerminalMetrics = () => {},
  resizeActiveTab = () => {},
  scheduleOverviewRender = () => {},
  sendTerminalTheme = () => {},
  syncCursorBlinkState = () => {},
  cursorBlinkHoldMs = DEFAULT_CURSOR_BLINK_HOLD_MS,
  isDisposed = () => false,
} = {}) {
  let disposed = false;
  const heldSessions = new Set();

  const isInactive = () => disposed || isDisposed();

  const clearCursorBlinkTimer = (session) => {
    if (!session?.cursorBlinkHoldTimer) {
      return;
    }
    windowObject?.clearTimeout?.(session.cursorBlinkHoldTimer);
    session.cursorBlinkHoldTimer = 0;
  };

  const holdCursorVisible = (session) => {
    if (isInactive()) {
      return false;
    }
    const term = session?.term;
    const renderer = term?.renderer;
    if (!term || !renderer || term.isDisposed || !term.isOpen) {
      return false;
    }
    clearCursorBlinkTimer(session);
    heldSessions.add(session);
    renderer.cursorVisible = true;
    if (term.options?.cursorBlink) {
      term.options.cursorBlink = false;
    }
    if (isRenderAllowed(session)) {
      term.requestRender?.();
    }
    session.cursorBlinkHoldTimer = windowObject?.setTimeout?.(() => {
      session.cursorBlinkHoldTimer = 0;
      heldSessions.delete(session);
      if (isInactive()) {
        return;
      }
      syncCursorBlinkState();
      if (isRenderAllowed(session)) {
        term.requestRender?.();
      }
    }, cursorBlinkHoldMs) || 0;
    return true;
  };

  const applyThemeToSession = (session, theme = getActiveTheme()) => {
    if (isInactive() || !session?.term || !theme) {
      return false;
    }
    beginPresentationHold(session);
    const nextTheme = getTerminalTheme();
    installThemeMapper(session);
    installCellSeam(session);
    if (!session.baseTheme) {
      session.baseTheme = theme;
    }
    session.term.options.theme = nextTheme;
    if (session.term.renderer) {
      session.term.renderer.webshellColorMap = buildAppearanceThemeColorMap(session.baseTheme, theme);
    }
    if (session.term.renderer && typeof session.term.renderer.setTheme === "function") {
      session.term.renderer.setTheme(nextTheme);
      if (isRenderAllowed(session)) {
        session.term.requestRender?.({ full: true });
      }
    }
    refreshTerminalMetrics(session);
    return true;
  };

  const applyWorkspaceTheme = (theme = getActiveTheme()) => {
    if (isInactive()) {
      return false;
    }
    for (const session of getSessions() || []) {
      applyThemeToSession(session, theme);
      sendTerminalTheme(session);
    }
    resizeActiveTab();
    scheduleOverviewRender();
    return true;
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    for (const session of heldSessions) {
      clearCursorBlinkTimer(session);
    }
    heldSessions.clear();
    return true;
  };

  return Object.freeze({
    applyThemeToSession,
    applyWorkspaceTheme,
    dispose,
    holdCursorVisible,
    isDisposed: () => disposed,
  });
}
