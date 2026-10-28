export const workspacePathBasenameLabel = (path) => {
  const raw = String(path || "").trim();
  if (!raw) {
    return "";
  }
  if (raw === "/") {
    return "ROOT";
  }
  const trimmed = raw.replace(/\/+$/g, "");
  if (!trimmed || trimmed === "/") {
    return "ROOT";
  }
  const parts = trimmed.split("/").filter(Boolean);
  return parts.pop() || "";
};

export function createWorkspacePresentationController({
  documentObject = globalThis.document,
  mobileActiveTabTitle = null,
  emptyState = null,
  mobileKeyboardFocusPrompt = "双击屏幕开启键盘输入",
  getTabs = () => new Map(),
  getActiveTabId = () => "",
  getCurrentTab = () => null,
  hasExternalNotifications = () => false,
  getMobileDoubleTapReminderEnabled = () => false,
  requiresTouchKeyboardDoubleTap = () => false,
  isApplyingWorkspaceState = () => false,
  renderTabLabel = () => false,
} = {}) {
  let workspacePending = true;
  const tabsMap = () => {
    const value = getTabs();
    return value instanceof Map ? value : new Map();
  };

  const activeSession = () => {
    const tab = getCurrentTab();
    return tab?.panes?.get(tab.activePaneId) || null;
  };

  const activePaneDirectoryLabel = () => workspacePathBasenameLabel(activeSession()?.cwd);

  const shouldShowMobileKeyboardFocusPrompt = () => {
    if (!getMobileDoubleTapReminderEnabled() || !requiresTouchKeyboardDoubleTap()) {
      return false;
    }
    const textarea = activeSession()?.term?.textarea;
    return Boolean(textarea && documentObject?.activeElement !== textarea);
  };

  const updateMobileActiveTabTitle = () => {
    if (!mobileActiveTabTitle) {
      return "";
    }
    const tab = getCurrentTab();
    const label = shouldShowMobileKeyboardFocusPrompt()
      ? mobileKeyboardFocusPrompt
      : activePaneDirectoryLabel() || String(tab?.label || "终端").trim() || "终端";
    mobileActiveTabTitle.textContent = label;
    mobileActiveTabTitle.title = label;
    return label;
  };

  const resolvePaneAutoLabel = (pane) => {
    const pathLabel = workspacePathBasenameLabel(pane?.cwd);
    if (pathLabel) {
      return pathLabel;
    }
    const titleLabel = String(pane?.title || "").trim();
    if (titleLabel) {
      return titleLabel;
    }
    return String(pane?.command || "").trim();
  };

  const refreshTabAutoLabel = (tab) => {
    if (!tab || tab.customLabel) {
      return false;
    }
    const pane = tab.panes?.get(tab.activePaneId) || Array.from(tab.panes?.values?.() || [])[0] || null;
    const nextLabel = resolvePaneAutoLabel(pane);
    if (!nextLabel || nextLabel === tab.label) {
      return false;
    }
    tab.label = nextLabel;
    renderTabLabel(tab);
    return true;
  };

  const updateDocumentTitle = () => {
    const tab = getCurrentTab();
    const title = tab?.label || "WebShell";
    const hasNotification = hasExternalNotifications() || Array.from(tabsMap().values()).some((item) => item.hasNotification);
    if (documentObject) {
      documentObject.title = `${hasNotification ? "* " : ""}${title} - LightOS WebShell`;
    }
    updateMobileActiveTabTitle();
    return title;
  };

  const markTabNotification = (tabId) => {
    const tab = tabsMap().get(tabId);
    if (!tab || tab.id === getActiveTabId()) {
      return false;
    }
    tab.hasNotification = true;
    tab.button?.classList?.add?.("has-notification");
    updateDocumentTitle();
    return true;
  };

  const clearTabNotification = (tab) => {
    if (!tab) {
      return false;
    }
    tab.hasNotification = false;
    tab.button?.classList?.remove?.("has-notification");
    updateDocumentTitle();
    return true;
  };

  const markSessionUserInput = (session) => {
    if (session) {
      session.hasUserInputSinceFocus = true;
    }
  };

  const markSessionTitleNotification = (session) => {
    if (!session?.hasUserInputSinceFocus || session.tabId === getActiveTabId()) {
      return false;
    }
    return markTabNotification(session.tabId);
  };

  const markSessionActivityNotification = (session, wasBusy, isBusy) => {
    if (!session?.hasUserInputSinceFocus || session.tabId === getActiveTabId() || wasBusy || !isBusy) {
      return false;
    }
    session.notifyWhenIdle = true;
    return true;
  };

  const markSessionIdleNotification = (session, wasBusy, isBusy) => {
    if (!session?.notifyWhenIdle || session.tabId === getActiveTabId() || !wasBusy || isBusy) {
      return false;
    }
    session.notifyWhenIdle = false;
    return markTabNotification(session.tabId);
  };

  const resetSessionUserInput = (session) => {
    if (!session) {
      return;
    }
    session.hasUserInputSinceFocus = false;
    session.notifyWhenIdle = false;
  };

  const syncCursorBlinkState = () => {
    for (const tab of tabsMap().values()) {
      const tabIsActive = tab.id === getActiveTabId();
      for (const pane of tab.panes?.values?.() || []) {
        const shouldBlink = tabIsActive && pane.id === tab.activePaneId;
        if (pane.term?.options && pane.term.options.cursorBlink !== shouldBlink) {
          pane.term.options.cursorBlink = shouldBlink;
        }
      }
    }
  };

  const updateEmptyState = () => {
    if (!emptyState) {
      return false;
    }
    const empty = !workspacePending && !isApplyingWorkspaceState() && tabsMap().size === 0;
    emptyState.hidden = !empty;
    if (empty) {
      updateMobileActiveTabTitle();
    }
    return empty;
  };

  return Object.freeze({
    beginWorkspaceLoad() {
      workspacePending = true;
      updateEmptyState();
    },
    markWorkspaceReady() {
      workspacePending = false;
      updateEmptyState();
    },
    clearTabNotification,
    markSessionActivityNotification,
    markSessionIdleNotification,
    markSessionTitleNotification,
    markSessionUserInput,
    refreshTabAutoLabel,
    resetSessionUserInput,
    resolvePaneAutoLabel,
    syncCursorBlinkState,
    updateDocumentTitle,
    updateEmptyState,
    updateMobileActiveTabTitle,
  });
}
