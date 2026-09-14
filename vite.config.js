import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const assetBasePlaceholder = "__LCMD_ASSET_BASE__";
const sourceRoot = fileURLToPath(new URL("./runtime/static/", import.meta.url));
const outputRoot = fileURLToPath(new URL("./build/runtime/static/", import.meta.url));

const sourceAsset = (relativePath) => readFileSync(new URL(`./runtime/static/${relativePath}`, import.meta.url));

const resolveSourceAssetBase = {
  name: "lcmd-resolve-source-asset-base",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return html.replaceAll(assetBasePlaceholder, "./");
    },
  },
};

const restoreRuntimeAssetBase = {
  name: "lcmd-restore-runtime-asset-base",
  transformIndexHtml: {
    order: "post",
    handler(html) {
      const transformed = html.replaceAll('="./assets/', `="${assetBasePlaceholder}assets/`);
      if (!transformed.includes(assetBasePlaceholder)) {
        throw new Error("Vite index does not contain versioned WebShell asset references");
      }
      return transformed;
    },
  },
};

const emitRuntimeSupportAssets = {
  name: "lcmd-emit-runtime-support-assets",
  generateBundle() {
    for (const fileName of [
      "app/bootstrap/legacy_service_worker_retirement.js",
      "ghostty-web.LICENSE",
    ]) {
      this.emitFile({
        type: "asset",
        fileName,
        source: sourceAsset(fileName),
      });
    }
  },
};

export default defineConfig({
  root: sourceRoot,
  base: "./",
  publicDir: false,
  worker: { format: "es" },
  plugins: [resolveSourceAssetBase, restoreRuntimeAssetBase, emitRuntimeSupportAssets],
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    manifest: true,
    chunkSizeWarningLimit: 2500,
  },
});
