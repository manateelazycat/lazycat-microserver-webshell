import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { observeTerminal, waitForLiveTerminal, waitForVisibleOutput } from "../../environment/webshell-test-harness/observe.mjs";

export async function beforeNavigate({ page }) {
  await page.addInitScript(() => {
    // Keep the normal user surface unobstructed; console and timeline capture remain active.
    localStorage.setItem("webshell.debugLog", "false");
    window.__testsAutoPresentationTrace = [];
    window.__networkReplay = [];
    window.__networkControls = [];
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args);
        const send = socket.send.bind(socket);
        socket.send = (data) => {
          if (typeof data === "string") {
            try {
              const frame = JSON.parse(data);
              if (frame.control?.type === "queue-turn-ack" || frame.control?.type === "ping") {
                window.__networkControls.push({ direction: "send", at: performance.now(), frame });
              }
            } catch {}
          }
          return send(data);
        };
        socket.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          let frame;
          try { frame = JSON.parse(event.data); } catch { return; }
          const payload = frame.type === "pane-control" ? frame.payload : frame;
          if (["queue-turn-complete", "pong", "connection-error"].includes(payload?.type)) {
            window.__networkControls.push({ direction: "receive", at: performance.now(), frame });
          }
          if (window.__networkControls.length > 2000) window.__networkControls.splice(0, 500);
          if (payload?.type !== "history-replay-start") return;
          window.__networkReplay.push({
            paneID: frame.pane_id || payload.pane_id,
            at: performance.now(),
            bytes: Number(BigInt(payload.delta_to_cursor || "0") - BigInt(payload.delta_from_cursor || "0")),
          });
        });
        return socket;
      },
    });
  });
}

const action = async (page, type, payload = {}) => page.evaluate(async ({ type, payload }) => {
  const selector = new URL(location.href).searchParams.get("name");
  const response = await fetch("./api/workspace?name=" + encodeURIComponent(selector), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: type, cols: 120, rows: 32, ...payload }),
  });
  if (!response.ok) throw new Error("workspace action failed: " + response.status);
  return response.json();
}, { type, payload });

const send = async (state, text) => {
  await state.page.locator(".terminal-pane.active .terminal-host").first().click();
  await state.page.keyboard.type(text, { delay: 5 });
  await state.page.keyboard.press("Enter");
};

const echo = async (environment, window, prefix, nonce) => {
  const expected = prefix + nonce + "END";
  await send(environment.states[window], "printf '\\n%s%sEND\\n' '" + prefix + "' '" + nonce + "'");
  await waitForVisibleOutput(environment, expected, window + "-" + prefix, 20000, { window });
};

