import assert from "node:assert/strict";
import path from "node:path";
import {
  closeExtraTabs,
  createExtraTabs,
  moveAfter,
  persistEvidence,
  readWorkspace,
  tabIDs,
} from "./helpers.mjs";

const dispatchTouchDrag = async (page, start, end) => {
  const session = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }];
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(start.x, start.y) });
    await page.waitForTimeout(380);
    for (let step = 1; step <= 12; step += 1) {
      const ratio = step / 12;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: point(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio),
      });
      await page.waitForTimeout(18);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
};

export async function run({ states, artifactsDir, eventLog }) {
  const { page, testTabID } = states.mobile;
  const evidence = { testTabID, requests: [] };
  const extras = [];
  const observeRequest = (request) => {
    if (request.method() !== "POST" || !request.url().includes("/api/workspace")) return;
    const payload = request.postDataJSON?.();
    if (payload?.action === "reorder_tab") evidence.requests.push(payload);
  };
  page.on("request", observeRequest);
  try {
    const initialWorkspace = await readWorkspace(page);
    evidence.agentCapabilities = initialWorkspace.agent_capabilities || [];
    assert.ok(
      evidence.agentCapabilities.includes("tab_reorder_anchor"),
      "deployed Provider and persistent agent must support atomic anchor reorder",
    );
    extras.push(...await createExtraTabs(page, 2));
    const [draggedID, targetID] = extras;

    evidence.mobileTabsVisible = await page.locator("#tabs").isVisible();
    assert.equal(evidence.mobileTabsVisible, false, "ordinary mobile layout must hide the top tab list");
    await page.locator("#tabOverviewToggle").click();
    await page.locator("#tabOverview").waitFor({ state: "visible" });
    evidence.overviewCards = await page.locator("#tabOverviewGrid .tab-overview-card").count();
    assert.ok(evidence.overviewCards >= 3, "ordinary mobile layout must expose tabs through overview");
    await page.locator("#tabOverviewClose").click();
    await page.locator("#tabOverview").waitFor({ state: "hidden" });

    await page.evaluate(() => {
      localStorage.setItem("webshell.debugMode", "true");
      localStorage.setItem("webshell.forcePCMode", "true");
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => document.body.classList.contains("force-pc-mode"));
    await page.locator("#tabs").waitFor({ state: "visible" });
    const targetTab = page.locator(`#tabs .tab[data-tab-id="${targetID}"]`);
    await targetTab.scrollIntoViewIfNeeded();
    const targetTapBox = await targetTab.boundingBox();
    if (!targetTapBox) throw new Error("force-PC touch target tab is not measurable");
    await page.touchscreen.tap(
      targetTapBox.x + targetTapBox.width / 2,
      targetTapBox.y + targetTapBox.height / 2,
    );
    await page.waitForFunction((id) => document.querySelector("#tabs .tab.active")?.dataset.tabId === id, targetID);

    evidence.before = await tabIDs(page);
    evidence.expected = moveAfter(evidence.before, draggedID, targetID);
    const [draggedBox, targetBox] = await Promise.all([
      page.locator(`#tabs .tab[data-tab-id="${draggedID}"]`).boundingBox(),
      page.locator(`#tabs .tab[data-tab-id="${targetID}"]`).boundingBox(),
    ]);
    if (!draggedBox || !targetBox) throw new Error("force-PC touch reorder tabs are not measurable");
    const start = { x: draggedBox.x + draggedBox.width / 2, y: draggedBox.y + draggedBox.height / 2 };
    const end = { x: targetBox.x + targetBox.width - 5, y: targetBox.y + targetBox.height / 2 };
    await dispatchTouchDrag(page, start, end);

    await page.waitForFunction((expected) => (
      Array.from(document.querySelectorAll("#tabs .tab"), (button) => button.dataset.tabId).join("\n")
        === expected.join("\n")
    ), evidence.expected, { timeout: 15000 });
    evidence.afterDrop = await tabIDs(page);
    evidence.workspaceAfterDrop = (await readWorkspace(page)).tabs.map((tab) => tab.id);
    assert.deepEqual(evidence.afterDrop, evidence.expected, "long-press touch drag must update the tab bar");
    assert.deepEqual(evidence.workspaceAfterDrop, evidence.expected, "long-press touch drag must persist the order");
    assert.equal(evidence.requests.length, 1, "one touch drag must submit exactly one reorder result");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction((expected) => (
      Array.from(document.querySelectorAll("#tabs .tab"), (button) => button.dataset.tabId).join("\n")
        === expected.join("\n")
    ), evidence.expected, { timeout: 30000 });
    evidence.afterReload = await tabIDs(page);
    assert.deepEqual(evidence.afterReload, evidence.expected, "touch reorder must survive reload");

    await page.screenshot({ path: path.join(artifactsDir, "touch-tab-reorder.png") });
    await eventLog({ status: "pass", action: "touch-tab-reorder-boundary", ...evidence });
    return { observations: [
      "ordinary mobile layout kept the top tab list hidden and opened terminal overview",
      "force-PC long-press touch reorder survived reload",
    ] };
  } finally {
    page.off("request", observeRequest);
    await persistEvidence(artifactsDir, evidence);
    await closeExtraTabs(page, extras);
  }
}
