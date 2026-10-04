import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const helperSource = path.join(path.dirname(fileURLToPath(import.meta.url)), "android-devtools-relay.go");
const webapkPackage = "cloud.lazycat.webapk.cloud.lazycat.lightos.entry";

export async function openAndroidWebView(device, { packageName = webapkPackage, artifactsDir }) {
  if (device.device.kind !== "emulator" || !artifactsDir || packageName !== webapkPackage) {
    throw new Error("Android WebView inspection requires the selected LightOS emulator and an artifact directory");
  }
  await fs.mkdir(artifactsDir, { recursive: true });
  const local = path.join(artifactsDir, "android-devtools-relay");
  await execute("go", ["build", "-o", local, helperSource], {
    env: { ...process.env, GOOS: "android", GOARCH: "arm64", CGO_ENABLED: "0" }, timeout: 120_000,
  });
  const remote = `/data/local/tmp/webshell-devtools-${randomUUID().replaceAll("-", "")}`;
  let server;
  const children = new Set();
  try {
    await device.adb(["push", local, remote], { timeout: 30_000 });
    await device.adb(["shell", "chmod", "700", remote]);
    let socketName = "";
    const deadline = Date.now() + 30_000;
    let relaunched = false;
    while (Date.now() < deadline) {
      const pids = String(await device.adb(["shell", "pidof", packageName]).catch(() => ""))
        .trim().split(/\s+/).filter(Boolean);
      if (pids.length === 1 && /^\d+$/.test(pids[0])) {
        const candidate = `webview_devtools_remote_${pids[0]}`;
        const sockets = String(await device.adb(["shell", "cat", "/proc/net/unix"]));
        if (sockets.includes(`@${candidate}`)) { socketName = candidate; break; }
      }
      if (!relaunched && Date.now() > deadline - 22_000) {
        await device.launch(packageName, "com.webapk.app.activity.MainActivity");
        relaunched = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!socketName) throw new Error("LightOS WebAPK process and DevTools socket did not become ready");
    server = net.createServer((socket) => {
      const child = spawn(device.adbPath,
        [...device.adbPrefix, "shell", "-T", "su", "0", remote, socketName],
        { stdio: ["pipe", "pipe", "pipe"] });
      children.add(child);
      socket.pipe(child.stdin);
      child.stdout.pipe(socket);
      const terminate = () => { child.stdin.destroy(); child.kill("SIGTERM"); children.delete(child); };
      socket.once("close", terminate);
      socket.once("error", terminate);
      child.stdin.once("error", terminate);
      child.stdout.once("error", terminate);
      child.once("exit", () => { children.delete(child); socket.end(); });
      child.once("error", () => { children.delete(child); socket.destroy(); });
      child.stderr.on("data", () => {});
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(15_000) });
    const version = await response.json();
    if (!response.ok || version["Android-Package"] !== packageName) {
      throw new Error("DevTools connected to a different Android application");
    }
    return {
      endpoint,
      relayPath: remote,
      packageName,
      version: { browser: version.Browser, package: version["Android-Package"] },
      async close() {
        for (const child of children) child.kill("SIGTERM");
        await new Promise((resolve) => server.close(resolve));
        await device.adb(["shell", "rm", "-f", remote]);
      },
    };
  } catch (error) {
    for (const child of children) child.kill("SIGTERM");
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await device.adb(["shell", "rm", "-f", remote]).catch(() => {});
    throw error;
  }
}
