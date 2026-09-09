const defaultIsCanvasElement = (value, windowObject) => {
  const CanvasElement = windowObject?.HTMLCanvasElement || globalThis.HTMLCanvasElement;
  return typeof CanvasElement === "function" && value instanceof CanvasElement;
};

const canvasForSession = (session) => session?.term?.canvas || session?.term?.renderer?.getCanvas?.();

export function createTerminalPresentationView({
  windowObject = globalThis.window,
  getBackground = () => "#000000",
  isCanvasElement = (value) => defaultIsCanvasElement(value, windowObject),
} = {}) {
  const clearCanvas = (session) => {
    const term = session?.term;
    const canvas = canvasForSession(session);
    if (!isCanvasElement(canvas)) {
      return false;
    }
    const ctx = canvas.getContext?.("2d");
    if (!ctx) {
      return false;
    }
    const ratio = Number(term?.renderer?.devicePixelRatio || windowObject?.devicePixelRatio || 1) || 1;
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = getBackground(session) || "#000000";
    ctx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    ctx.restore();
    return true;
  };

  const holdFrame = (session) => {
    const source = canvasForSession(session);
    const hold = session?.terminalFrameHold;
    if (
      !isCanvasElement(source)
      || !isCanvasElement(hold)
      || Number(source.width || 0) <= 0
      || Number(source.height || 0) <= 0
    ) {
      return false;
    }
    const ctx = hold.getContext?.("2d");
    if (!ctx) {
      return false;
    }
    if (session?.terminalHost && hold.parentElement !== session.terminalHost) {
      session.terminalHost.appendChild(hold);
    }
    const ratio = Math.max(
      1,
      Number(session?.term?.renderer?.devicePixelRatio)
        || Number(windowObject?.devicePixelRatio)
        || 1,
    );
    const sourceRect = source.getBoundingClientRect?.();
    const host = session?.terminalHost;
    const hostRect = host?.getBoundingClientRect?.();
    const sourceStyleWidth = String(source.style?.width || "").trim();
    const sourceStyleHeight = String(source.style?.height || "").trim();
    const sourceCssWidth = Math.max(
      1,
      Number(sourceRect?.width) > 0
        ? Number(sourceRect.width)
        : /^\d+(?:\.\d+)?px$/i.test(sourceStyleWidth)
          ? Number.parseFloat(sourceStyleWidth)
          : source.width / ratio,
    );
    const sourceCssHeight = Math.max(
      1,
      Number(sourceRect?.height) > 0
        ? Number(sourceRect.height)
        : /^\d+(?:\.\d+)?px$/i.test(sourceStyleHeight)
          ? Number.parseFloat(sourceStyleHeight)
          : source.height / ratio,
    );
    // The live canvas can be larger than the host while a fit is pending (for
    // example after a font change or a viewport shrink). Save exactly the
    // visible host-sized surface and draw from the top-left. This prevents
    // object-position from cropping a different vertical region when the hold
    // replaces the live canvas.
    const hostCssWidth = Math.max(
      0,
      Number(hostRect?.width) > 0
        ? Number(hostRect.width)
        : Number(host?.clientWidth) > 0
          ? Number(host.clientWidth)
          : 0,
    );
    const hostCssHeight = Math.max(
      0,
      Number(hostRect?.height) > 0
        ? Number(hostRect.height)
        : Number(host?.clientHeight) > 0
          ? Number(host.clientHeight)
          : 0,
    );
    const cssWidth = hostCssWidth > 0 ? hostCssWidth : sourceCssWidth;
    const cssHeight = hostCssHeight > 0 ? hostCssHeight : sourceCssHeight;
    hold.width = Math.max(1, Math.round(cssWidth * ratio));
    hold.height = Math.max(1, Math.round(cssHeight * ratio));
    hold.style.width = "100%";
    hold.style.height = "100%";
    hold.style.objectPosition = "left top";
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const offsetX = Number(sourceRect?.left) - Number(hostRect?.left);
    const offsetY = Number(sourceRect?.top) - Number(hostRect?.top);
    ctx.drawImage(
      source,
      Number.isFinite(offsetX) ? offsetX : 0,
      Number.isFinite(offsetY) ? offsetY : 0,
      sourceCssWidth,
      sourceCssHeight,
    );
    ctx.restore();
    hold.hidden = false;
    return true;
  };

  const releaseFrame = (session) => {
    const hold = session?.terminalFrameHold;
    if (!isCanvasElement(hold)) {
      return false;
    }
    hold.hidden = true;
    // Hidden holds have no reusable pixels. Drop their backing store rather
    // than retaining a full viewport allocation until the pane is destroyed.
    if (hold.width !== 0) hold.width = 0;
    if (hold.height !== 0) hold.height = 0;
    return true;
  };

  const syncState = (session) => {
    if (!session?.shellEl?.dataset) {
      return false;
    }
    session.shellEl.dataset.renderReady = session.renderReady ? "true" : "false";
    session.shellEl.dataset.hasPresentedFrame = session.hasPresentedFrame ? "true" : "false";
    session.shellEl.dataset.terminalFrameHeld = session.terminalFrameHeld === true ? "true" : "false";
    session.shellEl.dataset.connectionRetrying = session.connectionRetrying === true ? "true" : "false";
    session.shellEl.dataset.renderRecovery = session.presentationRetryPending === true ? "true" : "false";
    return true;
  };

  return Object.freeze({
    canvasForSession,
    clearCanvas,
    holdFrame,
    isCanvasElement,
    releaseFrame,
    syncState,
  });
}
