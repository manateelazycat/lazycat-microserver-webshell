import { createTerminalInputLifecycle } from "./input_lifecycle.js";
import {
  buildTerminalInputQueueItems,
  isGeneratedTerminalResponse,
  isGeneratedTerminalResponseTail,
} from "./input_model.js";

const noop = () => {};

export function createTerminalInputController({
  windowObject = globalThis.window,
  textEncoder = new TextEncoder(),
  getSessions = () => [],
  isKittyGraphicsResponse = () => false,
  isReplayCommitted = () => false,
  isSocketOpen = (session) => session?.socket?.readyState === globalThis.WebSocket?.OPEN,
  getCurrentLease = () => null,
  isClientTarget = () => false,
  getResizeSize = () => ({ cols: 0, rows: 0, pixelWidth: 0, pixelHeight: 0 }),
  normalizeResizeEpoch = (value) => String(value || ""),
  getThemePayload = () => ({}),
  sendPayload = (session, payload) => {
    session.socket.send(JSON.stringify(payload));
    return true;
  },
  getBufferedAmount = (session) => Number(session?.socket?.bufferedAmount || 0),
  checkConnectionHealth = () => false,
  recycleUnifiedSession = noop,
  requestConnection = noop,
  markUserInput = noop,
  scrollToBottom = noop,
  scheduleActivityRefresh = noop,
  showToast = noop,
  appendDebugError = noop,
  holdCursorVisible = noop,
  reassertSize = noop,
  registerSessionCleanup = noop,
  now = () => Date.now(),
  chunkChars = 16 * 1024,
  flushDelayMs = 8,
  interactiveImmediateMaxBytes = 256,
  pumpChunkBudget = 4,
  backpressureBytes = 512 * 1024,
  backpressureDelayMs = 16,
  maxBufferedBytes = 64 * 1024,
  maxPendingBytes = 8 * 1024 * 1024,
  maxParkedPendingBytes = 256 * 1024,
  pendingMaxWaitMs = 10 * 1000,
  maxQueuedBytes = 16 * 1024 * 1024,
  lifecycleFactory = createTerminalInputLifecycle,
} = {}) {
  let disposed = false;
  const lifecycle = lifecycleFactory({ windowObject, registerSessionCleanup });
  const generatedResponse = (data) => isGeneratedTerminalResponse(data, { isKittyGraphicsResponse });
  const generatedResponseTail = (data) => isGeneratedTerminalResponseTail(data);
  const sessions = () => Array.from(getSessions?.() || []);

  const isReady = (session) => Boolean(
    !disposed
    && isReplayCommitted(session)
    && isSocketOpen(session)
    && !session.resizeAckPending
    && (
      session.connectionChannel === "unified"
      || (
        session.connectionChannel === "fast"
        && !session.connectionLeaseClosing
        && getCurrentLease(session)?.leaseID === session.connectionLeaseID
      )
    )
  );

  const isGeneratedReady = (session) => isReady(session);

  const clearPendingInputExpiry = (session) => {
    if (!session) {
      return;
    }
    lifecycle.clearPendingExpiryTimer(session);
    session.pendingInputExpiryToken = Number(session.pendingInputExpiryToken || 0) + 1;
    session.pendingInputExpiryLeaseID = 0;
    session.pendingInputExpiryGeneration = 0;
    session.pendingInputExpiryPaused = false;
    session.pendingInputQueuedAt = 0;
  };

  const discardSession = (session) => {
    if (!session) {
      return;
    }
    lifecycle.clearFlushTimer(session);
    lifecycle.clearPumpTimer(session);
    session.inputBuffer = "";
    session.inputBufferSize = 0;
    session.inputQueue = [];
    session.inputQueueSize = 0;
    session.inputPumpActive = false;
    session.pendingInput = [];
    session.pendingInputSize = 0;
    clearPendingInputExpiry(session);
  };

  const armGeneratedSuppression = (session, durationMs = 1000) => {
    if (!session || disposed) {
      return;
    }
    session.suppressGeneratedTerminalInputUntil = Math.max(
      Number(session.suppressGeneratedTerminalInputUntil || 0),
      now() + durationMs,
    );
  };

  const armReplayGeneratedSuppression = (session) => {
    if (!session || session.allowGeneratedInputDuringReplay) {
      return;
    }
    armGeneratedSuppression(session, 1000);
  };

  const shouldSuppressGenerated = (session, data) => {
    if (!session) {
      return false;
    }
    const response = generatedResponse(data);
    const responseTail = generatedResponseTail(data);
    if (session.replayOutputDepth > 0 && !session.allowGeneratedInputDuringReplay) {
      return response || responseTail;
    }
    if (Number(session.suppressGeneratedTerminalInputUntil || 0) <= now()) {
      return false;
    }
    return response || responseTail;
  };

  const buildQueueItems = (data, options = {}) => buildTerminalInputQueueItems(data, {
    chunkChars,
    textEncoder,
    ...options,
  });

  const sendInputChunk = (session, data, { generated = false } = {}) => {
    if (!data || !(generated ? isGeneratedReady(session) : isReady(session))) {
      return false;
    }
    const { cols, rows, pixelWidth, pixelHeight } = getResizeSize(session);
    const payload = { type: "input", data, ...getThemePayload() };
    if (generated) {
      payload.generated = true;
    } else if (cols > 0 && rows > 0) {
      payload.cols = cols;
      payload.rows = rows;
      payload.pixel_width = pixelWidth;
      payload.pixel_height = pixelHeight;
      const resizeEpoch = normalizeResizeEpoch(session.appliedResizeEpoch);
      if (resizeEpoch) {
        payload.resize_epoch = resizeEpoch;
      }
    }
    try {
      return sendPayload(session, payload) !== false;
    } catch (error) {
      return false;
    }
  };

  const flushInputBuffer = (session) => {
    if (!session || disposed) {
      return;
    }
    lifecycle.clearFlushTimer(session);
    if (!session.inputBuffer || !isReady(session) || !checkConnectionHealth(session, { connect: true })) {
      return;
    }
    const data = session.inputBuffer;
    session.inputBuffer = "";
    session.inputBufferSize = 0;
    if (!sendInputChunk(session, data)) {
      session.inputBuffer = data + session.inputBuffer;
      session.inputBufferSize += textEncoder.encode(data).length;
      checkConnectionHealth(session, { connect: true, force: true });
    }
  };

  const scheduleInputFlush = (session) => lifecycle.scheduleFlush(
    session,
    () => flushInputBuffer(session),
    flushDelayMs,
  );

  let pumpQueuedInput;
  const scheduleQueuedInputPump = (session, delay = 0) => lifecycle.schedulePump(
    session,
    () => pumpQueuedInput(session),
    delay,
  );

  const enqueueSessionInput = (session, data, { generated = false, front = false } = {}) => {
    if (!session || !data || disposed) {
      return false;
    }
    const availableBytes = generated ? Infinity : Math.max(0, maxQueuedBytes - session.inputQueueSize);
    const { items, byteLength, exceeded } = buildQueueItems(data, { generated, maxBytes: availableBytes });
    if (exceeded) {
      if (!generated) {
        showToast("粘贴内容过大，已丢弃部分输入。");
      }
      return false;
    }
    if (items.length === 0) {
      return true;
    }
    if (front) {
      session.inputQueue.unshift(...items);
    } else {
      session.inputQueue.push(...items);
    }
    session.inputQueueSize += byteLength;
    scheduleQueuedInputPump(session);
    return true;
  };

  pumpQueuedInput = (session) => {
    if (!session || session.inputPumpActive || disposed) {
      return;
    }
    session.inputPumpActive = true;
    try {
      if (session.inputBuffer) {
        flushInputBuffer(session);
        if (session.inputBuffer) {
          scheduleQueuedInputPump(session, backpressureDelayMs);
          return;
        }
      }
      let sent = 0;
      while (session.inputQueue.length > 0 && isReady(session) && checkConnectionHealth(session, { connect: true })) {
        if (getBufferedAmount(session) > backpressureBytes) {
          scheduleQueuedInputPump(session, backpressureDelayMs);
          return;
        }
        const item = session.inputQueue.shift();
        session.inputQueueSize = Math.max(0, session.inputQueueSize - item.byteLength);
        if (!sendInputChunk(session, item.data, { generated: item.generated })) {
          session.inputQueue.unshift(item);
          session.inputQueueSize += item.byteLength;
          scheduleQueuedInputPump(session, backpressureDelayMs);
          return;
        }
        sent += 1;
        if (sent >= pumpChunkBudget) {
          scheduleQueuedInputPump(session, 0);
          return;
        }
      }
    } finally {
      session.inputPumpActive = false;
    }
    if (session.inputQueue.length > 0 && isReady(session) && checkConnectionHealth(session, { connect: true })) {
      scheduleQueuedInputPump(session, backpressureDelayMs);
    }
  };

  const send = (session, data, { immediate = false, generated = false } = {}) => {
    if (disposed) {
      return false;
    }
    if (!data || !(generated ? isGeneratedReady(session) : isReady(session)) || !checkConnectionHealth(session, { connect: true })) {
      return false;
    }
    if (!generated && shouldSuppressGenerated(session, data)) {
      return false;
    }
    if (generated) {
      return sendInputChunk(session, data, { generated: true });
    }
    if (String(data).length > chunkChars || session.inputQueue.length > 0) {
      return enqueueSessionInput(session, data);
    }
    const byteLength = textEncoder.encode(data).length;
    if (session.inputBufferSize + byteLength > maxBufferedBytes) {
      flushInputBuffer(session);
    }
    if (byteLength > maxBufferedBytes) {
      return enqueueSessionInput(session, data);
    }
    session.inputBuffer += data;
    session.inputBufferSize += byteLength;
    if (immediate || byteLength <= interactiveImmediateMaxBytes || session.inputBufferSize >= 4096) {
      flushInputBuffer(session);
    } else {
      scheduleInputFlush(session);
    }
    return true;
  };

  let flushPending;
  const schedulePendingInputExpiry = (session) => {
    if (
      disposed
      || !session
      || session.pendingInputExpiryTimer
      || session.pendingInputSize <= 0
      || session.pendingInputExpiryPaused
    ) {
      return false;
    }
    const unifiedGeneration = session.connectionChannel === "unified"
      ? Number(session.connectionChannelGeneration || 0)
      : 0;
    const lease = getCurrentLease(session);
    const leaseID = unifiedGeneration || Number(lease?.leaseID || session.connectionLeaseID || 0);
    if (
      !leaseID
      || session.connectionLeaseClosing
      || (session.connectionChannel !== "fast" && session.connectionChannel !== "unified")
    ) {
      session.pendingInputExpiryPaused = true;
      return false;
    }
    const generation = Number(session.connectionChannelGeneration || 0);
    const expiryToken = Number(session.pendingInputExpiryToken || 0) + 1;
    session.pendingInputExpiryToken = expiryToken;
    session.pendingInputExpiryLeaseID = leaseID;
    session.pendingInputExpiryGeneration = generation;
    session.pendingInputQueuedAt = now();
    return lifecycle.schedulePendingExpiry(session, () => {
      if (session.pendingInputExpiryToken !== expiryToken) {
        return;
      }
      session.pendingInputQueuedAt = 0;
      if (session.closed || session.pendingInputSize <= 0) {
        return;
      }
      const currentLease = getCurrentLease(session);
      const currentLeaseID = session.connectionChannel === "unified"
        ? Number(session.connectionChannelGeneration || 0)
        : Number(currentLease?.leaseID || session.connectionLeaseID || 0);
      const expectedLeaseID = Number(session.pendingInputExpiryLeaseID || leaseID);
      const expectedGeneration = Number(session.pendingInputExpiryGeneration || generation);
      const leaseStillCurrent = currentLeaseID === expectedLeaseID
        && Number(session.connectionChannelGeneration || 0) === expectedGeneration
        && !session.connectionLeaseClosing
        && (
          session.connectionChannel === "unified"
          || (session.connectionChannel === "fast" && session.connectionLeaseID === expectedLeaseID)
        );
      if (!leaseStillCurrent) {
        session.pendingInputExpiryLeaseID = 0;
        session.pendingInputExpiryGeneration = 0;
        session.pendingInputExpiryPaused = true;
        return;
      }
      if (isReady(session)) {
        flushPending(session);
        return;
      }
      checkConnectionHealth(session, {
        connect: true,
        force: true,
        allowHidden: true,
      });
      session.pendingInputExpiryLeaseID = 0;
      session.pendingInputExpiryGeneration = 0;
      session.pendingInputExpiryPaused = true;
      api.resumePendingExpiry(session);
    }, pendingMaxWaitMs);
  };

  const enqueuePending = (session, data, { parked = false } = {}) => {
    if (!session || !data || disposed) {
      return false;
    }
    const pendingLimit = parked ? Math.min(maxPendingBytes, maxParkedPendingBytes) : maxPendingBytes;
    const availablePendingBytes = Math.max(0, pendingLimit - session.pendingInputSize);
    const { byteLength, exceeded } = buildQueueItems(data, { maxBytes: availablePendingBytes });
    if (exceeded || session.pendingInputSize + byteLength > pendingLimit) {
      return false;
    }
    session.pendingInput.push(data);
    session.pendingInputSize += byteLength;
    schedulePendingInputExpiry(session);
    return true;
  };

  flushPending = (session) => {
    if (!session || disposed) {
      return false;
    }
    if (!isReady(session) || !checkConnectionHealth(session, { connect: true })) {
      return false;
    }
    while (session.pendingInput.length > 0) {
      const data = session.pendingInput[0];
      if (!send(session, data)) {
        return false;
      }
      session.pendingInput.shift();
      session.pendingInputSize = Math.max(0, session.pendingInputSize - textEncoder.encode(data).length);
    }
    clearPendingInputExpiry(session);
    flushInputBuffer(session);
    scheduleQueuedInputPump(session);
    return true;
  };

  const sendOrQueue = (session, data, { userInput = true } = {}) => {
    if (!session || disposed) {
      return false;
    }
    if (shouldSuppressGenerated(session, data)) {
      return false;
    }
    if (!userInput && data && session.connectionChannel === "unified" && isSocketOpen(session)) {
      try {
        sendPayload(session, {
          type: "input",
          data,
          generated: true,
          ...getThemePayload(),
        });
      } catch (error) {
        recycleUnifiedSession(session, "unified generated input failed");
      }
      return true;
    }
    const connectionWasParked = Boolean(
      session.connectionLeaseClosing
      || (isClientTarget(session.name) && !getCurrentLease(session))
    );
    if (data && userInput) {
      markUserInput(session);
      scrollToBottom(session);
      requestConnection(session, {
        reason: "user_input",
        userInteraction: true,
        immediate: true,
        allowHidden: true,
      });
    }
    if (session.closed || session.exitExpected) {
      return false;
    }
    if (/[\r\n]/.test(data)) {
      scheduleActivityRefresh(450);
    }
    if (isReady(session) && checkConnectionHealth(session, { connect: true, force: userInput, allowHidden: userInput })) {
      // An ACK can open the input gate before presentation/onReady flushes the
      // characters queued during resize/replay. Never let new input overtake them.
      if (session.pendingInput.length > 0) {
        flushPending(session);
      }
      if (session.pendingInput.length === 0
        && send(session, data, { immediate: /[\r\n\x03\x04]/.test(data) })) {
        return true;
      }
    }
    if (!enqueuePending(session, data, { parked: connectionWasParked })) {
      appendDebugError(
        "终端待发送输入超过限制",
        `${session.name}/${session.id}, parked=${connectionWasParked}, bytes=${session.pendingInputSize}`,
      );
      showToast(connectionWasParked
        ? "终端尚未恢复，待发送输入已达到 256 KiB 上限。"
        : "待发送输入过大，已拒绝继续排队。");
    }
    checkConnectionHealth(session, { connect: true });
    return false;
  };

  const handleData = (session, data) => {
    const response = generatedResponse(data);
    const responseTail = generatedResponseTail(data);
    if (shouldSuppressGenerated(session, data)) {
      return false;
    }
    if (session.processingGeneratedTerminalResponses || response) {
      return send(session, data, { immediate: true, generated: true });
    }
    if (responseTail) {
      return false;
    }
    if (session.replayOutputDepth > 0) {
      if (session.allowGeneratedInputDuringReplay) {
        return send(session, data, { immediate: true, generated: true });
      }
      return false;
    }
    holdCursorVisible(session);
    if (
      session.renderReady !== true
      || session.sizeClaimRequired === true
      || session.resizeAckPending === true
      || session.activationFitPending === true
    ) {
      reassertSize(session);
    }
    return sendOrQueue(session, data, { userInput: !generatedResponse(data) });
  };

  const drainGeneratedResponses = (session) => {
    const term = session?.term;
    const wasmTerm = term?.wasmTerm;
    if (
      disposed
      || !term
      || !wasmTerm
      || typeof term.processTerminalResponses !== "function"
      || typeof wasmTerm.hasResponse !== "function"
    ) {
      return false;
    }
    session.processingGeneratedTerminalResponses = true;
    try {
      for (let index = 0; index < 256 && wasmTerm.hasResponse(); index += 1) {
        term.processTerminalResponses();
      }
    } finally {
      session.processingGeneratedTerminalResponses = false;
    }
    return true;
  };

  const api = Object.freeze({
    installSession(session) {
      if (disposed || !session) {
        return noop;
      }
      return lifecycle.bindData(session, (data) => handleData(session, data));
    },
    handleData,
    send,
    sendOrQueue,
    flushPending,
    enqueuePending,
    enqueue: enqueueSessionInput,
    pump: pumpQueuedInput,
    isReady,
    isGeneratedReady,
    isGeneratedResponse: generatedResponse,
    isGeneratedResponseTail: generatedResponseTail,
    shouldSuppressGenerated,
    armGeneratedSuppression,
    clearGeneratedSuppression(session) {
      if (!session || disposed) {
        return false;
      }
      session.suppressGeneratedTerminalInputUntil = 0;
      return true;
    },
    armReplayGeneratedSuppression,
    armAllGeneratedSuppression(durationMs = 1000) {
      for (const session of sessions()) {
        armGeneratedSuppression(session, durationMs);
      }
    },
    drainGeneratedResponses,
    discardSession,
    discardAll() {
      for (const session of sessions()) {
        discardSession(session);
      }
    },
    clearInputFlushTimer: (session) => lifecycle.clearFlushTimer(session),
    clearInputPumpTimer: (session) => lifecycle.clearPumpTimer(session),
    clearPendingInputExpiry,
    pausePendingExpiry(session) {
      if (!session || session.pendingInputSize <= 0) {
        return false;
      }
      lifecycle.clearPendingExpiryTimer(session);
      session.pendingInputExpiryToken = Number(session.pendingInputExpiryToken || 0) + 1;
      session.pendingInputExpiryLeaseID = 0;
      session.pendingInputExpiryGeneration = 0;
      session.pendingInputExpiryPaused = true;
      session.pendingInputQueuedAt = 0;
      return true;
    },
    resumePendingExpiry(session) {
      if (!session || session.closed || session.pendingInputSize <= 0) {
        return false;
      }
      session.pendingInputExpiryPaused = false;
      return schedulePendingInputExpiry(session);
    },
    disposeSession(session) {
      discardSession(session);
      return lifecycle.disposeSession(session);
    },
    dispose() {
      if (disposed) {
        return false;
      }
      for (const session of sessions()) {
        discardSession(session);
      }
      disposed = true;
      lifecycle.dispose();
      return true;
    },
  });

  return api;
}
