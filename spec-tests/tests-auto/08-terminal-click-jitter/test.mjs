const readPresentationSample = async (page) => page.evaluate(() => {
  const shell = document.querySelector(".terminal-pane.active .pane-shell");
  const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return {
      width: 0,
      height: 0,
      nonTransparent: 0,
      renderReady: shell?.dataset?.renderReady || "",
      hasPresentedFrame: shell?.dataset?.hasPresentedFrame || "",
      resizeFrames: (window.__testsAutoResizeFrames || []).length,
    };
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data || new Uint8ClampedArray();
  const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4);
  let nonTransparent = 0;
  let nonBlack = 0;
  let sampleHash = 2166136261;
  for (let index = 0; index < pixels.length; index += stride) {
    const red = pixels[index] || 0;
    const green = pixels[index + 1] || 0;
    const blue = pixels[index + 2] || 0;
    const alpha = pixels[index + 3] || 0;
    if (alpha !== 0) nonTransparent += 1;
    if (alpha !== 0 && (red !== 0 || green !== 0 || blue !== 0)) nonBlack += 1;
    sampleHash ^= red | (green << 8) | (blue << 16) | (alpha << 24);
    sampleHash = Math.imul(sampleHash, 16777619) >>> 0;
  }
  return {
    width: canvas.width,
    height: canvas.height,
    nonTransparent,
    nonBlack,
    sampleHash,
    renderReady: shell?.dataset?.renderReady || "",
    hasPresentedFrame: shell?.dataset?.hasPresentedFrame || "",
    resizeFrames: (window.__testsAutoResizeFrames || []).length,
  };
});

export async function run({ states, eventLog, refreshResizeFrames, assertNoFatalErrors }) {
  const { desktop } = states;
  const terminal = desktop.page.locator(".terminal-pane.active .terminal-host").first();
  await terminal.waitFor({ state: "visible", timeout: 30_000 });
  await desktop.page.waitForFunction(() => (
    document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)")?.width > 0
  ), { timeout: 30_000 });
  await desktop.page.waitForTimeout(500);

  // Establish the baseline after startup/initial fit.  The first explicit
  // click may legitimately complete an unresolved ownership claim.
  await terminal.click({ position: { x: 24, y: 24 } });
  await desktop.page.waitForTimeout(500);
  await refreshResizeFrames(desktop);
  const baseline = await readPresentationSample(desktop.page);
  if (baseline.width <= 0 || baseline.height <= 0 || baseline.nonTransparent <= 0 || baseline.nonBlack <= 0) {
    throw new Error(`baseline terminal canvas is blank: ${JSON.stringify(baseline)}`);
  }

  const samples = [];
  for (let index = 0; index < 5; index += 1) {
    await terminal.click({ position: { x: 24 + index, y: 24 } });
    await desktop.page.waitForTimeout(180);
    samples.push(await readPresentationSample(desktop.page));
  }

  const unsafe = samples.filter((sample) => (
    sample.hasPresentedFrame === "true" && sample.renderReady === "false"
  ));
  const extraResizeFrames = samples.filter((sample) => sample.resizeFrames > baseline.resizeFrames);
  const geometryChanged = samples.filter((sample) => (
    sample.width !== baseline.width || sample.height !== baseline.height
  ));
  const blank = samples.filter((sample) => sample.nonTransparent <= 0 || sample.nonBlack <= 0);
  if (unsafe.length > 0) {
    throw new Error(`click caused an unsafe presentation transition: ${JSON.stringify(unsafe)}`);
  }
  if (extraResizeFrames.length > 0) {
    throw new Error(`stable same-device clicks emitted resize frames: ${JSON.stringify({ baseline, samples })}`);
  }
  if (geometryChanged.length > 0 || blank.length > 0) {
    throw new Error(`terminal geometry/pixels changed during stable clicks: ${JSON.stringify({ baseline, samples })}`);
  }
  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "same-device-click-jitter-check",
    baseline,
    samples,
  });
}
