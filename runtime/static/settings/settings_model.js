export const BACKTAB_SEQUENCE = "\x1b[Z";

export const DEFAULT_TERMINAL_FONT_SIZE = 16;
export const MIN_TERMINAL_FONT_SIZE = 10;
export const MAX_TERMINAL_FONT_SIZE = 32;
export const DEFAULT_TERMINAL_SCROLLBACK = 5000;
export const MIN_TERMINAL_SCROLLBACK = 100;
export const MAX_TERMINAL_SCROLLBACK = 100000;
export const DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT = 100;
export const MIN_TERMINAL_LINE_HEIGHT_PERCENT = 100;
export const MAX_TERMINAL_LINE_HEIGHT_PERCENT = 160;
export const DEFAULT_TERMINAL_FONT_FAMILY = '"DejaVu Sans Mono", "Liberation Mono", monospace';

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

export const mobileShortcutKeyOptions = Object.freeze([
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
]);

export const mobileShortcutActionOptions = Object.freeze([
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
]);

const desktopShortcutActionEntries = [
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
];

for (let index = 1; index <= 9; index += 1) {
  desktopShortcutActionEntries.push([`tab_${index}`, `切换到第 ${index} 个标签`]);
}

export const desktopShortcutActionLabels = new Map(desktopShortcutActionEntries);
export const desktopShortcutActionOptions = Object.freeze(
  desktopShortcutActionEntries.map(([value, label]) => ({ value, label })),
);

export const defaultMobileShortcutRows = Object.freeze([
  Object.freeze([
    { id: "sticky-ctrl", label: "Ctrl+", ariaLabel: "Sticky Control", action: "sticky_ctrl", kind: "modifier" },
    { id: "sticky-alt", label: "Alt+", ariaLabel: "Sticky Alt", action: "sticky_alt", kind: "modifier" },
    { id: "sticky-shift", label: "Shift+", ariaLabel: "Sticky Shift", action: "sticky_shift", kind: "modifier" },
    { id: "tab", label: "Tab", ariaLabel: "Tab", data: "\t", inputKey: "tab" },
    { id: "continue", label: "Continue", ariaLabel: "Continue", text: "continue", data: "continue", kind: "primary" },
    { id: "return", label: "Return", ariaLabel: "Return", data: "\r", inputKey: "enter", kind: "primary" },
    { id: "arrow-up", label: "↑", ariaLabel: "Up Arrow", data: "\x1b[A", inputKey: "arrow_up", kind: "nav" },
    { id: "arrow-down", label: "↓", ariaLabel: "Down Arrow", data: "\x1b[B", inputKey: "arrow_down", kind: "nav" },
    { id: "arrow-left", label: "←", ariaLabel: "Left Arrow", data: "\x1b[D", inputKey: "arrow_left", kind: "nav" },
    { id: "arrow-right", label: "→", ariaLabel: "Right Arrow", data: "\x1b[C", inputKey: "arrow_right", kind: "nav" },
    { id: "copy", label: "Copy", ariaLabel: "Copy", action: "copy" },
    { id: "paste", label: "Paste", ariaLabel: "Paste", action: "paste" },
    { id: "page-up", label: "PageUp", ariaLabel: "Page Up", action: "page_up" },
    { id: "page-down", label: "PageDown", ariaLabel: "Page Down", action: "page_down" },
  ]),
  Object.freeze([
    { id: "mobile-menu", label: "Menu", ariaLabel: "Menu", action: "open_mobile_menu", kind: "menu" },
    { id: "ctrl-e", label: "Ctrl+E", ariaLabel: "Control E", data: "\x05", inputKey: "e", inputModifiers: { ctrl: true } },
    { id: "ctrl-c", label: "Ctrl+C", ariaLabel: "Control C", data: "\x03", inputKey: "c", inputModifiers: { ctrl: true }, kind: "primary" },
    { id: "swap-tab", label: "Swap", ariaLabel: "切换最近两个终端", action: "swap_tab" },
    { id: "shift-tab", label: "Shift+Tab", ariaLabel: "Shift Tab", data: BACKTAB_SEQUENCE, inputKey: "tab", inputModifiers: { shift: true } },
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
  ]),
]);

