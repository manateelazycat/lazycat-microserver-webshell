import { instanceSelector } from "../tests-auto/lib/target-selector.mjs";

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
  const instancesURL = new URL("./api/instances", new URL("/webshell/", requestedURL));
  const response = await page.request.get(instancesURL.toString(), { timeout: 15_000 });
  if (!response.ok()) throw new Error(`instances ${response.status()}: ${await response.text()}`);
  const instances = await response.json();
  const selectors = new Set(instances.filter((instance) => instance.status === "running").map(instanceSelector));
  if (requestedName && selectors.has(requestedName) && (config.targetKind !== "client" || requestedName.startsWith("client:"))) return requestedURL.toString();
  if (config.targetKind === "client" || requestedName.startsWith("client:")) {
    const client = !requestedName.startsWith("client:") && instances.find((instance) => (
      instanceSelector(instance).startsWith("client:") && instance.status === "running"
    ));
    if (!client) throw new Error("CLIENT_TARGET_UNAVAILABLE: no authorized running client: terminal; container fallback is forbidden");
    requestedURL.searchParams.set("name", instanceSelector(client));
    requestedURL.searchParams.delete("tab");
    return requestedURL.toString();
  }
  const fallback = instances.find((instance) => instance.status === "running");
  if (!fallback) throw new Error(`requested instance ${requestedName || "(empty)"} is unavailable and no running fallback exists`);
  const fallbackName = instanceSelector(fallback);
  requestedURL.searchParams.set("name", fallbackName);
  requestedURL.searchParams.delete("tab");
  await eventLog({ status: "pass", window: windowName, action: "select-running-instance", requestedName, selectedName: fallbackName });
  return requestedURL.toString();
};

return { loginIfNeeded, resolveTestURL };
}
