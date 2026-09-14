import { createDebugLog } from "./debug_log.js";
import { createByteIOLog } from "./byte_io_log.js";
import { createTerminalRenderCapture } from "./terminal_render_capture.js";
import { createDiagnosticLogDownload } from "./log_download.js";
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
  onAutoScreenRefreshChange = () => {},
  getRenderCaptureContext = () => ({}),
  captureTerminalRenderState = () => ({}),
  now = defaultNow,
  networkModuleLoader,
  } = {}) {
  const storageKeys = {
    autoScreenRefresh: `${storagePrefix}.autoScreenRefresh`,
    byteIOLog: `${storagePrefix}.byteIOLog`,
    terminalRenderCapture: `${storagePrefix}.terminalRenderCapture`,
    debugMode: `${storagePrefix}.debugMode`,
    debugLog: `${storagePrefix}.debugLog`,
    networkMonitor: `${storagePrefix}.networkMonitor`,
    networkConsumption: `${storagePrefix}.networkConsumption`,
    historyReplayCalibration: `${storagePrefix}.historyReplayCalibration`,
    performanceMeter: `${storagePrefix}.performanceMeter`,
    performanceTasks: `${storagePrefix}.performanceTasks`,
    initializationPerformance: `${storagePrefix}.initializationPerformance`,
  };
  const readStoredFlag = (key, fallback = false) => {
    try {
      const value = storage?.getItem?.(key);
      return value === "true" ? true : value === "false" ? false : fallback;
    } catch (error) {
      return fallback;
    }
  };
  const writeStoredFlag = (key, enabled) => {
    try {
      storage?.setItem?.(key, enabled ? "true" : "false");
    } catch (error) {
    }
  };
  const state = {
    autoScreenRefresh: readStoredFlag(storageKeys.autoScreenRefresh, true),
    byteIOLog: readStoredFlag(storageKeys.byteIOLog),
    terminalRenderCapture: readStoredFlag(storageKeys.terminalRenderCapture),
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
  const byteIOLog = createByteIOLog({
    windowObject, now,
    onChange: (snapshot) => view.renderByteIOLog(snapshot, {
      visible: !disposed && state.debugMode && state.byteIOLog,
    }),
  });
  byteIOLog.setEnabled(state.debugMode && state.byteIOLog);
  const renderCapture = createTerminalRenderCapture({
    windowObject, documentObject, now,
    getContext: () => ({ ...getRenderCaptureContext(), autoScreenRefresh: state.autoScreenRefresh }),
    captureSession: captureTerminalRenderState,
    onChange: (snapshot) => view.renderTerminalRenderCapture(snapshot, {
      visible: !disposed && state.debugMode && state.terminalRenderCapture,
    }),
  });
  renderCapture.setEnabled(state.debugMode && state.terminalRenderCapture);
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
    byteIOLog.setEnabled(!disposed && state.debugMode && state.byteIOLog);
    renderCapture.setEnabled(!disposed && state.debugMode && state.terminalRenderCapture);
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

  const logDownload = createDiagnosticLogDownload({ documentObject, windowObject });
  const exportLog = {
    terminalRenderCapture: () => renderCapture.clipboardText(),
    byteIO: () => byteIOLog.clipboardText(),
    initializationPerformance: () => view.initializationPerformanceClipboardText(initializationPerformance.snapshot()),
    networkConsumption: () => networkSnapshot ? view.networkConsumptionClipboardText(networkSnapshot) : "",
    debug: () => debugLog.clipboardText(),
  };
  const downloadLog = async (kind, getText) => {
    if (disposed) return;
    try {
      const text = await getText();
      if (disposed) return;
      if (!text) { showToast("暂无可下载的日志。"); return; }
      logDownload.download(kind, text);
    } catch {
      showToast("下载日志失败。");
    }
  };

  const lifecycle = createDiagnosticsLifecycle({
    elements: view.elements,
    handlers: {
      onTerminalRenderCaptureDownload: () => downloadLog("terminal-render-capture", exportLog.terminalRenderCapture),
      onByteIOLogDownload: () => downloadLog("byte-io", exportLog.byteIO),
      onInitializationPerformanceDownload: () => downloadLog("initialization-performance", exportLog.initializationPerformance),
      onNetworkConsumptionDownload: () => downloadLog("network-consumption", exportLog.networkConsumption),
      onDebugLogDownload: () => downloadLog("debug", exportLog.debug),
      onTerminalRenderCaptureChange: () => updateFlag("terminalRenderCapture", view.elements.settingsTerminalRenderCaptureToggle),
      onTerminalRenderCaptureNow: () => renderCapture.capture("manual", true),
      onTerminalRenderCaptureCopy: async () => {
        try {
          if (await copyText(await exportLog.terminalRenderCapture())) {
            showToast("终端渲染异常捕获日志已复制。");
            return;
          }
        } catch {}
        showToast("复制终端渲染异常捕获日志失败。");
      },
      onByteIOLogChange: () => updateFlag("byteIOLog", view.elements.settingsByteIOLogToggle),
      onByteIOLogCopy: async () => {
        try {
          if (await copyText(exportLog.byteIO())) {
            showToast("字节io日志已复制。");
            return;
          }
        } catch {}
        showToast("复制字节io日志失败。");
      },
      onAutoScreenRefreshChange: () => {
        updateFlag("autoScreenRefresh", view.elements.settingsAutoScreenRefreshToggle);
        onAutoScreenRefreshChange(state.autoScreenRefresh);
      },
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
        const text = exportLog.networkConsumption();
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
        const text = exportLog.initializationPerformance();
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
        const text = exportLog.debug();
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
      logDownload.dispose();
      byteIOLog.dispose();
      renderCapture.dispose();
      view.renderTerminalRenderCapture({ lines: [] }, { visible: false });
      view.renderByteIOLog({ lines: [] }, { visible: false });
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
    isAutoScreenRefreshEnabled() {
      return !disposed && state.autoScreenRefresh;
    },
    isByteIOLogEnabled() {
      return byteIOLog.isEnabled();
    },
    stopTerminalRenderCapture() {
      renderCapture.setEnabled(false);
    },
    observeTerminalReplayBytes(session, data, options) {
      try { renderCapture.observeOutput(session, data, options); } catch {}
    },
    beginTerminalWriteComparison(session, data, options) {
      try { return renderCapture.beginWrite(session, data, options); } catch {}
    },
    isInitializationCollecting() {
      return initializationPerformance.isCollecting();
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
      try { renderCapture.record(session, event, details); } catch {}
      // Byte-level traces have their own bounded sink; do not duplicate them
      // in the generic timeline or cause its per-event DOM logging work.
      try { byteIOLog.record(session, event, details); } catch {}
      if (event.startsWith("byte_io_")) return;
      // Keep high-frequency IO events out of the older, DOM-heavy debug log.
      // Its existing startup diagnostics only need large or slow writes.
      if (details.operation === "write" && Number(details.bytes || 0) < 512 * 1024
        && (event === "backend_rpc_start" || (event === "backend_rpc_complete"
          && Number(details.roundTripMs || 0) < 50 && !details.error))) return;
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
      renderCapture.start();
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
