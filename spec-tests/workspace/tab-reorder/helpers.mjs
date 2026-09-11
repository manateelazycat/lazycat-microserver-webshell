import fs from "node:fs/promises";
import path from "node:path";

export const tabIDs = (page) => page.locator("#tabs .tab").evaluateAll((buttons) => (
  buttons.map((button) => String(button.dataset.tabId || ""))
));

export const workspaceAction = (page, action, payload = {}) => page.evaluate(async ({ actionName, actionPayload }) => {
  const name = new URLSearchParams(location.search).get("name") || "";
  const response = await fetch(`./api/workspace?name=${encodeURIComponent(name)}&cols=120&rows=32`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: actionName, cols: 120, rows: 32, ...actionPayload }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`workspace ${actionName} HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}, { actionName: action, actionPayload: payload });

export const readWorkspace = (page) => page.evaluate(async () => {
  const name = new URLSearchParams(location.search).get("name") || "";
  const response = await fetch(`./api/workspace?name=${encodeURIComponent(name)}&cols=120&rows=32`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`workspace read HTTP ${response.status}`);
  return response.json();
});

export const createExtraTabs = async (page, count) => {
  const created = [];
  for (let index = 0; index < count; index += 1) {
    const before = new Set((await readWorkspace(page)).tabs.map((tab) => tab.id));
    const state = await workspaceAction(page, "create_tab");
    const added = state.tabs.filter((tab) => !before.has(tab.id));
    if (added.length !== 1) throw new Error("could not uniquely identify a created reorder test tab");
    created.push(added[0].id);
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction((ids) => ids.every((id) => document.querySelector(
    `#tabs .tab[data-tab-id="${CSS.escape(id)}"]`,
  )), created, { timeout: 30000 });
  return created;
};

export const closeExtraTabs = async (page, ids) => {
  for (const id of [...ids].reverse()) {
    await workspaceAction(page, "close_tab", { tab_id: id }).catch(() => {});
  }
};

export const moveAfter = (order, tabID, targetID) => {
  const next = order.filter((id) => id !== tabID);
  const targetIndex = next.indexOf(targetID);
  if (targetIndex < 0) throw new Error("target tab is missing from the initial order");
  next.splice(targetIndex + 1, 0, tabID);
  return next;
};

export const persistEvidence = (artifactsDir, evidence) => fs.writeFile(
  path.join(artifactsDir, "tab-reorder.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
