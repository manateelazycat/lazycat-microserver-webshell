import {
  getShortcutKeyFromEvent,
  isNativePasteShortcutEvent,
  isShiftInsertPasteShortcutEvent,
} from "../../settings/index.js";
import { createAppShortcutLifecycle } from "./shortcut_lifecycle.js";

const noop = () => {};

const invoke = (callback, ...args) => (
  typeof callback === "function" ? callback(...args) : undefined
);

const isInstance = (value, Constructor) => (
  typeof Constructor === "function" && value instanceof Constructor
);

/**
 * Coordinates desktop shortcut commands without owning any feature state.
 * Each cross-domain operation is injected by global-runtime.js as a command.
 */
export function createAppShortcutController({
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  KeyboardEventCtor = globalThis.KeyboardEvent,
  ElementCtor = globalThis.Element,
  HTMLInputElementCtor = globalThis.HTMLInputElement,
  HTMLTextAreaElementCtor = globalThis.HTMLTextAreaElement,
  HTMLSelectElementCtor = globalThis.HTMLSelectElement,
  lifecycle = null,
  lifecycleFactory = createAppShortcutLifecycle,
  getCurrentTab = () => null,
  getOrderedTabs = () => [],
  getActiveSession = () => null,
  setActiveTabByOffset = noop,
  setActiveTabByIndex = noop,
  createUserTab = async () => {},
  closeTab = noop,
  closeOtherTabs = noop,
  renameTab = async () => {},
  moveTab = noop,
  splitPane = noop,
  closePane = noop,
  selectPaneInDirection = noop,
  resolveDesktopShortcutAction = () => "",
  handleTerminalFontSizeShortcut = () => false,
  isAppearancePickerOpen = () => false,
  isSettingsOpen = () => false,
  isDevicesPanelOpen = () => false,
  isInstanceSwitcherOpen = () => false,
  isAttachmentsOpen = () => false,
  isTerminalOverviewOpen = () => false,
  openTheme = noop,
  openInstanceSwitcher = async () => {},
  copyTerminal = async () => {},
  focusForNativePaste = noop,
  openSearch = noop,
  selectAllTerminal = noop,
  importAttachmentFromClipboard = async () => {},
  selectAttachmentFiles = noop,
  pasteTerminal = async () => {},
  isTerminalPasteRedirectTarget = () => false,
  closeContextMenu = noop,
  showToast = noop,
  getShortcutKey = (event) => getShortcutKeyFromEvent(event, navigatorObject),
  isNativePaste = (event) => isNativePasteShortcutEvent(event, navigatorObject),
  isShiftInsertPaste = (event) => isShiftInsertPasteShortcutEvent(event),
} = {}) {
  const shortcutLifecycle = lifecycle || lifecycleFactory();

  const isDisposed = () => shortcutLifecycle.isDisposed();

  const isKeyboardEvent = (event) => (
    typeof KeyboardEventCtor === "function"
      ? event instanceof KeyboardEventCtor
      : Boolean(event && event.type === "keydown")
  );

  const isInteractiveShortcutTarget = (target) => {
    if (!isInstance(target, ElementCtor)) {
      return false;
    }
    if (target.closest?.(".terminal-host")) {
      return false;
    }
    if (
      isInstance(target, HTMLInputElementCtor)
      || isInstance(target, HTMLTextAreaElementCtor)
      || isInstance(target, HTMLSelectElementCtor)
    ) {
      return true;
    }
    if (target.isContentEditable && !target.classList?.contains?.("terminal-host")) {
      return true;
    }
    const interactive = target.closest?.("input, textarea, select, [contenteditable='true']");
    return Boolean(interactive && !interactive.classList?.contains?.("terminal-host"));
  };

  const isFullscreenActive = () => Boolean(
    documentObject?.fullscreenElement
      || documentObject?.webkitFullscreenElement
      || documentObject?.msFullscreenElement
  );

  const toggleFullscreen = async () => {
    if (isFullscreenActive()) {
      const exitFullscreen = documentObject?.exitFullscreen
        || documentObject?.webkitExitFullscreen
        || documentObject?.msExitFullscreen;
      if (typeof exitFullscreen === "function") {
        await exitFullscreen.call(documentObject);
      }
      return;
    }
    const root = documentObject?.documentElement;
    const requestFullscreen = root?.requestFullscreen
      || root?.webkitRequestFullscreen
      || root?.msRequestFullscreen;
    if (typeof requestFullscreen === "function") {
      await requestFullscreen.call(root);
    }
  };

  const runAction = async (action) => {
    if (isDisposed()) {
      return false;
    }
    const normalizedAction = String(action || "").trim();
    const tab = getCurrentTab() || null;
    switch (normalizedAction) {
      case "fullscreen":
        await toggleFullscreen();
        return true;
      case "new_tab":
        await createUserTab();
        return true;
      case "close_tab":
        if (tab) closeTab(tab.id);
        return true;
      case "close_other_tabs":
        if (tab) closeOtherTabs(tab.id);
        return true;
      case "rename_tab":
        if (tab) await renameTab(tab.id);
        return true;
      case "next_tab":
        setActiveTabByOffset(1);
        return true;
      case "previous_tab":
        setActiveTabByOffset(-1);
        return true;
      case "last_tab":
        setActiveTabByIndex(getOrderedTabs().length - 1);
        return true;
      case "move_tab_to_first":
        if (tab) moveTab(tab.id, "first");
        return true;
      case "move_tab_left":
        if (tab) moveTab(tab.id, "left");
        return true;
      case "move_tab_right":
        if (tab) moveTab(tab.id, "right");
        return true;
      case "move_tab_to_last":
        if (tab) moveTab(tab.id, "last");
        return true;
      case "vertical_split":
        if (tab?.activePaneId) splitPane(tab.id, tab.activePaneId, "vertical");
        return true;
      case "horizontal_split":
        if (tab?.activePaneId) splitPane(tab.id, tab.activePaneId, "horizontal");
        return true;
      case "select_up":
        selectPaneInDirection("up");
        return true;
      case "select_down":
        selectPaneInDirection("down");
        return true;
      case "select_left":
        selectPaneInDirection("left");
        return true;
      case "select_right":
        selectPaneInDirection("right");
        return true;
      case "close_pane":
        if (tab?.activePaneId) closePane(tab.id, tab.activePaneId);
        return true;
      case "theme":
        openTheme();
        return true;
      case "switch_container":
        await openInstanceSwitcher();
        return true;
      case "copy_terminal":
        await copyTerminal();
        return true;
      case "paste_terminal":
        focusForNativePaste();
        await pasteTerminal();
        return true;
      case "search_terminal":
        openSearch();
        return true;
      case "select_all_terminal":
        selectAllTerminal();
        return true;
      case "attachment_clipboard":
        await importAttachmentFromClipboard();
        return true;
      case "attachment_file":
        selectAttachmentFiles();
        return true;
      default: {
        const match = normalizedAction.match(/^tab_(\d+)$/);
        if (match) {
          setActiveTabByIndex(Number(match[1]) - 1);
          return true;
        }
        return false;
      }
    }
  };

  const handleKeydown = (event) => {
    if (isDisposed() || !isKeyboardEvent(event)) {
      return false;
    }
    const shortcut = getShortcutKey(event);
    const configuredAction = String(invoke(resolveDesktopShortcutAction, shortcut) || "").trim();
    const shiftInsertPaste = isShiftInsertPaste(event);
    const nativePaste = isNativePaste(event);
    if (
      (event.isComposing || event.key === "Process" || Number(event.keyCode || 0) === 229)
      && !configuredAction
    ) {
      return false;
    }
    if (
      invoke(isAppearancePickerOpen)
      || invoke(isSettingsOpen)
      || invoke(isDevicesPanelOpen)
      || invoke(isInstanceSwitcherOpen)
      || invoke(isAttachmentsOpen)
      || invoke(isTerminalOverviewOpen)
    ) {
      return false;
    }
    if (
      isInteractiveShortcutTarget(event.target)
      && !((shiftInsertPaste || nativePaste) && invoke(isTerminalPasteRedirectTarget, event.target))
    ) {
      return false;
    }
    // Ctrl+Shift+V is often the browser's plain-text-only paste command.
    // Read images explicitly instead of letting that command discard them.
    if (shiftInsertPaste || (nativePaste && event.ctrlKey && event.shiftKey)) {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      focusForNativePaste();
      closeContextMenu();
      Promise.resolve(pasteTerminal()).catch((error) => showToast(error?.message || String(error)));
      return true;
    }
    if (nativePaste) {
      focusForNativePaste();
      closeContextMenu();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      return true;
    }
    if (invoke(handleTerminalFontSizeShortcut, event)) {
      closeContextMenu();
      return true;
    }
    if (
      !event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && (event.key === "PageUp" || event.key === "PageDown")
    ) {
      const session = getActiveSession();
      if (session?.term?.scrollPages) {
        event.preventDefault?.();
        session.term.scrollPages(event.key === "PageUp" ? -1 : 1);
        return true;
      }
    }
    if (!configuredAction) {
      return false;
    }
    if (configuredAction === "paste_terminal") {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      closeContextMenu();
      runAction(configuredAction).catch((error) => showToast(error?.message || "粘贴失败。"));
      return true;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    closeContextMenu();
    runAction(configuredAction).catch((error) => showToast(error?.message || "快捷键执行失败。"));
    return true;
  };

  return Object.freeze({
    dispose: () => shortcutLifecycle.dispose(),
    handleKeydown,
    isDisposed,
    isInteractiveShortcutTarget,
    runAction,
    toggleFullscreen,
  });
}
