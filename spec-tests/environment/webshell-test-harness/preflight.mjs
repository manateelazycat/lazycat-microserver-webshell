import { readConfig, validateConfig } from "./config.mjs";
import { inspectEnvironment } from "./inspect.mjs";
import { prepareFrontend } from "./frontend-build.mjs";

const options = {};
const flags = { "--url": "url", "--env-file": "envFile" };
try {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    if (!flags[args[index]] || !args[index + 1] || options[flags[args[index]]] !== undefined) throw new Error("Invalid environment parameters");
    options[flags[args[index]]] = args[index + 1];
  }
  const frontend = await prepareFrontend();
  const config = await readConfig({ ...options, staticDir:frontend.staticDir, frontendManifest:frontend.manifestPath });
  await validateConfig(config);
  const availability = await inspectEnvironment(options);
  if (!availability.ocr) throw new Error("tesseract with English OCR data is required for rendered terminal observations");
  process.stdout.write(JSON.stringify({ status: "passed", ...availability }) + "\n");
} catch (error) {
  // Configuration errors are actionable without echoing credentials or target URLs.
  const message = /^(WEBSHELL_TEST_URL|Use an HTTP|tesseract|Invalid environment)/.test(error.message)
    ? error.message : "Environment preparation failed; check the env file, static build, Playwright and browser installation";
  process.stdout.write(JSON.stringify({ status: "failed", error: message }) + "\n");
  process.exitCode = 1;
}
