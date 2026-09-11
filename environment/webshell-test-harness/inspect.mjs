import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readConfig, loadPlaywright } from "./config.mjs";

export async function inspectEnvironment(overrides = {}) {
  const config = await readConfig(overrides);
  const result = { targetConfigured: Boolean(config.url), credentialsConfigured: Boolean(config.username && config.password), localStatic: Boolean(config.localStaticDir), channel: config.channel, foreground: config.foreground, displayConfigured: Boolean(config.display), storageStateConfigured: Boolean(config.storageState), playwright: false, browserInstalled: false, ocr: false };
  try {
    const { chromium } = await loadPlaywright(config);
    result.playwright = true;
    const executable = config.executablePath || (config.channel === 'chromium' ? chromium.executablePath() : config.channel === 'chrome' ? '/opt/google/chrome/chrome' : '');
    if (!executable) throw new Error('Use PLAYWRIGHT_EXECUTABLE_PATH for a custom channel');
    await fs.access(executable);
    result.browserInstalled = true;
  } catch { /* Discovery reports availability without starting a session. */ }
  try { execFileSync("tesseract", ["--version"], { stdio: "ignore", timeout: 5000 }); result.ocr = true; } catch {}
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await inspectEnvironment())); }
  catch { console.log(JSON.stringify({ status: "failed", error: "Cannot read environment configuration" })); process.exitCode = 1; }
}
