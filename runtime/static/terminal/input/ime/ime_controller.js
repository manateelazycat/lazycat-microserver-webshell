import { createTerminalIMELifecycle } from "./ime_lifecycle.js";
import { createKeyboardDiagnostics } from "./keyboard_diagnostics.js";
import {
  isAndroidPlatform,
  isBackwardDeleteInputType,
  isForwardDeleteInputType,
  isTerminalASCIICompositionCommit,
  normalizeTerminalCompositionTextCandidates,
  stripTerminalInputSentinel,
  terminalInputDeleteBuffer,
} from "./ime_model.js";

const noop = () => {};

export function createTerminalIMEController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  getActiveSession = () => null,
  activateSession = noop,
  appendDiagnosticLog = noop,
  getViewportSnapshot = () => null,
  getTerminalFontSize = () => 16,
  getTerminalFontFamily = () => "monospace",
  getTheme = () => ({ foreground: "#ffffff", background: "#000000" }),
  isTouchShortcutLayout = () => false,
  requiresTouchKeyboardDoubleTap = () => false,
  isKeyboardViewportActive = () => false,
  updateActiveTabTitle = noop,
  captureInputViewportLock = noop,
  releaseInputViewportLock = noop,
  scheduleKeyboardDismissRecovery = noop,
  cancelKeyboardDismissRecovery = noop,
  cancelTouchInteraction = noop,
  reassertSize = noop,
  claimCurrentDeviceSize = noop,
  scrollToBottom = noop,
  sendInput = noop,
  pasteText = () => Promise.resolve(false),
  handleNativePaste = () => ({ handled: false }),
  showToast = noop,
  shouldApplyStickyTextInput = () => false,
  shouldApplyStickyCompositionInput = () => false,
  consumeStickyInput = (value) => value,
  installKeyOverrides = noop,
  registerSessionCleanup = noop,
  moveThresholdPx = 8,
  doubleTapDelayMs = 320,
  nativeDeleteIdleResetMs = 900,
  lifecycleFactory = createTerminalIMELifecycle,
} = {}) {
  let disposed = false;
  const lifecycle = lifecycleFactory({ windowObject });
  const cleanupRegistered = new WeakSet();
  const installedSessions = new WeakSet();
  const claimedTouchEnds = new WeakSet();
  const pageFocusTouchEnds = new WeakSet();
  const touchGestureCancellations = new WeakMap();
  const now = () => Number(windowObject.performance?.now?.() || Date.now());
  const eventTime = (event) => Number.isFinite(event?.timeStamp) && event.timeStamp >= 0 ? event.timeStamp : now();
  const isHTMLElement = (value) => {
    const HTMLElementImpl = windowObject.HTMLElement || globalThis.HTMLElement;
    return typeof HTMLElementImpl === "function" && value instanceof HTMLElementImpl;
  };
  const isElement = (value) => {
    const ElementImpl = windowObject.Element || globalThis.Element;
    return typeof ElementImpl === "function" && value instanceof ElementImpl;
  };
  const keyboardDiagnostics = createKeyboardDiagnostics({
    windowObject, documentObject, navigatorObject, getActiveSession,
    getViewportSnapshot, appendLog: appendDiagnosticLog,
  });

  const moveTextareaCaretToEnd = (textarea) => {
    try {
      const end = textarea.value.length;
      if (textarea.selectionStart !== end || textarea.selectionEnd !== end) {
        textarea.setSelectionRange(end, end);
      }
    } catch (error) {
    }
  };

  const resetHostViewport = (session, { clean = false, source = "" } = {}) => {
    // Mobile output changes Canvas content only. Native input/scroll events
    // still run the host guard when the browser actually changes its scroll.
    if (source === "output" && requiresTouchKeyboardDoubleTap()) return;
    const host = session?.terminalHost;
    if (!host) {
      return;
    }
    if (host.scrollTop !== 0) {
      host.scrollTop = 0;
    }
    if (host.scrollLeft !== 0) {
      host.scrollLeft = 0;
    }
    if (!clean) {
      return;
    }
    const keep = new Set([
      session.term?.canvas,
      session.term?.textarea,
      session.terminalFrameHold,
      session.compositionPreview,
    ].filter(Boolean));
    for (const node of Array.from(host.childNodes || [])) {
      if (!keep.has(node) && (node.nodeType === 1 || node.nodeType === 3)) {
        node.remove();
      }
    }
  };

  const scheduleHostViewportReset = (session, options = {}) => {
    resetHostViewport(session, options);
    lifecycle.frame(session, () => resetHostViewport(session, options));
  };

  const shouldReassertInputSize = (session) => Boolean(
    session?.renderReady !== true
      || session?.sizeClaimRequired === true
      || session?.resizeAckPending === true
      || session?.activationFitPending === true
  );

  const prepareTextareaForInput = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea || session.composingIME || session.nativeDeleteInputPending) {
      return;
    }
    if (textarea.value !== terminalInputDeleteBuffer) {
      textarea.value = terminalInputDeleteBuffer;
    }
    moveTextareaCaretToEnd(textarea);
  };

  const clearTextareaSentinel = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea) {
      return "";
    }
    const value = stripTerminalInputSentinel(textarea.value);
    if (textarea.value !== value) {
      textarea.value = value;
      moveTextareaCaretToEnd(textarea);
    }
    return value;
  };

  const textareaCompositionText = (session) => {
    if (!session) {
      return "";
    }
    const textarea = session.term?.textarea;
    const textareaText = textarea ? stripTerminalInputSentinel(textarea.value) : "";
    if (session.composingIME && typeof session.compositionText === "string") {
      return session.compositionText || textareaText;
    }
    return textarea ? textareaText : "";
  };

  const setTextareaCompositionText = (session, text) => {
    if (!session) {
      return "";
    }
    const normalized = stripTerminalInputSentinel(text);
    const previous = typeof session.compositionText === "string" ? session.compositionText : "";
    if (normalized && normalized !== previous) {
      session.compositionPreviousText = previous;
      const history = Array.isArray(session.compositionTextHistory) ? session.compositionTextHistory.slice() : [];
      if (!history.includes(normalized)) {
        history.push(normalized);
      }
      session.compositionTextHistory = history.slice(-8);
    }
    session.compositionText = normalized;
    return normalized;
  };

  const compositionPreeditCandidates = (session, ...extraValues) => normalizeTerminalCompositionTextCandidates(
    session?.compositionTextHistory,
    session?.compositionPreviousText,
    session?.compositionText,
    extraValues,
  );

  const setCompositionPreviewVisible = (session, visible) => {
    const preview = session?.compositionPreview;
    if (!preview) {
      return;
    }
    preview.hidden = !visible;
    if (!visible) {
      preview.textContent = "";
    }
  };

  const syncCompositionPreview = (session, {
    x = 0,
    y = 0,
    width = 1,
    height = 16,
    maxWidth = width,
  } = {}) => {
    const preview = session?.compositionPreview;
    if (!preview) {
      return;
    }
    if (session.terminalHost && preview.parentElement !== session.terminalHost) {
      session.terminalHost.appendChild(preview);
    }
    const text = session.composingIME ? textareaCompositionText(session) : "";
    if (!text) {
      setCompositionPreviewVisible(session, false);
      return;
    }
    preview.textContent = text;
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
    preview.style.minWidth = `${Math.max(width, 2)}px`;
    preview.style.maxWidth = `${Math.max(maxWidth, width, 2)}px`;
    preview.style.height = `${height}px`;
    preview.style.font = `${getTerminalFontSize()}px ${getTerminalFontFamily()}`;
    preview.style.lineHeight = `${height}px`;
    preview.style.boxSizing = "border-box";
    const theme = getTheme();
    preview.style.color = theme.foreground;
    preview.style.background = theme.background;
    setCompositionPreviewVisible(session, true);
  };

  const syncInputLayout = (session) => {
    const textarea = session?.term?.textarea;
    const mobile = requiresTouchKeyboardDoubleTap();
    if (textarea && textarea.classList.contains("terminal-input-mobile") !== mobile) {
      textarea.classList.toggle("terminal-input-mobile", mobile);
      session.terminalInputAnchor = null;
      keyboardDiagnostics.record(session, "input.layout-changed", { mobile });
    }
    return mobile;
  };

  const positionInput = (session) => {
    const term = session?.term;
    const textarea = term?.textarea;
    if (!textarea || session.closed || disposed) return;
    const mobile = syncInputLayout(session);
    // The mobile input's CSS anchor needs neither a mounted host nor a WASM
    // cursor. Only composition preview follows terminal output and geometry.
    if (mobile && !session.composingIME) {
      if (session.compositionPreview && !session.compositionPreview.hidden) {
        setCompositionPreviewVisible(session, false);
      }
      return;
    }
    const renderer = term?.renderer;
    const cursor = term?.wasmTerm?.getCursor?.();
    const metrics = renderer?.getMetrics?.();
    if (!textarea || !cursor || !metrics) {
      return;
    }
    const width = Math.max(1, Number(metrics.width) || 1);
    const height = Math.max(1, Number(metrics.height) || Number(getTerminalFontSize()) || 16);
    const cursorX = Math.max(0, Math.min(Math.max(0, (term.cols || 1) - 1), Number(cursor.x) || 0));
    const cursorY = Math.max(0, Math.min(Math.max(0, (term.rows || 1) - 1), Number(cursor.y) || 0));
    const previewLeft = cursorX * width;
    const previewTop = cursorY * height;
    const hostWidth = Math.max(width, Number(session.terminalHost?.clientWidth) || (Number(term.cols) || 1) * width);
    if (mobile) {
      syncCompositionPreview(session, {
        x: previewLeft, y: previewTop, width, height,
        maxWidth: Math.max(width, hostWidth - previewLeft),
      });
      return;
    }
    const hostHeight = Math.max(height, Number(session.terminalHost?.clientHeight) || (Number(term.rows) || 1) * height);
    const preserveAnchor = documentObject.activeElement === textarea;
    const previousAnchor = preserveAnchor ? session.terminalInputAnchor : null;
    const anchorTop = Math.max(0, Math.min(hostHeight - height, Number(previousAnchor?.top ?? previewTop) || 0));
    const anchorIndent = Math.max(0, Math.min(hostWidth - width, Number(previousAnchor?.indent ?? previewLeft) || 0));
    session.terminalInputAnchor = { top: anchorTop, indent: anchorIndent };
    textarea.setAttribute("rows", "1");
    textarea.setAttribute("wrap", "off");
    textarea.style.position = "absolute";
    textarea.style.left = "0px";
    textarea.style.top = `${anchorTop}px`;
    textarea.style.width = `${Math.max(hostWidth, 2)}px`;
    textarea.style.minWidth = `${Math.max(hostWidth, 2)}px`;
    textarea.style.maxWidth = `${Math.max(hostWidth, 2)}px`;
    textarea.style.height = `${height}px`;
    textarea.style.minHeight = `${height}px`;
    textarea.style.maxHeight = `${height}px`;
    textarea.style.font = `${getTerminalFontSize()}px ${getTerminalFontFamily()}`;
    textarea.style.lineHeight = `${height}px`;
    textarea.style.padding = "0";
    textarea.style.border = "0";
    textarea.style.outline = "0";
    textarea.style.boxShadow = "none";
    textarea.style.appearance = "none";
    textarea.style.webkitAppearance = "none";
    textarea.style.margin = "0";
    textarea.style.boxSizing = "border-box";
    textarea.style.opacity = "0.01";
    textarea.style.clipPath = "none";
    textarea.style.overflow = "hidden";
    textarea.style.overflowX = "hidden";
    textarea.style.overflowY = "hidden";
    textarea.style.whiteSpace = "pre";
    textarea.style.overflowWrap = "normal";
    textarea.style.wordBreak = "normal";
    textarea.style.textIndent = `${anchorIndent}px`;
    textarea.style.resize = "none";
    textarea.style.color = "transparent";
    textarea.style.background = "transparent";
    textarea.style.caretColor = "transparent";
    textarea.style.pointerEvents = "none";
    textarea.style.zIndex = "3";
    if (textarea.scrollTop !== 0) {
      textarea.scrollTop = 0;
    }
    prepareTextareaForInput(session);
    syncCompositionPreview(session, {
      x: previewLeft,
      y: previewTop,
      width,
      height,
      maxWidth: Math.max(width, hostWidth - previewLeft),
    });
  };

  const requestAndroidSoftKeyboard = (textarea) => {
    keyboardDiagnostics.record(getActiveSession(), "android.keyboard-api-check", {
      android: isAndroidPlatform(navigatorObject), policy: textarea.virtualKeyboardPolicy,
      inputMode: textarea.inputMode, showAvailable: typeof navigatorObject.virtualKeyboard?.show,
    });
    if (!isAndroidPlatform(navigatorObject) || documentObject.activeElement !== textarea
      || textarea.virtualKeyboardPolicy !== "manual" || textarea.inputMode === "none") {
      return;
    }
    const keyboard = navigatorObject.virtualKeyboard;
    if (!keyboard || typeof keyboard.show !== "function") {
      return;
    }
    try {
      // show() has no success return value. Keep automatic focus as the
      // default; only a separately configured manual policy uses this API.
      keyboard.show();
      keyboardDiagnostics.record(getActiveSession(), "android.keyboard-api-called");
    } catch (error) {
      keyboardDiagnostics.record(getActiveSession(), "android.keyboard-api-error", { errorType: error?.name });
    }
  };

  const stopTouchScroll = (session) => {
    const term = session?.term;
    if (!term) return;
    term.stopTouchInertia?.();
    term.finishTouchScroll?.();
    term.finishScrollbarDrag?.();
    term.touchScrollMoved = false;
    if (term.scrollAnimationFrame) windowObject.cancelAnimationFrame(term.scrollAnimationFrame);
    term.scrollAnimationFrame = undefined;
    term.scrollAnimationStartTime = undefined;
    term.scrollAnimationStartY = undefined;
    term.scrollAnimationLastFrameTime = undefined;
  };

  const blurInput = (session, { preserveTouchGesture = false } = {}) => {
    keyboardDiagnostics.record(session, "blur.request", { preserveTouchGesture });
    if (!preserveTouchGesture) touchGestureCancellations.get(session)?.();
    const textarea = session?.term?.textarea;
    const host = session?.terminalHost;
    const shell = session?.shellEl;
    const activeElement = documentObject.activeElement;
    if (isHTMLElement(activeElement) && (activeElement === textarea || activeElement === host
      || activeElement === shell || shell?.contains(activeElement))) {
      activeElement.blur();
      // The textarea's blur listener owns its recovery. Other focused host
      // elements only need recovery if keyboard viewport state still exists.
      if (activeElement !== textarea) scheduleKeyboardDismissRecovery();
      updateActiveTabTitle();
      return true;
    }
    if (session === getActiveSession() && isKeyboardViewportActive()) scheduleKeyboardDismissRecovery();
    return false;
  };

  const focusInput = (session, {
    requestMobileKeyboard = false,
    forceMobileFocusTransition = false,
    focusSource = "user",
  } = {}) => {
    const textarea = session?.term?.textarea;
    keyboardDiagnostics.record(session, "focus.request", {
      requestMobileKeyboard, forceMobileFocusTransition, focusSource,
      connected: textarea?.isConnected, closed: session?.closed, disposed,
      touchLayout: requiresTouchKeyboardDoubleTap(),
    });
    if (!textarea || disposed || session.closed || !textarea.isConnected) {
      keyboardDiagnostics.record(session, "focus.rejected", { reason: "missing-disposed-closed-or-detached" });
      return false;
    }
    const touchLayout = requiresTouchKeyboardDoubleTap();
    if (requestMobileKeyboard && session !== getActiveSession()) {
      activateSession(session);
    }
    if (session !== getActiveSession()) {
      keyboardDiagnostics.record(session, "focus.rejected", { reason: "inactive-session-after-activation" });
      return false;
    }
    if (touchLayout && (!requestMobileKeyboard || focusSource === "system")
      && documentObject.activeElement !== textarea) {
      keyboardDiagnostics.record(session, "focus.rejected", { reason: "system-or-no-keyboard-request" });
      return false;
    }
    if (requestMobileKeyboard) {
      keyboardDiagnostics.record(session, "focus.cancel-interactions.begin");
      touchGestureCancellations.get(session)?.();
      cancelTouchInteraction(session);
      stopTouchScroll(session);
      keyboardDiagnostics.record(session, "focus.cancel-interactions.end");
    }
    cancelKeyboardDismissRecovery();
    const activateAndroidKeyboard = requestMobileKeyboard && isAndroidPlatform(navigatorObject);
    if (
      activateAndroidKeyboard
      && forceMobileFocusTransition
      && documentObject.activeElement === textarea
      && !session.composingIME
    ) {
      textarea.blur();
    }
    if (documentObject.activeElement !== textarea) {
      session.terminalInputAnchor = null;
    }
    if (requestMobileKeyboard && touchLayout) {
      syncInputLayout(session);
    } else {
      positionInput(session);
    }
    const previousPointerEvents = textarea.style.pointerEvents;
    if (activateAndroidKeyboard) {
      textarea.style.pointerEvents = "auto";
    }
    try {
      try {
        keyboardDiagnostics.record(session, "focus.dom-call", {
          inlineStyle: {
            top: textarea.style.top, transform: textarea.style.transform,
            width: textarea.style.width, height: textarea.style.height,
            pointerEvents: textarea.style.pointerEvents,
          },
          fixedMobileAnchor: textarea.classList.contains("terminal-input-mobile"),
        });
        textarea.focus({ preventScroll: true });
      } catch (error) {
        keyboardDiagnostics.record(session, "focus.preventScroll-error", { errorType: error?.name });
        textarea.focus();
      }
      keyboardDiagnostics.record(session, "focus.dom-return");
      prepareTextareaForInput(session);
      if (requestMobileKeyboard) {
        requestAndroidSoftKeyboard(textarea);
      }
    } finally {
      if (activateAndroidKeyboard) {
        textarea.style.pointerEvents = previousPointerEvents || "none";
      }
    }
    if (!requestMobileKeyboard || !touchLayout) resetHostViewport(session, { clean: true });
    updateActiveTabTitle();
    keyboardDiagnostics.record(session, "focus.complete");
    if (requestMobileKeyboard) keyboardDiagnostics.probe(session, "after-focus-request");
    return documentObject.activeElement === textarea;
  };

  const setComposing = (session, composing) => {
    const wasComposing = Boolean(session.composingIME);
    if (composing && !session.inputViewportLock) {
      captureInputViewportLock(session);
    }
    session.composingIME = composing;
    if (composing) {
      if (!wasComposing) {
        session.compositionPreviousText = "";
        session.compositionTextHistory = [];
      }
      if (typeof session.compositionText !== "string") {
        session.compositionText = "";
      }
    } else {
      session.compositionText = "";
      setCompositionPreviewVisible(session, false);
    }
    if (session.term?.inputHandler) {
      session.term.inputHandler.isComposing = composing;
    }
  };

  const clearPostCompositionInput = (session) => {
    if (session) {
      session.pendingCompositionInput = null;
    }
  };

  const isPostCompositionInputAlreadySent = (session, committed) => {
    const pending = session?.pendingCompositionInput;
    const committedText = stripTerminalInputSentinel(committed);
    if (!pending?.sent || !committedText) {
      return false;
    }
    if (now() > Number(pending.expiresAt || 0)) {
      clearPostCompositionInput(session);
      return false;
    }
    return pending.committed === committedText;
  };

  const armPostCompositionInput = (session, {
    preedit = "",
    preedits = [],
    committed = "",
    sent = false,
    suppressSeparator = false,
  } = {}) => {
    if (!session) {
      return null;
    }
    const preeditCandidates = normalizeTerminalCompositionTextCandidates(preedits, preedit);
    const pending = {
      preedit: preeditCandidates[0] || "",
      preedits: preeditCandidates,
      committed: stripTerminalInputSentinel(committed),
      sent: Boolean(sent),
      suppressSeparator: Boolean(suppressSeparator),
      expiresAt: now() + 350,
    };
    session.pendingCompositionInput = pending;
    return pending;
  };

  const resolvePostCompositionInput = (session, value) => {
    const pending = session?.pendingCompositionInput;
    if (!pending) {
      return null;
    }
    if (now() > Number(pending.expiresAt || 0)) {
      clearPostCompositionInput(session);
      return null;
    }
    const rawValue = stripTerminalInputSentinel(value);
    const preedits = normalizeTerminalCompositionTextCandidates(pending.preedits, pending.preedit);
    const committed = pending.committed || "";
    let data = rawValue;
    let handled = false;
    if (!rawValue) {
      data = "";
      handled = true;
    } else if (pending.sent) {
      if (
        (committed && rawValue === committed)
        || preedits.includes(rawValue)
        || (committed && preedits.some((preedit) => rawValue === `${preedit}${committed}`))
        || (pending.suppressSeparator && rawValue === " ")
      ) {
        data = "";
        handled = true;
      }
    } else if (committed && rawValue === committed) {
      data = committed;
      handled = true;
    } else if (committed && preedits.some((preedit) => rawValue === `${preedit}${committed}`)) {
      data = committed;
      handled = true;
    } else {
      const preeditPrefix = preedits.find((preedit) => rawValue.startsWith(preedit) && rawValue.length > preedit.length);
      if (preedits.includes(rawValue)) {
        data = rawValue;
        handled = true;
      } else if (preeditPrefix && preedits.includes(rawValue.slice(preeditPrefix.length))) {
        data = rawValue.slice(preeditPrefix.length);
        handled = true;
      } else if (preeditPrefix && preedits.length === 1) {
        data = rawValue.slice(preeditPrefix.length);
        handled = true;
      } else if (!committed) {
        data = rawValue;
        handled = true;
      }
    }
    if (handled) {
      if (!data) {
        return "";
      }
      clearPostCompositionInput(session);
      return data;
    }
    if (pending.sent) {
      clearPostCompositionInput(session);
    }
    return null;
  };

  const rememberPostCompositionSentInput = (session, pending, committed) => {
    const committedText = stripTerminalInputSentinel(committed);
    if (!session || !committedText) {
      return;
    }
    armPostCompositionInput(session, {
      preedits: pending?.preedits || pending?.preedit || "",
      committed: committedText,
      sent: true,
      suppressSeparator: Boolean(pending?.suppressSeparator),
    });
  };

  const sendTextInput = (session, data, { dedupe = false, applySticky = false } = {}) => {
    const rawData = String(data || "");
    if (!session || !rawData) {
      return;
    }
    const currentTime = now();
    const last = session.lastTextInput;
    if (dedupe && (last?.data === rawData || last?.rawData === rawData) && currentTime - last.time < 80) {
      return;
    }
    const inputData = applySticky ? consumeStickyInput(rawData) : rawData;
    if (!inputData) {
      return;
    }
    if (dedupe) {
      session.lastTextInput = { data: inputData, rawData, time: currentTime };
    }
    sendInput(session, inputData);
  };

  const resetTextareaValue = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea || session.composingIME || session.nativeDeleteInputPending) {
      return;
    }
    textarea.value = terminalInputDeleteBuffer;
    moveTextareaCaretToEnd(textarea);
    positionInput(session);
  };

  const endNativeDeleteInput = (session, { reset = true } = {}) => {
    if (!session) {
      return;
    }
    if (session.nativeDeleteResetTimer) {
      windowObject.clearTimeout(session.nativeDeleteResetTimer);
      session.nativeDeleteResetTimer = 0;
    }
    session.nativeDeleteInputPending = false;
    if (reset) {
      resetTextareaValue(session);
    }
  };

  const armNativeDeleteInput = (session) => {
    if (!session) {
      return;
    }
    session.nativeDeleteInputPending = true;
    if (session.nativeDeleteResetTimer) {
      windowObject.clearTimeout(session.nativeDeleteResetTimer);
    }
    session.nativeDeleteResetTimer = windowObject.setTimeout(() => {
      session.nativeDeleteResetTimer = 0;
      if (lifecycle.isBound(session)) {
        endNativeDeleteInput(session);
      }
    }, nativeDeleteIdleResetMs);
  };

  const handleBeforeInput = (session, event) => {
    if (shouldReassertInputSize(session)) {
      reassertSize(session);
    }
    const type = String(event.inputType || "");
    const textarea = session?.term?.textarea;
    if (
      isBackwardDeleteInputType(type)
      && (!session?.composingIME || session?.pendingCompositionInput?.sent)
    ) {
      clearPostCompositionInput(session);
      if (session?.composingIME) {
        setComposing(session, false);
      }
      armNativeDeleteInput(session);
      sendTextInput(session, "\x7f");
      event.stopImmediatePropagation();
      return;
    }
    if (session?.nativeDeleteInputPending) {
      endNativeDeleteInput(session);
    }
    if (
      type === "insertText"
      && event.data === " "
      && session?.pendingCompositionInput?.sent
      && session.pendingCompositionInput.suppressSeparator
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setComposing(session, false);
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTextareaCaretToEnd(textarea);
      }
      resetHostViewport(session, { clean: true });
      positionInput(session);
      return;
    }
    if (type === "insertCompositionText" || type === "deleteCompositionText" || event.isComposing) {
      setComposing(session, true);
      if (typeof event.data === "string") {
        setTextareaCompositionText(session, event.data);
      }
      scrollToBottom(session);
      clearTextareaSentinel(session);
      positionInput(session);
      scheduleHostViewportReset(session, { clean: true });
      event.stopImmediatePropagation();
      return;
    }
    positionInput(session);
    let data = "";
    if (isBackwardDeleteInputType(type)) {
      data = "\x7f";
    } else if (isForwardDeleteInputType(type)) {
      data = "\x1b[3~";
    } else if (type === "insertLineBreak" || type === "insertParagraph") {
      data = "\r";
    } else if (type === "insertText" || type === "insertReplacementText") {
      data = event.data || "";
    } else if (type === "insertFromPaste") {
      const text = event.dataTransfer?.getData("text/plain") || event.data || "";
      const recentlyHandledPaste = text
        && session?.lastPasteText === text
        && now() - Number(session?.lastPasteAt || 0) < 150;
      event.preventDefault();
      event.stopImmediatePropagation();
      setComposing(session, false);
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTextareaCaretToEnd(textarea);
      }
      if (text && !recentlyHandledPaste) {
        session.lastPasteText = text;
        session.lastPasteAt = now();
        Promise.resolve(pasteText(session, text)).catch((error) => showToast(error.message));
      }
      resetHostViewport(session, { clean: true });
      positionInput(session);
      return;
    } else if (event.data) {
      data = event.data;
    }
    if (data && session?.composingIME && (type === "insertText" || type === "insertReplacementText")) {
      const textareaPreeditText = textarea ? stripTerminalInputSentinel(textarea.value) : "";
      const preeditCandidates = compositionPreeditCandidates(session, textareaPreeditText);
      event.preventDefault();
      event.stopImmediatePropagation();
      setComposing(session, false);
      armPostCompositionInput(session, {
        preedits: preeditCandidates,
        committed: data,
        sent: true,
        suppressSeparator: isTerminalASCIICompositionCommit(data),
      });
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTextareaCaretToEnd(textarea);
      }
      sendTextInput(session, data, {
        dedupe: true,
        applySticky: shouldApplyStickyCompositionInput(data),
      });
      resetHostViewport(session, { clean: true });
      positionInput(session);
      return;
    }
    const pendingComposition = session?.pendingCompositionInput;
    const compositionValue = data ? resolvePostCompositionInput(session, data) : null;
    if (compositionValue !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setComposing(session, false);
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTextareaCaretToEnd(textarea);
      }
      if (compositionValue) {
        sendTextInput(session, compositionValue, {
          dedupe: true,
          applySticky: shouldApplyStickyCompositionInput(compositionValue),
        });
        rememberPostCompositionSentInput(session, pendingComposition, compositionValue);
      }
      resetHostViewport(session, { clean: true });
      positionInput(session);
      return;
    }
    if (!data) {
      if (type.startsWith("insert") || type.startsWith("delete")) {
        event.stopImmediatePropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    setComposing(session, false);
    if (textarea) {
      textarea.value = terminalInputDeleteBuffer;
      moveTextareaCaretToEnd(textarea);
    }
    sendTextInput(session, data, {
      dedupe: type === "insertText" || type === "insertReplacementText" || Boolean(event.data),
      applySticky: shouldApplyStickyTextInput(data, type),
    });
    resetHostViewport(session, { clean: true });
    positionInput(session);
  };

  const handleTextareaInput = (session, event) => {
    event.stopPropagation();
    if (shouldReassertInputSize(session)) {
      reassertSize(session);
    }
    const textarea = session?.term?.textarea;
    if (!textarea) {
      return;
    }
    const type = String(event.inputType || "");
    if (session.composingIME) {
      clearPostCompositionInput(session);
      const value = stripTerminalInputSentinel(textarea.value);
      if (value) {
        setTextareaCompositionText(session, value);
      }
      resetHostViewport(session, { clean: true });
      positionInput(session);
      return;
    }
    const value = stripTerminalInputSentinel(textarea.value);
    if (isBackwardDeleteInputType(type) || (session.nativeDeleteInputPending && !type)) {
      const handledByBeforeInput = Boolean(session.nativeDeleteInputPending);
      if (!handledByBeforeInput) {
        sendTextInput(session, "\x7f");
      }
      armNativeDeleteInput(session);
      resetHostViewport(session, { clean: true });
      positionInput(session);
      return;
    }
    const pendingComposition = session?.pendingCompositionInput;
    const compositionValue = (value || (!isBackwardDeleteInputType(type) && !isForwardDeleteInputType(type)))
      ? resolvePostCompositionInput(session, value)
      : null;
    if (compositionValue !== null) {
      if (compositionValue) {
        sendTextInput(session, compositionValue, {
          dedupe: true,
          applySticky: shouldApplyStickyCompositionInput(compositionValue),
        });
        rememberPostCompositionSentInput(session, pendingComposition, compositionValue);
      }
    } else if (!value && isBackwardDeleteInputType(type)) {
      sendTextInput(session, "\x7f");
    } else if (!value && isForwardDeleteInputType(type)) {
      sendTextInput(session, "\x1b[3~");
    } else if (value) {
      sendTextInput(session, value, {
        dedupe: true,
        applySticky: shouldApplyStickyTextInput(value, type),
      });
    }
    textarea.value = terminalInputDeleteBuffer;
    moveTextareaCaretToEnd(textarea);
    resetHostViewport(session, { clean: true });
    positionInput(session);
  };

  const detachHostCompositionListeners = (session) => {
    const host = session?.terminalHost;
    const handler = session?.term?.inputHandler;
    if (!host || !handler || handler.webshellCompositionDetached) {
      return;
    }
    const compositionListeners = [
      ["compositionstart", "compositionStartListener"],
      ["compositionupdate", "compositionUpdateListener"],
      ["compositionend", "compositionEndListener"],
    ];
    for (const [type, key] of compositionListeners) {
      const listener = handler[key];
      if (typeof listener === "function") {
        host.removeEventListener(type, listener);
      }
      handler[key] = null;
    }
    handler.isComposing = false;
    handler.webshellCompositionDetached = true;
  };

  const installHostInputIsolation = (session) => {
    const host = session?.terminalHost;
    if (!host) {
      return;
    }
    host.removeAttribute("contenteditable");
    host.removeAttribute("tabindex");
    detachHostCompositionListeners(session);
    const stopHostEditableInput = (event) => {
      if (event.target !== host) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopImmediatePropagation();
      if (event.type === "compositionend") {
        setComposing(session, false);
      }
      scheduleHostViewportReset(session, { clean: true });
      positionInput(session);
    };
    const blockedHostInputEvents = ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend"];
    const interceptTextareaBeforeInput = (event) => {
      if (event.target !== session?.term?.textarea) {
        return;
      }
      handleBeforeInput(session, event);
      event.stopImmediatePropagation();
    };
    lifecycle.listen(session, host, "beforeinput", interceptTextareaBeforeInput, { capture: true });
    for (const type of blockedHostInputEvents) {
      lifecycle.listen(session, host, type, stopHostEditableInput, { capture: true });
    }
  };

  const installInputFocus = (session) => {
    const term = session?.term;
    const host = session?.terminalHost;
    const shell = session?.shellEl;
    const textarea = term?.textarea;
    if (!term || !host || !shell || !textarea) {
      return;
    }
    textarea.setAttribute("inputmode", "text");
    textarea.setAttribute("enterkeyhint", "enter");
    textarea.setAttribute("rows", "1");
    textarea.setAttribute("wrap", "off");
    term.focus = () => focusInput(session, { focusSource: "system" });
    let pageFocusMouse = null;
    // Let the browser perform its default mouse focus for this initial tap,
    // while skipping application handlers (including Ghostty's direct focus).
    // stopImmediatePropagation intentionally does NOT cancel the default action.
    for (const type of ["mousedown", "mouseup", "click"]) {
      lifecycle.listen(session, shell, type, (event) => {
        if (!pageFocusMouse || !requiresTouchKeyboardDoubleTap()) return;
        if (now() - pageFocusMouse.at > 1000) {
          pageFocusMouse = null;
          return;
        }
        if (event.sourceCapabilities?.firesTouchEvents === false
          || !event.isTrusted || event.button !== 0
          || !isElement(event.target) || event.target.closest(".terminal-host") !== host
          || Math.hypot(event.clientX - pageFocusMouse.x, event.clientY - pageFocusMouse.y) >= moveThresholdPx * 2) return;
        event.stopImmediatePropagation();
        keyboardDiagnostics.record(session, "tap.page-default-mouse", {
          ageMs: now() - pageFocusMouse.at,
          firesTouchEvents: event.sourceCapabilities?.firesTouchEvents,
        }, event);
        if (type === "click") pageFocusMouse = null;
      }, { capture: true, passive: true });
    }
    // Keep Ghostty's scrolling cleanup, but let IME exclusively decide whether
    // a touch opens the keyboard. In particular, a first tap must not focus
    // the textarea only for a later listener to blur it again.
    const ghosttyTouchEnd = term.handleTouchEnd;
    if (typeof ghosttyTouchEnd === "function") {
      host.removeEventListener("touchend", ghosttyTouchEnd, { capture: true });
      lifecycle.listen(session, host, "touchend", (event) => {
        if (requiresTouchKeyboardDoubleTap()) {
          if (pageFocusTouchEnds.has(event)) {
            term.finishTouchScroll?.();
            keyboardDiagnostics.record(session, "tap.page-default-host", {}, event);
            return;
          }
          if (claimedTouchEnds.has(event)) {
            stopTouchScroll(session);
            if (event.cancelable) event.preventDefault();
            return;
          }
          if (term.touchScrollActive && !term.touchScrollMoved && !term.isDraggingScrollbar) {
            term.finishTouchScroll?.();
            if (event.cancelable) event.preventDefault();
            return;
          }
        }
        ghosttyTouchEnd.call(term, event);
      }, { capture: true, passive: false });
    }
    lifecycle.listen(session, textarea, "focus", () => {
      keyboardDiagnostics.record(session, "textarea.focus");
      cancelKeyboardDismissRecovery();
      if (requiresTouchKeyboardDoubleTap()) syncInputLayout(session);
      else positionInput(session);
      updateActiveTabTitle();
    });
    lifecycle.listen(session, textarea, "blur", () => {
      keyboardDiagnostics.record(session, "textarea.blur");
      session.terminalInputAnchor = null;
      releaseInputViewportLock(session);
      updateActiveTabTitle();
      scheduleKeyboardDismissRecovery({ hadInputFocus: true });
    });
    let lastMobileTap = null;
    let mobileTapTouchState = null;
    lifecycle.listen(session, host, "keydown", () => {
      if (shouldReassertInputSize(session)) {
        reassertSize(session);
      }
    }, { capture: true });
    lifecycle.listen(session, textarea, "beforeinput", (event) => {
      handleBeforeInput(session, event);
    }, { capture: true });
    lifecycle.listen(session, textarea, "compositionstart", (event) => {
      event.stopPropagation();
      scrollToBottom(session);
      clearTextareaSentinel(session);
      clearPostCompositionInput(session);
      setComposing(session, true);
      session.compositionTextHistory = [];
      session.compositionPreviousText = "";
      setTextareaCompositionText(session, "");
      positionInput(session);
      scheduleHostViewportReset(session, { clean: true });
    }, { capture: true });
    lifecycle.listen(session, textarea, "compositionupdate", (event) => {
      event.stopPropagation();
      setComposing(session, true);
      if (typeof event.data === "string") {
        setTextareaCompositionText(session, event.data);
      }
      positionInput(session);
      scheduleHostViewportReset(session, { clean: true });
    }, { capture: true });
    lifecycle.listen(session, textarea, "compositionend", (event) => {
      event.stopPropagation();
      const preeditText = textareaCompositionText(session);
      const textareaPreeditText = stripTerminalInputSentinel(textarea.value);
      const preeditCandidates = compositionPreeditCandidates(session, preeditText, textareaPreeditText);
      const committedText = typeof event.data === "string" ? stripTerminalInputSentinel(event.data) : "";
      const committedAlreadySent = isPostCompositionInputAlreadySent(session, committedText);
      setComposing(session, false);
      armPostCompositionInput(session, {
        preedits: preeditCandidates,
        committed: committedText,
        sent: Boolean(committedText),
        suppressSeparator: isTerminalASCIICompositionCommit(committedText),
      });
      textarea.value = terminalInputDeleteBuffer;
      moveTextareaCaretToEnd(textarea);
      if (committedText && !committedAlreadySent) {
        sendTextInput(session, committedText, {
          dedupe: true,
          applySticky: shouldApplyStickyCompositionInput(committedText),
        });
      }
      lifecycle.timeout(session, () => {
        const fallbackValue = stripTerminalInputSentinel(textarea.value);
        if (fallbackValue) {
          const pendingComposition = session?.pendingCompositionInput;
          const compositionValue = resolvePostCompositionInput(session, fallbackValue);
          if (compositionValue) {
            sendTextInput(session, compositionValue, {
              dedupe: true,
              applySticky: shouldApplyStickyCompositionInput(compositionValue),
            });
            rememberPostCompositionSentInput(session, pendingComposition, compositionValue);
          }
        }
        resetTextareaValue(session);
        resetHostViewport(session, { clean: true });
      }, 0);
    }, { capture: true });
    lifecycle.listen(session, textarea, "input", (event) => {
      handleTextareaInput(session, event);
    }, { capture: true });
    lifecycle.listen(session, textarea, "paste", (event) => {
      const result = handleNativePaste(session, event);
      if (!result?.handled) {
        return;
      }
      if (result.kind === "text" && result.text) {
        session.lastPasteText = result.text;
        session.lastPasteAt = now();
      }
    }, { capture: true });
    const isTerminalTouchTarget = (target) => isElement(target) && target.closest(".terminal-host") === host;
    const claimCurrentDeviceTerminalSize = (event) => {
      if (event.pointerType === "mouse") pageFocusMouse = null;
      if (
        !isTerminalTouchTarget(event.target)
        || event.isPrimary === false
        || (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      claimCurrentDeviceSize(session);
    };
    lifecycle.listen(session, shell, "pointerdown", claimCurrentDeviceTerminalSize, { capture: true, passive: true });
    lifecycle.listen(session, host, "pointerdown", (event) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        return;
      }
      if (requiresTouchKeyboardDoubleTap()) focusInput(session, { requestMobileKeyboard: true });
      else lifecycle.frame(session, () => focusInput(session));
    });
    const startMobileTap = (event) => {
      keyboardDiagnostics.record(session, "tap.start", {
        touchLayout: requiresTouchKeyboardDoubleTap(), terminalTarget: isTerminalTouchTarget(event.target),
      }, event);
      if (!requiresTouchKeyboardDoubleTap() || event.touches.length !== 1 || !isTerminalTouchTarget(event.target)) {
        mobileTapTouchState = null;
        lastMobileTap = null;
        return;
      }
      claimCurrentDeviceSize(session);
      keyboardDiagnostics.record(session, "tap.size-claim-return", {}, event);
      const touch = event.touches[0];
      mobileTapTouchState = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        moved: false,
      };
    };
    const moveMobileTap = (event) => {
      if (!mobileTapTouchState) return;
      if (event.touches.length !== 1 || event.touches[0].identifier !== mobileTapTouchState.identifier) {
        mobileTapTouchState = null;
        lastMobileTap = null;
        return;
      }
      const touch = event.touches[0];
      if (
        Math.abs(touch.clientX - mobileTapTouchState.startX) >= moveThresholdPx
        || Math.abs(touch.clientY - mobileTapTouchState.startY) >= moveThresholdPx
      ) {
        if (!mobileTapTouchState.moved) keyboardDiagnostics.record(session, "tap.move-rejected", {
          dx: touch.clientX - mobileTapTouchState.startX, dy: touch.clientY - mobileTapTouchState.startY,
        }, event);
        if (!mobileTapTouchState.moved) blurInput(session, { preserveTouchGesture: true });
        mobileTapTouchState.moved = true;
        lastMobileTap = null;
      }
    };
    const finishMobileTap = (event) => {
      keyboardDiagnostics.record(session, "tap.end", {
        touchLayout: requiresTouchKeyboardDoubleTap(),
        state: mobileTapTouchState ? { ...mobileTapTouchState } : null,
        previousTap: lastMobileTap ? { ...lastMobileTap } : null,
      }, event);
      if (!requiresTouchKeyboardDoubleTap() || !mobileTapTouchState) {
        keyboardDiagnostics.record(session, "tap.rejected", { reason: "no-touch-layout-or-start-state" }, event);
        mobileTapTouchState = null;
        lastMobileTap = null;
        return;
      }
      const touch = event.changedTouches?.[0] || event.touches?.[0] || null;
      const state = mobileTapTouchState;
      mobileTapTouchState = null;
      const currentTime = eventTime(event);
      if (
        !touch || touch.identifier !== state.identifier || state.moved
        || Math.abs(touch.clientX - state.startX) >= moveThresholdPx
        || Math.abs(touch.clientY - state.startY) >= moveThresholdPx
      ) {
        keyboardDiagnostics.record(session, "tap.rejected", { reason: "missing-touch-identifier-or-movement" }, event);
        lastMobileTap = null;
        return;
      }
      const elapsed = lastMobileTap ? currentTime - lastMobileTap.at : Infinity;
      const isDoubleTap = elapsed >= 0 && elapsed <= doubleTapDelayMs
        && Math.hypot(touch.clientX - lastMobileTap.x, touch.clientY - lastMobileTap.y) < moveThresholdPx * 2;
      keyboardDiagnostics.record(session, "tap.classified", {
        isDoubleTap, elapsedMs: Number.isFinite(elapsed) ? elapsed : null,
        distancePx: lastMobileTap ? Math.hypot(touch.clientX - lastMobileTap.x, touch.clientY - lastMobileTap.y) : null,
        doubleTapDelayMs, moveThresholdPx,
      }, event);
      if (!isDoubleTap) {
        lastMobileTap = { at: currentTime, x: touch.clientX, y: touch.clientY };
        blurInput(session, { preserveTouchGesture: true });
        if (!documentObject.hasFocus() && !event.defaultPrevented
          && !term.touchScrollMoved && !term.isDraggingScrollbar) {
          pageFocusTouchEnds.add(event);
          pageFocusMouse = { at: now(), x: touch.clientX, y: touch.clientY };
          keyboardDiagnostics.record(session, "tap.page-default-offered", {}, event);
        }
        return;
      }
      lastMobileTap = null;
      claimedTouchEnds.add(event);
      focusInput(session, {
        requestMobileKeyboard: true,
        forceMobileFocusTransition: true,
      });
      if (event.cancelable) {
        event.preventDefault();
      }
    };
    const cancelMobileTap = () => {
      keyboardDiagnostics.record(session, "tap.state-cleared", {
        hadStart: Boolean(mobileTapTouchState), hadPreviousTap: Boolean(lastMobileTap),
      });
      mobileTapTouchState = null;
      lastMobileTap = null;
    };
    touchGestureCancellations.set(session, cancelMobileTap);
    lifecycle.listen(session, shell, "touchstart", startMobileTap, { capture: true, passive: true });
    lifecycle.listen(session, shell, "touchmove", moveMobileTap, { capture: true, passive: true });
    lifecycle.listen(session, shell, "touchend", finishMobileTap, { capture: true, passive: false });
    lifecycle.listen(session, shell, "touchcancel", cancelMobileTap, { capture: true, passive: true });
    prepareTextareaForInput(session);
    positionInput(session);
    lifecycle.frame(session, () => positionInput(session));
  };

  const installHostViewportGuard = (session) => {
    const host = session?.terminalHost;
    if (!host) {
      return;
    }
    lifecycle.listen(session, host, "beforeinput", () => scheduleHostViewportReset(session, { clean: true }));
    lifecycle.listen(session, host, "input", () => scheduleHostViewportReset(session, { clean: true }));
    lifecycle.listen(session, host, "scroll", () => scheduleHostViewportReset(session));
    lifecycle.listen(session, host, "blur", () => {
      setComposing(session, false);
      scheduleHostViewportReset(session, { clean: true });
    });
    resetHostViewport(session, { clean: true });
  };

  const disposeSession = (session) => {
    if (!session) {
      return false;
    }
    endNativeDeleteInput(session, { reset: false });
    releaseInputViewportLock(session, { resync: false });
    setComposing(session, false);
    session.pendingCompositionInput = null;
    session.terminalInputAnchor = null;
    touchGestureCancellations.get(session)?.();
    touchGestureCancellations.delete(session);
    installedSessions.delete(session);
    return lifecycle.disposeSession(session);
  };

  return Object.freeze({
    installSession(session) {
      if (disposed || !session) {
        return false;
      }
      if (installedSessions.has(session)) {
        return true;
      }
      if (!lifecycle.bind(session)) {
        return false;
      }
      installedSessions.add(session);
      if (!cleanupRegistered.has(session)) {
        cleanupRegistered.add(session);
        registerSessionCleanup(session, () => disposeSession(session));
      }
      installHostInputIsolation(session);
      installInputFocus(session);
      installKeyOverrides(session);
      installHostViewportGuard(session);
      keyboardDiagnostics.record(session, "session.installed", {
        connected: session.term?.textarea?.isConnected,
        hostTabIndex: session.terminalHost?.getAttribute("tabindex"),
        hostContentEditable: session.terminalHost?.getAttribute("contenteditable"),
      });
      keyboardDiagnostics.probe(session, "session-installed");
      return true;
    },
    resetHostViewport,
    scheduleHostViewportReset,
    positionInput,
    focusInput,
    blurInput,
    blurMobileKeyboard() {
      const session = getActiveSession();
      blurInput(session);
      const activeElement = documentObject.activeElement;
      if (isHTMLElement(activeElement) && activeElement !== documentObject.body) {
        activeElement.blur();
      }
    },
    focusFromShortcut(session = getActiveSession()) {
      if (!isTouchShortcutLayout()) {
        return false;
      }
      const targetSession = session || getActiveSession();
      if (!targetSession?.term?.textarea) {
        return false;
      }
      return focusInput(targetSession, { requestMobileKeyboard: true });
    },
    focusForNativePaste(session = getActiveSession()) {
      if (!session?.term || session.closed) {
        return false;
      }
      return focusInput(session, { requestMobileKeyboard: true });
    },
    shouldPreserveKeyboardForShortcut(shortcut) {
      return String(shortcut?.action || "") !== "open_mobile_menu";
    },
    // Shortcut interaction protection includes focus while the keyboard is
    // opening. It is deliberately not a claim that the OS keyboard is visible.
    shouldPreserveInputFocus(session = getActiveSession()) {
      if (!isTouchShortcutLayout()) {
        return false;
      }
      const textarea = session?.term?.textarea;
      return Boolean(textarea && (documentObject.activeElement === textarea || isKeyboardViewportActive()));
    },
    isKeyboardClaimed(event) {
      return claimedTouchEnds.has(event);
    },
    shouldPreserveTouchDefault(event) {
      const claimed = claimedTouchEnds.has(event);
      const pageFocus = pageFocusTouchEnds.has(event);
      if (claimed || pageFocus) {
        keyboardDiagnostics.record(getActiveSession(), "tap.preserve-default-queried", {
          claimed,
          pageFocus,
          prevented: event?.defaultPrevented === true,
        }, event);
      }
      return claimed || pageFocus;
    },
    disposeSession,
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      for (const session of lifecycle.sessions()) {
        disposeSession(session);
      }
      lifecycle.dispose();
      keyboardDiagnostics.dispose();
      return true;
    },
  });
}
