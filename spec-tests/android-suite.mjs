import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readEnvironment } from "./environment/webshell-test-harness/config.mjs";
import { connectAndroidDevice } from "./environment/webshell-test-harness/device-hub.mjs";
import { openAndroidWebView } from "./environment/webshell-test-harness/android-webview.mjs";
import { connectLightOSPage } from "./environment/webshell-test-harness/android-cdp.mjs";
import { verifyAndroidVersion } from "./environment/webshell-test-harness/android-version.mjs";

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const started = performance.now();
const values = {};
for (let index = 0; index < process.argv.length - 2; index++) {
  const argument = process.argv[index + 2];
  if (!["--scenarios-file", "--artifacts-dir", "--timeout", "--json", "--url", "--env-file"].includes(argument)) {
    throw new Error("Invalid Android suite option");
  }
  if (argument !== "--json") {
    const value = process.argv[++index + 2];
    if (!value || values[argument] !== undefined) throw new Error("Missing or duplicate Android suite option");
    values[argument] = value;
  }
}

const progress = (value) => process.stderr.write(`AC_PROGRESS ${JSON.stringify(value)}\n`);
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const reportRoot = path.resolve(values["--artifacts-dir"] || path.join(here, "reports/android"));
const timeout = Number(values["--timeout"] || 300);
let device, webview, page, build, selected = [], setupComplete = false;
const results = [];

