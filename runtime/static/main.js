import { FitAddon, Terminal, init as initGhostty } from "./ghostty-web.js";

(async () => {
  await initGhostty();

  const tabsEl = document.getElementById("tabs");
  const newTabButton = document.getElementById("newTab");
  const terminalArea = document.getElementById("terminalArea");
  const emptyState = document.getElementById("emptyState");
  const emptyStateAction = document.getElementById("emptyStateAction");
  const instanceSwitcher = document.getElementById("instanceSwitcher");
  const instanceSwitcherButton = document.getElementById("instanceSwitcherButton");
  const instanceSwitcherName = document.getElementById("instanceSwitcherName");
  const instanceSwitcherStatusDot = document.getElementById("instanceSwitcherStatusDot");
  const instanceSwitcherPanel = document.getElementById("instanceSwitcherPanel");
  const instanceSwitcherList = document.getElementById("instanceSwitcherList");
  const instanceSwitcherFeedback = document.getElementById("instanceSwitcherFeedback");
  const homeMenuButton = document.getElementById("homeMenuButton");
  const themeMenuButton = document.getElementById("themeMenuButton");
  const settingsMenuButton = document.getElementById("settingsMenuButton");
  const themePickerButton = document.getElementById("themePickerButton");
  const themePickerBackdrop = document.getElementById("themePickerBackdrop");
  const themePickerClose = document.getElementById("themePickerClose");
  const themePickerList = document.getElementById("themePickerList");
  const settingsBackdrop = document.getElementById("settingsBackdrop");
  const settingsClose = document.getElementById("settingsClose");
  const settingsFontSelect = document.getElementById("settingsFontSelect");
  const settingsFontDelete = document.getElementById("settingsFontDelete");
  const settingsFontInput = document.getElementById("settingsFontInput");
  const settingsFontMeta = document.getElementById("settingsFontMeta");
  const settingsFeedback = document.getElementById("settingsFeedback");
  const searchPanel = document.getElementById("searchPanel");
  const searchInput = document.getElementById("searchInput");
  const searchCount = document.getElementById("searchCount");
  const searchPrevious = document.getElementById("searchPrevious");
  const searchNext = document.getElementById("searchNext");
  const searchClose = document.getElementById("searchClose");
  const dialogBackdrop = document.getElementById("dialogBackdrop");
  const dialogPanel = document.getElementById("dialogPanel");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogMessage = document.getElementById("dialogMessage");
  const dialogInput = document.getElementById("dialogInput");
  const dialogCancel = document.getElementById("dialogCancel");
  const dialogOK = document.getElementById("dialogOK");
  const mobileShortcuts = document.getElementById("mobileShortcuts");
  const mobileShortcutRows = Array.from(mobileShortcuts?.querySelectorAll("[data-mobile-shortcut-row]") || []);
  const selectionSheet = document.getElementById("selectionSheet");
  const networkBanner = document.getElementById("networkBanner");
  const contextMenu = document.getElementById("contextMenu");
  const toast = document.getElementById("toast");

  if (!tabsEl || !terminalArea) {
    throw new Error("webshell host not found");
  }

  const params = new URLSearchParams(window.location.search);
  const tabs = new Map();
  const storagePrefix = "webshell";
  const themeStorageKey = `${storagePrefix}.theme`;
  const fontSizeStorageKey = `${storagePrefix}.fontSize`;
  const fontSizeVersionStorageKey = `${storagePrefix}.fontSizeVersion`;
  const fontSizeStorageVersion = "2";
  const lastTabStorageKey = (name) => `${storagePrefix}.lastTab.${name || "default"}`;
  const touchShortcutFeedbackStorageKey = `${storagePrefix}.touchShortcutFeedback`;
  const defaultFontSize = 16;
  const minFontSize = 10;
  const maxFontSize = 32;
  const defaultTerminalFontFamily = '"DejaVu Sans Mono", "Liberation Mono", monospace';
  const touchShortcutMoveThresholdPx = 8;
  const touchShortcutRepeatInitialDelayMs = 320;
  const touchShortcutRepeatIntervalMs = 80;
  const repeatableMobileShortcutIds = new Set(["arrow-up", "arrow-down", "arrow-left", "arrow-right"]);
  const storedFontSize = window.localStorage.getItem(fontSizeVersionStorageKey) === fontSizeStorageVersion
    ? Number(window.localStorage.getItem(fontSizeStorageKey))
    : NaN;
  let terminalFontSize = Number.isFinite(storedFontSize) ? Math.max(minFontSize, Math.min(maxFontSize, storedFontSize)) : defaultFontSize;
  const terminalOptionsBase = {
    cursorBlink: false,
    convertEol: true,
    scrollback: 5000,
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
  let currentInstances = [];
  let disposed = false;
  let nextTabSeq = 1;
  let nextPaneSeq = 1;
  let contextTarget = null;
  let toastTimer = 0;
  let activeTheme = themes.find((theme) => theme.id === window.localStorage.getItem(themeStorageKey)) || themes[0];
  let uploadedFonts = [];
  let activeTerminalFontID = "";
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
  let lightOSHomeURL = "";
  let lightOSHomeURLPromise = null;
  const searchState = { open: false, query: "", matches: [], index: -1, sessionId: "" };
  const mobileSticky = { ctrl: false, alt: false, shift: false };
  let touchShortcutFeedbackEnabled = loadTouchShortcutFeedbackEnabled();
  const textEncoder = new TextEncoder();
  const serverRevisionClientID = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
  const mobileShortcutRowsConfig = [
    [
      { id: "sticky-ctrl", label: "Ctrl+", ariaLabel: "Sticky Control", action: "sticky_ctrl", kind: "modifier" },
      { id: "sticky-alt", label: "Alt+", ariaLabel: "Sticky Alt", action: "sticky_alt", kind: "modifier" },
      { id: "sticky-shift", label: "Shift+", ariaLabel: "Sticky Shift", action: "sticky_shift", kind: "modifier" },
      { id: "ctrl-c", label: "Ctrl+C", ariaLabel: "Control C", data: "\x03", inputKey: "c", inputModifiers: { ctrl: true }, kind: "primary" },
      { id: "tab", label: "Tab", ariaLabel: "Tab", data: "\t", inputKey: "tab" },
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
      { id: "esc", label: "Esc", ariaLabel: "Escape", data: "\x1b", inputKey: "escape", kind: "primary" },
      { id: "ctrl-e", label: "Ctrl+E", ariaLabel: "Control E", data: "\x05", inputKey: "e", inputModifiers: { ctrl: true } },
      { id: "return", label: "Return", ariaLabel: "Return", data: "\r", inputKey: "enter", kind: "primary" },
      { id: "shift-tab", label: "Shift+Tab", ariaLabel: "Shift Tab", data: backtabSequence, inputKey: "tab", inputModifiers: { shift: true } },
      { id: "tilde", label: "~", ariaLabel: "Tilde", data: "~", inputKey: "~", kind: "symbol" },
      { id: "slash", label: "/", ariaLabel: "Slash", data: "/", inputKey: "/", kind: "symbol" },
      { id: "dash", label: "-", ariaLabel: "Dash", data: "-", inputKey: "-", kind: "symbol" },
      { id: "dollar", label: "$", ariaLabel: "Dollar Sign", data: "$", inputKey: "$", kind: "symbol" },
      { id: "zoom-in", label: "Zoom+", ariaLabel: "Zoom In", action: "zoom_in", kind: "modifier" },
      { id: "zoom-out", label: "Zoom-", ariaLabel: "Zoom Out", action: "zoom_out", kind: "modifier" },
      { id: "home", label: "Home", ariaLabel: "Home", data: "\x1b[H", inputKey: "home" },
      { id: "end", label: "End", ariaLabel: "End", data: "\x1b[F", inputKey: "end" },
      { id: "touch-feedback", label: "Shock On", ariaLabel: "Shock On", action: "toggle_touch_feedback", kind: "feedback" },
    ],
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
      const response = await fetch("./static/themes.json", { cache: "no-store" });
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

  const setSettingsFeedback = (message, tone = "info") => {
    if (!settingsFeedback) {
      return;
    }
    const text = String(message || "").trim();
    settingsFeedback.hidden = !text;
    settingsFeedback.textContent = text;
    settingsFeedback.dataset.tone = tone;
  };

  const registerUploadedFont = async (font) => {
    if (!font?.id || !font.family || registeredFontFaces.has(font.id) || typeof FontFace !== "function") {
      return;
    }
    if (!document.fonts) {
      return;
    }
    const face = new FontFace(font.family, `url(${cssString(fontFileSource(font))})`, { display: "swap" });
    await face.load();
    document.fonts.add(face);
    registeredFontFaces.set(font.id, face);
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

  const applyTerminalFont = () => {
    const selected = uploadedFonts.find((font) => font.id === activeTerminalFontID);
    terminalOptionsBase.fontFamily = selected
      ? `${cssString(selected.family)}, ${defaultTerminalFontFamily}`
      : defaultTerminalFontFamily;
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        pane.term.options.fontFamily = terminalOptionsBase.fontFamily;
        refreshTerminalMetrics(pane);
      }
    }
  };

  const renderSettingsFonts = () => {
    if (!settingsFontSelect) {
      return;
    }
    const selected = uploadedFonts.find((font) => font.id === activeTerminalFontID);
    settingsFontSelect.textContent = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "系统默认";
    settingsFontSelect.appendChild(defaultOption);
    for (const font of uploadedFonts) {
      const option = document.createElement("option");
      option.value = font.id;
      option.textContent = font.label || font.filename || font.family;
      settingsFontSelect.appendChild(option);
    }
    settingsFontSelect.value = selected ? selected.id : "";
    if (settingsFontDelete) {
      settingsFontDelete.disabled = !selected;
    }
    if (settingsFontMeta) {
      const size = selected ? formatBytes(selected.size) : "";
      settingsFontMeta.textContent = selected
        ? [selected.filename, size].filter(Boolean).join(" · ")
        : "当前使用系统默认字体。";
    }
  };

  const applySettingsState = async (state) => {
    const fonts = Array.isArray(state?.fonts)
      ? state.fonts.map(normalizeUploadedFont).filter(Boolean)
      : [];
    uploadedFonts = fonts;
    const nextFontID = String(state?.terminal_font_id || "").trim();
    activeTerminalFontID = uploadedFonts.some((font) => font.id === nextFontID) ? nextFontID : "";
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

  const uploadTerminalFont = async (file) => {
    const form = new FormData();
    form.append("font", file);
    const response = await fetch("./api/settings/fonts", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error(await readResponseText(response, `字体上传失败 (${response.status})`));
    }
    await loadSettings();
  };

  const deleteSelectedFont = async () => {
    const selected = uploadedFonts.find((font) => font.id === activeTerminalFontID);
    if (!selected) {
      return;
    }
    const confirmed = await confirmDialog(`删除字体「${selected.label}」？`, {
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

  const openSettings = () => {
    closeContextMenu();
    closeThemePicker();
    closeInstanceSwitcher();
    renderSettingsFonts();
    setSettingsFeedback("");
    if (settingsBackdrop) {
      settingsBackdrop.hidden = false;
      window.setTimeout(() => settingsFontSelect?.focus(), 0);
    }
    loadSettings().catch((error) => setSettingsFeedback(error.message || "设置加载失败。", "error"));
  };

  const closeSettings = () => {
    if (settingsBackdrop) {
      settingsBackdrop.hidden = true;
    }
    window.setTimeout(() => activeSession()?.term?.focus(), 0);
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
  const shortcutDefinitions = {
    fullscreen: "F11",
    new_tab: "Ctrl + Shift + t",
    close_tab: "Ctrl + Shift + w",
    next_tab: "Ctrl + Tab",
    previous_tab: "Ctrl + Shift + Tab",
    last_tab: "Alt + 0",
    move_tab_to_first: "Ctrl + Shift + Home",
    move_tab_left: "Ctrl + Shift + Page_Up",
    move_tab_right: "Ctrl + Shift + Page_Down",
    move_tab_to_last: "Ctrl + Shift + End",
    vertical_split: "Ctrl + Shift + j",
    horizontal_split: "Ctrl + Shift + h",
    select_up: "Alt + k",
    select_down: "Alt + j",
    select_left: "Alt + h",
    select_right: "Alt + l",
    close_pane: "Ctrl + Alt + q",
    theme: "Ctrl + Shift + p",
    switch_container: "Ctrl + Shift + o",
    copy_terminal: "Ctrl + Shift + c",
    paste_terminal: "Ctrl + Shift + v",
    search_terminal: "Ctrl + Shift + f",
    select_all_terminal: "Ctrl + Shift + a",
  };
  const shortcutActionMap = new Map();

  for (let index = 1; index <= 9; index += 1) {
    shortcutDefinitions[`tab_${index}`] = `Alt + ${index}`;
  }

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

  const getShortcutKeyFromEvent = (event) => {
    const key = normalizeShortcutKeyToken(event.key);
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

  for (const [action, definition] of Object.entries(shortcutDefinitions)) {
    const shortcut = normalizeShortcutDefinition(definition);
    if (shortcut) {
      shortcutActionMap.set(shortcut, action);
    }
  }

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

  const loadLightOSHomeURL = async () => {
    if (lightOSHomeURL) {
      return lightOSHomeURL;
    }
    if (!lightOSHomeURLPromise) {
      lightOSHomeURLPromise = fetch("./api/lightos-admin-info", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await response.text() || `无法获取 LightOS 首页地址 (${response.status})`);
          }
          const info = await response.json();
          const baseURL = String(info?.base_url || "").trim();
          if (!baseURL) {
            throw new Error("LightOS 首页地址不可用。");
          }
          return buildExplicitHomeURL(baseURL);
        })
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

  const serverRevisionURL = (name = activeName) => {
    const url = new URL("./api/server-revision", window.location.href);
    if (name) {
      url.searchParams.set("name", name);
    }
    url.searchParams.set("client_id", serverRevisionClientID);
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
    const response = await fetch(serverRevisionURL(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text() || `Server revision request failed (${response.status})`);
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
    const state = await response.json();
    observeServerRevision(state);
    return state;
  };

  const postWorkspaceAction = async (action, payload = {}) => {
    if (!activeName) {
      throw new Error("No running container is available.");
    }
    const size = terminalSizeQuery();
    const response = await fetch(workspaceURL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, cols: size.cols, rows: size.rows, ...payload }),
    });
    if (!response.ok) {
      throw new Error(await response.text() || `Workspace action failed (${response.status})`);
    }
    const state = await response.json();
    observeServerRevision(state);
    applyWorkspaceState(state, { focus: true });
    return state;
  };

  const updateLocationName = (nextName, { replace = false, tabId = activeTabId } = {}) => {
    const nextURL = new URL(window.location.href);
    nextURL.searchParams.set("name", nextName);
    if (tabId) {
      nextURL.searchParams.set("tab", tabId);
    } else {
      nextURL.searchParams.delete("tab");
    }
    if (replace) {
      window.history.replaceState({ name: nextName }, "", nextURL);
      return;
    }
    window.history.pushState({ name: nextName }, "", nextURL);
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
    document.documentElement.style.setProperty("--text", activeTheme.foreground);
    document.documentElement.style.setProperty("--muted", themeRGBA(activeTheme.foreground, 0.68));
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

  const renderThemePicker = () => {
    if (!themePickerList) {
      return;
    }
    themePickerList.textContent = "";
    for (const theme of themes) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "theme-option";
      option.dataset.theme = theme.id;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", theme.id === activeTheme.id ? "true" : "false");
      option.innerHTML = `
        <span class="theme-swatch" style="--swatch-bg: ${theme.background}; --swatch-fg: ${theme.foreground}; --swatch-accent: ${theme.accent}"></span>
        <span class="theme-option-body">
          <span class="theme-option-name"></span>
          <span class="theme-option-meta"></span>
        </span>
      `;
      option.querySelector(".theme-option-name").textContent = theme.name;
      option.querySelector(".theme-option-meta").textContent = `${theme.background} / ${theme.foreground}`;
      themePickerList.appendChild(option);
    }
  };

  const applyThemeToSession = (session) => {
    if (!session?.term) {
      return;
    }
    const nextTheme = cloneTheme(activeTheme);
    installRendererThemeMapper(session);
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
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        applyThemeToSession(pane);
      }
    }
    resizeActiveTab();
  };

  const openThemePicker = () => {
    closeContextMenu();
    renderThemePicker();
    if (themePickerBackdrop) {
      themePickerBackdrop.hidden = false;
    }
  };

  const closeThemePicker = () => {
    if (themePickerBackdrop) {
      themePickerBackdrop.hidden = true;
    }
  };

  const currentTab = () => tabs.get(activeTabId) || null;

  const getOrderedTabs = () =>
    Array.from(tabsEl.querySelectorAll(".tab"))
      .map((button) => tabs.get(button.dataset.tabId))
      .filter(Boolean);

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

  const updateEmptyState = () => {
    if (!emptyState) {
      return;
    }
    emptyState.hidden = tabs.size > 0;
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
    refreshTabAutoLabel(tab);
    syncCursorBlinkState();
    if (focus) {
      const pane = tab.panes.get(paneId);
      window.requestAnimationFrame(() => {
        resizePane(pane);
        pane?.term?.focus();
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
    if (!clean || session.composingIME) {
      return;
    }
    const keep = new Set([session.term?.canvas, session.term?.textarea].filter(Boolean));
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
    textarea.style.position = "absolute";
    textarea.style.left = `${cursorX * width}px`;
    textarea.style.top = `${cursorY * height}px`;
    textarea.style.width = `${Math.max(width, 2)}px`;
    textarea.style.height = `${height}px`;
    textarea.style.lineHeight = `${height}px`;
    textarea.style.font = `${terminalFontSize}px ${terminalOptionsBase.fontFamily}`;
    textarea.style.padding = "0";
    textarea.style.border = "0";
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
  };

  const focusTerminalInput = (session) => {
    const textarea = session?.term?.textarea;
    if (!textarea) {
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
  };

  const setTerminalInputComposing = (session, composing) => {
    session.composingIME = composing;
    if (session.term?.inputHandler) {
      session.term.inputHandler.isComposing = composing;
    }
  };

  const sendTerminalTextInput = (session, data, { dedupe = false } = {}) => {
    if (!session || !data) {
      return;
    }
    const now = performance.now();
    const last = session.lastTextInput;
    if (dedupe && last?.data === data && now - last.time < 80) {
      return;
    }
    if (dedupe) {
      session.lastTextInput = { data, time: now };
    }
    sendOrQueueInput(session, data);
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
    const type = String(event.inputType || "");
    const textarea = session?.term?.textarea;
    if (type === "insertCompositionText" || type === "deleteCompositionText" || event.isComposing) {
      setTerminalInputComposing(session, true);
      clearTerminalTextareaSentinel(session);
      positionTerminalInput(session);
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
    });
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
  };

  const handleTerminalTextareaInput = (session, event) => {
    event.stopPropagation();
    const textarea = session?.term?.textarea;
    if (!textarea) {
      return;
    }
    const type = String(event.inputType || "");
    if (!session.composingIME) {
      const value = stripTerminalInputSentinel(textarea.value);
      if (!value && isBackwardDeleteInputType(type)) {
        sendTerminalTextInput(session, "\x7f");
      } else if (!value && isForwardDeleteInputType(type)) {
        sendTerminalTextInput(session, "\x1b[3~");
      } else if (value) {
        sendTerminalTextInput(session, value, { dedupe: true });
      }
      textarea.value = terminalInputSentinel;
      moveTerminalTextareaCaretToEnd(textarea);
    }
    resetTerminalHostViewport(session, { clean: true });
    positionTerminalInput(session);
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
    textarea.addEventListener("beforeinput", (event) => {
      handleTerminalBeforeInput(session, event);
    }, { capture: true });
    textarea.addEventListener("compositionstart", (event) => {
      event.stopPropagation();
      clearTerminalTextareaSentinel(session);
      setTerminalInputComposing(session, true);
      positionTerminalInput(session);
      scheduleTerminalHostViewportReset(session);
    }, { capture: true });
    textarea.addEventListener("compositionupdate", (event) => {
      event.stopPropagation();
      setTerminalInputComposing(session, true);
      positionTerminalInput(session);
      scheduleTerminalHostViewportReset(session);
    }, { capture: true });
    textarea.addEventListener("compositionend", (event) => {
      event.stopPropagation();
      setTerminalInputComposing(session, false);
      if (event.data) {
        sendTerminalTextInput(session, event.data, { dedupe: true });
      }
      window.setTimeout(() => {
        resetTerminalTextareaValue(session);
        resetTerminalHostViewport(session, { clean: true });
      }, 0);
    }, { capture: true });
    textarea.addEventListener("input", (event) => {
      handleTerminalTextareaInput(session, event);
    }, { capture: true });
    host.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        return;
      }
      window.requestAnimationFrame(() => focusTerminalInput(session));
    });
    positionTerminalInput(session);
  };

  const installTerminalHostViewportGuard = (session) => {
    const host = session?.terminalHost;
    if (!host) {
      return;
    }
    host.addEventListener("compositionstart", () => {
      setTerminalInputComposing(session, true);
      scheduleTerminalHostViewportReset(session);
    });
    host.addEventListener("compositionupdate", () => scheduleTerminalHostViewportReset(session));
    host.addEventListener("compositionend", () => {
      setTerminalInputComposing(session, false);
      scheduleTerminalHostViewportReset(session, { clean: true });
    });
    host.addEventListener("beforeinput", () => scheduleTerminalHostViewportReset(session));
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

  const resizeAllTabsForCurrentDevice = () => {
    if (tabs.size === 0) {
      return;
    }
    const visibleTabId = activeTabId;
    for (const tab of tabs.values()) {
      tab.paneEl.classList.add("active");
    }
    for (const tab of tabs.values()) {
      resizeTab(tab);
    }
    for (const tab of tabs.values()) {
      tab.paneEl.classList.toggle("active", tab.id === visibleTabId);
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
    showToast(`Font size ${terminalFontSize}px`);
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
      throw new Error("Clipboard read is unavailable in this browser context.");
    }
    return navigator.clipboard.readText();
  };

  const copyFromSession = async (session = activeSession()) => {
    if (!session?.term) {
      return;
    }
    let text = "";
    if (session.selectAllBufferActive) {
      text = fullBufferText(session.term);
      session.selectAllBufferActive = false;
    } else {
      text = session.term.getSelection?.() || "";
    }
    if (!text) {
      showToast("No selection to copy.");
      return;
    }
    if (await copyText(text)) {
      showToast("Copied.");
      session.term.clearSelection?.();
      updateSelectionSheet();
    } else {
      showToast("Copy failed.");
    }
  };

  const pasteIntoSession = async (session = activeSession(), text = null) => {
    if (!session?.term) {
      return;
    }
    try {
      const value = text === null ? await readClipboardText() : text;
      if (value) {
        session.term.paste(value);
      }
    } catch (error) {
      showToast(error.message || "Paste failed.");
    }
  };

  const selectAllSessionBuffer = (session = activeSession()) => {
    if (!session?.term) {
      return;
    }
    session.selectAllBufferActive = true;
    session.term.selectLines?.(0, Math.max(0, session.term.rows - 1));
    updateSelectionSheet();
    showToast("Full terminal buffer selected.");
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
    activeSession()?.term?.focus();
  };

  const moveSearchResult = (delta) => {
    if (searchState.matches.length === 0) {
      return;
    }
    searchState.index = (searchState.index + delta + searchState.matches.length) % searchState.matches.length;
    selectSearchMatch();
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

  const openDialog = ({ mode = "confirm", title = "Confirm", message = "", value = "", okText = "OK", cancelText = "Cancel", danger = false, initialFocus = "cancel" } = {}) =>
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
    const result = await openDialog({ mode: "confirm", message, title: options.title || "Confirm", okText: options.okText || "Confirm", cancelText: options.cancelText || "Cancel", danger: Boolean(options.danger) });
    return result === true;
  };

  const promptDialog = async (title, value) => {
    const result = await openDialog({ mode: "prompt", title, value, okText: "Save", cancelText: "Cancel" });
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
      pane.tty = paneState.tty || pane.tty || "";
      pane.busy = Boolean(paneState.busy);
      pane.command = paneState.command || "";
      pane.processCommandLine = paneState.command_line || "";
      pane.cwd = paneState.cwd || pane.cwd || "";
      pane.activityCheckedAt = Number(paneState.activity_checked_at || 0);
      pane.shellEl.dataset.busy = pane.busy ? "true" : "false";
      if (tab.activePaneId === pane.id) {
        refreshTabAutoLabel(tab);
      }
      return;
    }
  };

  const refreshActivity = async ({ silent = true } = {}) => {
    if (!activeName) {
      return [];
    }
    const response = await fetch(workspaceActivityURL(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text() || `Activity request failed (${response.status})`);
    }
    const state = await response.json();
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
    return confirmDialog(`${messagePrefix}\n\nRunning: ${commands}`, { title: "Running command", okText: "Close", danger: true });
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
    }, 1800);
  };

  const updateDocumentTitle = () => {
    const tab = currentTab();
    const title = tab?.label || "WebShell";
    const hasNotification = Array.from(tabs.values()).some((item) => item.hasNotification);
    document.title = `${hasNotification ? "* " : ""}${title} - LightOS WebShell`;
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
      connectSession(pane).catch((error) => showToast(error.message));
    }
  };

  const updateSelectionSheet = () => {
    if (!selectionSheet) {
      return;
    }
    const session = activeSession();
    const hasSelection = Boolean(session?.term?.hasSelection?.() || session?.selectAllBufferActive);
    selectionSheet.hidden = !hasSelection || window.matchMedia("(min-width: 721px)").matches;
  };

  const generatedTerminalResponsePattern =
    /^(?:\x1b)?(?:\[\d{1,4};\d{1,4}R|\[0n|\[\?[\d;]{1,16}c|\[>[\d;]{1,16}c)/;

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

  const armReplayGeneratedInputSuppression = (session) => {
    if (!session || session.allowGeneratedInputDuringReplay) {
      return;
    }
    session.suppressGeneratedTerminalInputUntil = Math.max(
      Number(session.suppressGeneratedTerminalInputUntil || 0),
      Date.now() + 1000,
    );
  };

  const shouldSuppressGeneratedTerminalInput = (session, data) => {
    if (!session || !isGeneratedTerminalResponse(data)) {
      return false;
    }
    if (session.replayOutputDepth > 0 && !session.allowGeneratedInputDuringReplay) {
      return true;
    }
    return Number(session.suppressGeneratedTerminalInputUntil || 0) > Date.now();
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
    for (let index = 0; index < 256 && wasmTerm.hasResponse(); index += 1) {
      term.processTerminalResponses();
    }
  };

  const showDeployRestartDialog = async () => {
    if (deployRestartDialogOpen) {
      return;
    }
    deployRestartDialogOpen = true;
    setAllTerminalInputLocked(true);
    setServerRevisionInputLocked(true).catch(() => {});
    discardAllTerminalInputBuffers();
    let shouldUnlock = true;
    try {
      const restart = await openDialog({
        title: "WebShell 已更新",
        message: "检测到 WebShell 服务已更新，请重新加载页面以使用最新版本。",
        okText: "重新加载",
        cancelText: "取消",
        initialFocus: "ok",
      });
      if (restart === true) {
        shouldUnlock = false;
        await setServerRevisionInputLocked(false).catch(() => {});
        setAllTerminalInputLocked(false);
        deployRestartDialogOpen = false;
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
      button.textContent = feedbackLabel;
      button.classList.toggle("active", touchShortcutFeedbackEnabled);
      button.setAttribute("aria-pressed", touchShortcutFeedbackEnabled ? "true" : "false");
      button.setAttribute("aria-label", feedbackLabel);
      button.setAttribute("title", feedbackLabel);
    }
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
    switch (action) {
      case "sticky_ctrl":
      case "ctrl":
        toggleMobileSticky("ctrl");
        return;
      case "sticky_alt":
      case "alt":
        toggleMobileSticky("alt");
        return;
      case "sticky_shift":
      case "shift":
        toggleMobileSticky("shift");
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

  const isRepeatableMobileShortcut = (shortcut) => repeatableMobileShortcutIds.has(String(shortcut?.id || ""));

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
    mobileShortcutRows.forEach((row, rowIndex) => {
      row.textContent = "";
      for (const shortcut of mobileShortcutRowsConfig[rowIndex] || []) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mobile-shortcut-key";
        button.tabIndex = -1;
        button.textContent = shortcut.label;
        button.dataset.mobileShortcutId = shortcut.id;
        if (shortcut.action) {
          button.dataset.mobileAction = shortcut.action;
        }
        if (shortcut.kind) {
          button.dataset.kind = shortcut.kind;
        }
        button.setAttribute("aria-label", shortcut.ariaLabel || shortcut.label);
        if (["sticky_ctrl", "sticky_alt", "sticky_shift", "toggle_touch_feedback"].includes(shortcut.action)) {
          button.setAttribute("aria-pressed", "false");
        }
        bindMobileShortcutButton(button, shortcut);
        row.appendChild(button);
      }
    });
    syncMobileShortcutState();
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
    try {
      session.socket.send(JSON.stringify({ type: "input", data }));
    } catch (error) {
      session.inputBuffer = data + session.inputBuffer;
      session.inputBufferSize += textEncoder.encode(data).length;
    }
  };

  const scheduleInputFlush = (session) => {
    if (session.inputFlushTimer) {
      return;
    }
    session.inputFlushTimer = window.setTimeout(() => flushInputBuffer(session), 8);
  };

  const sendSessionInput = (session, data, { immediate = false } = {}) => {
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    if (!data || session.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const byteLength = textEncoder.encode(data).length;
    const maxBufferedInput = 8 * 1024 * 1024;
    if (session.inputBufferSize + byteLength > maxBufferedInput) {
      flushInputBuffer(session);
    }
    if (byteLength > maxBufferedInput) {
      try {
        session.socket.send(JSON.stringify({ type: "input", data }));
      } catch (error) {
      }
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
  };

  const sendOrQueueInput = (session, data) => {
    if (isTerminalInputBlocked()) {
      discardSessionInputBuffers(session);
      return;
    }
    const byteLength = textEncoder.encode(data).length;
    const maxPendingInput = 8 * 1024 * 1024;
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
        if (session.pendingInputSize + byteLength > maxPendingInput) {
          return;
        }
        session.pendingInput.push(data);
        session.pendingInputSize += byteLength;
      }
      return;
    }
    if (session.pendingInputSize + byteLength > maxPendingInput) {
      return;
    }
    session.pendingInput.push(data);
    session.pendingInputSize += byteLength;
  };

  const writeSessionOutput = (session, data) => {
    if (!session?.term) {
      return;
    }
    // Replayed history may contain terminal queries. Only the first attach replays live startup output.
    const suppressGeneratedInput = !session.replayComplete;
    if (suppressGeneratedInput) {
      armReplayGeneratedInputSuppression(session);
    }
    if (suppressGeneratedInput) {
      session.replayOutputDepth += 1;
    }
    try {
      session.term.write(data);
      drainGeneratedTerminalResponses(session);
    } finally {
      if (suppressGeneratedInput) {
        session.replayOutputDepth = Math.max(0, session.replayOutputDepth - 1);
      }
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
    }
  };

  const scheduleReconnect = (session) => {
    if (disposed || session.closed || session.reconnectPending) {
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
      connectSession(session).catch((error) => {
        session.term.write(`\r\n[webshell error] ${error.message}\r\n`);
      });
    }, 240);
  };

  const connectSession = async (session) => {
    if (
      !session ||
      session.closed ||
      navigator.onLine === false ||
      session.socket?.readyState === WebSocket.OPEN ||
      session.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    clearReconnectTimer(session);
    const socketUrl = new URL("./ws", window.location.href);
    socketUrl.searchParams.set("name", session.name);
    socketUrl.searchParams.set("pane", session.id);
    socketUrl.searchParams.set("client_id", serverRevisionClientID);
    socketUrl.searchParams.set("cols", String(session.term.cols || 120));
    socketUrl.searchParams.set("rows", String(session.term.rows || 32));
    const currentSocket = new WebSocket(socketUrl.toString());
    session.socket = currentSocket;
    session.replayComplete = false;
    session.allowGeneratedInputDuringReplay = false;
    currentSocket.binaryType = "arraybuffer";

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
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data);
          if (message && typeof message.type === "string") {
            switch (message.type) {
              case "history-replay-start":
                session.replayComplete = false;
                session.allowGeneratedInputDuringReplay = message.allow_generated_input === true || message.allowGeneratedInput === true;
                session.suppressGeneratedTerminalInputUntil = 0;
                return;
              case "history-replay-complete":
                session.replayComplete = true;
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
        writeSessionOutput(session, new Uint8Array(event.data));
      }
    });

    currentSocket.addEventListener("close", () => {
      if (session.socket === currentSocket) {
        session.socket = null;
      }
      session.shellEl.dataset.connection = "closed";
      if (session.exitExpected) {
        return;
      }
      scheduleReconnect(session);
    });

    currentSocket.addEventListener("error", () => {
      if (session.socket === currentSocket) {
        session.socket = null;
      }
      session.shellEl.dataset.connection = "error";
    });
  };

  const installTerminalKeyOverrides = (session) => {
    const term = session?.term;
    if (typeof term?.attachCustomKeyEventHandler !== "function") {
      return;
    }
    term.attachCustomKeyEventHandler((event) => {
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
    term.open(terminalHost);
    if (typeof fitAddon.observeResize === "function") {
      fitAddon.observeResize();
    }

    const session = {
      id: normalizedID,
      tabId: tab.id,
      name: instanceName,
      shellEl,
      terminalHost,
      term,
      fitAddon,
      socket: null,
      reconnectTimer: 0,
      reconnectPending: false,
      replayComplete: false,
      pendingInput: [],
      pendingInputSize: 0,
      inputBuffer: "",
      inputBufferSize: 0,
      inputFlushTimer: 0,
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
      tty: "",
      busy: false,
      command: "",
      processCommandLine: "",
      cwd: "",
      activityCheckedAt: 0,
    };

    installTerminalInputFocus(session);
    installTerminalKeyOverrides(session);
    installTerminalHostViewportGuard(session);
    installRendererThemeMapper(session);

    term.onData((data) => {
      if (isTerminalInputBlocked()) {
        discardSessionInputBuffers(session);
        return;
      }
      if (shouldSuppressGeneratedTerminalInput(session, data)) {
        return;
      }
      if (session.replayOutputDepth > 0) {
        if (session.allowGeneratedInputDuringReplay) {
          sendSessionInput(session, data, { immediate: true });
        }
        return;
      }
      sendOrQueueInput(session, data);
    });
    term.onResize(() => {
      resetTerminalHostViewport(session, { clean: true });
      positionTerminalInput(session);
      sendTerminalSize(session);
    });
    term.onTitleChange((title) => {
      const current = tabs.get(session.tabId);
      const normalized = String(title || "").trim();
      session.title = normalized;
      if (current && !current.customLabel) {
        refreshTabAutoLabel(current);
      }
    });
    term.onBell(() => markTabNotification(session.tabId));
    term.onSelectionChange(() => {
      if (!term.hasSelection?.()) {
        session.selectAllBufferActive = false;
      }
      updateSelectionSheet();
    });

    shellEl.addEventListener("pointerdown", () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    });
    shellEl.addEventListener("focusin", () => {
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
    });
    shellEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const current = tabs.get(session.tabId);
      setActivePane(current, session.id, { focus: false });
      const link = findURLAtPosition(session, event.clientX, event.clientY);
      showContextMenu(event.clientX, event.clientY, { type: "pane", tabId: session.tabId, paneId: session.id, link: link?.url || "" });
    });
    shellEl.addEventListener("auxclick", (event) => {
      if (event.button !== 1) {
        return;
      }
      event.preventDefault();
      readClipboardText().then((text) => pasteIntoSession(session, text)).catch((error) => showToast(error.message || "Paste failed."));
    });
    terminalHost.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        event.preventDefault();
        pasteIntoSession(session, text).catch((error) => showToast(error.message));
      }
    });

    tab.panes.set(normalizedID, session);
    if (connect) {
      connectSession(session).catch((error) => {
        session.term.write(`\r\n[webshell error] ${error.message}\r\n`);
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
      showContextMenu(event.clientX, event.clientY, { type: "tab", tabId: tab.id, paneId: tab.activePaneId });
    });
    tab.button = button;
    renderTabLabel(tab);
    tabsEl.appendChild(button);
  };

  const createTab = ({ id = "", label, pane, focus = true, connect = true, customLabel = false, empty = false } = {}) => {
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
    setActiveTab(tab.id, { focus });
    updateEmptyState();
    return tab;
  };

  const setActiveTab = (tabId, { focus = true } = {}) => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return;
    }
    const wasActive = activeTabId === tab.id;
    activeTabId = tab.id;
    for (const item of tabs.values()) {
      const isActive = item.id === activeTabId;
      item.paneEl.classList.toggle("active", isActive);
      item.button?.classList.toggle("active", isActive);
      item.button?.setAttribute("aria-selected", isActive ? "true" : "false");
      item.button?.setAttribute("tabindex", isActive ? "0" : "-1");
    }
    setActivePane(tab, tab.activePaneId, { focus });
    syncCursorBlinkState();
    clearTabNotification(tab);
    rememberActiveTab();
    window.requestAnimationFrame(() => resizeTab(tab));
    if (!applyingWorkspaceState && !wasActive) {
      postWorkspaceAction("activate_tab", { tab_id: tab.id }).catch((error) => showToast(error.message));
    }
  };

  const renderLeaf = (tab, node) => {
    const pane = tab.panes.get(node.paneId);
    if (!pane) {
      const missing = document.createElement("div");
      missing.className = "missing-pane";
      missing.textContent = "Pane unavailable";
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

  const applyWorkspaceState = (state, { focus = false } = {}) => {
    applyingWorkspaceState = true;
    try {
      const nextTabIDs = new Set((state?.tabs || []).map((tab) => tab.id));
      for (const tab of [...tabs.values()]) {
        if (!nextTabIDs.has(tab.id)) {
          closeTab(tab.id);
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
            createPaneSession(tab, activeName, { id: paneState.id, connect: true });
          }
          updatePaneActivity(paneState);
        }
        renderTabLabel(tab);
        renderTabLayout(tab);
      }

      const requestedTab = (new URLSearchParams(window.location.search).get("tab") || "").trim();
      const savedTab = activeName ? window.localStorage.getItem(lastTabStorageKey(activeName)) : "";
      const nextActiveTab = tabs.get(requestedTab) || tabs.get(savedTab) || tabs.get(state?.active_tab_id) || tabs.values().next().value || null;
      if (nextActiveTab) {
        setActiveTab(nextActiveTab.id, { focus });
      } else {
        activeTabId = null;
      }
      updateEmptyState();
      window.requestAnimationFrame(() => resizeAllTabsForCurrentDevice());
    } finally {
      applyingWorkspaceState = false;
    }
  };

  const refreshWorkspace = async ({ focus = false } = {}) => {
    const state = await fetchWorkspaceState(activeName);
    applyWorkspaceState(state, { focus });
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
    clearReconnectTimer(pane);
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
      refreshAndConfirmClose([pane], "Close this pane and terminate the running command?").then((confirmed) => {
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
      closeTab(tab.id, { allowLast: true });
      return;
    }
    renderTabLayout(tab);
    setActiveTab(tab.id);
  };

  const closeTab = (tabId, { allowLast = true } = {}) => {
    const tab = tabs.get(tabId);
    if (!tab) {
      return;
    }
    if (!allowLast && tabs.size <= 1) {
      showToast("At least one tab must remain.");
      return;
    }
    if (!applyingWorkspaceState) {
      refreshAndConfirmClose(targetPanesFromTab(tab), "Close this tab and terminate running commands?").then((confirmed) => {
        if (confirmed) {
          postWorkspaceAction("close_tab", { tab_id: tabId }).catch((error) => showToast(error.message));
        }
      });
      return;
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
        setActiveTab(nextActiveTab.id);
      }
    }
    updateEmptyState();
  };

  const closeOtherTabs = (tabId) => {
    if (!applyingWorkspaceState) {
      const panes = Array.from(tabs.values())
        .filter((tab) => tab.id !== tabId)
        .flatMap((tab) => targetPanesFromTab(tab));
      refreshAndConfirmClose(panes, "Close other tabs and terminate running commands?").then((confirmed) => {
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
  };

  const closeContextMenu = () => {
    if (contextMenu) {
      contextMenu.hidden = true;
    }
    contextTarget = null;
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
      const paneOnly = ["copy", "paste", "select-all", "search", "split-vertical", "split-horizontal", "move-pane-new-tab", "close-pane"].includes(action);
      const tabOnly = ["rename-tab", "move-tab-first", "move-tab-left", "move-tab-right", "move-tab-last", "close-other-tabs", "close-tab"].includes(action);
      const linkOnly = ["open-link", "copy-link"].includes(action);
      item.hidden = (paneOnly && !target.paneId) || (tabOnly && !target.tabId) || (linkOnly && !target.link);
    }
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
      case "paste":
        pasteIntoSession(tabs.get(target.tabId)?.panes.get(target.paneId)).catch((error) => showToast(error.message));
        break;
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
        copyText(target.link).then((ok) => showToast(ok ? "Link copied." : "Copy failed."));
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
        openThemePicker();
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
        openThemePicker();
        return;
      case "switch_container":
        await openInstanceSwitcher();
        return;
      case "copy_terminal":
        await copyFromSession();
        return;
      case "paste_terminal":
        await pasteIntoSession();
        return;
      case "search_terminal":
        openSearch();
        return;
      case "select_all_terminal":
        selectAllSessionBuffer();
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
    if (event.isComposing || event.key === "Process" || Number(event.keyCode || 0) === 229) {
      return;
    }
    if (
      (themePickerBackdrop && !themePickerBackdrop.hidden) ||
      (settingsBackdrop && !settingsBackdrop.hidden) ||
      (instanceSwitcherPanel && !instanceSwitcherPanel.hidden)
    ) {
      return;
    }
    if (isInteractiveShortcutTarget(event.target)) {
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
    const shortcut = getShortcutKeyFromEvent(event);
    const action = shortcutActionMap.get(shortcut);
    if (!action) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    closeContextMenu();
    runShortcutAction(action).catch((error) => showToast(error.message || "Shortcut failed"));
  };

  const renderInstanceSwitcher = () => {
    if (!instanceSwitcherList) {
      return;
    }
    const active = getActiveInstance();
    if (instanceSwitcherName) {
      instanceSwitcherName.textContent = active ? instanceDisplayName(active) : activeName || "Container";
    }
    if (instanceSwitcherStatusDot) {
      instanceSwitcherStatusDot.dataset.status = active?.status || "unknown";
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
    if (!instanceSwitcher || !instanceSwitcherPanel || !instanceSwitcherButton) {
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

  const resetTabsForInstance = () => {
    applyingWorkspaceState = true;
    try {
      for (const tab of [...tabs.values()]) {
        closeTab(tab.id);
      }
    } finally {
      applyingWorkspaceState = false;
    }
  };

  const switchInstance = async (nextName, { updateURL = true, replaceURL = false } = {}) => {
    const normalized = String(nextName || "").trim();
    if (!normalized || normalized === activeName) {
      return;
    }
    activeName = normalized;
    if (updateURL) {
      updateLocationName(activeName, { replace: replaceURL, tabId: "" });
    }
    renderInstanceSwitcher();
    resetTabsForInstance();
    await refreshWorkspace({ focus: true });
  };

  const refreshInstances = async () => {
    const instances = await loadInstances();
    if (!activeName) {
      activeName = await loadDefaultInstanceName();
      updateLocationName(activeName, { replace: true, tabId: "" });
    }
    const active = instances.find((item) => instanceSelector(item) === activeName);
    if (!active || !isRunningInstance(active)) {
      const fallback = instances.find((item) => isRunningInstance(item));
      const fallbackName = instanceSelector(fallback);
      if (fallbackName) {
        activeName = fallbackName;
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

  newTabButton?.addEventListener("click", () => {
    createUserTab().catch((error) => showToast(error.message));
  });

  emptyStateAction?.addEventListener("click", () => {
    createUserTab().catch((error) => showToast(error.message));
  });

  instanceSwitcherButton?.addEventListener("click", () => {
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
  themeMenuButton?.addEventListener("click", () => {
    closeInstanceSwitcher();
    openThemePicker();
  });
  settingsMenuButton?.addEventListener("click", openSettings);
  themePickerButton?.addEventListener("click", openThemePicker);
  themePickerClose?.addEventListener("click", closeThemePicker);
  themePickerBackdrop?.addEventListener("click", (event) => {
    if (event.target === themePickerBackdrop) {
      const { clientX, clientY } = event;
      closeThemePicker();
      focusPaneAtPoint(clientX, clientY);
    }
  });
  themePickerList?.addEventListener("click", (event) => {
    const option = event.target.closest(".theme-option");
    if (!option) {
      return;
    }
    applyTheme(option.dataset.theme);
  });

  settingsClose?.addEventListener("click", closeSettings);
  settingsBackdrop?.addEventListener("click", (event) => {
    if (event.target === settingsBackdrop) {
      closeSettings();
    }
  });
  settingsFontSelect?.addEventListener("change", () => {
    const fontID = settingsFontSelect.value || "";
    settingsFontSelect.disabled = true;
    if (settingsFontDelete) {
      settingsFontDelete.disabled = true;
    }
    saveTerminalFontSelection(fontID)
      .then(() => setSettingsFeedback(fontID ? "终端字体已更新。" : "已恢复系统默认字体。", "success"))
      .catch((error) => setSettingsFeedback(error.message || "字体设置保存失败。", "error"))
      .finally(() => {
        settingsFontSelect.disabled = false;
        renderSettingsFonts();
      });
  });
  settingsFontInput?.addEventListener("change", () => {
    const file = settingsFontInput.files?.[0];
    if (!file) {
      return;
    }
    settingsFontInput.disabled = true;
    setSettingsFeedback("正在上传字体...", "info");
    uploadTerminalFont(file)
      .then(() => {
        settingsFontInput.value = "";
        setSettingsFeedback("字体已上传并应用。", "success");
      })
      .catch((error) => setSettingsFeedback(error.message || "字体上传失败。", "error"))
      .finally(() => {
        settingsFontInput.disabled = false;
      });
  });
  settingsFontDelete?.addEventListener("click", () => {
    settingsFontDelete.disabled = true;
    deleteSelectedFont()
      .catch((error) => setSettingsFeedback(error.message || "字体删除失败。", "error"))
      .finally(() => renderSettingsFonts());
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
    } else if (action === "clear") {
      const session = activeSession();
      session?.term?.clearSelection?.();
      if (session) {
        session.selectAllBufferActive = false;
      }
      updateSelectionSheet();
    }
  });

  contextMenu?.addEventListener("click", (event) => {
    const item = event.target.closest(".context-menu-btn");
    if (!item) {
      return;
    }
    runContextAction(item.dataset.action);
  });

  document.addEventListener("pointerdown", (event) => {
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
      closeInstanceSwitcher();
      closeThemePicker();
      closeSettings();
    }
    handleGlobalShortcutKeydown(event);
  }, true);

  window.addEventListener("resize", () => resizeAllTabsForCurrentDevice());
  document.fonts?.ready?.then(() => {
    for (const tab of tabs.values()) {
      for (const pane of tab.panes.values()) {
        refreshTerminalMetrics(pane);
      }
    }
  });
  window.addEventListener("popstate", () => {
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
    showToast("Network is online. Reconnecting.");
    refreshServerRevision().catch(() => {});
    reconnectVisibleSessions();
    refreshActivity({ silent: true }).catch(() => {});
  });
  window.addEventListener("offline", () => {
    setNetworkBanner(true);
    showToast("Network is offline.");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshServerRevision().catch(() => {});
      reconnectVisibleSessions();
      refreshActivity({ silent: true }).catch(() => {});
      updateSelectionSheet();
    }
  });
  window.addEventListener("focus", () => {
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
    showToast(error.message);
    activeName = "";
    renderInstanceSwitcher();
    createTab({ label: "Error", focus: true, connect: false });
    const tab = currentTab();
    const pane = tab?.panes.get(tab.activePaneId);
    pane?.term?.write(`\r\n[webshell error] ${error.message}\r\n`);
  });
})();
