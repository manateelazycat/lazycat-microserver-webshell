import { createTerminalSessionInstallationLifecycle } from "./session_installation_lifecycle.js";

const noop = () => {};

/**
 * Composes the feature controllers that a newly-created pane needs.  It is an
 * orchestration boundary only: session state remains owned by the session
 * controller and protocol/history/rendering behavior remains in its domain
 * controller.
 */
export function createTerminalSessionInstallationController({
  sessionController,
  lifecycleFactory = createTerminalSessionInstallationLifecycle,
  getActiveTheme = () => null,
  getWorkspaceGeneration = () => "",
  isReplayCommitted = () => false,
  appendStartupTrace = noop,
  clearUnifiedRetry = noop,
  presentation = null,
  output = null,
  clearRuntimeBuffer = noop,
  ime = null,
  renderer = null,
  selection = null,
  tuiAdapterInstaller = null,
  mouse = null,
  clipboard = null,
  paste = null,
  resize = null,
  input = null,
  interaction = null,
  links = null,
  getTabById = () => null,
  setActivePane = noop,
  refreshTabAutoLabel = noop,
  markSessionTitleNotification = noop,
  transportRuntime = null,
  isClientTarget = () => false,
  documentObject = globalThis.document,
} = {}) {
  if (!sessionController || typeof sessionController.create !== "function") {
    throw new TypeError("terminal session installation requires a session controller");
  }

  const lifecycle = lifecycleFactory({ documentObject });
  let disposed = false;

  const addCleanup = (session, cleanup) => {
    if (typeof sessionController.addCleanup === "function" && typeof cleanup === "function") {
      sessionController.addCleanup(session, cleanup);
    }
  };

  const installFeatureControllers = (session) => {
    presentation?.installSession?.(session);
    output?.installSession?.(session);
    clearRuntimeBuffer(session);
    presentation?.clearCanvas?.(session);

    ime?.installSession?.(session);
    renderer?.installSession?.(session);
    selection?.installSession?.(session);
    tuiAdapterInstaller?.installClaudeTouch?.(session);
    tuiAdapterInstaller?.installOpencodeTouch?.(session);
    tuiAdapterInstaller?.installHerdrTouch?.(session);
    tuiAdapterInstaller?.installPiTouch?.(session);
    tuiAdapterInstaller?.installGrokTouch?.(session);
    tuiAdapterInstaller?.installClaudeContextMenu?.(session);
    tuiAdapterInstaller?.installClaudeDesktopSelection?.(session);
    tuiAdapterInstaller?.installGrokContextMenu?.(session);
    tuiAdapterInstaller?.installGrokDesktopSelection?.(session);
    mouse?.installSession?.(session);

    const clipboardCleanup = clipboard?.bindDesktopSession?.(session);
    addCleanup(session, clipboardCleanup);
    resize?.installSession?.(session);
    input?.installSession?.(session);
  };

  const installTitleListener = (session) => {
    const term = session?.term;
    if (typeof term?.onTitleChange !== "function") {
      return;
    }
    const disposable = term.onTitleChange((title) => {
      if (session.closed) {
        return;
      }
      const current = getTabById(session.tabId);
      const normalized = String(title || "").trim();
      const changed = normalized !== session.title;
      session.title = normalized;
      if (current && !current.customLabel) {
        refreshTabAutoLabel(current);
      }
      if (changed) {
        markSessionTitleNotification(session);
      }
    });
    if (typeof disposable === "function") {
      addCleanup(session, disposable);
    } else if (disposable?.dispose) {
      addCleanup(session, () => disposable.dispose());
    }
  };

  const installDOMListeners = (session) => {
    const cleanup = lifecycle.install(session, {
      onPointerDown: (event) => {
        const current = getTabById(session.tabId);
        setActivePane(current, session.id, {
          focus: false,
          resize: false,
          userInteraction: true,
        });
      },
      onFocusIn: () => {
        const current = getTabById(session.tabId);
        setActivePane(current, session.id, { focus: false, resize: false });
      },
      onPaste: (event) => {
        paste?.handleNativePaste?.(session, event);
      },
    });
    addCleanup(session, cleanup);

    const contextMenuCleanup = interaction?.bindPane?.(session.shellEl, {
      activate: () => {
        const current = getTabById(session.tabId);
        setActivePane(current, session.id, { focus: false });
      },
      getTarget: (event) => {
        const link = links?.findAtPosition?.(session, event?.clientX, event?.clientY);
        return {
          type: "pane",
          tabId: session.tabId,
          paneId: session.id,
          link: link?.url || "",
        };
      },
    });
    addCleanup(session, contextMenuCleanup);
  };

  // A presentation-ready event crosses several feature boundaries. Keep this
  // small application-facing handoff here so rendering only reports readiness
  // and the global runtime only wires the controllers together.
  const handlePresentationReady = (session, { becameReady = false } = {}) => {
    if (disposed || !session || session.closed) {
      return false;
    }
    input?.flushPending?.(session);
    if (isReplayCommitted(session)) {
      appendStartupTrace(
        "终端输入已就绪",
        `pane=${session.id}`,
        { dedupeKey: `input-ready:${session.id}:${session.terminalReplayGeneration}` },
      );
    }
    if (session.hasPresentedFrame === true) {
      appendStartupTrace(
        "真实终端 Canvas 已显示",
        `pane=${session.id} startupElapsed=${Number(session.startupTraceStartedAt || 0) ? Math.max(0, (globalThis.performance?.now?.() || Date.now()) - Number(session.startupTraceStartedAt)) : 0}ms replayCommitted=${isReplayCommitted(session)} resizeEpoch=${String(session.appliedResizeEpoch || "")}`,
        { dedupeKey: `canvas-visible:${session.id}:${session.terminalReplayGeneration}` },
      );
    }
    session.startupTraceActive = session.hasPresentedFrame !== true;
    if (becameReady && session.connectionChannel === "unified") {
      clearUnifiedRetry(session, { resetAttempts: true });
    }
    return true;
  };

  const createPaneSession = (tab, instanceName, {
    id = "",
    connect = true,
    cols = 0,
    rows = 0,
  } = {}) => {
    if (!tab || !tab.id) {
      throw new TypeError("terminal session installation requires a tab");
    }
    const session = sessionController.create({
      baseTheme: getActiveTheme(),
      cols,
      connect,
      id,
      name: instanceName,
      rows,
      tabId: tab.id,
      workspaceGeneration: getWorkspaceGeneration(),
    });

    appendStartupTrace(
      "终端 pane 已创建",
      `pane=${session.id} tab=${session.tabId} target=${String(instanceName || "").trim()} connect=${Boolean(connect)} initialSize=${Number(session.initialCols || session.term?.cols || 0)}x${Number(session.initialRows || session.term?.rows || 0)}`,
      { dedupeKey: `pane-created:${session.id}` },
    );

    installFeatureControllers(session);
    installTitleListener(session);
    selection?.observeSession?.(session);
    installDOMListeners(session);

    tab.panes?.set(session.id, session);
    if (isClientTarget(instanceName)) {
      transportRuntime?.registerSession?.(session);
    }
    if (connect) {
      transportRuntime?.connectPendingSession?.(session, { allowHidden: true });
    }
    return session;
  };

  return Object.freeze({
    createPaneSession,
    handlePresentationReady,
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      lifecycle.dispose();
      return true;
    },
    disposeSession(session) {
      lifecycle.disposeSession(session);
    },
  });
}
