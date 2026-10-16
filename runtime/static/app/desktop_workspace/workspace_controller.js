import { createDesktopWorkspaceDirectory } from "./directory_controller.js";
import { createDesktopWorkspaceView } from "./workspace_view.js";
import { createDesktopOverviewView } from "./overview_view.js";

export function createDesktopWorkspaceController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  isMobileLayout = () => false,
  isEmbedMode = false,
  isLegacyLayout = () => false,
  getInstances = () => [],
  loadInstances = async () => {},
  getActiveName = () => "",
  getActiveTabId = () => "",
  getOrderedTabs = () => [],
  switchTarget = async () => {},
  activateTab = () => {},
  createTab = async () => {},
  closeTab = () => {},
  renameTab = async () => {},
  closeMenus = () => {},
  closeOverview = () => {},
  isOverviewOpen = () => false,
  scheduleOverviewRender = () => {},
  releasePreview = () => {},
  onLayoutChange = () => {},
  showToast = () => {},
} = {}) {
  const view = createDesktopWorkspaceView({ documentObject, windowObject });
  const overviewView = createDesktopOverviewView({ documentObject });
  const collapsedGroups = new Set();
  const listeners = [];
  let active = false;
  let started = false;
  let disposed = false;
  let frame = 0;
  let navigation = 0;

  const scheduleRender = () => {
    if (disposed || !active || frame) return;
    frame = windowObject.requestAnimationFrame(() => {
      frame = 0;
      if (disposed || !active) return;
      if (!view.isCollapsed()) view.render(directory.groups(), getActiveTabId(), collapsedGroups);
      scheduleOverviewRender();
    });
  };
  const directory = createDesktopWorkspaceDirectory({
    windowObject, getInstances, loadInstances, getActiveName, getOrderedTabs,
    isVisible: () => active && (!view.isCollapsed() || isOverviewOpen()),
    onChange: scheduleRender,
    releasePreview,
  });

  const select = async (selector, tabId = "", transaction = ++navigation) => {
    const group = directory.groups().find((item) => item.selector === selector);
    if (disposed || !group?.running) return false;
    closeMenus();
    if (selector !== getActiveName()) await switchTarget(selector);
    if (disposed || navigation !== transaction || selector !== getActiveName()) return false;
    if (tabId) {
      if (!getOrderedTabs().some((tab) => tab.id === tabId)) {
        showToast("该会话已关闭");
        return false;
      }
      activateTab(tabId);
    }
    scheduleRender();
    return true;
  };

  const create = async (selector) => {
    const transaction = ++navigation;
    let group = directory.groups().find((item) => item.selector === selector);
    if (!group?.running) return;
    const switching = selector !== getActiveName();
    if (switching && !group.loaded) {
      group = await directory.ensureLoaded(selector);
      if (navigation !== transaction) return;
      if (disposed || !active || !group?.loaded) throw new Error(group?.error || "无法读取实例会话，请先打开该实例");
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
  const rename = async (selector, tabId) => {
    if (await select(selector, tabId)) await renameTab(tabId);
  };
  const run = (task) => Promise.resolve().then(task).catch((error) => {
    if (!disposed) showToast(error.message || String(error));
  });

  const onClick = (event) => {
    const button = event.target.closest("[data-desktop-action]");
    if (!button) return;
    const action = button.dataset.desktopAction;
    const selector = button.closest("[data-selector]")?.dataset.selector;
    const tabId = button.closest("[data-tab-id]")?.dataset.tabId;
    if (action === "collapse" || action === "expand") {
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
    else if (action === "retry") directory.refresh();
  };
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };

  return Object.freeze({
    isActive: () => active,
    scheduleRender,
    acceptState(state, selector = state?.selector) {
      directory.accept(selector, state);
    },
    refresh: () => directory.refresh(),
    handleInstancesChange() {
      scheduleRender();
      directory.refresh();
    },
    handleOverviewVisibility(open) {
      directory.sync();
      if (open && active) overviewView.animateEntrance();
    },
    renderOverview(overview, paneSource) {
      if (!active) return false;
      overviewView.render({ view: overview, groups: directory.groups(), activeTabId: getActiveTabId(), paneSource });
      return true;
    },
    select,
    create,
    close,
    syncMode() {
      if (disposed) return;
      const next = !isEmbedMode && !isMobileLayout() && !isLegacyLayout();
      if (next !== active) {
        navigation += 1;
        closeMenus();
        closeOverview();
        active = next;
        view.setActive(active);
        directory.sync();
        onLayoutChange();
      }
      scheduleRender();
    },
    start() {
      if (started || disposed) return;
      started = true;
      listen(view.sidebar, "click", onClick);
      listen(view.expand, "click", onClick);
      listen(view.list, "dblclick", (event) => {
        const row = event.target.closest(".desktop-workspace-session");
        if (event.target.closest("[data-desktop-action='select']") && row) {
          run(() => rename(row.closest("[data-selector]").dataset.selector, row.dataset.tabId));
        }
      });
      listen(documentObject, "visibilitychange", () => directory.sync());
      listen(view.list, "keydown", (event) => {
        const row = event.target.closest(".desktop-workspace-session");
        if (event.key === "F2" && row) {
          event.preventDefault();
          run(() => rename(row.closest("[data-selector]").dataset.selector, row.dataset.tabId));
        }
      });
      this.syncMode();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      navigation += 1;
      if (frame) windowObject.cancelAnimationFrame(frame);
      for (const remove of listeners) remove();
      directory.dispose();
      overviewView.clear();
      view.dispose();
    },
  });
}
