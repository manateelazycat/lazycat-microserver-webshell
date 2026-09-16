const maxFailures = 32;
const maxContextEvents = 48;
const maxErrorChars = 8192;
const contextEvents = new Set([
  "connect_session_start", "socket_connect", "socket_open", "socket_close", "agent_preparing",
  "logical_attach_start", "agent_attach_ready", "history_replay_start", "history_replay_complete",
  "resize_request", "resize_ack", "resize_native_start", "resize_native_complete", "resize_native_error",
  "resize_server_geometry_observed", "checkpoint_resize_diagnostic",
]);
const checkpointFields = [
  "memory_measurement", "memory_bytes", "memory_limit_bytes", "scrollback_capacity_bytes", "scrollback_lines",
  "checkpoint_cols", "checkpoint_rows", "pane_cols", "pane_rows", "history_cursor", "pending_bytes",
  "skipped_resizes", "observed_unix_ms",
];
const resizeFields = [
  "at_unix_ms", "from_cols", "from_rows", "to_cols", "to_rows", "memory_before", "memory_after",
  "duration_ms", "native_error", "error",
];
const pick = (value, keys) => Object.fromEntries(keys.flatMap((key) => {
  const item = value?.[key];
  return ["string", "number", "boolean"].includes(typeof item)
    ? [[key, typeof item === "string" ? item.slice(0, maxErrorChars) : item]] : [];
}));
const checkpointSnapshot = (checkpoint) => checkpoint ? {
  ...pick(checkpoint, checkpointFields),
  last_resize: checkpoint.last_resize ? pick(checkpoint.last_resize, resizeFields) : null,
  recent_resizes: Array.isArray(checkpoint.recent_resizes)
    ? checkpoint.recent_resizes.slice(-8).map((entry) => pick(entry, resizeFields)) : [],
} : null;

const classify = (error) => ({
  basis: "server_error_text_only",
  operation: /checkpoint parser failed/i.test(error) ? "parser_write"
    : /checkpoint resize failed/i.test(error) ? "resize"
      : /allocation failed/i.test(error) ? "allocation" : "unknown",
  wasmOutOfBoundsReported: /out of bounds memory access/i.test(error),
});
const identityFor = (session) => JSON.stringify([session.name, session.tabId, session.id, session.workspaceGeneration]);

