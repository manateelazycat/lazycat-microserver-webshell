import {
  attachmentBrowserDisplayName,
  attachmentBrowserPathSegments,
  attachmentBrowserSortNames,
  attachmentUploadStatusText,
  attachmentUploadTitle,
  formatAttachmentFileSize,
  formatAttachmentModified,
  normalizeAttachmentBrowserPath,
} from "./attachments_model.js";

export function createAttachmentsView({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
} = {}) {
  const translate = (key) => typeof globalThis.$t === "function" ? globalThis.$t(key) : key;
  const sortLabel = (label) => translate("排序") === "sort"
    ? `${translate("按")}${label}`
    : `${translate("按")}${label}${translate("排序")}`;
  const byID = (id) => documentObject?.getElementById?.(id) || null;
  const elements = {
    toggle: byID("attachmentToggle"),
    dialogBackdrop: byID("attachmentBackdrop"),
    dialogClose: byID("attachmentClose"),
    clipboardButton: byID("attachmentClipboard"),
    fileButton: byID("attachmentFile"),
    browserButton: byID("attachmentDownload"),
    browserBackdrop: byID("attachmentBrowserBackdrop"),
    browserBack: byID("attachmentBrowserBack"),
    browserClose: byID("attachmentBrowserClose"),
    browserPath: byID("attachmentBrowserPath"),
    browserBreadcrumbs: byID("attachmentBrowserBreadcrumbs"),
    browserSortbar: byID("attachmentBrowserSortbar"),
    browserSortButtons: Array.from(documentObject?.querySelectorAll?.("[data-attachment-sort-key]") || []),
    browserFeedback: byID("attachmentBrowserFeedback"),
    browserList: byID("attachmentBrowserList"),
    browserCancel: byID("attachmentBrowserCancel"),
    browserDownload: byID("attachmentBrowserDownload"),
    fileInput: byID("attachmentFileInput"),
  };
  const uploadPanels = new Map();
  let breadcrumbFrame = 0;

  const cancelBreadcrumbFrame = () => {
    if (breadcrumbFrame) {
      windowObject?.cancelAnimationFrame?.(breadcrumbFrame);
      breadcrumbFrame = 0;
    }
  };

  const renderBreadcrumbs = (path) => {
    if (!elements.browserBreadcrumbs || !documentObject) {
      return;
    }
    cancelBreadcrumbFrame();
    const currentPath = normalizeAttachmentBrowserPath(path);
    elements.browserBreadcrumbs.textContent = "";
    const fragment = documentObject.createDocumentFragment();
    for (const [index, segment] of attachmentBrowserPathSegments(currentPath).entries()) {
      if (index > 0) {
        const separator = documentObject.createElement("span");
        separator.className = "attachment-browser-breadcrumb-separator";
        separator.textContent = ">";
        separator.setAttribute("aria-hidden", "true");
        fragment.appendChild(separator);
      }
      const button = documentObject.createElement("button");
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
    elements.browserBreadcrumbs.appendChild(fragment);
    const scrollToEnd = () => {
      breadcrumbFrame = 0;
      if (elements.browserBreadcrumbs) {
        elements.browserBreadcrumbs.scrollLeft = elements.browserBreadcrumbs.scrollWidth;
      }
    };
    if (typeof windowObject?.requestAnimationFrame === "function") {
      breadcrumbFrame = windowObject.requestAnimationFrame(scrollToEnd);
    } else {
      scrollToEnd();
    }
  };

  const renderSortControls = (sort) => {
    const activeLabel = attachmentBrowserSortNames[sort?.key] || "";
    const direction = sort?.direction === "desc" ? "desc" : "asc";
    const activeDirectionLabel = translate(direction === "desc" ? "降序" : "升序");
    elements.browserSortbar?.setAttribute("data-sort-key", sort?.key || "name");
    elements.browserSortbar?.setAttribute("data-sort-direction", direction);
    for (const button of elements.browserSortButtons) {
      const key = String(button.dataset?.attachmentSortKey || "");
      const active = key === sort?.key;
      const label = translate(attachmentBrowserSortNames[key] || String(button.textContent || "").trim());
      button.classList?.toggle?.("is-active", active);
      button.dataset.sortDirection = active ? direction : "";
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.setAttribute("aria-label", active
        ? `${sortLabel(label)}, ${translate("当前")} ${activeDirectionLabel}, ${translate("点击切换排序")}`
        : sortLabel(label));
    }
    elements.browserList?.setAttribute("aria-label", activeLabel
      ? `${translate("文件列表")}, ${translate("当前")} ${translate(activeLabel)} ${activeDirectionLabel} ${translate("排序")}`
      : translate("文件列表"));
  };

  const createBrowserItem = (entry, selectedPaths) => {
    const item = documentObject.createElement("div");
    item.className = "attachment-browser-item";
    item.dataset.path = entry.path;
    item.dataset.type = entry.type;
    item.setAttribute("role", "listitem");

    const row = documentObject.createElement("div");
    row.className = "attachment-browser-file";
    const checkbox = documentObject.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "attachment-browser-check";
    checkbox.value = entry.path;
    checkbox.checked = selectedPaths.has(entry.path);
    checkbox.setAttribute("aria-label", `选择 ${entry.name || entry.path}`);
    const button = documentObject.createElement("button");
    button.type = "button";
    button.className = "attachment-browser-file-main";
    button.dataset.path = entry.path;
    button.setAttribute("aria-label", entry.type === "dir" ? `打开 ${entry.name || entry.path}` : `下载 ${entry.name || entry.path}`);
    const name = documentObject.createElement("span");
    name.className = "attachment-browser-file-name";
    name.textContent = entry.name || entry.path;
    button.appendChild(name);
    const size = documentObject.createElement("span");
    size.className = "attachment-browser-file-meta attachment-browser-file-size";
    size.textContent = formatAttachmentFileSize(entry);
    size.title = size.textContent;
    const modified = documentObject.createElement("span");
    modified.className = "attachment-browser-file-meta attachment-browser-file-modified";
    modified.textContent = formatAttachmentModified(entry);
    modified.title = modified.textContent;
    row.append(checkbox, button, size, modified);
    item.appendChild(row);
    return item;
  };

  const renderBrowserList = (entries, selectedPaths) => {
    if (!elements.browserList || !documentObject) {
      return;
    }
    elements.browserList.textContent = "";
    if (!entries?.length) {
      const empty = documentObject.createElement("div");
      empty.className = "attachment-browser-empty";
      empty.textContent = "这个目录没有文件";
      elements.browserList.appendChild(empty);
      return;
    }
    const fragment = documentObject.createDocumentFragment();
    for (const entry of entries) {
      fragment.appendChild(createBrowserItem(entry, selectedPaths));
    }
    elements.browserList.appendChild(fragment);
  };

  const createUploadPanel = (upload, handlers) => {
    const panel = documentObject.createElement("section");
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
    panel.querySelector?.(".attachment-upload-copy")?.addEventListener?.("click", () => handlers?.onCopy?.(upload.id));
    panel.querySelector?.(".attachment-upload-close")?.addEventListener?.("click", () => handlers?.onClose?.(upload.id));
    uploadPanels.set(upload.id, panel);
    return panel;
  };

  return {
    elements,
    closeBrowser() {
      if (elements.browserBackdrop) {
        elements.browserBackdrop.hidden = true;
      }
      documentObject?.body?.classList?.remove?.("attachment-browser-open");
    },
    closeDialog() {
      if (elements.dialogBackdrop) {
        elements.dialogBackdrop.hidden = true;
      }
    },
    blurFileInput() {
      elements.fileInput?.blur?.();
    },
    consumeInputFiles() {
      const files = Array.from(elements.fileInput?.files || []);
      if (elements.fileInput) {
        elements.fileInput.value = "";
      }
      return files;
    },
    dispose() {
      cancelBreadcrumbFrame();
      for (const panel of uploadPanels.values()) {
        panel.remove?.();
      }
      uploadPanels.clear();
      this.closeDialog();
      this.closeBrowser();
    },
    focusBrowserBack() {
      elements.browserBack?.focus?.();
    },
    focusClipboard() {
      elements.clipboardButton?.focus?.();
    },
    isAvailable() {
      return Boolean(elements.dialogBackdrop || elements.browserBackdrop);
    },
    isBrowserOpen() {
      return Boolean(elements.browserBackdrop && !elements.browserBackdrop.hidden);
    },
    isDialogOpen() {
      return Boolean(elements.dialogBackdrop && !elements.dialogBackdrop.hidden);
    },
    isFileInputTarget(target) {
      return Boolean(elements.fileInput && target === elements.fileInput);
    },
    openBrowser() {
      documentObject?.body?.classList?.add?.("attachment-browser-open");
      if (elements.browserBackdrop) {
        elements.browserBackdrop.hidden = false;
      }
    },
    openDialog() {
      if (elements.dialogBackdrop) {
        elements.dialogBackdrop.hidden = false;
      }
    },
    openFilePicker() {
      elements.fileInput?.click?.();
    },
    removeUpload(id) {
      const panel = uploadPanels.get(id);
      panel?.remove?.();
      uploadPanels.delete(id);
    },
    renderBrowser({ busy = false, currentPath = "/", entries = [], selectedPaths = new Set(), sort = {}, scrollToTop = false } = {}) {
      if (elements.browserPath) {
        elements.browserPath.textContent = attachmentBrowserDisplayName(currentPath);
        elements.browserPath.title = normalizeAttachmentBrowserPath(currentPath);
      }
      renderBreadcrumbs(currentPath);
      renderSortControls(sort);
      renderBrowserList(entries, selectedPaths);
      if (scrollToTop && elements.browserList) {
        // Replacing the list contents does not reliably reset scroll position
        // in every browser/layout. Explicitly reset it after a path is opened
        // or refreshed so a remembered directory always starts at the top.
        elements.browserList.scrollTop = 0;
        elements.browserList.scrollLeft = 0;
      }
      const count = selectedPaths.size;
      if (elements.browserDownload) {
        elements.browserDownload.disabled = busy || count === 0;
        elements.browserDownload.textContent = count > 0 ? `下载选中 (${count})` : "下载选中";
      }
      elements.browserCancel?.toggleAttribute?.("disabled", busy);
    },
    renderUpload(upload, { host = null, searchOpen = false, handlers = {} } = {}) {
      if (!upload || !host || !documentObject) {
        return null;
      }
      let panel = uploadPanels.get(upload.id);
      if (!panel?.isConnected) {
        panel = createUploadPanel(upload, handlers);
        host.appendChild?.(panel);
      }
      panel.dataset.status = upload.status;
      panel.classList?.toggle?.("search-open", searchOpen === true);
      const title = panel.querySelector?.(".attachment-upload-title");
      const copyButton = panel.querySelector?.(".attachment-upload-copy");
      const detail = panel.querySelector?.(".attachment-upload-detail");
      const progress = panel.querySelector?.(".attachment-upload-progress span");
      if (title) {
        title.textContent = attachmentUploadTitle(upload);
      }
      if (copyButton) {
        copyButton.hidden = upload.status !== "success" || !upload.copyFailed || !String(upload.paths || "").trim();
      }
      if (detail) {
        detail.textContent = attachmentUploadStatusText(upload);
      }
      if (progress) {
        const percent = upload.total > 0 ? Math.max(0, Math.min(100, (upload.loaded / upload.total) * 100)) : 0;
        progress.style.width = upload.status === "success" ? "100%" : `${percent}%`;
      }
      return panel;
    },
    resolveBreadcrumb(event) {
      const button = event?.target?.closest?.(".attachment-browser-breadcrumb[data-path]");
      if (!button || button.disabled) {
        return "";
      }
      return String(button.dataset?.path || "/");
    },
    resolveBrowserItem(event) {
      const button = event?.target?.closest?.(".attachment-browser-file-main[data-path]");
      if (!button) {
        return null;
      }
      const item = button.closest?.(".attachment-browser-item[data-type]");
      return {
        path: String(button.dataset?.path || "").trim(),
        type: String(item?.dataset?.type || "file").trim(),
      };
    },
    resolveSelection(event) {
      const input = event?.target?.closest?.(".attachment-browser-check");
      if (!input) {
        return null;
      }
      return { checked: input.checked === true, path: String(input.value || "").trim() };
    },
    resolveSortKey(event) {
      const button = event?.target?.closest?.("[data-attachment-sort-key]");
      return button ? String(button.dataset?.attachmentSortKey || "").trim() : "";
    },
    setBrowserFeedback(message, tone = "info") {
      if (!elements.browserFeedback) {
        return;
      }
      const text = String(message || "").trim();
      elements.browserFeedback.hidden = !text;
      elements.browserFeedback.textContent = text;
      elements.browserFeedback.dataset.tone = tone;
    },
    triggerDownload(url, filename) {
      if (!documentObject?.body) {
        return;
      }
      const link = documentObject.createElement("a");
      link.href = String(url || "");
      link.download = String(filename || "download");
      link.style.display = "none";
      documentObject.body.appendChild(link);
      link.click?.();
      link.remove?.();
    },
  };
}
