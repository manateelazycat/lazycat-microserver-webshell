const startupMetricLabels = Object.freeze({
  navigationStartedAt: "页面开始",
  moduleStartedAt: "诊断模块启动",
  ghosttyReadyAt: "Ghostty 就绪",
  themeReadyAt: "主题就绪",
  settingsReadyAt: "设置就绪",
  instancesReadyAt: "实例列表就绪",
  workspaceRequestStartedAt: "工作区请求开始",
  workspaceReadyAt: "工作区数据就绪",
  workspaceAppliedAt: "工作区应用完成",
});

const terminalEventLabels = Object.freeze({
  connect_session_start: "逻辑层 socket 会话开始",
  socket_connect: "逻辑层 socket 连接开始",
  socket_open: "逻辑层 socket 已打开",
  physical_websocket_create_start: "物理 WebSocket 创建开始",
  physical_websocket_open: "物理 WebSocket 已打开",
  logical_subscriptions_sent: "逻辑层订阅已发送",
  physical_server_agent_prepare_start: "物理通道服务端 Agent 准备开始",
  physical_server_ready: "物理通道服务端已就绪",
  logical_attach_start: "服务端逻辑 attach 开始",
  agent_preparing: "Agent 准备",
  agent_attach_ready: "Agent attach 准备完成",
  history_replay_start: "历史回放开始",
  first_binary_output: "首个终端数据",
  history_replay_complete: "历史回放接收完成",
  replay_output_drained: "回放输出排空",
  resize_applied: "收到服务端尺寸确认",
  presentation_render_start: "终端渲染开始",
  full_render_start: "完整渲染开始",
  presentation_ready_state: "Presentation 就绪状态",
  render_blocked: "渲染被阻塞",
  full_render_request: "完整渲染请求",
  full_render_complete: "完整渲染完成",
  presentation_commit_complete: "终端渲染完成",
});

const terminalProgressRanks = new Map(
  Object.keys(terminalEventLabels).map((name, index) => [name, index + 1]),
);

// Diagnostic events must not advance the candidate session's startup rank.
const diagnosticEventLabels = Object.freeze({
  backend_created: "Worker 已创建",
  backend_restart: "Worker 重建开始",
  backend_rpc_start: "Worker 请求发出",
  backend_rpc_complete: "Worker 请求完成",
  backend_failed: "Worker 失败",
  resize_fence_cleared: "本地尺寸事务清理",
  resize_fence_queued: "本地尺寸更新等待调度",
  resize_observed_queued: "连续服务端尺寸等待按序应用",
  resize_native_start: "本地尺寸应用开始",
  resize_native_complete: "本地尺寸应用结果",
  resize_native_cancel: "本地尺寸应用取消",
  resize_native_error: "本地尺寸应用失败",
  resize_control_error: "收到服务端尺寸拒绝",
  term_resize: "本地终端尺寸已提交",
  replay_batch_begin: "整段历史接收开始",
  replay_batch_received: "整段历史接收完成",
  replay_batch_applied: "整段历史解析完成",
  replay_batch_interrupted: "历史按尺寸边界分段解析",
  terminal_process_exited: "终端进程已退出",
});

