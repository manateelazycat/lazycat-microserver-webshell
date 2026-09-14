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
  if (readyState === socketConnecting) return "connecting";
  if (readyState === socketOpen) return "open";
  if (readyState === socketClosing) return "closing";
  return "idle";
};

export const terminalNetworkPayloadBytes = (payload) => {
  if (typeof payload === "string") return textEncoder.encode(payload).byteLength;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  if (ArrayBuffer.isView(payload)) return payload.byteLength;
  if (typeof Blob === "function" && payload instanceof Blob) return payload.size;
  return 0;
};

export const terminalNetworkMegabytes = (bytes) => Math.max(0, Number(bytes) || 0) / 1_000_000;

const aggregateMetrics = (items) => Array.from(items).reduce((result, item) => ({
  receivedBytes: result.receivedBytes + item.receivedBytes,
  sentBytes: result.sentBytes + item.sentBytes,
  receivedBytesPerSecond: result.receivedBytesPerSecond + item.receivedBytesPerSecond,
  sentBytesPerSecond: result.sentBytesPerSecond + item.sentBytesPerSecond,
}), {
  receivedBytes: 0,
  sentBytes: 0,
  receivedBytesPerSecond: 0,
  sentBytesPerSecond: 0,
});

const withTotals = (metrics) => ({
  ...metrics,
  totalBytes: metrics.receivedBytes + metrics.sentBytes,
  bytesPerSecond: metrics.receivedBytesPerSecond + metrics.sentBytesPerSecond,
});

const networkConsumers = Object.freeze({
  history: Object.freeze({ id: "history", module: "终端输出", task: "历史回放" }),
  liveOutput: Object.freeze({ id: "live-output", module: "终端输出", task: "实时输出" }),
  userInput: Object.freeze({ id: "user-input", module: "终端输入", task: "用户输入" }),
  generatedInput: Object.freeze({ id: "generated-input", module: "终端输入", task: "终端自动响应" }),
  resize: Object.freeze({ id: "resize", module: "终端控制", task: "尺寸同步" }),
  theme: Object.freeze({ id: "theme", module: "终端控制", task: "主题同步" }),
  heartbeat: Object.freeze({ id: "heartbeat", module: "终端连接", task: "连接保活" }),
  outputAck: Object.freeze({ id: "output-ack", module: "终端输出", task: "消费确认" }),
  serverLog: Object.freeze({ id: "server-log", module: "终端诊断", task: "服务端日志" }),
  sessionControl: Object.freeze({ id: "session-control", module: "终端连接", task: "会话控制" }),
});

const networkConsumerOrder = Object.freeze([
  networkConsumers.history,
  networkConsumers.liveOutput,
  networkConsumers.outputAck,
  networkConsumers.userInput,
  networkConsumers.generatedInput,
  networkConsumers.resize,
  networkConsumers.theme,
  networkConsumers.heartbeat,
  networkConsumers.sessionControl,
  networkConsumers.serverLog,
]);

const parseControlPayload = (payload) => {
  if (typeof payload !== "string") return null;
  const first = payload.trimStart()[0];
  if (first !== "{" && first !== "[") return null;
  try {
    const value = JSON.parse(payload);
    return value && typeof value === "object" ? value : null;
  } catch (error) {
    return null;
  }
};

const receivedConsumer = (record, payload) => {
  if (typeof payload !== "string") {
    if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload) || (typeof Blob === "function" && payload instanceof Blob)) {
      return record.replayActive ? networkConsumers.history : networkConsumers.liveOutput;
    }
    return networkConsumers.sessionControl;
  }
  const message = parseControlPayload(payload);
  const type = String(message?.type || "").trim();
  if (!type) return record.replayActive ? networkConsumers.history : networkConsumers.liveOutput;
  if (type === "history-replay-start") {
    record.replayActive = true;
    return networkConsumers.history;
  }
  if (type === "history-replay-complete") {
    record.replayActive = false;
    return networkConsumers.history;
  }
  if (type === "pong") return networkConsumers.heartbeat;
  if (type === "server-log") return networkConsumers.serverLog;
  if (type === "queue-turn-complete") return networkConsumers.outputAck;
  if (type.startsWith("resize-")) return networkConsumers.resize;
  return networkConsumers.sessionControl;
};

