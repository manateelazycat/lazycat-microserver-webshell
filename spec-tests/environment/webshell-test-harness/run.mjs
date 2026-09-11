import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createEnvironment } from "./browser.mjs";
import { readConfig, readEnvironment } from "./config.mjs";
import { redactDiagnosticText } from "./artifact-redaction.mjs";
import { prepareFrontend, frontendEnvironment, frontendEvidence, verifyFrontend } from "./frontend-build.mjs";
import { reportStandaloneRunTime } from "./run-timing.mjs";

reportStandaloneRunTime();
const args = process.argv.slice(2);
const caseFile = args[0] && !args[0].startsWith("--") ? path.resolve(args.shift()) : null;
const values = {};
for (let index = 0; index < args.length; index += 2) {
  if (!["--result", "--artifacts-dir", "--timeout", "--url", "--env-file"].includes(args[index]) || !args[index + 1] || values[args[index]] !== undefined) {
    console.error("Invalid or duplicate runner arguments"); process.exit(2);
  }
  values[args[index]] = args[index + 1];
}
if (!caseFile) { console.error("usage: node run-playwright.mjs <scenario.mjs> [--result <file> --artifacts-dir <directory> --timeout <seconds>]"); process.exit(2); }
const timeout = Number(values["--timeout"] || 180);
if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600) { console.error("timeout must be between 1 and 3600 seconds"); process.exit(2); }
const artifactsDir = path.resolve(values["--artifacts-dir"] || path.join(path.dirname(caseFile), "artifacts", randomUUID()));
const options = { artifactsDir, url: values["--url"], envFile: values["--env-file"] };
const started = performance.now();
const result = { status: "failed", steps: [], observations: [], artifacts: artifactsDir };
let environment, timer, config, abort;
const skippedEvents = [];
const interrupted = new Promise((_, reject) => { abort = reject; });
const stop = () => abort(new Error("Scenario interrupted"));
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  await fs.mkdir(artifactsDir, { recursive: true });
  config = await readConfig(options);
  // Legacy modules that consume an environment variable see the same dotenv defaults.
  const defaults = await readEnvironment(options);
  for (const [key, value] of Object.entries(defaults)) if (process.env[key] === undefined) process.env[key] = value;
  const frontend = await prepareFrontend({ manifestPath:process.env.WEBSHELL_TEST_BUILD_MANIFEST });
  Object.assign(process.env,frontendEnvironment(frontend));
  options.frontend = frontend;
  options.staticDir = frontend.staticDir;
  config = await readConfig(options);
  result.frontend = frontendEvidence(frontend);
  const scenario = await import(pathToFileURL(caseFile));
  if (typeof scenario.run !== "function") throw new Error("Scenario must export run(environment)");
  timer = setTimeout(() => abort(new Error(`Scenario exceeded ${timeout} seconds`)), timeout * 1000);
  const execution = async () => {
    environment = await createEnvironment({ ...options, desktopOnly: scenario.desktopOnly, performanceMode: scenario.performanceMode, targetKind: scenario.targetKind, beforeNavigate: scenario.beforeNavigate, serviceWorkers:scenario.serviceWorkers,
      onEvent: (event) => {
        if (["skip", "skipped"].includes(event.status) || String(event.action).includes("-skipped")) skippedEvents.push(event);
      },
    });
    environment.step = async (index, status, message) => {
      const entry = { index, status, ...(message ? { message } : {}) };
      result.steps.push(entry);
      await environment.eventLog({ action: "contract-step", ...entry });
      process.stderr.write(`TEST_STEP ${JSON.stringify(entry)}\n`);
    };
    await environment.open();
    const evidence = await scenario.run(environment);
    environment.assertNoFatalErrors();
    result.observations = evidence?.observations || [];
  };
  await Promise.race([execution(), interrupted]);
  await verifyFrontend(frontend.manifestPath);
  result.status = skippedEvents.length ? "skipped" : "passed";
  if (skippedEvents.length) result.error = `Scenario reported skipped actions: ${skippedEvents.map((event) => event.action).join(", ")}`;
} catch (error) {
  result.error = redactDiagnosticText(error.message || String(error), [config?.username, config?.password]);
} finally {
  clearTimeout(timer);
  try { await environment?.close(); }
  catch (error) { result.status = "failed"; result.error = [result.error, `cleanup: ${error.message}`].filter(Boolean).join("; "); }
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
  result.duration_seconds = Math.round((performance.now() - started) / 10) / 100;
  const serialized = redactDiagnosticText(JSON.stringify(result), [config?.username, config?.password]);
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, "result.json"), `${serialized}\n`);
  if (values["--result"]) await fs.writeFile(values["--result"], `${serialized}\n`);
  process.stdout.write(`${serialized}\n`);
  process.exitCode = result.status === "passed" ? 0 : 1;
}