const initializationDetailKeys = new Set([
  "ready", "reason", "channel", "channelGeneration", "connectionEpoch",
  "physicalConnectionID", "physicalReadyState", "physicalOpenLatencyMs", "logicalStreamID", "logicalCount",
  "subscriptionRevision", "serverUnixMs", "serverPrepareDurationMs",
  "agentProtocolVersion", "preferredAgentProtocolVersion",
  "agentProtocolUpdateAvailable", "agentProtocolUpdateRequired",
  "serverAgentEnsureDurationMs", "serverAgentValidationDurationMs",
  "queueSubscriptionReceivedUnixMs", "queueWaitDurationMs", "processStartDurationMs",
  "subscriptionIndex", "subscriptionCount", "agentAttachStartedUnixMs",
  "agentWorkspaceReadyDurationMs", "agentPaneResolveDurationMs",
  "agentHistorySnapshotDurationMs", "agentAttachPrepareDurationMs",
  "connectionChannel", "connectionChannelGeneration", "attachGeneration",
  "historyGeneration", "resizeEpoch", "requestedResizeEpoch", "appliedResizeEpoch",
  "cols", "rows", "pixelWidth", "pixelHeight", "hostCssWidth", "hostCssHeight",
  "windowDevicePixelRatio", "rendererDevicePixelRatio", "serverCols", "serverRows",
  "requestedCols", "requestedRows", "requestedPixelWidth", "requestedPixelHeight",
  "documentHidden", "activeTab", "paneVisible", "measurable", "canvasMatches",
  "activationFitPending", "resizeFenceActive", "resizeAckPending",
  "resizeOutputSettleActive", "resizeEpochSupported", "requestedResizeEpoch",
  "appliedResizeEpoch", "presentedResizeEpoch", "pendingResizeEpoch",
  "pendingRenderFitGeneration", "pendingRenderReplayGeneration",
  "presentationHold", "presentationCommitPending",
  "fullRenderPending", "hasPresentedFrame", "renderReady", "retryPending",
  "retryAttempts", "retryReason", "renderGeneration", "measuredFitGeneration",
  "presentedFitGeneration", "terminalContentGeneration", "presentedContentGeneration",
  "presentedReplayGeneration", "terminalReplayGeneration", "receivedCursor",
  "appliedCursor", "presentedCursor", "receivedHistoryCursor", "appliedHistoryCursor",
  "presentedHistoryCursor", "targetCursor", "syncMode", "serverBaseCursor", "serverEndCursor",
  "deltaFromCursor", "deltaToCursor", "serverHistoryBytes", "serverHistoryChunks",
  "serverReplayFrames", "serverReplayStartedUnixMs", "serverReplayFinishedUnixMs",
  "serverReplayDurationMs", "replayDurationMs", "binaryMessages", "binaryBytes",
  "outputQueueBytes", "replayPhase", "stableReady", "presentationCommitted",
  "serverReplayDurationScope",
  "flushedBytes", "flushedEntries", "durationMs", "bytes", "terminalFrameHeld",
  "resizePresentationHold", "liveCanvas", "holdCanvas",
  "paneID", "tabID", "target", "eventAt", "backendCount", "workerGeneration",
  "requestID", "operation", "pendingRequests", "pendingBytes", "workerReady", "frameReady",
  "roundTripMs", "workerQueueMs", "workerExecutionMs", "wasmLoadMs", "engineCreateMs", "snapshotMs",
  "claim", "requestWasClaim", "remoteEpoch", "sizeClaimRequired", "sizeClaimed",
  "requestedResizeClaim", "pendingSizeClaim", "pendingCurrentDeviceClaim", "viewportGeometryClaimPending",
  "viewportGeometry", "geometryGeneration", "geometryPending", "geometryScheduled", "geometryDeferred",
  "geometryDeferredReason", "geometryReason", "geometry", "pendingGeometry", "currentGeometry",
  "layoutWidth", "layoutHeight", "visualWidth", "visualHeight", "screenWidth", "screenHeight", "devicePixelRatio", "orientation",
  "viewportHeight", "viewportReferenceHeight", "keyboardInsetBottom", "clientBottomSafeOffset",
  "keyboardActive", "resizeSuppressed", "resizeSuppressedUntil", "inputLocked",
  "replayGeometryLocked", "replayGeometryPending", "nativePending", "backendResizePending",
  "resizeFenceAckReceived", "cancelledScheduledTask", "committed", "current", "error",
  "resizeErrorEpoch", "ackEpoch", "inFlightEpoch", "appliedEpoch", "source",
  "localSize", "terminalSize", "serverSize", "requestedSize", "targetSize", "backendSize",
  "resizeEpochs", "requested", "applied", "presented", "flags", "host", "cssWidth", "cssHeight",
  "fittedCols", "fittedRows", "currentCols", "currentRows", "canvasNeedsResize", "dimensionsWillChange",
  "attempts", "limit", "validationAttempts", "retryExhausted",
  "queuedResizes",
  "replayBurstBytes", "aggregate",
  "exitCode", "retained", "authoritative",
]);

