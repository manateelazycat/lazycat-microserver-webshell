(() => {
  const frameID = "lightos-catlink-provider-frame";
  let adminInfoPromise = null;
  let activeName = "";

  const readJSONSafe = async (response) => {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  };

  const loadAdminInfo = async () => {
    if (!adminInfoPromise) {
      adminInfoPromise = fetch("./api/lightos-admin-info", { cache: "no-store" }).then(async (response) => {
        const data = await readJSONSafe(response);
        if (!response.ok) {
          const message =
            (typeof data?.error === "string" && data.error) ||
            (typeof data?.message === "string" && data.message) ||
            `LightOS admin info failed (${response.status})`;
          throw new Error(message);
        }
        const baseURL = String(data?.base_url || "").trim();
        if (!baseURL) {
          throw new Error("LightOS admin base_url is unavailable");
        }
        const parsed = new URL(baseURL);
        return {
          ...data,
          base_url: parsed.origin,
        };
      });
    }
    return adminInfoPromise;
  };

  const resolveAdminURL = async (path, name) => {
    const info = await loadAdminInfo();
    const url = new URL(path, info.base_url);
    if (name) {
      url.searchParams.set("name", name);
    }
    return url;
  };

  const activate = async (name) => {
    const normalized = String(name || "").trim();
    if (!normalized) {
      return null;
    }
    activeName = normalized;
    const url = await resolveAdminURL("/api/webshell/catlink/provider-frame", normalized);
    const nextSrc = url.toString();
    let frame = document.getElementById(frameID);
    if (frame && frame.src === nextSrc) {
      return frame;
    }
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = frameID;
      frame.hidden = true;
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      document.body.appendChild(frame);
    }
    frame.src = nextSrc;
    return frame;
  };

  const getStatus = async (name = activeName) => {
    const normalized = String(name || "").trim();
    if (!normalized) {
      throw new Error("Instance name is required");
    }
    const url = await resolveAdminURL("/unsafe_api/webshell/catlink/provider-status", normalized);
    const response = await fetch(url.toString(), {
      cache: "no-store",
      credentials: "include",
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      const message =
        (typeof data?.error === "string" && data.error) ||
        (typeof data?.message === "string" && data.message) ||
        `Catlink status failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  };

  window.lightosCatlinkProviderBridge = {
    activate,
    getStatus,
    getAdminInfo: loadAdminInfo,
  };
})();
