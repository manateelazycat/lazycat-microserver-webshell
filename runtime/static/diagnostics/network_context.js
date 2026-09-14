// Read-only adapter between terminal session state and diagnostics.
// It intentionally returns a fresh snapshot and never mutates a session.
export function createDiagnosticsNetworkContext({
  getActiveName = () => "",
  getTabs = () => [],
  isOnline = () => true,
} = {}) {
  return function getNetworkContext() {
    const activeName = String(getActiveName() || "").trim();
    const sessions = [];
    let retrying = false;

    for (const tab of getTabs() || []) {
      for (const pane of tab?.panes?.values?.() || []) {
        if (pane?.closed || pane?.name !== activeName) {
          continue;
        }
        retrying ||= pane.connectionRetrying === true;
        sessions.push({
          sessionId: String(pane.id || ""),
          tabId: String(tab.id || pane.tabId || ""),
          socket: (pane.connectionChannel === "fast" || pane.connectionChannel === "unified")
            && Number(pane.socket?.readyState) < 3
            ? pane.socket
            : null,
        });
      }
    }

    return {
      online: isOnline() !== false,
      retrying,
      sessions,
    };
  };
}
