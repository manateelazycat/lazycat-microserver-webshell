const rounded = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const rectOf = (element) => {
  const rect = element?.getBoundingClientRect?.();
  return rect ? Object.fromEntries(["x", "y", "width", "height", "top", "bottom", "left", "right"]
    .map((key) => [key, rounded(rect[key])])) : null;
};

// Passive observer. Do not call getViewport(), resize(), or presentation repair.
export function createTerminalRenderProbe({ windowObject = globalThis.window,
  documentObject = globalThis.document, presentation, resize } = {}) {
  let sampleCanvas = null;
  let disposed = false;
  const describe = (element) => {
    if (!element) return null;
    const style = windowObject.getComputedStyle(element);
    return {
      connected: element.isConnected, hidden: element.hidden, rect: rectOf(element),
      width: element.width, height: element.height, scrollTop: rounded(element.scrollTop),
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      transform: style.transform, overflow: style.overflow, clipPath: style.clipPath,
      cssWidth: style.width, cssHeight: style.height,
    };
  };
  const pixels = (canvas) => {
    if (!canvas?.width || !canvas?.height) return { status: "empty_canvas" };
    try {
      sampleCanvas ||= documentObject.createElement("canvas");
      sampleCanvas.width = sampleCanvas.height = 64;
      const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { status: "context_unavailable" };
      ctx.drawImage(canvas, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      const bands = [];
      for (let band = 0; band < 4; band += 1) {
        let transparent = 0, dark = 0;
        const colors = new Map();
        for (let index = band * 1024; index < (band + 1) * 1024; index += 1) {
          const p = index * 4;
          if (data[p + 3] === 0) transparent += 1;
          else if (Math.max(data[p], data[p + 1], data[p + 2]) < 16) dark += 1;
          const key = [data[p], data[p + 1], data[p + 2], data[p + 3]].map((v) => v >> 4).join(",");
          colors.set(key, (colors.get(key) || 0) + 1);
        }
        bands.push({ band, pixels: 1024, transparent, dark, colorBuckets: colors.size,
          dominantPixels: Math.max(...colors.values()) });
      }
      return { status: "sampled", width: 64, height: 64, bands };
    } catch (error) {
      return { status: "unavailable", error: error?.name || "readback_failed" };
    }
  };
  return Object.freeze({
    capture(session, { includePixels = false } = {}) {
      if (disposed) return { pane: session.id, status: "probe_disposed" };
      const term = session.term;
      const canvas = term?.canvas || term?.renderer?.getCanvas?.();
      const host = session.terminalHost;
      const ancestors = [];
      for (let node = canvas?.parentElement; node && ancestors.length < 8; node = node.parentElement) {
        ancestors.push({ tag: node.tagName, id: node.id, className: String(node.className), ...describe(node) });
        if (node === documentObject.body) break;
      }
      const state = {
        pane: session.id, tab: session.tabId, target: session.name, closed: session.closed,
        connection: session.connectionEpoch, history: session.historyGeneration,
        receivedCursor: String(session.receivedHistoryCursor ?? ""),
        appliedCursor: String(session.appliedHistoryCursor ?? ""),
        presentedCursor: String(session.presentedHistoryCursor ?? ""),
        outputQueueBytes: session.outputQueueSize || 0, outputQueueEntries: session.outputQueue?.length || 0,
        queuedAck: Boolean(session.pendingQueueTurnAck),
        input: { pendingBytes: session.pendingInputSize || 0, bufferedBytes: session.inputBufferSize || 0,
          queuedBytes: session.inputQueueSize || 0, flushScheduled: Boolean(session.inputFlushTimer),
          pumpScheduled: Boolean(session.inputPumpTimer), sizeClaimRequired: session.sizeClaimRequired,
          sizeClaimed: session.sizeClaimed, pendingSizeClaim: session.pendingSizeClaim },
        renderReady: session.renderReady, hasPresentedFrame: session.hasPresentedFrame,
        presentationCurrent: presentation?.isCurrent(session) === true,
        renderAllowed: presentation?.isRenderAllowed(session) === true,
        measurable: resize?.isMeasurable(session) === true,
        canvasMatches: resize?.canvasMatchesExpectedSize(session) === true,
        renderGeneration: session.renderGeneration, contentGeneration: session.terminalContentGeneration,
        presentedContentGeneration: session.presentedContentGeneration,
        fitGeneration: session.measuredFitGeneration, presentedFitGeneration: session.presentedFitGeneration,
        replayGeneration: session.terminalReplayGeneration, presentedReplayGeneration: session.presentedReplayGeneration,
        replayComplete: session.replayComplete, replayVerified: session.replayVerified,
        fullRenderPending: session.fullRenderPending, commitPending: session.presentationCommitPending,
        activationFitPending: session.activationFitPending,
        resizeAckPending: session.resizeAckPending, resizeFenceActive: session.resizeFenceActive,
        resizeOutputSettleActive: session.resizeOutputSettleActive,
        requestedResizeEpoch: session.requestedResizeEpoch, appliedResizeEpoch: session.appliedResizeEpoch,
        presentedResizeEpoch: session.presentedResizeEpoch,
        resizePresentationHold: session.resizePresentationHold, terminalFrameHeld: session.terminalFrameHeld,
        retryAttempts: session.presentationRetryAttempts, retryExhausted: session.presentationRetryExhausted,
        retryReason: session.presentationDeferredReason,
        terminal: { cols: term?.cols, rows: term?.rows, viewportY: term?.viewportY,
          targetViewportY: term?.targetViewportY, backendResizePending: term?.backendResizePending,
          renderSuppressionDepth: term?.renderSuppressionDepth,
          metrics: { width: term?.renderer?.metrics?.width, height: term?.renderer?.metrics?.height },
          rendererDPR: term?.renderer?.devicePixelRatio,
          imagePlacements: term?.__kittyGraphics?.getPlacements?.().length || 0 },
        server: { cols: session.serverCols, rows: session.serverRows },
        backend: term?.wasmTerm?.getRenderDiagnostics?.(term.viewportY) || { status: "unsupported" },
        host: describe(host), canvas: describe(canvas), holdCanvas: describe(session.terminalFrameHold), ancestors,
      };
      if (includePixels) {
        const renderer = term?.renderer;
        const ctx = renderer?.ctx, transform = ctx?.getTransform?.();
        state.canvasDrawingState = { font: ctx?.font, cachedFont: renderer?.lastRenderFont,
          textAlign: ctx?.textAlign, textBaseline: ctx?.textBaseline, globalAlpha: ctx?.globalAlpha,
          composite: ctx?.globalCompositeOperation,
          transform: transform ? Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((key) => [key, transform[key]])) : null };
        state.canvasPixels = pixels(canvas);
        if (session.terminalFrameHeld) state.holdPixels = pixels(session.terminalFrameHold);
      }
      return state;
    },
    dispose() {
      disposed = true;
      if (sampleCanvas) sampleCanvas.width = sampleCanvas.height = 0;
      sampleCanvas = null;
    },
  });
}
