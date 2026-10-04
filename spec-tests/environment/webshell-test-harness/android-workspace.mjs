import fs from "node:fs/promises";
import path from "node:path";

export async function openAndroidTestTab(page, { selector, directory, device, viaUI = false }) {
  if (!selector || !directory) throw new Error("Android test tab needs an explicit instance selector and artifact directory");
  await fs.mkdir(directory, { recursive: true });
  const current = await page.evaluate(() => location.href);
  const target = new URL(current);
  if (target.searchParams.get("name") !== selector || target.pathname !== "/webshell/") {
    throw new Error("Android LightOS app is not displaying the configured WebShell instance");
  }
  const endpoint = `/webshell/api/workspace?name=${encodeURIComponent(selector)}`;
  const request = async (method, body) => {
    const result = await page.evaluate(async (url, verb, payload) => {
      const response = await fetch(url, {
        method: verb,
        credentials: "same-origin",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
        cache: "no-store",
      });
      return { status: response.status, body: await response.json() };
    }, endpoint, method, body);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Android workspace ${method} returned HTTP ${result.status}`);
    }
    return result.body;
  };
  const before = await request("GET");
  let after;
  if (viaUI) {
    if (!device) throw new Error("Android UI tab creation requires the allocated device");
    const point = await page.evaluate(() => {
      const rect = document.querySelector("#newTab")?.getBoundingClientRect();
      if (!rect || rect.width < 1) throw new Error("Android New Tab button is unavailable");
      return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
        y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
    });
    await device.tap(point.x, point.y);
    const deadline = Date.now() + 15_000;
    do {
      after = await request("GET");
      if (after.tabs.length === before.tabs.length + 1) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
  } else after = await request("POST", { action: "create_tab", cols: 80, rows: 32 });
  const oldIDs = new Set(before.tabs.map((tab) => tab.id));
  const added = after.tabs.filter((tab) => !oldIDs.has(tab.id));
  if (added.length !== 1 || after.workspace_generation !== before.workspace_generation ||
      added[0].panes.length !== 1) {
    throw new Error("Cannot identify one newly created Android test tab; refusing to use an existing tab");
  }
  const tabID = added[0].id, paneID = added[0].panes[0].id;
  const generation = after.workspace_generation;
  const resourceFile = path.join(directory, "test-tab.json");
  const resource = { selector, tabID, paneID, generation, status: "created" };
  await fs.writeFile(resourceFile, JSON.stringify(resource, null, 2));
  const assertOwned = async () => {
    const valid = await page.evaluate((expected) => {
      const url = new URL(location.href);
      return url.searchParams.get("name") === expected.selector &&
        url.searchParams.get("tab") === expected.tabID &&
        document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === expected.paneID;
    }, { selector, tabID, paneID });
    if (!valid) throw new Error("Android test tab or pane is not active; refusing test input");
  };
  const close = async () => {
    const currentState = await request("GET");
    const tab = currentState.tabs.find((item) => item.id === tabID);
    if (currentState.workspace_generation !== generation ||
        (tab && !tab.panes.some((item) => item.id === paneID))) {
      throw new Error("Android workspace ownership changed; refusing to close another tab");
    }
    if (tab) await request("POST", { action: "close_tab", tab_id: tabID, cols: 80, rows: 32 });
    await fs.writeFile(resourceFile, JSON.stringify({ ...resource, status: "closed" }, null, 2));
  };
  try {
    target.searchParams.set("tab", tabID);
    if (!viaUI) await page.navigate(target.toString());
    else await page.waitFor((id) => new URL(location.href).searchParams.get("tab") === id,
      [tabID], 30_000);
    await page.waitFor((id) => document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === id,
      [paneID], 60_000);
    await page.waitFor(() => {
      const shell = document.querySelector(".terminal-pane.active .pane-shell");
      const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
      return shell?.dataset.renderReady === "true" && shell.dataset.hasPresentedFrame === "true" &&
        Number(canvas?.width || 0) > 0 && Number(canvas?.height || 0) > 0;
    }, [], 60_000);
    await assertOwned();
  } catch (error) {
    await close();
    throw error;
  }
  return {
    tabID, paneID, selector, assertOwned, close,
    async requireIdleShell() {
      await assertOwned();
      const activity = await page.evaluate(async (name) => {
        const response = await fetch(`/webshell/api/workspace/activity?name=${encodeURIComponent(name)}`, { cache: "no-store" });
        return { status: response.status, body: await response.json() };
      }, selector);
      if (activity.status !== 200) throw new Error("Cannot inspect Android test terminal activity");
      const pane = activity.body.panes.find((item) => item.id === paneID);
      if (!pane || pane.busy || (pane.command && !["bash", "sh", "dash", "zsh", "ash"].includes(pane.command))) {
        throw new Error("Android test terminal is not an idle shell");
      }
      return pane;
    },
  };
}
