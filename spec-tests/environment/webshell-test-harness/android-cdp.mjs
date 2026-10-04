export async function connectLightOSPage(endpoint) {
  const targetsResponse = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(10_000) });
  if (!targetsResponse.ok) throw new Error("LightOS WebView targets are unavailable");
  const targets = await targetsResponse.json();
  const pages = targets.filter((item) => item.type === "page" &&
    ["/webshell/", "/webshell"].includes(new URL(item.url).pathname));
  if (pages.length !== 1 || !pages[0].webSocketDebuggerUrl) {
    throw new Error("Expected one LightOS WebShell page in the installed Android app");
  }
  const address = new URL(pages[0].webSocketDebuggerUrl);
  address.host = new URL(endpoint).host;
  const socket = new WebSocket(address);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Android WebView CDP connection timed out")), 10_000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Android WebView CDP connection failed")); }, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  const failAll = (message) => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
    pending.clear();
  };
  socket.addEventListener("message", (event) => {
    let response;
    try { response = JSON.parse(event.data); } catch { return; }
    if (response.method) {
      for (const listener of listeners.get(response.method) || []) {
        Promise.resolve().then(() => listener(response.params || {})).catch(() => {});
      }
    }
    if (!response.id || !pending.has(response.id)) return;
    const request = pending.get(response.id);
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.error) request.reject(new Error(`Android CDP ${request.method}: ${response.error.message}`));
    else request.resolve(response.result);
  });
  socket.addEventListener("close", () => failAll("Android WebView CDP connection closed"));
  const send = (method, params = {}, timeout = 15_000) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error("Android WebView CDP is closed")); return; }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Android CDP ${method} timed out`));
    }, timeout);
    pending.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await Promise.all([send("Runtime.enable"), send("Page.enable")]);
  return {
    target: { id: pages[0].id, url: pages[0].url, title: pages[0].title },
    send,
    on(method, listener) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(listener);
      return () => listeners.get(method)?.delete(listener);
    },
    async evaluate(fn, ...args) {
      const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, 30_000);
      if (result.exceptionDetails) {
        throw new Error(`Android page evaluation failed: ${result.exceptionDetails.text || "unknown"}`);
      }
      return result.result?.value;
    },
    async waitFor(fn, args = [], timeout = 15_000) {
      const deadline = Date.now() + timeout;
      do {
        try {
          const value = await this.evaluate(fn, ...args);
          if (value) return value;
        } catch (error) {
          if (!/context.*destroyed|Cannot find context|inspected target navigated/i.test(error.message)) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      } while (Date.now() < deadline);
      throw new Error("Android page condition was not observed before the deadline");
    },
    async navigate(url) {
      const result = await send("Page.navigate", { url }, 30_000);
      if (result.errorText) throw new Error(`Android WebView navigation failed: ${result.errorText}`);
      await this.waitFor((expected) => location.href === expected && document.readyState === "complete", [url], 30_000);
    },
    async close() {
      failAll("Android CDP session closed");
      socket.close();
    },
  };
}
