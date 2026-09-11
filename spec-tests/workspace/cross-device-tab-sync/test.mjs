import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const tabs = (page) => page.locator("#tabs .tab");
const waitForCount = async (page, expected, windowName) => {
  try {
    await page.waitForFunction((count) => document.querySelectorAll("#tabs .tab").length === count, expected, { timeout: 12000 });
  } catch (cause) {
    throw new Error(`${windowName} tab count did not reach ${expected}; actual count: ${await tabs(page).count()}`, { cause });
  }
};

const removeCreatedTab = (page, tabID) => page.evaluate(async (id) => {
  const name = new URL(location.href).searchParams.get("name");
  const response = await fetch(`./api/workspace?name=${encodeURIComponent(name || "")}&cols=120&rows=32`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close_tab", tab_id: id }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Test tab cleanup HTTP ${response.status}`);
}, tabID);

export async function run({ states, artifactsDir, eventLog }) {
  const { desktop, mobile } = states;
  const evidence = { before: {}, after: {} };
  let createdTabID = "";
  try {
    await tabs(desktop.page).first().waitFor({ state: "visible" });
    const before = await tabs(desktop.page).count();
    await waitForCount(mobile.page, before, "mobile");
    evidence.before = { desktop: before, mobile: await tabs(mobile.page).count() };
    const originalIDs = await tabs(mobile.page).evaluateAll((buttons) => buttons.map((button) => button.dataset.tabId));
    const started = performance.now();
    const responsePromise = mobile.page.waitForResponse((response) => response.request().method() === "POST"
      && response.url().includes("/api/workspace?") && response.request().postDataJSON()?.action === "create_tab", { timeout: 15000 });
    const [response] = await Promise.all([responsePromise, mobile.page.locator("#newTab").click()]);
    assert.ok(response.ok(), "Creating a tab must succeed");
    const state = await response.json();
    const newID = state.active_tab_id;
    assert.ok(newID && !originalIDs.includes(newID), "Creation must identify a new test-owned tab");
    createdTabID = newID;
    evidence.createdTabID = createdTabID;
    const expected = before + 1;
    await Promise.all([
      waitForCount(mobile.page, expected, "mobile"),
      waitForCount(desktop.page, expected, "desktop"),
    ]);
    evidence.after = { desktop: await tabs(desktop.page).count(), mobile: await tabs(mobile.page).count() };
    evidence.expected = expected;
    evidence.sync_seconds = Math.round(performance.now() - started) / 1000;
    assert.equal(evidence.after.desktop, expected, "Desktop must show one additional tab");
    assert.equal(evidence.after.mobile, expected, "Mobile must show one additional tab");
    await Promise.all([
      desktop.page.screenshot({ path: path.join(artifactsDir, "desktop-tabs.png") }),
      mobile.page.screenshot({ path: path.join(artifactsDir, "mobile-tabs.png") }),
    ]);
    await eventLog({ status: "pass", action: "cross-device-tab-count", ...evidence });
  } finally {
    try {
      await fs.writeFile(path.join(artifactsDir, "tab-counts.json"), JSON.stringify(evidence, null, 2));
    } finally {
      // Cleanup only; closing-tab synchronization is outside this scenario.
      if (createdTabID) await removeCreatedTab(mobile.page, createdTabID);
    }
  }
}
