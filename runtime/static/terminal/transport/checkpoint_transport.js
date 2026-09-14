export const memoryCheckpointProtocol = "ghostty-memory-v1";

export function createCheckpointReceiver(session) {
  let state = null;
  return {
    clear() { state = null; },
    accept(message) {
      if (message.selector !== session.name || message.pane_id !== session.id
        || typeof message.data !== "string" || message.data.length > 87384
        || !Number.isSafeInteger(message.index) || message.index < 0 || message.index >= 256)
        throw new Error("Terminal checkpoint part identity/size mismatch");
      if (!state) state = { history: message.history_generation, cursor: message.cursor, chunks: [] };
      if (message.index !== state.chunks.length || message.history_generation !== state.history || message.cursor !== state.cursor)
        throw new Error("Terminal checkpoint parts are not continuous");
      state.chunks.push(message.data);
    },
    take(message) {
      const checkpoint = message.memory_checkpoint;
      if (!checkpoint) { state = null; return null; }
      if (checkpoint.protocol !== memoryCheckpointProtocol || !state || state.history !== message.history_generation
        || state.cursor !== checkpoint.cursor || checkpoint.cursor !== message.delta_from_cursor
        || checkpoint.parts !== state.chunks.length || checkpoint.cols !== message.cols || checkpoint.rows !== message.rows)
        throw new Error("Terminal checkpoint does not match its replay boundary");
      const result = { ...checkpoint, chunks: state.chunks };
      state = null;
      return result;
    },
  };
}
