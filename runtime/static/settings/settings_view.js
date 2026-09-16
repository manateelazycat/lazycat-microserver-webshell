import {
  DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT,
  DEFAULT_TERMINAL_SCROLLBACK,
  MAX_TERMINAL_LINE_HEIGHT_PERCENT,
  MAX_TERMINAL_SCROLLBACK,
  MIN_TERMINAL_LINE_HEIGHT_PERCENT,
  MIN_TERMINAL_SCROLLBACK,
  desktopShortcutActionLabels,
  desktopShortcutActionOptions,
  describeMobileShortcut,
  displayShortcut,
  mobileShortcutActionOptions,
  mobileShortcutKeyOptions,
  normalizeShortcutKeyToken,
  serializeShortcut,
  shortcutKeyFromEventCode,
} from "./settings_model.js";

const formatBytes = (value) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const closest = (event, selector) => event?.target?.closest?.(selector) || null;

export function createSettingsView({
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
} = {}) {
  const byID = (id) => documentObject?.getElementById?.(id) || null;
  const elements = {
    menuButton: byID("settingsMenuButton"),
    clientMenuButton: byID("clientSettingsMenuButton"),
    backdrop: byID("settingsBackdrop"),
    panel: byID("settingsPanel"),
    title: byID("settingsTitle"),
    back: byID("settingsBack"),
    close: byID("settingsClose"),
    mobileNav: byID("settingsMobileNav"),
    fontUploadButton: byID("settingsFontUploadButton"),
    fontEditButton: byID("settingsFontEditButton"),
    fontDeleteSelectedButton: byID("settingsFontDeleteSelectedButton"),
    fontCards: byID("settingsFontCards"),
    fontInput: byID("settingsFontInput"),
    lineHeightInput: byID("settingsLineHeightInput"),
    lineHeightResetButton: byID("settingsLineHeightResetButton"),
    scrollbackInput: byID("settingsScrollbackInput"),
    scrollbackResetButton: byID("settingsScrollbackResetButton"),
    mobileRemoteDesktopToggle: byID("settingsMobileRemoteDesktopToggle"),
    forcePCModeToggle: byID("settingsForcePCModeToggle"),
    desktopMouseClipboardToggle: byID("settingsDesktopMouseClipboardToggle"),
    desktopShortcutsBarToggle: byID("settingsDesktopShortcutsBarToggle"),
    restartWorkspaceRestoreToggle: byID("settingsRestartWorkspaceRestoreToggle"),
    mobilePixelScrollToggle: byID("settingsMobilePixelScrollToggle"),
    mobileDoubleTapReminderToggle: byID("settingsMobileDoubleTapReminderToggle"),
    mobileShortcutAddButton: byID("settingsMobileShortcutAddButton"),
    mobileShortcutResetButton: byID("settingsMobileShortcutResetButton"),
    mobileShortcutList: byID("settingsMobileShortcutList"),
    desktopShortcutAddButton: byID("settingsDesktopShortcutAddButton"),
    desktopShortcutResetButton: byID("settingsDesktopShortcutResetButton"),
    desktopShortcutList: byID("settingsDesktopShortcutList"),
    mobileShortcutEditor: byID("mobileShortcutEditor"),
    mobileShortcutEditorScrim: byID("mobileShortcutEditorScrim"),
    mobileShortcutEditorPanel: byID("mobileShortcutEditorPanel"),
    mobileShortcutEditorTitle: byID("mobileShortcutEditorTitle"),
    mobileShortcutLabelInput: byID("mobileShortcutLabelInput"),
    mobileShortcutTypeInputs: Array.from(documentObject?.querySelectorAll?.('input[name="mobileShortcutType"]') || []),
    mobileShortcutKeyField: byID("mobileShortcutKeyField"),
    mobileShortcutKeySelect: byID("mobileShortcutKeySelect"),
    mobileShortcutCustomKeyField: byID("mobileShortcutCustomKeyField"),
    mobileShortcutCustomKeyInput: byID("mobileShortcutCustomKeyInput"),
    mobileShortcutModifiersField: byID("mobileShortcutModifiersField"),
    mobileShortcutCtrlInput: byID("mobileShortcutCtrlInput"),
    mobileShortcutAltInput: byID("mobileShortcutAltInput"),
    mobileShortcutShiftInput: byID("mobileShortcutShiftInput"),
    mobileShortcutActionField: byID("mobileShortcutActionField"),
    mobileShortcutActionSelect: byID("mobileShortcutActionSelect"),
    mobileShortcutTextField: byID("mobileShortcutTextField"),
    mobileShortcutTextInput: byID("mobileShortcutTextInput"),
    mobileShortcutEditorCancel: byID("mobileShortcutEditorCancel"),
    mobileShortcutEditorDelete: byID("mobileShortcutEditorDelete"),
    desktopShortcutEditor: byID("desktopShortcutEditor"),
    desktopShortcutEditorScrim: byID("desktopShortcutEditorScrim"),
    desktopShortcutEditorPanel: byID("desktopShortcutEditorPanel"),
    desktopShortcutEditorTitle: byID("desktopShortcutEditorTitle"),
    desktopShortcutLabelInput: byID("desktopShortcutLabelInput"),
    desktopShortcutActionSelect: byID("desktopShortcutActionSelect"),
    desktopShortcutCaptureInput: byID("desktopShortcutCaptureInput"),
    desktopShortcutCtrlInput: byID("desktopShortcutCtrlInput"),
    desktopShortcutAltInput: byID("desktopShortcutAltInput"),
    desktopShortcutShiftInput: byID("desktopShortcutShiftInput"),
    desktopShortcutCommandInput: byID("desktopShortcutCommandInput"),
    desktopShortcutKeySelect: byID("desktopShortcutKeySelect"),
    desktopShortcutEditorCancel: byID("desktopShortcutEditorCancel"),
    desktopShortcutEditorDelete: byID("desktopShortcutEditorDelete"),
    mobileShortcutsPanel: byID("settingsPanelMobileShortcuts"),
    desktopShortcutsPanel: byID("settingsPanelDesktopShortcuts"),
    feedback: byID("settingsFeedback"),
    tabs: Array.from(documentObject?.querySelectorAll?.("[data-settings-tab]") || []),
    tabPanels: Array.from(documentObject?.querySelectorAll?.("[data-settings-panel]") || []),
  };
  const fontEditButtonHTML = elements.fontEditButton?.innerHTML || "";

  const activeTabID = () => (
    elements.tabs.find((tab) => tab.getAttribute?.("aria-selected") === "true")?.dataset?.settingsTab || "terminal"
  );
  const tabLabel = (tabID) => {
    const tab = elements.tabs.find((item) => item.dataset?.settingsTab === tabID);
    return String(tab?.textContent || "设置").trim() || "设置";
  };

  const populateSelect = (select, options) => {
    if (!select || select.options?.length > 0) return;
    for (const item of options) {
      const option = documentObject.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    }
  };

  const selectedMobileShortcutType = () => (
    elements.mobileShortcutTypeInputs.find((input) => input.checked)?.value || "input"
  );

  const readInteger = (input, min, max, label) => {
    const raw = String(input?.value || "").trim();
    if (!/^\d+$/.test(raw)) {
      throw new Error(`${label}必须是 ${min}-${max}${label === "行间距" ? "%" : ""} 之间的整数。`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${label}必须是 ${min}-${max}${label === "行间距" ? "%" : ""} 之间的整数。`);
    }
    return value;
  };

  const parseDesktopShortcutState = (shortcut) => {
    const state = { ctrl: false, shift: false, alt: false, superKey: false, key: "" };
    for (const part of String(shortcut || "").split("+")) {
      const token = normalizeShortcutKeyToken(part);
      if (token === "ctrl") state.ctrl = true;
      else if (token === "shift") state.shift = true;
      else if (token === "alt") state.alt = true;
      else if (token === "super") state.superKey = true;
      else state.key = token;
    }
    return state;
  };

  const desktopShortcutFromControls = () => serializeShortcut({
    ctrl: elements.desktopShortcutCtrlInput?.checked === true,
    shift: elements.desktopShortcutShiftInput?.checked === true,
    alt: elements.desktopShortcutAltInput?.checked === true,
    superKey: elements.desktopShortcutCommandInput?.checked === true,
    key: String(elements.desktopShortcutKeySelect?.value || "").trim(),
  });

  const view = {
    elements,
    activeTabID,
    beginMobileShortcutDrag(item, event) {
      if (!elements.mobileShortcutList || !item?.parentElement) return null;
      const rect = item.getBoundingClientRect();
      const placeholder = documentObject.createElement("div");
      placeholder.className = "settings-mobile-shortcut-placeholder";
      placeholder.style.height = `${rect.height}px`;
      item.parentElement.insertBefore(placeholder, item);
      item.classList.add("is-dragging");
      Object.assign(item.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        zIndex: "140",
        pointerEvents: "none",
      });
      documentObject.body?.appendChild(item);
      documentObject.body?.classList.add("is-mobile-shortcut-dragging");
      return {
        pointerId: event.pointerId,
        item,
        placeholder,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
    },
    cancelMobileShortcutDrag(state) {
      if (!state) return;
      state.item.classList.remove("is-dragging");
      state.item.removeAttribute("style");
      state.placeholder.parentElement?.insertBefore(state.item, state.placeholder);
      state.placeholder.remove();
      documentObject.body?.classList.remove("is-mobile-shortcut-dragging");
    },
    close() {
      if (elements.backdrop) elements.backdrop.hidden = true;
    },
    closeDesktopShortcutEditor() {
      if (elements.desktopShortcutEditor) elements.desktopShortcutEditor.hidden = true;
    },
    closeMobileShortcutEditor() {
      if (elements.mobileShortcutEditor) elements.mobileShortcutEditor.hidden = true;
    },
    consumeFontFiles() {
      return Array.from(elements.fontInput?.files || []);
    },
    desktopShortcutIndexFromEvent(event) {
      const button = closest(event, ".settings-desktop-shortcut-edit");
      return button ? Number(button.closest?.(".settings-desktop-shortcut-item")?.dataset?.shortcutIndex || 0) : null;
    },
    finishMobileShortcutDrag(state) {
      if (!state) return;
      state.item.classList.remove("is-dragging");
      state.item.removeAttribute("style");
      state.placeholder.parentElement?.insertBefore(state.item, state.placeholder);
      state.placeholder.remove();
      documentObject.body?.classList.remove("is-mobile-shortcut-dragging");
    },
    focusActiveTab() {
      elements.tabs.find((tab) => tab.getAttribute?.("aria-selected") === "true")?.focus?.();
    },
    focusMobileNavItem() {
      const items = Array.from(elements.mobileNav?.querySelectorAll?.("[data-settings-mobile-nav-tab]") || []);
      (items.find((item) => item.dataset?.settingsMobileNavTab === activeTabID()) || items[0])?.focus?.();
    },
    fontIDFromEvent(event) {
      return closest(event, ".settings-font-card")?.dataset?.fontId ?? null;
    },
    isBackdropTarget(target) {
      return target === elements.backdrop;
    },
    isDesktopShortcutEditorOpen() {
      return Boolean(elements.desktopShortcutEditor && !elements.desktopShortcutEditor.hidden);
    },
    isMobileShortcutEditorOpen() {
      return Boolean(elements.mobileShortcutEditor && !elements.mobileShortcutEditor.hidden);
    },
    isOpen() {
      return Boolean(elements.backdrop && !elements.backdrop.hidden);
    },
    mobileNavTabFromEvent(event) {
      return closest(event, "[data-settings-mobile-nav-tab]")?.dataset?.settingsMobileNavTab || "";
    },
    mobileShortcutEditTarget(event) {
      const button = closest(event, ".settings-mobile-shortcut-edit");
      const item = button?.closest?.(".settings-mobile-shortcut-item");
      return item ? { rowIndex: Number(item.dataset?.rowIndex || 0), index: Number(item.dataset?.shortcutIndex || 0) } : null;
    },
    mobileShortcutDragItem(event) {
      return closest(event, ".settings-mobile-shortcut-drag")?.closest?.(".settings-mobile-shortcut-item") || null;
    },
    mobileShortcutOrder() {
      const rows = [[], []];
      let rowIndex = 0;
      for (const child of Array.from(elements.mobileShortcutList?.children || [])) {
        if (child.dataset?.mobileShortcutDivider === "true") {
          rowIndex = 1;
        } else if (child.classList?.contains("settings-mobile-shortcut-item")) {
          rows[rowIndex].push(String(child.dataset?.shortcutId || ""));
        }
      }
      return rows;
    },
    open() {
      if (elements.backdrop) elements.backdrop.hidden = false;
    },
    openDesktopShortcutEditor(existing) {
      populateSelect(elements.desktopShortcutActionSelect, desktopShortcutActionOptions);
      if (elements.desktopShortcutKeySelect && elements.desktopShortcutKeySelect.options.length === 0) {
        const keys = [
          ...Array.from({ length: 12 }, (_, index) => [`f${index + 1}`, `F${index + 1}`]),
          ["tab", "Tab"], ["home", "Home"], ["end", "End"], ["page_up", "PageUp"], ["page_down", "PageDown"],
          ...Array.from({ length: 10 }, (_, index) => [String(index), String(index)]),
          ...Array.from({ length: 26 }, (_, index) => {
            const value = String.fromCharCode(97 + index);
            return [value, value.toUpperCase()];
          }),
        ];
        populateSelect(elements.desktopShortcutKeySelect, keys.map(([value, label]) => ({ value, label })));
      }
      if (elements.desktopShortcutEditorTitle) elements.desktopShortcutEditorTitle.textContent = existing ? "编辑PC快捷键" : "新增PC快捷键";
      if (elements.desktopShortcutEditorDelete) elements.desktopShortcutEditorDelete.hidden = !existing;
      if (elements.desktopShortcutLabelInput) elements.desktopShortcutLabelInput.value = existing?.label || "";
      if (elements.desktopShortcutActionSelect) elements.desktopShortcutActionSelect.value = existing?.action || "copy_terminal";
      const state = parseDesktopShortcutState(existing?.shortcut || "Ctrl + Shift + c");
      if (elements.desktopShortcutCtrlInput) elements.desktopShortcutCtrlInput.checked = state.ctrl;
      if (elements.desktopShortcutAltInput) elements.desktopShortcutAltInput.checked = state.alt;
      if (elements.desktopShortcutShiftInput) elements.desktopShortcutShiftInput.checked = state.shift;
      if (elements.desktopShortcutCommandInput) elements.desktopShortcutCommandInput.checked = state.superKey;
      if (elements.desktopShortcutKeySelect) {
        elements.desktopShortcutKeySelect.value = state.key || "tab";
        if (elements.desktopShortcutKeySelect.value !== (state.key || "tab")) elements.desktopShortcutKeySelect.value = "tab";
      }
      view.syncDesktopShortcutCapture();
      if (elements.desktopShortcutEditor) elements.desktopShortcutEditor.hidden = false;
    },
    openFontPicker() {
      elements.fontInput?.click?.();
    },
    openMobileShortcutEditor(existing, draft) {
      populateSelect(elements.mobileShortcutKeySelect, mobileShortcutKeyOptions);
      populateSelect(elements.mobileShortcutActionSelect, mobileShortcutActionOptions);
      if (elements.mobileShortcutEditorTitle) elements.mobileShortcutEditorTitle.textContent = existing ? "编辑快捷键" : "新增快捷键";
      if (elements.mobileShortcutEditorDelete) elements.mobileShortcutEditorDelete.hidden = !existing;
      if (elements.mobileShortcutLabelInput) elements.mobileShortcutLabelInput.value = draft.label;
      if (elements.mobileShortcutActionSelect) elements.mobileShortcutActionSelect.value = draft.action;
      if (elements.mobileShortcutTextInput) elements.mobileShortcutTextInput.value = draft.text;
      for (const input of elements.mobileShortcutTypeInputs) input.checked = input.value === draft.type;
      if (elements.mobileShortcutKeySelect) elements.mobileShortcutKeySelect.value = draft.inputKey;
      if (elements.mobileShortcutCustomKeyInput) elements.mobileShortcutCustomKeyInput.value = draft.customKey;
      if (elements.mobileShortcutCtrlInput) elements.mobileShortcutCtrlInput.checked = draft.ctrl;
      if (elements.mobileShortcutAltInput) elements.mobileShortcutAltInput.checked = draft.alt;
      if (elements.mobileShortcutShiftInput) elements.mobileShortcutShiftInput.checked = draft.shift;
      view.syncMobileShortcutEditorFields();
      if (elements.mobileShortcutEditor) elements.mobileShortcutEditor.hidden = false;
    },
    readDesktopShortcutDraft() {
      return {
        label: String(elements.desktopShortcutLabelInput?.value || ""),
        action: String(elements.desktopShortcutActionSelect?.value || ""),
        shortcut: desktopShortcutFromControls(),
      };
    },
    readLineHeight() {
      return readInteger(elements.lineHeightInput, MIN_TERMINAL_LINE_HEIGHT_PERCENT, MAX_TERMINAL_LINE_HEIGHT_PERCENT, "行间距");
    },
    readMobileShortcutDraft() {
      return {
        type: selectedMobileShortcutType(),
        label: String(elements.mobileShortcutLabelInput?.value || ""),
        action: String(elements.mobileShortcutActionSelect?.value || ""),
        text: String(elements.mobileShortcutTextInput?.value ?? ""),
        inputKey: String(elements.mobileShortcutKeySelect?.value || ""),
        customKey: String(elements.mobileShortcutCustomKeyInput?.value || ""),
        ctrl: elements.mobileShortcutCtrlInput?.checked === true,
        alt: elements.mobileShortcutAltInput?.checked === true,
        shift: elements.mobileShortcutShiftInput?.checked === true,
      };
    },
    readScrollback() {
      return readInteger(elements.scrollbackInput, MIN_TERMINAL_SCROLLBACK, MAX_TERMINAL_SCROLLBACK, "滚动历史行数");
    },
    renderDesktopShortcuts(shortcuts) {
      if (!elements.desktopShortcutList) return;
      elements.desktopShortcutList.textContent = "";
      shortcuts.forEach((shortcut, index) => {
        const item = documentObject.createElement("div");
        item.className = "settings-desktop-shortcut-item";
        item.dataset.shortcutIndex = String(index);
        item.dataset.shortcutId = shortcut.id;
        const main = documentObject.createElement("div");
        main.className = "settings-desktop-shortcut-main";
        const name = documentObject.createElement("div");
        name.className = "settings-desktop-shortcut-name";
        name.textContent = shortcut.label;
        const summary = documentObject.createElement("div");
        summary.className = "settings-desktop-shortcut-summary";
        summary.textContent = `${desktopShortcutActionLabels.get(shortcut.action) || shortcut.action} · ${displayShortcut(shortcut.shortcut, navigatorObject)}`;
        main.append(name, summary);
        const edit = documentObject.createElement("button");
        edit.type = "button";
        edit.className = "settings-desktop-shortcut-edit";
        edit.dataset.action = "edit";
        edit.textContent = "编辑";
        edit.setAttribute("aria-label", `编辑 ${shortcut.label}`);
        item.append(main, edit);
        elements.desktopShortcutList.appendChild(item);
      });
      if (shortcuts.length === 0) {
        const empty = documentObject.createElement("div");
        empty.className = "settings-desktop-shortcut-empty";
        empty.textContent = "暂无快捷键";
        elements.desktopShortcutList.appendChild(empty);
      }
    },
    renderFonts(fonts, activeFontID, { editMode = false, selectedIDs = new Set() } = {}) {
      if (!elements.fontCards) return;
      elements.fontCards.textContent = "";
      const defaultCard = documentObject.createElement("button");
      defaultCard.type = "button";
      defaultCard.className = "settings-font-card system";
      defaultCard.dataset.fontId = "";
      defaultCard.setAttribute("role", "option");
      defaultCard.setAttribute("aria-selected", activeFontID ? "false" : "true");
      defaultCard.setAttribute("aria-disabled", editMode ? "true" : "false");
      defaultCard.innerHTML = `<span class="settings-font-card-check" aria-hidden="true"></span><span class="settings-font-card-title">系统默认</span><span class="settings-font-card-meta">内置终端字体</span><span class="settings-font-card-state">${activeFontID ? "" : "当前使用"}</span>`;
      elements.fontCards.appendChild(defaultCard);
      for (const font of fonts) {
        const card = documentObject.createElement("button");
        card.type = "button";
        card.className = font.builtin ? "settings-font-card builtin" : "settings-font-card";
        card.dataset.fontId = font.id;
        card.dataset.builtin = font.builtin ? "true" : "false";
        card.setAttribute("role", "option");
        card.setAttribute("aria-selected", font.id === activeFontID ? "true" : "false");
        card.setAttribute("aria-pressed", selectedIDs.has(font.id) ? "true" : "false");
        const title = documentObject.createElement("span");
        title.className = "settings-font-card-title";
        title.textContent = font.label || font.filename || font.family;
        const meta = documentObject.createElement("span");
        meta.className = "settings-font-card-meta";
        meta.textContent = [font.builtin ? "预装字体" : font.filename, formatBytes(font.size)].filter(Boolean).join(" · ");
        const state = documentObject.createElement("span");
        state.className = "settings-font-card-state";
        state.textContent = font.id === activeFontID ? "当前使用" : "";
        const check = documentObject.createElement("span");
        check.className = "settings-font-card-check";
        check.setAttribute("aria-hidden", "true");
        card.append(check, title, meta, state);
        elements.fontCards.appendChild(card);
      }
      view.syncFontEditControls(fonts.length, editMode, selectedIDs.size);
    },
    renderMobileNav() {
      if (!elements.mobileNav) return;
      elements.mobileNav.textContent = "";
      for (const tab of elements.tabs) {
        const tabID = String(tab.dataset?.settingsTab || "").trim();
        if (!tabID) continue;
        const row = documentObject.createElement("div");
        row.className = "settings-mobile-nav-row";
        row.setAttribute("role", "listitem");
        const button = documentObject.createElement("button");
        button.className = "settings-mobile-nav-item";
        button.type = "button";
        button.dataset.settingsMobileNavTab = tabID;
        button.textContent = tabLabel(tabID);
        row.append(button);
        elements.mobileNav.append(row);
      }
    },
    renderMobileShortcuts(rows) {
      if (!elements.mobileShortcutList) return;
      elements.mobileShortcutList.textContent = "";
      const append = (shortcut, rowIndex, index) => {
        const item = documentObject.createElement("div");
        item.className = "settings-mobile-shortcut-item";
        item.dataset.rowIndex = String(rowIndex);
        item.dataset.shortcutIndex = String(index);
        item.dataset.shortcutId = shortcut.id;
        const drag = documentObject.createElement("button");
        drag.type = "button";
        drag.className = "settings-mobile-shortcut-drag";
        drag.textContent = "☰";
        drag.setAttribute("aria-label", "拖拽排序");
        drag.title = "拖拽排序";
        const main = documentObject.createElement("div");
        main.className = "settings-mobile-shortcut-main";
        const name = documentObject.createElement("div");
        name.className = "settings-mobile-shortcut-name";
        name.textContent = shortcut.label;
        const summary = documentObject.createElement("div");
        summary.className = "settings-mobile-shortcut-summary";
        summary.textContent = describeMobileShortcut(shortcut);
        main.append(name, summary);
        const edit = documentObject.createElement("button");
        edit.type = "button";
        edit.className = "settings-mobile-shortcut-edit";
        edit.dataset.action = "edit";
        edit.textContent = "编辑";
        edit.setAttribute("aria-label", `编辑 ${shortcut.label}`);
        item.append(drag, main, edit);
        elements.mobileShortcutList.appendChild(item);
      };
      (rows[0] || []).forEach((shortcut, index) => append(shortcut, 0, index));
      const divider = documentObject.createElement("div");
      divider.className = "settings-mobile-shortcut-divider";
      divider.dataset.mobileShortcutDivider = "true";
      const label = documentObject.createElement("span");
      label.textContent = "第二行";
      divider.appendChild(label);
      elements.mobileShortcutList.appendChild(divider);
      (rows[1] || []).forEach((shortcut, index) => append(shortcut, 1, index));
      if ((rows[0] || []).length === 0 && (rows[1] || []).length === 0) {
        const empty = documentObject.createElement("div");
        empty.className = "settings-mobile-shortcut-empty";
        empty.textContent = "暂无快捷键";
        elements.mobileShortcutList.appendChild(empty);
      }
    },
    resetFontInput() {
      if (elements.fontInput) elements.fontInput.value = "";
    },
    setActiveTab(tabID) {
      const requested = String(tabID || "terminal").trim() || "terminal";
      const next = elements.tabs.some((tab) => tab.dataset?.settingsTab === requested) ? requested : "terminal";
      for (const tab of elements.tabs) {
        const selected = tab.dataset?.settingsTab === next;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
      }
      for (const panel of elements.tabPanels) panel.hidden = panel.dataset?.settingsPanel !== next;
      return next;
    },
    setClientSettingsVisible(visible) {
      if (elements.clientMenuButton) elements.clientMenuButton.hidden = !visible;
    },
    setDesktopShortcutsScrolling(scrolling) {
      elements.desktopShortcutsPanel?.classList.toggle("is-scrolling", scrolling);
    },
    setFeedback(message, tone = "info") {
      if (!elements.feedback) return;
      const text = String(message || "").trim();
      elements.feedback.hidden = !text;
      elements.feedback.textContent = text;
      elements.feedback.dataset.tone = tone;
    },
    setFontUploadSaving(saving) {
      if (elements.fontInput) elements.fontInput.disabled = saving;
      if (elements.fontUploadButton) elements.fontUploadButton.disabled = saving;
    },
    setLineHeight(value) {
      if (elements.lineHeightInput) elements.lineHeightInput.value = String(value || DEFAULT_TERMINAL_LINE_HEIGHT_PERCENT);
    },
    setMobileShortcutsScrolling(scrolling) {
      elements.mobileShortcutsPanel?.classList.toggle("is-scrolling", scrolling);
    },
    setSaving(kind, saving) {
      const map = {
        lineHeight: [elements.lineHeightResetButton],
        scrollback: [elements.scrollbackResetButton],
        desktopMouseClipboard: [elements.desktopMouseClipboardToggle],
        desktopShortcutsBar: [elements.desktopShortcutsBarToggle],
        restartWorkspaceRestore: [elements.restartWorkspaceRestoreToggle],
        mobilePixelScroll: [elements.mobilePixelScrollToggle],
        mobileDoubleTapReminder: [elements.mobileDoubleTapReminderToggle],
        mobileShortcuts: [elements.mobileShortcutAddButton, elements.mobileShortcutResetButton, ...Array.from(elements.mobileShortcutList?.querySelectorAll?.("button") || [])],
        desktopShortcuts: [elements.desktopShortcutAddButton, elements.desktopShortcutResetButton, ...Array.from(elements.desktopShortcutList?.querySelectorAll?.("button") || [])],
      };
      for (const item of map[kind] || []) if (item) item.disabled = saving;
    },
    setScrollback(value) {
      if (elements.scrollbackInput) elements.scrollbackInput.value = String(value || DEFAULT_TERMINAL_SCROLLBACK);
    },
    stepNumberInput(event) {
      const button = closest(event, "[data-number-step]");
      const targetID = String(button?.dataset?.numberTarget || "").trim();
      const input = targetID ? byID(targetID) : null;
      if (!button || !input || input.disabled) return false;
      try {
        if (button.dataset.numberStep === "down") input.stepDown();
        else input.stepUp();
      } catch (error) {
        const min = Number(input.min);
        input.value = Number.isFinite(min) ? String(min) : "0";
      }
      const EventCtor = documentObject?.defaultView?.Event || globalThis.Event;
      input.dispatchEvent?.(new EventCtor("input", { bubbles: true }));
      input.dispatchEvent?.(new EventCtor("change", { bubbles: true }));
      input.focus?.({ preventScroll: true });
      return true;
    },
    syncDesktopShortcutCapture() {
      if (elements.desktopShortcutCaptureInput) {
        elements.desktopShortcutCaptureInput.value = displayShortcut(desktopShortcutFromControls(), navigatorObject);
      }
    },
    syncFontEditControls(fontCount, editMode, selectedCount) {
      if (elements.fontEditButton) {
        elements.fontEditButton.disabled = !editMode && fontCount === 0;
        elements.fontEditButton.classList.toggle("settings-icon-button", !editMode);
        elements.fontEditButton.classList.toggle("settings-text-button", editMode);
        elements.fontEditButton.setAttribute("aria-pressed", editMode ? "true" : "false");
        elements.fontEditButton.setAttribute("aria-label", editMode ? "完成编辑" : "编辑字体");
        elements.fontEditButton.title = editMode ? "完成编辑" : "编辑字体";
        elements.fontEditButton.innerHTML = editMode ? "完成" : fontEditButtonHTML;
      }
      if (elements.fontUploadButton) elements.fontUploadButton.hidden = editMode;
      if (elements.fontDeleteSelectedButton) {
        elements.fontDeleteSelectedButton.hidden = !editMode;
        elements.fontDeleteSelectedButton.disabled = selectedCount === 0;
        elements.fontDeleteSelectedButton.textContent = selectedCount > 0 ? `删除 ${selectedCount}` : "删除";
      }
      elements.fontCards?.classList.toggle("is-editing", editMode);
    },
    syncMobileNavigation({ isMobile, mobileView }) {
      const displayView = isMobile ? mobileView : "detail";
      const active = activeTabID();
      if (elements.panel) elements.panel.dataset.mobileSettingsView = displayView;
      if (elements.mobileNav) {
        elements.mobileNav.hidden = !isMobile || displayView !== "index";
        for (const item of elements.mobileNav.querySelectorAll("[data-settings-mobile-nav-tab]")) {
          item.setAttribute("aria-current", item.dataset.settingsMobileNavTab === active ? "page" : "false");
        }
      }
      if (elements.title) elements.title.textContent = isMobile && displayView === "detail" ? tabLabel(active) : "设置";
      if (elements.back) {
        const label = isMobile && displayView === "detail" ? "返回设置列表" : "返回";
        elements.back.setAttribute("aria-label", label);
        elements.back.title = label;
      }
    },
    syncMobileShortcutEditorFields() {
      const type = selectedMobileShortcutType();
      const isInput = type === "input";
      if (elements.mobileShortcutKeyField) elements.mobileShortcutKeyField.hidden = !isInput;
      if (elements.mobileShortcutActionField) elements.mobileShortcutActionField.hidden = type !== "action";
      if (elements.mobileShortcutTextField) elements.mobileShortcutTextField.hidden = type !== "text";
      if (elements.mobileShortcutModifiersField) elements.mobileShortcutModifiersField.hidden = !isInput;
      if (elements.mobileShortcutCustomKeyField) elements.mobileShortcutCustomKeyField.hidden = !isInput || elements.mobileShortcutKeySelect?.value !== "custom";
    },
    syncToggles(snapshot, { debugMode = false } = {}) {
      if (elements.mobileRemoteDesktopToggle) elements.mobileRemoteDesktopToggle.checked = snapshot.mobileRemoteDesktopEnabled;
      if (elements.forcePCModeToggle) {
        elements.forcePCModeToggle.checked = snapshot.forcePCModeEnabled;
        elements.forcePCModeToggle.disabled = !debugMode;
      }
      if (elements.desktopMouseClipboardToggle) elements.desktopMouseClipboardToggle.checked = snapshot.desktopMouseClipboardEnabled;
      if (elements.desktopShortcutsBarToggle) elements.desktopShortcutsBarToggle.checked = snapshot.desktopShortcutsBarEnabled;
      if (elements.restartWorkspaceRestoreToggle) elements.restartWorkspaceRestoreToggle.checked = snapshot.restartWorkspaceRestoreEnabled;
      if (elements.mobilePixelScrollToggle) elements.mobilePixelScrollToggle.checked = snapshot.mobilePixelScrollEnabled;
      if (elements.mobileDoubleTapReminderToggle) elements.mobileDoubleTapReminderToggle.checked = snapshot.mobileDoubleTapReminderEnabled;
      documentObject?.body?.classList.toggle("desktop-shortcuts-bar-enabled", snapshot.desktopShortcutsBarEnabled);
    },
    toggleValue(name) {
      const map = {
        mobileRemoteDesktop: elements.mobileRemoteDesktopToggle,
        forcePCMode: elements.forcePCModeToggle,
        desktopMouseClipboard: elements.desktopMouseClipboardToggle,
        desktopShortcutsBar: elements.desktopShortcutsBarToggle,
        restartWorkspaceRestore: elements.restartWorkspaceRestoreToggle,
        mobilePixelScroll: elements.mobilePixelScrollToggle,
        mobileDoubleTapReminder: elements.mobileDoubleTapReminderToggle,
      };
      return map[name]?.checked === true;
    },
    updateDesktopShortcutCaptureFromEvent(event) {
      const key = shortcutKeyFromEventCode(event) || normalizeShortcutKeyToken(event?.key);
      if (!key || ["ctrl", "shift", "alt", "super"].includes(key)) return false;
      if (elements.desktopShortcutCtrlInput) elements.desktopShortcutCtrlInput.checked = event.ctrlKey;
      if (elements.desktopShortcutAltInput) elements.desktopShortcutAltInput.checked = event.altKey;
      if (elements.desktopShortcutShiftInput) elements.desktopShortcutShiftInput.checked = event.shiftKey;
      if (elements.desktopShortcutCommandInput) elements.desktopShortcutCommandInput.checked = event.metaKey;
      if (elements.desktopShortcutKeySelect) {
        elements.desktopShortcutKeySelect.value = key;
        if (elements.desktopShortcutKeySelect.value !== key) elements.desktopShortcutKeySelect.value = "tab";
      }
      view.syncDesktopShortcutCapture();
      return true;
    },
    updateMobileShortcutDrag(state, event) {
      if (!state || !elements.mobileShortcutList) return;
      state.item.style.left = `${event.clientX - state.offsetX}px`;
      state.item.style.top = `${event.clientY - state.offsetY}px`;
      const listRect = elements.mobileShortcutList.getBoundingClientRect();
      const children = Array.from(elements.mobileShortcutList.children)
        .filter((child) => child !== state.placeholder && !child.classList.contains("settings-mobile-shortcut-empty"));
      if (event.clientY <= listRect.top) {
        elements.mobileShortcutList.insertBefore(state.placeholder, children[0] || null);
        return;
      }
      for (const child of children) {
        const rect = child.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          elements.mobileShortcutList.insertBefore(state.placeholder, child);
          return;
        }
      }
      elements.mobileShortcutList.appendChild(state.placeholder);
    },
  };

  return view;
}
