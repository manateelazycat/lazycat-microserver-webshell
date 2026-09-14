export function createDiagnosticLogDownload({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
} = {}) {
  const downloads = new Map();
  let disposed = false;
  const release = (url) => {
    windowObject.clearTimeout(downloads.get(url));
    downloads.delete(url);
    windowObject.URL.revokeObjectURL(url);
  };
  return Object.freeze({
    download(kind, text) {
      if (disposed) throw new Error("Log downloader is disposed");
      const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/[.]/g, "-");
      const name = String(kind).replace(/[^a-z0-9-]/gi, "-");
      const filename = `webshell-${name}-${timestamp}-log.md`;
      const blob = new windowObject.Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = windowObject.URL.createObjectURL(blob);
      const link = documentObject.createElement("a");
      try {
        link.href = url;
        link.download = filename;
        link.hidden = true;
        documentObject.body.appendChild(link);
        link.click();
        // Keep the URL alive while the browser starts its download/save flow.
        downloads.set(url, windowObject.setTimeout(() => release(url), 60000));
      } catch (error) {
        release(url);
        throw error;
      } finally {
        link.remove();
      }
      return filename;
    },
    dispose() {
      disposed = true;
      for (const url of downloads.keys()) release(url);
    },
  });
}
