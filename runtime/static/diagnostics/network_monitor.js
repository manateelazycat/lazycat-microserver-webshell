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

const aggregateMetrics = (items) => items.reduce((result, item) => ({
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
    for (const session of sessions) {
      const entries = tabsByID.get(session.tabId) || [];
      entries.push(session);
      tabsByID.set(session.tabId, entries);
    }
    return {
      status: statusForRecords(sessions),
      ...total,
      tabs: Array.from(tabsByID, ([tabId, entries]) => ({
        tabId,
        ...withTotals(aggregateMetrics(entries)),
      })),
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
      record.sentBytes += terminalNetworkPayloadBytes(payload);
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
      record.receivedBytes += terminalNetworkPayloadBytes(event?.data);
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
        if (session.socket) attachSocket(session.socket, { sessionId, tabId, emitChange: false });
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
