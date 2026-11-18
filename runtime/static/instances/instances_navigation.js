const abortError = () => {
  const error = new Error("Instance navigation was cancelled");
  error.name = "AbortError";
  return error;
};

export const normalizeLightOSHomeURL = (value, baseURL) => {
  const homeURL = String(value || "").trim();
  if (!homeURL) {
    throw new Error("LightOS 首页地址不可用。");
  }
  const targetURL = new URL(homeURL, baseURL);
  if (targetURL.protocol !== "http:" && targetURL.protocol !== "https:") {
    throw new Error("LightOS 首页地址协议无效。");
  }
  return targetURL.toString();
};

export const withMobileRemoteDesktopPreference = (value, enabled, baseURL) => {
  const targetURL = new URL(value, baseURL);
  targetURL.searchParams.set("mobile_remote_desktop", enabled ? "1" : "0");
  return targetURL.toString();
};

export function createInstancesNavigation({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseURL = globalThis.location?.href,
  AbortControllerCtor = globalThis.AbortController,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable");
  }
  let disposed = false;
  let generation = 0;
  let homeURL = "";
  let inflight = null;

  const loadHomeURL = () => {
    if (disposed) {
      return Promise.reject(abortError());
    }
    if (homeURL) {
      return Promise.resolve(homeURL);
    }
    if (inflight) {
      return inflight.promise;
    }
    const currentGeneration = ++generation;
    const controller = typeof AbortControllerCtor === "function" ? new AbortControllerCtor() : null;
    const promise = (async () => {
      let response;
      try {
        response = await fetchImpl("./api/lightos-admin-info", {
          cache: "no-store",
          signal: controller?.signal,
        });
      } catch (error) {
        if (error?.name === "AbortError" || controller?.signal?.aborted || disposed) {
          throw abortError();
        }
        throw error;
      }
      const body = await response.text();
      if (!response.ok) {
        throw new Error(body || `无法获取 LightOS 首页地址 (${response.status})`);
      }
      let info;
      try {
        info = JSON.parse(body);
      } catch (error) {
        throw new Error(`LightOS 首页地址响应无效: ${error?.message || "invalid JSON"}`);
      }
      if (disposed || currentGeneration !== generation || controller?.signal?.aborted) {
        throw abortError();
      }
      homeURL = normalizeLightOSHomeURL(info?.home_url, baseURL);
      return homeURL;
    })();
    inflight = { controller, generation: currentGeneration, promise };
    promise.finally(() => {
      if (inflight?.generation === currentGeneration) {
        inflight = null;
      }
    }).catch(() => {});
    return promise;
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      generation += 1;
      inflight?.controller?.abort?.();
      inflight = null;
      homeURL = "";
    },
    loadHomeURL,
    snapshot() {
      return {
        cached: Boolean(homeURL),
        loading: Boolean(inflight),
      };
    },
  };
}
