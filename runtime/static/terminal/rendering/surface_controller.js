import { createTerminalSurfaceAdapter } from "./surface_adapter.js";

const surfacePixels = (session) => [session.term?.canvas, session.terminalFrameHold, session.terminalCursorLayer]
  .reduce((total, canvas) => total + (Number(canvas?.width) || 0) * (Number(canvas?.height) || 0), 0);

// Owns only UI drawing resources. Worker, transport, replay and PTY lifetimes
// remain with their existing owners, including while a surface is evicted.
export function createTerminalSurfaceController({
  TerminalCtor,
  RendererCtor,
  windowObject = globalThis.window,
  getActiveTabId = () => "",
  capturePreview = () => {},
  releaseHold = () => {},
  resetCursor = () => {},
  registerSessionCleanup = () => {},
  recentTabLimit = 2,
  retainedPixelLimit = 16 * 1024 * 1024,
} = {}) {
  const adapter = createTerminalSurfaceAdapter({ TerminalCtor, RendererCtor, windowObject });
  const sessions = new Set();
  let recentTabs = [];
  let activeTabId = "";
  let trimFrame = 0;
  let disposed = false;

  const evict = (session) => {
    adapter.setState(session.term, "released");
    resetCursor(session, { release: true });
    releaseHold(session);
  };
  const trim = () => {
    if (disposed) return;
    let pixels = 0;
    for (const id of recentTabs) {
      const panes = [...sessions].filter(s => !s.closed && s.tabId === id && s.tabId !== activeTabId);
      const size = panes.reduce((n, s) => n + surfacePixels(s), 0);
      if (pixels + size <= retainedPixelLimit) pixels += size;
      else for (const session of panes) evict(session);
    }
  };
  const scheduleTrim = () => {
    if (!disposed && !trimFrame) trimFrame = windowObject.requestAnimationFrame(() => {
      trimFrame = 0;
      trim();
    });
  };
  const sync = () => {
    for (const session of sessions) {
      if (session.closed) continue;
      if (session.tabId === activeTabId) {
        adapter.setState(session.term, "active");
      } else if (recentTabs.includes(session.tabId) && surfacePixels(session) > 0) {
        adapter.setState(session.term, "retained");
        resetCursor(session);
      } else if (adapter.state(session.term) !== "released" || surfacePixels(session) > 0) {
        evict(session);
      }
    }
    if (trimFrame) windowObject.cancelAnimationFrame(trimFrame);
    trimFrame = 0;
    trim();
  };

  return Object.freeze({
    prepare: adapter.prepare,
    scheduleTrim,
    installSession(session) {
      if (disposed || !session || session.closed) return;
      sessions.add(session);
      adapter.observe(session.term, scheduleTrim);
      activeTabId = getActiveTabId() || "";
      if (session.tabId === activeTabId) adapter.setState(session.term, "active");
      registerSessionCleanup(session, () => {
        adapter.observe(session.term, null);
        sessions.delete(session);
        evict(session);
        if (![...sessions].some(s => s.tabId === session.tabId)) recentTabs = recentTabs.filter(id => id !== session.tabId);
      });
    },
    beforeActivate(previousTab, nextTab) {
      if (disposed || previousTab?.id === nextTab?.id) return;
      // Preview capture copies to a bounded canvas synchronously; encoding
      // and storage may finish after the full-size source is released.
      for (const pane of previousTab?.panes?.values?.() || []) capturePreview(pane, { immediate: true });
    },
    activate(tab, previousTab) {
      if (disposed) return;
      activeTabId = tab?.id || "";
      if (previousTab?.id && previousTab.id !== activeTabId) {
        recentTabs = [previousTab.id, ...recentTabs.filter(id => id !== previousTab.id)];
      }
      recentTabs = recentTabs.filter(id => id !== activeTabId).slice(0, recentTabLimit);
      sync();
    },
    clear() {
      activeTabId = "";
      recentTabs = [];
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (trimFrame) windowObject.cancelAnimationFrame(trimFrame);
      trimFrame = 0;
      for (const session of sessions) {
        adapter.observe(session.term, null);
        evict(session);
      }
      sessions.clear();
      recentTabs = [];
    },
  });
}
