const fallbackViewport = () => ({
  atBottom: true,
  viewportY: 0,
  targetViewportY: 0,
});

export function createTerminalViewportController({
  captureViewport = () => null,
  cancelFrame = (frame) => globalThis.cancelAnimationFrame?.(frame),
} = {}) {
  const stopScrollAnimation = (term) => {
    if (!term?.scrollAnimationFrame) {
      return;
    }
    cancelFrame(term.scrollAnimationFrame);
    term.scrollAnimationFrame = undefined;
    term.scrollAnimationStartTime = undefined;
    term.scrollAnimationStartY = undefined;
    term.scrollAnimationLastFrameTime = undefined;
  };

  const isAlternateScreen = (term) => Boolean(
    term?.wasmTerm?.isAlternateScreen?.()
    || term?.buffer?.active?.type === "alternate"
  );

  return Object.freeze({
    capture(term) {
      return captureViewport(term) || fallbackViewport();
    },

    restore(term, viewport) {
      if (!term || !viewport) {
        return false;
      }
      if (term.wasmTerm?.isRemote) {
        // Worker resize leaves the UI scroll position untouched. Keep any user
        // scroll made while awaiting it, then clamp against the returned grid.
        term.normalizeViewportBounds?.(term.viewportY);
        return true;
      }
      stopScrollAnimation(term);
      if (isAlternateScreen(term) || viewport.atBottom) {
        term.viewportY = 0;
        term.targetViewportY = 0;
        return true;
      }
      const scrollback = Math.max(0, Number(term.getScrollbackLength?.() || 0));
      term.viewportY = Math.max(0, Math.min(scrollback, viewport.viewportY));
      term.targetViewportY = Math.max(0, Math.min(scrollback, viewport.targetViewportY));
      return true;
    },
  });
}
