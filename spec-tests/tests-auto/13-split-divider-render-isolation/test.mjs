const shellForPane = (page, paneID) => page.locator(
  `.terminal-pane.active .pane-shell[data-pane-id="${paneID}"]`,
);

const waitForOutput = (page, marker, occurrences = 1, timeout = 30_000) => page.waitForFunction(({ expected, count }) => (
  String(window.__testsAutoTerminalOutput || "").split(expected).length - 1 >= count
), { expected: marker, count: occurrences }, { timeout });

const sendCommand = async (page, paneID, command) => {
  const host = shellForPane(page, paneID).locator(".terminal-host");
  await host.click();
  await page.waitForFunction((id) => {
    const shell = document.querySelector(
      `.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`,
    );
    return shell?.classList.contains("active") && shell.contains(document.activeElement);
  }, paneID, { timeout: 10_000 });
  await page.keyboard.insertText(`${command}\n`);
};

const paneColorSummary = (page, paneID) => page.evaluate((id) => {
  const shell = document.querySelector(
    `.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`,
  );
  const live = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
  const hold = shell?.querySelector(".terminal-frame-hold");
  const summarize = (canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return { width: 0, height: 0, red: 0, bright: 0 };
    }
    const probe = document.createElement("canvas");
    probe.width = Math.min(180, canvas.width);
    probe.height = Math.min(120, canvas.height);
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let red = 0;
    let bright = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      if (r >= 150 && g <= 90 && b <= 130 && r >= g * 1.8) red += 1;
      if (r + g + b >= 300) bright += 1;
    }
    return { width: canvas.width, height: canvas.height, red, bright };
  };
  return {
    paneID: id,
    connection: shell?.dataset.connection || "",
    renderReady: shell?.dataset.renderReady || "",
    hasPresentedFrame: shell?.dataset.hasPresentedFrame || "",
    holdHidden: hold instanceof HTMLCanvasElement ? hold.hidden : null,
    live: summarize(live),
    hold: summarize(hold),
  };
}, paneID);

const installDragSampler = (page, blankPaneID, sourcePaneID) => page.evaluate(({ blankID, sourceID }) => {
  const startedAt = performance.now();
  const samples = [];
  const crossPaneDraws = [];
  const drawImagePatches = [];
  let running = true;
  let previousAt = startedAt;
  let maxRafGapMs = 0;
  let pointerMoves = 0;
  let frameCount = 0;
  let dragActive = false;

  const paneCanvases = (paneID) => {
    const shell = document.querySelector(
      `.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(paneID)}"]`,
    );
    const live = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
    const hold = shell?.querySelector(".terminal-frame-hold");
    return { shell, live, hold };
  };

  for (const paneID of [blankID, sourceID]) {
    const { hold } = paneCanvases(paneID);
    const context = hold instanceof HTMLCanvasElement ? hold.getContext("2d") : null;
    if (!context) continue;
    const original = context.drawImage;
    context.drawImage = function observedDrawImage(source, ...args) {
      const sourcePane = source instanceof Element ? source.closest(".pane-shell")?.dataset.paneId || "" : "";
      const targetPane = hold.closest(".pane-shell")?.dataset.paneId || "";
      if (sourcePane && targetPane && sourcePane !== targetPane) {
        crossPaneDraws.push({ at: Math.round(performance.now() - startedAt), sourcePane, targetPane });
      }
      return original.call(this, source, ...args);
    };
    drawImagePatches.push({ context, original });
  }

  const sample = (kind = "raf") => {
    const now = performance.now();
    maxRafGapMs = Math.max(maxRafGapMs, now - previousAt);
    previousAt = now;
    const blank = paneCanvases(blankID);
    const source = paneCanvases(sourceID);
    const blankHoldVisible = blank.hold instanceof HTMLCanvasElement && blank.hold.hidden === false;
    const sourceHoldVisible = source.hold instanceof HTMLCanvasElement && source.hold.hidden === false;
    const geometry = (entry) => {
      const hostRect = entry.shell?.querySelector(".terminal-host")?.getBoundingClientRect?.();
      const liveRect = entry.live?.getBoundingClientRect?.();
      return {
        hostWidth: Number(hostRect?.width || 0),
        hostTop: Number(hostRect?.top || 0),
        liveWidth: Number(liveRect?.width || 0),
        liveTop: Number(liveRect?.top || 0),
        liveVisibility: entry.live ? getComputedStyle(entry.live).visibility : "",
      };
    };
    samples.push({
      at: Math.round(now - startedAt),
      kind,
      dragActive,
      blankRenderReady: blank.shell?.dataset.renderReady || "",
      blankHoldVisible,
      sourceRenderReady: source.shell?.dataset.renderReady || "",
      sourceHoldVisible,
      blankLiveOwner: blank.live?.closest(".pane-shell")?.dataset.paneId || "",
      sourceLiveOwner: source.live?.closest(".pane-shell")?.dataset.paneId || "",
      blankGeometry: geometry(blank),
      sourceGeometry: geometry(source),
    });
  };

  const onPointerDown = (event) => {
    if (event.target instanceof Element && event.target.closest(".split-divider")) {
      dragActive = true;
    }
  };
  const onPointerMove = () => {
    pointerMoves += 1;
  };
  const onPointerEnd = () => {
    dragActive = false;
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerEnd, true);
  document.addEventListener("pointercancel", onPointerEnd, true);
  const tick = () => {
    if (!running) return;
    const now = performance.now();
    maxRafGapMs = Math.max(maxRafGapMs, now - previousAt);
    previousAt = now;
    frameCount += 1;
    if (frameCount % 6 === 0) sample();
    requestAnimationFrame(tick);
  };
  sample("start");
  requestAnimationFrame(tick);
  window.__testsAutoSplitDragSampler = {
    stop() {
      if (running) {
        running = false;
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("pointermove", onPointerMove, true);
        document.removeEventListener("pointerup", onPointerEnd, true);
        document.removeEventListener("pointercancel", onPointerEnd, true);
        for (const patch of drawImagePatches) patch.context.drawImage = patch.original;
        sample("stop");
      }
      return { samples, maxRafGapMs, pointerMoves, crossPaneDraws };
    },
  };
}, { blankID: blankPaneID, sourceID: sourcePaneID });

