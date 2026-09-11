import path from "node:path";
import { randomInt } from "node:crypto";
import { waitForVisibleOutput } from "../../../environment/webshell-test-harness/observe.mjs";

const epochAfter = (candidate, previous) => {
  if (!/^\d+$/.test(String(candidate || ""))) return false;
  if (!/^\d+$/.test(String(previous || ""))) return true;
  return BigInt(candidate) > BigInt(previous);
};

const frameMatchesPane = (frame, pane) => Boolean(
  frame
  && pane
  && Number(frame.cols) === Number(pane.cols)
  && Number(frame.rows) === Number(pane.rows)
  && (!Number(frame.pixelWidth) || !Number(pane.pixel_width) || Number(frame.pixelWidth) === Number(pane.pixel_width))
  && (!Number(frame.pixelHeight) || !Number(pane.pixel_height) || Number(frame.pixelHeight) === Number(pane.pixel_height))
);

const recentResizeAcks = (state) => state.page.evaluate((paneID) => {
  const protocolAcks = (globalThis.__testsAutoResizeResponses || [])
    .filter((response) => (
      response?.type === "resize-applied"
      && (!response.paneID || response.paneID === paneID)
    ))
    .map((response) => ({
      resizeEpoch: String(response.resizeEpoch || ""),
      cols: Number(response.cols || 0),
      rows: Number(response.rows || 0),
    }));
  if (protocolAcks.length > 0) return protocolAcks;
  const timelines = globalThis.__testsAutoTerminalTimelineSnapshot?.() || [];
  const pane = timelines.find((entry) => String(entry?.paneID || "") === String(paneID || ""));
  return (pane?.events || [])
    .filter((event) => event?.type === "resize_applied")
    .map((event) => ({
      resizeEpoch: String(event.resizeEpoch || ""),
      cols: Number(event.cols || 0),
      rows: Number(event.rows || 0),
    }));
}, state.activePaneID);

const waitForDeviceClaimApplied = async ({
  state,
  previousEpoch = "",
  action,
  activity,
  paneSize,
  refreshResizeFrames,
  resizeErrorsBefore = state.resizeErrors,
}) => {
  const deadline = Date.now() + 15_000;
  let applied = null;
  let expected = null;
  let matchedAck = null;
  let acks = [];
  while (Date.now() < deadline) {
    const frames = await refreshResizeFrames(state);
    const snapshot = await activity(state);
    applied = paneSize(state, snapshot);
    acks = await recentResizeAcks(state);
    expected = [...frames].reverse().find((frame) => (
      frame.claim === true
      && (!frame.paneID || frame.paneID === state.activePaneID)
      && epochAfter(frame.resizeEpoch, previousEpoch)
      && (
        frameMatchesPane(frame, applied)
        || acks.some((ack) => (
          ack.resizeEpoch === String(frame.resizeEpoch || "")
          && ack.cols === Number(frame.cols)
          && ack.rows === Number(frame.rows)
        ))
      )
    )) || null;
    matchedAck = expected
      ? acks.find((ack) => ack.resizeEpoch === String(expected.resizeEpoch || "")) || null
      : null;
    if (expected && applied) break;
    await state.page.waitForTimeout(50);
  }
  if (!expected || !applied) {
    const diagnostics = await state.page.evaluate(() => ({
      activeElement: document.activeElement?.className || document.activeElement?.tagName || "",
      frames: window.__testsAutoResizeFrames || [],
      trace: (window.__testsAutoResizeTrace || []).slice(-160),
    }));
    throw new Error(`${action}: current device claim received neither a matching ACK nor current PTY geometry: ${JSON.stringify({
      previousEpoch,
      applied,
      acks,
      diagnostics,
    })}`);
  }
  return {
    expected,
    applied,
    ownershipEvidence: frameMatchesPane(expected, applied) ? "server-current" : "resize-ack",
    matchedAck,
    resizeErrors: state.resizeErrors - resizeErrorsBefore,
  };
};

