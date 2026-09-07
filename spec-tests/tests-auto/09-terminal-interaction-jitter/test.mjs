const terminalHost = (state) => state.page.locator(".terminal-pane.active .terminal-host").first();

const installSampler = (page) => page.evaluate(() => {
  const samples = [];
  const events = [];
  window.__testsAutoResizeTrace = [];
  window.__testsAutoPresentationTrace = [];
  const startedAt = performance.now();
  const hostSelector = ".terminal-pane.active .terminal-host";
  const activePaneID = document.querySelector(`${hostSelector} .pane-shell`)
    ?.dataset?.paneId
    || document.querySelector(hostSelector)?.closest(".pane-shell")?.dataset?.paneId
    || "";
  window.__testsAutoInteractionPaneID = activePaneID;
  const sample = (kind = "raf") => {
    const host = document.querySelector(hostSelector);
    const shell = host?.closest(".pane-shell");
    const canvas = host?.querySelector("canvas:not(.terminal-frame-hold)");
    const textarea = host?.querySelector("textarea");
    const hostRect = host?.getBoundingClientRect?.();
    const canvasRect = canvas?.getBoundingClientRect?.();
    const textareaRect = textarea?.getBoundingClientRect?.();
    const canvasProjection = (() => {
      if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) {
        return null;
      }
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      // Read a narrow, deterministic column sample. This is enough to detect
      // a vertical translation without copying the full terminal bitmap every
      // frame.
      const width = Math.min(canvas.width, 96);
      const height = canvas.height;
      const pixels = context.getImageData(0, 0, width, height).data;
      const rows = [];
      for (let y = 0; y < height; y += 2) {
        let energy = 0;
        const row = y * width * 4;
        for (let x = 0; x < width; x += 3) {
          const offset = row + x * 4;
          energy += pixels[offset] + pixels[offset + 1] + pixels[offset + 2] + pixels[offset + 3];
        }
        rows.push(energy);
      }
      return rows;
    })();
    samples.push({
      at: Math.round(performance.now() - startedAt),
      kind,
      bodyScrollY: Number(window.scrollY || 0),
      visualViewportTop: Number(window.visualViewport?.offsetTop || 0),
      visualViewportHeight: Number(window.visualViewport?.height || 0),
      hostTop: Number(hostRect?.top || 0),
      hostLeft: Number(hostRect?.left || 0),
      hostWidth: Number(hostRect?.width || 0),
      hostHeight: Number(hostRect?.height || 0),
      hostScrollTop: Number(host?.scrollTop || 0),
      hostScrollLeft: Number(host?.scrollLeft || 0),
      canvasTop: Number(canvasRect?.top || 0),
      canvasHeight: Number(canvasRect?.height || 0),
      canvasWidth: Number(canvasRect?.width || 0),
      canvasBackingWidth: Number(canvas?.width || 0),
      canvasBackingHeight: Number(canvas?.height || 0),
      textareaTop: Number(textareaRect?.top || 0),
      textareaHeight: Number(textareaRect?.height || 0),
      textareaStyleTop: textarea?.style?.top || "",
      renderReady: shell?.dataset?.renderReady || "",
      hasPresentedFrame: shell?.dataset?.hasPresentedFrame || "",
      liveCanvasHidden: canvas?.hidden === true,
      holdCanvasHidden: host?.querySelector("canvas.terminal-frame-hold")?.hidden !== false,
      canvasProjection,
    });
  };
  const eventTypes = [
    "pointerdown", "focusin", "focusout", "mousedown", "mousemove", "mouseup",
    "keydown", "beforeinput", "input", "compositionstart", "compositionupdate",
    "compositionend", "selectionchange", "scroll", "resize",
  ];
  for (const type of eventTypes) {
    document.addEventListener(type, (event) => {
      const target = event.target;
      const inTerminal = target instanceof Element && Boolean(target.closest(hostSelector));
      if (inTerminal || type === "selectionchange" || type === "resize" || type === "scroll") {
        events.push({
          at: Math.round(performance.now() - startedAt),
          type,
          target: target?.tagName || "",
          inputType: event.inputType || "",
          key: event.key || "",
          pointerType: event.pointerType || "",
          inTerminal,
        });
        sample(`event:${type}`);
      }
    }, true);
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        const target = mutation.target;
        if (target.matches(hostSelector) || target.matches(`${hostSelector} canvas`) || target.matches(`${hostSelector} textarea`) || target.closest(hostSelector)) {
          events.push({
            at: Math.round(performance.now() - startedAt),
            type: `mutation:${mutation.attributeName}`,
            target: target.tagName,
            className: target.className || "",
          });
        }
      }
    }
  });
  observer.observe(document.documentElement, { subtree: true, attributes: true });
  let active = true;
  const tick = () => {
    if (!active) return;
    sample();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__testsAutoInteractionSampler = {
    stop() {
      active = false;
      observer.disconnect();
      sample("stop");
    },
    read() {
      return {
        samples,
        events,
        resizeTrace: window.__testsAutoResizeTrace || [],
        presentationTrace: window.__testsAutoPresentationTrace || [],
        activePaneID: window.__testsAutoInteractionPaneID || "",
      };
    },
  };
  sample("start");
});

