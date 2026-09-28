import { readAllocationDiagnostics } from "./allocation_diagnostics.js";

export function createBackendWorkerRuntime({ scope, engine, queryText }) {
  let pending = Promise.resolve();
  let closed = false;
  let failed = false;
  const traceFor = (message, receivedAt) => {
    if (!message?.traceResize) return null;
    let previousPhase = "";
    return (phase, details = {}) => {
      const at = performance.now();
      try { scope.postMessage({ id: message.id, type: "operation-phase", operation: message.type, phase, previousPhase,
        workerAtMs: at, workerUnixMs: performance.timeOrigin + at, workerElapsedMs: at - receivedAt, ...details }); } catch {}
      previousPhase = phase;
    };
  };
  const handle = async (message, receivedAt, trace) => {
    if (closed || !Number.isSafeInteger(message?.id)) return;
    const { id, type, payload } = message;
    const startedAt = message.diagnostics ? performance.now() : 0;
    const timing = message.diagnostics ? {} : null;
    try {
      trace?.("worker_started", { workerQueueMs: performance.now() - receivedAt });
      if (failed) throw new Error("Terminal backend requires restart");
      let result;
      if (type === "init") result = await engine.init(payload, timing);
      else if (type === "write") result = engine.write(payload, timing);
      else if (type === "resize") result = engine.resize(payload, trace);
      else if (type === "snapshot") result = engine.snapshot(payload.viewportY, trace);
      else if (type === "restore") result = await engine.restore(payload, trace);
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
      trace?.("worker_reply", { revision: result?.revision });
      scope.postMessage({ id, result, ...(timing ? { timing } : {}) }, transfers);
    } catch (error) {
      const allocation = ["write", "resize"].includes(type) ? readAllocationDiagnostics(engine.native(), type) : null;
      trace?.("worker_failed", { error: error?.message || String(error), allocation });
      if (["init", "write", "resize", "snapshot", "restore"].includes(type)) failed = true;
      if (timing) {
        timing.workerQueueMs = startedAt - receivedAt;
        timing.workerExecutionMs = performance.now() - startedAt;
      }
      scope.postMessage({ id, error: error?.message || String(error), code: error?.code, fatal: failed, allocation, ...(timing ? { timing } : {}) });
    }
  };
  const onMessage = (event) => {
    const receivedAt = event.data?.diagnostics || event.data?.traceResize ? performance.now() : 0;
    const trace = traceFor(event.data, receivedAt);
    trace?.("worker_received");
    // Native terminal mutations and observations share one ordered command lane.
    pending = pending.then(() => handle(event.data, receivedAt, trace)).catch((error) => {
      failed = true;
      scope.postMessage({ error: error?.message || String(error), fatal: true });
    });
  };
  return Object.freeze({
    start() { scope.addEventListener("message", onMessage); },
    dispose() { closed = true; scope.removeEventListener("message", onMessage); engine.dispose(); },
  });
}
