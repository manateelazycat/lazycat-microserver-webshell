import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { sendTerminalCommand } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { waitForTerminalLine } from "../../environment/webshell-test-harness/android-observe.mjs";

export async function run({ device, page, selector, directory, tessdata }) {
  const tab = await openAndroidTestTab(page, { selector, directory });
  let failed = 0, continued = 0, succeeded = 0, interceptionError;
  const events = [];
  const stopFetch = page.on("Fetch.requestPaused", async (event) => {
    try {
      const url = new URL(event.request.url);
      const workspaceRead = url.pathname === "/webshell/api/workspace" &&
        event.request.method === "GET" && url.searchParams.get("name") === selector;
      if (workspaceRead && !failed) {
        failed++;
        events.push({ kind: "request-failed", path: url.pathname, status: 503 });
        await page.send("Fetch.fulfillRequest", { requestId: event.requestId,
          responseCode: 503, responseHeaders: [{ name: "Content-Type", value: "text/plain" }],
          body: Buffer.from("Android acceptance: one workspace read is unavailable").toString("base64") });
      } else {
        if (workspaceRead) { continued++; events.push({ kind: "request-continued", path: url.pathname }); }
        await page.send("Fetch.continueRequest", { requestId: event.requestId });
      }
    } catch (error) { interceptionError = error; }
  });
  const stopNetwork = page.on("Network.responseReceived", (event) => {
    const url = new URL(event.response.url);
    if (url.pathname === "/webshell/api/workspace" &&
        url.searchParams.get("name") === selector && event.response.status === 200) {
      succeeded++;
      events.push({ kind: "response-success", path: url.pathname, status: 200 });
    }
  });
  let enabled = false;
  try {
    await page.send("Network.enable");
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*api/workspace*", requestStage: "Request" }] });
    enabled = true;
    await page.send("Page.reload", { ignoreCache: true }, 30_000);
    const deadline = Date.now() + 35_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (interceptionError) throw interceptionError;
      ready = await page.evaluate((id) => document.readyState === "complete" &&
        document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === id &&
        document.querySelector(".terminal-pane.active .pane-shell")?.dataset.hasPresentedFrame === "true",
      tab.paneID).catch(() => false);
      if (failed === 1 && continued > 0 && succeeded > 0 && ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (failed !== 1 || continued < 1 || succeeded < 1 || !ready) {
      throw new Error(`Android workspace did not recover after one failed read: ${JSON.stringify({ failed, continued, succeeded, ready })}`);
    }
    await page.send("Fetch.disable");
    enabled = false;
    stopFetch();
    stopNetwork();
    await tab.assertOwned();
    const marker = "RETRYCHECK";
    await sendTerminalCommand(device, page, tab, `echo ${marker}`);
    const screen = await waitForTerminalLine(device, marker, { directory, tessdata, name: "workspace-recovered" });
    const state = await page.evaluate(async (name) => {
      const response = await fetch(`/webshell/api/workspace?name=${encodeURIComponent(name)}`, { cache: "no-store" });
      return { status: response.status, body: await response.json() };
    }, selector);
    if (state.status !== 200 || !state.body.tabs.some((item) => item.id === tab.tabID)) {
      throw new Error("The recovered Android workspace lost its existing test tab");
    }
    const trace = path.join(directory, "workspace-retry-events.json");
    await fs.writeFile(trace, JSON.stringify({ failed, continued, succeeded, events }, null, 2));
    return { observations: [
      "The installed Android app retried one failed real workspace request and received a successful response",
      "The original terminal tab remained visible and accepted RETRYCHECK without recreation",
    ], evidence: [screen.screenshot, trace] };
  } finally {
    if (enabled) await page.send("Fetch.disable").catch(() => {});
    stopFetch();
    stopNetwork();
    await tab.close();
  }
}
