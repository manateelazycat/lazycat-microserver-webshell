const defaultMaxPending = 1024 * 1024;
const defaultMaxDecoded = 1024 * 1024;
const osc52Start = "\x1b]52;";

const chunkText = (chunk) => {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return new TextDecoder("latin1").decode(chunk);
  }
  if (chunk instanceof ArrayBuffer) {
    return new TextDecoder("latin1").decode(new Uint8Array(chunk));
  }
  return "";
};

const retainIncompletePrefix = (buffer) => {
  const limit = Math.min(osc52Start.length, buffer.length);
  for (let size = limit; size >= 1; size -= 1) {
    const suffix = buffer.slice(buffer.length - size);
    if (osc52Start.startsWith(suffix)) {
      return suffix;
    }
  }
  return "";
};

const decodeBase64Utf8 = (payload, maxDecoded) => {
  const cleaned = String(payload || "").replace(/\s+/g, "");
  if (!cleaned || cleaned === "?") {
    return "";
  }
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
    return "";
  }
  try {
    const binary = globalThis.atob(padded);
    if (!binary || binary.length > maxDecoded) {
      return "";
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch (error) {
    return "";
  }
};

const decodeOsc52Body = (body, maxDecoded) => {
  const separator = body.indexOf(";");
  if (separator < 0) {
    return "";
  }
  return decodeBase64Utf8(body.slice(separator + 1), maxDecoded);
};

export const consumeTerminalOsc52Chunk = (
  pending,
  chunk,
  {
    maxPending = defaultMaxPending,
    maxDecoded = defaultMaxDecoded,
  } = {},
) => {
  let buffer = `${pending || ""}${chunkText(chunk)}`;
  if (buffer.length > maxPending) {
    buffer = buffer.slice(buffer.length - maxPending);
  }
  const writes = [];
  while (buffer) {
    const start = buffer.indexOf(osc52Start);
    if (start < 0) {
      buffer = retainIncompletePrefix(buffer);
      break;
    }
    const bodyStart = start + osc52Start.length;
    const bel = buffer.indexOf("\x07", bodyStart);
    const st = buffer.indexOf("\x1b\\", bodyStart);
    let end = -1;
    let terminatorLength = 0;
    if (bel >= 0 && (st < 0 || bel <= st)) {
      end = bel;
      terminatorLength = 1;
    } else if (st >= 0) {
      end = st;
      terminatorLength = 2;
    }
    if (end < 0) {
      buffer = buffer.slice(start);
      if (buffer.length > maxPending) {
        buffer = "";
      }
      break;
    }
    const text = decodeOsc52Body(buffer.slice(bodyStart, end), maxDecoded);
    if (text) {
      writes.push(text);
    }
    buffer = buffer.slice(end + terminatorLength);
  }
  return { pending: buffer, writes };
};
