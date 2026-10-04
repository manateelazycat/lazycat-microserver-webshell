/**
 * Owns the state transition that detaches a terminal socket or requests a
 * history resync. Transport, replay, cache, rendering and IME implementations
 * stay behind explicit callbacks so this module does not create connections or
 * render replay intermediate frames.
 */
export function createTerminalSessionRecoveryController({
  getActiveName = () => "",
  clearOutputSettle = () => {},
  resetReplayController = () => {},
  setReplayAuthorization = () => {},
  clearConnectionTimers = () => {},
  beginRenderSuppression = () => {},
  endRenderSuppression = () => {},
  recordSessionEvent = () => {},
  discardOutput = () => {},
  markPresentationSyncPending = () => {},
  retainLocalFrame = () => {},
  resetRuntimeState = () => false,
  cancelPendingRender = () => {},
  clearSelection = () => {},
  hasKnownSize = () => false,
  resetHostViewport = () => {},
  positionInput = () => {},
  recycleUnifiedSession = () => {},
  closeSocketForReconnect = () => {},
  requestConnection = () => {},
  measureTask = (_name, task) => task(),
  appendDebugWarning = () => {},
  describeSession = (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
} = {}) {
  let disposed = false;

  const detachSessionSocket = (session, currentSocket, { connection = "" } = {}) => {
    if (disposed || !session || session.socket !== currentSocket) {
      return false;
    }
    clearOutputSettle(session);
    session.socket = null;
    resetReplayController(session);
    session.queueReplayControllerActive = false;
    session.queueReplayControllerLegacy = false;
    session.replayControllerLegacyActive = false;
    session.replayComplete = false;
    setReplayAuthorization(session, false);
    session.replayCompletionPending = false;
    session.allowGeneratedInputDuringReplay = false;
    session.agentPreparing = false;
    session.attachStartedAt = 0;
    session.attachReadyTimeoutMs = 0;
    session.lastSocketHealthAt = 0;
    clearConnectionTimers(session);
    endRenderSuppression(session, { render: false, reason: "resize" });
    endRenderSuppression(session, { render: false, reason: "replay" });
    retainLocalFrame(session);
    if (connection) {
      session.connectionRetrying = connection === "reconnecting";
      if (session.shellEl?.dataset) {
        session.shellEl.dataset.connection = connection;
      }
    }
    return true;
  };

  const resetTerminalForHistoryReplay = (session) => {
    if (disposed) {
      return false;
    }
    if (!session?.term) {
      if (session) {
        session.lastHistoryResetFailureReason = "missing_terminal";
      }
      return false;
    }
    if (session.closed) {
      session.lastHistoryResetFailureReason = "session_closed";
      return false;
    }
    if (session.name !== getActiveName()) {
      session.lastHistoryResetFailureReason = "target_changed";
      return false;
    }
    if (!hasKnownSize(session)) {
      session.lastHistoryResetFailureReason = "terminal_size_unavailable";
      appendDebugWarning("终端历史回放等待尺寸", `${describeSession(session)}: terminal_size_unavailable`);
      return false;
    }
    return measureTask("history replay", () => {
      clearOutputSettle(session);
      beginRenderSuppression(session, "replay");
      recordSessionEvent(session, "history_replay_reset");
      discardOutput(session);
      markPresentationSyncPending(session);
      session.replayComplete = false;
      setReplayAuthorization(session, false);
      session.replayCompletionPending = false;
      session.historyStateReady = false;
      session.resetOnNextReplay = false;
      clearSelection(session, { updateUI: false });
      session.term.viewportY = 0;
      session.term.targetViewportY = 0;
      try {
        if (!resetRuntimeState(session)) {
          session.lastHistoryResetFailureReason = "runtime_reset_failed";
          endRenderSuppression(session, { reason: "replay" });
          return false;
        }
        cancelPendingRender(session.term);
        session.initialRuntimeResetDone = true;
        session.replayFitGeneration = session.measuredFitGeneration;
        session.lastHistoryResetFailureReason = "";
      } catch (error) {
        session.lastHistoryResetFailureReason = "history_replay_reset_exception";
        appendDebugWarning("终端历史回放重置异常", `${describeSession(session)}: ${error?.message || String(error)}`);
        endRenderSuppression(session, { reason: "replay" });
        return false;
      }
      resetHostViewport(session, { clean: true });
      positionInput(session);
      return true;
    });
  };

  const requestSessionHistoryReplay = (session) => {
    if (disposed || !session?.term || session.closed || session.exitExpected || session.name !== getActiveName()) {
      return false;
    }
    clearOutputSettle(session);
    resetReplayController(session);
    session.queueReplayControllerActive = false;
    session.queueReplayControllerLegacy = false;
    session.replayControllerLegacyActive = false;
    session.resetOnNextReplay = true;
    discardOutput(session);
    const socket = session.socket;
    if (session.connectionChannel === "unified") {
      recycleUnifiedSession(session, "unified history resync requested", { immediate: true });
      return true;
    }
    if (socket) {
      closeSocketForReconnect(session, socket, "Terminal history resync requested.");
    } else {
      session.replayComplete = false;
      setReplayAuthorization(session, false);
      session.connectionRetrying = true;
      if (session.shellEl?.dataset) {
        session.shellEl.dataset.connection = "reconnecting";
      }
    }
    session.reconnectAttempts = Math.max(1, Number(session.reconnectAttempts || 0));
    requestConnection(session, { reason: "history_resync", immediate: true, allowHidden: true });
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
    detachSessionSocket,
    dispose,
    isDisposed: () => disposed,
    requestSessionHistoryReplay,
    resetTerminalForHistoryReplay,
  });
}
