const DEFAULT_MAX_CANVAS_PIXELS = 16 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_PIXELS = 48 * 1024 * 1024;
const DEFAULT_MAX_PARTS = 4;
const MAX_CANVAS_DIMENSION = 16000;

const nextFrame = () => new Promise((resolve) => {
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => resolve());
  } else {
    window.setTimeout(resolve, 0);
  }
});

const normalizedNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const captureTerminalGeometry = (session, renderer) => {
  const manager = session?.term?.wasmTerm;
  const term = session?.term;
  const metrics = renderer?.getMetrics?.();
  const cols = Math.max(1, Math.floor(normalizedNumber(term?.cols || manager?.cols)));
  const activeRows = Math.max(1, Math.floor(normalizedNumber(term?.rows || manager?.rows)));
  const scrollbackRows = Math.max(0, Math.floor(normalizedNumber(manager?.getScrollbackLength?.())));
  const viewportY = Math.max(0, Math.min(scrollbackRows, Math.floor(normalizedNumber(term?.getViewportY?.() ?? term?.viewportY))));
  if (!manager || !metrics?.width || !metrics?.height) {
    return null;
  }
  const startRow = Math.max(0, scrollbackRows - viewportY);
  return Object.freeze({
    manager,
    cols,
    activeRows,
    scrollbackRows,
    viewportY,
    startRow,
    endRow: scrollbackRows + activeRows,
    totalRows: Math.max(0, scrollbackRows + activeRows - startRow),
    scrollbackGeneration: normalizedNumber(manager.getScrollbackGeneration?.()),
    contentGeneration: normalizedNumber(session?.terminalContentGeneration),
    replayGeneration: normalizedNumber(session?.terminalReplayGeneration),
    fitGeneration: normalizedNumber(session?.measuredFitGeneration),
    resizeEpoch: String(session?.appliedResizeEpoch || session?.requestedResizeEpoch || ""),
    fontMetricsGeneration: normalizedNumber(session?.fontMetricsGeneration),
    metricWidth: normalizedNumber(metrics.width),
    metricHeight: normalizedNumber(metrics.height),
    metricBaseline: normalizedNumber(metrics.baseline),
    fontSize: normalizedNumber(renderer?.fontSize),
    fontFamily: String(renderer?.fontFamily || ""),
    devicePixelRatio: normalizedNumber(window.devicePixelRatio || 1),
    themeFingerprint: JSON.stringify(renderer?.theme || {}),
    backgroundColorMap: renderer?.webshellBackgroundColorMap || null,
  });
};

export const terminalGeometryMatches = (snapshot, session, renderer) => {
  if (!snapshot || snapshot.manager !== session?.term?.wasmTerm) {
    return false;
  }
  const current = captureTerminalGeometry(session, renderer);
  return Boolean(current
    && current.cols === snapshot.cols
    && current.activeRows === snapshot.activeRows
    && current.scrollbackRows === snapshot.scrollbackRows
    && current.viewportY === snapshot.viewportY
    && current.scrollbackGeneration === snapshot.scrollbackGeneration
    && current.contentGeneration === snapshot.contentGeneration
    && current.replayGeneration === snapshot.replayGeneration
    && current.fitGeneration === snapshot.fitGeneration
    && current.resizeEpoch === snapshot.resizeEpoch
    && current.fontMetricsGeneration === snapshot.fontMetricsGeneration
    && current.metricWidth === snapshot.metricWidth
    && current.metricHeight === snapshot.metricHeight
    && current.metricBaseline === snapshot.metricBaseline
    && current.fontSize === snapshot.fontSize
    && current.fontFamily === snapshot.fontFamily
    && current.devicePixelRatio === snapshot.devicePixelRatio
    && current.themeFingerprint === snapshot.themeFingerprint
    && current.backgroundColorMap === snapshot.backgroundColorMap);
};

