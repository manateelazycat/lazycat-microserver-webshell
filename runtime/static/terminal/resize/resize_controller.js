import {
  failedTerminalFit,
  nextTerminalResizeEpoch,
  normalizeTerminalResizeEpoch,
  terminalCanvasMatchesExpectedSize,
  terminalCanvasSize,
  terminalDimensionsEqual,
  terminalPaneIsMeasurable,
  terminalResizeTargetsMatch,
  terminalSize,
} from "./geometry_state.js";
import { createTerminalResizeLifecycle } from "./resize_lifecycle.js";
import { TerminalResizeController } from "./terminal_resize_controller.js";
import { shouldSendTerminalSize, terminalSizeDiffersFromServer } from "./terminal_size_sync.js";
import { createTerminalViewportController } from "./viewport_controller.js";
import { createAsyncGeometry } from "./async_geometry.js";

const noop = () => {};

export function createTerminalResizeController({
  windowObject = globalThis.window,
  workScheduler = null,
  onResizeError = noop,
  ResizeObserverCtor = globalThis.ResizeObserver,
  getActiveName = () => "",
  getActiveTabId = () => "",
  getCurrentTab = () => null,
  getPresentation = () => null,
  getPixelSize = () => null,
  captureViewport = () => null,
  isHostElement = (value) => Boolean(value && typeof value.getBoundingClientRect === "function"),
  isCanvasElement = (value) => Boolean(value && typeof value.getContext === "function"),
  isSocketOpen = () => false,
  sendControl = (session, payload) => {
    const socket = session?.socket;
    if (!socket || typeof socket.send !== "function") {
      return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
  },
  isReplayCommitted = () => false,
  isMobileKeyboardResizeSuppressed = () => false,
  measureTask = (_name, task) => task(),
  now = () => globalThis.performance?.now?.() || Date.now(),
  epochNow = () => Date.now(),
  random = () => Math.random(),
  recordEvent = noop,
  beginRenderSuppression = noop,
  endRenderSuppression = noop,
  flushOutput = noop,
  scheduleOutputFlush = noop,
  getOutputQueueEntryCount = () => 0,
  getOutputAppliedEntryCount = () => null,
  getOutputQueuedBytes = () => 0,
  resetHostViewport = noop,
  positionInput = noop,
  syncViewportPan = noop,
  updateSelectionHandles = noop,
  resetAfterInitialFit = noop,
  syncTabMobilePixelScroll = noop,
  connectPendingSession = noop,
  registerSessionCleanup = noop,
  consoleObject = globalThis.console,
  outputFlushFallbackMs = 32,
  outputFlushBudgetBytes = 64 * 1024,
  throttleMs = 80,
  settleMs = 120,
  outputQuietMs = 120,
  outputMaxHoldMs = 800,
  sizeReassertIntervalMs = 250,
  sizeClaimIntervalMs = 250,
  lifecycleFactory = createTerminalResizeLifecycle,
  viewportFactory = createTerminalViewportController,
} = {}) {
  let disposed = false;
  const ownedSessions = new Set();
  const failedSessions = new WeakSet();
  const failResize = (session, error) => {
    failedSessions.add(session);
    workScheduler?.cancel(session, "live-geometry");
    beginRenderSuppression(session, "resize");
    onResizeError(session, error);
  };
  const interactiveResizeSessions = new Set();
  const metricsLiveGeometrySessions = new Set();
  const liveGeometrySessions = new Set();
  const windowLiveResizeTimers = new Map();
  const liveGeometryResizeTimers = new Map();
  const liveGeometryLastResizeAt = new WeakMap();
  const pendingNativeOptions = new Map();
  const observedResizeQueues = new WeakMap();
  const fenceDrainEnds = new WeakMap();
  const settleDrainEnds = new WeakMap();
  const outputBoundary = (session) => {
    const applied = getOutputAppliedEntryCount(session);
    return Number.isFinite(applied) ? applied + getOutputQueueEntryCount(session) : null;
  };
  const remainingToBoundary = (session, end, fallback) => (
    Number.isFinite(end) ? Math.max(0, end - getOutputAppliedEntryCount(session)) : fallback
  );
  const settleDrains = new WeakMap();
  const nativeGeometry = createAsyncGeometry({
    recordEvent,
    onError: failResize,
    onSettled: (session) => {
      if (disposed || session.closed || failedSessions.has(session)) return;
      if (session.resizeFenceAckReceived) {
        applyFence(session);
      } else if (session.exitExpected) {
        finishExited(session);
      } else if (liveGeometrySessions.has(session)) {
        if (!isVisible(session) && !hasActiveLiveGeometrySource(session)) finishLiveGeometry(session, "interactive_resize_hidden");
        else resizePaneLiveGeometry(session, { force: true });
      } else if (session.pendingSizeClaim && !session.replayGeometryLocked) {
        schedulePendingSizeClaim(session);
      } else if (pendingNativeOptions.has(session)) {
        const options = pendingNativeOptions.get(session);
        pendingNativeOptions.delete(session);
        schedulePane(session, options, { immediate: true });
      } else if (session.pendingConnect || session.connectionRetrying) {
        connectPendingSession(session);
      }
    },
  });
  const hasActiveLiveGeometrySource = (session) => (
    interactiveResizeSessions.has(session) || metricsLiveGeometrySessions.has(session)
  );
  const presentation = () => getPresentation?.();
  const trace = (session, phase, details = {}) => {
    const sink = windowObject?.__testsAutoResizeTrace;
    if (!Array.isArray(sink)) {
      return;
    }
    sink.push({
      at: Number(now()) || 0,
      phase,
      pane: String(session?.id || ""),
      ...details,
    });
    if (sink.length > 4000) {
      sink.splice(0, sink.length - 4000);
    }
  };
  const size = (session) => terminalSize(session, getPixelSize);
  const dimensionsEqual = (session, dimensions) => terminalDimensionsEqual(session, dimensions, getPixelSize);
  const isMeasurable = (session) => terminalPaneIsMeasurable(session, isHostElement);
  const isVisible = (session) => session?.tabId === getActiveTabId() && isMeasurable(session);
  const canvasMatchesExpectedSize = (session, dimensions = size(session)) => (
    terminalCanvasMatchesExpectedSize(session, dimensions, { getPixelSize, isCanvasElement })
  );
  const visualDetails = (session, target = null) => {
    const hostRect = session?.terminalHost?.getBoundingClientRect?.();
    const describeCanvas = (canvas) => {
      if (!canvas || !isCanvasElement(canvas)) {
        return { width: 0, height: 0, cssWidth: 0, cssHeight: 0, styleWidth: "", styleHeight: "", hidden: null };
      }
      const rect = canvas?.getBoundingClientRect?.();
      const computed = windowObject?.getComputedStyle?.(canvas);
      return {
        width: Number(canvas.width || 0),
        height: Number(canvas.height || 0),
        cssWidth: Number(rect?.width || 0),
        cssHeight: Number(rect?.height || 0),
        styleWidth: String(canvas.style?.width || ""),
        styleHeight: String(canvas.style?.height || ""),
        hidden: canvas.hidden === true,
        display: String(computed?.display || ""),
        visibility: String(computed?.visibility || ""),
        opacity: String(computed?.opacity || ""),
        transform: String(computed?.transform || ""),
      };
    };
    const live = session?.term?.canvas || session?.term?.renderer?.getCanvas?.();
    const local = size(session);
    return {
      viewport: {
        innerWidth: Number(windowObject?.innerWidth || 0),
        innerHeight: Number(windowObject?.innerHeight || 0),
        devicePixelRatio: Number(windowObject?.devicePixelRatio || 1),
        visualWidth: Number(windowObject?.visualViewport?.width || 0),
        visualHeight: Number(windowObject?.visualViewport?.height || 0),
        visualScale: Number(windowObject?.visualViewport?.scale || 0),
      },
      host: {
        cssWidth: Number(hostRect?.width || 0),
        cssHeight: Number(hostRect?.height || 0),
      },
      localSize: local,
      terminalSize: {
        cols: Number(session?.term?.cols || 0),
        rows: Number(session?.term?.rows || 0),
      },
      serverSize: {
        cols: Number(session?.serverCols || 0),
        rows: Number(session?.serverRows || 0),
        pixelWidth: Number(session?.serverPixelWidth || 0),
        pixelHeight: Number(session?.serverPixelHeight || 0),
      },
      requestedSize: {
        cols: Number(session?.requestedCols || 0),
        rows: Number(session?.requestedRows || 0),
        pixelWidth: Number(session?.requestedPixelWidth || 0),
        pixelHeight: Number(session?.requestedPixelHeight || 0),
      },
      targetSize: target ? {
        cols: Number(target.cols || 0),
        rows: Number(target.rows || 0),
        pixelWidth: Number(target.pixelWidth || 0),
        pixelHeight: Number(target.pixelHeight || 0),
      } : null,
      resizeEpochs: {
        requested: String(session?.requestedResizeEpoch || ""),
        applied: String(session?.appliedResizeEpoch || ""),
        presented: String(session?.presentedResizeEpoch || ""),
      },
      flags: {
        sizeClaimRequired: session?.sizeClaimRequired === true,
        sizeClaimed: session?.sizeClaimed === true,
        resizeAckPending: session?.resizeAckPending === true,
        resizeFenceActive: session?.resizeFenceActive === true,
        resizePresentationHold: session?.resizePresentationHold === true,
        terminalFrameHeld: session?.terminalFrameHeld === true,
        renderReady: session?.renderReady === true,
      },
      liveCanvas: describeCanvas(live),
      holdCanvas: describeCanvas(session?.terminalFrameHold),
    };
  };
  const viewport = viewportFactory({
    captureViewport,
    cancelFrame: (frame) => windowObject.cancelAnimationFrame(frame),
  });

  const clearFence = (session, reason = "cleanup") => {
    if (!session) {
      return null;
    }
    const wasBlocked = session.resizeFenceAckReceived === true;
    fenceDrainEnds.delete(session);
    if (reason !== "native_committed") observedResizeQueues.delete(session);
    if (session.resizeFenceDrainTimer) {
      windowObject.clearTimeout(session.resizeFenceDrainTimer);
    }
    session.resizeFenceDrainTimer = 0;
    session.resizeFenceApplying = false;
    session.resizeFenceDrainRemainingEntries = null;
    const target = session.resizeFenceTarget;
    session.resizeFenceActive = false;
    session.resizeFenceAckReceived = false;
    const cancelledScheduledTask = workScheduler?.cancel(session, "resize-fence") === true;
    session.resizeFenceTarget = null;
    if (target) recordEvent(session, "resize_fence_cleared", {
      reason, cancelledScheduledTask, resizeFenceAckReceived: wasBlocked,
      nativePending: nativeGeometry.isPending(session),
      targetSize: { cols: target.cols, rows: target.rows },
      terminalSize: { cols: session.term?.cols, rows: session.term?.rows },
      requestedResizeEpoch: session.requestedResizeEpoch,
      appliedResizeEpoch: session.appliedResizeEpoch,
    });
    if (wasBlocked && !disposed && !session.closed && getOutputQueuedBytes(session) > 0) scheduleOutputFlush(session);
    return target;
  };

  const clearOutputSettle = (session) => {
    if (!session) {
      return;
    }
    settleDrains.delete(session);
    settleDrainEnds.delete(session);
    const wasBlocked = session.resizeOutputSettleDrainRemainingEntries != null;
    if (session.resizeOutputSettleTimer) {
      windowObject.clearTimeout(session.resizeOutputSettleTimer);
    }
    session.resizeOutputSettleTimer = 0;
    session.resizeOutputSettleDrainPending = false;
    session.resizeOutputSettleDrainRemainingEntries = null;
    session.resizeOutputSettleActive = false;
    session.resizeOutputSettleStartedAt = 0;
    session.resizeOutputSettleDeadline = 0;
    session.resizeOutputSettleToken = Number(session.resizeOutputSettleToken || 0) + 1;
    endRenderSuppression(session, { render: false, reason: "resize" });
    if (wasBlocked && !disposed && !session.closed && getOutputQueuedBytes(session) > 0) scheduleOutputFlush(session);
  };

  const finishOutputSettle = async (session, reason = "quiet") => {
    if (disposed || !session || session.closed || !session.resizeOutputSettleActive) {
      return false;
    }
    if (settleDrains.has(session)) return false;
    const drainToken = {};
    settleDrains.set(session, drainToken);
    try {
    if (
      session.resizeOutputSettleDrainRemainingEntries === null
      || session.resizeOutputSettleDrainRemainingEntries === undefined
    ) {
      session.resizeOutputSettleDrainRemainingEntries = getOutputQueueEntryCount(session);
      settleDrainEnds.set(session, outputBoundary(session));
    }
    session.resizeOutputSettleDrainRemainingEntries = remainingToBoundary(session,
      settleDrainEnds.get(session), session.resizeOutputSettleDrainRemainingEntries);
    const drainEntriesBefore = getOutputQueueEntryCount(session);
    if (session.resizeOutputSettleDrainRemainingEntries > 0) {
      await flushOutput(session, {
        force: true,
        maxBytes: outputFlushBudgetBytes,
        maxEntries: session.resizeOutputSettleDrainRemainingEntries,
        scheduleRemainder: false,
      });
      if (disposed || session.closed || !session.resizeOutputSettleActive || settleDrains.get(session) !== drainToken) return false;
      const drainEntriesAfter = getOutputQueueEntryCount(session);
      const drainedEntries = Math.max(0, drainEntriesBefore - drainEntriesAfter);
      session.resizeOutputSettleDrainRemainingEntries = remainingToBoundary(session,
        settleDrainEnds.get(session), Math.max(0, session.resizeOutputSettleDrainRemainingEntries - drainedEntries));
    }
    if (session.resizeOutputSettleDrainRemainingEntries > 0) {
      if (!session.resizeOutputSettleDrainPending) {
        session.resizeOutputSettleDrainPending = true;
        session.resizeOutputSettleTimer = windowObject.setTimeout(() => {
          session.resizeOutputSettleTimer = 0;
          session.resizeOutputSettleDrainPending = false;
          finishOutputSettle(session, "drain");
        }, outputFlushFallbackMs);
      }
      return false;
    }
    clearOutputSettle(session);
    endRenderSuppression(session, { render: false, reason: "resize" });
    if (session.resizeController?.phase === "settling") {
      session.resizeController.finishSettle(session.resizeControllerSettleToken);
    }
    recordEvent(session, "resize_output_settle_complete", { reason });
    if (getOutputQueuedBytes(session) > 0) {
      scheduleOutputFlush(session);
    }
    if (session.closed || session.name !== getActiveName()) {
      return false;
    }
    return presentation()?.ensure(session, {
      reason: `resize_output_${reason}`,
      forceHistory: true,
    }) === true;
    } catch (error) {
      if (!disposed && !session.closed && settleDrains.get(session) === drainToken) failResize(session, error);
      return false;
    } finally {
      if (settleDrains.get(session) === drainToken) settleDrains.delete(session);
    }
  };

  const scheduleOutputSettle = (session, { reason = "resize_ack" } = {}) => {
    if (disposed || !session || session.closed || !isReplayCommitted(session)) {
      return false;
    }
    const currentTime = now();
    if (!session.resizeOutputSettleActive) {
      session.resizeOutputSettleActive = true;
      session.resizeOutputSettleStartedAt = currentTime;
      session.resizeOutputSettleDeadline = currentTime + outputMaxHoldMs;
      if (session.resizeController?.phase === "applied") {
        session.resizeControllerSettleToken = session.resizeController.beginSettle();
      }
      recordEvent(session, "resize_output_settle_start", { reason });
    }
    if (session.resizeOutputSettleTimer) {
      windowObject.clearTimeout(session.resizeOutputSettleTimer);
    }
    const token = Number(session.resizeOutputSettleToken || 0) + 1;
    session.resizeOutputSettleToken = token;
    const remaining = Math.max(0, session.resizeOutputSettleDeadline - currentTime);
    const delay = Math.min(outputQuietMs, remaining);
    session.resizeOutputSettleTimer = windowObject.setTimeout(() => {
      session.resizeOutputSettleTimer = 0;
      if (
        disposed
        || session.closed
        || !session.resizeOutputSettleActive
        || Number(session.resizeOutputSettleToken || 0) !== token
      ) {
        return;
      }
      const deadlineReached = now() >= session.resizeOutputSettleDeadline;
      finishOutputSettle(session, deadlineReached ? "max_hold" : "quiet");
    }, delay);
    return true;
  };

  const applyFence = async (session) => {
    if (
      disposed
      || !session
      || session.closed
      || !session.resizeFenceActive
      || !session.resizeFenceTarget
      || session.resizeFenceApplying
      || failedSessions.has(session)
    ) {
      return false;
    }
    session.resizeFenceAckReceived = true;
    if (nativeGeometry.isPending(session)) {
      if (!session.resizeFenceDrainTimer) session.resizeFenceDrainTimer = windowObject.setTimeout(() => {
        session.resizeFenceDrainTimer = 0;
        applyFence(session);
      }, outputFlushFallbackMs);
      return false;
    }
    if (workScheduler && (!workScheduler.isRunning() || workScheduler.remainingMs() <= 0)) {
      recordEvent(session, "resize_fence_queued", {
        reason: "scheduler", targetSize: { cols: session.resizeFenceTarget.cols, rows: session.resizeFenceTarget.rows },
        nativePending: nativeGeometry.isPending(session),
      });
      workScheduler.schedule(session, "resize-fence", () => applyFence(session), { priority: () => isVisible(session) ? 3 : 1 });
      return false;
    }
    session.resizeFenceApplying = true;
    const target = session.resizeFenceTarget;
    const connectionEpoch = session.connectionEpoch;
    if (session.resizeFenceDrainRemainingEntries === null || session.resizeFenceDrainRemainingEntries === undefined) {
      session.resizeFenceDrainRemainingEntries = getOutputQueueEntryCount(session);
      fenceDrainEnds.set(session, outputBoundary(session));
    }
    session.resizeFenceDrainRemainingEntries = remainingToBoundary(session,
      fenceDrainEnds.get(session), session.resizeFenceDrainRemainingEntries);
    const drainEntriesBefore = getOutputQueueEntryCount(session);
    if (session.resizeFenceDrainRemainingEntries > 0) {
      await flushOutput(session, {
        force: true,
        maxBytes: outputFlushBudgetBytes,
        maxEntries: session.resizeFenceDrainRemainingEntries,
        scheduleRemainder: false,
      });
      if (disposed || session.closed || session.resizeFenceTarget !== target || session.connectionEpoch !== connectionEpoch) return false;
      const drainEntriesAfter = getOutputQueueEntryCount(session);
      const drainedEntries = Math.max(0, drainEntriesBefore - drainEntriesAfter);
      for (const boundary of observedResizeQueues.get(session) || []) {
        boundary.remainingEntries = remainingToBoundary(session, boundary.endEntries,
          Math.max(0, boundary.remainingEntries - drainedEntries));
      }
      session.resizeFenceDrainRemainingEntries = remainingToBoundary(session,
        fenceDrainEnds.get(session), Math.max(0, session.resizeFenceDrainRemainingEntries - drainedEntries));
    }
    if (session.resizeFenceDrainRemainingEntries > 0) {
      session.resizeFenceApplying = false;
      recordEvent(session, "resize_fence_wait", {
        cols: target.cols,
        rows: target.rows,
        reason: "output_drain",
      });
      if (!session.resizeFenceDrainTimer) {
        session.resizeFenceDrainTimer = windowObject.setTimeout(() => {
          session.resizeFenceDrainTimer = 0;
          applyFence(session);
        }, outputFlushFallbackMs);
      }
      return false;
    }
    beginRenderSuppression(session, "resize");
    return nativeGeometry.apply(session, target, () => {
      if (disposed || session.closed || session.resizeFenceTarget !== target || session.connectionEpoch !== connectionEpoch) return false;
      viewport.restore(session.term, target.viewport);
      recordEvent(session, "term_resize", {
        cols: target.cols,
        rows: target.rows,
        deferredUntilAck: true,
      });
    clearFence(session, "native_committed");
    session.resizeFenceApplying = false;
    session.activationFitPending = false;
    session.measuredFitGeneration = Number(session.measuredFitGeneration || 0) + 1;
    const boundaries = observedResizeQueues.get(session);
    const nextBoundary = boundaries?.shift();
    if (!boundaries?.length) observedResizeQueues.delete(session);
    if (nextBoundary) {
      // Keep output suppressed across consecutive authority boundaries. Each
      // frozen prefix belongs to the grid immediately preceding that boundary.
      session.resizeFenceActive = true;
      session.resizeFenceAckReceived = true;
      session.resizeFenceTarget = nextBoundary.target;
      fenceDrainEnds.set(session, nextBoundary.endEntries);
      session.resizeFenceDrainRemainingEntries = remainingToBoundary(session, nextBoundary.endEntries, nextBoundary.remainingEntries);
      applyFence(session);
      return true;
    }
    if (!session.resizeAckPending) {
      session.sizeClaimRequired = !dimensionsEqual(session, { cols: session.serverCols, rows: session.serverRows });
      if (target.claim && !session.sizeClaimRequired) session.sizeClaimed = true;
    }
    resetHostViewport(session, { clean: true });
    positionInput(session);
    syncViewportPan(session);
    updateSelectionHandles(session);
    if (isReplayCommitted(session)) {
      presentation()?.setReady(session, false, { reason: "resize_fence_apply" });
    }
    if (!scheduleOutputSettle(session)) {
      endRenderSuppression(session, { render: false, reason: "resize" });
      presentation()?.ensure(session, {
        reason: "resize_fence_applied",
        forceHistory: true,
      });
    }
    if (getOutputQueuedBytes(session) > 0) {
      scheduleOutputFlush(session);
    }
    if (session.pendingResizeTarget && !session.resizeAckPending && isVisible(session)) {
      const pending = session.pendingResizeTarget;
      session.pendingResizeTarget = null;
      schedulePane(session, { forceSizeSync: true, claimSize: pending.claim === true }, { immediate: true });
    }
    if (session.pendingSizeClaim) schedulePendingSizeClaim(session);
    return true;
    });
  };

  const applyObservedResize = (session, message) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const cols = Math.max(1, Math.floor(Number(message?.cols) || 0));
    const rows = Math.max(1, Math.floor(Number(message?.rows) || 0));
    if (cols <= 0 || rows <= 0) {
      return false;
    }
    if (session.resizeFenceActive && session.resizeFenceAckReceived) {
      const boundaries = observedResizeQueues.get(session) || [];
      const previous = boundaries.at(-1)?.target || session.resizeFenceTarget;
      if (previous?.cols === cols && previous?.rows === rows) return true;
      if (boundaries.length >= 64) {
        failResize(session, new Error("Terminal resize boundary queue exceeded capacity"));
        return false;
      }
      boundaries.push({
        target: {
          cols, rows,
          pixelWidth: Math.max(0, Math.floor(Number(message?.pixel_width) || 0)),
          pixelHeight: Math.max(0, Math.floor(Number(message?.pixel_height) || 0)),
          viewport: viewport.capture(session.term),
        },
        remainingEntries: getOutputQueueEntryCount(session),
        endEntries: outputBoundary(session),
      });
      observedResizeQueues.set(session, boundaries);
      recordEvent(session, "resize_observed_queued", { cols, rows, queuedResizes: boundaries.length });
      return true;
    }
    if (session.hasPresentedFrame && !session.resizePresentationHold) {
      if (!presentation()?.beginHold(session)) {
        recordEvent(session, "resize_observed_deferred", { reason: "presentation_hold_unavailable" });
        return false;
      }
    }
    clearOutputSettle(session);
    clearFence(session);
    session.resizeFenceActive = true;
    session.resizeFenceTarget = {
      cols,
      rows,
      pixelWidth: Math.max(0, Math.floor(Number(message?.pixel_width) || 0)),
      pixelHeight: Math.max(0, Math.floor(Number(message?.pixel_height) || 0)),
      viewport: viewport.capture(session.term),
    };
    // Freeze at receipt, before deferring to the worker/scheduler. Later replay
    // bytes belong to this new geometry, not the pre-resize drain.
    session.resizeFenceDrainRemainingEntries = getOutputQueueEntryCount(session);
    fenceDrainEnds.set(session, outputBoundary(session));
    return applyFence(session);
  };

  const clearPendingSizeClaim = (session) => {
    if (!session) {
      return null;
    }
    const options = session.pendingSizeClaimOptions || null;
    session.pendingSizeClaim = false;
    session.pendingSizeClaimOptions = null;
    return options;
  };

  const queuePendingSizeClaim = (session, options = {}) => {
    if (!session || session.closed) {
      return false;
    }
    const current = session.pendingSizeClaimOptions || {};
    session.pendingSizeClaim = true;
    session.pendingSizeClaimOptions = {
      forceFullRender: current.forceFullRender === true || options.forceFullRender === true,
      hideUntilRender: current.hideUntilRender === true || options.hideUntilRender === true,
    };
    session.sizeClaimRequired = true;
    return true;
  };

  const schedulePendingSizeClaim = (session) => {
    if (!session?.pendingSizeClaim) {
      return false;
    }
    return lifecycle.scheduleSessionFrame(session, "pending-size-claim", () => {
      if (session.resizeAckPending || session.resizeFenceAckReceived || nativeGeometry.isPending(session)
        || (session.replayGeometryLocked && !isReplayCommitted(session))) {
        return;
      }
      if (!isVisible(session)) {
        clearPendingSizeClaim(session);
        presentation()?.cancelHold(session, { restoreReady: session.hasPresentedFrame === true });
        return;
      }
      const options = clearPendingSizeClaim(session) || {};
      claimForCurrentDevice(session, options);
    });
  };

  let lifecycle;

  const beginConnection = (session, { connectionEpoch = session?.connectionEpoch } = {}) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const nextConnectionEpoch = Math.max(0, Math.floor(Number(connectionEpoch) || 0));
    if (nextConnectionEpoch <= 0 || Number(session.resizeConnectionEpoch || 0) === nextConnectionEpoch) {
      return false;
    }
    const requestTarget = session.resizeAckPending && Number(session.requestedCols || 0) > 0
      ? {
        cols: session.requestedCols,
        rows: session.requestedRows,
        pixelWidth: session.requestedPixelWidth,
        pixelHeight: session.requestedPixelHeight,
        claim: session.requestedResizeClaim === true,
      }
      : null;
    const preserveVisibleIntent = isVisible(session);
    const hadClaimIntent = session.pendingSizeClaim === true
      || session.requestedResizeClaim === true
      || session.pendingResizeTarget?.claim === true;
    const wasSizeClaimed = session.sizeClaimed === true;
    const latestTarget = preserveVisibleIntent
      ? (session.pendingResizeTarget || requestTarget)
      : null;
    const pendingClaim = preserveVisibleIntent && (
      hadClaimIntent
      || latestTarget?.claim === true
      || wasSizeClaimed
    );
    const pendingClaimOptions = session.pendingSizeClaimOptions || {};
    const previousConnectionEpoch = Number(session.resizeConnectionEpoch || 0);
    const retiredResizeEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);

    lifecycle.cancel(session);
    nativeGeometry.cancel(session);
    pendingNativeOptions.delete(session);
    session.replayGeometryPending = false;
    session.replayGeometryLocked = false;
    failedSessions.delete(session);
    workScheduler?.cancel(session, "live-geometry");
    interactiveResizeSessions.delete(session);
    metricsLiveGeometrySessions.delete(session);
    liveGeometrySessions.delete(session);
    const liveTimer = liveGeometryResizeTimers.get(session);
    if (liveTimer) windowObject.clearTimeout(liveTimer);
    liveGeometryResizeTimers.delete(session);
    clearOutputSettle(session);
    clearFence(session);
    session.resizeAckPending = false;
    session.requestedResizeClaim = false;
    session.sizeClaimed = false;
    session.resizeControllerSettleToken = 0;
    session.resizeController = new TerminalResizeController();
    session.resizeConnectionEpoch = nextConnectionEpoch;
    session.resizeConnectionTransitionPending = true;
    if (pendingClaim) {
      session.pendingResizeTarget = null;
      queuePendingSizeClaim(session, pendingClaimOptions);
    } else {
      clearPendingSizeClaim(session);
      session.sizeClaimRequired = session.sizeClaimRequired === true || hadClaimIntent || wasSizeClaimed;
      session.pendingResizeTarget = latestTarget ? { ...latestTarget, claim: false } : null;
    }
    recordEvent(session, "resize_connection_transition", {
      previousConnectionEpoch,
      connectionEpoch: nextConnectionEpoch,
      retiredResizeEpoch,
      pendingClaim,
      pendingTarget: session.pendingResizeTarget ? {
        cols: session.pendingResizeTarget.cols,
        rows: session.pendingResizeTarget.rows,
      } : null,
    });
    return true;
  };

  const sendSize = (session, { force = false, dimensions = null, claim = false } = {}) => {
    trace(session, "send_size_enter", { force, claim });
    if (disposed || !session || session.exitExpected || !isSocketOpen(session)) {
      trace(session, "send_size_skip", { reason: "socket_unavailable" });
      return false;
    }
    const currentSize = size(session);
    const cols = Math.max(0, Math.floor(Number(dimensions?.cols) || currentSize.cols));
    const rows = Math.max(0, Math.floor(Number(dimensions?.rows) || currentSize.rows));
    const pixelWidth = Math.max(0, Math.floor(Number(dimensions?.pixelWidth) || currentSize.pixelWidth));
    const pixelHeight = Math.max(0, Math.floor(Number(dimensions?.pixelHeight) || currentSize.pixelHeight));
    const pendingTarget = session.resizeAckPending ? {
      cols: session.requestedCols,
      rows: session.requestedRows,
      pixelWidth: session.requestedPixelWidth,
      pixelHeight: session.requestedPixelHeight,
    } : null;
    // One pane may have only one local request in flight. A newer geometry is
    // retained as the latest target and sent after the current ACK instead of
    // replacing requestedResizeEpoch and turning every late ACK into a stale
    // acknowledgement.
    if (pendingTarget) {
      const targetMatches = terminalResizeTargetsMatch(pendingTarget, {
        cols,
        rows,
        pixelWidth,
        pixelHeight,
      });
      const pendingClaim = session.pendingResizeTarget?.claim === true || claim;
      if (!targetMatches || (pendingClaim && session.requestedResizeClaim !== true)) {
        session.pendingResizeTarget = {
          cols,
          rows,
          pixelWidth,
          pixelHeight,
          claim: pendingClaim,
          liveGeometry: liveGeometrySessions.has(session),
        };
        recordEvent(session, "resize_target_queued", {
          cols,
          rows,
          claim: pendingClaim,
          inFlightEpoch: String(session.requestedResizeEpoch || ""),
        });
      }
      trace(session, "send_size_skip", {
        reason: targetMatches ? "pending_target_same" : "pending_target_queued",
        pendingTarget,
        cols,
        rows,
        pixelWidth,
        pixelHeight,
      });
      return false;
    }
    const target = { cols, rows, pixelWidth, pixelHeight };
    const sameConnectionEpoch = Number(session.lastSentConnectionEpoch || 0) === Number(session.connectionEpoch || 0);
    const lastSentTarget = {
      cols: session.lastSentCols,
      rows: session.lastSentRows,
      pixelWidth: session.lastSentPixelWidth,
      pixelHeight: session.lastSentPixelHeight,
    };
    const sameLastSentTarget = sameConnectionEpoch
      && terminalResizeTargetsMatch(lastSentTarget, target)
      && Number(session.lastSentCols || 0) > 0
      && Number(session.lastSentRows || 0) > 0;
    const serverTarget = {
      cols: session.serverCols,
      rows: session.serverRows,
      pixelWidth: session.serverPixelWidth,
      pixelHeight: session.serverPixelHeight,
    };
    const serverGeometryMatches = Number(session.serverCols || 0) > 0
      && Number(session.serverRows || 0) > 0
      && terminalResizeTargetsMatch(serverTarget, target);
    const localGeometryMatches = dimensionsEqual(session, target);
    const appliedGeometryMatches = !session.resizeAckPending
      && !session.resizeFenceActive
      && !session.resizeOutputSettleActive
      && localGeometryMatches
      && !session.sizeClaimRequired;
    const claimAlreadySatisfied = !claim
      || (session.sizeClaimed === true && !session.sizeClaimRequired);
    // forceSizeSync is used by RAF/timeout retries. Once the same request has
    // been acknowledged (or a legacy connection has accepted the local
    // geometry), another identical control frame cannot change the result and
    // would create a new resize epoch/visual hold.
    if (
      sameLastSentTarget
      && claimAlreadySatisfied
      && (serverGeometryMatches || appliedGeometryMatches || session.resizeEpochSupported === false)
    ) {
      trace(session, "send_size_skip", {
        reason: "stable_target_already_applied",
        force,
        claim,
        cols,
        rows,
        pixelWidth,
        pixelHeight,
      });
      return false;
    }
    if (!shouldSendTerminalSize({
      cols,
      rows,
      pixelWidth,
      pixelHeight,
      lastSentCols: session.lastSentCols,
      lastSentRows: session.lastSentRows,
      lastSentPixelWidth: session.lastSentPixelWidth,
      lastSentPixelHeight: session.lastSentPixelHeight,
      force,
    })) {
      trace(session, "send_size_skip", { reason: "size_unchanged", cols, rows, pixelWidth, pixelHeight });
      return false;
    }
    const resizeEpochSupported = session.resizeEpochSupported !== false;
    const resizeEpoch = resizeEpochSupported
      ? nextTerminalResizeEpoch(session, { now: epochNow, random })
      : "";
    session.requestedResizeEpoch = resizeEpoch;
    session.requestedCols = cols;
    session.requestedRows = rows;
    session.requestedPixelWidth = pixelWidth;
    session.requestedPixelHeight = pixelHeight;
    session.resizeAckPending = resizeEpochSupported;
    session.requestedResizeClaim = claim;
    session.resizeController = session.resizeController || new TerminalResizeController();
    if (resizeEpochSupported) {
      session.resizeController.request({
        requestID: String(resizeEpoch),
        connectionEpoch: Number(session.connectionEpoch || 0),
        resizeEpoch,
        dimensions: { cols, rows, pixelWidth, pixelHeight },
      });
    }
    session.lastResizeRequestAt = now();
    try {
      const sent = sendControl(session, {
        type: "resize",
        cols,
        rows,
        pixel_width: pixelWidth,
        pixel_height: pixelHeight,
        ...(claim ? { claim: true } : {}),
        ...(resizeEpochSupported ? { resize_epoch: resizeEpoch } : {}),
      });
      if (sent === false) {
        session.resizeAckPending = false;
        session.requestedResizeClaim = false;
        return false;
      }
    } catch (error) {
      session.resizeAckPending = false;
      session.requestedResizeClaim = false;
      return false;
    }
    session.lastSentCols = cols;
    session.lastSentRows = rows;
    session.lastSentPixelWidth = pixelWidth;
    session.lastSentPixelHeight = pixelHeight;
    session.lastSentConnectionEpoch = Number(session.connectionEpoch || 0);
    if (claim) {
      session.sizeClaimed = true;
      session.lastSizeClaimAt = now();
      clearPendingSizeClaim(session);
    }
    recordEvent(session, "resize_request", {
      requestedResizeEpoch: resizeEpoch,
      cols,
      rows,
      claim,
      ...visualDetails(session, target),
    });
    trace(session, "send_size_sent", {
      claim,
      cols,
      rows,
      pixelWidth,
      pixelHeight,
      resizeEpoch,
      resizeAckPending: session.resizeAckPending,
    });
    return true;
  };

  const resendPendingSize = (session) => {
    if (disposed || !session || session.closed || session.exitExpected || !isSocketOpen(session) || !session.resizeAckPending) {
      return false;
    }
    const resizeEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
    const cols = Math.max(0, Math.floor(Number(session.requestedCols) || 0));
    const rows = Math.max(0, Math.floor(Number(session.requestedRows) || 0));
    const pixelWidth = Math.max(0, Math.floor(Number(session.requestedPixelWidth) || 0));
    const pixelHeight = Math.max(0, Math.floor(Number(session.requestedPixelHeight) || 0));
    if (!resizeEpoch || cols <= 0 || rows <= 0) {
      return false;
    }
    try {
      const sent = sendControl(session, {
        type: "resize",
        cols,
        rows,
        pixel_width: pixelWidth,
        pixel_height: pixelHeight,
        ...(session.requestedResizeClaim === true ? { claim: true } : {}),
        resize_epoch: resizeEpoch,
      });
      if (sent === false) {
        return false;
      }
    } catch (error) {
      return false;
    }
    session.lastResizeRequestAt = now();
    recordEvent(session, "resize_request_retry", {
      requestedResizeEpoch: resizeEpoch,
      cols,
      rows,
      claim: session.requestedResizeClaim === true,
    });
    return true;
  };

  const claimSize = (session, { force = false } = {}) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const currentTime = now();
    const lastClaimAt = Number(session.lastSizeClaimAt || 0);
    if (session.resizeAckPending && session.requestedResizeClaim === true) {
      return false;
    }
    if (!force && !session.sizeClaimRequired) {
      return false;
    }
    if (!force && lastClaimAt > 0 && currentTime - lastClaimAt < sizeClaimIntervalMs) {
      return false;
    }
    const sent = sendSize(session, { force: true, claim: true });
    return sent;
  };

  const handleOwnerReleased = (session, message) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const epoch = normalizeTerminalResizeEpoch(message?.resize_epoch);
    const appliedEpoch = normalizeTerminalResizeEpoch(session.appliedResizeEpoch);
    if (epoch && appliedEpoch && BigInt(epoch) < BigInt(appliedEpoch)) {
      return false;
    }
    const requestedEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
    if (session.resizeAckPending && session.requestedResizeClaim && epoch && requestedEpoch
      && BigInt(epoch) < BigInt(requestedEpoch)) return true;
    if (epoch) {
      session.appliedResizeEpoch = epoch;
    }
    session.serverCols = Math.max(0, Math.floor(Number(message?.cols) || 0));
    session.serverRows = Math.max(0, Math.floor(Number(message?.rows) || 0));
    session.serverPixelWidth = Math.max(0, Math.floor(Number(message?.pixel_width) || 0));
    session.serverPixelHeight = Math.max(0, Math.floor(Number(message?.pixel_height) || 0));
    session.sizeClaimRequired = true;
    session.sizeClaimed = false;
    session.requestedResizeClaim = false;
    recordEvent(session, "resize_owner_released", {
      appliedResizeEpoch: epoch,
      ...visualDetails(session),
    });
    // An owner detaching is not a user interaction. Visible followers must
    // not race to reclaim the shared PTY merely because they received it.
    if (session.pendingSizeClaim) schedulePendingSizeClaim(session);
    presentation()?.ensure(session, { reason: "resize_owner_released", forceHistory: true });
    return true;
  };

  const handleApplied = (session, message) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const epoch = normalizeTerminalResizeEpoch(message?.resize_epoch);
    if (!epoch) {
      return false;
    }
    trace(session, "resize_applied_enter", {
      epoch,
      requestedEpoch: normalizeTerminalResizeEpoch(session.requestedResizeEpoch),
      appliedEpoch: normalizeTerminalResizeEpoch(session.appliedResizeEpoch),
      resizeAckPending: session.resizeAckPending === true,
      cols: Number(message?.cols || 0),
      rows: Number(message?.rows || 0),
    });
    session.resizeEpochSupported = true;
    const requestedEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
    const appliedEpoch = normalizeTerminalResizeEpoch(session.appliedResizeEpoch);
    const ackDimensions = {
      cols: Math.max(0, Math.floor(Number(message.cols) || 0)),
      rows: Math.max(0, Math.floor(Number(message.rows) || 0)),
      pixelWidth: Math.max(0, Math.floor(Number(message.pixel_width) || 0)),
      pixelHeight: Math.max(0, Math.floor(Number(message.pixel_height) || 0)),
    };
    const staleDetails = () => ({
      ackEpoch: epoch,
      requestedEpoch,
      inFlightEpoch: requestedEpoch,
      pendingEpoch: normalizeTerminalResizeEpoch(session.pendingResizeEpoch || session.pendingResizeTarget?.resizeEpoch),
      appliedEpoch,
      connectionEpoch: Number(session.connectionEpoch || 0),
      resizeFenceActive: session.resizeFenceActive === true,
      resizeAckPending: session.resizeAckPending === true,
      ackCols: ackDimensions.cols,
      ackRows: ackDimensions.rows,
      requestedCols: Number(session.requestedCols || 0),
      requestedRows: Number(session.requestedRows || 0),
    });
    if (appliedEpoch && BigInt(epoch) < BigInt(appliedEpoch)) {
      recordEvent(session, "resize_ack_stale", staleDetails());
      return false;
    }
    const duplicateAppliedAck = session.resizeAckPending !== true
      && appliedEpoch === epoch
      && terminalResizeTargetsMatch({
        cols: session.serverCols,
        rows: session.serverRows,
        pixelWidth: session.serverPixelWidth,
        pixelHeight: session.serverPixelHeight,
      }, ackDimensions);
    if (duplicateAppliedAck) {
      recordEvent(session, "resize_ack_duplicate", staleDetails());
      return true;
    }
    if (session.resizeAckPending === true) {
      const resizeController = session.resizeController || (session.resizeController = new TerminalResizeController());
      try {
        resizeController.acknowledge({
          requestID: String(requestedEpoch || epoch),
          connectionEpoch: Number(session.connectionEpoch || 0),
          resizeEpoch: epoch,
          dimensions: ackDimensions,
        });
      } catch (error) {
        recordEvent(session, "resize_ack_stale", staleDetails());
        consoleObject?.warn?.("[terminal-resize] rejected stale resize ACK", error);
        return false;
      }
    }
    session.appliedResizeEpoch = epoch;
    session.serverCols = ackDimensions.cols;
    session.serverRows = ackDimensions.rows;
    session.serverPixelWidth = ackDimensions.pixelWidth;
    session.serverPixelHeight = ackDimensions.pixelHeight;
    const pendingResizeTarget = session.pendingResizeTarget;
    const requestWasClaim = session.requestedResizeClaim === true;
    session.pendingResizeTarget = null;
    recordEvent(session, "resize_applied", {
      appliedResizeEpoch: epoch,
      cols: session.serverCols,
      rows: session.serverRows,
      pixelWidth: session.serverPixelWidth,
      pixelHeight: session.serverPixelHeight,
      requestWasClaim,
      remoteEpoch: Boolean(requestedEpoch && BigInt(epoch) > BigInt(requestedEpoch)),
      ...visualDetails(session, ackDimensions),
    });
    const resizeFenceTarget = session.resizeFenceTarget;
    const resizeFenceMatchesAck = Boolean(
      session.resizeFenceActive
      && !observedResizeQueues.has(session)
      && resizeFenceTarget
      && resizeFenceTarget.cols === session.serverCols
      && resizeFenceTarget.rows === session.serverRows
      && (!resizeFenceTarget.pixelWidth || !session.serverPixelWidth || resizeFenceTarget.pixelWidth === session.serverPixelWidth)
      && (!resizeFenceTarget.pixelHeight || !session.serverPixelHeight || resizeFenceTarget.pixelHeight === session.serverPixelHeight)
    );
    if (resizeFenceMatchesAck) {
      // WebSocket control and binary messages are delivered in order. Freeze
      // the complete queue at the matching ACK boundary so every byte received
      // before the ACK is parsed on the old Ghostty grid. Bytes delivered after
      // this handler returns belong to the applied geometry and remain queued
      // for the new grid.
      if (!session.resizeFenceAckReceived) {
        session.resizeFenceDrainRemainingEntries = getOutputQueueEntryCount(session);
        fenceDrainEnds.set(session, outputBoundary(session));
      }
      applyFence(session);
    } else if (!liveGeometrySessions.has(session)
      && (session.resizeFenceActive || !dimensionsEqual(session, ackDimensions))) {
      applyObservedResize(session, message);
    }
    const appliedGeometryMatchesLocal = dimensionsEqual(session, {
      cols: session.serverCols,
      rows: session.serverRows,
    });
    const remoteEpoch = Boolean(requestedEpoch && BigInt(epoch) > BigInt(requestedEpoch));
    if (remoteEpoch) {
      // An older local target can have the same grid as the newer owner. Its
      // delayed native completion must not restore our previous claim flag.
      if (session.resizeFenceTarget) session.resizeFenceTarget.claim = false;
      session.requestedResizeEpoch = epoch;
      session.requestedCols = session.serverCols;
      session.requestedRows = session.serverRows;
      session.requestedPixelWidth = session.serverPixelWidth;
      session.requestedPixelHeight = session.serverPixelHeight;
    }
    if (remoteEpoch && !appliedGeometryMatchesLocal) {
      session.resizeAckPending = false;
      session.sizeClaimRequired = true;
      session.sizeClaimed = false;
      session.requestedResizeClaim = false;
      if (liveGeometrySessions.has(session)) {
        clearOutputSettle(session);
        clearFence(session);
        endRenderSuppression(session, { render: false, reason: "resize" });
        presentation()?.setReady(session, true, { reason: "live_geometry_remote_resize" });
        if (!hasActiveLiveGeometrySource(session)) {
          lifecycle.scheduleSessionFrame(session, "live-geometry-remote-claim", () => {
            commitLiveGeometryTarget(session);
          });
        }
        return true;
      }
      if (session.pendingSizeClaim) {
        // Finish the authoritative boundary before the newer local claim.
        schedulePendingSizeClaim(session);
        return true;
      }
      // applyObservedResize is asynchronous. Clearing its fence here cancels
      // the just-enqueued Worker resize and strands the first frame.
      return true;
    }
    if (!requestedEpoch || epoch === requestedEpoch || BigInt(epoch) > BigInt(requestedEpoch)) {
      session.resizeAckPending = false;
      session.requestedResizeClaim = false;
      if (remoteEpoch) {
        // A newer epoch may have identical geometry but still belongs to a
        // different device.  The next explicit interaction must be allowed
        // to reclaim ownership.
        session.sizeClaimRequired = true;
        session.sizeClaimed = false;
      } else {
        session.sizeClaimRequired = !dimensionsEqual(session, {
          cols: session.serverCols,
          rows: session.serverRows,
        });
        if (requestWasClaim && !session.sizeClaimRequired) {
          session.sizeClaimed = true;
        }
      }
      presentation()?.ensure(session, {
        reason: "resize_applied",
        forceHistory: true,
      });
      if (session.pendingSizeClaim) {
        schedulePendingSizeClaim(session);
      } else if (pendingResizeTarget && (
        (pendingResizeTarget.claim === true && !requestWasClaim)
        || !terminalResizeTargetsMatch({
          cols: session.serverCols,
          rows: session.serverRows,
          pixelWidth: session.serverPixelWidth,
          pixelHeight: session.serverPixelHeight,
        }, pendingResizeTarget)
      )) {
        lifecycle.scheduleSessionFrame(session, "pending-target", () => {
          if (session.resizeAckPending) {
            return;
          }
          if (liveGeometrySessions.has(session)) {
            const sent = sendSize(session, {
              force: true,
              dimensions: pendingResizeTarget,
              claim: pendingResizeTarget.claim === true || requestWasClaim,
            });
            if (!sent && !session.resizeAckPending) {
              finishLiveGeometry(session, "interactive_resize_pending_applied");
            }
            return;
          }
          schedulePane(session, {
            forceFullRender: true,
            hideUntilRender: true,
            forceSizeSync: true,
            claimSize: pendingResizeTarget.claim === true
              || requestWasClaim
              || (session.sizeClaimed === true && !session.sizeClaimRequired),
          }, { immediate: true });
        });
      } else if (liveGeometrySessions.has(session) && !hasActiveLiveGeometrySource(session)) {
        finishLiveGeometry(session);
      }
    }
    return true;
  };

  const handleError = (session, message) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const epoch = normalizeTerminalResizeEpoch(message?.resize_epoch);
    const requestedEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
    // Record before early returns, including owner rejection without a queued claim.
    recordEvent(session, "resize_control_error", {
      reason: String(message?.reason || ""), resizeErrorEpoch: epoch,
      requestedResizeEpoch: requestedEpoch, appliedEpoch: String(message?.applied_epoch || ""),
      current: !epoch || !requestedEpoch || epoch === requestedEpoch,
      requestWasClaim: session.requestedResizeClaim === true,
      pendingSizeClaim: session.pendingSizeClaim === true,
      terminalSize: { cols: session.term?.cols, rows: session.term?.rows },
      serverSize: { cols: Number(message?.cols || 0), rows: Number(message?.rows || 0) },
    });
    if (epoch && requestedEpoch && epoch !== requestedEpoch) {
      return false;
    }
    const resizeController = session.resizeController || (session.resizeController = new TerminalResizeController());
    try {
      resizeController.fail({
        requestID: String(epoch || requestedEpoch || ""),
        connectionEpoch: Number(session.connectionEpoch || 0),
        resizeEpoch: epoch || requestedEpoch || undefined,
      });
    } catch (error) {
      consoleObject?.warn?.("[terminal-resize] rejected stale resize error", error);
      return false;
    }
    session.resizeAckPending = false;
    session.sizeClaimed = false;
    session.requestedResizeClaim = false;
    session.sizeClaimRequired = true;
    if (String(message?.reason || "").trim() === "resize_owner_active") {
      const appliedEpoch = normalizeTerminalResizeEpoch(message?.applied_epoch);
      if (appliedEpoch) {
        session.appliedResizeEpoch = appliedEpoch;
        session.requestedResizeEpoch = appliedEpoch;
      }
      session.serverCols = Math.max(0, Math.floor(Number(message?.cols) || 0));
      session.serverRows = Math.max(0, Math.floor(Number(message?.rows) || 0));
      session.serverPixelWidth = Math.max(0, Math.floor(Number(message?.pixel_width) || 0));
      session.serverPixelHeight = Math.max(0, Math.floor(Number(message?.pixel_height) || 0));
      session.requestedCols = session.serverCols;
      session.requestedRows = session.serverRows;
      session.requestedPixelWidth = session.serverPixelWidth;
      session.requestedPixelHeight = session.serverPixelHeight;
      if (liveGeometrySessions.has(session)) {
        clearOutputSettle(session);
        clearFence(session);
        endRenderSuppression(session, { render: false, reason: "resize" });
        presentation()?.setReady(session, true, { reason: "live_geometry_owner_retry" });
        if (!hasActiveLiveGeometrySource(session)) {
          lifecycle.scheduleSessionFrame(session, "live-geometry-owner-claim", () => {
            commitLiveGeometryTarget(session);
          });
        }
        return true;
      }
      // Rejected passive fits adopt the authoritative grid for presentation.
      if (session.resizeFenceAckReceived || !dimensionsEqual(session, { cols: session.serverCols, rows: session.serverRows })) {
        applyObservedResize(session, message);
      } else if (!session.resizeFenceAckReceived) {
        clearOutputSettle(session);
        clearFence(session, "owner_rejection_same_grid");
        endRenderSuppression(session, { render: false, reason: "resize" });
      }
      if (session.pendingSizeClaim) schedulePendingSizeClaim(session);
      presentation()?.ensure(session, { reason: "resize_owner_observed", forceHistory: true });
      return true;
    }
    clearOutputSettle(session);
    clearFence(session);
    recordEvent(session, "resize_error", {
      resizeErrorEpoch: epoch,
      reason: String(message?.reason || ""),
    });
    if (liveGeometrySessions.has(session)) {
      endRenderSuppression(session, { render: false, reason: "resize" });
      presentation()?.setReady(session, true, { reason: "live_geometry_resize_error" });
      consoleObject?.warn?.("[terminal-resize] live geometry resize rejected", {
        name: session.name,
        pane: session.id,
        epoch,
        reason: message?.reason || "",
      });
      if (!hasActiveLiveGeometrySource(session)) {
        finishLiveGeometry(session, "resize_error");
      }
      return true;
    }
    if (session.resizePresentationHold) {
      presentation()?.cancelHold(session);
      if (session.hasPresentedFrame) {
        presentation()?.setReady(session, false, { reason: "resize_error" });
      }
    }
    consoleObject?.warn?.("[terminal-resize] resize rejected", {
      name: session.name,
      pane: session.id,
      epoch,
      reason: message?.reason || "",
    });
    presentation()?.ensure(session, {
      reason: "resize_error",
      forceHistory: true,
    });
    return true;
  };

  const resizePane = (session, {
    visibleOnly = true,
    forceFullRender = false,
    hideUntilRender = false,
    forceSizeSync = false,
    claimSize: shouldClaimSize = false,
    settlePresentation,
  } = {}) => {
    if (session?.exitExpected) return failedTerminalFit(isMeasurable(session));
    if (failedSessions.has(session)) return failedTerminalFit(isMeasurable(session));
    if (nativeGeometry.isPending(session) || (session?.replayGeometryLocked && !isReplayCommitted(session))) {
      const previous = pendingNativeOptions.get(session) || {};
      pendingNativeOptions.set(session, {
        visibleOnly,
        forceFullRender: forceFullRender || previous.forceFullRender,
        hideUntilRender: hideUntilRender || previous.hideUntilRender,
        forceSizeSync: forceSizeSync || previous.forceSizeSync,
        claimSize: shouldClaimSize || previous.claimSize,
        settlePresentation,
      });
      return { ok: true, pending: true, measurable: isMeasurable(session), ...size(session) };
    }
    if (session?.replayGeometryLocked) {
      session.replayGeometryLocked = false;
      const pending = pendingNativeOptions.get(session);
      pendingNativeOptions.delete(session);
      shouldClaimSize ||= pending?.claimSize === true;
      shouldClaimSize ||= session.pendingSizeClaim === true;
      forceSizeSync ||= pending?.forceSizeSync === true;
      forceFullRender ||= pending?.forceFullRender === true;
    }
    if (liveGeometrySessions.has(session)) {
      return failedTerminalFit(isMeasurable(session));
    }
    trace(session, "resize_pane_enter", {
      forceFullRender,
      hideUntilRender,
      forceSizeSync,
      claimSize: shouldClaimSize,
      visibleOnly,
      renderReady: session?.renderReady,
      hasPresentedFrame: session?.hasPresentedFrame,
      measuredFitGeneration: Number(session?.measuredFitGeneration || 0),
      presentedFitGeneration: Number(session?.presentedFitGeneration || 0),
      resizeAckPending: session?.resizeAckPending === true,
      resizePresentationHold: session?.resizePresentationHold === true,
      fullRenderPending: session?.fullRenderPending === true,
    });
    if (disposed || !session || session.closed) {
      return failedTerminalFit();
    }
    const shouldSettlePresentation = settlePresentation === true
      || (settlePresentation !== false && !session.resizePresentationHold);
    if (visibleOnly && !isVisible(session)) {
      return failedTerminalFit(isMeasurable(session));
    }
    if (isMobileKeyboardResizeSuppressed()) {
      resetHostViewport(session, { clean: true });
      positionInput(session);
      syncViewportPan(session);
      updateSelectionHandles(session);
      return failedTerminalFit(isMeasurable(session));
    }
    if (!shouldSettlePresentation && session.resizePresentationHold) {
      return failedTerminalFit(isMeasurable(session));
    }
    if (session.term?.wasmTerm?.isRemote && isReplayCommitted(session)
      && !shouldClaimSize && !session.sizeClaimed) {
      // A follower's DOM viewport can differ from the shared PTY. Display the
      // authoritative grid; only user intent may request a different grid.
      if (session.resizeFenceActive || session.resizeAckPending || session.resizeOutputSettleActive) {
        return { ok: true, pending: true, measurable: isMeasurable(session), ...size(session) };
      }
      const finishFollowerFit = () => {
        session.activationFitPending = false;
        presentation()?.ensure(session, { reason: "server_geometry_follow", forceHistory: true });
        return { ok: true, measurable: isMeasurable(session), ...size(session), sizeChanged: false, canvasChanged: false };
      };
      if (!canvasMatchesExpectedSize(session)) {
        const result = nativeGeometry.apply(session, size(session), finishFollowerFit);
        return result?.then ? { ok: true, pending: true, measurable: isMeasurable(session), ...size(session) } : result;
      }
      return finishFollowerFit();
    }
    return measureTask("resize/fit", () => {
      const dimensions = session.fitAddon?.proposeDimensions?.();
      if (!dimensions || dimensions.cols <= 0 || dimensions.rows <= 0) {
        return failedTerminalFit(isMeasurable(session));
      }
      const fittedDimensions = {
        cols: Math.max(1, Math.floor(Number(dimensions.cols) || 0)),
        rows: Math.max(1, Math.floor(Number(dimensions.rows) || 0)),
      };
      const sizeBefore = size(session);
      const canvasBefore = terminalCanvasSize(session);
      const canvasNeedsResize = !canvasMatchesExpectedSize(session, fittedDimensions);
      const dimensionsWillChange = !dimensionsEqual(session, fittedDimensions) || canvasNeedsResize;
      const targetCanvas = session.term?.renderer?.canvasSize?.(fittedDimensions.cols, fittedDimensions.rows);
      const targetDimensions = {
        cols: fittedDimensions.cols,
        rows: fittedDimensions.rows,
        pixelWidth: Math.max(0, Math.floor(Number(targetCanvas?.pixelWidth) || 0)),
        pixelHeight: Math.max(0, Math.floor(Number(targetCanvas?.pixelHeight) || 0)),
      };
      // The ACK's old-grid boundary must finish before a later DOM fit can
      // replace it. Keep the new intent and resume after the native commit.
      if (session.resizeFenceAckReceived) {
        session.pendingResizeTarget = {
          ...targetDimensions,
          claim: shouldClaimSize || session.sizeClaimed === true || session.pendingResizeTarget?.claim === true,
        };
        return { ok: true, measurable: true, pending: true, ...sizeBefore, sizeChanged: false, canvasChanged: false };
      }
      // Once this pane has claimed the current device, every later geometry
      // correction must retain that ownership.  Conversely, a passive fit
      // must not overwrite a newer remote owner after a visible frame exists;
      // an explicit current-device interaction has to reclaim it first.
      const claimSizeForTransaction = shouldClaimSize
        || (session.sizeClaimed === true && session.sizeClaimRequired !== true);
      if (
        !claimSizeForTransaction
        && session.sizeClaimRequired === true
        && session.hasPresentedFrame === true
        && (dimensionsWillChange || forceSizeSync)
      ) {
        recordEvent(session, "resize_wait_current_device_claim", {
          fittedCols: fittedDimensions.cols,
          fittedRows: fittedDimensions.rows,
          currentCols: sizeBefore.cols,
          currentRows: sizeBefore.rows,
          reason: "remote_owner_observed",
        });
        trace(session, "resize_wait_current_device_claim", {
          fittedCols: fittedDimensions.cols,
          fittedRows: fittedDimensions.rows,
          currentCols: sizeBefore.cols,
          currentRows: sizeBefore.rows,
          reason: "remote_owner_observed",
        });
        return failedTerminalFit(true);
      }
      const firstMeasuredFit = Number(session.measuredFitGeneration || 0) <= 0;
      const pendingResizeTarget = session.resizeAckPending ? {
        cols: session.requestedCols,
        rows: session.requestedRows,
        pixelWidth: session.requestedPixelWidth,
        pixelHeight: session.requestedPixelHeight,
      } : null;
      const pendingTargetMatches = Boolean(
        pendingResizeTarget
        && terminalResizeTargetsMatch(pendingResizeTarget, targetDimensions)
      );
      const canDeferLocalResize = Boolean(
        dimensionsWillChange
        && isReplayCommitted(session)
        && isSocketOpen(session)
        && session.resizeEpochSupported !== false
      );
      const resizeRequestInFlight = Boolean(canDeferLocalResize && session.resizeAckPending);
      const stablePresentation = Boolean(
        !session.activationFitPending
        && session.hasPresentedFrame === true
        && session.renderReady !== false
        && !session.fullRenderPending
        && !session.resizePresentationHold
        // terminalFrameHeld can remain true for the two-paint release grace
        // period. It does not make a stable live canvas geometrically stale.
        && (!session.terminalFrameHeld || session.renderReady === true)
        && !session.resizeFenceActive
        && !session.resizeOutputSettleActive
        && (!session.resizeAckPending || pendingTargetMatches)
        && (session.presentedFitGeneration === undefined
          || session.presentedFitGeneration === session.measuredFitGeneration)
      );
      const canUseStableGeometryFastPath = Boolean(
        !firstMeasuredFit
        && !dimensionsWillChange
        && stablePresentation
      );
      trace(session, "resize_pane_measure", {
        fittedCols: fittedDimensions.cols,
        fittedRows: fittedDimensions.rows,
        currentCols: sizeBefore.cols,
        currentRows: sizeBefore.rows,
        canvasNeedsResize,
        dimensionsWillChange,
        firstMeasuredFit,
        stablePresentation,
        canUseStableGeometryFastPath,
        pendingTargetMatches,
        resizeAckPending: session.resizeAckPending === true,
        resizePresentationHold: session.resizePresentationHold === true,
        fullRenderPending: session.fullRenderPending === true,
        renderReady: session.renderReady === true,
        hasPresentedFrame: session.hasPresentedFrame === true,
        measuredFitGeneration: Number(session.measuredFitGeneration || 0),
        presentedFitGeneration: Number(session.presentedFitGeneration || 0),
      });
      recordEvent(session, "resize_visual_measure", {
        fittedCols: fittedDimensions.cols,
        fittedRows: fittedDimensions.rows,
        canvasNeedsResize,
        dimensionsWillChange,
        stablePresentation,
        canUseStableGeometryFastPath,
        ...visualDetails(session, targetDimensions),
      });
      if (canUseStableGeometryFastPath) {
        let sentTerminalSize = false;
        const claimAlreadySatisfied = claimSizeForTransaction
          && session.sizeClaimed === true
          && !session.sizeClaimRequired;
        const needsControlFrame = forceSizeSync || (claimSizeForTransaction && !claimAlreadySatisfied);
        if (needsControlFrame && !session.resizeAckPending) {
          sentTerminalSize = sendSize(session, {
            force: true,
            dimensions: targetDimensions,
            claim: claimSizeForTransaction,
          });
        }
        let rendered = false;
        if (forceFullRender || hideUntilRender || session.fullRenderPending) {
          presentation()?.requestFullRender(session);
          rendered = presentation()?.renderFullNow(session) === true;
        }
        return {
          ok: true,
          measurable: true,
          pending: Boolean(session.resizeAckPending),
          cols: sizeBefore.cols,
          rows: sizeBefore.rows,
          sizeChanged: false,
          canvasChanged: false,
          sentTerminalSize,
          claimSent: sentTerminalSize && claimSizeForTransaction,
          rendered,
        };
      }
      // A retry can arrive while the first resize request is still waiting for
      // its ACK. Preserve the single captured hold and queued target without
      // recapturing the viewport or toggling render readiness again.
      if (resizeRequestInFlight && pendingTargetMatches) {
        recordEvent(session, "resize_fence_wait", {
          cols: targetDimensions.cols,
          rows: targetDimensions.rows,
          reusedPendingRequest: true,
        });
        return {
          ok: true,
          measurable: true,
          pending: true,
          cols: sizeBefore.cols,
          rows: sizeBefore.rows,
          sizeChanged: false,
          canvasChanged: false,
        };
      }
      if (resizeRequestInFlight) {
        session.pendingResizeTarget = {
          ...targetDimensions,
          claim: claimSizeForTransaction,
          liveGeometry: liveGeometrySessions.has(session),
        };
        recordEvent(session, "resize_fence_wait", {
          cols: targetDimensions.cols,
          rows: targetDimensions.rows,
          queuedBehindRequest: session.requestedResizeEpoch,
        });
        return {
          ok: true,
          measurable: true,
          pending: true,
          cols: sizeBefore.cols,
          rows: sizeBefore.rows,
          sizeChanged: false,
          canvasChanged: false,
        };
      }
      trace(session, "resize_pane_full_path", {
        dimensionsWillChange,
        shouldHoldFrame: dimensionsWillChange && session.hasPresentedFrame,
        shouldSettlePresentation,
      });
      const capturedViewport = viewport.capture(session.term);
      const shouldHoldFrame = dimensionsWillChange && session.hasPresentedFrame;
      const legacyResizeSuppression = Boolean(
        dimensionsWillChange
        && isReplayCommitted(session)
        && isSocketOpen(session)
        && session.resizeEpochSupported === false
      );
      if (shouldHoldFrame) {
        if (presentation()?.beginHold(session) !== true) {
          recordEvent(session, "resize_deferred", { reason: "presentation_hold_unavailable" });
          presentation()?.scheduleValidation(session, { forceHistory: true });
          return failedTerminalFit(true);
        }
      } else if (!shouldSettlePresentation) {
        presentation()?.beginHold(session, { capture: false });
      }
      const shouldCommitAfterHold = session.resizePresentationHold && session.hasPresentedFrame;
      const resizeOutputSettlePending = session.resizeOutputSettleActive === true;
      if (shouldHoldFrame && !session.terminalFrameHeld) {
        presentation()?.holdFrame(session);
      }
      if (hideUntilRender || shouldHoldFrame || session.resizePresentationHold) {
        // A real geometry transition explicitly captured the old frame above.
        // Stable forced renders must not create another hold just because the
        // caller requested hide-until-render behavior.
        presentation()?.setReady(session, false, { preserveFrame: false, reason: "resize_transaction" });
      }
      if (canDeferLocalResize) {
        clearOutputSettle(session);
        beginRenderSuppression(session, "resize");
        session.resizeFenceActive = true;
        session.resizeFenceTarget = {
          ...targetDimensions,
          viewport: capturedViewport,
          claim: claimSizeForTransaction,
        };
        session.resizeFenceDrainRemainingEntries = getOutputQueueEntryCount(session);
        flushOutput(session, {
          force: true,
          maxBytes: outputFlushBudgetBytes,
        });
        session.resizeFenceDrainRemainingEntries = Math.min(
          session.resizeFenceDrainRemainingEntries,
          getOutputQueueEntryCount(session),
        );
        const sent = sendSize(session, {
          force: true,
          dimensions: targetDimensions,
          claim: claimSizeForTransaction,
        });
        if (sent) {
          recordEvent(session, "resize_fence_wait", {
            cols: targetDimensions.cols,
            rows: targetDimensions.rows,
          });
          return {
            ok: true,
            measurable: true,
            pending: true,
            cols: sizeBefore.cols,
            rows: sizeBefore.rows,
            sizeChanged: false,
            canvasChanged: false,
            sentTerminalSize: true,
            claimSent: claimSizeForTransaction,
          };
        }
        endRenderSuppression(session, { render: false, reason: "resize" });
        clearFence(session);
      }
      const finishFit = () => {
      if (disposed || session.closed || liveGeometrySessions.has(session)) return failedTerminalFit(isMeasurable(session));
      viewport.restore(session.term, capturedViewport);
      const sizeAfter = size(session);
      const canvasAfter = terminalCanvasSize(session);
      const sizeChanged = sizeBefore.cols !== sizeAfter.cols || sizeBefore.rows !== sizeAfter.rows;
      const canvasChanged = canvasBefore.width !== canvasAfter.width || canvasBefore.height !== canvasAfter.height;
      const fitGenerationChanged = firstMeasuredFit || sizeChanged || canvasChanged || canvasNeedsResize;
      if (fitGenerationChanged) session.measuredFitGeneration = Number(session.measuredFitGeneration || 0) + 1;
      session.activationFitPending = false;
      resetHostViewport(session, { clean: true });
      positionInput(session);
      syncViewportPan(session);
      if (!session.initialRuntimeResetDone && !isReplayCommitted(session)) resetAfterInitialFit(session);
      if (fitGenerationChanged && isReplayCommitted(session)) presentation()?.setReady(session, false, { preserveFrame: false, reason: "resize_fit_changed" });
      const sentTerminalSize = sendSize(session, { force: forceSizeSync, dimensions: targetDimensions, claim: claimSizeForTransaction });
      updateSelectionHandles(session);
      if (sentTerminalSize && dimensionsWillChange && isReplayCommitted(session) && session.resizeEpochSupported === false && scheduleOutputSettle(session, { reason: "legacy_resize" })) {
        return { ok: true, measurable: true, pending: true, ...sizeAfter, sizeChanged, canvasChanged };
      }
      if (legacyResizeSuppression && !session.resizeOutputSettleActive) endRenderSuppression(session, { render: false, reason: "resize" });
      if (shouldCommitAfterHold && !session.resizeAckPending && !resizeOutputSettlePending) {
        presentation()?.requestFullRender(session);
        presentation()?.commitNow(session);
      } else if (forceFullRender || fitGenerationChanged || hideUntilRender || session.fullRenderPending || !session.hasPresentedFrame) {
        presentation()?.renderFullNow(session);
      }
      if (shouldSettlePresentation && !shouldCommitAfterHold && !session.resizeAckPending && !resizeOutputSettlePending) {
        presentation()?.cancelHold(session, { restoreReady: !session.fullRenderPending && session.hasPresentedFrame });
      }
      return { ok: true, measurable: true, ...sizeAfter, sizeChanged, canvasChanged, sentTerminalSize, claimSent: sentTerminalSize && claimSizeForTransaction };
      };
      try {
        if (legacyResizeSuppression) {
          beginRenderSuppression(session, "resize");
        }
        if (dimensionsWillChange) {
          trace(session, "term_resize_before", {
            cols: fittedDimensions.cols,
            rows: fittedDimensions.rows,
          });
          const result = nativeGeometry.apply(session, fittedDimensions, finishFit);
          if (result?.then) return { ok: true, pending: true, measurable: true, ...sizeBefore };
          return result || failedTerminalFit(true);
        }
      } catch (error) {
        if (legacyResizeSuppression) {
          endRenderSuppression(session, { render: false, reason: "resize" });
        }
        if (session.hasPresentedFrame) {
          presentation()?.scheduleValidation(session);
        }
        if (shouldSettlePresentation) {
          presentation()?.cancelHold(session, { restoreReady: session.hasPresentedFrame });
        }
        failResize(session, error);
        return failedTerminalFit(true);
      }
      return finishFit();
    });
  };

  lifecycle = lifecycleFactory({
    windowObject,
    workScheduler,
    ResizeObserverCtor,
    applyResize: (session, options, { settled = true } = {}) => {
      if (!settled) {
        return;
      }
      const fit = resizePane(session, {
        ...options,
        settlePresentation: true,
      });
      if (fit.ok) {
        connectPendingSession(session);
      }
    },
    registerSessionCleanup,
    throttleMs,
    settleMs,
  });

  const schedulePane = (session, options = {}, scheduleOptions = {}) => {
    if (
      disposed
      || !session
      || session.closed
      || interactiveResizeSessions.has(session)
      || liveGeometrySessions.has(session)
      || isMobileKeyboardResizeSuppressed()
    ) {
      return false;
    }
    return lifecycle.schedule(session, options, scheduleOptions);
  };

  const schedulePresentationResize = (session, options = {}, scheduleOptions = {}) => (
    schedulePane(session, {
      ...options,
      claimSize: options.claimSize === true
        || (session?.sizeClaimed === true && session?.sizeClaimRequired !== true),
    }, scheduleOptions)
  );

  const cancelPane = (session) => {
    nativeGeometry.cancel(session);
    pendingNativeOptions.delete(session);
    workScheduler?.cancel(session, "live-geometry");
    lifecycle.cancel(session);
    if (session) {
      interactiveResizeSessions.delete(session);
      metricsLiveGeometrySessions.delete(session);
      liveGeometrySessions.delete(session);
      liveGeometryLastResizeAt.delete(session);
      const resizeTimer = liveGeometryResizeTimers.get(session);
      if (resizeTimer) {
        windowObject.clearTimeout(resizeTimer);
        liveGeometryResizeTimers.delete(session);
      }
      clearPendingSizeClaim(session);
      clearOutputSettle(session);
      clearFence(session);
      presentation()?.cancelHold(session);
    }
  };

  const resizeTab = (tab, options = {}) => {
    if (disposed || !tab) {
      return false;
    }
    for (const session of tab.panes.values()) {
      schedulePane(session, options, { immediate: true });
    }
    for (const session of tab.panes.values()) {
      connectPendingSession(session);
    }
    return true;
  };

  const resizeActiveTab = (options = {}) => resizeTab(getCurrentTab(), options);

  const finishLiveGeometry = (session, reason = "interactive_resize_complete") => {
    if (!liveGeometrySessions.delete(session)) {
      return false;
    }
    workScheduler?.cancel(session, "live-geometry");
    const resizeTimer = liveGeometryResizeTimers.get(session);
    if (resizeTimer) {
      windowObject.clearTimeout(resizeTimer);
      liveGeometryResizeTimers.delete(session);
    }
    interactiveResizeSessions.delete(session);
    metricsLiveGeometrySessions.delete(session);
    liveGeometryLastResizeAt.delete(session);
    lifecycle.cancel(session);
    if (session.resizePresentationHold || session.terminalFrameHeld) {
      presentation()?.cancelHold(session, { restoreReady: true, releaseFrame: true });
    }
    presentation()?.ensure(session, { reason, forceHistory: false });
    recordEvent(session, "live_geometry_complete", visualDetails(session));
    return true;
  };

  const resizePaneLiveGeometry = (session, { force = false, scheduled = false } = {}) => {
    if (
      disposed
      || !session
      || session.closed
      || !liveGeometrySessions.has(session)
      || failedSessions.has(session)
      || !isReplayCommitted(session)
      || !isVisible(session)
    ) {
      return failedTerminalFit(isMeasurable(session));
    }
    const currentTime = now();
    const lastResizeAt = liveGeometryLastResizeAt.get(session) ?? Number.NEGATIVE_INFINITY;
    if (workScheduler && !scheduled) {
      workScheduler.schedule(session, "live-geometry", () => {
        const result = resizePaneLiveGeometry(session, { force: true, scheduled: true });
        if (result.ok && !result.pending && !hasActiveLiveGeometrySource(session)) commitLiveGeometryTarget(session);
        else if (!isVisible(session) && !hasActiveLiveGeometrySource(session)) finishLiveGeometry(session, "interactive_resize_hidden");
      }, { priority: () => 3, delayMs: force ? 0 : Math.max(0, throttleMs - (currentTime - lastResizeAt)) });
      return { ok: true, measurable: true, pending: true, ...size(session), sizeChanged: false, canvasChanged: false };
    }
    if (nativeGeometry.isPending(session)) return { ok: true, pending: true, measurable: true, ...size(session) };
    if (!force && currentTime - lastResizeAt < throttleMs) {
      if (!liveGeometryResizeTimers.has(session)) {
        const delay = Math.max(0, throttleMs - (currentTime - lastResizeAt));
        const timer = windowObject.setTimeout(() => {
          if (liveGeometryResizeTimers.get(session) !== timer) {
            return;
          }
          liveGeometryResizeTimers.delete(session);
          if (!disposed && liveGeometrySessions.has(session)) {
            resizePaneLiveGeometry(session, { force: true });
          }
        }, delay);
        liveGeometryResizeTimers.set(session, timer);
      }
      return {
        ok: true,
        measurable: true,
        throttled: true,
        cols: Number(session.term?.cols || 0),
        rows: Number(session.term?.rows || 0),
        sizeChanged: false,
        canvasChanged: false,
      };
    }
    const resizeTimer = liveGeometryResizeTimers.get(session);
    if (resizeTimer) {
      windowObject.clearTimeout(resizeTimer);
      liveGeometryResizeTimers.delete(session);
    }
    liveGeometryLastResizeAt.set(session, currentTime);
    return measureTask("resize/live-fit", () => {
      const dimensions = session.fitAddon?.proposeDimensions?.();
      if (!dimensions || dimensions.cols <= 0 || dimensions.rows <= 0) {
        return failedTerminalFit(isMeasurable(session));
      }
      const fittedDimensions = {
        cols: Math.max(1, Math.floor(Number(dimensions.cols) || 0)),
        rows: Math.max(1, Math.floor(Number(dimensions.rows) || 0)),
      };
      const sizeBefore = size(session);
      const canvasBefore = terminalCanvasSize(session);
      const canvasNeedsResize = !canvasMatchesExpectedSize(session, fittedDimensions);
      const dimensionsWillChange = !dimensionsEqual(session, fittedDimensions) || canvasNeedsResize;
      if (!dimensionsWillChange) {
        return {
          ok: true,
          measurable: true,
          cols: sizeBefore.cols,
          rows: sizeBefore.rows,
          sizeChanged: false,
          canvasChanged: false,
        };
      }
      const capturedViewport = viewport.capture(session.term);
      const result = nativeGeometry.apply(session, fittedDimensions, () => {
      if (!liveGeometrySessions.has(session)) return failedTerminalFit(isMeasurable(session));
      viewport.restore(session.term, capturedViewport);
      const sizeAfter = size(session);
      const canvasAfter = terminalCanvasSize(session);
      const sizeChanged = sizeBefore.cols !== sizeAfter.cols || sizeBefore.rows !== sizeAfter.rows;
      const canvasChanged = canvasBefore.width !== canvasAfter.width || canvasBefore.height !== canvasAfter.height;
      session.measuredFitGeneration = Number(session.measuredFitGeneration || 0) + 1;
      session.activationFitPending = false;
      resetHostViewport(session, { clean: true });
      positionInput(session);
      syncViewportPan(session);
      updateSelectionHandles(session);
      presentation()?.setReady(session, true, { reason: "live_geometry_resize" });
      // Canvas resize clears its pixels. Keep this pane's resize + draw atomic;
      // the shared scheduler yields before starting the other pane's work.
      const rendered = presentation()?.renderLiveGeometryNow(session) === true;
      return {
        ok: true,
        measurable: true,
        cols: sizeAfter.cols,
        rows: sizeAfter.rows,
        sizeChanged,
        canvasChanged,
        rendered,
      };
      });
      return result?.then ? { ok: true, pending: true, measurable: true, ...sizeBefore } : result || failedTerminalFit(true);
    });
  };

  const commitLiveGeometryTarget = (session) => {
    if (!liveGeometrySessions.has(session) || session.closed) {
      return false;
    }
    const target = size(session);
    if (target.cols <= 0 || target.rows <= 0) {
      return false;
    }
    const sent = sendSize(session, {
      force: true,
      dimensions: target,
      claim: true,
    });
    if (!sent && !session.resizeAckPending) {
      finishLiveGeometry(session, "interactive_resize_already_applied");
    }
    return sent || session.resizeAckPending || Boolean(session.pendingResizeTarget);
  };

  const beginLiveGeometryForSource = (session, sourceSessions, eventType) => {
    if (
      disposed
      || !session
      || session.closed
      || sourceSessions.has(session)
      || failedSessions.has(session)
      || !session.hasPresentedFrame
      || !isReplayCommitted(session)
      || !isVisible(session)
    ) {
      return false;
    }
    lifecycle.cancel(session);
    sourceSessions.add(session);
    if (!liveGeometrySessions.has(session)) {
      liveGeometrySessions.add(session);
      liveGeometryLastResizeAt.delete(session);
      clearPendingSizeClaim(session);
      clearOutputSettle(session);
      clearFence(session);
      endRenderSuppression(session, { render: false, reason: "resize" });
      if (session.resizePresentationHold || session.terminalFrameHeld) {
        presentation()?.cancelHold(session, { restoreReady: true, releaseFrame: true });
      } else {
        presentation()?.setReady(session, true, { reason: "live_geometry_begin" });
      }
    }
    recordEvent(session, eventType, visualDetails(session));
    return true;
  };

  const endLiveGeometryForSource = (session, sourceSessions, eventType) => {
    if (!session || !sourceSessions.delete(session)) {
      return false;
    }
    lifecycle.cancel(session);
    resizePaneLiveGeometry(session, { force: true });
    recordEvent(session, eventType, visualDetails(session));
    if (!workScheduler && !hasActiveLiveGeometrySource(session)) {
      commitLiveGeometryTarget(session);
    }
    return true;
  };

  const beginMetricsLiveGeometry = (session) => (
    metricsLiveGeometrySessions.has(session)
      ? liveGeometrySessions.has(session)
      : beginLiveGeometryForSource(session, metricsLiveGeometrySessions, "metrics_live_geometry_begin")
  );

  const updateMetricsLiveGeometry = (session, options = {}) => {
    if (!metricsLiveGeometrySessions.has(session)) {
      return failedTerminalFit(isMeasurable(session));
    }
    return resizePaneLiveGeometry(session, options);
  };

  const endMetricsLiveGeometry = (session) => endLiveGeometryForSource(
    session,
    metricsLiveGeometrySessions,
    "metrics_live_geometry_end",
  );

  const beginTabInteractiveResize = (tab) => {
    if (disposed || !tab?.panes) {
      return false;
    }
    let started = false;
    for (const session of tab.panes.values()) {
      started = beginLiveGeometryForSource(
        session,
        interactiveResizeSessions,
        "interactive_resize_begin",
      ) || started;
    }
    return started;
  };

  const updateTabInteractiveResize = (tab) => {
    if (disposed || !tab?.panes) {
      return false;
    }
    let updated = false;
    for (const session of tab.panes.values()) {
      if (!interactiveResizeSessions.has(session)) {
        continue;
      }
      const result = resizePaneLiveGeometry(session);
      updated = result.ok || updated;
    }
    return updated;
  };

  const endTabInteractiveResize = (tab) => {
    if (!tab?.panes) {
      return false;
    }
    let ended = false;
    for (const session of tab.panes.values()) {
      ended = endLiveGeometryForSource(
        session,
        interactiveResizeSessions,
        "interactive_resize_end",
      ) || ended;
    }
    return ended;
  };

  const scheduleTabLiveGeometry = (tab) => {
    if (disposed || !tab?.panes) {
      return false;
    }
    beginTabInteractiveResize(tab);
    updateTabInteractiveResize(tab);
    const currentTimer = windowLiveResizeTimers.get(tab);
    if (currentTimer) {
      windowObject.clearTimeout(currentTimer);
    }
    const timer = windowObject.setTimeout(() => {
      if (windowLiveResizeTimers.get(tab) !== timer) {
        return;
      }
      windowLiveResizeTimers.delete(tab);
      endTabInteractiveResize(tab);
    }, settleMs);
    windowLiveResizeTimers.set(tab, timer);
    return true;
  };

  const cancelTab = (tab) => {
    const timer = windowLiveResizeTimers.get(tab);
    if (timer) {
      windowObject.clearTimeout(timer);
      windowLiveResizeTimers.delete(tab);
    }
    return lifecycle.cancelTab(tab);
  };

  const scheduleTab = (tab, options = {}, scheduleOptions = {}) => {
    if (disposed || !tab) {
      return false;
    }
    syncTabMobilePixelScroll(tab);
    for (const session of tab.panes.values()) {
      schedulePane(session, options, scheduleOptions);
    }
    return true;
  };

  const scheduleVisibleTab = (tab, { immediate = false } = {}) => {
    if (disposed || !tab) {
      return false;
    }
    return lifecycle.scheduleTabFrame(tab, () => {
      for (const session of tab.panes.values()) {
        if (presentation()?.stateIsCurrent(session) && !session.activationFitPending) {
          connectPendingSession(session);
          continue;
        }
        const presentationCurrent = presentation()?.isCurrent(session) === true;
        schedulePane(session, {
          forceFullRender: !presentationCurrent || !session.hasPresentedFrame,
          hideUntilRender: !presentationCurrent,
        }, { immediate: true });
      }
      if (tab.id === getActiveTabId()) {
        for (const session of tab.panes.values()) {
          if (!presentation()?.isCurrent(session)) {
            presentation()?.scheduleFrame(session, "tab_activated");
          }
        }
      }
    }, { immediate });
  };

  const scheduleActiveTabWindowResize = () => scheduleTab(getCurrentTab(), {
    forceFullRender: true,
    hideUntilRender: true,
  });

  const reassertSize = (session, { force = false } = {}) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const currentTime = now();
    if (!force && currentTime - Number(session.lastSizeReassertAt || 0) < sizeReassertIntervalMs) {
      return false;
    }
    session.lastSizeReassertAt = currentTime;
    return resizePane(session).ok;
  };

  const reassertSizeForMouse = (session, event) => {
    const PointerEventCtor = windowObject?.PointerEvent || globalThis.PointerEvent;
    if (
      typeof PointerEventCtor === "function"
      && event instanceof PointerEventCtor
      && event.pointerType
      && event.pointerType !== "mouse"
    ) {
      return false;
    }
    return reassertSize(session, { force: true });
  };

  const claimForCurrentDevice = (session, options = {}) => {
    if (disposed || !session || session.closed || session.exitExpected) {
      return false;
    }
    if (!isSocketOpen(session) || nativeGeometry.isPending(session) || session.resizeFenceAckReceived
      || (session.replayGeometryLocked && !isReplayCommitted(session))) {
      return queuePendingSizeClaim(session, options);
    }
    if (!isVisible(session)) {
      if (session.resizeAckPending && session.requestedResizeClaim !== true) {
        return queuePendingSizeClaim(session, options);
      }
      return claimSize(session, { force: true });
    }
    const fit = resizePane(session, {
      forceFullRender: options.forceFullRender === true,
      hideUntilRender: options.hideUntilRender === true,
      forceSizeSync: true,
      claimSize: true,
      settlePresentation: true,
    });
    if (session.resizeAckPending && fit.claimSent !== true) {
      const requestedTarget = {
        cols: session.requestedCols,
        rows: session.requestedRows,
        pixelWidth: session.requestedPixelWidth,
        pixelHeight: session.requestedPixelHeight,
      };
      const pendingTargetDiffers = Boolean(
        session.pendingResizeTarget
        && !terminalResizeTargetsMatch(requestedTarget, session.pendingResizeTarget)
      );
      if (session.requestedResizeClaim !== true || pendingTargetDiffers) {
        return queuePendingSizeClaim(session, options);
      }
      return false;
    }
    if (!fit.ok) {
      return claimSize(session, { force: true });
    }
    return fit.claimSent === true;
  };

  const claimTabForCurrentDevice = (tab, options = {}) => {
    if (disposed || !tab) {
      return false;
    }
    syncTabMobilePixelScroll(tab);
    let handled = false;
    for (const session of tab.panes.values()) {
      handled = claimForCurrentDevice(session, options) || handled;
    }
    return handled;
  };

  const claimActiveTabForCurrentDevice = (options = {}) => (
    claimTabForCurrentDevice(getCurrentTab(), options)
  );

  const resizeTabForCurrentDevice = (tab, options = {}) => {
    if (disposed || !tab) {
      return false;
    }
    return scheduleTab(tab, options, { immediate: true });
  };

  const resizeActiveTabForCurrentDevice = (options = {}) => resizeTabForCurrentDevice(getCurrentTab(), options);

  const installSession = (session) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    ownedSessions.add(session);
    registerSessionCleanup(session, () => ownedSessions.delete(session));
    lifecycle.observeHost(session, () => {
      if (session.tabId !== getActiveTabId()) {
        return;
      }
      const rect = session.terminalHost.getBoundingClientRect?.();
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));
      const hadObservedGeometry = Number(session.lastObservedHostWidth || 0) > 0
        && Number(session.lastObservedHostHeight || 0) > 0;
      const geometryChanged = width !== Number(session.lastObservedHostWidth || 0)
        || height !== Number(session.lastObservedHostHeight || 0);
      session.lastObservedHostWidth = width;
      session.lastObservedHostHeight = height;
      if (liveGeometrySessions.has(session)) {
        return;
      }
      const presentationCurrent = presentation()?.isCurrent(session) === true;
      schedulePane(session, {
        forceFullRender: !presentationCurrent || !session.hasPresentedFrame,
        hideUntilRender: !presentationCurrent,
        claimSize: hadObservedGeometry && geometryChanged,
      });
      presentation()?.scheduleFrame(session, geometryChanged ? "resize_observer_geometry" : "resize_observer");
    });
    lifecycle.bindTerminalResize(session, () => {
      if (!isVisible(session)) {
        return;
      }
      resetHostViewport(session, { clean: true });
      positionInput(session);
      updateSelectionHandles(session);
      if (!session.suppressTerminalResizeSend && !liveGeometrySessions.has(session)) {
        sendSize(session);
      }
    });
    return true;
  };

  const handleReplayStart = (session, message) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    const resizeProtocol = String(message?.resize_protocol || "").trim();
    if (resizeProtocol === "epoch-v1") {
      session.resizeEpochSupported = true;
    } else if (session.resizeEpochSupported !== true) {
      session.resizeEpochSupported = false;
      session.resizeAckPending = false;
    }
    const replayResizeEpoch = normalizeTerminalResizeEpoch(message?.resize_epoch);
    if (replayResizeEpoch && !session.resizeAckPending) {
      session.appliedResizeEpoch = replayResizeEpoch;
      session.serverCols = Math.max(0, Math.floor(Number(message?.cols) || 0));
      session.serverRows = Math.max(0, Math.floor(Number(message?.rows) || 0));
      session.serverPixelWidth = Math.max(0, Math.floor(Number(message?.pixel_width) || 0));
      session.serverPixelHeight = Math.max(0, Math.floor(Number(message?.pixel_height) || 0));
      if (session.resizeConnectionTransitionPending) {
        const previousRequestedEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
        session.requestedResizeEpoch = previousRequestedEpoch
          && BigInt(previousRequestedEpoch) > BigInt(replayResizeEpoch)
          ? previousRequestedEpoch
          : replayResizeEpoch;
        session.requestedCols = session.serverCols;
        session.requestedRows = session.serverRows;
        session.requestedPixelWidth = session.serverPixelWidth;
        session.requestedPixelHeight = session.serverPixelHeight;
      }
    }
    const pendingTarget = session.pendingResizeTarget;
    session.resizeConnectionTransitionPending = false;
    if (session.pendingSizeClaim) {
      schedulePendingSizeClaim(session);
    } else if (pendingTarget) {
      session.pendingResizeTarget = null;
      lifecycle.scheduleSessionFrame(session, "connection-pending-resize", () => {
        if (!session.resizeAckPending) {
          sendSize(session, {
            force: true,
            dimensions: pendingTarget,
            claim: pendingTarget.claim === true,
          });
        }
      });
    }
    return true;
  };

  const prepareReplayGeometry = (session, message) => {
    if (disposed || !session || session.closed || !session.term?.wasmTerm?.isRemote) return false;
    const cols = Math.floor(Number(message?.cols) || 0);
    const rows = Math.floor(Number(message?.rows) || 0);
    if (cols < 1 || rows < 1) return false;
    nativeGeometry.cancel(session);
    clearOutputSettle(session);
    clearFence(session, "replay_geometry_start");
    session.replayGeometryPending = true;
    session.replayGeometryLocked = true;
    session.activationFitPending = true;
    // Restore the producer's replay grid before parsing its bytes. The latest
    // local DOM fit is retained as an intent until replay has fully drained.
    nativeGeometry.apply(session, { cols, rows }, () => {
      session.replayGeometryPending = false;
      session.measuredFitGeneration = Number(session.measuredFitGeneration || 0) + 1;
      scheduleOutputFlush(session);
      return true;
    });
    return true;
  };

  const finishExited = (session) => {
    if (disposed || !session || session.closed) return false;
    lifecycle.cancel(session);
    pendingNativeOptions.delete(session);
    clearPendingSizeClaim(session);
    interactiveResizeSessions.delete(session);
    metricsLiveGeometrySessions.delete(session);
    liveGeometrySessions.delete(session);
    const timer = liveGeometryResizeTimers.get(session);
    if (timer) windowObject.clearTimeout(timer);
    liveGeometryResizeTimers.delete(session);
    workScheduler?.cancel(session, "live-geometry");
    session.resizeAckPending = false;
    session.requestedResizeClaim = false;
    session.sizeClaimRequired = false;
    session.sizeClaimed = false;
    // Retire the request rather than pretending the dead PTY acknowledged it.
    // Presentation also compares requested/applied epochs after the ACK flag.
    session.requestedResizeEpoch = normalizeTerminalResizeEpoch(session.appliedResizeEpoch);
    session.requestedCols = session.term?.cols || 0;
    session.requestedRows = session.term?.rows || 0;
    session.pendingResizeTarget = null;
    session.resizeController?.reset();
    clearOutputSettle(session);
    // Preserve already acknowledged output boundaries and in-flight native
    // initialization. Only requests the exited process can never ACK retire.
    if (session.resizeFenceAckReceived) applyFence(session);
    else clearFence(session, "process_exit");
    if (!nativeGeometry.isPending(session) && !session.replayGeometryPending) {
      session.replayGeometryLocked = false;
      session.activationFitPending = false;
    }
    presentation()?.clearRetry(session);
    presentation()?.clearValidation(session);
    scheduleOutputFlush(session);
    return true;
  };

  const observeServerGeometry = (session, paneState) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    if (!session.resizeAckPending) {
      session.serverCols = Math.max(0, Math.floor(Number(paneState?.cols) || 0));
      session.serverRows = Math.max(0, Math.floor(Number(paneState?.rows) || 0));
      session.serverPixelWidth = Math.max(0, Math.floor(Number(paneState?.pixel_width) || 0));
      session.serverPixelHeight = Math.max(0, Math.floor(Number(paneState?.pixel_height) || 0));
    }
    const localSize = size(session);
    session.sizeClaimRequired = terminalSizeDiffersFromServer({
      cols: localSize.cols,
      rows: localSize.rows,
      pixelWidth: localSize.pixelWidth,
      pixelHeight: localSize.pixelHeight,
      serverCols: session.serverCols,
      serverRows: session.serverRows,
      serverPixelWidth: session.serverPixelWidth,
      serverPixelHeight: session.serverPixelHeight,
    });
    recordEvent(session, "resize_server_geometry_observed", {
      ...visualDetails(session),
      source: "workspace_pane_state",
    });
    return true;
  };

  return Object.freeze({
    finishExited,
    snapshot: (session) => Object.freeze({
      connectionEpoch: Number(session?.connectionEpoch || 0),
      requestedResizeEpoch: String(session?.requestedResizeEpoch || ""),
      appliedResizeEpoch: String(session?.appliedResizeEpoch || ""),
      presentedResizeEpoch: String(session?.presentedResizeEpoch || ""),
      cols: Number(session?.term?.cols || 0),
      rows: Number(session?.term?.rows || 0),
      resizeAckPending: session?.resizeAckPending === true,
      resizeFenceActive: session?.resizeFenceActive === true,
      resizeOutputSettleActive: session?.resizeOutputSettleActive === true,
      pendingResizeTarget: Boolean(session?.pendingResizeTarget),
      pendingSizeClaim: session?.pendingSizeClaim === true,
      nativePending: nativeGeometry.isPending(session),
      fenceDrainEntries: session?.resizeFenceDrainRemainingEntries ?? null,
      settleDrainEntries: session?.resizeOutputSettleDrainRemainingEntries ?? null,
      liveGeometryActive: liveGeometrySessions.has(session),
      liveGeometrySourceActive: hasActiveLiveGeometrySource(session),
    }),
    beginConnection,
    normalizeEpoch: normalizeTerminalResizeEpoch,
    size,
    isMeasurable,
    isVisible,
    isLiveGeometryActive: (session) => liveGeometrySessions.has(session),
    isCurrentDeviceClaimRequired: (session) => session?.sizeClaimRequired === true,
    canvasMatchesExpectedSize,
    sendSize,
    resendPendingSize,
    claimSize,
    claimForCurrentDevice,
    claimTabForCurrentDevice,
    claimActiveTabForCurrentDevice,
    reassertSize,
    reassertSizeForMouse,
    resizePane,
    schedulePane,
    schedulePresentationResize,
    cancelPane,
    resizeTab,
    resizeActiveTab,
    beginTabInteractiveResize,
    beginMetricsLiveGeometry,
    endTabInteractiveResize,
    endMetricsLiveGeometry,
    updateTabInteractiveResize,
    updateMetricsLiveGeometry,
    scheduleTabLiveGeometry,
    scheduleTab,
    scheduleVisibleTab,
    scheduleActiveTabWindowResize,
    resizeTabForCurrentDevice,
    resizeActiveTabForCurrentDevice,
    installSession,
    handleOwnerReleased,
    handleApplied,
    handleError,
    handleReplayStart,
    prepareReplayGeometry,
    observeServerGeometry,
    clearOutputSettle,
    scheduleOutputSettle,
    applyFence,
    applyObservedResize,
    transitionState(session) {
      const outputSettleActive = session?.resizeOutputSettleActive === true;
      return Object.freeze({
        outputSettleActive,
        active: outputSettleActive || session?.resizeFenceActive === true,
        blockOutput: Boolean(failedSessions.has(session) || session?.replayGeometryPending || session?.resizeFenceAckReceived || session?.resizeOutputSettleDrainRemainingEntries != null),
      });
    },
    noteOutput(session) {
      return session?.resizeOutputSettleActive === true
        ? scheduleOutputSettle(session, { reason: "output_received" })
        : false;
    },
    cancelTab,
    disposeSession(session) {
      nativeGeometry.cancel(session);
      pendingNativeOptions.delete(session);
      workScheduler?.cancel(session, "live-geometry");
      clearOutputSettle(session);
      clearFence(session);
      interactiveResizeSessions.delete(session);
      metricsLiveGeometrySessions.delete(session);
      liveGeometrySessions.delete(session);
      liveGeometryLastResizeAt.delete(session);
      const resizeTimer = liveGeometryResizeTimers.get(session);
      if (resizeTimer) {
        windowObject.clearTimeout(resizeTimer);
        liveGeometryResizeTimers.delete(session);
      }
      clearPendingSizeClaim(session);
      lifecycle.disposeSession(session);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      nativeGeometry.dispose();
      pendingNativeOptions.clear();
      for (const session of ownedSessions) {
        workScheduler?.cancel(session, "live-geometry");
        clearPendingSizeClaim(session);
        clearOutputSettle(session);
        clearFence(session);
      }
      ownedSessions.clear();
      interactiveResizeSessions.clear();
      metricsLiveGeometrySessions.clear();
      liveGeometrySessions.clear();
      for (const timer of windowLiveResizeTimers.values()) {
        windowObject.clearTimeout(timer);
      }
      windowLiveResizeTimers.clear();
      for (const timer of liveGeometryResizeTimers.values()) {
        windowObject.clearTimeout(timer);
      }
      liveGeometryResizeTimers.clear();
      lifecycle.dispose();
    },
  });
}
