import { createTerminalOutputLifecycle } from "./output_lifecycle.js";
import { createReplayBatch } from "./replay_batch.js";
import {
  coalesceTerminalOutputBatch,
  parseTerminalOutputCursor,
  splitTerminalOutputText,
  terminalOutputByteChunkEnd,
  terminalOutputByteLength,
  terminalOutputKind,
} from "./output_model.js";

export const TERMINAL_OUTPUT_FLUSH_FALLBACK_MS = 32;
export const TERMINAL_OUTPUT_FLUSH_BUDGET_BYTES = 128 * 1024;
export const TERMINAL_OUTPUT_FLUSH_MAX_ENTRIES = 8;
export const TERMINAL_OUTPUT_FLUSH_MAX_BATCHES = 8;
export const TERMINAL_OUTPUT_FLUSH_TIME_BUDGET_MS = 12;
export const TERMINAL_REPLAY_WRITE_BATCH_BYTES = 512 * 1024;
// Check the wall-clock budget between parser calls, not only while partitioning.
const TERMINAL_OUTPUT_WRITE_SLICE_BYTES = 64 * 1024;
const MAX_QUEUED_TERMINAL_OUTPUT_ENTRIES = 8192;
export const TERMINAL_OUTPUT_QUEUE_SOFT_LIMIT_BYTES = 1 * 1024 * 1024;
export const MAX_QUEUED_TERMINAL_OUTPUT_BYTES = 4 * 1024 * 1024;

const noop = () => {};

