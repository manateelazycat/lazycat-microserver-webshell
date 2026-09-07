const activeTextarea = (state) => state.page.locator(".terminal-pane.active .terminal-host textarea").first();

const waitForOutput = async (state, marker, timeout = 15_000) => {
  await state.page.waitForFunction((expected) => (
    String(window.__testsAutoTerminalOutput || "").includes(expected)
  ), marker, { timeout });
};

const inputPayloads = (state, start = 0) => state.page.evaluate((minimum) => {
  const payloads = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.type === "input") payloads.push(value);
    if (value.control && typeof value.control === "object") visit(value.control);
    if (value.payload && typeof value.payload === "object") visit(value.payload);
  };
  for (const message of (window.__testsAutoSentMessages || []).slice(minimum)) visit(message);
  return payloads;
}, start);

const sentMessageCount = (state) => state.page.evaluate(() => (window.__testsAutoSentMessages || []).length);

const countOccurrences = (values, needle) => values.reduce((total, value) => {
  let offset = 0;
  let count = 0;
  while (needle && (offset = String(value || "").indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return total + count;
}, 0);

const canvasSummary = (state) => state.page.evaluate(() => {
  const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return { width: 0, height: 0, nonTransparent: 0 };
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = Math.max(4, Math.floor(pixels.length / 20_000 / 4) * 4);
  let nonTransparent = 0;
  for (let index = 3; index < pixels.length; index += stride) {
    if (pixels[index] !== 0) nonTransparent += 1;
  }
  return { width: canvas.width, height: canvas.height, nonTransparent };
});

const unifiedSocketSnapshot = (state) => state.page.evaluate(() => {
  const unified = Array.from(window.__testsAutoSockets || [])
    .filter((socket) => String(socket.url || "").includes("mode=unified"));
  return {
    created: unified.length,
    active: unified.filter((socket) => socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN).length,
  };
});

const localIMEResources = (state) => state.page.evaluate(() => {
  const suffixes = [
    "/terminal/input/index.js",
    "/terminal/input/ime/index.js",
    "/terminal/input/ime/ime_controller.js",
    "/terminal/input/ime/ime_lifecycle.js",
    "/terminal/input/ime/ime_model.js",
  ];
  const names = performance.getEntriesByType("resource").map((entry) => entry.name);
  return {
    bundleLoaded: names.some((name) => /\/assets\/[^/]+\/assets\/index-[^/]+\.js$/.test(new URL(name).pathname)),
    sourceModulesLoaded: suffixes.filter((suffix) => names.some((name) => name.endsWith(suffix))),
  };
});

const dispatchComposition = (state, committed, { duplicateInput = true } = {}) => state.page.evaluate(({ text, duplicate }) => {
  const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable");
  textarea.focus({ preventScroll: true });
  textarea.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true, cancelable: true }));
  textarea.dispatchEvent(new CompositionEvent("compositionupdate", { data: text, bubbles: true, cancelable: true }));
  const preview = document.querySelector(".terminal-pane.active .terminal-composition-preview");
  const preedit = {
    hidden: preview?.hidden !== false,
    text: preview?.textContent || "",
  };
  textarea.dispatchEvent(new CompositionEvent("compositionend", { data: text, bubbles: true, cancelable: true }));
  if (duplicate) {
    textarea.value = text;
    textarea.dispatchEvent(new InputEvent("input", {
      data: text,
      inputType: "insertText",
      bubbles: true,
      cancelable: false,
    }));
  }
  return preedit;
}, { text: committed, duplicate: duplicateInput });

