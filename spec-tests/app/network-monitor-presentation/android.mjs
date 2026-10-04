import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { sendTerminalCommand, keyboardShown } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { openAndroidTerminalSettings, setAndroidSetting, closeAndroidSettings } from "../../environment/webshell-test-harness/android-settings.mjs";

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

async function monitorState(page, firstID, secondID) {
  return page.evaluate((ids) => {
    const panel = document.querySelector("#terminalNetworkMonitor");
    const terminal = document.querySelector(".terminal-pane.active .terminal-host");
    const rect = panel?.getBoundingClientRect(), host = terminal?.getBoundingClientRect();
    return { visible: panel?.hidden === false,
      rate: document.querySelector("#terminalNetworkMonitorRate")?.textContent?.trim() || "",
      usage: document.querySelector("#terminalNetworkMonitorUsage")?.textContent?.trim() || "",
      status: document.querySelector("#terminalNetworkMonitorStatus")?.getAttribute("aria-label") || "",
      overlapsTerminal: Boolean(rect && host && rect.bottom > host.top + 2),
      tabs: ids.map((id) => {
        const node = document.querySelector(`button.tab[data-tab-id="${id}"] .tab-network-metrics`);
        return { id, visible: node?.hidden === false, text: node?.textContent?.trim() || "" };
      }) };
  }, [firstID, secondID]);
}

export async function run({ device, page, selector, directory }) {
  const first = await openAndroidTestTab(page, { selector, directory });
  const rotation = String(await device.adb(["shell", "cmd", "window", "user-rotation"])).trim();
  let second, secondPane, original;
  const resourceFile = path.join(directory, "second-tab.json");
  try {
    original = await page.evaluate(() => ({
      debug: document.querySelector("#settingsDebugModeToggle")?.checked === true,
      network: document.querySelector("#settingsNetworkMonitorToggle")?.checked === true,
    }));
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
    const old = new Set(before.tabs.map((tab) => tab.id));
    const added = after.tabs.filter((tab) => !old.has(tab.id));
    if (added.length !== 1 || after.workspace_generation !== before.workspace_generation) {
      throw new Error("Cannot identify the second Android network monitor tab");
    }
    second = added[0].id;
    secondPane = added[0].panes?.[0]?.id;
    await fs.writeFile(resourceFile, JSON.stringify({ second, secondPane, status: "created" }, null, 2));
    await page.waitFor((id) => document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === id &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.renderReady === "true", [secondPane], 30_000);

    await openAndroidTerminalSettings(device, page);
    await setAndroidSetting(device, page, "settingsDebugModeToggle", true);
    await setAndroidSetting(device, page, "settingsNetworkMonitorToggle", true);
    await closeAndroidSettings(device, page);
    const secondOwner = { assertOwned: async () => {
      const valid = await page.evaluate((id, pane) => new URL(location.href).searchParams.get("tab") === id &&
        document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === pane, second, secondPane);
      if (!valid) throw new Error("Second Android network tab lost ownership");
    } };
    await sendTerminalCommand(device, page, secondOwner, "seq 1 1200");
    await page.waitFor(() => parseFloat(document.querySelector("#terminalNetworkMonitorUsage")?.textContent || "0") > 0,
      [], 15_000);

    await page.evaluate(async (name, id) => {
      const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(name)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_tab", tab_id: id, cols: 80, rows: 32 }),
      });
      if (!response.ok) throw new Error(`activate_tab HTTP ${response.status}`);
    }, selector, first.tabID);
    const firstURL = new URL(await page.evaluate(() => location.href));
    firstURL.searchParams.set("tab", first.tabID);
    await page.navigate(firstURL.toString());
    await page.waitFor((id) => document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === id,
      [first.paneID], 30_000);
    await sendTerminalCommand(device, page, first, "seq 1 1100");
    await page.waitFor(() => parseFloat(document.querySelector("#terminalNetworkMonitorUsage")?.textContent || "0") > 0,
      [], 15_000);
    const mobile = await monitorState(page, first.tabID, second);
    if (!mobile.visible || !/MB\/s$/.test(mobile.rate) || !/MB$/.test(mobile.usage) ||
        parseFloat(mobile.usage) <= 0 || !mobile.status || mobile.overlapsTerminal) {
      throw new Error(`Android network summary is missing or obscures terminal: ${JSON.stringify(mobile)}`);
    }
    const mobileScreenshot = path.join(directory, "mobile-network-summary.png");
    await device.screenshot(mobileScreenshot);

    if (await keyboardShown(device)) await device.key("KEYCODE_BACK");
    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "1"]);
    await page.waitFor(() => innerWidth > 640, [], 15_000);
    await page.waitFor((ids) => ids.every((id) => {
      const node = document.querySelector(`button.tab[data-tab-id="${id}"] .tab-network-metrics`);
      return node && !node.hidden && /MB/.test(node.textContent || "");
    }), [[first.tabID, second]], 15_000);
    const desktop = await monitorState(page, first.tabID, second);
    if (desktop.overlapsTerminal || desktop.tabs.some((tab) => !tab.visible || !/MB/.test(tab.text))) {
      throw new Error(`Android wide-layout tab summaries are missing: ${JSON.stringify(desktop)}`);
    }
    const desktopScreenshot = path.join(directory, "wide-network-tabs.png");
    await device.screenshot(desktopScreenshot);
    const details = path.join(directory, "network-observation.json");
    await fs.writeFile(details, JSON.stringify({ mobile, desktop }, null, 2));
    return { observations: [
      "Android top bar showed live rate, cumulative usage and connection status without covering terminal content",
      "Both wide-layout tabs showed their own network summaries after real terminal traffic",
    ], evidence: [mobileScreenshot, desktopScreenshot, details] };
  } finally {
    try {
      if (original) {
        await openAndroidTerminalSettings(device, page);
        await setAndroidSetting(device, page, "settingsNetworkMonitorToggle", original.network);
        await setAndroidSetting(device, page, "settingsDebugModeToggle", original.debug);
        await closeAndroidSettings(device, page);
      }
      if (second) {
        const state = await workspace(page, selector);
        const tab = state.tabs.find((item) => item.id === second);
        if (tab && !tab.panes.some((pane) => pane.id === secondPane)) {
          throw new Error("Network monitor test tab changed ownership; refusing cleanup");
        }
        if (tab) await workspace(page, selector, "close_tab", second);
        await fs.writeFile(resourceFile, JSON.stringify({ second, secondPane, status: "closed" }, null, 2));
      }
      await first.close();
    } finally {
      const match = rotation.match(/^(free|lock)(?:\s+([0-3]))?/);
      if (match) await device.adb(["shell", "cmd", "window", "user-rotation", match[1],
        ...(match[1] === "lock" ? [match[2] || "0"] : [])]);
    }
  }
}
