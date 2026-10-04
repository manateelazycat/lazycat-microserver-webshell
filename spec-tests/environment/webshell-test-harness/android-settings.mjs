export async function tapAndroidControl(device, page, selector, { scroll = false } = {}) {
  const point = await page.evaluate((query, shouldScroll) => {
    const element = document.querySelector(query);
    if (!(element instanceof HTMLElement)) throw new Error(`Android control is unavailable: ${query}`);
    if (shouldScroll) element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) throw new Error(`Android control is not visible: ${query}`);
    return { x: Math.round((rect.left + rect.width / 2) * devicePixelRatio),
      y: Math.round((rect.top + rect.height / 2) * devicePixelRatio),
      cssX: rect.left + rect.width / 2, cssY: rect.top + rect.height / 2,
      wide: innerWidth > 640 };
  }, selector, scroll);
  if (point.wide) {
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.cssX,
      y: point.cssY, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.cssX,
      y: point.cssY, button: "left", clickCount: 1 });
  } else await device.tap(point.x, point.y);
}

export async function openAndroidTerminalSettings(device, page) {
  const open = await page.evaluate(() => document.querySelector("#settingsBackdrop")?.hidden === false);
  if (!open) {
    await tapAndroidControl(device, page, "#instanceSwitcherButton");
    await page.waitFor(() => document.querySelector("#settingsMenuButton")?.getBoundingClientRect().width > 0, [], 5000);
    await tapAndroidControl(device, page, "#settingsMenuButton");
    await page.waitFor(() => document.querySelector("#settingsBackdrop")?.hidden === false, [], 5000);
  }
  const mobileNav = await page.evaluate(() => document.querySelector("#settingsMobileNav")?.hidden === false);
  if (mobileNav) {
    await tapAndroidControl(device, page, "#settingsMobileNav .settings-mobile-nav-row");
    await page.waitFor(() => document.querySelector("#settingsMobileNav")?.hidden === true, [], 5000);
  }
  await page.waitFor(() => document.querySelector('label[for="settingsDebugModeToggle"]')?.getBoundingClientRect().width > 0,
    [], 5000);
}

export async function setAndroidSetting(device, page, inputID, enabled) {
  const current = await page.evaluate((id) => {
    const input = document.getElementById(id);
    if (!(input instanceof HTMLInputElement)) throw new Error(`Android setting is unavailable: ${id}`);
    return input.checked;
  }, inputID);
  if (current === enabled) return false;
  await tapAndroidControl(device, page, `label[for="${inputID}"]`, { scroll: true });
  await page.waitFor((id, expected) => document.getElementById(id)?.checked === expected,
    [inputID, enabled], 5000);
  return true;
}

export async function closeAndroidSettings(device, page) {
  if (await page.evaluate(() => document.querySelector("#settingsBackdrop")?.hidden === false)) {
    const closeVisible = await page.evaluate(() => document.querySelector("#settingsClose")?.getBoundingClientRect().width > 0);
    if (closeVisible) await tapAndroidControl(device, page, "#settingsClose");
    else {
      await tapAndroidControl(device, page, "#settingsBack");
      if (await page.evaluate(() => document.querySelector("#settingsBackdrop")?.hidden === false)) {
        await tapAndroidControl(device, page, "#settingsBack");
      }
    }
    await page.waitFor(() => document.querySelector("#settingsBackdrop")?.hidden === true, [], 5000);
  }
}
