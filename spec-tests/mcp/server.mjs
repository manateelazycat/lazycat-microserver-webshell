import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { createEnvironment } from "../environment/browser.mjs";
import { inspectEnvironment } from "../environment/inspect.mjs";
import { observeTerminal } from "../environment/observe.mjs";
import { readConfig } from "../environment/config.mjs";
import { redactDiagnosticText } from "../tests-auto/artifact-redaction.mjs";

const server = new McpServer({ name: "webshell-test-environment", version: "0.1.0" });
const sessions = new Map();
const windowSchema = z.enum(["desktop", "mobile"]).default("desktop");
const sessionSchema = z.string().uuid();
let queue = Promise.resolve(), stopping = false;

function tool(name, description, inputSchema, operation, readOnlyHint = false) {
  server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint, destructiveHint: false } }, (args) => {
    const task = queue.then(async () => {
      try {
        if (stopping) throw new Error("Environment service is shutting down");
        const data = await operation(args);
        return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        const config = await readConfig().catch(() => ({}));
        const message = redactDiagnosticText(error.message, [config.username, config.password]);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    });
    queue = task.catch(() => {});
    return task;
  });
}

function session(id) {
  const entry = sessions.get(id);
  if (!entry) throw new Error("Browser session is unavailable or its lease expired");
  entry.usedAt = Date.now();
  return entry.environment;
}

async function release(id) {
  const entry = sessions.get(id);
  if (!entry) return { released: false };
  sessions.delete(id);
  await entry.environment.close();
  return { released: true, artifacts: entry.environment.artifactsDir };
}

tool("environment_inspect", "Report configured environment capabilities and active sessions; does not execute an AC or open a browser.", {}, async () => ({ ...await inspectEnvironment(), sessions: [...sessions.keys()] }), true);

tool("browser_open", "Open authenticated browser sessions on the configured real WebShell target and create an isolated test tab. Idle lease: 10 minutes.", {
  mobile: z.boolean().default(false),
}, async ({ mobile }) => {
  if (sessions.size >= 2) throw new Error("Release an existing session before opening another");
  const environment = await createEnvironment({ desktopOnly: !mobile });
  const id = randomUUID();
  sessions.set(id, { environment, usedAt: Date.now() });
  try {
    await environment.open();
    return { session: id, windows: Object.keys(environment.states), artifacts: environment.artifactsDir };
  } catch (error) {
    sessions.delete(id);
    throw error;
  }
});

tool("browser_action", "Operate the real browser through clicks, keyboard input, reload, viewport changes or network disconnection. Does not decide AC results.", {
  session: sessionSchema, window: windowSchema,
  action: z.enum(["click", "type", "press", "reload", "resize", "offline"]),
  selector: z.string().max(1000).optional(), text: z.string().max(10000).optional(), key: z.string().max(80).optional(),
  width: z.number().int().min(320).max(3840).optional(), height: z.number().int().min(240).max(2160).optional(),
  offline: z.boolean().optional(),
}, async (args) => {
  const environment = session(args.session);
  const state = environment.states[args.window];
  if (!state?.page) throw new Error("Requested browser window is unavailable");
  const { page, context } = state;
  switch (args.action) {
    case "click": await page.locator(args.selector || ".terminal-pane.active .terminal-host").first().click(); break;
    case "type":
      if (args.text === undefined) throw new Error("type requires text");
      await page.keyboard.insertText(args.text); break;
    case "press":
      if (!args.key) throw new Error("press requires key");
      await page.keyboard.press(args.key); break;
    case "reload": await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }); break;
    case "resize":
      if (!args.width || !args.height) throw new Error("resize requires width and height");
      await page.setViewportSize({ width: args.width, height: args.height }); break;
    case "offline":
      if (args.offline === undefined) throw new Error("offline requires a boolean");
      await context.setOffline(args.offline); break;
  }
  return { completed: true, action: args.action };
});

tool("browser_observe", "Capture terminal pixels and OCR text. Returns local evidence paths; it does not assert product acceptance.", {
  session: sessionSchema, window: windowSchema,
}, async (args) => {
  const observation = await observeTerminal(session(args.session), { window: args.window, name: `observation-${randomUUID()}` });
  return { ...observation, text: observation.text.slice(-4000) };
}, true);

tool("browser_release", "Close the owned test tab and browsers, restore network access, and save sanitized evidence.", {
  session: sessionSchema,
}, ({ session: id }) => release(id));

const leases = setInterval(() => {
  queue = queue.then(async () => {
    for (const [id, entry] of sessions) {
      if (Date.now() - entry.usedAt > 10 * 60_000) await release(id).catch(() => console.error("Expired session cleanup failed; inspect its artifacts"));
    }
  }).catch(() => {});
}, 30_000);
leases.unref();

let shutdown;
const stop = () => shutdown ||= (async () => {
  stopping = true;
  clearInterval(leases);
  const outcomes = await Promise.allSettled([...sessions.keys()].map(release));
  if (outcomes.some((result) => result.status === "rejected")) { console.error("Session cleanup failed; inspect artifacts"); process.exitCode = 1; }
  await server.close();
})();
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
process.stdin.once("end", () => { void stop(); });
await server.connect(new StdioServerTransport());
