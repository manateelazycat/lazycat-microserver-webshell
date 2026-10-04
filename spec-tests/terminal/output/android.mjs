import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { waitForTerminalLine } from "../../environment/webshell-test-harness/android-observe.mjs";

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

export async function run({ device, page, selector, directory, tessdata }) {
  const tab = await openAndroidTestTab(page, { selector, directory, device, viaUI: true });
  let addedID, addedPane;
  const chunks = [];
  let stage = "terminal-ready";
  const stopFrames = page.on("Network.webSocketFrameReceived", (event) => {
    if (event.response?.opcode !== 2) return;
    let bytes;
    try { bytes = Buffer.from(event.response.payloadData, "base64"); } catch { return; }
    if (!new Set(["LCQ1", "LCF1"]).has(bytes.subarray(0, 4).toString()) || bytes.length < 8) return;
    const headerLength = bytes.readUInt32BE(4);
    if (headerLength < 1 || headerLength + 8 > bytes.length) return;
    let header;
    try { header = JSON.parse(bytes.subarray(8, 8 + headerLength).toString("utf8")); } catch { return; }
    if (header.pane_id === tab.paneID) chunks.push(bytes.subarray(8 + headerLength).toString("utf8"));
  });
  const resourceFile = path.join(directory, "switched-tab.json");
  try {
    stage = "terminal-ready";
    await tab.requireIdleShell();
    await page.send("Network.enable");
    stage = "focus-input";
    await page.evaluate(() => {
      const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
      if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("Android terminal input is unavailable");
      textarea.focus({ preventScroll: true });
    });
    stage = "start-output";
    const command = 'i=1; while [ "$i" -le 800 ]; do echo LINE$i; i=$((i+1)); sleep 0.01; done; echo OUTPUTEND';
    await page.send("Input.insertText", { text: command });
    await device.key("KEYCODE_ENTER");
    await page.send("Input.insertText", { text: "echo AFTEROUTPUT" });
    await device.key("KEYCODE_ENTER");
    stage = "switch-away";
    const before = await workspace(page, selector);
    const point = await page.evaluate(() => {
      const rect = document.querySelector("#newTab")?.getBoundingClientRect();
      if (!rect || rect.width < 1) throw new Error("Android New Tab control is unavailable during output");
      return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
        y: Math.round((rect.top + rect.height / 2) * devicePixelRatio),
        cssX: rect.left + rect.width / 2, cssY: rect.top + rect.height / 2 };
    });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.cssX,
      y: point.cssY, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.cssX,
      y: point.cssY, button: "left", clickCount: 1 });
    let after;
    const deadline = Date.now() + 15_000;
    do {
      after = await workspace(page, selector);
      if (after.tabs.length === before.tabs.length + 1) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    const old = new Set(before.tabs.map((item) => item.id));
    const added = after.tabs.filter((item) => !old.has(item.id));
    if (added.length !== 1 || after.workspace_generation !== before.workspace_generation) {
      await device.screenshot(path.join(directory, "tab-switch-failed.png")).catch(() => {});
      throw new Error(`Android tab switch during output did not create one identifiable tab: ${JSON.stringify({
        before: before.tabs.map((item) => item.id), after: after.tabs.map((item) => item.id),
        generationMatch: after.workspace_generation === before.workspace_generation })}`);
    }
    addedID = added[0].id;
    addedPane = added[0].panes?.[0]?.id;
    await fs.writeFile(resourceFile, JSON.stringify({ addedID, addedPane, status: "created" }, null, 2));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    stage = "return-via-overview";
    const overview = await page.evaluate(() => {
      const rect = document.querySelector("#tabOverviewToggle")?.getBoundingClientRect();
      if (!rect || rect.width < 1) throw new Error("Android terminal overview is unavailable");
      return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
        y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
    });
    await device.tap(overview.x, overview.y);
    await page.waitFor(() => document.querySelector("#tabOverview")?.hidden === false, [], 10_000);
    const firstCard = await page.evaluate((id) => {
      const rect = document.querySelector(`.tab-overview-card[data-tab-id="${id}"] .tab-overview-card-main`)?.getBoundingClientRect();
      if (!rect || rect.width < 1) throw new Error("The original Android terminal is missing from overview");
      return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
        y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
    }, tab.tabID);
    await device.tap(firstCard.x, firstCard.y);
    await page.waitFor((id) => document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === id &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.hasPresentedFrame === "true",
    [tab.paneID], 60_000);
    await tab.assertOwned();
    stage = "visible-final-output";
    const endScreen = await waitForTerminalLine(device, "OUTPUTEND", { directory, tessdata,
      name: "output-complete", topFraction: 0.45, heightFraction: 0.45, timeout: 30_000 });
    const readyScreen = await waitForTerminalLine(device, "AFTEROUTPUT", { directory, tessdata,
      name: "input-after-output", topFraction: 0.45, heightFraction: 0.45, timeout: 30_000 });
    const raw = chunks.join("");
    stage = "ordered-output";
    const firstSeen = new Map();
    for (const match of raw.matchAll(/\bLINE(\d+)\b/g)) {
      const number = Number(match[1]);
      if (number >= 1 && number <= 800 && !firstSeen.has(number)) firstSeen.set(number, match.index);
    }
    const missing = Array.from({ length: 800 }, (_, index) => index + 1).filter((number) => !firstSeen.has(number));
    const ordered = [...firstSeen].sort((a, b) => a[0] - b[0]).every((entry, index, values) =>
      index === 0 || values[index - 1][1] < entry[1]);
    if (missing.length || !ordered || !raw.includes("OUTPUTEND") || !raw.includes("AFTEROUTPUT")) {
      throw new Error(`Android output was missing or out of order: ${JSON.stringify({ missing: missing.slice(0, 15), ordered, bytes: raw.length })}`);
    }
    const trace = path.join(directory, "output-observation.json");
    await fs.writeFile(trace, JSON.stringify({ receivedLineCount: firstSeen.size,
      ordered, bytes: raw.length, switchedTo: addedID }, null, 2));
    return { observations: [
      "Android terminal received all 800 ordered output lines while the user queued input and switched tabs",
      "After returning, the final output and queued command result were visible and the terminal remained interactive",
    ], evidence: [endScreen.screenshot, readyScreen.screenshot, trace] };
  } catch (error) {
    await device.screenshot(path.join(directory, "output-stage-failure.png")).catch(() => {});
    throw new Error(`${stage}: ${error.message}`);
  } finally {
    stopFrames();
    try {
      if (addedID) {
        const state = await workspace(page, selector);
        const other = state.tabs.find((item) => item.id === addedID);
        if (other && !other.panes.some((pane) => pane.id === addedPane)) {
          throw new Error("Android output test tab changed ownership; refusing cleanup");
        }
        if (other) await workspace(page, selector, "close_tab", addedID);
        await fs.writeFile(resourceFile, JSON.stringify({ addedID, addedPane, status: "closed" }, null, 2));
      }
    } finally { await tab.close(); }
  }
}
