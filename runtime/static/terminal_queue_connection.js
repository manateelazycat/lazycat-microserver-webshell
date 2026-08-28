export const terminalQueueProtocolVersion = 1;

const queueBinaryMagic = "LCQ1";
const queueBinaryPrefixBytes = 8;
const textDecoder = new TextDecoder();

const socketConnecting = 0;
const socketOpen = 1;
const socketClosing = 2;
const socketClosed = 3;

const normalizeIdentity = (descriptor = {}) => {
  const paneID = String(descriptor.pane_id || descriptor.paneID || "").trim();
  const streamID = String(descriptor.stream_id || descriptor.streamID || "").trim();
  const channelGeneration = Math.floor(Number(descriptor.channel_generation || descriptor.channelGeneration || 0));
  if (!paneID || !streamID || !Number.isSafeInteger(channelGeneration) || channelGeneration <= 0) {
    throw new Error("invalid terminal queue logical stream identity");
  }
  return { paneID, streamID, channelGeneration };
};

const streamKey = ({ paneID, streamID, channelGeneration }) => (
  `${paneID}\u0000${streamID}\u0000${channelGeneration}`
);

const parseCursor = (value) => {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  try {
    return BigInt(text);
  } catch (error) {
    return null;
  }
};

const parseSequence = (value) => {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const sequence = Number(text);
  return Number.isSafeInteger(sequence) ? sequence : null;
};

const crc32 = (data) => {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
};

const payloadChecksumMatches = (data, expected) => {
  if (expected === undefined || expected === null || expected === "") {
    return true;
  }
  const text = String(expected).trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,8}$/.test(text)) {
    return false;
  }
  return crc32(data).toString(16).padStart(8, "0") === text.padStart(8, "0");
};

export const decodeTerminalQueueBinaryFrame = (input) => {
  const data = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : null;
  if (!data || data.byteLength < queueBinaryPrefixBytes) {
    throw new Error("terminal queue binary frame is truncated");
  }
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== queueBinaryMagic) {
    throw new Error("terminal queue binary frame has invalid magic");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(4, false);
  if (headerLength <= 0 || queueBinaryPrefixBytes + headerLength > data.byteLength) {
    throw new Error("terminal queue binary frame has invalid header length");
  }
  let header;
  try {
    header = JSON.parse(textDecoder.decode(data.subarray(queueBinaryPrefixBytes, queueBinaryPrefixBytes + headerLength)));
  } catch (error) {
    throw new Error("terminal queue binary frame has invalid header");
  }
  const payload = data.subarray(queueBinaryPrefixBytes + headerLength);
  return {
    header,
    payload: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  };
};

