import {
  assertPathInput,
  cleanupRemotePaths,
  runUploadAction,
  sentMessageCount,
  uploadPanelSnapshot,
  waitForTerminal,
  waitForUploadPanel,
} from "../file-drop/helpers.mjs";

export async function run({ states, eventLog, assertNoFatalErrors }) {
  const state = states.mobile;
  if (!state) {
    throw new Error("mobile browser context is required for mobile file picker upload");
  }
  const uploadedPaths = [];
  try {
    await waitForTerminal(state);
    const fileName = `mobile-upload-${Date.now()}.txt`;
    const start = await sentMessageCount(state);
    await state.page.locator("#attachmentToggle").click();
    await state.page.locator("#attachmentBackdrop").waitFor({ state: "visible" });
    const chooserPromise = state.page.waitForEvent("filechooser");
    await state.page.locator("#attachmentFile").click();
    const chooser = await chooserPromise;
    const successHint = state.page.waitForFunction(() => {
      const panel = document.querySelector(".attachment-upload-panel[data-status='success']");
      const text = String(panel?.textContent || "").trim();
      return text || false;
    }, null, { timeout: 20_000 }).catch((error) => {
      throw new Error(`mobile upload success panel was not observed: ${error?.message || error}`);
    });
    const upload = await runUploadAction(state, () => chooser.setFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(`mobile-upload-${fileName}`),
    }), "mobile file picker upload");
    uploadedPaths.push(...upload.paths);
    await waitForUploadPanel(state);
    const successText = await successHint;
    if (/已复制|粘贴即可|点击复制路径|剪切板|已就绪|clipboard|paste|path is ready/i.test(successText)) {
      throw new Error(`mobile upload panel still asked the user to paste the path: ${successText}`);
    }
    const panel = await uploadPanelSnapshot(state);
    const copyButton = state.page.locator(".attachment-upload-panel[data-status='success'] .attachment-upload-copy");
    if (await copyButton.isVisible()) {
      throw new Error(`mobile upload success still showed a copy-path button: ${JSON.stringify(panel)}`);
    }
    await assertPathInput(state, start, upload.paths, "mobile file picker path");
    assertNoFatalErrors();
    await eventLog({
      status: "pass",
      action: "attachment-mobile-upload-path",
      panel,
      paths: upload.paths,
    });
  } finally {
    await cleanupRemotePaths(state, uploadedPaths);
  }
}
