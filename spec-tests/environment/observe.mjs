import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

// Observe rendered pixels, independently of transport buffers and terminal internals.
export async function observeTerminal(environment, { window = "desktop", name = "terminal" } = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Invalid observation name");
  const state = environment.states[window];
  if (!state?.page) throw new Error("Browser window is not available");
  const screenshot = path.join(environment.artifactsDir, `${name}.png`);
  await state.page.locator(".terminal-pane.active .terminal-host").first().screenshot({ path: screenshot, timeout: 5000 });
  const { stdout: text } = await execute("tesseract", [screenshot, "stdout", "-l", "eng", "--psm", "6"], { timeout: 5000, maxBuffer: 256 * 1024 });
  const transcript = path.join(environment.artifactsDir, `${name}.txt`);
  await fs.writeFile(transcript, text);
  return { screenshot, transcript, text };
}

export async function waitForVisibleOutput(environment, expected, name, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let observation;
  do {
    observation = await observeTerminal(environment, { name });
    if (observation.text.split(/\r?\n/).some((line) => line.replace(/[ \t]/g, "") === expected)) return observation;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(`Expected command result is not visible in terminal screenshot: ${name}; evidence: ${observation.screenshot}`);
}
