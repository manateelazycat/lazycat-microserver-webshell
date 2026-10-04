import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { openAndroidCompanion } from "../../environment/webshell-test-harness/android-companion.mjs";

async function androidWorkspace(page, selector, action, tabID) {
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

export async function run({ device, page, webview, selector, directory, companionConfig }) {
  const first = await openAndroidTestTab(page, { selector, directory });
  let companion, addedID, addedPane;
  const resourceFile = path.join(directory, "synced-tab.json");
  try {
    const androidURL = await page.evaluate(() => location.href);
    companion = await openAndroidCompanion({ ...companionConfig, device, webview, url: androidURL });
    const before = await androidWorkspace(page, selector);
    const otherBefore = await companion.page.evaluate(async (name) => {
      const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(name)}`, { cache: "no-store" });
      const body = await response.json();
      return { status: response.status, ids: body.tabs.map((tab) => tab.id), uiCount: document.querySelectorAll("#tabs .tab").length };
    }, selector);
    const ids = before.tabs.map((tab) => tab.id);
    if (otherBefore.status !== 200 || otherBefore.uiCount !== ids.length ||
        otherBefore.ids.join(",") !== ids.join(",")) {
      throw new Error("Android and companion browser do not start with the same workspace tabs");
    }

    const point = await page.evaluate(() => {
      const rect = document.querySelector("#newTab")?.getBoundingClientRect();
      if (!rect || rect.width < 1) throw new Error("Android New Tab button is unavailable");
      return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
        y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
    });
    await device.tap(point.x, point.y);
    const deadline = Date.now() + 15_000;
    let after;
    do {
      after = await androidWorkspace(page, selector);
      if (after.tabs.length === before.tabs.length + 1) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    const prior = new Set(ids);
    const added = after.tabs.filter((tab) => !prior.has(tab.id));
    if (added.length !== 1 || after.workspace_generation !== before.workspace_generation) {
      throw new Error("Android New Tab did not create one identifiable test tab");
    }
    addedID = added[0].id;
    addedPane = added[0].panes?.[0]?.id;
    await fs.writeFile(resourceFile, JSON.stringify({ addedID, addedPane, status: "created" }, null, 2));
    await companion.page.waitForFunction(({ id, count }) => {
      const buttons = [...document.querySelectorAll("#tabs .tab")];
      return buttons.length === count && buttons.some((button) => button.dataset.tabId === id);
    }, { id: addedID, count: ids.length + 1 }, { timeout: 30_000 });
    const otherAfter = await companion.page.evaluate(async (name) => {
      const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(name)}`, { cache: "no-store" });
      const body = await response.json();
      return { status: response.status, ids: body.tabs.map((tab) => tab.id), uiCount: document.querySelectorAll("#tabs .tab").length };
    }, selector);
    const androidAfter = await page.evaluate(() => ({ count: document.querySelectorAll("#tabs .tab").length,
      active: new URL(location.href).searchParams.get("tab") }));
    if (otherAfter.status !== 200 || otherAfter.uiCount !== ids.length + 1 ||
        androidAfter.count !== ids.length + 1 || androidAfter.active !== addedID ||
        !otherAfter.ids.includes(addedID)) {
      throw new Error("The new tab did not synchronize across Android and companion browser");
    }
    const androidScreenshot = path.join(directory, "android-new-tab.png");
    const companionScreenshot = path.join(directory, "companion-synced.png");
    await device.screenshot(androidScreenshot);
    await companion.page.screenshot({ path: companionScreenshot });
    const details = path.join(directory, "sync-observation.json");
    await fs.writeFile(details, JSON.stringify({ beforeIDs: ids, addedID,
      androidAfter, companionAfter: otherAfter }, null, 2));
    return { observations: [
      `Android LightOS and the authorized companion browser started with ${ids.length} matching tabs`,
      `Creating ${addedID} in the Android app increased both windows to ${ids.length + 1} matching tabs without refreshing the companion`,
    ], evidence: [androidScreenshot, companionScreenshot, details] };
  } finally {
    try {
      if (addedID) {
        const state = await androidWorkspace(page, selector);
        const tab = state.tabs.find((item) => item.id === addedID);
        if (tab && !tab.panes.some((pane) => pane.id === addedPane)) {
          throw new Error("Synchronized Android test tab changed ownership; refusing cleanup");
        }
        if (tab) await androidWorkspace(page, selector, "close_tab", addedID);
        await fs.writeFile(resourceFile, JSON.stringify({ addedID, addedPane, status: "closed" }, null, 2));
      }
      await first.close();
    } finally {
      await companion?.close();
    }
  }
}
