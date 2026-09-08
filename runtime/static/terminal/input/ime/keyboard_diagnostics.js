// Temporary, read-only keyboard incident tracing. Never read input/terminal text.
export function createKeyboardDiagnostics({
  windowObject, documentObject, navigatorObject, getActiveSession,
  getViewportSnapshot, appendLog,
}) {
  if (!(navigatorObject.maxTouchPoints > 0) && !/Android|iPhone|iPad|iPod/i.test(navigatorObject.userAgent || "")) {
    return { record() {}, probe() {}, dispose() {} };
  }
  const run = `kbd-v3-native-tap-${Date.now().toString(36)}`;
  const timers = new Set();
  const cleanups = [];
  const eventIDs = new WeakMap();
  const probes = new WeakMap();
  let sequence = 0;
  let eventSequence = 0;
  let batch = [];
  let dropped = 0;
  let flushTimer = 0;
  let viewportTimer = 0;
  let watchUntil = 0;
  let disposed = false;
  const time = () => Math.round(windowObject.performance.now());
  const node = (element) => element ? {
    tag: element.tagName || element.nodeName,
    classes: typeof element.className === "string" ? element.className.slice(0, 180) : "",
    connected: element.isConnected,
  } : null;
  const later = (callback, delay) => {
    const id = windowObject.setTimeout(() => {
      timers.delete(id);
      if (!disposed) callback();
    }, delay);
    timers.add(id);
    return id;
  };
  const flush = () => {
    flushTimer = 0;
    if (!batch.length) return;
    const events = batch;
    batch = [];
    const omitted = dropped;
    dropped = 0;
    try {
      appendLog("info", `[键盘诊断 ${run}] #${events[0].seq}-${events[events.length - 1].seq}`,
        JSON.stringify({ run, omitted, events }), { retainWhenDisabled: true });
    } catch (_) { /* Diagnostics must never interrupt input. */ }
  };
  const eventInfo = (event) => {
    if (!event) return null;
    if (!eventIDs.has(event)) eventIDs.set(event, ++eventSequence);
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    return {
      id: eventIDs.get(event), type: event.type, stamp: event.timeStamp,
      trusted: event.isTrusted, cancelable: event.cancelable, prevented: event.defaultPrevented,
      phase: event.eventPhase, target: node(event.target), pointer: event.pointerType,
      touches: event.touches?.length, changedTouches: event.changedTouches?.length,
      touch: touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null,
    };
  };
  const record = (session, stage, details = {}, event = null) => {
    if (disposed) return;
    try {
      const textarea = session?.term?.textarea;
      const active = getActiveSession();
      const focused = documentObject.activeElement;
      const entry = {
        seq: ++sequence, ms: time(), stage, session: session?.id, tab: session?.tabId,
        activeSession: active?.id, activeTab: active?.tabId,
        focus: node(focused), textareaFocused: Boolean(textarea && focused === textarea),
        documentFocused: documentObject.hasFocus(), visibility: documentObject.visibilityState,
        activation: navigatorObject.userActivation ? {
          active: navigatorObject.userActivation.isActive,
          everActive: navigatorObject.userActivation.hasBeenActive,
        } : null,
        event: eventInfo(event), ...details,
      };
      if (batch.length < 100) batch.push(entry);
      else dropped++;
      if (!flushTimer) flushTimer = later(flush, 400);
    } catch (_) { /* Read-only tracing is best effort. */ }
  };
  const geometry = (element) => {
    if (!element?.getBoundingClientRect) return null;
    const rect = element.getBoundingClientRect();
    const style = windowObject.getComputedStyle(element);
    return {
      ...node(element), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      scrollTop: element.scrollTop, scrollLeft: element.scrollLeft,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      position: style.position, top: style.top, transform: style.transform,
      overflow: style.overflow, pointerEvents: style.pointerEvents, fontSize: style.fontSize,
      clipPath: style.clipPath,
    };
  };
  const snapshot = (session, reason, extra = {}) => {
    try {
      const textarea = session?.term?.textarea;
      const viewport = windowObject.visualViewport;
      record(session, "snapshot", {
        reason, ...extra,
        viewport: viewport ? {
          width: viewport.width, height: viewport.height, offsetTop: viewport.offsetTop,
          offsetLeft: viewport.offsetLeft, pageTop: viewport.pageTop, scale: viewport.scale,
        } : null,
        window: { width: windowObject.innerWidth, height: windowObject.innerHeight,
          scrollX: windowObject.scrollX, scrollY: windowObject.scrollY },
        viewportState: getViewportSnapshot(),
        root: geometry(documentObject.documentElement), body: geometry(documentObject.body),
        app: geometry(documentObject.querySelector(".app-shell")),
        host: geometry(session?.terminalHost), input: geometry(textarea),
        canvas: geometry(session?.term?.canvas),
        editable: textarea ? { disabled: textarea.disabled, readOnly: textarea.readOnly,
          inputMode: textarea.inputMode, tabIndex: textarea.tabIndex,
          virtualKeyboardPolicy: textarea.virtualKeyboardPolicy,
          selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd } : null,
        anchor: session?.terminalInputAnchor ? { ...session.terminalInputAnchor } : null,
        terminal: session ? { closed: session.closed, rows: session.term?.rows, cols: session.term?.cols,
          renderReady: session.renderReady, activationFitPending: session.activationFitPending,
          resizeAckPending: session.resizeAckPending, sizeClaimRequired: session.sizeClaimRequired,
          composing: session.composingIME, touchScrollActive: session.term?.touchScrollActive,
          touchScrollMoved: session.term?.touchScrollMoved } : null,
      });
    } catch (error) { record(session, "snapshot-error", { errorType: error?.name }); }
  };
  const probe = (session, reason) => {
    if (!session || disposed) return;
    const started = time();
    const generation = {};
    probes.set(session, generation);
    watchUntil = started + 5000;
    for (const delay of [0, 100, 500, 1500]) later(() => {
      if (probes.get(session) === generation && !session.closed) {
        snapshot(session, reason, { requestedDelayMs: delay, elapsedMs: time() - started });
      }
    }, delay);
  };
  const listen = (target, type, callback, capture = false) => {
    target?.addEventListener(type, callback, { capture, passive: true });
    cleanups.push(() => target?.removeEventListener(type, callback, { capture }));
  };
  // Document capture distinguishes a missed recognizer from events never reaching the pane.
  for (const type of ["touchstart", "touchend", "touchcancel", "pointerdown", "mousedown", "mouseup", "click", "focusin", "focusout"]) {
    listen(documentObject, type, (event) => {
      const session = getActiveSession();
      watchUntil = time() + 5000;
      record(session, `document.${type}`, {}, event);
      if (type === "touchend") probe(session, "after-document-touchend");
    }, true);
  }
  listen(documentObject, "touchend", (event) => record(getActiveSession(), "document.touchend.bubble", {}, event));
  for (const type of ["focus", "blur", "pageshow", "pagehide"]) {
    listen(windowObject, type, (event) => record(getActiveSession(), `window.${type}`, { persisted: event.persisted }));
  }
  listen(documentObject, "visibilitychange", () => record(getActiveSession(), "document.visibilitychange"));
  const viewportChanged = (event) => {
    if (time() > watchUntil || viewportTimer) return;
    const reason = `${event.target === windowObject.visualViewport ? "visualViewport" : "window"}.${event.type}`;
    viewportTimer = later(() => {
      viewportTimer = 0;
      snapshot(getActiveSession(), reason);
    }, 120);
  };
  for (const target of [windowObject, windowObject.visualViewport]) {
    for (const type of ["resize", "scroll"]) listen(target, type, viewportChanged);
  }
  listen(navigatorObject.virtualKeyboard, "geometrychange", () => {
    const rect = navigatorObject.virtualKeyboard.boundingRect;
    record(getActiveSession(), "virtualKeyboard.geometrychange", {
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    });
  });
  listen(windowObject, "error", (event) => record(getActiveSession(), "window.error", {
    errorType: event.error?.name, stack: String(event.error?.stack || "").split("\n").slice(1, 5).join("\n"),
    line: event.lineno, column: event.colno,
  }));
  listen(windowObject, "unhandledrejection", (event) => record(getActiveSession(), "window.unhandledrejection", {
    errorType: event.reason?.name,
    stack: String(event.reason?.stack || "").split("\n").slice(1, 5).join("\n"),
  }));
  record(null, "diagnostics-start", { userAgent: navigatorObject.userAgent,
    platform: navigatorObject.platform, maxTouchPoints: navigatorObject.maxTouchPoints,
    dpr: windowObject.devicePixelRatio, virtualKeyboardAPI: typeof navigatorObject.virtualKeyboard?.show,
    note: "DOM focus and viewport changes do not prove native keyboard visibility" });
  return {
    record, probe,
    dispose() {
      flush();
      disposed = true;
      for (const timer of timers) windowObject.clearTimeout(timer);
      for (const cleanup of cleanups) cleanup();
      timers.clear();
    },
  };
}
