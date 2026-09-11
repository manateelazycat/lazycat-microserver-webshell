import fs from "node:fs/promises";
import path from "node:path";
import { installLoadObserver } from "./load-observer.mjs";
import { createAndroidLoadActions, installLoadProtocolInput } from "./android-load-actions.mjs";
import { observeTerminal } from "./observe.mjs";

export const desktopOnly = true;
export const performanceMode = true;
export const beforeNavigate = async ({ page }) => {
  await page.addInitScript(installLoadObserver);
  await page.addInitScript(installLoadProtocolInput);
};

export async function run(environment) {
  const state = environment.states.desktop;
  const native = await createAndroidLoadActions(state, environment.config);
  const url = new URL("./api/workspace", state.page.url());
  url.searchParams.set("name", new URL(environment.config.url).searchParams.get("name"));
  const action = async data => {
    const response = await state.page.request.post(url.href, { data, timeout: 10000 });
    if (!response.ok()) throw new Error(`Gesture preparation failed: ${response.status()}`);
    return response.json();
  };
  const ownedTabs = [];
  try {
    const split = await action({ action: "split_pane", tab_id: state.testTabID, pane_id: state.expectedPaneID, direction: "vertical" });
    const pane = split.tabs.find(t => t.id === state.testTabID).panes[0];
    let previous = split;
    for (let i = 0; i < 4; i++) {
      const created = await action({ action: "create_tab" });
      const owned = created.tabs.find(t => !previous.tabs.some(old => old.id === t.id));
      if (!owned) throw new Error("Cannot identify owned calibration tab");
      ownedTabs.push(owned);
      previous = created;
    }
    const ownedTab = ownedTabs.at(-1);
    await native.select({ id: ownedTab.panes[0].id, tabID: ownedTab.id });
    await native.select({ id: pane.id, tabID: state.testTabID });
    await native.panDivider(0.65);
    await state.page.waitForFunction(() => {
      const first = document.querySelector(".terminal-pane.active .pane-shell").getBoundingClientRect();
      const layout = document.querySelector(".terminal-pane.active .terminal-layout").getBoundingClientRect();
      return Math.abs(first.width / layout.width - 0.65) < 0.04;
    }, null, { timeout: 5000 });
    await native.rotate(1);
    await native.rotate(0);
    const code = Buffer.from("printf 'ANDROID_NATIVE_READY\\n'").toString("base64");
    await native.input(pane, `bash -c "$(printf %s '${code}' | base64 -d)"\r`);
    await state.page.waitForFunction(() => window.__testsAutoTerminalOutput.includes("ANDROID_NATIVE_READY"), null, { timeout: 10000 });
    const pixels = await observeTerminal(environment, { name: "android-gesture-final", paneID: pane.id });
    const report = { kind: "real-android-gesture-calibration-not-load-acceptance", pixels,
      observation: await state.page.evaluate(() => window.__loadObservation.snapshot()) };
    await fs.writeFile(path.join(environment.artifactsDir, "android-gestures.json"), JSON.stringify(report, null, 2));
    return { observations: [{ type: "native-gesture-calibration", report: "android-gestures.json" }] };
  } finally {
    await native.restore();
    for (const tab of ownedTabs.reverse()) await action({ action: "close_tab", tab_id: tab.id });
  }
}
