export function workspaceResponseSelector(state) {
  return String(state?.selector || "").trim();
}

export function ensureWorkspaceResponseSelector(state, expectedName, label = "Workspace") {
  const selector = workspaceResponseSelector(state);
  const expected = String(expectedName || "").trim();
  if (selector && expected && selector !== expected) {
    throw new Error(`${label} selector mismatch: expected ${expected}, got ${selector}`);
  }
}

export function createWorkspaceAPI({
  windowObject = globalThis.window,
  fetchImpl = (...args) => windowObject.fetch(...args),
  getActiveName = () => "",
  getActiveGeneration = () => 0,
  getTerminalSize = () => ({ cols: 120, rows: 32 }),
  isCurrentRequest = () => true,
  observeServerRevision = () => {},
  observeAgentProtocolUpdate = () => {},
  applyWorkspaceState = () => {},
} = {}) {
  let disposed = false;

  const normalizedSize = () => {
    const size = getTerminalSize() || {};
    return {
      cols: Math.max(1, Number(size.cols) || 120),
      rows: Math.max(1, Number(size.rows) || 32),
    };
  };

  const workspaceURL = (name = getActiveName(), size = normalizedSize()) => {
    const url = new URL("./api/workspace", windowObject.location.href);
    url.searchParams.set("name", String(name || "").trim());
    url.searchParams.set("cols", String(size.cols));
    url.searchParams.set("rows", String(size.rows));
    return url;
  };

  const activityURL = (name = getActiveName(), size = normalizedSize()) => {
    const url = new URL("./api/workspace/activity", windowObject.location.href);
    url.searchParams.set("name", String(name || "").trim());
    url.searchParams.set("cols", String(size.cols));
    url.searchParams.set("rows", String(size.rows));
    return url;
  };

  const responseError = async (response, fallback, requestName = "") => {
    const text = await response.text();
    if (response.status === 409 && text) {
      try {
        const payload = JSON.parse(text);
        if (payload?.agent_protocol_update_required === true) {
          observeAgentProtocolUpdate({
            targetName: String(requestName || "").trim(),
            agentProtocolVersion: String(payload.current_protocol_version || "").trim(),
            preferredAgentProtocolVersion: String(payload.preferred_protocol_version || "").trim(),
            agentProtocolUpdateAvailable: payload.agent_protocol_update_available === true,
            agentProtocolUpdateRequired: true,
          });
          const error = new Error(String(payload.error || "终端服务协议版本不一致，需要确认更新。"));
          error.agentProtocolUpdateRequired = true;
          return error;
        }
      } catch {
        // Non-JSON 409 responses retain the ordinary workspace error path.
      }
    }
    return new Error(text || fallback);
  };

  const fetchState = async (name = getActiveName()) => {
    const requestName = String(name || "").trim();
    if (!requestName) {
      throw new Error("No running container is available.");
    }
    if (disposed) {
      throw new Error("Workspace API is disposed.");
    }
    const response = await fetchImpl(workspaceURL(requestName), { cache: "no-store" });
    if (!response.ok) {
      throw await responseError(response, `Workspace request failed (${response.status})`, requestName);
    }
    return response.json();
  };

  let mutationVersion = 0;
  const pendingActions = new Set();

  const postAction = async (action, payload = {}, {
    focus = true,
    preferStateActiveTab = true,
    applyResponse = true,
    preserveLocalState = false,
  } = {}) => {
    const requestName = String(getActiveName() || "").trim();
    const generation = getActiveGeneration();
    if (!requestName) {
      throw new Error("No running container is available.");
    }
    if (disposed) {
      throw new Error("Workspace API is disposed.");
    }
    const size = normalizedSize();
    const mutation = { requestName, generation };
    mutationVersion += 1;
    pendingActions.add(mutation);
    try {
      const response = await fetchImpl(workspaceURL(requestName, size), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cols: size.cols, rows: size.rows, ...payload }),
      });
      if (!response.ok) {
        throw await responseError(response, `Workspace action failed (${response.status})`, requestName);
      }
      const state = await response.json();
      if (disposed || !isCurrentRequest(requestName, generation)) {
        return state;
      }
      ensureWorkspaceResponseSelector(state, requestName);
      observeServerRevision(state);
      if (applyResponse) {
        applyWorkspaceState(state, {
          focus,
          instanceName: requestName,
          generation,
          preferStateActiveTab,
          preserveLocalState,
        });
      }
      return state;
    } finally {
      pendingActions.delete(mutation);
      if (!disposed && isCurrentRequest(requestName, generation)) mutationVersion += 1;
    }
  };

  const dispose = () => {
    if (disposed) {
      return false;
    }
    disposed = true;
    pendingActions.clear();
    mutationVersion += 1;
    return true;
  };

  return Object.freeze({
    activityURL,
    dispose,
    fetchState,
    getMutationState: () => Object.freeze({
      version: mutationVersion,
      pending: [...pendingActions].some((action) => action.requestName === getActiveName() && action.generation === getActiveGeneration()),
    }),
    isDisposed: () => disposed,
    postAction,
    workspaceURL,
  });
}
