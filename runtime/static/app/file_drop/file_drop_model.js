import { nativePasteFiles } from "../paste/paste_model.js";

const identity = (value) => value;

export function isFileDrag(dataTransfer) {
  return Array.from(dataTransfer?.types || []).some((type) => String(type) === "Files");
}

export function dataTransferHasDirectory(dataTransfer) {
  for (const item of Array.from(dataTransfer?.items || [])) {
    if (typeof item?.webkitGetAsEntry !== "function") {
      continue;
    }
    try {
      const entry = item.webkitGetAsEntry();
      if (entry && entry.isDirectory) {
        return true;
      }
    } catch {
    }
  }
  return false;
}

export function dropFiles(dataTransfer) {
  return nativePasteFiles(dataTransfer);
}

export function dropPreview(dataTransfer) {
  const files = dropFiles(dataTransfer);
  if (files.length > 0) {
    return {
      count: files.length,
      name: files.length === 1 ? String(files[0]?.name || "").trim() : "",
    };
  }
  const items = Array.from(dataTransfer?.items || []).filter((item) => (
    String(item?.kind || "").toLowerCase() === "file"
  ));
  return {
    count: items.length,
    name: "",
  };
}

export function overlayLabel(preview, translate = identity) {
  const count = Number(preview?.count || 0);
  const name = String(preview?.name || "").trim();
  if (count === 1 && name) {
    return `${translate("松开后上传")} ${name}`;
  }
  if (count > 1) {
    return `${translate("松开后上传")} ${count} ${translate("个文件")}`;
  }
  return translate("松开后上传");
}
