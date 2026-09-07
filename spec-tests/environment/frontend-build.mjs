import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (data) => createHash("sha256").update(data).digest("hex");

async function fileHashes(directory) {
  const hashes = {};
  async function visit(relative = "") {
    const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) hashes[name] = hash(await fs.readFile(path.join(directory, name)));
      else throw new Error(`Unexpected non-file frontend input: ${name}`);
    }
  }
  await visit();
  return hashes;
}

export async function sourceDigest() {
  const inputs = { static: await fileHashes(path.join(repositoryRoot, "runtime/static")) };
  for (const name of ["package.json", "package-lock.json", "vite.config.js", "tools/verify-vite-build.mjs"]) {
    inputs[name] = hash(await fs.readFile(path.join(repositoryRoot, name)));
  }
  return hash(JSON.stringify(inputs));
}

export async function verifyFrontend(manifestPath) {
  const build = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (build.version !== 1 || build.repositoryRoot !== repositoryRoot || !build.staticDir || !build.files?.["index.html"]) {
    throw new Error("Invalid local frontend build manifest");
  }
  if (await sourceDigest() !== build.sourceDigest) throw new Error("Frontend source changed after building; restart the test run to test the latest code");
  const files = await fileHashes(build.staticDir);
  if (hash(JSON.stringify(files)) !== build.buildDigest) throw new Error("Local frontend snapshot changed or is incomplete; refusing remote fallback");
  return { ...build, manifestPath: path.resolve(manifestPath) };
}

export async function prepareFrontend({ manifestPath, force = false } = {}) {
  if (manifestPath && !force) return verifyFrontend(manifestPath);
  const directory = path.join(repositoryRoot, "spec-tests/.state/frontend", randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const before = await sourceDigest();
  process.stderr.write("Building latest local WebShell frontend...\n");
  try {
    const result = await execute("npm", ["run", "build"], { cwd: repositoryRoot, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    await fs.writeFile(path.join(directory, "build.log"), result.stdout + result.stderr);
  } catch (error) {
    await fs.writeFile(path.join(directory, "build.log"), [error.stdout, error.stderr, error.message].filter(Boolean).join("\n"));
    throw new Error(`Local frontend build failed; tests were not started. See ${path.join(directory, "build.log")}`);
  }
  if (await sourceDigest() !== before) throw new Error("Frontend source changed during the build; restart the test run");
  const staticDir = path.join(directory, "static");
  await fs.cp(path.join(repositoryRoot, "build/runtime/static"), staticDir, { recursive: true });
  const files = await fileHashes(staticDir);
  if (!files["index.html"] || !files[".vite/manifest.json"]) throw new Error("Local frontend build is incomplete");
  const build = { version: 1, repositoryRoot, sourceDigest: before, buildDigest: hash(JSON.stringify(files)), staticDir, files, createdAt: new Date().toISOString() };
  const output = path.join(directory, "frontend.json");
  await fs.writeFile(output, JSON.stringify(build, null, 2));
  const verified = await verifyFrontend(output);
  process.stderr.write(`Local frontend ready: ${verified.buildDigest.slice(0, 16)}\n`);
  return verified;
}

export function frontendEnvironment(build) {
  return { WEBSHELL_TEST_BUILD_MANIFEST: build.manifestPath, WEBSHELL_LOCAL_STATIC_DIR: build.staticDir, WEBSHELL_PRODUCT_STATIC_DIR: build.staticDir };
}

export function frontendEvidence(build) {
  return { sourceDigest: build.sourceDigest, buildDigest: build.buildDigest, manifestPath: build.manifestPath };
}

export async function readFrontendAsset(build, name) {
  if (!Object.hasOwn(build.files, name)) throw new Error(`Missing current local frontend resource: ${name}`);
  const file = path.resolve(build.staticDir, name);
  if (!file.startsWith(build.staticDir + path.sep)) throw new Error("Invalid frontend resource path");
  const data = await fs.readFile(file);
  if (hash(data) !== build.files[name]) throw new Error(`Local frontend resource changed: ${name}`);
  return data;
}
