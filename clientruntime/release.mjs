import { buildClientRuntime } from "./build.mjs"
import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { resolve, join, dirname } from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const options = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = value.match(/^--(output|platform|arch)=(.+)$/)
  if (!match) throw new Error("Use --output=<directory>, optionally --platform=<system> --arch=<cpu>")
  return [match[1], match[2]]
}))
const output = resolve(options.output || "clientruntime/release")
const moduleRoot = dirname(fileURLToPath(import.meta.url))
const targets = [["linux", "amd64"], ["linux", "arm64"], ["linux", "riscv64"], ["darwin", "amd64"], ["darwin", "arm64"], ["windows", "amd64"], ["windows", "arm64"]]
const selected = targets.filter(([os, arch]) => (!options.platform || os === options.platform) && (!options.arch || arch === options.arch))
if (!selected.length) throw new Error("Unsupported runtime target")
mkdirSync(output, { recursive: true })
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const artifacts = {}
for (const [os, arch] of selected) {
  const folder = buildClientRuntime({ platform: os, arch, outputRoot: join(output, ".build") })
  const metadata = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"))
  const publishing = mkdtempSync(join(output, ".publish-"))
  const file = join(publishing, metadata.binary)
  copyFileSync(join(folder, metadata.binary), file)
  let signing = os === "linux" ? "not-applicable" : "development"
  try {
  // CI signs standalone artifacts before their immutable release hashes are computed.
  if (os === "darwin" && process.env.TERMINAL_MAC_SIGN_IDENTITY) {
    if (process.platform !== "darwin") throw new Error("macOS signing requires a macOS publisher")
    execFileSync("codesign", ["--force", "--options", "runtime", "--entitlements", join(moduleRoot, "runtime.entitlements.plist"), "--timestamp", "--sign", process.env.TERMINAL_MAC_SIGN_IDENTITY, file], { stdio: "inherit" })
    execFileSync("codesign", ["--verify", "--strict", file], { stdio: "inherit" })
    signing = "platform-signed"
  }
  if (os === "windows" && process.env.TERMINAL_WINDOWS_SIGN_TOOL) {
    if (process.env.TERMINAL_REQUIRE_PLATFORM_SIGNATURES === "1" && !process.env.TERMINAL_WINDOWS_VERIFY_TOOL) throw new Error("Formal Windows releases require a signature verification tool")
    execFileSync(process.env.TERMINAL_WINDOWS_SIGN_TOOL, [file], { stdio: "inherit" })
    if (process.env.TERMINAL_WINDOWS_VERIFY_TOOL) execFileSync(process.env.TERMINAL_WINDOWS_VERIFY_TOOL, [file], { stdio: "inherit" })
    signing = "platform-signed"
  }
  if (process.env.TERMINAL_REQUIRE_PLATFORM_SIGNATURES === "1" && signing === "development") throw new Error("Required platform signature missing for " + os + "-" + arch)
  const binary = readFileSync(file)
  const compressed = gzipSync(binary, { level: 9 })
  const binaryHash = hash(binary)
  writeFileSync(join(output, binaryHash + ".gz"), compressed)
  artifacts[os + "-" + arch] = {
    os, arch, binary: metadata.binary, launcher_protocol: 5, channel_protocol: 0, host_protocol: 1,
    terminal_protocol: metadata.protocol, artifact_id: binaryHash,
    download_path: "/api/client-runtime/artifacts/" + binaryHash,
    compression: "gzip", compressed_size: compressed.length, compressed_sha256: hash(compressed),
    binary_size: binary.length, binary_sha256: binaryHash,
    webshell_revision: metadata.webshell_revision, webshell_dirty: metadata.webshell_dirty,
    wasm_sha256: metadata.wasm_sha256, source_snapshot_sha256: process.env.TERMINAL_SOURCE_SNAPSHOT_SHA256 || "", signing,
  }
  } finally { rmSync(publishing, { recursive: true, force: true }) }
}
const releaseID = hash(Buffer.from(JSON.stringify(artifacts)))
for (const artifact of Object.values(artifacts)) artifact.release_id = releaseID
const manifest = { release_id: releaseID, artifacts }
const pending = join(output, "manifest.json.pending")
writeFileSync(pending, JSON.stringify(manifest, null, 2) + "\n")
renameSync(pending, join(output, "manifest.json"))
const raw = Object.values(artifacts).reduce((sum, artifact) => sum + artifact.binary_size, 0)
const compressed = Object.values(artifacts).reduce((sum, artifact) => sum + artifact.compressed_size, 0)
if (compressed > 100_000_000) throw new Error("Compressed runtime release exceeds 100 MB")
console.log(JSON.stringify({ output, release_id: releaseID, targets: selected.length, bytes: raw, gzip_bytes: compressed }))
