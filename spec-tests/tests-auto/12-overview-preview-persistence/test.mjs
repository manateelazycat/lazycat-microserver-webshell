const previewDatabaseName = "lcmd-webshell-overview-previews-v1";

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
  if (!response.ok) throw new Error(`workspace close_tab ${response.status()}: ${await response.text()}`);
}, tabID);

const readPersistedPreview = (state, tabID) => state.page.evaluate(async ({ databaseName, tabID }) => {
  if (typeof indexedDB.databases !== "function") return false;
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === databaseName)) return false;
  return new Promise((resolve) => {
    const open = indexedDB.open(databaseName, 1);
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains("previews")) {
        database.close();
        resolve(false);
        return;
      }
      const transaction = database.transaction("previews", "readonly");
      const request = transaction.objectStore("previews").getAll();
      request.onerror = () => resolve(false);
      request.onsuccess = () => resolve(request.result.find((record) => (
        record.tabID === tabID
        && record.blob instanceof Blob
        && record.blob.size > 0
        && record.width > 0
        && record.height > 0
      )) || false);
      transaction.oncomplete = () => database.close();
      transaction.onabort = () => database.close();
    };
  });
}, { databaseName: previewDatabaseName, tabID });

const waitForPersistedPreview = async (state, tabID) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const record = await readPersistedPreview(state, tabID);
    if (record) {
      return {
        key: record.key,
        selector: record.selector,
        workspaceGeneration: record.workspaceGeneration,
        tabID: record.tabID,
        paneID: record.paneID,
        historyGeneration: record.historyGeneration,
        width: record.width,
        height: record.height,
        blobSize: Number(record.blob?.size || 0),
      };
    }
    await state.page.waitForTimeout(50);
  }
  throw new Error(`tab ${tabID} did not persist a preview within 20000ms`);
};

const installOverviewDrawObserver = async (state) => state.page.addInitScript(() => {
  window.__testsAutoOverviewDraws = [];
  const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function observedOverviewDrawImage(source, ...args) {
    const card = this.canvas?.closest?.(".tab-overview-card");
    if (card) {
      window.__testsAutoOverviewDraws.push({
        tabID: card.dataset.tabId || "",
        sourceType: source?.constructor?.name || "",
        width: Number(source?.width || source?.naturalWidth || 0),
        height: Number(source?.height || source?.naturalHeight || 0),
      });
    }
    return nativeDrawImage.call(this, source, ...args);
  };
});

const localPreviewResources = (state) => state.page.evaluate(() => {
  const suffixes = [
    "/terminal/overview/preview_controller.js",
    "/terminal/overview/preview_store.js",
  ];
  const names = performance.getEntriesByType("resource").map((entry) => entry.name);
  return {
    bundleLoaded: names.some((name) => /\/assets\/[^/]+\/assets\/index-[^/]+\.js$/.test(new URL(name).pathname)),
    sourceModulesLoaded: suffixes.filter((suffix) => names.some((name) => name.endsWith(suffix))),
  };
});

