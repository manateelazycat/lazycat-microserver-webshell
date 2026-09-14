export const createTerminalFrameReleaseScheduler = ({
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (handle) => window.cancelAnimationFrame(handle),
} = {}) => {
  const states = new WeakMap();
  const pending = new Set();
  let disposed = false;

  const cancel = (target) => {
    const state = states.get(target);
    if (!state) {
      return false;
    }
    if (state.frame) {
      cancelFrame(state.frame);
    }
    pending.delete(state);
    states.delete(target);
    return true;
  };

  const schedule = (target, { shouldRelease, release } = {}) => {
    if (
      disposed
      || !target
      || (typeof target !== "object" && typeof target !== "function")
      || typeof shouldRelease !== "function"
      || typeof release !== "function"
    ) {
      return false;
    }
    const scheduled = states.get(target);
    if (scheduled) {
      // New valid commits update the checks, not the release deadline.
      scheduled.shouldRelease = shouldRelease;
      scheduled.release = release;
      return true;
    }
    const state = { frame: 0, target, shouldRelease, release };
    states.set(target, state);
    pending.add(state);
    state.frame = requestFrame(() => {
      if (states.get(target) !== state) {
        return;
      }
      state.frame = 0;
      pending.delete(state);
      states.delete(target);
      if (state.shouldRelease()) state.release();
    });
    return true;
  };

  const dispose = () => {
    disposed = true;
    for (const state of pending) {
      if (state.frame) {
        cancelFrame(state.frame);
      }
      states.delete(state.target);
    }
    pending.clear();
  };

  return {
    schedule,
    cancel,
    dispose,
  };
};
