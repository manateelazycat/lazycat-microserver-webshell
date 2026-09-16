import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const outputRoot = fileURLToPath(new URL("../build/runtime/static/", import.meta.url));
const entries = await readdir(outputRoot, { recursive: true, withFileTypes: true });
let count = 0;
let originalBytes = 0;
let compressedBytes = 0;

// HTML contains a runtime asset-base placeholder and is compressed by the
// provider after substitution. Fonts and images keep their existing encoding.
for (const entry of entries) {
  if (!entry.isFile() || !/\.(js|css|wasm|json|svg|webmanifest)$/.test(entry.name)) continue;
  const filename = path.join(entry.parentPath, entry.name);
  const original = await readFile(filename);
  const compressed = gzipSync(original, { level: 9 });
  if (compressed.length >= original.length) continue;
  await writeFile(`${filename}.gz`, compressed);
  count += 1;
  originalBytes += original.length;
  compressedBytes += compressed.length;
}

process.stdout.write(`Precompressed ${count} static assets: ${originalBytes} -> ${compressedBytes} bytes\n`);
