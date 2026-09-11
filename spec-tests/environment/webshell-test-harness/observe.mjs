import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const localTessdata = fileURLToPath(new URL("../../.state/tessdata/", import.meta.url));
let ocrOptions;
export async function ensureOCRAvailable() {
  if (!ocrOptions) ocrOptions = (async () => {
    const local = await fs.access(path.join(localTessdata, "eng.traineddata")).then(() => true, () => false);
    const options = local ? ["--tessdata-dir", localTessdata] : [];
    const { stdout } = await execute("tesseract", [...options, "--list-langs"], { timeout: 5000 });
    if (!/^eng$/m.test(stdout)) throw new Error("English OCR model is missing; install the pinned test OCR resource before running");
    return options;
  })();
  return ocrOptions;
}

// Observe rendered pixels, independently of transport buffers and terminal internals.
export async function observeTerminal(environment, { window = "desktop", name = "terminal", paneID } = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Invalid observation name");
  if (paneID !== undefined && !/^[a-zA-Z0-9_-]+$/.test(paneID)) throw new Error("Invalid pane observation target");
  const state = environment.states[window];
  if (!state?.page) throw new Error("Browser window is not available");
  const screenshot = path.join(environment.artifactsDir, `${name}.png`);
  const target = paneID ? `.terminal-pane.active .pane-shell[data-pane-id="${paneID}"] .terminal-host` : ".terminal-pane.active .terminal-host";
  await state.page.locator(target).first().screenshot({ path: screenshot, timeout: 5000 });
  const ocrImage = path.join(environment.artifactsDir, name + "-ocr.png");
  // Preserve the original screenshot; normalize contrast and enlarge the same pixels for OCR.
  await execute("magick", [screenshot, "-colorspace", "Gray", "-negate", "-filter", "point", "-resize", "300%", ocrImage], { timeout: 5000 });
  const options = await ensureOCRAvailable();
  const { stdout: text } = await execute("tesseract", [ocrImage, "stdout", ...options, "-l", "eng", "--psm", "6"], { timeout: 5000, maxBuffer: 256 * 1024 });
  const transcript = path.join(environment.artifactsDir, `${name}.txt`);
  await fs.writeFile(transcript, text);
  return { screenshot, ocrImage, transcript, text };
}

export async function waitForLiveTerminal(page, timeout = 15_000) {
  await page.waitForFunction(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    const canvas = shell?.querySelector("canvas:not(.terminal-frame-hold)");
    const hold = shell?.querySelector(".terminal-frame-hold");
    return shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true"
      && shell.dataset.terminalFrameHeld !== "true"
      && (!hold || hold.hidden || getComputedStyle(hold).display === "none")
      && canvas?.width > 0 && canvas?.height > 0
      && getComputedStyle(canvas).visibility === "visible";
  }, null, { timeout });
}

export async function waitForVisibleOutput(environment, expected, name, timeout = 15_000, { window = "desktop" } = {}) {
  const deadline = Date.now() + timeout;
  await waitForLiveTerminal(environment.states[window].page, timeout);
  let observation;
  do {
    observation = await observeTerminal(environment, { name, window });
    if (observation.text.split(/\r?\n/).some((line) => line.replace(/[ \t]/g, "") === expected)) return observation;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(`Expected command result is not visible in terminal screenshot: ${name}; evidence: ${observation.screenshot}`);
}
