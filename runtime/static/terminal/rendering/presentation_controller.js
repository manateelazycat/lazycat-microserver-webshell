import { createTerminalPresentationLifecycle } from "./presentation_lifecycle.js";
import { createTerminalPresentationView } from "./presentation_view.js";
import { createRenderSnapshot } from "./terminal_render_snapshot.js";

const noop = () => {};

export function createTerminalPresentationController({
  windowObject = globalThis.window,
  workScheduler = null,
  getActiveName = () => "",
  getActiveTabId = () => "",
  getBackground = () => "#000000",
  isReplayCommitted = () => false,
  isReplayCommitPending = () => false,
  isPaneVisible = () => false,
  isPaneMeasurable = () => false,
  isLiveGeometryActive = () => false,
  isCurrentDeviceClaimRequired = () => false,
  isViewportGeometryClaimPending = () => false,
  canvasMatchesExpectedSize = () => false,
  normalizeResizeEpoch = (value) => String(value || ""),
  scheduleResize = () => false,
  retryResize = () => false,
  commitResize = (session) => session?.resizeController?.commit?.(),
  recordEvent = noop,
  isByteIOLogEnabled = () => false,
  onReady = noop,
  onRenderObserved = noop,
  recoverTransport = () => false,
  isSocketOpen = () => false,
  now = () => globalThis.performance?.now?.() || Date.now(),
  registerSessionCleanup = noop,
  activityPollIntervalMs = 4000,
  fullRenderValidationMs = 32,
  presentationValidationMaxMs = 250,
  presentationResizeRetryMs = 1200,
  presentationStallTimeoutMs = 12 * 1000,
  presentationStallReconnectLimit = 2,
  presentationRetryLimit = 8,
  view = createTerminalPresentationView({ windowObject, getBackground }),
  lifecycle = createTerminalPresentationLifecycle({
    windowObject,
    workScheduler,
    registerSessionCleanup,
    isCanvasElement: (value) => view.isCanvasElement(value),
  }),
} = {}) {
  let disposed = false;
  const trace = (session, phase, details = {}) => {
    const sink = windowObject?.__testsAutoPresentationTrace;
    if (!Array.isArray(sink)) {
      return;
    }
    sink.push({
      at: Number(now()) || 0,
      phase,
      pane: String(session?.id || ""),
      renderReady: session?.renderReady === true,
      hasPresentedFrame: session?.hasPresentedFrame === true,
      resizePresentationHold: session?.resizePresentationHold === true,
      terminalFrameHeld: session?.terminalFrameHeld === true,
      fullRenderPending: session?.fullRenderPending === true,
      resizeAckPending: session?.resizeAckPending === true,
      measuredFitGeneration: Number(session?.measuredFitGeneration || 0),
      presentedFitGeneration: Number(session?.presentedFitGeneration || 0),
      terminalContentGeneration: Number(session?.terminalContentGeneration || 0),
      presentedContentGeneration: Number(session?.presentedContentGeneration || 0),
      ...details,
    });
    if (sink.length > 4000) {
      sink.splice(0, sink.length - 4000);
    }
  };

  const isUsable = (session) => Boolean(session && !session.closed && !disposed);
  const isActiveTarget = (session) => String(session?.name || "") === String(getActiveName() || "");

  const renderAllowed = (session) => {
    const liveGeometry = isLiveGeometryActive(session);
    const backend = session?.term?.wasmTerm;
    const backendReady = !backend?.isRemote || (backend.isReady && !session.term.backendResizePending
      && backend.cols === session.term.cols && backend.rows === session.term.rows);
    return Boolean(
      isUsable(session)
      && backendReady
      && isReplayCommitted(session)
      && (liveGeometry || !session.resizeFenceActive)
      && (liveGeometry || !session.resizeAckPending)
      && (liveGeometry || !session.resizeOutputSettleActive)
    );
  };

  const cancelPendingRender = (term) => {
    if (!term) {
      return false;
    }
    const fullRenderRequested = term.renderFullNextFrame === true;
    term.cancelRenderLoop?.();
    if (term.animationFrameId) {
      windowObject.cancelAnimationFrame(term.animationFrameId);
    }
    if (term.renderRetryTimer !== undefined) {
      windowObject.clearTimeout(term.renderRetryTimer);
      term.renderRetryTimer = undefined;
    }
    if (term.renderThrottleTimer !== undefined) {
      windowObject.clearTimeout(term.renderThrottleTimer);
      term.renderThrottleTimer = undefined;
    }
    term.animationFrameId = undefined;
    term.renderFullNextFrame = fullRenderRequested;
    return fullRenderRequested;
  };

  const advanceContentGeneration = (session) => {
    if (!isUsable(session)) {
      return 0;
    }
    session.terminalContentGeneration = Number(session.terminalContentGeneration || 0) + 1;
    session.pendingRenderContentGeneration = session.terminalContentGeneration;
    return session.terminalContentGeneration;
  };

  const presentationGateDetails = (session) => {
    const host = session?.terminalHost;
    const hostRect = host?.getBoundingClientRect?.();
    return {
      documentHidden: windowObject?.document?.hidden === true,
      activeTab: session?.tabId === getActiveTabId(),
      paneVisible: isPaneVisible(session),
      measurable: isPaneMeasurable(session),
      canvasMatches: canvasMatchesExpectedSize(session),
      activationFitPending: session?.activationFitPending === true,
      sizeClaimRequired: isCurrentDeviceClaimRequired(session),
      viewportGeometryClaimPending: isViewportGeometryClaimPending(session),
      sizeClaimed: session?.sizeClaimed === true,
      requestedResizeClaim: session?.requestedResizeClaim === true,
      pendingSizeClaim: session?.pendingSizeClaim === true,
      replayGeometryLocked: session?.replayGeometryLocked === true,
      replayGeometryPending: session?.replayGeometryPending === true,
      backendResizePending: session?.term?.backendResizePending === true,
      workerGeneration: session?.term?.wasmTerm?.generation,
      workerReady: session?.term?.wasmTerm?.isReady,
      frameReady: session?.term?.wasmTerm?.isFrameReady,
      terminalSize: { cols: session?.term?.cols, rows: session?.term?.rows },
      backendSize: { cols: session?.term?.wasmTerm?.cols, rows: session?.term?.wasmTerm?.rows },
      serverSize: { cols: session?.serverCols, rows: session?.serverRows },
      resizeFenceActive: session?.resizeFenceActive === true,
      resizeAckPending: session?.resizeAckPending === true,
      resizeOutputSettleActive: session?.resizeOutputSettleActive === true,
      resizeEpochSupported: session?.resizeEpochSupported === true,
      requestedResizeEpoch: String(session?.requestedResizeEpoch || ""),
      appliedResizeEpoch: String(session?.appliedResizeEpoch || ""),
      presentedResizeEpoch: String(session?.presentedResizeEpoch || ""),
      pendingResizeEpoch: String(session?.pendingResizeEpoch || ""),
      measuredFitGeneration: Number(session?.measuredFitGeneration || 0),
      presentedFitGeneration: Number(session?.presentedFitGeneration || 0),
      terminalReplayGeneration: Number(session?.terminalReplayGeneration || 0),
      presentedReplayGeneration: Number(session?.presentedReplayGeneration || 0),
      terminalContentGeneration: Number(session?.terminalContentGeneration || 0),
      presentedContentGeneration: Number(session?.presentedContentGeneration || 0),
      pendingRenderFitGeneration: Number(session?.pendingRenderFitGeneration || 0),
      pendingRenderReplayGeneration: Number(session?.pendingRenderReplayGeneration || 0),
      historyGeneration: String(session?.historyGeneration || ""),
      presentationHold: session?.resizePresentationHold === true,
      presentationCommitPending: session?.presentationCommitPending === true,
      fullRenderPending: session?.fullRenderPending === true,
      hasPresentedFrame: session?.hasPresentedFrame === true,
      renderReady: session?.renderReady === true,
      hostCssWidth: Number(hostRect?.width || 0),
      hostCssHeight: Number(hostRect?.height || 0),
      retryPending: session?.presentationRetryPending === true,
      retryAttempts: Number(session?.presentationRetryAttempts || 0),
      validationAttempts: Number(session?.presentationValidationAttempts || 0),
      retryExhausted: session?.presentationRetryExhausted === true,
      retryReason: String(session?.presentationRetryReason || ""),
    };
  };

  const canvasDetails = (session) => {
    const describe = (canvas) => {
      if (!view.isCanvasElement(canvas)) {
        return {
          width: 0,
          height: 0,
          cssWidth: 0,
          cssHeight: 0,
          styleWidth: "",
          styleHeight: "",
          hidden: null,
        };
      }
      const rect = canvas.getBoundingClientRect?.();
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
    const renderer = session?.term?.renderer;
    const live = view.canvasForSession(session);
    const hold = session?.terminalFrameHold;
    const hostRect = session?.terminalHost?.getBoundingClientRect?.();
    const localCanvas = live && view.isCanvasElement(live)
      ? { width: Number(live.width || 0), height: Number(live.height || 0) }
      : { width: 0, height: 0 };
    return {
      windowDevicePixelRatio: Number(windowObject?.devicePixelRatio || 1),
      rendererDevicePixelRatio: Number(renderer?.devicePixelRatio || 0),
      visualViewport: {
        width: Number(windowObject?.visualViewport?.width || 0),
        height: Number(windowObject?.visualViewport?.height || 0),
        scale: Number(windowObject?.visualViewport?.scale || 0),
        offsetLeft: Number(windowObject?.visualViewport?.offsetLeft || 0),
        offsetTop: Number(windowObject?.visualViewport?.offsetTop || 0),
      },
      terminal: {
        cols: Number(session?.term?.cols || 0),
        rows: Number(session?.term?.rows || 0),
        fontSize: Number(session?.term?.options?.fontSize || renderer?.fontSize || 0),
      },
      serverGeometry: {
        cols: Number(session?.serverCols || 0),
        rows: Number(session?.serverRows || 0),
        pixelWidth: Number(session?.serverPixelWidth || 0),
        pixelHeight: Number(session?.serverPixelHeight || 0),
      },
      requestedGeometry: {
        cols: Number(session?.requestedCols || 0),
        rows: Number(session?.requestedRows || 0),
        pixelWidth: Number(session?.requestedPixelWidth || 0),
        pixelHeight: Number(session?.requestedPixelHeight || 0),
      },
      resizeEpochs: {
        requested: String(session?.requestedResizeEpoch || ""),
        applied: String(session?.appliedResizeEpoch || ""),
        presented: String(session?.presentedResizeEpoch || ""),
      },
      host: {
        cssWidth: Number(hostRect?.width || 0),
        cssHeight: Number(hostRect?.height || 0),
      },
      localCanvas,
      liveCanvas: describe(view.canvasForSession(session)),
      holdCanvas: describe(hold),
      holdIdentity: session?.terminalFrameHoldIdentity || null,
      terminalFrameHeld: session?.terminalFrameHeld === true,
      resizePresentationHold: session?.resizePresentationHold === true,
    };
  };

  const frameIdentity = (session) => ({
    selector: String(session?.name || "").trim(),
    tabID: String(session?.tabId || "").trim(),
    paneID: String(session?.id || "").trim(),
    workspaceGeneration: String(session?.workspaceGeneration || "").trim(),
    historyGeneration: String(session?.historyGeneration || "").trim(),
  });

  const frameHoldIsCurrent = (session) => {
    const hold = session?.terminalFrameHold;
    if (
      !isUsable(session)
      || session.terminalFrameHeld !== true
      || !session.terminalFrameHoldIdentity
      || !view.isCanvasElement(hold)
      || Number(hold.width || 0) <= 0
      || Number(hold.height || 0) <= 0
    ) {
      return false;
    }
    const held = session.terminalFrameHoldIdentity;
    const current = frameIdentity(session);
    return held.selector === current.selector
      && held.tabID === current.tabID
      && held.paneID === current.paneID
      && held.workspaceGeneration === current.workspaceGeneration
      && held.historyGeneration === current.historyGeneration;
  };

  const holdFrame = (session) => {
    if (!isUsable(session)) {
      return false;
    }
    lifecycle.cancelFrameRelease(session);
    if (!view.holdFrame(session)) {
      return false;
    }
    session.terminalFrameHeld = true;
    session.terminalFrameHoldIdentity = frameIdentity(session);
    view.syncState(session);
    recordEvent(session, "presentation_hold_capture", canvasDetails(session));
    return true;
  };

  const releaseHold = (session) => {
    lifecycle.cancelFrameRelease(session);
    if (!session) {
      return false;
    }
    session.terminalFrameHoldIdentity = null;
    const released = view.releaseFrame(session);
    session.terminalFrameHeld = false;
    view.syncState(session);
    recordEvent(session, "presentation_hold_release", {
      released,
      ...canvasDetails(session),
    });
    return released;
  };

  const scheduleFrameRelease = (session) => {
    const hold = session?.terminalFrameHold;
    if (
      !isUsable(session)
      || session.terminalFrameHeld !== true
      || !view.isCanvasElement(hold)
      || Number(hold.width || 0) <= 0
      || Number(hold.height || 0) <= 0
    ) {
      return false;
    }
    const renderGeneration = Number(session.renderGeneration || 0);
    return lifecycle.scheduleFrameRelease(session, {
      shouldRelease: () => {
        const checks = {
          usable: isUsable(session),
          activeTab: session.tabId === getActiveTabId(),
          renderReady: session.renderReady === true,
          sameRenderGeneration: Number(session.renderGeneration || 0) === renderGeneration,
          noPresentationHold: !session.resizePresentationHold,
          noResizeFence: !session.resizeFenceActive,
          noResizeAck: !session.resizeAckPending,
          noOutputSettle: !session.resizeOutputSettleActive,
          noFullRenderPending: !session.fullRenderPending,
          hasPresentedFrame: session.hasPresentedFrame === true,
          terminalFrameHeld: session.terminalFrameHeld === true,
          holdIdentityCurrent: frameHoldIsCurrent(session),
        };
        const result = Object.values(checks).every(Boolean);
        trace(session, "frame_release_check", { renderGeneration, result, checks });
        return result;
      },
      release: () => releaseHold(session),
    });
  };

  const hasVisibleHeldFrame = (session) => {
    const hold = session?.terminalFrameHold;
    return Boolean(
      session?.terminalFrameHeld === true
      && view.isCanvasElement(hold)
      && hold.hidden === false
      && Number(hold.width || 0) > 0
      && Number(hold.height || 0) > 0
    );
  };

  const setReady = (session, ready, { preserveFrame = true, reason = "presentation_state" } = {}) => {
    trace(session, "set_ready_enter", { ready: ready === true, preserveFrame, reason });
    if (!isUsable(session) || !session.shellEl) {
      return false;
    }
    const nextReady = ready === true;
    if (!nextReady) {
      lifecycle.cancelFrameRelease(session);
      if (preserveFrame && session.hasPresentedFrame && !hasVisibleHeldFrame(session)) {
        holdFrame(session);
      }
    }
    const previousReady = session.renderReady === true;
    const becameReady = nextReady && !previousReady;
    session.renderReady = nextReady;
    session.presentationPending = !nextReady;
    view.syncState(session);
    if (previousReady !== nextReady) {
      recordEvent(session, "presentation_ready_state", {
        ready: nextReady,
        reason: String(reason || "presentation_state"),
        ...presentationGateDetails(session),
        ...canvasDetails(session),
      });
    }
    if (nextReady) {
      scheduleFrameRelease(session);
      onReady(session, { becameReady });
    }
    trace(session, "set_ready_exit", { ready: nextReady, becameReady, reason });
    return true;
  };

  const beginHold = (session, { capture = true, recapture = false } = {}) => {
    trace(session, "begin_hold_enter", { capture, recapture });
    if (!isUsable(session)) {
      return false;
    }
    // Several schedulers can observe one resize/replay transaction in the
    // same frame. Reuse its active hold instead of toggling canvases again.
    if (session.resizePresentationHold && !session.renderReady) {
      if (capture && (recapture || (session.hasPresentedFrame && !hasVisibleHeldFrame(session)))) {
        if (!holdFrame(session)) {
          recordEvent(session, "presentation_hold_unavailable", { capture, recapture });
          trace(session, "begin_hold_unavailable", { capture, recapture, reused: true });
          return false;
        }
      }
      cancelPendingRender(session.term);
      trace(session, "begin_hold_reused", { capture, recapture });
      return true;
    }
    lifecycle.cancelFrameRelease(session);
    if (capture && session.hasPresentedFrame && !hasVisibleHeldFrame(session) && !holdFrame(session)) {
      recordEvent(session, "presentation_hold_unavailable", { capture });
      trace(session, "begin_hold_unavailable", { capture, reused: false });
      return false;
    }
    session.presentationCommitPending = false;
    session.presentationRetryAttempts = 0;
    session.presentationRetryExhausted = false;
    session.resizePresentationHold = true;
    recordEvent(session, "presentation_hold", canvasDetails(session));
    setReady(session, false, { preserveFrame: capture, reason: "presentation_hold" });
    cancelPendingRender(session.term);
    trace(session, "begin_hold_exit", { capture });
    return true;
  };

  const cancelHold = (session, { restoreReady = false, releaseFrame = false } = {}) => {
    if (!session || disposed) {
      return false;
    }
    session.presentationCommitPending = false;
    session.resizePresentationHold = false;
    recordEvent(session, "presentation_hold_cancel", {
      restoreReady,
      releaseFrame,
      ...canvasDetails(session),
    });
    const canRestore = restoreReady && session.hasPresentedFrame && renderAllowed(session)
      && isPaneVisible(session) && isPaneMeasurable(session) && canvasMatchesExpectedSize(session)
      && !session.fullRenderPending
      && session.presentedFitGeneration === session.measuredFitGeneration
      && session.presentedReplayGeneration === session.terminalReplayGeneration
      && session.presentedContentGeneration === session.terminalContentGeneration;
    if (releaseFrame && canRestore) {
      releaseHold(session);
    }
    if (canRestore) {
      setReady(session, true, { reason: "cancel_hold_restore" });
    }
    return true;
  };

  const stateIsCurrent = (session) => {
    if (
      !isUsable(session)
      || !session.renderSnapshot
      || !session.renderReady
      || (session.resizeAckPending && !isLiveGeometryActive(session))
    ) {
      return false;
    }
    const current = createRenderSnapshot(session);
    return session.renderSnapshot.equals(current)
      && Number(session.measuredFitGeneration || 0) > 0
      && session.presentedFitGeneration === session.measuredFitGeneration
      && session.presentedReplayGeneration === session.terminalReplayGeneration
      && session.presentedContentGeneration === session.terminalContentGeneration
      && (!session.appliedResizeEpoch || session.presentedResizeEpoch === session.appliedResizeEpoch);
  };

  function isCurrent(session) {
    return stateIsCurrent(session)
      && isPaneMeasurable(session)
      && canvasMatchesExpectedSize(session);
  }

  // A presentation can be stale because terminal content or resize metadata
  // changed while its geometry stayed identical.  Those updates are rendered
  // directly on the live canvas; only a real geometry/replay transition needs
  // the hold overlay that preserves the previous frame during canvas changes.
  const localGeometry = (session) => {
    const canvas = session?.term?.canvas || session?.term?.renderer?.getCanvas?.();
    return {
      cols: Math.max(0, Math.floor(Number(session?.term?.cols) || 0)),
      rows: Math.max(0, Math.floor(Number(session?.term?.rows) || 0)),
      pixelWidth: Math.max(0, Math.floor(Number(canvas?.width) || 0)),
      pixelHeight: Math.max(0, Math.floor(Number(canvas?.height) || 0)),
    };
  };

  const resizeTargetMatchesLocalGeometry = (session, target) => {
    if (!target) {
      return false;
    }
    const local = localGeometry(session);
    const targetCols = Math.max(0, Math.floor(Number(target.cols) || 0));
    const targetRows = Math.max(0, Math.floor(Number(target.rows) || 0));
    if (
      targetCols > 0
      && local.cols > 0
      && targetCols !== local.cols
    ) {
      return false;
    }
    if (
      targetRows > 0
      && local.rows > 0
      && targetRows !== local.rows
    ) {
      return false;
    }
    const targetPixelWidth = Math.max(0, Math.floor(Number(target.pixelWidth) || 0));
    const targetPixelHeight = Math.max(0, Math.floor(Number(target.pixelHeight) || 0));
    return !(
      targetPixelWidth > 0
      && local.pixelWidth > 0
      && targetPixelWidth !== local.pixelWidth
    ) && !(
      targetPixelHeight > 0
      && local.pixelHeight > 0
      && targetPixelHeight !== local.pixelHeight
    );
  };

  const presentationRequiresHold = (session) => {
    if (!session?.hasPresentedFrame) {
      return false;
    }
    if (isLiveGeometryActive(session)) {
      return false;
    }
    // terminalFrameHeld remains true for the two-paint release grace period
    // after a successful commit. It is not a new invalidation reason.
    if (session.resizePresentationHold) {
      return true;
    }
    if (session.activationFitPending || !canvasMatchesExpectedSize(session)) {
      return true;
    }
    if (
      Number(session.presentedFitGeneration || 0)
      !== Number(session.measuredFitGeneration || 0)
    ) {
      return true;
    }
    if (
      Number(session.presentedReplayGeneration || 0)
      !== Number(session.terminalReplayGeneration || 0)
    ) {
      return true;
    }
    if (session.resizeFenceActive) {
      const target = session.resizeFenceTarget;
      if (!resizeTargetMatchesLocalGeometry(session, target)) {
        return true;
      }
    }
    if (session.resizeAckPending) {
      const target = {
        cols: session.requestedCols,
        rows: session.requestedRows,
        pixelWidth: session.requestedPixelWidth,
        pixelHeight: session.requestedPixelHeight,
      };
      if (!resizeTargetMatchesLocalGeometry(session, target)) {
        return true;
      }
    }
    if (session.resizeOutputSettleActive) {
      const target = session.resizeFenceTarget || {
        cols: session.requestedCols,
        rows: session.requestedRows,
        pixelWidth: session.requestedPixelWidth,
        pixelHeight: session.requestedPixelHeight,
      };
      if (!resizeTargetMatchesLocalGeometry(session, target)) {
        return true;
      }
    }
    return false;
  };

  const markSyncPending = (session) => {
    if (!isUsable(session)) {
      return false;
    }
    setReady(session, false, { reason: "sync_pending" });
    session.fullRenderPending = false;
    session.pendingRenderFitGeneration = 0;
    session.pendingRenderReplayGeneration = 0;
    session.pendingRenderContentGeneration = 0;
    return true;
  };

  const invalidate = (session) => {
    if (!markSyncPending(session)) {
      return false;
    }
    session.hasPresentedFrame = false;
    view.syncState(session);
    releaseHold(session);
    session.term?.renderer?.clear?.();
    view.clearCanvas(session);
    return true;
  };

  const clearValidation = (session) => lifecycle.clearTimeoutField(session, "fullRenderValidationTimer");

  const clearRetry = (session) => {
    if (!session) {
      return false;
    }
    lifecycle.clearTimeoutField(session, "presentationRetryTimer");
    session.presentationRetryPending = false;
    session.presentationRetryReason = "";
    view.syncState(session);
    return true;
  };

  const commitIfReady = (session) => {
    trace(session, "commit_if_ready_enter");
    if (
      !isUsable(session)
      || Number(session.measuredFitGeneration || 0) <= 0
      || !isPaneMeasurable(session)
      || !canvasMatchesExpectedSize(session)
      || !renderAllowed(session)
      || (session.resizePresentationHold && !session.presentationCommitPending)
    ) {
      return false;
    }
    if (session.resizeEpochSupported === true && !isLiveGeometryActive(session)) {
      const requestedResizeEpoch = normalizeResizeEpoch(session.requestedResizeEpoch);
      const appliedResizeEpoch = normalizeResizeEpoch(session.appliedResizeEpoch);
      if (requestedResizeEpoch && requestedResizeEpoch !== appliedResizeEpoch) {
        return false;
      }
    }
    if (
      !session.fullRenderPending
      || session.activationFitPending
      || isReplayCommitPending(session)
      || session.pendingRenderFitGeneration !== session.measuredFitGeneration
      || session.pendingRenderReplayGeneration !== session.terminalReplayGeneration
      || session.pendingRenderContentGeneration !== session.terminalContentGeneration
    ) {
      return false;
    }
    session.fullRenderPending = false;
    if (["ready", "applied"].includes(session.resizeController?.phase)) {
      commitResize(session);
    }
    session.presentedFitGeneration = session.measuredFitGeneration;
    session.presentedReplayGeneration = session.terminalReplayGeneration;
    session.presentedResizeEpoch = normalizeResizeEpoch(session.appliedResizeEpoch)
      || normalizeResizeEpoch(session.requestedResizeEpoch)
      || session.presentedResizeEpoch;
    session.hasPresentedFrame = true;
    session.renderGeneration = Number(session.renderGeneration || 0) + 1;
    session.renderSnapshot = createRenderSnapshot(session, { presented: true });
    session.presentedHistoryCursor = session.appliedHistoryCursor;
    session.presentationValidationAttempts = 0;
    session.presentationDeferredReason = "";
    session.presentationStallStartedAt = 0;
    session.presentationStallLastAttemptAt = 0;
    session.presentationRetryAttempts = 0;
    session.presentationRetryExhausted = false;
    clearValidation(session);
    clearRetry(session);
    const liveGeometry = isLiveGeometryActive(session);
    if (!liveGeometry) {
      recordEvent(session, "full_render_complete", canvasDetails(session));
    }
    if (session.presentationCommitPending && session.resizePresentationHold) {
      session.presentationCommitPending = false;
      session.resizePresentationHold = false;
    }
    view.syncState(session);
    if (!session.renderReady && !session.resizePresentationHold) {
      setReady(session, true, { reason: "render_commit" });
    }
    // A hold can outlive the first commit when validation/content renders run
    // while renderReady is already true. Re-arm the release fence for every
    // successful commit so a newer render generation cannot strand the old
    // overlay indefinitely.
    if (session.renderReady && session.terminalFrameHeld && !session.resizePresentationHold) {
      scheduleFrameRelease(session);
    }
    if (!liveGeometry) {
      recordEvent(session, "presentation_commit_complete", {
        renderGeneration: session.renderGeneration,
        ...canvasDetails(session),
      });
    }
    trace(session, "commit_if_ready_success", { renderGeneration: session.renderGeneration });
    return true;
  };

  const markRendered = (session) => {
    if (!isUsable(session)) {
      return false;
    }
    if (session.pendingRenderContentGeneration === session.terminalContentGeneration) {
      session.presentedContentGeneration = session.terminalContentGeneration;
    }
    return commitIfReady(session);
  };

  const setPendingRender = (session) => {
    session.fullRenderPending = true;
    session.pendingRenderFitGeneration = session.measuredFitGeneration;
    session.pendingRenderReplayGeneration = session.terminalReplayGeneration;
    session.pendingRenderContentGeneration = session.terminalContentGeneration;
  };

  const requestFullRender = (session) => {
    if (!isUsable(session) || !session.term) {
      return false;
    }
    setPendingRender(session);
    if (!renderAllowed(session)) {
      recordEvent(session, "render_blocked", {
        reason: isReplayCommitted(session) ? "resize" : "replay",
        ...presentationGateDetails(session),
      });
      return false;
    }
    recordEvent(session, "full_render_request");
    session.term.requestRender?.({ full: true });
    return true;
  };

  const renderFullNow = (session) => {
    if (workScheduler && (!workScheduler.isRunning() || workScheduler.remainingMs() <= 0)) {
      scheduleFrame(session, "budgeted_full_render", { forceHistory: false });
      return false;
    }
    trace(session, "render_full_enter");
    const term = session?.term;
    if (!isUsable(session) || !term || typeof term.renderNow !== "function") {
      requestFullRender(session);
      return false;
    }
    if (!renderAllowed(session)) {
      setPendingRender(session);
      recordEvent(session, "render_blocked", {
        reason: isReplayCommitted(session) ? "resize" : "replay",
        ...presentationGateDetails(session),
      });
      return false;
    }
    if (term.wasmTerm?.isRemote && !term.wasmTerm.isFrameReady) {
      setPendingRender(session);
      term.wasmTerm.getViewport();
      return false;
    }
    cancelPendingRender(term);
    setPendingRender(session);
    term.renderFullNextFrame = false;
    recordEvent(session, "full_render_start");
    const drawAt = isByteIOLogEnabled() ? now() : null;
    const rendered = term.renderNow(true) !== false;
    if (drawAt !== null) recordEvent(session, "byte_io_render", { renderCallMs: now() - drawAt, rendered });
    trace(session, "render_full_after", { rendered });
    if (rendered) {
      recordEvent(session, "presentation_render_start");
    } else {
      recordEvent(session, "presentation_render_failed");
      recordEvent(session, "full_render_failed");
      scheduleRetry(session, { reason: "render_failed", forceHistory: true });
    }
    return rendered;
  };

  const renderLiveGeometryNow = (session) => {
    const term = session?.term;
    if (
      !isUsable(session)
      || !isLiveGeometryActive(session)
      || !term
      || typeof term.renderNow !== "function"
      || !renderAllowed(session)
    ) {
      return false;
    }
    cancelPendingRender(term);
    setPendingRender(session);
    term.renderFullNextFrame = false;
    return term.renderNow(true) !== false;
  };

  const commitNow = (session) => {
    if (!isUsable(session) || !session.term || !session.resizePresentationHold || !session.hasPresentedFrame) {
      return false;
    }
    session.presentationCommitPending = true;
    renderFullNow(session);
    return true;
  };

  const defer = (session, reason = "hidden") => {
    if (!isUsable(session)) {
      return false;
    }
    setReady(session, false, { reason: `deferred:${reason}` });
    cancelPendingRender(session.term);
    session.fullRenderPending = false;
    session.pendingRenderFitGeneration = 0;
    session.pendingRenderReplayGeneration = 0;
    session.pendingRenderContentGeneration = 0;
    if (session.presentationDeferredReason !== reason) {
      session.presentationDeferredReason = reason;
      recordEvent(session, "presentation_deferred", {
        reason,
        ...presentationGateDetails(session),
      });
    }
    return true;
  };

  const deferHiddenRender = (session) => {
    if (!isUsable(session) || !session.term || isPaneVisible(session)) {
      return false;
    }
    cancelPendingRender(session.term);
    return true;
  };

  const retryPendingResize = (session, reason) => {
    if (
      session?.exitExpected
      || !session?.resizeAckPending
      || !isUsable(session)
      || !isSocketOpen(session)
      || now() - Number(session.lastResizeRequestAt || 0) < presentationResizeRetryMs
    ) {
      return false;
    }
    const target = session.resizeFenceTarget || {
      cols: session.requestedCols,
      rows: session.requestedRows,
      pixelWidth: session.requestedPixelWidth,
      pixelHeight: session.requestedPixelHeight,
    };
    if (Number(target.cols || 0) <= 0 || Number(target.rows || 0) <= 0) {
      return false;
    }
    const sent = retryResize(session, { dimensions: target });
    if (sent) {
      recordEvent(session, "resize_fence_retry", { reason });
    }
    return sent;
  };

  const ensure = (session, {
    reason = "presentation_check",
    forceHistory = false,
    scheduleValidation: shouldScheduleValidation = true,
  } = {}) => {
    trace(session, "ensure_enter", { reason, forceHistory, scheduleValidation: shouldScheduleValidation });
    if (!isUsable(session) || !isReplayCommitted(session) || !isActiveTarget(session)) {
      return false;
    }
    if (!isPaneVisible(session) || !isPaneMeasurable(session)) {
      defer(session, `${reason}:hidden`);
      scheduleRetry(session, { reason: `${reason}:hidden`, forceHistory });
      return false;
    }
    if (isLiveGeometryActive(session) && session.resizeAckPending) {
      retryPendingResize(session, reason);
    }
    const needsHold = presentationRequiresHold(session);
    if (needsHold) {
      if (!session.resizePresentationHold) {
        beginHold(session);
      }
    } else if (!session.hasPresentedFrame) {
      // A first frame has no last-known-good canvas to preserve.
      setReady(session, false, { preserveFrame: false, reason: "presentation_first_frame" });
    }
    session.presentationDeferredReason = "";
    if (
      !isLiveGeometryActive(session)
      && (session.resizeFenceActive || session.resizeAckPending || session.resizeOutputSettleActive)
    ) {
      retryPendingResize(session, reason);
      recordEvent(session, "presentation_wait_resize", {
        reason,
        ...presentationGateDetails(session),
      });
      if (shouldScheduleValidation) {
        scheduleValidation(session, { forceHistory });
      }
      scheduleRetry(session, { reason: `${reason}:resize`, forceHistory });
      return false;
    }
    if (session.activationFitPending || !canvasMatchesExpectedSize(session)) {
      // A follower can present the server grid without owning PTY geometry.
      if (isViewportGeometryClaimPending(session)) {
        recordEvent(session, "presentation_wait_current_device_claim", {
          reason,
          ...presentationGateDetails(session),
        });
        if (shouldScheduleValidation) {
          scheduleValidation(session, { forceHistory });
        }
        scheduleRetry(session, { reason: `${reason}:viewport_geometry`, forceHistory });
        return false;
      }
      scheduleResize(session, {
        forceFullRender: true,
        hideUntilRender: true,
      }, { immediate: true });
      recordEvent(session, "presentation_wait_geometry", {
        reason,
        ...presentationGateDetails(session),
      });
      if (shouldScheduleValidation) {
        scheduleValidation(session, { forceHistory });
      }
      scheduleRetry(session, { reason: `${reason}:geometry`, forceHistory });
      return false;
    }
    requestFullRender(session);
    if (session.hasPresentedFrame && session.resizePresentationHold) {
      commitNow(session);
    } else {
      if (session.resizePresentationHold) {
        cancelHold(session);
      }
      renderFullNow(session);
    }
    recordEvent(session, "presentation_ensure", {
      reason,
      ...presentationGateDetails(session),
    });
    if (shouldScheduleValidation) {
      scheduleValidation(session, { forceHistory });
    }
    if (!isCurrent(session)) {
      scheduleRetry(session, { reason, forceHistory });
    }
    return true;
  };

  const scheduleFrame = (session, reason = "presentation_frame", {
    forceHistory = true,
    scheduleValidation: shouldScheduleValidation = true,
  } = {}) => lifecycle.schedulePresentationFrame(
    session,
    reason,
    (frameReason) => {
      if (!isUsable(session) || !isActiveTarget(session)) {
        return;
      }
      ensure(session, {
        reason: frameReason,
        forceHistory,
        scheduleValidation: shouldScheduleValidation,
      });
    },
  );

  const scheduleValidation = (session, { forceHistory = false } = {}) => {
    if (
      !isUsable(session)
      || !isReplayCommitted(session)
      || isLiveGeometryActive(session)
      || !isPaneVisible(session)
      || (!forceHistory && isCurrent(session))
    ) {
      return false;
    }
    clearValidation(session);
    const replayGeneration = Number(session.terminalReplayGeneration || 0);
    const validationAttempt = Math.max(0, Number(session.presentationValidationAttempts || 0));
    const validationDelay = Math.min(
      presentationValidationMaxMs,
      fullRenderValidationMs * (2 ** Math.min(validationAttempt, 4)),
    );
    return lifecycle.scheduleTimeoutField(session, "fullRenderValidationTimer", validationDelay, () => {
      session.presentationValidationAttempts = validationAttempt + 1;
      if (!isUsable(session) || !isReplayCommitted(session)) {
        return;
      }
      if (Number(session.terminalReplayGeneration || 0) !== replayGeneration) {
        return;
      }
      const scrollbackLength = Math.max(0, Number(session.term?.getScrollbackLength?.() || 0));
      const blockedByResize = session.resizeFenceActive
        || session.resizeAckPending
        || session.resizeOutputSettleActive;
      if (forceHistory && scrollbackLength > 0 && !blockedByResize && isPaneVisible(session)) {
        ensure(session, {
          reason: "history_validation",
          forceHistory: true,
          scheduleValidation: false,
        });
        scheduleFrame(session, "history_validation_frame", { scheduleValidation: false });
      } else {
        ensure(session, {
          reason: isPaneVisible(session) ? "presentation_validation" : "presentation_wait_measure",
          forceHistory,
          scheduleValidation: false,
        });
      }
      if (!isCurrent(session)) {
        scheduleValidation(session, { forceHistory });
      }
    });
  };

  const scheduleRetry = (session, {
    reason = "presentation_retry",
    forceHistory = true,
  } = {}) => {
    if (
      !isUsable(session)
      || !isReplayCommitted(session)
      || !isActiveTarget(session)
      || isLiveGeometryActive(session)
      || !isPaneVisible(session)
      || isCurrent(session)
    ) {
      return false;
    }
    session.presentationRetryReason = String(reason || "presentation_retry");
    if (session.presentationRetryPending) {
      return true;
    }
    const retryAttempt = Number(session.presentationRetryAttempts || 0) + 1;
    if (retryAttempt > Math.max(1, Number(presentationRetryLimit) || 1)) {
      session.presentationRetryAttempts = retryAttempt;
      session.presentationRetryExhausted = true;
      recordEvent(session, "presentation_retry_exhausted", {
        reason: session.presentationRetryReason,
        attempts: retryAttempt,
        limit: Math.max(1, Number(presentationRetryLimit) || 1),
        ...presentationGateDetails(session),
      });
      return false;
    }
    session.presentationRetryAttempts = retryAttempt;
    session.presentationRetryExhausted = false;
    session.presentationRetryPending = true;
    view.syncState(session);
    const replayGeneration = Number(session.terminalReplayGeneration || 0);
    const connectionEpoch = Number(session.connectionEpoch || 0);
    const delay = Math.min(
      presentationValidationMaxMs,
      fullRenderValidationMs * (2 ** Math.min(Number(session.presentationValidationAttempts || 0), 4)),
    );
    return lifecycle.scheduleTimeoutField(session, "presentationRetryTimer", delay, () => {
      session.presentationRetryPending = false;
      view.syncState(session);
      if (
        !isUsable(session)
        || !isActiveTarget(session)
        || !isReplayCommitted(session)
        || Number(session.terminalReplayGeneration || 0) !== replayGeneration
        || Number(session.connectionEpoch || 0) !== connectionEpoch
      ) {
        return;
      }
      recordEvent(session, "presentation_retry_scheduled", {
        reason: session.presentationRetryReason || reason,
        delay,
        ...presentationGateDetails(session),
      });
      scheduleFrame(session, `retry:${session.presentationRetryReason || reason}`);
      if (isPaneVisible(session) && isPaneMeasurable(session) && !isCurrent(session)) {
        scheduleValidation(session, { forceHistory });
      }
    });
  };

  const recoverStalled = (session, now = Date.now()) => {
    if (
      session?.exitExpected
      || !isUsable(session)
      || !isActiveTarget(session)
      || session.tabId !== getActiveTabId()
      || !isReplayCommitted(session)
      || !isPaneVisible(session)
    ) {
      if (session) {
        session.presentationStallStartedAt = 0;
        session.presentationStallLastAttemptAt = 0;
      }
      return false;
    }
    const liveGeometryAckPending = isLiveGeometryActive(session) && session.resizeAckPending;
    if (isCurrent(session) && !liveGeometryAckPending) {
      session.presentationStallStartedAt = 0;
      session.presentationStallLastAttemptAt = 0;
      session.presentationStallReconnectAttempts = 0;
      return false;
    }
    if (Number(session.presentationStallStartedAt || 0) <= 0) {
      session.presentationStallStartedAt = now;
    }
    if (now - Number(session.presentationStallLastAttemptAt || 0) >= activityPollIntervalMs) {
      session.presentationStallLastAttemptAt = now;
      recordEvent(session, "presentation_watchdog_probe");
      ensure(session, { reason: "presentation_watchdog", forceHistory: true });
    }
    if (
      now - Number(session.presentationStallStartedAt || now) < presentationStallTimeoutMs
      || !isSocketOpen(session)
      || Number(session.presentationStallReconnectAttempts || 0) >= presentationStallReconnectLimit
    ) {
      return true;
    }
    session.presentationStallStartedAt = 0;
    session.presentationStallReconnectAttempts = Number(session.presentationStallReconnectAttempts || 0) + 1;
    recordEvent(session, "presentation_watchdog_resync", {
      attempt: session.presentationStallReconnectAttempts,
    });
    recoverTransport(session, "presentation stalled after replay commit", { immediate: true });
    return true;
  };

  const recoverSessions = (sessions, now = Date.now()) => {
    for (const session of sessions || []) {
      recoverStalled(session, now);
    }
  };

  const installSession = (session) => {
    if (workScheduler && session?.term) {
      const term = session.term;
      term.cancelRenderLoop?.();
      term.scheduleRender = (callback) => workScheduler.schedule(session, "render", () => {
        if (!isUsable(session) || !isPaneVisible(session) || !renderAllowed(session)) {
          term.cancelRenderLoop?.();
          return;
        }
        callback();
      }, { priority: () => session.tabId === getActiveTabId() ? 2 : 0 });
      term.cancelScheduledRender = () => workScheduler.cancel(session, "render");
      registerSessionCleanup(session, () => {
        term.cancelRenderLoop?.();
        term.scheduleRender = undefined;
        term.cancelScheduledRender = undefined;
      });
    }
    return lifecycle.installSession(session, {
    onContextLost: (event) => {
      event?.preventDefault?.();
      setReady(session, false, { reason: "context_lost" });
      session.fullRenderPending = false;
      session.pendingRenderFitGeneration = 0;
      session.pendingRenderReplayGeneration = 0;
      scheduleRetry(session, { reason: "context_lost" });
    },
    onContextRestored: () => {
      if (isUsable(session)) {
        scheduleRetry(session, { reason: "context_restored" });
      }
    },
    onRender: () => {
      // Ghostty output renders are already complete live frames. During an
      // optimistic geometry transaction, accept that frame into the current
      // presentation snapshot instead of scheduling a second full render for
      // the same content generation.
      if (isLiveGeometryActive(session) && !session.fullRenderPending) {
        setPendingRender(session);
      }
      const completed = markRendered(session);
      if (
        !completed
        && isReplayCommitted(session)
        && session.tabId === getActiveTabId()
        && !isCurrent(session)
      ) {
        scheduleFrame(session, "render_callback");
      }
      onRenderObserved(session);
    },
    });
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
    advanceContentGeneration,
    beginHold,
    cancelFrameRelease: lifecycle.cancelFrameRelease,
    scheduleFrameRelease,
    cancelHold,
    cancelPendingRender,
    clearCanvas: (session) => view.clearCanvas(session),
    clearRetry,
    clearValidation,
    commitNow,
    deferHiddenRender,
    dispose,
    frameHoldIsCurrent,
    holdFrame,
    ensure,
    installSession,
    invalidate,
    isCurrent,
    isRenderAllowed: renderAllowed,
    markSyncPending,
    recoverSessions,
    recoverStalled,
    releaseHold,
    renderFullNow,
    renderLiveGeometryNow,
    requestFullRender,
    scheduleFrame,
    scheduleRetry,
    scheduleValidation,
    setReady,
    stateIsCurrent,
  });
}
