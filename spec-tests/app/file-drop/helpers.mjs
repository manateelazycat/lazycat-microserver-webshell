export const uploadResponseMatches = (response) => {
  if (response.request().method() !== "POST") return false;
  const url = new URL(response.url());
  return /\/api\/attachments$/.test(url.pathname);
};

export const terminalHost = (state, paneID = "") => {
  if (paneID) {
    return state.page.locator(`.terminal-pane.active .pane-shell[data-pane-id="${paneID}"] .terminal-host`).first();
  }
  return state.page.locator(".terminal-pane.active .pane-shell.active .terminal-host, .terminal-pane.active .terminal-host").first();
};

export const waitForTerminal = async (state, paneID = "") => {
  const host = terminalHost(state, paneID);
  await host.waitFor({ state: "visible", timeout: 60_000 });
  await state.page.waitForFunction((id) => {
    const shell = id
      ? document.querySelector(`.terminal-pane.active .pane-shell[data-pane-id="${CSS.escape(id)}"]`)
      : document.querySelector(".terminal-pane.active .pane-shell.active")
        || document.querySelector(".terminal-pane.active .pane-shell");
    const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
    return shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true"
      && Number(canvas?.width || 0) > 0
      && Number(canvas?.height || 0) > 0;
  }, paneID, { timeout: 60_000 });
};

export const hostPoint = async (state, paneID = "") => {
  const box = await terminalHost(state, paneID).boundingBox();
  if (!box) throw new Error("terminal host bounding box is unavailable");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

export const sentMessageCount = (state) => state.page.evaluate(() => (
  (window.__testsAutoSentMessages || []).length
));

export const inputPayloads = (state, start = 0) => state.page.evaluate((offset) => {
  const payloads = [];
  const visit = (value, paneID = "") => {
    if (!value || typeof value !== "object") return;
    if (value.type === "input") {
      payloads.push({
        data: String(value.data || ""),
        paneID: String(paneID || value.pane_id || ""),
      });
    }
    if (value.type === "pane-control" && value.control) {
      visit(value.control, value.pane_id || paneID);
      return;
    }
    if (value.control && typeof value.control === "object") visit(value.control, value.pane_id || paneID);
    if (value.payload && typeof value.payload === "object") visit(value.payload, value.pane_id || paneID);
  };
  for (const message of (window.__testsAutoSentMessages || []).slice(offset)) visit(message);
  return payloads;
}, start);

export const waitForInputContaining = async (state, start, text, timeout = 15_000) => {
  await state.page.waitForFunction(({ offset, expected }) => {
    const visit = (value) => {
      if (!value || typeof value !== "object") return false;
      if (value.type === "input" && String(value.data || "").includes(expected)) return true;
      if (value.type === "pane-control") return visit(value.control);
      return visit(value.control) || visit(value.payload);
    };
    return (window.__testsAutoSentMessages || []).slice(offset).some(visit);
  }, { offset: start, expected: text }, { timeout });
};

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

export const assertPathInput = async (state, start, paths, label, paneID = "") => {
  for (const path of paths) await waitForInputContaining(state, start, path);
  const payloads = await inputPayloads(state, start);
  const matching = payloads.filter((payload) => paths.some((path) => payload.data.includes(path)));
  const values = matching.map((payload) => payload.data);
  for (const path of paths) {
    const occurrences = countOccurrences(values, path);
    if (occurrences !== 1) {
      throw new Error(`${label}: expected path once, got ${occurrences}: ${JSON.stringify({ path, payloads })}`);
    }
  }
  if (matching.some((payload) => payload.data.includes("\r") || payload.data.includes("\n"))) {
    throw new Error(`${label}: pasted path payload contained Enter/newline: ${JSON.stringify(matching)}`);
  }
  if (paneID && matching.some((payload) => payload.paneID && payload.paneID !== paneID)) {
    throw new Error(`${label}: path entered a different pane: ${JSON.stringify({ paneID, matching })}`);
  }
  return matching;
};

export const dispatchWindowDrag = (state, type, { x, y, files = [], directory = "" }) => (
  state.page.evaluate(({ eventType, clientX, clientY, fileData, directoryName }) => {
    const transfer = new DataTransfer();
    if (directoryName) {
      transfer.items.add(new File([new Uint8Array([0])], directoryName, { type: "" }));
    } else {
      for (const file of fileData) {
        transfer.items.add(new File([file.contents], file.name, { type: file.type || "application/octet-stream" }));
      }
    }
    const event = new DragEvent(eventType, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      dataTransfer: transfer,
      view: window,
    });
    if (event.dataTransfer !== transfer) {
      Object.defineProperty(event, "dataTransfer", { configurable: true, value: transfer });
    }
    const originalEntry = directoryName ? DataTransferItem.prototype.webkitGetAsEntry : null;
    if (directoryName) {
      DataTransferItem.prototype.webkitGetAsEntry = function directoryEntry() {
        return { isDirectory: true, isFile: false, name: directoryName };
      };
    }
    try {
      window.dispatchEvent(event);
      const overlay = document.querySelector(".terminal-file-drop-overlay");
      return {
        defaultPrevented: event.defaultPrevented,
        fileCount: transfer.files.length,
        overlay: overlay?.textContent || "",
        overlayPane: overlay?.closest(".pane-shell")?.dataset.paneId || "",
      };
    } finally {
      if (directoryName) {
        DataTransferItem.prototype.webkitGetAsEntry = originalEntry;
      }
    }
  }, { eventType: type, clientX: x, clientY: y, fileData: files, directoryName: directory })
);

export const runUploadAction = async (state, action, label) => {
  const responsePromise = state.page.waitForResponse(uploadResponseMatches, { timeout: 20_000 });
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
    throw new Error(`${label}: no successful attachment upload was observed; ${error?.message || error}`);
  }
};

export const waitForUploadPanel = (state, timeout = 15_000) => state.page.waitForFunction(() => {
  const panel = document.querySelector(".attachment-upload-panel");
  return Boolean(panel && String(panel.textContent || "").trim());
}, null, { timeout });

export const uploadPanelSnapshot = (state) => state.page.evaluate(() => {
  const panel = document.querySelector(".attachment-upload-panel");
  return {
    status: panel?.dataset.status || "",
    text: panel?.textContent || "",
    visible: Boolean(panel),
  };
});

const shellQuote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`;

export const cleanupRemotePaths = async (state, paths) => {
  const unique = [...new Set(paths.map((path) => String(path || "").trim()).filter(Boolean))];
  if (unique.length === 0 || state.page.isClosed()) return;
  const marker = `AUTO_DROP_CLEAN_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
  await state.page.waitForFunction((expected) => (
    String(window.__testsAutoTerminalOutput || "").includes(expected)
  ), marker, { timeout: 20_000 });
};

export const closeMobileCompanion = async (states, eventLog) => {
  if (!states.mobile) return;
  await states.mobile.context.close();
  await states.mobile.browser.close();
  await eventLog({ status: "pass", window: "mobile", action: "close-non-scenario-context" });
};