export function isMacPlatform(navigatorObject = globalThis.navigator) {
  const platform = String(navigatorObject?.userAgentData?.platform || navigatorObject?.platform || "");
  if (/mac/i.test(platform)) {
    return true;
  }
  return /\bMacintosh\b|\bMac OS X\b/i.test(String(navigatorObject?.userAgent || ""));
}

export function createDefaultDesktopShortcuts(navigatorObject = globalThis.navigator) {
  const macShortcut = (mac, fallback) => isMacPlatform(navigatorObject) ? mac : fallback;
  const definitions = {
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
  for (let index = 1; index <= 9; index += 1) {
    definitions[`tab_${index}`] = macShortcut(`Option + ${index}`, `Alt + ${index}`);
  }
  const shortcuts = [
    { id: "fullscreen", label: "全屏", action: "fullscreen", shortcut: definitions.fullscreen },
    { id: "new-tab", label: "新建标签", action: "new_tab", shortcut: definitions.new_tab },
    { id: "close-tab", label: "关闭标签", action: "close_tab", shortcut: definitions.close_tab },
    { id: "close-other-tabs", label: "关闭其他标签", action: "close_other_tabs", shortcut: definitions.close_other_tabs },
    { id: "rename-tab", label: "重命名标签", action: "rename_tab", shortcut: definitions.rename_tab },
    { id: "next-tab", label: "下一个标签", action: "next_tab", shortcut: definitions.next_tab },
    { id: "previous-tab", label: "上一个标签", action: "previous_tab", shortcut: definitions.previous_tab },
    { id: "last-tab", label: "最后一个标签", action: "last_tab", shortcut: definitions.last_tab },
    { id: "move-tab-first", label: "标签移到最前", action: "move_tab_to_first", shortcut: definitions.move_tab_to_first },
    { id: "move-tab-left", label: "标签左移", action: "move_tab_left", shortcut: definitions.move_tab_left },
    { id: "move-tab-right", label: "标签右移", action: "move_tab_right", shortcut: definitions.move_tab_right },
    { id: "move-tab-last", label: "标签移到最后", action: "move_tab_to_last", shortcut: definitions.move_tab_to_last },
    { id: "vertical-split", label: "左右分屏", action: "vertical_split", shortcut: definitions.vertical_split },
    { id: "horizontal-split", label: "上下分屏", action: "horizontal_split", shortcut: definitions.horizontal_split },
    { id: "select-up", label: "选择上方窗格", action: "select_up", shortcut: definitions.select_up },
    { id: "select-down", label: "选择下方窗格", action: "select_down", shortcut: definitions.select_down },
    { id: "select-left", label: "选择左侧窗格", action: "select_left", shortcut: definitions.select_left },
    { id: "select-right", label: "选择右侧窗格", action: "select_right", shortcut: definitions.select_right },
    { id: "close-pane", label: "关闭窗格", action: "close_pane", shortcut: definitions.close_pane },
    { id: "theme", label: "主题设置", action: "theme", shortcut: definitions.theme },
    { id: "switch-container", label: "切换实例", action: "switch_container", shortcut: definitions.switch_container },
    { id: "copy-terminal", label: "复制", action: "copy_terminal", shortcut: definitions.copy_terminal },
    { id: "paste-terminal", label: "粘贴", action: "paste_terminal", shortcut: definitions.paste_terminal },
    { id: "search-terminal", label: "搜索", action: "search_terminal", shortcut: definitions.search_terminal },
    { id: "attachment-clipboard", label: "从剪贴板导入附件", action: "attachment_clipboard", shortcut: definitions.attachment_clipboard },
    { id: "attachment-file", label: "上传附件文件", action: "attachment_file", shortcut: definitions.attachment_file },
  ];
  for (let index = 1; index <= 9; index += 1) {
    shortcuts.push({
      id: `tab-${index}`,
      label: `第 ${index} 个标签`,
      action: `tab_${index}`,
      shortcut: definitions[`tab_${index}`],
    });
  }
  return shortcuts;
}

export function normalizeShortcutInputModifiers(modifiers = {}) {
  return {
    ctrl: modifiers?.ctrl === true,
    shift: modifiers?.shift === true,
    alt: modifiers?.alt === true,
  };
}

export function mergeShortcutInputModifiers(...states) {
  const merged = { ctrl: false, shift: false, alt: false };
  for (const state of states) {
    const normalized = normalizeShortcutInputModifiers(state);
    merged.ctrl ||= normalized.ctrl;
    merged.shift ||= normalized.shift;
    merged.alt ||= normalized.alt;
  }
  return merged;
}

export function hasShortcutInputModifiers(modifiers = {}) {
  const normalized = normalizeShortcutInputModifiers(modifiers);
  return normalized.ctrl || normalized.shift || normalized.alt;
}

export function canApplyStickyModifierInput(value) {
  const points = Array.from(String(value || ""));
  if (points.length !== 1) {
    return false;
  }
  const codePoint = points[0].codePointAt(0);
  return Number.isFinite(codePoint) && codePoint >= 0x20 && codePoint !== 0x7f;
}

export function applyStickyShiftInput(value) {
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
}

function applyStickyCtrlInput(value) {
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
}

function applyStickyAltInput(value) {
  const raw = String(value || "");
  return raw ? `\x1b${raw}` : "";
}

export function applyStickyModifierInput(value, { ctrl = false, shift = false, alt = false } = {}) {
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
  return alt ? applyStickyAltInput(encoded) : encoded;
}

function resolveTerminalModifierParameter(modifiers = {}) {
  const normalized = normalizeShortcutInputModifiers(modifiers);
  return 1 + Number(normalized.shift) + Number(normalized.alt) * 2 + Number(normalized.ctrl) * 4;
}

function buildModifiedCsiFinalSequence(finalChar, modifiers = {}) {
  const normalized = normalizeShortcutInputModifiers(modifiers);
  if (!hasShortcutInputModifiers(normalized)) {
    return `\x1b[${finalChar}`;
  }
  return `\x1b[1;${resolveTerminalModifierParameter(normalized)}${finalChar}`;
}

export function encodeMobileShortcutKeyInput(inputKey, modifiers = {}) {
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
          return BACKTAB_SEQUENCE;
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
}

export function resolveMobileShortcutInputData(shortcut, stickyModifiers = {}) {
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
  return encodeMobileShortcutKeyInput(inputKey, modifiers) || rawData;
}

export const normalizeMobileShortcutTextData = (text) => String(text || "")
  .replace(/\r\n/g, "\r")
  .replace(/\n/g, "\r");

export function cloneMobileShortcutRows(rows) {
  return [0, 1].map((rowIndex) => Array.isArray(rows?.[rowIndex])
    ? rows[rowIndex].map((shortcut) => ({
      ...shortcut,
      inputKey: String(shortcut?.inputKey || shortcut?.input_key || "").trim(),
      text: typeof shortcut?.text === "string" ? shortcut.text : "",
      ariaLabel: String(shortcut?.ariaLabel || shortcut?.aria_label || "").trim(),
      inputModifiers: normalizeShortcutInputModifiers(shortcut?.inputModifiers || shortcut?.input_modifiers),
    }))
    : []);
}

export function cloneDesktopShortcuts(shortcuts) {
  return Array.isArray(shortcuts)
    ? shortcuts.map((shortcut) => ({
      id: String(shortcut?.id || "").trim(),
      label: String(shortcut?.label || "").trim(),
      action: String(shortcut?.action || "").trim(),
      shortcut: String(shortcut?.shortcut || "").trim(),
    }))
    : [];
}

function toClientMobileShortcut(shortcut) {
  const id = String(shortcut?.id || "").trim();
  const label = String(shortcut?.label || "").trim();
  const action = String(shortcut?.action || "").trim();
  const inputKey = String(shortcut?.inputKey || shortcut?.input_key || "").trim();
  const text = typeof shortcut?.text === "string" ? shortcut.text : "";
  if (!id || !label || (!action && !inputKey && text === "")) {
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
}

export function normalizeMobileShortcutRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 2) {
    return cloneMobileShortcutRows(defaultMobileShortcutRows);
  }
  return [0, 1].map((rowIndex) => Array.isArray(rows[rowIndex])
    ? rows[rowIndex].map(toClientMobileShortcut).filter(Boolean)
    : []);
}

