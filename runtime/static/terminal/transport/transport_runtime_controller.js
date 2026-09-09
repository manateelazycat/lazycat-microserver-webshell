import { createTerminalConnectionScheduler } from "./terminal_connection_scheduler.js";
import { createTerminalUnifiedMembership } from "./terminal_unified_membership.js";
import { createTerminalTransportRuntimeLifecycle } from "./transport_runtime_lifecycle.js";

const noop = () => {};

const isNetworkFailureReason = (reason) => {
  const normalized = String(reason || "").toLowerCase();
  return normalized.includes("network")
    || normalized.includes("websocket")
    || normalized.includes("transport")
    || normalized.includes("physical")
    || normalized.includes("connection timed out")
    || normalized.includes("connection reset")
    || normalized.includes("connection aborted")
    || normalized.includes("queue transport")
    || normalized.includes("eof");
};

const sessionHasKnownSize = (session) => Boolean(
  Number(session?.measuredFitGeneration || 0) > 0
    || (Number(session?.initialCols || 0) >= 2 && Number(session?.initialRows || 0) >= 1)
    || (Number(session?.term?.cols || 0) >= 2 && Number(session?.term?.rows || 0) >= 1)
);

const layoutPaneOrder = (node, paneOrder = []) => {
  if (!node) {
    return paneOrder;
  }
  if (node.type === "leaf") {
    const paneID = String(node.paneId || "").trim();
    if (paneID) {
      paneOrder.push(paneID);
    }
    return paneOrder;
  }
  for (const child of node.children || []) {
    layoutPaneOrder(child, paneOrder);
  }
  return paneOrder;
};

