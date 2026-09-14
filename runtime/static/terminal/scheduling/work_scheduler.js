// One page-wide budget. Domain owners retain ordering, protocol and recovery.
export function createTerminalWorkScheduler({
  windowObject = globalThis.window,
  now = () => performance.now(),
  budgetMs = 8,
  fallbackMs = 32,
  onError = (_owner, _key, error) => console.error(error),
} = {}) {
  const owners = new Map();
  let frame = null;
  let timer = null;
  let spent = 0;
  let running = 0;
  let runStartedAt = 0;
  let sequence = 0;
  let disposed = false;

  const clearWake = () => {
    if (frame !== null) windowObject.cancelAnimationFrame(frame);
    if (timer !== null) windowObject.clearTimeout(timer);
    frame = timer = null;
  };
  const remainingMs = () => Math.max(0, budgetMs - spent - (running ? now() - runStartedAt : 0));
  const measure = (callback) => {
    const outer = running++ === 0;
    if (outer) runStartedAt = now();
    try {
      return callback();
    } finally {
      running -= 1;
      if (outer) spent += Math.max(0, now() - runStartedAt);
    }
  };
  const arm = () => {
    if (disposed || frame !== null || timer !== null) return;
    frame = windowObject.requestAnimationFrame(pump);
    timer = windowObject.setTimeout(pump, fallbackMs);
  };
  const cancel = (owner, key) => {
    const entries = owners.get(owner);
    const removed = entries?.delete(key) === true;
    if (entries?.size === 0) owners.delete(owner);
    return removed;
  };
  const pump = () => {
    clearWake();
    if (disposed) return;
    spent = 0;
    const at = now();
    // A task gets at most one turn per pump; newly enqueued work yields.
    const ready = [...owners.values()].flatMap((entries) => [...entries.values()])
      .filter((task) => task.dueAt <= at)
      .sort((a, b) => {
        const score = (task) => Number(task.priority?.() || 0) + Math.floor((at - task.queuedAt) / 100);
        return score(b) - score(a) || a.sequence - b.sequence;
      });
    for (const task of ready) {
      if (disposed || remainingMs() <= 0) break;
      if (owners.get(task.owner)?.get(task.key) !== task) continue;
      cancel(task.owner, task.key);
      try {
        const result = measure(task.callback);
        if (result && typeof result.catch === "function") result.catch((error) => onError(task.owner, task.key, error));
      } catch (error) {
        try { onError(task.owner, task.key, error); } catch (reportError) { console.error(reportError); }
      }
    }
    if (owners.size) arm();
  };

  return Object.freeze({
    schedule(owner, key, callback, { priority = () => 0, delayMs = 0 } = {}) {
      if (disposed || !owner || typeof callback !== "function") return false;
      let entries = owners.get(owner);
      if (!entries) owners.set(owner, entries = new Map());
      const previous = entries.get(key);
      entries.set(key, {
        owner, key, callback, priority,
        queuedAt: previous?.queuedAt ?? now(),
        sequence: previous?.sequence ?? sequence++,
        dueAt: now() + Math.max(0, delayMs),
      });
      arm();
      return true;
    },
    cancel,
    cancelOwner: (owner) => owners.delete(owner),
    remainingMs,
    isRunning: () => running > 0,
    // Synchronous protocol fences can consume the remaining budget, but cannot
    // grant themselves a fresh per-pane budget or an unlimited force drain.
    runNow(callback) {
      if (disposed || remainingMs() <= 0) { arm(); return false; }
      arm();
      return measure(callback);
    },
    dispose() {
      disposed = true;
      clearWake();
      owners.clear();
    },
  });
}
