const uploadResponseMatches = (response) => {
  if (response.request().method() !== "POST") return false;
  const url = new URL(response.url());
  return /\/api\/attachments$/.test(url.pathname);
};

const terminalHost = (state) => state.page.locator(".terminal-pane.active .terminal-host").first();

const waitForTerminal = async (state) => {
  await terminalHost(state).waitFor({ state: "visible", timeout: 60_000 });
  await state.page.waitForFunction(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
    return shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true"
      && Number(canvas?.width || 0) > 0
      && Number(canvas?.height || 0) > 0;
  }, null, { timeout: 60_000 });
};

const inputPayloads = (state, start = 0) => state.page.evaluate((offset) => {
  const payloads = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.type === "input") payloads.push(value);
    if (value.control && typeof value.control === "object") visit(value.control);
    if (value.payload && typeof value.payload === "object") visit(value.payload);
  };
  for (const message of (window.__testsAutoSentMessages || []).slice(offset)) visit(message);
  return payloads;
}, start);

const sentMessageCount = (state) => state.page.evaluate(() => (
  (window.__testsAutoSentMessages || []).length
));

const countOccurrences = (values, needle) => values.reduce((count, value) => {
  let offset = 0;
  let next = String(value || "").indexOf(needle, offset);
  while (next >= 0) {
    count += 1;
    offset = next + needle.length;
    next = String(value || "").indexOf(needle, offset);
  }
  return count;
}, 0);

const waitForInputContaining = async (state, start, text, timeout = 15_000) => {
  await state.page.waitForFunction(({ offset, expected }) => {
    const visit = (value) => {
      if (!value || typeof value !== "object") return false;
      if (value.type === "input" && String(value.data || "").includes(expected)) return true;
      return visit(value.control) || visit(value.payload);
    };
    return (window.__testsAutoSentMessages || []).slice(offset).some(visit);
  }, { offset: start, expected: text }, { timeout });
};

const waitForOutput = async (state, marker, timeout = 20_000) => {
  await state.page.waitForFunction((expected) => (
    String(window.__testsAutoTerminalOutput || "").includes(expected)
  ), marker, { timeout });
};

const clipboardCapabilities = (state) => state.page.evaluate(() => ({
  secureContext: window.isSecureContext,
  clipboard: Boolean(navigator.clipboard),
  read: typeof navigator.clipboard?.read === "function",
  readText: typeof navigator.clipboard?.readText === "function",
  write: typeof navigator.clipboard?.write === "function",
  writeText: typeof navigator.clipboard?.writeText === "function",
  clipboardItem: typeof ClipboardItem === "function",
}));

const grantClipboard = async (state) => {
  const origin = new URL(state.page.url()).origin;
  await state.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
};

const installPasteObserver = (state) => state.page.evaluate(() => {
  window.__testsAutoNativePasteEvents = [];
  document.addEventListener("paste", (event) => {
    window.__testsAutoNativePasteEvents.push({
      activeElement: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName || "",
      defaultPrevented: event.defaultPrevented,
      files: Array.from(event.clipboardData?.files || []).map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })),
      items: Array.from(event.clipboardData?.items || []).map((item) => ({
        kind: item.kind,
        type: item.type,
      })),
      textLength: String(event.clipboardData?.getData?.("text/plain") || "").length,
    });
  }, { capture: true });
});

const pasteObserverSnapshot = (state) => state.page.evaluate(() => ({
  activeElement: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName || "",
  events: window.__testsAutoNativePasteEvents || [],
}));

const writeClipboardText = (state, text) => state.page.evaluate(async (value) => {
  await navigator.clipboard.writeText(value);
}, text);

