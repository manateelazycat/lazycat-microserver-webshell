const noop = () => {};

export function createTerminalTransportRuntimeLifecycle({
  windowObject = globalThis.window,
  queueMicrotaskImpl = (callback) => queueMicrotask(callback),
} = {}) {
  const priorityTimers = new WeakMap();
  const retryTimers = new WeakMap();
  const retryAttempts = new WeakMap();
  const measurementFrames = new WeakMap();
  const measurementAttempts = new WeakMap();
  let syncScheduled = false;
  let syncTimer = 0;
  let disposed = false;

  const clearPriorityDecay = (session) => {
    const timer = session ? priorityTimers.get(session) : 0;
    if (!timer) {
      return false;
    }
    windowObject?.clearTimeout?.(timer);
    priorityTimers.delete(session);
    return true;
  };

  const schedulePriorityDecay = (session, callback = noop, delay = 0) => {
    if (disposed || !session) {
      return false;
    }
    clearPriorityDecay(session);
    const timer = windowObject?.setTimeout?.(() => {
      if (priorityTimers.get(session) !== timer) {
        return;
      }
      priorityTimers.delete(session);
      if (!disposed) {
        callback();
      }
    }, delay) || 0;
    if (!timer) {
      return false;
    }
    priorityTimers.set(session, timer);
    return true;
  };

  const clearUnifiedRetry = (session, { resetAttempts = false } = {}) => {
    const timer = session ? retryTimers.get(session) : 0;
    if (timer) {
      windowObject?.clearTimeout?.(timer);
      retryTimers.delete(session);
    }
    if (session && resetAttempts) {
      retryAttempts.delete(session);
    }
    return Boolean(timer);
  };

  const scheduleUnifiedRetry = (session, callback = noop, delay = 0) => {
    if (disposed || !session || retryTimers.has(session)) {
      return false;
    }
    const timer = windowObject?.setTimeout?.(() => {
      if (retryTimers.get(session) !== timer) {
        return;
      }
      retryTimers.delete(session);
      if (!disposed) {
        callback();
      }
    }, delay) || 0;
    if (!timer) {
      return false;
    }
    retryTimers.set(session, timer);
    return true;
  };

  const incrementUnifiedRetryAttempt = (session) => {
    const attempt = Math.min(20, Number(retryAttempts.get(session) || 0) + 1);
    retryAttempts.set(session, attempt);
    return attempt;
  };

  const clearMeasurement = (session) => {
    const frame = session ? measurementFrames.get(session) : 0;
    if (!frame) {
      return false;
    }
    windowObject?.cancelAnimationFrame?.(frame);
    measurementFrames.delete(session);
    return true;
  };

  const scheduleMeasurement = (session, callback = noop, { maxAttempts = 4 } = {}) => {
    if (
      disposed
      || !session
      || measurementFrames.has(session)
      || Number(measurementAttempts.get(session) || 0) >= maxAttempts
    ) {
      return false;
    }
    const previousAttempts = Number(measurementAttempts.get(session) || 0);
    measurementAttempts.set(session, previousAttempts + 1);
    const frame = windowObject?.requestAnimationFrame?.(() => {
      if (measurementFrames.get(session) !== frame) {
        return;
      }
      measurementFrames.delete(session);
      if (!disposed) {
        callback();
      }
    }) || 0;
    if (!frame) {
      if (previousAttempts > 0) {
        measurementAttempts.set(session, previousAttempts);
      } else {
        measurementAttempts.delete(session);
      }
      return false;
    }
    measurementFrames.set(session, frame);
    return true;
  };

  const resetMeasurementAttempts = (session) => {
    if (session) {
      measurementAttempts.delete(session);
    }
  };

  const scheduleSync = (callback = noop) => {
    if (disposed || syncScheduled) {
      return false;
    }
    syncScheduled = true;
    queueMicrotaskImpl(() => {
      syncScheduled = false;
      if (!disposed) {
        callback();
      }
    });
    return true;
  };

  const disposeSession = (session) => {
    if (!session) {
      return false;
    }
    const priorityChanged = clearPriorityDecay(session);
    const retryChanged = clearUnifiedRetry(session, { resetAttempts: true });
    const measurementChanged = clearMeasurement(session);
    measurementAttempts.delete(session);
    return priorityChanged || retryChanged || measurementChanged;
  };

  const dispose = (sessions = []) => {
    if (disposed) {
      return false;
    }
    disposed = true;
    if (syncTimer) windowObject?.clearTimeout?.(syncTimer);
    syncTimer = 0;
    syncScheduled = false;
    for (const session of sessions) {
      clearPriorityDecay(session);
      clearUnifiedRetry(session, { resetAttempts: true });
      clearMeasurement(session);
      measurementAttempts.delete(session);
    }
    return true;
  };

  return Object.freeze({
    clearMeasurement,
    clearPriorityDecay,
    clearUnifiedRetry,
    dispose,
    disposeSession,
    getUnifiedRetryAttempts: (session) => Number(retryAttempts.get(session) || 0),
    hasUnifiedRetry: (session) => Boolean(session && retryTimers.has(session)),
    incrementUnifiedRetryAttempt,
    resetMeasurementAttempts,
    scheduleMeasurement,
    schedulePriorityDecay,
    scheduleSync,
    scheduleDeferredSync(callback, delay = 250) {
      if (disposed || syncTimer) return false;
      syncTimer = windowObject?.setTimeout?.(() => {
        syncTimer = 0;
        if (!disposed) callback();
      }, delay) || 0;
      return Boolean(syncTimer);
    },
    scheduleUnifiedRetry,
  });
}
