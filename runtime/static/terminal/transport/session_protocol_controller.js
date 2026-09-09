import { decodeFastBinaryFrame } from "./terminal_fast_integrity.js";

const noop = () => {};

const isNetworkFailureReason = (reason) => {
  const normalized = String(reason || "").toLowerCase();
  return normalized.includes("network")
    || normalized.includes("websocket")
    || normalized.includes("transport")
    || normalized.includes("physical")
    || normalized.includes("connection timed out")
    || normalized.includes("connection reset")
    || normalized.includes("connection aborted")
    || normalized.includes("queue transport")
    || normalized.includes("eof");
};

export function createTerminalSessionProtocolController({
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  WebSocketCtor = globalThis.WebSocket,
  getActiveName = () => "",
  getActiveTabId = () => null,
  getCurrentTab = () => null,
  getTerminalTransportRuntime = () => null,
  terminalSessionConnection = null,
  terminalUnifiedTransport = null,
  terminalReplay = null,
  clientHistory = null,
  terminalOutput = null,
  terminalPresentation = null,
  terminalResize = null,
  terminalInput = null,
  TerminalReplayController = null,
  ClientTerminalReplayAdapter = null,
  terminalCheckpointCapabilitiesForTerminal = () => [],
  terminalAgentPrepareTimeoutMs = 45 * 1000,
  serverRevisionClientID = "",
  webSocketURL = () => {
    throw new Error("webSocketURL is required");
  },
  terminalThemePayload = () => ({}),
  sendTerminalTheme = noop,
  syncTerminalNetworkMonitorSockets = noop,
  isClientInstanceName = () => false,
  isCurrentInstanceSession = () => true,
  terminalLocationDescription = () => "",
  isRetryableTerminalTransportError = () => false,
  detachSessionSocket = noop,
  invalidateSessionStartupError = noop,
  showSessionStartupError = noop,
  resetTerminalForHistoryReplay = () => false,
  beginTerminalRenderSuppression = noop,
  endTerminalRenderSuppression = noop,
  sessionConnectingState = () => "connecting",
  refreshWorkspaceWithRetry = async () => {},
  showToast = noop,
  appendStartupTrace = noop,
  appendDebugLog = noop,
  isDebugLogEnabled = () => false,
  serverLogSinceUnixMS = 0,
  appendDebugWarning = noop,
  appendDebugError = noop,
  recordTerminalSessionEvent = noop,
} = {}) {
  const document = documentObject;
  const navigator = navigatorObject;
  const WebSocket = WebSocketCtor;
  const currentTab = (...args) => getCurrentTab(...args);
  const connectSession = async (session, {
    allowHidden = false,
    leaseID = 0,
    channel = "unified",
    channelGeneration = 0,
  } = {}) => {
    const terminalTransportRuntime = getTerminalTransportRuntime();
    let connectionEpoch = Number(session?.connectionEpoch || 0);
    const usesMultiplexedTransport = channel === "unified";
    const transportIsCurrent = () => Boolean(
      usesMultiplexedTransport
        ? channelGeneration > 0
          && session?.connectionEpoch === connectionEpoch
          && session?.connectionChannel === "unified"
          && session.connectionChannelGeneration === channelGeneration
          && terminalUnifiedTransport.matchesTarget(session.name)
        : leaseID
          && session?.connectionEpoch === connectionEpoch
          && session?.connectionChannel === "fast"
          && terminalTransportRuntime?.currentLease(session)?.leaseID === leaseID
          && session.connectionLeaseID === leaseID
          && !session.connectionLeaseClosing
    );
    const connectionSkipReason = () => {
      if (!session) return "session_missing";
      if (session.closed) return "session_closed";
      if (terminalReplay.isRetryPaused(session)) return "replay_retry_paused";
      if (!transportIsCurrent()) return "transport_not_current";
      if (!isCurrentInstanceSession(session)) return "instance_session_not_current";
      if (!terminalTransportRuntime?.hasKnownSize(session)) return "terminal_size_unavailable";
      if (document.hidden && !allowHidden) return "document_hidden";
      if (navigator.onLine === false) return "offline";
      if (session.socket?.readyState === WebSocket.OPEN) return "socket_already_open";
      if (session.socket?.readyState === WebSocket.CONNECTING) return "socket_already_connecting";
      return "";
    };
    const initialConnectionSkipReason = connectionSkipReason();
    if (initialConnectionSkipReason) {
      if (session) {
        recordTerminalSessionEvent(session, "connect_session_skip", {
          channel,
          channelGeneration,
          connectionEpoch,
          reason: initialConnectionSkipReason,
          allowHidden,
          documentHidden: document.hidden === true,
          socketReadyState: Number(session.socket?.readyState ?? -1),
          pendingConnect: session.pendingConnect === true,
          unifiedConnectPending: session.unifiedConnectPending === true,
          connectionChannel: String(session.connectionChannel || ""),
          connectionChannelGeneration: Number(session.connectionChannelGeneration || 0),
        });
      }
      return false;
    }
    session.startupTraceActive = true;
    session.startupTraceStartedAt = globalThis.performance?.now?.() || Date.now();
    appendStartupTrace(
      usesMultiplexedTransport ? "逻辑层 socket 连接流程开始" : "终端连接流程开始",
      `pane=${session.id} channel=${channel} channelGeneration=${channelGeneration} connectionEpoch=${connectionEpoch} allowHidden=${allowHidden} hidden=${document.hidden}`,
      { dedupeKey: `connect-start:${session.id}:${session.terminalReplayGeneration + 1}:${channel}` },
    );
    recordTerminalSessionEvent(session, "connect_session_start", {
      channel,
      channelGeneration,
      connectionEpoch,
      allowHidden,
      documentHidden: document.hidden === true,
      measuredFitGeneration: Number(session.measuredFitGeneration || 0),
      cols: Number(session.term?.cols || 0),
      rows: Number(session.term?.rows || 0),
    });
    if (isClientInstanceName(session.name)) {
      await clientHistory.prepareSession(session);
      terminalOutput.flush(session, { force: true });
      await clientHistory.flushSession(session);
    }
    if (
      !session ||
      session.closed ||
      !transportIsCurrent() ||
      !isCurrentInstanceSession(session) ||
      !terminalTransportRuntime?.hasKnownSize(session) ||
      (document.hidden && !allowHidden) ||
      navigator.onLine === false ||
      session.socket?.readyState === WebSocket.OPEN ||
      session.socket?.readyState === WebSocket.CONNECTING
    ) {
      return false;
    }
    session.pendingConnect = false;
    connectionEpoch += 1;
    session.connectionEpoch = connectionEpoch;
    terminalResize.beginConnection?.(session, { connectionEpoch });
    terminalSessionConnection.clearReconnectTimer(session);
    session.terminalReplayGeneration = Number(session.terminalReplayGeneration || 0) + 1;
    session.replayFitGeneration = session.measuredFitGeneration;
    const socketUrl = webSocketURL("./ws");
    socketUrl.searchParams.set("name", String(session.name || "").trim());
    socketUrl.searchParams.set("client_id", serverRevisionClientID);
    if (isDebugLogEnabled()) {
      socketUrl.searchParams.set("server_logs", "1");
      if (Number(serverLogSinceUnixMS) > 0) {
        socketUrl.searchParams.set("server_log_since_ms", String(Math.floor(Number(serverLogSinceUnixMS))));
      }
    }
    if (usesMultiplexedTransport) {
      socketUrl.searchParams.set("mode", "unified");
      socketUrl.searchParams.set("transport_role", "unified");
      socketUrl.searchParams.set("protocol_version", "1");
    } else {
      socketUrl.searchParams.set("pane", session.id);
      socketUrl.searchParams.set("cols", String(session.term.cols || 120));
      socketUrl.searchParams.set("rows", String(session.term.rows || 32));
      if (!isClientInstanceName(session.name)) {
        socketUrl.searchParams.set("integrity_protocol", "fast-v1");
      }
    }
    const themePayload = terminalThemePayload();
    if (!usesMultiplexedTransport) {
      socketUrl.searchParams.set("fg", themePayload.foreground);
      socketUrl.searchParams.set("bg", themePayload.background);
      socketUrl.searchParams.set("cursor", themePayload.cursor);
    }
    if (!isClientInstanceName(session.name) && session.workspaceGeneration && !usesMultiplexedTransport) {
      socketUrl.searchParams.set("workspace_generation", session.workspaceGeneration);
    }
    const historyConnectRange = isClientInstanceName(session.name)
      ? terminalReplay.rangeForConnect(session)
      : null;
    if (historyConnectRange) {
      if (!usesMultiplexedTransport) {
        socketUrl.searchParams.set("history_generation", historyConnectRange.generation);
        socketUrl.searchParams.set("local_base_cursor", historyConnectRange.baseCursor.toString());
        socketUrl.searchParams.set("local_end_cursor", historyConnectRange.endCursor.toString());
      }
    }
    if (session.resetOnNextReplay && !usesMultiplexedTransport) {
      socketUrl.searchParams.set("history_replay_mode", "snapshot");
    }
    const logSocketUrl = new URL(socketUrl.toString());
    logSocketUrl.searchParams.delete("client_id");
    logSocketUrl.searchParams.delete("history_generation");
    logSocketUrl.searchParams.delete("workspace_generation");
    const socketDebug = {
      connectStartedAt: Date.now(),
      textMessages: 0,
      binaryMessages: 0,
      binaryBytes: 0,
      openedAt: 0,
      replayStartedAt: 0,
    };
    const replayController = session.replayController || (session.replayController = new TerminalReplayController());
    const isClientDirectTransport = channel === "fast" && isClientInstanceName(session.name);
    const clientReplayAdapter = isClientDirectTransport
      ? new ClientTerminalReplayAdapter(replayController)
      : null;
    session.fastIntegrityEnabled = false;
    replayController.reset();
    session.queueReplayControllerActive = false;
    session.queueReplayControllerLegacy = false;
    session.replayControllerLegacyActive = false;
    const decodeFastBinaryMessage = (input) => {
      const decoded = decodeFastBinaryFrame(input, {
        selector: String(session.name || ""),
        paneID: String(session.id || ""),
        historyGeneration: String(session.historyGeneration || ""),
        expectedSequence: BigInt(session.fastIntegritySequence || 1),
        expectedStartCursor: BigInt(session.fastIntegrityCursor ?? session.receivedHistoryCursor ?? 0n),
      });
      const expectedSequence = BigInt(session.fastIntegritySequence || 1);
      const expectedCursor = BigInt(session.fastIntegrityCursor ?? session.receivedHistoryCursor ?? 0n);
      if (decoded.sequence !== expectedSequence || decoded.startCursor !== expectedCursor) {
        throw new Error("Fast binary envelope sequence or cursor discontinuity");
      }
      session.fastIntegritySequence = Number(expectedSequence + 1n);
      session.fastIntegrityCursor = decoded.endCursor;
      if (replayController.phase === "replaying") {
        replayController.acceptBinary({
          sequence: decoded.header.sequence,
          startCursor: decoded.header.start_cursor,
          endCursor: decoded.header.end_cursor,
          length: decoded.header.length,
          requestID: String(session.terminalReplayGeneration || ""),
          connectionEpoch,
          identity: {
            selector: session.name,
            paneID: session.id,
            historyGeneration: session.historyGeneration,
          },
        });
      }
      return decoded.payload;
    };
    console.info("[client-terminal] websocket connecting", {
      name: session.name,
      pane: session.id,
      cols: session.term.cols || 120,
      rows: session.term.rows || 32,
      url: logSocketUrl.toString(),
      allowHidden,
      documentHidden: document.hidden,
      reconnectAttempts: session.reconnectAttempts || 0,
      channel,
      historySource: historyConnectRange?.source || "snapshot",
      localBaseCursor: historyConnectRange?.baseCursor?.toString?.() || "",
      localEndCursor: historyConnectRange?.endCursor?.toString?.() || "",
    });
    recordTerminalSessionEvent(session, "socket_connect", {
      channel,
      logicalStreamID: session.unifiedStreamID,
      channelGeneration,
      connectionEpoch,
      allowHidden,
      documentHidden: document.hidden === true,
      historySource: historyConnectRange?.source || "snapshot",
      localBaseCursor: historyConnectRange?.baseCursor?.toString?.() || "",
      localEndCursor: historyConnectRange?.endCursor?.toString?.() || "",
      resetOnNextReplay: session.resetOnNextReplay === true,
      cols: Number(session.term?.cols || 0),
      rows: Number(session.term?.rows || 0),
    });
    let currentSocket;
    let currentMultiplexedConnection = null;
    if (usesMultiplexedTransport) {
      const multiplexedConnection = terminalUnifiedTransport.getConnection()
        || terminalUnifiedTransport.ensure(session.name);
      const streamID = session.unifiedStreamID;
      if (!multiplexedConnection || !streamID) {
        throw new Error(`terminal ${channel} multiplexed connection is unavailable`);
      }
      const size = terminalResize.size(session);
      const checkpointCapabilities = terminalCheckpointCapabilitiesForTerminal(session.term);
      currentMultiplexedConnection = multiplexedConnection;
      currentSocket = multiplexedConnection.open({
        pane_id: session.id,
        stream_id: streamID,
        channel_generation: channelGeneration,
        cols: size.cols || session.term.cols || 120,
        rows: size.rows || session.term.rows || 32,
        pixel_width: size.pixelWidth,
        pixel_height: size.pixelHeight,
        workspace_generation: isClientInstanceName(session.name) ? "" : session.workspaceGeneration,
        history_replay_mode: session.resetOnNextReplay ? "snapshot" : "",
        flow_control: "turn-ack-v1",
        foreground: themePayload.foreground,
        background: themePayload.background,
        cursor: themePayload.cursor,
        ...(checkpointCapabilities.length > 0
          ? { checkpoint_capabilities: checkpointCapabilities }
          : {}),
      });
    } else {
      currentSocket = new WebSocket(socketUrl.toString());
    }
    if (!transportIsCurrent()) {
      try {
        currentSocket.close(4001, "stale lease");
      } catch (error) {
      }
      return false;
    }
    if (usesMultiplexedTransport) {
      appendStartupTrace(
        "逻辑层 socket 创建",
        `pane=${session.id} logicalStreamID=${String(session.unifiedStreamID || "")} channelGeneration=${channelGeneration}`,
        {
          dedupeKey: `logical-socket-create:${session.id}:${channelGeneration}`,
          diagnosticDetails: {
            logicalStreamID: session.unifiedStreamID,
            channelGeneration,
            connectionEpoch,
          },
        },
      );
    }
    session.socket = currentSocket;
    syncTerminalNetworkMonitorSockets();
    session.replayComplete = false;
    terminalReplay.setAuthorization(session, false);
    session.replayCompletionPending = false;
    terminalOutput?.resetQueueTurn(session);
    session.allowGeneratedInputDuringReplay = false;
    invalidateSessionStartupError(session);
    session.shellEl.dataset.connection = sessionConnectingState(session);
    currentSocket.binaryType = "arraybuffer";
    terminalSessionConnection.startSocketConnectTimer(session, currentSocket);

    const replayMessageHasIdentity = (message) => {
      const selector = String(message?.selector || "").trim();
      const paneID = String(message?.pane_id || message?.paneId || "").trim();
      return selector || paneID;
    };

    const validateReplayMessage = (message) => {
      const selector = String(message?.selector || "").trim();
      const paneID = String(message?.pane_id || message?.paneId || "").trim();
      // Legacy control frames may omit identity, but every identity field that
      // is present must independently match this terminal owner.
      return (!selector || selector === session.name)
        && (!paneID || paneID === session.id);
    };

    const validateWorkspaceReplayMessage = (message) => {
      if (isClientInstanceName(session.name)) {
        return true;
      }
      const expectedGeneration = String(session.workspaceGeneration || "").trim();
      return expectedGeneration !== ""
        && String(message?.workspace_generation || "").trim() === expectedGeneration
        && String(message?.tab_id || "").trim() === String(session.tabId || "").trim();
    };

    // Multiplexed transports already route frames by logical stream, but keep
    // a second identity gate at the terminal owner. This protects against a
    // stale callback or a malformed relay writing another pane into this
    // Ghostty instance after the logical stream has been replaced.
    const validateTerminalChannelMessageIdentity = (event, messageType = "", isBinary = false) => {
      if (!usesMultiplexedTransport) {
        return true;
      }
      const metadata = event?.queueMetadata;
      if (!metadata) {
        // The physical Unified state broadcast is intentionally fan-out and
        // has no pane identity. Every pane may consume only this one control.
        // The original agent-preparing fan-out remains valid: return !isBinary && messageType === "agent-preparing";
        return !isBinary && (messageType === "agent-preparing" || messageType === "server-log");
      }
      const paneID = String(metadata.paneID || metadata.pane_id || "").trim();
      const streamID = String(metadata.streamID || metadata.stream_id || "").trim();
      const generation = Math.floor(Number(metadata.channelGeneration || metadata.channel_generation || 0));
      const expectedStreamID = String(session.unifiedStreamID).trim();
      return paneID === session.id
        && streamID !== ""
        && streamID === expectedStreamID
        && Number.isSafeInteger(generation)
        && generation > 0
        && generation === Math.floor(Number(channelGeneration || 0));
    };

    const rejectMismatchedReplay = (message) => {
      const selector = String(message?.selector || "").trim() || "unknown";
      const paneID = String(message?.pane_id || message?.paneId || "").trim() || "unknown";
      terminalPresentation.invalidate(session);
      console.warn("[client-terminal] rejected terminal replay", {
        selector,
        pane: paneID,
        expectedName: session.name,
        expectedPane: session.id,
        messageType: message?.type,
      });
      appendDebugError("终端回放身份校验失败", `${selector}/${paneID}`);
      console.warn(`Rejected terminal replay for ${selector}/${paneID}; expected ${session.name}/${session.id}.`);
      terminalSessionConnection.closeSocketForReconnect(session, currentSocket, "Terminal replay identity validation failed.");
    };

    const rejectMismatchedChannelMessage = (event, messageType) => {
      const metadata = event?.queueMetadata || {};
      const paneID = String(metadata.paneID || metadata.pane_id || "unknown").trim() || "unknown";
      const streamID = String(metadata.streamID || metadata.stream_id || "unknown").trim() || "unknown";
      session.resetOnNextReplay = true;
      session.replayComplete = false;
      terminalReplay.setAuthorization(session, false);
      session.replayCompletionPending = false;
      session.replayController?.reset();
      session.queueReplayControllerActive = false;
      session.queueReplayControllerLegacy = false;
      session.replayControllerLegacyActive = false;
      terminalOutput.discard(session);
      // Keep the last valid frame visible while the current logical stream is
      // replaced. The wrong frame must never be allowed to turn into a black
      // screen while the session is resynchronizing.
      terminalPresentation.beginHold(session);
      console.warn("[client-terminal] rejected multiplexed terminal message", {
        name: session.name,
        pane: session.id,
        messageType,
        receivedPane: paneID,
        receivedStream: streamID,
        expectedStream: session.unifiedStreamID,
        expectedGeneration: channelGeneration,
      });
      appendDebugError("终端会话消息身份不匹配", `${session.name}/${session.id}: ${messageType}`);
      terminalSessionConnection.closeSocketForReconnect(session, currentSocket, "Terminal multiplexed message identity validation failed.");
    };

    const rejectHistorySync = (reason) => {
      const resetFailureReason = session.lastHistoryResetFailureReason;
      if (resetFailureReason && /reset/i.test(String(reason)) && /failed|exception/i.test(String(reason))) {
        reason = `${reason} (${resetFailureReason})`;
      }
      session.resetOnNextReplay = true;
      session.historyStateReady = false;
      session.historyProtocolActive = false;
      session.historyCacheSnapshot = null;
      session.historyGeneration = "";
      session.replayController?.reset();
      session.queueReplayControllerActive = false;
      session.queueReplayControllerLegacy = false;
      session.replayControllerLegacyActive = false;
      terminalPresentation.markSyncPending(session);
      if (isClientDirectTransport) {
        clientHistory.deleteSession(session);
      }
      console.warn("[terminal-history] rejected history sync", {
        name: session.name,
        pane: session.id,
        reason,
      });
      appendDebugError("终端历史同步失败", reason);
      if (terminalReplay.noteFailure(session, reason)) {
        try {
          currentSocket.close(4001, "replay_retry_paused");
        } catch (error) {
        }
        return;
      }
      terminalSessionConnection.closeSocketForReconnect(session, currentSocket, `Terminal history sync failed: ${reason}`);
    };

    currentSocket.addEventListener("open", () => {
      if (session.socket !== currentSocket || !transportIsCurrent()) {
        return;
      }
      if (!usesMultiplexedTransport) {
        terminalTransportRuntime?.notifyDirectOpen(session, leaseID);
      }
      socketDebug.openedAt = Date.now();
      const unifiedSnapshot = usesMultiplexedTransport
        ? terminalUnifiedTransport?.snapshot?.()
        : null;
      recordTerminalSessionEvent(session, "socket_open", {
        channel,
        channelGeneration,
        connectionEpoch,
        openLatencyMs: Math.max(0, Date.now() - Number(socketDebug.connectStartedAt || Date.now())),
        reconnectAttempts: Number(session.reconnectAttempts || 0),
        physicalConnectionID: String(unifiedSnapshot?.physicalConnectionID || ""),
        physicalReadyState: Number(unifiedSnapshot?.physicalReadyState ?? -1),
        logicalStreamID: String(session.unifiedStreamID || ""),
        logicalCount: Number(unifiedSnapshot?.logicalCount || 0),
      });
      appendStartupTrace(
        usesMultiplexedTransport ? "逻辑层 socket 已打开" : "终端 WebSocket 已打开",
        `pane=${session.id} channel=${channel}`,
        {
          dedupeKey: `socket-open:${session.id}:${session.terminalReplayGeneration}:${channel}`,
          diagnosticDetails: {
            channel,
            channelGeneration,
            connectionEpoch,
            physicalConnectionID: String(unifiedSnapshot?.physicalConnectionID || ""),
            physicalReadyState: Number(unifiedSnapshot?.physicalReadyState ?? -1),
            logicalStreamID: String(session.unifiedStreamID || ""),
            logicalCount: Number(unifiedSnapshot?.logicalCount || 0),
          },
        },
      );
      console.info("[client-terminal] websocket open", {
        name: session.name,
        pane: session.id,
        cols: session.term.cols || 120,
        rows: session.term.rows || 32,
        reconnectAttempts: session.reconnectAttempts || 0,
      });
      session.reconnectPending = false;
      session.shellEl.dataset.connection = sessionConnectingState(session);
      terminalSessionConnection.clearSocketConnectTimer(session);
      terminalSessionConnection.startSocketHealthMonitor(session, currentSocket);
      terminalSessionConnection.startAttachReadyTimer(session, currentSocket);
      sendTerminalTheme(session);
      terminalResize.resizePane(session, { forceSizeSync: true });
      if (session.tabId === getActiveTabId() && currentTab()?.activePaneId === session.id) {
        session.term.focus();
      }
    });

    currentSocket.addEventListener("message", (event) => {
      if (session.socket !== currentSocket || !transportIsCurrent()) {
        return;
      }
      terminalSessionConnection.markSocketHealth(session, currentSocket);
      session.startupErrorShown = true;
      if (session.name !== getActiveName()) {
        terminalTransportRuntime?.releaseDirectSession(session, "tab_or_target_removed");
        return;
      }
      if (typeof event.data === "string") {
        socketDebug.textMessages += 1;
        try {
          const message = JSON.parse(event.data);
          if (message && typeof message.type === "string") {
            if (!validateTerminalChannelMessageIdentity(event, message.type, false)) {
              rejectMismatchedChannelMessage(event, message.type);
              return;
            }
            if (
              socketDebug.textMessages <= 8
              || message.type === "history-replay-start"
              || message.type === "history-replay-complete"
              || message.type === "process-exit"
              || message.type === "agent-preparing"
              || message.type === "logical-attach-start"
              || message.type === "agent-attach-ready"
            ) {
              console.info("[client-terminal] websocket control message", {
                name: session.name,
                pane: session.id,
                type: message.type,
                selector: message.selector || "",
                paneID: message.pane_id || message.paneId || "",
                replayVerified: session.replayVerified || false,
                replayComplete: session.replayComplete,
                syncMode: message.sync_mode || "",
                serverBaseCursor: message.server_base_cursor || "",
                serverEndCursor: message.server_end_cursor || "",
                textMessages: socketDebug.textMessages,
              });
            }
            switch (message.type) {
              case "server-log": {
                const sequence = Number(message.server_log_seq || 0);
                const source = String(message.source || "server").trim();
                const text = String(message.message || "").trim();
                if (text) {
                  appendDebugLog(
                    ["error", "warn", "info"].includes(message.level) ? message.level : "info",
                    "服务端日志",
                    `${source}${sequence > 0 ? ` seq=${sequence}` : ""}: ${text}`,
                    { dedupeKey: sequence > 0 ? `server-log:${sequence}` : "" },
                  );
                }
                return;
              }
              case "resize-owner-released":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                terminalResize.handleOwnerReleased(session, message);
                return;
              case "resize-applied":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                terminalResize.handleApplied(session, message);
                return;
              case "resize-error":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                terminalResize.handleError(session, message);
                return;
              case "logical-attach-start":
                recordTerminalSessionEvent(session, "logical_attach_start", {
                  channel,
                  channelGeneration,
                  connectionEpoch,
                  serverUnixMs: Number(message.server_unix_ms || 0),
                  queueSubscriptionReceivedUnixMs: Number(message.queue_subscription_received_unix_ms || 0),
                  queueWaitDurationMs: Number(message.queue_wait_duration_ms || 0),
                  processStartDurationMs: Number(message.process_start_duration_ms || 0),
                  subscriptionIndex: Number(message.subscription_index || 0),
                  subscriptionCount: Number(message.subscription_count || 0),
                });
                return;
              case "agent-attach-ready":
                recordTerminalSessionEvent(session, "agent_attach_ready", {
                  channel,
                  channelGeneration,
                  connectionEpoch,
                  serverUnixMs: Number(message.server_unix_ms || 0),
                  agentAttachStartedUnixMs: Number(message.agent_attach_started_unix_ms || 0),
                  agentWorkspaceReadyDurationMs: Number(message.agent_workspace_ready_duration_ms || 0),
                  agentPaneResolveDurationMs: Number(message.agent_pane_resolve_duration_ms || 0),
                  agentHistorySnapshotDurationMs: Number(message.agent_history_snapshot_duration_ms || 0),
                  agentAttachPrepareDurationMs: Number(message.agent_attach_prepare_duration_ms || 0),
                });
                return;
              case "history-replay-start":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                socketDebug.replayStartedAt = Date.now();
                recordTerminalSessionEvent(session, "history_replay_start", {
                  syncMode: String(message.sync_mode || ""),
                  historyGeneration: String(message.history_generation || ""),
                  serverBaseCursor: message.server_base_cursor || "",
                  serverEndCursor: message.server_end_cursor || "",
                  deltaFromCursor: message.delta_from_cursor || "",
                  deltaToCursor: message.delta_to_cursor || "",
                  serverHistoryBytes: Number(message.server_history_bytes || 0),
                  serverHistoryChunks: Number(message.server_history_chunks || 0),
                  serverReplayFrames: Number(message.server_replay_frames || 0),
                  serverReplayStartedUnixMs: Number(message.server_replay_started_unix_ms || 0),
                  resizeEpoch: String(message.resize_epoch || ""),
                  cols: Number(message.cols || 0),
                  rows: Number(message.rows || 0),
                });
                // Keep one suppression scope across all replay drain tasks.
                // writeReplay() alone only protects one synchronous chunk.
                beginTerminalRenderSuppression(session, "replay");
                session.agentPreparing = false;
                terminalResize.handleReplayStart(session, message);
                const historyGeneration = String(message.history_generation || "").trim();
                const syncMode = String(message.sync_mode || "").trim();
                const serverBaseCursor = terminalReplay.parseCursor(message.server_base_cursor);
                const serverEndCursor = terminalReplay.parseCursor(message.server_end_cursor);
                const deltaFromCursor = terminalReplay.parseCursor(message.delta_from_cursor);
                const deltaToCursor = terminalReplay.parseCursor(message.delta_to_cursor);
                session.fastIntegrityEnabled = String(message.integrity_protocol || "").trim() === "fast-v1";
                const modernHistoryProtocol = Boolean(historyGeneration && syncMode);
                if (!modernHistoryProtocol) {
                  replayController.beginLegacy({
                    requestID: String(session.terminalReplayGeneration || ""),
                    connectionEpoch,
                    identity: { selector: session.name, paneID: session.id },
                  });
                  session.queueReplayControllerActive = false;
                  session.queueReplayControllerLegacy = usesMultiplexedTransport;
                  session.replayControllerLegacyActive = true;
                  session.historyProtocolActive = false;
                  session.historyStateReady = false;
                  session.historyGeneration = "";
                  session.historyCacheSnapshot = null;
                  session.localBaseCursor = 0n;
                  session.receivedHistoryCursor = 0n;
                  session.appliedHistoryCursor = 0n;
                  session.persistedHistoryCursor = 0n;
                  session.historyReplayTargetCursor = 0n;
                  session.serverBaseCursor = 0n;
                  if (isClientDirectTransport) {
                    clientHistory.disableSession(session);
                  }
                  if (!resetTerminalForHistoryReplay(session)) {
                    terminalSessionConnection.closeSocketForReconnect(session, currentSocket, "Terminal reset for legacy replay failed.");
                    return;
                  }
                  terminalReplay.setAuthorization(
                    session,
                    replayMessageHasIdentity(message) ? "identified" : "legacy",
                  );
                  session.allowGeneratedInputDuringReplay = message.allow_generated_input === true || message.allowGeneratedInput === true;
                  terminalInput?.clearGeneratedSuppression(session);
                  session.shellEl.dataset.connection = sessionConnectingState(session);
                  return;
                }
                if (
                  !["snapshot", "delta", "current"].includes(syncMode) ||
                  serverBaseCursor === null ||
                  serverEndCursor === null ||
                  deltaFromCursor === null ||
                  deltaToCursor === null ||
                  serverBaseCursor > serverEndCursor ||
                  deltaFromCursor > deltaToCursor ||
                  deltaToCursor !== serverEndCursor
                ) {
                  rejectHistorySync("invalid server history range");
                  return;
                }
                if (!validateWorkspaceReplayMessage(message)) {
                  rejectHistorySync("terminal workspace replay identity does not match");
                  return;
                }
                session.historyProtocolActive = true;
                session.historyGeneration = historyGeneration;
                session.historySyncMode = syncMode;
                appendStartupTrace(
                  "PTY replay 开始",
                  `pane=${session.id} mode=${syncMode || "legacy"} bytes=${deltaFromCursor !== null && deltaToCursor !== null ? Math.max(0, Number(deltaToCursor - deltaFromCursor)) : 0} chunks=${Number(message.server_history_chunks || 0)} frames=${Number(message.server_replay_frames || 0)}`,
                  { dedupeKey: `replay-start:${session.id}:${session.terminalReplayGeneration}` },
                );
                session.fastIntegritySequence = 1;
                session.fastIntegrityCursor = deltaFromCursor ?? 0n;
                session.historyReplayTargetCursor = deltaToCursor;
                if (isClientDirectTransport) {
                  clientReplayAdapter.begin({
                    requestID: String(session.terminalReplayGeneration || ""),
                    connectionEpoch,
                    identity: {
                      selector: session.name,
                      paneID: session.id,
                      historyGeneration,
                    },
                    startCursor: deltaFromCursor,
                    targetCursor: deltaToCursor,
                  });
                  session.replayControllerLegacyActive = false;
                } else if (channel === "fast" && !isClientInstanceName(session.name) && !usesMultiplexedTransport && session.fastIntegrityEnabled !== true) {
                  replayController.beginLegacy({
                    requestID: String(session.terminalReplayGeneration || ""),
                    connectionEpoch,
                    identity: { selector: session.name, paneID: session.id },
                  });
                  session.replayControllerLegacyActive = true;
                } else {
                  replayController.begin({
                    requestID: String(session.terminalReplayGeneration || ""),
                    connectionEpoch,
                    identity: {
                      selector: session.name,
                      paneID: session.id,
                      historyGeneration,
                    },
                    startCursor: deltaFromCursor,
                    targetCursor: deltaToCursor,
                  });
                  session.replayControllerLegacyActive = false;
                }
                session.queueReplayControllerActive = usesMultiplexedTransport && deltaFromCursor === deltaToCursor;
                session.queueReplayControllerLegacy = false;
                session.serverBaseCursor = serverBaseCursor;
                session.resetOnNextReplay = false;
                if (syncMode === "snapshot") {
                  if (!resetTerminalForHistoryReplay(session)) {
                    rejectHistorySync("terminal reset failed");
                    return;
                  }
                  session.historyGeneration = historyGeneration;
                  session.historyProtocolActive = true;
                  session.historySyncMode = syncMode;
                  session.serverBaseCursor = serverBaseCursor;
                  session.localBaseCursor = serverBaseCursor;
                  session.receivedHistoryCursor = deltaFromCursor;
                  session.appliedHistoryCursor = deltaFromCursor;
                  session.persistedHistoryCursor = deltaFromCursor;
                  terminalReplay.setAuthorization(session, "identified");
                  if (isClientDirectTransport) {
                    clientHistory.resetSession(session, historyGeneration, deltaFromCursor);
                  }
                } else {
                  if (!historyConnectRange || historyConnectRange.generation !== historyGeneration || historyConnectRange.endCursor !== deltaFromCursor) {
                    rejectHistorySync("local and server history ranges do not match");
                    return;
                  }
                  if (historyConnectRange.source === "memory") {
                    if (!session.historyStateReady || session.appliedHistoryCursor !== deltaFromCursor) {
                      rejectHistorySync("in-memory terminal cursor is not reusable");
                      return;
                    }
                    terminalOutput.discard(session);
                    session.receivedHistoryCursor = deltaFromCursor;
                  } else if (historyConnectRange.source === "cache") {
                    const snapshot = session.historyCacheSnapshot;
                    if (!snapshot || snapshot.generation !== historyGeneration || snapshot.baseCursor !== historyConnectRange.baseCursor || snapshot.endCursor !== deltaFromCursor) {
                      rejectHistorySync("cached terminal history is unavailable");
                      return;
                    }
                    if (!resetTerminalForHistoryReplay(session)) {
                      rejectHistorySync("terminal reset for cached history failed");
                      return;
                    }
                    session.historyGeneration = historyGeneration;
                    session.historyProtocolActive = true;
                    session.historySyncMode = syncMode;
                    session.serverBaseCursor = serverBaseCursor;
                    session.localBaseCursor = snapshot.baseCursor;
                    session.receivedHistoryCursor = snapshot.baseCursor;
                    session.appliedHistoryCursor = snapshot.baseCursor;
                    session.persistedHistoryCursor = snapshot.endCursor;
                    for (const chunk of snapshot.chunks) {
                      terminalOutput.write(session, chunk.data, {
                        historySource: "cache",
                        startCursor: chunk.startCursor,
                        endCursor: chunk.endCursor,
                      });
                    }
                    if (session.receivedHistoryCursor !== deltaFromCursor) {
                      rejectHistorySync("cached terminal history did not reach requested cursor");
                      return;
                    }
                  } else {
                    rejectHistorySync("unknown local history source");
                    return;
                  }
                }
                terminalReplay.setAuthorization(session, "identified");
                session.allowGeneratedInputDuringReplay = message.allow_generated_input === true || message.allowGeneratedInput === true;
                terminalInput?.clearGeneratedSuppression(session);
                session.shellEl.dataset.connection = sessionConnectingState(session);
                return;
              case "history-replay-complete":
                appendStartupTrace(
                  "PTY replay 完成通知",
                  `pane=${session.id} duration=${socketDebug.replayStartedAt ? Math.max(0, Date.now() - socketDebug.replayStartedAt) : 0}ms bytes=${socketDebug.binaryBytes} frames=${socketDebug.binaryMessages} serverDuration=${Number(message.server_replay_duration_ms || 0)}ms queue=${Number(session.outputQueueSize || 0)}`,
                  { dedupeKey: `replay-complete:${session.id}:${session.terminalReplayGeneration}` },
                );
                if (!terminalReplay.isAuthorized(session) || (terminalReplay.hasIdentifiedAuthorization(session) && !validateReplayMessage(message))) {
                  rejectMismatchedReplay(message);
                  return;
                }
                if (session.historyProtocolActive) {
                  const completeGeneration = String(message.history_generation || "").trim();
                  const completeCursor = terminalReplay.parseCursor(message.history_cursor);
                  if (
                    completeGeneration !== session.historyGeneration
                    || completeCursor === null
                    || completeCursor !== session.historyReplayTargetCursor
                    || session.receivedHistoryCursor < completeCursor
                    || !validateWorkspaceReplayMessage(message)
                  ) {
                    rejectHistorySync("history replay completion range does not match");
                    return;
                  }
                }
                if (session.replayControllerLegacyActive) {
                  try {
                    replayController.completeLegacy({
                      requestID: String(session.terminalReplayGeneration || ""),
                      connectionEpoch,
                      identity: { selector: session.name, paneID: session.id },
                    });
                  } catch (error) {
                    rejectMismatchedReplay(message);
                    return;
                  }
                }
                const replayControllerRequired = (
                  channel === "fast" && !isClientInstanceName(session.name) && session.fastIntegrityEnabled === true
                ) || (
                  isClientDirectTransport && session.historyProtocolActive
                ) || (
                  usesMultiplexedTransport && session.queueReplayControllerActive
                );
                if (replayControllerRequired && session.historyProtocolActive) {
                  try {
                    if (isClientDirectTransport) {
                      clientReplayAdapter.complete({
                        cursor: message.history_cursor,
                        requestID: String(session.terminalReplayGeneration || ""),
                        connectionEpoch,
                        identity: {
                          selector: session.name,
                          paneID: session.id,
                          historyGeneration: session.historyGeneration,
                        },
                      });
                    } else {
                      replayController.complete({
                        cursor: message.history_cursor,
                        requestID: String(session.terminalReplayGeneration || ""),
                        connectionEpoch,
                        identity: {
                          selector: session.name,
                          paneID: session.id,
                          historyGeneration: session.historyGeneration,
                        },
                      });
                    }
                  } catch (error) {
                    rejectHistorySync(error?.message || "Replay completion validation failed");
                    return;
                  }
                }
                recordTerminalSessionEvent(session, "history_replay_complete", {
                  cursor: message.history_cursor || "",
                  replayDurationMs: socketDebug.replayStartedAt
                    ? Math.max(0, Date.now() - socketDebug.replayStartedAt)
                    : 0,
                  serverHistoryBytes: Number(message.server_history_bytes || 0),
                  serverHistoryChunks: Number(message.server_history_chunks || 0),
                  serverReplayFrames: Number(message.server_replay_frames || 0),
                  serverReplayDurationMs: Number(message.server_replay_duration_ms || 0),
                  serverReplayFinishedUnixMs: Number(message.server_replay_finished_unix_ms || 0),
                  binaryMessages: socketDebug.binaryMessages,
                  binaryBytes: socketDebug.binaryBytes,
                  outputQueueBytes: Number(session.outputQueueSize || 0),
                  replayPhase: "receive_complete",
                  stableReady: false,
                  presentationCommitted: false,
                  serverReplayDurationScope: "agent_attach_write",
                });
                session.replayCompletionPending = true;
                terminalReplay.finishIfReady(session) || terminalOutput.flush(session);
                return;
              case "queue-turn-complete":
                if (usesMultiplexedTransport) {
                  const turnResult = terminalOutput?.completeQueueTurn(session, {
                    appliedCursor: message.applied_cursor,
                    appliedSequence: message.applied_sequence,
                    socket: currentSocket,
                    connectionEpoch,
                    channelGeneration: Number(session.connectionChannelGeneration || 0),
                  });
                  if (turnResult?.status === "invalid") {
                    rejectHistorySync(turnResult.reason);
                    return;
                  }
                  // Output flush schedules the coalesced presentation validation after
                  // applying the turn. A queue turn must not start another full render.
                }
                return;
              case "agent-preparing":
                recordTerminalSessionEvent(session, "agent_preparing", {
                  channel,
                  channelGeneration,
                  connectionEpoch,
                  serverUnixMs: Number(message.server_unix_ms || 0),
                });
                appendStartupTrace(
                  "agent 准备中",
                  `pane=${session.id} channel=${channel} serverUnixMs=${Number(message.server_unix_ms || 0) || "unknown"}`,
                  { dedupeKey: `agent-preparing:${session.id}:${session.terminalReplayGeneration}` },
                );
                session.agentPreparing = true;
                terminalSessionConnection.startAttachReadyTimer(session, currentSocket, terminalAgentPrepareTimeoutMs);
                session.shellEl.dataset.connection = sessionConnectingState(session);
                return;
              case "workspace-refresh-required":
                terminalTransportRuntime?.releaseDirectSession(session, "tab_or_target_removed");
                refreshWorkspaceWithRetry({ focus: session.tabId === getActiveTabId() }).catch((error) => showToast(error.message));
                return;
              case "connection-error":
                console.warn("[client-terminal] retryable connection error", {
                  name: session.name,
                  pane: session.id,
                  message: message.message || "",
                });
                if (!terminalReplay.isCommitted(session) && terminalReplay.noteFailure(session, message.message || "replay_connection_error")) {
                  try {
                    currentSocket.close(4001, "replay_retry_paused");
                  } catch (error) {
                  }
                  return;
                }
                terminalSessionConnection.closeSocketForReconnect(session, currentSocket, message.message || "Terminal retryable connection error.");
                return;
              case "pong":
                return;
              case "process-exit":
                console.warn("[client-terminal] process exit message", {
                  name: session.name,
                  pane: session.id,
                  retryable: message.retryable === true,
                  exitCode: message.exit_code,
                  message: message.message || "",
                });
                if (message.retryable === true && !/pane not found/i.test(String(message.message || ""))) {
                  showSessionStartupError(session, message.message || "Client terminal connection failed.");
                  terminalSessionConnection.closeSocketForReconnect(session, currentSocket, message.message || "Terminal process exited with a retryable error.");
                  return;
                }
                if (message.retained === true) {
                  session.exitExpected = true;
                  session.workspaceExitPending = false;
                  session.terminalExitRetained = true;
                  session.pendingConnect = false;
                  session.shellEl.dataset.connection = "error";
                  terminalTransportRuntime?.releaseDirectSession(session, "tab_or_target_removed");
                  showSessionStartupError(
                    session,
                    message.message || `Terminal process exited with code ${Number(message.exit_code ?? -1)}.`,
                  );
                  return;
                }
                const shouldFocusAfterExit = session.tabId === getActiveTabId() && currentTab()?.activePaneId === session.id;
                session.exitExpected = true;
                session.workspaceExitPending = true;
                terminalTransportRuntime?.releaseDirectSession(session, "tab_or_target_removed");
                refreshWorkspaceWithRetry({ focus: shouldFocusAfterExit }).catch((error) => showToast(error.message));
                return;
            }
          }
        } catch (error) {
          if (socketDebug.textMessages <= 8) {
            console.warn("[client-terminal] websocket text message parse failed", {
              name: session.name,
              pane: session.id,
              bytes: event.data.length,
              textMessages: socketDebug.textMessages,
              error: error?.message || String(error),
            });
          }
        }
        terminalOutput.write(session, event.data, { connectionEpoch });
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        socketDebug.binaryMessages += 1;
        socketDebug.binaryBytes += event.data.byteLength;
        if (!validateTerminalChannelMessageIdentity(event, "", true)) {
          rejectMismatchedChannelMessage(event, "binary-output");
          return;
        }
        if (socketDebug.binaryMessages === 1) {
          recordTerminalSessionEvent(session, "first_binary_output", {
            bytes: event.data.byteLength,
            replayActive: terminalReplay.isAuthorized(session) && !terminalReplay.isCommitted(session),
            binaryMessages: socketDebug.binaryMessages,
            binaryBytes: socketDebug.binaryBytes,
          });
        }
        if (socketDebug.binaryMessages <= 8) {
          console.info("[client-terminal] websocket binary message", {
            name: session.name,
            pane: session.id,
            bytes: event.data.byteLength,
            binaryMessages: socketDebug.binaryMessages,
            binaryBytes: socketDebug.binaryBytes,
            replayVerified: session.replayVerified || false,
            replayComplete: session.replayComplete,
          });
        }
        let outputPayload = new Uint8Array(event.data);
        if (channel === "fast" && !isClientInstanceName(session.name) && session.fastIntegrityEnabled === true) {
          try {
            outputPayload = decodeFastBinaryMessage(event.data);
            if (!outputPayload) {
              throw new Error("Fast binary integrity envelope is missing");
            }
          } catch (error) {
            rejectHistorySync(error?.message || "Fast binary integrity validation failed");
            return;
          }
        }
        if (isClientDirectTransport && replayController.phase === "replaying" && session.historyProtocolActive) {
          try {
            clientReplayAdapter.acceptBinary({
              data: outputPayload,
              requestID: String(session.terminalReplayGeneration || ""),
              connectionEpoch,
              identity: {
                selector: session.name,
                paneID: session.id,
                historyGeneration: session.historyGeneration,
              },
            });
          } catch (error) {
            rejectHistorySync(error?.message || "Client replay cursor validation failed");
            return;
          }
        }
        if (usesMultiplexedTransport && replayController.phase === "replaying" && session.historyProtocolActive) {
          const metadata = event.queueMetadata || {};
          if (metadata.sequence === undefined || metadata.sequence === null) {
            replayController.reset();
            session.queueReplayControllerActive = false;
            session.queueReplayControllerLegacy = true;
          } else {
            try {
              replayController.acceptBinary({
                sequence: metadata.sequence,
                startCursor: metadata.startCursor,
                endCursor: metadata.endCursor,
                length: outputPayload.byteLength,
                requestID: String(session.terminalReplayGeneration || ""),
                connectionEpoch,
                identity: {
                  selector: session.name,
                  paneID: session.id,
                  historyGeneration: session.historyGeneration,
                },
              });
              session.queueReplayControllerActive = true;
            } catch (error) {
              rejectHistorySync(error?.message || "Queue replay controller validation failed");
              return;
            }
          }
        }
        if (!terminalReplay.isAuthorized(session) && !terminalReplay.isCommitted(session)) {
          if (socketDebug.binaryMessages <= 8) {
            console.warn("[client-terminal] dropped binary before replay verification", {
              name: session.name,
              pane: session.id,
              bytes: event.data.byteLength,
              binaryMessages: socketDebug.binaryMessages,
            });
          }
          return;
        }
        try {
          if (usesMultiplexedTransport) {
            const metadata = event.queueMetadata || {};
          terminalOutput?.noteQueueTurnFrame(session, metadata);
        }
        terminalOutput.write(session, outputPayload, {
            connectionEpoch,
            deferRender: usesMultiplexedTransport && terminalReplay.isCommitted(session),
          });
        } catch (error) {
          rejectHistorySync(error?.message || "terminal history output range failed");
        }
      }
    });

    currentSocket.addEventListener("close", (event) => {
      if (session.socket !== currentSocket || (!usesMultiplexedTransport && session.connectionLeaseID !== leaseID)) {
        return;
      }
      recordTerminalSessionEvent(session, "socket_close", {
        channel,
        code: Number(event.code || 0),
        wasClean: event.wasClean === true,
        openDurationMs: socketDebug.openedAt ? Date.now() - socketDebug.openedAt : 0,
        textMessages: socketDebug.textMessages,
        binaryMessages: socketDebug.binaryMessages,
        binaryBytes: socketDebug.binaryBytes,
        replayVerified: session.replayVerified || false,
        replayComplete: session.replayComplete,
        startupElapsedMs: Number(session.startupTraceStartedAt || 0)
          ? Math.max(0, Date.now() - Number(session.startupTraceStartedAt))
          : 0,
      });
      const schedulerCloseReason = usesMultiplexedTransport
        ? String(session.connectionCloseReason || "")
        : String(session.connectionLeaseCloseReason || "");
      const intentionallyParked = [
        "scheduler_preempt",
        "capacity_reduced",
        "background_tab_parked",
        "membership_removed",
      ].includes(schedulerCloseReason);
      const intentionallyClosed = [
        "session_closed",
        "tab_or_target_removed",
        "page_disposed",
      ].includes(schedulerCloseReason);
      const intentionalTransportClose = intentionallyParked || intentionallyClosed;
      terminalInput?.pausePendingExpiry(session);
      console[intentionalTransportClose ? "info" : "warn"]("[client-terminal] websocket close", {
        name: session.name,
        tab: session.tabId,
        pane: session.id,
        scope: "session/tab/pane",
        code: event.code,
        reason: event.reason || "",
        wasClean: event.wasClean,
        openDurationMs: socketDebug.openedAt ? Date.now() - socketDebug.openedAt : 0,
        textMessages: socketDebug.textMessages,
        binaryMessages: socketDebug.binaryMessages,
        binaryBytes: socketDebug.binaryBytes,
        replayVerified: session.replayVerified || false,
        replayComplete: session.replayComplete,
        startupErrorShown: session.startupErrorShown,
        exitExpected: session.exitExpected === true,
      });
      if (!intentionalTransportClose) {
        appendDebugWarning("终端 WebSocket 已断开", `${terminalLocationDescription(session)}, code=${event.code}, ${event.reason || "无原因"}`);
      }
      const sharedPhysicalTransportLost = !isClientInstanceName(session.name)
        && currentMultiplexedConnection
        && terminalUnifiedTransport.isClosedConnection(currentMultiplexedConnection);
      const nextConnectionState = terminalReplay.isRetryPaused(session)
        ? "error"
        : intentionallyParked
        ? "parked"
        : intentionallyClosed
          ? "closed"
          : schedulerCloseReason === "network_offline"
          ? "offline"
          : sharedPhysicalTransportLost
            || isNetworkFailureReason(schedulerCloseReason)
            || isNetworkFailureReason(event.reason)
          ? "network-error"
          : "reconnecting";
      const retryableTransportClose = !intentionallyClosed && (usesMultiplexedTransport
        || isRetryableTerminalTransportError(schedulerCloseReason)
        || isRetryableTerminalTransportError(event.reason));
      if (retryableTransportClose) {
        invalidateSessionStartupError(session, { hidePanel: true });
      }
      detachSessionSocket(session, currentSocket, { connection: nextConnectionState });
      if (usesMultiplexedTransport) {
        session.unifiedConnectPending = false;
      }
      session.connectionLeaseClosing = false;
      session.connectionLeaseCloseReason = "";
      session.connectionLeaseID = 0;
      session.connectionCloseReason = "";
      if (usesMultiplexedTransport) {
        session.connectionChannel = "";
        session.connectionChannelGeneration = 0;
        session.unifiedStreamID = "";
      } else {
        session.connectionChannel = "";
        session.connectionChannelGeneration = 0;
        session.fastStreamID = "";
      }
      if (!session.closed) {
        terminalOutput.flush(session);
      }
      if (usesMultiplexedTransport) {
        if (sharedPhysicalTransportLost) {
          return;
        }
        if (!session.closed && !intentionallyClosed && !intentionallyParked) {
          terminalTransportRuntime?.scheduleUnifiedPaneRetry(
            session,
            `${terminalLocationDescription(session)}: ${schedulerCloseReason || event.reason || "unified_stream_closed"}`,
            { immediate: true },
          );
        }
        return;
      }
      const fastPhysicalTransportLost = false;
      if (!fastPhysicalTransportLost) {
        terminalTransportRuntime?.notifyDirectClosed(session, leaseID, {
          reason: schedulerCloseReason || "server_close",
          code: event.code,
          wasClean: event.wasClean,
        });
      }
      // Direct client sockets remain scheduler-owned; Unified physical loss is
      // handled above by the single physical owner.
      if (intentionallyParked) {
        appendDebugLog("info", "终端连接已停放", `${terminalLocationDescription(session)}, lease=${leaseID}`);
        return;
      }
      if (session.exitExpected || session.closed || schedulerCloseReason === "tab_or_target_removed" || schedulerCloseReason === "page_disposed") {
        return;
      }
      if (!retryableTransportClose && !fastPhysicalTransportLost && !session.startupErrorShown) {
        session.startupErrorShown = true;
        showSessionStartupError(session, event.reason || "WebSocket closed before terminal attached.");
      }
    });

    currentSocket.addEventListener("error", (event) => {
      if (session.socket !== currentSocket || !transportIsCurrent()) {
        return;
      }
      console.warn("[client-terminal] websocket error", {
        name: session.name,
        pane: session.id,
        readyState: currentSocket.readyState,
        openDurationMs: socketDebug.openedAt ? Date.now() - socketDebug.openedAt : 0,
        textMessages: socketDebug.textMessages,
        binaryMessages: socketDebug.binaryMessages,
        binaryBytes: socketDebug.binaryBytes,
        replayVerified: session.replayVerified || false,
        replayComplete: session.replayComplete,
        eventType: event.type,
      });
      appendDebugError("终端 WebSocket 错误", `${session.name}/${session.id}: ${event.message || "连接失败"}`);
      session.connectionRetrying = true;
      session.shellEl.dataset.connection = "network-error";
      terminalOutput.flush(session);
      if (!isRetryableTerminalTransportError(event.message || "WebSocket connection failed.") && !session.startupErrorShown) {
        session.startupErrorShown = true;
        showSessionStartupError(session, "WebSocket connection failed.");
      }
      if (usesMultiplexedTransport) {
        terminalTransportRuntime?.recycleUnifiedSession(session, "unified logical websocket error", { immediate: true });
      } else {
        terminalTransportRuntime?.notifyDirectFailure(session, leaseID, new Error("Terminal WebSocket error"), { awaitClose: true });
      }
    });
    return true;
  };

  return Object.freeze({ connectSession });
}
