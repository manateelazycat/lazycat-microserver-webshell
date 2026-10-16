const cellFlagInverse = 16;
const cellFlagFaint = 128;

const colorRGB = (color) => {
  const value = String(color || "").trim();
  const hex = value.match(/^#([\da-f]{6}|[\da-f]{3})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? Array.from(hex, (digit) => digit + digit).join("") : hex;
    return [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16));
  }
  const rgb = value.match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
  return rgb ? rgb.slice(1).map(Number) : null;
};

const luminance = (rgb) => rgb.reduce((total, channel, index) => {
  const value = channel / 255;
  const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return total + linear * [0.2126, 0.7152, 0.0722][index];
}, 0);

const cursorTextRGB = (cursorColor, backgroundColor) => {
  const cursor = luminance(colorRGB(cursorColor) || [255, 255, 255]);
  const background = colorRGB(backgroundColor);
  if (background) {
    const text = luminance(background);
    if ((Math.max(cursor, text) + 0.05) / (Math.min(cursor, text) + 0.05) >= 4.5) {
      return background;
    }
  }
  return (cursor + 0.05) / 0.05 >= 1.05 / (cursor + 0.05) ? [0, 0, 0] : [255, 255, 255];
};

const resolveCursorCell = (renderer, getCell, row, column) => {
  let cellColumn = column;
  let cell = getCell(renderer, row, cellColumn);
  if (cell?.width === 0 && column > 0) {
    const previous = getCell(renderer, row, column - 1);
    if (previous?.width > 1) {
      cellColumn -= 1;
      cell = previous;
    }
  }
  return { cell, column: cellColumn };
};

const drawTerminalCursorShape = (renderer, style, x, y, width, height, bleed) => {
  const context = renderer.ctx;
  context.fillStyle = renderer.theme.cursor;
  switch (style) {
    case "block":
      context.fillRect(x - bleed, y, width + (bleed * 2), height);
      return true;
    case "underline": {
      const thickness = Math.max(2, Math.floor(height * 0.15));
      context.fillRect(x, y + height - thickness, width, thickness);
      return true;
    }
    case "bar": {
      const thickness = Math.max(2, Math.floor(width * 0.15));
      context.fillRect(x, y, thickness, height);
      return true;
    }
    default:
      return false;
  }
};

const drawTerminalCursorText = (renderer, cursorRect, {
  getCell,
  getBackground,
}) => {
  if (typeof renderer.renderCellText !== "function") return;
  const metrics = renderer.metrics || renderer.getMetrics?.();
  const width = Number(metrics?.width) || 0;
  const height = Number(metrics?.height) || 0;
  if (!width || !height) return;

  const startColumn = Math.max(0, Math.floor(cursorRect.left / width));
  const endColumn = Math.max(startColumn, Math.ceil(cursorRect.right / width) - 1);
  const startRow = Math.max(0, Math.floor(cursorRect.top / height));
  const endRow = Math.max(startRow, Math.ceil(cursorRect.bottom / height) - 1);
  const rendered = new Set();

  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const resolved = resolveCursorCell(renderer, getCell, row, column);
      const cell = resolved.cell;
      if (!cell) continue;
      const key = `${row}:${resolved.column}`;
      if (rendered.has(key)) continue;
      rendered.add(key);

      const cellWidth = Math.max(1, Number(cell.width) || 1) * width;
      const cellRect = {
        left: resolved.column * width,
        right: (resolved.column * width) + cellWidth,
        top: row * height,
        bottom: (row + 1) * height,
      };
      const clip = {
        left: Math.max(cursorRect.left, cellRect.left),
        right: Math.min(cursorRect.right, cellRect.right),
        top: Math.max(cursorRect.top, cellRect.top),
        bottom: Math.min(cursorRect.bottom, cellRect.bottom),
      };
      if (clip.right <= clip.left || clip.bottom <= clip.top) continue;

      const background = getBackground(renderer, cell, resolved.column, row) || renderer.theme.background;
      const [red, green, blue] = cursorTextRGB(renderer.theme.cursor, background);
      const cursorCell = {
        ...cell,
        fg_r: red,
        fg_g: green,
        fg_b: blue,
        flags: (Number(cell.flags) || 0) & ~(cellFlagInverse | cellFlagFaint),
      };
      const selection = renderer.currentSelectionCoords;
      const colorMap = renderer.webshellColorMap;
      renderer.ctx.save();
      try {
        renderer.currentSelectionCoords = null;
        renderer.webshellColorMap = null;
        renderer.ctx.beginPath();
        renderer.ctx.rect(clip.left, clip.top, clip.right - clip.left, clip.bottom - clip.top);
        renderer.ctx.clip();
        renderer.renderCellText(cursorCell, resolved.column, row, 0);
      } finally {
        renderer.currentSelectionCoords = selection;
        renderer.webshellColorMap = colorMap;
        renderer.ctx.restore();
      }
    }
  }
};

