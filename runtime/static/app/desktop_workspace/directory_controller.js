import { instanceSelector, instanceDisplayName, isRunningInstance } from "../../instances/index.js";

// The directory holds metadata only. It never creates a terminal or applies a
// background workspace to the active workspace's registry.
export function createDesktopWorkspaceDirectory({
  windowObject = globalThis.window,
  getInstances = () => [],
  loadInstances = async () => {},
  getActiveName = () => "",
  getOrderedTabs = () => [],
  isVisible = () => false,
  onChange = () => {},
  releasePreview = () => {},
} = {}) {
  const records = new Map();
  const requests = new Set();
  const inspections = new Map();
  let disposed = false;
  let inflight = null;
  let timer = 0;
  let epoch = 0;
  let inspectionSlots = 0;
  const inspectionWaiters = [];

  const release = (record) => {
    for (const tab of record?.tabs || []) {
      for (const pane of tab.panes.values()) releasePreview(pane);
    }
  };

  const accept = (selector, state) => {
    if (disposed || !selector || (state.selector && state.selector !== selector)) return;
    const previous = records.get(selector);
    const generation = String(state.workspace_generation || "");
    const priorPanes = new Map((previous?.tabs || []).flatMap((tab) => [...tab.panes.values()]
      .map((pane) => [`${tab.id}/${pane.id}`, pane])));
    const tabs = (state.tabs || []).map((tab) => ({
      id: tab.id,
      label: tab.label || tab.id,
      layout: tab.layout,
      activePaneId: tab.active_pane_id,
      panes: new Map((tab.panes || []).map((pane) => {
        const key = `${tab.id}/${pane.id}`;
        const prior = priorPanes.get(key);
        const item = prior?.workspaceGeneration === generation ? prior : {
          id: pane.id, name: selector, tabId: tab.id, workspaceGeneration: generation,
        };
        if (item === prior) priorPanes.delete(key);
        return [pane.id, Object.assign(item, { terminalExited: pane.exited === true })];
      })),
    }));
    for (const pane of priorPanes.values()) releasePreview(pane);
    records.set(selector, { tabs, version: (previous?.version || 0) + 1, error: "" });
    onChange();
  };

  const groups = () => getInstances().map((instance) => {
    const selector = instanceSelector(instance);
    const record = records.get(selector);
    const active = selector === getActiveName();
    return {
      selector,
      name: instanceDisplayName(instance),
      running: isRunningInstance(instance),
      active,
      tabs: active ? getOrderedTabs() : record?.tabs || [],
      loaded: Array.isArray(record?.tabs) || (active && getOrderedTabs().length > 0),
      error: record?.error || "",
    };
  }).filter((group) => group.selector);

  const inspectOnce = async (selector, runEpoch) => {
    const version = records.get(selector)?.version || 0;
    const abort = new AbortController();
    requests.add(abort);
    const timeout = windowObject.setTimeout(() => abort.abort(), 12000);
    try {
      const url = new URL("./api/workspace", windowObject.location.href);
      url.searchParams.set("name", selector);
      url.searchParams.set("inspect", "1");
      const response = await windowObject.fetch(url, { cache: "no-store", signal: abort.signal });
      if (!response.ok) {
        const error = new Error(response.status === 409
          ? "终端服务需更新，请打开实例后更新"
          : "会话加载失败，点击重试");
        throw error;
      }
      const state = await response.json();
      if (!Array.isArray(state.tabs) || state.selector !== selector) throw new Error("会话数据无效，点击重试");
      if (!disposed && epoch === runEpoch && selector !== getActiveName()
        && (records.get(selector)?.version || 0) === version) accept(selector, state);
    } catch (error) {
      if (!disposed && epoch === runEpoch && selector !== getActiveName()
        && (records.get(selector)?.version || 0) === version) {
        records.set(selector, { ...records.get(selector), version, error: error.name === "AbortError"
          ? "会话加载超时，点击重试" : error.message });
        onChange();
      }
    } finally {
      windowObject.clearTimeout(timeout);
      requests.delete(abort);
    }
  };

  const inspect = (selector, runEpoch = epoch) => {
    if (inspections.has(selector)) return inspections.get(selector);
    const promise = (async () => {
      if (inspectionSlots < 3) inspectionSlots += 1;
      else await new Promise((resolve) => inspectionWaiters.push(resolve));
      try {
        if (!disposed && runEpoch === epoch) await inspectOnce(selector, runEpoch);
      } finally {
        const next = inspectionWaiters.shift();
        if (next) next();
        else inspectionSlots -= 1;
      }
    })().finally(() => inspections.delete(selector));
    inspections.set(selector, promise);
    return promise;
  };

  const refresh = ({ reloadInstances = false } = {}) => {
    if (disposed || !isVisible() || windowObject.document?.hidden) return Promise.resolve();
    if (inflight) return inflight;
    const runEpoch = epoch;
    inflight = (async () => {
      if (reloadInstances) await loadInstances();
      if (disposed || epoch !== runEpoch) return;
      const available = new Set(getInstances().map(instanceSelector));
      for (const [selector, record] of records) {
        if (!available.has(selector)) {
          release(record);
          records.delete(selector);
        }
      }
      const queue = groups().filter((group) => group.running && !group.active).map((group) => group.selector);
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length && !disposed && epoch === runEpoch && isVisible()) {
          await inspect(queue.shift(), runEpoch);
        }
      }));
    })().catch(() => {}).finally(() => {
      inflight = null;
      onChange();
      if (!disposed && runEpoch !== epoch && isVisible()) refresh();
    });
    return inflight;
  };

  return Object.freeze({
    accept,
    groups,
    refresh,
    async ensureLoaded(selector) {
      if (!groups().find((group) => group.selector === selector)?.loaded) await inspect(selector);
      return groups().find((group) => group.selector === selector);
    },
    sync() {
      windowObject.clearTimeout(timer);
      timer = 0;
      if (disposed) return;
      onChange();
      if (!isVisible()) {
        epoch += 1;
        for (const request of requests) request.abort();
        return;
      }
      refresh();
      const poll = () => {
        if (disposed || !isVisible()) return;
        refresh({ reloadInstances: true });
        timer = windowObject.setTimeout(poll, 15000);
      };
      timer = windowObject.setTimeout(poll, 15000);
    },
    dispose() {
      disposed = true;
      epoch += 1;
      windowObject.clearTimeout(timer);
      for (const request of requests) request.abort();
      for (const record of records.values()) release(record);
      records.clear();
    },
  });
}
