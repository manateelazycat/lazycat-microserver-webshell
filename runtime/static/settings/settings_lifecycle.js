export function createSettingsLifecycle({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  elements = {},
  handlers = {},
} = {}) {
  const listeners = [];
  let started = false;
  let disposed = false;

  const listen = (target, type, listener, options) => {
    if (!target?.addEventListener || typeof listener !== "function") return () => {};
    target.addEventListener(type, listener, options);
    const entry = [target, type, listener, options];
    listeners.push(entry);
    return () => {
      const index = listeners.indexOf(entry);
      if (index >= 0) listeners.splice(index, 1);
      target.removeEventListener?.(type, listener, options);
    };
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [target, type, listener, options] of listeners.splice(0)) {
        target.removeEventListener?.(type, listener, options);
      }
    },
    listenTransient: listen,
    start() {
      if (started || disposed) return;
      started = true;
      listen(elements.menuButton, "click", handlers.onOpen);
      listen(elements.clientMenuButton, "click", handlers.onOpenClientSettings);
      listen(elements.mobileShortcutsPanel, "scroll", handlers.onMobileShortcutsScroll, { passive: true });
      listen(elements.desktopShortcutsPanel, "scroll", handlers.onDesktopShortcutsScroll, { passive: true });
      listen(elements.back, "click", handlers.onBack);
      listen(elements.close, "click", handlers.onClose);
      listen(elements.backdrop, "click", handlers.onBackdropClick);
      listen(elements.mobileNav, "click", handlers.onMobileNavClick);
      for (const tab of elements.tabs || []) {
        listen(tab, "click", (event) => handlers.onTabClick?.(event, tab));
        listen(tab, "keydown", (event) => handlers.onTabKeydown?.(event, tab));
      }
      listen(elements.panel, "click", handlers.onPanelClick);
      listen(elements.fontCards, "click", handlers.onFontCardClick);
      listen(elements.fontEditButton, "click", handlers.onFontEditClick);
      listen(elements.fontDeleteSelectedButton, "click", handlers.onFontDeleteSelectedClick);
      listen(elements.fontUploadButton, "click", handlers.onFontUploadClick);
      listen(elements.fontInput, "change", handlers.onFontInputChange);
      listen(elements.lineHeightInput, "input", handlers.onLineHeightInput);
      listen(elements.lineHeightInput, "change", handlers.onLineHeightChange);
      listen(elements.lineHeightResetButton, "click", handlers.onLineHeightReset);
      listen(elements.scrollbackInput, "input", handlers.onScrollbackInput);
      listen(elements.scrollbackInput, "change", handlers.onScrollbackChange);
      listen(elements.scrollbackResetButton, "click", handlers.onScrollbackReset);
      listen(elements.desktopMouseClipboardToggle, "change", handlers.onDesktopMouseClipboardChange);
      listen(elements.desktopShortcutsBarToggle, "change", handlers.onDesktopShortcutsBarChange);
      listen(elements.restartWorkspaceRestoreToggle, "change", handlers.onRestartWorkspaceRestoreChange);
      listen(elements.mobileRemoteDesktopToggle, "change", handlers.onMobileRemoteDesktopChange);
      listen(elements.forcePCModeToggle, "change", handlers.onForcePCModeChange);
      listen(elements.mobilePixelScrollToggle, "change", handlers.onMobilePixelScrollChange);
      listen(elements.mobileDoubleTapReminderToggle, "change", handlers.onMobileDoubleTapReminderChange);
      listen(elements.mobileShortcutAddButton, "click", handlers.onMobileShortcutAdd);
      listen(elements.mobileShortcutResetButton, "click", handlers.onMobileShortcutReset);
      listen(elements.mobileShortcutList, "click", handlers.onMobileShortcutListClick);
      listen(elements.mobileShortcutList, "pointerdown", handlers.onMobileShortcutPointerDown);
      listen(elements.desktopShortcutAddButton, "click", handlers.onDesktopShortcutAdd);
      listen(elements.desktopShortcutResetButton, "click", handlers.onDesktopShortcutReset);
      listen(elements.desktopShortcutList, "click", handlers.onDesktopShortcutListClick);
      listen(elements.mobileShortcutEditorPanel, "submit", handlers.onMobileShortcutSubmit);
      listen(elements.mobileShortcutEditorCancel, "click", handlers.onMobileShortcutCancel);
      listen(elements.mobileShortcutEditorDelete, "click", handlers.onMobileShortcutDelete);
      listen(elements.mobileShortcutEditorScrim, "click", handlers.onMobileShortcutCancel);
      for (const input of elements.mobileShortcutTypeInputs || []) {
        listen(input, "change", handlers.onMobileShortcutFieldsChange);
      }
      listen(elements.mobileShortcutKeySelect, "change", handlers.onMobileShortcutFieldsChange);
      listen(elements.desktopShortcutEditorPanel, "submit", handlers.onDesktopShortcutSubmit);
      listen(elements.desktopShortcutEditorCancel, "click", handlers.onDesktopShortcutCancel);
      listen(elements.desktopShortcutEditorScrim, "click", handlers.onDesktopShortcutCancel);
      listen(elements.desktopShortcutEditorDelete, "click", handlers.onDesktopShortcutDelete);
      for (const input of [
        elements.desktopShortcutCtrlInput,
        elements.desktopShortcutAltInput,
        elements.desktopShortcutShiftInput,
        elements.desktopShortcutCommandInput,
      ]) {
        listen(input, "change", handlers.onDesktopShortcutFieldsChange);
      }
      listen(elements.desktopShortcutKeySelect, "change", handlers.onDesktopShortcutFieldsChange);
      listen(elements.desktopShortcutCaptureInput, "keydown", handlers.onDesktopShortcutCaptureKeydown);
      listen(windowObject, "resize", handlers.onResize);
      listen(windowObject, "pagehide", handlers.onPageHide);
      listen(documentObject, "keydown", handlers.onDocumentKeydown, true);
    },
  };
}