const sentConsumer = (payload) => {
  const message = parseControlPayload(payload);
  const type = String(message?.type || "").trim();
  if (type === "input") {
    return message.generated === true ? networkConsumers.generatedInput : networkConsumers.userInput;
  }
  if (type === "resize") return networkConsumers.resize;
  if (type === "theme") return networkConsumers.theme;
  if (type === "ping") return networkConsumers.heartbeat;
  if (type === "queue-turn-ack") return networkConsumers.outputAck;
  return networkConsumers.sessionControl;
};

const createConsumerRecord = (definition) => ({
  ...definition,
  receivedBytes: 0,
  sentBytes: 0,
  receivedBytesPerSecond: 0,
  sentBytesPerSecond: 0,
  lastSampleReceivedBytes: 0,
  lastSampleSentBytes: 0,
});

const recordConsumerBytes = (record, definition, direction, bytes) => {
  const amount = Math.max(0, Number(bytes) || 0);
  if (!amount) return;
  let consumer = record.consumers.get(definition.id);
  if (!consumer) {
    consumer = createConsumerRecord(definition);
    record.consumers.set(definition.id, consumer);
  }
  if (direction === "received") consumer.receivedBytes += amount;
  else consumer.sentBytes += amount;
};

const statusForRecords = (records) => {
  const states = records.map((record) => record.state);
  if (states.includes("error")) return "error";
  if (states.includes("connecting")) return "connecting";
  if (states.includes("closing")) return "retrying";
  if (states.includes("open")) return "open";
  return "idle";
};

const createRecord = (sessionId, tabId) => ({
  sessionId,
  tabId,
  state: "idle",
  receivedBytes: 0,
  sentBytes: 0,
  receivedBytesPerSecond: 0,
  sentBytesPerSecond: 0,
  lastSampleReceivedBytes: 0,
  lastSampleSentBytes: 0,
  replayActive: false,
  consumers: new Map(),
  attachment: null,
});

