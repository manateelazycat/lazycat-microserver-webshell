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

const runtimeSnapshot = (state) => state.page.evaluate(() => {
  const names = performance.getEntriesByType("resource").map((entry) => entry.name);
  const suffixes = [
    "/workspace/refresh_controller.js",
    "/workspace/refresh_lifecycle.js",
  ];
  const unified = Array.from(window.__testsAutoSockets || [])
    .filter((socket) => String(socket.url || "").includes("mode=unified"));
  return {
    resources: {
      bundleLoaded: names.some((name) => /\/assets\/[^/]+\/assets\/index-[^/]+\.js$/.test(new URL(name).pathname)),
      sourceModulesLoaded: suffixes.filter((suffix) => names.some((name) => name.endsWith(suffix))),
    },
    sockets: {
      created: unified.length,
      active: unified.filter((socket) => (
        socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN
      )).length,
    },
  };
});

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  const { desktop } = states;
  let failedWorkspaceGets = 0;
  const recoveryLogs = [];
  const onConsole = (message) => {
    const text = message.text();
    if (text.includes("[workspace-recovery]")) recoveryLogs.push(text);
  };
  desktop.page.on("console", onConsole);
  await desktop.page.route(/\/api\/workspace\?/, async (route) => {
    const request = route.request();
    if (request.method() === "GET" && failedWorkspaceGets === 0) {
      failedWorkspaceGets += 1;
      await route.fulfill({ status: 503, contentType: "text/plain", body: "spec-tests expected workspace retry" });
      return;
    }
    await route.continue();
  });

  const recoveredResponse = desktop.page.waitForResponse((response) => (
    response.request().method() === "GET"
    && response.url().includes("/api/workspace?")
    && response.status() === 200
  ), { timeout: 60_000 });
  await desktop.page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await recoveredResponse;
  await desktop.page.waitForFunction(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
    return shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true"
      && Number(canvas?.width || 0) > 0
      && Number(canvas?.height || 0) > 0;
  }, null, { timeout: 60_000 });
  await desktop.page.waitForTimeout(800);

  await desktop.page.unroute(/\/api\/workspace\?/);
  desktop.page.off("console", onConsole);
  desktop.fatalErrors = desktop.fatalErrors.filter((message) => !(
    (message.includes("HTTP 503 GET") && message.includes("/api/workspace?"))
    || (
      message === "console error: Failed to load resource: the server responded with a status of 503 (Service Unavailable)"
      && failedWorkspaceGets === 1
    )
  ));
  if (failedWorkspaceGets !== 1) {
    throw new Error(`expected exactly one injected workspace failure, got ${failedWorkspaceGets}`);
  }
  if (!recoveryLogs.some((message) => message.includes("refresh succeeded"))) {
    throw new Error(`workspace retry success log was not observed: ${JSON.stringify(recoveryLogs)}`);
  }

  const canvas = await canvasSummary(desktop);
  if (canvas.width <= 0 || canvas.height <= 0 || canvas.nonTransparent <= 0) {
    throw new Error(`terminal canvas is blank after workspace retry: ${JSON.stringify(canvas)}`);
  }
  const runtime = await runtimeSnapshot(desktop);
  if (!runtime.resources.bundleLoaded || runtime.resources.sourceModulesLoaded.length > 0) {
    throw new Error(`workspace refresh did not use the Vite bundle boundary: ${JSON.stringify(runtime.resources)}`);
  }
  if (runtime.sockets.active !== 1) {
    throw new Error(`expected one active Unified socket after workspace retry: ${JSON.stringify(runtime.sockets)}`);
  }
  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "workspace-refresh-retry-real-environment",
    failedWorkspaceGets,
    recoveryLogs,
    canvas,
    runtime,
  });
}
