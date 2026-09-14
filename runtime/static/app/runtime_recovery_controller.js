import { createAppRuntimeRecoveryLifecycle } from "./runtime_recovery_lifecycle.js";

export function createAppRuntimeRecoveryController({
  windowObject = globalThis.window,
  networkBanner = null,
  getTabs = () => [],
  getCurrentTab = () => null,
  getActiveName = () => "",
  isOnline = () => true,
  clearUnifiedRetry = () => {},
  isReplayRetryPaused = () => false,
  resumeReplayRetry = () => {},
  checkSessionHealth = () => false,
  probeOpenSocket = () => {},
  setTransportOnline = () => {},
  probeUnifiedTransport = () => false,
  retryUnifiedTransport = () => false,
  waitForUnifiedClosures = () => Promise.resolve(),
  clearExpectedCloseReason = () => {},
  refreshMembership = () => {},
  syncConnectionDemands = () => {},
  closeUnifiedTransport = () => {},
  rememberWorkspaceRestoreState = () => {},
  resumeDevices = () => {},
  claimActiveTabSize = () => {},
  resumeWorkspaceRetry = () => {},
  refreshWorkspaceActivity = () => Promise.resolve(),
  updateSelection = () => {},
  renderNetworkMonitor = () => {},
  showToast = () => {},
  appendDebugLog = () => {},
  recordRuntimeEvent = () => {},
  recordMetric = () => {},
  isRecoveryReady = () => false,
  onResumeDeadline = () => {},
  resumeDeadlineMs = 2000,
  lifecycleFactory = createAppRuntimeRecoveryLifecycle,
  lifecycleOptions,
} = {}) {
  const lifecycle = lifecycleFactory(lifecycleOptions);
  let lastNetworkBannerState = null;
  let resumeTraceGeneration = 0;
  const deadlineTimers = new Map();

  const clearResumeDeadline = (generation) => {
    const timer = deadlineTimers.get(generation);
    if (!timer) {
      return false;
    }
    windowObject?.clearTimeout?.(timer);
    deadlineTimers.delete(generation);
    return true;
  };

  const scheduleResumeDeadline = (source, reservation) => {
    if (!reservation?.accepted || !windowObject?.setTimeout) {
      return false;
    }
    const generation = Number(reservation.generation || 0);
    const delay = Math.max(250, Number(resumeDeadlineMs) || 2000);
    for (const existingGeneration of deadlineTimers.keys()) {
      if (existingGeneration !== generation) {
        clearResumeDeadline(existingGeneration);
      }
    }
    clearResumeDeadline(generation);
    const timer = windowObject.setTimeout(() => {
      deadlineTimers.delete(generation);
      if (lifecycle.isDisposed() || !lifecycle.isCurrent(generation)) {
        recordMetric("staleRecoveryCallbacks");
        recordRuntimeEvent("resume_deadline_stale", {
          source,
          resumeGeneration: reservation.resumeGeneration,
          lifecycleGeneration: generation,
        });
        return;
      }
      if (!isOnline()) {
        return;
      }
      let ready = false;
      try {
        ready = isRecoveryReady() === true;
      } catch (error) {
        ready = false;
      }
      recordMetric(ready ? "resumeDeadlineMet" : "resumeDeadlineExceeded");
      recordRuntimeEvent(ready ? "resume_deadline_met" : "resume_deadline_exceeded", {
        source,
        resumeGeneration: reservation.resumeGeneration,
        lifecycleGeneration: generation,
        deadlineMs: delay,
      });
      if (!ready) {
        onResumeDeadline({
          source,
          resumeGeneration: reservation.resumeGeneration,
          lifecycleGeneration: generation,
          deadlineMs: delay,
        });
      }
    }, delay);
    deadlineTimers.set(generation, timer);
    return true;
  };

  const beginResumeTrace = (source, details = {}, options = {}) => {
    const reservation = lifecycle.beginResumeGeneration?.(options) || {
      accepted: true,
      generation: lifecycle.nextGeneration(),
      resumeGeneration: resumeTraceGeneration + 1,
    };
    resumeTraceGeneration = Math.max(
      resumeTraceGeneration,
      Number(reservation.resumeGeneration || 0),
    );
    if (!reservation.accepted) {
      recordRuntimeEvent("resume_signal_coalesced", {
        source,
        resumeGeneration: resumeTraceGeneration,
        ...details,
      });
      return reservation;
    }
    recordMetric("resumeSignals");
    recordMetric("resumeTransactionsStarted");
    recordRuntimeEvent("resume_signal", {
      source,
      resumeGeneration: reservation.resumeGeneration,
      ...details,
    });
    recordRuntimeEvent("resume_dispatch_start", {
      source,
      resumeGeneration: reservation.resumeGeneration,
    });
    scheduleResumeDeadline(source, reservation);
    return reservation;
  };

  const finishResumeTrace = (source, reservation, status = "completed", details = {}) => {
    if (!reservation?.accepted) {
      return;
    }
    if (status === "completed") {
      recordMetric("resumeTransactionsCompleted");
    }
    recordRuntimeEvent("resume_dispatch_complete", {
      source,
      resumeGeneration: reservation.resumeGeneration,
      status,
      ...details,
    });
  };

  const setNetworkBanner = (visible, message = "") => {
    if (lifecycle.isDisposed() || !networkBanner) {
      return false;
    }
    const nextState = visible ? "offline" : "online";
    if (lastNetworkBannerState !== nextState) {
      lastNetworkBannerState = nextState;
      appendDebugLog(
        visible ? "error" : "info",
        visible ? "网络已断开，终端暂停重试" : "网络已恢复，终端开始重连",
      );
    }
    networkBanner.textContent = message || "Offline. Reconnecting when network is back.";
    networkBanner.hidden = !visible;
    return true;
  };

  const markWorkspaceSessionsOffline = () => {
    if (lifecycle.isDisposed()) {
      return false;
    }
    for (const tab of getTabs()) {
      for (const pane of tab.panes?.values?.() || []) {
        if (!pane.closed && !pane.exitExpected) {
          clearUnifiedRetry(pane);
          pane.shellEl.dataset.connection = "offline";
        }
      }
    }
    return true;
  };

  const reconnectVisibleSessions = ({ allowHidden = false, probe = false } = {}) => {
    if (lifecycle.isDisposed() || !isOnline()) {
      return false;
    }
    const tab = getCurrentTab();
    for (const pane of tab?.panes?.values?.() || []) {
      if (pane.name !== getActiveName() || pane.exitExpected) {
        continue;
      }
      if (probe && isReplayRetryPaused(pane)) {
        resumeReplayRetry(pane, "user_recovery");
      }
      const ready = checkSessionHealth(pane, { connect: true, force: true, allowHidden });
      if (probe && ready) {
        probeOpenSocket(pane, { allowHidden });
      }
    }
    return true;
  };

  const reconnectWorkspaceSessions = ({ allowHidden = true } = {}) => {
    if (lifecycle.isDisposed() || !isOnline()) {
      return false;
    }
    for (const tab of getTabs()) {
      for (const pane of tab.panes?.values?.() || []) {
        if (pane.name === getActiveName()) {
          resumeReplayRetry(pane, "network_online");
          checkSessionHealth(pane, { connect: true, force: true, allowHidden });
        }
      }
    }
    return true;
  };

  const recoverVisibleSessionsFromUserGesture = () => {
    if (!lifecycle.shouldRecoverFromUserGesture()) {
      return false;
    }
    const resumeReservation = beginResumeTrace("user_gesture", {}, { force: true });
    if (!resumeReservation.accepted) {
      return false;
    }
    const recovered = reconnectVisibleSessions({ allowHidden: true, probe: true });
    finishResumeTrace("user_gesture", resumeReservation, recovered ? "completed" : "rejected");
    return recovered;
  };

  const refreshActivitySilently = () => {
    Promise.resolve(refreshWorkspaceActivity({ silent: true })).catch(() => {});
  };

  const recoverUnifiedTransport = (reason) => (
    probeUnifiedTransport(reason) || retryUnifiedTransport(reason)
  );

  const handleOnline = () => {
    if (lifecycle.isDisposed()) {
      return false;
    }
    const resumeReservation = beginResumeTrace("network_online");
    if (!resumeReservation.accepted) {
      return true;
    }
    const generation = resumeReservation.generation;
    setNetworkBanner(false);
    renderNetworkMonitor();
    showToast("网络已恢复，正在重连。");
    setTransportOnline(true);
    probeUnifiedTransport("network_online");
    Promise.resolve(waitForUnifiedClosures()).then(() => {
      if (!lifecycle.isCurrent(generation) || !isOnline()) {
        recordMetric("staleRecoveryCallbacks");
        recordRuntimeEvent("resume_callback_stale", {
          source: "network_online",
          resumeGeneration: resumeReservation.resumeGeneration,
          lifecycleGeneration: generation,
        });
        return;
      }
      clearExpectedCloseReason();
      refreshMembership({ reason: "network_online" });
      syncConnectionDemands({ reason: "network_online" });
      reconnectWorkspaceSessions({ allowHidden: true });
      finishResumeTrace("network_online", resumeReservation, "completed");
    });
    resumeWorkspaceRetry();
    refreshActivitySilently();
    return true;
  };

  const handleOffline = () => {
    if (lifecycle.isDisposed()) {
      return false;
    }
    lifecycle.invalidate();
    recordRuntimeEvent("runtime_offline", {
      source: "network_offline",
      resumeGeneration: resumeTraceGeneration,
    });
    setNetworkBanner(true);
    renderNetworkMonitor();
    markWorkspaceSessionsOffline();
    closeUnifiedTransport("network_offline");
    setTransportOnline(false);
    showToast("网络已断开。");
    return true;
  };

  const handleVisibilityChange = ({ hidden = false } = {}) => {
    if (lifecycle.isDisposed()) {
      return false;
    }
    if (hidden) {
      recordRuntimeEvent("resume_signal_ignored", {
        source: "visibilitychange",
        hidden: true,
        resumeGeneration: resumeTraceGeneration,
      });
      return false;
    }
    const resumeReservation = beginResumeTrace("visibilitychange");
    if (!resumeReservation.accepted) {
      return true;
    }
    rememberWorkspaceRestoreState();
    resumeDevices();
    claimActiveTabSize({ forceFullRender: true, hideUntilRender: true });
    recoverUnifiedTransport("visibility_resume");
    reconnectVisibleSessions({ allowHidden: true, probe: true });
    refreshActivitySilently();
    updateSelection();
    finishResumeTrace("visibilitychange", resumeReservation);
    return true;
  };

  const handleFocus = () => {
    if (lifecycle.isDisposed()) {
      return false;
    }
    const resumeReservation = beginResumeTrace("focus");
    if (!resumeReservation.accepted) {
      return true;
    }
    claimActiveTabSize({ forceFullRender: true });
    recoverUnifiedTransport("window_focus");
    reconnectVisibleSessions({ allowHidden: true, probe: true });
    refreshActivitySilently();
    finishResumeTrace("focus", resumeReservation);
    return true;
  };

  const handlePageShow = () => {
    if (lifecycle.isDisposed()) {
      return false;
    }
    const resumeReservation = beginResumeTrace("pageshow");
    if (!resumeReservation.accepted) {
      return true;
    }
    rememberWorkspaceRestoreState();
    resumeDevices();
    claimActiveTabSize({ forceFullRender: true, hideUntilRender: true });
    recoverUnifiedTransport("pageshow_resume");
    reconnectVisibleSessions({ allowHidden: true, probe: true });
    refreshActivitySilently();
    finishResumeTrace("pageshow", resumeReservation);
    return true;
  };

  const dispose = () => {
    for (const generation of deadlineTimers.keys()) {
      clearResumeDeadline(generation);
    }
    return lifecycle.dispose();
  };

  return Object.freeze({
    dispose,
    handleFocus,
    handleOffline,
    handleOnline,
    handlePageShow,
    handleVisibilityChange,
    markWorkspaceSessionsOffline,
    reconnectVisibleSessions,
    reconnectWorkspaceSessions,
    recoverVisibleSessionsFromUserGesture,
    setNetworkBanner,
    getResumeTraceGeneration: () => resumeTraceGeneration,
  });
}
