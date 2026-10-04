import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { sendTerminalCommand } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { waitForTerminalLine } from "../../environment/webshell-test-harness/android-observe.mjs";

const databaseName = "lcmd-webshell-overview-previews-v1";

async function workspace(page, selector, action, tabID) {
  const result = await page.evaluate(async (name, verb, id) => {
    const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(name)}`, {
      method: verb,
      headers: verb === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: verb === "POST" ? JSON.stringify({ action: "close_tab", tab_id: id, cols: 80, rows: 32 }) : undefined,
      cache: "no-store",
    });
    return { status: response.status, body: await response.json() };
  }, selector, action ? "POST" : "GET", tabID);
  if (result.status !== 200) throw new Error(`Android workspace HTTP ${result.status}`);
  return result.body;
}

async function previewRecord(page, tabID) {
  return page.evaluate(async (name, id) => {
    if (typeof indexedDB.databases === "function") {
      const names = await indexedDB.databases();
      if (!names.some((entry) => entry.name === name)) return null;
    }
    return new Promise((resolve) => {
      const open = indexedDB.open(name, 1);
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("previews")) { db.close(); resolve(null); return; }
        const transaction = db.transaction("previews", "readonly");
        const request = transaction.objectStore("previews").getAll();
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const record = request.result.find((item) => item.tabID === id &&
            item.blob instanceof Blob && item.blob.size > 0 && item.width > 0 && item.height > 0);
          resolve(record ? { tabID: record.tabID, paneID: record.paneID,
            width: record.width, height: record.height, blobSize: record.blob.size } : null);
        };
        transaction.oncomplete = () => db.close();
      };
    });
  }, databaseName, tabID);
}

export async function run({ device, page, selector, directory, tessdata }) {
  const first = await openAndroidTestTab(page, { selector, directory });
  let second, secondPane, scriptID;
  const resourceFile = path.join(directory, "second-tab.json");
  try {
    const before = await workspace(page, selector);
    const point = await page.evaluate(() => {
      const rect = document.querySelector("#newTab")?.getBoundingClientRect();
      if (!rect || rect.width < 1) throw new Error("Android New Tab control is unavailable");
      return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
        y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
    });
    await device.tap(point.x, point.y);
    let after;
    const deadline = Date.now() + 15_000;
    do {
      after = await workspace(page, selector);
      if (after.tabs.length === before.tabs.length + 1) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    const oldIDs = new Set(before.tabs.map((tab) => tab.id));
    const added = after.tabs.filter((tab) => !oldIDs.has(tab.id));
    if (added.length !== 1 || after.workspace_generation !== before.workspace_generation) {
      throw new Error("Cannot identify the second Android preview tab");
    }
    second = added[0].id;
    secondPane = added[0].panes?.[0]?.id;
    await fs.writeFile(resourceFile, JSON.stringify({ second, secondPane, status: "created" }, null, 2));
    await page.waitFor((id) => document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === id &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.hasPresentedFrame === "true",
    [secondPane], 60_000);
    const secondOwner = { assertOwned: async () => {
      const valid = await page.evaluate((id, pane) => new URL(location.href).searchParams.get("tab") === id &&
        document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === pane, second, secondPane);
      if (!valid) throw new Error("Second Android preview tab lost ownership");
    } };
    await sendTerminalCommand(device, page, secondOwner, "echo PREVIEWCHECK");
    const visible = await waitForTerminalLine(device, "PREVIEWCHECK", { directory, tessdata, name: "preview-content" });
    let persisted;
    const persistedDeadline = Date.now() + 20_000;
    do {
      persisted = await previewRecord(page, second);
      if (persisted) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < persistedDeadline);
    if (!persisted || persisted.paneID !== secondPane) {
      throw new Error("The second Android tab did not save a nonempty preview before refresh");
    }

    const firstURL = new URL(await page.evaluate(() => location.href));
    firstURL.searchParams.set("tab", first.tabID);
    await page.evaluate(async (name, id) => {
      const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(name)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_tab", tab_id: id, cols: 80, rows: 32 }),
      });
      if (!response.ok) throw new Error(`activate_tab HTTP ${response.status}`);
    }, selector, first.tabID);
    await page.navigate(firstURL.toString());
    await page.waitFor((id, pane) => new URL(location.href).searchParams.get("tab") === id &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === pane,
    [first.tabID, first.paneID], 60_000);
    await first.assertOwned();
    const injection = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__androidOverviewDraws = [];
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
        const card = this.canvas?.closest?.('.tab-overview-card');
        if (card) window.__androidOverviewDraws.push({ tabID: card.dataset.tabId || '',
          sourceType: source?.constructor?.name || '', width: source?.width || source?.naturalWidth || 0,
          height: source?.height || source?.naturalHeight || 0 });
        return draw.call(this, source, ...args);
      };
    ` });
    scriptID = injection.identifier;
    await page.send("Page.reload", { ignoreCache: true }, 30_000);
    await page.waitFor((pane) => document.readyState === "complete" &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === pane &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.hasPresentedFrame === "true",
    [first.paneID], 60_000);
    const overview = await page.evaluate(() => {
      const rect = document.querySelector("#tabOverviewToggle")?.getBoundingClientRect();
      if (!rect || rect.width < 1) throw new Error("Android terminal overview button is unavailable");
      return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
        y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
    });
    await device.tap(overview.x, overview.y);
    await page.waitFor((id) => document.querySelector("#tabOverview")?.hidden === false &&
      window.__androidOverviewDraws?.some((item) => item.tabID === id &&
        item.sourceType !== "HTMLCanvasElement" && item.width > 0 && item.height > 0),
    [second], 20_000);
    const draw = await page.evaluate((id) => window.__androidOverviewDraws.findLast((item) => item.tabID === id), second);
    const screenshot = path.join(directory, "persisted-overview.png");
    await device.screenshot(screenshot);
    const details = path.join(directory, "preview-observation.json");
    await fs.writeFile(details, JSON.stringify({ persisted, draw }, null, 2));
    return { observations: [
      "Two Android terminal tabs had visible content and the second saved a nonempty preview",
      "After refresh, terminal overview drew the background tab from its saved preview before live presentation",
    ], evidence: [visible.screenshot, screenshot, details] };
  } finally {
    try {
      if (scriptID) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptID }).catch(() => {});
      if (second) {
        const state = await workspace(page, selector);
        const tab = state.tabs.find((item) => item.id === second);
        if (tab && !tab.panes.some((pane) => pane.id === secondPane)) {
          throw new Error("Android preview tab ownership changed; refusing cleanup");
        }
        if (tab) await workspace(page, selector, "close_tab", second);
        await fs.writeFile(resourceFile, JSON.stringify({ second, secondPane, status: "closed" }, null, 2));
      }
    } finally {
      await first.close();
    }
  }
}