const writeClipboardPNG = (state, label) => state.page.evaluate(async (marker) => {
  if (typeof navigator.clipboard?.write !== "function" || typeof ClipboardItem !== "function") {
    return { written: false, reason: "async-image-clipboard-unavailable" };
  }
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  context.fillStyle = "#e04b3f";
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = "#ffffff";
  context.font = "8px sans-serif";
  context.fillText(String(marker || "P").slice(-1), 4, 11);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("canvas PNG encoding failed")),
    "image/png",
  ));
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return { written: true, size: blob.size, type: blob.type };
  } catch (error) {
    return { written: false, reason: error?.message || String(error) };
  }
}, label);

const dispatchFilePaste = (state, fileData) => state.page.evaluate((payload) => {
  const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable");
  textarea.focus({ preventScroll: true });
  const transfer = new DataTransfer();
  const files = Array.isArray(payload.files) ? payload.files : [payload];
  for (const file of files) {
    transfer.items.add(new File([file.contents], file.name, { type: file.type }));
  }
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: transfer,
  });
  textarea.dispatchEvent(event);
  return {
    defaultPrevented: event.defaultPrevented,
    fileCount: transfer.files.length,
    itemCount: transfer.items.length,
  };
}, fileData);

const runUploadAction = async (state, action, label) => {
  const responsePromise = state.page.waitForResponse(uploadResponseMatches, { timeout: 15_000 });
  try {
    await action();
    const response = await responsePromise;
    const body = await response.json();
    if (!response.ok()) {
      throw new Error(`${label}: upload failed (${response.status()}): ${JSON.stringify(body)}`);
    }
    const paths = Array.isArray(body?.files)
      ? body.files.map((file) => String(file?.path || "").trim()).filter(Boolean)
      : [];
    if (paths.length === 0) {
      throw new Error(`${label}: upload response contained no paths: ${JSON.stringify(body)}`);
    }
    return { response, body, paths };
  } catch (error) {
    const observer = await pasteObserverSnapshot(state).catch(() => ({}));
    throw new Error(`${label}: no successful attachment upload was observed; ${error?.message || error}; observer=${JSON.stringify(observer)}`);
  }
};

const shellQuote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`;

const cleanupRemotePaths = async (state, paths) => {
  const unique = [...new Set(paths.map((path) => String(path || "").trim()).filter(Boolean))];
  if (unique.length === 0 || state.page.isClosed()) return;
  const marker = `AUTO_PASTE_CLEAN_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await terminalHost(state).click();
  await state.page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable for attachment cleanup");
    textarea.focus({ preventScroll: true });
  });
  await state.page.keyboard.press("Control+C");
  await state.page.keyboard.insertText(
    `rm -f -- ${unique.map(shellQuote).join(" ")}; printf '%s\\n' '${marker}'`,
  );
  await state.page.keyboard.press("Enter");
  await waitForOutput(state, marker);
};

const assertPathInput = async (state, start, paths, label) => {
  for (const path of paths) await waitForInputContaining(state, start, path);
  const payloads = await inputPayloads(state, start);
  const values = payloads.map((payload) => String(payload.data || ""));
  for (const path of paths) {
    const occurrences = countOccurrences(values, path);
    if (occurrences !== 1) {
      throw new Error(`${label}: expected path once, got ${occurrences}: ${JSON.stringify({ path, values })}`);
    }
  }
  const carryingPaths = values.filter((value) => paths.some((path) => value.includes(path)));
  if (carryingPaths.some((value) => value.includes("\r") || value.includes("\n"))) {
    throw new Error(`${label}: pasted path payload contained Enter/newline: ${JSON.stringify(carryingPaths)}`);
  }
  return payloads;
};

const runNativeTextPaste = async (state, marker) => {
  const command = `printf '%s\\n' '${marker}'`;
  await writeClipboardText(state, command);
  await terminalHost(state).click();
  const start = await sentMessageCount(state);
  await state.page.keyboard.press("Control+V");
  await state.page.keyboard.press("Enter");
  await waitForOutput(state, marker);
  const payloads = await inputPayloads(state, start);
  const occurrences = countOccurrences(payloads.map((payload) => payload.data), command);
  if (occurrences !== 1) {
    throw new Error(`${state.name}: native text paste was sent ${occurrences} times: ${JSON.stringify(payloads)}`);
  }
  return { command, payloads };
};

