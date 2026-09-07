import { createTerminalOutputLifecycle } from "./output_lifecycle.js";
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
const TERMINAL_OUTPUT_WRITE_SLICE_BYTES = 32 * 1024;
export const TERMINAL_OUTPUT_QUEUE_SOFT_LIMIT_BYTES = 1 * 1024 * 1024;
export const MAX_QUEUED_TERMINAL_OUTPUT_BYTES = 4 * 1024 * 1024;

const noop = () => {};

export function createTerminalOutputController({
  windowObject = globalThis.window,
  getActiveName = () => "",
  isReplayCommitted = () => false,
  getResizeTransition = () => ({ active: false, outputSettleActive: false }),
  noteResizeOutput = noop,
  requestHistoryReplay = noop,
  finishHistoryReplayIfReady = () => false,
  queueHistoryCacheWrite = noop,
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
  const lifecycle = lifecycleFactory({ windowObject });
  const sessions = new Set();
  const disposedSessions = new WeakSet();
  let disposed = false;

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
    });
  };

  const handleOverload = (session, reason) => {
    const state = ensureState(session);
    if (!state || state.closed || state.outputOverloadPending) {
      return false;
    }
    state.outputOverloadPending = true;
    recordMetric("outputOverloads");
    globalThis.console?.warn?.("[terminal-output] queue overload; requesting cursor resync", {
      name: state.name,
      pane: state.id,
      queuedBytes: state.outputQueueSize,
      reason,
    });
    requestHistoryReplay(state);
    return true;
  };

  const writeBatch = (session, data, replayOutput, allowGeneratedInput, suppressRender = false) => {
    const kind = terminalOutputKind(data);
    if (!kind || (kind === "text" ? data.length === 0 : data.byteLength === 0)) {
      return false;
    }
    const previousAllowGeneratedInput = session.allowGeneratedInputDuringReplay;
    if (replayOutput) {
      session.allowGeneratedInputDuringReplay = allowGeneratedInput === true;
      armReplayGeneratedSuppression(session);
      session.replayOutputDepth = Number(session.replayOutputDepth || 0) + 1;
    }
    const replayWriter = (replayOutput || suppressRender) && typeof session.term.writeReplay === "function";
    try {
      if (replayWriter) {
        recordEvent(session, replayOutput ? "write_replay" : "write_suppressed", {
          bytes: terminalOutputByteLength(data),
          reason: replayOutput ? "history_replay" : "resize_output_settle",
        });
      }
      recordMetric("terminalOutputBatches");
      recordMetric("terminalOutputBytes", terminalOutputByteLength(data));
      measureTask("terminal write", () => {
        if (replayWriter) {
          session.term.writeReplay(data);
        } else {
          session.term.write(data);
        }
      });
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
      if (replayOutput) {
        session.replayOutputDepth = Math.max(0, Number(session.replayOutputDepth || 0) - 1);
        session.allowGeneratedInputDuringReplay = previousAllowGeneratedInput;
      }
    }
  };

  const trySendPendingQueueTurnAck = (session) => {
    const state = ensureState(session);
    const pending = state?.pendingQueueTurnAck;
    if (!pending || state.closed || state.socket !== pending.socket || state.connectionChannel !== "unified") {
      return false;
    }
    if (
      Number(state.connectionEpoch || 0) !== pending.connectionEpoch
      || Number(state.connectionChannelGeneration || 0) !== pending.channelGeneration
      || state.outputQueueSize > 0
      || state.appliedHistoryCursor !== pending.cursor
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
      state.pendingQueueTurnAck = null;
      recordEvent(state, "queue_turn_ack_sent", {
        cursor: pending.cursor.toString(),
        sequence: String(pending.sequence),
      });
      return true;
    } catch (error) {
      state.pendingQueueTurnAck = null;
      recoverQueueTurnAck(state, pending, error);
      return false;
    }
  };

  const flush = (session, {
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
    lifecycle.clear(state);
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
    let drained = false;
    measureTask("output flush", () => {
      const flushQueue = [];
      let flushedBytes = 0;
      const requestedBudgetBytes = Math.max(0, Math.floor(Number(maxBytes) || 0));
      const requestedEntryLimit = Math.max(0, Math.floor(Number(maxEntries) || 0));
      const requestedTimeBudgetMs = Math.max(0, Number(maxTimeMs) || 0);
      const budgetBytes = requestedBudgetBytes || (queue[0]?.replayOutput
        ? replayWriteBatchBytes
        : flushBudgetBytes);
      // Small transport frames must coalesce before the default work limit is
      // applied. Eight 110-byte frames per animation tick cannot keep up with
      // normal PTY output. Explicit entry limits still bound resize/ACK drains.
      const entryLimit = requestedEntryLimit;
      const batchLimit = force || queue[0]?.replayOutput ? 0 : flushMaxBatches;
      const timeBudgetMs = requestedTimeBudgetMs || (force ? 0 : flushTimeBudgetMs);
      const unlimited = force && !requestedBudgetBytes && !requestedEntryLimit && !requestedTimeBudgetMs;
      const drainStartedAt = now();
      let wrote = false;
      let consumed = 0;
      let flushedBatches = 0;
      while (state.outputQueue.length > 0) {
        const pending = state.outputQueue;
        if (consumed > 0 && (
          (entryLimit > 0 && consumed >= entryLimit)
          || (batchLimit > 0 && flushedBatches >= batchLimit)
          || (!unlimited && flushedBytes + pending[0].byteLength > budgetBytes)
          || (timeBudgetMs > 0 && now() - drainStartedAt >= timeBudgetMs)
        )) break;
        const first = pending[0];
        const batch = { ...first, chunks: [], byteLength: 0 };
        let batchEntries = 0;
        const sliceBytes = Math.min(TERMINAL_OUTPUT_WRITE_SLICE_BYTES, first.replayOutput ? replayWriteBatchBytes : flushBudgetBytes);
        while (batchEntries < pending.length) {
          const entry = pending[batchEntries];
          if (batch.chunks.length > 0 && (
            batch.kind !== entry.kind
            || batch.replayOutput !== entry.replayOutput
            || batch.suppressRender !== entry.suppressRender
            || batch.allowGeneratedInput !== entry.allowGeneratedInput
            || batch.historyCacheable !== entry.historyCacheable
            || (batch.historyEndCursor !== null && entry.historyStartCursor !== batch.historyEndCursor)
            || batch.byteLength + entry.byteLength > sliceBytes
            || (entryLimit > 0 && consumed >= entryLimit)
            || (!unlimited && flushedBytes + entry.byteLength > budgetBytes)
            || (timeBudgetMs > 0 && now() - drainStartedAt >= timeBudgetMs)
          )) break;
          batch.chunks.push(entry.data);
          batch.byteLength += entry.byteLength;
          batch.historyEndCursor = entry.historyEndCursor;
          flushQueue.push(entry);
          flushedBytes += entry.byteLength;
          consumed += 1;
          batchEntries += 1;
        }
        // Remove only this batch before invoking callbacks. A reset during write
        // must not reintroduce retired output or overwrite a replacement queue.
        state.outputQueue = pending.slice(batchEntries);
        state.outputQueueSize = Math.max(0, state.outputQueueSize - batch.byteLength);
        const data = coalesceTerminalOutputBatch(batch.chunks, batch.kind, batch.byteLength);
        flushedBatches += 1;
        if (writeBatch(state, data, batch.replayOutput, batch.allowGeneratedInput, batch.suppressRender)) {
          if (state.closed || state.outputQueueGeneration !== first.queueGeneration) break;
          wrote = true;
          if (batch.historyEndCursor !== null) {
            state.appliedHistoryCursor = batch.historyEndCursor;
            if (batch.historyCacheable && data instanceof Uint8Array) {
              queueHistoryCacheWrite(state, data, batch.historyStartCursor, batch.historyEndCursor);
            }
          }
        }
      }

      if (wrote) {
        resetHostViewport(state, { clean: true });
        positionInput(state);
        schedulePresentationValidation(state);
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
      if (!drained && scheduleRemainder) {
        lifecycle.schedule(state, () => flush(state), flushFallbackMs);
      } else {
        finishHistoryReplayIfReady(state);
      }
    });
    return drained;
  };

  const scheduleFlush = (session) => {
    const state = ensureState(session);
    if (!state || disposed || disposedSessions.has(state) || state.closed) {
      return false;
    }
    return lifecycle.schedule(state, () => flush(state), flushFallbackMs);
  };

  const write = (session, data, {
    historySource = "server",
    startCursor = null,
    endCursor = null,
    deferRender = false,
  } = {}) => {
    const state = ensureState(session);
    if (
      disposed
      || !state?.term
      || state.closed
      || disposedSessions.has(state)
      || state.name !== getActiveName()
    ) {
      return false;
    }
    const outputData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const kind = terminalOutputKind(outputData);
    if (!kind) {
      return false;
    }
    if (state.outputQueueSize >= maxQueuedBytes) {
      handleOverload(state, "queued output would exceed hard limit");
      return false;
    }
    const replayOutput = !isReplayCommitted(state);
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
    const enqueueEntry = (entryData) => {
      const byteLength = terminalOutputByteLength(entryData);
      if (byteLength <= 0) {
        return true;
      }
      if (state.outputQueueSize + byteLength > maxQueuedBytes) {
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
        historyCacheable: historySource === "server" && historyEndCursor !== null,
        historyStartCursor,
        historyEndCursor,
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
    } else if (state.outputQueueSize >= queueSoftLimitBytes) {
      flush(state);
    } else {
      scheduleFlush(state);
    }
    return true;
  };

  const writeImmediate = (session, data) => {
    const state = ensureState(session);
    if (disposed || !state?.term || state.closed || disposedSessions.has(state)) {
      return false;
    }
    flush(state, { force: true });
    if (state.closed) {
      return false;
    }
    const writeStartedAt = state.startupTraceActive ? now() : 0;
    measureTask("terminal render", () => state.term.write(data));
    if (state.startupTraceActive) {
      appendStartupTrace(
        "终端写入完成",
        `pane=${state.id} bytes=${data?.byteLength || 0} duration=${Math.round(now() - writeStartedAt)}ms`,
        { dedupeKey: `terminal-write:${state.id}` },
      );
    }
    state.lastTerminalOutputAt = now();
    if (isRenderAllowed(state)) {
      state.term.requestRender?.({ throttle: true });
    }
    advanceContentGeneration(state);
    drainGeneratedResponses(state);
    deferHiddenRender(state);
    resetHostViewport(state, { clean: true });
    positionInput(state);
    schedulePresentationValidation(state);
    return true;
  };

  const discard = (session) => {
    const state = ensureState(session);
    if (!state) {
      return false;
    }
    lifecycle.clear(state);
    state.outputQueueGeneration = Number(state.outputQueueGeneration || 0) + 1;
    state.outputQueue = [];
    state.outputQueueSize = 0;
    state.pendingQueueTurnAck = null;
    onDiscard(state);
    return true;
  };

  const resetQueueTurn = (session) => {
    const state = ensureState(session);
    if (!state) {
      return false;
    }
    state.queueTurnReceivedCursor = null;
    state.queueTurnReceivedSequence = null;
    state.pendingQueueTurnAck = null;
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
    recordEvent(state, "queue_turn_ack_pending", {
      cursor: cursorText,
      sequence: sequenceText,
      queuedBytes: state.outputQueueSize,
    });
    flush(state, {
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
