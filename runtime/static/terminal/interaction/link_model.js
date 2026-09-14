import { terminalLogicalLineAt } from "./terminal_text_model.js";

const terminalURLSource = String.raw`(?:https?:\/\/|mailto:|ftp:\/\/|ssh:\/\/|git:\/\/|tel:|magnet:|gemini:\/\/|gopher:\/\/|news:)[\w\-.~:\/?#@!$&*+,;=%]+`;
const trailingURLPunctuation = /[.,;!?)\]]+$/;

export const findFirstTerminalURL = (text) => {
  const value = String(text || "");
  if (!value) {
    return "";
  }
  const match = new RegExp(terminalURLSource, "i").exec(value);
  return match ? match[0].replace(trailingURLPunctuation, "") : "";
};

export const findTerminalURLAtPosition = (session, clientX, clientY) => {
  const term = session?.term;
  const renderer = term?.renderer;
  const canvas = term?.canvas || term?.element?.querySelector?.("canvas");
  if (!term || !renderer || !canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const charWidth = renderer.charWidth || renderer.getMetrics?.().width || 10;
  const charHeight = renderer.charHeight || renderer.getMetrics?.().height || 18;
  const col = Math.floor((clientX - rect.left) / charWidth);
  const viewportRow = Math.floor((clientY - rect.top) / charHeight);
  if (viewportRow < 0 || viewportRow >= term.rows) {
    return null;
  }
  const scrollback = term.wasmTerm?.getScrollbackLength?.() || 0;
  const absoluteRow = scrollback + viewportRow - Math.floor(term.getViewportY?.() || term.viewportY || 0);
  if (term.wasmTerm?.isRemote) return term.wasmTerm.findLink(absoluteRow, col);
  const logical = terminalLogicalLineAt(term, absoluteRow);
  if (!logical) {
    return null;
  }
  const pattern = new RegExp(terminalURLSource, "gi");
  let match = pattern.exec(logical.text);
  while (match) {
    const url = match[0].replace(trailingURLPunctuation, "");
    const start = match.index;
    const end = start + url.length - 1;
    const startPosition = logical.positions[start];
    const endPosition = logical.positions[end];
    const pointerIndex = logical.positions.findIndex((position) => position.row === absoluteRow && position.col === col);
    if (url.length > 0 && pointerIndex >= start && pointerIndex <= end && startPosition && endPosition) {
      return { url, start: startPosition, end: endPosition };
    }
    match = pattern.exec(logical.text);
  }
  return null;
};
