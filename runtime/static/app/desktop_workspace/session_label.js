// Measure the displayed label without changing its full accessible name or
// the workspace label used by the inline rename editor.
export function createDesktopSessionLabels({ documentObject = document, windowObject = window } = {}) {
  const labels = new Map();
  const context = documentObject.createElement("canvas").getContext("2d");
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const characters = (text) => segmenter ? [...segmenter.segment(text)].map((part) => part.segment) : Array.from(text);

  const render = (label) => {
    const text = labels.get(label);
    if (text === undefined || !context) return;
    const width = label.getBoundingClientRect().width;
    if (width <= 0) return;
    const style = windowObject.getComputedStyle(label);
    context.font = style.font;
    const spacing = parseFloat(style.letterSpacing) || 0;
    const measure = (value, length) => context.measureText(value).width + Math.max(0, length - 1) * spacing;
    const visibleText = text.replace(/\s+/gu, " ");
    const parts = characters(visibleText);
    const fit = ({ suffix = false, marker = "" } = {}) => {
      let low = 0;
      let high = parts.length;
      let fitted = 0;
      while (low <= high) {
        const count = Math.floor((low + high) / 2);
        const fragment = (suffix ? parts.slice(parts.length - count) : parts.slice(0, count)).join("");
        if (measure(fragment + marker, count + marker.length) <= width) {
          fitted = count;
          low = count + 1;
        } else high = count - 1;
      }
      return fitted;
    };
    let display = visibleText;
    if (measure(visibleText, parts.length) > width) {
      const firstLineLength = fit();
      const remainder = parts.slice(firstLineLength).join("");
      if (firstLineLength > 0 && measure(remainder, parts.length - firstLineLength) <= width) {
        display = `${parts.slice(0, firstLineLength).join("")}\n${remainder}`;
      } else {
        const head = parts.slice(0, fit({ marker: "…" })).join("");
        const tail = parts.slice(parts.length - fit({ suffix: true })).join("");
        display = `${head}…${tail ? `\n${tail}` : ""}`;
      }
    }
    if (label.textContent !== display) label.textContent = display;
  };
  const observer = new windowObject.ResizeObserver((entries) => {
    for (const { target } of entries) render(target);
  });
  const refresh = () => { for (const label of labels.keys()) render(label); };
  documentObject.fonts?.addEventListener("loadingdone", refresh);

  return Object.freeze({
    set(label, text) {
      if (labels.get(label) === text) return;
      if (!labels.has(label)) observer.observe(label);
      labels.set(label, text);
      label.textContent = text;
      render(label);
    },
    remove(label) {
      observer.unobserve(label);
      labels.delete(label);
    },
    dispose() {
      observer.disconnect();
      documentObject.fonts?.removeEventListener("loadingdone", refresh);
      labels.clear();
    },
  });
}
