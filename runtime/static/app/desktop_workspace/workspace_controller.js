import { createDesktopWorkspaceDirectory } from "./directory_controller.js";
import { createDesktopWorkspaceView } from "./workspace_view.js";
import { createDesktopOverviewView } from "./overview_view.js";
import { createDesktopWorkspaceReorderController } from "./reorder_controller.js";
import { createDesktopSidebarResizeController } from "./sidebar_resize_controller.js";

export function createDesktopWorkspaceController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  storage = windowObject?.localStorage,
  storagePrefix = "webshell",
  isMobileLayout = () => false,
  isEmbedMode = false,
  isLegacyLayout = () => false,
  getInstances = () => [],
  loadInstances = async () => {},
  getActiveName = () => "",
  getActiveGeneration = () => 0,
  getActiveTabId = () => "",
  getOrderedTabs = () => [],
  switchTarget = async () => {},
  refreshActiveWorkspace = async () => {},
  activateTab = () => {},
  createTab = async () => {},
  closeTab = () => {},
  beginInlineRename = () => false,
  cancelInlineRename = () => {},
  isRenaming = () => false,
  positionInlineRename = () => {},
  openContextMenu = () => {},
  reorderTab = async () => {},
  previewTabOrder = () => {},
  closeMenus = () => {},
  closeOverview = () => {},
  isOverviewOpen = () => false,
  scheduleOverviewRender = () => {},
  releasePreview = () => {},
  onNotificationsChange = () => {},
  onLayoutChange = () => {},
  onResizeStart = () => null,
  onResize = () => {},
  onResizeEnd = () => {},
  showToast = () => {},
} = {}) {
  const view = createDesktopWorkspaceView({ documentObject, windowObject });
  const overviewView = createDesktopOverviewView({ documentObject });
  const collapsedGroups = new Set();
  const listeners = [];
  const instanceOrderKey = `${storagePrefix}.desktopInstanceOrder`;
  const readOrder = (value) => {
    try {
      const items = JSON.parse(value || "[]");
      return Array.isArray(items) ? [...new Set(items.filter((item) => typeof item === "string" && item))] : [];
    } catch { return []; }
  };
  let instanceOrder = [];
  try { instanceOrder = readOrder(storage?.getItem(instanceOrderKey)); } catch {}
  const pendingSessionOrders = new Map();
  const committingSelectors = new Set();
  const ordered = (items, ids, key) => {
    const ranks = new Map(ids.map((id, index) => [id, index]));
    return [...items].sort((left, right) => (ranks.get(key(left)) ?? ids.length) - (ranks.get(key(right)) ?? ids.length));
  };
  const groups = () => ordered(directory.groups(), instanceOrder, (group) => group.selector).map((group) => ({
    ...group,
    tabs: pendingSessionOrders.has(group.selector)
      ? ordered(group.tabs, pendingSessionOrders.get(group.selector), (tab) => tab.id) : group.tabs,
  }));
  let reorder = null;
  let active = false;
  let started = false;
  let disposed = false;
  let frame = 0;
  let navigation = 0;
  let pendingSelection = 0;

  const isOverviewEnabled = () => !isEmbedMode && (active || isMobileLayout());
  const isDirectoryVisible = () => active || (isOverviewEnabled() && isOverviewOpen());
  const scheduleRender = () => {
    if (disposed || !isDirectoryVisible() || frame) return;
    frame = windowObject.requestAnimationFrame(() => {
      frame = 0;
      if (disposed || !isDirectoryVisible()) return;
      if (active) {
        const currentGroups = groups();
        reorder?.validate(currentGroups);
        if (reorder?.isDragging()) return;
        if (!view.isCollapsed()) view.render(currentGroups, getActiveTabId(), collapsedGroups);
        if (isRenaming() && !view.getRenameAnchor(getActiveName(), getActiveTabId())) cancelInlineRename();
        positionInlineRename();
      }
      scheduleOverviewRender();
    });
  };
  const directory = createDesktopWorkspaceDirectory({
    windowObject, getInstances, loadInstances, getActiveName, getActiveGeneration, getActiveTabId, getOrderedTabs,
    isVisible: isDirectoryVisible,
    isViewingTerminal: () => active && !pendingSelection && !isOverviewOpen(),
    onChange: () => {
      scheduleRender();
      onNotificationsChange();
    },
    releasePreview,
  });

  const select = async (selector, tabId = "", transaction = ++navigation, { focus = true } = {}) => {
    const group = directory.groups().find((item) => item.selector === selector);
    if (disposed || !group?.running) return false;
    directory.syncActiveNotifications();
    pendingSelection = transaction;
    try {
      closeMenus();
      if (selector !== getActiveName()) await switchTarget(selector);
      else if (!directory.isActiveReady()) await refreshActiveWorkspace(selector);
      if (disposed || navigation !== transaction || selector !== getActiveName()) return false;
      if (!directory.isActiveReady()) return false;
      if (tabId) {
        if (!getOrderedTabs().some((tab) => tab.id === tabId)) {
          showToast("该会话已关闭");
          return false;
        }
        activateTab(tabId, { focus });
      }
      scheduleRender();
      return true;
    } finally {
      if (pendingSelection === transaction) {
        pendingSelection = 0;
        if (!disposed && active) {
          directory.syncActiveNotifications();
          onNotificationsChange();
          scheduleRender();
        }
      }
    }
  };

  const create = async (selector) => {
    const transaction = ++navigation;
    let group = directory.groups().find((item) => item.selector === selector);
    if (!group?.running) return;
    const switching = selector !== getActiveName();
    if (switching && !group.loaded) {
      group = await directory.ensureLoaded(selector);
      if (navigation !== transaction) return;
      if (disposed || !isOverviewEnabled() || !group?.loaded) throw new Error(group?.error || "无法读取实例会话，请先打开该实例");
    }
    const empty = group.loaded && !group.tabs.length;
    collapsedGroups.delete(selector);
    if (!await select(selector, "", transaction)) return;
    // Entering an unused instance already creates its first shell through the
    // existing workspace entry point. Do not create a second shell for one click.
    if (!(switching && empty && getOrderedTabs().length === 1)) await createTab();
    if (disposed || navigation !== transaction || selector !== getActiveName()) return;
    closeOverview();
    scheduleRender();
  };
  const close = async (selector, tabId) => {
    if (await select(selector, tabId)) closeTab(tabId);
  };
  const beginRename = (tabId) => {
    if (!active || disposed || !directory.isActiveReady()) return false;
    reorder.cancel();
    if (view.isCollapsed()) {
      view.setCollapsed(false, { animate: false });
      directory.sync();
      onLayoutChange();
    }
    const selector = getActiveName();
    collapsedGroups.delete(selector);
    view.render(groups(), getActiveTabId(), collapsedGroups);
    view.revealSession(selector, tabId);
    return beginInlineRename(tabId);
  };
  const rename = async (selector, tabId) => {
    if (await select(selector, tabId, ++navigation, { focus: false })) beginRename(tabId);
  };
  const run = (task) => Promise.resolve().then(task).catch((error) => {
    if (!disposed) showToast(error.message || String(error));
  });

  const commitSessionOrder = async ({ selector, tabId, beforeId, order }) => {
    pendingSessionOrders.set(selector, order);
    committingSelectors.add(selector);
    let originalOrder = null;
    let generation = -1;
    try {
      if (!await select(selector, tabId, ++navigation, { focus: false })) return;
      generation = getActiveGeneration();
      originalOrder = getOrderedTabs().map((tab) => tab.id);
      if (!originalOrder.includes(tabId) || (beforeId && !originalOrder.includes(beforeId))) return;
      previewTabOrder(order);
      await reorderTab(tabId, beforeId);
    } catch (error) {
      pendingSessionOrders.delete(selector);
      if (selector === getActiveName() && generation === getActiveGeneration()) {
        if (originalOrder) previewTabOrder(originalOrder);
        scheduleRender();
        try { await refreshActiveWorkspace(selector); } catch {}
      }
      throw error;
    } finally {
      pendingSessionOrders.delete(selector);
      committingSelectors.delete(selector);
      scheduleRender();
    }
  };

  reorder = createDesktopWorkspaceReorderController({
    documentObject, windowObject, list: view.list, isRenaming,
    canDrag: ({ kind, selector }) => active && !disposed && !committingSelectors.has(selector)
      && (kind === "instance" || groups().find((group) => group.selector === selector)?.canReorder === true),
    onStart: ({ kind, selector, tabId }) => {
      closeMenus();
      if (kind === "session" && selector === getActiveName()) activateTab(tabId, { focus: false });
    },
    async onDrop({ kind, selector, tabId, beforeId, order }) {
      if (kind === "instance") {
        instanceOrder = [...order, ...instanceOrder.filter((id) => !order.includes(id))];
        try { storage?.setItem(instanceOrderKey, JSON.stringify(instanceOrder)); } catch {}
        scheduleRender();
        return;
      }
      await commitSessionOrder({ selector, tabId, beforeId, order });
    },
    onFinish: scheduleRender,
    onError: (error) => { if (!disposed) showToast(error.message || "会话排序失败。"); },
  });

  const showSessionMenu = (event, row) => {
    event.preventDefault();
    event.stopPropagation();
    const selector = row.closest("[data-selector]").dataset.selector;
    const tabId = row.dataset.tabId;
    const point = { clientX: event.clientX, clientY: event.clientY };
    run(async () => {
      if (await select(selector, tabId, ++navigation, { focus: false })) openContextMenu(point, tabId);
    });
  };

  const sidebarResize = createDesktopSidebarResizeController({
    documentObject, windowObject, sidebar: view.sidebar, handle: view.resizeHandle,
    storage, storageKey: `${storagePrefix}.desktopSidebarWidth`,
    isEnabled: () => active && !disposed && !view.isCollapsed(),
    onStart: () => {
      reorder.cancel();
      cancelInlineRename();
      closeMenus();
      return onResizeStart();
    },
    onResize,
    onEnd: (context) => { onResizeEnd(context); positionInlineRename(); },
    onLayoutChange,
  });

  const onClick = (event) => {
    const button = event.target.closest("[data-desktop-action]");
    if (!button) return;
    const action = button.dataset.desktopAction;
    const selector = button.closest("[data-selector]")?.dataset.selector;
    const tabId = button.closest("[data-tab-id]")?.dataset.tabId;
    if (action === "collapse" || action === "expand") {
      sidebarResize.finish();
      reorder.cancel();
      cancelInlineRename();
      closeMenus();
      view.setCollapsed(action === "collapse");
      (action === "collapse" ? view.expand : view.sidebar.querySelector("button"))?.focus({ preventScroll: true });
      directory.sync();
      onLayoutChange();
    } else if (action === "toggle") {
      if (collapsedGroups.has(selector)) collapsedGroups.delete(selector);
      else collapsedGroups.add(selector);
      scheduleRender();
    } else if (action === "create") run(() => create(selector));
    else if (action === "select" || action === "instance") run(() => select(selector, tabId));
    else if (action === "close") run(() => close(selector, tabId));
    else if (action === "retry") directory.retry(selector);
  };
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };

  return Object.freeze({
    isActive: () => active,
    isOverviewEnabled,
    getOverviewTabs: (selector) => groups().find((group) => group.selector === selector)?.tabs || [],
    canReorderOverviewTabs(selector) {
      const group = groups().find((item) => item.selector === selector);
      return !disposed && isOverviewEnabled() && !committingSelectors.has(selector)
        && group?.running === true && group.canReorder;
    },
    async reorderOverviewTab(selector, tabId, beforeId) {
      if (!this.canReorderOverviewTabs(selector)) return;
      const tabs = this.getOverviewTabs(selector);
      if (!tabs.some((tab) => tab.id === tabId) || beforeId === tabId) return;
      const order = tabs.map((tab) => tab.id).filter((id) => id !== tabId);
      const index = beforeId ? order.indexOf(beforeId) : order.length;
      if (index < 0) return;
      order.splice(index, 0, tabId);
      await commitSessionOrder({ selector, tabId, beforeId, order });
    },
    finishResize: () => sidebarResize.finish(),
    beginRename,
    getRenameAnchor: (tabId) => view.getRenameAnchor(getActiveName(), tabId),
    scrollSessionIntoView(tabId) {
      if (!active || disposed || !tabId || view.isCollapsed() || reorder.isDragging()) return;
      const selector = getActiveName();
      collapsedGroups.delete(selector);
      view.render(groups(), getActiveTabId(), collapsedGroups);
      view.revealSession(selector, tabId);
    },
    scheduleRender,
    hasNotifications: () => active && directory.hasNotifications(),
    syncNotifications() {
      if (active) directory.syncActiveNotifications();
    },
    clearNotification(tabId) {
      if (active) directory.clearNotification(tabId);
    },
    updatePaneActivity(session, state) {
      if (active) directory.updateActivePane(session, state);
    },
    markSessionOutput(session, data) {
      if (active) directory.markSessionOutput(session, data);
    },
    handleTargetChange(previousName) {
      if (!isDirectoryVisible()) return;
      sidebarResize.finish();
      directory.syncActiveNotifications(previousName, { leaving: true });
      directory.sync();
    },
    acceptState(state, selector = state?.selector) {
      directory.accept(selector, state, { active: true });
    },
    refresh: () => directory.refresh(),
    handleInstancesChange() {
      scheduleRender();
      directory.refresh();
    },
    handleOverviewVisibility(open) {
      if (!open && active) directory.syncActiveNotifications();
      directory.sync();
      if (open && active) overviewView.animateEntrance();
    },
    renderOverview(overview, paneSource) {
      if (!isOverviewEnabled()) return false;
      overviewView.render({ view: overview, groups: groups(), activeTabId: getActiveTabId(), paneSource,
        mobileLayout: isMobileLayout() });
      return true;
    },
    select,
    create,
    close,
    syncMode() {
      if (disposed) return;
      const next = !isEmbedMode && !isMobileLayout() && !isLegacyLayout();
      if (next !== active) {
        sidebarResize.finish();
        reorder.cancel();
        cancelInlineRename();
        navigation += 1;
        pendingSelection = 0;
        closeMenus();
        closeOverview();
        active = next;
        sidebarResize.sync({ notify: false });
        view.setActive(active);
        onLayoutChange();
      }
      directory.sync();
      scheduleRender();
    },
    start() {
      if (started || disposed) return;
      started = true;
      reorder.start();
      listen(view.sidebar, "click", onClick);
      listen(view.expand, "click", onClick);
      listen(view.list, "dblclick", (event) => {
        const row = event.target.closest(".desktop-workspace-session");
        if (event.target.closest("[data-desktop-action='select']") && row) {
          run(() => rename(row.closest("[data-selector]").dataset.selector, row.dataset.tabId));
        }
      });
      listen(view.list, "contextmenu", (event) => {
        const row = event.target.closest(".desktop-workspace-session");
        if (row) showSessionMenu(event, row);
      });
      listen(view.list, "auxclick", (event) => {
        const row = event.target.closest(".desktop-workspace-session");
        if (event.button === 1 && row) {
          event.preventDefault();
          run(() => close(row.closest("[data-selector]").dataset.selector, row.dataset.tabId));
        }
      });
      listen(windowObject, "storage", (event) => {
        if (event.key !== instanceOrderKey) return;
        reorder.cancel();
        instanceOrder = readOrder(event.newValue);
        scheduleRender();
      });
      listen(documentObject, "visibilitychange", () => {
        if (active) directory.syncActiveNotifications();
        directory.sync();
      });
      listen(windowObject, "online", () => directory.sync());
      listen(view.list, "keydown", (event) => {
        const row = event.target.closest(".desktop-workspace-session");
        if (event.key === "F2" && !event.ctrlKey && !event.altKey && !event.metaKey && row) {
          event.preventDefault();
          event.stopPropagation();
          run(() => rename(row.closest("[data-selector]").dataset.selector, row.dataset.tabId));
        } else if ((event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) && row) {
          const rect = row.getBoundingClientRect();
          showSessionMenu({ preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation(),
            clientX: rect.left + 20, clientY: rect.bottom }, row);
        }
      });
      this.syncMode();
    },
    dispose() {
      if (disposed) return;
      sidebarResize.dispose();
      disposed = true;
      navigation += 1;
      if (frame) windowObject.cancelAnimationFrame(frame);
      for (const remove of listeners) remove();
      reorder.dispose();
      cancelInlineRename();
      directory.dispose();
      overviewView.clear();
      view.dispose();
    },
  });
}
