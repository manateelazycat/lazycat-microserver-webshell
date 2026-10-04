import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { sendTerminalCommand } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { waitForTerminalLine } from "../../environment/webshell-test-harness/android-observe.mjs";

export async function run({ device, page, selector, directory, tessdata }) {
  const tab = await openAndroidTestTab(page, { selector, directory });
  let cacheDisabled = false;
  try {
    await page.send("Network.enable");
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Network.setBypassServiceWorker", { bypass: true });
    cacheDisabled = true;
    await page.send("Page.reload", { ignoreCache: true }, 30_000);
    await page.waitFor((id) => document.readyState === "complete" &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === id &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.renderReady === "true" &&
      Number(document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)")?.width || 0) > 0,
    [tab.paneID], 60_000);
    await tab.assertOwned();
    const resources = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter((entry) => /\/assets\/[^/]+\.(?:js|css|wasm)$/.test(new URL(entry.name).pathname))
      .map((entry) => ({ path: new URL(entry.name).pathname, transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize })));
    if (!resources.some((item) => /index-[^/]+\.js$/.test(item.path) && item.transferSize > 0) ||
        !resources.some((item) => /ghostty-vt-[^/]+\.wasm$/.test(item.path) && item.transferSize > 0)) {
      throw new Error("Android cold navigation did not fetch current JavaScript and WASM from the server");
    }
    const marker = "COLDSTART";
    await sendTerminalCommand(device, page, tab, `echo ${marker}`);
    const screen = await waitForTerminalLine(device, marker, { directory, tessdata, name: "cold-start" });
    await fs.writeFile(path.join(directory, "network-resources.json"), JSON.stringify(resources, null, 2));
    return { observations: [
      "Android LightOS fetched current JavaScript and WASM with browser cache disabled",
      "The newly loaded terminal visibly accepted a command and displayed COLDSTART",
    ], evidence: [screen.screenshot, path.join(directory, "network-resources.json")] };
  } finally {
    try {
      if (cacheDisabled) {
        await page.send("Network.setCacheDisabled", { cacheDisabled: false });
        await page.send("Network.setBypassServiceWorker", { bypass: false });
      }
    } finally {
      await tab.close();
    }
  }
}
