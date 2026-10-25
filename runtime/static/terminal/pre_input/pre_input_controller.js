import { createPreInputView } from "./pre_input_view.js";

// The host supplies settings, target identity, upload and input capabilities.
// Draft editing never calls the terminal input path.
export function createPreInputController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  host,
  isEnabled = () => false,
  isMobileLayout = () => false,
  getContext = () => ({ session: null, targetName: "" }),
  uploadFile,
  validateFiles = () => ({ error: "" }),
  formatPaths = (paths) => paths.join(" "),
  sendText = () => false,
  registerSessionCleanup = () => {},
  onHeightChange = () => {},
  onKeyboardFocusChange = () => {},
  translate = (text) => text,
} = {}) {
  const view = createPreInputView({ documentObject, host, translate });
  const drafts = new Map();
  const emptyDraft = { text: "", entries: [], status: "", error: false };
  const listeners = [];
  let context = { session: null, targetName: "" };
  let draft = emptyDraft;
  let visible = false;
  let toolbarOpen = false;
  let composing = false;
  let disposed = false;
  let operation = null;
  let pickerContext = null;
  let sequence = 0;
  let measuredHeight = 0;
  let frame = 0;

  const listen = (target, type, callback) => {
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  };
  const releaseEntry = (entry) => {
    if (entry.preview) windowObject.URL.revokeObjectURL(entry.preview);
  };
  const measureHeight = () => {
    frame = 0;
    if (disposed || !visible) return;
    const height = Math.ceil(host.getBoundingClientRect().height);
    // Modal sheets can temporarily hide the entire dock.
    if (height > 0 && measuredHeight !== height) {
      measuredHeight = height;
      documentObject.documentElement.style.setProperty("--mobile-shortcuts-total-height", `${height}px`);
      onHeightChange();
    }
  };
  const scheduleMeasure = () => {
    if (!disposed && !frame) frame = windowObject.requestAnimationFrame(measureHeight);
  };
  const render = () => {
    if (disposed) return;
    view.render({
      visible, draft, busy: operation?.draft === draft, toolbarOpen,
      available: Boolean(context.session && !context.session.closed && !context.session.exitExpected),
    });
    scheduleMeasure();
  };
  const cancel = (message) => {
    if (!operation) return;
    const previous = operation;
    operation = null;
    previous.cancelled = true;
    previous.upload?.xhr?.abort();
    previous.draft.status = translate(message);
    previous.draft.error = true;
  };
  const syncContext = () => {
    if (disposed) return;
    const next = getContext();
    const changed = context.session !== next.session || context.targetName !== next.targetName;
    const nextVisible = isEnabled() && isMobileLayout();
    if (changed || !nextVisible) {
      cancel("发送已暂停，返回原终端后可重试。");
      toolbarOpen = false;
      composing = false;
    }
    if (changed) {
      if (view.root.contains(documentObject.activeElement)) documentObject.activeElement.blur();
      context = { ...next };
      draft = drafts.get(context.session) || emptyDraft;
    }
    const wasVisible = visible;
    visible = nextVisible;
    if (!visible && wasVisible) {
      measuredHeight = 0;
      documentObject.documentElement.style.removeProperty("--mobile-shortcuts-total-height");
      onHeightChange();
    }
    if (changed || wasVisible !== visible) render();
  };
  const editableDraft = () => {
    syncContext();
    if (!visible || !context.session || context.session.closed || context.session.exitExpected || !context.targetName) return null;
    if (draft === emptyDraft) {
      const session = context.session;
      draft = { text: "", entries: [], status: "", error: false };
      drafts.set(session, draft);
      registerSessionCleanup(session, () => {
        const saved = drafts.get(session);
        if (operation?.draft === saved) cancel("终端已关闭，发送已停止。");
        saved?.entries.forEach(releaseEntry);
        drafts.delete(session);
        if (context.session === session) {
          draft = emptyDraft;
          render();
        }
      });
    }
    return draft;
  };
  const addFiles = (files) => {
    const current = editableDraft();
    if (!current || operation) return;
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const validation = validateFiles([...current.entries.map((entry) => entry.file), ...selected]);
    if (validation.error) {
      current.status = validation.error === "too_many" ? translate("一次最多选择 32 个附件。")
        : validation.error === "too_large" ? `${translate("文件超过 2GB")}：${validation.oversized?.name || translate("附件")}`
          : translate("请选择有效的附件。");
      current.error = true;
      render();
      return;
    }
    for (const file of selected) {
      let preview = "";
      if (file.type.startsWith("image/")) {
        try { preview = windowObject.URL.createObjectURL(file); } catch { /* Filename remains available. */ }
      }
      current.entries.push({ id: String(++sequence), file, preview, path: "" });
    }
    current.status = "";
    current.error = false;
    toolbarOpen = false;
    render();
  };
  const isCurrent = (pending) => {
    const live = getContext();
    return !disposed && !pending.cancelled && operation === pending
      && isEnabled() && isMobileLayout() && !pending.session.closed && !pending.session.exitExpected
      && live.session === pending.session && live.targetName === pending.targetName;
  };
  const submit = async () => {
    if (composing) return;
    const current = editableDraft();
    if (!current || operation || (!current.text.length && !current.entries.length)) return;
    const pending = { ...context, draft: current, upload: null, cancelled: false };
    operation = pending;
    toolbarOpen = false;
    current.error = false;
    try {
      render();
      for (let index = 0; index < current.entries.length; index += 1) {
        if (!isCurrent(pending)) throw new Error(translate("终端已切换，草稿未发送。"));
        const entry = current.entries[index];
        if (entry.path) continue;
        const label = `${translate("正在上传")} ${index + 1}/${current.entries.length} · ${entry.file.name}`;
        current.status = label;
        render();
        pending.upload = uploadFile({
          targetName: pending.targetName,
          file: entry.file,
          onProgress: ({ loaded, total, lengthComputable }) => {
            if (!isCurrent(pending)) return;
            current.status = lengthComputable && total > 0
              ? `${label} · ${Math.min(100, Math.round(loaded / total * 100))}%` : label;
            render();
          },
        });
        const payload = await pending.upload.promise;
        const path = payload?.files?.[0]?.path;
        if (payload?.files?.length !== 1 || typeof path !== "string" || !path.trim() || /[\r\n\x00-\x1f\x7f]/.test(path)) {
          throw new Error(translate("上传未返回有效文件路径，请重试。"));
        }
        entry.path = path;
        pending.upload = null;
      }
      if (!isCurrent(pending)) throw new Error(translate("终端已切换，草稿未发送。"));
      const paths = formatPaths(current.entries.map((entry) => entry.path));
      const content = paths ? `${paths}${current.text ? ` ${current.text}` : ""}` : current.text;
      // sendText reports acceptance by the actual terminal input queue.
      if (sendText(pending.session, content) !== true) {
        throw new Error(translate("终端暂时无法接收，请重试。"));
      }
      current.entries.forEach(releaseEntry);
      current.entries = [];
      current.text = "";
      current.status = "";
      current.error = false;
    } catch (error) {
      if (!disposed && !pending.cancelled) {
        current.status = translate(error?.message || "发送失败，请重试。");
        current.error = true;
      }
    } finally {
      if (operation === pending) operation = null;
      render();
    }
  };

  listen(view.text, "input", () => {
    // Capture the browser value before a context sync renders the saved draft.
    const value = view.text.value;
    const current = editableDraft();
    if (!current || operation) return;
    current.text = value;
    current.status = "";
    current.error = false;
    render();
  });
  listen(view.text, "compositionstart", () => { composing = true; });
  listen(view.text, "compositionend", () => { composing = false; });
  listen(view.text, "keydown", (event) => {
    if (event.key !== "Escape") event.stopPropagation();
  });
  listen(view.text, "focus", () => {
    toolbarOpen = false;
    render();
    onKeyboardFocusChange(true);
  });
  listen(view.text, "blur", () => { onKeyboardFocusChange(false); });
  listen(view.tools, "pointerdown", (event) => { event.preventDefault(); });
  listen(view.send, "pointerdown", (event) => { event.preventDefault(); });
  listen(view.tools, "click", () => {
    syncContext();
    if (!visible || operation) return;
    toolbarOpen = !toolbarOpen;
    render();
  });
  listen(view.send, "click", submit);
  listen(view.root, "click", (event) => {
    const id = event.target.closest?.("[data-remove-attachment]")?.dataset.removeAttachment;
    if (!id || operation) return;
    const current = editableDraft();
    if (!current) return;
    const entry = current.entries.find((item) => item.id === id);
    if (entry) releaseEntry(entry);
    current.entries = current.entries.filter((item) => item !== entry);
    current.status = "";
    current.error = false;
    render();
  });
  for (const [button, input] of [[view.album, view.albumInput], [view.file, view.fileInput]]) {
    listen(button, "click", () => {
      if (!editableDraft() || operation) return;
      pickerContext = { ...context };
      input.value = "";
      input.click();
    });
    listen(input, "change", () => {
      syncContext();
      if (pickerContext?.session === context.session && pickerContext?.targetName === context.targetName) addFiles(input.files);
      pickerContext = null;
      input.value = "";
    });
  }
  listen(documentObject, "pointerdown", (event) => {
    if (toolbarOpen && !view.root.contains(event.target)) {
      toolbarOpen = false;
      render();
    }
  });
  listen(view.root, "keydown", (event) => {
    if (event.key === "Escape" && toolbarOpen) {
      event.preventDefault();
      toolbarOpen = false;
      render();
      view.tools.focus();
    }
  });
  listen(windowObject, "resize", () => {
    syncContext();
    view.resizeText();
    scheduleMeasure();
  });
  const observer = new windowObject.ResizeObserver(scheduleMeasure);
  observer.observe(host);

  return Object.freeze({
    syncContext,
    isInputFocused: () => !disposed && visible && documentObject.activeElement === view.text,
    dispose() {
      if (disposed) return;
      cancel("发送已取消。");
      disposed = true;
      listeners.forEach((remove) => remove());
      observer.disconnect();
      if (frame) windowObject.cancelAnimationFrame(frame);
      for (const saved of drafts.values()) saved.entries.forEach(releaseEntry);
      drafts.clear();
      view.dispose();
      documentObject.documentElement.style.removeProperty("--mobile-shortcuts-total-height");
    },
  });
}
