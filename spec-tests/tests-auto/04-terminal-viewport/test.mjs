const waitForOutput = async (state, marker, timeout = 15_000) => {
  await state.page.waitForFunction((expected) => (
    String(window.__testsAutoTerminalOutput || "").includes(expected)
  ), marker, { timeout });
};

const canvasSummary = (state) => state.page.evaluate(() => {
  const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return { width: 0, height: 0, nonTransparent: 0 };
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4);
  let nonTransparent = 0;
  for (let index = 3; index < pixels.length; index += stride) {
    if (pixels[index] !== 0) nonTransparent += 1;
  }
  return { width: canvas.width, height: canvas.height, nonTransparent };
});

const unifiedSocketSnapshot = (state) => state.page.evaluate(() => {
  const unified = Array.from(window.__testsAutoSockets || [])
    .filter((socket) => String(socket.url || "").includes("mode=unified"));
  return {
    created: unified.length,
    active: unified.filter((socket) => (
      socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN
    )).length,
  };
});

const localViewportResources = (state) => state.page.evaluate(() => {
  const suffixes = [
    "/terminal/viewport/index.js",
    "/terminal/viewport/viewport_controller.js",
    "/terminal/viewport/viewport_lifecycle.js",
    "/terminal/viewport/viewport_model.js",
  ];
  const names = performance.getEntriesByType("resource").map((entry) => entry.name);
  return {
    bundleLoaded: names.some((name) => /\/assets\/[^/]+\/assets\/index-[^/]+\.js$/.test(new URL(name).pathname)),
    sourceModulesLoaded: suffixes.filter((suffix) => names.some((name) => name.endsWith(suffix))),
  };
});

