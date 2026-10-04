import { createTerminalUnifiedConnection } from "./terminal_unified_connection.js";
import { createTerminalUnifiedHealthWatchdog } from "./terminal_unified_health.js";

const noop = () => {};

const isNetworkFailureReason = (reason) => {
  const normalized = String(reason || "").toLowerCase();
  return normalized.includes("network")
    || normalized.includes("websocket")
    || normalized.includes("transport")
    || normalized.includes("physical")
    || normalized.includes("connection timed out")
    || normalized.includes("connection reset")
    || normalized.includes("connection aborted")
    || normalized.includes("queue transport")
    || normalized.includes("eof");
};

export function createTerminalUnifiedTransportController({
  windowObject = globalThis.window,
  createConnection = createTerminalUnifiedConnection,
  createHealthWatchdog = createTerminalUnifiedHealthWatchdog,
  buildConnectionURL = () => "",
  getDisposed = () => false,
  isOnline = () => true,
  getActiveName = () => "",
  getSessions = () => [],
  getMembershipPaneIDs = () => [],
  refreshMembership = noop,
  reconnectWorkspaceSessions = noop,
  scheduleLogicalSync = noop,
  invalidateStartupError = noop,
  syncNetworkMonitor = noop,
  appendDebugWarning = noop,
  appendDebugError = noop,
  onPhysicalEvent = noop,
  queueMicrotaskImpl = (callback) => queueMicrotask(callback),
  socketConnecting = 0,
  socketOpen = 1,
  socketClosing = 2,
  socketClosed = 3,
  closeFenceMs = 500,
  healthCheckIntervalMs = 4 * 1000,
  pongTimeoutMs = 12 * 1000,
  transitionTimeoutMs = 12 * 1000,
  recoveryRetryMs = 1000,
} = {}) {
  let connection = null;
  let targetName = "";
  let healthWatchdog = null;
  const closedConnections = new WeakSet();
  let closingPromise = null;
  let expectedCloseReason = "";
  let recoveryScheduled = false;
  let recoveryRunning = false;
  let recoveryPendingReason = "";
  let recoveryRetryTimer = 0;
  let disposed = false;

  const closeFenceDelayMs = Math.max(250, Math.min(2000, Math.floor(Number(closeFenceMs) || 0)));

  const createCloseFence = (observedConnection, delayMs = closeFenceDelayMs) => {
    let timer = 0;
    let fence;
    fence = Promise.race([
      Promise.resolve(observedConnection?.closed),
      new Promise((resolve) => {
        timer = windowObject?.setTimeout?.(resolve, delayMs) || 0;
      }),
    ]).finally(() => {
      if (timer) {
        windowObject?.clearTimeout?.(timer);
      }
    });
    return fence;
  };

  const registerClosingFence = (fence) => {
    closingPromise = fence;
    fence.finally(() => {
      if (closingPromise === fence) {
        closingPromise = null;
      }
      syncNetworkMonitor();
    });
    return fence;
  };

  const waitForClosures = async () => {
    if (closingPromise) {
      await Promise.allSettled([closingPromise]);
    }
  };

  const needsRecovery = () => Boolean(
    connection
    && connection.snapshot?.().physicalReadyState === socketClosed
    && getMembershipPaneIDs().length > 0
  );

  const close = (reason = "context_changed") => {
    const normalizedReason = String(reason || "context_changed");
    const current = connection;
    for (const pane of getSessions()) {
      if (pane?.connectionChannel === "unified") {
        pane.connectionCloseReason = normalizedReason;
      }
    }
    if (!current) {
      return false;
    }
    expectedCloseReason = normalizedReason;
    connection = null;
    targetName = "";
    healthWatchdog?.stop?.();
    healthWatchdog = null;
    const fence = createCloseFence(current);
    fence.finally(() => {
      if (expectedCloseReason === normalizedReason) {
        expectedCloseReason = "";
      }
    });
    registerClosingFence(fence);
    closedConnections.add(current);
    current.close(4001, normalizedReason);
    return true;
  };

  const scheduleRecovery = (reason = "transport_failure") => {
    const normalizedReason = String(reason || "transport_failure");
    if (
      disposed
      || getDisposed()
      || !isOnline()
    ) {
      return false;
    }
    if (recoveryScheduled || recoveryRunning) {
      recoveryPendingReason = normalizedReason;
      return true;
    }
    recoveryScheduled = true;
    queueMicrotaskImpl(async () => {
      recoveryScheduled = false;
      if (
        disposed
        || getDisposed()
        || !isOnline()
        || recoveryRunning
      ) {
        return;
      }
      recoveryRunning = true;
      appendDebugWarning("终端物理通道异常，正在恢复", normalizedReason);
      try {
        close("transport_recovery");
        await waitForClosures();
        expectedCloseReason = "";
        if (!disposed && !getDisposed() && isOnline()) {
          refreshMembership({ reason: "transport_recovery" });
          reconnectWorkspaceSessions({ allowHidden: true });
        }
      } catch (error) {
        appendDebugError("终端物理通道恢复失败", error?.message || String(error));
        if (
          !disposed
          && !getDisposed()
          && isOnline()
          && getActiveName()
          && !recoveryRetryTimer
        ) {
          recoveryRetryTimer = windowObject?.setTimeout?.(() => {
            recoveryRetryTimer = 0;
            scheduleRecovery("transport_recovery_retry");
          }, recoveryRetryMs) || 0;
        }
      } finally {
        recoveryRunning = false;
        const pendingReason = recoveryPendingReason;
        recoveryPendingReason = "";
        if (
          pendingReason
          && !disposed
          && !getDisposed()
          && isOnline()
          && needsRecovery()
        ) {
          scheduleRecovery(pendingReason);
        }
      }
    });
    return true;
  };

  const handlePhysicalDisconnect = (
    observedConnection,
    reason = "unified_transport_closed",
    { closeConnection = false } = {},
  ) => {
    if (!observedConnection || closedConnections.has(observedConnection)) {
      return false;
    }
    closedConnections.add(observedConnection);
    healthWatchdog?.setConnection(null);
    if (!closingPromise) {
      registerClosingFence(createCloseFence(observedConnection));
    }
    if (connection === observedConnection) {
      connection = null;
      targetName = "";
    }
    for (const pane of getSessions()) {
      if (
        !pane?.closed
        && pane.name === getActiveName()
        && pane.connectionChannel === "unified"
        && pane.socket
        && pane.socket.readyState !== socketClosed
        && pane.socket.readyState !== socketClosing
      ) {
        // Preserve the physical failure reason through the logical close
        // callback so the indicator cannot fall back to a generic gray retry
        // state while the shared transport is still unavailable.
        pane.connectionCloseReason = String(reason || "unified_transport_closed");
        try {
          pane.socket.close(4001, "unified_retry");
        } catch (error) {
        }
      }
      if (!pane?.closed && !pane.exitExpected && pane.name === getActiveName() && pane.connectionChannel === "unified") {
        invalidateStartupError(pane, { hidePanel: true });
        pane.connectionRetrying = true;
        if (pane.shellEl?.dataset) {
          pane.shellEl.dataset.connection = isOnline()
            ? (isNetworkFailureReason(reason) ? "network-error" : "reconnecting")
            : "offline";
        }
      }
    }
    if (closeConnection) {
      try {
        observedConnection.close(4001, String(reason || "unified_transport_closed"));
      } catch (error) {
      }
    }
    appendDebugWarning("统一终端物理通道已断开，立即重建", String(reason || "unified_transport_closed"));
    scheduleRecovery(String(reason || "unified_transport_closed"));
    return true;
  };

  const startHealthWatchdog = (current) => {
    healthWatchdog?.stop?.();
    healthWatchdog = createHealthWatchdog({
      intervalMs: healthCheckIntervalMs,
      pongTimeoutMs,
      transitionTimeoutMs,
      isPaused: () => disposed || getDisposed() || !isOnline(),
      onUnhealthy: (reason, observedConnection) => {
        appendDebugWarning("统一终端物理通道健康检查失败", reason);
        handlePhysicalDisconnect(observedConnection, reason);
      },
      onDisconnected: (reason, observedConnection) => {
        if (observedConnection && connection !== observedConnection) {
          return;
        }
        scheduleRecovery(reason);
      },
    });
    healthWatchdog.setConnection(current);
    return healthWatchdog;
  };

  const probe = (reason = "lifecycle_resume") => {
    if (!healthWatchdog || !connection) {
      return false;
    }
    const result = healthWatchdog.probe(reason);
    return result?.action !== "paused";
  };

  const retryUnavailable = (reason = "lifecycle_resume") => {
    if (disposed || getDisposed() || !isOnline()) {
      return false;
    }
    const state = connection?.snapshot?.().physicalReadyState ?? socketClosed;
    if (connection && state !== socketClosed) {
      return false;
    }
    if (getMembershipPaneIDs().length === 0) {
      return false;
    }
    scheduleRecovery(reason);
    return true;
  };

  const ensure = (requestedTargetName) => {
    const normalizedTarget = String(requestedTargetName || "").trim();
    if (disposed || !normalizedTarget || closingPromise) {
      return null;
    }
    if (
      connection
      && targetName === normalizedTarget
      && connection.snapshot().physicalReadyState !== socketClosing
      && connection.snapshot().physicalReadyState !== socketClosed
    ) {
      return connection;
    }
    if (connection) {
      close("unified_target_changed");
      return null;
    }
    const url = buildConnectionURL(normalizedTarget);
    if (!url) {
      return null;
    }
    let current;
    let observedPhysicalReadyState = socketClosed;
    let observedServerReady = false;
    current = createConnection({
      url,
      onStateChange: (state) => {
        if (connection !== current) {
          return;
        }
        const previousPhysicalReadyState = observedPhysicalReadyState;
        observedPhysicalReadyState = state.physicalReadyState;
        const becameOpen = state.physicalReadyState === socketOpen
          && previousPhysicalReadyState !== socketOpen;
        const becameReady = state.serverReady === true && !observedServerReady;
        observedServerReady = state.serverReady === true;
        syncNetworkMonitor();
        if (state.physicalReadyState === socketConnecting || state.physicalReadyState === socketOpen) {
          healthWatchdog?.start();
        }
        if (becameOpen) {
          healthWatchdog?.probe("transport_open");
          scheduleLogicalSync({ reason: "unified_open" });
        }
        if (becameReady) {
          healthWatchdog?.probe("agent_ready");
          scheduleLogicalSync({ reason: "unified_agent_ready" });
        }
        if (
          state.physicalReadyState === socketClosed
          && !expectedCloseReason
          && !closedConnections.has(current)
        ) {
          handlePhysicalDisconnect(current, "unified_transport_closed");
        }
      },
      onPhysicalError: ({ message, connection: failedConnection }) => {
        if (connection !== failedConnection) return;
        appendDebugWarning("统一终端物理通道 WebSocket 错误，立即关闭重建", message);
        handlePhysicalDisconnect(failedConnection, "unified_websocket_error", { closeConnection: true });
      },
      onPhysicalClose: ({ connection: closedConnection, reason }) => {
        if (connection === closedConnection && !expectedCloseReason) {
          handlePhysicalDisconnect(closedConnection, reason || "unified_websocket_closed");
        }
      },
      onPhysicalEvent: (event) => {
        if (connection === current) onPhysicalEvent({ ...event, targetName: normalizedTarget });
      },
      onProtocolError: (error, identity) => {
        appendDebugError(
          "统一终端协议错误",
          `${identity?.paneID || "unknown"}: ${error?.message || String(error)}`,
        );
      },
    });
    connection = current;
    targetName = normalizedTarget;
    startHealthWatchdog(current);
    syncNetworkMonitor();
    Promise.resolve(current.closed).finally(() => {
      if (connection === current && !expectedCloseReason) {
        handlePhysicalDisconnect(current, "unified_transport_closed_finally");
      }
      syncNetworkMonitor();
    });
    current.connect();
    return current;
  };

  // Prepare only the selected container's physical channel. This never creates
  // a logical stream; the existing pane readiness gate retains that ownership.
  const prepare = (requestedTargetName) => {
    const name = String(requestedTargetName || "").trim();
    if (disposed || getDisposed() || !isOnline() || !name
      || name !== getActiveName() || connection || closingPromise) {
      return null;
    }
    let prepared;
    try {
      prepared = ensure(name);
    } catch (error) {
      close("transport_preparation_failed");
      appendDebugWarning("物理通道预连接未完成，等待终端正常接入", error?.message || String(error));
      return null;
    }
    return (reason = "transport_preparation_cancelled") => {
      // A late bootstrap failure must not close a replacement connection or
      // one which has already been adopted by a logical terminal stream.
      if (prepared && connection === prepared && prepared.snapshot().logicalCount === 0) close(reason);
    };
  };

  const clearExpectedCloseReason = () => {
    expectedCloseReason = "";
  };

  const setPriority = (paneID, priority) => connection?.setPriority?.(paneID, priority) ?? false;

  const matchesTarget = (value) => Boolean(
    connection
    && targetName === String(value || "").trim()
  );

  const snapshot = () => {
    const currentSnapshot = connection?.snapshot?.() || {};
    return Object.freeze({
      connection,
      targetName,
      physicalReadyState: currentSnapshot.physicalReadyState ?? socketClosed,
      serverReady: currentSnapshot.serverReady === true,
      physicalConnectionID: String(currentSnapshot.physicalConnectionID || ""),
      logicalCount: Number(currentSnapshot.logicalCount || 0),
      logicalPaneIDs: Array.isArray(currentSnapshot.paneIDs) ? [...currentSnapshot.paneIDs] : [],
      closing: Boolean(closingPromise),
      expectedCloseReason,
      recoveryScheduled,
      recoveryRunning,
    });
  };

  const dispose = (reason = "page_disposed") => {
    if (disposed) {
      return false;
    }
    if (recoveryRetryTimer) {
      windowObject?.clearTimeout?.(recoveryRetryTimer);
      recoveryRetryTimer = 0;
    }
    close(reason);
    disposed = true;
    return true;
  };

  return Object.freeze({
    clearExpectedCloseReason,
    close,
    dispose,
    ensure,
    getClosingPromise: () => closingPromise,
    getConnection: () => connection,
    getPhysicalSocket: () => connection?.getPhysicalSocket?.() || null,
    getTargetName: () => targetName,
    handlePhysicalDisconnect,
    isClosedConnection: (value) => Boolean(value && closedConnections.has(value)),
    matchesTarget,
    needsRecovery,
    probe,
    prepare,
    retryUnavailable,
    scheduleRecovery,
    setPriority,
    snapshot,
    waitForClosures,
  });
}
