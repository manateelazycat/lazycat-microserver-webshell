import { instanceSelector, instanceDisplayName, isClientInstanceName, isRunningInstance } from "../../instances/index.js";
import { updateDesktopSessionActivity, updateDesktopProgramStatus, syncDesktopSessionNotification } from "./session_notifications.js";
import { createProgramStatusObserver } from "./program_status.js";

// The directory holds metadata only. It never creates a terminal or applies a
// background workspace to the active workspace's registry.
export function createDesktopWorkspaceDirectory({
  windowObject = globalThis.window,
  getInstances = () => [],
  loadInstances = async () => {},
  getActiveName = () => "",
  getActiveGeneration = () => 0,
  getActiveTabId = () => "",
  getOrderedTabs = () => [],
  isVisible = () => false,
  isViewingTerminal = () => true,
  onChange = () => {},
  releasePreview = () => {},
} = {}) {
  const records = new Map();
  const programObservers = new WeakMap();
  const requests = new Set();
  const inspections = new Map();
  const retryWaiters = new Set();
  const retryDelays = [250, 750, 1500, 3000];
  let disposed = false;
  let timer = 0;
  let epoch = 0;
  let appliedTarget = null;
  let inspectionSlots = 0;
  const inspectionWaiters = [];

  const canLoad = () => !disposed && isVisible() && !windowObject.document?.hidden;
  const canInspect = (selector, runEpoch) => canLoad() && epoch === runEpoch
    && selector !== getActiveName()
    && getInstances().some((instance) => instanceSelector(instance) === selector && isRunningInstance(instance));

  const waitForRetry = (delay) => new Promise((resolve) => {
    const finish = (ready) => {
      windowObject.clearTimeout(timeout);
      retryWaiters.delete(cancel);
      resolve(ready);
    };
    const cancel = () => finish(false);
    const timeout = windowObject.setTimeout(() => finish(true), delay);
    retryWaiters.add(cancel);
  });

  const release = (record) => {
    for (const tab of record?.tabs || []) {
      for (const pane of tab.panes.values()) releasePreview(pane);
    }
  };

  const isActiveReady = () => appliedTarget?.selector === getActiveName()
    && appliedTarget.generation === getActiveGeneration();
  const canRead = () => !windowObject.document?.hidden && isViewingTerminal();
  const isReadTab = (selector, tabId) => canRead() && selector === getActiveName() && tabId === getActiveTabId();

  const syncActiveNotifications = (selector = getActiveName(), { leaving = false } = {}) => {
    if (disposed || appliedTarget?.selector !== selector || (!leaving && !isActiveReady())) return;
    const record = records.get(selector);
    const liveTabs = new Map(getOrderedTabs().map((tab) => [tab.id, tab]));
    for (const tab of record?.tabs || []) {
      const live = liveTabs.get(tab.id);
      if (!live || [...live.panes.values()].some((pane) => pane.name !== selector
        || (pane.workspaceGeneration && pane.workspaceGeneration !== record.generation))) continue;
      syncDesktopSessionNotification(tab, live, { read: canRead() && tab.id === getActiveTabId() });
    }
  };

  const accept = (selector, state, { active = false } = {}) => {
    if (disposed || !selector || (state.selector && state.selector !== selector)) return;
    const previous = records.get(selector);
    const generation = String(state.workspace_generation || "");
    const priorTabs = new Map((previous?.generation === generation ? previous.tabs : []).map((tab) => [tab.id, tab]));
    const priorPanes = new Map((previous?.tabs || []).flatMap((tab) => [...tab.panes.values()]
      .map((pane) => [`${tab.id}/${pane.id}`, pane])));
    const liveTabs = active ? new Map(getOrderedTabs().map((tab) => [tab.id, tab])) : new Map();
    const tabs = (state.tabs || []).map((tab) => {
      const item = {
        id: tab.id,
        label: tab.label || tab.id,
        layout: tab.layout,
        activePaneId: tab.active_pane_id,
        hasNotification: priorTabs.get(tab.id)?.hasNotification === true,
        panes: new Map(),
      };
      const read = active && isReadTab(selector, tab.id);
      for (const pane of tab.panes || []) {
        const key = `${tab.id}/${pane.id}`;
        const prior = priorPanes.get(key);
        const cached = prior?.workspaceGeneration === generation ? prior : {
          id: pane.id, name: selector, tabId: tab.id, workspaceGeneration: generation,
        };
        if (cached === prior) priorPanes.delete(key);
        updateDesktopSessionActivity(item, cached, pane, { read });
        item.panes.set(pane.id, cached);
      }
      syncDesktopSessionNotification(item, liveTabs.get(tab.id), { read });
      return item;
    });
    for (const pane of priorPanes.values()) releasePreview(pane);
    records.set(selector, { tabs, generation, capabilities: state.agent_capabilities || [], version: (previous?.version || 0) + 1, error: "" });
    if (active && selector === getActiveName()) {
      appliedTarget = { selector, generation: getActiveGeneration() };
    }
    onChange();
  };

  const groups = () => getInstances().map((instance) => {
    const selector = instanceSelector(instance);
    const record = records.get(selector);
    const active = selector === getActiveName();
    const liveReady = active && isActiveReady();
    const tabs = liveReady ? getOrderedTabs() : record?.tabs || [];
    const loaded = liveReady || Array.isArray(record?.tabs);
    const pending = active ? !liveReady : inspections.has(selector);
    const error = active && !liveReady ? "" : record?.error || "";
    const retrying = record?.retrying === true;
    const running = isRunningInstance(instance);
    // A routine refresh of confirmed metadata is not a new connection.
    const connecting = running && !error && (retrying || !loaded || (active && !liveReady));
    const message = running ? error : "";
    return {
      selector,
      name: instanceDisplayName(instance),
      running,
      active,
      tabs,
      loaded,
      pending,
      error,
      retrying,
      connecting,
      message,
      canReorder: record?.capabilities?.includes("tab_reorder_anchor") === true,
    };
  }).filter((group) => group.selector);

  const inspectOnce = async (selector) => {
    const abort = new AbortController();
    requests.add(abort);
    // A physical client resolves a ticket and a device gateway before its
    // terminal HTTP request (which itself allows 30 seconds) can complete.
    const timeout = windowObject.setTimeout(() => abort.abort(), isClientInstanceName(selector) ? 45000 : 12000);
    try {
      const url = new URL("./api/workspace", windowObject.location.href);
      url.searchParams.set("name", selector);
      url.searchParams.set("inspect", "1");
      const response = await windowObject.fetch(url, { cache: "no-store", signal: abort.signal });
      if (!response.ok) {
        let protocolUpdateRequired = false;
        if (response.status === 409 && !isClientInstanceName(selector)) {
          try { protocolUpdateRequired = (await response.json()).agent_protocol_update_required === true; } catch {}
        }
        const error = new Error(protocolUpdateRequired ? "终端服务需更新，请打开实例后更新"
          : response.status === 401 || response.status === 403 ? "会话访问权限已失效，请重新登录"
            : "会话暂时不可用，点击重试");
        error.retryable = !protocolUpdateRequired && (response.status >= 500 || [408, 409, 425, 429].includes(response.status));
        throw error;
      }
      const state = await response.json();
      if (!Array.isArray(state.tabs) || state.selector !== selector) {
        throw Object.assign(new Error("会话数据无效，点击重试"), { retryable: false });
      }
      return state;
    } finally {
      windowObject.clearTimeout(timeout);
      requests.delete(abort);
    }
  };

  const inspect = (selector, runEpoch = epoch) => {
    if (!canInspect(selector, runEpoch)) return Promise.resolve();
    const previous = inspections.get(selector);
    if (previous) {
      if (previous.epoch === runEpoch) return previous.promise;
      return previous.promise.then(() => inspect(selector, runEpoch));
    }
    const version = records.get(selector)?.version || 0;
    const isCurrent = () => canInspect(selector, runEpoch)
      && (records.get(selector)?.version || 0) === version;
    const promise = (async () => {
      let attempt = 0;
      while (isCurrent()) {
        let failure = null;
        // Release the request slot before waiting to retry, so one instance's
        // cold startup does not hold back the other instances' session lists.
        if (inspectionSlots < 3) inspectionSlots += 1;
        else await new Promise((resolve) => inspectionWaiters.push(resolve));
        try {
          if (!isCurrent()) return;
          const state = await inspectOnce(selector);
          if (isCurrent()) accept(selector, state);
          return;
        } catch (error) {
          failure = error;
        } finally {
          const next = inspectionWaiters.shift();
          if (next) next();
          else inspectionSlots -= 1;
        }
        if (!isCurrent()) return;
        const retrying = failure.retryable !== false;
        records.set(selector, {
          ...records.get(selector), version, retrying,
          error: retrying ? "" : failure.message,
        });
        onChange();
        // After the short retry burst, the normal refresh continues recovery.
        // Keep the loading state and any existing sessions instead of flashing
        // an error that asks the user to restart a temporary connection.
        if (!retrying || attempt >= retryDelays.length) return;
        if (!await waitForRetry(retryDelays[attempt++])) return;
      }
    })().finally(() => {
      if (inspections.get(selector)?.promise === promise) inspections.delete(selector);
      onChange();
    });
    inspections.set(selector, { epoch: runEpoch, promise });
    onChange();
    return promise;
  };

  const refresh = ({ reloadInstances = false } = {}) => {
    if (!canLoad()) return Promise.resolve();
    const runEpoch = epoch;
    return (async () => {
      if (reloadInstances) await loadInstances();
      if (!canLoad() || epoch !== runEpoch) return;
      const available = new Set(getInstances().map(instanceSelector));
      for (const [selector, record] of records) {
        if (!available.has(selector)) {
          release(record);
          records.delete(selector);
        }
      }
      const queue = groups().filter((group) => group.running && !group.active);
      await Promise.all(queue.map((group) => inspect(group.selector, runEpoch)));
    })().catch(() => {}).finally(() => {
      onChange();
    });
  };

  return Object.freeze({
    accept,
    groups,
    isActiveReady,
    syncActiveNotifications,
    hasNotifications: () => [...records.values()].some((record) => record.tabs?.some((tab) => tab.hasNotification)),
    markSessionOutput(session, data) {
      if (disposed || !data || !isActiveReady() || session.name !== getActiveName()) return;
      const record = records.get(session.name);
      const tab = record?.tabs?.find((item) => item.id === session.tabId);
      const pane = tab?.panes.get(session.id);
      const live = getOrderedTabs().find((item) => item.id === session.tabId);
      if (!pane || pane.programStatusSupported || live?.panes.get(session.id) !== session
        || (session.workspaceGeneration && session.workspaceGeneration !== record.generation)) return;
      let observer = programObservers.get(session);
      if (!observer || observer.generation !== session.historyGeneration) {
        observer = { generation: session.historyGeneration, parser: createProgramStatusObserver(pane) };
        programObservers.set(session, observer);
      }
      const status = observer.parser.write(data);
      if (!status.changed) return;
      const read = isReadTab(session.name, tab.id);
      updateDesktopProgramStatus(tab, pane, status, { read, metadata: false });
      syncDesktopSessionNotification(tab, live, { read });
      onChange();
    },
    updateActivePane(session, state) {
      if (disposed || !isActiveReady() || session.name !== getActiveName()) return;
      const record = records.get(session.name);
      if (session.workspaceGeneration && session.workspaceGeneration !== record?.generation) return;
      const tab = record?.tabs?.find((item) => item.id === session.tabId);
      const pane = tab?.panes.get(session.id);
      const live = getOrderedTabs().find((item) => item.id === session.tabId);
      if (!pane || !live || live.panes.get(session.id) !== session) return;
      const read = isReadTab(session.name, tab.id);
      updateDesktopSessionActivity(tab, pane, state, { read });
      syncDesktopSessionNotification(tab, live, { read });
      onChange();
    },
    clearNotification(tabId) {
      if (disposed || !isActiveReady() || !isReadTab(getActiveName(), tabId)) return;
      const tab = records.get(getActiveName())?.tabs?.find((item) => item.id === tabId);
      if (!tab) return;
      syncDesktopSessionNotification(tab, getOrderedTabs().find((item) => item.id === tabId), { read: true });
      onChange();
    },
    refresh,
    retry(selector) {
      const record = records.get(selector);
      if (record) records.set(selector, { ...record, error: "", retrying: true });
      onChange();
      return inspect(selector);
    },
    async ensureLoaded(selector) {
      if (!groups().find((group) => group.selector === selector)?.loaded) await inspect(selector);
      return groups().find((group) => group.selector === selector);
    },
    sync() {
      windowObject.clearTimeout(timer);
      timer = 0;
      if (disposed) return;
      onChange();
      if (!canLoad()) {
        epoch += 1;
        for (const request of requests) request.abort();
        for (const cancel of retryWaiters) cancel();
        return;
      }
      refresh();
      const poll = () => {
        if (!canLoad()) return;
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
      for (const cancel of retryWaiters) cancel();
      for (const record of records.values()) release(record);
      records.clear();
    },
  });
}