export function createTerminalOutputController({
  windowObject = globalThis.window,
  workScheduler = null,
  getPriority = () => 0,
  onProcessingError = null,
  getActiveName = () => "",
  isReplayCommitted = () => false,
  getResizeTransition = () => ({ active: false, outputSettleActive: false }),
  noteResizeOutput = noop,
  requestHistoryReplay = noop,
  finishHistoryReplayIfReady = () => false,
  scheduleReplayPresentationCheckpoint = noop,
  beginPresentationHold = noop,
  isRenderAllowed = () => true,
  advanceContentGeneration = noop,
  deferHiddenRender = () => false,
  cancelPendingRender = noop,
  schedulePresentationValidation = noop,
  armReplayGeneratedSuppression = noop,
  drainGeneratedResponses = noop,
  resetHostViewport = noop,
  positionInput = noop,
  sendQueueTurnAck = (session, pending, payload) => {
    if (
      !session
      || !pending
      || session.socket !== pending.socket
      || session.connectionChannel !== "unified"
      || Number(session.connectionEpoch || 0) !== Number(pending.connectionEpoch || 0)
      || Number(session.connectionChannelGeneration || 0) !== Number(pending.channelGeneration || 0)
    ) {
      return false;
    }
    const socket = pending.socket;
    if (!socket || typeof socket.send !== "function") {
      return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
  },
  recoverQueueTurnAck = noop,
  recordMetric = noop,
  recordMaxMetric = noop,
  recordEvent = noop,
  measureTask = (_name, task) => task(),
  recordPerformanceTask = noop,
  now = () => globalThis.performance?.now?.() || Date.now(),
  isDebugLogEnabled = () => false,
  isByteIOLogEnabled = () => false,
  observeReplayBytes = noop,
  observeWriteBatch = noop,
  appendDebugLog = noop,
  appendStartupTrace = noop,
  onDiscard = noop,
  lifecycleFactory = createTerminalOutputLifecycle,
  flushFallbackMs = TERMINAL_OUTPUT_FLUSH_FALLBACK_MS,
  flushBudgetBytes = TERMINAL_OUTPUT_FLUSH_BUDGET_BYTES,
  flushMaxEntries = TERMINAL_OUTPUT_FLUSH_MAX_ENTRIES,
  flushMaxBatches = TERMINAL_OUTPUT_FLUSH_MAX_BATCHES,
  flushTimeBudgetMs = TERMINAL_OUTPUT_FLUSH_TIME_BUDGET_MS,
  replayWriteBatchBytes = TERMINAL_REPLAY_WRITE_BATCH_BYTES,
  queueSoftLimitBytes = TERMINAL_OUTPUT_QUEUE_SOFT_LIMIT_BYTES,
  maxQueuedBytes = MAX_QUEUED_TERMINAL_OUTPUT_BYTES,
} = {}) {
  const lifecycle = lifecycleFactory({
    windowObject,
    workScheduler,
    getPriority: (session) => getPriority(session) + (session.outputQueueSize >= queueSoftLimitBytes ? 1 : 0),
  });
  const sessions = new Set();
  let byteIOBatchID = 0;
  const flushing = new WeakSet();
  const inFlight = new WeakMap();
  const failed = new WeakSet();
  const parsedBytes = new WeakMap();
  const appliedEntries = new WeakMap();
  const flowModes = new WeakMap();
  const ackBoundaries = new WeakMap();
  const replayBatch = createReplayBatch({ maxQueuedBytes, now, recordEvent });
  const disposedSessions = new WeakSet();
  let disposed = false;
  const recoverProcessingError = (session, error) => {
    if (onProcessingError) onProcessingError(session, error);
    else requestHistoryReplay(session);
  };

  const ensureState = (session) => {
    if (!session) {
      return null;
    }
    if (!Array.isArray(session.outputQueue)) {
      session.outputQueue = [];
    }
    session.outputQueueSize = Math.max(0, Number(session.outputQueueSize) || 0);
    session.outputQueueGeneration = Math.max(0, Number(session.outputQueueGeneration) || 0);
    session.outputFlushFrame = Number(session.outputFlushFrame) || 0;
    session.outputFlushTimer = Number(session.outputFlushTimer) || 0;
    session.outputOverloadPending = session.outputOverloadPending === true;
    return session;
  };

  const getSnapshot = (session) => {
    const state = ensureState(session);
    return Object.freeze({
      entryCount: state?.outputQueue.length || 0,
      queuedBytes: state?.outputQueueSize || 0,
      generation: state?.outputQueueGeneration || 0,
      overloadPending: state?.outputOverloadPending === true,
      pendingQueueTurnAck: Boolean(state?.pendingQueueTurnAck),
      pendingAck: Boolean(state?.pendingQueueTurnAck),
      pendingAckCursor: state?.pendingQueueTurnAck?.cursor?.toString?.() || "",
      appliedCursor: state?.appliedHistoryCursor?.toString?.() || "0",
      parsedBytes: parsedBytes.get(state) || 0,
    });
  };

  const handleOverload = (session, reason) => {
    const state = ensureState(session);
    if (!state || state.closed || state.outputOverloadPending) {
      return false;
    }
    state.outputOverloadPending = true;
    if (isByteIOLogEnabled()) recordEvent(state, "byte_io_overload", { reason, queuedBytes: state.outputQueueSize });
    failed.add(state);
    lifecycle.clear(state);
    recordMetric("outputOverloads");
    globalThis.console?.warn?.("[terminal-output] queue overload; requesting cursor resync", {
      name: state.name,
      pane: state.id,
      queuedBytes: state.outputQueueSize,
      reason,
    });
    recoverProcessingError(state, new Error(reason));
    return true;
  };

  const writeBatch = async (session, data, replayOutput, allowGeneratedInput, suppressRender = false) => {
    const kind = terminalOutputKind(data);
    if (!kind || (kind === "text" ? data.length === 0 : data.byteLength === 0)) {
      return false;
    }
    const previousAllowGeneratedInput = session.allowGeneratedInputDuringReplay;
    const generation = session.outputQueueGeneration;
    if (replayOutput) {
      session.allowGeneratedInputDuringReplay = allowGeneratedInput === true;
      armReplayGeneratedSuppression(session);
      session.replayOutputDepth = Number(session.replayOutputDepth || 0) + 1;
    }
    const replayWriter = (replayOutput || suppressRender) && typeof session.term.writeReplay === "function";
    let finishObservation, completed = false;
    try { finishObservation = observeWriteBatch(session, data, { replayOutput, suppressRender }); } catch {}
    try {
      if (replayWriter) {
        recordEvent(session, replayOutput ? "write_replay" : "write_suppressed", {
          bytes: terminalOutputByteLength(data),
          reason: replayOutput ? "history_replay" : "resize_output_settle",
        });
      }
      recordMetric("terminalOutputBatches");
      recordMetric("terminalOutputBytes", terminalOutputByteLength(data));
      await measureTask("terminal write", () => {
        if (replayWriter) {
          return session.term.writeReplay(data);
        } else {
          return session.term.write(data);
        }
      });
      completed = true;
      if (session.closed || session.outputQueueGeneration !== generation) return false;
      session.lastTerminalOutputAt = now();
      if (!replayWriter && isRenderAllowed(session)) {
        session.term.requestRender?.({ throttle: true });
      }
      advanceContentGeneration(session);
      drainGeneratedResponses(session);
      if (
        ((replayOutput || suppressRender) && !replayWriter)
        || (!replayOutput && !suppressRender && deferHiddenRender(session))
      ) {
        cancelPendingRender(session.term);
      }
      return true;
    } finally {
      try { finishObservation?.(completed); } catch {}
      if (replayOutput && session.outputQueueGeneration === generation) {
        session.replayOutputDepth = Math.max(0, Number(session.replayOutputDepth || 0) - 1);
        session.allowGeneratedInputDuringReplay = previousAllowGeneratedInput;
      }
    }
  };

  const trySendPendingQueueTurnAck = (session) => {
    const state = ensureState(session);
    const windowed = flowModes.get(state) === "window-ack-v1";
    const boundaries = ackBoundaries.get(state) || [];
    let consumed = 0;
    if (windowed) {
      while (consumed < boundaries.length && boundaries[consumed].cursor <= state.appliedHistoryCursor) consumed += 1;
    }
    const pending = windowed ? boundaries[consumed - 1] : state?.pendingQueueTurnAck;
    if (!pending || state.closed || state.socket !== pending.socket || state.connectionChannel !== "unified") {
      return false;
    }
    if (
      Number(state.connectionEpoch || 0) !== pending.connectionEpoch
      || Number(state.connectionChannelGeneration || 0) !== pending.channelGeneration
      || (!windowed && (state.outputQueueSize > 0 || state.appliedHistoryCursor !== pending.cursor))
    ) {
      return false;
    }
    try {
      const sent = sendQueueTurnAck(state, pending, {
        type: "queue-turn-ack",
        data: `${pending.cursor.toString()}:${pending.sequence}`,
      });
      if (sent !== true) {
        return false;
      }
      if (windowed) {
        boundaries.splice(0, consumed);
        state.pendingQueueTurnAck = boundaries.at(-1) || null;
      } else state.pendingQueueTurnAck = null;
      recordEvent(state, "queue_turn_ack_sent", {
        cursor: pending.cursor.toString(),
        sequence: String(pending.sequence),
      });
      return true;
    } catch (error) {
      state.pendingQueueTurnAck = null;
      ackBoundaries.delete(state);
      recoverQueueTurnAck(state, pending, error);
      return false;
    }
  };

  const drain = async (session, {
    force = false,
    maxBytes = 0,
    maxEntries = 0,
    maxTimeMs = 0,
    scheduleRemainder = true,
  } = {}) => {
    const state = ensureState(session);
    if (!state) {
      return true;
    }
    const traceFlush = state.startupTraceActive || !isReplayCommitted(state);
    const flushStartedAt = now();
    if (traceFlush) {
      recordEvent(state, "output_flush_enter", {
        force,
        queuedEntries: state.outputQueue.length,
        queuedBytes: state.outputQueueSize,
        maxBytes: Number(maxBytes || 0),
        maxEntries: Number(maxEntries || 0),
        maxTimeMs: Number(maxTimeMs || 0),
        scheduleRemainder,
      });
    }
    const queue = state.outputQueue;
    const drainGeneration = state.outputQueueGeneration;
    if (queue.length === 0) {
      if (traceFlush) {
        recordEvent(state, "output_flush_empty", {
          durationMs: Math.max(0, now() - flushStartedAt),
          replayComplete: state.replayComplete === true,
        });
      }
      finishHistoryReplayIfReady(state);
      trySendPendingQueueTurnAck(state);
      return true;
    }
    const outputQueueGenerationMismatch = queue.some((entry) => entry.queueGeneration !== state.outputQueueGeneration);
    const outputIdentityMismatch = outputQueueGenerationMismatch || queue.some((entry) => (
      entry.queueGeneration !== state.outputQueueGeneration
      || entry.connectionEpoch !== Number(state.connectionEpoch || 0)
      || entry.selector !== String(state.name || "")
      || entry.paneID !== String(state.id || "")
      || entry.channelGeneration !== Number(state.connectionChannelGeneration || 0)
      || entry.historyGeneration !== String(state.historyGeneration || "")
    ));
    if (outputIdentityMismatch) {
      if (isByteIOLogEnabled()) recordEvent(state, "byte_io_discard", { reason: "output_identity_changed", queuedBytes: state.outputQueueSize });
      recordMetric("staleOutputQueueDrops");
      state.outputQueue = [];
      state.outputQueueSize = 0;
      state.replayCompletionPending = false;
      state.resetOnNextReplay = true;
      beginPresentationHold(state);
      finishHistoryReplayIfReady(state);
      return true;
    }
    if (!state.term || (!force && (state.closed || state.name !== getActiveName()))) {
      state.outputQueue = [];
      state.outputQueueSize = 0;
      state.replayCompletionPending = false;
      return true;
    }
    if (workScheduler && workScheduler.remainingMs() <= 0) {
      if (scheduleRemainder) scheduleFlush(state);
      return false;
    }
    let drained = false;
    await measureTask("output flush", async () => {
      const flushQueue = [];
      let flushedBytes = 0;
      const requestedBudgetBytes = Math.max(0, Math.floor(Number(maxBytes) || 0));
      const requestedEntryLimit = Math.max(0, Math.floor(Number(maxEntries) || 0));
      const requestedTimeBudgetMs = Math.max(0, Number(maxTimeMs) || 0);
      const snapshotBatch = replayBatch.get(state);
      const aggregateReplay = snapshotBatch?.aggregate && !snapshotBatch.waiting
        && queue[0]?.replayBatch === snapshotBatch;
      const budgetBytes = requestedBudgetBytes || (queue[0]?.replayOutput
        ? (aggregateReplay ? snapshotBatch.bytes : replayWriteBatchBytes)
        : flushBudgetBytes);
      // Small transport frames must coalesce before the default work limit is
      // applied. Eight 110-byte frames per animation tick cannot keep up with
      // normal PTY output. Explicit entry limits still bound resize/ACK drains.
      const entryLimit = requestedEntryLimit;
      const batchLimit = queue[0]?.replayOutput ? 0 : flushMaxBatches;
      const timeBudgetMs = Math.min(requestedTimeBudgetMs || flushTimeBudgetMs, workScheduler?.remainingMs() ?? flushTimeBudgetMs);
      const drainStartedAt = now();
      let wrote = false;
      let consumed = 0;
      let flushedBatches = 0;
      while (state.outputQueue.length > 0) {
        if (!force && getResizeTransition(state)?.blockOutput) break;
        const pending = state.outputQueue;
        if (consumed > 0 && (
          (entryLimit > 0 && consumed >= entryLimit)
          || (batchLimit > 0 && flushedBatches >= batchLimit)
          || (flushedBytes + pending[0].byteLength > budgetBytes)
          || (timeBudgetMs > 0 && now() - drainStartedAt >= timeBudgetMs)
        )) break;
        const first = pending[0];
        const batch = { ...first, chunks: [], byteLength: 0 };
        let batchEntries = 0;
        const bulk = aggregateReplay && first.replayBatch === snapshotBatch;
        const sliceBytes = bulk ? snapshotBatch.bytes
          : Math.min(TERMINAL_OUTPUT_WRITE_SLICE_BYTES, first.replayOutput ? replayWriteBatchBytes : flushBudgetBytes);
        while (batchEntries < pending.length) {
          const entry = pending[batchEntries];
          if (batch.chunks.length > 0 && (
            batch.kind !== entry.kind
            || batch.replayBatch !== entry.replayBatch
            || batch.replayOutput !== entry.replayOutput
            || batch.suppressRender !== entry.suppressRender
            || batch.allowGeneratedInput !== entry.allowGeneratedInput
            || batch.serverHistoryRange !== entry.serverHistoryRange
            || (batch.historyEndCursor !== null && entry.historyStartCursor !== batch.historyEndCursor)
            || batch.byteLength + entry.byteLength > sliceBytes
            || (entryLimit > 0 && consumed >= entryLimit)
            || (flushedBytes + entry.byteLength > budgetBytes)
            || (!bulk && timeBudgetMs > 0 && now() - drainStartedAt >= timeBudgetMs)
          )) break;
          batch.chunks.push(entry.data);
          batch.byteLength += entry.byteLength;
          batch.historyEndCursor = entry.historyEndCursor;
          flushQueue.push(entry);
          flushedBytes += entry.byteLength;
          consumed += 1;
          batchEntries += 1;
        }
        const measureIO = isByteIOLogEnabled();
        const coalesceAt = measureIO ? now() : 0;
        const data = coalesceTerminalOutputBatch(batch.chunks, batch.kind, batch.byteLength);
        const writeAt = measureIO ? now() : 0;
        const batchID = measureIO ? ++byteIOBatchID : 0;
        if (measureIO) recordEvent(state, "byte_io_batch_start", {
          batchID, bytes: batch.byteLength, entries: batchEntries, aggregate: Boolean(bulk),
          replayOutput: batch.replayOutput, coalesceMs: writeAt - coalesceAt,
          oldestQueueWaitMs: first.byteIOEnqueuedAt == null ? null : coalesceAt - first.byteIOEnqueuedAt,
          newestQueueWaitMs: pending[batchEntries - 1].byteIOEnqueuedAt == null ? null : coalesceAt - pending[batchEntries - 1].byteIOEnqueuedAt,
          startCursor: batch.historyStartCursor?.toString(), endCursor: batch.historyEndCursor?.toString(),
        });
        flushedBatches += 1;
        const written = await writeBatch(state, data, batch.replayOutput, batch.allowGeneratedInput, batch.suppressRender);
        const writeDoneAt = measureIO ? now() : 0;
        if (written) {
          if (state.closed || state.outputQueueGeneration !== first.queueGeneration) break;
          // Keep in-flight bytes visible to replay/fence owners until the worker
          // confirms parsing. Preserve bytes enqueued while awaiting the reply.
          state.outputQueue = pending.slice(batchEntries);
          state.outputQueueSize = Math.max(0, state.outputQueueSize - batch.byteLength);
          wrote = true;
          parsedBytes.set(state, (parsedBytes.get(state) || 0) + batch.byteLength);
          appliedEntries.set(state, (appliedEntries.get(state) || 0) + batchEntries);
          if (batch.historyEndCursor !== null) {
            state.appliedHistoryCursor = batch.historyEndCursor;
            replayBatch.applied(state);
          }
          state.term.wasmTerm?.markOutputApplied?.({
            contentGeneration: state.terminalContentGeneration,
            appliedCursor: state.appliedHistoryCursor?.toString?.() || "0",
          });
          trySendPendingQueueTurnAck(state);
          if (measureIO && isByteIOLogEnabled()) recordEvent(state, "byte_io_batch_complete", {
            batchID, bytes: batch.byteLength, writeAwaitMs: writeDoneAt - writeAt,
            queuedBytes: state.outputQueueSize, queueEntries: state.outputQueue.length,
            endCursor: batch.historyEndCursor?.toString(),
          });
        } else {
          break;
        }
      }

      if (state.closed || state.outputQueueGeneration !== drainGeneration) return;
      if (wrote) {
        resetHostViewport(state, { clean: true, source: "output" });
        positionInput(state);
        // A pending frame is not postponed by subsequent output. Validation
        // is reserved for an actual replay/geometry gate.
        if (isReplayCommitted(state) && isRenderAllowed(state)) state.term.requestRender?.();
        else schedulePresentationValidation(state);
      }
      if (wrote && flushQueue.some((entry) => entry.replayOutput)) {
        scheduleReplayPresentationCheckpoint(state);
      }
      if (force) {
        recordMetric("forceFlushBytes", flushedBytes);
        recordMaxMetric("forceFlushPeakBytes", flushedBytes);
        const duration = now() - flushStartedAt;
        if (isDebugLogEnabled()) {
          appendDebugLog(
            "info",
            "终端 force flush",
            `${state.name}/${state.id} ${JSON.stringify({
              bytes: flushedBytes,
              remainingBytes: state.outputQueueSize,
              maxBytes: requestedBudgetBytes,
              maxEntries: requestedEntryLimit,
              maxTimeMs: requestedTimeBudgetMs,
            })}`,
            { dedupeKey: `terminal-force-flush:${state.id}` },
          );
        }
        recordPerformanceTask("terminal force flush", duration);
      }
      drained = state.outputQueueSize <= 0;
      if (traceFlush) {
        recordEvent(state, "output_flush_exit", {
          durationMs: Math.max(0, now() - flushStartedAt),
          flushedBytes,
          flushedEntries: flushQueue.length,
          wrote,
          drained,
          remainingBytes: state.outputQueueSize,
          remainingEntries: state.outputQueue.length,
          replayEntries: flushQueue.filter((entry) => entry.replayOutput).length,
          scheduledRemainder: !drained && scheduleRemainder,
        });
      }
      trySendPendingQueueTurnAck(state);
      if (!drained && scheduleRemainder && !getResizeTransition(state)?.blockOutput) {
        lifecycle.schedule(state, () => flush(state), flushFallbackMs);
      } else {
        finishHistoryReplayIfReady(state);
      }
    });
    return drained;
  };

  const flush = (session, options = {}) => {
    if (!session || disposed || session.closed || failed.has(session)) return false;
    // Consume the scheduled wake even when it meets an in-flight write or a
    // resize gate. Stale RAF/timer handles must not block the next schedule.
    lifecycle.clear(session);
    // The running turn retains responsibility for queued output. Its finally
    // re-evaluates current gates, including a resize cancelled while awaiting.
    if (inFlight.has(session)) return inFlight.get(session);
    if (options.force) replayBatch.interrupt(session);
    if (replayBatch.get(session)?.waiting) {
      return false;
    }
    // ACK-fenced drains belong exclusively to the resize owner until it has
    // switched grids. A normal output turn must not consume post-ACK bytes.
    if (!options.force && getResizeTransition(session)?.blockOutput) return false;
    if (workScheduler && !workScheduler.isRunning()) {
      const result = workScheduler.runNow(() => flush(session, options));
      if (result === false && options.scheduleRemainder !== false && !failed.has(session)) scheduleFlush(session);
      return result;
    }
    if (workScheduler && workScheduler.remainingMs() <= 0) {
      if (options.scheduleRemainder !== false) scheduleFlush(session);
      return false;
    }
    flushing.add(session);
    const generation = session.outputQueueGeneration;
    const promise = drain(session, options).catch((error) => {
      if (session.closed || session.outputQueueGeneration !== generation || error?.code === "BACKEND_CANCELLED") return false;
      // A parser can consume a prefix before failing. Only a fresh runtime and
      // authoritative replay can safely recover; never retry this batch in place.
      failed.add(session);
      lifecycle.clear(session);
      try { beginPresentationHold(session); } catch { /* Preserve recovery even if Canvas failed. */ }
      recoverProcessingError(session, error);
      return false;
    }).finally(() => {
      if (inFlight.get(session) !== promise) return;
      flushing.delete(session);
      inFlight.delete(session);
      // scheduleRemainder:false limits the original fenced turn, not all later
      // output. Once its owner releases the gate, this queue must keep moving
      // without another network frame, user gesture, or watchdog recovery.
      if (!disposed && !session.closed && !disposedSessions.has(session) && !failed.has(session)
        && session.outputQueueSize > 0 && !replayBatch.get(session)?.waiting
        && !getResizeTransition(session)?.blockOutput) scheduleFlush(session);
    });
    inFlight.set(session, promise);
    return promise;
  };

  const scheduleFlush = (session) => {
    const state = ensureState(session);
    if (!state || disposed || disposedSessions.has(state) || state.closed || failed.has(state)) {
      return false;
    }
    return lifecycle.schedule(state, () => flush(state), flushFallbackMs);
  };

  const write = (session, data, {
    historySource = "server",
    startCursor = null,
    endCursor = null,
    deferRender = false,
    localOutput = false,
  } = {}) => {
    const state = ensureState(session);
    if (
      disposed
      || !state?.term
      || state.closed
      || failed.has(state)
      || disposedSessions.has(state)
      || state.name !== getActiveName()
    ) {
      return false;
    }
    const outputData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const byteIOEnqueuedAt = isByteIOLogEnabled() ? now() : null;
    const kind = terminalOutputKind(outputData);
    if (!kind) {
      return false;
    }
    if (state.outputQueueSize >= maxQueuedBytes) {
      handleOverload(state, "queued output would exceed hard limit");
      return false;
    }
    const replayOutput = !localOutput && !isReplayCommitted(state);
    const resizeTransition = getResizeTransition(state) || {};
    if (resizeTransition.outputSettleActive) {
      noteResizeOutput(state);
    }
    const suppressRender = (deferRender || resizeTransition.active) && !replayOutput;
    const allowGeneratedInput = replayOutput && state.allowGeneratedInputDuringReplay === true;
    const outputChunkBytes = Math.min(TERMINAL_OUTPUT_WRITE_SLICE_BYTES, replayOutput ? replayWriteBatchBytes : flushBudgetBytes);
    const trackHistory = kind === "bytes" && state.historyProtocolActive;
    let nextHistoryCursor = trackHistory
      ? (startCursor === null ? state.receivedHistoryCursor : startCursor)
      : null;
    const connectionEpoch = Number(state.connectionEpoch || 0);
    const channelGeneration = Number(state.connectionChannelGeneration || 0);
    const historyGeneration = String(state.historyGeneration || "");
    const activeReplayBatch = replayBatch.get(state);
    const enqueueEntry = (entryData) => {
      const byteLength = terminalOutputByteLength(entryData);
      if (byteLength <= 0) {
        return true;
      }
      if (state.outputQueueSize + byteLength > maxQueuedBytes || state.outputQueue.length >= MAX_QUEUED_TERMINAL_OUTPUT_ENTRIES) {
        handleOverload(state, "queued output exceeded hard limit");
        return false;
      }
      const historyStartCursor = nextHistoryCursor;
      const historyEndCursor = historyStartCursor === null ? null : historyStartCursor + BigInt(byteLength);
      if (historyEndCursor !== null) {
        nextHistoryCursor = historyEndCursor;
        state.receivedHistoryCursor = historyEndCursor;
      }
      state.outputQueue.push({
        byteIOEnqueuedAt,
        data: entryData,
        kind,
        byteLength,
        replayOutput,
        suppressRender,
        allowGeneratedInput,
        queueGeneration: state.outputQueueGeneration,
        connectionEpoch,
        channelGeneration,
        historyGeneration,
        selector: String(state.name || ""),
        paneID: String(state.id || ""),
        serverHistoryRange: historySource === "server" && historyEndCursor !== null,
        historyStartCursor,
        historyEndCursor,
        replayBatch: activeReplayBatch && historySource === "server" && historyStartCursor !== null
          && historyStartCursor >= activeReplayBatch.start && historyEndCursor <= activeReplayBatch.end ? activeReplayBatch : null,
      });
      state.outputQueueSize += byteLength;
      recordMetric("outputQueuedBytes", byteLength);
      recordMaxMetric("outputQueuePeakBytes", state.outputQueueSize);
      return true;
    };
    if (kind === "bytes" && outputData.byteLength > outputChunkBytes) {
      for (let offset = 0; offset < outputData.byteLength;) {
        const end = terminalOutputByteChunkEnd(outputData, offset, outputChunkBytes);
        if (!enqueueEntry(outputData.subarray(offset, end))) {
          return false;
        }
        offset = end;
      }
    } else if (kind === "text" && terminalOutputByteLength(outputData) > outputChunkBytes) {
      for (const chunk of splitTerminalOutputText(outputData, outputChunkBytes)) {
        if (!enqueueEntry(chunk)) {
          return false;
        }
      }
    } else if (!enqueueEntry(outputData)) {
      return false;
    }
    if (trackHistory && endCursor !== null && nextHistoryCursor !== endCursor) {
      throw new Error("Terminal history output range does not match payload length.");
    }
    observeReplayBytes(state, outputData, { replayOutput, historySource,
      startCursor: trackHistory ? nextHistoryCursor - BigInt(outputData.byteLength) : null,
      endCursor: nextHistoryCursor });
    if (byteIOEnqueuedAt !== null) recordEvent(state, "byte_io_enqueue", {
      inputBytes: terminalOutputByteLength(outputData), enqueueMs: now() - byteIOEnqueuedAt,
      queuedBytes: state.outputQueueSize, queueEntries: state.outputQueue.length, replayOutput, historySource,
    });
    if (state.startupTraceActive || !isReplayCommitted(state)) {
      recordEvent(state, "output_queued", {
        bytes: terminalOutputByteLength(outputData),
        replayOutput,
        deferRender,
        queueEntries: state.outputQueue.length,
        queueBytes: state.outputQueueSize,
        historySource,
        historyStartCursor: startCursor?.toString?.() || "",
        historyEndCursor: endCursor?.toString?.() || "",
      });
    }
    if (state.outputQueueSize >= maxQueuedBytes) {
      handleOverload(state, "queued output exceeded hard limit");
    } else if (!replayBatch.get(state)?.waiting) {
      scheduleFlush(state);
    }
    return true;
  };

  const writeImmediate = (session, data) => {
    if (!write(session, data, { historySource: "local", localOutput: true })) return false;
    // Startup errors still follow pending PTY bytes if the current turn runs
    // out of budget; writing directly here would reorder the terminal stream.
    flush(session);
    return true;
  };

  const discard = (session) => {
    const state = ensureState(session);
    if (!state) {
      return false;
    }
    lifecycle.clear(state);
    failed.delete(state);
    parsedBytes.delete(state);
    appliedEntries.delete(state);
    replayBatch.discard(state);
    state.outputOverloadPending = false;
    state.replayOutputDepth = 0;
    state.outputQueueGeneration = Number(state.outputQueueGeneration || 0) + 1;
    state.outputQueue = [];
    state.outputQueueSize = 0;
    state.pendingQueueTurnAck = null;
    ackBoundaries.delete(state);
    onDiscard(state);
    return true;
  };

  const resetQueueTurn = (session, flowControl = "turn-ack-v1") => {
    const state = ensureState(session);
    if (!state) {
      return false;
    }
    state.queueTurnReceivedCursor = null;
    state.queueTurnReceivedSequence = null;
    state.pendingQueueTurnAck = null;
    ackBoundaries.delete(state);
    flowModes.set(state, flowControl);
    return true;
  };

  const noteQueueTurnFrame = (session, metadata = {}) => {
    const state = ensureState(session);
    if (!state || metadata.endCursor === undefined || metadata.sequence === undefined) {
      return false;
    }
    state.queueTurnReceivedCursor = metadata.endCursor;
    state.queueTurnReceivedSequence = metadata.sequence;
    return true;
  };

  const completeQueueTurn = (session, {
    appliedCursor = "",
    appliedSequence = "",
    socket = null,
    connectionEpoch = 0,
    channelGeneration = 0,
  } = {}) => {
    const state = ensureState(session);
    if (!state) {
      return Object.freeze({ status: "ignored" });
    }
    const cursorText = String(appliedCursor || "").trim();
    const sequenceText = String(appliedSequence || "").trim();
    if (!cursorText && !sequenceText) {
      return Object.freeze({ status: "ignored" });
    }
    const receivedCursor = String(state.queueTurnReceivedCursor ?? "").trim();
    const receivedSequence = String(state.queueTurnReceivedSequence ?? "").trim();
    if (
      !/^\d+$/.test(cursorText)
      || !/^\d+$/.test(sequenceText)
      || cursorText !== receivedCursor
      || sequenceText !== receivedSequence
    ) {
      return Object.freeze({
        status: "invalid",
        reason: "queue turn acknowledgement boundary does not match received output",
      });
    }
    const cursor = parseTerminalOutputCursor(cursorText);
    if (cursor === null) {
      return Object.freeze({
        status: "invalid",
        reason: "queue turn acknowledgement cursor is invalid",
      });
    }
    state.pendingQueueTurnAck = {
      socket,
      connectionEpoch: Number(connectionEpoch || 0),
      channelGeneration: Number(channelGeneration || 0),
      cursor,
      sequence: sequenceText,
    };
    if (flowModes.get(state) === "window-ack-v1") {
      const boundaries = ackBoundaries.get(state) || [];
      if (boundaries.length >= 512) return Object.freeze({ status: "invalid", reason: "too many unconsumed output boundaries" });
      boundaries.push(state.pendingQueueTurnAck);
      ackBoundaries.set(state, boundaries);
    }
    recordEvent(state, "queue_turn_ack_pending", {
      cursor: cursorText,
      sequence: sequenceText,
      queuedBytes: state.outputQueueSize,
    });
    const aggregateReplay = replayBatch.get(state)?.aggregate === true;
    flush(state, aggregateReplay ? {} : {
      maxBytes: flushBudgetBytes,
      maxEntries: flushMaxEntries,
      maxTimeMs: flushTimeBudgetMs,
      scheduleRemainder: true,
    });
    trySendPendingQueueTurnAck(state);
    return Object.freeze({ status: "accepted", cursor, sequence: sequenceText });
  };

  return Object.freeze({
    installSession(session) {
      if (disposed || !ensureState(session) || disposedSessions.has(session)) {
        return false;
      }
      sessions.add(session);
      return true;
    },
    write,
    getReplayBatchLimit: replayBatch.limit,
    beginReplayBatch: replayBatch.begin,
    completeReplayBatch: replayBatch.complete,
    writeImmediate,
    flush,
    scheduleFlush,
    discard,
    resetQueueTurn,
    noteQueueTurnFrame,
    completeQueueTurn,
    trySendPendingQueueTurnAck,
    getSnapshot,
    getQueuedBytes: (session) => getSnapshot(session).queuedBytes,
    getQueueEntryCount: (session) => getSnapshot(session).entryCount,
    getAppliedEntryCount: (session) => appliedEntries.get(session) || 0,
    hasQueued: (session) => getSnapshot(session).queuedBytes > 0,
    clearOverload(session) {
      const state = ensureState(session);
      if (!state) {
        return false;
      }
      state.outputOverloadPending = false;
      return true;
    },
    disposeSession(session) {
      if (!session || disposedSessions.has(session)) {
        return false;
      }
      discard(session);
      disposedSessions.add(session);
      sessions.delete(session);
      lifecycle.disposeSession(session);
      return true;
    },
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      for (const session of Array.from(sessions)) {
        discard(session);
        disposedSessions.add(session);
      }
      sessions.clear();
      lifecycle.dispose();
      return true;
    },
  });
}
