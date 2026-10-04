import fs from "node:fs/promises";
import net from "node:net";
import dns from "node:dns/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { createTarget } from "./target.mjs";
import { projectRoot } from "./config.mjs";

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForPort(port, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Android companion SSH tunnel exited before becoming ready");
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => { socket.destroy(); resolve(); });
        socket.once("error", reject);
      });
      return;
    } catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  throw new Error("Android companion SSH tunnel did not become ready");
}

export async function openAndroidCompanion({ device, webview, url, username, password, expectedRevision }) {
  if (!device?.adbPath || !webview?.relayPath || !url || !expectedRevision) {
    throw new Error("Android companion needs the selected device, active relay, target URL and build revision");
  }
  const parentTests = path.resolve(projectRoot, "../spec-tests");
  const targetFile = path.join(parentTests, "target.local.json");
  const target = JSON.parse(await fs.readFile(targetFile, "utf8"));
  const settings = target.settings || {};
  const sshTarget = String(settings.ssh_target || "");
  const hostname = sshTarget.split("@").at(-1);
  const addresses = await dns.lookup(hostname, { family: 6, all: true });
  const unique = [...new Set(addresses.map((item) => item.address))];
  if (!sshTarget || unique.length !== 1 || !settings.ssh_password_file) {
    throw new Error("Companion test host or SSH route is unavailable or ambiguous");
  }
  const proxy = [...[device.adbPath, ...device.adbPrefix, "shell", "-T", "su", "0", webview.relayPath,
    "tcp", `[${unique[0]}]:22`]].map(quote).join(" ");
  const port = await freePort();
  const environment = { ...process.env,
    SSH_ASKPASS: path.join(parentTests, "environment/ssh_askpass"),
    SSH_ASKPASS_REQUIRE: "force",
    LIGHTOS_TEST_SSH_SECRET: settings.ssh_password_file,
  };
  const ssh = spawn("ssh", ["-N", "-T", "-D", `127.0.0.1:${port}`,
    "-o", "ConnectTimeout=15", "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${path.join(parentTests, ".state/known_hosts")}`,
    "-o", "NumberOfPasswordPrompts=1", "-o", `ProxyCommand=${proxy}`,
    sshTarget], { env: environment, stdio: ["ignore", "ignore", "pipe"], detached: true });
  ssh.stderr.on("data", () => {});
  let browser;
  const close = async () => {
    await browser?.close().catch(() => {});
    if (ssh.exitCode === null) {
      try { process.kill(-ssh.pid, "SIGTERM"); } catch { ssh.kill("SIGTERM"); }
    }
  };
  try {
    await waitForPort(port, ssh);
    browser = await chromium.launch({ channel: "chrome", headless: true,
      proxy: { server: `socks5://127.0.0.1:${port}` } });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
    await context.grantPermissions(["local-network-access"], { origin: new URL(url).origin }).catch(() => {});
    const openPage = async (address) => {
      const page = await context.newPage();
      await page.goto(new URL("/", address).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await createTarget({ url: address, username, password }, async () => {}).loginIfNeeded(page, "android-companion");
      await page.goto(address, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.locator(".terminal-pane.active .terminal-host").first().waitFor({ state: "visible", timeout: 60_000 });
      const observed = await page.evaluate(async () => {
        const response = await fetch("/webshell/api/server-revision", { cache: "no-store" });
        return (await response.json()).server_revision;
      });
      if (String(observed).split(":")[0] !== expectedRevision) {
        throw new Error("Companion browser is not connected to the current LightOS LPK");
      }
      return page;
    };
    const page = await openPage(url);
    return { browser, context, page, port, newPage: openPage, close };
  } catch (error) {
    await close();
    throw error;
  }
}
