/**
 * Creates the DOM and Ghostty resources owned by a pane session.
 * Session state, transport, history, rendering policy and cleanup remain in
 * their respective controllers and are deliberately not handled here.
 */
export function createTerminalSessionResourceFactory({
  documentObject = globalThis.document,
  TerminalCtor,
  FitAddonCtor,
  getTerminalOptions = () => ({}),
  getMobilePixelScroll = () => false,
} = {}) {
  if (!documentObject || typeof documentObject.createElement !== "function") {
    throw new TypeError("terminal session resource factory requires a document");
  }
  if (typeof TerminalCtor !== "function" || typeof FitAddonCtor !== "function") {
    throw new TypeError("terminal session resource factory requires Ghostty constructors");
  }

  const create = ({ id, connect = true, initialTerminalOptions = {} } = {}) => {
    const normalizedID = String(id || "").trim();
    if (!normalizedID) {
      throw new TypeError("terminal session resource factory requires a pane id");
    }

    const shellEl = documentObject.createElement("section");
    shellEl.className = "pane-shell";
    shellEl.dataset.paneId = normalizedID;
    shellEl.dataset.connection = connect ? "connecting" : "idle";
    shellEl.dataset.renderReady = "false";
    shellEl.dataset.hasPresentedFrame = "false";
    shellEl.dataset.terminalFrameHeld = "false";
    shellEl.dataset.connectionRetrying = "false";
    shellEl.dataset.renderRecovery = "false";
    shellEl.setAttribute("tabindex", "-1");

    const terminalHost = documentObject.createElement("div");
    terminalHost.className = "terminal-host";
    shellEl.appendChild(terminalHost);

    const term = new TerminalCtor(getTerminalOptions(initialTerminalOptions));
    const fitAddon = new FitAddonCtor();
    term.loadAddon(fitAddon);
    if (term.options) {
      term.options.mobilePixelScroll = getMobilePixelScroll() === true;
    }
    // IME installs the application's focus entrypoint after creation. Ghostty
    // must not focus a detached host or enqueue a later host-focus callback.
    term.focus = () => {};
    term.open(terminalHost);
    terminalHost.removeAttribute("contenteditable");
    terminalHost.removeAttribute("tabindex");

    const terminalFrameHold = documentObject.createElement("canvas");
    terminalFrameHold.className = "terminal-frame-hold";
    terminalFrameHold.hidden = true;
    terminalHost.appendChild(terminalFrameHold);

    const compositionPreview = documentObject.createElement("span");
    compositionPreview.className = "terminal-composition-preview";
    compositionPreview.hidden = true;
    terminalHost.appendChild(compositionPreview);

    return {
      compositionPreview,
      fitAddon,
      shellEl,
      term,
      terminalFrameHold,
      terminalHost,
    };
  };

  return Object.freeze({ create });
}
