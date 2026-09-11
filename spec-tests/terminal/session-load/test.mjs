import fs from "node:fs/promises";
import path from "node:path";
import { installLoadObserver } from "../../../environment/agent-device-mcp/load-observer.mjs";
import { observeTerminal, ensureOCRAvailable } from "../../../environment/agent-device-mcp/observe.mjs";
import { createTarget } from "../../../environment/agent-device-mcp/target.mjs";
import { createAndroidLoadActions, installLoadProtocolInput } from "../../../environment/agent-device-mcp/android-load-actions.mjs";

export const desktopOnly = true;
export const performanceMode = true;
export const beforeNavigate = async ({ page, device }) => {
  await page.addInitScript(installLoadObserver);
  if (device) await page.addInitScript(installLoadProtocolInput);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const LIMIT = 100000;
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] || 0;

export async function run(environment) {
  await ensureOCRAvailable();
  const { states: { desktop: state }, config, artifactsDir, eventLog } = environment;
  const { page } = state;
  let rejectPageFailure;
  const pageFailure = new Promise((_, reject) => { rejectPageFailure = reject; });
  pageFailure.catch(() => {});
  const onPageError = error => rejectPageFailure(error);
  page.on("pageerror", onPageError);
  const tag = `load${Date.now().toString(36)}`;
  const report = { tag, phase: "prepare", validReproduction: false, failures: [], history: [], actions: [] };
  const ownedTabs = [];
  const panes = [];
  let originalScrollback;
  let settingsChanged = false;
  let companionSettingsURL;
  let companionOriginal;
  let companionChanged = false;
  let profiling = false;
  const outputPanes = Number(process.env.WEBSHELL_LOAD_OUTPUT_PANES || 3);
  const cpuRate = Number(process.env.WEBSHELL_LOAD_CPU_RATE || 1);
  if (![1, 3].includes(outputPanes) || ![1, 4].includes(cpuRate)) throw new Error("Unsupported load conditions");
  const native = config.loadDevice === "android" ? await createAndroidLoadActions(state, config) : null;
  if (native) report.nativeActions = native.trace;
  if (native && cpuRate !== 1) throw new Error("CPU throttling is a desktop diagnostic only");
  if (new URL(config.url).hostname === "lightos.ponzs.heiyu.space") throw new Error("Production is not a load-test target");
  const endpoint = new URL("./api/workspace", page.url());
  endpoint.searchParams.set("name", new URL(config.url).searchParams.get("name"));
  const settingsURL = new URL("./api/settings", page.url()).href;
  const request = async (url, method = "GET", data) => {
    const r = await page.request.fetch(String(url), { method, data, timeout: 10000 });
    if (!r.ok()) throw new Error(`Load preparation API failed: ${method} ${r.status()}`);
    return r.json();
  };
  const action = (action, extra = {}) => request(endpoint, "POST", { action, cols: 120, rows: 32, ...extra });
  const save = () => fs.writeFile(path.join(artifactsDir, "load-result.json"), JSON.stringify(report, null, 2));
  const progress = async (phase, extra = {}) => {
    report.phase = phase;
    await save();
    await eventLog({ status: "info", action: "session-load", phase, ...extra });
    process.stderr.write(`LOAD_PROGRESS ${JSON.stringify({ phase, ...extra })}\n`);
  };
  const bounded = async (operation, promise, ms = 5000) => {
    let timer;
    try { return await Promise.race([promise, pageFailure, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${operation}: no progress for ${ms}ms`)), ms); })]); }
    finally { clearTimeout(timer); }
  };
  const snapshot = () => bounded("observe", page.evaluate(() => window.__loadObservation.snapshot()));
  const select = async pane => {
    if (native) return native.select(pane);
    await page.locator(`.tab[data-tab-id="${pane.tabID}"]`).click({ timeout: 5000 });
    await page.locator(`.pane-shell[data-pane-id="${pane.id}"] .terminal-host`).click({ timeout: 5000 });
  };
  const command = async (pane, text) => {
    await select(pane);
    await bounded("terminal ready for input", page.waitForFunction(id => {
      const shell = document.querySelector(`.pane-shell[data-pane-id="${id}"]`);
      return shell?.dataset.renderReady === "true";
    }, pane.id, { timeout: 20000 }), 21000);
    if (native) return native.input(pane, text + "\r");
    await page.locator(`.pane-shell[data-pane-id="${pane.id}"] .terminal-host`).click({ timeout: 5000 });
    await bounded("terminal input focus", page.waitForFunction(id => (
      document.activeElement?.tagName === "TEXTAREA"
      && document.activeElement.closest(".pane-shell")?.dataset.paneId === id
    ), pane.id, { timeout: 5000 }));
    await page.keyboard.insertText(text);
    await page.keyboard.press("Enter");
  };
  const waitOutput = (marker, timeout = 60000) => bounded(`output ${marker}`, page.waitForFunction(expected => (
    window.__testsAutoTerminalOutput.includes(expected)
  ), marker, { timeout }), timeout + 1000);
  const shellScript = code => `bash -c "$(printf %s ${shellQuote(Buffer.from(code).toString("base64"))} | base64 -d)"`;
  const retainedHistory = async pane => {
    await bounded("quiescent output acknowledgement", page.waitForFunction(id => window.__loadObservation.isOutputDrained(id), pane.id, { timeout: 10000 }), 11000);
    const observed = (await snapshot()).terminals.find(t => t.paneID === pane.id);
    if (!observed) throw new Error(`Missing observed terminal ${pane.id}`);
    const summary = { paneID: pane.id, rawRows: observed.historyRows, retainedRows: Math.min(LIMIT, observed.historyRows), streams: {} };
    let offset = Math.max(0, observed.historyRows - LIMIT);
    while (offset < observed.historyRows) {
      const result = await bounded("retained history read", page.evaluate(({ id, offset }) => (
        window.__loadObservation.readHistoryHeaders(id, offset)
      ), { id: pane.id, offset }));
      if (result.rows !== observed.historyRows || result.nextOffset <= offset) throw new Error("History changed during quiescent integrity observation");
      for (const header of result.headers) {
        const stream = summary.streams[header.stream] ||= { first: header.sequence, last: header.sequence - 1, count: 0, discontinuities: 0, gaps: [] };
        if (header.sequence !== stream.last + 1) {
          stream.discontinuities++;
          if (stream.gaps.length < 16) stream.gaps.push({ expected: stream.last + 1, actual: header.sequence, row: header.row });
        }
        stream.last = header.sequence; stream.count++;
      }
      offset = result.nextOffset;
    }
    return summary;
  };
  const cdp = await state.context.newCDPSession(page);
  await cdp.send("Performance.enable");
  try {
    report.providerRevision = await request(new URL("./api/server-revision", page.url()));
    if (config.expectedProviderRevision && !report.providerRevision.server_revision.endsWith(`assets=${config.expectedProviderRevision}`)) {
      throw new Error("Running Provider is not the installed performance candidate");
    }
    const settings = await request(settingsURL);
    originalScrollback = settings.terminal_scrollback;
    report.originalScrollback = originalScrollback;
    if (originalScrollback !== LIMIT && originalScrollback !== config.loadOriginalScrollback) {
      throw new Error("History setting differs from the confirmed explicit original value; refusing to overwrite it.");
    }
    report.settingsRestoration = originalScrollback === LIMIT ? "unchanged" : "explicit-original-value";
    await progress("settings-verified", { originalScrollback });
    if (config.loadCompanionURL) {
      const companion = new URL(config.loadCompanionURL);
      if (companion.hostname.split(".").slice(1).join(".") !== new URL(config.url).hostname.split(".").slice(1).join(".")) {
        throw new Error("Companion Provider must belong to the same dedicated test box");
      }
      companionSettingsURL = new URL("./api/settings", companion).href;
      const authPage = await state.context.newPage();
      try {
        await authPage.goto(companionSettingsURL, { waitUntil: "domcontentloaded", timeout: 30000 });
        await createTarget(config, eventLog).loginIfNeeded(authPage, "companion-provider");
      } finally { await authPage.close(); await page.bringToFront(); }
      companionOriginal = (await request(companionSettingsURL)).terminal_scrollback;
      report.companionOriginalScrollback = companionOriginal;
      companionChanged = true;
      await request(companionSettingsURL, "PUT", { terminal_scrollback: LIMIT });
    }
    // Default history has separate real Provider coverage. Do not reset it
    // again while preparing the load scenario.
    if (originalScrollback !== LIMIT) {
      if (native) {
        settingsChanged = true;
        await request(settingsURL, "PUT", { terminal_scrollback: LIMIT });
      } else {
      await page.locator("#instanceSwitcherButton").click();
      await page.locator("#settingsMenuButton").click();
      settingsChanged = true;
      await page.locator("#settingsScrollbackInput").fill(String(LIMIT));
      await page.locator("#settingsScrollbackInput").press("Tab");
      await page.waitForFunction(async () => (await (await fetch("./api/settings")).json()).terminal_scrollback === 100000);
      await page.locator("#settingsClose").click();
      }
      // Load the persisted setting before preparing any history. Existing
      // terminals may still have been constructed with the previous limit.
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await state.verifyFrontend(true);
      await page.locator(`.pane-shell[data-pane-id="${state.expectedPaneID}"]`).waitFor({ timeout: 20000 });
    }
    report.conditions = { panes: 10, historyLimit: LIMIT, outputPanes, cpuRate, device: native ? "android" : "desktop",
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), browser: state.browser.version() };
    const initial = await request(endpoint);
    report.workspaceGeneration = initial.workspace_generation;
    const baseTab = initial.tabs.find(t => t.id === state.testTabID);
    if (!baseTab || baseTab.panes.length !== 1) throw new Error("Unexpected owned initial tab");
    for (let i = 0; i < 5; i++) {
      let tab = baseTab;
      if (i > 0) {
        const before = await request(endpoint);
        const workspace = await action("create_tab");
        tab = workspace.tabs.find(t => !before.tabs.some(old => old.id === t.id));
        if (!tab) throw new Error("Cannot identify newly owned tab");
        ownedTabs.push({ id: tab.id, paneID: tab.panes[0].id });
      }
      const workspace = await action("split_pane", { tab_id: tab.id, pane_id: tab.panes[0].id, direction: "vertical" });
      tab = workspace.tabs.find(t => t.id === tab.id);
      if (tab.panes.length !== 2) throw new Error("Split did not create independent panes");
      panes.push(...tab.panes.map(p => ({ id: p.id, tabID: tab.id })));
    }
    if (new Set(panes.map(p => p.id)).size !== 10) throw new Error("Load requires ten independent panes");
    report.panes = panes;
    await save();
    // Setup uses real terminal input. Rate-limit generation so each history can be verified.
    for (let index = 0; index < panes.length; index++) {
      const pane = panes[index];
      const marker = `${tag}_H${index}_DONE`;
      const code = `printf 'PTY_${tag}_${index}='; tty
for ((i=0;i<100100;i++)); do
 printf 'H${index}:%06d %0117d\\n' "$i" 0
 if ((i%100==99)); then sleep 0.01; fi
done
printf '${marker}\\n'
`;
      await command(pane, shellScript(code));
      const ttyMarker = `PTY_${tag}_${index}=`;
      const ttyResult = await bounded("complete PTY identity", page.waitForFunction(prefix => {
        const text = window.__testsAutoTerminalOutput;
        const start = text.lastIndexOf(prefix);
        if (start < 0) return false;
        return /^(\/dev\/[^\r\n]+)[\r\n]/.exec(text.slice(start + prefix.length))?.[1] || false;
      }, ttyMarker, { timeout: 10000 }), 11000);
      pane.tty = await ttyResult.jsonValue();
      await ttyResult.dispose();
      await waitOutput(marker, 180000);
      await bounded("history fill", page.waitForFunction(({ id, limit }) => (
        window.__loadObservation.snapshot().terminals.some(t => t.paneID === id && t.historyRows >= limit)
      ), { id: pane.id, limit: LIMIT }, { timeout: 60000 }), 61000);
      const observed = await snapshot();
      report.history.push(observed.terminals.find(t => t.paneID === pane.id));
      pane.preparedHistory = await retainedHistory(pane);
      const generated = pane.preparedHistory.streams[`H${index}`];
      const terminal = observed.terminals.find(t => t.paneID === pane.id);
      if (!generated || generated.last < 100099 - terminal.rows - 2 || generated.last > 100099 || generated.discontinuities) throw new Error(`Generated history sequence mismatch in ${pane.id}`);
      await progress("history-filled", { completed: index + 1, total: 10 });
    }
    report.prepared = await snapshot();
    if (new Set(panes.map(p => p.tty)).size !== 10 || panes.some(p => !p.tty.startsWith("/dev/"))) throw new Error("Ten distinct real PTYs were not observed");
    report.validReproduction = true;
    await progress("history-ready");
    for (const index of [0, 2, 4].slice(0, outputPanes)) {
      const code = `stop=0; trap 'stop=1' INT
for ((i=0;i<15000;i++)); do
 if ((stop)); then break; fi
 printf 'L${index}:%06d %0501d\\n' "$i" 0
 sleep 0.02
done
printf '${tag}_L${index}_DONE\\n'
`;
      await command(panes[index], shellScript(code));
    }
    await select(panes[1]);
    if (!native) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    if (process.env.WEBSHELL_LOAD_PROFILE === "1") {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
      await cdp.send("Profiler.start");
      profiling = true;
      report.cpuProfile = "load.cpuprofile";
    }
    await progress("reload");
    const reloadAt = performance.now();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await state.verifyFrontend(true);
    await page.locator(`.pane-shell[data-pane-id="${panes[1].id}"] .terminal-host`).waitFor({ timeout: 20000 });
    await command(panes[1], shellScript(`printf '${tag}_READY\\n'`));
    await waitOutput(`${tag}_READY`, 20000);
    report.readyMs = performance.now() - reloadAt;
    if (report.readyMs > 20000) report.failures.push(`First interactive terminal took ${report.readyMs.toFixed(0)}ms`);
    await progress("interactive", { readyMs: report.readyMs });
    await bounded("visible peer replay metadata", page.waitForFunction(ids => {
      const replays = window.__loadObservation.snapshot().replays;
      return ids.every(id => replays.some(replay => replay.paneID === id));
    }, panes.slice(0, 2).map(pane => pane.id), { timeout: 5000 }));
    report.afterReload = await snapshot();
    for (const pane of panes.slice(0, 2)) {
      const replay = report.afterReload.replays.find(item => item.paneID === pane.id);
      if (!replay || Number(replay.server_history_bytes) < 100100 * 128) throw new Error("Restored history was truncated before measurement");
    }
    await page.evaluate(() => window.__loadObservation.start());
    // Real tab operations: observe their final visible state, not just dispatch success.
    for (let i = 0; i < 20; i++) {
      const pane = panes[((i + 1) % 5) * 2];
      const started = performance.now();
      if (native) await native.select(pane);
      else await bounded("tab click", page.locator(`.tab[data-tab-id="${pane.tabID}"]`).click({ timeout: 5000 }));
      await bounded("tab shown", page.waitForFunction(id => document.querySelector(".terminal-pane.active")?.dataset.tabId === id, pane.tabID));
      report.actions.push(performance.now() - started);
    }
    // Extract local handler-to-frame measurements at the end; external action
    // durations remain diagnostics, including automation transport overhead.
    await select(panes[1]);
    const divider = await page.locator(".terminal-pane.active .split-divider").boundingBox();
    const layout = await page.locator(".terminal-pane.active .terminal-layout").boundingBox();
    if (!divider || !layout) throw new Error("Active split divider is unavailable");
    if (!native) {
      await page.mouse.move(divider.x + divider.width / 2, divider.y + 20);
      await page.mouse.down();
    }
    await page.evaluate(() => window.__loadObservation.phase("divider"));
    const dragAt = performance.now();
    let moves = 0;
    while (performance.now() - dragAt < 30000) {
      const ratio = native ? (moves % 2 ? 0.3 : 0.7) : 0.5 + 0.2 * Math.sin(moves / 12);
      await bounded("divider move", native ? native.panDivider(ratio) : page.mouse.move(layout.x + layout.width * ratio, divider.y + 20));
      moves += 1;
      await sleep(1000 / 30);
    }
    if (native) await native.panDivider(0.63);
    else {
      await page.mouse.move(layout.x + layout.width * 0.63, divider.y + 20);
      await page.mouse.up();
    }
    report.drag = { durationMs: performance.now() - dragAt, moves, kind: native ? "native-touch-pan" : "mouse-divider" };
    await page.evaluate(() => window.__loadObservation.phase("divider-settle"));
    const geometryConverged = () => {
      const panes = [...document.querySelectorAll(".terminal-pane.active .pane-shell")];
      const terminals = window.__loadObservation.snapshot().terminals;
      return panes.length === 2 && panes.every(shell => {
        const host = shell.querySelector(".terminal-host").getBoundingClientRect();
        const canvas = shell.querySelector("canvas:not(.terminal-frame-hold)");
        const live = canvas?.getBoundingClientRect();
        const terminal = terminals.find(item => item.paneID === shell.dataset.paneId);
        return !!terminal && !!live && shell.dataset.renderReady === "true" && getComputedStyle(canvas).visibility === "visible"
          && Math.abs(host.width - live.width) <= live.width / terminal.cols + 1
          && Math.abs(host.height - live.height) <= live.height / terminal.rows + 1;
      });
    };
    await bounded("divider convergence", page.waitForFunction(geometryConverged, null, { timeout: 2000 }), 2100);
    await bounded("input after divider release", (async () => {
      await command(panes[1], shellScript(`printf '${tag}_DIVIDER_READY\\n'`));
      await waitOutput(`${tag}_DIVIDER_READY`, 5000);
    })());
    await progress("divider-complete", report.drag);
    const resizeAt = performance.now();
    await page.evaluate(() => window.__loadObservation.phase("window"));
    let resizes = 0;
    const originalOrientation = native ? await page.evaluate(() => innerWidth > innerHeight ? 1 : 0) : 0;
    while (performance.now() - resizeAt < 30000) {
      const width = Math.round(1200 + 200 * Math.sin(resizes / 12));
      await bounded("window resize", native ? native.rotate(resizes % 2 ? 0 : 1) : page.setViewportSize({ width, height: 900 }));
      resizes += 1;
      await sleep(native ? 2500 : 1000 / 30);
    }
    if (native) await native.rotate(originalOrientation);
    else await page.setViewportSize({ width: 1440, height: 900 });
    report.windowResize = { durationMs: performance.now() - resizeAt, resizes, kind: native ? "android-orientation" : "window-viewport" };
    await bounded("window convergence", page.waitForFunction(geometryConverged, null, { timeout: 2000 }), 2100);
    await bounded("input after window release", (async () => {
      await command(panes[1], shellScript(`printf '${tag}_WINDOW_READY\\n'`));
      await waitOutput(`${tag}_WINDOW_READY`, 5000);
    })());
    report.steady = await page.evaluate(() => window.__loadObservation.stop());
    const localActions = report.steady.tabActions.slice(0, 20);
    report.localTabActions = localActions;
    if (localActions.length !== 20 || localActions.some(action => action.durationMs === null)) {
      report.failures.push("Incomplete local tab response observations");
    } else {
      const durations = localActions.map(action => action.durationMs);
      report.actionP95Ms = percentile(durations, 0.95);
      report.actionMaxMs = Math.max(...durations);
      if (report.actionP95Ms > 200 || report.actionMaxMs > 1000) report.failures.push(`Tab response p95=${report.actionP95Ms.toFixed(0)}ms max=${report.actionMaxMs.toFixed(0)}ms`);
    }
    const dragging = report.steady.layout.filter(sample => sample.phase === "divider");
    let maxLiveStallMs = 0;
    for (const pane of panes.slice(0, 2)) {
      let previous, changedAt;
      const widths = new Set();
      for (const sample of dragging) {
        const geometry = sample.panes.find(item => item.paneID === pane.id);
        if (!geometry) continue;
        widths.add(Math.round(geometry.liveWidth / 24));
        if (!previous || Math.abs(geometry.liveWidth - previous.liveWidth) > 1) changedAt = sample.at;
        else if (Math.abs(geometry.hostWidth - previous.hostWidth) > 1) maxLiveStallMs = Math.max(maxLiveStallMs, sample.at - changedAt);
        if (!geometry.liveVisible) report.failures.push(`Live Canvas hidden during drag: ${pane.id}`);
        previous = geometry;
      }
      if (widths.size < 3) report.failures.push(`Insufficient live width changes: ${pane.id}`);
    }
    report.drag.maxLiveStallMs = maxLiveStallMs;
    if (dragging.length < 3 || maxLiveStallMs > 350) report.failures.push(`Divider live geometry stalled ${maxLiveStallMs.toFixed(0)}ms`);
    if (report.steady.maxRafGapMs > 1500) report.failures.push(`Main thread stalled ${report.steady.maxRafGapMs.toFixed(0)}ms`);
    for (const index of [0, 2, 4].slice(0, outputPanes)) {
      await select(panes[index]);
      if (native) await native.input(panes[index], "\x03");
      else await page.keyboard.press("Control+C");
      await waitOutput(`${tag}_L${index}_DONE`, 10000);
      await command(panes[index], shellScript(`printf '${tag}_STOP${index}\\n'`));
      await waitOutput(`${tag}_STOP${index}`, 10000);
    }
    await command(panes[1], shellScript("printf 'LOADFINAL\\n'"));
    await waitOutput("LOADFINAL", 5000);
    report.final = await snapshot();
    report.retainedHistory = [];
    for (let index = 0; index < panes.length; index++) {
      const history = await retainedHistory(panes[index]);
      report.retainedHistory.push(history);
      if (history.retainedRows < LIMIT) report.failures.push(`History no longer fills its configured window in ${panes[index].id}`);
      const generated = history.streams[`H${index}`];
      const live = history.streams[`L${index}`];
      // Narrow grids wrap each live record across many rows; sustained output
      // can legitimately evict all older H records from the retained window.
      if ((!generated && !live)
        || (generated && (generated.last < panes[index].preparedHistory.streams[`H${index}`].last || generated.last > 100099))
        || Object.values(history.streams).some(stream => stream.discontinuities)) {
        report.failures.push(`Retained history/output sequence mismatch in ${panes[index].id}`);
      }
    }
    if (report.final.maxSockets !== 1 || report.final.sockets !== 1) report.failures.push("Expected exactly one concurrent Unified WebSocket");
    if (report.final.cursorGaps !== 0) report.failures.push(`Output history cursors contain ${report.final.cursorGaps} discontinuities`);
    report.metrics = (await cdp.send("Performance.getMetrics")).metrics;
    report.rendered = await observeTerminal(environment, { name: "load-final", paneID: panes[1].id });
    if (!report.rendered.text.replace(/\s/g, "").includes("LOADFINAL")) report.failures.push("Final PTY result is not visible in rendered pixels");
    await progress("complete");
    if (report.failures.length) throw new Error(report.failures.join("; "));
    return { observations: [{ type: "session-load", report: "load-result.json" }] };
  } catch (error) {
    report.error = error.message;
    report.errorStack = error.stack;
    report.lastObservation = await Promise.race([
      page.evaluate(() => window.__loadObservation.snapshot()).catch(() => null),
      sleep(5000).then(() => null),
    ]);
    throw error;
  } finally {
    page.off("pageerror", onPageError);
    if (profiling) {
      try {
        const { profile } = await cdp.send("Profiler.stop");
        await fs.writeFile(path.join(artifactsDir, "load.cpuprofile"), JSON.stringify(profile));
      } catch (error) { report.profileError = error.message; }
    }
    // Out-of-page API cleanup still works if the renderer stopped responding.
    const cleanupErrors = [];
    if (native) await native.restore().catch(error => cleanupErrors.push(error.message));
    else await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {});
    for (const owned of ownedTabs.reverse()) {
      try {
        const workspace = await request(endpoint);
        const tab = workspace.tabs.find(t => t.id === owned.id);
        if (workspace.workspace_generation !== report.workspaceGeneration || (tab && !tab.panes.some(p => p.id === owned.paneID))) throw new Error("Resource ownership changed");
        if (tab) await action("close_tab", { tab_id: owned.id });
      } catch (error) { cleanupErrors.push(error.message); }
    }
    if (settingsChanged) {
      try {
        await request(settingsURL, "PUT", { terminal_scrollback: originalScrollback });
        report.restoredScrollback = (await request(settingsURL)).terminal_scrollback;
        if (report.restoredScrollback !== originalScrollback) throw new Error("Original effective history setting did not restore");
      }
      catch (error) { cleanupErrors.push(error.message); }
    }
    if (companionChanged) {
      try {
        await request(companionSettingsURL, "PUT", { terminal_scrollback: companionOriginal });
        report.companionRestoredScrollback = (await request(companionSettingsURL)).terminal_scrollback;
        if (report.companionRestoredScrollback !== companionOriginal) throw new Error("Companion history setting did not restore");
      } catch (error) { cleanupErrors.push(error.message); }
    }
    report.cleanupErrors = cleanupErrors;
    await save();
    if (cleanupErrors.length) throw new Error(`Load cleanup failed: ${cleanupErrors.join("; ")}`);
  }
}
