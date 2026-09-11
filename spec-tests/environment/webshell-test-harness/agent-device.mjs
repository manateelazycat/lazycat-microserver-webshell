import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readConfig } from "./config.mjs";

export async function deviceConfiguration(overrides = {}) {
  const config = await readConfig(overrides);
  return { config, env: { ...process.env,
    ANDROID_HOME: config.androidSDKRoot, ANDROID_SDK_ROOT: config.androidSDKRoot,
    ANDROID_AVD_HOME: config.androidAVDHome,
    AGENT_DEVICE_STATE_DIR: config.agentDeviceStateDir,
    PATH: [path.join(config.androidSDKRoot, "platform-tools"), path.join(config.androidSDKRoot, "emulator"), process.env.PATH].join(path.delimiter),
  } };
}

// The browser environment binds local assets on the owned page before navigation.
// Device setup uses agent-device; CDP supplies the same verified resource route
// and observations as desktop, without changing any pre-existing Chrome tabs.
export async function withDeviceSession({ chromium, config } = {}) {
  if (!chromium || !config?.androidSerial || !config.frontendManifest) {
    throw new Error("Android tests require an explicit serial and verified current frontend manifest");
  }
  const execute = promisify(execFile);
  const { env } = await deviceConfiguration();
  const adb = path.join(config.androidSDKRoot, "platform-tools/adb");
  const call = async args => (await execute(adb, ["-s", config.androidSerial, ...args], { env, timeout: 15000 })).stdout.trim();
  if (!config.androidSerial.startsWith("emulator-")) throw new Error("This load profile requires the explicitly bound Android emulator");
  if (await call(["get-state"]) !== "device") throw new Error("Selected Android emulator is unavailable");
  const packageName = "com.android.chrome";
  if (!await call(["shell", "pidof", packageName])) throw new Error("Open Android Chrome using agent-device before starting this profile");
  const port = await call(["forward", "tcp:0", "localabstract:chrome_devtools_remote"]);
  let browser;
  let page;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error("Android Chrome did not expose its browser context");
    page = await context.newPage();
    await page.bringToFront();
    return {
      browser, context, page, resourceScope: page,
      async close() {
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
        await call(["forward", "--remove", `tcp:${port}`]);
      },
    };
  } catch (error) {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await call(["forward", "--remove", `tcp:${port}`]).catch(() => {});
    throw error;
  }
}
