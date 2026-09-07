const terminalHost = (state) => state.page.locator(".terminal-pane.active .terminal-host").first();

const waitForOutput = async (state, marker, timeout = 15_000) => {
  await state.page.waitForFunction((expected) => (
    String(window.__testsAutoTerminalOutput || "").includes(expected)
  ), marker, { timeout });
};

const canvasSummary = (state) => state.page.evaluate(() => {
  const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return { width: 0, height: 0, nonTransparent: 0, hash: 0 };
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4);
  let nonTransparent = 0;
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += stride) {
    if (pixels[index + 3] !== 0) nonTransparent += 1;
    hash ^= pixels[index] | (pixels[index + 1] << 8) | (pixels[index + 2] << 16);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return { width: canvas.width, height: canvas.height, nonTransparent, hash };
});

const inputPayloads = (state) => state.page.evaluate(() => {
  const payloads = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.type === "input") payloads.push(value);
    if (value.control && typeof value.control === "object") visit(value.control);
    if (value.payload && typeof value.payload === "object") visit(value.payload);
  };
  for (const message of window.__testsAutoSentMessages || []) visit(message);
  return payloads;
});

const unifiedSocketSnapshot = (state) => state.page.evaluate(() => {
  const sockets = Array.from(window.__testsAutoSockets || []);
  const unified = sockets.filter((socket) => String(socket.url || "").includes("mode=unified"));
  return {
    created: unified.length,
    active: unified.filter((socket) => socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN).length,
  };
});

const localInputResources = (state) => state.page.evaluate(() => {
  const suffixes = [
    "/terminal/input/index.js",
    "/terminal/input/input_controller.js",
    "/terminal/input/input_lifecycle.js",
    "/terminal/input/input_model.js",
  ];
  const names = performance.getEntriesByType("resource").map((entry) => entry.name);
  return {
    bundleLoaded: names.some((name) => /\/assets\/[^/]+\/assets\/index-[^/]+\.js$/.test(new URL(name).pathname)),
    sourceModulesLoaded: suffixes.filter((suffix) => names.some((name) => name.endsWith(suffix))),
  };
});

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  const { desktop, mobile } = states;
  const marker = `AUTO_INPUT_${Date.now()}`;
  const interrupted = `${marker}_INTERRUPTED`;
  const largeDone = `${marker}_LARGE_20480`;
  const dsrDone = `${marker}_DSR_DONE`;

  await terminalHost(desktop).waitFor({ state: "visible", timeout: 60_000 });
  await desktop.page.waitForFunction(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    return shell?.dataset.renderReady === "true" && shell.dataset.hasPresentedFrame === "true";
  }, null, { timeout: 60_000 });
  const beforeCanvas = await canvasSummary(desktop);

  await terminalHost(desktop).click();
  await desktop.page.keyboard.insertText(`printf '%s\\n' '${marker}'`);
  await desktop.page.keyboard.press("Enter");
  await waitForOutput(desktop, marker);

  await desktop.page.keyboard.insertText("sleep 30");
  await desktop.page.keyboard.press("Enter");
  await desktop.page.waitForTimeout(250);
  await desktop.page.keyboard.press("Control+C");
  await desktop.page.keyboard.insertText(`printf '%s\\n' '${interrupted}'`);
  await desktop.page.keyboard.press("Enter");
  await waitForOutput(desktop, interrupted);

  await desktop.page.keyboard.insertText("stty -echo");
  await desktop.page.keyboard.press("Enter");
  const largeText = "a".repeat(20_480);
  await desktop.page.keyboard.insertText(`count=$(printf '%s' '${largeText}' | wc -c); printf '${largeDone}:%s\\n' "$count"`);
  await desktop.page.keyboard.press("Enter");
  await waitForOutput(desktop, `${largeDone}:20480`, 30_000);
  await desktop.page.keyboard.insertText("stty echo");
  await desktop.page.keyboard.press("Enter");

  const sentBeforeDSR = await desktop.page.evaluate(() => (window.__testsAutoSentMessages || []).length);
  await desktop.page.keyboard.insertText(`printf '\\033[6n'; sleep 1; printf '\\n${dsrDone}\\n'`);
  await desktop.page.keyboard.press("Enter");
  await waitForOutput(desktop, dsrDone);
  await desktop.page.waitForFunction((minimum) => {
    const messages = window.__testsAutoSentMessages || [];
    const visit = (value) => {
      if (!value || typeof value !== "object") return false;
      if (value.type === "input" && value.generated === true) return true;
      return visit(value.control) || visit(value.payload);
    };
    return messages.slice(minimum).some(visit);
  }, sentBeforeDSR, { timeout: 10_000 });

  const afterCanvas = await canvasSummary(desktop);
  if (afterCanvas.nonTransparent <= 0 || afterCanvas.width <= 0 || afterCanvas.height <= 0) {
    throw new Error(`terminal canvas is blank: ${JSON.stringify(afterCanvas)}`);
  }
  if (beforeCanvas.hash === afterCanvas.hash) {
    throw new Error(`terminal canvas did not change after input: ${JSON.stringify({ beforeCanvas, afterCanvas })}`);
  }

  const payloads = await inputPayloads(desktop);
  const generated = payloads.filter((payload) => payload.generated === true);
  if (generated.length === 0 || generated.some((payload) => "cols" in payload || "resize_epoch" in payload)) {
    throw new Error(`generated response payload contract failed: ${JSON.stringify(generated)}`);
  }
  const resources = await localInputResources(desktop);
  if (!resources.bundleLoaded || resources.sourceModulesLoaded.length > 0) {
    throw new Error(`input code did not use the Vite bundle boundary: ${JSON.stringify(resources)}`);
  }
  const sockets = {
    desktop: await unifiedSocketSnapshot(desktop),
    mobile: await unifiedSocketSnapshot(mobile),
  };
  if (sockets.desktop.active !== 1 || sockets.mobile.active !== 1) {
    throw new Error(`expected one active Unified socket per page: ${JSON.stringify(sockets)}`);
  }
  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "terminal-input-real-environment",
    marker,
    canvas: { before: beforeCanvas, after: afterCanvas },
    generatedResponses: generated.length,
    inputPayloads: payloads.length,
    resources,
    sockets,
  });
}