const runNativeImagePaste = async (state, marker) => {
  const clipboard = await writeClipboardPNG(state, marker);
  const start = await sentMessageCount(state);
  const upload = await runUploadAction(state, async () => {
    if (clipboard.written) {
      await terminalHost(state).click();
      await state.page.keyboard.press("Control+V");
      return;
    }
    await dispatchFilePaste(state, {
      name: `${marker}.png`,
      type: "image/png",
      contents: `synthetic-png-${marker}`,
    });
  }, `${state.name} native image paste`);
  const payloads = await assertPathInput(state, start, upload.paths, `${state.name} native image paste`);
  return { clipboard, paths: upload.paths, payloads };
};

const runSyntheticFilePaste = async (state, marker) => {
  const start = await sentMessageCount(state);
  let eventResult = null;
  const upload = await runUploadAction(state, async () => {
    eventResult = await dispatchFilePaste(state, {
      files: [
        {
          name: `${marker}-one.txt`,
          type: "application/octet-stream",
          contents: `attachment-one-${marker}`,
        },
        {
          name: `${marker}-two.txt`,
          type: "application/octet-stream",
          contents: `attachment-two-${marker}`,
        },
      ],
    });
  }, `${state.name} file DataTransfer paste`);
  if (eventResult.fileCount !== 2 || eventResult.itemCount !== 2 || !eventResult.defaultPrevented) {
    throw new Error(`${state.name}: file paste event was not consumed: ${JSON.stringify(eventResult)}`);
  }
  const payloads = await assertPathInput(state, start, upload.paths, `${state.name} file DataTransfer paste`);
  return { eventResult, paths: upload.paths, payloads };
};

const runClipboardPermissionFallback = async (state) => {
  const override = await state.page.evaluate(() => {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.readText !== "function") return false;
    window.__testsAutoOriginalClipboardReadText = clipboard.readText;
    Object.defineProperty(clipboard, "readText", {
      configurable: true,
      value: async () => { throw new DOMException("clipboard-read not allowed", "NotAllowedError"); },
    });
    return true;
  });
  if (!override) throw new Error(`${state.name}: clipboard.readText could not be overridden for permission fallback`);
  await terminalHost(state).click({ button: "right" });
  const pasteButton = state.page.locator('#contextMenu:not([hidden]) [data-action="paste"]');
  await pasteButton.waitFor({ state: "visible" });
  await pasteButton.click();
  await state.page.waitForFunction(() => {
    const toast = document.querySelector("#toast");
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    return toast?.hidden === false
      && /禁止主动读取剪贴板|系统粘贴快捷键/.test(toast.textContent || "")
      && document.activeElement === textarea;
  }, null, { timeout: 5_000 });
  return state.page.evaluate(() => ({
    activeElement: document.activeElement?.tagName || "",
    toast: document.querySelector("#toast")?.textContent || "",
  }));
};

