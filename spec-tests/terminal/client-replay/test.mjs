import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

export const targetKind = "client";
export const desktopOnly = true;

// Observe real sockets/DOM before boot. Never fabricate PTY bytes or replay events.
export async function beforeNavigate({ page }) {
  await page.addInitScript(() => {
    const probe = { sockets: [], samples: [], events: [], unsafe: [], stopped: false };
    window.__clientReplayProbe = probe;
    const Native = window.WebSocket;
    window.WebSocket = new Proxy(Native, {
      construct(target, args) {
        const socket = Reflect.construct(target, args);
        const url = new URL(String(args[0]), location.href);
        const record = { paneID: url.searchParams.get("pane") || url.searchParams.get("pane_id") || "", opened: 0, closed: null, tail: "", receivedCursor: "0", replays: [] };
        probe.sockets.push(record);
        socket.addEventListener("open", () => { record.opened = performance.now(); });
        socket.addEventListener("close", (event) => { record.closed = { at: performance.now(), code: event.code }; });
        socket.addEventListener("message", (event) => {
          if (typeof event.data === "string") {
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message.type === "history-replay-start") {
              record.receivedCursor = String(message.delta_from_cursor || "0");
              record.replays.push({ start: performance.now(), end: 0, bytes: 0, frames: 0 });
            }
            if (message.type === "history-replay-complete" && record.replays.length) {
              record.replays.at(-1).end = performance.now();
            }
            return;
          }
          if (!(event.data instanceof ArrayBuffer)) return;
          const bytes = new Uint8Array(event.data);
          record.receivedCursor = String(BigInt(record.receivedCursor) + BigInt(bytes.length));
          const replay = record.replays.at(-1);
          if (replay && !replay.end) { replay.bytes += bytes.length; replay.frames += 1; }
          record.tail = (record.tail + new TextDecoder().decode(bytes)).slice(-8192);
        });
        return socket;
      },
    });
    const seen = new Set();
    const sample = () => {
      if (probe.stopped) return;
      for (const pane of window.__testsAutoTerminalTimelineSnapshot?.() || []) {
        for (const event of pane.events) {
          if (!["presentation_ready_state", "presentation_commit_complete", "replay_output_drained", "socket_close", "history_replay_start", "history_replay_complete"].includes(event.type)) continue;
          const key = `${pane.paneID}:${JSON.stringify(event)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          probe.events.push({ paneID: pane.paneID, ...event });
          if (event.type === "presentation_ready_state" && event.ready && event.hasPresentedFrame === false) {
            probe.unsafe.push({ paneID: pane.paneID, reason: "ready_without_committed_frame", at: event.at });
          }
        }
      }
      const shell = document.querySelector(".terminal-pane.active .pane-shell");
      const canvas = shell?.querySelector("canvas:not(.terminal-frame-hold)");
      const hold = shell?.querySelector(".terminal-frame-hold");
      if (canvas) {
        const ready = shell.dataset.renderReady === "true";
        const presented = shell.dataset.hasPresentedFrame === "true";
        const held = hold && !hold.hidden && getComputedStyle(hold).display !== "none";
        const visible = getComputedStyle(canvas).visibility !== "hidden";
        const entry = { at: performance.now(), paneID: shell.dataset.paneId, ready, presented, held: Boolean(held), visible, width: canvas.width, height: canvas.height };
        probe.samples.push(entry);
        if ((ready && !presented) || (!ready && presented && !held)) probe.unsafe.push(entry);
      }
      if (probe.samples.length > 12000) probe.samples.splice(0, 1000);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const stable = (page, paneID) => page.waitForFunction((id) => {
  const shell = document.querySelector(`.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`);
  const canvas = shell?.querySelector("canvas:not(.terminal-frame-hold)");
  const hold = shell?.querySelector(".terminal-frame-hold");
  return shell?.dataset.renderReady === "true" && shell.dataset.hasPresentedFrame === "true"
    && shell.dataset.terminalFrameHeld !== "true"
    && (!hold || hold.hidden || getComputedStyle(hold).display === "none")
    && canvas?.width > 0 && canvas?.height > 0 && getComputedStyle(canvas).visibility === "visible";
}, paneID, { timeout: 20000 });

const action = (page, type, payload = {}) => page.evaluate(async ({ type, payload }) => {
  const name = new URL(location.href).searchParams.get("name");
  const response = await fetch(`./api/workspace?name=${encodeURIComponent(name)}&cols=120&rows=32`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: type, cols: 120, rows: 32, ...payload }),
  });
  if (!response.ok) throw Error(`workspace ${type} HTTP ${response.status}`);
  return response.json();
}, { type, payload });

const send = async (page, command) => {
  await page.locator(".terminal-pane.active .terminal-host").first().click();
  await page.keyboard.insertText(command);
  await page.keyboard.press("Enter");
};

const waitMarker = (page, paneID, marker) => page.waitForFunction(({ paneID, marker }) => (
  window.__clientReplayProbe.sockets.some((socket) => socket.paneID === paneID && socket.tail.includes(marker))
), { paneID, marker }, { timeout: 90000 });

const waitPresentedMarker = async (page, paneID, marker) => {
  await waitMarker(page, paneID, marker);
  const leaked = await page.evaluate(({ paneID, marker }) => window.__clientReplayProbe.sockets.some((socket) => socket.paneID !== paneID && socket.tail.includes(marker)), { paneID, marker });
  assert.equal(leaked, false, `marker from pane ${paneID} leaked into another pane's stream`);
  const cursor = await page.evaluate((id) => window.__clientReplayProbe.sockets.filter((socket) => socket.paneID === id).at(-1).receivedCursor, paneID);
  await page.waitForFunction(({ paneID, cursor }) => (
    (window.__testsAutoTerminalTimelineSnapshot?.() || []).find((pane) => pane.paneID === paneID)?.events
      .some((event) => BigInt(event.presentedCursor || "0") >= BigInt(cursor))
  ), { paneID, cursor }, { timeout: 20000 });
};

export async function run({ config, states, artifactsDir, eventLog, assertNoFatalErrors }) {
  const { desktop } = states;
  const { page } = desktop;
  assert.ok(new URL(page.url()).searchParams.get("name")?.startsWith("client:"), "requires real client: target");
  assert.ok(config.localStaticDir, "current Vite build mapping is required");
  const created = [];
  const tabs = [{ tabID: desktop.testTabID, paneID: desktop.activePaneID }];
  let originalScrollback;
  let changedSettings = false;
  let phase = "setup";
  const saveProbe = async (label) => {
    const probe = await page.evaluate(() => window.__clientReplayProbe).catch(() => null);
    await fs.writeFile(path.join(artifactsDir, `${label}-replay-probe.json`), JSON.stringify(probe));
    return probe;
  };
  try {
    originalScrollback = await page.evaluate(async () => {
      const r = await fetch("./api/settings"); if (!r.ok) throw Error(`settings HTTP ${r.status}`);
      return (await r.json()).terminal_scrollback;
    });
    // Only increase retention. Never truncate existing user history for a test.
    if (originalScrollback < 6000) {
      await page.evaluate(async () => {
        const r = await fetch("./api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terminal_scrollback: 6000 }) });
        if (!r.ok) throw Error(`settings PUT HTTP ${r.status}`);
      });
      changedSettings = true;
    }
    await stable(page, tabs[0].paneID);
    for (let index = 1; index < 3; index += 1) {
      const workspace = await action(page, "create_tab");
      const tabID = workspace.active_tab_id;
      created.push(tabID);
      const tab = workspace.tabs.find((entry) => entry.id === tabID);
      const paneID = tab.active_pane_id || tab.panes[0].id;
      tabs.push({ tabID, paneID });
      const url = new URL(page.url()); url.searchParams.set("tab", tabID);
      await saveProbe(`setup-${index}`);
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await stable(page, paneID);
      const marker = `AUTO_REPLAY_${Date.now()}_${index}`;
      // Separate writes with real PTY scheduling; assert actual replay fragmentation later.
      const code = `import sys,time;[(sys.stdout.write('R${index}'+str(i).zfill(6)+'x'*100+'\\n'),sys.stdout.flush(),time.sleep(.001)) for i in range(16384)];print('${marker.slice(0, 10)}'+'${marker.slice(10)}')`;
      await send(page, `python3 -c "${code}"`);
      await waitPresentedMarker(page, paneID, marker);
      await stable(page, paneID);
    }
    phase = "restore";
    await saveProbe("setup-final");
    const url = new URL(page.url()); url.searchParams.set("tab", tabs[0].tabID);
    // This browser context is created solely for the test. Start cold history
    // recovery without touching server history, credentials or the user's browser.
    await page.goto(new URL("/", url).toString(), { waitUntil: "domcontentloaded" });
    const cdp = await desktop.context.newCDPSession(page);
    await cdp.send("Storage.clearDataForOrigin", { origin: url.origin, storageTypes: "indexeddb" });
    await cdp.detach();
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    for (let index = 0; index < tabs.length; index += 1) {
      const { tabID, paneID } = tabs[index];
      await page.locator(`#tabs .tab[data-tab-id="${tabID}"]`).click();
      await stable(page, paneID);
      const marker = `AUTO_ECHO_${Date.now()}_${index}`;
      await send(page, `printf '%s%s\\n' '${marker.slice(0, 9)}' '${marker.slice(9)}'`);
      await waitPresentedMarker(page, paneID, marker);
      await stable(page, paneID);
      const pixels = await page.evaluate(() => {
        const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set();
        for (let i = 0; i < data.length; i += 16) if (data[i + 3]) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        return colors.size;
      });
      assert.ok(pixels > 4, `pane ${paneID} must contain foreground pixels, not only a background`);
      await page.screenshot({ path: path.join(artifactsDir, `tab-${index}-restored.png`) });
      await eventLog({ status: "pass", action: "client-tab-restored", index, paneID, colors: pixels });
    }
    const probe = await saveProbe("restored");
    assert.equal(probe.unsafe.filter((entry) => tabs.some((tab) => tab.paneID === entry.paneID)).length, 0,
      "replay must never expose uncommitted live Canvas or lose a held frame");
    for (const { paneID } of tabs.slice(1)) {
      const sockets = probe.sockets.filter((entry) => entry.paneID === paneID);
      assert.equal(sockets.length, 1, `pane ${paneID} retried during normal replay`);
      const replay = sockets[0].replays[0];
      assert.ok(replay?.end && replay.bytes >= 1500000 && replay.frames >= 10000,
        `insufficient real small-frame history coverage: ${JSON.stringify(replay)}`);
      const commit = probe.events.find((e) => e.paneID === paneID && e.type === "presentation_commit_complete");
      assert.ok(commit && BigInt(commit.appliedCursor) >= BigInt(commit.presentedCursor) && BigInt(commit.presentedCursor) > 0n,
        `pane ${paneID} must commit its applied history`);
    }
    // Return to a parked tab: this uses the real reconnect/retained-frame path.
    for (const [index, tab] of tabs.entries()) {
      await page.locator(`#tabs .tab[data-tab-id="${tab.tabID}"]`).click();
      await stable(page, tab.paneID);
      const marker = `AUTO_RETURN_${Date.now()}_${index}`;
      await send(page, `printf '%s%s\\n' '${marker.slice(0, 11)}' '${marker.slice(11)}'`);
      await waitPresentedMarker(page, tab.paneID, marker);
    }
    const finalProbe = await saveProbe("reconnected");
    assert.equal(finalProbe.unsafe.filter((entry) => tabs.some((tab) => tab.paneID === entry.paneID)).length, 0);
    const activeSockets = await page.evaluate(() => (window.__testsAutoSockets || []).filter((socket) => socket.readyState === 0 || socket.readyState === 1).length);
    assert.ok(activeSockets <= 3, "client direct connection quota must remain bounded");
    assertNoFatalErrors();
  } finally {
    await saveProbe(`final-${phase}`);
    const cleanupErrors = [];
    for (const tabID of created.reverse()) {
      await action(page, "close_tab", { tab_id: tabID }).catch((error) => cleanupErrors.push(error.message));
    }
    if (changedSettings) await page.evaluate(async (value) => {
      const r = await fetch("./api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terminal_scrollback: value }) });
      if (!r.ok) throw Error(`restore settings HTTP ${r.status}`);
    }, originalScrollback).catch((error) => cleanupErrors.push(error.message));
    if (cleanupErrors.length) {
      await eventLog({ status: "error", action: "client-test-cleanup", errors: cleanupErrors });
      throw new Error(`client test cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }
}
