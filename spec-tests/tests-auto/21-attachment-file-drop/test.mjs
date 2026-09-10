import {
  assertPathInput,
  cleanupRemotePaths,
  closeMobileCompanion,
  dispatchWindowDrag,
  hostPoint,
  runUploadAction,
  sentMessageCount,
  uploadPanelSnapshot,
  uploadResponseMatches,
  waitForTerminal,
  waitForUploadPanel,
} from "./helpers.mjs";

export const desktopOnly = true;

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  await closeMobileCompanion(states, eventLog);
  const state = states.desktop;
  const uploadedPaths = [];
  try {
    await waitForTerminal(state);
    const fileName = `drop-pane-${Date.now()}.txt`;
    const point = await hostPoint(state);
    const start = await sentMessageCount(state);
    const drag = await dispatchWindowDrag(state, "dragover", {
      ...point,
      files: [{ name: fileName, type: "text/plain", contents: `drop-pane-${fileName}` }],
    });
    if (!drag.defaultPrevented) {
      throw new Error(`file dragover was not consumed: ${JSON.stringify(drag)}`);
    }
    if (!drag.overlay.includes(fileName)) {
      throw new Error(`drop overlay did not show the file name: ${JSON.stringify(drag)}`);
    }

    const upload = await runUploadAction(state, async () => {
      const dropped = await dispatchWindowDrag(state, "drop", {
        ...point,
        files: [{ name: fileName, type: "text/plain", contents: `drop-pane-${fileName}` }],
      });
      if (!dropped.defaultPrevented) {
        throw new Error(`file drop was not consumed: ${JSON.stringify(dropped)}`);
      }
      if (dropped.overlay) {
        throw new Error(`drop overlay remained after release: ${JSON.stringify(dropped)}`);
      }
    }, "desktop file drop upload");
    uploadedPaths.push(...upload.paths);
    await waitForUploadPanel(state);
    const panel = await uploadPanelSnapshot(state);
    if (!panel.visible || !/准备上传|%|已就绪|上传/.test(panel.text)) {
      throw new Error(`upload progress panel was not shown: ${JSON.stringify(panel)}`);
    }
    if (!panel.text.includes(fileName) && panel.status !== "success" && panel.status !== "uploading") {
      throw new Error(`upload panel did not present the dropped file: ${JSON.stringify(panel)}`);
    }
    await assertPathInput(state, start, upload.paths, "desktop file drop path");

    const chromeBox = await state.page.locator("#attachmentToggle").boundingBox();
    if (!chromeBox) throw new Error("attachment toggle is unavailable for non-terminal drop");
    const chromeUpload = state.page.waitForResponse(uploadResponseMatches, { timeout: 2_500 }).then(() => true).catch(() => false);
    const chromeDrop = await dispatchWindowDrag(state, "drop", {
      x: chromeBox.x + chromeBox.width / 2,
      y: chromeBox.y + chromeBox.height / 2,
      files: [{ name: `chrome-${fileName}`, type: "text/plain", contents: "should-not-upload" }],
    });
    if (!chromeDrop.defaultPrevented) {
      throw new Error(`non-terminal file drop did not stay in WebShell: ${JSON.stringify(chromeDrop)}`);
    }
    if (await chromeUpload) {
      throw new Error("dropping files on chrome started an attachment upload");
    }

    assertNoFatalErrors();
    await eventLog({
      status: "pass",
      action: "attachment-file-drop-pane",
      overlay: drag.overlay,
      panel,
      paths: upload.paths,
    });
  } finally {
    await cleanupRemotePaths(state, uploadedPaths);
  }
}