export const createTerminalNetworkMonitor = ({
  now = defaultNow,
  onStateChange = () => {},
} = {}) => {
  let disposed = false;
  let lastSampleAt = now();
  const records = new Map();
  const attachments = new Map();

  const snapshot = () => {
    const sessions = Array.from(records.values());
    const total = withTotals(aggregateMetrics(sessions));
    const tabsByID = new Map();
    const consumersByID = new Map(networkConsumerOrder.map((definition) => [
      definition.id,
      createConsumerRecord(definition),
    ]));
    for (const session of sessions) {
      const entries = tabsByID.get(session.tabId) || [];
      entries.push(session);
      tabsByID.set(session.tabId, entries);
      for (const source of session.consumers.values()) {
        const consumer = consumersByID.get(source.id) || consumersByID.get(networkConsumers.sessionControl.id);
        consumer.receivedBytes += source.receivedBytes;
        consumer.sentBytes += source.sentBytes;
        consumer.receivedBytesPerSecond += source.receivedBytesPerSecond;
        consumer.sentBytesPerSecond += source.sentBytesPerSecond;
      }
    }
    const attributed = aggregateMetrics(consumersByID.values());
    const missing = {
      receivedBytes: Math.max(0, total.receivedBytes - attributed.receivedBytes),
      sentBytes: Math.max(0, total.sentBytes - attributed.sentBytes),
      receivedBytesPerSecond: Math.max(0, total.receivedBytesPerSecond - attributed.receivedBytesPerSecond),
      sentBytesPerSecond: Math.max(0, total.sentBytesPerSecond - attributed.sentBytesPerSecond),
    };
    const sessionControl = consumersByID.get(networkConsumers.sessionControl.id);
    sessionControl.receivedBytes += missing.receivedBytes;
    sessionControl.sentBytes += missing.sentBytes;
    sessionControl.receivedBytesPerSecond += missing.receivedBytesPerSecond;
    sessionControl.sentBytesPerSecond += missing.sentBytesPerSecond;
    const consumers = networkConsumerOrder.map((definition) => withTotals(consumersByID.get(definition.id)));
    return {
      status: statusForRecords(sessions),
      ...total,
      tabs: Array.from(tabsByID, ([tabId, entries]) => ({
        tabId,
        ...withTotals(aggregateMetrics(entries)),
      })),
      consumers,
    };
  };

  const emit = () => {
    if (!disposed) onStateChange(snapshot());
  };

  const releaseAttachment = (attachment, { emitChange = true } = {}) => {
    if (!attachment || attachments.get(attachment.socket) !== attachment) return false;
    const {
      socket,
      record,
      listeners,
      wrappedSend,
      wrappedClose,
      originalSend,
      originalClose,
      hadOwnSend,
      hadOwnClose,
    } = attachment;
    attachments.delete(socket);
    for (const [type, listener] of listeners) socket.removeEventListener(type, listener);
    if (socket.send === wrappedSend) {
      if (hadOwnSend) socket.send = originalSend;
      else delete socket.send;
    }
    if (socket.close === wrappedClose) {
      if (hadOwnClose) socket.close = originalClose;
      else delete socket.close;
    }
    if (record.attachment === attachment) {
      record.attachment = null;
      record.state = "idle";
    }
    if (emitChange) emit();
    return true;
  };

  const detachAll = ({ emitChange = true } = {}) => {
    for (const attachment of Array.from(attachments.values())) {
      releaseAttachment(attachment, { emitChange: false });
    }
    if (emitChange) emit();
  };

  const attachSocket = (socket, {
    sessionId = "",
    tabId = "",
    replayActive = false,
    emitChange = true,
  } = {}) => {
    if (
      disposed
      || !socket
      || typeof socket.addEventListener !== "function"
      || typeof socket.send !== "function"
      || typeof socket.close !== "function"
    ) return null;
    const normalizedSessionID = String(sessionId || "").trim();
    const normalizedTabID = String(tabId || "").trim();
    if (!normalizedSessionID || !normalizedTabID) return null;
    let record = records.get(normalizedSessionID);
    if (!record) {
      record = createRecord(normalizedSessionID, normalizedTabID);
      records.set(normalizedSessionID, record);
    }
    record.tabId = normalizedTabID;
    const existing = attachments.get(socket);
    if (existing?.record === record) return existing.handle;
    if (existing) releaseAttachment(existing, { emitChange: false });
    if (record.attachment) releaseAttachment(record.attachment, { emitChange: false });
    record.replayActive = replayActive === true;

    const hadOwnSend = Object.prototype.hasOwnProperty.call(socket, "send");
    const hadOwnClose = Object.prototype.hasOwnProperty.call(socket, "close");
    const originalSend = socket.send;
    const originalClose = socket.close;
    const attachment = {
      socket,
      record,
      listeners: [],
      originalSend,
      originalClose,
      hadOwnSend,
      hadOwnClose,
      wrappedSend: null,
      wrappedClose: null,
      handle: null,
    };
    const setState = (state) => {
      if (attachments.get(socket) !== attachment || record.state === state) return;
      record.state = state;
      emit();
    };
    const addListener = (type, listener) => {
      socket.addEventListener(type, listener);
      attachment.listeners.push([type, listener]);
    };
    attachment.wrappedSend = function sendWithNetworkMeasurement(payload) {
      const result = Reflect.apply(originalSend, this, [payload]);
      const bytes = terminalNetworkPayloadBytes(payload);
      record.sentBytes += bytes;
      recordConsumerBytes(record, sentConsumer(payload), "sent", bytes);
      return result;
    };
    attachment.wrappedClose = function closeWithNetworkMeasurement(...args) {
      setState("closing");
      return Reflect.apply(originalClose, this, args);
    };
    socket.send = attachment.wrappedSend;
    socket.close = attachment.wrappedClose;
    record.attachment = attachment;
    record.state = stateFromReadyState(socket.readyState);
    addListener("open", () => setState("open"));
    addListener("message", (event) => {
      const bytes = terminalNetworkPayloadBytes(event?.data);
      record.receivedBytes += bytes;
      recordConsumerBytes(record, receivedConsumer(record, event?.data), "received", bytes);
    });
    addListener("error", () => setState("error"));
    addListener("close", () => releaseAttachment(attachment));
    attachment.handle = { detach: () => releaseAttachment(attachment) };
    attachments.set(socket, attachment);
    if (emitChange) emit();
    return attachment.handle;
  };

  const syncSessions = (sessions = []) => {
    if (disposed) return snapshot();
    const desired = new Set();
    let changed = false;
    for (const [index, session] of Array.from(sessions).entries()) {
      const sessionId = String(session?.sessionId || session?.id || `session-${index}`).trim();
      const tabId = String(session?.tabId || "").trim();
      if (!sessionId || !tabId) continue;
      desired.add(sessionId);
      let record = records.get(sessionId);
      if (!record) {
        record = createRecord(sessionId, tabId);
        records.set(sessionId, record);
        changed = true;
      }
      if (record.tabId !== tabId) {
        record.tabId = tabId;
        changed = true;
      }
      if (record.attachment?.socket !== session.socket) {
        if (record.attachment) releaseAttachment(record.attachment, { emitChange: false });
        if (session.socket) {
          attachSocket(session.socket, {
            sessionId,
            tabId,
            replayActive: session.replayActive === true,
            emitChange: false,
          });
        }
        changed = true;
      }
    }
    for (const [sessionId, record] of Array.from(records)) {
      if (desired.has(sessionId)) continue;
      if (record.attachment) releaseAttachment(record.attachment, { emitChange: false });
      records.delete(sessionId);
      changed = true;
    }
    if (changed) emit();
    return snapshot();
  };

  const sample = () => {
    if (disposed) return snapshot();
    const sampledAt = now();
    const elapsedSeconds = Math.max(0, sampledAt - lastSampleAt) / 1000;
    if (elapsedSeconds > 0) {
      for (const record of records.values()) {
        record.receivedBytesPerSecond = Math.max(0, record.receivedBytes - record.lastSampleReceivedBytes) / elapsedSeconds;
        record.sentBytesPerSecond = Math.max(0, record.sentBytes - record.lastSampleSentBytes) / elapsedSeconds;
        record.lastSampleReceivedBytes = record.receivedBytes;
        record.lastSampleSentBytes = record.sentBytes;
        for (const consumer of record.consumers.values()) {
          consumer.receivedBytesPerSecond = Math.max(0, consumer.receivedBytes - consumer.lastSampleReceivedBytes) / elapsedSeconds;
          consumer.sentBytesPerSecond = Math.max(0, consumer.sentBytes - consumer.lastSampleSentBytes) / elapsedSeconds;
          consumer.lastSampleReceivedBytes = consumer.receivedBytes;
          consumer.lastSampleSentBytes = consumer.sentBytes;
        }
      }
    }
    lastSampleAt = sampledAt;
    emit();
    return snapshot();
  };

  const reset = () => {
    detachAll({ emitChange: false });
    records.clear();
    lastSampleAt = now();
    emit();
  };

  const dispose = () => {
    if (disposed) return;
    detachAll({ emitChange: false });
    records.clear();
    disposed = true;
  };

  return { attachSocket, detachAll, dispose, reset, sample, snapshot, syncSessions };
};
