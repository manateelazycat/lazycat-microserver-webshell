import { createFontRegistry } from "./font_registry.js";
import { createSettingsAPI } from "./settings_api.js";
import { createSettingsLifecycle } from "./settings_lifecycle.js";
import {
  BACKTAB_SEQUENCE,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT,
  DEFAULT_TERMINAL_SCROLLBACK,
  applyStickyModifierInput,
  applyStickyShiftInput,
  canApplyStickyModifierInput,
  cloneDesktopShortcuts,
  cloneMobileShortcutRows,
  cloneSettingsSnapshot,
  createDefaultDesktopShortcuts,
  defaultMobileShortcutRows,
  getShortcutKeyFromEvent,
  isNativePasteShortcutEvent,
  isShiftInsertPasteShortcutEvent,
  normalizeMobileShortcutTextData,
  normalizeShortcutDefinition,
  normalizeShortcutInputModifiers,
  normalizeTerminalFontSize,
  readStoredBoolean,
  readStoredTerminalFontSize,
  resolveMobileShortcutInputData,
  serializeDesktopShortcuts,
  serializeMobileShortcutRows,
  shortcutKeyFromEventCode,
  terminalFontSizeShortcutAction,
  normalizeServerSettings,
} from "./settings_model.js";
import {
  applyDesktopShortcutEdit,
  applyMobileShortcutEdit,
  buildDesktopShortcut,
  buildMobileShortcut,
  mobileEditorInitialDraft,
  removeDesktopShortcut,
  removeMobileShortcut,
  shortcutAt,
} from "./shortcut_editor.js";
import { createSettingsView } from "./settings_view.js";

const noop = () => {};
const asyncNoop = async () => {};

