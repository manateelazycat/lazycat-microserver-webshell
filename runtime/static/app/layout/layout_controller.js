const noop = () => {};
const expandedTouchMinSize = 600;

/**
 * Owns responsive layout policy and force-PC DOM synchronization. Feature
 * controllers are reached only through explicit callbacks.
 */
export function createAppLayoutController({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  mobileLayoutQuery = windowObject?.matchMedia?.("(max-width: 640px)"),
  touchShortcutLayoutQuery = windowObject?.matchMedia?.("(hover: none), (pointer: coarse)"),
  touchScreenQuery = windowObject?.matchMedia?.("(any-pointer: coarse)"),
  foldedQuery = windowObject?.matchMedia?.("(device-posture: folded)"),
  spannedQuery = windowObject?.matchMedia?.("(horizontal-viewport-segments: 2), (vertical-viewport-segments: 2)"),
  isDebugModeEnabled = () => false,
  getForcePCModeEnabled = () => false,
  getDesktopShortcutsBarEnabled = () => false,
  getMobilePixelScrollEnabled = () => true,
  getTabs = () => [],
  closeMobileActionSheet = noop,
  closeMobileCloseConfirm = noop,
  closeMobileCustomSelect = noop,
  hideSelection = noop,
  handleViewportLayoutChange = noop,
  resizeActiveTabForCurrentDevice = noop,
  handleHostLayoutChange = noop,
  updateMobileActiveTabTitle = noop,
  updateSelection = noop,
} = {}) {
  let disposed = false;
  let started = false;
  let previousLayout = null;
  let layoutFrame = 0;
  const listeners = [];

  const isForcePCModeActive = () => Boolean(
    !disposed && isDebugModeEnabled() && getForcePCModeEnabled() === true,
  );
  const isMobileLayout = () => {
    if (disposed || isForcePCModeActive()) return false;
    const touch = Boolean(touchScreenQuery?.matches || touchShortcutLayoutQuery?.matches);
    const posture = windowObject?.navigator?.devicePosture?.type;
    // Screen dimensions follow the active inner/outer display and stay stable
    // when the keyboard opens. VisualViewport height must not choose a layout.
    const screenWidth = Number(windowObject?.screen?.width || 0);
    const screenHeight = Number(windowObject?.screen?.height || 0);
    const viewportWidth = Number(documentObject?.documentElement?.clientWidth || windowObject?.innerWidth || 0);
    if (touch && viewportWidth >= expandedTouchMinSize && spannedQuery?.matches) return false;
    if (touch && screenWidth > 0 && screenHeight > 0) {
      const shortEdge = Math.min(screenWidth, screenHeight);
      if (shortEdge < expandedTouchMinSize) return true;
      if (viewportWidth >= expandedTouchMinSize) return false;
    }
    // "folded" also describes a partially bent inner screen. Available display
    // space takes precedence; posture alone cannot identify a closed cover.
    if (touch && (foldedQuery?.matches || posture === "folded")) return true;
    return Boolean(mobileLayoutQuery?.matches);
  };
  const isTouchShortcutLayout = () => !isForcePCModeActive() && Boolean(touchShortcutLayoutQuery?.matches);
  const isDesktopShortcutBarLayout = () => getDesktopShortcutsBarEnabled() === true && !isTouchShortcutLayout();
  const isTouchSelectionLayout = () => isMobileLayout() || isTouchShortcutLayout();
  const requiresTouchKeyboardDoubleTap = () => isTouchShortcutLayout();
  const isMobileCustomSelectLayout = () => isMobileLayout() || isTouchShortcutLayout();

  const syncResponsiveLayout = ({ force = false } = {}) => {
    if (disposed) {
      return false;
    }
    const active = isForcePCModeActive();
    const mobile = isMobileLayout();
    const touch = isTouchShortcutLayout();
    documentObject?.documentElement?.dataset && (documentObject.documentElement.dataset.forcePcMode = active ? "true" : "false");
    documentObject?.body?.classList?.toggle("force-pc-mode", active);
    documentObject?.body?.classList?.toggle("responsive-desktop-layout", !mobile);
    if (!force && previousLayout?.active === active && previousLayout.mobile === mobile && previousLayout.touch === touch) return false;
    previousLayout = { active, mobile, touch };
    closeMobileActionSheet();
    closeMobileCloseConfirm(false);
    closeMobileCustomSelect();
    hideSelection();
    handleHostLayoutChange();
    for (const tab of getTabs()) syncTabMobilePixelScroll(tab);
    handleViewportLayoutChange();
    resizeActiveTabForCurrentDevice();
    updateMobileActiveTabTitle();
    updateSelection();
    return true;
  };
  const syncForcePCModeState = () => syncResponsiveLayout({ force: true });
  const scheduleResponsiveLayout = () => {
    if (disposed || layoutFrame) return;
    layoutFrame = windowObject.requestAnimationFrame(() => {
      layoutFrame = 0;
      syncResponsiveLayout();
    });
  };

  const syncTerminalMobilePixelScroll = (session) => {
    if (disposed || !session?.term?.options) {
      return false;
    }
    session.term.options.mobilePixelScroll = getMobilePixelScrollEnabled() !== false && isMobileLayout();
    return true;
  };

  const syncTabMobilePixelScroll = (tab) => {
    if (disposed || !tab) {
      return false;
    }
    for (const session of tab.panes?.values?.() || []) {
      syncTerminalMobilePixelScroll(session);
    }
    return true;
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    if (layoutFrame) windowObject.cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
    for (const remove of listeners.splice(0)) remove();
    return true;
  };

  return Object.freeze({
    dispose,
    isDisposed: () => disposed,
    isDesktopShortcutBarLayout,
    isForcePCModeActive,
    isMobileCustomSelectLayout,
    isMobileLayout,
    isTouchSelectionLayout,
    isTouchShortcutLayout,
    requiresTouchKeyboardDoubleTap,
    syncResponsiveLayout,
    scheduleResponsiveLayout,
    syncForcePCModeState,
    syncTabMobilePixelScroll,
    syncTerminalMobilePixelScroll,
    start() {
      if (started || disposed) return false;
      started = true;
      const handleChange = () => scheduleResponsiveLayout();
      for (const query of [mobileLayoutQuery, touchShortcutLayoutQuery, touchScreenQuery, foldedQuery, spannedQuery]) {
        if (query?.addEventListener) {
          query.addEventListener("change", handleChange);
          listeners.push(() => query.removeEventListener("change", handleChange));
        } else if (query?.addListener) {
          query.addListener(handleChange);
          listeners.push(() => query.removeListener(handleChange));
        }
      }
      for (const target of [windowObject?.screen?.orientation, windowObject?.navigator?.devicePosture]) {
        if (!target?.addEventListener) continue;
        target.addEventListener("change", handleChange);
        listeners.push(() => target.removeEventListener("change", handleChange));
      }
      syncResponsiveLayout();
      return true;
    },
  });
}
