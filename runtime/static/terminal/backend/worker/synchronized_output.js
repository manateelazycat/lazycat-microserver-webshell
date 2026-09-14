// Presentation may wait for DEC 2026; byte consumption and terminal replies
// must continue. A missing end sequence must not freeze the display forever.
export function createSynchronizedOutput({ now = () => performance.now(), limitMs = 1000 } = {}) {
  let startedAt = null;
  return {
    observe(active) {
      if (!active) startedAt = null;
      else startedAt ??= now();
      return active ? Math.max(0, limitMs - (now() - startedAt)) : 0;
    },
    reset() { startedAt = null; },
  };
}
