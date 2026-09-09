const parseCSSPixel = (value) => {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function createTerminalOverviewView({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  terminalArea = documentObject?.getElementById?.("terminalArea"),
} = {}) {
  const elements = Object.freeze({
    toggle: documentObject?.getElementById?.("tabOverviewToggle") || null,
    root: documentObject?.getElementById?.("tabOverview") || null,
    grid: documentObject?.getElementById?.("tabOverviewGrid") || null,
    close: documentObject?.getElementById?.("tabOverviewClose") || null,
    newTab: documentObject?.getElementById?.("tabOverviewNewTab") || null,
  });

  const computedStyle = (element) => windowObject?.getComputedStyle?.(element) || {};

  const terminalSize = () => {
    const rect = terminalArea?.getBoundingClientRect?.();
    const fallbackWidth = windowObject?.visualViewport?.width || windowObject?.innerWidth || 16;
    const fallbackHeight = windowObject?.visualViewport?.height || windowObject?.innerHeight || 10;
    return {
      width: Math.max(1, Math.round(rect?.width || fallbackWidth)),
      height: Math.max(1, Math.round(rect?.height || fallbackHeight)),
    };
  };

  const syncDesktopGrid = (size) => {
    if (!elements.grid) {
      return;
    }
    const rows = size.height > size.width ? 4 : 3;
    const columns = size.height > size.width ? 3 : 4;
    const styles = computedStyle(elements.grid);
    const gap = parseCSSPixel(styles.rowGap || styles.gap);
    const paddingY = parseCSSPixel(styles.paddingTop) + parseCSSPixel(styles.paddingBottom);
    const gridHeight = Math.max(1, elements.grid.clientHeight - paddingY);
    const cardHeight = Math.max(1, (gridHeight - gap * (rows - 1)) / rows);
    elements.grid.style.setProperty("--tab-overview-columns", String(columns));
    elements.grid.style.setProperty("--tab-overview-meta-height", "48px");
    elements.grid.style.setProperty("--tab-overview-card-height", `${Math.floor(cardHeight)}px`);
    elements.grid.style.removeProperty("--tab-overview-mobile-card-height");
  };

  const syncPreviewRatio = (mobileLayout) => {
    if (!elements.grid) {
      return;
    }
    const size = terminalSize();
    const ratio = size.width / size.height;
    elements.grid.style.setProperty("--tab-overview-preview-ratio", `${size.width} / ${size.height}`);
    if (!mobileLayout) {
      syncDesktopGrid(size);
      return;
    }
    elements.grid.style.setProperty("--tab-overview-columns", "2");
    elements.grid.style.setProperty("--tab-overview-meta-height", "46px");
    elements.grid.style.removeProperty("--tab-overview-card-height");
    const styles = computedStyle(elements.grid);
    const gap = parseCSSPixel(styles.rowGap || styles.gap);
    const columnGap = parseCSSPixel(styles.columnGap || styles.gap);
    const paddingX = parseCSSPixel(styles.paddingLeft) + parseCSSPixel(styles.paddingRight);
    const paddingY = parseCSSPixel(styles.paddingTop) + parseCSSPixel(styles.paddingBottom);
    const gridWidth = Math.max(1, elements.grid.clientWidth - paddingX);
    const gridHeight = Math.max(1, elements.grid.clientHeight - paddingY);
    const previewWidth = Math.max(1, (gridWidth - columnGap) / 2);
    const naturalCardHeight = previewWidth / ratio + 46;
    const twoRowCardHeight = Math.max(1, (gridHeight - gap) / 2);
    elements.grid.style.setProperty(
      "--tab-overview-mobile-card-height",
      `${Math.ceil(Math.max(naturalCardHeight, twoRowCardHeight))}px`,
    );
  };

  const syncScrollable = () => {
    if (!elements.grid) {
      return false;
    }
    const scrollable = elements.grid.scrollHeight > elements.grid.clientHeight + 1;
    const changed = elements.grid.classList.contains("is-scrollable") !== scrollable;
    elements.grid.classList.toggle("is-scrollable", scrollable);
    return changed;
  };

  const canvasSize = (canvas) => {
    const rect = canvas.parentElement?.getBoundingClientRect?.() || canvas.getBoundingClientRect?.();
    const size = terminalSize();
    const fallbackRatio = size.width / size.height;
    const width = Math.max(1, Math.round(rect?.width || 480));
    const height = Math.max(1, Math.round(rect?.height || width / fallbackRatio));
    return { width, height };
  };

  const drawFallback = (ctx, x, y, width, height, colors) => {
    ctx.fillStyle = colors.muted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = typeof globalThis.$t === "function" ? globalThis.$t("无预览") : "无预览";
    ctx.fillText(text, x + width / 2, y + height / 2);
  };

  const drawPane = (ctx, pane, x, y, width, height, colors, sourceForPane) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.fillStyle = colors.bg;
    ctx.fillRect(x, y, width, height);
    const source = sourceForPane(pane);
    if (source?.width > 0 && source?.height > 0) {
      try {
        const scale = Math.min(width / source.width, height / source.height);
        const drawWidth = source.width * scale;
        const drawHeight = source.height * scale;
        const drawX = x + (width - drawWidth) / 2;
        const drawY = y + (height - drawHeight) / 2;
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
      } catch (error) {
        drawFallback(ctx, x, y, width, height, colors);
      }
    } else {
      drawFallback(ctx, x, y, width, height, colors);
    }
    ctx.restore();
  };

  const drawLayout = (ctx, tab, node, x, y, width, height, colors, sourceForPane) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    const currentNode = node || { type: "leaf", paneId: tab.activePaneId };
    const children = Array.isArray(currentNode.children) ? currentNode.children.filter(Boolean) : [];
    if (currentNode.type !== "split" || children.length === 0) {
      const pane = tab.panes.get(currentNode.paneId || tab.activePaneId);
      drawPane(ctx, pane, x, y, width, height, colors, sourceForPane);
      return;
    }

    const gap = children.length > 1 ? 3 : 0;
    const direction = currentNode.direction === "horizontal" ? "horizontal" : "vertical";
    const sizes = children.map((child) => {
      const size = Number(child?.size);
      return Number.isFinite(size) && size > 0 ? size : 1;
    });
    const totalSize = sizes.reduce((sum, size) => sum + size, 0) || children.length;
    const available = Math.max(0, (direction === "vertical" ? width : height) - gap * (children.length - 1));
    let cursor = direction === "vertical" ? x : y;

    children.forEach((child, index) => {
      const last = index === children.length - 1;
      const span = last
        ? Math.max(0, (direction === "vertical" ? x + width : y + height) - cursor)
        : Math.max(0, (available * sizes[index]) / totalSize);
      if (direction === "vertical") {
        drawLayout(ctx, tab, child, cursor, y, span, height, colors, sourceForPane);
        cursor += span;
        if (!last) {
          ctx.fillStyle = colors.line;
          ctx.fillRect(cursor, y, gap, height);
          cursor += gap;
        }
      } else {
        drawLayout(ctx, tab, child, x, cursor, width, span, colors, sourceForPane);
        cursor += span;
        if (!last) {
          ctx.fillStyle = colors.line;
          ctx.fillRect(x, cursor, width, gap);
          cursor += gap;
        }
      }
    });
  };

  const releaseCanvases = (element) => {
    for (const canvas of element?.querySelectorAll?.("canvas") || []) {
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  const renderTabs = ({ orderedTabs, activeTabId, mobileLayout }) => {
    if (!elements.grid) {
      return [];
    }
    elements.grid.classList.remove("is-scrollable");
    syncPreviewRatio(mobileLayout);
    const wanted = new Set(orderedTabs.map(tab => tab.id));
    const existing = new Map();
    for (const child of [...elements.grid.children]) {
      if (child.classList.contains("tab-overview-card") && wanted.has(child.dataset.tabId)) {
        existing.set(child.dataset.tabId, child);
      } else {
        releaseCanvases(child);
        child.remove();
      }
    }
    if (orderedTabs.length === 0) {
      const empty = documentObject.createElement("div");
      empty.className = "tab-overview-empty";
      empty.textContent = "暂无终端";
      elements.grid.appendChild(empty);
      syncScrollable();
      return [];
    }

    const previewItems = [];
    let position = 0;
    const place = card => {
      const current = elements.grid.children[position++];
      if (current !== card) elements.grid.insertBefore(card, current || null);
    };
    for (const tab of orderedTabs) {
      const label = String(tab.label || tab.id || "终端");
      const prior = existing.get(tab.id);
      if (prior) {
        prior.title = label;
        prior.classList.toggle("active", tab.id === activeTabId);
        if (tab.id === activeTabId) prior.setAttribute("aria-current", "true");
        else prior.removeAttribute("aria-current");
        prior.querySelector(".tab-overview-card-main").setAttribute("aria-label", `切换到 ${label}`);
        prior.querySelector(".tab-overview-card-close").setAttribute("aria-label", `关闭 ${label}`);
        const name = prior.querySelector(".tab-overview-name");
        if (name.textContent !== label) name.textContent = label;
        const status = prior.querySelector(".tab-overview-status");
        if (tab.id === activeTabId && !status) {
          const current = documentObject.createElement("span");
          current.className = "tab-overview-status";
          current.textContent = "当前";
          prior.querySelector(".tab-overview-meta").appendChild(current);
        } else if (tab.id !== activeTabId) status?.remove();
        previewItems.push({ canvas: prior.querySelector("canvas"), tab });
        place(prior);
        continue;
      }
      const card = documentObject.createElement("div");
      card.className = "tab-overview-card";
      card.dataset.tabId = tab.id;
      card.title = label;
      if (tab.id === activeTabId) {
        card.classList.add("active");
        card.setAttribute("aria-current", "true");
      }

      const main = documentObject.createElement("button");
      main.type = "button";
      main.className = "tab-overview-card-main";
      main.dataset.tabId = tab.id;
      main.setAttribute("aria-label", `切换到 ${label}`);

      const preview = documentObject.createElement("div");
      preview.className = "tab-overview-preview";
      const canvas = documentObject.createElement("canvas");
      preview.appendChild(canvas);

      const meta = documentObject.createElement("div");
      meta.className = "tab-overview-meta";
      const name = documentObject.createElement("span");
      name.className = "tab-overview-name";
      name.textContent = label;
      meta.appendChild(name);
      if (tab.id === activeTabId) {
        const status = documentObject.createElement("span");
        status.className = "tab-overview-status";
        status.textContent = "当前";
        meta.appendChild(status);
      }

      const close = documentObject.createElement("button");
      close.type = "button";
      close.className = "tab-overview-card-close";
      close.dataset.tabOverviewClose = tab.id;
      close.setAttribute("aria-label", `关闭 ${label}`);
      close.textContent = "×";

      main.append(preview, meta);
      card.append(main, close);
      previewItems.push({ canvas, tab });
      place(card);
    }
    if (syncScrollable()) {
      syncPreviewRatio(mobileLayout);
      syncScrollable();
    }
    return previewItems;
  };

  return Object.freeze({
    elements,
    clear() {
      if (!elements.grid) {
        return;
      }
      releaseCanvases(elements.grid);
      elements.grid.textContent = "";
      elements.grid.classList.remove("is-scrollable");
    },
    closestCard(target) {
      return target?.closest?.(".tab-overview-card") || null;
    },
    closestCardButton(target) {
      return target?.closest?.(".tab-overview-card-main") || null;
    },
    closestCloseButton(target) {
      return target?.closest?.("[data-tab-overview-close]") || null;
    },
    drawPreview(canvas, tab, sourceForPane) {
      const size = canvasSize(canvas);
      const scale = Math.max(1, Math.min(3, windowObject?.devicePixelRatio || 1));
      const width = Math.round(size.width * scale);
      const height = Math.round(size.height * scale);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const colors = this.readColors();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, size.width, size.height);
      drawLayout(ctx, tab, tab.layout, 0, 0, size.width, size.height, colors, sourceForPane);
    },
    focusActiveCard() {
      const activeCard = elements.grid?.querySelector?.(".tab-overview-card.active");
      const activeButton = activeCard?.querySelector?.(".tab-overview-card-main");
      const firstButton = elements.grid?.querySelector?.(".tab-overview-card-main");
      (activeButton || firstButton)?.focus?.({ preventScroll: true });
      activeCard?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    },
    isBackdropTarget(target) {
      return target === elements.root || target === elements.grid;
    },
    isHeaderTarget(target) {
      return Boolean(target?.closest?.(".tab-overview-header"));
    },
    isOpen() {
      return Boolean(elements.root && !elements.root.hidden);
    },
    readColors() {
      const styles = computedStyle(documentObject?.documentElement);
      return {
        bg: styles.getPropertyValue?.("--terminal-bg")?.trim?.() || "#000000",
        muted: styles.getPropertyValue?.("--muted")?.trim?.() || "#9ca3af",
        line: styles.getPropertyValue?.("--chrome-line")?.trim?.() || "rgba(148, 163, 184, 0.18)",
      };
    },
    renderTabs,
    setOpen(open) {
      if (!elements.root) {
        return;
      }
      elements.root.hidden = !open;
      elements.toggle?.setAttribute?.("aria-expanded", open ? "true" : "false");
      if (!open) {
        this.clear();
      }
    },
  });
}

export { parseCSSPixel };
