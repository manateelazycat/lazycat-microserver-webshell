// Kitty Graphics runtime support for the vendored Ghostty-Web terminal.
var KITTY_START = "\x1B_G";
var KITTY_END = "\x1B\\";
var WINDOW_PIXEL_SIZE_QUERY = "\x1B[14t";
var INTERCEPTED_STARTS = [KITTY_START, WINDOW_PIXEL_SIZE_QUERY];
var KITTY_RESPONSE_PATTERN = /^(?:\x1B_Gi=\d+(?:,p=\d+)?;(?:OK|EINVAL: [^\x1B]*)\x1B\\)+$/;
var TERMINAL_CLEAR_PATTERN = /\x1Bc|(?:\x1B\[|\x9B)([0-9:;<=>?]*)(?:[ -\/]*)J/g;
var TERMINAL_CONTROL_SUFFIX_LENGTH = 64;
var KITTY_TEXT_DECODE_CHUNK_BYTES = 128 * 1024;
const KITTY_MAX_COMMAND_CHARS = 1024 * 1024;
const KITTY_MAX_TRANSFER_CHARS = 32 * 1024 * 1024;
const KITTY_MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const KITTY_MAX_IMAGES = 64;
const KITTY_MAX_TRANSFERS = 16;
const KITTY_MAX_DECODES = 4;
const KITTY_MAX_PLACEMENTS = 256;
const imageByteSize = (image) => Math.max(0, Number(image?.width) || 0) * Math.max(0, Number(image?.height) || 0) * 4;
const releaseImage = (image) => {
  image?.close?.();
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) image.width = image.height = 0;
};
const validateImageDimensions = (width, height) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height * 4 > KITTY_MAX_IMAGE_BYTES) {
    throw new Error("Kitty Graphics image dimensions exceed capacity");
  }
};
function isKittyGraphicsResponse(data) {
  return typeof data === "string" && KITTY_RESPONSE_PATTERN.test(data);
}
function numeric(attributes, key, fallback = 0) {
  const value = Number(attributes.get(key));
  return Number.isFinite(value) ? value : fallback;
}
function parseAttributes(control) {
  const attributes = /* @__PURE__ */ new Map();
  for (const part of control.split(",")) {
    if (!part) continue;
    const separator = part.indexOf("=");
    if (separator === -1) {
      attributes.set(part, "");
      continue;
    }
    attributes.set(part.slice(0, separator), part.slice(separator + 1));
  }
  return attributes;
}
function decodeBase64(payload) {
  const normalized = payload.replace(/\s/g, "");
  const decoded = atob(normalized);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}
