(() => {
  const terminalHost = document.getElementById("terminal");
  if (!terminalHost) {
    throw new Error("terminal host not found");
  }
  const params = new URLSearchParams(window.location.search);
  let activeName = (params.get("name") || "").trim();
  const instanceList = document.getElementById("instance-list");
  const publishStatusText = document.getElementById("publish-status");
  const publishOutput = document.getElementById("publish-output");
  const serviceList = document.getElementById("service-list");
  const publishPackageIDInput = document.getElementById("publish-package-id");
  const publishUpstreamInput = document.getElementById("publish-upstream");
  const publishAppURLInput = document.getElementById("publish-app-url");
  const publishTitleInput = document.getElementById("publish-title");
  const publishIconInput = document.getElementById("publish-icon");
  const publishSkipAuthInput = document.getElementById("publish-skip-auth");
  const publishStatusBtn = document.getElementById("publish-status-btn");
  const publishAddBtn = document.getElementById("publish-add-btn");
  const catlinkStatusText = document.getElementById("catlink-status");
  const catlinkStatusBtn = document.getElementById("catlink-status-btn");

  const terminalOptions = {
    cursorBlink: true,
    convertEol: true,
    scrollback: 5000,
    fontFamily: '"DejaVu Sans Mono", "Liberation Mono", monospace',
    fontSize: 14,
    theme: {
      background: "#050a16",
      foreground: "#e5ecff",
      cursor: "#8ec5ff",
      selectionBackground: "rgba(142, 197, 255, 0.28)",
    },
  };

  const sessions = new Map();
  let disposed = false;
  let currentInstances = [];

  const instanceSelector = (item) => {
    const name = String(item?.name || "").trim();
    const ownerDeployID = String(item?.owner_deploy_id || "").trim();
    if (!name || !ownerDeployID) {
      return "";
    }
    return `${name}@${ownerDeployID}`;
  };

  const instanceDisplayName = (item) => {
    const selector = instanceSelector(item);
    if (selector) {
      return selector;
    }
    return String(item?.name || "").trim();
  };

  const loadInstances = async () => {
    const response = await fetch("./api/instances", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load instances (${response.status})`);
    }
    const instances = await response.json();
    if (!Array.isArray(instances)) {
      throw new Error("Invalid instances response");
    }
    return instances;
  };

  const loadDefaultInstanceName = async () => {
    const instances = currentInstances.length > 0 ? currentInstances : await loadInstances();
    currentInstances = instances;
    const target = instances.find((item) => item && item.status === "running");
    const targetName = instanceSelector(target);
    if (!targetName) {
      throw new Error("No running LightOS instance found");
    }
    return targetName;
  };

  const renderInstanceList = (instances) => {
    if (!instanceList) {
      return;
    }
    currentInstances = Array.isArray(instances) ? instances : [];
    instanceList.textContent = "";
    for (const item of currentInstances) {
      if (!item || typeof item.name !== "string") {
        continue;
      }
      const instanceName = instanceSelector(item);
      if (!instanceName) {
        continue;
      }
      const link = document.createElement("button");
      link.type = "button";
      link.className = "instance-chip";
      link.dataset.name = instanceName;
      if (instanceName === activeName) {
        link.classList.add("instance-chip-active");
      }
      if (item.status !== "running") {
        link.classList.add("instance-chip-disabled");
        link.disabled = true;
      }
      link.textContent = `${instanceDisplayName(item)} ${item.status || "unknown"}`;
      instanceList.appendChild(link);
    }
  };

  const updateLocationName = (nextName) => {
    const nextURL = new URL(window.location.href);
    nextURL.searchParams.set("name", nextName);
    window.history.pushState({ name: nextName }, "", nextURL);
  };

  const sendResize = (session) => {
    if (!session || session.closed) {
      return;
    }
    session.fitAddon.fit();
    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    session.socket.send(`resize:${session.term.cols},${session.term.rows}`);
  };

  const clearReconnectTimer = (session) => {
    if (session && session.reconnectTimer) {
      window.clearTimeout(session.reconnectTimer);
      session.reconnectTimer = 0;
    }
  };

  const createSession = (instanceName) => {
    const sessionHost = document.createElement("div");
    sessionHost.className = "terminal-session";
    sessionHost.dataset.name = instanceName;
    terminalHost.appendChild(sessionHost);

    const term = new Terminal(terminalOptions);
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(sessionHost);

    const session = {
      name: instanceName,
      host: sessionHost,
      term,
      fitAddon,
      socket: null,
      reconnectTimer: 0,
      reconnectPending: false,
      closed: false,
    };
    sessions.set(instanceName, session);
    term.onData((data) => {
      if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      session.socket.send(`input:${data}`);
    });
    return session;
  };

  const getSession = (instanceName) => sessions.get(instanceName) || createSession(instanceName);

  const showSession = (session) => {
    for (const item of sessions.values()) {
      item.host.hidden = item !== session;
    }
    window.requestAnimationFrame(() => {
      sendResize(session);
      session.term.focus();
    });
  };

  const scheduleReconnect = (session) => {
    if (disposed || session.closed || session.reconnectPending) {
      return;
    }
    session.reconnectPending = true;
    clearReconnectTimer(session);
    session.reconnectTimer = window.setTimeout(() => {
      session.reconnectTimer = 0;
      session.reconnectPending = false;
      connectSession(session).catch((error) => {
        session.term.write(`\r\n[webshell error] ${error.message}\r\n`);
      });
    }, 180);
  };

  const connectSession = async (session) => {
    if (session.closed || session.socket?.readyState === WebSocket.OPEN || session.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }
    clearReconnectTimer(session);
    const socketUrl = new URL("./ws", window.location.href);
    socketUrl.searchParams.set("name", session.name);
    socketUrl.searchParams.set("cols", String(session.term.cols || 120));
    socketUrl.searchParams.set("rows", String(session.term.rows || 32));
    const currentSocket = new WebSocket(socketUrl.toString());
    session.socket = currentSocket;
    currentSocket.binaryType = "arraybuffer";

    currentSocket.addEventListener("open", () => {
      if (session.socket !== currentSocket) {
        return;
      }
      session.reconnectPending = false;
      sendResize(session);
      if (session.name === activeName) {
        session.term.focus();
      }
    });

    currentSocket.addEventListener("message", (event) => {
      if (session.socket !== currentSocket) {
        return;
      }
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data);
          if (message && typeof message.type === "string") {
            switch (message.type) {
              case "history-replay-complete":
              case "pong":
                return;
            }
          }
        } catch (error) {
        }
        session.term.write(event.data);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        session.term.write(new Uint8Array(event.data));
      }
    });

    currentSocket.addEventListener("close", () => {
      if (session.socket === currentSocket) {
        session.socket = null;
      }
      scheduleReconnect(session);
    });

    currentSocket.addEventListener("error", () => {
      if (session.socket === currentSocket) {
        session.socket = null;
      }
    });
  };

  const switchInstance = async (nextName, { updateURL = true } = {}) => {
    const normalized = String(nextName || "").trim();
    if (!normalized) {
      return;
    }
    activeName = normalized;
    if (updateURL) {
      updateLocationName(activeName);
    }
    renderInstanceList(currentInstances);
    const session = getSession(activeName);
    showSession(session);
    activateCatlinkBridge(activeName).catch((error) => {
      setCatlinkStatus(`[catlink error] ${error.message}`);
    });
    loadServices().catch((error) => {
      setPublishStatus(`Services failed: ${error.message}`);
    });
    await connectSession(session);
  };

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

  const setPublishStatus = (message) => {
    if (publishStatusText) {
      publishStatusText.textContent = message;
    }
  };

  const setPublishOutput = (value) => {
    if (!publishOutput) {
      return;
    }
    publishOutput.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  };

  const setCatlinkStatus = (message) => {
    if (catlinkStatusText) {
      catlinkStatusText.textContent = message;
    }
  };

  const renderCatlinkStatus = (status) => {
    const state = String(status?.status || "unknown").trim() || "unknown";
    const message = String(status?.message || "").trim();
    const activeVersion = String(status?.active_version || "").trim();
    const suffix = activeVersion ? ` (${activeVersion})` : "";
    setCatlinkStatus(message ? `${state}${suffix}: ${message}` : `${state}${suffix}`);
  };

  const refreshCatlinkStatus = async () => {
    if (!activeName) {
      return;
    }
    const bridge = window.lightosCatlinkProviderBridge;
    if (!bridge || typeof bridge.getStatus !== "function") {
      setCatlinkStatus("Catlink bridge is not loaded");
      return;
    }
    const status = await bridge.getStatus(activeName);
    renderCatlinkStatus(status);
  };

  const activateCatlinkBridge = async (instanceName) => {
    const bridge = window.lightosCatlinkProviderBridge;
    if (!bridge || typeof bridge.activate !== "function") {
      setCatlinkStatus("Catlink bridge is not loaded");
      return;
    }
    setCatlinkStatus("Checking...");
    await bridge.activate(instanceName);
    await refreshCatlinkStatus();
  };

  const resolveAdminURL = async (path) => {
    const bridge = window.lightosCatlinkProviderBridge;
    if (!bridge || typeof bridge.getAdminInfo !== "function") {
      throw new Error("LightOS admin info is not available");
    }
    const info = await bridge.getAdminInfo();
    return new URL(path, info.base_url);
  };

  const requestAdminJSON = async (path, options = {}) => {
    const url = await resolveAdminURL(path);
    const response = await fetch(url.toString(), {
      cache: "no-store",
      credentials: "include",
      ...options,
    });
    const data = await readJSONSafe(response);
    if (!response.ok) {
      const message =
        (typeof data?.error === "string" && data.error) ||
        (typeof data?.message === "string" && data.message) ||
        `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  };

  const serviceFormData = () => {
    const packageID = String(publishPackageIDInput?.value || "").trim();
    const upstream = String(publishUpstreamInput?.value || "").trim();
    const appURL = String(publishAppURLInput?.value || "").trim();
    const title = String(publishTitleInput?.value || "").trim();
    if (!packageID) {
      throw new Error("Package ID is required");
    }
    if (!upstream) {
      throw new Error("Upstream is required");
    }
    if (!appURL) {
      throw new Error("App URL is required");
    }
    if (!title) {
      throw new Error("Title is required");
    }
    const form = new FormData();
    form.set("instance_name", activeName);
    form.set("package_id", packageID);
    form.set("upstream", upstream);
    form.set("app_url", appURL);
    form.set("title", title);
    form.set("skip_auth", publishSkipAuthInput?.checked ? "true" : "false");
    const icon = publishIconInput?.files?.[0];
    if (icon) {
      form.set("icon", icon);
    }
    return form;
  };

  const runPublishAction = async (label, action) => {
    try {
      setPublishStatus(`${label}...`);
      const result = await action();
      setPublishStatus(`${label} OK`);
      setPublishOutput(result || { ok: true });
      return result;
    } catch (error) {
      setPublishStatus(`${label} failed`);
      setPublishOutput(`[publish error] ${error.message}`);
      throw error;
    }
  };

  const renderServices = (services) => {
    if (!serviceList) {
      return;
    }
    serviceList.textContent = "";
    const visible = Array.isArray(services)
      ? services.filter((service) => String(service?.instance_name || "").trim() === activeName)
      : [];
    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "service-empty";
      empty.textContent = "No services for this instance";
      serviceList.appendChild(empty);
      return;
    }
    for (const service of visible) {
      const appURL = String(service.app_url || "").trim();
      const link = document.createElement(appURL ? "a" : "div");
      link.className = appURL ? "service-item" : "service-item service-item-disabled";
      if (appURL) {
        link.href = appURL;
        link.target = "_blank";
        link.rel = "noreferrer";
      }
      const title = document.createElement("span");
      title.className = "service-title";
      title.textContent = String(service.title || service.package_id || "Untitled service");
      const meta = document.createElement("span");
      meta.className = "service-meta";
      meta.textContent = `${service.package_id || ""} ${service.upstream || ""}`.trim();
      link.append(title, meta);
      serviceList.appendChild(link);
    }
  };

  const loadServices = async () => {
    const data = await requestAdminJSON("/unsafe_api/publish/services");
    const services = Array.isArray(data?.services) ? data.services : [];
    renderServices(services);
    return services;
  };

  const bindPublishActions = () => {
    publishStatusBtn?.addEventListener("click", () => {
      runPublishAction("Status", async () => {
        const result = await requestAdminJSON("/unsafe_api/publish/status");
        await loadServices();
        return result;
      }).catch(() => {});
    });
    publishAddBtn?.addEventListener("click", () => {
      runPublishAction("Add service", async () => {
        const result = await requestAdminJSON("/unsafe_api/publish/services", {
          method: "POST",
          body: serviceFormData(),
        });
        await loadServices();
        return result;
      }).catch(() => {});
    });
  };

  const bindCatlinkActions = () => {
    catlinkStatusBtn?.addEventListener("click", () => {
      refreshCatlinkStatus().catch((error) => {
        setCatlinkStatus(`[catlink error] ${error.message}`);
      });
    });
  };

  const bootstrap = async () => {
    const instances = await loadInstances();
    renderInstanceList(instances);
    if (!activeName) {
      activeName = await loadDefaultInstanceName();
      updateLocationName(activeName);
      renderInstanceList(currentInstances);
    }
    await switchInstance(activeName, { updateURL: false });
    await loadServices().catch((error) => {
      setPublishStatus(`Services failed: ${error.message}`);
    });
  };

  window.addEventListener("resize", () => {
    const session = sessions.get(activeName);
    sendResize(session);
  });
  window.addEventListener("popstate", () => {
    const nextParams = new URLSearchParams(window.location.search);
    const nextName = (nextParams.get("name") || "").trim();
    if (!nextName || nextName === activeName) {
      return;
    }
    switchInstance(nextName, { updateURL: false }).catch((error) => {
      const session = sessions.get(activeName);
      if (session) {
        session.term.write(`\r\n[webshell error] ${error.message}\r\n`);
      }
    });
  });
  if (instanceList) {
    instanceList.addEventListener("click", (event) => {
      const target = event.target.closest(".instance-chip");
      if (!target || target.disabled) {
        return;
      }
      switchInstance(target.dataset.name).catch((error) => {
        const session = sessions.get(activeName);
        if (session) {
          session.term.write(`\r\n[webshell error] ${error.message}\r\n`);
        }
      });
    });
  }
  window.addEventListener("beforeunload", () => {
    disposed = true;
    for (const session of sessions.values()) {
      session.closed = true;
      clearReconnectTimer(session);
      session.socket?.close();
    }
  });
  bindPublishActions();
  bindCatlinkActions();
  bootstrap().catch((error) => {
    const fallback = getSession(activeName || "error");
    showSession(fallback);
    fallback.term.write(`\r\n[webshell error] ${error.message}\r\n`);
  });
})();