export function serializeMobileShortcutRows(rows) {
  return cloneMobileShortcutRows(rows).map((row) => row.map((shortcut) => {
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
}

export function normalizeShortcutKeyToken(token) {
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
}

export function serializeShortcut({ ctrl = false, shift = false, alt = false, superKey = false, key = "" } = {}) {
  if (!key) {
    return "";
  }
  const parts = [];
  if (ctrl) parts.push("ctrl");
  if (shift) parts.push("shift");
  if (alt) parts.push("alt");
  if (superKey) parts.push("super");
  parts.push(key);
  return parts.join("+");
}

export function displayShortcut(shortcut, navigatorObject = globalThis.navigator) {
  return String(shortcut || "")
    .split("+")
    .map((part) => {
      const token = normalizeShortcutKeyToken(part);
      switch (token) {
        case "ctrl": return "Ctrl";
        case "shift": return "Shift";
        case "alt": return isMacPlatform(navigatorObject) ? "Option" : "Alt";
        case "super": return isMacPlatform(navigatorObject) ? "Command" : "Super";
        case "page_up": return "PageUp";
        case "page_down": return "PageDown";
        default:
          if (/^f\d{1,2}$/.test(token)) return token.toUpperCase();
          return token.length === 1 ? token.toUpperCase() : token.replace(/_/g, " ");
      }
    })
    .filter(Boolean)
    .join(" + ");
}

export function normalizeShortcutDefinition(value) {
  const state = { ctrl: false, shift: false, alt: false, superKey: false, key: "" };
  for (const part of String(value || "").split("+")) {
    const token = normalizeShortcutKeyToken(part);
    switch (token) {
      case "ctrl": state.ctrl = true; break;
      case "shift": state.shift = true; break;
      case "alt": state.alt = true; break;
      case "super": state.superKey = true; break;
      default: state.key = token; break;
    }
  }
  return serializeShortcut(state);
}

export function shortcutKeyFromEventCode(event) {
  const code = String(event?.code || "");
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  return "";
}

export function getShortcutKeyFromEvent(event, navigatorObject = globalThis.navigator) {
  let key = normalizeShortcutKeyToken(event?.key);
  if (isMacPlatform(navigatorObject) && event?.altKey) {
    key = shortcutKeyFromEventCode(event) || key;
  }
  if ((!key || key === "process" || Number(event?.keyCode || 0) === 229) && (event?.ctrlKey || event?.altKey || event?.metaKey)) {
    key = shortcutKeyFromEventCode(event) || key;
  }
  if (!key || ["ctrl", "shift", "alt", "super"].includes(key)) {
    return "";
  }
  return serializeShortcut({
    ctrl: event?.ctrlKey,
    shift: event?.shiftKey,
    alt: event?.altKey,
    superKey: event?.metaKey,
    key,
  });
}

export function isShiftInsertPasteShortcutEvent(event) {
  const key = normalizeShortcutKeyToken(shortcutKeyFromEventCode(event) || event?.key);
  const keyCode = Number(event?.keyCode || event?.which || 0);
  return (key === "insert" || keyCode === 45) && event?.shiftKey && !event?.ctrlKey && !event?.altKey && !event?.metaKey;
}

export function isNativePasteShortcutEvent(event, navigatorObject = globalThis.navigator) {
  const key = normalizeShortcutKeyToken(shortcutKeyFromEventCode(event) || event?.key);
  const keyCode = Number(event?.keyCode || event?.which || 0);
  if ((key !== "v" && keyCode !== 86) || event?.altKey) {
    return false;
  }
  const ctrlShiftPaste = event?.ctrlKey && event?.shiftKey && !event?.metaKey;
  if (isMacPlatform(navigatorObject)) {
    return (event?.metaKey && !event?.ctrlKey) || ctrlShiftPaste;
  }
  return event?.ctrlKey && !event?.metaKey;
}

export function terminalFontSizeShortcutAction(event, navigatorObject = globalThis.navigator) {
  if (!event || event.altKey) {
    return "";
  }
  const usesControl = event.ctrlKey && !event.metaKey;
  const usesCommand = isMacPlatform(navigatorObject) && event.metaKey && !event.ctrlKey;
  if (!usesControl && !usesCommand) {
    return "";
  }
  const key = String(event.key || "");
  const code = String(event.code || "");
  if (key === "+" || key === "=" || code === "Equal" || code === "NumpadAdd") return "increase";
  if (key === "-" || key === "_" || code === "Minus" || code === "NumpadSubtract") return "decrease";
  if (key === "0" || (!event.shiftKey && code === "Digit0") || code === "Numpad0") return "reset";
  return "";
}

function toClientDesktopShortcut(shortcut) {
  const id = String(shortcut?.id || "").trim();
  const action = String(shortcut?.action || "").trim();
  const normalizedShortcut = normalizeShortcutDefinition(shortcut?.shortcut);
  if (!id || !desktopShortcutActionLabels.has(action) || !normalizedShortcut) {
    return null;
  }
  return {
    id,
    label: String(shortcut?.label || "").trim() || desktopShortcutActionLabels.get(action) || action,
    action,
    shortcut: String(shortcut?.shortcut || "").trim(),
  };
}

export function normalizeDesktopShortcuts(shortcuts, defaults = createDefaultDesktopShortcuts()) {
  if (!Array.isArray(shortcuts)) {
    return cloneDesktopShortcuts(defaults);
  }
  const seenShortcuts = new Set();
  return shortcuts.map(toClientDesktopShortcut).filter((shortcut) => {
    if (!shortcut) return false;
    const normalized = normalizeShortcutDefinition(shortcut.shortcut);
    if (!normalized || seenShortcuts.has(normalized)) return false;
    seenShortcuts.add(normalized);
    return true;
  });
}

export function serializeDesktopShortcuts(shortcuts) {
  return cloneDesktopShortcuts(shortcuts).map((shortcut) => ({
    id: shortcut.id,
    label: shortcut.label,
    action: shortcut.action,
    shortcut: shortcut.shortcut,
  }));
}

export function normalizeUploadedFont(font) {
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
    url: String(font?.url || `api/settings/fonts/${encodeURIComponent(id)}/file`).trim(),
    sourceName: String(font?.source_name || "").trim(),
    builtin: font?.builtin === true,
  };
}

export function normalizeTerminalSymbolFont(font) {
  const normalized = normalizeUploadedFont(font);
  return normalized ? { ...normalized, sha256: String(font?.sha256 || "").trim() } : null;
}

export function normalizeTerminalScrollback(value) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next) || next < MIN_TERMINAL_SCROLLBACK || next > MAX_TERMINAL_SCROLLBACK) {
    return DEFAULT_TERMINAL_SCROLLBACK;
  }
  return next;
}

