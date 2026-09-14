import { createReplayControlEvidence } from "./replay_control_evidence.js";

const observedEvents = new Set([
  "history_replay_start", "history_replay_complete", "replay_output_drained", "render_blocked",
  "full_render_complete", "presentation_commit_complete", "resize_native_start", "resize_native_complete",
  "backend_failed", "backend_restart", "socket_close", "screen_auto_refresh", "screen_auto_refresh_exhausted",
  "presentation_ready_state", "presentation_retry_scheduled", "presentation_hold", "presentation_hold_cancel",
  "replay_batch_begin", "replay_batch_received", "replay_batch_applied", "replay_batch_interrupted",
  "state_checkpoint_restore_start", "state_checkpoint_restore_complete",
]);

export function createTerminalRenderCapture({ windowObject = globalThis.window,
  documentObject = globalThis.document, getContext = () => ({}), captureSession = () => ({}),
  onChange = () => {}, now = () => performance.now() } = {}) {
  const records = [];
  let enabled = false, started = false, disposed = false;
  let timer = null, viewTimer = null, sequence = 0, characters = 0, dropped = 0;
  let replayEvidence = new WeakMap(), firstFrames = new WeakMap();
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
    const at = now();
    const context = getContext();
    const sessions = Array.from(context.sessions || []).filter((session) => !session.closed && session.tabId === context.tab);
    const panes = sessions.map((session) => {
      try { return { ...captureSession(session, { includePixels }), replayEvidence: evidenceFor(session)?.snapshot() }; }
      catch (error) { return { pane: session.id, captureError: error?.name || "capture_failed" }; }
    });
    append({ type: "snapshot", reason, tab: context.tab, target: context.target,
      autoScreenRefresh: context.autoScreenRefresh, documentHidden: documentObject.hidden,
      window: { width: windowObject.innerWidth, height: windowObject.innerHeight, dpr: windowObject.devicePixelRatio,
        visualWidth: windowObject.visualViewport?.width, visualHeight: windowObject.visualViewport?.height,
        visualScale: windowObject.visualViewport?.scale },
      paneCount: panes.length, includePixels, captureDurationMs: Math.round((now() - at) * 100) / 100, panes,
    }, `[${Math.round(at)}ms] ${reason} tab=${context.tab || "none"} panes=${panes.length}\n`
      + panes.map((pane) => `${pane.pane}: ready=${pane.renderReady} current=${pane.presentationCurrent}`
        + ` frameReady=${pane.backend?.frameReady} queue=${pane.outputQueueBytes ?? "?"}`
        + ` grid=${pane.terminal?.cols}x${pane.terminal?.rows} pixels=${pane.canvasPixels?.status || "not sampled"}`).join("\n"));
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
      replayEvidence = new WeakMap();
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
    observeOutput(session, data, { replayOutput, historySource } = {}) {
      if (!enabled || disposed || !replayOutput || historySource !== "server" || session?.tabId !== getContext().tab) return;
      const evidence = evidenceFor(session) || beginEvidence(session);
      evidence.consume(data);
    },
    capture,
    clipboardText() {
      capture("copy", true);
      return ["WebShell terminal render capture v2", `Copied at: ${new Date().toISOString()}`,
        `Retained records: ${records.length}; older records discarded: ${dropped}`,
        "Snapshots include every non-closed pane in the active tab at capture time. Earlier tab records remain labelled.",
        "Passive capture: no resize, replay, Worker requests or repair. Auto refresh remains independently controlled.",
        "backend is the UI cached frame, not a new Worker snapshot. frameReady=false means row data may be stale.",
        "rowContent uses cached visible rows including scrollback; unavailable rows are not fetched. rowStep/colStep disclose sampling limits.",
        "nonSpace/visibleGlyphs/coloredBackground are content hints, not proof of correct rendering; decorations and images need separate interpretation.",
        "Pixels are sampled only on manual capture/copy, at 64x64 on a separate canvas. Bands 0..3 run top to bottom; colors are quantized.",
        "Sampling can miss thin text; dark/uniform pixels can be legitimate. Canvas readback does not capture DOM occlusion or browser compositor output.",
        "No original terminal text or screenshot is included. Readiness/cursor progress is not proof of visual correctness.",
        "replayEvidence observes retained raw bytes before Kitty processing, not discarded history. ASCII ESC controls only; control-string payloads and printable text are not retained.",
        "Control offsets are relative to observed replay start; fromStart/sizeMatches disclose partial capture. No complete-state checkpoint can be inferred from control counts alone.",
        "scanMs is diagnostic main-thread overhead. Missing reset/clear/mode controls are clues, not proof that the original program used those controls.",
        ...records.map((entry) => entry.line)].join("\n");
    },
    dispose() {
      disposed = true;
      enabled = false;
      stopTimers();
      documentObject.removeEventListener("visibilitychange", visibility);
      records.length = 0;
      replayEvidence = new WeakMap();
      firstFrames = new WeakMap();
      characters = 0;
    },
  });
}
