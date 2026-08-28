import {
  createTerminalQueueConnection,
  decodeTerminalQueueBinaryFrame,
  terminalQueueProtocolVersion,
} from "./terminal_queue_connection.js";

// Unified transport keeps the already validated multiplexed wire path while
// removing the Fast/Queue physical-role distinction from its public API.
export const terminalUnifiedTransportProtocolVersion = terminalQueueProtocolVersion;

export const createTerminalUnifiedConnection = ({
  url,
  WebSocketImpl = globalThis.WebSocket,
  onStateChange = () => {},
  onProtocolError = () => {},
  onPhysicalError = () => {},
  onPhysicalClose = () => {},
} = {}) => {
  if (!url || typeof WebSocketImpl !== "function") {
    throw new TypeError("terminal unified connection requires a URL and WebSocket implementation");
  }
  const connection = createTerminalQueueConnection({
    url,
    WebSocketImpl,
    onStateChange: (state) => onStateChange({
      ...state,
      physicalRole: "unified",
    }),
    onProtocolError,
    onPhysicalError,
    onPhysicalClose,
    keepAliveWhenEmpty: true,
  });
  return {
    connect: connection.connect,
    open: connection.open,
    close: connection.close,
    setPriority: connection.setPriority,
    ping: connection.ping,
    closed: connection.closed,
    snapshot: () => ({ ...connection.snapshot(), physicalRole: "unified" }),
    getPhysicalSocket: connection.getPhysicalSocket,
    hasPane: connection.hasPane,
  };
};

export { decodeTerminalQueueBinaryFrame };