export const planTerminalScreenshotParts = ({
  totalRows,
  rowHeight,
  cssWidth,
  headerHeight,
  footerHeight,
  devicePixelRatio,
  maxCanvasPixels = DEFAULT_MAX_CANVAS_PIXELS,
  maxTotalPixels = DEFAULT_MAX_TOTAL_PIXELS,
  maxParts = DEFAULT_MAX_PARTS,
}) => {
  const ratio = Math.max(1, Math.min(2, normalizedNumber(devicePixelRatio) || 1, 8192 / Math.max(1, cssWidth)));
  const pixelWidth = Math.max(1, Math.ceil(cssWidth * ratio));
  const maxPixelHeight = Math.max(1024, Math.min(MAX_CANVAS_DIMENSION, Math.floor(maxCanvasPixels / pixelWidth)));
  const maxCanvasHeight = maxPixelHeight / ratio;
  const rowsPerPart = Math.max(1, Math.floor((maxCanvasHeight - headerHeight - footerHeight) / rowHeight));
  const partCount = Math.max(1, Math.ceil(totalRows / rowsPerPart));
  const estimatedPixels = pixelWidth * Math.ceil((totalRows * rowHeight + headerHeight + footerHeight) * ratio);
  if (partCount > maxParts || estimatedPixels > maxTotalPixels) {
    const error = new RangeError("当前截图范围过长，请向终端底部滚动后重试。");
    error.code = "SCREENSHOT_RANGE_TOO_LARGE";
    throw error;
  }
  return Object.freeze({ ratio, pixelWidth, maxPixelHeight, rowsPerPart, partCount, estimatedPixels });
};

const rowCellText = (geometry, cell, rowIndex, activeRow, col, isScrollback) => {
  if (Number(cell?.grapheme_len || 0) > 0) {
    return isScrollback
      ? geometry.manager.getScrollbackGraphemeString?.(rowIndex, col)
      : geometry.manager.getGraphemeString?.(activeRow, col);
  }
  if (typeof cell?.text === "string") {
    return cell.text;
  }
  return String.fromCodePoint(normalizedNumber(cell?.codepoint) || 32);
};

export const snapshotTerminalRows = (geometry, start, end, suppliedRows = null) => {
  if (!geometry || start < geometry.startRow || end < start || end > geometry.endRow) {
    return null;
  }
  const rows = [];
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    const isScrollback = rowIndex < geometry.scrollbackRows;
    const activeRow = rowIndex - geometry.scrollbackRows;
    const source = suppliedRows ? suppliedRows[rowIndex - start] : isScrollback
      ? geometry.manager.getScrollbackLine?.(rowIndex)
      : geometry.manager.getLine?.(activeRow);
    if (!source) {
      return null;
    }
    const cells = [];
    for (let col = 0; col < geometry.cols; col += 1) {
      const cell = source[col] || {};
      cells.push({
        text: rowCellText(geometry, cell, rowIndex, activeRow, col, isScrollback) || " ",
        width: Math.max(0, normalizedNumber(cell.width ?? 1)),
        fg: [cell.fg_r, cell.fg_g, cell.fg_b].map((value) => Math.max(0, Math.min(255, normalizedNumber(value)))).join(","),
        bg: [cell.bg_r, cell.bg_g, cell.bg_b].map((value) => Math.max(0, Math.min(255, normalizedNumber(value)))).join(","),
        flags: normalizedNumber(cell.flags),
      });
    }
    rows.push(cells);
  }
  return rows;
};

const mappedCellColor = (renderer, raw, fallback, isBackground = false) => {
  const channels = String(raw || "").split(",").map(Number);
  if (channels.length === 3 && channels.every(Number.isFinite) && typeof renderer?.rgbToCSS === "function") {
    try {
      if (isBackground && typeof renderer.webshellBackgroundRGBToCSS === "function") {
        return renderer.webshellBackgroundRGBToCSS(channels[0], channels[1], channels[2]);
      }
      return renderer.rgbToCSS(channels[0], channels[1], channels[2]);
    } catch (error) {
    }
  }
  return fallback;
};

