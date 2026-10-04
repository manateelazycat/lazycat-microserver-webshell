import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";
import { sendTerminalCommand, cancelTerminalCommand } from "../../environment/webshell-test-harness/android-terminal.mjs";
import { terminalScreenText } from "../../environment/webshell-test-harness/android-observe.mjs";

function distance(left, right) {
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1,
        row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[right.length];
}

async function visibleEcho(device, marker, options) {
  const deadline = Date.now() + 20_000;
  let latest;
  for (let attempt = 1; Date.now() < deadline; attempt++) {
    latest = await terminalScreenText(device, { heightFraction: 0.5, ...options, name: `${options.name}-${attempt}` });
    const lines = latest.text.toUpperCase().split(/\r?\n/)
      .map((line) => line.replace(/[^A-Z0-9]/g, ""));
    if (options.embedded ? lines.some((line) => line.includes("X".repeat(12)) && line.length > 40)
      : lines.some((line) => Math.abs(line.length - marker.length) <= 3 && distance(line, marker) <= 3)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Android terminal did not visibly echo ${marker}; OCR: ${latest?.text.slice(-500) || "empty"}`);
}

export async function run({ device, page, selector, directory, tessdata }) {
  const tab = await openAndroidTestTab(page, { selector, directory });
  try {
    await tab.requireIdleShell();
    const first = "INPUTCHECK";
    await sendTerminalCommand(device, page, tab, `echo ${first}`);
    const firstScreen = await visibleEcho(device, first, { directory, tessdata, name: "first-output" });

    await sendTerminalCommand(device, page, tab, "sleep 30");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await cancelTerminalCommand(device, page, tab);
    const afterCancel = "CANCELCHECK";
    await sendTerminalCommand(device, page, tab, `echo ${afterCancel}`);
    const cancelScreen = await visibleEcho(device, afterCancel, { directory, tessdata, name: "after-cancel" });

    const longEnd = "LONGCHECK";
    await sendTerminalCommand(device, page, tab, `echo ${"x".repeat(160)} ${longEnd}`);
    const longScreen = await visibleEcho(device, longEnd, { directory, tessdata, name: "long-input", embedded: true });
    const final = "READYCHECK";
    await sendTerminalCommand(device, page, tab, `echo ${final}`);
    const finalScreen = await visibleEcho(device, final, { directory, tessdata, name: "final-output", heightFraction: 0.65 });
    return { observations: [
      `Android LightOS terminal visibly echoed ${first} and returned to a prompt`,
      `After native Ctrl+C, the same terminal visibly echoed ${afterCancel}`,
      `After a 160-character input, the terminal visibly echoed ${longEnd} and ${final}`,
    ], evidence: [firstScreen.screenshot, cancelScreen.screenshot, longScreen.screenshot, finalScreen.screenshot] };
  } finally {
    await tab.close();
  }
}
