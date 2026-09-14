export function createBackendWorkerRuntime({ scope, engine, queryText }) {
  let pending = Promise.resolve();
  let closed = false;
  let failed = false;
  const handle = async (message, receivedAt) => {
    if (closed || !Number.isSafeInteger(message?.id)) return;
    const { id, type, payload } = message;
    const startedAt = message.diagnostics ? performance.now() : 0;
    const timing = message.diagnostics ? {} : null;
    try {
      if (failed) throw new Error("Terminal backend requires restart");
      let result;
      if (type === "init") result = await engine.init(payload, timing);
      else if (type === "write") result = engine.write(payload, timing);
      else if (type === "resize") result = engine.resize(payload);
      else if (type === "snapshot") result = engine.snapshot(payload.viewportY);
      else if (type === "restore") result = await engine.restore(payload);
      else if (type === "diagnose") result = engine.diagnose();
      else if (type === "read") result = engine.read(payload);
      else if (type === "text" || type === "search" || type === "link") {
        const identity = engine.historyIdentity();
        let options = payload;
        if (type === "link") {
          if (payload.historyEpoch !== identity.epoch) throw new Error("Terminal geometry changed during link lookup");
          options = { ...payload, row: payload.row + payload.historyBase - identity.base };
        }
        if (payload.range) {
          if (payload.historyEpoch !== identity.epoch) throw Object.assign(new Error("Terminal geometry changed during selection read"), { code: "HISTORY_CHANGED" });
          const offset = payload.historyBase - identity.base;
          const range = { ...payload.range, startRow: payload.range.startRow + offset, endRow: payload.range.endRow + offset };
          if (range.startRow < 0) throw Object.assign(new Error("Selected terminal history is no longer retained"), { code: "HISTORY_CHANGED" });
          options = { ...payload, range };
        }
        result = queryText(engine.native(), type, options);
      }
      else throw new Error(`Unknown terminal backend command: ${type}`);
      const transfers = [];
      if (result?.viewport) transfers.push(result.viewport.bytes.buffer, result.history.packet.bytes.buffer);
      else if (result?.packet) transfers.push(result.packet.bytes.buffer);
      if (timing) {
        timing.workerQueueMs = startedAt - receivedAt;
        timing.workerExecutionMs = performance.now() - startedAt;
      }
      scope.postMessage({ id, result, ...(timing ? { timing } : {}) }, transfers);
    } catch (error) {
      if (["init", "write", "resize", "snapshot", "restore"].includes(type)) failed = true;
      if (timing) {
        timing.workerQueueMs = startedAt - receivedAt;
        timing.workerExecutionMs = performance.now() - startedAt;
      }
      scope.postMessage({ id, error: error?.message || String(error), code: error?.code, fatal: failed, ...(timing ? { timing } : {}) });
    }
  };
  const onMessage = (event) => {
    const receivedAt = event.data?.diagnostics ? performance.now() : 0;
    // Native terminal mutations and observations share one ordered command lane.
    pending = pending.then(() => handle(event.data, receivedAt)).catch((error) => {
      failed = true;
      scope.postMessage({ error: error?.message || String(error), fatal: true });
    });
  };
  return Object.freeze({
    start() { scope.addEventListener("message", onMessage); },
    dispose() { closed = true; scope.removeEventListener("message", onMessage); engine.dispose(); },
  });
}
