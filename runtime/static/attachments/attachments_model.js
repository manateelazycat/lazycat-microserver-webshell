export const maxAttachmentUploadBytes = 2 * 1024 * 1024 * 1024;
export const maxAttachmentUploadCount = 32;
export const maxAttachmentDownloadCount = 64;

export const attachmentBrowserDefaultSort = Object.freeze({ key: "name", direction: "asc" });

export const attachmentBrowserSortNames = Object.freeze({
  name: "名称",
  size: "文件大小",
  modified: "修改日期",
});

export const normalizeAttachmentTarget = (value = {}) => {
  const targetName = String(value?.targetName || value?.selector || "").trim();
  return {
    targetName,
    isClient: value?.isClient === true || targetName.startsWith("client:"),
    cwd: String(value?.cwd || "").trim(),
    tabId: String(value?.tabId || "").trim(),
    activeTabId: String(value?.activeTabId || value?.tabId || "").trim(),
    searchOpen: value?.searchOpen === true,
  };
};

export const normalizeAttachmentBrowserPath = (path) => {
  const normalized = String(path || "/").trim().replace(/\/+$/g, "");
  return normalized || "/";
};

export const attachmentBrowserDisplayName = (path) => {
  const parts = normalizeAttachmentBrowserPath(path).split("/").filter(Boolean);
  return parts.at(-1) || "/";
};

export const attachmentBrowserPathSegments = (path) => {
  const normalized = normalizeAttachmentBrowserPath(path);
  const segments = [{ label: "/", path: "/" }];
  let accumulated = "";
  for (const part of normalized.split("/").filter(Boolean)) {
    accumulated += `/${part}`;
    segments.push({ label: part, path: accumulated });
  }
  return segments;
};

export const normalizeAttachmentEntryType = (type) => {
  const normalized = String(type || "file").trim().toLowerCase();
  return normalized === "dir" || normalized === "link" ? normalized : "file";
};

export const normalizeAttachmentEntry = (entry, order = 0) => {
  const size = Number(entry?.size || 0);
  const modified = Number(entry?.modified || 0);
  return {
    name: String(entry?.name || "").trim(),
    path: String(entry?.path || "").trim(),
    type: normalizeAttachmentEntryType(entry?.type),
    size: Number.isFinite(size) && size > 0 ? size : 0,
    modified: Number.isFinite(modified) && modified > 0 ? modified : 0,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
  };
};

export const normalizeAttachmentEntries = (entries) => Array.isArray(entries)
  ? entries
    .map((entry, index) => normalizeAttachmentEntry(entry, index))
    .filter((entry) => entry.name && entry.path)
  : [];

export const normalizeAttachmentBrowserSort = (sort = {}) => {
  const key = Object.prototype.hasOwnProperty.call(attachmentBrowserSortNames, sort?.key)
    ? sort.key
    : attachmentBrowserDefaultSort.key;
  return {
    key,
    direction: sort?.direction === "desc" ? "desc" : "asc",
  };
};

export const cycleAttachmentBrowserSort = (sort, key) => {
  const current = normalizeAttachmentBrowserSort(sort);
  const normalizedKey = String(key || "").trim();
  if (!Object.prototype.hasOwnProperty.call(attachmentBrowserSortNames, normalizedKey)) {
    return current;
  }
  if (current.key !== normalizedKey) {
    return { key: normalizedKey, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { key: normalizedKey, direction: "desc" };
  }
  return { ...attachmentBrowserDefaultSort };
};

const compareAttachmentNames = (left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
  numeric: true,
  sensitivity: "base",
});

const compareAttachmentOptionalNumbers = (left, right, value, empty) => {
  const leftEmpty = empty(left);
  const rightEmpty = empty(right);
  if (leftEmpty && rightEmpty) {
    return 0;
  }
  if (leftEmpty) {
    return -1;
  }
  if (rightEmpty) {
    return 1;
  }
  return Number(value(left) || 0) - Number(value(right) || 0);
};