const previewDiagnostics = (state, tabID) => state.page.evaluate(async ({ databaseName, tabID }) => {
  let records = [];
  try {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("preview database open failed"));
    });
    if (database.objectStoreNames.contains("previews")) {
      records = await new Promise((resolve, reject) => {
        const transaction = database.transaction("previews", "readonly");
        const request = transaction.objectStore("previews").getAll();
        request.onsuccess = () => resolve(request.result.map((record) => ({
          key: record.key,
          selector: record.selector,
          workspaceGeneration: record.workspaceGeneration,
          tabID: record.tabID,
          paneID: record.paneID,
          historyGeneration: record.historyGeneration,
          width: record.width,
          height: record.height,
          blobSize: Number(record.blob?.size || 0),
          blobType: String(record.blob?.type || ""),
        })));
        request.onerror = () => reject(request.error || new Error("preview records read failed"));
      });
    }
    database.close();
  } catch (error) {
    records = [{ error: error?.message || String(error) }];
  }
  const paneShell = document.querySelector(`.terminal-pane[data-tab-id="${CSS.escape(tabID)}"] .pane-shell`);
  const paneID = String(paneShell?.dataset.paneId || "");
  const timeline = (globalThis.__testsAutoTerminalTimelineSnapshot?.() || [])
    .find((entry) => String(entry?.paneID || "") === paneID);
  const replay = [...(timeline?.events || [])].reverse().find((event) => event?.type === "history_replay_start");
  return {
    tabID,
    paneID,
    connection: paneShell?.dataset.connection || "",
    renderReady: paneShell?.dataset.renderReady || "",
    hasPresentedFrame: paneShell?.dataset.hasPresentedFrame || "",
    historyGeneration: String(replay?.historyGeneration || ""),
    workspaceGeneration: String(replay?.workspaceGeneration || ""),
    draws: window.__testsAutoOverviewDraws || [],
    records: records.filter((record) => record.tabID === tabID || record.error),
  };
}, { databaseName: previewDatabaseName, tabID });

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  const { desktop } = states;
  const originalTabID = String(desktop.testTabID || "").trim();
  if (!originalTabID) throw new Error("isolated workspace tab is unavailable");

  let previewTabID = "";
  try {
    previewTabID = await createTemporaryTab(desktop);
    await desktop.page.waitForFunction((id) => {
      const pane = document.querySelector(`.terminal-pane.active[data-tab-id="${CSS.escape(id)}"] .pane-shell`);
      return pane?.dataset.renderReady === "true"
        && pane.dataset.hasPresentedFrame === "true";
    }, previewTabID, { timeout: 60_000 });
    const persistedBeforeReload = await waitForPersistedPreview(desktop, previewTabID);

    await desktop.page.locator(`#tabs .tab[data-tab-id="${previewTabID}"]`).waitFor({ state: "visible" });
    await desktop.page.locator(`#tabs .tab[data-tab-id="${originalTabID}"]`).click();
    await desktop.page.waitForFunction((id) => (
      document.querySelector(`#tabs .tab[data-tab-id="${CSS.escape(id)}"]`)?.classList.contains("active")
    ), originalTabID);

    await installOverviewDrawObserver(desktop);
    await desktop.page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await desktop.page.waitForFunction(() => {
      const shell = document.querySelector(".terminal-pane.active .pane-shell");
      return shell?.dataset.renderReady === "true" && shell.dataset.hasPresentedFrame === "true";
    }, null, { timeout: 60_000 });
    await desktop.page.locator("#tabOverviewToggle").click();
    await desktop.page.waitForSelector("#tabOverview:not([hidden])", { timeout: 10_000 });
    try {
      await desktop.page.waitForFunction((id) => (
        (window.__testsAutoOverviewDraws || []).some((entry) => (
          entry.tabID === id
          && entry.sourceType !== "HTMLCanvasElement"
          && entry.width > 0
          && entry.height > 0
        ))
      ), previewTabID, { timeout: 20_000 });
    } catch (error) {
      const diagnostics = await previewDiagnostics(desktop, previewTabID);
      throw new Error(`persisted preview was not drawn after reload: ${JSON.stringify({ persistedBeforeReload, diagnostics })}`, { cause: error });
    }

    const draw = await desktop.page.evaluate((id) => (
      (window.__testsAutoOverviewDraws || []).findLast((entry) => entry.tabID === id) || null
    ), previewTabID);
    const resources = await localPreviewResources(desktop);
    if (!resources.bundleLoaded || resources.sourceModulesLoaded.length > 0) {
      throw new Error(`overview code did not use the Vite bundle boundary: ${JSON.stringify(resources)}`);
    }
    assertNoFatalErrors();
    await eventLog({
      status: "pass",
      action: "overview-preview-persisted-across-reload",
      originalTabID,
      previewTabID,
      draw,
      resources,
    });
  } finally {
    if (previewTabID) {
      await closeTabByAPI(desktop, previewTabID).catch(() => {});
    }
  }
}
