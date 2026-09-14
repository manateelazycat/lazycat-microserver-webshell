export function createWorkspaceTabController({
  tabRegistry,
  tabView,
  getActiveName = () => "",
  getActiveTabId = () => "",
  isApplyingWorkspaceState = () => false,
  runApplying = (task) => task(),
  createPaneSession = () => null,
  disposePaneSession = () => {},
  renderTabLayout = () => {},
  splitLayout = () => null,
  removePaneFromLayout = () => null,
  collectPaneIds = () => [],
  activateTab = () => {},
  clearActiveTab = () => {},
  cancelTabActivation = () => {},
  getOrderedTabs = () => [],
  updateEmptyState = () => {},
  scheduleOverviewRender = () => {},
  syncConnectionDemands = () => {},
  cancelTabResize = () => {},
  handleTabRemoved = () => {},
  isRenaming = () => false,
  cancelRename = () => {},
  refreshAndConfirmClose = () => Promise.resolve(true),
  targetPanesFromTab = (tab) => Array.from(tab?.panes?.values?.() || []),
  postWorkspaceAction = () => Promise.resolve(false),
  destroyCachedSession = () => Promise.resolve(false),
  promptRename = () => Promise.resolve(null),
  commitTabRename = () => Promise.resolve(false),
  showToast = () => {},
  clearRecentTabs = () => {},
} = {}) {
  let disposed = false;

  const tabs = tabRegistry.tabs;

  const createTab = ({
    id = "",
    label,
    pane,
    paneId = "",
    focus = true,
    connect = true,
    customLabel = false,
    empty = false,
    activate = true,
  } = {}) => {
    if (disposed) {
      return null;
    }
    const normalizedID = tabRegistry.allocateTabId(id);
    const numeric = Number(normalizedID.replace(/^tab-/, ""));
    const elements = tabView.createTabElements(normalizedID);
    if (!elements) {
      return null;
    }
    const tab = {
      id: normalizedID,
      label: label || `Shell ${numeric || tabRegistry.getNextTabSeq() - 1}`,
      customLabel: Boolean(customLabel || label),
      panes: new Map(),
      activePaneId: null,
      layout: null,
      paneEl: elements.paneElement,
      layoutHost: elements.layoutHost,
      button: null,
      contextMenuCleanup: null,
    };
    tabRegistry.set(tab.id, tab);
    tabView.createTabButton(tab);
    if (pane) {
      pane.tabId = tab.id;
      tab.panes.set(pane.id, pane);
      tab.activePaneId = pane.id;
      tab.layout = { type: "leaf", paneId: pane.id };
    } else if (!empty) {
      const session = createPaneSession(tab, getActiveName(), { id: paneId, connect });
      tab.activePaneId = session.id;
      tab.layout = { type: "leaf", paneId: session.id };
    }
    renderTabLayout(tab);
    if (activate) {
      activateTab(tab.id, { focus });
    }
    updateEmptyState();
    return tab;
  };

  const recreateTabButton = (tab) => tabView.recreateTabButton(tab);
  const disposePane = (pane) => disposePaneSession(pane);

  const splitPane = (tabId, paneId, direction) => {
    const tab = tabs.get(tabId);
    if (!tab || !tab.panes.has(paneId) || disposed) {
      return false;
    }
    if (!isApplyingWorkspaceState()) {
      postWorkspaceAction("split_pane", { tab_id: tabId, pane_id: paneId, direction })
        .catch((error) => showToast(error.message));
      return true;
    }
    const session = createPaneSession(tab, getActiveName());
    if (!splitLayout(tab.layout, paneId, direction, session.id)) {
      tab.layout = {
        type: "split",
        direction,
        children: [{ type: "leaf", paneId }, { type: "leaf", paneId: session.id }],
      };
    }
    tab.activePaneId = session.id;
    renderTabLayout(tab);
    activateTab(tab.id);
    return true;
  };

  const closePane = (tabId, paneId) => {
    const tab = tabs.get(tabId);
    const pane = tab?.panes.get(paneId);
    if (!tab || !pane || disposed) {
      return false;
    }
    if (!isApplyingWorkspaceState()) {
      refreshAndConfirmClose([pane], "关闭此窗格并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_pane", { tab_id: tabId, pane_id: paneId })
            .then(() => destroyCachedSession(pane))
            .catch((error) => showToast(error.message));
        }
      });
      return true;
    }
    disposePane(pane);
    tab.panes.delete(paneId);
    tab.layout = removePaneFromLayout(tab.layout, paneId);
    const paneIds = collectPaneIds(tab.layout);
    tab.activePaneId = paneIds.includes(tab.activePaneId) ? tab.activePaneId : paneIds[0] || null;
    if (tab.panes.size === 0 || !tab.layout) {
      closeTab(tab.id, { allowLast: true, remember: false });
      return true;
    }
    renderTabLayout(tab);
    activateTab(tab.id);
    return true;
  };

  const closeTab = (tabId, { allowLast = true, remember = true } = {}) => {
    const tab = tabs.get(tabId);
    if (!tab || disposed) {
      return false;
    }
    if (!allowLast && tabs.size <= 1) {
      showToast("至少需要保留一个标签。");
      return false;
    }
    if (isRenaming(tab.id)) {
      cancelRename();
    }
    if (!isApplyingWorkspaceState()) {
      const panesToClose = targetPanesFromTab(tab);
      refreshAndConfirmClose(panesToClose, "关闭此标签并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_tab", { tab_id: tabId })
            .then(() => Promise.allSettled(panesToClose.map((pane) => destroyCachedSession(pane))))
            .catch((error) => showToast(error.message));
        }
      });
      return true;
    }
    handleTabRemoved(tab.id);
    let nextActiveTab = null;
    if (getActiveTabId() === tab.id) {
      const orderedTabs = getOrderedTabs();
      const currentIndex = orderedTabs.findIndex((item) => item.id === tab.id);
      if (currentIndex >= 0) {
        nextActiveTab = orderedTabs[currentIndex + 1] || orderedTabs[currentIndex - 1] || null;
      }
    }
    for (const pane of tab.panes.values()) {
      disposePane(pane);
    }
    cancelTabResize(tab);
    tabView.disposeTab(tab);
    tabRegistry.delete(tab.id);
    if (getActiveTabId() === tab.id) {
      clearActiveTab();
      cancelTabActivation();
      if (nextActiveTab && tabs.has(nextActiveTab.id)) {
        activateTab(nextActiveTab.id, { remember });
      }
    }
    updateEmptyState();
    scheduleOverviewRender();
    if (!isApplyingWorkspaceState()) {
      syncConnectionDemands({ reason: "tab_closed" });
    }
    return true;
  };

  const closeOtherTabs = (tabId) => {
    if (disposed) {
      return false;
    }
    if (!isApplyingWorkspaceState()) {
      const panes = Array.from(tabs.values())
        .filter((tab) => tab.id !== tabId)
        .flatMap((tab) => targetPanesFromTab(tab));
      refreshAndConfirmClose(panes, "关闭其他标签并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_other_tabs", { tab_id: tabId })
            .then(() => Promise.allSettled(panes.map((pane) => destroyCachedSession(pane))))
            .catch((error) => showToast(error.message));
        }
      });
      return true;
    }
    for (const tab of [...tabs.values()]) {
      if (tab.id !== tabId) {
        closeTab(tab.id);
      }
    }
    activateTab(tabId);
    return true;
  };

  const renameTab = async (tabId) => {
    const tab = tabs.get(tabId);
    if (!tab || disposed) {
      return false;
    }
    const nextLabel = await promptRename("Rename tab", tab.label);
    if (nextLabel === null) {
      return false;
    }
    const normalized = nextLabel.trim();
    if (!normalized) {
      return false;
    }
    await commitTabRename(tabId, normalized, { force: true });
    return true;
  };

  const movePaneToNewTab = (tabId, paneId) => {
    const sourceTab = tabs.get(tabId);
    const pane = sourceTab?.panes.get(paneId);
    if (!sourceTab || !pane || sourceTab.panes.size <= 1 || disposed) {
      return false;
    }
    if (!isApplyingWorkspaceState()) {
      postWorkspaceAction("move_pane_to_tab", { tab_id: tabId, pane_id: paneId })
        .catch((error) => showToast(error.message));
      return true;
    }
    sourceTab.panes.delete(paneId);
    sourceTab.layout = removePaneFromLayout(sourceTab.layout, paneId);
    const remaining = collectPaneIds(sourceTab.layout);
    sourceTab.activePaneId = remaining[0] || null;
    pane.shellEl?.remove?.();
    const label = `${sourceTab.label} ${tabs.size + 1}`;
    const nextTab = createTab({ label, pane, focus: true });
    renderTabLayout(sourceTab);
    activateTab(nextTab.id);
    return true;
  };

  const moveTab = (tabId, position) => {
    const tab = tabs.get(tabId);
    if (!tab || disposed) {
      return false;
    }
    if (!isApplyingWorkspaceState()) {
      postWorkspaceAction("move_tab", { tab_id: tabId, position })
        .catch((error) => showToast(error.message));
      return true;
    }
    if (!tabView.moveTabButton(tab, position, getOrderedTabs())) {
      return false;
    }
    activateTab(tabId, { focus: false });
    scheduleOverviewRender();
    return true;
  };

  const resetForInstance = () => runApplying(() => {
    for (const tab of [...tabs.values()]) {
      closeTab(tab.id, { remember: false });
    }
    clearRecentTabs();
  });

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    tabView.dispose();
    return true;
  };

  return Object.freeze({
    async restartExitedPane(session) {
      if (disposed || !session?.terminalExitRetained || session.closed || tabs.get(session.tabId)?.panes.get(session.id) !== session) return false;
      const dimensions = session.fitAddon?.proposeDimensions?.() || {};
      return postWorkspaceAction("restart_pane", {
        tab_id: session.tabId, pane_id: session.id,
        cols: dimensions.cols || session.term.cols,
        rows: dimensions.rows || session.term.rows,
      }, { focus: true, preferStateActiveTab: true });
    },
    closeOtherTabs,
    closePane,
    closeTab,
    createTab,
    dispose,
    disposePane,
    isDisposed: () => disposed,
    movePaneToNewTab,
    moveTab,
    recreateTabButton,
    renameTab,
    resetForInstance,
    splitPane,
  });
}
