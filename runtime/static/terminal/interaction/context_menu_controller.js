import { createTerminalInteractionLifecycle } from "./interaction_lifecycle.js";
import { createTerminalContextMenuView } from "./context_menu_view.js";

const contextPaneActions = new Set([
  "copy",
  "paste",
  "select-all",
  "search",
  "capture-long-screenshot",
  "split-vertical",
  "split-horizontal",
  "move-pane-new-tab",
  "close-pane",
]);
const contextTabActions = new Set([
  "rename-tab",
  "move-tab-first",
  "move-tab-left",
  "move-tab-right",
  "move-tab-last",
  "close-other-tabs",
  "close-tab",
]);
const contextLinkActions = new Set(["open-link", "copy-link"]);
const touchContextMenuSuppressWindowMs = 1400;
const touchContextMenuSuppressDistancePx = 32;

export function createTerminalContextMenuController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  view = null,
  lifecycleFactory = createTerminalInteractionLifecycle,
  getTabById = () => null,
  getOrderedTabs = () => [],
  getCurrentTab = () => null,
  getActiveSession = () => null,
  getSelectionText = (session) => session?.term?.getSelection?.() || "",
  isFullBufferSelection = () => false,
  findFirstURLInText = () => "",
  hasSelection = (session) => Boolean(session?.term?.hasSelection?.()),
  isMobileLayout = () => false,
  isTouchShortcutLayout = () => false,
  isTouchSelectionLayout = () => false,
  createIcon = () => null,
  prepareMobileOpen = () => {},
  copySession = () => {},
  pasteSession = () => {},
  selectAllSession = () => {},
  openSearch = () => {},
  captureLongScreenshot = () => {},
  openLink = () => {},
  copyLink = () => {},
  renameTab = () => {},
  moveTab = () => {},
  closeOtherTabs = () => {},
  splitPane = () => {},
  movePaneToNewTab = () => {},
  closePane = () => {},
  closeTab = () => {},
  openTheme = () => {},
  focusSession = (session) => session?.term?.focus?.(),
  showToast = () => {},
} = {}) {
  const menuView = view || createTerminalContextMenuView({ documentObject, windowObject });
  let contextTarget = null;
  let contextGeneration = 0;
  let lastTerminalTouchContextMenuCandidate = null;
  let mobileActionSheetIgnoreClicksUntil = 0;
  let started = false;
  let disposed = false;

  const now = () => Number(windowObject?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now());
  const resolveTab = (target) => target?.tabId ? getTabById(target.tabId) : null;
  const resolvePane = (target) => {
    const tab = resolveTab(target);
    return target?.paneId ? tab?.panes?.get?.(target.paneId) || null : null;
  };
  const tabOrderIndex = (tabId) => Array.from(getOrderedTabs() || []).findIndex((tab) => tab.id === tabId);

  const reportActionError = (error) => {
    showToast(error?.message || String(error || "操作失败。"));
  };

  const runAction = (callback) => {
    try {
      const result = callback?.();
      if (result && typeof result.then === "function") {
        result.catch(reportActionError);
      }
      return result;
    } catch (error) {
      reportActionError(error);
      return null;
    }
  };

  const isContextActionEnabled = (action, target) => {
    if (!target) {
      return false;
    }
    const tab = resolveTab(target);
    const pane = resolvePane(target);
    if (contextPaneActions.has(action) && !pane) {
      return false;
    }
    if (contextTabActions.has(action) && !tab) {
      return false;
    }
    if (contextLinkActions.has(action) && !target.link) {
      return false;
    }
    switch (action) {
      case "copy":
        return hasSelection(pane);
      case "move-pane-new-tab":
        return Boolean(tab && pane && tab.panes.size > 1);
      case "close-other-tabs":
        return Boolean(tab && Array.from(getOrderedTabs() || []).length > 1);
      case "move-tab-first":
      case "move-tab-left":
        return tabOrderIndex(target.tabId) > 0;
      case "move-tab-right":
      case "move-tab-last": {
        const orderedTabs = Array.from(getOrderedTabs() || []);
        const index = orderedTabs.findIndex((item) => item.id === target.tabId);
        return index >= 0 && index < orderedTabs.length - 1;
      }
      default:
        return true;
    }
  };

  const isDesktopActionVisible = (action, target) => (
    !(action === "capture-long-screenshot" && !isTouchShortcutLayout())
    && (!contextPaneActions.has(action) || Boolean(target?.paneId))
    && (!contextTabActions.has(action) || Boolean(target?.tabId))
    && (!contextLinkActions.has(action) || Boolean(target?.link))
  );

  const buildMobileContextTarget = () => {
    const tab = getCurrentTab();
    const session = getActiveSession();
    const selectedText = isFullBufferSelection(session) ? "" : getSelectionText(session);
    return {
      type: "mobile",
      tabId: tab?.id || "",
      paneId: session?.id || "",
      link: findFirstURLInText(selectedText),
    };
  };

  const closeContextMenu = () => {
    contextGeneration += 1;
    menuView.closeDesktop();
    contextTarget = null;
  };

  const closeMobileActionSheet = () => {
    menuView.closeMobile();
    if (contextTarget?.type === "mobile") {
      contextTarget = null;
    }
  };

  const performContextAction = (action, target) => {
    const tab = resolveTab(target);
    const pane = resolvePane(target);
    switch (action) {
      case "copy":
        runAction(() => copySession(pane));
        break;
      case "paste": {
        if (!isMobileLayout()) {
          focusSession(pane);
        }
        let result;
        try {
          result = pasteSession(pane);
        } catch (error) {
          reportActionError(error);
          break;
        }
        Promise.resolve(result)
          .finally(() => {
            if (!isMobileLayout() && !pane?.closed) {
              focusSession(pane);
            }
          })
          .catch(reportActionError);
        break;
      }
      case "select-all":
        runAction(() => selectAllSession(pane));
        break;
      case "search":
        runAction(() => openSearch());
        break;
      case "capture-long-screenshot":
        runAction(() => captureLongScreenshot(pane));
        break;
      case "open-link":
        runAction(() => openLink(target.link));
        break;
      case "copy-link":
        runAction(() => copyLink(target.link));
        break;
      case "rename-tab":
        runAction(() => renameTab(target.tabId));
        break;
      case "move-tab-first":
        runAction(() => moveTab(target.tabId, "first"));
        break;
      case "move-tab-left":
        runAction(() => moveTab(target.tabId, "left"));
        break;
      case "move-tab-right":
        runAction(() => moveTab(target.tabId, "right"));
        break;
      case "move-tab-last":
        runAction(() => moveTab(target.tabId, "last"));
        break;
      case "close-other-tabs":
        runAction(() => closeOtherTabs(target.tabId));
        break;
      case "split-vertical":
        runAction(() => splitPane(target.tabId, target.paneId, "vertical"));
        break;
      case "split-horizontal":
        runAction(() => splitPane(target.tabId, target.paneId, "horizontal"));
        break;
      case "move-pane-new-tab":
        runAction(() => movePaneToNewTab(target.tabId, target.paneId));
        break;
      case "close-pane":
        runAction(() => closePane(target.tabId, target.paneId));
        break;
      case "close-tab":
        runAction(() => closeTab(target.tabId));
        break;
      case "theme":
        runAction(() => openTheme());
        break;
    }
  };

  const runContextAction = (action) => {
    const target = contextTarget;
    menuView.closeDesktop();
    contextTarget = null;
    if (target) {
      performContextAction(action, target);
    }
  };

  const renderMobileActionSheet = (target = buildMobileContextTarget()) => {
    if (disposed) {
      return false;
    }
    contextTarget = target;
    return menuView.renderMobile({
      isActionEnabled: (action) => isContextActionEnabled(action, target),
      createIcon,
    });
  };

  const openMobileActionSheet = () => {
    if (disposed || !menuView.canOpenMobile() || !isTouchShortcutLayout()) {
      return false;
    }
    mobileActionSheetIgnoreClicksUntil = now() + 350;
    prepareMobileOpen();
    closeContextMenu();
    renderMobileActionSheet();
    menuView.openMobile();
    return true;
  };

  const runMobileContextAction = (action) => {
    const target = contextTarget?.type === "mobile" ? contextTarget : buildMobileContextTarget();
    if (!isContextActionEnabled(action, target)) {
      return;
    }
    menuView.closeMobile();
    contextTarget = null;
    performContextAction(action, target);
  };

  const markTerminalTouchContextMenuCandidate = (touch) => {
    if (!touch) {
      return;
    }
    lastTerminalTouchContextMenuCandidate = {
      x: touch.clientX,
      y: touch.clientY,
      at: now(),
    };
  };

  const isRecentTerminalTouchContextMenu = (event) => {
    const pointerType = String(event?.pointerType || "");
    if (pointerType && pointerType !== "mouse") {
      return true;
    }
    if (event?.sourceCapabilities?.firesTouchEvents) {
      return true;
    }
    const candidate = lastTerminalTouchContextMenuCandidate;
    if (!candidate) {
      return false;
    }
    const elapsed = now() - candidate.at;
    if (elapsed < 0 || elapsed > touchContextMenuSuppressWindowMs) {
      return false;
    }
    return Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) <= touchContextMenuSuppressDistancePx;
  };

  const shouldSuppressTerminalContextMenu = (event) => (
    isMobileLayout() || (isTouchSelectionLayout() && isRecentTerminalTouchContextMenu(event))
  );

  const lifecycle = lifecycleFactory({
    documentObject,
    windowObject,
    elements: menuView.elements,
    handlers: {
      onDesktopAction: (event) => {
        const action = menuView.desktopActionFromTarget(event?.target);
        if (action) {
          runContextAction(action);
        }
      },
      onDocumentKeydown: (event) => {
        if (event?.key === "Escape") {
          closeContextMenu();
          closeMobileActionSheet();
        }
      },
      onDocumentPointerDown: (event) => {
        if (menuView.isDesktopOpen() && !menuView.containsDesktopTarget(event?.target)) {
          closeContextMenu();
        }
      },
      onMobileAction: (event) => {
        if (now() < mobileActionSheetIgnoreClicksUntil) {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          return;
        }
        const action = menuView.mobileActionFromTarget(event?.target);
        if (action) {
          runMobileContextAction(action);
        }
      },
      onMobileClose: () => closeMobileActionSheet(),
      onResize: () => {
        if (!isTouchShortcutLayout()) {
          closeMobileActionSheet();
        } else if (menuView.isMobileOpen()) {
          renderMobileActionSheet();
        }
      },
    },
  });

  return Object.freeze({
    bindPane(target, {
      tabId = "",
      paneId = "",
      getTarget = null,
      activate = () => {},
      findLink = () => "",
    } = {}) {
      if (disposed) {
        return () => {};
      }
      return lifecycle.bindPane(target, {
        onCapture(event) {
          if (!shouldSuppressTerminalContextMenu(event)) {
            return;
          }
          event.preventDefault?.();
          event.stopPropagation?.();
          activate();
          closeContextMenu();
        },
        onContextMenu(event) {
          event.preventDefault?.();
          activate();
          if (shouldSuppressTerminalContextMenu(event)) {
            closeContextMenu();
            return;
          }
          const generation = ++contextGeneration;
          const render = (target) => {
            if (disposed || generation !== contextGeneration || !target) return;
            contextTarget = target;
            menuView.renderDesktop({
              x: event.clientX,
              y: event.clientY,
              target,
              isActionVisible: (action) => isDesktopActionVisible(action, target),
            });
          };
          const fallback = {
              type: "pane",
              tabId,
              paneId,
              link: String(findLink(event) || ""),
          };
          // Basic pane actions remain available even while its worker is busy.
          render(fallback);
          if (typeof getTarget === "function") Promise.resolve(getTarget(event)).then(render).catch(() => {});
        },
      });
    },
    bindTab(target, { getTarget = () => null, activate = () => {} } = {}) {
      if (disposed) {
        return () => {};
      }
      return lifecycle.bindTab(target, (event) => {
        event.preventDefault?.();
        activate();
        if (isMobileLayout()) {
          closeContextMenu();
          return;
        }
        contextTarget = getTarget();
        if (!contextTarget) {
          closeContextMenu();
          return;
        }
        menuView.renderDesktop({
          x: event.clientX,
          y: event.clientY,
          target: contextTarget,
          isActionVisible: (action) => isDesktopActionVisible(action, contextTarget),
        });
      });
    },
    close: closeContextMenu,
    closeMobile: closeMobileActionSheet,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      contextTarget = null;
      lastTerminalTouchContextMenuCandidate = null;
      lifecycle.dispose();
      menuView.dispose();
    },
    isAnyOpen() {
      return menuView.isDesktopOpen() || menuView.isMobileOpen();
    },
    isDesktopOpen: () => menuView.isDesktopOpen(),
    isMobileOpen: () => menuView.isMobileOpen(),
    markTouchCandidate: markTerminalTouchContextMenuCandidate,
    openMobile: openMobileActionSheet,
    refreshMobile() {
      if (menuView.isMobileOpen()) {
        renderMobileActionSheet();
      }
    },
    shouldSuppressContextMenu: shouldSuppressTerminalContextMenu,
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start();
    },
  });
}
