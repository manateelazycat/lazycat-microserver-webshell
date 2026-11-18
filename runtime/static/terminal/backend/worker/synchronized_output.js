// Presentation may wait for DEC 2026; byte consumption and terminal replies
// must continue. Long network redraws keep the old frame, not a history animation.
export function createSynchronizedOutput({ now = () => performance.now(), idleMs = 1000, limitMs = 2000 } = {}) {
  let startedAt = null;
  let lastOutputAt = null;
  const reset = () => { startedAt = lastOutputAt = null; };
  return {
    wrote(active) {
      if (!active) reset();
      else {
        lastOutputAt = now();
        startedAt ??= lastOutputAt;
      }
    },
    observe(active) {
      if (!active) { reset(); return 0; }
      const at = now();
      startedAt ??= at;
      return Math.max(0, Math.min(idleMs - (at - (lastOutputAt ?? startedAt)), limitMs - (at - startedAt)));
    },
    // Only a real snapshot consumes the safety release. Progress queries must not
    // restart the hold before that frame is captured, or a missing end could starve it.
    presented() { if (startedAt !== null) startedAt = now(); },
    reset,
  };
}