const readSampler = (page) => page.evaluate(() => {
  window.__testsAutoInteractionSampler?.stop?.();
  return window.__testsAutoInteractionSampler?.read?.() || { samples: [], events: [] };
});

const waitForOutput = async (state, marker) => {
  await state.page.waitForFunction((expected) => String(window.__testsAutoTerminalOutput || "").includes(expected), marker, { timeout: 20_000 });
};

const summarize = (samples) => {
  const usable = samples.filter((sample) => sample.hostWidth > 0 && sample.hostHeight > 0);
  const baseline = usable[0] || null;
  if (!baseline) return { baseline: null, changes: [] };
  const fields = ["bodyScrollY", "visualViewportTop", "hostTop", "hostLeft", "hostWidth", "hostHeight", "hostScrollTop", "hostScrollLeft", "canvasTop", "canvasHeight", "canvasWidth", "canvasBackingWidth", "canvasBackingHeight"];
  const changes = usable.filter((sample) => fields.some((field) => Math.abs(Number(sample[field] || 0) - Number(baseline[field] || 0)) > 1));
  return { baseline, changes };
};

const summarizeProjection = (samples) => {
  const baseline = samples.find((sample) => Array.isArray(sample.canvasProjection))?.canvasProjection;
  if (!baseline?.length) {
    return { baselineLength: 0, shifts: [] };
  }
  const shifts = [];
  for (const sample of samples) {
    const projection = sample.canvasProjection;
    if (!Array.isArray(projection) || projection.length !== baseline.length) {
      continue;
    }
    let best = { shift: 0, error: Number.POSITIVE_INFINITY };
    for (let shift = -20; shift <= 20; shift += 1) {
      let error = 0;
      let count = 0;
      for (let index = 0; index < baseline.length; index += 1) {
        const otherIndex = index + shift;
        if (otherIndex < 0 || otherIndex >= projection.length) continue;
        error += Math.abs(Number(baseline[index] || 0) - Number(projection[otherIndex] || 0));
        count += 1;
      }
      const normalized = count ? error / count : Number.POSITIVE_INFINITY;
      if (normalized < best.error) best = { shift, error: Math.round(normalized) };
    }
    shifts.push({ at: sample.at, kind: sample.kind, ...best, holdCanvasHidden: sample.holdCanvasHidden });
  }
  return { baselineLength: baseline.length, shifts };
};

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required");
  }
  const { desktop } = states;
  const host = terminalHost(desktop);
  await host.waitFor({ state: "visible", timeout: 60_000 });
  // The shared runner opened a second device. Establish this device's geometry
  // before measuring repeated interaction; the takeover is covered by case 01.
  await host.click({ position: { x: 24, y: 24 } });
  await desktop.page.waitForFunction(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
    const hold = shell?.querySelector(".terminal-frame-hold");
    const host = shell?.querySelector(".terminal-host");
    const rect = canvas?.getBoundingClientRect();
    const hostRect = host?.getBoundingClientRect();
    const requested = (window.__testsAutoResizeFrames || []).filter((frame) => !frame.paneID || frame.paneID === shell?.dataset.paneId).at(-1);
    return shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true"
      && Number(canvas?.width || 0) > 0
      && Number(canvas?.height || 0) > 0
      && hold?.hidden === true
      && requested?.pixelWidth === canvas.width
      && requested?.pixelHeight === canvas.height
      && rect.height <= hostRect.height + 1
      && rect.width <= hostRect.width + 1;
  }, null, { timeout: 60_000 });
  await installSampler(desktop.page);
  // Ignore any final startup validation and measure only the stable interaction
  // window covered by this regression case.
  await desktop.page.evaluate(() => {
    window.__testsAutoResizeTrace = [];
    window.__testsAutoPresentationTrace = [];
  });

  await host.click({ position: { x: 24, y: 24 } });
  await desktop.page.waitForTimeout(250);
  const marker = `AUTO_JITTER_${Date.now()}`;
  await desktop.page.keyboard.insertText(`printf '%s\\n' '${marker}'`);
  await desktop.page.keyboard.press("Enter");
  await waitForOutput(desktop, marker);
  await desktop.page.waitForTimeout(250);

  const box = await host.boundingBox();
  if (!box) throw new Error("terminal host has no bounding box");
  const y = box.y + Math.min(box.height - 10, Math.max(10, box.height / 2));
  const x1 = box.x + Math.min(box.width - 30, Math.max(10, box.width * 0.25));
  const x2 = box.x + Math.min(box.width - 10, Math.max(20, box.width * 0.7));
  await desktop.page.mouse.move(x1, y);
  await desktop.page.mouse.down();
  await desktop.page.mouse.move(x2, y, { steps: 8 });
  await desktop.page.mouse.up();
  await desktop.page.waitForTimeout(350);

  const result = await readSampler(desktop.page);
  const summary = summarize(result.samples);
  const projection = summarizeProjection(result.samples);
  const unsafe = result.samples.filter((sample) => sample.hasPresentedFrame === "true" && sample.renderReady === "false");
  const activePresentationTrace = result.presentationTrace.filter((entry) => (
    !result.activePaneID || entry.pane === result.activePaneID
  ));
  const holdTransitions = activePresentationTrace.filter((entry) => (
    entry.phase === "begin_hold_enter"
    || (entry.phase === "set_ready_enter" && entry.ready === false && entry.hasPresentedFrame)
  ));
  const visibleHoldSamples = result.samples.filter((sample) => sample.holdCanvasHidden === false);
  await eventLog({
    status: "info",
    action: "interaction-jitter-samples",
    summary,
    projection,
    unsafe,
    activePaneID: result.activePaneID,
    holdTransitions,
    visibleHoldSamples,
    eventCount: result.events.length,
    samples: result.samples,
    events: result.events,
    resizeTrace: result.resizeTrace,
    presentationTrace: result.presentationTrace,
  });
  if (summary.changes.length > 0) {
    throw new Error(`terminal geometry changed during interaction: ${JSON.stringify({ summary, events: result.events })}`);
  }
  if (unsafe.length > 0) {
    throw new Error(`unsafe presentation state during interaction: ${JSON.stringify(unsafe)}`);
  }
  if (holdTransitions.length > 0 || visibleHoldSamples.length > 0) {
    throw new Error(`stable interaction entered presentation hold: ${JSON.stringify({
      activePaneID: result.activePaneID,
      holdTransitions,
      visibleHoldSamples,
    })}`);
  }
  assertNoFatalErrors();
  await eventLog({ status: "pass", action: "interaction-jitter-check", summary });
}