const armPhysicalReconnectAfterClaim = (state, paneID) => state.page.evaluate((targetPaneID) => {
  const sockets = Array.from(window.__testsAutoSockets || [])
    .filter((socket) => String(socket.url || "").includes("mode=unified"));
  const socket = sockets.findLast((candidate) => candidate.readyState === WebSocket.OPEN);
  if (!socket) throw new Error("no open Unified physical WebSocket found");
  const prototype = Object.getPrototypeOf(socket);
  const previousSend = prototype?.send;
  if (typeof previousSend !== "function") throw new Error("Unified WebSocket send is unavailable");
  window.__testsAutoResizeReconnect = {
    armed: true,
    closed: false,
    paneID: targetPaneID,
    resizeEpoch: "",
    socketsBefore: sockets.length,
  };
  prototype.send = function closeAfterCurrentPaneClaim(data) {
    const result = previousSend.call(this, data);
    try {
      const value = typeof data === "string" ? JSON.parse(data) : null;
      const resize = value?.type === "pane-control" ? value.control : value;
      const envelopePaneID = String(value?.pane_id || targetPaneID);
      if (
        this === socket
        && resize?.type === "resize"
        && resize.claim === true
        && envelopePaneID === targetPaneID
        && window.__testsAutoResizeReconnect?.armed
      ) {
        prototype.send = previousSend;
        window.__testsAutoResizeReconnect.armed = false;
        window.__testsAutoResizeReconnect.closed = true;
        window.__testsAutoResizeReconnect.resizeEpoch = String(resize.resize_epoch || "");
        window.setTimeout(() => socket.close(4000, "spec-tests resize reconnect"), 0);
      }
    } catch {}
    return result;
  };
  return { socketsBefore: sockets.length };
}, paneID);

const waitForReplayedClaimAndSocket = async (state, frameCountBefore, socketsBefore) => {
  await state.page.waitForFunction(({ frameCountBefore, socketsBefore }) => {
    const transition = window.__testsAutoResizeReconnect;
    const claims = (window.__testsAutoResizeFrames || [])
      .slice(frameCountBefore)
      .filter((frame) => (
        frame.claim === true
        && (!frame.paneID || frame.paneID === transition?.paneID)
        && /^\d+$/.test(String(frame.resizeEpoch || ""))
      ));
    const sockets = Array.from(window.__testsAutoSockets || [])
      .filter((socket) => String(socket.url || "").includes("mode=unified"));
    const replayedClaim = claims.length >= 2
      && BigInt(claims.at(-1).resizeEpoch) > BigInt(claims[0].resizeEpoch);
    const replacementOpen = sockets.length > socketsBefore
      && sockets.filter((socket) => socket.readyState === WebSocket.OPEN).length === 1;
    return transition?.closed === true && replayedClaim && replacementOpen;
  }, { frameCountBefore, socketsBefore }, { timeout: 45_000 });
  return state.page.evaluate((frameCount) => {
    const transition = window.__testsAutoResizeReconnect;
    const claims = (window.__testsAutoResizeFrames || [])
      .slice(frameCount)
      .filter((frame) => frame.claim === true && (!frame.paneID || frame.paneID === transition?.paneID));
    const sockets = Array.from(window.__testsAutoSockets || [])
      .filter((socket) => String(socket.url || "").includes("mode=unified"));
    return {
      transition,
      claims,
      sockets: {
        created: sockets.length,
        open: sockets.filter((socket) => socket.readyState === WebSocket.OPEN).length,
      },
    };
  }, frameCountBefore);
};

