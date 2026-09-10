import {
  assertPathInput,
  cleanupRemotePaths,
  closeMobileCompanion,
  dispatchWindowDrag,
  hostPoint,
  inputPayloads,
  runUploadAction,
  sentMessageCount,
  waitForTerminal,
} from "../21-attachment-file-drop/helpers.mjs";

export const desktopOnly = true;

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  await closeMobileCompanion(states, eventLog);
  const state = states.desktop;
  const { page } = state;
  const uploadedPaths = [];
  try {
    await waitForTerminal(state);
    const sourcePaneID = await page.locator(".terminal-pane.active .pane-shell").first().getAttribute("data-pane-id");
    if (!sourcePaneID) throw new Error("initial pane id is unavailable");

    await page.locator(`.terminal-pane.active .pane-shell[data-pane-id="${sourcePaneID}"] .terminal-host`).click({ button: "right" });
    const splitAction = page.locator('#contextMenu [data-action="split-vertical"]');
    await splitAction.waitFor({ state: "visible" });
    await splitAction.click();
    await page.waitForFunction((originalID) => {
      const shells = [...document.querySelectorAll(".terminal-pane.active .pane-shell")];
      return shells.length === 2 && shells.some((shell) => shell.dataset.paneId !== originalID);
    }, sourcePaneID, { timeout: 30_000 });

    const paneIDs = await page.locator(".terminal-pane.active .pane-shell").evaluateAll((shells) => (
      shells.map((shell) => shell.dataset.paneId || "").filter(Boolean)
    ));
    for (const paneID of paneIDs) await waitForTerminal(state, paneID);

    const activePaneID = await page.evaluate(() => (
      document.querySelector(".terminal-pane.active .pane-shell.active")?.dataset.paneId || ""
    ));
    const targetPaneID = paneIDs.find((id) => id && id !== activePaneID) || paneIDs.find((id) => id !== sourcePaneID);
    if (!targetPaneID) throw new Error(`split did not expose a second pane: ${JSON.stringify({ paneIDs, activePaneID })}`);

    const fileName = `drop-split-${Date.now()}.txt`;
    const point = await hostPoint(state, targetPaneID);
    const start = await sentMessageCount(state);
    const drag = await dispatchWindowDrag(state, "dragover", {
      ...point,
      files: [{ name: fileName, type: "text/plain", contents: `drop-split-${fileName}` }],
    });
    if (drag.overlayPane !== targetPaneID) {
      throw new Error(`drop overlay did not follow the pointer pane: ${JSON.stringify({ targetPaneID, drag })}`);
    }

    const upload = await runUploadAction(state, async () => {
      await dispatchWindowDrag(state, "drop", {
        ...point,
        files: [{ name: fileName, type: "text/plain", contents: `drop-split-${fileName}` }],
      });
    }, "desktop split pane file drop");
    uploadedPaths.push(...upload.paths);
    const matching = await assertPathInput(state, start, upload.paths, "desktop split pane file drop", targetPaneID);
    const payloads = await inputPayloads(state, start);
    const otherPaneHits = payloads.filter((payload) => (
      payload.paneID
      && payload.paneID !== targetPaneID
      && upload.paths.some((path) => payload.data.includes(path))
    ));
    if (otherPaneHits.length > 0) {
      throw new Error(`path leaked into the other pane: ${JSON.stringify({ targetPaneID, matching, otherPaneHits })}`);
    }

    assertNoFatalErrors();
    await eventLog({
      status: "pass",
      action: "attachment-file-drop-split-target",
      activePaneID,
      targetPaneID,
      overlayPane: drag.overlayPane,
      paths: upload.paths,
    });
  } finally {
    await cleanupRemotePaths(state, uploadedPaths);
  }
}
