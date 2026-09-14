// An exited process is a terminal result, not a recoverable transport outage.
// Keep its already received output until parsing has finished, then detach.
export function createTerminalSessionExitController({
  isReplayCommitted, hasQueuedOutput, finishResize, clearConnectionTimers,
  clearRetry, discardInput, stopHealth, flushOutput, retireTransport,
  showError, ensurePresentation, recordEvent,
}) {
  const settled = new WeakSet();
  const messages = new WeakMap();
  const settle = (session) => {
    if (!session?.terminalExitRetained || session.closed || settled.has(session)
      || !isReplayCommitted(session) || hasQueuedOutput(session)) return false;
    settled.add(session);
    retireTransport(session);
    showError(session, messages.get(session) || {}, true);
    ensurePresentation(session, { reason: "terminal_process_exited", forceHistory: true });
    return true;
  };
  return Object.freeze({
    settle,
    accept(session, message) {
      if (!session || session.closed || session.exitExpected) return;
      session.exitExpected = true;
      messages.set(session, message);
      session.terminalExitRetained = message.retained === true;
      session.workspaceExitPending = !session.terminalExitRetained;
      session.pendingConnect = false;
      session.connectionRetrying = false;
      session.shellEl.dataset.connection = "error";
      clearConnectionTimers(session);
      clearRetry(session);
      discardInput(session);
      stopHealth(session);
      finishResize(session);
      recordEvent(session, "terminal_process_exited", {
        exitCode: Number(message.exit_code), retained: session.terminalExitRetained,
        authoritative: message.authoritative === true,
      });
      if (session.terminalExitRetained) showError(session, message);
      flushOutput(session);
      settle(session);
    },
  });
}
