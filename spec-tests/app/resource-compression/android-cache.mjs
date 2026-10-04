import fs from "node:fs/promises";
import path from "node:path";
import { openAndroidTestTab } from "../../environment/webshell-test-harness/android-workspace.mjs";

export async function run({ device, page, selector, directory }) {
  const tab = await openAndroidTestTab(page, { selector, directory });
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });
  try {
    const initial = await page.evaluate(async () => {
      const resource = [...document.scripts].map((item) => item.src)
        .find((value) => /\/assets\/index-[^/]+\.js$/.test(value || ""));
      if (!resource) throw new Error("Android LightOS has no versioned main script");
      const fresh = await fetch(resource, { cache: "reload" });
      await fresh.arrayBuffer();
      const entry = performance.getEntriesByName(resource).at(-1);
      return { resource, firstStatus: fresh.status, cacheControl: fresh.headers.get("cache-control"),
        lastModified: fresh.headers.get("last-modified"), firstTransferSize: entry?.transferSize || 0 };
    });
    if (!initial.lastModified) throw new Error("Versioned Android asset has no Last-Modified value");
    await page.send("Page.reload", { ignoreCache: false }, 30_000);
    await page.waitFor((pane) => document.readyState === "complete" &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.paneId === pane &&
      document.querySelector(".terminal-pane.active .pane-shell")?.dataset.hasPresentedFrame === "true",
    [tab.paneID], 60_000);
    await tab.assertOwned();
    const reopened = await page.evaluate(async (resource, lastModified) => {
      const reloadEntry = performance.getEntriesByName(resource).at(-1);
      const reused = await fetch(resource, { cache: "default" });
      await reused.arrayBuffer();
      const reusedEntry = performance.getEntriesByName(resource).at(-1);
      const checked = await fetch(resource, { cache: "no-store",
        headers: { "If-Modified-Since": lastModified } });
      const checkedBytes = (await checked.arrayBuffer()).byteLength;
      const current = new URL(resource);
      const missing = new URL(resource);
      missing.pathname = missing.pathname.slice(0, missing.pathname.lastIndexOf("/")) +
        `/missing-${Date.now()}.js`;
      const stale = new URL(resource);
      stale.pathname = stale.pathname.replace(/\/assets\/[^/]+\/assets\//,
        `/assets/content-stale-${Date.now()}/assets/`);
      const absent = await fetch(missing.toString(), { cache: "no-store" });
      await absent.arrayBuffer();
      const expired = await fetch(stale.toString(), { cache: "no-store" });
      await expired.arrayBuffer();
      const html = await fetch("/webshell/", { cache: "no-store" });
      await html.arrayBuffer();
      return {
        assetPath: current.pathname,
        repeatStatus: reused.status,
        reloadTransferSize: reloadEntry?.transferSize ?? -1,
        repeatTransferSize: reusedEntry?.transferSize ?? -1,
        revalidationStatus: checked.status, revalidationBytes: checkedBytes,
        htmlStatus: html.status, htmlCacheControl: html.headers.get("cache-control"),
        missingStatus: absent.status, missingCacheControl: absent.headers.get("cache-control"),
        staleStatus: expired.status, staleCacheControl: expired.headers.get("cache-control"),
      };
    }, initial.resource, initial.lastModified);
    const evidence = { ...initial, ...reopened };
    const longLived = /public/i.test(evidence.cacheControl || "") &&
      /immutable/i.test(evidence.cacheControl || "") &&
      /max-age=(\d+)/i.test(evidence.cacheControl || "") &&
      Number(evidence.cacheControl.match(/max-age=(\d+)/i)[1]) >= 86400;
    const unsafeFailureCache = [evidence.missingCacheControl, evidence.staleCacheControl]
      .some((value) => /immutable|max-age=(?:[1-9]\d{5,})/i.test(value || ""));
    if (evidence.firstStatus !== 200 || evidence.repeatStatus !== 200 || !longLived ||
        evidence.firstTransferSize < 1 || evidence.reloadTransferSize !== 0 ||
        evidence.repeatTransferSize !== 0 ||
        evidence.revalidationStatus !== 304 || evidence.revalidationBytes !== 0 ||
        evidence.htmlStatus !== 200 || !/no-store/i.test(evidence.htmlCacheControl || "") ||
        evidence.missingStatus < 400 || evidence.staleStatus < 400 || unsafeFailureCache) {
      throw new Error(`Android resource cache behavior differs from the AC: ${JSON.stringify(evidence)}`);
    }
    await fs.mkdir(directory, { recursive: true });
    const result = path.join(directory, "cache-observation.json");
    await fs.writeFile(result, JSON.stringify(evidence, null, 2));
    const screenshot = path.join(directory, "android-terminal-after-cache-check.png");
    await device.screenshot(screenshot);
    return { observations: [
      "Android WebView reopened the same version with the main script from its fresh browser cache while HTML remained no-store",
      "Last-Modified validation returned 304 without a body; missing and stale asset paths were not cacheable successes",
    ], evidence: [result, screenshot] };
  } finally {
    await page.send("Network.setExtraHTTPHeaders", { headers: {} }).catch(() => {});
    await tab.close();
  }
}
