/**
 * Owns the application's confirm/prompt dialogs and the mobile close sheet.
 * The controller resolves user intent only; callers own the operation being
 * confirmed and the terminal/workspace state affected by that operation.
 */
export function createDialogController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  dialog = {},
  mobileSheet = {},
  isMobileLayout = () => false,
  closeMobileActionSheet = () => {},
  focusActiveTerminal = () => {},
} = {}) {
  let dialogResolve = null;
  let mobileResolve = null;
  let disposed = false;
  let focusTimer = 0;
  const listeners = [];

  const listen = (target, type, handler, options) => {
    if (!target?.addEventListener || typeof handler !== "function") {
      return;
    }
    target.addEventListener(type, handler, options);
    listeners.push([target, type, handler, options]);
  };

  const clearFocusTimer = () => {
    if (!focusTimer) {
      return;
    }
    windowObject?.clearTimeout?.(focusTimer);
    focusTimer = 0;
  };

  const scheduleFocus = () => {
    clearFocusTimer();
    focusTimer = windowObject?.setTimeout?.(() => {
      focusTimer = 0;
      if (!disposed) {
        focusActiveTerminal();
      }
    }, 0) || 0;
  };

  const resolveDialog = (value) => {
    const resolve = dialogResolve;
    dialogResolve = null;
    if (dialog.backdrop) {
      dialog.backdrop.hidden = true;
      dialog.backdrop.dataset.mode = "";
      dialog.backdrop.dataset.danger = "false";
    }
    resolve?.(value);
    if (resolve) {
      scheduleFocus();
    }
    return Boolean(resolve);
  };

  const openDialog = ({
    mode = "confirm",
    title = "Confirm",
    message = "",
    value = "",
    okText = "OK",
    cancelText = "取消",
    danger = false,
    initialFocus = "cancel",
  } = {}) => new Promise((resolve) => {
    if (disposed) {
      resolve(mode === "prompt" ? null : false);
      return;
    }
    if (
      !dialog.backdrop
      || !dialog.title
      || !dialog.message
      || !dialog.input
      || !dialog.ok
      || !dialog.cancel
    ) {
      const fallback = mode === "prompt"
        ? windowObject?.prompt?.(title, value)
        : windowObject?.confirm?.(message || title);
      resolve(fallback);
      return;
    }
    if (dialogResolve) {
      resolveDialog(mode === "prompt" ? null : false);
    }
    dialogResolve = resolve;
    dialog.backdrop.hidden = false;
    dialog.backdrop.dataset.mode = mode;
    dialog.backdrop.dataset.danger = danger ? "true" : "false";
    dialog.title.textContent = title;
    dialog.message.textContent = message;
    dialog.input.hidden = mode !== "prompt";
    dialog.input.value = value || "";
    dialog.ok.textContent = okText;
    dialog.cancel.textContent = cancelText;
    windowObject?.setTimeout?.(() => {
      if (disposed || !dialogResolve) {
        return;
      }
      if (mode === "prompt") {
        dialog.input.focus?.();
        dialog.input.select?.();
      } else if (initialFocus === "ok") {
        dialog.ok.focus?.();
      } else {
        dialog.cancel.focus?.();
      }
    }, 0);
  });

  const confirmDialog = async (message, options = {}) => {
    const result = await openDialog({
      mode: "confirm",
      message,
      title: options.title || "Confirm",
      okText: options.okText || "Confirm",
      cancelText: options.cancelText || "取消",
      danger: Boolean(options.danger),
      initialFocus: options.initialFocus,
    });
    return result === true;
  };

  const resolveMobile = (value = false) => {
    const resolve = mobileResolve;
    mobileResolve = null;
    if (mobileSheet.container) {
      mobileSheet.container.hidden = true;
    }
    resolve?.(value);
    if (resolve) {
      scheduleFocus();
    }
    return Boolean(resolve);
  };

  const confirmMobileSheet = ({
    title = "确认操作？",
    message = "",
    okText = "确认",
    cancelText = "取消",
    actionsLayout = "horizontal",
    initialFocus = "cancel",
  } = {}) => new Promise((resolve) => {
    if (disposed) {
      resolve(false);
      return;
    }
    if (
      !mobileSheet.container
      || !mobileSheet.title
      || !mobileSheet.message
      || !mobileSheet.actions
      || !mobileSheet.ok
      || !mobileSheet.cancel
    ) {
      resolve(windowObject?.confirm?.(message || title) === true);
      return;
    }
    if (mobileResolve) {
      resolveMobile(false);
    }
    closeMobileActionSheet();
    mobileResolve = resolve;
    mobileSheet.title.textContent = title;
    mobileSheet.message.textContent = message;
    mobileSheet.ok.textContent = okText;
    mobileSheet.cancel.textContent = cancelText;
    mobileSheet.actions.dataset.layout = actionsLayout === "vertical-ok-first"
      ? "vertical-ok-first"
      : "horizontal";
    mobileSheet.container.hidden = false;
    windowObject?.setTimeout?.(() => {
      if (!disposed && mobileResolve) {
        (initialFocus === "ok" ? mobileSheet.ok : mobileSheet.cancel)?.focus?.();
      }
    }, 0);
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
    return confirmDialog(message, { ...options, initialFocus: "ok" });
  };

  const promptDialog = async (title, value) => {
    const result = await openDialog({
      mode: "prompt",
      title,
      value,
      okText: "保存",
      cancelText: "取消",
    });
    return result === null ? null : String(result || "").trim();
  };

  const handleEscape = (event) => {
    if (disposed || event?.key !== "Escape") {
      return false;
    }
    if (dialogResolve) {
      event.preventDefault?.();
      resolveDialog(dialog.backdrop?.dataset.mode === "prompt" ? null : false);
      return true;
    }
    if (mobileResolve) {
      event.preventDefault?.();
      resolveMobile(false);
      return true;
    }
    return false;
  };

  const install = () => {
    if (disposed) {
      return false;
    }
    listen(dialog.panel, "submit", (event) => {
      event.preventDefault?.();
      if (dialog.backdrop?.dataset.mode === "prompt") {
        resolveDialog(dialog.input?.value || "");
      } else {
        resolveDialog(true);
      }
    });
    listen(dialog.cancel, "click", () => resolveDialog(dialog.backdrop?.dataset.mode === "prompt" ? null : false));
    listen(dialog.backdrop, "click", (event) => {
      if (event.target === dialog.backdrop) {
        resolveDialog(dialog.backdrop.dataset.mode === "prompt" ? null : false);
      }
    });
    listen(mobileSheet.scrim, "click", () => resolveMobile(false));
    listen(mobileSheet.handle, "click", () => resolveMobile(false));
    listen(mobileSheet.cancel, "click", () => resolveMobile(false));
    listen(mobileSheet.ok, "click", () => resolveMobile(true));
    return true;
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    clearFocusTimer();
    resolveDialog(false);
    resolveMobile(false);
    for (const [target, type, handler, options] of listeners.splice(0)) {
      target.removeEventListener?.(type, handler, options);
    }
    return true;
  };

  return Object.freeze({
    closeDialog: resolveDialog,
    closeMobileCloseConfirm: resolveMobile,
    confirmCloseRunningCommand,
    confirmDialog,
    confirmMobileClose,
    confirmMobileSheet,
    dispose,
    handleEscape,
    install,
    isDialogOpen: () => Boolean(dialogResolve),
    isMobileConfirmOpen: () => Boolean(mobileResolve),
    isOpen: () => Boolean(dialogResolve || mobileResolve),
    openDialog,
    promptDialog,
  });
}
