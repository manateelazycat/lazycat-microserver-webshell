import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

// Keep the current local frontend routes; allow real Worker lifecycle operations.
export const serviceWorkers = "allow";

const staticRoot = String(process.env.WEBSHELL_PRODUCT_STATIC_DIR || process.env.WEBSHELL_LOCAL_STATIC_DIR || "").trim();
if (!staticRoot) {
  throw new Error("app/service-worker-retirement requires WEBSHELL_LOCAL_STATIC_DIR pointing to the product build static directory");
}

const legacyWorkerSource = `
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
`;

const retirementWorkerSource = await readFile(
  path.join(staticRoot, "app/bootstrap/legacy_service_worker_retirement.js"),
  "utf8",
);

const runtimeIndexSource = await readFile(path.join(staticRoot, "index.html"), "utf8");

const legacyWorkerUpdateMatch = runtimeIndexSource.match(
  /<script\s+data-legacy-service-worker-update>([\s\S]*?)<\/script>/,
);
if (!legacyWorkerUpdateMatch) {
  throw new Error("runtime index is missing the legacy Service Worker update trigger");
}
const legacyWorkerUpdateSource = legacyWorkerUpdateMatch[1];

const legacyCacheNames = [
  "lcmd-webshell-app-shell-upgrade-test",
  "lcmd-webshell-terminal-v2",
];

const serviceWorkerState = (page) => page.evaluate(async () => ({
  controlled: Boolean(navigator.serviceWorker.controller),
  registrations: (await navigator.serviceWorker.getRegistrations()).map((registration) => ({
    scope: registration.scope,
    scriptURL: registration.active?.scriptURL
      || registration.waiting?.scriptURL
      || registration.installing?.scriptURL
      || "",
  })),
  caches: await caches.keys(),
}));

