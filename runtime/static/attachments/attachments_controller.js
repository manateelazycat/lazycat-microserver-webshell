import { createAttachmentsAPI } from "./attachments_api.js";
import { createAttachmentsClipboard } from "./attachments_clipboard.js";
import { createAttachmentsLifecycle } from "./attachments_lifecycle.js";
import {
  attachmentBrowserDefaultSort,
  attachmentDownloadFilename,
  cycleAttachmentBrowserSort,
  maxAttachmentDownloadCount,
  maxAttachmentUploadBytes,
  maxAttachmentUploadCount,
  normalizeAttachmentBrowserPath,
  normalizeAttachmentEntries,
  normalizeAttachmentTarget,
  sortAttachmentEntries,
  totalAttachmentSize,
  validateAttachmentFiles,
} from "./attachments_model.js";
import { createAttachmentsView } from "./attachments_view.js";

const browserSwipeEdgeWidth = 24;
const browserSwipeAxisThreshold = 12;
const browserSwipeBackDistance = 56;
const browserSwipeMaxVerticalTravel = 40;

export function createAttachmentsController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseURL = windowObject?.location?.href,
  XMLHttpRequestCtor = globalThis.XMLHttpRequest,
  FormDataCtor = globalThis.FormData,
  FileCtor = globalThis.File,
  BlobCtor = globalThis.Blob,
  api = createAttachmentsAPI({ fetchImpl, baseURL, XMLHttpRequestCtor, FormDataCtor }),
  clipboard = createAttachmentsClipboard({
    navigatorObject: windowObject?.navigator || globalThis.navigator,
    windowObject,
    FileCtor,
    BlobCtor,
    ClipboardItemCtor: windowObject?.ClipboardItem || globalThis.ClipboardItem,
  }),
  view = createAttachmentsView({ documentObject, windowObject }),
  lifecycleFactory = createAttachmentsLifecycle,
  getContext = () => ({}),
  getTabHost = () => null,
  prepareOverlayOpen = () => {},
  focusTerminal = () => {},
  showToast = () => {},
  copyText = async () => false,
  isMobileLayout = () => false,
  ingestSelectedFiles = () => ({ handled: false }),
  measureTask = (_name, task) => task(),
  recordPerformanceTask = () => {},
  now = () => globalThis.performance?.now?.() || Date.now(),
} = {}) {
  let started = false;
  let disposed = false;
  let dialogOpen = false;
  let browserOpen = false;
  let browserTargetName = "";
  let browserCurrentPath = "";
  let browserParentPath = "";
  let browserEntries = [];
  let browserEntriesByPath = new Map();
  let browserSelectedPaths = new Set();
  let browserSort = { ...attachmentBrowserDefaultSort };
  let browserBusy = false;
  let browserFeedback = { message: "", tone: "info" };
  let browserRequestGeneration = 0;
  let browserEdgeSwipe = null;
  let clipboardReadGeneration = 0;
  let pendingFileClipboard = null;
  let uploadSequence = 0;
  const uploads = new Map();
  let focusGeneration = 0;
  let focusTimer = 0;

  const currentContext = () => normalizeAttachmentTarget(getContext?.());
  const uploadIsCurrent = (upload) => !disposed && uploads.get(upload?.id) === upload;
  const settleUpload = (upload, status, error = "") => {
    if (!upload || upload.settled) {
      return false;
    }
    upload.settled = true;
    const onSettled = upload.onSettled;
    upload.onSettled = null;
    try {
      onSettled?.({
        error: String(error || ""),
        id: upload.id,
        instanceName: upload.instanceName,
        paths: String(upload.paths || "").split("\n").map((path) => path.trim()).filter(Boolean),
        status,
        tabId: upload.tabId,
      });
    } catch {
    }
    return true;
  };
  const browserRequestIsCurrent = (generation, targetName) => (
    !disposed
    && browserOpen
    && generation === browserRequestGeneration
    && browserTargetName === targetName
    && currentContext().targetName === targetName
  );

  const clearFocusTimer = () => {
    focusGeneration += 1;
    if (focusTimer) {
      windowObject?.clearTimeout?.(focusTimer);
      focusTimer = 0;
    }
  };

  const scheduleFocus = (callback) => {
    clearFocusTimer();
    const generation = focusGeneration;
    focusTimer = windowObject?.setTimeout?.(() => {
      focusTimer = 0;
      if (!disposed && generation === focusGeneration) {
        callback?.();
      }
    }, 0) || 0;
  };

  const setBrowserFeedback = (message, tone = "info") => {
    browserFeedback = { message: String(message || "").trim(), tone };
    view.setBrowserFeedback?.(browserFeedback.message, browserFeedback.tone);
  };

  const renderBrowser = () => {
    if (disposed) {
      return;
    }
    view.renderBrowser?.({
      busy: browserBusy,
      currentPath: browserCurrentPath || "/",
      entries: sortAttachmentEntries(browserEntries, browserSort),
      selectedPaths: browserSelectedPaths,
      sort: browserSort,
    });
    view.setBrowserFeedback?.(browserFeedback.message, browserFeedback.tone);
  };

  const closeDialog = ({ focus = true } = {}) => {
    clearFocusTimer();
    dialogOpen = false;
    view.closeDialog?.();
    if (focus) {
      scheduleFocus(focusTerminal);
    }
  };

  const closeBrowser = ({ focus = true } = {}) => {
    clearFocusTimer();
    browserOpen = false;
    browserTargetName = "";
    browserRequestGeneration += 1;
    browserCurrentPath = "";
    browserParentPath = "";
    browserEntries = [];
    browserEntriesByPath = new Map();
    browserSelectedPaths = new Set();
    browserSort = { ...attachmentBrowserDefaultSort };
    browserBusy = false;
    browserFeedback = { message: "", tone: "info" };
    browserEdgeSwipe = null;
    view.closeBrowser?.();
    view.setBrowserFeedback?.("");
    if (focus) {
      scheduleFocus(focusTerminal);
    }
  };

  const closeAll = ({ focus = true } = {}) => {
    const wasOpen = dialogOpen || browserOpen || view.isDialogOpen?.() || view.isBrowserOpen?.();
    closeDialog({ focus: false });
    closeBrowser({ focus: false });
    if (focus && wasOpen) {
      scheduleFocus(focusTerminal);
    }
  };

  const openDialog = () => {
    if (disposed || !view.isAvailable?.()) {
      return false;
    }
    closeBrowser({ focus: false });
    prepareOverlayOpen();
    dialogOpen = true;
    view.openDialog?.();
    scheduleFocus(() => view.focusClipboard?.());
    return true;
  };

  const loadBrowserPath = async (path = browserCurrentPath) => measureTask("attachment list refresh", async () => {
    if (disposed) {
      return [];
    }
    const context = currentContext();
    if (!context.targetName) {
      showToast("没有可用的当前终端。");
      return [];
    }
    const targetName = context.targetName;
    const generation = ++browserRequestGeneration;
    browserBusy = true;
    setBrowserFeedback("");
    renderBrowser();
    try {
      const payload = await api.list({ targetName, path });
      if (!browserRequestIsCurrent(generation, targetName)) {
        return browserEntries.map((entry) => ({ ...entry }));
      }
      browserCurrentPath = normalizeAttachmentBrowserPath(payload?.path || path || "/");
      browserParentPath = String(payload?.parent || "").trim();
      browserSelectedPaths = new Set();
      browserSort = { ...attachmentBrowserDefaultSort };
      browserEntries = normalizeAttachmentEntries(payload?.entries);
      browserEntriesByPath = new Map(browserEntries.map((entry) => [entry.path, entry]));
      setBrowserFeedback("");
      return browserEntries.map((entry) => ({ ...entry }));
    } catch (error) {
      if (browserRequestIsCurrent(generation, targetName)) {
        setBrowserFeedback(error?.message || "文件列表读取失败。", "error");
      }
      return browserEntries.map((entry) => ({ ...entry }));
    } finally {
      if (browserRequestIsCurrent(generation, targetName)) {
        browserBusy = false;
        renderBrowser();
      }
    }
  });

  const openBrowser = () => {
    if (disposed || !view.isAvailable?.()) {
      return false;
    }
    const context = currentContext();
    closeDialog({ focus: false });
    prepareOverlayOpen();
    browserOpen = true;
    browserTargetName = context.targetName;
    browserCurrentPath = context.isClient ? "/" : context.cwd || "/";
    browserParentPath = "";
    browserEntries = [];
    browserEntriesByPath = new Map();
    browserSelectedPaths = new Set();
    browserSort = { ...attachmentBrowserDefaultSort };
    browserBusy = false;
    browserFeedback = { message: "", tone: "info" };
    browserEdgeSwipe = null;
    view.openBrowser?.();
    renderBrowser();
    loadBrowserPath(browserCurrentPath);
    scheduleFocus(() => view.focusBrowserBack?.());
    return true;
  };

  const navigateBrowserBack = () => {
    if (!browserParentPath || browserParentPath === browserCurrentPath) {
      return false;
    }
    loadBrowserPath(browserParentPath);
    return true;
  };

  const triggerDownload = (paths) => {
    const selected = Array.from(paths || []).map((path) => String(path || "").trim()).filter(Boolean);
    if (selected.length === 0) {
      return false;
    }
    if (selected.length > maxAttachmentDownloadCount) {
      showToast(`一次最多下载 ${maxAttachmentDownloadCount} 个条目。`);
      return false;
    }
    const context = currentContext();
    if (!context.targetName || (browserTargetName && context.targetName !== browserTargetName)) {
      showToast("当前终端已切换，请重新选择文件。");
      return false;
    }
    const url = api.downloadURL({ targetName: context.targetName, paths: selected });
    view.triggerDownload?.(url, attachmentDownloadFilename(selected, browserEntriesByPath));
    return true;
  };

  const downloadSelected = () => {
    if (!triggerDownload(browserSelectedPaths)) {
      return false;
    }
    closeBrowser({ focus: true });
    return true;
  };

  const resetBrowserEdgeSwipe = () => {
    browserEdgeSwipe = null;
  };

  const handleBrowserTouchStart = (event) => {
    if (!browserOpen || !isMobileLayout() || event?.touches?.length !== 1 || !browserParentPath || browserParentPath === browserCurrentPath) {
      resetBrowserEdgeSwipe();
      return;
    }
    const touch = event.touches[0];
    if (touch.clientX > browserSwipeEdgeWidth) {
      resetBrowserEdgeSwipe();
      return;
    }
    browserEdgeSwipe = {
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
      navigated: false,
    };
  };

  const handleBrowserTouchMove = (event) => {
    if (!browserEdgeSwipe || event?.touches?.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - browserEdgeSwipe.startX;
    const deltaY = touch.clientY - browserEdgeSwipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (deltaX < -browserSwipeAxisThreshold) {
      resetBrowserEdgeSwipe();
      return;
    }
    if (!browserEdgeSwipe.horizontal) {
      if (absY > browserSwipeAxisThreshold && absY > absX) {
        resetBrowserEdgeSwipe();
        return;
      }
      if (deltaX > browserSwipeAxisThreshold && absX > absY * 1.2) {
        browserEdgeSwipe.horizontal = true;
      }
    }
    if (!browserEdgeSwipe?.horizontal) {
      return;
    }
    event.preventDefault?.();
    if (!browserEdgeSwipe.navigated && deltaX >= browserSwipeBackDistance && absY <= browserSwipeMaxVerticalTravel) {
      browserEdgeSwipe.navigated = true;
      navigateBrowserBack();
      resetBrowserEdgeSwipe();
    }
  };

  const clearUploadTimer = (upload) => {
    if (upload?.autoCloseTimer) {
      windowObject?.clearTimeout?.(upload.autoCloseTimer);
      upload.autoCloseTimer = 0;
    }
  };

  const rejectReservation = (upload) => {
    upload?.clipboardReservation?.reject?.();
    if (upload) {
      upload.clipboardReservation = null;
    }
  };

  const renderUpload = (upload) => {
    if (!uploadIsCurrent(upload)) {
      return;
    }
    const context = currentContext();
    view.renderUpload?.(upload, {
      host: getTabHost(upload.tabId),
      searchOpen: context.searchOpen && context.activeTabId === upload.tabId,
      handlers: {
        onClose: (id) => removeUpload(id),
        onCopy: (id) => copyUploadPaths(id),
      },
    });
  };

  const removeUpload = (id) => {
    const upload = uploads.get(id);
    if (!upload) {
      return false;
    }
    uploads.delete(id);
    upload.canceled = true;
    settleUpload(upload, "canceled");
    rejectReservation(upload);
    clearUploadTimer(upload);
    view.removeUpload?.(id);
    const xhr = upload.xhr;
    upload.xhr = null;
    if (upload.status === "uploading" && xhr) {
      xhr.abort?.();
    }
    return true;
  };

  const scheduleUploadAutoClose = (upload) => {
    clearUploadTimer(upload);
    upload.autoCloseTimer = windowObject?.setTimeout?.(() => {
      upload.autoCloseTimer = 0;
      if (uploadIsCurrent(upload) && upload.status === "success") {
        removeUpload(upload.id);
      }
    }, 5000) || 0;
  };

  const copyAttachmentPaths = async (paths, reservation = null) => {
    const text = String(paths || "").trim();
    if (!text) {
      reservation?.reject?.();
      return true;
    }
    if (reservation) {
      try {
        reservation.resolve(text);
        await reservation.promise;
        return true;
      } catch {
      }
    }
    return copyText(text);
  };

  const copyUploadPaths = async (id) => {
    const upload = uploads.get(id);
    if (!upload || !String(upload.paths || "").trim()) {
      return false;
    }
    if (await copyText(upload.paths)) {
      if (!uploadIsCurrent(upload)) {
        return false;
      }
      upload.copyFailed = false;
      renderUpload(upload);
      scheduleUploadAutoClose(upload);
      return true;
    }
    showToast("路径复制失败。");
    return false;
  };

  const uploadAttachments = (files, {
    source = "file",
    clipboardReservation = null,
    context: requestedContext = null,
    copyPaths = true,
    onSettled = null,
  } = {}) => {
    const validation = validateAttachmentFiles(files, { FileCtor, BlobCtor });
    if (validation.error === "empty") {
      clipboardReservation?.reject?.();
      showToast(source === "clipboard" ? "剪贴板没有可导入的内容。" : "请选择要上传的文件。");
      return "";
    }
    if (validation.error === "too_many") {
      clipboardReservation?.reject?.();
      showToast(`一次最多上传 ${maxAttachmentUploadCount} 个文件。`);
      return "";
    }
    if (validation.error === "too_large") {
      clipboardReservation?.reject?.();
      showToast(`文件超过 2GB：${validation.oversized?.name || "附件"}`);
      return "";
    }
    const context = normalizeAttachmentTarget(requestedContext || currentContext());
    const liveContext = currentContext();
    if (
      !context.tabId
      || !context.targetName
      || !getTabHost(context.tabId)
      || context.targetName !== liveContext.targetName
    ) {
      clipboardReservation?.reject?.();
      showToast("没有可用的当前终端。");
      return "";
    }
    const upload = {
      id: `attachment-${++uploadSequence}`,
      tabId: context.tabId,
      instanceName: context.targetName,
      files: validation.files,
      total: totalAttachmentSize(validation.files),
      loaded: 0,
      status: "uploading",
      xhr: null,
      error: "",
      canceled: false,
      paths: "",
      copyFailed: false,
      copyPaths: copyPaths !== false,
      clipboardReservation,
      autoCloseTimer: 0,
      source,
      settled: false,
      onSettled,
    };
    uploads.set(upload.id, upload);
    renderUpload(upload);
    const startedAt = now();
    let recorded = false;
    const recordUpload = () => {
      if (recorded) {
        return;
      }
      recorded = true;
      recordPerformanceTask("attachment upload", now() - startedAt);
    };
    let operation;
    try {
      operation = api.upload({
        targetName: upload.instanceName,
        files: upload.files,
        onProgress: (event) => {
          if (!uploadIsCurrent(upload)) {
            return;
          }
          if (event.lengthComputable) {
            upload.loaded = event.loaded;
            upload.total = event.total || upload.total;
          } else {
            upload.loaded = Math.max(upload.loaded, event.loaded || 0);
          }
          renderUpload(upload);
        },
      });
      upload.xhr = operation.xhr;
    } catch (error) {
      recordUpload();
      upload.status = "error";
      upload.error = error?.message || "上传失败";
      rejectReservation(upload);
      renderUpload(upload);
      settleUpload(upload, "error", upload.error);
      return upload.id;
    }
    Promise.resolve(operation.promise).then(async (payload) => {
      recordUpload();
      if (!uploadIsCurrent(upload)) {
        return;
      }
      upload.xhr = null;
      upload.loaded = upload.total || upload.loaded;
      const paths = Array.isArray(payload?.files)
        ? payload.files.map((file) => String(file?.path || "").trim()).filter(Boolean)
        : [];
      upload.paths = paths.join("\n");
      if (paths.length > 0 && upload.copyPaths) {
        upload.copyFailed = !(await copyAttachmentPaths(upload.paths, upload.clipboardReservation));
      } else {
        upload.clipboardReservation?.reject?.();
      }
      upload.clipboardReservation = null;
      if (!uploadIsCurrent(upload)) {
        return;
      }
      upload.status = "success";
      renderUpload(upload);
      settleUpload(upload, "success");
      if (!upload.copyFailed) {
        scheduleUploadAutoClose(upload);
      }
    }).catch((error) => {
      recordUpload();
      if (!uploadIsCurrent(upload)) {
        return;
      }
      upload.xhr = null;
      rejectReservation(upload);
      clearUploadTimer(upload);
      if (error?.code === "attachment_upload_aborted") {
        upload.status = "canceled";
        upload.error = "";
      } else {
        upload.status = "error";
        upload.error = error?.message || "上传失败";
      }
      renderUpload(upload);
      settleUpload(upload, upload.status, upload.error);
    });
    return upload.id;
  };

  const reserveFileClipboard = () => {
    pendingFileClipboard?.reject?.();
    pendingFileClipboard = null;
    try {
      pendingFileClipboard = clipboard.createReservation?.() || null;
    } catch {
      pendingFileClipboard = null;
    }
  };

  const consumeFileClipboard = () => {
    const reservation = pendingFileClipboard;
    pendingFileClipboard = null;
    return reservation;
  };

  const cancelFileClipboard = () => {
    pendingFileClipboard?.reject?.();
    pendingFileClipboard = null;
  };

  const importFromClipboard = async () => {
    const generation = ++clipboardReadGeneration;
    try {
      const files = await clipboard.readFiles();
      if (disposed || generation !== clipboardReadGeneration) {
        return false;
      }
      closeDialog({ focus: false });
      return Boolean(uploadAttachments(files, { source: "clipboard" }));
    } catch (error) {
      if (!disposed && generation === clipboardReadGeneration) {
        showToast(error?.message || "剪贴板读取失败。");
        closeDialog({ focus: true });
      }
      return false;
    }
  };

  const selectFiles = () => {
    if (disposed) {
      return false;
    }
    closeDialog({ focus: false });
    if (isMobileLayout()) {
      cancelFileClipboard();
    } else {
      reserveFileClipboard();
    }
    view.openFilePicker?.();
    return true;
  };

  const handleFileInputChange = () => {
    const files = view.consumeInputFiles?.() || [];
    if (isMobileLayout()) {
      cancelFileClipboard();
      const ingested = ingestSelectedFiles(files);
      view.blurFileInput?.();
      scheduleFocus(focusTerminal);
      if (ingested?.handled) {
        return ingested;
      }
      return uploadAttachments(files, {
        source: "file",
        copyPaths: false,
      });
    }
    const uploadID = uploadAttachments(files, {
      source: "file",
      clipboardReservation: consumeFileClipboard(),
    });
    view.blurFileInput?.();
    scheduleFocus(focusTerminal);
    return uploadID;
  };

  const handleFileInputCancel = () => {
    cancelFileClipboard();
    view.blurFileInput?.();
    scheduleFocus(focusTerminal);
  };

  const uploadPastedFiles = (files, { targetName = "", tabId = "" } = {}) => new Promise((resolve) => {
    const liveContext = currentContext();
    const uploadID = uploadAttachments(files, {
      source: "paste",
      context: {
        ...liveContext,
        targetName: String(targetName || liveContext.targetName || "").trim(),
        tabId: String(tabId || liveContext.tabId || "").trim(),
      },
      copyPaths: false,
      onSettled: resolve,
    });
    if (!uploadID) {
      resolve(null);
    }
  });

  const handleTargetChange = () => {
    clipboardReadGeneration += 1;
    cancelFileClipboard();
    closeAll({ focus: false });
    const targetName = currentContext().targetName;
    for (const upload of [...uploads.values()]) {
      if (upload.instanceName !== targetName) {
        removeUpload(upload.id);
      }
    }
  };

  const handleTabRemoved = (tabId) => {
    const normalizedTabID = String(tabId || "").trim();
    for (const upload of [...uploads.values()]) {
      if (upload.tabId === normalizedTabID) {
        removeUpload(upload.id);
      }
    }
  };

  const refreshUploadPanels = () => {
    for (const upload of uploads.values()) {
      renderUpload(upload);
    }
  };

  const handleEscape = (event) => {
    if (event?.key !== "Escape") {
      return false;
    }
    if (dialogOpen || view.isDialogOpen?.()) {
      event.preventDefault?.();
      closeDialog({ focus: true });
      return true;
    }
    if (browserOpen || view.isBrowserOpen?.()) {
      event.preventDefault?.();
      closeBrowser({ focus: true });
      return true;
    }
    return false;
  };

  const lifecycle = lifecycleFactory({
    elements: view.elements,
    handlers: {
      onBreadcrumb: (event) => {
        const path = view.resolveBreadcrumb?.(event);
        if (path) {
          loadBrowserPath(path);
        }
      },
      onBrowserBackdrop: (event) => {
        if (event?.target === view.elements?.browserBackdrop) {
          closeBrowser({ focus: true });
        }
      },
      onBrowserItem: (event) => {
        const item = view.resolveBrowserItem?.(event);
        if (!item?.path) {
          return;
        }
        if (item.type === "dir") {
          loadBrowserPath(item.path);
          return;
        }
        if (triggerDownload([item.path])) {
          closeBrowser({ focus: true });
        }
      },
      onCloseBrowser: () => closeBrowser({ focus: true }),
      onCloseDialog: () => closeDialog({ focus: true }),
      onDialogBackdrop: (event) => {
        if (event?.target === view.elements?.dialogBackdrop) {
          closeDialog({ focus: true });
        }
      },
      onDownloadSelected: downloadSelected,
      onFileInputCancel: handleFileInputCancel,
      onFileInputChange: handleFileInputChange,
      onImportClipboard: importFromClipboard,
      onOpenBrowser: openBrowser,
      onOpenDialog: openDialog,
      onSelectFiles: selectFiles,
      onSelectionChange: (event) => {
        const selection = view.resolveSelection?.(event);
        if (!selection?.path) {
          return;
        }
        if (selection.checked) {
          browserSelectedPaths.add(selection.path);
        } else {
          browserSelectedPaths.delete(selection.path);
        }
        renderBrowser();
      },
      onSort: (event) => {
        const key = view.resolveSortKey?.(event);
        if (!key) {
          return;
        }
        browserSort = cycleAttachmentBrowserSort(browserSort, key);
        renderBrowser();
      },
      onTouchEnd: resetBrowserEdgeSwipe,
      onTouchMove: handleBrowserTouchMove,
      onTouchStart: handleBrowserTouchStart,
    },
  });

  return {
    closeAll,
    closeBrowser,
    closeDialog,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      browserRequestGeneration += 1;
      clipboardReadGeneration += 1;
      clearFocusTimer();
      cancelFileClipboard();
      lifecycle.dispose?.();
      for (const id of [...uploads.keys()]) {
        removeUpload(id);
      }
      dialogOpen = false;
      browserOpen = false;
      view.dispose?.();
    },
    handleEscape,
    handleTabRemoved,
    handleTargetChange,
    importFromClipboard,
    isFileInputTarget: (target) => view.isFileInputTarget?.(target) === true,
    isAnyOpen: () => Boolean(dialogOpen || browserOpen || view.isDialogOpen?.() || view.isBrowserOpen?.()),
    isBrowserOpen: () => Boolean(browserOpen && view.isBrowserOpen?.()),
    isDialogOpen: () => Boolean(dialogOpen && view.isDialogOpen?.()),
    loadBrowserPath,
    openBrowser,
    openDialog,
    refreshUploadPanels,
    selectFiles,
    uploadPastedFiles,
    snapshot() {
      return {
        browser: {
          busy: browserBusy,
          currentPath: browserCurrentPath,
          entries: browserEntries.map((entry) => ({ ...entry })),
          open: browserOpen,
          parentPath: browserParentPath,
          selectedPaths: [...browserSelectedPaths],
          sort: { ...browserSort },
          targetName: browserTargetName,
        },
        dialogOpen,
        disposed,
        pendingFileClipboard: Boolean(pendingFileClipboard),
        started,
        uploads: [...uploads.values()].map((upload) => ({
          copyFailed: upload.copyFailed,
          error: upload.error,
          id: upload.id,
          instanceName: upload.instanceName,
          loaded: upload.loaded,
          paths: upload.paths,
          status: upload.status,
          tabId: upload.tabId,
          total: upload.total,
        })),
      };
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start?.();
    },
    uploadAttachments,
  };
}
