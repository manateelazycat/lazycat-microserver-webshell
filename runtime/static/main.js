import { FitAddon, Terminal, init as initGhostty } from "./ghostty-web.js";

const params = new URLSearchParams(window.location.search);
const isEmbedMode = params.has("embed");
document.body?.classList.toggle("is-embed-mode", isEmbedMode);

(async () => {
  await initGhostty();

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
  const startupErrorPanel = document.getElementById("startupErrorPanel");
  const startupErrorText = document.getElementById("startupErrorText");
  const instanceSwitcher = document.getElementById("instanceSwitcher");
  const instanceSwitcherButton = document.getElementById("instanceSwitcherButton");
  const instanceSwitcherPanel = document.getElementById("instanceSwitcherPanel");
  const instanceSwitcherList = document.getElementById("instanceSwitcherList");
  const instanceSwitcherFeedback = document.getElementById("instanceSwitcherFeedback");
  const homeMenuButton = document.getElementById("homeMenuButton");
  const settingsMenuButton = document.getElementById("settingsMenuButton");
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
  const settingsScrollbackInput = document.getElementById("settingsScrollbackInput");
  const settingsScrollbackResetButton = document.getElementById("settingsScrollbackResetButton");
  const settingsDesktopMouseClipboardToggle = document.getElementById("settingsDesktopMouseClipboardToggle");
  const settingsMobilePixelScrollToggle = document.getElementById("settingsMobilePixelScrollToggle");
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
  const storagePrefix = "webshell";
  const themeStorageKey = `${storagePrefix}.theme`;
  const fontSizeStorageKey = `${storagePrefix}.fontSize`;
  const fontSizeVersionStorageKey = `${storagePrefix}.fontSizeVersion`;
  const fontSizeStorageVersion = "2";
  const lastTabStorageKey = (name) => `${storagePrefix}.lastTab.${name || "default"}`;
  const recentTabsStorageKey = (name) => `${storagePrefix}.recentTabs.${name || "default"}`;
  const restartTabStorageKey = `${storagePrefix}.restartTab`;
  const touchShortcutFeedbackStorageKey = `${storagePrefix}.touchShortcutFeedback`;
  const defaultFontSize = 16;
  const minFontSize = 10;
  const maxFontSize = 32;
  const defaultTerminalScrollback = 5000;
  const minTerminalScrollback = 100;
  const maxTerminalScrollback = 100000;
  const defaultTerminalFontFamily = '"DejaVu Sans Mono", "Liberation Mono", monospace';
  const touchShortcutMoveThresholdPx = 8;
  const touchShortcutRepeatInitialDelayMs = 320;
  const touchShortcutRepeatIntervalMs = 80;
  const touchSelectionMoveThresholdPx = 7;
  const touchSelectionLongPressDelayMs = 450;
  const mobileKeyboardDoubleTapDelayMs = 320;
  const mobileKeyboardFocusAllowWindowMs = 600;
  const mobileKeyboardFocusPrompt = "双击屏幕开启键盘输入";
  const mobileKeyboardInsetThresholdPx = 80;
  const desktopSelectionCopyMoveThresholdPx = 4;
  const terminalSizeReassertIntervalMs = 250;
  const terminalInputChunkChars = 16 * 1024;
  const terminalInputFlushDelayMs = 8;
  const terminalInputPumpChunkBudget = 4;
  const terminalInputBackpressureBytes = 512 * 1024;
  const terminalInputBackpressureDelayMs = 16;
  const maxBufferedInputBytes = 64 * 1024;
  const maxPendingInputBytes = 8 * 1024 * 1024;
  const maxQueuedInputBytes = 16 * 1024 * 1024;
  const terminalOutputFlushFallbackMs = 32;
  const maxQueuedTerminalOutputBytes = 4 * 1024 * 1024;
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
  const contextPaneActions = new Set(["copy", "paste", "select-all", "search", "split-vertical", "split-horizontal", "move-pane-new-tab", "close-pane"]);
  const contextTabActions = new Set(["rename-tab", "move-tab-first", "move-tab-left", "move-tab-right", "move-tab-last", "close-other-tabs", "close-tab"]);
  const contextLinkActions = new Set(["open-link", "copy-link"]);
  const storedFontSize = window.localStorage.getItem(fontSizeVersionStorageKey) === fontSizeStorageVersion
    ? Number(window.localStorage.getItem(fontSizeStorageKey))
    : NaN;
  let terminalFontSize = Number.isFinite(storedFontSize) ? Math.max(minFontSize, Math.min(maxFontSize, storedFontSize)) : defaultFontSize;
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

  let activeName = (params.get("name") || "").trim();
  let activeTabId = null;
  let recentTabIds = [];
  let activeInstanceGeneration = 0;
  let currentInstances = [];
  let disposed = false;
  let nextTabSeq = 1;
  let nextPaneSeq = 1;
  let contextTarget = null;
  let toastTimer = 0;
  let activeTheme = themes.find((theme) => theme.id === window.localStorage.getItem(themeStorageKey)) || themes[0];
  let uploadedFonts = [];
  let activeTerminalFontID = "";
  let terminalSymbolFont = null;
  let desktopMouseClipboardEnabled = true;
  let mobilePixelScrollEnabled = false;
  let fontEditMode = false;
  const selectedFontDeleteIDs = new Set();
  const registeredFontFaces = new Map();
  let applyingWorkspaceState = false;
  let activityRefreshTimer = 0;
  let activityRefreshDelayTimer = 0;
  let deployRestartDialogOpen = false;
  let currentServerRevision = "";
  let serverRevisionReloadPrompted = false;
  let serverRevisionRefreshTimer = 0;
  let suppressLocationUpdate = false;
  let suppressBeforeUnloadOnce = false;
  let suppressBeforeUnloadResetTimer = 0;
  let tabOverviewRenderFrame = 0;
  let tabOverviewDragState = null;
  let tabOverviewSuppressClickUntil = 0;
  let lightOSAdminInfo = null;
  let lightOSAdminInfoPromise = null;
  let lightOSAdminBaseURL = "";
  let lightOSHomeURL = "";
  let lightOSHomeURLPromise = null;
  let mobileActionSheetIgnoreClicksUntil = 0;
  let mobileCloseConfirmResolve = null;
  let mobileCustomSelectState = null;
  let mobileViewportResizeFrame = 0;
  let mobileViewportHeight = Math.max(0, Math.round(window.visualViewport?.height || window.innerHeight || 0));
  let mobileKeyboardInsetBottom = 0;
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
  let settingsScrollbackSaveTimer = 0;
  let settingsScrollbackSaveRequestSeq = 0;
  let settingsDesktopMouseClipboardRequestSeq = 0;
  let settingsMobilePixelScrollRequestSeq = 0;
  let attachmentBrowserEdgeSwipe = null;
  let mobileShortcutsSaveRequestSeq = 0;
  let mobileShortcutsSaveVersion = 0;
  let mobileShortcutsPersistChain = Promise.resolve();
  let mobileShortcutEditorState = null;
  let mobileShortcutDragState = null;
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
  const attachmentBrowserSelectedPaths = new Set();
  const attachmentBrowserEntriesByPath = new Map();
  let attachmentUploads = new Map();
  let attachmentUploadSeq = 0;
  let pendingAttachmentFileClipboard = null;
  const searchState = { open: false, query: "", matches: [], index: -1, sessionId: "" };
  const mobileSticky = { ctrl: false, alt: false, shift: false };
  let touchShortcutFeedbackEnabled = loadTouchShortcutFeedbackEnabled();
  const textEncoder = new TextEncoder();
  const serverRevisionClientID = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
  // Mobile IMEs keep Backspace auto-repeat active only while the focused editable has text.
  const terminalInputSentinel = "\u200b";
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
  const terminalOptions = () => ({ ...terminalOptionsBase, fontSize: terminalFontSize, theme: cloneTheme(activeTheme) });

  const selectStoredTheme = () => {
    activeTheme = themes.find((theme) => theme.id === window.localStorage.getItem(themeStorageKey)) || themes[0];
  };

  const loadThemeCatalog = async () => {
    try {
      const response = await fetch("./static/themes.json", { cache: "no-cache" });
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

  function cloneMobileShortcutRows(rows) {
    return [0, 1].map((rowIndex) => Array.isArray(rows?.[rowIndex])
      ? rows[rowIndex].map((shortcut) => ({
        ...shortcut,
        inputKey: String(shortcut.inputKey || shortcut.input_key || "").trim(),
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
    if (!id || !label || (!action && !inputKey)) {
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
    } else {
      next.inputKey = inputKey;
      next.data = encodeMobileShortcutKeyInput(inputKey, next.inputModifiers);
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
    if (action) {
      item.action = action;
    } else {
      item.input_key = inputKey;
      const modifiers = normalizeShortcutInputModifiers(shortcut.inputModifiers);
      if (modifiers.ctrl || modifiers.alt || modifiers.shift) {
        item.input_modifiers = modifiers;
      }
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
      url: String(font?.url || `/api/settings/fonts/${id}/file`).trim(),
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

  const fontFileSource = (font) => new URL(font.url || `/api/settings/fonts/${font.id}/file`, window.location.href).toString();

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

  const syncSettingsScrollbackInput = () => {
    if (settingsScrollbackInput) {
      settingsScrollbackInput.value = String(terminalOptionsBase.scrollback || defaultTerminalScrollback);
    }
  };

  const syncSettingsDesktopMouseClipboardToggle = () => {
    if (settingsDesktopMouseClipboardToggle) {
      settingsDesktopMouseClipboardToggle.checked = desktopMouseClipboardEnabled;
    }
  };

  const syncSettingsMobilePixelScrollToggle = () => {
    if (settingsMobilePixelScrollToggle) {
      settingsMobilePixelScrollToggle.checked = mobilePixelScrollEnabled;
    }
  };

  const setSettingsScrollbackSaving = (saving) => {
    if (settingsScrollbackResetButton) {
      settingsScrollbackResetButton.disabled = saving;
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

  const setSettingsMobilePixelScrollSaving = (saving) => {
    if (settingsMobilePixelScrollToggle) {
      settingsMobilePixelScrollToggle.disabled = saving;
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
        pane.term.options.fontFamily = terminalOptionsBase.fontFamily;
        refreshTerminalMetrics(pane);
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

  const applySettingsState = async (state, { syncScrollbackInput = true } = {}) => {
    const fonts = Array.isArray(state?.fonts)
      ? state.fonts.map(normalizeUploadedFont).filter(Boolean)
      : [];
    uploadedFonts = fonts;
    terminalSymbolFont = normalizeTerminalSymbolFont(state?.terminal_symbol_font);
    const nextFontID = String(state?.terminal_font_id || "").trim();
    activeTerminalFontID = uploadedFonts.some((font) => font.id === nextFontID) ? nextFontID : "";
    terminalOptionsBase.scrollback = normalizeTerminalScrollback(state?.terminal_scrollback);
    desktopMouseClipboardEnabled = state?.desktop_mouse_clipboard_enabled !== false;
    mobilePixelScrollEnabled = state?.mobile_pixel_scroll_enabled === true;
    applyMobileShortcutRows(normalizeMobileShortcutRows(state?.mobile_shortcuts), { remember: true });
    const hasCustomDesktopShortcuts = Array.isArray(state?.desktop_shortcuts);
    applyDesktopShortcuts(hasCustomDesktopShortcuts ? state.desktop_shortcuts : defaultDesktopShortcutsConfig, { remember: true });
    if (syncScrollbackInput) {
      syncSettingsScrollbackInput();
    }
    syncSettingsDesktopMouseClipboardToggle();
    syncSettingsMobilePixelScrollToggle();
    resizeActiveTabForCurrentDevice();
    await registerTerminalSymbolFont(terminalSymbolFont);
    await registerUploadedFonts(uploadedFonts);
    renderSettingsFonts();
    applyTerminalFont();
  };

  const loadSettings = async () => {
    const response = await fetch("./api/settings", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `设置加载失败 (${response.status})`));
    }
    await applySettingsState(await response.json());
  };

  const saveTerminalFontSelection = async (fontID) => {
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminal_font_id: fontID || "" }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `字体设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json());
  };

  const saveTerminalScrollback = async (scrollback, { syncScrollbackInput = false } = {}) => {
    const response = await fetch("./api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminal_scrollback: scrollback }),
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `滚动历史设置保存失败 (${response.status})`));
    }
    await applySettingsState(await response.json(), { syncScrollbackInput });
  };

  const saveDesktopMouseClipboardEnabled = async (enabled) => {
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
    await applySettingsState(await response.json(), { syncScrollbackInput: false });
  };

  const saveMobilePixelScrollEnabled = async (enabled) => {
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
    await applySettingsState(await response.json(), { syncScrollbackInput: false });
  };

  const saveMobileShortcuts = (rows, { reset = false } = {}) => {
    const nextRows = cloneMobileShortcutRows(rows);
    const saveVersion = ++mobileShortcutsSaveVersion;
    mobileShortcutsPersistChain = mobileShortcutsPersistChain.catch(() => {}).then(async () => {
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
          await applySettingsState(await response.json(), { syncScrollbackInput: false });
        } else {
          lastSavedMobileShortcutRowsConfig = cloneMobileShortcutRows(nextRows);
          await response.text().catch(() => "");
        }
      } finally {
        if (requestSeq === mobileShortcutsSaveRequestSeq) {
          setMobileShortcutSaving(false);
        }
      }
    });
    return mobileShortcutsPersistChain;
  };

  const saveDesktopShortcuts = (shortcuts, { reset = false } = {}) => {
    const nextShortcuts = cloneDesktopShortcuts(shortcuts);
    const saveVersion = ++desktopShortcutsSaveVersion;
    desktopShortcutsPersistChain = desktopShortcutsPersistChain.catch(() => {}).then(async () => {
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
          await applySettingsState(await response.json(), { syncScrollbackInput: false });
        } else {
          lastSavedDesktopShortcutsConfig = cloneDesktopShortcuts(nextShortcuts);
          await response.text().catch(() => "");
        }
      } finally {
        if (requestSeq === desktopShortcutsSaveRequestSeq) {
          setDesktopShortcutSaving(false);
        }
      }
    });
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
    const nextType = type === "action" ? "action" : "input";
    for (const input of mobileShortcutTypeInputs) {
      input.checked = input.value === nextType;
    }
  };

  const syncMobileShortcutEditorFields = () => {
    const type = selectedMobileShortcutType();
    const isInput = type === "input";
    if (mobileShortcutKeyField) {
      mobileShortcutKeyField.hidden = !isInput;
    }
    if (mobileShortcutActionField) {
      mobileShortcutActionField.hidden = isInput;
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
    const isAction = Boolean(existing?.action);
    setSelectedMobileShortcutType(isAction ? "action" : "input");
    if (mobileShortcutActionSelect) {
      mobileShortcutActionSelect.value = existing?.action || "copy";
    }
    const inputKey = existing?.inputKey || "tab";
    const isKnownKey = inputKey !== "" && mobileShortcutKeyOptions.some((item) => item.value === inputKey);
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

  const saveTerminalScrollbackFromInput = () => {
    let scrollback = defaultTerminalScrollback;
    try {
      scrollback = readSettingsScrollbackInput();
    } catch (error) {
      return;
    }
    if (scrollback === terminalOptionsBase.scrollback) {
      return;
    }
    const requestSeq = ++settingsScrollbackSaveRequestSeq;
    setSettingsScrollbackSaving(true);
    saveTerminalScrollback(scrollback)
      .catch(() => {})
      .finally(() => {
        if (requestSeq === settingsScrollbackSaveRequestSeq) {
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
    settingsScrollbackSaveTimer = window.setTimeout(saveTerminalScrollbackFromInput, 360);
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
    closeInstanceSwitcher();
    renderSettingsMobileNav();
    settingsMobileView = isMobileLayout() ? "index" : "detail";
    setActiveSettingsTab(tabID);
    renderSettingsFonts();
    renderSettingsThemeList();
    renderSettingsMobileShortcuts();
    renderServiceForwardSettings();
    syncSettingsScrollbackInput();
    syncSettingsDesktopMouseClipboardToggle();
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
    const name = String(item?.name || "").trim();
    const ownerDeployID = String(item?.owner_deploy_id || "").trim();
    if (!name || !ownerDeployID) {
      return "";
    }
    return `${name}@${ownerDeployID}`;
  };

  const instanceDisplayName = (item) => String(item?.name || "").trim() || instanceSelector(item).split("@", 1)[0];
  const getActiveInstance = () => currentInstances.find((item) => instanceSelector(item) === activeName) || null;
  const isRunningInstance = (item) => item?.status === "running";
  const setActiveInstanceName = (name) => {
    const normalized = String(name || "").trim();
    if (normalized !== activeName) {
      activeName = normalized;
      activeInstanceGeneration += 1;
    }
    return activeInstanceGeneration;
  };
  const isCurrentInstanceRequest = (name, generation) =>
    String(name || "").trim() === activeName && generation === activeInstanceGeneration;
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
    ["switch_container", "切换容器"],
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
    { id: "switch-container", label: "切换容器", action: "switch_container", shortcut: shortcutDefinitions.switch_container },
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

  const loadInstances = async () => {
    const response = await fetch("./api/instances", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load instances (${response.status})`);
    }
    const instances = await response.json();
    if (!Array.isArray(instances)) {
      throw new Error("Invalid instances response");
    }
    currentInstances = instances;
    return instances;
  };

  const loadDefaultInstanceName = async () => {
    const instances = currentInstances.length > 0 ? currentInstances : await loadInstances();
    const target = instances.find((item) => isRunningInstance(item));
    const targetName = instanceSelector(target);
    if (!targetName) {
      throw new Error("No running LightOS instance found");
    }
    return targetName;
  };

  const buildExplicitHomeURL = (value) => {
    const targetURL = new URL(String(value || "").trim(), window.location.href);
    targetURL.searchParams.set("view", "home");
    return targetURL.toString();
  };

  const resolveReferrerHomeURL = () => {
    try {
      const referrerURL = new URL(document.referrer);
      if (referrerURL.origin === window.location.origin) {
        return "";
      }
      referrerURL.pathname = "/";
      referrerURL.search = "";
      referrerURL.hash = "";
      return buildExplicitHomeURL(referrerURL.toString());
    } catch (error) {
      return "";
    }
  };

  const loadLightOSAdminInfo = async () => {
    if (lightOSAdminInfo?.base_url) {
      return lightOSAdminInfo;
    }
    if (!lightOSAdminInfoPromise) {
      lightOSAdminInfoPromise = fetch("./api/lightos-admin-info", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await response.text() || `无法获取 LightOS 管理地址 (${response.status})`);
          }
          const info = await response.json();
          const baseURL = String(info?.base_url || "").trim();
          if (!baseURL) {
            throw new Error("LightOS 管理地址不可用。");
          }
          lightOSAdminInfo = {
            ...info,
            deploy_id: String(info?.deploy_id || "").trim(),
            domain: String(info?.domain || "").trim(),
            base_url: baseURL,
          };
          return lightOSAdminInfo;
        })
        .finally(() => {
          lightOSAdminInfoPromise = null;
        });
    }
    return lightOSAdminInfoPromise;
  };

  const loadLightOSAdminBaseURL = async () => {
    if (lightOSAdminBaseURL) {
      return lightOSAdminBaseURL;
    }
    const info = await loadLightOSAdminInfo();
    const parsed = new URL(String(info?.base_url || "").trim(), window.location.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("LightOS 管理地址协议无效。");
    }
    lightOSAdminBaseURL = parsed.toString();
    return lightOSAdminBaseURL;
  };

  const loadLightOSHomeURL = async () => {
    if (lightOSHomeURL) {
      return lightOSHomeURL;
    }
    if (!lightOSHomeURLPromise) {
      lightOSHomeURLPromise = loadLightOSAdminInfo()
        .then((info) => buildExplicitHomeURL(info.base_url))
        .catch((error) => {
          const fallback = resolveReferrerHomeURL();
          if (fallback) {
            return fallback;
          }
          throw error;
        })
        .then((url) => {
          lightOSHomeURL = url;
          return url;
        })
        .finally(() => {
          lightOSHomeURLPromise = null;
        });
    }
    return lightOSHomeURLPromise;
  };

  const terminalSizeQuery = () => {
    const tab = currentTab();
    const pane = tab?.panes.get(tab.activePaneId);
    return {
      cols: pane?.term?.cols || 120,
      rows: pane?.term?.rows || 32,
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
    currentServerRevision = nextRevision;
    if (state?.reload_required !== true || serverRevisionReloadPrompted) {
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
    if (!isCurrentInstanceRequest(requestName, generation)) {
      return;
    }
    observeServerRevision(await response.json());
  };

  const startServerRevisionRefresh = () => {
    window.clearInterval(serverRevisionRefreshTimer);
    serverRevisionRefreshTimer = window.setInterval(() => {
      if (navigator.onLine !== false) {
        refreshServerRevision().catch(() => {});
      }
    }, 1800);
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

  const postWorkspaceAction = async (action, payload = {}) => {
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
    applyWorkspaceState(state, { focus: true, instanceName: requestName, generation, preferStateActiveTab: true });
    return state;
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

  const rememberActiveTab = () => {
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
    closeInstanceSwitcher();
    rememberActiveTab();
    if (homeMenuButton) {
      homeMenuButton.disabled = true;
    }
    try {
      const targetURL = await loadLightOSHomeURL();
      suppressBeforeUnloadForNavigation();
      window.location.assign(targetURL);
    } catch (error) {
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
  const terminalCellFlagInverse = 16;
  const terminalCellFlagInvisible = 32;
  const terminalCellFlagFaint = 128;
  const terminalBaselineSampleText = "\uF303\uF017Hg|pqyj\u00C5\u00C9()[]{}0123456789";

  const terminalAdjustedFontMetrics = (renderer, metrics) => {
    const width = Number(metrics?.width) || 0;
    const height = Number(metrics?.height) || 0;
    const baseline = Number(metrics?.baseline) || 0;
    if (!renderer || !width || !height || !baseline) {
      return metrics;
    }
    const context = document.createElement("canvas").getContext("2d");
    if (!context) {
      return metrics;
    }
    context.font = `${renderer.fontSize}px ${renderer.fontFamily}`;
    context.textBaseline = "alphabetic";
    const measured = context.measureText(terminalBaselineSampleText);
    const ascent = Number(measured.actualBoundingBoxAscent);
    const descent = Number(measured.actualBoundingBoxDescent);
    if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent <= 0) {
      return metrics;
    }
    const nextHeight = Math.max(height, Math.ceil(ascent + descent) + 2);
    const nextBaseline = Math.round((nextHeight + ascent - descent) / 2);
    return {
      ...metrics,
      height: nextHeight,
      baseline: Math.max(1, Math.min(nextHeight - 1, nextBaseline)),
    };
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
      if (session.term.wasmTerm && typeof session.term.renderer.render === "function") {
        session.term.renderer.render(session.term.wasmTerm, true, session.term.viewportY || 0, session.term);
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
      }
    }
    resizeActiveTab();
    scheduleTabOverviewRender();
  };

  const openThemePicker = () => {
    closeContextMenu();
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

  const shouldShowMobileKeyboardFocusPrompt = () => {
    if (!mobileLayoutQuery?.matches) {
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
      : String(currentTab()?.label || "终端").trim() || "终端";
    mobileActiveTabTitle.textContent = label;
    mobileActiveTabTitle.title = label;
  };

  const isMobileLayout = () => Boolean(mobileLayoutQuery?.matches);
  const isTouchShortcutLayout = () => Boolean(touchShortcutLayoutQuery?.matches);

  const isMobileCustomSelectLayout = () => isMobileLayout() || isTouchShortcutLayout();

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

  const resetTerminalAfterInitialFit = (session) => {
    const term = session?.term;
    if (!term || session.initialFitResetDone) {
      return;
    }
    session.initialFitResetDone = true;
    if (typeof term.reset === "function") {
      term.reset();
    }
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

    const source = pane?.term?.canvas || pane?.term?.element?.querySelector?.("canvas");
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

  const renderTabOverview = () => {
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
    }
  };

  const scheduleTabOverviewRender = () => {
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

  const setActivePane = (tab, paneId, { focus = true } = {}) => {
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
    if (focus) {
      window.requestAnimationFrame(() => {
        resizePane(activePane);
        activePane?.term?.focus();
      });
    }
    if (!applyingWorkspaceState && !wasActive) {
      postWorkspaceAction("activate_pane", { tab_id: tab.id, pane_id: paneId }).catch((error) => showToast(error.message));
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
    if (!textarea || session.composingIME) {
      return;
    }
    if (textarea.value !== terminalInputSentinel) {
      textarea.value = terminalInputSentinel;
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
    session.compositionText = normalized;
    return normalized;
  };

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

  const syncTerminalCompositionPreview = (session, { x = 0, y = 0, width = 1, height = 16 } = {}) => {
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
    preview.style.height = `${height}px`;
    preview.style.lineHeight = `${height}px`;
    preview.style.font = `${terminalFontSize}px ${terminalOptionsBase.fontFamily}`;
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
    const left = cursorX * width;
    const top = cursorY * height;
    textarea.style.position = "absolute";
    textarea.style.left = `${left}px`;
    textarea.style.top = `${top}px`;
    textarea.style.width = `${Math.max(width, 2)}px`;
    textarea.style.height = `${height}px`;
    textarea.style.lineHeight = `${height}px`;
    textarea.style.font = `${terminalFontSize}px ${terminalOptionsBase.fontFamily}`;
    textarea.style.padding = "0";
    textarea.style.border = "0";
    textarea.style.outline = "0";
    textarea.style.boxShadow = "none";
    textarea.style.appearance = "none";
    textarea.style.webkitAppearance = "none";
    textarea.style.margin = "0";
    textarea.style.opacity = "0";
    textarea.style.clipPath = "none";
    textarea.style.overflow = "hidden";
    textarea.style.whiteSpace = "pre";
    textarea.style.resize = "none";
    textarea.style.color = "transparent";
    textarea.style.background = "transparent";
    textarea.style.caretColor = "transparent";
    textarea.style.pointerEvents = "none";
    textarea.style.zIndex = "1";
    prepareTerminalTextareaForInput(session);
    syncTerminalCompositionPreview(session, { x: left, y: top, width, height });
  };

  const focusTerminalInput = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea) {
      return;
    }
    if (isMobileLayout() && performance.now() > Number(session?.allowMobileKeyboardFocusUntil || 0)) {
      blurTerminalInput(session);
      return;
    }
    positionTerminalInput(session);
    try {
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.focus();
    }
    prepareTerminalTextareaForInput(session);
    resetTerminalHostViewport(session, { clean: true });
    updateMobileActiveTabTitle();
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
    focusTerminalInput(targetSession);
  };

  const focusTerminalForNativePasteShortcut = (session = activeSession()) => {
    if (!session?.term || session.closed) {
      return;
    }
    if (isMobileLayout()) {
      session.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;
    }
    focusTerminalInput(session);
  };

  const setTerminalInputComposing = (session, composing) => {
    session.composingIME = composing;
    if (composing) {
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

  const armTerminalPostCompositionInput = (session, { preedit = "", committed = "", sent = false } = {}) => {
    if (!session) {
      return null;
    }
    const pending = {
      preedit: stripTerminalInputSentinel(preedit),
      committed: stripTerminalInputSentinel(committed),
      sent: Boolean(sent),
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
    const preedit = pending.preedit || "";
    const committed = pending.committed || "";
    let data = rawValue;
    let handled = false;
    if (!rawValue || rawValue === preedit) {
      data = "";
      handled = true;
    } else if (pending.sent && (rawValue === committed || (preedit && rawValue === `${preedit}${committed}`))) {
      data = "";
      handled = true;
    } else if (!pending.sent && preedit && rawValue.startsWith(preedit)) {
      data = rawValue.slice(preedit.length);
      handled = true;
    } else if (!pending.sent && committed && rawValue === committed) {
      data = committed;
      handled = true;
    } else if (!pending.sent && !committed) {
      data = rawValue;
      handled = true;
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
      preedit: pending?.preedit || "",
      committed: committedText,
      sent: true,
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
    if (!textarea || session.composingIME) {
      return;
    }
    textarea.value = terminalInputSentinel;
    moveTerminalTextareaCaretToEnd(textarea);
    positionTerminalInput(session);
  };

  const handleTerminalBeforeInput = (session, event) => {
    reassertTerminalSize(session, { force: true });
    const type = String(event.inputType || "");
    const textarea = session?.term?.textarea;
    if (type === "insertCompositionText" || type === "deleteCompositionText" || event.isComposing) {
      setTerminalInputComposing(session, true);
      if (typeof event.data === "string") {
        setTerminalTextareaCompositionText(session, event.data);
      }
      scrollTerminalToBottomForUserInput(session);
      clearTerminalTextareaSentinel(session);
      positionTerminalInput(session);
      scheduleTerminalHostViewportReset(session, { clean: true });
      event.stopPropagation();
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
      data = event.dataTransfer?.getData("text/plain") || event.data || "";
    } else if (event.data) {
      data = event.data;
    }
    const pendingComposition = session?.pendingCompositionInput;
    const compositionValue = data ? resolveTerminalPostCompositionInput(session, data) : null;
    if (compositionValue !== null) {
      event.preventDefault();
      event.stopPropagation();
      setTerminalInputComposing(session, false);
      if (textarea) {
        textarea.value = terminalInputSentinel;
        moveTerminalTextareaCaretToEnd(textarea);
      }
      if (compositionValue) {
        sendTerminalTextInput(session, compositionValue, { dedupe: true });
        rememberTerminalPostCompositionSentInput(session, pendingComposition, compositionValue);
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      return;
    }
    if (!data) {
      if (type.startsWith("insert") || type.startsWith("delete")) {
        event.stopPropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setTerminalInputComposing(session, false);
    if (textarea) {
      textarea.value = terminalInputSentinel;
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
      const pendingComposition = session?.pendingCompositionInput;
      const compositionValue = (value || (!isBackwardDeleteInputType(type) && !isForwardDeleteInputType(type)))
        ? resolveTerminalPostCompositionInput(session, value)
        : null;
      if (compositionValue !== null) {
        if (compositionValue) {
          sendTerminalTextInput(session, compositionValue, { dedupe: true });
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
      textarea.value = terminalInputSentinel;
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
    for (const type of blockedHostInputEvents) {
      host.addEventListener(type, stopHostEditableInput, { capture: true });
    }
    addSessionCleanup(session, () => {
      for (const type of blockedHostInputEvents) {
        host.removeEventListener(type, stopHostEditableInput, { capture: true });
      }
    });
  };

  const installTerminalInputFocus = (session) => {
    const term = session?.term;
    const host = session?.terminalHost;
    const textarea = term?.textarea;
    if (!term || !host || !textarea) {
      return;
    }
    textarea.setAttribute("inputmode", "text");
    textarea.setAttribute("enterkeyhint", "enter");
    term.focus = () => focusTerminalInput(session);
    textarea.addEventListener("focus", updateMobileActiveTabTitle);
    textarea.addEventListener("blur", updateMobileActiveTabTitle);
    let lastMobileTapAt = 0;
    let lastMobileTapX = 0;
    let lastMobileTapY = 0;
    let mobileTapTouchState = null;
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
      const committedText = typeof event.data === "string" ? stripTerminalInputSentinel(event.data) : "";
      setTerminalInputComposing(session, false);
      armTerminalPostCompositionInput(session, {
        preedit: preeditText,
        committed: committedText,
        sent: Boolean(committedText),
      });
      if (committedText) {
        sendTerminalTextInput(session, committedText, { dedupe: true });
      }
      window.setTimeout(() => {
        const fallbackValue = stripTerminalInputSentinel(textarea.value);
        if (fallbackValue) {
          const pendingComposition = session?.pendingCompositionInput;
          const compositionValue = resolveTerminalPostCompositionInput(session, fallbackValue);
          if (compositionValue) {
            sendTerminalTextInput(session, compositionValue, { dedupe: true });
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
      pasteIntoSession(session, text).catch((error) => showToast(error.message));
    }, { capture: true });
    host.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        return;
      }
      window.requestAnimationFrame(() => focusTerminalInput(session));
    });
    host.addEventListener("touchstart", (event) => {
      if (!isMobileLayout() || event.touches.length !== 1) {
        mobileTapTouchState = null;
        return;
      }
      blurTerminalInput(session);
      const touch = event.touches[0];
      mobileTapTouchState = {
        startX: touch.clientX,
        startY: touch.clientY,
        moved: false,
      };
    }, { passive: true });
    host.addEventListener("touchmove", (event) => {
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
    }, { passive: true });
    const finishMobileTap = (event) => {
      if (!isMobileLayout() || !mobileTapTouchState) {
        mobileTapTouchState = null;
        return;
      }
      const touch = primaryTouch(event);
      const state = mobileTapTouchState;
      mobileTapTouchState = null;
      if (!touch || state.moved) {
        return;
      }
      const now = performance.now();
      const dx = touch.clientX - lastMobileTapX;
      const dy = touch.clientY - lastMobileTapY;
      const isDoubleTap = now - lastMobileTapAt <= mobileKeyboardDoubleTapDelayMs && Math.hypot(dx, dy) < touchShortcutMoveThresholdPx * 2;
      lastMobileTapAt = now;
      lastMobileTapX = touch.clientX;
      lastMobileTapY = touch.clientY;
      if (!isDoubleTap) {
        blurTerminalInput(session);
        return;
      }
      session.allowMobileKeyboardFocusUntil = now + mobileKeyboardFocusAllowWindowMs;
      event.preventDefault();
      window.requestAnimationFrame(() => focusTerminalInput(session));
    };
    host.addEventListener("touchend", finishMobileTap, { passive: false });
    host.addEventListener("touchcancel", () => {
      mobileTapTouchState = null;
    }, { passive: true });
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

  const sendTerminalSize = (pane) => {
    if (pane?.socket?.readyState === WebSocket.OPEN) {
      pane.socket.send(JSON.stringify({ type: "resize", cols: pane.term.cols, rows: pane.term.rows }));
    }
  };

  const resizePane = (pane) => {
    if (!pane || pane.closed) {
      return;
    }
    try {
      pane.fitAddon.fit();
    } catch (error) {
      return;
    }
    resetTerminalHostViewport(pane, { clean: true });
    positionTerminalInput(pane);
    if (!pane.initialFitResetDone && !pane.replayComplete) {
      resetTerminalAfterInitialFit(pane);
    }
    sendTerminalSize(pane);
  };

  const resizeTab = (tab) => {
    if (!tab) {
      return;
    }
    for (const pane of tab.panes.values()) {
      resizePane(pane);
    }
  };

  const resizeActiveTab = () => resizeTab(currentTab());

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

  const resizeTabForCurrentDevice = (tab) => {
    if (!tab) {
      return;
    }
    syncTabMobilePixelScroll(tab);
    resizeTab(tab);
  };

  const resizeActiveTabForCurrentDevice = () => resizeTabForCurrentDevice(currentTab());

  const handleMobileViewportResize = () => {
    mobileViewportResizeFrame = 0;
    resizeActiveTabForCurrentDevice();
    const session = activeSession();
    positionTerminalInput(session);
    updateMobileSelectionHandles(session);
    updateSelectionSheet();
    if (mobileActionSheet && !mobileActionSheet.hidden) {
      renderMobileActionSheet();
    }
    scheduleTabOverviewRender();
  };

  const scheduleMobileViewportResize = () => {
    if (mobileViewportResizeFrame) {
      return;
    }
    mobileViewportResizeFrame = window.requestAnimationFrame(handleMobileViewportResize);
  };

  const syncMobileVisualViewport = () => {
    const useKeyboardInset = isIOSPlatform();
    const visualViewport = window.visualViewport;
    const nextHeight = Math.max(0, Math.round(visualViewport?.height || window.innerHeight || 0));
    if (nextHeight > 0) {
      document.documentElement.style.setProperty("--mobile-visual-viewport-height", `${nextHeight}px`);
    }
    if (!useKeyboardInset) {
      const insetChanged = mobileKeyboardInsetBottom !== 0;
      const heightChanged = nextHeight !== mobileViewportHeight;
      mobileViewportHeight = nextHeight;
      mobileKeyboardInsetBottom = 0;
      document.documentElement.style.setProperty("--mobile-keyboard-inset-bottom", "0px");
      document.body.classList.remove("mobile-keyboard-visible");
      if (heightChanged || insetChanged) {
        scheduleMobileViewportResize();
      }
      return;
    }
    const measuredInset = visualViewport
      ? Math.max(0, Math.round((window.innerHeight || 0) - visualViewport.height - visualViewport.offsetTop))
      : 0;
    const nextInset = measuredInset > mobileKeyboardInsetThresholdPx ? measuredInset : 0;
    const heightChanged = nextHeight !== mobileViewportHeight;
    const insetChanged = nextInset !== mobileKeyboardInsetBottom;
    mobileViewportHeight = nextHeight;
    mobileKeyboardInsetBottom = nextInset;
    document.documentElement.style.setProperty("--mobile-keyboard-inset-bottom", `${nextInset}px`);
    document.body.classList.toggle("mobile-keyboard-visible", nextInset > mobileKeyboardInsetThresholdPx);
    if (heightChanged || insetChanged) {
      scheduleMobileViewportResize();
    }
  };

  const activeSession = () => {
    const tab = currentTab();
    return tab?.panes.get(tab.activePaneId) || null;
  };

  const refreshTerminalMetrics = (session) => {
    if (!session?.term) {
      return;
    }
    try {
      installRendererBaselinePatch(session);
      if (session.term.renderer && typeof session.term.renderer.measureFont === "function") {
        session.term.renderer.metrics = session.term.renderer.measureFont();
      }
      if (session.term.renderer && session.term.wasmTerm && typeof session.term.renderer.render === "function") {
        session.term.renderer.render(session.term.wasmTerm, true, session.term.viewportY || 0, session.term);
      }
      resizePane(session);
    } catch (error) {
    }
  };

  const setTerminalFontSize = (size) => {
    terminalFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.round(size)));
    terminalOptionsBase.fontSize = terminalFontSize;
    window.localStorage.setItem(fontSizeVersionStorageKey, fontSizeStorageVersion);
    window.localStorage.setItem(fontSizeStorageKey, String(terminalFontSize));
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        pane.term.options.fontSize = terminalFontSize;
        refreshTerminalMetrics(pane);
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
    if (!term?.renderer || !term?.wasmTerm) {
      return;
    }
    try {
      term.renderer.render(term.wasmTerm, true, term.viewportY || 0, term);
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
      });
    }
    return confirmDialog(message, options);
  };

  const promptDialog = async (title, value) => {
    const result = await openDialog({ mode: "prompt", title, value, okText: "保存", cancelText: "取消" });
    return result === null ? null : String(result || "").trim();
  };

  const displayPathLabel = (path) => {
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
      pane.shellEl.dataset.busy = pane.busy ? "true" : "false";
      markSessionActivityNotification(pane, wasBusy, isBusy);
      markSessionIdleNotification(pane, wasBusy, isBusy);
      if (tab.activePaneId === pane.id) {
        refreshTabAutoLabel(tab);
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
    observeServerRevision(state);
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
      term.stopTouchInertia?.();
      if (term.scrollAnimationFrame) {
        window.cancelAnimationFrame(term.scrollAnimationFrame);
        term.scrollAnimationFrame = void 0;
      }
      term.scrollAnimationStartTime = void 0;
      term.scrollAnimationStartY = void 0;
      term.scrollAnimationLastFrameTime = void 0;
      term.scrollToBottom();
      if (term.renderer && term.wasmTerm && typeof term.renderer.render === "function") {
        term.renderer.render(term.wasmTerm, true, term.viewportY || 0, term);
      }
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
    networkBanner.textContent = message || "Offline. Reconnecting when network is back.";
    networkBanner.hidden = !visible;
  };

  const reconnectVisibleSessions = () => {
    if (disposed || navigator.onLine === false) {
      return;
    }
    const tab = currentTab();
    for (const pane of tab?.panes.values() || []) {
      if (pane.name === activeName) {
        connectSession(pane).catch((error) => showToast(error.message));
      }
    }
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
      !isMobileLayout() ||
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
    if (!overlay || !term?.hasSelection?.() || !position || !canvas || !metrics?.width || !metrics?.height || !isMobileLayout()) {
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
    copy: { paths: [{ d: "M8 8h10v12H8z" }, { d: "M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }] },
    paste: { paths: [{ d: "M9 4h6l1 2h2v15H6V6h2z" }, { d: "M9 4h6" }, { d: "M9 10h6" }, { d: "M9 14h6" }] },
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

  const describeMobileShortcut = (shortcut) => {
    if (shortcut?.action) {
      return mobileShortcutActionLabels.get(shortcut.action) || shortcut.action;
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
    let shortcutSession = null;
    let suppressNextClick = false;
    let repeatDelayTimer = 0;
    let repeatTimer = 0;
    let repeatTriggered = false;

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
    };

    const updateTouchMoved = (clientX, clientY) => {
      if (touchMoved || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
      }
      if (
        Math.abs(clientX - touchStartX) >= touchShortcutMoveThresholdPx ||
        Math.abs(clientY - touchStartY) >= touchShortcutMoveThresholdPx
      ) {
        touchMoved = true;
        stopRepeat();
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
      shortcutSession = activeSession();
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
        if (shortcut.action) {
          button.dataset.mobileAction = shortcut.action;
        }
        if (shortcut.kind) {
          button.dataset.kind = shortcut.kind;
        }
        if (shortcut.icon && shortcut.action !== "open_mobile_menu") {
          button.appendChild(createSVGIcon(shortcut.icon, "mobile-shortcut-icon"));
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
      return;
    }
    if (role === "start") {
      const nextStart = compareSelectionCells(point, selection.end) >= 0
        ? previousSelectionCell(session, selection.end)
        : point;
      applyTerminalSelection(session, nextStart, selection.end);
      return;
    }
    const nextEnd = compareSelectionCells(point, selection.start) <= 0
      ? nextSelectionCell(session, selection.start)
      : point;
    applyTerminalSelection(session, selection.start, nextEnd);
  };

  const bindMobileSelectionHandle = (session, handle, role) => {
    let dragging = false;
    handle.addEventListener("touchstart", (event) => {
      if (!isMobileLayout() || event.touches.length !== 1) {
        return;
      }
      dragging = true;
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
    }, { passive: false });
    handle.addEventListener("touchmove", (event) => {
      if (!dragging) {
        return;
      }
      const touch = primaryTouch(event);
      if (!touch) {
        return;
      }
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
      updateSelectionFromHandleTouch(session, role, touch);
    }, { passive: false });
    const finish = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      suppressTerminalTouchScroll(session);
      stopMobileSelectionEvent(event);
      updateMobileSelectionHandles(session);
    };
    handle.addEventListener("touchend", finish, { passive: false });
    handle.addEventListener("touchcancel", finish, { passive: false });
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
      if (!state || touchState === state) {
        touchState = null;
      }
    };
    const beginTouchSelection = (state, touch = null) => {
      if (!state || touchState !== state || state.selecting || !isMobileLayout() || session.closed) {
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
      if (!isMobileLayout() || event.touches.length !== 1 || (mobileActionSheet && !mobileActionSheet.hidden)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".mobile-selection-handle") || !target.closest(".terminal-host")) {
        return;
      }
      const touch = event.touches[0];
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
      const current = terminalCellFromPoint(session, touch.clientX, touch.clientY);
      if (!current) {
        return;
      }
      const currentTabForSession = tabs.get(session.tabId);
      setActivePane(currentTabForSession, session.id, { focus: false });
      session.selectAllBufferActive = false;
      applyTerminalSelection(session, state.startCell, current);
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

  const clearReconnectTimer = (session) => {
    if (session?.reconnectTimer) {
      window.clearTimeout(session.reconnectTimer);
      session.reconnectTimer = 0;
    }
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

  const sendSessionInputChunk = (session, data, { generated = false } = {}) => {
    if (!data || session?.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      session.socket.send(JSON.stringify(generated ? { type: "input", data, generated: true } : { type: "input", data }));
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
    if (!session.inputBuffer || session.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const data = session.inputBuffer;
    session.inputBuffer = "";
    session.inputBufferSize = 0;
    if (!sendSessionInputChunk(session, data)) {
      session.inputBuffer = data + session.inputBuffer;
      session.inputBufferSize += textEncoder.encode(data).length;
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
      while (session.inputQueue.length > 0 && session.socket?.readyState === WebSocket.OPEN) {
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
    if (session.inputQueue.length > 0 && session.socket?.readyState === WebSocket.OPEN) {
      scheduleQueuedInputPump(session, terminalInputBackpressureDelayMs);
    }
  };

  const sendSessionInput = (session, data, { immediate = false, generated = false } = {}) => {
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    if (!data || session.socket?.readyState !== WebSocket.OPEN) {
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
    if (immediate || session.inputBufferSize >= 4096) {
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
    for (const data of session.pendingInput || []) {
      sendSessionInput(session, data);
    }
    session.pendingInput = [];
    session.pendingInputSize = 0;
    flushInputBuffer(session);
    scheduleQueuedInputPump(session);
  };

  const sendOrQueueInput = (session, data, { userInput = true } = {}) => {
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    if (shouldSuppressGeneratedTerminalInput(session, data)) {
      return;
    }
    if (data && userInput) {
      markSessionUserInput(session);
      scrollTerminalToBottomForUserInput(session);
    }
    if (session.closed || session.exitExpected) {
      return;
    }
    if (/[\r\n]/.test(data)) {
      scheduleActivityRefresh(450);
    }
    if (session.replayComplete) {
      if (session.socket?.readyState === WebSocket.OPEN) {
        sendSessionInput(session, data, { immediate: /[\r\n\x03\x04]/.test(data) });
      } else {
        const availablePendingBytes = Math.max(0, maxPendingInputBytes - session.pendingInputSize);
        const { byteLength, exceeded } = buildTerminalInputQueueItems(data, { maxBytes: availablePendingBytes });
        if (exceeded) {
          return;
        }
        if (session.pendingInputSize + byteLength > maxPendingInputBytes) {
          return;
        }
        session.pendingInput.push(data);
        session.pendingInputSize += byteLength;
      }
      return;
    }
    const availablePendingBytes = Math.max(0, maxPendingInputBytes - session.pendingInputSize);
    const { byteLength, exceeded } = buildTerminalInputQueueItems(data, { maxBytes: availablePendingBytes });
    if (exceeded) {
      return;
    }
    if (session.pendingInputSize + byteLength > maxPendingInputBytes) {
      return;
    }
    session.pendingInput.push(data);
    session.pendingInputSize += byteLength;
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
      return textEncoder.encode(data).length;
    }
    if (data instanceof Uint8Array) {
      return data.byteLength;
    }
    return 0;
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

  const writeTerminalOutputBatch = (session, data, replayOutput, allowGeneratedInput) => {
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
    try {
      session.term.write(data);
      drainGeneratedTerminalResponses(session);
      return true;
    } finally {
      if (replayOutput) {
        session.replayOutputDepth = Math.max(0, session.replayOutputDepth - 1);
        session.allowGeneratedInputDuringReplay = previousAllowGeneratedInput;
      }
    }
  };

  const discardSessionOutputBuffers = (session) => {
    if (!session) {
      return;
    }
    clearSessionOutputFlushSchedule(session);
    session.outputQueue = [];
    session.outputQueueSize = 0;
  };

  const flushSessionOutput = (session, { force = false } = {}) => {
    if (!session) {
      return;
    }
    clearSessionOutputFlushSchedule(session);
    const queue = Array.isArray(session.outputQueue) ? session.outputQueue : [];
    if (queue.length === 0) {
      return;
    }
    session.outputQueue = [];
    session.outputQueueSize = 0;
    if (!session.term || (!force && (session.closed || session.name !== activeName))) {
      return;
    }

    let wrote = false;
    let batch = null;
    const flushBatch = () => {
      if (!batch) {
        return;
      }
      const data = coalesceTerminalOutputBatch(batch.chunks, batch.kind, batch.byteLength);
      if (writeTerminalOutputBatch(session, data, batch.replayOutput, batch.allowGeneratedInput)) {
        wrote = true;
      }
      batch = null;
    };

    for (const entry of queue) {
      if (
        !batch ||
        batch.kind !== entry.kind ||
        batch.replayOutput !== entry.replayOutput ||
        batch.allowGeneratedInput !== entry.allowGeneratedInput
      ) {
        flushBatch();
        batch = {
          kind: entry.kind,
          replayOutput: entry.replayOutput,
          allowGeneratedInput: entry.allowGeneratedInput,
          chunks: [],
          byteLength: 0,
        };
      }
      batch.chunks.push(entry.data);
      batch.byteLength += entry.byteLength;
    }
    flushBatch();

    if (wrote) {
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
    }
  };

  const scheduleSessionOutputFlush = (session) => {
    if (!session || session.closed || session.outputFlushFrame || session.outputFlushTimer) {
      return;
    }
    const flush = () => flushSessionOutput(session);
    session.outputFlushFrame = window.requestAnimationFrame(flush);
    session.outputFlushTimer = window.setTimeout(flush, terminalOutputFlushFallbackMs);
  };

  const writeSessionOutput = (session, data) => {
    if (!session?.term || session.closed || session.name !== activeName) {
      return;
    }
    const outputData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const kind = terminalOutputKind(outputData);
    if (!kind) {
      return;
    }
    // Output chunks carry replay state because the replay-complete control frame can arrive before the next paint.
    const replayOutput = !session.replayComplete;
    const entry = {
      data: outputData,
      kind,
      byteLength: terminalOutputByteLength(outputData),
      replayOutput,
      allowGeneratedInput: replayOutput && session.allowGeneratedInputDuringReplay === true,
    };
    session.outputQueue.push(entry);
    session.outputQueueSize += entry.byteLength;
    if (session.outputQueueSize >= maxQueuedTerminalOutputBytes) {
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
    session.term.write(data);
    drainGeneratedTerminalResponses(session);
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
  };

  const readAgentStartupError = async (name) => {
    const response = await fetch(agentStartupErrorURL(name), { cache: "no-store" });
    if (!response.ok) {
      return "";
    }
    const data = await response.json();
    return String(data?.error || "").trim();
  };

  const writeSessionWebShellError = (session, message) => {
    const text = String(message || "").trim();
    if (!text || !session || session.closed || session.name !== activeName) {
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

  const showSessionStartupError = async (session, fallback = "") => {
    if (!session || session.closed || session.name !== activeName) {
      return;
    }
    let message = "";
    try {
      message = await readAgentStartupError(session.name);
    } catch (error) {
    }
    if (message) {
      writeSessionWebShellError(session, message);
      return;
    }
    if (isGenericWebSocketStartupFallback(fallback)) {
      return;
    }
    writeSessionWebShellError(session, fallback);
  };

  const scheduleReconnect = (session) => {
    if (disposed || session.closed || session.reconnectPending || session.name !== activeName) {
      return;
    }
    if (navigator.onLine === false) {
      setNetworkBanner(true);
      return;
    }
    session.reconnectPending = true;
    clearReconnectTimer(session);
      session.reconnectTimer = window.setTimeout(() => {
        session.reconnectTimer = 0;
        session.reconnectPending = false;
        if (session.name !== activeName) {
          return;
        }
        connectSession(session).catch((error) => {
          showSessionStartupError(session, error.message || "WebSocket reconnect failed.");
        });
      }, 240);
  };

  const connectSession = async (session) => {
    if (
      !session ||
      session.closed ||
      session.name !== activeName ||
      navigator.onLine === false ||
      session.socket?.readyState === WebSocket.OPEN ||
      session.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    clearReconnectTimer(session);
    const socketUrl = webSocketURL("./ws");
    socketUrl.searchParams.set("name", session.name);
    socketUrl.searchParams.set("pane", session.id);
    socketUrl.searchParams.set("client_id", serverRevisionClientID);
    socketUrl.searchParams.set("cols", String(session.term.cols || 120));
    socketUrl.searchParams.set("rows", String(session.term.rows || 32));
    const currentSocket = new WebSocket(socketUrl.toString());
    session.socket = currentSocket;
    session.replayComplete = false;
    session.replayVerified = false;
    session.allowGeneratedInputDuringReplay = false;
    session.startupErrorShown = false;
    currentSocket.binaryType = "arraybuffer";

    const replayMessageHasIdentity = (message) => {
      const selector = String(message?.selector || "").trim();
      const paneID = String(message?.pane_id || message?.paneId || "").trim();
      return selector || paneID;
    };

    const validateReplayMessage = (message) => {
      const selector = String(message?.selector || "").trim();
      const paneID = String(message?.pane_id || message?.paneId || "").trim();
      if (!selector && !paneID) {
        return true;
      }
      return selector === session.name && paneID === session.id;
    };

    const rejectMismatchedReplay = (message) => {
      const selector = String(message?.selector || "").trim() || "unknown";
      const paneID = String(message?.pane_id || message?.paneId || "").trim() || "unknown";
      session.replayVerified = false;
      session.shellEl.dataset.connection = "error";
      console.warn(`Rejected terminal replay for ${selector}/${paneID}; expected ${session.name}/${session.id}.`);
      if (session.socket === currentSocket) {
        session.socket = null;
      }
      currentSocket.close();
    };

    currentSocket.addEventListener("open", () => {
      if (session.socket !== currentSocket) {
        return;
      }
      session.reconnectPending = false;
      session.shellEl.dataset.connection = "open";
      if (isTerminalInputBlocked() || session.inputLocked) {
        sendSessionInputLock(session, true);
        discardSessionInputBuffers(session);
      }
      resizePane(session);
      if (session.tabId === activeTabId && currentTab()?.activePaneId === session.id) {
        session.term.focus();
      }
    });

    currentSocket.addEventListener("message", (event) => {
      if (session.socket !== currentSocket) {
        return;
      }
      session.startupErrorShown = true;
      if (session.name !== activeName) {
        session.socket = null;
        currentSocket.close();
        return;
      }
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data);
          if (message && typeof message.type === "string") {
            switch (message.type) {
              case "history-replay-start":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                session.replayComplete = false;
                session.replayVerified = replayMessageHasIdentity(message) ? "identified" : "legacy";
                session.allowGeneratedInputDuringReplay = message.allow_generated_input === true || message.allowGeneratedInput === true;
                session.suppressGeneratedTerminalInputUntil = 0;
                return;
              case "history-replay-complete":
                if (!session.replayVerified || (session.replayVerified === "identified" && !validateReplayMessage(message))) {
                  rejectMismatchedReplay(message);
                  return;
                }
                flushSessionOutput(session);
                session.replayComplete = true;
                session.replayVerified = false;
                session.allowGeneratedInputDuringReplay = false;
                session.shellEl.dataset.connection = "open";
                flushPendingInput(session);
                return;
              case "pong":
                return;
              case "process-exit":
                const shouldFocusAfterExit = session.tabId === activeTabId && currentTab()?.activePaneId === session.id;
                session.exitExpected = true;
                session.socket = null;
                disposePane(session);
                refreshWorkspace({ focus: shouldFocusAfterExit }).catch((error) => showToast(error.message));
                return;
            }
          }
        } catch (error) {
        }
        writeSessionOutput(session, event.data);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        if (!session.replayVerified && !session.replayComplete) {
          return;
        }
        writeSessionOutput(session, new Uint8Array(event.data));
      }
    });

    currentSocket.addEventListener("close", () => {
      if (session.socket !== currentSocket) {
        return;
      }
      session.socket = null;
      session.shellEl.dataset.connection = "closed";
      flushSessionOutput(session);
      if (session.exitExpected) {
        return;
      }
      if (!session.startupErrorShown) {
        session.startupErrorShown = true;
        showSessionStartupError(session, "WebSocket closed before terminal attached.");
      }
      scheduleReconnect(session);
    });

    currentSocket.addEventListener("error", () => {
      if (session.socket !== currentSocket) {
        return;
      }
      session.socket = null;
      session.shellEl.dataset.connection = "error";
      flushSessionOutput(session);
      if (!session.startupErrorShown) {
        session.startupErrorShown = true;
        showSessionStartupError(session, "WebSocket connection failed.");
      }
    });
  };

  const installTerminalKeyOverrides = (session) => {
    const term = session?.term;
    if (typeof term?.attachCustomKeyEventHandler !== "function") {
      return;
    }
    term.attachCustomKeyEventHandler((event) => {
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

  const createPaneSession = (tab, instanceName, { id = "", connect = true } = {}) => {
    const normalizedID = String(id || `pane-${nextPaneSeq++}`).trim();
    const numeric = Number(normalizedID.replace(/^pane-/, ""));
    if (Number.isFinite(numeric) && numeric >= nextPaneSeq) {
      nextPaneSeq = numeric + 1;
    }
    const shellEl = document.createElement("section");
    shellEl.className = "pane-shell";
    shellEl.dataset.paneId = normalizedID;
    shellEl.dataset.connection = connect ? "connecting" : "idle";
    shellEl.setAttribute("tabindex", "-1");

    const terminalHost = document.createElement("div");
    terminalHost.className = "terminal-host";
    shellEl.appendChild(terminalHost);

    const term = new Terminal(terminalOptions());
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    if (term.options) {
      term.options.mobilePixelScroll = mobilePixelScrollEnabled && isMobileLayout();
    }
    term.open(terminalHost);
    const compositionPreview = document.createElement("span");
    compositionPreview.className = "terminal-composition-preview";
    compositionPreview.hidden = true;
    terminalHost.appendChild(compositionPreview);
    if (typeof fitAddon.observeResize === "function") {
      fitAddon.observeResize();
    }

    const session = {
      id: normalizedID,
      tabId: tab.id,
      name: instanceName,
      shellEl,
      terminalHost,
      compositionPreview,
      term,
      fitAddon,
      socket: null,
      reconnectTimer: 0,
      reconnectPending: false,
      replayComplete: false,
      replayVerified: false,
      pendingInput: [],
      pendingInputSize: 0,
      inputBuffer: "",
      inputBufferSize: 0,
      inputFlushTimer: 0,
      inputQueue: [],
      inputQueueSize: 0,
      inputPumpTimer: 0,
      inputPumpActive: false,
      outputQueue: [],
      outputQueueSize: 0,
      outputFlushFrame: 0,
      outputFlushTimer: 0,
      replayOutputDepth: 0,
      allowGeneratedInputDuringReplay: false,
      suppressGeneratedTerminalInputUntil: 0,
      inputLocked: false,
      composingIME: false,
      exitExpected: false,
      closed: false,
      baseTheme: activeTheme,
      selectAllBufferActive: false,
      title: "",
      hasUserInputSinceFocus: false,
      notifyWhenIdle: false,
      tty: "",
      busy: false,
      command: "",
      processCommandLine: "",
      cwd: "",
      activityCheckedAt: 0,
      lastSizeReassertAt: 0,
      cleanupCallbacks: [],
    };

    installTerminalHostInputIsolation(session);
    installTerminalInputFocus(session);
    installTerminalKeyOverrides(session);
    installTerminalHostViewportGuard(session);
    installRendererBaselinePatch(session);
    installRendererThemeMapper(session);
    installRendererCellSeamPatch(session);
    installMobileTouchSelection(session);
    installDesktopMouseClipboard(session);

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
      reassertTerminalSize(session);
      sendOrQueueInput(session, data, { userInput: !isGeneratedTerminalResponse(data) });
    });
    term.onResize(() => {
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      updateMobileSelectionHandles(session);
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
      setActivePane(current, session.id, { focus: false });
    });
    shellEl.addEventListener("focusin", () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    });
    shellEl.addEventListener("contextmenu", (event) => {
      if (!isMobileLayout()) {
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
      if (isMobileLayout()) {
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
    if (connect) {
      connectSession(session).catch((error) => {
        showSessionStartupError(session, error.message || "WebSocket connection failed.");
      });
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

  const createTabButton = (tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.dataset.tabId = tab.id;
    button.setAttribute("role", "tab");
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

  const createTab = ({ id = "", label, pane, focus = true, connect = true, customLabel = false, empty = false, activate = true } = {}) => {
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
      const session = createPaneSession(tab, activeName, { connect });
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
    const previousTabId = activeTabId;
    const wasActive = previousTabId === tab.id;
    activeTabId = tab.id;
    if (rememberRecent) {
      rememberRecentTab(tab.id, previousTabId);
    }
    for (const item of tabs.values()) {
      const isActive = item.id === activeTabId;
      item.paneEl.classList.toggle("active", isActive);
      item.button?.classList.toggle("active", isActive);
      item.button?.setAttribute("aria-selected", isActive ? "true" : "false");
      item.button?.setAttribute("tabindex", isActive ? "0" : "-1");
    }
    setActivePane(tab, tab.activePaneId, { focus });
    resetSessionUserInput(tab.panes.get(tab.activePaneId));
    syncCursorBlinkState();
    clearTabNotification(tab);
    if (remember) {
      rememberActiveTab();
    }
    renderAttachmentUploadsForActiveTab();
    window.requestAnimationFrame(() => {
      scrollTabButtonIntoView(tab.button);
      resizeTabForCurrentDevice(tab);
    });
    if (!applyingWorkspaceState && !wasActive) {
      postWorkspaceAction("activate_tab", { tab_id: tab.id, recent_tab_ids: recentTabIds }).catch((error) => showToast(error.message));
    }
    scheduleTabOverviewRender();
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
        resizeActiveTab();
      };

      const onUp = () => {
        divider.classList.remove("is-dragging");
        container.classList.remove("is-resizing");
        document.body.classList.remove("split-resize-active");
        divider.removeEventListener("pointermove", onMove);
        divider.removeEventListener("pointerup", onUp);
        divider.removeEventListener("pointercancel", onUp);
        resizeActiveTab();
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
    setActivePane(tab, tab.activePaneId, { focus: false });
    window.requestAnimationFrame(() => resizeTab(tab));
  };

  const applyWorkspaceState = (state, { focus = false, instanceName = activeName, generation = activeInstanceGeneration, preferStateActiveTab = false } = {}) => {
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
    applyingWorkspaceState = true;
    try {
      const nextTabIDs = new Set((state?.tabs || []).map((tab) => tab.id));
      for (const tab of [...tabs.values()]) {
        if (!nextTabIDs.has(tab.id)) {
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
            disposePane(pane);
            tab.panes.delete(pane.id);
          }
        }
        for (const paneState of tabState.panes || []) {
          if (!tab.panes.has(paneState.id)) {
            createPaneSession(tab, targetName, { id: paneState.id, connect: true });
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
      }
      updateEmptyState();
      scheduleTabOverviewRender();
      window.requestAnimationFrame(() => resizeActiveTabForCurrentDevice());
      return true;
    } finally {
      clearRestartTabForReload();
      applyingWorkspaceState = false;
    }
  };

  const refreshWorkspace = async ({ focus = false, instanceName = activeName, generation = activeInstanceGeneration } = {}) => {
    const requestName = String(instanceName || "").trim();
    const state = await fetchWorkspaceState(requestName);
    if (!isCurrentInstanceRequest(requestName, generation)) {
      return state;
    }
    ensureResponseSelector(state, requestName);
    observeServerRevision(state);
    applyWorkspaceState(state, { focus, instanceName: requestName, generation });
    return state;
  };

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
    pane.closed = true;
    pane.pendingInput = [];
    pane.pendingInputSize = 0;
    pane.inputBuffer = "";
    pane.inputBufferSize = 0;
    clearInputFlushTimer(pane);
    pane.inputQueue = [];
    pane.inputQueueSize = 0;
    clearInputPumpTimer(pane);
    pane.inputPumpActive = false;
    clearReconnectTimer(pane);
    discardSessionOutputBuffers(pane);
    runSessionCleanups(pane);
    if (pane.socket) {
      const socket = pane.socket;
      pane.socket = null;
      socket.close();
    }
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
          postWorkspaceAction("close_pane", { tab_id: tabId, pane_id: paneId }).catch((error) => showToast(error.message));
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
    if (!applyingWorkspaceState) {
      refreshAndConfirmClose(targetPanesFromTab(tab), "关闭此标签并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_tab", { tab_id: tabId }).catch((error) => showToast(error.message));
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
    tab.button?.remove();
    tab.paneEl.remove();
    tabs.delete(tab.id);
    if (activeTabId === tab.id) {
      activeTabId = null;
      if (nextActiveTab && tabs.has(nextActiveTab.id)) {
        setActiveTab(nextActiveTab.id, { remember });
      }
    }
    updateEmptyState();
    scheduleTabOverviewRender();
  };

  const closeOtherTabs = (tabId) => {
    if (!applyingWorkspaceState) {
      const panes = Array.from(tabs.values())
        .filter((tab) => tab.id !== tabId)
        .flatMap((tab) => targetPanesFromTab(tab));
      refreshAndConfirmClose(panes, "关闭其他标签并终止正在运行的命令？").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_other_tabs", { tab_id: tabId }).catch((error) => showToast(error.message));
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
    if (!applyingWorkspaceState) {
      postWorkspaceAction("rename_tab", { tab_id: tabId, label: normalized }).catch((error) => showToast(error.message));
      return;
    }
    tab.label = normalized;
    tab.customLabel = true;
    renderTabLabel(tab);
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
      item.hidden = (contextPaneActions.has(action) && !target.paneId) || (contextTabActions.has(action) && !target.tabId) || (contextLinkActions.has(action) && !target.link);
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
      (instanceSwitcherPanel && !instanceSwitcherPanel.hidden) ||
      (attachmentBackdrop && !attachmentBackdrop.hidden) ||
      isTabOverviewOpen()
    ) {
      return;
    }
    if (isInteractiveShortcutTarget(event.target)) {
      return;
    }
    if (isNativePasteShortcutEvent(event)) {
      focusTerminalForNativePasteShortcut();
      closeContextMenu();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    if (event.ctrlKey && !event.altKey && !event.metaKey) {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjustTerminalFontSize(1);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        adjustTerminalFontSize(-1);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetTerminalFontSize();
        return;
      }
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

  const normalizeAttachmentEntry = (entry) => ({
    name: String(entry?.name || "").trim(),
    path: String(entry?.path || "").trim(),
    type: String(entry?.type || "file").trim() === "dir" ? "dir" : "file",
    size: Number(entry?.size || 0),
    modified: Number(entry?.modified || 0),
  });

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
    row.append(checkbox, button);
    item.appendChild(row);
    return item;
  };

  const renderAttachmentBrowserList = (entries) => {
    if (!attachmentBrowserList) {
      return;
    }
    attachmentBrowserList.textContent = "";
    attachmentBrowserEntriesByPath.clear();
    const normalized = Array.isArray(entries) ? entries.map(normalizeAttachmentEntry).filter((entry) => entry.name && entry.path) : [];
    normalized.sort((left, right) => {
      if (left.type === "dir" && right.type !== "dir") {
        return -1;
      }
      if (left.type !== "dir" && right.type === "dir") {
        return 1;
      }
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
    if (normalized.length === 0) {
      const empty = document.createElement("div");
      empty.className = "attachment-browser-empty";
      empty.textContent = "这个目录没有文件";
      attachmentBrowserList.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of normalized) {
      attachmentBrowserEntriesByPath.set(entry.path, entry);
      fragment.appendChild(createAttachmentBrowserItem(entry));
    }
    attachmentBrowserList.appendChild(fragment);
  };

  const loadAttachmentBrowserPath = async (path = attachmentBrowserCurrentPath) => {
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
  };

  const openAttachmentBrowser = () => {
    if (!attachmentBrowserBackdrop) {
      return;
    }
    closeAttachmentDialog({ focusTerminal: false });
    closeContextMenu();
    closeInstanceSwitcher();
    const startPath = String(activeSession()?.cwd || "").trim() || "/";
    attachmentBrowserOpen = true;
    attachmentBrowserCurrentPath = startPath;
    attachmentBrowserParentPath = "";
    attachmentBrowserSelectedPaths.clear();
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
    await refreshWorkspace({ focus: true, instanceName: activeName, generation });
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
    await loadThemeCatalog();
    applyThemeDocumentState();
    renderThemePicker();
    renderSettingsThemeList();
    await loadSettings().catch((error) => showToast(error.message || "设置加载失败。"));
    await refreshInstances();
    await refreshWorkspace({ focus: true });
    await refreshServerRevision().catch(() => {});
    startServerRevisionRefresh();
    startActivityRefresh();
    refreshActivity({ silent: true }).catch(() => {});
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
  settingsScrollbackInput?.addEventListener("input", scheduleTerminalScrollbackSave);
  settingsScrollbackInput?.addEventListener("change", () => {
    window.clearTimeout(settingsScrollbackSaveTimer);
    try {
      readSettingsScrollbackInput();
    } catch (error) {
      return;
    }
    saveTerminalScrollbackFromInput();
  });
  settingsScrollbackResetButton?.addEventListener("click", () => {
    window.clearTimeout(settingsScrollbackSaveTimer);
    if (settingsScrollbackInput) {
      settingsScrollbackInput.value = String(defaultTerminalScrollback);
    }
    const requestSeq = ++settingsScrollbackSaveRequestSeq;
    setSettingsScrollbackSaving(true);
    saveTerminalScrollback(defaultTerminalScrollback, { syncScrollbackInput: true })
      .catch(() => {})
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
    if (fileButton?.closest?.('.attachment-browser-item[data-type="file"]')) {
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

  document.addEventListener("pointerdown", (event) => {
    if (typeof PointerEvent === "undefined" || !(event instanceof PointerEvent) || !event.pointerType || event.pointerType === "mouse") {
      reassertTerminalSize(activeSession());
    }
    const target = event.target;
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
    if (event.key === "Escape") {
      closeContextMenu();
      closeMobileActionSheet();
      closeMobileCloseConfirm(false);
      closeInstanceSwitcher();
      closeAttachmentDialog({ focusTerminal: false });
      closeAttachmentBrowser({ focusTerminal: false });
      closeThemePicker();
      closeSettings();
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
    resizeActiveTabForCurrentDevice();
    updateMobileActiveTabTitle();
    updateSelectionSheet();
    if (settingsBackdrop && !settingsBackdrop.hidden) {
      syncSettingsMobileNavigation();
    }
    ensureMobileOverviewHistoryGuard();
    scheduleTabOverviewRender();
  });
  if (isIOSPlatform()) {
    window.visualViewport?.addEventListener("resize", syncMobileVisualViewport);
    window.visualViewport?.addEventListener("scroll", syncMobileVisualViewport);
    window.addEventListener("orientationchange", syncMobileVisualViewport);
  }
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
    const nextName = (nextParams.get("name") || "").trim();
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
    showToast("网络已恢复，正在重连。");
    refreshServerRevision().catch(() => {});
    reconnectVisibleSessions();
    refreshActivity({ silent: true }).catch(() => {});
  });
  window.addEventListener("offline", () => {
    setNetworkBanner(true);
    showToast("网络已断开。");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resizeActiveTab();
      refreshServerRevision().catch(() => {});
      reconnectVisibleSessions();
      refreshActivity({ silent: true }).catch(() => {});
      updateSelectionSheet();
    }
  });
  window.addEventListener("focus", () => {
    resizeActiveTab();
    refreshServerRevision().catch(() => {});
    reconnectVisibleSessions();
    refreshActivity({ silent: true }).catch(() => {});
  });
  window.addEventListener("beforeunload", (event) => {
    if (!suppressBeforeUnloadOnce && hasCachedBusyPane()) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
    disposed = true;
    window.clearInterval(serverRevisionRefreshTimer);
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        pane.closed = true;
        clearReconnectTimer(pane);
        pane.socket?.close();
      }
    }
  });

  bootstrap().catch((error) => {
    const message = error.message || "WebShell startup failed.";
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
