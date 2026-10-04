import fs from "node:fs/promises";
import path from "node:path";

export async function verifyAndroidVersion(page, build, directory) {
  if (!/^[a-f0-9]{64}$/.test(build.content_revision || "")) {
    throw new Error("The current LightOS LPK has no verified content revision");
  }
  const allowedAssets = Object.keys(build.files || {}).filter((name) => name.startsWith("runtime/static/assets/"))
    .map((name) => path.posix.basename(name));
  const observed = await page.evaluate(async (allowed) => {
    const revisionResponse = await fetch("/webshell/api/server-revision", { cache: "no-store" });
    if (!revisionResponse.ok) throw new Error(`server revision HTTP ${revisionResponse.status}`);
    const revision = await revisionResponse.json();
    const known = new Set(allowed);
    const main = [...document.scripts].map((script) => script.src)
      .find((value) => /\/assets\/index-[^/]+\.js$/.test(value || ""));
    if (!main || !known.has(new URL(main).pathname.split("/assets/").at(-1))) {
      throw new Error("Android page is not using the current LPK main script");
    }
    const mainPath = new URL(main).pathname;
    const assetBase = mainPath.slice(0, mainPath.lastIndexOf("/assets/") + "/assets/".length);
    const resources = [...new Set(performance.getEntriesByType("resource")
      .map((entry) => new URL(entry.name).pathname)
      .filter((name) => name.startsWith(assetBase) && /\/assets\/[^/]+\.(?:js|css|wasm)$/.test(name) &&
        known.has(name.split("/assets/").at(-1))))];
    const assets = [];
    for (const resource of resources) {
      const response = await fetch(resource, { cache: "no-store" });
      if (!response.ok) throw new Error(`Android asset HTTP ${response.status}: ${resource}`);
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      assets.push({ path: resource, sha256: [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("") });
    }
    return { server_revision: revision.server_revision, main_script: new URL(main).pathname, assets };
  }, allowedAssets);
  if (String(observed.server_revision || "").split(":")[0] !== build.content_revision) {
    throw new Error("Android LightOS service is not running the current worktree LPK");
  }
  let javascript = 0, wasm = 0;
  for (const asset of observed.assets) {
    const relative = `runtime/static/assets/${asset.path.split("/assets/").at(-1)}`;
    if (build.files[relative] !== asset.sha256) {
      throw new Error(`Android LightOS loaded an asset outside the current LPK: ${relative}`);
    }
    if (relative.endsWith(".js")) javascript++;
    if (relative.endsWith(".wasm")) wasm++;
  }
  if (!javascript || !wasm) throw new Error("Android LightOS has not loaded current JavaScript and WASM assets");
  const evidence = { device: "android-emulator", package: "cloud.lazycat.webapk.cloud.lazycat.lightos.entry",
    expected_content_revision: build.content_revision, observed, javascript, wasm };
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "android-version.json"), JSON.stringify(evidence, null, 2));
  return evidence;
}
