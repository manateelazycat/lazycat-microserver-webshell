import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { deviceConfiguration } from "./agent-device.mjs";

const execute = promisify(execFile);

// Preparation/health input uses the real public Unified protocol on the page's
// existing socket. Native gestures below measure the UI; this is not an IME test.
export function installLoadProtocolInput() {
  const original = WebSocket.prototype.send;
  const identities = new Map();
  WebSocket.prototype.send = function (data) {
    if (typeof data === "string") {
      let message;
      try { message = JSON.parse(data); } catch {}
      if (message?.type === "replace-subscriptions") {
        identities.clear();
        for (const subscription of message.subscriptions || []) identities.set(subscription.pane_id, { socket: this, subscription });
      }
    }
    return original.call(this, data);
  };
  window.__loadProtocolInput = (paneID, data) => {
    const entry = identities.get(paneID);
    if (!entry || entry.socket.readyState !== WebSocket.OPEN) throw new Error("No current real PTY subscription");
    const s = entry.subscription;
    original.call(entry.socket, JSON.stringify({ type: "pane-control", protocol_version: 1,
      pane_id: s.pane_id, stream_id: s.stream_id, channel_generation: s.channel_generation,
      control: { type: "input", data } }));
  };
}

export async function createAndroidLoadActions(state, config) {
  if (!state.device || !config.androidSerial.startsWith("emulator-")) throw new Error("Explicit Android emulator binding required");
  const { env } = await deviceConfiguration();
  const cli = fileURLToPath(new URL("../agent-device-mcp/node_modules/.bin/agent-device", import.meta.url));
  const adb = path.join(config.androidSDKRoot, "platform-tools/adb");
  const trace = [];
  const device = async args => {
    const action = { command: args[0], arguments: args.slice(1), startedAt: performance.now() };
    trace.push(action);
    if (trace.length > 512) trace.shift();
    // Raw coordinate taps are already grounded in the current DOM and native
    // WebView rectangle. Inject the native tap without a post-action AX dump;
    // the caller verifies the UI state through CDP, separately from tool cost.
    if (args[0] === "press" && /^\d+$/.test(args[1]) && /^\d+$/.test(args[2])) {
      await execute(adb, ["-s", config.androidSerial, "shell", "input", "tap", args[1], args[2]], { env, timeout: 5000 });
      action.backend = "android-input";
      action.durationMs = performance.now() - action.startedAt;
      return {};
    }
    let stdout;
    try {
      ({ stdout } = await execute(cli, [...args, "--session", "webshell-load", "--platform", "android", "--serial", config.androidSerial, "--json"], { env, timeout: 5000, maxBuffer: 2 * 1024 * 1024 }));
    } catch (error) { throw new Error(error.stdout || error.stderr || error.message); }
    const result = JSON.parse(stdout);
    if (!result.success) throw new Error("Native device action failed");
    action.backend = "agent-device";
    action.durationMs = performance.now() - action.startedAt;
    return result.data;
  };
  const shell = async args => (await execute(adb, ["-s", config.androidSerial, "shell", ...args], { env, timeout: 10000 })).stdout.trim();
  let transform;
  const transforms = new Map();
  const point = async (x, y) => {
    const viewport = await state.page.evaluate(() => ({ width: innerWidth, height: innerHeight, angle: screen.orientation?.angle || 0 }));
    const key = `${viewport.width}:${viewport.height}:${viewport.angle}`;
    if (transforms.has(key)) transform = transforms.get(key);
    if (!transform || transform.width !== viewport.width || transform.height !== viewport.height || transform.angle !== viewport.angle) {
      let webview;
      for (let attempt = 0; attempt < 3 && !webview; attempt++) {
        const tree = await device(["snapshot", "--force-full"]);
        const nodes = tree.snapshot?.nodes || tree.nodes || [];
        webview = nodes.find(n => n.type === "android.webkit.WebView" && n.rect?.width > 0);
        if (!webview) {
          await state.page.bringToFront();
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
      if (!webview) throw new Error("Native WebView bounds are unavailable; refusing guessed coordinates");
      transform = { ...viewport, rect: webview.rect, scale: webview.rect.width / viewport.width };
      transforms.set(key, transform);
    }
    return { x: Math.round(transform.rect.x + x * transform.scale), y: Math.round(transform.rect.y + y * transform.scale), scale: transform.scale };
  };
  let rotation;
  return {
    trace,
    async tap(selector) {
      const locator = state.page.locator(selector);
      await locator.waitFor({ state: "visible", timeout: 5000 });
      // Overview cards are replaced as previews update. Read the current node
      // and its rectangle in one browser task instead of retaining a stale AX
      // or ElementHandle across the device/browser transport round trip.
      const measure = () => state.page.evaluate(selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      }, selector);
      let rect = await measure();
      if (!rect) throw new Error(`Native tap target is not visible: ${selector}`);
      if (selector.startsWith(".tab-overview-card-main")) {
        for (let attempt = 0; attempt < 4; attempt++) {
          const viewport = await state.page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          const y = rect.y + Math.min(rect.height / 2, 20);
          if (y >= 70 && y <= viewport.height - 30) break;
          const down = y > viewport.height - 30;
          const origin = await point(viewport.width / 2, viewport.height * (down ? 0.75 : 0.3));
          await device(["gesture", "pan", String(origin.x), String(origin.y), "0", String(Math.round(viewport.height * 0.45 * origin.scale * (down ? -1 : 1))), "400"]);
          rect = await measure();
          if (!rect) throw new Error("Overview target disappeared while scrolling");
        }
      }
      // Repeated tab labels and Canvas dividers have no unique AX selector;
      // use DOM geometry mapped through the observed native WebView bounds.
      const p = await point(rect.x + rect.width / 2, rect.y + Math.min(rect.height / 2, 20));
      await device(["press", String(p.x), String(p.y)]);
    },
    async select(pane) {
      const overviewOpen = await state.page.locator("#tabOverview").isVisible();
      if (await state.page.evaluate(() => document.querySelector(".terminal-pane.active")?.dataset.tabId) !== pane.tabID || overviewOpen) {
        if (!overviewOpen) await this.tap("#tabOverviewToggle");
        await state.page.locator("#tabOverview").waitFor({ state: "visible", timeout: 5000 });
        await this.tap(`.tab-overview-card-main[data-tab-id="${pane.tabID}"]`);
        await state.page.waitForFunction(id => document.querySelector(".terminal-pane.active")?.dataset.tabId === id, pane.tabID, { timeout: 5000 });
        await state.page.locator("#tabOverview").waitFor({ state: "hidden", timeout: 5000 });
      }
      const paneActive = await state.page.evaluate(id => document.querySelector(".terminal-pane.active .pane-shell.active")?.dataset.paneId === id, pane.id);
      if (paneActive) return;
      await this.tap(`.pane-shell[data-pane-id="${pane.id}"] .terminal-host`);
    },
    input(pane, data) { return state.page.evaluate(({ id, data }) => window.__loadProtocolInput(id, data), { id: pane.id, data }); },
    async panDivider(ratio) {
      const handle = await state.page.waitForFunction(() => {
        const divider = document.querySelector(".terminal-pane.active .split-divider")?.getBoundingClientRect();
        const layout = document.querySelector(".terminal-pane.active .terminal-layout")?.getBoundingClientRect();
        if (!divider?.width || !divider.height || !layout?.width) return false;
        const rect = r => ({ x: r.x, y: r.y, width: r.width, height: r.height });
        return { divider: rect(divider), layout: rect(layout) };
      }, null, { timeout: 5000 });
      const { divider, layout } = await handle.jsonValue();
      await handle.dispose();
      const p = await point(divider.x + divider.width / 2, divider.y + Math.min(80, divider.height / 2));
      const end = await point(layout.x + layout.width * ratio, divider.y + Math.min(80, divider.height / 2));
      await device(["gesture", "pan", String(p.x), String(p.y), String(end.x - p.x), "0", "750"]);
    },
    async rotate(index) {
      if (!rotation) rotation = { auto: await shell(["settings", "get", "system", "accelerometer_rotation"]), value: await shell(["settings", "get", "system", "user_rotation"]) };
      await shell(["settings", "put", "system", "accelerometer_rotation", "0"]);
      await shell(["settings", "put", "system", "user_rotation", String(index)]);
      await state.page.waitForFunction(landscape => (innerWidth > innerHeight) === landscape, index % 2 === 1, { timeout: 5000 });
      transform = null;
    },
    async restore() {
      if (!rotation) return;
      for (const [key, value] of [["user_rotation", rotation.value], ["accelerometer_rotation", rotation.auto]]) {
        await shell(value === "null" ? ["settings", "delete", "system", key] : ["settings", "put", "system", key, value]);
      }
      rotation = null;
    },
  };
}
