// Client-specific migration and capability checks only. Sessions, transport,
// replay, theme and flow control use the shared terminal/ modules.
export { retireClientTerminalHistory } from "./retirement.js";
export { requireManagedClientWorkspace } from "./capabilities.js";
