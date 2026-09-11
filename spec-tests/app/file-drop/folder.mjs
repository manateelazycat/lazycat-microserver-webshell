import {
  closeMobileCompanion,
  dispatchWindowDrag,
  hostPoint,
  sentMessageCount,
  uploadResponseMatches,
  waitForTerminal,
} from "./helpers.mjs";

export const desktopOnly = true;

export async function run({ config, states, eventLog, assertNoFatalErrors }) {
  if (!config.localStaticDir) {
    throw new Error("WEBSHELL_LOCAL_STATIC_DIR is required so the real environment loads the current workspace frontend");
  }
  await closeMobileCompanion(states, eventLog);
  const state = states.desktop;
  await waitForTerminal(state);
  const point = await hostPoint(state);
  const start = await sentMessageCount(state);
  const drag = await dispatchWindowDrag(state, "dragover", {
    ...point,
    directory: "photos",
  });
  if (!/文件夹/.test(drag.overlay)) {
    throw new Error(`folder drag did not show a rejection overlay: ${JSON.stringify(drag)}`);
  }

  const uploadSeen = state.page.waitForResponse(uploadResponseMatches, { timeout: 2_500 }).then(() => true).catch(() => false);
  await dispatchWindowDrag(state, "drop", { ...point, directory: "photos" });
  await state.page.waitForFunction(() => {
    const toast = document.querySelector("#toast");
    return toast?.hidden === false && /文件夹/.test(toast.textContent || "");
  }, null, { timeout: 5_000 });
  if (await uploadSeen) {
    throw new Error("dropping a folder started an attachment upload");
  }
  const laterInputs = await state.page.evaluate((offset) => {
    const payloads = [];
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (value.type === "input") payloads.push(String(value.data || ""));
      visit(value.control);
      visit(value.payload);
    };
    for (const message of (window.__testsAutoSentMessages || []).slice(offset)) visit(message);
    return payloads;
  }, start);
  if (laterInputs.some((value) => value.trim())) {
    throw new Error(`folder drop sent terminal input: ${JSON.stringify(laterInputs)}`);
  }

  assertNoFatalErrors();
  await eventLog({
    status: "pass",
    action: "attachment-file-drop-folder-reject",
    overlay: drag.overlay,
    toast: await state.page.locator("#toast").textContent(),
  });
}
