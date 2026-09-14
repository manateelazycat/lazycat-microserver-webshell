import { createTerminalResizeScheduler } from "./terminal_resize_scheduler.js";

const noop = () => {};

export function createTerminalResizeLifecycle({
  windowObject = globalThis.window,
  workScheduler = null,
  ResizeObserverCtor = globalThis.ResizeObserver,
  applyResize,
  registerSessionCleanup = noop,
  throttleMs = 80,
  settleMs = 120,
} = {}) {
  let disposed = false;
  const disposedSessions = new WeakSet();
  const observers = new WeakMap();
  const observedSessions = new Set();
  const terminalResizeDisposables = new WeakMap();
  const boundSessions = new Set();
  const sessionFrames = new WeakMap();
  const framedSessions = new Set();
  const tabFrames = new WeakMap();
  const framedTabs = new Set();
  const pendingResizes = new Map();
  const scheduler = createTerminalResizeScheduler({
    apply: (session, options, phase) => {
      if (disposed || disposedSessions.has(session) || session.closed) return;
      if (!workScheduler) return applyResize?.(session, options, phase);
      if (!phase.settled) return;
      const previous = pendingResizes.get(session) || {};
      const merged = { ...options };
      for (const key of ["forceFullRender", "hideUntilRender", "forceSizeSync", "claimSize"]) merged[key] ||= previous[key] === true;
      pendingResizes.set(session, merged);
      workScheduler.schedule(session, "resize", () => {
        const latest = pendingResizes.get(session);
        pendingResizes.delete(session);
        if (!disposed && !disposedSessions.has(session) && !session.closed && latest) applyResize?.(session, latest, phase);
      }, { priority: () => 2 });
    },
    throttleMs,
    settleMs,
    now: () => globalThis.performance?.now?.() || Date.now(),
    requestFrame: (callback) => windowObject.requestAnimationFrame(callback),
    cancelFrame: (frame) => windowObject.cancelAnimationFrame(frame),
    setTimer: (callback, delay) => windowObject.setTimeout(callback, delay),
    clearTimer: (timer) => windowObject.clearTimeout(timer),
  });

  const cancelSessionFrames = (session) => {
    const frames = sessionFrames.get(session);
    if (!frames) {
      return;
    }
    for (const frame of frames.values()) {
      windowObject.cancelAnimationFrame(frame);
    }
    sessionFrames.delete(session);
    framedSessions.delete(session);
  };

  const disposeSession = (session) => {
    if (!session) {
      return;
    }
    disposedSessions.add(session);
    pendingResizes.delete(session);
    workScheduler?.cancel(session, "resize");
    scheduler.cancel(session);
    cancelSessionFrames(session);
    observers.get(session)?.disconnect?.();
    observers.delete(session);
    observedSessions.delete(session);
    terminalResizeDisposables.get(session)?.dispose?.();
    terminalResizeDisposables.delete(session);
    boundSessions.delete(session);
  };

  return Object.freeze({
    schedule(session, options, scheduleOptions) {
      return !disposed && !disposedSessions.has(session) && scheduler.schedule(session, options, scheduleOptions);
    },

    flush(session) {
      return !disposed && scheduler.flush(session);
    },

    cancel(session) {
      pendingResizes.delete(session);
      workScheduler?.cancel(session, "resize");
      scheduler.cancel(session);
      cancelSessionFrames(session);
    },

    observeHost(session, callback) {
      if (disposed || disposedSessions.has(session) || !session?.terminalHost || typeof ResizeObserverCtor !== "function") {
        return noop;
      }
      observers.get(session)?.disconnect?.();
      const observer = new ResizeObserverCtor((...args) => {
        if (!disposed && !disposedSessions.has(session) && !session.closed) {
          callback?.(...args);
        }
      });
      observers.set(session, observer);
      observedSessions.add(session);
      observer.observe(session.terminalHost);
      const cleanup = () => {
        if (observers.get(session) === observer) {
          observer.disconnect();
          observers.delete(session);
          observedSessions.delete(session);
        }
      };
      registerSessionCleanup(session, cleanup);
      return cleanup;
    },

    bindTerminalResize(session, callback) {
      if (disposed || disposedSessions.has(session) || typeof session?.term?.onResize !== "function") {
        return noop;
      }
      terminalResizeDisposables.get(session)?.dispose?.();
      const disposable = session.term.onResize(() => {
        if (!disposed && !disposedSessions.has(session) && !session.closed) {
          callback?.();
        }
      });
      terminalResizeDisposables.set(session, disposable);
      boundSessions.add(session);
      const cleanup = () => {
        if (terminalResizeDisposables.get(session) === disposable) {
          disposable?.dispose?.();
          terminalResizeDisposables.delete(session);
          boundSessions.delete(session);
        }
      };
      registerSessionCleanup(session, cleanup);
      return cleanup;
    },

    scheduleSessionFrame(session, key, callback) {
      if (disposed || !session || disposedSessions.has(session) || session.closed) {
        return false;
      }
      let frames = sessionFrames.get(session);
      if (!frames) {
        frames = new Map();
        sessionFrames.set(session, frames);
        framedSessions.add(session);
      }
      const current = frames.get(key);
      if (current) {
        windowObject.cancelAnimationFrame(current);
      }
      const frame = windowObject.requestAnimationFrame(() => {
        frames.delete(key);
        if (frames.size === 0) {
          sessionFrames.delete(session);
          framedSessions.delete(session);
        }
        if (!disposed && !disposedSessions.has(session) && !session.closed) {
          callback?.();
        }
      });
      frames.set(key, frame);
      return true;
    },

    scheduleTabFrame(tab, callback, { immediate = false } = {}) {
      if (disposed || !tab) {
        return false;
      }
      const current = tabFrames.get(tab);
      if (current) {
        windowObject.cancelAnimationFrame(current);
        tabFrames.delete(tab);
      }
      if (immediate) {
        callback?.();
        return true;
      }
      const frame = windowObject.requestAnimationFrame(() => {
        tabFrames.delete(tab);
        framedTabs.delete(tab);
        if (!disposed) {
          callback?.();
        }
      });
      tabFrames.set(tab, frame);
      framedTabs.add(tab);
      return true;
    },

    cancelTab(tab) {
      const frame = tabFrames.get(tab);
      if (frame) {
        windowObject.cancelAnimationFrame(frame);
      }
      tabFrames.delete(tab);
      framedTabs.delete(tab);
    },

    disposeSession,

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const session of pendingResizes.keys()) workScheduler?.cancel(session, "resize");
      pendingResizes.clear();
      for (const session of observedSessions) {
        disposeSession(session);
      }
      for (const session of framedSessions) {
        disposeSession(session);
      }
      for (const session of boundSessions) {
        disposeSession(session);
      }
      for (const tab of framedTabs) {
        const frame = tabFrames.get(tab);
        if (frame) {
          windowObject.cancelAnimationFrame(frame);
        }
      }
      framedTabs.clear();
    },
  });
}