const createListenerStore = () => {
  const listeners = new Map();
  return {
    add(type, listener) {
      if (typeof listener !== "function") {
        return;
      }
      const entries = listeners.get(type) || new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    remove(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event) {
      for (const listener of Array.from(listeners.get(type) || [])) {
        try {
          listener.call(null, event);
        } catch (error) {
          queueMicrotask(() => { throw error; });
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
};

export const createTerminalQueueConnection = ({
  url,
  WebSocketImpl = globalThis.WebSocket,
  onStateChange = () => {},
  onProtocolError = () => {},
  onPhysicalError = () => {},
  onPhysicalClose = () => {},
  keepAliveWhenEmpty = false,
} = {}) => {
  if (!url || typeof WebSocketImpl !== "function") {
    throw new TypeError("terminal queue connection requires a URL and WebSocket implementation");
  }

  const logicalStreams = new Map();
  let physicalSocket = null;
  let physicalReadyState = socketClosed;
  let disposed = false;
  let subscriptionUpdatePending = false;
  let physicalErrorDispatched = false;
  let physicalLastPongAt = 0;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  let closedResolved = false;
  let api = null;

  const resolveFinalClose = () => {
    if (closedResolved) {
      return;
    }
    closedResolved = true;
    resolveClosed();
  };

  const snapshot = () => ({
    physicalReadyState,
    logicalCount: logicalStreams.size,
    paneIDs: Array.from(logicalStreams.values(), (entry) => entry.identity.paneID),
    physicalLastPongAt,
    physicalRole: "queue",
  });
  const emitState = () => onStateChange(snapshot());

  const sendPhysical = (payload) => {
    if (!physicalSocket || physicalSocket.readyState !== socketOpen) {
      return false;
    }
    physicalSocket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    return true;
  };

  const sendSubscriptions = () => {
    subscriptionUpdatePending = false;
    const entries = Array.from(logicalStreams.values());
    const subscriptions = entries.map((entry) => ({ ...entry.subscription }));
    if (!sendPhysical({
      type: "replace-subscriptions",
      protocol_version: terminalQueueProtocolVersion,
      subscriptions,
    })) {
      subscriptionUpdatePending = true;
      return false;
    }
    for (const entry of entries) {
      entry.lastSentPriority = Math.max(0, Math.min(3, Math.floor(Number(entry.subscription.priority) || 0)));
    }
    return true;
  };

  const scheduleSubscriptionUpdate = () => {
    if (subscriptionUpdatePending) {
      return;
    }
    subscriptionUpdatePending = true;
    queueMicrotask(() => {
      if (!disposed && subscriptionUpdatePending) {
        sendSubscriptions();
      }
    });
  };

  const dispatchLogicalClose = (entry, { code = 1000, reason = "", wasClean = true } = {}) => {
    if (!entry || entry.readyState === socketClosed) {
      return;
    }
    entry.readyState = socketClosed;
    entry.listeners.dispatch("close", { type: "close", code, reason, wasClean, target: entry.socket });
  };

  const failLogicalProtocol = (entry, message) => {
    const error = new Error(message);
    onProtocolError(error, entry?.identity || null);
    if (!entry || entry.readyState === socketClosed) {
      return;
    }
    entry.listeners.dispatch("message", {
      type: "message",
      data: JSON.stringify({ type: "connection-error", retryable: true, resync_required: true, message }),
      target: entry.socket,
    });
  };

  const dispatchPhysicalError = (message, originalEvent = null) => {
    if (physicalErrorDispatched) {
      return false;
    }
    const entry = logicalStreams.values().next().value;
    if (!entry || entry.readyState === socketClosed) {
      return false;
    }
    physicalErrorDispatched = true;
    onPhysicalError({
      message: String(message || "terminal queue connection failed"),
      originalEvent,
      connection: api,
    });
    entry.listeners.dispatch("error", {
      type: "error",
      message: String(message || "terminal queue connection failed"),
      originalEvent,
      target: entry.socket,
    });
    return true;
  };

  const routePaneControl = (message) => {
    const identity = normalizeIdentity(message);
    const entry = logicalStreams.get(streamKey(identity));
    if (!entry || entry.readyState !== socketOpen) {
      return false;
    }
    const payload = message.payload;
    if (!payload || typeof payload !== "object") {
      failLogicalProtocol(entry, "terminal queue pane control payload is invalid");
      return false;
    }
    if (payload.type === "history-replay-start") {
      const cursor = parseCursor(payload.delta_from_cursor);
      if (cursor === null) {
        failLogicalProtocol(entry, "terminal queue replay start cursor is invalid");
        return false;
      }
      entry.expectedCursor = cursor;
    } else if (payload.type === "history-replay-complete") {
      const cursor = parseCursor(payload.history_cursor);
      if (cursor === null || entry.expectedCursor === null || cursor !== entry.expectedCursor) {
        failLogicalProtocol(entry, "terminal queue replay completion cursor is not continuous");
        return false;
      }
    }
    entry.listeners.dispatch("message", {
      type: "message",
      data: JSON.stringify(payload),
      queueMetadata: identity,
      target: entry.socket,
    });
    return true;
  };

  const routeBinary = (data) => {
    let decoded;
    try {
      decoded = decodeTerminalQueueBinaryFrame(data);
    } catch (error) {
      onProtocolError(error, null);
      return false;
    }
    let identity;
    try {
      identity = normalizeIdentity(decoded.header);
    } catch (error) {
      onProtocolError(error, null);
      return false;
    }
    const entry = logicalStreams.get(streamKey(identity));
    if (!entry || entry.readyState !== socketOpen) {
      return false;
    }
    const frameHistoryGeneration = String(decoded.header.history_generation || "").trim();
    const expectedHistoryGeneration = String(entry.subscription.history_generation || "").trim();
    if (frameHistoryGeneration && expectedHistoryGeneration && frameHistoryGeneration !== expectedHistoryGeneration) {
      failLogicalProtocol(entry, "terminal queue binary history generation does not match");
      return false;
    }
    const startCursor = parseCursor(decoded.header.start_cursor);
    const endCursor = parseCursor(decoded.header.end_cursor);
    const sequenceProvided = Object.prototype.hasOwnProperty.call(decoded.header, "sequence");
    const sequence = parseSequence(decoded.header.sequence);
    const expectedSequence = entry.expectedSequence;
    const sequenceValid = entry.sequenceMode === null
      ? (!sequenceProvided || sequence !== null)
      : sequence !== null && sequence === expectedSequence + 1;
    if (
      startCursor === null
      || endCursor === null
      || endCursor < startCursor
      || BigInt(decoded.payload.byteLength) !== endCursor - startCursor
      || entry.expectedCursor === null
      || entry.expectedCursor !== startCursor
      || !sequenceValid
      || !payloadChecksumMatches(new Uint8Array(decoded.payload), decoded.header.checksum)
    ) {
      failLogicalProtocol(entry, "terminal queue binary frame identity or cursor validation failed");
      return false;
    }
    if (entry.sequenceMode === null) {
      entry.sequenceMode = sequenceProvided;
    }
    if (sequence !== null) {
      entry.expectedSequence = sequence;
    }
    entry.expectedCursor = endCursor;
    entry.listeners.dispatch("message", {
      type: "message",
      data: decoded.payload,
      queueMetadata: {
        ...identity,
        startCursor,
        endCursor,
        ...(sequence === null ? {} : { sequence }),
        ...(frameHistoryGeneration ? { historyGeneration: frameHistoryGeneration } : {}),
      },
      target: entry.socket,
    });
    return true;
  };

  const closeAllLogical = (event = {}) => {
    const entries = Array.from(logicalStreams.values());
    logicalStreams.clear();
    for (const entry of entries) {
      dispatchLogicalClose(entry, event);
      entry.listeners.clear();
    }
    emitState();
  };

  const ensurePhysicalSocket = () => {
    if (disposed || physicalSocket?.readyState === socketOpen || physicalSocket?.readyState === socketConnecting) {
      return;
    }
    physicalReadyState = socketConnecting;
    const socket = new WebSocketImpl(String(url));
    physicalSocket = socket;
    socket.binaryType = "arraybuffer";
    emitState();
    socket.addEventListener("open", () => {
      if (physicalSocket !== socket || disposed) {
        return;
      }
      physicalReadyState = socketOpen;
      physicalErrorDispatched = false;
      sendSubscriptions();
      for (const entry of logicalStreams.values()) {
        if (entry.readyState === socketConnecting) {
          entry.readyState = socketOpen;
          entry.listeners.dispatch("open", { type: "open", target: entry.socket });
        }
      }
      emitState();
    });
    socket.addEventListener("message", (event) => {
      if (physicalSocket !== socket || disposed) {
        return;
      }
      if (typeof event.data === "string") {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          onProtocolError(new Error("terminal queue control frame is invalid"), null);
          return;
        }
        if (message.type === "pane-control") {
          routePaneControl(message);
        } else if (message.type === "queue-pong") {
          physicalLastPongAt = Date.now();
        } else if (message.type === "queue-state" && message.state === "agent-preparing") {
          for (const entry of logicalStreams.values()) {
            entry.listeners.dispatch("message", {
              type: "message",
              data: JSON.stringify({ type: "agent-preparing" }),
              target: entry.socket,
            });
          }
        } else if (message.type === "queue-error") {
          const detail = String(message.payload?.message || message.message || "terminal queue connection failed");
          if (!message.payload || message.payload.retryable !== true) {
            onProtocolError(new Error(detail), null);
          }
          dispatchPhysicalError(detail, event);
        }
        return;
      }
      routeBinary(event.data);
    });
    socket.addEventListener("error", (event) => {
      if (physicalSocket !== socket || disposed) {
        return;
      }
      dispatchPhysicalError("terminal queue websocket error", event);
    });
    socket.addEventListener("close", (event) => {
      if (physicalSocket !== socket) {
        return;
      }
      physicalSocket = null;
      physicalReadyState = socketClosed;
      disposed = true;
      const closeEvent = {
        code: Number(event.code || 1006),
        reason: String(event.reason || "terminal queue connection closed"),
        wasClean: event.wasClean === true,
      };
      onPhysicalClose({ ...closeEvent, connection: api });
      closeAllLogical(closeEvent);
      // The close event is the authoritative physical transport transition.
      // Emit it after logical streams are notified so the owner can discard
      // stale topology leases and create a fresh connection instance.
      emitState();
      resolveFinalClose();
    });
  };

  const open = (descriptor = {}) => {
    if (disposed) {
      throw new Error("terminal queue connection is closed");
    }
    const identity = normalizeIdentity(descriptor);
    const key = streamKey(identity);
    if (logicalStreams.has(key)) {
      throw new Error("terminal queue logical stream already exists");
    }
    for (const entry of logicalStreams.values()) {
      if (entry.identity.paneID === identity.paneID) {
        throw new Error("terminal queue pane already has a logical stream");
      }
    }
    const listeners = createListenerStore();
    const entry = {
      identity,
      subscription: {
        ...descriptor,
        pane_id: identity.paneID,
        stream_id: identity.streamID,
        channel_generation: identity.channelGeneration,
      },
      readyState: physicalReadyState === socketOpen ? socketOpen : socketConnecting,
      expectedCursor: null,
      expectedSequence: null,
      sequenceMode: null,
      lastSentPriority: null,
      listeners,
      socket: null,
    };
    const logicalSocket = {
      get readyState() {
        return entry.readyState;
      },
      get bufferedAmount() {
        return Number(physicalSocket?.bufferedAmount || 0);
      },
      binaryType: "arraybuffer",
      addEventListener(type, listener) {
        listeners.add(String(type || ""), listener);
      },
      removeEventListener(type, listener) {
        listeners.remove(String(type || ""), listener);
      },
      send(data) {
        if (entry.readyState !== socketOpen) {
          throw new Error("terminal queue logical socket is not open");
        }
        let control;
        try {
          control = typeof data === "string" ? JSON.parse(data) : data;
        } catch (error) {
          throw new Error("terminal queue logical socket requires JSON control messages");
        }
        if (!control || typeof control !== "object") {
          throw new Error("terminal queue logical socket control payload is invalid");
        }
        if (!sendPhysical({
          type: "pane-control",
          protocol_version: terminalQueueProtocolVersion,
          pane_id: identity.paneID,
          stream_id: identity.streamID,
          channel_generation: identity.channelGeneration,
          control,
        })) {
          throw new Error("terminal queue physical socket is not open");
        }
      },
      close(code = 1000, reason = "logical stream closed") {
        if (entry.readyState === socketClosed || entry.readyState === socketClosing) {
          return;
        }
        entry.readyState = socketClosing;
        logicalStreams.delete(key);
        dispatchLogicalClose(entry, { code, reason: String(reason || ""), wasClean: true });
        listeners.clear();
        if (logicalStreams.size === 0 && !keepAliveWhenEmpty) {
          disposed = true;
          const socket = physicalSocket;
          if (socket && socket.readyState < socketClosing) {
            physicalReadyState = socketClosing;
            socket.close(1000, "terminal queue has no subscriptions");
          } else if (!socket || socket.readyState === socketClosed) {
            physicalSocket = null;
            physicalReadyState = socketClosed;
            resolveFinalClose();
          }
        }
        if (!disposed) {
          scheduleSubscriptionUpdate();
        }
        emitState();
      },
    };
    entry.socket = logicalSocket;
    logicalStreams.set(key, entry);
    ensurePhysicalSocket();
    if (entry.readyState === socketOpen) {
      scheduleSubscriptionUpdate();
      queueMicrotask(() => {
        if (entry.readyState === socketOpen) {
          listeners.dispatch("open", { type: "open", target: logicalSocket });
        }
      });
    }
    emitState();
    return logicalSocket;
  };

  const setPriority = (identityOrPaneID, priority = 0) => {
    const entry = typeof identityOrPaneID === "string"
      ? Array.from(logicalStreams.values()).find((candidate) => candidate.identity.paneID === identityOrPaneID)
      : logicalStreams.get(streamKey(identityOrPaneID || {}));
    if (!entry) {
      return false;
    }
    const nextPriority = Math.max(0, Math.min(3, Math.floor(Number(priority) || 0)));
    entry.subscription.priority = nextPriority;
    if (entry.lastSentPriority === nextPriority) {
      return true;
    }
    const sent = sendPhysical({
      type: "set-priority",
      protocol_version: terminalQueueProtocolVersion,
      pane_id: entry.identity.paneID,
      stream_id: entry.identity.streamID,
      channel_generation: entry.identity.channelGeneration,
      priority: nextPriority,
    });
    if (sent) {
      entry.lastSentPriority = nextPriority;
    }
    return sent;
  };

  const ping = () => sendPhysical({
    type: "queue-ping",
    protocol_version: terminalQueueProtocolVersion,
  });

  const close = (code = 1000, reason = "terminal queue disposed") => {
    if (disposed) {
      return;
    }
    disposed = true;
    const socket = physicalSocket;
    physicalReadyState = socket && socket.readyState !== socketClosed ? socketClosing : socketClosed;
    closeAllLogical({ code, reason, wasClean: true });
    if (socket && socket.readyState < socketClosing) {
      socket.close(code, reason);
    } else if (!socket || socket.readyState === socketClosed) {
      physicalSocket = null;
      physicalReadyState = socketClosed;
      resolveFinalClose();
    }
  };

  const connect = () => {
    if (disposed) {
      throw new Error("terminal queue connection is closed");
    }
    ensurePhysicalSocket();
    emitState();
    return snapshot();
  };

  api = {
    connect,
    open,
    close,
    setPriority,
    ping,
    closed,
    snapshot,
    getPhysicalSocket() {
      return physicalSocket;
    },
    hasPane(paneID) {
      const normalized = String(paneID || "").trim();
      return Array.from(logicalStreams.values()).some((entry) => entry.identity.paneID === normalized);
    },
  };
  return api;
};
