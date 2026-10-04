import fs from "node:fs/promises";
import path from "node:path";

function packagedAsset(build, pattern) {
  const entry = Object.entries(build.files || {}).find(([name]) => pattern.test(name));
  if (!entry) throw new Error(`The current LightOS LPK lacks a resource matching ${pattern}`);
  return { file: entry[0], sha256: entry[1], basename: path.posix.basename(entry[0]) };
}

export async function run({ device, page, build, directory }) {
  const index = packagedAsset(build, /runtime\/static\/assets\/index-[^/]+\.js$/);
  const worker = packagedAsset(build, /runtime\/static\/assets\/global-backend-worker-[^/]+\.js$/);
  const style = packagedAsset(build, /runtime\/static\/assets\/style-[^/]+\.css$/);
  const wasm = packagedAsset(build, /runtime\/static\/assets\/ghostty-vt-[^/]+\.wasm$/);
  const base = await page.evaluate(() => {
    const script = [...document.scripts].find((item) => /\/assets\/index-[^/]+\.js$/.test(item.src || ""));
    if (!script) throw new Error("Android LightOS has no current bundled script");
    const url = new URL(script.src), position = url.pathname.lastIndexOf("/assets/");
    return url.origin + url.pathname.slice(0, position + "/assets/".length);
  });
  const resources = [
    { name: "html", url: new URL("/webshell/", base).toString(), sha256: null },
    ...[index, worker, style, wasm].map((asset) => ({ name: asset.file,
      url: base + asset.basename, sha256: asset.sha256 })),
  ];
  const fetchResources = async () => page.evaluate(async (items) => {
    const output = [];
    for (const item of items) {
      const response = await fetch(item.url, { cache: "no-store" });
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const entry = performance.getEntriesByName(item.url).at(-1);
      output.push({ name: item.name, status: response.status,
        encoding: response.headers.get("content-encoding"),
        vary: response.headers.get("vary"),
        contentType: response.headers.get("content-type"),
        contentLength: Number(response.headers.get("content-length") || 0),
        decodedBytes: bytes.byteLength,
        encodedBytes: Number(entry?.encodedBodySize || 0),
        sha256: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("") });
    }
    return output;
  }, resources);
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  try {
    await page.send("Network.setExtraHTTPHeaders", { headers: { "Accept-Encoding": "gzip" } });
    const compressed = await fetchResources();
    for (const item of compressed) {
      const expected = resources.find((value) => value.name === item.name);
      const rawBytes = item.contentLength || item.encodedBytes;
      if (item.status !== 200 || item.encoding !== "gzip" ||
          !/Accept-Encoding/i.test(item.vary || "") ||
          rawBytes < 1 || rawBytes >= item.decodedBytes ||
          (expected.sha256 && expected.sha256 !== item.sha256)) {
        throw new Error(`Android gzip delivery is invalid for ${item.name}: ${JSON.stringify(item)}`);
      }
      if (item.name === wasm.file && !/application\/wasm/i.test(item.contentType || "")) {
        throw new Error("Android WASM lost its application/wasm content type");
      }
    }
    await page.send("Network.setExtraHTTPHeaders", { headers: { "Accept-Encoding": "identity" } });
    const identity = await fetchResources();
    for (const item of identity) {
      const zipped = compressed.find((value) => value.name === item.name);
      if (item.status !== 200 || item.encoding || item.decodedBytes !== zipped.decodedBytes ||
          item.sha256 !== zipped.sha256) {
        throw new Error(`Android identity delivery differs from gzip content for ${item.name}`);
      }
    }
    await fs.mkdir(directory, { recursive: true });
    const evidence = path.join(directory, "compression-observation.json");
    await fs.writeFile(evidence, JSON.stringify({ compressed, identity }, null, 2));
    const screen = path.join(directory, "android-terminal-after-resource-check.png");
    await device.screenshot(screen);
    return { observations: [
      "Android WebView received gzip HTML, JavaScript, Worker, CSS and WASM with smaller wire bodies and Vary headers",
      "Explicit identity requests returned equivalent uncompressed bodies; decoded assets matched the current LPK",
    ], evidence: [screen, evidence] };
  } finally {
    await page.send("Network.setExtraHTTPHeaders", { headers: {} }).catch(() => {});
    await page.send("Network.setCacheDisabled", { cacheDisabled: false }).catch(() => {});
  }
}
