const events = new Set([
  "socket_connect", "socket_open", "socket_close", "history_replay_start", "history_replay_complete",
  "replay_batch_begin", "replay_batch_received", "replay_batch_applied", "replay_batch_interrupted",
  "replay_output_drained", "queue_turn_ack_pending", "queue_turn_ack_sent",
  "backend_rpc_start", "backend_rpc_complete", "backend_failed", "backend_restart",
  "full_render_start", "full_render_complete", "presentation_commit_complete", "render_blocked",
  "resize_native_start", "resize_native_complete", "screen_auto_refresh", "screen_auto_refresh_exhausted",
  "byte_io_receive", "byte_io_enqueue", "byte_io_batch_start", "byte_io_batch_complete",
  "byte_io_overload", "byte_io_discard", "byte_io_render",
]);
const fields = new Set([
  "bytes", "inputBytes", "wireBytes", "batchID", "entries", "queuedBytes", "queueEntries",
  "enqueueMs", "oldestQueueWaitMs", "newestQueueWaitMs", "coalesceMs", "writeAwaitMs", "cacheEnqueueMs", "renderCallMs",
  "operation", "requestID", "pendingRequests", "pendingBytes", "workerGeneration", "backendCount",
  "roundTripMs", "requestCopyMs", "postMessageMs", "workerQueueMs", "workerExecutionMs",
  "parseMs", "snapshotMs", "frameUnpackMs", "frameAcceptMs", "rpcTotalMs",
  "wasmLoadMs", "engineCreateMs", "durationMs", "replayDurationMs", "serverReplayDurationMs",
  "serverHistoryBytes", "serverHistoryChunks", "serverReplayFrames", "binaryMessages", "binaryBytes",
  "outputQueueBytes", "outputQueueEntries", "targetCursor", "startCursor", "endCursor",
  "syncMode", "replayOutput", "historySource", "aggregate", "reason", "error", "rendered", "attempt",
  "attempts", "current", "committed", "channel", "connectionEpoch", "code", "replayComplete",
  "canvasMatches", "measurable", "workerReady", "frameReady", "replayPhase", "stableReady", "openLatencyMs",
]);

// Separate from the deduplicated debug log: retain event order and exact byte counts.
export function createByteIOLog({ windowObject = globalThis.window, now = () => performance.now(),
  onChange = () => {}, maxEntries = 4000, maxCharacters = 2 * 1024 * 1024 } = {}) {
  const lines = [];
  let arrivals = new WeakMap();
  let enabled = false;
  let disposed = false;
  let timer = null;
  let characters = 0;
  let dropped = 0;
  let sequence = 0;
  let startedAt = "";
  const snapshot = () => ({ lines: lines.slice(-80), retained: lines.length, dropped });
  const refresh = () => { timer = null; onChange(snapshot()); };
  const schedule = () => {
    if (timer === null) timer = windowObject.setTimeout(refresh, 250);
  };
  return Object.freeze({
    isEnabled: () => enabled && !disposed,
    setEnabled(value) {
      const next = value === true && !disposed;
      if (next === enabled) return;
      enabled = next;
      arrivals = new WeakMap();
      if (!startedAt && enabled) startedAt = new Date().toISOString();
      if (!enabled && timer !== null) { windowObject.clearTimeout(timer); timer = null; }
      refresh();
    },
    record(session, type, details = {}) {
      if (!enabled || disposed || !session || !events.has(type)) return;
      const at = now();
      if (type === "history_replay_start") arrivals.delete(session);
      const record = {
        seq: ++sequence, atMs: Math.round(at * 10) / 10, event: type,
        target: session.name, tab: session.tabId, pane: session.id,
        connection: session.connectionEpoch, history: session.historyGeneration,
        worker: session.term?.wasmTerm?.generation,
        receivedCursor: String(session.receivedHistoryCursor ?? ""),
        appliedCursor: String(session.appliedHistoryCursor ?? ""),
        presentedCursor: String(session.presentedHistoryCursor ?? ""),
        queuedBytes: session.outputQueueSize || 0,
        cols: session.term?.cols, rows: session.term?.rows,
        serverCols: session.serverCols, serverRows: session.serverRows,
        backendCols: session.term?.wasmTerm?.cols, backendRows: session.term?.wasmTerm?.rows,
        canvasWidth: session.term?.canvas?.width, canvasHeight: session.term?.canvas?.height,
        viewportY: session.term?.viewportY,
        renderReady: session.renderReady, resizePending: session.resizeAckPending,
        resizeEpoch: session.appliedResizeEpoch,
        replayGeneration: session.terminalReplayGeneration, fitGeneration: session.measuredFitGeneration,
      };
      for (const [key, value] of Object.entries(details)) {
        if (!fields.has(key)) continue;
        if (typeof value === "number") record[key] = Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
        else if (typeof value === "boolean" || value === null) record[key] = value;
        else if (typeof value === "string" || typeof value === "bigint") record[key] = String(value).slice(0, 300);
      }
      if (type === "byte_io_receive") {
        const previous = arrivals.get(session);
        const same = previous?.connection === session.connectionEpoch;
        record.receiveGapMs = same ? Math.round((at - previous.at) * 100) / 100 : null;
        record.receiveSpanMs = same ? Math.round((at - previous.first) * 100) / 100 : 0;
        record.receivedBytesSinceEnabled = (same ? previous.bytes : 0) + Number(details.bytes || 0);
        arrivals.set(session, { connection: session.connectionEpoch, at, first: same ? previous.first : at,
          bytes: record.receivedBytesSinceEnabled });
      }
      const line = JSON.stringify(record);
      lines.push(line);
      characters += line.length;
      while (lines.length > maxEntries || characters > maxCharacters) {
        characters -= lines.shift().length;
        dropped += 1;
      }
      schedule();
    },
    snapshot,
    clipboardText() {
      return ["WebShell byte IO log v1", `Captured since: ${startedAt || "not enabled"}`,
        `Retained events: ${lines.length}; older events discarded: ${dropped}`,
        "Units: bytes, ms. atMs uses the page monotonic clock; no cross-clock subtraction.",
        "receiveGapMs/receiveSpanMs: browser delivery intervals, NOT pure network transfer time.",
        "Queue wait includes waiting for replay completion/resize/scheduling; parseMs includes WASM input copy and parsing.",
        "snapshotMs: worker snapshot preparation; workerExecutionMs includes parse+snapshot; workerQueueMs starts at the worker message handler (excludes an earlier blocked event loop).",
        "roundTripMs ends at UI reply arrival; frameUnpackMs/frameAcceptMs run afterwards; rpcTotalMs includes UI frame acceptance.",
        "cacheEnqueueMs covers synchronous history-cache enqueue/copy, not storage completion; renderCallMs covers the synchronous full-render call, not GPU display completion.",
        "rpcTotalMs and writeAwaitMs are elapsed waits, NOT main-thread blocking time. Timing fields can overlap; do not sum them.",
        "Opening capture mid-stream cannot reconstruct earlier events. Terminal contents are not recorded.", ...lines].join("\n");
    },
    dispose() {
      disposed = true;
      enabled = false;
      if (timer !== null) windowObject.clearTimeout(timer);
      timer = null;
      arrivals = new WeakMap();
      lines.length = 0;
      characters = 0;
    },
  });
}
