// Account-scoped instance order only. Terminal/tab order belongs to its existing
// workspace owner; this module talks exclusively to the Provider's public bridge.
export function createInstanceOrderController({
  windowObject = globalThis.window,
  getAvailableSelectors = () => [],
  onChange = () => {},
} = {}) {
  let selectors = [];
  let disposed = false;
  let revision = 0;
  let reading = null;
  let saving = false;
  const requests = new Set();
  const request = async (move) => {
    const abort = new AbortController();
    requests.add(abort);
    const timer = windowObject.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await windowObject.fetch("./api/instance-order", {
        method: move ? "POST" : "GET", cache: "no-store", signal: abort.signal,
        headers: move ? { "Content-Type": "application/json" } : { Accept: "application/json" },
        body: move ? JSON.stringify(move) : undefined,
      });
      if (!response.ok) throw new Error(`实例顺序保存服务不可用 (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data.selectors) || data.selectors.some((item) => typeof item !== "string" || !item)) {
        throw new Error("实例顺序响应无效");
      }
      return [...new Set(data.selectors)];
    } finally {
      windowObject.clearTimeout(timer);
      requests.delete(abort);
    }
  };
  return Object.freeze({
    getSelectors: () => selectors,
    isSaving: () => saving,
    refresh() {
      if (disposed || saving) return Promise.resolve();
      if (reading) return reading;
      const current = revision;
      const pending = request().then((next) => {
        if (disposed || current !== revision) return;
        if (JSON.stringify(selectors) !== JSON.stringify(next)) {
          selectors = next;
          onChange();
        }
      }).catch(() => {
        // A directory refresh must not discard confirmed order or block shells.
        // Explicit writes surface their errors to the initiating UI.
      }).finally(() => { if (reading === pending) reading = null; });
      reading = pending;
      return pending;
    },
    async move(selector, beforeSelector = "", afterSelector = "") {
      if (disposed || saving) throw new Error("实例顺序正在保存，请稍后再试");
      const prior = selectors;
      const current = ++revision;
      const order = [...new Set([...selectors, ...getAvailableSelectors()])].filter((item) => item !== selector);
      const index = beforeSelector ? order.indexOf(beforeSelector) : afterSelector ? order.indexOf(afterSelector) + 1 : order.length;
      if (index < 0 || (afterSelector && !order.includes(afterSelector))) throw new Error("实例已不可用，请刷新后重试");
      order.splice(index, 0, selector);
      selectors = order;
      saving = true;
      onChange();
      try {
        const next = await request({ selector, before_selector: beforeSelector, after_selector: afterSelector });
        if (!disposed && current === revision) selectors = next;
      } catch (error) {
        if (!disposed && current === revision) selectors = prior;
        throw error;
      } finally {
        saving = false;
        if (!disposed) onChange();
      }
    },
    dispose() {
      disposed = true;
      revision += 1;
      for (const request of requests) request.abort();
    },
  });
}
