const terminalHost = (state) => state.page.locator(".terminal-pane.active .terminal-host").first();

const waitForOutput = async (state, marker, timeout = 8_000) => {
  await state.page.waitForFunction((expected) => (
    String(window.__testsAutoTerminalOutput || "").includes(expected)
  ), marker, { timeout });
};

const activeUnifiedCount = (state) => state.page.evaluate(() => (
  Array.from(window.__testsAutoSockets || []).filter((socket) => (
    String(socket.url || "").includes("mode=unified")
    && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
  )).length
));

const sendLegacyInputLock = (state, paneID, blocked) => state.page.evaluate(({ paneID, blocked }) => {
  const messages = window.__testsAutoSentMessages || [];
  const replacements = messages.filter((message) => message?.type === "replace-subscriptions");
  const replacement = replacements.at(-1);
  const subscription = replacement?.subscriptions?.find((entry) => String(entry?.pane_id || "") === paneID);
  if (!subscription) {
    throw new Error(`no Unified subscription found for pane ${paneID}`);
  }
  const socket = Array.from(window.__testsAutoSockets || []).findLast((candidate) => (
    candidate.readyState === WebSocket.OPEN && String(candidate.url || "").includes("mode=unified")
  ));
  if (!socket) {
    throw new Error("no open Unified physical WebSocket found");
  }
  socket.send(JSON.stringify({
    type: "pane-control",
    protocol_version: 1,
    pane_id: subscription.pane_id,
    stream_id: subscription.stream_id,
    channel_generation: subscription.channel_generation,
    control: { type: "input_lock", blocked },
  }));
  return {
    paneID: subscription.pane_id,
    streamID: subscription.stream_id,
    channelGeneration: subscription.channel_generation,
    blocked,
  };
}, { paneID, blocked });

export async function run({ states, eventLog, assertNoFatalErrors }) {
  const { desktop, mobile } = states;
  await Promise.all([desktop, mobile].map((state) => (
    terminalHost(state).waitFor({ state: "visible", timeout: 60_000 })
  )));
  await Promise.all([desktop, mobile].map((state) => (
    state.page.waitForFunction(() => {
      const shell = document.querySelector(".terminal-pane.active .pane-shell");
      return shell?.dataset.renderReady === "true" && shell.dataset.hasPresentedFrame === "true";
    }, null, { timeout: 60_000 })
  )));

  const desktopPaneID = String(desktop.activePaneID || "");
  const mobilePaneID = String(mobile.activePaneID || "");
  if (!desktopPaneID || desktopPaneID !== mobilePaneID) {
    throw new Error(`windows are not attached to the same pane: ${JSON.stringify({ desktopPaneID, mobilePaneID })}`);
  }

  const marker = `AUTO_INPUT_LOCK_NOOP_${Date.now()}`;
  let lockDescriptor = null;
  try {
    lockDescriptor = await sendLegacyInputLock(desktop, desktopPaneID, true);
    await eventLog({
      status: "pass",
      action: "send-legacy-input-lock",
      window: "desktop",
      descriptor: lockDescriptor,
    });

    // The old control frame and the following mobile input use different
    // attach processes. Give the real Provider/agent a small bounded turn to
    // apply the control frame before testing the cross-attach invariant.
    await desktop.page.waitForTimeout(250);
    await terminalHost(mobile).tap();
    await mobile.page.evaluate(() => {
      const textarea = document.querySelector(".terminal-pane.active .terminal-host textarea");
      if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("terminal textarea unavailable for mobile input-lock regression");
      textarea.focus({ preventScroll: true });
    });
    await mobile.page.keyboard.insertText(`printf '%s\\n' '${marker}'`);
    await mobile.page.keyboard.press("Enter");
    await waitForOutput(mobile, marker);
  } finally {
    if (lockDescriptor && !desktop.page.isClosed()) {
      await sendLegacyInputLock(desktop, desktopPaneID, false).catch(() => {});
    }
  }

  const sockets = {
    desktop: await activeUnifiedCount(desktop),
    mobile: await activeUnifiedCount(mobile),
  };
  if (sockets.desktop !== 1 || sockets.mobile !== 1) {
    throw new Error(`expected one active Unified socket per page: ${JSON.stringify(sockets)}`);
  }
  const sentInputFrames = await mobile.page.evaluate((expected) => (
    (window.__testsAutoSentMessages || []).filter((message) => (
      message?.type === "pane-control"
      && message?.control?.type === "input"
      && String(message.control.data || "").includes(expected)
    )).length
  ), marker);
  if (sentInputFrames !== 1) {
    throw new Error(`mobile marker did not produce exactly one Unified input frame: ${JSON.stringify({ marker, sentInputFrames })}`);
  }
  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "legacy-input-lock-is-noop",
    paneID: desktopPaneID,
    marker,
    sentInputFrames,
    sockets,
  });
}
