import { RemoteTerminal } from "./remote_terminal.js";
import { installBackendTerminalAdapter } from "./terminal_adapter.js";

export function createTerminalBackendManager({ wasmURL, isVisible = () => true, onError = () => {}, onReady = () => {}, diagnosticsEnabled = () => false, recordEvent = () => {} }) {
  const backends = new Set();
  const sessions = new WeakMap();
  const pendingDiagnostics = new WeakMap();
  let disposed = false;
  return Object.freeze({
    attach(term) {
      if (disposed || typeof Worker !== "function") throw new Error("This browser cannot run terminal backend workers");
      const ghostty = term.ghostty;
      term.backendIdentity = () => {
        const session = sessions.get(term);
        return session ? `${session.name}/${session.id}:${session.connectionEpoch}` : "";
      };
      term.ghostty = {
        createKeyEncoder: (...args) => ghostty.createKeyEncoder(...args),
        createTerminal: (cols, rows, config) => {
          const backend = new RemoteTerminal({
            workerFactory: () => new Worker(new URL("../../global-backend-worker.js", import.meta.url), { type: "module" }),
            wasmURL, cols, rows, config,
            diagnosticsEnabled,
            onDiagnostic: (event, details) => {
              const session = sessions.get(term);
              if (session) recordEvent(session, event, { ...details, backendCount: backends.size });
              else {
                // open() creates the Worker before the session is installed.
                const entries = pendingDiagnostics.get(term) || [];
                entries.push({ event, details });
                pendingDiagnostics.set(term, entries.slice(-8));
              }
            },
            viewport: () => term.viewportY,
            // Presentation suppression must not suppress frame preparation.
            // A visible pane needs a current viewport as soon as its write ends.
            visible: () => isVisible(sessions.get(term)),
            onChange: () => {
              term.linkDetector?.invalidateCache();
              if (isVisible(sessions.get(term))) term.requestRender?.({ full: true, throttle: true });
              onReady(sessions.get(term));
            },
            onError: (error) => onError(sessions.get(term), error),
            onDispose: (backend) => backends.delete(backend),
          });
          backends.add(backend);
          return backend;
        },
      };
      installBackendTerminalAdapter(term);
    },
    bindSession(session) {
      sessions.set(session.term, session);
      for (const { event, details } of pendingDiagnostics.get(session.term) || []) {
        recordEvent(session, event, { ...details, backendCount: backends.size });
      }
      pendingDiagnostics.delete(session.term);
    },
    prepareRecovery(session) {
      const backend = session?.term?.wasmTerm;
      if (!disposed && !session?.closed && backend?.isRemote
        && (backend.failed || backend.isPending || !backend.isReady || session.term.backendResizePending)) {
        session.term.reset();
        backend.markPreparedForReplay();
      }
    },
    dispose() {
      disposed = true;
      for (const backend of backends) backend.free();
      backends.clear();
    },
  });
}
