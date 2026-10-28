// Extend the pinned Ghostty renderer without replacing WebShell's customized
// vendored runtime. Only terminals explicitly prepared by this adapter opt in.
const terminalStates = new WeakMap();
const rendererStates = new WeakMap();
const installedTerminals = new WeakSet();
const installedRenderers = new WeakSet();
let openingState = null;

const stateForRenderer = (renderer) => {
  let state = rendererStates.get(renderer);
  if (!state && openingState) {
    state = openingState;
    state.renderer = renderer;
    rendererStates.set(renderer, state);
  }
  return state;
};

const cancelRendering = (state) => {
  const term = state.term;
  term.cancelRenderLoop?.();
  if (term.renderRetryTimer !== undefined) {
    state.windowObject.clearTimeout(term.renderRetryTimer);
    term.renderRetryTimer = undefined;
  }
};

const releasePixels = (state) => {
  const canvas = state.renderer?.getCanvas?.() || state.term.canvas;
  if (canvas) {
    if (canvas.width !== 0) canvas.width = 0;
    if (canvas.height !== 0) canvas.height = 0;
  }
  state.painted = false;
  state.needsFullRender = true;
};

function installRenderer(RendererCtor) {
  if (installedRenderers.has(RendererCtor)) return;
  installedRenderers.add(RendererCtor);
  const prototype = RendererCtor.prototype;
  const resize = prototype.resize;
  const render = prototype.render;
  const clear = prototype.clear;
  const setCursorBlink = prototype.setCursorBlink;

  prototype.resize = function (...args) {
    const state = stateForRenderer(this);
    if (state && state.mode !== "active") {
      state.needsFullRender = true;
      if (state.mode === "released") releasePixels(state);
      return false;
    }
    const changed = resize.apply(this, args);
    if (state && changed !== false) {
      state.painted = false;
      state.needsFullRender = true;
      state.onPixelsChanged?.();
    }
    return changed;
  };
  prototype.render = function (buffer, full, ...args) {
    const state = stateForRenderer(this);
    if (state && state.mode !== "active") return false;
    const rendered = render.call(this, buffer, full || state?.needsFullRender, ...args);
    if (state && rendered) {
      state.painted = true;
      state.needsFullRender = false;
    }
    return rendered;
  };
  prototype.clear = function (...args) {
    const state = stateForRenderer(this);
    if (state) {
      state.painted = false;
      state.needsFullRender = true;
      if (state.mode !== "active") return;
    }
    return clear.apply(this, args);
  };
  prototype.setCursorBlink = function (enabled) {
    const state = stateForRenderer(this);
    if (state) state.cursorBlink = enabled;
    return setCursorBlink.call(this, enabled && (!state || state.mode === "active"));
  };
}

function installTerminal(TerminalCtor) {
  if (installedTerminals.has(TerminalCtor)) return;
  installedTerminals.add(TerminalCtor);
  const prototype = TerminalCtor.prototype;
  const open = prototype.open;
  const requestRender = prototype.requestRender;
  const renderNow = prototype.renderNow;
  const dispose = prototype.dispose;

  prototype.open = function (...args) {
    const state = terminalStates.get(this);
    const previous = openingState;
    openingState = state || null;
    try { return open.apply(this, args); }
    finally {
      openingState = previous;
      if (state && this.renderer) {
        state.renderer = this.renderer;
        rendererStates.set(this.renderer, state);
        state.cursorBlink = this.renderer.cursorBlink;
        this.renderer.setCursorBlink(state.cursorBlink);
        if (state.mode === "released") releasePixels(state);
        cancelRendering(state);
      }
    }
  };
  prototype.requestRender = function (options = {}) {
    const state = terminalStates.get(this);
    if (state && state.mode !== "active") {
      state.needsFullRender ||= options.full === true;
      return;
    }
    return requestRender.call(this, options);
  };
  prototype.renderNow = function (...args) {
    const state = terminalStates.get(this);
    if (state && state.mode !== "active") return false;
    return renderNow.apply(this, args);
  };
  prototype.dispose = function (...args) {
    const state = terminalStates.get(this);
    if (state) {
      state.mode = "released";
      cancelRendering(state);
      releasePixels(state);
      state.onPixelsChanged = null;
    }
    try { return dispose.apply(this, args); }
    finally {
      if (state?.renderer) rendererStates.delete(state.renderer);
      terminalStates.delete(this);
    }
  };
}

export function createTerminalSurfaceAdapter({ TerminalCtor, RendererCtor, windowObject = globalThis.window }) {
  installRenderer(RendererCtor);
  installTerminal(TerminalCtor);
  return Object.freeze({
    prepare(term) {
      if (terminalStates.has(term)) return;
      const state = { term, windowObject, mode: "released", painted: false, needsFullRender: true };
      terminalStates.set(term, state);
      term.isRenderSurfaceActive = () => state.mode === "active";
      term.hasRenderSurfaceFrame = () => state.painted
        && Number(term.canvas?.width || 0) > 0 && Number(term.canvas?.height || 0) > 0;
    },
    observe(term, onPixelsChanged) {
      const state = terminalStates.get(term);
      if (state) state.onPixelsChanged = onPixelsChanged;
    },
    setState(term, mode) {
      const state = terminalStates.get(term);
      if (!state || state.mode === mode) return false;
      state.mode = mode;
      if (mode === "active") {
        state.renderer?.setCursorBlink(state.cursorBlink);
        // Retained pixels can be shown immediately. Rebuilding an evicted
        // surface uses the existing local frame/render gates, never a reset.
        term.requestRender?.({ full: state.needsFullRender || !state.painted });
      } else {
        cancelRendering(state);
        state.renderer?.setCursorBlink(state.cursorBlink);
        if (mode === "released") releasePixels(state);
      }
      return true;
    },
    state: (term) => terminalStates.get(term)?.mode || "released",
  });
}
