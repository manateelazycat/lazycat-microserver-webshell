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
  (!session?.term?.wasmTerm?.isRemote || (session.term.wasmTerm.isReady && !session.term.backendResizePending))
  && (Number(session?.measuredFitGeneration || 0) > 0
    || (Number(session?.initialCols || 0) >= 2 && Number(session?.initialRows || 0) >= 1)
    || (Number(session?.term?.cols || 0) >= 2 && Number(session?.term?.rows || 0) >= 1))
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
  lifecycle: providedLifecycle,
  getDisposed = () => false,
  isOnline = () => true,
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
  appendDebugError = noop,
  recordRuntimeEvent = noop,
  describeSession = (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
  now = () => Date.now(),
  randomUUID = () => globalThis.crypto?.randomUUID?.() || "",
  socketConnecting = 0,
  socketOpen = 1,
  unifiedRetryBaseDelayMs = 250,
  unifiedRetryMaxDelayMs = 10 * 1000,
} = {}) {
  const membership = createMembership();
  const lifecycle = providedLifecycle || createTerminalTransportRuntimeLifecycle({ windowObject });
  let unifiedChannelGeneration = 0;
  let membershipRefreshPending = false;
  const attachStartedAt = new WeakMap();
  let foregroundWaitStartedAt = 0;
  let disposed = false;

  const tabsArray = () => Array.from(getTabs() || []);
  const sessionsArray = () => tabsArray().flatMap((tab) => Array.from(tab?.panes?.values?.() || []));

  const panesForWorkspace = () => {
    const activeName = getActiveName();
    const panes = [];
    for (const tab of tabsArray()) {
      for (const pane of tab?.panes?.values?.() || []) {
        if (!pane?.closed && (!pane.exitExpected || pane.socket) && pane.name === activeName) {
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
    if (disposed || getDisposed() || !session || session.closed || session.exitExpected || !isCurrentSession(session) || isReplayRetryPaused(session)) {
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
      || session.exitExpected
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
    const physicalState = connection.snapshot();
    if (!physicalState.serverReady || physicalState.agentProtocolUpdateRequired) {
      // The transport owner schedules another membership pass on queue-ready.
      // Until then, keep the pane pending without starting an attach timer.
      session.pendingConnect = true;
      return false;
    }
    unifiedChannelGeneration += 1;
    const generation = unifiedChannelGeneration;
    session.unifiedConnectPending = true;
    session.pendingConnect = false;
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
    if (disposed || getDisposed() || !isOnline()) {
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
      if (!sessionHasKnownSize(pane)) {
        // Keep a readiness obligation when the retry timer beats Worker init.
        pane.pendingConnect = true;
        // Failed Workers are restarted by health/recovery, not a polling loop.
        deferred ||= pane.term?.wasmTerm?.failed !== true;
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
    if (disposed || getDisposed()) {
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
    // The first membership moves from an empty target to the selected one.
    // Adopt its preconnected channel; only a different target needs closing.
    if (result.targetChanged && transport?.getConnection?.() && !transport.matchesTarget(activeName)) {
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
    if (!membershipRefreshPending || disposed || getDisposed()) {
      return false;
    }
    membershipRefreshPending = false;
    return refreshMembership({ reason });
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
      || session.exitExpected
      || !isCurrentSession(session)
      || Number(session.measuredFitGeneration || 0) <= 0
    ) {
      return false;
    }
    if (userInteraction) {
      session.lastUserInteractionAt = now();
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
    session.pendingConnect = !session.socket;
    refreshMembership({
      reason,
      interactionSession: userInteraction && session.tabId === getActiveTabID() ? session : null,
    });
    return true;
  };

  function syncConnectionDemands(options = {}) {
    if (disposed || getDisposed()) {
      return false;
    }
    return refreshMembership(options);
  }

  const connectPendingSession = (session, { allowHidden = false } = {}) => {
    if (!session || session.closed || session.exitExpected || !isCurrentSession(session)) {
      return false;
    }
    const socketReadyState = session.socket?.readyState;
    if (socketReadyState === socketOpen || socketReadyState === socketConnecting) {
      session.pendingConnect = false;
      return true;
    }
    if (Number(session.measuredFitGeneration || 0) > 0 && sessionHasKnownSize(session)) {
      if (documentObject?.hidden && !allowHidden) return false;
      // Known geometry is sufficient for attach. Do not require the failed
      // old resize to complete before beginning its replacement connection.
      return requestConnection(session, { reason: "backend_ready", allowHidden });
    }
    if (Number(session.measuredFitGeneration || 0) > 0) {
      session.pendingConnect = true;
      scheduleUnifiedSync({ reason: "backend_pending" });
      return false;
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
    if (!session || session.exitExpected || session.connectionChannel !== "unified") {
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

  const registerSession = (session) => Boolean(session);

  const unregisterSession = (session, reason = "session_closed") => {
    lifecycle.disposeSession(session);
    return true;
  };

  const dispose = (reason = "page_disposed") => {
    if (disposed) {
      return false;
    }
    disposed = true;
    const sessions = sessionsArray();
    lifecycle.dispose(sessions);
    membership.clear();
    return true;
  };

  return Object.freeze({
    finishExitedSession(session) {
      if (!session?.exitExpected) return false;
      clearUnifiedRetry(session, { resetAttempts: true });
      if (session.connectionChannel === "unified") detachUnifiedSession(session, "terminal_exited");
      refreshMembership({ reason: "terminal_exited" });
      return true;
    },
    clearUnifiedRetry,
    connectPendingSession,
    connectPendingSessionsForTab,
    currentLease: () => null,
    detachUnifiedSession,
    dispose,
    flushPendingMembershipRefresh,
    hasKnownSize: sessionHasKnownSize,
    notifyDirectClosed: () => false,
    notifyDirectFailure: () => false,
    notifyDirectOpen: () => false,
    notifyDirectReplayReady: () => false,
    recycleUnifiedSession,
    refreshMembership,
    registerSession,
    releaseDirectSession: () => false,
    requestConnection,
    resetMeasurementAttempts: lifecycle.resetMeasurementAttempts,
    scheduleUnifiedPaneRetry,
    scheduleUnifiedSync,
    setOnline: () => {},
    snapshot: () => Object.freeze({
      membership: membership.snapshot(),
      scheduler: null,
      membershipRefreshPending,
      demandGeneration: 0,
      unifiedChannelGeneration,
    }),
    syncConnectionDemands,
    unregisterSession,
  });
}