async function decodePng(bytes) {
  const dimensions = pngDimensions(bytes);
  if (!dimensions) throw new Error("Kitty Graphics PNG dimensions are invalid");
  validateImageDimensions(dimensions.width, dimensions.height);
  const blob = new Blob([bytes.buffer], { type: "image/png" });
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Kitty Graphics PNG decode failed"));
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function inflate(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Kitty Graphics zlib decompression is unavailable");
  }
  const stream = new Blob([bytes.buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > KITTY_MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("Kitty Graphics decompressed image exceeds capacity");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function decodeRaw(bytes, attributes, format) {
  if (attributes.get("o") === "z") {
    bytes = await inflate(bytes);
  } else if (attributes.has("o")) {
    throw new Error("Kitty Graphics compression is unsupported");
  }
  const width = numeric(attributes, "s");
  const height = numeric(attributes, "v");
  validateImageDimensions(width, height);
  const channels = format === 32 ? 4 : 3;
  const expectedLength = width * height * channels;
  if (!width || !height || bytes.length !== expectedLength) {
    throw new Error("Kitty Graphics raw image dimensions are invalid");
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (format === 32) {
    rgba.set(bytes);
  } else {
    for (let source = 0, target = 0; source < bytes.length; source += 3, target += 4) {
      rgba[target] = bytes[source];
      rgba[target + 1] = bytes[source + 1];
      rgba[target + 2] = bytes[source + 2];
      rgba[target + 3] = 255;
    }
  }
  const imageData = new ImageData(rgba, width, height);
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(imageData);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
  return canvas;
}
async function decodeImage(bytes, attributes) {
  const format = numeric(attributes, "f", 100);
  if (format === 100) return decodePng(bytes);
  if (format === 24 || format === 32) return decodeRaw(bytes, attributes, format);
  throw new Error("Kitty Graphics image format is unsupported");
}
function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}
function transmittedImageDimensions(bytes, attributes) {
  const format = numeric(attributes, "f", 100);
  if (format === 24 || format === 32) {
    const width = numeric(attributes, "s");
    const height = numeric(attributes, "v");
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return format === 100 ? pngDimensions(bytes) : null;
}
function placementGridSize(attributes, dimensions, cursor) {
  let columns = Math.max(0, Math.floor(numeric(attributes, "c")));
  let rows = Math.max(0, Math.floor(numeric(attributes, "r")));
  if (columns > 0 && rows > 0) return { columns, rows };
  const cellWidth = Number(cursor.cellWidth);
  const cellHeight = Number(cursor.cellHeight);
  if (!dimensions || !(cellWidth > 0) || !(cellHeight > 0)) return { columns, rows };
  const sourceWidth = numeric(attributes, "w") || dimensions.width;
  const sourceHeight = numeric(attributes, "h") || dimensions.height;
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return { columns, rows };
  let pixelWidth = sourceWidth;
  let pixelHeight = sourceHeight;
  if (columns > 0) {
    pixelWidth = cellWidth * columns;
    pixelHeight = Math.round(pixelWidth * sourceHeight / sourceWidth);
  } else if (rows > 0) {
    pixelHeight = cellHeight * rows;
    pixelWidth = Math.round(pixelHeight * sourceWidth / sourceHeight);
  }
  columns ||= Math.ceil((pixelWidth + numeric(attributes, "X")) / cellWidth);
  rows ||= Math.ceil((pixelHeight + numeric(attributes, "Y")) / cellHeight);
  return { columns, rows };
}
function cursorMovement(attributes, dimensions, cursor) {
  if (numeric(attributes, "C") === 1 || numeric(attributes, "U") === 1) return "";
  const size = placementGridSize(attributes, dimensions, cursor);
  if (size.rows > 65535 || size.columns > 65535) throw new Error("Kitty Graphics placement exceeds capacity");
  if (size.rows <= 0) return "";
  const column = Math.max(1, Math.floor(Number(cursor.x) || 0) + size.columns + 2);
  return "\x1BD".repeat(size.rows) + `\x1B[${column}G`;
}
var KittyGraphics = class {
  constructor(onChange, onResponse, getPixelSize) {
    this.onChange = onChange;
    this.onResponse = onResponse;
    this.getPixelSize = getPixelSize;
    this.inputBuffer = "";
    this.decoder = new TextDecoder();
    this.terminalControlBuffer = "";
    this.transfers = /* @__PURE__ */ new Map();
    this.images = /* @__PURE__ */ new Map();
    this.loading = /* @__PURE__ */ new Map();
    this.placements = /* @__PURE__ */ new Map();
    this.nextImageId = 1;
    this.nextPlacementId = 1;
    this.generation = 0;
    this.placementGeneration = 0;
    this.discardingCommand = false;
    this.transferChars = 0;
    this.imageBytes = 0;
    this.activeDecodes = 0;
  }
  /**
   * Consume a stream chunk. Ordinary terminal data is emitted in order so
   * callers can write it to the VT parser before the next image placement.
   */
  async consume(data, cursor, writeText) {
    if (data instanceof Uint8Array) {
      for (let offset = 0; offset < data.byteLength; offset += KITTY_TEXT_DECODE_CHUNK_BYTES) {
        const end = Math.min(data.byteLength, offset + KITTY_TEXT_DECODE_CHUNK_BYTES);
        await this.consumeText(this.decoder.decode(data.subarray(offset, end), { stream: true }), cursor, writeText);
      }
      return;
    }
    const pending = this.decoder.decode();
    await this.consumeText(pending + data, cursor, writeText);
  }
  async consumeText(data, cursor, writeText) {
    if (this.discardingCommand) {
      const combined = this.inputBuffer + data;
      const end = combined.indexOf(KITTY_END);
      if (end === -1) {
        this.inputBuffer = combined.endsWith("\x1B") ? "\x1B" : "";
        return;
      }
      this.discardingCommand = false;
      this.inputBuffer = "";
      data = combined.slice(end + KITTY_END.length);
    }
    if (
      this.inputBuffer.length === 0
      && this.terminalControlBuffer.length === 0
      && data.length > 0
      && data.indexOf("\x1B") === -1
      && data.indexOf("\x9B") === -1
    ) {
      await writeText(data);
      return;
    }
    this.observeTerminalControls(data);
    this.inputBuffer += data;
    while (this.inputBuffer.length > 0) {
      const next = this.nextInterceptedSequence();
      if (!next) {
        const keep = this.incompleteStartLength();
        if (this.inputBuffer.length > keep) {
          await writeText(this.inputBuffer.slice(0, this.inputBuffer.length - keep));
          this.inputBuffer = this.inputBuffer.slice(this.inputBuffer.length - keep);
        }
        break;
      }
      if (next.index > 0) {
        await writeText(this.inputBuffer.slice(0, next.index));
        this.inputBuffer = this.inputBuffer.slice(next.index);
      }
      if (next.sequence === WINDOW_PIXEL_SIZE_QUERY) {
        this.inputBuffer = this.inputBuffer.slice(WINDOW_PIXEL_SIZE_QUERY.length);
        this.respondWindowPixelSize();
        continue;
      }
      const end = this.inputBuffer.indexOf(KITTY_END, KITTY_START.length);
      if (end === -1) {
        if (this.inputBuffer.length > KITTY_MAX_COMMAND_CHARS) {
          this.respond(new Map(), 0, "EINVAL: image command exceeds capacity");
          this.discardingCommand = true;
          this.inputBuffer = this.inputBuffer.endsWith("\x1B") ? "\x1B" : "";
        }
        break;
      }
      const body = this.inputBuffer.slice(KITTY_START.length, end);
      this.inputBuffer = this.inputBuffer.slice(end + KITTY_END.length);
      await this.handleCommand(body, cursor(), writeText);
    }
  }
  getPlacements() {
    return [...this.placements.values()];
  }
  clear() {
    this.generation += 1;
    this.discardingCommand = false;
    this.inputBuffer = "";
    this.decoder.decode();
    this.terminalControlBuffer = "";
    this.transfers.clear();
    this.transferChars = 0;
    for (const { image } of this.images.values()) releaseImage(image);
    this.images.clear();
    this.imageBytes = 0;
    this.loading.clear();
    this.clearPlacements();
  }
  clearPlacements() {
    this.placementGeneration += 1;
    if (this.placements.size === 0) return;
    this.placements.clear();
    this.onChange();
  }
  observeTerminalControls(data) {
    const prefixLength = this.terminalControlBuffer.length;
    const combined = this.terminalControlBuffer + data;
    TERMINAL_CLEAR_PATTERN.lastIndex = 0;
    for (const match of combined.matchAll(TERMINAL_CLEAR_PATTERN)) {
      if (match.index + match[0].length <= prefixLength) continue;
      if (match[0] === "\x1Bc") {
        this.clearPlacements();
        break;
      }
      const parameter = match[1].replace(/^[?<=>]/, "").split(/[;:]/, 1)[0];
      if (parameter === "2" || parameter === "3") {
        this.clearPlacements();
        break;
      }
    }
    this.terminalControlBuffer = this.incompleteTerminalControlSuffix(combined);
  }
  incompleteTerminalControlSuffix(data) {
    const escapeIndex = Math.max(data.lastIndexOf("\x1B"), data.lastIndexOf("\x9B"));
    if (escapeIndex === -1) {
      return "";
    }
    const suffix = data.slice(escapeIndex);
    if (suffix === "\x1B" || suffix === "\x9B") {
      return suffix;
    }
    if (suffix.startsWith("\x1B[")) {
      if (/^\x1B\[[0-?]*[ -\/]*[@-~]/.test(suffix)) {
        return "";
      }
      return suffix.length <= TERMINAL_CONTROL_SUFFIX_LENGTH ? suffix : "";
    }
    if (suffix.startsWith("\x9B")) {
      if (/^\x9B[0-?]*[ -\/]*[@-~]/.test(suffix)) {
        return "";
      }
      return suffix.length <= TERMINAL_CONTROL_SUFFIX_LENGTH ? suffix : "";
    }
    return "";
  }
  nextInterceptedSequence() {
    let next;
    for (const sequence of INTERCEPTED_STARTS) {
      const index = this.inputBuffer.indexOf(sequence);
      if (index !== -1 && (!next || index < next.index)) {
        next = { index, sequence };
      }
    }
    return next;
  }
  incompleteStartLength() {
    let keep = 0;
    for (const sequence of INTERCEPTED_STARTS) {
      const maximum = Math.min(this.inputBuffer.length, sequence.length - 1);
      for (let length = maximum; length > keep; length--) {
        if (this.inputBuffer.endsWith(sequence.slice(0, length))) {
          keep = length;
          break;
        }
      }
    }
    return keep;
  }
  respondWindowPixelSize() {
    if (!this.onResponse || !this.getPixelSize) return;
    const size = this.getPixelSize();
    const width = Math.max(0, Math.round(Number(size?.width) || 0));
    const height = Math.max(0, Math.round(Number(size?.height) || 0));
    if (!width || !height) return;
    this.onResponse(`\x1B[4;${height};${width}t`);
  }
  handleCommand(body, cursor, writeText) {
    const separator = body.indexOf(";");
    const control = separator === -1 ? body : body.slice(0, separator);
    const payload = separator === -1 ? "" : body.slice(separator + 1);
    const attributes = parseAttributes(control);
    const action = attributes.get("a") ?? "t";
    const explicitImageId = numeric(attributes, "i", 0);
    const continuation = explicitImageId === 0 ? this.transfers.values().next().value : void 0;
    const imageId = explicitImageId || continuation?.imageId || this.nextImageId++;
    const more = numeric(attributes, "m", 0) === 1;
    if (action === "d") {
      this.delete(attributes, imageId);
      return;
    }
    if (action === "q") {
      this.query(attributes, imageId);
      return;
    }
    if (action === "p") {
      this.put(imageId, attributes, cursor);
      return;
    }
    if (action !== "t" && action !== "T") return;
    let transfer = this.transfers.get(imageId);
    if (!transfer) {
      if (this.transfers.size >= KITTY_MAX_TRANSFERS) {
        this.respond(attributes, imageId, "EINVAL: too many image transfers");
        return;
      }
      transfer = { imageId, action, attributes, chunks: [], chars: 0 };
      this.transfers.set(imageId, transfer);
    }
    if (transfer.rejected || transfer.chunks.length >= 8192 || this.transferChars + payload.length > KITTY_MAX_TRANSFER_CHARS) {
      this.transferChars -= transfer.chars;
      transfer.chunks = [];
      transfer.chars = 0;
      transfer.rejected = true;
      if (!more) this.transfers.delete(imageId);
      this.respond(attributes, imageId, "EINVAL: image transfer exceeds capacity");
      return;
    }
    if (payload.length) transfer.chunks.push(payload);
    transfer.chars += payload.length;
    this.transferChars += payload.length;
    if (more) return;
    this.transfers.delete(imageId);
    this.transferChars -= transfer.chars;
    const generation = this.generation;
    return this.finishTransfer(transfer, cursor, writeText).catch((error) => {
      if (error?.code?.startsWith("BACKEND_")) throw error;
      if (this.generation === generation) this.respond(attributes, imageId, "EINVAL: image decode failed");
    });
  }
  async finishTransfer(transfer, cursor, writeText) {
    if (this.activeDecodes >= KITTY_MAX_DECODES) {
      this.respond(transfer.attributes, transfer.imageId, "EINVAL: image decoder is busy");
      return;
    }
    const bytes = decodeBase64(transfer.chunks.join(""));
    transfer.chunks = [];
    const generation = this.generation;
    const placementGeneration = this.placementGeneration;
    if (transfer.action === "T") {
      const movement = cursorMovement(
        transfer.attributes,
        transmittedImageDimensions(bytes, transfer.attributes),
        cursor
      );
      if (movement) await writeText(movement);
    }
    if (this.generation !== generation) return;
    this.activeDecodes += 1;
    const promise = decodeImage(bytes, transfer.attributes).then((image) => ({ image }));
    this.loading.set(transfer.imageId, promise);
    promise.then((image) => {
      if (this.generation !== generation || this.loading.get(transfer.imageId) !== promise) {
        releaseImage(image.image);
        return;
      }
      const previous = this.images.get(transfer.imageId);
      const nextBytes = this.imageBytes - imageByteSize(previous?.image) + imageByteSize(image.image);
      if (nextBytes > KITTY_MAX_IMAGE_BYTES || (!previous && this.images.size >= KITTY_MAX_IMAGES)) {
        releaseImage(image.image);
        this.respond(transfer.attributes, transfer.imageId, "EINVAL: image cache is full");
        return;
      }
      if (previous) {
        for (const placement of this.placements.values()) if (placement.imageId === transfer.imageId) placement.image = image.image;
        releaseImage(previous.image);
      }
      this.imageBytes = nextBytes;
      this.images.set(transfer.imageId, image);
      if (transfer.action === "T" && this.placementGeneration === placementGeneration) {
        this.place(image, transfer.imageId, transfer.attributes, cursor);
      }
      this.onChange();
    }).catch(() => {
      if (this.generation === generation) this.respond(transfer.attributes, transfer.imageId, "EINVAL: image decode failed");
    }).finally(() => {
      this.activeDecodes -= 1;
      if (this.loading.get(transfer.imageId) === promise) this.loading.delete(transfer.imageId);
    }).catch(() => {});
  }
  query(attributes, imageId) {
    const transmission = attributes.get("t") || "d";
    if (transmission !== "d") {
      this.respond(attributes, imageId, "EINVAL: only direct transmission is supported");
      return;
    }
    const format = numeric(attributes, "f", 100);
    if (format !== 24 && format !== 32 && format !== 100) {
      this.respond(attributes, imageId, "EINVAL: image format is unsupported");
      return;
    }
    const compression = attributes.get("o");
    if (compression && compression !== "z") {
      this.respond(attributes, imageId, "EINVAL: compression is unsupported");
      return;
    }
    this.respond(attributes, imageId);
  }
  put(imageId, attributes, cursor) {
    const image = this.images.get(imageId);
    if (image) {
      this.place(image, imageId, attributes, cursor);
      this.onChange();
      return;
    }
    const loading = this.loading.get(imageId);
    if (!loading) return;
    const generation = this.generation;
    const placementGeneration = this.placementGeneration;
    loading.then((ready) => {
      if (this.generation !== generation || this.placementGeneration !== placementGeneration || this.images.get(imageId) !== ready) return;
      this.place(ready, imageId, attributes, cursor);
      this.onChange();
    }).catch(() => void 0);
  }
  place(image, imageId, attributes, cursor) {
    const placementId = numeric(attributes, "p", 0) || this.nextPlacementId++;
    const key = `${imageId}:${placementId}`;
    if (!this.placements.has(key) && this.placements.size >= KITTY_MAX_PLACEMENTS) {
      this.respond(attributes, imageId, "EINVAL: too many image placements");
      return;
    }
    const absoluteRow = Number(cursor.absoluteRow);
    this.placements.set(key, {
      image: image.image,
      imageId,
      placementId,
      cellX: Math.max(0, cursor.x),
      cellY: Math.max(0, cursor.y),
      absoluteRow: Number.isFinite(absoluteRow) ? absoluteRow : void 0,
      columns: numeric(attributes, "c") || void 0,
      rows: numeric(attributes, "r") || void 0,
      sourceX: numeric(attributes, "x"),
      sourceY: numeric(attributes, "y"),
      sourceWidth: numeric(attributes, "w") || void 0,
      sourceHeight: numeric(attributes, "h") || void 0,
      hasSourceRectangle: ["x", "y", "w", "h"].some((name) => attributes.has(name)),
      pixelOffsetX: numeric(attributes, "X"),
      pixelOffsetY: numeric(attributes, "Y"),
      zIndex: numeric(attributes, "z")
    });
  }
  delete(attributes, imageId) {
    const target = attributes.get("d");
    if (!target || target === "a" || target === "A") {
      this.clearPlacements();
      if (target === "a" || target === "A") {
        this.generation += 1;
        this.loading.clear();
        this.transfers.clear();
        this.transferChars = 0;
        for (const { image } of this.images.values()) releaseImage(image);
        this.images.clear();
        this.imageBytes = 0;
      }
    } else if (target === "i" || target === "I") {
      this.loading.delete(imageId);
      this.transferChars -= this.transfers.get(imageId)?.chars || 0;
      this.transfers.delete(imageId);
      const previous = this.images.get(imageId);
      this.imageBytes -= imageByteSize(previous?.image);
      releaseImage(previous?.image);
      this.images.delete(imageId);
      for (const [key, placement] of this.placements) {
        if (placement.imageId === imageId) this.placements.delete(key);
      }
    } else if (target === "p") {
      const placementId = numeric(attributes, "p");
      for (const [key, placement] of this.placements) {
        if (placement.placementId === placementId) this.placements.delete(key);
      }
    }
    this.onChange();
  }
  respond(attributes, imageId, message = "OK") {
    if (!this.onResponse) return;
    const placementId = numeric(attributes, "p", 0);
    const placement = placementId ? `,p=${placementId}` : "";
    this.onResponse(`${KITTY_START}i=${imageId}${placement};${message}${KITTY_END}`);
  }
};

// Terminal prototype integration.
function terminalPixelSize(terminal) {
  const renderer = terminal.renderer;
  const canvas = terminal.canvas || renderer?.canvas || renderer?.getCanvas?.();
  const devicePixelRatio = Number(renderer?.devicePixelRatio) || Number(globalThis.devicePixelRatio) || 1;
  const backingWidth = Number(canvas?.width) || 0;
  const backingHeight = Number(canvas?.height) || 0;
  if (backingWidth > 0 && backingHeight > 0 && devicePixelRatio > 0) {
    return {
      width: backingWidth / devicePixelRatio,
      height: backingHeight / devicePixelRatio
    };
  }
  const metrics = renderer?.metrics;
  return {
    width: (Number(terminal.cols) || 0) * (Number(metrics?.width) || 0),
    height: (Number(terminal.rows) || 0) * (Number(metrics?.height) || 0)
  };
}
function placementSourceRectangle(placement) {
  const imageWidth = Math.max(0, Number(placement.image?.width) || 0);
  const imageHeight = Math.max(0, Number(placement.image?.height) || 0);
  const x = Math.min(imageWidth, Math.max(0, placement.sourceX));
  const y = Math.min(imageHeight, Math.max(0, placement.sourceY));
  const requestedWidth = placement.sourceWidth ?? imageWidth - x;
  const requestedHeight = placement.sourceHeight ?? imageHeight - y;
  return {
    x,
    y,
    width: Math.min(imageWidth - x, Math.max(0, requestedWidth)),
    height: Math.min(imageHeight - y, Math.max(0, requestedHeight))
  };
}
function placementTargetSize(placement, source, metrics) {
  let width = placement.columns !== void 0 ? placement.columns * metrics.width : void 0;
  let height = placement.rows !== void 0 ? placement.rows * metrics.height : void 0;
  if (width !== void 0 && height === void 0 && source.width > 0 && source.height > 0) {
    height = width * source.height / source.width;
  } else if (height !== void 0 && width === void 0 && source.width > 0 && source.height > 0) {
    width = height * source.width / source.height;
  } else if (placement.hasSourceRectangle && width === void 0 && height === void 0) {
    width = source.width;
    height = source.height;
  }
  return { width, height };
}
function drawPlacements(terminal, graphics, viewportY) {
  const renderer = terminal.renderer;
  const ctx = renderer?.ctx;
  const metrics = renderer?.metrics;
  if (!ctx || !metrics) return;
  const scrollbackLength = Number(terminal.wasmTerm?.getScrollbackLength?.());
  const currentScrollback = Number.isFinite(scrollbackLength) ? Math.max(0, scrollbackLength) : void 0;
  const currentViewportY = Number(viewportY);
  const viewport = Number.isFinite(currentViewportY)
    ? currentViewportY
    : Number(terminal.getViewportY?.() ?? terminal.viewportY) || 0;
  const placements = [...graphics.getPlacements()].sort(
    (left, right) => left.zIndex - right.zIndex
  );
  for (const placement of placements) {
    const x = placement.cellX * metrics.width + placement.pixelOffsetX;
    const cellY = placement.absoluteRow !== void 0 && currentScrollback !== void 0
      ? placement.absoluteRow - currentScrollback + viewport
      : placement.cellY;
    const y = cellY * metrics.height + placement.pixelOffsetY;
    const source = placementSourceRectangle(placement);
    if (source.width <= 0 || source.height <= 0) continue;
    const { width, height } = placementTargetSize(placement, source, metrics);
    if (placement.hasSourceRectangle && width !== void 0 && height !== void 0) {
      ctx.drawImage(
        placement.image,
        source.x,
        source.y,
        source.width,
        source.height,
        x,
        y,
        width,
        height
      );
    } else if (width !== void 0 && height !== void 0) {
      ctx.drawImage(placement.image, x, y, width, height);
    } else {
      ctx.drawImage(placement.image, x, y);
    }
  }
}
function installKittyGraphicsSupport(TerminalClass) {
  const prototype = TerminalClass.prototype;
  if (prototype.__kittyGraphicsInstalled) return;
  prototype.__kittyGraphicsInstalled = true;
  const originalOpen = prototype.open;
  const originalWrite = prototype.write;
  const originalClear = prototype.clear;
  const originalReset = prototype.reset;
  const originalDispose = prototype.dispose;
  prototype.open = function(parent) {
    originalOpen.call(this, parent);
    const terminal = this;
    const graphics = new KittyGraphics(
      () => terminal.requestRender({ full: true }),
      (response) => terminal.input(response, true),
      () => terminalPixelSize(terminal)
    );
    terminal.__kittyGraphics = graphics;
    const renderer = terminal.renderer;
    if (!renderer) return;
    const originalRender = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      if (graphics.getPlacements().length > 0) {
        args[1] = true;
      }
      const rendered = originalRender(...args);
      if (rendered) drawPlacements(terminal, graphics, args[2]);
      return rendered;
    };
  };
  prototype.write = async function(data, callback) {
    const terminal = this;
    const graphics = terminal.__kittyGraphics;
    if (!graphics || !terminal.wasmTerm) {
      return originalWrite.call(this, data, callback);
    }
    await graphics.consume(
      data,
      () => {
        const cursor = terminal.wasmTerm.getCursor();
        const scrollbackLength = Number(terminal.wasmTerm.getScrollbackLength?.());
        const absoluteRow = Number.isFinite(scrollbackLength)
          ? scrollbackLength + Number(cursor.y || 0)
          : void 0;
        return {
          x: cursor.x,
          y: cursor.y,
          absoluteRow,
          cellWidth: Number(terminal.renderer?.metrics?.width) || 0,
          cellHeight: Number(terminal.renderer?.metrics?.height) || 0
        };
      },
      (text) => {
        if (text.length > 0) return originalWrite.call(this, text);
      }
    );
    if (callback) requestAnimationFrame(callback);
  };
  prototype.clear = function() {
    originalClear.call(this);
    this.__kittyGraphics?.clear();
  };
  prototype.reset = function() {
    originalReset.call(this);
    this.__kittyGraphics?.clear();
  };
  prototype.dispose = function() {
    const terminal = this;
    originalDispose.call(this);
    terminal.__kittyGraphics?.clear();
    terminal.__kittyGraphics = void 0;
  };
}
export {
  isKittyGraphicsResponse,
  installKittyGraphicsSupport,
  terminalPixelSize
};
