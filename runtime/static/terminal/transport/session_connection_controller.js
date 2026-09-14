import { createTerminalSessionConnectionLifecycle } from "./session_connection_lifecycle.js";

const noop = () => {};

const isNetworkFailureReason = (reason) => {
  const normalized = String(reason || "").toLowerCase();
  return normalized.includes("network")
    || normalized.includes("websocket")
    || normalized.includes("connection timed out")
    || normalized.includes("connection reset")
    || normalized.includes("connection aborted")
    || normalized.includes("queue transport");
};

export function createTerminalSessionConnectionController({
  windowObject = globalThis.window,
  consoleObject = globalThis.console,
  getActiveName = () => "",
  getDisposed = () => false,
  isCurrentSession = () => false,
  isOnline = () => true,
  setNetworkBanner = noop,
  isReplayRetryPaused = () => false,
  isReplayCommitted = () => false,
  recycleUnifiedSession = () => false,
  getCurrentLease = () => null,
  notifyConnectionFailure = () => false,
  requestConnection = noop,
  connectPendingSession = noop,
  scheduleUnifiedSync = noop,
  isInputReady = () => false,
  isActivePane = () => false,
  appendDebugError = noop,
  showStartupError = noop,
  describeSession = (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
  flushPendingInput = noop,
  now = () => Date.now(),
  isSocketOpen = (socket) => socket?.readyState === 1,
  isSocketConnecting = (socket) => socket?.readyState === 0,
  sendPing = (socket) => socket?.send?.(JSON.stringify({ type: "ping" })),
  pingIntervalMs = 10 * 1000,
  healthTimeoutMs = 25 * 1000,
  resumeProbeTimeoutMs = 1500,
  connectTimeoutMs = 12 * 1000,
  attachReadyTimeoutMs = 8 * 1000,
  agentPrepareTimeoutMs = 45 * 1000,
  lifecycle: providedLifecycle,
} = {}) {
  let disposed = false;
  let lifecycle = providedLifecycle;

  const scheduleReconnect = (session, { immediate = false, allowHidden = true } = {}) => {
    if (
      disposed
      || getDisposed()
      || !session
      || session.closed
      || !isCurrentSession(session)
      || isReplayRetryPaused(session)
    ) {
      return false;
    }
    if (!isOnline()) {
      setNetworkBanner(true);
      if (session.shellEl?.dataset) {
        session.shellEl.dataset.connection = "offline";
      }
      return false;
    }
    session.connectionRetrying = true;
    if (session.shellEl?.dataset) {
      // A retry is not evidence of a network fault.  Logical attach,
      // replay, and resize recovery must remain on the gray indicator until
      // the transport reports an actual network failure.
      session.shellEl.dataset.connection = "reconnecting";
    }
    if (session.connectionChannel === "unified") {
      recycleUnifiedSession(session, "unified connection retry requested", { immediate });
      return true;
    }
    const leaseID = Number(session.connectionLeaseID || 0);
    if (leaseID && getCurrentLease(session)?.leaseID === leaseID) {
      notifyConnectionFailure(
        session,
        leaseID,
        new Error("terminal connection retry requested"),
        { awaitClose: Boolean(session.socket) },
      );
      return true;
    }
    requestConnection(session, {
      reason: "network_retry",
      immediate,
      allowHidden,
    });
    return true;
  };

  const retryAfterFailure = (session, error, { allowHidden = true } = {}) => {
    if (disposed || !session || session.closed || !isCurrentSession(session)) {
      return false;
    }
    consoleObject?.warn?.("[client-terminal] websocket connect attempt failed", {
      name: session.name,
      pane: session.id,
      error: error?.message || String(error),
    });
    appendDebugError("终端连接建立失败", `${describeSession(session)}: ${error?.message || String(error)}`);
    showStartupError(session, "WebSocket reconnect failed.");
    scheduleReconnect(session, { allowHidden });
    return true;
  };

  const closeSocketForReconnect = (session, currentSocket, reason, { allowHidden = false } = {}) => {
    if (disposed || session?.exitExpected || session?.socket !== currentSocket) {
      return false;
    }
    session.connectionRetrying = true;
    if (session.shellEl?.dataset) {
      session.shellEl.dataset.connection = isNetworkFailureReason(reason)
        ? "network-error"
        : "reconnecting";
    }
    consoleObject?.warn?.(reason);
    appendDebugError("终端连接异常，准备重试", reason);
    if (session.connectionChannel === "unified") {
      recycleUnifiedSession(session, reason, { immediate: true });
      return true;
    }
    const leaseID = Number(session.connectionLeaseID || 0);
    if (!notifyConnectionFailure(session, leaseID, new Error(reason), { awaitClose: true })) {
      try {
        currentSocket.close();
      } catch (error) {
      }
      scheduleReconnect(session, { immediate: true, allowHidden });
    }
    return true;
  };

  lifecycle ||= createTerminalSessionConnectionLifecycle({
    windowObject,
    getActiveName,
    now,
    isSocketOpen,
    isSocketConnecting,
    sendPing,
    isReplayCommitted,
    flushPendingInput,
    closeSocketForReconnect,
    pingIntervalMs,
    healthTimeoutMs,
    resumeProbeTimeoutMs,
    connectTimeoutMs,
    attachReadyTimeoutMs,
    agentPrepareTimeoutMs,
  });

  const checkHealth = (session, { connect = true, force = false, allowHidden = false } = {}) => {
    if (disposed || getDisposed() || !session || session.closed || session.exitExpected || !isCurrentSession(session)) {
      return false;
    }
    if (!isOnline()) {
      setNetworkBanner(true);
      if (session.shellEl?.dataset) {
        session.shellEl.dataset.connection = "offline";
      }
      return false;
    }
    if (session.pendingConnect) {
      connectPendingSession(session, { allowHidden: allowHidden || force });
      return false;
    }
    const socket = session.socket;
    if (isSocketOpen(socket)) {
      const checkedAt = now();
      const lastHealth = Number(session.lastSocketHealthAt || 0);
      const healthTimeout = session.agentPreparing ? agentPrepareTimeoutMs : healthTimeoutMs;
      if (lastHealth > 0 && checkedAt - lastHealth > healthTimeout) {
        closeSocketForReconnect(
          session,
          socket,
          `Terminal WebSocket health check failed: ${session.name}/${session.id}`,
          { allowHidden: allowHidden || force },
        );
        return false;
      }
      if (lifecycle.checkAttachReady(session, socket)) {
        closeSocketForReconnect(
          session,
          socket,
          `Terminal attach readiness check failed: ${session.name}/${session.id}`,
          { allowHidden: allowHidden || force },
        );
        return false;
      }
      if (session.resumeProbeTimer && force) {
        return false;
      }
      return isInputReady(session);
    }
    if (isSocketConnecting(socket)) {
      return false;
    }
    if (connect) {
      if (session.connectionChannel === "unified" && !force) {
        scheduleUnifiedSync({ reason: "connection_health" });
        return false;
      }
      requestConnection(session, {
        reason: force ? "connection_health_user" : "connection_health",
        userInteraction: Boolean(force && isActivePane(session)),
        immediate: force,
        allowHidden: allowHidden || force,
      });
    }
    return false;
  };

  const disposeSession = (session) => lifecycle.disposeSession(session);

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    lifecycle.dispose();
    return true;
  };

  return Object.freeze({
    checkHealth,
    clearAttachReadyTimer: lifecycle.clearAttachReadyTimer,
    clearConnectionTimers: lifecycle.clearConnectionTimers,
    clearReconnectTimer: lifecycle.clearReconnectTimer,
    clearSocketConnectTimer: lifecycle.clearSocketConnectTimer,
    clearSocketHealthTimer: lifecycle.clearSocketHealthTimer,
    clearSocketResumeProbeTimer: lifecycle.clearSocketResumeProbeTimer,
    closeSocketForReconnect,
    dispose,
    disposeSession,
    markSocketHealth: lifecycle.markSocketHealth,
    probeOpenSocket: lifecycle.probeOpenSocket,
    retryAfterFailure,
    scheduleReconnect,
    startAttachReadyTimer: lifecycle.startAttachReadyTimer,
    startSocketConnectTimer: lifecycle.startSocketConnectTimer,
    startSocketHealthMonitor: lifecycle.startSocketHealthMonitor,
  });
}
