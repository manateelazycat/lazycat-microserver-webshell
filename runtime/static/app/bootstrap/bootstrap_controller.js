import { createAppBootstrapLifecycle } from "./bootstrap_lifecycle.js";

export function createAppBootstrapController({
  startControllers = [],
  ghosttyReady = Promise.resolve(),
  loadTheme = () => Promise.resolve(),
  loadSettings = () => Promise.resolve(),
  loadInstances = () => Promise.resolve(),
  getActiveName = () => "",
  getActiveGeneration = () => 0,
  isCurrentRequest = () => false,
  requestWorkspace = () => Promise.resolve(null),
  refreshWorkspaceWithRetry = () => Promise.resolve(false),
  scheduleWorkspaceRetry = () => {},
  applyWorkspace = () => {},
  startWorkspaceActivity = () => {},
  refreshWorkspaceActivity = () => Promise.resolve(),
  getTabCount = () => 0,
  markStartupMetric = () => {},
  appendStartupTrace = () => {},
  showToast = () => {},
  appendDebugError = () => {},
  showStartupErrorPanel = () => {},
  clearActiveTarget = () => {},
  createErrorTab = () => {},
  getCurrentTab = () => null,
  writeErrorTerminal = () => {},
  isAppDisposed = () => false,
  lifecycleFactory = createAppBootstrapLifecycle,
} = {}) {
  const lifecycle = lifecycleFactory();

  const start = async () => {
    const generation = lifecycle.begin();
    if (!generation) {
      return false;
    }
    for (const controller of startControllers) {
      controller?.start?.();
    }
    const themePromise = Promise.resolve(loadTheme()).finally(() => {
      markStartupMetric("themeReadyAt");
      appendStartupTrace("主题加载完成", "", { dedupeKey: "theme-ready" });
    });
    const settingsPromise = Promise.resolve(loadSettings())
      .catch((error) => showToast(error.message || "设置加载失败。"))
      .finally(() => {
        markStartupMetric("settingsReadyAt");
        appendStartupTrace("设置加载完成", "", { dedupeKey: "settings-ready" });
      });
    const instancesPromise = Promise.resolve(loadInstances()).finally(() => {
      markStartupMetric("instancesReadyAt");
      appendStartupTrace("实例列表加载完成", "", { dedupeKey: "instances-ready" });
    });
    let workspaceContext = null;
    const requestBootstrapWorkspace = () => {
      workspaceContext = {
        instanceName: getActiveName(),
        generation: getActiveGeneration(),
      };
      return requestWorkspace(workspaceContext);
    };
    const workspacePromise = (
      getActiveName()
        ? requestBootstrapWorkspace()
        : instancesPromise.then(requestBootstrapWorkspace)
    ).then(
      (result) => ({ result, error: null }),
      (error) => ({ result: null, error }),
    );
    await Promise.all([
      ghosttyReady,
      themePromise,
      settingsPromise,
      instancesPromise,
    ]);
    if (!lifecycle.isCurrent(generation) || isAppDisposed()) {
      return false;
    }
    appendStartupTrace("Ghostty、主题、设置和实例初始化完成", "", {
      dedupeKey: "runtime-prerequisites-ready",
    });
    const workspaceOutcome = await workspacePromise;
    if (!lifecycle.isCurrent(generation) || isAppDisposed()) {
      return false;
    }
    const requestIsCurrent = isCurrentRequest(
      workspaceContext?.instanceName,
      workspaceContext?.generation,
    );
    const protocolUpdateRequired = workspaceOutcome.error?.agentProtocolUpdateRequired === true;
    if (!requestIsCurrent) {
      await Promise.resolve(refreshWorkspaceWithRetry({ focus: true })).catch((error) => {
        showToast(error.message || "Workspace is temporarily unavailable. Retrying.");
      });
    } else if (workspaceOutcome.error) {
      if (!protocolUpdateRequired) {
        scheduleWorkspaceRetry({
          focus: true,
          instanceName: getActiveName(),
          generation: getActiveGeneration(),
        });
      }
      showToast(workspaceOutcome.error.message || "Workspace is temporarily unavailable. Retrying.");
    } else {
      applyWorkspace(workspaceOutcome.result, { focus: true });
    }
    appendStartupTrace(
      "应用 bootstrap 完成",
      `active=${getActiveName() || "无"} tabs=${getTabCount()}`,
      { dedupeKey: "bootstrap-complete" },
    );
    if (!protocolUpdateRequired) {
      startWorkspaceActivity();
      Promise.resolve(refreshWorkspaceActivity({ silent: true })).catch(() => {});
    }
    return true;
  };

  const handleFailure = async (error) => {
    if (lifecycle.isDisposed() || isAppDisposed()) {
      return false;
    }
    const message = error?.message || "WebShell startup failed.";
    appendDebugError("WebShell 启动失败", message);
    showToast(message);
    showStartupErrorPanel(message);
    clearActiveTarget();
    try {
      await ghosttyReady;
      if (lifecycle.isDisposed() || isAppDisposed()) {
        return false;
      }
      createErrorTab({ label: "Error", focus: true, connect: false });
      const tab = getCurrentTab();
      const pane = tab?.panes?.get?.(tab.activePaneId);
      writeErrorTerminal(pane, `\r\n[webshell error]\r\n${String(message).replace(/\r?\n/g, "\r\n")}\r\n`);
    } catch (terminalError) {
      appendDebugError(
        "WebShell 错误终端创建失败",
        terminalError?.message || String(terminalError),
      );
    }
    return false;
  };

  return Object.freeze({
    dispose: lifecycle.dispose,
    handleFailure,
    start,
  });
}
