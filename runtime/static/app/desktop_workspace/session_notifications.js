const outputCursor = (value) => {
  const text = String(value ?? "");
  return /^\d{1,20}$/.test(text) ? BigInt(text) : null;
};

export function updateDesktopProgramStatus(tab, pane, status, { read = false, metadata = true, baseline = false } = {}) {
  if (!status || !["", "idle", "working", "blocked", "done", "error"].includes(status.state)) return;
  const completed = outputCursor(status.completed);
  const revision = outputCursor(status.revision);
  if (completed === null || revision === null) return;
  const previous = outputCursor(pane.programCompleted) ?? 0n;
  const previousRevision = outputCursor(pane.programRevision);
  if (!baseline && previousRevision !== null && revision < previousRevision) return;
  const completedOffset = outputCursor(status.completed_offset);
  const readOffset = outputCursor(pane.readOutputOffset);
  const alreadyRead = completedOffset !== null && readOffset !== null && completedOffset <= readOffset;
  if (!baseline && !read && !alreadyRead && status.state !== "error" && completed > previous) tab.hasNotification = true;
  pane.programState = status.state;
  pane.programRevision = revision.toString();
  pane.programCompleted = completed.toString();
  if (metadata) pane.programStatusSupported = true;
}

// Foreground process activity and application turn state are separate signals.
export function updateDesktopSessionActivity(tab, pane, state, { read = false } = {}) {
  const generation = String(state.history_generation || "");
  const cursor = outputCursor(state.output_offset);
  const previousCursor = outputCursor(pane.outputOffset);
  const sameHistory = generation && generation === pane.historyGeneration;
  const becameIdle = pane.busy === true && (state.busy !== true || state.exited === true);
  const newHistory = generation && pane.historyGeneration && !sameHistory;
  if (newHistory) {
    pane.programState = "";
    pane.programRevision = undefined;
    pane.programCompleted = undefined;
    pane.programStatusSupported = false;
    pane.readOutputOffset = undefined;
  }
  if (state.program_status) {
    updateDesktopProgramStatus(tab, pane, state.program_status, {
      read, baseline: newHistory || pane.programStatusSupported !== true,
    });
  } else if (becameIdle && pane.programState === "working") {
    // Old cores may leave a live-observed state behind after the process ends.
    // Clear it without inventing a successful task completion.
    pane.programState = "";
  }
  Object.assign(pane, {
    terminalExited: state.exited === true,
    terminalExitRetained: state.exit_retained === true,
    terminalExitCode: Number(state.exit_code || 0),
    busy: state.busy === true,
    command: state.command || "",
    processCommandLine: state.command_line || "",
    cwd: state.cwd || "",
  });
  if (generation && cursor !== null) {
    pane.historyGeneration = generation;
    pane.outputOffset = sameHistory && previousCursor !== null && previousCursor > cursor
      ? previousCursor.toString() : cursor.toString();
  }
}

export function syncDesktopSessionNotification(tab, liveTab, { read = false } = {}) {
  tab.hasNotification ||= liveTab?.hasNotification === true;
  if (read) {
    tab.hasNotification = false;
    // Include the last actually painted output when leaving a session, so the
    // next metadata poll does not report output the user has already seen.
    for (const pane of tab.panes.values()) {
      const live = liveTab?.panes.get(pane.id);
      const cursor = outputCursor(live?.presentedHistoryCursor);
      const previous = outputCursor(pane.outputOffset);
      if (live?.historyGeneration && cursor !== null
        && (!pane.historyGeneration || pane.historyGeneration === live.historyGeneration)) {
        pane.historyGeneration = live.historyGeneration;
        pane.outputOffset = previous !== null && previous > cursor ? previous.toString() : cursor.toString();
      }
      pane.readOutputOffset = pane.outputOffset;
    }
  }
  if (liveTab) {
    for (const pane of tab.panes.values()) {
      const live = liveTab.panes.get(pane.id);
      if (!live) continue;
      live.programState = pane.programState || "";
      live.terminalExitCode = pane.terminalExitCode;
    }
    liveTab.hasNotification = tab.hasNotification === true;
    liveTab.button?.classList?.toggle("has-notification", liveTab.hasNotification);
  }
}
