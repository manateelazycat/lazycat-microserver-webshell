const socketConnecting = 0;
const socketOpen = 1;
const socketClosing = 2;
const socketClosed = 3;

export const createTerminalUnifiedHealthWatchdog = ({
  intervalMs = 4000,
  pongTimeoutMs = 12000,
  transitionTimeoutMs = 12000,
  now = () => Date.now(),
  setIntervalImpl = (callback, delay) => setInterval(callback, delay),
  clearIntervalImpl = (timer) => clearInterval(timer),
  isPaused = () => false,
  onDisconnected = () => {},
  onUnhealthy = () => {},
} = {}) => {
  const checkInterval = Math.max(1000, Math.floor(Number(intervalMs) || 0));
  const pongTimeout = Math.max(checkInterval, Math.floor(Number(pongTimeoutMs) || 0));
  const transitionTimeout = Math.max(checkInterval, Math.floor(Number(transitionTimeoutMs) || 0));
  let connection = null;
  let observedState = socketClosed;
  let observedStateAt = now();
  let outstandingPingAt = 0;
  let timer = 0;

  const observeState = (state, checkedAt) => {
    if (state !== observedState) {
      observedState = state;
      observedStateAt = checkedAt;
      if (state !== socketOpen) {
        outstandingPingAt = 0;
      }
    }
  };

  const closeUnhealthy = (reason) => {
    const current = connection;
    if (!current) {
      return false;
    }
    onUnhealthy(reason, current);
    try {
      current.close(4001, reason);
    } catch (error) {
      onDisconnected(`${reason}_close_failed`, current);
    }
    return true;
  };

  const check = (reason = "interval") => {
    if (isPaused()) {
      return { action: "paused", reason };
    }
    const current = connection;
    if (!current) {
      onDisconnected(`unified_${reason}_missing`, null);
      return { action: "retry", reason };
    }
    const checkedAt = now();
    const snapshot = current.snapshot?.() || {};
    const state = Number(snapshot.physicalReadyState);
    observeState(state, checkedAt);

    if (state === socketOpen) {
      const lastPongAt = Math.max(0, Number(snapshot.physicalLastPongAt || 0));
      if (outstandingPingAt > 0 && lastPongAt >= outstandingPingAt) {
        outstandingPingAt = 0;
      }
      if (outstandingPingAt > 0) {
        if (checkedAt - outstandingPingAt >= pongTimeout) {
          closeUnhealthy("unified_pong_timeout");
          return { action: "close", reason: "pong_timeout" };
        }
        return { action: "awaiting_pong", reason };
      }
      if (!current.ping?.()) {
        closeUnhealthy("unified_ping_failed");
        return { action: "close", reason: "ping_failed" };
      }
      outstandingPingAt = checkedAt;
      return { action: "ping", reason };
    }

    if (state === socketClosed) {
      onDisconnected(`unified_${reason}_closed`, current);
      return { action: "retry", reason };
    }

    if (
      (state === socketConnecting || state === socketClosing)
      && checkedAt - observedStateAt >= transitionTimeout
    ) {
      closeUnhealthy(state === socketConnecting ? "unified_connect_timeout" : "unified_close_timeout");
      return { action: "close", reason: "transition_timeout" };
    }
    return { action: "waiting", reason };
  };

  const setConnection = (nextConnection) => {
    connection = nextConnection || null;
    observedState = Number(connection?.snapshot?.().physicalReadyState ?? socketClosed);
    observedStateAt = now();
    outstandingPingAt = 0;
    return connection;
  };

  const probe = (reason = "resume") => {
    outstandingPingAt = 0;
    return check(reason);
  };

  const start = () => {
    if (!timer) {
      timer = setIntervalImpl(() => check("interval"), checkInterval);
    }
    return timer;
  };

  const stop = () => {
    if (timer) {
      clearIntervalImpl(timer);
      timer = 0;
    }
    connection = null;
    outstandingPingAt = 0;
  };

  const snapshot = () => ({
    running: Boolean(timer),
    observedState,
    observedStateAt,
    outstandingPingAt,
    intervalMs: checkInterval,
    pongTimeoutMs: pongTimeout,
    transitionTimeoutMs: transitionTimeout,
  });

  return {
    check,
    probe,
    setConnection,
    start,
    stop,
    snapshot,
  };
};
