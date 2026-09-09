import { createAgentProtocolUpdateAPI } from "./agent_protocol_update_api.js";
import { createAgentProtocolUpdateView } from "./agent_protocol_update_view.js";

const confirmationMessage = "将更新并重启当前终端服务。当前所有终端会话及正在运行的任务会被中断。确认继续吗？";
const translate = (key) => typeof globalThis.$t === "function" ? globalThis.$t(key) : key;

export function createAgentProtocolUpdateController({
  windowObject = globalThis.window,
  api = null,
  view = null,
  notice = null,
  getActiveName = () => "",
  getTerminalInput = () => null,
  openDialog = () => Promise.resolve(false),
  suppressBeforeUnloadForNavigation = () => {},
  reload = () => windowObject?.location?.reload?.(),
  setTimeoutImpl = windowObject?.setTimeout?.bind(windowObject) || globalThis.setTimeout,
  clearTimeoutImpl = windowObject?.clearTimeout?.bind(windowObject) || globalThis.clearTimeout,
  reloadDelayMs = 1000,
  showToast = () => {},
  appendDebugLog = () => {},
  appendDebugError = () => {},
} = {}) {
  const updateAPI = api || createAgentProtocolUpdateAPI({ windowObject });
  const updateView = view || createAgentProtocolUpdateView({ notice });
  let disposed = false;
  let dialogOpen = false;
  let updating = false;
  let reloadPending = false;
  let reloadTimer = 0;
  let requiredPromptKey = "";
  let state = {
    targetName: "",
    currentProtocolVersion: "",
    preferredProtocolVersion: "",
    updateAvailable: false,
    updateRequired: false,
  };

  const render = () => updateView.render({
    visible: state.updateAvailable && state.targetName === String(getActiveName() || "").trim(),
    updating: updating || reloadPending,
  });

  const scheduleForcedReload = () => {
    reloadPending = true;
    const performReload = () => {
      reloadTimer = 0;
      if (disposed) {
        return;
      }
      suppressBeforeUnloadForNavigation();
      reload();
    };
    if (typeof setTimeoutImpl !== "function") {
      performReload();
      return;
    }
    reloadTimer = setTimeoutImpl(performReload, Math.max(0, Number(reloadDelayMs) || 0)) || 0;
  };

  const showUpdateDialog = async () => {
    if (disposed || dialogOpen || updating || reloadPending || !state.updateAvailable) {
      return false;
    }
    if (state.targetName !== String(getActiveName() || "").trim()) {
      render();
      return false;
    }
    dialogOpen = true;
    let confirmed = false;
    try {
      confirmed = await openDialog({
        title: translate("更新终端服务协议"),
        message: translate(confirmationMessage),
        okText: translate("确认更新"),
        cancelText: translate("取消"),
        danger: true,
        initialFocus: "cancel",
      }) === true;
    } finally {
      dialogOpen = false;
    }
    if (!confirmed || disposed) {
      return false;
    }

    const requestedState = { ...state };
    updating = true;
    render();
    const terminalInput = getTerminalInput();
    terminalInput?.discardAll?.();
    try {
      const result = await updateAPI.update({
        name: requestedState.targetName,
        currentProtocolVersion: requestedState.currentProtocolVersion,
      });
      if (disposed || requestedState.targetName !== String(getActiveName() || "").trim()) {
        return false;
      }
      const currentProtocolVersion = String(result?.current_protocol_version || "").trim();
      state = {
        ...requestedState,
        currentProtocolVersion,
        preferredProtocolVersion: String(result?.preferred_protocol_version || currentProtocolVersion).trim(),
        updateAvailable: false,
        updateRequired: false,
      };
      render();
      appendDebugLog("终端服务协议更新完成", currentProtocolVersion || "unknown");
      showToast(translate("终端服务协议已更新，1 秒后重新连接。"));
      scheduleForcedReload();
      return true;
    } catch (error) {
      const message = String(error?.message || translate("终端服务协议更新失败")).trim();
      appendDebugError("终端服务协议更新失败", message);
      showToast(message);
      return false;
    } finally {
      if (!disposed) {
        updating = false;
        render();
      }
    }
  };

  updateView.install(() => {
    showUpdateDialog().catch((error) => {
      appendDebugError("终端服务协议更新失败", error?.message || String(error));
    });
  });

  return Object.freeze({
    beginTarget(targetName) {
      if (disposed) {
        return false;
      }
      const nextTargetName = String(targetName || "").trim();
      if (state.targetName === nextTargetName) {
        return false;
      }
      state = {
        targetName: nextTargetName,
        currentProtocolVersion: "",
        preferredProtocolVersion: "",
        updateAvailable: false,
        updateRequired: false,
      };
      requiredPromptKey = "";
      render();
      return true;
    },
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      dialogOpen = false;
      updating = false;
      reloadPending = false;
      if (reloadTimer) {
        clearTimeoutImpl?.(reloadTimer);
        reloadTimer = 0;
      }
      updateView.dispose();
      updateView.render({ visible: false, updating: false });
      return true;
    },
    isDialogOpen: () => dialogOpen,
    observe({
      targetName = "",
      agentProtocolVersion = "",
      preferredAgentProtocolVersion = "",
      agentProtocolUpdateAvailable = false,
      agentProtocolUpdateRequired = false,
    } = {}) {
      if (disposed) {
        return false;
      }
      const normalizedTarget = String(targetName || "").trim();
      if (!normalizedTarget || normalizedTarget !== String(getActiveName() || "").trim()) {
        return false;
      }
      state = {
        targetName: normalizedTarget,
        currentProtocolVersion: String(agentProtocolVersion || "").trim(),
        preferredProtocolVersion: String(preferredAgentProtocolVersion || "").trim(),
        updateAvailable: agentProtocolUpdateAvailable === true,
        updateRequired: agentProtocolUpdateRequired === true,
      };
      render();
      if (state.updateAvailable && state.updateRequired) {
        const promptKey = `${state.targetName}\u0000${state.currentProtocolVersion}\u0000${state.preferredProtocolVersion}`;
        if (requiredPromptKey !== promptKey) {
          requiredPromptKey = promptKey;
          showUpdateDialog().catch((error) => {
            appendDebugError("终端服务协议更新确认失败", error?.message || String(error));
          });
        }
      }
      return true;
    },
    showUpdateDialog,
    snapshot: () => Object.freeze({ ...state, dialogOpen, updating, reloadPending }),
  });
}

export { confirmationMessage as agentProtocolUpdateConfirmationMessage };
