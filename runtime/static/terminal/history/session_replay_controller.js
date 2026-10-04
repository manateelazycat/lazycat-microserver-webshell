import { createTerminalSessionReplayLifecycle } from "./session_replay_lifecycle.js";
import {
  parseTerminalHistoryCursor,
  setTerminalReplayAuthorization,
  terminalReplayAuthorization,
  terminalReplayCommitIsPending,
  terminalReplayHasIdentifiedAuthorization,
  terminalReplayIsAuthorized,
  terminalReplayIsCommitted,
  terminalReplayRetryIsPaused,
} from "./session_replay_state.js";

const noop = () => {};

export function createTerminalSessionReplayController({
  windowObject = globalThis.window,
  getActiveName = () => "",
  hasQueuedOutput = () => false,
  endRenderSuppression = noop,
  clearOutputOverload = noop,
  clearAttachReadyTimer = noop,
  appendDebugLog = noop,
  appendDebugError = noop,
  describeSession = (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
  clearUnifiedRetry = noop,
  isActivePane = () => false,
  hideStartupError = noop,
  notifyDirectReplayReady = noop,
  setPresentationReady = noop,
  ensurePresentation = noop,
  flushPendingInput = noop,
  onReplayReady = noop,
  beginPresentationHold = noop,
  isMeasurable = () => false,
  canvasMatchesExpectedSize = () => false,
  recordEvent = noop,
  replayFailureLimit = 3,
  checkpointDelayMs = 48,
  lifecycle = createTerminalSessionReplayLifecycle({
    windowObject,
    getActiveName,
    isReplayCommitted: terminalReplayIsCommitted,
    isMeasurable,
    canvasMatchesExpectedSize,
    recordEvent,
    checkpointDelayMs,
  }),
} = {}) {
  let disposed = false;

  const finishIfReady = (session) => {
    if (
      disposed
      || !session
      || !terminalReplayCommitIsPending(session)
      || hasQueuedOutput(session)
      || !terminalReplayIsAuthorized(session)
      || session.closed
      || session.term?.wasmTerm?.checkpointRestorePending
      || session.term?.backendResizePending
      || session.name !== getActiveName()
      || (session.historyProtocolActive && session.receivedHistoryCursor < session.historyReplayTargetCursor)
      || (session.historyProtocolActive && session.appliedHistoryCursor < session.historyReplayTargetCursor)
    ) {
      return false;
    }
    recordEvent(session, "replay_output_drained", {
      receivedCursor: session.receivedHistoryCursor?.toString?.() || "",
      appliedCursor: session.appliedHistoryCursor?.toString?.() || "",
      targetCursor: session.historyReplayTargetCursor?.toString?.() || "",
      outputQueueBytes: Number(session.outputQueueSize || 0),
      outputQueueEntries: Number(session.outputQueue?.length || 0),
      historyGeneration: String(session.historyGeneration || ""),
      connectionEpoch: Number(session.connectionEpoch || 0),
      channelGeneration: Number(session.connectionChannelGeneration || 0),
    });
    session.replayCompletionPending = false;
    if (session.replayController?.phase === "awaiting_commit") {
      session.replayController.commit();
    }
    if (session.replayController?.phase === "committed") {
      session.replayControllerLegacyActive = false;
      session.queueReplayControllerActive = false;
      session.queueReplayControllerLegacy = false;
    }
    session.replayFailureAttempts = 0;
    session.replayRetryPaused = false;
    session.lastReplayFailureReason = "";
    endRenderSuppression(session, { render: false, reason: "replay" });
    session.replayComplete = true;
    setTerminalReplayAuthorization(session, false);
    session.historyStateReady = true;
    session.agentPreparing = false;
    clearOutputOverload(session);
    session.allowGeneratedInputDuringReplay = false;
    clearAttachReadyTimer(session);
    if (Number(session.reconnectAttempts || 0) > 0) {
      appendDebugLog("info", "终端连接已恢复", describeSession(session));
    }
    session.reconnectAttempts = 0;
    session.connectionRetrying = false;
    if (session.shellEl?.dataset) {
      session.shellEl.dataset.connection = session.exitExpected ? "error" : "open";
    }
    if (session.connectionChannel === "unified") {
      clearUnifiedRetry(session, { resetAttempts: true });
    }
    if (isActivePane(session) && !session.terminalExitRetained) {
      hideStartupError();
    }
    if (session.connectionChannel === "fast") {
      notifyDirectReplayReady(session, Number(session.connectionLeaseID || 0));
    }
    setPresentationReady(session, false);
    ensurePresentation(session, {
      reason: "history_replay_complete",
      forceHistory: true,
    });
    flushPendingInput(session);
    onReplayReady(session);
    return true;
  };

  const noteFailure = (session, reason = "replay_failed") => {
    if (disposed || !session || session.closed || terminalReplayIsCommitted(session)) {
      return false;
    }
    session.replayFailureAttempts = Math.min(
      replayFailureLimit,
      Number(session.replayFailureAttempts || 0) + 1,
    );
    session.lastReplayFailureReason = String(reason || "replay_failed");
    if (session.replayFailureAttempts < replayFailureLimit) {
      return false;
    }
    session.replayRetryPaused = true;
    session.connectionRetrying = false;
    if (session.shellEl?.dataset) {
      session.shellEl.dataset.connection = "error";
    }
    beginPresentationHold(session);
    appendDebugError(
      "终端历史回放已暂停",
      `${describeSession(session)}: ${session.lastReplayFailureReason}，请重新操作后继续。`,
    );
    return true;
  };

  const resumeRetry = (session, reason = "user_recovery") => {
    if (disposed || !session || session.closed || !session.replayRetryPaused) {
      return false;
    }
    session.replayRetryPaused = false;
    session.replayFailureAttempts = 0;
    session.lastReplayFailureReason = "";
    session.resetOnNextReplay = true;
    session.connectionRetrying = true;
    if (session.shellEl?.dataset) {
      session.shellEl.dataset.connection = "reconnecting";
    }
    appendDebugLog("info", "终端历史回放恢复重试", `${describeSession(session)}: ${reason}`);
    return true;
  };

  const discardSession = (session) => {
    if (!session) {
      return false;
    }
    lifecycle.clearCheckpoint(session);
    session.replayCompletionPending = false;
    return true;
  };

  const disposeSession = (session) => {
    discardSession(session);
    return lifecycle.disposeSession(session);
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
    authorization: terminalReplayAuthorization,
    commitIsPending: terminalReplayCommitIsPending,
    discardSession,
    dispose,
    disposeSession,
    finishIfReady,
    hasIdentifiedAuthorization: terminalReplayHasIdentifiedAuthorization,
    isAuthorized: terminalReplayIsAuthorized,
    isCommitted: terminalReplayIsCommitted,
    isRetryPaused: terminalReplayRetryIsPaused,
    noteFailure,
    parseCursor: parseTerminalHistoryCursor,
    resumeRetry,
    schedulePresentationCheckpoint: lifecycle.scheduleCheckpoint,
    setAuthorization: setTerminalReplayAuthorization,
  });
}
