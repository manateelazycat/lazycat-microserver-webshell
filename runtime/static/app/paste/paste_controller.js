import {
  formatPastedAttachmentPaths,
  nativePasteFiles,
  nativePasteText,
} from "./paste_model.js";

const noop = () => {};

export function createAppPasteController({
  uploadFiles = async () => null,
  pasteText = async () => false,
  isSessionValid = (session) => Boolean(session && !session.closed),
  reassertSize = noop,
  showToast = noop,
} = {}) {
  const handledEvents = new WeakSet();
  let started = false;
  let disposed = false;
  let generation = 0;

  const consumeEvent = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  };

  const handleFilePaste = (session, files, operationGeneration, errorMessage = "附件粘贴上传失败。") => {
    const completion = Promise.resolve().then(() => uploadFiles(files, { session })).then(async (result) => {
      const paths = Array.isArray(result?.paths) ? result.paths : [];
      const text = formatPastedAttachmentPaths(paths);
      if (
        disposed
        || generation !== operationGeneration
        || !text
        || !isSessionValid(session, result)
      ) {
        return false;
      }
      return await pasteText(session, text) === true;
    }).catch((error) => {
      if (!disposed && generation === operationGeneration && isSessionValid(session)) {
        showToast(error?.message || errorMessage);
      }
      return false;
    });
    return completion;
  };

  return Object.freeze({
    dispose() {
      if (disposed) return false;
      disposed = true;
      generation += 1;
      return true;
    },
    handleDroppedFiles(session, files) {
      if (!started || disposed || !session || session.closed) {
        return { handled: false, files: [], completion: Promise.resolve(false) };
      }
      const selected = Array.from(files || []).filter((file) => (
        file && typeof file === "object" && Number.isFinite(Number(file.size))
      ));
      if (selected.length === 0) {
        return { handled: false, files: [], completion: Promise.resolve(false) };
      }
      reassertSize(session);
      return {
        handled: true,
        files: selected,
        completion: handleFilePaste(session, selected, generation, "附件上传失败。"),
      };
    },
    handleNativePaste(session, event) {
      if (!started || disposed || !session || session.closed || !event) {
        return { handled: false, kind: "", text: "", files: [], completion: Promise.resolve(false) };
      }
      if (typeof event === "object" && handledEvents.has(event)) {
        return { handled: false, duplicate: true, kind: "", text: "", files: [], completion: Promise.resolve(false) };
      }
      const files = nativePasteFiles(event.clipboardData);
      const text = files.length > 0 ? "" : nativePasteText(event.clipboardData);
      if (files.length === 0 && !text) {
        if (typeof event === "object") handledEvents.add(event);
        consumeEvent(event);
        showToast("剪贴板没有可粘贴的文本或文件。");
        return { handled: true, kind: "unsupported", text: "", files: [], completion: Promise.resolve(false) };
      }
      if (typeof event === "object") handledEvents.add(event);
      consumeEvent(event);
      reassertSize(session);
      const operationGeneration = generation;
      if (files.length > 0) {
        return {
          handled: true,
          kind: "files",
          text: "",
          files,
          completion: handleFilePaste(session, files, operationGeneration),
        };
      }
      const completion = Promise.resolve().then(() => pasteText(session, text)).then((result) => (
        !disposed && generation === operationGeneration && !session.closed && result === true
      )).catch((error) => {
        if (!disposed && generation === operationGeneration && !session.closed) {
          showToast(error?.message || "粘贴失败。");
        }
        return false;
      });
      return { handled: true, kind: "text", text, files: [], completion };
    },
    start() {
      if (started || disposed) return false;
      started = true;
      return true;
    },
  });
}
