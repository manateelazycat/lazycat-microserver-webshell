import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function terminalScreenText(device, { directory, name, tessdata, heightFraction = 0.4, topFraction = 0 }) {
  if (!tessdata || !Number.isFinite(heightFraction) || heightFraction <= 0 || heightFraction > 1 ||
      !Number.isFinite(topFraction) || topFraction < 0 || topFraction + heightFraction > 1) {
    throw new Error("Android OCR needs a configured language model and crop height");
  }
  await fs.access(path.join(tessdata, "eng.traineddata"));
  await fs.mkdir(directory, { recursive: true });
  const screenshot = path.join(directory, `${name}.png`);
  const processed = path.join(directory, `${name}-ocr.png`);
  await device.screenshot(screenshot);
  const png = await fs.readFile(screenshot);
  if (png.subarray(1, 4).toString() !== "PNG") throw new Error("Android screenshot is not a PNG");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  await execute("magick", [screenshot, "-crop", `${width}x${Math.round(height * heightFraction)}+0+${Math.round(height * topFraction)}`,
    "+repage", "-colorspace", "Gray", "-threshold", "10%", "-negate", "-resize", "150%", processed],
  { timeout: 15_000 });
  const { stdout } = await execute("tesseract", [processed, "stdout", "-l", "eng", "--psm", "6"],
    { env: { ...process.env, TESSDATA_PREFIX: tessdata }, timeout: 15_000, maxBuffer: 1024 * 1024 });
  const text = stdout.trim();
  await fs.writeFile(path.join(directory, `${name}-ocr.txt`), text + "\n");
  return { text, screenshot, processed };
}

export async function waitForTerminalText(device, expected, options) {
  const deadline = Date.now() + (options.timeout || 15_000);
  let latest;
  for (let attempt = 1; Date.now() < deadline; attempt++) {
    latest = await terminalScreenText(device, { ...options, name: `${options.name}-${attempt}` });
    if (latest.text.includes(expected)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Android terminal did not visibly show ${expected}; last OCR: ${latest?.text.slice(-500) || "empty"}`);
}

function editDistance(left, right) {
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1,
      row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    row = next;
  }
  return row[right.length];
}

export async function waitForTerminalLine(device, marker, options) {
  const deadline = Date.now() + (options.timeout || 20_000);
  let latest;
  for (let attempt = 1; Date.now() < deadline; attempt++) {
    latest = await terminalScreenText(device, { heightFraction: 0.5, ...options,
      name: `${options.name}-${attempt}` });
    const lines = latest.text.toUpperCase().split(/\r?\n/)
      .map((line) => line.replace(/[^A-Z0-9]/g, ""));
    if (lines.some((line) => Math.abs(line.length - marker.length) <= 3 && editDistance(line, marker) <= 3)) {
      return latest;
    }
  }
  throw new Error(`Android screen did not show ${marker}; OCR: ${latest?.text.slice(-500) || "empty"}`);
}
