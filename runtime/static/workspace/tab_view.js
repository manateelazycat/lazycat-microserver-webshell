import { createWorkspaceTabLifecycle } from "./tab_lifecycle.js";

export function createWorkspaceTabView({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  tabsElement = null,
  terminalArea = null,
  isRenaming = () => false,
  positionInlineRename = () => {},
  closeTab = () => {},
  activateTab = () => {},
  beginInlineRename = () => {},
  bindContextMenu = () => null,
  renderTabLabel = () => {},
  lifecycleFactory = createWorkspaceTabLifecycle,
} = {}) {
  const lifecycle = lifecycleFactory({ windowObject });
  let disposed = false;

  const createTabElements = (tabId) => {
    if (disposed) {
      return null;
    }
    const paneElement = documentObject.createElement("article");
    const layoutHost = documentObject.createElement("div");
    paneElement.className = "terminal-pane";
    paneElement.dataset.tabId = tabId;
    layoutHost.className = "terminal-layout";
    paneElement.appendChild(layoutHost);
    terminalArea?.appendChild(paneElement);
    return { paneElement, layoutHost };
  };

  const createTabButton = (tab) => {
    if (disposed || !tab) {
      return null;
    }
    lifecycle.registerTab(tab);
    lifecycle.replaceContextCleanup(tab, null);
    const button = documentObject.createElement("button");
    button.type = "button";
    button.className = "tab";
    if (isRenaming(tab.id)) {
      button.classList.add("renaming");
      lifecycle.scheduleFrame(() => positionInlineRename());
    }
    button.dataset.tabId = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.setAttribute("tabindex", "-1");
    button.innerHTML = `
      <span class="tab-content">
        <span class="tab-label"></span>
        <small class="tab-network-metrics" hidden></small>
        <span class="tab-close" aria-hidden="true">x</span>
      </span>
    `;
    button.addEventListener("click", (event) => {
      if (event.target.closest(".tab-close")) {
        closeTab(tab.id);
        return;
      }
      activateTab(tab.id);
    });
    button.addEventListener("dblclick", (event) => {
      if (event.target.closest(".tab-close")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      beginInlineRename(tab.id);
    });
    const contextCleanup = bindContextMenu(button, {
      activate: () => activateTab(tab.id, { focus: false }),
      getTarget: () => ({
        type: "tab",
        tabId: tab.id,
        paneId: tab.activePaneId,
      }),
    });
    lifecycle.replaceContextCleanup(tab, contextCleanup);
    tab.button = button;
    renderTabLabel(tab);
    tabsElement?.appendChild(button);
    return button;
  };

  const recreateTabButton = (tab) => {
    tab?.button?.remove?.();
    return createTabButton(tab);
  };

  const moveTabButton = (tab, position, orderedTabs) => {
    const index = orderedTabs.findIndex((item) => item.id === tab?.id);
    if (!tab || index < 0) {
      return false;
    }
    let target = index;
    if (position === "first") {
      target = 0;
    } else if (position === "left") {
      target = Math.max(0, index - 1);
    } else if (position === "right") {
      target = Math.min(orderedTabs.length - 1, index + 1);
    } else if (position === "last") {
      target = orderedTabs.length - 1;
    }
    if (target === index) {
      return false;
    }
    const reference = tabsElement?.children?.[target];
    tab.button?.remove?.();
    if (position === "right" || position === "last") {
      tabsElement?.insertBefore?.(tab.button, reference?.nextSibling || null);
    } else {
      tabsElement?.insertBefore?.(tab.button, reference || tabsElement?.firstChild || null);
    }
    return true;
  };

  const clearTabButtons = () => {
    if (tabsElement) {
      tabsElement.textContent = "";
    }
  };

  const syncTabButtonOrder = (orderedTabs) => {
    if (disposed || !tabsElement) return false;
    let reference = tabsElement.firstElementChild;
    for (const tab of orderedTabs || []) {
      if (!tab?.button) continue;
      if (tab.button === reference) reference = reference.nextElementSibling;
      else tabsElement.insertBefore(tab.button, reference);
    }
    return true;
  };

  const setActiveTabVisuals = (items, activeTabId) => {
    if (disposed) {
      return false;
    }
    for (const tab of new Set(items || [])) {
      if (!tab) {
        continue;
      }
      const isActive = tab.id === activeTabId;
      tab.paneEl?.classList.toggle("active", isActive);
      tab.button?.classList.toggle("active", isActive);
      tab.button?.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.button?.setAttribute("tabindex", isActive ? "0" : "-1");
    }
    return true;
  };

  const disposeTab = (tab) => lifecycle.disposeTab(tab);

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    lifecycle.dispose();
    return true;
  };

  return Object.freeze({
    clearTabButtons,
    createTabButton,
    createTabElements,
    dispose,
    disposeTab,
    isDisposed: () => disposed,
    moveTabButton,
    recreateTabButton,
    setActiveTabVisuals,
    syncTabButtonOrder,
  });
}