export async function run(environment) {
  const { states, eventLog, setNetworkOnline } = environment;
  const { desktop, mobile } = states;
  const nonce = randomInt(100000, 999999);
  let siblingTab;
  let streamStarted = false;
  let cdp;
  let originalScrollback;
  try {
    await waitForLiveTerminal(desktop.page);
    await echo(environment, "desktop", "BEFORE", nonce);
    originalScrollback = await desktop.page.evaluate(async () => {
      const response = await fetch("./api/settings");
      if (!response.ok) throw new Error("Cannot read history retention setting");
      const value = (await response.json()).terminal_scrollback;
      if (value < 6000) {
        const updated = await fetch("./api/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terminal_scrollback: 6000 }) });
        if (!updated.ok) throw new Error("Cannot prepare large real history retention");
      }
      return value;
    });
    // Apply increased server retention before generating this workspace's history.
    await action(desktop.page, "activate_tab", { tab_id: desktop.testTabID });
    const historyCommand = "i=0; while [ \"$i\" -lt 18000 ]; do printf 'H%06d"
      + "0123456789".repeat(10) + "\\n' \"$i\"; i=$((i+1)); done; printf '\\nHISTORY%sEND\\n' '" + nonce + "'";
    await send(desktop, historyCommand);
    await waitForVisibleOutput(environment, "HISTORY" + nonce + "END", "large-history-ready", 60000);
    const workspace = await action(mobile.page, "create_tab");
    siblingTab = workspace.active_tab_id;
    const siblingURL = new URL(mobile.page.url());
    siblingURL.searchParams.set("tab", siblingTab);
    await mobile.page.goto(siblingURL.toString(), { waitUntil: "domcontentloaded" });
    await waitForLiveTerminal(mobile.page);
    await echo(environment, "mobile", "SIBLING", nonce);

    // The process runs in the real disposable PTY and remains active during recovery.
    const command = "i=0; while [ \"$i\" -lt 16000 ]; do printf 'LIVE%s%06d\\n' '" + nonce
      + "' \"$i\"; i=$((i+1)); sleep 0.005; done";
    await send(desktop, command);
    streamStarted = true;
    await desktop.page.waitForFunction((prefix) => (window.__testsAutoTerminalOutput || "").includes(prefix),
      "LIVE" + nonce + "000010", { timeout: 15000 });
    const replayCount = await desktop.page.evaluate(() => window.__networkReplay.length);
    const offlineAt = Date.now();
    await setNetworkOnline(desktop, false);
    await desktop.page.waitForFunction(() => navigator.onLine === false, null, { timeout: 5000 });
    // Exercise the already-presented frame while offline, as when returning to the app.
    await desktop.page.setViewportSize({ width: 1280, height: 720 });
    cdp = await desktop.context.newCDPSession(desktop.page);
    await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
    await echo(environment, "mobile", "INDEPENDENT", nonce);
    await eventLog({ status: "pass", action: "sibling-usable-during-offline" });
    // Intentional fault duration: exceed both the 8s attach and 12s connect windows.
    await new Promise((resolve) => setTimeout(resolve, 20000));
    await cdp.send("Page.setWebLifecycleState", { state: "active" });
    await cdp.detach();
    cdp = null;
    await eventLog({ status: "info", action: "offline-duration", milliseconds: Date.now() - offlineAt });
    await setNetworkOnline(desktop, true);
    await desktop.page.bringToFront();
    await desktop.page.waitForFunction(({ count, paneID }) => window.__networkReplay.slice(count)
      .some((replay) => replay.paneID === paneID && replay.bytes >= 1500000),
    { count: replayCount, paneID: desktop.activePaneID }, { timeout: 20000 });
    await eventLog({ status: "info", action: "large-history-replayed",
      replays: await desktop.page.evaluate((count) => window.__networkReplay.slice(count), replayCount) });
    await waitForLiveTerminal(desktop.page, 20000);
    const first = await observeTerminal(environment, { name: "live-recovered-first" });
    const values = (text) => [...text.matchAll(new RegExp("LIVE" + nonce + "(\\d{6})", "g"))].map((m) => Number(m[1]));
    const before = values(first.text);
    assert.ok(before.length, "real recovered terminal screenshot must show live output");
    const deadline = Date.now() + 10000;
    let advanced = false;
    while (Date.now() < deadline) {
      const next = await observeTerminal(environment, { name: "live-recovered-next" });
      if (values(next.text).some((value) => value > Math.max(...before))) { advanced = true; break; }
    }
    assert.ok(advanced, "visible live output must advance after network recovery");
    await desktop.page.keyboard.press("Control+C");
    streamStarted = false;
    await echo(environment, "desktop", "AFTER", nonce);
    await desktop.page.locator("#tabs .tab[data-tab-id='" + siblingTab + "']").click();
    await waitForLiveTerminal(desktop.page);
    await desktop.page.locator("#tabs .tab[data-tab-id='" + desktop.testTabID + "']").click();
    await echo(environment, "desktop", "RETURN", nonce);
    await mobile.page.goto(new URL(desktop.page.url()).toString(), { waitUntil: "domcontentloaded" });
    await waitForLiveTerminal(mobile.page);
    await mobile.page.locator(".terminal-pane.active .terminal-host").first().dblclick();
    await mobile.page.setViewportSize({ width: 390, height: 520 });
    await echo(environment, "mobile", "VIEWPORT", nonce);
    await eventLog({ status: "pass", action: "network-original-session-visible-and-interactive" });
  } finally {
    if (cdp) {
      await cdp.send("Page.setWebLifecycleState", { state: "active" });
      await cdp.detach();
    }
    const trace = await desktop.page.evaluate(() => window.__testsAutoPresentationTrace || []).catch(() => []);
    await fs.writeFile(path.join(environment.artifactsDir, "presentation-trace.json"), JSON.stringify(trace));
    for (const [name, state] of Object.entries(states)) {
      const controls = await state.page.evaluate(() => ({
        controls: window.__networkControls || [],
        outputTail: (window.__testsAutoTerminalOutput || "").slice(-512),
        timelines: window.__testsAutoTerminalTimelineSnapshot?.() || [],
      })).catch(() => ({}));
      await fs.writeFile(path.join(environment.artifactsDir, name + "-network-controls.json"), JSON.stringify(controls));
    }
    await setNetworkOnline(desktop, true);
    if (streamStarted && !desktop.page.isClosed()) {
      await desktop.page.keyboard.press("Control+C");
    }
    if (siblingTab) await action(desktop.page, "close_tab", { tab_id: siblingTab });
    if (originalScrollback !== undefined && originalScrollback < 6000) {
      await desktop.page.evaluate(async (value) => {
        const response = await fetch("./api/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terminal_scrollback: value }) });
        if (!response.ok) throw new Error("Cannot restore history retention setting");
      }, originalScrollback);
    }
  }
}
