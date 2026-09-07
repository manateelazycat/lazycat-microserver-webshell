const MAX_INITIAL_JAVASCRIPT_RESOURCES = 8;

const pageSnapshot = (state) => state.page.evaluate(() => {
  const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
  const versionedResources = Array.from(new Set(resources.filter((name) => name.includes("/assets/"))));
  const javascriptResources = versionedResources.filter((name) => {
    try {
      return new URL(name).pathname.endsWith(".js");
    } catch {
      return false;
    }
  });
  const canvas = document.querySelector(
    ".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)",
  );
  let canvasSummary = { width: 0, height: 0, nonTransparent: 0 };
  if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4);
    let nonTransparent = 0;
    for (let index = 3; index < pixels.length; index += stride) {
      if (pixels[index] !== 0) nonTransparent += 1;
    }
    canvasSummary = { width: canvas.width, height: canvas.height, nonTransparent };
  }
  const unifiedSockets = Array.from(window.__testsAutoSockets || [])
    .filter((socket) => String(socket.url || "").includes("mode=unified"));
  return {
    versionedResources,
    javascriptResources,
    canvas: canvasSummary,
    unifiedSockets: {
      created: unifiedSockets.length,
      active: unifiedSockets.filter((socket) => (
        socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN
      )).length,
    },
  };
});

export async function run({ states, eventLog, assertNoFatalErrors }) {
  const snapshots = {};
  for (const [name, state] of Object.entries(states)) {
    const snapshot = await pageSnapshot(state);
    snapshots[name] = snapshot;
    if (snapshot.javascriptResources.length > MAX_INITIAL_JAVASCRIPT_RESOURCES) {
      throw new Error(
        `${name}: cold start loaded ${snapshot.javascriptResources.length} JavaScript resources, `
        + `budget is ${MAX_INITIAL_JAVASCRIPT_RESOURCES}: ${JSON.stringify(snapshot.javascriptResources)}`,
      );
    }
    if ((state.assetRequestFailures || []).length > 0) {
      throw new Error(`${name}: versioned asset requests failed: ${JSON.stringify(state.assetRequestFailures)}`);
    }
    if (snapshot.canvas.width <= 0 || snapshot.canvas.height <= 0 || snapshot.canvas.nonTransparent <= 0) {
      throw new Error(`${name}: terminal canvas is blank: ${JSON.stringify(snapshot.canvas)}`);
    }
    if (snapshot.unifiedSockets.active !== 1) {
      throw new Error(`${name}: expected one active Unified socket: ${JSON.stringify(snapshot.unifiedSockets)}`);
    }
  }
  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "vite-cold-start-resource-budget",
    maxInitialJavaScriptResources: MAX_INITIAL_JAVASCRIPT_RESOURCES,
    snapshots,
  });
}