// Passive, bounded evidence. No sockets, timers, Worker calls or session writes.
// The first failed report is pinned outside the ordinary rolling capture log.
export function createCheckpointFailureEvidence({ now, wallNow = () => Date.now() }) {
  let states = new WeakMap();
  const failures = [];
  let captureWindow = 0, ignoredFailureReports = 0;
  let windowStarted = null;
  const stamp = () => ({ atMs: Math.round(now() * 10) / 10,
    observedAtUTC: new Date(wallNow()).toISOString(), captureWindow });

  return Object.freeze({
    beginWindow() { captureWindow += 1; windowStarted = stamp(); },
    record(session, event, details) {
      if (!contextEvents.has(event)) return;
      const identity = identityFor(session);
      let state = states.get(session);
      if (!state || state.identity !== identity) {
        state = { identity, events: [], dropped: 0, lastReportWithoutError: null, lastReplay: null, failure: null };
        states.set(session, state);
      }
      const observed = stamp();
      const context = { ...observed, event, connection: session.connectionEpoch,
        channelGeneration: session.connectionChannelGeneration, replayGeneration: session.terminalReplayGeneration,
        ...pick(details, ["controlType", "code", "reason", "resizeEpoch", "cols", "rows",
          "serverBaseCursor", "serverEndCursor", "deltaFromCursor", "deltaToCursor", "syncMode", "recoveryBaseline"]) };
      // Repeated server failures retain their full error in first/latest below.
      if (typeof context.reason === "string") context.reason = context.reason.slice(0, 256);
      for (const key of ["targetSize", "terminalSize", "requestedSize", "serverSize"]) {
        if (details[key]) context[key] = pick(details[key], ["cols", "rows"]);
      }
      state.events.push(context);
      if (state.events.length > maxContextEvents) { state.events.shift(); state.dropped += 1; }
      if (event === "history_replay_start") state.lastReplay = context;
      if (state.failure) {
        state.failure.recentContext = state.events.slice();
        state.failure.contextEventsDiscarded = state.dropped;
      }
      if (event !== "checkpoint_resize_diagnostic") return;
      const error = String(details.checkpoint?.error || details.error || "");
      const report = { ...observed, connection: session.connectionEpoch,
        channelGeneration: session.connectionChannelGeneration, replayGeneration: session.terminalReplayGeneration,
        controlType: details.controlType || "unknown", serverSample: checkpointSnapshot(details.checkpoint),
        error: error.slice(0, maxErrorChars), errorTruncated: error.length > maxErrorChars,
        classification: error ? classify(error) : null,
        serverMessage: String(details.error || "").slice(0, maxErrorChars),
        client: { hasPresentedFrame: session.hasPresentedFrame === true, renderReady: session.renderReady === true,
          receivedCursor: String(session.receivedHistoryCursor ?? ""), appliedCursor: String(session.appliedHistoryCursor ?? ""),
          backendReady: session.term?.wasmTerm?.isReady, backendFailed: session.term?.wasmTerm?.failed,
          backendGeneration: session.term?.wasmTerm?.generation },
      };
      if (!error) {
        state.lastReportWithoutError = report;
        if (state.failure) state.failure.reportsWithoutErrorAfterFailure += 1;
        return;
      }
      if (!state.failure) {
        if (failures.length >= maxFailures) { ignoredFailureReports += 1; return; }
        state.failure = {
          type: "checkpoint_failure_evidence", evidenceID: failures.length + 1,
          target: session.name, tab: session.tabId, pane: session.id, workspaceGeneration: session.workspaceGeneration,
          firstObservedFailure: report,
          firstObservationWindowStarted: windowStarted,
          lastReportWithoutErrorBeforeFailure: state.lastReportWithoutError,
          lastReplayBeforeFailure: state.lastReplay, contextAtFirstObservation: state.events.slice(),
          contextEventsDiscardedBeforeFirstObservation: state.dropped,
          failedReports: 0, matchingFirstErrorReports: 0, differentErrorReports: 0,
          uncomparableErrorReports: 0, reportsWithoutErrorAfterFailure: 0,
        };
        failures.push(state.failure);
      }
      const failure = state.failure;
      failure.failedReports += 1;
      if (report.errorTruncated || failure.firstObservedFailure.errorTruncated) failure.uncomparableErrorReports += 1;
      else if (report.error === failure.firstObservedFailure.error) failure.matchingFirstErrorReports += 1;
      else failure.differentErrorReports += 1;
      failure.latestObservedFailure = report;
      failure.recentContext = state.events.slice();
      failure.contextEventsDiscarded = state.dropped;
    },
    reference(session) {
      const state = states.get(session);
      const failure = state?.identity === identityFor(session) ? state.failure : null;
      return failure ? { evidenceID: failure.evidenceID, failedReports: failure.failedReports,
        latestObservedAtUTC: failure.latestObservedFailure.observedAtUTC } : null;
    },
    exportRecords() {
      return [{ type: "checkpoint_evidence_scope", captureWindows: captureWindow, retainedFailureSessions: failures.length,
        maxFailureSessions: maxFailures, ignoredFailureReports, contextEventLimit: maxContextEvents, errorTextLimit: maxErrorChars,
        firstObservationIsFailureTime: false, serverSampleCursorIsFailureCursor: false,
        configuredScrollbackLinesIsActualOccupancy: false, repeatedErrorReportsAreNewCrashes: "not_established",
        observationCoverage: "enabled_capture_and_active_tab_only",
        captureWindowMeaning: "increments_on_enable_not_on_tab_switch",
        unavailableFromExistingAgent: ["first_failure_time", "first_failure_cursor", "triggering_input_bytes",
          "faulting_memory_address", "faulting_instruction_offset", "parser_memory_at_failure",
          "actual_scrollback_occupancy_at_failure", "retained_raw_history_bytes_at_failure"],
      }, ...failures].map((record) => JSON.stringify(record));
    },
    dispose() { failures.length = 0; states = new WeakMap(); },
  });
}
