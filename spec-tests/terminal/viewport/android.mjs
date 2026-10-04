import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { keyboardShown, openTerminalKeyboard, sendTerminalCommand } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { terminalScreenText } from "../../environment/webshell-test-harness/android-observe.mjs";

const canvasState = () => {
  const shell = document.querySelector(".terminal-pane.active .pane-shell");
  const canvas = shell?.querySelector(".terminal-host canvas:not(.terminal-frame-hold)");
  const rect = canvas?.getBoundingClientRect();
  return { ready: shell?.dataset.renderReady === "true" && shell?.dataset.hasPresentedFrame === "true",
    canvasWidth: canvas?.width || 0, canvasHeight: canvas?.height || 0,
    visibleWidth: rect?.width || 0, visibleHeight: rect?.height || 0,
    viewportWidth: visualViewport.width, viewportHeight: visualViewport.height };
};

function distance(left, right) {
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1,
      row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    row = next;
  }
  return row[right.length];
}

async function visibleLine(device, marker, { directory, tessdata, name, heightFraction = 0.45 }) {
  const deadline = Date.now() + 20_000;
  let latest;
  for (let attempt = 1; Date.now() < deadline; attempt++) {
    latest = await terminalScreenText(device, { directory, tessdata, name: `${name}-${attempt}`, heightFraction });
    const lines = latest.text.toUpperCase().split(/\r?\n/).map((line) => line.replace(/[^A-Z0-9]/g, ""));
    if (lines.some((line) => Math.abs(line.length - marker.length) <= 3 && distance(line, marker) <= 3)) return latest;
  }
  throw new Error(`Android terminal content ${marker} was not visible after ${name}; OCR: ${latest?.text.slice(-400) || "empty"}`);
}

export async function run({ device, page, selector, directory, tessdata }) {
  const tab = await openAndroidTestTab(page, { selector, directory });
  const rotation = String(await device.adb(["shell", "cmd", "window", "user-rotation"])).trim();
  try {
    await tab.requireIdleShell();
    if (await keyboardShown(device)) await device.key("KEYCODE_BACK");
    await page.waitFor(() => visualViewport.height > screen.height - 100, [], 10_000);
    const baseline = await page.evaluate(canvasState);
    if (!baseline.ready || !baseline.canvasWidth || !baseline.canvasHeight) throw new Error("Android terminal has no initial visible frame");
    await sendTerminalCommand(device, page, tab, "echo VIEWPORTCHECK");
    const initial = await visibleLine(device, "VIEWPORTCHECK", { directory, tessdata, name: "before-keyboard" });

    await device.key("KEYCODE_BACK");
    await page.waitFor((height) => visualViewport.height >= height - 30, [baseline.viewportHeight], 10_000);
    const beforeKeyboard = await page.evaluate(canvasState);
    await page.evaluate(() => {
      const samples = [];
      let active = true;
      const collect = () => {
        if (!active) return;
        const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
        const rect = canvas?.getBoundingClientRect();
        samples.push({ at: performance.now(), backingWidth: canvas?.width || 0,
          visibleWidth: rect?.width || 0, hidden: canvas?.hidden || false });
        if (samples.length > 600) samples.shift();
        requestAnimationFrame(collect);
      };
      window.__androidViewportProbe = { samples, stop: () => { active = false; } };
      requestAnimationFrame(collect);
    });
    await openTerminalKeyboard(device, page, tab);
    await page.waitFor((height) => visualViewport.height < height - 80, [beforeKeyboard.viewportHeight], 10_000);
    const withKeyboard = await page.evaluate(canvasState);
    if (!withKeyboard.ready || withKeyboard.viewportHeight >= beforeKeyboard.viewportHeight - 80) {
      throw new Error("Android keyboard did not shrink the visible area while preserving terminal content");
    }
    const keyboardFrame = await visibleLine(device, "VIEWPORTCHECK", { directory, tessdata, name: "keyboard-open" });
    const transition = await page.evaluate(() => {
      const probe = window.__androidViewportProbe;
      probe?.stop();
      delete window.__androidViewportProbe;
      return probe?.samples || [];
    });
    if (transition.length < 2) throw new Error("Android keyboard transition had no visible frame samples");
    const stretched = transition.some((sample, index) => index > 0 && !sample.hidden &&
      sample.backingWidth === transition[index - 1].backingWidth &&
      Math.abs(sample.visibleWidth - transition[index - 1].visibleWidth) > 4);
    if (stretched) throw new Error("Android keyboard transition stretched a visible old terminal frame");

    await device.key("KEYCODE_BACK");
    await page.waitFor((height) => visualViewport.height >= height - 30, [beforeKeyboard.viewportHeight], 10_000);
    const restored = await page.evaluate(canvasState);
    if (!restored.ready || Math.abs(restored.viewportHeight - beforeKeyboard.viewportHeight) > 30) {
      throw new Error("Android terminal layout did not recover after closing the keyboard");
    }
    const hiddenKeyboard = await visibleLine(device, "VIEWPORTCHECK", { directory, tessdata, name: "keyboard-closed" });

    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "1"]);
    await page.waitFor(() => innerWidth > innerHeight &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.renderReady === "true", [], 20_000);
    const landscape = await page.evaluate(canvasState);
    if (!landscape.canvasWidth || !landscape.canvasHeight) throw new Error("Android landscape terminal has no visible frame");
    const rotated = await visibleLine(device, "VIEWPORTCHECK", { directory, tessdata, name: "landscape", heightFraction: 0.75 });

    await device.adb(["shell", "cmd", "window", "user-rotation", "lock", "0"]);
    await page.waitFor(() => innerWidth < innerHeight &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.renderReady === "true", [], 20_000);
    await sendTerminalCommand(device, page, tab, "echo VIEWPORTREADY");
    const final = await visibleLine(device, "VIEWPORTREADY", { directory, tessdata, name: "after-rotation", heightFraction: 0.65 });
    return { observations: [
      "Android system keyboard opened and closed while the existing terminal text stayed visible",
      "The visible terminal frame remained intact during keyboard resize and recovered afterward",
      "Real device rotation showed the same terminal and accepted new input after returning to portrait",
    ], evidence: [initial.screenshot, keyboardFrame.screenshot, hiddenKeyboard.screenshot, rotated.screenshot, final.screenshot] };
  } finally {
    const match = rotation.match(/^(free|lock)(?:\s+([0-3]))?/);
    if (match) await device.adb(["shell", "cmd", "window", "user-rotation", match[1], ...(match[1] === "lock" ? [match[2] || "0"] : [])]);
    await tab.close();
  }
}
