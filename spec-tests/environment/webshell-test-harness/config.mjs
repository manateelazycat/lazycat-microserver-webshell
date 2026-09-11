import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export async function readEnvironment(overrides = {}) {
  const env = { ...process.env };
  const filename = overrides.envFile || env.WEBSHELL_TEST_ENV_FILE || path.join(projectRoot, "spec-tests/.env");
  let contents = "";
  try { contents = await fs.readFile(filename, "utf8"); }
  catch (error) { if (error.code !== "ENOENT" || overrides.envFile || env.WEBSHELL_TEST_ENV_FILE) throw error; }
  for (const raw of contents.split(/\r?\n/)) {
    const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match || env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

export async function readConfig(overrides = {}) {
  const env = await readEnvironment(overrides);
  const flag = (value, fallback) => value === undefined || value === "" ? fallback : !["0", "false", "off", "no"].includes(String(value).toLowerCase());
  return {
    url: overrides.url ?? env.WEBSHELL_TEST_URL ?? "",
    username: env.WEBSHELL_TEST_USERNAME || "", password: env.WEBSHELL_TEST_PASSWORD || "",
    localStaticDir: overrides.staticDir ?? env.WEBSHELL_LOCAL_STATIC_DIR ?? "",
    productStaticDir: env.WEBSHELL_PRODUCT_STATIC_DIR || overrides.staticDir || env.WEBSHELL_LOCAL_STATIC_DIR || "",
    frontendManifest: overrides.frontendManifest || env.WEBSHELL_TEST_BUILD_MANIFEST || "",
    foreground: overrides.foreground ?? (env.HEADLESS === "1" ? false : flag(env.TEST_FOREGROUND, true)),
    display: env.DISPLAY || "",
    storageState: env.WEBSHELL_TEST_STORAGE_STATE || undefined,
    rounds: Math.max(1, Number.parseInt(env.TEST_ROUNDS || "3", 10) || 3),
    mobileUserAgent: env.WEBSHELL_MOBILE_USER_AGENT || "",
    mobileDeviceScaleFactor: Math.max(1, Number(env.WEBSHELL_MOBILE_DEVICE_SCALE_FACTOR) || 1),
    captureTerminalTimeline: flag(env.WEBSHELL_CAPTURE_TERMINAL_TIMELINE, false),
    enableInitializationPerformance: flag(env.WEBSHELL_ENABLE_INITIALIZATION_PERFORMANCE, false),
    channel: env.PW_CHANNEL || "chrome",
    executablePath: env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    moduleRoot: env.PLAYWRIGHT_NODE_PATH || path.join(projectRoot, "spec-tests/node_modules"),
    clientURL: env.WEBSHELL_CLIENT_TEST_URL || "",
    androidSDKRoot: env.ANDROID_SDK_ROOT || env.ANDROID_HOME || path.join(os.homedir(), "Android/sdk"),
    androidAVDHome: env.ANDROID_AVD_HOME || path.join(os.homedir(), "Android/avd"),
    androidSerial: env.WEBSHELL_ANDROID_SERIAL || "",
    androidDevice: env.WEBSHELL_ANDROID_DEVICE || "",
    loadDevice: env.WEBSHELL_LOAD_DEVICE || "desktop",
    loadOriginalScrollback: Number(env.WEBSHELL_LOAD_ORIGINAL_SCROLLBACK || 0),
    expectedProviderRevision: env.WEBSHELL_EXPECTED_PROVIDER_REVISION || "",
    loadCompanionURL: env.WEBSHELL_LOAD_COMPANION_URL || "",
    agentDeviceStateDir: env.WEBSHELL_AGENT_DEVICE_STATE_DIR || path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "webshell-test-environment/agent-device"),
  };
}

export async function loadPlaywright(config) {
  return import(pathToFileURL(path.join(config.moduleRoot, "@playwright/test/index.mjs")));
}

export async function validateConfig(config) {
  if (!config.url) throw new Error("WEBSHELL_TEST_URL is required: a static build does not supply the real backend");
  const target = new URL(config.url);
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password) throw new Error("Use an HTTP(S) test URL without embedded credentials");
  if (target.pathname === "/webshell") target.pathname = "/webshell/";
  if (!["/", "/webshell/"].includes(target.pathname)) throw new Error("Use the standalone / or embedded /webshell/ entrypoint so the current local frontend can be verified");
  config.url = target.toString();
  if (!config.localStaticDir || !config.frontendManifest) throw new Error("A verified current local frontend build is required; use run-ac.sh or the shared environment entrypoint");
  await fs.access(path.join(config.localStaticDir, "index.html"));
  if (config.foreground && !config.display) throw new Error("DISPLAY is required for the default visible Google Chrome windows; configure an X11 session or explicitly set TEST_FOREGROUND=0");
  if (config.storageState) await fs.access(config.storageState);
  const { chromium } = await loadPlaywright(config);
  if (config.executablePath) await fs.access(config.executablePath);
  else if (config.channel === "chromium") await fs.access(chromium.executablePath());
  return { chromium };
}
