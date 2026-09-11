// Environment calibration through an owned real PTY, not a performance AC.
import fs from "node:fs/promises";
import path from "node:path";
import { installLoadObserver } from "./load-observer.mjs";

export const desktopOnly = true;
export const performanceMode = true;
export const beforeNavigate = async ({ page }) => page.addInitScript(installLoadObserver);

export async function run(environment) {
  const state = environment.states.desktop;
  const { page } = state;
  await page.locator(".terminal-pane.active .terminal-host").click();
  const code = "for ((i=0;i<400;i++)); do printf 'H0:%06d %0117d\\n' \"$i\" 0; done; printf 'CALIBRATION_DONE\\n'";
  await page.keyboard.insertText(`bash -c "$(printf %s ${Buffer.from(code).toString("base64")} | base64 -d)"`);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__testsAutoTerminalOutput.includes("CALIBRATION_DONE"), null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const history = await page.evaluate(id => window.__loadObservation.readHistoryHeaders(id, 0), state.expectedPaneID);
  const snapshot = await page.evaluate(() => window.__loadObservation.snapshot());
  const report = { kind: "real-PTY-observation-calibration-not-load-acceptance", history, snapshot };
  await fs.writeFile(path.join(environment.artifactsDir, "history-calibration.json"), JSON.stringify(report, null, 2));
  if (history.headers.length < 300 || history.headers.some((h, i, all) => i && h.sequence !== all[i - 1].sequence + 1)) {
    throw new Error("Retained history sequence reader failed calibration");
  }
  return { observations: [{ type: "environment-calibration", report: "history-calibration.json" }] };
}
