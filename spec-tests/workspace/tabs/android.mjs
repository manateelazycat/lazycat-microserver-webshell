import fs from "node:fs/promises";
import path from "node:path";

const LABEL = "ANDROIDTAB";

async function workspace(page, selector, action, payload = {}) {
  const result = await page.evaluate(async (name, verb, body) => {
    const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(name)}`, {
      method: verb,
      headers: verb === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: verb === "POST" ? JSON.stringify({ action: body.action, cols: 80, rows: 32, ...body }) : undefined,
      cache: "no-store",
    });
    return { status: response.status, body: await response.json() };
  }, selector, action ? "POST" : "GET", { action, ...payload });
  if (result.status !== 200) throw new Error(`Android workspace action returned HTTP ${result.status}`);
  return result.body;
}

async function center(page, selector) {
  return page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!(element instanceof HTMLElement)) throw new Error(`Android UI control is unavailable: ${query}`);
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) throw new Error(`Android UI control is not visible: ${query}`);
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      nativeX: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
      nativeY: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
  }, selector);
}

export async function run({ device, page, selector, directory }) {
  await fs.mkdir(directory, { recursive: true });
  const originalRotation = String(await device.adb(["shell", "cmd", "window", "user-rotation"])).trim();
  let created, generation, createdPane;
  const resourceFile = path.join(directory, "test-tab.json");
  try {
    const currentSelector = await page.evaluate(() => new URL(location.href).searchParams.get("name"));
    if (currentSelector !== selector) throw new Error("Android LightOS app is displaying another instance");
    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "1"]);
    await page.waitFor(() => innerWidth > 640 && !!document.querySelector("button.tab"), [], 20_000);
    const before = await workspace(page, selector);
    generation = before.workspace_generation;
    const add = await center(page, "#newTab");
    await device.tap(add.nativeX, add.nativeY);
    let after;
    const deadline = Date.now() + 15_000;
    do {
      after = await workspace(page, selector);
      if (after.tabs.length === before.tabs.length + 1) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    const prior = new Set(before.tabs.map((tab) => tab.id));
    const added = after.tabs.filter((tab) => !prior.has(tab.id));
    if (added.length !== 1 || after.workspace_generation !== generation) {
      throw new Error("Android New Tab did not create one identifiable test tab");
    }
    created = added[0].id;
    createdPane = added[0].panes?.[0]?.id;
    await fs.writeFile(resourceFile, JSON.stringify({ created, createdPane, generation, status: "created" }, null, 2));
    await page.waitFor((id, paneID) => location.search.includes(`tab=${id}`) &&
      document.querySelector(`button.tab[data-tab-id="${id}"]`)?.classList.contains("active") &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === paneID,
      [created, createdPane], 30_000);
    await page.waitFor((id) => {
      const canvas = document.querySelector(`.pane-shell[data-pane-id="${id}"] canvas:not(.terminal-frame-hold)`);
      return Number(canvas?.width || 0) > 0 && Number(canvas?.height || 0) > 0;
    }, [createdPane], 30_000);
    const newTabScreenshot = path.join(directory, "new-tab.png");
    await device.screenshot(newTabScreenshot);

    const label = await center(page, `button.tab[data-tab-id="${created}"] .tab-label`);
    for (const clickCount of [1, 2]) {
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: label.x, y: label.y,
        button: "left", clickCount });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: label.x, y: label.y,
        button: "left", clickCount });
    }
    await page.waitFor(() => document.querySelector(".tab-rename-input") instanceof HTMLInputElement, [], 10_000);
    await device.typeASCII(LABEL);
    await device.key("KEYCODE_ENTER");
    await page.waitFor(async (id, expected) => {
      const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(new URL(location.href).searchParams.get("name"))}`,
        { cache: "no-store" });
      const state = await response.json();
      return state.tabs.find((tab) => tab.id === id)?.label === expected;
    }, [created, LABEL], 15_000);
    const renamedScreenshot = path.join(directory, "renamed-tab.png");
    await device.screenshot(renamedScreenshot);

    await page.send("Page.reload", { ignoreCache: true }, 30_000);
    await page.waitFor((id, expected) => document.readyState === "complete" &&
      document.querySelector(`button.tab[data-tab-id="${id}"] .tab-label`)?.textContent === expected,
      [created, LABEL], 30_000);
    const persisted = await workspace(page, selector);
    if (persisted.tabs.find((tab) => tab.id === created)?.label !== LABEL ||
        new URL(await page.evaluate(() => location.href)).searchParams.get("tab") !== created) {
      throw new Error("Android tab name or active tab did not survive refresh");
    }
    const refreshedScreenshot = path.join(directory, "refreshed-tab.png");
    await device.screenshot(refreshedScreenshot);
    return { observations: [
      "Android New Tab created one new visible terminal tab",
      `The user renamed that tab to ${LABEL} in the installed LightOS app`,
      `After page refresh, ${LABEL} and the active tab remained visible`,
    ], evidence: [newTabScreenshot, renamedScreenshot, refreshedScreenshot] };
  } finally {
    try {
      if (created) {
        const state = await workspace(page, selector);
        const tab = state.tabs.find((item) => item.id === created);
        if (state.workspace_generation !== generation ||
            (tab && !tab.panes.some((pane) => pane.id === createdPane))) {
          throw new Error("Android tab ownership changed; refusing cleanup of another tab");
        }
        if (tab) await workspace(page, selector, "close_tab", { tab_id: created });
        await fs.writeFile(resourceFile, JSON.stringify({ created, createdPane, generation, status: "closed" }, null, 2));
      }
    } finally {
      const match = originalRotation.match(/^(free|lock)(?:\s+([0-3]))?/);
      if (match) await device.adb(["shell", "cmd", "window", "user-rotation", match[1],
        ...(match[1] === "lock" ? [match[2] || "0"] : [])]);
    }
  }
}