const createUpgradeFixture = async () => {
  let workerPhase = "legacy";
  let documentRequests = 0;
  let workerRequests = 0;
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (pathname === "/service-worker.js") {
      workerRequests += 1;
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
      });
      response.end(workerPhase === "legacy" ? legacyWorkerSource : retirementWorkerSource);
      return;
    }
    if (pathname === "/") {
      documentRequests += 1;
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script data-legacy-service-worker-update>${legacyWorkerUpdateSource}</script>
    <title>Worker retirement fixture</title>
  </head>
  <body><main id="fixture-ready">ready</main></body>
</html>`);
      return;
    }
    response.writeHead(404, { "Cache-Control": "no-store" });
    response.end("not found");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("upgrade fixture did not bind a TCP port");
  }
  return {
    url: `http://127.0.0.1:${address.port}/`,
    workerURL: `http://127.0.0.1:${address.port}/service-worker.js`,
    retire() {
      workerPhase = "retirement";
    },
    snapshot() {
      return { documentRequests, workerRequests, workerPhase };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const waitForTerminal = async (page) => {
  await page.waitForFunction(() => {
    const shell = document.querySelector(".terminal-pane.active .pane-shell");
    const canvas = document.querySelector(".terminal-pane.active .terminal-host canvas:not(.terminal-frame-hold)");
    return shell?.dataset.renderReady === "true"
      && shell.dataset.hasPresentedFrame === "true"
      && canvas instanceof HTMLCanvasElement
      && canvas.width > 0
      && canvas.height > 0;
  }, null, { timeout: 60_000 });
};

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  // The fixture and the WebShell pages use the same freshly built local assets.
  if (!config.productStaticDir) {
    throw new Error("WEBSHELL_PRODUCT_STATIC_DIR is required because this scenario verifies the product build's Service Worker lifecycle");
  }

  const { desktop, mobile } = states;
  const desktopURL = desktop.page.url();
  const mobileURL = mobile.page.url();
  const fixture = await createUpgradeFixture();
  let result = null;
  try {
    await desktop.page.goto(fixture.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await desktop.page.waitForSelector("#fixture-ready");
    await desktop.page.evaluate(async ({ cacheNames }) => {
      await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("legacy worker did not claim the page")), 10_000);
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        await cache.put("/__service_worker_retirement_probe__", new Response("legacy"));
      }
    }, { cacheNames: legacyCacheNames });

    const before = await serviceWorkerState(desktop.page);
    if (!before.controlled || !legacyCacheNames.every((name) => before.caches.includes(name))) {
      throw new Error(`legacy worker setup failed: ${JSON.stringify(before)}`);
    }

    fixture.retire();
    const beforeTrigger = fixture.snapshot();
    let mainFrameNavigations = 0;
    const onNavigation = (frame) => {
      if (frame === desktop.page.mainFrame()) mainFrameNavigations += 1;
    };
    desktop.page.on("framenavigated", onNavigation);
    await desktop.page.goto(`${fixture.url}?retire=1`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    }).catch((error) => {
      if (!String(error?.message || error).includes("ERR_ABORTED")) throw error;
    });
    await desktop.page.waitForFunction(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const names = await caches.keys();
      return !navigator.serviceWorker.controller
        && registrations.length === 0
        && !names.some((name) => name === "lcmd-webshell-terminal-v2" || name.startsWith("lcmd-webshell-app-shell-"));
    }, null, { timeout: 30_000 });
    await desktop.page.waitForTimeout(1_500);
    desktop.page.off("framenavigated", onNavigation);

    const after = await serviceWorkerState(desktop.page);
    const fixtureAfterRetirement = fixture.snapshot();
    const retirementNavigations = mainFrameNavigations - 1;
    await mobile.page.goto(fixture.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const cleanMobile = await serviceWorkerState(mobile.page);
    await mobile.page.waitForTimeout(1_500);
    const fixtureAfterCleanVisit = fixture.snapshot();
    if (retirementNavigations !== 1) {
      throw new Error(`retirement navigation count = ${retirementNavigations}, want 1 after one user navigation`);
    }
    if (fixtureAfterRetirement.documentRequests - beforeTrigger.documentRequests !== 2) {
      throw new Error(`retirement document request count is unexpected: ${JSON.stringify({ beforeTrigger, fixtureAfterRetirement })}`);
    }
    if (fixtureAfterRetirement.workerRequests - beforeTrigger.workerRequests !== 1) {
      throw new Error(`inline trigger did not perform exactly one worker update: ${JSON.stringify({ beforeTrigger, fixtureAfterRetirement })}`);
    }
    if (after.controlled || after.registrations.length > 0 || after.caches.some((name) => legacyCacheNames.includes(name))) {
      throw new Error(`legacy service worker state remained: ${JSON.stringify(after)}`);
    }
    if (cleanMobile.controlled || cleanMobile.registrations.length > 0) {
      throw new Error(`clean browser unexpectedly registered a worker: ${JSON.stringify(cleanMobile)}`);
    }
    if (fixtureAfterCleanVisit.workerRequests !== fixtureAfterRetirement.workerRequests) {
      throw new Error(`clean browser requested retirement worker: ${JSON.stringify({ fixtureAfterRetirement, fixtureAfterCleanVisit })}`);
    }
    if (fixtureAfterCleanVisit.documentRequests - fixtureAfterRetirement.documentRequests !== 1) {
      throw new Error(`clean browser performed an extra navigation: ${JSON.stringify({ fixtureAfterRetirement, fixtureAfterCleanVisit })}`);
    }
    result = {
      workerURL: fixture.workerURL,
      mainFrameNavigations,
      retirementNavigations,
      before,
      after,
      cleanMobile,
      beforeTrigger,
      fixtureAfterRetirement,
      fixtureAfterCleanVisit,
    };
  } finally {
    await Promise.all([
      desktop.page.goto(desktopURL, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {}),
      mobile.page.goto(mobileURL, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {}),
    ]);
    await fixture.close().catch(() => {});
  }

  await waitForTerminal(desktop.page);
  await waitForTerminal(mobile.page);
  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "service-worker-retirement-real-environment",
    ...result,
  });
}
