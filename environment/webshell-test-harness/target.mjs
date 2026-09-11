import { instanceSelector } from "./target-selector.mjs";

// Authentication and instance selection are shared by every browser test module.
export function createTarget(config, eventLog) {
const loginIfNeeded = async (page, name) => {
  if (!page.url().includes("/sys/login")) return false;
  if (!config.username || !config.password) {
    throw new Error("WEBSHELL_TEST_USERNAME and WEBSHELL_TEST_PASSWORD are required when the test target requests login");
  }
  await page.locator("#username").fill(config.username);
  await page.locator("#password").fill(config.password);
  await page.locator("#submit").waitFor({ state: "visible" });
  await page.locator("#submit").click();
  await page.waitForURL((url) => !url.pathname.includes("/sys/login"), { timeout: 30_000 });
  await eventLog({ status: "pass", window: name, action: "click-login-submit", result: "authenticated" });
  return true;
};

const resolveTestURL = async (page, windowName) => {
  const requestedURL = new URL(config.url);
  const requestedName = requestedURL.searchParams.get("name") || "";
  const instancesURL = new URL("./api/instances", requestedURL);
  const response = await page.request.get(instancesURL.toString(), { timeout: 15_000 });
  if (!response.ok()) throw new Error(`instances ${response.status()}: ${await response.text()}`);
  const instances = await response.json();
  const selectors = new Set(instances.filter((instance) => instance.status === "running").map(instanceSelector));
  if (requestedName && selectors.has(requestedName) && (config.targetKind !== "client" || requestedName.startsWith("client:"))) return requestedURL.toString();
  await eventLog({ status: "error", window: windowName, action: "configured-target-unavailable", requestedName });
  throw new Error(config.targetKind === "client"
    ? "CLIENT_TARGET_UNAVAILABLE: explicitly configure an authorized running client: target"
    : "Configured terminal target is unavailable; automatic instance selection is forbidden");
};

return { loginIfNeeded, resolveTestURL };
}