const startAtomicPresentationObserver = (state) => state.page.evaluate(() => {
  const samples = [];
  let active = true;
  const sample = () => {
    if (!active) return;
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    const hold = shell?.querySelector(".terminal-frame-hold");
    const renderReady = shell?.dataset.renderReady === "true";
    const hasPresentedFrame = shell?.dataset.hasPresentedFrame === "true";
    const holdVisible = hold instanceof HTMLCanvasElement && hold.hidden === false && hold.isConnected;
    const statusStyle = shell ? getComputedStyle(shell, "::after") : null;
    const statusOpacity = Number.parseFloat(statusStyle?.opacity || "0") || 0;
    const connection = shell?.dataset.connection || "";
    samples.push({
      at: performance.now(),
      connection,
      renderReady,
      hasPresentedFrame,
      renderRecovery: shell?.dataset.renderRecovery === "true",
      holdVisible,
      unsafe: !renderReady && hasPresentedFrame && !holdVisible,
      statusOpacity,
      statusBackgroundColor: statusStyle?.backgroundColor || "",
      healthyStatusDot: connection === "open" && hasPresentedFrame && statusOpacity > 0.01,
    });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  window.__testsAutoViewportPresentationObserver = {
    samples,
    stop() {
      active = false;
    },
  };
});

const stopAtomicPresentationObserver = (state) => state.page.evaluate(() => {
  const observer = window.__testsAutoViewportPresentationObserver;
  observer?.stop?.();
  const samples = observer?.samples || [];
  const healthyStatusDotSamples = samples.filter((sample) => sample.healthyStatusDot);
  delete window.__testsAutoViewportPresentationObserver;
  return {
    count: samples.length,
    pending: samples.filter((sample) => !sample.renderReady && sample.hasPresentedFrame).length,
    hold: samples.filter((sample) => sample.holdVisible).length,
    unsafe: samples.filter((sample) => sample.unsafe).length,
    renderRecovery: samples.filter((sample) => sample.renderRecovery).length,
    healthyStatusDot: healthyStatusDotSamples.length,
    healthyStatusDotSamples: healthyStatusDotSamples.slice(0, 8),
  };
});

const installSyntheticVisualViewport = (state) => state.page.evaluate(() => {
  const viewport = window.visualViewport;
  if (!viewport) throw new Error("visualViewport unavailable");
  const originalOwnDescriptor = Object.getOwnPropertyDescriptor(viewport, "height") || null;
  const baselineHeight = Number(viewport.height || 0);
  window.__testsAutoSyntheticViewportHeight = baselineHeight;
  try {
    Object.defineProperty(viewport, "height", {
      configurable: true,
      get: () => Number(window.__testsAutoSyntheticViewportHeight || 0),
    });
  } catch (error) {
    throw new Error(`visualViewport.height cannot be overridden: ${error.message}`);
  }
  window.__testsAutoRestoreVisualViewport = () => {
    if (originalOwnDescriptor) {
      Object.defineProperty(viewport, "height", originalOwnDescriptor);
    } else {
      delete viewport.height;
    }
    delete window.__testsAutoSyntheticViewportHeight;
    delete window.__testsAutoRestoreVisualViewport;
  };
  return {
    baselineHeight,
    innerHeight: window.innerHeight,
    offsetTop: Number(viewport.offsetTop || 0),
    userAgent: navigator.userAgent,
  };
});

const setSyntheticVisualViewportHeight = (state, height) => state.page.evaluate((nextHeight) => {
  const viewport = window.visualViewport;
  window.__testsAutoSyntheticViewportHeight = nextHeight;
  viewport.dispatchEvent(new Event("resize"));
  viewport.dispatchEvent(new Event("scroll"));
}, height);

const restoreSyntheticVisualViewport = (state) => state.page.evaluate(() => {
  window.__testsAutoRestoreVisualViewport?.();
});

const viewportDOMSnapshot = (state) => state.page.evaluate(() => {
  const shell = document.querySelector(".terminal-pane.active .pane-shell");
  const textarea = shell?.querySelector(".terminal-host textarea");
  const shortcuts = document.getElementById("mobileShortcuts");
  return {
    inset: document.documentElement.style.getPropertyValue("--mobile-keyboard-inset-bottom"),
    safeOffset: document.documentElement.style.getPropertyValue("--mobile-client-bottom-safe-offset"),
    visualHeight: document.documentElement.style.getPropertyValue("--mobile-visual-viewport-height"),
    shortcutsTransform: shortcuts?.style.transform || "",
    keyboardVisible: document.body.classList.contains("mobile-keyboard-visible"),
    renderReady: shell?.dataset.renderReady === "true",
    textareaFocused: document.activeElement === textarea,
  };
});

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  const { desktop, mobile } = states;
  const desktopHost = desktop.page.locator(".terminal-pane.active .terminal-host").first();
  const mobileHost = mobile.page.locator(".terminal-pane.active .terminal-host").first();
  await desktopHost.waitFor({ state: "visible", timeout: 60_000 });
  await mobileHost.waitFor({ state: "visible", timeout: 60_000 });

  const marker = `AUTO_VIEWPORT_${Date.now()}`;
  await mobileHost.tap();
  await mobile.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable");
    textarea.focus({ preventScroll: true });
  });
  await mobile.page.keyboard.insertText(`printf '%s\\n' '${marker}'`);
  await mobile.page.keyboard.press("Enter");
  await waitForOutput(mobile, marker);
  const inputReadyState = await mobile.page.evaluate(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    const statusStyle = shell ? getComputedStyle(shell, "::after") : null;
    return {
      connection: shell?.dataset.connection || "",
      connectionRetrying: shell?.dataset.connectionRetrying === "true",
      renderReady: shell?.dataset.renderReady === "true",
      hasPresentedFrame: shell?.dataset.hasPresentedFrame === "true",
      statusOpacity: Number.parseFloat(statusStyle?.opacity || "0") || 0,
    };
  });
  if (
    inputReadyState.connectionRetrying
    || !inputReadyState.renderReady
    || !inputReadyState.hasPresentedFrame
    || inputReadyState.statusOpacity > 0.01
  ) {
    throw new Error(`mobile PTY echoed input but remained visibly unhealthy: ${JSON.stringify(inputReadyState)}`);
  }
  assertNoFatalErrors();

  const resources = await localViewportResources(mobile);
  if (!resources.bundleLoaded || resources.sourceModulesLoaded.length > 0) {
    throw new Error(`viewport code did not use the Vite bundle boundary: ${JSON.stringify(resources)}`);
  }

  const socketsBefore = await unifiedSocketSnapshot(mobile);
  const resizeFramesBeforeKeyboard = await mobile.page.evaluate(() => [...(window.__testsAutoResizeFrames || [])]);
  const synthetic = await installSyntheticVisualViewport(mobile);
  if (!/iPhone|iPad|iPod/i.test(synthetic.userAgent)) {
    throw new Error(`mobile viewport test did not enter the iOS platform branch: ${synthetic.userAgent}`);
  }
  const keyboardInset = Math.min(300, Math.max(160, Math.round(synthetic.baselineHeight * 0.36)));
  const keyboardHeight = Math.max(1, synthetic.baselineHeight - keyboardInset);
  await mobile.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable");
    textarea.focus({ preventScroll: true });
    textarea.dispatchEvent(new CompositionEvent("compositionstart", {
      data: "",
      bubbles: true,
      cancelable: true,
    }));
  });
  await setSyntheticVisualViewportHeight(mobile, keyboardHeight);
  await mobile.page.waitForTimeout(350);
  const keyboardOpen = await viewportDOMSnapshot(mobile);
  const parsedInset = Number.parseInt(keyboardOpen.inset, 10) || 0;
  if (
    parsedInset < 150
    || !keyboardOpen.keyboardVisible
    || !keyboardOpen.shortcutsTransform.includes(`-${parsedInset}px`)
    || !keyboardOpen.textareaFocused
  ) {
    throw new Error(`keyboard viewport did not apply the expected inset: ${JSON.stringify({ synthetic, keyboardOpen })}`);
  }
  const resizeFramesDuringKeyboard = await mobile.page.evaluate(() => [...(window.__testsAutoResizeFrames || [])]);
  const baselineKeyboardGeometry = resizeFramesBeforeKeyboard.at(-1) || null;
  const keyboardFrames = resizeFramesDuringKeyboard.slice(resizeFramesBeforeKeyboard.length);
  const changedKeyboardFrames = baselineKeyboardGeometry
    ? keyboardFrames.filter((frame) => (
      frame.cols !== baselineKeyboardGeometry.cols || frame.rows !== baselineKeyboardGeometry.rows
    ))
    : keyboardFrames;
  if (changedKeyboardFrames.length > 0) {
    throw new Error(`keyboard viewport changed terminal geometry during input lock: ${JSON.stringify({ baselineKeyboardGeometry, keyboardFrames })}`);
  }

  await startAtomicPresentationObserver(mobile);
  await mobile.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    textarea?.dispatchEvent(new CompositionEvent("compositionend", {
      data: "",
      bubbles: true,
      cancelable: true,
    }));
    textarea?.blur();
  });
  await setSyntheticVisualViewportHeight(mobile, synthetic.baselineHeight);
  await mobile.page.waitForTimeout(1_450);
  const keyboardPresentation = await stopAtomicPresentationObserver(mobile);
  const keyboardClosed = await viewportDOMSnapshot(mobile);
  if (
    keyboardClosed.inset !== "0px"
    || keyboardClosed.keyboardVisible
    || keyboardClosed.shortcutsTransform !== ""
  ) {
    throw new Error(`keyboard viewport did not recover after blur: ${JSON.stringify(keyboardClosed)}`);
  }
  if (keyboardPresentation.count < 10 || keyboardPresentation.healthyStatusDot > 0) {
    throw new Error(`keyboard dismiss exposed the pane status dot on a healthy presented terminal: ${JSON.stringify(keyboardPresentation)}`);
  }
  await restoreSyntheticVisualViewport(mobile);

  await startAtomicPresentationObserver(mobile);
  const resizeFramesBeforeOrientation = await mobile.page.evaluate(() => (window.__testsAutoResizeFrames || []).length);
  await mobile.page.setViewportSize({ width: 844, height: 390 });
  await mobile.page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
  await mobile.page.waitForTimeout(1_100);
  await mobile.page.setViewportSize({ width: 390, height: 844 });
  await mobile.page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
  await mobile.page.waitForTimeout(1_250);
  await mobile.page.setViewportSize({ width: 700, height: 900 });
  await mobile.page.waitForTimeout(500);
  await mobile.page.setViewportSize({ width: 390, height: 844 });
  await mobile.page.waitForTimeout(650);
  const presentation = await stopAtomicPresentationObserver(mobile);
  if (presentation.count < 10 || presentation.unsafe > 0) {
    throw new Error(`viewport resize exposed an unsafe intermediate frame: ${JSON.stringify(presentation)}`);
  }
  const resizeFramesAfterViewport = await mobile.page.evaluate(() => [...(window.__testsAutoResizeFrames || [])]);
  const resizeFramesAfterOrientation = resizeFramesAfterViewport.length;
  if (resizeFramesAfterOrientation <= resizeFramesBeforeOrientation) {
    throw new Error("orientation changes did not send a terminal resize frame");
  }
  const currentDeviceClaims = resizeFramesAfterViewport
    .slice(resizeFramesBeforeOrientation)
    .filter((frame) => frame.claim === true);
  if (currentDeviceClaims.length < 2) {
    throw new Error(`fold/orientation recovery did not claim current-device geometry: ${JSON.stringify(currentDeviceClaims)}`);
  }

  const canvas = {
    desktop: await canvasSummary(desktop),
    mobile: await canvasSummary(mobile),
  };
  if (canvas.desktop.nonTransparent <= 0 || canvas.mobile.nonTransparent <= 0) {
    throw new Error(`terminal canvas is blank after viewport recovery: ${JSON.stringify(canvas)}`);
  }
  const socketsAfter = await unifiedSocketSnapshot(mobile);
  if (
    socketsBefore.active !== 1
    || socketsAfter.active !== 1
    || socketsAfter.created !== socketsBefore.created
  ) {
    throw new Error(`viewport changes replaced the Unified socket: ${JSON.stringify({ socketsBefore, socketsAfter })}`);
  }

  const finalMarker = `AUTO_VIEWPORT_FINAL_${Date.now()}`;
  await mobileHost.tap();
  await mobile.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable after viewport recovery");
    textarea.focus({ preventScroll: true });
  });
  await mobile.page.keyboard.insertText(`printf '%s\\n' '${finalMarker}'`);
  await mobile.page.keyboard.press("Enter");
  await waitForOutput(mobile, finalMarker);

  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "terminal-viewport-real-environment",
    marker,
    finalMarker,
    inputReadyState,
    synthetic,
    keyboardOpen,
    keyboardClosed,
    keyboardPresentation,
    presentation,
    resizeFramesBeforeKeyboard: resizeFramesBeforeKeyboard.length,
    resizeFramesDuringKeyboard: resizeFramesDuringKeyboard.length,
    keyboardFrames,
    resizeFramesBeforeOrientation,
    resizeFramesAfterOrientation,
    currentDeviceClaims,
    resources,
    canvas,
    socketsBefore,
    socketsAfter,
  });
}
