// Run only as part of the trusted packaging/signing flow, after binary signing
// and before signing the enclosing app. Runtime never repairs a bad checksum.
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const root = path.resolve(process.argv[2] || "")
const file = path.join(root, "manifest.json")
const manifest = JSON.parse(fs.readFileSync(file, "utf8"))
if (!["terminal-core", "terminal-core.exe"].includes(manifest.binary)) throw new Error("Invalid terminal binary")
manifest.unsigned_binary_sha256 ||= manifest.binary_sha256
manifest.binary_sha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(root, manifest.binary)))
  .digest("hex")
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n")
