// Real Provider HTTP checks in an isolated data directory; no mocked backend.
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { prepareFrontend, verifyFrontend, frontendEvidence, repositoryRoot } from "./frontend-build.mjs";

const execute = promisify(execFile);
const directory = path.join(repositoryRoot, "spec-tests/artifacts/default-history", randomUUID());
await fs.mkdir(path.join(directory, "runtime"), { recursive: true });
const result = { status: "failed", environment: "local current Provider HTTP API; isolated settings; not LPK acceptance", observations: [] };
let child;
let exited = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const frontend = await prepareFrontend();
  result.frontend = frontendEvidence(frontend);
  await fs.symlink(frontend.staticDir, path.join(directory, "runtime/static"), "dir");
  await fs.symlink(path.join(repositoryRoot, "runtime/fonts"), path.join(directory, "runtime/fonts"), "dir");
  const binary = path.join(directory, "webshell");
  await execute("go", ["build", "-o", binary, "."], { cwd: repositoryRoot, timeout: 180000 });
  result.backendSha256 = createHash("sha256").update(await fs.readFile(binary)).digest("hex");
  const log = await fs.open(path.join(directory, "server.log"), "w");
  child = spawn(binary, [], { cwd: directory, env: { ...process.env, WEBSHELL_FONT_DIR: path.join(directory, "settings") }, stdio: ["ignore", log.fd, log.fd] });
  child.once("exit", () => { exited = true; });
  await log.close();
  let revision;
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error("Isolated Provider could not start; check port 8080 and server.log");
    try {
      revision = await (await fetch("http://127.0.0.1:8080/api/server-revision", { signal: AbortSignal.timeout(500) })).json();
      if (String(revision.server_revision).includes(`:${child.pid}:assets=`)) break;
      throw new Error("Port 8080 belongs to a different process");
    } catch (error) {
      if (error.message.includes("different process")) throw error;
      await delay(100);
    }
  }
  if (!String(revision?.server_revision).includes(`:${child.pid}:assets=`)) throw new Error("Could not verify isolated Provider identity");
  const read = async () => (await (await fetch("http://127.0.0.1:8080/api/settings", { signal: AbortSignal.timeout(5000) })).json()).terminal_scrollback;
  const write = async value => {
    const response = await fetch("http://127.0.0.1:8080/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terminal_scrollback: value }), signal: AbortSignal.timeout(5000) });
    result.observations.push({ action: "write", value, status: response.status });
    return response.status;
  };
  result.default = await read();
  result.observations.push({ action: "default", value: result.default });
  const failures = [];
  if (result.default !== 5000) failures.push(`Default is ${result.default}; expected 5000`);
  for (const value of [2000, 100000, 100, 10000]) {
    if (await write(value) !== 200 || await read() !== value) failures.push(`Explicit ${value} did not persist`);
  }
  for (const value of [99, 100001]) if (await write(value) !== 400) failures.push(`Out-of-range ${value} accepted`);
  if (await read() !== 10000) failures.push("Rejected update changed existing setting");
  await verifyFrontend(frontend.manifestPath);
  if (failures.length) throw new Error(failures.join("; "));
  result.status = "passed";
} catch (error) {
  result.error = error.message;
} finally {
  if (child && !exited) {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(5000)]);
    if (!exited) child.kill("SIGKILL");
  }
  await fs.writeFile(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, report: path.join(directory, "result.json") }));
  process.exitCode = result.status === "passed" ? 0 : 1;
}
