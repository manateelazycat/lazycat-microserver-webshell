import { readFrontendAsset } from "./frontend-build.mjs";

const mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

export async function installLocalFrontend(context, config, build, fail, eventLog) {
  const app = new URL("./", config.url);
  const base = `${app.pathname}assets/local-${build.buildDigest.slice(0, 16)}/`;
  const index = (await readFrontendAsset(build, "index.html")).toString("utf8")
    .replaceAll("__LCMD_ASSET_BASE__", base)
    .replace("<head>", `<head><meta name="webshell-test-build" content="${build.buildDigest}">`);
  const headers = { "Cache-Control": "no-store", "X-WebShell-Test-Build": build.buildDigest };
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === app.origin && url.pathname.startsWith(base)
      && response.headers()["x-webshell-test-build"] !== build.buildDigest) {
      fail(`Frontend resource did not come from the current local build: ${url.pathname}`);
    }
  });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    let fromApp = false;
    try {
      const frame = new URL(request.frame().url());
      fromApp = frame.origin === app.origin && frame.pathname === app.pathname;
    } catch {}
    const executable = ["script", "stylesheet"].includes(request.resourceType()) || url.pathname.endsWith(".wasm");
    if (url.origin !== app.origin) {
      if (fromApp && executable) {
        fail(`Remote frontend code is forbidden: ${url.origin}${url.pathname}`);
        return route.abort("failed");
      }
      return route.continue();
    }
    const document = request.resourceType() === "document" && url.pathname === app.pathname;
    let name;
    if (url.pathname.startsWith(base)) name = url.pathname.slice(base.length);
    else if (url.pathname.startsWith(`${app.pathname}assets/`)) name = url.pathname.slice((app.pathname + "assets/").length).split("/").slice(1).join("/");
    else {
      if (fromApp && url.pathname.startsWith("/assets/") && ["script", "stylesheet", "font"].includes(request.resourceType())) name = url.pathname.split("/").slice(3).join("/");
      else if (fromApp && url.pathname.startsWith("/static/")) name = url.pathname.slice("/static/".length);
      else if (fromApp && executable) {
        fail(`Frontend code bypassed the local build: ${url.pathname}`);
        return route.abort("failed");
      }
    }
    if (!document && name === undefined) return route.continue();
    try {
      if (request.method() !== "GET") throw new Error("Unexpected method for local frontend resource");
      if (document) return await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", headers, body: index });
      name = decodeURIComponent(name);
      const body = await readFrontendAsset(build, name);
      const extension = name.slice(name.lastIndexOf("."));
      await route.fulfill({ status: 200, contentType: mime[extension] || "application/octet-stream", headers, body });
      await eventLog({ status: "pass", action: "local-frontend-resource", resource: name, sha256: build.files[name] });
    } catch (error) {
      fail(error.message);
      await eventLog({ status: "error", action: "local-frontend-resource-failed", resource: name || "index.html", message: error.message });
      await route.abort("failed").catch(() => {});
    }
  });
  return {
    async verifyPage(page, required = false) {
      const url = new URL(page.url());
      if (url.origin !== app.origin || url.pathname !== app.pathname) {
        if (required || url.pathname === app.pathname) throw new Error("WebShell navigation bypassed the verified local frontend");
        return;
      }
      const identity = await page.locator('meta[name="webshell-test-build"]').getAttribute("content", { timeout: 10000 });
      if (identity !== build.buildDigest) throw new Error("Page did not load the current local frontend build");
    },
  };
}