export function createSettingsController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  navigatorObject = globalThis.navigator,
  storage = windowObject?.localStorage,
  storagePrefix = "webshell",
  api = createSettingsAPI({ fetchImpl: globalThis.fetch, baseURL: windowObject?.location?.href }),
  view = createSettingsView({ documentObject, navigatorObject }),
  fontRegistry = createFontRegistry({ documentObject, windowObject }),
  lifecycleFactory = createSettingsLifecycle,
  isMobileLayout = () => false,
  isDebugModeEnabled = () => false,
  prepareOpen = noop,
  closeCustomSelect = noop,
  confirmAction = async () => false,
  focusTerminal = noop,
  showToast = noop,
  measureTask = async (_name, task) => task(),
  renderThemeSettings = noop,
  hideThemeScrollbar = noop,
  openThemePicker = noop,
  renderServiceForwarding = noop,
  setServiceForwardingSelected = noop,
  closeServiceForwardingEditor = noop,
  syncDebugControls = noop,
  onDebugModeDependents = noop,
  onTerminalFontFamilyChange = noop,
  onTerminalFontSizeChange = noop,
  onTerminalScrollbackChange = noop,
  onTerminalLineHeightChange = noop,
  onDesktopShortcutsBarChange = noop,
  onRestartWorkspaceRestoreSaved = noop,
  onMobilePixelScrollChange = noop,
  onMobileDoubleTapReminderChange = noop,
  onMobileShortcutsChange = noop,
  onForcePCModeChange = noop,
  isIndependentClient = async () => false,
  openClientSettings = asyncNoop,
} = {}) {
  const defaultDesktopShortcuts = createDefaultDesktopShortcuts(navigatorObject);
  const forcePCModeStorageKey = `${storagePrefix}.forcePCMode`;
  const mobileRemoteDesktopStorageKey = "lightos-mobile-remote-desktop-enabled";
  let snapshot = cloneSettingsSnapshot({
    terminalFontSize: readStoredTerminalFontSize(storage, storagePrefix),
    terminalLineHeightPercent: DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT,
    terminalScrollback: DEFAULT_TERMINAL_SCROLLBACK,
    terminalFontID: "",
    terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
    terminalSymbolFont: null,
    fonts: [],
    desktopMouseClipboardEnabled: true,
    desktopShortcutsBarEnabled: false,
    restartWorkspaceRestoreEnabled: false,
    mobilePixelScrollEnabled: true,
    mobileDoubleTapReminderEnabled: true,
    mobileRemoteDesktopEnabled: readStoredBoolean(storage, mobileRemoteDesktopStorageKey, false),
    forcePCModeEnabled: readStoredBoolean(storage, forcePCModeStorageKey, false),
    mobileShortcuts: defaultMobileShortcutRows,
    desktopShortcuts: defaultDesktopShortcuts,
  });

  let lifecycle = null;
  let started = false;
  let disposed = false;
  let controllerGeneration = 0;
  let loadGeneration = 0;
  let loadPromise = null;
  let mobileView = "detail";
  let fontEditMode = false;
  const selectedFontDeleteIDs = new Set();
  let mobileShortcutEditorState = null;
  let desktopShortcutEditorState = null;
  let mobileShortcutDragState = null;
  let dragListenerRemovers = [];
  let mobileShortcutsScrollbarTimer = 0;
  let desktopShortcutsScrollbarTimer = 0;
  let lineHeightSaveTimer = 0;
  let scrollbackSaveTimer = 0;
  let focusTimer = 0;
  let terminalScrollbackKeepaliveValue = 0;
  let persistChain = Promise.resolve();
  let mutationSequence = 0;
  const pendingFields = new Map();
  const requestControllers = new Set();
  let desktopShortcutActionMap = new Map();

  const clearTimer = (timer) => {
    if (timer) windowObject?.clearTimeout?.(timer);
  };

  const scheduleFocus = (callback) => {
    clearTimer(focusTimer);
    focusTimer = windowObject?.setTimeout?.(() => {
      focusTimer = 0;
      if (!disposed) callback();
    }, 0) || 0;
  };

  const persistLocal = (key, value) => {
    try {
      storage?.setItem?.(key, String(value));
    } catch (error) {
    }
  };

  const runRequest = async (task, { keepalive = false } = {}) => {
    if (disposed) {
      const error = new Error("settings disposed");
      error.name = "AbortError";
      throw error;
    }
    const controller = typeof AbortController === "function" && !keepalive ? new AbortController() : null;
    if (controller) requestControllers.add(controller);
    try {
      return await task(controller?.signal);
    } finally {
      if (controller) requestControllers.delete(controller);
    }
  };

  const rebuildDesktopShortcutActionMap = () => {
    desktopShortcutActionMap = new Map();
    for (const item of snapshot.desktopShortcuts) {
      const shortcut = normalizeShortcutDefinition(item.shortcut);
      if (shortcut) desktopShortcutActionMap.set(shortcut, item.action);
    }
  };

  const renderFonts = () => {
    for (const id of [...selectedFontDeleteIDs]) {
      if (!snapshot.fonts.some((font) => font.id === id)) selectedFontDeleteIDs.delete(id);
    }
    view.renderFonts?.(snapshot.fonts, snapshot.terminalFontID, {
      editMode: fontEditMode,
      selectedIDs: selectedFontDeleteIDs,
    });
  };

  const syncView = () => {
    view.setLineHeight?.(snapshot.terminalLineHeightPercent);
    view.setScrollback?.(snapshot.terminalScrollback);
    view.syncToggles?.(snapshot, { debugMode: isDebugModeEnabled() });
    view.renderMobileShortcuts?.(snapshot.mobileShortcuts);
    view.renderDesktopShortcuts?.(snapshot.desktopShortcuts);
    renderFonts();
    view.syncMobileNavigation?.({ isMobile: isMobileLayout(), mobileView });
    syncDebugControls();
  };

  const notifyChanges = (next, previous, { force = false, forceFontRefresh = false } = {}) => {
    if (force || next.terminalScrollback !== previous.terminalScrollback) {
      onTerminalScrollbackChange(previous.terminalScrollback, next.terminalScrollback);
    }
    if (force || next.terminalLineHeightPercent !== previous.terminalLineHeightPercent) {
      onTerminalLineHeightChange(next.terminalLineHeightPercent, previous.terminalLineHeightPercent);
    }
    if (force || forceFontRefresh || next.terminalFontFamily !== previous.terminalFontFamily) {
      onTerminalFontFamilyChange(next.terminalFontFamily, previous.terminalFontFamily);
    }
    if (force || next.desktopShortcutsBarEnabled !== previous.desktopShortcutsBarEnabled) {
      onDesktopShortcutsBarChange(next.desktopShortcutsBarEnabled, previous.desktopShortcutsBarEnabled);
    }
    if (force || next.mobilePixelScrollEnabled !== previous.mobilePixelScrollEnabled) {
      onMobilePixelScrollChange(next.mobilePixelScrollEnabled, previous.mobilePixelScrollEnabled);
    }
    if (force || next.mobileDoubleTapReminderEnabled !== previous.mobileDoubleTapReminderEnabled) {
      onMobileDoubleTapReminderChange(next.mobileDoubleTapReminderEnabled, previous.mobileDoubleTapReminderEnabled);
    }
    if (force || JSON.stringify(next.mobileShortcuts) !== JSON.stringify(previous.mobileShortcuts)) {
      onMobileShortcutsChange(cloneMobileShortcutRows(next.mobileShortcuts));
    }
  };

  const replaceSnapshot = (partial, options = {}) => {
    if (disposed) return;
    const previous = cloneSettingsSnapshot(snapshot);
    snapshot = cloneSettingsSnapshot({ ...snapshot, ...partial });
    rebuildDesktopShortcutActionMap();
    syncView();
    notifyChanges(snapshot, previous, options);
  };

  const overlayPendingFields = (next) => {
    const result = { ...next };
    for (const [field, entry] of pendingFields) {
      result[field] = entry.value;
    }
    return result;
  };

  const registerFonts = async (expectedGeneration) => {
    const result = await fontRegistry.registerAll(snapshot.fonts, snapshot.terminalSymbolFont);
    if (disposed || expectedGeneration !== controllerGeneration || result?.stale) return;
    if (result.symbolFailed) {
      view.setFeedback?.("Nerd Font 符号字体加载失败，starship prompt 可能显示异常。", "error");
    } else if (result.fontFailures?.length) {
      view.setFeedback?.(`部分字体加载失败：${result.fontFailures.join("、")}`, "error");
    }
    onTerminalFontFamilyChange(snapshot.terminalFontFamily, snapshot.terminalFontFamily);
  };

  const applyServerState = async (raw, {
    deferFontLoad = false,
    refreshFonts = true,
  } = {}) => {
    if (disposed) return;
    const normalized = normalizeServerSettings(raw, { defaults: defaultDesktopShortcuts });
    const next = overlayPendingFields({
      ...snapshot,
      ...normalized,
      terminalFontSize: snapshot.terminalFontSize,
      mobileRemoteDesktopEnabled: snapshot.mobileRemoteDesktopEnabled,
      forcePCModeEnabled: snapshot.forcePCModeEnabled,
    });
    replaceSnapshot(next);
    if (!refreshFonts) {
      return;
    }
    const expectedGeneration = controllerGeneration;
    const promise = registerFonts(expectedGeneration);
    if (deferFontLoad) {
      promise.catch((error) => console.warn("Deferred terminal font load failed", error));
      return;
    }
    await promise;
  };

  const initializeClientSettingsEntry = async () => {
    const expectedGeneration = controllerGeneration;
    try {
      const independent = await isIndependentClient();
      if (!disposed && expectedGeneration === controllerGeneration) {
        view.setClientSettingsVisible?.(independent === true);
      }
    } catch (error) {
    }
  };

  const enqueueMutation = ({
    field,
    value,
    patch,
    savingKind = "",
    keepalive = false,
    deferFontLoad = false,
    refreshFonts = true,
  }) => {
    const token = ++mutationSequence;
    const previousValue = cloneSettingsSnapshot(snapshot)[field];
    pendingFields.set(field, { token, value });
    replaceSnapshot({ [field]: value });
    if (savingKind) view.setSaving?.(savingKind, true);
    const expectedGeneration = controllerGeneration;
    const mutation = persistChain.catch(() => {}).then(async () => {
      const raw = await measureTask("settings save", () => runRequest(
        (signal) => api.patch(patch, { keepalive, signal }),
        { keepalive },
      ));
      if (disposed || expectedGeneration !== controllerGeneration) return;
      if (pendingFields.get(field)?.token === token) pendingFields.delete(field);
      await applyServerState(raw, { deferFontLoad, refreshFonts });
    });
    persistChain = mutation.catch(() => {});
    return mutation.catch((error) => {
      if (!disposed && expectedGeneration === controllerGeneration && pendingFields.get(field)?.token === token) {
        pendingFields.delete(field);
        replaceSnapshot({ [field]: previousValue });
      }
      throw error;
    }).finally(() => {
      if (!disposed && savingKind && !pendingFields.has(field)) {
        view.setSaving?.(savingKind, false);
      }
    });
  };

  const saveLineHeightFromInput = () => {
    let value;
    try {
      value = view.readLineHeight();
    } catch (error) {
      view.setLineHeight?.(snapshot.terminalLineHeightPercent);
      view.setFeedback?.(error.message || "行间距设置无效。", "error");
      return Promise.resolve(false);
    }
    if (value === snapshot.terminalLineHeightPercent) return Promise.resolve(false);
    return enqueueMutation({
      field: "terminalLineHeightPercent",
      value,
      patch: { terminal_line_height_percent: value },
      savingKind: "lineHeight",
      refreshFonts: false,
    }).then(() => true).catch((error) => {
      view.setFeedback?.(error.message || "行间距设置保存失败。", "error");
      return false;
    });
  };

  const saveScrollbackFromInput = ({ keepalive = false, showFeedback = true } = {}) => {
    clearTimer(scrollbackSaveTimer);
    scrollbackSaveTimer = 0;
    let value;
    try {
      value = view.readScrollback();
    } catch (error) {
      if (showFeedback) {
        view.setScrollback?.(snapshot.terminalScrollback);
        view.setFeedback?.(error.message || "滚动历史设置无效。", "error");
      }
      return Promise.resolve(false);
    }
    if (value === snapshot.terminalScrollback) return Promise.resolve(false);
    if (keepalive) {
      terminalScrollbackKeepaliveValue = value;
      return runRequest((signal) => api.patch({ terminal_scrollback: value }, { keepalive: true, signal }), { keepalive: true })
        .then((raw) => applyServerState(raw).then(() => true))
        .catch(() => false)
        .finally(() => {
          if (terminalScrollbackKeepaliveValue === value) terminalScrollbackKeepaliveValue = 0;
        });
    }
    return enqueueMutation({
      field: "terminalScrollback",
      value,
      patch: { terminal_scrollback: value },
      savingKind: "scrollback",
    }).then(() => {
      if (showFeedback) view.setFeedback?.("滚动历史设置已保存，刷新或新建终端后生效。", "success");
      return true;
    }).catch((error) => {
      if (showFeedback) view.setFeedback?.(error.message || "滚动历史设置保存失败。", "error");
      return false;
    });
  };

  const saveToggle = (field, patchKey, savingKind, errorMessage) => {
    const value = view.toggleValue?.(savingKind) === true;
    return enqueueMutation({ field, value, patch: { [patchKey]: value }, savingKind })
      .catch((error) => view.setFeedback?.(error.message || errorMessage, "error"));
  };

  const saveMobileShortcuts = (rows, { reset = false } = {}) => enqueueMutation({
    field: "mobileShortcuts",
    value: cloneMobileShortcutRows(rows),
    patch: { mobile_shortcuts: reset ? null : serializeMobileShortcutRows(rows) },
    savingKind: "mobileShortcuts",
  });

  const saveDesktopShortcuts = (shortcuts, { reset = false } = {}) => enqueueMutation({
    field: "desktopShortcuts",
    value: cloneDesktopShortcuts(shortcuts),
    patch: { desktop_shortcuts: reset ? null : serializeDesktopShortcuts(shortcuts) },
    savingKind: "desktopShortcuts",
  });

  const setActiveTab = (tabID) => {
    const next = view.setActiveTab?.(tabID) || "terminal";
    if (next === "theme") renderThemeSettings();
    else hideThemeScrollbar();
    if (next === "mobile-shortcuts") view.renderMobileShortcuts?.(snapshot.mobileShortcuts);
    else hideMobileShortcutsScrollbar();
    if (next === "desktop-shortcuts") view.renderDesktopShortcuts?.(snapshot.desktopShortcuts);
    else hideDesktopShortcutsScrollbar();
    setServiceForwardingSelected(next === "service-forwards");
    view.syncMobileNavigation?.({ isMobile: isMobileLayout(), mobileView });
    return next;
  };

  const hideMobileShortcutsScrollbar = () => {
    clearTimer(mobileShortcutsScrollbarTimer);
    mobileShortcutsScrollbarTimer = 0;
    view.setMobileShortcutsScrolling?.(false);
  };

  const showMobileShortcutsScrollbar = () => {
    clearTimer(mobileShortcutsScrollbarTimer);
    view.setMobileShortcutsScrolling?.(true);
    mobileShortcutsScrollbarTimer = windowObject?.setTimeout?.(hideMobileShortcutsScrollbar, 800) || 0;
  };

  const hideDesktopShortcutsScrollbar = () => {
    clearTimer(desktopShortcutsScrollbarTimer);
    desktopShortcutsScrollbarTimer = 0;
    view.setDesktopShortcutsScrolling?.(false);
  };

  const showDesktopShortcutsScrollbar = () => {
    clearTimer(desktopShortcutsScrollbarTimer);
    view.setDesktopShortcutsScrolling?.(true);
    desktopShortcutsScrollbarTimer = windowObject?.setTimeout?.(hideDesktopShortcutsScrollbar, 800) || 0;
  };

  const openMobileIndex = ({ focus = true } = {}) => {
    mobileView = "index";
    view.syncMobileNavigation?.({ isMobile: isMobileLayout(), mobileView });
    if (focus) scheduleFocus(() => view.focusMobileNavItem?.());
  };

  const openMobileDetail = (tabID, { focus = true } = {}) => {
    setActiveTab(tabID);
    mobileView = "detail";
    view.syncMobileNavigation?.({ isMobile: isMobileLayout(), mobileView });
    if (focus) scheduleFocus(() => view.elements?.back?.focus?.());
  };

  const closeMobileEditor = () => {
    closeCustomSelect();
    mobileShortcutEditorState = null;
    view.closeMobileShortcutEditor?.();
  };

  const closeDesktopEditor = () => {
    closeCustomSelect();
    desktopShortcutEditorState = null;
    view.closeDesktopShortcutEditor?.();
  };

  const openMobileEditor = ({ rowIndex = 0, index = -1 } = {}) => {
    const existing = shortcutAt(snapshot.mobileShortcuts, rowIndex, index);
    mobileShortcutEditorState = { rowIndex, index };
    view.openMobileShortcutEditor?.(existing, mobileEditorInitialDraft(existing));
    scheduleFocus(() => view.elements?.mobileShortcutLabelInput?.focus?.());
  };

  const openDesktopEditor = ({ index = -1 } = {}) => {
    const existing = snapshot.desktopShortcuts[index] || null;
    desktopShortcutEditorState = { index };
    view.openDesktopShortcutEditor?.(existing);
    scheduleFocus(() => view.elements?.desktopShortcutLabelInput?.focus?.());
  };

  const submitMobileShortcut = () => {
    try {
      const shortcut = buildMobileShortcut({
        draft: view.readMobileShortcutDraft?.(),
        rows: snapshot.mobileShortcuts,
        editorState: mobileShortcutEditorState,
      });
      const rows = applyMobileShortcutEdit(snapshot.mobileShortcuts, mobileShortcutEditorState, shortcut);
      saveMobileShortcuts(rows).catch((error) => view.setFeedback?.(error.message || "手机快捷键保存失败。", "error"));
      closeMobileEditor();
    } catch (error) {
      view.setFeedback?.(error.message || "快捷键设置无效。", "error");
    }
  };

  const submitDesktopShortcut = () => {
    try {
      const shortcut = buildDesktopShortcut({
        draft: view.readDesktopShortcutDraft?.(),
        shortcuts: snapshot.desktopShortcuts,
        editorState: desktopShortcutEditorState,
        navigatorObject,
      });
      const shortcuts = applyDesktopShortcutEdit(snapshot.desktopShortcuts, desktopShortcutEditorState, shortcut);
      saveDesktopShortcuts(shortcuts).catch((error) => view.setFeedback?.(error.message || "PC快捷键保存失败。", "error"));
      closeDesktopEditor();
    } catch (error) {
      view.setFeedback?.(error.message || "PC快捷键设置无效。", "error");
    }
  };

  const deleteCurrentMobileShortcut = async () => {
    const { rowIndex, index } = mobileShortcutEditorState || {};
    const shortcut = shortcutAt(snapshot.mobileShortcuts, rowIndex, index);
    if (!shortcut) return;
    if (!await confirmAction(`删除快捷键「${shortcut.label}」？`, {
      title: "删除快捷键", okText: "删除", cancelText: "取消", danger: true,
    })) return;
    const rows = removeMobileShortcut(snapshot.mobileShortcuts, rowIndex, index);
    await saveMobileShortcuts(rows);
    closeMobileEditor();
  };

  const deleteCurrentDesktopShortcut = async () => {
    const index = Number(desktopShortcutEditorState?.index ?? -1);
    const shortcut = snapshot.desktopShortcuts[index];
    if (!shortcut) return;
    if (!await confirmAction(`删除快捷键「${shortcut.label}」？`, {
      title: "删除快捷键", okText: "删除", cancelText: "取消", danger: true,
    })) return;
    const shortcuts = removeDesktopShortcut(snapshot.desktopShortcuts, index);
    await saveDesktopShortcuts(shortcuts);
    closeDesktopEditor();
  };

  const cleanupDragListeners = () => {
    for (const remove of dragListenerRemovers.splice(0)) remove();
  };

  const cancelMobileShortcutDrag = () => {
    if (!mobileShortcutDragState) return;
    const state = mobileShortcutDragState;
    mobileShortcutDragState = null;
    cleanupDragListeners();
    view.cancelMobileShortcutDrag?.(state);
    view.renderMobileShortcuts?.(snapshot.mobileShortcuts);
  };

  const startMobileShortcutDrag = (event, item) => {
    if (event?.button !== 0 || mobileShortcutDragState) return;
    event.preventDefault?.();
    mobileShortcutDragState = view.beginMobileShortcutDrag?.(item, event) || null;
    if (!mobileShortcutDragState) return;
    dragListenerRemovers = [
      lifecycle.listenTransient(documentObject, "pointermove", updateMobileShortcutDrag, { passive: false }),
      lifecycle.listenTransient(documentObject, "pointerup", finishMobileShortcutDrag),
      lifecycle.listenTransient(documentObject, "pointercancel", cancelMobileShortcutDrag),
    ];
  };

  const updateMobileShortcutDrag = (event) => {
    if (!mobileShortcutDragState) return;
    event.preventDefault?.();
    view.updateMobileShortcutDrag?.(mobileShortcutDragState, event);
  };

  const finishMobileShortcutDrag = (event) => {
    if (!mobileShortcutDragState || event?.pointerId !== mobileShortcutDragState.pointerId) return;
    const state = mobileShortcutDragState;
    mobileShortcutDragState = null;
    cleanupDragListeners();
    view.finishMobileShortcutDrag?.(state);
    const byID = new Map(snapshot.mobileShortcuts.flat().map((shortcut) => [shortcut.id, shortcut]));
    const rows = view.mobileShortcutOrder?.().map((ids) => ids.map((id) => byID.get(id)).filter(Boolean));
    saveMobileShortcuts(rows).catch((error) => view.setFeedback?.(error.message || "手机快捷键保存失败。", "error"));
  };

  const uploadFonts = async () => {
    const files = view.consumeFontFiles?.() || [];
    if (files.length === 0) return;
    view.setFontUploadSaving?.(true);
    try {
      const raw = await runRequest((signal) => api.uploadFonts(files, { signal }));
      await applyServerState(raw);
      view.resetFontInput?.();
    } catch (error) {
      view.setFeedback?.(error.message || "字体上传失败。", "error");
    } finally {
      if (!disposed) view.setFontUploadSaving?.(false);
    }
  };

  const selectFont = (fontID) => enqueueMutation({
    field: "terminalFontID",
    value: String(fontID || ""),
    patch: { terminal_font_id: String(fontID || "") },
  }).catch((error) => view.setFeedback?.(error.message || "字体设置保存失败。", "error"));

  const deleteSelectedFonts = async () => {
    const ids = [...selectedFontDeleteIDs].filter((id) => snapshot.fonts.some((font) => font.id === id));
    if (ids.length === 0) {
      renderFonts();
      return;
    }
    const suffix = ids.includes(snapshot.terminalFontID) ? "\n删除当前字体后终端将恢复系统默认字体。" : "";
    if (!await confirmAction(`删除选中的 ${ids.length} 个字体？${suffix}`, {
      title: "批量删除字体", okText: "删除", cancelText: "取消", danger: true,
    })) return;
    view.setSaving?.("fonts", true);
    try {
      await Promise.all(ids.map((id) => runRequest((signal) => api.deleteFont(id, { signal }))));
      selectedFontDeleteIDs.clear();
      await controller.load();
    } catch (error) {
      view.setFeedback?.(error.message || "字体删除失败。", "error");
    } finally {
      renderFonts();
    }
  };

  const handlers = {
    onOpen: () => controller.open(),
    onOpenClientSettings: () => {
      closeCustomSelect();
      Promise.resolve(openClientSettings()).catch((error) => showToast(error.message || "无法打开客户端设置"));
    },
    onMobileShortcutsScroll: showMobileShortcutsScrollbar,
    onDesktopShortcutsScroll: showDesktopShortcutsScrollbar,
    onBack: () => {
      if (isMobileLayout() && mobileView === "detail") openMobileIndex();
      else controller.close();
    },
    onClose: () => controller.close(),
    onBackdropClick: (event) => {
      if (view.isBackdropTarget?.(event.target)) controller.close();
    },
    onMobileNavClick: (event) => {
      const tabID = view.mobileNavTabFromEvent?.(event);
      if (tabID) openMobileDetail(tabID);
    },
    onTabClick: (_event, tab) => setActiveTab(tab.dataset?.settingsTab),
    onTabKeydown: (event, tab) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const tabs = view.elements?.tabs || [];
      const currentIndex = Math.max(0, tabs.indexOf(tab));
      const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = tabs[(currentIndex + offset + tabs.length) % tabs.length];
      if (next) {
        setActiveTab(next.dataset?.settingsTab);
        next.focus?.();
      }
    },
    onPanelClick: (event) => {
      if (view.stepNumberInput?.(event)) event.preventDefault?.();
    },
    onFontCardClick: (event) => {
      const fontID = view.fontIDFromEvent?.(event);
      if (fontID === null) return;
      if (fontEditMode) {
        if (!fontID) return;
        if (selectedFontDeleteIDs.has(fontID)) selectedFontDeleteIDs.delete(fontID);
        else selectedFontDeleteIDs.add(fontID);
        renderFonts();
        return;
      }
      selectFont(fontID);
    },
    onFontEditClick: () => {
      fontEditMode = !fontEditMode;
      if (!fontEditMode) selectedFontDeleteIDs.clear();
      renderFonts();
    },
    onFontDeleteSelectedClick: () => deleteSelectedFonts(),
    onFontUploadClick: () => {
      if (!fontEditMode && !view.elements?.fontInput?.disabled) view.openFontPicker?.();
    },
    onFontInputChange: uploadFonts,
    onLineHeightInput: () => {
      clearTimer(lineHeightSaveTimer);
      try {
        view.readLineHeight?.();
      } catch (error) {
        return;
      }
      lineHeightSaveTimer = windowObject?.setTimeout?.(saveLineHeightFromInput, 360) || 0;
    },
    onLineHeightChange: () => {
      clearTimer(lineHeightSaveTimer);
      lineHeightSaveTimer = 0;
      saveLineHeightFromInput();
    },
    onLineHeightReset: () => {
      clearTimer(lineHeightSaveTimer);
      view.setLineHeight?.(DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT);
      saveLineHeightFromInput().catch(noop);
    },
    onScrollbackInput: () => {
      clearTimer(scrollbackSaveTimer);
      try {
        view.readScrollback?.();
      } catch (error) {
        return;
      }
      scrollbackSaveTimer = windowObject?.setTimeout?.(() => saveScrollbackFromInput(), 360) || 0;
    },
    onScrollbackChange: () => {
      clearTimer(scrollbackSaveTimer);
      scrollbackSaveTimer = 0;
      saveScrollbackFromInput();
    },
    onScrollbackReset: () => {
      clearTimer(scrollbackSaveTimer);
      view.setScrollback?.(DEFAULT_TERMINAL_SCROLLBACK);
      saveScrollbackFromInput().then((saved) => {
        if (saved) view.setFeedback?.("滚动历史已恢复默认，刷新或新建终端后生效。", "success");
      });
    },
    onDesktopMouseClipboardChange: () => saveToggle(
      "desktopMouseClipboardEnabled", "desktop_mouse_clipboard_enabled", "desktopMouseClipboard", "鼠标复制粘贴设置保存失败。",
    ),
    onDesktopShortcutsBarChange: () => saveToggle(
      "desktopShortcutsBarEnabled", "desktop_shortcuts_bar_enabled", "desktopShortcutsBar", "PC底部快捷键栏设置保存失败。",
    ),
    onRestartWorkspaceRestoreChange: () => {
      const value = view.toggleValue?.("restartWorkspaceRestore") === true;
      enqueueMutation({
        field: "restartWorkspaceRestoreEnabled",
        value,
        patch: { restart_workspace_restore_enabled: value },
        savingKind: "restartWorkspaceRestore",
      }).then(() => onRestartWorkspaceRestoreSaved(value))
        .catch((error) => view.setFeedback?.(error.message || "重启恢复设置保存失败。", "error"));
    },
    onMobilePixelScrollChange: () => saveToggle(
      "mobilePixelScrollEnabled", "mobile_pixel_scroll_enabled", "mobilePixelScroll", "像素级滚动设置保存失败。",
    ),
    onMobileDoubleTapReminderChange: () => saveToggle(
      "mobileDoubleTapReminderEnabled", "mobile_double_tap_reminder_enabled", "mobileDoubleTapReminder", "双击屏幕提醒设置保存失败。",
    ),
    onMobileRemoteDesktopChange: () => {
      const value = view.toggleValue?.("mobileRemoteDesktop") === true;
      replaceSnapshot({ mobileRemoteDesktopEnabled: value });
      persistLocal(mobileRemoteDesktopStorageKey, value ? "true" : "false");
    },
    onForcePCModeChange: () => {
      const value = view.toggleValue?.("forcePCMode") === true;
      replaceSnapshot({ forcePCModeEnabled: value });
      persistLocal(forcePCModeStorageKey, value ? "true" : "false");
      onForcePCModeChange(value);
    },
    onMobileShortcutAdd: () => openMobileEditor({ rowIndex: 0, index: -1 }),
    onMobileShortcutReset: async () => {
      if (!await confirmAction("恢复默认手机快捷键？当前自定义配置会被替换。", {
        title: "恢复默认", okText: "恢复", cancelText: "取消",
      })) return;
      const rows = cloneMobileShortcutRows(defaultMobileShortcutRows);
      return saveMobileShortcuts(rows, { reset: true })
        .catch((error) => view.setFeedback?.(error.message || "手机快捷键恢复默认失败。", "error"));
    },
    onMobileShortcutListClick: (event) => {
      const target = view.mobileShortcutEditTarget?.(event);
      if (target) openMobileEditor(target);
    },
    onMobileShortcutPointerDown: (event) => {
      const item = view.mobileShortcutDragItem?.(event);
      if (item) startMobileShortcutDrag(event, item);
    },
    onDesktopShortcutAdd: () => openDesktopEditor({ index: -1 }),
    onDesktopShortcutReset: async () => {
      if (!await confirmAction("恢复默认PC快捷键？当前自定义配置会被替换。", {
        title: "恢复默认", okText: "恢复", cancelText: "取消",
      })) return;
      return saveDesktopShortcuts(defaultDesktopShortcuts, { reset: true })
        .catch((error) => view.setFeedback?.(error.message || "PC快捷键恢复默认失败。", "error"));
    },
    onDesktopShortcutListClick: (event) => {
      const index = view.desktopShortcutIndexFromEvent?.(event);
      if (index !== null) openDesktopEditor({ index });
    },
    onMobileShortcutSubmit: (event) => {
      event.preventDefault?.();
      submitMobileShortcut();
    },
    onMobileShortcutCancel: closeMobileEditor,
    onMobileShortcutDelete: () => deleteCurrentMobileShortcut()
      .catch((error) => view.setFeedback?.(error.message || "删除快捷键失败。", "error")),
    onMobileShortcutFieldsChange: () => view.syncMobileShortcutEditorFields?.(),
    onDesktopShortcutSubmit: (event) => {
      event.preventDefault?.();
      submitDesktopShortcut();
    },
    onDesktopShortcutCancel: closeDesktopEditor,
    onDesktopShortcutDelete: () => deleteCurrentDesktopShortcut()
      .catch((error) => view.setFeedback?.(error.message || "PC快捷键删除失败。", "error")),
    onDesktopShortcutFieldsChange: () => view.syncDesktopShortcutCapture?.(),
    onDesktopShortcutCaptureKeydown: (event) => {
      if (event.key === "Tab") return;
      event.preventDefault?.();
      view.updateDesktopShortcutCaptureFromEvent?.(event);
    },
    onResize: () => controller.handleHostLayoutChange(),
    onPageHide: () => controller.flushPending(),
    onDocumentKeydown: (event) => {
      if (event.key !== "Escape") return;
      if (view.isMobileShortcutEditorOpen?.()) {
        event.preventDefault?.();
        closeMobileEditor();
      } else if (view.isDesktopShortcutEditorOpen?.()) {
        event.preventDefault?.();
        closeDesktopEditor();
      } else if (view.isOpen?.()) {
        controller.close();
      }
    },
  };

  const controller = {
    adjustTerminalFontSize(delta) {
      controller.setTerminalFontSize(snapshot.terminalFontSize + Number(delta || 0));
    },
    close() {
      const wasOpen = view.isOpen?.() === true;
      closeMobileEditor();
      closeDesktopEditor();
      closeCustomSelect();
      hideThemeScrollbar();
      view.close?.();
      mobileView = "detail";
      view.syncMobileNavigation?.({ isMobile: isMobileLayout(), mobileView });
      setServiceForwardingSelected(false);
      closeServiceForwardingEditor();
      if (wasOpen) scheduleFocus(focusTerminal);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controllerGeneration += 1;
      loadGeneration += 1;
      clearTimer(mobileShortcutsScrollbarTimer);
      clearTimer(desktopShortcutsScrollbarTimer);
      clearTimer(lineHeightSaveTimer);
      clearTimer(scrollbackSaveTimer);
      clearTimer(focusTimer);
      cleanupDragListeners();
      for (const requestController of requestControllers) requestController.abort();
      requestControllers.clear();
      lifecycle?.dispose?.();
      fontRegistry.dispose?.();
      view.close?.();
    },
    flushPending() {
      if (disposed || terminalScrollbackKeepaliveValue) return;
      let value;
      try {
        value = view.readScrollback?.();
      } catch (error) {
        return;
      }
      if (value !== snapshot.terminalScrollback) saveScrollbackFromInput({ keepalive: true, showFeedback: false });
    },
    getDesktopMouseClipboardEnabled: () => snapshot.desktopMouseClipboardEnabled,
    getDesktopShortcutsBarEnabled: () => snapshot.desktopShortcutsBarEnabled,
    getRestartWorkspaceRestoreEnabled: () => snapshot.restartWorkspaceRestoreEnabled,
    getForcePCModeEnabled: () => snapshot.forcePCModeEnabled,
    getMobileDoubleTapReminderEnabled: () => snapshot.mobileDoubleTapReminderEnabled,
    getMobilePixelScrollEnabled: () => snapshot.mobilePixelScrollEnabled,
    getMobileRemoteDesktopEnabled: () => snapshot.mobileRemoteDesktopEnabled,
    getMobileShortcutRows: () => cloneMobileShortcutRows(snapshot.mobileShortcuts),
    getSnapshot: () => cloneSettingsSnapshot(snapshot),
    getTerminalFontFamily: () => snapshot.terminalFontFamily,
    getTerminalFontSize: () => snapshot.terminalFontSize,
    getTerminalLineHeightPercent: () => snapshot.terminalLineHeightPercent,
    getTerminalScrollback: () => snapshot.terminalScrollback,
    handleHostLayoutChange() {
      if (!isMobileLayout()) mobileView = "detail";
      view.syncMobileNavigation?.({ isMobile: isMobileLayout(), mobileView });
    },
    handleTerminalFontSizeShortcut(event) {
      const action = terminalFontSizeShortcutAction(event, navigatorObject);
      if (!action) return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      if (action === "increase") controller.adjustTerminalFontSize(1);
      else if (action === "decrease") controller.adjustTerminalFontSize(-1);
      else controller.setTerminalFontSize(DEFAULT_TERMINAL_FONT_SIZE);
      return true;
    },
    isOpen: () => view.isOpen?.() === true,
    async load({ deferFontLoad = false } = {}) {
      if (disposed) return;
      if (loadPromise) return loadPromise;
      const expectedLoadGeneration = ++loadGeneration;
      const expectedControllerGeneration = controllerGeneration;
      loadPromise = measureTask("settings load", () => runRequest((signal) => api.load({ signal })))
        .then(async (raw) => {
          if (disposed || expectedLoadGeneration !== loadGeneration || expectedControllerGeneration !== controllerGeneration) return;
          await applyServerState(raw, { deferFontLoad });
        })
        .finally(() => {
          if (expectedLoadGeneration === loadGeneration) loadPromise = null;
        });
      return loadPromise;
    },
    open(tabID = "terminal") {
      prepareOpen();
      view.renderMobileNav?.();
      mobileView = isMobileLayout() ? "index" : "detail";
      setActiveTab(tabID);
      renderThemeSettings();
      renderServiceForwarding();
      syncView();
      view.setFeedback?.("");
      view.open?.();
      view.syncMobileNavigation?.({ isMobile: isMobileLayout(), mobileView });
      scheduleFocus(() => {
        if (isMobileLayout() && mobileView === "index") view.focusMobileNavItem?.();
        else view.focusActiveTab?.();
      });
      controller.load().catch((error) => view.setFeedback?.(error.message || "设置加载失败。", "error"));
    },
    openTheme() {
      if (isMobileLayout()) openThemePicker();
      else controller.open("theme");
    },
    resolveDesktopShortcutAction(shortcut) {
      return desktopShortcutActionMap.get(normalizeShortcutDefinition(shortcut)) || "";
    },
    setFeedback(message, tone = "info") {
      view.setFeedback?.(message, tone);
    },
    setTerminalFontSize(size) {
      const next = normalizeTerminalFontSize(size);
      if (next === snapshot.terminalFontSize) return;
      const previous = snapshot.terminalFontSize;
      snapshot = cloneSettingsSnapshot({ ...snapshot, terminalFontSize: next });
      persistLocal(`${storagePrefix}.fontSizeVersion`, "2");
      persistLocal(`${storagePrefix}.fontSize`, next);
      onTerminalFontSizeChange(next, previous);
      showToast(`字号 ${next}px`);
    },
    start() {
      if (started || disposed) return;
      started = true;
      controllerGeneration += 1;
      lifecycle = lifecycleFactory({
        windowObject,
        documentObject,
        elements: view.elements,
        handlers,
      });
      lifecycle.start?.();
      rebuildDesktopShortcutActionMap();
      syncView();
      notifyChanges(snapshot, snapshot, { force: true });
      onTerminalFontSizeChange(snapshot.terminalFontSize, snapshot.terminalFontSize);
      onForcePCModeChange(snapshot.forcePCModeEnabled);
      initializeClientSettingsEntry();
    },
    syncDebugModeDependents() {
      syncDebugControls();
      view.syncToggles?.(snapshot, { debugMode: isDebugModeEnabled() });
      onDebugModeDependents(isDebugModeEnabled());
      onForcePCModeChange(snapshot.forcePCModeEnabled);
    },
  };

  return controller;
}

export {
  BACKTAB_SEQUENCE,
  applyStickyModifierInput,
  applyStickyShiftInput,
  canApplyStickyModifierInput,
  getShortcutKeyFromEvent,
  isNativePasteShortcutEvent,
  isShiftInsertPasteShortcutEvent,
  normalizeMobileShortcutTextData,
  normalizeShortcutInputModifiers,
  resolveMobileShortcutInputData,
  shortcutKeyFromEventCode,
};
