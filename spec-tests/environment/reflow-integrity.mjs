// Real PTY diagnostic for fragmented output while resizing; not the load AC.
import fs from "node:fs/promises";
import path from "node:path";
import { installLoadObserver } from "./load-observer.mjs";
import { installLoadProtocolInput } from "./android-load-actions.mjs";
export const desktopOnly = true;
export const performanceMode = true;
export const beforeNavigate = async ({ page }) => {
  await page.addInitScript(() => { window.__loadTraceResize = true; });
  await page.addInitScript(installLoadObserver);
  await page.addInitScript(installLoadProtocolInput);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function run(environment) {
  const state = environment.states.desktop, page = state.page;
  const settingsURL = new URL("./api/settings", page.url()).href;
  const settings = async data => {
    const r = await page.request.fetch(settingsURL, { method: data ? "PUT" : "GET", data, timeout: 10000 });
    if (!r.ok()) throw new Error(`Settings request failed: ${r.status()}`);
    return r.json();
  };
  const original = (await settings()).terminal_scrollback;
  const report = { kind: "real-PTY-fragmented-output-resize-diagnostic", originalScrollback: original };
  try {
    await settings({ terminal_scrollback: 100000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(id => document.querySelector(`.pane-shell[data-pane-id="${id}"]`)?.dataset.renderReady === "true", state.expectedPaneID, { timeout: 15000 });
    const send = code => page.evaluate(({ id, command }) => window.__loadProtocolInput(id, command), { id: state.expectedPaneID, command: `bash -c "$(printf %s '${Buffer.from(code).toString("base64")}' | base64 -d)"\r` });
    const narrow = process.env.WEBSHELL_REFLOW_NARROW === "1";
    if (narrow) {
      await page.setViewportSize({ width: 412, height: 786 });
      await send("for ((i=0;i<100100;i++)); do printf 'H0:%06d %0117d\\n' \"$i\" 0; if ((i%100==99)); then sleep 0.01; fi; done; printf 'WARM_READY\\n'");
      await page.waitForFunction(() => window.__testsAutoTerminalOutput.includes("WARM_READY"), null, { timeout: 90000 });
      await page.waitForFunction(id => window.__loadObservation.isOutputDrained(id), state.expectedPaneID, { timeout: 10000 });
    }
    report.before = await page.evaluate(() => window.__loadObservation.snapshot());
    const code = "for ((i=0;i<2500;i++)); do printf 'L0:'; sleep 0.002; printf '%06d %0501d\\n' \"$i\" 0; sleep 0.005; done; printf 'REFLOW_DONE\\n'";
    await send(code);
    const start = performance.now();
    let step = 0;
    while (performance.now() - start < 20000) {
      await page.setViewportSize({ width: Math.round((narrow ? 400 : 1100) + (narrow ? 90 : 300) * Math.sin(step++ / 10)), height: narrow ? 786 : 900 });
      await sleep(33);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    report.resizeSteps = step;
    await page.waitForFunction(() => window.__testsAutoTerminalOutput.includes("REFLOW_DONE"), null, { timeout: 30000 });
    await sleep(500);
    report.snapshot = await page.evaluate(() => window.__loadObservation.snapshot());
    const terminal = report.snapshot.terminals.find(p => p.paneID === state.expectedPaneID);
    const headers = [];
    for (let offset = Math.max(0, terminal.historyRows - 20000); offset < terminal.historyRows;) {
      const rows = await page.evaluate(({ id, offset }) => window.__loadObservation.readHistoryHeaders(id, offset), { id: state.expectedPaneID, offset });
      headers.push(...rows.headers.filter(h => h.stream === "L0"));
      offset = rows.nextOffset;
    }
    report.native = { count: headers.length, first: headers[0], last: headers.at(-1), gaps: [] };
    for (let i = 1; i < headers.length; i++) {
      if (headers[i].sequence !== headers[i - 1].sequence + 1) report.native.gaps.push({ before: headers[i - 1], after: headers[i] });
    }
    if (report.native.gaps.length) {
      report.gapRows = [];
      for (const gap of report.native.gaps.slice(0, 4)) {
        report.gapRows.push(await page.evaluate(({ id, offset }) => window.__loadObservation.readHistoryHeaders(id, offset, 24, true), { id: state.expectedPaneID, offset: Math.max(0, gap.before.row - 2) }));
      }
      throw new Error("Native history differs from continuous PTY output");
    }
  } catch (error) { report.error = error.message; throw error; }
  finally {
    await settings({ terminal_scrollback: original });
    await fs.writeFile(path.join(environment.artifactsDir, "reflow-integrity.json"), JSON.stringify(report, null, 2));
  }
  return { observations: [{ type: "reflow-integrity-diagnostic", report: "reflow-integrity.json" }] };
}
