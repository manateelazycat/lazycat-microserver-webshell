import { createDebugLog } from "./debug_log.js";
import {
  createDiagnosticsLifecycle,
  createInitializationPerformanceLifecycle,
  createNetworkMonitorLifecycle,
} from "./diagnostics_lifecycle.js";
import { createDiagnosticsView } from "./diagnostics_view.js";
import { createInitializationPerformance } from "./initialization_performance.js";
import { createPerformanceMeter } from "./performance_meter.js";
import { createPerformanceTaskMonitor } from "./performance_tasks.js";
import {
  createTerminalTimeline,
  createTerminalRuntimeTimeline,
  recordTerminalRuntimeMaxMetric,
  recordTerminalRuntimeMetric,
} from "./terminal_timeline.js";

const defaultNow = () => (
  globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now()
);

export function createDiagnosticsController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  consoleObject = globalThis.console,
  storage = windowObject?.localStorage,
  storagePrefix = "webshell",
  terminalArea = null,
  startupDiagnostics = null,
  getNetworkContext = () => ({}),
  copyText = async () => false,
  showToast = () => {},
  onDebugModeChange = () => {},
  now = defaultNow,
  networkModuleLoader,
  } = {}) {
  const storageKeys = {
    debugMode: `${storagePrefix}.debugMode`,
    debugLog: `${storagePrefix}.debugLog`,
    networkMonitor: `${storagePrefix}.networkMonitor`,
    networkConsumption: `${storagePrefix}.networkConsumption`,
    historyReplayCalibration: `${storagePrefix}.historyReplayCalibration`,
    performanceMeter: `${storagePrefix}.performanceMeter`,
    performanceTasks: `${storagePrefix}.performanceTasks`,
    initializationPerformance: `${storagePrefix}.initializationPerformance`,
  };
  const readStoredFlag = (key) => {
    try {
      return storage?.getItem?.(key) === "true";
    } catch (error) {
      return false;
    }
  };
  const writeStoredFlag = (key, enabled) => {
    try {
      storage?.setItem?.(key, enabled ? "true" : "false");
    } catch (error) {
    }
  };
  const state = {
    debugMode: readStoredFlag(storageKeys.debugMode),
    debugLog: readStoredFlag(storageKeys.debugLog),
    networkMonitor: readStoredFlag(storageKeys.networkMonitor),
    networkConsumption: readStoredFlag(storageKeys.networkConsumption),
    historyReplayCalibration: readStoredFlag(storageKeys.historyReplayCalibration),
    performanceMeter: readStoredFlag(storageKeys.performanceMeter),
    performanceTasks: readStoredFlag(storageKeys.performanceTasks),
    initializationPerformance: readStoredFlag(storageKeys.initializationPerformance),
  };
  let started = false;
  let disposed = false;
  let resumeGeneration = 0;
  const view = createDiagnosticsView({ documentObject });
  let networkSnapshot = null;

  let initializationPerformance = null;
  const initializationPerformanceLifecycle = createInitializationPerformanceLifecycle({
    windowObject,
    onTick: () => initializationPerformance?.refresh?.(),
  });
  initializationPerformance = createInitializationPerformance({
    startupDiagnostics,
    now,
    onChange: (snapshot) => {
      const visible = state.debugMode && state.initializationPerformance && !disposed;
      view.renderInitializationPerformance(snapshot, { visible });
      initializationPerformanceLifecycle.setActive(
        started && visible && snapshot.status === "collecting",
      );
    },
  });
  initializationPerformance.setEnabled(state.debugMode && state.initializationPerformance);
  const debugLog = createDebugLog({
    windowObject,
    consoleObject,
    onChange: (entries) => view.renderDebugLog(entries, {
      visible: state.debugMode && state.debugLog && !disposed,
    }),
  });
  const performanceTaskMonitor = createPerformanceTaskMonitor({
    onChange: () => view.renderPerformanceTasks(
      performanceTaskMonitor.snapshot({ limit: 10 }),
      { visible: state.debugMode && state.performanceTasks && started && !disposed },
    ),
  });
  const performanceMeter = createPerformanceMeter({
    documentObject,
    windowObject,
    container: terminalArea,
  });
  const networkMonitorLifecycle = createNetworkMonitorLifecycle({
    windowObject,
    moduleLoader: networkModuleLoader,
    getContext: getNetworkContext,
    onRender: (snapshot, context) => {
      networkSnapshot = snapshot || null;
      const networkVisible = state.debugMode && state.networkMonitor && started && !disposed;
      view.renderNetworkMonitor(snapshot, {
        ...context,
        visible: networkVisible,
      });
      view.renderNetworkConsumption(snapshot, {
        visible: networkVisible && state.networkConsumption,
      });
      view.renderHistoryReplayCalibration(snapshot, {
        visible: networkVisible && state.historyReplayCalibration,
      });
    },
    onError: (error) => debugLog.append("error", "网络监视器加载失败", error?.message || String(error)),
  });

  const appendLog = (level, message, details = "", options = {}) => (
    debugLog.append(level, message, details, options)
  );
  const appendError = (message, details = "") => appendLog("error", message, details);
  const appendWarning = (message, details = "") => appendLog("warn", message, details);
  const appendStartupTrace = (event, details = "", { dedupeKey = event, diagnosticDetails = {} } = {}) => {
    const moduleStartedAt = startupDiagnostics?.getMetric?.("moduleStartedAt") || 0;
    const elapsed = Math.max(0, Math.round(now() - moduleStartedAt));
    appendLog("info", `[startup +${elapsed}ms] ${event}`, details, {
      dedupeKey: `startup:${dedupeKey}`,
      retainWhenDisabled: true,
    });
    initializationPerformance.recordStartupEvent(event, diagnosticDetails);
  };
  const detachStartupTrace = startupDiagnostics?.setTraceSink?.(appendStartupTrace) || (() => {});
  const terminalTimeline = createTerminalTimeline({
    now,
    appendLog,
    isLogEnabled: () => state.debugLog,
    getRuntimeContext: () => ({ resumeGeneration }),
  });
  const runtimeTimeline = createTerminalRuntimeTimeline({
    now,
    appendLog,
    isLogEnabled: () => state.debugLog,
  });
  const recordRuntimeEvent = (type, details = {}) => {
    const nextGeneration = Number(details?.resumeGeneration || 0);
    if (nextGeneration > 0) {
      resumeGeneration = Math.max(resumeGeneration, nextGeneration);
    }
    return runtimeTimeline.record(type, {
      ...details,
      resumeGeneration: nextGeneration || resumeGeneration,
    });
  };

  const applyState = ({ notifyDebugMode = false } = {}) => {
    view.syncControls(state);
    const debugLogActive = state.debugMode && state.debugLog && !disposed;
    debugLog.setState({ capture: debugLogActive, show: debugLogActive });
    const runtimeActive = started && !disposed && state.debugMode;
    initializationPerformance.setEnabled(!disposed && state.debugMode && state.initializationPerformance);
    view.renderInitializationPerformance(initializationPerformance.snapshot(), {
      visible: state.debugMode && state.initializationPerformance && !disposed,
    });
    performanceMeter.setActive(runtimeActive && state.performanceMeter);
    performanceTaskMonitor.setEnabled(runtimeActive && state.performanceTasks);
    view.renderPerformanceTasks(performanceTaskMonitor.snapshot({ limit: 10 }), {
      visible: runtimeActive && state.performanceTasks,
    });
    networkMonitorLifecycle.setActive(runtimeActive && state.networkMonitor);
    networkMonitorLifecycle.refresh();
    if (notifyDebugMode) {
      onDebugModeChange(state.debugMode);
    }
  };

  const updateFlag = (key, element, { notifyDebugMode = false } = {}) => {
    state[key] = element?.checked === true;
    writeStoredFlag(storageKeys[key], state[key]);
    applyState({ notifyDebugMode });
  };

  const lifecycle = createDiagnosticsLifecycle({
    elements: view.elements,
    handlers: {
      onDebugModeChange: () => updateFlag("debugMode", view.elements.settingsDebugModeToggle, { notifyDebugMode: true }),
      onDebugLogChange: () => {
        updateFlag("debugLog", view.elements.settingsDebugLogToggle);
        if (state.debugLog) {
          appendLog("info", "错误日志已启用");
        }
      },
      onNetworkMonitorChange: () => updateFlag("networkMonitor", view.elements.settingsNetworkMonitorToggle),
      onNetworkConsumptionChange: () => updateFlag("networkConsumption", view.elements.settingsNetworkConsumptionToggle),
      onHistoryReplayCalibrationChange: () => updateFlag("historyReplayCalibration", view.elements.settingsHistoryReplayCalibrationToggle),
      onNetworkConsumptionCopy: async () => {
        if (!networkSnapshot) {
          showToast("暂无可复制的流量消费数据。");
          return;
        }
        const text = view.networkConsumptionClipboardText(networkSnapshot);
        try {
          if (await copyText(text)) {
            showToast("流量消费统计已复制。");
            return;
          }
        } catch (error) {
        }
        showToast("复制流量消费统计失败。");
      },
      onPerformanceMeterChange: () => updateFlag("performanceMeter", view.elements.settingsPerformanceMeterToggle),
      onPerformanceTasksChange: () => updateFlag("performanceTasks", view.elements.settingsPerformanceTasksToggle),
      onInitializationPerformanceChange: () => updateFlag("initializationPerformance", view.elements.settingsInitializationPerformanceToggle),
      onInitializationPerformanceCopy: async () => {
        const text = view.initializationPerformanceClipboardText(initializationPerformance.snapshot());
        try {
          if (await copyText(text)) {
            showToast("初始化性能数据已复制。");
            return;
          }
        } catch (error) {
        }
        showToast("复制初始化性能数据失败。");
      },
      onDebugLogCopy: async () => {
        const text = debugLog.clipboardText();
        if (!text) {
          showToast("暂无可复制的调试日志。");
          return;
        }
        try {
          if (await copyText(text)) {
            showToast("调试日志已复制。");
            return;
          }
        } catch (error) {
        }
        showToast("复制调试日志失败。");
      },
      onDebugLogClear: () => debugLog.clear(),
    },
  });

  // Restore early error capture before bootstrap starts; timers and RAF wait for start().
  debugLog.setState({
    capture: state.debugMode && state.debugLog,
    show: state.debugMode && state.debugLog,
  });
  view.syncControls(state);

  return {
    appendError,
    appendLog,
    appendStartupTrace,
    appendWarning,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      lifecycle.dispose();
      networkMonitorLifecycle.dispose();
      performanceTaskMonitor.setEnabled(false);
      initializationPerformanceLifecycle.dispose();
      initializationPerformance.dispose();
      performanceMeter.dispose();
      debugLog.dispose();
      detachStartupTrace();
    },
    isDebugLogEnabled() {
      return state.debugLog;
    },
    isDebugModeEnabled() {
      return state.debugMode;
    },
    measurePerformanceTask(name, fn) {
      return performanceTaskMonitor.measure(name, fn);
    },
    now,
    recordPerformanceTask(name, durationMs) {
      performanceTaskMonitor.record(name, durationMs);
    },
    recordTerminalRuntimeMaxMetric,
    recordTerminalRuntimeMetric,
    recordTerminalSessionEvent(session, event, details = {}) {
      const result = terminalTimeline.record(session, event, details);
      initializationPerformance.recordTerminalEvent(session, event, details);
      return result;
    },
    recordRuntimeEvent,
    refreshNetworkView() {
      networkMonitorLifecycle.refresh();
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start();
      applyState({ notifyDebugMode: true });
    },
    syncControls() {
      view.syncControls(state);
      view.renderDebugLog(debugLog.snapshot(), {
        visible: state.debugMode && state.debugLog && !disposed,
      });
      view.renderInitializationPerformance(initializationPerformance.snapshot(), {
        visible: state.debugMode && state.initializationPerformance && !disposed,
      });
      view.renderPerformanceTasks(performanceTaskMonitor.snapshot({ limit: 10 }), {
        visible: started && state.debugMode && state.performanceTasks && !disposed,
      });
      networkMonitorLifecycle.refresh();
    },
    syncNetworkSockets(options = {}) {
      networkMonitorLifecycle.syncSockets(options);
    },
    terminalTimelineSnapshot(session) {
      return terminalTimeline.snapshot(session);
    },
    runtimeTimelineSnapshot() {
      return runtimeTimeline.snapshot();
    },
  };
}
