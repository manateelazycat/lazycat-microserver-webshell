import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { sendTerminalCommand, keyboardShown } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { openAndroidTerminalSettings, setAndroidSetting, closeAndroidSettings } from "../../environment/webshell-test-harness/android-settings.mjs";

const gateState = () => {
  const probe = window.__androidNetworkGateProbe;
  const timers = probe?.timers || [];
  const listeners = probe?.listeners || [];
  return { visible: document.querySelector("#terminalNetworkMonitor")?.hidden === false,
    tabSummariesVisible: [...document.querySelectorAll(".tab-network-metrics")].some((node) => !node.hidden),
    timersCreated: timers.length, activeTimers: timers.filter((item) => !item.cleared).length,
    listenersAdded: listeners.length, activeListeners: listeners.filter((item) => !item.removed).length };
};

export async function run({ device, page, selector, directory }) {
  const tab = await openAndroidTestTab(page, { selector, directory });
  const rotation = String(await device.adb(["shell", "cmd", "window", "user-rotation"])).trim();
  let original;
  try {
    original = await page.evaluate(() => ({
      debug: document.querySelector("#settingsDebugModeToggle")?.checked === true,
      network: document.querySelector("#settingsNetworkMonitorToggle")?.checked === true,
    }));
    if (await keyboardShown(device)) await device.key("KEYCODE_BACK");
    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "0"]);
    await page.waitFor(() => innerWidth < 640, [], 15_000);
    await page.evaluate(() => {
      const nativeSet = window.setInterval, nativeClear = window.clearInterval;
      const nativeAdd = WebSocket.prototype.addEventListener;
      const nativeRemove = WebSocket.prototype.removeEventListener;
      const timers = [], listeners = [];
      window.setInterval = function(callback, interval, ...args) {
        const id = nativeSet.call(this, callback, interval, ...args);
        if (Number(interval) === 1000) timers.push({ id, cleared: false });
        return id;
      };
      window.clearInterval = function(id) {
        for (const item of timers) if (item.id === id) item.cleared = true;
        return nativeClear.call(this, id);
      };
      WebSocket.prototype.addEventListener = function(type, listener, ...args) {
        if (["message", "open", "close", "error"].includes(type)) {
          listeners.push({ socket: this, type, listener, removed: false });
        }
        return nativeAdd.call(this, type, listener, ...args);
      };
      WebSocket.prototype.removeEventListener = function(type, listener, ...args) {
        for (const item of listeners) {
          if (item.socket === this && item.type === type && item.listener === listener) item.removed = true;
        }
        return nativeRemove.call(this, type, listener, ...args);
      };
      window.__androidNetworkGateProbe = { timers, listeners,
        restore() {
          window.setInterval = nativeSet;
          window.clearInterval = nativeClear;
          WebSocket.prototype.addEventListener = nativeAdd;
          WebSocket.prototype.removeEventListener = nativeRemove;
        } };
    });
    await openAndroidTerminalSettings(device, page);
    await setAndroidSetting(device, page, "settingsDebugModeToggle", true);
    await setAndroidSetting(device, page, "settingsNetworkMonitorToggle", true);
    await closeAndroidSettings(device, page);
    await page.waitFor(() => document.querySelector("#terminalNetworkMonitor")?.hidden === false &&
      window.__androidNetworkGateProbe?.timers?.some((item) => !item.cleared), [], 15_000);
    await sendTerminalCommand(device, page, tab, "echo GATECHECK");
    const enabled = await page.evaluate(gateState);
    const enabledScreenshot = path.join(directory, "monitor-enabled.png");
    await device.screenshot(enabledScreenshot);

    if (await keyboardShown(device)) await device.key("KEYCODE_BACK");
    await openAndroidTerminalSettings(device, page);
    await setAndroidSetting(device, page, "settingsNetworkMonitorToggle", false);
    await closeAndroidSettings(device, page);
    await page.waitFor(() => {
      const probe = window.__androidNetworkGateProbe;
      return document.querySelector("#terminalNetworkMonitor")?.hidden === true &&
        probe.timers.filter((item) => !item.cleared).length === 0 &&
        probe.listeners.filter((item) => !item.removed).length === 0;
    }, [], 10_000);
    const networkOff = await page.evaluate(gateState);
    const networkOffScreenshot = path.join(directory, "network-off.png");
    await device.screenshot(networkOffScreenshot);
    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "1"]);
    await page.waitFor(() => innerWidth > 640, [], 15_000);
    const networkOffWide = await page.evaluate(gateState);
    if (networkOffWide.tabSummariesVisible) throw new Error("Wide Android tabs still show network metrics when monitor is off");
    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "0"]);
    await page.waitFor(() => innerWidth < 640, [], 15_000);

    await openAndroidTerminalSettings(device, page);
    await setAndroidSetting(device, page, "settingsNetworkMonitorToggle", true);
    await closeAndroidSettings(device, page);
    await page.waitFor(() => document.querySelector("#terminalNetworkMonitor")?.hidden === false &&
      window.__androidNetworkGateProbe.timers.some((item) => !item.cleared), [], 10_000);
    await openAndroidTerminalSettings(device, page);
    await setAndroidSetting(device, page, "settingsDebugModeToggle", false);
    await closeAndroidSettings(device, page);
    await page.waitFor(() => {
      const probe = window.__androidNetworkGateProbe;
      return document.querySelector("#terminalNetworkMonitor")?.hidden === true &&
        probe.timers.filter((item) => !item.cleared).length === 0 &&
        probe.listeners.filter((item) => !item.removed).length === 0;
    }, [], 10_000);
    const debugOff = await page.evaluate(gateState);
    const debugOffScreenshot = path.join(directory, "debug-off.png");
    await device.screenshot(debugOffScreenshot);
    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "1"]);
    await page.waitFor(() => innerWidth > 640, [], 15_000);
    const debugOffWide = await page.evaluate(gateState);
    if (debugOffWide.tabSummariesVisible) throw new Error("Wide Android tabs still show network metrics when debug mode is off");
    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "0"]);
    await page.waitFor(() => innerWidth < 640, [], 15_000);
    const details = path.join(directory, "debug-gate-observation.json");
    await fs.writeFile(details, JSON.stringify({ enabled, networkOff, networkOffWide, debugOff, debugOffWide }, null, 2));
    if (networkOff.tabSummariesVisible || debugOff.tabSummariesVisible ||
        networkOff.visible || debugOff.visible || enabled.timersCreated < 1 || enabled.listenersAdded < 1) {
      throw new Error(`Android network monitor gate evidence is incomplete: ${JSON.stringify({ enabled, networkOff, debugOff })}`);
    }
    return { observations: [
      "Android network metrics appeared only while debug and network monitor were both enabled",
      "Turning either switch off hid the top bar and tab metrics, cleared its sample timer and detached socket listeners",
    ], evidence: [enabledScreenshot, networkOffScreenshot, debugOffScreenshot, details] };
  } finally {
    const cleanupErrors = [];
    try {
      if (original) {
        await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "0"]);
        await page.waitFor(() => innerWidth < 640, [], 15_000);
        await openAndroidTerminalSettings(device, page);
        await page.evaluate((wanted) => {
          const debug = document.querySelector("#settingsDebugModeToggle");
          const network = document.querySelector("#settingsNetworkMonitorToggle");
          if (!(debug instanceof HTMLInputElement) || !(network instanceof HTMLInputElement)) {
            throw new Error("Network settings are unavailable for cleanup");
          }
          if (network.checked !== wanted.network && !debug.checked) debug.click();
          if (network.checked !== wanted.network) network.click();
          if (debug.checked !== wanted.debug) debug.click();
        }, original);
        await closeAndroidSettings(device, page);
      }
    } catch (error) { cleanupErrors.push("settings: " + error.message); }
    try {
      await page.evaluate(() => { window.__androidNetworkGateProbe?.restore?.(); delete window.__androidNetworkGateProbe; });
    } catch (error) { cleanupErrors.push("observer: " + error.message); }
    try { await tab.close(); }
    catch (error) { cleanupErrors.push("tab: " + error.message); }
    try {
      const match = rotation.match(/^(free|lock)(?:\s+([0-3]))?/);
      if (match) await device.adb(["shell", "cmd", "window", "user-rotation", match[1],
        ...(match[1] === "lock" ? [match[2] || "0"] : [])]);
    } catch (error) { cleanupErrors.push("rotation: " + error.message); }
    if (cleanupErrors.length) {
      throw new Error("Android network monitor cleanup failed: " + cleanupErrors.join("; "));
    }
  }
}
