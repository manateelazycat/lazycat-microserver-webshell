// Watches obligations, not output silence: idle shells are healthy.
export function createTerminalSessionHealthController({
  windowObject = globalThis.window,
  now = () => performance.now(),
  isCommitted = () => false,
  getOutput = () => ({}),
  getResize = () => ({}),
  isOnline = () => true,
  recover = () => {},
  report = () => {},
  stalledMs = 12000,
  retryLimit = 3,
} = {}) {
  const states = new Map();
  let disposed = false;
  let lastCheckAt = now();
  const recoveryIsPresented = (session) => isCommitted(session) && session.renderReady && session.hasPresentedFrame
    && session.presentedReplayGeneration === session.terminalReplayGeneration;
  const stateFor = (session) => {
    let state = states.get(session);
    if (!state) states.set(session, state = {
      epoch: session.connectionEpoch,
      attempts: 0,
      timer: null,
      stableAt: now(),
      output: null,
      resize: null,
      recovering: false,
      recoveryProgress: "",
      recoveryProgressAt: now(),
    });
    return state;
  };
  const fail = (session, reason) => {
    if (disposed || !session || session.closed || session.exitExpected) return false;
    const state = stateFor(session);
    state.stableAt = now();
    if (state.timer !== null || state.exhausted) return false;
    // Retired operations must not restart a healthy replacement Worker.
    if (state.recovering && !session.term?.wasmTerm?.failed) return false;
    state.recovering = false;
    state.attempts += 1;
    if (state.attempts > retryLimit) {
      state.exhausted = true;
      report(session, reason, true);
      return false;
    }
    report(session, reason, false);
    state.timer = windowObject.setTimeout(() => {
      state.timer = null;
      if (disposed || session.closed || session.exitExpected) return;
      state.output = state.resize = null;
      state.recovering = true;
      state.recoveryProgress = "";
      state.recoveryProgressAt = now();
      try {
        if (recover(session, reason) === false) {
          state.recovering = false;
          fail(session, "terminal recovery could not start");
        }
      } catch (error) {
        state.recovering = false;
        fail(session, error?.message || String(error));
      }
    }, Math.min(4000, 250 * 2 ** (state.attempts - 1)));
    return true;
  };
  const inspect = (state, key, pending, progress, at) => {
    if (!pending) { state[key] = null; return false; }
    state.stableAt = at;
    if (!state[key] || state[key].progress !== progress) {
      state[key] = { progress, at };
      return false;
    }
    return at - state[key].at >= stalledMs;
  };
  return Object.freeze({
    fail,
    completeRecovery(session) {
      const state = states.get(session);
      if (!state?.recovering || !recoveryIsPresented(session)) return false;
      state.recovering = false;
      state.output = state.resize = null;
      state.stableAt = now();
      return true;
    },
    check(sessions) {
      if (disposed) return;
      const at = now();
      const resumed = at - lastCheckAt > stalledMs;
      lastCheckAt = at;
      for (const session of sessions || []) {
        if (!session || session.closed || session.exitExpected) continue;
        const state = stateFor(session);
        if (resumed || !isOnline()) {
          state.output = state.resize = null;
          state.stableAt = at;
          state.recoveryProgressAt = at;
          continue;
        }
        if (state.epoch !== session.connectionEpoch) {
          if (state.exhausted) {
            state.exhausted = false;
            state.attempts = 0;
          }
          state.epoch = session.connectionEpoch;
          state.output = state.resize = null;
          state.stableAt = at;
        }
        if (state.recovering && state.timer === null && !state.exhausted) {
          if (recoveryIsPresented(session)) {
            state.recovering = false;
            state.output = state.resize = null;
            state.stableAt = at;
          } else {
            const backend = session.term?.wasmTerm;
            const progress = [session.connectionEpoch, backend?.generation, backend?.isReady,
              backend?.progress?.revision ?? backend?.frame?.revision, session.terminalReplayGeneration, session.appliedHistoryCursor,
              session.appliedResizeEpoch].join(":");
            if (progress !== state.recoveryProgress) {
              state.recoveryProgress = progress;
              state.recoveryProgressAt = at;
            } else if (at - state.recoveryProgressAt >= stalledMs) {
              state.recovering = false;
              fail(session, "terminal recovery stopped advancing");
            }
            continue;
          }
        }
        if (!isCommitted(session) || state.timer !== null || state.exhausted) {
          state.stableAt = at;
          continue;
        }
        const output = getOutput(session);
        const resize = getResize(session);
        const outputStalled = inspect(state, "output", output.queuedBytes > 0 || output.pendingAck,
          `${output.parsedBytes}:${output.appliedCursor}:${output.pendingAckCursor || ""}`, at);
        const resizeStalled = inspect(state, "resize", resize.resizeAckPending || resize.resizeFenceActive || resize.resizeOutputSettleActive || resize.nativePending,
          `${resize.appliedResizeEpoch}:${resize.resizeFenceActive}:${resize.resizeOutputSettleActive}:${resize.fenceDrainEntries}:${resize.settleDrainEntries}`, at);
        if (outputStalled || resizeStalled) {
          fail(session, outputStalled ? "terminal output stopped advancing" : "terminal resize stopped advancing");
        } else if (!state.output && !state.resize && session.renderReady && at - state.stableAt >= 30000) {
          state.attempts = 0;
        }
      }
    },
    disposeSession(session) {
      const state = states.get(session);
      if (state?.timer !== null && state?.timer !== undefined) windowObject.clearTimeout(state.timer);
      states.delete(session);
    },
    dispose() {
      disposed = true;
      for (const state of states.values()) if (state.timer !== null) windowObject.clearTimeout(state.timer);
      states.clear();
    },
  });
}