export const drawTerminalRows = (context, rows, metrics, theme, renderer) => {
  const background = theme?.background || "#000000";
  context.fillStyle = background;
  context.fillRect(0, 0, metrics.width, rows.length * metrics.height);

  // Match Ghostty's two-pass line renderer: all backgrounds first, then text.
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const y = rowIndex * metrics.height;
    for (let col = 0; col < row.length; col += 1) {
      const cell = row[col];
      if (!cell || cell.width === 0) continue;
      const inverse = Boolean(cell.flags & 16);
      const bg = mappedCellColor(renderer, inverse ? cell.fg : cell.bg, background, true);
      if (bg !== background && bg !== "rgb(0, 0, 0)") {
        context.fillStyle = bg;
        context.fillRect(col * metrics.cellWidth, y, metrics.cellWidth * Math.max(1, cell.width), metrics.height);
      }
    }
    for (let col = 0; col < row.length; col += 1) {
      const cell = row[col];
      if (!cell || cell.width === 0 || (cell.flags & 32) || !cell.text || cell.text === " ") continue;
      const inverse = Boolean(cell.flags & 16);
      const fg = mappedCellColor(renderer, inverse ? cell.bg : cell.fg, theme?.foreground || "#ffffff");
      context.globalAlpha = cell.flags & 128 ? 0.5 : 1;
      context.fillStyle = fg;
      context.font = `${cell.flags & 2 ? "italic " : ""}${cell.flags & 1 ? "bold " : ""}${metrics.fontSize}px ${metrics.fontFamily}`;
      const x = col * metrics.cellWidth;
      context.fillText(cell.text, x, y + metrics.baseline);
      if (cell.flags & (4 | 8)) {
        const lineY = cell.flags & 8 ? y + metrics.height / 2 : y + metrics.baseline + 2;
        context.strokeStyle = fg;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, lineY);
        context.lineTo(x + metrics.cellWidth * Math.max(1, cell.width), lineY);
        context.stroke();
      }
      context.globalAlpha = 1;
    }
  }
};

const canvasBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("截图编码失败。")), "image/png");
});

const isAndroidHost = () => /Android/i.test(String(navigator.userAgent || ""));