const stopDragSampler = (page) => page.evaluate(() => (
  window.__testsAutoSplitDragSampler?.stop?.() || { samples: [], maxRafGapMs: 0, pointerMoves: 0 }
));

const unifiedSocketSnapshot = (page) => page.evaluate(() => {
  const sockets = Array.from(window.__testsAutoSockets || [])
    .filter((socket) => String(socket.url || "").includes("mode=unified"));
  return {
    created: sockets.length,
    active: sockets.filter((socket) => (
      socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN
    )).length,
  };
});

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required");
  const { desktop, mobile } = states;
  const { page } = desktop;
  await mobile.context.close();
  await mobile.browser.close();
  await eventLog({ status: "pass", window: "mobile", action: "close-non-scenario-context" });
  await page.waitForSelector(".terminal-pane.active .pane-shell", { timeout: 60_000 });
  await page.waitForFunction(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    return shell?.dataset.renderReady === "true" && shell.dataset.hasPresentedFrame === "true";
  }, null, { timeout: 60_000 });

  const sourcePaneID = await page.locator(".terminal-pane.active .pane-shell").first().getAttribute("data-pane-id");
  if (!sourcePaneID) throw new Error("initial source pane id is unavailable");

  await shellForPane(page, sourcePaneID).locator(".terminal-host").click({ button: "right" });
  const splitAction = page.locator('#contextMenu [data-action="split-vertical"]');
  await splitAction.waitFor({ state: "visible" });
  await splitAction.click();
  await page.waitForFunction((originalID) => {
    const shells = [...document.querySelectorAll(".terminal-pane.active .pane-shell")];
    return shells.length === 2 && shells.some((shell) => shell.dataset.paneId !== originalID);
  }, sourcePaneID, { timeout: 30_000 });

  const paneIDs = await page.locator(".terminal-pane.active .pane-shell").evaluateAll((shells) => (
    shells.map((shell) => shell.dataset.paneId || "")
  ));
  const blankPaneID = paneIDs.find((id) => id && id !== sourcePaneID);
  if (!blankPaneID) throw new Error(`split did not create a second pane: ${JSON.stringify(paneIDs)}`);
  await page.waitForFunction((ids) => ids.every((id) => {
    const shell = document.querySelector(
      `.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`,
    );
    return shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true";
  }), [sourcePaneID, blankPaneID], { timeout: 60_000 });

  const blankMarker = `SPLIT_BLANK_${Date.now()}`;
  await sendCommand(
    page,
    blankPaneID,
    `printf '\\033]0;${blankMarker}\\007\\033[2J\\033[H\\033[?25l'; sleep 45`,
  );
  await waitForOutput(page, blankMarker, 2);
  await page.waitForFunction((id) => {
    const shell = document.querySelector(
      `.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`,
    );
    return shell?.dataset.renderReady === "true";
  }, blankPaneID, { timeout: 15_000 });

  const sourceMarker = `SPLIT_SOURCE_${Date.now()}`;
  await sendCommand(
    page,
    sourcePaneID,
    `printf '\\033]0;${sourceMarker}\\007\\033[2J\\033[H\\033[48;2;255;0;64m\\033[38;2;255;255;255m'; i=0; while [ "$i" -lt 18 ]; do printf 'SOURCE_ONLY_%02d_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\\n' "$i"; i=$((i+1)); done; printf '\\033[0m'; i=0; while [ "$i" -lt 400 ]; do printf '\\033[19;1HLIVE_OUTPUT_%04d' "$i"; i=$((i+1)); sleep 0.03; done; sleep 45`,
  );
  await waitForOutput(page, sourceMarker, 2);
  await page.waitForFunction((id) => {
    const shell = document.querySelector(
      `.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`,
    );
    const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) return false;
    const probe = document.createElement("canvas");
    probe.width = Math.min(180, canvas.width);
    probe.height = Math.min(120, canvas.height);
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let red = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      if (r >= 150 && g <= 90 && b <= 130 && r >= g * 1.8) red += 1;
    }
    return red >= 20;
  }, sourcePaneID, { timeout: 15_000 });

  const before = {
    blank: await paneColorSummary(page, blankPaneID),
    source: await paneColorSummary(page, sourcePaneID),
    resizeFrames: await page.evaluate(() => (window.__testsAutoResizeFrames || []).length),
    resizeResponses: await page.evaluate(() => (window.__testsAutoResizeResponses || []).length),
    sockets: await unifiedSocketSnapshot(page),
  };
  if (before.blank.live.red !== 0 || before.blank.hold.red !== 0 || before.blank.live.bright !== 0) {
    throw new Error(`blank pane was contaminated before divider drag: ${JSON.stringify(before)}`);
  }
  if (before.source.live.red < 20) {
    throw new Error(`source pane did not render the red sentinel: ${JSON.stringify(before.source)}`);
  }

  await installDragSampler(page, blankPaneID, sourcePaneID);
  const divider = page.locator(".terminal-pane.active .split-divider").first();
  const dividerBox = await divider.boundingBox();
  const layoutBox = await page.locator(".terminal-pane.active .terminal-layout").boundingBox();
  if (!dividerBox || !layoutBox || layoutBox.width <= 400) {
    throw new Error(`split divider is not measurable: ${JSON.stringify({ dividerBox, layoutBox })}`);
  }
  const y = dividerBox.y + Math.max(1, dividerBox.height / 2);
  const left = layoutBox.x + layoutBox.width * 0.28;
  const right = layoutBox.x + layoutBox.width * 0.72;
  const finalX = layoutBox.x + layoutBox.width * 0.63;
  const dragStartedAt = Date.now();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, y);
  await page.mouse.down();
  for (let cycle = 0; cycle < 7; cycle += 1) {
    const from = cycle % 2 === 0 ? left : right;
    const to = cycle % 2 === 0 ? right : left;
    for (let step = 0; step <= 14; step += 1) {
      await page.mouse.move(from + ((to - from) * step) / 14, y);
    }
  }
  await page.mouse.move(finalX, y);
  await page.mouse.up();
  const dragElapsedMs = Date.now() - dragStartedAt;

  // The source keeps producing output while the divider is moving. Waiting for
  // a marker that cannot come from the echoed command proves the live renderer
  // did not merely keep showing its pre-drag frame.
  await waitForOutput(page, "LIVE_OUTPUT_0200", 1, 30_000);

  await page.waitForFunction((ids) => ids.every((id) => {
    const shell = document.querySelector(
      `.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`,
    );
    const hold = shell?.querySelector(".terminal-frame-hold");
    const failedConnection = ["offline", "network-error", "error", "closed"].includes(
      shell?.dataset.connection || "",
    );
    return !failedConnection
      && shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true"
      && (!(hold instanceof HTMLCanvasElement) || hold.hidden === true);
  }), [sourcePaneID, blankPaneID], { timeout: 20_000 });

  const drag = await stopDragSampler(page);
  const after = {
    blank: await paneColorSummary(page, blankPaneID),
    source: await paneColorSummary(page, sourcePaneID),
    resizeFrames: await page.evaluate(() => (window.__testsAutoResizeFrames || []).length),
    sockets: await unifiedSocketSnapshot(page),
    paneWidths: await page.locator(".terminal-pane.active .pane-shell").evaluateAll((shells) => (
      Object.fromEntries(shells.map((shell) => [shell.dataset.paneId || "", shell.getBoundingClientRect().width]))
    )),
    terminalHealth: await page.evaluate(({ ids, resizeFrameOffset, resizeResponseOffset }) => {
      const timelines = globalThis.__testsAutoTerminalTimelineSnapshot?.() || [];
      const resizeFrames = (window.__testsAutoResizeFrames || []).slice(resizeFrameOffset);
      const resizeResponses = (window.__testsAutoResizeResponses || []).slice(resizeResponseOffset);
      return Object.fromEntries(ids.map((id) => {
        const events = timelines.find((pane) => pane.paneID === id)?.events || [];
        const latestResizeState = [...events].reverse().find((event) => event?.flags)?.flags || null;
        const claims = resizeFrames.filter((frame) => frame.claim === true && (!frame.paneID || frame.paneID === id));
        const finalClaim = claims.at(-1) || null;
        const matchingAck = finalClaim
          ? resizeResponses.find((response) => (
            response.type === "resize-applied"
            && (!response.paneID || response.paneID === id)
            && response.resizeEpoch === String(finalClaim.resizeEpoch || "")
            && response.cols === Number(finalClaim.cols)
            && response.rows === Number(finalClaim.rows)
          )) || null
          : null;
        return [id, {
          resizeAckStale: events.filter((event) => event.type === "resize_ack_stale").length,
          retryExhausted: events.filter((event) => event.type === "presentation_retry_exhausted").length,
          liveGeometryComplete: events.filter((event) => event.type === "live_geometry_complete").length,
          latestResizeState,
          finalClaim,
          matchingAck,
          resizeErrors: resizeResponses.filter((response) => (
            response.type === "resize-error" && (!response.paneID || response.paneID === id)
          )),
          settled: Boolean(finalClaim && matchingAck),
        }];
      }));
    }, {
      ids: [sourcePaneID, blankPaneID],
      resizeFrameOffset: before.resizeFrames,
      resizeResponseOffset: before.resizeResponses,
    }),
  };

  const wrongCanvasOwners = drag.samples.filter((sample) => (
    sample.blankLiveOwner !== blankPaneID || sample.sourceLiveOwner !== sourcePaneID
  ));
  const activeSamples = drag.samples.filter((sample) => sample.dragActive);
  const unsafeLiveSamples = activeSamples.filter((sample) => {
    const geometries = [sample.blankGeometry, sample.sourceGeometry];
    return sample.blankHoldVisible
      || sample.sourceHoldVisible
      || sample.blankRenderReady !== "true"
      || sample.sourceRenderReady !== "true"
      || geometries.some((geometry) => (
        geometry.liveVisibility !== "visible"
        || Math.abs(geometry.liveTop - geometry.hostTop) > 1
      ));
  });
  const geometryLagSamples = activeSamples.filter((sample) => (
    [sample.blankGeometry, sample.sourceGeometry].some((geometry) => (
      Math.abs(geometry.liveWidth - geometry.hostWidth) > 16
    ))
  ));
  let geometryLagStartedAt = null;
  let geometryLagStartedIndex = -1;
  let maxGeometryLagMs = 0;
  let maxGeometryLagRange = [-1, -1];
  for (const [index, sample] of activeSamples.entries()) {
    const lagging = geometryLagSamples.includes(sample);
    if (lagging && geometryLagStartedAt === null) {
      geometryLagStartedAt = sample.at;
      geometryLagStartedIndex = index;
    }
    if (!lagging && geometryLagStartedAt !== null) {
      const duration = sample.at - geometryLagStartedAt;
      if (duration > maxGeometryLagMs) {
        maxGeometryLagMs = duration;
        maxGeometryLagRange = [geometryLagStartedIndex, index];
      }
      geometryLagStartedAt = null;
      geometryLagStartedIndex = -1;
    }
  }
  if (geometryLagStartedAt !== null && activeSamples.length > 0) {
    const duration = activeSamples.at(-1).at - geometryLagStartedAt;
    if (duration > maxGeometryLagMs) {
      maxGeometryLagMs = duration;
      maxGeometryLagRange = [geometryLagStartedIndex, activeSamples.length - 1];
    }
  }
  const liveStallMs = (geometryKey) => {
    if (activeSamples.length < 2) return 0;
    let lastLiveWidth = activeSamples[0][geometryKey].liveWidth;
    let lastHostWidth = activeSamples[0][geometryKey].hostWidth;
    let lastLiveChangeAt = activeSamples[0].at;
    let maxStall = 0;
    for (const sample of activeSamples.slice(1)) {
      const geometry = sample[geometryKey];
      if (Math.abs(geometry.liveWidth - lastLiveWidth) > 1) {
        lastLiveWidth = geometry.liveWidth;
        lastLiveChangeAt = sample.at;
      } else if (Math.abs(geometry.hostWidth - lastHostWidth) > 1) {
        maxStall = Math.max(maxStall, sample.at - lastLiveChangeAt);
      }
      lastHostWidth = geometry.hostWidth;
    }
    return maxStall;
  };
  const maxLiveStallMs = Math.max(
    liveStallMs("blankGeometry"),
    liveStallMs("sourceGeometry"),
  );
  const liveWidths = new Set(activeSamples.map((sample) => Math.round(sample.sourceGeometry.liveWidth / 24)));
  if (
    drag.crossPaneDraws.length > 0
    || wrongCanvasOwners.length > 0
    || after.blank.live.red !== 0
    || after.blank.hold.red !== 0
  ) {
    throw new Error(`source pane pixels leaked into blank pane: ${JSON.stringify({
      crossPaneDraws: drag.crossPaneDraws,
      wrongCanvasOwners,
      after,
    })}`);
  }
  if (
    activeSamples.length < 3
    || unsafeLiveSamples.length > 0
    || liveWidths.size < 3
    || maxLiveStallMs > 350
  ) {
    throw new Error(`divider drag did not present live top-anchored terminal reflow: ${JSON.stringify({
      activeSamples: activeSamples.length,
      unsafeLiveSamples,
      geometryLagSamples: geometryLagSamples.length,
      maxGeometryLagMs,
      maxLiveStallMs,
      lagWindow: activeSamples.slice(
        Math.max(0, maxGeometryLagRange[0] - 2),
        Math.min(activeSamples.length, maxGeometryLagRange[1] + 3),
      ).map((sample) => ({
        at: sample.at,
        blank: [sample.blankGeometry.hostWidth, sample.blankGeometry.liveWidth],
        source: [sample.sourceGeometry.hostWidth, sample.sourceGeometry.liveWidth],
      })),
      distinctLiveWidths: liveWidths.size,
    })}`);
  }
  if (after.source.live.red < 20) {
    throw new Error(`source sentinel disappeared during divider drag: ${JSON.stringify({ drag, after })}`);
  }
  if (drag.pointerMoves < 80) {
    throw new Error(`high-frequency divider drag generated too few pointer moves: ${drag.pointerMoves}`);
  }
  if (drag.maxRafGapMs > 1_500 || dragElapsedMs > 15_000) {
    throw new Error(`divider drag blocked the page: ${JSON.stringify({ maxRafGapMs: drag.maxRafGapMs, dragElapsedMs })}`);
  }
  const resizeFramesDuringDrag = after.resizeFrames - before.resizeFrames;
  if (resizeFramesDuringDrag > 4) {
    throw new Error(`divider drag started unbounded terminal resize transactions: ${JSON.stringify({
      pointerMoves: drag.pointerMoves,
      resizeFramesDuringDrag,
    })}`);
  }
  const expectedSourceWidth = layoutBox.width * 0.63;
  if (Math.abs(Number(after.paneWidths[sourcePaneID] || 0) - expectedSourceWidth) > layoutBox.width * 0.08) {
    throw new Error(`final divider position was not committed: ${JSON.stringify({ expectedSourceWidth, after })}`);
  }
  if (after.sockets.active !== 1 || after.sockets.created !== before.sockets.created) {
    throw new Error(`split drag replaced the Unified socket: ${JSON.stringify({ before: before.sockets, after: after.sockets })}`);
  }
  const unhealthyTerminal = Object.entries(after.terminalHealth).filter(([, health]) => (
    health.resizeAckStale > 0 || health.retryExhausted > 0 || health.resizeErrors.length > 0 || !health.settled
  ));
  if (unhealthyTerminal.length > 0) {
    throw new Error(`split drag left an unhealthy resize/presentation transaction: ${JSON.stringify(unhealthyTerminal)}`);
  }

  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "split-divider-render-isolation",
    sourcePaneID,
    blankPaneID,
    dragElapsedMs,
    drag: {
      samples: drag.samples.length,
      maxRafGapMs: drag.maxRafGapMs,
      pointerMoves: drag.pointerMoves,
      crossPaneDraws: drag.crossPaneDraws.length,
      wrongCanvasOwners: wrongCanvasOwners.length,
      activeSamples: activeSamples.length,
      unsafeLiveSamples: unsafeLiveSamples.length,
      geometryLagSamples: geometryLagSamples.length,
      maxGeometryLagMs,
      maxLiveStallMs,
      distinctLiveWidths: liveWidths.size,
    },
    resizeFramesDuringDrag,
    before,
    after,
  });
}