export const sortAttachmentEntries = (entries, sort) => {
  const normalizedSort = normalizeAttachmentBrowserSort(sort);
  return normalizeAttachmentEntries(entries).sort((left, right) => {
    let result = 0;
    if (normalizedSort.key === "name") {
      result = compareAttachmentNames(left, right);
    } else if (normalizedSort.key === "size") {
      result = compareAttachmentOptionalNumbers(left, right, (entry) => entry.size, (entry) => entry.type === "dir");
    } else if (normalizedSort.key === "modified") {
      result = compareAttachmentOptionalNumbers(left, right, (entry) => entry.modified, (entry) => !Number(entry?.modified || 0));
    }
    if (result !== 0) {
      return normalizedSort.direction === "desc" ? -result : result;
    }
    const nameResult = compareAttachmentNames(left, right);
    if (nameResult !== 0) {
      return nameResult;
    }
    return Number(left?.order || 0) - Number(right?.order || 0);
  });
};

export const formatAttachmentBytes = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) {
    return `${Math.round(amount)} ${units[unitIndex]}`;
  }
  const precision = unitIndex >= 3 ? 2 : amount >= 10 ? 0 : 1;
  return `${amount.toFixed(precision)} ${units[unitIndex]}`;
};

export const formatAttachmentFileSize = (entry) => {
  if (entry?.type === "dir") {
    return "";
  }
  const bytes = Number(entry?.size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) {
    return `${Math.round(amount)} ${units[unitIndex]}`;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

export const formatAttachmentModified = (entry) => {
  const seconds = Number(entry?.modified || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const attachmentDownloadFilename = (paths, entriesByPath = new Map()) => {
  const selected = Array.from(paths || []).map((path) => String(path || "").trim()).filter(Boolean);
  if (selected.length !== 1) {
    return "webshell-files.zip";
  }
  const path = selected[0];
  const entry = entriesByPath.get?.(path);
  const name = String(entry?.name || path.split("/").filter(Boolean).pop() || "download").trim() || "download";
  return entry?.type === "dir" && !name.toLowerCase().endsWith(".zip") ? `${name}.zip` : name;
};

export const normalizeAttachmentFiles = (files, { FileCtor = globalThis.File, BlobCtor = globalThis.Blob } = {}) => (
  Array.from(files || []).filter((file) => (
    (typeof FileCtor === "function" && file instanceof FileCtor)
    || (typeof BlobCtor === "function" && file instanceof BlobCtor)
  ))
);

export const totalAttachmentSize = (files) => Array.from(files || []).reduce((sum, file) => sum + Number(file?.size || 0), 0);

export const validateAttachmentFiles = (files, options = {}) => {
  const selectedFiles = normalizeAttachmentFiles(files, options);
  if (selectedFiles.length === 0) {
    return { files: [], error: "empty" };
  }
  if (selectedFiles.length > maxAttachmentUploadCount) {
    return { files: selectedFiles, error: "too_many" };
  }
  const oversized = selectedFiles.find((file) => Number(file?.size || 0) > maxAttachmentUploadBytes) || null;
  if (oversized) {
    return { files: selectedFiles, error: "too_large", oversized };
  }
  return { files: selectedFiles, error: "", oversized: null };
};

export const attachmentUploadTitle = (upload) => {
  const count = upload?.files?.length || 0;
  return count === 1 ? upload.files[0]?.name || "附件" : `${count} 个文件`;
};

export const attachmentUploadStatusText = (upload) => {
  if (upload?.status === "success") {
    if (upload?.source === "paste" || upload?.copyPaths === false) {
      return "上传成功。";
    }
    return upload.copyFailed ? "上传成功，点击复制路径。" : "文件路径已复制到剪切板,粘贴即可";
  }
  if (upload?.status === "error") {
    return upload.error || "上传失败";
  }
  if (upload?.status === "canceled") {
    return "上传已取消";
  }
  const loaded = formatAttachmentBytes(upload?.loaded);
  const total = Number(upload?.total || 0) > 0 ? formatAttachmentBytes(upload.total) : "";
  const percent = Number(upload?.total || 0) > 0
    ? `${Math.round(Math.min(100, (Number(upload.loaded || 0) / upload.total) * 100))}%`
    : "";
  return [loaded && total ? `${loaded} / ${total}` : loaded, percent].filter(Boolean).join(" · ") || "准备上传";
};
