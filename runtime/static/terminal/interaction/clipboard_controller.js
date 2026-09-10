import { createBrowserClipboardAdapter } from "./clipboard_adapter.js";
import { createTerminalClipboardLifecycle } from "./clipboard_lifecycle.js";
import { consumeTerminalOsc52Chunk } from "./clipboard_osc52_model.js";

const defaultDragThresholdPx = 4;

export function createTerminalClipboardController({
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
  adapter = null,
  lifecycleFactory = createTerminalClipboardLifecycle,
  getActiveSession = () => null,
  getSelectionText = (session) => session?.term?.getSelection?.() || "",
  clearSelectionState = () => {},
  sendInput = () => {},
  updateSelectionUI = () => {},
  showToast = () => {},
  isMobileLayout = () => false,
  isDesktopMouseClipboardEnabled = () => false,
  activateSession = () => {},
  reassertSessionSize = () => {},
  focusForNativePaste = () => {},
  prepareSelectionManager = () => {},
  dragThresholdPx = defaultDragThresholdPx,
  consoleObject = globalThis.console,
} = {}) {
  const clipboard = adapter || createBrowserClipboardAdapter({ documentObject, navigatorObject, windowObject });
  const lifecycle = lifecycleFactory({ documentObject });
  const osc52State = new WeakMap();
  const osc52InstalledSessions = new WeakSet();
  let started = false;
  let disposed = false;

  const getSelectedText = (session = getActiveSession()) => {
    if (!session?.term) {
      return "";
    }
    return getSelectionText(session);
  };

  const copyText = async (text) => {
    if (disposed) {
      return false;
    }
    return clipboard.copyText(text);
  };

  const readText = async () => {
    if (disposed) {
      return "";
    }
    return clipboard.readText();
  };

  const readTextSilently = async () => {
    try {
      return await readText();
    } catch (error) {
      return "";
    }
  };

  const copySession = async (session = getActiveSession()) => {
    if (disposed || !session?.term) {
      return false;
    }
    const text = getSelectedText(session);
    clearSelectionState(session);
    if (!text) {
      showToast("没有可复制的选区。");
      return false;
    }
    const copied = await copyText(text);
    if (disposed || session.closed) {
      return copied;
    }
    if (copied) {
      showToast("已复制。");
      session.term.clearSelection?.();
      updateSelectionUI();
    } else {
      showToast("复制失败。");
    }
    return copied;
  };

  const pasteSession = async (session = getActiveSession(), text = null) => {
    if (disposed || !session?.term || session.closed) {
      return false;
    }
    try {
      const value = text === null ? await readText() : String(text || "");
      if (disposed || session.closed || !value) {
        return false;
      }
      const bracketed = session.term.wasmTerm?.hasBracketedPaste?.() === true;
      sendInput(session, bracketed ? `\x1b[200~${value}\x1b[201~` : value);
      return true;
    } catch (error) {
      if (!disposed && !session.closed) {
        showToast(error?.message || "粘贴失败。");
        focusForNativePaste(session);
      }
      return false;
    }
  };

  const consumeOsc52Output = (session, chunk) => {
    if (disposed || !session || session.closed) {
      return;
    }
    let state = osc52State.get(session);
    if (!state) {
      state = { pending: "" };
      osc52State.set(session, state);
    }
    const next = consumeTerminalOsc52Chunk(state.pending, chunk);
    state.pending = next.pending;
    for (const text of next.writes) {
      Promise.resolve(copyText(text)).catch((error) => {
        consoleObject?.warn?.("Terminal OSC 52 clipboard write failed.", error);
      });
    }
  };

  const copyCurrentSelection = async (session) => {
    const text = session?.term?.getSelection?.() || "";
    if (disposed || session?.closed || !text) {
      return false;
    }
    try {
      const copied = await copyText(text);
      if (!copied) {
        consoleObject?.warn?.("Terminal selection copy failed.");
      }
      return copied;
    } catch (error) {
      consoleObject?.warn?.("Terminal selection copy failed.", error);
      return false;
    }
  };

  return Object.freeze({
    installSession(session) {
      const term = session?.term;
      if (disposed || !term || typeof term.write !== "function" || osc52InstalledSessions.has(session)) {
        return () => {};
      }
      osc52InstalledSessions.add(session);
      const originalWrite = term.write.bind(term);
      term.write = (...args) => {
        consumeOsc52Output(session, args[0]);
        return originalWrite(...args);
      };
      return () => {
        osc52State.delete(session);
        osc52InstalledSessions.delete(session);
      };
    },

    bindDesktopSession(session) {
      const shell = session?.shellEl;
      const host = session?.terminalHost;
      const term = session?.term;
      if (!started || disposed || !shell || !host || !term) {
        return () => {};
      }
      prepareSelectionManager(session);
      let selectionDrag = null;
      const isTerminalMouseTarget = (target) => {
        const ElementConstructor = windowObject?.Element || globalThis.Element;
        if (ElementConstructor && !(target instanceof ElementConstructor)) {
          return false;
        }
        return target?.closest?.(".terminal-host") === host;
      };
      const onMouseDown = (event) => {
        if (event.button === 1 && isTerminalMouseTarget(event.target)) {
          if (isDesktopMouseClipboardEnabled()) {
            event.preventDefault();
            activateSession(session);
          }
          return;
        }
        if (!isDesktopMouseClipboardEnabled() || event.button !== 0 || isMobileLayout() || !isTerminalMouseTarget(event.target)) {
          selectionDrag = null;
          return;
        }
        clearSelectionState(session);
        selectionDrag = { startX: event.clientX, startY: event.clientY, moved: false };
      };
      const onMouseMove = (event) => {
        if (!selectionDrag) {
          return;
        }
        if (Math.hypot(event.clientX - selectionDrag.startX, event.clientY - selectionDrag.startY) >= dragThresholdPx) {
          selectionDrag.moved = true;
        }
      };
      const onMouseUp = (event) => {
        const drag = selectionDrag;
        selectionDrag = null;
        if (!isDesktopMouseClipboardEnabled() || !drag || event.button !== 0 || isMobileLayout() || !drag.moved) {
          return;
        }
        if (!session.closed) {
          copyCurrentSelection(session);
        }
      };
      const onAuxClick = async (event) => {
        if (!isDesktopMouseClipboardEnabled() || event.button !== 1 || !isTerminalMouseTarget(event.target)) {
          return;
        }
        event.preventDefault();
        activateSession(session);
        reassertSessionSize(session);
        const text = await readTextSilently();
        if (text && !disposed && !session.closed) {
          await pasteSession(session, text);
        }
      };
      const cleanup = lifecycle.bindDesktopSession(shell, { onAuxClick, onMouseDown, onMouseMove, onMouseUp });
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        selectionDrag = null;
        cleanup();
      };
    },
    copyCurrentSelection,
    copySession,
    copyText,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      lifecycle.dispose();
    },
    getSelectedText,
    pasteSession,
    readText,
    readTextSilently,
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start();
    },
  });
}
