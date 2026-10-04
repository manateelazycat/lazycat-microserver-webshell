import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { keyboardShown, clearTerminalInputForCleanup, sendTerminalCommand } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { nativeSnapshot, tapNativeLabel } from "../../environment/webshell-test-harness/android-native-ui.mjs";
import { waitForTerminalLine } from "../../environment/webshell-test-harness/android-observe.mjs";

async function tapWebControl(device, page, selector) {
  const point = await page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!(element instanceof HTMLElement)) throw new Error(`Android upload control is unavailable: ${query}`);
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) throw new Error(`Android upload control is hidden: ${query}`);
    return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
      y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
  }, selector);
  await device.tap(point.x, point.y);
}

export async function run({ device, page, selector, directory, tessdata }) {
  const tab = await openAndroidTestTab(page, { selector, directory });
  const filename = `webshell-android-${Date.now()}.txt`;
  const localFile = path.join(directory, filename);
  const deviceFile = `/sdcard/Download/${filename}`;
  const requests = new Map();
  const inputData = [];
  let uploadRequest, uploadResponse, uploadedPath, panelText, pickerOpen = false;
  const offRequest = page.on("Network.requestWillBeSent", (event) => {
    requests.set(event.requestId, { url: event.request.url, method: event.request.method });
    if (event.request.method === "POST" && new URL(event.request.url).pathname.endsWith("/api/attachments")) {
      uploadRequest = event.requestId;
    }
  });
  const offResponse = page.on("Network.responseReceived", (event) => {
    if (event.requestId === uploadRequest) uploadResponse = { status: event.response.status };
  });
  const offFinished = page.on("Network.loadingFinished", async (event) => {
    if (event.requestId !== uploadRequest) return;
    try {
      const result = await page.send("Network.getResponseBody", { requestId: event.requestId });
      uploadResponse = { ...uploadResponse, body: JSON.parse(result.base64Encoded
        ? Buffer.from(result.body, "base64").toString("utf8") : result.body) };
    } catch (error) { uploadResponse = { ...uploadResponse, error: error.message }; }
  });
  const offFrames = page.on("Network.webSocketFrameSent", (event) => {
    let message;
    try { message = JSON.parse(event.response?.payloadData || ""); } catch { return; }
    if (message.pane_id === tab.paneID && message.type === "pane-control" &&
        message.control?.type === "input") inputData.push(String(message.control.data || ""));
  });
  try {
    await tab.requireIdleShell();
    await fs.writeFile(localFile, `Android WebShell upload ${filename}\n`);
    await device.adb(["push", localFile, deviceFile]);
    await page.send("Network.enable");
    if (await keyboardShown(device)) await device.key("KEYCODE_BACK");
    await tapWebControl(device, page, "#attachmentToggle");
    await page.waitFor(() => document.querySelector("#attachmentBackdrop")?.hidden === false, [], 10_000);
    await tapWebControl(device, page, "#attachmentFile");
    const pickerDeadline = Date.now() + 15_000;
    let picker;
    while (Date.now() < pickerDeadline) {
      picker = await nativeSnapshot(device);
      if (picker.package === "com.google.android.documentsui") break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (picker?.package !== "com.google.android.documentsui") {
      throw new Error("Android system file picker did not open");
    }
    pickerOpen = true;
    await tapNativeLabel(device, "Show roots", { description: true, packageName: "com.google.android.documentsui" });
    await new Promise((resolve) => setTimeout(resolve, 450));
    await fs.writeFile(path.join(directory, "picker-roots.json"), JSON.stringify(
      (await nativeSnapshot(device)).nodes.filter((node) => node.text || node.description), null, 2));
    await tapNativeLabel(device, "Downloads", { packageName: "com.google.android.documentsui", preferLast: true });
    await new Promise((resolve) => setTimeout(resolve, 650));
    await fs.writeFile(path.join(directory, "picker-downloads.json"), JSON.stringify(
      (await nativeSnapshot(device)).nodes.filter((node) => node.text || node.description), null, 2));
    const fileDeadline = Date.now() + 12_000;
    while (true) {
      try { await tapNativeLabel(device, filename, { packageName: "com.google.android.documentsui" }); break; }
      catch (error) {
        if (Date.now() >= fileDeadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    pickerOpen = false;
    await page.waitFor(() => {
      const panel = document.querySelector(".attachment-upload-panel[data-status='success']");
      return panel && panel.textContent?.trim();
    }, [], 30_000);
    panelText = await page.evaluate(() => document.querySelector(".attachment-upload-panel[data-status='success']")?.textContent?.trim() || "");
    const copyButtonVisible = await page.evaluate(() => {
      const button = document.querySelector(".attachment-upload-panel[data-status='success'] .attachment-upload-copy");
      return button instanceof HTMLElement && !button.hidden && getComputedStyle(button).display !== "none";
    });
    if (/clipboard|paste|path is ready|粘贴|剪贴板|已复制/i.test(panelText)) {
      throw new Error("Android upload success still asks the user to paste the path");
    }
    if (copyButtonVisible) throw new Error("Android upload success still exposes a copy-path action");
    const responseDeadline = Date.now() + 15_000;
    while (Date.now() < responseDeadline && !uploadResponse?.body) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (uploadResponse?.status < 200 || uploadResponse?.status >= 300 ||
        !Array.isArray(uploadResponse.body?.files)) {
      throw new Error(`Android upload response is unavailable or failed: ${JSON.stringify(uploadResponse || {})}`);
    }
    const paths = uploadResponse.body.files.map((item) => String(item.path || "").trim()).filter(Boolean);
    if (paths.length !== 1) throw new Error("Android picker upload did not return one remote file path");
    uploadedPath = paths[0];
    const inputDeadline = Date.now() + 15_000;
    while (Date.now() < inputDeadline && !inputData.some((item) => item.includes(uploadedPath))) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const occurrences = inputData.reduce((count, item) => count + item.split(uploadedPath).length - 1, 0);
    if (occurrences !== 1 || inputData.some((item) => item.includes(uploadedPath) && /[\r\n]/.test(item))) {
      throw new Error(`Android upload path was not inserted exactly once without execution: ${occurrences}`);
    }
    const screen = path.join(directory, "uploaded-path.png");
    await device.screenshot(screen);
    const evidenceFile = path.join(directory, "upload-observation.json");
    await fs.writeFile(evidenceFile, JSON.stringify({ filename, uploadedPath, panelText,
      uploadStatus: uploadResponse.status, pathOccurrences: occurrences,
      inputFrameCount: inputData.length }, null, 2));
    return { observations: [
      `The Android system file picker selected ${filename} and the real service uploaded it`,
      "The success panel omitted clipboard instructions and inserted the remote path once without Enter",
    ], evidence: [screen, evidenceFile] };
  } finally {
    offRequest(); offResponse(); offFinished(); offFrames();
    if (pickerOpen) await device.key("KEYCODE_BACK").catch(() => {});
    try {
      if (uploadedPath) {
        if (!/^[A-Za-z0-9_./-]+$/.test(uploadedPath)) {
          throw new Error("Uploaded path contains characters unsafe for Android terminal cleanup");
        }
        const close = await page.evaluate(() => {
          const button = document.querySelector(".attachment-upload-panel[data-status='success'] .attachment-upload-close");
          if (!(button instanceof HTMLElement)) return null;
          const rect = button.getBoundingClientRect();
          return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
            y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
        });
        if (close) await device.tap(close.x, close.y);
        await page.waitFor(() => !document.querySelector(".attachment-upload-panel[data-status='success']"), [], 5000).catch(() => {});
        await clearTerminalInputForCleanup(page, tab);
        await sendTerminalCommand(device, page, tab, `rm -f -- ${uploadedPath}`);
        await sendTerminalCommand(device, page, tab, "echo UPLOADCLEAN");
        await waitForTerminalLine(device, "UPLOADCLEAN", { directory, tessdata, name: "cleanup" });
        const missing = await page.evaluate(async (name, file) => {
          const folder = file.slice(0, file.lastIndexOf("/")) || "/";
          const response = await fetch(`/webshell/api/attachments/files?name=${encodeURIComponent(name)}&path=${encodeURIComponent(folder)}`,
            { cache: "no-store" });
          if (!response.ok) return false;
          const listing = await response.json();
          return !listing.entries?.some((entry) => entry.path === file);
        }, selector, uploadedPath);
        if (!missing) throw new Error("Uploaded Android test file still exists after cleanup");
      }
    } finally {
      await device.adb(["shell", "rm", "-f", deviceFile]).catch(() => {});
      await tab.close();
    }
  }
}