const dispatchPastePair = (state, text) => state.page.evaluate((value) => {
  const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable");
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", { value: { getData: () => value } });
  textarea.dispatchEvent(paste);
  const beforeInput = new InputEvent("beforeinput", {
    data: value,
    inputType: "insertFromPaste",
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(beforeInput, "dataTransfer", { value: { getData: () => value } });
  textarea.dispatchEvent(beforeInput);
  return { pastePrevented: paste.defaultPrevented, beforeInputPrevented: beforeInput.defaultPrevented };
}, text);

const installTouchKeyboardObserver = (state) => state.page.evaluate(() => {
  const host = document.querySelector(".terminal-pane.active .terminal-host");
  const textarea = host?.querySelector("textarea");
  if (!(host instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("terminal touch targets unavailable");
  }
  const order = [];
  const originalFocus = HTMLTextAreaElement.prototype.focus;
  const originalPreventDefault = Event.prototype.preventDefault;
  HTMLTextAreaElement.prototype.focus = function observedTerminalFocus(...args) {
    if (this === textarea) order.push("focus");
    return originalFocus.apply(this, args);
  };
  Event.prototype.preventDefault = function observedTerminalPreventDefault(...args) {
    if (this.type === "touchend" && this.target instanceof Element && this.target.closest(".terminal-host") === host) {
      order.push("prevent");
    }
    return originalPreventDefault.apply(this, args);
  };
  window.__testsAutoIMEObserver = {
    host,
    textarea,
    order,
    originalFocus,
    originalPreventDefault,
  };
  textarea.focus({ preventScroll: true });
  order.length = 0;
});

const readTouchKeyboardObserver = (state) => state.page.evaluate(() => {
  const observer = window.__testsAutoIMEObserver;
  if (!observer) throw new Error("terminal touch observer unavailable");
  const result = {
    focused: document.activeElement === observer.textarea,
    order: [...observer.order],
  };
  HTMLTextAreaElement.prototype.focus = observer.originalFocus;
  Event.prototype.preventDefault = observer.originalPreventDefault;
  delete window.__testsAutoIMEObserver;
  return result;
});
export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  const { desktop, mobile } = states;
  await Promise.all([desktop, mobile].map(async (state) => {
    await state.page.locator(".terminal-pane.active .terminal-host").first().waitFor({ state: "visible", timeout: 60_000 });
    await state.page.waitForFunction(() => {
      const shell = document.querySelector(".terminal-pane.active .pane-shell");
      const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
      return shell?.dataset.renderReady === "true"
        && shell.dataset.hasPresentedFrame === "true"
        && Number(canvas?.width || 0) > 0
        && Number(canvas?.height || 0) > 0;
    }, null, { timeout: 60_000 });
  }));

  const marker = `AUTO_IME_${Date.now()}`;
  const compositionCommand = `printf '%s\\n' '${marker}_COMPOSITION'`;
  const compositionStart = await sentMessageCount(desktop);
  const preedit = await dispatchComposition(desktop, compositionCommand);
  if (preedit.hidden || preedit.text !== compositionCommand) {
    throw new Error(`composition preview mismatch: ${JSON.stringify(preedit)}`);
  }
  await desktop.page.keyboard.press("Enter");
  await waitForOutput(desktop, `${marker}_COMPOSITION`);
  const compositionPayloads = await inputPayloads(desktop, compositionStart);
  const compositionInputs = compositionPayloads.map((payload) => payload.data);
  if (countOccurrences(compositionInputs, compositionCommand) !== 1) {
    throw new Error(`composition committed more than once: ${JSON.stringify(compositionInputs)}`);
  }

  const asciiStart = await sentMessageCount(desktop);
  await dispatchComposition(desktop, "a");
  const separatorPrevented = await desktop.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    const event = new InputEvent("beforeinput", {
      data: " ",
      inputType: "insertText",
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);
    return event.defaultPrevented;
  });
  const asciiPayloads = await inputPayloads(desktop, asciiStart);
  if (!separatorPrevented || asciiPayloads.some((payload) => payload.data === " ")) {
    throw new Error(`ASCII composition separator was not suppressed: ${JSON.stringify(asciiPayloads)}`);
  }
  await desktop.page.keyboard.press("Control+C");

  const deleteStart = await sentMessageCount(desktop);
  const deleteResult = await desktop.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    const dispatch = () => {
      const event = new InputEvent("beforeinput", {
        inputType: "deleteContentBackward",
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return [dispatch(), dispatch()];
  });
  const deletePayloads = await inputPayloads(desktop, deleteStart);
  if (deleteResult.some(Boolean) || deletePayloads.filter((payload) => payload.data === "\x7f").length !== 2) {
    throw new Error(`native delete contract failed: ${JSON.stringify({ deleteResult, deletePayloads })}`);
  }
  await desktop.page.keyboard.press("Control+C");

  const pasteMarker = `${marker}_PASTE`;
  const pasteCommand = `printf '%s\\n' '${pasteMarker}'`;
  const pasteStart = await sentMessageCount(desktop);
  const pasteEvents = await dispatchPastePair(desktop, pasteCommand);
  if (!pasteEvents.pastePrevented || !pasteEvents.beforeInputPrevented) {
    throw new Error(`paste events were not consumed: ${JSON.stringify(pasteEvents)}`);
  }
  await desktop.page.keyboard.press("Enter");
  await waitForOutput(desktop, pasteMarker);
  const pastePayloads = await inputPayloads(desktop, pasteStart);
  if (countOccurrences(pastePayloads.map((payload) => payload.data), pasteCommand) !== 1) {
    throw new Error(`paste was routed more than once: ${JSON.stringify(pastePayloads)}`);
  }

  await activeTextarea(mobile).waitFor({ state: "attached" });
  const mobileHost = mobile.page.locator(".terminal-pane.active .terminal-host").first();
  const hostBox = await mobileHost.boundingBox();
  if (!hostBox) throw new Error("mobile terminal host has no bounding box");
  const touchX = hostBox.x + Math.min(hostBox.width - 8, Math.max(8, hostBox.width / 2));
  const touchY = hostBox.y + Math.min(hostBox.height - 8, Math.max(8, hostBox.height / 2));
  await installTouchKeyboardObserver(mobile);
  await mobile.page.waitForTimeout(400);
  await mobile.page.touchscreen.tap(touchX, touchY);
  await mobile.page.waitForTimeout(120);
  const singleFocused = await mobile.page.evaluate(() => (
    document.activeElement === window.__testsAutoIMEObserver?.textarea
  ));
  await mobile.page.waitForTimeout(400);
  await mobile.page.evaluate(() => { window.__testsAutoIMEObserver.order.length = 0; });
  await mobile.page.touchscreen.tap(touchX, touchY);
  await mobile.page.waitForTimeout(80);
  await mobile.page.touchscreen.tap(touchX, touchY);
  await mobile.page.waitForTimeout(120);
  const observedTouch = await readTouchKeyboardObserver(mobile);
  const focusBeforePrevent = observedTouch.order.some((entry, index) => (
    entry === "focus" && observedTouch.order.slice(index + 1).includes("prevent")
  ));
  const touchResult = {
    singleBlurred: !singleFocused,
    doubleFocused: observedTouch.focused,
    focusBeforePrevent,
    order: observedTouch.order,
  };
  if (
    !touchResult.singleBlurred
    || !touchResult.doubleFocused
    || !touchResult.focusBeforePrevent
  ) {
    throw new Error(`touch keyboard ordering failed: ${JSON.stringify(touchResult)}`);
  }

  const resources = await localIMEResources(desktop);
  if (!resources.bundleLoaded || resources.sourceModulesLoaded.length > 0) {
    throw new Error(`IME code did not use the Vite bundle boundary: ${JSON.stringify(resources)}`);
  }
  const canvas = {
    desktop: await canvasSummary(desktop),
    mobile: await canvasSummary(mobile),
  };
  if (canvas.desktop.nonTransparent <= 0 || canvas.mobile.nonTransparent <= 0) {
    throw new Error(`terminal canvas is blank: ${JSON.stringify(canvas)}`);
  }
  const sockets = {
    desktop: await unifiedSocketSnapshot(desktop),
    mobile: await unifiedSocketSnapshot(mobile),
  };
  if (sockets.desktop.active !== 1 || sockets.mobile.active !== 1) {
    throw new Error(`expected one active Unified socket per page: ${JSON.stringify(sockets)}`);
  }

  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "terminal-ime-real-environment",
    marker,
    compositionPayloads: compositionPayloads.length,
    deletePayloads: deletePayloads.length,
    pastePayloads: pastePayloads.length,
    touchResult,
    resources,
    canvas,
    sockets,
  });
}
