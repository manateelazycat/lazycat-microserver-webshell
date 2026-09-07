import path from "node:path";
import { readConfig } from "./config.mjs";

export async function deviceConfiguration(overrides = {}) {
  const config = await readConfig(overrides);
  return { config, env: { ...process.env,
    ANDROID_HOME: config.androidSDKRoot, ANDROID_SDK_ROOT: config.androidSDKRoot,
    ANDROID_AVD_HOME: config.androidAVDHome,
    PATH: [path.join(config.androidSDKRoot, "platform-tools"), path.join(config.androidSDKRoot, "emulator"), process.env.PATH].join(path.delimiter),
  } };
}

// agent-device currently cannot bind its browser/native sessions to the verified
// local frontend route. Keep device setup available, but never test a deployed
// frontend as if it were the current working tree.
export async function withDeviceSession() {
  throw new Error("CURRENT_LOCAL_FRONTEND_UNAVAILABLE: agent-device automation is disabled until it can bind the verified local frontend; use the shared Playwright environment for browser tests");
}
