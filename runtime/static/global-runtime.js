// Global runtime boundary.
//
// This file is the sole owner of application-wide state, startup ordering,
// page lifecycle wiring, recovery and teardown ordering. Feature behavior is
// implemented by the controllers imported below; this layer only creates
// them, passes explicit dependencies and coordinates their public APIs.
import { FitAddon, Terminal, init as initGhostty } from "./ghostty-web.js";
import {
  installClaudeFullscreenContextMenuAdapter,
  isClaudeFullscreenContextMenuCandidate,
  installClaudeFullscreenDesktopSelectionAdapter,
  isClaudeFullscreenDesktopSelectionCandidate,
  installClaudeFullscreenTouchAdapter,
  createTerminalTUIAdapterInstaller,
  installGrokFullscreenContextMenuAdapter,
  installGrokFullscreenDesktopSelectionAdapter,
  installGrokFullscreenTouchAdapter,
  installHerdrFullscreenTouchAdapter,
  installOpencodeFullscreenTouchAdapter,
  installPiFullscreenTouchAdapter,
  isClaudeFullscreenTouchCandidate,
  isGrokFullscreenContextMenuCandidate,
  isGrokFullscreenDesktopSelectionCandidate,
  isGrokFullscreenTouchCandidate,
  isHerdrFullscreenTouchCandidate,
  isOpencodeFullscreenTouchCandidate,
  isPiFullscreenTouchCandidate,
} from "./terminal/tui_adapters/index.js";
import {
  createDiagnosticsController,
  createDiagnosticsNetworkContext,
  createStartupDiagnostics,
} from "./diagnostics/index.js";
import { createDevicesController } from "./devices/index.js";
import { createServiceForwardingController } from "./service_forwarding/index.js";
import { createAttachmentsController } from "./attachments/index.js";
import {
  createInstancesController,
  isClientInstanceName,
  readInstanceTargetName,
} from "./instances/index.js";
import {
  createAppearanceController,
  createAppearanceRuntimeController,
} from "./appearance/index.js";
import {
  DEFAULT_TERMINAL_FONT_FAMILY as defaultTerminalFontFamily,
  DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT as defaultTerminalLineHeightPercent,
  DEFAULT_TERMINAL_SCROLLBACK as defaultTerminalScrollback,
  applyStickyModifierInput,
  canApplyStickyModifierInput,
  createSettingsController,
  normalizeMobileShortcutTextData,
  normalizeTerminalLineHeightPercent,
  readStoredTerminalFontSize,
  resolveMobileShortcutInputData,
} from "./settings/index.js";
import {
  ClientTerminalReplayAdapter,
  TerminalReplayController,
  createClientTerminalHistoryController,
  createTerminalHistoryCache,
  createTerminalSessionReplayController,
  terminalCheckpointCapabilitiesForTerminal,
} from "./terminal/history/index.js";
import {
  buildTerminalLogicalLines as buildLogicalLines,
  createTerminalClipboardController,
  createTerminalContextMenuController,
  createTerminalLinkController,
  createTerminalSearchController,
  terminalFullBufferText,
} from "./terminal/interaction/index.js";
import { createTerminalOverviewController } from "./terminal/overview/index.js";
import {
  createTerminalPresentationController,
  createTerminalRendererAdapter,
  createTerminalRuntimeController,
  installKittyGraphicsSupport,
  isKittyGraphicsResponse,
  terminalPixelSize,
} from "./terminal/rendering/index.js";
import {
  createTerminalResizeController,
} from "./terminal/resize/index.js";
import { createTerminalMobileViewportController } from "./terminal/viewport/index.js";
import {
  createTerminalOutputController,
} from "./terminal/output/index.js";
import {
  createTerminalInputController,
  createTerminalIMEController,
  createTerminalKeyOverridesController,
  createMobileShortcutsController,
  isAndroidPlatform,
  isIOSPlatform,
} from "./terminal/input/index.js";
import { createTerminalLongScreenshot } from "./terminal/screenshot/index.js";
import { createTerminalMouseController } from "./terminal/mouse/index.js";
import { createTerminalSelectionController } from "./terminal/selection/index.js";
import { createTerminalPolicyController } from "./terminal/policy/index.js";
import { createTerminalMetricsController } from "./terminal/metrics/index.js";
import {
  TERMINAL_RUNTIME_CONFIG,
  TERMINAL_STORAGE_PREFIX,
} from "./terminal/config/index.js";
import {
  createTerminalSessionController,
  createTerminalSessionInstallationController,
  createTerminalSessionResourceFactory,
  createTerminalSessionRecoveryController,
  createTerminalStartupErrorController,
} from "./terminal/session/index.js";
import {
  createTerminalSessionConnectionController,
  createTerminalSessionProtocolController,
  createTerminalTransportRuntimeController,
  createTerminalUnifiedTransportController,
  createTerminalThemeController,
  decodeFastBinaryFrame,
  terminalUnifiedWebSocketURL,
  terminalWebSocketURL,
} from "./terminal/transport/index.js";
import {
  createWorkspaceLayoutController,
  createWorkspaceLayoutViewController,
  createWorkspacePaneActivationController,
  createWorkspaceRefreshController,
  createWorkspaceStateApplyController,
  createWorkspaceTabActivationController,
  createWorkspaceTabController,
  createWorkspaceTabRegistry,
  createWorkspaceTabView,
  createWorkspaceTargetController,
  createWorkspaceActivityController,
  createWorkspaceAPI,
  createWorkspacePersistenceController,
  createWorkspacePresentationController,
  createWorkspaceTabLabelController,
  createWorkspaceTabNavigationController,
  ensureWorkspaceResponseSelector as ensureResponseSelector,
  restoreInitialWorkspaceLocation,
  workspaceResponseSelector as responseSelector,
} from "./workspace/index.js";
import {
  createAppBootstrapController,
  createLegacyWebShellStorageCleanupController,
  createAppCommandController,
  createAppDOMRegistry,
  createAppFeedbackController,
  createAppLayoutController,
  createAppLifecycle,
  createAppFileDropController,
  createAppPasteController,
  createAgentProtocolUpdateController,
  createAppRuntimeRecoveryController,
  createAppShortcutController,
  createDialogController,
  createMobileSelectController,
  createServerRevisionController,
} from "./app/index.js";
import { createSVGIconFactory } from "./ui/icons/index.js";
import { createI18nRuntime } from "./i18n.js";
import {
  isIndependentClient,
  openConfigurationPage,
} from "./vendor/lzc-mobile-bridge-0.0.2.js";

installKittyGraphicsSupport(Terminal);

const ghosttyWASMURL = new URL("./ghostty-vt.wasm", import.meta.url).toString();
const params = new URLSearchParams(globalThis.window?.location?.search || "");

