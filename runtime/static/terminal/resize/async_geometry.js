// Keeps asynchronous native geometry inside the resize owner's transaction.
export function createAsyncGeometry({ onError, onSettled, recordEvent = () => {} }) {
  const operations = new Map();
  const cancel = (session, reason = "cancelled") => {
    const operation = operations.get(session);
    if (!operation) return;
    operations.delete(session);
    session.suppressTerminalResizeSend = operation.previousSuppress;
    if (reason === "cancelled") recordEvent(session, "resize_native_cancel", {
      reason, workerGeneration: operation.generation,
      durationMs: performance.now() - operation.startedAt,
      targetSize: operation.dimensions,
    });
  };
  return Object.freeze({
    isPending: (session) => operations.has(session),
    apply(session, dimensions, complete) {
      if (operations.has(session)) return operations.get(session).promise;
      const backend = session.term.wasmTerm;
      const operation = {
        epoch: session.connectionEpoch,
        generation: backend?.generation,
        startedAt: performance.now(),
        dimensions: { cols: dimensions.cols, rows: dimensions.rows },
        previousSuppress: session.suppressTerminalResizeSend === true,
      };
      const current = () => operations.get(session) === operation && !session.closed
        && session.connectionEpoch === operation.epoch && session.term.wasmTerm === backend
        && backend?.generation === operation.generation;
      session.suppressTerminalResizeSend = true;
      operations.set(session, operation);
      recordEvent(session, "resize_native_start", {
        workerGeneration: operation.generation, targetSize: operation.dimensions,
        terminalSize: { cols: session.term.cols, rows: session.term.rows },
      });
      const finish = () => {
        const active = current();
        const result = active ? complete() : false;
        recordEvent(session, "resize_native_complete", {
          current: active, committed: active && result !== false,
          durationMs: performance.now() - operation.startedAt,
          workerGeneration: operation.generation, targetSize: operation.dimensions,
          terminalSize: { cols: session.term.cols, rows: session.term.rows },
        });
        return result;
      };
      let result;
      try { result = session.term.resize(dimensions.cols, dimensions.rows); }
      catch (error) {
        cancel(session, "failed");
        recordEvent(session, "resize_native_error", { error: error?.message || String(error) });
        onError(session, error);
        return false;
      }
      if (!result?.then) {
        // Keep synchronous completion's original suppression semantics.
        cancel(session, "settled");
        try {
          const result = complete();
          recordEvent(session, "resize_native_complete", {
            current: true, committed: result !== false,
            durationMs: performance.now() - operation.startedAt, targetSize: operation.dimensions,
          });
          return result;
        }
        catch (error) { onError(session, error); return false; }
      }
      operation.promise = Promise.resolve(result).then(finish)
        .catch((error) => {
          recordEvent(session, "resize_native_error", {
            error: error?.message || String(error), current: current(),
            workerGeneration: operation.generation, targetSize: operation.dimensions,
          });
          if (current() && error?.code !== "BACKEND_CANCELLED") onError(session, error);
          return false;
        }).finally(() => {
          if (operations.get(session) !== operation) return;
          const active = current();
          cancel(session, "settled");
          if (active) {
            try { onSettled(session); }
            catch (error) { onError(session, error); }
          }
        });
      return operation.promise;
    },
    cancel,
    dispose() { for (const session of operations.keys()) cancel(session); },
  });
}
