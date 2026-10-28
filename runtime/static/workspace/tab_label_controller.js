import { createWorkspaceTabLabelLifecycle } from "./tab_label_lifecycle.js";

/**
 * Owns tab label presentation and desktop inline rename transactions.
 * Workspace state, tab registry and persistence remain supplied by callers.
 */
export function createWorkspaceTabLabelController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  tabsElement = null,
  getTabs = () => new Map(),
  getActiveTabId = () => "",
  getRenameAnchor = () => null,
  isMobileLayout = () => false,
  isApplyingWorkspaceState = () => false,
  closeContextMenu = () => {},
  activateTab = () => {},
  postWorkspaceAction = () => Promise.resolve(),
  updateDocumentTitle = () => {},
  scheduleOverviewRender = () => {},
  showToast = () => {},
  AbortControllerCtor = globalThis.AbortController,
} = {}) {
  const lifecycle = createWorkspaceTabLabelLifecycle({ windowObject, AbortControllerCtor });
  let disposed = false;
  let inlineRenameState = null;

  const getTab = (tabID) => getTabs()?.get?.(tabID) || null;

  const renderTabLabel = (tab) => {
    if (disposed || !tab) {
      return false;
    }
    const label = tab.button?.querySelector?.(".tab-label");
    if (label) {
      label.textContent = tab.label;
      tab.button.title = tab.label;
    }
    if (tab.id === getActiveTabId()) {
      updateDocumentTitle();
    }
    scheduleOverviewRender();
    return true;
  };

  const applyTabRenameLocally = (tab, label) => {
    if (disposed || !tab) {
      return false;
    }
    tab.label = label;
    tab.customLabel = true;
    renderTabLabel(tab);
    return true;
  };

  const commitTabRename = async (tabID, label, { optimistic = false, force = false } = {}) => {
    if (disposed) {
      return false;
    }
    const tab = getTab(tabID);
    if (!tab) {
      return false;
    }
    const normalized = String(label || "").trim();
    if (!normalized || (!force && normalized === tab.label)) {
      return false;
    }
    if (!isApplyingWorkspaceState()) {
      const previousLabel = tab.label;
      const previousCustomLabel = tab.customLabel;
      if (optimistic) {
        applyTabRenameLocally(tab, normalized);
      }
      try {
        await postWorkspaceAction(
          "rename_tab",
          { tab_id: tabID, label: normalized },
          optimistic ? { focus: false, preferStateActiveTab: false } : {},
        );
      } catch (error) {
        const current = getTab(tabID);
        if (optimistic && current === tab && tab.label === normalized) {
          tab.label = previousLabel;
          tab.customLabel = previousCustomLabel;
          renderTabLabel(tab);
        }
        throw error;
      }
      return true;
    }
    applyTabRenameLocally(tab, normalized);
    return true;
  };

  const positionInlineTabRenameInput = () => {
    const state = inlineRenameState;
    if (disposed || !state?.input) {
      return false;
    }
    const tab = getTab(state.tabId);
    const anchor = getRenameAnchor(tab);
    const button = anchor?.button || tab?.button;
    const label = anchor?.label || button?.querySelector?.(".tab-label");
    const viewport = anchor?.viewport || tabsElement;
    if (!button?.isConnected || !label || !viewport) {
      state.input.hidden = true;
      return false;
    }
    const buttonRect = button.getBoundingClientRect();
    const tabsRect = viewport.getBoundingClientRect();
    const left = Math.max(anchor ? label.getBoundingClientRect().left : buttonRect.left + 30, tabsRect.left + 6);
    const right = Math.min(buttonRect.right - (anchor ? 2 : 30), tabsRect.right - 6);
    if (right <= left || buttonRect.bottom <= tabsRect.top || buttonRect.top >= tabsRect.bottom) {
      state.input.hidden = true;
      return false;
    }
    const width = Math.max(48, right - left);
    const height = Math.min(26, Math.max(22, buttonRect.height - 10));
    state.input.hidden = false;
    state.input.style.left = `${left}px`;
    state.input.style.top = `${buttonRect.top + (buttonRect.height - height) / 2}px`;
    state.input.style.width = `${width}px`;
    state.input.style.height = `${height}px`;
    return true;
  };

  const finishInlineTabRename = ({ commit = true, restoreFocus = false } = {}) => {
    const state = inlineRenameState;
    if (!state || state.finishing) {
      return Promise.resolve(false);
    }
    state.finishing = true;
    inlineRenameState = null;
    lifecycle.abortController(state.controller);
    const tab = getTab(state.tabId);
    const nextLabel = String(state.input.value || "").trim();
    tab?.button?.classList?.remove?.("renaming");
    state.anchorButton?.classList.remove("renaming");
    state.input.remove?.();
    if (restoreFocus) {
      (state.anchorButton || tab?.button)?.focus?.({ preventScroll: true });
    }
    if (!commit || !state.dirty || !nextLabel) {
      return Promise.resolve(false);
    }
    return commitTabRename(state.tabId, nextLabel, { optimistic: true });
  };

  const beginInlineTabRename = (tabID) => {
    if (disposed || isMobileLayout()) {
      return false;
    }
    const tab = getTab(tabID);
    if (!tab?.button) {
      return false;
    }
    if (inlineRenameState?.tabId === tabID) {
      inlineRenameState.input.focus?.();
      inlineRenameState.input.select?.();
      return true;
    }
    finishInlineTabRename({ commit: true }).catch((error) => showToast(error?.message || String(error)));
    closeContextMenu();
    activateTab(tabID, { focus: false });

    const input = documentObject?.createElement?.("input");
    const controller = lifecycle.createController();
    if (!input || !controller) {
      return false;
    }
    input.className = "tab-rename-input";
    input.type = "text";
    input.value = tab.label;
    input.autocomplete = "off";
    input.spellcheck = false;
    const anchor = getRenameAnchor(tab);
    input.setAttribute("aria-label", anchor ? "重命名会话" : "重命名标签");

    const state = { tabId: tabID, input, controller, anchorButton: anchor?.button, dirty: false, finishing: false };
    inlineRenameState = state;
    tab.button.classList.add("renaming");
    state.anchorButton?.classList.add("renaming");
    state.anchorButton?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    documentObject?.body?.appendChild?.(input);
    positionInlineTabRenameInput();

    input.addEventListener("input", () => { state.dirty = true; }, { signal: controller.signal });
    input.addEventListener("pointerdown", (event) => event.stopPropagation(), { signal: controller.signal });
    input.addEventListener("click", (event) => event.stopPropagation(), { signal: controller.signal });
    input.addEventListener("dblclick", (event) => event.stopPropagation(), { signal: controller.signal });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.key === "Process" || Number(event.keyCode || 0) === 229) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finishInlineTabRename({ commit: true, restoreFocus: true }).catch((error) => showToast(error?.message || String(error)));
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finishInlineTabRename({ commit: false, restoreFocus: true }).catch((error) => showToast(error?.message || String(error)));
      }
    }, { signal: controller.signal });
    input.addEventListener("blur", () => {
      finishInlineTabRename({ commit: true }).catch((error) => showToast(error?.message || String(error)));
    }, { signal: controller.signal });
    tabsElement?.addEventListener?.("scroll", positionInlineTabRenameInput, { passive: true, signal: controller.signal });
    if (anchor?.viewport && anchor.viewport !== tabsElement) {
      anchor.viewport.addEventListener("scroll", positionInlineTabRenameInput, { passive: true, signal: controller.signal });
    }
    windowObject?.addEventListener?.("resize", positionInlineTabRenameInput, { signal: controller.signal });
    lifecycle.scheduleFrame(() => {
      positionInlineTabRenameInput();
      input.focus?.();
      input.select?.();
    });
    return true;
  };

  const isRenaming = (tabID = "") => Boolean(inlineRenameState && (!tabID || inlineRenameState.tabId === tabID));

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    if (inlineRenameState) {
      const state = inlineRenameState;
      inlineRenameState = null;
      lifecycle.abortController(state.controller);
      state.input.remove?.();
      getTab(state.tabId)?.button?.classList?.remove?.("renaming");
      state.anchorButton?.classList.remove("renaming");
    }
    lifecycle.dispose();
    return true;
  };

  return Object.freeze({
    applyTabRenameLocally,
    beginInlineTabRename,
    commitTabRename,
    dispose,
    finishInlineTabRename,
    isDisposed: () => disposed,
    isRenaming,
    positionInlineTabRenameInput,
    renderTabLabel,
  });
}
