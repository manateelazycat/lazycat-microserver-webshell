// Bytes stay in the output owner's bounded queue; this owns batch admission
// and the receive/parse boundary for a negotiated full snapshot.
export function createReplayBatch({ maxQueuedBytes, now, recordEvent }) {
  const batches = new WeakMap();
  const limit = (session) => session?.term?.wasmTerm?.isRemote
    ? Math.max(0, Math.min(3500000, maxQueuedBytes - 512 * 1024)) : 0;
  const get = (session) => {
    const batch = batches.get(session);
    if (batch && (batch.generation !== session.outputQueueGeneration || batch.connectionEpoch !== session.connectionEpoch)) {
      batches.delete(session);
      return null;
    }
    return batch || null;
  };
  return Object.freeze({
    limit,
    get,
    begin(session, message) {
      batches.delete(session);
      const bytes = Number(message.replay_burst_bytes || 0);
      // Inclusive: a completely full 10,000-line history is 3,500,000 bytes.
      if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > limit(session) || message.sync_mode !== "snapshot") return false;
      const start = String(message.delta_from_cursor || "");
      const end = String(message.delta_to_cursor || "");
      if (!/^\d+$/.test(start) || !/^\d+$/.test(end) || BigInt(end) - BigInt(start) !== BigInt(bytes)) return false;
      batches.set(session, {
        bytes, start: BigInt(start), end: BigInt(end), waiting: true, aggregate: true,
        generation: session.outputQueueGeneration, connectionEpoch: session.connectionEpoch,
        startedAt: now(), receivedAt: 0,
      });
      recordEvent(session, "replay_batch_begin", { bytes, targetCursor: end });
      return true;
    },
    complete(session) {
      const batch = get(session);
      if (!batch) return false;
      batch.waiting = false;
      batch.receivedAt = now();
      recordEvent(session, "replay_batch_received", {
        bytes: batch.bytes, durationMs: batch.receivedAt - batch.startedAt, aggregate: batch.aggregate,
      });
      return true;
    },
    interrupt(session) {
      const batch = get(session);
      if (!batch?.aggregate) return;
      batch.waiting = false;
      batch.aggregate = false;
      recordEvent(session, "replay_batch_interrupted", { reason: "ordered_output_drain", bytes: batch.bytes });
    },
    applied(session) {
      const batch = get(session);
      if (!batch || session.appliedHistoryCursor < batch.end) return;
      batches.delete(session);
      recordEvent(session, "replay_batch_applied", {
        bytes: batch.bytes, aggregate: batch.aggregate,
        durationMs: now() - (batch.receivedAt || batch.startedAt),
      });
    },
    discard(session) { batches.delete(session); },
  });
}
