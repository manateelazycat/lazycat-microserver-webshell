export async function keyboardShown(device) {
  const state = String(await device.adb(["shell", "dumpsys", "input_method"]));
  const match = state.match(/\bmInputShown=(true|false)\b/);
  if (!match) throw new Error("Android system keyboard visibility is unavailable");
  return match[1] === "true";
}

export async function openTerminalKeyboard(device, page, tab) {
  await tab.assertOwned();
  const geometry = await page.evaluate(() => {
    const host = document.querySelector(".terminal-pane.active .terminal-host");
    if (!(host instanceof HTMLElement)) throw new Error("Active terminal is not visible");
    const rect = host.getBoundingClientRect();
    return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
      y: Math.round((rect.top + Math.min(rect.height / 4, 130)) * devicePixelRatio) };
  });
  const focused = await page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    return textarea && document.activeElement === textarea;
  });
  if (!await keyboardShown(device) || !focused) await device.doubleTap(geometry.x, geometry.y);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await keyboardShown(device) && await page.evaluate(() => {
      const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
      return textarea && document.activeElement === textarea;
    })) return geometry;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Android system keyboard did not focus the owned terminal");
}

export async function sendTerminalCommand(device, page, tab, command) {
  await tab.assertOwned();
  await openTerminalKeyboard(device, page, tab);
  await device.typeASCII(command);
  await tab.assertOwned();
  await device.key("KEYCODE_ENTER");
}

export async function cancelTerminalCommand(device, page, tab) {
  await tab.assertOwned();
  const prior = await page.evaluate(() => document.querySelector('#mobileShortcuts [data-mobile-action="sticky_ctrl"]')?.getAttribute("aria-pressed"));
  const point = await page.evaluate(() => {
    const button = document.querySelector('#mobileShortcuts [data-mobile-action="sticky_ctrl"]');
    if (!(button instanceof HTMLElement)) throw new Error("Android terminal has no Control shortcut");
    const rect = button.getBoundingClientRect();
    return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
      y: Math.round((rect.top + rect.height / 2) * devicePixelRatio) };
  });
  if (prior !== "true") await device.tap(point.x, point.y);
  await page.waitFor(() => document.querySelector('#mobileShortcuts [data-mobile-action="sticky_ctrl"]')?.getAttribute("aria-pressed") === "true", [], 1500)
    .catch(() => { throw new Error("Android Control shortcut did not engage"); });
  await device.typeASCII("c");
  await page.waitFor(() => document.querySelector('#mobileShortcuts [data-mobile-action="sticky_ctrl"]')?.getAttribute("aria-pressed") === "false");
}

export async function clearTerminalInputForCleanup(page, tab) {
  await tab.assertOwned();
  await page.evaluate(() => {
    const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("Terminal input is unavailable for cleanup");
    textarea.focus({ preventScroll: true });
  });
  for (const event of [
    { type: "keyDown", modifiers: 2, key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 },
    { type: "rawKeyDown", modifiers: 2, key: "c", code: "KeyC", windowsVirtualKeyCode: 67 },
    { type: "keyUp", modifiers: 2, key: "c", code: "KeyC", windowsVirtualKeyCode: 67 },
    { type: "keyUp", modifiers: 0, key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 },
  ]) await page.send("Input.dispatchKeyEvent", event);
}
