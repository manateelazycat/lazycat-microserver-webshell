export function createBrowserClipboardAdapter({
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
  FileCtor = globalThis.File,
} = {}) {
  const normalizeReadError = (error) => {
    const name = String(error?.name || "");
    const message = String(error?.message || "");
    if (
      name === "NotAllowedError"
      || name === "SecurityError"
      || /permissions[- ]policy|clipboard-read|read permission|not allowed/i.test(message)
    ) {
      return new Error("当前页面策略禁止主动读取剪贴板，请使用 Ctrl+V 或 Command+V 粘贴。");
    }
    return error;
  };

  const readText = async () => {
    if (!navigatorObject?.clipboard?.readText || !windowObject?.isSecureContext) {
      throw new Error("当前浏览器环境无法读取剪贴板。");
    }
    try {
      return await navigatorObject.clipboard.readText();
    } catch (error) {
      throw normalizeReadError(error);
    }
  };

  return Object.freeze({
    async copyText(text) {
      const value = String(text || "");
      if (!value) {
        return false;
      }
      if (navigatorObject?.clipboard?.writeText && windowObject?.isSecureContext) {
        try {
          await navigatorObject.clipboard.writeText(value);
          return true;
        } catch (error) {
        }
      }
      const textarea = documentObject?.createElement?.("textarea");
      if (!textarea || !documentObject?.body) {
        return false;
      }
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      documentObject.body.appendChild(textarea);
      textarea.select();
      let copied = false;
      try {
        copied = documentObject.execCommand?.("copy") === true;
      } finally {
        textarea.remove();
      }
      return copied;
    },
    readText,
    async readContent() {
      if (!navigatorObject?.clipboard?.read || !windowObject?.isSecureContext) {
        return { files: [], text: await readText() };
      }
      let items;
      try {
        items = await navigatorObject.clipboard.read();
      } catch (error) {
        // Some browsers allow text reads but do not support image reads.
        try {
          const text = await readText();
          if (text) return { files: [], text };
        } catch {
        }
        throw normalizeReadError(error);
      }
      const files = [];
      for (const item of items || []) {
        const types = Array.from(item.types || []);
        // ClipboardItem types are alternative representations, not files.
        const type = types.includes("image/png") ? "image/png" : types.find((value) => value.startsWith("image/"));
        if (!type) continue;
        if (typeof FileCtor !== "function") throw new Error("当前浏览器无法创建附件文件。");
        const blob = await item.getType(type);
        if (!blob?.size) throw new Error("剪贴板没有可导入的内容。");
        const extension = ({ "image/jpeg": "jpg", "image/svg+xml": "svg", "image/x-icon": "ico" })[type]
          || type.slice(6).replace(/[^a-z0-9]/gi, "") || "png";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        files.push(new FileCtor([blob], `clipboard-${timestamp}-${files.length + 1}.${extension}`, { type }));
      }
      if (files.length > 0) return { files, text: "" };
      const textItem = Array.from(items || []).find((item) => Array.from(item.types || []).includes("text/plain"));
      const text = textItem ? await (await textItem.getType("text/plain")).text() : await readText();
      return { files: [], text };
    },
  });
}