const runManualUploadThenPaste = async (state, marker) => {
  await state.page.locator("#attachmentToggle").click();
  await state.page.locator("#attachmentBackdrop").waitFor({ state: "visible" });
  const fileName = `${marker}.txt`;
  const chooserPromise = state.page.waitForEvent("filechooser");
  await state.page.locator("#attachmentFile").click();
  const chooser = await chooserPromise;
  const successHint = state.page.waitForFunction((name) => {
    const panel = Array.from(document.querySelectorAll(".attachment-upload-panel[data-status='success']"))
      .find((node) => String(node.textContent || "").includes(name));
    const text = String(panel?.textContent || "").trim();
    return text || false;
  }, fileName, { timeout: 20_000 }).catch((error) => {
    throw new Error(`${state.name} manual upload success panel was not observed: ${error?.message || error}`);
  });
  const upload = await runUploadAction(state, () => chooser.setFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from(`manual-upload-${marker}`),
  }), `${state.name} manual attachment upload`);
  const successText = await successHint;
  if (!/已复制|已Copy|点击复制路径|剪切板|clipboard/i.test(successText)) {
    throw new Error(`${state.name} manual upload did not copy the path for paste: ${successText}`);
  }
  const copyButton = state.page.locator(".attachment-upload-panel[data-status='success']", { hasText: fileName }).locator(".attachment-upload-copy");
  if (await copyButton.isVisible()) {
    await copyButton.click();
  }
  await state.page.locator("#attachmentFileInput").focus();
  const activeBeforePaste = await state.page.evaluate(() => (
    document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName || ""
  ));
  const start = await sentMessageCount(state);
  await state.page.keyboard.press("Control+V");
  const payloads = await assertPathInput(state, start, upload.paths, `${state.name} manual upload follow-up paste`);
  return { activeBeforePaste, paths: upload.paths, payloads };
};

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
    active: unified.filter((socket) => (
      socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN
    )).length,
  };
});

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  const uploadedPaths = { desktop: [], mobile: [] };
  const results = {};
  const cleanupTrackedPaths = async (state, paths) => {
    await cleanupRemotePaths(state, paths);
    const cleaned = new Set(paths);
    uploadedPaths[state.name] = uploadedPaths[state.name].filter((path) => !cleaned.has(path));
  };
  try {
    for (const state of Object.values(states)) {
      await waitForTerminal(state);
      await grantClipboard(state);
      await installPasteObserver(state);
      results[state.name] = {
        clipboardCapabilities: await clipboardCapabilities(state),
      };
    }

    for (const state of [states.desktop, states.mobile]) {
      const prefix = `AUTO_NATIVE_PASTE_${state.name.toUpperCase()}_${Date.now()}`;
      results[state.name].text = await runNativeTextPaste(state, `${prefix}_TEXT`);

      const image = await runNativeImagePaste(state, `${prefix}_IMAGE`);
      results[state.name].image = image;
      uploadedPaths[state.name].push(...image.paths);
      await cleanupTrackedPaths(state, image.paths);

      const file = await runSyntheticFilePaste(state, `${prefix}_FILE`);
      results[state.name].file = file;
      uploadedPaths[state.name].push(...file.paths);
      await cleanupTrackedPaths(state, file.paths);

      if (state.name === "desktop") {
        const manual = await runManualUploadThenPaste(state, `${prefix}_MANUAL`);
        results[state.name].manual = manual;
        uploadedPaths[state.name].push(...manual.paths);
        await cleanupTrackedPaths(state, manual.paths);
      }

      results[state.name].observer = await pasteObserverSnapshot(state);
      results[state.name].canvas = await canvasSummary(state);
      results[state.name].sockets = await unifiedSocketSnapshot(state);
      if (results[state.name].canvas.nonTransparent <= 0) {
        throw new Error(`${state.name}: terminal canvas is blank: ${JSON.stringify(results[state.name].canvas)}`);
      }
      if (results[state.name].sockets.active !== 1) {
        throw new Error(`${state.name}: expected one active Unified socket: ${JSON.stringify(results[state.name].sockets)}`);
      }
    }

    results.desktop.permissionFallback = await runClipboardPermissionFallback(states.desktop);

    assertNoFatalErrors();
    await eventLog({
      status: "pass",
      action: "attachment-native-paste-real-environment",
      results,
    });
  } finally {
    const cleanupFailures = [];
    for (const state of Object.values(states)) {
      await cleanupRemotePaths(state, uploadedPaths[state.name] || []).catch(async (error) => {
        cleanupFailures.push(`${state.name}: ${error?.message || String(error)}`);
        await eventLog({
          status: "error",
          window: state.name,
          action: "cleanup-uploaded-attachments",
          message: error?.message || String(error),
        });
      });
    }
    if (cleanupFailures.length > 0) {
      throw new Error(`attachment cleanup failed:\n${cleanupFailures.join("\n")}`);
    }
  }
}