export function createTerminalTransportRuntimeController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  createMembership = createTerminalUnifiedMembership,
  createScheduler = createTerminalConnectionScheduler,
  lifecycle: providedLifecycle,
  getDisposed = () => false,
  isOnline = () => true,
  isClientTarget = () => false,
  getActiveName = () => "",
  getActiveTabID = () => "",
  getTabs = () => [],
  isApplyingWorkspaceState = () => false,
  isCurrentSession = () => false,
  isReplayRetryPaused = () => false,
  isReplayCommitted = () => false,
  getUnifiedTransport = () => null,
  resizeSession = () => ({ ok: false }),
  isSessionMeasurable = () => false,
  scheduleSessionResize = noop,
  detachSessionSocket = noop,
  connectSession = async () => false,
  sessionConnectingState = () => "connecting",
  resumePendingInputExpiry = noop,
  pausePendingInputExpiry = noop,
  clearSessionConnectionTimers = noop,
  retrySessionAfterFailure = noop,
  appendDebugLog = noop,
  appendDebugWarning = noop,
  appendDebugError = noop,
  recordRuntimeEvent = noop,
  describeSession = (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
  now = () => Date.now(),
  random = () => Math.random(),
  randomUUID = () => globalThis.crypto?.randomUUID?.() || "",
  socketConnecting = 0,
  socketOpen = 1,
  socketClosed = 3,
  clientCapacity = 3,
  interactionPriorityMs = 1500,
  unifiedRetryBaseDelayMs = 250,
  unifiedRetryMaxDelayMs = 10 * 1000,
  reconnectBaseDelayMs = 500,
  reconnectMaxDelayMs = 10 * 1000,
  reconnectJitterRatio = 0.2,
} = {}) {
  const membership = createMembership();
  const lifecycle = providedLifecycle || createTerminalTransportRuntimeLifecycle({ windowObject });
  let scheduler = null;
  let schedulerState = null;
  let demandGeneration = 0;
  let unifiedChannelGeneration = 0;
  let membershipRefreshPending = false;
  const attachStartedAt = new WeakMap();
  let foregroundWaitStartedAt = 0;
  let disposed = false;

  const tabsArray = () => Array.from(getTabs() || []);
  const sessionsArray = () => tabsArray().flatMap((tab) => Array.from(tab?.panes?.values?.() || []));

  const priorityFor = (session, { userInteraction = false } = {}) => {
    if (userInteraction) {
      return 0;
    }
    const activeTabID = getActiveTabID();
    const tab = tabsArray().find((candidate) => candidate?.id === session?.tabId);
    if (tab?.id === activeTabID) {
      return tab.activePaneId === session.id ? 1 : 2;
    }
    return Number(session?.lastUserInteractionAt || 0) > 0 ? 3 : 4;
  };

  const panesForWorkspace = () => {
    const activeName = getActiveName();
    const panes = [];
    for (const tab of tabsArray()) {
      for (const pane of tab?.panes?.values?.() || []) {
        if (!pane?.closed && pane.name === activeName) {
          panes.push(pane);
        }
      }
    }
    return panes;
  };

  const visualOrder = (tab, panes) => {
    const layoutOrder = new Map(layoutPaneOrder(tab?.layout).map((paneID, index) => [paneID, index]));
    const measured = [];
    for (const pane of panes) {
      const rect = pane?.shellEl?.getBoundingClientRect?.();
      if (
        Number(pane?.measuredFitGeneration || 0) <= 0
        || !rect
        || rect.width <= 0
        || rect.height <= 0
      ) {
        return { orderedPanes: panes, ready: false };
      }
      measured.push({
        pane,
        top: rect.top,
        left: rect.left,
        layoutOrder: layoutOrder.get(pane.id) ?? Number.MAX_SAFE_INTEGER,
      });
    }
    measured.sort((left, right) => (
      left.top - right.top
      || left.left - right.left
      || left.layoutOrder - right.layoutOrder
      || String(left.pane.id).localeCompare(String(right.pane.id))
    ));
    measured.forEach((entry, index) => {
      entry.pane.initializationOrder = index + 1;
    });
    return { orderedPanes: measured.map((entry) => entry.pane), ready: measured.length > 0 };
  };

  const globalOrder = () => {
    const activeTabID = getActiveTabID();
    const activeName = getActiveName();
    const tabs = tabsArray();
    const activeTab = tabs.find((tab) => tab?.id === activeTabID);
    if (!activeTab) {
      return { orderedPanes: [], ready: false };
    }
    const activePanes = Array.from(activeTab.panes.values()).filter((pane) => (
      !pane.closed && pane.name === activeName
    ));
    const activeOrder = visualOrder(activeTab, activePanes);
    if (!activeOrder.ready) {
      return { orderedPanes: panesForWorkspace(), ready: false };
    }
    const orderedPanes = [...activeOrder.orderedPanes];
    const included = new Set(orderedPanes.map((pane) => pane.id));
    for (const tab of tabs) {
      if (tab.id === activeTabID) {
        continue;
      }
      for (const paneID of layoutPaneOrder(tab.layout)) {
        const pane = tab.panes.get(paneID);
        if (!pane || pane.closed || pane.name !== activeName || included.has(pane.id)) {
          continue;
        }
        orderedPanes.push(pane);
        included.add(pane.id);
      }
      for (const pane of tab.panes.values()) {
        if (pane.closed || pane.name !== activeName || included.has(pane.id)) {
          continue;
        }
        orderedPanes.push(pane);
        included.add(pane.id);
      }
    }
    orderedPanes.forEach((pane, index) => {
      pane.initializationOrder = index + 1;
    });
    return { orderedPanes, ready: orderedPanes.length > 0 };
  };

  const scheduleMeasurementPass = (tab) => {
    if (!tab || tab.id !== getActiveTabID()) {
      return false;
    }
    let scheduled = false;
    for (const pane of tab.panes.values()) {
      if (pane.closed || pane.name !== getActiveName() || Number(pane.measuredFitGeneration || 0) > 0) {
        continue;
      }
      scheduled = lifecycle.scheduleMeasurement(pane, () => {
        if (pane.closed || pane.tabId !== getActiveTabID() || pane.name !== getActiveName()) {
          return;
        }
        scheduleSessionResize(pane, {
          forceFullRender: true,
          hideUntilRender: true,
        }, { immediate: true });
      }) || scheduled;
    }
    return scheduled;
  };

  const detachUnifiedSession = (session, reason = "membership_removed") => {
    if (!session || session.connectionChannel !== "unified") {
      return false;
    }
    session.connectionCloseReason = reason;
    const socket = session.socket;
    if (socket) {
      try {
        socket.close(4001, reason);
      } catch (error) {
        detachSessionSocket(session, socket, { connection: session.closed ? "closed" : "reconnecting" });
      }
    } else {
      session.connectionChannel = "";
      session.connectionChannelGeneration = 0;
      session.unifiedStreamID = "";
    }
    return true;
  };

  const clearUnifiedRetry = (session, options) => lifecycle.clearUnifiedRetry(session, options);

  const scheduleUnifiedPaneRetry = (session, reason, { immediate = false } = {}) => {
    if (disposed || getDisposed() || !session || session.closed || !isCurrentSession(session) || isReplayRetryPaused(session)) {
      return false;
    }
    if (!isOnline()) {
      clearUnifiedRetry(session);
      if (session.shellEl?.dataset) {
        session.shellEl.dataset.connection = "offline";
      }
      return false;
    }
    if (lifecycle.hasUnifiedRetry(session)) {
      return true;
    }
    const attempt = lifecycle.incrementUnifiedRetryAttempt(session);
    const delay = immediate
      ? unifiedRetryBaseDelayMs
      : Math.min(unifiedRetryMaxDelayMs, unifiedRetryBaseDelayMs * (2 ** Math.min(attempt - 1, 8)));
    session.connectionRetrying = true;
    if (session.shellEl?.dataset) {
      session.shellEl.dataset.connection = isNetworkFailureReason(reason)
        ? "network-error"
        : "reconnecting";
    }
    if (!lifecycle.scheduleUnifiedRetry(session, () => scheduleUnifiedSync({ reason: "pane_retry" }), delay)) {
      return false;
    }
    appendDebugWarning(
      "统一终端 logical stream 将重试",
      `${describeSession(session)}, 第 ${attempt} 次, ${delay}ms 后: ${reason}`,
    );
    recordRuntimeEvent("unified_pane_retry_scheduled", {
      paneID: session.id,
      target: session.name,
      reason,
      attempt,
      delay,
      immediate,
    });
    return true;
  };

  const createStreamID = (session, generation) => (
    randomUUID() || `${String(session?.id || "pane")}-${generation}-${now()}`
  );

  const connectUnifiedSession = (session) => {
    if (
      disposed
      || getDisposed()
      || !session
      || session.closed
      || session.unifiedConnectPending
      || lifecycle.hasUnifiedRetry(session)
      || isReplayRetryPaused(session)
      || session.socket
      || !sessionHasKnownSize(session)
    ) {
      return false;
    }
    const transport = getUnifiedTransport();
    const connection = transport?.ensure?.(session.name);
    if (!connection) {
      const closingPromise = transport?.getClosingPromise?.();
      if (closingPromise) {
        Promise.resolve(closingPromise).finally(() => scheduleUnifiedSync({ reason: "physical_closed" }));
      }
      return false;
    }
    unifiedChannelGeneration += 1;
    const generation = unifiedChannelGeneration;
    session.unifiedConnectPending = true;
    attachStartedAt.set(session, now());
    session.connectionChannel = "unified";
    session.connectionChannelGeneration = generation;
    session.connectionCloseReason = "";
    session.unifiedStreamID = createStreamID(session, generation);
    session.connectionRetrying = lifecycle.getUnifiedRetryAttempts(session) > 0;
    if (session.shellEl?.dataset) {
      session.shellEl.dataset.connection = sessionConnectingState(session);
    }
    recordRuntimeEvent("unified_session_connect_start", {
      paneID: session.id,
      target: session.name,
      channelGeneration: generation,
      streamID: session.unifiedStreamID,
      retryAttempts: lifecycle.getUnifiedRetryAttempts(session),
      measurable: sessionHasKnownSize(session),
    });
    Promise.resolve(connectSession(session, {
      allowHidden: true,
      channel: "unified",
      channelGeneration: generation,
    })).then((started) => {
      if (!started && session.connectionChannel === "unified" && session.connectionChannelGeneration === generation) {
        throw new Error("unified logical stream could not start");
      }
    }).catch((error) => {
      if (session.connectionChannel !== "unified" || session.connectionChannelGeneration !== generation) {
        return;
      }
      appendDebugError("统一终端 logical stream 建立失败", `${describeSession(session)}: ${error?.message || String(error)}`);
      detachUnifiedSession(session, "unified_retry");
      scheduleUnifiedPaneRetry(session, error?.message || "unified_connect_failed");
    }).finally(() => {
      if (session.connectionChannelGeneration === generation) {
        session.unifiedConnectPending = false;
      }
    });
    return true;
  };

  const reconcileUnifiedMembership = () => {
    if (disposed || getDisposed() || !isOnline() || isClientTarget(getActiveName())) {
      return false;
    }
    const membershipSnapshot = membership.snapshot();
    const paneIDs = new Set(membershipSnapshot.paneIDs);
    for (const pane of sessionsArray()) {
      if (pane.connectionChannel === "unified" && !paneIDs.has(pane.id)) {
        detachUnifiedSession(pane, pane.closed ? "session_closed" : "membership_removed");
      }
    }
    const candidates = sessionsArray().filter(pane => paneIDs.has(pane.id));
    const priority = pane => membershipSnapshot.priorities[pane.id] ?? 3;
    candidates.sort((left, right) => priority(left) - priority(right));
    const restoring = pane => !isReplayCommitted(pane) && !isReplayRetryPaused(pane);
    const inputRestoring = candidates.some(pane => priority(pane) === 0 && restoring(pane));
    const foregroundRestoring = candidates.some(pane => priority(pane) <= 1 && restoring(pane));
    if (!foregroundRestoring) foregroundWaitStartedAt = 0;
    else if (!foregroundWaitStartedAt) foregroundWaitStartedAt = now();
    // A round-robin server gives each subscribed history a share of the link.
    // Restore the input pane first, then visible peers and two background replays at a
    // time. Existing streams stay subscribed; activation bypasses this gate.
    // A failed/stalled replay must not indefinitely starve the other tabs.
    const foregroundWaiting = foregroundRestoring && now() - foregroundWaitStartedAt < 20000;
    let backgroundRestoring = candidates.filter(pane => priority(pane) > 1
      && (pane.socket || pane.unifiedConnectPending) && restoring(pane)
      && now() - (attachStartedAt.get(pane) || 0) < 60000).length;
    let deferred = false;
    for (const pane of candidates) {
      if (pane.socket || pane.unifiedConnectPending || isReplayRetryPaused(pane)) continue;
      if (priority(pane) === 1 && inputRestoring && foregroundWaiting) {
        deferred = true;
        continue;
      }
      if (priority(pane) > 1 && (foregroundWaiting || backgroundRestoring >= 2)) {
        deferred = true;
        continue;
      }
      if (connectUnifiedSession(pane) && priority(pane) > 1) backgroundRestoring += 1;
    }
    if (deferred) lifecycle.scheduleDeferredSync(() => reconcileUnifiedMembership());
    const transport = getUnifiedTransport();
    for (const [paneID, priority] of Object.entries(membershipSnapshot.priorities)) {
      transport?.setPriority?.(paneID, priority);
    }
    return true;
  };

  function scheduleUnifiedSync({ reason = "membership_changed" } = {}) {
    return lifecycle.scheduleSync(() => reconcileUnifiedMembership(reason));
  }

  const refreshMembership = ({
    reason = "workspace_membership_changed",
    interactionSession = null,
  } = {}) => {
    const activeName = getActiveName();
    if (disposed || getDisposed() || isClientTarget(activeName)) {
      return false;
    }
    if (isApplyingWorkspaceState()) {
      membershipRefreshPending = true;
      return false;
    }
    const activeTabID = getActiveTabID();
    const tab = tabsArray().find((candidate) => candidate?.id === activeTabID);
    const { orderedPanes } = globalOrder();
    const activePane = interactionSession || tab?.panes.get(tab?.activePaneId) || null;
    const result = membership.reconcile({
      targetName: activeName,
      panes: orderedPanes,
      activeTabID: tab?.id || "",
      activePaneID: activePane?.id || "",
    });
    if (result.targetChanged) foregroundWaitStartedAt = 0;
    const transport = getUnifiedTransport();
    if (result.targetChanged && transport?.getConnection?.()) {
      transport.close("context_changed");
    }
    for (const pane of result.removed) {
      if (pane.connectionChannel === "unified" && pane.socket) {
        detachUnifiedSession(pane, "membership_removed");
      }
    }
    scheduleMeasurementPass(tab);
    scheduleUnifiedSync({ reason });
    return true;
  };

  const flushPendingMembershipRefresh = (reason = "workspace_restored") => {
    if (!membershipRefreshPending || disposed || getDisposed() || isClientTarget(getActiveName())) {
      return false;
    }
    membershipRefreshPending = false;
    return refreshMembership({ reason });
  };

  const schedulePriorityDecay = (session) => {
    if (!session || session.closed || !isClientTarget(getActiveName())) {
      return false;
    }
    return lifecycle.schedulePriorityDecay(session, () => {
      if (!session.closed) {
        syncConnectionDemands({ reason: "interaction_priority_decay" });
      }
    }, interactionPriorityMs);
  };

  const retryDelay = (attempt, session) => {
    const baseDelay = Math.min(reconnectMaxDelayMs, reconnectBaseDelayMs * (2 ** Math.min(attempt, 8)));
    const jitter = baseDelay * reconnectJitterRatio * ((random() * 2) - 1);
    const delay = Math.max(0, Math.round(baseDelay + jitter));
    if (session && !session.closed) {
      session.reconnectAttempts = Math.min(20, Math.max(Number(session.reconnectAttempts || 0), attempt + 1));
      appendDebugWarning(
        "终端连接将在重试",
        `${describeSession(session)}, 第 ${attempt + 1} 次, ${delay}ms 后`,
      );
    }
    return delay;
  };

  const ensureDirectScheduler = () => {
    if (scheduler) {
      return scheduler;
    }
    scheduler = createScheduler({
      capacity: clientCapacity,
      connect: async (session, lease) => {
        session.connectionChannel = "fast";
        session.connectionChannelGeneration = 0;
        session.fastStreamID = "";
        session.connectionLeaseID = lease.leaseID;
        session.connectionLeaseClosing = false;
        session.connectionLeaseCloseReason = "";
        resumePendingInputExpiry(session);
        if (session.shellEl?.dataset) {
          session.shellEl.dataset.connection = sessionConnectingState(session);
        }
        appendDebugLog(
          "info",
          "终端连接租约已分配",
          `${describeSession(session)}, lease=${lease.leaseID}, P${lease.priority}`,
        );
        try {
          const started = await connectSession(session, {
            allowHidden: lease.allowHidden,
            leaseID: lease.leaseID,
            channel: "fast",
            channelGeneration: session.connectionChannelGeneration,
          });
          if (!started && scheduler?.currentLease(session)?.leaseID === lease.leaseID) {
            throw new Error("terminal connection lease could not start");
          }
        } catch (error) {
          if (scheduler?.currentLease(session)?.leaseID === lease.leaseID) {
            pausePendingInputExpiry(session);
            session.connectionRetrying = true;
            if (session.shellEl?.dataset) {
              session.shellEl.dataset.connection = isOnline() ? "reconnecting" : "offline";
            }
            retrySessionAfterFailure(session, error, { allowHidden: true });
          }
          throw error;
        }
      },
      disconnect: (session, reason, lease) => {
        if (!session || session.connectionLeaseID !== lease.leaseID) {
          return;
        }
        session.connectionLeaseClosing = true;
        session.connectionLeaseCloseReason = reason;
        pausePendingInputExpiry(session);
        clearSessionConnectionTimers(session);
        if (["scheduler_preempt", "capacity_reduced", "background_tab_parked", "context_changed"].includes(reason)) {
          session.connectionRetrying = false;
          session.shellEl.dataset.connection = "parked";
          appendDebugLog("info", "终端连接租约被抢占", `${describeSession(session)}, lease=${lease.leaseID}`);
        } else if (reason === "network_offline") {
          session.shellEl.dataset.connection = "offline";
        } else if (["session_closed", "tab_or_target_removed", "page_disposed"].includes(reason)) {
          session.shellEl.dataset.connection = "closed";
        } else {
          session.connectionRetrying = true;
          session.shellEl.dataset.connection = "reconnecting";
        }
        const socket = session.socket;
        if (!socket || socket.readyState === socketClosed) {
          session.connectionLeaseClosing = false;
          session.connectionLeaseCloseReason = "";
          session.connectionLeaseID = 0;
          session.connectionChannelGeneration = 0;
          session.fastStreamID = "";
          scheduler?.notifyClosed(session, lease.leaseID, { reason });
          return;
        }
        try {
          socket.close(4001, reason);
        } catch (error) {
          session.socket = null;
          session.connectionLeaseClosing = false;
          session.connectionLeaseCloseReason = "";
          session.connectionLeaseID = 0;
          session.connectionChannelGeneration = 0;
          session.fastStreamID = "";
          scheduler?.notifyClosed(session, lease.leaseID, { reason });
        }
      },
      retryDelay,
      onStateChange: (state) => {
        schedulerState = state;
        if (state.capacityInvariantViolations > 0) {
          appendDebugError("终端连接池容量异常", `active=${state.activeCount}, capacity=${state.capacity}`);
        }
      },
    });
    scheduler.setOnline(isOnline());
    return scheduler;
  };

  const requestConnection = (session, {
    reason = "connection_demand",
    userInteraction = false,
    immediate = false,
    allowHidden = true,
  } = {}) => {
    if (
      disposed
      || getDisposed()
      || !session
      || session.closed
      || !isCurrentSession(session)
      || Number(session.measuredFitGeneration || 0) <= 0
    ) {
      return false;
    }
    if (userInteraction) {
      session.lastUserInteractionAt = now();
      schedulePriorityDecay(session);
    }
    recordRuntimeEvent("terminal_connection_request", {
      paneID: session.id,
      target: getActiveName(),
      reason,
      userInteraction,
      immediate,
      allowHidden,
      measurable: Number(session.measuredFitGeneration || 0) > 0,
      connectionChannel: String(session.connectionChannel || ""),
      connectionEpoch: Number(session.connectionEpoch || 0),
    });
    session.pendingConnect = false;
    if (!isClientTarget(getActiveName())) {
      refreshMembership({
        reason,
        interactionSession: userInteraction && session.tabId === getActiveTabID() ? session : null,
      });
      return true;
    }
    return ensureDirectScheduler().request(session, {
      priority: priorityFor(session, { userInteraction }),
      generation: demandGeneration,
      reason,
      immediate,
      allowHidden,
      lastUserInteractionAt: Number(session.lastUserInteractionAt || 0),
      lastBecameVisibleAt: Number(session.lastBecameVisibleAt || 0),
      lastOutputAt: Number(session.lastTerminalOutputAt || 0),
    });
  };

  const syncClientConnectionDemands = ({
    reason = "workspace_priority_changed",
    interactionSession = null,
  } = {}) => {
    const directScheduler = ensureDirectScheduler();
    if (!directScheduler || disposed || getDisposed()) {
      return false;
    }
    directScheduler.setCapacity(clientCapacity);
    demandGeneration += 1;
    const generation = demandGeneration;
    for (const tab of tabsArray()) {
      const tabIsActive = tab.id === getActiveTabID();
      for (const pane of tab.panes.values()) {
        if (pane.closed || pane.name !== getActiveName() || Number(pane.measuredFitGeneration || 0) <= 0) {
          continue;
        }
        if (!tabIsActive) {
          directScheduler.release(pane, "background_tab_parked");
          continue;
        }
        pane.lastBecameVisibleAt = now();
        directScheduler.request(pane, {
          priority: priorityFor(pane, { userInteraction: pane === interactionSession }),
          generation,
          reason,
          immediate: pane === interactionSession,
          allowHidden: true,
          lastUserInteractionAt: Number(pane.lastUserInteractionAt || 0),
          lastBecameVisibleAt: Number(pane.lastBecameVisibleAt || 0),
          lastOutputAt: Number(pane.lastTerminalOutputAt || 0),
        });
      }
    }
    directScheduler.setGeneration(generation);
    if (interactionSession) {
      schedulePriorityDecay(interactionSession);
    }
    return true;
  };

  function syncConnectionDemands(options = {}) {
    if (disposed || getDisposed()) {
      return false;
    }
    if (isClientTarget(getActiveName())) {
      return syncClientConnectionDemands(options);
    }
    return refreshMembership(options);
  }

  const connectPendingSession = (session, { allowHidden = false } = {}) => {
    if (!session || session.closed || !isCurrentSession(session)) {
      return false;
    }
    const socketReadyState = session.socket?.readyState;
    if (socketReadyState === socketOpen || socketReadyState === socketConnecting) {
      session.pendingConnect = false;
      return true;
    }
    if (isSessionMeasurable(session)) {
      if (documentObject?.hidden && !allowHidden) {
        return false;
      }
      const fit = resizeSession(session, { settlePresentation: !session.resizePresentationHold });
      if (!fit?.ok || Number(session.measuredFitGeneration || 0) <= 0) {
        return false;
      }
      return requestConnection(session, { reason: "pane_measured", allowHidden });
    }
    if (allowHidden && Number(session.measuredFitGeneration || 0) > 0) {
      return requestConnection(session, { reason: "hidden_pane_ready", allowHidden: true });
    }
    return false;
  };

  const connectPendingSessionsForTab = (tab, options = {}) => {
    if (!tab) {
      return false;
    }
    for (const pane of tab.panes.values()) {
      connectPendingSession(pane, options);
    }
    return true;
  };

  const recycleUnifiedSession = (session, reason, { immediate = false } = {}) => {
    if (!session || session.connectionChannel !== "unified") {
      return false;
    }
    session.connectionRetrying = true;
    if (session.shellEl?.dataset) {
      session.shellEl.dataset.connection = isNetworkFailureReason(reason)
        ? "network-error"
        : "reconnecting";
    }
    detachUnifiedSession(session, "unified_retry");
    scheduleUnifiedPaneRetry(session, reason, { immediate });
    return true;
  };

  const registerSession = (session) => {
    if (!session || !isClientTarget(session.name)) {
      return false;
    }
    return ensureDirectScheduler().register(session);
  };

  const unregisterSession = (session, reason = "session_closed") => {
    lifecycle.disposeSession(session);
    return scheduler?.unregister?.(session, reason) === true;
  };

  const dispose = (reason = "page_disposed") => {
    if (disposed) {
      return false;
    }
    disposed = true;
    const sessions = sessionsArray();
    lifecycle.dispose(sessions);
    for (const session of sessions) {
      scheduler?.unregister?.(session, reason);
    }
    membership.clear();
    return true;
  };

  return Object.freeze({
    clearUnifiedRetry,
    connectPendingSession,
    connectPendingSessionsForTab,
    currentLease: (session) => scheduler?.currentLease?.(session) || null,
    detachUnifiedSession,
    dispose,
    flushPendingMembershipRefresh,
    hasKnownSize: sessionHasKnownSize,
    notifyDirectClosed: (session, leaseID, details) => scheduler?.notifyClosed?.(session, leaseID, details) === true,
    notifyDirectFailure: (session, leaseID, error, options) => scheduler?.notifyFailure?.(session, leaseID, error, options) === true,
    notifyDirectOpen: (session, leaseID) => scheduler?.notifyOpen?.(session, leaseID) === true,
    notifyDirectReplayReady: (session, leaseID) => scheduler?.notifyReplayReady?.(session, leaseID) === true,
    recycleUnifiedSession,
    refreshMembership,
    registerSession,
    releaseDirectSession: (session, reason) => scheduler?.release?.(session, reason) === true,
    requestConnection,
    resetMeasurementAttempts: lifecycle.resetMeasurementAttempts,
    scheduleUnifiedPaneRetry,
    scheduleUnifiedSync,
    setOnline: (value) => scheduler?.setOnline?.(value),
    snapshot: () => Object.freeze({
      membership: membership.snapshot(),
      scheduler: schedulerState,
      membershipRefreshPending,
      demandGeneration,
      unifiedChannelGeneration,
    }),
    syncConnectionDemands,
    unregisterSession,
  });
}
