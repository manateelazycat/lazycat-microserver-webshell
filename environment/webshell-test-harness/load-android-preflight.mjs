// Resource/device preflight only; this does not claim Android load acceptance.
import fs from "node:fs/promises";
import path from "node:path";
import { installLoadObserver } from "./load-observer.mjs";

export const desktopOnly = true;
export const performanceMode = true;
export const beforeNavigate = async ({ page }) => page.addInitScript(installLoadObserver);

export async function run(environment) {
  const state = environment.states.desktop;
  if (!state.device || environment.config.loadDevice !== "android") throw new Error("A real Android browser connection is required");
  await state.verifyFrontend(true);
  await state.page.waitForFunction(() => window.__loadObservation.snapshot().sockets === 1, null, { timeout: 15000 });
  const report = await state.page.evaluate(() => ({
    kind: "android-current-build-preflight-not-load-acceptance",
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    observation: window.__loadObservation.snapshot(),
  }));
  if (!/Android/.test(report.userAgent) || report.observation.maxSockets !== 1) throw new Error("Android/Unified binding validation failed");
  await fs.writeFile(path.join(environment.artifactsDir, "android-current-build.json"), JSON.stringify(report, null, 2));
  return { observations: [{ type: "device-preflight", report: "android-current-build.json" }] };
}
