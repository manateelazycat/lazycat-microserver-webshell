import { createTerminalStartupErrorAPI } from "./startup_error_api.js";
import { createTerminalStartupErrorLifecycle } from "./startup_error_lifecycle.js";

const genericWebSocketStartupFallbacks = new Set([
  "WebSocket connection failed.",
  "WebSocket closed before terminal attached.",
  "WebSocket reconnect failed.",
]);

export const isRetryableTerminalStartupError = (message) => {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes("network_failure")
    || normalized.includes("network failure")
    || normalized.includes("terminal queue connection close")
    || normalized.includes("terminal queue connection closed")
    || normalized.includes("terminal queue websocket error")
    || normalized.includes("queue_transport_closed")
    || normalized.includes("queue transport closed")
    || normalized.includes("fast_1_closed")
    || normalized.includes("fast_2_closed")
    || normalized.includes("transport_recovery")
    || normalized.includes("queue_keepalive_failed")
    || normalized.includes("websocket connection failed")
    || normalized.includes("websocket closed before terminal attached")
    || normalized.includes("websocket reconnect failed")
    || normalized.includes("connection timed out")
    || normalized.includes("connect timed out")
    || normalized.includes("network timeout")
    || normalized.includes("connection reset")
    || normalized.includes("connection aborted");
};

export function createTerminalStartupErrorController({
  windowObject = globalThis.window,
  retryButton = null,
  restartSession = () => Promise.resolve(false),
  getTerminalText = () => Promise.resolve(""),
  navigatorObject = globalThis.navigator,
  fetchImpl = globalThis.fetch,
  apiFactory = createTerminalStartupErrorAPI,
  lifecycleFactory = createTerminalStartupErrorLifecycle,
  getActiveTabId = () => "",
  getTabById = () => null,
  isCurrentSession = () => false,
  showStartupErrorPanel = () => {},
  hideStartupErrorPanel = () => {},
  writeImmediate = () => {},
  appendDebugWarning = () => {},
  describeSession = (session) => `${session?.name || "unknown"}/${session?.id || "unknown"}`,
  consoleObject = globalThis.console,
} = {}) {
  const api = apiFactory({ windowObject, fetchImpl });
  const lifecycle = lifecycleFactory();
  let exitSession = null;
  const exitMessages = new WeakMap();
  const isActive = (session) => session?.tabId === getActiveTabId()
    && getTabById(session.tabId)?.activePaneId === session.id;
  let restarting = false;
  const translate = (text) => globalThis.$t?.(text) || text;
  const retryExited = async () => {
    const session = exitSession;
    if (restarting || lifecycle.isDisposed() || !session?.terminalExitRetained || session.closed || !isActive(session) || !isCurrentSession(session)) return;
    restarting = true;
    if (retryButton) {
      retryButton.disabled = true;
      retryButton.textContent = translate("正在重新创建终端...");
    }
    try {
      const result = await restartSession(session);
      if (result !== false && exitSession === session) {
        exitSession = null;
        hideStartupErrorPanel();
      }
    } catch (error) {
      if (!session.closed && exitSession === session) showStartupErrorPanel(error?.message || translate("重新创建终端失败。"));
    } finally {
      restarting = false;
      if (retryButton && !lifecycle.isDisposed()) {
        retryButton.disabled = false;
        retryButton.textContent = translate("重新创建终端");
      }
    }
  };
  retryButton?.addEventListener("click", retryExited);

  const showExited = async (session, message, readOutput = false) => {
    if (lifecycle.isDisposed() || session.closed || !isCurrentSession(session)) return false;
    exitMessages.set(session, message);
    if (!isActive(session)) return false;
    const requestID = lifecycle.nextRequest(session);
    exitSession = session;
    const summary = String(message.message || `Terminal process exited with code ${Number(message.exit_code ?? -1)}.`);
    let output = "";
    if (readOutput) {
      const totalRows = Number(session.term.getScrollbackLength?.() || 0) + Number(session.term.rows || 1);
      const range = {
        startRow: Math.max(0, totalRows - 64), startCol: 0,
        endRow: totalRows - 1, endCol: Math.max(0, Number(session.term.cols || 1) - 1),
      };
      try { output = String(await getTerminalText(session, range) || "").trim(); } catch {}
      if (lifecycle.isDisposed() || session.closed || !isActive(session) || !lifecycle.isCurrent(session, requestID) || !isCurrentSession(session)) return false;
    }
    showStartupErrorPanel(output ? `${summary}\n\n${output}` : summary);
    if (retryButton) retryButton.hidden = false;
    return true;
  };

  const isGenericFallback = (message) => (
    genericWebSocketStartupFallbacks.has(String(message || "").trim())
  );

  const writeError = (session, message) => {
    const text = String(message || "").trim();
    if (!text || !session || session.closed || !isCurrentSession(session)) {
      return false;
    }
    if (isRetryableTerminalStartupError(text)) {
      session.connectionRetrying = true;
      session.shellEl.dataset.connection = navigatorObject?.onLine === false ? "offline" : "network-error";
      appendDebugWarning("终端网络错误将自动重试", `${describeSession(session)}: ${text}`);
      return true;
    }
    showStartupErrorPanel(text);
    if (retryButton) retryButton.hidden = !session.terminalExitRetained;
    writeImmediate(session, `\r\n[webshell error]\r\n${text.replace(/\r?\n/g, "\r\n")}\r\n`);
    return true;
  };

  const invalidate = (session, { hidePanel = false } = {}) => {
    if (!session || lifecycle.isDisposed()) {
      return false;
    }
    lifecycle.nextRequest(session);
    session.startupErrorShown = false;
    if (
      hidePanel
      && session.tabId === getActiveTabId()
      && getTabById(getActiveTabId())?.activePaneId === session.id
    ) {
      hideStartupErrorPanel();
    }
    return true;
  };

  const show = async (session, fallback = "") => {
    if (!session || session.closed || lifecycle.isDisposed() || !isCurrentSession(session)) {
      return false;
    }
    const requestID = lifecycle.nextRequest(session);
    let message = "";
    try {
      message = await api.read(session.name);
    } catch (error) {
    }
    if (
      session.closed
      || !isCurrentSession(session)
      || !lifecycle.isCurrent(session, requestID)
    ) {
      return false;
    }
    if (message) {
      if (isRetryableTerminalStartupError(message)) {
        session.startupErrorShown = false;
        return writeError(session, message);
      }
      if (session.hasPresentedFrame) {
        showStartupErrorPanel(message);
        consoleObject?.warn?.("[client-terminal] startup error while preserving last frame", {
          name: session.name,
          pane: session.id,
          message,
        });
        return true;
      }
      return writeError(session, message);
    }
    if (isGenericFallback(fallback)) {
      return false;
    }
    if (isRetryableTerminalStartupError(fallback)) {
      session.startupErrorShown = false;
    }
    return writeError(session, fallback);
  };

  return Object.freeze({
    dispose() {
      lifecycle.dispose();
      retryButton?.removeEventListener("click", retryExited);
      exitSession = null;
    },
    showExited,
    syncActiveExit() {
      const tab = getTabById(getActiveTabId());
      const session = tab?.panes.get(tab.activePaneId);
      if (session?.terminalExitRetained && exitMessages.has(session)) {
        return showExited(session, exitMessages.get(session), true);
      }
      if (exitSession && !isActive(exitSession)) {
        exitSession = null;
        hideStartupErrorPanel();
      }
      return false;
    },
    invalidate,
    isGenericFallback,
    isRetryable: isRetryableTerminalStartupError,
    show,
    writeError,
  });
}
