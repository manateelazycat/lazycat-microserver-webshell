export function createDiagnosticsLifecycle({ elements = {}, handlers = {} } = {}) {
  const listeners = [];
  let started = false;
  let disposed = false;

  const listen = (target, type, listener) => {
    if (!target?.addEventListener || typeof listener !== "function") {
      return;
    }
    target.addEventListener(type, listener);
    listeners.push([target, type, listener]);
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const [target, type, listener] of listeners.splice(0)) {
        target.removeEventListener?.(type, listener);
      }
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      listen(elements.settingsDebugModeToggle, "change", handlers.onDebugModeChange);
      listen(elements.settingsDebugLogToggle, "change", handlers.onDebugLogChange);
      listen(elements.settingsNetworkMonitorToggle, "change", handlers.onNetworkMonitorChange);
      listen(elements.settingsNetworkConsumptionToggle, "change", handlers.onNetworkConsumptionChange);
      listen(elements.settingsPerformanceMeterToggle, "change", handlers.onPerformanceMeterChange);
      listen(elements.settingsPerformanceTasksToggle, "change", handlers.onPerformanceTasksChange);
      listen(elements.settingsInitializationPerformanceToggle, "change", handlers.onInitializationPerformanceChange);
      listen(elements.initializationPerformanceCopy, "click", handlers.onInitializationPerformanceCopy);
      listen(elements.networkConsumptionCopy, "click", handlers.onNetworkConsumptionCopy);
      listen(elements.debugLogCopy, "click", handlers.onDebugLogCopy);
      listen(elements.debugLogClear, "click", handlers.onDebugLogClear);
    },
  };
}

export function createInitializationPerformanceLifecycle({
  windowObject = globalThis.window,
  intervalMs = 250,
  onTick = () => {},
} = {}) {
  let active = false;
  let disposed = false;
  let timer = 0;
  const stop = () => {
    if (timer) {
      windowObject?.clearInterval?.(timer);
      timer = 0;
    }
  };
  const start = () => {
    if (!active || disposed || timer || typeof windowObject?.setInterval !== "function") {
      return false;
    }
    timer = windowObject.setInterval(() => {
      if (!active || disposed) {
        stop();
        return;
      }
      onTick();
    }, Math.max(50, Number(intervalMs) || 250)) || 0;
    return Boolean(timer);
  };
  return Object.freeze({
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      active = false;
      stop();
      return true;
    },
    setActive(nextActive) {
      active = nextActive === true && !disposed;
      if (active) {
        start();
      } else {
        stop();
      }
      return active;
    },
    snapshot: () => Object.freeze({ active, running: Boolean(timer) }),
  });
}

const defaultModuleLoader = () => import("./network_monitor.js");

export function createNetworkMonitorLifecycle({
  windowObject = globalThis.window,
  sampleMs = 1000,
  moduleLoader = defaultModuleLoader,
  getContext = () => ({}),
  onRender = () => {},
  onError = () => {},
} = {}) {
  let active = false;
  let disposed = false;
  let monitor = null;
  let modulePromise = null;
  let sampleTimer = 0;
  let startGeneration = 0;

  const context = () => {
    const value = getContext?.() || {};
    return {
      sessions: Array.isArray(value.sessions) ? value.sessions : [],
      online: value.online !== false,
      retrying: value.retrying === true,
    };
  };

  const render = (state = monitor?.snapshot?.()) => {
    onRender(state || null, active ? context() : {});
  };

  const stop = () => {
    startGeneration += 1;
    if (sampleTimer) {
      windowObject?.clearInterval?.(sampleTimer);
      sampleTimer = 0;
    }
    monitor?.dispose?.();
    monitor = null;
    onRender(null, {});
  };

  const syncSockets = ({ reset = false } = {}) => {
    if (!active || !monitor) return false;
    const current = context();
    if (reset) monitor.reset();
    monitor.syncSessions(current.sessions);
    return true;
  };

  const start = async () => {
    if (!active || disposed) {
      stop();
      return;
    }
    if (monitor) {
      syncSockets();
      return;
    }
    const generation = ++startGeneration;
    render(null);
    modulePromise ||= moduleLoader();
    try {
      const module = await modulePromise;
      if (generation !== startGeneration || !active || disposed) {
        return;
      }
      monitor = module.createTerminalNetworkMonitor({
        onStateChange: (state) => render(state),
      });
      syncSockets();
      sampleTimer = windowObject?.setInterval?.(() => {
        if (!active || disposed) {
          stop();
          return;
        }
        monitor?.syncSessions?.(context().sessions);
        monitor?.sample?.();
      }, Math.max(100, Number(sampleMs) || 1000)) || 0;
    } catch (error) {
      if (generation === startGeneration && !disposed) {
        modulePromise = null;
        onError(error);
      }
    }
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      active = false;
      stop();
    },
    refresh() {
      if (active) render();
      else onRender(null, {});
    },
    setActive(nextActive) {
      active = nextActive === true && !disposed;
      if (active) {
        start();
      } else {
        stop();
      }
    },
    syncSockets,
  };
}
