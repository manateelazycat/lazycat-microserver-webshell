const AUTO_HIDE_DELAY_MS = 2000;

export function createDesktopSidebarRevealController({ documentObject, windowObject, region, button }) {
  const hoverQuery = windowObject.matchMedia("(hover: hover) and (pointer: fine)");
  let enabled = false;
  let hideTimer = 0;

  const clearTimer = () => {
    if (hideTimer) windowObject.clearTimeout(hideTimer);
    hideTimer = 0;
  };

  const reveal = () => {
    clearTimer();
    button.classList.remove("is-auto-hidden");
    if (!enabled || !hoverQuery.matches) return;
    hideTimer = windowObject.setTimeout(() => {
      hideTimer = 0;
      button.classList.add("is-auto-hidden");
    }, AUTO_HIDE_DELAY_MS);
  };

  const onPointerMove = (event) => {
    if (!enabled || !hoverQuery.matches || event.pointerType === "touch" || event.buttons) return;
    // The region stays in place while the button slides away, and never
    // intercepts terminal clicks or selection underneath it.
    const rect = region.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom) reveal();
  };

  documentObject.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  hoverQuery.addEventListener("change", reveal);

  return Object.freeze({
    setEnabled(value) {
      if (enabled === value) return;
      enabled = value;
      if (enabled && hoverQuery.matches) {
        // Commit the offscreen position after display:none so the first
        // appearance follows the same slide-in path as later reveals.
        button.classList.add("is-auto-hidden");
        button.getBoundingClientRect();
      }
      reveal();
    },
    dispose() {
      enabled = false;
      clearTimer();
      documentObject.removeEventListener("pointermove", onPointerMove, true);
      hoverQuery.removeEventListener("change", reveal);
      button.classList.remove("is-auto-hidden");
    },
  });
}
