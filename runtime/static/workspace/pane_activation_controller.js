import { createWorkspacePaneActivationLifecycle } from "./pane_activation_lifecycle.js";

export function createWorkspacePaneActivationController({
  documentObject = globalThis.document,
  ElementCtor = globalThis.Element,
  HTMLElementCtor = globalThis.HTMLElement,
  getActiveTabId = () => "",
  getTabById = () => null,
  activateTab = () => false,
  isApplyingWorkspaceState = () => false,
  resetSessionUserInput = () => {},
  refreshTabAutoLabel = () => {},
  syncCursorBlinkState = () => {},
  updateSelectionHandles = () => {},
  schedulePaneResize = () => {},
  claimCurrentDeviceSize = () => {},
  presentationIsCurrent = () => false,
  cancelPendingRender = () => {},
  connectPendingSession = () => {},
  checkSessionHealth = () => false,
  syncConnectionDemands = () => {},
  postWorkspaceAction = () => Promise.resolve(false),
  showToast = () => {},
  lifecycleFactory = createWorkspacePaneActivationLifecycle,
  lifecycleOptions,
} = {}) {
  const lifecycle = lifecycleFactory(lifecycleOptions);

  const activate = (tab, paneId, {
    focus = true,
    resize = true,
    resizeIfActive = false,
    userInteraction = false,
    syncConnection = true,
  } = {}) => {
    if (lifecycle.isDisposed() || !tab || !tab.panes?.has?.(paneId)) {
      return false;
    }
    const wasActive = tab.activePaneId === paneId;
    tab.activePaneId = paneId;
    for (const pane of tab.panes.values()) {
      pane.shellEl.classList.toggle("active", pane.id === paneId);
    }
    const activePane = tab.panes.get(paneId);
    if (!wasActive) {
      resetSessionUserInput(activePane);
    }
    refreshTabAutoLabel(tab);
    syncCursorBlinkState();
    updateSelectionHandles(activePane);
    const shouldResize = resize && (!wasActive || resizeIfActive);
    const shouldClaimCurrentDevice = tab.id === getActiveTabId()
      && !isApplyingWorkspaceState()
      && (userInteraction || (shouldResize && !wasActive));
    if (shouldClaimCurrentDevice) {
      claimCurrentDeviceSize(activePane, {
        forceFullRender: shouldResize,
        hideUntilRender: shouldResize && !presentationIsCurrent(activePane),
      });
    } else if (shouldResize && tab.id === getActiveTabId()) {
      schedulePaneResize(activePane, {
        forceFullRender: true,
        hideUntilRender: !presentationIsCurrent(activePane),
      }, { immediate: true });
    } else if (shouldResize) {
      cancelPendingRender(activePane?.term);
    }
    if (!userInteraction && !wasActive) {
      if (activePane?.pendingConnect) {
        connectPendingSession(activePane);
      } else {
        checkSessionHealth(activePane, { connect: true, force: true });
      }
    }
    if (syncConnection && tab.id === getActiveTabId() && (!wasActive || userInteraction)) {
      syncConnectionDemands({
        reason: userInteraction ? "pane_pointer" : "active_pane_changed",
        interactionSession: userInteraction ? activePane : null,
      });
    }
    if (focus) {
      lifecycle.scheduleFrame(() => {
        if (
          getActiveTabId() !== tab.id
          || tab.activePaneId !== activePane?.id
          || activePane?.closed
        ) {
          return;
        }
        connectPendingSession(activePane);
        activePane?.term?.focus();
      });
    }
    if (!isApplyingWorkspaceState() && !wasActive) {
      Promise.resolve(postWorkspaceAction("activate_pane", {
        tab_id: tab.id,
        pane_id: paneId,
      }, {
        // Activation is already applied locally. Its acknowledgement may
        // arrive after a newer tab/pane selection and must not replace it.
        focus: false,
        preferStateActiveTab: false,
        applyResponse: false,
      })).catch((error) => {
        if (!lifecycle.isDisposed()) {
          showToast(error.message);
        }
      });
    }
    return true;
  };

  const focusAtPoint = (clientX, clientY) => {
    if (
      lifecycle.isDisposed()
      || !Number.isFinite(clientX)
      || !Number.isFinite(clientY)
    ) {
      return false;
    }
    const target = documentObject?.elementFromPoint?.(clientX, clientY);
    const shellEl = target instanceof ElementCtor ? target.closest(".pane-shell") : null;
    if (!(shellEl instanceof HTMLElementCtor)) {
      return false;
    }
    const paneId = shellEl.dataset.paneId;
    const tabId = shellEl.closest(".terminal-pane")?.dataset.tabId || getActiveTabId();
    const tab = getTabById(tabId);
    if (!paneId || !tab?.panes?.has?.(paneId)) {
      return false;
    }
    if (tab.id !== getActiveTabId()) {
      activateTab(tab.id, { focus: false });
    }
    activate(tab, paneId, { focus: true, userInteraction: true });
    return true;
  };

  return Object.freeze({
    activate,
    dispose: lifecycle.dispose,
    focusAtPoint,
    isDisposed: lifecycle.isDisposed,
  });
}
