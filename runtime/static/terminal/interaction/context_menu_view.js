const mobileActionIconNames = Object.freeze({
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
});

export function createTerminalContextMenuView({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
} = {}) {
  const desktopMenu = documentObject?.getElementById?.("contextMenu") || null;
  const mobileSheet = documentObject?.getElementById?.("mobileActionSheet") || null;
  const mobileScrim = documentObject?.getElementById?.("mobileActionSheetScrim") || null;
  const mobileHandle = documentObject?.getElementById?.("mobileActionSheetHandle") || null;
  const mobileGrid = documentObject?.getElementById?.("mobileActionGrid") || null;
  const mobileShortcuts = documentObject?.getElementById?.("mobileShortcuts") || null;

  const actionDefinitions = () => Array.from(desktopMenu?.querySelectorAll?.(".context-menu-btn") || [])
    .map((button) => ({
      action: String(button.dataset?.action || "").trim(),
      label: String(button.textContent || "").trim(),
      danger: button.classList?.contains?.("danger") === true,
    }))
    .filter((item) => item.action && item.label);

  const updateDesktopGroups = () => {
    let hasVisibleGroup = false;
    for (const group of desktopMenu?.querySelectorAll?.(".context-menu-group") || []) {
      const hasVisibleItem = Array.from(group.querySelectorAll?.(".context-menu-btn") || [])
        .some((item) => !item.hidden);
      group.hidden = !hasVisibleItem;
      group.classList?.toggle?.("with-divider", hasVisibleGroup && hasVisibleItem);
      hasVisibleGroup = hasVisibleGroup || hasVisibleItem;
    }
  };

  const closeDesktop = () => {
    if (desktopMenu) {
      desktopMenu.hidden = true;
    }
  };

  const closeMobile = () => {
    if (mobileSheet) {
      mobileSheet.hidden = true;
    }
    documentObject?.body?.classList?.remove?.("mobile-action-sheet-open");
    mobileShortcuts?.removeAttribute?.("aria-hidden");
    for (const button of mobileShortcuts?.querySelectorAll?.('[data-mobile-action="open_mobile_menu"]') || []) {
      button.setAttribute?.("aria-expanded", "false");
    }
  };

  return Object.freeze({
    actionDefinitions,
    canOpenMobile() {
      return Boolean(mobileSheet && mobileGrid);
    },
    closeDesktop,
    closeMobile,
    containsDesktopTarget(target) {
      return Boolean(desktopMenu?.contains?.(target));
    },
    desktopActionFromTarget(target) {
      const item = target?.closest?.(".context-menu-btn") || null;
      return item && desktopMenu?.contains?.(item) ? String(item.dataset?.action || "") : "";
    },
    dispose() {
      closeDesktop();
      closeMobile();
      if (mobileGrid) {
        mobileGrid.textContent = "";
      }
    },
    elements: Object.freeze({
      desktopMenu,
      mobileGrid,
      mobileHandle,
      mobileScrim,
    }),
    isDesktopOpen() {
      return Boolean(desktopMenu && !desktopMenu.hidden);
    },
    isMobileOpen() {
      return Boolean(mobileSheet && !mobileSheet.hidden);
    },
    mobileActionFromTarget(target) {
      const item = target?.closest?.(".mobile-action-item") || null;
      if (!item || !mobileGrid?.contains?.(item) || item.disabled) {
        return "";
      }
      return String(item.dataset?.action || "");
    },
    openMobile() {
      if (!mobileSheet) {
        return;
      }
      mobileSheet.hidden = false;
      documentObject?.body?.classList?.add?.("mobile-action-sheet-open");
      mobileShortcuts?.setAttribute?.("aria-hidden", "true");
      for (const button of mobileShortcuts?.querySelectorAll?.('[data-mobile-action="open_mobile_menu"]') || []) {
        button.setAttribute?.("aria-expanded", "true");
      }
    },
    renderDesktop({ x, y, target, isActionVisible, shortcutForAction = () => "" }) {
      if (!desktopMenu) {
        return false;
      }
      desktopMenu.hidden = false;
      desktopMenu.dataset.type = String(target?.type || "");
      for (const item of desktopMenu.querySelectorAll?.(".context-menu-btn") || []) {
        const action = String(item.dataset?.action || "");
        item.hidden = !isActionVisible(action);
        item.dataset.shortcutHint = shortcutForAction(action);
      }
      updateDesktopGroups();
      const rect = desktopMenu.getBoundingClientRect?.() || { width: 0, height: 0 };
      const left = Math.min(Number(x) || 0, Number(windowObject?.innerWidth || 0) - rect.width - 8);
      const top = Math.min(Number(y) || 0, Number(windowObject?.innerHeight || 0) - rect.height - 8);
      desktopMenu.style.left = `${Math.max(8, left)}px`;
      desktopMenu.style.top = `${Math.max(8, top)}px`;
      return true;
    },
    renderMobile({ isActionEnabled, createIcon }) {
      if (!mobileGrid) {
        return false;
      }
      mobileGrid.textContent = "";
      const fragment = documentObject?.createDocumentFragment?.();
      const host = fragment || mobileGrid;
      for (const item of actionDefinitions()) {
        const button = documentObject.createElement("button");
        button.type = "button";
        button.className = "mobile-action-item";
        button.dataset.action = item.action;
        button.disabled = !isActionEnabled(item.action);
        button.setAttribute("role", "menuitem");
        button.setAttribute("aria-label", item.label);
        if (item.danger) {
          button.classList.add("danger");
        }

        const icon = documentObject.createElement("span");
        icon.className = "mobile-action-icon";
        const iconElement = createIcon?.(mobileActionIconNames[item.action] || "default");
        if (iconElement) {
          icon.appendChild(iconElement);
        }

        const label = documentObject.createElement("span");
        label.className = "mobile-action-label";
        label.textContent = item.label;
        button.append(icon, label);
        host.appendChild(button);
      }
      if (fragment) {
        mobileGrid.appendChild(fragment);
      }
      return true;
    },
  });
}