export function startGlobalRuntime() {
  const i18n = createI18nRuntime({
    root: document,
    autoApply: true,
    observe: true,
  });
  if (typeof globalThis !== "undefined") {
    globalThis.$t = i18n.t;
  }
  restoreInitialWorkspaceLocation({ windowObject: window, searchParams: params });
  const isEmbedMode = params.has("embed");
  document.body?.classList.toggle("is-embed-mode", isEmbedMode);
  const startupDiagnostics = createStartupDiagnostics();
  const markWebShellStartupMetric = startupDiagnostics.mark;
  const serverLogSinceUnixMS = Date.now();
  const ghosttyInitPromise = initGhostty(ghosttyWASMURL).then(() => {
    markWebShellStartupMetric("ghosttyReadyAt");
    startupDiagnostics.trace("Ghostty WASM 已就绪");
  });

  return (async () => {
  const domRegistry = createAppDOMRegistry({ documentObject: document });
  const {
    workspace: {
      tabs: tabsEl,
      newTabButton,
      mobileActiveTabTitle,
      terminalArea,
      emptyState,
      emptyStateAction,
    },
    agentProtocolUpdate: {
      notice: agentProtocolUpdateNotice,
    },
    startup: {
      errorPanel: startupErrorPanel,
      errorText: startupErrorText,
      networkBanner,
      toast,
    },
    dialog: {
      backdrop: dialogBackdrop,
      panel: dialogPanel,
      title: dialogTitle,
      message: dialogMessage,
      input: dialogInput,
      cancel: dialogCancel,
      ok: dialogOK,
    },
    mobile: {
      shortcuts: mobileShortcuts,
      closeConfirmSheet: mobileCloseConfirmSheet,
      closeConfirmScrim: mobileCloseConfirmScrim,
      closeConfirmHandle: mobileCloseConfirmHandle,
      closeConfirmTitle: mobileCloseConfirmTitle,
      closeConfirmMessage: mobileCloseConfirmMessage,
      closeConfirmActions: mobileCloseConfirmActions,
      closeConfirmCancel: mobileCloseConfirmCancel,
      closeConfirmOK: mobileCloseConfirmOK,
    },
  } = domRegistry;

  const workspaceTabRegistry = createWorkspaceTabRegistry();
  const tabs = workspaceTabRegistry.tabs;
  const getActiveTabId = () => workspaceTabRegistry.getActiveTabId();
  const getAllSessions = () => Array.from(tabs.values()).flatMap((tab) => Array.from(tab.panes.values()));
  const storagePrefix = TERMINAL_STORAGE_PREFIX;
  const {
    touchShortcutMoveThresholdPx,
    touchSelectionMoveThresholdPx,
    touchSelectionLongPressDelayMs,
    mobileSelectionAutoScrollEdgePx,
    mobileSelectionAutoScrollIntervalMs,
    mobileSelectionAutoScrollMaxLines,
    mobileKeyboardDoubleTapDelayMs,
    mobileKeyboardFocusPrompt,
    desktopSelectionCopyMoveThresholdPx,
    terminalSizeReassertIntervalMs,
    terminalSizeClaimIntervalMs,
    terminalCursorBlinkHoldMs,
    terminalWebSocketPingIntervalMs,
    terminalUnifiedHealthCheckIntervalMs,
    terminalUnifiedPongTimeoutMs,
    terminalUnifiedTransitionTimeoutMs,
    terminalWebSocketConnectTimeoutMs,
    terminalClientDirectWebSocketCapacity,
    terminalConnectionInteractionPriorityMs,
    terminalUnifiedPaneRetryBaseDelayMs,
    terminalUnifiedPaneRetryMaxDelayMs,
    terminalWebSocketHealthTimeoutMs,
    terminalResumeProbeTimeoutMs,
    terminalResumeDeadlineMs,
    terminalUserRecoveryThrottleMs,
    terminalAttachReadyTimeoutMs,
    terminalAgentPrepareTimeoutMs,
    terminalReconnectBaseDelayMs,
    terminalReconnectMaxDelayMs,
    terminalReconnectJitterRatio,
    terminalResizeThrottleMs,
    terminalResizeSettleMs,
    terminalResizeOutputQuietMs,
    terminalResizeOutputMaxHoldMs,
    terminalReplayFailureLimit,
    terminalReplayCheckpointDelayMs,
    terminalHistoryCacheFlushBytes,
    terminalHistoryCacheFlushDelayMs,
    terminalHistoryCacheOrphanTTL,
    averageTerminalHistoryBytesPerLine,
    activityPollIntervalMs,
  } = TERMINAL_RUNTIME_CONFIG;
  const initialTerminalFontSize = readStoredTerminalFontSize(window.localStorage, storagePrefix);
  const terminalOptionsBase = {
    cursorBlink: false,
    convertEol: true,
    scrollback: defaultTerminalScrollback,
    fontFamily: defaultTerminalFontFamily,
    fontSize: initialTerminalFontSize,
  };
  const initialActiveName = readInstanceTargetName(params);
  let workspaceTargetController = null;
  const getActiveName = () => workspaceTargetController?.getActiveName() ?? initialActiveName;
  const getActiveGeneration = () => workspaceTargetController?.getGeneration() ?? 0;
  const setActiveInstanceName = (name) => workspaceTargetController?.setActiveName(name) ?? 0;
  let activeWorkspaceGeneration = "";
  const getWorkspaceGeneration = () => activeWorkspaceGeneration;
  const setWorkspaceGenerationFromState = (state) => {
    const next = String(state?.workspace_generation || "").trim();
    if (next === activeWorkspaceGeneration) {
      return false;
    }
    activeWorkspaceGeneration = next;
    return true;
  };
  const isCurrentInstanceRequest = (name, generation) => (
    workspaceTargetController?.isCurrentRequest(name, generation)
      ?? (String(name || "").trim() === initialActiveName && generation === 0)
  );
  const isCurrentInstanceSession = (session) => workspaceTargetController?.isCurrentSession(session)
    ?? (Boolean(String(session?.name || "").trim()) && String(session.name).trim() === initialActiveName);
  const switchInstance = (name, options) => (
    workspaceTargetController?.switchTo(name, options) || Promise.resolve(false)
  );
  let disposed = false;
  let terminalSessionConnection = null;
  let terminalSessionProtocol = null;
  let terminalUnifiedTransport = null;
  let terminalTransportRuntime = null;
  let terminalSessionController = null;
  let terminalSessionInstallation = null;
  let sessionRecovery = null;
  let terminalStartupError = null;
  let terminalOverview = null;
  let terminalInteraction = null;
  let terminalSearch = null;
  let terminalClipboard = null;
  let terminalLinks = null;
  let terminalMouse = null;
  let terminalPresentation = null;
  let terminalRenderer = null;
  let terminalRuntime = null;
  let terminalResize = null;
  let terminalViewport = null;
  let terminalOutput = null;
  let terminalReplay = null;
  let terminalInput = null;
  let terminalKeyOverrides = null;
  let terminalIME = null;
  let mobileShortcutsController = null;
  let terminalSelection = null;
  let terminalPolicy = null;
  let terminalMetrics = null;
  let terminalTheme = null;
  let terminalTUIAdapterInstaller = null;
  let appearanceRuntime = null;
  let appLifecycle = null;
  let runtimeRecovery = null;
  let appBootstrap = null;
  let legacyStorageCleanup = null;
  let shortcutController = null;
  let appCommands = null;
  let appPaste = null;
  let appFileDrop = null;
  let workspaceLayoutView = null;
  let workspaceLayout = null;
  let workspacePaneActivation = null;
  let workspaceActivity = null;
  let workspaceTabLabels = null;
  let workspacePresentation = null;
  let workspaceTabNavigation = null;
  let workspaceTabActivation = null;
  let workspaceTabController = null;
  let workspaceTabView = null;
  let workspaceAPI = null;
  let workspaceRefresh = null;
  const closeContextMenu = () => terminalInteraction?.close();
  const closeMobileActionSheet = () => terminalInteraction?.closeMobile();
  const openMobileActionSheet = () => terminalInteraction?.openMobile();
  const renderMobileActionSheet = () => terminalInteraction?.refreshMobile();
  const markTerminalTouchContextMenuCandidate = (touch) => terminalInteraction?.markTouchCandidate(touch);
  const shouldSuppressTerminalContextMenu = (event) => terminalInteraction?.shouldSuppressContextMenu(event) === true;
  const clearTerminalRuntimeBuffer = (session) => terminalRuntime?.clearBuffer(session) === true;
  const resetTerminalAfterInitialFit = (session) => terminalRuntime?.resetAfterInitialFit(session) === true;
  const resetTerminalRuntimeState = (session) => terminalRuntime?.reset(session) === true;
  const beginTerminalRenderSuppression = (session, reason) => terminalRuntime?.beginRenderSuppression(session, reason) === true;
  const endTerminalRenderSuppression = (session, options) => terminalRuntime?.endRenderSuppression(session, options) === true;
  const invalidateSessionStartupError = (session, options) => terminalStartupError?.invalidate(session, options) === true;
  const showSessionStartupError = (session, fallback) => terminalStartupError?.show(session, fallback) || Promise.resolve(false);
  const isRetryableTerminalTransportError = (message) => terminalStartupError?.isRetryable(message) === true;
  const setNetworkBanner = (visible, message) => runtimeRecovery?.setNetworkBanner(visible, message) === true;
  const reconnectVisibleSessions = (options) => runtimeRecovery?.reconnectVisibleSessions(options) === true;
  const reconnectWorkspaceSessions = (options) => runtimeRecovery?.reconnectWorkspaceSessions(options) === true;
  const recoverVisibleSessionsFromUserGesture = () => runtimeRecovery?.recoverVisibleSessionsFromUserGesture() === true;
  const setActivePane = (tab, paneId, options) => workspacePaneActivation?.activate(tab, paneId, options) === true;
  const focusPaneAtPoint = (clientX, clientY) => workspacePaneActivation?.focusAtPoint(clientX, clientY) === true;
  let feedback = null;
  let workspaceStateApply = null;
  const isApplyingWorkspaceState = () => workspaceStateApply?.isApplying() === true;
  const applyWorkspaceState = (state, options) => workspaceStateApply?.apply(state, options) || false;
  let serverRevision = null;
  let agentProtocolUpdate = null;
  let suppressBeforeUnloadOnce = false;
  let suppressBeforeUnloadResetTimer = 0;
  let mobileSelect = null;
  let dialogController = null;
  let layoutController = null;
  let settings = null;
  const createUserTab = (...args) => appCommands?.createUserTab(...args) || Promise.resolve(false);
  feedback = createAppFeedbackController({
    windowObject: window,
    toast,
    startupErrorPanel,
    startupErrorText,
  });
  const showToast = (message) => feedback?.showToast(message) === true;
  const showStartupErrorPanel = (message) => feedback?.showStartupError(message) === true;
  const hideStartupErrorPanel = () => feedback?.hideStartupError() === true;
  const workspacePersistence = createWorkspacePersistenceController({
    windowObject: window,
    storagePrefix,
    getActiveName,
    getActiveTabId,
    getActiveGeneration,
    hasTab: (tabId) => tabs.has(tabId),
    isCurrentRequest: (name, generation) => isCurrentInstanceRequest(name, generation),
    getRecentTabIds: () => workspaceTabNavigation?.getRecentTabIds() || [],
    postWorkspaceAction: (action, payload, options) => postWorkspaceAction(action, payload, options),
    updateWorkspaceLocation: (state) => terminalOverview?.updateWorkspaceLocation(state),
  });
  const updateLocationName = (name, options) => workspacePersistence.updateLocationName(name, options);
  const workspaceLocationURL = (name, tabId) => workspacePersistence.workspaceLocationURL(name, tabId);
  const rememberWorkspaceRestoreState = () => workspacePersistence.rememberWorkspaceRestoreState();
  const rememberActiveTab = () => workspacePersistence.rememberActiveTab();
  const readRestartTabForName = (name) => workspacePersistence.readRestartTabForName(name);
  const clearRestartTabForReload = () => workspacePersistence.clearRestartTabForReload();
  const rememberRestartTabForReload = (name, tabId) => workspacePersistence.rememberRestartTabForReload(name, tabId);
  const persistActiveWorkspaceTab = (tabId) => workspacePersistence.persistActiveWorkspaceTab(tabId);

  const terminalOptions = (overrides = {}) => ({
    ...terminalOptionsBase,
    fontSize: settings?.getTerminalFontSize() || initialTerminalFontSize,
    theme: appearance.getTerminalTheme(),
    ...overrides,
  });

  const getDiagnosticsNetworkContext = createDiagnosticsNetworkContext({
    getActiveName,
    isClientInstanceName,
    getTabs: () => tabs.values(),
    getUnifiedTransport: () => terminalUnifiedTransport,
    isOnline: () => navigator.onLine !== false,
  });
  const diagnostics = createDiagnosticsController({
    documentObject: document,
    windowObject: window,
    storage: window.localStorage,
    storagePrefix,
    terminalArea,
    startupDiagnostics,
    getNetworkContext: getDiagnosticsNetworkContext,
    copyText: (text) => terminalClipboard?.copyText(text) || false,
    showToast: (message) => showToast(message),
    onDebugModeChange: () => settings?.syncDebugModeDependents(),
  });
  const {
    appendError: appendDebugError,
    appendLog: appendDebugLog,
    appendStartupTrace,
    appendWarning: appendDebugWarning,
    isDebugLogEnabled,
    isDebugModeEnabled,
    measurePerformanceTask,
    now: performanceTaskNow,
    recordPerformanceTask,
    recordTerminalRuntimeMaxMetric,
    recordTerminalRuntimeMetric,
    recordTerminalSessionEvent,
    refreshNetworkView: renderTerminalNetworkMonitor,
    syncNetworkSockets: syncTerminalNetworkMonitorSockets,
  } = diagnostics;
  if (window.__testsAutoPresentationProbe) {
    window.__testsAutoTerminalTimelineSnapshot = () => getAllSessions().map((session) => ({
      paneID: String(session?.id || ""),
      tabID: String(session?.tabId || ""),
      resize: terminalResize?.snapshot(session) || null,
      inputReady: terminalInput?.isReady(session) === true,
      events: diagnostics.terminalTimelineSnapshot(session),
    }));
  }
  serverRevision = createServerRevisionController({
    windowObject: window,
    navigatorObject: navigator,
    storage: window.localStorage,
    storagePrefix,
    getActiveName,
    getActiveGeneration,
    isCurrentRequest: (name, generation) => isCurrentInstanceRequest(name, generation),
    getActiveTabId,
    isMobileLayout: () => isMobileLayout(),
    openDialog: (options) => openDialog(options),
    confirmMobileSheet: (options) => confirmMobileSheet(options),
    rememberRestartTabForReload: (name, tabId) => rememberRestartTabForReload(name, tabId),
    suppressBeforeUnloadForNavigation: () => suppressBeforeUnloadForNavigation(),
    showToast: (message) => showToast(message),
    appendDebugWarning: (...args) => appendDebugWarning(...args),
    appendDebugError: (...args) => appendDebugError(...args),
  });
  const clientHistory = createClientTerminalHistoryController({
    windowObject: window,
    consoleObject: console,
    historyStore: createTerminalHistoryCache({ orphanTTL: terminalHistoryCacheOrphanTTL }),
    isClientTarget: (name) => isClientInstanceName(name),
    getSessions: () => getAllSessions(),
    getActiveName,
    getHistoryWindowLines: () => terminalOptionsBase.scrollback,
    requestHistoryReplay: (session) => requestSessionHistoryReplay(session),
    averageHistoryBytesPerLine: averageTerminalHistoryBytesPerLine,
    flushBytes: terminalHistoryCacheFlushBytes,
    flushDelayMs: terminalHistoryCacheFlushDelayMs,
  });
  const instances = createInstancesController({
    documentObject: document,
    windowObject: window,
    isEmbedMode,
    getActiveName,
    setActiveName: (name) => setActiveInstanceName(name),
    updateLocation: (name, options) => updateLocationName(name, options),
    onSwitchTarget: (name, options) => switchInstance(name, options),
    onSameTargetNavigation: (nextTab) => {
      if (nextTab && tabs.has(nextTab)) {
        workspacePersistence.withLocationUpdateSuppressed(() => setActiveTab(nextTab));
      }
    },
    consumePopState: () => terminalOverview?.consumeHistoryBack() === true,
    prepareSwitcherOpen: () => {
      closeContextMenu();
      devices.closePanel({ focus: false });
    },
    prepareHomeNavigation: () => {
      devices.closePanel({ focus: false });
      rememberActiveTab();
    },
    commitHomeNavigation: () => {
      workspacePersistence.commitHomeNavigation();
      suppressBeforeUnloadForNavigation();
    },
    rollbackHomeNavigation: () => {
      workspacePersistence.rollbackHomeNavigation();
    },
    getMobileRemoteDesktopEnabled: () => settings?.getMobileRemoteDesktopEnabled() === true,
    showToast: (message) => showToast(message),
  });
  const appearance = createAppearanceController({
    documentObject: document,
    windowObject: window,
    storage: window.localStorage,
    storageKey: `${storagePrefix}.theme`,
    isMobileLayout: () => isMobileLayout(),
    preparePickerOpen: () => {
      closeContextMenu();
      devices.closePanel({ focus: false });
    },
    onPickerBackdropClose: ({ clientX, clientY }) => focusPaneAtPoint(clientX, clientY),
    onThemeChange: (theme, previousTheme) => applyAppearanceThemeToWorkspace(theme, previousTheme),
  });
  const devices = createDevicesController({
    documentObject: document,
    windowObject: window,
    storage: window.localStorage,
    storagePrefix,
    clientID: serverRevision.getClientID(),
    initialDebugMode: isDebugModeEnabled(),
    preparePanelOpen: () => {
      closeContextMenu();
      appearance.closePicker();
      settings?.close();
      instances.closeSwitcher();
    },
    focusTerminal: () => activeSession()?.term?.focus(),
    isMobileLayout: () => isMobileLayout(),
    measureTask: (name, task) => measurePerformanceTask(name, task),
    appendError: (message, details) => appendDebugError(message, details),
  });
  terminalLinks = createTerminalLinkController({
    windowObject: window,
    copyText: (value) => terminalClipboard?.copyText(value) || Promise.resolve(false),
    showToast: (message) => showToast(message),
  });
  const serviceForwarding = createServiceForwardingController({
    documentObject: document,
    windowObject: window,
    getTarget: () => {
      return {
        selector: getActiveName(),
        displayName: instances.getActiveDisplayName(),
      };
    },
    setFeedback: (message, tone) => settings?.setFeedback(message, tone),
    confirmDelete: (message, options) => confirmDialog(message, options),
    openURL: (url) => terminalLinks.open(url),
    closeSelect: () => closeMobileCustomSelect(),
  });
  const attachments = createAttachmentsController({
    documentObject: document,
    windowObject: window,
    getContext: () => ({
      targetName: getActiveName(),
      isClient: isClientInstanceName(getActiveName()),
      cwd: activeSession()?.cwd || "",
      tabId: currentTab()?.id || "",
      activeTabId: getActiveTabId(),
      searchOpen: terminalSearch?.isOpen() === true,
    }),
    getTabHost: (tabId) => tabs.get(tabId)?.paneEl || null,
    prepareOverlayOpen: () => {
      closeContextMenu();
      instances.closeSwitcher();
      devices.closePanel({ focus: false });
    },
    focusTerminal: () => terminalIME?.focusForNativePaste(),
    showToast: (message) => showToast(message),
    copyText: (text) => terminalClipboard?.copyText(text) || false,
    isMobileLayout: () => isMobileLayout(),
    measureTask: (name, task) => measurePerformanceTask(name, task),
    recordPerformanceTask: (name, duration) => recordPerformanceTask(name, duration),
    now: () => performanceTaskNow(),
  });

  settings = createSettingsController({
    documentObject: document,
    windowObject: window,
    navigatorObject: navigator,
    storage: window.localStorage,
    storagePrefix,
    isMobileLayout: () => isMobileLayout(),
    isDebugModeEnabled: () => isDebugModeEnabled(),
    prepareOpen: () => {
      closeContextMenu();
      appearance.closePicker();
      devices.closePanel({ focus: false });
      instances.closeSwitcher();
    },
    closeCustomSelect: () => closeMobileCustomSelect(),
    confirmAction: (message, options) => confirmDialog(message, options),
    focusTerminal: () => activeSession()?.term?.focus(),
    showToast: (message) => showToast(message),
    measureTask: (name, task) => measurePerformanceTask(name, task),
    renderThemeSettings: () => appearance.renderSettingsThemes(),
    hideThemeScrollbar: () => appearance.hideSettingsScrollbar(),
    openThemePicker: () => appearance.openPicker(),
    renderServiceForwarding: () => serviceForwarding.render(),
    setServiceForwardingSelected: (selected) => serviceForwarding.setSelected(selected),
    closeServiceForwardingEditor: () => serviceForwarding.closeEditor(),
    syncDebugControls: () => {
      diagnostics.syncControls();
      devices.syncControls();
    },
    onDebugModeDependents: (enabled) => devices.setDebugMode(enabled),
    onTerminalFontFamilyChange: (fontFamily) => terminalMetrics?.applyFontFamily(fontFamily),
    onTerminalFontSizeChange: (fontSize) => terminalMetrics?.applyFontSize(fontSize),
    onTerminalScrollbackChange: (previousScrollback, nextScrollback) => (
      terminalMetrics?.applyScrollbackChange(previousScrollback, nextScrollback)
    ),
    onTerminalLineHeightChange: (value, previousValue) => terminalMetrics?.applyLineHeight(value, previousValue),
    onDesktopShortcutsBarChange: () => terminalResize?.resizeActiveTabForCurrentDevice(),
    onMobilePixelScrollChange: (enabled) => terminalMetrics?.applyMobilePixelScroll(enabled),
    onMobileDoubleTapReminderChange: () => updateMobileActiveTabTitle(),
    onMobileShortcutsChange: () => mobileShortcutsController?.render(),
    onForcePCModeChange: () => syncForcePCModeState(),
    isIndependentClient: () => isIndependentClient(),
    openClientSettings: () => {
      instances.closeSwitcher();
      return openConfigurationPage();
    },
  });

  terminalReplay = createTerminalSessionReplayController({
    windowObject: window,
    getActiveName,
    isClientTarget: (name) => isClientInstanceName(name),
    hasQueuedOutput: (session) => terminalOutput?.hasQueued(session) === true,
    flushCache: (session) => clientHistory.flushSession(session),
    disableCache: (session, error) => clientHistory.disableSession(session, error),
    endRenderSuppression: (session, options) => endTerminalRenderSuppression(session, options),
    clearOutputOverload: (session) => terminalOutput?.clearOverload(session),
    clearAttachReadyTimer: (session) => terminalSessionConnection?.clearAttachReadyTimer(session),
    appendDebugLog: (...args) => appendDebugLog(...args),
    appendDebugError: (...args) => appendDebugError(...args),
    describeSession: (session) => terminalLocationDescription(session),
    clearUnifiedRetry: (session, options) => terminalTransportRuntime?.clearUnifiedRetry(session, options),
    isActivePane: (session) => (
      session?.tabId === getActiveTabId()
      && tabs.get(getActiveTabId())?.activePaneId === session.id
    ),
    hideStartupError: () => hideStartupErrorPanel(),
    notifyDirectReplayReady: (session, leaseID) => terminalTransportRuntime?.notifyDirectReplayReady(session, leaseID),
    setPresentationReady: (session, ready) => terminalPresentation?.setReady(session, ready),
    ensurePresentation: (session, options) => terminalPresentation?.ensure(session, options),
    flushPendingInput: (session) => terminalInput?.flushPending(session),
    syncConnectionDemands: (options) => terminalTransportRuntime?.syncConnectionDemands(options),
    beginPresentationHold: (session) => terminalPresentation?.beginHold(session),
    isMeasurable: (session) => terminalResize?.isMeasurable(session) === true,
    canvasMatchesExpectedSize: (session) => terminalResize?.canvasMatchesExpectedSize(session) === true,
    recordEvent: (session, event, details) => recordTerminalSessionEvent(session, event, details),
    replayFailureLimit: terminalReplayFailureLimit,
    checkpointDelayMs: terminalReplayCheckpointDelayMs,
  });

  terminalSessionConnection = createTerminalSessionConnectionController({
    windowObject: window,
    consoleObject: console,
    getActiveName,
    getDisposed: () => disposed,
    isCurrentSession: (session) => isCurrentInstanceSession(session),
    isOnline: () => navigator.onLine !== false,
    setNetworkBanner: (visible) => setNetworkBanner(visible),
    isReplayRetryPaused: (session) => terminalReplay.isRetryPaused(session),
    isReplayCommitted: (session) => terminalReplay.isCommitted(session),
    recycleUnifiedSession: (session, reason, options) => terminalTransportRuntime?.recycleUnifiedSession(session, reason, options),
    getCurrentLease: (session) => terminalTransportRuntime?.currentLease(session) || null,
    notifyConnectionFailure: (session, leaseID, error, options) => (
      terminalTransportRuntime?.notifyDirectFailure(session, leaseID, error, options) === true
    ),
    requestConnection: (session, options) => terminalTransportRuntime?.requestConnection(session, options),
    connectPendingSession: (session, options) => terminalTransportRuntime?.connectPendingSession(session, options),
    scheduleUnifiedSync: (options) => terminalTransportRuntime?.scheduleUnifiedSync(options),
    isInputReady: (session) => terminalInput?.isReady(session) === true,
    isActivePane: (session) => (
      session?.tabId === getActiveTabId()
      && tabs.get(session.tabId)?.activePaneId === session.id
    ),
    appendDebugError: (...args) => appendDebugError(...args),
    showStartupError: (session, fallback) => showSessionStartupError(session, fallback),
    describeSession: (session) => terminalLocationDescription(session),
    flushPendingInput: (session) => terminalInput?.flushPending(session),
    now: () => Date.now(),
    isSocketOpen: (socket) => socket?.readyState === WebSocket.OPEN,
    isSocketConnecting: (socket) => socket?.readyState === WebSocket.CONNECTING,
    pingIntervalMs: terminalWebSocketPingIntervalMs,
    healthTimeoutMs: terminalWebSocketHealthTimeoutMs,
    resumeProbeTimeoutMs: terminalResumeProbeTimeoutMs,
    connectTimeoutMs: terminalWebSocketConnectTimeoutMs,
    attachReadyTimeoutMs: terminalAttachReadyTimeoutMs,
    agentPrepareTimeoutMs: terminalAgentPrepareTimeoutMs,
  });

  terminalUnifiedTransport = createTerminalUnifiedTransportController({
    windowObject: window,
    buildConnectionURL: (targetName) => {
      const url = terminalUnifiedWebSocketURL(targetName, {
        windowObject: window,
        clientID: serverRevision.getClientID(),
      });
      if (isDebugLogEnabled()) {
        url.searchParams.set("server_logs", "1");
        url.searchParams.set("server_log_since_ms", String(serverLogSinceUnixMS));
      }
      return url.toString();
    },
    getDisposed: () => disposed,
    isOnline: () => navigator.onLine !== false,
    isClientTarget: (name) => isClientInstanceName(name),
    getActiveName,
    getSessions: () => getAllSessions(),
    getMembershipPaneIDs: () => terminalTransportRuntime?.snapshot().membership.paneIDs || [],
    refreshMembership: (options) => terminalTransportRuntime?.refreshMembership(options),
    reconnectWorkspaceSessions: (options) => reconnectWorkspaceSessions(options),
    scheduleLogicalSync: (options) => terminalTransportRuntime?.scheduleUnifiedSync(options),
    invalidateStartupError: (session, options) => invalidateSessionStartupError(session, options),
    syncNetworkMonitor: () => syncTerminalNetworkMonitorSockets(),
    appendDebugWarning: (...args) => appendDebugWarning(...args),
    appendDebugError: (...args) => appendDebugError(...args),
    onPhysicalEvent: ({ type, ...details } = {}) => {
      if (type === "physical_websocket_create_start") {
        agentProtocolUpdate?.beginTarget(details.targetName);
      } else if (type === "physical_server_ready") {
        agentProtocolUpdate?.observe(details);
      }
      const eventNames = {
        physical_websocket_create_start: "物理 WebSocket 创建开始",
        physical_websocket_open: "物理 WebSocket 已打开",
        logical_subscriptions_sent: "逻辑层订阅已发送",
        physical_server_agent_prepare_start: "物理通道服务端 Agent 准备开始",
        physical_server_ready: "物理通道服务端已就绪",
      };
      const name = eventNames[type];
      if (!name) {
        return;
      }
      appendStartupTrace(
        name,
        `physicalConnectionID=${String(details.physicalConnectionID || "")} logicalCount=${Number(details.logicalCount || 0)}${details.physicalOpenLatencyMs !== undefined ? ` openLatencyMs=${Number(details.physicalOpenLatencyMs || 0)}` : ""}${details.serverPrepareDurationMs !== undefined ? ` serverPrepareDurationMs=${Number(details.serverPrepareDurationMs || 0)}` : ""}`,
        {
          dedupeKey: `${type}:${String(details.physicalConnectionID || "")}:${Number(details.subscriptionRevision || 0)}`,
          diagnosticDetails: details,
        },
      );
    },
    socketConnecting: WebSocket.CONNECTING,
    socketOpen: WebSocket.OPEN,
    socketClosing: WebSocket.CLOSING,
    socketClosed: WebSocket.CLOSED,
    healthCheckIntervalMs: terminalUnifiedHealthCheckIntervalMs,
    pongTimeoutMs: terminalUnifiedPongTimeoutMs,
    transitionTimeoutMs: terminalUnifiedTransitionTimeoutMs,
  });

  terminalRenderer = createTerminalRendererAdapter({
    documentObject: document,
    windowObject: window,
    getLineHeightPercent: () => settings?.getTerminalLineHeightPercent(),
    normalizeLineHeightPercent: (value) => normalizeTerminalLineHeightPercent(value),
    defaultLineHeightPercent: defaultTerminalLineHeightPercent,
    getFontSize: () => settings?.getTerminalFontSize(),
    initialFontSize: initialTerminalFontSize,
    getFontFamily: () => terminalOptionsBase.fontFamily,
  });

  terminalPresentation = createTerminalPresentationController({
    windowObject: window,
    getActiveName,
    getActiveTabId,
    getBackground: () => appearance.getActiveTheme()?.background || terminalOptionsBase.theme?.background || "#000000",
    isReplayCommitted: (session) => terminalReplay.isCommitted(session),
    isReplayCommitPending: (session) => terminalReplay.commitIsPending(session),
    isPaneVisible: (session) => terminalResize?.isVisible(session) === true,
    isPaneMeasurable: (session) => terminalResize?.isMeasurable(session) === true,
    isLiveGeometryActive: (session) => terminalResize?.isLiveGeometryActive(session) === true,
    isCurrentDeviceClaimRequired: (session) => terminalResize?.isCurrentDeviceClaimRequired(session) === true,
    isViewportGeometryClaimPending: () => terminalViewport?.isGeometryClaimPending() === true,
    canvasMatchesExpectedSize: (session) => terminalResize?.canvasMatchesExpectedSize(session) === true,
    normalizeResizeEpoch: (value) => terminalResize?.normalizeEpoch(value) || "",
    scheduleResize: (session, options, scheduleOptions) => terminalResize?.schedulePresentationResize(session, options, scheduleOptions) === true,
    retryResize: (session) => terminalResize?.resendPendingSize(session) === true,
    recordEvent: (session, event, details) => recordTerminalSessionEvent(session, event, details),
    onReady: (session, details) => terminalSessionInstallation?.handlePresentationReady(session, details),
    onRenderObserved: (session) => {
      terminalViewport?.syncPan(session);
      if (
        terminalReplay?.isCommitted(session) === true
        && terminalPresentation?.isCurrent(session) === true
      ) {
        terminalOverview?.capturePreview(session);
      }
    },
    recoverTransport: (session, reason, options) => terminalTransportRuntime?.recycleUnifiedSession(session, reason, options),
    isSocketOpen: (session) => session?.socket?.readyState === WebSocket.OPEN,
    now: () => performanceTaskNow(),
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
    activityPollIntervalMs,
  });

  terminalRuntime = createTerminalRuntimeController({
    advanceContentGeneration: (session) => terminalPresentation?.advanceContentGeneration(session),
    isRenderAllowed: (session) => terminalPresentation?.isRenderAllowed(session) === true,
    clearCanvas: (session) => terminalPresentation?.clearCanvas(session),
    syncSelectionRuntime: (session) => terminalSelection?.syncRuntimeReferences(session),
    syncRendererRuntime: (session) => terminalRenderer?.syncRuntime(session),
    appendDebugWarning: (...args) => appendDebugWarning(...args),
    appendDebugError: (...args) => appendDebugError(...args),
    describeSession: (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
  });

  terminalResize = createTerminalResizeController({
    windowObject: window,
    ResizeObserverCtor: globalThis.ResizeObserver,
    getActiveName,
    getActiveTabId,
    getCurrentTab: () => currentTab(),
    getPresentation: () => terminalPresentation,
    getPixelSize: (term) => terminalPixelSize(term),
    captureViewport: (term) => terminalRenderer?.captureViewport(term),
    isHostElement: (value) => value instanceof HTMLElement,
    isCanvasElement: (value) => value instanceof HTMLCanvasElement,
    isSocketOpen: (session) => session?.socket?.readyState === WebSocket.OPEN,
    isReplayCommitted: (session) => terminalReplay.isCommitted(session),
    isMobileKeyboardResizeSuppressed: () => terminalViewport?.isResizeSuppressed() === true,
    measureTask: (name, task) => measurePerformanceTask(name, task),
    now: () => performanceTaskNow(),
    recordEvent: (session, event, details) => recordTerminalSessionEvent(session, event, details),
    beginRenderSuppression: (session, reason) => beginTerminalRenderSuppression(session, reason),
    endRenderSuppression: (session, options) => endTerminalRenderSuppression(session, options),
    flushOutput: (session, options) => terminalOutput?.flush(session, options) ?? true,
    scheduleOutputFlush: (session) => terminalOutput?.scheduleFlush(session) === true,
    getOutputQueueEntryCount: (session) => terminalOutput?.getQueueEntryCount(session) || 0,
    getOutputQueuedBytes: (session) => terminalOutput?.getQueuedBytes(session) || 0,
    resetHostViewport: (session, options) => terminalIME?.resetHostViewport(session, options),
    positionInput: (session) => terminalIME?.positionInput(session),
    syncViewportPan: (session) => terminalViewport?.syncPan(session),
    updateSelectionHandles: (session) => terminalSelection?.updateHandles(session),
    resetAfterInitialFit: (session) => resetTerminalAfterInitialFit(session),
    syncTabMobilePixelScroll: (tab) => syncTabMobilePixelScroll(tab),
    connectPendingSession: (session) => terminalTransportRuntime?.connectPendingSession(session),
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
    throttleMs: terminalResizeThrottleMs,
    settleMs: terminalResizeSettleMs,
    outputQuietMs: terminalResizeOutputQuietMs,
    outputMaxHoldMs: terminalResizeOutputMaxHoldMs,
    sizeReassertIntervalMs: terminalSizeReassertIntervalMs,
    sizeClaimIntervalMs: terminalSizeClaimIntervalMs,
  });

  terminalMetrics = createTerminalMetricsController({
    windowObject: window,
    getTabs: () => tabs.values(),
    getCurrentTab: () => currentTab(),
    getTerminalArea: () => terminalArea,
    getScrollback: () => terminalOptionsBase.scrollback,
    getDefaultFontFamily: () => defaultTerminalFontFamily,
    setFontFamily: (fontFamily) => {
      terminalOptionsBase.fontFamily = fontFamily;
    },
    setFontSize: (fontSize) => {
      terminalOptionsBase.fontSize = fontSize;
    },
    setScrollback: (scrollback) => {
      terminalOptionsBase.scrollback = scrollback;
    },
    onScrollbackChange: (previousScrollback, nextScrollback) => (
      clientHistory.handleHistoryWindowChange(previousScrollback, nextScrollback)
    ),
    isMobileLayout: () => isMobileLayout(),
    resizeActiveTabForCurrentDevice: () => terminalResize?.resizeActiveTabForCurrentDevice(),
    getRenderer: () => terminalRenderer,
    getPresentation: () => terminalPresentation,
    getResize: () => terminalResize,
    recordEvent: (session, event, details) => recordTerminalSessionEvent(session, event, details),
    isElement: (value) => value instanceof HTMLElement,
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
    consoleObject: console,
  });

  terminalViewport = createTerminalMobileViewportController({
    windowObject: window,
    documentObject: document,
    navigatorObject: navigator,
    mobileShortcuts,
    isIOSPlatform: (navigatorObject) => isIOSPlatform(navigatorObject),
    isAndroidPlatform: (navigatorObject) => isAndroidPlatform(navigatorObject),
    isForcePCModeActive: () => isForcePCModeActive(),
    isMobileLayout: () => isMobileLayout(),
    isTouchShortcutLayout: () => isTouchShortcutLayout(),
    getActiveSession: () => activeSession(),
    getSessions: () => getAllSessions(),
    hasActivePanes: () => Boolean(currentTab()?.panes.size),
    claimActiveTabForCurrentDevice: (options) => terminalResize?.claimActiveTabForCurrentDevice(options),
    resetHostViewport: (session, options) => terminalIME?.resetHostViewport(session, options),
    positionInput: (session) => terminalIME?.positionInput(session),
    updateSelectionHandles: (session) => terminalSelection?.updateHandles(session),
    updateSelection: () => terminalSelection?.update(),
    isMobileMenuOpen: () => terminalInteraction?.isMobileOpen() === true,
    renderMobileMenu: () => renderMobileActionSheet(),
    scheduleOverviewRender: () => terminalOverview?.scheduleRender(),
    updateActiveTabTitle: () => updateMobileActiveTabTitle(),
  });

  terminalClipboard = createTerminalClipboardController({
    documentObject: document,
    navigatorObject: navigator,
    windowObject: window,
    getActiveSession: () => activeSession(),
    getSelectionText: (session) => terminalSelection?.getSelectedText(session) || "",
    clearSelectionState: (session) => terminalSelection?.clearFullBufferSelection(session),
    sendInput: (session, data) => terminalInput?.sendOrQueue(session, data),
    updateSelectionUI: () => terminalSelection?.update(),
    showToast: (message) => showToast(message),
    isMobileLayout: () => isMobileLayout(),
    isDesktopMouseClipboardEnabled: () => settings?.getDesktopMouseClipboardEnabled() === true,
    activateSession: (session) => {
      const tab = tabs.get(session?.tabId);
      if (tab && session?.id) {
        setActivePane(tab, session.id, { focus: false });
      }
    },
    reassertSessionSize: (session) => terminalResize?.reassertSize(session, { force: true }),
    focusForNativePaste: (session) => terminalIME?.focusForNativePaste(session),
    prepareSelectionManager: (session) => terminalSelection?.prepareManager(session),
    dragThresholdPx: desktopSelectionCopyMoveThresholdPx,
  });

  appPaste = createAppPasteController({
    uploadFiles: (files, { session } = {}) => attachments.uploadPastedFiles(files, {
      targetName: session?.name,
      tabId: session?.tabId,
    }),
    pasteText: (session, text) => terminalClipboard.pasteSession(session, text),
    isSessionValid: (session, result) => {
      if (disposed || !session || session.closed) {
        return false;
      }
      const tab = tabs.get(session.tabId);
      return tab?.panes?.get(session.id) === session
        && (!result?.tabId || result.tabId === session.tabId)
        && (!result?.instanceName || result.instanceName === session.name)
        && isCurrentInstanceSession(session);
    },
    reassertSize: (session) => terminalResize?.reassertSize(session, { force: true }),
    showToast: (message) => showToast(message),
  });
  appFileDrop = createAppFileDropController({
    windowObject: window,
    documentObject: document,
    translate: (key) => (typeof globalThis.$t === "function" ? globalThis.$t(key) : key),
    isBlocked: () => (
      attachments.isAnyOpen()
      || settings?.isOpen() === true
      || devices.isPanelOpen()
      || appearance.isPickerOpen()
      || instances.isSwitcherOpen()
      || dialogController?.isOpen() === true
      || terminalOverview?.isOpen() === true
      || terminalInteraction?.isMobileOpen() === true
    ),
    resolveSessionAtPoint: (clientX, clientY) => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return null;
      }
      const target = document.elementFromPoint(clientX, clientY);
      const shellEl = target instanceof Element ? target.closest(".pane-shell") : null;
      if (!(shellEl instanceof HTMLElement)) {
        return null;
      }
      const paneId = shellEl.dataset.paneId;
      const tabId = shellEl.closest(".terminal-pane")?.dataset.tabId || getActiveTabId();
      const tab = tabs.get(tabId);
      const session = tab?.panes?.get(paneId) || null;
      if (!session || session.closed || !session.terminalHost) {
        return null;
      }
      return session;
    },
    activateSession: (_session, clientX, clientY) => focusPaneAtPoint(clientX, clientY),
    ingestFiles: (session, files) => appPaste?.handleDroppedFiles(session, files),
    showToast: (message) => showToast(message),
  });

  terminalInteraction = createTerminalContextMenuController({
    documentObject: document,
    windowObject: window,
    getTabById: (tabId) => tabs.get(tabId) || null,
    getOrderedTabs: () => getOrderedTabs(),
    getCurrentTab: () => currentTab(),
    getActiveSession: () => activeSession(),
    getSelectionText: (session) => session?.term?.getSelection?.() || "",
    isFullBufferSelection: (session) => terminalSelection?.isFullBufferSelection(session) === true,
    findFirstURLInText: (text) => terminalLinks.findFirst(text),
    hasSelection: (session) => terminalSelection?.hasSelection(session) === true,
    isMobileLayout: () => isMobileLayout(),
    isTouchShortcutLayout: () => isTouchShortcutLayout(),
    isTouchSelectionLayout: () => isTouchSelectionLayout(),
    createIcon: (name) => createSVGIcon(name),
    prepareMobileOpen: () => {
      terminalIME?.blurMobileKeyboard();
      instances.closeSwitcher();
      appearance.closePicker();
      devices.closePanel({ focus: false });
    },
    copySession: (session) => terminalClipboard.copySession(session),
    pasteSession: (session) => terminalClipboard.pasteSession(session),
    selectAllSession: (session) => terminalSelection?.selectAll(session),
    openSearch: () => terminalSearch?.open(),
    captureLongScreenshot: (session) => runLongScreenshot(session),
    openLink: (url) => terminalLinks.open(url),
    copyLink: (url) => terminalLinks.copy(url),
    renameTab: (tabId) => renameTab(tabId),
    moveTab: (tabId, position) => moveTab(tabId, position),
    closeOtherTabs: (tabId) => closeOtherTabs(tabId),
    splitPane: (tabId, paneId, direction) => splitPane(tabId, paneId, direction),
    movePaneToNewTab: (tabId, paneId) => movePaneToNewTab(tabId, paneId),
    closePane: (tabId, paneId) => closePane(tabId, paneId),
    closeTab: (tabId) => closeTab(tabId),
    openTheme: () => settings?.openTheme(),
    showToast: (message) => showToast(message),
  });

  terminalSearch = createTerminalSearchController({
    documentObject: document,
    windowObject: window,
    getActiveSession: () => activeSession(),
    getSearchSeed: (session) => terminalClipboard.getSelectedText(session),
    closeContextMenu: () => closeContextMenu(),
    refreshOverlayLayout: () => attachments.refreshUploadPanels(),
    focusSession: (session) => session?.term?.focus?.(),
    showToast: (message) => showToast(message),
  });

  terminalMouse = createTerminalMouseController({
    documentObject: document,
    cellFromPoint: (session, clientX, clientY) => terminalSelection?.cellFromPoint(session, clientX, clientY),
    activateSession: (session) => {
      const tab = tabs.get(session?.tabId);
      if (tab && session?.id) {
        setActivePane(tab, session.id, { focus: false });
      }
    },
    clearSelection: (session) => terminalSelection?.clear(session),
    sendInput: (session, data) => terminalInput?.sendOrQueue(session, data),
    reassertSize: (session, event) => terminalResize?.reassertSizeForMouse(session, event),
    isTouchLayout: () => isTouchShortcutLayout(),
    requiresTouchKeyboardDoubleTap: () => requiresTouchKeyboardDoubleTap(),
    isDeferredTouchClickSession: (session) => isGrokTerminalSession(session),
    isKeyboardClaimed: (event) => terminalIME?.isKeyboardClaimed(event) === true,
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
    moveThresholdPx: touchShortcutMoveThresholdPx,
    tapDurationMs: mobileKeyboardDoubleTapDelayMs,
  });

  terminalSelection = createTerminalSelectionController({
    documentObject: document,
    windowObject: window,
    getActiveSession: () => activeSession(),
    getFullBufferText: (term) => terminalFullBufferText(term),
    isTouchSelectionLayout: () => isTouchSelectionLayout(),
    isMobileLayout: () => isMobileLayout(),
    isOverviewOpen: () => terminalOverview?.isOpen() === true,
    isMobileMenuOpen: () => terminalInteraction?.isMobileOpen() === true,
    refreshMobileMenu: () => renderMobileActionSheet(),
    blurInput: (session) => terminalIME?.blurInput(session),
    isKeyboardClaimed: (event) => terminalIME?.isKeyboardClaimed(event) === true,
    activateSession: (session) => {
      const tab = tabs.get(session?.tabId);
      if (tab && session?.id) {
        setActivePane(tab, session.id, { focus: false });
      }
    },
    markContextMenuCandidate: (touch) => markTerminalTouchContextMenuCandidate(touch),
    hasMouseTracking: (session) => terminalMouse?.hasTracking(session) === true,
    isRenderAllowed: (session) => terminalPresentation.isRenderAllowed(session),
    copyCurrentSelection: (session) => terminalClipboard?.copyCurrentSelection(session),
    copySession: (session) => terminalClipboard?.copySession(session),
    pasteSession: (session) => terminalClipboard?.pasteSession(session),
    openSearchFromSelection: () => terminalSearch?.openFromSelection(),
    showToast: (message) => showToast(message),
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
    isDesktopAutoCopyEnabled: () => settings?.getDesktopMouseClipboardEnabled() === true,
    touchMoveThresholdPx: touchSelectionMoveThresholdPx,
    longPressDelayMs: touchSelectionLongPressDelayMs,
    autoScrollEdgePx: mobileSelectionAutoScrollEdgePx,
    autoScrollIntervalMs: mobileSelectionAutoScrollIntervalMs,
    autoScrollMaxLines: mobileSelectionAutoScrollMaxLines,
  });

  appendStartupTrace(
    "页面模块已启动",
    `target=${String(params.get("name") || params.get("target") || "").trim() || "未指定"}`,
    { dedupeKey: "module-start" },
  );

  const terminalEstimatedSizeForElement = (element) => (
    terminalMetrics?.estimatedSizeForElement(element) || null
  );

  const terminalSizeQuery = () => (
    terminalMetrics?.sizeQuery() || { cols: 120, rows: 32 }
  );

  terminalStartupError = createTerminalStartupErrorController({
    windowObject: window,
    navigatorObject: navigator,
    fetchImpl: fetch,
    getActiveTabId,
    getTabById: (tabId) => tabs.get(tabId) || null,
    isCurrentSession: (session) => isCurrentInstanceSession(session),
    showStartupErrorPanel: (message) => showStartupErrorPanel(message),
    hideStartupErrorPanel: () => hideStartupErrorPanel(),
    writeImmediate: (session, message) => terminalOutput?.writeImmediate(session, message),
    appendDebugWarning: (...args) => appendDebugWarning(...args),
    describeSession: (session) => terminalLocationDescription(session),
    consoleObject: console,
  });

  workspaceAPI = createWorkspaceAPI({
    windowObject: window,
    getActiveName,
    getActiveGeneration,
    getTerminalSize: () => terminalSizeQuery(),
    isCurrentRequest: (name, generation) => isCurrentInstanceRequest(name, generation),
    observeServerRevision: (state) => serverRevision.observe(state),
    observeAgentProtocolUpdate: (state) => agentProtocolUpdate?.observe(state),
    applyWorkspaceState: (state, options) => applyWorkspaceState(state, options),
  });
  const workspaceActivityURL = (name) => workspaceAPI.activityURL(name);
  const fetchWorkspaceState = (name) => workspaceAPI.fetchState(name);
  const postWorkspaceAction = (action, payload, options) => workspaceAPI.postAction(action, payload, options);
  workspaceRefresh = createWorkspaceRefreshController({
    getActiveName,
    getActiveGeneration,
    isCurrentRequest: (name, generation) => isCurrentInstanceRequest(name, generation),
    fetchWorkspaceState: (name) => fetchWorkspaceState(name),
    ensureResponseSelector: (state, name) => ensureResponseSelector(state, name),
    observeServerRevision: (state) => serverRevision.observe(state),
    applyWorkspaceState: (state, options) => applyWorkspaceState(state, options),
    markStartupMetric: (name) => markWebShellStartupMetric(name),
    appendStartupTrace: (...args) => appendStartupTrace(...args),
    performanceNow: () => performanceTaskNow(),
    measureTask: (name, task) => measurePerformanceTask(name, task),
    getTabCount: () => tabs.size,
    getStateRevision: () => workspaceStateApply?.getRevision() || 0,
    getMutationState: () => workspaceAPI.getMutationState(),
    lifecycleOptions: {
      windowObject: window,
      navigatorObject: navigator,
      logInfo: (...args) => console.info(...args),
      logWarning: (...args) => console.warn(...args),
    },
  });
  const requestWorkspaceRefresh = (options) => workspaceRefresh.request(options);
  const applyWorkspaceRefresh = (result, options) => workspaceRefresh.apply(result, options);
  const refreshWorkspace = (options) => workspaceRefresh.refresh(options);
  const refreshWorkspaceWithRetry = (options) => workspaceRefresh.refreshWithRetry(options);
  const scheduleWorkspaceRefreshRetry = (options) => workspaceRefresh.scheduleRetry(options);
  const clearWorkspaceRefreshRetry = () => workspaceRefresh.clearRetry();

  const suppressBeforeUnloadForNavigation = () => {
    suppressBeforeUnloadOnce = true;
    window.clearTimeout(suppressBeforeUnloadResetTimer);
    suppressBeforeUnloadResetTimer = window.setTimeout(() => {
      suppressBeforeUnloadOnce = false;
      suppressBeforeUnloadResetTimer = 0;
    }, 1000);
  };

  const holdTerminalCursorVisible = (session) => appearanceRuntime?.holdCursorVisible(session) === true;
  const applyThemeToSession = (session, theme = appearance.getActiveTheme()) => (
    appearanceRuntime?.applyThemeToSession(session, theme) === true
  );
  const applyAppearanceThemeToWorkspace = (theme) => (
    appearanceRuntime?.applyWorkspaceTheme(theme) === true
  );

  const currentTab = () => tabs.get(getActiveTabId()) || null;
  const renderTabLabel = (tab) => workspaceTabLabels?.renderTabLabel(tab) === true;
  const updateMobileActiveTabTitle = () => workspacePresentation?.updateMobileActiveTabTitle();
  const refreshTabAutoLabel = (tab) => workspacePresentation?.refreshTabAutoLabel(tab) === true;
  const updateDocumentTitle = () => workspacePresentation?.updateDocumentTitle();
  const clearTabNotification = (tab) => workspacePresentation?.clearTabNotification(tab) === true;
  const markSessionTitleNotification = (session) => workspacePresentation?.markSessionTitleNotification(session) === true;
  const markSessionActivityNotification = (session, wasBusy, isBusy) => (
    workspacePresentation?.markSessionActivityNotification(session, wasBusy, isBusy) === true
  );
  const markSessionIdleNotification = (session, wasBusy, isBusy) => (
    workspacePresentation?.markSessionIdleNotification(session, wasBusy, isBusy) === true
  );
  const markSessionUserInput = (session) => workspacePresentation?.markSessionUserInput(session);
  const resetSessionUserInput = (session) => workspacePresentation?.resetSessionUserInput(session);
  const syncCursorBlinkState = () => workspacePresentation?.syncCursorBlinkState();
  const updateEmptyState = () => workspacePresentation?.updateEmptyState();

  const isForcePCModeActive = () => layoutController?.isForcePCModeActive() === true;
  const isMobileLayout = () => layoutController?.isMobileLayout() === true;
  const isTouchShortcutLayout = () => layoutController?.isTouchShortcutLayout() === true;
  const isDesktopShortcutBarLayout = () => layoutController?.isDesktopShortcutBarLayout() === true;
  const isTouchSelectionLayout = () => layoutController?.isTouchSelectionLayout() === true;
  const requiresTouchKeyboardDoubleTap = () => layoutController?.requiresTouchKeyboardDoubleTap() === true;
  const syncForcePCModeState = () => layoutController?.syncForcePCModeState() === true;

  const isMobileCustomSelectLayout = () => layoutController?.isMobileCustomSelectLayout() === true;
  mobileSelect = createMobileSelectController({
    documentObject: document,
    windowObject: window,
    isEnabled: isMobileCustomSelectLayout,
    HTMLSelectElementCtor: globalThis.HTMLSelectElement,
    HTMLElementCtor: globalThis.HTMLElement,
    EventCtor: globalThis.Event,
  });
  const closeMobileCustomSelect = (options = {}) => mobileSelect?.close(options);
  const syncMobileCustomSelectPosition = () => mobileSelect?.syncPosition();
  const installMobileCustomSelects = () => mobileSelect?.install();

  const syncTerminalMobilePixelScroll = (session) => layoutController?.syncTerminalMobilePixelScroll(session) === true;
  const syncTabMobilePixelScroll = (tab) => layoutController?.syncTabMobilePixelScroll(tab) === true;

  layoutController = createAppLayoutController({
    windowObject: window,
    documentObject: document,
    isDebugModeEnabled: () => isDebugModeEnabled(),
    getForcePCModeEnabled: () => settings?.getForcePCModeEnabled() === true,
    getDesktopShortcutsBarEnabled: () => settings?.getDesktopShortcutsBarEnabled() === true,
    getMobilePixelScrollEnabled: () => settings?.getMobilePixelScrollEnabled() !== false,
    closeMobileActionSheet: () => closeMobileActionSheet(),
    closeMobileCloseConfirm: (value) => closeMobileCloseConfirm(value),
    closeMobileCustomSelect: () => closeMobileCustomSelect(),
    hideSelection: () => terminalSelection?.hide(),
    handleViewportLayoutChange: () => terminalViewport?.handleLayoutChange(),
    resizeActiveTabForCurrentDevice: () => terminalResize?.resizeActiveTabForCurrentDevice(),
    handleHostLayoutChange: () => settings?.handleHostLayoutChange(),
    updateMobileActiveTabTitle: () => updateMobileActiveTabTitle(),
    updateSelection: () => terminalSelection?.update(),
  });

  workspaceTabNavigation = createWorkspaceTabNavigationController({
    windowObject: window,
    storage: window.localStorage,
    storagePrefix,
    tabsElement: tabsEl,
    getTabs: () => tabs,
    getActiveTabId,
    getActiveName,
    activateTab: (tabId) => setActiveTab(tabId),
    showToast: (message) => showToast(message),
  });
  const getOrderedTabs = () => workspaceTabNavigation.getOrderedTabs();
  const loadStoredRecentTabIds = (name) => workspaceTabNavigation.loadStoredRecentTabIds(name);
  const applyRecentTabIds = (ids, options) => workspaceTabNavigation.applyRecentTabIds(ids, options);
  const rememberRecentTab = (tabId, previousTabId) => workspaceTabNavigation.rememberRecentTab(tabId, previousTabId);
  const swapRecentTabs = () => workspaceTabNavigation.swapRecentTabs();
  const scrollTabButtonIntoView = (button) => workspaceTabNavigation.scrollButtonIntoView(button);

  terminalOverview = createTerminalOverviewController({
    documentObject: document,
    windowObject: window,
    terminalArea,
    getOrderedTabs,
    getActiveTabId,
    getActiveName,
    workspaceLocationURL,
    isMobileLayout,
    isFrameHoldCurrent: (session) => terminalPresentation.frameHoldIsCurrent(session),
    canPersistPreview: (session) => Boolean(
      !disposed
      && session
      && !session.closed
      && session.renderReady
      && session.hasPresentedFrame
      && terminalReplay?.isCommitted(session) === true
      && terminalResize?.isLiveGeometryActive(session) !== true
      && terminalPresentation?.isCurrent(session) === true
    ),
    onPreviewError: (session, error) => appendDebugWarning(
      "[terminal-overview] preview persistence failed",
      {
        name: session?.name || "",
        tab: session?.tabId || "",
        pane: session?.id || "",
        message: error?.message || String(error),
      },
    ),
    prepareOpen: () => {
      closeContextMenu();
      appearance.closePicker();
      devices.closePanel({ focus: false });
      instances.closeSwitcher();
    },
    isBlockingOverlayOpen: () => Boolean(
      appearance.isPickerOpen()
      || settings?.isOpen()
      || devices.isPanelOpen()
      || instances.isSwitcherOpen()
      || terminalInteraction?.isMobileOpen() === true
      || dialogController?.isMobileConfirmOpen() === true
      || serviceForwarding.isEditorOpen()
      || attachments.isAnyOpen()
      || dialogController?.isDialogOpen() === true
      || terminalInteraction?.isDesktopOpen() === true
      || terminalSelection?.isSheetOpen() === true
    ),
    createTab: () => createUserTab(),
    activateTab: (tabId) => setActiveTab(tabId),
    closeTab: (tabId) => closeTab(tabId),
    moveTab: (tabId, position) => moveTab(tabId, position),
    restoreActiveTab: (tabId) => postWorkspaceAction("activate_tab", { tab_id: tabId }),
    showToast: (message) => showToast(message),
    measureTask: (name, task) => measurePerformanceTask(name, task),
  });

  const setActiveTabByOffset = (offset) => workspaceTabNavigation.activateByOffset(offset);
  const setActiveTabByIndex = (index) => workspaceTabNavigation.activateByIndex(index);

  workspacePaneActivation = createWorkspacePaneActivationController({
    documentObject: document,
    ElementCtor: globalThis.Element,
    HTMLElementCtor: globalThis.HTMLElement,
    getActiveTabId,
    getTabById: (tabId) => tabs.get(tabId) || null,
    activateTab: (tabId, options) => setActiveTab(tabId, options),
    isApplyingWorkspaceState,
    resetSessionUserInput: (session) => resetSessionUserInput(session),
    refreshTabAutoLabel: (tab) => refreshTabAutoLabel(tab),
    syncCursorBlinkState: () => syncCursorBlinkState(),
    updateSelectionHandles: (session) => terminalSelection?.updateHandles(session),
    schedulePaneResize: (session, options, scheduleOptions) => terminalResize?.schedulePane(session, options, scheduleOptions),
    claimCurrentDeviceSize: (session, options) => terminalResize?.claimForCurrentDevice(session, options),
    presentationIsCurrent: (session) => terminalPresentation?.isCurrent(session) === true,
    cancelPendingRender: (term) => terminalPresentation?.cancelPendingRender(term),
    connectPendingSession: (session) => terminalTransportRuntime?.connectPendingSession(session),
    checkSessionHealth: (session, options) => terminalSessionConnection?.checkHealth(session, options),
    syncConnectionDemands: (options) => terminalTransportRuntime?.syncConnectionDemands(options),
    postWorkspaceAction: (action, payload, options) => postWorkspaceAction(action, payload, options),
    showToast: (message) => showToast(message),
    lifecycleOptions: { windowObject: window },
  });

  workspaceLayout = createWorkspaceLayoutController({
    getCurrentTab: () => currentTab(),
    setActivePane: (tab, paneId) => setActivePane(tab, paneId),
  });

  const terminalThemePayload = () => appearance.getTerminalThemePayload();
  terminalTheme = createTerminalThemeController({
    getThemePayload: () => terminalThemePayload(),
    socketOpen: WebSocket.OPEN,
  });
  const sendTerminalTheme = (pane) => terminalTheme?.send(pane) === true;

  const activeSession = () => {
    const tab = currentTab();
    return tab?.panes.get(tab.activePaneId) || null;
  };

  dialogController = createDialogController({
    windowObject: window,
    documentObject: document,
    dialog: {
      backdrop: dialogBackdrop,
      panel: dialogPanel,
      title: dialogTitle,
      message: dialogMessage,
      input: dialogInput,
      ok: dialogOK,
      cancel: dialogCancel,
    },
    mobileSheet: {
      container: mobileCloseConfirmSheet,
      scrim: mobileCloseConfirmScrim,
      handle: mobileCloseConfirmHandle,
      title: mobileCloseConfirmTitle,
      message: mobileCloseConfirmMessage,
      actions: mobileCloseConfirmActions,
      ok: mobileCloseConfirmOK,
      cancel: mobileCloseConfirmCancel,
    },
    isMobileLayout: () => isMobileLayout(),
    closeMobileActionSheet,
    focusActiveTerminal: () => activeSession()?.term?.focus(),
  });
  const closeDialog = (value) => dialogController?.closeDialog(value) === true;
  const openDialog = (options) => dialogController?.openDialog(options) || Promise.resolve(false);
  const confirmDialog = (message, options) => dialogController?.confirmDialog(message, options) || Promise.resolve(false);
  const closeMobileCloseConfirm = (value = false) => dialogController?.closeMobileCloseConfirm(value) === true;
  const confirmMobileSheet = (options) => dialogController?.confirmMobileSheet(options) || Promise.resolve(false);
  const confirmMobileClose = (options) => dialogController?.confirmMobileClose(options) || Promise.resolve(false);
  const confirmCloseRunningCommand = (message, options) => (
    dialogController?.confirmCloseRunningCommand(message, options) || Promise.resolve(false)
  );
  const promptDialog = (title, value) => dialogController?.promptDialog(title, value) || Promise.resolve(null);

  agentProtocolUpdate = createAgentProtocolUpdateController({
    windowObject: window,
    notice: agentProtocolUpdateNotice,
    getActiveName,
    getTerminalInput: () => terminalInput,
    openDialog: (options) => openDialog(options),
    suppressBeforeUnloadForNavigation: () => suppressBeforeUnloadForNavigation(),
    showToast: (message) => showToast(message),
    appendDebugLog: (...args) => appendDebugLog(...args),
    appendDebugError: (...args) => appendDebugError(...args),
  });

  const refreshTerminalMetrics = (session, options) => (
    terminalMetrics?.refresh(session, options) === true
  );

  terminalPolicy = createTerminalPolicyController({
    windowObject: window,
    isDialogOpen: () => (
      serverRevision?.isDialogOpen() === true
      || agentProtocolUpdate?.isDialogOpen() === true
    ),
    captureViewport: (term) => terminalRenderer?.captureViewport(term),
    normalizeBottomViewport: (term) => terminalRenderer?.normalizeBottomViewport(term),
    hasMouseTracking: (session) => terminalMouse?.hasTracking(session) === true,
    isTouchSelectionLayout: () => isTouchSelectionLayout(),
    shouldSuppressContextMenu: (event) => shouldSuppressTerminalContextMenu(event),
    claudeTouchCandidate: isClaudeFullscreenTouchCandidate,
    claudeContextMenuCandidate: isClaudeFullscreenContextMenuCandidate,
    claudeDesktopSelectionCandidate: isClaudeFullscreenDesktopSelectionCandidate,
    grokTouchCandidate: isGrokFullscreenTouchCandidate,
    grokContextMenuCandidate: isGrokFullscreenContextMenuCandidate,
    grokDesktopSelectionCandidate: isGrokFullscreenDesktopSelectionCandidate,
  });

  const terminalLocationDescription = (session) => (
    terminalPolicy?.terminalLocationDescription(session) || ""
  );
  const isGrokTerminalSession = (session) => terminalPolicy?.isGrokTerminalSession(session) === true;
  const isClaudeFullscreenTouchSession = (session) => terminalPolicy?.isClaudeFullscreenTouchSession(session) === true;
  const isClaudeFullscreenContextMenuEvent = (session, event) => terminalPolicy?.isClaudeFullscreenContextMenuEvent(session, event) === true;
  const isClaudeFullscreenDesktopSelectionEvent = (session, event) => terminalPolicy?.isClaudeFullscreenDesktopSelectionEvent(session, event) === true;
  const isGrokFullscreenContextMenuEvent = (session, event) => terminalPolicy?.isGrokFullscreenContextMenuEvent(session, event) === true;
  const isGrokFullscreenDesktopSelectionEvent = (session, event) => terminalPolicy?.isGrokFullscreenDesktopSelectionEvent(session, event) === true;
  const scrollTerminalToBottomForUserInput = (session) => terminalPolicy?.scrollTerminalToBottomForUserInput(session) === true;

  workspaceActivity = createWorkspaceActivityController({
    windowObject: window,
    documentObject: document,
    navigatorObject: navigator,
    getTabs: () => tabs.values(),
    getCurrentTab: () => currentTab(),
    getActiveTabId,
    getActiveName,
    getInstanceGeneration: getActiveGeneration,
    getActivityURL: (name) => workspaceActivityURL(name),
    syncPaneMembership: (observation) => workspaceRefresh.syncMembership(observation),
    getMutationState: () => workspaceAPI.getMutationState(),
    isCurrentInstanceRequest: (name, generation) => isCurrentInstanceRequest(name, generation),
    ensureResponseSelector: (state, name, label) => ensureResponseSelector(state, name, label),
    observeServerGeometry: (pane, state) => terminalResize?.observeServerGeometry(pane, state),
    recoverSessions: (sessions) => terminalPresentation?.recoverSessions(sessions),
    refreshTabAutoLabel: (tab) => refreshTabAutoLabel(tab),
    updateMobileActiveTabTitle: () => updateMobileActiveTabTitle(),
    updateDocumentTitle: () => updateDocumentTitle(),
    markSessionActivityNotification: (session, wasBusy, isBusy) => markSessionActivityNotification(session, wasBusy, isBusy),
    markSessionIdleNotification: (session, wasBusy, isBusy) => markSessionIdleNotification(session, wasBusy, isBusy),
    showToast: (message) => showToast(message),
    confirmCloseRunningCommand: (message, options) => confirmCloseRunningCommand(message, options),
    isDisposed: () => disposed,
    activityPollIntervalMs,
  });

  const createSVGIcon = createSVGIconFactory({ documentObject: document });

  terminalTUIAdapterInstaller = createTerminalTUIAdapterInstaller({
    ElementCtor: globalThis.Element,
    isTouchShortcutLayout: () => isTouchShortcutLayout(),
    isMobileMenuOpen: () => terminalInteraction?.isMobileOpen() === true,
    isClaudeTouchSession: (session) => isClaudeFullscreenTouchSession(session),
    isClaudeContextMenuEvent: (session, event) => isClaudeFullscreenContextMenuEvent(session, event),
    isClaudeDesktopSelectionEvent: (session, event) => isClaudeFullscreenDesktopSelectionEvent(session, event),
    isGrokContextMenuEvent: (session, event) => isGrokFullscreenContextMenuEvent(session, event),
    isGrokDesktopSelectionEvent: (session, event) => isGrokFullscreenDesktopSelectionEvent(session, event),
    getTerminalMouse: () => terminalMouse,
    getTerminalIME: () => terminalIME,
    getTerminalSelection: () => terminalSelection,
    getTerminalResize: () => terminalResize,
    setActivePane: (tab, paneId, options) => setActivePane(tab, paneId, options),
    getTabById: (tabId) => tabs.get(tabId),
    markContextMenuCandidate: (touch) => markTerminalTouchContextMenuCandidate(touch),
    registerCleanup: (session, callback) => terminalSessionController?.addCleanup(session, callback),
    installClaudeFullscreenTouchAdapter,
    installOpencodeFullscreenTouchAdapter,
    installHerdrFullscreenTouchAdapter,
    installPiFullscreenTouchAdapter,
    installClaudeFullscreenContextMenuAdapter,
    installClaudeFullscreenDesktopSelectionAdapter,
    installGrokFullscreenTouchAdapter,
    installGrokFullscreenContextMenuAdapter,
    installGrokFullscreenDesktopSelectionAdapter,
    isOpencodeFullscreenTouchCandidate,
    isHerdrFullscreenTouchCandidate,
    isPiFullscreenTouchCandidate,
    isGrokFullscreenTouchCandidate,
    moveThresholdPx: touchShortcutMoveThresholdPx,
    longPressDelayMs: touchSelectionLongPressDelayMs,
    desktopSelectionMoveThresholdPx: desktopSelectionCopyMoveThresholdPx,
  });

  const { runLongScreenshot } = createTerminalLongScreenshot({
    mobileShortcuts,
    createSVGIcon,
    confirmDialog,
    showToast,
  });

  const detachSessionSocket = (session, currentSocket, options) => (
    sessionRecovery?.detachSessionSocket(session, currentSocket, options) === true
  );

  const sessionConnectingState = (session) => (
    session?.connectionRetrying === true ? "reconnecting" : "connecting"
  );

  const resetTerminalForHistoryReplay = (session) => (
    sessionRecovery?.resetTerminalForHistoryReplay(session) === true
  );

  const requestSessionHistoryReplay = (session) => (
    sessionRecovery?.requestSessionHistoryReplay(session) === true
  );

  const connectSession = (...args) => (
    terminalSessionProtocol
      ? terminalSessionProtocol.connectSession(...args)
      : Promise.resolve(false)
  );

  terminalTransportRuntime = createTerminalTransportRuntimeController({
    windowObject: window,
    documentObject: document,
    getDisposed: () => disposed,
    isOnline: () => navigator.onLine !== false,
    isClientTarget: (name) => isClientInstanceName(name),
    getActiveName,
    getActiveTabID: getActiveTabId,
    getTabs: () => tabs.values(),
    isApplyingWorkspaceState,
    isCurrentSession: (session) => isCurrentInstanceSession(session),
    isReplayRetryPaused: (session) => terminalReplay.isRetryPaused(session),
    isReplayCommitted: (session) => terminalReplay.isCommitted(session),
    getUnifiedTransport: () => terminalUnifiedTransport,
    resizeSession: (session, options) => terminalResize.resizePane(session, options),
    isSessionMeasurable: (session) => terminalResize.isMeasurable(session),
    scheduleSessionResize: (session, options, scheduleOptions) => terminalResize.schedulePane(session, options, scheduleOptions),
    detachSessionSocket: (session, socket, options) => detachSessionSocket(session, socket, options),
    connectSession: (session, options) => connectSession(session, options),
    sessionConnectingState: (session) => sessionConnectingState(session),
    resumePendingInputExpiry: (session) => terminalInput?.resumePendingExpiry(session),
    pausePendingInputExpiry: (session) => terminalInput?.pausePendingExpiry(session),
    clearSessionConnectionTimers: (session) => terminalSessionConnection.clearConnectionTimers(session),
    retrySessionAfterFailure: (session, error, options) => terminalSessionConnection.retryAfterFailure(session, error, options),
    appendDebugLog: (...args) => appendDebugLog(...args),
    appendDebugWarning: (...args) => appendDebugWarning(...args),
    appendDebugError: (...args) => appendDebugError(...args),
    recordRuntimeEvent: (event, details) => diagnostics.recordRuntimeEvent(event, details),
    describeSession: (session) => terminalLocationDescription(session),
    socketConnecting: WebSocket.CONNECTING,
    socketOpen: WebSocket.OPEN,
    socketClosed: WebSocket.CLOSED,
    clientCapacity: terminalClientDirectWebSocketCapacity,
    interactionPriorityMs: terminalConnectionInteractionPriorityMs,
    unifiedRetryBaseDelayMs: terminalUnifiedPaneRetryBaseDelayMs,
    unifiedRetryMaxDelayMs: terminalUnifiedPaneRetryMaxDelayMs,
    reconnectBaseDelayMs: terminalReconnectBaseDelayMs,
    reconnectMaxDelayMs: terminalReconnectMaxDelayMs,
    reconnectJitterRatio: terminalReconnectJitterRatio,
  });

  terminalKeyOverrides = createTerminalKeyOverridesController({
    KeyboardEventCtor: globalThis.KeyboardEvent,
    handleFontSizeShortcut: (event) => settings?.handleTerminalFontSizeShortcut(event) === true,
    hasStickyModifiers: () => mobileShortcutsController?.hasStickyModifiers() === true,
    shouldApplyStickyTextInput: (value, inputType) => (
      mobileShortcutsController?.shouldApplyStickyTextInput(value, inputType) === true
    ),
    consumeStickyInput: (value) => mobileShortcutsController?.consumeStickyInput(value) || "",
    sendInput: (session, data) => terminalInput?.sendOrQueue(session, data),
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
  });

  terminalInput = createTerminalInputController({
    windowObject: window,
    getSessions: () => getAllSessions(),
    isKittyGraphicsResponse: (data) => isKittyGraphicsResponse(data),
    isReplayCommitted: (session) => terminalReplay.isCommitted(session),
    isSocketOpen: (session) => session?.socket?.readyState === WebSocket.OPEN,
    getCurrentLease: (session) => terminalTransportRuntime?.currentLease(session) || null,
    isClientTarget: (name) => isClientInstanceName(name),
    getResizeSize: (session) => terminalResize.size(session),
    normalizeResizeEpoch: (value) => terminalResize.normalizeEpoch(value),
    getThemePayload: () => terminalThemePayload(),
    getBufferedAmount: (session) => Number(session?.socket?.bufferedAmount || 0),
    checkConnectionHealth: (session, options) => terminalSessionConnection.checkHealth(session, options),
    recycleUnifiedSession: (session, reason, options) => terminalTransportRuntime?.recycleUnifiedSession(session, reason, options),
    requestConnection: (session, options) => terminalTransportRuntime?.requestConnection(session, options),
    markUserInput: (session) => markSessionUserInput(session),
    scrollToBottom: (session) => scrollTerminalToBottomForUserInput(session),
    scheduleActivityRefresh: (delay) => workspaceActivity.scheduleActivityRefresh(delay),
    showToast: (message) => showToast(message),
    appendDebugError: (title, details) => appendDebugError(title, details),
    holdCursorVisible: (session) => holdTerminalCursorVisible(session),
    reassertSize: (session) => terminalResize.reassertSize(session),
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
  });

  terminalIME = createTerminalIMEController({
    windowObject: window,
    documentObject: document,
    navigatorObject: navigator,
    appendDiagnosticLog: (level, title, details, options) => appendDebugLog(level, title, details, options),
    getViewportSnapshot: () => terminalViewport?.snapshot(),
    getActiveSession: () => activeSession(),
    activateSession: (session) => {
      const tab = tabs.get(session?.tabId);
      if (tab?.id === getActiveTabId()) {
        setActivePane(tab, session.id, { focus: false, resize: false, syncConnection: false });
      }
    },
    getTerminalFontSize: () => settings?.getTerminalFontSize(),
    getTerminalFontFamily: () => terminalOptionsBase.fontFamily,
    getTheme: () => appearance.getActiveTheme(),
    isTouchShortcutLayout: () => isTouchShortcutLayout(),
    requiresTouchKeyboardDoubleTap: () => requiresTouchKeyboardDoubleTap(),
    isKeyboardViewportActive: () => terminalViewport?.isKeyboardActive() === true,
    updateActiveTabTitle: () => updateMobileActiveTabTitle(),
    captureInputViewportLock: (session) => terminalViewport?.captureInputLock(session),
    releaseInputViewportLock: (session, options) => terminalViewport?.releaseInputLock(session, options),
    scheduleKeyboardDismissRecovery: (options) => terminalViewport?.scheduleKeyboardDismissRecovery(options),
    cancelKeyboardDismissRecovery: () => terminalViewport?.cancelKeyboardDismissRecovery(),
    cancelTouchInteraction: (session) => {
      terminalSelection?.cancelTouchInteraction(session);
      terminalTUIAdapterInstaller?.cancelTouchInteraction(session);
    },
    reassertSize: (session, options) => terminalResize?.reassertSize(session, options),
    claimCurrentDeviceSize: (session) => terminalResize?.claimForCurrentDevice(session),
    scrollToBottom: (session) => scrollTerminalToBottomForUserInput(session),
    sendInput: (session, data) => terminalInput?.sendOrQueue(session, data),
    pasteText: (session, text) => terminalClipboard?.pasteSession(session, text),
    handleNativePaste: (session, event) => appPaste?.handleNativePaste(session, event),
    showToast: (message) => showToast(message),
    shouldApplyStickyTextInput: (value, inputType) => mobileShortcutsController?.shouldApplyStickyTextInput(value, inputType) === true,
    shouldApplyStickyCompositionInput: (value) => mobileShortcutsController?.shouldApplyStickyCompositionInput(value) === true,
    consumeStickyInput: (value) => mobileShortcutsController?.consumeStickyInput(value) || String(value || ""),
    installKeyOverrides: (session) => terminalKeyOverrides?.installSession(session),
    registerSessionCleanup: (session, cleanup) => terminalSessionController?.addCleanup(session, cleanup),
    moveThresholdPx: touchShortcutMoveThresholdPx,
    doubleTapDelayMs: mobileKeyboardDoubleTapDelayMs,
  });

  mobileShortcutsController = createMobileShortcutsController({
    documentObject: document,
    windowObject: window,
    storage: window.localStorage,
    storageKey: `${storagePrefix}.touchShortcutFeedback`,
    mobileShortcuts,
    getShortcutRows: () => settings?.getMobileShortcutRows() || [[], []],
    getActiveSession: () => activeSession(),
    getCurrentTab: () => currentTab(),
    isDesktopShortcutBarLayout: () => isDesktopShortcutBarLayout(),
    terminalIME,
    sendInput: (session, data) => terminalInput?.sendOrQueue(session, data),
    resolveShortcutInputData: (shortcut, modifiers) => resolveMobileShortcutInputData(shortcut, modifiers),
    normalizeShortcutText: (value) => normalizeMobileShortcutTextData(value),
    applyStickyModifierInput: (value, modifiers) => applyStickyModifierInput(value, modifiers),
    canApplyStickyModifierInput: (value) => canApplyStickyModifierInput(value),
    updateSelection: () => terminalSelection?.update(),
    createIcon: (name, className) => createSVGIcon(name, className),
    onAction: (action, session) => appCommands?.runAction(action, session),
    showToast: (message) => showToast(message),
    PointerEventCtor: globalThis.PointerEvent,
    HTMLElementCtor: globalThis.HTMLElement,
    performanceObject: globalThis.performance,
    touchMoveThresholdPx: touchShortcutMoveThresholdPx,
  });

  terminalOutput = createTerminalOutputController({
    windowObject: window,
    getActiveName,
    isReplayCommitted: (session) => terminalReplay.isCommitted(session),
    getResizeTransition: (session) => terminalResize?.transitionState(session) || {},
    noteResizeOutput: (session) => terminalResize?.noteOutput(session),
    requestHistoryReplay: (session) => requestSessionHistoryReplay(session),
    finishHistoryReplayIfReady: (session) => terminalReplay.finishIfReady(session),
    queueHistoryCacheWrite: (session, data, startCursor, endCursor) => (
      clientHistory.queueWrite(session, data, startCursor, endCursor)
    ),
    scheduleReplayPresentationCheckpoint: (session) => terminalReplay.schedulePresentationCheckpoint(session),
    beginPresentationHold: (session) => terminalPresentation.beginHold(session),
    isRenderAllowed: (session) => terminalPresentation.isRenderAllowed(session),
    advanceContentGeneration: (session) => terminalPresentation.advanceContentGeneration(session),
    deferHiddenRender: (session) => terminalPresentation.deferHiddenRender(session),
    cancelPendingRender: (term) => terminalPresentation.cancelPendingRender(term),
    schedulePresentationValidation: (session) => terminalPresentation.scheduleValidation(session),
    armReplayGeneratedSuppression: (session) => terminalInput?.armReplayGeneratedSuppression(session),
    drainGeneratedResponses: (session) => terminalInput?.drainGeneratedResponses(session),
    resetHostViewport: (session, options) => terminalIME?.resetHostViewport(session, options),
    positionInput: (session) => terminalIME?.positionInput(session),
    recoverQueueTurnAck: (session, pending) => {
      terminalSessionConnection.closeSocketForReconnect(session, pending.socket, "Terminal queue turn acknowledgement failed.");
    },
    recordMetric: (name, value) => recordTerminalRuntimeMetric(name, value),
    recordMaxMetric: (name, value) => recordTerminalRuntimeMaxMetric(name, value),
    recordEvent: (session, event, details) => recordTerminalSessionEvent(session, event, details),
    measureTask: (name, task) => measurePerformanceTask(name, task),
    recordPerformanceTask: (name, duration) => recordPerformanceTask(name, duration),
    now: () => performanceTaskNow(),
    isDebugLogEnabled: () => isDebugLogEnabled(),
    appendDebugLog: (level, title, details, options) => appendDebugLog(level, title, details, options),
    appendStartupTrace: (title, details, options) => appendStartupTrace(title, details, options),
    onDiscard: (session) => terminalReplay.discardSession(session),
  });

  terminalSessionProtocol = createTerminalSessionProtocolController({
    documentObject: document,
    navigatorObject: navigator,
    WebSocketCtor: WebSocket,
    getActiveName,
    getActiveTabId,
    getCurrentTab: () => currentTab(),
    getTerminalTransportRuntime: () => terminalTransportRuntime,
    terminalSessionConnection,
    terminalUnifiedTransport,
    terminalReplay,
    clientHistory,
    terminalOutput,
    terminalPresentation,
    terminalResize,
    terminalInput,
    TerminalReplayController,
    ClientTerminalReplayAdapter,
    terminalCheckpointCapabilitiesForTerminal,
    terminalAgentPrepareTimeoutMs,
    serverRevisionClientID: serverRevision.getClientID(),
    webSocketURL: (path) => terminalWebSocketURL(path, { windowObject: window }),
    terminalThemePayload,
    sendTerminalTheme,
    syncTerminalNetworkMonitorSockets,
    isClientInstanceName,
    isCurrentInstanceSession,
    terminalLocationDescription,
    isRetryableTerminalTransportError,
    detachSessionSocket: (session, socket, options) => detachSessionSocket(session, socket, options),
    invalidateSessionStartupError,
    showSessionStartupError,
    resetTerminalForHistoryReplay,
    beginTerminalRenderSuppression,
    endTerminalRenderSuppression,
    sessionConnectingState,
    refreshWorkspaceWithRetry: (...args) => refreshWorkspaceWithRetry(...args),
    showToast,
    appendStartupTrace,
    appendDebugLog,
    appendDebugWarning,
    appendDebugError,
    isDebugLogEnabled,
    serverLogSinceUnixMS,
    recordTerminalSessionEvent,
  });

  const terminalSessionResources = createTerminalSessionResourceFactory({
    documentObject: document,
    TerminalCtor: Terminal,
    FitAddonCtor: FitAddon,
    getTerminalOptions: (initialTerminalOptions) => terminalOptions(initialTerminalOptions),
    getMobilePixelScroll: () => settings?.getMobilePixelScrollEnabled() !== false && isMobileLayout(),
  });

  workspaceLayoutView = createWorkspaceLayoutViewController({
    documentObject: document,
    windowObject: window,
    isApplyingWorkspaceState,
    setActivePane: (tab, paneId, options) => setActivePane(tab, paneId, options),
    resizeTab: (tab) => terminalResize?.resizeTab(tab),
    beginTabInteractiveResize: (tab) => terminalResize?.beginTabInteractiveResize(tab),
    updateTabInteractiveResize: (tab) => terminalResize?.updateTabInteractiveResize(tab),
    endTabInteractiveResize: (tab) => terminalResize?.endTabInteractiveResize(tab),
    postWorkspaceAction: (action, payload, options) => postWorkspaceAction(action, payload, options),
    showToast: (message) => showToast(message),
  });

  terminalSessionController = createTerminalSessionController({
    createResources: terminalSessionResources.create,
    lifecycleAdapters: {
      cancelFrameRelease: (session) => terminalPresentation.cancelFrameRelease(session),
      cancelScheduledResize: (session) => terminalResize?.cancelPane(session),
      clearCanvasPixels: (session) => terminalPresentation.clearCanvas(session),
      clearConnectionTimers: (session) => terminalSessionConnection.clearConnectionTimers(session),
      clearFullRenderValidation: (session) => terminalPresentation.clearValidation(session),
      clearHistoryCacheWriteSchedule: (session) => clientHistory.clearSessionSchedule(session),
      clearInputFlushTimer: (session) => terminalInput?.clearInputFlushTimer(session),
      clearInputPumpTimer: (session) => terminalInput?.clearInputPumpTimer(session),
      clearPendingInputExpiry: (session) => terminalInput?.clearPendingInputExpiry(session),
      clearPresentationRetry: (session) => terminalPresentation.clearRetry(session),
      clearReconnectTimer: (session) => terminalSessionConnection.clearReconnectTimer(session),
      clearUnifiedRetry: (session, options) => terminalTransportRuntime?.clearUnifiedRetry(session, options),
      detachLogicalStream: (session, reason) => terminalTransportRuntime?.detachUnifiedSession(session, reason),
      disposeHistoryCache: (session) => clientHistory.disposeSession(session),
      disposeOutput: (session) => terminalOutput?.disposeSession(session),
      flushHistoryCacheWrites: (session) => clientHistory.flushSession(session),
      releaseTerminalFrame: (session) => terminalPresentation.releaseHold(session),
      unregisterConnection: (session, reason) => terminalTransportRuntime?.unregisterSession(session, reason),
    },
    windowObject: window,
  });

  sessionRecovery = createTerminalSessionRecoveryController({
    getActiveName,
    clearOutputSettle: (session) => terminalResize?.clearOutputSettle(session),
    resetReplayController: (session) => session?.replayController?.reset(),
    setReplayAuthorization: (session, authorized) => terminalReplay?.setAuthorization(session, authorized),
    clearConnectionTimers: (session) => terminalSessionConnection?.clearConnectionTimers(session),
    beginRenderSuppression: (session, reason) => beginTerminalRenderSuppression(session, reason),
    endRenderSuppression: (session, options) => endTerminalRenderSuppression(session, options),
    recordSessionEvent: (session, event, details) => recordTerminalSessionEvent(session, event, details),
    discardOutput: (session) => terminalOutput?.discard(session),
    markPresentationSyncPending: (session) => terminalPresentation?.markSyncPending(session),
    resetRuntimeState: (session) => resetTerminalRuntimeState(session),
    cancelPendingRender: (term) => terminalPresentation?.cancelPendingRender(term),
    clearSelection: (session, options) => terminalSelection?.clear(session, options),
    hasKnownSize: (session) => terminalTransportRuntime?.hasKnownSize(session) === true,
    resetHostViewport: (session, options) => terminalIME?.resetHostViewport(session, options),
    positionInput: (session) => terminalIME?.positionInput(session),
    recycleUnifiedSession: (session, reason, options) => terminalTransportRuntime?.recycleUnifiedSession(session, reason, options),
    closeSocketForReconnect: (session, socket, reason) => terminalSessionConnection?.closeSocketForReconnect(session, socket, reason),
    requestConnection: (session, options) => terminalTransportRuntime?.requestConnection(session, options),
    measureTask: (name, task) => measurePerformanceTask(name, task),
    appendDebugWarning: (...args) => appendDebugWarning(...args),
    describeSession: (session) => terminalLocationDescription(session),
  });

  workspaceTabLabels = createWorkspaceTabLabelController({
    documentObject: document,
    windowObject: window,
    tabsElement: tabsEl,
    getTabs: () => tabs,
    getActiveTabId,
    isMobileLayout: () => isMobileLayout(),
    isApplyingWorkspaceState,
    closeContextMenu: () => closeContextMenu(),
    activateTab: (tabId, options) => setActiveTab(tabId, options),
    postWorkspaceAction: (action, payload, options) => postWorkspaceAction(action, payload, options),
    updateDocumentTitle: () => updateDocumentTitle(),
    scheduleOverviewRender: () => terminalOverview?.scheduleRender(),
    showToast: (message) => showToast(message),
  });

  workspacePresentation = createWorkspacePresentationController({
    documentObject: document,
    mobileActiveTabTitle,
    emptyState,
    mobileKeyboardFocusPrompt,
    getTabs: () => tabs,
    getActiveTabId,
    getCurrentTab: () => currentTab(),
    getMobileDoubleTapReminderEnabled: () => settings?.getMobileDoubleTapReminderEnabled() === true,
    requiresTouchKeyboardDoubleTap: () => requiresTouchKeyboardDoubleTap(),
    renderTabLabel: (tab) => renderTabLabel(tab),
  });

  terminalSessionInstallation = createTerminalSessionInstallationController({
    documentObject: document,
    sessionController: terminalSessionController,
    getActiveTheme: () => appearance.getActiveTheme(),
    getWorkspaceGeneration,
    isReplayCommitted: (session) => terminalReplay.isCommitted(session),
    appendStartupTrace: (title, details, options) => appendStartupTrace(title, details, options),
    clearUnifiedRetry: (session, options) => terminalTransportRuntime?.clearUnifiedRetry(session, options),
    presentation: terminalPresentation,
    output: terminalOutput,
    clearRuntimeBuffer: (session) => clearTerminalRuntimeBuffer(session),
    ime: terminalIME,
    renderer: terminalRenderer,
    selection: terminalSelection,
    tuiAdapterInstaller: terminalTUIAdapterInstaller,
    mouse: terminalMouse,
    clipboard: terminalClipboard,
    paste: appPaste,
    resize: terminalResize,
    input: terminalInput,
    interaction: terminalInteraction,
    links: terminalLinks,
    getTabById: (tabId) => tabs.get(tabId) || null,
    setActivePane: (tab, paneId, options) => setActivePane(tab, paneId, options),
    refreshTabAutoLabel: (tab) => refreshTabAutoLabel(tab),
    markSessionTitleNotification: (session) => markSessionTitleNotification(session),
    transportRuntime: terminalTransportRuntime,
    isClientTarget: (name) => isClientInstanceName(name),
  });
  const createPaneSession = (tab, instanceName, options) => (
    terminalSessionInstallation.createPaneSession(tab, instanceName, options)
  );

  workspaceTabView = createWorkspaceTabView({
    documentObject: document,
    windowObject: window,
    tabsElement: tabsEl,
    terminalArea,
    isRenaming: (tabId) => workspaceTabLabels?.isRenaming(tabId) === true,
    positionInlineRename: () => workspaceTabLabels?.positionInlineTabRenameInput(),
    closeTab: (tabId) => workspaceTabController?.closeTab(tabId),
    activateTab: (tabId, options) => setActiveTab(tabId, options),
    beginInlineRename: (tabId) => workspaceTabLabels?.beginInlineTabRename(tabId),
    bindContextMenu: (button, options) => terminalInteraction.bindTab(button, options),
    renderTabLabel: (tab) => renderTabLabel(tab),
  });
  workspaceTabController = createWorkspaceTabController({
    tabRegistry: workspaceTabRegistry,
    tabView: workspaceTabView,
    getActiveName,
    getActiveTabId,
    isApplyingWorkspaceState,
    runApplying: (task) => workspaceStateApply ? workspaceStateApply.runApplying(task) : task(),
    createPaneSession: (tab, instanceName, options) => createPaneSession(tab, instanceName, options),
    disposePaneSession: (pane) => {
      terminalOverview?.deletePreview(pane);
      terminalSessionController.dispose(pane);
    },
    renderTabLayout: (tab) => workspaceLayoutView.renderTabLayout(tab),
    splitLayout: (layout, paneId, direction, nextPaneId) => workspaceLayout.splitLayout(layout, paneId, direction, nextPaneId),
    removePaneFromLayout: (layout, paneId) => workspaceLayout.removePaneFromLayout(layout, paneId),
    collectPaneIds: (layout) => workspaceLayout.collectPaneIds(layout),
    activateTab: (tabId, options) => setActiveTab(tabId, options),
    clearActiveTab: () => workspaceTabActivation?.clear(),
    cancelTabActivation: () => workspaceTabActivation?.clear(),
    getOrderedTabs: () => getOrderedTabs(),
    updateEmptyState: () => updateEmptyState(),
    scheduleOverviewRender: () => terminalOverview?.scheduleRender(),
    syncConnectionDemands: (options) => terminalTransportRuntime?.syncConnectionDemands(options),
    cancelTabResize: (tab) => terminalResize.cancelTab(tab),
    handleTabRemoved: (tabId) => attachments.handleTabRemoved(tabId),
    isRenaming: (tabId) => workspaceTabLabels?.isRenaming(tabId) === true,
    cancelRename: () => workspaceTabLabels?.finishInlineTabRename({ commit: false }),
    refreshAndConfirmClose: (panes, message) => workspaceActivity.refreshAndConfirmClose(panes, message),
    targetPanesFromTab: (tab) => workspaceActivity.targetPanesFromTab(tab),
    postWorkspaceAction: (action, payload) => postWorkspaceAction(action, payload),
    destroyCachedSession: (pane) => clientHistory.destroySession(pane),
    promptRename: (title, value) => promptDialog(title, value),
    commitTabRename: (tabId, label, options) => workspaceTabLabels?.commitTabRename(tabId, label, options),
    showToast: (message) => showToast(message),
    clearRecentTabs: () => workspaceTabNavigation.clear(),
  });
  const createTab = (options) => workspaceTabController.createTab(options);
  const recreateTabButton = (tab) => workspaceTabController.recreateTabButton(tab);
  const disposePane = (pane) => workspaceTabController.disposePane(pane);
  const splitPane = (tabId, paneId, direction) => workspaceTabController.splitPane(tabId, paneId, direction);
  const closePane = (tabId, paneId) => workspaceTabController.closePane(tabId, paneId);
  const closeTab = (tabId, options) => workspaceTabController.closeTab(tabId, options);
  const closeOtherTabs = (tabId) => workspaceTabController.closeOtherTabs(tabId);
  const renameTab = (tabId) => workspaceTabController.renameTab(tabId);
  const movePaneToNewTab = (tabId, paneId) => workspaceTabController.movePaneToNewTab(tabId, paneId);
  const moveTab = (tabId, position) => workspaceTabController.moveTab(tabId, position);

  workspaceTabActivation = createWorkspaceTabActivationController({
    tabRegistry: workspaceTabRegistry,
    tabView: workspaceTabView,
    getInstanceGeneration: getActiveGeneration,
    isAppDisposed: () => disposed,
    isApplyingWorkspaceState,
    measureTask: (name, task) => measurePerformanceTask(name, task),
    presentationStateIsCurrent: (pane) => terminalPresentation.stateIsCurrent(pane),
    holdPresentationFrame: (pane) => terminalPresentation.holdFrame(pane),
    schedulePresentationFrameRelease: (pane) => terminalPresentation.scheduleFrameRelease(pane),
    beginPresentationHold: (pane, options) => terminalPresentation.beginHold(pane, options),
    setPresentationReady: (pane, ready) => terminalPresentation.setReady(pane, ready),
    resetMeasurementAttempts: (pane) => terminalTransportRuntime?.resetMeasurementAttempts(pane),
    resetSessionUserInput: (pane) => resetSessionUserInput(pane),
    clearTabNotification: (tab) => clearTabNotification(tab),
    rememberRecentTab: (tabId, previousTabId) => rememberRecentTab(tabId, previousTabId),
    setActivePane: (tab, paneId, options) => setActivePane(tab, paneId, options),
    rememberActiveTab: () => rememberActiveTab(),
    refreshUploadPanels: () => attachments.refreshUploadPanels(),
    scrollTabButtonIntoView: (button) => scrollTabButtonIntoView(button),
    scheduleOverviewRender: () => terminalOverview?.scheduleRender(),
    scheduleVisibleTabResize: (tab, options) => terminalResize.scheduleVisibleTab(tab, options),
    claimVisibleTabSize: (tab, options) => terminalResize.claimTabForCurrentDevice(tab, options),
    syncConnectionDemands: (options) => terminalTransportRuntime?.syncConnectionDemands(options),
    persistActiveTab: (tabId) => persistActiveWorkspaceTab(tabId),
    showToast: (message) => showToast(message),
  });
  const setActiveTab = (tabId, options) => workspaceTabActivation.activate(tabId, options);

  workspaceStateApply = createWorkspaceStateApplyController({
    getTabs: () => tabs,
    getActiveTabId,
    getActiveName,
    getActiveGeneration,
    isCurrentRequest: (name, generation) => isCurrentInstanceRequest(name, generation),
    ensureResponseSelector: (state, name) => ensureResponseSelector(state, name),
    responseSelector: (state) => responseSelector(state),
    showToast: (message) => showToast(message),
    readRestartTabForName: (name) => readRestartTabForName(name),
    clearRestartTabForReload: () => clearRestartTabForReload(),
    readRequestedTab: () => new URLSearchParams(window.location.search).get("tab") || "",
    setWorkspaceGenerationFromState: (state) => setWorkspaceGenerationFromState(state),
    destroyLocalHistory: (pane) => clientHistory.destroySession(pane),
    closeTab: (tabId, options) => closeTab(tabId, options),
    createTab: (options) => createTab(options),
    recreateTabButton: (tab) => recreateTabButton(tab),
    createPaneSession: (tab, targetName, options) => createPaneSession(tab, targetName, options),
    disposePane: (pane) => disposePane(pane),
    updatePaneActivity: (paneState) => workspaceActivity.updatePaneActivity(paneState),
    renderTabLabel: (tab) => renderTabLabel(tab),
    renderTabLayout: (tab) => workspaceLayoutView.renderTabLayout(tab),
    clearTabButtons: () => workspaceTabView.clearTabButtons(),
    syncTabButtonOrder: (orderedTabs) => workspaceTabView.syncTabButtonOrder(orderedTabs),
    applyRecentTabIds: (ids, options) => applyRecentTabIds(ids, options),
    loadStoredRecentTabIds: (name) => loadStoredRecentTabIds(name),
    getRecentTabIds: () => workspaceTabNavigation.getRecentTabIds(),
    readLastActiveTab: (name) => workspacePersistence.readLastActiveTab(name),
    setActiveTab: (tabId, options) => setActiveTab(tabId, options),
    clearActiveTab: () => workspaceTabActivation.clear(),
    updateEmptyState: () => updateEmptyState(),
    scheduleOverviewRender: () => terminalOverview?.scheduleRender(),
    resizeActiveTabForCurrentDevice: () => terminalResize.resizeActiveTabForCurrentDevice(),
    connectPendingSessionsForTab: (tab, options) => terminalTransportRuntime?.connectPendingSessionsForTab(tab, options),
    flushPendingMembershipRefresh: (reason) => terminalTransportRuntime?.flushPendingMembershipRefresh(reason),
    measureTask: (name, task) => measurePerformanceTask(name, task),
    lifecycleOptions: { windowObject: window },
  });

  workspaceTargetController = createWorkspaceTargetController({
    initialName: initialActiveName,
    isDisposed: () => disposed,
    clearRefreshRetry: () => clearWorkspaceRefreshRetry(),
    hideStartupError: () => hideStartupErrorPanel(),
    invalidateWorkspaceGeneration: () => {
      activeWorkspaceGeneration = "";
    },
    syncNetworkSockets: (options) => syncTerminalNetworkMonitorSockets(options),
    onTargetChange: ({ name }) => {
      agentProtocolUpdate?.beginTarget(name);
      instances.handleActiveTargetChange();
      serviceForwarding.handleTargetChange();
      attachments.handleTargetChange();
    },
    resetWorkspace: () => workspaceTabController?.resetForInstance(),
    updateLocation: (name, options) => updateLocationName(name, options),
    refreshWorkspaceWithRetry: (options) => workspaceRefresh?.refreshWithRetry(options),
  });

  runtimeRecovery = createAppRuntimeRecoveryController({
    networkBanner,
    getTabs: () => tabs.values(),
    getCurrentTab: () => currentTab(),
    getActiveName,
    isOnline: () => navigator.onLine !== false,
    clearUnifiedRetry: (session) => terminalTransportRuntime?.clearUnifiedRetry(session),
    isReplayRetryPaused: (session) => terminalReplay?.isRetryPaused(session) === true,
    resumeReplayRetry: (session, reason) => terminalReplay?.resumeRetry(session, reason),
    checkSessionHealth: (session, options) => terminalSessionConnection?.checkHealth(session, options) === true,
    probeOpenSocket: (session, options) => terminalSessionConnection?.probeOpenSocket(session, options),
    setTransportOnline: (online) => terminalTransportRuntime?.setOnline(online),
    probeUnifiedTransport: (reason) => terminalUnifiedTransport?.probe(reason) === true,
    retryUnifiedTransport: (reason) => terminalUnifiedTransport?.retryUnavailable(reason) === true,
    waitForUnifiedClosures: () => terminalUnifiedTransport?.waitForClosures() || Promise.resolve(),
    clearExpectedCloseReason: () => terminalUnifiedTransport?.clearExpectedCloseReason(),
    refreshMembership: (options) => terminalTransportRuntime?.refreshMembership(options),
    syncConnectionDemands: (options) => terminalTransportRuntime?.syncConnectionDemands(options),
    closeUnifiedTransport: (reason) => terminalUnifiedTransport?.close(reason),
    rememberWorkspaceRestoreState: () => rememberWorkspaceRestoreState(),
    resumeDevices: () => devices.handleResume(),
    claimActiveTabSize: (options) => terminalResize?.claimActiveTabForCurrentDevice(options),
    resumeWorkspaceRetry: () => workspaceRefresh?.resumeRetry(),
    refreshWorkspaceActivity: (options) => workspaceActivity?.refreshActivity(options),
    updateSelection: () => terminalSelection?.update(),
    renderNetworkMonitor: () => renderTerminalNetworkMonitor(),
    showToast: (message) => showToast(message),
    appendDebugLog: (...args) => appendDebugLog(...args),
    recordRuntimeEvent: (event, details) => diagnostics.recordRuntimeEvent(event, details),
    recordMetric: (name, value) => recordTerminalRuntimeMetric(name, value),
    isRecoveryReady: () => {
      const tab = currentTab();
      const panes = Array.from(tab?.panes?.values?.() || []).filter((pane) => (
        !pane.closed && pane.name === getActiveName()
      ));
      return panes.length > 0 && panes.every((pane) => terminalPresentation?.isCurrent(pane) === true);
    },
    onResumeDeadline: () => {
      const tab = currentTab();
      for (const pane of tab?.panes?.values?.() || []) {
        if (pane.closed || pane.name !== getActiveName() || !pane.shellEl?.dataset) {
          continue;
        }
        if (pane.shellEl.dataset.connection !== "offline" && pane.shellEl.dataset.connection !== "network-error") {
          pane.shellEl.dataset.connection = "reconnecting";
        }
      }
    },
    resumeDeadlineMs: terminalResumeDeadlineMs,
    lifecycleOptions: {
      now: () => Date.now(),
      userRecoveryThrottleMs: terminalUserRecoveryThrottleMs,
    },
  });

  appearanceRuntime = createAppearanceRuntimeController({
    windowObject: window,
    getActiveTheme: () => appearance.getActiveTheme(),
    getTerminalTheme: () => appearance.getTerminalTheme(),
    getSessions: () => getAllSessions(),
    beginPresentationHold: (session) => terminalPresentation?.beginHold(session),
    isRenderAllowed: (session) => terminalPresentation?.isRenderAllowed(session) === true,
    installThemeMapper: (session) => terminalRenderer?.installThemeMapper(session),
    installCellSeam: (session) => terminalRenderer?.installCellSeam(session),
    refreshTerminalMetrics: (session) => refreshTerminalMetrics(session),
    resizeActiveTab: () => terminalResize?.resizeActiveTab(),
    scheduleOverviewRender: () => terminalOverview?.scheduleRender(),
    sendTerminalTheme: (session) => sendTerminalTheme(session),
    syncCursorBlinkState: () => syncCursorBlinkState(),
    cursorBlinkHoldMs: terminalCursorBlinkHoldMs,
    isDisposed: () => disposed,
  });
  legacyStorageCleanup = createLegacyWebShellStorageCleanupController({
    windowObject: window,
    navigatorObject: navigator,
    cacheStorage: globalThis.caches,
    consoleObject: console,
  });
  appBootstrap = createAppBootstrapController({
    startControllers: [
      diagnostics,
      instances,
      appearance,
      devices,
      terminalLinks,
      terminalSelection,
      serviceForwarding,
      attachments,
      terminalClipboard,
      appPaste,
      appFileDrop,
      terminalInteraction,
      terminalSearch,
      terminalOverview,
      settings,
      terminalViewport,
    ],
    ghosttyReady: ghosttyInitPromise,
    loadTheme: () => appearance.load(),
    loadSettings: () => settings.load({ deferFontLoad: true }),
    loadInstances: () => instances.load(),
    getActiveName,
    getActiveGeneration,
    isCurrentRequest: (name, generation) => isCurrentInstanceRequest(name, generation),
    requestWorkspace: (context) => requestWorkspaceRefresh(context),
    refreshWorkspaceWithRetry: (options) => refreshWorkspaceWithRetry(options),
    scheduleWorkspaceRetry: (options) => scheduleWorkspaceRefreshRetry(options),
    applyWorkspace: (result, options) => applyWorkspaceRefresh(result, options),
    startWorkspaceActivity: () => workspaceActivity.startActivityRefresh(),
    refreshWorkspaceActivity: (options) => workspaceActivity.refreshActivity(options),
    getTabCount: () => tabs.size,
    markStartupMetric: (name) => markWebShellStartupMetric(name),
    appendStartupTrace: (...args) => appendStartupTrace(...args),
    showToast: (message) => showToast(message),
    appendDebugError: (...args) => appendDebugError(...args),
    showStartupErrorPanel: (message) => showStartupErrorPanel(message),
    clearActiveTarget: () => setActiveInstanceName(""),
    createErrorTab: (options) => createTab(options),
    getCurrentTab: () => currentTab(),
    writeErrorTerminal: (pane, message) => pane?.term?.write(message),
    isAppDisposed: () => disposed,
  });

  appCommands = createAppCommandController({
    getActiveName,
    getCurrentTab: () => currentTab(),
    postWorkspaceAction: (action, payload) => postWorkspaceAction(action, payload),
    closeTab: (tabId) => closeTab(tabId),
    renameTab: (tabId) => renameTab(tabId),
    swapRecentTabs: () => swapRecentTabs(),
    setActiveTabByOffset: (offset) => setActiveTabByOffset(offset),
    splitPane: (tabId, paneId, direction) => splitPane(tabId, paneId, direction),
    openOverview: () => terminalOverview?.open(),
    openSearch: () => terminalSearch?.open(),
    openAttachments: () => attachments.openDialog(),
    importAttachmentFromClipboard: () => attachments.importFromClipboard(),
    selectAttachmentFiles: () => attachments.selectFiles(),
    copySession: (session) => terminalClipboard?.copySession(session),
    pasteSession: (session) => terminalClipboard?.pasteSession(session),
    scrollSession: (session, delta) => session?.term?.scrollPages?.(delta),
    adjustTerminalFontSize: (delta) => settings?.adjustTerminalFontSize(delta),
    openMobileMenu: () => openMobileActionSheet(),
    showToast: (message) => showToast(message),
  });

  shortcutController = createAppShortcutController({
    documentObject: document,
    navigatorObject: navigator,
    getCurrentTab: () => currentTab(),
    getOrderedTabs: () => getOrderedTabs(),
    getActiveSession: () => activeSession(),
    setActiveTabByOffset: (offset) => setActiveTabByOffset(offset),
    setActiveTabByIndex: (index) => setActiveTabByIndex(index),
    createUserTab: () => createUserTab(),
    closeTab: (tabId) => closeTab(tabId),
    closeOtherTabs: (tabId) => closeOtherTabs(tabId),
    renameTab: (tabId) => renameTab(tabId),
    moveTab: (tabId, position) => moveTab(tabId, position),
    splitPane: (tabId, paneId, direction) => splitPane(tabId, paneId, direction),
    closePane: (tabId, paneId) => closePane(tabId, paneId),
    selectPaneInDirection: (direction) => workspaceLayout.selectPaneInDirection(direction),
    resolveDesktopShortcutAction: (shortcut) => settings?.resolveDesktopShortcutAction(shortcut) || "",
    handleTerminalFontSizeShortcut: (event) => settings?.handleTerminalFontSizeShortcut(event) === true,
    isAppearancePickerOpen: () => appearance.isPickerOpen(),
    isSettingsOpen: () => settings?.isOpen() === true,
    isDevicesPanelOpen: () => devices.isPanelOpen(),
    isInstanceSwitcherOpen: () => instances.isSwitcherOpen(),
    isAttachmentsOpen: () => attachments.isAnyOpen(),
    isTerminalOverviewOpen: () => terminalOverview?.isOpen() === true,
    openTheme: () => settings?.openTheme(),
    openInstanceSwitcher: () => instances.openSwitcher(),
    copyTerminal: () => terminalClipboard?.copySession(),
    focusForNativePaste: () => terminalIME?.focusForNativePaste(),
    openSearch: () => terminalSearch?.open(),
    selectAllTerminal: () => terminalSelection?.selectAll(),
    importAttachmentFromClipboard: () => attachments.importFromClipboard(),
    selectAttachmentFiles: () => attachments.selectFiles(),
    pasteTerminal: () => terminalClipboard?.pasteSession(),
    isTerminalPasteRedirectTarget: (target) => attachments.isFileInputTarget(target),
    closeContextMenu: () => closeContextMenu(),
    showToast: (message) => showToast(message),
  });

  mobileShortcutsController?.render();
  installMobileCustomSelects();
  dialogController.install();
  appCommands.install({
    newTabButton,
    emptyStateAction,
    tabsElement: tabsEl,
  });

  appLifecycle = createAppLifecycle({
    windowObject: window,
    documentObject: document,
    visualViewport: window.visualViewport,
    fonts: document.fonts,
    heartbeatIntervalMs: 5 * 1000,
    handlers: {
      onRecoverUserGesture: recoverVisibleSessionsFromUserGesture,
      onPointerDown: (event) => {
        const target = event.target;
        const terminalPointer = target instanceof Element && Boolean(target.closest(".terminal-host"));
        if (
          !terminalPointer
          && (typeof PointerEvent === "undefined" || !(event instanceof PointerEvent) || !event.pointerType || event.pointerType === "mouse")
        ) {
          terminalResize.reassertSize(activeSession());
        }
      },
      onModalKeydown: (event) => {
        if (devices.handleEscape(event)) {
          return;
        }
        if (mobileSelect?.isOpen() && event.key === "Escape") {
          event.preventDefault();
          closeMobileCustomSelect({ focus: true });
          return;
        }
        if (serviceForwarding.handleEscape(event)) {
          return;
        }
        if (attachments.handleEscape(event)) {
          return;
        }
        dialogController.handleEscape(event);
      },
      onGlobalKeydown: (event) => {
        recoverVisibleSessionsFromUserGesture();
        if (event.key === "Escape") {
          closeMobileCloseConfirm(false);
          attachments.closeAll({ focus: false });
          appearance.closePicker();
          settings?.close();
          devices.closePanel();
          terminalOverview?.close();
        }
        shortcutController?.handleKeydown(event);
      },
      onResize: () => {
        syncMobileCustomSelectPosition();
        if (!isMobileLayout()) {
          closeMobileCloseConfirm(false);
          terminalResize?.scheduleTabLiveGeometry(currentTab());
        }
        appearance.handleResize();
        updateMobileActiveTabTitle();
        terminalSelection?.update();
        settings?.handleHostLayoutChange();
        devices.handleResize();
      },
      onVisualViewportChange: syncMobileCustomSelectPosition,
      onFontsReady: () => {
        for (const pane of getAllSessions()) {
          refreshTerminalMetrics(pane);
        }
      },
      onOnline: () => runtimeRecovery?.handleOnline(),
      onOffline: () => runtimeRecovery?.handleOffline(),
      onVisibilityChange: () => runtimeRecovery?.handleVisibilityChange({ hidden: document.hidden }),
      onFocus: () => runtimeRecovery?.handleFocus(),
      onPageShow: () => runtimeRecovery?.handlePageShow(),
      onPageHide: () => {
        rememberWorkspaceRestoreState();
        settings?.flushPending();
        terminalOverview?.captureAllPreviews(getAllSessions(), { immediate: true });
        clientHistory.touchAll();
        clientHistory.flushAll();
        devices.handlePageHide();
      },
      onBeforeUnload: (event) => {
        rememberWorkspaceRestoreState();
        settings?.flushPending();
        clientHistory.touchAll();
        clientHistory.flushAll();
        if (!suppressBeforeUnloadOnce && workspaceActivity.hasCachedBusyPane()) {
          event.preventDefault();
          event.returnValue = "";
          return "";
        }
        appLifecycle?.dispose();
        disposed = true;
        appBootstrap?.dispose();
        legacyStorageCleanup?.dispose();
        workspaceTargetController?.dispose();
        runtimeRecovery?.dispose();
        workspaceActivity?.dispose();
        workspaceTabLabels?.dispose();
        workspaceTabNavigation?.dispose();
        workspacePaneActivation?.dispose();
        workspaceTabActivation?.dispose();
        workspaceTabController?.dispose();
        workspaceStateApply?.dispose();
        workspacePersistence.dispose();
        workspaceAPI?.dispose();
        terminalViewport?.dispose();
        terminalIME?.dispose();
        terminalKeyOverrides?.dispose();
        terminalInput?.dispose();
        terminalOutput?.dispose();
        terminalSessionInstallation?.dispose();
        terminalSessionController?.disposeAll(getAllSessions());
        terminalStartupError?.dispose();
        serverRevision?.dispose();
        agentProtocolUpdate?.dispose();
        terminalTransportRuntime?.dispose("page_disposed");
        terminalSessionConnection.dispose();
        terminalReplay.dispose();
        terminalResize?.dispose();
        terminalPresentation?.dispose();
        terminalRuntime?.dispose();
        clientHistory.dispose();
        terminalUnifiedTransport.dispose("page_disposed");
        instances.dispose();
        appearance.dispose();
        appearanceRuntime?.dispose();
        workspaceRefresh.dispose();
        diagnostics.dispose();
        serviceForwarding.dispose();
        appPaste?.dispose();
        appFileDrop?.dispose();
        attachments.dispose();
        terminalLinks?.dispose();
        terminalMouse?.dispose();
        terminalPolicy?.dispose();
        terminalMetrics?.dispose();
        terminalTheme?.dispose();
        terminalRenderer?.dispose();
        terminalSelection?.dispose();
        terminalClipboard?.dispose();
        terminalInteraction?.dispose();
        terminalSearch?.dispose();
        terminalOverview?.dispose();
        devices.dispose();
        settings?.dispose();
        appCommands?.dispose();
        shortcutController?.dispose();
        mobileShortcutsController?.dispose();
        mobileSelect?.dispose();
        layoutController?.dispose();
        dialogController?.dispose();
        feedback?.dispose();
        sessionRecovery?.dispose();
      },
      onHeartbeat: () => {
        rememberWorkspaceRestoreState();
        clientHistory.touchAll();
      },
    },
  });
  appLifecycle.start();

  legacyStorageCleanup.cleanup();

  clientHistory.cleanupStorage();

  serverRevision.scheduleInitialCheck();

  appBootstrap.start().catch((error) => appBootstrap.handleFailure(error));
  })();
}

// Compatibility alias for callers that used the former app root name.
export const startWebShellApp = startGlobalRuntime;
