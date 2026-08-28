const socketConnecting = 0;
const socketOpen = 1;
const socketClosing = 2;
const textEncoder = new TextEncoder();

const defaultNow = () => (
  globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now()
);

const stateFromReadyState = (readyState) => {
  if (readyState === socketConnecting) {
    return "connecting";
  }
  if (readyState === socketOpen) {
    return "open";
  }
  if (readyState === socketClosing) {
    return "closing";
  }
  return "idle";
};

export const terminalNetworkPayloadBytes = (payload) => {
  if (typeof payload === "string") {
    return textEncoder.encode(payload).byteLength;
  }
  if (payload instanceof ArrayBuffer) {
    return payload.byteLength;
  }
  if (ArrayBuffer.isView(payload)) {
    return payload.byteLength;
  }
  if (typeof Blob === "function" && payload instanceof Blob) {
    return payload.size;
  }
  return 0;
};

export const terminalNetworkMegabytes = (bytes) => Math.max(0, Number(bytes) || 0) / 1_000_000;

export const createTerminalNetworkMonitor = ({
  layout = "unified",
  now = defaultNow,
  onStateChange = () => {},
} = {}) => {
  let currentLayout = layout === "direct" ? "direct" : "unified";
  let disposed = false;
  let lastSampleAt = now();
  let lastSampleReceivedBytes = 0;
  let lastSampleSentBytes = 0;
  let receivedBytesPerSecond = 0;
  let sentBytesPerSecond = 0;
  const attachments = new Map();
  const channels = Array.from({ length: 3 }, (_, index) => ({
    index,
    socket: null,
    kind: "",
    state: "idle",
    receivedBytes: 0,
    sentBytes: 0,
    receivedBytesPerSecond: 0,
    sentBytesPerSecond: 0,
    lastSampleReceivedBytes: 0,
    lastSampleSentBytes: 0,
  }));

  const channelLabel = (channel) => {
    if (currentLayout === "direct") {
      return `直连通道 ${channel.index + 1}`;
    }
    return "统一通道";
  };

  const renderedChannels = () => currentLayout === "direct" ? channels : [];

  const totals = () => channels.reduce((result, channel) => ({
    receivedBytes: result.receivedBytes + channel.receivedBytes,
    sentBytes: result.sentBytes + channel.sentBytes,
  }), { receivedBytes: 0, sentBytes: 0 });

  const monitorStatus = () => {
    const states = channels.map((channel) => channel.state);
    if (states.includes("error")) {
      return "error";
    }
    if (states.includes("connecting")) {
      return "connecting";
    }
    if (states.includes("closing")) {
      return "retrying";
    }
    if (states.includes("open")) {
      return "open";
    }
    return "idle";
  };

  const snapshot = () => {
    const total = totals();
    return {
      layout: currentLayout,
      status: monitorStatus(),
      channels: renderedChannels().map((channel) => ({
        index: channel.index,
        label: channelLabel(channel),
        kind: channel.kind,
        state: channel.state,
        active: Boolean(channel.socket),
        receivedBytes: channel.receivedBytes,
        sentBytes: channel.sentBytes,
        totalBytes: channel.receivedBytes + channel.sentBytes,
        receivedBytesPerSecond: channel.receivedBytesPerSecond,
        sentBytesPerSecond: channel.sentBytesPerSecond,
        bytesPerSecond: channel.receivedBytesPerSecond + channel.sentBytesPerSecond,
      })),
      receivedBytes: total.receivedBytes,
      sentBytes: total.sentBytes,
      totalBytes: total.receivedBytes + total.sentBytes,
      receivedBytesPerSecond,
      sentBytesPerSecond,
      bytesPerSecond: receivedBytesPerSecond + sentBytesPerSecond,
    };
  };

  const emit = () => {
    if (!disposed) {
      onStateChange(snapshot());
    }
  };

  const releaseAttachment = (attachment, { emitChange = true } = {}) => {
    if (!attachment || attachments.get(attachment.socket) !== attachment) {
      return false;
    }
    const {
      socket,
      channel,
      listeners,
      wrappedSend,
      wrappedClose,
      originalSend,
      originalClose,
      hadOwnSend,
      hadOwnClose,
    } = attachment;
    attachments.delete(socket);
    for (const [type, listener] of listeners) {
      socket.removeEventListener(type, listener);
    }
    if (socket.send === wrappedSend) {
      if (hadOwnSend) {
        socket.send = originalSend;
      } else {
        delete socket.send;
      }
    }
    if (socket.close === wrappedClose) {
      if (hadOwnClose) {
        socket.close = originalClose;
      } else {
        delete socket.close;
      }
    }
    channel.socket = null;
    channel.kind = "";
    channel.state = "idle";
    if (emitChange) {
      emit();
    }
    return true;
  };

  const detachAll = ({ emitChange = true } = {}) => {
    for (const attachment of Array.from(attachments.values())) {
      releaseAttachment(attachment, { emitChange: false });
    }
    if (emitChange) {
      emit();
    }
  };

  const availableChannel = (kind, slot = null) => {
    if (kind === "unified") {
      return currentLayout === "unified" && !channels[0].socket ? channels[0] : null;
    }
    if (currentLayout !== "direct") {
      return null;
    }
    const limit = 3;
    const requestedSlot = slot === null || slot === undefined ? -1 : Math.floor(Number(slot));
    if (requestedSlot >= 0 && requestedSlot < limit) {
      return !channels[requestedSlot].socket ? channels[requestedSlot] : null;
    }
    return channels.slice(0, limit).find((channel) => !channel.socket) || null;
  };

  const attachSocket = (socket, { kind = "fast", slot = null } = {}) => {
    if (
      disposed
      || !socket
      || typeof socket.addEventListener !== "function"
      || typeof socket.send !== "function"
      || typeof socket.close !== "function"
    ) {
      return null;
    }
    if (attachments.has(socket)) {
      return attachments.get(socket).handle;
    }
    const normalizedKind = kind === "unified" ? "unified" : "fast";
    const channel = availableChannel(normalizedKind, slot);
    const requestedSlot = slot === null || slot === undefined ? -1 : Math.floor(Number(slot));
    const requestedChannel = requestedSlot >= 0 && requestedSlot < channels.length
      ? channels[requestedSlot]
      : null;
    if (!channel && requestedChannel?.socket && requestedChannel.socket !== socket) {
      const previous = attachments.get(requestedChannel.socket);
      if (previous) {
        releaseAttachment(previous, { emitChange: false });
      }
    }
    const targetChannel = channel || requestedChannel;
    if (!targetChannel || targetChannel.socket) {
      return null;
    }
    const hadOwnSend = Object.prototype.hasOwnProperty.call(socket, "send");
    const hadOwnClose = Object.prototype.hasOwnProperty.call(socket, "close");
    const originalSend = socket.send;
    const originalClose = socket.close;
    const attachment = {
      socket,
      channel: targetChannel,
      listeners: [],
      wrappedSend: null,
      wrappedClose: null,
      originalSend,
      originalClose,
      hadOwnSend,
      hadOwnClose,
      handle: null,
    };
    const setState = (state) => {
      if (attachments.get(socket) !== attachment || targetChannel.state === state) {
        return;
      }
      targetChannel.state = state;
      emit();
    };
    const addListener = (type, listener) => {
      socket.addEventListener(type, listener);
      attachment.listeners.push([type, listener]);
    };
    const wrappedSend = function sendWithNetworkMeasurement(payload) {
      const result = Reflect.apply(originalSend, this, [payload]);
      targetChannel.sentBytes += terminalNetworkPayloadBytes(payload);
      return result;
    };
    const wrappedClose = function closeWithNetworkMeasurement(...args) {
      setState("closing");
      return Reflect.apply(originalClose, this, args);
    };
    attachment.wrappedSend = wrappedSend;
    attachment.wrappedClose = wrappedClose;
    socket.send = wrappedSend;
    socket.close = wrappedClose;
    targetChannel.socket = socket;
    targetChannel.kind = normalizedKind;
    targetChannel.state = stateFromReadyState(socket.readyState);
    addListener("open", () => setState("open"));
    addListener("message", (event) => {
      targetChannel.receivedBytes += terminalNetworkPayloadBytes(event?.data);
    });
    addListener("error", () => setState("error"));
    addListener("close", () => releaseAttachment(attachment));
    attachment.handle = {
      detach: () => releaseAttachment(attachment),
      get index() {
        return targetChannel.index;
      },
    };
    attachments.set(socket, attachment);
    emit();
    return attachment.handle;
  };

  const sample = () => {
    if (disposed) {
      return snapshot();
    }
    const sampledAt = now();
    const elapsedSeconds = Math.max(0, sampledAt - lastSampleAt) / 1000;
    const total = totals();
    if (elapsedSeconds > 0) {
      receivedBytesPerSecond = Math.max(0, total.receivedBytes - lastSampleReceivedBytes) / elapsedSeconds;
      sentBytesPerSecond = Math.max(0, total.sentBytes - lastSampleSentBytes) / elapsedSeconds;
      for (const channel of channels) {
        channel.receivedBytesPerSecond = Math.max(0, channel.receivedBytes - channel.lastSampleReceivedBytes) / elapsedSeconds;
        channel.sentBytesPerSecond = Math.max(0, channel.sentBytes - channel.lastSampleSentBytes) / elapsedSeconds;
        channel.lastSampleReceivedBytes = channel.receivedBytes;
        channel.lastSampleSentBytes = channel.sentBytes;
      }
    }
    lastSampleAt = sampledAt;
    lastSampleReceivedBytes = total.receivedBytes;
    lastSampleSentBytes = total.sentBytes;
    emit();
    return snapshot();
  };

  const setLayout = (nextLayout) => {
    const normalized = nextLayout === "direct" ? "direct" : "unified";
    if (currentLayout === normalized) {
      return snapshot();
    }
    detachAll({ emitChange: false });
    currentLayout = normalized;
    emit();
    return snapshot();
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    detachAll({ emitChange: false });
    disposed = true;
  };

  return {
    attachSocket,
    detachAll,
    dispose,
    sample,
    setLayout,
    snapshot,
  };
};
