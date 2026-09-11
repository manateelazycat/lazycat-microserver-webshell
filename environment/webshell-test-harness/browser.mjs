import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createTarget } from "./target.mjs";
import { redactBrowserArtifacts, redactDiagnosticText } from "./artifact-redaction.mjs";
import { readConfig, validateConfig, projectRoot } from "./config.mjs";
import { prepareFrontend, frontendEvidence } from "./frontend-build.mjs";
import { installLocalFrontend } from "./local-frontend.mjs";
import { withDeviceSession } from "./agent-device.mjs";

// One environment owns its browser sessions and the test tab it creates.
// Both the scenario runner and MCP use this lifecycle; no AC semantics live here.
export async function createEnvironment(options = {}) {
const frontend = await prepareFrontend({ manifestPath: options.frontend?.manifestPath });
const config = await readConfig({ ...options, staticDir:frontend.staticDir, frontendManifest:frontend.manifestPath });
config.productStaticDir = frontend.staticDir;
if (options.targetKind === "client" && config.clientURL) config.url = config.clientURL;
config.targetKind = options.targetKind || "";
const { chromium } = await validateConfig(config);
const moduleRoot = config.moduleRoot;
const artifactsDir = path.resolve(options.artifactsDir || path.join(projectRoot, "spec-tests/artifacts", randomUUID()));
await fs.mkdir(artifactsDir, { recursive: true });
const eventsPath = path.join(artifactsDir, "events.jsonl");
const states = {};
const eventLog = async (event) => {
  const record = { at: new Date().toISOString(), ...event };
  await fs.appendFile(eventsPath, `${redactDiagnosticText(JSON.stringify(record), [config.username, config.password])}\n`);
  options.onEvent?.({ status: record.status, action: record.action });
};
const frontendFailures = [];
await eventLog({ status:"pass", action:"local-frontend-build", ...frontendEvidence(frontend) });

const textDecoder = new TextDecoder();
const decodeQueueFrame = (data) => {
  if (typeof data === "string") {
    try {
      const value = JSON.parse(data);
      if (typeof value?.data === "string") return { text: value.data, header: value };
      if (typeof value?.payload?.data === "string") return { text: value.payload.data, header: value };
    } catch {}
    return { text: data, header: null };
  }
  if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return null;
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.length < 8 || textDecoder.decode(bytes.subarray(0, 4)) !== "LCQ1") {
    return { header: null, text: textDecoder.decode(bytes) };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(4, false);
  if (headerLength <= 0 || 8 + headerLength > bytes.length) return null;
  let header;
  try { header = JSON.parse(textDecoder.decode(bytes.subarray(8, 8 + headerLength))); } catch { return null; }
  return { header, text: textDecoder.decode(bytes.subarray(8 + headerLength)) };
};

const outerResize = (frame) => {
  if (!frame) return null;
  if (typeof frame !== "string") {
    if (!(frame instanceof ArrayBuffer) && !ArrayBuffer.isView(frame)) return null;
    const bytes = frame instanceof ArrayBuffer
      ? new Uint8Array(frame)
      : new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
    frame = textDecoder.decode(bytes);
  }
  try {
    const value = JSON.parse(frame);
    const control = value?.control;
    const resize = value?.type === "pane-control" ? control : value;
    if (resize?.type !== "resize") return null;
    return {
      paneID: String(value?.pane_id || ""),
      cols: Number(resize.cols),
      rows: Number(resize.rows),
      pixelWidth: Number(resize.pixel_width || 0),
      pixelHeight: Number(resize.pixel_height || 0),
      resizeEpoch: resize.resize_epoch || "",
      claim: resize.claim === true,
    };
  } catch { return null; }
};

const { loginIfNeeded, resolveTestURL } = createTarget(config, eventLog);

const createWindow = async (name, viewport, position, onCreated, beforeNavigate) => {
  const headless = !config.foreground;
  const device = options.performanceMode && config.loadDevice === "android"
    ? await withDeviceSession({ chromium, config }) : null;
  const browser = device?.browser || await chromium.launch({
    headless,
    channel: config.channel,
    executablePath: config.executablePath,
    env: { ...process.env, ...(config.display ? { DISPLAY: config.display } : {}) },
    args: [`--window-size=${viewport.width},${viewport.height}`, `--window-position=${position.x},${position.y}`],
  });
  if (closing) { await browser.close(); throw new Error("Environment was released while opening a browser"); }
  const state = { name, browser, device, framesSent: [], output: "", lastResize: null, fatalErrors: [], assetRequestFailures: [], resizeErrors: 0, initialTerminalTimeline: [] };
  onCreated?.(state);
  const context = device?.context || await browser.newContext({
    viewport,
    storageState: config.storageState,
    hasTouch: name === "mobile",
    isMobile: name === "mobile",
    ...(name === "mobile" ? { deviceScaleFactor: config.mobileDeviceScaleFactor } : {}),
    ...(name === "mobile" && config.mobileUserAgent ? { userAgent: config.mobileUserAgent } : {}),
    ignoreHTTPSErrors: true,
    serviceWorkers: options.serviceWorkers === "allow" ? "allow" : "block",
  });
  state.context = context;
  if (closing) { await browser.close(); throw new Error("Environment was released while creating a context"); }
  context.setDefaultTimeout(15_000);
  const targetOrigin = new URL(config.url).origin;
  if (!device) await context.grantPermissions(["local-network-access"], { origin: targetOrigin });
  const localFrontend = await installLocalFrontend(device?.resourceScope || context, config, frontend, (error) => frontendFailures.push(error), eventLog);
  const page = device?.page || await context.newPage();
  state.page = page;
  state.verifyFrontend = (required = false) => localFrontend.verifyPage(page, required);
  page.on("domcontentloaded", () => { void state.verifyFrontend().catch((error) => frontendFailures.push(error.message)); });
  if (closing) { await browser.close(); throw new Error("Environment was released while creating a page"); }
  await page.addInitScript(({ captureTimeline, enableInitializationPerformance, performanceMode }) => {
    if (performanceMode) {
      for (const key of ["debugMode", "debugLog", "initializationPerformance", "networkMonitor", "performanceMeter", "performanceTasks"]) {
        window.localStorage.setItem(`webshell.${key}`, "false");
      }
    }
    if (captureTimeline || enableInitializationPerformance) {
      window.localStorage.setItem("webshell.debugMode", "true");
    }
    if (captureTimeline) {
      window.localStorage.setItem("webshell.debugLog", "true");
    }
    if (enableInitializationPerformance) {
      window.localStorage.setItem("webshell.initializationPerformance", "true");
    }
    window.__testsAutoResizeFrames = [];
    window.__testsAutoResizeResponses = [];
    window.__testsAutoResizeTrace = [];
    window.__testsAutoTerminalOutput = "";
    window.__testsAutoSockets = [];
    window.__testsAutoPresentationProbe = {
      startedAt: performance.now(),
      samples: [],
      stopped: performanceMode,
    };
    const capturePresentationSample = () => {
      const probe = window.__testsAutoPresentationProbe;
      if (!probe || probe.stopped) return;
      const describeCanvas = (canvas) => {
        if (!(canvas instanceof HTMLCanvasElement)) {
          return { width: 0, height: 0, cssWidth: 0, cssHeight: 0, hidden: null };
        }
        const rect = canvas.getBoundingClientRect();
        return {
          width: canvas.width,
          height: canvas.height,
          cssWidth: rect.width,
          cssHeight: rect.height,
          hidden: canvas.hidden === true,
        };
      };
      probe.samples.push({
        at: performance.now(),
        devicePixelRatio: window.devicePixelRatio || 1,
        panes: Array.from(document.querySelectorAll(".terminal-pane")).map((pane) => {
          const shell = pane.querySelector(".pane-shell");
          const liveCanvas = pane.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
          const holdCanvas = pane.querySelector(".terminal-frame-hold");
          return {
            paneID: shell?.dataset?.paneId || "",
            tabID: pane.dataset?.tabId || "",
            connection: shell?.dataset?.connection || "",
            renderReady: shell?.dataset?.renderReady || "",
            hasPresentedFrame: shell?.dataset?.hasPresentedFrame || "",
            liveCanvas: describeCanvas(liveCanvas),
            holdCanvas: describeCanvas(holdCanvas),
          };
        }),
      });
      if (probe.samples.length > 8000) probe.samples.splice(0, probe.samples.length - 8000);
      requestAnimationFrame(capturePresentationSample);
    };
    requestAnimationFrame(capturePresentationSample);
    window.__testsAutoSentMessages = [];
    const NativeWebSocket = window.WebSocket;
    const send = NativeWebSocket.prototype.send;
    NativeWebSocket.prototype.send = function autoTestObservedSend(data) {
      if (typeof data === "string") {
        try {
          const value = JSON.parse(data);
          window.__testsAutoSentMessages.push(value);
          const resize = value?.type === "pane-control" ? value.control : value;
          if (resize?.type === "resize") {
            window.__testsAutoResizeFrames.push({
              paneID: String(value?.pane_id || ""),
              cols: Number(resize.cols),
              rows: Number(resize.rows),
              pixelWidth: Number(resize.pixel_width || 0),
              pixelHeight: Number(resize.pixel_height || 0),
              resizeEpoch: resize.resize_epoch || "",
              claim: resize.claim === true,
            });
          }
        } catch {}
      }
      return send.call(this, data);
    };
    const appendMessage = async (data) => {
      if (data instanceof Blob) data = await data.arrayBuffer();
      if (typeof data === "string") {
        try {
          const value = JSON.parse(data);
          const control = value?.type === "pane-control" ? value.payload : value;
          if (control?.type === "resize-applied" || control?.type === "resize-error") {
            window.__testsAutoResizeResponses.push({
              paneID: String(value?.pane_id || control?.pane_id || ""),
              type: String(control.type),
              resizeEpoch: String(control.resize_epoch || ""),
              cols: Number(control.cols || 0),
              rows: Number(control.rows || 0),
              pixelWidth: Number(control.pixel_width || 0),
              pixelHeight: Number(control.pixel_height || 0),
              reason: String(control.reason || ""),
            });
            if (window.__testsAutoResizeResponses.length > 4000) {
              window.__testsAutoResizeResponses.splice(0, window.__testsAutoResizeResponses.length - 4000);
            }
          }
          if (typeof value?.data === "string") window.__testsAutoTerminalOutput += value.data;
          else if (typeof value?.payload?.data === "string") window.__testsAutoTerminalOutput += value.payload.data;
          if (performanceMode) window.__testsAutoTerminalOutput = window.__testsAutoTerminalOutput.slice(-262144);
        } catch {}
        return;
      }
      if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return;
      const bytes = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      let payload = bytes;
      if (bytes.length >= 8 && new TextDecoder().decode(bytes.subarray(0, 4)) === "LCQ1") {
        const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);
        if (headerLength > 0 && 8 + headerLength <= bytes.length) payload = bytes.subarray(8 + headerLength);
      }
      window.__testsAutoTerminalOutput += new TextDecoder().decode(payload);
      if (performanceMode) window.__testsAutoTerminalOutput = window.__testsAutoTerminalOutput.slice(-262144);
    };
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args);
        window.__testsAutoSockets.push(socket);
        socket.addEventListener("message", (event) => { appendMessage(event.data).catch(() => {}); });
        return socket;
      },
    });
  }, {
    captureTimeline: config.captureTerminalTimeline,
    enableInitializationPerformance: config.enableInitializationPerformance,
    performanceMode: options.performanceMode === true,
  });
  await beforeNavigate?.(state);
  page.on("console", (message) => {
    const text = message.text();
    const sourceURL = String(message.location()?.url || "");
    const ignorableFaviconError = message.type() === "error" && /\/favicon\.ico(?:$|[?#])/.test(sourceURL);
    if (text.includes("resize-error")) state.resizeErrors += 1;
    const expectedOffline = state.networkOffline === true && text.includes("net::ERR_INTERNET_DISCONNECTED");
    if (message.type() === "error" && !ignorableFaviconError && !expectedOffline) state.fatalErrors.push(`console error: ${text}`);
    eventLog({ status: "info", window: name, action: "console", type: message.type(), sourceURL, message: text });
  });
  page.on("pageerror", (error) => {
    state.fatalErrors.push(`pageerror: ${error.message}`);
    eventLog({ status: "error", window: name, action: "pageerror", message: error.message });
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText || "";
    const aborted = errorText.includes("ERR_ABORTED");
    const message = `${request.method()} ${request.url()} ${errorText}`;
    const assetFailure = !aborted && request.url().includes("/assets/");
    const apiFailure = !aborted && request.url().includes("/api/");
    if (assetFailure) state.assetRequestFailures.push(message);
    const expectedOffline = state.networkOffline === true && errorText.includes("ERR_INTERNET_DISCONNECTED");
    if ((assetFailure || apiFailure) && !expectedOffline) state.fatalErrors.push(`requestfailed: ${message}`);
    eventLog({
      status: assetFailure || apiFailure ? "error" : "info",
      window: name,
      action: "requestfailed",
      expectedOffline,
      message,
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) {
      const message = `HTTP ${response.status()} ${response.request().method()} ${response.url()}`;
      state.fatalErrors.push(message);
      eventLog({ status: "error", window: name, action: "api-response", message });
    }
  });
  page.on("websocket", (websocket) => {
    websocket.on("framesent", (data) => {
      const resize = outerResize(data);
      if (resize) {
        state.lastResize = resize;
        state.framesSent.push(resize);
      }
    });
    websocket.on("framereceived", (data) => {
      const frame = decodeQueueFrame(data);
      if (frame?.text) state.output = options.performanceMode ? (state.output + frame.text).slice(-262144) : state.output + frame.text;
    });
  });
  // Authenticate outside the intercepted app document. Standalone packages
  // serve the app at /, while the embedded entry can use its parent page.
  const authURL = new URL(new URL(config.url).pathname === "/" ? "/api/server-revision" : "/", config.url).toString();
  await page.goto(authURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const loggedIn = await loginIfNeeded(page, name);
  state.authenticated = true;
  if (!options.performanceMode) await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const testURL = await resolveTestURL(page, name);
  await page.goto(testURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await state.verifyFrontend(true);
  await page.waitForSelector(".terminal-pane.active .terminal-host", { timeout: 60_000 });
  await page.waitForTimeout(2_000);
  state.initialTerminalTimeline = await page.evaluate(() => (
    globalThis.__testsAutoTerminalTimelineSnapshot?.() || []
  )).catch(() => []);
  await eventLog({ status: "pass", window: name, action: "open", viewport, deviceScaleFactor: name === "mobile" ? config.mobileDeviceScaleFactor : 1, loggedIn, url: page.url() });
  return state;
};

const activity = async (state) => state.page.evaluate(async () => {
  const name = new URLSearchParams(location.search).get("name");
  const response = await fetch(`./api/workspace/activity?name=${encodeURIComponent(name || "")}&cols=120&rows=32`, { cache: "no-store" });
  if (!response.ok) throw new Error(`workspace activity ${response.status}: ${await response.text()}`);
  return response.json();
});

const paneSize = (state, snapshot) => {
  const panes = snapshot?.panes || [];
  return panes.find((pane) => pane.id === state.activePaneID) || panes[0] || null;
};

const waitForResizeApplied = async (state, previous, action, frameCountBefore, resizeErrorsBefore = state.resizeErrors) => {
  const syncObservedFrames = async () => {
    const observed = await state.page.evaluate(() => window.__testsAutoResizeFrames || []);
    state.framesSent = observed;
    state.lastResize = observed.at(-1) || state.lastResize;
  };
  await syncObservedFrames();
  const deadline = Date.now() + 8_000;
  while (state.framesSent.length <= frameCountBefore && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await syncObservedFrames();
  }
  if (state.framesSent.length <= frameCountBefore) {
    throw new Error(`${action}: interaction did not send a new resize frame`);
  }
  if (!state.lastResize || state.lastResize.cols <= 0 || state.lastResize.rows <= 0) {
    throw new Error(`${action}: no resize frame was sent after interaction`);
  }
  const resizeErrors = state.resizeErrors - resizeErrorsBefore;
  let candidates = state.framesSent.slice(frameCountBefore).filter((frame) => frame.cols > 0 && frame.rows > 0);
  const deadlineApplied = Date.now() + 15_000;
  let latest = null;
  let applied = null;
  let expected = null;
  while (Date.now() < deadlineApplied) {
    await syncObservedFrames();
    candidates = state.framesSent.slice(frameCountBefore).filter((frame) => frame.cols > 0 && frame.rows > 0);
    latest = await activity(state);
    applied = paneSize(state, latest);
    expected = candidates.find((frame) => Number(applied?.cols) === frame.cols && Number(applied?.rows) === frame.rows) || null;
    if (expected && applied) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!expected || !applied) {
    const sent = candidates.map((frame) => `${frame.cols}x${frame.rows}`).join(", ");
    throw new Error(`${action}: server size ${applied?.cols}x${applied?.rows || "?"} did not match resize frames [${sent}] (resize-error events: ${resizeErrors})`);
  }
  if (previous && previous.cols === expected.cols && previous.rows === expected.rows) {
    throw new Error(`${action}: interaction did not change terminal geometry (${expected.cols}x${expected.rows})`);
  }
  return { expected, applied, resizeErrors };
};

const refreshResizeFrames = async (state) => {
  const observed = await state.page.evaluate(() => window.__testsAutoResizeFrames || []);
  state.framesSent = observed;
  state.lastResize = observed.at(-1) || state.lastResize;
  return observed;
};

const refreshTerminalOutput = async (state) => {
  state.output = await state.page.evaluate(() => window.__testsAutoTerminalOutput || "");
  return state.output;
};

// Keep resource creation and cleanup outside the renderer: a frozen page must
// not prevent the authenticated environment from releasing its owned tab.
const workspaceAction = async (state, action, payload = {}) => {
  const endpoint = new URL("./api/workspace", config.url);
  endpoint.searchParams.set("name", new URL(config.url).searchParams.get("name"));
  const response = await state.page.request.post(endpoint.href, {
    data: { action, cols: 120, rows: 32, ...payload }, timeout: 10000,
  });
  if (!response.ok()) throw new Error(`workspace ${action} ${response.status()}: ${await response.text()}`);
  return response.json();
};

const readWorkspace = async (state) => {
  const endpoint = new URL("./api/workspace", state.page.url());
  endpoint.searchParams.set("name", new URL(config.url).searchParams.get("name"));
  const response = await state.page.request.get(endpoint.toString(), { timeout: 10000 });
  if (!response.ok()) throw new Error("Cannot observe test workspace ownership");
  return response.json();
};

let tabCreation;
const createIsolatedTab = async (state) => {
  if (closing) throw new Error("Environment was released before creating a test tab");
  const before = await readWorkspace(state);
  const previousIDs = new Set(before.tabs.map((tab) => tab.id));
  const tabID = await (tabCreation = workspaceAction(state, "create_tab").then((workspace) => {
    const added = workspace.tabs.filter((tab) => !previousIDs.has(tab.id));
    if (added.length !== 1 || workspace.workspace_generation !== before.workspace_generation) {
      throw new Error("Cannot uniquely identify the new test tab; refusing an existing tab");
    }
    state.testTabID = added[0].id;
    state.expectedPaneID = added[0].panes[0].id;
    state.testWorkspaceGeneration = workspace.workspace_generation;
    return state.testTabID;
  }));
  if (closing) throw new Error("Environment was released while creating a test tab");
  const url = new URL(state.page.url());
  url.searchParams.set("tab", tabID);
  state.testTabID = tabID;
  await state.page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await state.verifyFrontend(true);
  await state.page.waitForFunction(({ tabID, paneID }) => (
    new URL(location.href).searchParams.get("tab") === tabID
    && document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === paneID
  ), { tabID, paneID: state.expectedPaneID }, { timeout: 60_000 });
  await eventLog({ status: "pass", window: state.name, action: "create-isolated-tab", tabID });
  return url.toString();
};

const withDeadline = async (promise, timeout = 5000) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Observation exceeded ${timeout}ms`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
};

const persistPresentationProbe = async (state, artifactsDir) => {
  const presentationProbe = await withDeadline(state.page.evaluate(() => {
    const probe = globalThis.__testsAutoPresentationProbe;
    if (probe) probe.stopped = true;
    return probe || { startedAt: 0, samples: [] };
  })).catch(error => ({ unavailable: error.message, samples: [] }));
  const terminalTimeline = await withDeadline(state.page.evaluate(() => (
    globalThis.__testsAutoTerminalTimelineSnapshot?.() || []
  ))).catch(() => []);
  await fs.writeFile(
    path.join(artifactsDir, `${state.name}-terminal-timeline.json`),
    `${JSON.stringify(terminalTimeline)}\n`,
  ).catch(() => {});
  await fs.writeFile(
    path.join(artifactsDir, `${state.name}-terminal-timeline-initial.json`),
    `${JSON.stringify(state.initialTerminalTimeline || [])}\n`,
  ).catch(() => {});
  await fs.writeFile(
    path.join(artifactsDir, `${state.name}-presentation-probe.json`),
    `${JSON.stringify(presentationProbe)}\n`,
  ).catch(() => {});
};


const assertNoFatalErrors = () => {
  const errors = [...frontendFailures, ...Object.values(states).flatMap((state) => state.fatalErrors.map((message) => `${state.name}: ${message}`))];
  if (errors.length) throw new Error(errors.join("\n"));
};
let closing;
const close = () => closing ||= (async () => {
  const failures = [];
  const attempt = async (action, fn) => {
    try { await fn(); } catch (error) { failures.push(`${action}: ${error.message}`); }
  };
  if (tabCreation) await attempt("finish test tab creation", () => tabCreation);
  for (const state of Object.values(states)) {
    if (state.context && state.browser.isConnected()) await attempt("restore network", () => state.context.setOffline(false));
  }
  for (const state of Object.values(states)) {
    if (state.authenticated && state.page && !state.page.isClosed()) {
      await attempt("capture presentation", () => persistPresentationProbe(state, artifactsDir));
      await attempt("capture screen", () => state.page.screenshot({ path: path.join(artifactsDir, `${state.name}-final.png`), timeout: 5000 }));
      if (state.context && !options.performanceMode) await attempt("save trace", () => state.context.tracing.stop({ path: path.join(artifactsDir, `${state.name}-trace.zip`) }));
    }
  }
  if (states.desktop?.testTabID && states.desktop.page && !states.desktop.page.isClosed()) {
    await attempt("close isolated tab", async () => {
      const state = states.desktop;
      const current = await readWorkspace(state);
      const tab = current.tabs.find((item) => item.id === state.testTabID);
      if (current.workspace_generation !== state.testWorkspaceGeneration
        || (tab && !tab.panes.some((pane) => pane.id === state.expectedPaneID))) {
        throw new Error("Test resource ownership changed; refusing to close an unrelated tab");
      }
      if (tab) await workspaceAction(state, "close_tab", { tab_id: state.testTabID });
    });
  }
  for (const state of Object.values(states)) {
    if (state.device) {
      await attempt("close owned Android page", () => state.device.close());
      continue;
    }
    if (!state.browser.isConnected()) continue; // A module may deliberately close its auxiliary window.
    if (state.context) await attempt("close context", () => state.context.close());
    await attempt("close browser", () => state.browser.close());
  }
  const zipUtilities = await import(pathToFileURL(path.join(moduleRoot, "playwright-core/lib/utilsBundle.js")));
  await redactBrowserArtifacts(artifactsDir, { secrets: [config.username, config.password], yauzl: zipUtilities.yauzl, yazl: zipUtilities.yazl });
  if (failures.length) throw new Error(redactDiagnosticText(failures.join("; "), [config.username, config.password]));
})();
const open = async () => {
  if (states.desktop || closing) throw new Error("Environment already opened or released");
  try {
    states.desktop = await createWindow("desktop", { width: 1440, height: 900 }, { x: 0, y: 0 }, (state) => { states.desktop = state; }, options.beforeNavigate);
    config.url = await createIsolatedTab(states.desktop);
    states.desktop.activePaneID = await states.desktop.page.locator(".terminal-pane.active .pane-shell").first().getAttribute("data-pane-id");
    if (options.desktopOnly !== true) {
      states.mobile = await createWindow("mobile", { width: 390, height: 844 }, { x: 1450, y: 0 }, (state) => { states.mobile = state; }, options.beforeNavigate);
      states.mobile.activePaneID = await states.mobile.page.locator(".terminal-pane.active .pane-shell").first().getAttribute("data-pane-id");
      if (states.mobile.activePaneID !== states.desktop.expectedPaneID) {
        throw new Error("Mobile window did not open the recorded test pane");
      }
    }
    assertNoFatalErrors();
    return api;
  } catch (error) {
    try { await close(); } catch (cleanup) { error.message += `; cleanup: ${cleanup.message}`; }
    throw error;
  }
};
const setNetworkOnline = async (state, online) => {
  if (online) {
    await state.context.setOffline(false);
    state.networkOffline = false;
  } else {
    state.networkOffline = true;
    await state.context.setOffline(true);
  }
  await eventLog({ status: "info", action: "network-condition", window: state.name, online });
};
const api = { config, states, artifactsDir, eventLog, activity, paneSize, waitForResizeApplied, refreshResizeFrames, refreshTerminalOutput, assertNoFatalErrors, open, close, setNetworkOnline };
return api;
}
