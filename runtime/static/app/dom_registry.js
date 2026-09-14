const freezeGroup = (group) => Object.freeze(group);

/**
 * Resolves the page shell once and exposes only grouped, read-only DOM refs.
 * Feature controllers still receive the smallest subset they need from the
 * application orchestrator; this registry does not register listeners.
 */
export function createAppDOMRegistry({ documentObject = globalThis.document } = {}) {
  if (!documentObject || typeof documentObject.getElementById !== "function") {
    throw new TypeError("app DOM registry requires a document");
  }
  const get = (id) => documentObject.getElementById(id);
  const workspace = freezeGroup({
    tabs: get("tabs"),
    newTabButton: get("newTab"),
    mobileActiveTabTitle: get("mobileActiveTabTitle"),
    terminalArea: get("terminalArea"),
    emptyState: get("emptyState"),
    emptyStateAction: get("emptyStateAction"),
  });
  if (!workspace.tabs || !workspace.terminalArea) {
    throw new Error("webshell host not found");
  }
  return Object.freeze({
    workspace,
    agentProtocolUpdate: freezeGroup({
      notice: get("agentProtocolUpdateNotice"),
    }),
    startup: freezeGroup({
      errorPanel: get("startupErrorPanel"),
      errorText: get("startupErrorText"),
      errorRetry: get("startupErrorRetry"),
      networkBanner: get("networkBanner"),
      toast: get("toast"),
    }),
    dialog: freezeGroup({
      backdrop: get("dialogBackdrop"),
      panel: get("dialogPanel"),
      title: get("dialogTitle"),
      message: get("dialogMessage"),
      input: get("dialogInput"),
      cancel: get("dialogCancel"),
      ok: get("dialogOK"),
    }),
    mobile: freezeGroup({
      shortcuts: get("mobileShortcuts"),
      closeConfirmSheet: get("mobileCloseConfirmSheet"),
      closeConfirmScrim: get("mobileCloseConfirmScrim"),
      closeConfirmHandle: get("mobileCloseConfirmHandle"),
      closeConfirmTitle: get("mobileCloseConfirmTitle"),
      closeConfirmMessage: get("mobileCloseConfirmMessage"),
      closeConfirmActions: get("mobileCloseConfirmActions"),
      closeConfirmCancel: get("mobileCloseConfirmCancel"),
      closeConfirmOK: get("mobileCloseConfirmOK"),
    }),
  });
}
