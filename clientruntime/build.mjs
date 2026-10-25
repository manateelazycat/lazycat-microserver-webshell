import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

const root = dirname(fileURLToPath(import.meta.url))
const webshell = resolve(root, "..")
const git = (...args) => execFileSync("git", ["-C", webshell, ...args], { encoding: "utf8" }).trim()

export function parseBuildOptions(args) {
  const options = Object.fromEntries(
    args.map(value => {
      if (!value.startsWith("--") || !value.includes("=")) throw new Error("Use --platform=<target> and --arch=<target> only for packaging")
      return value.slice(2).split("=")
    })
  )
  for (const key of Object.keys(options)) if (!["platform", "arch", "json"].includes(key)) throw new Error("Unknown build option: " + key)
  return options
}

// The host supplies packaging metadata and output location. Runtime compilation
// has no dependency on the desktop repository or its network SDK.
export function buildClientRuntime({
  platform = process.env.BUILD_PLATFORM || process.platform,
  arch = process.env.BUILD_ARCH || process.arch,
  outputRoot = join(root, "output"),
  bootstrapGo,
  metadata = {},
} = {}) {
  const goos = { linux: "linux", darwin: "darwin", win32: "windows", windows: "windows" }[platform]
  const goarch = { x64: "amd64", amd64: "amd64", arm64: "arm64", ia32: "386" }[arch]
  if (!goos || !goarch) throw new Error("Unsupported terminal target: " + platform + "/" + arch)
  const nodePlatform = goos === "windows" ? "win32" : goos
  const nodeArch = goarch === "amd64" ? "x64" : goarch === "386" ? "ia32" : goarch
  if (resolve(git("rev-parse", "--show-toplevel")) !== webshell) throw new Error("Initialize the Webshell repository before building")
  const sourceRevision = git("rev-parse", "HEAD")
  if (process.env.CI && git("status", "--porcelain")) throw new Error("CI terminal sources must be committed")
  const output = join(outputRoot, nodePlatform + "-" + nodeArch)
  mkdirSync(output, { recursive: true })
  const name = goos === "windows" ? "terminal-core.exe" : "terminal-core"
  const temporary = join(output, name + ".building-" + process.pid)
  // Bootstrap with the existing host Go, outside the terminal's Go 1.26 module.
  const buildtools = join(root, "buildtools")
  const bootstrapVersion = readFileSync(join(buildtools, "go.mod"), "utf8").match(/^go\s+(\S+)/m)?.[1]
  const hostOS = { linux: "linux", darwin: "darwin", win32: "windows" }[process.platform]
  const hostArch = { x64: "amd64", arm64: "arm64", ia32: "386" }[process.arch]
  const goExecutable = process.platform === "win32" ? "go.exe" : "go"
  const selectedBootstrapGo = bootstrapGo || [join(homedir(), "golang", bootstrapVersion || "", "bin", goExecutable)].find(candidate => existsSync(candidate)) || "go"
  const bootstrapEnvironment = { ...process.env, GOTOOLCHAIN: "local", GOWORK: "off", GOROOT: "", CGO_ENABLED: "0" }
  delete bootstrapEnvironment.GOOS
  delete bootstrapEnvironment.GOARCH
  const goCommand = execFileSync(selectedBootstrapGo, ["run", "-mod=readonly", "./cmd/prepare"], {
    cwd: buildtools,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: bootstrapEnvironment,
  }).trim()
  console.error("Terminal Go toolchain: " + goCommand)
  const buildEnvironment = {
    ...process.env,
    GOROOT: "",
    GOTOOLCHAIN: "local",
    GOWORK: "off",
    CGO_ENABLED: "0",
    GOOS: goos,
    GOARCH: goarch,
    GOPRIVATE: process.env.GOPRIVATE || "gitee.com/linakesi,github.com/jeesk",
  }
  const sshKey = [process.env.SSH_KEY, join(homedir(), ".ssh", "jenkins.key"), join(homedir(), ".ssh", "id_rsa"), join(homedir(), ".ssh", "id_ed25519")].find(
    candidate => candidate && existsSync(candidate)
  )
  if (!buildEnvironment.GIT_SSH_COMMAND && sshKey) {
    buildEnvironment.GIT_SSH_COMMAND = "ssh -i '" + sshKey.replaceAll("'", "'\\''") + "'"
  }
  function writeJSONAtomic(file, value) {
    const pending = file + ".building-" + process.pid
    try {
      writeFileSync(pending, JSON.stringify(value, null, 2) + "\n")
      renameSync(pending, file)
    } finally {
      rmSync(pending, { force: true })
    }
  }
  try {
    execFileSync(goCommand, ["build", "-mod=readonly", "-trimpath", "-buildvcs=false", "-ldflags=-s -w", "-o", temporary, "."], {
      cwd: root,
      stdio: "inherit",
      env: buildEnvironment,
    })
    const wasm = readFileSync(join(webshell, "runtime/static/ghostty-vt.wasm"))
    const source = readFileSync(join(webshell, "core/agent.go"), "utf8")
    const protocol = source.match(/AgentProtocolVersion\s*=\s*"([^"]+)"/)?.[1]
    if (!protocol) throw new Error("Terminal protocol version is missing")
    const hash = bytes => createHash("sha256").update(bytes).digest("hex")
    const binaryHash = hash(readFileSync(temporary))
    const artifactDir = join(output, "versions", binaryHash)
    mkdirSync(artifactDir, { recursive: true })
    const manifest = {
      ...metadata,
      platform: nodePlatform,
      arch: nodeArch,
      binary: name,
      protocol,
      webshell_revision: sourceRevision,
      webshell_dirty: Boolean(git("status", "--porcelain")),
      wasm_sha256: hash(wasm),
      binary_sha256: binaryHash,
    }
    const binaryPath = join(artifactDir, name)
    if (existsSync(binaryPath)) {
      if (hash(readFileSync(binaryPath)) !== binaryHash) throw new Error("Existing terminal artifact checksum mismatch")
    } else {
      renameSync(temporary, binaryPath)
    }
    writeJSONAtomic(join(artifactDir, "manifest.json"), manifest)
    writeJSONAtomic(join(output, "current.json"), { version: binaryHash })
    return artifactDir
  } finally {
    rmSync(temporary, { force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseBuildOptions(process.argv.slice(2))
  const artifact = buildClientRuntime(options)
  console.log(options.json === "true" ? JSON.stringify({ artifact_dir: artifact }) : "Terminal core built: " + artifact)
}
