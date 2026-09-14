const performanceTaskAlertThresholds = Object.freeze({
  count: 120,
  avgMs: 16,
  maxMs: 50,
  totalMs: 200,
});

const performanceTaskAlertThresholdsByName = Object.freeze({
  "device heartbeat": Object.freeze({
    count: 10,
    avgMs: 250,
    maxMs: 1000,
    totalMs: 2000,
  }),
});

const stateLabel = (state) => ({
  connecting: "连接中",
  open: "网络正常",
  closing: "正在重试",
  retrying: "正在重试",
  error: "网络异常",
  idle: "未启用",
})[state] || "未启用";

const formatMegabytes = (bytes) => (Math.max(0, Number(bytes) || 0) / 1_000_000).toFixed(3);

const formatTrafficBytes = (bytes) => {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(3)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} KB`;
  return `${Math.round(value)} B`;
};

const formatTrafficRate = (bytes) => `${formatTrafficBytes(bytes)}/s`;

const formatTaskMs = (value) => {
  const ms = Number(value);
  if (!Number.isFinite(ms)) {
    return "--";
  }
  if (ms >= 100) {
    return `${Math.round(ms)}ms`;
  }
  if (ms >= 10) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${ms.toFixed(2)}ms`;
};

const formatInitializationMs = (value) => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) {
    return "--";
  }
  return ms >= 100 ? `${Math.round(ms)}ms` : `${ms.toFixed(1)}ms`;
};

const initializationStatusLabel = (status) => ({
  idle: "未启用",
  collecting: "采集中",
  complete: "已完成",
})[status] || "采集中";

