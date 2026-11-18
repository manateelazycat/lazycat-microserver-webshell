import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { resolve, join } from "node:path"
import { gunzipSync } from "node:zlib"

const args = process.argv.slice(2)
const outputOption = args.find(value => value.startsWith("--output="))
if (!outputOption) throw new Error("Use --output=<directory> followed by signed platform release directories")
const versionOption = args.find(value => value.startsWith("--version="))
const version = versionOption?.slice("--version=".length)
if (version !== undefined && !/^[0-9A-Za-z._+-]{1,128}$/.test(version)) throw new Error("Invalid LPK version")
const inputs = args.filter(value => !value.startsWith("--"))
if (!inputs.length) throw new Error("No platform releases supplied")
const output = resolve(outputOption.slice("--output=".length))
const targets = ["linux-amd64", "linux-arm64", "linux-riscv64", "darwin-amd64", "darwin-arm64", "windows-amd64", "windows-arm64"]
const collected = new Map()
const digest = bytes => createHash("sha256").update(bytes).digest("hex")
mkdirSync(output, { recursive: true })
for (const input of inputs) {
  const root = resolve(input)
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))
  for (const [target, artifact] of Object.entries(manifest.artifacts)) {
    if (!targets.includes(target) || collected.has(target) || !/^[a-f0-9]{64}$/.test(artifact.artifact_id)) throw new Error("Duplicate or unsupported target: " + target)
    if (artifact.compression !== "gzip" || artifact.binary !== (artifact.os === "windows" ? "terminal-core.exe" : "terminal-core") || artifact.download_path !== "/api/client-runtime/artifacts/" + artifact.artifact_id) throw new Error("Invalid runtime manifest: " + target)
    if (!/^[a-f0-9]{64}$/.test(artifact.wasm_sha256)) throw new Error("Runtime WASM source digest missing: " + target)
    if ((process.env.CI || process.env.TERMINAL_REQUIRE_PLATFORM_SIGNATURES === "1") && artifact.webshell_dirty !== false) throw new Error("Publish only committed runtime sources: " + target)
    const compressed = readFileSync(join(root, artifact.artifact_id + ".gz"))
    if (compressed.length !== artifact.compressed_size || digest(compressed) !== artifact.compressed_sha256 || artifact.binary_size > 256 * 1024 * 1024) throw new Error("Invalid compressed runtime: " + target)
    const binary = gunzipSync(compressed, { maxOutputLength: artifact.binary_size })
    if (binary.length !== artifact.binary_size || digest(binary) !== artifact.binary_sha256 || artifact.artifact_id !== artifact.binary_sha256 || artifact.os + "-" + artifact.arch !== target || artifact.channel_protocol !== 0 || artifact.launcher_protocol !== 5) throw new Error("Invalid runtime: " + target)
    if (process.env.TERMINAL_REQUIRE_PLATFORM_SIGNATURES === "1" && artifact.os !== "linux" && artifact.signing !== "platform-signed") throw new Error("Missing platform signature: " + target)
    const { release_id: ignored, version: inputVersion, ...metadata } = artifact
    if (version !== undefined || inputVersion !== undefined) metadata.version = version ?? inputVersion
    collected.set(target, metadata)
    if (root !== output) copyFileSync(join(root, artifact.artifact_id + ".gz"), join(output, artifact.artifact_id + ".gz"))
  }
}
if (collected.size !== targets.length) throw new Error("A release must include all seven targets")
const artifacts = Object.fromEntries(targets.map(target => [target, collected.get(target)]))
if (new Set(Object.values(artifacts).map(item => item.terminal_protocol)).size !== 1 || new Set(Object.values(artifacts).map(item => item.webshell_revision)).size !== 1) throw new Error("Mixed runtime source or protocol versions")
if (new Set(Object.values(artifacts).map(item => item.wasm_sha256)).size !== 1 || new Set(Object.values(artifacts).map(item => item.source_snapshot_sha256 || "")).size !== 1) throw new Error("Mixed runtime WASM or source snapshots")
if (new Set(Object.values(artifacts).map(item => item.version || "")).size !== 1) throw new Error("Mixed runtime LPK versions")
const compressed = Object.values(artifacts).reduce((sum, item) => sum + item.compressed_size, 0)
if (compressed > 100_000_000) throw new Error("Compressed runtime release exceeds 100 MB")
const releaseID = digest(Buffer.from(JSON.stringify(artifacts)))
for (const artifact of Object.values(artifacts)) artifact.release_id = releaseID
const pending = join(output, "manifest.json.pending")
writeFileSync(pending, JSON.stringify({ version: Object.values(artifacts)[0].version, release_id: releaseID, artifacts }, null, 2) + "\n")
renameSync(pending, join(output, "manifest.json"))
console.log(JSON.stringify({ targets: targets.length, gzip_bytes: compressed, release_id: releaseID }))
