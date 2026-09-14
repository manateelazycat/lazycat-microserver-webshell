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
    debugLogClear: byID("debugLogClear"),
    initializationPerformancePanel: byID("initializationPerformancePanel"),
    initializationPerformanceStatus: byID("initializationPerformanceStatus"),
    initializationPerformanceCopy: byID("initializationPerformanceCopy"),
    initializationPerformanceTotal: byID("initializationPerformanceTotal"),
    initializationPerformanceList: byID("initializationPerformanceList"),
    performanceTaskMeter: byID("performanceTaskMeter"),
    performanceTaskMeterList: byID("performanceTaskMeterList"),
    settingsDebugModeToggle: byID("settingsDebugModeToggle"),
    settingsDebugLogToggle: byID("settingsDebugLogToggle"),
    settingsNetworkMonitorToggle: byID("settingsNetworkMonitorToggle"),
    settingsDebugOptions: byID("settingsDebugOptions"),
    settingsInitializationPerformanceToggle: byID("settingsInitializationPerformanceToggle"),
    settingsPerformanceMeterToggle: byID("settingsPerformanceMeterToggle"),
    settingsPerformanceTasksToggle: byID("settingsPerformanceTasksToggle"),
    mobileActiveTabTitle: byID("mobileActiveTabTitle"),
    terminalNetworkMonitorPanel: byID("terminalNetworkMonitor"),
    terminalNetworkMonitorStatus: byID("terminalNetworkMonitorStatus"),
    terminalNetworkMonitorRate: byID("terminalNetworkMonitorRate"),
    terminalNetworkMonitorUsage: byID("terminalNetworkMonitorUsage"),
  };
  let initializationRowKeys = [];

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
    syncControls(state) {
      const debugMode = state.debugMode === true;
      if (elements.settingsDebugModeToggle) {
        elements.settingsDebugModeToggle.checked = debugMode;
      }
      if (elements.settingsDebugOptions) {
        elements.settingsDebugOptions.hidden = !debugMode;
      }
      for (const [element, checked] of [
        [elements.settingsInitializationPerformanceToggle, state.initializationPerformance],
        [elements.settingsDebugLogToggle, state.debugLog],
        [elements.settingsNetworkMonitorToggle, state.networkMonitor],
        [elements.settingsPerformanceMeterToggle, state.performanceMeter],
        [elements.settingsPerformanceTasksToggle, state.performanceTasks],
      ]) {
        if (element) {
          element.checked = checked === true;
          element.disabled = !debugMode;
        }
      }
    },
  };
}
