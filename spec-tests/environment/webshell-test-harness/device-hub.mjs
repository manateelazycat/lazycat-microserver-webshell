import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

function responseText(response) {
  const value = response?.result;
  if (response?.error) throw new Error(`Device MCP protocol error: ${response.error.message || "unknown"}`);
  const item = value?.content?.find((entry) => entry.type === "text");
  if (!item?.text) throw new Error("Device MCP returned no text result");
  let data;
  try { data = JSON.parse(item.text); }
  catch { throw new Error("Device MCP returned invalid JSON content"); }
  if (value.isError || data.error) throw new Error(`Device MCP: ${data.code || data.error || "request failed"}`);
  return data;
}

async function mcpCall(endpoint, name, args) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Device MCP HTTP ${response.status}`);
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error("Device MCP did not return a JSON tool result");
  }
  return responseText(await response.json());
}

export async function connectAndroidDevice({ endpoint, owner, name, kind = "emulator", adbPath }) {
  if (!endpoint || !owner || !name || !adbPath) {
    throw new Error("Android MCP URL, owner, exact device name and adb path are required");
  }
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/mcp") {
    throw new Error("Android MCP URL must end in /mcp");
  }
  if (!new Set(["emulator", "device"]).has(kind)) throw new Error("Android device kind must be explicit");
  const allocation = await mcpCall(endpoint, "device_request", {
    owner, purpose: "WebShell Android AC automation using the current LightOS LPK", platform: "android", kind,
  });
  const device = allocation.device;
  if (!device || device.name !== name || device.kind !== kind || device.platform !== "android") {
    throw new Error(`Allocated Android device differs from the requested ${name} ${kind}; no fallback is allowed`);
  }
  const connection = await mcpCall(endpoint, "device_connect", { device_id: device.id, owner });
  if (!connection.ready || connection.transport !== "adb-server" || !connection.target?.serial ||
      !connection.endpoint?.host || !Number.isInteger(connection.endpoint.port)) {
    throw new Error("Allocated Android device has no ready scoped ADB connection");
  }
  const prefix = ["-H", connection.endpoint.host, "-P", String(connection.endpoint.port), "-s", connection.target.serial];
  const adb = async (args, { timeout = 30_000, binary = false } = {}) => {
    const result = await execute(adbPath, [...prefix, ...args], {
      timeout, maxBuffer: 32 * 1024 * 1024, encoding: binary ? "buffer" : "utf8",
    });
    return result.stdout;
  };
  const state = String(await adb(["get-state"])).trim();
  const virtual = String(await adb(["shell", "getprop", "ro.boot.qemu"])).trim() === "1";
  if (state !== "device" || virtual !== (kind === "emulator")) {
    throw new Error("Scoped ADB target is unavailable or has the wrong device kind");
  }
  return {
    device: { id: device.id, name: device.name, kind: device.kind, serial: connection.target.serial },
    adbPath,
    adbPrefix: prefix,
    adb,
    async home() { await adb(["shell", "input", "keyevent", "KEYCODE_HOME"]); },
    async launch(packageName, activity) {
      await adb(["shell", "am", "start", "-n", `${packageName}/${activity}`]);
    },
    async screenshot(filename) {
      const output = await adb(["exec-out", "screencap", "-p"], { binary: true });
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, output);
      return filename;
    },
    async tap(x, y) {
      if (![x, y].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("Invalid Android tap coordinates");
      await adb(["shell", "input", "tap", String(x), String(y)]);
    },
    async doubleTap(x, y) {
      if (![x, y].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("Invalid Android tap coordinates");
      await adb(["shell", `input tap ${x} ${y}; sleep 0.12; input tap ${x} ${y}`]);
    },
    async typeASCII(value) {
      if (typeof value !== "string" || !/^[A-Za-z0-9_./ -]+$/.test(value)) {
        throw new Error("Android system text injection supports only simple ASCII test commands");
      }
      await adb(["shell", "input", "text", value.replaceAll(" ", "%s")]);
    },
    async key(code) {
      if (!/^KEYCODE_[A-Z0-9_]+$/.test(code)) throw new Error("Invalid Android key code");
      await adb(["shell", "input", "keyevent", code]);
    },
    async installedPackages() {
      return String(await adb(["shell", "pm", "list", "packages", "-3"]))
        .split(/\r?\n/).filter((line) => line.startsWith("package:")).map((line) => line.slice(8));
    },
  };
}
