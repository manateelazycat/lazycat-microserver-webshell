const appShellCachePrefix = "lcmd-webshell-app-shell-";
const assetVersion = "__LCMD_ASSET_VERSION__";
const assetBase = "__LCMD_ASSET_BASE__";
const appShellCacheName = `${appShellCachePrefix}${assetVersion}`;
const terminalCacheName = "lcmd-webshell-terminal-v2";
const appShellAssets = [
  `${assetBase}style.css`,
  `${assetBase}main.js`,
  `${assetBase}ghostty-web.js`,
  `${assetBase}kitty_graphics.js`,
  `${assetBase}ghostty-vt.wasm`,
  `${assetBase}icon-192.png`,
  `${assetBase}icon-512.png`,
  `${assetBase}manifest.webmanifest`,
  `${assetBase}performance_tasks.js`,
  `${assetBase}instances_loader.js`,
  `${assetBase}terminal_cache_v2.js`,
  `${assetBase}terminal_fast_integrity.js`,
  `${assetBase}terminal_replay_controller.js`,
  `${assetBase}terminal_resize_controller.js`,
  `${assetBase}terminal_render_snapshot.js`,
  `${assetBase}terminal_overview_preview.js`,
  `${assetBase}terminal_history_cache.js`,
  `${assetBase}terminal_size_sync.js`,
  `${assetBase}terminal_resize_scheduler.js`,
  `${assetBase}terminal_frame_release_scheduler.js`,
  `${assetBase}terminal_connection_scheduler.js`,
  `${assetBase}terminal_unified_membership.js`,
  `${assetBase}tab_activation_scheduler.js`,
  `${assetBase}terminal_long_screenshot.js`,
  `${assetBase}terminal_queue_connection.js`,
  `${assetBase}terminal_unified_connection.js`,
  `${assetBase}terminal_unified_health.js`,
  `${assetBase}themes.json`,
  `${assetBase}ios_terminal_host.js`,
  `${assetBase}claude_fullscreen_context_menu_adapter.js`,
  `${assetBase}claude_fullscreen_desktop_selection_adapter.js`,
  `${assetBase}claude_fullscreen_touch.js`,
  `${assetBase}claude_fullscreen_touch_adapter.js`,
  `${assetBase}fullscreen_tui_touch.js`,
  `${assetBase}fullscreen_tui_touch_adapter.js`,
  `${assetBase}opencode_fullscreen_touch.js`,
  `${assetBase}opencode_fullscreen_touch_adapter.js`,
  `${assetBase}herdr_fullscreen_touch.js`,
  `${assetBase}herdr_fullscreen_touch_adapter.js`,
  `${assetBase}pi_fullscreen_touch.js`,
  `${assetBase}pi_fullscreen_touch_adapter.js`,
  `${assetBase}vendor/lzc-mobile-bridge-0.0.2.js`,
  `${assetBase}__vite-browser-external-2447137e.js`,
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(appShellCacheName);
    await Promise.all(appShellAssets.map(async (asset) => {
      try {
        const response = await fetch(asset, { cache: "no-cache", credentials: "same-origin" });
        if (response.ok) {
          await cache.put(asset, response);
        }
      } catch (error) {
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name.startsWith(appShellCachePrefix) && name !== appShellCacheName && name !== terminalCacheName) {
        return caches.delete(name);
      }
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

const isNetworkOnly = (url) => (
  url.pathname.endsWith("/service-worker.js")
  || url.pathname.includes("/api/")
  || url.pathname.endsWith("/ws")
  || url.pathname.includes("/__terminal_cache__/")
);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isNetworkOnly(url) || request.mode === "navigate") {
    return;
  }
  if (!url.pathname.includes("/assets/") && !url.pathname.includes("/static/")) {
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(appShellCacheName);
    const cached = await cache.match(request);
    const currentVersionAsset = url.pathname.startsWith(assetBase);
    if (currentVersionAsset && cached) {
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
        return response;
      }
      return cached || response;
    } catch (error) {
      if (cached) {
        return cached;
      }
      throw error;
    }
  })());
});