export function createDiagnosticsView({ documentObject = globalThis.document } = {}) {
  const byID = (id) => documentObject?.getElementById?.(id) || null;
  const elements = {
    debugLogPanel: byID("debugLogPanel"),
    debugLogList: byID("debugLogList"),
    debugLogCopy: byID("debugLogCopy"),
    debugLogDownload: byID("debugLogDownload"),
    debugLogClear: byID("debugLogClear"),
    initializationPerformancePanel: byID("initializationPerformancePanel"),
    initializationPerformanceStatus: byID("initializationPerformanceStatus"),
    initializationPerformanceCopy: byID("initializationPerformanceCopy"),
    initializationPerformanceDownload: byID("initializationPerformanceDownload"),
    initializationPerformanceTotal: byID("initializationPerformanceTotal"),
    initializationPerformanceList: byID("initializationPerformanceList"),
    performanceTaskMeter: byID("performanceTaskMeter"),
    performanceTaskMeterList: byID("performanceTaskMeterList"),
    settingsDebugModeToggle: byID("settingsDebugModeToggle"),
    settingsAutoScreenRefreshToggle: byID("settingsAutoScreenRefreshToggle"),
    settingsByteIOLogToggle: byID("settingsByteIOLogToggle"),
    byteIOLogPanel: byID("byteIOLogPanel"),
    byteIOLogCopy: byID("byteIOLogCopy"),
    byteIOLogDownload: byID("byteIOLogDownload"),
    byteIOLogList: byID("byteIOLogList"),
    settingsTerminalRenderCaptureToggle: byID("settingsTerminalRenderCaptureToggle"),
    terminalRenderCapturePanel: byID("terminalRenderCapturePanel"),
    terminalRenderCaptureNow: byID("terminalRenderCaptureNow"),
    terminalRenderCaptureCopy: byID("terminalRenderCaptureCopy"),
    terminalRenderCaptureDownload: byID("terminalRenderCaptureDownload"),
    terminalRenderCaptureList: byID("terminalRenderCaptureList"),
    settingsDebugLogToggle: byID("settingsDebugLogToggle"),
    settingsNetworkMonitorToggle: byID("settingsNetworkMonitorToggle"),
    settingsNetworkConsumptionToggle: byID("settingsNetworkConsumptionToggle"),
    settingsHistoryReplayCalibrationToggle: byID("settingsHistoryReplayCalibrationToggle"),
    settingsDebugOptions: byID("settingsDebugOptions"),
    settingsInitializationPerformanceToggle: byID("settingsInitializationPerformanceToggle"),
    settingsPerformanceMeterToggle: byID("settingsPerformanceMeterToggle"),
    settingsPerformanceTasksToggle: byID("settingsPerformanceTasksToggle"),
    mobileActiveTabTitle: byID("mobileActiveTabTitle"),
    terminalNetworkMonitorPanel: byID("terminalNetworkMonitor"),
    terminalNetworkMonitorStatus: byID("terminalNetworkMonitorStatus"),
    terminalNetworkMonitorRate: byID("terminalNetworkMonitorRate"),
    terminalNetworkMonitorUsage: byID("terminalNetworkMonitorUsage"),
    networkConsumptionPanel: byID("networkConsumptionPanel"),
    networkConsumptionTotal: byID("networkConsumptionTotal"),
    networkConsumptionList: byID("networkConsumptionList"),
    networkConsumptionCopy: byID("networkConsumptionCopy"),
    networkConsumptionDownload: byID("networkConsumptionDownload"),
  };
  let initializationRowKeys = [];
  const networkConsumptionRows = new Map();

  const initializationRowKey = (row) => row?.pending === true
    ? `pending:${row.source || ""}:${row.label || row.name || ""}`
    : `event:${row.source || ""}:${row.name || ""}:${Number(row.elapsedMs || 0)}`;

  const updateInitializationRow = (row, rowData) => {
    if (!row) {
      return;
    }
    const name = row.querySelector?.(".initialization-performance-name");
    const duration = row.querySelector?.(".initialization-performance-duration");
    const elapsed = row.querySelector?.(".initialization-performance-elapsed");
    if (name) {
      name.textContent = rowData.label || rowData.name || "初始化事件";
    }
    if (duration) {
      duration.textContent = formatInitializationMs(rowData.durationMs);
    }
    if (elapsed) {
      elapsed.textContent = `累计 ${formatInitializationMs(rowData.elapsedMs)}`;
    }
  };

  const createInitializationRow = (rowData) => {
    const row = documentObject.createElement("div");
    row.className = "initialization-performance-row";
    if (rowData.pending === true) {
      row.classList.add("is-pending");
    }
    const name = documentObject.createElement("span");
    name.className = "initialization-performance-name";
    const duration = documentObject.createElement("strong");
    duration.className = "initialization-performance-duration";
    const elapsed = documentObject.createElement("small");
    elapsed.className = "initialization-performance-elapsed";
    row.append(name, duration, elapsed);
    updateInitializationRow(row, rowData);
    return row;
  };

  const appendTaskCell = (row, text, className = "performance-task-value", alert = false) => {
    const cell = documentObject.createElement("span");
    cell.className = className;
    if (alert) {
      cell.classList.add("is-alert");
    }
    cell.textContent = text;
    row.appendChild(cell);
  };

  const taskAlert = (name, field, value) => {
    const thresholds = performanceTaskAlertThresholdsByName[name] || performanceTaskAlertThresholds;
    return Number.isFinite(thresholds?.[field]) && Number(value) >= thresholds[field];
  };

  const emptyNetworkState = () => ({
    status: "idle",
    receivedBytes: 0,
    sentBytes: 0,
    totalBytes: 0,
    receivedBytesPerSecond: 0,
    sentBytesPerSecond: 0,
    bytesPerSecond: 0,
    tabs: [],
    consumers: [],
    historyCalibrations: [],
  });

  const renderTabNetworkMetrics = (tabs = [], visible = false) => {
    const metricsByTab = new Map(tabs.map((tab) => [String(tab.tabId || ""), tab]));
    for (const button of documentObject?.querySelectorAll?.(".tab") || []) {
      const metrics = button.querySelector?.(".tab-network-metrics");
      if (!metrics) continue;
      const tab = metricsByTab.get(String(button.dataset?.tabId || ""));
      metrics.hidden = !visible;
      if (visible) {
        metrics.textContent = `${formatMegabytes(tab?.bytesPerSecond)} MB/s - ${formatMegabytes(tab?.totalBytes)} MB`;
      } else {
        metrics.textContent = "";
      }
    }
  };

  return {
    elements,
    renderDebugLog(entries, { visible = false } = {}) {
      if (!elements.debugLogPanel || !elements.debugLogList) {
        return;
      }
      elements.debugLogPanel.hidden = !visible;
      elements.debugLogList.textContent = "";
      for (const entry of entries || []) {
        const row = documentObject.createElement("div");
        row.className = `debug-log-entry debug-log-entry-${entry.level}`;
        const time = documentObject.createElement("time");
        time.className = "debug-log-entry-time";
        time.textContent = entry.time;
        row.append(time);
        if (entry.level === "error") {
          const level = documentObject.createElement("span");
          level.className = "debug-log-entry-level debug-log-entry-level-error";
          level.textContent = "错误";
          row.append(level);
        }
        if (entry.count > 1) {
          const count = documentObject.createElement("span");
          count.className = "debug-log-entry-count";
          count.textContent = `x${entry.count}`;
          row.append(count);
        }
        const message = documentObject.createElement("span");
        message.className = "debug-log-entry-message";
        message.textContent = entry.message;
        row.append(message);
        elements.debugLogList.appendChild(row);
      }
      elements.debugLogList.scrollTop = elements.debugLogList.scrollHeight;
    },
    networkConsumptionClipboardText(state, {
      capturedAt = new Date().toISOString(),
    } = {}) {
      const snapshot = state || emptyNetworkState();
      const metricFields = (item = {}) => ({
        received_bytes: Math.max(0, Number(item.receivedBytes) || 0),
        sent_bytes: Math.max(0, Number(item.sentBytes) || 0),
        total_bytes: Math.max(0, Number(item.totalBytes) || 0),
        received_bytes_per_second: Math.max(0, Number(item.receivedBytesPerSecond) || 0),
        sent_bytes_per_second: Math.max(0, Number(item.sentBytesPerSecond) || 0),
        bytes_per_second: Math.max(0, Number(item.bytesPerSecond) || 0),
      });
      return JSON.stringify({
        schema: "lightos-webshell.network-consumption.v1",
        captured_at: String(capturedAt || ""),
        network_status: String(snapshot.status || "idle"),
        totals: metricFields(snapshot),
        consumers: Array.from(snapshot.consumers || [], (consumer, index) => ({
          position: index + 1,
          id: String(consumer.id || ""),
          module: String(consumer.module || ""),
          task: String(consumer.task || ""),
          ...metricFields(consumer),
        })),
      }, null, 2);
    },
    renderNetworkConsumption(state, { visible = false } = {}) {
      if (!elements.networkConsumptionPanel || !elements.networkConsumptionList) return;
      elements.networkConsumptionPanel.hidden = !visible;
      if (!visible) return;
      const snapshot = state || emptyNetworkState();
      const consumers = Array.from(snapshot.consumers || []);
      if (elements.networkConsumptionTotal) {
        elements.networkConsumptionTotal.textContent = formatTrafficBytes(snapshot.totalBytes);
      }
      if (consumers.length === 0) {
        elements.networkConsumptionList.textContent = "";
        networkConsumptionRows.clear();
        return;
      }
      const consumerIDs = consumers.map((consumer) => String(consumer.id || ""));
      const renderedIDs = Array.from(networkConsumptionRows.keys());
      if (
        consumerIDs.length !== renderedIDs.length
        || consumerIDs.some((id, index) => id !== renderedIDs[index])
      ) {
        elements.networkConsumptionList.textContent = "";
        networkConsumptionRows.clear();
        for (const consumer of consumers) {
          const row = documentObject.createElement("div");
          row.className = "network-consumption-row";
          const cells = [
            "network-consumption-module",
            "network-consumption-task",
            "network-consumption-value",
            "network-consumption-value",
            "network-consumption-value",
            "network-consumption-value",
          ].map((className) => {
            const cell = documentObject.createElement("span");
            cell.className = className;
            row.appendChild(cell);
            return cell;
          });
          const id = String(consumer.id || "");
          networkConsumptionRows.set(id, cells);
          elements.networkConsumptionList.appendChild(row);
        }
      }
      for (const consumer of consumers) {
        const cells = networkConsumptionRows.get(String(consumer.id || ""));
        if (!cells) continue;
        const values = [
          String(consumer.module || ""),
          String(consumer.task || ""),
          formatTrafficRate(consumer.bytesPerSecond),
          formatTrafficBytes(consumer.receivedBytes),
          formatTrafficBytes(consumer.sentBytes),
          formatTrafficBytes(consumer.totalBytes),
        ];
        for (let index = 0; index < cells.length; index += 1) {
          cells[index].textContent = values[index];
          cells[index].title = values[index];
        }
      }
    },
    renderHistoryReplayCalibration(state, { visible = false } = {}) {
      const shells = Array.from(documentObject?.querySelectorAll?.(".pane-shell") || []);
      if (!visible) {
        for (const shell of shells) {
          const panel = shell.querySelector?.(".history-replay-calibration");
          if (panel) panel.hidden = true;
        }
        return;
      }
      const snapshot = state || emptyNetworkState();
      const calibrations = new Map(Array.from(snapshot.historyCalibrations || [], (item) => [
        String(item.sessionId || ""),
        item,
      ]));
      const stateLabels = {
        idle: "等待历史回放",
        replaying: "正在校准历史回放",
        normal: "历史回放消费正常",
        high: "异常：历史回放消费大于本次应回放字节",
        low: "异常：历史回放消费不足本次应回放字节的一半",
        incomplete: "未完整采集本次快照回放",
      };
      for (const shell of shells) {
        const calibration = calibrations.get(String(shell.dataset?.paneId || "")) || {};
        let panel = shell.querySelector?.(".history-replay-calibration");
        if (!panel) {
          panel = documentObject.createElement("div");
          panel.className = "history-replay-calibration";
          const status = documentObject.createElement("span");
          status.className = "history-replay-calibration-status";
          status.setAttribute("aria-hidden", "true");
          panel.appendChild(status);
          for (const [label, valueClass] of [
            ["当前历史回放流量消费", "history-replay-consumption-value"],
            ["当前会话历史总字节大小", "history-replay-total-value"],
          ]) {
            const metric = documentObject.createElement("span");
            metric.className = "history-replay-calibration-metric";
            metric.append(`${label} `);
            const value = documentObject.createElement("strong");
            value.className = valueClass;
            value.textContent = "0.000 MB";
            metric.appendChild(value);
            panel.appendChild(metric);
          }
          shell.appendChild(panel);
        }
        const replayBytes = Math.max(0, Number(calibration.replayBytes) || 0);
        const historyBytes = Math.max(0, Number(calibration.serverHistoryTotalBytes) || 0);
        const calibrationState = String(calibration.state || "idle");
        const consumption = panel.querySelector?.(".history-replay-consumption-value");
        const total = panel.querySelector?.(".history-replay-total-value");
        if (consumption) consumption.textContent = `${formatMegabytes(replayBytes)} MB`;
        if (total) total.textContent = `${formatMegabytes(historyBytes)} MB`;
        panel.dataset.state = calibrationState;
        const stateLabel = stateLabels[calibrationState] || stateLabels.idle;
        const expected = formatMegabytes(calibration.expectedReplayBytes);
        const syncMode = String(calibration.syncMode || "unknown");
        const payloadScope = calibration.recoveryBaseline === "ghostty-memory-v1"
          ? "压缩快照载荷＋原始增量，不含 Base64/JSON 封装"
          : "原始历史回放载荷";
        const metricsLabel = `当前历史回放流量消费 ${formatMegabytes(replayBytes)} MB 当前会话历史总字节大小 ${formatMegabytes(historyBytes)} MB`;
        panel.setAttribute("aria-label", `${metricsLabel} ${stateLabel}`);
        panel.title = `${stateLabel} · 本次应回放 ${expected} MB · 模式 ${syncMode} · ${payloadScope}`;
        panel.hidden = false;
      }
    },
    renderNetworkMonitor(state, {
      visible = false,
      online = true,
      retrying = false,
    } = {}) {
      if (!elements.terminalNetworkMonitorPanel) {
        return;
      }
      elements.terminalNetworkMonitorPanel.hidden = !visible;
      if (elements.mobileActiveTabTitle) {
        elements.mobileActiveTabTitle.hidden = visible;
      }
      if (!visible) {
        renderTabNetworkMetrics([], false);
        return;
      }
      const snapshot = state || emptyNetworkState();
      let status = online === false ? "error" : String(snapshot.status || "idle");
      if (status === "idle" && retrying) {
        status = "retrying";
      }
      if (elements.terminalNetworkMonitorStatus) {
        const label = stateLabel(status);
        elements.terminalNetworkMonitorStatus.dataset.state = status;
        elements.terminalNetworkMonitorStatus.setAttribute("aria-label", label);
        elements.terminalNetworkMonitorStatus.title = label;
      }
      if (elements.terminalNetworkMonitorRate) {
        elements.terminalNetworkMonitorRate.textContent = `${formatMegabytes(snapshot.bytesPerSecond)} MB/s`;
      }
      if (elements.terminalNetworkMonitorUsage) {
        elements.terminalNetworkMonitorUsage.textContent = `${formatMegabytes(snapshot.totalBytes)} MB`;
      }
      renderTabNetworkMetrics(snapshot.tabs || [], true);
    },
    initializationPerformanceClipboardText(state) {
      const snapshot = state || {};
      const lines = [
        "初始化性能",
        `状态: ${initializationStatusLabel(snapshot.status)}`,
        `总耗时: ${formatInitializationMs(snapshot.totalMs)}`,
        `页面标识: ${snapshot.pageID || ""}`,
        `浏览器: ${snapshot.userAgent || ""}`,
        `时间基准 Unix ms: ${snapshot.timeOriginUnixMs || 0}`,
        `计时起点 performance.now ms: ${snapshot.startedAt || 0}（运行时启动，不含此前资源加载）`,
      ];
      if (snapshot.sessionID) {
        lines.push(`Session: ${snapshot.sessionID}`);
      }
      lines.push("时间线:");
      for (const row of snapshot.rows || []) {
        const source = row.source || "页面初始化";
        const label = row.label || row.name || "初始化事件";
        const eventName = row.name && row.name !== row.label ? ` (${row.name})` : "";
        const details = row.details && Object.keys(row.details).length > 0
          ? ` · 详情 ${JSON.stringify(row.details)}`
          : "";
        lines.push(`- [${source}] ${label}${eventName}: ${formatInitializationMs(row.durationMs)} · 累计 ${formatInitializationMs(row.elapsedMs)}${details}`);
      }
      return lines.join("\n");
    },
    renderInitializationPerformance(state, { visible = false } = {}) {
      if (elements.initializationPerformancePanel) {
        elements.initializationPerformancePanel.hidden = !visible;
      }
      if (elements.initializationPerformanceStatus) {
        elements.initializationPerformanceStatus.textContent = initializationStatusLabel(state?.status);
      }
      if (elements.initializationPerformanceTotal) {
        elements.initializationPerformanceTotal.textContent = formatInitializationMs(state?.totalMs);
      }
      if (!elements.initializationPerformanceList) {
        return;
      }
      const list = elements.initializationPerformanceList;
      const rows = Array.from(state?.rows || []);
      const nextKeys = rows.map(initializationRowKey);
      const clientHeight = Number(list.clientHeight || 0);
      const distanceFromEnd = Number(list.scrollHeight || 0) - Number(list.scrollTop || 0) - clientHeight;
      const followTail = clientHeight <= 0 || distanceFromEnd <= 8;
      const previousScrollTop = Number(list.scrollTop || 0);
      let commonPrefix = 0;
      while (
        commonPrefix < initializationRowKeys.length
        && commonPrefix < nextKeys.length
        && initializationRowKeys[commonPrefix] === nextKeys[commonPrefix]
      ) {
        commonPrefix += 1;
      }
      const children = Array.from(list.children || []);
      for (let index = children.length - 1; index >= commonPrefix; index -= 1) {
        children[index].remove();
      }
      for (let index = commonPrefix; index < rows.length; index += 1) {
        list.appendChild(createInitializationRow(rows[index]));
      }
      if (rows.length > 0 && commonPrefix === rows.length) {
        updateInitializationRow(list.children?.[rows.length - 1], rows.at(-1));
      }
      initializationRowKeys = nextKeys;
      if (followTail) {
        list.scrollTop = list.scrollHeight;
      } else {
        list.scrollTop = previousScrollTop;
      }
    },
    renderPerformanceTasks(rows, { visible = false } = {}) {
      if (elements.performanceTaskMeter) {
        elements.performanceTaskMeter.hidden = !visible;
      }
      if (!elements.performanceTaskMeterList) {
        return;
      }
      elements.performanceTaskMeterList.textContent = "";
      if (!visible) {
        return;
      }
      if (!rows?.length) {
        const empty = documentObject.createElement("div");
        empty.className = "performance-task-empty";
        empty.textContent = "暂无采样";
        elements.performanceTaskMeterList.appendChild(empty);
        return;
      }
      const header = documentObject.createElement("div");
      header.className = "performance-task-row header";
      appendTaskCell(header, "任务", "performance-task-name");
      appendTaskCell(header, "次数");
      appendTaskCell(header, "平均");
      appendTaskCell(header, "最大");
      appendTaskCell(header, "总计");
      elements.performanceTaskMeterList.appendChild(header);
      for (const item of rows) {
        const row = documentObject.createElement("div");
        row.className = "performance-task-row";
        appendTaskCell(row, item.name, "performance-task-name");
        appendTaskCell(row, String(item.count), "performance-task-value", taskAlert(item.name, "count", item.count));
        appendTaskCell(row, formatTaskMs(item.avg), "performance-task-value", taskAlert(item.name, "avgMs", item.avg));
        appendTaskCell(row, formatTaskMs(item.max), "performance-task-value", taskAlert(item.name, "maxMs", item.max));
        appendTaskCell(row, formatTaskMs(item.total), "performance-task-value", taskAlert(item.name, "totalMs", item.total));
        elements.performanceTaskMeterList.appendChild(row);
      }
    },
    renderByteIOLog(snapshot, { visible = false } = {}) {
      if (elements.byteIOLogPanel) elements.byteIOLogPanel.hidden = !visible;
      const list = elements.byteIOLogList;
      if (!list) return;
      if (!visible) { list.textContent = ""; return; }
      const follow = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
      list.textContent = `events=${snapshot.retained || 0}; dropped=${snapshot.dropped || 0}; showing latest 80\n`
        + snapshot.lines.join("\n");
      if (follow) list.scrollTop = list.scrollHeight;
    },
    renderTerminalRenderCapture(snapshot, { visible = false } = {}) {
      if (elements.terminalRenderCapturePanel) elements.terminalRenderCapturePanel.hidden = !visible;
      const list = elements.terminalRenderCaptureList;
      if (!list) return;
      if (!visible) { list.textContent = ""; return; }
      const follow = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
      list.textContent = `records=${snapshot.retained || 0}; dropped=${snapshot.dropped || 0}\n` + snapshot.lines.join("\n");
      if (follow) list.scrollTop = list.scrollHeight;
    },
    syncControls(state) {
      const debugMode = state.debugMode === true;
      if (elements.settingsDebugModeToggle) {
        elements.settingsDebugModeToggle.checked = debugMode;
      }
      if (elements.settingsDebugOptions) {
        elements.settingsDebugOptions.hidden = !debugMode;
      }
      for (const [element, checked] of [
        [elements.settingsAutoScreenRefreshToggle, state.autoScreenRefresh],
        [elements.settingsByteIOLogToggle, state.byteIOLog],
        [elements.settingsTerminalRenderCaptureToggle, state.terminalRenderCapture],
        [elements.settingsInitializationPerformanceToggle, state.initializationPerformance],
        [elements.settingsDebugLogToggle, state.debugLog],
        [elements.settingsNetworkMonitorToggle, state.networkMonitor],
        [elements.settingsNetworkConsumptionToggle, state.networkConsumption],
        [elements.settingsHistoryReplayCalibrationToggle, state.historyReplayCalibration],
        [elements.settingsPerformanceMeterToggle, state.performanceMeter],
        [elements.settingsPerformanceTasksToggle, state.performanceTasks],
      ]) {
        if (element) {
          element.checked = checked === true;
          element.disabled = !debugMode;
        }
      }
      if (elements.settingsNetworkConsumptionToggle) {
        elements.settingsNetworkConsumptionToggle.disabled = !debugMode || state.networkMonitor !== true;
      }
      if (elements.settingsHistoryReplayCalibrationToggle) {
        elements.settingsHistoryReplayCalibrationToggle.disabled = !debugMode || state.networkMonitor !== true;
      }
    },
  };
}
