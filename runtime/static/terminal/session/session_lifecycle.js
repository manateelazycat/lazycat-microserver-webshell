const noop = () => {};

export function createTerminalSessionLifecycle({
  adapters = {},
  windowObject = globalThis.window,
} = {}) {
  const cleanups = new WeakMap();
  const disposedSessions = new WeakSet();

  const invoke = (callback, ...args) => {
    if (typeof callback !== "function") {
      return;
    }
    try {
      callback(...args);
    } catch (error) {
    }
  };

  const clearTimeoutField = (session, field) => {
    if (!session?.[field]) {
      return;
    }
    invoke(windowObject?.clearTimeout?.bind(windowObject), session[field]);
    session[field] = 0;
  };

  const runCleanups = (session) => {
    const callbacks = cleanups.get(session) || [];
    cleanups.delete(session);
    for (const cleanup of callbacks) {
      invoke(cleanup);
    }
  };

  const disposeSession = (session) => {
    if (!session || session.closed || disposedSessions.has(session)) {
      return false;
    }


    // Logical close dispatch is synchronous. Mark the pane closed first so
    // its close callback cannot schedule a retry while disposal is running.
    session.closed = true;
    disposedSessions.add(session);
    invoke(session.replayController?.reset?.bind(session.replayController));
    session.queueReplayControllerActive = false;
    session.queueReplayControllerLegacy = false;
    invoke(adapters.detachLogicalStream, session, "session_closed");
    invoke(adapters.unregisterConnection, session, "session_closed");

    session.pendingInput = [];
    session.pendingInputSize = 0;
    invoke(adapters.clearPendingInputExpiry, session);
    session.inputBuffer = "";
    session.inputBufferSize = 0;
    invoke(adapters.clearInputFlushTimer, session);
    session.inputQueue = [];
    session.inputQueueSize = 0;
    invoke(adapters.clearInputPumpTimer, session);
    session.inputPumpActive = false;
    clearTimeoutField(session, "cursorBlinkHoldTimer");
    clearTimeoutField(session, "connectionPriorityTimer");
    invoke(adapters.clearReconnectTimer, session);
    invoke(adapters.clearConnectionTimers, session);
    invoke(adapters.clearUnifiedRetry, session, { resetAttempts: true });
    if (session.connectionMeasurementFrame) {
      invoke(windowObject?.cancelAnimationFrame?.bind(windowObject), session.connectionMeasurementFrame);
      session.connectionMeasurementFrame = 0;
    }
    invoke(adapters.cancelScheduledResize, session);
    invoke(adapters.disposeOutput, session);
    invoke(adapters.clearFullRenderValidation, session);
    invoke(adapters.clearPresentationRetry, session);
    invoke(adapters.cancelFrameRelease, session);
    invoke(adapters.releaseTerminalFrame, session);
    runCleanups(session);
    invoke(adapters.clearCanvasPixels, session);
    invoke(session.term?.dispose?.bind(session.term));
    invoke(session.shellEl?.remove?.bind(session.shellEl));
    return true;
  };

  const disposeAll = (sessions = []) => {
    let changed = false;
    for (const session of sessions || []) {
      changed = disposeSession(session) || changed;
    }
    return changed;
  };

  return Object.freeze({
    addCleanup(session, cleanup) {
      if (!session || typeof cleanup !== "function") {
        return noop;
      }
      if (disposedSessions.has(session) || session.closed) {
        invoke(cleanup);
        return noop;
      }
      const callbacks = cleanups.get(session) || [];
      callbacks.push(cleanup);
      cleanups.set(session, callbacks);
      return () => {
        const current = cleanups.get(session);
        const index = current?.indexOf(cleanup) ?? -1;
        if (index >= 0) {
          current.splice(index, 1);
        }
      };
    },

    dispose: disposeSession,
    disposeAll,

    isDisposed(session) {
      return Boolean(session && disposedSessions.has(session));
    },
  });
}
