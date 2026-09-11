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

export const desktopOnly = true;

export async function run({ states, artifactsDir, eventLog }) {
  const { page, testTabID } = states.desktop;
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
    await page.locator(`#tabs .tab[data-tab-id="${targetID}"]`).click();
    await page.waitForFunction((id) => document.querySelector("#tabs .tab.active")?.dataset.tabId === id, targetID);

    evidence.before = await tabIDs(page);
    evidence.expected = moveAfter(evidence.before, draggedID, targetID);
    const dragged = page.locator(`#tabs .tab[data-tab-id="${draggedID}"]`);
    const target = page.locator(`#tabs .tab[data-tab-id="${targetID}"]`);
    const [draggedBox, targetBox] = await Promise.all([dragged.boundingBox(), target.boundingBox()]);
    if (!draggedBox || !targetBox) throw new Error("desktop reorder tabs are not measurable");

    const start = { x: draggedBox.x + draggedBox.width / 2, y: draggedBox.y + draggedBox.height / 2 };
    const end = { x: targetBox.x + targetBox.width - 6, y: targetBox.y + targetBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.waitForFunction((id) => document.querySelector("#tabs .tab.active")?.dataset.tabId === id, draggedID);
    await page.mouse.move(start.x + 12, start.y, { steps: 2 });
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();

    await page.waitForFunction((expected) => (
      Array.from(document.querySelectorAll("#tabs .tab"), (button) => button.dataset.tabId).join("\n")
        === expected.join("\n")
    ), evidence.expected, { timeout: 15000 });
    await page.waitForFunction(() => document.body.classList.contains("is-tab-reorder-committing") === false, null, { timeout: 15000 });
    evidence.afterDrop = await tabIDs(page);
    evidence.workspaceAfterDrop = (await readWorkspace(page)).tabs.map((tab) => tab.id);
    assert.deepEqual(evidence.afterDrop, evidence.expected, "tab bar must show the dropped order");
    assert.deepEqual(evidence.workspaceAfterDrop, evidence.expected, "workspace must persist the dropped order");
    assert.equal(evidence.requests.length, 1, "one drag must submit exactly one reorder_tab action");
    assert.equal(evidence.requests[0].tab_id, draggedID, "reorder action must identify the dragged tab");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction((expected) => (
      Array.from(document.querySelectorAll("#tabs .tab"), (button) => button.dataset.tabId).join("\n")
        === expected.join("\n")
    ), evidence.expected, { timeout: 30000 });
    evidence.afterReload = await tabIDs(page);
    evidence.activeAfterReload = await page.locator("#tabs .tab.active").getAttribute("data-tab-id");
    assert.deepEqual(evidence.afterReload, evidence.expected, "tab order must survive reload");
    assert.equal(evidence.activeAfterReload, draggedID, "dragged tab must remain active after reload");

    await page.screenshot({ path: path.join(artifactsDir, "desktop-tab-reorder.png") });
    await eventLog({ status: "pass", action: "desktop-tab-reorder", ...evidence });
    return { observations: [
      `one reorder request moved ${draggedID} after ${targetID}`,
      "the dragged inactive tab became active and its order survived reload",
    ] };
  } finally {
    page.off("request", observeRequest);
    await persistEvidence(artifactsDir, evidence);
    await closeExtraTabs(page, extras);
  }
}