const canvasDetailKeys = new Set([
  "width", "height", "cssWidth", "cssHeight", "styleWidth", "styleHeight", "hidden",
]);

const normalizeInitializationDetailValue = (key, value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const allowedKeys = key === "liveCanvas" || key === "holdCanvas"
      ? canvasDetailKeys
      : initializationDetailKeys;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([childKey]) => allowedKeys.has(childKey))
        .map(([childKey, childValue]) => [childKey, normalizeInitializationDetailValue(childKey, childValue)]),
    );
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean" || value === null) {
    return value;
  }
  return String(value ?? "");
};

const normalizeInitializationDetails = (details = {}) => {
  if (!details || typeof details !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => initializationDetailKeys.has(key))
      .map(([key, value]) => [key, normalizeInitializationDetailValue(key, value)]),
  );
};

const startupEventSource = (name) => {
  const text = String(name || "");
  return text.startsWith("终端")
    || text.startsWith("逻辑层 socket")
    || text.startsWith("逻辑层订阅")
    || text.startsWith("物理 WebSocket")
    || text.startsWith("物理通道")
    || text.startsWith("真实终端")
    || text.startsWith("PTY ")
    || text.startsWith("agent ")
    ? "终端初始化"
    : "页面初始化";
};
const defaultNow = () => (
  globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now()
);

const finiteTime = (value) => {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? time : 0;
};

const formatEventName = (name) => diagnosticEventLabels[name] || terminalEventLabels[name] || startupMetricLabels[name] || String(name || "初始化事件");

