// Optional presentation-only watchdog. Never changes terminal contents or PTY geometry.
export function createTerminalScreenRefreshController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  getSessions = () => [],
  presentation,
  resize,
  workScheduler,
  recordEvent = () => {},
  now = () => performance.now(),
  intervalMs = 1000,
  settleMs = 500,
  retryLimit = 3,
} = {}) {
  const owner = {};
  const states = new Map();
  let enabled = false;
  let disposed = false;
  let timer = null;
  let generation = 0;

  const visible = (session) => !documentObject?.hidden && session && !session.closed
    && !session.exitExpected && resize?.isVisible(session) === true;
  const identity = (session) => [session.connectionEpoch, session.term?.wasmTerm?.generation,
    session.terminalReplayGeneration, session.measuredFitGeneration, session.appliedResizeEpoch].join(":");
  const ready = (session) => visible(session) && presentation?.isRenderAllowed(session) === true
    && resize?.isMeasurable(session) === true && resize?.canvasMatchesExpectedSize(session) === true
    && !resize?.isLiveGeometryActive(session) && !session.activationFitPending
    && !session.resizePresentationHold && !session.terminalFrameHeld
    && !session.presentationCommitPending && !session.term?.renderSuppressionDepth
    && (!session.term?.wasmTerm?.isRemote || session.term.wasmTerm.isFrameReady);

  const clear = () => {
    generation += 1;
    if (timer !== null) windowObject.clearTimeout(timer);
    timer = null;
    workScheduler?.cancelOwner(owner);
    states.clear();
  };
  const arm = () => {
    if (!enabled || disposed || documentObject?.hidden || timer !== null) return;
    timer = windowObject.setTimeout(check, intervalMs);
  };
  const check = () => {
    timer = null;
    if (!enabled || disposed || documentObject?.hidden) return;
    const sessions = new Set(getSessions());
    for (const session of states.keys()) {
      if (!sessions.has(session) || !visible(session)) {
        workScheduler?.cancel(owner, session);
        states.delete(session);
      }
    }
    for (const session of sessions) {
      if (!visible(session)) continue;
      const key = identity(session);
      let state = states.get(session);
      if (!state || state.key !== key) {
        workScheduler?.cancel(owner, session);
        state = { key, attempts: 0, checked: false, pending: false, eligibleAt: null, staleAt: null };
        states.set(session, state);
      }
      if (!ready(session)) { state.eligibleAt = null; state.staleAt = null; continue; }
      const at = now();
      state.eligibleAt ??= at;
      const current = presentation?.isCurrent(session) === true;
      const progress = [session.presentedContentGeneration, session.presentedFitGeneration,
        session.presentedReplayGeneration, session.presentedResizeEpoch].join(":");
      // Busy TUIs can be one frame behind while still making healthy progress.
      state.staleAt = current ? null : (progress !== state.progress ? at : (state.staleAt ?? at));
      state.progress = progress;
      // One delayed repaint after activation, then only persistent stale presentation.
      if (state.attempts >= retryLimit) {
        if (!current && at - state.staleAt >= settleMs && !state.exhaustedReported) {
          state.exhaustedReported = true;
          recordEvent(session, "screen_auto_refresh_exhausted", { attempts: state.attempts });
        }
        continue;
      }
      if (state.pending || at - state.eligibleAt < settleMs
        || (state.checked && (current || at - state.staleAt < settleMs))) continue;
      const token = generation;
      const reason = state.checked ? "stale_presentation" : "activation";
      state.pending = true;
      const draw = () => {
        state.pending = false;
        if (!enabled || disposed || token !== generation || states.get(session) !== state
          || identity(session) !== key || !ready(session)) return;
        if (state.checked && presentation.isCurrent(session)) return;
        state.attempts += 1;
        state.checked = true;
        const rendered = presentation.renderFullNow(session) === true;
        recordEvent(session, "screen_auto_refresh", { reason, attempt: state.attempts, rendered });
      };
      if (workScheduler) {
        if (!workScheduler.schedule(owner, session, draw, { priority: () => -10 })) state.pending = false;
      } else {
        draw();
      }
    }
    arm();
  };
  const resume = () => { clear(); arm(); };
  const listen = (method) => {
    documentObject?.[method]?.("visibilitychange", resume);
    windowObject?.[method]?.("pageshow", resume);
    windowObject?.[method]?.("focus", resume);
  };
  const setEnabled = (value) => {
    if (disposed || enabled === (value === true)) return;
    enabled = value === true;
    clear();
    listen(enabled ? "addEventListener" : "removeEventListener");
    arm();
  };
  return Object.freeze({
    setEnabled,
    dispose() {
      if (disposed) return;
      setEnabled(false);
      disposed = true;
    },
  });
}
