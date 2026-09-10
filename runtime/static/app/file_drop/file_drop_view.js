export function createAppFileDropView({ documentObject = globalThis.document } = {}) {
  let overlay = null;

  const ensureOverlay = () => {
    if (overlay?.isConnected) {
      return overlay;
    }
    overlay = documentObject?.createElement?.("div") || null;
    if (!overlay) {
      return null;
    }
    overlay.className = "terminal-file-drop-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.fileDropOverlay = "true";
    return overlay;
  };

  return {
    hide() {
      overlay?.remove?.();
      return true;
    },
    show(host, label) {
      const node = ensureOverlay();
      if (!node || !host?.appendChild) {
        return false;
      }
      const text = String(label || "").trim();
      if (node.textContent !== text) {
        node.textContent = text;
      }
      if (node.parentNode !== host) {
        host.appendChild(node);
      }
      return true;
    },
    dispose() {
      overlay?.remove?.();
      overlay = null;
      return true;
    },
  };
}
