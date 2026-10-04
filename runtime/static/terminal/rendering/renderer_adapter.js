const terminalCellFlagInverse = 16;
const terminalCellFlagInvisible = 32;
const terminalCellFlagFaint = 128;
const terminalBaselineSampleText = "\uF303\uF017Hg|pqyj\u00C5\u00C9()[]{}0123456789";
const defaultPixelScrollOffsetEpsilon = 0.001;
const defaultViewportBottomEpsilon = 1;

export function createTerminalRendererAdapter({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  getLineHeightPercent = () => 100,
  normalizeLineHeightPercent = (value) => Number(value) || 100,
  defaultLineHeightPercent = 100,
  getFontSize = () => 16,
  initialFontSize = 16,
  getFontFamily = () => "monospace",
  getBackgroundColorMap = () => null,
  pixelScrollOffsetEpsilon = defaultPixelScrollOffsetEpsilon,
  viewportBottomEpsilon = defaultViewportBottomEpsilon,
} = {}) {
  let disposed = false;

  const terminalViewportValue = (value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  };

  const isTerminalViewportAtBottom = (term) => (
    terminalViewportValue(term?.viewportY) <= viewportBottomEpsilon
    && terminalViewportValue(term?.targetViewportY) <= viewportBottomEpsilon
  );

  const normalizeTerminalBottomViewport = (term) => {
    if (!term || !isTerminalViewportAtBottom(term)) {
      return false;
    }
    term.viewportY = 0;
    term.targetViewportY = 0;
    return true;
  };

  const captureViewport = (term) => ({
    atBottom: isTerminalViewportAtBottom(term),
    viewportY: terminalViewportValue(term?.viewportY),
    targetViewportY: terminalViewportValue(term?.targetViewportY),
  });

  const terminalCellBleedPx = (renderer) => {
    const dpr = Number(renderer?.devicePixelRatio) || Number(windowObject?.devicePixelRatio) || 1;
    return Math.min(0.75, Math.max(0.35, 0.75 / dpr));
  };

  const terminalCanvasPixelPx = (renderer) => {
    const dpr = Number(renderer?.devicePixelRatio) || Number(windowObject?.devicePixelRatio) || 1;
    return 1 / dpr;
  };

  const terminalAlignToCanvasPixel = (renderer, value, mode = "round") => {
    const pixel = terminalCanvasPixelPx(renderer);
    const scaled = value / pixel;
    if (mode === "floor") {
      return Math.floor(scaled) * pixel;
    }
    if (mode === "ceil") {
      return Math.ceil(scaled) * pixel;
    }
    return Math.round(scaled) * pixel;
  };

  const terminalIsPixelScrollRender = (offsetY = 0) => (
    Math.abs(Number(offsetY) || 0) > pixelScrollOffsetEpsilon
  );

  const terminalLineHeightRatio = () => (
    normalizeLineHeightPercent(getLineHeightPercent()) / defaultLineHeightPercent
  );

  const applyTerminalLineHeightToMetrics = (metrics) => {
    const width = Number(metrics?.width) || 0;
    const height = Number(metrics?.height) || 0;
    const baseline = Number(metrics?.baseline) || 0;
    if (!width || !height || !baseline) {
      return metrics;
    }
    const ratio = terminalLineHeightRatio();
    const nextHeight = Math.max(height, Math.ceil(height * ratio));
    const extra = nextHeight - height;
    if (extra <= 0) {
      return metrics;
    }
    const nextBaseline = Math.round(baseline + (extra / 2));
    return {
      ...metrics,
      height: nextHeight,
      baseline: Math.max(1, Math.min(nextHeight - 1, nextBaseline)),
    };
  };

  const terminalAdjustedFontMetrics = (renderer, metrics) => {
    const width = Number(metrics?.width) || 0;
    const height = Number(metrics?.height) || 0;
    const baseline = Number(metrics?.baseline) || 0;
    if (!width || !height || !baseline) {
      return metrics;
    }
    if (!renderer) {
      return applyTerminalLineHeightToMetrics(metrics);
    }
    const context = documentObject?.createElement?.("canvas")?.getContext?.("2d");
    if (!context) {
      return applyTerminalLineHeightToMetrics(metrics);
    }
    context.font = `${renderer.fontSize}px ${renderer.fontFamily}`;
    context.textBaseline = "alphabetic";
    const measured = context.measureText(terminalBaselineSampleText);
    const ascent = Number(measured.actualBoundingBoxAscent);
    const descent = Number(measured.actualBoundingBoxDescent);
    if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent <= 0) {
      return applyTerminalLineHeightToMetrics(metrics);
    }
    const nextHeight = Math.max(height, Math.ceil(ascent + descent) + 2);
    const nextBaseline = Math.round((nextHeight + ascent - descent) / 2);
    return applyTerminalLineHeightToMetrics({
      ...metrics,
      height: nextHeight,
      baseline: Math.max(1, Math.min(nextHeight - 1, nextBaseline)),
    });
  };

  const terminalEstimatedFontMetrics = () => {
    if (disposed) {
      return null;
    }
    const context = documentObject?.createElement?.("canvas")?.getContext?.("2d");
    if (!context) {
      return null;
    }
    const terminalFontSize = getFontSize() || initialFontSize;
    const fontFamily = getFontFamily();
    context.font = `${terminalFontSize}px ${fontFamily}`;
    const measured = context.measureText("M");
    const width = Math.ceil(Number(measured.width) || 0);
    const ascent = Number(measured.actualBoundingBoxAscent) || terminalFontSize * 0.8;
    const descent = Number(measured.actualBoundingBoxDescent) || terminalFontSize * 0.2;
    const height = Math.ceil(ascent + descent) + 2;
    const baseline = Math.ceil(ascent) + 1;
    if (!width || !height || !baseline) {
      return null;
    }
    return terminalAdjustedFontMetrics(
      { fontSize: terminalFontSize, fontFamily },
      { width, height, baseline },
    );
  };

  const terminalPowerlineShape = (renderer, cell, column, row) => {
    let text = "";
    if (cell?.grapheme_len > 0 && renderer?.currentBuffer?.getGraphemeString) {
      text = renderer.currentBuffer.getGraphemeString(row, column);
    } else if (cell?.codepoint) {
      text = String.fromCodePoint(cell.codepoint);
    }
    if (text === "\uE0B6") {
      return "round-left";
    }
    if (text === "\uE0B4") {
      return "round-right";
    }
    if (text === "\uE0B0") {
      return "arrow-right";
    }
    return "";
  };

  const terminalCellForegroundCSS = (renderer, cell, column, row) => {
    if (renderer.isInSelection?.(column, row)) {
      return renderer.theme.selectionForeground;
    }
    let red = cell.fg_r;
    let green = cell.fg_g;
    let blue = cell.fg_b;
    if (cell.flags & terminalCellFlagInverse) {
      red = cell.bg_r;
      green = cell.bg_g;
      blue = cell.bg_b;
    }
    return renderer.rgbToCSS(red, green, blue);
  };

  const terminalCellBackgroundRGB = (cell) => {
    let red = cell?.bg_r;
    let green = cell?.bg_g;
    let blue = cell?.bg_b;
    if (cell?.flags & terminalCellFlagInverse) {
      red = cell.fg_r;
      green = cell.fg_g;
      blue = cell.fg_b;
    }
    return {
      red: Number(red) || 0,
      green: Number(green) || 0,
      blue: Number(blue) || 0,
    };
  };

  const terminalSameRGB = (left, right) => (
    left && right && left.red === right.red && left.green === right.green && left.blue === right.blue
  );

  const terminalLineCellAt = (renderer, row, column) => {
    if (column < 0) {
      return null;
    }
    const snapshot = renderer?.currentViewportSnapshot;
    const cols = Number(renderer?.currentViewportSnapshotCols || 0);
    const rows = Number(renderer?.currentViewportSnapshotRows || 0);
    if (snapshot && cols > 0 && rows > 0 && row >= 0 && row < rows && column < cols) {
      return snapshot[row * cols + column] || null;
    }
    try {
      const line = renderer?.currentBuffer?.getLine?.(row);
      return line?.[column] || null;
    } catch (error) {
      return null;
    }
  };

  const terminalCellBackgroundCSS = (renderer, cell, column, row) => {
    if (renderer.isInSelection?.(column, row)) {
      return renderer.theme.selectionBackground;
    }
    const { red, green, blue } = terminalCellBackgroundRGB(cell);
    if (red === 0 && green === 0 && blue === 0) {
      return "";
    }
    return (renderer.webshellBackgroundRGBToCSS || renderer.rgbToCSS.bind(renderer))(red, green, blue);
  };

  const renderTerminalMergedLineBackgrounds = (renderer, line, row, columns, offsetY = 0) => {
    const metrics = renderer.metrics || renderer.getMetrics?.();
    const width = Number(metrics?.width) || 0;
    const height = Number(metrics?.height) || 0;
    if (!width || !height) {
      return false;
    }
    const rawY = row * height + offsetY;
    const y = terminalAlignToCanvasPixel(renderer, rawY, "floor");
    const bottom = terminalAlignToCanvasPixel(renderer, rawY + height, "ceil");
    const fillHeight = Math.max(terminalCanvasPixelPx(renderer), bottom - y);
    const canvasWidth = Math.max(
      columns * width,
      (Number(renderer.canvas?.width) || 0) / (Number(renderer.devicePixelRatio) || Number(windowObject?.devicePixelRatio) || 1),
    );
    renderer.ctx.fillStyle = renderer.theme.background;
    renderer.ctx.fillRect(0, y, canvasWidth, fillHeight);
    let segmentColor = "";
    let segmentStart = 0;
    let segmentEnd = 0;
    const flushSegment = () => {
      if (!segmentColor || segmentEnd <= segmentStart) {
        return;
      }
      renderer.ctx.fillStyle = segmentColor;
      renderer.ctx.fillRect(segmentStart * width, y, (segmentEnd - segmentStart) * width, fillHeight);
    };
    for (let column = 0; column < line.length; column += 1) {
      const cell = line[column];
      if (!cell || cell.width === 0) {
        continue;
      }
      const cellWidth = Math.max(1, Number(cell.width) || 1);
      const color = terminalCellBackgroundCSS(renderer, cell, column, row);
      if (color && color === segmentColor && column === segmentEnd) {
        segmentEnd = column + cellWidth;
        continue;
      }
      flushSegment();
      segmentColor = color;
      segmentStart = column;
      segmentEnd = color ? column + cellWidth : column;
    }
    flushSegment();
    return true;
  };

  const terminalPowerlineCellBox = (renderer, cell, column, row, offsetY = 0) => {
    const metrics = renderer.metrics || renderer.getMetrics?.();
    const cellWidth = Number(cell?.width) || 0;
    const width = (Number(metrics?.width) || 0) * cellWidth;
    const height = Number(metrics?.height) || 0;
    if (!width || !height) {
      return null;
    }
    const rawTop = row * height + offsetY;
    const rawBottom = rawTop + height;
    const y = terminalAlignToCanvasPixel(renderer, rawTop, "ceil");
    const bottom = terminalAlignToCanvasPixel(renderer, rawBottom, "floor");
    return {
      width,
      height: Math.max(terminalCanvasPixelPx(renderer), bottom - y),
      x: column * Number(metrics.width),
      y,
    };
  };

  const drawTerminalPowerlineRoundCap = (renderer, direction, cell, column, row, offsetY = 0) => {
    const box = terminalPowerlineCellBox(renderer, cell, column, row, offsetY);
    if (!box) {
      return false;
    }
    const bleed = terminalCellBleedPx(renderer);
    const centerX = direction === "left" ? box.x + box.width + bleed : box.x - bleed;
    const centerY = box.y + box.height / 2;
    const previousAlpha = renderer.ctx.globalAlpha;
    renderer.ctx.save();
    renderer.ctx.beginPath();
    renderer.ctx.rect(box.x - bleed, box.y, box.width + bleed * 2, box.height);
    renderer.ctx.clip();
    renderer.ctx.fillStyle = terminalCellForegroundCSS(renderer, cell, column, row);
    if (cell.flags & terminalCellFlagFaint) {
      renderer.ctx.globalAlpha = previousAlpha * 0.5;
    }
    renderer.ctx.beginPath();
    renderer.ctx.moveTo(centerX, box.y);
    renderer.ctx.ellipse(
      centerX,
      centerY,
      box.width + bleed * 2,
      box.height / 2,
      0,
      -Math.PI / 2,
      Math.PI / 2,
      direction === "left",
    );
    renderer.ctx.closePath();
    renderer.ctx.fill();
    renderer.ctx.restore();
    renderer.ctx.globalAlpha = previousAlpha;
    return true;
  };

  const drawTerminalPowerlineArrow = (renderer, direction, cell, column, row, offsetY = 0) => {
    const box = terminalPowerlineCellBox(renderer, cell, column, row, offsetY);
    if (!box) {
      return false;
    }
    const bleed = terminalCellBleedPx(renderer);
    const pixel = terminalCanvasPixelPx(renderer);
    const baseBleed = Math.max(bleed, pixel);
    const baseOuter = direction === "right" ? box.x - baseBleed : box.x + box.width + baseBleed;
    const tip = direction === "right" ? box.x + box.width + bleed : box.x - bleed;
    const clipLeft = Math.min(baseOuter, tip) - pixel;
    const clipRight = Math.max(baseOuter, tip) + pixel;
    const previousAlpha = renderer.ctx.globalAlpha;
    renderer.ctx.save();
    renderer.ctx.beginPath();
    renderer.ctx.rect(clipLeft, box.y, clipRight - clipLeft, box.height);
    renderer.ctx.clip();
    renderer.ctx.fillStyle = terminalCellForegroundCSS(renderer, cell, column, row);
    if (cell.flags & terminalCellFlagFaint) {
      renderer.ctx.globalAlpha = previousAlpha * 0.5;
    }
    renderer.ctx.beginPath();
    renderer.ctx.moveTo(baseOuter, box.y);
    renderer.ctx.lineTo(tip, box.y + box.height / 2);
    renderer.ctx.lineTo(baseOuter, box.y + box.height);
    renderer.ctx.closePath();
    renderer.ctx.fill();
    renderer.ctx.restore();
    renderer.ctx.globalAlpha = previousAlpha;
    return true;
  };

  const drawTerminalPowerlineShape = (renderer, shape, cell, column, row, offsetY = 0) => {
    if (shape === "round-left") {
      return drawTerminalPowerlineRoundCap(renderer, "left", cell, column, row, offsetY);
    }
    if (shape === "round-right") {
      return drawTerminalPowerlineRoundCap(renderer, "right", cell, column, row, offsetY);
    }
    if (shape === "arrow-right") {
      return drawTerminalPowerlineArrow(renderer, "right", cell, column, row, offsetY);
    }
    return false;
  };

  const syncBackgroundColors = (session) => {
    const renderer = session?.term?.renderer;
    if (disposed || !renderer) return false;
    const next = getBackgroundColorMap(session, renderer.theme);
    if ((renderer.webshellBackgroundColorMap || null) === next) return false;
    renderer.webshellBackgroundColorMap = next;
    return true;
  };

  const installThemeMapper = (session) => {
    const renderer = session?.term?.renderer;
    if (disposed || !renderer || renderer.webshellThemeMapperInstalled || typeof renderer.rgbToCSS !== "function") {
      return false;
    }
    renderer.webshellThemeMapperInstalled = true;
    renderer.webshellOriginalRGBToCSS = renderer.rgbToCSS.bind(renderer);
    const mappedRGBToCSS = (red, green, blue) => {
      const mapped = renderer.webshellColorMap?.get(`${red},${green},${blue}`);
      return mapped || renderer.webshellOriginalRGBToCSS(red, green, blue);
    };
    renderer.webshellBackgroundRGBToCSS = (red, green, blue) => (
      renderer.webshellBackgroundColorMap?.get(`${red},${green},${blue}`)
      || mappedRGBToCSS(red, green, blue)
    );
    renderer.rgbToCSS = (red, green, blue) => (
      renderer.webshellRenderingBackground
        ? renderer.webshellBackgroundRGBToCSS(red, green, blue)
        : mappedRGBToCSS(red, green, blue)
    );
    if (typeof renderer.render === "function") {
      const render = renderer.render.bind(renderer);
      renderer.render = (buffer, forceAll = false, ...args) => {
        const changed = syncBackgroundColors(session);
        return render(buffer, forceAll || changed, ...args);
      };
    }
    return true;
  };

  const installBottomScrollbar = (session) => {
    const term = session?.term;
    if (disposed || !term || term.webshellBottomScrollbarPatchInstalled) {
      return false;
    }
    term.webshellBottomScrollbarPatchInstalled = true;

    if (typeof term.showScrollbar === "function") {
      term.webshellOriginalShowScrollbar = term.showScrollbar.bind(term);
      term.showScrollbar = (...args) => {
        if (term.webshellSuppressBottomScrollbar && normalizeTerminalBottomViewport(term)) {
          return;
        }
        return term.webshellOriginalShowScrollbar(...args);
      };
    }

    if (typeof term.scrollToBottom === "function") {
      term.webshellOriginalScrollToBottom = term.scrollToBottom.bind(term);
      term.scrollToBottom = (...args) => {
        if (normalizeTerminalBottomViewport(term)) {
          return;
        }
        return term.webshellOriginalScrollToBottom(...args);
      };
    }

    if (typeof term.write === "function") {
      term.webshellOriginalWrite = term.write.bind(term);
      term.write = (...args) => {
        const previous = term.webshellSuppressBottomScrollbar === true;
        term.webshellSuppressBottomScrollbar = true;
        try {
          return term.webshellOriginalWrite(...args);
        } finally {
          term.webshellSuppressBottomScrollbar = previous;
          normalizeTerminalBottomViewport(term);
        }
      };
    }
    return true;
  };

  const installBaseline = (session) => {
    const renderer = session?.term?.renderer;
    if (disposed || !renderer || renderer.webshellBaselinePatchInstalled || typeof renderer.measureFont !== "function") {
      return false;
    }
    renderer.webshellBaselinePatchInstalled = true;
    renderer.webshellOriginalMeasureFont = renderer.measureFont.bind(renderer);
    renderer.measureFont = () => terminalAdjustedFontMetrics(renderer, renderer.webshellOriginalMeasureFont());
    renderer.metrics = renderer.measureFont();
    return true;
  };

  const installCellSeam = (session) => {
    const renderer = session?.term?.renderer;
    if (disposed || !renderer || renderer.webshellCellSeamPatchInstalled || typeof renderer.renderCellBackground !== "function") {
      return false;
    }
    renderer.webshellCellSeamPatchInstalled = true;
    const renderCellBackground = renderer.renderCellBackground.bind(renderer);
    renderer.webshellOriginalRenderCellBackground = (...args) => {
      const previous = renderer.webshellRenderingBackground;
      renderer.webshellRenderingBackground = true;
      try {
        return renderCellBackground(...args);
      } finally {
        renderer.webshellRenderingBackground = previous;
      }
    };
    renderer.renderCellBackground = (cell, column, row, offsetY = 0) => {
      renderer.webshellOriginalRenderCellBackground(cell, column, row, offsetY);
      if (terminalIsPixelScrollRender(offsetY)) {
        return;
      }
      const metrics = renderer.metrics || renderer.getMetrics?.();
      const width = Number(metrics?.width) || 0;
      const height = Number(metrics?.height) || 0;
      const cellWidth = Number(cell?.width) || 0;
      if (!width || !height || !cellWidth || renderer.isInSelection?.(column, row)) {
        return;
      }
      const { red, green, blue } = terminalCellBackgroundRGB(cell);
      if (red === 0 && green === 0 && blue === 0) {
        return;
      }
      const bleed = terminalCellBleedPx(renderer);
      const rgb = { red, green, blue };
      const leftCell = terminalLineCellAt(renderer, row, column - 1);
      const rightCell = terminalLineCellAt(renderer, row, column + cellWidth);
      const bleedLeft = terminalSameRGB(rgb, terminalCellBackgroundRGB(leftCell)) ? bleed : 0;
      const bleedRight = terminalSameRGB(rgb, terminalCellBackgroundRGB(rightCell)) ? bleed : 0;
      if (!bleedLeft && !bleedRight) {
        return;
      }
      const x = column * width - bleedLeft;
      const y = row * height + offsetY;
      renderer.ctx.fillStyle = (renderer.webshellBackgroundRGBToCSS || renderer.rgbToCSS.bind(renderer))(red, green, blue);
      renderer.ctx.fillRect(x, y, width * cellWidth + bleedLeft + bleedRight, height);
    };
    if (typeof renderer.renderCursor === "function") {
      renderer.webshellOriginalRenderCursor = renderer.renderCursor.bind(renderer);
      renderer.renderCursor = (column, row) => {
        if (renderer.cursorStyle !== "block") {
          renderer.webshellOriginalRenderCursor(column, row);
          return;
        }
        const metrics = renderer.metrics || renderer.getMetrics?.();
        const width = Number(metrics?.width) || 0;
        const height = Number(metrics?.height) || 0;
        if (!width || !height) {
          renderer.webshellOriginalRenderCursor(column, row);
          return;
        }
        const bleed = terminalCellBleedPx(renderer);
        renderer.ctx.fillStyle = renderer.theme.cursor;
        renderer.ctx.fillRect(column * width - bleed, row * height, width + bleed * 2, height);
      };
    }
    if (typeof renderer.renderCellText === "function") {
      renderer.webshellOriginalRenderCellText = renderer.renderCellText.bind(renderer);
      renderer.renderCellText = (cell, column, row, offsetY = 0) => {
        if (terminalIsPixelScrollRender(offsetY)) {
          renderer.webshellOriginalRenderCellText(cell, column, row, offsetY);
          return;
        }
        if (!(cell.flags & terminalCellFlagInvisible)) {
          const shape = terminalPowerlineShape(renderer, cell, column, row);
          if (shape && drawTerminalPowerlineShape(renderer, shape, cell, column, row, offsetY)) {
            return;
          }
        }
        renderer.webshellOriginalRenderCellText(cell, column, row, offsetY);
      };
    }
    if (typeof renderer.renderLine === "function") {
      renderer.webshellOriginalRenderLine = renderer.renderLine.bind(renderer);
      renderer.renderLine = (line, row, columns, offsetY = 0) => {
        if (terminalIsPixelScrollRender(offsetY)) {
          const patchedRenderCellBackground = renderer.renderCellBackground;
          const patchedRenderCellText = renderer.renderCellText;
          renderer.renderCellBackground = renderer.webshellOriginalRenderCellBackground || patchedRenderCellBackground;
          renderer.renderCellText = renderer.webshellOriginalRenderCellText || patchedRenderCellText;
          try {
            renderer.webshellOriginalRenderLine(line, row, columns, offsetY);
          } finally {
            renderer.renderCellBackground = patchedRenderCellBackground;
            renderer.renderCellText = patchedRenderCellText;
          }
          return;
        }
        if (!renderTerminalMergedLineBackgrounds(renderer, line, row, columns, offsetY)) {
          renderer.webshellOriginalRenderLine(line, row, columns, offsetY);
          return;
        }
        for (let column = 0; column < line.length; column += 1) {
          const cell = line[column];
          if (cell?.width !== 0) {
            renderer.renderCellText(cell, column, row, offsetY);
          }
        }
      };
    }
    return true;
  };

  const syncRuntime = (session) => {
    if (disposed) {
      return false;
    }
    installBaseline(session);
    installThemeMapper(session);
    installCellSeam(session);
    return true;
  };

  return Object.freeze({
    adjustFontMetrics: terminalAdjustedFontMetrics,
    captureViewport,

    dispose() {
      disposed = true;
    },

    estimatedFontMetrics: terminalEstimatedFontMetrics,
    installBaseline,
    installBottomScrollbar,
    installCellSeam,

    installSession(session) {
      if (disposed) {
        return false;
      }
      installBottomScrollbar(session);
      syncRuntime(session);
      return true;
    },

    installThemeMapper,
    normalizeBottomViewport: normalizeTerminalBottomViewport,
    syncRuntime,
    syncBackgroundColors,
  });
}
