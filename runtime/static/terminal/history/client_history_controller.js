import { createTerminalHistoryCache } from "./terminal_history_cache.js";

const noop = () => {};

export function createClientTerminalHistoryController({
  windowObject = globalThis.window,
  consoleObject = globalThis.console,
  historyStore = createTerminalHistoryCache(),
  isClientTarget = () => false,
  getSessions = () => [],
  getActiveName = () => "",
  getHistoryWindowLines = () => 10000,
  requestHistoryReplay = noop,
  averageHistoryBytesPerLine = 350,
  flushBytes = 256 * 1024,
  flushDelayMs = 50,
  maxPendingBytes = 4 * 1024 * 1024,
} = {}) {
  let disposed = false;
  const inFlight = new WeakMap();
  const touching = new WeakSet();

  const uses = (session) => Boolean(!disposed && session && !session.closed && isClientTarget(session.name));

  const clearSessionSchedule = (session) => {
    if (!session) {
      return false;
    }
    if (session.historyCacheWriteFrame) {
      windowObject?.cancelAnimationFrame?.(session.historyCacheWriteFrame);
      session.historyCacheWriteFrame = 0;
    }
    if (session.historyCacheWriteTimer) {
      windowObject?.clearTimeout?.(session.historyCacheWriteTimer);
      session.historyCacheWriteTimer = 0;
    }
    return true;
  };

  const disableSession = (session, error = null) => {
    if (!session) {
      return false;
    }
    clearSessionSchedule(session);
    session.historyCacheDisabled = true;
    session.historyCacheWriteQueue = [];
    session.historyCacheWriteBytes = 0;
    session.historyCacheSnapshot = null;
    session.historyCacheReplayCommitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;
    session.historyCacheReplayCommitPending = false;
    if (error) {
      consoleObject?.warn?.("[client-terminal-history] IndexedDB disabled", {
        name: session.name,
        pane: session.id,
        error: error?.message || String(error),
      });
    }
    if (isClientTarget(session.name)) {
      historyStore.deletePane(session.name, session.id).catch(() => {});
    }
    return true;
  };

  const prepareSession = async (session) => {
    if (!session) {
      return null;
    }
    if (!uses(session)) {
      session.historyCacheDisabled = true;
      session.historyCacheLoaded = true;
      session.historyCacheSnapshot = null;
      return null;
    }
    if (session.historyCacheLoaded) {
      return session.historyCacheSnapshot;
    }
    if (session.historyCacheLoadPromise) {
      return session.historyCacheLoadPromise;
    }
    const loadSeq = Number(session.historyCacheLoadSeq || 0) + 1;
    session.historyCacheLoadSeq = loadSeq;
    session.historyCacheLoadPromise = historyStore.load(session.name, session.id)
      .then((snapshot) => {
        if (!uses(session) || session.historyCacheLoadSeq !== loadSeq) {
          return null;
        }
        session.historyCacheSnapshot = snapshot;
        if (snapshot) {
          session.historyGeneration = snapshot.generation;
          session.localBaseCursor = snapshot.baseCursor;
          session.persistedHistoryCursor = snapshot.endCursor;
        }
        return snapshot;
      })
      .catch((error) => {
        if (session.historyCacheLoadSeq === loadSeq) {
          disableSession(session, error);
        }
        return null;
      })
      .finally(() => {
        if (session.historyCacheLoadSeq === loadSeq) {
          session.historyCacheLoaded = true;
          session.historyCacheLoadPromise = null;
        }
      });
    return session.historyCacheLoadPromise;
  };

  const flushSession = (session) => {
    if (!uses(session) || session.historyCacheDisabled || session.historyCacheWriteQueue.length === 0) {
      return session?.historyCacheWritePromise || Promise.resolve();
    }
    const pending = inFlight.get(session);
    if (pending) return pending.then(() => flushSession(session));
    clearSessionSchedule(session);
    const chunks = session.historyCacheWriteQueue;
    const generation = session.historyGeneration;
    // Capture this barrier now. Reading a future reset promise inside the
    // callback can make this write wait on a reset that is waiting on it.
    const resetPromise = session.historyCacheResetPromise;
    session.historyCacheWriteQueue = [];
    session.historyCacheWriteBytes = 0;
    const promise = Promise.resolve(session.historyCacheWritePromise)
      .then(() => resetPromise)
      .then(() => historyStore.append(session.name, session.id, generation, chunks, {
        limitBytes: Math.max(1, Number(getHistoryWindowLines() || 0) * averageHistoryBytesPerLine),
      }))
      .then((result) => {
        if (!result || !uses(session) || session.historyGeneration !== generation) {
          return;
        }
        session.localBaseCursor = result.baseCursor;
        session.persistedHistoryCursor = result.endCursor;
      })
      .catch((error) => {
        if (session.historyGeneration === generation) disableSession(session, error);
      })
      .finally(() => {
        if (inFlight.get(session) === promise) inFlight.delete(session);
        if (uses(session) && !session.historyCacheDisabled && session.historyCacheWriteQueue.length > 0) {
          clearSessionSchedule(session);
          session.historyCacheWriteTimer = windowObject.setTimeout(() => {
            session.historyCacheWriteTimer = 0;
            flushSession(session);
          }, 0);
        }
      });
    inFlight.set(session, promise);
    session.historyCacheWritePromise = promise;
    return session.historyCacheWritePromise;
  };

  const queueWrite = (session, data, startCursor, endCursor) => {
    if (!uses(session) || session.historyCacheDisabled || !session.historyGeneration || !(data instanceof Uint8Array) || endCursor <= startCursor) {
      return false;
    }
    if (session.historyCacheWriteBytes + data.byteLength > maxPendingBytes || session.historyCacheWriteQueue.length >= 8192) {
      disableSession(session, new Error("Terminal history storage cannot keep up with output"));
      return false;
    }
    // A tiny tail must not retain an entire large transport ArrayBuffer.
    session.historyCacheWriteQueue.push({ startCursor, endCursor, data: data.slice() });
    session.historyCacheWriteBytes += data.byteLength;
    if (inFlight.has(session)) return true;
    if (session.historyCacheWriteBytes >= flushBytes) {
      flushSession(session);
    } else if (!session.historyCacheWriteTimer) {
      session.historyCacheWriteTimer = windowObject?.setTimeout?.(() => {
        session.historyCacheWriteTimer = 0;
        flushSession(session);
      }, flushDelayMs) || 0;
    }
    return true;
  };

  const resetSession = (session, generation, cursor) => {
    if (!uses(session)) {
      if (session) {
        session.historyCacheDisabled = true;
      }
      return false;
    }
    clearSessionSchedule(session);
    session.historyCacheDisabled = false;
    session.historyCacheWriteQueue = [];
    session.historyCacheWriteBytes = 0;
    session.historyCacheSnapshot = null;
    const previousWrites = session.historyCacheWritePromise;
    session.historyCacheResetPromise = Promise.resolve(previousWrites)
      .catch(() => {})
      .then(() => historyStore.reset(session.name, session.id, generation, cursor))
      .then((result) => {
        if (!uses(session) || session.historyGeneration !== generation) {
          return;
        }
        session.localBaseCursor = result.baseCursor;
        session.persistedHistoryCursor = result.endCursor;
      })
      .catch((error) => disableSession(session, error));
    return true;
  };

  const deleteSession = (session) => {
    if (!session || !isClientTarget(session.name)) {
      return Promise.resolve(false);
    }
    return historyStore.deletePane(session.name, session.id).catch((error) => {
      consoleObject?.warn?.("[client-terminal-history] delete failed", {
        name: session.name,
        pane: session.id,
        error: error?.message || String(error),
      });
      return false;
    });
  };

  const destroySession = async (session) => {
    if (!session || !isClientTarget(session.name)) {
      return false;
    }
    if (session.historyCacheDestroyPromise) {
      return session.historyCacheDestroyPromise;
    }
    session.historyCacheDestroyPromise = (async () => {
      clearSessionSchedule(session);
      session.historyCacheDisabled = true;
      session.historyCacheWriteQueue = [];
      session.historyCacheWriteBytes = 0;
      await Promise.allSettled([session.historyCacheResetPromise, session.historyCacheWritePromise]);
      return deleteSession(session);
    })();
    return session.historyCacheDestroyPromise;
  };

  const handleHistoryWindowChange = (previousHistoryWindow, nextHistoryWindow) => {
    if (previousHistoryWindow === nextHistoryWindow) {
      return false;
    }
    for (const session of getSessions() || []) {
      if (!isClientTarget(session?.name)) {
        continue;
      }
      clearSessionSchedule(session);
      session.historyCacheWriteQueue = [];
      session.historyCacheWriteBytes = 0;
      session.historyCacheLoaded = false;
      session.historyCacheLoadPromise = null;
      session.historyCacheLoadSeq = Number(session.historyCacheLoadSeq || 0) + 1;
      session.historyCacheSnapshot = null;
      session.historyCacheReplayCommitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;
      session.historyCacheReplayCommitPending = false;
      session.historyStateReady = false;
      session.localBaseCursor = 0n;
      session.persistedHistoryCursor = 0n;
      session.appliedHistoryCursor = 0n;
      session.historyGeneration = "";
      session.resetOnNextReplay = true;
      if (session.name === getActiveName() && !session.closed) {
        requestHistoryReplay(session);
      }
    }
    return true;
  };

  const flushAll = () => Promise.allSettled(Array.from(getSessions() || [], (session) => flushSession(session)));

  const touchAll = () => {
    for (const session of getSessions() || []) {
      if (uses(session) && !session.historyCacheDisabled && session.historyGeneration && !touching.has(session)) {
        touching.add(session);
        historyStore.touch(session.name, session.id).catch(() => {}).finally(() => touching.delete(session));
      }
    }
  };

  return Object.freeze({
    cleanupStorage: () => Promise.resolve().then(() => historyStore.cleanupExpired()),
    clearSessionSchedule,
    deleteSession,
    destroySession,
    disableSession,
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      for (const session of getSessions() || []) {
        clearSessionSchedule(session);
      }
      return true;
    },
    disposeSession(session) {
      clearSessionSchedule(session);
      if (session) {
        session.historyCacheWriteQueue = [];
        session.historyCacheWriteBytes = 0;
        session.historyCacheSnapshot = null;
      }
      return Boolean(session);
    },
    flushAll,
    flushSession,
    handleHistoryWindowChange,
    prepareSession,
    queueWrite,
    resetSession,
    touchAll,
    uses,
  });
}