function createTerminalCursorLayer({ documentObject, renderer, container, getCell, getBackground }) {
  const canvas = documentObject.createElement("canvas");
  canvas.className = "terminal-cursor-layer";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  canvas.style.display = "none";
  container.appendChild(canvas);
  const hide = () => { canvas.style.display = "none"; };

  return {
    canvas,
    hide,
    dispose: () => canvas.remove(),

    draw(column, row, { displayColumn = column, displayRow = row, bleed = 0 }) {
      const { width, height } = renderer.metrics;
      if (!width || !height) return hide();
      const target = resolveCursorCell(renderer, getCell, row, column);
      const block = renderer.cursorStyle === "block";
      const padding = block ? bleed : 0;
      const shapeWidth = (block ? Math.max(1, target.cell?.width || 1) : 1) * width;
      const left = (displayColumn * width) - padding;
      const top = displayRow * height;
      const cssWidth = shapeWidth + (padding * 2);
      const dpr = renderer.devicePixelRatio;
      const backingWidth = Math.max(1, Math.ceil(cssWidth * dpr));
      const backingHeight = Math.max(1, Math.ceil(height * dpr));
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${height}px`;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      const rendererContext = renderer.ctx;
      const lastRenderFont = renderer.lastRenderFont;
      let drawn;
      context.save();
      try {
        renderer.ctx = context;
        // The overlay has its own font state; never reuse the main Canvas cache.
        renderer.lastRenderFont = "";
        context.globalAlpha = 1;
        drawn = drawTerminalCursorShape(renderer, renderer.cursorStyle, displayColumn * width, top, shapeWidth, height, padding);
        if (drawn && block) {
          drawTerminalCursorText(renderer, {
            left, right: left + cssWidth, top, bottom: top + height,
          }, { getCell, getBackground });
        }
      } finally {
        context.restore();
        renderer.ctx = rendererContext;
        renderer.lastRenderFont = lastRenderFont;
      }
      canvas.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      canvas.style.display = drawn ? "block" : "none";
    },
  };
}

export function installTerminalCursor({
  session,
  documentObject,
  windowObject,
  workScheduler,
  isAnimationAllowed,
  getCell,
  getBackground,
  getBleed,
}) {
  const { term } = session;
  const renderer = term.renderer;
  const layer = createTerminalCursorLayer({
    documentObject, renderer, container: session.terminalHost, getCell, getBackground,
  });
  if (!layer) return null; // Keep Ghostty's cursor if an overlay context is unavailable.
  session.terminalCursorLayer = layer.canvas;
  const render = renderer.render.bind(renderer);
  const renderCursor = renderer.renderCursor.bind(renderer);
  const now = () => windowObject.performance.now();
  let from = null;
  let target = null;
  let startedAt = 0;
  let firstRender = true;
  let cursorDrawn = false;

  const position = (at) => {
    const progress = Math.min(1, Math.max(0, (at - startedAt) / 100));
    const eased = 1 - ((1 - progress) ** 3);
    return {
      column: from.column + ((target.column - from.column) * eased),
      row: from.row + ((target.row - from.row) * eased),
      active: progress < 1 && (from.column !== target.column || from.row !== target.row),
    };
  };
  const reset = () => {
    workScheduler?.cancel(session, "cursor");
    from = target = null;
    layer.hide();
  };
  const draw = () => {
    const cursor = renderer.currentBuffer?.getCursor();
    if (!target || !renderer.cursorVisible || !cursor?.visible || Number(term.viewportY || 0) > 0.001) {
      reset();
      return;
    }
    // Gates stop interpolation, never ownership of the visible cursor.
    if (!workScheduler || !isAnimationAllowed()) from = target;
    const displayed = position(now());
    layer.draw(target.column, target.row, {
      displayColumn: displayed.column, displayRow: displayed.row, bleed: getBleed(renderer),
    });
    if (displayed.active) workScheduler.schedule(session, "cursor", draw, { priority: () => 3 });
  };
  renderer.renderCursor = (column, row) => {
    cursorDrawn = true;
    const next = { column: resolveCursorCell(renderer, getCell, row, column).column, row };
    const at = now();
    const current = target ? position(at) : next;
    if (!target || !isAnimationAllowed() || Math.hypot(next.column - current.column, next.row - current.row) > 8) {
      from = next;
    } else if (target.column !== next.column || target.row !== next.row) {
      from = current;
      startedAt = at;
    }
    target = next;
    draw();
  };
  renderer.render = (buffer, full, ...args) => {
    cursorDrawn = false;
    const rendered = render(buffer, firstRender || full, ...args);
    if (rendered) {
      firstRender = false;
      if (!cursorDrawn) reset();
    }
    return rendered;
  };

  return {
    reset,
    dispose() {
      reset();
      layer.dispose();
      session.terminalCursorLayer = null;
      renderer.render = render;
      renderer.renderCursor = renderCursor;
    },
  };
}
