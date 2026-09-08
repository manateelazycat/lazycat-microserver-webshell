import { createMobileShortcutsLifecycle } from "./mobile_shortcuts_lifecycle.js";

const REPEATABLE_INPUT_KEYS = new Set([
  "enter",
  "arrow_up",
  "arrow_down",
  "arrow_left",
  "arrow_right",
]);
const STICKY_ACTIONS = new Set(["sticky_ctrl", "sticky_alt", "sticky_shift"]);
const FEEDBACK_ACTION = "toggle_touch_feedback";

/**
 * Owns the visible terminal shortcut bar and its touch/keyboard interaction.
 * Workspace and terminal operations are supplied as callbacks; this module
 * never mutates tabs, sessions, transport, history or rendering state.
 */
export function createMobileShortcutsController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  storage = windowObject?.localStorage,
  storageKey = "webshell.touchShortcutFeedback",
  mobileShortcuts = null,
  mobileShortcutRows = null,
  getShortcutRows = () => [[], []],
  getActiveSession = () => null,
  getCurrentTab = () => null,
  isDesktopShortcutBarLayout = () => false,
  terminalIME = null,
  sendInput = () => false,
  resolveShortcutInputData = () => "",
  normalizeShortcutText = (value) => String(value || ""),
  applyStickyModifierInput = (value) => String(value || ""),
  canApplyStickyModifierInput = () => false,
  updateSelection = () => {},
  createIcon = () => null,
  onAction = () => {},
  showToast = () => {},
  vibrate = null,
  PointerEventCtor = globalThis.PointerEvent,
  HTMLElementCtor = globalThis.HTMLElement,
  performanceObject = globalThis.performance,
  touchMoveThresholdPx = 8,
  repeatInitialDelayMs = 320,
  repeatIntervalMs = 80,
} = {}) {
  const lifecycle = createMobileShortcutsLifecycle({ windowObject });
  const rows = mobileShortcutRows || Array.from(
    mobileShortcuts?.querySelectorAll?.("[data-mobile-shortcut-row]") || [],
  );
  const sticky = { ctrl: false, alt: false, shift: false };
  let feedbackEnabled = true;
  let disposed = false;

  const readFeedbackEnabled = () => {
    try {
      const persisted = String(storage?.getItem?.(storageKey) || "").trim().toLowerCase();
      return !persisted || !["false", "0", "off"].includes(persisted);
    } catch (error) {
      return true;
    }
  };

  const persistFeedbackEnabled = (enabled) => {
    try {
      if (enabled !== false) {
        storage?.removeItem?.(storageKey);
      } else {
        storage?.setItem?.(storageKey, "false");
      }
    } catch (error) {
    }
  };

  feedbackEnabled = readFeedbackEnabled();

  const now = () => {
    const value = Number(performanceObject?.now?.());
    return Number.isFinite(value) ? value : Date.now();
  };

  const isPointerEvent = (event) => (
    typeof PointerEventCtor === "function"
      ? event instanceof PointerEventCtor
      : Boolean(event && Number.isFinite(event.pointerId))
  );

  const isHTMLElement = (value) => (
    typeof HTMLElementCtor === "function"
      ? value instanceof HTMLElementCtor
      : Boolean(value && typeof value === "object")
  );

  const hasStickyModifiers = () => sticky.ctrl || sticky.alt || sticky.shift;

  const syncState = () => {
    if (disposed) {
      return false;
    }
    for (const [action, key] of [["sticky_ctrl", "ctrl"], ["sticky_alt", "alt"], ["sticky_shift", "shift"]]) {
      for (const button of mobileShortcuts?.querySelectorAll?.(`[data-mobile-action="${action}"]`) || []) {
        button.classList?.toggle?.("active", sticky[key]);
        button.setAttribute?.("aria-pressed", sticky[key] ? "true" : "false");
      }
    }
    const feedbackLabel = feedbackEnabled ? "Shock On" : "Shock Off";
    for (const button of mobileShortcuts?.querySelectorAll?.(`[data-mobile-action="${FEEDBACK_ACTION}"]`) || []) {
      button.classList?.toggle?.("active", feedbackEnabled);
      button.setAttribute?.("aria-pressed", feedbackEnabled ? "true" : "false");
      button.setAttribute?.("aria-label", button.dataset?.customLabel || feedbackLabel);
      button.setAttribute?.("title", button.dataset?.customLabel || feedbackLabel);
    }
    updateSelection();
    return true;
  };

  const clearSticky = () => {
    sticky.ctrl = false;
    sticky.alt = false;
    sticky.shift = false;
    syncState();
  };

  const toggleSticky = (key) => {
    if (!Object.prototype.hasOwnProperty.call(sticky, key)) {
      return false;
    }
    sticky[key] = !sticky[key];
    syncState();
    return sticky[key];
  };

  const shouldApplyStickyTextInput = (value, inputType = "") => {
    if (!hasStickyModifiers()) {
      return false;
    }
    const type = String(inputType || "");
    if (type === "insertFromPaste" || type.includes("Composition")) {
      return false;
    }
    return canApplyStickyModifierInput(value);
  };

  const shouldApplyStickyCompositionInput = (value) => {
    if (!hasStickyModifiers()) {
      return false;
    }
    const points = Array.from(String(value || ""));
    if (points.length !== 1) {
      return false;
    }
    const codePoint = points[0].codePointAt(0);
    return Number.isFinite(codePoint) && codePoint >= 0x20 && codePoint <= 0x7e;
  };

  const consumeStickyInput = (value) => {
    if (!hasStickyModifiers() || !canApplyStickyModifierInput(value)) {
      return String(value || "");
    }
    const encoded = applyStickyModifierInput(value, {
      ctrl: sticky.ctrl,
      alt: sticky.alt,
      shift: sticky.shift,
    });
    clearSticky();
    return encoded;
  };

  const triggerFeedback = () => {
    if (typeof vibrate === "function") {
      try {
        return vibrate() === true;
      } catch (error) {
        return false;
      }
    }
    const bridge = globalThis.lzc_vibrate;
    if (!bridge || typeof bridge.Vibrate !== "function") {
      return false;
    }
    try {
      bridge.Vibrate(0);
      return true;
    } catch (error) {
      return false;
    }
  };

  const setFeedbackEnabled = (enabled) => {
    feedbackEnabled = enabled !== false;
    persistFeedbackEnabled(feedbackEnabled);
    syncState();
    return feedbackEnabled;
  };

  const stopEvent = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  };

  const rememberShortcutSession = (state) => {
    state.shortcutSession = getActiveSession();
  };

  const invokeAction = (action, session) => {
    if (disposed) {
      return;
    }
    try {
      const result = onAction(action, session, {
        getCurrentTab,
        clearSticky,
        setFeedbackEnabled,
      });
      if (result?.catch) {
        result.catch((error) => showToast(error?.message || String(error)));
      }
    } catch (error) {
      showToast(error?.message || String(error));
    }
  };

  const resolveShortcutData = (shortcut) => {
    const hadStickyModifiers = hasStickyModifiers();
    const encoded = resolveShortcutInputData(shortcut, {
      ctrl: sticky.ctrl,
      shift: sticky.shift,
      alt: sticky.alt,
    });
    if (hadStickyModifiers) {
      clearSticky();
    }
    return encoded || (typeof shortcut?.data === "string" ? shortcut.data : "");
  };

  const trigger = (shortcut, session = getActiveSession(), options = {}) => {
    if (disposed || !shortcut) {
      return false;
    }
    if (options.feedback !== false && shortcut.action !== FEEDBACK_ACTION && feedbackEnabled) {
      triggerFeedback();
    }
    if (shortcut.action) {
      if (shortcut.action === "sticky_ctrl" || shortcut.action === "ctrl") {
        toggleSticky("ctrl");
        terminalIME?.focusFromShortcut?.(session);
      } else if (shortcut.action === "sticky_alt" || shortcut.action === "alt") {
        toggleSticky("alt");
        terminalIME?.focusFromShortcut?.(session);
      } else if (shortcut.action === "sticky_shift" || shortcut.action === "shift") {
        toggleSticky("shift");
        terminalIME?.focusFromShortcut?.(session);
      } else if (shortcut.action === FEEDBACK_ACTION) {
        const enabled = setFeedbackEnabled(!feedbackEnabled);
        if (enabled) {
          triggerFeedback();
        }
      } else {
        invokeAction(shortcut.action, session);
      }
      return true;
    }
    const data = resolveShortcutData(shortcut);
    if (!data || !session) {
      return false;
    }
    if (typeof shortcut.text === "string" && shortcut.text !== "") {
      if (hasStickyModifiers()) {
        clearSticky();
      }
      const text = normalizeShortcutText(shortcut.text);
      if (text) {
        sendInput(session, text);
      }
      return true;
    }
    sendInput(session, data);
    return true;
  };

  const isRepeatable = (shortcut) => REPEATABLE_INPUT_KEYS.has(String(shortcut?.inputKey || ""));

  const bindButton = (button, shortcut) => {
    const state = {
      activePointerId: -1,
      touchStartX: 0,
      touchStartY: 0,
      touchMoved: false,
      touchScrollRow: null,
      touchScrollStartLeft: 0,
      touchHorizontalScroll: false,
      shortcutSession: null,
      suppressNextClick: false,
      repeatDelayTimer: 0,
      repeatTimer: 0,
      repeatTriggered: false,
    };

    const stopRepeat = () => {
      lifecycle.clearTimeout(state.repeatDelayTimer);
      lifecycle.clearInterval(state.repeatTimer);
      state.repeatDelayTimer = 0;
      state.repeatTimer = 0;
      state.repeatTriggered = false;
      if (!STICKY_ACTIONS.has(shortcut?.action) && shortcut?.action !== FEEDBACK_ACTION) {
        button.classList?.remove?.("active");
      }
    };

    const resetPointer = () => {
      state.activePointerId = -1;
      state.touchStartX = 0;
      state.touchStartY = 0;
      state.touchMoved = false;
      state.touchScrollRow = null;
      state.touchScrollStartLeft = 0;
      state.touchHorizontalScroll = false;
    };

    const updateTouchMoved = (clientX, clientY) => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
      }
      const dx = clientX - state.touchStartX;
      const dy = clientY - state.touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (!state.touchMoved && (absX >= touchMoveThresholdPx || absY >= touchMoveThresholdPx)) {
        state.touchMoved = true;
        stopRepeat();
      }
      if (
        state.touchScrollRow
        && !state.touchHorizontalScroll
        && absX >= touchMoveThresholdPx
        && absX > absY
      ) {
        state.touchHorizontalScroll = true;
      }
      if (state.touchHorizontalScroll && state.touchScrollRow) {
        state.touchScrollRow.scrollLeft = state.touchScrollStartLeft - dx;
      }
    };

    const startRepeat = () => {
      if (!isRepeatable(shortcut)) {
        return;
      }
      stopRepeat();
      state.repeatDelayTimer = lifecycle.setTimeout(() => {
        state.repeatDelayTimer = 0;
        if (state.activePointerId < 0 || state.touchMoved) {
          return;
        }
        state.repeatTriggered = true;
        state.suppressNextClick = true;
        button.classList?.add?.("active");
        trigger(shortcut, state.shortcutSession || getActiveSession());
        state.repeatTimer = lifecycle.setInterval(() => {
          if (state.activePointerId < 0 || state.touchMoved) {
            stopRepeat();
            return;
          }
          trigger(shortcut, state.shortcutSession || getActiveSession(), { feedback: false });
        }, repeatIntervalMs);
      }, repeatInitialDelayMs);
    };

    lifecycle.listen(button, "touchstart", (event) => {
      if (
        !terminalIME?.shouldPreserveKeyboardForShortcut?.(shortcut)
        || Number(event?.touches?.length || 0) !== 1
      ) {
        return;
      }
      rememberShortcutSession(state);
      if (!terminalIME?.shouldPreserveInputFocus?.(state.shortcutSession)) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault?.();
      }
      event.stopPropagation?.();
    }, { capture: true, passive: false });

    lifecycle.listen(button, "mousedown", (event) => {
      if (!isDesktopShortcutBarLayout()) {
        return;
      }
      event.preventDefault?.();
      rememberShortcutSession(state);
    });

    lifecycle.listen(button, "pointerdown", (event) => {
      if (!isPointerEvent(event) || !event.isPrimary) {
        return;
      }
      if (event.pointerType !== "touch" && event.pointerType !== "pen") {
        return;
      }
      stopEvent(event);
      state.activePointerId = event.pointerId;
      state.touchStartX = event.clientX;
      state.touchStartY = event.clientY;
      state.touchMoved = false;
      state.repeatTriggered = false;
      rememberShortcutSession(state);
      if (terminalIME?.shouldPreserveInputFocus?.(state.shortcutSession)) {
        const row = button.closest?.(".mobile-shortcut-row");
        state.touchScrollRow = isHTMLElement(row) ? row : null;
        state.touchScrollStartLeft = state.touchScrollRow?.scrollLeft || 0;
      } else {
        state.touchScrollRow = null;
        state.touchScrollStartLeft = 0;
      }
      state.touchHorizontalScroll = false;
      startRepeat();
    }, { passive: false });

    lifecycle.listen(button, "pointermove", (event) => {
      if (!isPointerEvent(event) || event.pointerId !== state.activePointerId) {
        return;
      }
      updateTouchMoved(event.clientX, event.clientY);
    }, { passive: true });

    lifecycle.listen(button, "pointerup", (event) => {
      if (!isPointerEvent(event) || event.pointerId !== state.activePointerId) {
        return;
      }
      updateTouchMoved(event.clientX, event.clientY);
      const shouldTrigger = !state.touchMoved && !state.repeatTriggered;
      stopRepeat();
      resetPointer();
      state.suppressNextClick = true;
      stopEvent(event);
      if (shouldTrigger) {
        trigger(shortcut, state.shortcutSession || getActiveSession());
      }
      state.shortcutSession = null;
    }, { passive: false });

    lifecycle.listen(button, "pointercancel", (event) => {
      if (!isPointerEvent(event) || event.pointerId !== state.activePointerId) {
        return;
      }
      stopRepeat();
      resetPointer();
      state.shortcutSession = null;
    });

    lifecycle.listen(button, "click", (event) => {
      stopEvent(event);
      if (state.suppressNextClick) {
        state.suppressNextClick = false;
        state.shortcutSession = null;
        return;
      }
      trigger(shortcut, state.shortcutSession || getActiveSession());
      if (isDesktopShortcutBarLayout()) {
        button.blur?.();
      }
      state.shortcutSession = null;
    });
  };

  const render = () => {
    if (disposed || !mobileShortcuts || rows.length === 0) {
      return false;
    }
    lifecycle.resetBindings();
    const configuredRows = getShortcutRows() || [[], []];
    const hasShortcuts = configuredRows.some((row) => Array.isArray(row) && row.length > 0);
    mobileShortcuts.classList?.toggle?.("is-empty", !hasShortcuts);
    documentObject?.body?.classList?.toggle?.("mobile-shortcuts-empty", !hasShortcuts);
    rows.forEach((row, rowIndex) => {
      row.textContent = "";
      for (const shortcut of configuredRows[rowIndex] || []) {
        const button = documentObject.createElement("button");
        button.type = "button";
        button.className = "mobile-shortcut-key";
        button.tabIndex = -1;
        button.dataset.mobileShortcutId = shortcut.id;
        if (shortcut.inputKey) {
          button.dataset.mobileShortcutInputKey = shortcut.inputKey;
        }
        if (shortcut.action) {
          button.dataset.mobileAction = shortcut.action;
        }
        if (shortcut.kind) {
          button.dataset.kind = shortcut.kind;
        }
        const iconName = String(shortcut.icon || "").trim();
        if (iconName && shortcut.action !== "open_mobile_menu") {
          const icon = createIcon(iconName, "mobile-shortcut-icon");
          if (icon) {
            button.appendChild(icon);
          }
        } else {
          button.textContent = shortcut.label;
        }
        button.setAttribute("aria-label", shortcut.ariaLabel || shortcut.label);
        button.setAttribute("title", shortcut.ariaLabel || shortcut.label);
        button.dataset.customLabel = shortcut.ariaLabel || shortcut.label;
        if (shortcut.action === "open_mobile_menu") {
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
        }
        if (["sticky_ctrl", "sticky_alt", "sticky_shift", FEEDBACK_ACTION].includes(shortcut.action)) {
          button.setAttribute("aria-pressed", "false");
        }
        bindButton(button, shortcut);
        row.appendChild(button);
      }
    });
    syncState();
    return true;
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    lifecycle.dispose();
    return true;
  };

  return Object.freeze({
    consumeStickyInput,
    dispose,
    getStickyModifiers: () => ({ ...sticky }),
    hasStickyModifiers,
    isFeedbackEnabled: () => feedbackEnabled,
    normalizeShortcutText,
    render,
    setFeedbackEnabled,
    shouldApplyStickyCompositionInput,
    shouldApplyStickyTextInput,
    syncState,
    trigger,
  });
}
