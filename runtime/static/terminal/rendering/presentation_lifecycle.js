import { createTerminalFrameReleaseScheduler } from "./terminal_frame_release_scheduler.js";

export function createTerminalPresentationLifecycle({
  windowObject = globalThis.window,
  workScheduler = null,
  registerSessionCleanup = () => {},
  isCanvasElement = () => false,
  frameReleaseScheduler = createTerminalFrameReleaseScheduler({
    requestFrame: (callback) => windowObject.requestAnimationFrame(callback),
    cancelFrame: (handle) => windowObject.cancelAnimationFrame(handle),
  }),
} = {}) {
  const installed = new WeakMap();
  const sessions = new Set();
  let disposed = false;

  const clearTimeoutField = (session, field) => {
    if (!session?.[field]) {
      return false;
    }
    windowObject.clearTimeout(session[field]);
    session[field] = 0;
    return true;
  };

  const cancelPresentationFrame = (session) => {
    if (!session) {
      return false;
    }
    if (session.presentationFrameHandle) {
      windowObject.cancelAnimationFrame(session.presentationFrameHandle);
    }
    const hadFrame = Boolean(session.presentationFrameHandle || session.presentationFramePending);
    workScheduler?.cancel(session, "presentation");
    session.presentationFrameHandle = 0;
    session.presentationFramePending = false;
    session.presentationFrameReason = "";
    return hadFrame;
  };

  const schedulePresentationFrame = (session, reason, callback) => {
    if (disposed || !session || session.closed || session.presentationFramePending || typeof callback !== "function") {
      return false;
    }
    session.presentationFramePending = true;
    session.presentationFrameReason = String(reason || "presentation_frame");
    const run = () => {
      session.presentationFrameHandle = 0;
      session.presentationFramePending = false;
      const frameReason = session.presentationFrameReason || reason;
      session.presentationFrameReason = "";
      if (!disposed) {
        callback(frameReason);
      }
    };
    if (workScheduler) {
      workScheduler.schedule(session, "presentation", run, { priority: () => 2 });
    } else {
      session.presentationFrameHandle = windowObject.requestAnimationFrame(run);
    }
    return true;
  };

  const scheduleTimeoutField = (session, field, delay, callback) => {
    if (disposed || !session || session.closed || typeof callback !== "function") {
      return false;
    }
    clearTimeoutField(session, field);
    session[field] = windowObject.setTimeout(() => {
      session[field] = 0;
      if (!disposed) {
        callback();
      }
    }, Math.max(0, Number(delay) || 0));
    return true;
  };

  const cleanupSession = (session) => {
    if (!session) {
      return false;
    }
    clearTimeoutField(session, "fullRenderValidationTimer");
    clearTimeoutField(session, "presentationRetryTimer");
    cancelPresentationFrame(session);
    frameReleaseScheduler.cancel(session);
    const cleanup = installed.get(session);
    installed.delete(session);
    sessions.delete(session);
    cleanup?.();
    return Boolean(cleanup);
  };

  const installSession = (session, {
    onContextLost,
    onContextRestored,
    onRender,
  } = {}) => {
    if (disposed || !session || session.closed || installed.has(session)) {
      return false;
    }
    const canvas = session?.term?.canvas || session?.term?.renderer?.getCanvas?.();
    const handleContextLost = (event) => onContextLost?.(event);
    const handleContextRestored = (event) => onContextRestored?.(event);
    if (isCanvasElement(canvas)) {
      canvas.addEventListener("contextlost", handleContextLost);
      canvas.addEventListener("contextrestored", handleContextRestored);
    }
    const renderDisposable = typeof session.term?.onRender === "function"
      ? session.term.onRender(() => onRender?.())
      : null;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (isCanvasElement(canvas)) {
        canvas.removeEventListener("contextlost", handleContextLost);
        canvas.removeEventListener("contextrestored", handleContextRestored);
      }
      renderDisposable?.dispose?.();
    };
    installed.set(session, cleanup);
    sessions.add(session);
    registerSessionCleanup(session, () => cleanupSession(session));
    return true;
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    for (const session of Array.from(sessions)) {
      cleanupSession(session);
    }
    frameReleaseScheduler.dispose();
    return true;
  };

  return Object.freeze({
    cancelFrameRelease: (session) => frameReleaseScheduler.cancel(session),
    cancelPresentationFrame,
    cleanupSession,
    clearTimeoutField,
    dispose,
    installSession,
    scheduleFrameRelease: (session, options) => !disposed && frameReleaseScheduler.schedule(session, options),
    schedulePresentationFrame,
    scheduleTimeoutField,
  });
}
