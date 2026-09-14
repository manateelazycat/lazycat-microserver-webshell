export function createTerminalOutputLifecycle({
  windowObject = globalThis.window,
  workScheduler = null,
  getPriority = () => 0,
} = {}) {
  const sessions = new Set();
  let disposed = false;

  const clear = (session) => {
    if (!session) {
      return false;
    }
    let cleared = false;
    cleared = workScheduler?.cancel(session, "output") || cleared;
    if (session.outputFlushFrame) {
      windowObject?.cancelAnimationFrame?.(session.outputFlushFrame);
      session.outputFlushFrame = 0;
      cleared = true;
    }
    if (session.outputFlushTimer) {
      windowObject?.clearTimeout?.(session.outputFlushTimer);
      session.outputFlushTimer = 0;
      cleared = true;
    }
    sessions.delete(session);
    return cleared;
  };

  return Object.freeze({
    schedule(session, callback, fallbackMs) {
      if (
        disposed
        || !session
        || session.closed
        || session.outputFlushFrame
        || session.outputFlushTimer
        || typeof callback !== "function"
      ) {
        return false;
      }
      sessions.add(session);
      if (workScheduler) {
        return workScheduler.schedule(session, "output", callback, { priority: () => getPriority(session) });
      }
      if (typeof windowObject?.requestAnimationFrame === "function") {
        session.outputFlushFrame = windowObject.requestAnimationFrame(callback);
      }
      session.outputFlushTimer = windowObject?.setTimeout?.(callback, fallbackMs) || 0;
      return true;
    },

    clear,

    disposeSession(session) {
      return clear(session);
    },

    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      for (const session of Array.from(sessions)) {
        clear(session);
      }
      sessions.clear();
      return true;
    },
  });
}
