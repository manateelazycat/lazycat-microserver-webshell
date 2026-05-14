import { FitAddon, Terminal, init as initGhostty } from "./ghostty-web.js";

(async () => {
  await initGhostty();

  const terminalHost = document.getElementById("terminal");
  if (!terminalHost) {
    throw new Error("terminal host not found");
  }
  const params = new URLSearchParams(window.location.search);
  let activeName = (params.get("name") || "").trim();
  const instanceList = document.getElementById("instance-list");

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
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(sessionHost);
    if (typeof fitAddon.observeResize === "function") {
      fitAddon.observeResize();
    }

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
    await connectSession(session);
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
  bootstrap().catch((error) => {
    const fallback = getSession(activeName || "error");
    showSession(fallback);
    fallback.term.write(`\r\n[webshell error] ${error.message}\r\n`);
  });
})();