const deliverScreenshotFiles = async (files) => {
  if (!files.length) throw new Error("没有可导出的终端内容。");
  if (!isAndroidHost() && files.length === 1 && typeof navigator.share === "function" && typeof navigator.canShare === "function" && typeof File === "function") {
    try {
      const shareFiles = files.map(({ blob, name }) => new File([blob], name, { type: "image/png" }));
      if (navigator.canShare({ files: shareFiles })) {
        await navigator.share({ files: shareFiles });
        return "shared";
      }
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  for (const { blob, name } of files) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    await nextFrame();
  }
  return "saved";
};

export const createTerminalLongScreenshot = ({
  mobileShortcuts,
  createSVGIcon,
  confirmDialog,
  showToast,
}) => {
  let captureActive = false;

  const shortcutIconName = (item) => {
    const id = String(item?.dataset?.mobileShortcutId || "").trim();
    const action = String(item?.dataset?.mobileAction || "").trim();
    const inputKey = String(item?.dataset?.mobileShortcutInputKey || "").trim();
    return ({ "arrow-up": "arrowUp", "arrow-down": "arrowDown", "arrow-left": "arrowLeft", "arrow-right": "arrowRight", slash: "slash", tab: "tab", return: "enter", "shift-tab": "shiftTab", "page-up": "pageUp", "page-down": "pageDown", home: "home", end: "end" }[id])
      || ({ copy: "copy", paste: "paste", new_tab: "tabAdd", close_tab: "close-tab", rename_tab: "rename", next_tab: "arrowRight", previous_tab: "arrowLeft", swap_tab: "swap", page_up: "pageUp", page_down: "pageDown", zoom_in: "zoomIn", zoom_out: "zoomOut", vertical_split: "split-vertical", horizontal_split: "split-horizontal", tab_overview: "select-all", search_terminal: "search", attachment: "attachment" }[action])
      || ({ arrow_up: "arrowUp", arrow_down: "arrowDown", arrow_left: "arrowLeft", arrow_right: "arrowRight", tab: "tab", enter: "enter", home: "home", end: "end", "/": "slash" }[inputKey])
      || "";
  };

  const drawRoundedRect = (context, x, y, width, height, radius) => {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  };

  const drawSVG = (context, svg, x, y, width, height, colorOverride = "") => {
    const viewBox = svg?.viewBox?.baseVal;
    if (!viewBox?.width || !viewBox?.height || typeof Path2D !== "function") return false;
    const scale = Math.min(width / viewBox.width, height / viewBox.height);
    context.save();
    context.translate(x + (width - viewBox.width * scale) / 2, y + (height - viewBox.height * scale) / 2);
    context.scale(scale, scale);
    const pointPath = (value, close) => {
      const numbers = String(value || "").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      const path = new Path2D();
      for (let index = 0; index + 1 < numbers.length; index += 2) {
        if (index === 0) path.moveTo(numbers[index], numbers[index + 1]);
        else path.lineTo(numbers[index], numbers[index + 1]);
      }
      if (close) path.closePath();
      return path;
    };
    let drew = false;
    for (const shape of svg.querySelectorAll("path, rect, circle, line, polyline, polygon")) {
      let path;
      const tag = shape.tagName.toLowerCase();
      try {
        if (tag === "path") {
          path = new Path2D(shape.getAttribute("d") || "");
        } else if (tag === "rect") {
          path = new Path2D();
          path.rect(Number(shape.getAttribute("x") || 0), Number(shape.getAttribute("y") || 0), Number(shape.getAttribute("width") || 0), Number(shape.getAttribute("height") || 0));
        } else if (tag === "circle") {
          path = new Path2D();
          path.arc(Number(shape.getAttribute("cx") || 0), Number(shape.getAttribute("cy") || 0), Number(shape.getAttribute("r") || 0), 0, Math.PI * 2);
        } else if (tag === "line") {
          path = new Path2D();
          path.moveTo(Number(shape.getAttribute("x1") || 0), Number(shape.getAttribute("y1") || 0));
          path.lineTo(Number(shape.getAttribute("x2") || 0), Number(shape.getAttribute("y2") || 0));
        } else {
          path = pointPath(shape.getAttribute("points"), tag === "polygon");
        }
      } catch (error) {
        continue;
      }
      const style = window.getComputedStyle(shape);
      const resolvePaint = (attribute, computed, fallback) => {
        const value = String(shape.getAttribute(attribute) || "").trim();
        if (value.toLowerCase() === "currentcolor") return colorOverride || style.color || fallback;
        if (value) return value;
        const computedValue = String(computed || "").trim();
        if (computedValue.toLowerCase() === "currentcolor") return colorOverride || style.color || fallback;
        return computedValue || fallback;
      };
      const fill = resolvePaint("fill", style.fill, "none");
      const stroke = resolvePaint("stroke", style.stroke, "none");
      if (fill !== "none" && fill !== "rgba(0, 0, 0, 0)") { context.fillStyle = fill; context.fill(path); drew = true; }
      if (stroke !== "none" && stroke !== "rgba(0, 0, 0, 0)") {
        context.strokeStyle = stroke;
        context.lineWidth = Number(shape.getAttribute("stroke-width")) || Number.parseFloat(style.strokeWidth) || 1.5;
        context.lineCap = shape.getAttribute("stroke-linecap") || style.strokeLinecap || "round";
        context.lineJoin = shape.getAttribute("stroke-linejoin") || style.strokeLinejoin || "round";
        context.stroke(path);
        drew = true;
      }
    }
    context.restore();
    return drew;
  };

  const drawToolbar = (context, element, width, height, fallbackBackground, fallbackForeground) => {
    const rootRect = element?.getBoundingClientRect?.();
    if (!rootRect?.width || !rootRect?.height) return false;
    const scaleX = width / rootRect.width;
    const scaleY = height / rootRect.height;
    const rootStyle = window.getComputedStyle(element);
    context.fillStyle = rootStyle.backgroundColor !== "rgba(0, 0, 0, 0)" ? rootStyle.backgroundColor : fallbackBackground;
    context.fillRect(0, 0, width, height);
    for (const item of element.querySelectorAll("button, .mobile-active-tab-title")) {
      const style = window.getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) continue;
      const x = (rect.left - rootRect.left) * scaleX;
      const y = (rect.top - rootRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;
      if (style.backgroundColor !== "rgba(0, 0, 0, 0)") {
        drawRoundedRect(context, x, y, w, h, (Number.parseFloat(style.borderRadius) || 0) * scaleX);
        context.fillStyle = style.backgroundColor;
        context.fill();
      }
      const existingSVG = item.querySelector("svg");
      const iconName = existingSVG ? "" : shortcutIconName(item);
      const svg = existingSVG || (iconName ? createSVGIcon(iconName) : null);
      if (svg) {
        const svgRect = existingSVG?.getBoundingClientRect?.();
        const iconWidth = existingSVG ? svgRect.width * scaleX : Math.min(w * 0.64, 18);
        const iconHeight = existingSVG ? svgRect.height * scaleY : Math.min(h * 0.64, 18);
        const iconX = existingSVG ? (svgRect.left - rootRect.left) * scaleX : x + (w - iconWidth) / 2;
        const iconY = existingSVG ? (svgRect.top - rootRect.top) * scaleY : y + (h - iconHeight) / 2;
        if (drawSVG(context, svg, iconX, iconY, iconWidth, iconHeight, style.color || fallbackForeground)) continue;
      }
      const label = String(item.textContent || item.getAttribute("aria-label") || "").trim();
      if (!label) continue;
      context.fillStyle = style.color || fallbackForeground;
      context.font = `${style.fontWeight || "400"} ${Math.max(9, Number.parseFloat(style.fontSize) || 12)}px ${style.fontFamily || "sans-serif"}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, x + w / 2, y + h / 2);
    }
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    return true;
  };

  const drawRainbowText = (context, text, x, y, maxWidth) => {
    context.save();
    context.font = "500 7px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const measuredWidth = context.measureText(text).width;
    const scale = measuredWidth > maxWidth ? maxWidth / measuredWidth : 1;
    context.translate(x, y);
    context.scale(scale, scale);
    const gradient = context.createLinearGradient(-measuredWidth / 2, 0, measuredWidth / 2, 0);
    ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#5856d6", "#ff2d55"].forEach((color, index, colors) => gradient.addColorStop(index / (colors.length - 1), color));
    context.fillStyle = gradient;
    context.fillText(text, 0, 0);
    context.restore();
  };

  const capture = async (session) => {
    const renderer = session?.term?.renderer;
    const geometry = captureTerminalGeometry(session, renderer);
    const sourceCanvas = session?.term?.canvas || renderer?.getCanvas?.();
    if (!geometry || !sourceCanvas) throw new Error("当前终端画面尚未就绪。");
    const cssWidth = geometry.cols * geometry.metricWidth;
    const header = document.querySelector("header");
    const headerHeight = Math.max(1, Math.round(header?.getBoundingClientRect?.().height || geometry.metricHeight * 2 + 24));
    const footerHeight = Math.max(1, Math.round(mobileShortcuts?.getBoundingClientRect?.().height || geometry.metricHeight + 24));
    const plan = planTerminalScreenshotParts({ totalRows: geometry.totalRows, rowHeight: geometry.metricHeight, cssWidth, headerHeight, footerHeight, devicePixelRatio: geometry.devicePixelRatio });
    const theme = renderer.theme || {};
    const metrics = { width: cssWidth, cellWidth: geometry.metricWidth, height: geometry.metricHeight, baseline: geometry.metricBaseline, fontSize: geometry.fontSize, fontFamily: geometry.fontFamily || "monospace" };
    const files = [];
    const captureID = Date.now();
    for (let part = 0; part < plan.partCount; part += 1) {
      if (!terminalGeometryMatches(geometry, session, renderer)) throw new Error("终端布局已变化，请重试截图。");
      const start = geometry.startRow + part * plan.rowsPerPart;
      const end = Math.min(geometry.endRow, start + plan.rowsPerPart);
      const supplied = geometry.manager.isRemote ? await geometry.manager.readRows(start, end) : null;
      if (!terminalGeometryMatches(geometry, session, renderer)) throw new Error("终端内容已变化，请重试截图。");
      const rows = snapshotTerminalRows(geometry, start, end, supplied);
      if (!rows) throw new Error("终端历史在截图过程中发生变化，请重试。");
      const includeHeader = part === 0;
      const includeFooter = part === plan.partCount - 1;
      const top = includeHeader ? headerHeight : 0;
      const bottom = includeFooter ? footerHeight : 0;
      const cssHeight = top + rows.length * geometry.metricHeight + bottom;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(cssWidth * plan.ratio);
      canvas.height = Math.ceil(cssHeight * plan.ratio);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("截图画布不可用。");
      context.scale(plan.ratio, plan.ratio);
      context.fillStyle = theme.background || "#000000";
      context.fillRect(0, 0, cssWidth, cssHeight);
      if (includeHeader) drawToolbar(context, header, cssWidth, headerHeight, theme.background || "#000000", theme.foreground || "#ffffff");
      context.save();
      context.translate(0, top);
      drawTerminalRows(context, rows, metrics, theme, renderer);
      context.restore();
      if (includeFooter) {
        const footerTop = top + rows.length * geometry.metricHeight;
        context.save();
        context.translate(0, footerTop);
        drawToolbar(context, mobileShortcuts, cssWidth, footerHeight, theme.background || "#000000", theme.foreground || "#ffffff");
        const safeHeight = Math.max(16, Math.min(22, footerHeight * 0.22));
        context.fillStyle = theme.background || "#000000";
        context.fillRect(0, footerHeight - safeHeight, cssWidth, safeHeight);
        drawRainbowText(context, "Powered by LazyCat MicroServer LightOS", cssWidth / 2, footerHeight - safeHeight * 0.64 + 2, cssWidth - 20);
        context.restore();
      }
      if (!terminalGeometryMatches(geometry, session, renderer)) throw new Error("终端布局已变化，请重试截图。");
      const blob = await canvasBlob(canvas);
      if (!terminalGeometryMatches(geometry, session, renderer)) throw new Error("终端布局已变化，请重试截图。");
      files.push({ blob, name: `webshell-terminal-${captureID}-${part + 1}-of-${plan.partCount}.png` });
      await nextFrame();
    }
    return files;
  };

  const runLongScreenshot = async (session) => {
    if (captureActive) {
      showToast("终端长图正在生成，请稍候。");
      return;
    }
    captureActive = true;
    showToast("正在生成终端长图…");
    try {
      const files = await capture(session);
      const confirmed = await confirmDialog(files.length > 1 ? `长图已生成，共 ${files.length} 张。现在保存？` : "长图已生成。现在分享或保存？", { title: "终端长图", okText: "继续", cancelText: "取消" });
      if (!confirmed) return;
      const result = await deliverScreenshotFiles(files);
      showToast(result === "shared" ? "截图已打开分享。" : result === "cancelled" ? "已取消截图分享。" : files.length > 1 ? `截图已保存，共 ${files.length} 张。` : "截图已保存。");
    } catch (error) {
      if (!session.closed && error?.code !== "BACKEND_CANCELLED") showToast(error?.code?.startsWith("BACKEND_") ? "截图未完成，请稍后重试。" : error?.message || "截图失败。");
    } finally {
      captureActive = false;
    }
  };

  return { runLongScreenshot };
};
