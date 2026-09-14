import { createReplayControlEvidence } from "./replay_control_evidence.js";
import { beginTerminalWriteComparison } from "./terminal_write_comparison.js";

const observedEvents = new Set([
  "history_replay_start", "history_replay_complete", "replay_output_drained", "render_blocked",
  "full_render_complete", "presentation_commit_complete", "resize_native_start", "resize_native_complete",
  "backend_failed", "backend_restart", "socket_close", "screen_auto_refresh", "screen_auto_refresh_exhausted",
  "presentation_ready_state", "presentation_retry_scheduled", "presentation_hold", "presentation_hold_cancel",
  "replay_batch_begin", "replay_batch_received", "replay_batch_applied", "replay_batch_interrupted",
  "state_checkpoint_restore_start", "state_checkpoint_restore_complete",
  "resize_request", "resize_ack", "resize_server_geometry_observed",
]);

export function createTerminalRenderCapture({ windowObject = globalThis.window,
  documentObject = globalThis.document, getContext = () => ({}), captureSession = () => ({}),
  onChange = () => {}, now = () => performance.now() } = {}) {
  const records = [];
  let enabled = false, started = false, disposed = false;
  let timer = null, viewTimer = null, sequence = 0, characters = 0, dropped = 0;
  let replayEvidence = new WeakMap(), firstFrames = new WeakMap();
  let liveEvidence = new WeakMap(), lifecycle = 0, captureID = 0, manualPending = null;
  const replayIdentity = (session) => `${session.connectionEpoch}:${session.terminalReplayGeneration}`;
  const evidenceFor = (session) => {
    const evidence = replayEvidence.get(session);
    return evidence?.identity === replayIdentity(session) ? evidence : null;
  };
  const beginEvidence = (session, expectedBytes = null, fromStart = false) => {
    const evidence = createReplayControlEvidence(expectedBytes, fromStart);
    evidence.identity = replayIdentity(session);
    replayEvidence.set(session, evidence);
    return evidence;
  };
  const snapshot = () => ({ lines: records.slice(-18).map((entry) => entry.summary), retained: records.length, dropped });
  const refresh = () => {
    if (viewTimer !== null) windowObject.clearTimeout(viewTimer);
    viewTimer = null;
    onChange(snapshot());
  };
  const append = (record, summary) => {
    const line = JSON.stringify({ seq: ++sequence, atMs: Math.round(now() * 10) / 10, ...record });
    records.push({ line, summary });
    characters += line.length;
    while (records.length > 2000 || characters > 2 * 1024 * 1024) {
      characters -= records.shift().line.length;
      dropped += 1;
    }
    if (viewTimer === null) viewTimer = windowObject.setTimeout(refresh, 250);
  };
  const capture = (reason = "manual", includePixels = true) => {
    if (!enabled || !started || disposed) return;
    if (includePixels && manualPending) return manualPending;
    const at = now();
    const id = ++captureID, token = lifecycle;
    const context = getContext();
    const sessions = Array.from(context.sessions || []).filter((session) => !session.closed && session.tabId === context.tab);
    const panes = sessions.map((session) => {
      try {
        const live = liveEvidence.get(session);
        return { ...captureSession(session, { includePixels }), replayEvidence: evidenceFor(session)?.snapshot(),
          liveOutputEvidence: live?.identity === replayIdentity(session) ? {
            ...live.scanner.snapshot(), baseCursor: live.baseCursor, endCursor: live.endCursor, startedAtMs: live.startedAtMs,
          } : null };
      }
      catch (error) { return { pane: session.id, captureError: error?.name || "capture_failed" }; }
    });
    append({ type: "snapshot", captureID: id, reason, tab: context.tab, target: context.target,
      autoScreenRefresh: context.autoScreenRefresh, documentHidden: documentObject.hidden,
      window: { width: windowObject.innerWidth, height: windowObject.innerHeight, dpr: windowObject.devicePixelRatio,
        visualWidth: windowObject.visualViewport?.width, visualHeight: windowObject.visualViewport?.height,
        visualScale: windowObject.visualViewport?.scale },
      paneCount: panes.length, includePixels, captureDurationMs: Math.round((now() - at) * 100) / 100, panes,
    }, `[${Math.round(at)}ms] ${reason} tab=${context.tab || "none"} panes=${panes.length}\n`
      + panes.map((pane) => `${pane.pane}: ready=${pane.renderReady} current=${pane.presentationCurrent}`
        + ` frameReady=${pane.backend?.frameReady} queue=${pane.outputQueueBytes ?? "?"}`
        + ` grid=${pane.terminal?.cols}x${pane.terminal?.rows} pixels=${pane.canvasPixels?.status || "not sampled"}`).join("\n"));
    if (!includePixels) return;
    const promise = Promise.all(sessions.map(async (session) => {
      const connection = session.connectionEpoch, worker = session.term?.wasmTerm;
      let result;
      try { result = await worker?.captureRenderEvidence?.() || { status: "unsupported" }; }
      catch (error) { result = { status: "unavailable", error: String(error?.message || error).slice(0, 200) }; }
      if (token !== lifecycle || !enabled || disposed) return;
      const stale = session.closed || session.connectionEpoch !== connection || session.term?.wasmTerm !== worker;
      append({ type: "cell_evidence", captureID: id, reason, tab: session.tabId, pane: session.id,
        connection, stale, ...result }, `[${Math.round(now())}ms] ${session.id} 单元格对照 capture=${id}`
        + ` raw/cache=${JSON.stringify(result.worker?.rawVsCached || result.status)}`
        + ` UI/cache=${JSON.stringify(result.uiVsWorker)} stale=${Boolean(stale)}`);
    })).finally(() => { if (manualPending === promise) manualPending = null; });
    manualPending = promise;
    return promise;
  };
  const stopTimers = () => {
    if (timer !== null) windowObject.clearTimeout(timer);
    if (viewTimer !== null) windowObject.clearTimeout(viewTimer);
    timer = viewTimer = null;
  };
  const arm = () => {
    if (!enabled || !started || disposed || documentObject.hidden || timer !== null) return;
    timer = windowObject.setTimeout(() => {
      timer = null;
      try { capture("periodic", false); } finally { arm(); }
    }, 1000);
  };
  const visibility = () => { stopTimers(); arm(); };
  return Object.freeze({
    setEnabled(value) {
      const next = value === true && !disposed;
      if (enabled === next) return;
      enabled = next;
      lifecycle += 1;
      manualPending = null;
      replayEvidence = new WeakMap();
      liveEvidence = new WeakMap();
      firstFrames = new WeakMap();
      stopTimers();
      documentObject[enabled ? "addEventListener" : "removeEventListener"]("visibilitychange", visibility);
      if (started && enabled) capture("enabled", false);
      arm();
      refresh();
    },
    start() {
      if (started || disposed) return;
      started = true;
      arm();
    },
    record(session, event, details = {}) {
      if (!enabled || disposed || !observedEvents.has(event) || !session) return;
      const context = getContext();
      if (session.tabId !== context.tab) return;
      if (event === "history_replay_start") {
        beginEvidence(session, Number.isFinite(details.serverHistoryBytes) ? details.serverHistoryBytes : null, true);
        firstFrames.delete(session);
      }
      if (event === "history_replay_complete") evidenceFor(session)?.finish();
      const metadata = {};
      for (const key of ["reason", "rendered", "attempt", "current", "committed", "durationMs", "code",
        "syncMode", "historyGeneration", "serverBaseCursor", "serverEndCursor", "deltaFromCursor", "deltaToCursor",
        "serverHistoryBytes", "serverHistoryChunks", "replayBurstBytes", "bytes", "targetCursor", "aggregate",
        "resizeEpoch", "cols", "rows", "replayDurationMs", "serverReplayDurationMs",
        "recoveryBaseline", "checkpointMemoryBytes", "memoryBytes", "cursor"]) {
        const value = details[key];
        if (["string", "number", "boolean"].includes(typeof value)) metadata[key] = typeof value === "string" ? value.slice(0, 200) : value;
      }
      for (const key of ["targetSize", "terminalSize", "requestedSize", "serverSize"]) {
        if (details[key]) metadata[key] = { cols: details[key].cols, rows: details[key].rows };
      }
      if (event === "history_replay_start" && /^\d+$/.test(String(details.serverBaseCursor || ""))) {
        metadata.historyPrefixDiscarded = BigInt(details.serverBaseCursor) > 0n;
      }
      append({ type: "event", event, tab: session.tabId, pane: session.id, connection: session.connectionEpoch,
        worker: session.term?.wasmTerm?.generation, renderReady: session.renderReady,
        receivedCursor: String(session.receivedHistoryCursor ?? ""), appliedCursor: String(session.appliedHistoryCursor ?? ""),
        presentedCursor: String(session.presentedHistoryCursor ?? ""), ...metadata,
        ...(event === "history_replay_complete" ? { replayEvidence: evidenceFor(session)?.snapshot() } : {}),
      }, `[${Math.round(now())}ms] ${session.id} ${event} ${JSON.stringify(metadata)}`);
      const identity = `${session.connectionEpoch}:${session.terminalReplayGeneration}`;
      const firstCommit = event === "presentation_commit_complete" && firstFrames.get(session) !== identity;
      if (firstCommit) firstFrames.set(session, identity);
      if (firstCommit || ["history_replay_start", "replay_output_drained", "screen_auto_refresh"].includes(event)) {
        capture(`${event}:${session.id}`, false);
      }
    },
    observeOutput(session, data, { replayOutput, historySource, startCursor, endCursor } = {}) {
      if (!enabled || disposed || session?.tabId !== getContext().tab || !(data instanceof Uint8Array)) return;
      if (replayOutput) {
        if (historySource === "server") (evidenceFor(session) || beginEvidence(session)).consume(data);
        return;
      }
      const identity = replayIdentity(session);
      let live = liveEvidence.get(session);
      const start = startCursor == null ? null : String(startCursor);
      if (!live || live.identity !== identity || (start !== null && live.endCursor !== start)) {
        live = { identity, baseCursor: start, endCursor: start, startedAtMs: now(),
          scanner: createReplayControlEvidence(null, false, { source: "live_output_before_kitty", tailLimit: 96 }) };
        liveEvidence.set(session, live);
      }
      live.scanner.consume(data);
      live.endCursor = endCursor == null ? null : String(endCursor);
    },
    capture,
    beginWrite(session, data, options) {
      const token = lifecycle, connection = session?.connectionEpoch, backend = session?.term?.wasmTerm;
      const isActive = () => enabled && started && !disposed && token === lifecycle && !session?.closed
        && session?.tabId === getContext().tab && session.connectionEpoch === connection && session.term?.wasmTerm === backend;
      if (!isActive() || !session.term || !backend?.isRemote) return;
      const receivedCursor = String(session.receivedHistoryCursor ?? ""), appliedCursor = String(session.appliedHistoryCursor ?? "");
      return beginTerminalWriteComparison(session.term, data, isActive, (comparison) => {
        append({ type: "write_byte_comparison", pane: session.id, tab: session.tabId, connection,
          worker: backend.generation, receivedCursor, appliedCursor, ...options, ...comparison },
        `[${Math.round(now())}ms] ${session.id} 字节对照 equal=${comparison.equal ?? "unknown"}`
          + ` source=${comparison.source?.bytes ?? "?"} parser=${comparison.parser?.bytes ?? "?"}`
          + ` extraCR=${comparison.insertedCR ?? "?"} convertEol=${comparison.convertEol}`);
      });
    },
    async clipboardText() {
      await capture("copy", true);
      if (!enabled || disposed) return "";
      return ["WebShell terminal render capture v4", `Copied at: ${new Date().toISOString()}`,
        `Retained records: ${records.length}; older records discarded: ${dropped}`,
        "Snapshots include every non-closed pane in the active tab at capture time. Earlier tab records remain labelled.",
        "Periodic capture uses UI caches. Manual/copy/download adds a read-only Worker RPC; no update/markClean/resize/replay/repair. Auto refresh remains independent.",
        "cell_evidence links to snapshot by captureID. Worker raw and cached cells are read together; UI comparison requires matching revision and geometry.",
        "Cell rows are zero-based. shape: .=blank a=ASCII u=non-ASCII g=grapheme W=wide _=spacer. Hashes omit colors, are non-cryptographic, and do not prove correctness.",
        "Cell capture is capped at 50000 cells per pane. Timeouts/unavailable/stale results are explicit; capture itself can add Worker queue latency.",
        "backend is the UI cached frame, not a new Worker snapshot. frameReady=false means row data may be stale.",
        "rowContent uses cached visible rows including scrollback; unavailable rows are not fetched. rowStep/colStep disclose sampling limits.",
        "nonSpace/visibleGlyphs/coloredBackground are content hints, not proof of correct rendering; decorations and images need separate interpretation.",
        "Pixels are sampled only on manual capture/copy, at 64x64 on a separate canvas. Bands 0..3 run top to bottom; colors are quantized.",
        "Sampling can miss thin text; dark/uniform pixels can be legitimate. Canvas readback does not capture DOM occlusion or browser compositor output.",
        "No original terminal text or screenshot is included. Readiness/cursor progress is not proof of visual correctness.",
        "replayEvidence observes retained raw bytes before Kitty processing, not discarded history. ASCII ESC controls only; control-string payloads and printable text are not retained.",
        "liveOutputEvidence observes live bytes before Kitty processing; offsets are relative to baseCursor when known. It includes scrolling/edit controls and C0 counts, with the last 96 controls retained.",
        "write_byte_comparison compares each output batch before term.write/writeReplay with concatenated writeInternal payloads before Worker encoding. No payload is changed or exported.",
        "Each side is capped at 256 KiB. CR/LF counts, exact equality and masked first-difference context are included. Interception/decoder buffering can legitimately differ across batch boundaries; difference alone is not a fault verdict.",
        "Control offsets are relative to observed replay start; fromStart/sizeMatches disclose partial capture. No complete-state checkpoint can be inferred from control counts alone.",
        "scanMs is diagnostic main-thread overhead. Missing reset/clear/mode controls are clues, not proof that the original program used those controls.",
        ...records.map((entry) => entry.line)].join("\n");
    },
    dispose() {
      disposed = true;
      lifecycle += 1;
      enabled = false;
      stopTimers();
      documentObject.removeEventListener("visibilitychange", visibility);
      records.length = 0;
      replayEvidence = new WeakMap();
      liveEvidence = new WeakMap();
      firstFrames = new WeakMap();
      characters = 0;
    },
  });
}
