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

const localWorkspaceResources = (state) => state.page.evaluate(() => {
  const suffixes = [
    "/workspace/index.js",
    "/workspace/tab_label_controller.js",
    "/workspace/tab_label_lifecycle.js",
  ];
  const names = performance.getEntriesByType("resource").map((entry) => entry.name);
  return {
    bundleLoaded: names.some((name) => /\/assets\/[^/]+\/assets\/index-[^/]+\.js$/.test(new URL(name).pathname)),
    sourceModulesLoaded: suffixes.filter((suffix) => names.some((name) => name.endsWith(suffix))),
  };
});

const createTemporaryTab = async (state) => {
  const previousIDs = await state.page.locator("#tabs .tab").evaluateAll((buttons) => (
    buttons.map((button) => button.dataset.tabId)
  ));
  await state.page.locator("#newTab").click();
  await state.page.waitForFunction((count) => document.querySelectorAll("#tabs .tab").length > count, previousIDs.length);
  const activeID = await state.page.locator("#tabs .tab.active").getAttribute("data-tab-id");
  if (!activeID || previousIDs.includes(activeID)) {
    throw new Error(`new tab did not become active: ${JSON.stringify({ previousIDs, activeID })}`);
  }
  return activeID;
};

const closeTabByAPI = async (state, tabID) => state.page.evaluate(async (id) => {
  const name = new URLSearchParams(location.search).get("name");
  const response = await fetch(`./api/workspace?name=${encodeURIComponent(name || "")}&cols=120&rows=32`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close_tab", tab_id: id, cols: 120, rows: 32 }),
  });
  if (!response.ok) throw new Error(`workspace close_tab ${response.status}: ${await response.text()}`);
}, tabID);

const waitForStableActiveTerminal = (page, timeout = 60_000) => page.waitForFunction(() => {
  const shell = document.querySelector(".terminal-pane.active .pane-shell");
  const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
  return shell?.dataset.renderReady === "true"
    && shell.dataset.hasPresentedFrame === "true"
    && Number(canvas?.width || 0) > 0
    && Number(canvas?.height || 0) > 0;
}, null, { timeout });

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  const { desktop, mobile } = states;
  const tabID = String(desktop.testTabID || "").trim();
  if (!tabID) throw new Error("isolated workspace tab is unavailable");

  await waitForStableActiveTerminal(desktop.page);
  const transportErrors = [];
  const onConsole = (message) => {
    const text = message.text();
    if (text.includes("unified pane stream is not active")) {
      transportErrors.push(text);
    }
  };
  desktop.page.on("console", onConsole);
  const socketsBeforeNewTab = await unifiedSocketSnapshot(desktop);
  let temporaryTabID = "";
  let newTabCanvas = null;
  let socketsAfterNewTab = null;
  try {
    temporaryTabID = await createTemporaryTab(desktop);
    await desktop.page.waitForFunction((id) => {
      const pane = document.querySelector(`.terminal-pane.active[data-tab-id="${CSS.escape(id)}"] .pane-shell`);
      const startupError = document.querySelector("#startupErrorPanel");
      return pane?.dataset.renderReady === "true"
        && pane.dataset.hasPresentedFrame === "true"
        && (!startupError || startupError.hidden);
    }, temporaryTabID, { timeout: 60_000 });
    newTabCanvas = await canvasSummary(desktop);
    if (newTabCanvas.width <= 0 || newTabCanvas.height <= 0 || newTabCanvas.nonTransparent <= 0) {
      throw new Error(`new terminal canvas is blank: ${JSON.stringify(newTabCanvas)}`);
    }
    socketsAfterNewTab = await unifiedSocketSnapshot(desktop);
    if (
      socketsBeforeNewTab.active !== 1
      || socketsAfterNewTab.active !== 1
      || socketsAfterNewTab.created !== socketsBeforeNewTab.created
    ) {
      throw new Error(`new terminal replaced the Unified socket: ${JSON.stringify({ before: socketsBeforeNewTab, after: socketsAfterNewTab })}`);
    }
    if (transportErrors.length > 0) {
      throw new Error(`new terminal used priority before subscription:\n${transportErrors.join("\n")}`);
    }
  } finally {
    desktop.page.off("console", onConsole);
    if (temporaryTabID) {
      await closeTabByAPI(desktop, temporaryTabID).catch(() => {});
      await desktop.page.locator(`#tabs .tab[data-tab-id="${tabID}"]`).click();
      await waitForStableActiveTerminal(desktop.page, 30_000);
    }
  }

  const tabButton = desktop.page.locator(`.tab[data-tab-id="${tabID}"]`);
  const tabLabel = tabButton.locator(".tab-label");
  await tabButton.waitFor({ state: "visible" });

  const renamed = `AUTO_TAB_${Date.now()}`;
  await tabLabel.dblclick();
  const input = desktop.page.locator(".tab-rename-input");
  await input.waitFor({ state: "visible" });
  await input.fill(renamed);
  const renameResponse = desktop.page.waitForResponse((response) => (
    response.request().method() === "POST"
    && response.url().includes("/api/workspace")
    && String(response.request().postData() || "").includes('"action":"rename_tab"')
  ));
  const [, response] = await Promise.all([input.press("Enter"), renameResponse]);
  if (!response.ok()) {
    throw new Error(`rename_tab failed (${response.status()}): ${await response.text()}`);
  }
  await desktop.page.waitForFunction(({ id, label }) => {
    const button = document.querySelector(`.tab[data-tab-id="${CSS.escape(id)}"]`);
    return button?.querySelector(".tab-label")?.textContent === label
      && !document.querySelector(".tab-rename-input");
  }, { id: tabID, label: renamed });

  await desktop.page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForStableActiveTerminal(desktop.page);
  await desktop.page.waitForFunction(({ id, label }) => (
    document.querySelector(`.tab[data-tab-id="${CSS.escape(id)}"] .tab-label`)?.textContent === label
  ), { id: tabID, label: renamed });

  const canvas = await canvasSummary(desktop);
  if (canvas.width <= 0 || canvas.height <= 0 || canvas.nonTransparent <= 0) {
    throw new Error(`terminal canvas is blank after tab rename reload: ${JSON.stringify(canvas)}`);
  }
  const resources = await localWorkspaceResources(desktop);
  if (!resources.bundleLoaded || resources.sourceModulesLoaded.length > 0) {
    throw new Error(`workspace code did not use the Vite bundle boundary: ${JSON.stringify(resources)}`);
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
    action: "workspace-tab-label-real-environment",
    tabID,
    renamed,
    canvas,
    resources,
    sockets,
    newTerminal: {
      tabID: temporaryTabID,
      canvas: newTabCanvas,
      socketsBefore: socketsBeforeNewTab,
      socketsAfter: socketsAfterNewTab,
    },
  });
}