export function normalizeTerminalLineHeightPercent(value) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next) || next < MIN_TERMINAL_LINE_HEIGHT_PERCENT || next > MAX_TERMINAL_LINE_HEIGHT_PERCENT) {
    return DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT;
  }
  return next;
}

export function normalizeTerminalFontSize(value) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
  return Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, next));
}

export function readStoredTerminalFontSize(storage, storagePrefix = "webshell") {
  try {
    if (storage?.getItem?.(`${storagePrefix}.fontSizeVersion`) !== "2") {
      return DEFAULT_TERMINAL_FONT_SIZE;
    }
    return normalizeTerminalFontSize(storage?.getItem?.(`${storagePrefix}.fontSize`));
  } catch (error) {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
}

export function readStoredBoolean(storage, key, fallback = false) {
  try {
    const value = storage?.getItem?.(key);
    return value === null || value === undefined ? fallback : String(value) === "true";
  } catch (error) {
    return fallback;
  }
}

export function buildTerminalFontFamily(selectedFont, symbolFont) {
  const cssString = (value) => `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return [
    selectedFont?.family ? cssString(selectedFont.family) : "",
    symbolFont?.family ? cssString(symbolFont.family) : "",
    DEFAULT_TERMINAL_FONT_FAMILY,
  ].filter(Boolean).join(", ");
}

export function cloneSettingsSnapshot(snapshot) {
  return {
    terminalFontSize: normalizeTerminalFontSize(snapshot?.terminalFontSize),
    terminalLineHeightPercent: normalizeTerminalLineHeightPercent(snapshot?.terminalLineHeightPercent),
    terminalScrollback: normalizeTerminalScrollback(snapshot?.terminalScrollback),
    terminalFontID: String(snapshot?.terminalFontID || ""),
    terminalFontFamily: String(snapshot?.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY),
    terminalSymbolFont: snapshot?.terminalSymbolFont ? { ...snapshot.terminalSymbolFont } : null,
    fonts: Array.isArray(snapshot?.fonts) ? snapshot.fonts.map((font) => ({ ...font })) : [],
    desktopMouseClipboardEnabled: snapshot?.desktopMouseClipboardEnabled !== false,
    desktopShortcutsBarEnabled: snapshot?.desktopShortcutsBarEnabled === true,
    mobilePixelScrollEnabled: snapshot?.mobilePixelScrollEnabled !== false,
    mobileDoubleTapReminderEnabled: snapshot?.mobileDoubleTapReminderEnabled !== false,
    mobileRemoteDesktopEnabled: snapshot?.mobileRemoteDesktopEnabled === true,
    forcePCModeEnabled: snapshot?.forcePCModeEnabled === true,
    mobileShortcuts: cloneMobileShortcutRows(snapshot?.mobileShortcuts),
    desktopShortcuts: cloneDesktopShortcuts(snapshot?.desktopShortcuts),
  };
}

export function normalizeServerSettings(raw, { defaults = createDefaultDesktopShortcuts() } = {}) {
  const fonts = Array.isArray(raw?.fonts) ? raw.fonts.map(normalizeUploadedFont).filter(Boolean) : [];
  const terminalFontID = String(raw?.terminal_font_id || "").trim();
  const selectedFontID = fonts.some((font) => font.id === terminalFontID) ? terminalFontID : "";
  const terminalSymbolFont = normalizeTerminalSymbolFont(raw?.terminal_symbol_font);
  return {
    fonts,
    terminalFontID: selectedFontID,
    terminalSymbolFont,
    terminalFontFamily: buildTerminalFontFamily(fonts.find((font) => font.id === selectedFontID), terminalSymbolFont),
    terminalLineHeightPercent: normalizeTerminalLineHeightPercent(raw?.terminal_line_height_percent),
    terminalScrollback: normalizeTerminalScrollback(raw?.terminal_scrollback),
    desktopMouseClipboardEnabled: raw?.desktop_mouse_clipboard_enabled !== false,
    desktopShortcutsBarEnabled: raw?.desktop_shortcuts_bar_enabled === true,
    mobilePixelScrollEnabled: raw?.mobile_pixel_scroll_enabled !== false,
    mobileDoubleTapReminderEnabled: raw?.mobile_double_tap_reminder_enabled !== false,
    mobileShortcuts: normalizeMobileShortcutRows(raw?.mobile_shortcuts),
    desktopShortcuts: normalizeDesktopShortcuts(Array.isArray(raw?.desktop_shortcuts) ? raw.desktop_shortcuts : defaults, defaults),
  };
}

export function formatMobileShortcutTextPreview(text) {
  const visible = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n");
  const points = Array.from(visible);
  return points.length > 32 ? `${points.slice(0, 32).join("")}...` : visible;
}

export function describeMobileShortcut(shortcut) {
  if (shortcut?.action) {
    return mobileShortcutActionOptions.find((item) => item.value === shortcut.action)?.label || shortcut.action;
  }
  if (typeof shortcut?.text === "string" && shortcut.text !== "") {
    return `发送文字: ${formatMobileShortcutTextPreview(shortcut.text)}`;
  }
  const key = String(shortcut?.inputKey || "");
  const keyLabel = key.length === 1
    ? key
    : mobileShortcutKeyOptions.find((item) => item.value === key)?.label || key;
  const modifiers = normalizeShortcutInputModifiers(shortcut?.inputModifiers);
  return [modifiers.ctrl ? "Ctrl" : "", modifiers.alt ? "Alt" : "", modifiers.shift ? "Shift" : "", keyLabel]
    .filter(Boolean)
    .join("+");
}
