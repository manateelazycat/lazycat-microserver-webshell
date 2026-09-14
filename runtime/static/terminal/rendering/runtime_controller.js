const terminalRuntimeClearSequence = "\x1b[2J\x1b[3J\x1b[H";

export function createTerminalRuntimeController({
  advanceContentGeneration = () => {},
  isRenderAllowed = () => false,
  clearCanvas = () => {},
  syncSelectionRuntime = () => {},
  syncRendererRuntime = () => {},
  appendDebugWarning = () => {},
  appendDebugError = () => {},
  describeSession = (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
} = {}) {
  let disposed = false;

  const clearBuffer = (session) => {
    const term = session?.term;
    if (disposed || !term?.wasmTerm) {
      return false;
    }
    try {
      const backend = term.wasmTerm;
      const generation = backend.generation;
      const complete = () => {
      if (disposed || session.closed || term.wasmTerm !== backend || backend.generation !== generation) return false;
      advanceContentGeneration(session);
      term.viewportY = 0;
      term.targetViewportY = 0;
      term.linkDetector?.invalidateCache?.();
      if (isRenderAllowed(session)) {
        term.requestRender?.({ full: true });
      }
      return true;
      };
      const result = backend.write(terminalRuntimeClearSequence);
      if (result?.then) {
        result.then(complete).catch((error) => {
          if (error?.code !== "BACKEND_CANCELLED") appendDebugError("终端清理失败", error?.message || String(error));
        });
        return true;
      }
      return complete();
    } catch (error) {
      return false;
    }
  };

  const syncReferences = (session) => {
    const term = session?.term;
    if (disposed || !term) {
      return false;
    }
    syncSelectionRuntime(session);
    term.linkDetector?.invalidateCache?.();
    syncRendererRuntime(session);
    return true;
  };

  const reset = (session) => {
    const term = session?.term;
    if (disposed || !term || typeof term.reset !== "function") {
      return false;
    }
    try {
      term.reset();
      syncReferences(session);
      clearBuffer(session);
      clearCanvas(session);
      return true;
    } catch (error) {
      appendDebugWarning(
        "终端运行时重置失败，降级清理后继续",
        `${describeSession(session)}: ${error?.message || String(error)}`,
      );
      try {
        if (typeof term.clear === "function") {
          term.clear();
        } else if (!clearBuffer(session)) {
          return false;
        }
        clearCanvas(session);
        return true;
      } catch (fallbackError) {
        appendDebugError(
          "终端运行时清理失败",
          `${describeSession(session)}: ${fallbackError?.message || String(fallbackError)}`,
        );
        return false;
      }
    }
  };

  const resetAfterInitialFit = (session) => {
    const term = session?.term;
    if (
      disposed
      || !term
      || session.initialRuntimeResetDone
      || Number(session.measuredFitGeneration || 0) <= 0
    ) {
      return false;
    }
    session.initialRuntimeResetDone = true;
    // Worker initialization already created an empty engine. A late initial
    // DOM fit must never reset history that has started arriving meanwhile.
    if (term.wasmTerm?.isRemote) return true;
    return reset(session);
  };

  const beginRenderSuppression = (session, reason = "generic") => {
    if (disposed || !session?.term || typeof session.term.beginRenderSuppression !== "function") {
      return false;
    }
    const key = String(reason || "generic");
    if (!(session.terminalRenderSuppressionReasons instanceof Set)) {
      session.terminalRenderSuppressionReasons = new Set();
    }
    if (session.terminalRenderSuppressionReasons.has(key)) {
      return true;
    }
    if (session.terminalRenderSuppressionReasons.size === 0) {
      session.term.beginRenderSuppression();
    }
    session.terminalRenderSuppressionReasons.add(key);
    session.terminalRenderSuppressionActive = true;
    return true;
  };

  const endRenderSuppression = (session, {
    render = false,
    full = true,
    reason = "generic",
  } = {}) => {
    if (disposed || !session?.term || !session.terminalRenderSuppressionActive) {
      return false;
    }
    const reasons = session.terminalRenderSuppressionReasons;
    if (!(reasons instanceof Set)) {
      return false;
    }
    const key = String(reason || "generic");
    if (!reasons.has(key)) {
      return false;
    }
    reasons.delete(key);
    if (reasons.size > 0) {
      return true;
    }
    if (typeof session.term.endRenderSuppression === "function") {
      session.term.endRenderSuppression({ render, full });
    }
    session.terminalRenderSuppressionReasons = new Set();
    session.terminalRenderSuppressionActive = false;
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
    beginRenderSuppression,
    clearBuffer,
    dispose,
    endRenderSuppression,
    isDisposed: () => disposed,
    reset,
    resetAfterInitialFit,
    syncReferences,
  });
}