export function createInitializationPerformance({
  startupDiagnostics = null,
  now = defaultNow,
  onChange = () => {},
} = {}) {
  let enabled = false;
  let disposed = false;
  let completed = false;
  let sessionID = "";
  let startupEvents = [];
  let terminalEvents = [];
  let terminalEventsBySession = new Map();
  let terminalProgressBySession = new Map();
  let result = null;
  let lastEmitAt = -Infinity;
  const context = {
    pageID: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timeOriginUnixMs: globalThis.performance?.timeOrigin || Date.now() - now(),
    userAgent: globalThis.navigator?.userAgent || "",
  };

  const emit = (force = false) => {
    // Preserve every event, but avoid rebuilding the whole panel per event.
    // The existing 250ms ticker delivers the tail; completion is immediate.
    const at = now();
    if (!force && at - lastEmitAt < 100) return;
    lastEmitAt = at;
    onChange(snapshot());
  };

  const buildResult = (finishedAt, { status = "complete", includePending = false } = {}) => {
    const metrics = startupDiagnostics?.snapshot?.() || {};
    const metricEvents = Object.entries(startupMetricLabels)
      .map(([name]) => ({
        name,
        label: formatEventName(name),
        source: "页面初始化",
        at: finiteTime(metrics[name]),
      }))
      .filter((event) => event.at > 0);
    const eventMap = new Map();
    for (const event of [...metricEvents, ...startupEvents, ...terminalEvents]) {
      const key = `${event.source}:${event.name}:${event.at}`;
      if (!eventMap.has(key)) {
        eventMap.set(key, event);
      }
    }
    const events = [...eventMap.values()].sort((left, right) => left.at - right.at);
    const navigationStartedAt = finiteTime(metrics.navigationStartedAt) || events[0]?.at || finishedAt;
    const rows = [];
    let previousAt = navigationStartedAt;
    for (const event of events) {
      if (event.at < navigationStartedAt) {
        continue;
      }
      rows.push({
        name: event.name,
        label: event.label,
        source: event.source,
        durationMs: Math.max(0, event.at - previousAt),
        elapsedMs: Math.max(0, event.at - navigationStartedAt),
        details: event.details ? { ...event.details } : {},
      });
      previousAt = event.at;
    }
    const totalAt = Math.max(finishedAt, terminalEvents.at(-1)?.at || finishedAt);
    if (includePending) {
      const lastEvent = events.filter((event) => event.at >= navigationStartedAt).at(-1) || null;
      const waitingSince = lastEvent?.at || navigationStartedAt;
      rows.push({
        name: "initialization_pending",
        label: lastEvent ? `等待下一步 · ${lastEvent.label}` : "等待首个初始化事件",
        source: lastEvent?.source || "页面初始化",
        durationMs: Math.max(0, totalAt - waitingSince),
        elapsedMs: Math.max(0, totalAt - navigationStartedAt),
        details: {},
        pending: true,
      });
    }
    return {
      ...context,
      status,
      sessionID,
      rows,
      totalMs: Math.max(0, totalAt - navigationStartedAt),
      startedAt: navigationStartedAt,
      finishedAt: status === "complete" ? totalAt : 0,
    };
  };

  const snapshot = () => {
    if (result) {
      return {
        enabled,
        ...result,
        rows: result.rows.map((row) => ({ ...row, details: { ...(row.details || {}) } })),
      };
    }
    const observedAt = finiteTime(now())
      || finiteTime(startupDiagnostics?.getMetric?.("navigationStartedAt"));
    return {
      enabled,
      ...buildResult(observedAt, {
        status: enabled ? "collecting" : "idle",
        includePending: enabled,
      }),
    };
  };

  const selectProgressSession = (id, events, name, at) => {
    const previous = terminalProgressBySession.get(id) || {
      rank: 0,
      startedAt: at,
      lastAt: 0,
    };
    const progress = {
      rank: Math.max(previous.rank, terminalProgressRanks.get(name) || previous.rank),
      startedAt: previous.startedAt || at,
      lastAt: at,
    };
    terminalProgressBySession.set(id, progress);
    const selectedProgress = terminalProgressBySession.get(sessionID);
    if (
      !sessionID
      || id === sessionID
      || progress.rank > Number(selectedProgress?.rank || 0)
      || (
        progress.rank === Number(selectedProgress?.rank || 0)
        && progress.startedAt < Number(selectedProgress?.startedAt || Infinity)
      )
    ) {
      sessionID = id;
      terminalEvents = events;
    }
  };

  const recordTerminalEvent = (session, name, details = {}) => {
    if (!enabled || disposed || completed || !session) {
      return;
    }
    const id = String(session.id || session.name || "");
    if (!id) {
      return;
    }
    const at = finiteTime(details.eventAt) || finiteTime(now());
    if (!at) {
      return;
    }
    const events = terminalEventsBySession.get(id) || [];
    terminalEventsBySession.set(id, events);
    events.push({
      name: String(name || "terminal_event"),
      label: String(name || "").startsWith("backend_rpc_") && details.operation
        ? `${formatEventName(name)} · ${details.operation}`
        : formatEventName(name),
      source: "终端初始化",
      at,
      details: normalizeInitializationDetails({
        paneID: session.id, tabID: session.tabId, target: session.name,
        connectionEpoch: session.connectionEpoch,
        ...details,
      }),
    });
    selectProgressSession(id, events, String(name || "terminal_event"), at);
    if (name === "presentation_commit_complete") {
      sessionID = id;
      terminalEvents = events;
      completed = true;
      result = buildResult(at);
    }
    emit(completed);
  };

  return {
    dispose() {
      disposed = true;
      enabled = false;
      terminalEvents = [];
      startupEvents = [];
      terminalEventsBySession = new Map();
      terminalProgressBySession = new Map();
      sessionID = "";
      result = null;
    },
    isEnabled() {
      return enabled;
    },
    isCollecting() {
      return enabled && !disposed && !completed;
    },
    recordStartupEvent(name, diagnosticDetails = {}) {
      if (!enabled || disposed || completed) {
        return;
      }
      const at = finiteTime(now());
      if (!at) {
        return;
      }
      startupEvents.push({
        name: String(name || "startup_event"),
        label: formatEventName(name),
        source: startupEventSource(name),
        at,
        details: normalizeInitializationDetails(diagnosticDetails),
      });
      emit();
    },
    recordTerminalEvent,
    refresh() {
      if (!enabled || disposed || completed) {
        return false;
      }
      emit(true);
      return true;
    },
    setEnabled(nextEnabled) {
      if (disposed) {
        return;
      }
      enabled = nextEnabled === true;
      emit(true);
    },
    snapshot,
  };
}
