import { createTabActivationScheduler } from "./tab_activation_scheduler.js";

export function createWorkspaceTabActivationController({
  tabRegistry,
  tabView,
  getInstanceGeneration = () => 0,
  isAppDisposed = () => false,
  isApplyingWorkspaceState = () => false,
  finishLayoutInteraction = () => {},
  beforeActivate = () => {},
  onActivated = () => {},
  onCleared = () => {},
  measureTask = (_name, task) => task(),
  presentationStateIsCurrent = () => false,
  canBrowseLocally = () => false,
  holdPresentationFrame = () => {},
  schedulePresentationFrameRelease = () => {},
  beginPresentationHold = () => {},
  setPresentationReady = () => {},
  resetMeasurementAttempts = () => {},
  resetSessionUserInput = () => {},
  clearTabNotification = () => {},
  rememberRecentTab = () => {},
  setActivePane = () => {},
  rememberActiveTab = () => {},
  refreshUploadPanels = () => {},
  scrollTabButtonIntoView = () => {},
  scheduleOverviewRender = () => {},
  scheduleVisibleTabResize = () => {},
  claimVisibleTabSize = () => {},
  syncConnectionDemands = () => {},
  persistActiveTab = () => Promise.resolve(false),
  showToast = () => {},
  now = () => Date.now(),
  schedulerFactory = createTabActivationScheduler,
  schedulerOptions,
} = {}) {
  const scheduler = schedulerFactory(schedulerOptions);
  let disposed = false;

  const preserveTabFrames = (tab, { onlyIfStale = false } = {}) => {
    for (const pane of tab?.panes?.values?.() || []) {
      if (
        pane.hasPresentedFrame
        && !canBrowseLocally(pane)
        && !pane.terminalFrameHeld
        && (!onlyIfStale || !presentationStateIsCurrent(pane))
      ) {
        holdPresentationFrame(pane);
      }
    }
  };

  const isCurrentTab = (tab, instanceGeneration) => (
    !disposed
    && !isAppDisposed()
    && getInstanceGeneration() === instanceGeneration
    && tabRegistry.getActiveTabId() === tab.id
    && tabRegistry.get(tab.id) === tab
  );

  const activate = (tabId, {
    focus = true,
    remember = true,
    rememberRecent = true,
    claimCurrentDevice = true,
  } = {}) => {
    const tab = tabRegistry.get(tabId);
    if (!tab || disposed || isAppDisposed()) {
      return false;
    }
    return measureTask("tab switch visual", () => {
      const previousTabId = tabRegistry.getActiveTabId();
      const previousTab = tabRegistry.get(previousTabId);
      const wasActive = previousTabId === tab.id;
      beforeActivate(previousTab, tab);
      if (!wasActive) {
        finishLayoutInteraction();
        // Recent tabs can retain their pixels; the surface owner evicts older
        // ones. Capture a hold only for a pending presentation transition.
        preserveTabFrames(previousTab, { onlyIfStale: true });
        preserveTabFrames(tab, { onlyIfStale: true });
      }
      tabRegistry.setActiveTabId(tab.id);
      const activePane = tab.panes.get(tab.activePaneId);
      if (activePane) {
        activePane.lastUserInteractionAt = now();
      }
      if (rememberRecent) {
        rememberRecentTab(tab.id, previousTabId);
      }
      tabView.setActiveTabVisuals([previousTab, tab], tab.id);
      onActivated(tab, previousTab);
      for (const pane of tab.panes.values()) {
        // A disconnected tab still owns its readable local terminal. Let the
        // reconnect path fit it when authoritative output becomes available.
        if (canBrowseLocally(pane)) continue;
        const presentationCurrent = presentationStateIsCurrent(pane);
        pane.activationFitPending = !presentationCurrent;
        if (!wasActive && Number(pane.measuredFitGeneration || 0) <= 0) {
          resetMeasurementAttempts(pane);
        }
        if (!presentationCurrent) {
          if (!wasActive && pane.terminalFrameHeld) {
            beginPresentationHold(pane, { capture: false });
          }
          setPresentationReady(pane, false);
        } else if (pane.terminalFrameHeld) {
          // A frame held while this tab was hidden is already current. Arm the
          // normal two-paint release once the tab becomes visible; otherwise a
          // direct holdPresentationFrame() call would leave the overlay stuck.
          schedulePresentationFrameRelease(pane);
        }
      }
      resetSessionUserInput(activePane);
      clearTabNotification(tab);

      const activationInstanceGeneration = getInstanceGeneration();
      const shouldPersistActiveTab = !isApplyingWorkspaceState() && !wasActive;
      const shouldClaimCurrentDevice = claimCurrentDevice && !isApplyingWorkspaceState() && !wasActive;
      const activationIsCurrent = () => isCurrentTab(tab, activationInstanceGeneration);
      scheduler.schedule(tab.id, [
        () => measureTask("tab activation state", () => {
          if (!activationIsCurrent()) {
            return;
          }
          setActivePane(tab, tab.activePaneId, { focus, resize: false, syncConnection: false });
          if (remember) {
            rememberActiveTab();
          }
          refreshUploadPanels();
          scrollTabButtonIntoView(tab.button);
          scheduleOverviewRender();
        }),
        () => measureTask("tab activation resize", () => {
          if (activationIsCurrent()) {
            if (shouldClaimCurrentDevice) {
              claimVisibleTabSize(tab, { forceFullRender: true });
            } else {
              scheduleVisibleTabResize(tab, { immediate: false });
            }
          }
        }),
        () => measureTask("tab activation membership", () => {
          if (!activationIsCurrent()) {
            return;
          }
          syncConnectionDemands({
            reason: "active_tab_changed",
            interactionSession: null,
          });
          if (shouldPersistActiveTab) {
            Promise.resolve(persistActiveTab(tab.id)).catch((error) => showToast(error.message));
          }
        }),
      ]);
      return true;
    });
  };

  const clear = () => {
    tabRegistry.setActiveTabId(null);
    scheduler.cancel();
    onCleared();
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    tabRegistry.setActiveTabId(null);
    scheduler.dispose();
    return true;
  };

  return Object.freeze({
    activate,
    clear,
    dispose,
    getActiveTabId: () => tabRegistry.getActiveTabId(),
    isDisposed: () => disposed,
  });
}
