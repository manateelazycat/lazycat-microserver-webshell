/**
 * Owns workspace activity polling and the busy-pane close guard. It mutates
 * pane activity fields through the supplied tab snapshot, but does not own
 * terminal transport, rendering, or workspace persistence.
 */
export function createWorkspaceActivityController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  getTabs = () => [],
  getCurrentTab = () => null,
  getActiveTabId = () => "",
  getActiveName = () => "",
  getInstanceGeneration = () => 0,
  getActivityURL = () => "",
  fetchFunction = globalThis.fetch,
  isCurrentInstanceRequest = () => true,
  ensureResponseSelector = () => {},
  observeServerGeometry = () => {},
  onPaneProcessChange = () => {},
  syncPaneMembership = () => Promise.resolve(false),
  getMutationState = () => ({ version: 0, pending: false }),
  recoverSessions = () => {},
  refreshTabAutoLabel = () => {},
  updateMobileActiveTabTitle = () => {},
  updateDocumentTitle = () => {},
  markSessionActivityNotification = () => {},
  markSessionIdleNotification = () => {},
  showToast = () => {},
  confirmCloseRunningCommand = () => true,
  isDisposed = () => false,
  activityPollIntervalMs = 4000,
} = {}) {
  let disposed = false;
  let activityRefreshTimer = 0;
  let activityRefreshDelayTimer = 0;
  let activityRequestSequence = 0;

  const isInactive = () => disposed || isDisposed();

  const updatePaneActivity = (paneState) => {
    if (isInactive()) {
      return;
    }
    const paneId = paneState?.id;
    if (!paneId) {
      return;
    }
    for (const tab of getTabs() || []) {
      const pane = tab?.panes?.get?.(paneId);
      if (!pane) {
        continue;
      }
      const wasBusy = Boolean(pane.busy);
      const isBusy = Boolean(paneState.busy);
      const previousCommand = pane.command;
      const previousCommandLine = pane.processCommandLine;
      pane.tty = paneState.tty || pane.tty || "";
      pane.busy = isBusy;
      pane.command = paneState.command || "";
      pane.processCommandLine = paneState.command_line || "";
      pane.cwd = paneState.cwd || pane.cwd || "";
      pane.activityCheckedAt = Number(paneState.activity_checked_at || 0);
      if (previousCommand !== pane.command || previousCommandLine !== pane.processCommandLine) {
        onPaneProcessChange(pane);
      }
      observeServerGeometry(pane, paneState);
      if (pane.shellEl?.dataset) {
        pane.shellEl.dataset.busy = pane.busy ? "true" : "false";
      }
      markSessionActivityNotification(pane, wasBusy, isBusy);
      markSessionIdleNotification(pane, wasBusy, isBusy);
      if (tab.activePaneId === pane.id) {
        refreshTabAutoLabel(tab);
        if (tab.id === getActiveTabId()) {
          updateMobileActiveTabTitle();
        }
      }
      return;
    }
  };

  const refreshActivity = async ({ silent = true } = {}) => {
    if (isInactive()) {
      return [];
    }
    recoverSessions(getCurrentTab()?.panes?.values?.() || []);
    const requestName = String(getActiveName() || "").trim();
    const generation = getInstanceGeneration();
    if (!requestName) {
      return [];
    }
    const requestSequence = ++activityRequestSequence;
    const mutation = getMutationState();
    const response = await fetchFunction(getActivityURL(requestName), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text() || `Activity request failed (${response.status})`);
    }
    const state = await response.json();
    if (isInactive() || requestSequence !== activityRequestSequence || !isCurrentInstanceRequest(requestName, generation)) {
      return [];
    }
    ensureResponseSelector(state, requestName, "Activity");
    for (const paneState of state?.panes || []) {
      updatePaneActivity(paneState);
    }
    if (state?.error) {
      if (!silent) {
        showToast(state.error);
      }
      throw new Error(state.error);
    }
    // Activity already contains the authoritative pane membership. Only a
    // complete, valid list can justify fetching a structural workspace update.
    if (!mutation.pending && !getMutationState().pending && mutation.version === getMutationState().version
      && Array.isArray(state?.panes) && state.panes.every((pane) => typeof pane?.id === "string" && pane.id.trim())) {
      const remoteIDs = new Set(state.panes.map((pane) => pane.id));
      const localIDs = new Set();
      for (const tab of getTabs() || []) {
        for (const pane of tab?.panes?.values?.() || []) {
          if (!pane.closed && (!pane.name || pane.name === requestName)) localIDs.add(pane.id);
        }
      }
      if (remoteIDs.size === state.panes.length && (remoteIDs.size !== localIDs.size || [...remoteIDs].some((id) => !localIDs.has(id)))) {
        await syncPaneMembership({ instanceName: requestName, generation, paneIDs: [...remoteIDs].sort() });
      }
    }
    if (isInactive() || !isCurrentInstanceRequest(requestName, generation)) return [];
    updateDocumentTitle();
    return state?.panes || [];
  };

  const targetPanesFromTab = (tab) => Array.from(tab?.panes?.values?.() || []);
  const busyPanes = (panes) => panes.filter((pane) => pane?.busy);

  const refreshAndConfirmClose = async (panes, messagePrefix) => {
    try {
      await refreshActivity({ silent: true });
    } catch (error) {
      showToast(error.message || "Activity refresh failed.");
      return true;
    }
    const busy = busyPanes(panes);
    if (busy.length === 0) {
      return true;
    }
    const commands = busy.map((pane) => pane.command || pane.id).slice(0, 5).join(", ");
    return confirmCloseRunningCommand(`${messagePrefix}\n\n正在运行: ${commands}`, {
      title: "运行中命令",
      okText: "关闭",
      danger: true,
    });
  };

  const hasCachedBusyPane = () => {
    for (const tab of getTabs() || []) {
      for (const pane of tab?.panes?.values?.() || []) {
        if (pane.busy) {
          return true;
        }
      }
    }
    return false;
  };

  const scheduleActivityRefresh = (delay = 700) => {
    if (isInactive()) {
      return false;
    }
    windowObject?.clearTimeout?.(activityRefreshDelayTimer);
    activityRefreshDelayTimer = windowObject?.setTimeout?.(() => {
      activityRefreshDelayTimer = 0;
      refreshActivity({ silent: true }).catch(() => {});
    }, delay) || 0;
    return true;
  };

  const startActivityRefresh = () => {
    if (isInactive()) {
      return false;
    }
    windowObject?.clearInterval?.(activityRefreshTimer);
    activityRefreshTimer = windowObject?.setInterval?.(() => {
      if (!documentObject?.hidden && navigatorObject?.onLine !== false) {
        refreshActivity({ silent: true }).catch(() => {});
      }
    }, activityPollIntervalMs) || 0;
    return true;
  };

  const stopActivityRefresh = () => {
    windowObject?.clearInterval?.(activityRefreshTimer);
    windowObject?.clearTimeout?.(activityRefreshDelayTimer);
    activityRefreshTimer = 0;
    activityRefreshDelayTimer = 0;
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    activityRequestSequence += 1;
    stopActivityRefresh();
    return true;
  };

  return Object.freeze({
    dispose,
    hasCachedBusyPane,
    isDisposed: () => disposed,
    refreshActivity,
    refreshAndConfirmClose,
    scheduleActivityRefresh,
    startActivityRefresh,
    stopActivityRefresh,
    targetPanesFromTab,
    updatePaneActivity,
  });
}
