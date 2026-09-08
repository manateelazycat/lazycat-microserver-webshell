import { createTerminalSelectionLifecycle } from "./selection_lifecycle.js";
import {
  compareTerminalSelectionCells,
  currentTerminalSelectionCells,
  nextTerminalSelectionCell,
  normalizeTerminalSelectionCells,
  previousTerminalSelectionCell,
  terminalSelectionContainsCell,
  terminalSelectionText,
} from "./selection_model.js";
import { createTerminalSelectionView } from "./selection_view.js";

const defaultTouchMoveThresholdPx = 7;
const defaultLongPressDelayMs = 450;
const defaultAutoScrollEdgePx = 34;
const defaultAutoScrollIntervalMs = 50;
const defaultAutoScrollMaxLines = 4;

export function createTerminalSelectionController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  view = null,
  lifecycleFactory = createTerminalSelectionLifecycle,
  getActiveSession = () => null,
  getFullBufferText = () => "",
  isTouchSelectionLayout = () => false,
  isMobileLayout = () => false,
  isOverviewOpen = () => false,
  isMobileMenuOpen = () => false,
  refreshMobileMenu = () => {},
  blurInput = () => {},
  isKeyboardClaimed = () => false,
  activateSession = () => {},
  markContextMenuCandidate = () => {},
  hasMouseTracking = () => false,
  isRenderAllowed = () => true,
  copyCurrentSelection = () => {},
  copySession = () => {},
  pasteSession = () => {},
  openSearchFromSelection = () => {},
  showToast = () => {},
  registerSessionCleanup = () => {},
  isDesktopAutoCopyEnabled = () => false,
  touchMoveThresholdPx = defaultTouchMoveThresholdPx,
  longPressDelayMs = defaultLongPressDelayMs,
  autoScrollEdgePx = defaultAutoScrollEdgePx,
  autoScrollIntervalMs = defaultAutoScrollIntervalMs,
  autoScrollMaxLines = defaultAutoScrollMaxLines,
} = {}) {
  const selectionView = view || createTerminalSelectionView({ documentObject, windowObject });
  const lifecycle = lifecycleFactory({ documentObject, windowObject });
  const fullBufferSelections = new WeakSet();
  const cleanupRegisteredSessions = new WeakSet();
  const installedSessions = new WeakSet();
  const touchCancellations = new WeakMap();
  const observedSessions = new WeakSet();
  let started = false;
  let disposed = false;

  const ensureSessionCleanup = (session) => {
    if (!session || cleanupRegisteredSessions.has(session)) {
      return;
    }
    cleanupRegisteredSessions.add(session);
    registerSessionCleanup(session, () => disposeSession(session));
  };

  const hasSelection = (session = getActiveSession()) => !disposed && Boolean(
    session?.term?.hasSelection?.() || (session && fullBufferSelections.has(session)),
  );

  const currentMobileSelectionSession = () => {
    const session = getActiveSession();
    return session?.term?.hasSelection?.() ? session : null;
  };

  const updateHandles = (session = currentMobileSelectionSession()) => (
    selectionView.updateHandles(session, isTouchSelectionLayout())
  );

  const update = () => {
    if (disposed) {
      return;
    }
    const session = getActiveSession();
    const active = hasSelection(session);
    selectionView.syncMobileMenuSelectionState(active);
    updateHandles();
    if (
      !isTouchSelectionLayout()
      || !active
      || isOverviewOpen()
      || isMobileMenuOpen()
      || !selectionView.positionSheet(session)
    ) {
      selectionView.hideSheet();
    }
    if (isMobileMenuOpen()) {
      refreshMobileMenu();
    }
  };

  const renderSelection = (session) => {
    const term = session?.term;
    if (!isRenderAllowed(session) || !term?.renderer || !term?.wasmTerm) {
      return;
    }
    try {
      term.requestRender?.({ full: true });
    } catch (error) {
    }
  };

  const emitSelectionChange = (session) => {
    const manager = session?.term?.selectionManager;
    if (typeof manager?.selectionChangedEmitter?.fire === "function") {
      manager.selectionChangedEmitter.fire();
      return;
    }
    update();
  };

  const applySelection = (session, start, end) => {
    if (disposed) {
      return false;
    }
    const manager = session?.term?.selectionManager;
    const normalized = normalizeTerminalSelectionCells(start, end);
    if (!manager || !normalized) {
      return false;
    }
    blurInput(session);
    fullBufferSelections.delete(session);
    let nextStart = normalized.start;
    let nextEnd = normalized.end;
    if (compareTerminalSelectionCells(nextStart, nextEnd) === 0) {
      nextEnd = nextTerminalSelectionCell(session?.term?.cols, nextStart);
    }
    manager.markCurrentSelectionDirty?.();
    manager.selectionStart = { col: nextStart.col, absoluteRow: nextStart.absoluteRow };
    manager.selectionEnd = { col: nextEnd.col, absoluteRow: nextEnd.absoluteRow };
    manager.isSelecting = false;
    manager.markCurrentSelectionDirty?.();
    renderSelection(session);
    emitSelectionChange(session);
    return true;
  };

  const installSelectionManagerCopyPatch = (session) => {
    const manager = session?.term?.selectionManager;
    if (!manager || manager.webshellSelectionCopyPatched) {
      return;
    }
    manager.webshellSelectionCopyPatched = true;
    manager.webshellOriginalGetSelection = manager.getSelection;
    const patchedGetSelection = function (...args) {
      try {
        return terminalSelectionText(this);
      } catch (error) {
        return this.webshellOriginalGetSelection?.apply(this, args) || "";
      }
    };
    manager.getSelection = patchedGetSelection;
    lifecycle.addSessionCleanup(session, () => {
      if (manager.getSelection === patchedGetSelection) {
        manager.getSelection = manager.webshellOriginalGetSelection;
      }
      delete manager.webshellOriginalGetSelection;
      delete manager.webshellSelectionCopyPatched;
    });
  };

  const installSelectionManagerStringDoubleClickPatch = (session) => {
    const manager = session?.term?.selectionManager;
    if (!manager || manager.webshellStringDoubleClickPatched) {
      return;
    }
    manager.webshellStringDoubleClickPatched = true;
    manager.webshellOriginalHasSelection = manager.hasSelection;
    manager.webshellOriginalClearSelection = manager.clearSelection;
    const patchedHasSelection = function (...args) {
      if (this.webshellForceSelection && this.selectionStart && this.selectionEnd) {
        return true;
      }
      return this.webshellOriginalHasSelection?.apply(this, args) || false;
    };
    const patchedClearSelection = function (...args) {
      const result = this.webshellOriginalClearSelection?.apply(this, args);
      this.webshellForceSelection = false;
      return result;
    };
    manager.hasSelection = patchedHasSelection;
    manager.clearSelection = patchedClearSelection;

    const canvas = session?.term?.canvas || session?.term?.renderer?.getCanvas?.();
    if (canvas) {
      const isStringCell = (cell) => {
        if (!cell || cell.codepoint === 0) {
          return false;
        }
        return /\S/.test(String.fromCodePoint(cell.codepoint));
      };
      const lineAtAbsoluteRow = (absoluteRow) => {
        const scrollback = manager.wasmTerm?.getScrollbackLength?.() || 0;
        return absoluteRow < scrollback
          ? manager.wasmTerm?.getScrollbackLine?.(absoluteRow)
          : manager.wasmTerm?.getLine?.(absoluteRow - scrollback);
      };
      const stringAtCell = (col, row) => {
        const absoluteRow = manager.viewportRowToAbsolute?.(row);
        if (typeof absoluteRow !== "number") {
          return null;
        }
        const line = lineAtAbsoluteRow(absoluteRow);
        if (!line || !isStringCell(line[col])) {
          return null;
        }
        let startCol = col;
        while (startCol > 0 && isStringCell(line[startCol - 1])) {
          startCol -= 1;
        }
        let endCol = col;
        while (endCol < line.length - 1 && isStringCell(line[endCol + 1])) {
          endCol += 1;
        }
        return { startCol, endCol, absoluteRow };
      };
      const handleDoubleClick = (event) => {
        if (event.button !== 0 || isMobileLayout() || session.closed) {
          return;
        }
        const cell = manager.pixelToCell?.(event.offsetX, event.offsetY);
        const stringRange = cell ? stringAtCell(cell.col, cell.row) : null;
        if (!stringRange) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        fullBufferSelections.delete(session);
        manager.markCurrentSelectionDirty?.();
        manager.selectionStart = { col: stringRange.startCol, absoluteRow: stringRange.absoluteRow };
        manager.selectionEnd = { col: stringRange.endCol, absoluteRow: stringRange.absoluteRow };
        manager.isSelecting = false;
        manager.webshellForceSelection = true;
        manager.markCurrentSelectionDirty?.();
        renderSelection(session);
        emitSelectionChange(session);
        if (isDesktopAutoCopyEnabled()) {
          lifecycle.setSessionTimeout(session, () => copyCurrentSelection(session), 0);
        }
      };
      lifecycle.listenSession(session, canvas, "dblclick", handleDoubleClick, { capture: true });
    }

    lifecycle.addSessionCleanup(session, () => {
      if (manager.hasSelection === patchedHasSelection) {
        manager.hasSelection = manager.webshellOriginalHasSelection;
      }
      if (manager.clearSelection === patchedClearSelection) {
        manager.clearSelection = manager.webshellOriginalClearSelection;
      }
      delete manager.webshellForceSelection;
      delete manager.webshellOriginalHasSelection;
      delete manager.webshellOriginalClearSelection;
      delete manager.webshellStringDoubleClickPatched;
    });
  };

  const prepareManager = (session) => {
    const manager = session?.term?.selectionManager;
    if (!manager || disposed) {
      return;
    }
    ensureSessionCleanup(session);
    installSelectionManagerCopyPatch(session);
    installSelectionManagerStringDoubleClickPatch(session);
    if (manager.webshellAutoCopyDisabled) {
      return;
    }
    manager.webshellAutoCopyDisabled = true;
    manager.webshellOriginalCopyToClipboard = manager.copyToClipboard;
    const patchedCopyToClipboard = async () => {};
    manager.copyToClipboard = patchedCopyToClipboard;
    lifecycle.addSessionCleanup(session, () => {
      if (manager.copyToClipboard === patchedCopyToClipboard) {
        manager.copyToClipboard = manager.webshellOriginalCopyToClipboard;
      }
      delete manager.webshellOriginalCopyToClipboard;
      delete manager.webshellAutoCopyDisabled;
    });
  };

  const stopSelectionEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const primaryTouch = (event) => event.touches?.[0] || event.changedTouches?.[0] || null;

  const suppressTerminalTouchScroll = (session) => {
    const term = session?.term;
    if (typeof term?.finishTouchScroll === "function") {
      term.finishTouchScroll();
    }
    if (term) {
      term.touchScrollMoved = false;
    }
  };

  const autoScrollIntent = (session, clientY) => {
    if (session?.closed || !isTouchSelectionLayout()) {
      return null;
    }
    const term = session?.term;
    const canvas = term?.canvas || term?.element?.querySelector?.("canvas");
    const metrics = term?.renderer?.getMetrics?.();
    const y = Number(clientY);
    if (!term || !canvas || !metrics?.height || !Number.isFinite(y)) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const edge = Math.max(1, Math.min(rect.height / 3, Math.max(autoScrollEdgePx, metrics.height * 1.5)));
    let direction = 0;
    let distance = 0;
    if (y < rect.top + edge) {
      direction = -1;
      distance = rect.top + edge - y;
    } else if (y > rect.bottom - edge) {
      direction = 1;
      distance = y - (rect.bottom - edge);
    }
    if (!direction) {
      return null;
    }
    const lines = Math.max(1, Math.min(autoScrollMaxLines, Math.ceil(distance / Math.max(1, metrics.height))));
    return { direction, lines };
  };

  const stopAutoScroll = (state) => {
    if (!state) {
      return;
    }
    if (state.autoScrollTimer) {
      lifecycle.clearSessionInterval(state.autoScrollSession, state.autoScrollTimer);
      state.autoScrollTimer = 0;
    }
    state.autoScrollSession = null;
    state.autoScrollDirection = 0;
    state.autoScrollApplyPoint = null;
  };

  const terminalViewportLine = (term) => {
    const value = Math.floor(Number(term?.getViewportY?.() ?? term?.viewportY ?? 0));
    return Number.isFinite(value) ? value : 0;
  };

  const updateAutoScroll = (session, state, applyPoint) => {
    if (disposed || !state || typeof applyPoint !== "function") {
      return;
    }
    state.autoScrollSession = session;
    state.autoScrollApplyPoint = applyPoint;
    const intent = autoScrollIntent(session, state.lastY);
    if (!intent) {
      stopAutoScroll(state);
      return;
    }
    state.autoScrollDirection = intent.direction;
    if (state.autoScrollTimer) {
      return;
    }
    state.autoScrollTimer = lifecycle.setSessionInterval(session, () => {
      const nextIntent = autoScrollIntent(session, state.lastY);
      if (!nextIntent || typeof state.autoScrollApplyPoint !== "function") {
        stopAutoScroll(state);
        return;
      }
      const term = session?.term;
      const before = terminalViewportLine(term);
      suppressTerminalTouchScroll(session);
      try {
        term?.scrollLines?.(nextIntent.direction * nextIntent.lines);
      } catch (error) {
      }
      const applied = state.autoScrollApplyPoint({ clientX: state.lastX, clientY: state.lastY });
      updateHandles(session);
      if (applied === false || terminalViewportLine(term) === before) {
        stopAutoScroll(state);
      }
    }, autoScrollIntervalMs);
  };

  const clearIfTapOutside = (session, touch) => {
    if (disposed || !session?.term?.hasSelection?.() || !touch) {
      return false;
    }
    const selection = currentTerminalSelectionCells(session);
    const cell = selectionView.cellFromPoint(session, touch.clientX, touch.clientY);
    if (!selection || !cell || terminalSelectionContainsCell(selection, cell)) {
      return false;
    }
    fullBufferSelections.delete(session);
    session.term.clearSelection?.();
    update();
    return true;
  };

  const updateSelectionFromHandleTouch = (session, role, touch) => {
    const selection = currentTerminalSelectionCells(session);
    const point = selectionView.cellFromPoint(session, touch.clientX, touch.clientY);
    if (!selection || !point) {
      return false;
    }
    if (role === "start") {
      const nextStart = compareTerminalSelectionCells(point, selection.end) >= 0
        ? previousTerminalSelectionCell(session?.term?.cols, selection.end)
        : point;
      return applySelection(session, nextStart, selection.end);
    }
    const nextEnd = compareTerminalSelectionCells(point, selection.start) <= 0
      ? nextTerminalSelectionCell(session?.term?.cols, selection.start)
      : point;
    return applySelection(session, selection.start, nextEnd);
  };

  const registerTouchCancellation = (session, cancel) => {
    let callbacks = touchCancellations.get(session);
    if (!callbacks) {
      callbacks = new Set();
      touchCancellations.set(session, callbacks);
    }
    callbacks.add(cancel);
    lifecycle.addSessionCleanup(session, () => {
      cancel();
      callbacks.delete(cancel);
      if (!callbacks.size) touchCancellations.delete(session);
    });
  };

  const bindSelectionHandle = (session, handle, role) => {
    let dragState = null;
    lifecycle.listenSession(session, handle, "touchstart", (event) => {
      if (!isTouchSelectionLayout() || event.touches.length !== 1) {
        return;
      }
      stopAutoScroll(dragState);
      const touch = event.touches[0];
      dragState = {
        lastX: touch.clientX,
        lastY: touch.clientY,
        autoScrollTimer: 0,
        autoScrollSession: null,
        autoScrollDirection: 0,
        autoScrollApplyPoint: null,
      };
      suppressTerminalTouchScroll(session);
      stopSelectionEvent(event);
    }, { passive: false });
    lifecycle.listenSession(session, handle, "touchmove", (event) => {
      if (!dragState) {
        return;
      }
      const touch = primaryTouch(event);
      if (!touch) {
        return;
      }
      dragState.lastX = touch.clientX;
      dragState.lastY = touch.clientY;
      suppressTerminalTouchScroll(session);
      stopSelectionEvent(event);
      if (updateSelectionFromHandleTouch(session, role, touch)) {
        updateAutoScroll(session, dragState, (point) => updateSelectionFromHandleTouch(session, role, point));
      }
    }, { passive: false });
    const finish = (event) => {
      if (!dragState) {
        return;
      }
      stopAutoScroll(dragState);
      dragState = null;
      suppressTerminalTouchScroll(session);
      stopSelectionEvent(event);
      updateHandles(session);
    };
    lifecycle.listenSession(session, handle, "touchend", finish, { passive: false });
    lifecycle.listenSession(session, handle, "touchcancel", finish, { passive: false });
    registerTouchCancellation(session, () => {
      stopAutoScroll(dragState);
      dragState = null;
    });
  };

  const installSession = (session) => {
    if (disposed || !session?.shellEl || !session?.term || installedSessions.has(session)) {
      return;
    }
    installedSessions.add(session);
    ensureSessionCleanup(session);
    const overlay = selectionView.createSessionOverlay(session);
    if (!overlay) {
      return;
    }
    bindSelectionHandle(session, overlay.startHandle, "start");
    bindSelectionHandle(session, overlay.endHandle, "end");

    let touchState = null;
    const clearTouchSelectionTimer = (state = touchState) => {
      if (state?.longPressTimer) {
        lifecycle.clearSessionTimeout(session, state.longPressTimer);
        state.longPressTimer = 0;
      }
    };
    const resetTouchSelectionState = (state = touchState) => {
      clearTouchSelectionTimer(state);
      stopAutoScroll(state);
      if (!state || touchState === state) {
        touchState = null;
      }
    };
    const updateTouchSelectionFromPoint = (state, point) => {
      if (!state || !point) {
        return false;
      }
      const current = selectionView.cellFromPoint(session, point.clientX, point.clientY);
      if (!current) {
        return false;
      }
      activateSession(session);
      fullBufferSelections.delete(session);
      return applySelection(session, state.startCell, current);
    };
    const beginTouchSelection = (state, touch = null) => {
      if (!state || touchState !== state || state.selecting || !isTouchSelectionLayout() || session.closed) {
        return false;
      }
      const current = touch
        ? selectionView.cellFromPoint(session, touch.clientX, touch.clientY)
        : selectionView.cellFromPoint(session, state.lastX, state.lastY);
      if (!current) {
        resetTouchSelectionState(state);
        return false;
      }
      clearTouchSelectionTimer(state);
      state.selecting = true;
      blurInput(session);
      suppressTerminalTouchScroll(session);
      activateSession(session);
      fullBufferSelections.delete(session);
      return applySelection(session, state.startCell, current);
    };
    lifecycle.listenSession(session, session.shellEl, "touchstart", (event) => {
      resetTouchSelectionState();
      if (
        !isTouchSelectionLayout()
        || event.touches.length !== 1
        || hasMouseTracking(session)
        || isMobileMenuOpen()
      ) {
        return;
      }
      const ElementConstructor = windowObject?.Element || globalThis.Element;
      const target = event.target;
      if (
        (ElementConstructor && !(target instanceof ElementConstructor))
        || target?.closest?.(".mobile-selection-handle")
        || !target?.closest?.(".terminal-host")
      ) {
        return;
      }
      const touch = event.touches[0];
      markContextMenuCandidate(touch);
      const startCell = selectionView.cellFromPoint(session, touch.clientX, touch.clientY);
      if (!startCell) {
        return;
      }
      touchState = {
        startCell,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        selecting: false,
        longPressTimer: 0,
        autoScrollTimer: 0,
        autoScrollSession: null,
        autoScrollDirection: 0,
        autoScrollApplyPoint: null,
      };
      const state = touchState;
      state.longPressTimer = lifecycle.setSessionTimeout(session, () => {
        state.longPressTimer = 0;
        beginTouchSelection(state);
      }, longPressDelayMs);
    }, { capture: true, passive: true });
    lifecycle.listenSession(session, session.shellEl, "touchmove", (event) => {
      const state = touchState;
      if (!state) {
        return;
      }
      if (event.touches.length !== 1) {
        resetTouchSelectionState(state);
        return;
      }
      const touch = event.touches[0];
      state.lastX = touch.clientX;
      state.lastY = touch.clientY;
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      if (!state.selecting) {
        if (Math.hypot(dx, dy) >= touchMoveThresholdPx) {
          resetTouchSelectionState(state);
        }
        return;
      }
      suppressTerminalTouchScroll(session);
      stopSelectionEvent(event);
      if (updateTouchSelectionFromPoint(state, touch)) {
        updateAutoScroll(session, state, (point) => updateTouchSelectionFromPoint(state, point));
      }
    }, { capture: true, passive: false });
    const finishTouchSelection = (event) => {
      const state = touchState;
      if (!state) {
        return;
      }
      if (isKeyboardClaimed(event)) {
        resetTouchSelectionState(state);
        return;
      }
      const wasSelecting = state.selecting;
      const endTouch = primaryTouch(event);
      const shouldClearSelection = !wasSelecting && clearIfTapOutside(session, endTouch);
      resetTouchSelectionState(state);
      if (!wasSelecting) {
        if (shouldClearSelection) {
          stopSelectionEvent(event);
        }
        return;
      }
      suppressTerminalTouchScroll(session);
      stopSelectionEvent(event);
      updateHandles(session);
    };
    lifecycle.listenSession(session, session.shellEl, "touchend", finishTouchSelection, { capture: true, passive: false });
    lifecycle.listenSession(session, session.shellEl, "touchcancel", finishTouchSelection, { capture: true, passive: false });
    registerTouchCancellation(session, () => resetTouchSelectionState());

    const scrollDisposable = session.term.onScroll?.(() => update());
    if (scrollDisposable && typeof scrollDisposable.dispose === "function") {
      lifecycle.addSessionCleanup(session, () => scrollDisposable.dispose());
    }
  };

  function disposeSession(session) {
    if (!session) {
      return;
    }
    lifecycle.disposeSession(session);
    selectionView.removeSession(session);
    fullBufferSelections.delete(session);
    installedSessions.delete(session);
    observedSessions.delete(session);
    update();
  }

  const reportActionError = (error) => showToast(error?.message || String(error || "操作失败。"));

  const clearSelection = (session = getActiveSession(), { updateUI = true } = {}) => {
    if (disposed || !session) {
      return false;
    }
    fullBufferSelections.delete(session);
    session.term?.clearSelection?.();
    if (updateUI) {
      update();
    }
    return true;
  };

  return Object.freeze({
    apply: applySelection,

    cellFromPoint(session, clientX, clientY) {
      return disposed ? null : selectionView.cellFromPoint(session, clientX, clientY);
    },

    clear: clearSelection,

    clearFullBufferSelection(session) {
      if (disposed || !session) {
        return false;
      }
      const active = fullBufferSelections.has(session);
      fullBufferSelections.delete(session);
      return active;
    },

    clearIfTapOutside,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      lifecycle.dispose();
      selectionView.dispose();
    },
    disposeSession,

    getSelectedText(session = getActiveSession()) {
      if (disposed || !session?.term) {
        return "";
      }
      return fullBufferSelections.has(session)
        ? getFullBufferText(session.term)
        : session.term.getSelection?.() || "";
    },

    hasSelection,

    hide() {
      selectionView.hideSheet();
    },

    installSession,

    cancelTouchInteraction(session) {
      touchCancellations.get(session)?.forEach(cancel => cancel());
    },

    isFullBufferSelection(session) {
      return !disposed && Boolean(session && fullBufferSelections.has(session));
    },

    isSheetOpen() {
      return selectionView.isSheetOpen();
    },

    observeSession(session) {
      if (disposed || !session?.term || observedSessions.has(session)) {
        return;
      }
      observedSessions.add(session);
      ensureSessionCleanup(session);
      const disposable = session.term.onSelectionChange?.(() => {
        if (!session.term?.hasSelection?.()) {
          fullBufferSelections.delete(session);
        }
        update();
      });
      if (disposable && typeof disposable.dispose === "function") {
        lifecycle.addSessionCleanup(session, () => disposable.dispose());
      }
    },

    prepareManager,

    selectAll(session = getActiveSession()) {
      if (disposed || !session?.term) {
        return false;
      }
      fullBufferSelections.add(session);
      session.term.selectLines?.(0, Math.max(0, session.term.rows - 1));
      update();
      showToast("已选中完整终端缓冲区。");
      return true;
    },

    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start();
      const sheet = selectionView.getSelectionSheet();
      lifecycle.listenGlobal(sheet, "click", (event) => {
        const button = event.target?.closest?.("[data-selection-action]");
        if (!button) {
          return;
        }
        const action = button.dataset.selectionAction;
        if (action === "copy") {
          Promise.resolve(copySession()).catch(reportActionError);
        } else if (action === "paste") {
          Promise.resolve(pasteSession()).catch(reportActionError);
        } else if (action === "search") {
          openSearchFromSelection();
        } else if (action === "clear") {
          clearSelection();
        }
      });
    },

    stopAutoScroll,

    suppressTouchScroll(session) {
      suppressTerminalTouchScroll(session);
    },

    syncRuntimeReferences(session) {
      const term = session?.term;
      if (term?.selectionManager && term.wasmTerm) {
        term.selectionManager.wasmTerm = term.wasmTerm;
      }
    },

    update,
    updateAutoScroll,
    updateHandles,
  });
}