async function settleRestartPrompt(device, page, directory) {
  // A same-version LPK install still restarts the real service. Its public
  // update prompt can arrive after the first page load and block user input.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const accepted = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    let prompt;
    try { prompt = await page.evaluate(() => {
      const candidates = [
        [document.querySelector("#dialogBackdrop"), document.querySelector("#dialogTitle"), document.querySelector("#dialogOK")],
        [document.querySelector("#mobileCloseConfirmSheet"), document.querySelector("#mobileCloseConfirmTitle"), document.querySelector("#mobileCloseConfirmOK")],
      ];
      for (const [container, title, button] of candidates) {
        if (!container || container.hidden || !button) continue;
        const label = String(title?.textContent || "").trim();
        if (!/WebShell|Service restarted|服务已更新|服务重启/i.test(label)) {
          throw new Error(`An unrelated Android dialog is blocking setup: ${label}`);
        }
        const rect = button.getBoundingClientRect();
        return { title: label, x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
          y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
      }
      return null;
    }); } catch (error) {
      if (!/context.*destroyed|Cannot find context|inspected target navigated/i.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    if (!prompt) {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
      else break;
      continue;
    }
    await device.tap(prompt.x, prompt.y);
    accepted.push(prompt.title);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await fs.writeFile(path.join(directory, "restart-prompt.json"), JSON.stringify({ accepted }, null, 2));
  const blocked = await page.evaluate(() => document.querySelector("#dialogBackdrop")?.hidden === false ||
    document.querySelector("#mobileCloseConfirmSheet")?.hidden === false);
  if (blocked) throw new Error("The Android WebShell restart prompt did not close after confirmation");
}
try {
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600) throw new Error("Invalid Android scenario timeout");
  selected = JSON.parse(await fs.readFile(values["--scenarios-file"], "utf8")).scenarios;
  if (!Array.isArray(selected) || !selected.length || selected.some((item) =>
    !item.global_id || !/^[-\w]+\/[-\w]+\/android(?:-[-\w]+)?\.mjs$/.test(item.test_id))) {
    throw new Error("Android scenario selection is invalid");
  }
  await fs.mkdir(reportRoot, { recursive: true });
  const env = await readEnvironment({ envFile: values["--env-file"] });
  if (values["--url"]) env.WEBSHELL_TEST_URL = values["--url"];
  const targetURL = new URL(env.WEBSHELL_TEST_URL || "https://invalid.local/");
  const selector = targetURL.searchParams.get("name");
  if (!selector || !["/", "/webshell/"].includes(targetURL.pathname)) {
    throw new Error("WEBSHELL_TEST_URL must explicitly bind a WebShell instance");
  }
  if (!env.WEBSHELL_DEVICE_MCP_URL || !env.WEBSHELL_DEVICE_MCP_OWNER ||
      !env.WEBSHELL_DEVICE_NAME || env.WEBSHELL_DEVICE_KIND !== "emulator") {
    throw new Error("Android MCP URL, owner, exact emulator name and kind are required");
  }
  progress({ event: "phase", phase: "setup", status: "running", message: "Building the current LightOS LPK" });
  const buildScript = path.join(here, "environment/webshell-test-harness/android-lpk.py");
  await execute("python3", [buildScript, "build", reportRoot], { cwd: root, timeout: 600_000, maxBuffer: 1024 * 1024 });
  build = JSON.parse(await fs.readFile(path.join(reportRoot, "build.json"), "utf8"));
  device = await connectAndroidDevice({ endpoint: env.WEBSHELL_DEVICE_MCP_URL,
    owner: env.WEBSHELL_DEVICE_MCP_OWNER, name: env.WEBSHELL_DEVICE_NAME,
    kind: "emulator", adbPath: path.join(env.ANDROID_SDK_ROOT || path.join(os.homedir(), "Android/sdk"), "platform-tools/adb") });
  const installed = await device.installedPackages();
  if (!installed.includes("cloud.lazycat.client") ||
      !installed.includes("cloud.lazycat.webapk.cloud.lazycat.lightos.entry")) {
    throw new Error("The selected Android device lacks the Lazycat client or LightOS app");
  }
  progress({ event: "phase", phase: "setup", status: "running",
    message: "Checking the running LightOS LPK on debug123 and installing if content differs" });
  await execute("python3", [buildScript, "install", reportRoot], {
    cwd: root, timeout: 600_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, WEBSHELL_ADB_PATH: device.adbPath,
      WEBSHELL_ADB_HOST: device.adbPrefix[1], WEBSHELL_ADB_PORT: device.adbPrefix[3],
      WEBSHELL_ADB_SERIAL: device.device.serial },
  });
  const installReceipt = JSON.parse(await fs.readFile(path.join(reportRoot, "install-receipt.json"), "utf8"));
  if (installReceipt.installed) await device.home();
  await device.launch("cloud.lazycat.webapk.cloud.lazycat.lightos.entry", "com.webapk.app.activity.MainActivity");
  webview = await openAndroidWebView(device, { artifactsDir: reportRoot });
  page = await connectLightOSPage(webview.endpoint);
  if (installReceipt.installed) {
    await page.send("Page.reload", { ignoreCache: true }, 30_000);
    await page.waitFor(() => document.readyState === "complete", [], 30_000);
  }
  await settleRestartPrompt(device, page, reportRoot);
  await page.waitFor(() => {
    const assets = performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname);
    const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
    return document.readyState === "complete" &&
      assets.some((name) => /\/assets\/index-[^/]+\.js$/.test(name)) &&
      assets.some((name) => /\/assets\/ghostty-vt-[^/]+\.wasm$/.test(name)) &&
      Number(canvas?.width || 0) > 0;
  }, [], 60_000);
  await verifyAndroidVersion(page, build, reportRoot);
  setupComplete = true;
  progress({ event: "phase", phase: "setup", status: "passed", message: "Android LightOS matches the current LPK",
    duration_seconds: Math.round((performance.now() - started) / 1000) });
  const tessdata = path.resolve(env.WEBSHELL_TESSDATA_DIR || path.join(here, ".state/tessdata"));
  for (const item of selected) {
    const scenarioStarted = performance.now();
    const directory = path.join(reportRoot, item.global_id);
    await fs.mkdir(directory, { recursive: true });
    const result = { scenario: item.global_id, test_id: item.test_id, status: "failed",
      evidence_granularity: "scenario", debug_report: path.join(directory, "result.json") };
    try {
      await verifyAndroidVersion(page, build, directory);
      const source = path.resolve(here, item.test_id);
      if (!source.startsWith(here + path.sep)) throw new Error("Android test module is outside spec-tests");
      const module = await import(pathToFileURL(source));
      if (typeof module.run !== "function") throw new Error("Android test module has no run function");
      progress({ event: "scenario", scenario: item.global_id, status: "running" });
      let timer;
      const evidence = await Promise.race([
        module.run({ device, page, webview, build, selector, directory, tessdata,
          companionConfig: { url: env.WEBSHELL_TEST_URL, username: env.WEBSHELL_TEST_USERNAME,
            password: env.WEBSHELL_TEST_PASSWORD, expectedRevision: build.content_revision } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Android scenario timed out")), timeout * 1000); }),
      ]).finally(() => clearTimeout(timer));
      if (!Array.isArray(evidence?.observations) || !evidence.observations.length ||
          !Array.isArray(evidence.evidence) || !evidence.evidence.length) {
        throw new Error("Android scenario returned no external observation and evidence");
      }
      for (const filename of evidence.evidence) await fs.access(filename);
      await verifyAndroidVersion(page, build, directory);
      result.status = "passed";
      result.observations = evidence.observations;
      result.evidence = evidence.evidence;
    } catch (error) {
      result.error = String(error.message || error);
      await device.screenshot(path.join(directory, "failure.png")).catch(() => {});
    }
    result.duration_seconds = Math.round((performance.now() - scenarioStarted) / 10) / 100;
    await fs.writeFile(result.debug_report, JSON.stringify(result, null, 2));
    results.push(result);
    progress({ event: "scenario", scenario: item.global_id, status: result.status,
      duration_seconds: result.duration_seconds });
  }
  await execute("python3", [buildScript, "verify", reportRoot], { cwd: root, timeout: 60_000 });
} catch (error) {
  if (!setupComplete) {
    progress({ event: "phase", phase: "setup", status: "failed", message: String(error.message || error) });
    emit({ status: "failed", results: [], error: String(error.message || error) });
    process.exitCode = 1;
  } else {
    for (const item of selected.slice(results.length)) results.push({ scenario: item.global_id,
      test_id: item.test_id, status: "failed", error: "Android suite stopped: " + String(error.message || error),
      duration_seconds: 0 });
  }
} finally {
  let cleanupError;
  try { await page?.close(); await webview?.close(); }
  catch (error) { cleanupError = error; }
  if (setupComplete) {
    if (cleanupError && results.length) { results.at(-1).status = "failed"; results.at(-1).error = "Android cleanup failed: " + cleanupError.message; }
    const status = results.every((item) => item.status === "passed") ? "passed" : "failed";
    const response = { status, results, device: device?.device,
      duration_seconds: Math.round((performance.now() - started) / 10) / 100 };
    await fs.writeFile(path.join(reportRoot, "android-results.json"), JSON.stringify(response, null, 2));
    emit(response);
    process.exitCode = status === "passed" ? 0 : 1;
  }
}
