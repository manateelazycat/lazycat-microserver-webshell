// Platform drawing only. Ghostty owns all Kitty protocol/state/layout logic.
// Keep these entry-point names for the terminal runtime's existing integration.
export function isKittyGraphicsResponse(data) {
  return typeof data === "string" && /^(?:\x1b_G[^\x1b]*\x1b\\)+$/.test(data);
}

export function terminalPixelSize(terminal) {
  const renderer = terminal.renderer;
  return {
    width: (Number(terminal.cols) || 0) * (Number(renderer?.metrics?.width) || 0),
    height: (Number(terminal.rows) || 0) * (Number(renderer?.metrics?.height) || 0),
  };
}

export function installKittyGraphicsSupport(TerminalClass) {
  const prototype = TerminalClass.prototype;
  if (prototype.__officialImagesInstalled) return;
  prototype.__officialImagesInstalled = true;
  const open = prototype.open;
  prototype.open = function (...args) {
    const result = open.apply(this, args);
    const terminal = this;
    const renderer = this.renderer;
    if (!renderer) return result;
    const cache = new Map();
    let hadImages = false;
    const render = renderer.render.bind(renderer);
    renderer.render = (buffer, forceAll, viewportY = 0, ...rest) => {
      const metrics = renderer.metrics;
      buffer.setCellSize?.(metrics.width, metrics.height);
      const frame = buffer.getImageFrame?.();
      const images = [...(frame?.images || [])].sort((a, b) => a.layer - b.layer || a.z - b.z);
      const cacheKey = (p) => `${buffer.generation}:${buffer.progress?.historyEpoch}:${p.key}`;
      const keys = new Set(images.map(cacheKey));
      const sx = metrics.width / Math.max(1, Math.round(metrics.width));
      const sy = metrics.height / Math.max(1, Math.round(metrics.height));
      for (const [key, canvas] of cache) {
        if (!keys.has(key)) { canvas.width = canvas.height = 0; cache.delete(key); }
      }
      renderer.imagePainter = images.length ? (layer) => {
        for (const p of images) {
          if (p.layer !== layer) continue;
          let canvas = cache.get(cacheKey(p));
          if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.width = p.imageWidth; canvas.height = p.imageHeight;
            const pixels = new Uint8ClampedArray(p.imageWidth * p.imageHeight * 4);
            if (p.format === 32) pixels.set(p.pixels);
            else for (let src = 0, dst = 0; src < p.pixels.length; src += 3, dst += 4) {
              pixels[dst] = p.pixels[src]; pixels[dst + 1] = p.pixels[src + 1];
              pixels[dst + 2] = p.pixels[src + 2]; pixels[dst + 3] = 255;
            }
            canvas.getContext("2d").putImageData(new ImageData(pixels, p.imageWidth, p.imageHeight), 0, 0);
            cache.set(cacheKey(p), canvas);
          }
          renderer.ctx.drawImage(canvas, p.sourceX, p.sourceY, p.sourceWidth, p.sourceHeight,
            p.x * metrics.width + p.offsetX * sx,
            (p.y + viewportY - frame.offset) * metrics.height + p.offsetY * sy,
            p.width * sx, p.height * sy);
        }
      } : null;
      const rendered = render(buffer, forceAll || hadImages || images.length > 0, viewportY, ...rest);
      hadImages = images.length > 0;
      return rendered;
    };
    const dispose = terminal.dispose.bind(terminal);
    terminal.dispose = () => {
      for (const canvas of cache.values()) canvas.width = canvas.height = 0;
      cache.clear(); renderer.imagePainter = null;
      dispose();
    };
    return result;
  };
}