export async function run(environment) {
  const { config, states, artifactsDir, eventLog, activity, paneSize, waitForResizeApplied, refreshResizeFrames, refreshTerminalOutput, assertNoFatalErrors } = environment;
  const { desktop, mobile } = states;
  const terminal = (state) => state.page.locator(".terminal-pane.active .terminal-host").first();
  const marker = `AUTO_MULTI_DEVICE_${Date.now()}`;
  const article = [
    `printf '%s\\n' '${marker}'`,
    "printf '%s\\n' 'WebShell real-device synchronization article begins'",
    "printf '%s\\n' 'The same PTY output must be visible to both browser windows.'",
    "printf '%s\\n' 'Resize ownership is intentionally transferred by clicking each terminal.'",
    "printf '%s\\n' 'This line is long enough to exercise wrapping on the mobile viewport.'",
    "printf '%s\\n' 'WebShell real-device synchronization article ends'",
  ].join("; ");
  const initialDesktop = paneSize(desktop, await activity(desktop));
  const initialMobile = paneSize(mobile, await activity(mobile));
  if (!initialDesktop || !initialMobile) throw new Error("workspace activity returned no pane for one of the windows");
  await eventLog({ status: "pass", action: "initial-activity", desktop: initialDesktop, mobile: initialMobile });

  let previous = initialDesktop;
  await refreshResizeFrames(mobile);
  const mobileResizeErrorsBeforeInput = mobile.resizeErrors;
  await terminal(mobile).tap();
  const mobileClickResult = await waitForDeviceClaimApplied({
    state: mobile,
    action: "click-mobile-before-input",
    activity,
    paneSize,
    refreshResizeFrames,
    resizeErrorsBefore: mobileResizeErrorsBeforeInput,
  });
  previous = mobileClickResult.applied;
  await eventLog({ status: "pass", window: "mobile", action: "click-mobile-before-input", resize: mobileClickResult.expected, applied: mobileClickResult.applied, ownershipEvidence: mobileClickResult.ownershipEvidence, matchedAck: mobileClickResult.matchedAck, transientResizeErrors: mobileClickResult.resizeErrors });
  await refreshResizeFrames(desktop);
  const desktopResizeErrorsBeforeInput = desktop.resizeErrors;
  await terminal(desktop).click();
  const clickResult = await waitForDeviceClaimApplied({
    state: desktop,
    previousEpoch: mobileClickResult.expected.resizeEpoch,
    action: "click-desktop-before-input",
    activity,
    paneSize,
    refreshResizeFrames,
    resizeErrorsBefore: desktopResizeErrorsBeforeInput,
  });
  previous = clickResult.applied;
  await eventLog({ status: "pass", window: "desktop", action: "click-desktop-before-input", resize: clickResult.expected, applied: clickResult.applied, ownershipEvidence: clickResult.ownershipEvidence, matchedAck: clickResult.matchedAck, transientResizeErrors: clickResult.resizeErrors });
  await desktop.page.waitForTimeout(500);
  await desktop.page.keyboard.insertText(`${article}\n`);
  await eventLog({ status: "pass", window: "desktop", action: "input-long-article", marker });
  const outputDeadline = Date.now() + 10_000;
  while (Date.now() < outputDeadline) {
    await Promise.all([refreshTerminalOutput(desktop), refreshTerminalOutput(mobile)]);
    if (desktop.output.includes(marker) && mobile.output.includes(marker)) break;
    await mobile.page.waitForTimeout(100);
  }
  assertNoFatalErrors();
  if (!desktop.output.includes(marker) || !mobile.output.includes(marker)) {
    throw new Error(`PTY output marker was not synchronized to both windows: ${marker}`);
  }
  await eventLog({ status: "pass", action: "output-synchronized", marker, windows: ["desktop", "mobile"] });

  await refreshResizeFrames(mobile);
  const reconnectFrameCount = mobile.framesSent.length;
  const reconnectErrorsBefore = mobile.resizeErrors;
  const reconnectSetup = await armPhysicalReconnectAfterClaim(mobile, mobile.activePaneID);
  const viewportBeforeReconnect = mobile.page.viewportSize();
  const reconnectViewport = {
    width: Math.min(480, viewportBeforeReconnect.width + 32),
    height: viewportBeforeReconnect.height,
  };
  await mobile.page.setViewportSize(reconnectViewport);
  await mobile.page.waitForFunction(() => window.__testsAutoResizeReconnect?.closed === true, null, { timeout: 10_000 });
  const nonce = randomInt(100000, 999999);
  const reconnectMarker = "SYNC" + nonce + "1END";
  const secondMarker = "SYNC" + nonce + "2END";
  await mobile.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable during resize reconnect");
    textarea.focus({ preventScroll: true });
  });
  const countedCommand = "WS_RECOVERY_COUNT=$(( ${WS_RECOVERY_COUNT:-0} + 1 )); printf '\\nSYNC%s%sEND\\n' '" + nonce + "' \"$WS_RECOVERY_COUNT\"";
  await mobile.page.keyboard.insertText(countedCommand + "; " + countedCommand);
  await mobile.page.keyboard.press("Enter");
  const reconnectDiagnostics = await waitForReplayedClaimAndSocket(
    mobile,
    reconnectFrameCount,
    reconnectSetup.socketsBefore,
  );
  const reconnectOutputDeadline = Date.now() + 45_000;
  while (Date.now() < reconnectOutputDeadline) {
    await Promise.all([refreshTerminalOutput(desktop), refreshTerminalOutput(mobile)]);
    if (desktop.output.includes(reconnectMarker) && mobile.output.includes(reconnectMarker)) break;
    await mobile.page.waitForTimeout(100);
  }
  if (!desktop.output.includes(reconnectMarker) || !mobile.output.includes(reconnectMarker)) {
    throw new Error(`resize reconnect did not flush queued input to both windows: ${JSON.stringify({
      reconnectMarker,
      reconnectDiagnostics,
    })}`);
  }
  const reconnectClaimResult = await waitForDeviceClaimApplied({
    state: mobile,
    previousEpoch: clickResult.expected.resizeEpoch,
    action: "mobile-resize-claim-across-physical-reconnect",
    activity,
    paneSize,
    refreshResizeFrames,
    resizeErrorsBefore: reconnectErrorsBefore,
  });
  previous = reconnectClaimResult.applied;
  for (const window of ["desktop", "mobile"]) {
    const observed = await waitForVisibleOutput(environment, secondMarker, "reconnect-" + window, 20000, { window });
    const lines = observed.text.split(/\r?\n/).map((line) => line.replace(/[ \t]/g, ""));
    if (lines.filter((line) => line === reconnectMarker).length !== 1
      || lines.filter((line) => line === secondMarker).length !== 1
      || lines.indexOf(reconnectMarker) >= lines.indexOf(secondMarker)) {
      throw new Error("reconnect output is not visible exactly once in submission order: " + window);
    }
  }
  await eventLog({
    status: "pass",
    window: "mobile",
    action: "resize-claim-and-input-across-physical-reconnect",
    marker: reconnectMarker,
    resize: reconnectClaimResult.expected,
    applied: reconnectClaimResult.applied,
    ownershipEvidence: reconnectClaimResult.ownershipEvidence,
    matchedAck: reconnectClaimResult.matchedAck,
    transientResizeErrors: reconnectClaimResult.resizeErrors,
    reconnect: reconnectDiagnostics,
    viewportBeforeReconnect,
    reconnectViewport,
  });
  assertNoFatalErrors();

  const foldedViewport = mobile.page.viewportSize();
  const unfoldedViewport = { width: 700, height: 900 };
  await refreshResizeFrames(mobile);
  const unfoldFrameCount = mobile.framesSent.length;
  const unfoldErrors = mobile.resizeErrors;
  await mobile.page.setViewportSize(unfoldedViewport);
  const unfoldResult = await waitForResizeApplied(
    mobile,
    previous,
    "portrait-unfold-mobile",
    unfoldFrameCount,
    unfoldErrors,
  );
  if (unfoldResult.expected.claim !== true) {
    const diagnostics = await mobile.page.evaluate((frameCount) => ({
      frames: (window.__testsAutoResizeFrames || []).slice(frameCount),
      trace: (window.__testsAutoResizeTrace || []).slice(-120),
    }), unfoldFrameCount);
    throw new Error(`portrait-unfold-mobile: resize did not claim current-device ownership: ${JSON.stringify({
      expected: unfoldResult.expected,
      diagnostics,
    })}`);
  }
  const unfoldFrames = await mobile.page.evaluate(
    (frameCount) => (window.__testsAutoResizeFrames || []).slice(frameCount),
    unfoldFrameCount,
  );
  if (unfoldFrames.some((frame) => frame.claim !== true)) {
    const trace = await mobile.page.evaluate(() => (window.__testsAutoResizeTrace || []).slice(-160));
    throw new Error(`portrait-unfold-mobile: passive resize raced the viewport claim: ${JSON.stringify({
      frames: unfoldFrames,
      trace,
    })}`);
  }
  previous = unfoldResult.applied;
  await eventLog({
    status: "pass",
    window: "mobile",
    action: "portrait-unfold-mobile",
    viewport: unfoldedViewport,
    resize: unfoldResult.expected,
    frames: unfoldFrames,
    applied: unfoldResult.applied,
  });

  await refreshResizeFrames(mobile);
  const foldFrameCount = mobile.framesSent.length;
  const foldErrors = mobile.resizeErrors;
  await mobile.page.setViewportSize(foldedViewport);
  const foldResult = await waitForResizeApplied(
    mobile,
    previous,
    "portrait-fold-mobile",
    foldFrameCount,
    foldErrors,
  );
  if (foldResult.expected.claim !== true) {
    const diagnostics = await mobile.page.evaluate((frameCount) => ({
      frames: (window.__testsAutoResizeFrames || []).slice(frameCount),
      trace: (window.__testsAutoResizeTrace || []).slice(-120),
    }), foldFrameCount);
    throw new Error(`portrait-fold-mobile: resize did not claim current-device ownership: ${JSON.stringify({
      expected: foldResult.expected,
      diagnostics,
    })}`);
  }
  const foldFrames = await mobile.page.evaluate(
    (frameCount) => (window.__testsAutoResizeFrames || []).slice(frameCount),
    foldFrameCount,
  );
  if (foldFrames.some((frame) => frame.claim !== true)) {
    const trace = await mobile.page.evaluate(() => (window.__testsAutoResizeTrace || []).slice(-160));
    throw new Error(`portrait-fold-mobile: passive resize raced the viewport claim: ${JSON.stringify({
      frames: foldFrames,
      trace,
    })}`);
  }
  previous = foldResult.applied;
  const foldCanvas = await terminal(mobile).locator("canvas").first().evaluate((node) => ({
    width: node.width,
    height: node.height,
  }));
  if (!foldCanvas.width || !foldCanvas.height) {
    throw new Error(`portrait-fold-mobile: terminal canvas is blank (${foldCanvas.width}x${foldCanvas.height})`);
  }
  await mobile.page.screenshot({ path: path.join(artifactsDir, "00-mobile-fold-recovery.png") });
  await eventLog({
    status: "pass",
    window: "mobile",
    action: "portrait-fold-mobile",
    viewport: foldedViewport,
    resize: foldResult.expected,
    frames: foldFrames,
    applied: foldResult.applied,
    canvas: foldCanvas,
  });

  const alternating = [];
  for (let round = 0; round < config.rounds; round += 1) alternating.push([desktop, "desktop"], [mobile, "mobile"]);
  let previousClaimEpoch = foldResult.expected.resizeEpoch;
  for (let index = 0; index < alternating.length; index += 1) {
    const [state, name] = alternating[index];
    const action = `click-${name}-${index + 1}`;
    await refreshResizeFrames(state);
    const resizeErrorsBefore = state.resizeErrors;
    await terminal(state)[name === "mobile" ? "tap" : "click"]();
    const result = await waitForDeviceClaimApplied({
      state,
      previousEpoch: previousClaimEpoch,
      action,
      activity,
      paneSize,
      refreshResizeFrames,
      resizeErrorsBefore,
    });
    previousClaimEpoch = result.expected.resizeEpoch;
    previous = result.applied;
    const canvas = await terminal(state).locator("canvas").first().evaluate((node) => ({ width: node.width, height: node.height }));
    if (!canvas.width || !canvas.height) throw new Error(`${action}: terminal canvas is blank (${canvas.width}x${canvas.height})`);
    await state.page.screenshot({ path: path.join(artifactsDir, `${String(index + 1).padStart(2, "0")}-${name}-click.png`) });
    await eventLog({ status: "pass", window: name, action, resize: result.expected, applied: result.applied, ownershipEvidence: result.ownershipEvidence, matchedAck: result.matchedAck, transientResizeErrors: result.resizeErrors, canvas });
    assertNoFatalErrors();
  }
}
