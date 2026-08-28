import { FitAddon, Terminal, init as initGhostty } from "./ghostty-web.js";
import { isKittyGraphicsResponse, installKittyGraphicsSupport, terminalPixelSize } from "./kitty_graphics.js";
import {
  installClaudeFullscreenContextMenuAdapter,
  isClaudeFullscreenContextMenuCandidate,
} from "./claude_fullscreen_context_menu_adapter.js";
import {
  installClaudeFullscreenDesktopSelectionAdapter,
  isClaudeFullscreenDesktopSelectionCandidate,
} from "./claude_fullscreen_desktop_selection_adapter.js";
import { isClaudeFullscreenTouchCandidate } from "./claude_fullscreen_touch.js";
import { installClaudeFullscreenTouchAdapter } from "./claude_fullscreen_touch_adapter.js";
import { isOpencodeFullscreenTouchCandidate } from "./opencode_fullscreen_touch.js";
import { installOpencodeFullscreenTouchAdapter } from "./opencode_fullscreen_touch_adapter.js";
import { isHerdrFullscreenTouchCandidate } from "./herdr_fullscreen_touch.js";
import { installHerdrFullscreenTouchAdapter } from "./herdr_fullscreen_touch_adapter.js";
import { isPiFullscreenTouchCandidate } from "./pi_fullscreen_touch.js";
import { installPiFullscreenTouchAdapter } from "./pi_fullscreen_touch_adapter.js";
import { createPerformanceTaskMonitor } from "./performance_tasks.js";
import { createInstancesLoader } from "./instances_loader.js";
import { createTerminalCacheV2 } from "./terminal_cache_v2.js";
import { decodeFastBinaryFrame } from "./terminal_fast_integrity.js";
import { TerminalReplayController } from "./terminal_replay_controller.js";
import { TerminalResizeController } from "./terminal_resize_controller.js";
import { terminalCheckpointCapabilitiesForTerminal } from "./terminal_checkpoint.js";
import { createRenderSnapshot, RenderSnapshot } from "./terminal_render_snapshot.js";
import { TerminalOverviewPreviewController } from "./terminal_overview_preview.js";
import { createTerminalHistoryCache } from "./terminal_history_cache.js";
import {
  shouldSendTerminalSize,
  terminalSizeDiffersFromServer,
} from "./terminal_size_sync.js";
import { createTerminalResizeScheduler } from "./terminal_resize_scheduler.js";
import { createTerminalConnectionScheduler } from "./terminal_connection_scheduler.js";
import { createTabActivationScheduler } from "./tab_activation_scheduler.js";
import { createTerminalLongScreenshot } from "./terminal_long_screenshot.js";
import { createTerminalUnifiedConnection } from "./terminal_unified_connection.js";
import { createTerminalUnifiedHealthWatchdog } from "./terminal_unified_health.js";
import { createTerminalUnifiedMembership } from "./terminal_unified_membership.js";
import {
  isIndependentClient,
  openConfigurationPage,
} from "./vendor/lzc-mobile-bridge-0.0.2.js";

installKittyGraphicsSupport(Terminal);

const runtimeAssetURL = (path) => new URL(path, import.meta.url).toString();
const params = new URLSearchParams(window.location.search);
const workspaceRestoreStorageKey = "webshell.workspaceRestore";
const workspaceRestoreDisabled = (searchParams) => (
  String(searchParams?.get("last") || "").trim().toLowerCase() === "false"
);

const readWorkspaceRestoreState = () => {
  try {
    const raw = window.localStorage.getItem(workspaceRestoreStorageKey);
    const state = raw ? JSON.parse(raw) : null;
    const name = String(state?.name || "").trim();
    const tabId = String(state?.tabId || "").trim();
    const restoreURL = String(state?.url || "").trim();
    if (restoreURL && workspaceRestoreDisabled(new URL(restoreURL, window.location.origin).searchParams)) {
      window.localStorage.removeItem(workspaceRestoreStorageKey);
      return null;
    }
    if (!name) {
      window.localStorage.removeItem(workspaceRestoreStorageKey);
      return null;
    }
    return { name, tabId };
  } catch (error) {
    return null;
  }
};

const persistWorkspaceRestoreState = (name, tabId) => {
  const targetName = String(name || "").trim();
  if (!targetName) {
    return;
  }
  try {
    const targetURL = new URL(window.location.href);
    if (workspaceRestoreDisabled(targetURL.searchParams)) {
      return;
    }
    targetURL.searchParams.delete("view");
    targetURL.searchParams.delete("embed");
    targetURL.searchParams.delete("last");
    targetURL.searchParams.set("name", targetName);
    const targetTabId = String(tabId || "").trim();
    if (targetTabId) {
      targetURL.searchParams.set("tab", targetTabId);
    } else {
      targetURL.searchParams.delete("tab");
    }
    window.localStorage.setItem(workspaceRestoreStorageKey, JSON.stringify({
      version: 1,
      name: targetName,
      tabId: targetTabId,
      url: `${targetURL.pathname}${targetURL.search}${targetURL.hash}`,
      updatedAt: Date.now(),
    }));
  } catch (error) {
  }
};

const clearWorkspaceRestoreState = () => {
  try {
    window.localStorage.removeItem(workspaceRestoreStorageKey);
  } catch (error) {
  }
};

const restoreInitialWorkspaceLocation = () => {
  const state = readWorkspaceRestoreState();
  if (!state) {
    return;
  }
  const requestedName = (params.get("target") || params.get("name") || "").trim();
  let changed = false;
  if (!requestedName) {
    params.set("name", state.name);
    changed = true;
  }
  if (!params.get("tab") && (!requestedName || requestedName === state.name) && state.tabId) {
    params.set("tab", state.tabId);
    changed = true;
  }
  if (!changed) {
    return;
  }
  params.delete("view");
  const nextURL = new URL(window.location.href);
  nextURL.search = params.toString();
  window.history.replaceState(window.history.state, "", nextURL);
};

restoreInitialWorkspaceLocation();
const isEmbedMode = params.has("embed");
document.body?.classList.toggle("is-embed-mode", isEmbedMode);
const webShellStartupNow = () => (
  typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now()
);
const webShellStartupMetrics = {
  navigationStartedAt: 0,
  moduleStartedAt: webShellStartupNow(),
  ghosttyReadyAt: 0,
  themeReadyAt: 0,
  settingsReadyAt: 0,
  instancesReadyAt: 0,
  workspaceRequestStartedAt: 0,
  workspaceReadyAt: 0,
  workspaceAppliedAt: 0,
};
const markWebShellStartupMetric = (key) => {
  if (Object.prototype.hasOwnProperty.call(webShellStartupMetrics, key) && !webShellStartupMetrics[key]) {
    webShellStartupMetrics[key] = webShellStartupNow();
  }
};
const ghosttyInitPromise = initGhostty(runtimeAssetURL("./ghostty-vt.wasm")).then(() => {
  markWebShellStartupMetric("ghosttyReadyAt");
  globalThis.__webshellStartupTrace?.("Ghostty WASM 已就绪");
});

(async () => {
  const tabsEl = document.getElementById("tabs");
  const newTabButton = document.getElementById("newTab");
  const tabOverviewToggle = document.getElementById("tabOverviewToggle");
  const tabOverview = document.getElementById("tabOverview");
  const tabOverviewGrid = document.getElementById("tabOverviewGrid");
  const tabOverviewClose = document.getElementById("tabOverviewClose");
  const tabOverviewNewTab = document.getElementById("tabOverviewNewTab");
  const mobileActiveTabTitle = document.getElementById("mobileActiveTabTitle");
  const terminalArea = document.getElementById("terminalArea");
  const emptyState = document.getElementById("emptyState");
  const emptyStateAction = document.getElementById("emptyStateAction");
  let performanceMeter = null;
  let performanceMeterFps = null;
  let performanceMeterRefresh = null;
  const performanceTaskMeter = document.getElementById("performanceTaskMeter");
  const performanceTaskMeterList = document.getElementById("performanceTaskMeterList");
  const debugLogPanel = document.getElementById("debugLogPanel");
  const debugLogList = document.getElementById("debugLogList");
  const debugLogCopy = document.getElementById("debugLogCopy");
  const debugLogClear = document.getElementById("debugLogClear");
  const terminalNetworkMonitorPanel = document.getElementById("terminalNetworkMonitor");
  const terminalNetworkMonitorStatus = document.getElementById("terminalNetworkMonitorStatus");
  const terminalNetworkMonitorChannels = document.getElementById("terminalNetworkMonitorChannels");
  const terminalNetworkMonitorRate = document.getElementById("terminalNetworkMonitorRate");
  const terminalNetworkMonitorRateDetail = document.getElementById("terminalNetworkMonitorRateDetail");
  const terminalNetworkMonitorUsage = document.getElementById("terminalNetworkMonitorUsage");
  const terminalNetworkMonitorUsageDetail = document.getElementById("terminalNetworkMonitorUsageDetail");
  const startupErrorPanel = document.getElementById("startupErrorPanel");
  const startupErrorText = document.getElementById("startupErrorText");
  const instanceSwitcher = document.getElementById("instanceSwitcher");
  const instanceSwitcherButton = document.getElementById("instanceSwitcherButton");
  const instanceSwitcherPanel = document.getElementById("instanceSwitcherPanel");
  const instanceSwitcherList = document.getElementById("instanceSwitcherList");
  const instanceSwitcherFeedback = document.getElementById("instanceSwitcherFeedback");
  const homeMenuButton = document.getElementById("homeMenuButton");
  const settingsMenuButton = document.getElementById("settingsMenuButton");
  const clientSettingsMenuButton = document.getElementById("clientSettingsMenuButton");
  const themePickerBackdrop = document.getElementById("themePickerBackdrop");
  const themePickerClose = document.getElementById("themePickerClose");
  const themePickerList = document.getElementById("themePickerList");
  const themePickerScrollbarSensor = document.getElementById("themePickerScrollbarSensor");
  const themePickerScrollbarTrack = document.getElementById("themePickerScrollbarTrack");
  const themePickerScrollbarThumb = document.getElementById("themePickerScrollbarThumb");
  const settingsBackdrop = document.getElementById("settingsBackdrop");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsTitle = document.getElementById("settingsTitle");
  const settingsBack = document.getElementById("settingsBack");
  const settingsClose = document.getElementById("settingsClose");
  const settingsMobileNav = document.getElementById("settingsMobileNav");
  const settingsFontUploadButton = document.getElementById("settingsFontUploadButton");
  const settingsFontEditButton = document.getElementById("settingsFontEditButton");
  const settingsFontEditButtonHTML = settingsFontEditButton?.innerHTML || "";
  const settingsFontDeleteSelectedButton = document.getElementById("settingsFontDeleteSelectedButton");
  const settingsFontCards = document.getElementById("settingsFontCards");
  const settingsFontInput = document.getElementById("settingsFontInput");
  const settingsLineHeightInput = document.getElementById("settingsLineHeightInput");
  const settingsLineHeightResetButton = document.getElementById("settingsLineHeightResetButton");
  const settingsScrollbackInput = document.getElementById("settingsScrollbackInput");
  const settingsScrollbackResetButton = document.getElementById("settingsScrollbackResetButton");
  const settingsDebugModeToggle = document.getElementById("settingsDebugModeToggle");
  const settingsDebugLogToggle = document.getElementById("settingsDebugLogToggle");
  const settingsNetworkMonitorToggle = document.getElementById("settingsNetworkMonitorToggle");
  const settingsDebugOptions = document.getElementById("settingsDebugOptions");
  const settingsOnlineDevicesButton = document.getElementById("settingsOnlineDevicesButton");
  const settingsPerformanceMeterToggle = document.getElementById("settingsPerformanceMeterToggle");
  const settingsPerformanceTasksToggle = document.getElementById("settingsPerformanceTasksToggle");
  const settingsMobileRemoteDesktopToggle = document.getElementById("settingsMobileRemoteDesktopToggle");
  const settingsForcePCModeToggle = document.getElementById("settingsForcePCModeToggle");
  const settingsDesktopMouseClipboardToggle = document.getElementById("settingsDesktopMouseClipboardToggle");
  const settingsDesktopShortcutsBarToggle = document.getElementById("settingsDesktopShortcutsBarToggle");
  const settingsMobilePixelScrollToggle = document.getElementById("settingsMobilePixelScrollToggle");
  const settingsMobileDoubleTapReminderToggle = document.getElementById("settingsMobileDoubleTapReminderToggle");
  const settingsMobileShortcutAddButton = document.getElementById("settingsMobileShortcutAddButton");
  const settingsMobileShortcutResetButton = document.getElementById("settingsMobileShortcutResetButton");
  const settingsMobileShortcutList = document.getElementById("settingsMobileShortcutList");
  const settingsDesktopShortcutAddButton = document.getElementById("settingsDesktopShortcutAddButton");
  const settingsDesktopShortcutResetButton = document.getElementById("settingsDesktopShortcutResetButton");
  const settingsDesktopShortcutList = document.getElementById("settingsDesktopShortcutList");
  const serviceForwardAddButton = document.getElementById("serviceForwardAddButton");
  const serviceForwardStatus = document.getElementById("serviceForwardStatus");
  const serviceForwardList = document.getElementById("serviceForwardList");
  const serviceForwardEditor = document.getElementById("serviceForwardEditor");
  const serviceForwardEditorScrim = document.getElementById("serviceForwardEditorScrim");
  const serviceForwardForm = document.getElementById("serviceForwardForm");
  const serviceForwardFormTitle = document.getElementById("serviceForwardFormTitle");
  const serviceForwardProtocolInput = document.getElementById("serviceForwardProtocolInput");
  const serviceForwardHostInput = document.getElementById("serviceForwardHostInput");
  const serviceForwardPortInput = document.getElementById("serviceForwardPortInput");
  const serviceForwardPortStepUp = document.getElementById("serviceForwardPortStepUp");
  const serviceForwardPortStepDown = document.getElementById("serviceForwardPortStepDown");
  const serviceForwardPathInput = document.getElementById("serviceForwardPathInput");
  const serviceForwardTitleInput = document.getElementById("serviceForwardTitleInput");
  const serviceForwardSubdomainInput = document.getElementById("serviceForwardSubdomainInput");
  const serviceForwardIconInput = document.getElementById("serviceForwardIconInput");
  const serviceForwardSkipAuthInput = document.getElementById("serviceForwardSkipAuthInput");
  const serviceForwardDeleteButton = document.getElementById("serviceForwardDeleteButton");
  const serviceForwardCancelButton = document.getElementById("serviceForwardCancelButton");
  const serviceForwardSubmitButton = document.getElementById("serviceForwardSubmitButton");
  const mobileShortcutEditor = document.getElementById("mobileShortcutEditor");
  const mobileShortcutEditorScrim = document.getElementById("mobileShortcutEditorScrim");
  const mobileShortcutEditorPanel = document.getElementById("mobileShortcutEditorPanel");
  const mobileShortcutEditorTitle = document.getElementById("mobileShortcutEditorTitle");
  const mobileShortcutLabelInput = document.getElementById("mobileShortcutLabelInput");
  const mobileShortcutTypeInputs = Array.from(document.querySelectorAll('input[name="mobileShortcutType"]'));
  const mobileShortcutKeyField = document.getElementById("mobileShortcutKeyField");
  const mobileShortcutKeySelect = document.getElementById("mobileShortcutKeySelect");
  const mobileShortcutCustomKeyField = document.getElementById("mobileShortcutCustomKeyField");
  const mobileShortcutCustomKeyInput = document.getElementById("mobileShortcutCustomKeyInput");
  const mobileShortcutModifiersField = document.getElementById("mobileShortcutModifiersField");
  const mobileShortcutCtrlInput = document.getElementById("mobileShortcutCtrlInput");
  const mobileShortcutAltInput = document.getElementById("mobileShortcutAltInput");
  const mobileShortcutShiftInput = document.getElementById("mobileShortcutShiftInput");
  const mobileShortcutActionField = document.getElementById("mobileShortcutActionField");
  const mobileShortcutActionSelect = document.getElementById("mobileShortcutActionSelect");
  const mobileShortcutTextField = document.getElementById("mobileShortcutTextField");
  const mobileShortcutTextInput = document.getElementById("mobileShortcutTextInput");
  const mobileShortcutEditorCancel = document.getElementById("mobileShortcutEditorCancel");
  const mobileShortcutEditorDelete = document.getElementById("mobileShortcutEditorDelete");
  const desktopShortcutEditor = document.getElementById("desktopShortcutEditor");
  const desktopShortcutEditorScrim = document.getElementById("desktopShortcutEditorScrim");
  const desktopShortcutEditorPanel = document.getElementById("desktopShortcutEditorPanel");
  const desktopShortcutEditorTitle = document.getElementById("desktopShortcutEditorTitle");
  const desktopShortcutLabelInput = document.getElementById("desktopShortcutLabelInput");
  const desktopShortcutActionSelect = document.getElementById("desktopShortcutActionSelect");
  const desktopShortcutCaptureInput = document.getElementById("desktopShortcutCaptureInput");
  const desktopShortcutCtrlInput = document.getElementById("desktopShortcutCtrlInput");
  const desktopShortcutAltInput = document.getElementById("desktopShortcutAltInput");
  const desktopShortcutShiftInput = document.getElementById("desktopShortcutShiftInput");
  const desktopShortcutCommandInput = document.getElementById("desktopShortcutCommandInput");
  const desktopShortcutKeySelect = document.getElementById("desktopShortcutKeySelect");
  const desktopShortcutEditorCancel = document.getElementById("desktopShortcutEditorCancel");
  const desktopShortcutEditorDelete = document.getElementById("desktopShortcutEditorDelete");
  const settingsThemePanel = document.getElementById("settingsPanelTheme");
  const settingsMobileShortcutsPanel = document.getElementById("settingsPanelMobileShortcuts");
  const settingsDesktopShortcutsPanel = document.getElementById("settingsPanelDesktopShortcuts");
  const settingsThemeList = document.getElementById("settingsThemeList");
  const settingsFeedback = document.getElementById("settingsFeedback");
  const settingsTabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
  const settingsTabPanels = Array.from(document.querySelectorAll("[data-settings-panel]"));
  const deviceBackdrop = document.getElementById("deviceBackdrop");
  const deviceBack = document.getElementById("deviceBack");
  const deviceClose = document.getElementById("deviceClose");
  const deviceList = document.getElementById("deviceList");
  const deviceFeedback = document.getElementById("deviceFeedback");
  const searchPanel = document.getElementById("searchPanel");
  const searchInput = document.getElementById("searchInput");
  const searchCount = document.getElementById("searchCount");
  const searchPrevious = document.getElementById("searchPrevious");
  const searchNext = document.getElementById("searchNext");
  const searchClose = document.getElementById("searchClose");
  const attachmentToggle = document.getElementById("attachmentToggle");
  const attachmentBackdrop = document.getElementById("attachmentBackdrop");
  const attachmentClose = document.getElementById("attachmentClose");
  const attachmentClipboard = document.getElementById("attachmentClipboard");
  const attachmentFile = document.getElementById("attachmentFile");
  const attachmentDownload = document.getElementById("attachmentDownload");
  const attachmentBrowserBackdrop = document.getElementById("attachmentBrowserBackdrop");
  const attachmentBrowserBack = document.getElementById("attachmentBrowserBack");
  const attachmentBrowserClose = document.getElementById("attachmentBrowserClose");
  const attachmentBrowserPath = document.getElementById("attachmentBrowserPath");
  const attachmentBrowserBreadcrumbs = document.getElementById("attachmentBrowserBreadcrumbs");
  const attachmentBrowserSortbar = document.getElementById("attachmentBrowserSortbar");
  const attachmentBrowserSortButtons = Array.from(document.querySelectorAll("[data-attachment-sort-key]"));
  const attachmentBrowserFeedback = document.getElementById("attachmentBrowserFeedback");
  const attachmentBrowserList = document.getElementById("attachmentBrowserList");
  const attachmentBrowserCancel = document.getElementById("attachmentBrowserCancel");
  const attachmentBrowserDownload = document.getElementById("attachmentBrowserDownload");
  const attachmentFileInput = document.getElementById("attachmentFileInput");
  const dialogBackdrop = document.getElementById("dialogBackdrop");
  const dialogPanel = document.getElementById("dialogPanel");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogMessage = document.getElementById("dialogMessage");
  const dialogInput = document.getElementById("dialogInput");
  const dialogCancel = document.getElementById("dialogCancel");
  const dialogOK = document.getElementById("dialogOK");
  const mobileShortcuts = document.getElementById("mobileShortcuts");
  const mobileShortcutRows = Array.from(mobileShortcuts?.querySelectorAll("[data-mobile-shortcut-row]") || []);
  const mobileActionSheet = document.getElementById("mobileActionSheet");
  const mobileActionSheetScrim = document.getElementById("mobileActionSheetScrim");
  const mobileActionSheetHandle = document.getElementById("mobileActionSheetHandle");
  const mobileActionGrid = document.getElementById("mobileActionGrid");
  const mobileCloseConfirmSheet = document.getElementById("mobileCloseConfirmSheet");
  const mobileCloseConfirmScrim = document.getElementById("mobileCloseConfirmScrim");
  const mobileCloseConfirmHandle = document.getElementById("mobileCloseConfirmHandle");
  const mobileCloseConfirmTitle = document.getElementById("mobileCloseConfirmTitle");
  const mobileCloseConfirmMessage = document.getElementById("mobileCloseConfirmMessage");
  const mobileCloseConfirmActions = document.getElementById("mobileCloseConfirmActions");
  const mobileCloseConfirmCancel = document.getElementById("mobileCloseConfirmCancel");
  const mobileCloseConfirmOK = document.getElementById("mobileCloseConfirmOK");
  const selectionSheet = document.getElementById("selectionSheet");
  const networkBanner = document.getElementById("networkBanner");
  const contextMenu = document.getElementById("contextMenu");
  const toast = document.getElementById("toast");

  if (!tabsEl || !terminalArea) {
    throw new Error("webshell host not found");
  }

  const tabs = new Map();
  const mobileKeyboardClaimedTouchEnds = new WeakSet();
  const storagePrefix = "webshell";
  const themeStorageKey = `${storagePrefix}.theme`;
  const fontSizeStorageKey = `${storagePrefix}.fontSize`;
  const fontSizeVersionStorageKey = `${storagePrefix}.fontSizeVersion`;
  const fontSizeStorageVersion = "2";
  const lastTabStorageKey = (name) => `${storagePrefix}.lastTab.${name || "default"}`;
  const recentTabsStorageKey = (name) => `${storagePrefix}.recentTabs.${name || "default"}`;
  const restartTabStorageKey = `${storagePrefix}.restartTab`;
  const touchShortcutFeedbackStorageKey = `${storagePrefix}.touchShortcutFeedback`;
  const debugModeStorageKey = `${storagePrefix}.debugMode`;
  const debugLogStorageKey = `${storagePrefix}.debugLog`;
  const networkMonitorStorageKey = `${storagePrefix}.networkMonitor`;
  const performanceMeterStorageKey = `${storagePrefix}.performanceMeter`;
  const performanceTasksStorageKey = `${storagePrefix}.performanceTasks`;
  const forcePCModeStorageKey = `${storagePrefix}.forcePCMode`;
  const mobileRemoteDesktopStorageKey = "lightos-mobile-remote-desktop-enabled";
  const defaultFontSize = 16;
  const minFontSize = 10;
  const maxFontSize = 32;
  const defaultTerminalScrollback = 1000;
  const minTerminalScrollback = 100;
  const maxTerminalScrollback = 100000;
  const defaultTerminalLineHeightPercent = 100;
  const minTerminalLineHeightPercent = 100;
  const maxTerminalLineHeightPercent = 160;
  const terminalViewportBottomEpsilon = 1;
  const defaultTerminalFontFamily = '"DejaVu Sans Mono", "Liberation Mono", monospace';
  const touchShortcutMoveThresholdPx = 8;
  const touchShortcutRepeatInitialDelayMs = 320;
  const touchShortcutRepeatIntervalMs = 80;
  const touchSelectionMoveThresholdPx = 7;
  const touchSelectionLongPressDelayMs = 450;
  const touchContextMenuSuppressWindowMs = 1400;
  const touchContextMenuSuppressDistancePx = 32;
  const mobileSelectionAutoScrollEdgePx = 34;
  const mobileSelectionAutoScrollIntervalMs = 50;
  const mobileSelectionAutoScrollMaxLines = 4;
  const mobileKeyboardDoubleTapDelayMs = 320;
  const mobileKeyboardFocusAllowWindowMs = 600;
  const mobileKeyboardFocusPrompt = "双击屏幕开启键盘输入";
  const mobileKeyboardInsetThresholdPx = 80;
  const mobileKeyboardDockMoveSettleMs = 260;
  const mobileKeyboardResizeSettleMs = mobileKeyboardDockMoveSettleMs + 140;
  const mobileKeyboardDismissRecoveryDelays = [0, 80, 180, 360, 720, 1200];
  const mobileOrientationViewportRecoveryDelays = [0, 80, 180, 360, 720];
  const mobileOrientationFinalSettleMs = 900;
  const desktopSelectionCopyMoveThresholdPx = 4;
  const terminalSizeReassertIntervalMs = 250;
  const terminalSizeClaimIntervalMs = 250;
  const terminalInputChunkChars = 16 * 1024;
  const terminalInputFlushDelayMs = 8;
  const terminalInteractiveInputImmediateMaxBytes = 256;
  const terminalCursorBlinkHoldMs = 700;
  const terminalInputPumpChunkBudget = 4;
  const terminalInputBackpressureBytes = 512 * 1024;
  const terminalInputBackpressureDelayMs = 16;
  const maxBufferedInputBytes = 64 * 1024;
  const maxPendingInputBytes = 8 * 1024 * 1024;
  const maxParkedPendingInputBytes = 256 * 1024;
  const terminalPendingInputMaxWaitMs = 10 * 1000;
  const maxQueuedInputBytes = 16 * 1024 * 1024;
  const terminalWebSocketPingIntervalMs = 10 * 1000;
  const terminalUnifiedHealthCheckIntervalMs = 4 * 1000;
  const terminalUnifiedPongTimeoutMs = 12 * 1000;
  const terminalUnifiedTransitionTimeoutMs = 12 * 1000;
  const terminalWebSocketConnectTimeoutMs = 12 * 1000;
  const terminalClientDirectWebSocketCapacity = 3;
  const terminalConnectionInteractionPriorityMs = 1200;
  const terminalUnifiedPaneRetryBaseDelayMs = 500;
  const terminalUnifiedPaneRetryMaxDelayMs = 10 * 1000;
  const deviceHeartbeatIntervalMs = 1500;
  const deviceListRefreshIntervalMs = 500;
  const terminalWebSocketHealthTimeoutMs = 25 * 1000;
  const terminalResumeProbeTimeoutMs = 1500;
  const terminalUserRecoveryThrottleMs = 1500;
  const terminalAttachReadyTimeoutMs = 8 * 1000;
  const terminalAgentPrepareTimeoutMs = 45 * 1000;
  const terminalReconnectBaseDelayMs = 500;
  const terminalReconnectMaxDelayMs = 10 * 1000;
  const terminalReconnectJitterRatio = 0.2;
  const workspaceRefreshRetryBaseDelayMs = 500;
  const workspaceRefreshRetryMaxDelayMs = 15 * 1000;
  const workspaceRefreshRetryJitterRatio = 0.2;
  const terminalOutputFlushFallbackMs = 32;
  const terminalOutputFlushBudgetBytes = 128 * 1024;
  const terminalOutputFlushMaxEntries = 8;
  const terminalOutputFlushTimeBudgetMs = 12;
  const terminalResizeOutputFlushBudgetBytes = 64 * 1024;
  const terminalReplayWriteBatchBytes = 512 * 1024;
  const terminalResizeThrottleMs = 80;
  const terminalResizeSettleMs = 120;
  const terminalResizeOutputQuietMs = 120;
  const terminalResizeOutputMaxHoldMs = 800;
  // Presentation recovery is event-driven. These short delays only cover a
  // layout frame that has not settled yet; they must not become a one-second
  // tab-switch spinner or replace resize ACK handling.
  const terminalFullRenderValidationMs = 32;
  const terminalPresentationResizeRetryMs = 1200;
  const terminalReplayFailureLimit = 3;
  const terminalReplayCheckpointDelayMs = 48;
  const terminalPresentationValidationMaxMs = 250;
  const terminalOutputQueueSoftLimitBytes = 1 * 1024 * 1024;
  const terminalOutputMeasureChunkChars = 32 * 1024;
  const terminalOutputMeasureBuffer = new Uint8Array(terminalOutputMeasureChunkChars * 4);
  const terminalHistoryCacheFlushBytes = 256 * 1024;
  const terminalCacheV2FlushBytes = 1 * 1024 * 1024;
  const terminalHistoryCacheFlushDelayMs = 50;
  const terminalCacheV2FlushDelayMs = 1000;
  const terminalCacheV2PreviewDelayMs = 3000;
  const terminalCacheV2PreviewRefreshMs = 2000;
  const terminalHistoryCacheOrphanTTL = 30 * 1000;
  const terminalCacheV2TouchIntervalMs = 5 * 60 * 1000;
  const terminalCacheV2ManifestTimeoutMs = 1500;
  const terminalCacheV2PreviewTimeoutMs = 3000;
  const terminalCacheV2ReplayTimeoutMs = 2 * 1000;
  const terminalCacheV2CommitTimeoutMs = 3000;
  const terminalCacheV2CompactionMinChunks = 2;
  const terminalCacheV2CompactionTargetBytes = 1 * 1024 * 1024;
  const averageTerminalHistoryBytesPerLine = 350;
  const performanceMeterSampleMs = 500;
  const performanceMeterWarmupFrames = 12;
  const performanceTaskPanelLimit = 10;
  const debugLogEntryLimit = 200;
  const debugLogDedupWindowMs = 5000;
  const terminalNetworkMonitorSampleMs = 1000;
  const performanceTaskAlertThresholds = {
    count: 120,
    avgMs: 16,
    maxMs: 50,
    totalMs: 200,
  };
  const performanceTaskAlertThresholdsByName = {
    "device heartbeat": {
      count: 10,
      avgMs: 250,
      maxMs: 1000,
      totalMs: 2000,
    },
  };
  const deviceHeartbeatTimeoutMs = 5000;
  const terminalPixelScrollOffsetEpsilon = 0.001;
  const terminalMouseLegacyCoordinateLimit = 95;
  const maxQueuedTerminalOutputBytes = 4 * 1024 * 1024;
  const terminalHistoryCache = createTerminalHistoryCache({ orphanTTL: terminalHistoryCacheOrphanTTL });
  const activityPollIntervalMs = 4000;
  const maxAttachmentUploadBytes = 2 * 1024 * 1024 * 1024;
  const maxAttachmentUploadCount = 32;
  const mobileLayoutQuery = window.matchMedia?.("(max-width: 640px)");
  const touchShortcutLayoutQuery = window.matchMedia?.("(hover: none), (pointer: coarse)");
  const themeCardWidth = 280;
  const themeCardHeight = 60;
  const themeCardCornerRadius = 5;
  const themeCardOuterPadding = 10;
  const themeCardContentInset = 8;
  const themeCardPreviewLineY = 20;
  const themeCardNameLineY = 40;
  const themeCardBackgroundAlpha = 0.8;
  const themePickerScrollbarMinThumbPx = 100;
  const contextPaneActions = new Set(["copy", "paste", "select-all", "search", "capture-long-screenshot", "split-vertical", "split-horizontal", "move-pane-new-tab", "close-pane"]);
  const contextTabActions = new Set(["rename-tab", "move-tab-first", "move-tab-left", "move-tab-right", "move-tab-last", "close-other-tabs", "close-tab"]);
  const contextLinkActions = new Set(["open-link", "copy-link"]);
  const storedFontSize = window.localStorage.getItem(fontSizeVersionStorageKey) === fontSizeStorageVersion
    ? Number(window.localStorage.getItem(fontSizeStorageKey))
    : NaN;
  let terminalFontSize = Number.isFinite(storedFontSize) ? Math.max(minFontSize, Math.min(maxFontSize, storedFontSize)) : defaultFontSize;
  let terminalLineHeightPercent = defaultTerminalLineHeightPercent;
  const terminalOptionsBase = {
    cursorBlink: false,
    convertEol: true,
    scrollback: defaultTerminalScrollback,
    fontFamily: defaultTerminalFontFamily,
    fontSize: terminalFontSize,
  };
  let themes = [
    {
      id: "default",
      name: "Default",
      accent: "#2ca7f8",
      background: "#000000",
      foreground: "#00cd00",
      xterm: {
        background: "#000000",
        foreground: "#00cd00",
        cursor: "#2ca7f8",
        selectionBackground: "rgba(44, 167, 248, 0.28)",
        selectionForeground: "#ffffff",
        black: "#000000",
        red: "#cd0000",
        green: "#00cd00",
        yellow: "#cdcd00",
        blue: "#1e90ff",
        magenta: "#cd00cd",
        cyan: "#00cdcd",
        white: "#e5e5e5",
        brightBlack: "#7f7f7f",
        brightRed: "#ff0000",
        brightGreen: "#00ff00",
        brightYellow: "#ffff00",
        brightBlue: "#5c9cff",
        brightMagenta: "#ff00ff",
        brightCyan: "#00ffff",
        brightWhite: "#ffffff",
      },
    },
    {
      id: "one-dark",
      name: "One Dark",
      accent: "#21937d",
      background: "#1e2127",
      foreground: "#abb2bf",
      xterm: {
        background: "#1e2127",
        foreground: "#abb2bf",
        cursor: "#21937d",
        selectionBackground: "rgba(33, 147, 125, 0.28)",
        selectionForeground: "#ffffff",
        black: "#1e2127",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#d19a66",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#abb2bf",
        brightBlack: "#5c6370",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#e5c07b",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff",
      },
    },
    {
      id: "solarized-dark",
      name: "Solarized Dark",
      accent: "#00c18d",
      background: "#002b36",
      foreground: "#93a1a1",
      xterm: {
        background: "#002b36",
        foreground: "#93a1a1",
        cursor: "#00c18d",
        selectionBackground: "rgba(0, 193, 141, 0.24)",
        selectionForeground: "#fdf6e3",
        black: "#073642",
        red: "#dc322f",
        green: "#859900",
        yellow: "#b58900",
        blue: "#268bd2",
        magenta: "#d33682",
        cyan: "#2aa198",
        white: "#eee8d5",
        brightBlack: "#002b36",
        brightRed: "#cb4b16",
        brightGreen: "#586e75",
        brightYellow: "#657b83",
        brightBlue: "#839496",
        brightMagenta: "#6c71c4",
        brightCyan: "#93a1a1",
        brightWhite: "#fdf6e3",
      },
    },
    {
      id: "solarized-light",
      name: "Solarized Light",
      accent: "#403513",
      background: "#fdf6e3",
      foreground: "#403513",
      xterm: {
        background: "#fdf6e3",
        foreground: "#403513",
        cursor: "#403513",
        selectionBackground: "rgba(64, 53, 19, 0.18)",
        selectionForeground: "#002b36",
        black: "#073642",
        red: "#dc322f",
        green: "#859900",
        yellow: "#b58900",
        blue: "#268bd2",
        magenta: "#d33682",
        cyan: "#2aa198",
        white: "#eee8d5",
        brightBlack: "#002b36",
        brightRed: "#cb4b16",
        brightGreen: "#586e75",
        brightYellow: "#657b83",
        brightBlue: "#839496",
        brightMagenta: "#6c71c4",
        brightCyan: "#93a1a1",
        brightWhite: "#fdf6e3",
      },
    },
    {
      id: "dracula",
      name: "Dracula",
      accent: "#bd93f9",
      background: "#282a36",
      foreground: "#f8f8f2",
      xterm: {
        background: "#282a36",
        foreground: "#f8f8f2",
        cursor: "#bd93f9",
        selectionBackground: "rgba(189, 147, 249, 0.26)",
        selectionForeground: "#ffffff",
        black: "#21222c",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#bd93f9",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
        brightBlack: "#6272a4",
        brightRed: "#ff6e6e",
        brightGreen: "#69ff94",
        brightYellow: "#ffffa5",
        brightBlue: "#d6acff",
        brightMagenta: "#ff92df",
        brightCyan: "#a4ffff",
        brightWhite: "#ffffff",
      },
    },
  ];

  const readTargetNameParam = (sourceParams) => (sourceParams.get("target") || sourceParams.get("name") || "").trim();
  let activeName = readTargetNameParam(params);
  let activeTabId = null;
  const activeTabPersistenceChains = new Map();
  let inlineTabRenameState = null;
  let recentTabIds = [];
  let activeInstanceGeneration = 0;
  let currentInstances = [];
  let disposed = false;
  let terminalConnectionScheduler = null;
  let terminalConnectionSchedulerState = null;
  let terminalConnectionDemandGeneration = 0;
  const terminalUnifiedMembership = createTerminalUnifiedMembership();
  let terminalUnifiedConnection = null;
  let terminalUnifiedTargetName = "";
  let terminalUnifiedHealthWatchdog = null;
  const terminalUnifiedClosedConnections = new WeakSet();
  let terminalUnifiedClosingPromise = null;
  let terminalUnifiedExpectedCloseReason = "";
  let terminalUnifiedSyncScheduled = false;
  let terminalTransportRecoveryScheduled = false;
  let terminalTransportRecoveryRunning = false;
  let terminalTransportRecoveryPendingReason = "";
  let terminalTransportRecoveryRetryTimer = 0;
  let terminalUnifiedChannelGeneration = 0;
  let scheduleTerminalUnifiedSync = () => {};
  let recycleTerminalUnifiedSession = () => false;
  let nextTabSeq = 1;
  let nextPaneSeq = 1;
  const tabActivationScheduler = createTabActivationScheduler();
  let contextTarget = null;
  let lastTerminalTouchContextMenuCandidate = null;
  const terminalLocalMouseClaimedEvents = new WeakSet();
  let toastTimer = 0;
  let activeTheme = themes.find((theme) => theme.id === window.localStorage.getItem(themeStorageKey)) || themes[0];
  let uploadedFonts = [];
  let activeTerminalFontID = "";
  let terminalSymbolFont = null;
  let desktopMouseClipboardEnabled = true;
  let desktopShortcutsBarEnabled = false;
  let mobilePixelScrollEnabled = true;
  let mobileDoubleTapReminderEnabled = true;
  let debugModeEnabled = window.localStorage.getItem(debugModeStorageKey) === "true";
  let debugLogEnabled = window.localStorage.getItem(debugLogStorageKey) === "true";
  let networkMonitorEnabled = window.localStorage.getItem(networkMonitorStorageKey) === "true";
  let terminalUnifiedRefreshPending = false;
  let debugLogEntries = [];
  const debugLogLastSeen = new Map();
  let debugConsoleCaptureCleanup = null;
  let debugWindowErrorCaptureActive = false;
  let terminalNetworkMonitor = null;
  let terminalNetworkMonitorModulePromise = null;
  let terminalNetworkMonitorSampleTimer = 0;
  let terminalNetworkMonitorStartGeneration = 0;
  let lastNetworkBannerState = null;
  let performanceMeterEnabled = window.localStorage.getItem(performanceMeterStorageKey) === "true";
  let performanceTasksEnabled = window.localStorage.getItem(performanceTasksStorageKey) === "true";
  let forcePCModeEnabled = window.localStorage.getItem(forcePCModeStorageKey) === "true";
  let mobileRemoteDesktopEnabled = window.localStorage.getItem(mobileRemoteDesktopStorageKey) === "true";
  let fontEditMode = false;
  const selectedFontDeleteIDs = new Set();
  const registeredFontFaces = new Map();
  let applyingWorkspaceState = false;
  let activityRefreshTimer = 0;
  let activityRefreshDelayTimer = 0;
  let workspaceRefreshRetryTimer = 0;
  let workspaceRefreshRetryAttempts = 0;
  let workspaceRefreshRetryInFlight = false;
  let workspaceRefreshRetryContext = null;
  let tabOverviewCachePreparationScheduled = false;
  let terminalCacheV2OrphanPreviewCleanupScheduled = false;
  let deployRestartDialogOpen = false;
  let currentServerRevision = "";
  let activeWorkspaceCacheV2Identity = null;
  let activeWorkspaceCacheV2Epoch = 0;
  let latestWorkspaceRecoveryMetrics = null;
  let serverRevisionReloadPrompted = false;
  let serverRevisionInitialCheckTimer = 0;
  let serverRevisionInitialCheckScheduled = false;
  let terminalStoragePersistenceRequested = false;
  let deviceHeartbeatTimer = 0;
  let deviceHeartbeatInFlight = null;
  let deviceHeartbeatActive = false;
  let deviceHeartbeatLastError = "";
  let deviceListRefreshTimer = 0;
  let deviceListRequestSeq = 0;
  let deviceListLoading = false;
  let deviceListLoaded = false;
  let deviceListSignature = "";
  let deviceListLastError = "";
  let suppressLocationUpdate = false;
  let suppressBeforeUnloadOnce = false;
  let suppressBeforeUnloadResetTimer = 0;
  let suppressWorkspaceRestoreOnce = false;
  let workspaceRestoreHeartbeatTimer = 0;
  let tabOverviewRenderFrame = 0;
  let tabOverviewDragState = null;
  let tabOverviewSuppressClickUntil = 0;
  let lightOSHomeURL = "";
  let lightOSHomeURLPromise = null;
  let mobileActionSheetIgnoreClicksUntil = 0;
  let mobileCloseConfirmResolve = null;
  let mobileCustomSelectState = null;
  let mobileViewportResizeFrame = 0;
  let mobileOrientationRecoverySeq = 0;
  let mobileOrientationRecoveryTimer = 0;
  let lastMobileViewportOrientation = "";
  let mobileViewportHeight = Math.max(0, Math.round(window.visualViewport?.height || window.innerHeight || 0));
  let mobileViewportReferenceHeight = mobileViewportHeight;
  let mobileKeyboardInsetBottom = 0;
  let mobileClientBottomSafeOffset = 0;
  let mobileKeyboardViewportActive = false;
  let mobileKeyboardResizeSuppressedUntil = 0;
  let mobileKeyboardResizeReleaseTimer = 0;
  let mobileKeyboardDockMoveTimer = 0;
  let mobileKeyboardDismissRecoverySeq = 0;
  let terminalInputViewportLockSession = null;
  let themePickerEdgeSwipe = null;
  let mobileOverviewEdgeSwipe = null;
  let resolvedThemeCardWidth = themeCardWidth;
  let themePickerScrollbarSyncScheduled = false;
  let themePickerScrollbarDragging = false;
  let themePickerScrollbarPointerId = null;
  let themePickerScrollbarThumbPointerOffset = 0;
  let settingsMobileView = "detail";
  let settingsThemeScrollbarHideTimer = 0;
  let settingsMobileShortcutsScrollbarHideTimer = 0;
  let settingsDesktopShortcutsScrollbarHideTimer = 0;
  let settingsLineHeightSaveTimer = 0;
  let settingsLineHeightSaveRequestSeq = 0;
  let settingsScrollbackSaveTimer = 0;
  let settingsScrollbackSaveRequestSeq = 0;
  let settingsDesktopMouseClipboardRequestSeq = 0;
  let settingsDesktopShortcutsBarRequestSeq = 0;
  let settingsMobilePixelScrollRequestSeq = 0;
  let settingsMobileDoubleTapReminderRequestSeq = 0;
  let attachmentBrowserEdgeSwipe = null;
  let mobileShortcutsSaveRequestSeq = 0;
  let mobileShortcutsSaveVersion = 0;
  let mobileShortcutsPersistChain = Promise.resolve();
  let mobileShortcutEditorState = null;
  let mobileShortcutDragState = null;
  let performanceMeterFrame = 0;
  let desktopShortcutsSaveRequestSeq = 0;
  let desktopShortcutsSaveVersion = 0;
  let desktopShortcutsPersistChain = Promise.resolve();
  let desktopShortcutEditorState = null;
  let serviceForwardEntries = [];
  let serviceForwardRequestSeq = 0;
  let serviceForwardEditingID = "";
  let serviceForwardBusy = false;
  let attachmentDialogOpen = false;
  let attachmentBrowserOpen = false;
  let attachmentBrowserCurrentPath = "";
  let attachmentBrowserParentPath = "";
  let attachmentBrowserBreadcrumbPath = "";
  let attachmentBrowserRequestSeq = 0;
  const attachmentBrowserDefaultSort = Object.freeze({ key: "name", direction: "asc" });
  let attachmentBrowserSort = { ...attachmentBrowserDefaultSort };
  let attachmentBrowserEntries = [];
  const attachmentBrowserSelectedPaths = new Set();
  const attachmentBrowserEntriesByPath = new Map();
  let attachmentUploads = new Map();
  let attachmentUploadSeq = 0;
  let pendingAttachmentFileClipboard = null;
  const searchState = { open: false, query: "", matches: [], index: -1, sessionId: "" };
  const mobileSticky = { ctrl: false, alt: false, shift: false };
  let touchShortcutFeedbackEnabled = loadTouchShortcutFeedbackEnabled();
  const textEncoder = new TextEncoder();
  const terminalCacheV2 = createTerminalCacheV2();
  const serverRevisionClientID = loadStableClientID();
  let terminalUserRecoveryLastAt = 0;
  const themePickerSwipeEdgeWidth = 24;
  const themePickerSwipeAxisThreshold = 12;
  const themePickerSwipeCloseDistance = 56;
  const themePickerSwipeMaxVerticalTravel = 40;
  const attachmentBrowserSwipeEdgeWidth = 24;
  const attachmentBrowserSwipeAxisThreshold = 12;
  const attachmentBrowserSwipeBackDistance = 56;
  const attachmentBrowserSwipeMaxVerticalTravel = 40;
  const mobileOverviewSwipeEdgeWidth = 24;
  const mobileOverviewSwipeAxisThreshold = 12;
  const mobileOverviewSwipeNativeBackBlockDistance = 4;
  const mobileOverviewSwipeOpenDistance = 56;
  const mobileOverviewSwipeMaxVerticalTravel = 40;
  const mobileOverviewHistoryGuardStateKey = "webshellMobileOverviewGuard";
  const tabOverviewDragMoveThresholdPx = 8;
  const tabOverviewDragHoldDelayMs = 320;
  const tabOverviewDragAutoScrollEdgePx = 58;
  const tabOverviewDragAutoScrollMaxStepPx = 14;
  // Keep enough invisible text for Android IME Backspace auto-repeat to continue.
  const terminalInputSentinel = "\u200b";
  const terminalInputDeleteBufferLength = 256;
  const terminalInputDeleteBuffer = terminalInputSentinel.repeat(terminalInputDeleteBufferLength);
  const terminalNativeDeleteIdleResetMs = 900;
  const backtabSequence = "\x1b[Z";
  const shiftedCharacterMap = new Map([
    ["`", "~"],
    ["1", "!"],
    ["2", "@"],
    ["3", "#"],
    ["4", "$"],
    ["5", "%"],
    ["6", "^"],
    ["7", "&"],
    ["8", "*"],
    ["9", "("],
    ["0", ")"],
    ["-", "_"],
    ["=", "+"],
    ["[", "{"],
    ["]", "}"],
    ["\\", "|"],
    [";", ":"],
    ["'", "\""],
    [",", "<"],
    [".", ">"],
    ["/", "?"],
  ]);
  const defaultMobileShortcutRowsConfig = [
    [
      { id: "sticky-ctrl", label: "Ctrl+", ariaLabel: "Sticky Control", action: "sticky_ctrl", kind: "modifier" },
      { id: "sticky-alt", label: "Alt+", ariaLabel: "Sticky Alt", action: "sticky_alt", kind: "modifier" },
      { id: "sticky-shift", label: "Shift+", ariaLabel: "Sticky Shift", action: "sticky_shift", kind: "modifier" },
      { id: "tab", label: "Tab", ariaLabel: "Tab", data: "\t", inputKey: "tab" },
      { id: "continue", label: "Continue", ariaLabel: "Continue", text: "continue", data: "continue", kind: "primary" },
      { id: "return", label: "Return", ariaLabel: "Return", data: "\r", inputKey: "enter", kind: "primary" },
      { id: "arrow-up", label: "\u2191", ariaLabel: "Up Arrow", data: "\x1b[A", inputKey: "arrow_up", kind: "nav" },
      { id: "arrow-down", label: "\u2193", ariaLabel: "Down Arrow", data: "\x1b[B", inputKey: "arrow_down", kind: "nav" },
      { id: "arrow-left", label: "\u2190", ariaLabel: "Left Arrow", data: "\x1b[D", inputKey: "arrow_left", kind: "nav" },
      { id: "arrow-right", label: "\u2192", ariaLabel: "Right Arrow", data: "\x1b[C", inputKey: "arrow_right", kind: "nav" },
      { id: "copy", label: "Copy", ariaLabel: "Copy", action: "copy" },
      { id: "paste", label: "Paste", ariaLabel: "Paste", action: "paste" },
      { id: "page-up", label: "PageUp", ariaLabel: "Page Up", action: "page_up" },
      { id: "page-down", label: "PageDown", ariaLabel: "Page Down", action: "page_down" },
    ],
    [
      { id: "mobile-menu", label: "Menu", ariaLabel: "Menu", action: "open_mobile_menu", kind: "menu" },
      { id: "ctrl-e", label: "Ctrl+E", ariaLabel: "Control E", data: "\x05", inputKey: "e", inputModifiers: { ctrl: true } },
      { id: "ctrl-c", label: "Ctrl+C", ariaLabel: "Control C", data: "\x03", inputKey: "c", inputModifiers: { ctrl: true }, kind: "primary" },
      { id: "swap-tab", label: "Swap", ariaLabel: "切换最近两个终端", action: "swap_tab" },
      { id: "shift-tab", label: "Shift+Tab", ariaLabel: "Shift Tab", data: backtabSequence, inputKey: "tab", inputModifiers: { shift: true } },
      { id: "tilde", label: "~", ariaLabel: "Tilde", data: "~", inputKey: "~", kind: "symbol" },
      { id: "slash", label: "/", ariaLabel: "Slash", data: "/", inputKey: "/", kind: "symbol" },
      { id: "dash", label: "-", ariaLabel: "Dash", data: "-", inputKey: "-", kind: "symbol" },
      { id: "dollar", label: "$", ariaLabel: "Dollar Sign", data: "$", inputKey: "$", kind: "symbol" },
      { id: "esc", label: "Esc", ariaLabel: "Escape", data: "\x1b", inputKey: "escape", kind: "primary" },
      { id: "zoom-in", label: "Zoom+", ariaLabel: "Zoom In", action: "zoom_in", kind: "modifier" },
      { id: "zoom-out", label: "Zoom-", ariaLabel: "Zoom Out", action: "zoom_out", kind: "modifier" },
      { id: "home", label: "Home", ariaLabel: "Home", data: "\x1b[H", inputKey: "home" },
      { id: "end", label: "End", ariaLabel: "End", data: "\x1b[F", inputKey: "end" },
      { id: "touch-feedback", label: "Shock On", ariaLabel: "Shock On", action: "toggle_touch_feedback", kind: "feedback" },
    ],
  ];
  let mobileShortcutRowsConfig = cloneMobileShortcutRows(defaultMobileShortcutRowsConfig);
  let lastSavedMobileShortcutRowsConfig = cloneMobileShortcutRows(defaultMobileShortcutRowsConfig);
  const mobileShortcutKeyOptions = [
    { value: "custom", label: "普通字符" },
    { value: "space", label: "Space" },
    { value: "arrow_up", label: "方向键 ↑" },
    { value: "arrow_down", label: "方向键 ↓" },
    { value: "arrow_left", label: "方向键 ←" },
    { value: "arrow_right", label: "方向键 →" },
    { value: "tab", label: "Tab" },
    { value: "enter", label: "Enter" },
    { value: "escape", label: "Esc" },
    { value: "home", label: "Home" },
    { value: "end", label: "End" },
  ];
  const mobileShortcutActionOptions = [
    { value: "sticky_ctrl", label: "Ctrl 粘滞键" },
    { value: "sticky_alt", label: "Alt 粘滞键" },
    { value: "sticky_shift", label: "Shift 粘滞键" },
    { value: "new_tab", label: "新建标签" },
    { value: "close_tab", label: "关闭标签" },
    { value: "rename_tab", label: "重命名标签" },
    { value: "swap_tab", label: "切换最近两个终端" },
    { value: "next_tab", label: "下一个标签" },
    { value: "previous_tab", label: "上一个标签" },
    { value: "vertical_split", label: "左右分屏" },
    { value: "horizontal_split", label: "上下分屏" },
    { value: "tab_overview", label: "总览" },
    { value: "search_terminal", label: "搜索" },
    { value: "attachment", label: "附件" },
    { value: "copy", label: "复制" },
    { value: "paste", label: "粘贴" },
    { value: "page_up", label: "PageUp" },
    { value: "page_down", label: "PageDown" },
    { value: "zoom_in", label: "放大" },
    { value: "zoom_out", label: "缩小" },
    { value: "open_mobile_menu", label: "菜单" },
    { value: "toggle_touch_feedback", label: "触感开关" },
  ];
  const urlPattern = /(?:https?:\/\/|mailto:|ftp:\/\/|ssh:\/\/|git:\/\/|tel:|magnet:|gemini:\/\/|gopher:\/\/|news:)[\w\-.~:\/?#@!$&*+,;=%]+/gi;
  const trailingURLPunctuation = /[.,;!?)\]]+$/;

  const cloneTheme = (theme) => {
    const nextTheme = { ...theme.xterm };
    nextTheme.cursor = nextTheme.foreground;
    return nextTheme;
  };
  const terminalOptions = (overrides = {}) => ({ ...terminalOptionsBase, fontSize: terminalFontSize, theme: cloneTheme(activeTheme), ...overrides });

  const formatPerformanceTaskMs = (value) => {
    const ms = Number(value);
    if (!Number.isFinite(ms)) {
      return "--";
    }
    if (ms >= 100) {
      return `${Math.round(ms)}ms`;
    }
    if (ms >= 10) {
      return `${ms.toFixed(1)}ms`;
    }
    return `${ms.toFixed(2)}ms`;
  };

  const appendPerformanceTaskCell = (row, text, className = "performance-task-value", isAlert = false) => {
    const cell = document.createElement("span");
    cell.className = className;
    if (isAlert) {
      cell.classList.add("is-alert");
    }
    cell.textContent = text;
    row.appendChild(cell);
    return cell;
  };

  const getPerformanceTaskAlertThresholds = (name) => performanceTaskAlertThresholdsByName[name] || performanceTaskAlertThresholds;

  const isPerformanceTaskValueAlert = (name, field, value) => {
    const thresholds = getPerformanceTaskAlertThresholds(name);
    const limit = thresholds?.[field];
    return Number.isFinite(limit) && Number(value) >= limit;
  };

  const renderPerformanceTaskMeter = () => {
    if (!performanceTaskMeterList) {
      return;
    }
    performanceTaskMeterList.textContent = "";
    const rows = performanceTaskMonitor.snapshot({ limit: performanceTaskPanelLimit });
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "performance-task-empty";
      empty.textContent = "暂无采样";
      performanceTaskMeterList.appendChild(empty);
      return;
    }

    const header = document.createElement("div");
    header.className = "performance-task-row header";
    appendPerformanceTaskCell(header, "任务", "performance-task-name");
    appendPerformanceTaskCell(header, "次数");
    appendPerformanceTaskCell(header, "平均");
    appendPerformanceTaskCell(header, "最大");
    appendPerformanceTaskCell(header, "总计");
    performanceTaskMeterList.appendChild(header);

    for (const item of rows) {
      const row = document.createElement("div");
      row.className = "performance-task-row";
      appendPerformanceTaskCell(row, item.name, "performance-task-name");
      appendPerformanceTaskCell(
        row,
        String(item.count),
        "performance-task-value",
        isPerformanceTaskValueAlert(item.name, "count", item.count),
      );
      appendPerformanceTaskCell(
        row,
        formatPerformanceTaskMs(item.avg),
        "performance-task-value",
        isPerformanceTaskValueAlert(item.name, "avgMs", item.avg),
      );
      appendPerformanceTaskCell(
        row,
        formatPerformanceTaskMs(item.max),
        "performance-task-value",
        isPerformanceTaskValueAlert(item.name, "maxMs", item.max),
      );
      appendPerformanceTaskCell(
        row,
        formatPerformanceTaskMs(item.total),
        "performance-task-value",
        isPerformanceTaskValueAlert(item.name, "totalMs", item.total),
      );
      performanceTaskMeterList.appendChild(row);
    }
  };

  const performanceTaskMonitor = createPerformanceTaskMonitor({
    onChange: () => renderPerformanceTaskMeter(),
  });

  const terminalNetworkMonitorStateLabel = (state) => ({
    connecting: "连接中",
    open: "网络正常",
    closing: "正在重试",
    retrying: "正在重试",
    error: "网络异常",
    idle: "未启用",
  })[state] || "未启用";

  const formatTerminalNetworkMB = (bytes) => (Math.max(0, Number(bytes) || 0) / 1_000_000).toFixed(3);

  const emptyTerminalNetworkMonitorState = () => ({
    status: "idle",
    channels: (isClientInstanceName(activeName)
      ? ["直连通道 1", "直连通道 2", "直连通道 3"]
      : []
    ).map((label, index) => ({
      index,
      label,
      state: "idle",
      receivedBytes: 0,
      sentBytes: 0,
      totalBytes: 0,
      receivedBytesPerSecond: 0,
      sentBytesPerSecond: 0,
      bytesPerSecond: 0,
    })),
    receivedBytes: 0,
    sentBytes: 0,
    totalBytes: 0,
    receivedBytesPerSecond: 0,
    sentBytesPerSecond: 0,
    bytesPerSecond: 0,
  });

  const terminalNetworkMonitorEffectiveStatus = (snapshot) => {
    if (navigator.onLine === false) {
      return "error";
    }
    const status = String(snapshot?.status || "idle");
    if (status !== "idle") {
      return status;
    }
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (!pane.closed && pane.name === activeName && pane.connectionRetrying) {
          return "retrying";
        }
      }
    }
    return "idle";
  };

  const renderTerminalNetworkMonitor = (state = terminalNetworkMonitor?.snapshot()) => {
    if (!terminalNetworkMonitorPanel) {
      return;
    }
    const visible = debugModeEnabled && networkMonitorEnabled;
    terminalNetworkMonitorPanel.hidden = !visible;
    if (!visible) {
      return;
    }
    const snapshot = state || emptyTerminalNetworkMonitorState();
    if (terminalNetworkMonitorStatus) {
      const status = terminalNetworkMonitorEffectiveStatus(snapshot);
      const statusLabel = terminalNetworkMonitorStateLabel(status);
      terminalNetworkMonitorStatus.dataset.state = status;
      terminalNetworkMonitorStatus.setAttribute("aria-label", statusLabel);
      terminalNetworkMonitorStatus.title = statusLabel;
    }
    if (terminalNetworkMonitorChannels) {
      const channels = snapshot.channels || [];
      terminalNetworkMonitorChannels.hidden = channels.length === 0;
      terminalNetworkMonitorChannels.textContent = "";
      for (const channel of channels) {
        const row = document.createElement("div");
        row.className = "terminal-network-monitor-channel";
        const name = document.createElement("span");
        name.className = "terminal-network-monitor-channel-name";
        name.textContent = channel.label;
        const status = document.createElement("span");
        status.className = "terminal-network-monitor-channel-state";
        status.dataset.state = channel.state || "idle";
        status.textContent = terminalNetworkMonitorStateLabel(channel.state);
        const rateLabel = document.createElement("span");
        rateLabel.className = "terminal-network-monitor-channel-metric-label";
        rateLabel.textContent = "当前流量";
        const rate = document.createElement("strong");
        rate.className = "terminal-network-monitor-channel-metric-value";
        rate.textContent = `${formatTerminalNetworkMB(channel.bytesPerSecond)} MB/s`;
        const usageLabel = document.createElement("span");
        usageLabel.className = "terminal-network-monitor-channel-metric-label";
        usageLabel.textContent = "已使用流量";
        const usage = document.createElement("strong");
        usage.className = "terminal-network-monitor-channel-metric-value";
        usage.textContent = `${formatTerminalNetworkMB(channel.totalBytes)} MB`;
        const detail = document.createElement("small");
        detail.className = "terminal-network-monitor-channel-detail";
        detail.textContent = `接收 ${formatTerminalNetworkMB(channel.receivedBytesPerSecond)} MB/s / ${formatTerminalNetworkMB(channel.receivedBytes)} MB · 发送 ${formatTerminalNetworkMB(channel.sentBytesPerSecond)} MB/s / ${formatTerminalNetworkMB(channel.sentBytes)} MB`;
        row.append(name, status, rateLabel, rate, usageLabel, usage, detail);
        terminalNetworkMonitorChannels.appendChild(row);
      }
    }
    const receivedRate = formatTerminalNetworkMB(snapshot.receivedBytesPerSecond);
    const sentRate = formatTerminalNetworkMB(snapshot.sentBytesPerSecond);
    const receivedUsage = formatTerminalNetworkMB(snapshot.receivedBytes);
    const sentUsage = formatTerminalNetworkMB(snapshot.sentBytes);
    if (terminalNetworkMonitorRate) {
      terminalNetworkMonitorRate.textContent = `${formatTerminalNetworkMB(snapshot.bytesPerSecond)} MB/s`;
    }
    if (terminalNetworkMonitorRateDetail) {
      terminalNetworkMonitorRateDetail.textContent = `接收 ${receivedRate} MB/s · 发送 ${sentRate} MB/s`;
    }
    if (terminalNetworkMonitorUsage) {
      terminalNetworkMonitorUsage.textContent = `${formatTerminalNetworkMB(snapshot.totalBytes)} MB`;
    }
    if (terminalNetworkMonitorUsageDetail) {
      terminalNetworkMonitorUsageDetail.textContent = `接收 ${receivedUsage} MB · 发送 ${sentUsage} MB`;
    }
  };

  const terminalNetworkMonitorShouldRun = () => debugModeEnabled && networkMonitorEnabled && !disposed;

  const syncTerminalNetworkMonitorSockets = ({ reset = false } = {}) => {
    if (!terminalNetworkMonitor) {
      return;
    }
    if (reset) {
      terminalNetworkMonitor.detachAll();
    }
    terminalNetworkMonitor.setLayout(isClientInstanceName(activeName) ? "direct" : "unified");
    if (isClientInstanceName(activeName)) {
      for (const tab of tabs.values()) {
        for (const pane of tab.panes.values()) {
          if (!pane.closed && pane.name === activeName && pane.connectionChannel === "fast" && pane.socket) {
            terminalNetworkMonitor.attachSocket(pane.socket, { kind: "fast" });
          }
        }
      }
    } else if (terminalUnifiedTargetName === activeName) {
      const unifiedSocket = terminalUnifiedConnection?.getPhysicalSocket?.();
      if (unifiedSocket) {
        terminalNetworkMonitor.attachSocket(unifiedSocket, { kind: "unified" });
      }
    }
    renderTerminalNetworkMonitor();
  };

  const stopTerminalNetworkMonitor = () => {
    terminalNetworkMonitorStartGeneration += 1;
    if (terminalNetworkMonitorSampleTimer) {
      window.clearInterval(terminalNetworkMonitorSampleTimer);
      terminalNetworkMonitorSampleTimer = 0;
    }
    terminalNetworkMonitor?.dispose();
    terminalNetworkMonitor = null;
    renderTerminalNetworkMonitor();
  };

  const startTerminalNetworkMonitor = async () => {
    if (!terminalNetworkMonitorShouldRun()) {
      stopTerminalNetworkMonitor();
      return;
    }
    if (terminalNetworkMonitor) {
      syncTerminalNetworkMonitorSockets();
      return;
    }
    const generation = ++terminalNetworkMonitorStartGeneration;
    renderTerminalNetworkMonitor();
    terminalNetworkMonitorModulePromise ||= import("./terminal_network_monitor.js");
    try {
      const module = await terminalNetworkMonitorModulePromise;
      if (generation !== terminalNetworkMonitorStartGeneration || !terminalNetworkMonitorShouldRun()) {
        return;
      }
      terminalNetworkMonitor = module.createTerminalNetworkMonitor({
        layout: isClientInstanceName(activeName) ? "direct" : "unified",
        onStateChange: (state) => renderTerminalNetworkMonitor(state),
      });
      syncTerminalNetworkMonitorSockets();
      terminalNetworkMonitorSampleTimer = window.setInterval(() => {
        if (!terminalNetworkMonitorShouldRun()) {
          stopTerminalNetworkMonitor();
          return;
        }
        terminalNetworkMonitor?.sample();
      }, terminalNetworkMonitorSampleMs);
    } catch (error) {
      if (generation === terminalNetworkMonitorStartGeneration) {
        terminalNetworkMonitorModulePromise = null;
        appendDebugError("网络监视器加载失败", error?.message || String(error));
      }
    }
  };

  const applyTerminalNetworkMonitorVisibility = () => {
    if (terminalNetworkMonitorShouldRun()) {
      startTerminalNetworkMonitor();
    } else {
      stopTerminalNetworkMonitor();
    }
  };

  const renderDebugLog = () => {
    if (!debugLogPanel || !debugLogList) {
      return;
    }
    debugLogPanel.hidden = !debugModeEnabled || !debugLogEnabled;
    debugLogList.textContent = "";
    for (const entry of debugLogEntries) {
      const row = document.createElement("div");
      row.className = `debug-log-entry debug-log-entry-${entry.level}`;
      const time = document.createElement("time");
      time.className = "debug-log-entry-time";
      time.textContent = entry.time;
      const level = entry.level === "error" ? document.createElement("span") : null;
      if (level) {
        level.className = "debug-log-entry-level debug-log-entry-level-error";
        level.textContent = "错误";
      }
      const message = document.createElement("span");
      message.className = "debug-log-entry-message";
      message.textContent = entry.message;
      row.append(time);
      if (level) {
        row.append(level);
      }
      if (entry.count > 1) {
        const count = document.createElement("span");
        count.className = "debug-log-entry-count";
        count.textContent = `x${entry.count}`;
        row.append(count);
      }
      row.append(message);
      debugLogList.appendChild(row);
    }
    debugLogList.scrollTop = debugLogList.scrollHeight;
  };

  const appendDebugLog = (level, message, details = "", { dedupeKey = "", retainWhenDisabled = false } = {}) => {
    if ((!debugModeEnabled || !debugLogEnabled) && !retainWhenDisabled) {
      return;
    }
    const normalized = String(message || "").trim();
    if (!normalized) {
      return;
    }
    const suffix = String(details || "").trim();
    const now = Date.now();
    if (dedupeKey) {
      const previous = debugLogLastSeen.get(dedupeKey);
      if (previous && now - previous.lastAt < debugLogDedupWindowMs) {
        const entry = debugLogEntries[previous.index];
        if (entry) {
          entry.count = Number(entry.count || 1) + 1;
          entry.time = new Date().toLocaleTimeString([], { hour12: false });
          if (suffix) {
            entry.message = `${normalized} (${suffix})`;
          }
          previous.lastAt = now;
          if (debugModeEnabled && debugLogEnabled && (entry.count === 2 || entry.count % 10 === 0)) {
            renderDebugLog();
          }
        }
        return;
      }
    }
    const entry = {
      level: ["error", "warn", "info"].includes(level) ? level : "info",
      time: new Date().toLocaleTimeString([], { hour12: false }),
      message: suffix ? `${normalized} (${suffix})` : normalized,
      count: 1,
    };
    debugLogEntries.push(entry);
    if (dedupeKey) {
      debugLogLastSeen.set(dedupeKey, { index: debugLogEntries.length - 1, lastAt: now });
    }
    if (debugLogEntries.length > debugLogEntryLimit) {
      const removed = debugLogEntries.length - debugLogEntryLimit;
      debugLogEntries.splice(0, removed);
      for (const [key, value] of debugLogLastSeen) {
        const index = value.index - removed;
        if (index < 0) {
          debugLogLastSeen.delete(key);
        } else {
          value.index = index;
        }
      }
    }
    if (debugModeEnabled && debugLogEnabled) {
      renderDebugLog();
    }
  };

  const appendDebugError = (message, details = "") => appendDebugLog("error", message, details);
  const appendDebugWarning = (message, details = "") => appendDebugLog("warn", message, details);

  const appendStartupTrace = (event, details = "", { dedupeKey = event } = {}) => {
    const elapsed = Math.max(0, Math.round(webShellStartupNow() - webShellStartupMetrics.moduleStartedAt));
    appendDebugLog("info", `[startup +${elapsed}ms] ${event}`, details, {
      dedupeKey: `startup:${dedupeKey}`,
      retainWhenDisabled: true,
    });
  };

  globalThis.__webshellStartupTrace = (event, details = "") => appendStartupTrace(event, details);

  appendStartupTrace("页面模块已启动", `target=${String(params.get("name") || params.get("target") || "").trim() || "未指定"}`, { dedupeKey: "module-start" });

  const debugLogClipboardText = () => debugLogEntries
    .map((entry) => `[${entry.time}] ${String(entry.level || "info").toUpperCase()}${entry.count > 1 ? ` x${entry.count}` : ""} ${entry.message}`)
    .join("\n");

  const formatDebugLogValue = (value) => {
    if (value instanceof Error) {
      return value.message || value.name || "Error";
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, (key, item) => (
        /token|authorization|cookie|credential|password/i.test(key) ? "[redacted]" : item
      ));
    } catch (error) {
      return String(value);
    }
  };

  const installDebugConsoleCapture = () => {
    const captures = [];
    for (const [method, level] of [["warn", "warn"], ["error", "error"]]) {
      const original = console[method];
      if (!original) {
        continue;
      }
      const capture = (...args) => {
        original.apply(console, args);
        const message = args.map(formatDebugLogValue).filter(Boolean).join(" ").slice(0, 2000);
        const dedupeKey = `console:${level}:${typeof args[0] === "string" ? args[0] : message.slice(0, 160)}`;
        appendDebugLog(level, message, "", { dedupeKey });
      };
      console[method] = capture;
      captures.push({ method, original, capture });
    }
    return () => {
      for (const { method, original, capture } of captures) {
        if (console[method] === capture) {
          console[method] = original;
        }
      }
    };
  };

  const handleDebugWindowError = (event) => {
    const targetURL = event.target instanceof HTMLScriptElement
      ? event.target.src
      : event.target instanceof HTMLLinkElement
        ? event.target.href
        : "";
    const location = event.filename
      ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
      : targetURL;
    appendDebugError("页面运行错误", [event.message || event.error?.message || "资源加载失败", location].filter(Boolean).join(" - "));
  };

  const handleDebugUnhandledRejection = (event) => {
    appendDebugError("未处理的异步错误", formatDebugLogValue(event.reason));
  };

  const syncDebugLogCapture = () => {
    const active = debugModeEnabled && debugLogEnabled && !disposed;
    if (active) {
      if (!debugConsoleCaptureCleanup) {
        debugConsoleCaptureCleanup = installDebugConsoleCapture();
      }
      if (!debugWindowErrorCaptureActive) {
        window.addEventListener("error", handleDebugWindowError, true);
        window.addEventListener("unhandledrejection", handleDebugUnhandledRejection);
        debugWindowErrorCaptureActive = true;
      }
      return;
    }
    debugConsoleCaptureCleanup?.();
    debugConsoleCaptureCleanup = null;
    if (debugWindowErrorCaptureActive) {
      window.removeEventListener("error", handleDebugWindowError, true);
      window.removeEventListener("unhandledrejection", handleDebugUnhandledRejection);
      debugWindowErrorCaptureActive = false;
    }
  };

  syncDebugLogCapture();

  const performanceTaskNow = () => (
    window.performance && typeof window.performance.now === "function"
      ? window.performance.now()
      : Date.now()
  );
  const recordPerformanceTask = (name, ms) => performanceTaskMonitor.record(name, ms);
  const measurePerformanceTask = (name, fn) => performanceTaskMonitor.measure(name, fn);
  const recordTerminalRuntimeMetric = (name, value = 1) => {
    const metrics = globalThis.__webshellTerminalPerformance;
    if (metrics && typeof metrics.record === "function") {
      metrics.record(name, value);
    }
  };
  const recordTerminalRuntimeMaxMetric = (name, value = 0) => {
    const metrics = globalThis.__webshellTerminalPerformance;
    if (metrics && typeof metrics.max === "function") {
      metrics.max(name, value);
      return;
    }
    if (metrics?.counters && typeof metrics.counters === "object") {
      metrics.counters[name] = Math.max(Number(metrics.counters[name]) || 0, Number(value) || 0);
    }
  };

  const recordTerminalSessionEvent = (session, type, details = {}) => {
    if (!session) {
      return;
    }
    const timeline = Array.isArray(session.terminalEventTimeline)
      ? session.terminalEventTimeline
      : [];
    session.terminalEventTimeline = timeline;
    const event = {
      at: Math.round(performanceTaskNow()),
      type: String(type || "unknown"),
      channelGeneration: Number(session.connectionChannelGeneration || 0),
      attachGeneration: Number(session.terminalReplayGeneration || 0),
      historyGeneration: String(session.historyGeneration || ""),
      resizeEpoch: normalizeTerminalResizeEpoch(session.appliedResizeEpoch)
        || normalizeTerminalResizeEpoch(session.requestedResizeEpoch),
      receivedCursor: session.receivedHistoryCursor?.toString?.() || "",
      appliedCursor: session.appliedHistoryCursor?.toString?.() || "",
      presentedCursor: session.presentedHistoryCursor?.toString?.() || "",
      ...details,
    };
    timeline.push(event);
    if (timeline.length > 96) {
      timeline.splice(0, timeline.length - 96);
    }
    if (debugLogEnabled) {
      appendDebugLog(
        "info",
        `终端事件 ${String(type || "unknown")}`,
        `${session.name}/${session.id} ${JSON.stringify(event)}`,
        { dedupeKey: `terminal-event:${session.id}:${String(type || "unknown")}` },
      );
    }
  };

  const mountPerformanceMeter = () => {
    if (performanceMeter?.isConnected) {
      return;
    }
    if (!terminalArea) {
      return;
    }
    const meter = document.createElement("div");
    meter.className = "fps-meter";
    meter.id = "performanceMeter";
    meter.setAttribute("aria-live", "off");

    const fps = document.createElement("span");
    fps.id = "performanceMeterFps";
    fps.textContent = "-- FPS";

    const refresh = document.createElement("span");
    refresh.id = "performanceMeterRefresh";
    refresh.textContent = "-- Hz";

    meter.append(fps, refresh);
    terminalArea.appendChild(meter);
    performanceMeter = meter;
    performanceMeterFps = fps;
    performanceMeterRefresh = refresh;
  };

  const unmountPerformanceMeter = () => {
    performanceMeter?.remove();
    performanceMeter = null;
    performanceMeterFps = null;
    performanceMeterRefresh = null;
  };

  const startPerformanceMeter = () => {
    if (!performanceMeterFps || !performanceMeterRefresh) {
      return;
    }
    if (!debugModeEnabled || !performanceMeterEnabled || performanceMeterFrame) {
      return;
    }
    let frameCount = 0;
    let sampleFrames = 0;
    let sampleStart = 0;
    let lastTime = 0;
    const frameIntervals = [];
    const maxIntervals = 90;
    const update = (time) => {
      if (disposed || !debugModeEnabled || !performanceMeterEnabled) {
        performanceMeterFrame = 0;
        return;
      }
      frameCount += 1;
      if (lastTime > 0) {
        const interval = time - lastTime;
        if (interval > 0 && interval < 1000) {
          frameIntervals.push(interval);
          if (frameIntervals.length > maxIntervals) {
            frameIntervals.shift();
          }
        }
      }
      lastTime = time;
      if (frameCount <= performanceMeterWarmupFrames) {
        sampleStart = time;
        sampleFrames = 0;
        performanceMeterFrame = window.requestAnimationFrame(update);
        return;
      }
      if (!sampleStart) {
        sampleStart = time;
      }
      sampleFrames += 1;
      const elapsed = time - sampleStart;
      if (elapsed >= performanceMeterSampleMs) {
        const fps = Math.round((sampleFrames * 1000) / elapsed);
        const intervals = frameIntervals.slice().sort((left, right) => left - right);
        const median = intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)] : 0;
        const refresh = median > 0 ? Math.round(1000 / median) : 0;
        performanceMeterFps.textContent = `${fps} FPS`;
        performanceMeterRefresh.textContent = refresh > 0 ? `${refresh} Hz` : "-- Hz";
        sampleStart = time;
        sampleFrames = 0;
      }
      performanceMeterFrame = window.requestAnimationFrame(update);
    };
    performanceMeterFrame = window.requestAnimationFrame(update);
  };

  const stopPerformanceMeter = () => {
    if (performanceMeterFrame) {
      window.cancelAnimationFrame(performanceMeterFrame);
      performanceMeterFrame = 0;
    }
  };

  const selectStoredTheme = () => {
    activeTheme = themes.find((theme) => theme.id === window.localStorage.getItem(themeStorageKey)) || themes[0];
  };

  const loadThemeCatalog = async () => {
    try {
      const response = await fetch(runtimeAssetURL("./themes.json"));
      if (!response.ok) {
        return;
      }
      const catalog = await response.json();
      if (!Array.isArray(catalog) || catalog.length === 0) {
        return;
      }
      const normalized = catalog.filter((theme) => theme?.id && theme?.xterm?.background && theme?.xterm?.foreground);
      if (normalized.length > 0) {
        themes = normalized;
        selectStoredTheme();
      }
    } catch (error) {
      console.warn("Failed to load theme catalog", error);
    }
  };

  const readResponseText = async (response, fallback) => {
    const text = await response.text().catch(() => "");
    return text.trim() || fallback;
  };

  function loadStableClientID() {
    const key = `${storagePrefix}.clientID`;
    try {
      const stored = String(window.localStorage.getItem(key) || "").trim();
      if (stored) {
        return stored;
      }
      const next = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(key, next);
      return next;
    } catch (error) {
      return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function cloneMobileShortcutRows(rows) {
    return [0, 1].map((rowIndex) => Array.isArray(rows?.[rowIndex])
      ? rows[rowIndex].map((shortcut) => ({
        ...shortcut,
        inputKey: String(shortcut.inputKey || shortcut.input_key || "").trim(),
        text: typeof shortcut.text === "string" ? shortcut.text : "",
        ariaLabel: String(shortcut.ariaLabel || shortcut.aria_label || "").trim(),
        inputModifiers: {
          ctrl: (shortcut.inputModifiers || shortcut.input_modifiers)?.ctrl === true,
          shift: (shortcut.inputModifiers || shortcut.input_modifiers)?.shift === true,
          alt: (shortcut.inputModifiers || shortcut.input_modifiers)?.alt === true,
        },
      }))
      : []);
  }

  const cloneDesktopShortcuts = (shortcuts) => Array.isArray(shortcuts)
    ? shortcuts.map((shortcut) => ({
      id: String(shortcut?.id || "").trim(),
      label: String(shortcut?.label || "").trim(),
      action: String(shortcut?.action || "").trim(),
      shortcut: String(shortcut?.shortcut || "").trim(),
    }))
    : [];

  const toClientMobileShortcut = (shortcut) => {
    const id = String(shortcut?.id || "").trim();
    const label = String(shortcut?.label || "").trim();
    const action = String(shortcut?.action || "").trim();
    const inputKey = String(shortcut?.inputKey || shortcut?.input_key || "").trim();
    const text = typeof shortcut?.text === "string" ? shortcut.text : "";
    if (!id || !label || (!action && !inputKey && !text)) {
      return null;
    }
    const next = {
      id,
      label,
      ariaLabel: String(shortcut?.ariaLabel || shortcut?.aria_label || label).trim() || label,
      kind: String(shortcut?.kind || "").trim(),
      icon: String(shortcut?.icon || "").trim(),
      inputModifiers: normalizeShortcutInputModifiers(shortcut?.inputModifiers || shortcut?.input_modifiers),
    };
    if (action) {
      next.action = action;
    } else if (inputKey) {
      next.inputKey = inputKey;
      next.data = encodeMobileShortcutKeyInput(inputKey, next.inputModifiers);
    } else {
      next.text = text;
      next.data = text;
    }
    return next;
  };

  const normalizeMobileShortcutRows = (rows) => {
    if (!Array.isArray(rows) || rows.length !== 2) {
      return cloneMobileShortcutRows(defaultMobileShortcutRowsConfig);
    }
    return [0, 1].map((rowIndex) => Array.isArray(rows[rowIndex])
      ? rows[rowIndex].map(toClientMobileShortcut).filter(Boolean)
      : []);
  };

  const serializeMobileShortcutRows = (rows) => cloneMobileShortcutRows(rows).map((row) => row.map((shortcut) => {
    const item = {
      id: String(shortcut.id || "").trim(),
      label: String(shortcut.label || "").trim(),
    };
    const action = String(shortcut.action || "").trim();
    const inputKey = String(shortcut.inputKey || "").trim();
    const text = typeof shortcut.text === "string" ? shortcut.text : "";
    if (action) {
      item.action = action;
    } else if (inputKey) {
      item.input_key = inputKey;
      const modifiers = normalizeShortcutInputModifiers(shortcut.inputModifiers);
      if (modifiers.ctrl || modifiers.alt || modifiers.shift) {
        item.input_modifiers = modifiers;
      }
    } else {
      item.text = text;
    }
    const kind = String(shortcut.kind || "").trim();
    const icon = String(shortcut.icon || "").trim();
    const ariaLabel = String(shortcut.ariaLabel || "").trim();
    if (kind) {
      item.kind = kind;
    }
    if (icon) {
      item.icon = icon;
    }
    if (ariaLabel && ariaLabel !== item.label) {
      item.aria_label = ariaLabel;
    }
    return item;
  }));

  const toClientDesktopShortcut = (shortcut) => {
    const id = String(shortcut?.id || "").trim();
    const action = String(shortcut?.action || "").trim();
    const normalizedShortcut = normalizeShortcutDefinition(shortcut?.shortcut);
    if (!id || !desktopShortcutActionLabels.has(action) || !normalizedShortcut) {
      return null;
    }
    const label = String(shortcut?.label || "").trim() || desktopShortcutActionLabels.get(action) || action;
    return {
      id,
      label,
      action,
      shortcut: String(shortcut?.shortcut || "").trim(),
    };
  };

  const normalizeDesktopShortcuts = (shortcuts) => {
    if (!Array.isArray(shortcuts)) {
      return cloneDesktopShortcuts(defaultDesktopShortcutsConfig);
    }
    const seenShortcuts = new Set();
    return shortcuts.map(toClientDesktopShortcut).filter((shortcut) => {
      if (!shortcut) {
        return false;
      }
      const normalized = normalizeShortcutDefinition(shortcut.shortcut);
      if (!normalized || seenShortcuts.has(normalized)) {
        return false;
      }
      seenShortcuts.add(normalized);
      return true;
    });
  };

  const serializeDesktopShortcuts = (shortcuts) => cloneDesktopShortcuts(shortcuts).map((shortcut) => ({
    id: shortcut.id,
    label: shortcut.label,
    action: shortcut.action,
    shortcut: shortcut.shortcut,
  }));

  const applyMobileShortcutRows = (rows, { remember = false } = {}) => {
    mobileShortcutRowsConfig = cloneMobileShortcutRows(rows);
    if (remember) {
      lastSavedMobileShortcutRowsConfig = cloneMobileShortcutRows(rows);
    }
    renderMobileShortcuts();
    renderSettingsMobileShortcuts();
  };

  const applyDesktopShortcuts = (shortcuts, { remember = false } = {}) => {
    desktopShortcutsConfig = normalizeDesktopShortcuts(shortcuts);
    if (remember) {
      lastSavedDesktopShortcutsConfig = cloneDesktopShortcuts(desktopShortcutsConfig);
    }
    rebuildShortcutActionMap();
    renderSettingsDesktopShortcuts();
  };

  const fontFileURLPath = (id) => `api/settings/fonts/${encodeURIComponent(id)}/file`;

  const normalizeUploadedFont = (font) => {
    const id = String(font?.id || "").trim();
    const family = String(font?.family || "").trim();
    if (!id || !family) {
      return null;
    }
    return {
      id,
      family,
      label: String(font?.label || font?.source_name || font?.filename || family).trim() || family,
      filename: String(font?.filename || "").trim(),
      mime: String(font?.mime || "").trim(),
      size: Number(font?.size || 0),
      uploadedAt: String(font?.uploaded_at || "").trim(),
      url: String(font?.url || fontFileURLPath(id)).trim(),
      sourceName: String(font?.source_name || "").trim(),
      builtin: font?.builtin === true,
    };
  };

  const normalizeTerminalSymbolFont = (font) => {
    const normalized = normalizeUploadedFont(font);
    if (!normalized) {
      return null;
    }
    return {
      ...normalized,
      sha256: String(font?.sha256 || "").trim(),
    };
  };

  const fontFileSource = (font) => new URL(font.url || fontFileURLPath(font.id), window.location.href).toString();

  const cssString = (value) => `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  const formatBytes = (value) => {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) {
      return "";
    }
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatAttachmentBytes = (value) => {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) {
      return "0 B";
    }
    if (size < 1024 * 1024 * 1024) {
      return formatBytes(size) || "0 B";
    }
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const normalizeTerminalScrollback = (value) => {
    const next = Math.round(Number(value));
    if (!Number.isFinite(next) || next < minTerminalScrollback || next > maxTerminalScrollback) {
      return defaultTerminalScrollback;
    }
    return next;
  };

  const normalizeTerminalLineHeightPercent = (value) => {
    const next = Math.round(Number(value));
    if (!Number.isFinite(next) || next < minTerminalLineHeightPercent || next > maxTerminalLineHeightPercent) {
      return defaultTerminalLineHeightPercent;
    }
    return next;
  };

  const readSettingsLineHeightInput = () => {
    const raw = String(settingsLineHeightInput?.value || "").trim();
    if (!/^\d+$/.test(raw)) {
      throw new Error(`行间距必须是 ${minTerminalLineHeightPercent}-${maxTerminalLineHeightPercent}% 之间的整数。`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minTerminalLineHeightPercent || value > maxTerminalLineHeightPercent) {
      throw new Error(`行间距必须是 ${minTerminalLineHeightPercent}-${maxTerminalLineHeightPercent}% 之间的整数。`);
    }
    return value;
  };

  const readSettingsScrollbackInput = () => {
    const raw = String(settingsScrollbackInput?.value || "").trim();
    if (!/^\d+$/.test(raw)) {
      throw new Error(`滚动历史行数必须是 ${minTerminalScrollback}-${maxTerminalScrollback} 之间的整数。`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minTerminalScrollback || value > maxTerminalScrollback) {
      throw new Error(`滚动历史行数必须是 ${minTerminalScrollback}-${maxTerminalScrollback} 之间的整数。`);
    }
    return value;
  };

  const syncSettingsLineHeightInput = () => {
    if (settingsLineHeightInput) {
      settingsLineHeightInput.value = String(terminalLineHeightPercent || defaultTerminalLineHeightPercent);
    }
  };

  const syncSettingsScrollbackInput = () => {
    if (settingsScrollbackInput) {
      settingsScrollbackInput.value = String(terminalOptionsBase.scrollback || defaultTerminalScrollback);
    }
  };

  const invalidateSessionsForTerminalScrollbackChange = (previousScrollback, nextScrollback) => {
    if (previousScrollback === nextScrollback) {
      return;
    }
    for (const tab of tabs.values()) {
      for (const session of tab.panes.values()) {
        clearSessionHistoryCacheWriteSchedule(session);
        session.historyCacheWriteQueue = [];
        session.historyCacheWriteBytes = 0;
        session.historyCacheLoaded = false;
        session.historyCacheLoadPromise = null;
        session.historyCacheLoadSeq = Number(session.historyCacheLoadSeq || 0) + 1;
        session.historyCacheWindowMismatch = true;
        session.historyCacheSnapshot = null;
        session.historyCacheReplayCommitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;
        session.historyCacheReplayCommitPending = false;
        session.historyStateReady = false;
        session.localBaseCursor = 0n;
        session.persistedHistoryCursor = 0n;
        session.appliedHistoryCursor = 0n;
        session.historyGeneration = "";
        session.resetOnNextReplay = true;
        if (session.name === activeName && !session.closed) {
          requestSessionHistoryReplay(session);
        }
      }
    }
  };

  const applyTerminalScrollback = () => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane.term?.options) {
          pane.term.options.scrollback = terminalOptionsBase.scrollback;
        }
      }
    }
  };

  const applyPerformanceMeterVisibility = () => {
    const performanceMeterActive = debugModeEnabled && performanceMeterEnabled;
    if (performanceMeterActive) {
      mountPerformanceMeter();
      startPerformanceMeter();
    } else {
      stopPerformanceMeter();
      unmountPerformanceMeter();
    }
  };

  const applyPerformanceTaskMeterVisibility = () => {
    const performanceTasksActive = debugModeEnabled && performanceTasksEnabled;
    if (performanceTaskMeter) {
      performanceTaskMeter.hidden = !performanceTasksActive;
    }
    performanceTaskMonitor.setEnabled(performanceTasksActive);
    if (performanceTasksActive) {
      renderPerformanceTaskMeter();
    }
  };

  const syncSettingsDebugModeControls = () => {
    if (settingsDebugModeToggle) {
      settingsDebugModeToggle.checked = debugModeEnabled;
    }
    if (settingsDebugOptions) {
      settingsDebugOptions.hidden = !debugModeEnabled;
    }
    renderDebugLog();
  };

  const syncSettingsDebugLogToggle = () => {
    if (settingsDebugLogToggle) {
      settingsDebugLogToggle.checked = debugLogEnabled;
      settingsDebugLogToggle.disabled = !debugModeEnabled;
    }
    renderDebugLog();
  };

  const syncSettingsNetworkMonitorToggle = () => {
    if (settingsNetworkMonitorToggle) {
      settingsNetworkMonitorToggle.checked = networkMonitorEnabled;
      settingsNetworkMonitorToggle.disabled = !debugModeEnabled;
    }
    renderTerminalNetworkMonitor();
  };

  const syncSettingsPerformanceMeterToggle = () => {
    if (settingsPerformanceMeterToggle) {
      settingsPerformanceMeterToggle.checked = performanceMeterEnabled;
      settingsPerformanceMeterToggle.disabled = !debugModeEnabled;
    }
  };

  const syncSettingsPerformanceTasksToggle = () => {
    if (settingsPerformanceTasksToggle) {
      settingsPerformanceTasksToggle.checked = performanceTasksEnabled;
      settingsPerformanceTasksToggle.disabled = !debugModeEnabled;
    }
  };

  const syncSettingsMobileRemoteDesktopToggle = () => {
    if (settingsMobileRemoteDesktopToggle) {
      settingsMobileRemoteDesktopToggle.checked = mobileRemoteDesktopEnabled;
    }
  };

  const syncSettingsForcePCModeToggle = () => {
    if (settingsForcePCModeToggle) {
      settingsForcePCModeToggle.checked = forcePCModeEnabled;
      settingsForcePCModeToggle.disabled = !debugModeEnabled;
    }
  };

  const syncSettingsDebugOptions = () => {
    syncSettingsDebugModeControls();
    syncSettingsDebugLogToggle();
    syncSettingsNetworkMonitorToggle();
    syncSettingsPerformanceMeterToggle();
    syncSettingsPerformanceTasksToggle();
    syncSettingsMobileRemoteDesktopToggle();
    syncSettingsForcePCModeToggle();
  };

  const syncDebugModeState = () => {
    syncSettingsDebugOptions();
    syncForcePCModeState();
    syncDebugLogCapture();
    applyPerformanceMeterVisibility();
    applyPerformanceTaskMeterVisibility();
    applyTerminalNetworkMonitorVisibility();
    if (debugModeEnabled) {
      startDeviceHeartbeat();
    } else {
      sendDeviceOfflineBeacon();
      stopDeviceHeartbeat();
      closeDevicePanel();
    }
  };

  const syncSettingsDesktopMouseClipboardToggle = () => {
    if (settingsDesktopMouseClipboardToggle) {
      settingsDesktopMouseClipboardToggle.checked = desktopMouseClipboardEnabled;
    }
  };

  const applyDesktopShortcutsBarVisibility = () => {
    document.body.classList.toggle("desktop-shortcuts-bar-enabled", desktopShortcutsBarEnabled);
  };

  const syncSettingsDesktopShortcutsBarToggle = () => {
    if (settingsDesktopShortcutsBarToggle) {
      settingsDesktopShortcutsBarToggle.checked = desktopShortcutsBarEnabled;
    }
    applyDesktopShortcutsBarVisibility();
  };

  const syncSettingsMobilePixelScrollToggle = () => {
    if (settingsMobilePixelScrollToggle) {
      settingsMobilePixelScrollToggle.checked = mobilePixelScrollEnabled;
    }
  };

  const syncSettingsMobileDoubleTapReminderToggle = () => {
    if (settingsMobileDoubleTapReminderToggle) {
      settingsMobileDoubleTapReminderToggle.checked = mobileDoubleTapReminderEnabled;
    }
  };

  const setSettingsScrollbackSaving = (saving) => {
    if (settingsScrollbackResetButton) {
      settingsScrollbackResetButton.disabled = saving;
    }
  };

  const setSettingsLineHeightSaving = (saving) => {
    if (settingsLineHeightResetButton) {
      settingsLineHeightResetButton.disabled = saving;
    }
  };

  const setMobileShortcutSaving = (saving) => {
    for (const button of [
      settingsMobileShortcutAddButton,
      settingsMobileShortcutResetButton,
      ...Array.from(settingsMobileShortcutList?.querySelectorAll("button") || []),
    ]) {
      if (button) {
        button.disabled = saving;
      }
    }
  };

  const setDesktopShortcutSaving = (saving) => {
    for (const button of [
      settingsDesktopShortcutAddButton,
      settingsDesktopShortcutResetButton,
      ...Array.from(settingsDesktopShortcutList?.querySelectorAll("button") || []),
    ]) {
      if (button) {
        button.disabled = saving;
      }
    }
  };

  const setSettingsDesktopMouseClipboardSaving = (saving) => {
    if (settingsDesktopMouseClipboardToggle) {
      settingsDesktopMouseClipboardToggle.disabled = saving;
    }
  };

  const setSettingsDesktopShortcutsBarSaving = (saving) => {
    if (settingsDesktopShortcutsBarToggle) {
      settingsDesktopShortcutsBarToggle.disabled = saving;
    }
  };

  const setSettingsMobilePixelScrollSaving = (saving) => {
    if (settingsMobilePixelScrollToggle) {
      settingsMobilePixelScrollToggle.disabled = saving;
    }
  };

  const setSettingsMobileDoubleTapReminderSaving = (saving) => {
    if (settingsMobileDoubleTapReminderToggle) {
      settingsMobileDoubleTapReminderToggle.disabled = saving;
    }
  };

  const setSettingsFeedback = (message, tone = "info") => {
    if (!settingsFeedback) {
      return;
    }
    const text = String(message || "").trim();
    settingsFeedback.hidden = !text;
    settingsFeedback.textContent = text;
    settingsFeedback.dataset.tone = tone;
  };

  const hideSettingsThemeScrollbar = () => {
    window.clearTimeout(settingsThemeScrollbarHideTimer);
    settingsThemeScrollbarHideTimer = 0;
    settingsThemePanel?.classList.remove("is-scrolling");
    settingsThemeList?.classList.remove("is-scrolling");
  };

  const showSettingsThemeScrollbarDuringScroll = () => {
    window.clearTimeout(settingsThemeScrollbarHideTimer);
    settingsThemePanel?.classList.add("is-scrolling");
    settingsThemeList?.classList.add("is-scrolling");
    settingsThemeScrollbarHideTimer = window.setTimeout(hideSettingsThemeScrollbar, 800);
  };

  const hideSettingsMobileShortcutsScrollbar = () => {
    window.clearTimeout(settingsMobileShortcutsScrollbarHideTimer);
    settingsMobileShortcutsScrollbarHideTimer = 0;
    settingsMobileShortcutsPanel?.classList.remove("is-scrolling");
  };

  const showSettingsMobileShortcutsScrollbarDuringScroll = () => {
    window.clearTimeout(settingsMobileShortcutsScrollbarHideTimer);
    settingsMobileShortcutsPanel?.classList.add("is-scrolling");
    settingsMobileShortcutsScrollbarHideTimer = window.setTimeout(hideSettingsMobileShortcutsScrollbar, 800);
  };

  const hideSettingsDesktopShortcutsScrollbar = () => {
    window.clearTimeout(settingsDesktopShortcutsScrollbarHideTimer);
    settingsDesktopShortcutsScrollbarHideTimer = 0;
    settingsDesktopShortcutsPanel?.classList.remove("is-scrolling");
  };

  const showSettingsDesktopShortcutsScrollbarDuringScroll = () => {
    window.clearTimeout(settingsDesktopShortcutsScrollbarHideTimer);
    settingsDesktopShortcutsPanel?.classList.add("is-scrolling");
    settingsDesktopShortcutsScrollbarHideTimer = window.setTimeout(hideSettingsDesktopShortcutsScrollbar, 800);
  };

  const activeSettingsTabID = () =>
    settingsTabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.settingsTab || "terminal";

  const settingsTabLabel = (tabID) => {
    const tab = settingsTabs.find((item) => item.dataset.settingsTab === tabID);
    return String(tab?.textContent || "设置").trim() || "设置";
  };

  const renderSettingsMobileNav = () => {
    if (!settingsMobileNav) {
      return;
    }
    settingsMobileNav.textContent = "";
    for (const tab of settingsTabs) {
      const tabID = String(tab.dataset.settingsTab || "").trim();
      if (!tabID) {
        continue;
      }
      const row = document.createElement("div");
      row.className = "settings-mobile-nav-row";
      row.setAttribute("role", "listitem");
      const button = document.createElement("button");
      button.className = "settings-mobile-nav-item";
      button.type = "button";
      button.dataset.settingsMobileNavTab = tabID;
      button.textContent = settingsTabLabel(tabID);
      row.append(button);
      settingsMobileNav.append(row);
    }
  };

  const isSettingsDetailVisible = () => !isMobileLayout() || settingsMobileView === "detail";

  const syncSettingsMobileNavigation = () => {
    const isMobile = isMobileLayout();
    const view = isMobile ? settingsMobileView : "detail";
    const activeTabID = activeSettingsTabID();
    if (settingsPanel) {
      settingsPanel.dataset.mobileSettingsView = view;
    }
    if (settingsMobileNav) {
      settingsMobileNav.hidden = !isMobile || view !== "index";
      for (const item of settingsMobileNav.querySelectorAll("[data-settings-mobile-nav-tab]")) {
        const current = item.dataset.settingsMobileNavTab === activeTabID;
        item.setAttribute("aria-current", current ? "page" : "false");
      }
    }
    if (settingsTitle) {
      settingsTitle.textContent = isMobile && view === "detail" ? settingsTabLabel(activeTabID) : "设置";
    }
    if (settingsBack) {
      const label = isMobile && view === "detail" ? "返回设置列表" : "返回";
      settingsBack.setAttribute("aria-label", label);
      settingsBack.title = label;
    }
  };

  const focusSettingsMobileNavItem = () => {
    const activeTabID = activeSettingsTabID();
    const navItems = Array.from(settingsMobileNav?.querySelectorAll("[data-settings-mobile-nav-tab]") || []);
    const activeItem = navItems.find((item) => item.dataset.settingsMobileNavTab === activeTabID);
    const firstItem = settingsMobileNav?.querySelector("[data-settings-mobile-nav-tab]");
    (activeItem || firstItem)?.focus();
  };

  const openSettingsMobileIndex = ({ focus = true } = {}) => {
    settingsMobileView = "index";
    syncSettingsMobileNavigation();
    if (focus) {
      window.setTimeout(focusSettingsMobileNavItem, 0);
    }
  };

  const openSettingsMobileDetail = (tabID, { focus = true } = {}) => {
    setActiveSettingsTab(tabID);
    settingsMobileView = "detail";
    syncSettingsMobileNavigation();
    if (focus) {
      window.setTimeout(() => settingsBack?.focus(), 0);
    }
  };

  const setActiveSettingsTab = (tabID) => {
    const requestedTabID = String(tabID || "terminal").trim() || "terminal";
    const nextTabID = settingsTabs.some((tab) => tab.dataset.settingsTab === requestedTabID)
      ? requestedTabID
      : "terminal";
    const wasServiceForwardsActive = isServiceForwardsSettingsActive();
    for (const tab of settingsTabs) {
      const selected = tab.dataset.settingsTab === nextTabID;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of settingsTabPanels) {
      panel.hidden = panel.dataset.settingsPanel !== nextTabID;
    }
    if (nextTabID === "theme") {
      renderSettingsThemeList();
    } else {
      hideSettingsThemeScrollbar();
    }
    if (nextTabID === "mobile-shortcuts") {
      renderSettingsMobileShortcuts();
    } else {
      hideSettingsMobileShortcutsScrollbar();
    }
    if (nextTabID === "service-forwards") {
      renderServiceForwardSettings();
      if (!wasServiceForwardsActive) {
        refreshServiceForwards().catch((error) => setSettingsFeedback(error.message || "服务转发列表加载失败。", "error"));
      }
    }
    syncSettingsMobileNavigation();
  };

  const registeredFontFaceKey = (font) => `${font?.id || ""}:${font?.family || ""}`;

  const registerUploadedFont = async (font) => {
    const key = registeredFontFaceKey(font);
    if (!font?.id || !font.family || registeredFontFaces.has(key) || typeof FontFace !== "function") {
      return;
    }
    if (!document.fonts) {
      return;
    }
    const face = new FontFace(font.family, `url(${cssString(fontFileSource(font))})`, { display: "swap" });
    await face.load();
    document.fonts.add(face);
    registeredFontFaces.set(key, face);
  };

  const registerUploadedFonts = async (fonts) => {
    const failures = [];
    await Promise.all(fonts.map(async (font) => {
      try {
        await registerUploadedFont(font);
      } catch (error) {
        failures.push(font.label || font.filename || font.id);
      }
    }));
    if (failures.length > 0) {
      setSettingsFeedback(`部分字体加载失败：${failures.join("、")}`, "error");
    }
  };

  const registerTerminalSymbolFont = async (font) => {
    if (!font) {
      return;
    }
    try {
      await registerUploadedFont(font);
    } catch (error) {
      setSettingsFeedback("Nerd Font 符号字体加载失败，starship prompt 可能显示异常。", "error");
    }
  };

  const buildTerminalFontFamily = (selected) => [
    selected?.family ? cssString(selected.family) : "",
    terminalSymbolFont?.family ? cssString(terminalSymbolFont.family) : "",
    defaultTerminalFontFamily,
  ].filter(Boolean).join(", ");

  const applyTerminalFont = () => {
    const selected = uploadedFonts.find((font) => font.id === activeTerminalFontID);
    terminalOptionsBase.fontFamily = buildTerminalFontFamily(selected);
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        beginTerminalPresentationHold(pane);
        pane.term.options.fontFamily = terminalOptionsBase.fontFamily;
        refreshTerminalMetrics(pane, { deferFitRetry: true });
      }
    }
  };

  const syncFontEditControls = () => {
    if (settingsFontEditButton) {
      settingsFontEditButton.disabled = !fontEditMode && uploadedFonts.length === 0;
      settingsFontEditButton.classList.toggle("settings-icon-button", !fontEditMode);
      settingsFontEditButton.classList.toggle("settings-text-button", fontEditMode);
      settingsFontEditButton.setAttribute("aria-pressed", fontEditMode ? "true" : "false");
      settingsFontEditButton.setAttribute("aria-label", fontEditMode ? "完成编辑" : "编辑字体");
      settingsFontEditButton.title = fontEditMode ? "完成编辑" : "编辑字体";
      settingsFontEditButton.innerHTML = fontEditMode ? "完成" : settingsFontEditButtonHTML;
    }
    if (settingsFontUploadButton) {
      settingsFontUploadButton.hidden = fontEditMode;
    }
    if (settingsFontDeleteSelectedButton) {
      const count = selectedFontDeleteIDs.size;
      settingsFontDeleteSelectedButton.hidden = !fontEditMode;
      settingsFontDeleteSelectedButton.disabled = count === 0;
      settingsFontDeleteSelectedButton.textContent = count > 0 ? `删除 ${count}` : "删除";
    }
    settingsFontCards?.classList.toggle("is-editing", fontEditMode);
  };

  const renderSettingsFonts = () => {
    if (!settingsFontCards) {
      return;
    }
    for (const id of [...selectedFontDeleteIDs]) {
      if (!uploadedFonts.some((font) => font.id === id)) {
        selectedFontDeleteIDs.delete(id);
      }
    }
    settingsFontCards.textContent = "";
    const defaultCard = document.createElement("button");
    defaultCard.type = "button";
    defaultCard.className = "settings-font-card system";
    defaultCard.dataset.fontId = "";
    defaultCard.setAttribute("role", "option");
    defaultCard.setAttribute("aria-selected", activeTerminalFontID ? "false" : "true");
    defaultCard.setAttribute("aria-disabled", fontEditMode ? "true" : "false");
    defaultCard.innerHTML = `
      <span class="settings-font-card-check" aria-hidden="true"></span>
      <span class="settings-font-card-title">系统默认</span>
      <span class="settings-font-card-meta">内置终端字体</span>
      <span class="settings-font-card-state">${activeTerminalFontID ? "" : "当前使用"}</span>
    `;
    settingsFontCards.appendChild(defaultCard);
    for (const font of uploadedFonts) {
      const selectedForDelete = selectedFontDeleteIDs.has(font.id);
      const active = font.id === activeTerminalFontID;
      const card = document.createElement("button");
      card.type = "button";
      card.className = font.builtin ? "settings-font-card builtin" : "settings-font-card";
      card.dataset.fontId = font.id;
      card.dataset.builtin = font.builtin ? "true" : "false";
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", active ? "true" : "false");
      card.setAttribute("aria-pressed", selectedForDelete ? "true" : "false");
      const size = formatBytes(font.size);
      const title = document.createElement("span");
      title.className = "settings-font-card-title";
      title.textContent = font.label || font.filename || font.family;
      const meta = document.createElement("span");
      meta.className = "settings-font-card-meta";
      meta.textContent = [font.builtin ? "预装字体" : font.filename, size].filter(Boolean).join(" · ");
      const state = document.createElement("span");
      state.className = "settings-font-card-state";
      state.textContent = active ? "当前使用" : "";
      const check = document.createElement("span");
      check.className = "settings-font-card-check";
      check.setAttribute("aria-hidden", "true");
      card.append(check, title, meta, state);
      settingsFontCards.appendChild(card);
    }
    syncFontEditControls();
  };

  const shortcutAt = (rows, rowIndex, index) => rows?.[rowIndex]?.[index] || null;

  const updateMobileShortcutRows = (mutator, { persist = true } = {}) => {
    const nextRows = cloneMobileShortcutRows(mobileShortcutRowsConfig);
    mutator(nextRows);
    applyMobileShortcutRows(nextRows);
    if (persist) {
      saveMobileShortcuts(nextRows).catch((error) => setSettingsFeedback(error.message || "手机快捷键保存失败。", "error"));
    }
  };

  const mobileShortcutByID = (id) => {
    for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
      const index = (mobileShortcutRowsConfig[rowIndex] || []).findIndex((shortcut) => shortcut.id === id);
      if (index >= 0) {
        return { rowIndex, index, shortcut: mobileShortcutRowsConfig[rowIndex][index] };
      }
    }
    return null;
  };

  const createMobileShortcutDivider = () => {
    const divider = document.createElement("div");
    divider.className = "settings-mobile-shortcut-divider";
    divider.dataset.mobileShortcutDivider = "true";
    const label = document.createElement("span");
    label.textContent = "第二行";
    divider.appendChild(label);
    return divider;
  };

  const createSettingsMobileShortcutItem = (shortcut, rowIndex, index) => {
    const item = document.createElement("div");
    item.className = "settings-mobile-shortcut-item";
    item.dataset.rowIndex = String(rowIndex);
    item.dataset.shortcutIndex = String(index);
    item.dataset.shortcutId = shortcut.id;
    const drag = document.createElement("button");
    drag.type = "button";
    drag.className = "settings-mobile-shortcut-drag";
    drag.textContent = "\u2630";
    drag.setAttribute("aria-label", "拖拽排序");
    drag.title = "拖拽排序";
    const main = document.createElement("div");
    main.className = "settings-mobile-shortcut-main";
    const name = document.createElement("div");
    name.className = "settings-mobile-shortcut-name";
    name.textContent = shortcut.label;
    const summary = document.createElement("div");
    summary.className = "settings-mobile-shortcut-summary";
    summary.textContent = describeMobileShortcut(shortcut);
    main.append(name, summary);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "settings-mobile-shortcut-edit";
    edit.dataset.action = "edit";
    edit.textContent = "编辑";
    edit.setAttribute("aria-label", `编辑 ${shortcut.label}`);
    item.append(drag, main, edit);
    return item;
  };

  const renderSettingsMobileShortcuts = () => {
    if (!settingsMobileShortcutList) {
      return;
    }
    settingsMobileShortcutList.textContent = "";
    (mobileShortcutRowsConfig[0] || []).forEach((shortcut, index) => {
      settingsMobileShortcutList.appendChild(createSettingsMobileShortcutItem(shortcut, 0, index));
    });
    settingsMobileShortcutList.appendChild(createMobileShortcutDivider());
    (mobileShortcutRowsConfig[1] || []).forEach((shortcut, index) => {
      settingsMobileShortcutList.appendChild(createSettingsMobileShortcutItem(shortcut, 1, index));
    });
    if ((mobileShortcutRowsConfig[0] || []).length === 0 && (mobileShortcutRowsConfig[1] || []).length === 0) {
      const empty = document.createElement("div");
      empty.className = "settings-mobile-shortcut-empty";
      empty.textContent = "暂无快捷键";
      settingsMobileShortcutList.appendChild(empty);
    }
  };

  const createSettingsDesktopShortcutItem = (shortcut, index) => {
    const item = document.createElement("div");
    item.className = "settings-desktop-shortcut-item";
    item.dataset.shortcutIndex = String(index);
    item.dataset.shortcutId = shortcut.id;
    const main = document.createElement("div");
    main.className = "settings-desktop-shortcut-main";
    const name = document.createElement("div");
    name.className = "settings-desktop-shortcut-name";
    name.textContent = shortcut.label;
    const summary = document.createElement("div");
    summary.className = "settings-desktop-shortcut-summary";
    summary.textContent = `${desktopShortcutActionLabels.get(shortcut.action) || shortcut.action} · ${displayShortcut(shortcut.shortcut)}`;
    main.append(name, summary);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "settings-desktop-shortcut-edit";
    edit.dataset.action = "edit";
    edit.textContent = "编辑";
    edit.setAttribute("aria-label", `编辑 ${shortcut.label}`);
    item.append(main, edit);
    return item;
  };

  const renderSettingsDesktopShortcuts = () => {
    if (!settingsDesktopShortcutList) {
      return;
    }
    settingsDesktopShortcutList.textContent = "";
    desktopShortcutsConfig.forEach((shortcut, index) => {
      settingsDesktopShortcutList.appendChild(createSettingsDesktopShortcutItem(shortcut, index));
    });
    if (desktopShortcutsConfig.length === 0) {
      const empty = document.createElement("div");
      empty.className = "settings-desktop-shortcut-empty";
      empty.textContent = "暂无快捷键";
      settingsDesktopShortcutList.appendChild(empty);
    }
  };

  const setServiceForwardStatus = (message, tone = "info") => {
    if (!serviceForwardStatus) {
      return;
    }
    const text = String(message || "").trim();
    serviceForwardStatus.hidden = !text;
    serviceForwardStatus.textContent = text;
    serviceForwardStatus.dataset.tone = tone;
  };

  const isServiceForwardsSettingsActive = () =>
    settingsBackdrop && !settingsBackdrop.hidden &&
    isSettingsDetailVisible() &&
    settingsTabs.some((tab) => tab.dataset.settingsTab === "service-forwards" && tab.getAttribute("aria-selected") === "true");

  const publishAPIURL = (path) => {
    const normalized = String(path || "").replace(/^\/+/, "");
    return new URL(`./${normalized}`, window.location.href).toString();
  };

  const readJSONSafe = async (response) => {
    const text = await response.text().catch(() => "");
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return { message: trimmed };
    }
  };

  const responseErrorMessage = (data, fallback) =>
    String(data?.error || data?.message || fallback || "请求失败").trim();

  const requestPublishListApi = async () => {
    const response = await fetch(publishAPIURL("/api/publish/list"), {
      cache: "no-store",
      credentials: "include",
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      throw new Error(responseErrorMessage(data, `服务转发列表加载失败 (${response.status})`));
    }
    return Array.isArray(data) ? data : [];
  };

  const requestPublishStatusApi = async () => {
    const response = await fetch(publishAPIURL("/api/publish/status"), {
      cache: "no-store",
      credentials: "include",
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      throw new Error(responseErrorMessage(data, `服务转发状态加载失败 (${response.status})`));
    }
    return data || {};
  };

  const requestPublishCreateApi = async (payload) => {
    const response = await fetch(publishAPIURL("/api/publish/http/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      throw new Error(responseErrorMessage(data, `服务转发创建失败 (${response.status})`));
    }
    return data || {};
  };

  const requestPublishUpdateApi = async (payload) => {
    const response = await fetch(publishAPIURL("/api/publish/http/update"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      throw new Error(responseErrorMessage(data, `服务转发更新失败 (${response.status})`));
    }
    return data || {};
  };

  const requestPublishDeleteApi = async (payload) => {
    const response = await fetch(publishAPIURL("/api/publish/http/delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      throw new Error(responseErrorMessage(data, `服务转发删除失败 (${response.status})`));
    }
    return data || {};
  };

  const requestPublishInstallShellLPKApi = async (payload) => {
    const formData = new FormData();
    formData.set("id", String(payload?.id || "").trim());
    formData.set("subdomain", String(payload?.subdomain || "").trim());
    formData.set("title", String(payload?.title || "").trim());
    formData.set("skip_auth", String(Boolean(payload?.skip_auth)));
    if (payload?.iconFile instanceof File) {
      formData.set("icon", payload.iconFile, payload.iconFile.name || "icon.png");
    }
    const response = await fetch(publishAPIURL("/api/publish/http/install-shell-lpk"), {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      throw new Error(responseErrorMessage(data, `服务转发部署失败 (${response.status})`));
    }
    return data || {};
  };

  const normalizePublishedEntry = (item) => ({
    id: String(item?.id || "").trim(),
    token: String(item?.token || "").trim(),
    instance_name: String(item?.instance_name || "").trim(),
    upstream: String(item?.upstream || "").trim(),
    package_id: String(item?.package_id || "").trim(),
    app_domain: String(item?.app_domain || "").trim(),
    app_url: String(item?.app_url || "").trim(),
    subdomain: String(item?.subdomain || "").trim(),
    title: String(item?.title || "").trim(),
    skip_auth: Boolean(item?.skip_auth),
    installed_at: String(item?.installed_at || "").trim(),
    created_at: String(item?.created_at || "").trim(),
    upstream_url: String(item?.upstream_url || "").trim(),
  });

  const serviceForwardEntryMatchesActive = (entry) => {
    const entryName = String(entry?.instance_name || "").trim();
    const currentName = String(activeName || "").trim();
    if (!entryName || !currentName) {
      return false;
    }
    if (entryName === currentName) {
      return true;
    }
    const activeBareName = currentName.split("@", 1)[0];
    return !entryName.includes("@") && entryName === activeBareName;
  };

  const normalizePublishStatus = (value) => ({
    ready: value?.ready === true,
    port: Number(value?.port || 0),
    warning_code: String(value?.warning_code || "").trim(),
  });

  const buildPublishServiceWarningMessage = (status) => {
    if (!status || status.ready) {
      return "";
    }
    if (status.warning_code === "port_in_use" && status.port > 0) {
      return `主机端口 ${status.port} 已被占用，服务转发暂时不可用。`;
    }
    return "";
  };

  const parsePublishedEntryUpstream = (rawValue) => {
    const raw = String(rawValue || "").trim();
    if (!raw) {
      return { protocol: "http", host: "127.0.0.1", port: 0, path: "" };
    }
    try {
      const parsed = new URL(raw);
      const protocol = String(parsed.protocol || "http:").replace(/:$/, "").toLowerCase() || "http";
      const defaultPort = protocol === "https" ? 443 : 80;
      const path = parsed.search
        ? `${parsed.pathname || "/"}${parsed.search}`
        : parsed.pathname && parsed.pathname !== "/"
          ? parsed.pathname
          : "";
      return {
        protocol,
        host: String(parsed.hostname || "127.0.0.1").trim() || "127.0.0.1",
        port: Number(parsed.port || defaultPort),
        path,
      };
    } catch {
      return { protocol: "http", host: "127.0.0.1", port: 0, path: "" };
    }
  };

  const normalizeServiceForwardSubdomain = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 63);

  const defaultServiceForwardTitle = () => {
    const active = getActiveInstance?.();
    return instanceDisplayName?.(active) || String(activeName || "").split("@", 1)[0] || "Service";
  };

  const buildUpstreamURL = ({ protocol, host, port, path } = {}) => {
    const scheme = String(protocol || "").trim().toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      throw new Error("请选择有效协议。");
    }
    const upstreamHost = String(host || "").trim();
    if (!upstreamHost) {
      throw new Error("请输入上游主机。");
    }
    const upstreamPort = Number(port || 0);
    if (!Number.isInteger(upstreamPort) || upstreamPort <= 0 || upstreamPort > 65535) {
      throw new Error("请输入 1-65535 之间的端口。");
    }
    let hostPart = upstreamHost;
    if (hostPart.includes(":") && !hostPart.startsWith("[") && !hostPart.endsWith("]")) {
      hostPart = `[${hostPart}]`;
    }
    let suffix = String(path || "").trim();
    if (suffix.includes("#")) {
      throw new Error("路径或查询参数不能包含 #。");
    }
    if (suffix && !suffix.startsWith("/") && !suffix.startsWith("?")) {
      suffix = `/${suffix}`;
    } else if (suffix.startsWith("?")) {
      suffix = `/${suffix}`;
    }
    const upstream = `${scheme}://${hostPart}:${upstreamPort}${suffix}`;
    try {
      const parsed = new URL(upstream);
      if (parsed.protocol !== `${scheme}:` || !parsed.hostname) {
        throw new Error();
      }
      return upstream;
    } catch {
      throw new Error("上游地址不是有效的 HTTP/HTTPS URL。");
    }
  };

  const renderServiceForwardSettings = () => {
    if (!serviceForwardList) {
      return;
    }
    serviceForwardList.textContent = "";
    if (!activeName) {
      const empty = document.createElement("div");
      empty.className = "settings-service-forward-empty";
      empty.textContent = "当前没有可用容器。";
      serviceForwardList.appendChild(empty);
      return;
    }
    if (serviceForwardEntries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "settings-service-forward-empty";
      empty.textContent = "暂无服务转发。";
      serviceForwardList.appendChild(empty);
      return;
    }
    for (const entry of serviceForwardEntries) {
      const item = document.createElement("div");
      item.className = "settings-service-forward-item";
      item.dataset.forwardId = entry.id;

      const main = document.createElement("div");
      main.className = "settings-service-forward-main";

      const title = document.createElement("div");
      title.className = "settings-service-forward-title";
      title.textContent = entry.title || entry.subdomain || entry.package_id || entry.upstream || "未命名服务";

      const meta = document.createElement("div");
      meta.className = "settings-service-forward-meta";
      meta.textContent = entry.upstream || "未设置上游地址";

      const state = document.createElement("div");
      state.className = "settings-service-forward-state";
      const stateParts = [];
      if (entry.installed_at && entry.subdomain) {
        stateParts.push(`已部署：${entry.subdomain}`);
      } else {
        stateParts.push("未安装应用入口");
      }
      if (entry.skip_auth) {
        stateParts.push("不使用账号保护");
      }
      state.textContent = stateParts.join(" · ");

      main.append(title, meta, state);

      const actions = document.createElement("div");
      actions.className = "settings-service-forward-item-actions";

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "settings-text-button";
      openButton.dataset.action = "open";
      openButton.textContent = "打开";
      openButton.disabled = serviceForwardBusy || !entry.app_url;

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "settings-text-button";
      editButton.dataset.action = "edit";
      editButton.textContent = "编辑";
      editButton.disabled = serviceForwardBusy;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "settings-text-button danger";
      deleteButton.dataset.action = "delete";
      deleteButton.textContent = "删除";
      deleteButton.disabled = serviceForwardBusy;

      actions.append(openButton, editButton, deleteButton);
      item.append(main, actions);
      serviceForwardList.appendChild(item);
    }
  };

  const setServiceForwardBusy = (busy) => {
    serviceForwardBusy = Boolean(busy);
    for (const control of [
      serviceForwardAddButton,
      serviceForwardProtocolInput,
      serviceForwardHostInput,
      serviceForwardPortInput,
      serviceForwardPortStepUp,
      serviceForwardPortStepDown,
      serviceForwardPathInput,
      serviceForwardTitleInput,
      serviceForwardSubdomainInput,
      serviceForwardIconInput,
      serviceForwardSkipAuthInput,
      serviceForwardDeleteButton,
      serviceForwardCancelButton,
      serviceForwardSubmitButton,
      ...Array.from(serviceForwardList?.querySelectorAll("button") || []),
    ]) {
      if (control) {
        control.disabled = serviceForwardBusy;
      }
    }
  };

  const findServiceForwardEntry = (id) => {
    const forwardID = String(id || "").trim();
    return serviceForwardEntries.find((entry) => entry.id === forwardID) || null;
  };

  const refreshServiceForwards = async ({ showFeedback = false } = {}) => {
    if (!serviceForwardList) {
      return [];
    }
    const requestSeq = ++serviceForwardRequestSeq;
    setServiceForwardStatus("正在加载服务转发...", "info");
    if (showFeedback) {
      setSettingsFeedback("");
    }
    try {
      const items = await requestPublishListApi();
      if (requestSeq !== serviceForwardRequestSeq) {
        return serviceForwardEntries;
      }
      serviceForwardEntries = items
        .map(normalizePublishedEntry)
        .filter((entry) => entry.id && serviceForwardEntryMatchesActive(entry));
      renderServiceForwardSettings();
      let warning = "";
      try {
        warning = buildPublishServiceWarningMessage(normalizePublishStatus(await requestPublishStatusApi()));
      } catch (error) {
        warning = error.message || "服务转发状态加载失败。";
      }
      if (requestSeq === serviceForwardRequestSeq) {
        setServiceForwardStatus(warning, warning ? "warning" : "info");
      }
      if (showFeedback) {
        setSettingsFeedback("服务转发列表已刷新。", "success");
      }
      return serviceForwardEntries;
    } catch (error) {
      if (requestSeq === serviceForwardRequestSeq) {
        serviceForwardEntries = [];
        renderServiceForwardSettings();
        setServiceForwardStatus(error.message || "服务转发列表加载失败。", "error");
      }
      if (showFeedback) {
        setSettingsFeedback(error.message || "服务转发列表加载失败。", "error");
      }
      throw error;
    }
  };

  const resetServiceForwardForm = () => {
    closeMobileCustomSelect();
    serviceForwardEditingID = "";
    if (serviceForwardEditor) {
      serviceForwardEditor.hidden = true;
    }
    if (serviceForwardForm) {
      serviceForwardForm.hidden = true;
    }
    if (serviceForwardFormTitle) {
      serviceForwardFormTitle.textContent = "添加服务";
    }
    if (serviceForwardProtocolInput) {
      serviceForwardProtocolInput.value = "http";
    }
    if (serviceForwardHostInput) {
      serviceForwardHostInput.value = "127.0.0.1";
    }
    if (serviceForwardPortInput) {
      serviceForwardPortInput.value = "";
    }
    if (serviceForwardPathInput) {
      serviceForwardPathInput.value = "";
    }
    if (serviceForwardTitleInput) {
      serviceForwardTitleInput.value = "";
    }
    if (serviceForwardSubdomainInput) {
      serviceForwardSubdomainInput.value = "";
    }
    if (serviceForwardIconInput) {
      serviceForwardIconInput.value = "";
    }
    if (serviceForwardSkipAuthInput) {
      serviceForwardSkipAuthInput.checked = false;
    }
    if (serviceForwardDeleteButton) {
      serviceForwardDeleteButton.hidden = true;
    }
  };

  const openServiceForwardForm = (entry = null) => {
    const normalized = entry ? normalizePublishedEntry(entry) : null;
    const upstream = parsePublishedEntryUpstream(normalized?.upstream || "");
    serviceForwardEditingID = normalized?.id || "";
    if (serviceForwardEditor) {
      serviceForwardEditor.hidden = false;
    }
    if (serviceForwardForm) {
      serviceForwardForm.hidden = false;
    }
    if (serviceForwardFormTitle) {
      serviceForwardFormTitle.textContent = serviceForwardEditingID ? "编辑服务" : "添加服务";
    }
    if (serviceForwardProtocolInput) {
      serviceForwardProtocolInput.value = upstream.protocol === "https" ? "https" : "http";
    }
    if (serviceForwardHostInput) {
      serviceForwardHostInput.value = upstream.host || "127.0.0.1";
    }
    if (serviceForwardPortInput) {
      serviceForwardPortInput.value = upstream.port > 0 ? String(upstream.port) : "";
    }
    if (serviceForwardPathInput) {
      serviceForwardPathInput.value = upstream.path || "";
    }
    const title = normalized?.title || defaultServiceForwardTitle();
    if (serviceForwardTitleInput) {
      serviceForwardTitleInput.value = normalized?.title || "";
      if (!normalized) {
        serviceForwardTitleInput.value = title;
      }
    }
    if (serviceForwardSubdomainInput) {
      serviceForwardSubdomainInput.value = normalized?.subdomain || normalizeServiceForwardSubdomain(title);
    }
    if (serviceForwardIconInput) {
      serviceForwardIconInput.value = "";
    }
    if (serviceForwardSkipAuthInput) {
      serviceForwardSkipAuthInput.checked = normalized?.skip_auth === true;
    }
    if (serviceForwardDeleteButton) {
      serviceForwardDeleteButton.hidden = !serviceForwardEditingID;
    }
    window.setTimeout(() => serviceForwardPortInput?.focus(), 0);
  };

  const collectServiceForwardPayload = () => {
    const title = String(serviceForwardTitleInput?.value || "").trim();
    if (!title) {
      throw new Error("请输入显示名称。");
    }
    const subdomain = String(serviceForwardSubdomainInput?.value || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain)) {
      throw new Error("子域名只能包含小写字母、数字和连字符，且必须以字母或数字开头。");
    }
    const iconFile = serviceForwardIconInput?.files?.[0] || null;
    if (iconFile && iconFile.type && iconFile.type !== "image/png") {
      throw new Error("图标必须是 PNG 图片。");
    }
    return {
      id: serviceForwardEditingID,
      upstream: buildUpstreamURL({
        protocol: serviceForwardProtocolInput?.value,
        host: serviceForwardHostInput?.value,
        port: Number(serviceForwardPortInput?.value || 0),
        path: serviceForwardPathInput?.value,
      }),
      title,
      subdomain,
      iconFile,
      skip_auth: serviceForwardSkipAuthInput?.checked === true,
    };
  };

  const stepServiceForwardPort = (delta) => {
    if (!serviceForwardPortInput) {
      return;
    }
    const current = Number(serviceForwardPortInput.value || 0);
    const fallback = serviceForwardProtocolInput?.value === "https" ? 443 : 80;
    const next = Math.max(1, Math.min(65535, Math.round(Number.isFinite(current) && current > 0 ? current : fallback) + delta));
    serviceForwardPortInput.value = String(next);
    serviceForwardPortInput.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const deployServiceForward = async () => {
    if (!activeName) {
      throw new Error("当前没有可用容器。");
    }
    const payload = collectServiceForwardPayload();
    const status = normalizePublishStatus(await requestPublishStatusApi());
    const warning = buildPublishServiceWarningMessage(status);
    if (warning) {
      throw new Error(warning);
    }
    const existingEntry = payload.id ? findServiceForwardEntry(payload.id) : null;
    if (payload.id && (!existingEntry || !serviceForwardEntryMatchesActive(existingEntry))) {
      throw new Error("无法编辑不属于当前容器的服务。");
    }
    const publishResult = payload.id
      ? await requestPublishUpdateApi({ id: payload.id, upstream: payload.upstream })
      : await requestPublishCreateApi({ instance_name: activeName, upstream: payload.upstream });
    const effectivePublishID = String(publishResult?.record?.id || payload.id || "").trim();
    if (!effectivePublishID) {
      throw new Error("服务转发创建失败。");
    }
    let installResult = null;
    try {
      installResult = await requestPublishInstallShellLPKApi({
        id: effectivePublishID,
        subdomain: payload.subdomain,
        title: payload.title,
        iconFile: payload.iconFile,
        skip_auth: payload.skip_auth,
      });
    } catch (error) {
      if (!payload.id) {
        await requestPublishDeleteApi({ id: effectivePublishID }).catch(() => {});
      }
      throw error;
    }
    resetServiceForwardForm();
    try {
      await refreshServiceForwards();
      setSettingsFeedback(installResult?.apk_build_warning ? "服务已部署，但 APK 生成失败。" : "服务已部署。", "success");
    } catch (error) {
      console.warn(error);
      setSettingsFeedback("服务已部署，但列表刷新失败。", "success");
      setServiceForwardStatus(error.message || "服务转发列表刷新失败。", "error");
    }
  };

  const deleteServiceForward = async (id = serviceForwardEditingID) => {
    const publishID = String(id || "").trim();
    if (!publishID) {
      return false;
    }
    const entry = findServiceForwardEntry(publishID);
    if (!entry || !serviceForwardEntryMatchesActive(entry)) {
      throw new Error("无法删除不属于当前容器的服务。");
    }
    const confirmed = await confirmDialog(`删除服务「${entry.title || entry.subdomain || entry.upstream}」？`, {
      title: "删除服务",
      okText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) {
      return false;
    }
    await requestPublishDeleteApi({ id: publishID });
    if (serviceForwardEditingID === publishID) {
      resetServiceForwardForm();
    }
    await refreshServiceForwards();
    setSettingsFeedback("服务已删除。", "success");
    return true;
  };

  const applySettingsState = async (state, {
    syncScrollbackInput = true,
    syncLineHeightInput = true,
    deferFontLoad = false,
  } = {}) => {
    const fonts = Array.isArray(state?.fonts)
      ? state.fonts.map(normalizeUploadedFont).filter(Boolean)
      : [];
    uploadedFonts = fonts;
    terminalSymbolFont = normalizeTerminalSymbolFont(state?.terminal_symbol_font);
    const nextFontID = String(state?.terminal_font_id || "").trim();
    activeTerminalFontID = uploadedFonts.some((font) => font.id === nextFontID) ? nextFontID : "";
    terminalLineHeightPercent = normalizeTerminalLineHeightPercent(state?.terminal_line_height_percent);
    const previousScrollback = terminalOptionsBase.scrollback;
    terminalOptionsBase.scrollback = normalizeTerminalScrollback(state?.terminal_scrollback);
    invalidateSessionsForTerminalScrollbackChange(previousScrollback, terminalOptionsBase.scrollback);
    applyTerminalScrollback();
    desktopMouseClipboardEnabled = state?.desktop_mouse_clipboard_enabled !== false;
    desktopShortcutsBarEnabled = state?.desktop_shortcuts_bar_enabled === true;
    mobilePixelScrollEnabled = state?.mobile_pixel_scroll_enabled !== false;
    mobileDoubleTapReminderEnabled = state?.mobile_double_tap_reminder_enabled !== false;
    applyMobileShortcutRows(normalizeMobileShortcutRows(state?.mobile_shortcuts), { remember: true });
    const hasCustomDesktopShortcuts = Array.isArray(state?.desktop_shortcuts);
    applyDesktopShortcuts(hasCustomDesktopShortcuts ? state.desktop_shortcuts : defaultDesktopShortcutsConfig, { remember: true });
    if (syncScrollbackInput) {
      syncSettingsScrollbackInput();
    }
    if (syncLineHeightInput) {
      syncSettingsLineHeightInput();
    }
    syncSettingsDesktopMouseClipboardToggle();
    syncSettingsDesktopShortcutsBarToggle();
    syncSettingsMobilePixelScrollToggle();
    syncSettingsMobileDoubleTapReminderToggle();
    syncSettingsDebugOptions();
    resizeActiveTabForCurrentDevice();
    updateMobileActiveTabTitle();
    renderSettingsFonts();
    applyTerminalFont();
    const loadFonts = async () => {
      await registerTerminalSymbolFont(terminalSymbolFont);
      await registerUploadedFonts(uploadedFonts);
      applyTerminalFont();
    };
    if (deferFontLoad) {
      loadFonts().catch((error) => {
        console.warn("Deferred terminal font load failed", error);
      });
      return;
    }
    await loadFonts();
  };

  const loadSettings = async ({ deferFontLoad = false } = {}) => {
    const response = await fetch("./api/settings", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `设置加载失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { deferFontLoad });
  };

  const saveTerminalFontSelection = async (fontID) => measurePerformanceTask("settings save", async () => {
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminal_font_id: fontID || "" }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `字体设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json());
  });

  const saveTerminalScrollback = async (scrollback, { syncScrollbackInput = false, keepalive = false } = {}) => measurePerformanceTask("settings save", async () => {
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminal_scrollback: scrollback }),
      keepalive,
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `滚动历史设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { syncScrollbackInput, syncLineHeightInput: false });
  });

  const saveTerminalLineHeightPercent = async (percent, { syncLineHeightInput = false } = {}) => measurePerformanceTask("settings save", async () => {
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminal_line_height_percent: percent }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `行间距设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { syncScrollbackInput: false, syncLineHeightInput });
  });

  const saveDesktopMouseClipboardEnabled = async (enabled) => measurePerformanceTask("settings save", async () => {
    desktopMouseClipboardEnabled = enabled;
    syncSettingsDesktopMouseClipboardToggle();
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desktop_mouse_clipboard_enabled: enabled }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `鼠标复制粘贴设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { syncScrollbackInput: false, syncLineHeightInput: false });
  });

  const saveDesktopShortcutsBarEnabled = async (enabled) => measurePerformanceTask("settings save", async () => {
    desktopShortcutsBarEnabled = enabled;
    syncSettingsDesktopShortcutsBarToggle();
    resizeActiveTabForCurrentDevice();
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desktop_shortcuts_bar_enabled: enabled }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `PC底部快捷键栏设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { syncScrollbackInput: false, syncLineHeightInput: false });
  });

  const saveMobilePixelScrollEnabled = async (enabled) => measurePerformanceTask("settings save", async () => {
    mobilePixelScrollEnabled = enabled;
    syncSettingsMobilePixelScrollToggle();
    resizeActiveTabForCurrentDevice();
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile_pixel_scroll_enabled: enabled }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `像素级滚动设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { syncScrollbackInput: false, syncLineHeightInput: false });
  });

  const saveMobileDoubleTapReminderEnabled = async (enabled) => measurePerformanceTask("settings save", async () => {
    mobileDoubleTapReminderEnabled = enabled;
    syncSettingsMobileDoubleTapReminderToggle();
    updateMobileActiveTabTitle();
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile_double_tap_reminder_enabled: enabled }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `双击屏幕提醒设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { syncScrollbackInput: false, syncLineHeightInput: false });
  });

  const saveMobileShortcuts = (rows, { reset = false } = {}) => {
    const nextRows = cloneMobileShortcutRows(rows);
    const saveVersion = ++mobileShortcutsSaveVersion;
    mobileShortcutsPersistChain = mobileShortcutsPersistChain.catch(() => {}).then(() => measurePerformanceTask("settings save", async () => {
      const previousRows = cloneMobileShortcutRows(lastSavedMobileShortcutRowsConfig);
      const requestSeq = ++mobileShortcutsSaveRequestSeq;
      setMobileShortcutSaving(true);
      try {
        const response = await fetch("./api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mobile_shortcuts: reset ? null : serializeMobileShortcutRows(nextRows) }),
        });
        if (!response.ok) {
          if (saveVersion === mobileShortcutsSaveVersion && requestSeq === mobileShortcutsSaveRequestSeq) {
            applyMobileShortcutRows(previousRows, { remember: true });
          }
          throw new Error(await readResponseText(response, `手机快捷键保存失败 (${response.status})`));
        }
        if (saveVersion === mobileShortcutsSaveVersion && requestSeq === mobileShortcutsSaveRequestSeq) {
          await applySettingsState(await response.json(), { syncScrollbackInput: false, syncLineHeightInput: false });
        } else {
          lastSavedMobileShortcutRowsConfig = cloneMobileShortcutRows(nextRows);
          await response.text().catch(() => "");
        }
      } finally {
        if (requestSeq === mobileShortcutsSaveRequestSeq) {
          setMobileShortcutSaving(false);
        }
      }
    }));
    return mobileShortcutsPersistChain;
  };

  const saveDesktopShortcuts = (shortcuts, { reset = false } = {}) => {
    const nextShortcuts = cloneDesktopShortcuts(shortcuts);
    const saveVersion = ++desktopShortcutsSaveVersion;
    desktopShortcutsPersistChain = desktopShortcutsPersistChain.catch(() => {}).then(() => measurePerformanceTask("settings save", async () => {
      const previousShortcuts = cloneDesktopShortcuts(lastSavedDesktopShortcutsConfig);
      const requestSeq = ++desktopShortcutsSaveRequestSeq;
      setDesktopShortcutSaving(true);
      try {
        const response = await fetch("./api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ desktop_shortcuts: reset ? null : serializeDesktopShortcuts(nextShortcuts) }),
        });
        if (!response.ok) {
          if (saveVersion === desktopShortcutsSaveVersion && requestSeq === desktopShortcutsSaveRequestSeq) {
            applyDesktopShortcuts(previousShortcuts, { remember: true });
          }
          throw new Error(await readResponseText(response, `PC快捷键保存失败 (${response.status})`));
        }
        if (saveVersion === desktopShortcutsSaveVersion && requestSeq === desktopShortcutsSaveRequestSeq) {
          await applySettingsState(await response.json(), { syncScrollbackInput: false, syncLineHeightInput: false });
        } else {
          lastSavedDesktopShortcutsConfig = cloneDesktopShortcuts(nextShortcuts);
          await response.text().catch(() => "");
        }
      } finally {
        if (requestSeq === desktopShortcutsSaveRequestSeq) {
          setDesktopShortcutSaving(false);
        }
      }
    }));
    return desktopShortcutsPersistChain;
  };

  const populateMobileShortcutEditorOptions = () => {
    if (mobileShortcutKeySelect && mobileShortcutKeySelect.options.length === 0) {
      for (const item of mobileShortcutKeyOptions) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        mobileShortcutKeySelect.appendChild(option);
      }
    }
    if (mobileShortcutActionSelect && mobileShortcutActionSelect.options.length === 0) {
      for (const item of mobileShortcutActionOptions) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        mobileShortcutActionSelect.appendChild(option);
      }
    }
  };

  const selectedMobileShortcutType = () => mobileShortcutTypeInputs.find((input) => input.checked)?.value || "input";

  const setSelectedMobileShortcutType = (type) => {
    const nextType = ["action", "text"].includes(type) ? type : "input";
    for (const input of mobileShortcutTypeInputs) {
      input.checked = input.value === nextType;
    }
  };

  const syncMobileShortcutEditorFields = () => {
    const type = selectedMobileShortcutType();
    const isInput = type === "input";
    const isAction = type === "action";
    const isText = type === "text";
    if (mobileShortcutKeyField) {
      mobileShortcutKeyField.hidden = !isInput;
    }
    if (mobileShortcutActionField) {
      mobileShortcutActionField.hidden = !isAction;
    }
    if (mobileShortcutTextField) {
      mobileShortcutTextField.hidden = !isText;
    }
    if (mobileShortcutModifiersField) {
      mobileShortcutModifiersField.hidden = !isInput;
    }
    if (mobileShortcutCustomKeyField) {
      mobileShortcutCustomKeyField.hidden = !isInput || mobileShortcutKeySelect?.value !== "custom";
    }
  };

  const closeMobileShortcutEditor = () => {
    closeMobileCustomSelect();
    mobileShortcutEditorState = null;
    if (mobileShortcutEditor) {
      mobileShortcutEditor.hidden = true;
    }
  };

  const openMobileShortcutEditor = ({ rowIndex = 0, index = -1 } = {}) => {
    populateMobileShortcutEditorOptions();
    const existing = shortcutAt(mobileShortcutRowsConfig, rowIndex, index);
    mobileShortcutEditorState = { rowIndex, index };
    if (mobileShortcutEditorTitle) {
      mobileShortcutEditorTitle.textContent = existing ? "编辑快捷键" : "新增快捷键";
    }
    if (mobileShortcutEditorDelete) {
      mobileShortcutEditorDelete.hidden = !existing;
    }
    const label = existing?.label || "";
    if (mobileShortcutLabelInput) {
      mobileShortcutLabelInput.value = label;
    }
    if (mobileShortcutActionSelect) {
      mobileShortcutActionSelect.value = existing?.action || "copy";
    }
    if (mobileShortcutTextInput) {
      mobileShortcutTextInput.value = typeof existing?.text === "string" ? existing.text : "";
    }
    const isText = typeof existing?.text === "string" && existing.text !== "";
    const inputKey = existing?.inputKey || "tab";
    const isKnownKey = inputKey !== "" && mobileShortcutKeyOptions.some((item) => item.value === inputKey);
    const isAction = Boolean(existing?.action);
    setSelectedMobileShortcutType(isAction ? "action" : isText ? "text" : "input");
    if (mobileShortcutKeySelect) {
      mobileShortcutKeySelect.value = isKnownKey ? inputKey : "custom";
    }
    if (mobileShortcutCustomKeyInput) {
      mobileShortcutCustomKeyInput.value = isKnownKey ? "" : inputKey;
    }
    const modifiers = normalizeShortcutInputModifiers(existing?.inputModifiers);
    if (mobileShortcutCtrlInput) {
      mobileShortcutCtrlInput.checked = modifiers.ctrl;
    }
    if (mobileShortcutAltInput) {
      mobileShortcutAltInput.checked = modifiers.alt;
    }
    if (mobileShortcutShiftInput) {
      mobileShortcutShiftInput.checked = modifiers.shift;
    }
    syncMobileShortcutEditorFields();
    if (mobileShortcutEditor) {
      mobileShortcutEditor.hidden = false;
      window.setTimeout(() => mobileShortcutLabelInput?.focus(), 0);
    }
  };

  const readMobileShortcutEditorValue = () => {
    const label = String(mobileShortcutLabelInput?.value || "").trim();
    if (!label || Array.from(label).length > 16) {
      throw new Error("快捷键名称必须是 1-16 个字符。");
    }
    if (serializeMobileShortcutRows(mobileShortcutRowsConfig).flat().length >= 64 && Number(mobileShortcutEditorState?.index ?? -1) < 0) {
      throw new Error("手机快捷键最多 64 个。");
    }
    const type = selectedMobileShortcutType();
    const id = shortcutAt(mobileShortcutRowsConfig, mobileShortcutEditorState?.rowIndex, mobileShortcutEditorState?.index)?.id
      || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const shortcut = { id, label, ariaLabel: label };
    if (type === "action") {
      const action = String(mobileShortcutActionSelect?.value || "").trim();
      if (!mobileShortcutActionOptions.some((item) => item.value === action)) {
        throw new Error("请选择有效动作。");
      }
      shortcut.action = action;
      if (action === "open_mobile_menu") {
        shortcut.kind = "menu";
      } else if (action === "toggle_touch_feedback") {
        shortcut.kind = "feedback";
      } else if (action.startsWith("sticky_") || action.startsWith("zoom_")) {
        shortcut.kind = "modifier";
      }
      return shortcut;
    }
    if (type === "text") {
      const text = String(mobileShortcutTextInput?.value ?? "");
      if (!text || Array.from(text).length > 1024) {
        throw new Error("发送文字必须是 1-1024 个字符。");
      }
      if (text.includes("\x00")) {
        throw new Error("发送文字不能包含 NUL 字符。");
      }
      shortcut.text = text;
      shortcut.data = text;
      return shortcut;
    }
    let inputKey = String(mobileShortcutKeySelect?.value || "").trim();
    if (inputKey === "custom") {
      inputKey = Array.from(String(mobileShortcutCustomKeyInput?.value || ""))[0] || "";
    }
    if (!inputKey) {
      throw new Error("请输入或选择按键。");
    }
    shortcut.inputKey = inputKey;
    shortcut.inputModifiers = {
      ctrl: mobileShortcutCtrlInput?.checked === true,
      alt: mobileShortcutAltInput?.checked === true,
      shift: mobileShortcutShiftInput?.checked === true,
    };
    if (["enter", "escape"].includes(inputKey)) {
      shortcut.kind = "primary";
    } else if (inputKey.startsWith("arrow_")) {
      shortcut.kind = "nav";
    } else if (inputKey.length === 1 && !/[A-Za-z0-9]/.test(inputKey)) {
      shortcut.kind = "symbol";
    }
    shortcut.data = encodeMobileShortcutKeyInput(inputKey, shortcut.inputModifiers);
    return shortcut;
  };

  const submitMobileShortcutEditor = () => {
    let shortcut;
    try {
      shortcut = readMobileShortcutEditorValue();
    } catch (error) {
      setSettingsFeedback(error.message || "快捷键设置无效。", "error");
      return;
    }
    const rowIndex = Math.max(0, Math.min(1, Number(mobileShortcutEditorState?.rowIndex || 0)));
    const index = Number(mobileShortcutEditorState?.index ?? -1);
    updateMobileShortcutRows((rows) => {
      if (index >= 0 && rows[rowIndex]?.[index]) {
        rows[rowIndex][index] = shortcut;
      } else {
        rows[rowIndex].push(shortcut);
      }
    });
    closeMobileShortcutEditor();
  };

  const deleteMobileShortcut = async (rowIndex, index) => {
    const shortcut = shortcutAt(mobileShortcutRowsConfig, rowIndex, index);
    if (!shortcut) {
      return false;
    }
    const confirmed = await confirmDialog(`删除快捷键「${shortcut.label}」？`, {
      title: "删除快捷键",
      okText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) {
      return false;
    }
    updateMobileShortcutRows((rows) => {
      rows[rowIndex].splice(index, 1);
    });
    return true;
  };

  const desktopShortcutAt = (index) => desktopShortcutsConfig?.[index] || null;

  const populateDesktopShortcutEditorOptions = () => {
    if (desktopShortcutActionSelect && desktopShortcutActionSelect.options.length === 0) {
      for (const item of desktopShortcutActionOptions) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        desktopShortcutActionSelect.appendChild(option);
      }
    }
    if (desktopShortcutKeySelect && desktopShortcutKeySelect.options.length === 0) {
      const keys = [
        ...Array.from({ length: 12 }, (_, index) => [`f${index + 1}`, `F${index + 1}`]),
        ["tab", "Tab"],
        ["home", "Home"],
        ["end", "End"],
        ["page_up", "PageUp"],
        ["page_down", "PageDown"],
        ...Array.from({ length: 10 }, (_, index) => [String(index), String(index)]),
        ...Array.from({ length: 26 }, (_, index) => {
          const value = String.fromCharCode(97 + index);
          return [value, value.toUpperCase()];
        }),
      ];
      for (const [value, label] of keys) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        desktopShortcutKeySelect.appendChild(option);
      }
    }
  };

  const parseShortcutState = (shortcut) => {
    const state = { ctrl: false, shift: false, alt: false, superKey: false, key: "" };
    for (const part of String(shortcut || "").split("+")) {
      const token = normalizeShortcutKeyToken(part);
      switch (token) {
        case "ctrl":
          state.ctrl = true;
          break;
        case "shift":
          state.shift = true;
          break;
        case "alt":
          state.alt = true;
          break;
        case "super":
          state.superKey = true;
          break;
        default:
          state.key = token;
          break;
      }
    }
    return state;
  };

  const setDesktopShortcutEditorShortcut = (shortcut) => {
    const state = parseShortcutState(shortcut);
    if (desktopShortcutCtrlInput) {
      desktopShortcutCtrlInput.checked = state.ctrl;
    }
    if (desktopShortcutAltInput) {
      desktopShortcutAltInput.checked = state.alt;
    }
    if (desktopShortcutShiftInput) {
      desktopShortcutShiftInput.checked = state.shift;
    }
    if (desktopShortcutCommandInput) {
      desktopShortcutCommandInput.checked = state.superKey;
    }
    if (desktopShortcutKeySelect) {
      desktopShortcutKeySelect.value = state.key || "tab";
      if (desktopShortcutKeySelect.value !== (state.key || "tab")) {
        desktopShortcutKeySelect.value = "tab";
      }
    }
    if (desktopShortcutCaptureInput) {
      desktopShortcutCaptureInput.value = displayShortcut(serializeShortcut(state));
    }
  };

  const readDesktopShortcutEditorShortcut = () => serializeShortcut({
    ctrl: desktopShortcutCtrlInput?.checked === true,
    shift: desktopShortcutShiftInput?.checked === true,
    alt: desktopShortcutAltInput?.checked === true,
    superKey: desktopShortcutCommandInput?.checked === true,
    key: String(desktopShortcutKeySelect?.value || "").trim(),
  });

  const syncDesktopShortcutCaptureInput = () => {
    if (desktopShortcutCaptureInput) {
      desktopShortcutCaptureInput.value = displayShortcut(readDesktopShortcutEditorShortcut());
    }
  };

  const closeDesktopShortcutEditor = () => {
    closeMobileCustomSelect();
    desktopShortcutEditorState = null;
    if (desktopShortcutEditor) {
      desktopShortcutEditor.hidden = true;
    }
  };

  const openDesktopShortcutEditor = ({ index = -1 } = {}) => {
    populateDesktopShortcutEditorOptions();
    const existing = desktopShortcutAt(index);
    desktopShortcutEditorState = { index };
    if (desktopShortcutEditorTitle) {
      desktopShortcutEditorTitle.textContent = existing ? "编辑PC快捷键" : "新增PC快捷键";
    }
    if (desktopShortcutEditorDelete) {
      desktopShortcutEditorDelete.hidden = !existing;
    }
    if (desktopShortcutLabelInput) {
      desktopShortcutLabelInput.value = existing?.label || "";
    }
    if (desktopShortcutActionSelect) {
      desktopShortcutActionSelect.value = existing?.action || "copy_terminal";
    }
    setDesktopShortcutEditorShortcut(existing?.shortcut || "Ctrl + Shift + c");
    syncDesktopShortcutCaptureInput();
    if (desktopShortcutEditor) {
      desktopShortcutEditor.hidden = false;
      window.setTimeout(() => desktopShortcutLabelInput?.focus(), 0);
    }
  };

  const readDesktopShortcutEditorValue = () => {
    const label = String(desktopShortcutLabelInput?.value || "").trim();
    if (!label || Array.from(label).length > 32) {
      throw new Error("快捷键名称必须是 1-32 个字符。");
    }
    if (desktopShortcutsConfig.length >= 64 && Number(desktopShortcutEditorState?.index ?? -1) < 0) {
      throw new Error("PC快捷键最多 64 个。");
    }
    const action = String(desktopShortcutActionSelect?.value || "").trim();
    if (!desktopShortcutActionLabels.has(action)) {
      throw new Error("请选择有效动作。");
    }
    const shortcut = readDesktopShortcutEditorShortcut();
    if (!normalizeShortcutDefinition(shortcut)) {
      throw new Error("请输入有效快捷键。");
    }
    const id = desktopShortcutAt(desktopShortcutEditorState?.index)?.id
      || `desktop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, label, action, shortcut: displayShortcut(shortcut) };
  };

  const submitDesktopShortcutEditor = () => {
    let shortcut;
    try {
      shortcut = readDesktopShortcutEditorValue();
      const normalizedShortcut = normalizeShortcutDefinition(shortcut.shortcut);
      const duplicate = desktopShortcutsConfig.some((item, itemIndex) =>
        itemIndex !== Number(desktopShortcutEditorState?.index ?? -1) && normalizeShortcutDefinition(item.shortcut) === normalizedShortcut);
      if (duplicate) {
        throw new Error("该快捷键已经被其他动作使用。");
      }
    } catch (error) {
      setSettingsFeedback(error.message || "PC快捷键设置无效。", "error");
      return;
    }
    const index = Number(desktopShortcutEditorState?.index ?? -1);
    const nextShortcuts = cloneDesktopShortcuts(desktopShortcutsConfig);
    if (index >= 0 && nextShortcuts[index]) {
      nextShortcuts[index] = shortcut;
    } else {
      nextShortcuts.push(shortcut);
    }
    applyDesktopShortcuts(nextShortcuts);
    saveDesktopShortcuts(nextShortcuts).catch((error) => setSettingsFeedback(error.message || "PC快捷键保存失败。", "error"));
    closeDesktopShortcutEditor();
  };

  const deleteDesktopShortcut = async (index) => {
    const shortcut = desktopShortcutAt(index);
    if (!shortcut) {
      return false;
    }
    const confirmed = await confirmDialog(`删除快捷键「${shortcut.label}」？`, {
      title: "删除快捷键",
      okText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) {
      return false;
    }
    const nextShortcuts = cloneDesktopShortcuts(desktopShortcutsConfig);
    nextShortcuts.splice(index, 1);
    applyDesktopShortcuts(nextShortcuts);
    saveDesktopShortcuts(nextShortcuts).catch((error) => setSettingsFeedback(error.message || "PC快捷键删除失败。", "error"));
    return true;
  };

  const collectMobileShortcutRowsFromList = () => {
    const rows = [[], []];
    if (!settingsMobileShortcutList) {
      return cloneMobileShortcutRows(mobileShortcutRowsConfig);
    }
    let rowIndex = 0;
    for (const child of settingsMobileShortcutList.children) {
      if (child.dataset?.mobileShortcutDivider === "true") {
        rowIndex = 1;
        continue;
      }
      if (!child.classList?.contains("settings-mobile-shortcut-item")) {
        continue;
      }
      const found = mobileShortcutByID(child.dataset.shortcutId || "");
      if (found?.shortcut) {
        rows[rowIndex].push(found.shortcut);
      }
    }
    return rows;
  };

  const cleanupMobileShortcutDrag = () => {
    document.removeEventListener("pointermove", updateMobileShortcutDragTarget);
    document.removeEventListener("pointerup", finishMobileShortcutDrag);
    document.removeEventListener("pointercancel", cancelMobileShortcutDrag);
    document.body.classList.remove("is-mobile-shortcut-dragging");
  };

  const startMobileShortcutDrag = (event, item) => {
    if (!(event instanceof PointerEvent) || event.button !== 0) {
      return;
    }
    if (!settingsMobileShortcutList || !item?.parentElement) {
      return;
    }
    event.preventDefault();
    const rect = item.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "settings-mobile-shortcut-placeholder";
    placeholder.style.height = `${rect.height}px`;
    item.parentElement.insertBefore(placeholder, item);
    item.classList.add("is-dragging");
    item.style.position = "fixed";
    item.style.left = `${rect.left}px`;
    item.style.top = `${rect.top}px`;
    item.style.width = `${rect.width}px`;
    item.style.zIndex = "140";
    item.style.pointerEvents = "none";
    document.body.appendChild(item);
    document.body.classList.add("is-mobile-shortcut-dragging");
    mobileShortcutDragState = {
      pointerId: event.pointerId,
      item,
      placeholder,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    document.addEventListener("pointermove", updateMobileShortcutDragTarget);
    document.addEventListener("pointerup", finishMobileShortcutDrag);
    document.addEventListener("pointercancel", cancelMobileShortcutDrag);
  };

  const updateMobileShortcutDragTarget = (event) => {
    if (!mobileShortcutDragState || !(event instanceof PointerEvent)) {
      return;
    }
    event.preventDefault();
    const { item, placeholder, offsetX, offsetY } = mobileShortcutDragState;
    item.style.left = `${event.clientX - offsetX}px`;
    item.style.top = `${event.clientY - offsetY}px`;
    if (!settingsMobileShortcutList || !placeholder) {
      return;
    }
    const listRect = settingsMobileShortcutList.getBoundingClientRect();
    const children = Array.from(settingsMobileShortcutList.children)
      .filter((child) => child !== placeholder && !child.classList.contains("settings-mobile-shortcut-empty"));
    if (event.clientY <= listRect.top) {
      settingsMobileShortcutList.insertBefore(placeholder, children[0] || null);
      return;
    }
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        settingsMobileShortcutList.insertBefore(placeholder, child);
        return;
      }
    }
    settingsMobileShortcutList.appendChild(placeholder);
  };

  const finishMobileShortcutDrag = (event) => {
    if (!mobileShortcutDragState || !(event instanceof PointerEvent) || event.pointerId !== mobileShortcutDragState.pointerId) {
      return;
    }
    const state = mobileShortcutDragState;
    mobileShortcutDragState = null;
    cleanupMobileShortcutDrag();
    state.item.classList.remove("is-dragging");
    state.item.removeAttribute("style");
    state.placeholder.parentElement?.insertBefore(state.item, state.placeholder);
    state.placeholder.remove();
    const nextRows = collectMobileShortcutRowsFromList();
    applyMobileShortcutRows(nextRows);
    saveMobileShortcuts(nextRows).catch((error) => setSettingsFeedback(error.message || "手机快捷键保存失败。", "error"));
  };

  const cancelMobileShortcutDrag = () => {
    if (!mobileShortcutDragState) {
      return;
    }
    const state = mobileShortcutDragState;
    mobileShortcutDragState = null;
    cleanupMobileShortcutDrag();
    state.item.classList.remove("is-dragging");
    state.item.removeAttribute("style");
    state.placeholder.parentElement?.insertBefore(state.item, state.placeholder);
    state.placeholder.remove();
    renderSettingsMobileShortcuts();
  };

  const saveTerminalLineHeightFromInput = () => {
    let percent = defaultTerminalLineHeightPercent;
    try {
      percent = readSettingsLineHeightInput();
    } catch (error) {
      syncSettingsLineHeightInput();
      setSettingsFeedback(error.message || "行间距设置无效。", "error");
      return;
    }
    if (percent === terminalLineHeightPercent) {
      return;
    }
    const requestSeq = ++settingsLineHeightSaveRequestSeq;
    setSettingsLineHeightSaving(true);
    saveTerminalLineHeightPercent(percent)
      .catch((error) => {
        if (requestSeq === settingsLineHeightSaveRequestSeq) {
          syncSettingsLineHeightInput();
          setSettingsFeedback(error.message || "行间距设置保存失败。", "error");
        }
      })
      .finally(() => {
        if (requestSeq === settingsLineHeightSaveRequestSeq) {
          setSettingsLineHeightSaving(false);
        }
      });
  };

  const scheduleTerminalLineHeightSave = () => {
    window.clearTimeout(settingsLineHeightSaveTimer);
    try {
      readSettingsLineHeightInput();
    } catch (error) {
      return;
    }
    settingsLineHeightSaveTimer = window.setTimeout(saveTerminalLineHeightFromInput, 360);
  };

  const saveTerminalScrollbackFromInput = ({ keepalive = false, showFeedback = true } = {}) => {
    window.clearTimeout(settingsScrollbackSaveTimer);
    settingsScrollbackSaveTimer = 0;
    let scrollback = defaultTerminalScrollback;
    try {
      scrollback = readSettingsScrollbackInput();
    } catch (error) {
      if (showFeedback) {
        syncSettingsScrollbackInput();
        setSettingsFeedback(error.message || "滚动历史设置无效。", "error");
      }
      return Promise.resolve(false);
    }
    if (scrollback === terminalOptionsBase.scrollback) {
      return Promise.resolve(false);
    }
    const requestSeq = ++settingsScrollbackSaveRequestSeq;
    if (!keepalive) {
      setSettingsScrollbackSaving(true);
    }
    return saveTerminalScrollback(scrollback, { keepalive })
      .then(() => {
        if (showFeedback && requestSeq === settingsScrollbackSaveRequestSeq) {
          setSettingsFeedback("滚动历史设置已保存，刷新或新建终端后生效。", "success");
        }
        return true;
      })
      .catch((error) => {
        if (requestSeq === settingsScrollbackSaveRequestSeq) {
          if (showFeedback) {
            syncSettingsScrollbackInput();
            setSettingsFeedback(error.message || "滚动历史设置保存失败。", "error");
          }
        }
        return false;
      })
      .finally(() => {
        if (!keepalive && requestSeq === settingsScrollbackSaveRequestSeq) {
          setSettingsScrollbackSaving(false);
        }
      });
  };

  const scheduleTerminalScrollbackSave = () => {
    window.clearTimeout(settingsScrollbackSaveTimer);
    try {
      readSettingsScrollbackInput();
    } catch (error) {
      return;
    }
    settingsScrollbackSaveTimer = window.setTimeout(() => {
      settingsScrollbackSaveTimer = 0;
      saveTerminalScrollbackFromInput();
    }, 360);
  };

  let terminalScrollbackKeepaliveValue = 0;
  const flushPendingTerminalScrollbackSave = () => {
    let scrollback = defaultTerminalScrollback;
    try {
      scrollback = readSettingsScrollbackInput();
    } catch (error) {
      return;
    }
    if (scrollback === terminalOptionsBase.scrollback || scrollback === terminalScrollbackKeepaliveValue) {
      return;
    }
    terminalScrollbackKeepaliveValue = scrollback;
    saveTerminalScrollbackFromInput({ keepalive: true, showFeedback: false }).finally(() => {
      if (terminalScrollbackKeepaliveValue === scrollback) {
        terminalScrollbackKeepaliveValue = 0;
      }
    });
  };

  const uploadTerminalFonts = async (files) => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (selectedFiles.length === 0) {
      return;
    }
    const form = new FormData();
    for (const file of selectedFiles) {
      form.append("font", file);
    }
    const response = await fetch("./api/settings/fonts", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `字体上传失败 (${response.status})`));
    }
    await applySettingsState(await response.json());
  };

  const deleteFont = async (fontID) => {
    const selected = uploadedFonts.find((font) => font.id === fontID);
    if (!selected) {
      return;
    }
    const suffix = selected.id === activeTerminalFontID ? "\n删除后终端将恢复系统默认字体。" : "";
    const confirmed = await confirmDialog(`删除字体「${selected.label}」？${suffix}`, {
      title: "删除字体",
      okText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const response = await fetch(`./api/settings/fonts/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `字体删除失败 (${response.status})`));
    }
    await loadSettings();
    setSettingsFeedback("字体已删除。", "success");
  };

  const deleteSelectedFonts = async () => {
    const ids = [...selectedFontDeleteIDs].filter((id) => uploadedFonts.some((font) => font.id === id));
    if (ids.length === 0) {
      syncFontEditControls();
      return;
    }
    const suffix = ids.includes(activeTerminalFontID) ? "\n删除当前字体后终端将恢复系统默认字体。" : "";
    const confirmed = await confirmDialog(`删除选中的 ${ids.length} 个字体？${suffix}`, {
      title: "批量删除字体",
      okText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    if (settingsFontDeleteSelectedButton) {
      settingsFontDeleteSelectedButton.disabled = true;
    }
    await Promise.all(ids.map(async (id) => {
      const response = await fetch(`./api/settings/fonts/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readResponseText(response, `字体删除失败 (${response.status})`));
      }
    }));
    selectedFontDeleteIDs.clear();
    await loadSettings();
    syncFontEditControls();
  };

  const openSettings = (tabID = "terminal") => {
    closeContextMenu();
    closeThemePicker();
    closeDevicePanel();
    closeInstanceSwitcher();
    renderSettingsMobileNav();
    settingsMobileView = isMobileLayout() ? "index" : "detail";
    setActiveSettingsTab(tabID);
    renderSettingsFonts();
    renderSettingsThemeList();
    renderSettingsMobileShortcuts();
    renderServiceForwardSettings();
    syncSettingsScrollbackInput();
    syncSettingsLineHeightInput();
    syncSettingsDebugOptions();
    syncSettingsDesktopMouseClipboardToggle();
    syncSettingsDesktopShortcutsBarToggle();
    syncSettingsMobilePixelScrollToggle();
    syncSettingsMobileDoubleTapReminderToggle();
    setSettingsFeedback("");
    if (settingsBackdrop) {
      settingsBackdrop.hidden = false;
      syncSettingsMobileNavigation();
      window.setTimeout(() => {
        if (isMobileLayout() && settingsMobileView === "index") {
          focusSettingsMobileNavItem();
          return;
        }
        settingsTabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.focus();
      }, 0);
    }
    loadSettings().catch((error) => setSettingsFeedback(error.message || "设置加载失败。", "error"));
  };

  const initializeClientSettingsEntry = async () => {
    if (!clientSettingsMenuButton) {
      return;
    }
    try {
      if (!await isIndependentClient()) {
        return;
      }
    } catch (error) {
      return;
    }
    clientSettingsMenuButton.hidden = false;
  };

  const openThemeSettings = () => {
    if (isMobileLayout()) {
      openThemePicker();
      return;
    }
    openSettings("theme");
  };

  const closeSettings = () => {
    const wasOpen = settingsBackdrop && !settingsBackdrop.hidden;
    closeMobileCustomSelect();
    hideSettingsThemeScrollbar();
    if (settingsBackdrop) {
      settingsBackdrop.hidden = true;
    }
    settingsMobileView = "detail";
    syncSettingsMobileNavigation();
    resetServiceForwardForm();
    if (wasOpen) {
      window.setTimeout(() => activeSession()?.term?.focus(), 0);
    }
  };

  const instanceSelector = (item) => {
    const explicitSelector = String(item?.selector || item?.target || "").trim();
    if (explicitSelector) {
      return explicitSelector;
    }
    const clientInstanceID = String(item?.client_instance_id || "").trim();
    if (clientInstanceID) {
      return `client:${clientInstanceID}`;
    }
    const name = String(item?.name || "").trim();
    const ownerDeployID = String(item?.owner_deploy_id || "").trim();
    if (!name || !ownerDeployID) {
      return "";
    }
    return `${name}@${ownerDeployID}`;
  };

  const instanceDisplayName = (item) => String(item?.name || "").trim() || instanceSelector(item).split("@", 1)[0];
  const getActiveInstance = () => currentInstances.find((item) => instanceSelector(item) === activeName) || null;
  const isClientInstanceName = (name = activeName) => String(name || "").trim().startsWith("client:");
  const isRunningInstance = (item) => item?.status === "running";
  const workspaceCacheV2IdentityFromState = (state, expectedSelector = activeName) => {
    const selector = String(state?.selector || expectedSelector || "").trim();
    const cacheProtocolVersion = Number(state?.cache_protocol_version || 0);
    const cacheScopeID = String(state?.cache_scope_id || "").trim();
    const workspaceGeneration = String(state?.workspace_generation || "").trim();
    if (
      isClientInstanceName(selector)
      || cacheProtocolVersion !== 2
      || !cacheScopeID
      || !workspaceGeneration
      || !selector
    ) {
      return null;
    }
    return { cacheProtocolVersion, cacheScopeID, selector, workspaceGeneration };
  };
  const workspaceCacheV2IdentityKey = (identity) => identity
    ? JSON.stringify([
      identity.cacheProtocolVersion,
      identity.cacheScopeID,
      identity.selector,
      identity.workspaceGeneration,
    ])
    : "";
  const setActiveWorkspaceCacheV2Identity = (identity) => {
    const next = identity ? { ...identity } : null;
    if (workspaceCacheV2IdentityKey(next) === workspaceCacheV2IdentityKey(activeWorkspaceCacheV2Identity)) {
      return false;
    }
    activeWorkspaceCacheV2Identity = next;
    activeWorkspaceCacheV2Epoch += 1;
    return true;
  };
  const setActiveInstanceName = (name) => {
    const normalized = String(name || "").trim();
    if (normalized !== activeName) {
      activeName = normalized;
      activeInstanceGeneration += 1;
      setActiveWorkspaceCacheV2Identity(null);
      if (terminalNetworkMonitor) {
        syncTerminalNetworkMonitorSockets({ reset: true });
      }
    }
    return activeInstanceGeneration;
  };
  const isCurrentInstanceRequest = (name, generation) =>
    String(name || "").trim() === activeName && generation === activeInstanceGeneration;
  const isCurrentInstanceSession = (session) => {
    const name = String(session?.name || "").trim();
    return Boolean(name) && name === activeName;
  };
  const storedSessionTerminalCacheV2Identity = (session, historyGeneration = session?.historyGeneration || "") => {
    if (
      !session?.cacheV2WorkspaceIdentity
      || isClientInstanceName(session.name)
    ) {
      return null;
    }
    return {
      ...session.cacheV2WorkspaceIdentity,
      tabID: String(session.tabId || "").trim(),
      paneID: String(session.id || "").trim(),
      historyGeneration: String(historyGeneration || "").trim(),
    };
  };

  const scheduleTerminalCacheV2OrphanPreviewCleanup = () => {
    if (
      terminalCacheV2OrphanPreviewCleanupScheduled
      || disposed
      || !terminalCacheV2.available
      || !activeWorkspaceCacheV2Identity
      || isClientInstanceName(activeName)
    ) {
      return;
    }
    terminalCacheV2OrphanPreviewCleanupScheduled = true;
    const cleanup = () => {
      terminalCacheV2OrphanPreviewCleanupScheduled = false;
      if (disposed || !activeWorkspaceCacheV2Identity) {
        return;
      }
      const paneIdentities = [];
      for (const tab of tabs.values()) {
        for (const pane of tab.panes.values()) {
          if (pane.closed || pane.name !== activeName) {
            continue;
          }
          paneIdentities.push({ tabID: tab.id, paneID: pane.id });
        }
      }
      terminalCacheV2.cleanupOrphanedPreviews({
        workspaceIdentity: activeWorkspaceCacheV2Identity,
        paneIdentities,
      }).then((result) => {
        if (Number(result?.removedPreviews || 0) > 0) {
          appendDebugLog("info", "终端总览预览已清理", `移除 ${result.removedPreviews} 个已不存在会话的预览`);
          scheduleTabOverviewRender();
        }
      }).catch((error) => {
        appendDebugWarning("终端总览预览清理失败", error?.message || String(error));
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(cleanup, { timeout: 2000 });
    } else {
      window.setTimeout(cleanup, 0);
    }
  };
  const sessionHasTerminalCacheV2Protocol = (session) => Boolean(
    session
    && !session.closed
    && !isClientInstanceName(session.name)
    && session.cacheV2WorkspaceIdentity
    && session.cacheV2Epoch === activeWorkspaceCacheV2Epoch
    && workspaceCacheV2IdentityKey(session.cacheV2WorkspaceIdentity) === workspaceCacheV2IdentityKey(activeWorkspaceCacheV2Identity)
  );
  const sessionUsesTerminalCacheV2 = (session) => Boolean(
    terminalCacheV2.available && sessionHasTerminalCacheV2Protocol(session)
  );
  const sessionUsesLegacyHistoryCache = (session) => Boolean(session && isClientInstanceName(session.name));
  const sessionTerminalCacheV2ProtocolIdentity = (session, historyGeneration = session?.historyGeneration || "") => {
    if (!sessionHasTerminalCacheV2Protocol(session)) {
      return null;
    }
    return storedSessionTerminalCacheV2Identity(session, historyGeneration);
  };
  const sessionTerminalCacheV2Identity = (session, historyGeneration = session?.historyGeneration || "") => {
    if (!sessionUsesTerminalCacheV2(session)) {
      return null;
    }
    return storedSessionTerminalCacheV2Identity(session, historyGeneration);
  };
  const terminalCacheV2MetricNow = () => (
    typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now()
  );
  const startSessionCacheV2RecoveryMetrics = (session) => {
    if (!sessionHasTerminalCacheV2Protocol(session)) {
      session.cacheV2RecoveryMetrics = null;
      return null;
    }
    const now = terminalCacheV2MetricNow();
    const workspaceMetrics = latestWorkspaceRecoveryMetrics;
    const hasRecentWorkspaceMetrics = Boolean(
      workspaceMetrics
      && workspaceMetrics.selector === session.name
      && workspaceMetrics.readyAt > 0
      && now - workspaceMetrics.readyAt <= 5000
    );
    session.cacheV2RecoveryMetrics = {
      startedAt: hasRecentWorkspaceMetrics ? workspaceMetrics.startedAt : now,
      workspaceRequestStartedAt: hasRecentWorkspaceMetrics ? workspaceMetrics.startedAt : 0,
      workspaceReadyAt: hasRecentWorkspaceMetrics ? workspaceMetrics.readyAt : 0,
      cacheManifestReadyAt: 0,
      websocketOpenAt: 0,
      replayStartAt: 0,
      previewVisibleAt: 0,
      previewPreparedAt: 0,
      localFirstFrameAt: 0,
      localReplayCompleteAt: 0,
      historyReplayCompleteAt: 0,
      cacheCommitCompleteAt: 0,
      realCanvasVisibleAt: 0,
      inputReadyAt: 0,
      historySource: "snapshot",
      syncMode: "",
      previewHit: false,
      previewLayoutMatch: null,
      previewMissReason: "",
      localReplayBytes: 0,
      serverReplayBytes: 0,
      reported: false,
    };
    return session.cacheV2RecoveryMetrics;
  };
  const markSessionCacheV2RecoveryMetric = (session, key) => {
    const metrics = session?.cacheV2RecoveryMetrics;
    if (metrics && Object.prototype.hasOwnProperty.call(metrics, key) && !metrics[key]) {
      metrics[key] = terminalCacheV2MetricNow();
    }
  };
  const reportSessionCacheV2RecoveryMetrics = (session) => {
    const metrics = session?.cacheV2RecoveryMetrics;
    if (!metrics || metrics.reported || !metrics.realCanvasVisibleAt || !session?.replayComplete) {
      return;
    }
    metrics.reported = true;
    const elapsed = (timestamp) => timestamp > 0 ? Math.round(timestamp - metrics.startedAt) : null;
    const startupElapsed = (timestamp) => timestamp > 0
      ? Math.round(timestamp - webShellStartupMetrics.navigationStartedAt)
      : null;
    appendStartupTrace("终端恢复阶段完成", `pane=${session.id} replay=${metrics.historyReplayCompleteAt > 0 ? Math.round(metrics.historyReplayCompleteAt - metrics.startedAt) : "?"}ms canvas=${metrics.realCanvasVisibleAt > 0 ? Math.round(metrics.realCanvasVisibleAt - metrics.startedAt) : "?"}ms preview=${metrics.previewPreparedAt > 0 ? Math.round(metrics.previewPreparedAt - metrics.startedAt) : "未准备"}`, { dedupeKey: `recovery-complete:${session.id}:${session.terminalReplayGeneration}` });
    console.info("[terminal-cache-v2] recovery metrics", {
      historySource: metrics.historySource,
      syncMode: metrics.syncMode,
      previewHit: metrics.previewHit,
      previewLayoutMatch: metrics.previewLayoutMatch,
      previewMissReason: metrics.previewMissReason || "",
      workspaceRequestStartMs: elapsed(metrics.workspaceRequestStartedAt),
      workspaceReadyMs: elapsed(metrics.workspaceReadyAt),
      cacheManifestReadyMs: elapsed(metrics.cacheManifestReadyAt),
      websocketOpenMs: elapsed(metrics.websocketOpenAt),
      replayStartMs: elapsed(metrics.replayStartAt),
      previewPreparedMs: elapsed(metrics.previewPreparedAt),
      previewVisibleMs: elapsed(metrics.previewVisibleAt),
      localFirstFrameMs: elapsed(metrics.localFirstFrameAt),
      localReplayCompleteMs: elapsed(metrics.localReplayCompleteAt),
      historyReplayCompleteMs: elapsed(metrics.historyReplayCompleteAt),
      cacheCommitCompleteMs: elapsed(metrics.cacheCommitCompleteAt),
      realCanvasVisibleMs: elapsed(metrics.realCanvasVisibleAt),
      inputReadyMs: elapsed(metrics.inputReadyAt),
      pageModuleStartedMs: startupElapsed(webShellStartupMetrics.moduleStartedAt),
      pageGhosttyReadyMs: startupElapsed(webShellStartupMetrics.ghosttyReadyAt),
      pageThemeReadyMs: startupElapsed(webShellStartupMetrics.themeReadyAt),
      pageSettingsReadyMs: startupElapsed(webShellStartupMetrics.settingsReadyAt),
      pageInstancesReadyMs: startupElapsed(webShellStartupMetrics.instancesReadyAt),
      pageWorkspaceRequestStartMs: startupElapsed(webShellStartupMetrics.workspaceRequestStartedAt),
      pageWorkspaceReadyMs: startupElapsed(webShellStartupMetrics.workspaceReadyAt),
      pageWorkspaceAppliedMs: startupElapsed(webShellStartupMetrics.workspaceAppliedAt),
      pageRealCanvasVisibleMs: startupElapsed(metrics.realCanvasVisibleAt),
      localReplayBytes: metrics.localReplayBytes,
      serverReplayBytes: metrics.serverReplayBytes,
    });
  };
  const responseSelector = (state) => String(state?.selector || "").trim();
  const ensureResponseSelector = (state, expectedName, label = "Workspace") => {
    const selector = responseSelector(state);
    const expected = String(expectedName || "").trim();
    if (selector && expected && selector !== expected) {
      throw new Error(`${label} selector mismatch: expected ${expected}, got ${selector}`);
    }
  };
  const isMacPlatform = () => {
    const platform = String(navigator.userAgentData?.platform || navigator.platform || "");
    if (/mac/i.test(platform)) {
      return true;
    }
    return /\bMacintosh\b|\bMac OS X\b/i.test(String(navigator.userAgent || ""));
  };
  const isIOSPlatform = () => {
    const platform = String(navigator.userAgentData?.platform || navigator.platform || "");
    const userAgent = String(navigator.userAgent || "");
    if (/\b(iPhone|iPad|iPod)\b/i.test(platform) || /\b(iPhone|iPad|iPod)\b/i.test(userAgent)) {
      return true;
    }
    return /\bMac/i.test(platform) && Number(navigator.maxTouchPoints || 0) > 1;
  };
  const isAndroidPlatform = () => {
    const platform = String(navigator.userAgentData?.platform || navigator.platform || "");
    const userAgent = String(navigator.userAgent || "");
    return /\bAndroid\b/i.test(platform) || /\bAndroid\b/i.test(userAgent);
  };
  const usesMobileViewportInsets = () => !isForcePCModeActive() && (isIOSPlatform() || isAndroidPlatform());
  const macShortcut = (mac, fallback) => isMacPlatform() ? mac : fallback;
  const shortcutDefinitions = {
    fullscreen: "F11",
    new_tab: "Ctrl + Shift + t",
    close_tab: "Ctrl + Shift + w",
    close_other_tabs: "Ctrl + Shift + q",
    rename_tab: "Ctrl + Shift + r",
    next_tab: "Ctrl + Tab",
    previous_tab: "Ctrl + Shift + Tab",
    last_tab: macShortcut("Option + 0", "Alt + 0"),
    move_tab_to_first: "Ctrl + Shift + Home",
    move_tab_left: "Ctrl + Shift + Page_Up",
    move_tab_right: "Ctrl + Shift + Page_Down",
    move_tab_to_last: "Ctrl + Shift + End",
    vertical_split: "Ctrl + Shift + j",
    horizontal_split: "Ctrl + Shift + h",
    select_up: macShortcut("Option + k", "Alt + k"),
    select_down: macShortcut("Option + j", "Alt + j"),
    select_left: macShortcut("Option + h", "Alt + h"),
    select_right: macShortcut("Option + l", "Alt + l"),
    close_pane: macShortcut("Ctrl + Option + q", "Ctrl + Alt + q"),
    theme: "Ctrl + Shift + p",
    switch_container: "Ctrl + Shift + o",
    copy_terminal: macShortcut("Command + c", "Ctrl + Shift + c"),
    paste_terminal: macShortcut("Command + v", "Ctrl + Shift + v"),
    search_terminal: "Ctrl + Shift + f",
    attachment_clipboard: "Ctrl + Shift + a",
    attachment_file: macShortcut("Command + Shift + e", "Ctrl + Shift + e"),
  };
  const shortcutActionMap = new Map();

  for (let index = 1; index <= 9; index += 1) {
    shortcutDefinitions[`tab_${index}`] = macShortcut(`Option + ${index}`, `Alt + ${index}`);
  }
  const desktopShortcutActionLabels = new Map([
    ["fullscreen", "全屏"],
    ["new_tab", "新建标签"],
    ["close_tab", "关闭标签"],
    ["close_other_tabs", "关闭其他标签"],
    ["rename_tab", "重命名标签"],
    ["next_tab", "下一个标签"],
    ["previous_tab", "上一个标签"],
    ["last_tab", "最后一个标签"],
    ["move_tab_to_first", "标签移到最前"],
    ["move_tab_left", "标签左移"],
    ["move_tab_right", "标签右移"],
    ["move_tab_to_last", "标签移到最后"],
    ["vertical_split", "左右分屏"],
    ["horizontal_split", "上下分屏"],
    ["select_up", "选择上方窗格"],
    ["select_down", "选择下方窗格"],
    ["select_left", "选择左侧窗格"],
    ["select_right", "选择右侧窗格"],
    ["close_pane", "关闭窗格"],
    ["theme", "主题设置"],
    ["switch_container", "切换实例"],
    ["copy_terminal", "复制终端文本"],
    ["paste_terminal", "粘贴到终端"],
    ["search_terminal", "搜索终端"],
    ["select_all_terminal", "全选终端缓冲区"],
    ["attachment_clipboard", "从剪贴板导入附件"],
    ["attachment_file", "上传附件文件"],
  ]);
  for (let index = 1; index <= 9; index += 1) {
    desktopShortcutActionLabels.set(`tab_${index}`, `切换到第 ${index} 个标签`);
  }
  const desktopShortcutActionOptions = Array.from(desktopShortcutActionLabels.entries()).map(([value, label]) => ({ value, label }));
  const defaultDesktopShortcutsConfig = [
    { id: "fullscreen", label: "全屏", action: "fullscreen", shortcut: shortcutDefinitions.fullscreen },
    { id: "new-tab", label: "新建标签", action: "new_tab", shortcut: shortcutDefinitions.new_tab },
    { id: "close-tab", label: "关闭标签", action: "close_tab", shortcut: shortcutDefinitions.close_tab },
    { id: "close-other-tabs", label: "关闭其他标签", action: "close_other_tabs", shortcut: shortcutDefinitions.close_other_tabs },
    { id: "rename-tab", label: "重命名标签", action: "rename_tab", shortcut: shortcutDefinitions.rename_tab },
    { id: "next-tab", label: "下一个标签", action: "next_tab", shortcut: shortcutDefinitions.next_tab },
    { id: "previous-tab", label: "上一个标签", action: "previous_tab", shortcut: shortcutDefinitions.previous_tab },
    { id: "last-tab", label: "最后一个标签", action: "last_tab", shortcut: shortcutDefinitions.last_tab },
    { id: "move-tab-first", label: "标签移到最前", action: "move_tab_to_first", shortcut: shortcutDefinitions.move_tab_to_first },
    { id: "move-tab-left", label: "标签左移", action: "move_tab_left", shortcut: shortcutDefinitions.move_tab_left },
    { id: "move-tab-right", label: "标签右移", action: "move_tab_right", shortcut: shortcutDefinitions.move_tab_right },
    { id: "move-tab-last", label: "标签移到最后", action: "move_tab_to_last", shortcut: shortcutDefinitions.move_tab_to_last },
    { id: "vertical-split", label: "左右分屏", action: "vertical_split", shortcut: shortcutDefinitions.vertical_split },
    { id: "horizontal-split", label: "上下分屏", action: "horizontal_split", shortcut: shortcutDefinitions.horizontal_split },
    { id: "select-up", label: "选择上方窗格", action: "select_up", shortcut: shortcutDefinitions.select_up },
    { id: "select-down", label: "选择下方窗格", action: "select_down", shortcut: shortcutDefinitions.select_down },
    { id: "select-left", label: "选择左侧窗格", action: "select_left", shortcut: shortcutDefinitions.select_left },
    { id: "select-right", label: "选择右侧窗格", action: "select_right", shortcut: shortcutDefinitions.select_right },
    { id: "close-pane", label: "关闭窗格", action: "close_pane", shortcut: shortcutDefinitions.close_pane },
    { id: "theme", label: "主题设置", action: "theme", shortcut: shortcutDefinitions.theme },
    { id: "switch-container", label: "切换实例", action: "switch_container", shortcut: shortcutDefinitions.switch_container },
    { id: "copy-terminal", label: "复制", action: "copy_terminal", shortcut: shortcutDefinitions.copy_terminal },
    { id: "paste-terminal", label: "粘贴", action: "paste_terminal", shortcut: shortcutDefinitions.paste_terminal },
    { id: "search-terminal", label: "搜索", action: "search_terminal", shortcut: shortcutDefinitions.search_terminal },
    { id: "attachment-clipboard", label: "从剪贴板导入附件", action: "attachment_clipboard", shortcut: shortcutDefinitions.attachment_clipboard },
    { id: "attachment-file", label: "上传附件文件", action: "attachment_file", shortcut: shortcutDefinitions.attachment_file },
  ];
  for (let index = 1; index <= 9; index += 1) {
    defaultDesktopShortcutsConfig.push({
      id: `tab-${index}`,
      label: `第 ${index} 个标签`,
      action: `tab_${index}`,
      shortcut: shortcutDefinitions[`tab_${index}`],
    });
  }
  let desktopShortcutsConfig = [];
  let lastSavedDesktopShortcutsConfig = [];

  const normalizeShortcutKeyToken = (token) => {
    const raw = String(token || "").trim();
    if (!raw) {
      return "";
    }
    const lower = raw.toLowerCase();
    const aliases = {
      control: "ctrl",
      meta: "super",
      command: "super",
      cmd: "super",
      option: "alt",
      pageup: "page_up",
      pagedown: "page_down",
      escape: "escape",
      esc: "escape",
      return: "enter",
      " ": "space",
    };
    if (aliases[lower]) {
      return aliases[lower];
    }
    if (/^f\d{1,2}$/i.test(raw)) {
      return lower;
    }
    if (raw.length === 1) {
      return lower;
    }
    return lower.replace(/\s+/g, "_");
  };

  const serializeShortcut = ({ ctrl = false, shift = false, alt = false, superKey = false, key = "" } = {}) => {
    if (!key) {
      return "";
    }
    const parts = [];
    if (ctrl) {
      parts.push("ctrl");
    }
    if (shift) {
      parts.push("shift");
    }
    if (alt) {
      parts.push("alt");
    }
    if (superKey) {
      parts.push("super");
    }
    parts.push(key);
    return parts.join("+");
  };

  const displayShortcut = (shortcut) => String(shortcut || "")
    .split("+")
    .map((part) => {
      const token = normalizeShortcutKeyToken(part);
      switch (token) {
        case "ctrl":
          return "Ctrl";
        case "shift":
          return "Shift";
        case "alt":
          return isMacPlatform() ? "Option" : "Alt";
        case "super":
          return isMacPlatform() ? "Command" : "Super";
        case "page_up":
          return "PageUp";
        case "page_down":
          return "PageDown";
        default:
          if (/^f\d{1,2}$/.test(token)) {
            return token.toUpperCase();
          }
          return token.length === 1 ? token.toUpperCase() : token.replace(/_/g, " ");
      }
    })
    .filter(Boolean)
    .join(" + ");

  const normalizeShortcutDefinition = (value) => {
    const state = { ctrl: false, shift: false, alt: false, superKey: false, key: "" };
    for (const part of String(value || "").split("+")) {
      const token = normalizeShortcutKeyToken(part);
      switch (token) {
        case "ctrl":
          state.ctrl = true;
          break;
        case "shift":
          state.shift = true;
          break;
        case "alt":
          state.alt = true;
          break;
        case "super":
          state.superKey = true;
          break;
        default:
          state.key = token;
          break;
      }
    }
    return serializeShortcut(state);
  };

  const shortcutKeyFromEventCode = (event) => {
    const code = String(event.code || "");
    if (/^Key[A-Z]$/.test(code)) {
      return code.slice(3).toLowerCase();
    }
    if (/^Digit\d$/.test(code)) {
      return code.slice(5);
    }
    return "";
  };

  const getShortcutKeyFromEvent = (event) => {
    let key = normalizeShortcutKeyToken(event.key);
    if (isMacPlatform() && event.altKey) {
      key = shortcutKeyFromEventCode(event) || key;
    }
    if ((!key || key === "process" || Number(event.keyCode || 0) === 229) && (event.ctrlKey || event.altKey || event.metaKey)) {
      key = shortcutKeyFromEventCode(event) || key;
    }
    if (!key || ["ctrl", "shift", "alt", "super"].includes(key)) {
      return "";
    }
    return serializeShortcut({
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      superKey: event.metaKey,
      key,
    });
  };

  const isShiftInsertPasteShortcutEvent = (event) => {
    const key = normalizeShortcutKeyToken(shortcutKeyFromEventCode(event) || event.key);
    const keyCode = Number(event.keyCode || event.which || 0);
    return (key === "insert" || keyCode === 45) && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
  };

  const isNativePasteShortcutEvent = (event) => {
    const key = normalizeShortcutKeyToken(shortcutKeyFromEventCode(event) || event.key);
    const keyCode = Number(event.keyCode || event.which || 0);
    if ((key !== "v" && keyCode !== 86) || event.altKey) {
      return false;
    }
    const ctrlShiftPaste = event.ctrlKey && event.shiftKey && !event.metaKey;
    if (isMacPlatform()) {
      return (event.metaKey && !event.ctrlKey) || ctrlShiftPaste;
    }
    return event.ctrlKey && !event.metaKey;
  };

  const terminalFontSizeShortcutAction = (event) => {
    if (!(event instanceof KeyboardEvent) || event.altKey) {
      return "";
    }
    const usesControl = event.ctrlKey && !event.metaKey;
    const usesCommand = isMacPlatform() && event.metaKey && !event.ctrlKey;
    if (!usesControl && !usesCommand) {
      return "";
    }
    const key = String(event.key || "");
    const code = String(event.code || "");
    if (key === "+" || key === "=" || code === "Equal" || code === "NumpadAdd") {
      return "increase";
    }
    if (key === "-" || key === "_" || code === "Minus" || code === "NumpadSubtract") {
      return "decrease";
    }
    if (key === "0" || (!event.shiftKey && code === "Digit0") || code === "Numpad0") {
      return "reset";
    }
    return "";
  };

  const runTerminalFontSizeShortcut = (event) => {
    const action = terminalFontSizeShortcutAction(event);
    if (!action) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (action === "increase") {
      adjustTerminalFontSize(1);
    } else if (action === "decrease") {
      adjustTerminalFontSize(-1);
    } else {
      resetTerminalFontSize();
    }
    return true;
  };

  const rebuildShortcutActionMap = () => {
    shortcutActionMap.clear();
    for (const item of desktopShortcutsConfig) {
      const shortcut = normalizeShortcutDefinition(item.shortcut);
      if (shortcut) {
        shortcutActionMap.set(shortcut, item.action);
      }
    }
  };

  const showToast = (message) => {
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  };

  const showStartupErrorPanel = (message) => {
    const text = String(message || "").trim();
    if (!startupErrorPanel || !startupErrorText || !text) {
      return;
    }
    startupErrorText.textContent = text;
    startupErrorPanel.hidden = false;
  };

  const hideStartupErrorPanel = () => {
    if (startupErrorPanel) {
      startupErrorPanel.hidden = true;
    }
    if (startupErrorText) {
      startupErrorText.textContent = "";
    }
  };

  const setFeedback = (message) => {
    if (!instanceSwitcherFeedback) {
      return;
    }
    instanceSwitcherFeedback.textContent = message || "";
    instanceSwitcherFeedback.hidden = !message;
  };

  const setDeviceFeedback = (message, tone = "info") => {
    if (!deviceFeedback) {
      return;
    }
    const text = String(message || "").trim();
    deviceFeedback.hidden = !text;
    deviceFeedback.textContent = text;
    deviceFeedback.dataset.tone = tone;
  };

  const normalizeDevicePlatform = () => {
    const platform = String(navigator.userAgentData?.platform || navigator.platform || "");
    const userAgent = String(navigator.userAgent || "");
    if (/\bAndroid\b/i.test(platform) || /\bAndroid\b/i.test(userAgent)) {
      return "Android";
    }
    if (/\b(iPhone|iPad|iPod)\b/i.test(platform) || /\b(iPhone|iPad|iPod)\b/i.test(userAgent)) {
      return "iOS";
    }
    if (/\bMac/i.test(platform)) {
      return Number(navigator.maxTouchPoints || 0) > 1 ? "iOS" : "macOS";
    }
    if (/\bWin/i.test(platform)) {
      return "Windows";
    }
    if (/\bLinux/i.test(platform) || /\bX11\b/i.test(platform)) {
      return "Linux";
    }
    return "Unknown";
  };

  const normalizeDeviceBrowser = () => {
    const userAgent = String(navigator.userAgent || "");
    const brands = navigator.userAgentData?.brands || [];
    const brandNames = brands.map((brand) => String(brand?.brand || "")).filter(Boolean);
    const hasBrand = (pattern) => brandNames.some((brand) => pattern.test(brand));
    if (hasBrand(/Firefox/i) || /\bFirefox\//i.test(userAgent)) {
      return "Firefox";
    }
    if (hasBrand(/Edg/i) || /\bEdg\//i.test(userAgent)) {
      return "Edge";
    }
    if (hasBrand(/Chrome|Chromium/i) || /\bChrome\//i.test(userAgent) || /\bCriOS\//i.test(userAgent)) {
      return "Chrome";
    }
    if (/\bSafari\//i.test(userAgent) && !/\bChrome\/|\bCriOS\/|\bChromium\/|\bEdg\//i.test(userAgent)) {
      return "Safari";
    }
    return "Browser";
  };

  const currentDeviceInfo = () => {
    const platform = normalizeDevicePlatform();
    const devicePlatform = platform === "macOS" ? "Mac" : platform;
    return {
      client_id: serverRevisionClientID,
      device_name: `${devicePlatform === "Unknown" ? "Unknown" : devicePlatform} ${normalizeDeviceBrowser()}`,
      platform,
    };
  };

  const devicesAPIURL = () => new URL("./api/devices", window.location.href).toString();
  const deviceHeartbeatAPIURL = () => new URL("./api/devices/heartbeat", window.location.href).toString();
  const deviceOfflineAPIURL = () => new URL("./api/devices/offline", window.location.href).toString();

  const postDeviceHeartbeat = async () => {
    if (disposed || !debugModeEnabled || navigator.onLine === false) {
      return;
    }
    if (deviceHeartbeatInFlight) {
      return deviceHeartbeatInFlight;
    }
    deviceHeartbeatInFlight = measurePerformanceTask("device heartbeat", async () => {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeout = controller
        ? window.setTimeout(() => controller.abort(), deviceHeartbeatTimeoutMs)
        : 0;
      try {
        const response = await fetch(deviceHeartbeatAPIURL(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentDeviceInfo()),
          signal: controller?.signal,
        });
        if (!response.ok) {
          throw new Error(await readResponseText(response, `设备心跳失败 (${response.status})`));
        }
        deviceHeartbeatLastError = "";
      } finally {
        if (timeout) {
          window.clearTimeout(timeout);
        }
      }
    }).finally(() => {
      deviceHeartbeatInFlight = null;
    });
    return deviceHeartbeatInFlight;
  };

  const handleDeviceHeartbeatError = (error) => {
    const message = error?.message || String(error);
    if (message !== deviceHeartbeatLastError) {
      deviceHeartbeatLastError = message;
      appendDebugError("设备心跳失败", message);
    }
  };

  const sendDeviceOfflineBeacon = () => {
    if (!deviceHeartbeatActive || navigator.onLine === false || !navigator.sendBeacon) {
      return false;
    }
    try {
      return navigator.sendBeacon(
        deviceOfflineAPIURL(),
        new Blob([JSON.stringify({ client_id: serverRevisionClientID })], { type: "application/json" }),
      );
    } catch (error) {
      return false;
    }
  };

  const startDeviceHeartbeat = () => {
    if (!debugModeEnabled) {
      stopDeviceHeartbeat();
      return;
    }
    window.clearInterval(deviceHeartbeatTimer);
    deviceHeartbeatActive = true;
    postDeviceHeartbeat().catch(handleDeviceHeartbeatError);
    deviceHeartbeatTimer = window.setInterval(() => {
      postDeviceHeartbeat().catch(handleDeviceHeartbeatError);
    }, deviceHeartbeatIntervalMs);
  };

  const stopDeviceHeartbeat = () => {
    window.clearInterval(deviceHeartbeatTimer);
    deviceHeartbeatTimer = 0;
    deviceHeartbeatActive = false;
    deviceHeartbeatLastError = "";
  };

  const renderDeviceList = (devices) => {
    if (!deviceList) {
      return;
    }
    deviceList.textContent = "";
    if (!deviceListLoaded && deviceListLoading) {
      const empty = document.createElement("div");
      empty.className = "device-empty";
      empty.textContent = "正在加载设备...";
      deviceList.appendChild(empty);
      return;
    }
    if (!Array.isArray(devices) || devices.length === 0) {
      const empty = document.createElement("div");
      empty.className = "device-empty";
      empty.textContent = "暂无正在连接的设备";
      deviceList.appendChild(empty);
      return;
    }
    for (const device of devices) {
      const item = document.createElement("div");
      item.className = "device-item";
      item.setAttribute("role", "listitem");

      const title = document.createElement("div");
      title.className = "device-item-title";
      const name = String(device?.device_name || "Unknown Browser").trim();
      const platform = String(device?.platform || "Unknown").trim();
      const accountID = String(device?.account_id || "").trim();
      title.textContent = [name, platform, accountID].filter(Boolean).join(" - ");

      const meta = document.createElement("div");
      meta.className = "device-item-meta";
      meta.textContent = "当前在线";

      item.append(title, meta);
      deviceList.appendChild(item);
    }
  };

  const deviceListContentSignature = (devices) => JSON.stringify((devices || []).map((device) => ({
    client_id: String(device?.client_id || "").trim(),
    device_name: String(device?.device_name || "").trim(),
    platform: String(device?.platform || "").trim(),
    account_id: String(device?.account_id || "").trim(),
    joined_at: String(device?.joined_at || "").trim(),
  })));

  const refreshDeviceList = async () => {
    if (!deviceList || !deviceBackdrop || deviceBackdrop.hidden) {
      return [];
    }
    return measurePerformanceTask("device list refresh", async () => {
      const requestSeq = ++deviceListRequestSeq;
      if (!deviceListLoaded) {
        deviceListLoading = true;
        renderDeviceList([]);
      }
      try {
        const response = await fetch(devicesAPIURL(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await readResponseText(response, `设备列表加载失败 (${response.status})`));
        }
        const devices = await response.json();
        if (!Array.isArray(devices)) {
          throw new Error("设备列表响应无效");
        }
        if (requestSeq !== deviceListRequestSeq) {
          return devices;
        }
        deviceListLoaded = true;
        deviceListLoading = false;
        setDeviceFeedback("");
        deviceListLastError = "";
        const nextSignature = deviceListContentSignature(devices);
        if (nextSignature === deviceListSignature) {
          return devices;
        }
        deviceListSignature = nextSignature;
        renderDeviceList(devices);
        return devices;
      } catch (error) {
        const message = error?.message || String(error);
        if (message !== deviceListLastError) {
          deviceListLastError = message;
          appendDebugError("在线设备列表请求失败", message);
        }
        if (requestSeq === deviceListRequestSeq) {
          deviceListLoading = false;
          deviceListLoaded = true;
          if (!deviceListSignature) {
            renderDeviceList([]);
          }
          setDeviceFeedback(error.message || "设备列表加载失败。", "error");
        }
        throw error;
      }
    });
  };

  const startDeviceListRefresh = () => {
    window.clearInterval(deviceListRefreshTimer);
    refreshDeviceList().catch(() => {});
    deviceListRefreshTimer = window.setInterval(() => {
      refreshDeviceList().catch(() => {});
    }, deviceListRefreshIntervalMs);
  };

  const stopDeviceListRefresh = () => {
    window.clearInterval(deviceListRefreshTimer);
    deviceListRefreshTimer = 0;
  };

  const openDevicePanel = () => {
    if (!debugModeEnabled) {
      return;
    }
    closeContextMenu();
    closeThemePicker();
    closeSettings();
    closeInstanceSwitcher();
    deviceListLoaded = false;
    deviceListLoading = true;
    deviceListSignature = "";
    setDeviceFeedback("");
    deviceList?.setAttribute("role", "list");
    renderDeviceList([]);
    if (deviceBackdrop) {
      deviceBackdrop.hidden = false;
    }
    postDeviceHeartbeat().catch(handleDeviceHeartbeatError);
    startDeviceListRefresh();
    window.setTimeout(() => {
      if (isMobileLayout()) {
        deviceBack?.focus();
        return;
      }
      deviceClose?.focus();
    }, 0);
  };

  const closeDevicePanel = () => {
    const wasOpen = deviceBackdrop && !deviceBackdrop.hidden;
    if (deviceBackdrop) {
      deviceBackdrop.hidden = true;
    }
    stopDeviceListRefresh();
    if (wasOpen) {
      window.setTimeout(() => activeSession()?.term?.focus(), 0);
    }
  };

  const instancesLoader = createInstancesLoader({
    isDisposed: () => disposed,
    onInstances: (instances) => {
      currentInstances = instances;
    },
    onRetry: ({ attempt, delay, error }) => {
      console.warn("[instances] startup request retry", {
        attempt,
        delay,
        status: Number(error?.status) || 0,
      });
    },
  });
  const loadInstances = () => instancesLoader.load();

  const loadDefaultInstanceName = async () => {
    const instances = currentInstances.length > 0 ? currentInstances : await loadInstances();
    const target = instances.find((item) => isRunningInstance(item));
    const targetName = instanceSelector(target);
    if (!targetName) {
      throw new Error("No running LightOS instance found");
    }
    return targetName;
  };

  const normalizeLightOSHomeURL = (value) => {
    const homeURL = String(value || "").trim();
    if (!homeURL) {
      throw new Error("LightOS 首页地址不可用。");
    }
    const targetURL = new URL(homeURL, window.location.href);
    if (targetURL.protocol !== "http:" && targetURL.protocol !== "https:") {
      throw new Error("LightOS 首页地址协议无效。");
    }
    return targetURL.toString();
  };

  const loadLightOSHomeURL = () => {
    if (lightOSHomeURL) {
      return Promise.resolve(lightOSHomeURL);
    }
    if (!lightOSHomeURLPromise) {
      lightOSHomeURLPromise = fetch("./api/lightos-admin-info", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await response.text() || `无法获取 LightOS 首页地址 (${response.status})`);
          }
          const info = await response.json();
          lightOSHomeURL = normalizeLightOSHomeURL(info?.home_url);
          return lightOSHomeURL;
        })
        .finally(() => {
          lightOSHomeURLPromise = null;
        });
    }
    return lightOSHomeURLPromise;
  };

  const lightOSHomeURLWithMobileRemoteDesktopPreference = (value) => {
    const targetURL = new URL(value, window.location.href);
    targetURL.searchParams.set("mobile_remote_desktop", mobileRemoteDesktopEnabled ? "1" : "0");
    return targetURL.toString();
  };

  const terminalEstimatedSizeForElement = (element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }
    const metrics = terminalEstimatedFontMetrics();
    if (!metrics?.width || !metrics?.height) {
      return null;
    }
    const style = window.getComputedStyle(element);
    const paddingLeft = Number.parseInt(style.getPropertyValue("padding-left"), 10) || 0;
    const paddingRight = Number.parseInt(style.getPropertyValue("padding-right"), 10) || 0;
    const paddingTop = Number.parseInt(style.getPropertyValue("padding-top"), 10) || 0;
    const paddingBottom = Number.parseInt(style.getPropertyValue("padding-bottom"), 10) || 0;
    const width = Math.max(0, Number(element.clientWidth || 0) - paddingLeft - paddingRight);
    const height = Math.max(0, Number(element.clientHeight || 0) - paddingTop - paddingBottom);
    if (!width || !height) {
      return null;
    }
    return {
      cols: Math.max(2, Math.floor(width / metrics.width)),
      rows: Math.max(1, Math.floor(height / metrics.height)),
    };
  };

  const terminalSizeQuery = () => {
    const tab = currentTab();
    const pane = tab?.panes.get(tab.activePaneId);
    const cols = Number(pane?.term?.cols) || 0;
    const rows = Number(pane?.term?.rows) || 0;
    if (cols > 0 && rows > 0) {
      return { cols, rows };
    }
    const estimated = terminalEstimatedSizeForElement(terminalArea);
    if (estimated) {
      return estimated;
    }
    return {
      cols: 120,
      rows: 32,
    };
  };

  const workspaceURL = (name = activeName) => {
    const url = new URL("./api/workspace", window.location.href);
    url.searchParams.set("name", name);
    const size = terminalSizeQuery();
    url.searchParams.set("cols", String(size.cols));
    url.searchParams.set("rows", String(size.rows));
    return url;
  };

  const workspaceActivityURL = (name = activeName) => {
    const url = new URL("./api/workspace/activity", window.location.href);
    url.searchParams.set("name", name);
    const size = terminalSizeQuery();
    url.searchParams.set("cols", String(size.cols));
    url.searchParams.set("rows", String(size.rows));
    return url;
  };

  const agentStartupErrorURL = (name = activeName) => {
    const url = new URL("./api/agent/startup-error", window.location.href);
    url.searchParams.set("name", name);
    return url;
  };

  const attachmentURL = (name = activeName) => {
    const url = new URL("./api/attachments", window.location.href);
    url.searchParams.set("name", name);
    return url;
  };

  const attachmentFilesURL = (path = "", name = activeName) => {
    const url = new URL("./api/attachments/files", window.location.href);
    url.searchParams.set("name", name);
    if (path) {
      url.searchParams.set("path", path);
    }
    return url;
  };

  const attachmentDownloadURL = (paths, name = activeName) => {
    const url = new URL("./api/attachments/download", window.location.href);
    url.searchParams.set("name", name);
    for (const path of paths || []) {
      url.searchParams.append("path", path);
    }
    return url;
  };

  const serverRevisionURL = (name = activeName) => {
    const url = new URL("./api/server-revision", window.location.href);
    if (name) {
      url.searchParams.set("name", name);
    }
    url.searchParams.set("client_id", serverRevisionClientID);
    return url;
  };

  const webSocketURL = (path) => {
    const url = new URL(path, window.location.href);
    if (url.protocol === "https:") {
      url.protocol = "wss:";
    } else if (url.protocol === "http:") {
      url.protocol = "ws:";
    }
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      throw new Error(`Unsupported WebSocket protocol: ${url.protocol || "unknown"}`);
    }
    return url;
  };

  const observeServerRevision = (state) => {
    const nextRevision = String(state?.server_revision || "").trim();
    if (!nextRevision) {
      return;
    }
    const revisionChanged = Boolean(currentServerRevision && currentServerRevision !== nextRevision);
    currentServerRevision = nextRevision;
    if ((!revisionChanged && state?.reload_required !== true) || serverRevisionReloadPrompted) {
      return;
    }
    serverRevisionReloadPrompted = true;
    showDeployRestartDialog().catch((error) => showToast(error.message || "重启提示失败"));
  };

  const refreshServerRevision = async () => {
    const requestName = activeName;
    const generation = activeInstanceGeneration;
    const response = await fetch(serverRevisionURL(requestName), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text() || `Server revision request failed (${response.status})`);
    }
    if (requestName && !isCurrentInstanceRequest(requestName, generation)) {
      return;
    }
    observeServerRevision(await response.json());
  };

  const scheduleInitialServerRevisionCheck = () => {
    if (serverRevisionInitialCheckScheduled || disposed) {
      return;
    }
    serverRevisionInitialCheckScheduled = true;
    serverRevisionInitialCheckTimer = window.setTimeout(() => {
      serverRevisionInitialCheckTimer = 0;
      if (navigator.onLine === false) {
        appendDebugWarning("版本检查跳过：当前网络离线");
        return;
      }
      refreshServerRevision().catch((error) => {
        appendDebugError("版本检查失败", error?.message || String(error));
      });
    }, 1000);
  };

  const fetchWorkspaceState = async (name = activeName) => {
    if (!name) {
      throw new Error("No running container is available.");
    }
    const response = await fetch(workspaceURL(name), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text() || `Workspace request failed (${response.status})`);
    }
    return response.json();
  };

  const postWorkspaceAction = async (action, payload = {}, {
    focus = true,
    preferStateActiveTab = true,
    applyResponse = true,
  } = {}) => {
    const requestName = activeName;
    const generation = activeInstanceGeneration;
    if (!requestName) {
      throw new Error("No running container is available.");
    }
    const size = terminalSizeQuery();
    const response = await fetch(workspaceURL(requestName), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, cols: size.cols, rows: size.rows, ...payload }),
    });
    if (!response.ok) {
      throw new Error(await response.text() || `Workspace action failed (${response.status})`);
    }
    const state = await response.json();
    if (!isCurrentInstanceRequest(requestName, generation)) {
      return state;
    }
    ensureResponseSelector(state, requestName);
    observeServerRevision(state);
    if (applyResponse) {
      applyWorkspaceState(state, { focus, instanceName: requestName, generation, preferStateActiveTab });
    }
    return state;
  };

  const persistActiveWorkspaceTab = (tabID) => {
    const requestName = activeName;
    const generation = activeInstanceGeneration;
    const chainKey = `${generation}:${requestName}`;
    const previous = activeTabPersistenceChains.get(chainKey) || Promise.resolve();
    let pending = null;
    pending = previous.catch(() => {}).then(() => {
      if (
        !isCurrentInstanceRequest(requestName, generation)
        || activeTabId !== tabID
        || !tabs.has(tabID)
      ) {
        return false;
      }
      return postWorkspaceAction("activate_tab", {
        tab_id: tabID,
        recent_tab_ids: recentTabIds,
      }, {
        focus: false,
        preferStateActiveTab: false,
        applyResponse: false,
      });
    }).finally(() => {
      if (activeTabPersistenceChains.get(chainKey) === pending) {
        activeTabPersistenceChains.delete(chainKey);
      }
    });
    activeTabPersistenceChains.set(chainKey, pending);
    return pending;
  };

  const updateLocationName = (nextName, { replace = false, tabId = activeTabId } = {}) => {
    const nextURL = workspaceLocationURL(nextName, tabId);
    const currentState = currentHistoryStateObject();
    const nextState = {
      ...currentState,
      name: nextName,
    };
    if (!replace) {
      delete nextState[mobileOverviewHistoryGuardStateKey];
    }
    if (replace && currentState[mobileOverviewHistoryGuardStateKey]) {
      nextState[mobileOverviewHistoryGuardStateKey] = true;
    }
    if (replace) {
      window.history.replaceState(nextState, "", nextURL);
      ensureMobileOverviewHistoryGuard();
      return;
    }
    window.history.pushState(nextState, "", nextURL);
    ensureMobileOverviewHistoryGuard();
  };

  const workspaceLocationURL = (nextName, tabId = activeTabId) => {
    const nextURL = new URL(window.location.href);
    nextURL.searchParams.set("name", nextName);
    if (tabId) {
      nextURL.searchParams.set("tab", tabId);
    } else {
      nextURL.searchParams.delete("tab");
    }
    return nextURL;
  };

  const currentHistoryStateObject = () => {
    const state = window.history.state;
    return state && typeof state === "object" ? state : {};
  };

  const historyStateWithoutMobileOverviewGuard = () => {
    const state = {
      ...currentHistoryStateObject(),
    };
    delete state[mobileOverviewHistoryGuardStateKey];
    return state;
  };

  const withMobileOverviewHistoryGuard = (state = currentHistoryStateObject()) => ({
    ...state,
    [mobileOverviewHistoryGuardStateKey]: true,
  });

  const ensureMobileOverviewHistoryGuard = () => {
    if (!isMobileLayout()) {
      return;
    }
    const state = currentHistoryStateObject();
    if (state[mobileOverviewHistoryGuardStateKey]) {
      return;
    }
    window.history.pushState(withMobileOverviewHistoryGuard(state), "", window.location.href);
  };

  const refreshMobileOverviewHistoryGuardForUserGesture = () => {
    if (!isMobileLayout()) {
      return;
    }
    const state = currentHistoryStateObject();
    if (!state[mobileOverviewHistoryGuardStateKey]) {
      window.history.pushState(withMobileOverviewHistoryGuard(state), "", window.location.href);
      return;
    }
    window.history.replaceState(withMobileOverviewHistoryGuard(state), "", window.location.href);
  };

  const openTabOverviewFromHistoryBack = () => {
    if (!isMobileLayout()) {
      return false;
    }
    const state = currentHistoryStateObject();
    if (state[mobileOverviewHistoryGuardStateKey]) {
      return false;
    }
    let restoredState = state;
    if (activeName) {
      restoredState = {
        ...historyStateWithoutMobileOverviewGuard(),
        name: activeName,
      };
      window.history.replaceState(restoredState, "", workspaceLocationURL(activeName, activeTabId));
    }
    window.history.pushState(withMobileOverviewHistoryGuard(restoredState), "", window.location.href);
    if (!hasBlockingOverviewGestureOverlayOpen()) {
      openTabOverview();
    }
    return true;
  };

  const rememberWorkspaceRestoreState = () => {
    if (!suppressWorkspaceRestoreOnce) {
      persistWorkspaceRestoreState(activeName, activeTabId);
    }
  };

  const rememberActiveTab = () => {
    rememberWorkspaceRestoreState();
    if (!activeName || !activeTabId) {
      return;
    }
    window.localStorage.setItem(lastTabStorageKey(activeName), activeTabId);
    if (!suppressLocationUpdate) {
      updateLocationName(activeName, { replace: true, tabId: activeTabId });
    }
  };

  const readRestartTabForName = (name) => {
    const targetName = String(name || "").trim();
    if (!targetName) {
      return "";
    }
    try {
      const raw = window.sessionStorage.getItem(restartTabStorageKey);
      const state = raw ? JSON.parse(raw) : null;
      if (String(state?.name || "").trim() !== targetName) {
        return "";
      }
      return String(state?.tabId || "").trim();
    } catch (error) {
      return "";
    }
  };

  const clearRestartTabForReload = () => {
    try {
      window.sessionStorage.removeItem(restartTabStorageKey);
    } catch (error) {
    }
  };

  const rememberRestartTabForReload = (name, tabId) => {
    const targetName = String(name || "").trim();
    const targetTabId = String(tabId || "").trim();
    if (!targetName || !targetTabId) {
      return;
    }
    try {
      window.sessionStorage.setItem(restartTabStorageKey, JSON.stringify({ name: targetName, tabId: targetTabId }));
    } catch (error) {
    }
    try {
      window.localStorage.setItem(lastTabStorageKey(targetName), targetTabId);
    } catch (error) {
    }
    try {
      updateLocationName(targetName, { replace: true, tabId: targetTabId });
    } catch (error) {
    }
  };

  const suppressBeforeUnloadForNavigation = () => {
    suppressBeforeUnloadOnce = true;
    window.clearTimeout(suppressBeforeUnloadResetTimer);
    suppressBeforeUnloadResetTimer = window.setTimeout(() => {
      suppressBeforeUnloadOnce = false;
      suppressBeforeUnloadResetTimer = 0;
    }, 1000);
  };

  const navigateHome = async () => {
    closeDevicePanel();
    closeInstanceSwitcher();
    rememberActiveTab();
    if (homeMenuButton) {
      homeMenuButton.disabled = true;
    }
    try {
      const targetURL = lightOSHomeURLWithMobileRemoteDesktopPreference(await loadLightOSHomeURL());
      suppressWorkspaceRestoreOnce = true;
      clearWorkspaceRestoreState();
      suppressBeforeUnloadForNavigation();
      window.location.assign(targetURL);
    } catch (error) {
      suppressWorkspaceRestoreOnce = false;
      rememberWorkspaceRestoreState();
      if (homeMenuButton) {
        homeMenuButton.disabled = false;
      }
      showToast(error.message || "无法返回首页");
    }
  };

  const hexToRGB = (value) => {
    const normalized = String(value || "").trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) {
      return null;
    }
    return [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ];
  };

  const rgbaCSS = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

  const themeRGBA = (color, alpha, fallback = "#e5e7eb") => {
    const rgb = hexToRGB(color) || hexToRGB(fallback);
    return rgb ? rgbaCSS(rgb, alpha) : fallback;
  };

  const themeColorFromChannels = (red, green, blue) => {
    const normalizeChannel = (value) =>
      Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
    return `#${normalizeChannel(red)}${normalizeChannel(green)}${normalizeChannel(blue)}`;
  };

  const normalizeThemeColor = (value, fallback = "#000000") => {
    const rgb = hexToRGB(value);
    return rgb ? themeColorFromChannels(rgb[0], rgb[1], rgb[2]) : fallback;
  };

  const updateBrowserThemeColor = (color) => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", normalizeThemeColor(color));
    }
  };

  const parseThemeColor = (color) => {
    const rgb = hexToRGB(normalizeThemeColor(color)) || [0, 0, 0];
    return {
      red: rgb[0],
      green: rgb[1],
      blue: rgb[2],
    };
  };

  const rgbaFromThemeColor = (color, alpha) => {
    const { red, green, blue } = parseThemeColor(color);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };

  const dimThemeColor = (color, factor = 0.3) => {
    const { red, green, blue } = parseThemeColor(color);
    return `rgb(${Math.round(red * factor)}, ${Math.round(green * factor)}, ${Math.round(blue * factor)})`;
  };

  const terminalThemeBrightness = (color) => {
    const { red, green, blue } = parseThemeColor(color);
    return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  };

  const applyThemeDocumentState = () => {
    document.documentElement.style.setProperty("--terminal-bg", activeTheme.background);
    document.documentElement.style.setProperty("--terminal-fg", activeTheme.foreground);
    document.documentElement.style.setProperty("--accent", activeTheme.accent);
    document.documentElement.style.setProperty("--selection-bg", activeTheme.xterm.selectionBackground);
    document.documentElement.style.setProperty("--chrome-bg", activeTheme.background);
    document.documentElement.style.setProperty("--chrome-line", themeRGBA(activeTheme.foreground, 0.18));
    document.documentElement.style.setProperty("--chrome-text", themeRGBA(activeTheme.foreground, 0.78));
    document.documentElement.style.setProperty("--chrome-text-muted", themeRGBA(activeTheme.foreground, 0.64));
    document.documentElement.style.setProperty("--chrome-text-strong", activeTheme.foreground);
    document.documentElement.style.setProperty("--chrome-hover-bg", themeRGBA(activeTheme.foreground, 0.1));
    document.documentElement.style.setProperty("--panel-bg", themeRGBA(activeTheme.background, 0.96, "#111827"));
    document.documentElement.style.setProperty("--panel-border", themeRGBA(activeTheme.foreground, 0.24));
    document.documentElement.style.setProperty("--panel-hover-bg", themeRGBA(activeTheme.foreground, 0.14));
    document.documentElement.style.setProperty("--panel-subtle-bg", themeRGBA(activeTheme.foreground, 0.08));
    document.documentElement.style.setProperty("--panel-input-bg", themeRGBA(activeTheme.foreground, 0.1));
    document.documentElement.style.setProperty("--modal-backdrop-bg", themeRGBA(activeTheme.background, 0.28, "#000000"));
    document.documentElement.style.setProperty("--dialog-button-bg", themeRGBA(activeTheme.foreground, 0.14));
    document.documentElement.style.setProperty("--dialog-button-hover-bg", themeRGBA(activeTheme.foreground, 0.22));
    document.documentElement.style.setProperty("--dialog-button-border", themeRGBA(activeTheme.foreground, 0.28));
    document.documentElement.style.setProperty("--dialog-button-text", activeTheme.foreground);
    document.documentElement.style.setProperty("--text", activeTheme.foreground);
    document.documentElement.style.setProperty("--muted", themeRGBA(activeTheme.foreground, 0.68));
    document.documentElement.style.setProperty("--theme-picker-scrollbar", themeRGBA(activeTheme.foreground, 0.3));
    document.documentElement.style.setProperty("--theme-picker-scrollbar-hover", themeRGBA(activeTheme.foreground, 0.45));
    document.documentElement.style.setProperty("--theme-picker-scrollbar-active", themeRGBA(activeTheme.foreground, 0.6));
    document.documentElement.style.setProperty("--input-focus-border", themeRGBA(activeTheme.accent, 0.52));
    updateBrowserThemeColor(activeTheme.background);
    document.body.dataset.theme = activeTheme.id;
  };

  const colorKey = (rgb) => Array.isArray(rgb) ? rgb.join(",") : "";

  const themeColorValues = (theme) => {
    const xterm = theme?.xterm || {};
    return [
      xterm.foreground,
      xterm.background,
      xterm.black,
      xterm.red,
      xterm.green,
      xterm.yellow,
      xterm.blue,
      xterm.magenta,
      xterm.cyan,
      xterm.white,
      xterm.brightBlack,
      xterm.brightRed,
      xterm.brightGreen,
      xterm.brightYellow,
      xterm.brightBlue,
      xterm.brightMagenta,
      xterm.brightCyan,
      xterm.brightWhite,
    ];
  };

  const buildThemeColorMap = (fromTheme, toTheme) => {
    const from = themeColorValues(fromTheme);
    const to = themeColorValues(toTheme);
    const map = new Map();
    for (let index = 0; index < from.length; index += 1) {
      const fromRGB = hexToRGB(from[index]);
      const toRGB = hexToRGB(to[index]);
      if (fromRGB && toRGB) {
        map.set(colorKey(fromRGB), `rgb(${toRGB[0]}, ${toRGB[1]}, ${toRGB[2]})`);
      }
    }
    return map;
  };

  const installRendererThemeMapper = (session) => {
    const renderer = session?.term?.renderer;
    if (!renderer || renderer.webshellThemeMapperInstalled || typeof renderer.rgbToCSS !== "function") {
      return;
    }
    renderer.webshellThemeMapperInstalled = true;
    renderer.webshellOriginalRGBToCSS = renderer.rgbToCSS.bind(renderer);
    renderer.rgbToCSS = (red, green, blue) => {
      const mapped = renderer.webshellColorMap?.get(`${red},${green},${blue}`);
      return mapped || renderer.webshellOriginalRGBToCSS(red, green, blue);
    };
  };

  const holdTerminalCursorVisible = (session) => {
    const term = session?.term;
    const renderer = term?.renderer;
    if (!term || !renderer || term.isDisposed || !term.isOpen) {
      return;
    }
    if (session.cursorBlinkHoldTimer) {
      window.clearTimeout(session.cursorBlinkHoldTimer);
      session.cursorBlinkHoldTimer = 0;
    }
    renderer.cursorVisible = true;
    if (term.options?.cursorBlink) {
      term.options.cursorBlink = false;
    }
    if (terminalRenderAllowed(session)) {
      term.requestRender?.();
    }
    session.cursorBlinkHoldTimer = window.setTimeout(() => {
      session.cursorBlinkHoldTimer = 0;
      syncCursorBlinkState();
      if (terminalRenderAllowed(session)) {
        term.requestRender?.();
      }
    }, terminalCursorBlinkHoldMs);
  };
  const terminalViewportValue = (value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  };

  const isTerminalViewportAtBottom = (term) => (
    terminalViewportValue(term?.viewportY) <= terminalViewportBottomEpsilon &&
    terminalViewportValue(term?.targetViewportY) <= terminalViewportBottomEpsilon
  );

  const normalizeTerminalBottomViewport = (term) => {
    if (!term || !isTerminalViewportAtBottom(term)) {
      return false;
    }
    term.viewportY = 0;
    term.targetViewportY = 0;
    return true;
  };

  const installTerminalBottomScrollbarPatch = (session) => {
    const term = session?.term;
    if (!term || term.webshellBottomScrollbarPatchInstalled) {
      return;
    }
    term.webshellBottomScrollbarPatchInstalled = true;

    if (typeof term.showScrollbar === "function") {
      term.webshellOriginalShowScrollbar = term.showScrollbar.bind(term);
      term.showScrollbar = (...args) => {
        if (term.webshellSuppressBottomScrollbar && normalizeTerminalBottomViewport(term)) {
          return;
        }
        return term.webshellOriginalShowScrollbar(...args);
      };
    }

    if (typeof term.scrollToBottom === "function") {
      term.webshellOriginalScrollToBottom = term.scrollToBottom.bind(term);
      term.scrollToBottom = (...args) => {
        if (normalizeTerminalBottomViewport(term)) {
          return;
        }
        return term.webshellOriginalScrollToBottom(...args);
      };
    }

    if (typeof term.write === "function") {
      term.webshellOriginalWrite = term.write.bind(term);
      term.write = (...args) => {
        const previous = term.webshellSuppressBottomScrollbar === true;
        term.webshellSuppressBottomScrollbar = true;
        try {
          return term.webshellOriginalWrite(...args);
        } finally {
          term.webshellSuppressBottomScrollbar = previous;
          normalizeTerminalBottomViewport(term);
        }
      };
    }
  };

  const terminalCellBleedPx = (renderer) => {
    const dpr = Number(renderer?.devicePixelRatio) || Number(window.devicePixelRatio) || 1;
    return Math.min(0.75, Math.max(0.35, 0.75 / dpr));
  };
  const terminalCanvasPixelPx = (renderer) => {
    const dpr = Number(renderer?.devicePixelRatio) || Number(window.devicePixelRatio) || 1;
    return 1 / dpr;
  };
  const terminalAlignToCanvasPixel = (renderer, value, mode = "round") => {
    const pixel = terminalCanvasPixelPx(renderer);
    const scaled = value / pixel;
    if (mode === "floor") {
      return Math.floor(scaled) * pixel;
    }
    if (mode === "ceil") {
      return Math.ceil(scaled) * pixel;
    }
    return Math.round(scaled) * pixel;
  };
  const terminalIsPixelScrollRender = (offsetY = 0) => Math.abs(Number(offsetY) || 0) > terminalPixelScrollOffsetEpsilon;
  const terminalCellFlagInverse = 16;
  const terminalCellFlagInvisible = 32;
  const terminalCellFlagFaint = 128;
  const terminalBaselineSampleText = "\uF303\uF017Hg|pqyj\u00C5\u00C9()[]{}0123456789";

  const terminalLineHeightRatio = () => normalizeTerminalLineHeightPercent(terminalLineHeightPercent) / defaultTerminalLineHeightPercent;

  const applyTerminalLineHeightToMetrics = (metrics) => {
    const width = Number(metrics?.width) || 0;
    const height = Number(metrics?.height) || 0;
    const baseline = Number(metrics?.baseline) || 0;
    if (!width || !height || !baseline) {
      return metrics;
    }
    const ratio = terminalLineHeightRatio();
    const nextHeight = Math.max(height, Math.ceil(height * ratio));
    const extra = nextHeight - height;
    if (extra <= 0) {
      return metrics;
    }
    const nextBaseline = Math.round(baseline + (extra / 2));
    return {
      ...metrics,
      height: nextHeight,
      baseline: Math.max(1, Math.min(nextHeight - 1, nextBaseline)),
    };
  };

  const terminalAdjustedFontMetrics = (renderer, metrics) => {
    const width = Number(metrics?.width) || 0;
    const height = Number(metrics?.height) || 0;
    const baseline = Number(metrics?.baseline) || 0;
    if (!width || !height || !baseline) {
      return metrics;
    }
    if (!renderer) {
      return applyTerminalLineHeightToMetrics(metrics);
    }
    const context = document.createElement("canvas").getContext("2d");
    if (!context) {
      return applyTerminalLineHeightToMetrics(metrics);
    }
    context.font = `${renderer.fontSize}px ${renderer.fontFamily}`;
    context.textBaseline = "alphabetic";
    const measured = context.measureText(terminalBaselineSampleText);
    const ascent = Number(measured.actualBoundingBoxAscent);
    const descent = Number(measured.actualBoundingBoxDescent);
    if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent <= 0) {
      return applyTerminalLineHeightToMetrics(metrics);
    }
    const nextHeight = Math.max(height, Math.ceil(ascent + descent) + 2);
    const nextBaseline = Math.round((nextHeight + ascent - descent) / 2);
    return applyTerminalLineHeightToMetrics({
      ...metrics,
      height: nextHeight,
      baseline: Math.max(1, Math.min(nextHeight - 1, nextBaseline)),
    });
  };

  const terminalEstimatedFontMetrics = () => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) {
      return null;
    }
    context.font = `${terminalFontSize}px ${terminalOptionsBase.fontFamily}`;
    const measured = context.measureText("M");
    const width = Math.ceil(Number(measured.width) || 0);
    const ascent = Number(measured.actualBoundingBoxAscent) || terminalFontSize * 0.8;
    const descent = Number(measured.actualBoundingBoxDescent) || terminalFontSize * 0.2;
    const height = Math.ceil(ascent + descent) + 2;
    const baseline = Math.ceil(ascent) + 1;
    if (!width || !height || !baseline) {
      return null;
    }
    return terminalAdjustedFontMetrics(
      { fontSize: terminalFontSize, fontFamily: terminalOptionsBase.fontFamily },
      { width, height, baseline },
    );
  };

  const installRendererBaselinePatch = (session) => {
    const renderer = session?.term?.renderer;
    if (!renderer || renderer.webshellBaselinePatchInstalled || typeof renderer.measureFont !== "function") {
      return;
    }
    renderer.webshellBaselinePatchInstalled = true;
    renderer.webshellOriginalMeasureFont = renderer.measureFont.bind(renderer);
    renderer.measureFont = () => terminalAdjustedFontMetrics(renderer, renderer.webshellOriginalMeasureFont());
    renderer.metrics = renderer.measureFont();
  };

  const terminalPowerlineShape = (renderer, cell, column, row) => {
    let text = "";
    if (cell?.grapheme_len > 0 && renderer?.currentBuffer?.getGraphemeString) {
      text = renderer.currentBuffer.getGraphemeString(row, column);
    } else if (cell?.codepoint) {
      text = String.fromCodePoint(cell.codepoint);
    }
    if (text === "\uE0B6") {
      return "round-left";
    }
    if (text === "\uE0B4") {
      return "round-right";
    }
    if (text === "\uE0B0") {
      return "arrow-right";
    }
    return "";
  };

  const terminalCellForegroundCSS = (renderer, cell, column, row) => {
    if (renderer.isInSelection?.(column, row)) {
      return renderer.theme.selectionForeground;
    }
    let red = cell.fg_r;
    let green = cell.fg_g;
    let blue = cell.fg_b;
    if (cell.flags & terminalCellFlagInverse) {
      red = cell.bg_r;
      green = cell.bg_g;
      blue = cell.bg_b;
    }
    return renderer.rgbToCSS(red, green, blue);
  };

  const terminalCellBackgroundRGB = (cell) => {
    let red = cell?.bg_r;
    let green = cell?.bg_g;
    let blue = cell?.bg_b;
    if (cell?.flags & terminalCellFlagInverse) {
      red = cell.fg_r;
      green = cell.fg_g;
      blue = cell.fg_b;
    }
    return {
      red: Number(red) || 0,
      green: Number(green) || 0,
      blue: Number(blue) || 0,
    };
  };

  const terminalSameRGB = (left, right) =>
    left && right && left.red === right.red && left.green === right.green && left.blue === right.blue;

  const terminalLineCellAt = (renderer, row, column) => {
    if (column < 0) {
      return null;
    }
    const snapshot = renderer?.currentViewportSnapshot;
    const cols = Number(renderer?.currentViewportSnapshotCols || 0);
    const rows = Number(renderer?.currentViewportSnapshotRows || 0);
    if (snapshot && cols > 0 && rows > 0 && row >= 0 && row < rows && column < cols) {
      return snapshot[row * cols + column] || null;
    }
    try {
      const line = renderer?.currentBuffer?.getLine?.(row);
      return line?.[column] || null;
    } catch (error) {
      return null;
    }
  };

  const terminalCellBackgroundCSS = (renderer, cell, column, row) => {
    if (renderer.isInSelection?.(column, row)) {
      return renderer.theme.selectionBackground;
    }
    const { red, green, blue } = terminalCellBackgroundRGB(cell);
    if (red === 0 && green === 0 && blue === 0) {
      return "";
    }
    return renderer.rgbToCSS(red, green, blue);
  };

  const renderTerminalMergedLineBackgrounds = (renderer, line, row, columns, offsetY = 0) => {
    const metrics = renderer.metrics || renderer.getMetrics?.();
    const width = Number(metrics?.width) || 0;
    const height = Number(metrics?.height) || 0;
    if (!width || !height) {
      return false;
    }
    const rawY = row * height + offsetY;
    const y = terminalAlignToCanvasPixel(renderer, rawY, "floor");
    const bottom = terminalAlignToCanvasPixel(renderer, rawY + height, "ceil");
    const fillHeight = Math.max(terminalCanvasPixelPx(renderer), bottom - y);
    const canvasWidth = Math.max(
      columns * width,
      (Number(renderer.canvas?.width) || 0) / (Number(renderer.devicePixelRatio) || Number(window.devicePixelRatio) || 1),
    );
    renderer.ctx.fillStyle = renderer.theme.background;
    renderer.ctx.fillRect(0, y, canvasWidth, fillHeight);
    let segmentColor = "";
    let segmentStart = 0;
    let segmentEnd = 0;
    const flushSegment = () => {
      if (!segmentColor || segmentEnd <= segmentStart) {
        return;
      }
      renderer.ctx.fillStyle = segmentColor;
      renderer.ctx.fillRect(segmentStart * width, y, (segmentEnd - segmentStart) * width, fillHeight);
    };
    for (let column = 0; column < line.length; column += 1) {
      const cell = line[column];
      if (!cell || cell.width === 0) {
        continue;
      }
      const cellWidth = Math.max(1, Number(cell.width) || 1);
      const color = terminalCellBackgroundCSS(renderer, cell, column, row);
      if (color && color === segmentColor && column === segmentEnd) {
        segmentEnd = column + cellWidth;
        continue;
      }
      flushSegment();
      segmentColor = color;
      segmentStart = column;
      segmentEnd = color ? column + cellWidth : column;
    }
    flushSegment();
    return true;
  };

  const terminalPowerlineCellBox = (renderer, cell, column, row, offsetY = 0) => {
    const metrics = renderer.metrics || renderer.getMetrics?.();
    const cellWidth = Number(cell?.width) || 0;
    const width = (Number(metrics?.width) || 0) * cellWidth;
    const height = Number(metrics?.height) || 0;
    if (!width || !height) {
      return null;
    }
    const rawTop = row * height + offsetY;
    const rawBottom = rawTop + height;
    const y = terminalAlignToCanvasPixel(renderer, rawTop, "ceil");
    const bottom = terminalAlignToCanvasPixel(renderer, rawBottom, "floor");
    return {
      width,
      height: Math.max(terminalCanvasPixelPx(renderer), bottom - y),
      x: column * Number(metrics.width),
      y,
    };
  };

  const drawTerminalPowerlineRoundCap = (renderer, direction, cell, column, row, offsetY = 0) => {
    const box = terminalPowerlineCellBox(renderer, cell, column, row, offsetY);
    if (!box) {
      return false;
    }
    const bleed = terminalCellBleedPx(renderer);
    const centerX = direction === "left" ? box.x + box.width + bleed : box.x - bleed;
    const centerY = box.y + box.height / 2;
    const previousAlpha = renderer.ctx.globalAlpha;
    renderer.ctx.save();
    renderer.ctx.beginPath();
    renderer.ctx.rect(box.x - bleed, box.y, box.width + bleed * 2, box.height);
    renderer.ctx.clip();
    renderer.ctx.fillStyle = terminalCellForegroundCSS(renderer, cell, column, row);
    if (cell.flags & terminalCellFlagFaint) {
      renderer.ctx.globalAlpha = previousAlpha * 0.5;
    }
    renderer.ctx.beginPath();
    renderer.ctx.moveTo(centerX, box.y);
    renderer.ctx.ellipse(
      centerX,
      centerY,
      box.width + bleed * 2,
      box.height / 2,
      0,
      -Math.PI / 2,
      Math.PI / 2,
      direction === "left"
    );
    renderer.ctx.closePath();
    renderer.ctx.fill();
    renderer.ctx.restore();
    renderer.ctx.globalAlpha = previousAlpha;
    return true;
  };

  const drawTerminalPowerlineArrow = (renderer, direction, cell, column, row, offsetY = 0) => {
    const box = terminalPowerlineCellBox(renderer, cell, column, row, offsetY);
    if (!box) {
      return false;
    }
    const bleed = terminalCellBleedPx(renderer);
    const pixel = terminalCanvasPixelPx(renderer);
    const baseBleed = Math.max(bleed, pixel);
    const baseOuter = direction === "right" ? box.x - baseBleed : box.x + box.width + baseBleed;
    const tip = direction === "right" ? box.x + box.width + bleed : box.x - bleed;
    const clipLeft = Math.min(baseOuter, tip) - pixel;
    const clipRight = Math.max(baseOuter, tip) + pixel;
    const previousAlpha = renderer.ctx.globalAlpha;
    renderer.ctx.save();
    renderer.ctx.beginPath();
    renderer.ctx.rect(clipLeft, box.y, clipRight - clipLeft, box.height);
    renderer.ctx.clip();
    renderer.ctx.fillStyle = terminalCellForegroundCSS(renderer, cell, column, row);
    if (cell.flags & terminalCellFlagFaint) {
      renderer.ctx.globalAlpha = previousAlpha * 0.5;
    }
    renderer.ctx.beginPath();
    renderer.ctx.moveTo(baseOuter, box.y);
    renderer.ctx.lineTo(tip, box.y + box.height / 2);
    renderer.ctx.lineTo(baseOuter, box.y + box.height);
    renderer.ctx.closePath();
    renderer.ctx.fill();
    renderer.ctx.restore();
    renderer.ctx.globalAlpha = previousAlpha;
    return true;
  };

  const drawTerminalPowerlineShape = (renderer, shape, cell, column, row, offsetY = 0) => {
    if (shape === "round-left") {
      return drawTerminalPowerlineRoundCap(renderer, "left", cell, column, row, offsetY);
    }
    if (shape === "round-right") {
      return drawTerminalPowerlineRoundCap(renderer, "right", cell, column, row, offsetY);
    }
    if (shape === "arrow-right") {
      return drawTerminalPowerlineArrow(renderer, "right", cell, column, row, offsetY);
    }
    return false;
  };

  const installRendererCellSeamPatch = (session) => {
    const renderer = session?.term?.renderer;
    if (!renderer || renderer.webshellCellSeamPatchInstalled || typeof renderer.renderCellBackground !== "function") {
      return;
    }
    renderer.webshellCellSeamPatchInstalled = true;
    renderer.webshellOriginalRenderCellBackground = renderer.renderCellBackground.bind(renderer);
    renderer.renderCellBackground = (cell, column, row, offsetY = 0) => {
      renderer.webshellOriginalRenderCellBackground(cell, column, row, offsetY);
      if (terminalIsPixelScrollRender(offsetY)) {
        return;
      }
      const metrics = renderer.metrics || renderer.getMetrics?.();
      const width = Number(metrics?.width) || 0;
      const height = Number(metrics?.height) || 0;
      const cellWidth = Number(cell?.width) || 0;
      if (!width || !height || !cellWidth || renderer.isInSelection?.(column, row)) {
        return;
      }
      const { red, green, blue } = terminalCellBackgroundRGB(cell);
      if (red === 0 && green === 0 && blue === 0) {
        return;
      }
      const bleed = terminalCellBleedPx(renderer);
      const rgb = { red, green, blue };
      const leftCell = terminalLineCellAt(renderer, row, column - 1);
      const rightCell = terminalLineCellAt(renderer, row, column + cellWidth);
      const bleedLeft = terminalSameRGB(rgb, terminalCellBackgroundRGB(leftCell)) ? bleed : 0;
      const bleedRight = terminalSameRGB(rgb, terminalCellBackgroundRGB(rightCell)) ? bleed : 0;
      if (!bleedLeft && !bleedRight) {
        return;
      }
      const x = column * width - bleedLeft;
      const y = row * height + offsetY;
      renderer.ctx.fillStyle = renderer.rgbToCSS(red, green, blue);
      renderer.ctx.fillRect(x, y, width * cellWidth + bleedLeft + bleedRight, height);
    };
    if (typeof renderer.renderCursor === "function") {
      renderer.webshellOriginalRenderCursor = renderer.renderCursor.bind(renderer);
      renderer.renderCursor = (column, row) => {
        if (renderer.cursorStyle !== "block") {
          renderer.webshellOriginalRenderCursor(column, row);
          return;
        }
        const metrics = renderer.metrics || renderer.getMetrics?.();
        const width = Number(metrics?.width) || 0;
        const height = Number(metrics?.height) || 0;
        if (!width || !height) {
          renderer.webshellOriginalRenderCursor(column, row);
          return;
        }
        const bleed = terminalCellBleedPx(renderer);
        renderer.ctx.fillStyle = renderer.theme.cursor;
        renderer.ctx.fillRect(column * width - bleed, row * height, width + bleed * 2, height);
      };
    }
    if (typeof renderer.renderCellText === "function") {
      renderer.webshellOriginalRenderCellText = renderer.renderCellText.bind(renderer);
      renderer.renderCellText = (cell, column, row, offsetY = 0) => {
        if (terminalIsPixelScrollRender(offsetY)) {
          renderer.webshellOriginalRenderCellText(cell, column, row, offsetY);
          return;
        }
        if (!(cell.flags & terminalCellFlagInvisible)) {
          const shape = terminalPowerlineShape(renderer, cell, column, row);
          if (shape && drawTerminalPowerlineShape(renderer, shape, cell, column, row, offsetY)) {
            return;
          }
        }
        renderer.webshellOriginalRenderCellText(cell, column, row, offsetY);
      };
    }
    if (typeof renderer.renderLine === "function") {
      renderer.webshellOriginalRenderLine = renderer.renderLine.bind(renderer);
      renderer.renderLine = (line, row, columns, offsetY = 0) => {
        if (terminalIsPixelScrollRender(offsetY)) {
          const patchedRenderCellBackground = renderer.renderCellBackground;
          const patchedRenderCellText = renderer.renderCellText;
          renderer.renderCellBackground = renderer.webshellOriginalRenderCellBackground || patchedRenderCellBackground;
          renderer.renderCellText = renderer.webshellOriginalRenderCellText || patchedRenderCellText;
          try {
            renderer.webshellOriginalRenderLine(line, row, columns, offsetY);
          } finally {
            renderer.renderCellBackground = patchedRenderCellBackground;
            renderer.renderCellText = patchedRenderCellText;
          }
          return;
        }
        if (!renderTerminalMergedLineBackgrounds(renderer, line, row, columns, offsetY)) {
          renderer.webshellOriginalRenderLine(line, row, columns, offsetY);
          return;
        }
        for (let column = 0; column < line.length; column += 1) {
          const cell = line[column];
          if (cell?.width !== 0) {
            renderer.renderCellText(cell, column, row, offsetY);
          }
        }
      };
    }
  };

  const themePreviewPromptText = "lazycat@terminal:~/Theme$ _";
  const themePreviewFont = "16px monospace";

  const syncThemeCardWidthVar = () => {
    document.documentElement.style.setProperty("--theme-picker-card-width", `${resolvedThemeCardWidth}px`);
  };

  const themePreviewSource = (theme) => {
    const xterm = theme?.xterm || {};
    const background = normalizeThemeColor(theme?.background || xterm.background, "#000000");
    const foreground = normalizeThemeColor(theme?.foreground || xterm.foreground, "#FFFFFF");
    const accent = normalizeThemeColor(theme?.accent || xterm.cursor || foreground, foreground);
    const color11 = normalizeThemeColor(theme?.color_11 || theme?.color11 || xterm.brightGreen || xterm.green || foreground, foreground);
    const color13 = normalizeThemeColor(theme?.color_13 || theme?.color13 || xterm.brightBlue || xterm.blue || accent, foreground);
    const brightness = terminalThemeBrightness(background);
    return {
      name: String(theme?.name || ""),
      background,
      foreground,
      color11,
      color13,
      isLightBackground: brightness > 0.5,
    };
  };

  const measureThemeCardWidth = () => {
    const measurementCanvas = document.createElement("canvas");
    const context = measurementCanvas.getContext("2d");
    if (!context) {
      resolvedThemeCardWidth = themeCardWidth;
      syncThemeCardWidthVar();
      return;
    }
    context.font = themePreviewFont;
    const promptWidth = context.measureText(themePreviewPromptText).width;
    const widestThemeNameWidth = themes.reduce((maxWidth, theme) => {
      const themeName = typeof theme?.name === "string" ? theme.name : "";
      return Math.max(maxWidth, context.measureText(themeName).width);
    }, 0);
    const contentWidth = Math.max(promptWidth, widestThemeNameWidth);
    resolvedThemeCardWidth = Math.max(
      themeCardWidth,
      Math.ceil(contentWidth + (themeCardOuterPadding + themeCardContentInset) * 2 + 12),
    );
    syncThemeCardWidthVar();
  };

  function drawRoundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function drawThemePreviewText(context, text, x, y, color) {
    context.fillStyle = color;
    context.fillText(text, x, y);
    return context.measureText(text).width;
  }

  const themePreviewTextColor = (theme, color) => {
    if (!theme?.isLightBackground) {
      return normalizeThemeColor(color, "#FFFFFF");
    }
    return dimThemeColor(color);
  };

  const drawThemePreviewCard = (canvas, theme, selected) => {
    if (!(canvas instanceof HTMLCanvasElement) || !theme) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const previewTheme = themePreviewSource(theme);
    const currentPreviewTheme = themePreviewSource(activeTheme);
    const pixelRatio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = resolvedThemeCardWidth * pixelRatio;
    canvas.height = themeCardHeight * pixelRatio;
    canvas.style.width = `${resolvedThemeCardWidth}px`;
    canvas.style.height = `${themeCardHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, resolvedThemeCardWidth, themeCardHeight);

    const cardX = themeCardOuterPadding;
    const cardWidth = resolvedThemeCardWidth - themeCardOuterPadding * 2;
    drawRoundedRect(context, cardX, 0, cardWidth, themeCardHeight, themeCardCornerRadius);
    context.fillStyle = rgbaFromThemeColor(previewTheme.background, themeCardBackgroundAlpha);
    context.fill();
    if (selected) {
      const selectedBorderWidth = 1;
      const selectedBorderInset = selectedBorderWidth / 2;
      drawRoundedRect(
        context,
        cardX + selectedBorderInset,
        selectedBorderInset,
        cardWidth - selectedBorderWidth,
        themeCardHeight - selectedBorderWidth,
        Math.max(0, themeCardCornerRadius - selectedBorderInset),
      );
      context.strokeStyle = currentPreviewTheme.foreground || previewTheme.foreground;
      context.lineWidth = selectedBorderWidth;
      context.stroke();
    }

    context.font = themePreviewFont;
    context.textBaseline = "alphabetic";
    let textX = cardX + themeCardContentInset;
    textX += drawThemePreviewText(context, "lazycat", textX, themeCardPreviewLineY, themePreviewTextColor(previewTheme, previewTheme.color11));
    textX += drawThemePreviewText(context, "@", textX, themeCardPreviewLineY, themePreviewTextColor(previewTheme, previewTheme.foreground));
    textX += drawThemePreviewText(context, "terminal", textX, themeCardPreviewLineY, themePreviewTextColor(previewTheme, previewTheme.color13));
    drawThemePreviewText(context, ":~/Theme$ _", textX, themeCardPreviewLineY, themePreviewTextColor(previewTheme, previewTheme.foreground));
    drawThemePreviewText(context, previewTheme.name, cardX + themeCardContentInset, themeCardNameLineY, themePreviewTextColor(previewTheme, previewTheme.foreground));
  };

  const redrawThemePickerOptions = () => {
    const lists = [themePickerList, settingsThemeList].filter(Boolean);
    lists.forEach((list) => {
      const options = Array.from(list.querySelectorAll(".theme-picker-option"));
      options.forEach((option) => {
        const theme = themes.find((item) => item.id === option.dataset.theme);
        const selected = theme?.id === activeTheme.id;
        option.setAttribute("aria-selected", selected ? "true" : "false");
        option.setAttribute("aria-pressed", selected ? "true" : "false");
        drawThemePreviewCard(option.querySelector(".theme-picker-canvas"), theme, selected);
      });
    });
    scheduleThemePickerScrollbarSync();
  };

  const renderThemeOptions = (list) => {
    if (!list) {
      return;
    }
    measureThemeCardWidth();
    list.textContent = "";
    for (const theme of themes) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "theme-picker-option";
      option.dataset.theme = theme.id;
      option.setAttribute("role", "option");
      option.setAttribute("aria-label", `使用 ${theme.name} 主题`);
      const selected = theme.id === activeTheme.id;
      option.setAttribute("aria-selected", selected ? "true" : "false");
      option.setAttribute("aria-pressed", selected ? "true" : "false");
      const canvas = document.createElement("canvas");
      canvas.className = "theme-picker-canvas";
      option.appendChild(canvas);
      list.appendChild(option);
      drawThemePreviewCard(canvas, theme, selected);
    }
    if (list === themePickerList) {
      scheduleThemePickerScrollbarSync();
    }
  };

  const renderThemePicker = () => renderThemeOptions(themePickerList);

  const renderSettingsThemeList = () => renderThemeOptions(settingsThemeList);

  const focusSelectedThemeOption = () => {
    themePickerList?.querySelector('.theme-picker-option[aria-selected="true"]')?.focus();
  };

  const getThemePickerScrollbarMetrics = () => {
    const viewportHeight = themePickerList?.clientHeight || 0;
    const scrollHeight = themePickerList?.scrollHeight || 0;
    const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
    const trackHeight = Math.max(0, themePickerScrollbarTrack?.clientHeight || 0);
    const hasScroll = maxScrollTop > 0 && trackHeight > 0;
    const thumbHeight = hasScroll
      ? Math.min(trackHeight, Math.max(themePickerScrollbarMinThumbPx, Math.round((viewportHeight / scrollHeight) * trackHeight)))
      : 0;
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const scrollRatio = maxScrollTop > 0 ? themePickerList.scrollTop / maxScrollTop : 0;
    const thumbTop = maxThumbTop * scrollRatio;
    return {
      hasScroll,
      maxScrollTop,
      thumbHeight,
      maxThumbTop,
      thumbTop,
    };
  };

  const setThemePickerScrollbarHovering = (hovering) => {
    themePickerScrollbarTrack?.classList.toggle("is-hovering", hovering || themePickerScrollbarDragging);
  };

  const syncThemePickerScrollbar = () => {
    if (!themePickerScrollbarTrack || !themePickerScrollbarThumb) {
      return;
    }
    const { hasScroll, thumbHeight, thumbTop } = getThemePickerScrollbarMetrics();
    const visible = isThemePickerOpen() && hasScroll;
    themePickerScrollbarTrack.classList.toggle("has-scroll", hasScroll);
    themePickerScrollbarTrack.classList.toggle("is-visible", visible);
    themePickerScrollbarThumb.style.height = hasScroll ? `${thumbHeight}px` : "0px";
    themePickerScrollbarThumb.style.transform = hasScroll ? `translateY(${thumbTop}px)` : "";
    if (!hasScroll && !themePickerScrollbarDragging) {
      setThemePickerScrollbarHovering(false);
    }
  };

  const scheduleThemePickerScrollbarSync = () => {
    if (themePickerScrollbarSyncScheduled) {
      return;
    }
    themePickerScrollbarSyncScheduled = true;
    window.requestAnimationFrame(() => {
      themePickerScrollbarSyncScheduled = false;
      syncThemePickerScrollbar();
    });
  };

  const setThemePickerScrollFromThumbTop = (nextThumbTop) => {
    if (!themePickerList) {
      return;
    }
    const { hasScroll, maxScrollTop, maxThumbTop } = getThemePickerScrollbarMetrics();
    if (!hasScroll) {
      return;
    }
    const clampedThumbTop = Math.max(0, Math.min(maxThumbTop, nextThumbTop));
    const scrollRatio = maxThumbTop > 0 ? clampedThumbTop / maxThumbTop : 0;
    themePickerList.scrollTop = scrollRatio * maxScrollTop;
    scheduleThemePickerScrollbarSync();
  };

  const stopThemePickerScrollbarDrag = () => {
    if (!themePickerScrollbarDragging) {
      return;
    }
    themePickerScrollbarDragging = false;
    themePickerScrollbarPointerId = null;
    themePickerScrollbarThumbPointerOffset = 0;
    themePickerScrollbarThumb?.classList.remove("is-dragging");
    setThemePickerScrollbarHovering(false);
  };

  const applyThemeToSession = (session) => {
    if (!session?.term) {
      return;
    }
    beginTerminalPresentationHold(session);
    const nextTheme = cloneTheme(activeTheme);
    installRendererThemeMapper(session);
    installRendererCellSeamPatch(session);
    if (!session.baseTheme) {
      session.baseTheme = activeTheme;
    }
    session.term.options.theme = nextTheme;
    if (session.term.renderer) {
      session.term.renderer.webshellColorMap = buildThemeColorMap(session.baseTheme, activeTheme);
    }
    if (session.term.renderer && typeof session.term.renderer.setTheme === "function") {
      session.term.renderer.setTheme(nextTheme);
      if (terminalRenderAllowed(session)) {
        session.term.requestRender?.({ full: true });
      }
    }
    refreshTerminalMetrics(session);
  };

  const applyTheme = (themeID) => {
    const nextTheme = themes.find((theme) => theme.id === themeID);
    if (!nextTheme) {
      return;
    }
    activeTheme = nextTheme;
    window.localStorage.setItem(themeStorageKey, activeTheme.id);
    applyThemeDocumentState();
    renderThemePicker();
    renderSettingsThemeList();
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        applyThemeToSession(pane);
        sendTerminalTheme(pane);
      }
    }
    resizeActiveTab();
    scheduleTabOverviewRender();
  };

  const openThemePicker = () => {
    closeContextMenu();
    closeDevicePanel();
    renderThemePicker();
    if (themePickerBackdrop) {
      themePickerBackdrop.hidden = false;
    }
    window.setTimeout(() => {
      if (!isThemePickerOpen()) {
        return;
      }
      scheduleThemePickerScrollbarSync();
      focusSelectedThemeOption();
    }, 0);
  };

  const closeThemePicker = () => {
    if (themePickerBackdrop) {
      themePickerBackdrop.hidden = true;
    }
    stopThemePickerScrollbarDrag();
    themePickerScrollbarTrack?.classList.remove("is-visible", "is-hovering");
    themePickerEdgeSwipe = null;
  };

  const currentTab = () => tabs.get(activeTabId) || null;

  const pathBasenameLabel = (path) => {
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

  const activePaneDirectoryLabel = () => {
    const tab = currentTab();
    const pane = tab?.panes.get(tab.activePaneId) || null;
    return pathBasenameLabel(pane?.cwd);
  };

  const shouldShowMobileKeyboardFocusPrompt = () => {
    if (!mobileDoubleTapReminderEnabled || !requiresTouchKeyboardDoubleTap()) {
      return false;
    }
    const tab = currentTab();
    const session = tab?.panes.get(tab.activePaneId) || null;
    const textarea = session?.term?.textarea;
    return Boolean(textarea && document.activeElement !== textarea);
  };

  const updateMobileActiveTabTitle = () => {
    if (!mobileActiveTabTitle) {
      return;
    }
    const label = shouldShowMobileKeyboardFocusPrompt()
      ? mobileKeyboardFocusPrompt
      : activePaneDirectoryLabel() || String(currentTab()?.label || "终端").trim() || "终端";
    mobileActiveTabTitle.textContent = label;
    mobileActiveTabTitle.title = label;
  };

  const isForcePCModeActive = () => debugModeEnabled && forcePCModeEnabled;
  const isMobileLayout = () => !isForcePCModeActive() && Boolean(mobileLayoutQuery?.matches);
  const isTouchShortcutLayout = () => !isForcePCModeActive() && Boolean(touchShortcutLayoutQuery?.matches);
  const isDesktopShortcutBarLayout = () => desktopShortcutsBarEnabled && !isTouchShortcutLayout();
  const isTouchSelectionLayout = () => isMobileLayout() || isTouchShortcutLayout();
  const requiresTouchKeyboardDoubleTap = () => isTouchShortcutLayout();

  const syncForcePCModeState = () => {
    const active = isForcePCModeActive();
    document.documentElement.dataset.forcePcMode = active ? "true" : "false";
    document.body.classList.toggle("force-pc-mode", active);
    syncSettingsForcePCModeToggle();
    if (active) {
      closeMobileActionSheet();
      closeMobileCloseConfirm(false);
      closeMobileCustomSelect();
      hideSelectionSheet();
      document.body.classList.remove("mobile-keyboard-visible", "mobile-keyboard-dock-moving");
      settingsMobileView = "detail";
    }
    resizeActiveTabForCurrentDevice();
    syncSettingsMobileNavigation();
    updateMobileActiveTabTitle();
    updateSelectionSheet();
  };

  const isMobileCustomSelectLayout = () => isMobileLayout() || isTouchShortcutLayout();
  const shouldPreventMobileViewportZoom = () => isMobileLayout() || isTouchShortcutLayout() || usesMobileViewportInsets();

  const markTerminalTouchContextMenuCandidate = (touch) => {
    if (!touch) {
      return;
    }
    lastTerminalTouchContextMenuCandidate = {
      x: touch.clientX,
      y: touch.clientY,
      at: performance.now(),
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
    const elapsed = performance.now() - candidate.at;
    if (elapsed < 0 || elapsed > touchContextMenuSuppressWindowMs) {
      return false;
    }
    return Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) <= touchContextMenuSuppressDistancePx;
  };

  const shouldSuppressTerminalContextMenu = (event) =>
    isMobileLayout() || (isTouchSelectionLayout() && isRecentTerminalTouchContextMenu(event));

  const preventMobileViewportZoom = (event) => {
    if (!shouldPreventMobileViewportZoom()) {
      return;
    }
    const touchCount = Number(event.touches?.length || 0);
    if (String(event.type || "").startsWith("gesture") || touchCount > 1) {
      event.preventDefault();
    }
  };

  const mobileCustomSelectLabel = (select) =>
    String(
      select?.getAttribute?.("aria-label") ||
      select?.closest?.("label")?.querySelector?.("span")?.textContent ||
      "选择"
    ).trim() || "选择";

  const ensureMobileCustomSelectPopover = () => {
    let popover = document.getElementById("mobileCustomSelectPopover");
    if (popover) {
      return popover;
    }
    popover = document.createElement("div");
    popover.className = "mobile-custom-select-popover";
    popover.id = "mobileCustomSelectPopover";
    popover.hidden = true;

    const scrim = document.createElement("button");
    scrim.type = "button";
    scrim.className = "mobile-custom-select-scrim";
    scrim.setAttribute("aria-label", "关闭选择菜单");

    const panel = document.createElement("section");
    panel.className = "mobile-custom-select-panel";
    panel.setAttribute("role", "listbox");
    panel.setAttribute("aria-label", "选择");

    const list = document.createElement("div");
    list.className = "mobile-custom-select-options";
    panel.appendChild(list);
    popover.append(scrim, panel);
    document.body.appendChild(popover);

    scrim.addEventListener("click", () => closeMobileCustomSelect());
    return popover;
  };

  const closeMobileCustomSelect = ({ focus = false } = {}) => {
    const state = mobileCustomSelectState;
    if (!state) {
      return;
    }
    state.select?.classList?.remove("mobile-custom-select-open");
    state.popover.hidden = true;
    state.list.textContent = "";
    mobileCustomSelectState = null;
    if (focus) {
      window.setTimeout(() => state.select?.focus?.({ preventScroll: true }), 0);
    }
  };

  const positionMobileCustomSelect = (select, panel, list) => {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = Math.max(1, viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
    const viewportHeight = Math.max(1, viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);
    const rect = select.getBoundingClientRect();
    const margin = 8;
    const minWidth = Math.max(180, rect.width);
    const width = Math.min(viewportWidth - margin * 2, minWidth);
    const left = Math.max(viewportLeft + margin, Math.min(viewportLeft + viewportWidth - width - margin, rect.left));
    const below = viewportTop + viewportHeight - rect.bottom - margin;
    const above = rect.top - viewportTop - margin;
    const maxHeight = Math.max(120, Math.min(360, Math.max(below, above) - 6));
    const top = below >= Math.min(280, maxHeight)
      ? rect.bottom + 6
      : Math.max(viewportTop + margin, rect.top - maxHeight - 6);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.width = `${Math.round(width)}px`;
    panel.style.maxHeight = `${Math.round(maxHeight)}px`;
    list.style.maxHeight = `${Math.round(maxHeight)}px`;
  };

  const syncMobileCustomSelectPosition = () => {
    const state = mobileCustomSelectState;
    if (!state) {
      return;
    }
    if (!isMobileCustomSelectLayout() || state.select.disabled || !document.body.contains(state.select)) {
      closeMobileCustomSelect();
      return;
    }
    positionMobileCustomSelect(state.select, state.panel, state.list);
  };

  const openMobileCustomSelect = (select) => {
    if (!(select instanceof HTMLSelectElement) || select.disabled || !isMobileCustomSelectLayout()) {
      return false;
    }
    const options = Array.from(select.options || []);
    if (options.length === 0) {
      return false;
    }
    closeMobileCustomSelect();
    const popover = ensureMobileCustomSelectPopover();
    const panel = popover.querySelector(".mobile-custom-select-panel");
    const list = popover.querySelector(".mobile-custom-select-options");
    if (!(panel instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      return false;
    }
    const label = mobileCustomSelectLabel(select);
    panel.setAttribute("aria-label", label);
    list.textContent = "";
    const selectedIndex = select.selectedIndex;
    options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mobile-custom-select-option";
      button.dataset.optionIndex = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
      button.disabled = option.disabled;
      button.textContent = option.textContent || option.label || option.value;
      if (index === selectedIndex) {
        button.classList.add("is-selected");
      }
      button.addEventListener("click", () => {
        if (button.disabled) {
          return;
        }
        const previousIndex = select.selectedIndex;
        select.selectedIndex = index;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        if (select.selectedIndex !== previousIndex) {
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        closeMobileCustomSelect({ focus: true });
      });
      list.appendChild(button);
    });
    popover.hidden = false;
    select.classList.add("mobile-custom-select-open");
    mobileCustomSelectState = { select, popover, panel, list };
    positionMobileCustomSelect(select, panel, list);
    window.requestAnimationFrame(() => {
      list.querySelector(".mobile-custom-select-option.is-selected")?.scrollIntoView?.({ block: "nearest" });
    });
    return true;
  };

  const handleMobileCustomSelectOpenEvent = (event) => {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement) || !isMobileCustomSelectLayout()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (mobileCustomSelectState?.select === select) {
      return;
    }
    openMobileCustomSelect(select);
  };

  const handleMobileCustomSelectKeyDown = (event) => {
    if (
      !(event.currentTarget instanceof HTMLSelectElement) ||
      !isMobileCustomSelectLayout() ||
      !["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)
    ) {
      return;
    }
    handleMobileCustomSelectOpenEvent(event);
  };

  const installMobileCustomSelects = () => {
    for (const select of document.querySelectorAll("select")) {
      if (select.dataset.mobileCustomSelectInstalled === "true") {
        continue;
      }
      select.dataset.mobileCustomSelectInstalled = "true";
      select.addEventListener("touchstart", handleMobileCustomSelectOpenEvent, { capture: true, passive: false });
      select.addEventListener("pointerdown", handleMobileCustomSelectOpenEvent, { capture: true, passive: false });
      select.addEventListener("click", handleMobileCustomSelectOpenEvent, { capture: true });
      select.addEventListener("keydown", handleMobileCustomSelectKeyDown, { capture: true });
    }
  };

  const syncTerminalMobilePixelScroll = (session) => {
    if (session?.term?.options) {
      session.term.options.mobilePixelScroll = mobilePixelScrollEnabled && isMobileLayout();
    }
  };

  const terminalRuntimeClearSequence = "\x1b[2J\x1b[3J\x1b[H";

  const clearTerminalCanvasPixels = (session) => {
    const term = session?.term;
    const canvas = term?.canvas || term?.renderer?.getCanvas?.();
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return false;
    }
    const ratio = Number(term?.renderer?.devicePixelRatio || window.devicePixelRatio || 1) || 1;
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = activeTheme?.background || terminalOptionsBase.theme?.background || "#000000";
    ctx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    ctx.restore();
    return true;
  };

  const advanceTerminalContentGeneration = (session) => {
    if (!session) {
      return 0;
    }
    session.terminalContentGeneration = Number(session.terminalContentGeneration || 0) + 1;
    session.pendingRenderContentGeneration = session.terminalContentGeneration;
    return session.terminalContentGeneration;
  };

  const clearTerminalRuntimeBuffer = (session) => {
    const term = session?.term;
    if (!term || !term.wasmTerm) {
      return false;
    }
    try {
      term.wasmTerm.write(terminalRuntimeClearSequence);
      advanceTerminalContentGeneration(session);
      term.viewportY = 0;
      term.targetViewportY = 0;
      term.linkDetector?.invalidateCache?.();
      if (terminalRenderAllowed(session)) {
        term.requestRender?.({ full: true });
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  const resetTerminalAfterInitialFit = (session) => {
    const term = session?.term;
    if (!term || session.initialRuntimeResetDone || Number(session.measuredFitGeneration || 0) <= 0) {
      return;
    }
    session.initialRuntimeResetDone = true;
    resetTerminalRuntimeState(session);
  };

  const syncTerminalRuntimeReferences = (session) => {
    const term = session?.term;
    if (!term) {
      return;
    }
    if (term.selectionManager && term.wasmTerm) {
      term.selectionManager.wasmTerm = term.wasmTerm;
    }
    term.linkDetector?.invalidateCache?.();
    installRendererBaselinePatch(session);
    installRendererThemeMapper(session);
    installRendererCellSeamPatch(session);
  };

  const resetTerminalRuntimeState = (session) => {
    const term = session?.term;
    if (!term || typeof term.reset !== "function") {
      return false;
    }
    try {
      term.reset();
      syncTerminalRuntimeReferences(session);
      clearTerminalRuntimeBuffer(session);
      clearTerminalCanvasPixels(session);
      return true;
    } catch (error) {
      // A reset must never destroy the only usable terminal instance. The
      // Ghostty runtime can be kept alive and cleared in place when creating
      // a replacement WASM terminal fails temporarily.
      appendDebugWarning("终端运行时重置失败，降级清理后继续", `${session.name}/${session.id}: ${error?.message || String(error)}`);
      try {
        if (typeof term.clear === "function") {
          term.clear();
        } else if (!clearTerminalRuntimeBuffer(session)) {
          return false;
        }
        clearTerminalCanvasPixels(session);
        return true;
      } catch (fallbackError) {
        appendDebugError("终端运行时清理失败", `${session.name}/${session.id}: ${fallbackError?.message || String(fallbackError)}`);
        return false;
      }
    }
  };

  const terminalCacheV2ThemeFingerprint = () => JSON.stringify({
    theme: activeTheme?.id || "",
    foreground: terminalThemePayload().foreground,
    background: terminalThemePayload().background,
    fontSize: terminalFontSize,
    fontFamily: terminalOptionsBase.fontFamily || "",
    lineHeight: terminalOptionsBase.lineHeight || 1,
  });

  const clearSessionCacheV2PreparedPreview = (session) => {
    if (!session) {
      return;
    }
    session.cacheV2PreviewPrepareSeq = Number(session.cacheV2PreviewPrepareSeq || 0) + 1;
    session.cacheV2PreviewAuthorizedSnapshot = null;
    const prepared = session.cacheV2PreparedPreview;
    session.cacheV2PreparedPreview = null;
    session.cacheV2PreviewPreparePromise = null;
    if (prepared?.objectURL) {
      URL.revokeObjectURL(prepared.objectURL);
    }
  };

  const clearSessionCacheV2OverviewPreview = (session) => {
    terminalOverviewPreviewController.clear(session);
  };

  const terminalFrameHoldIdentity = (session) => ({
    selector: String(session?.name || "").trim(),
    tabID: String(session?.tabId || "").trim(),
    paneID: String(session?.id || "").trim(),
    cacheV2Epoch: Number(session?.cacheV2Epoch || 0),
    workspaceIdentity: workspaceCacheV2IdentityKey(session?.cacheV2WorkspaceIdentity),
    historyGeneration: String(session?.historyGeneration || "").trim(),
  });

  const sessionTerminalFrameHoldIsCurrent = (session) => {
    const hold = session?.terminalFrameHold;
    const heldIdentity = session?.terminalFrameHoldIdentity;
    if (
      !session
      || session.closed
      || session.terminalFrameHeld !== true
      || !(hold instanceof HTMLCanvasElement)
      || hold.width <= 0
      || hold.height <= 0
      || !heldIdentity
    ) {
      return false;
    }
    const current = terminalFrameHoldIdentity(session);
    return heldIdentity.selector === current.selector
      && heldIdentity.tabID === current.tabID
      && heldIdentity.paneID === current.paneID
      && heldIdentity.cacheV2Epoch === current.cacheV2Epoch
      && heldIdentity.workspaceIdentity === current.workspaceIdentity
      && heldIdentity.historyGeneration === current.historyGeneration;
  };

  const holdSessionTerminalFrame = (session) => {
    const source = session?.term?.canvas || session?.term?.renderer?.getCanvas?.();
    const hold = session?.terminalFrameHold;
    if (!(source instanceof HTMLCanvasElement) || !(hold instanceof HTMLCanvasElement) || source.width <= 0 || source.height <= 0) {
      return false;
    }
    const ctx = hold.getContext("2d");
    if (!ctx) {
      return false;
    }
    // The live renderer uses a device-pixel backing store. Save the hold frame
    // in CSS pixels so object-fit:none can preserve its on-screen geometry.
    const ratio = Math.max(
      1,
      Number(session?.term?.renderer?.devicePixelRatio)
        || Number(window.devicePixelRatio)
        || 1,
    );
    const sourceRect = source.getBoundingClientRect?.();
    const cssWidth = Math.max(
      1,
      Number(sourceRect?.width)
        || Number.parseFloat(source.style?.width)
        || source.width / ratio,
    );
    const cssHeight = Math.max(
      1,
      Number(sourceRect?.height)
        || Number.parseFloat(source.style?.height)
        || source.height / ratio,
    );
    hold.width = Math.max(1, Math.round(cssWidth));
    hold.height = Math.max(1, Math.round(cssHeight));
    hold.style.width = "100%";
    hold.style.height = "100%";
    ctx.clearRect(0, 0, hold.width, hold.height);
    ctx.drawImage(source, 0, 0, hold.width, hold.height);
    hold.hidden = false;
    session.terminalFrameHeld = true;
    session.terminalFrameHoldIdentity = terminalFrameHoldIdentity(session);
    return true;
  };

  const releaseSessionTerminalFrame = (session) => {
    if (session) {
      session.terminalFrameHoldIdentity = null;
    }
    const hold = session?.terminalFrameHold;
    if (!(hold instanceof HTMLCanvasElement)) {
      return;
    }
    hold.hidden = true;
    const ctx = hold.getContext("2d");
    ctx?.clearRect(0, 0, hold.width, hold.height);
    session.terminalFrameHeld = false;
  };

  const beginTerminalPresentationHold = (session) => {
    if (!session || session.closed) {
      return false;
    }
    session.presentationCommitPending = false;
    session.resizePresentationHold = true;
    recordTerminalSessionEvent(session, "presentation_hold");
    if (session.hasPresentedFrame && !session.terminalFrameHeld) {
      holdSessionTerminalFrame(session);
    }
    setPaneRenderReady(session, false);
    cancelPendingTerminalRender(session.term);
    return true;
  };

  const scheduleReplayPresentationCheckpoint = (session) => {
    if (
      !session
      || session.closed
      || session.replayPresentationCheckpointPending
      || session.name !== activeName
      || sessionReplayIsCommitted(session)
    ) {
      return false;
    }
    session.replayPresentationCheckpointPending = true;
    const replayGeneration = Number(session.terminalReplayGeneration || 0);
    const connectionEpoch = Number(session.connectionEpoch || 0);
    session.replayPresentationCheckpointTimer = window.setTimeout(() => {
      session.replayPresentationCheckpointTimer = 0;
      session.replayPresentationCheckpointPending = false;
      if (
        session.closed
        || session.name !== activeName
        || sessionReplayIsCommitted(session)
        || Number(session.terminalReplayGeneration || 0) !== replayGeneration
        || Number(session.connectionEpoch || 0) !== connectionEpoch
        || !isPaneMeasurable(session)
        || !terminalCanvasMatchesExpectedSize(session)
      ) {
        return;
      }
      recordTerminalSessionEvent(session, "replay_presentation_checkpoint_skipped", {
        cursor: String(session.appliedHistoryCursor || 0n),
        reason: "replay_not_committed",
      });
    }, terminalReplayCheckpointDelayMs);
    return true;
  };

  const noteSessionReplayFailure = (session, reason = "replay_failed") => {
    if (!session || session.closed || sessionReplayIsCommitted(session)) {
      return false;
    }
    session.replayFailureAttempts = Math.min(
      terminalReplayFailureLimit,
      Number(session.replayFailureAttempts || 0) + 1,
    );
    session.lastReplayFailureReason = String(reason || "replay_failed");
    if (session.replayFailureAttempts < terminalReplayFailureLimit) {
      return false;
    }
    session.replayRetryPaused = true;
    session.connectionRetrying = false;
    session.shellEl.dataset.connection = "error";
    beginTerminalPresentationHold(session);
    appendDebugError(
      "终端历史回放已暂停",
      `${terminalLocationDescription(session)}: ${session.lastReplayFailureReason}，请重新操作后继续。`,
    );
    return true;
  };

  const resumeSessionReplayRetry = (session, reason = "user_recovery") => {
    if (!session || session.closed || !session.replayRetryPaused) {
      return false;
    }
    session.replayRetryPaused = false;
    session.replayFailureAttempts = 0;
    session.lastReplayFailureReason = "";
    session.resetOnNextReplay = true;
    session.connectionRetrying = true;
    session.shellEl.dataset.connection = "reconnecting";
    appendDebugLog("info", "终端历史回放恢复重试", `${terminalLocationDescription(session)}: ${reason}`);
    return true;
  };

  const replayRetryIsPaused = (session) => Boolean(session?.replayRetryPaused === true);

  const hideSessionTerminalPreview = (session) => {
    if (!session?.terminalPreview) {
      return;
    }
    session.cacheV2PreviewAuthorizedSnapshot = null;
    session.terminalPreview.hidden = true;
    session.terminalPreview.removeAttribute("src");
    session.shellEl.dataset.previewReady = "false";
    if (session.cacheV2PreviewURL) {
      URL.revokeObjectURL(session.cacheV2PreviewURL);
      session.cacheV2PreviewURL = "";
    }
  };

  const setPaneRenderReady = (session, ready) => {
    if (!session?.shellEl) {
      return;
    }
    const becameReady = ready === true && !session.renderReady;
    session.renderReady = ready === true;
    session.presentationPending = !session.renderReady;
    session.shellEl.dataset.renderReady = session.renderReady ? "true" : "false";
    session.shellEl.dataset.hasPresentedFrame = session.hasPresentedFrame ? "true" : "false";
    if (session.renderReady) {
      releaseSessionTerminalFrame(session);
      hideSessionTerminalPreview(session);
      clearSessionCacheV2PreparedPreview(session);
      flushPendingInput(session);
      scheduleSessionCacheV2PreviewCapture(session);
      if (sessionReplayIsCommitted(session)) {
        markSessionCacheV2RecoveryMetric(session, "inputReadyAt");
        appendStartupTrace("终端输入已就绪", `pane=${session.id}`, { dedupeKey: `input-ready:${session.id}:${session.terminalReplayGeneration}` });
      }
      markSessionCacheV2RecoveryMetric(session, "realCanvasVisibleAt");
      appendStartupTrace("真实终端 Canvas 已显示", `pane=${session.id}`, { dedupeKey: `canvas-visible:${session.id}:${session.terminalReplayGeneration}` });
      session.startupTraceActive = false;
      reportSessionCacheV2RecoveryMetrics(session);
      if (becameReady && session.connectionChannel === "unified") {
        clearTerminalUnifiedPaneRetry(session, { resetAttempts: true });
      }
    }
  };

  const panePresentationIsCurrent = (session) => {
    if (!session?.renderSnapshot || !session.renderReady || session.resizeAckPending) {
      return false;
    }
    const current = createRenderSnapshot(session);
    return session.renderSnapshot.equals(current)
      && Number(session.measuredFitGeneration || 0) > 0
      && session.presentedFitGeneration === session.measuredFitGeneration
      && session.presentedReplayGeneration === session.terminalReplayGeneration
      && session.presentedContentGeneration === session.terminalContentGeneration
      && (!session.appliedResizeEpoch || session.presentedResizeEpoch === session.appliedResizeEpoch);
  };

  const markPaneSyncPending = (session) => {
    if (!session || session.closed) {
      return;
    }
    setPaneRenderReady(session, false);
    session.fullRenderPending = false;
    session.pendingRenderFitGeneration = 0;
    session.pendingRenderReplayGeneration = 0;
    session.pendingRenderContentGeneration = 0;
  };

  const invalidatePanePresentation = (session) => {
    if (!session || session.closed) {
      return;
    }
    markPaneSyncPending(session);
    session.hasPresentedFrame = false;
    session.shellEl.dataset.hasPresentedFrame = "false";
    releaseSessionTerminalFrame(session);
    session.term?.renderer?.clear?.();
    clearTerminalCanvasPixels(session);
  };

  const clearPanePresentationRetry = (session) => {
    if (!session) {
      return;
    }
    if (session.presentationRetryTimer) {
      window.clearTimeout(session.presentationRetryTimer);
    }
    session.presentationRetryTimer = 0;
    session.presentationRetryPending = false;
    session.presentationRetryReason = "";
  };

  const commitTerminalPresentationIfReady = (session) => {
    if (
      !session
      || session.closed
      || Number(session.measuredFitGeneration || 0) <= 0
      || !isPaneMeasurable(session)
      || !terminalCanvasMatchesExpectedSize(session)
      || !terminalRenderAllowed(session)
      || session.resizePresentationHold && !session.presentationCommitPending
    ) {
      return false;
    }
    if (session.resizeEpochSupported === true) {
      const requestedResizeEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
      const appliedResizeEpoch = normalizeTerminalResizeEpoch(session.appliedResizeEpoch);
      if (requestedResizeEpoch && requestedResizeEpoch !== appliedResizeEpoch) {
        return false;
      }
    }
    if (
      !session.fullRenderPending
      || session.activationFitPending
      || sessionReplayCommitIsPending(session)
      || session.pendingRenderFitGeneration !== session.measuredFitGeneration
      || session.pendingRenderReplayGeneration !== session.terminalReplayGeneration
      || session.pendingRenderContentGeneration !== session.terminalContentGeneration
    ) {
      return false;
    }
    session.fullRenderPending = false;
    if (["ready", "applied"].includes(session.resizeController?.phase)) {
      session.resizeController.commit();
    }
    session.presentedFitGeneration = session.measuredFitGeneration;
    session.presentedReplayGeneration = session.terminalReplayGeneration;
    session.presentedResizeEpoch = normalizeTerminalResizeEpoch(session.appliedResizeEpoch)
      || normalizeTerminalResizeEpoch(session.requestedResizeEpoch)
      || session.presentedResizeEpoch;
    session.hasPresentedFrame = true;
    session.renderGeneration = Number(session.renderGeneration || 0) + 1;
    session.renderSnapshot = createRenderSnapshot(session, { presented: true });
    session.shellEl.dataset.hasPresentedFrame = "true";
    session.presentedHistoryCursor = session.appliedHistoryCursor;
    session.presentationValidationAttempts = 0;
    session.presentationDeferredReason = "";
    clearPaneFullRenderValidation(session);
    clearPanePresentationRetry(session);
    recordTerminalSessionEvent(session, "full_render_complete");
    if (session.presentationCommitPending && session.resizePresentationHold) {
      session.presentationCommitPending = false;
      session.resizePresentationHold = false;
    }
    if (!session.renderReady && !session.resizePresentationHold) {
      setPaneRenderReady(session, true);
    }
    recordTerminalSessionEvent(session, "presentation_commit_complete", {
      renderGeneration: session.renderGeneration,
    });
    return true;
  };

  const markPaneRenderedIfMeasurable = (session) => {
    if (!session || session.closed) {
      return false;
    }
    if (session.pendingRenderContentGeneration === session.terminalContentGeneration) {
      session.presentedContentGeneration = session.terminalContentGeneration;
    }
    return commitTerminalPresentationIfReady(session);
  };

  const clearTerminalResizeFence = (session) => {
    if (!session) {
      return null;
    }
    if (session.resizeFenceDrainTimer) {
      window.clearTimeout(session.resizeFenceDrainTimer);
    }
    session.resizeFenceDrainTimer = 0;
    session.resizeFenceApplying = false;
    session.resizeFenceDrainRemainingEntries = null;
    const target = session.resizeFenceTarget;
    session.resizeFenceActive = false;
    session.resizeFenceTarget = null;
    return target;
  };

  const clearResizeOutputSettle = (session) => {
    if (!session) {
      return;
    }
    if (session.resizeOutputSettleTimer) {
      window.clearTimeout(session.resizeOutputSettleTimer);
    }
    session.resizeOutputSettleTimer = 0;
    session.resizeOutputSettleDrainPending = false;
    session.resizeOutputSettleDrainRemainingEntries = null;
    session.resizeOutputSettleActive = false;
    session.resizeOutputSettleStartedAt = 0;
    session.resizeOutputSettleDeadline = 0;
    session.resizeOutputSettleToken = Number(session.resizeOutputSettleToken || 0) + 1;
    endTerminalRenderSuppression(session, { render: false, reason: "resize" });
  };

  const finishResizeOutputSettle = (session, reason = "quiet") => {
    if (!session || session.closed || !session.resizeOutputSettleActive) {
      return false;
    }
    // Freeze the settle boundary once quiet/max-hold fires. Continuous output
    // arriving after this point must not keep the resize transaction open
    // forever; it remains queued for the normal live-output budget.
    if (
      session.resizeOutputSettleDrainRemainingEntries === null
      || session.resizeOutputSettleDrainRemainingEntries === undefined
    ) {
      session.resizeOutputSettleDrainRemainingEntries = Array.isArray(session.outputQueue)
        ? session.outputQueue.length
        : 0;
    }
    const drainEntriesBefore = Array.isArray(session.outputQueue) ? session.outputQueue.length : 0;
    if (session.resizeOutputSettleDrainRemainingEntries > 0) {
      flushSessionOutput(session, {
        force: true,
        maxBytes: terminalResizeOutputFlushBudgetBytes,
        maxEntries: session.resizeOutputSettleDrainRemainingEntries,
        scheduleRemainder: false,
      });
      const drainEntriesAfter = Array.isArray(session.outputQueue) ? session.outputQueue.length : 0;
      const drainedEntries = Math.max(0, drainEntriesBefore - drainEntriesAfter);
      session.resizeOutputSettleDrainRemainingEntries = Math.max(
        0,
        session.resizeOutputSettleDrainRemainingEntries - drainedEntries,
      );
    }
    if (session.resizeOutputSettleDrainRemainingEntries > 0) {
      if (!session.resizeOutputSettleDrainPending) {
        session.resizeOutputSettleDrainPending = true;
        session.resizeOutputSettleTimer = window.setTimeout(() => {
          session.resizeOutputSettleTimer = 0;
          session.resizeOutputSettleDrainPending = false;
          finishResizeOutputSettle(session, "drain");
        }, terminalOutputFlushFallbackMs);
      }
      return false;
    }
    clearResizeOutputSettle(session);
    endTerminalRenderSuppression(session, { render: false, reason: "resize" });
    if (session.resizeController?.phase === "settling") {
      session.resizeController.finishSettle(session.resizeControllerSettleToken);
    }
    recordTerminalSessionEvent(session, "resize_output_settle_complete", { reason });
    if (session.outputQueueSize > 0) {
      scheduleSessionOutputFlush(session);
    }
    if (session.closed || session.name !== activeName) {
      return false;
    }
    return ensurePanePresentation(session, {
      reason: `resize_output_${reason}`,
      forceHistory: true,
    });
  };

  const scheduleResizeOutputSettle = (session, { reason = "resize_ack" } = {}) => {
    if (!session || session.closed || !sessionReplayIsCommitted(session)) {
      return false;
    }
    const now = performanceTaskNow();
    if (!session.resizeOutputSettleActive) {
      session.resizeOutputSettleActive = true;
      session.resizeOutputSettleStartedAt = now;
      session.resizeOutputSettleDeadline = now + terminalResizeOutputMaxHoldMs;
      if (session.resizeController?.phase === "applied") {
        session.resizeControllerSettleToken = session.resizeController.beginSettle();
      }
      recordTerminalSessionEvent(session, "resize_output_settle_start", { reason });
    }
    if (session.resizeOutputSettleTimer) {
      window.clearTimeout(session.resizeOutputSettleTimer);
    }
    const token = Number(session.resizeOutputSettleToken || 0) + 1;
    session.resizeOutputSettleToken = token;
    const remaining = Math.max(0, session.resizeOutputSettleDeadline - now);
    const delay = Math.min(terminalResizeOutputQuietMs, remaining);
    session.resizeOutputSettleTimer = window.setTimeout(() => {
      session.resizeOutputSettleTimer = 0;
      if (
        session.closed
        || !session.resizeOutputSettleActive
        || Number(session.resizeOutputSettleToken || 0) !== token
      ) {
        return;
      }
      const deadlineReached = performanceTaskNow() >= session.resizeOutputSettleDeadline;
      finishResizeOutputSettle(session, deadlineReached ? "max_hold" : "quiet");
    }, delay);
    return true;
  };

  const applyTerminalResizeFence = (session) => {
    if (!session || session.closed || !session.resizeFenceActive || !session.resizeFenceTarget || session.resizeFenceApplying) {
      return false;
    }
    session.resizeFenceApplying = true;
    const target = session.resizeFenceTarget;
    if (session.resizeFenceDrainRemainingEntries === null || session.resizeFenceDrainRemainingEntries === undefined) {
      session.resizeFenceDrainRemainingEntries = Array.isArray(session.outputQueue) ? session.outputQueue.length : 0;
    }
    // The ACK is ordered after all output produced before Setsize. Drain only
    // the entries already queued at the request boundary while the terminal
    // still has its old geometry. Later entries belong to the new epoch and
    // remain queued until after the local grid switches.
    const drainEntriesBefore = Array.isArray(session.outputQueue) ? session.outputQueue.length : 0;
    if (session.resizeFenceDrainRemainingEntries > 0) {
      flushSessionOutput(session, {
        force: true,
        maxBytes: terminalResizeOutputFlushBudgetBytes,
        maxEntries: session.resizeFenceDrainRemainingEntries,
        scheduleRemainder: false,
      });
      const drainEntriesAfter = Array.isArray(session.outputQueue) ? session.outputQueue.length : 0;
      const drainedEntries = Math.max(0, drainEntriesBefore - drainEntriesAfter);
      session.resizeFenceDrainRemainingEntries = Math.max(
        0,
        session.resizeFenceDrainRemainingEntries - drainedEntries,
      );
    }
    if (session.resizeFenceDrainRemainingEntries > 0) {
      session.resizeFenceApplying = false;
      recordTerminalSessionEvent(session, "resize_fence_wait", {
        cols: target.cols,
        rows: target.rows,
        reason: "output_drain",
      });
      if (!session.resizeFenceDrainTimer) {
        session.resizeFenceDrainTimer = window.setTimeout(() => {
          session.resizeFenceDrainTimer = 0;
          applyTerminalResizeFence(session);
        }, terminalOutputFlushFallbackMs);
      }
      return false;
    }
    session.suppressTerminalResizeSend = true;
    beginTerminalRenderSuppression(session, "resize");
    try {
      session.term.resize(target.cols, target.rows);
      restoreTerminalViewport(session.term, target.viewport);
      recordTerminalSessionEvent(session, "term_resize", {
        cols: target.cols,
        rows: target.rows,
        deferredUntilAck: true,
      });
    } catch (error) {
      session.suppressTerminalResizeSend = false;
      endTerminalRenderSuppression(session, { render: false, reason: "resize" });
      session.resizeFenceApplying = false;
      session.lastHistoryResetFailureReason = "resize_fence_apply_failed";
      clearTerminalResizeFence(session);
      console.warn("[terminal-resize] deferred local resize failed", {
        name: session.name,
        pane: session.id,
        cols: target.cols,
        rows: target.rows,
        error: error?.message || String(error),
      });
      return false;
    }
    session.suppressTerminalResizeSend = false;
    clearTerminalResizeFence(session);
    session.resizeFenceApplying = false;
    session.activationFitPending = false;
    session.measuredFitGeneration = Number(session.measuredFitGeneration || 0) + 1;
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
    syncTerminalViewportPan(session);
    updateMobileSelectionHandles(session);
    if (sessionReplayIsCommitted(session)) {
      setPaneRenderReady(session, false);
    }
    if (!scheduleResizeOutputSettle(session)) {
      endTerminalRenderSuppression(session, { render: false, reason: "resize" });
      ensurePanePresentation(session, {
        reason: "resize_fence_applied",
        forceHistory: true,
      });
    }
    if (session.outputQueueSize > 0) {
      scheduleSessionOutputFlush(session);
    }
    return true;
  };

  const applyObservedTerminalResize = (session, message) => {
    if (!session || session.closed) {
      return false;
    }
    const cols = Math.max(1, Math.floor(Number(message?.cols) || 0));
    const rows = Math.max(1, Math.floor(Number(message?.rows) || 0));
    if (cols <= 0 || rows <= 0) {
      return false;
    }
    clearResizeOutputSettle(session);
    session.resizeFenceActive = true;
    session.resizeFenceTarget = {
      cols,
      rows,
      pixelWidth: Math.max(0, Math.floor(Number(message?.pixel_width) || 0)),
      pixelHeight: Math.max(0, Math.floor(Number(message?.pixel_height) || 0)),
      viewport: captureTerminalViewport(session.term),
    };
    return applyTerminalResizeFence(session);
  };

  const handleTerminalResizeApplied = (session, message) => {
    if (!session || session.closed) {
      return;
    }
    const epoch = normalizeTerminalResizeEpoch(message?.resize_epoch);
    if (!epoch) {
      return;
    }
    session.resizeEpochSupported = true;
    const requestedEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
    const appliedEpoch = normalizeTerminalResizeEpoch(session.appliedResizeEpoch);
    if (appliedEpoch && BigInt(epoch) < BigInt(appliedEpoch)) {
      recordTerminalSessionEvent(session, "resize_ack_stale", {
        ackEpoch: epoch,
        requestedEpoch,
        inFlightEpoch: requestedEpoch,
        pendingEpoch: normalizeTerminalResizeEpoch(session.pendingResizeEpoch || session.pendingResizeTarget?.resizeEpoch),
        appliedEpoch,
        connectionEpoch: Number(session.connectionEpoch || 0),
        resizeFenceActive: session.resizeFenceActive === true,
        resizeAckPending: session.resizeAckPending === true,
        ackCols: Math.max(0, Math.floor(Number(message?.cols) || 0)),
        ackRows: Math.max(0, Math.floor(Number(message?.rows) || 0)),
        requestedCols: Number(session.requestedCols || 0),
        requestedRows: Number(session.requestedRows || 0),
      });
      return;
    }
    const ackDimensions = {
      cols: Math.max(0, Math.floor(Number(message.cols) || 0)),
      rows: Math.max(0, Math.floor(Number(message.rows) || 0)),
      pixelWidth: Math.max(0, Math.floor(Number(message.pixel_width) || 0)),
      pixelHeight: Math.max(0, Math.floor(Number(message.pixel_height) || 0)),
    };
    const resizeController = session.resizeController || (session.resizeController = new TerminalResizeController());
    try {
      resizeController.acknowledge({
        requestID: String(requestedEpoch || epoch),
        connectionEpoch: Number(session.connectionEpoch || 0),
        resizeEpoch: epoch,
        dimensions: ackDimensions,
      });
    } catch (error) {
      recordTerminalSessionEvent(session, "resize_ack_stale", {
        ackEpoch: epoch,
        requestedEpoch,
        inFlightEpoch: requestedEpoch,
        pendingEpoch: normalizeTerminalResizeEpoch(session.pendingResizeEpoch || session.pendingResizeTarget?.resizeEpoch),
        appliedEpoch,
        connectionEpoch: Number(session.connectionEpoch || 0),
        resizeFenceActive: session.resizeFenceActive === true,
        resizeAckPending: session.resizeAckPending === true,
        ackCols: ackDimensions.cols,
        ackRows: ackDimensions.rows,
        requestedCols: Number(session.requestedCols || 0),
        requestedRows: Number(session.requestedRows || 0),
      });
      console.warn("[terminal-resize] rejected stale resize ACK", error);
      return;
    }
    session.appliedResizeEpoch = epoch;
    session.serverCols = ackDimensions.cols;
    session.serverRows = ackDimensions.rows;
    session.serverPixelWidth = ackDimensions.pixelWidth;
    session.serverPixelHeight = ackDimensions.pixelHeight;
    const pendingResizeTarget = session.pendingResizeTarget;
    session.pendingResizeTarget = null;
    recordTerminalSessionEvent(session, "resize_applied", {
      appliedResizeEpoch: epoch,
      cols: session.serverCols,
      rows: session.serverRows,
    });
    const resizeFenceTarget = session.resizeFenceTarget;
    const resizeFenceMatchesAck = Boolean(
      session.resizeFenceActive
      && resizeFenceTarget
      && resizeFenceTarget.cols === session.serverCols
      && resizeFenceTarget.rows === session.serverRows
      && (!resizeFenceTarget.pixelWidth || !session.serverPixelWidth || resizeFenceTarget.pixelWidth === session.serverPixelWidth)
      && (!resizeFenceTarget.pixelHeight || !session.serverPixelHeight || resizeFenceTarget.pixelHeight === session.serverPixelHeight)
    );
    if (resizeFenceMatchesAck) {
      applyTerminalResizeFence(session);
    } else if (session.resizeFenceActive && requestedEpoch && epoch === requestedEpoch) {
      // The server may normalize or arbitrate the requested geometry. Apply
      // the acknowledged PTY size locally instead of leaving the old grid in
      // place until a later focus/click triggers another fit.
      applyObservedTerminalResize(session, message);
    }
    const appliedGeometryMatchesLocal = dimensionsEqualTerminalSize(session, {
      cols: session.serverCols,
      rows: session.serverRows,
    });
    const remoteEpoch = Boolean(requestedEpoch && BigInt(epoch) > BigInt(requestedEpoch));
    if (remoteEpoch) {
      session.requestedResizeEpoch = epoch;
      session.requestedCols = session.serverCols;
      session.requestedRows = session.serverRows;
      session.requestedPixelWidth = session.serverPixelWidth;
      session.requestedPixelHeight = session.serverPixelHeight;
    }
    if (remoteEpoch && !appliedGeometryMatchesLocal) {
      // A resize applied by another device is an observation, not an
      // invitation to send this device's geometry back. Adopt the shared PTY
      // size locally and wait for explicit user interaction before claiming.
      session.resizeAckPending = false;
      session.sizeClaimRequired = true;
      applyObservedTerminalResize(session, message);
      return;
    }
    if (!requestedEpoch || epoch === requestedEpoch || BigInt(epoch) > BigInt(requestedEpoch)) {
      session.resizeAckPending = false;
      session.sizeClaimRequired = !dimensionsEqualTerminalSize(session, {
        cols: session.serverCols,
        rows: session.serverRows,
      });
      ensurePanePresentation(session, {
        reason: "resize_applied",
        forceHistory: true,
      });
      if (pendingResizeTarget && !resizeTargetMatches({
        cols: session.serverCols,
        rows: session.serverRows,
        pixelWidth: session.serverPixelWidth,
        pixelHeight: session.serverPixelHeight,
      }, pendingResizeTarget)) {
        window.requestAnimationFrame(() => {
          if (session.closed || session.resizeAckPending) {
            return;
          }
          schedulePaneResize(session, {
            forceFullRender: true,
            hideUntilRender: true,
            forceSizeSync: true,
          }, { immediate: true });
        });
      }
    }
  };

  const handleTerminalResizeError = (session, message) => {
    if (!session || session.closed) {
      return;
    }
    const epoch = normalizeTerminalResizeEpoch(message?.resize_epoch);
    const requestedEpoch = normalizeTerminalResizeEpoch(session.requestedResizeEpoch);
    if (epoch && requestedEpoch && epoch !== requestedEpoch) {
      return;
    }
    const resizeController = session.resizeController || (session.resizeController = new TerminalResizeController());
    try {
      resizeController.fail({
        requestID: String(epoch || requestedEpoch || ""),
        connectionEpoch: Number(session.connectionEpoch || 0),
        resizeEpoch: epoch || requestedEpoch || undefined,
      });
    } catch (error) {
      console.warn("[terminal-resize] rejected stale resize error", error);
      return;
    }
    session.resizeAckPending = false;
    session.sizeClaimRequired = true;
    if (String(message?.reason || "").trim() === "resize_owner_active") {
      const appliedEpoch = normalizeTerminalResizeEpoch(message?.applied_epoch);
      if (appliedEpoch) {
        session.appliedResizeEpoch = appliedEpoch;
        session.requestedResizeEpoch = appliedEpoch;
      }
      session.serverCols = Math.max(0, Math.floor(Number(message?.cols) || 0));
      session.serverRows = Math.max(0, Math.floor(Number(message?.rows) || 0));
      session.serverPixelWidth = Math.max(0, Math.floor(Number(message?.pixel_width) || 0));
      session.serverPixelHeight = Math.max(0, Math.floor(Number(message?.pixel_height) || 0));
      session.requestedCols = session.serverCols;
      session.requestedRows = session.serverRows;
      session.requestedPixelWidth = session.serverPixelWidth;
      session.requestedPixelHeight = session.serverPixelHeight;
      applyObservedTerminalResize(session, message);
      return;
    }
    clearResizeOutputSettle(session);
    clearTerminalResizeFence(session);
    recordTerminalSessionEvent(session, "resize_error", {
      resizeErrorEpoch: epoch,
      reason: String(message?.reason || ""),
    });
    if (session.resizePresentationHold) {
      session.resizePresentationHold = false;
      session.presentationCommitPending = false;
      if (session.hasPresentedFrame) {
        setPaneRenderReady(session, false);
      }
    }
    console.warn("[terminal-resize] resize rejected", {
      name: session.name,
      pane: session.id,
      epoch,
      reason: message?.reason || "",
    });
    ensurePanePresentation(session, {
      reason: "resize_error",
      forceHistory: true,
    });
  };

  const terminalRenderAllowed = (session) => Boolean(
    session
    && sessionReplayIsCommitted(session)
    && !session.resizeFenceActive
    && !session.resizeAckPending
    && !session.resizeOutputSettleActive
  );

  const requestPaneFullRender = (session) => {
    if (!session?.term || session.closed) {
      return;
    }
    session.fullRenderPending = true;
    session.pendingRenderFitGeneration = session.measuredFitGeneration;
    session.pendingRenderReplayGeneration = session.terminalReplayGeneration;
    session.pendingRenderContentGeneration = session.terminalContentGeneration;
    if (!terminalRenderAllowed(session)) {
      recordTerminalSessionEvent(session, "render_blocked", {
        reason: sessionReplayIsCommitted(session) ? "resize" : "replay",
      });
      return;
    }
    recordTerminalSessionEvent(session, "full_render_request");
    session.term.requestRender?.({ full: true });
  };

  const cancelPendingTerminalRender = (term) => {
    if (!term) {
      return false;
    }
    const fullRenderRequested = term.renderFullNextFrame === true;
    if (term.animationFrameId) {
      window.cancelAnimationFrame(term.animationFrameId);
    }
    if (term.renderRetryTimer !== undefined) {
      window.clearTimeout(term.renderRetryTimer);
      term.renderRetryTimer = undefined;
    }
    if (term.renderThrottleTimer !== undefined) {
      window.clearTimeout(term.renderThrottleTimer);
      term.renderThrottleTimer = undefined;
    }
    term.animationFrameId = undefined;
    term.renderFullNextFrame = fullRenderRequested;
    return fullRenderRequested;
  };

  const deferHiddenPaneRender = (session) => {
    if (!session?.term || session.closed || isPaneVisibleForSizing(session)) {
      return false;
    }
    cancelPendingTerminalRender(session.term);
    return true;
  };

  const commitTerminalPresentationNow = (session) => {
    if (!session?.term || session.closed || !session.resizePresentationHold || !session.hasPresentedFrame) {
      return false;
    }
    session.presentationCommitPending = true;
    renderPaneFullNow(session);
    return true;
  };

  const renderPaneFullNow = (session) => {
    const term = session?.term;
    if (!term || session.closed || typeof term.renderNow !== "function") {
      requestPaneFullRender(session);
      return false;
    }
    if (!terminalRenderAllowed(session)) {
      session.fullRenderPending = true;
      session.pendingRenderFitGeneration = session.measuredFitGeneration;
      session.pendingRenderReplayGeneration = session.terminalReplayGeneration;
      session.pendingRenderContentGeneration = session.terminalContentGeneration;
      recordTerminalSessionEvent(session, "render_blocked", {
        reason: sessionReplayIsCommitted(session) ? "resize" : "replay",
      });
      return false;
    }
    cancelPendingTerminalRender(term);
    session.fullRenderPending = true;
    session.pendingRenderFitGeneration = session.measuredFitGeneration;
    session.pendingRenderReplayGeneration = session.terminalReplayGeneration;
    session.pendingRenderContentGeneration = session.terminalContentGeneration;
    term.renderFullNextFrame = false;
    recordTerminalSessionEvent(session, "full_render_start");
    const rendered = term.renderNow(true) !== false;
    if (rendered) {
      recordTerminalSessionEvent(session, "presentation_render_start");
    } else {
      recordTerminalSessionEvent(session, "presentation_render_failed");
      recordTerminalSessionEvent(session, "full_render_failed");
      schedulePanePresentationRetry(session, {
        reason: "render_failed",
        forceHistory: true,
      });
    }
    return rendered;
  };

  const deferPanePresentation = (session, reason = "hidden") => {
    if (!session || session.closed) {
      return false;
    }
    setPaneRenderReady(session, false);
    cancelPendingTerminalRender(session.term);
    session.fullRenderPending = false;
    session.pendingRenderFitGeneration = 0;
    session.pendingRenderReplayGeneration = 0;
    session.pendingRenderContentGeneration = 0;
    if (session.presentationDeferredReason !== reason) {
      session.presentationDeferredReason = reason;
      recordTerminalSessionEvent(session, "presentation_deferred", { reason });
    }
    return true;
  };

  const retryPendingPaneResize = (session, reason) => {
    if (
      !session?.resizeAckPending
      || session.closed
      || session.socket?.readyState !== WebSocket.OPEN
      || performanceTaskNow() - Number(session.lastResizeRequestAt || 0) < terminalPresentationResizeRetryMs
    ) {
      return false;
    }
    const target = session.resizeFenceTarget || {
      cols: session.requestedCols,
      rows: session.requestedRows,
      pixelWidth: session.requestedPixelWidth,
      pixelHeight: session.requestedPixelHeight,
    };
    if (Number(target.cols || 0) <= 0 || Number(target.rows || 0) <= 0) {
      return false;
    }
    const sent = sendTerminalSize(session, {
      force: true,
      dimensions: target,
    });
    if (sent) {
      recordTerminalSessionEvent(session, "resize_fence_retry", { reason });
    }
    return sent;
  };

  const ensurePanePresentation = (session, {
    reason = "presentation_check",
    forceHistory = false,
    scheduleValidation = true,
  } = {}) => {
    if (!session || session.closed || !sessionReplayIsCommitted(session) || session.name !== activeName) {
      return false;
    }
    if (!isPaneVisibleForSizing(session) || !isPaneMeasurable(session)) {
      deferPanePresentation(session, `${reason}:hidden`);
      schedulePanePresentationRetry(session, { reason: `${reason}:hidden`, forceHistory });
      return false;
    }
    setPaneRenderReady(session, false);
    session.presentationDeferredReason = "";
    if (session.resizeFenceActive || session.resizeAckPending || session.resizeOutputSettleActive) {
      retryPendingPaneResize(session, reason);
      recordTerminalSessionEvent(session, "presentation_wait_resize", { reason });
      if (scheduleValidation) {
        schedulePaneFullRenderValidation(session, { forceHistory });
      }
      schedulePanePresentationRetry(session, { reason: `${reason}:resize`, forceHistory });
      return false;
    }
    if (session.activationFitPending || !terminalCanvasMatchesExpectedSize(session)) {
      schedulePaneResize(session, {
        forceFullRender: true,
        hideUntilRender: true,
      }, { immediate: true });
      if (scheduleValidation) {
        schedulePaneFullRenderValidation(session, { forceHistory });
      }
      schedulePanePresentationRetry(session, { reason: `${reason}:geometry`, forceHistory });
      return false;
    }
    requestPaneFullRender(session);
    if (session.hasPresentedFrame && session.resizePresentationHold) {
      commitTerminalPresentationNow(session);
    } else {
      if (session.resizePresentationHold) {
        session.resizePresentationHold = false;
        session.presentationCommitPending = false;
      }
      renderPaneFullNow(session);
    }
    recordTerminalSessionEvent(session, "presentation_ensure", { reason });
    if (scheduleValidation) {
      schedulePaneFullRenderValidation(session, { forceHistory });
    }
    if (!panePresentationIsCurrent(session)) {
      schedulePanePresentationRetry(session, { reason, forceHistory });
    }
    return true;
  };

  const schedulePanePresentationFrame = (session, reason = "presentation_frame") => {
    if (!session || session.closed || session.presentationFramePending) {
      return false;
    }
    session.presentationFramePending = true;
    session.presentationFrameReason = reason;
    window.requestAnimationFrame(() => {
      session.presentationFramePending = false;
      const frameReason = session.presentationFrameReason || reason;
      session.presentationFrameReason = "";
      if (session.closed || session.name !== activeName) {
        return;
      }
      ensurePanePresentation(session, {
        reason: frameReason,
        forceHistory: true,
      });
    });
    return true;
  };

  const clearPaneFullRenderValidation = (session) => {
    if (!session?.fullRenderValidationTimer) {
      return;
    }
    window.clearTimeout(session.fullRenderValidationTimer);
    session.fullRenderValidationTimer = 0;
  };

  const schedulePaneFullRenderValidation = (session, { forceHistory = false } = {}) => {
    if (
      !session
      || session.closed
      || !sessionReplayIsCommitted(session)
      || (!forceHistory && panePresentationIsCurrent(session))
    ) {
      return;
    }
    clearPaneFullRenderValidation(session);
    const replayGeneration = Number(session.terminalReplayGeneration || 0);
    const validationAttempt = Math.max(0, Number(session.presentationValidationAttempts || 0));
    const validationDelay = Math.min(
      terminalPresentationValidationMaxMs,
      terminalFullRenderValidationMs * (2 ** Math.min(validationAttempt, 4)),
    );
    session.fullRenderValidationTimer = window.setTimeout(() => {
      session.fullRenderValidationTimer = 0;
      session.presentationValidationAttempts = validationAttempt + 1;
      if (!session.closed && sessionReplayIsCommitted(session)) {
        const sameReplay = Number(session.terminalReplayGeneration || 0) === replayGeneration;
        if (!sameReplay) {
          return;
        }
        const scrollbackLength = Math.max(0, Number(session.term?.getScrollbackLength?.() || 0));
        const presentationBlockedByResize = session.resizeFenceActive
          || session.resizeAckPending
          || session.resizeOutputSettleActive;
        if (forceHistory && scrollbackLength > 0 && !presentationBlockedByResize && isPaneVisibleForSizing(session)) {
          // The first bottom-frame render can succeed before Ghostty's
          // scrollback provider is ready. Paint the whole viewport again after
          // layout has settled, then verify once more on the next frame.
          ensurePanePresentation(session, {
            reason: "history_validation",
            forceHistory: true,
            scheduleValidation: false,
          });
          window.requestAnimationFrame(() => {
            if (
              !session.closed
              && sessionReplayIsCommitted(session)
              && Number(session.terminalReplayGeneration || 0) === replayGeneration
              && isPaneVisibleForSizing(session)
            ) {
              ensurePanePresentation(session, {
                reason: "history_validation_frame",
                forceHistory: true,
                scheduleValidation: false,
              });
            }
          });
        } else {
          ensurePanePresentation(session, {
            reason: isPaneVisibleForSizing(session) ? "presentation_validation" : "presentation_wait_measure",
            forceHistory,
            scheduleValidation: false,
          });
        }
        if (!panePresentationIsCurrent(session)) {
          schedulePaneFullRenderValidation(session, { forceHistory });
        }
      }
    }, validationDelay);
  };

  const schedulePanePresentationRetry = (session, {
    reason = "presentation_retry",
    forceHistory = true,
  } = {}) => {
    if (
      !session
      || session.closed
      || !sessionReplayIsCommitted(session)
      || session.name !== activeName
      || panePresentationIsCurrent(session)
    ) {
      return false;
    }
    session.presentationRetryReason = String(reason || "presentation_retry");
    if (session.presentationRetryPending) {
      return true;
    }
    session.presentationRetryPending = true;
    const replayGeneration = Number(session.terminalReplayGeneration || 0);
    const connectionEpoch = Number(session.connectionEpoch || 0);
    const delay = Math.min(
      terminalPresentationValidationMaxMs,
      terminalFullRenderValidationMs * (2 ** Math.min(Number(session.presentationValidationAttempts || 0), 4)),
    );
    session.presentationRetryTimer = window.setTimeout(() => {
      session.presentationRetryTimer = 0;
      session.presentationRetryPending = false;
      if (
        session.closed
        || session.name !== activeName
        || !sessionReplayIsCommitted(session)
        || Number(session.terminalReplayGeneration || 0) !== replayGeneration
        || Number(session.connectionEpoch || 0) !== connectionEpoch
      ) {
        return;
      }
      recordTerminalSessionEvent(session, "presentation_retry_scheduled", {
        reason: session.presentationRetryReason || reason,
        delay,
      });
      schedulePanePresentationFrame(session, `retry:${session.presentationRetryReason || reason}`);
      if (!panePresentationIsCurrent(session)) {
        schedulePaneFullRenderValidation(session, { forceHistory });
      }
    }, delay);
    return true;
  };

  const installTerminalCanvasRecovery = (session) => {
    const canvas = session?.term?.canvas || session?.term?.renderer?.getCanvas?.();
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    const handleContextLost = (event) => {
      event.preventDefault?.();
      setPaneRenderReady(session, false);
      session.fullRenderPending = false;
      session.pendingRenderFitGeneration = 0;
      session.pendingRenderReplayGeneration = 0;
      schedulePanePresentationRetry(session, { reason: "context_lost" });
    };
    const handleContextRestored = () => {
      if (session.closed) {
        return;
      }
      schedulePanePresentationRetry(session, { reason: "context_restored" });
    };
    canvas.addEventListener("contextlost", handleContextLost);
    canvas.addEventListener("contextrestored", handleContextRestored);
    addSessionCleanup(session, () => {
      canvas.removeEventListener("contextlost", handleContextLost);
      canvas.removeEventListener("contextrestored", handleContextRestored);
    });
  };

  const syncTabMobilePixelScroll = (tab) => {
    if (!tab) {
      return;
    }
    for (const session of tab.panes.values()) {
      syncTerminalMobilePixelScroll(session);
    }
  };

  const isThemePickerOpen = () => Boolean(themePickerBackdrop && !themePickerBackdrop.hidden);

  const resetThemePickerEdgeSwipe = () => {
    themePickerEdgeSwipe = null;
  };

  const handleThemePickerTouchStart = (event) => {
    if (!isThemePickerOpen() || !isMobileLayout() || event.touches.length !== 1) {
      resetThemePickerEdgeSwipe();
      return;
    }
    const touch = event.touches[0];
    if (touch.clientX > themePickerSwipeEdgeWidth) {
      resetThemePickerEdgeSwipe();
      return;
    }
    themePickerEdgeSwipe = {
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
    };
  };

  const handleThemePickerTouchMove = (event) => {
    if (!themePickerEdgeSwipe || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - themePickerEdgeSwipe.startX;
    const deltaY = touch.clientY - themePickerEdgeSwipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!themePickerEdgeSwipe.horizontal) {
      if (absY > themePickerSwipeAxisThreshold && absY > absX) {
        resetThemePickerEdgeSwipe();
        return;
      }
      if (deltaX > themePickerSwipeAxisThreshold && absX > absY * 1.2) {
        themePickerEdgeSwipe.horizontal = true;
      }
    }

    if (!themePickerEdgeSwipe?.horizontal) {
      return;
    }

    event.preventDefault();
    if (deltaX >= themePickerSwipeCloseDistance && absY <= themePickerSwipeMaxVerticalTravel) {
      closeThemePicker();
    }
  };

  const handleThemePickerScrollbarPointerMove = (event) => {
    if (!themePickerScrollbarDragging || event.pointerId !== themePickerScrollbarPointerId) {
      return;
    }
    event.preventDefault();
    const trackRect = themePickerScrollbarTrack?.getBoundingClientRect();
    if (!trackRect) {
      return;
    }
    const nextThumbTop = event.clientY - trackRect.top - themePickerScrollbarThumbPointerOffset;
    setThemePickerScrollFromThumbTop(nextThumbTop);
  };

  const handleThemePickerScrollbarPointerUp = (event) => {
    if (!themePickerScrollbarDragging || event.pointerId !== themePickerScrollbarPointerId) {
      return;
    }
    stopThemePickerScrollbarDrag();
  };

  const getOrderedTabs = () => {
    const ordered = Array.from(tabsEl.querySelectorAll(".tab"))
      .map((button) => tabs.get(button.dataset.tabId))
      .filter(Boolean);
    const orderedIDs = new Set(ordered.map((tab) => tab.id));
    for (const tab of tabs.values()) {
      if (!orderedIDs.has(tab.id)) {
        ordered.push(tab);
      }
    }
    return ordered;
  };

  const pruneRecentTabIds = () => {
    const next = [];
    for (const id of recentTabIds) {
      if (id && tabs.has(id) && !next.includes(id)) {
        next.push(id);
      }
      if (next.length >= 2) {
        break;
      }
    }
    return applyRecentTabIds(next);
  };

  const normalizeRecentTabIds = (ids) => {
    const next = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      const tabId = String(id || "").trim();
      if (tabId && tabs.has(tabId) && !next.includes(tabId)) {
        next.push(tabId);
      }
      if (next.length >= 2) {
        break;
      }
    }
    return next;
  };

  const persistRecentTabIds = (name = activeName) => {
    const targetName = String(name || "").trim();
    if (!targetName) {
      return;
    }
    try {
      const key = recentTabsStorageKey(targetName);
      if (recentTabIds.length > 0) {
        window.localStorage.setItem(key, JSON.stringify(recentTabIds));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
    }
  };

  const loadStoredRecentTabIds = (name = activeName) => {
    const targetName = String(name || "").trim();
    if (!targetName) {
      return [];
    }
    try {
      return normalizeRecentTabIds(JSON.parse(window.localStorage.getItem(recentTabsStorageKey(targetName)) || "[]"));
    } catch (error) {
      return [];
    }
  };

  const applyRecentTabIds = (ids, { persist = true, name = activeName } = {}) => {
    recentTabIds = normalizeRecentTabIds(ids);
    if (persist) {
      persistRecentTabIds(name);
    }
    return recentTabIds;
  };

  const rememberRecentTab = (tabId, previousTabId = "") => {
    const nextId = String(tabId || "").trim();
    const previousId = String(previousTabId || "").trim();
    const next = [];
    if (nextId && tabs.has(nextId)) {
      next.push(nextId);
    }
    for (const id of [previousId, ...recentTabIds]) {
      if (id && id !== nextId && tabs.has(id) && !next.includes(id)) {
        next.push(id);
      }
      if (next.length >= 2) {
        break;
      }
    }
    return applyRecentTabIds(next);
  };

  const swapRecentTabs = () => {
    const targetId = pruneRecentTabIds().find((id) => id !== activeTabId);
    if (!targetId) {
      showToast("没有可切换的最近终端。");
      return false;
    }
    setActiveTab(targetId);
    return true;
  };

  const scrollTabButtonIntoView = (button) => {
    if (!button || !tabsEl.contains(button)) {
      return;
    }
    const containerRect = tabsEl.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    if (buttonRect.left < containerRect.left) {
      tabsEl.scrollLeft -= containerRect.left - buttonRect.left;
    } else if (buttonRect.right > containerRect.right) {
      tabsEl.scrollLeft += buttonRect.right - containerRect.right;
    }
  };

  const isTabOverviewOpen = () => Boolean(tabOverview && !tabOverview.hidden);

  const readTabOverviewColors = () => {
    const styles = getComputedStyle(document.documentElement);
    return {
      bg: styles.getPropertyValue("--terminal-bg").trim() || "#000000",
      muted: styles.getPropertyValue("--muted").trim() || "#9ca3af",
      line: styles.getPropertyValue("--chrome-line").trim() || "rgba(148, 163, 184, 0.18)",
    };
  };

  const isMobileTabOverviewLayout = () => isMobileLayout();

  const parseCSSPixel = (value) => {
    const parsed = Number.parseFloat(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const tabOverviewTerminalSize = () => {
    const rect = terminalArea?.getBoundingClientRect?.();
    const fallbackWidth = window.visualViewport?.width || window.innerWidth || 16;
    const fallbackHeight = window.visualViewport?.height || window.innerHeight || 10;
    const width = Math.max(1, Math.round(rect?.width || fallbackWidth));
    const height = Math.max(1, Math.round(rect?.height || fallbackHeight));
    return { width, height };
  };

  const syncDesktopTabOverviewGrid = (terminalSize) => {
    const rows = terminalSize.height > terminalSize.width ? 4 : 3;
    const columns = terminalSize.height > terminalSize.width ? 3 : 4;
    const gridStyles = getComputedStyle(tabOverviewGrid);
    const gap = parseCSSPixel(gridStyles.rowGap || gridStyles.gap);
    const paddingY = parseCSSPixel(gridStyles.paddingTop) + parseCSSPixel(gridStyles.paddingBottom);
    const gridHeight = Math.max(1, tabOverviewGrid.clientHeight - paddingY);
    const cardHeight = Math.max(1, (gridHeight - gap * (rows - 1)) / rows);
    tabOverviewGrid.style.setProperty("--tab-overview-columns", String(columns));
    tabOverviewGrid.style.setProperty("--tab-overview-meta-height", "48px");
    tabOverviewGrid.style.setProperty("--tab-overview-card-height", `${Math.floor(cardHeight)}px`);
    tabOverviewGrid.style.removeProperty("--tab-overview-mobile-card-height");
  };

  const syncTabOverviewPreviewRatio = () => {
    if (!tabOverviewGrid) {
      return;
    }
    const terminalSize = tabOverviewTerminalSize();
    const ratio = terminalSize.width / terminalSize.height;
    tabOverviewGrid.style.setProperty("--tab-overview-preview-ratio", `${terminalSize.width} / ${terminalSize.height}`);
    if (!isMobileTabOverviewLayout()) {
      syncDesktopTabOverviewGrid(terminalSize);
      return;
    }
    tabOverviewGrid.style.setProperty("--tab-overview-columns", "2");
    tabOverviewGrid.style.setProperty("--tab-overview-meta-height", "46px");
    tabOverviewGrid.style.removeProperty("--tab-overview-card-height");
    const gridStyles = getComputedStyle(tabOverviewGrid);
    const gap = parseCSSPixel(gridStyles.rowGap || gridStyles.gap);
    const columnGap = parseCSSPixel(gridStyles.columnGap || gridStyles.gap);
    const paddingX = parseCSSPixel(gridStyles.paddingLeft) + parseCSSPixel(gridStyles.paddingRight);
    const paddingY = parseCSSPixel(gridStyles.paddingTop) + parseCSSPixel(gridStyles.paddingBottom);
    const gridWidth = Math.max(1, tabOverviewGrid.clientWidth - paddingX);
    const gridHeight = Math.max(1, tabOverviewGrid.clientHeight - paddingY);
    const previewWidth = Math.max(1, (gridWidth - columnGap) / 2);
    const naturalCardHeight = previewWidth / ratio + 46;
    const twoRowCardHeight = Math.max(1, (gridHeight - gap) / 2);
    tabOverviewGrid.style.setProperty("--tab-overview-mobile-card-height", `${Math.ceil(Math.max(naturalCardHeight, twoRowCardHeight))}px`);
  };

  const syncTabOverviewScrollable = () => {
    if (!tabOverviewGrid) {
      return false;
    }
    const isScrollable = tabOverviewGrid.scrollHeight > tabOverviewGrid.clientHeight + 1;
    const changed = tabOverviewGrid.classList.contains("is-scrollable") !== isScrollable;
    tabOverviewGrid.classList.toggle("is-scrollable", isScrollable);
    return changed;
  };

  const tabOverviewCanvasSize = (canvas) => {
    const rect = canvas.parentElement?.getBoundingClientRect?.() || canvas.getBoundingClientRect();
    const terminalSize = tabOverviewTerminalSize();
    const fallbackRatio = terminalSize.width / terminalSize.height;
    const width = Math.max(1, Math.round(rect?.width || 480));
    const height = Math.max(1, Math.round(rect?.height || width / fallbackRatio));
    return { width, height };
  };

  const sessionCacheV2OverviewPreviewMatches = (pane, prepared) => (
    terminalOverviewPreviewController.matches(pane, prepared)
  );

  const loadPaneTabOverviewPreviewManifest = async (pane) => {
    const historyGeneration = String(pane?.historyGeneration || "").trim();
    if (!sessionUsesTerminalCacheV2(pane)) {
      return null;
    }
    // Hidden panes have not attached yet after a cold page load, so their
    // history generation is not known. The pane-level manifest key is already
    // scoped by account, selector, workspace, tab and pane; once replay
    // supplies a generation, require it strictly.
    const expected = sessionTerminalCacheV2Identity(pane, historyGeneration);
    if (!expected) {
      return null;
    }
    const snapshot = await withTerminalCacheTimeout(
      terminalCacheV2.loadManifest(expected),
      terminalCacheV2ManifestTimeoutMs,
      "Terminal cache overview manifest read timed out.",
    );
    if (
      !snapshot
      || (historyGeneration && snapshot.historyGeneration !== historyGeneration)
      || !terminalCacheV2.identityMatches(expected, snapshot, { requireHistory: Boolean(historyGeneration) })
    ) {
      return null;
    }
    return snapshot;
  };

  const terminalOverviewPreviewController = new TerminalOverviewPreviewController({
    cache: terminalCacheV2,
    canUse: sessionUsesTerminalCacheV2,
    identityFor: sessionTerminalCacheV2Identity,
    loadManifest: loadPaneTabOverviewPreviewManifest,
    onReady: () => scheduleTabOverviewRender(),
    onError: (pane, error) => {
      console.warn("[terminal-cache-v2] overview preview load failed", {
        name: pane?.name,
        pane: pane?.id,
        error: error?.message || String(error),
      });
    },
  });

  const preparePaneTabOverviewPreview = (pane) => terminalOverviewPreviewController.prepare(pane);

  const prepareTabOverviewCachePreviews = (tab) => {
    for (const pane of tab?.panes?.values?.() || []) {
      // Hidden tabs must keep an identity-checked cached image ready. Their
      // live canvas may be stale, detached, or never have received a visible
      // frame, while the active tab can continue to use its live canvas.
      if (pane.tabId !== activeTabId || !pane.renderReady || !pane.hasPresentedFrame) {
        preparePaneTabOverviewPreview(pane);
      }
    }
  };

  const scheduleWorkspaceTabOverviewCachePreviews = () => {
    if (tabOverviewCachePreparationScheduled || disposed) {
      return;
    }
    tabOverviewCachePreparationScheduled = true;
    const prepare = () => {
      tabOverviewCachePreparationScheduled = false;
      if (disposed) {
        return;
      }
      for (const tab of tabs.values()) {
        prepareTabOverviewCachePreviews(tab);
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(prepare, { timeout: 1500 });
      return;
    }
    window.setTimeout(prepare, 500);
  };

  const drawTabOverviewFallback = (ctx, x, y, width, height, colors) => {
    ctx.fillStyle = colors.muted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("无预览", x + width / 2, y + height / 2);
  };

  const drawPaneOverviewPreview = (ctx, pane, x, y, width, height, colors) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.fillStyle = colors.bg;
    ctx.fillRect(x, y, width, height);

    const liveCanvas = pane?.term?.canvas || pane?.term?.element?.querySelector?.("canvas");
    const liveFrame = pane?.renderReady && pane?.hasPresentedFrame ? liveCanvas : null;
    const heldFrame = sessionTerminalFrameHoldIsCurrent(pane) ? pane.terminalFrameHold : null;
    const cachedPreview = sessionCacheV2OverviewPreviewMatches(pane, pane?.cacheV2OverviewPreview)
      ? pane.cacheV2OverviewPreview.image
      : null;
    const source = pane?.tabId === activeTabId
      ? liveFrame || cachedPreview || heldFrame
      : cachedPreview || heldFrame || (!sessionUsesTerminalCacheV2(pane) ? liveFrame : null);
    if (source?.width > 0 && source?.height > 0) {
      try {
        const scale = Math.min(width / source.width, height / source.height);
        const drawWidth = source.width * scale;
        const drawHeight = source.height * scale;
        const drawX = x + (width - drawWidth) / 2;
        const drawY = y + (height - drawHeight) / 2;
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      } catch (error) {
        drawTabOverviewFallback(ctx, x, y, width, height, colors);
      }
    } else {
      drawTabOverviewFallback(ctx, x, y, width, height, colors);
    }
    ctx.restore();
  };

  const drawLayoutOverviewPreview = (ctx, tab, node, x, y, width, height, colors) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    const currentNode = node || { type: "leaf", paneId: tab.activePaneId };
    const children = Array.isArray(currentNode.children) ? currentNode.children.filter(Boolean) : [];
    if (currentNode.type !== "split" || children.length === 0) {
      const pane = tab.panes.get(currentNode.paneId || tab.activePaneId);
      drawPaneOverviewPreview(ctx, pane, x, y, width, height, colors);
      return;
    }

    const gap = children.length > 1 ? 3 : 0;
    const direction = currentNode.direction === "horizontal" ? "horizontal" : "vertical";
    const sizes = children.map((child) => {
      const size = Number(child?.size);
      return Number.isFinite(size) && size > 0 ? size : 1;
    });
    const totalSize = sizes.reduce((sum, size) => sum + size, 0) || children.length;
    const available = Math.max(0, (direction === "vertical" ? width : height) - gap * (children.length - 1));
    let cursor = direction === "vertical" ? x : y;

    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      const span = isLast
        ? Math.max(0, (direction === "vertical" ? x + width : y + height) - cursor)
        : Math.max(0, (available * sizes[index]) / totalSize);
      if (direction === "vertical") {
        drawLayoutOverviewPreview(ctx, tab, child, cursor, y, span, height, colors);
        cursor += span;
        if (!isLast) {
          ctx.fillStyle = colors.line;
          ctx.fillRect(cursor, y, gap, height);
          cursor += gap;
        }
      } else {
        drawLayoutOverviewPreview(ctx, tab, child, x, cursor, width, span, colors);
        cursor += span;
        if (!isLast) {
          ctx.fillStyle = colors.line;
          ctx.fillRect(x, cursor, width, gap);
          cursor += gap;
        }
      }
    });
  };

  const drawTabOverviewPreview = (canvas, tab, colors) => {
    const size = tabOverviewCanvasSize(canvas);
    const scale = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(size.width * scale);
    canvas.height = Math.round(size.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, size.width, size.height);
    drawLayoutOverviewPreview(ctx, tab, tab.layout, 0, 0, size.width, size.height, colors);
  };

  const stopTabOverviewDragTracking = () => {
    document.removeEventListener("pointermove", handleTabOverviewDragMove, { capture: true });
    document.removeEventListener("pointerup", handleTabOverviewDragEnd, { capture: true });
    document.removeEventListener("pointercancel", handleTabOverviewDragCancel, { capture: true });
    document.removeEventListener("touchmove", handleTabOverviewDragTouchMove, { capture: true });
  };

  const tabOverviewReorderAnimationTimers = new WeakMap();

  const stopTabOverviewDragAutoScroll = (state) => {
    if (state?.autoScrollFrame) {
      window.cancelAnimationFrame(state.autoScrollFrame);
      state.autoScrollFrame = 0;
    }
    if (state) {
      state.autoScrollStep = 0;
    }
  };

  const getTabOverviewReorderRects = () => {
    if (!tabOverviewGrid) {
      return new Map();
    }
    return new Map(
      Array.from(tabOverviewGrid.querySelectorAll(".tab-overview-card:not(.is-dragging)"))
        .map((card) => [card, card.getBoundingClientRect()]),
    );
  };

  const cancelTabOverviewReorderAnimationTimer = (card) => {
    const timer = tabOverviewReorderAnimationTimers.get(card);
    if (timer) {
      window.clearTimeout(timer);
      tabOverviewReorderAnimationTimers.delete(card);
    }
  };

  const clearTabOverviewReorderAnimation = (card) => {
    cancelTabOverviewReorderAnimationTimer(card);
    card.classList.remove("is-reordering");
    card.style.removeProperty("transition");
    card.style.removeProperty("transform");
  };

  const animateTabOverviewReorder = (beforeRects) => {
    if (!tabOverviewGrid || !beforeRects.size) {
      return;
    }
    for (const card of tabOverviewGrid.querySelectorAll(".tab-overview-card:not(.is-dragging)")) {
      const before = beforeRects.get(card);
      if (!before) {
        continue;
      }
      const after = card.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        continue;
      }
      cancelTabOverviewReorderAnimationTimer(card);
      card.classList.remove("is-reordering");
      card.style.transition = "none";
      card.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`;
      card.getBoundingClientRect();
      card.style.removeProperty("transition");
      card.classList.add("is-reordering");
      window.requestAnimationFrame(() => {
        card.style.removeProperty("transform");
      });
      const cleanupTimer = window.setTimeout(() => {
        if (tabOverviewReorderAnimationTimers.get(card) === cleanupTimer) {
          tabOverviewReorderAnimationTimers.delete(card);
          card.classList.remove("is-reordering");
        }
      }, 180);
      tabOverviewReorderAnimationTimers.set(card, cleanupTimer);
    }
  };

  const clearTabOverviewReorderAnimations = () => {
    if (!tabOverviewGrid) {
      return;
    }
    for (const card of tabOverviewGrid.querySelectorAll(".tab-overview-card.is-reordering")) {
      clearTabOverviewReorderAnimation(card);
    }
  };

  const resetTabOverviewDraggedCard = (state) => {
    const card = state?.card;
    const placeholder = state?.placeholder;
    if (state?.longPressTimer) {
      window.clearTimeout(state.longPressTimer);
      state.longPressTimer = 0;
    }
    stopTabOverviewDragAutoScroll(state);
    clearTabOverviewReorderAnimations();
    if (!card) {
      return;
    }
    try {
      if (state?.pointerId != null && card.hasPointerCapture?.(state.pointerId)) {
        card.releasePointerCapture(state.pointerId);
      }
    } catch (_) {
      // The pointer may already be released by the browser.
    }
    card.classList.remove("is-dragging");
    card.style.removeProperty("position");
    card.style.removeProperty("left");
    card.style.removeProperty("top");
    card.style.removeProperty("width");
    card.style.removeProperty("height");
    card.style.removeProperty("z-index");
    card.style.removeProperty("transform");
    if (placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
    } else if (tabOverviewGrid && !tabOverviewGrid.contains(card)) {
      tabOverviewGrid.appendChild(card);
    }
    tabOverviewGrid?.classList.remove("is-dragging");
    document.body.classList.remove("is-tab-overview-dragging");
  };

  const moveTabToOverviewIndex = async (tabId, targetIndex, restoreActiveTabId = activeTabId) => {
    const ordered = getOrderedTabs();
    const currentIndex = ordered.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) {
      return;
    }
    const safeTarget = Math.max(0, Math.min(targetIndex, ordered.length - 1));
    if (safeTarget === currentIndex) {
      return;
    }
    const moves = [];
    if (safeTarget === 0) {
      moves.push("first");
    } else if (safeTarget === ordered.length - 1) {
      moves.push("last");
    } else if (safeTarget < currentIndex) {
      for (let index = currentIndex; index > safeTarget; index -= 1) {
        moves.push("left");
      }
    } else {
      for (let index = currentIndex; index < safeTarget; index += 1) {
        moves.push("right");
      }
    }
    for (const position of moves) {
      await postWorkspaceAction("move_tab", { tab_id: tabId, position });
    }
    if (restoreActiveTabId && restoreActiveTabId !== tabId && tabs.has(restoreActiveTabId)) {
      await postWorkspaceAction("activate_tab", { tab_id: restoreActiveTabId });
    }
  };

  function finishTabOverviewDrag({ cancel = false } = {}) {
    const state = tabOverviewDragState;
    if (!state) {
      return;
    }
    stopTabOverviewDragTracking();
    const placeholder = state.placeholder;
    const orderedCards = Array.from(tabOverviewGrid?.children || [])
      .filter((child) => child.classList?.contains("tab-overview-card") || child.classList?.contains("tab-overview-card-placeholder"));
    const targetIndex = placeholder ? orderedCards.indexOf(placeholder) : state.originalIndex;
    const shouldMove = state.dragging && !cancel && targetIndex >= 0 && targetIndex !== state.originalIndex;
    resetTabOverviewDraggedCard(state);
    tabOverviewDragState = null;
    if (!state.dragging) {
      return;
    }
    tabOverviewSuppressClickUntil = performance.now() + 350;
    if (shouldMove) {
      moveTabToOverviewIndex(state.tabId, targetIndex, state.previousActiveTabId)
        .catch((error) => {
          showToast(error.message || "标签排序失败。");
          scheduleTabOverviewRender();
        });
    }
  }

  function handleTabOverviewDragEnd(event) {
    if (tabOverviewDragState && event?.pointerId !== tabOverviewDragState.pointerId) {
      return;
    }
    if (tabOverviewDragState?.dragging) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    }
    finishTabOverviewDrag();
  }

  function handleTabOverviewDragCancel(event) {
    if (tabOverviewDragState && event?.pointerId !== tabOverviewDragState.pointerId) {
      return;
    }
    finishTabOverviewDrag({ cancel: true });
  }

  function handleTabOverviewDragTouchMove(event) {
    if (!tabOverviewDragState?.dragging) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  const beginTabOverviewDrag = (state) => {
    if (!tabOverviewGrid || state.dragging) {
      return;
    }
    if (state.longPressTimer) {
      window.clearTimeout(state.longPressTimer);
      state.longPressTimer = 0;
    }
    const rect = state.card.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "tab-overview-card-placeholder";
    placeholder.style.height = `${Math.round(rect.height)}px`;
    tabOverviewGrid.insertBefore(placeholder, state.card);
    document.body.appendChild(state.card);
    state.card.classList.add("is-dragging");
    state.card.style.position = "fixed";
    state.card.style.left = `${Math.round(rect.left)}px`;
    state.card.style.top = `${Math.round(rect.top)}px`;
    state.card.style.width = `${Math.round(rect.width)}px`;
    state.card.style.height = `${Math.round(rect.height)}px`;
    state.card.style.zIndex = "110";
    state.card.style.transform = "translate3d(0, 0, 0)";
    state.dragging = true;
    state.placeholder = placeholder;
    tabOverviewGrid.classList.add("is-dragging");
    document.body.classList.add("is-tab-overview-dragging");
    if (state.pointerType !== "mouse") {
      document.addEventListener("touchmove", handleTabOverviewDragTouchMove, { capture: true, passive: false });
    }
  };

  const findTabOverviewPlaceholderTarget = (state) => {
    if (!tabOverviewGrid) {
      return null;
    }
    const cards = Array.from(tabOverviewGrid.querySelectorAll(".tab-overview-card:not(.is-dragging)"));
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (
        state.lastY < rect.top + rect.height / 2 ||
        (state.lastY <= rect.bottom && state.lastX < rect.left + rect.width / 2)
      ) {
        return card;
      }
    }
    return null;
  };

  const updateTabOverviewDragPlaceholder = (state) => {
    if (!tabOverviewGrid || !state.placeholder) {
      return;
    }
    const before = findTabOverviewPlaceholderTarget(state);
    if (before === state.placeholder.nextElementSibling || (!before && state.placeholder === tabOverviewGrid.lastElementChild)) {
      return;
    }
    const beforeRects = getTabOverviewReorderRects();
    if (before) {
      tabOverviewGrid.insertBefore(state.placeholder, before);
    } else {
      tabOverviewGrid.appendChild(state.placeholder);
    }
    animateTabOverviewReorder(beforeRects);
  };

  const updateTabOverviewDragAutoScroll = (state) => {
    if (!tabOverviewGrid || !state.dragging) {
      stopTabOverviewDragAutoScroll(state);
      return;
    }
    const rect = tabOverviewGrid.getBoundingClientRect();
    const topDistance = state.lastY - rect.top;
    const bottomDistance = rect.bottom - state.lastY;
    let step = 0;
    if (topDistance >= 0 && topDistance < tabOverviewDragAutoScrollEdgePx) {
      step = -Math.ceil((1 - topDistance / tabOverviewDragAutoScrollEdgePx) * tabOverviewDragAutoScrollMaxStepPx);
    } else if (bottomDistance >= 0 && bottomDistance < tabOverviewDragAutoScrollEdgePx) {
      step = Math.ceil((1 - bottomDistance / tabOverviewDragAutoScrollEdgePx) * tabOverviewDragAutoScrollMaxStepPx);
    }
    state.autoScrollStep = step;
    if (!step) {
      stopTabOverviewDragAutoScroll(state);
      return;
    }
    if (state.autoScrollFrame) {
      return;
    }
    const tick = () => {
      if (tabOverviewDragState !== state || !state.dragging || !tabOverviewGrid || !state.autoScrollStep) {
        stopTabOverviewDragAutoScroll(state);
        return;
      }
      const beforeScrollTop = tabOverviewGrid.scrollTop;
      tabOverviewGrid.scrollTop += state.autoScrollStep;
      if (tabOverviewGrid.scrollTop !== beforeScrollTop) {
        updateTabOverviewDragPlaceholder(state);
      }
      state.autoScrollFrame = window.requestAnimationFrame(tick);
    };
    state.autoScrollFrame = window.requestAnimationFrame(tick);
  };

  function handleTabOverviewDragMove(event) {
    const state = tabOverviewDragState;
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    const dx = state.lastX - state.startX;
    const dy = state.lastY - state.startY;
    if (!state.dragging) {
      if (Math.hypot(dx, dy) < tabOverviewDragMoveThresholdPx) {
        return;
      }
      if (state.pointerType !== "mouse" && !state.dragReady) {
        finishTabOverviewDrag({ cancel: true });
        return;
      }
      beginTabOverviewDrag(state);
    }
    event.preventDefault();
    event.stopPropagation();
    state.card.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`;
    updateTabOverviewDragPlaceholder(state);
    updateTabOverviewDragAutoScroll(state);
  }

  function handleTabOverviewCardPointerDown(event) {
    if (
      !(event instanceof PointerEvent) ||
      !event.isPrimary ||
      !isTabOverviewOpen() ||
      tabs.size <= 1 ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    const card = event.currentTarget;
    const target = event.target;
    if (!(card instanceof HTMLElement) || !(target instanceof Element) || target.closest("[data-tab-overview-close]")) {
      return;
    }
    const ordered = getOrderedTabs();
    const tabId = card.dataset.tabId || "";
    const originalIndex = ordered.findIndex((tab) => tab.id === tabId);
    if (originalIndex < 0) {
      return;
    }
    finishTabOverviewDrag({ cancel: true });
    tabOverviewDragState = {
      pointerId: event.pointerId,
      tabId,
      card,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerType: event.pointerType,
      originalIndex,
      previousActiveTabId: activeTabId,
      dragReady: event.pointerType === "mouse",
      dragging: false,
      placeholder: null,
      longPressTimer: 0,
      autoScrollFrame: 0,
      autoScrollStep: 0,
    };
    if (event.pointerType !== "mouse") {
      const state = tabOverviewDragState;
      state.longPressTimer = window.setTimeout(() => {
        if (tabOverviewDragState === state && !state.dragging) {
          state.dragReady = true;
          beginTabOverviewDrag(state);
        }
      }, tabOverviewDragHoldDelayMs);
    }
    card.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", handleTabOverviewDragMove, { capture: true, passive: false });
    document.addEventListener("pointerup", handleTabOverviewDragEnd, { capture: true, passive: false });
    document.addEventListener("pointercancel", handleTabOverviewDragCancel, { capture: true });
  }

  const bindTabOverviewCardDrag = (card) => {
    card.addEventListener("pointerdown", handleTabOverviewCardPointerDown);
  };

  const renderTabOverview = () => measurePerformanceTask("tab overview render", () => {
    if (!tabOverviewGrid) {
      return;
    }
    if (tabOverviewDragState?.dragging) {
      return;
    }
    if (tabOverviewDragState) {
      finishTabOverviewDrag({ cancel: true });
    }
    tabOverviewGrid.classList.remove("is-scrollable");
    syncTabOverviewPreviewRatio();
    tabOverviewGrid.textContent = "";
    const orderedTabs = getOrderedTabs();
    if (orderedTabs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tab-overview-empty";
      empty.textContent = "暂无终端";
      tabOverviewGrid.appendChild(empty);
      syncTabOverviewScrollable();
      return;
    }

    const colors = readTabOverviewColors();
    const fragment = document.createDocumentFragment();
    const previewItems = [];
    for (const tab of orderedTabs) {
      const label = String(tab.label || tab.id || "终端");
      const card = document.createElement("div");
      card.className = "tab-overview-card";
      card.dataset.tabId = tab.id;
      card.title = label;
      if (tab.id === activeTabId) {
        card.classList.add("active");
        card.setAttribute("aria-current", "true");
      }

      const main = document.createElement("button");
      main.type = "button";
      main.className = "tab-overview-card-main";
      main.dataset.tabId = tab.id;
      main.setAttribute("aria-label", `切换到 ${label}`);

      const preview = document.createElement("div");
      preview.className = "tab-overview-preview";
      const canvas = document.createElement("canvas");
      preview.appendChild(canvas);

      const meta = document.createElement("div");
      meta.className = "tab-overview-meta";
      const name = document.createElement("span");
      name.className = "tab-overview-name";
      name.textContent = label;
      meta.appendChild(name);
      if (tab.id === activeTabId) {
        const status = document.createElement("span");
        status.className = "tab-overview-status";
        status.textContent = "当前";
        meta.appendChild(status);
      }

      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-overview-card-close";
      close.dataset.tabOverviewClose = tab.id;
      close.setAttribute("aria-label", `关闭 ${label}`);
      close.textContent = "×";

      main.append(preview, meta);
      card.append(main, close);
      bindTabOverviewCardDrag(card);
      previewItems.push({ canvas, tab });
      fragment.appendChild(card);
    }
    tabOverviewGrid.appendChild(fragment);
    if (syncTabOverviewScrollable()) {
      syncTabOverviewPreviewRatio();
      syncTabOverviewScrollable();
    }
    for (const item of previewItems) {
      drawTabOverviewPreview(item.canvas, item.tab, colors);
      prepareTabOverviewCachePreviews(item.tab);
    }
  });

  const scheduleTabOverviewRender = () => {
    // Keep every tab's cached preview warm even while the overview is closed;
    // opening it must not make background tabs wait for a new preparation pass.
    scheduleWorkspaceTabOverviewCachePreviews();
    if (!isTabOverviewOpen() || tabOverviewRenderFrame) {
      return;
    }
    tabOverviewRenderFrame = window.requestAnimationFrame(() => {
      tabOverviewRenderFrame = 0;
      renderTabOverview();
    });
  };

  const closeTabOverview = () => {
    if (!tabOverview) {
      return;
    }
    finishTabOverviewDrag({ cancel: true });
    if (tabOverviewRenderFrame) {
      window.cancelAnimationFrame(tabOverviewRenderFrame);
      tabOverviewRenderFrame = 0;
    }
    tabOverview.hidden = true;
    tabOverviewToggle?.setAttribute("aria-expanded", "false");
    if (tabOverviewGrid) {
      tabOverviewGrid.textContent = "";
      tabOverviewGrid.classList.remove("is-scrollable");
    }
  };

  const openTabOverview = () => {
    if (!tabOverview) {
      return;
    }
    closeContextMenu();
    closeThemePicker();
    closeDevicePanel();
    closeInstanceSwitcher();
    tabOverview.hidden = false;
    tabOverviewToggle?.setAttribute("aria-expanded", "true");
    renderTabOverview();
    scheduleTabOverviewRender();
    window.requestAnimationFrame(() => {
      const activeCard = tabOverviewGrid?.querySelector(".tab-overview-card.active");
      const activeButton = activeCard?.querySelector(".tab-overview-card-main");
      const firstButton = tabOverviewGrid?.querySelector(".tab-overview-card-main");
      (activeButton || firstButton)?.focus?.({ preventScroll: true });
      activeCard?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
  };

  const selectTabFromOverview = (tabId) => {
    if (!tabs.has(tabId)) {
      return;
    }
    closeTabOverview();
    setActiveTab(tabId);
  };

  const closeTabFromOverview = (tabId) => {
    if (!tabs.has(tabId)) {
      return;
    }
    closeTab(tabId);
  };

  const setActiveTabByOffset = (offset) => {
    const orderedTabs = getOrderedTabs();
    if (orderedTabs.length === 0) {
      return;
    }
    const currentIndex = orderedTabs.findIndex((tab) => tab.id === activeTabId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + offset + orderedTabs.length) % orderedTabs.length;
    setActiveTab(orderedTabs[nextIndex].id);
  };

  const setActiveTabByIndex = (index) => {
    const orderedTabs = getOrderedTabs();
    const tab = orderedTabs[Math.max(0, Math.min(index, orderedTabs.length - 1))];
    if (tab) {
      setActiveTab(tab.id);
    }
  };

  const resetMobileOverviewEdgeSwipe = () => {
    mobileOverviewEdgeSwipe = null;
  };

  const hasBlockingOverviewGestureOverlayOpen = () => Boolean(
    isTabOverviewOpen() ||
    isThemePickerOpen() ||
    (settingsBackdrop && !settingsBackdrop.hidden) ||
    (deviceBackdrop && !deviceBackdrop.hidden) ||
    (instanceSwitcherPanel && !instanceSwitcherPanel.hidden) ||
    (mobileActionSheet && !mobileActionSheet.hidden) ||
    (mobileCloseConfirmSheet && !mobileCloseConfirmSheet.hidden) ||
    (serviceForwardEditor && !serviceForwardEditor.hidden) ||
    (mobileShortcutEditor && !mobileShortcutEditor.hidden) ||
    (desktopShortcutEditor && !desktopShortcutEditor.hidden) ||
    (attachmentBackdrop && !attachmentBackdrop.hidden) ||
    (attachmentBrowserBackdrop && !attachmentBrowserBackdrop.hidden) ||
    (dialogBackdrop && !dialogBackdrop.hidden) ||
    (contextMenu && !contextMenu.hidden) ||
    (selectionSheet && !selectionSheet.hidden)
  );

  const handleMobileOverviewEdgeSwipeStart = (event) => {
    if (
      !isMobileLayout() ||
      event.touches.length !== 1 ||
      hasBlockingOverviewGestureOverlayOpen()
    ) {
      resetMobileOverviewEdgeSwipe();
      return;
    }
    const touch = event.touches[0];
    const viewportWidth = Math.max(1, Math.round(window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1));
    let edge = "";
    if (touch.clientX <= mobileOverviewSwipeEdgeWidth) {
      edge = "left";
    } else if (viewportWidth - touch.clientX <= mobileOverviewSwipeEdgeWidth) {
      edge = "right";
    }
    if (!edge) {
      resetMobileOverviewEdgeSwipe();
      return;
    }
    refreshMobileOverviewHistoryGuardForUserGesture();
    mobileOverviewEdgeSwipe = {
      edge,
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
      opened: false,
    };
  };

  const handleMobileOverviewEdgeSwipeMove = (event) => {
    if (!mobileOverviewEdgeSwipe || event.touches.length !== 1) {
      return;
    }
    if (mobileOverviewEdgeSwipe.opened) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!isMobileLayout() || hasBlockingOverviewGestureOverlayOpen()) {
      resetMobileOverviewEdgeSwipe();
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - mobileOverviewEdgeSwipe.startX;
    const deltaY = touch.clientY - mobileOverviewEdgeSwipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const directedDeltaX = mobileOverviewEdgeSwipe.edge === "left" ? deltaX : -deltaX;

    if (directedDeltaX < -mobileOverviewSwipeAxisThreshold) {
      resetMobileOverviewEdgeSwipe();
      return;
    }

    if (!mobileOverviewEdgeSwipe.horizontal) {
      if (absY > mobileOverviewSwipeAxisThreshold && absY > absX) {
        resetMobileOverviewEdgeSwipe();
        return;
      }
      if (directedDeltaX >= mobileOverviewSwipeNativeBackBlockDistance && absX > absY) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (directedDeltaX > mobileOverviewSwipeAxisThreshold && absX > absY * 1.2) {
        mobileOverviewEdgeSwipe.horizontal = true;
      }
    }

    if (!mobileOverviewEdgeSwipe?.horizontal) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (
      !mobileOverviewEdgeSwipe.opened &&
      directedDeltaX >= mobileOverviewSwipeOpenDistance &&
      absY <= mobileOverviewSwipeMaxVerticalTravel
    ) {
      mobileOverviewEdgeSwipe.opened = true;
      openTabOverview();
    }
  };

  const updateEmptyState = () => {
    if (!emptyState) {
      return;
    }
    emptyState.hidden = tabs.size > 0;
    if (tabs.size === 0) {
      updateMobileActiveTabTitle();
    }
  };

  const syncCursorBlinkState = () => {
    for (const tab of tabs.values()) {
      const tabIsActive = tab.id === activeTabId;
      for (const pane of tab.panes.values()) {
        const shouldBlink = tabIsActive && pane.id === tab.activePaneId;
        if (pane.term && pane.term.options.cursorBlink !== shouldBlink) {
          pane.term.options.cursorBlink = shouldBlink;
        }
      }
    }
  };

  const setActivePane = (tab, paneId, {
    focus = true,
    resize = true,
    userInteraction = false,
    syncConnection = true,
  } = {}) => {
    if (!tab || !tab.panes.has(paneId)) {
      return;
    }
    const wasActive = tab.activePaneId === paneId;
    tab.activePaneId = paneId;
    for (const pane of tab.panes.values()) {
      pane.shellEl.classList.toggle("active", pane.id === paneId);
    }
    const activePane = tab.panes.get(paneId);
    if (!wasActive) {
      resetSessionUserInput(activePane);
    }
    refreshTabAutoLabel(tab);
    syncCursorBlinkState();
    updateMobileSelectionHandles(activePane);
    if (resize && tab.id === activeTabId) {
      schedulePaneResize(activePane, {
        forceFullRender: true,
        hideUntilRender: !panePresentationIsCurrent(activePane),
      }, { immediate: true });
    } else if (resize) {
      cancelPendingTerminalRender(activePane?.term);
    }
    if (!userInteraction && !wasActive) {
      if (activePane?.pendingConnect) {
        connectPendingSession(activePane);
      } else {
        checkSessionConnectionHealth(activePane, { connect: true, force: true });
      }
    }
    if (syncConnection && tab.id === activeTabId && (!wasActive || userInteraction)) {
      syncTerminalConnectionDemands({
        reason: userInteraction ? "pane_pointer" : "active_pane_changed",
        interactionSession: userInteraction ? activePane : null,
      });
    }
    if (focus) {
      window.requestAnimationFrame(() => {
        if (
          activeTabId !== tab.id
          || tab.activePaneId !== activePane?.id
          || activePane?.closed
        ) {
          return;
        }
        connectPendingSession(activePane);
        activePane?.term?.focus();
      });
    }
    if (!applyingWorkspaceState && !wasActive) {
      postWorkspaceAction("activate_pane", { tab_id: tab.id, pane_id: paneId }).catch((error) => showToast(error.message));
    }
  };

  const preserveTabTerminalFrames = (tab) => {
    for (const pane of tab?.panes?.values?.() || []) {
      if (pane.hasPresentedFrame && !pane.terminalFrameHeld) {
        holdSessionTerminalFrame(pane);
      }
    }
  };

  const focusPaneAtPoint = (clientX, clientY) => {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return false;
    }
    const target = document.elementFromPoint(clientX, clientY);
    const shellEl = target instanceof Element ? target.closest(".pane-shell") : null;
    if (!(shellEl instanceof HTMLElement)) {
      return false;
    }
    const paneId = shellEl.dataset.paneId;
    const tabId = shellEl.closest(".terminal-pane")?.dataset.tabId || activeTabId;
    const tab = tabs.get(tabId);
    if (!paneId || !tab?.panes.has(paneId)) {
      return false;
    }
    if (tab.id !== activeTabId) {
      setActiveTab(tab.id, { focus: false });
    }
    setActivePane(tab, paneId, { focus: true });
    return true;
  };

  // IME composition can make the contenteditable host scroll and clip the canvas.
  const resetTerminalHostViewport = (session, { clean = false } = {}) => {
    const host = session?.terminalHost;
    if (!host) {
      return;
    }
    if (host.scrollTop !== 0) {
      host.scrollTop = 0;
    }
    if (host.scrollLeft !== 0) {
      host.scrollLeft = 0;
    }
    if (!clean) {
      return;
    }
    const keep = new Set([session.term?.canvas, session.term?.textarea, session.compositionPreview].filter(Boolean));
    for (const node of Array.from(host.childNodes)) {
      if (!keep.has(node) && (node.nodeType === 1 || node.nodeType === 3)) {
        node.remove();
      }
    }
  };

  const scheduleTerminalHostViewportReset = (session, options = {}) => {
    resetTerminalHostViewport(session, options);
    window.requestAnimationFrame(() => resetTerminalHostViewport(session, options));
  };

  const isMobileKeyboardResizeSuppressed = () => (
    isTouchShortcutLayout() &&
    (mobileKeyboardViewportActive || performance.now() < mobileKeyboardResizeSuppressedUntil)
  );

  const terminalViewportPanY = (session) => {
    if (!isMobileKeyboardResizeSuppressed()) {
      return 0;
    }
    const term = session?.term;
    const host = session?.terminalHost;
    const metrics = term?.renderer?.getMetrics?.();
    const cursor = term?.wasmTerm?.getCursor?.();
    if (!term || !(host instanceof HTMLElement) || !metrics?.height || !cursor) {
      return 0;
    }
    const cellHeight = Math.max(1, Number(metrics.height) || 0);
    const logicalHeight = Math.ceil((Number(term.rows) || 0) * cellHeight);
    const visibleHeight = Math.max(0, host.clientHeight || 0);
    if (logicalHeight <= 0 || visibleHeight <= 0 || logicalHeight <= visibleHeight) {
      return 0;
    }
    const cursorRow = Math.max(0, Math.min(Math.max(0, (Number(term.rows) || 1) - 1), Number(cursor.y) || 0));
    const cursorBottom = Math.ceil((cursorRow + 1) * cellHeight);
    const keyboardPanLimit = Math.max(0, mobileViewportReferenceHeight - mobileViewportHeight);
    const overflowPastViewport = Math.max(0, cursorBottom + cellHeight - visibleHeight);
    return Math.min(logicalHeight - visibleHeight, keyboardPanLimit, overflowPastViewport);
  };

  const syncTerminalViewportPan = (session) => {
    const panY = terminalViewportPanY(session);
    const transform = panY > 0 ? `translate3d(0, -${panY}px, 0)` : "";
    const term = session?.term;
    const canvas = term?.canvas || term?.renderer?.getCanvas?.();
    const textarea = term?.textarea;
    const preview = session?.compositionPreview;
    for (const node of [canvas, textarea, preview]) {
      if (node instanceof HTMLElement) {
        node.style.transform = transform;
        node.style.willChange = transform ? "transform" : "";
      }
    }
  };

  // Keep native IME viewport jitter from changing terminal geometry for the whole keyboard focus session.
  const activeTerminalInputViewportLock = () => {
    const session = terminalInputViewportLockSession;
    const textarea = session?.term?.textarea;
    if (!session?.inputViewportLock || document.activeElement !== textarea) {
      return null;
    }
    return { session, ...session.inputViewportLock };
  };

  const releaseTerminalInputViewportLock = (session, { resync = true } = {}) => {
    if (!session) {
      return;
    }
    session.inputViewportLock = null;
    if (terminalInputViewportLockSession === session) {
      terminalInputViewportLockSession = null;
    }
    if (!resync || !isTouchShortcutLayout()) {
      return;
    }
    window.requestAnimationFrame(() => {
      if (
        session.closed
        || document.activeElement === session.term?.textarea
      ) {
        return;
      }
      syncMobileVisualViewport({ detectOrientation: false, ignoreTerminalInputLock: true });
      scheduleMobileViewportResize();
    });
  };

  const captureTerminalInputViewportLock = (session) => {
    if (!session || session.inputViewportLock || !isTouchShortcutLayout()) {
      return;
    }
    syncMobileVisualViewport({ detectOrientation: false, ignoreTerminalInputLock: true });
    session.inputViewportLock = {
      viewportHeight: mobileViewportHeight,
      referenceHeight: mobileViewportReferenceHeight,
      keyboardInsetBottom: mobileKeyboardInsetBottom,
      clientBottomSafeOffset: mobileClientBottomSafeOffset,
      keyboardActive: mobileKeyboardViewportActive,
    };
    terminalInputViewportLockSession = session;
  };

  const isKeyboardLikeViewportHeightChange = (previousHeight, nextHeight, { orientationChanged = false } = {}) => {
    if (!isTouchShortcutLayout() || orientationChanged) {
      return false;
    }
    const fromHeight = Math.max(0, Math.round(Number(previousHeight) || 0));
    const toHeight = Math.max(0, Math.round(Number(nextHeight) || 0));
    if (fromHeight <= 0 || toHeight <= 0) {
      return false;
    }
    return Math.abs(toHeight - fromHeight) > mobileKeyboardInsetThresholdPx;
  };

  const syncActiveTerminalViewportForKeyboard = () => {
    const tab = tabs.get(activeTabId);
    const session = tab?.panes.get(tab.activePaneId) || null;
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
    syncTerminalViewportPan(session);
    updateMobileSelectionHandles(session);
    updateSelectionSheet();
    if (mobileActionSheet && !mobileActionSheet.hidden) {
      renderMobileActionSheet();
    }
    scheduleTabOverviewRender();
  };

  const clearMobileKeyboardResizeReleaseTimer = () => {
    if (mobileKeyboardResizeReleaseTimer) {
      window.clearTimeout(mobileKeyboardResizeReleaseTimer);
      mobileKeyboardResizeReleaseTimer = 0;
    }
  };

  const releaseMobileKeyboardResizeSuppression = () => {
    mobileKeyboardResizeReleaseTimer = 0;
    const remaining = mobileKeyboardResizeSuppressedUntil - performance.now();
    if (remaining > 0) {
      mobileKeyboardResizeReleaseTimer = window.setTimeout(releaseMobileKeyboardResizeSuppression, Math.ceil(remaining));
      return;
    }
    if (mobileKeyboardViewportActive) {
      syncActiveTerminalViewportForKeyboard();
      return;
    }
    const tab = tabs.get(activeTabId);
    syncTerminalViewportPan(tab?.panes.get(tab.activePaneId) || null);
    resizeActiveTabForCurrentDevice({ forceFullRender: true, hideUntilRender: true });
  };

  const armMobileKeyboardResizeSuppression = () => {
    mobileKeyboardResizeSuppressedUntil = Math.max(
      mobileKeyboardResizeSuppressedUntil,
      performance.now() + mobileKeyboardResizeSettleMs,
    );
    clearMobileKeyboardResizeReleaseTimer();
    mobileKeyboardResizeReleaseTimer = window.setTimeout(releaseMobileKeyboardResizeSuppression, mobileKeyboardResizeSettleMs);
  };

  const stripTerminalInputSentinel = (value) => String(value || "").split(terminalInputSentinel).join("");

  const moveTerminalTextareaCaretToEnd = (textarea) => {
    try {
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    } catch (error) {
    }
  };

  const prepareTerminalTextareaForInput = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea || session.composingIME || session.nativeDeleteInputPending) {
      return;
    }
    if (textarea.value !== terminalInputDeleteBuffer) {
      textarea.value = terminalInputDeleteBuffer;
    }
    moveTerminalTextareaCaretToEnd(textarea);
  };

  const clearTerminalTextareaSentinel = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea) {
      return "";
    }
    const value = stripTerminalInputSentinel(textarea.value);
    if (textarea.value !== value) {
      textarea.value = value;
      moveTerminalTextareaCaretToEnd(textarea);
    }
    return value;
  };

  const terminalTextareaCompositionText = (session) => {
    if (!session) {
      return "";
    }
    const textarea = session.term?.textarea;
    const textareaText = textarea ? stripTerminalInputSentinel(textarea.value) : "";
    if (session.composingIME && typeof session.compositionText === "string") {
      return session.compositionText || textareaText;
    }
    if (!textarea) {
      return "";
    }
    return textareaText;
  };

  const setTerminalTextareaCompositionText = (session, text) => {
    if (!session) {
      return "";
    }
    const normalized = stripTerminalInputSentinel(text);
    const previous = typeof session.compositionText === "string" ? session.compositionText : "";
    if (normalized && normalized !== previous) {
      session.compositionPreviousText = previous;
      const history = Array.isArray(session.compositionTextHistory) ? session.compositionTextHistory.slice() : [];
      if (!history.includes(normalized)) {
        history.push(normalized);
      }
      session.compositionTextHistory = history.slice(-8);
    }
    session.compositionText = normalized;
    return normalized;
  };

  const normalizeTerminalCompositionTextCandidates = (...values) => {
    const seen = new Set();
    const candidates = [];
    const add = (value) => {
      if (Array.isArray(value)) {
        for (const item of value) {
          add(item);
        }
        return;
      }
      const normalized = stripTerminalInputSentinel(value);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      candidates.push(normalized);
    };
    for (const value of values) {
      add(value);
    }
    return candidates.sort((left, right) => right.length - left.length);
  };

  const terminalCompositionPreeditCandidates = (session, ...extraValues) => normalizeTerminalCompositionTextCandidates(
    session?.compositionTextHistory,
    session?.compositionPreviousText,
    session?.compositionText,
    extraValues,
  );

  const setTerminalCompositionPreviewVisible = (session, visible) => {
    const preview = session?.compositionPreview;
    if (!preview) {
      return;
    }
    preview.hidden = !visible;
    if (!visible) {
      preview.textContent = "";
    }
  };

  const syncTerminalCompositionPreview = (session, {
    x = 0,
    y = 0,
    width = 1,
    height = 16,
    maxWidth = width,
  } = {}) => {
    const preview = session?.compositionPreview;
    if (!preview) {
      return;
    }
    if (session.terminalHost && preview.parentElement !== session.terminalHost) {
      session.terminalHost.appendChild(preview);
    }
    const text = session.composingIME ? terminalTextareaCompositionText(session) : "";
    if (!text) {
      setTerminalCompositionPreviewVisible(session, false);
      return;
    }
    preview.textContent = text;
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
    preview.style.minWidth = `${Math.max(width, 2)}px`;
    preview.style.maxWidth = `${Math.max(maxWidth, width, 2)}px`;
    preview.style.height = `${height}px`;
    preview.style.font = `${terminalFontSize}px ${terminalOptionsBase.fontFamily}`;
    preview.style.lineHeight = `${height}px`;
    preview.style.boxSizing = "border-box";
    preview.style.color = activeTheme.foreground;
    preview.style.background = activeTheme.background;
    setTerminalCompositionPreviewVisible(session, true);
  };

  const isBackwardDeleteInputType = (type) => (
    type === "deleteContentBackward"
    || type === "deleteWordBackward"
    || type === "deleteSoftLineBackward"
    || type === "deleteHardLineBackward"
  );

  const isForwardDeleteInputType = (type) => type === "deleteContentForward" || type === "deleteWordForward";

  const positionTerminalInput = (session) => {
    const term = session?.term;
    const textarea = term?.textarea;
    const renderer = term?.renderer;
    const cursor = term?.wasmTerm?.getCursor?.();
    const metrics = renderer?.getMetrics?.();
    if (!textarea || !cursor || !metrics) {
      return;
    }
    const width = Math.max(1, Number(metrics.width) || 1);
    const height = Math.max(1, Number(metrics.height) || Number(terminalFontSize) || 16);
    const cursorX = Math.max(0, Math.min(Math.max(0, (term.cols || 1) - 1), Number(cursor.x) || 0));
    const cursorY = Math.max(0, Math.min(Math.max(0, (term.rows || 1) - 1), Number(cursor.y) || 0));
    const previewLeft = cursorX * width;
    const previewTop = cursorY * height;
    const hostWidth = Math.max(width, Number(session.terminalHost?.clientWidth) || (Number(term.cols) || 1) * width);
    const hostHeight = Math.max(height, Number(session.terminalHost?.clientHeight) || (Number(term.rows) || 1) * height);
    const preserveAnchor = document.activeElement === textarea;
    const previousAnchor = preserveAnchor ? session.terminalInputAnchor : null;
    const anchorTop = Math.max(0, Math.min(hostHeight - height, Number(previousAnchor?.top ?? previewTop) || 0));
    const anchorIndent = Math.max(0, Math.min(hostWidth - width, Number(previousAnchor?.indent ?? previewLeft) || 0));
    session.terminalInputAnchor = { top: anchorTop, indent: anchorIndent };
    textarea.setAttribute("rows", "1");
    textarea.setAttribute("wrap", "off");
    textarea.style.position = "absolute";
    textarea.style.left = "0px";
    textarea.style.top = `${anchorTop}px`;
    textarea.style.width = `${Math.max(hostWidth, 2)}px`;
    textarea.style.minWidth = `${Math.max(hostWidth, 2)}px`;
    textarea.style.maxWidth = `${Math.max(hostWidth, 2)}px`;
    textarea.style.height = `${height}px`;
    textarea.style.minHeight = `${height}px`;
    textarea.style.maxHeight = `${height}px`;
    textarea.style.font = `${terminalFontSize}px ${terminalOptionsBase.fontFamily}`;
    textarea.style.lineHeight = `${height}px`;
    textarea.style.padding = "0";
    textarea.style.border = "0";
    textarea.style.outline = "0";
    textarea.style.boxShadow = "none";
    textarea.style.appearance = "none";
    textarea.style.webkitAppearance = "none";
    textarea.style.margin = "0";
    textarea.style.boxSizing = "border-box";
    // Windows WebView IME may ignore a focused textarea when it is fully transparent.
    textarea.style.opacity = "0.01";
    textarea.style.clipPath = "none";
    textarea.style.overflow = "hidden";
    textarea.style.overflowX = "hidden";
    textarea.style.overflowY = "hidden";
    textarea.style.whiteSpace = "pre";
    textarea.style.overflowWrap = "normal";
    textarea.style.wordBreak = "normal";
    textarea.style.textIndent = `${anchorIndent}px`;
    textarea.style.resize = "none";
    textarea.style.color = "transparent";
    textarea.style.background = "transparent";
    textarea.style.caretColor = "transparent";
    textarea.style.pointerEvents = "none";
    // Keep the native editor visible to Android WebView even while a cached frame is on top of the canvas.
    textarea.style.zIndex = "3";
    if (textarea.scrollTop !== 0) {
      textarea.scrollTop = 0;
    }
    prepareTerminalTextareaForInput(session);
    syncTerminalCompositionPreview(session, {
      x: previewLeft,
      y: previewTop,
      width,
      height,
      maxWidth: Math.max(width, hostWidth - previewLeft),
    });
  };

  const requestAndroidSoftKeyboard = (textarea) => {
    if (!isAndroidPlatform() || document.activeElement !== textarea) {
      return false;
    }
    const keyboard = navigator.virtualKeyboard;
    if (!keyboard || typeof keyboard.show !== "function") {
      return false;
    }
    try {
      const result = keyboard.show();
      result?.catch?.(() => {});
      return true;
    } catch (error) {
      return false;
    }
  };

  const focusTerminalInput = (session, {
    requestMobileKeyboard = false,
    forceMobileFocusTransition = false,
    focusSource = "user",
  } = {}) => {
    const textarea = session?.term?.textarea;
    if (!textarea) {
      return false;
    }
    // Initialization and connection callbacks must not steal or blur a mobile user gesture.
    if (requiresTouchKeyboardDoubleTap() && focusSource === "system") {
      if (document.activeElement !== textarea) {
        return false;
      }
      positionTerminalInput(session);
      resetTerminalHostViewport(session, { clean: true });
      updateMobileActiveTabTitle();
      return true;
    }
    if (requiresTouchKeyboardDoubleTap() && performance.now() > Number(session?.allowMobileKeyboardFocusUntil || 0)) {
      blurTerminalInput(session);
      return false;
    }
    const activateAndroidKeyboard = requestMobileKeyboard && isAndroidPlatform();
    if (
      activateAndroidKeyboard
      && forceMobileFocusTransition
      && document.activeElement === textarea
      && !session.composingIME
    ) {
      textarea.blur();
    }
    if (document.activeElement !== textarea) {
      session.terminalInputAnchor = null;
    }
    positionTerminalInput(session);
    const previousPointerEvents = textarea.style.pointerEvents;
    if (activateAndroidKeyboard) {
      textarea.style.pointerEvents = "auto";
    }
    try {
      try {
        textarea.focus({ preventScroll: true });
      } catch (error) {
        textarea.focus();
      }
      prepareTerminalTextareaForInput(session);
      if (requestMobileKeyboard) {
        requestAndroidSoftKeyboard(textarea);
      }
    } finally {
      if (activateAndroidKeyboard) {
        textarea.style.pointerEvents = previousPointerEvents || "none";
      }
    }
    resetTerminalHostViewport(session, { clean: true });
    updateMobileActiveTabTitle();
    return document.activeElement === textarea;
  };

  const blurTerminalInput = (session) => {
    const textarea = session?.term?.textarea;
    const host = session?.terminalHost;
    const shell = session?.shellEl;
    if (textarea) {
      textarea.blur();
    }
    if (host) {
      host.blur();
    }
    if (shell) {
      shell.blur();
    }
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && (host?.contains(activeElement) || shell?.contains(activeElement))) {
      activeElement.blur();
    }
    updateMobileActiveTabTitle();
    scheduleMobileKeyboardDismissRecovery();
  };

  const blurMobileKeyboard = () => {
    const session = activeSession();
    blurTerminalInput(session);
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      activeElement.blur();
    }
  };

  const focusMobileKeyboardFromShortcut = (session = activeSession()) => {
    if (!isTouchShortcutLayout()) {
      return;
    }
    const targetSession = session || activeSession();
    const textarea = targetSession?.term?.textarea;
    if (!textarea) {
      return;
    }
    targetSession.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;
    focusTerminalInput(targetSession, { requestMobileKeyboard: true });
  };

  const shouldPreserveMobileKeyboardForShortcut = (shortcut) => String(shortcut?.action || "") !== "open_mobile_menu";

  const isMobileTerminalKeyboardActive = (session = activeSession()) => {
    if (!isTouchShortcutLayout()) {
      return false;
    }
    const textarea = session?.term?.textarea;
    return Boolean(textarea && (document.activeElement === textarea || mobileKeyboardViewportActive));
  };

  const focusTerminalForNativePasteShortcut = (session = activeSession()) => {
    if (!session?.term || session.closed) {
      return;
    }
    if (requiresTouchKeyboardDoubleTap()) {
      session.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;
    }
    focusTerminalInput(session, { requestMobileKeyboard: true });
  };

  const setTerminalInputComposing = (session, composing) => {
    const wasComposing = Boolean(session.composingIME);
    if (composing && !session.inputViewportLock) {
      captureTerminalInputViewportLock(session);
    }
    session.composingIME = composing;
    if (composing) {
      if (!wasComposing) {
        session.compositionPreviousText = "";
        session.compositionTextHistory = [];
      }
      if (typeof session.compositionText !== "string") {
        session.compositionText = "";
      }
    } else {
      session.compositionText = "";
    }
    if (!composing) {
      setTerminalCompositionPreviewVisible(session, false);
    }
    if (session.term?.inputHandler) {
      session.term.inputHandler.isComposing = composing;
    }
  };

  const clearTerminalPostCompositionInput = (session) => {
    if (!session) {
      return;
    }
    session.pendingCompositionInput = null;
  };

  const isTerminalPostCompositionInputAlreadySent = (session, committed) => {
    const pending = session?.pendingCompositionInput;
    const committedText = stripTerminalInputSentinel(committed);
    if (!pending?.sent || !committedText) {
      return false;
    }
    if (performance.now() > Number(pending.expiresAt || 0)) {
      clearTerminalPostCompositionInput(session);
      return false;
    }
    return pending.committed === committedText;
  };

  const isTerminalASCIICompositionCommit = (value) => {
    const points = Array.from(stripTerminalInputSentinel(value));
    return points.length > 0 && points.every((point) => {
      const codePoint = point.codePointAt(0);
      return Number.isFinite(codePoint) && codePoint >= 0x21 && codePoint <= 0x7e;
    });
  };

  const armTerminalPostCompositionInput = (session, { preedit = "", preedits = [], committed = "", sent = false, suppressSeparator = false } = {}) => {
    if (!session) {
      return null;
    }
    const preeditCandidates = normalizeTerminalCompositionTextCandidates(preedits, preedit);
    const pending = {
      preedit: preeditCandidates[0] || "",
      preedits: preeditCandidates,
      committed: stripTerminalInputSentinel(committed),
      sent: Boolean(sent),
      suppressSeparator: Boolean(suppressSeparator),
      expiresAt: performance.now() + 350,
    };
    session.pendingCompositionInput = pending;
    return pending;
  };

  const resolveTerminalPostCompositionInput = (session, value) => {
    const pending = session?.pendingCompositionInput;
    if (!pending) {
      return null;
    }
    if (performance.now() > Number(pending.expiresAt || 0)) {
      clearTerminalPostCompositionInput(session);
      return null;
    }
    const rawValue = stripTerminalInputSentinel(value);
    const preedits = normalizeTerminalCompositionTextCandidates(pending.preedits, pending.preedit);
    const committed = pending.committed || "";
    let data = rawValue;
    let handled = false;
    if (!rawValue) {
      data = "";
      handled = true;
    } else if (pending.sent) {
      if (
        (committed && rawValue === committed)
        || preedits.includes(rawValue)
        || (committed && preedits.some((preedit) => rawValue === `${preedit}${committed}`))
        || (pending.suppressSeparator && rawValue === " ")
      ) {
        data = "";
        handled = true;
      }
    } else if (committed && rawValue === committed) {
      data = committed;
      handled = true;
    } else if (committed && preedits.some((preedit) => rawValue === `${preedit}${committed}`)) {
      data = committed;
      handled = true;
    } else {
      const preeditPrefix = preedits.find((preedit) => rawValue.startsWith(preedit) && rawValue.length > preedit.length);
      if (preedits.includes(rawValue)) {
        data = rawValue;
        handled = true;
      } else if (preeditPrefix && preedits.includes(rawValue.slice(preeditPrefix.length))) {
        data = rawValue.slice(preeditPrefix.length);
        handled = true;
      } else if (preeditPrefix && preedits.length === 1) {
        data = rawValue.slice(preeditPrefix.length);
        handled = true;
      } else if (!committed) {
        data = rawValue;
        handled = true;
      }
    }
    if (handled) {
      if (!data) {
        return "";
      }
      clearTerminalPostCompositionInput(session);
      return data;
    }
    if (pending.sent) {
      clearTerminalPostCompositionInput(session);
    }
    return null;
  };

  const rememberTerminalPostCompositionSentInput = (session, pending, committed) => {
    const committedText = stripTerminalInputSentinel(committed);
    if (!session || !committedText) {
      return;
    }
    armTerminalPostCompositionInput(session, {
      preedits: pending?.preedits || pending?.preedit || "",
      committed: committedText,
      sent: true,
      suppressSeparator: Boolean(pending?.suppressSeparator),
    });
  };

  const sendTerminalTextInput = (session, data, { dedupe = false, applySticky = false } = {}) => {
    const rawData = String(data || "");
    if (!session || !rawData) {
      return;
    }
    const now = performance.now();
    const last = session.lastTextInput;
    if (dedupe && (last?.data === rawData || last?.rawData === rawData) && now - last.time < 80) {
      return;
    }
    const inputData = applySticky ? consumeMobileStickyTextInput(rawData) : rawData;
    if (!inputData) {
      return;
    }
    if (dedupe) {
      session.lastTextInput = { data: inputData, rawData, time: now };
    }
    sendOrQueueInput(session, inputData);
  };

  const resetTerminalTextareaValue = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea || session.composingIME || session.nativeDeleteInputPending) {
      return;
    }
    textarea.value = terminalInputDeleteBuffer;
    moveTerminalTextareaCaretToEnd(textarea);
    positionTerminalInput(session);
  };

  const endTerminalNativeDeleteInput = (session, { reset = true } = {}) => {
    if (!session) {
      return;
    }
    if (session.nativeDeleteResetTimer) {
      window.clearTimeout(session.nativeDeleteResetTimer);
      session.nativeDeleteResetTimer = 0;
    }
    session.nativeDeleteInputPending = false;
    if (reset) {
      resetTerminalTextareaValue(session);
    }
  };

  const armTerminalNativeDeleteInput = (session) => {
    if (!session) {
      return;
    }
    session.nativeDeleteInputPending = true;
    if (session.nativeDeleteResetTimer) {
      window.clearTimeout(session.nativeDeleteResetTimer);
    }
    session.nativeDeleteResetTimer = window.setTimeout(() => {
      endTerminalNativeDeleteInput(session);
    }, terminalNativeDeleteIdleResetMs);
  };

  const handleTerminalBeforeInput = (session, event) => {
    reassertTerminalSize(session, { force: true });
    const type = String(event.inputType || "");
    const textarea = session?.term?.textarea;
    if (
      isBackwardDeleteInputType(type)
      && (!session?.composingIME || session?.pendingCompositionInput?.sent)
    ) {
      clearTerminalPostCompositionInput(session);
      if (session?.composingIME) {
        setTerminalInputComposing(session, false);
      }
      armTerminalNativeDeleteInput(session);
      sendTerminalTextInput(session, "\x7f");
      event.stopImmediatePropagation();
      return;
    }
    if (session?.nativeDeleteInputPending) {
      endTerminalNativeDeleteInput(session);
    }
    if (
      type === "insertText"
      && event.data === " "
      && session?.pendingCompositionInput?.sent
      && session.pendingCompositionInput.suppressSeparator
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setTerminalInputComposing(session, false);
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTerminalTextareaCaretToEnd(textarea);
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      return;
    }
    if (type === "insertCompositionText" || type === "deleteCompositionText" || event.isComposing) {
      setTerminalInputComposing(session, true);
      if (typeof event.data === "string") {
        setTerminalTextareaCompositionText(session, event.data);
      }
      scrollTerminalToBottomForUserInput(session);
      clearTerminalTextareaSentinel(session);
      positionTerminalInput(session);
      scheduleTerminalHostViewportReset(session, { clean: true });
      event.stopImmediatePropagation();
      return;
    }
    positionTerminalInput(session);
    let data = "";
    if (isBackwardDeleteInputType(type)) {
      data = "\x7f";
    } else if (isForwardDeleteInputType(type)) {
      data = "\x1b[3~";
    } else if (type === "insertLineBreak" || type === "insertParagraph") {
      data = "\r";
    } else if (type === "insertText" || type === "insertReplacementText") {
      data = event.data || "";
    } else if (type === "insertFromPaste") {
      const text = event.dataTransfer?.getData("text/plain") || event.data || "";
      const recentlyHandledPaste = text
        && session?.lastPasteText === text
        && performance.now() - Number(session?.lastPasteAt || 0) < 150;
      event.preventDefault();
      event.stopImmediatePropagation();
      setTerminalInputComposing(session, false);
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTerminalTextareaCaretToEnd(textarea);
      }
      if (text && !recentlyHandledPaste) {
        session.lastPasteText = text;
        session.lastPasteAt = performance.now();
        pasteIntoSession(session, text).catch((error) => showToast(error.message));
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      return;
    } else if (event.data) {
      data = event.data;
    }
    if (data && session?.composingIME && (type === "insertText" || type === "insertReplacementText")) {
      const textareaPreeditText = textarea ? stripTerminalInputSentinel(textarea.value) : "";
      const preeditCandidates = terminalCompositionPreeditCandidates(session, textareaPreeditText);
      event.preventDefault();
      event.stopImmediatePropagation();
      setTerminalInputComposing(session, false);
      armTerminalPostCompositionInput(session, {
        preedits: preeditCandidates,
        committed: data,
        sent: true,
        suppressSeparator: isTerminalASCIICompositionCommit(data),
      });
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTerminalTextareaCaretToEnd(textarea);
      }
      sendTerminalTextInput(session, data, {
        dedupe: true,
        applySticky: shouldApplyMobileStickyCompositionInput(data),
      });
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      return;
    }
    const pendingComposition = session?.pendingCompositionInput;
    const compositionValue = data ? resolveTerminalPostCompositionInput(session, data) : null;
    if (compositionValue !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setTerminalInputComposing(session, false);
      if (textarea) {
        textarea.value = terminalInputDeleteBuffer;
        moveTerminalTextareaCaretToEnd(textarea);
      }
      if (compositionValue) {
        sendTerminalTextInput(session, compositionValue, {
          dedupe: true,
          applySticky: shouldApplyMobileStickyCompositionInput(compositionValue),
        });
        rememberTerminalPostCompositionSentInput(session, pendingComposition, compositionValue);
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      return;
    }
    if (!data) {
      if (type.startsWith("insert") || type.startsWith("delete")) {
        event.stopImmediatePropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    setTerminalInputComposing(session, false);
    if (textarea) {
      textarea.value = terminalInputDeleteBuffer;
      moveTerminalTextareaCaretToEnd(textarea);
    }
    sendTerminalTextInput(session, data, {
      dedupe: type === "insertText" || type === "insertReplacementText" || Boolean(event.data),
      applySticky: shouldApplyMobileStickyTextInput(data, type),
    });
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
  };

  const handleTerminalTextareaInput = (session, event) => {
    event.stopPropagation();
    reassertTerminalSize(session);
    const textarea = session?.term?.textarea;
    if (!textarea) {
      return;
    }
    const type = String(event.inputType || "");
    if (session.composingIME) {
      clearTerminalPostCompositionInput(session);
      const value = stripTerminalInputSentinel(textarea.value);
      if (value) {
        setTerminalTextareaCompositionText(session, value);
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      return;
    }
    if (!session.composingIME) {
      const value = stripTerminalInputSentinel(textarea.value);
      if (
        isBackwardDeleteInputType(type)
        || (session.nativeDeleteInputPending && !type)
      ) {
        const handledByBeforeInput = Boolean(session.nativeDeleteInputPending);
        if (!handledByBeforeInput) {
          sendTerminalTextInput(session, "\x7f");
        }
        armTerminalNativeDeleteInput(session);
        resetTerminalHostViewport(session, { clean: true });
        positionTerminalInput(session);
        return;
      }
      const pendingComposition = session?.pendingCompositionInput;
      const compositionValue = (value || (!isBackwardDeleteInputType(type) && !isForwardDeleteInputType(type)))
        ? resolveTerminalPostCompositionInput(session, value)
        : null;
      if (compositionValue !== null) {
        if (compositionValue) {
          sendTerminalTextInput(session, compositionValue, {
            dedupe: true,
            applySticky: shouldApplyMobileStickyCompositionInput(compositionValue),
          });
          rememberTerminalPostCompositionSentInput(session, pendingComposition, compositionValue);
        }
      } else if (!value && isBackwardDeleteInputType(type)) {
        sendTerminalTextInput(session, "\x7f");
      } else if (!value && isForwardDeleteInputType(type)) {
        sendTerminalTextInput(session, "\x1b[3~");
      } else if (value) {
        sendTerminalTextInput(session, value, {
          dedupe: true,
          applySticky: shouldApplyMobileStickyTextInput(value, type),
        });
      }
      textarea.value = terminalInputDeleteBuffer;
      moveTerminalTextareaCaretToEnd(textarea);
    }
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
  };

  const detachTerminalHostCompositionListeners = (session) => {
    const host = session?.terminalHost;
    const handler = session?.term?.inputHandler;
    if (!host || !handler || handler.webshellCompositionDetached) {
      return;
    }
    const compositionListeners = [
      ["compositionstart", "compositionStartListener"],
      ["compositionupdate", "compositionUpdateListener"],
      ["compositionend", "compositionEndListener"],
    ];
    for (const [type, key] of compositionListeners) {
      const listener = handler[key];
      if (typeof listener === "function") {
        host.removeEventListener(type, listener);
      }
      handler[key] = null;
    }
    handler.isComposing = false;
    handler.webshellCompositionDetached = true;
  };

  const installTerminalHostInputIsolation = (session) => {
    const host = session?.terminalHost;
    if (!host) {
      return;
    }
    host.removeAttribute("contenteditable");
    detachTerminalHostCompositionListeners(session);
    const stopHostEditableInput = (event) => {
      if (event.target !== host) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopImmediatePropagation();
      if (event.type === "compositionend") {
        setTerminalInputComposing(session, false);
      }
      scheduleTerminalHostViewportReset(session, { clean: true });
      positionTerminalInput(session);
    };
    const blockedHostInputEvents = ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend"];
    const interceptTerminalTextareaBeforeInput = (event) => {
      if (event.target !== session?.term?.textarea) {
        return;
      }
      handleTerminalBeforeInput(session, event);
      event.stopImmediatePropagation();
    };
    host.addEventListener("beforeinput", interceptTerminalTextareaBeforeInput, { capture: true });
    for (const type of blockedHostInputEvents) {
      host.addEventListener(type, stopHostEditableInput, { capture: true });
    }
    addSessionCleanup(session, () => {
      host.removeEventListener("beforeinput", interceptTerminalTextareaBeforeInput, { capture: true });
      for (const type of blockedHostInputEvents) {
        host.removeEventListener(type, stopHostEditableInput, { capture: true });
      }
    });
  };

  const installTerminalInputFocus = (session) => {
    const term = session?.term;
    const host = session?.terminalHost;
    const shell = session?.shellEl;
    const textarea = term?.textarea;
    if (!term || !host || !shell || !textarea) {
      return;
    }
    textarea.setAttribute("inputmode", "text");
    textarea.setAttribute("enterkeyhint", "enter");
    textarea.setAttribute("rows", "1");
    textarea.setAttribute("wrap", "off");
    term.focus = () => focusTerminalInput(session, { focusSource: "system" });
    textarea.addEventListener("focus", () => {
      positionTerminalInput(session);
      updateMobileActiveTabTitle();
    });
    textarea.addEventListener("blur", () => {
      session.terminalInputAnchor = null;
      releaseTerminalInputViewportLock(session);
      updateMobileActiveTabTitle();
      scheduleMobileKeyboardDismissRecovery();
    });
    let lastMobileTapAt = 0;
    let lastMobileTapX = 0;
    let lastMobileTapY = 0;
    let mobileTapTouchState = null;
    let mobileTapFinishState = null;
    host.addEventListener("keydown", () => {
      reassertTerminalSize(session, { force: true });
    }, { capture: true });
    textarea.addEventListener("beforeinput", (event) => {
      handleTerminalBeforeInput(session, event);
    }, { capture: true });
    textarea.addEventListener("compositionstart", (event) => {
      event.stopPropagation();
      scrollTerminalToBottomForUserInput(session);
      clearTerminalTextareaSentinel(session);
      clearTerminalPostCompositionInput(session);
      setTerminalInputComposing(session, true);
      session.compositionTextHistory = [];
      session.compositionPreviousText = "";
      setTerminalTextareaCompositionText(session, "");
      positionTerminalInput(session);
      scheduleTerminalHostViewportReset(session, { clean: true });
    }, { capture: true });
    textarea.addEventListener("compositionupdate", (event) => {
      event.stopPropagation();
      setTerminalInputComposing(session, true);
      if (typeof event.data === "string") {
        setTerminalTextareaCompositionText(session, event.data);
      }
      positionTerminalInput(session);
      scheduleTerminalHostViewportReset(session, { clean: true });
    }, { capture: true });
    textarea.addEventListener("compositionend", (event) => {
      event.stopPropagation();
      const preeditText = terminalTextareaCompositionText(session);
      const textareaPreeditText = stripTerminalInputSentinel(textarea.value);
      const preeditCandidates = terminalCompositionPreeditCandidates(session, preeditText, textareaPreeditText);
      const committedText = typeof event.data === "string" ? stripTerminalInputSentinel(event.data) : "";
      const committedAlreadySent = isTerminalPostCompositionInputAlreadySent(session, committedText);
      setTerminalInputComposing(session, false);
      armTerminalPostCompositionInput(session, {
        preedits: preeditCandidates,
        committed: committedText,
        sent: Boolean(committedText),
        suppressSeparator: isTerminalASCIICompositionCommit(committedText),
      });
      textarea.value = terminalInputDeleteBuffer;
      moveTerminalTextareaCaretToEnd(textarea);
      if (committedText && !committedAlreadySent) {
        sendTerminalTextInput(session, committedText, {
          dedupe: true,
          applySticky: shouldApplyMobileStickyCompositionInput(committedText),
        });
      }
      window.setTimeout(() => {
        const fallbackValue = stripTerminalInputSentinel(textarea.value);
        if (fallbackValue) {
          const pendingComposition = session?.pendingCompositionInput;
          const compositionValue = resolveTerminalPostCompositionInput(session, fallbackValue);
          if (compositionValue) {
            sendTerminalTextInput(session, compositionValue, {
              dedupe: true,
              applySticky: shouldApplyMobileStickyCompositionInput(compositionValue),
            });
            rememberTerminalPostCompositionSentInput(session, pendingComposition, compositionValue);
          }
        }
        resetTerminalTextareaValue(session);
        resetTerminalHostViewport(session, { clean: true });
      }, 0);
    }, { capture: true });
    textarea.addEventListener("input", (event) => {
      handleTerminalTextareaInput(session, event);
    }, { capture: true });
    textarea.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain") || "";
      if (!text) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      reassertTerminalSize(session, { force: true });
      session.lastPasteText = text;
      session.lastPasteAt = performance.now();
      pasteIntoSession(session, text).catch((error) => showToast(error.message));
    }, { capture: true });
    addSessionCleanup(session, () => {
      endTerminalNativeDeleteInput(session, { reset: false });
      releaseTerminalInputViewportLock(session, { resync: false });
    });
    const isTerminalTouchTarget = (target) => target instanceof Element && target.closest(".terminal-host") === host;
    const claimCurrentDeviceTerminalSize = (event) => {
      if (
        !isTerminalTouchTarget(event.target)
        || event.isPrimary === false
        || (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      claimTerminalSizeForCurrentDevice(session);
    };
    shell.addEventListener("pointerdown", claimCurrentDeviceTerminalSize, { capture: true, passive: true });
    host.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        return;
      }
      if (requiresTouchKeyboardDoubleTap()) {
        session.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;
      }
      window.requestAnimationFrame(() => focusTerminalInput(session));
    });
    const startMobileTap = (event) => {
      mobileTapFinishState = null;
      if (!requiresTouchKeyboardDoubleTap() || event.touches.length !== 1 || !isTerminalTouchTarget(event.target)) {
        mobileTapTouchState = null;
        return;
      }
      claimTerminalSizeForCurrentDevice(session);
      blurTerminalInput(session);
      const touch = event.touches[0];
      mobileTapTouchState = {
        startX: touch.clientX,
        startY: touch.clientY,
        moved: false,
      };
    };
    const moveMobileTap = (event) => {
      if (!mobileTapTouchState || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      if (
        Math.abs(touch.clientX - mobileTapTouchState.startX) >= touchShortcutMoveThresholdPx ||
        Math.abs(touch.clientY - mobileTapTouchState.startY) >= touchShortcutMoveThresholdPx
      ) {
        mobileTapTouchState.moved = true;
      }
    };
    const finishMobileTap = (event) => {
      if (!requiresTouchKeyboardDoubleTap() || !mobileTapTouchState) {
        mobileTapTouchState = null;
        return;
      }
      const touch = primaryTouch(event);
      const state = mobileTapTouchState;
      mobileTapTouchState = null;
      if (!touch || state.moved) {
        mobileTapFinishState = null;
        return;
      }
      const now = performance.now();
      const dx = touch.clientX - lastMobileTapX;
      const dy = touch.clientY - lastMobileTapY;
      const isDoubleTap = now - lastMobileTapAt <= mobileKeyboardDoubleTapDelayMs && Math.hypot(dx, dy) < touchShortcutMoveThresholdPx * 2;
      lastMobileTapAt = now;
      lastMobileTapX = touch.clientX;
      lastMobileTapY = touch.clientY;
      mobileTapFinishState = { event, isDoubleTap };
      if (!isDoubleTap) {
        return;
      }
      session.allowMobileKeyboardFocusUntil = now + mobileKeyboardFocusAllowWindowMs;
      mobileKeyboardClaimedTouchEnds.add(event);
      focusTerminalInput(session, {
        requestMobileKeyboard: true,
        forceMobileFocusTransition: true,
      });
      if (event.cancelable) {
        event.preventDefault();
      }
    };
    const settleMobileTap = (event) => {
      const finishState = mobileTapFinishState;
      mobileTapFinishState = null;
      if (finishState?.event === event && !finishState.isDoubleTap) {
        blurTerminalInput(session);
      }
    };
    const cancelMobileTap = () => {
      mobileTapTouchState = null;
      mobileTapFinishState = null;
    };
    shell.addEventListener("touchstart", startMobileTap, { capture: true, passive: true });
    shell.addEventListener("touchmove", moveMobileTap, { capture: true, passive: true });
    shell.addEventListener("touchend", finishMobileTap, { capture: true, passive: false });
    shell.addEventListener("touchend", settleMobileTap);
    shell.addEventListener("touchcancel", cancelMobileTap, { capture: true, passive: true });
    addSessionCleanup(session, () => {
      shell.removeEventListener("pointerdown", claimCurrentDeviceTerminalSize, { capture: true });
      shell.removeEventListener("touchstart", startMobileTap, { capture: true });
      shell.removeEventListener("touchmove", moveMobileTap, { capture: true });
      shell.removeEventListener("touchend", finishMobileTap, { capture: true });
      shell.removeEventListener("touchend", settleMobileTap);
      shell.removeEventListener("touchcancel", cancelMobileTap, { capture: true });
    });
    positionTerminalInput(session);
  };

  const installTerminalHostViewportGuard = (session) => {
    const host = session?.terminalHost;
    if (!host) {
      return;
    }
    host.addEventListener("beforeinput", () => scheduleTerminalHostViewportReset(session, { clean: true }));
    host.addEventListener("input", () => scheduleTerminalHostViewportReset(session, { clean: true }));
    host.addEventListener("scroll", () => scheduleTerminalHostViewportReset(session));
    host.addEventListener("blur", () => {
      setTerminalInputComposing(session, false);
      scheduleTerminalHostViewportReset(session, { clean: true });
    });
    resetTerminalHostViewport(session, { clean: true });
  };

  const terminalSize = (pane) => {
    const cols = Math.max(0, Math.floor(Number(pane?.term?.cols) || 0));
    const rows = Math.max(0, Math.floor(Number(pane?.term?.rows) || 0));
    const pixels = terminalPixelSize(pane?.term);
    const pixelWidth = Math.max(0, Math.round(Number(pixels?.width) || 0));
    const pixelHeight = Math.max(0, Math.round(Number(pixels?.height) || 0));
    return { cols, rows, pixelWidth, pixelHeight };
  };

  const terminalThemePayload = () => ({
    foreground: normalizeThemeColor(activeTheme?.xterm?.foreground || activeTheme?.foreground || "#00cd00", "#00cd00"),
    background: normalizeThemeColor(activeTheme?.xterm?.background || activeTheme?.background || "#000000", "#000000"),
    cursor: normalizeThemeColor(activeTheme?.xterm?.cursor || activeTheme?.foreground || "#00cd00", "#00cd00"),
  });

  const dimensionsEqualTerminalSize = (pane, dimensions) => {
    if (!dimensions) {
      return false;
    }
    const { cols, rows } = terminalSize(pane);
    return Math.floor(Number(dimensions.cols) || 0) === cols && Math.floor(Number(dimensions.rows) || 0) === rows;
  };

  const normalizeTerminalResizeEpoch = (value) => {
    const text = String(value ?? "").trim();
    return /^\d+$/.test(text) && text !== "0" ? text : "";
  };

  const nextTerminalResizeEpoch = (pane) => {
    const previous = normalizeTerminalResizeEpoch(pane?.requestedResizeEpoch)
      || normalizeTerminalResizeEpoch(pane?.appliedResizeEpoch)
      || "0";
    let next;
    try {
      const previousValue = BigInt(previous);
      const clockValue = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
      next = clockValue > previousValue ? clockValue : previousValue + 1n;
    } catch (error) {
      next = BigInt(Date.now()) * 1000n;
    }
    return String(next);
  };

  const sendTerminalSize = (pane, { force = false, dimensions = null, claim = false } = {}) => {
    if (pane?.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    const currentSize = terminalSize(pane);
    const cols = Math.max(0, Math.floor(Number(dimensions?.cols) || currentSize.cols));
    const rows = Math.max(0, Math.floor(Number(dimensions?.rows) || currentSize.rows));
    const pixelWidth = Math.max(0, Math.floor(Number(dimensions?.pixelWidth) || currentSize.pixelWidth));
    const pixelHeight = Math.max(0, Math.floor(Number(dimensions?.pixelHeight) || currentSize.pixelHeight));
    if (!shouldSendTerminalSize({
      cols,
      rows,
      pixelWidth,
      pixelHeight,
      lastSentCols: pane.lastSentCols,
      lastSentRows: pane.lastSentRows,
      lastSentPixelWidth: pane.lastSentPixelWidth,
      lastSentPixelHeight: pane.lastSentPixelHeight,
      force,
    })) {
      return false;
    }
    const resizeEpochSupported = pane.resizeEpochSupported !== false;
    const resizeEpoch = resizeEpochSupported ? nextTerminalResizeEpoch(pane) : "";
    pane.lastSentCols = cols;
    pane.lastSentRows = rows;
    pane.lastSentPixelWidth = pixelWidth;
    pane.lastSentPixelHeight = pixelHeight;
    pane.requestedResizeEpoch = resizeEpoch;
    pane.requestedCols = cols;
    pane.requestedRows = rows;
    pane.requestedPixelWidth = pixelWidth;
    pane.requestedPixelHeight = pixelHeight;
    pane.resizeAckPending = resizeEpochSupported;
    pane.requestedResizeClaim = claim;
    pane.resizeController = pane.resizeController || new TerminalResizeController();
    if (resizeEpochSupported) {
      pane.resizeController.request({
        requestID: String(resizeEpoch),
        connectionEpoch: Number(pane.connectionEpoch || 0),
        resizeEpoch,
        dimensions: { cols, rows, pixelWidth, pixelHeight },
      });
    }
    pane.lastResizeRequestAt = performanceTaskNow();
    try {
      pane.socket.send(JSON.stringify({
        type: "resize",
        cols,
        rows,
        pixel_width: pixelWidth,
        pixel_height: pixelHeight,
        ...(claim ? { claim: true } : {}),
        ...(resizeEpochSupported ? { resize_epoch: resizeEpoch } : {}),
      }));
    } catch (error) {
      pane.resizeAckPending = false;
      return false;
    }
    recordTerminalSessionEvent(pane, "resize_request", {
      requestedResizeEpoch: resizeEpoch,
      cols,
      rows,
    });
    return true;
  };

  const claimTerminalSize = (pane, { force = false } = {}) => {
    if (!pane || pane.closed) {
      return false;
    }
    const now = performance.now();
    const lastClaimAt = Number(pane.lastSizeClaimAt || 0);
    if (!force && !pane.sizeClaimRequired) {
      return false;
    }
    if (!force && lastClaimAt > 0 && now - lastClaimAt < terminalSizeClaimIntervalMs) {
      return false;
    }
    const sent = sendTerminalSize(pane, { force: true, claim: true });
    if (sent) {
      pane.lastSizeClaimAt = now;
    }
    return sent;
  };

  const sendTerminalTheme = (pane) => {
    if (pane?.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    pane.socket.send(JSON.stringify({ type: "theme", ...terminalThemePayload() }));
    return true;
  };

  const isPaneMeasurable = (pane) => {
    const host = pane?.terminalHost;
    if (!(host instanceof HTMLElement) || !host.isConnected || host.clientWidth <= 0 || host.clientHeight <= 0) {
      return false;
    }
    const rect = host.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isPaneVisibleForSizing = (pane) => {
    return pane?.tabId === activeTabId && isPaneMeasurable(pane);
  };

  const terminalConnectionPriority = (session, { userInteraction = false } = {}) => {
    if (userInteraction) {
      return 0;
    }
    const tab = tabs.get(session?.tabId);
    if (tab?.id === activeTabId) {
      return tab.activePaneId === session.id ? 1 : 2;
    }
    return Number(session?.lastUserInteractionAt || 0) > 0 ? 3 : 4;
  };

  // A hidden pane may not have a DOM fit generation yet, but xterm still has
  // a safe logical size. It can initialize on a multiplexed transport and
  // receive a real resize when its tab becomes visible.
  const terminalPaneHasKnownSize = (pane) => Boolean(
    Number(pane?.measuredFitGeneration || 0) > 0
      || (Number(pane?.initialCols || 0) >= 2 && Number(pane?.initialRows || 0) >= 1)
      || (Number(pane?.term?.cols || 0) >= 2 && Number(pane?.term?.rows || 0) >= 1)
  );

  const terminalUnifiedPanesForWorkspace = () => {
    const panes = [];
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane.closed || pane.name !== activeName) {
          continue;
        }
        panes.push(pane);
      }
    }
    return panes;
  };

  const terminalLayoutPaneOrder = (node, paneOrder = []) => {
    if (!node) {
      return paneOrder;
    }
    if (node.type === "leaf") {
      const paneID = String(node.paneId || "").trim();
      if (paneID) {
        paneOrder.push(paneID);
      }
      return paneOrder;
    }
    for (const child of node.children || []) {
      terminalLayoutPaneOrder(child, paneOrder);
    }
    return paneOrder;
  };

  const terminalUnifiedVisualOrder = (tab, panes) => {
    const layoutOrder = new Map(terminalLayoutPaneOrder(tab?.layout)
      .map((paneID, index) => [paneID, index]));
    const measured = [];
    for (const pane of panes) {
      const rect = pane?.shellEl?.getBoundingClientRect?.();
      if (
        Number(pane?.measuredFitGeneration || 0) <= 0
        || !rect
        || rect.width <= 0
        || rect.height <= 0
      ) {
        return { orderedPanes: panes, ready: false };
      }
      measured.push({
        pane,
        top: rect.top,
        left: rect.left,
        layoutOrder: layoutOrder.get(pane.id) ?? Number.MAX_SAFE_INTEGER,
      });
    }
    measured.sort((left, right) => (
      left.top - right.top
      || left.left - right.left
      || left.layoutOrder - right.layoutOrder
      || String(left.pane.id).localeCompare(String(right.pane.id))
    ));
    measured.forEach((entry, index) => {
      entry.pane.initializationOrder = index + 1;
    });
    return { orderedPanes: measured.map((entry) => entry.pane), ready: measured.length > 0 };
  };

  const terminalUnifiedGlobalOrder = () => {
    const activeTab = tabs.get(activeTabId);
    if (!activeTab) {
      return { orderedPanes: [], ready: false };
    }
    const activePanes = Array.from(activeTab.panes.values()).filter((pane) => (
      !pane.closed && pane.name === activeName
    ));
    const activeOrder = terminalUnifiedVisualOrder(activeTab, activePanes);
    if (!activeOrder.ready) {
      return { orderedPanes: terminalUnifiedPanesForWorkspace(), ready: false };
    }
    const orderedPanes = [...activeOrder.orderedPanes];
    const included = new Set(orderedPanes.map((pane) => pane.id));
    for (const tab of tabs.values()) {
      if (tab.id === activeTabId) {
        continue;
      }
      const layoutOrder = terminalLayoutPaneOrder(tab.layout);
      for (const paneID of layoutOrder) {
        const pane = tab.panes.get(paneID);
        if (!pane || pane.closed || pane.name !== activeName || included.has(pane.id)) {
          continue;
        }
        orderedPanes.push(pane);
        included.add(pane.id);
      }
      for (const pane of tab.panes.values()) {
        if (pane.closed || pane.name !== activeName || included.has(pane.id)) {
          continue;
        }
        orderedPanes.push(pane);
        included.add(pane.id);
      }
    }
    orderedPanes.forEach((pane, index) => {
      pane.initializationOrder = index + 1;
    });
    return { orderedPanes, ready: orderedPanes.length > 0 };
  };

  const scheduleTerminalUnifiedMeasurementPass = (tab) => {
    if (!tab || tab.id !== activeTabId) {
      return;
    }
    for (const pane of tab.panes.values()) {
      if (
        pane.closed
        || pane.name !== activeName
        || Number(pane.measuredFitGeneration || 0) > 0
        || pane.connectionMeasurementFrame
        || Number(pane.connectionMeasurementAttempts || 0) >= 4
      ) {
        continue;
      }
      pane.connectionMeasurementAttempts = Number(pane.connectionMeasurementAttempts || 0) + 1;
      pane.connectionMeasurementFrame = window.requestAnimationFrame(() => {
        pane.connectionMeasurementFrame = 0;
        if (pane.closed || pane.tabId !== activeTabId || pane.name !== activeName) {
          return;
        }
        schedulePaneResize(pane, {
          forceFullRender: true,
          hideUntilRender: true,
        }, { immediate: true });
      });
    }
  };

  const refreshTerminalUnifiedMembership = ({
    reason = "workspace_membership_changed",
    interactionSession = null,
  } = {}) => {
    if (isClientInstanceName(activeName)) {
      return false;
    }
    if (applyingWorkspaceState) {
      terminalUnifiedRefreshPending = true;
      return false;
    }
    const tab = tabs.get(activeTabId);
    const { orderedPanes } = terminalUnifiedGlobalOrder();
    const activePane = interactionSession || tab?.panes.get(tab?.activePaneId) || null;
    const result = terminalUnifiedMembership.reconcile({
      targetName: activeName,
      panes: orderedPanes,
      activeTabID: tab?.id || "",
      activePaneID: activePane?.id || "",
    });
    if (result.targetChanged && terminalUnifiedConnection) {
      closeTerminalUnifiedConnection("context_changed");
    }
    for (const pane of result.removed) {
      if (pane.connectionChannel === "unified" && pane.socket) {
        pane.connectionCloseReason = "membership_removed";
        try {
          pane.socket.close(4001, "membership_removed");
        } catch (error) {
          detachSessionSocket(pane, pane.socket, { connection: pane.closed ? "closed" : "idle" });
        }
      }
    }
    scheduleTerminalUnifiedMeasurementPass(tab);
    scheduleTerminalUnifiedSync({ reason });
    if (terminalUnifiedConnection) {
      for (const { pane, priority } of result.priorities) {
        terminalUnifiedConnection.setPriority(pane.id, priority);
      }
    }
    return true;
  };

  const scheduleSessionConnectionPriorityDecay = (session) => {
    if (!session || session.closed || !isClientInstanceName(activeName)) {
      return;
    }
    if (session.connectionPriorityTimer) {
      window.clearTimeout(session.connectionPriorityTimer);
    }
    session.connectionPriorityTimer = window.setTimeout(() => {
      session.connectionPriorityTimer = 0;
      if (!session.closed) {
        syncTerminalConnectionDemands({ reason: "interaction_priority_decay" });
      }
    }, terminalConnectionInteractionPriorityMs);
  };

  const requestSessionConnection = (session, {
    reason = "connection_demand",
    userInteraction = false,
    immediate = false,
    allowHidden = true,
  } = {}) => {
    if (
      disposed
      || !session
      || session.closed
      || !isCurrentInstanceSession(session)
      || Number(session.measuredFitGeneration || 0) <= 0
    ) {
      return false;
    }
    if (userInteraction) {
      session.lastUserInteractionAt = Date.now();
      scheduleSessionConnectionPriorityDecay(session);
    }
    session.pendingConnect = false;
    if (!isClientInstanceName(activeName)) {
      refreshTerminalUnifiedMembership({
        reason,
        interactionSession: userInteraction && session.tabId === activeTabId ? session : null,
      });
      return true;
    }
    const scheduler = ensureClientTerminalConnectionScheduler();
    return scheduler.request(session, {
      priority: terminalConnectionPriority(session, { userInteraction }),
      generation: terminalConnectionDemandGeneration,
      reason,
      immediate,
      allowHidden,
      lastUserInteractionAt: Number(session.lastUserInteractionAt || 0),
      lastBecameVisibleAt: Number(session.lastBecameVisibleAt || 0),
      lastOutputAt: Number(session.lastTerminalOutputAt || 0),
    });
  };

  const syncClientTerminalConnectionDemands = ({
    reason = "workspace_priority_changed",
    interactionSession = null,
  } = {}) => {
    const scheduler = ensureClientTerminalConnectionScheduler();
    if (!scheduler || disposed) {
      return;
    }
    scheduler.setCapacity(terminalClientDirectWebSocketCapacity);
    terminalConnectionDemandGeneration += 1;
    const generation = terminalConnectionDemandGeneration;
    for (const tab of tabs.values()) {
      const tabIsActive = tab.id === activeTabId;
      for (const pane of tab.panes.values()) {
        if (pane.closed || pane.name !== activeName || Number(pane.measuredFitGeneration || 0) <= 0) {
          continue;
        }
        if (!tabIsActive) {
          scheduler.release(pane, "background_tab_parked");
          continue;
        }
        if (tabIsActive) {
          pane.lastBecameVisibleAt = Date.now();
        }
        scheduler.request(pane, {
          priority: terminalConnectionPriority(pane, { userInteraction: pane === interactionSession }),
          generation,
          reason,
          immediate: pane === interactionSession,
          allowHidden: true,
          lastUserInteractionAt: Number(pane.lastUserInteractionAt || 0),
          lastBecameVisibleAt: Number(pane.lastBecameVisibleAt || 0),
          lastOutputAt: Number(pane.lastTerminalOutputAt || 0),
        });
      }
    }
    scheduler.setGeneration(generation);
    if (interactionSession) {
      scheduleSessionConnectionPriorityDecay(interactionSession);
    }
  };

  const syncTerminalConnectionDemands = ({
    reason = "workspace_priority_changed",
    interactionSession = null,
  } = {}) => {
    if (disposed) {
      return;
    }
    if (isClientInstanceName(activeName)) {
      syncClientTerminalConnectionDemands({ reason, interactionSession });
      return;
    }
    refreshTerminalUnifiedMembership({ reason, interactionSession });
  };

  const stopTerminalScrollAnimation = (term) => {
    if (!term?.scrollAnimationFrame) {
      return;
    }
    window.cancelAnimationFrame(term.scrollAnimationFrame);
    term.scrollAnimationFrame = undefined;
    term.scrollAnimationStartTime = undefined;
    term.scrollAnimationStartY = undefined;
    term.scrollAnimationLastFrameTime = undefined;
  };

  const resizeTargetMatches = (left, right) => Boolean(
    left
    && right
    && Number(left.cols || 0) === Number(right.cols || 0)
    && Number(left.rows || 0) === Number(right.rows || 0)
    && (!left.pixelWidth || !right.pixelWidth || Number(left.pixelWidth) === Number(right.pixelWidth))
    && (!left.pixelHeight || !right.pixelHeight || Number(left.pixelHeight) === Number(right.pixelHeight))
  );

  const terminalIsAlternateScreen = (term) => Boolean(
    term?.wasmTerm?.isAlternateScreen?.()
    || term?.buffer?.active?.type === "alternate"
  );

  const captureTerminalViewport = (term) => ({
    atBottom: isTerminalViewportAtBottom(term),
    viewportY: terminalViewportValue(term?.viewportY),
    targetViewportY: terminalViewportValue(term?.targetViewportY),
  });

  const restoreTerminalViewport = (term, viewport) => {
    if (!term || !viewport) {
      return;
    }
    stopTerminalScrollAnimation(term);
    if (terminalIsAlternateScreen(term)) {
      term.viewportY = 0;
      term.targetViewportY = 0;
      return;
    }
    if (viewport.atBottom) {
      term.viewportY = 0;
      term.targetViewportY = 0;
      return;
    }
    const scrollback = Math.max(0, Number(term.getScrollbackLength?.() || 0));
    term.viewportY = Math.max(0, Math.min(scrollback, viewport.viewportY));
    term.targetViewportY = Math.max(0, Math.min(scrollback, viewport.targetViewportY));
  };

  const terminalCanvasSize = (pane) => {
    const canvas = pane?.term?.canvas || pane?.term?.renderer?.getCanvas?.();
    return {
      width: Math.max(0, Number(canvas?.width) || 0),
      height: Math.max(0, Number(canvas?.height) || 0),
    };
  };

  const terminalCanvasMatchesExpectedSize = (pane, dimensions = terminalSize(pane)) => {
    const canvas = pane?.term?.canvas || pane?.term?.renderer?.getCanvas?.();
    const cols = Math.max(0, Math.floor(Number(dimensions?.cols) || 0));
    const rows = Math.max(0, Math.floor(Number(dimensions?.rows) || 0));
    const expected = pane?.term?.renderer?.canvasSize?.(cols, rows);
    if (!(canvas instanceof HTMLCanvasElement) || !expected || cols <= 0 || rows <= 0) {
      return false;
    }
    return canvas.width === Math.max(0, Number(expected.pixelWidth) || 0)
      && canvas.height === Math.max(0, Number(expected.pixelHeight) || 0)
      && canvas.style.width === `${expected.cssWidth}px`
      && canvas.style.height === `${expected.cssHeight}px`;
  };

  const failedPaneFit = (measurable = false) => ({
    ok: false,
    measurable,
    cols: 0,
    rows: 0,
    sizeChanged: false,
    canvasChanged: false,
  });

  const resizePane = (pane, {
    visibleOnly = true,
    forceFullRender = false,
    hideUntilRender = false,
    forceSizeSync = false,
    claimSize = false,
    settlePresentation,
  } = {}) => {
    if (!pane || pane.closed) {
      return failedPaneFit();
    }
    const shouldSettlePresentation = settlePresentation === true
      || (settlePresentation !== false && !pane.resizePresentationHold);
    if (visibleOnly && !isPaneVisibleForSizing(pane)) {
      return failedPaneFit(isPaneMeasurable(pane));
    }
    if (isMobileKeyboardResizeSuppressed()) {
      resetTerminalHostViewport(pane, { clean: true });
      positionTerminalInput(pane);
      syncTerminalViewportPan(pane);
      updateMobileSelectionHandles(pane);
      return failedPaneFit(isPaneMeasurable(pane));
    }
    if (!shouldSettlePresentation && pane.resizePresentationHold) {
      return failedPaneFit(isPaneMeasurable(pane));
    }
    return measurePerformanceTask("resize/fit", () => {
      const dimensions = pane.fitAddon?.proposeDimensions?.();
      if (!dimensions || dimensions.cols <= 0 || dimensions.rows <= 0) {
        return failedPaneFit(isPaneMeasurable(pane));
      }
      const fittedDimensions = {
        cols: Math.max(1, Math.floor(Number(dimensions.cols) || 0)),
        rows: Math.max(1, Math.floor(Number(dimensions.rows) || 0)),
      };
      const viewport = captureTerminalViewport(pane.term);
      const sizeBefore = terminalSize(pane);
      const canvasBefore = terminalCanvasSize(pane);
      const canvasNeedsResize = !terminalCanvasMatchesExpectedSize(pane, fittedDimensions);
      const dimensionsWillChange = !dimensionsEqualTerminalSize(pane, fittedDimensions) || canvasNeedsResize;
      const targetCanvas = pane.term?.renderer?.canvasSize?.(fittedDimensions.cols, fittedDimensions.rows);
      const targetDimensions = {
        cols: fittedDimensions.cols,
        rows: fittedDimensions.rows,
        pixelWidth: Math.max(0, Math.floor(Number(targetCanvas?.pixelWidth) || 0)),
        pixelHeight: Math.max(0, Math.floor(Number(targetCanvas?.pixelHeight) || 0)),
      };
      const shouldHoldFrame = dimensionsWillChange && pane.hasPresentedFrame;
      const legacyResizeSuppression = Boolean(
        dimensionsWillChange
        && sessionReplayIsCommitted(pane)
        && pane.socket?.readyState === WebSocket.OPEN
        && pane.resizeEpochSupported === false
      );
      if (shouldHoldFrame) {
        beginTerminalPresentationHold(pane);
      } else if (!shouldSettlePresentation) {
        pane.resizePresentationHold = true;
      }
      const shouldCommitAfterHold = pane.resizePresentationHold && pane.hasPresentedFrame;
      const resizeOutputSettlePending = pane.resizeOutputSettleActive === true;
      if (shouldHoldFrame && !pane.terminalFrameHeld) {
        holdSessionTerminalFrame(pane);
      }
      if (hideUntilRender || shouldHoldFrame || pane.resizePresentationHold) {
        setPaneRenderReady(pane, false);
      }

      // Once a live, epoch-aware socket is attached, keep the local terminal
      // on the old geometry until the server ACK arrives. This creates a real
      // boundary for PTY bytes: output already ordered before the ACK is
      // parsed by the old grid, and output after it is parsed by the new grid.
      const canDeferLocalResize = Boolean(
        dimensionsWillChange
        && sessionReplayIsCommitted(pane)
        && pane.socket?.readyState === WebSocket.OPEN
        && pane.resizeEpochSupported !== false
      );
      const resizeRequestInFlight = Boolean(canDeferLocalResize && pane.resizeAckPending);
      const requestedResizeTarget = resizeRequestInFlight ? {
        cols: pane.requestedCols,
        rows: pane.requestedRows,
        pixelWidth: pane.requestedPixelWidth,
        pixelHeight: pane.requestedPixelHeight,
      } : null;
      if (resizeRequestInFlight && resizeTargetMatches(requestedResizeTarget, targetDimensions)) {
        recordTerminalSessionEvent(pane, "resize_fence_wait", {
          cols: targetDimensions.cols,
          rows: targetDimensions.rows,
          reusedPendingRequest: true,
        });
        return {
          ok: true,
          measurable: true,
          pending: true,
          cols: sizeBefore.cols,
          rows: sizeBefore.rows,
          sizeChanged: false,
          canvasChanged: false,
        };
      }
      if (resizeRequestInFlight) {
        pane.pendingResizeTarget = { ...targetDimensions };
        recordTerminalSessionEvent(pane, "resize_fence_wait", {
          cols: targetDimensions.cols,
          rows: targetDimensions.rows,
          queuedBehindRequest: pane.requestedResizeEpoch,
        });
        return {
          ok: true,
          measurable: true,
          pending: true,
          cols: sizeBefore.cols,
          rows: sizeBefore.rows,
          sizeChanged: false,
          canvasChanged: false,
        };
      }
      if (canDeferLocalResize) {
        clearResizeOutputSettle(pane);
        beginTerminalRenderSuppression(pane, "resize");
        pane.resizeFenceActive = true;
        pane.resizeFenceTarget = {
          ...targetDimensions,
          viewport,
        };
        // Freeze the output boundary at request time. A bounded preflight
        // flush may leave old-geometry entries queued; the ACK path drains
        // exactly this prefix before changing the local grid.
        pane.resizeFenceDrainRemainingEntries = Array.isArray(pane.outputQueue)
          ? pane.outputQueue.length
          : 0;
        flushSessionOutput(pane, {
          force: true,
          maxBytes: terminalResizeOutputFlushBudgetBytes,
        });
        pane.resizeFenceDrainRemainingEntries = Math.min(
          pane.resizeFenceDrainRemainingEntries,
          Array.isArray(pane.outputQueue) ? pane.outputQueue.length : 0,
        );
        const sent = sendTerminalSize(pane, {
          force: true,
          dimensions: targetDimensions,
          claim: claimSize,
        });
        if (sent) {
          recordTerminalSessionEvent(pane, "resize_fence_wait", {
            cols: targetDimensions.cols,
            rows: targetDimensions.rows,
          });
          return {
            ok: true,
            measurable: true,
            pending: true,
            cols: sizeBefore.cols,
            rows: sizeBefore.rows,
            sizeChanged: false,
            canvasChanged: false,
          };
        }
        endTerminalRenderSuppression(pane, { render: false, reason: "resize" });
        clearTerminalResizeFence(pane);
      }
      try {
        if (legacyResizeSuppression) {
          beginTerminalRenderSuppression(pane, "resize");
        }
        if (dimensionsWillChange) {
          pane.term.resize(fittedDimensions.cols, fittedDimensions.rows);
        }
      } catch (error) {
        if (legacyResizeSuppression) {
          endTerminalRenderSuppression(pane, { render: false, reason: "resize" });
        }
        if (pane.hasPresentedFrame) {
          schedulePaneFullRenderValidation(pane);
        }
        if (shouldSettlePresentation) {
          pane.resizePresentationHold = false;
          if (pane.hasPresentedFrame) {
            setPaneRenderReady(pane, true);
          }
        }
        return failedPaneFit(true);
      }
      restoreTerminalViewport(pane.term, viewport);
      const sizeAfter = terminalSize(pane);
      const canvasAfter = terminalCanvasSize(pane);
      const sizeChanged = sizeBefore.cols !== sizeAfter.cols || sizeBefore.rows !== sizeAfter.rows;
      const canvasChanged = canvasBefore.width !== canvasAfter.width || canvasBefore.height !== canvasAfter.height;
      const firstMeasuredFit = Number(pane.measuredFitGeneration || 0) <= 0;
      const fitGenerationChanged = firstMeasuredFit || sizeChanged || canvasChanged || canvasNeedsResize;
      if (fitGenerationChanged) {
        pane.measuredFitGeneration = Number(pane.measuredFitGeneration || 0) + 1;
      }
      pane.activationFitPending = false;
      resetTerminalHostViewport(pane, { clean: true });
      positionTerminalInput(pane);
      syncTerminalViewportPan(pane);
      if (!pane.initialRuntimeResetDone && !sessionReplayIsCommitted(pane)) {
        resetTerminalAfterInitialFit(pane);
      }
      if (fitGenerationChanged && sessionReplayIsCommitted(pane)) {
        setPaneRenderReady(pane, false);
      }
      const sentTerminalSize = sendTerminalSize(pane, {
        force: forceSizeSync,
        dimensions: targetDimensions,
        claim: claimSize,
      });
      updateMobileSelectionHandles(pane);
      if (
        sentTerminalSize
        && dimensionsWillChange
        && sessionReplayIsCommitted(pane)
        && pane.resizeEpochSupported === false
        && scheduleResizeOutputSettle(pane, { reason: "legacy_resize" })
      ) {
        return {
          ok: true,
          measurable: true,
          pending: true,
          cols: sizeAfter.cols,
          rows: sizeAfter.rows,
          sizeChanged,
          canvasChanged,
        };
      }
      if (legacyResizeSuppression && !pane.resizeOutputSettleActive) {
        endTerminalRenderSuppression(pane, { render: false, reason: "resize" });
      }
      if (shouldCommitAfterHold && !pane.resizeAckPending && !resizeOutputSettlePending) {
        requestPaneFullRender(pane);
        commitTerminalPresentationNow(pane);
      } else if (forceFullRender || fitGenerationChanged || hideUntilRender || pane.fullRenderPending || !pane.hasPresentedFrame) {
        renderPaneFullNow(pane);
      }
      if (shouldSettlePresentation && !shouldCommitAfterHold && !pane.resizeAckPending && !resizeOutputSettlePending) {
        pane.resizePresentationHold = false;
        if (!pane.fullRenderPending && pane.hasPresentedFrame) {
          setPaneRenderReady(pane, true);
        }
      }
      return {
        ok: true,
        measurable: true,
        cols: sizeAfter.cols,
        rows: sizeAfter.rows,
        sizeChanged,
        canvasChanged,
      };
    });
  };

  const paneResizeScheduler = createTerminalResizeScheduler({
    apply: (pane, options, { settled = true } = {}) => {
      if (!settled) {
        return;
      }
      const fit = resizePane(pane, {
        ...options,
        settlePresentation: true,
      });
      if (fit.ok) {
        connectPendingSession(pane);
      }
    },
    throttleMs: terminalResizeThrottleMs,
    settleMs: terminalResizeSettleMs,
  });

  const schedulePaneResize = (pane, options = {}, scheduleOptions = {}) => {
    if (!pane || pane.closed) {
      return false;
    }
    // Skip terminal resize holds while the mobile IME changes the viewport.
    if (isMobileKeyboardResizeSuppressed()) {
      return false;
    }
    return paneResizeScheduler.schedule(pane, options, scheduleOptions);
  };

  const cancelScheduledPaneResize = (pane) => {
    paneResizeScheduler.cancel(pane);
    if (pane) {
      clearResizeOutputSettle(pane);
      pane.presentationCommitPending = false;
      pane.resizePresentationHold = false;
    }
  };

  const connectPendingSession = (session, { allowHidden = false } = {}) => {
    if (!session || session.closed || !isCurrentInstanceSession(session)) {
      return;
    }
    const socketReadyState = session.socket?.readyState;
    if (socketReadyState === WebSocket.OPEN || socketReadyState === WebSocket.CONNECTING) {
      session.pendingConnect = false;
      return;
    }
    if (isPaneMeasurable(session)) {
      if (document.hidden && !allowHidden) {
        return;
      }
      const fit = resizePane(session, {
        settlePresentation: !session.resizePresentationHold,
      });
      if (!fit.ok || Number(session.measuredFitGeneration || 0) <= 0) {
        return;
      }
      requestSessionConnection(session, { reason: "pane_measured", allowHidden });
      return;
    }
    if (allowHidden && Number(session.measuredFitGeneration || 0) > 0) {
      requestSessionConnection(session, { reason: "hidden_pane_ready", allowHidden: true });
    }
  };

  const connectPendingSessionsForTab = (tab, options = {}) => {
    if (!tab) {
      return;
    }
    for (const pane of tab.panes.values()) {
      connectPendingSession(pane, options);
    }
  };

  const resizeTab = (tab, options = {}) => {
    if (!tab) {
      return;
    }
    for (const pane of tab.panes.values()) {
      resizePane(pane, options);
    }
    connectPendingSessionsForTab(tab);
  };

  const resizeActiveTab = (options = {}) => resizeTab(currentTab(), options);

  const scheduleTabResize = (tab, options = {}, scheduleOptions = {}) => {
    if (!tab) {
      return;
    }
    syncTabMobilePixelScroll(tab);
    for (const pane of tab.panes.values()) {
      schedulePaneResize(pane, options, scheduleOptions);
    }
  };

  const scheduleVisibleTabResize = (tab, { immediate = false } = {}) => {
    if (!tab) {
      return;
    }
    if (tab.resizeFrame) {
      window.cancelAnimationFrame(tab.resizeFrame);
    }
    const resizeVisiblePanes = () => {
      for (const pane of tab.panes.values()) {
        const presentationCurrent = panePresentationIsCurrent(pane);
        schedulePaneResize(pane, {
          forceFullRender: !presentationCurrent || !pane.hasPresentedFrame,
          hideUntilRender: !presentationCurrent,
        }, { immediate: true });
      }
      connectPendingSessionsForTab(tab);
      if (tab.id === activeTabId) {
        for (const pane of tab.panes.values()) {
          schedulePanePresentationFrame(pane, "tab_activated");
        }
      }
    };
    if (immediate) {
      tab.resizeFrame = 0;
      resizeVisiblePanes();
      return;
    }
    tab.resizeFrame = window.requestAnimationFrame(() => {
      tab.resizeFrame = 0;
      resizeVisiblePanes();
    });
  };

  const scheduleActiveTabWindowResize = () => {
    scheduleTabResize(currentTab(), {
      forceFullRender: true,
      hideUntilRender: true,
    });
  };

  const reassertTerminalSize = (session, { force = false } = {}) => {
    if (!session || session.closed) {
      return;
    }
    const now = performance.now();
    if (!force && now - Number(session.lastSizeReassertAt || 0) < terminalSizeReassertIntervalMs) {
      return;
    }
    session.lastSizeReassertAt = now;
    resizePane(session);
  };

  const reassertTerminalSizeForMouse = (session, event) => {
    if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent && event.pointerType && event.pointerType !== "mouse") {
      return;
    }
    reassertTerminalSize(session, { force: true });
  };

  const claimTerminalSizeForCurrentDevice = (pane) => {
    if (!pane || pane.closed) {
      return false;
    }
    const now = performance.now();
    const lastClaimAt = Number(pane.lastSizeClaimAt || 0);
    if (!pane.sizeClaimRequired && lastClaimAt > 0 && now - lastClaimAt < terminalSizeClaimIntervalMs) {
      return false;
    }
    if (!isPaneVisibleForSizing(pane)) {
      return claimTerminalSize(pane, { force: true });
    }
    const fit = resizePane(pane, {
      forceSizeSync: true,
      claimSize: true,
      settlePresentation: true,
    });
    if (!fit.ok) {
      return claimTerminalSize(pane, { force: true });
    }
    pane.lastSizeClaimAt = now;
    return true;
  };

  const resizeTabForCurrentDevice = (tab, options = {}) => {
    if (!tab) {
      return;
    }
    syncTabMobilePixelScroll(tab);
    scheduleTabResize(tab, options, { immediate: true });
  };

  const resizeActiveTabForCurrentDevice = (options = {}) => resizeTabForCurrentDevice(currentTab(), options);

  const installTerminalResizeObserver = (session) => {
    if (!session?.terminalHost || typeof ResizeObserver !== "function") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (session.closed || session.tabId !== activeTabId) {
        return;
      }
      const rect = session.terminalHost.getBoundingClientRect?.();
      const width = Math.max(0, Math.round(Number(rect?.width) || 0));
      const height = Math.max(0, Math.round(Number(rect?.height) || 0));
      const hadObservedGeometry = Number(session.lastObservedHostWidth || 0) > 0
        && Number(session.lastObservedHostHeight || 0) > 0;
      const geometryChanged = width !== Number(session.lastObservedHostWidth || 0)
        || height !== Number(session.lastObservedHostHeight || 0);
      session.lastObservedHostWidth = width;
      session.lastObservedHostHeight = height;
      schedulePaneResize(session, {
        forceFullRender: !panePresentationIsCurrent(session) || !session.hasPresentedFrame,
        hideUntilRender: !panePresentationIsCurrent(session),
        claimSize: hadObservedGeometry && geometryChanged,
      });
      schedulePanePresentationFrame(session, geometryChanged ? "resize_observer_geometry" : "resize_observer");
    });
    observer.observe(session.terminalHost);
    addSessionCleanup(session, () => {
      observer.disconnect();
      cancelScheduledPaneResize(session);
    });
  };

  const currentMobileViewportOrientation = () => {
    const type = String(window.screen?.orientation?.type || "").toLowerCase();
    if (type.startsWith("landscape")) {
      return "landscape";
    }
    if (type.startsWith("portrait")) {
      return "portrait";
    }
    const rawAngle = window.screen?.orientation?.angle ?? window.orientation;
    const angle = Number(rawAngle);
    if (Number.isFinite(angle)) {
      const normalized = ((Math.round(angle) % 360) + 360) % 360;
      if (normalized === 90 || normalized === 270) {
        return "landscape";
      }
      if (normalized === 0 || normalized === 180) {
        return "portrait";
      }
    }
    const screenWidth = Number(window.screen?.width) || 0;
    const screenHeight = Number(window.screen?.height) || 0;
    if (screenWidth > 0 && screenHeight > 0 && screenWidth !== screenHeight) {
      return screenWidth > screenHeight ? "landscape" : "portrait";
    }
    const visualViewport = window.visualViewport;
    const viewportWidth = Number(visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
    const viewportHeight = Number(visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    if (viewportWidth > 0 && viewportHeight > 0 && viewportWidth !== viewportHeight) {
      return viewportWidth > viewportHeight ? "landscape" : "portrait";
    }
    return "";
  };

  const rememberMobileViewportOrientationChange = () => {
    if (!isTouchShortcutLayout()) {
      return false;
    }
    const orientation = currentMobileViewportOrientation();
    if (!orientation) {
      return false;
    }
    if (!lastMobileViewportOrientation) {
      lastMobileViewportOrientation = orientation;
      return false;
    }
    if (lastMobileViewportOrientation === orientation) {
      return false;
    }
    lastMobileViewportOrientation = orientation;
    return true;
  };

  const runMobileOrientationViewportRecoveryPass = (seq) => {
    if (seq !== mobileOrientationRecoverySeq) {
      return;
    }
    syncMobileVisualViewport({ detectOrientation: false });
    resizeActiveTabForCurrentDevice();
    updateMobileActiveTabTitle();
    updateSelectionSheet();
  };

  const scheduleMobileOrientationViewportRecovery = () => {
    if (!isTouchShortcutLayout() || !currentTab()?.panes.size) {
      return;
    }
    mobileOrientationRecoverySeq += 1;
    const seq = mobileOrientationRecoverySeq;
    if (mobileOrientationRecoveryTimer) {
      window.clearTimeout(mobileOrientationRecoveryTimer);
      mobileOrientationRecoveryTimer = 0;
    }
    for (const delay of mobileOrientationViewportRecoveryDelays) {
      window.setTimeout(() => runMobileOrientationViewportRecoveryPass(seq), delay);
    }
    mobileOrientationRecoveryTimer = window.setTimeout(() => {
      if (seq !== mobileOrientationRecoverySeq) {
        return;
      }
      mobileOrientationRecoveryTimer = 0;
      runMobileOrientationViewportRecoveryPass(seq);
    }, mobileOrientationFinalSettleMs);
  };

  const handleMobileViewportResize = () => {
    mobileViewportResizeFrame = 0;
    if (isMobileKeyboardResizeSuppressed()) {
      syncActiveTerminalViewportForKeyboard();
      if (rememberMobileViewportOrientationChange() || mobileOrientationRecoveryTimer) {
        scheduleMobileOrientationViewportRecovery();
      }
      return;
    }
    resizeActiveTabForCurrentDevice();
    const session = activeSession();
    positionTerminalInput(session);
    syncTerminalViewportPan(session);
    updateMobileSelectionHandles(session);
    updateSelectionSheet();
    if (mobileActionSheet && !mobileActionSheet.hidden) {
      renderMobileActionSheet();
    }
    scheduleTabOverviewRender();
    if (rememberMobileViewportOrientationChange() || mobileOrientationRecoveryTimer) {
      scheduleMobileOrientationViewportRecovery();
    }
  };

  const scheduleMobileViewportResize = () => {
    if (mobileViewportResizeFrame) {
      return;
    }
    mobileViewportResizeFrame = window.requestAnimationFrame(handleMobileViewportResize);
  };

  const isTerminalTextareaFocused = () => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return false;
    }
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane?.term?.textarea === activeElement) {
          return true;
        }
      }
    }
    return false;
  };

  const measureMobileViewportBottomInset = () => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return 0;
    }
    const viewportOffsetTop = Math.max(0, Math.round(visualViewport.offsetTop || 0));
    return Math.max(0, Math.round((window.innerHeight || document.documentElement.clientHeight || 0) - visualViewport.height - viewportOffsetTop));
  };

  const forceClearMobileKeyboardDockIfTerminalBlurred = () => {
    if (!usesMobileViewportInsets() || isTerminalTextareaFocused()) {
      return false;
    }
    if (mobileKeyboardInsetBottom === 0 && mobileClientBottomSafeOffset === 0 && !mobileKeyboardViewportActive) {
      return false;
    }
    const measuredBottomInset = measureMobileViewportBottomInset();
    const nextSafeOffset = measuredBottomInset > 0 && measuredBottomInset <= mobileKeyboardInsetThresholdPx
      ? measuredBottomInset
      : 0;
    const changed = applyMobileViewportInsets(0, nextSafeOffset, { keyboardActive: false });
    if (changed) {
      scheduleMobileViewportResize();
    }
    return changed;
  };

  const runMobileKeyboardDismissRecoveryPass = (seq, { force = false } = {}) => {
    if (seq !== mobileKeyboardDismissRecoverySeq || !usesMobileViewportInsets()) {
      return;
    }
    syncMobileVisualViewport({ detectOrientation: false });
    if (force) {
      forceClearMobileKeyboardDockIfTerminalBlurred();
    }
  };

  const scheduleMobileKeyboardDismissRecovery = () => {
    if (!usesMobileViewportInsets()) {
      return;
    }
    mobileKeyboardDismissRecoverySeq += 1;
    const seq = mobileKeyboardDismissRecoverySeq;
    const lastDelay = mobileKeyboardDismissRecoveryDelays[mobileKeyboardDismissRecoveryDelays.length - 1] || 0;
    for (const delay of mobileKeyboardDismissRecoveryDelays) {
      window.setTimeout(
        () => runMobileKeyboardDismissRecoveryPass(seq, { force: delay === lastDelay }),
        delay,
      );
    }
  };

  const markMobileKeyboardDockMoving = () => {
    if (!document.body) {
      return;
    }
    document.body.classList.add("mobile-keyboard-dock-moving");
    if (mobileKeyboardDockMoveTimer) {
      window.clearTimeout(mobileKeyboardDockMoveTimer);
    }
    mobileKeyboardDockMoveTimer = window.setTimeout(() => {
      mobileKeyboardDockMoveTimer = 0;
      document.body?.classList.remove("mobile-keyboard-dock-moving");
    }, mobileKeyboardDockMoveSettleMs);
  };

  const syncMobileKeyboardDockTransform = (inset, safeOffset) => {
    if (!(mobileShortcuts instanceof HTMLElement)) {
      return;
    }
    if (inset > mobileKeyboardInsetThresholdPx) {
      mobileShortcuts.style.transform = `translate3d(0, -${inset}px, 0)`;
      return;
    }
    if (safeOffset > 0) {
      mobileShortcuts.style.transform = `translate3d(0, -${safeOffset}px, 0)`;
      return;
    }
    mobileShortcuts.style.transform = "";
  };

  const applyMobileViewportInsets = (nextInset, nextSafeOffset, { animateDock = true, keyboardActive = null } = {}) => {
    const inset = Math.max(0, Math.round(Number(nextInset) || 0));
    const safeOffset = Math.max(0, Math.round(Number(nextSafeOffset) || 0));
    const dockChanged = inset !== mobileKeyboardInsetBottom || safeOffset !== mobileClientBottomSafeOffset;
    const keyboardWasActive = mobileKeyboardViewportActive;
    const keyboardIsActive = keyboardActive === null ? inset > mobileKeyboardInsetThresholdPx : keyboardActive === true;
    if (keyboardWasActive || keyboardIsActive || dockChanged) {
      armMobileKeyboardResizeSuppression();
    }
    mobileKeyboardInsetBottom = inset;
    mobileClientBottomSafeOffset = safeOffset;
    mobileKeyboardViewportActive = keyboardIsActive;
    document.documentElement.style.setProperty("--mobile-keyboard-inset-bottom", `${inset}px`);
    document.documentElement.style.setProperty("--mobile-client-bottom-safe-offset", `${safeOffset}px`);
    document.body.classList.toggle("mobile-keyboard-visible", inset > mobileKeyboardInsetThresholdPx);
    syncMobileKeyboardDockTransform(inset, safeOffset);
    if (dockChanged && animateDock) {
      markMobileKeyboardDockMoving();
    }
    return dockChanged;
  };

  const syncMobileVisualViewport = ({ detectOrientation = true, ignoreTerminalInputLock = false } = {}) => {
    const supportsViewportInsets = usesMobileViewportInsets();
    const shouldResizeTerminal = supportsViewportInsets && isTouchShortcutLayout();
    const useKeyboardInset = isIOSPlatform();
    const visualViewport = window.visualViewport;
    const nextHeight = Math.max(0, Math.round(visualViewport?.height || window.innerHeight || 0));
    const orientationChanged = detectOrientation && rememberMobileViewportOrientationChange();
    const shouldRecoverOrientation = orientationChanged || (detectOrientation && mobileOrientationRecoveryTimer);
    if (orientationChanged && terminalInputViewportLockSession) {
      terminalInputViewportLockSession.terminalInputAnchor = null;
      releaseTerminalInputViewportLock(terminalInputViewportLockSession, { resync: false });
    }
    let inputLock = ignoreTerminalInputLock ? null : activeTerminalInputViewportLock();
    const lockedViewportBottomInset = inputLock ? measureMobileViewportBottomInset() : 0;
    const keyboardOpenedAfterLock = Boolean(
      inputLock
      && !inputLock.keyboardActive
      && document.activeElement === inputLock.session?.term?.textarea
      && (
        Number(inputLock.viewportHeight || 0) - nextHeight > mobileKeyboardInsetThresholdPx
        || lockedViewportBottomInset > mobileKeyboardInsetThresholdPx
      )
    );
    if (keyboardOpenedAfterLock) {
      const promotedKeyboardInset = useKeyboardInset ? lockedViewportBottomInset : 0;
      const promotedSafeOffset = promotedKeyboardInset === 0
        && lockedViewportBottomInset > 0
        && lockedViewportBottomInset <= mobileKeyboardInsetThresholdPx
        ? lockedViewportBottomInset
        : 0;
      inputLock.session.inputViewportLock = {
        ...inputLock.session.inputViewportLock,
        viewportHeight: nextHeight,
        keyboardInsetBottom: promotedKeyboardInset,
        clientBottomSafeOffset: promotedSafeOffset,
        keyboardActive: true,
      };
      inputLock = { session: inputLock.session, ...inputLock.session.inputViewportLock };
    }
    if (
      inputLock?.keyboardActive
      && nextHeight - inputLock.viewportHeight > mobileKeyboardInsetThresholdPx
      && lockedViewportBottomInset <= mobileKeyboardInsetThresholdPx
    ) {
      releaseTerminalInputViewportLock(inputLock.session, { resync: false });
      inputLock = null;
    }
    const appliedHeight = inputLock?.viewportHeight || nextHeight;
    if (appliedHeight > 0) {
      document.documentElement.style.setProperty("--mobile-visual-viewport-height", `${appliedHeight}px`);
    }
    if (inputLock && !orientationChanged) {
      mobileViewportHeight = inputLock.viewportHeight;
      mobileViewportReferenceHeight = inputLock.referenceHeight;
      if (
        mobileKeyboardInsetBottom !== inputLock.keyboardInsetBottom
        || mobileClientBottomSafeOffset !== inputLock.clientBottomSafeOffset
        || mobileKeyboardViewportActive !== inputLock.keyboardActive
      ) {
        applyMobileViewportInsets(
          inputLock.keyboardInsetBottom,
          inputLock.clientBottomSafeOffset,
          { animateDock: false, keyboardActive: inputLock.keyboardActive },
        );
      }
      syncTerminalViewportPan(inputLock.session);
      return;
    }
    if (orientationChanged && nextHeight > 0) {
      mobileViewportReferenceHeight = nextHeight;
    }
    if (!supportsViewportInsets) {
      const previousHeight = mobileViewportHeight;
      const insetChanged = mobileKeyboardInsetBottom !== 0;
      const safeOffsetChanged = mobileClientBottomSafeOffset !== 0;
      const heightChanged = nextHeight !== mobileViewportHeight;
      const keyboardLikeHeightChange = isKeyboardLikeViewportHeightChange(previousHeight, nextHeight, { orientationChanged });
      mobileViewportHeight = nextHeight;
      mobileViewportReferenceHeight = nextHeight;
      applyMobileViewportInsets(0, 0, { animateDock: false, keyboardActive: keyboardLikeHeightChange && nextHeight < previousHeight });
      if (keyboardLikeHeightChange) {
        armMobileKeyboardResizeSuppression();
      }
      if (shouldResizeTerminal && (heightChanged || insetChanged || safeOffsetChanged)) {
        scheduleMobileViewportResize();
      }
      if (shouldRecoverOrientation) {
        scheduleMobileOrientationViewportRecovery();
      }
      return;
    }
    const viewportOffsetTop = Math.max(0, Math.round(visualViewport?.offsetTop || 0));
    const measuredBottomInset = measureMobileViewportBottomInset();
    const measuredReferenceInset = visualViewport
      ? Math.max(0, Math.round((mobileViewportReferenceHeight || nextHeight) - visualViewport.height - viewportOffsetTop))
      : 0;
    const shouldTrustReferenceInset = isTouchShortcutLayout() && (
      isTerminalTextareaFocused()
      || (mobileKeyboardViewportActive && measuredBottomInset > mobileKeyboardInsetThresholdPx)
    );
    const measuredInset = Math.max(measuredBottomInset, shouldTrustReferenceInset ? measuredReferenceInset : 0);
    const nextKeyboardActive = measuredInset > mobileKeyboardInsetThresholdPx && !orientationChanged && isTouchShortcutLayout();
    const nextInset = useKeyboardInset && measuredInset > mobileKeyboardInsetThresholdPx ? measuredInset : 0;
    const nextSafeOffset = nextInset === 0 && measuredBottomInset > 0 && measuredBottomInset <= mobileKeyboardInsetThresholdPx
      ? measuredBottomInset
      : 0;
    const heightChanged = nextHeight !== mobileViewportHeight;
    const insetChanged = nextInset !== mobileKeyboardInsetBottom;
    const safeOffsetChanged = nextSafeOffset !== mobileClientBottomSafeOffset;
    if (nextInset === 0 && nextHeight > 0 && (orientationChanged || nextHeight > mobileViewportReferenceHeight)) {
      mobileViewportReferenceHeight = nextHeight;
    }
    mobileViewportHeight = nextHeight;
    applyMobileViewportInsets(nextInset, nextSafeOffset, { keyboardActive: nextKeyboardActive });
    if (heightChanged && !orientationChanged && isTouchShortcutLayout() && (nextKeyboardActive || mobileKeyboardViewportActive)) {
      armMobileKeyboardResizeSuppression();
    }
    if (shouldResizeTerminal && (heightChanged || insetChanged || safeOffsetChanged)) {
      scheduleMobileViewportResize();
    }
    if (shouldRecoverOrientation) {
      scheduleMobileOrientationViewportRecovery();
    }
  };

  const handleMobileOrientationChange = () => {
    syncMobileVisualViewport();
    rememberMobileViewportOrientationChange();
    scheduleMobileOrientationViewportRecovery();
  };

  const activeSession = () => {
    const tab = currentTab();
    return tab?.panes.get(tab.activePaneId) || null;
  };

  const refreshTerminalMetrics = (session, { deferFitRetry = false, claimSize = false } = {}) => {
    if (!session?.term) {
      return;
    }
    const metricsGeneration = Number(session.fontMetricsGeneration || 0) + 1;
    session.fontMetricsGeneration = metricsGeneration;
    const refresh = (forceSizeSync = false) => {
      if (session.closed || Number(session.fontMetricsGeneration || 0) !== metricsGeneration) {
        return;
      }
      try {
        installRendererBaselinePatch(session);
        if (session.term.renderer && typeof session.term.renderer.measureFont === "function") {
          session.term.renderer.metrics = session.term.renderer.measureFont();
        }
        cancelPendingTerminalRender(session.term);
        resizePane(session, {
          settlePresentation: true,
          forceFullRender: true,
          hideUntilRender: true,
          forceSizeSync,
          claimSize,
        });
      } catch (error) {
        console.warn("[terminal-font] failed to refresh terminal metrics", error);
      }
    };
    beginTerminalPresentationHold(session);
    refresh(false);
    if (deferFitRetry) {
      window.requestAnimationFrame(() => refresh(true));
      window.setTimeout(() => refresh(true), 80);
      window.setTimeout(() => refresh(true), 240);
    }
  };

  const setTerminalFontSize = (size) => {
    terminalFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.round(size)));
    terminalOptionsBase.fontSize = terminalFontSize;
    window.localStorage.setItem(fontSizeVersionStorageKey, fontSizeStorageVersion);
    window.localStorage.setItem(fontSizeStorageKey, String(terminalFontSize));
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        beginTerminalPresentationHold(pane);
        pane.term.options.fontSize = terminalFontSize;
        refreshTerminalMetrics(pane, { deferFitRetry: true, claimSize: true });
      }
    }
    showToast(`字号 ${terminalFontSize}px`);
  };

  const adjustTerminalFontSize = (delta) => setTerminalFontSize(terminalFontSize + delta);
  const resetTerminalFontSize = () => setTerminalFontSize(defaultFontSize);

  const lineToTextAndMap = (line, { trimEnd = false } = {}) => {
    const length = Number(line?.length || 0);
    let text = "";
    const map = [];
    for (let col = 0; col < length; col += 1) {
      const cell = line.getCell(col);
      let chars = cell?.getChars?.() || "";
      if (!chars) {
        if (cell?.getWidth?.() === 0) {
          continue;
        }
        chars = " ";
      }
      for (let index = 0; index < chars.length; index += 1) {
        map.push(col);
      }
      text += chars;
    }
    if (trimEnd) {
      const trimmed = text.trimEnd();
      return { text: trimmed, map: map.slice(0, trimmed.length) };
    }
    return { text, map };
  };

  const buildLogicalLines = (term) => {
    const buffer = term?.buffer?.active;
    const length = Number(buffer?.length || 0);
    const scrollback = term?.wasmTerm?.getScrollbackLength?.() || Math.max(0, length - (term?.rows || 0));
    const logicalLines = [];
    let current = null;
    for (let row = 0; row < length; row += 1) {
      const line = buffer.getLine(row);
      if (!line) {
        continue;
      }
      if (!current) {
        current = { text: "", positions: [], startRow: row, endRow: row };
      }
      const raw = lineToTextAndMap(line, { trimEnd: false });
      const rawTrimmedLength = raw.text.trimEnd().length;
      const wrapped = Boolean(line.isWrapped) || (row < scrollback && rawTrimmedLength >= Math.max(1, term?.cols || line.length));
      const { text, map } = wrapped ? raw : lineToTextAndMap(line, { trimEnd: true });
      for (let index = 0; index < text.length; index += 1) {
        current.positions.push({ row, col: map[index] ?? index });
      }
      current.text += text;
      current.endRow = row;
      if (!wrapped) {
        logicalLines.push(current);
        current = null;
      }
    }
    if (current) {
      current.text = current.text.trimEnd();
      current.positions = current.positions.slice(0, current.text.length);
      logicalLines.push(current);
    }
    return logicalLines;
  };

  const fullBufferText = (term) => buildLogicalLines(term).map((line) => line.text).join("\n");

  const terminalSelectionRange = (manager) => {
    if (!manager?.selectionStart || !manager?.selectionEnd) {
      return null;
    }
    let startCol = Number(manager.selectionStart.col);
    let startRow = Number(manager.selectionStart.absoluteRow);
    let endCol = Number(manager.selectionEnd.col);
    let endRow = Number(manager.selectionEnd.absoluteRow);
    if (![startCol, startRow, endCol, endRow].every(Number.isFinite)) {
      return null;
    }
    startCol = Math.max(0, Math.floor(startCol));
    startRow = Math.max(0, Math.floor(startRow));
    endCol = Math.max(0, Math.floor(endCol));
    endRow = Math.max(0, Math.floor(endRow));
    if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
      [startCol, endCol] = [endCol, startCol];
      [startRow, endRow] = [endRow, startRow];
    }
    return { startCol, startRow, endCol, endRow };
  };

  const terminalSelectionLineAt = (manager, absoluteRow, scrollback) => {
    if (!manager?.wasmTerm || absoluteRow < 0) {
      return null;
    }
    return absoluteRow < scrollback
      ? manager.wasmTerm.getScrollbackLine?.(absoluteRow) || null
      : manager.wasmTerm.getLine?.(absoluteRow - scrollback) || null;
  };

  const terminalSelectionCodepointText = (codepoint) => {
    const value = Number(codepoint || 0);
    if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
      return "";
    }
    return String.fromCodePoint(value);
  };

  const terminalSelectionCellText = (manager, cell, absoluteRow, column, scrollback) => {
    if (!cell) {
      return { text: " ", content: false };
    }
    if (Number(cell?.width ?? 1) === 0) {
      return { text: "", content: false };
    }
    if (!cell.codepoint) {
      return { text: " ", content: false };
    }
    const text = cell.grapheme_len > 0
      ? (absoluteRow < scrollback
        ? manager.wasmTerm?.getScrollbackGraphemeString?.(absoluteRow, column)
        : manager.wasmTerm?.getGraphemeString?.(absoluteRow - scrollback, column))
      : terminalSelectionCodepointText(cell.codepoint);
    if (!text) {
      return { text: " ", content: false };
    }
    return { text, content: Boolean(text.trim()) };
  };

  const terminalSelectionText = (manager) => {
    const range = terminalSelectionRange(manager);
    if (!range || !manager?.wasmTerm) {
      return "";
    }
    const scrollback = Math.max(0, Math.floor(manager.wasmTerm.getScrollbackLength?.() || 0));
    let text = "";
    for (let absoluteRow = range.startRow; absoluteRow <= range.endRow; absoluteRow += 1) {
      const line = terminalSelectionLineAt(manager, absoluteRow, scrollback);
      if (!line) {
        continue;
      }
      const startCol = absoluteRow === range.startRow ? range.startCol : 0;
      const endCol = absoluteRow === range.endRow ? range.endCol : Math.max(0, line.length - 1);
      let lineText = "";
      let lastContentLength = -1;
      for (let column = startCol; column <= endCol; column += 1) {
        const cellText = terminalSelectionCellText(manager, line[column], absoluteRow, column, scrollback);
        lineText += cellText.text;
        if (cellText.content) {
          lastContentLength = lineText.length;
        }
      }
      lineText = lastContentLength >= 0 ? lineText.substring(0, lastContentLength) : "";
      text += lineText;
      if (absoluteRow < range.endRow) {
        text += "\n";
      }
    }
    return text;
  };

  const copyText = async (text) => {
    if (!text) {
      return false;
    }
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }
    return copied;
  };

  const readClipboardText = async () => {
    if (!navigator.clipboard?.readText || !window.isSecureContext) {
      throw new Error("当前浏览器环境无法读取剪贴板。");
    }
    try {
      return await navigator.clipboard.readText();
    } catch (error) {
      const name = String(error?.name || "");
      const message = String(error?.message || "");
      if (
        name === "NotAllowedError" ||
        name === "SecurityError" ||
        /permissions[- ]policy|clipboard-read|read permission|not allowed/i.test(message)
      ) {
        throw new Error("当前页面策略禁止主动读取剪贴板，请使用系统粘贴快捷键。");
      }
      throw error;
    }
  };

  const fileExtensionFromType = (type) => {
    const mime = String(type || "").toLowerCase();
    switch (mime) {
      case "image/png":
        return ".png";
      case "image/jpeg":
        return ".jpg";
      case "image/gif":
        return ".gif";
      case "image/webp":
        return ".webp";
      case "text/html":
        return ".html";
      case "application/json":
        return ".json";
      default:
        if (mime.startsWith("text/")) {
          return ".txt";
        }
        return "";
    }
  };

  const clipboardFileName = (blob, index) => {
    const ext = fileExtensionFromType(blob?.type) || ".bin";
    return `clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}-${index + 1}${ext}`;
  };

  const readClipboardFiles = async () => {
    const files = [];
    if (navigator.clipboard?.read && window.isSecureContext) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items || []) {
          const types = Array.from(item?.types || []);
          const fileTypes = types.filter((type) => !String(type).startsWith("text/"));
          for (const type of fileTypes) {
            const blob = await item.getType(type);
            if (!blob || blob.size <= 0) {
              continue;
            }
            const name = clipboardFileName(blob, files.length);
            files.push(new File([blob], name, { type: blob.type || type }));
          }
        }
      } catch {
      }
    }
    if (files.length > 0) {
      return files;
    }
    const text = await readClipboardText();
    if (!text) {
      throw new Error("剪贴板没有可导入的内容。");
    }
    return [new File([text], `clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`, { type: "text/plain;charset=utf-8" })];
  };

  const selectedTextFromSession = (session = activeSession()) => {
    if (!session?.term) {
      return "";
    }
    return session.selectAllBufferActive ? fullBufferText(session.term) : session.term.getSelection?.() || "";
  };

  const copyFromSession = async (session = activeSession()) => {
    if (!session?.term) {
      return;
    }
    const text = selectedTextFromSession(session);
    if (session.selectAllBufferActive) {
      session.selectAllBufferActive = false;
    }
    if (!text) {
      showToast("没有可复制的选区。");
      return;
    }
    if (await copyText(text)) {
      showToast("已复制。");
      session.term.clearSelection?.();
      updateSelectionSheet();
    } else {
      showToast("复制失败。");
    }
  };

  const pasteIntoSession = async (session = activeSession(), text = null) => {
    if (!session?.term) {
      return;
    }
    try {
      const value = text === null ? await readClipboardText() : text;
      if (value) {
        const bracketed = session.term.wasmTerm?.hasBracketedPaste?.() === true;
        const data = bracketed ? `\x1b[200~${value}\x1b[201~` : value;
        sendOrQueueInput(session, data);
      }
    } catch (error) {
      showToast(error.message || "粘贴失败。");
    }
  };

  const addSessionCleanup = (session, cleanup) => {
    if (!session || typeof cleanup !== "function") {
      return;
    }
    if (!Array.isArray(session.cleanupCallbacks)) {
      session.cleanupCallbacks = [];
    }
    session.cleanupCallbacks.push(cleanup);
  };

  const runSessionCleanups = (session) => {
    if (!session) {
      return;
    }
    const callbacks = Array.isArray(session?.cleanupCallbacks) ? session.cleanupCallbacks : [];
    session.cleanupCallbacks = [];
    for (const cleanup of callbacks) {
      try {
        cleanup();
      } catch (error) {
      }
    }
  };

  const copyCurrentMouseSelection = async (session) => {
    const text = session?.term?.getSelection?.() || "";
    if (!text) {
      return;
    }
    try {
      const copied = await copyText(text);
      if (!copied) {
        console.warn("Terminal selection copy failed.");
      }
    } catch (error) {
      console.warn("Terminal selection copy failed.", error);
    }
  };

  const readClipboardTextSilently = async () => {
    try {
      return await readClipboardText();
    } catch (error) {
      return "";
    }
  };

  const installSelectionManagerCopyPatch = (session) => {
    const manager = session?.term?.selectionManager;
    if (!manager || manager.webshellSelectionCopyPatched) {
      return;
    }
    manager.webshellSelectionCopyPatched = true;
    manager.webshellOriginalGetSelection = manager.getSelection;
    manager.getSelection = function (...args) {
      try {
        return terminalSelectionText(this);
      } catch (error) {
        return this.webshellOriginalGetSelection?.apply(this, args) || "";
      }
    };
  };

  const installSelectionManagerStringDoubleClickPatch = (session) => {
    const manager = session?.term?.selectionManager;
    if (!manager || manager.webshellStringDoubleClickPatched) {
      return;
    }
    manager.webshellStringDoubleClickPatched = true;
    manager.webshellOriginalHasSelection = manager.hasSelection;
    manager.webshellOriginalClearSelection = manager.clearSelection;
    manager.hasSelection = function (...args) {
      if (this.webshellForceSelection && this.selectionStart && this.selectionEnd) {
        return true;
      }
      return this.webshellOriginalHasSelection.apply(this, args);
    };
    manager.clearSelection = function (...args) {
      const result = this.webshellOriginalClearSelection.apply(this, args);
      this.webshellForceSelection = false;
      return result;
    };
    const canvas = session?.term?.canvas || session?.term?.renderer?.getCanvas?.();
    if (!canvas) {
      return;
    }

    const isStringCell = (cell) => {
      if (!cell || cell.codepoint === 0) {
        return false;
      }
      return /\S/.test(String.fromCodePoint(cell.codepoint));
    };
    const lineAtAbsoluteRow = (absoluteRow) => {
      const scrollback = manager.wasmTerm?.getScrollbackLength?.() || 0;
      return absoluteRow < scrollback
        ? manager.wasmTerm?.getScrollbackLine?.(absoluteRow)
        : manager.wasmTerm?.getLine?.(absoluteRow - scrollback);
    };
    const stringAtCell = (col, row) => {
      const absoluteRow = manager.viewportRowToAbsolute?.(row);
      if (typeof absoluteRow !== "number") {
        return null;
      }
      const line = lineAtAbsoluteRow(absoluteRow);
      if (!line || !isStringCell(line[col])) {
        return null;
      }
      let startCol = col;
      while (startCol > 0 && isStringCell(line[startCol - 1])) {
        startCol -= 1;
      }
      let endCol = col;
      while (endCol < line.length - 1 && isStringCell(line[endCol + 1])) {
        endCol += 1;
      }
      return { startCol, endCol, absoluteRow };
    };
    const handleDoubleClick = (event) => {
      if (event.button !== 0 || isMobileLayout() || session.closed) {
        return;
      }
      const cell = manager.pixelToCell?.(event.offsetX, event.offsetY);
      const stringRange = cell ? stringAtCell(cell.col, cell.row) : null;
      if (!stringRange) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      session.selectAllBufferActive = false;
      manager.markCurrentSelectionDirty?.();
      manager.selectionStart = { col: stringRange.startCol, absoluteRow: stringRange.absoluteRow };
      manager.selectionEnd = { col: stringRange.endCol, absoluteRow: stringRange.absoluteRow };
      manager.isSelecting = false;
      manager.webshellForceSelection = true;
      manager.markCurrentSelectionDirty?.();
      renderTerminalSelection(session);
      emitTerminalSelectionChange(session);
      if (desktopMouseClipboardEnabled) {
        window.setTimeout(() => copyCurrentMouseSelection(session), 0);
      }
    };
    canvas.addEventListener("dblclick", handleDoubleClick, { capture: true });
    addSessionCleanup(session, () => canvas.removeEventListener("dblclick", handleDoubleClick, { capture: true }));
  };

  const disableSelectionManagerAutoCopy = (session) => {
    const manager = session?.term?.selectionManager;
    if (!manager) {
      return;
    }
    installSelectionManagerCopyPatch(session);
    installSelectionManagerStringDoubleClickPatch(session);
    if (manager.webshellAutoCopyDisabled) {
      return;
    }
    manager.webshellAutoCopyDisabled = true;
    manager.webshellOriginalCopyToClipboard = manager.copyToClipboard;
    manager.copyToClipboard = async () => {};
  };

  const installDesktopMouseClipboard = (session) => {
    const shell = session?.shellEl;
    const host = session?.terminalHost;
    const term = session?.term;
    if (!shell || !host || !term) {
      return;
    }
    disableSelectionManagerAutoCopy(session);

    let selectionDrag = null;
    const isTerminalMouseTarget = (target) => target instanceof Element && target.closest(".terminal-host") === host;
    const activateSessionPane = () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    };

    const handleMouseDown = (event) => {
      if (event.button === 1 && isTerminalMouseTarget(event.target)) {
        if (desktopMouseClipboardEnabled) {
          event.preventDefault();
          activateSessionPane();
        }
        return;
      }
      if (!desktopMouseClipboardEnabled || event.button !== 0 || isMobileLayout() || !isTerminalMouseTarget(event.target)) {
        selectionDrag = null;
        return;
      }
      session.selectAllBufferActive = false;
      selectionDrag = {
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    };

    const handleMouseMove = (event) => {
      if (!selectionDrag) {
        return;
      }
      const distance = Math.hypot(event.clientX - selectionDrag.startX, event.clientY - selectionDrag.startY);
      if (distance >= desktopSelectionCopyMoveThresholdPx) {
        selectionDrag.moved = true;
      }
    };

    const handleMouseUp = (event) => {
      const drag = selectionDrag;
      selectionDrag = null;
      if (!desktopMouseClipboardEnabled || !drag || event.button !== 0 || isMobileLayout() || !drag.moved) {
        return;
      }
      if (!session.closed) {
        copyCurrentMouseSelection(session);
      }
    };

    const handleAuxClick = async (event) => {
      if (!desktopMouseClipboardEnabled || event.button !== 1 || !isTerminalMouseTarget(event.target)) {
        return;
      }
      event.preventDefault();
      activateSessionPane();
      reassertTerminalSize(session, { force: true });
      const text = await readClipboardTextSilently();
      if (text && !session.closed) {
        pasteIntoSession(session, text).catch(() => {});
      }
    };

    shell.addEventListener("mousedown", handleMouseDown, { capture: true });
    shell.addEventListener("auxclick", handleAuxClick);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    addSessionCleanup(session, () => {
      shell.removeEventListener("mousedown", handleMouseDown, { capture: true });
      shell.removeEventListener("auxclick", handleAuxClick);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    });
  };

  const selectAllSessionBuffer = (session = activeSession()) => {
    if (!session?.term) {
      return;
    }
    session.selectAllBufferActive = true;
    session.term.selectLines?.(0, Math.max(0, session.term.rows - 1));
    updateSelectionSheet();
    showToast("已选中完整终端缓冲区。");
  };

  const scrollToAbsoluteRow = (term, absoluteRow, preferredViewportRow = 2) => {
    const scrollback = term.wasmTerm?.getScrollbackLength?.() || 0;
    const viewportY = Math.max(0, Math.min(scrollback, scrollback + preferredViewportRow - absoluteRow));
    term.scrollToLine?.(viewportY);
    return Math.max(0, Math.min(term.rows - 1, absoluteRow - scrollback + Math.floor(term.getViewportY?.() || term.viewportY || 0)));
  };

  const updateSearchCount = () => {
    if (!searchCount) {
      return;
    }
    if (!searchState.query) {
      searchCount.textContent = "0/0";
      return;
    }
    searchCount.textContent = searchState.matches.length > 0 ? `${searchState.index + 1}/${searchState.matches.length}` : "0/0";
  };

  const selectSearchMatch = () => {
    const session = activeSession();
    const match = searchState.matches[searchState.index];
    if (!session?.term || !match) {
      updateSearchCount();
      return;
    }
    const viewportRow = scrollToAbsoluteRow(session.term, match.row);
    session.term.select(match.col, viewportRow, Math.max(1, match.length));
    updateSearchCount();
  };

  const rebuildSearchMatches = () => {
    const session = activeSession();
    searchState.matches = [];
    searchState.index = -1;
    searchState.sessionId = session?.id || "";
    const query = searchState.query;
    if (!session?.term || !query) {
      updateSearchCount();
      return;
    }
    const queryLower = query.toLowerCase();
    for (const logical of buildLogicalLines(session.term)) {
      const textLower = logical.text.toLowerCase();
      let offset = textLower.indexOf(queryLower);
      while (offset >= 0) {
        const position = logical.positions[offset];
        if (position) {
          searchState.matches.push({
            row: position.row,
            col: position.col,
            length: query.length,
          });
        }
        offset = textLower.indexOf(queryLower, offset + Math.max(1, queryLower.length));
      }
    }
    searchState.index = searchState.matches.length > 0 ? 0 : -1;
    selectSearchMatch();
    updateSearchCount();
  };

  const setSearchQuery = (value) => {
    searchState.query = String(value || "");
    rebuildSearchMatches();
  };

  const openSearch = () => {
    if (!searchPanel || !searchInput) {
      return;
    }
    closeContextMenu();
    searchState.open = true;
    searchPanel.hidden = false;
    searchInput.value = searchState.query;
    renderAttachmentUploadsForActiveTab();
    window.setTimeout(() => {
      searchInput.focus();
      searchInput.select();
    }, 0);
    rebuildSearchMatches();
  };

  const closeSearch = () => {
    searchState.open = false;
    if (searchPanel) {
      searchPanel.hidden = true;
    }
    renderAttachmentUploadsForActiveTab();
    activeSession()?.term?.focus();
  };

  const moveSearchResult = (delta) => {
    if (searchState.matches.length === 0) {
      return;
    }
    searchState.index = (searchState.index + delta + searchState.matches.length) % searchState.matches.length;
    selectSearchMatch();
  };

  const openSearchFromSelection = (session = activeSession()) => {
    const query = selectedTextFromSession(session).replace(/\s+/g, " ").trim().slice(0, 200);
    if (!query) {
      showToast("没有可搜索的选区。");
      return;
    }
    openSearch();
    setSearchQuery(query);
    if (searchInput) {
      searchInput.value = query;
      searchInput.select();
    }
  };

  const logicalLineAt = (term, absoluteRow) => buildLogicalLines(term).find((line) => line.startRow <= absoluteRow && line.endRow >= absoluteRow) || null;

  const findURLAtPosition = (session, clientX, clientY) => {
    const term = session?.term;
    const renderer = term?.renderer;
    const canvas = term?.canvas || term?.element?.querySelector?.("canvas");
    if (!term || !renderer || !canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left) / (renderer.charWidth || renderer.getMetrics?.().width || 10));
    const viewportRow = Math.floor((clientY - rect.top) / (renderer.charHeight || renderer.getMetrics?.().height || 18));
    if (viewportRow < 0 || viewportRow >= term.rows) {
      return null;
    }
    const scrollback = term.wasmTerm?.getScrollbackLength?.() || 0;
    const absoluteRow = scrollback + viewportRow - Math.floor(term.getViewportY?.() || term.viewportY || 0);
    const logical = logicalLineAt(term, absoluteRow);
    if (!logical) {
      return null;
    }
    urlPattern.lastIndex = 0;
    let match = urlPattern.exec(logical.text);
    while (match) {
      let url = match[0].replace(trailingURLPunctuation, "");
      const start = match.index;
      const end = start + url.length - 1;
      const startPosition = logical.positions[start];
      const endPosition = logical.positions[end];
      const pointerIndex = logical.positions.findIndex((position) => position.row === absoluteRow && position.col === col);
      if (url.length > 0 && pointerIndex >= start && pointerIndex <= end && startPosition && endPosition) {
        return { url, start: startPosition, end: endPosition };
      }
      match = urlPattern.exec(logical.text);
    }
    return null;
  };

  const terminalCellFromPoint = (session, clientX, clientY) => {
    const term = session?.term;
    const renderer = term?.renderer;
    const canvas = term?.canvas || term?.element?.querySelector?.("canvas");
    const metrics = renderer?.getMetrics?.();
    if (!term || !renderer || !canvas || !metrics?.width || !metrics?.height) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(clientX, rect.right - 1));
    const y = Math.max(rect.top, Math.min(clientY, rect.bottom - 1));
    const col = Math.max(0, Math.min(term.cols - 1, Math.floor((x - rect.left) / metrics.width)));
    const row = Math.max(0, Math.min(term.rows - 1, Math.floor((y - rect.top) / metrics.height)));
    const scrollback = term.wasmTerm?.getScrollbackLength?.() || 0;
    const viewportY = Math.floor(term.getViewportY?.() || term.viewportY || 0);
    return { col, row, absoluteRow: scrollback + row - viewportY };
  };

  const stripTerminalCommandTokenQuotes = (value) => {
    const token = String(value || "").trim();
    if (token.length < 2) {
      return token;
    }
    const quote = token[0];
    return (quote === "\"" || quote === "'") && token[token.length - 1] === quote
      ? token.slice(1, -1)
      : token;
  };

  const terminalCommandLineTokens = (value) => (
    String(value || "").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
  ).map(stripTerminalCommandTokenQuotes);

  const terminalExecutableName = (value) => {
    const normalized = stripTerminalCommandTokenQuotes(value).replace(/\\/g, "/");
    return normalized.slice(normalized.lastIndexOf("/") + 1);
  };

  const grokExecutableNamePattern = /^grok(?:-\d+(?:\.\d+){1,3})?$/i;

  const isGrokExecutableToken = (value) => grokExecutableNamePattern.test(terminalExecutableName(value));

  const isOfficialGrokEntrypoint = (value) => {
    const normalized = stripTerminalCommandTokenQuotes(value).replace(/\\/g, "/");
    return isGrokExecutableToken(normalized) || /(?:^|\/)@xai-official\/grok(?:\/|$)/i.test(normalized);
  };

  const isGrokTerminalSession = (session) => {
    if (isGrokExecutableToken(session?.command)) {
      return true;
    }
    const commandTokens = terminalCommandLineTokens(session?.processCommandLine);
    if (isOfficialGrokEntrypoint(commandTokens[0])) {
      return true;
    }
    const launcher = terminalExecutableName(commandTokens[0]).toLowerCase();
    if (["node", "nodejs", "bun", "deno"].includes(launcher) && isOfficialGrokEntrypoint(commandTokens[1])) {
      return true;
    }
    return String(session?.title || "").trim().toLowerCase() === "grok";
  };

  const terminalMouseModeEnabled = (term, mode) => {
    try {
      return typeof term?.getMode === "function" && term.getMode(mode, false) === true;
    } catch (error) {
      return false;
    }
  };

  const terminalMouseTrackingState = (session) => {
    const term = session?.term;
    if (!term || session?.closed) {
      return null;
    }
    const x10 = terminalMouseModeEnabled(term, 9);
    const normal = terminalMouseModeEnabled(term, 1000);
    const drag = terminalMouseModeEnabled(term, 1002);
    const any = terminalMouseModeEnabled(term, 1003);
    let tracking = x10 || normal || drag || any;
    try {
      tracking = tracking || term.hasMouseTracking?.() === true;
    } catch (error) {
    }
    if (!tracking) {
      return null;
    }
    return {
      x10,
      normal,
      drag,
      any,
      sgr: terminalMouseModeEnabled(term, 1006),
    };
  };

  const isClaudeFullscreenTouchSession = (session) => (
    isClaudeFullscreenTouchCandidate(session, {
      mouseTracking: Boolean(terminalMouseTrackingState(session)),
    })
  );

  const isClaudeFullscreenContextMenuEvent = (session, event) => (
    isClaudeFullscreenContextMenuCandidate(session, {
      mouseTracking: Boolean(terminalMouseTrackingState(session)),
      button: event?.button,
      contextMenuSuppressed: shouldSuppressTerminalContextMenu(event),
    })
  );

  const isClaudeFullscreenDesktopSelectionEvent = (session, event) => (
    isClaudeFullscreenDesktopSelectionCandidate(session, {
      mouseTracking: Boolean(terminalMouseTrackingState(session)),
      button: event?.button,
      touchSelectionLayout: isTouchSelectionLayout(),
      applicationModifier: Boolean(event?.ctrlKey || event?.altKey || event?.metaKey),
    })
  );

  const terminalMouseButtonFromEvent = (event) => {
    switch (event?.button) {
      case 0:
        return 0;
      case 1:
        return 1;
      case 2:
        return 2;
      default:
        return -1;
    }
  };

  const terminalMouseButtonMask = (button) => {
    switch (button) {
      case 0:
        return 1;
      case 1:
        return 4;
      case 2:
        return 2;
      default:
        return 0;
    }
  };

  const terminalMouseButtonFromButtons = (buttons, preferred = -1) => {
    const mask = Number(buttons || 0);
    if (preferred >= 0 && (mask & terminalMouseButtonMask(preferred))) {
      return preferred;
    }
    if (mask & 1) {
      return 0;
    }
    if (mask & 4) {
      return 1;
    }
    if (mask & 2) {
      return 2;
    }
    return -1;
  };

  const terminalMouseModifierCode = (event) => (
    (event?.shiftKey ? 4 : 0)
    | (event?.altKey ? 8 : 0)
    | (event?.ctrlKey ? 16 : 0)
  );

  const encodeTerminalLegacyMouseSequence = (buttonCode, x, y) => {
    if (
      buttonCode < 0
      || buttonCode > terminalMouseLegacyCoordinateLimit
      || x < 1
      || y < 1
      || x > terminalMouseLegacyCoordinateLimit
      || y > terminalMouseLegacyCoordinateLimit
    ) {
      return "";
    }
    return `\x1b[M${String.fromCharCode(buttonCode + 32)}${String.fromCharCode(x + 32)}${String.fromCharCode(y + 32)}`;
  };

  const encodeTerminalMouseSequence = (session, event, action, button = -1) => {
    const state = terminalMouseTrackingState(session);
    if (!state) {
      return "";
    }
    const cell = terminalCellFromPoint(session, event.clientX, event.clientY);
    if (!cell) {
      return "";
    }
    const x = cell.col + 1;
    const y = cell.row + 1;
    const modifiers = terminalMouseModifierCode(event);
    let buttonCode = -1;
    let suffix = "M";

    if (action === "press") {
      if (button < 0) {
        return "";
      }
      buttonCode = button;
    } else if (action === "release") {
      if (state.x10 && !state.normal && !state.drag && !state.any) {
        return "";
      }
      if (state.sgr) {
        buttonCode = button >= 0 ? button : 0;
        suffix = "m";
      } else {
        buttonCode = 3;
      }
    } else if (action === "move") {
      if (button >= 0) {
        if (!state.drag && !state.any) {
          return "";
        }
        buttonCode = 32 + button;
      } else {
        if (!state.any) {
          return "";
        }
        buttonCode = 35;
      }
    } else if (action === "wheel") {
      const delta = Math.abs(event.deltaY || 0) >= Math.abs(event.deltaX || 0) ? event.deltaY : event.deltaX;
      if (!delta) {
        return "";
      }
      buttonCode = delta < 0 ? 64 : 65;
    } else {
      return "";
    }

    buttonCode += modifiers;
    if (state.sgr) {
      return `\x1b[<${buttonCode};${x};${y}${suffix}`;
    }
    return encodeTerminalLegacyMouseSequence(buttonCode, x, y);
  };

  const stopTerminalMouseEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const installTerminalMouseTracking = (session) => {
    const shell = session?.shellEl;
    const host = session?.terminalHost;
    if (!shell || !host || !session?.term) {
      return;
    }

    const isTerminalMouseTarget = (target) => target instanceof Element && target.closest(".terminal-host") === host;
    const activateSessionPane = () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    };
    const mouseState = {
      activeButton: -1,
      lastMoveSequence: "",
    };
    const touchMouseState = {
      identifier: -1,
      active: false,
      deferredClick: false,
      lastX: 0,
      lastY: 0,
    };
    const grokTouchKeyboardState = {
      active: false,
      startedAt: 0,
      startX: 0,
      startY: 0,
      moved: false,
      wheelRemainderY: 0,
      lastTapAt: 0,
      lastTapX: 0,
      lastTapY: 0,
    };

    const sendMouseSequence = (event, action, button = -1) => {
      const sequence = encodeTerminalMouseSequence(session, event, action, button);
      if (!sequence) {
        return false;
      }
      if (action === "move") {
        if (sequence === mouseState.lastMoveSequence) {
          return true;
        }
        mouseState.lastMoveSequence = sequence;
      } else {
        mouseState.lastMoveSequence = "";
      }
      reassertTerminalSizeForMouse(session, event);
      sendOrQueueInput(session, sequence);
      return true;
    };

    const terminalMouseEventFromTouch = (event, touch = null) => ({
      clientX: Number(touch?.clientX ?? touchMouseState.lastX) || 0,
      clientY: Number(touch?.clientY ?? touchMouseState.lastY) || 0,
      shiftKey: Boolean(event?.shiftKey),
      altKey: Boolean(event?.altKey),
      ctrlKey: Boolean(event?.ctrlKey),
    });

    const flushGrokTouchWheel = (event, touch) => {
      if (!grokTouchKeyboardState.moved || !grokTouchKeyboardState.wheelRemainderY) {
        return;
      }
      const renderer = session.term?.renderer;
      const rowHeight = Math.max(
        touchShortcutMoveThresholdPx,
        Number(renderer?.getMetrics?.().height) || Number(renderer?.charHeight) || 18,
      );
      const rawSteps = grokTouchKeyboardState.wheelRemainderY / rowHeight;
      const wholeSteps = rawSteps > 0 ? Math.floor(rawSteps) : Math.ceil(rawSteps);
      if (!wholeSteps) {
        return;
      }
      const stepCount = Math.min(Math.abs(wholeSteps), 10);
      const direction = wholeSteps > 0 ? 1 : -1;
      const wheelEvent = {
        ...terminalMouseEventFromTouch(event, touch),
        deltaX: 0,
        deltaY: direction,
      };
      for (let index = 0; index < stepCount; index += 1) {
        sendMouseSequence(wheelEvent, "wheel");
      }
      grokTouchKeyboardState.wheelRemainderY -= direction * stepCount * rowHeight;
    };

    const changedTouchForActiveMouse = (event) => {
      const touches = Array.from(event?.changedTouches || []);
      return touches.find((touch) => touch.identifier === touchMouseState.identifier) || null;
    };

    const resetTouchMouseState = () => {
      touchMouseState.identifier = -1;
      touchMouseState.active = false;
      touchMouseState.deferredClick = false;
      touchMouseState.lastX = 0;
      touchMouseState.lastY = 0;
    };

    const resetGrokTouchKeyboardState = (clearTapHistory = false) => {
      grokTouchKeyboardState.active = false;
      grokTouchKeyboardState.startedAt = 0;
      grokTouchKeyboardState.startX = 0;
      grokTouchKeyboardState.startY = 0;
      grokTouchKeyboardState.moved = false;
      grokTouchKeyboardState.wheelRemainderY = 0;
      if (clearTapHistory) {
        grokTouchKeyboardState.lastTapAt = 0;
        grokTouchKeyboardState.lastTapX = 0;
        grokTouchKeyboardState.lastTapY = 0;
      }
    };

    const finishGrokTouchKeyboardTap = (event, touch) => {
      const now = performance.now();
      const previousTapAt = grokTouchKeyboardState.lastTapAt;
      const previousTapX = grokTouchKeyboardState.lastTapX;
      const previousTapY = grokTouchKeyboardState.lastTapY;
      const isTap = (
        event.type === "touchend"
        && grokTouchKeyboardState.active
        && touch
        && !grokTouchKeyboardState.moved
        && Math.abs(touch.clientX - grokTouchKeyboardState.startX) < touchShortcutMoveThresholdPx
        && Math.abs(touch.clientY - grokTouchKeyboardState.startY) < touchShortcutMoveThresholdPx
        && now - grokTouchKeyboardState.startedAt <= mobileKeyboardDoubleTapDelayMs
        && requiresTouchKeyboardDoubleTap()
        && isGrokTerminalSession(session)
        && terminalMouseTrackingState(session)
      );
      if (isTap) {
        const mouseEvent = terminalMouseEventFromTouch(event, touch);
        sendMouseSequence(mouseEvent, "press", 0);
        sendMouseSequence(mouseEvent, "release", 0);
      }
      resetGrokTouchKeyboardState(false);
      if (!isTap) {
        resetGrokTouchKeyboardState(true);
        return;
      }
      const dx = touch.clientX - previousTapX;
      const dy = touch.clientY - previousTapY;
      const isDoubleTap = (
        previousTapAt > 0
        && now - previousTapAt <= mobileKeyboardDoubleTapDelayMs
        && Math.hypot(dx, dy) < touchShortcutMoveThresholdPx * 2
      );
      grokTouchKeyboardState.lastTapAt = now;
      grokTouchKeyboardState.lastTapX = touch.clientX;
      grokTouchKeyboardState.lastTapY = touch.clientY;
      if (!isDoubleTap) {
        return;
      }
      resetGrokTouchKeyboardState(true);
      session.allowMobileKeyboardFocusUntil = now + mobileKeyboardFocusAllowWindowMs;
      focusTerminalInput(session, {
        requestMobileKeyboard: true,
        forceMobileFocusTransition: true,
      });
    };

    const handleMouseDown = (event) => {
      if (terminalLocalMouseClaimedEvents.has(event)) {
        mouseState.activeButton = -1;
        mouseState.lastMoveSequence = "";
        return;
      }
      if (!isTerminalMouseTarget(event.target)) {
        return;
      }
      const state = terminalMouseTrackingState(session);
      if (!state) {
        mouseState.activeButton = -1;
        mouseState.lastMoveSequence = "";
        return;
      }
      const button = terminalMouseButtonFromEvent(event);
      if (button < 0) {
        return;
      }
      stopTerminalMouseEvent(event);
      activateSessionPane();
      mouseState.activeButton = button;
      sendMouseSequence(event, "press", button);
    };

    const handleMouseMove = (event) => {
      if (terminalLocalMouseClaimedEvents.has(event)) {
        return;
      }
      const state = terminalMouseTrackingState(session);
      if (!state) {
        mouseState.lastMoveSequence = "";
        return;
      }
      const button = terminalMouseButtonFromButtons(event.buttons, mouseState.activeButton);
      const hasCapturedButton = mouseState.activeButton >= 0;
      const isLocalTarget = isTerminalMouseTarget(event.target);
      if (!hasCapturedButton && !isLocalTarget) {
        return;
      }
      if (hasCapturedButton || (isLocalTarget && state.any)) {
        stopTerminalMouseEvent(event);
      }
      sendMouseSequence(event, "move", hasCapturedButton ? button : -1);
    };

    const handleMouseUp = (event) => {
      if (terminalLocalMouseClaimedEvents.has(event)) {
        mouseState.activeButton = -1;
        mouseState.lastMoveSequence = "";
        return;
      }
      const hadActiveButton = mouseState.activeButton >= 0;
      const state = terminalMouseTrackingState(session);
      if (!state && !hadActiveButton) {
        return;
      }
      const button = terminalMouseButtonFromEvent(event);
      const releasedButton = mouseState.activeButton >= 0 ? mouseState.activeButton : button;
      mouseState.activeButton = terminalMouseButtonFromButtons(event.buttons, mouseState.activeButton);
      if (mouseState.activeButton === releasedButton) {
        mouseState.activeButton = -1;
      }
      mouseState.lastMoveSequence = "";
      if (!state) {
        return;
      }
      if (hadActiveButton || isTerminalMouseTarget(event.target)) {
        stopTerminalMouseEvent(event);
        sendMouseSequence(event, "release", releasedButton);
      }
    };

    const handleWheel = (event) => {
      if (!isTerminalMouseTarget(event.target) || !terminalMouseTrackingState(session)) {
        return;
      }
      const sent = sendMouseSequence(event, "wheel");
      if (sent) {
        stopTerminalMouseEvent(event);
      }
    };

    const handleClickLike = (event) => {
      if (terminalLocalMouseClaimedEvents.has(event)) {
        return;
      }
      if (isTerminalMouseTarget(event.target) && terminalMouseTrackingState(session)) {
        stopTerminalMouseEvent(event);
      }
    };

    const handleTouchStart = (event) => {
      const trackingState = terminalMouseTrackingState(session);
      if (
        !isTouchShortcutLayout()
        || event.touches.length !== 1
        || !isTerminalMouseTarget(event.target)
        || !trackingState
      ) {
        resetTouchMouseState();
        resetGrokTouchKeyboardState(true);
        return;
      }
      const touch = event.touches[0];
      stopTerminalMouseEvent(event);
      activateSessionPane();
      session.selectAllBufferActive = false;
      session.term?.clearSelection?.();
      touchMouseState.identifier = touch.identifier;
      touchMouseState.active = true;
      touchMouseState.lastX = touch.clientX;
      touchMouseState.lastY = touch.clientY;
      touchMouseState.deferredClick = requiresTouchKeyboardDoubleTap() && isGrokTerminalSession(session);
      if (touchMouseState.deferredClick) {
        session.allowMobileKeyboardFocusUntil = 0;
        blurTerminalInput(session);
        grokTouchKeyboardState.active = true;
        grokTouchKeyboardState.startedAt = performance.now();
        grokTouchKeyboardState.startX = touch.clientX;
        grokTouchKeyboardState.startY = touch.clientY;
        grokTouchKeyboardState.moved = false;
        grokTouchKeyboardState.wheelRemainderY = 0;
      } else {
        resetGrokTouchKeyboardState(true);
        sendMouseSequence(terminalMouseEventFromTouch(event, touch), "press", 0);
      }
    };

    const handleTouchMove = (event) => {
      if (!touchMouseState.active || !terminalMouseTrackingState(session)) {
        return;
      }
      const touch = Array.from(event.touches || []).find((item) => item.identifier === touchMouseState.identifier) || null;
      if (!touch) {
        return;
      }
      const previousY = touchMouseState.lastY;
      stopTerminalMouseEvent(event);
      touchMouseState.lastX = touch.clientX;
      touchMouseState.lastY = touch.clientY;
      if (touchMouseState.deferredClick) {
        grokTouchKeyboardState.wheelRemainderY += previousY - touch.clientY;
        if (
          Math.abs(touch.clientX - grokTouchKeyboardState.startX) >= touchShortcutMoveThresholdPx
          || Math.abs(touch.clientY - grokTouchKeyboardState.startY) >= touchShortcutMoveThresholdPx
        ) {
          grokTouchKeyboardState.moved = true;
        }
        flushGrokTouchWheel(event, touch);
        return;
      }
      sendMouseSequence(terminalMouseEventFromTouch(event, touch), "move", 0);
    };

    const finishTouchMouse = (event) => {
      if (!touchMouseState.active) {
        return;
      }
      const touch = changedTouchForActiveMouse(event);
      stopTerminalMouseEvent(event);
      if (touch) {
        touchMouseState.lastX = touch.clientX;
        touchMouseState.lastY = touch.clientY;
      }
      if (touchMouseState.deferredClick) {
        finishGrokTouchKeyboardTap(event, touch);
      } else {
        sendMouseSequence(terminalMouseEventFromTouch(event, touch), "release", 0);
      }
      resetTouchMouseState();
    };

    shell.addEventListener("mousedown", handleMouseDown, { capture: true, passive: false });
    shell.addEventListener("mousemove", handleMouseMove, { capture: true, passive: false });
    shell.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    shell.addEventListener("click", handleClickLike, { capture: true, passive: false });
    shell.addEventListener("dblclick", handleClickLike, { capture: true, passive: false });
    shell.addEventListener("auxclick", handleClickLike, { capture: true, passive: false });
    shell.addEventListener("contextmenu", handleClickLike, { capture: true, passive: false });
    shell.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
    shell.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    shell.addEventListener("touchend", finishTouchMouse, { capture: true, passive: false });
    shell.addEventListener("touchcancel", finishTouchMouse, { capture: true, passive: false });
    document.addEventListener("mousemove", handleMouseMove, { capture: true, passive: false });
    document.addEventListener("mouseup", handleMouseUp, { capture: true, passive: false });
    addSessionCleanup(session, () => {
      shell.removeEventListener("mousedown", handleMouseDown, { capture: true });
      shell.removeEventListener("mousemove", handleMouseMove, { capture: true });
      shell.removeEventListener("wheel", handleWheel, { capture: true });
      shell.removeEventListener("click", handleClickLike, { capture: true });
      shell.removeEventListener("dblclick", handleClickLike, { capture: true });
      shell.removeEventListener("auxclick", handleClickLike, { capture: true });
      shell.removeEventListener("contextmenu", handleClickLike, { capture: true });
      shell.removeEventListener("touchstart", handleTouchStart, { capture: true });
      shell.removeEventListener("touchmove", handleTouchMove, { capture: true });
      shell.removeEventListener("touchend", finishTouchMouse, { capture: true });
      shell.removeEventListener("touchcancel", finishTouchMouse, { capture: true });
      document.removeEventListener("mousemove", handleMouseMove, { capture: true });
      document.removeEventListener("mouseup", handleMouseUp, { capture: true });
    });
  };

  const compareSelectionCells = (left, right) => {
    if (!left || !right) {
      return 0;
    }
    if (left.absoluteRow !== right.absoluteRow) {
      return left.absoluteRow - right.absoluteRow;
    }
    return left.col - right.col;
  };

  const normalizeSelectionCells = (start, end) => {
    if (!start || !end) {
      return null;
    }
    return compareSelectionCells(start, end) <= 0 ? { start, end } : { start: end, end: start };
  };

  const previousSelectionCell = (session, cell) => {
    const cols = Math.max(1, session?.term?.cols || 1);
    if (!cell) {
      return null;
    }
    if (cell.col > 0) {
      return { col: cell.col - 1, absoluteRow: cell.absoluteRow };
    }
    return { col: cols - 1, absoluteRow: Math.max(0, cell.absoluteRow - 1) };
  };

  const nextSelectionCell = (session, cell) => {
    const cols = Math.max(1, session?.term?.cols || 1);
    if (!cell) {
      return null;
    }
    if (cell.col < cols - 1) {
      return { col: cell.col + 1, absoluteRow: cell.absoluteRow };
    }
    return { col: 0, absoluteRow: cell.absoluteRow + 1 };
  };

  const renderTerminalSelection = (session) => {
    const term = session?.term;
    if (!terminalRenderAllowed(session) || !term?.renderer || !term?.wasmTerm) {
      return;
    }
    try {
      term.requestRender?.({ full: true });
    } catch (error) {
    }
  };

  const emitTerminalSelectionChange = (session) => {
    const manager = session?.term?.selectionManager;
    if (typeof manager?.selectionChangedEmitter?.fire === "function") {
      manager.selectionChangedEmitter.fire();
      return;
    }
    updateSelectionSheet();
  };

  const applyTerminalSelection = (session, start, end) => {
    const manager = session?.term?.selectionManager;
    const normalized = normalizeSelectionCells(start, end);
    if (!manager || !normalized) {
      return;
    }
    blurTerminalInput(session);
    let nextStart = normalized.start;
    let nextEnd = normalized.end;
    if (compareSelectionCells(nextStart, nextEnd) === 0) {
      nextEnd = nextSelectionCell(session, nextStart);
    }
    manager.markCurrentSelectionDirty?.();
    manager.selectionStart = { col: nextStart.col, absoluteRow: nextStart.absoluteRow };
    manager.selectionEnd = { col: nextEnd.col, absoluteRow: nextEnd.absoluteRow };
    manager.isSelecting = false;
    manager.markCurrentSelectionDirty?.();
    renderTerminalSelection(session);
    emitTerminalSelectionChange(session);
  };

  const findFirstURLInText = (text) => {
    const value = String(text || "");
    if (!value) {
      return "";
    }
    urlPattern.lastIndex = 0;
    const match = urlPattern.exec(value);
    urlPattern.lastIndex = 0;
    return match ? match[0].replace(trailingURLPunctuation, "") : "";
  };

  const openURL = (url) => {
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  let dialogResolve = null;

  const closeDialog = (value) => {
    if (!dialogResolve) {
      return;
    }
    const resolve = dialogResolve;
    dialogResolve = null;
    if (dialogBackdrop) {
      dialogBackdrop.hidden = true;
      dialogBackdrop.dataset.mode = "";
    }
    resolve(value);
    window.setTimeout(() => activeSession()?.term?.focus(), 0);
  };

  const openDialog = ({ mode = "confirm", title = "Confirm", message = "", value = "", okText = "OK", cancelText = "取消", danger = false, initialFocus = "cancel" } = {}) =>
    new Promise((resolve) => {
      if (!dialogBackdrop || !dialogTitle || !dialogMessage || !dialogInput || !dialogOK || !dialogCancel) {
        resolve(mode === "prompt" ? window.prompt(title, value) : window.confirm(message || title));
        return;
      }
      if (dialogResolve) {
        closeDialog(mode === "prompt" ? null : false);
      }
      dialogResolve = resolve;
      dialogBackdrop.hidden = false;
      dialogBackdrop.dataset.mode = mode;
      dialogBackdrop.dataset.danger = danger ? "true" : "false";
      dialogTitle.textContent = title;
      dialogMessage.textContent = message;
      dialogInput.hidden = mode !== "prompt";
      dialogInput.value = value || "";
      dialogOK.textContent = okText;
      dialogCancel.textContent = cancelText;
      window.setTimeout(() => {
        if (mode === "prompt") {
          dialogInput.focus();
          dialogInput.select();
        } else if (initialFocus === "ok") {
          dialogOK.focus();
        } else {
          dialogCancel.focus();
        }
      }, 0);
    });

  const confirmDialog = async (message, options = {}) => {
    const result = await openDialog({ mode: "confirm", message, title: options.title || "Confirm", okText: options.okText || "Confirm", cancelText: options.cancelText || "取消", danger: Boolean(options.danger) });
    return result === true;
  };

  const closeMobileCloseConfirm = (value = false) => {
    if (!mobileCloseConfirmResolve) {
      return;
    }
    const resolve = mobileCloseConfirmResolve;
    mobileCloseConfirmResolve = null;
    if (mobileCloseConfirmSheet) {
      mobileCloseConfirmSheet.hidden = true;
    }
    resolve(value);
    window.setTimeout(() => activeSession()?.term?.focus(), 0);
  };

  const confirmMobileSheet = ({ title = "确认操作？", message = "", okText = "确认", cancelText = "取消", actionsLayout = "horizontal", initialFocus = "cancel" } = {}) =>
    new Promise((resolve) => {
      if (
        !mobileCloseConfirmSheet ||
        !mobileCloseConfirmTitle ||
        !mobileCloseConfirmMessage ||
        !mobileCloseConfirmActions ||
        !mobileCloseConfirmOK ||
        !mobileCloseConfirmCancel
      ) {
        resolve(window.confirm(message || title));
        return;
      }
      if (mobileCloseConfirmResolve) {
        closeMobileCloseConfirm(false);
      }
      closeMobileActionSheet();
      mobileCloseConfirmResolve = resolve;
      mobileCloseConfirmTitle.textContent = title;
      mobileCloseConfirmMessage.textContent = message;
      mobileCloseConfirmOK.textContent = okText;
      mobileCloseConfirmCancel.textContent = cancelText;
      mobileCloseConfirmActions.dataset.layout = actionsLayout === "vertical-ok-first" ? "vertical-ok-first" : "horizontal";
      mobileCloseConfirmSheet.hidden = false;
      window.setTimeout(() => (initialFocus === "ok" ? mobileCloseConfirmOK : mobileCloseConfirmCancel).focus(), 0);
    });

  const confirmMobileClose = (options = {}) => confirmMobileSheet({
    title: "关闭标签？",
    message: "",
    okText: "关闭",
    cancelText: "取消",
    ...options,
  });

  const confirmCloseRunningCommand = (message, options = {}) => {
    if (isMobileLayout()) {
      return confirmMobileClose({
        title: "检测到后台进程",
        message,
        okText: "关闭",
        cancelText: "取消",
        actionsLayout: "vertical-ok-first",
      });
    }
    return confirmDialog(message, options);
  };

  const promptDialog = async (title, value) => {
    const result = await openDialog({ mode: "prompt", title, value, okText: "保存", cancelText: "取消" });
    return result === null ? null : String(result || "").trim();
  };

  const displayPathLabel = pathBasenameLabel;

  const resolvePaneAutoLabel = (pane) => {
    const pathLabel = displayPathLabel(pane?.cwd);
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
      return;
    }
    const pane = tab.panes.get(tab.activePaneId) || Array.from(tab.panes.values())[0] || null;
    const nextLabel = resolvePaneAutoLabel(pane);
    if (!nextLabel || nextLabel === tab.label) {
      return;
    }
    tab.label = nextLabel;
    renderTabLabel(tab);
  };

  const updatePaneActivity = (paneState) => {
    const paneId = paneState?.id;
    if (!paneId) {
      return;
    }
    for (const tab of tabs.values()) {
      const pane = tab.panes.get(paneId);
      if (!pane) {
        continue;
      }
      const wasBusy = Boolean(pane.busy);
      const isBusy = Boolean(paneState.busy);
      pane.tty = paneState.tty || pane.tty || "";
      pane.busy = isBusy;
      pane.command = paneState.command || "";
      pane.processCommandLine = paneState.command_line || "";
      pane.cwd = paneState.cwd || pane.cwd || "";
      pane.activityCheckedAt = Number(paneState.activity_checked_at || 0);
      if (!pane.resizeAckPending) {
        pane.serverCols = Math.max(0, Math.floor(Number(paneState.cols) || 0));
        pane.serverRows = Math.max(0, Math.floor(Number(paneState.rows) || 0));
        pane.serverPixelWidth = Math.max(0, Math.floor(Number(paneState.pixel_width) || 0));
        pane.serverPixelHeight = Math.max(0, Math.floor(Number(paneState.pixel_height) || 0));
      }
      const localSize = terminalSize(pane);
      pane.sizeClaimRequired = terminalSizeDiffersFromServer({
        cols: localSize.cols,
        rows: localSize.rows,
        pixelWidth: localSize.pixelWidth,
        pixelHeight: localSize.pixelHeight,
        serverCols: pane.serverCols,
        serverRows: pane.serverRows,
        serverPixelWidth: pane.serverPixelWidth,
        serverPixelHeight: pane.serverPixelHeight,
      });
      pane.shellEl.dataset.busy = pane.busy ? "true" : "false";
      markSessionActivityNotification(pane, wasBusy, isBusy);
      markSessionIdleNotification(pane, wasBusy, isBusy);
      if (tab.activePaneId === pane.id) {
        refreshTabAutoLabel(tab);
        if (tab.id === activeTabId) {
          updateMobileActiveTabTitle();
        }
      }
      return;
    }
  };

  const refreshActivity = async ({ silent = true } = {}) => {
    const requestName = activeName;
    const generation = activeInstanceGeneration;
    if (!requestName) {
      return [];
    }
    const response = await fetch(workspaceActivityURL(requestName), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text() || `Activity request failed (${response.status})`);
    }
    const state = await response.json();
    if (!isCurrentInstanceRequest(requestName, generation)) {
      return [];
    }
    ensureResponseSelector(state, requestName, "Activity");
    for (const paneState of state?.panes || []) {
      updatePaneActivity(paneState);
    }
    if (state?.error) {
      if (!silent) {
        showToast(state.error);
      }
      throw new Error(state.error);
    }
    updateDocumentTitle();
    return state?.panes || [];
  };

  const targetPanesFromTab = (tab) => Array.from(tab?.panes.values() || []);
  const busyPanes = (panes) => panes.filter((pane) => pane?.busy);

  const refreshAndConfirmClose = async (panes, messagePrefix) => {
    try {
      await refreshActivity({ silent: true });
    } catch (error) {
      showToast(error.message || "Activity refresh failed.");
      return true;
    }
    const busy = busyPanes(panes);
    if (busy.length === 0) {
      return true;
    }
    const commands = busy.map((pane) => pane.command || pane.id).slice(0, 5).join(", ");
    return confirmCloseRunningCommand(`${messagePrefix}\n\n正在运行: ${commands}`, { title: "运行中命令", okText: "关闭", danger: true });
  };

  const hasCachedBusyPane = () => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane.busy) {
          return true;
        }
      }
    }
    return false;
  };

  const scheduleActivityRefresh = (delay = 700) => {
    window.clearTimeout(activityRefreshDelayTimer);
    activityRefreshDelayTimer = window.setTimeout(() => {
      refreshActivity({ silent: true }).catch(() => {});
    }, delay);
  };

  const startActivityRefresh = () => {
    window.clearInterval(activityRefreshTimer);
    activityRefreshTimer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine !== false) {
        refreshActivity({ silent: true }).catch(() => {});
      }
    }, activityPollIntervalMs);
  };

  const updateDocumentTitle = () => {
    const tab = currentTab();
    const title = tab?.label || "WebShell";
    const hasNotification = Array.from(tabs.values()).some((item) => item.hasNotification);
    document.title = `${hasNotification ? "* " : ""}${title} - LightOS WebShell`;
    updateMobileActiveTabTitle();
  };

  const markTabNotification = (tabId) => {
    const tab = tabs.get(tabId);
    if (!tab || tab.id === activeTabId) {
      return;
    }
    tab.hasNotification = true;
    tab.button?.classList.add("has-notification");
    updateDocumentTitle();
  };

  const clearTabNotification = (tab) => {
    if (!tab) {
      return;
    }
    tab.hasNotification = false;
    tab.button?.classList.remove("has-notification");
    updateDocumentTitle();
  };

  const markSessionUserInput = (session) => {
    if (session) {
      session.hasUserInputSinceFocus = true;
    }
  };

  const scrollTerminalToBottomForUserInput = (session) => {
    if (!session || session.closed || session.exitExpected || isTerminalInputBlocked()) {
      return;
    }
    const term = session?.term;
    if (!term || typeof term.scrollToBottom !== "function") {
      return;
    }
    try {
      const atBottom = isTerminalViewportAtBottom(term);
      if (atBottom) {
        term.stopTouchInertia?.();
        if (term.scrollAnimationFrame) {
          window.cancelAnimationFrame(term.scrollAnimationFrame);
          term.scrollAnimationFrame = void 0;
        }
        term.scrollAnimationStartTime = void 0;
        term.scrollAnimationStartY = void 0;
        term.scrollAnimationLastFrameTime = void 0;
        normalizeTerminalBottomViewport(term);
        return;
      }
      term.stopTouchInertia?.();
      if (term.scrollAnimationFrame) {
        window.cancelAnimationFrame(term.scrollAnimationFrame);
        term.scrollAnimationFrame = void 0;
      }
      term.scrollAnimationStartTime = void 0;
      term.scrollAnimationStartY = void 0;
      term.scrollAnimationLastFrameTime = void 0;
      term.scrollToBottom();
    } catch (error) {
    }
  };

  const markSessionTitleNotification = (session) => {
    if (!session?.hasUserInputSinceFocus || session.tabId === activeTabId) {
      return;
    }
    markTabNotification(session.tabId);
  };

  const markSessionActivityNotification = (session, wasBusy, isBusy) => {
    if (!session?.hasUserInputSinceFocus || session.tabId === activeTabId || wasBusy || !isBusy) {
      return;
    }
    session.notifyWhenIdle = true;
  };

  const markSessionIdleNotification = (session, wasBusy, isBusy) => {
    if (!session?.notifyWhenIdle || session.tabId === activeTabId || !wasBusy || isBusy) {
      return;
    }
    session.notifyWhenIdle = false;
    markTabNotification(session.tabId);
  };

  const resetSessionUserInput = (session) => {
    if (session) {
      session.hasUserInputSinceFocus = false;
      session.notifyWhenIdle = false;
    }
  };

  const setNetworkBanner = (visible, message = "") => {
    if (!networkBanner) {
      return;
    }
    const nextState = visible ? "offline" : "online";
    if (lastNetworkBannerState !== nextState) {
      lastNetworkBannerState = nextState;
      appendDebugLog(visible ? "error" : "info", visible ? "网络已断开，终端暂停重试" : "网络已恢复，终端开始重连");
    }
    networkBanner.textContent = message || "Offline. Reconnecting when network is back.";
    networkBanner.hidden = !visible;
  };

  const markWorkspaceSessionsOffline = () => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (!pane.closed) {
          clearTerminalUnifiedPaneRetry(pane);
          pane.shellEl.dataset.connection = "offline";
        }
      }
    }
  };

  const reconnectVisibleSessions = ({ allowHidden = false, probe = false } = {}) => {
    if (disposed || navigator.onLine === false) {
      return;
    }
    const tab = currentTab();
    for (const pane of tab?.panes.values() || []) {
      if (pane.name === activeName) {
        if (probe) {
          resumeSessionReplayRetry(pane, "user_recovery");
        }
        const ready = checkSessionConnectionHealth(pane, { connect: true, force: true, allowHidden });
        if (probe && ready) {
          probeOpenSessionSocket(pane, { allowHidden });
        }
      }
    }
  };

  const reconnectWorkspaceSessions = ({ allowHidden = true } = {}) => {
    if (disposed || navigator.onLine === false) {
      return;
    }
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane.name === activeName) {
          resumeSessionReplayRetry(pane, "network_online");
          checkSessionConnectionHealth(pane, { connect: true, force: true, allowHidden });
        }
      }
    }
  };

  const recoverVisibleSessionsFromUserGesture = () => {
    const now = Date.now();
    if (now - terminalUserRecoveryLastAt < terminalUserRecoveryThrottleMs) {
      return;
    }
    terminalUserRecoveryLastAt = now;
    reconnectVisibleSessions({ allowHidden: true, probe: true });
  };

  const hasActiveTerminalSelection = (session = activeSession()) => Boolean(session?.term?.hasSelection?.() || session?.selectAllBufferActive);

  const syncMobileMenuSelectionState = () => {
    const session = activeSession();
    const hasSelection = hasActiveTerminalSelection(session);
    for (const button of mobileShortcuts?.querySelectorAll('[data-mobile-action="open_mobile_menu"]') || []) {
      button.classList.toggle("has-selection", hasSelection);
      button.setAttribute("aria-label", hasSelection ? "Menu. Selection active" : "Menu");
      button.setAttribute("title", hasSelection ? "Menu. Selection active" : "Menu");
    }
  };

  const hideSelectionSheet = () => {
    if (!selectionSheet) {
      return;
    }
    selectionSheet.hidden = true;
    selectionSheet.style.removeProperty("left");
    selectionSheet.style.removeProperty("top");
    selectionSheet.style.removeProperty("bottom");
    selectionSheet.style.removeProperty("visibility");
  };

  const positionSelectionSheet = (session = activeSession()) => {
    const term = session?.term;
    const position = term?.getSelectionPosition?.();
    const canvas = term?.canvas || term?.element?.querySelector?.("canvas");
    const metrics = term?.renderer?.getMetrics?.();
    if (!selectionSheet || !term?.hasSelection?.() || !position || !canvas || !metrics?.width || !metrics?.height) {
      return false;
    }
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = Math.max(1, viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
    const viewportHeight = Math.max(1, viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);
    const canvasRect = canvas.getBoundingClientRect();
    const startX = canvasRect.left + position.start.x * metrics.width;
    const endX = canvasRect.left + (position.end.x + 1) * metrics.width;
    const selectedTop = canvasRect.top + Math.min(position.start.y, position.end.y) * metrics.height;
    const selectedBottom = canvasRect.top + (Math.max(position.start.y, position.end.y) + 1) * metrics.height;
    selectionSheet.hidden = false;
    selectionSheet.style.visibility = "hidden";
    selectionSheet.style.left = "0px";
    selectionSheet.style.top = "0px";
    selectionSheet.style.bottom = "auto";
    const rect = selectionSheet.getBoundingClientRect();
    const margin = 8;
    const preferredX = (startX + endX) / 2;
    const minLeft = viewportLeft + margin;
    const maxLeft = viewportLeft + viewportWidth - rect.width - margin;
    const left = Math.max(minLeft, Math.min(maxLeft, preferredX - rect.width / 2));
    const minTop = viewportTop + margin;
    const maxTop = viewportTop + viewportHeight - rect.height - margin;
    const verticalGap = 10;
    let top = selectedBottom + verticalGap;
    if (top > maxTop) {
      top = selectedTop - rect.height - verticalGap;
    }
    top = Math.max(minTop, Math.min(maxTop, top));
    selectionSheet.style.left = `${Math.round(left)}px`;
    selectionSheet.style.top = `${Math.round(top)}px`;
    selectionSheet.style.visibility = "";
    return true;
  };

  const updateSelectionSheet = () => {
    const session = activeSession();
    syncMobileMenuSelectionState();
    updateMobileSelectionHandles(session);
    if (
      !isTouchSelectionLayout() ||
      !hasActiveTerminalSelection(session) ||
      isTabOverviewOpen() ||
      (mobileActionSheet && !mobileActionSheet.hidden)
    ) {
      hideSelectionSheet();
    } else if (!positionSelectionSheet(session)) {
      hideSelectionSheet();
    }
    if (mobileActionSheet && !mobileActionSheet.hidden) {
      renderMobileActionSheet();
    }
  };

  const currentMobileSelectionSession = () => {
    const session = activeSession();
    return session?.term?.hasSelection?.() ? session : null;
  };

  const setMobileSelectionOverlayVisible = (session, visible) => {
    const overlay = session?.mobileSelectionOverlay;
    if (!overlay) {
      return;
    }
    overlay.hidden = !visible;
  };

  const positionMobileSelectionHandles = (session) => {
    const overlay = session?.mobileSelectionOverlay;
    const term = session?.term;
    const position = term?.getSelectionPosition?.();
    const canvas = term?.canvas || term?.element?.querySelector?.("canvas");
    const metrics = term?.renderer?.getMetrics?.();
    if (!overlay || !term?.hasSelection?.() || !position || !canvas || !metrics?.width || !metrics?.height || !isTouchSelectionLayout()) {
      setMobileSelectionOverlayVisible(session, false);
      return;
    }
    const shellRect = session.shellEl.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const left = canvasRect.left - shellRect.left;
    const top = canvasRect.top - shellRect.top;
    const startX = left + position.start.x * metrics.width;
    const startY = top + position.start.y * metrics.height;
    const endX = left + (position.end.x + 1) * metrics.width;
    const endY = top + position.end.y * metrics.height;
    overlay.startHandle.style.left = `${startX}px`;
    overlay.startHandle.style.top = `${startY}px`;
    overlay.startHandle.style.height = `${Math.max(32, metrics.height + 20)}px`;
    overlay.endHandle.style.left = `${endX}px`;
    overlay.endHandle.style.top = `${endY}px`;
    overlay.endHandle.style.height = `${Math.max(32, metrics.height + 20)}px`;
    setMobileSelectionOverlayVisible(session, true);
  };

  function updateMobileSelectionHandles(session = currentMobileSelectionSession()) {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane !== session) {
          setMobileSelectionOverlayVisible(pane, false);
        }
      }
    }
    if (session) {
      positionMobileSelectionHandles(session);
    }
  }

  const generatedTerminalResponsePattern =
    /^(?:\x1b)?(?:\[\d{1,4};\d{1,4}R|\[\d{1,4}R|\[0n|\[\?[\d;]{1,16}c|\[>[\d;]{1,16}c)/;
  const generatedTerminalResponseTailPattern =
    /^(?:\[\d{1,4};\d{1,4}R|\[\d{1,4}R|\d{1,4};\d{1,4}R|;\d{1,4}R|\d{1,4}R|\dR)+$/;

  const isGeneratedTerminalResponse = (data) => {
    if (typeof data !== "string" || data === "") {
      return false;
    }
    if (isKittyGraphicsResponse(data)) {
      return true;
    }
    let remaining = data;
    while (remaining) {
      const match = generatedTerminalResponsePattern.exec(remaining);
      if (!match) {
        return false;
      }
      remaining = remaining.slice(match[0].length);
    }
    return true;
  };

  const isGeneratedTerminalResponseTail = (data) => (
    typeof data === "string"
    && data !== ""
    && generatedTerminalResponseTailPattern.test(data)
  );

  const armGeneratedInputSuppression = (session, durationMs = 1000) => {
    if (!session) {
      return;
    }
    session.suppressGeneratedTerminalInputUntil = Math.max(
      Number(session.suppressGeneratedTerminalInputUntil || 0),
      Date.now() + durationMs,
    );
  };

  const armReplayGeneratedInputSuppression = (session) => {
    if (!session || session.allowGeneratedInputDuringReplay) {
      return;
    }
    armGeneratedInputSuppression(session, 1000);
  };

  const armAllGeneratedInputSuppression = (durationMs = 1000) => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        armGeneratedInputSuppression(pane, durationMs);
      }
    }
  };

  const shouldSuppressGeneratedTerminalInput = (session, data) => {
    if (!session) {
      return false;
    }
    const generatedResponse = isGeneratedTerminalResponse(data);
    const generatedResponseTail = isGeneratedTerminalResponseTail(data);
    if (session.replayOutputDepth > 0 && !session.allowGeneratedInputDuringReplay) {
      return generatedResponse || generatedResponseTail;
    }
    if (Number(session.suppressGeneratedTerminalInputUntil || 0) <= Date.now()) {
      return false;
    }
    return generatedResponse || generatedResponseTail;
  };

  const isTerminalInputBlocked = () => deployRestartDialogOpen;

  const discardSessionInputBuffers = (session) => {
    if (!session) {
      return;
    }
    if (session.inputFlushTimer) {
      window.clearTimeout(session.inputFlushTimer);
      session.inputFlushTimer = 0;
    }
    session.inputBuffer = "";
    session.inputBufferSize = 0;
    session.inputQueue = [];
    session.inputQueueSize = 0;
    clearInputPumpTimer(session);
    session.pendingInput = [];
    session.pendingInputSize = 0;
    clearPendingInputExpiry(session);
  };

  const sendSessionInputLock = (session, blocked) => {
    if (!session) {
      return;
    }
    session.inputLocked = blocked === true;
    if (session.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      session.socket.send(JSON.stringify({ type: "input_lock", blocked: session.inputLocked }));
    } catch (error) {
    }
  };

  const discardAllTerminalInputBuffers = () => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        discardSessionInputBuffers(pane);
      }
    }
  };

  const setAllTerminalInputLocked = (blocked) => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        sendSessionInputLock(pane, blocked);
      }
    }
  };

  const setServerRevisionInputLocked = async (blocked) => {
    if (!activeName) {
      return;
    }
    const url = serverRevisionURL();
    url.searchParams.set("terminal_input_blocked", blocked ? "true" : "false");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text() || `Server revision input lock failed (${response.status})`);
    }
  };

  const clearStartupServerRevisionInputLock = async () => {
    await setServerRevisionInputLocked(false);
    setAllTerminalInputLocked(false);
  };

  const drainGeneratedTerminalResponses = (session) => {
    const term = session?.term;
    const wasmTerm = term?.wasmTerm;
    if (!term || !wasmTerm || typeof term.processTerminalResponses !== "function" || typeof wasmTerm.hasResponse !== "function") {
      return;
    }
    session.processingGeneratedTerminalResponses = true;
    try {
      for (let index = 0; index < 256 && wasmTerm.hasResponse(); index += 1) {
        term.processTerminalResponses();
      }
    } finally {
      session.processingGeneratedTerminalResponses = false;
    }
  };

  const showDeployRestartDialog = async () => {
    if (deployRestartDialogOpen) {
      return;
    }
    const restartTargetName = activeName;
    const restartTargetTabId = activeTabId;
    deployRestartDialogOpen = true;
    armAllGeneratedInputSuppression(2000);
    setAllTerminalInputLocked(true);
    setServerRevisionInputLocked(true).catch(() => {});
    discardAllTerminalInputBuffers();
    let shouldUnlock = true;
    try {
      const restartDialogOptions = {
        title: "WebShell 已更新",
        message: "检测到 WebShell 服务已更新，请重新加载页面以使用最新版本。",
        okText: "重新加载",
        cancelText: "取消",
        initialFocus: "ok",
      };
      const restart = isMobileLayout()
        ? await confirmMobileSheet({ ...restartDialogOptions, actionsLayout: "vertical-ok-first" })
        : await openDialog(restartDialogOptions);
      if (restart === true) {
        shouldUnlock = false;
        rememberRestartTabForReload(restartTargetName, restartTargetTabId);
        armAllGeneratedInputSuppression(2000);
        discardAllTerminalInputBuffers();
        suppressBeforeUnloadForNavigation();
        window.location.reload();
      }
    } finally {
      if (shouldUnlock) {
        await setServerRevisionInputLocked(false).catch(() => {});
        setAllTerminalInputLocked(false);
        deployRestartDialogOpen = false;
      }
    }
  };

  const svgNamespace = "http://www.w3.org/2000/svg";
  const menuIconPath = "M216.615385 295.384615h586.830769c15.753846 0 31.507692-11.815385 31.507692-31.507692s-15.753846-31.507692-31.507692-31.507692H216.615385c-19.692308 0-31.507692 11.815385-31.507693 31.507692s15.753846 31.507692 31.507693 31.507692zM803.446154 480.492308H216.615385c-19.692308 0-31.507692 11.815385-31.507693 31.507692s15.753846 31.507692 31.507693 31.507692h586.830769c15.753846 0 31.507692-11.815385 31.507692-31.507692s-15.753846-31.507692-31.507692-31.507692zM803.446154 724.676923H216.615385c-19.692308 0-31.507692 11.815385-31.507693 31.507692s15.753846 31.507692 31.507693 31.507693h586.830769c15.753846 0 31.507692-11.815385 31.507692-31.507693s-15.753846-31.507692-31.507692-31.507692z";
  const mobileActionIconNames = {
    "capture-long-screenshot": "screenshot",
    copy: "copy",
    paste: "paste",
    "select-all": "select-all",
    search: "search",
    "open-link": "open-link",
    "copy-link": "copy-link",
    "rename-tab": "rename",
    "move-tab-first": "move-first",
    "move-tab-left": "move-left",
    "move-tab-right": "move-right",
    "move-tab-last": "move-last",
    "close-other-tabs": "close-others",
    "split-vertical": "split-vertical",
    "split-horizontal": "split-horizontal",
    "move-pane-new-tab": "pane-new-tab",
    theme: "theme",
    "close-pane": "close-pane",
    "close-tab": "close-tab",
  };
  const mobileIconDefinitions = {
    menu: { viewBox: "0 0 1024 1024", paths: [{ d: menuIconPath, fill: "currentColor" }] },
    screenshot: { paths: [{ d: "M4 7h3l1.5-2h7L17 7h3v12H4z" }, { d: "M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" }] },
    arrowUp: { paths: [{ d: "M12 19V5" }, { d: "M6 11l6-6 6 6" }] },
    arrowDown: { paths: [{ d: "M12 5v14" }, { d: "M6 13l6 6 6-6" }] },
    arrowLeft: { paths: [{ d: "M19 12H5" }, { d: "M11 6l-6 6 6 6" }] },
    arrowRight: { paths: [{ d: "M5 12h14" }, { d: "M13 6l6 6-6 6" }] },
    slash: { paths: [{ d: "M7 19L17 5" }] },
    copy: { paths: [{ d: "M8 8h10v12H8z" }, { d: "M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }] },
    paste: { paths: [{ d: "M9 4h6l1 2h2v15H6V6h2z" }, { d: "M9 4h6" }, { d: "M9 10h6" }, { d: "M9 14h6" }] },
    tab: { paths: [{ d: "M4 12h15" }, { d: "M14 7l5 5-5 5" }] },
    enter: { paths: [{ d: "M5 6v6h14" }, { d: "M15 8l4 4-4 4" }] },
    shiftTab: { paths: [{ d: "M19 12H4" }, { d: "M9 7l-5 5 5 5" }] },
    pageUp: { paths: [{ d: "M5 17V7" }, { d: "M2 10l3-3 3 3" }, { d: "M11 17h8" }, { d: "M11 12h8" }, { d: "M11 7h8" }] },
    pageDown: { paths: [{ d: "M5 7v10" }, { d: "M2 14l3 3 3-3" }, { d: "M11 17h8" }, { d: "M11 12h8" }, { d: "M11 7h8" }] },
    swap: { paths: [{ d: "M7 7h12l-3-3" }, { d: "M17 17H5l3 3" }] },
    zoomIn: { paths: [{ d: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z" }, { d: "M16 16l5 5" }, { d: "M10.5 7v6" }, { d: "M7.5 10h6" }] },
    zoomOut: { paths: [{ d: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z" }, { d: "M16 16l5 5" }, { d: "M7.5 10h6" }] },
    home: { paths: [{ d: "M4 11l8-7 8 7" }, { d: "M6 10v10h12V10" }] },
    end: { paths: [{ d: "M5 4v16" }, { d: "M19 4v16" }, { d: "M8 12h8" }, { d: "M13 7l5 5-5 5" }] },
    attachment: { paths: [{ d: "M8 12l5-5a3 3 0 0 1 4 4l-6 6a5 5 0 0 1-7-7l6-6" }] },
    tabAdd: { paths: [{ d: "M12 5v14" }, { d: "M5 12h14" }, { d: "M4 4h7" }] },
    "select-all": { paths: [{ d: "M5 5h14v14H5z" }, { d: "M8 8h8v8H8z" }] },
    search: { paths: [{ d: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" }, { d: "M16 16l5 5" }] },
    "open-link": { paths: [{ d: "M14 4h6v6" }, { d: "M20 4l-9 9" }, { d: "M11 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" }] },
    "copy-link": { paths: [{ d: "M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" }, { d: "M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" }] },
    rename: { paths: [{ d: "M4 20h4l11-11-4-4L4 16z" }, { d: "M13 7l4 4" }, { d: "M4 4h7" }] },
    "move-first": { paths: [{ d: "M5 5v14" }, { d: "M19 12H8" }, { d: "M12 8l-4 4 4 4" }] },
    "move-left": { paths: [{ d: "M19 12H5" }, { d: "M9 8l-4 4 4 4" }] },
    "move-right": { paths: [{ d: "M5 12h14" }, { d: "M15 8l4 4-4 4" }] },
    "move-last": { paths: [{ d: "M19 5v14" }, { d: "M5 12h11" }, { d: "M12 8l4 4-4 4" }] },
    "close-others": { paths: [{ d: "M4 7h8v8H4z" }, { d: "M12 9h8v8h-8z" }, { d: "M15 12l3 3" }, { d: "M18 12l-3 3" }] },
    "split-vertical": { paths: [{ d: "M4 5h16v14H4z" }, { d: "M12 5v14" }] },
    "split-horizontal": { paths: [{ d: "M4 5h16v14H4z" }, { d: "M4 12h16" }] },
    "pane-new-tab": { paths: [{ d: "M4 6h10v10H4z" }, { d: "M14 9h6v9H9v-2" }, { d: "M13 5h6v6" }, { d: "M19 5l-7 7" }] },
    theme: { paths: [{ d: "M12 21a9 9 0 1 1 9-9c0 1.7-1.3 3-3 3h-1.5a2 2 0 0 0-1.8 2.8l.2.4A2 2 0 0 1 13.1 21z" }, { d: "M7.5 10.5h.01" }, { d: "M10 7.5h.01" }, { d: "M14 7.5h.01" }, { d: "M16.5 10.5h.01" }] },
    "close-pane": { paths: [{ d: "M4 5h16v14H4z" }, { d: "M9 9l6 6" }, { d: "M15 9l-6 6" }] },
    "close-tab": { paths: [{ d: "M5 7h14l1 4v6H4v-6z" }, { d: "M9 10l6 6" }, { d: "M15 10l-6 6" }] },
    default: { paths: [{ d: "M12 5v14" }, { d: "M5 12h14" }] },
  };

  const createSVGIcon = (name, className = "") => {
    const definition = mobileIconDefinitions[name] || mobileIconDefinitions.default;
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", definition.viewBox || "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if (className) {
      svg.setAttribute("class", className);
    }
    for (const pathAttrs of definition.paths || []) {
      const path = document.createElementNS(svgNamespace, "path");
      const hasFill = Object.prototype.hasOwnProperty.call(pathAttrs, "fill");
      const hasStroke = Object.prototype.hasOwnProperty.call(pathAttrs, "stroke");
      if (!hasFill && !hasStroke) {
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
      }
      for (const [key, value] of Object.entries(pathAttrs)) {
        path.setAttribute(key, value);
      }
      svg.appendChild(path);
    }
    return svg;
  };

  function loadTouchShortcutFeedbackEnabled() {
    try {
      const persisted = String(window.localStorage.getItem(touchShortcutFeedbackStorageKey) || "").trim().toLowerCase();
      if (!persisted) {
        return true;
      }
      return persisted !== "false" && persisted !== "0" && persisted !== "off";
    } catch (error) {
      return true;
    }
  }

  const persistTouchShortcutFeedbackEnabled = (enabled) => {
    try {
      if (enabled !== false) {
        window.localStorage.removeItem(touchShortcutFeedbackStorageKey);
        return;
      }
      window.localStorage.setItem(touchShortcutFeedbackStorageKey, "false");
    } catch (error) {
    }
  };

  const normalizeShortcutInputModifiers = (modifiers = {}) => ({
    ctrl: modifiers?.ctrl === true,
    shift: modifiers?.shift === true,
    alt: modifiers?.alt === true,
  });

  const mergeShortcutInputModifiers = (...states) => {
    const merged = { ctrl: false, shift: false, alt: false };
    states.forEach((state) => {
      const normalized = normalizeShortcutInputModifiers(state);
      merged.ctrl = merged.ctrl || normalized.ctrl;
      merged.shift = merged.shift || normalized.shift;
      merged.alt = merged.alt || normalized.alt;
    });
    return merged;
  };

  const hasShortcutInputModifiers = (modifiers = {}) => {
    const normalized = normalizeShortcutInputModifiers(modifiers);
    return normalized.ctrl || normalized.shift || normalized.alt;
  };

  const canApplyStickyModifierInput = (value) => {
    const points = Array.from(String(value || ""));
    if (points.length !== 1) {
      return false;
    }
    const codePoint = points[0].codePointAt(0);
    return Number.isFinite(codePoint) && codePoint >= 0x20 && codePoint !== 0x7f;
  };

  const encodeStickyCtrlChar = (value) => {
    const firstChar = Array.from(String(value || ""))[0] || "";
    if (!canApplyStickyModifierInput(firstChar)) {
      return "";
    }
    const lower = firstChar.toLowerCase();
    if (lower >= "a" && lower <= "z") {
      return String.fromCharCode(lower.charCodeAt(0) - 96);
    }
    switch (firstChar) {
      case " ":
      case "@":
        return "\x00";
      case "[":
        return "\x1b";
      case "\\":
        return "\x1c";
      case "]":
        return "\x1d";
      case "^":
        return "\x1e";
      case "_":
        return "\x1f";
      case "?":
        return "\x7f";
      default:
        return `\x1b[${firstChar.codePointAt(0)};5u`;
    }
  };

  const applyStickyCtrlInput = (value) => {
    const points = Array.from(String(value || ""));
    if (points.length !== 1) {
      return "";
    }
    return encodeStickyCtrlChar(points[0]);
  };

  const applyStickyAltInput = (value) => {
    const raw = String(value || "");
    return raw ? `\x1b${raw}` : "";
  };

  const applyStickyShiftInput = (value) => {
    const firstChar = Array.from(String(value || ""))[0] || "";
    if (!canApplyStickyModifierInput(firstChar)) {
      return "";
    }
    const shiftedCharacter = shiftedCharacterMap.get(firstChar);
    if (shiftedCharacter) {
      return shiftedCharacter;
    }
    const upper = firstChar.toUpperCase();
    return Array.from(upper).length === 1 ? upper : firstChar;
  };

  const mobileShortcutInputKeyLabels = new Map(mobileShortcutKeyOptions.map((item) => [item.value, item.label]));
  const mobileShortcutActionLabels = new Map(mobileShortcutActionOptions.map((item) => [item.value, item.label]));

  const applyStickyModifierInput = (value, { ctrl = false, shift = false, alt = false } = {}) => {
    const raw = String(value || "");
    if (!ctrl && !shift && !alt) {
      return raw;
    }
    if (!canApplyStickyModifierInput(raw)) {
      return "";
    }
    let encoded = raw;
    if (shift) {
      encoded = applyStickyShiftInput(encoded);
      if (!encoded) {
        return "";
      }
    }
    if (ctrl) {
      encoded = applyStickyCtrlInput(encoded);
      if (!encoded) {
        return "";
      }
    }
    if (alt) {
      encoded = applyStickyAltInput(encoded);
    }
    return encoded;
  };

  const shouldApplyMobileStickyTextInput = (value, inputType = "") => {
    if (!hasMobileStickyModifiers()) {
      return false;
    }
    const type = String(inputType || "");
    if (type === "insertFromPaste" || type.includes("Composition")) {
      return false;
    }
    return canApplyStickyModifierInput(value);
  };

  const shouldApplyMobileStickyCompositionInput = (value) => {
    if (!hasMobileStickyModifiers()) {
      return false;
    }
    const points = Array.from(String(value || ""));
    if (points.length !== 1) {
      return false;
    }
    const codePoint = points[0].codePointAt(0);
    return Number.isFinite(codePoint) && codePoint >= 0x20 && codePoint <= 0x7e;
  };

  const consumeMobileStickyTextInput = (value) => {
    if (!hasMobileStickyModifiers()) {
      return String(value || "");
    }
    if (!canApplyStickyModifierInput(value)) {
      return String(value || "");
    }
    const encoded = applyStickyModifierInput(value, {
      ctrl: mobileSticky.ctrl,
      shift: mobileSticky.shift,
      alt: mobileSticky.alt,
    });
    clearMobileSticky();
    return encoded;
  };

  const resolveTerminalModifierParameter = (modifiers = {}) => {
    const normalized = normalizeShortcutInputModifiers(modifiers);
    return 1 + Number(normalized.shift) + Number(normalized.alt) * 2 + Number(normalized.ctrl) * 4;
  };

  const buildModifiedCsiFinalSequence = (finalChar, modifiers = {}) => {
    const normalized = normalizeShortcutInputModifiers(modifiers);
    if (!hasShortcutInputModifiers(normalized)) {
      return `\x1b[${finalChar}`;
    }
    return `\x1b[1;${resolveTerminalModifierParameter(normalized)}${finalChar}`;
  };

  const encodeMobileShortcutKeyInput = (inputKey, modifiers = {}) => {
    const normalizedKey = String(inputKey || "").trim();
    const normalizedModifiers = normalizeShortcutInputModifiers(modifiers);
    switch (normalizedKey) {
      case "space":
        return applyStickyModifierInput(" ", normalizedModifiers);
      case "arrow_up":
        return buildModifiedCsiFinalSequence("A", normalizedModifiers);
      case "arrow_down":
        return buildModifiedCsiFinalSequence("B", normalizedModifiers);
      case "arrow_right":
        return buildModifiedCsiFinalSequence("C", normalizedModifiers);
      case "arrow_left":
        return buildModifiedCsiFinalSequence("D", normalizedModifiers);
      case "home":
        return buildModifiedCsiFinalSequence("H", normalizedModifiers);
      case "end":
        return buildModifiedCsiFinalSequence("F", normalizedModifiers);
      case "tab":
        if (normalizedModifiers.shift) {
          if (!normalizedModifiers.ctrl && !normalizedModifiers.alt) {
            return backtabSequence;
          }
          return `\x1b[1;${resolveTerminalModifierParameter(normalizedModifiers)}Z`;
        }
        return normalizedModifiers.alt ? applyStickyAltInput("\t") : "\t";
      case "enter":
        return normalizedModifiers.alt ? applyStickyAltInput("\r") : "\r";
      case "escape":
        return normalizedModifiers.alt ? applyStickyAltInput("\x1b") : "\x1b";
      default:
        if (normalizedKey.length !== 1) {
          return "";
        }
        return applyStickyModifierInput(normalizedKey, normalizedModifiers);
    }
  };

  const resolveMobileShortcutInputData = (shortcut, stickyModifiers = {}) => {
    const rawData = typeof shortcut?.data === "string" ? shortcut.data : "";
    const inputKey = String(shortcut?.inputKey || "").trim();
    const shortcutModifiers = normalizeShortcutInputModifiers(shortcut?.inputModifiers);
    const modifiers = mergeShortcutInputModifiers(shortcutModifiers, stickyModifiers);
    if (!inputKey) {
      if (!hasShortcutInputModifiers(modifiers)) {
        return rawData;
      }
      return canApplyStickyModifierInput(rawData) ? applyStickyModifierInput(rawData, modifiers) : rawData;
    }
    const encoded = encodeMobileShortcutKeyInput(inputKey, modifiers);
    return encoded || rawData;
  };

  const hasMobileStickyModifiers = () => mobileSticky.ctrl || mobileSticky.alt || mobileSticky.shift;

  const syncMobileShortcutState = () => {
    for (const [action, key] of [["sticky_ctrl", "ctrl"], ["sticky_alt", "alt"], ["sticky_shift", "shift"]]) {
      for (const button of mobileShortcuts?.querySelectorAll(`[data-mobile-action="${action}"]`) || []) {
        button.classList.toggle("active", mobileSticky[key]);
        button.setAttribute("aria-pressed", mobileSticky[key] ? "true" : "false");
      }
    }
    const feedbackLabel = touchShortcutFeedbackEnabled ? "Shock On" : "Shock Off";
    for (const button of mobileShortcuts?.querySelectorAll('[data-mobile-action="toggle_touch_feedback"]') || []) {
      button.classList.toggle("active", touchShortcutFeedbackEnabled);
      button.setAttribute("aria-pressed", touchShortcutFeedbackEnabled ? "true" : "false");
      button.setAttribute("aria-label", button.dataset.customLabel || feedbackLabel);
      button.setAttribute("title", button.dataset.customLabel || feedbackLabel);
    }
    syncMobileMenuSelectionState();
  };

  const isMobileShortcutRepeatable = (shortcut) => ["enter", "arrow_up", "arrow_down", "arrow_left", "arrow_right"].includes(String(shortcut?.inputKey || ""));

  const formatMobileShortcutTextPreview = (text) => {
    const normalized = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const visible = normalized
      .replace(/\t/g, "\\t")
      .replace(/\n/g, "\\n");
    const points = Array.from(visible);
    return points.length > 32 ? `${points.slice(0, 32).join("")}...` : visible;
  };

  const describeMobileShortcut = (shortcut) => {
    if (shortcut?.action) {
      return mobileShortcutActionLabels.get(shortcut.action) || shortcut.action;
    }
    if (typeof shortcut?.text === "string" && shortcut.text !== "") {
      return `发送文字: ${formatMobileShortcutTextPreview(shortcut.text)}`;
    }
    const key = String(shortcut?.inputKey || "");
    const keyLabel = key.length === 1 ? key : (mobileShortcutInputKeyLabels.get(key) || key);
    const modifiers = normalizeShortcutInputModifiers(shortcut?.inputModifiers);
    return [
      modifiers.ctrl ? "Ctrl" : "",
      modifiers.alt ? "Alt" : "",
      modifiers.shift ? "Shift" : "",
      keyLabel,
    ].filter(Boolean).join("+");
  };

  const clearMobileSticky = () => {
    mobileSticky.ctrl = false;
    mobileSticky.alt = false;
    mobileSticky.shift = false;
    syncMobileShortcutState();
  };

  const toggleMobileSticky = (key) => {
    if (!Object.prototype.hasOwnProperty.call(mobileSticky, key)) {
      return;
    }
    mobileSticky[key] = !mobileSticky[key];
    syncMobileShortcutState();
  };

  const resolveMobileShortcutData = (shortcut) => {
    const hadStickyModifiers = hasMobileStickyModifiers();
    const encoded = resolveMobileShortcutInputData(shortcut, {
      ctrl: mobileSticky.ctrl,
      shift: mobileSticky.shift,
      alt: mobileSticky.alt,
    });
    if (hadStickyModifiers) {
      clearMobileSticky();
    }
    return encoded || (typeof shortcut?.data === "string" ? shortcut.data : "");
  };

  const normalizeMobileShortcutTextData = (text) => String(text || "")
    .replace(/\r\n/g, "\r")
    .replace(/\n/g, "\r");

  const setTouchShortcutFeedbackEnabled = (enabled) => {
    touchShortcutFeedbackEnabled = enabled !== false;
    persistTouchShortcutFeedbackEnabled(touchShortcutFeedbackEnabled);
    syncMobileShortcutState();
  };

  const triggerMobileTouchFeedback = () => {
    const bridge = globalThis.lzc_vibrate;
    if (!bridge || typeof bridge.Vibrate !== "function") {
      return false;
    }
    try {
      bridge.Vibrate(0);
      return true;
    } catch (error) {
      return false;
    }
  };

  const runMobileAction = (action, session = activeSession()) => {
    const tab = currentTab();
    switch (action) {
      case "sticky_ctrl":
      case "ctrl":
        toggleMobileSticky("ctrl");
        focusMobileKeyboardFromShortcut(session);
        return;
      case "sticky_alt":
      case "alt":
        toggleMobileSticky("alt");
        focusMobileKeyboardFromShortcut(session);
        return;
      case "sticky_shift":
      case "shift":
        toggleMobileSticky("shift");
        focusMobileKeyboardFromShortcut(session);
        return;
      case "new_tab":
        createUserTab().catch((error) => showToast(error.message));
        return;
      case "close_tab":
        if (tab) {
          closeTab(tab.id);
        }
        return;
      case "rename_tab":
        if (tab) {
          renameTab(tab.id).catch((error) => showToast(error.message));
        }
        return;
      case "swap_tab":
      case "swap_recent_tab":
      case "swap":
        swapRecentTabs();
        return;
      case "next_tab":
        setActiveTabByOffset(1);
        return;
      case "previous_tab":
        setActiveTabByOffset(-1);
        return;
      case "vertical_split":
        if (tab?.activePaneId) {
          splitPane(tab.id, tab.activePaneId, "vertical");
        }
        return;
      case "horizontal_split":
        if (tab?.activePaneId) {
          splitPane(tab.id, tab.activePaneId, "horizontal");
        }
        return;
      case "tab_overview":
      case "open_tab_overview":
      case "overview":
        openTabOverview();
        return;
      case "search_terminal":
      case "search":
        openSearch();
        return;
      case "attachment":
      case "open_attachment":
        openAttachmentDialog();
        return;
      case "attachment_clipboard":
        importAttachmentFromClipboard().catch((error) => showToast(error.message));
        return;
      case "attachment_file":
        selectAttachmentFiles();
        return;
      case "copy":
        copyFromSession(session).catch((error) => showToast(error.message));
        return;
      case "paste":
        pasteIntoSession(session).catch((error) => showToast(error.message));
        return;
      case "page_up":
      case "page-up":
        session?.term?.scrollPages?.(-1);
        return;
      case "page_down":
      case "page-down":
        session?.term?.scrollPages?.(1);
        return;
      case "zoom_in":
      case "zoom-in":
        adjustTerminalFontSize(1);
        return;
      case "zoom_out":
      case "zoom-out":
        adjustTerminalFontSize(-1);
        return;
      case "toggle_touch_feedback":
        setTouchShortcutFeedbackEnabled(!touchShortcutFeedbackEnabled);
        if (touchShortcutFeedbackEnabled) {
          triggerMobileTouchFeedback();
        }
        return;
      case "open_mobile_menu":
        openMobileActionSheet();
        return;
      default:
        return;
    }
  };

  const triggerMobileShortcut = (shortcut, session = activeSession(), options = {}) => {
    if (!shortcut) {
      return;
    }
    if (options.feedback !== false && shortcut.action !== "toggle_touch_feedback" && touchShortcutFeedbackEnabled) {
      triggerMobileTouchFeedback();
    }
    if (shortcut.action) {
      runMobileAction(shortcut.action, session);
      return;
    }
    const data = resolveMobileShortcutData(shortcut);
    if (!data) {
      return;
    }
    const targetSession = session || activeSession();
    if (!targetSession) {
      return;
    }
    if (typeof shortcut?.text === "string" && shortcut.text !== "") {
      if (hasMobileStickyModifiers()) {
        clearMobileSticky();
      }
      const text = normalizeMobileShortcutTextData(shortcut.text);
      if (text) {
        sendOrQueueInput(targetSession, text);
      }
      return;
    }
    sendOrQueueInput(targetSession, data);
  };

  const stopMobileShortcutEvent = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (typeof event?.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  };

  const isRepeatableMobileShortcut = (shortcut) => isMobileShortcutRepeatable(shortcut);

  const bindMobileShortcutButton = (button, shortcut) => {
    let activePointerId = -1;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let touchScrollRow = null;
    let touchScrollStartLeft = 0;
    let touchHorizontalScroll = false;
    let shortcutSession = null;
    let suppressNextClick = false;
    let repeatDelayTimer = 0;
    let repeatTimer = 0;
    let repeatTriggered = false;

    const rememberShortcutSession = () => {
      shortcutSession = activeSession();
      if (shouldPreserveMobileKeyboardForShortcut(shortcut) && isMobileTerminalKeyboardActive(shortcutSession)) {
        shortcutSession.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;
      }
    };

    const preserveMobileKeyboardOnTouchStart = (event) => {
      if (
        !shouldPreserveMobileKeyboardForShortcut(shortcut)
        || Number(event?.touches?.length || 0) !== 1
      ) {
        return;
      }
      rememberShortcutSession();
      if (!isMobileTerminalKeyboardActive(shortcutSession)) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
    };

    const stopRepeat = () => {
      if (repeatDelayTimer) {
        window.clearTimeout(repeatDelayTimer);
        repeatDelayTimer = 0;
      }
      if (repeatTimer) {
        window.clearInterval(repeatTimer);
        repeatTimer = 0;
      }
      repeatTriggered = false;
      if (!["sticky_ctrl", "sticky_alt", "sticky_shift", "toggle_touch_feedback"].includes(shortcut.action)) {
        button.classList.remove("active");
      }
    };

    const resetPointerTracking = () => {
      activePointerId = -1;
      touchStartX = 0;
      touchStartY = 0;
      touchMoved = false;
      touchScrollRow = null;
      touchScrollStartLeft = 0;
      touchHorizontalScroll = false;
    };

    const updateTouchMoved = (clientX, clientY) => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
      }
      const dx = clientX - touchStartX;
      const dy = clientY - touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (
        !touchMoved &&
        (absX >= touchShortcutMoveThresholdPx || absY >= touchShortcutMoveThresholdPx)
      ) {
        touchMoved = true;
        stopRepeat();
      }
      if (
        touchScrollRow &&
        !touchHorizontalScroll &&
        absX >= touchShortcutMoveThresholdPx &&
        absX > absY
      ) {
        touchHorizontalScroll = true;
      }
      if (touchHorizontalScroll && touchScrollRow) {
        touchScrollRow.scrollLeft = touchScrollStartLeft - dx;
      }
    };

    const startRepeat = () => {
      if (!isRepeatableMobileShortcut(shortcut)) {
        return;
      }
      stopRepeat();
      repeatDelayTimer = window.setTimeout(() => {
        repeatDelayTimer = 0;
        if (activePointerId < 0 || touchMoved) {
          return;
        }
        repeatTriggered = true;
        suppressNextClick = true;
        button.classList.add("active");
        triggerMobileShortcut(shortcut, shortcutSession || activeSession());
        repeatTimer = window.setInterval(() => {
          if (activePointerId < 0 || touchMoved) {
            stopRepeat();
            return;
          }
          triggerMobileShortcut(shortcut, shortcutSession || activeSession(), { feedback: false });
        }, touchShortcutRepeatIntervalMs);
      }, touchShortcutRepeatInitialDelayMs);
    };

    button.addEventListener("touchstart", preserveMobileKeyboardOnTouchStart, { capture: true, passive: false });

    button.addEventListener("mousedown", (event) => {
      if (!isDesktopShortcutBarLayout()) {
        return;
      }
      event.preventDefault();
      rememberShortcutSession();
    });

    button.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent) || !event.isPrimary) {
        return;
      }
      if (event.pointerType !== "touch" && event.pointerType !== "pen") {
        return;
      }
      stopMobileShortcutEvent(event);
      activePointerId = event.pointerId;
      touchStartX = event.clientX;
      touchStartY = event.clientY;
      touchMoved = false;
      repeatTriggered = false;
      rememberShortcutSession();
      if (isMobileTerminalKeyboardActive(shortcutSession)) {
        const row = button.closest(".mobile-shortcut-row");
        touchScrollRow = row instanceof HTMLElement ? row : null;
        touchScrollStartLeft = touchScrollRow?.scrollLeft || 0;
      } else {
        touchScrollRow = null;
        touchScrollStartLeft = 0;
      }
      touchHorizontalScroll = false;
      startRepeat();
    }, { passive: false });

    button.addEventListener("pointermove", (event) => {
      if (!(event instanceof PointerEvent) || event.pointerId !== activePointerId) {
        return;
      }
      updateTouchMoved(event.clientX, event.clientY);
    }, { passive: true });

    button.addEventListener("pointerup", (event) => {
      if (!(event instanceof PointerEvent) || event.pointerId !== activePointerId) {
        return;
      }
      updateTouchMoved(event.clientX, event.clientY);
      const shouldTrigger = !touchMoved && !repeatTriggered;
      stopRepeat();
      resetPointerTracking();
      suppressNextClick = true;
      stopMobileShortcutEvent(event);
      if (shouldTrigger) {
        triggerMobileShortcut(shortcut, shortcutSession || activeSession());
      }
      shortcutSession = null;
    }, { passive: false });

    button.addEventListener("pointercancel", (event) => {
      if (!(event instanceof PointerEvent) || event.pointerId !== activePointerId) {
        return;
      }
      stopRepeat();
      resetPointerTracking();
      shortcutSession = null;
    });

    button.addEventListener("click", (event) => {
      stopMobileShortcutEvent(event);
      if (suppressNextClick) {
        suppressNextClick = false;
        shortcutSession = null;
        return;
      }
      triggerMobileShortcut(shortcut, shortcutSession || activeSession());
      if (isDesktopShortcutBarLayout()) {
        button.blur();
      }
      shortcutSession = null;
    });
  };

  const renderMobileShortcuts = () => {
    if (!mobileShortcuts || mobileShortcutRows.length === 0) {
      return;
    }
    const hasShortcuts = mobileShortcutRowsConfig.some((row) => Array.isArray(row) && row.length > 0);
    mobileShortcuts.classList.toggle("is-empty", !hasShortcuts);
    document.body.classList.toggle("mobile-shortcuts-empty", !hasShortcuts);
    mobileShortcutRows.forEach((row, rowIndex) => {
      row.textContent = "";
      for (const shortcut of mobileShortcutRowsConfig[rowIndex] || []) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mobile-shortcut-key";
        button.tabIndex = -1;
        button.dataset.mobileShortcutId = shortcut.id;
        if (shortcut.inputKey) {
          button.dataset.mobileShortcutInputKey = shortcut.inputKey;
        }
        if (shortcut.action) {
          button.dataset.mobileAction = shortcut.action;
        }
        if (shortcut.kind) {
          button.dataset.kind = shortcut.kind;
        }

        const iconName = String(shortcut.icon || "").trim();
        if (iconName && shortcut.action !== "open_mobile_menu") {
          button.appendChild(createSVGIcon(iconName, "mobile-shortcut-icon"));
        } else {
          button.textContent = shortcut.label;
        }
        button.setAttribute("aria-label", shortcut.ariaLabel || shortcut.label);
        button.setAttribute("title", shortcut.ariaLabel || shortcut.label);
        button.dataset.customLabel = shortcut.ariaLabel || shortcut.label;
        if (shortcut.action === "open_mobile_menu") {
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
        }
        if (["sticky_ctrl", "sticky_alt", "sticky_shift", "toggle_touch_feedback"].includes(shortcut.action)) {
          button.setAttribute("aria-pressed", "false");
        }
        bindMobileShortcutButton(button, shortcut);
        row.appendChild(button);
      }
    });
    syncMobileShortcutState();
  };

  const getContextActionDefinitions = () =>
    Array.from(contextMenu?.querySelectorAll(".context-menu-btn") || [])
      .map((button) => ({
        action: String(button.dataset.action || "").trim(),
        label: String(button.textContent || "").trim(),
        danger: button.classList.contains("danger"),
      }))
      .filter((item) => item.action && item.label);

  const buildMobileContextTarget = () => {
    const tab = currentTab();
    const session = activeSession();
    const selectedText = session?.selectAllBufferActive ? "" : session?.term?.getSelection?.() || "";
    return {
      type: "mobile",
      tabId: tab?.id || "",
      paneId: session?.id || "",
      link: findFirstURLInText(selectedText),
    };
  };

  const tabOrderIndex = (tabId) => getOrderedTabs().findIndex((tab) => tab.id === tabId);

  const isContextActionEnabled = (action, target) => {
    if (!target) {
      return false;
    }
    const tab = target.tabId ? tabs.get(target.tabId) : null;
    const pane = target.paneId ? tab?.panes.get(target.paneId) : null;
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
        return hasActiveTerminalSelection(pane);
      case "move-pane-new-tab":
        return Boolean(tab && pane && tab.panes.size > 1);
      case "close-other-tabs":
        return Boolean(tab && tabs.size > 1);
      case "move-tab-first":
      case "move-tab-left":
        return tabOrderIndex(target.tabId) > 0;
      case "move-tab-right":
      case "move-tab-last": {
        const index = tabOrderIndex(target.tabId);
        return index >= 0 && index < getOrderedTabs().length - 1;
      }
      default:
        return true;
    }
  };

  function renderMobileActionSheet(target = buildMobileContextTarget()) {
    if (!mobileActionGrid) {
      return;
    }
    contextTarget = target;
    mobileActionGrid.textContent = "";
    const fragment = document.createDocumentFragment();
    for (const item of getContextActionDefinitions()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mobile-action-item";
      button.dataset.action = item.action;
      button.disabled = !isContextActionEnabled(item.action, target);
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-label", item.label);
      if (item.danger) {
        button.classList.add("danger");
      }

      const icon = document.createElement("span");
      icon.className = "mobile-action-icon";
      icon.appendChild(createSVGIcon(mobileActionIconNames[item.action] || "default"));

      const label = document.createElement("span");
      label.className = "mobile-action-label";
      label.textContent = item.label;

      button.append(icon, label);
      fragment.appendChild(button);
    }
    mobileActionGrid.appendChild(fragment);
  }

  const closeMobileActionSheet = ({ preserveTarget = false } = {}) => {
    if (mobileActionSheet) {
      mobileActionSheet.hidden = true;
    }
    document.body.classList.remove("mobile-action-sheet-open");
    mobileShortcuts?.removeAttribute("aria-hidden");
    for (const button of mobileShortcuts?.querySelectorAll('[data-mobile-action="open_mobile_menu"]') || []) {
      button.setAttribute("aria-expanded", "false");
    }
    if (!preserveTarget && contextTarget?.type === "mobile") {
      contextTarget = null;
    }
  };

  const openMobileActionSheet = () => {
    if (!mobileActionSheet || !mobileActionGrid || !isTouchShortcutLayout()) {
      return;
    }
    mobileActionSheetIgnoreClicksUntil = performance.now() + 350;
    blurMobileKeyboard();
    closeContextMenu();
    closeInstanceSwitcher();
    closeThemePicker();
    closeDevicePanel();
    renderMobileActionSheet(buildMobileContextTarget());
    mobileActionSheet.hidden = false;
    document.body.classList.add("mobile-action-sheet-open");
    mobileShortcuts?.setAttribute("aria-hidden", "true");
    for (const button of mobileShortcuts?.querySelectorAll('[data-mobile-action="open_mobile_menu"]') || []) {
      button.setAttribute("aria-expanded", "true");
    }
  };

  const runMobileContextAction = (action) => {
    const target = contextTarget?.type === "mobile" ? contextTarget : buildMobileContextTarget();
    if (!isContextActionEnabled(action, target)) {
      return;
    }
    contextTarget = target;
    closeMobileActionSheet({ preserveTarget: true });
    runContextAction(action);
  };

  const stopMobileSelectionEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const primaryTouch = (event) => event.touches?.[0] || event.changedTouches?.[0] || null;

  const suppressTerminalTouchScroll = (session) => {
    const term = session?.term;
    if (typeof term?.finishTouchScroll === "function") {
      term.finishTouchScroll();
    }
    if (term) {
      term.touchScrollMoved = false;
    }
  };

  const mobileSelectionAutoScrollIntent = (session, clientY) => {
    if (session?.closed || !isTouchSelectionLayout()) {
      return null;
    }
    const term = session?.term;
    const canvas = term?.canvas || term?.element?.querySelector?.("canvas");
    const metrics = term?.renderer?.getMetrics?.();
    const y = Number(clientY);
    if (!term || !canvas || !metrics?.height || !Number.isFinite(y)) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const edge = Math.max(
      1,
      Math.min(rect.height / 3, Math.max(mobileSelectionAutoScrollEdgePx, metrics.height * 1.5)),
    );
    let direction = 0;
    let distance = 0;
    if (y < rect.top + edge) {
      direction = -1;
      distance = rect.top + edge - y;
    } else if (y > rect.bottom - edge) {
      direction = 1;
      distance = y - (rect.bottom - edge);
    }
    if (!direction) {
      return null;
    }
    const lines = Math.max(
      1,
      Math.min(mobileSelectionAutoScrollMaxLines, Math.ceil(distance / Math.max(1, metrics.height))),
    );
    return { direction, lines };
  };

  const stopMobileSelectionAutoScroll = (state) => {
    if (!state) {
      return;
    }
    if (state.autoScrollTimer) {
      window.clearInterval(state.autoScrollTimer);
      state.autoScrollTimer = 0;
    }
    state.autoScrollDirection = 0;
    state.autoScrollApplyPoint = null;
  };

  const terminalViewportLine = (term) => {
    const value = Math.floor(Number(term?.getViewportY?.() ?? term?.viewportY ?? 0));
    return Number.isFinite(value) ? value : 0;
  };

  const updateMobileSelectionAutoScroll = (session, state, applyPoint) => {
    if (!state || typeof applyPoint !== "function") {
      return;
    }
    state.autoScrollApplyPoint = applyPoint;
    const intent = mobileSelectionAutoScrollIntent(session, state.lastY);
    if (!intent) {
      stopMobileSelectionAutoScroll(state);
      return;
    }
    state.autoScrollDirection = intent.direction;
    if (state.autoScrollTimer) {
      return;
    }
    state.autoScrollTimer = window.setInterval(() => {
      const nextIntent = mobileSelectionAutoScrollIntent(session, state.lastY);
      if (!nextIntent || typeof state.autoScrollApplyPoint !== "function") {
        stopMobileSelectionAutoScroll(state);
        return;
      }
      const term = session?.term;
      const before = terminalViewportLine(term);
      suppressTerminalTouchScroll(session);
      try {
        term?.scrollLines?.(nextIntent.direction * nextIntent.lines);
      } catch (error) {
      }
      const applied = state.autoScrollApplyPoint({ clientX: state.lastX, clientY: state.lastY });
      updateMobileSelectionHandles(session);
      if (applied === false) {
        stopMobileSelectionAutoScroll(state);
        return;
      }
      if (terminalViewportLine(term) === before) {
        stopMobileSelectionAutoScroll(state);
      }
    }, mobileSelectionAutoScrollIntervalMs);
  };

  const currentSelectionCells = (session) => {
    const manager = session?.term?.selectionManager;
    if (!manager?.selectionStart || !manager?.selectionEnd) {
      return null;
    }
    return normalizeSelectionCells(
      { col: manager.selectionStart.col, absoluteRow: manager.selectionStart.absoluteRow },
      { col: manager.selectionEnd.col, absoluteRow: manager.selectionEnd.absoluteRow },
    );
  };

  const selectionContainsCell = (selection, cell) => {
    if (!selection || !cell) {
      return false;
    }
    if (cell.absoluteRow < selection.start.absoluteRow || cell.absoluteRow > selection.end.absoluteRow) {
      return false;
    }
    if (selection.start.absoluteRow === selection.end.absoluteRow) {
      return cell.col >= selection.start.col && cell.col <= selection.end.col;
    }
    if (cell.absoluteRow === selection.start.absoluteRow) {
      return cell.col >= selection.start.col;
    }
    if (cell.absoluteRow === selection.end.absoluteRow) {
      return cell.col <= selection.end.col;
    }
    return true;
  };

  const clearMobileSelectionIfTapOutside = (session, touch) => {
    if (!session?.term?.hasSelection?.() || !touch) {
      return false;
    }
    const selection = currentSelectionCells(session);
    const cell = terminalCellFromPoint(session, touch.clientX, touch.clientY);
    if (!selection || !cell || selectionContainsCell(selection, cell)) {
      return false;
    }
    session.selectAllBufferActive = false;
    session.term.clearSelection?.();
    updateSelectionSheet();
    return true;
  };

  const createMobileSelectionHandle = (role) => {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = `mobile-selection-handle ${role}`;
    handle.dataset.selectionHandle = role;
    handle.tabIndex = -1;
    handle.setAttribute("aria-label", role === "start" ? "Adjust selection start" : "Adjust selection end");
    const bar = document.createElement("span");
    bar.className = "mobile-selection-handle-bar";
    const knob = document.createElement("span");
    knob.className = "mobile-selection-handle-knob";
    handle.append(bar, knob);
    return handle;
  };

  const updateSelectionFromHandleTouch = (session, role, touch) => {
    const selection = currentSelectionCells(session);
    const point = terminalCellFromPoint(session, touch.clientX, touch.clientY);
    if (!selection || !point) {
      return false;
    }
    if (role === "start") {
      const nextStart = compareSelectionCells(point, selection.end) >= 0
        ? previousSelectionCell(session, selection.end)
        : point;
      applyTerminalSelection(session, nextStart, selection.end);
      return true;
    }
    const nextEnd = compareSelectionCells(point, selection.start) <= 0
      ? nextSelectionCell(session, selection.start)
      : point;
    applyTerminalSelection(session, selection.start, nextEnd);
    return true;
  };

  const bindMobileSelectionHandle = (session, handle, role) => {
    let dragState = null;
    handle.addEventListener("touchstart", (event) => {
      if (!isTouchSelectionLayout() || event.touches.length !== 1) {
        return;
      }
      stopMobileSelectionAutoScroll(dragState);
      const touch = event.touches[0];
      dragState = {
        lastX: touch.clientX,
        lastY: touch.clientY,
        autoScrollTimer: 0,
        autoScrollDirection: 0,
        autoScrollApplyPoint: null,
      };
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
    }, { passive: false });
    handle.addEventListener("touchmove", (event) => {
      if (!dragState) {
        return;
      }
      const touch = primaryTouch(event);
      if (!touch) {
        return;
      }
      dragState.lastX = touch.clientX;
      dragState.lastY = touch.clientY;
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
      if (updateSelectionFromHandleTouch(session, role, touch)) {
        updateMobileSelectionAutoScroll(session, dragState, (point) => updateSelectionFromHandleTouch(session, role, point));
      }
    }, { passive: false });
    const finish = (event) => {
      if (!dragState) {
        return;
      }
      stopMobileSelectionAutoScroll(dragState);
      dragState = null;
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
      updateMobileSelectionHandles(session);
    };
    handle.addEventListener("touchend", finish, { passive: false });
    handle.addEventListener("touchcancel", finish, { passive: false });
    addSessionCleanup(session, () => {
      stopMobileSelectionAutoScroll(dragState);
      dragState = null;
    });
  };

  const installMobileTouchSelection = (session) => {
    const overlay = document.createElement("div");
    overlay.className = "mobile-selection-overlay";
    overlay.hidden = true;
    const startHandle = createMobileSelectionHandle("start");
    const endHandle = createMobileSelectionHandle("end");
    overlay.append(startHandle, endHandle);
    session.shellEl.appendChild(overlay);
    session.mobileSelectionOverlay = overlay;
    overlay.startHandle = startHandle;
    overlay.endHandle = endHandle;
    bindMobileSelectionHandle(session, startHandle, "start");
    bindMobileSelectionHandle(session, endHandle, "end");

    let touchState = null;
    const clearTouchSelectionTimer = (state = touchState) => {
      if (state?.longPressTimer) {
        window.clearTimeout(state.longPressTimer);
        state.longPressTimer = 0;
      }
    };
    const resetTouchSelectionState = (state = touchState) => {
      clearTouchSelectionTimer(state);
      stopMobileSelectionAutoScroll(state);
      if (!state || touchState === state) {
        touchState = null;
      }
    };
    const updateTouchSelectionFromPoint = (state, point) => {
      if (!state || !point) {
        return false;
      }
      const current = terminalCellFromPoint(session, point.clientX, point.clientY);
      if (!current) {
        return false;
      }
      const currentTabForSession = tabs.get(session.tabId);
      setActivePane(currentTabForSession, session.id, { focus: false });
      session.selectAllBufferActive = false;
      applyTerminalSelection(session, state.startCell, current);
      return true;
    };
    const beginTouchSelection = (state, touch = null) => {
      if (!state || touchState !== state || state.selecting || !isTouchSelectionLayout() || session.closed) {
        return false;
      }
      const current = touch
        ? terminalCellFromPoint(session, touch.clientX, touch.clientY)
        : terminalCellFromPoint(session, state.lastX, state.lastY);
      if (!current) {
        resetTouchSelectionState(state);
        return false;
      }
      clearTouchSelectionTimer(state);
      state.selecting = true;
      blurTerminalInput(session);
      suppressTerminalTouchScroll(session);
      const currentTabForSession = tabs.get(session.tabId);
      setActivePane(currentTabForSession, session.id, { focus: false });
      session.selectAllBufferActive = false;
      applyTerminalSelection(session, state.startCell, current);
      return true;
    };
    session.shellEl.addEventListener("touchstart", (event) => {
      resetTouchSelectionState();
      if (
        !isTouchSelectionLayout()
        || event.touches.length !== 1
        || terminalMouseTrackingState(session)
        || (mobileActionSheet && !mobileActionSheet.hidden)
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".mobile-selection-handle") || !target.closest(".terminal-host")) {
        return;
      }
      const touch = event.touches[0];
      markTerminalTouchContextMenuCandidate(touch);
      const startCell = terminalCellFromPoint(session, touch.clientX, touch.clientY);
      if (!startCell) {
        return;
      }
      touchState = {
        startCell,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        selecting: false,
        longPressTimer: 0,
        autoScrollTimer: 0,
        autoScrollDirection: 0,
        autoScrollApplyPoint: null,
      };
      const state = touchState;
      state.longPressTimer = window.setTimeout(() => {
        beginTouchSelection(state);
      }, touchSelectionLongPressDelayMs);
    }, { capture: true, passive: true });

    session.shellEl.addEventListener("touchmove", (event) => {
      const state = touchState;
      if (!state) {
        return;
      }
      if (event.touches.length !== 1) {
        resetTouchSelectionState(state);
        return;
      }
      const touch = event.touches[0];
      state.lastX = touch.clientX;
      state.lastY = touch.clientY;
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      if (!state.selecting) {
        if (Math.hypot(dx, dy) >= touchSelectionMoveThresholdPx) {
          resetTouchSelectionState(state);
        }
        return;
      }
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
      if (updateTouchSelectionFromPoint(state, touch)) {
        updateMobileSelectionAutoScroll(session, state, (point) => updateTouchSelectionFromPoint(state, point));
      }
    }, { capture: true, passive: false });

    const finishTouchSelection = (event) => {
      const state = touchState;
      if (!state) {
        return;
      }
      const wasSelecting = state.selecting;
      const endTouch = primaryTouch(event);
      const shouldClearSelection = !wasSelecting && clearMobileSelectionIfTapOutside(session, endTouch);
      resetTouchSelectionState(state);
      if (!wasSelecting) {
        if (shouldClearSelection) {
          stopMobileSelectionEvent(event);
        }
        return;
      }
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
      updateMobileSelectionHandles(session);
    };
    session.shellEl.addEventListener("touchend", finishTouchSelection, { capture: true, passive: false });
    session.shellEl.addEventListener("touchcancel", finishTouchSelection, { capture: true, passive: false });
    addSessionCleanup(session, () => resetTouchSelectionState());

    session.term.onScroll?.(() => updateSelectionSheet());
  };

  const installClaudeTerminalTouchAdapter = (session) => {
    const shell = session?.shellEl;
    const host = session?.terminalHost;
    if (!shell || !host || !session?.term) {
      return;
    }

    const activateSessionPane = () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    };
    const terminalMouseEventFromTouch = (event, touch, extra = {}) => ({
      clientX: Number(touch?.clientX) || 0,
      clientY: Number(touch?.clientY) || 0,
      shiftKey: Boolean(event?.shiftKey),
      altKey: Boolean(event?.altKey),
      ctrlKey: Boolean(event?.ctrlKey),
      ...extra,
    });
    const sendWheel = (steps, event, touch) => {
      const count = Math.abs(Math.trunc(Number(steps) || 0));
      if (!count) {
        return false;
      }
      const wheelEvent = terminalMouseEventFromTouch(event, touch, {
        deltaX: 0,
        deltaY: Math.sign(steps),
      });
      const sequence = encodeTerminalMouseSequence(session, wheelEvent, "wheel");
      if (!sequence) {
        return false;
      }
      sendOrQueueInput(session, sequence.repeat(count));
      return true;
    };
    const sendClick = (event, touch) => {
      const mouseEvent = terminalMouseEventFromTouch(event, touch);
      const press = encodeTerminalMouseSequence(session, mouseEvent, "press", 0);
      if (!press) {
        return false;
      }
      const release = encodeTerminalMouseSequence(session, mouseEvent, "release", 0);
      sendOrQueueInput(session, press + release);
      return true;
    };

    installClaudeFullscreenTouchAdapter({
      shell,
      shouldStart: (event) => {
        if (
          !isTouchShortcutLayout()
          || event.touches.length !== 1
          || !isClaudeFullscreenTouchSession(session)
          || (mobileActionSheet && !mobileActionSheet.hidden)
        ) {
          return false;
        }
        const target = event.target;
        return (
          target instanceof Element
          && !target.closest(".mobile-selection-handle")
          && target.closest(".terminal-host") === host
        );
      },
      cellFromPoint: (clientX, clientY) => terminalCellFromPoint(session, clientX, clientY),
      activatePane: activateSessionPane,
      markContextMenuCandidate: markTerminalTouchContextMenuCandidate,
      blurInput: () => blurTerminalInput(session),
      suppressTouchScroll: () => suppressTerminalTouchScroll(session),
      applySelection: (start, end) => {
        session.selectAllBufferActive = false;
        applyTerminalSelection(session, start, end);
      },
      updateSelectionHandles: () => updateMobileSelectionHandles(session),
      updateSelectionAutoScroll: (state, applyPoint) => updateMobileSelectionAutoScroll(session, state, applyPoint),
      stopSelectionAutoScroll: stopMobileSelectionAutoScroll,
      clearSelectionIfTapOutside: (touch) => clearMobileSelectionIfTapOutside(session, touch),
      hasSelection: () => Boolean(session.term?.hasSelection?.() || session.selectAllBufferActive),
      consumeKeyboardClaim: (event) => mobileKeyboardClaimedTouchEnds.delete(event),
      prepareMouseInput: () => claimTerminalSize(session, { force: true }),
      rowHeight: () => {
        const renderer = session.term?.renderer;
        return Math.max(
          touchShortcutMoveThresholdPx,
          Number(renderer?.getMetrics?.().height) || Number(renderer?.charHeight) || 18,
        );
      },
      sendWheel,
      sendClick,
      registerCleanup: (callback) => addSessionCleanup(session, callback),
      moveThresholdPx: touchShortcutMoveThresholdPx,
      longPressDelayMs: touchSelectionLongPressDelayMs,
    });
  };

  const installFullscreenTuiTerminalTouchAdapter = (session, candidate, installer) => {
    const shell = session?.shellEl;
    const host = session?.terminalHost;
    if (!shell || !host || !session?.term) {
      return;
    }

    const activateSessionPane = () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    };
    const terminalMouseEventFromTouch = (event, touch, extra = {}) => ({
      clientX: Number(touch?.clientX) || 0,
      clientY: Number(touch?.clientY) || 0,
      shiftKey: Boolean(event?.shiftKey),
      altKey: Boolean(event?.altKey),
      ctrlKey: Boolean(event?.ctrlKey),
      ...extra,
    });
    const sendWheel = (steps, event, touch) => {
      const count = Math.abs(Math.trunc(Number(steps) || 0));
      if (!count) {
        return false;
      }
      const wheelEvent = terminalMouseEventFromTouch(event, touch, {
        deltaX: 0,
        deltaY: Math.sign(steps),
      });
      const sequence = encodeTerminalMouseSequence(session, wheelEvent, "wheel");
      if (!sequence) {
        return false;
      }
      sendOrQueueInput(session, sequence.repeat(count));
      return true;
    };
    const sendClick = (event, touch) => {
      const mouseEvent = terminalMouseEventFromTouch(event, touch);
      const press = encodeTerminalMouseSequence(session, mouseEvent, "press", 0);
      if (!press) {
        return false;
      }
      const release = encodeTerminalMouseSequence(session, mouseEvent, "release", 0);
      sendOrQueueInput(session, press + release);
      return true;
    };

    installer({
      shell,
      shouldStart: (event) => {
        if (
          !isTouchShortcutLayout()
          || event.touches.length !== 1
          || !candidate(session, { mouseTracking: Boolean(terminalMouseTrackingState(session)) })
          || (mobileActionSheet && !mobileActionSheet.hidden)
        ) {
          return false;
        }
        const target = event.target;
        return (
          target instanceof Element
          && !target.closest(".mobile-selection-handle")
          && target.closest(".terminal-host") === host
        );
      },
      cellFromPoint: (clientX, clientY) => terminalCellFromPoint(session, clientX, clientY),
      activatePane: activateSessionPane,
      markContextMenuCandidate: markTerminalTouchContextMenuCandidate,
      blurInput: () => blurTerminalInput(session),
      suppressTouchScroll: () => suppressTerminalTouchScroll(session),
      applySelection: (start, end) => {
        session.selectAllBufferActive = false;
        applyTerminalSelection(session, start, end);
      },
      updateSelectionHandles: () => updateMobileSelectionHandles(session),
      updateSelectionAutoScroll: (state, applyPoint) => updateMobileSelectionAutoScroll(session, state, applyPoint),
      stopSelectionAutoScroll: stopMobileSelectionAutoScroll,
      clearSelectionIfTapOutside: (touch) => clearMobileSelectionIfTapOutside(session, touch),
      hasSelection: () => Boolean(session.term?.hasSelection?.() || session.selectAllBufferActive),
      consumeKeyboardClaim: (event) => mobileKeyboardClaimedTouchEnds.delete(event),
      prepareMouseInput: () => claimTerminalSize(session, { force: true }),
      rowHeight: () => {
        const renderer = session.term?.renderer;
        return Math.max(
          touchShortcutMoveThresholdPx,
          Number(renderer?.getMetrics?.().height) || Number(renderer?.charHeight) || 18,
        );
      },
      sendWheel,
      sendClick,
      registerCleanup: (callback) => addSessionCleanup(session, callback),
      moveThresholdPx: touchShortcutMoveThresholdPx,
      longPressDelayMs: touchSelectionLongPressDelayMs,
    });
  };

  const installOpencodeTerminalTouchAdapter = (session) => {
    installFullscreenTuiTerminalTouchAdapter(
      session,
      (currentSession, state) => isOpencodeFullscreenTouchCandidate(currentSession, state),
      installOpencodeFullscreenTouchAdapter,
    );
  };

  const installHerdrTerminalTouchAdapter = (session) => {
    installFullscreenTuiTerminalTouchAdapter(
      session,
      (currentSession, state) => isHerdrFullscreenTouchCandidate(currentSession, state),
      installHerdrFullscreenTouchAdapter,
    );
  };

  const installPiTerminalTouchAdapter = (session) => {
    installFullscreenTuiTerminalTouchAdapter(
      session,
      (currentSession, state) => isPiFullscreenTouchCandidate(currentSession, state),
      installPiFullscreenTouchAdapter,
    );
  };

  const installClaudeTerminalContextMenuAdapter = (session) => {
    const shell = session?.shellEl;
    const host = session?.terminalHost;
    if (!shell || !host) {
      return;
    }
    installClaudeFullscreenContextMenuAdapter({
      shell,
      shouldStart: (event) => {
        const target = event?.target;
        return (
          target instanceof Element
          && target.closest(".terminal-host") === host
          && isClaudeFullscreenContextMenuEvent(session, event)
        );
      },
      claimEvent: (event) => terminalLocalMouseClaimedEvents.add(event),
      registerCleanup: (callback) => addSessionCleanup(session, callback),
    });
  };

  const installClaudeTerminalDesktopSelectionAdapter = (session) => {
    const shell = session?.shellEl;
    const host = session?.terminalHost;
    if (!shell || !host) {
      return;
    }
    installClaudeFullscreenDesktopSelectionAdapter({
      shell,
      shouldStart: (event) => {
        const target = event?.target;
        return (
          target instanceof Element
          && target.closest(".terminal-host") === host
          && isClaudeFullscreenDesktopSelectionEvent(session, event)
        );
      },
      claimEvent: (event) => terminalLocalMouseClaimedEvents.add(event),
      sendClick: (event) => {
        const press = encodeTerminalMouseSequence(session, event, "press", 0);
        if (!press) {
          return false;
        }
        const release = encodeTerminalMouseSequence(session, event, "release", 0);
        sendOrQueueInput(session, press + release);
        return true;
      },
      registerCleanup: (callback) => addSessionCleanup(session, callback),
      moveThresholdPx: desktopSelectionCopyMoveThresholdPx,
    });
  };

  const clearReconnectTimer = (session) => {
    if (session?.reconnectTimer) {
      window.clearTimeout(session.reconnectTimer);
      session.reconnectTimer = 0;
    }
    if (session) {
      session.reconnectPending = false;
    }
  };

  const clearSocketHealthTimer = (session) => {
    if (session?.socketHealthTimer) {
      window.clearInterval(session.socketHealthTimer);
      session.socketHealthTimer = 0;
    }
  };

  const clearSocketConnectTimer = (session) => {
    if (session?.socketConnectTimer) {
      window.clearTimeout(session.socketConnectTimer);
      session.socketConnectTimer = 0;
    }
  };

  const clearAttachReadyTimer = (session) => {
    if (session?.attachReadyTimer) {
      window.clearTimeout(session.attachReadyTimer);
      session.attachReadyTimer = 0;
    }
  };

  const clearSocketResumeProbeTimer = (session) => {
    if (session?.resumeProbeTimer) {
      window.clearTimeout(session.resumeProbeTimer);
      session.resumeProbeTimer = 0;
    }
  };

  const clearSessionConnectionTimers = (session) => {
    clearSocketConnectTimer(session);
    clearSocketHealthTimer(session);
    clearAttachReadyTimer(session);
    clearSocketResumeProbeTimer(session);
  };

  const clearInputFlushTimer = (session) => {
    if (session?.inputFlushTimer) {
      window.clearTimeout(session.inputFlushTimer);
      session.inputFlushTimer = 0;
    }
  };

  const clearInputPumpTimer = (session) => {
    if (session?.inputPumpTimer) {
      window.clearTimeout(session.inputPumpTimer);
      session.inputPumpTimer = 0;
    }
  };

  const splitTerminalInputChunks = (data, chunkChars = terminalInputChunkChars) => {
    const value = String(data || "");
    const chunks = [];
    for (let offset = 0; offset < value.length;) {
      let end = Math.min(value.length, offset + chunkChars);
      if (end < value.length) {
        const code = value.charCodeAt(end - 1);
        if (code >= 0xd800 && code <= 0xdbff) {
          end -= 1;
        }
      }
      if (end <= offset) {
        end = Math.min(value.length, offset + 1);
      }
      chunks.push(value.slice(offset, end));
      offset = end;
    }
    return chunks;
  };

  const buildTerminalInputQueueItems = (data, { generated = false, maxBytes = Infinity } = {}) => {
    const items = [];
    let byteLength = 0;
    for (const chunk of splitTerminalInputChunks(data)) {
      const chunkByteLength = textEncoder.encode(chunk).length;
      byteLength += chunkByteLength;
      if (byteLength > maxBytes) {
        return { items: [], byteLength, exceeded: true };
      }
      items.push({
        data: chunk,
        generated: generated === true,
        byteLength: chunkByteLength,
      });
    }
    return { items, byteLength, exceeded: false };
  };

  const isSessionInputReady = (session) => (
    Boolean(
      sessionReplayIsCommitted(session)
      && session.shellEl?.dataset.previewReady !== "true"
      && session.socket?.readyState === WebSocket.OPEN
      && !session.resizeAckPending
      && (
        session.connectionChannel === "unified"
        || (
          session.connectionChannel === "fast"
          && !session.connectionLeaseClosing
          && terminalConnectionScheduler?.currentLease(session)?.leaseID === session.connectionLeaseID
        )
      )
    )
  );

  const isSessionGeneratedInputReady = (session) => (
    Boolean(
      sessionReplayIsCommitted(session)
      && session.shellEl?.dataset.previewReady !== "true"
      && session.socket?.readyState === WebSocket.OPEN
      && !session.resizeAckPending
      && (
        session.connectionChannel === "unified"
        || (
          session.connectionChannel === "fast"
          && !session.connectionLeaseClosing
          && terminalConnectionScheduler?.currentLease(session)?.leaseID === session.connectionLeaseID
        )
      )
    )
  );

  const terminalLocationDescription = (session) => (
    `会话=${String(session?.name || "unknown")}, tab=${String(session?.tabId || "unknown")}, 分屏=${String(session?.id || "unknown")}`
  );

  const clearPendingInputExpiry = (session) => {
    if (session?.pendingInputExpiryTimer) {
      window.clearTimeout(session.pendingInputExpiryTimer);
      session.pendingInputExpiryTimer = 0;
    }
    if (session) {
      session.pendingInputExpiryToken = Number(session.pendingInputExpiryToken || 0) + 1;
      session.pendingInputExpiryLeaseID = 0;
      session.pendingInputExpiryGeneration = 0;
      session.pendingInputExpiryPaused = false;
      session.pendingInputQueuedAt = 0;
    }
  };

  const pausePendingInputExpiry = (session) => {
    if (!session || session.pendingInputSize <= 0) {
      return;
    }
    if (session.pendingInputExpiryTimer) {
      window.clearTimeout(session.pendingInputExpiryTimer);
      session.pendingInputExpiryTimer = 0;
    }
    session.pendingInputExpiryToken = Number(session.pendingInputExpiryToken || 0) + 1;
    session.pendingInputExpiryLeaseID = 0;
    session.pendingInputExpiryGeneration = 0;
    session.pendingInputExpiryPaused = true;
    session.pendingInputQueuedAt = 0;
  };

  const resumePendingInputExpiry = (session) => {
    if (!session || session.closed || session.pendingInputSize <= 0) {
      return;
    }
    session.pendingInputExpiryPaused = false;
    schedulePendingInputExpiry(session);
  };

  const schedulePendingInputExpiry = (session) => {
    if (
      !session
      || session.pendingInputExpiryTimer
      || session.pendingInputSize <= 0
      || session.pendingInputExpiryPaused
    ) {
      return;
    }
    const unifiedGeneration = session.connectionChannel === "unified"
      ? Number(session.connectionChannelGeneration || 0)
      : 0;
    const lease = terminalConnectionScheduler?.currentLease(session);
    const leaseID = unifiedGeneration || Number(lease?.leaseID || session.connectionLeaseID || 0);
    if (
      !leaseID
      || session.connectionLeaseClosing
      || (session.connectionChannel !== "fast" && session.connectionChannel !== "unified")
    ) {
      session.pendingInputExpiryPaused = true;
      return;
    }
    const generation = Number(session.connectionChannelGeneration || 0);
    const expiryToken = Number(session.pendingInputExpiryToken || 0) + 1;
    session.pendingInputExpiryToken = expiryToken;
    session.pendingInputExpiryLeaseID = leaseID;
    session.pendingInputExpiryGeneration = generation;
    session.pendingInputQueuedAt = Date.now();
    session.pendingInputExpiryTimer = window.setTimeout(() => {
      if (session.pendingInputExpiryToken !== expiryToken) {
        return;
      }
      session.pendingInputExpiryTimer = 0;
      session.pendingInputQueuedAt = 0;
      if (session.closed || session.pendingInputSize <= 0) {
        return;
      }
      const currentLease = terminalConnectionScheduler?.currentLease(session);
      const currentLeaseID = session.connectionChannel === "unified"
        ? Number(session.connectionChannelGeneration || 0)
        : Number(currentLease?.leaseID || session.connectionLeaseID || 0);
      const expectedLeaseID = Number(session.pendingInputExpiryLeaseID || leaseID);
      const expectedGeneration = Number(session.pendingInputExpiryGeneration || generation);
      const leaseStillCurrent = currentLeaseID === expectedLeaseID
        && Number(session.connectionChannelGeneration || 0) === expectedGeneration
        && !session.connectionLeaseClosing
        && (
          session.connectionChannel === "unified"
          || (session.connectionChannel === "fast" && session.connectionLeaseID === expectedLeaseID)
        );
      if (!leaseStillCurrent) {
        session.pendingInputExpiryLeaseID = 0;
        session.pendingInputExpiryGeneration = 0;
        session.pendingInputExpiryPaused = true;
        return;
      }
      if (isSessionInputReady(session)) {
        flushPendingInput(session);
        return;
      }
      // A current lease that is still replaying or waiting for its resize ACK
      // is not a terminal failure. Keep the user's input and let the normal
      // health/retry path finish the handoff instead of dropping it at the
      // deadline. The timer is re-armed against this exact lease.
      checkSessionConnectionHealth(session, {
        connect: true,
        force: true,
        allowHidden: true,
      });
      session.pendingInputExpiryLeaseID = 0;
      session.pendingInputExpiryGeneration = 0;
      session.pendingInputExpiryPaused = true;
      resumePendingInputExpiry(session);
    }, terminalPendingInputMaxWaitMs);
  };

  const sendSessionInputChunk = (session, data, { generated = false } = {}) => {
    if (!data || !(generated ? isSessionGeneratedInputReady(session) : isSessionInputReady(session))) {
      return false;
    }
    const { cols, rows, pixelWidth, pixelHeight } = terminalSize(session);
    const payload = { type: "input", data, ...terminalThemePayload() };
    if (generated) {
      payload.generated = true;
    } else if (cols > 0 && rows > 0) {
      payload.cols = cols;
      payload.rows = rows;
      payload.pixel_width = pixelWidth;
      payload.pixel_height = pixelHeight;
      const resizeEpoch = normalizeTerminalResizeEpoch(session.appliedResizeEpoch);
      if (resizeEpoch) {
        payload.resize_epoch = resizeEpoch;
      }
    }
    try {
      session.socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  };

  const flushInputBuffer = (session) => {
    if (!session) {
      return;
    }
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    clearInputFlushTimer(session);
    if (!session.inputBuffer || !isSessionInputReady(session) || !checkSessionConnectionHealth(session, { connect: true })) {
      return;
    }
    const data = session.inputBuffer;
    session.inputBuffer = "";
    session.inputBufferSize = 0;
    if (!sendSessionInputChunk(session, data)) {
      session.inputBuffer = data + session.inputBuffer;
      session.inputBufferSize += textEncoder.encode(data).length;
      checkSessionConnectionHealth(session, { connect: true, force: true });
    }
  };

  const scheduleInputFlush = (session) => {
    if (session.inputFlushTimer) {
      return;
    }
    session.inputFlushTimer = window.setTimeout(() => flushInputBuffer(session), terminalInputFlushDelayMs);
  };

  const scheduleQueuedInputPump = (session, delay = 0) => {
    if (!session || session.inputPumpTimer) {
      return;
    }
    session.inputPumpTimer = window.setTimeout(() => {
      session.inputPumpTimer = 0;
      pumpQueuedInput(session);
    }, delay);
  };

  const enqueueSessionInput = (session, data, { generated = false, front = false } = {}) => {
    if (!session || !data) {
      return false;
    }
    const availableBytes = generated ? Infinity : Math.max(0, maxQueuedInputBytes - session.inputQueueSize);
    const { items, byteLength, exceeded } = buildTerminalInputQueueItems(data, { generated, maxBytes: availableBytes });
    if (exceeded) {
      if (!generated) {
        showToast("粘贴内容过大，已丢弃部分输入。");
      }
      return false;
    }
    if (items.length === 0) {
      return true;
    }
    if (front) {
      session.inputQueue.unshift(...items);
    } else {
      session.inputQueue.push(...items);
    }
    session.inputQueueSize += byteLength;
    scheduleQueuedInputPump(session);
    return true;
  };

  const pumpQueuedInput = (session) => {
    if (!session || session.inputPumpActive) {
      return;
    }
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    session.inputPumpActive = true;
    try {
      if (session.inputBuffer) {
        flushInputBuffer(session);
        if (session.inputBuffer) {
          scheduleQueuedInputPump(session, terminalInputBackpressureDelayMs);
          return;
        }
      }
      let sent = 0;
      while (session.inputQueue.length > 0 && isSessionInputReady(session) && checkSessionConnectionHealth(session, { connect: true })) {
        const bufferedAmount = Number(session.socket.bufferedAmount || 0);
        if (bufferedAmount > terminalInputBackpressureBytes) {
          scheduleQueuedInputPump(session, terminalInputBackpressureDelayMs);
          return;
        }
        const item = session.inputQueue.shift();
        session.inputQueueSize = Math.max(0, session.inputQueueSize - item.byteLength);
        if (!sendSessionInputChunk(session, item.data, { generated: item.generated })) {
          session.inputQueue.unshift(item);
          session.inputQueueSize += item.byteLength;
          scheduleQueuedInputPump(session, terminalInputBackpressureDelayMs);
          return;
        }
        sent += 1;
        if (sent >= terminalInputPumpChunkBudget) {
          scheduleQueuedInputPump(session, 0);
          return;
        }
      }
    } finally {
      session.inputPumpActive = false;
    }
    if (session.inputQueue.length > 0 && isSessionInputReady(session) && checkSessionConnectionHealth(session, { connect: true })) {
      scheduleQueuedInputPump(session, terminalInputBackpressureDelayMs);
    }
  };

  const sendSessionInput = (session, data, { immediate = false, generated = false } = {}) => {
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    if (!data || !(generated ? isSessionGeneratedInputReady(session) : isSessionInputReady(session)) || !checkSessionConnectionHealth(session, { connect: true })) {
      return;
    }
    if (!generated && shouldSuppressGeneratedTerminalInput(session, data)) {
      return;
    }
    if (generated) {
      sendSessionInputChunk(session, data, { generated: true });
      return;
    }
    if (String(data).length > terminalInputChunkChars || session.inputQueue.length > 0) {
      enqueueSessionInput(session, data);
      return;
    }
    const byteLength = textEncoder.encode(data).length;
    if (session.inputBufferSize + byteLength > maxBufferedInputBytes) {
      flushInputBuffer(session);
    }
    if (byteLength > maxBufferedInputBytes) {
      enqueueSessionInput(session, data);
      return;
    }
    session.inputBuffer += data;
    session.inputBufferSize += byteLength;
    if (immediate || byteLength <= terminalInteractiveInputImmediateMaxBytes || session.inputBufferSize >= 4096) {
      flushInputBuffer(session);
    } else {
      scheduleInputFlush(session);
    }
  };

  const flushPendingInput = (session) => {
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    if (!isSessionInputReady(session) || !checkSessionConnectionHealth(session, { connect: true })) {
      return;
    }
    for (const data of session.pendingInput || []) {
      sendSessionInput(session, data);
    }
    session.pendingInput = [];
    session.pendingInputSize = 0;
    clearPendingInputExpiry(session);
    flushInputBuffer(session);
    scheduleQueuedInputPump(session);
  };

  const enqueuePendingInput = (session, data, { parked = false } = {}) => {
    const pendingLimit = parked ? Math.min(maxPendingInputBytes, maxParkedPendingInputBytes) : maxPendingInputBytes;
    const availablePendingBytes = Math.max(0, pendingLimit - session.pendingInputSize);
    const { byteLength, exceeded } = buildTerminalInputQueueItems(data, { maxBytes: availablePendingBytes });
    if (exceeded) {
      return false;
    }
    if (session.pendingInputSize + byteLength > pendingLimit) {
      return false;
    }
    session.pendingInput.push(data);
    session.pendingInputSize += byteLength;
    schedulePendingInputExpiry(session);
    return true;
  };

  const sendOrQueueInput = (session, data, { userInput = true } = {}) => {
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    if (shouldSuppressGeneratedTerminalInput(session, data)) {
      return;
    }
    if (
      !userInput
      && data
      && session?.connectionChannel === "unified"
      && session.socket?.readyState === WebSocket.OPEN
    ) {
      try {
        session.socket.send(JSON.stringify({
          type: "input",
          data,
          generated: true,
          ...terminalThemePayload(),
        }));
      } catch (error) {
        recycleTerminalUnifiedSession(session, "unified generated input failed");
      }
      return;
    }
    const connectionWasParked = Boolean(
      session?.connectionLeaseClosing
      || (isClientInstanceName(session?.name) && !terminalConnectionScheduler?.currentLease(session))
    );
    if (data && userInput) {
      markSessionUserInput(session);
      scrollTerminalToBottomForUserInput(session);
      requestSessionConnection(session, {
        reason: "user_input",
        userInteraction: true,
        immediate: true,
        allowHidden: true,
      });
    }
    if (session.closed || session.exitExpected) {
      return;
    }
    if (/[\r\n]/.test(data)) {
      scheduleActivityRefresh(450);
    }
    if (isSessionInputReady(session) && checkSessionConnectionHealth(session, { connect: true, force: userInput, allowHidden: userInput })) {
      sendSessionInput(session, data, { immediate: /[\r\n\x03\x04]/.test(data) });
      return;
    }
    if (!enqueuePendingInput(session, data, { parked: connectionWasParked })) {
      appendDebugError(
        "终端待发送输入超过限制",
        `${session.name}/${session.id}, parked=${connectionWasParked}, bytes=${session.pendingInputSize}`,
      );
      showToast(connectionWasParked
        ? "终端尚未恢复，待发送输入已达到 256 KiB 上限。"
        : "待发送输入过大，已拒绝继续排队。");
    }
    checkSessionConnectionHealth(session, { connect: true });
  };

  const clearSessionOutputFlushSchedule = (session) => {
    if (!session) {
      return;
    }
    if (session.outputFlushFrame) {
      window.cancelAnimationFrame(session.outputFlushFrame);
      session.outputFlushFrame = 0;
    }
    if (session.outputFlushTimer) {
      window.clearTimeout(session.outputFlushTimer);
      session.outputFlushTimer = 0;
    }
  };

  const parseHistoryCursor = (value) => {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) {
      return null;
    }
    try {
      return BigInt(text);
    } catch (error) {
      return null;
    }
  };

  const clearSessionHistoryCacheWriteSchedule = (session) => {
    if (!session) {
      return;
    }
    if (session.historyCacheWriteFrame) {
      window.cancelAnimationFrame(session.historyCacheWriteFrame);
      session.historyCacheWriteFrame = 0;
    }
    if (session.historyCacheWriteTimer) {
      window.clearTimeout(session.historyCacheWriteTimer);
      session.historyCacheWriteTimer = 0;
    }
  };

  const withTerminalCacheTimeout = (promise, timeoutMs, message) => new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    }, timeoutMs);
    Promise.resolve(promise).then((value) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      }
    }, (error) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      }
    });
  });

  const withTerminalCacheProgressTimeout = (operation, timeoutMs, message) => new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const arm = () => {
      if (settled) {
        throw new Error(message);
      }
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      }, timeoutMs);
    };
    arm();
    Promise.resolve().then(() => operation(arm)).then((value) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      }
    }, (error) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      }
    });
  });

  const disableSessionHistoryCache = (session, error = null) => {
    if (!session) {
      return;
    }
    clearSessionHistoryCacheWriteSchedule(session);
    if (session.cacheV2PreviewCaptureTimer) {
      window.clearTimeout(session.cacheV2PreviewCaptureTimer);
      session.cacheV2PreviewCaptureTimer = 0;
    }
    if (session.cacheV2PreviewCaptureIdle && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(session.cacheV2PreviewCaptureIdle);
      session.cacheV2PreviewCaptureIdle = 0;
    }
    session.historyCacheDisabled = true;
    session.historyCacheWriteQueue = [];
    session.historyCacheWriteBytes = 0;
    session.historyCacheSnapshot = null;
    session.historyCacheReplayCommitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;
    session.historyCacheReplayCommitPending = false;
    session.cacheV2WarmReplaySeq = Number(session.cacheV2WarmReplaySeq || 0) + 1;
    session.cacheV2WarmReplayActive = false;
    session.cacheV2WarmReplayReady = false;
    session.cacheV2WarmReplayPromise = null;
    session.cacheV2WarmReplaySnapshot = null;
    session.cacheV2ServerSnapshotPending = false;
    session.cacheV2ServerSnapshotStartCursor = 0n;
    session.cacheV2ReplayActive = false;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    session.cacheV2PreviewCaptureSeq = Number(session.cacheV2PreviewCaptureSeq || 0) + 1;
    session.cacheV2PreviewCapturePending = false;
    session.cacheV2PreviewCaptureRunning = false;
    hideSessionTerminalPreview(session);
    clearSessionCacheV2PreparedPreview(session);
    clearSessionCacheV2OverviewPreview(session);
    if (error) {
      console.warn("[terminal-history] local cache disabled", {
        name: session.name,
        pane: session.id,
        error: error?.message || String(error),
      });
    }
    const cacheV2Identity = terminalCacheV2.available ? storedSessionTerminalCacheV2Identity(session) : null;
    if (cacheV2Identity) {
      terminalCacheV2.deletePane(cacheV2Identity).catch(() => {});
    } else if (sessionUsesLegacyHistoryCache(session)) {
      terminalHistoryCache.deletePane(session.name, session.id).catch(() => {});
    }
  };

  const prepareSessionHistoryCache = async (session) => {
    if (!session || session.historyCacheLoaded) {
      if (session) {
        session.historyCacheLoaded = true;
      }
      return session?.historyCacheSnapshot || null;
    }
    if (session.historyCacheLoadPromise) {
      return session.historyCacheLoadPromise;
    }
    const cacheV2Identity = sessionTerminalCacheV2Identity(session);
    const legacyCache = sessionUsesLegacyHistoryCache(session);
    if (!cacheV2Identity && !legacyCache) {
      session.historyCacheDisabled = true;
      session.historyCacheLoaded = true;
      session.historyCacheSnapshot = null;
      return null;
    }
    const loadSeq = Number(session.historyCacheLoadSeq || 0) + 1;
    session.historyCacheLoadSeq = loadSeq;
    const load = cacheV2Identity
      ? withTerminalCacheTimeout(
        terminalCacheV2.loadManifest(cacheV2Identity),
        terminalCacheV2ManifestTimeoutMs,
        "Terminal cache manifest read timed out.",
      )
      : terminalHistoryCache.load(session.name, session.id);
    session.historyCacheLoadPromise = load
      .then((snapshot) => {
        if (
          session.closed
          || session.historyCacheLoadSeq !== loadSeq
          || (cacheV2Identity && !sessionUsesTerminalCacheV2(session))
          || (!cacheV2Identity && !sessionUsesLegacyHistoryCache(session))
        ) {
          return null;
        }
        if (snapshot && !terminalCacheV2.historyWindowMatches(snapshot, terminalOptionsBase.scrollback)) {
          session.historyCacheSnapshot = null;
          session.historyCacheLoaded = true;
          session.historyCacheWindowMismatch = true;
          return null;
        }
        session.historyCacheSnapshot = snapshot;
        if (snapshot) {
          session.historyGeneration = snapshot.historyGeneration || snapshot.generation;
          session.localBaseCursor = snapshot.baseCursor;
          session.persistedHistoryCursor = snapshot.endCursor;
        }
        return snapshot;
      })
      .catch((error) => {
        if (session.historyCacheLoadSeq !== loadSeq) {
          return null;
        }
        disableSessionHistoryCache(session, error);
        return null;
      })
      .finally(() => {
        if (session.historyCacheLoadSeq !== loadSeq) {
          return;
        }
        session.historyCacheLoaded = true;
        session.historyCacheLoadPromise = null;
      });
    return session.historyCacheLoadPromise;
  };

  const flushSessionHistoryCacheWrites = (session) => {
    if (!session || session.historyCacheDisabled || session.historyCacheWriteQueue.length === 0) {
      return session?.historyCacheWritePromise || Promise.resolve();
    }
    clearSessionHistoryCacheWriteSchedule(session);
    const chunks = session.historyCacheWriteQueue;
    session.historyCacheWriteQueue = [];
    session.historyCacheWriteBytes = 0;
    const generation = session.historyGeneration;
    const cacheV2Identity = sessionTerminalCacheV2Identity(session, generation);
    const legacyCache = sessionUsesLegacyHistoryCache(session);
    if (!cacheV2Identity && !legacyCache) {
      disableSessionHistoryCache(session);
      return session.historyCacheWritePromise;
    }
    session.historyCacheWritePromise = session.historyCacheWritePromise
      .then(() => session.historyCacheResetPromise)
      .then(() => (cacheV2Identity ? terminalCacheV2 : terminalHistoryCache).append(
        ...(cacheV2Identity
          ? [cacheV2Identity, generation, chunks]
          : [session.name, session.id, generation, chunks]), {
        limitBytes: Math.max(1, Number(terminalOptionsBase.scrollback || 0) * averageTerminalHistoryBytesPerLine),
        historyWindowLines: terminalOptionsBase.scrollback,
      }))
      .then((result) => {
        if (!result || session.closed || session.historyGeneration !== generation) {
          return;
        }
        session.localBaseCursor = result.baseCursor;
        session.persistedHistoryCursor = result.endCursor;
        scheduleSessionCacheV2PreviewCapture(session);
      })
      .catch((error) => disableSessionHistoryCache(session, error));
    return session.historyCacheWritePromise;
  };

  const scheduleSessionHistoryCacheWrite = (session) => {
    if (!session || session.historyCacheDisabled || session.historyCacheWriteFrame || session.historyCacheWriteTimer) {
      return;
    }
    const flush = () => flushSessionHistoryCacheWrites(session);
    if (sessionUsesTerminalCacheV2(session)) {
      session.historyCacheWriteTimer = window.setTimeout(flush, terminalCacheV2FlushDelayMs);
    } else {
      session.historyCacheWriteFrame = window.requestAnimationFrame(flush);
      session.historyCacheWriteTimer = window.setTimeout(flush, terminalHistoryCacheFlushDelayMs);
    }
  };

  const queueSessionHistoryCacheWrite = (session, data, startCursor, endCursor) => {
    if (
      !session ||
      session.historyCacheDisabled ||
      !session.historyGeneration ||
      !(data instanceof Uint8Array) ||
      endCursor <= startCursor
    ) {
      return;
    }
    session.historyCacheWriteQueue.push({ startCursor, endCursor, data });
    session.historyCacheWriteBytes += data.byteLength;
    const flushBytes = sessionUsesTerminalCacheV2(session)
      ? terminalCacheV2FlushBytes
      : terminalHistoryCacheFlushBytes;
    if (session.historyCacheWriteBytes >= flushBytes) {
      flushSessionHistoryCacheWrites(session);
    } else {
      scheduleSessionHistoryCacheWrite(session);
    }
  };

  const resetSessionHistoryCache = (session, generation, cursor, { preservePreview = false } = {}) => {
    if (!session) {
      return;
    }
    const previewPreparation = preservePreview ? session.cacheV2PreviewPreparePromise : null;
    clearSessionHistoryCacheWriteSchedule(session);
    session.historyCacheWriteQueue = [];
    session.historyCacheWriteBytes = 0;
    session.historyCacheSnapshot = null;
    clearSessionCacheV2OverviewPreview(session);
    if (!preservePreview) {
      clearSessionCacheV2PreparedPreview(session);
    }
    const previousWrites = session.historyCacheWritePromise;
    const cacheV2Identity = sessionTerminalCacheV2Identity(session, generation);
    const legacyCache = sessionUsesLegacyHistoryCache(session);
    if (!cacheV2Identity && !legacyCache) {
      session.historyCacheDisabled = true;
      session.historyCacheResetPromise = Promise.resolve();
      return;
    }
    session.historyCacheDisabled = false;
    session.historyCacheResetPromise = Promise.resolve(previousWrites)
      .catch(() => {})
      .then(() => previewPreparation ? Promise.resolve(previewPreparation).catch(() => null) : null)
      .then(() => cacheV2Identity
        ? terminalCacheV2.reset(cacheV2Identity, generation, cursor, {
          historyWindowLines: terminalOptionsBase.scrollback,
        })
        : terminalHistoryCache.reset(session.name, session.id, generation, cursor))
      .then((result) => {
        if (session.closed || session.historyGeneration !== generation) {
          return;
        }
        session.localBaseCursor = result.baseCursor;
        session.persistedHistoryCursor = result.endCursor;
      })
      .catch((error) => disableSessionHistoryCache(session, error));
  };

  const deleteSessionHistoryCache = (session) => {
    const cacheV2Identity = terminalCacheV2.available ? storedSessionTerminalCacheV2Identity(session) : null;
    const deletion = cacheV2Identity
      ? terminalCacheV2.deletePane(cacheV2Identity)
      : sessionUsesLegacyHistoryCache(session)
        ? terminalHistoryCache.deletePane(session?.name, session?.id)
        : Promise.resolve(false);
    return deletion.catch((error) => {
      console.warn("[terminal-history] cache delete failed", {
        name: session?.name,
        pane: session?.id,
        error: error?.message || String(error),
      });
    });
  };

  const destroySessionHistoryCache = async (session) => {
    if (!session) {
      return;
    }
    if (session.historyCacheDestroyPromise) {
      return session.historyCacheDestroyPromise;
    }
    session.historyCacheDestroyPromise = (async () => {
      clearSessionHistoryCacheWriteSchedule(session);
      session.historyCacheDisabled = true;
      session.historyCacheWriteQueue = [];
      session.historyCacheWriteBytes = 0;
      clearSessionCacheV2PreparedPreview(session);
      await Promise.allSettled([
        session.historyCacheResetPromise,
        session.historyCacheWritePromise,
      ]);
      await deleteSessionHistoryCache(session);
    })();
    return session.historyCacheDestroyPromise;
  };

  const flushAllSessionHistoryCaches = () => {
    const writes = [];
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        writes.push(flushSessionHistoryCacheWrites(pane));
      }
    }
    return Promise.allSettled(writes);
  };

  const touchAllSessionHistoryCaches = () => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (!pane.historyCacheDisabled && pane.historyGeneration) {
          const cacheV2Identity = sessionTerminalCacheV2Identity(pane, pane.historyGeneration);
          if (cacheV2Identity) {
            const now = Date.now();
            if (now - Number(pane.cacheV2LastTouchAt || 0) >= terminalCacheV2TouchIntervalMs) {
              pane.cacheV2LastTouchAt = now;
              terminalCacheV2.touch(cacheV2Identity).catch(() => {});
            }
          } else if (sessionUsesLegacyHistoryCache(pane)) {
            terminalHistoryCache.touch(pane.name, pane.id).catch(() => {});
          }
        }
      }
    }
  };

  const sessionHistoryRangeForConnect = (session) => {
    if (!session?.historyGeneration || session.resetOnNextReplay) {
      return null;
    }
    if (session.historyStateReady) {
      return {
        generation: session.historyGeneration,
        baseCursor: session.localBaseCursor,
        endCursor: session.appliedHistoryCursor,
        source: "memory",
      };
    }
    if (session.historyCacheDisabled) {
      return null;
    }
    const snapshot = session.historyCacheSnapshot;
    const snapshotGeneration = snapshot?.historyGeneration || snapshot?.generation || "";
    if (snapshot && snapshotGeneration === session.historyGeneration) {
      return {
        generation: snapshotGeneration,
        baseCursor: snapshot.baseCursor,
        endCursor: snapshot.endCursor,
        source: snapshot.historyGeneration ? "cache-v2" : "cache",
      };
    }
    return null;
  };

  const cacheV2ReplayIdentityFromMessage = (message) => ({
    cacheProtocolVersion: Number(message?.cache_protocol_version || 0),
    cacheScopeID: String(message?.cache_scope_id || "").trim(),
    selector: String(message?.selector || "").trim(),
    workspaceGeneration: String(message?.workspace_generation || "").trim(),
    tabID: String(message?.tab_id || "").trim(),
    paneID: String(message?.pane_id || "").trim(),
    historyGeneration: String(message?.history_generation || "").trim(),
  });

  const validateSessionCacheV2MessageIdentity = (session, message, historyGeneration) => {
    if (!sessionHasTerminalCacheV2Protocol(session)) {
      return true;
    }
    const expected = sessionTerminalCacheV2ProtocolIdentity(session, historyGeneration);
    const actual = cacheV2ReplayIdentityFromMessage(message);
    return Boolean(expected && terminalCacheV2.identityMatches(expected, actual, { requireHistory: true }));
  };

  const validateSessionCacheV2ReplayIdentity = (session, message, snapshot, deltaFromCursor) => {
    if (!sessionUsesTerminalCacheV2(session) || !snapshot || !snapshot.historyGeneration) {
      return false;
    }
    const expected = sessionTerminalCacheV2Identity(session, snapshot.historyGeneration);
    const actual = cacheV2ReplayIdentityFromMessage(message);
    if (!expected || !terminalCacheV2.identityMatches(expected, actual, { requireHistory: true })) {
      return false;
    }
    return snapshot.endCursor === deltaFromCursor;
  };

  const validateSessionCacheV2PreviewIdentity = (
    session,
    message,
    snapshot,
    syncMode,
    deltaFromCursor,
    serverEndCursor,
  ) => {
    if (
      !sessionUsesTerminalCacheV2(session)
      || !snapshot?.preview
      || !snapshot.historyGeneration
      || serverEndCursor === null
    ) {
      return false;
    }
    const expected = sessionTerminalCacheV2Identity(session, snapshot.historyGeneration);
    const actual = cacheV2ReplayIdentityFromMessage(message);
    if (!expected || !terminalCacheV2.identityMatches(expected, actual, { requireHistory: true })) {
      return false;
    }
    if (syncMode === "snapshot") {
      return snapshot.endCursor <= serverEndCursor;
    }
    return (syncMode === "delta" || syncMode === "current") && snapshot.endCursor === deltaFromCursor;
  };

  const setSessionCacheV2PreviewMiss = (session, reason) => {
    const metrics = session?.cacheV2RecoveryMetrics;
    if (metrics && !metrics.previewMissReason) {
      metrics.previewMissReason = String(reason || "unknown");
    }
  };

  const sessionCacheV2PreviewMatchesSnapshot = (prepared, snapshot) => {
    if (!prepared || !snapshot || prepared.historyGeneration !== snapshot.historyGeneration || prepared.endCursor !== snapshot.endCursor) {
      return false;
    }
    try {
      return terminalCacheV2.identityMatches(prepared.identity, snapshot, { requireHistory: true });
    } catch (error) {
      return false;
    }
  };

  const decodeSessionCacheV2Preview = (objectURL) => new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (error = null) => {
      if (settled) {
        return;
      }
      settled = true;
      image.onload = null;
      image.onerror = null;
      if (error) {
        reject(error);
      } else {
        resolve(image);
      }
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Terminal cache preview image decode failed."));
    image.src = objectURL;
    if (typeof image.decode === "function") {
      image.decode().then(() => finish()).catch(() => {});
    }
  });

  const prepareSessionCacheV2Preview = (session, snapshot) => {
    clearSessionCacheV2PreparedPreview(session);
    if (!sessionUsesTerminalCacheV2(session) || !snapshot?.preview) {
      setSessionCacheV2PreviewMiss(session, snapshot ? "manifest-preview-missing" : "manifest-missing");
      return Promise.resolve(null);
    }
    const prepareSeq = session.cacheV2PreviewPrepareSeq;
    let pendingObjectURL = "";
    let preparePromise = null;
    preparePromise = withTerminalCacheTimeout((async () => {
      const preview = await terminalCacheV2.loadPreview(snapshot);
      if (!preview) {
        setSessionCacheV2PreviewMiss(session, "preview-record-missing");
        return null;
      }
      pendingObjectURL = URL.createObjectURL(preview.blob);
      await decodeSessionCacheV2Preview(pendingObjectURL);
      if (
        session.closed
        || session.cacheV2PreviewPrepareSeq !== prepareSeq
        || !sessionUsesTerminalCacheV2(session)
        || (
          session.historyCacheSnapshot !== snapshot
          && session.cacheV2PreviewAuthorizedSnapshot !== snapshot
        )
      ) {
        return null;
      }
      const prepared = {
        objectURL: pendingObjectURL,
        identity: snapshot,
        historyGeneration: snapshot.historyGeneration,
        endCursor: snapshot.endCursor,
        metadata: preview.metadata,
      };
      pendingObjectURL = "";
      session.cacheV2PreparedPreview = prepared;
      markSessionCacheV2RecoveryMetric(session, "previewPreparedAt");
      appendStartupTrace("终端预览已准备", `pane=${session.id}`, { dedupeKey: `preview-prepared:${session.id}:${session.terminalReplayGeneration}` });
      return prepared;
      })(), terminalCacheV2PreviewTimeoutMs, "Terminal cache preview prepare timed out.")
      .catch((error) => {
        if (session.cacheV2PreviewPrepareSeq === prepareSeq) {
          session.cacheV2PreviewPrepareSeq += 1;
        }
        setSessionCacheV2PreviewMiss(session, "preview-prepare-failed");
        console.warn("[terminal-cache-v2] preview prepare failed", {
          name: session.name,
          pane: session.id,
          error: error?.message || String(error),
        });
        return null;
      })
      .finally(() => {
        if (pendingObjectURL) {
          URL.revokeObjectURL(pendingObjectURL);
        }
        if (session.cacheV2PreviewPreparePromise === preparePromise) {
          session.cacheV2PreviewPreparePromise = null;
        }
      });
    session.cacheV2PreviewPreparePromise = preparePromise;
    return preparePromise;
  };

  const showSessionCacheV2Preview = async (session, snapshot, currentSocket, replayGeneration) => {
    const previewElement = session?.terminalPreview;
    if (!previewElement || !snapshot?.preview || session.socket !== currentSocket) {
      setSessionCacheV2PreviewMiss(session, snapshot?.preview ? "preview-element-missing" : "manifest-preview-missing");
      return false;
    }
    if (session.cacheV2PreviewAuthorizedSnapshot !== snapshot) {
      setSessionCacheV2PreviewMiss(session, "preview-not-authorized");
      return false;
    }
    let prepared = sessionCacheV2PreviewMatchesSnapshot(session.cacheV2PreparedPreview, snapshot)
      ? session.cacheV2PreparedPreview
      : null;
    if (!prepared) {
      const pending = session.cacheV2PreviewPreparePromise || prepareSessionCacheV2Preview(session, snapshot);
      prepared = await pending;
    }
    if (!sessionCacheV2PreviewMatchesSnapshot(prepared, snapshot)) {
      setSessionCacheV2PreviewMiss(session, "prepared-preview-mismatch");
      return false;
    }
    if (
      session.socket !== currentSocket
      || session.terminalReplayGeneration !== replayGeneration
      || !sessionReplayHasIdentifiedAuthorization(session)
      || sessionReplayIsCommitted(session)
      || !sessionUsesTerminalCacheV2(session)
    ) {
      setSessionCacheV2PreviewMiss(session, "preview-session-changed");
      return false;
    }
    const { cols, rows } = terminalSize(session);
    const metadata = prepared.metadata;
    const canvas = session.term?.canvas || session.term?.renderer?.getCanvas?.();
    const layoutMatches = Boolean(
      metadata.cols === cols
      && metadata.rows === rows
      && metadata.themeFingerprint === terminalCacheV2ThemeFingerprint()
      && Math.abs(metadata.devicePixelRatio - (window.devicePixelRatio || 1)) <= 0.01
      && canvas instanceof HTMLCanvasElement
      && metadata.width === canvas.width
      && metadata.height === canvas.height
    );
    hideSessionTerminalPreview(session);
    session.cacheV2PreparedPreview = null;
    session.cacheV2PreviewURL = prepared.objectURL;
    previewElement.src = prepared.objectURL;
    previewElement.hidden = false;
    session.shellEl.dataset.previewReady = "true";
    const metrics = session.cacheV2RecoveryMetrics;
    if (metrics) {
      metrics.previewHit = true;
      metrics.previewLayoutMatch = layoutMatches;
      metrics.previewMissReason = "";
      markSessionCacheV2RecoveryMetric(session, "previewVisibleAt");
    }
    console.info("[terminal-cache-v2] preview visible", JSON.stringify({ layoutMatches }));
    return true;
  };

  const showSessionCacheV2LocalPreview = async (session, snapshot) => {
    if (
      !session
      || session.closed
      || session.name !== activeName
      || session.renderReady
      || sessionReplayIsCommitted(session)
      || !sessionUsesTerminalCacheV2(session)
      || !snapshot?.preview
      || session.historyCacheSnapshot !== snapshot
    ) {
      return false;
    }
    let prepared = sessionCacheV2PreviewMatchesSnapshot(session.cacheV2PreparedPreview, snapshot)
      ? session.cacheV2PreparedPreview
      : null;
    if (!prepared) {
      const pending = session.cacheV2PreviewPreparePromise || prepareSessionCacheV2Preview(session, snapshot);
      prepared = await pending;
    }
    if (
      session.closed
      || session.name !== activeName
      || session.renderReady
      || sessionReplayIsCommitted(session)
      || !sessionUsesTerminalCacheV2(session)
      || session.historyCacheSnapshot !== snapshot
      || !sessionCacheV2PreviewMatchesSnapshot(prepared, snapshot)
    ) {
      return false;
    }
    hideSessionTerminalPreview(session);
    session.cacheV2PreparedPreview = null;
    session.cacheV2PreviewURL = prepared.objectURL;
    session.cacheV2PreviewAuthorizedSnapshot = snapshot;
    session.terminalPreview.src = prepared.objectURL;
    session.terminalPreview.hidden = false;
    session.shellEl.dataset.previewReady = "true";
    const metrics = session.cacheV2RecoveryMetrics;
    if (metrics && !metrics.previewVisibleAt) {
      metrics.previewHit = true;
      metrics.previewLayoutMatch = true;
      metrics.previewMissReason = "";
      markSessionCacheV2RecoveryMetric(session, "previewVisibleAt");
    }
    console.info("[terminal-cache-v2] local preview visible");
    return true;
  };

  const revealSessionCacheV2Preview = (
    session,
    message,
    snapshot,
    syncMode,
    deltaFromCursor,
    serverEndCursor,
    currentSocket,
  ) => {
    if (!snapshot?.preview) {
      return false;
    }
    const authorized = sessionReplayHasIdentifiedAuthorization(session)
      && validateSessionCacheV2PreviewIdentity(
        session,
        message,
        snapshot,
        syncMode,
        deltaFromCursor,
        serverEndCursor,
      );
    console.info("[terminal-cache-v2] preview decision", JSON.stringify({
      syncMode,
      authorized,
      prepared: sessionCacheV2PreviewMatchesSnapshot(session.cacheV2PreparedPreview, snapshot),
    }));
    if (!authorized) {
      setSessionCacheV2PreviewMiss(session, "preview-replay-identity-mismatch");
      return false;
    }
    session.cacheV2PreviewAuthorizedSnapshot = snapshot;
    showSessionCacheV2Preview(
      session,
      snapshot,
      currentSocket,
      session.terminalReplayGeneration,
    ).catch((error) => {
      console.warn("[terminal-cache-v2] preview load failed", {
        name: session.name,
        pane: session.id,
        error: error?.message || String(error),
      });
    });
    return true;
  };

  const sessionCacheV2WarmReplayMatchesSnapshot = (session, snapshot) => Boolean(
    session
    && snapshot
    && session.cacheV2WarmReplaySnapshot === snapshot
    && session.cacheV2WarmReplayGeneration === session.terminalReplayGeneration
    && (session.cacheV2WarmReplayActive || session.cacheV2WarmReplayReady)
  );

  const drainSessionCacheV2NetworkQueue = (session) => {
    const queued = session.cacheV2NetworkQueue;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    for (const data of queued) {
      writeSessionOutput(session, data);
    }
    flushSessionOutput(session, { force: true });
  };

  const failSessionCacheV2WarmReplay = (session, replaySeq, error) => {
    if (!session || session.closed || session.cacheV2WarmReplaySeq !== replaySeq) {
      return;
    }
    if (session.hasPresentedFrame && !session.terminalFrameHeld) {
      beginTerminalPresentationHold(session);
    }
    session.cacheV2WarmReplayActive = false;
    session.cacheV2WarmReplayReady = false;
    session.cacheV2WarmReplaySnapshot = null;
    session.cacheV2ReplayActive = false;
    session.cacheV2ServerSnapshotPending = false;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    session.resetOnNextReplay = true;
    markPaneSyncPending(session);
    disableSessionHistoryCache(session, error);
    if (noteSessionReplayFailure(session, error?.message || "local_cache_replay_failed")) {
      return;
    }
    const socket = session.socket;
    if (socket) {
      closeSessionSocketForReconnect(session, socket, "Terminal local cache replay failed.");
    } else {
      scheduleReconnect(session, { immediate: true });
    }
  };

  const stageSessionCacheV2WarmReplay = (session, snapshot) => {
    if (
      !sessionUsesTerminalCacheV2(session)
      || !snapshot?.historyGeneration
      || session.resetOnNextReplay
      || session.closed
    ) {
      return false;
    }
    if (
      session.cacheV2WarmReplayReady
      && session.cacheV2WarmReplaySnapshot === snapshot
      && session.appliedHistoryCursor === snapshot.endCursor
    ) {
      session.cacheV2WarmReplayGeneration = session.terminalReplayGeneration;
      session.replayFitGeneration = session.measuredFitGeneration;
      return true;
    }
    if (sessionCacheV2WarmReplayMatchesSnapshot(session, snapshot)) {
      return true;
    }
    if (!resetTerminalForHistoryReplay(session)) {
      return false;
    }
    const replayGeneration = session.terminalReplayGeneration;
    const replaySeq = Number(session.cacheV2WarmReplaySeq || 0) + 1;
    session.cacheV2WarmReplaySeq = replaySeq;
    session.cacheV2WarmReplayGeneration = replayGeneration;
    session.cacheV2WarmReplayActive = true;
    session.cacheV2WarmReplayReady = false;
    session.cacheV2WarmReplaySnapshot = snapshot;
    session.cacheV2ServerSnapshotPending = false;
    session.cacheV2ReplayActive = true;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    session.historyGeneration = snapshot.historyGeneration;
    session.historyProtocolActive = true;
    session.historySyncMode = "cache-warm";
    session.historyStateReady = false;
    session.localBaseCursor = snapshot.baseCursor;
    session.receivedHistoryCursor = snapshot.baseCursor;
    session.appliedHistoryCursor = snapshot.baseCursor;
    session.persistedHistoryCursor = snapshot.endCursor;
    session.replayFitGeneration = session.measuredFitGeneration;
    return true;
  };

  const runSessionCacheV2WarmReplay = (session, snapshot) => {
    if (!stageSessionCacheV2WarmReplay(session, snapshot)) {
      return false;
    }
    if (session.cacheV2WarmReplayReady || session.cacheV2WarmReplayPromise) {
      return true;
    }
    const replayGeneration = session.cacheV2WarmReplayGeneration;
    const replaySeq = session.cacheV2WarmReplaySeq;
    let replayPromise = null;
    replayPromise = withTerminalCacheProgressTimeout((reportProgress) => terminalCacheV2.readChunks(snapshot, ({
      data,
      startCursor,
      endCursor,
    }) => {
      reportProgress();
      if (
        session.closed
        || session.cacheV2WarmReplaySeq !== replaySeq
        || session.terminalReplayGeneration !== replayGeneration
      ) {
        throw new Error("terminal warm cache replay session changed");
      }
      writeSessionOutput(session, data, {
        historySource: "cache-v2",
        startCursor,
        endCursor,
      });
      flushSessionOutput(session, { force: true });
      if (session.cacheV2RecoveryMetrics) {
        session.cacheV2RecoveryMetrics.localReplayBytes += data.byteLength;
      }
      reportProgress();
    }), terminalCacheV2ReplayTimeoutMs, "Terminal warm cache replay made no progress.").then(() => {
      if (
        session.closed
        || session.cacheV2WarmReplaySeq !== replaySeq
        || session.terminalReplayGeneration !== replayGeneration
      ) {
        return;
      }
      flushSessionOutput(session, { force: true });
      if (session.appliedHistoryCursor !== snapshot.endCursor) {
        throw new Error("terminal warm cache replay did not reach its manifest cursor");
      }
      session.cacheV2WarmReplayActive = false;
      session.cacheV2WarmReplayReady = true;
      markSessionCacheV2RecoveryMetric(session, "localReplayCompleteAt");
      console.info("[terminal-cache-v2] warm replay ready", JSON.stringify({
        chunks: snapshot.chunks.length,
        bytes: Number(snapshot.endCursor - snapshot.baseCursor),
      }));
      if (!session.cacheV2ServerSnapshotPending) {
        session.cacheV2ReplayActive = false;
        drainSessionCacheV2NetworkQueue(session);
      }
      if (
        session.connectionChannel === "unified"
        && session.socket?.readyState === WebSocket.OPEN
        && !sessionReplayIsCommitted(session)
      ) {
        startAttachReadyTimer(session, session.socket);
      }
    }).catch((error) => {
      failSessionCacheV2WarmReplay(session, replaySeq, error);
    }).finally(() => {
      if (session.cacheV2WarmReplayPromise === replayPromise) {
        session.cacheV2WarmReplayPromise = null;
      }
    });
    session.cacheV2WarmReplayPromise = replayPromise;
    return true;
  };

  const startSessionCacheV2WarmReplay = (session, snapshot) => {
    if (!stageSessionCacheV2WarmReplay(session, snapshot)) {
      return false;
    }
    return runSessionCacheV2WarmReplay(session, snapshot);
  };

  const applySessionCacheV2ServerSnapshot = (session, currentSocket, rejectHistorySync) => {
    if (!session.cacheV2ServerSnapshotPending || session.socket !== currentSocket) {
      return false;
    }
    const queued = session.cacheV2NetworkQueue;
    const snapshotStartCursor = session.cacheV2ServerSnapshotStartCursor;
    session.cacheV2WarmReplaySeq = Number(session.cacheV2WarmReplaySeq || 0) + 1;
    session.cacheV2WarmReplayActive = false;
    session.cacheV2WarmReplayReady = false;
    session.cacheV2WarmReplaySnapshot = null;
    session.cacheV2ServerSnapshotPending = false;
    session.cacheV2ServerSnapshotStartCursor = 0n;
    session.cacheV2ReplayActive = false;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    if (session.hasPresentedFrame && !session.terminalFrameHeld) {
      holdSessionTerminalFrame(session);
    }
    if (!resetTerminalForHistoryReplay(session)) {
      rejectHistorySync("terminal reset for server snapshot failed");
      return true;
    }
    session.historyProtocolActive = true;
    session.historySyncMode = "snapshot";
    session.localBaseCursor = snapshotStartCursor;
    session.receivedHistoryCursor = snapshotStartCursor;
    session.appliedHistoryCursor = snapshotStartCursor;
    session.persistedHistoryCursor = snapshotStartCursor;
    session.historyStateReady = false;
    setSessionReplayAuthorization(session, "identified");
    session.replayCompletionPending = true;
    resetSessionHistoryCache(session, session.historyGeneration, snapshotStartCursor);
    try {
      for (const data of queued) {
        writeSessionOutput(session, data);
      }
      if (session.receivedHistoryCursor !== session.historyReplayTargetCursor) {
        throw new Error("server snapshot did not reach its target cursor");
      }
      session.cacheV2WarmReplayGeneration = session.terminalReplayGeneration;
      session.cacheV2WarmReplayReady = true;
      flushSessionOutput(session, { force: true });
    } catch (error) {
      rejectHistorySync(error?.message || "server snapshot replay failed");
    }
    return true;
  };

  const beginSessionCacheV2Replay = (session, snapshot, deltaFromCursor, currentSocket, rejectHistorySync) => {
    const replayGeneration = session.terminalReplayGeneration;
    session.cacheV2ReplayActive = true;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    let replayPromise = null;
    replayPromise = withTerminalCacheProgressTimeout((reportProgress) => terminalCacheV2.readChunks(snapshot, ({ data, startCursor, endCursor }) => {
      reportProgress();
      if (session.socket !== currentSocket || session.terminalReplayGeneration !== replayGeneration) {
        throw new Error("terminal cache replay session changed");
      }
      writeSessionOutput(session, data, {
        historySource: "cache-v2",
        startCursor,
        endCursor,
      });
      flushSessionOutput(session, { force: true });
      if (session.cacheV2RecoveryMetrics) {
        session.cacheV2RecoveryMetrics.localReplayBytes += data.byteLength;
      }
      reportProgress();
    }), terminalCacheV2ReplayTimeoutMs, "Terminal cache replay made no progress.").then(() => {
      if (session.socket !== currentSocket || session.terminalReplayGeneration !== replayGeneration) {
        return;
      }
      if (session.receivedHistoryCursor !== deltaFromCursor) {
        throw new Error("cached terminal history did not reach requested cursor");
      }
      markSessionCacheV2RecoveryMetric(session, "localReplayCompleteAt");
      session.cacheV2ReplayActive = false;
      drainSessionCacheV2NetworkQueue(session);
    }).catch((error) => {
      if (session.socket !== currentSocket || session.terminalReplayGeneration !== replayGeneration) {
        return;
      }
      session.cacheV2ReplayActive = false;
      session.cacheV2NetworkQueue = [];
      session.cacheV2NetworkQueueBytes = 0;
      rejectHistorySync(error?.message || "terminal cache replay failed");
    }).finally(() => {
      if (session.cacheV2ReplayPromise === replayPromise) {
        session.cacheV2ReplayPromise = null;
      }
    });
    session.cacheV2ReplayPromise = replayPromise;
  };

  const { runLongScreenshot } = createTerminalLongScreenshot({
    mobileShortcuts,
    createSVGIcon,
    confirmDialog,
    showToast,
  });

  const terminalCanvasBlob = (canvas) => new Promise((resolve, reject) => {
    if (!(canvas instanceof HTMLCanvasElement) || typeof canvas.toBlob !== "function") {
      reject(new Error("Terminal canvas capture is unavailable."));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Terminal canvas capture returned no data."));
      }
    }, "image/png");
  });

  // A sized Canvas can still be the renderer's initial background. Only a
  // frame that was actually presented for the current terminal state may
  // replace the last-known-good persisted preview.
  const sessionHasCurrentPresentedFrame = (session) => {
    if (
      !session
      || session.closed
      || session.hasPresentedFrame !== true
      || session.resizePresentationHold
      || session.resizeAckPending
      || !session.renderSnapshot
      || Number(session.measuredFitGeneration || 0) <= 0
      || session.presentedFitGeneration !== session.measuredFitGeneration
      || session.presentedReplayGeneration !== session.terminalReplayGeneration
      || session.presentedContentGeneration !== session.terminalContentGeneration
      || session.presentedHistoryCursor !== session.appliedHistoryCursor
    ) {
      return false;
    }
    return terminalCanvasMatchesExpectedSize(session);
  };

  const sessionCanCaptureCacheV2Preview = (session) => {
    if (!sessionHasCurrentPresentedFrame(session)) {
      return false;
    }
    if (panePresentationIsCurrent(session)) {
      return true;
    }
    if (
      !session
      || session.closed
      || session.connectionChannel !== "unified"
      || !sessionReplayIsCommitted(session)
      || session.resizeAckPending
      || session.cacheV2WarmReplayActive
    ) {
      return false;
    }
    const canvas = session.term?.canvas || session.term?.renderer?.getCanvas?.();
    const { cols, rows } = terminalSize(session);
    return canvas instanceof HTMLCanvasElement
      && canvas.width > 0
      && canvas.height > 0
      && cols > 0
      && rows > 0;
  };

  const captureSessionCacheV2Preview = async (session, captureSeq) => {
    const allowRecentOutput = session.cacheV2PreviewCaptureAllowRecentOutput === true;
    if (
      !sessionUsesTerminalCacheV2(session)
      || session.cacheV2PreviewCaptureSeq !== captureSeq
      || !sessionReplayIsCommitted(session)
      || !sessionCanCaptureCacheV2Preview(session)
      || !session.historyStateReady
      || !session.historyGeneration
      || session.outputQueueSize > 0
      || (!allowRecentOutput && performance.now() - Number(session.lastTerminalOutputAt || 0) < terminalCacheV2PreviewDelayMs)
    ) {
      return;
    }
    await flushSessionHistoryCacheWrites(session);
    const cursor = session.appliedHistoryCursor;
    if (
      !sessionUsesTerminalCacheV2(session)
      || session.cacheV2PreviewCaptureSeq !== captureSeq
      || !sessionCanCaptureCacheV2Preview(session)
      || session.persistedHistoryCursor !== cursor
      || session.outputQueueSize > 0
      || (!allowRecentOutput && performance.now() - Number(session.lastTerminalOutputAt || 0) < terminalCacheV2PreviewDelayMs)
    ) {
      return;
    }
    const identity = sessionTerminalCacheV2Identity(session, session.historyGeneration);
    const canvas = session.term?.canvas || session.term?.renderer?.getCanvas?.();
    if (!identity || !(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    const { cols, rows } = terminalSize(session);
    const renderGeneration = Number(session.renderGeneration || 0);
    const contentGeneration = Number(session.presentedContentGeneration || 0);
    const presentedCursor = session.presentedHistoryCursor;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const themeFingerprint = terminalCacheV2ThemeFingerprint();
    const previewCaptureStartedAt = terminalCacheV2MetricNow();
    appendDebugLog("info", "[preview] PNG capture 开始", `pane=${session.id}`, { dedupeKey: `preview-capture-start:${session.id}` });
    const blob = await terminalCanvasBlob(canvas);
    const currentSize = terminalSize(session);
    if (
      !sessionUsesTerminalCacheV2(session)
      || session.cacheV2PreviewCaptureSeq !== captureSeq
      || !sessionReplayIsCommitted(session)
      || !session.historyStateReady
      || !sessionCanCaptureCacheV2Preview(session)
      || session.outputQueueSize > 0
      || (!allowRecentOutput && performance.now() - Number(session.lastTerminalOutputAt || 0) < terminalCacheV2PreviewDelayMs)
      || session.appliedHistoryCursor !== cursor
      || session.persistedHistoryCursor !== cursor
      || canvas.width !== width
      || canvas.height !== height
      || currentSize.cols !== cols
      || currentSize.rows !== rows
      || Number(session.renderGeneration || 0) !== renderGeneration
      || Number(session.presentedContentGeneration || 0) !== contentGeneration
      || session.presentedHistoryCursor !== presentedCursor
      || Math.abs((window.devicePixelRatio || 1) - devicePixelRatio) > 0.01
      || terminalCacheV2ThemeFingerprint() !== themeFingerprint
    ) {
      return;
    }
    await terminalCacheV2.savePreview(identity, session.historyGeneration, cursor, blob, {
      width,
      height,
      cols,
      rows,
      devicePixelRatio,
      themeFingerprint,
    });
    appendDebugLog("info", "[preview] PNG capture 完成", `pane=${session.id} duration=${Math.round(terminalCacheV2MetricNow() - previewCaptureStartedAt)}ms bytes=${blob.size}`, { dedupeKey: `preview-capture-complete:${session.id}` });
    clearSessionCacheV2OverviewPreview(session);
    scheduleTabOverviewRender();
  };

  const scheduleSessionCacheV2PreviewCapture = (session, { immediate = false } = {}) => {
    if (!sessionUsesTerminalCacheV2(session) || session.closed) {
      return;
    }
    session.cacheV2PreviewCapturePending = true;
    session.cacheV2PreviewCaptureAllowRecentOutput = true;
    if (session.cacheV2PreviewCaptureRunning) {
      return;
    }
    if (session.cacheV2PreviewCaptureTimer || session.cacheV2PreviewCaptureIdle) {
      if (immediate && session.cacheV2PreviewCaptureTimer) {
        window.clearTimeout(session.cacheV2PreviewCaptureTimer);
        session.cacheV2PreviewCaptureTimer = 0;
      } else {
        return;
      }
    }
    const captureSeq = Number(session.cacheV2PreviewCaptureSeq || 0) + 1;
    session.cacheV2PreviewCaptureSeq = captureSeq;
    const delay = immediate ? 0 : terminalCacheV2PreviewRefreshMs;
    session.cacheV2PreviewCaptureTimer = window.setTimeout(() => {
      session.cacheV2PreviewCaptureTimer = 0;
      session.cacheV2PreviewCapturePending = false;
      session.cacheV2PreviewCaptureRunning = true;
      const capture = () => {
        session.cacheV2PreviewCaptureIdle = 0;
        captureSessionCacheV2Preview(session, captureSeq).catch((error) => {
          console.warn("[terminal-cache-v2] preview capture failed", {
            name: session.name,
            pane: session.id,
            error: error?.message || String(error),
          });
        }).finally(() => {
          session.cacheV2PreviewCaptureRunning = false;
          if (session.cacheV2PreviewCapturePending && !session.closed) {
            scheduleSessionCacheV2PreviewCapture(session);
          }
        });
      };
      if (!immediate && typeof window.requestIdleCallback === "function") {
        session.cacheV2PreviewCaptureIdle = window.requestIdleCallback(capture, { timeout: 1500 });
      } else {
        window.setTimeout(capture, 0);
      }
    }, delay);
  };

  const scheduleSessionCacheV2Compaction = (session) => {
    if (
      !sessionUsesTerminalCacheV2(session)
      || session.closed
      || session.historyCacheDisabled
      || session.cacheV2CompactionScheduled
      || !session.historyGeneration
    ) {
      return;
    }
    const identity = sessionTerminalCacheV2Identity(session, session.historyGeneration);
    if (!identity) {
      return;
    }
    session.cacheV2CompactionScheduled = true;
    const compact = () => {
      session.cacheV2CompactionScheduled = false;
      if (
        session.closed
        || !sessionUsesTerminalCacheV2(session)
        || session.historyGeneration !== identity.historyGeneration
      ) {
        return;
      }
      terminalCacheV2.compact(identity, {
        minChunks: terminalCacheV2CompactionMinChunks,
        targetBytes: terminalCacheV2CompactionTargetBytes,
      }).then((manifest) => {
        if (manifest && Number(manifest.compactedFromChunks || 0) > manifest.chunks.length) {
          console.info("[terminal-cache-v2] cache compacted", {
            name: session.name,
            pane: session.id,
            previousChunks: manifest.compactedFromChunks,
            chunks: manifest.chunks.length,
          });
        }
      }).catch((error) => {
        console.warn("[terminal-cache-v2] cache compaction failed", {
          name: session.name,
          pane: session.id,
          error: error?.message || String(error),
        });
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(compact, { timeout: 5000 });
      return;
    }
    window.setTimeout(compact, 2000);
  };

  const terminalOutputKind = (data) => {
    if (typeof data === "string") {
      return "text";
    }
    if (data instanceof Uint8Array) {
      return "bytes";
    }
    return "";
  };

  const terminalOutputByteLength = (data) => {
    if (typeof data === "string") {
      if (data.length === 0) {
        return 0;
      }
      let total = 0;
      for (let offset = 0; offset < data.length;) {
        let end = Math.min(data.length, offset + terminalOutputMeasureChunkChars);
        if (end < data.length) {
          const code = data.charCodeAt(end - 1);
          if (code >= 0xD800 && code <= 0xDBFF) {
            end -= 1;
          }
        }
        if (end <= offset) {
          end = Math.min(data.length, offset + 1);
        }
        const result = textEncoder.encodeInto(data.slice(offset, end), terminalOutputMeasureBuffer);
        total += result.written;
        offset = end;
      }
      return total;
    }
    if (data instanceof Uint8Array) {
      return data.byteLength;
    }
    return 0;
  };

  const utf8ByteLengthForCodePoint = (codepoint) => (
    codepoint <= 0x7f ? 1
      : codepoint <= 0x7ff ? 2
        : codepoint <= 0xffff ? 3
          : 4
  );

  const terminalOutputByteChunkEnd = (data, start, maxBytes) => {
    const hardEnd = Math.min(data.byteLength, start + maxBytes);
    if (hardEnd >= data.byteLength) {
      return hardEnd;
    }
    let end = hardEnd;
    while (end > start && (data[end] & 0xc0) === 0x80) {
      end -= 1;
    }
    return end > start ? end : hardEnd;
  };

  const splitTerminalOutputText = (data, maxBytes) => {
    const chunks = [];
    let chunk = "";
    let chunkBytes = 0;
    for (let index = 0; index < data.length;) {
      const codepoint = data.codePointAt(index);
      const text = String.fromCodePoint(codepoint);
      const byteLength = utf8ByteLengthForCodePoint(codepoint);
      if (chunk && chunkBytes + byteLength > maxBytes) {
        chunks.push(chunk);
        chunk = "";
        chunkBytes = 0;
      }
      chunk += text;
      chunkBytes += byteLength;
      index += text.length;
    }
    if (chunk) {
      chunks.push(chunk);
    }
    return chunks;
  };

  const coalesceTerminalOutputBatch = (chunks, kind, byteLength) => {
    if (chunks.length === 1) {
      return chunks[0];
    }
    if (kind === "text") {
      return chunks.join("");
    }
    const output = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  };

  const handleTerminalOutputOverload = (session, reason) => {
    if (!session || session.closed || session.outputOverloadPending) {
      return false;
    }
    session.outputOverloadPending = true;
    recordTerminalRuntimeMetric("outputOverloads");
    console.warn("[terminal-output] queue overload; requesting cursor resync", {
      name: session.name,
      pane: session.id,
      queuedBytes: session.outputQueueSize,
      reason,
    });
    requestSessionHistoryReplay(session);
    return true;
  };

  const writeTerminalOutputBatch = (session, data, replayOutput, allowGeneratedInput, suppressRender = false) => {
    const kind = terminalOutputKind(data);
    if (!kind || (kind === "text" ? data.length === 0 : data.byteLength === 0)) {
      return false;
    }
    const previousAllowGeneratedInput = session.allowGeneratedInputDuringReplay;
    if (replayOutput) {
      session.allowGeneratedInputDuringReplay = allowGeneratedInput === true;
      armReplayGeneratedInputSuppression(session);
      session.replayOutputDepth += 1;
    }
    const replayWriter = (replayOutput || suppressRender) && typeof session.term.writeReplay === "function";
    try {
      if (replayWriter) {
        recordTerminalSessionEvent(session, replayOutput ? "write_replay" : "write_suppressed", {
          bytes: terminalOutputByteLength(data),
          reason: replayOutput ? "history_replay" : "resize_output_settle",
        });
      }
      recordTerminalRuntimeMetric("terminalOutputBatches");
      recordTerminalRuntimeMetric("terminalOutputBytes", terminalOutputByteLength(data));
      measurePerformanceTask("terminal write", () => {
        if (replayWriter) {
          session.term.writeReplay(data);
        } else {
          session.term.write(data);
        }
      });
      session.lastTerminalOutputAt = performance.now();
      if (!replayWriter && terminalRenderAllowed(session)) {
        session.term.requestRender?.({ throttle: true });
      }
      advanceTerminalContentGeneration(session);
      drainGeneratedTerminalResponses(session);
      if (
        ((replayOutput || suppressRender) && !replayWriter)
        || (!replayOutput && !suppressRender && deferHiddenPaneRender(session))
      ) {
        cancelPendingTerminalRender(session.term);
      }
      return true;
    } finally {
      if (replayOutput) {
        session.replayOutputDepth = Math.max(0, session.replayOutputDepth - 1);
        session.allowGeneratedInputDuringReplay = previousAllowGeneratedInput;
      }
    }
  };

  const setSessionReplayAuthorization = (session, authorization = false) => {
    const normalized = authorization === "identified" || authorization === "legacy"
      ? authorization
      : false;
    session.replayAuthorization = normalized;
    session.replayVerified = normalized;
    return normalized;
  };

  const sessionReplayAuthorization = (session) => (
    session?.replayAuthorization || session?.replayVerified || false
  );

  const sessionReplayIsAuthorized = (session) => Boolean(sessionReplayAuthorization(session));

  const sessionReplayHasIdentifiedAuthorization = (session) => (
    sessionReplayAuthorization(session) === "identified"
  );

  const sessionReplayCommitIsPending = (session) => Boolean(
    session
    && session.replayController?.phase === "awaiting_commit"
  );

  const sessionReplayIsCommitted = (session) => Boolean(
    session
    && session.replayController?.phase === "committed"
  );

  const finishSessionHistoryReplayIfReady = (session) => {
    if (
      !session ||
      !sessionReplayCommitIsPending(session) ||
      session.outputQueueSize > 0 ||
      session.cacheV2ReplayActive ||
      !sessionReplayIsAuthorized(session) ||
      session.closed ||
      session.name !== activeName ||
      (session.historyProtocolActive && session.appliedHistoryCursor < session.historyReplayTargetCursor)
    ) {
      return false;
    }
    if (
      session.historyProtocolActive
      && !session.historyCacheDisabled
      && session.persistedHistoryCursor < session.historyReplayTargetCursor
    ) {
      if (!session.historyCacheReplayCommitPending) {
        session.historyCacheReplayCommitPending = true;
        const commitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;
        session.historyCacheReplayCommitSeq = commitSeq;
        const historyGeneration = session.historyGeneration;
        const replayTargetCursor = session.historyReplayTargetCursor;
        const commit = flushSessionHistoryCacheWrites(session);
        const waitForCommit = sessionUsesTerminalCacheV2(session)
          ? withTerminalCacheTimeout(commit, terminalCacheV2CommitTimeoutMs, "Terminal cache commit timed out.")
          : commit;
        waitForCommit.catch((error) => disableSessionHistoryCache(session, error)).finally(() => {
          if (
            session.historyCacheReplayCommitSeq === commitSeq
            && !session.closed
            && session.historyGeneration === historyGeneration
            && session.historyReplayTargetCursor === replayTargetCursor
          ) {
            markSessionCacheV2RecoveryMetric(session, "cacheCommitCompleteAt");
            scheduleSessionCacheV2Compaction(session);
            session.historyCacheReplayCommitPending = false;
          }
        });
      }
    } else {
      markSessionCacheV2RecoveryMetric(session, "cacheCommitCompleteAt");
    }
    session.replayCompletionPending = false;
    if (session.replayController?.phase === "awaiting_commit") {
      session.replayController.commit();
    }
    if (session.replayController?.phase === "committed") {
      session.replayControllerLegacyActive = false;
      session.queueReplayControllerActive = false;
      session.queueReplayControllerLegacy = false;
    }
    session.replayFailureAttempts = 0;
    session.replayRetryPaused = false;
    session.lastReplayFailureReason = "";
    endTerminalRenderSuppression(session, { render: false, reason: "replay" });
    session.replayComplete = true;
    setSessionReplayAuthorization(session, false);
    session.historyStateReady = true;
    session.historyCacheSnapshot = null;
    session.cacheV2WarmReplaySeq = Number(session.cacheV2WarmReplaySeq || 0) + 1;
    session.cacheV2WarmReplayActive = false;
    session.cacheV2WarmReplayReady = false;
    session.cacheV2WarmReplayPromise = null;
    session.cacheV2WarmReplaySnapshot = null;
    session.cacheV2ServerSnapshotPending = false;
    session.cacheV2ServerSnapshotStartCursor = 0n;
    session.agentPreparing = false;
    session.outputOverloadPending = false;
    session.allowGeneratedInputDuringReplay = false;
    clearAttachReadyTimer(session);
    if (Number(session.reconnectAttempts || 0) > 0) {
      appendDebugLog("info", "终端连接已恢复", terminalLocationDescription(session));
    }
    session.reconnectAttempts = 0;
    session.connectionRetrying = false;
    session.shellEl.dataset.connection = "open";
    if (session.connectionChannel === "unified") {
      clearTerminalUnifiedPaneRetry(session, { resetAttempts: true });
    }
    if (session.tabId === activeTabId && tabs.get(activeTabId)?.activePaneId === session.id) {
      hideStartupErrorPanel();
    }
    if (session.connectionChannel === "fast") {
      terminalConnectionScheduler?.notifyReplayReady(session, Number(session.connectionLeaseID || 0));
    } else if (session.connectionChannel === "unified") {
      scheduleSessionCacheV2PreviewCapture(session, { immediate: true });
    }
    setPaneRenderReady(session, false);
    ensurePanePresentation(session, {
      reason: "history_replay_complete",
      forceHistory: true,
    });
    scheduleSessionCacheV2Compaction(session);
    flushPendingInput(session);
    if (isClientInstanceName(activeName)) {
      syncTerminalConnectionDemands({ reason: "replay_ready" });
    }
    return true;
  };

  const discardSessionOutputBuffers = (session) => {
    if (!session) {
      return;
    }
    clearSessionOutputFlushSchedule(session);
    if (session.replayPresentationCheckpointTimer) {
      window.clearTimeout(session.replayPresentationCheckpointTimer);
      session.replayPresentationCheckpointTimer = 0;
    }
    session.replayPresentationCheckpointPending = false;
    session.outputQueueGeneration = Number(session.outputQueueGeneration || 0) + 1;
    session.outputQueue = [];
    session.outputQueueSize = 0;
    session.pendingQueueTurnAck = null;
    session.replayCompletionPending = false;
    session.historyCacheReplayCommitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;
    session.historyCacheReplayCommitPending = false;
  };

  const trySendPendingQueueTurnAck = (session) => {
    const pending = session?.pendingQueueTurnAck;
    if (!pending || session.closed || session.socket !== pending.socket || session.connectionChannel !== "unified") {
      return false;
    }
    if (
      Number(session.connectionEpoch || 0) !== pending.connectionEpoch
      || Number(session.connectionChannelGeneration || 0) !== pending.channelGeneration
      || session.outputQueueSize > 0
      || session.appliedHistoryCursor !== pending.cursor
    ) {
      return false;
    }
    session.pendingQueueTurnAck = null;
    try {
      pending.socket.send(JSON.stringify({
        type: "queue-turn-ack",
        data: `${pending.cursor.toString()}:${pending.sequence}`,
      }));
      recordTerminalSessionEvent(session, "queue_turn_ack_sent", {
        cursor: pending.cursor.toString(),
        sequence: String(pending.sequence),
      });
      return true;
    } catch (error) {
      closeSessionSocketForReconnect(session, pending.socket, "Terminal queue turn acknowledgement failed.");
      return false;
    }
  };

  const flushSessionOutput = (session, {
    force = false,
    maxBytes = 0,
    maxEntries = 0,
    maxTimeMs = 0,
    scheduleRemainder = true,
  } = {}) => {
    if (!session) {
      return true;
    }
    clearSessionOutputFlushSchedule(session);
    const queue = Array.isArray(session.outputQueue) ? session.outputQueue : [];
    if (queue.length === 0) {
      finishSessionHistoryReplayIfReady(session);
      trySendPendingQueueTurnAck(session);
      return true;
    }
    const outputQueueGenerationMismatch = queue.some((entry) => entry.queueGeneration !== session.outputQueueGeneration);
    const outputIdentityMismatch = outputQueueGenerationMismatch || queue.some((entry) => (
      entry.queueGeneration !== session.outputQueueGeneration
      || entry.connectionEpoch !== Number(session.connectionEpoch || 0)
      || entry.selector !== String(session.name || "")
      || entry.paneID !== String(session.id || "")
      || entry.channelGeneration !== Number(session.connectionChannelGeneration || 0)
      || entry.historyGeneration !== String(session.historyGeneration || "")
    ));
    if (outputIdentityMismatch) {
      recordTerminalRuntimeMetric("staleOutputQueueDrops");
      session.outputQueue = [];
      session.outputQueueSize = 0;
      session.replayCompletionPending = false;
      session.resetOnNextReplay = true;
      beginTerminalPresentationHold(session);
      finishSessionHistoryReplayIfReady(session);
      return true;
    }
    if (!session.term || (!force && (session.closed || session.name !== activeName))) {
      session.outputQueue = [];
      session.outputQueueSize = 0;
      session.replayCompletionPending = false;
      return true;
    }
    let drained = false;
    measurePerformanceTask("output flush", () => {
      const flushStartedAt = performanceTaskNow();
      const flushQueue = [];
      const restQueue = [];
      let flushBytes = 0;
      let restBytes = 0;
      const requestedBudgetBytes = Math.max(0, Math.floor(Number(maxBytes) || 0));
      const requestedEntryLimit = Math.max(0, Math.floor(Number(maxEntries) || 0));
      const requestedTimeBudgetMs = Math.max(0, Number(maxTimeMs) || 0);
      const flushBudgetBytes = requestedBudgetBytes || (queue[0]?.replayOutput
        ? terminalReplayWriteBatchBytes
        : terminalOutputFlushBudgetBytes);
      const flushEntryLimit = requestedEntryLimit || (force ? 0 : terminalOutputFlushMaxEntries);
      const flushTimeBudgetMs = requestedTimeBudgetMs || (force ? 0 : terminalOutputFlushTimeBudgetMs);
      const partitionStartedAt = performanceTaskNow();
      if (force && requestedBudgetBytes === 0 && requestedEntryLimit === 0 && requestedTimeBudgetMs === 0) {
        flushQueue.push(...queue);
        flushBytes = queue.reduce((total, entry) => total + entry.byteLength, 0);
      } else {
        for (const entry of queue) {
          if (
            restQueue.length > 0
            || (flushEntryLimit > 0 && flushQueue.length >= flushEntryLimit)
            || (flushTimeBudgetMs > 0 && flushQueue.length > 0 && performanceTaskNow() - partitionStartedAt >= flushTimeBudgetMs)
            || (flushQueue.length > 0 && flushBytes + entry.byteLength > flushBudgetBytes)
          ) {
            restQueue.push(entry);
            restBytes += entry.byteLength;
          } else {
            flushQueue.push(entry);
            flushBytes += entry.byteLength;
          }
        }
      }
      session.outputQueue = restQueue;
      session.outputQueueSize = restBytes;

      let wrote = false;
      let batch = null;
      const flushBatch = () => {
        if (!batch) {
          return;
        }
        const data = coalesceTerminalOutputBatch(batch.chunks, batch.kind, batch.byteLength);
        if (writeTerminalOutputBatch(session, data, batch.replayOutput, batch.allowGeneratedInput, batch.suppressRender)) {
          wrote = true;
          if (batch.historyEndCursor !== null) {
            session.appliedHistoryCursor = batch.historyEndCursor;
            if (batch.historyCacheable && data instanceof Uint8Array) {
              queueSessionHistoryCacheWrite(session, data, batch.historyStartCursor, batch.historyEndCursor);
            }
          }
        }
        batch = null;
      };

      for (const entry of flushQueue) {
        if (
          !batch ||
          batch.kind !== entry.kind ||
          batch.replayOutput !== entry.replayOutput ||
          batch.suppressRender !== entry.suppressRender ||
          batch.allowGeneratedInput !== entry.allowGeneratedInput ||
          batch.historyCacheable !== entry.historyCacheable ||
          (batch.historyEndCursor !== null && entry.historyStartCursor !== batch.historyEndCursor)
        ) {
          flushBatch();
          batch = {
            kind: entry.kind,
            replayOutput: entry.replayOutput,
            suppressRender: entry.suppressRender,
            allowGeneratedInput: entry.allowGeneratedInput,
            chunks: [],
            byteLength: 0,
            historyCacheable: entry.historyCacheable,
            historyStartCursor: entry.historyStartCursor,
            historyEndCursor: entry.historyEndCursor,
          };
        }
        const batchLimitBytes = entry.replayOutput
          ? terminalReplayWriteBatchBytes
          : terminalOutputFlushBudgetBytes;
        if (batch.chunks.length > 0 && batch.byteLength + entry.byteLength > batchLimitBytes) {
          flushBatch();
          batch = {
            kind: entry.kind,
            replayOutput: entry.replayOutput,
            suppressRender: entry.suppressRender,
            allowGeneratedInput: entry.allowGeneratedInput,
            chunks: [],
            byteLength: 0,
            historyCacheable: entry.historyCacheable,
            historyStartCursor: entry.historyStartCursor,
            historyEndCursor: entry.historyEndCursor,
          };
        }
        batch.chunks.push(entry.data);
        batch.byteLength += entry.byteLength;
        if (entry.historyEndCursor !== null) {
          batch.historyEndCursor = entry.historyEndCursor;
        }
      }
      flushBatch();

      if (wrote) {
        resetTerminalHostViewport(session, { clean: true });
        positionTerminalInput(session);
        schedulePaneFullRenderValidation(session);
      }
      if (wrote && flushQueue.some((entry) => entry.replayOutput)) {
        scheduleReplayPresentationCheckpoint(session);
      }
      if (force) {
        recordTerminalRuntimeMetric("forceFlushBytes", flushBytes);
        recordTerminalRuntimeMaxMetric("forceFlushPeakBytes", flushBytes);
        recordPerformanceTask("terminal force flush", performanceTaskNow() - flushStartedAt);
        if (debugLogEnabled) {
          appendDebugLog(
            "info",
            "终端 force flush",
            `${session.name}/${session.id} ${JSON.stringify({
              bytes: flushBytes,
              remainingBytes: session.outputQueueSize,
              maxBytes: requestedBudgetBytes,
              maxEntries: requestedEntryLimit,
              maxTimeMs: requestedTimeBudgetMs,
            })}`,
            { dedupeKey: `terminal-force-flush:${session.id}` },
          );
        }
      }
      drained = session.outputQueueSize <= 0;
      trySendPendingQueueTurnAck(session);
      if (!drained && scheduleRemainder) {
        scheduleSessionOutputFlush(session);
      } else {
        finishSessionHistoryReplayIfReady(session);
      }
    });
    return drained;
  };

  const scheduleSessionOutputFlush = (session) => {
    if (!session || session.closed || session.outputFlushFrame || session.outputFlushTimer) {
      return;
    }
    const flush = () => flushSessionOutput(session);
    session.outputFlushFrame = window.requestAnimationFrame(flush);
    session.outputFlushTimer = window.setTimeout(flush, terminalOutputFlushFallbackMs);
  };

  const writeSessionOutput = (session, data, {
    historySource = "server",
    startCursor = null,
    endCursor = null,
    deferRender = false,
  } = {}) => {
    if (!session?.term || session.closed || session.name !== activeName) {
      return;
    }
    const outputData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const kind = terminalOutputKind(outputData);
    if (!kind) {
      return;
    }
    const outputByteLength = terminalOutputByteLength(outputData);
    // Large transport messages are split below. The hard limit protects the
    // queued bytes, not the size of one legal WebSocket message.
    if (session.outputQueueSize >= maxQueuedTerminalOutputBytes) {
      handleTerminalOutputOverload(session, "queued output would exceed hard limit");
      return;
    }
    // Output chunks carry replay state because the replay-complete control frame can arrive before the next paint.
    const replayOutput = !sessionReplayIsCommitted(session);
    const resizeOutputSettleActive = session.resizeOutputSettleActive === true;
    const resizeTransitionActive = resizeOutputSettleActive || session.resizeFenceActive === true;
    if (resizeOutputSettleActive) {
      scheduleResizeOutputSettle(session, { reason: "output_received" });
    }
    const suppressRender = (deferRender || resizeTransitionActive) && !replayOutput;
    const allowGeneratedInput = replayOutput && session.allowGeneratedInputDuringReplay === true;
    const outputChunkBytes = replayOutput
      ? terminalReplayWriteBatchBytes
      : terminalOutputFlushBudgetBytes;
    const trackHistory = kind === "bytes" && session.historyProtocolActive;
    let nextHistoryCursor = trackHistory
      ? (startCursor === null ? session.receivedHistoryCursor : startCursor)
      : null;
    const connectionEpoch = Number(session.connectionEpoch || 0);
    const channelGeneration = Number(session.connectionChannelGeneration || 0);
    const historyGeneration = String(session.historyGeneration || "");
    const enqueueEntry = (entryData) => {
      const byteLength = terminalOutputByteLength(entryData);
      if (byteLength <= 0) {
        return true;
      }
      if (session.outputQueueSize + byteLength > maxQueuedTerminalOutputBytes) {
        handleTerminalOutputOverload(session, "queued output exceeded hard limit");
        return false;
      }
      const historyStartCursor = nextHistoryCursor;
      const historyEndCursor = historyStartCursor === null ? null : historyStartCursor + BigInt(byteLength);
      if (historyEndCursor !== null) {
        nextHistoryCursor = historyEndCursor;
        session.receivedHistoryCursor = historyEndCursor;
      }
      session.outputQueue.push({
        data: entryData,
        kind,
        byteLength,
        replayOutput,
        suppressRender,
        allowGeneratedInput,
        queueGeneration: session.outputQueueGeneration,
        connectionEpoch,
        channelGeneration,
        historyGeneration,
        selector: String(session.name || ""),
        paneID: String(session.id || ""),
        historyCacheable: historySource === "server" && historyEndCursor !== null,
        historyStartCursor,
        historyEndCursor,
      });
      session.outputQueueSize += byteLength;
      recordTerminalRuntimeMetric("outputQueuedBytes", byteLength);
      recordTerminalRuntimeMaxMetric("outputQueuePeakBytes", session.outputQueueSize);
      return true;
    };
    if (kind === "bytes" && outputData.byteLength > outputChunkBytes) {
      for (let offset = 0; offset < outputData.byteLength;) {
        const end = terminalOutputByteChunkEnd(outputData, offset, outputChunkBytes);
        if (!enqueueEntry(outputData.subarray(offset, end))) {
          return;
        }
        offset = end;
      }
    } else if (kind === "text" && terminalOutputByteLength(outputData) > outputChunkBytes) {
      for (const chunk of splitTerminalOutputText(outputData, outputChunkBytes)) {
        if (!enqueueEntry(chunk)) {
          return;
        }
      }
    } else {
      enqueueEntry(outputData);
    }
    if (trackHistory && endCursor !== null && nextHistoryCursor !== endCursor) {
      throw new Error("Terminal history output range does not match payload length.");
    }
    if (session.outputQueueSize >= maxQueuedTerminalOutputBytes) {
      handleTerminalOutputOverload(session, "queued output exceeded hard limit");
    } else if (session.outputQueueSize >= terminalOutputQueueSoftLimitBytes) {
      flushSessionOutput(session);
    } else {
      scheduleSessionOutputFlush(session);
    }
  };

  const writeSessionImmediateOutput = (session, data) => {
    if (!session?.term || session.closed) {
      return;
    }
    flushSessionOutput(session, { force: true });
    if (session.closed) {
      return;
    }
    const writeStartedAt = session.startupTraceActive ? terminalCacheV2MetricNow() : 0;
    measurePerformanceTask("terminal render", () => session.term.write(data));
    if (session.startupTraceActive) {
      appendStartupTrace("终端写入完成", `pane=${session.id} bytes=${data?.byteLength || 0} duration=${Math.round(terminalCacheV2MetricNow() - writeStartedAt)}ms`, { dedupeKey: `terminal-write:${session.id}` });
    }
    session.lastTerminalOutputAt = performance.now();
    if (terminalRenderAllowed(session)) {
      session.term.requestRender?.({ throttle: true });
    }
    advanceTerminalContentGeneration(session);
    drainGeneratedTerminalResponses(session);
    deferHiddenPaneRender(session);
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
    schedulePaneFullRenderValidation(session);
  };

  const readAgentStartupError = async (name) => {
    const requestName = String(name || "").trim();
    if (!requestName) {
      return "";
    }
    const response = await fetch(agentStartupErrorURL(requestName), { cache: "no-store" });
    if (!response.ok) {
      return "";
    }
    const data = await response.json();
    return String(data?.error || "").trim();
  };

  const invalidateSessionStartupError = (session, { hidePanel = false } = {}) => {
    if (!session) {
      return;
    }
    session.startupErrorRequestID = Number(session.startupErrorRequestID || 0) + 1;
    session.startupErrorShown = false;
    if (
      hidePanel
      && session.tabId === activeTabId
      && tabs.get(activeTabId)?.activePaneId === session.id
    ) {
      hideStartupErrorPanel();
    }
  };

  const writeSessionWebShellError = (session, message) => {
    const text = String(message || "").trim();
    if (!text || !session || session.closed || !isCurrentInstanceSession(session)) {
      return;
    }
    if (isRetryableTerminalTransportError(text)) {
      session.connectionRetrying = true;
      session.shellEl.dataset.connection = navigator.onLine === false ? "offline" : "reconnecting";
      appendDebugWarning("终端网络错误将自动重试", `${terminalLocationDescription(session)}: ${text}`);
      return;
    }
    showStartupErrorPanel(text);
    writeSessionImmediateOutput(session, `\r\n[webshell error]\r\n${text}\r\n`);
  };

  const genericWebSocketStartupFallbacks = new Set([
    "WebSocket connection failed.",
    "WebSocket closed before terminal attached.",
    "WebSocket reconnect failed.",
  ]);

  const isGenericWebSocketStartupFallback = (message) =>
    genericWebSocketStartupFallbacks.has(String(message || "").trim());

  const isRetryableTerminalTransportError = (message) => {
    const normalized = String(message || "").trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return normalized.includes("network_failure")
      || normalized.includes("network failure")
      || normalized.includes("terminal queue connection close")
      || normalized.includes("terminal queue connection closed")
      || normalized.includes("terminal queue websocket error")
      || normalized.includes("queue_transport_closed")
      || normalized.includes("queue transport closed")
      || normalized.includes("fast_1_closed")
      || normalized.includes("fast_2_closed")
      || normalized.includes("transport_recovery")
      || normalized.includes("queue_keepalive_failed")
      || normalized.includes("websocket connection failed")
      || normalized.includes("websocket closed before terminal attached")
      || normalized.includes("websocket reconnect failed")
      || normalized.includes("connection timed out")
      || normalized.includes("connect timed out")
      || normalized.includes("network timeout")
      || normalized.includes("connection reset")
      || normalized.includes("connection aborted");
  };

  const showSessionStartupError = async (session, fallback = "") => {
    if (!session || session.closed || !isCurrentInstanceSession(session)) {
      return;
    }
    const requestID = Number(session.startupErrorRequestID || 0) + 1;
    session.startupErrorRequestID = requestID;
    let message = "";
    try {
      message = await readAgentStartupError(session.name);
    } catch (error) {
    }
    if (
      session.closed
      || !isCurrentInstanceSession(session)
      || Number(session.startupErrorRequestID || 0) !== requestID
    ) {
      return;
    }
    if (message) {
      if (isRetryableTerminalTransportError(message)) {
        session.startupErrorShown = false;
        writeSessionWebShellError(session, message);
        return;
      }
      if (session.hasPresentedFrame) {
        showStartupErrorPanel(message);
        console.warn("[client-terminal] startup error while preserving last frame", {
          name: session.name,
          pane: session.id,
          message,
        });
        return;
      }
      writeSessionWebShellError(session, message);
      return;
    }
    if (isGenericWebSocketStartupFallback(fallback)) {
      return;
    }
    if (isRetryableTerminalTransportError(fallback)) {
      session.startupErrorShown = false;
      writeSessionWebShellError(session, fallback);
      return;
    }
    writeSessionWebShellError(session, fallback);
  };

  const detachSessionSocket = (session, currentSocket, { connection = "" } = {}) => {
    if (!session || session.socket !== currentSocket) {
      return false;
    }
    clearResizeOutputSettle(session);
    session.socket = null;
    session.replayController?.reset();
    session.queueReplayControllerActive = false;
    session.queueReplayControllerLegacy = false;
    session.replayControllerLegacyActive = false;
    session.replayComplete = false;
    setSessionReplayAuthorization(session, false);
    session.replayCompletionPending = false;
    session.historyCacheReplayCommitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;
    session.historyCacheReplayCommitPending = false;
    session.allowGeneratedInputDuringReplay = false;
    session.agentPreparing = false;
    session.cacheV2ServerSnapshotPending = false;
    session.cacheV2ServerSnapshotStartCursor = 0n;
    session.cacheV2ReplayActive = session.cacheV2WarmReplayActive === true;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    if (connection !== "parked") {
      hideSessionTerminalPreview(session);
    }
    session.attachStartedAt = 0;
    session.attachReadyTimeoutMs = 0;
    session.lastSocketHealthAt = 0;
    clearSessionConnectionTimers(session);
    endTerminalRenderSuppression(session, { render: false, reason: "resize" });
    endTerminalRenderSuppression(session, { render: false, reason: "replay" });
    if (connection) {
      session.connectionRetrying = connection === "reconnecting";
      session.shellEl.dataset.connection = connection;
    }
    return true;
  };

  const sessionConnectingState = (session) => (
    session?.connectionRetrying === true ? "reconnecting" : "connecting"
  );

  const beginTerminalRenderSuppression = (session, reason = "generic") => {
    if (!session?.term || typeof session.term.beginRenderSuppression !== "function") {
      return false;
    }
    const key = String(reason || "generic");
    if (!(session.terminalRenderSuppressionReasons instanceof Set)) {
      session.terminalRenderSuppressionReasons = new Set();
    }
    if (session.terminalRenderSuppressionReasons.has(key)) {
      return true;
    }
    if (session.terminalRenderSuppressionReasons.size === 0) {
      session.term.beginRenderSuppression();
    }
    session.terminalRenderSuppressionReasons.add(key);
    session.terminalRenderSuppressionActive = true;
    return true;
  };

  const endTerminalRenderSuppression = (session, { render = false, full = true, reason = "generic" } = {}) => {
    if (!session?.term || !session.terminalRenderSuppressionActive) {
      return false;
    }
    const reasons = session.terminalRenderSuppressionReasons;
    if (reasons instanceof Set) {
      reasons.delete(String(reason || "generic"));
      if (reasons.size > 0) {
        return true;
      }
    }
    if (typeof session.term.endRenderSuppression === "function") {
      session.term.endRenderSuppression({ render, full });
    }
    session.terminalRenderSuppressionReasons = new Set();
    session.terminalRenderSuppressionActive = false;
    return true;
  };

  const resetTerminalForHistoryReplay = (session) => {
    if (!session?.term) {
      if (session) {
        session.lastHistoryResetFailureReason = "missing_terminal";
      }
      return false;
    }
    if (session.closed) {
      session.lastHistoryResetFailureReason = "session_closed";
      return false;
    }
    if (session.name !== activeName) {
      session.lastHistoryResetFailureReason = "target_changed";
      return false;
    }
    if (!terminalPaneHasKnownSize(session)) {
      session.lastHistoryResetFailureReason = "terminal_size_unavailable";
      appendDebugWarning("终端历史回放等待尺寸", `${terminalLocationDescription(session)}: terminal_size_unavailable`);
      return false;
    }
    return measurePerformanceTask("history replay", () => {
      clearResizeOutputSettle(session);
      beginTerminalRenderSuppression(session, "replay");
      recordTerminalSessionEvent(session, "history_replay_reset");
      discardSessionOutputBuffers(session);
      markPaneSyncPending(session);
      session.replayComplete = false;
      setSessionReplayAuthorization(session, false);
      session.replayCompletionPending = false;
      session.historyStateReady = false;
      session.resetOnNextReplay = false;
      session.selectAllBufferActive = false;
      session.term.clearSelection?.();
      session.term.viewportY = 0;
      session.term.targetViewportY = 0;
      try {
        if (!resetTerminalRuntimeState(session)) {
          session.lastHistoryResetFailureReason = "runtime_reset_failed";
          endTerminalRenderSuppression(session, { reason: "replay" });
          return false;
        }
        cancelPendingTerminalRender(session.term);
        session.initialRuntimeResetDone = true;
        session.replayFitGeneration = session.measuredFitGeneration;
        session.lastHistoryResetFailureReason = "";
      } catch (error) {
        session.lastHistoryResetFailureReason = "history_replay_reset_exception";
        appendDebugWarning("终端历史回放重置异常", `${terminalLocationDescription(session)}: ${error?.message || String(error)}`);
        endTerminalRenderSuppression(session, { reason: "replay" });
        return false;
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      return true;
    });
  };

  const requestSessionHistoryReplay = (session) => {
    if (!session?.term || session.closed || session.name !== activeName) {
      return;
    }
    clearResizeOutputSettle(session);
    session.replayController?.reset();
    session.queueReplayControllerActive = false;
    session.queueReplayControllerLegacy = false;
    session.replayControllerLegacyActive = false;
    session.resetOnNextReplay = true;
    session.cacheV2WarmReplaySeq = Number(session.cacheV2WarmReplaySeq || 0) + 1;
    session.cacheV2WarmReplayActive = false;
    session.cacheV2WarmReplayReady = false;
    session.cacheV2WarmReplayPromise = null;
    session.cacheV2WarmReplaySnapshot = null;
    session.cacheV2ServerSnapshotPending = false;
    session.cacheV2ReplayActive = false;
    session.cacheV2NetworkQueue = [];
    session.cacheV2NetworkQueueBytes = 0;
    hideSessionTerminalPreview(session);
    discardSessionOutputBuffers(session);
    const socket = session.socket;
    if (session.connectionChannel === "unified") {
      recycleTerminalUnifiedSession(session, "unified history resync requested", { immediate: true });
      return;
    }
    if (socket) {
      closeSessionSocketForReconnect(session, socket, "Terminal history resync requested.");
    } else {
      session.replayComplete = false;
      setSessionReplayAuthorization(session, false);
      session.connectionRetrying = true;
      session.shellEl.dataset.connection = "reconnecting";
    }
    session.reconnectAttempts = Math.max(1, Number(session.reconnectAttempts || 0));
    requestSessionConnection(session, { reason: "history_resync", immediate: true, allowHidden: true });
  };

  const markSessionSocketHealth = (session, currentSocket) => {
    if (session?.socket === currentSocket) {
      session.lastSocketHealthAt = Date.now();
      clearSocketResumeProbeTimer(session);
      flushPendingInput(session);
    }
  };

  const scheduleReconnect = (session, { immediate = false, allowHidden = true } = {}) => {
    if (disposed || !session || session.closed || !isCurrentInstanceSession(session) || replayRetryIsPaused(session)) {
      return;
    }
    if (navigator.onLine === false) {
      setNetworkBanner(true);
      session.shellEl.dataset.connection = "offline";
      return;
    }
    session.connectionRetrying = true;
    session.shellEl.dataset.connection = "reconnecting";
    if (session.connectionChannel === "unified") {
      recycleTerminalUnifiedSession(session, "unified connection retry requested", { immediate });
      return;
    }
    const leaseID = Number(session.connectionLeaseID || 0);
    if (leaseID && terminalConnectionScheduler?.currentLease(session)?.leaseID === leaseID) {
      terminalConnectionScheduler.notifyFailure(
        session,
        leaseID,
        new Error("terminal connection retry requested"),
        { awaitClose: Boolean(session.socket) },
      );
      return;
    }
    requestSessionConnection(session, {
      reason: "network_retry",
      immediate,
      allowHidden,
    });
  };

  const retrySessionConnectionAfterFailure = (session, error, { allowHidden = true } = {}) => {
    if (!session || session.closed || !isCurrentInstanceSession(session)) {
      return;
    }
    console.warn("[client-terminal] websocket connect attempt failed", {
      name: session.name,
      pane: session.id,
      error: error?.message || String(error),
    });
    appendDebugError("终端连接建立失败", `${terminalLocationDescription(session)}: ${error?.message || String(error)}`);
    showSessionStartupError(session, "WebSocket reconnect failed.");
    scheduleReconnect(session, { allowHidden });
  };

  const closeSessionSocketForReconnect = (session, currentSocket, reason, { allowHidden = false } = {}) => {
    if (session?.socket !== currentSocket) {
      return;
    }
    session.connectionRetrying = true;
    session.shellEl.dataset.connection = "reconnecting";
    console.warn(reason);
    appendDebugError("终端连接异常，准备重试", reason);
    if (session.connectionChannel === "unified") {
      recycleTerminalUnifiedSession(session, reason, { immediate: true });
      return;
    }
    const leaseID = Number(session.connectionLeaseID || 0);
    if (!terminalConnectionScheduler?.notifyFailure(session, leaseID, new Error(reason), { awaitClose: true })) {
      try {
        currentSocket.close();
      } catch (error) {
      }
      scheduleReconnect(session, { immediate: true, allowHidden });
    }
  };

  const probeOpenSessionSocket = (session, { allowHidden = false } = {}) => {
    const socket = session?.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || session.closed || session.name !== activeName) {
      return false;
    }
    const probeStartedAt = Date.now();
    clearSocketResumeProbeTimer(session);
    try {
      socket.send(JSON.stringify({ type: "ping" }));
    } catch (error) {
      closeSessionSocketForReconnect(session, socket, `Terminal WebSocket resume probe failed: ${session.name}/${session.id}`, { allowHidden });
      return false;
    }
    session.resumeProbeTimer = window.setTimeout(() => {
      session.resumeProbeTimer = 0;
      if (session.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const lastHealth = Number(session.lastSocketHealthAt || 0);
      if (lastHealth < probeStartedAt) {
        closeSessionSocketForReconnect(session, socket, `Terminal WebSocket resume probe timed out: ${session.name}/${session.id}`, { allowHidden });
      }
    }, terminalResumeProbeTimeoutMs);
    return true;
  };

  const startSocketHealthMonitor = (session, currentSocket) => {
    clearSocketHealthTimer(session);
    markSessionSocketHealth(session, currentSocket);
    session.socketHealthTimer = window.setInterval(() => {
      if (session.socket !== currentSocket) {
        clearSocketHealthTimer(session);
        return;
      }
      if (currentSocket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (
        session.connectionChannel === "unified"
        && session.cacheV2WarmReplayActive
        && !session.cacheV2WarmReplayReady
      ) {
        markSessionSocketHealth(session, currentSocket);
        return;
      }
      const lastHealth = Number(session.lastSocketHealthAt || 0);
      const healthTimeout = session.agentPreparing ? terminalAgentPrepareTimeoutMs : terminalWebSocketHealthTimeoutMs;
      if (lastHealth > 0 && Date.now() - lastHealth > healthTimeout) {
        closeSessionSocketForReconnect(session, currentSocket, `Terminal WebSocket health timeout: ${session.name}/${session.id}`);
        return;
      }
      try {
        currentSocket.send(JSON.stringify({ type: "ping" }));
      } catch (error) {
        closeSessionSocketForReconnect(session, currentSocket, `Terminal WebSocket ping failed: ${session.name}/${session.id}`);
      }
    }, terminalWebSocketPingIntervalMs);
  };

  const startSocketConnectTimer = (session, currentSocket) => {
    clearSocketConnectTimer(session);
    session.socketConnectTimer = window.setTimeout(() => {
      session.socketConnectTimer = 0;
      if (session.socket !== currentSocket || currentSocket.readyState !== WebSocket.CONNECTING) {
        return;
      }
      closeSessionSocketForReconnect(session, currentSocket, `Terminal WebSocket connect timed out: ${session.name}/${session.id}`);
    }, terminalWebSocketConnectTimeoutMs);
  };

  const startAttachReadyTimer = (session, currentSocket, timeoutMs = terminalAttachReadyTimeoutMs) => {
    clearAttachReadyTimer(session);
    session.attachStartedAt = Date.now();
    session.attachReadyTimeoutMs = timeoutMs;
    session.attachReadyTimer = window.setTimeout(() => {
      session.attachReadyTimer = 0;
      if (session.socket !== currentSocket || sessionReplayIsCommitted(session)) {
        return;
      }
      if (
        session.connectionChannel === "unified"
        && session.cacheV2WarmReplayActive
        && !session.cacheV2WarmReplayReady
      ) {
        startAttachReadyTimer(session, currentSocket, timeoutMs);
        return;
      }
      closeSessionSocketForReconnect(session, currentSocket, `Terminal attach timed out before replay complete: ${session.name}/${session.id}`);
    }, timeoutMs);
  };

  const checkSessionConnectionHealth = (session, { connect = true, force = false, allowHidden = false } = {}) => {
    if (disposed || !session || session.closed || !isCurrentInstanceSession(session)) {
      return false;
    }
    if (navigator.onLine === false) {
      setNetworkBanner(true);
      session.shellEl.dataset.connection = "offline";
      return false;
    }
    if (session.pendingConnect) {
      connectPendingSession(session, { allowHidden: allowHidden || force });
      return false;
    }
    const socket = session.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      const now = Date.now();
      const lastHealth = Number(session.lastSocketHealthAt || 0);
      const healthTimeout = session.agentPreparing ? terminalAgentPrepareTimeoutMs : terminalWebSocketHealthTimeoutMs;
      if (lastHealth > 0 && now - lastHealth > healthTimeout) {
        closeSessionSocketForReconnect(session, socket, `Terminal WebSocket health check failed: ${session.name}/${session.id}`, { allowHidden: allowHidden || force });
        return false;
      }
      const attachStartedAt = Number(session.attachStartedAt || 0);
      const attachReadyTimeout = Number(session.attachReadyTimeoutMs || 0) || terminalAttachReadyTimeoutMs;
      const unifiedWarmReplayActive = Boolean(
        session.connectionChannel === "unified"
        && session.cacheV2WarmReplayActive
        && !session.cacheV2WarmReplayReady
      );
      if (!unifiedWarmReplayActive && !sessionReplayIsCommitted(session) && attachStartedAt > 0 && now - attachStartedAt > attachReadyTimeout) {
        closeSessionSocketForReconnect(session, socket, `Terminal attach readiness check failed: ${session.name}/${session.id}`, { allowHidden: allowHidden || force });
        return false;
      }
      if (session.resumeProbeTimer && force) {
        return false;
      }
      return isSessionInputReady(session);
    }
    if (socket?.readyState === WebSocket.CONNECTING) {
      return false;
    }
    if (connect) {
      if (session.connectionChannel === "unified" && !force) {
        scheduleTerminalUnifiedSync({ reason: "connection_health" });
        return false;
      }
      requestSessionConnection(session, {
        reason: force ? "connection_health_user" : "connection_health",
        userInteraction: Boolean(
          force
          && session.tabId === activeTabId
          && tabs.get(session.tabId)?.activePaneId === session.id
        ),
        immediate: force,
        allowHidden: allowHidden || force,
      });
    }
    return false;
  };

  const intentionalTerminalTransportCloseReasons = new Set([
    "context_changed",
    "network_offline",
    "page_disposed",
    "tab_or_target_removed",
    "session_closed",
    "transport_recovery",
  ]);

  const waitForTerminalPhysicalClosures = async () => {
    if (terminalUnifiedClosingPromise) {
      await Promise.allSettled([terminalUnifiedClosingPromise]);
    }
  };

  const scheduleTerminalTransportRecovery = (reason = "transport_failure") => {
    const normalizedReason = String(reason || "transport_failure");
    if (
      disposed
      || navigator.onLine === false
      || isClientInstanceName(activeName)
    ) {
      return false;
    }
    if (terminalTransportRecoveryScheduled || terminalTransportRecoveryRunning) {
      terminalTransportRecoveryPendingReason = normalizedReason;
      return true;
    }
    terminalTransportRecoveryScheduled = true;
    queueMicrotask(async () => {
      terminalTransportRecoveryScheduled = false;
      if (
        disposed
        || navigator.onLine === false
        || isClientInstanceName(activeName)
        || terminalTransportRecoveryRunning
      ) {
        return;
      }
      terminalTransportRecoveryRunning = true;
      appendDebugWarning("终端物理通道异常，正在恢复", normalizedReason);
      try {
        closeTerminalUnifiedConnection("transport_recovery");
        await waitForTerminalPhysicalClosures();
        terminalUnifiedExpectedCloseReason = "";
        if (!disposed && navigator.onLine !== false) {
          refreshTerminalUnifiedMembership({ reason: "transport_recovery" });
          reconnectWorkspaceSessions({ allowHidden: true });
        }
      } catch (error) {
        appendDebugError("终端物理通道恢复失败", error?.message || String(error));
        if (
          !disposed
          && navigator.onLine !== false
          && activeName
          && !isClientInstanceName(activeName)
          && !terminalTransportRecoveryRetryTimer
        ) {
          terminalTransportRecoveryRetryTimer = window.setTimeout(() => {
            terminalTransportRecoveryRetryTimer = 0;
            scheduleTerminalTransportRecovery("transport_recovery_retry");
          }, 1000);
        }
      } finally {
        terminalTransportRecoveryRunning = false;
        const pendingReason = terminalTransportRecoveryPendingReason;
        terminalTransportRecoveryPendingReason = "";
        if (
          pendingReason
          && !disposed
          && navigator.onLine !== false
          && terminalPhysicalTransportNeedsRecovery()
        ) {
          scheduleTerminalTransportRecovery(pendingReason);
        }
      }
    });
    return true;
  };

  const startTerminalUnifiedHealthWatchdog = (connection) => {
    terminalUnifiedHealthWatchdog?.stop?.();
    terminalUnifiedHealthWatchdog = createTerminalUnifiedHealthWatchdog({
      intervalMs: terminalUnifiedHealthCheckIntervalMs,
      pongTimeoutMs: terminalUnifiedPongTimeoutMs,
      transitionTimeoutMs: terminalUnifiedTransitionTimeoutMs,
      isPaused: () => disposed || navigator.onLine === false,
      onUnhealthy: (reason, observedConnection) => {
        appendDebugWarning("统一终端物理通道健康检查失败", reason);
        handleTerminalUnifiedPhysicalDisconnect(observedConnection, reason);
      },
      onDisconnected: (reason, observedConnection) => {
        if (observedConnection && terminalUnifiedConnection !== observedConnection) {
          return;
        }
        scheduleTerminalTransportRecovery(reason);
      },
    });
    terminalUnifiedHealthWatchdog.setConnection(connection);
    return terminalUnifiedHealthWatchdog;
  };

  const probeTerminalUnifiedHealth = (reason = "lifecycle_resume") => {
    if (!terminalUnifiedHealthWatchdog || !terminalUnifiedConnection) {
      return false;
    }
    const result = terminalUnifiedHealthWatchdog.probe(reason);
    return result?.action !== "paused";
  };

  const terminalPhysicalTransportNeedsRecovery = () => Boolean(
    terminalUnifiedConnection
    && terminalUnifiedConnection.snapshot?.().physicalReadyState === WebSocket.CLOSED
    && terminalUnifiedMembership.snapshot().paneIDs.length > 0
  );

  const closeTerminalUnifiedConnection = (reason = "context_changed") => {
    terminalUnifiedExpectedCloseReason = String(reason || "context_changed");
    const connection = terminalUnifiedConnection;
    terminalUnifiedConnection = null;
    terminalUnifiedTargetName = "";
    terminalUnifiedHealthWatchdog?.stop?.();
    terminalUnifiedHealthWatchdog = null;
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane.connectionChannel === "unified") {
          pane.connectionCloseReason = String(reason || "context_changed");
        }
      }
    }
    if (!connection) {
      terminalUnifiedClosingPromise = null;
      return;
    }
    const closingPromise = Promise.resolve(connection.closed).finally(() => {
      if (terminalUnifiedClosingPromise === closingPromise) {
        terminalUnifiedClosingPromise = null;
        terminalUnifiedExpectedCloseReason = "";
      }
      if (terminalNetworkMonitor) {
        syncTerminalNetworkMonitorSockets();
      }
    });
    terminalUnifiedClosingPromise = closingPromise;
    terminalUnifiedClosedConnections.add(connection);
    connection.close(4001, reason);
  };

  const handleTerminalUnifiedPhysicalDisconnect = (connection, reason = "unified_transport_closed") => {
    if (!connection || terminalUnifiedClosedConnections.has(connection)) {
      return false;
    }
    terminalUnifiedClosedConnections.add(connection);
    terminalUnifiedHealthWatchdog?.setConnection(null);
    if (!terminalUnifiedClosingPromise) {
      let closeFenceTimer = 0;
      const closeFence = Promise.race([
        Promise.resolve(connection.closed),
        new Promise((resolve) => {
          closeFenceTimer = window.setTimeout(resolve, terminalUnifiedHealthCheckIntervalMs);
        }),
      ]).finally(() => {
        if (closeFenceTimer) {
          window.clearTimeout(closeFenceTimer);
        }
        if (terminalUnifiedClosingPromise === closeFence) {
          terminalUnifiedClosingPromise = null;
        }
      });
      terminalUnifiedClosingPromise = closeFence;
    }
    if (terminalUnifiedConnection === connection) {
      terminalUnifiedConnection = null;
      terminalUnifiedTargetName = "";
    }
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (!pane.closed && pane.name === activeName && pane.connectionChannel === "unified") {
          invalidateSessionStartupError(pane, { hidePanel: true });
          pane.connectionRetrying = true;
          pane.shellEl.dataset.connection = navigator.onLine === false ? "offline" : "reconnecting";
        }
      }
    }
    appendDebugWarning("统一终端物理通道已断开，立即重建", String(reason || "unified_transport_closed"));
    scheduleTerminalTransportRecovery(String(reason || "unified_transport_closed"));
    return true;
  };

  const retryUnavailableTerminalUnifiedTransport = (reason = "lifecycle_resume") => {
    if (disposed || navigator.onLine === false || isClientInstanceName(activeName)) {
      return false;
    }
    const state = terminalUnifiedConnection?.snapshot?.().physicalReadyState ?? WebSocket.CLOSED;
    if (terminalUnifiedConnection && state !== WebSocket.CLOSED) {
      return false;
    }
    if (terminalUnifiedMembership.snapshot().paneIDs.length === 0) {
      return false;
    }
    scheduleTerminalTransportRecovery(reason);
    return true;
  };

  const ensureTerminalUnifiedConnection = (targetName) => {
    const normalizedTarget = String(targetName || "").trim();
    if (!normalizedTarget || terminalUnifiedClosingPromise) {
      return null;
    }
    if (
      terminalUnifiedConnection
      && terminalUnifiedTargetName === normalizedTarget
      && terminalUnifiedConnection.snapshot().physicalReadyState !== WebSocket.CLOSING
      && terminalUnifiedConnection.snapshot().physicalReadyState !== WebSocket.CLOSED
    ) {
      return terminalUnifiedConnection;
    }
    if (terminalUnifiedConnection) {
      closeTerminalUnifiedConnection("unified_target_changed");
      return null;
    }
    const socketURL = webSocketURL("./ws");
    socketURL.searchParams.set("mode", "unified");
    socketURL.searchParams.set("transport_role", "unified");
    socketURL.searchParams.set("protocol_version", "1");
    socketURL.searchParams.set("name", normalizedTarget);
    socketURL.searchParams.set("client_id", serverRevisionClientID);
    let connection;
    let observedPhysicalReadyState = WebSocket.CLOSED;
    connection = createTerminalUnifiedConnection({
      url: socketURL.toString(),
      onStateChange: (state) => {
        if (terminalUnifiedConnection !== connection) {
          return;
        }
        const previousPhysicalReadyState = observedPhysicalReadyState;
        observedPhysicalReadyState = state.physicalReadyState;
        const becameOpen = state.physicalReadyState === WebSocket.OPEN
          && previousPhysicalReadyState !== WebSocket.OPEN;
        if (terminalNetworkMonitor) {
          syncTerminalNetworkMonitorSockets();
        }
        if (state.physicalReadyState === WebSocket.CONNECTING || state.physicalReadyState === WebSocket.OPEN) {
          terminalUnifiedHealthWatchdog?.start();
        }
        if (becameOpen) {
          terminalUnifiedHealthWatchdog?.probe("transport_open");
          scheduleTerminalUnifiedSync({ reason: "unified_open" });
        }
        if (state.physicalReadyState === WebSocket.CLOSED
          && !terminalUnifiedExpectedCloseReason
          && !terminalUnifiedClosedConnections.has(connection)) {
          handleTerminalUnifiedPhysicalDisconnect(connection, "unified_transport_closed");
        }
      },
      onPhysicalError: ({ message, connection: failedConnection }) => {
        appendDebugWarning("统一终端物理通道 WebSocket 错误，立即关闭重建", message);
        handleTerminalUnifiedPhysicalDisconnect(failedConnection, "unified_websocket_error");
        try {
          failedConnection.close(4001, "unified_websocket_error");
        } catch (error) {
        }
      },
      onPhysicalClose: ({ connection: closedConnection, reason }) => {
        if (!terminalUnifiedExpectedCloseReason) {
          handleTerminalUnifiedPhysicalDisconnect(closedConnection, reason || "unified_websocket_closed");
        }
      },
      onProtocolError: (error, identity) => {
        appendDebugError(
          "统一终端协议错误",
          `${identity?.paneID || "unknown"}: ${error?.message || String(error)}`,
        );
      },
    });
    terminalUnifiedConnection = connection;
    terminalUnifiedTargetName = normalizedTarget;
    startTerminalUnifiedHealthWatchdog(connection);
    if (terminalNetworkMonitor) {
      syncTerminalNetworkMonitorSockets();
    }
    Promise.resolve(connection.closed).finally(() => {
      if (terminalUnifiedConnection === connection && !terminalUnifiedExpectedCloseReason) {
        handleTerminalUnifiedPhysicalDisconnect(connection, "unified_transport_closed_finally");
      }
      if (terminalNetworkMonitor) {
        syncTerminalNetworkMonitorSockets();
      }
    });
    connection.connect();
    return connection;
  };

  const sessionHasTerminalConnectionSize = (session) => Boolean(
    terminalPaneHasKnownSize(session)
  );

  const connectSession = async (session, {
    allowHidden = false,
    leaseID = 0,
    channel = "unified",
    channelGeneration = 0,
  } = {}) => {
    let connectionEpoch = Number(session?.connectionEpoch || 0);
    const usesMultiplexedTransport = channel === "unified";
    const transportIsCurrent = () => Boolean(
      usesMultiplexedTransport
        ? channelGeneration > 0
          && session?.connectionEpoch === connectionEpoch
          && session?.connectionChannel === "unified"
          && session.connectionChannelGeneration === channelGeneration
          && terminalUnifiedConnection
          && terminalUnifiedTargetName === session.name
        : leaseID
          && session?.connectionEpoch === connectionEpoch
          && session?.connectionChannel === "fast"
          && terminalConnectionScheduler?.currentLease(session)?.leaseID === leaseID
          && session.connectionLeaseID === leaseID
          && !session.connectionLeaseClosing
    );
    if (
      !session ||
      session.closed ||
      replayRetryIsPaused(session) ||
      !transportIsCurrent() ||
      !isCurrentInstanceSession(session) ||
      !sessionHasTerminalConnectionSize(session) ||
      (document.hidden && !allowHidden) ||
      navigator.onLine === false ||
      session.socket?.readyState === WebSocket.OPEN ||
      session.socket?.readyState === WebSocket.CONNECTING
    ) {
      if (navigator.onLine === false && session?.shellEl) {
        session.shellEl.dataset.connection = "offline";
      }
      return false;
    }
    startSessionCacheV2RecoveryMetrics(session);
    session.startupTraceActive = true;
    await prepareSessionHistoryCache(session);
    markSessionCacheV2RecoveryMetric(session, "cacheManifestReadyAt");
    appendStartupTrace("终端缓存 manifest 准备完成", `pane=${session.id}`, { dedupeKey: `cache-manifest:${session.id}:${session.terminalReplayGeneration}` });
    flushSessionOutput(session, { force: true });
    try {
      const flush = flushSessionHistoryCacheWrites(session);
      await (sessionUsesTerminalCacheV2(session)
        ? withTerminalCacheTimeout(flush, terminalCacheV2CommitTimeoutMs, "Terminal cache flush before connect timed out.")
        : flush);
    } catch (error) {
      disableSessionHistoryCache(session, error);
    }
    if (
      !session ||
      session.closed ||
      !transportIsCurrent() ||
      !isCurrentInstanceSession(session) ||
      !sessionHasTerminalConnectionSize(session) ||
      (document.hidden && !allowHidden) ||
      navigator.onLine === false ||
      session.socket?.readyState === WebSocket.OPEN ||
      session.socket?.readyState === WebSocket.CONNECTING
    ) {
      return false;
    }
    session.pendingConnect = false;
    connectionEpoch += 1;
    session.connectionEpoch = connectionEpoch;
    clearReconnectTimer(session);
    session.terminalReplayGeneration = Number(session.terminalReplayGeneration || 0) + 1;
    session.replayFitGeneration = session.measuredFitGeneration;
    const socketUrl = webSocketURL("./ws");
    socketUrl.searchParams.set("name", String(session.name || "").trim());
    socketUrl.searchParams.set("client_id", serverRevisionClientID);
    if (usesMultiplexedTransport) {
      socketUrl.searchParams.set("mode", "unified");
      socketUrl.searchParams.set("transport_role", "unified");
      socketUrl.searchParams.set("protocol_version", "1");
    } else {
      socketUrl.searchParams.set("pane", session.id);
      socketUrl.searchParams.set("cols", String(session.term.cols || 120));
      socketUrl.searchParams.set("rows", String(session.term.rows || 32));
      if (!isClientInstanceName(session.name)) {
        socketUrl.searchParams.set("integrity_protocol", "fast-v1");
      }
    }
    const themePayload = terminalThemePayload();
    if (!usesMultiplexedTransport) {
      socketUrl.searchParams.set("fg", themePayload.foreground);
      socketUrl.searchParams.set("bg", themePayload.background);
      socketUrl.searchParams.set("cursor", themePayload.cursor);
    }
    const cacheV2Identity = sessionTerminalCacheV2ProtocolIdentity(session);
    if (cacheV2Identity) {
      if (!usesMultiplexedTransport) {
        socketUrl.searchParams.set("cache_protocol_version", String(cacheV2Identity.cacheProtocolVersion));
        socketUrl.searchParams.set("workspace_generation", cacheV2Identity.workspaceGeneration);
      }
    }
    const historyConnectRange = sessionHistoryRangeForConnect(session);
    const cacheV2WarmSnapshot = historyConnectRange?.source === "cache-v2"
      ? session.historyCacheSnapshot
      : null;
    const cacheV2WarmReplayStarted = cacheV2WarmSnapshot
      ? startSessionCacheV2WarmReplay(session, cacheV2WarmSnapshot)
      : false;
    if (session.cacheV2RecoveryMetrics) {
      session.cacheV2RecoveryMetrics.historySource = historyConnectRange?.source || "snapshot";
    }
    if (historyConnectRange) {
      if (!usesMultiplexedTransport) {
        socketUrl.searchParams.set("history_generation", historyConnectRange.generation);
        socketUrl.searchParams.set("local_base_cursor", historyConnectRange.baseCursor.toString());
        socketUrl.searchParams.set("local_end_cursor", historyConnectRange.endCursor.toString());
      }
    }
    if (session.resetOnNextReplay && !usesMultiplexedTransport) {
      socketUrl.searchParams.set("history_replay_mode", "snapshot");
    }
    const logSocketUrl = new URL(socketUrl.toString());
    logSocketUrl.searchParams.delete("client_id");
    logSocketUrl.searchParams.delete("history_generation");
    logSocketUrl.searchParams.delete("workspace_generation");
    const socketDebug = {
      textMessages: 0,
      binaryMessages: 0,
      binaryBytes: 0,
      openedAt: 0,
    };
    const replayController = session.replayController || (session.replayController = new TerminalReplayController());
    session.fastIntegrityEnabled = false;
    replayController.reset();
    session.queueReplayControllerActive = false;
    session.queueReplayControllerLegacy = false;
    session.replayControllerLegacyActive = false;
    const decodeFastBinaryMessage = (input) => {
      const decoded = decodeFastBinaryFrame(input, {
        selector: String(session.name || ""),
        paneID: String(session.id || ""),
        historyGeneration: String(session.historyGeneration || ""),
        expectedSequence: BigInt(session.fastIntegritySequence || 1),
        expectedStartCursor: BigInt(session.fastIntegrityCursor ?? session.receivedHistoryCursor ?? 0n),
      });
      const expectedSequence = BigInt(session.fastIntegritySequence || 1);
      const expectedCursor = BigInt(session.fastIntegrityCursor ?? session.receivedHistoryCursor ?? 0n);
      if (decoded.sequence !== expectedSequence || decoded.startCursor !== expectedCursor) {
        throw new Error("Fast binary envelope sequence or cursor discontinuity");
      }
      session.fastIntegritySequence = Number(expectedSequence + 1n);
      session.fastIntegrityCursor = decoded.endCursor;
      if (replayController.phase === "replaying") {
        replayController.acceptBinary({
          sequence: decoded.header.sequence,
          startCursor: decoded.header.start_cursor,
          endCursor: decoded.header.end_cursor,
          length: decoded.header.length,
          requestID: String(session.terminalReplayGeneration || ""),
          connectionEpoch,
          identity: {
            selector: session.name,
            paneID: session.id,
            historyGeneration: session.historyGeneration,
          },
        });
      }
      return decoded.payload;
    };
    console.info("[client-terminal] websocket connecting", {
      name: session.name,
      pane: session.id,
      cols: session.term.cols || 120,
      rows: session.term.rows || 32,
      url: logSocketUrl.toString(),
      allowHidden,
      documentHidden: document.hidden,
      reconnectAttempts: session.reconnectAttempts || 0,
      channel,
      historySource: historyConnectRange?.source || "snapshot",
      localBaseCursor: historyConnectRange?.baseCursor?.toString?.() || "",
      localEndCursor: historyConnectRange?.endCursor?.toString?.() || "",
    });
    recordTerminalSessionEvent(session, "socket_connect", {
      channel,
      streamID: session.unifiedStreamID,
    });
    let currentSocket;
    let currentMultiplexedConnection = null;
    if (usesMultiplexedTransport) {
      const multiplexedConnection = terminalUnifiedConnection || ensureTerminalUnifiedConnection(session.name);
      const streamID = session.unifiedStreamID;
      if (!multiplexedConnection || !streamID) {
        throw new Error(`terminal ${channel} multiplexed connection is unavailable`);
      }
      const size = terminalSize(session);
      const checkpointCapabilities = terminalCheckpointCapabilitiesForTerminal(session.term);
      currentMultiplexedConnection = multiplexedConnection;
      currentSocket = multiplexedConnection.open({
        pane_id: session.id,
        stream_id: streamID,
        channel_generation: channelGeneration,
        cols: size.cols || session.term.cols || 120,
        rows: size.rows || session.term.rows || 32,
        pixel_width: size.pixelWidth,
        pixel_height: size.pixelHeight,
        cache_protocol_version: cacheV2Identity?.cacheProtocolVersion || 0,
        workspace_generation: cacheV2Identity?.workspaceGeneration || "",
        history_generation: historyConnectRange?.generation || "",
        local_base_cursor: historyConnectRange?.baseCursor?.toString?.() || "",
        local_end_cursor: historyConnectRange?.endCursor?.toString?.() || "",
        history_replay_mode: session.resetOnNextReplay ? "snapshot" : "",
        flow_control: "turn-ack-v1",
        foreground: themePayload.foreground,
        background: themePayload.background,
        cursor: themePayload.cursor,
        ...(checkpointCapabilities.length > 0
          ? { checkpoint_capabilities: checkpointCapabilities }
          : {}),
      });
    } else {
      currentSocket = new WebSocket(socketUrl.toString());
    }
    if (!transportIsCurrent()) {
      try {
        currentSocket.close(4001, "stale lease");
      } catch (error) {
      }
      return false;
    }
    session.socket = currentSocket;
    if (terminalNetworkMonitor) {
      syncTerminalNetworkMonitorSockets();
    }
    session.replayComplete = false;
    setSessionReplayAuthorization(session, false);
    session.replayCompletionPending = false;
    session.queueTurnReceivedCursor = null;
    session.queueTurnReceivedSequence = null;
    session.pendingQueueTurnAck = null;
    session.allowGeneratedInputDuringReplay = false;
    if (!cacheV2WarmReplayStarted) {
      session.cacheV2ReplayActive = false;
      session.cacheV2NetworkQueue = [];
      session.cacheV2NetworkQueueBytes = 0;
    }
    if (!cacheV2WarmReplayStarted) {
      hideSessionTerminalPreview(session);
    }
    invalidateSessionStartupError(session);
    session.shellEl.dataset.connection = sessionConnectingState(session);
    currentSocket.binaryType = "arraybuffer";
    startSocketConnectTimer(session, currentSocket);

    if (cacheV2WarmSnapshot) {
      showSessionCacheV2LocalPreview(session, cacheV2WarmSnapshot).catch((error) => {
        console.warn("[terminal-cache-v2] local preview load failed", {
          name: session.name,
          pane: session.id,
          error: error?.message || String(error),
        });
      });
    }

    const replayMessageHasIdentity = (message) => {
      const selector = String(message?.selector || "").trim();
      const paneID = String(message?.pane_id || message?.paneId || "").trim();
      return selector || paneID;
    };

    const validateReplayMessage = (message) => {
      const selector = String(message?.selector || "").trim();
      const paneID = String(message?.pane_id || message?.paneId || "").trim();
      // Legacy control frames may omit identity, but every identity field that
      // is present must independently match this terminal owner.
      return (!selector || selector === session.name)
        && (!paneID || paneID === session.id);
    };

    // Multiplexed transports already route frames by logical stream, but keep
    // a second identity gate at the terminal owner. This protects against a
    // stale callback or a malformed relay writing another pane into this
    // Ghostty instance after the logical stream has been replaced.
    const validateTerminalChannelMessageIdentity = (event, messageType = "", isBinary = false) => {
      if (!usesMultiplexedTransport) {
        return true;
      }
      const metadata = event?.queueMetadata;
      if (!metadata) {
        // The physical Unified state broadcast is intentionally fan-out and
        // has no pane identity. Every pane may consume only this one control.
        return !isBinary && messageType === "agent-preparing";
      }
      const paneID = String(metadata.paneID || metadata.pane_id || "").trim();
      const streamID = String(metadata.streamID || metadata.stream_id || "").trim();
      const generation = Math.floor(Number(metadata.channelGeneration || metadata.channel_generation || 0));
      const expectedStreamID = String(session.unifiedStreamID).trim();
      return paneID === session.id
        && streamID !== ""
        && streamID === expectedStreamID
        && Number.isSafeInteger(generation)
        && generation > 0
        && generation === Math.floor(Number(channelGeneration || 0));
    };

    const rejectMismatchedReplay = (message) => {
      const selector = String(message?.selector || "").trim() || "unknown";
      const paneID = String(message?.pane_id || message?.paneId || "").trim() || "unknown";
      session.cacheV2WarmReplaySeq = Number(session.cacheV2WarmReplaySeq || 0) + 1;
      session.cacheV2WarmReplayActive = false;
      session.cacheV2WarmReplayReady = false;
      session.cacheV2WarmReplayPromise = null;
      session.cacheV2WarmReplaySnapshot = null;
      invalidatePanePresentation(session);
      console.warn("[client-terminal] rejected terminal replay", {
        selector,
        pane: paneID,
        expectedName: session.name,
        expectedPane: session.id,
        messageType: message?.type,
      });
      appendDebugError("终端回放身份校验失败", `${selector}/${paneID}`);
      console.warn(`Rejected terminal replay for ${selector}/${paneID}; expected ${session.name}/${session.id}.`);
      closeSessionSocketForReconnect(session, currentSocket, "Terminal replay identity validation failed.");
    };

    const rejectMismatchedChannelMessage = (event, messageType) => {
      const metadata = event?.queueMetadata || {};
      const paneID = String(metadata.paneID || metadata.pane_id || "unknown").trim() || "unknown";
      const streamID = String(metadata.streamID || metadata.stream_id || "unknown").trim() || "unknown";
      session.resetOnNextReplay = true;
      session.replayComplete = false;
      setSessionReplayAuthorization(session, false);
      session.replayCompletionPending = false;
      session.replayController?.reset();
      session.queueReplayControllerActive = false;
      session.queueReplayControllerLegacy = false;
      session.replayControllerLegacyActive = false;
      discardSessionOutputBuffers(session);
      // Keep the last valid frame visible while the current logical stream is
      // replaced. The wrong frame must never be allowed to turn into a black
      // screen while the session is resynchronizing.
      beginTerminalPresentationHold(session);
      console.warn("[client-terminal] rejected multiplexed terminal message", {
        name: session.name,
        pane: session.id,
        messageType,
        receivedPane: paneID,
        receivedStream: streamID,
        expectedStream: session.unifiedStreamID,
        expectedGeneration: channelGeneration,
      });
      appendDebugError("终端会话消息身份不匹配", `${session.name}/${session.id}: ${messageType}`);
      closeSessionSocketForReconnect(session, currentSocket, "Terminal multiplexed message identity validation failed.");
    };

    const rejectHistorySync = (reason) => {
      const resetFailureReason = session.lastHistoryResetFailureReason;
      if (resetFailureReason && /reset/i.test(String(reason)) && /failed|exception/i.test(String(reason))) {
        reason = `${reason} (${resetFailureReason})`;
      }
      session.resetOnNextReplay = true;
      session.historyStateReady = false;
      session.historyProtocolActive = false;
      session.historyCacheSnapshot = null;
      session.historyGeneration = "";
      session.replayController?.reset();
      session.queueReplayControllerActive = false;
      session.queueReplayControllerLegacy = false;
      session.replayControllerLegacyActive = false;
      session.cacheV2WarmReplaySeq = Number(session.cacheV2WarmReplaySeq || 0) + 1;
      session.cacheV2WarmReplayActive = false;
      session.cacheV2WarmReplayReady = false;
      session.cacheV2WarmReplayPromise = null;
      session.cacheV2WarmReplaySnapshot = null;
      session.cacheV2ServerSnapshotPending = false;
      markPaneSyncPending(session);
      deleteSessionHistoryCache(session);
      console.warn("[terminal-history] rejected history sync", {
        name: session.name,
        pane: session.id,
        reason,
      });
      appendDebugError("终端历史同步失败", reason);
      if (noteSessionReplayFailure(session, reason)) {
        try {
          currentSocket.close(4001, "replay_retry_paused");
        } catch (error) {
        }
        return;
      }
      closeSessionSocketForReconnect(session, currentSocket, `Terminal history sync failed: ${reason}`);
    };

    currentSocket.addEventListener("open", () => {
      if (session.socket !== currentSocket || !transportIsCurrent()) {
        return;
      }
      if (!usesMultiplexedTransport) {
        terminalConnectionScheduler?.notifyOpen(session, leaseID);
      }
      socketDebug.openedAt = Date.now();
      markSessionCacheV2RecoveryMetric(session, "websocketOpenAt");
      appendStartupTrace("终端 WebSocket 已打开", `pane=${session.id} channel=${channel}`, { dedupeKey: `socket-open:${session.id}:${session.terminalReplayGeneration}:${channel}` });
      console.info("[client-terminal] websocket open", {
        name: session.name,
        pane: session.id,
        cols: session.term.cols || 120,
        rows: session.term.rows || 32,
        reconnectAttempts: session.reconnectAttempts || 0,
      });
      session.reconnectPending = false;
      session.shellEl.dataset.connection = sessionConnectingState(session);
      clearSocketConnectTimer(session);
      startSocketHealthMonitor(session, currentSocket);
      startAttachReadyTimer(session, currentSocket);
      if (isTerminalInputBlocked() || session.inputLocked) {
        sendSessionInputLock(session, true);
        discardSessionInputBuffers(session);
      }
      sendTerminalTheme(session);
      resizePane(session, { forceSizeSync: true });
      if (session.tabId === activeTabId && currentTab()?.activePaneId === session.id) {
        session.term.focus();
      }
    });

    currentSocket.addEventListener("message", (event) => {
      if (session.socket !== currentSocket || !transportIsCurrent()) {
        return;
      }
      markSessionSocketHealth(session, currentSocket);
      session.startupErrorShown = true;
      if (session.name !== activeName) {
        terminalConnectionScheduler?.release(session, "tab_or_target_removed");
        return;
      }
      if (typeof event.data === "string") {
        socketDebug.textMessages += 1;
        try {
          const message = JSON.parse(event.data);
          if (message && typeof message.type === "string") {
            if (!validateTerminalChannelMessageIdentity(event, message.type, false)) {
              rejectMismatchedChannelMessage(event, message.type);
              return;
            }
            if (
              socketDebug.textMessages <= 8
              || message.type === "history-replay-start"
              || message.type === "history-replay-complete"
              || message.type === "process-exit"
              || message.type === "agent-preparing"
            ) {
              console.info("[client-terminal] websocket control message", {
                name: session.name,
                pane: session.id,
                type: message.type,
                selector: message.selector || "",
                paneID: message.pane_id || message.paneId || "",
                replayVerified: session.replayVerified || false,
                replayComplete: session.replayComplete,
                syncMode: message.sync_mode || "",
                serverBaseCursor: message.server_base_cursor || "",
                serverEndCursor: message.server_end_cursor || "",
                textMessages: socketDebug.textMessages,
              });
            }
            switch (message.type) {
              case "resize-applied":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                handleTerminalResizeApplied(session, message);
                return;
              case "resize-error":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                handleTerminalResizeError(session, message);
                return;
              case "history-replay-start":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                recordTerminalSessionEvent(session, "history_replay_start", {
                  syncMode: String(message.sync_mode || ""),
                });
                // Keep one suppression scope across all replay drain tasks.
                // writeReplay() alone only protects one synchronous chunk.
                beginTerminalRenderSuppression(session, "replay");
                session.agentPreparing = false;
                const resizeProtocol = String(message.resize_protocol || "").trim();
                if (resizeProtocol === "epoch-v1") {
                  session.resizeEpochSupported = true;
                } else if (session.resizeEpochSupported !== true) {
                  session.resizeEpochSupported = false;
                  session.resizeAckPending = false;
                }
                const historyGeneration = String(message.history_generation || "").trim();
                const syncMode = String(message.sync_mode || "").trim();
                const serverBaseCursor = parseHistoryCursor(message.server_base_cursor);
                const serverEndCursor = parseHistoryCursor(message.server_end_cursor);
                const deltaFromCursor = parseHistoryCursor(message.delta_from_cursor);
                const deltaToCursor = parseHistoryCursor(message.delta_to_cursor);
                const replayResizeEpoch = normalizeTerminalResizeEpoch(message.resize_epoch);
                if (replayResizeEpoch && !session.resizeAckPending) {
                  session.appliedResizeEpoch = replayResizeEpoch;
                  session.serverCols = Math.max(0, Math.floor(Number(message.cols) || 0));
                  session.serverRows = Math.max(0, Math.floor(Number(message.rows) || 0));
                  session.serverPixelWidth = Math.max(0, Math.floor(Number(message.pixel_width) || 0));
                  session.serverPixelHeight = Math.max(0, Math.floor(Number(message.pixel_height) || 0));
                }
                session.fastIntegrityEnabled = String(message.integrity_protocol || "").trim() === "fast-v1";
                const modernHistoryProtocol = Boolean(historyGeneration && syncMode);
                if (!modernHistoryProtocol) {
                  replayController.beginLegacy({
                    requestID: String(session.terminalReplayGeneration || ""),
                    connectionEpoch,
                    identity: { selector: session.name, paneID: session.id },
                  });
                  session.queueReplayControllerActive = false;
                  session.queueReplayControllerLegacy = usesMultiplexedTransport;
                  session.replayControllerLegacyActive = true;
                  session.historyProtocolActive = false;
                  session.historyStateReady = false;
                  session.historyGeneration = "";
                  session.historyCacheSnapshot = null;
                  session.localBaseCursor = 0n;
                  session.receivedHistoryCursor = 0n;
                  session.appliedHistoryCursor = 0n;
                  session.persistedHistoryCursor = 0n;
                  session.historyReplayTargetCursor = 0n;
                  session.serverBaseCursor = 0n;
                  disableSessionHistoryCache(session);
                  if (!resetTerminalForHistoryReplay(session)) {
                    closeSessionSocketForReconnect(session, currentSocket, "Terminal reset for legacy replay failed.");
                    return;
                  }
                  setSessionReplayAuthorization(
                    session,
                    replayMessageHasIdentity(message) ? "identified" : "legacy",
                  );
                  session.allowGeneratedInputDuringReplay = message.allow_generated_input === true || message.allowGeneratedInput === true;
                  session.suppressGeneratedTerminalInputUntil = 0;
                  session.shellEl.dataset.connection = sessionConnectingState(session);
                  return;
                }
                if (
                  !["snapshot", "delta", "current"].includes(syncMode) ||
                  serverBaseCursor === null ||
                  serverEndCursor === null ||
                  deltaFromCursor === null ||
                  deltaToCursor === null ||
                  serverBaseCursor > serverEndCursor ||
                  deltaFromCursor > deltaToCursor ||
                  deltaToCursor !== serverEndCursor
                ) {
                  rejectHistorySync("invalid server history range");
                  return;
                }
                if (!validateSessionCacheV2MessageIdentity(session, message, historyGeneration)) {
                  rejectHistorySync("terminal cache-v2 replay identity does not match");
                  return;
                }
                session.historyProtocolActive = true;
                session.historyGeneration = historyGeneration;
                session.historySyncMode = syncMode;
                if (session.cacheV2RecoveryMetrics) {
                  session.cacheV2RecoveryMetrics.syncMode = syncMode;
                  markSessionCacheV2RecoveryMetric(session, "replayStartAt");
                appendStartupTrace("PTY replay 开始", `pane=${session.id} mode=${syncMode || "legacy"} source=${session.cacheV2RecoveryMetrics?.historySource || "unknown"}`, { dedupeKey: `replay-start:${session.id}:${session.terminalReplayGeneration}` });
                }
                session.fastIntegritySequence = 1;
                session.fastIntegrityCursor = deltaFromCursor ?? 0n;
                session.historyReplayTargetCursor = deltaToCursor;
                if (channel === "fast" && !isClientInstanceName(session.name) && !usesMultiplexedTransport && session.fastIntegrityEnabled !== true) {
                  replayController.beginLegacy({
                    requestID: String(session.terminalReplayGeneration || ""),
                    connectionEpoch,
                    identity: { selector: session.name, paneID: session.id },
                  });
                  session.replayControllerLegacyActive = true;
                } else {
                  replayController.begin({
                    requestID: String(session.terminalReplayGeneration || ""),
                    connectionEpoch,
                    identity: {
                      selector: session.name,
                      paneID: session.id,
                      historyGeneration,
                    },
                    startCursor: deltaFromCursor,
                    targetCursor: deltaToCursor,
                  });
                  session.replayControllerLegacyActive = false;
                }
                session.queueReplayControllerActive = usesMultiplexedTransport && deltaFromCursor === deltaToCursor;
                session.queueReplayControllerLegacy = false;
                session.serverBaseCursor = serverBaseCursor;
                session.resetOnNextReplay = false;
                if (syncMode === "snapshot") {
                  const snapshot = session.historyCacheSnapshot;
                  const keepWarmState = Boolean(
                    sessionCacheV2WarmReplayMatchesSnapshot(session, snapshot)
                    && snapshot.historyGeneration === historyGeneration
                    && snapshot.endCursor <= serverEndCursor
                  );
                  const stageServerSnapshot = keepWarmState || session.hasPresentedFrame;
                  if (stageServerSnapshot) {
                    session.cacheV2ServerSnapshotPending = true;
                    session.cacheV2ServerSnapshotStartCursor = deltaFromCursor;
                    session.cacheV2ReplayActive = true;
                    session.cacheV2NetworkQueue = [];
                    setSessionReplayAuthorization(session, "identified");
                  } else {
                    if (!resetTerminalForHistoryReplay(session)) {
                      rejectHistorySync("terminal reset failed");
                      return;
                    }
                    session.historyGeneration = historyGeneration;
                    session.historyProtocolActive = true;
                    session.historySyncMode = syncMode;
                    session.serverBaseCursor = serverBaseCursor;
                    session.localBaseCursor = serverBaseCursor;
                    session.receivedHistoryCursor = deltaFromCursor;
                    session.appliedHistoryCursor = deltaFromCursor;
                    session.persistedHistoryCursor = deltaFromCursor;
                    setSessionReplayAuthorization(session, "identified");
                    resetSessionHistoryCache(session, historyGeneration, deltaFromCursor);
                  }
                } else {
                  if (!historyConnectRange || historyConnectRange.generation !== historyGeneration || historyConnectRange.endCursor !== deltaFromCursor) {
                    rejectHistorySync("local and server history ranges do not match");
                    return;
                  }
                  if (historyConnectRange.source === "memory") {
                    if (!session.historyStateReady || session.appliedHistoryCursor !== deltaFromCursor) {
                      rejectHistorySync("in-memory terminal cursor is not reusable");
                      return;
                    }
                    discardSessionOutputBuffers(session);
                    session.receivedHistoryCursor = deltaFromCursor;
                  } else if (historyConnectRange.source === "cache") {
                    const snapshot = session.historyCacheSnapshot;
                    if (!snapshot || snapshot.generation !== historyGeneration || snapshot.baseCursor !== historyConnectRange.baseCursor || snapshot.endCursor !== deltaFromCursor) {
                      rejectHistorySync("cached terminal history is unavailable");
                      return;
                    }
                    if (!resetTerminalForHistoryReplay(session)) {
                      rejectHistorySync("terminal reset for cached history failed");
                      return;
                    }
                    session.historyGeneration = historyGeneration;
                    session.historyProtocolActive = true;
                    session.historySyncMode = syncMode;
                    session.serverBaseCursor = serverBaseCursor;
                    session.localBaseCursor = snapshot.baseCursor;
                    session.receivedHistoryCursor = snapshot.baseCursor;
                    session.appliedHistoryCursor = snapshot.baseCursor;
                    session.persistedHistoryCursor = snapshot.endCursor;
                    for (const chunk of snapshot.chunks) {
                      writeSessionOutput(session, chunk.data, {
                        historySource: "cache",
                        startCursor: chunk.startCursor,
                        endCursor: chunk.endCursor,
                      });
                    }
                    if (session.receivedHistoryCursor !== deltaFromCursor) {
                      rejectHistorySync("cached terminal history did not reach requested cursor");
                      return;
                    }
                  } else if (historyConnectRange.source === "cache-v2") {
                    const snapshot = session.historyCacheSnapshot;
                    if (
                      !snapshot
                      || snapshot.historyGeneration !== historyGeneration
                      || snapshot.baseCursor !== historyConnectRange.baseCursor
                      || !validateSessionCacheV2ReplayIdentity(session, message, snapshot, deltaFromCursor)
                    ) {
                      rejectHistorySync("cached terminal cache-v2 history is unavailable");
                      return;
                    }
                    if (sessionCacheV2WarmReplayMatchesSnapshot(session, snapshot)) {
                      session.historyGeneration = historyGeneration;
                      session.historyProtocolActive = true;
                      session.historySyncMode = syncMode;
                      session.serverBaseCursor = serverBaseCursor;
                      setSessionReplayAuthorization(session, "identified");
                    } else {
                      if (!resetTerminalForHistoryReplay(session)) {
                        rejectHistorySync("terminal reset for cache-v2 history failed");
                        return;
                      }
                      session.historyGeneration = historyGeneration;
                      session.historyProtocolActive = true;
                      session.historySyncMode = syncMode;
                      session.serverBaseCursor = serverBaseCursor;
                      session.localBaseCursor = snapshot.baseCursor;
                      session.receivedHistoryCursor = snapshot.baseCursor;
                      session.appliedHistoryCursor = snapshot.baseCursor;
                      setSessionReplayAuthorization(session, "identified");
                      beginSessionCacheV2Replay(session, snapshot, deltaFromCursor, currentSocket, rejectHistorySync);
                    }
                  } else {
                    rejectHistorySync("unknown local history source");
                    return;
                  }
                }
                setSessionReplayAuthorization(session, "identified");
                session.allowGeneratedInputDuringReplay = message.allow_generated_input === true || message.allowGeneratedInput === true;
                session.suppressGeneratedTerminalInputUntil = 0;
                session.shellEl.dataset.connection = sessionConnectingState(session);
                return;
              case "history-replay-complete":
                appendStartupTrace("PTY replay 完成通知", `pane=${session.id}`, { dedupeKey: `replay-complete:${session.id}:${session.terminalReplayGeneration}` });
                if (!sessionReplayIsAuthorized(session) || (sessionReplayHasIdentifiedAuthorization(session) && !validateReplayMessage(message))) {
                  rejectMismatchedReplay(message);
                  return;
                }
                if (session.historyProtocolActive) {
                  const completeGeneration = String(message.history_generation || "").trim();
                  const completeCursor = parseHistoryCursor(message.history_cursor);
                  const completeCacheV2IdentityValid = !sessionHasTerminalCacheV2Protocol(session) || (
                    Number(message.cache_protocol_version || 0) === 2
                    && String(message.workspace_generation || "").trim() === session.cacheV2WorkspaceIdentity.workspaceGeneration
                    && String(message.tab_id || "").trim() === session.tabId
                  );
                  if (
                    completeGeneration !== session.historyGeneration
                    || completeCursor === null
                    || completeCursor !== session.historyReplayTargetCursor
                    || (!session.cacheV2ReplayActive && session.receivedHistoryCursor < completeCursor)
                    || !completeCacheV2IdentityValid
                  ) {
                    rejectHistorySync("history replay completion range does not match");
                    return;
                  }
                }
                if (session.replayControllerLegacyActive) {
                  try {
                    replayController.completeLegacy({
                      requestID: String(session.terminalReplayGeneration || ""),
                      connectionEpoch,
                      identity: { selector: session.name, paneID: session.id },
                    });
                  } catch (error) {
                    rejectMismatchedReplay(message);
                    return;
                  }
                }
                const replayControllerRequired = (
                  channel === "fast" && !isClientInstanceName(session.name) && session.fastIntegrityEnabled === true
                ) || (
                  usesMultiplexedTransport && session.queueReplayControllerActive
                );
                if (replayControllerRequired && session.historyProtocolActive) {
                  try {
                    replayController.complete({
                      cursor: message.history_cursor,
                      requestID: String(session.terminalReplayGeneration || ""),
                      connectionEpoch,
                      identity: {
                        selector: session.name,
                        paneID: session.id,
                        historyGeneration: session.historyGeneration,
                      },
                    });
                  } catch (error) {
                    rejectHistorySync(error?.message || "Fast replay completion validation failed");
                    return;
                  }
                }
                markSessionCacheV2RecoveryMetric(session, "historyReplayCompleteAt");
                recordTerminalSessionEvent(session, "history_replay_complete", {
                  cursor: message.history_cursor || "",
                });
                if (session.cacheV2ServerSnapshotPending) {
                  applySessionCacheV2ServerSnapshot(session, currentSocket, rejectHistorySync);
                  return;
                }
                session.replayCompletionPending = true;
                finishSessionHistoryReplayIfReady(session) || flushSessionOutput(session);
                return;
              case "queue-turn-complete":
                if (usesMultiplexedTransport) {
                  const appliedCursor = String(message.applied_cursor || "").trim();
                  const appliedSequence = String(message.applied_sequence || "").trim();
                  const receivedCursor = String(session.queueTurnReceivedCursor ?? "").trim();
                  const receivedSequence = String(session.queueTurnReceivedSequence ?? "").trim();
                  if (
                    /^\d+$/.test(appliedCursor)
                    && /^\d+$/.test(appliedSequence)
                    && appliedCursor === receivedCursor
                    && appliedSequence === receivedSequence
                  ) {
                    const cursor = parseHistoryCursor(appliedCursor);
                    if (cursor === null) {
                      rejectHistorySync("queue turn acknowledgement cursor is invalid");
                      return;
                    }
                    session.pendingQueueTurnAck = {
                      socket: currentSocket,
                      connectionEpoch,
                      channelGeneration: Number(session.connectionChannelGeneration || 0),
                      cursor,
                      sequence: appliedSequence,
                    };
                    recordTerminalSessionEvent(session, "queue_turn_ack_pending", {
                      cursor: appliedCursor,
                      sequence: appliedSequence,
                      queuedBytes: session.outputQueueSize,
                    });
                    flushSessionOutput(session, {
                      maxBytes: terminalOutputFlushBudgetBytes,
                      maxEntries: terminalOutputFlushMaxEntries,
                      maxTimeMs: terminalOutputFlushTimeBudgetMs,
                      scheduleRemainder: true,
                    });
                    trySendPendingQueueTurnAck(session);
                    if (sessionReplayIsCommitted(session)) {
                      ensurePanePresentation(session, {
                        reason: "queue_turn_complete",
                        forceHistory: true,
                      });
                    }
                  } else if (appliedCursor || appliedSequence) {
                    rejectHistorySync("queue turn acknowledgement boundary does not match received output");
                    return;
                  }
                }
                return;
              case "agent-preparing":
                session.agentPreparing = true;
                startAttachReadyTimer(session, currentSocket, terminalAgentPrepareTimeoutMs);
                session.shellEl.dataset.connection = sessionConnectingState(session);
                return;
              case "workspace-refresh-required":
                terminalConnectionScheduler?.release(session, "tab_or_target_removed");
                refreshWorkspaceWithRetry({ focus: session.tabId === activeTabId }).catch((error) => showToast(error.message));
                return;
              case "connection-error":
                console.warn("[client-terminal] retryable connection error", {
                  name: session.name,
                  pane: session.id,
                  message: message.message || "",
                });
                if (!sessionReplayIsCommitted(session) && noteSessionReplayFailure(session, message.message || "replay_connection_error")) {
                  try {
                    currentSocket.close(4001, "replay_retry_paused");
                  } catch (error) {
                  }
                  return;
                }
                closeSessionSocketForReconnect(session, currentSocket, message.message || "Terminal retryable connection error.");
                return;
              case "pong":
                return;
              case "process-exit":
                console.warn("[client-terminal] process exit message", {
                  name: session.name,
                  pane: session.id,
                  retryable: message.retryable === true,
                  exitCode: message.exit_code,
                  message: message.message || "",
                });
                if (message.retryable === true && !/pane not found/i.test(String(message.message || ""))) {
                  showSessionStartupError(session, message.message || "Client terminal connection failed.");
                  closeSessionSocketForReconnect(session, currentSocket, message.message || "Terminal process exited with a retryable error.");
                  return;
                }
                const shouldFocusAfterExit = session.tabId === activeTabId && currentTab()?.activePaneId === session.id;
                session.exitExpected = true;
                session.workspaceExitPending = true;
                terminalConnectionScheduler?.release(session, "tab_or_target_removed");
                refreshWorkspaceWithRetry({ focus: shouldFocusAfterExit }).catch((error) => showToast(error.message));
                return;
            }
          }
        } catch (error) {
          if (socketDebug.textMessages <= 8) {
            console.warn("[client-terminal] websocket text message parse failed", {
              name: session.name,
              pane: session.id,
              bytes: event.data.length,
              textMessages: socketDebug.textMessages,
              error: error?.message || String(error),
            });
          }
        }
        writeSessionOutput(session, event.data, { connectionEpoch });
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        socketDebug.binaryMessages += 1;
        socketDebug.binaryBytes += event.data.byteLength;
        if (!validateTerminalChannelMessageIdentity(event, "", true)) {
          rejectMismatchedChannelMessage(event, "binary-output");
          return;
        }
        if (socketDebug.binaryMessages <= 8) {
          console.info("[client-terminal] websocket binary message", {
            name: session.name,
            pane: session.id,
            bytes: event.data.byteLength,
            binaryMessages: socketDebug.binaryMessages,
            binaryBytes: socketDebug.binaryBytes,
            replayVerified: session.replayVerified || false,
            replayComplete: session.replayComplete,
          });
        }
        let outputPayload = new Uint8Array(event.data);
        if (channel === "fast" && !isClientInstanceName(session.name) && session.fastIntegrityEnabled === true) {
          try {
            outputPayload = decodeFastBinaryMessage(event.data);
            if (!outputPayload) {
              throw new Error("Fast binary integrity envelope is missing");
            }
          } catch (error) {
            rejectHistorySync(error?.message || "Fast binary integrity validation failed");
            return;
          }
        }
        if (usesMultiplexedTransport && replayController.phase === "replaying" && session.historyProtocolActive) {
          const metadata = event.queueMetadata || {};
          if (metadata.sequence === undefined || metadata.sequence === null) {
            replayController.reset();
            session.queueReplayControllerActive = false;
            session.queueReplayControllerLegacy = true;
          } else {
            try {
              replayController.acceptBinary({
                sequence: metadata.sequence,
                startCursor: metadata.startCursor,
                endCursor: metadata.endCursor,
                length: outputPayload.byteLength,
                requestID: String(session.terminalReplayGeneration || ""),
                connectionEpoch,
                identity: {
                  selector: session.name,
                  paneID: session.id,
                  historyGeneration: session.historyGeneration,
                },
              });
              session.queueReplayControllerActive = true;
            } catch (error) {
              rejectHistorySync(error?.message || "Queue replay controller validation failed");
              return;
            }
          }
        }
        if (!sessionReplayIsAuthorized(session) && !sessionReplayIsCommitted(session)) {
          if (socketDebug.binaryMessages <= 8) {
            console.warn("[client-terminal] dropped binary before replay verification", {
              name: session.name,
              pane: session.id,
              bytes: event.data.byteLength,
              binaryMessages: socketDebug.binaryMessages,
            });
          }
          return;
        }
        if (session.cacheV2ReplayActive) {
          const data = outputPayload;
          if (session.cacheV2RecoveryMetrics) {
            session.cacheV2RecoveryMetrics.serverReplayBytes += data.byteLength;
          }
          session.cacheV2NetworkQueue.push(data);
          session.cacheV2NetworkQueueBytes += data.byteLength;
          if (session.cacheV2NetworkQueueBytes > maxQueuedTerminalOutputBytes) {
            rejectHistorySync("terminal cache-v2 network delta queue exceeded its limit");
          }
          return;
        }
        try {
          if (session.cacheV2RecoveryMetrics) {
            session.cacheV2RecoveryMetrics.serverReplayBytes += outputPayload.byteLength;
          }
          if (usesMultiplexedTransport) {
            const metadata = event.queueMetadata || {};
          if (metadata.endCursor !== undefined && metadata.sequence !== undefined) {
            session.queueTurnReceivedCursor = metadata.endCursor;
            session.queueTurnReceivedSequence = metadata.sequence;
          }
        }
        writeSessionOutput(session, outputPayload, {
            connectionEpoch,
            deferRender: usesMultiplexedTransport && sessionReplayIsCommitted(session),
          });
        } catch (error) {
          rejectHistorySync(error?.message || "terminal history output range failed");
        }
      }
    });

    currentSocket.addEventListener("close", (event) => {
      if (session.socket !== currentSocket || (!usesMultiplexedTransport && session.connectionLeaseID !== leaseID)) {
        return;
      }
      recordTerminalSessionEvent(session, "socket_close", {
        channel,
        code: Number(event.code || 0),
        wasClean: event.wasClean === true,
      });
      const schedulerCloseReason = usesMultiplexedTransport
        ? String(session.connectionCloseReason || "")
        : String(session.connectionLeaseCloseReason || "");
      const intentionallyParked = [
        "scheduler_preempt",
        "capacity_reduced",
        "background_tab_parked",
        "membership_removed",
      ].includes(schedulerCloseReason);
      const intentionallyClosed = [
        "session_closed",
        "tab_or_target_removed",
        "page_disposed",
      ].includes(schedulerCloseReason);
      const intentionalTransportClose = intentionallyParked || intentionallyClosed;
      pausePendingInputExpiry(session);
      console[intentionalTransportClose ? "info" : "warn"]("[client-terminal] websocket close", {
        name: session.name,
        tab: session.tabId,
        pane: session.id,
        scope: "session/tab/pane",
        code: event.code,
        reason: event.reason || "",
        wasClean: event.wasClean,
        openDurationMs: socketDebug.openedAt ? Date.now() - socketDebug.openedAt : 0,
        textMessages: socketDebug.textMessages,
        binaryMessages: socketDebug.binaryMessages,
        binaryBytes: socketDebug.binaryBytes,
        replayVerified: session.replayVerified || false,
        replayComplete: session.replayComplete,
        startupErrorShown: session.startupErrorShown,
        exitExpected: session.exitExpected === true,
      });
      if (!intentionalTransportClose) {
        appendDebugWarning("终端 WebSocket 已断开", `${terminalLocationDescription(session)}, code=${event.code}, ${event.reason || "无原因"}`);
      }
      const nextConnectionState = replayRetryIsPaused(session)
        ? "error"
        : intentionallyParked
        ? "parked"
        : intentionallyClosed
          ? "closed"
          : schedulerCloseReason === "network_offline"
          ? "offline"
          : "reconnecting";
      const sharedPhysicalTransportLost = !isClientInstanceName(session.name)
        && currentMultiplexedConnection
        && terminalUnifiedClosedConnections.has(currentMultiplexedConnection);
      const retryableTransportClose = !intentionallyClosed && (usesMultiplexedTransport
        || isRetryableTerminalTransportError(schedulerCloseReason)
        || isRetryableTerminalTransportError(event.reason));
      if (retryableTransportClose) {
        invalidateSessionStartupError(session, { hidePanel: true });
      }
      detachSessionSocket(session, currentSocket, { connection: nextConnectionState });
      if (usesMultiplexedTransport) {
        session.unifiedConnectPending = false;
      }
      session.connectionLeaseClosing = false;
      session.connectionLeaseCloseReason = "";
      session.connectionLeaseID = 0;
      session.connectionCloseReason = "";
      if (usesMultiplexedTransport) {
        session.connectionChannel = "";
        session.connectionChannelGeneration = 0;
        session.unifiedStreamID = "";
      } else {
        session.connectionChannel = "";
        session.connectionChannelGeneration = 0;
        session.fastStreamID = "";
      }
      if (!session.closed) {
        flushSessionOutput(session);
      }
      if (usesMultiplexedTransport) {
        if (sharedPhysicalTransportLost) {
          return;
        }
        if (!session.closed && !intentionallyClosed && !intentionallyParked) {
          scheduleTerminalUnifiedPaneRetry(
            session,
            `${terminalLocationDescription(session)}: ${schedulerCloseReason || event.reason || "unified_stream_closed"}`,
            { immediate: true },
          );
        }
        return;
      }
      const fastPhysicalTransportLost = false;
      if (!fastPhysicalTransportLost) {
        terminalConnectionScheduler?.notifyClosed(session, leaseID, {
          reason: schedulerCloseReason || "server_close",
          code: event.code,
          wasClean: event.wasClean,
        });
      }
      // Direct client sockets remain scheduler-owned; Unified physical loss is
      // handled above by the single physical owner.
      if (intentionallyParked) {
        appendDebugLog("info", "终端连接已停放", `${terminalLocationDescription(session)}, lease=${leaseID}`);
        return;
      }
      if (session.exitExpected || session.closed || schedulerCloseReason === "tab_or_target_removed" || schedulerCloseReason === "page_disposed") {
        return;
      }
      if (!retryableTransportClose && !fastPhysicalTransportLost && !session.startupErrorShown) {
        session.startupErrorShown = true;
        showSessionStartupError(session, event.reason || "WebSocket closed before terminal attached.");
      }
    });

    currentSocket.addEventListener("error", (event) => {
      if (session.socket !== currentSocket || !transportIsCurrent()) {
        return;
      }
      console.warn("[client-terminal] websocket error", {
        name: session.name,
        pane: session.id,
        readyState: currentSocket.readyState,
        openDurationMs: socketDebug.openedAt ? Date.now() - socketDebug.openedAt : 0,
        textMessages: socketDebug.textMessages,
        binaryMessages: socketDebug.binaryMessages,
        binaryBytes: socketDebug.binaryBytes,
        replayVerified: session.replayVerified || false,
        replayComplete: session.replayComplete,
        eventType: event.type,
      });
      appendDebugError("终端 WebSocket 错误", `${session.name}/${session.id}: ${event.message || "连接失败"}`);
      session.connectionRetrying = true;
      session.shellEl.dataset.connection = "reconnecting";
      flushSessionOutput(session);
      if (!isRetryableTerminalTransportError(event.message || "WebSocket connection failed.") && !session.startupErrorShown) {
        session.startupErrorShown = true;
        showSessionStartupError(session, "WebSocket connection failed.");
      }
      if (usesMultiplexedTransport) {
        recycleTerminalUnifiedSession(session, "unified logical websocket error", { immediate: true });
      } else {
        terminalConnectionScheduler?.notifyFailure(session, leaseID, new Error("Terminal WebSocket error"), { awaitClose: true });
      }
    });
    return true;
  };

  const terminalUnifiedStreamID = (session, generation) => {
    const randomID = globalThis.crypto?.randomUUID?.();
    return randomID || `${String(session?.id || "pane")}-${generation}-${Date.now()}`;
  };

  const clearTerminalUnifiedPaneRetry = (session, { resetAttempts = false } = {}) => {
    if (!session) {
      return;
    }
    if (session.unifiedRetryTimer) {
      window.clearTimeout(session.unifiedRetryTimer);
      session.unifiedRetryTimer = 0;
    }
    if (resetAttempts) {
      session.unifiedRetryAttempts = 0;
    }
  };

  const scheduleTerminalUnifiedPaneRetry = (session, reason, { immediate = false } = {}) => {
    if (disposed || !session || session.closed || !isCurrentInstanceSession(session) || replayRetryIsPaused(session)) {
      return false;
    }
    if (navigator.onLine === false) {
      clearTerminalUnifiedPaneRetry(session);
      session.shellEl.dataset.connection = "offline";
      return false;
    }
    if (session.unifiedRetryTimer) {
      return true;
    }
    session.unifiedRetryAttempts = Math.min(20, Number(session.unifiedRetryAttempts || 0) + 1);
    const delay = immediate
      ? terminalUnifiedPaneRetryBaseDelayMs
      : Math.min(
        terminalUnifiedPaneRetryMaxDelayMs,
        terminalUnifiedPaneRetryBaseDelayMs * (2 ** Math.min(session.unifiedRetryAttempts - 1, 8)),
      );
    session.connectionRetrying = true;
    session.shellEl.dataset.connection = "reconnecting";
    session.unifiedRetryTimer = window.setTimeout(() => {
      session.unifiedRetryTimer = 0;
      scheduleTerminalUnifiedSync({ reason: "pane_retry" });
    }, delay);
    appendDebugWarning(
      "统一终端 logical stream 将重试",
      `${terminalLocationDescription(session)}, 第 ${session.unifiedRetryAttempts} 次, ${delay}ms 后: ${reason}`,
    );
    return true;
  };

  const detachTerminalUnifiedSession = (session, reason = "membership_removed") => {
    if (!session || session.connectionChannel !== "unified") {
      return false;
    }
    session.connectionCloseReason = reason;
    const socket = session.socket;
    if (socket) {
      try {
        socket.close(4001, reason);
      } catch (error) {
        detachSessionSocket(session, socket, { connection: session.closed ? "closed" : "reconnecting" });
      }
    } else {
      session.connectionChannel = "";
      session.connectionChannelGeneration = 0;
      session.unifiedStreamID = "";
    }
    return true;
  };

  const connectTerminalUnifiedSession = (session) => {
    if (
      !session
      || session.closed
      || session.unifiedConnectPending
      || session.unifiedRetryTimer
      || replayRetryIsPaused(session)
      || session.socket
      || !sessionHasTerminalConnectionSize(session)
    ) {
      return false;
    }
    const connection = ensureTerminalUnifiedConnection(session.name);
    if (!connection) {
      if (terminalUnifiedClosingPromise) {
        Promise.resolve(terminalUnifiedClosingPromise).finally(() => scheduleTerminalUnifiedSync({ reason: "physical_closed" }));
      }
      return false;
    }
    terminalUnifiedChannelGeneration += 1;
    const generation = terminalUnifiedChannelGeneration;
    session.unifiedConnectPending = true;
    session.connectionChannel = "unified";
    session.connectionChannelGeneration = generation;
    session.connectionCloseReason = "";
    session.unifiedStreamID = terminalUnifiedStreamID(session, generation);
    session.connectionRetrying = Number(session.unifiedRetryAttempts || 0) > 0;
    session.shellEl.dataset.connection = sessionConnectingState(session);
    connectSession(session, {
      allowHidden: true,
      channel: "unified",
      channelGeneration: generation,
    }).then((started) => {
      if (!started && session.connectionChannel === "unified" && session.connectionChannelGeneration === generation) {
        throw new Error("unified logical stream could not start");
      }
    }).catch((error) => {
      if (session.connectionChannel !== "unified" || session.connectionChannelGeneration !== generation) {
        return;
      }
      appendDebugError("统一终端 logical stream 建立失败", `${session.name}/${session.id}: ${error?.message || String(error)}`);
      detachTerminalUnifiedSession(session, "unified_retry");
      scheduleTerminalUnifiedPaneRetry(session, error?.message || "unified_connect_failed");
    }).finally(() => {
      if (session.connectionChannelGeneration === generation) {
        session.unifiedConnectPending = false;
      }
    });
    return true;
  };

  const reconcileTerminalUnifiedMembership = () => {
    terminalUnifiedSyncScheduled = false;
    if (disposed || navigator.onLine === false || isClientInstanceName(activeName)) {
      return;
    }
    const membership = terminalUnifiedMembership.snapshot();
    const paneIDs = new Set(membership.paneIDs);
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (pane.connectionChannel === "unified" && !paneIDs.has(pane.id)) {
          detachTerminalUnifiedSession(pane, pane.closed ? "session_closed" : "membership_removed");
        }
      }
    }
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        if (paneIDs.has(pane.id) && !pane.socket && !replayRetryIsPaused(pane)) {
          connectTerminalUnifiedSession(pane);
        }
      }
    }
    for (const [paneID, priority] of Object.entries(membership.priorities)) {
      terminalUnifiedConnection?.setPriority(paneID, priority);
    }
  };

  scheduleTerminalUnifiedSync = ({ reason = "membership_changed" } = {}) => {
    if (disposed || terminalUnifiedSyncScheduled) {
      return;
    }
    terminalUnifiedSyncScheduled = true;
    queueMicrotask(reconcileTerminalUnifiedMembership);
  };

  recycleTerminalUnifiedSession = (session, reason, { immediate = false } = {}) => {
    if (!session || session.connectionChannel !== "unified") {
      return false;
    }
    session.connectionRetrying = true;
    session.shellEl.dataset.connection = "reconnecting";
    detachTerminalUnifiedSession(session, "unified_retry");
    scheduleTerminalUnifiedPaneRetry(session, reason, { immediate });
    return true;
  };

  const ensureClientTerminalConnectionScheduler = () => {
    if (terminalConnectionScheduler) {
      return terminalConnectionScheduler;
    }
    terminalConnectionScheduler = createTerminalConnectionScheduler({
    capacity: terminalClientDirectWebSocketCapacity,
    connect: async (session, lease) => {
      session.connectionChannel = "fast";
      session.connectionChannelGeneration = 0;
      session.fastStreamID = "";
      session.connectionLeaseID = lease.leaseID;
      session.connectionLeaseClosing = false;
      session.connectionLeaseCloseReason = "";
      resumePendingInputExpiry(session);
      session.shellEl.dataset.connection = sessionConnectingState(session);
      appendDebugLog(
        "info",
        "终端连接租约已分配",
        `${terminalLocationDescription(session)}, lease=${lease.leaseID}, P${lease.priority}`,
      );
      try {
        const started = await connectSession(session, {
          allowHidden: lease.allowHidden,
          leaseID: lease.leaseID,
          channel: "fast",
          channelGeneration: session.connectionChannelGeneration,
        });
        if (!started && terminalConnectionScheduler?.currentLease(session)?.leaseID === lease.leaseID) {
          throw new Error("terminal connection lease could not start");
        }
      } catch (error) {
        if (terminalConnectionScheduler?.currentLease(session)?.leaseID === lease.leaseID) {
          pausePendingInputExpiry(session);
          session.connectionRetrying = true;
          session.shellEl.dataset.connection = navigator.onLine === false ? "offline" : "reconnecting";
          retrySessionConnectionAfterFailure(session, error, { allowHidden: true });
        }
        throw error;
      }
    },
    disconnect: (session, reason, lease) => {
      if (!session || session.connectionLeaseID !== lease.leaseID) {
        return;
      }
      session.connectionLeaseClosing = true;
      session.connectionLeaseCloseReason = reason;
      // A scheduler handoff closes only the logical Fast stream. Keep queued
      // user input alive while the replacement lease replays its history.
      pausePendingInputExpiry(session);
      clearSessionConnectionTimers(session);
      if (
        reason === "scheduler_preempt"
        || reason === "capacity_reduced"
        || reason === "background_tab_parked"
        || reason === "context_changed"
      ) {
        session.connectionRetrying = false;
        session.shellEl.dataset.connection = "parked";
        appendDebugLog(
          "info",
          "终端连接租约被抢占",
          `${terminalLocationDescription(session)}, lease=${lease.leaseID}`,
        );
      } else if (reason === "network_offline") {
        session.shellEl.dataset.connection = "offline";
      } else if (reason === "session_closed" || reason === "tab_or_target_removed" || reason === "page_disposed") {
        session.shellEl.dataset.connection = "closed";
      } else {
        session.connectionRetrying = true;
        session.shellEl.dataset.connection = "reconnecting";
      }
      const socket = session.socket;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        session.connectionLeaseClosing = false;
        session.connectionLeaseCloseReason = "";
        session.connectionLeaseID = 0;
        session.connectionChannelGeneration = 0;
        session.fastStreamID = "";
        terminalConnectionScheduler?.notifyClosed(session, lease.leaseID, { reason });
        return;
      }
      try {
        socket.close(4001, reason);
      } catch (error) {
        session.socket = null;
        session.connectionLeaseClosing = false;
        session.connectionLeaseCloseReason = "";
        session.connectionLeaseID = 0;
        session.connectionChannelGeneration = 0;
        session.fastStreamID = "";
        terminalConnectionScheduler?.notifyClosed(session, lease.leaseID, { reason });
      }
    },
    retryDelay: (attempt, session) => {
      const baseDelay = Math.min(terminalReconnectMaxDelayMs, terminalReconnectBaseDelayMs * (2 ** Math.min(attempt, 8)));
      const jitter = baseDelay * terminalReconnectJitterRatio * ((Math.random() * 2) - 1);
      const delay = Math.max(0, Math.round(baseDelay + jitter));
      if (session && !session.closed) {
        session.reconnectAttempts = Math.min(20, Math.max(Number(session.reconnectAttempts || 0), attempt + 1));
        appendDebugWarning(
          "终端连接将在重试",
          `${session.name}/${session.id}, 第 ${attempt + 1} 次, ${delay}ms 后`,
        );
      }
      return delay;
    },
    onStateChange: (state) => {
      terminalConnectionSchedulerState = state;
      if (state.capacityInvariantViolations > 0) {
        appendDebugError(
          "终端连接池容量异常",
          `active=${state.activeCount}, capacity=${state.capacity}`,
        );
      }
    },
  });
    terminalConnectionScheduler.setOnline(navigator.onLine !== false);
    return terminalConnectionScheduler;
  };

  const installTerminalKeyOverrides = (session) => {
    const term = session?.term;
    if (typeof term?.attachCustomKeyEventHandler !== "function") {
      return;
    }
    term.attachCustomKeyEventHandler((event) => {
      if (runTerminalFontSizeShortcut(event)) {
        return true;
      }
      const altMetaInput = terminalAltMetaInputFromEvent(event);
      if (altMetaInput) {
        term.input(altMetaInput, true);
        return true;
      }
      if (
        hasMobileStickyModifiers()
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey
        && canApplyStickyModifierInput(event.key)
      ) {
        sendTerminalTextInput(session, event.key, { applySticky: true });
        return true;
      }
      if (event.key !== "Tab" || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return false;
      }
      term.input(backtabSequence, true);
      return true;
    });
  };

  const isPrintableAsciiCharacter = (value) => {
    const points = Array.from(String(value || ""));
    if (points.length !== 1) {
      return false;
    }
    const codePoint = points[0].codePointAt(0);
    return Number.isFinite(codePoint) && codePoint >= 0x20 && codePoint <= 0x7e;
  };

  const terminalAltMetaInputFromEvent = (event) => {
    if (!(event instanceof KeyboardEvent) || !event.altKey || event.ctrlKey || event.metaKey) {
      return "";
    }
    if (event.getModifierState?.("AltGraph")) {
      return "";
    }
    let key = String(event.key || "");
    if (!isPrintableAsciiCharacter(key)) {
      key = shortcutKeyFromEventCode(event);
      if (event.shiftKey) {
        key = applyStickyShiftInput(key) || key;
      }
    }
    if (!isPrintableAsciiCharacter(key)) {
      return "";
    }
    return `\x1b${key}`;
  };

  const normalizeTerminalInitialSize = (value, minValue) => {
    const next = Math.floor(Number(value));
    return Number.isFinite(next) && next >= minValue ? next : 0;
  };

  const createPaneSession = (tab, instanceName, { id = "", connect = true, cols = 0, rows = 0 } = {}) => {
    const normalizedID = String(id || `pane-${nextPaneSeq++}`).trim();
    const numeric = Number(normalizedID.replace(/^pane-/, ""));
    if (Number.isFinite(numeric) && numeric >= nextPaneSeq) {
      nextPaneSeq = numeric + 1;
    }
    const initialCols = normalizeTerminalInitialSize(cols, 2);
    const initialRows = normalizeTerminalInitialSize(rows, 1);
    const initialTerminalOptions = initialCols > 0 && initialRows > 0 ? { cols: initialCols, rows: initialRows } : {};
    const shellEl = document.createElement("section");
    shellEl.className = "pane-shell";
    shellEl.dataset.paneId = normalizedID;
    shellEl.dataset.connection = connect ? "connecting" : "idle";
    shellEl.dataset.renderReady = "false";
    shellEl.dataset.hasPresentedFrame = "false";
    shellEl.dataset.previewReady = "false";
    shellEl.setAttribute("tabindex", "-1");

    const terminalHost = document.createElement("div");
    terminalHost.className = "terminal-host";
    shellEl.appendChild(terminalHost);

    const term = new Terminal(terminalOptions(initialTerminalOptions));
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    if (term.options) {
      term.options.mobilePixelScroll = mobilePixelScrollEnabled && isMobileLayout();
    }
    term.open(terminalHost);
    const terminalPreview = document.createElement("img");
    terminalPreview.className = "terminal-cache-preview";
    terminalPreview.alt = "";
    terminalPreview.hidden = true;
    terminalPreview.draggable = false;
    terminalHost.appendChild(terminalPreview);
    const terminalFrameHold = document.createElement("canvas");
    terminalFrameHold.className = "terminal-frame-hold";
    terminalFrameHold.hidden = true;
    terminalHost.appendChild(terminalFrameHold);
    const compositionPreview = document.createElement("span");
    compositionPreview.className = "terminal-composition-preview";
    compositionPreview.hidden = true;
    terminalHost.appendChild(compositionPreview);
    const session = {
      id: normalizedID,
      tabId: tab.id,
      name: instanceName,
      shellEl,
      terminalHost,
      terminalPreview,
      terminalFrameHold,
      terminalFrameHeld: false,
      terminalFrameHoldIdentity: null,
      compositionPreview,
      term,
      fitAddon,
      socket: null,
      pendingConnect: Boolean(connect),
      initialCols,
      initialRows,
      reconnectTimer: 0,
      reconnectPending: false,
      reconnectAttempts: 0,
      startupTraceActive: false,
      connectionRetrying: false,
      connectionLeaseID: 0,
      connectionLeaseClosing: false,
      connectionLeaseCloseReason: "",
      connectionCloseReason: "",
      connectionChannel: "",
      connectionChannelGeneration: 0,
      connectionEpoch: 0,
      unifiedStreamID: "",
      unifiedConnectPending: false,
      unifiedRetryTimer: 0,
      unifiedRetryAttempts: 0,
      queueTurnReceivedCursor: null,
      queueTurnReceivedSequence: null,
      lastHistoryResetFailureReason: "",
      startupErrorRequestID: 0,
      connectionMeasurementFrame: 0,
      connectionMeasurementAttempts: 0,
      lastUserInteractionAt: 0,
      lastBecameVisibleAt: 0,
      connectionPriorityTimer: 0,
      socketConnectTimer: 0,
      socketHealthTimer: 0,
      attachReadyTimer: 0,
      resumeProbeTimer: 0,
      attachStartedAt: 0,
      attachReadyTimeoutMs: 0,
      lastSocketHealthAt: 0,
      replayFailureAttempts: 0,
      replayRetryPaused: false,
      lastReplayFailureReason: "",
      replayComplete: false,
      replayAuthorization: false,
      replayVerified: false,
      replayController: new TerminalReplayController(),
      queueReplayControllerActive: false,
      queueReplayControllerLegacy: false,
      replayControllerLegacyActive: false,
      replayCompletionPending: false,
      agentPreparing: false,
      pendingInput: [],
      pendingInputSize: 0,
      pendingInputExpiryTimer: 0,
      pendingInputQueuedAt: 0,
      pendingInputExpiryToken: 0,
      pendingInputExpiryLeaseID: 0,
      pendingInputExpiryGeneration: 0,
      pendingInputExpiryPaused: false,
      inputBuffer: "",
      inputBufferSize: 0,
      inputFlushTimer: 0,
      inputQueue: [],
      inputQueueSize: 0,
      inputPumpTimer: 0,
      inputPumpActive: false,
      outputQueue: [],
      outputQueueSize: 0,
      outputQueueGeneration: 0,
      pendingQueueTurnAck: null,
      outputOverloadPending: false,
      outputFlushFrame: 0,
      outputFlushTimer: 0,
      replayPresentationCheckpointPending: false,
      replayPresentationCheckpointTimer: 0,
      replayPresentationCheckpointCursor: 0n,
      replayOutputDepth: 0,
      allowGeneratedInputDuringReplay: false,
      resetOnNextReplay: false,
      historyGeneration: "",
      historyProtocolActive: false,
      historySyncMode: "",
      historyStateReady: false,
      historyCacheLoaded: false,
      historyCacheDisabled: false,
      historyCacheLoadPromise: null,
      historyCacheSnapshot: null,
      historyCacheResetPromise: Promise.resolve(),
      historyCacheWriteQueue: [],
      historyCacheWriteBytes: 0,
      historyCacheWriteFrame: 0,
      historyCacheWriteTimer: 0,
      historyCacheWritePromise: Promise.resolve(),
      historyCacheDestroyPromise: null,
      historyCacheReplayCommitPending: false,
      historyCacheReplayCommitSeq: 0,
      cacheV2WorkspaceIdentity: activeWorkspaceCacheV2Identity && activeWorkspaceCacheV2Identity.selector === instanceName
        ? { ...activeWorkspaceCacheV2Identity }
        : null,
      cacheV2Epoch: activeWorkspaceCacheV2Epoch,
      cacheV2ReplayActive: false,
      cacheV2ReplayPromise: null,
      cacheV2NetworkQueue: [],
      cacheV2NetworkQueueBytes: 0,
      cacheV2WarmReplaySeq: 0,
      cacheV2WarmReplayGeneration: 0,
      cacheV2WarmReplayActive: false,
      cacheV2WarmReplayReady: false,
      cacheV2WarmReplayPromise: null,
      cacheV2WarmReplaySnapshot: null,
      cacheV2ServerSnapshotPending: false,
      cacheV2ServerSnapshotStartCursor: 0n,
      cacheV2PreviewURL: "",
      cacheV2PreparedPreview: null,
      cacheV2PreviewAuthorizedSnapshot: null,
      cacheV2PreviewPreparePromise: null,
      cacheV2PreviewPrepareSeq: 0,
      cacheV2PreviewCaptureTimer: 0,
      cacheV2PreviewCaptureIdle: 0,
      cacheV2PreviewCaptureSeq: 0,
      cacheV2PreviewCaptureAllowRecentOutput: false,
      cacheV2PreviewCapturePending: false,
      cacheV2PreviewCaptureRunning: false,
      lastTerminalOutputAt: 0,
      cacheV2OverviewPreview: null,
      cacheV2OverviewPreviewPromise: null,
      cacheV2OverviewPreviewSeq: 0,
      cacheV2LastTouchAt: 0,
      cacheV2CompactionScheduled: false,
      cacheV2RecoveryMetrics: null,
      localBaseCursor: 0n,
      receivedHistoryCursor: 0n,
      appliedHistoryCursor: 0n,
      persistedHistoryCursor: 0n,
      presentedHistoryCursor: 0n,
      historyReplayTargetCursor: 0n,
      serverBaseCursor: 0n,
      suppressGeneratedTerminalInputUntil: 0,
      inputLocked: false,
      composingIME: false,
      nativeDeleteInputPending: false,
      nativeDeleteResetTimer: 0,
      terminalInputAnchor: null,
      inputViewportLock: null,
      exitExpected: false,
      workspaceExitPending: false,
      closed: false,
      initialRuntimeResetDone: false,
      measuredFitGeneration: 0,
      terminalReplayGeneration: 0,
      replayFitGeneration: 0,
      pendingRenderFitGeneration: 0,
      pendingRenderReplayGeneration: 0,
      terminalContentGeneration: 0,
      pendingRenderContentGeneration: 0,
      presentedContentGeneration: 0,
      presentedFitGeneration: 0,
      presentedReplayGeneration: 0,
      requestedResizeEpoch: "",
      appliedResizeEpoch: "",
      presentedResizeEpoch: "",
      renderSnapshot: new RenderSnapshot(),
      renderGeneration: 0,
      lastResizeRequestAt: 0,
      resizeFenceActive: false,
      resizeFenceTarget: null,
      resizeFenceApplying: false,
      resizeFenceDrainTimer: 0,
      resizeFenceDrainRemainingEntries: null,
      resizeOutputSettleActive: false,
      resizeOutputSettleDrainPending: false,
      resizeOutputSettleDrainRemainingEntries: null,
      resizeController: new TerminalResizeController(),
      resizeControllerSettleToken: 0,
      resizeOutputSettleTimer: 0,
      resizeOutputSettleStartedAt: 0,
      resizeOutputSettleDeadline: 0,
      resizeOutputSettleToken: 0,
      terminalEventTimeline: [],
      requestedCols: 0,
      requestedRows: 0,
      requestedPixelWidth: 0,
      requestedPixelHeight: 0,
      resizeEpochSupported: null,
      resizeAckPending: false,
      suppressTerminalResizeSend: false,
      lastObservedHostWidth: 0,
      lastObservedHostHeight: 0,
      renderReady: false,
      presentationPending: true,
      fullRenderPending: false,
      fullRenderValidationTimer: 0,
      presentationValidationAttempts: 0,
      presentationDeferredReason: "",
      presentationFramePending: false,
      presentationFrameReason: "",
      presentationRetryTimer: 0,
      presentationRetryPending: false,
      presentationRetryReason: "",
      presentationCommitPending: false,
      hasPresentedFrame: false,
      activationFitPending: false,
      resizePresentationHold: false,
      baseTheme: activeTheme,
      selectAllBufferActive: false,
      title: "",
      hasUserInputSinceFocus: false,
      notifyWhenIdle: false,
      cursorBlinkHoldTimer: 0,
      tty: "",
      busy: false,
      command: "",
      processCommandLine: "",
      cwd: "",
      activityCheckedAt: 0,
      lastSizeReassertAt: 0,
      lastSizeClaimAt: 0,
      serverCols: 0,
      serverRows: 0,
      serverPixelWidth: 0,
      serverPixelHeight: 0,
      lastSentPixelWidth: 0,
      lastSentPixelHeight: 0,
      sizeClaimRequired: false,
      cleanupCallbacks: [],
    };
    installTerminalCanvasRecovery(session);
    clearTerminalRuntimeBuffer(session);
    clearTerminalCanvasPixels(session);

    installTerminalHostInputIsolation(session);
    installTerminalInputFocus(session);
    installTerminalKeyOverrides(session);
    installTerminalHostViewportGuard(session);
    installTerminalBottomScrollbarPatch(session);
    installRendererBaselinePatch(session);
    installRendererThemeMapper(session);
    installRendererCellSeamPatch(session);
    installMobileTouchSelection(session);
    installClaudeTerminalTouchAdapter(session);
    installOpencodeTerminalTouchAdapter(session);
    installHerdrTerminalTouchAdapter(session);
    installPiTerminalTouchAdapter(session);
    installClaudeTerminalContextMenuAdapter(session);
    installClaudeTerminalDesktopSelectionAdapter(session);
    installTerminalMouseTracking(session);
    installDesktopMouseClipboard(session);
    installTerminalResizeObserver(session);
    const renderDisposable = typeof term.onRender === "function" ? term.onRender(() => {
      const presentationCompleted = markPaneRenderedIfMeasurable(session);
      if (
        !presentationCompleted
        && sessionReplayIsCommitted(session)
        && session.tabId === activeTabId
        && !panePresentationIsCurrent(session)
      ) {
        schedulePanePresentationFrame(session, "render_callback");
      }
      syncTerminalViewportPan(session);
    }) : null;
    if (renderDisposable && typeof renderDisposable.dispose === "function") {
      session.cleanupCallbacks.push(() => renderDisposable.dispose());
    }

    term.onData((data) => {
      const generatedResponse = isGeneratedTerminalResponse(data);
      const generatedResponseTail = isGeneratedTerminalResponseTail(data);
      if (isTerminalInputBlocked()) {
        if (generatedResponse || generatedResponseTail) {
          armGeneratedInputSuppression(session, 1000);
        }
        discardSessionInputBuffers(session);
        return;
      }
      if (shouldSuppressGeneratedTerminalInput(session, data)) {
        return;
      }
      if (session.processingGeneratedTerminalResponses || generatedResponse) {
        sendSessionInput(session, data, { immediate: true, generated: true });
        return;
      }
      if (generatedResponseTail) {
        return;
      }
      if (session.replayOutputDepth > 0) {
        if (session.allowGeneratedInputDuringReplay) {
          sendSessionInput(session, data, { immediate: true, generated: true });
        }
        return;
      }
      holdTerminalCursorVisible(session);
      reassertTerminalSize(session);
      sendOrQueueInput(session, data, { userInput: !isGeneratedTerminalResponse(data) });
    });
    term.onResize(() => {
      if (!isPaneVisibleForSizing(session)) {
        return;
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      updateMobileSelectionHandles(session);
      if (session.suppressTerminalResizeSend) {
        return;
      }
      sendTerminalSize(session);
    });
    term.onTitleChange((title) => {
      const current = tabs.get(session.tabId);
      const normalized = String(title || "").trim();
      const changed = normalized !== session.title;
      session.title = normalized;
      if (current && !current.customLabel) {
        refreshTabAutoLabel(current);
      }
      if (changed) {
        markSessionTitleNotification(session);
      }
    });
    term.onSelectionChange(() => {
      if (!term.hasSelection?.()) {
        session.selectAllBufferActive = false;
      }
      updateSelectionSheet();
    });

    shellEl.addEventListener("pointerdown", (event) => {
      reassertTerminalSizeForMouse(session, event);
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false, userInteraction: true });
    });
    shellEl.addEventListener("focusin", () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    });
    shellEl.addEventListener("contextmenu", (event) => {
      if (!shouldSuppressTerminalContextMenu(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
      closeContextMenu();
    }, { capture: true });
    shellEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
      if (shouldSuppressTerminalContextMenu(event)) {
        closeContextMenu();
        return;
      }
      const link = findURLAtPosition(session, event.clientX, event.clientY);
      showContextMenu(event.clientX, event.clientY, { type: "pane", tabId: session.tabId, paneId: session.id, link: link?.url || "" });
    });
    terminalHost.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        event.preventDefault();
        reassertTerminalSize(session, { force: true });
        pasteIntoSession(session, text).catch((error) => showToast(error.message));
      }
    });

    tab.panes.set(normalizedID, session);
    if (isClientInstanceName(instanceName)) {
      ensureClientTerminalConnectionScheduler().register(session);
    }
    if (connect) {
      connectPendingSession(session, { allowHidden: true });
    }
    return session;
  };

  const renderTabLabel = (tab) => {
    const label = tab.button?.querySelector(".tab-label");
    if (label) {
      label.textContent = tab.label;
      tab.button.title = tab.label;
    }
    if (tab.id === activeTabId) {
      updateDocumentTitle();
    }
    scheduleTabOverviewRender();
  };

  const applyTabRenameLocally = (tab, label) => {
    tab.label = label;
    tab.customLabel = true;
    renderTabLabel(tab);
  };

  const commitTabRename = async (tabId, label, { optimistic = false, force = false } = {}) => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return false;
    }
    const normalized = String(label || "").trim();
    if (!normalized) {
      return false;
    }
    if (!force && normalized === tab.label) {
      return false;
    }
    if (!applyingWorkspaceState) {
      const previousLabel = tab.label;
      const previousCustomLabel = tab.customLabel;
      if (optimistic) {
        applyTabRenameLocally(tab, normalized);
      }
      try {
        await postWorkspaceAction("rename_tab", { tab_id: tabId, label: normalized }, optimistic ? { focus: false, preferStateActiveTab: false } : {});
      } catch (error) {
        const current = tabs.get(tabId);
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
    const state = inlineTabRenameState;
    if (!state?.input) {
      return;
    }
    const tab = tabs.get(state.tabId);
    const button = tab?.button;
    const label = button?.querySelector(".tab-label");
    if (!button?.isConnected || !label) {
      state.input.hidden = true;
      return;
    }
    const buttonRect = button.getBoundingClientRect();
    const tabsRect = tabsEl.getBoundingClientRect();
    const left = Math.max(buttonRect.left + 30, tabsRect.left + 6);
    const right = Math.min(buttonRect.right - 30, tabsRect.right - 6);
    if (right <= left || buttonRect.bottom <= tabsRect.top || buttonRect.top >= tabsRect.bottom) {
      state.input.hidden = true;
      return;
    }
    const width = Math.max(48, right - left);
    const height = Math.min(26, Math.max(22, buttonRect.height - 10));
    state.input.hidden = false;
    state.input.style.left = `${left}px`;
    state.input.style.top = `${buttonRect.top + (buttonRect.height - height) / 2}px`;
    state.input.style.width = `${width}px`;
    state.input.style.height = `${height}px`;
  };

  const finishInlineTabRename = ({ commit = true, restoreFocus = false } = {}) => {
    const state = inlineTabRenameState;
    if (!state || state.finishing) {
      return Promise.resolve(false);
    }
    state.finishing = true;
    inlineTabRenameState = null;
    state.controller.abort();
    const tab = tabs.get(state.tabId);
    const nextLabel = String(state.input.value || "").trim();
    tab?.button?.classList.remove("renaming");
    state.input.remove();
    if (restoreFocus) {
      tab?.button?.focus?.();
    }
    if (!commit || !state.dirty || !nextLabel) {
      return Promise.resolve(false);
    }
    return commitTabRename(state.tabId, nextLabel, { optimistic: true });
  };

  const beginInlineTabRename = (tabId) => {
    if (isMobileLayout()) {
      return;
    }
    const tab = tabs.get(tabId);
    if (!tab?.button) {
      return;
    }
    if (inlineTabRenameState?.tabId === tabId) {
      inlineTabRenameState.input.focus();
      inlineTabRenameState.input.select();
      return;
    }
    finishInlineTabRename({ commit: true }).catch((error) => showToast(error.message));
    closeContextMenu();
    setActiveTab(tabId, { focus: false });

    const input = document.createElement("input");
    input.className = "tab-rename-input";
    input.type = "text";
    input.value = tab.label;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "重命名标签");

    const controller = new AbortController();
    const state = {
      tabId,
      input,
      controller,
      dirty: false,
      finishing: false,
    };
    inlineTabRenameState = state;
    tab.button.classList.add("renaming");
    document.body.appendChild(input);
    positionInlineTabRenameInput();

    input.addEventListener("input", () => {
      state.dirty = true;
    }, { signal: controller.signal });
    input.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    }, { signal: controller.signal });
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    }, { signal: controller.signal });
    input.addEventListener("dblclick", (event) => {
      event.stopPropagation();
    }, { signal: controller.signal });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.key === "Process" || Number(event.keyCode || 0) === 229) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finishInlineTabRename({ commit: true, restoreFocus: true }).catch((error) => showToast(error.message));
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finishInlineTabRename({ commit: false, restoreFocus: true }).catch((error) => showToast(error.message));
      }
    }, { signal: controller.signal });
    input.addEventListener("blur", () => {
      finishInlineTabRename({ commit: true }).catch((error) => showToast(error.message));
    }, { signal: controller.signal });
    tabsEl.addEventListener("scroll", positionInlineTabRenameInput, { passive: true, signal: controller.signal });
    window.addEventListener("resize", positionInlineTabRenameInput, { signal: controller.signal });
    window.requestAnimationFrame(() => {
      positionInlineTabRenameInput();
      input.focus();
      input.select();
    });
  };

  const createTabButton = (tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    if (inlineTabRenameState?.tabId === tab.id) {
      button.classList.add("renaming");
      window.requestAnimationFrame(positionInlineTabRenameInput);
    }
    button.dataset.tabId = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.setAttribute("tabindex", "-1");
    button.innerHTML = `
      <span class="tab-content">
        <span class="tab-label"></span>
        <span class="tab-close" aria-hidden="true">x</span>
      </span>
    `;
    button.addEventListener("click", (event) => {
      if (event.target.closest(".tab-close")) {
        closeTab(tab.id);
        return;
      }
      setActiveTab(tab.id);
    });
    button.addEventListener("dblclick", (event) => {
      if (event.target.closest(".tab-close")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      beginInlineTabRename(tab.id);
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      setActiveTab(tab.id, { focus: false });
      if (isMobileLayout()) {
        closeContextMenu();
        return;
      }
      showContextMenu(event.clientX, event.clientY, { type: "tab", tabId: tab.id, paneId: tab.activePaneId });
    });
    tab.button = button;
    renderTabLabel(tab);
    tabsEl.appendChild(button);
  };

  const createTab = ({ id = "", label, pane, paneId = "", focus = true, connect = true, customLabel = false, empty = false, activate = true } = {}) => {
    const normalizedID = String(id || `tab-${nextTabSeq}`).trim();
    const numeric = Number(normalizedID.replace(/^tab-/, ""));
    if (Number.isFinite(numeric) && numeric >= nextTabSeq) {
      nextTabSeq = numeric + 1;
    } else if (!id) {
      nextTabSeq += 1;
    }
    const tab = {
      id: normalizedID,
      label: label || `Shell ${numeric || nextTabSeq - 1}`,
      customLabel: Boolean(customLabel || label),
      panes: new Map(),
      activePaneId: null,
      layout: null,
      paneEl: document.createElement("article"),
      layoutHost: document.createElement("div"),
      button: null,
      resizeFrame: 0,
    };
    tab.paneEl.className = "terminal-pane";
    tab.paneEl.dataset.tabId = tab.id;
    tab.layoutHost.className = "terminal-layout";
    tab.paneEl.appendChild(tab.layoutHost);
    terminalArea.appendChild(tab.paneEl);
    tabs.set(tab.id, tab);
    createTabButton(tab);

    if (pane) {
      pane.tabId = tab.id;
      tab.panes.set(pane.id, pane);
      tab.activePaneId = pane.id;
      tab.layout = { type: "leaf", paneId: pane.id };
    } else if (!empty) {
      const session = createPaneSession(tab, activeName, { id: paneId, connect });
      tab.activePaneId = session.id;
      tab.layout = { type: "leaf", paneId: session.id };
    }
    renderTabLayout(tab);
    if (activate) {
      setActiveTab(tab.id, { focus });
    }
    updateEmptyState();
    return tab;
  };

  const setActiveTab = (tabId, { focus = true, remember = true, rememberRecent = true } = {}) => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return;
    }
    return measurePerformanceTask("tab switch visual", () => {
      const previousTabId = activeTabId;
      const previousTab = tabs.get(previousTabId);
      const wasActive = previousTabId === tab.id;
      if (!wasActive) {
        preserveTabTerminalFrames(previousTab);
      }
      activeTabId = tab.id;
      const activePane = tab.panes.get(tab.activePaneId);
      if (activePane) {
        activePane.lastUserInteractionAt = Date.now();
      }
      if (rememberRecent) {
        rememberRecentTab(tab.id, previousTabId);
      }
      const visuallyChangedTabs = new Set([previousTab, tab]);
      for (const item of visuallyChangedTabs) {
        if (!item) {
          continue;
        }
        const isActive = item.id === activeTabId;
        item.paneEl.classList.toggle("active", isActive);
        item.button?.classList.toggle("active", isActive);
        item.button?.setAttribute("aria-selected", isActive ? "true" : "false");
        item.button?.setAttribute("tabindex", isActive ? "0" : "-1");
      }
      for (const pane of tab.panes.values()) {
        pane.activationFitPending = !wasActive || !panePresentationIsCurrent(pane);
        if (!wasActive && Number(pane.measuredFitGeneration || 0) <= 0) {
          pane.connectionMeasurementAttempts = 0;
        }
        if (!wasActive && pane.terminalFrameHeld) {
          pane.resizePresentationHold = true;
          pane.presentationCommitPending = false;
          setPaneRenderReady(pane, false);
        }
        if (!panePresentationIsCurrent(pane)) {
          setPaneRenderReady(pane, false);
        }
      }
      resetSessionUserInput(activePane);
      clearTabNotification(tab);

      const activationInstanceGeneration = activeInstanceGeneration;
      const shouldPostWorkspaceAction = !applyingWorkspaceState && !wasActive;
      const activationIsCurrent = () => (
        !disposed
        && activeInstanceGeneration === activationInstanceGeneration
        && activeTabId === tab.id
        && tabs.get(tab.id) === tab
      );
      tabActivationScheduler.schedule(tab.id, [
        () => measurePerformanceTask("tab activation state", () => {
          if (!activationIsCurrent()) {
            return;
          }
          setActivePane(tab, tab.activePaneId, { focus, resize: false, syncConnection: false });
          if (remember) {
            rememberActiveTab();
          }
          renderAttachmentUploadsForActiveTab();
          scrollTabButtonIntoView(tab.button);
          scheduleTabOverviewRender();
        }),
        () => measurePerformanceTask("tab activation resize", () => {
          if (!activationIsCurrent()) {
            return;
          }
          scheduleVisibleTabResize(tab, { immediate: false });
        }),
        () => measurePerformanceTask("tab activation membership", () => {
          if (!activationIsCurrent()) {
            return;
          }
          syncTerminalConnectionDemands({
            reason: "active_tab_changed",
            interactionSession: null,
          });
          if (shouldPostWorkspaceAction) {
            persistActiveWorkspaceTab(tab.id).catch((error) => showToast(error.message));
          }
        }),
      ]);
    });
  };

  const renderLeaf = (tab, node) => {
    const pane = tab.panes.get(node.paneId);
    if (!pane) {
      const missing = document.createElement("div");
      missing.className = "missing-pane";
      missing.textContent = "窗格不可用";
      return missing;
    }
    pane.shellEl.style.flexBasis = node.size ? `${node.size}%` : "";
    pane.shellEl.style.flexGrow = "1";
    pane.shellEl.style.flexShrink = "1";
    return pane.shellEl;
  };

  const installSplitResizeHandle = (divider, node, childIndex, direction) => {
    divider.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const container = divider.parentElement;
      if (!container) {
        return;
      }
      const first = container.children[childIndex * 2];
      const second = container.children[childIndex * 2 + 2];
      if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const total = direction === "vertical" ? rect.width : rect.height;
      if (total <= 0) {
        return;
      }
      const start = direction === "vertical" ? event.clientX : event.clientY;
      const firstBasis = (first.getBoundingClientRect()[direction === "vertical" ? "width" : "height"] / total) * 100;
      const secondBasis = (second.getBoundingClientRect()[direction === "vertical" ? "width" : "height"] / total) * 100;
      const combined = firstBasis + secondBasis;
      divider.classList.add("is-dragging");
      container.classList.add("is-resizing");
      document.body.classList.add("split-resize-active");
      divider.setPointerCapture?.(event.pointerId);

      const onMove = (moveEvent) => {
        const current = direction === "vertical" ? moveEvent.clientX : moveEvent.clientY;
        const delta = ((current - start) / total) * 100;
        const nextFirst = Math.max(12, Math.min(combined - 12, firstBasis + delta));
        const nextSecond = Math.max(12, combined - nextFirst);
        node.children[childIndex].size = nextFirst;
        node.children[childIndex + 1].size = nextSecond;
        first.style.flexBasis = `${nextFirst}%`;
        second.style.flexBasis = `${nextSecond}%`;
        scheduleTabResize(currentTab(), {
          forceFullRender: true,
          hideUntilRender: true,
        });
      };

      const onUp = () => {
        divider.classList.remove("is-dragging");
        container.classList.remove("is-resizing");
        document.body.classList.remove("split-resize-active");
        divider.removeEventListener("pointermove", onMove);
        divider.removeEventListener("pointerup", onUp);
        divider.removeEventListener("pointercancel", onUp);
        scheduleTabResize(currentTab(), {
          forceFullRender: true,
          hideUntilRender: true,
        }, { immediate: true });
        const tab = currentTab();
        if (tab && !applyingWorkspaceState) {
          postWorkspaceAction("update_layout", {
            tab_id: tab.id,
            layout: tab.layout,
            active_pane_id: tab.activePaneId,
          }).catch((error) => showToast(error.message));
        }
      };

      divider.addEventListener("pointermove", onMove);
      divider.addEventListener("pointerup", onUp);
      divider.addEventListener("pointercancel", onUp);
    });
  };

  const renderSplit = (tab, node) => {
    const wrapper = document.createElement("div");
    wrapper.className = `split-node ${node.direction}`;
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child, index) => {
      const childEl = renderLayoutNode(tab, child);
      childEl.style.flexBasis = child.size ? `${child.size}%` : `${100 / Math.max(1, children.length)}%`;
      childEl.style.flexGrow = "1";
      childEl.style.flexShrink = "1";
      wrapper.appendChild(childEl);
      if (index < children.length - 1) {
        const divider = document.createElement("div");
        divider.className = "split-divider";
        divider.setAttribute("role", "separator");
        divider.setAttribute("aria-orientation", node.direction === "vertical" ? "vertical" : "horizontal");
        installSplitResizeHandle(divider, node, index, node.direction);
        wrapper.appendChild(divider);
      }
    });
    return wrapper;
  };

  const renderLayoutNode = (tab, node) => {
    if (!node || node.type === "leaf") {
      return renderLeaf(tab, node || { paneId: tab.activePaneId });
    }
    return renderSplit(tab, node);
  };

  const renderTabLayout = (tab) => {
    if (!tab) {
      return;
    }
    tab.layoutHost.textContent = "";
    if (tab.layout && tab.panes.size > 0) {
      tab.layoutHost.appendChild(renderLayoutNode(tab, tab.layout));
    }
    setActivePane(tab, tab.activePaneId, { focus: false, syncConnection: false });
    window.requestAnimationFrame(() => resizeTab(tab));
  };

  const applyWorkspaceState = (state, { focus = false, instanceName = activeName, generation = activeInstanceGeneration, preferStateActiveTab = false } = {}) => measurePerformanceTask("workspace apply", () => {
    const expectedName = String(instanceName || "").trim();
    ensureResponseSelector(state, expectedName);
    const targetName = responseSelector(state) || expectedName;
    if (!targetName || !isCurrentInstanceRequest(targetName, generation)) {
      return false;
    }
    const agentNotice = String(state?.agent_notice || "").trim();
    if (agentNotice) {
      showToast(agentNotice);
    }
    const restartTab = readRestartTabForName(targetName);
    const requestedTab = (new URLSearchParams(window.location.search).get("tab") || "").trim();
    const cacheV2IdentityChanged = setActiveWorkspaceCacheV2Identity(workspaceCacheV2IdentityFromState(state, targetName));
    applyingWorkspaceState = true;
    try {
      if (cacheV2IdentityChanged) {
        for (const tab of [...tabs.values()]) {
          closeTab(tab.id, { remember: false });
        }
      }
      const nextTabIDs = new Set((state?.tabs || []).map((tab) => tab.id));
      for (const tab of [...tabs.values()]) {
        if (!nextTabIDs.has(tab.id)) {
          for (const pane of tab.panes.values()) {
            if (pane.name === targetName) {
              destroySessionHistoryCache(pane);
            }
          }
          closeTab(tab.id, { remember: false });
        }
      }

      tabsEl.textContent = "";
      for (const tabState of state?.tabs || []) {
        let tab = tabs.get(tabState.id);
        if (!tab) {
          tab = createTab({
            id: tabState.id,
            label: tabState.label,
            customLabel: tabState.custom_label,
            focus: false,
            connect: false,
            empty: true,
            activate: false,
          });
        }
        tab.label = tabState.label || tab.label;
        tab.customLabel = Boolean(tabState.custom_label);
        tab.activePaneId = tabState.active_pane_id;
        tab.layout = tabState.layout || null;
        tab.button?.remove();
        createTabButton(tab);

        const wantedPaneIDs = new Set((tabState.panes || []).map((pane) => pane.id));
        for (const pane of [...tab.panes.values()]) {
          if (!wantedPaneIDs.has(pane.id)) {
            if (pane.name === targetName) {
              destroySessionHistoryCache(pane);
            }
            disposePane(pane);
            tab.panes.delete(pane.id);
          }
        }
        for (const paneState of tabState.panes || []) {
          if (!tab.panes.has(paneState.id)) {
            createPaneSession(tab, targetName, { id: paneState.id, connect: true, cols: paneState.cols, rows: paneState.rows });
          }
          const pane = tab.panes.get(paneState.id);
          if (pane?.workspaceExitPending) {
            pane.workspaceExitPending = false;
            pane.exitExpected = false;
            pane.pendingConnect = true;
          } else if (pane && !pane.socket) {
            pane.pendingConnect = true;
          }
          updatePaneActivity(paneState);
        }
        renderTabLabel(tab);
        renderTabLayout(tab);
      }

      const stateRecentTabIds = Array.isArray(state?.recent_tab_ids) ? state.recent_tab_ids : null;
      if (stateRecentTabIds) {
        applyRecentTabIds(stateRecentTabIds, { name: targetName });
      } else {
        const storedRecentTabIds = loadStoredRecentTabIds(targetName);
        applyRecentTabIds(storedRecentTabIds.length > 0 ? storedRecentTabIds : recentTabIds, { name: targetName });
      }
      const savedTab = targetName ? window.localStorage.getItem(lastTabStorageKey(targetName)) : "";
      const stateActiveTab = state?.active_tab_id || "";
      const nextActiveTab = preferStateActiveTab
        ? tabs.get(restartTab) || tabs.get(stateActiveTab) || tabs.get(requestedTab) || tabs.get(savedTab) || tabs.values().next().value || null
        : tabs.get(restartTab) || tabs.get(requestedTab) || tabs.get(savedTab) || tabs.get(stateActiveTab) || tabs.values().next().value || null;
      if (nextActiveTab) {
        setActiveTab(nextActiveTab.id, { focus, rememberRecent: !stateRecentTabIds });
        if (stateRecentTabIds && recentTabIds[0] !== nextActiveTab.id) {
          applyRecentTabIds([nextActiveTab.id, ...recentTabIds], { name: targetName });
        }
      } else {
        activeTabId = null;
        tabActivationScheduler.cancel();
      }
      updateEmptyState();
      scheduleTabOverviewRender();
      const activePane = nextActiveTab?.panes.get(nextActiveTab.activePaneId) || null;
      if (activePane) {
        prepareSessionHistoryCache(activePane).catch((error) => {
          console.warn("[terminal-cache-v2] active manifest preload failed", {
            name: activePane.name,
            pane: activePane.id,
            error: error?.message || String(error),
          });
        });
      }
      window.requestAnimationFrame(() => {
        resizeActiveTabForCurrentDevice();
        connectPendingSessionsForTab(nextActiveTab, { allowHidden: true });
      });
      // The workspace list is authoritative only after it has been applied.
      // Defer orphan preview cleanup until this point so a cold restore cannot
      // delete previews for panes that are still being materialized.
      scheduleTerminalCacheV2OrphanPreviewCleanup();
      return true;
    } finally {
      clearRestartTabForReload();
      applyingWorkspaceState = false;
      if (terminalUnifiedRefreshPending && !disposed && !isClientInstanceName(activeName)) {
        terminalUnifiedRefreshPending = false;
        refreshTerminalUnifiedMembership({ reason: "workspace_restored" });
      }
    }
  });

  const clearWorkspaceRefreshRetry = () => {
    if (workspaceRefreshRetryTimer) {
      window.clearTimeout(workspaceRefreshRetryTimer);
      workspaceRefreshRetryTimer = 0;
    }
    workspaceRefreshRetryAttempts = 0;
    workspaceRefreshRetryContext = null;
  };

  const scheduleWorkspaceRefreshRetry = ({
    focus = false,
    instanceName = activeName,
    generation = activeInstanceGeneration,
    immediate = false,
  } = {}) => {
    const requestName = String(instanceName || "").trim();
    if (disposed || !isCurrentInstanceRequest(requestName, generation)) {
      return;
    }
    if (
      workspaceRefreshRetryContext?.instanceName === requestName
      && workspaceRefreshRetryContext?.generation === generation
    ) {
      workspaceRefreshRetryContext.focus = Boolean(focus || workspaceRefreshRetryContext.focus);
    } else {
      workspaceRefreshRetryContext = {
        focus: Boolean(focus),
        instanceName: requestName,
        generation,
      };
    }
    if (workspaceRefreshRetryTimer || workspaceRefreshRetryInFlight || navigator.onLine === false) {
      return;
    }
    const attempt = Math.max(0, Number(workspaceRefreshRetryAttempts || 0));
    const baseDelay = immediate ? 0 : Math.min(workspaceRefreshRetryMaxDelayMs, workspaceRefreshRetryBaseDelayMs * (2 ** Math.min(attempt, 8)));
    const jitter = baseDelay * workspaceRefreshRetryJitterRatio * ((Math.random() * 2) - 1);
    const delay = Math.max(0, Math.round(baseDelay + jitter));
    workspaceRefreshRetryTimer = window.setTimeout(async () => {
      workspaceRefreshRetryTimer = 0;
      const context = workspaceRefreshRetryContext;
      if (!context || disposed || !isCurrentInstanceRequest(context.instanceName, context.generation)) {
        return;
      }
      workspaceRefreshRetryInFlight = true;
      let retryError = null;
      try {
        await refreshWorkspace(context);
        console.info("[workspace-recovery] refresh succeeded", {
          name: context.instanceName,
          attempts: workspaceRefreshRetryAttempts,
        });
      } catch (error) {
        retryError = error;
        workspaceRefreshRetryAttempts = Math.min(20, workspaceRefreshRetryAttempts + 1);
        console.warn("[workspace-recovery] refresh failed", {
          name: context.instanceName,
          attempt: workspaceRefreshRetryAttempts,
          error: error?.message || String(error),
        });
      } finally {
        workspaceRefreshRetryInFlight = false;
      }
      if (retryError && workspaceRefreshRetryContext === context) {
        scheduleWorkspaceRefreshRetry(context);
      }
    }, delay);
  };

  const refreshWorkspaceWithRetry = async (options = {}) => {
    try {
      return await refreshWorkspace(options);
    } catch (error) {
      scheduleWorkspaceRefreshRetry(options);
      throw error;
    }
  };

  const requestWorkspaceRefresh = async ({ instanceName = activeName, generation = activeInstanceGeneration } = {}) => {
    const requestName = String(instanceName || "").trim();
    const recoveryMetrics = {
      selector: requestName,
      generation,
      startedAt: terminalCacheV2MetricNow(),
      readyAt: 0,
    };
    if (isCurrentInstanceRequest(requestName, generation)) {
      latestWorkspaceRecoveryMetrics = recoveryMetrics;
    }
    markWebShellStartupMetric("workspaceRequestStartedAt");
    appendStartupTrace("workspace 请求开始", `selector=${requestName}`, { dedupeKey: `workspace-request:${requestName}` });
    const state = await fetchWorkspaceState(requestName);
    if (!isCurrentInstanceRequest(requestName, generation)) {
      return { state, requestName, generation };
    }
    recoveryMetrics.readyAt = terminalCacheV2MetricNow();
    markWebShellStartupMetric("workspaceReadyAt");
    appendStartupTrace("workspace 响应完成", `selector=${requestName}`, { dedupeKey: `workspace-ready:${requestName}` });
    return { state, requestName, generation };
  };

  const applyWorkspaceRefresh = ({ state, requestName, generation }, { focus = false } = {}) => {
    if (!isCurrentInstanceRequest(requestName, generation)) {
      return state;
    }
    ensureResponseSelector(state, requestName);
    observeServerRevision(state);
    applyWorkspaceState(state, { focus, instanceName: requestName, generation });
    markWebShellStartupMetric("workspaceAppliedAt");
    appendStartupTrace("workspace 应用完成", `tabs=${tabs.size}`, { dedupeKey: "workspace-applied" });
    clearWorkspaceRefreshRetry();
    return state;
  };

  const refreshWorkspace = async ({ focus = false, instanceName = activeName, generation = activeInstanceGeneration } = {}) => measurePerformanceTask("workspace refresh", async () => {
    const result = await requestWorkspaceRefresh({ instanceName, generation });
    return applyWorkspaceRefresh(result, { focus });
  });

  const splitLayout = (node, targetPaneId, direction, newPaneId) => {
    if (!node) {
      return false;
    }
    if (node.type === "leaf" && node.paneId === targetPaneId) {
      const outerSize = node.size;
      node.type = "split";
      node.direction = direction;
      node.children = [
        { type: "leaf", paneId: targetPaneId, size: 50 },
        { type: "leaf", paneId: newPaneId, size: 50 },
      ];
      delete node.paneId;
      if (outerSize) {
        node.size = outerSize;
      } else {
        delete node.size;
      }
      return true;
    }
    if (node.type === "split") {
      return node.children.some((child) => splitLayout(child, targetPaneId, direction, newPaneId));
    }
    return false;
  };

  const removePaneFromLayout = (node, paneId) => {
    if (!node) {
      return null;
    }
    if (node.type === "leaf") {
      return node.paneId === paneId ? null : node;
    }
    if (node.type !== "split") {
      return node;
    }
    const children = node.children.map((child) => removePaneFromLayout(child, paneId)).filter(Boolean);
    if (children.length === 0) {
      return null;
    }
    if (children.length === 1) {
      return children[0];
    }
    const share = 100 / children.length;
    for (const child of children) {
      if (!child.size) {
        child.size = share;
      }
    }
    node.children = children;
    return node;
  };

  const collectPaneIds = (node, result = []) => {
    if (!node) {
      return result;
    }
    if (node.type === "leaf") {
      result.push(node.paneId);
      return result;
    }
    for (const child of node.children || []) {
      collectPaneIds(child, result);
    }
    return result;
  };

  const splitPane = (tabId, paneId, direction) => {
    const tab = tabs.get(tabId);
    if (!tab || !tab.panes.has(paneId)) {
      return;
    }
    if (!applyingWorkspaceState) {
      postWorkspaceAction("split_pane", { tab_id: tabId, pane_id: paneId, direction }).catch((error) => showToast(error.message));
      return;
    }
    const session = createPaneSession(tab, activeName);
    if (!splitLayout(tab.layout, paneId, direction, session.id)) {
      tab.layout = { type: "split", direction, children: [{ type: "leaf", paneId }, { type: "leaf", paneId: session.id }] };
    }
    tab.activePaneId = session.id;
    renderTabLayout(tab);
    setActiveTab(tab.id);
  };

  const paneRectSnapshot = (tab) =>
    Array.from(tab?.panes?.values() || [])
      .map((pane) => {
        const rect = pane.shellEl?.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return null;
        }
        return {
          id: pane.id,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      })
      .filter(Boolean);

  const overlapLength = (startA, endA, startB, endB) => Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));

  const comparePaneMetric = (left, right) => {
    if (!left) {
      return 1;
    }
    if (!right) {
      return -1;
    }
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    if (left.primary !== right.primary) {
      return right.primary - left.primary;
    }
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }
    if (left.secondary !== right.secondary) {
      return left.secondary - right.secondary;
    }
    return left.index - right.index;
  };

  const buildHorizontalPaneMetric = (currentRect, candidateRect, left, index) => {
    const overlap = overlapLength(currentRect.top, currentRect.bottom, candidateRect.top, candidateRect.bottom);
    if (overlap <= 0) {
      return null;
    }
    const distance = left ? currentRect.left - candidateRect.right : candidateRect.left - currentRect.right;
    if (distance < -6) {
      return null;
    }
    const sameEdge = Math.abs(candidateRect.top - currentRect.top) <= 6;
    const containsCurrent = candidateRect.top <= currentRect.top + 6 && candidateRect.bottom >= currentRect.bottom - 6;
    return {
      rank: sameEdge ? 0 : containsCurrent ? 1 : 2,
      primary: overlap,
      distance: Math.max(0, distance),
      secondary: Math.abs(candidateRect.top - currentRect.top),
      index,
    };
  };

  const buildVerticalPaneMetric = (currentRect, candidateRect, up, index) => {
    const overlap = overlapLength(currentRect.left, currentRect.right, candidateRect.left, candidateRect.right);
    if (overlap <= 0) {
      return null;
    }
    const distance = up ? currentRect.top - candidateRect.bottom : candidateRect.top - currentRect.bottom;
    if (distance < -6) {
      return null;
    }
    const sameEdge = Math.abs(candidateRect.left - currentRect.left) <= 6;
    const containsCurrent = candidateRect.left <= currentRect.left + 6 && candidateRect.right >= currentRect.right - 6;
    return {
      rank: sameEdge ? 0 : containsCurrent ? 1 : 2,
      primary: overlap,
      distance: Math.max(0, distance),
      secondary: Math.abs(candidateRect.left - currentRect.left),
      index,
    };
  };

  const selectPaneInDirection = (direction) => {
    const tab = currentTab();
    const activePane = tab?.panes.get(tab.activePaneId);
    if (!tab || !activePane) {
      return;
    }
    const currentRect = paneRectSnapshot(tab).find((rect) => rect.id === activePane.id);
    if (!currentRect) {
      return;
    }
    let bestRect = null;
    let bestMetric = null;
    paneRectSnapshot(tab).forEach((candidateRect, index) => {
      if (candidateRect.id === activePane.id) {
        return;
      }
      let metric = null;
      if (direction === "left") {
        metric = buildHorizontalPaneMetric(currentRect, candidateRect, true, index);
      } else if (direction === "right") {
        metric = buildHorizontalPaneMetric(currentRect, candidateRect, false, index);
      } else if (direction === "up") {
        metric = buildVerticalPaneMetric(currentRect, candidateRect, true, index);
      } else if (direction === "down") {
        metric = buildVerticalPaneMetric(currentRect, candidateRect, false, index);
      }
      if (metric && comparePaneMetric(metric, bestMetric) < 0) {
        bestMetric = metric;
        bestRect = candidateRect;
      }
    });
    if (bestRect?.id) {
      setActivePane(tab, bestRect.id);
    }
  };

  const disposePane = (pane) => {
    if (!pane || pane.closed) {
      return;
    }
    flushSessionHistoryCacheWrites(pane);
    // Mark the logical pane closed before closing its Unified stream. Logical
    // close dispatch is synchronous and must never schedule a retry for a pane
    // that is being intentionally destroyed.
    pane.closed = true;
    pane.replayController?.reset();
    pane.queueReplayControllerActive = false;
    pane.queueReplayControllerLegacy = false;
    detachTerminalUnifiedSession(pane, "session_closed");
    terminalConnectionScheduler?.unregister(pane, "session_closed");
    pane.pendingInput = [];
    pane.pendingInputSize = 0;
    clearPendingInputExpiry(pane);
    pane.inputBuffer = "";
    pane.inputBufferSize = 0;
    clearInputFlushTimer(pane);
    pane.inputQueue = [];
    pane.inputQueueSize = 0;
    clearInputPumpTimer(pane);
    pane.inputPumpActive = false;
    if (pane.cursorBlinkHoldTimer) {
      window.clearTimeout(pane.cursorBlinkHoldTimer);
      pane.cursorBlinkHoldTimer = 0;
    }
    if (pane.connectionPriorityTimer) {
      window.clearTimeout(pane.connectionPriorityTimer);
      pane.connectionPriorityTimer = 0;
    }
    clearReconnectTimer(pane);
    clearSessionConnectionTimers(pane);
    clearTerminalUnifiedPaneRetry(pane, { resetAttempts: true });
    if (pane.connectionMeasurementFrame) {
      window.cancelAnimationFrame(pane.connectionMeasurementFrame);
      pane.connectionMeasurementFrame = 0;
    }
    cancelScheduledPaneResize(pane);
    discardSessionOutputBuffers(pane);
    clearPaneFullRenderValidation(pane);
    clearPanePresentationRetry(pane);
    clearSessionHistoryCacheWriteSchedule(pane);
    if (pane.cacheV2PreviewCaptureTimer) {
      window.clearTimeout(pane.cacheV2PreviewCaptureTimer);
      pane.cacheV2PreviewCaptureTimer = 0;
    }
    if (pane.cacheV2PreviewCaptureIdle && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(pane.cacheV2PreviewCaptureIdle);
      pane.cacheV2PreviewCaptureIdle = 0;
    }
    pane.cacheV2PreviewCaptureSeq = Number(pane.cacheV2PreviewCaptureSeq || 0) + 1;
    pane.cacheV2PreviewCaptureAllowRecentOutput = false;
    pane.cacheV2PreviewCapturePending = false;
    pane.cacheV2PreviewCaptureRunning = false;
    pane.cacheV2WarmReplaySeq = Number(pane.cacheV2WarmReplaySeq || 0) + 1;
    pane.cacheV2WarmReplayActive = false;
    pane.cacheV2WarmReplayReady = false;
    pane.cacheV2WarmReplayPromise = null;
    pane.cacheV2WarmReplaySnapshot = null;
    pane.cacheV2ServerSnapshotPending = false;
    pane.cacheV2ServerSnapshotStartCursor = 0n;
    pane.cacheV2ReplayActive = false;
    pane.cacheV2NetworkQueue = [];
    pane.cacheV2NetworkQueueBytes = 0;
    hideSessionTerminalPreview(pane);
    releaseSessionTerminalFrame(pane);
    clearSessionCacheV2PreparedPreview(pane);
    clearSessionCacheV2OverviewPreview(pane);
    runSessionCleanups(pane);
    clearTerminalCanvasPixels(pane);
    try {
      pane.term.dispose();
    } catch (error) {
    }
    pane.shellEl.remove();
  };

  const closePane = (tabId, paneId) => {
    const tab = tabs.get(tabId);
    const pane = tab?.panes.get(paneId);
    if (!tab || !pane) {
      return;
    }
    if (!applyingWorkspaceState) {
      refreshAndConfirmClose([pane], "关闭此窗格并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_pane", { tab_id: tabId, pane_id: paneId })
            .then(() => destroySessionHistoryCache(pane))
            .catch((error) => showToast(error.message));
        }
      });
      return;
    }
    disposePane(pane);
    tab.panes.delete(paneId);
    tab.layout = removePaneFromLayout(tab.layout, paneId);
    const paneIds = collectPaneIds(tab.layout);
    tab.activePaneId = paneIds.includes(tab.activePaneId) ? tab.activePaneId : paneIds[0] || null;
    if (tab.panes.size === 0 || !tab.layout) {
      closeTab(tab.id, { allowLast: true, remember: false });
      return;
    }
    renderTabLayout(tab);
    setActiveTab(tab.id);
  };

  const closeTab = (tabId, { allowLast = true, remember = true } = {}) => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return;
    }
    if (!allowLast && tabs.size <= 1) {
      showToast("至少需要保留一个标签。");
      return;
    }
    if (inlineTabRenameState?.tabId === tab.id) {
      finishInlineTabRename({ commit: false });
    }
    if (!applyingWorkspaceState) {
      const panesToClose = targetPanesFromTab(tab);
      refreshAndConfirmClose(panesToClose, "关闭此标签并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_tab", { tab_id: tabId })
            .then(() => Promise.allSettled(panesToClose.map((pane) => destroySessionHistoryCache(pane))))
            .catch((error) => showToast(error.message));
        }
      });
      return;
    }
    for (const upload of [...attachmentUploads.values()]) {
      if (upload.tabId === tab.id) {
        removeAttachmentUpload(upload.id);
      }
    }
    let nextActiveTab = null;
    if (activeTabId === tab.id) {
      const orderedTabs = getOrderedTabs();
      const currentIndex = orderedTabs.findIndex((item) => item.id === tab.id);
      if (currentIndex >= 0) {
        nextActiveTab = orderedTabs[currentIndex + 1] || orderedTabs[currentIndex - 1] || null;
      }
    }
    for (const pane of tab.panes.values()) {
      disposePane(pane);
    }
    if (tab.resizeFrame) {
      window.cancelAnimationFrame(tab.resizeFrame);
      tab.resizeFrame = 0;
    }
    tab.button?.remove();
    tab.paneEl.remove();
    tabs.delete(tab.id);
    if (activeTabId === tab.id) {
      activeTabId = null;
      tabActivationScheduler.cancel();
      if (nextActiveTab && tabs.has(nextActiveTab.id)) {
        setActiveTab(nextActiveTab.id, { remember });
      }
    }
    updateEmptyState();
    scheduleTabOverviewRender();
    if (!applyingWorkspaceState) {
      syncTerminalConnectionDemands({ reason: "tab_closed" });
    }
  };

  const closeOtherTabs = (tabId) => {
    if (!applyingWorkspaceState) {
      const panes = Array.from(tabs.values())
        .filter((tab) => tab.id !== tabId)
        .flatMap((tab) => targetPanesFromTab(tab));
      refreshAndConfirmClose(panes, "关闭其他标签并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_other_tabs", { tab_id: tabId })
            .then(() => Promise.allSettled(panes.map((pane) => destroySessionHistoryCache(pane))))
            .catch((error) => showToast(error.message));
        }
      });
      return;
    }
    for (const tab of [...tabs.values()]) {
      if (tab.id !== tabId) {
        closeTab(tab.id);
      }
    }
    setActiveTab(tabId);
  };

  const renameTab = async (tabId) => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return;
    }
    const nextLabel = await promptDialog("Rename tab", tab.label);
    if (nextLabel === null) {
      return;
    }
    const normalized = nextLabel.trim();
    if (!normalized) {
      return;
    }
    await commitTabRename(tabId, normalized, { force: true });
  };

  const movePaneToNewTab = (tabId, paneId) => {
    const sourceTab = tabs.get(tabId);
    const pane = sourceTab?.panes.get(paneId);
    if (!sourceTab || !pane || sourceTab.panes.size <= 1) {
      return;
    }
    if (!applyingWorkspaceState) {
      postWorkspaceAction("move_pane_to_tab", { tab_id: tabId, pane_id: paneId }).catch((error) => showToast(error.message));
      return;
    }
    sourceTab.panes.delete(paneId);
    sourceTab.layout = removePaneFromLayout(sourceTab.layout, paneId);
    const remaining = collectPaneIds(sourceTab.layout);
    sourceTab.activePaneId = remaining[0] || null;
    pane.shellEl.remove();
    const label = `${sourceTab.label} ${tabs.size + 1}`;
    const nextTab = createTab({ label, pane, focus: true });
    renderTabLayout(sourceTab);
    setActiveTab(nextTab.id);
  };

  const moveTab = (tabId, position) => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return;
    }
    if (!applyingWorkspaceState) {
      postWorkspaceAction("move_tab", { tab_id: tabId, position }).catch((error) => showToast(error.message));
      return;
    }
    const ordered = getOrderedTabs();
    const index = ordered.findIndex((item) => item.id === tabId);
    if (index < 0) {
      return;
    }
    let target = index;
    if (position === "first") {
      target = 0;
    } else if (position === "left") {
      target = Math.max(0, index - 1);
    } else if (position === "right") {
      target = Math.min(ordered.length - 1, index + 1);
    } else if (position === "last") {
      target = ordered.length - 1;
    }
    if (target === index) {
      return;
    }
    const reference = tabsEl.children[target];
    tab.button?.remove();
    if (position === "right" || position === "last") {
      tabsEl.insertBefore(tab.button, reference?.nextSibling || null);
    } else {
      tabsEl.insertBefore(tab.button, reference || tabsEl.firstChild);
    }
    setActiveTab(tabId, { focus: false });
    scheduleTabOverviewRender();
  };

  const closeContextMenu = () => {
    if (contextMenu) {
      contextMenu.hidden = true;
    }
    contextTarget = null;
  };

  const updateContextMenuGroups = () => {
    let hasVisibleGroup = false;
    for (const group of contextMenu?.querySelectorAll(".context-menu-group") || []) {
      const hasVisibleItem = Array.from(group.querySelectorAll(".context-menu-btn")).some((item) => !item.hidden);
      group.hidden = !hasVisibleItem;
      group.classList.toggle("with-divider", hasVisibleGroup && hasVisibleItem);
      hasVisibleGroup = hasVisibleGroup || hasVisibleItem;
    }
  };

  const showContextMenu = (x, y, target) => {
    if (!contextMenu) {
      return;
    }
    contextTarget = target;
    contextMenu.hidden = false;
    contextMenu.dataset.type = target.type;
    for (const item of contextMenu.querySelectorAll(".context-menu-btn")) {
      const action = item.dataset.action;
      item.hidden = (action === "capture-long-screenshot" && !isTouchShortcutLayout())
        || (contextPaneActions.has(action) && !target.paneId)
        || (contextTabActions.has(action) && !target.tabId)
        || (contextLinkActions.has(action) && !target.link);
    }
    updateContextMenuGroups();
    const rect = contextMenu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    contextMenu.style.left = `${Math.max(8, left)}px`;
    contextMenu.style.top = `${Math.max(8, top)}px`;
  };

  const runContextAction = (action) => {
    const target = contextTarget;
    closeContextMenu();
    if (!target) {
      return;
    }
    switch (action) {
      case "copy":
        copyFromSession(tabs.get(target.tabId)?.panes.get(target.paneId)).catch((error) => showToast(error.message));
        break;
      case "paste": {
        const session = tabs.get(target.tabId)?.panes.get(target.paneId);
        if (!isMobileLayout()) {
          session?.term?.focus?.();
        }
        pasteIntoSession(session)
          .finally(() => {
            if (!isMobileLayout() && !session?.closed) {
              session?.term?.focus?.();
            }
          })
          .catch((error) => showToast(error.message));
        break;
      }
      case "select-all":
        selectAllSessionBuffer(tabs.get(target.tabId)?.panes.get(target.paneId));
        break;
      case "search":
        openSearch();
        break;
      case "capture-long-screenshot":
        runLongScreenshot(tabs.get(target.tabId)?.panes.get(target.paneId));
        break;
      case "open-link":
        openURL(target.link);
        break;
      case "copy-link":
        copyText(target.link).then((ok) => showToast(ok ? "链接已复制。" : "复制失败。"));
        break;
      case "rename-tab":
        renameTab(target.tabId).catch((error) => showToast(error.message));
        break;
      case "move-tab-first":
        moveTab(target.tabId, "first");
        break;
      case "move-tab-left":
        moveTab(target.tabId, "left");
        break;
      case "move-tab-right":
        moveTab(target.tabId, "right");
        break;
      case "move-tab-last":
        moveTab(target.tabId, "last");
        break;
      case "close-other-tabs":
        closeOtherTabs(target.tabId);
        break;
      case "split-vertical":
        splitPane(target.tabId, target.paneId, "vertical");
        break;
      case "split-horizontal":
        splitPane(target.tabId, target.paneId, "horizontal");
        break;
      case "move-pane-new-tab":
        movePaneToNewTab(target.tabId, target.paneId);
        break;
      case "close-pane":
        closePane(target.tabId, target.paneId);
        break;
      case "close-tab":
        closeTab(target.tabId);
        break;
      case "theme":
        openThemeSettings();
        break;
    }
  };

  const isInteractiveShortcutTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target.closest(".terminal-host")) {
      return false;
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return true;
    }
    if (target.isContentEditable && !target.classList.contains("terminal-host")) {
      return true;
    }
    const interactive = target.closest("input, textarea, select, [contenteditable='true']");
    return Boolean(interactive && !interactive.classList.contains("terminal-host"));
  };

  const isFullscreenActive = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);

  const toggleFullscreen = async () => {
    if (isFullscreenActive()) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (typeof exitFullscreen === "function") {
        await exitFullscreen.call(document);
      }
      return;
    }
    const requestFullscreen =
      document.documentElement.requestFullscreen ||
      document.documentElement.webkitRequestFullscreen ||
      document.documentElement.msRequestFullscreen;
    if (typeof requestFullscreen === "function") {
      await requestFullscreen.call(document.documentElement);
    }
  };

  const runShortcutAction = async (action) => {
    const tab = currentTab();
    switch (action) {
      case "fullscreen":
        await toggleFullscreen();
        return;
      case "new_tab":
        await createUserTab();
        return;
      case "close_tab":
        if (tab) {
          closeTab(tab.id);
        }
        return;
      case "close_other_tabs":
        if (tab) {
          closeOtherTabs(tab.id);
        }
        return;
      case "rename_tab":
        if (tab) {
          await renameTab(tab.id);
        }
        return;
      case "next_tab":
        setActiveTabByOffset(1);
        return;
      case "previous_tab":
        setActiveTabByOffset(-1);
        return;
      case "last_tab":
        setActiveTabByIndex(getOrderedTabs().length - 1);
        return;
      case "move_tab_to_first":
        if (tab) {
          moveTab(tab.id, "first");
        }
        return;
      case "move_tab_left":
        if (tab) {
          moveTab(tab.id, "left");
        }
        return;
      case "move_tab_right":
        if (tab) {
          moveTab(tab.id, "right");
        }
        return;
      case "move_tab_to_last":
        if (tab) {
          moveTab(tab.id, "last");
        }
        return;
      case "vertical_split":
        if (tab?.activePaneId) {
          splitPane(tab.id, tab.activePaneId, "vertical");
        }
        return;
      case "horizontal_split":
        if (tab?.activePaneId) {
          splitPane(tab.id, tab.activePaneId, "horizontal");
        }
        return;
      case "select_up":
        selectPaneInDirection("up");
        return;
      case "select_down":
        selectPaneInDirection("down");
        return;
      case "select_left":
        selectPaneInDirection("left");
        return;
      case "select_right":
        selectPaneInDirection("right");
        return;
      case "close_pane":
        if (tab?.activePaneId) {
          closePane(tab.id, tab.activePaneId);
        }
        return;
      case "theme":
        openThemeSettings();
        return;
      case "switch_container":
        await openInstanceSwitcher();
        return;
      case "copy_terminal":
        await copyFromSession();
        return;
      case "paste_terminal":
        focusTerminalForNativePasteShortcut();
        return;
      case "search_terminal":
        openSearch();
        return;
      case "select_all_terminal":
        selectAllSessionBuffer();
        return;
      case "attachment_clipboard":
        await importAttachmentFromClipboard();
        return;
      case "attachment_file":
        selectAttachmentFiles();
        return;
      default: {
        const match = action.match(/^tab_(\d+)$/);
        if (match) {
          setActiveTabByIndex(Number(match[1]) - 1);
        }
      }
    }
  };

  const handleGlobalShortcutKeydown = (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    const shortcut = getShortcutKeyFromEvent(event);
    if ((event.isComposing || event.key === "Process" || Number(event.keyCode || 0) === 229) && !shortcutActionMap.has(shortcut)) {
      return;
    }
    if (
      (themePickerBackdrop && !themePickerBackdrop.hidden) ||
      (settingsBackdrop && !settingsBackdrop.hidden) ||
      (deviceBackdrop && !deviceBackdrop.hidden) ||
      (instanceSwitcherPanel && !instanceSwitcherPanel.hidden) ||
      (attachmentBackdrop && !attachmentBackdrop.hidden) ||
      isTabOverviewOpen()
    ) {
      return;
    }
    if (isInteractiveShortcutTarget(event.target)) {
      return;
    }
    if (isShiftInsertPasteShortcutEvent(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      focusTerminalForNativePasteShortcut();
      closeContextMenu();
      pasteIntoSession().catch((error) => showToast(error.message));
      return;
    }
    if (isNativePasteShortcutEvent(event)) {
      focusTerminalForNativePasteShortcut();
      closeContextMenu();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    if (runTerminalFontSizeShortcut(event)) {
      closeContextMenu();
      return;
    }
    if (!event.ctrlKey && !event.altKey && !event.metaKey && (event.key === "PageUp" || event.key === "PageDown")) {
      const session = activeSession();
      if (session?.term) {
        event.preventDefault();
        session.term.scrollPages(event.key === "PageUp" ? -1 : 1);
        return;
      }
    }
    const action = shortcutActionMap.get(shortcut);
    if (!action) {
      return;
    }
    if (action === "paste_terminal") {
      focusTerminalForNativePasteShortcut();
      closeContextMenu();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    closeContextMenu();
    runShortcutAction(action).catch((error) => showToast(error.message || "快捷键执行失败。"));
  };

  const renderInstanceSwitcher = () => {
    if (!instanceSwitcherList) {
      return;
    }
    instanceSwitcherList.textContent = "";
    for (const item of currentInstances) {
      const selector = instanceSelector(item);
      if (!selector) {
        continue;
      }
      const option = document.createElement("button");
      option.type = "button";
      option.className = "instance-switcher-item";
      option.dataset.name = selector;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", selector === activeName ? "true" : "false");
      if (!isRunningInstance(item)) {
        option.disabled = true;
      }
      const statusDot = document.createElement("span");
      statusDot.className = "instance-switcher-item-status-dot";
      statusDot.dataset.status = item.status || "unknown";
      const body = document.createElement("span");
      body.className = "instance-switcher-item-body";
      const name = document.createElement("span");
      name.className = "instance-switcher-item-name";
      name.textContent = instanceDisplayName(item);
      const meta = document.createElement("span");
      meta.className = "instance-switcher-item-meta";
      meta.textContent = item.status || "unknown";
      body.append(name, meta);
      option.append(statusDot, body);
      instanceSwitcherList.appendChild(option);
    }
  };

  const openInstanceSwitcher = async () => {
    if (isEmbedMode || !instanceSwitcher || !instanceSwitcherPanel || !instanceSwitcherButton) {
      return;
    }
    closeContextMenu();
    closeDevicePanel();
    instanceSwitcher.classList.add("is-open");
    instanceSwitcherPanel.hidden = false;
    instanceSwitcherButton.setAttribute("aria-expanded", "true");
    setFeedback("");
    try {
      await loadInstances();
      renderInstanceSwitcher();
    } catch (error) {
      setFeedback(error.message);
    }
  };

  const closeInstanceSwitcher = () => {
    instanceSwitcher?.classList.remove("is-open");
    if (instanceSwitcherPanel) {
      instanceSwitcherPanel.hidden = true;
    }
    instanceSwitcherButton?.setAttribute("aria-expanded", "false");
  };

  const isAttachmentDialogOpen = () => attachmentDialogOpen && attachmentBackdrop && !attachmentBackdrop.hidden;
  const isAttachmentBrowserOpen = () => attachmentBrowserOpen && attachmentBrowserBackdrop && !attachmentBrowserBackdrop.hidden;

  const openAttachmentDialog = () => {
    if (!attachmentBackdrop) {
      return;
    }
    closeContextMenu();
    closeInstanceSwitcher();
    closeDevicePanel();
    attachmentDialogOpen = true;
    attachmentBackdrop.hidden = false;
    window.setTimeout(() => attachmentClipboard?.focus(), 0);
  };

  const closeAttachmentDialog = ({ focusTerminal = true } = {}) => {
    attachmentDialogOpen = false;
    if (attachmentBackdrop) {
      attachmentBackdrop.hidden = true;
    }
    if (focusTerminal) {
      window.setTimeout(() => activeSession()?.term?.focus(), 0);
    }
  };

  const setAttachmentBrowserFeedback = (message, tone = "info") => {
    if (!attachmentBrowserFeedback) {
      return;
    }
    const text = String(message || "").trim();
    attachmentBrowserFeedback.hidden = !text;
    attachmentBrowserFeedback.textContent = text;
    attachmentBrowserFeedback.dataset.tone = tone;
  };

  const setAttachmentBrowserBusy = (busy) => {
    if (attachmentBrowserDownload) {
      attachmentBrowserDownload.disabled = busy || attachmentBrowserSelectedPaths.size === 0;
    }
    attachmentBrowserCancel?.toggleAttribute("disabled", busy);
  };

  const attachmentBrowserDisplayName = (path) => {
    const parts = String(path || "").split("/").filter(Boolean);
    return parts.at(-1) || "/";
  };

  const normalizeAttachmentBrowserPath = (path) => {
    const normalized = String(path || "/").trim().replace(/\/+$/g, "");
    return normalized || "/";
  };

  const attachmentBrowserPathSegments = (path) => {
    const normalized = normalizeAttachmentBrowserPath(path);
    const segments = [{ label: "/", path: "/" }];
    let accumulated = "";
    for (const part of normalized.split("/").filter(Boolean)) {
      accumulated += `/${part}`;
      segments.push({ label: part, path: accumulated });
    }
    return segments;
  };

  const renderAttachmentBrowserBreadcrumbs = () => {
    if (!attachmentBrowserBreadcrumbs) {
      return;
    }
    const currentPath = normalizeAttachmentBrowserPath(attachmentBrowserCurrentPath);
    if (attachmentBrowserBreadcrumbPath === currentPath && attachmentBrowserBreadcrumbs.childElementCount > 0) {
      return;
    }
    attachmentBrowserBreadcrumbPath = currentPath;
    attachmentBrowserBreadcrumbs.textContent = "";
    const segments = attachmentBrowserPathSegments(attachmentBrowserCurrentPath);
    const fragment = document.createDocumentFragment();
    for (const [index, segment] of segments.entries()) {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "attachment-browser-breadcrumb-separator";
        separator.textContent = ">";
        separator.setAttribute("aria-hidden", "true");
        fragment.appendChild(separator);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "attachment-browser-breadcrumb";
      button.dataset.path = segment.path;
      button.textContent = segment.label;
      button.title = segment.path;
      if (segment.path === currentPath) {
        button.disabled = true;
        button.setAttribute("aria-current", "page");
      }
      fragment.appendChild(button);
    }
    attachmentBrowserBreadcrumbs.appendChild(fragment);
    requestAnimationFrame(() => {
      if (attachmentBrowserBreadcrumbs) {
        attachmentBrowserBreadcrumbs.scrollLeft = attachmentBrowserBreadcrumbs.scrollWidth;
      }
    });
  };

  const updateAttachmentBrowserControls = () => {
    if (attachmentBrowserPath) {
      attachmentBrowserPath.textContent = attachmentBrowserDisplayName(attachmentBrowserCurrentPath);
      attachmentBrowserPath.title = attachmentBrowserCurrentPath || "/";
    }
    renderAttachmentBrowserBreadcrumbs();
    updateAttachmentBrowserSortControls();
    if (attachmentBrowserDownload) {
      const count = attachmentBrowserSelectedPaths.size;
      attachmentBrowserDownload.disabled = count === 0;
      attachmentBrowserDownload.textContent = count > 0 ? `下载选中 (${count})` : "下载选中";
    }
  };

  const canNavigateAttachmentBrowserBack = () => Boolean(attachmentBrowserParentPath && attachmentBrowserParentPath !== attachmentBrowserCurrentPath);

  const navigateAttachmentBrowserBack = () => {
    if (!canNavigateAttachmentBrowserBack()) {
      return false;
    }
    loadAttachmentBrowserPath(attachmentBrowserParentPath).catch((error) => setAttachmentBrowserFeedback(error.message || "文件列表读取失败。", "error"));
    return true;
  };

  const attachmentBrowserSortNames = {
    name: "名称",
    size: "文件大小",
    modified: "修改日期",
  };

  const normalizeAttachmentEntryType = (type) => {
    const normalized = String(type || "file").trim().toLowerCase();
    if (normalized === "dir" || normalized === "link") {
      return normalized;
    }
    return "file";
  };

  const normalizeAttachmentEntry = (entry, order = 0) => {
    const size = Number(entry?.size || 0);
    const modified = Number(entry?.modified || 0);
    return {
      name: String(entry?.name || "").trim(),
      path: String(entry?.path || "").trim(),
      type: normalizeAttachmentEntryType(entry?.type),
      size: Number.isFinite(size) && size > 0 ? size : 0,
      modified: Number.isFinite(modified) && modified > 0 ? modified : 0,
      order,
    };
  };

  const formatAttachmentFileSize = (entry) => {
    if (entry?.type === "dir") {
      return "";
    }
    const bytes = Number(entry?.size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    if (unitIndex === 0) {
      return `${Math.round(value)} ${units[unitIndex]}`;
    }
    const precision = value >= 10 ? 0 : 1;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
  };

  const formatAttachmentModified = (entry) => {
    const seconds = Number(entry?.modified || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return "";
    }
    const date = new Date(seconds * 1000);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const compareAttachmentNames = (left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });

  const compareAttachmentOptionalNumbers = (left, right, value, empty) => {
    const leftEmpty = empty(left);
    const rightEmpty = empty(right);
    if (leftEmpty && rightEmpty) {
      return 0;
    }
    if (leftEmpty) {
      return -1;
    }
    if (rightEmpty) {
      return 1;
    }
    return Number(value(left) || 0) - Number(value(right) || 0);
  };

  const compareAttachmentEntries = (left, right) => {
    let result = 0;
    if (attachmentBrowserSort.key === "name") {
      result = compareAttachmentNames(left, right);
    } else if (attachmentBrowserSort.key === "size") {
      result = compareAttachmentOptionalNumbers(left, right, (entry) => entry.size, (entry) => entry.type === "dir");
    } else if (attachmentBrowserSort.key === "modified") {
      result = compareAttachmentOptionalNumbers(left, right, (entry) => entry.modified, (entry) => !Number(entry?.modified || 0));
    }
    if (result !== 0) {
      return attachmentBrowserSort.direction === "desc" ? -result : result;
    }
    const nameResult = compareAttachmentNames(left, right);
    if (nameResult !== 0) {
      return nameResult;
    }
    return Number(left?.order || 0) - Number(right?.order || 0);
  };

  const sortedAttachmentBrowserEntries = () => attachmentBrowserEntries.slice().sort(compareAttachmentEntries);

  const resetAttachmentBrowserSort = () => {
    attachmentBrowserSort = { ...attachmentBrowserDefaultSort };
  };

  const cycleAttachmentBrowserSort = (key) => {
    const normalizedKey = String(key || "").trim();
    if (!Object.prototype.hasOwnProperty.call(attachmentBrowserSortNames, normalizedKey)) {
      return;
    }
    if (attachmentBrowserSort.key !== normalizedKey) {
      attachmentBrowserSort = { key: normalizedKey, direction: "asc" };
      return;
    }
    if (attachmentBrowserSort.direction === "asc") {
      attachmentBrowserSort = { key: normalizedKey, direction: "desc" };
      return;
    }
    resetAttachmentBrowserSort();
  };

  const updateAttachmentBrowserSortControls = () => {
    const activeLabel = attachmentBrowserSortNames[attachmentBrowserSort.key] || "";
    const activeDirectionLabel = attachmentBrowserSort.direction === "desc" ? "降序" : "升序";
    attachmentBrowserSortbar?.setAttribute("data-sort-key", attachmentBrowserSort.key);
    attachmentBrowserSortbar?.setAttribute("data-sort-direction", attachmentBrowserSort.direction);
    for (const button of attachmentBrowserSortButtons) {
      const key = String(button.dataset.attachmentSortKey || "");
      const active = key === attachmentBrowserSort.key;
      const label = attachmentBrowserSortNames[key] || button.textContent.trim();
      button.classList.toggle("is-active", active);
      button.dataset.sortDirection = active ? attachmentBrowserSort.direction : "";
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.setAttribute("aria-label", active ? `按${label}排序，当前${activeDirectionLabel}，点击切换排序` : `按${label}排序`);
    }
    if (attachmentBrowserList) {
      attachmentBrowserList.setAttribute("aria-label", activeLabel ? `文件列表，当前按${activeLabel}${activeDirectionLabel}排序` : "文件列表");
    }
  };

  const attachmentBrowserDownloadFilename = (paths) => {
    const selected = Array.from(paths || []).filter(Boolean);
    if (selected.length !== 1) {
      return "webshell-files.zip";
    }
    const path = selected[0];
    const entry = attachmentBrowserEntriesByPath.get(path);
    const name = String(entry?.name || path.split("/").filter(Boolean).pop() || "download").trim() || "download";
    return entry?.type === "dir" && !name.toLowerCase().endsWith(".zip") ? `${name}.zip` : name;
  };

  const createAttachmentBrowserItem = (entry) => {
    const item = document.createElement("div");
    item.className = "attachment-browser-item";
    item.dataset.path = entry.path;
    item.dataset.type = entry.type;
    item.setAttribute("role", "listitem");

    const row = document.createElement("div");
    row.className = "attachment-browser-file";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "attachment-browser-check";
    checkbox.value = entry.path;
    checkbox.checked = attachmentBrowserSelectedPaths.has(entry.path);
    checkbox.setAttribute("aria-label", `选择 ${entry.name || entry.path}`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "attachment-browser-file-main";
    button.dataset.path = entry.path;
    button.setAttribute("aria-label", entry.type === "dir" ? `打开 ${entry.name || entry.path}` : `下载 ${entry.name || entry.path}`);
    const name = document.createElement("span");
    name.className = "attachment-browser-file-name";
    name.textContent = entry.name || entry.path;
    button.appendChild(name);
    const size = document.createElement("span");
    size.className = "attachment-browser-file-meta attachment-browser-file-size";
    size.textContent = formatAttachmentFileSize(entry);
    size.title = size.textContent;
    const modified = document.createElement("span");
    modified.className = "attachment-browser-file-meta attachment-browser-file-modified";
    modified.textContent = formatAttachmentModified(entry);
    modified.title = modified.textContent;
    row.append(checkbox, button, size, modified);
    item.appendChild(row);
    return item;
  };

  const renderAttachmentBrowserList = (entries) => {
    if (!attachmentBrowserList) {
      return;
    }
    attachmentBrowserList.textContent = "";
    attachmentBrowserEntriesByPath.clear();
    if (Array.isArray(entries)) {
      attachmentBrowserEntries = entries.map((entry, index) => normalizeAttachmentEntry(entry, index)).filter((entry) => entry.name && entry.path);
    }
    const sorted = sortedAttachmentBrowserEntries();
    if (sorted.length === 0) {
      const empty = document.createElement("div");
      empty.className = "attachment-browser-empty";
      empty.textContent = "这个目录没有文件";
      attachmentBrowserList.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of sorted) {
      attachmentBrowserEntriesByPath.set(entry.path, entry);
      fragment.appendChild(createAttachmentBrowserItem(entry));
    }
    attachmentBrowserList.appendChild(fragment);
  };

  const loadAttachmentBrowserPath = async (path = attachmentBrowserCurrentPath) => measurePerformanceTask("attachment list refresh", async () => {
    if (!activeName) {
      showToast("没有可用的当前终端。");
      return;
    }
    const requestSeq = ++attachmentBrowserRequestSeq;
    setAttachmentBrowserBusy(true);
    setAttachmentBrowserFeedback("");
    try {
      const response = await fetch(attachmentFilesURL(path));
      if (!response.ok) {
        throw new Error(await readResponseText(response, `文件列表读取失败 (${response.status})`));
      }
      const payload = await response.json();
      if (requestSeq !== attachmentBrowserRequestSeq) {
        return;
      }
      attachmentBrowserCurrentPath = String(payload?.path || path || "/").trim() || "/";
      attachmentBrowserParentPath = String(payload?.parent || "").trim();
      attachmentBrowserSelectedPaths.clear();
      resetAttachmentBrowserSort();
      renderAttachmentBrowserList(payload?.entries || []);
      setAttachmentBrowserFeedback("");
      updateAttachmentBrowserControls();
    } catch (error) {
      if (requestSeq === attachmentBrowserRequestSeq) {
        setAttachmentBrowserFeedback(error.message || "文件列表读取失败。", "error");
      }
    } finally {
      if (requestSeq === attachmentBrowserRequestSeq) {
        setAttachmentBrowserBusy(false);
        updateAttachmentBrowserControls();
      }
    }
  });

  const openAttachmentBrowser = () => {
    if (!attachmentBrowserBackdrop) {
      return;
    }
    closeAttachmentDialog({ focusTerminal: false });
    closeContextMenu();
    closeInstanceSwitcher();
    closeDevicePanel();
    const startPath = isClientInstanceName() ? "/" : String(activeSession()?.cwd || "").trim() || "/";
    attachmentBrowserOpen = true;
    attachmentBrowserCurrentPath = startPath;
    attachmentBrowserParentPath = "";
    attachmentBrowserSelectedPaths.clear();
    attachmentBrowserEntries = [];
    resetAttachmentBrowserSort();
    document.body?.classList.add("attachment-browser-open");
    attachmentBrowserBackdrop.hidden = false;
    renderAttachmentBrowserList([]);
    updateAttachmentBrowserControls();
    loadAttachmentBrowserPath(startPath).catch((error) => setAttachmentBrowserFeedback(error.message || "文件列表读取失败。", "error"));
    window.setTimeout(() => attachmentBrowserBack?.focus(), 0);
  };

  const closeAttachmentBrowser = ({ focusTerminal = true } = {}) => {
    attachmentBrowserOpen = false;
    attachmentBrowserRequestSeq += 1;
    attachmentBrowserSelectedPaths.clear();
    attachmentBrowserEntriesByPath.clear();
    attachmentBrowserEntries = [];
    attachmentBrowserBreadcrumbPath = "";
    attachmentBrowserEdgeSwipe = null;
    if (attachmentBrowserBackdrop) {
      attachmentBrowserBackdrop.hidden = true;
    }
    document.body?.classList.remove("attachment-browser-open");
    setAttachmentBrowserFeedback("");
    if (focusTerminal) {
      window.setTimeout(() => activeSession()?.term?.focus(), 0);
    }
  };

  const triggerAttachmentDownload = (paths) => {
    const selected = Array.from(paths || []).filter(Boolean);
    if (selected.length === 0) {
      return;
    }
    const link = document.createElement("a");
    link.href = attachmentDownloadURL(selected).toString();
    link.download = attachmentBrowserDownloadFilename(selected);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadSelectedAttachmentFiles = () => {
    const selected = Array.from(attachmentBrowserSelectedPaths);
    if (selected.length === 0) {
      return;
    }
    triggerAttachmentDownload(selected);
    closeAttachmentBrowser({ focusTerminal: true });
  };

  const resetAttachmentBrowserEdgeSwipe = () => {
    attachmentBrowserEdgeSwipe = null;
  };

  const handleAttachmentBrowserTouchStart = (event) => {
    if (!isAttachmentBrowserOpen() || !isMobileLayout() || event.touches.length !== 1 || !canNavigateAttachmentBrowserBack()) {
      resetAttachmentBrowserEdgeSwipe();
      return;
    }
    const touch = event.touches[0];
    if (touch.clientX > attachmentBrowserSwipeEdgeWidth) {
      resetAttachmentBrowserEdgeSwipe();
      return;
    }
    attachmentBrowserEdgeSwipe = {
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
      navigated: false,
    };
  };

  const handleAttachmentBrowserTouchMove = (event) => {
    if (!attachmentBrowserEdgeSwipe || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - attachmentBrowserEdgeSwipe.startX;
    const deltaY = touch.clientY - attachmentBrowserEdgeSwipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (deltaX < -attachmentBrowserSwipeAxisThreshold) {
      resetAttachmentBrowserEdgeSwipe();
      return;
    }
    if (!attachmentBrowserEdgeSwipe.horizontal) {
      if (absY > attachmentBrowserSwipeAxisThreshold && absY > absX) {
        resetAttachmentBrowserEdgeSwipe();
        return;
      }
      if (deltaX > attachmentBrowserSwipeAxisThreshold && absX > absY * 1.2) {
        attachmentBrowserEdgeSwipe.horizontal = true;
      }
    }
    if (!attachmentBrowserEdgeSwipe?.horizontal) {
      return;
    }
    event.preventDefault();
    if (!attachmentBrowserEdgeSwipe.navigated && deltaX >= attachmentBrowserSwipeBackDistance && absY <= attachmentBrowserSwipeMaxVerticalTravel) {
      attachmentBrowserEdgeSwipe.navigated = true;
      navigateAttachmentBrowserBack();
      resetAttachmentBrowserEdgeSwipe();
    }
  };

  const normalizeAttachmentFiles = (files) => Array.from(files || []).filter((file) => file instanceof File || file instanceof Blob);

  const totalAttachmentSize = (files) => files.reduce((sum, file) => sum + Number(file?.size || 0), 0);

  const attachmentUploadTitle = (upload) => {
    const count = upload.files.length;
    if (count === 1) {
      return upload.files[0]?.name || "附件";
    }
    return `${count} 个文件`;
  };

  const uploadStatusText = (upload) => {
    if (upload.status === "success") {
      if (upload.copyFailed) {
        return "上传成功，点击复制路径。";
      }
      return "文件路径已复制到剪切板,粘贴即可";
    }
    if (upload.status === "error") {
      return upload.error || "上传失败";
    }
    if (upload.status === "canceled") {
      return "上传已取消";
    }
    const loaded = formatAttachmentBytes(upload.loaded);
    const total = upload.total > 0 ? formatAttachmentBytes(upload.total) : "";
    const percent = upload.total > 0 ? `${Math.round(Math.min(100, (upload.loaded / upload.total) * 100))}%` : "";
    return [loaded && total ? `${loaded} / ${total}` : loaded, percent].filter(Boolean).join(" · ") || "准备上传";
  };

  const removeAttachmentUpload = (id) => {
    const upload = attachmentUploads.get(id);
    if (!upload) {
      return;
    }
    upload.clipboardReservation?.reject?.();
    upload.clipboardReservation = null;
    if (upload.autoCloseTimer) {
      window.clearTimeout(upload.autoCloseTimer);
      upload.autoCloseTimer = null;
    }
    if (upload.status === "uploading" && upload.xhr) {
      upload.canceled = true;
      upload.xhr.abort();
    }
    upload.panel?.remove();
    attachmentUploads.delete(id);
  };

  const ensureAttachmentUploadPanel = (upload) => {
    if (upload.panel?.isConnected) {
      return upload.panel;
    }
    const tab = tabs.get(upload.tabId);
    if (!tab?.paneEl) {
      return null;
    }
    const panel = document.createElement("section");
    panel.className = "attachment-upload-panel";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="attachment-upload-head">
        <div class="attachment-upload-title"></div>
        <button class="attachment-upload-copy" type="button" hidden>复制路径</button>
        <button class="attachment-upload-close" type="button" aria-label="关闭上传提示">&times;</button>
      </div>
      <div class="attachment-upload-detail"></div>
      <div class="attachment-upload-progress" aria-hidden="true"><span></span></div>
    `;
    panel.querySelector(".attachment-upload-copy")?.addEventListener("click", async () => {
      const text = String(upload.paths || "").trim();
      if (!text) {
        return;
      }
      const copied = await copyText(text);
      if (copied) {
        upload.copyFailed = false;
        renderAttachmentUpload(upload);
        scheduleAttachmentUploadAutoClose(upload);
      } else {
        showToast("路径复制失败。");
      }
    });
    panel.querySelector(".attachment-upload-close")?.addEventListener("click", () => removeAttachmentUpload(upload.id));
    tab.paneEl.appendChild(panel);
    upload.panel = panel;
    return panel;
  };

  const scheduleAttachmentUploadAutoClose = (upload) => {
    if (upload.autoCloseTimer) {
      window.clearTimeout(upload.autoCloseTimer);
    }
    upload.autoCloseTimer = window.setTimeout(() => {
      if (attachmentUploads.get(upload.id) === upload && upload.status === "success") {
        removeAttachmentUpload(upload.id);
      }
    }, 5000);
  };

  const renderAttachmentUpload = (upload) => {
    if (attachmentUploads.get(upload.id) !== upload) {
      return;
    }
    const panel = ensureAttachmentUploadPanel(upload);
    if (!panel) {
      return;
    }
    panel.dataset.status = upload.status;
    panel.classList.toggle("search-open", Boolean(searchPanel && !searchPanel.hidden && upload.tabId === activeTabId));
    const title = panel.querySelector(".attachment-upload-title");
    const copyButton = panel.querySelector(".attachment-upload-copy");
    const detail = panel.querySelector(".attachment-upload-detail");
    const progress = panel.querySelector(".attachment-upload-progress span");
    if (title) {
      title.textContent = attachmentUploadTitle(upload);
    }
    if (copyButton) {
      copyButton.hidden = upload.status !== "success" || !upload.copyFailed || !String(upload.paths || "").trim();
    }
    if (detail) {
      detail.textContent = uploadStatusText(upload);
    }
    if (progress) {
      const percent = upload.total > 0 ? Math.max(0, Math.min(100, (upload.loaded / upload.total) * 100)) : 0;
      progress.style.width = upload.status === "success" ? "100%" : `${percent}%`;
    }
  };

  const renderAttachmentUploadsForActiveTab = () => {
    for (const upload of attachmentUploads.values()) {
      renderAttachmentUpload(upload);
    }
  };

  const readAttachmentUploadResponse = (xhr) => {
    const text = String(xhr.responseText || "").trim();
    if (!text) {
      return { files: [] };
    }
    try {
      return JSON.parse(text);
    } catch {
      return { files: [] };
    }
  };

  const xhrResponseError = (xhr, fallback) => {
    const text = String(xhr.responseText || "").trim();
    return text || fallback;
  };

  const createDeferredAttachmentClipboard = () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem !== "function" || typeof Blob !== "function" || !window.isSecureContext) {
      return null;
    }
    let resolveText;
    let rejectText;
    const textPromise = new Promise((resolve, reject) => {
      resolveText = resolve;
      rejectText = reject;
    });
    const item = new ClipboardItem({
      "text/plain": textPromise.then((text) => new Blob([String(text || "")], { type: "text/plain" })),
    });
    const writePromise = navigator.clipboard.write([item]);
    writePromise.catch(() => {});
    return {
      resolve(text) {
        resolveText(String(text || ""));
      },
      reject(error) {
        rejectText(error || new Error("attachment clipboard canceled"));
      },
      promise: writePromise,
    };
  };

  const reserveAttachmentClipboard = () => {
    pendingAttachmentFileClipboard?.reject?.();
    pendingAttachmentFileClipboard = null;
    try {
      pendingAttachmentFileClipboard = createDeferredAttachmentClipboard();
    } catch (error) {
      pendingAttachmentFileClipboard = null;
    }
  };

  const consumeAttachmentClipboardReservation = () => {
    const reserved = pendingAttachmentFileClipboard;
    pendingAttachmentFileClipboard = null;
    return reserved;
  };

  const cancelAttachmentClipboardReservation = () => {
    pendingAttachmentFileClipboard?.reject?.();
    pendingAttachmentFileClipboard = null;
  };

  const copyAttachmentPaths = async (paths, reservedClipboard = null) => {
    const text = String(paths || "").trim();
    if (!text) {
      reservedClipboard?.reject?.();
      return true;
    }
    if (reservedClipboard) {
      try {
        reservedClipboard.resolve(text);
        await reservedClipboard.promise;
        return true;
      } catch (error) {
      }
    }
    return copyText(text);
  };

  const uploadAttachments = (files, { source = "file", clipboardReservation = null } = {}) => {
    const selectedFiles = normalizeAttachmentFiles(files);
    if (selectedFiles.length === 0) {
      clipboardReservation?.reject?.();
      showToast(source === "clipboard" ? "剪贴板没有可导入的内容。" : "请选择要上传的文件。");
      return;
    }
    if (selectedFiles.length > maxAttachmentUploadCount) {
      clipboardReservation?.reject?.();
      showToast(`一次最多上传 ${maxAttachmentUploadCount} 个文件。`);
      return;
    }
    const oversized = selectedFiles.find((file) => Number(file.size || 0) > maxAttachmentUploadBytes);
    if (oversized) {
      clipboardReservation?.reject?.();
      showToast(`文件超过 2GB：${oversized.name || "附件"}`);
      return;
    }
    const tab = currentTab();
    if (!tab || !activeName) {
      clipboardReservation?.reject?.();
      showToast("没有可用的当前终端。");
      return;
    }
    const id = `attachment-${++attachmentUploadSeq}`;
    const instanceName = activeName;
    const upload = {
      id,
      tabId: tab.id,
      instanceName,
      files: selectedFiles,
      total: totalAttachmentSize(selectedFiles),
      loaded: 0,
      status: "uploading",
      xhr: null,
      panel: null,
      error: "",
      canceled: false,
      paths: "",
      copyFailed: false,
      clipboardReservation,
      autoCloseTimer: null,
    };
    attachmentUploads.set(id, upload);
    renderAttachmentUpload(upload);
    const uploadStartedAt = performanceTaskNow();
    let uploadRecorded = false;
    const recordAttachmentUpload = () => {
      if (uploadRecorded) {
        return;
      }
      uploadRecorded = true;
      recordPerformanceTask("attachment upload", performanceTaskNow() - uploadStartedAt);
    };

    const form = new FormData();
    for (const file of selectedFiles) {
      form.append("file", file, file.name || "attachment.bin");
    }
    const xhr = new XMLHttpRequest();
    upload.xhr = xhr;
    xhr.open("POST", attachmentURL(instanceName));
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        upload.loaded = event.loaded;
        upload.total = event.total || upload.total;
      } else {
        upload.loaded = Math.max(upload.loaded, event.loaded || 0);
      }
      renderAttachmentUpload(upload);
    });
    xhr.addEventListener("load", async () => {
      recordAttachmentUpload();
      upload.xhr = null;
      upload.loaded = upload.total || upload.loaded;
      if (xhr.status < 200 || xhr.status >= 300) {
        upload.status = "error";
        upload.error = xhrResponseError(xhr, `上传失败 (${xhr.status})`);
        upload.clipboardReservation?.reject?.();
        upload.clipboardReservation = null;
        if (upload.autoCloseTimer) {
          window.clearTimeout(upload.autoCloseTimer);
          upload.autoCloseTimer = null;
        }
        renderAttachmentUpload(upload);
        return;
      }
      const payload = readAttachmentUploadResponse(xhr);
      const paths = Array.isArray(payload?.files) ? payload.files.map((file) => String(file?.path || "").trim()).filter(Boolean) : [];
      upload.paths = paths.join("\n");
      if (paths.length > 0) {
        upload.copyFailed = !(await copyAttachmentPaths(upload.paths, upload.clipboardReservation));
        upload.clipboardReservation = null;
      }
      upload.status = "success";
      renderAttachmentUpload(upload);
      if (!upload.copyFailed) {
        scheduleAttachmentUploadAutoClose(upload);
      }
    });
    xhr.addEventListener("error", () => {
      recordAttachmentUpload();
      upload.xhr = null;
      upload.status = "error";
      upload.error = "上传失败";
      upload.clipboardReservation?.reject?.();
      upload.clipboardReservation = null;
      if (upload.autoCloseTimer) {
        window.clearTimeout(upload.autoCloseTimer);
        upload.autoCloseTimer = null;
      }
      renderAttachmentUpload(upload);
    });
    xhr.addEventListener("abort", () => {
      recordAttachmentUpload();
      upload.xhr = null;
      upload.status = "canceled";
      upload.error = "";
      upload.clipboardReservation?.reject?.();
      upload.clipboardReservation = null;
      if (upload.autoCloseTimer) {
        window.clearTimeout(upload.autoCloseTimer);
        upload.autoCloseTimer = null;
      }
      renderAttachmentUpload(upload);
    });
    xhr.send(form);
  };

  const importAttachmentFromClipboard = async () => {
    try {
      const files = await readClipboardFiles();
      closeAttachmentDialog({ focusTerminal: false });
      uploadAttachments(files, { source: "clipboard" });
    } catch (error) {
      showToast(error.message || "剪贴板读取失败。");
    }
  };

  const selectAttachmentFiles = () => {
    closeAttachmentDialog({ focusTerminal: false });
    reserveAttachmentClipboard();
    attachmentFileInput?.click();
  };

  const resetTabsForInstance = () => {
    applyingWorkspaceState = true;
    try {
      for (const tab of [...tabs.values()]) {
        closeTab(tab.id, { remember: false });
      }
      recentTabIds = [];
    } finally {
      applyingWorkspaceState = false;
    }
  };

  const switchInstance = async (nextName, { updateURL = true, replaceURL = false } = {}) => {
    const normalized = String(nextName || "").trim();
    if (!normalized || normalized === activeName) {
      return;
    }
    clearWorkspaceRefreshRetry();
    hideStartupErrorPanel();
    const generation = setActiveInstanceName(normalized);
    if (updateURL) {
      updateLocationName(activeName, { replace: replaceURL, tabId: "" });
    }
    renderInstanceSwitcher();
    if (isServiceForwardsSettingsActive()) {
      serviceForwardEntries = [];
      resetServiceForwardForm();
      renderServiceForwardSettings();
      refreshServiceForwards().catch((error) => setSettingsFeedback(error.message || "服务转发列表加载失败。", "error"));
    }
    resetTabsForInstance();
    await refreshWorkspaceWithRetry({ focus: true, instanceName: activeName, generation });
  };

  const refreshInstances = async () => {
    const instances = await loadInstances();
    if (!activeName) {
      setActiveInstanceName(await loadDefaultInstanceName());
      updateLocationName(activeName, { replace: true, tabId: "" });
    }
    const active = instances.find((item) => instanceSelector(item) === activeName);
    if (!active) {
      throw new Error("Requested LightOS instance is unavailable.");
    }
    if (!isRunningInstance(active)) {
      const fallback = instances.find((item) => isRunningInstance(item));
      const fallbackName = instanceSelector(fallback);
      if (fallbackName) {
        setActiveInstanceName(fallbackName);
        updateLocationName(activeName, { replace: true, tabId: "" });
      } else {
        throw new Error("No running LightOS instance found");
      }
    }
    renderInstanceSwitcher();
  };

  const bootstrap = async () => {
    syncDebugModeState();
    const themePromise = loadThemeCatalog().finally(() => {
      markWebShellStartupMetric("themeReadyAt");
      appendStartupTrace("主题加载完成", "", { dedupeKey: "theme-ready" });
    });
    const settingsPromise = loadSettings({ deferFontLoad: true })
      .catch((error) => showToast(error.message || "设置加载失败。"))
      .finally(() => {
        markWebShellStartupMetric("settingsReadyAt");
        appendStartupTrace("设置加载完成", "", { dedupeKey: "settings-ready" });
      });
    const instancesPromise = loadInstances().finally(() => {
      markWebShellStartupMetric("instancesReadyAt");
      appendStartupTrace("实例列表加载完成", "", { dedupeKey: "instances-ready" });
    });
    let bootstrapWorkspaceContext = null;
    const requestBootstrapWorkspace = () => {
      bootstrapWorkspaceContext = {
        instanceName: activeName,
        generation: activeInstanceGeneration,
      };
      return requestWorkspaceRefresh(bootstrapWorkspaceContext);
    };
    const workspacePromise = (activeName ? requestBootstrapWorkspace() : instancesPromise.then(requestBootstrapWorkspace))
      .then((result) => ({ result, error: null }), (error) => ({ result: null, error }));
    const startupInputUnlockPromise = instancesPromise
      .then(() => clearStartupServerRevisionInputLock())
      .catch(() => {});
    await Promise.all([
      ghosttyInitPromise,
      themePromise,
      settingsPromise,
      instancesPromise,
      startupInputUnlockPromise,
    ]);
    applyThemeDocumentState();
    appendStartupTrace("Ghostty、主题、设置和实例初始化完成", "", { dedupeKey: "runtime-prerequisites-ready" });
    renderThemePicker();
    renderSettingsThemeList();
    const workspaceOutcome = await workspacePromise;
    const workspaceRequestIsCurrent = isCurrentInstanceRequest(
      bootstrapWorkspaceContext?.instanceName,
      bootstrapWorkspaceContext?.generation,
    );
    if (!workspaceRequestIsCurrent) {
      await refreshWorkspaceWithRetry({ focus: true }).catch((error) => {
        showToast(error.message || "Workspace is temporarily unavailable. Retrying.");
      });
    } else if (workspaceOutcome.error) {
      scheduleWorkspaceRefreshRetry({
        focus: true,
        instanceName: activeName,
        generation: activeInstanceGeneration,
      });
      showToast(workspaceOutcome.error.message || "Workspace is temporarily unavailable. Retrying.");
    } else {
      applyWorkspaceRefresh(workspaceOutcome.result, { focus: true });
    }
    requestTerminalStoragePersistence().catch(() => {});
    appendStartupTrace("应用 bootstrap 完成", `active=${activeName || "无"} tabs=${tabs.size}`, { dedupeKey: "bootstrap-complete" });
    startActivityRefresh();
    refreshActivity({ silent: true }).catch(() => {});
  };

  const requestTerminalStoragePersistence = async () => {
    if (terminalStoragePersistenceRequested || !navigator.storage) {
      return false;
    }
    terminalStoragePersistenceRequested = true;
    let persisted = false;
    try {
      persisted = typeof navigator.storage.persisted === "function"
        ? await navigator.storage.persisted()
        : false;
      if (!persisted && typeof navigator.storage.persist === "function") {
        persisted = await navigator.storage.persist();
      }
      const estimate = typeof navigator.storage.estimate === "function"
        ? await navigator.storage.estimate()
        : null;
      console.info("[terminal-cache-v2] browser storage", {
        persisted,
        usage: Number(estimate?.usage || 0),
        quota: Number(estimate?.quota || 0),
      });
    } catch (error) {
      console.warn("[terminal-cache-v2] persistent storage request failed", {
        error: error?.message || String(error),
      });
    }
    return persisted;
  };

  const registerWebShellServiceWorker = () => {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch((error) => {
      console.warn("[webshell-pwa] service worker registration failed", {
        error: error?.message || String(error),
      });
    });
  };

  async function createUserTab() {
    if (!activeName) {
      showToast("No running container is available.");
      return;
    }
    const tab = currentTab();
    await postWorkspaceAction("create_tab", { tab_id: tab?.id || "", pane_id: tab?.activePaneId || "" });
  }

  renderMobileShortcuts();
  installMobileCustomSelects();

  newTabButton?.addEventListener("click", () => {
    createUserTab().catch((error) => showToast(error.message));
  });

  emptyStateAction?.addEventListener("click", () => {
    createUserTab().catch((error) => showToast(error.message));
  });

  instanceSwitcherButton?.addEventListener("click", () => {
    if (isEmbedMode) {
      return;
    }
    if (instanceSwitcherPanel?.hidden) {
      openInstanceSwitcher();
    } else {
      closeInstanceSwitcher();
    }
  });

  instanceSwitcherList?.addEventListener("click", (event) => {
    const item = event.target.closest(".instance-switcher-item");
    if (!item || item.disabled) {
      return;
    }
    closeInstanceSwitcher();
    switchInstance(item.dataset.name).catch((error) => showToast(error.message));
  });

  homeMenuButton?.addEventListener("click", () => {
    navigateHome().catch((error) => showToast(error.message || "无法返回首页"));
  });
  settingsMenuButton?.addEventListener("click", () => openSettings());
  clientSettingsMenuButton?.addEventListener("click", () => {
    closeInstanceSwitcher();
    openConfigurationPage().catch((error) => showToast(error.message || "无法打开客户端设置"));
  });
  void initializeClientSettingsEntry();
  themePickerClose?.addEventListener("click", closeThemePicker);
  themePickerBackdrop?.addEventListener("click", (event) => {
    if (event.target === themePickerBackdrop) {
      const { clientX, clientY } = event;
      closeThemePicker();
      focusPaneAtPoint(clientX, clientY);
    }
  });
  themePickerBackdrop?.addEventListener("touchstart", handleThemePickerTouchStart, { passive: true });
  themePickerBackdrop?.addEventListener("touchmove", handleThemePickerTouchMove, { passive: false });
  themePickerBackdrop?.addEventListener("touchend", resetThemePickerEdgeSwipe, { passive: true });
  themePickerBackdrop?.addEventListener("touchcancel", resetThemePickerEdgeSwipe, { passive: true });
  themePickerList?.addEventListener("click", (event) => {
    const option = event.target.closest(".theme-picker-option");
    if (!option) {
      return;
    }
    applyTheme(option.dataset.theme);
  });
  settingsThemeList?.addEventListener("click", (event) => {
    const option = event.target.closest(".theme-picker-option");
    if (!option) {
      return;
    }
    applyTheme(option.dataset.theme);
  });
  settingsThemePanel?.addEventListener("scroll", showSettingsThemeScrollbarDuringScroll, { passive: true });
  settingsThemeList?.addEventListener("scroll", showSettingsThemeScrollbarDuringScroll, { passive: true });
  settingsMobileShortcutsPanel?.addEventListener("scroll", showSettingsMobileShortcutsScrollbarDuringScroll, { passive: true });
  settingsDesktopShortcutsPanel?.addEventListener("scroll", showSettingsDesktopShortcutsScrollbarDuringScroll, { passive: true });
  themePickerList?.addEventListener("scroll", scheduleThemePickerScrollbarSync, { passive: true });
  themePickerScrollbarSensor?.addEventListener("pointerenter", () => {
    setThemePickerScrollbarHovering(true);
  });
  themePickerScrollbarSensor?.addEventListener("pointerleave", () => {
    if (!themePickerScrollbarDragging) {
      setThemePickerScrollbarHovering(false);
    }
  });
  themePickerScrollbarTrack?.addEventListener("pointerdown", (event) => {
    if (event.target === themePickerScrollbarThumb || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const trackRect = themePickerScrollbarTrack.getBoundingClientRect();
    const { thumbHeight } = getThemePickerScrollbarMetrics();
    const nextThumbTop = event.clientY - trackRect.top - thumbHeight / 2;
    setThemePickerScrollFromThumbTop(nextThumbTop);
    setThemePickerScrollbarHovering(true);
  });
  themePickerScrollbarThumb?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const thumbRect = themePickerScrollbarThumb.getBoundingClientRect();
    themePickerScrollbarDragging = true;
    themePickerScrollbarPointerId = event.pointerId;
    themePickerScrollbarThumbPointerOffset = event.clientY - thumbRect.top;
    themePickerScrollbarThumb.classList.add("is-dragging");
    setThemePickerScrollbarHovering(true);
  });

  settingsBack?.addEventListener("click", () => {
    if (isMobileLayout() && settingsMobileView === "detail") {
      openSettingsMobileIndex();
      return;
    }
    closeSettings();
  });
  settingsClose?.addEventListener("click", closeSettings);
  settingsBackdrop?.addEventListener("click", (event) => {
    if (event.target === settingsBackdrop) {
      closeSettings();
    }
  });
  deviceClose?.addEventListener("click", closeDevicePanel);
  deviceBack?.addEventListener("click", closeDevicePanel);
  deviceBackdrop?.addEventListener("click", (event) => {
    if (event.target === deviceBackdrop) {
      closeDevicePanel();
    }
  });
  settingsMobileNav?.addEventListener("click", (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-settings-mobile-nav-tab]") : null;
    if (!item) {
      return;
    }
    openSettingsMobileDetail(item.dataset.settingsMobileNavTab);
  });
  for (const tab of settingsTabs) {
    tab.addEventListener("click", () => setActiveSettingsTab(tab.dataset.settingsTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const currentIndex = Math.max(0, settingsTabs.indexOf(tab));
      const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = settingsTabs[(currentIndex + offset + settingsTabs.length) % settingsTabs.length];
      if (next) {
        setActiveSettingsTab(next.dataset.settingsTab);
        next.focus();
      }
    });
  }
  const stepSettingsNumberInput = (button) => {
    const targetID = String(button?.dataset?.numberTarget || "").trim();
    const input = targetID ? document.getElementById(targetID) : null;
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return;
    }
    try {
      if (button.dataset.numberStep === "down") {
        input.stepDown();
      } else {
        input.stepUp();
      }
    } catch (error) {
      const min = Number(input.min);
      input.value = Number.isFinite(min) ? String(min) : "0";
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus({ preventScroll: true });
  };

  settingsPanel?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-number-step]") : null;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    event.preventDefault();
    stepSettingsNumberInput(button);
  });

  settingsFontCards?.addEventListener("click", (event) => {
    const card = event.target.closest(".settings-font-card");
    if (!card) {
      return;
    }
    const fontID = String(card.dataset.fontId || "");
    if (fontEditMode) {
      if (!fontID) {
        return;
      }
      if (selectedFontDeleteIDs.has(fontID)) {
        selectedFontDeleteIDs.delete(fontID);
      } else {
        selectedFontDeleteIDs.add(fontID);
      }
      renderSettingsFonts();
      return;
    }
    saveTerminalFontSelection(fontID)
      .catch((error) => setSettingsFeedback(error.message || "字体设置保存失败。", "error"));
  });
  settingsFontEditButton?.addEventListener("click", () => {
    fontEditMode = !fontEditMode;
    if (!fontEditMode) {
      selectedFontDeleteIDs.clear();
    }
    renderSettingsFonts();
  });
  settingsFontDeleteSelectedButton?.addEventListener("click", () => {
    deleteSelectedFonts()
      .catch((error) => setSettingsFeedback(error.message || "字体删除失败。", "error"))
      .finally(() => renderSettingsFonts());
  });
  settingsFontUploadButton?.addEventListener("click", () => {
    if (fontEditMode || settingsFontInput?.disabled) {
      return;
    }
    settingsFontInput?.click();
  });
  settingsFontInput?.addEventListener("change", () => {
    const files = Array.from(settingsFontInput.files || []);
    if (files.length === 0) {
      return;
    }
    settingsFontInput.disabled = true;
    if (settingsFontUploadButton) {
      settingsFontUploadButton.disabled = true;
    }
    uploadTerminalFonts(files)
      .then(() => {
        settingsFontInput.value = "";
      })
      .catch((error) => setSettingsFeedback(error.message || "字体上传失败。", "error"))
      .finally(() => {
        settingsFontInput.disabled = false;
        if (settingsFontUploadButton) {
          settingsFontUploadButton.disabled = false;
        }
      });
  });
  settingsLineHeightInput?.addEventListener("input", scheduleTerminalLineHeightSave);
  settingsLineHeightInput?.addEventListener("change", () => {
    window.clearTimeout(settingsLineHeightSaveTimer);
    try {
      readSettingsLineHeightInput();
    } catch (error) {
      syncSettingsLineHeightInput();
      setSettingsFeedback(error.message || "行间距设置无效。", "error");
      return;
    }
    saveTerminalLineHeightFromInput();
  });
  settingsLineHeightResetButton?.addEventListener("click", () => {
    window.clearTimeout(settingsLineHeightSaveTimer);
    if (settingsLineHeightInput) {
      settingsLineHeightInput.value = String(defaultTerminalLineHeightPercent);
    }
    const requestSeq = ++settingsLineHeightSaveRequestSeq;
    setSettingsLineHeightSaving(true);
    saveTerminalLineHeightPercent(defaultTerminalLineHeightPercent, { syncLineHeightInput: true })
      .catch((error) => {
        if (requestSeq === settingsLineHeightSaveRequestSeq) {
          syncSettingsLineHeightInput();
          setSettingsFeedback(error.message || "行间距恢复默认失败。", "error");
        }
      })
      .finally(() => {
        if (requestSeq === settingsLineHeightSaveRequestSeq) {
          setSettingsLineHeightSaving(false);
        }
      });
  });
  settingsScrollbackInput?.addEventListener("input", scheduleTerminalScrollbackSave);
  settingsScrollbackInput?.addEventListener("change", () => {
    window.clearTimeout(settingsScrollbackSaveTimer);
    settingsScrollbackSaveTimer = 0;
    try {
      readSettingsScrollbackInput();
    } catch (error) {
      syncSettingsScrollbackInput();
      setSettingsFeedback(error.message || "滚动历史设置无效。", "error");
      return;
    }
    saveTerminalScrollbackFromInput();
  });
  settingsScrollbackResetButton?.addEventListener("click", () => {
    window.clearTimeout(settingsScrollbackSaveTimer);
    settingsScrollbackSaveTimer = 0;
    if (settingsScrollbackInput) {
      settingsScrollbackInput.value = String(defaultTerminalScrollback);
    }
    const requestSeq = ++settingsScrollbackSaveRequestSeq;
    setSettingsScrollbackSaving(true);
    saveTerminalScrollback(defaultTerminalScrollback, { syncScrollbackInput: true })
      .then(() => {
        if (requestSeq === settingsScrollbackSaveRequestSeq) {
          setSettingsFeedback("滚动历史已恢复默认，刷新或新建终端后生效。", "success");
        }
      })
      .catch((error) => {
        if (requestSeq === settingsScrollbackSaveRequestSeq) {
          syncSettingsScrollbackInput();
          setSettingsFeedback(error.message || "滚动历史恢复默认失败。", "error");
        }
      })
      .finally(() => {
        if (requestSeq === settingsScrollbackSaveRequestSeq) {
          setSettingsScrollbackSaving(false);
        }
      });
  });
  settingsDesktopMouseClipboardToggle?.addEventListener("change", () => {
    const previous = desktopMouseClipboardEnabled;
    const enabled = settingsDesktopMouseClipboardToggle.checked;
    const requestSeq = ++settingsDesktopMouseClipboardRequestSeq;
    setSettingsDesktopMouseClipboardSaving(true);
    saveDesktopMouseClipboardEnabled(enabled)
      .catch((error) => {
        if (requestSeq === settingsDesktopMouseClipboardRequestSeq) {
          desktopMouseClipboardEnabled = previous;
          syncSettingsDesktopMouseClipboardToggle();
        }
        setSettingsFeedback(error.message || "鼠标复制粘贴设置保存失败。", "error");
      })
      .finally(() => {
        if (requestSeq === settingsDesktopMouseClipboardRequestSeq) {
          setSettingsDesktopMouseClipboardSaving(false);
        }
      });
  });
  settingsDesktopShortcutsBarToggle?.addEventListener("change", () => {
    const previous = desktopShortcutsBarEnabled;
    const enabled = settingsDesktopShortcutsBarToggle.checked;
    const requestSeq = ++settingsDesktopShortcutsBarRequestSeq;
    setSettingsDesktopShortcutsBarSaving(true);
    saveDesktopShortcutsBarEnabled(enabled)
      .catch((error) => {
        if (requestSeq === settingsDesktopShortcutsBarRequestSeq) {
          desktopShortcutsBarEnabled = previous;
          syncSettingsDesktopShortcutsBarToggle();
          resizeActiveTabForCurrentDevice();
        }
        setSettingsFeedback(error.message || "PC底部快捷键栏设置保存失败。", "error");
      })
      .finally(() => {
        if (requestSeq === settingsDesktopShortcutsBarRequestSeq) {
          setSettingsDesktopShortcutsBarSaving(false);
        }
      });
  });
  settingsDebugModeToggle?.addEventListener("change", () => {
    debugModeEnabled = settingsDebugModeToggle.checked;
    window.localStorage.setItem(debugModeStorageKey, debugModeEnabled ? "true" : "false");
    syncDebugModeState();
  });
  settingsDebugLogToggle?.addEventListener("change", () => {
    debugLogEnabled = settingsDebugLogToggle.checked;
    window.localStorage.setItem(debugLogStorageKey, debugLogEnabled ? "true" : "false");
    if (debugLogEnabled) {
      syncDebugLogCapture();
      appendDebugLog("info", "错误日志已启用");
    } else {
      syncDebugLogCapture();
      renderDebugLog();
    }
    syncSettingsDebugLogToggle();
  });
  settingsNetworkMonitorToggle?.addEventListener("change", () => {
    networkMonitorEnabled = settingsNetworkMonitorToggle.checked;
    window.localStorage.setItem(networkMonitorStorageKey, networkMonitorEnabled ? "true" : "false");
    applyTerminalNetworkMonitorVisibility();
    syncSettingsNetworkMonitorToggle();
  });
  debugLogCopy?.addEventListener("click", async () => {
    const text = debugLogClipboardText();
    if (!text) {
      showToast("暂无可复制的调试日志。");
      return;
    }
    try {
      if (await copyText(text)) {
        showToast("调试日志已复制。");
        return;
      }
    } catch (error) {
    }
    showToast("复制调试日志失败。");
  });
  debugLogClear?.addEventListener("click", () => {
    debugLogEntries = [];
    debugLogLastSeen.clear();
    renderDebugLog();
  });
  settingsOnlineDevicesButton?.addEventListener("click", openDevicePanel);
  settingsPerformanceMeterToggle?.addEventListener("change", () => {
    performanceMeterEnabled = settingsPerformanceMeterToggle.checked;
    window.localStorage.setItem(performanceMeterStorageKey, performanceMeterEnabled ? "true" : "false");
    applyPerformanceMeterVisibility();
    syncSettingsPerformanceMeterToggle();
  });
  settingsPerformanceTasksToggle?.addEventListener("change", () => {
    performanceTasksEnabled = settingsPerformanceTasksToggle.checked;
    window.localStorage.setItem(performanceTasksStorageKey, performanceTasksEnabled ? "true" : "false");
    applyPerformanceTaskMeterVisibility();
    syncSettingsPerformanceTasksToggle();
  });
  settingsMobileRemoteDesktopToggle?.addEventListener("change", () => {
    mobileRemoteDesktopEnabled = settingsMobileRemoteDesktopToggle.checked;
    window.localStorage.setItem(mobileRemoteDesktopStorageKey, mobileRemoteDesktopEnabled ? "true" : "false");
    syncSettingsMobileRemoteDesktopToggle();
  });
  settingsForcePCModeToggle?.addEventListener("change", () => {
    forcePCModeEnabled = settingsForcePCModeToggle.checked;
    window.localStorage.setItem(forcePCModeStorageKey, forcePCModeEnabled ? "true" : "false");
    syncForcePCModeState();
  });
  settingsMobilePixelScrollToggle?.addEventListener("change", () => {
    const previous = mobilePixelScrollEnabled;
    const enabled = settingsMobilePixelScrollToggle.checked;
    const requestSeq = ++settingsMobilePixelScrollRequestSeq;
    setSettingsMobilePixelScrollSaving(true);
    saveMobilePixelScrollEnabled(enabled)
      .catch((error) => {
        if (requestSeq === settingsMobilePixelScrollRequestSeq) {
          mobilePixelScrollEnabled = previous;
          syncSettingsMobilePixelScrollToggle();
          resizeActiveTabForCurrentDevice();
        }
        setSettingsFeedback(error.message || "像素级滚动设置保存失败。", "error");
      })
      .finally(() => {
        if (requestSeq === settingsMobilePixelScrollRequestSeq) {
          setSettingsMobilePixelScrollSaving(false);
        }
      });
  });
  settingsMobileDoubleTapReminderToggle?.addEventListener("change", () => {
    const previous = mobileDoubleTapReminderEnabled;
    const enabled = settingsMobileDoubleTapReminderToggle.checked;
    const requestSeq = ++settingsMobileDoubleTapReminderRequestSeq;
    setSettingsMobileDoubleTapReminderSaving(true);
    saveMobileDoubleTapReminderEnabled(enabled)
      .catch((error) => {
        if (requestSeq === settingsMobileDoubleTapReminderRequestSeq) {
          mobileDoubleTapReminderEnabled = previous;
          syncSettingsMobileDoubleTapReminderToggle();
          updateMobileActiveTabTitle();
        }
        setSettingsFeedback(error.message || "双击屏幕提醒设置保存失败。", "error");
      })
      .finally(() => {
        if (requestSeq === settingsMobileDoubleTapReminderRequestSeq) {
          setSettingsMobileDoubleTapReminderSaving(false);
        }
      });
  });
  settingsMobileShortcutAddButton?.addEventListener("click", () => openMobileShortcutEditor({ rowIndex: 0, index: -1 }));
  settingsMobileShortcutResetButton?.addEventListener("click", async () => {
    const confirmed = await confirmDialog("恢复默认手机快捷键？当前自定义配置会被替换。", {
      title: "恢复默认",
      okText: "恢复",
      cancelText: "取消",
    });
    if (!confirmed) {
      return;
    }
    applyMobileShortcutRows(defaultMobileShortcutRowsConfig);
    saveMobileShortcuts(defaultMobileShortcutRowsConfig, { reset: true })
      .catch((error) => setSettingsFeedback(error.message || "手机快捷键恢复默认失败。", "error"));
  });
  settingsMobileShortcutList?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".settings-mobile-shortcut-edit") : null;
    if (!button) {
      return;
    }
    const item = button.closest(".settings-mobile-shortcut-item");
    const rowIndex = Number(item?.dataset.rowIndex || 0);
    const index = Number(item?.dataset.shortcutIndex || 0);
    openMobileShortcutEditor({ rowIndex, index });
  });
  settingsMobileShortcutList?.addEventListener("pointerdown", (event) => {
    const handle = event.target instanceof Element ? event.target.closest(".settings-mobile-shortcut-drag") : null;
    const item = handle?.closest(".settings-mobile-shortcut-item");
    if (item) {
      startMobileShortcutDrag(event, item);
    }
  });
  settingsDesktopShortcutAddButton?.addEventListener("click", () => openDesktopShortcutEditor({ index: -1 }));
  settingsDesktopShortcutResetButton?.addEventListener("click", async () => {
    const confirmed = await confirmDialog("恢复默认PC快捷键？当前自定义配置会被替换。", {
      title: "恢复默认",
      okText: "恢复",
      cancelText: "取消",
    });
    if (!confirmed) {
      return;
    }
    applyDesktopShortcuts(defaultDesktopShortcutsConfig);
    saveDesktopShortcuts(defaultDesktopShortcutsConfig, { reset: true })
      .catch((error) => setSettingsFeedback(error.message || "PC快捷键恢复默认失败。", "error"));
  });
  settingsDesktopShortcutList?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".settings-desktop-shortcut-edit") : null;
    if (!button) {
      return;
    }
    const item = button.closest(".settings-desktop-shortcut-item");
    const index = Number(item?.dataset.shortcutIndex || 0);
    openDesktopShortcutEditor({ index });
  });
  serviceForwardAddButton?.addEventListener("click", () => openServiceForwardForm());
  serviceForwardTitleInput?.addEventListener("input", () => {
    if (!serviceForwardEditingID && serviceForwardSubdomainInput && !serviceForwardSubdomainInput.value.trim()) {
      serviceForwardSubdomainInput.value = normalizeServiceForwardSubdomain(serviceForwardTitleInput.value);
    }
  });
  serviceForwardPortStepUp?.addEventListener("click", () => stepServiceForwardPort(1));
  serviceForwardPortStepDown?.addEventListener("click", () => stepServiceForwardPort(-1));
  serviceForwardForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    setServiceForwardBusy(true);
    deployServiceForward()
      .catch((error) => {
        setSettingsFeedback(error.message || "服务部署失败。", "error");
        setServiceForwardStatus(error.message || "服务部署失败。", "error");
      })
      .finally(() => {
        setServiceForwardBusy(false);
        renderServiceForwardSettings();
      });
  });
  serviceForwardCancelButton?.addEventListener("click", resetServiceForwardForm);
  serviceForwardEditorScrim?.addEventListener("click", resetServiceForwardForm);
  serviceForwardDeleteButton?.addEventListener("click", () => {
    setServiceForwardBusy(true);
    deleteServiceForward()
      .catch((error) => setSettingsFeedback(error.message || "服务删除失败。", "error"))
      .finally(() => {
        setServiceForwardBusy(false);
        renderServiceForwardSettings();
      });
  });
  serviceForwardList?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!button || button.disabled) {
      return;
    }
    const entry = findServiceForwardEntry(button.closest(".settings-service-forward-item")?.dataset.forwardId || "");
    if (!entry) {
      return;
    }
    const action = button.dataset.action;
    if (action === "open") {
      openURL(entry.app_url);
      return;
    }
    if (action === "edit") {
      openServiceForwardForm(entry);
      return;
    }
    if (action === "delete") {
      setServiceForwardBusy(true);
      deleteServiceForward(entry.id)
        .catch((error) => setSettingsFeedback(error.message || "服务删除失败。", "error"))
        .finally(() => {
          setServiceForwardBusy(false);
          renderServiceForwardSettings();
        });
    }
  });
  mobileShortcutEditorPanel?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMobileShortcutEditor();
  });
  mobileShortcutEditorCancel?.addEventListener("click", closeMobileShortcutEditor);
  mobileShortcutEditorDelete?.addEventListener("click", () => {
    if (!mobileShortcutEditorState || Number(mobileShortcutEditorState.index ?? -1) < 0) {
      return;
    }
    const { rowIndex, index } = mobileShortcutEditorState;
    deleteMobileShortcut(rowIndex, index)
      .then((deleted) => {
        if (deleted) {
          closeMobileShortcutEditor();
        }
      })
      .catch((error) => setSettingsFeedback(error.message || "删除快捷键失败。", "error"));
  });
  mobileShortcutEditorScrim?.addEventListener("click", closeMobileShortcutEditor);
  for (const input of mobileShortcutTypeInputs) {
    input.addEventListener("change", syncMobileShortcutEditorFields);
  }
  mobileShortcutKeySelect?.addEventListener("change", syncMobileShortcutEditorFields);
  desktopShortcutEditorPanel?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitDesktopShortcutEditor();
  });
  desktopShortcutEditorCancel?.addEventListener("click", closeDesktopShortcutEditor);
  desktopShortcutEditorScrim?.addEventListener("click", closeDesktopShortcutEditor);
  desktopShortcutEditorDelete?.addEventListener("click", () => {
    if (!desktopShortcutEditorState || Number(desktopShortcutEditorState.index ?? -1) < 0) {
      return;
    }
    deleteDesktopShortcut(Number(desktopShortcutEditorState.index))
      .then((deleted) => {
        if (deleted) {
          closeDesktopShortcutEditor();
        }
      })
      .catch((error) => setSettingsFeedback(error.message || "PC快捷键删除失败。", "error"));
  });
  for (const input of [desktopShortcutCtrlInput, desktopShortcutAltInput, desktopShortcutShiftInput, desktopShortcutCommandInput]) {
    input?.addEventListener("change", syncDesktopShortcutCaptureInput);
  }
  desktopShortcutKeySelect?.addEventListener("change", syncDesktopShortcutCaptureInput);
  desktopShortcutCaptureInput?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || event.key === "Tab") {
      return;
    }
    event.preventDefault();
    const key = shortcutKeyFromEventCode(event) || normalizeShortcutKeyToken(event.key);
    if (!key || ["ctrl", "shift", "alt", "super"].includes(key)) {
      return;
    }
    if (desktopShortcutCtrlInput) {
      desktopShortcutCtrlInput.checked = event.ctrlKey;
    }
    if (desktopShortcutAltInput) {
      desktopShortcutAltInput.checked = event.altKey;
    }
    if (desktopShortcutShiftInput) {
      desktopShortcutShiftInput.checked = event.shiftKey;
    }
    if (desktopShortcutCommandInput) {
      desktopShortcutCommandInput.checked = event.metaKey;
    }
    if (desktopShortcutKeySelect) {
      desktopShortcutKeySelect.value = key;
      if (desktopShortcutKeySelect.value !== key) {
        desktopShortcutKeySelect.value = "tab";
      }
    }
    syncDesktopShortcutCaptureInput();
  });

  searchInput?.addEventListener("input", () => setSearchQuery(searchInput.value));
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSearchResult(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  });
  searchPrevious?.addEventListener("click", () => moveSearchResult(-1));
  searchNext?.addEventListener("click", () => moveSearchResult(1));
  searchClose?.addEventListener("click", closeSearch);

  attachmentToggle?.addEventListener("click", openAttachmentDialog);
  attachmentClose?.addEventListener("click", closeAttachmentDialog);
  attachmentBackdrop?.addEventListener("click", (event) => {
    if (event.target === attachmentBackdrop) {
      closeAttachmentDialog();
    }
  });
  attachmentClipboard?.addEventListener("click", () => {
    importAttachmentFromClipboard();
  });
  attachmentFile?.addEventListener("click", selectAttachmentFiles);
  attachmentDownload?.addEventListener("click", openAttachmentBrowser);
  attachmentBrowserClose?.addEventListener("click", () => closeAttachmentBrowser());
  attachmentBrowserCancel?.addEventListener("click", () => closeAttachmentBrowser());
  attachmentBrowserBackdrop?.addEventListener("click", (event) => {
    if (event.target === attachmentBrowserBackdrop) {
      closeAttachmentBrowser();
    }
  });
  attachmentBrowserBack?.addEventListener("click", () => {
    closeAttachmentBrowser();
  });
  attachmentBrowserBreadcrumbs?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".attachment-browser-breadcrumb[data-path]") : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return;
    }
    loadAttachmentBrowserPath(button.dataset.path || "/").catch((error) => setAttachmentBrowserFeedback(error.message || "文件列表读取失败。", "error"));
  });
  attachmentBrowserSortbar?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-attachment-sort-key]") : null;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    cycleAttachmentBrowserSort(button.dataset.attachmentSortKey);
    renderAttachmentBrowserList();
    updateAttachmentBrowserControls();
  });
  attachmentBrowserBackdrop?.addEventListener("touchstart", handleAttachmentBrowserTouchStart, { passive: true });
  attachmentBrowserBackdrop?.addEventListener("touchmove", handleAttachmentBrowserTouchMove, { passive: false });
  attachmentBrowserBackdrop?.addEventListener("touchend", resetAttachmentBrowserEdgeSwipe, { passive: true });
  attachmentBrowserBackdrop?.addEventListener("touchcancel", resetAttachmentBrowserEdgeSwipe, { passive: true });
  attachmentBrowserList?.addEventListener("click", (event) => {
    const target = event.target;
    const dirButton = target instanceof Element ? target.closest(".attachment-browser-file-main[data-path]") : null;
    if (dirButton?.closest?.('.attachment-browser-item[data-type="dir"]')) {
      loadAttachmentBrowserPath(dirButton.dataset.path || "").catch((error) => setAttachmentBrowserFeedback(error.message || "文件列表读取失败。", "error"));
      return;
    }
    const fileButton = target instanceof Element ? target.closest(".attachment-browser-file-main[data-path]") : null;
    if (fileButton && !fileButton.closest?.('.attachment-browser-item[data-type="dir"]')) {
      triggerAttachmentDownload([fileButton.dataset.path || ""]);
      closeAttachmentBrowser({ focusTerminal: true });
    }
  });
  attachmentBrowserList?.addEventListener("change", (event) => {
    const input = event.target instanceof Element ? event.target.closest(".attachment-browser-check") : null;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (input.checked) {
      attachmentBrowserSelectedPaths.add(input.value);
    } else {
      attachmentBrowserSelectedPaths.delete(input.value);
    }
    updateAttachmentBrowserControls();
  });
  attachmentBrowserDownload?.addEventListener("click", downloadSelectedAttachmentFiles);
  attachmentFileInput?.addEventListener("change", () => {
    const files = Array.from(attachmentFileInput.files || []);
    if (attachmentFileInput) {
      attachmentFileInput.value = "";
    }
    uploadAttachments(files, { source: "file", clipboardReservation: consumeAttachmentClipboardReservation() });
  });
  attachmentFileInput?.addEventListener("cancel", cancelAttachmentClipboardReservation);

  dialogPanel?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (dialogBackdrop?.dataset.mode === "prompt") {
      closeDialog(dialogInput?.value || "");
      return;
    }
    closeDialog(true);
  });
  dialogCancel?.addEventListener("click", () => closeDialog(dialogBackdrop?.dataset.mode === "prompt" ? null : false));
  dialogBackdrop?.addEventListener("click", (event) => {
    if (event.target === dialogBackdrop) {
      closeDialog(dialogBackdrop.dataset.mode === "prompt" ? null : false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (deviceBackdrop && !deviceBackdrop.hidden && event.key === "Escape") {
      event.preventDefault();
      closeDevicePanel();
      return;
    }
    if (mobileCustomSelectState && event.key === "Escape") {
      event.preventDefault();
      closeMobileCustomSelect({ focus: true });
      return;
    }
    if (serviceForwardEditor && !serviceForwardEditor.hidden && event.key === "Escape") {
      event.preventDefault();
      resetServiceForwardForm();
      return;
    }
    if (mobileShortcutEditor && !mobileShortcutEditor.hidden && event.key === "Escape") {
      event.preventDefault();
      closeMobileShortcutEditor();
      return;
    }
    if (isAttachmentDialogOpen() && event.key === "Escape") {
      event.preventDefault();
      closeAttachmentDialog();
      return;
    }
    if (isAttachmentBrowserOpen() && event.key === "Escape") {
      event.preventDefault();
      closeAttachmentBrowser();
      return;
    }
    if (dialogResolve && event.key === "Escape") {
      event.preventDefault();
      closeDialog(dialogBackdrop?.dataset.mode === "prompt" ? null : false);
    }
  }, true);

  tabsEl.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      tabsEl.scrollLeft += event.deltaY;
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("touchstart", handleMobileOverviewEdgeSwipeStart, { capture: true, passive: true });
  document.addEventListener("touchmove", handleMobileOverviewEdgeSwipeMove, { capture: true, passive: false });
  document.addEventListener("touchend", resetMobileOverviewEdgeSwipe, { capture: true, passive: true });
  document.addEventListener("touchcancel", resetMobileOverviewEdgeSwipe, { capture: true, passive: true });

  tabOverviewToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    openTabOverview();
  });

  tabOverviewClose?.addEventListener("click", (event) => {
    event.preventDefault();
    closeTabOverview();
  });

  tabOverviewNewTab?.addEventListener("click", (event) => {
    event.preventDefault();
    createUserTab()
      .then(() => closeTabOverview())
      .catch((error) => showToast(error.message));
  });

  tabOverview?.addEventListener("click", (event) => {
    if (performance.now() < tabOverviewSuppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    if (target === tabOverview || target === tabOverviewGrid) {
      closeTabOverview();
      return;
    }
    const closeButton = target instanceof Element ? target.closest("[data-tab-overview-close]") : null;
    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();
      closeTabFromOverview(closeButton.dataset.tabOverviewClose);
      return;
    }
    const cardButton = target instanceof Element ? target.closest(".tab-overview-card-main") : null;
    if (cardButton) {
      selectTabFromOverview(cardButton.dataset.tabId);
      return;
    }
    const card = target instanceof Element ? target.closest(".tab-overview-card") : null;
    if (card) {
      selectTabFromOverview(card.dataset.tabId);
      return;
    }
    if (target instanceof Element && !target.closest(".tab-overview-header")) {
      closeTabOverview();
    }
  });

  selectionSheet?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-selection-action]");
    if (!button) {
      return;
    }
    const action = button.dataset.selectionAction;
    if (action === "copy") {
      copyFromSession().catch((error) => showToast(error.message));
    } else if (action === "paste") {
      pasteIntoSession().catch((error) => showToast(error.message));
    } else if (action === "search") {
      openSearchFromSelection();
    } else if (action === "clear") {
      const session = activeSession();
      session?.term?.clearSelection?.();
      if (session) {
        session.selectAllBufferActive = false;
      }
      updateSelectionSheet();
    }
  });

  mobileActionSheetScrim?.addEventListener("click", () => closeMobileActionSheet());
  mobileActionSheetHandle?.addEventListener("click", () => closeMobileActionSheet());
  mobileCloseConfirmScrim?.addEventListener("click", () => closeMobileCloseConfirm(false));
  mobileCloseConfirmHandle?.addEventListener("click", () => closeMobileCloseConfirm(false));
  mobileCloseConfirmCancel?.addEventListener("click", () => closeMobileCloseConfirm(false));
  mobileCloseConfirmOK?.addEventListener("click", () => closeMobileCloseConfirm(true));
  mobileActionGrid?.addEventListener("click", (event) => {
    if (performance.now() < mobileActionSheetIgnoreClicksUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    const item = target instanceof Element ? target.closest(".mobile-action-item") : null;
    if (!item || item.disabled) {
      return;
    }
    runMobileContextAction(item.dataset.action);
  });

  contextMenu?.addEventListener("click", (event) => {
    const item = event.target.closest(".context-menu-btn");
    if (!item) {
      return;
    }
    runContextAction(item.dataset.action);
  });

  document.addEventListener("pointerdown", recoverVisibleSessionsFromUserGesture, { capture: true, passive: true });
  window.addEventListener("touchstart", preventMobileViewportZoom, { capture: true, passive: false });
  window.addEventListener("touchmove", preventMobileViewportZoom, { capture: true, passive: false });
  window.addEventListener("gesturestart", preventMobileViewportZoom, { capture: true, passive: false });
  window.addEventListener("gesturechange", preventMobileViewportZoom, { capture: true, passive: false });
  window.addEventListener("gestureend", preventMobileViewportZoom, { capture: true, passive: false });
  document.addEventListener("touchstart", preventMobileViewportZoom, { capture: true, passive: false });
  document.addEventListener("touchmove", preventMobileViewportZoom, { capture: true, passive: false });
  document.addEventListener("gesturestart", preventMobileViewportZoom, { capture: true, passive: false });
  document.addEventListener("gesturechange", preventMobileViewportZoom, { capture: true, passive: false });
  document.addEventListener("gestureend", preventMobileViewportZoom, { capture: true, passive: false });
  document.addEventListener("touchstart", recoverVisibleSessionsFromUserGesture, { capture: true, passive: true });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    const terminalPointer = target instanceof Element && Boolean(target.closest(".terminal-host"));
    if (
      !terminalPointer
      && (typeof PointerEvent === "undefined" || !(event instanceof PointerEvent) || !event.pointerType || event.pointerType === "mouse")
    ) {
      reassertTerminalSize(activeSession());
    }
    if (contextMenu && !contextMenu.hidden && target instanceof Node && !contextMenu.contains(target)) {
      closeContextMenu();
    }
    if (
      instanceSwitcherPanel &&
      !instanceSwitcherPanel.hidden &&
      target instanceof Node &&
      !instanceSwitcher?.contains(target)
    ) {
      closeInstanceSwitcher();
    }
  });

  document.addEventListener("keydown", (event) => {
    recoverVisibleSessionsFromUserGesture();
    if (event.key === "Escape") {
      closeContextMenu();
      closeMobileActionSheet();
      closeMobileCloseConfirm(false);
      closeInstanceSwitcher();
      closeAttachmentDialog({ focusTerminal: false });
      closeAttachmentBrowser({ focusTerminal: false });
      closeThemePicker();
      closeSettings();
      closeDevicePanel();
      closeTabOverview();
    }
    handleGlobalShortcutKeydown(event);
  }, true);

  window.addEventListener("pointermove", handleThemePickerScrollbarPointerMove, { passive: false });
  window.addEventListener("pointerup", handleThemePickerScrollbarPointerUp);
  window.addEventListener("pointercancel", handleThemePickerScrollbarPointerUp);
  window.addEventListener("resize", () => {
    syncMobileVisualViewport();
    if (!isTouchShortcutLayout()) {
      closeMobileActionSheet();
    } else if (mobileActionSheet && !mobileActionSheet.hidden) {
      renderMobileActionSheet();
    }
    syncMobileCustomSelectPosition();
    if (!isMobileLayout()) {
      closeMobileCloseConfirm(false);
    }
    measureThemeCardWidth();
    redrawThemePickerOptions();
    scheduleActiveTabWindowResize();
    updateMobileActiveTabTitle();
    updateSelectionSheet();
    if (settingsBackdrop && !settingsBackdrop.hidden) {
      syncSettingsMobileNavigation();
    }
    if (debugModeEnabled && deviceBackdrop && !deviceBackdrop.hidden) {
      refreshDeviceList().catch(() => {});
    }
    ensureMobileOverviewHistoryGuard();
    scheduleTabOverviewRender();
  });
  if (usesMobileViewportInsets()) {
    window.visualViewport?.addEventListener("resize", syncMobileVisualViewport);
    window.visualViewport?.addEventListener("scroll", syncMobileVisualViewport);
  }
  window.addEventListener("orientationchange", handleMobileOrientationChange);
  window.screen?.orientation?.addEventListener?.("change", handleMobileOrientationChange);
  window.visualViewport?.addEventListener("resize", syncMobileCustomSelectPosition);
  window.visualViewport?.addEventListener("scroll", syncMobileCustomSelectPosition);
  syncMobileVisualViewport();
  ensureMobileOverviewHistoryGuard();
  document.fonts?.ready?.then(() => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        refreshTerminalMetrics(pane);
      }
    }
  });
  window.addEventListener("popstate", () => {
    if (openTabOverviewFromHistoryBack()) {
      return;
    }
    const nextParams = new URLSearchParams(window.location.search);
    const nextName = readTargetNameParam(nextParams);
    const nextTab = (nextParams.get("tab") || "").trim();
    if (!nextName) {
      return;
    }
    if (nextName === activeName) {
      if (nextTab && tabs.has(nextTab)) {
        suppressLocationUpdate = true;
        setActiveTab(nextTab);
        suppressLocationUpdate = false;
      }
      return;
    }
    switchInstance(nextName, { updateURL: false }).catch((error) => showToast(error.message));
  });
  window.addEventListener("online", () => {
    setNetworkBanner(false);
    renderTerminalNetworkMonitor();
    showToast("网络已恢复，正在重连。");
    terminalConnectionScheduler?.setOnline(true);
    probeTerminalUnifiedHealth("network_online");
    waitForTerminalPhysicalClosures().then(() => {
      if (disposed || navigator.onLine === false) {
        return;
      }
      terminalUnifiedExpectedCloseReason = "";
      refreshTerminalUnifiedMembership({ reason: "network_online" });
      syncTerminalConnectionDemands({ reason: "network_online" });
      reconnectWorkspaceSessions({ allowHidden: true });
    });
    if (workspaceRefreshRetryContext) {
      scheduleWorkspaceRefreshRetry({ ...workspaceRefreshRetryContext, immediate: true });
    }
    refreshActivity({ silent: true }).catch(() => {});
  });
  window.addEventListener("offline", () => {
    setNetworkBanner(true);
    renderTerminalNetworkMonitor();
    markWorkspaceSessionsOffline();
    closeTerminalUnifiedConnection("network_offline");
    terminalConnectionScheduler?.setOnline(false);
    showToast("网络已断开。");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      rememberWorkspaceRestoreState();
      if (debugModeEnabled) {
        postDeviceHeartbeat().catch(handleDeviceHeartbeatError);
      }
      resizeActiveTab({ forceFullRender: true, hideUntilRender: true });
      claimTerminalSize(activeSession());
      probeTerminalUnifiedHealth("visibility_resume")
        || retryUnavailableTerminalUnifiedTransport("visibility_resume");
      reconnectVisibleSessions({ allowHidden: true, probe: true });
      refreshActivity({ silent: true }).catch(() => {});
      if (debugModeEnabled && deviceBackdrop && !deviceBackdrop.hidden) {
        refreshDeviceList().catch(() => {});
      }
      updateSelectionSheet();
    }
  });
  window.addEventListener("focus", () => {
    resizeActiveTab({ forceFullRender: true });
    claimTerminalSize(activeSession());
    probeTerminalUnifiedHealth("window_focus")
      || retryUnavailableTerminalUnifiedTransport("window_focus");
    reconnectVisibleSessions({ allowHidden: true, probe: true });
    refreshActivity({ silent: true }).catch(() => {});
  });
  window.addEventListener("pageshow", () => {
    rememberWorkspaceRestoreState();
    if (debugModeEnabled) {
      postDeviceHeartbeat().catch(handleDeviceHeartbeatError);
    }
    resizeActiveTab({ forceFullRender: true, hideUntilRender: true });
    claimTerminalSize(activeSession());
    probeTerminalUnifiedHealth("pageshow_resume")
      || retryUnavailableTerminalUnifiedTransport("pageshow_resume");
    reconnectVisibleSessions({ allowHidden: true, probe: true });
    refreshActivity({ silent: true }).catch(() => {});
  });
  window.addEventListener("pagehide", () => {
    rememberWorkspaceRestoreState();
    flushPendingTerminalScrollbackSave();
    touchAllSessionHistoryCaches();
    flushAllSessionHistoryCaches();
    sendDeviceOfflineBeacon();
  });
  window.addEventListener("beforeunload", (event) => {
    rememberWorkspaceRestoreState();
    flushPendingTerminalScrollbackSave();
    touchAllSessionHistoryCaches();
    flushAllSessionHistoryCaches();
    if (!suppressBeforeUnloadOnce && hasCachedBusyPane()) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
    disposed = true;
    tabActivationScheduler.dispose();
    closeTerminalUnifiedConnection("page_disposed");
    instancesLoader.dispose();
    clearWorkspaceRefreshRetry();
    stopPerformanceMeter();
    stopTerminalNetworkMonitor();
    syncDebugLogCapture();
    sendDeviceOfflineBeacon();
    window.clearInterval(workspaceRestoreHeartbeatTimer);
    stopDeviceHeartbeat();
    stopDeviceListRefresh();
    if (serverRevisionInitialCheckTimer) {
      window.clearTimeout(serverRevisionInitialCheckTimer);
      serverRevisionInitialCheckTimer = 0;
    }
    for (const tab of tabs.values()) {
      if (tab.resizeFrame) {
        window.cancelAnimationFrame(tab.resizeFrame);
        tab.resizeFrame = 0;
      }
      for (const pane of tab.panes.values()) {
        pane.closed = true;
        pane.replayController?.reset();
        pane.queueReplayControllerActive = false;
        pane.queueReplayControllerLegacy = false;
        terminalConnectionScheduler?.unregister(pane, "page_disposed");
        if (pane.connectionPriorityTimer) {
          window.clearTimeout(pane.connectionPriorityTimer);
          pane.connectionPriorityTimer = 0;
        }
        clearPaneFullRenderValidation(pane);
        clearReconnectTimer(pane);
        clearSessionConnectionTimers(pane);
      }
    }
  });
  workspaceRestoreHeartbeatTimer = window.setInterval(() => {
    rememberWorkspaceRestoreState();
    touchAllSessionHistoryCaches();
  }, 5 * 1000);

  registerWebShellServiceWorker();
  document.addEventListener("pointerdown", () => {
    requestTerminalStoragePersistence().catch(() => {});
  }, { capture: true, once: true });

  terminalHistoryCache.cleanupExpired().catch(() => {});
  terminalCacheV2.cleanup().catch(() => {});

  scheduleInitialServerRevisionCheck();

  bootstrap().catch((error) => {
    const message = error.message || "WebShell startup failed.";
    appendDebugError("WebShell 启动失败", message);
    showToast(message);
    showStartupErrorPanel(message);
    setActiveInstanceName("");
    renderInstanceSwitcher();
    createTab({ label: "Error", focus: true, connect: false });
    const tab = currentTab();
    const pane = tab?.panes.get(tab.activePaneId);
    pane?.term?.write(`\r\n[webshell error]\r\n${message}\r\n`);
  });
})();
