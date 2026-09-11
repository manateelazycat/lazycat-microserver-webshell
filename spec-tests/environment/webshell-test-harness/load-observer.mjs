// Test-only observation of the real WASM instances and real browser events.
// No output, parser result, transport response or product state is substituted.
export function installLoadObserver() {
  if (!["/", "/webshell/"].includes(location.pathname)) return;
  const terminals = new Map();
  const nativeCosts = {};
  const resizeTrace = [];
  let pendingTerminal;
  const observeInstance = (instance) => {
    const native = instance.exports;
    if (typeof native.ghostty_terminal_new_with_config !== "function") return instance;
    const exports = { ...native };
    exports.ghostty_terminal_new_with_config = (...args) => {
      const scrollbackBytes = args[2] ? new DataView(native.memory.buffer).getUint32(args[2] >>> 0, true) : null;
      const handle = native.ghostty_terminal_new_with_config(...args);
      if (handle) {
        pendingTerminal = { handle, native, cols: args[0], rows: args[1], scrollbackBytes, host: null };
        terminals.set(handle, pendingTerminal);
      }
      return handle;
    };
    exports.ghostty_terminal_resize = (...args) => {
      const before = terminals.get(args[0]);
      if (globalThis.__loadTraceResize && before) before.pendingResizeTrace = {
        at: performance.now(), before: before.lastCursor, tail: before.lastWriteTail,
        fromCols: before.cols, cols: args[1], rows: args[2],
      };
      const result = native.ghostty_terminal_resize(...args);
      const terminal = terminals.get(args[0]);
      if (terminal) { terminal.cols = args[1]; terminal.rows = args[2]; }
      return result;
    };
    exports.ghostty_terminal_free = (...args) => {
      // Ghostty reset creates a replacement WASM terminal before freeing the
      // old one, while keeping its Canvas/host. Preserve that observed mapping.
      const previous = terminals.get(args[0]);
      if (pendingTerminal && pendingTerminal.handle !== args[0] && !pendingTerminal.host && previous?.host) {
        pendingTerminal.host = previous.host;
        pendingTerminal = null;
      }
      terminals.delete(args[0]);
      return native.ghostty_terminal_free(...args);
    };
    for (const name of ["ghostty_terminal_write", "ghostty_terminal_resize", "ghostty_render_state_update"]) {
      const invoke = exports[name];
      if (typeof invoke !== "function") continue;
      exports[name] = (...args) => {
        const started = performance.now();
        const terminal = terminals.get(args[0]);
        if (globalThis.__loadTraceResize && name === "ghostty_terminal_write" && terminal) {
          const pointer = args[1] >>> 0, length = args[2];
          terminal.lastWriteTail = new TextDecoder().decode(new Uint8Array(native.memory.buffer, pointer + Math.max(0, length - 80), Math.min(length, 80)));
        }
        try { return invoke(...args); }
        finally {
          if (globalThis.__loadTraceResize && name === "ghostty_render_state_update" && terminal) {
            terminal.lastCursor = { x: native.ghostty_render_state_get_cursor_x(args[0]), y: native.ghostty_render_state_get_cursor_y(args[0]) };
            if (terminal.pendingResizeTrace) {
              resizeTrace.push({ ...terminal.pendingResizeTrace, after: terminal.lastCursor });
              if (resizeTrace.length > 512) resizeTrace.shift();
              terminal.pendingResizeTrace = null;
            }
          }
          const duration = performance.now() - started;
          const cost = nativeCosts[name] ||= { calls: 0, totalMs: 0, maxMs: 0 };
          cost.calls++; cost.totalMs += duration; cost.maxMs = Math.max(cost.maxMs, duration);
        }
      };
    }
    return new Proxy(instance, { get(target, key) { return key === "exports" ? exports : Reflect.get(target, key, target); } });
  };
  for (const key of ["instantiate", "instantiateStreaming"]) {
    const native = WebAssembly[key];
    if (!native) continue;
    WebAssembly[key] = async (...args) => {
      const result = await native.apply(WebAssembly, args);
      return result instanceof WebAssembly.Instance ? observeInstance(result) : { ...result, instance: observeInstance(result.instance) };
    };
  }
  const append = Node.prototype.appendChild;
  Node.prototype.appendChild = function (node) {
    const result = append.call(this, node);
    if (pendingTerminal && node.nodeName === "CANVAS" && this.classList?.contains("terminal-host")) {
      pendingTerminal.host = this;
      pendingTerminal = null;
    }
    return result;
  };
  const socketEvents = [];
  let maxSockets = 0;
  const sockets = new Set();
  const streams = new Map();
  const replays = new Map();
  const acknowledgements = new Map();
  const paneBoundaries = new Map();
  const headerDecoder = new TextDecoder();
  let receivedBytes = 0;
  let cursorGaps = 0;
  const NativeWebSocket = window.WebSocket;
  const recordSocket = (kind) => {
    const active = [...sockets].filter(s => s.readyState === 0 || s.readyState === 1).length;
    maxSockets = Math.max(maxSockets, active);
    socketEvents.push({ kind, at: performance.now(), active });
    if (socketEvents.length > 1000) socketEvents.shift();
  };
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args) {
      const socket = Reflect.construct(target, args);
      // All page-created sockets count; counting only mode=unified would hide
      // accidental extra per-pane transports. CDP itself is outside the page.
      sockets.add(socket);
      const connectionID = sockets.size;
      const send = socket.send;
      socket.send = function (data) {
        if (typeof data === "string") {
          let message;
          try { message = JSON.parse(data); } catch {}
          if (message?.type === "pane-control" && message.control?.type === "queue-turn-ack") {
            const key = [connectionID, message.pane_id, message.stream_id, message.channel_generation].join(":");
            acknowledgements.set(key, String(message.control.data).split(":")[0]);
          }
        }
        return send.call(this, data);
      };
      recordSocket("create");
      socket.addEventListener("open", () => recordSocket("open"));
      socket.addEventListener("close", () => recordSocket("close"));
      socket.addEventListener("message", event => {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (message.type === "pane-control" && message.payload?.type === "history-replay-start") {
            replays.set(message.pane_id, { paneID: message.pane_id, ...message.payload });
          }
          return;
        }
        if (!(event.data instanceof ArrayBuffer)) return;
        const bytes = new Uint8Array(event.data);
        if (bytes.length < 8 || headerDecoder.decode(bytes.subarray(0, 4)) !== "LCQ1") return;
        const length = new DataView(bytes.buffer).getUint32(4, false);
        if (length <= 0 || 8 + length > bytes.length) return;
        const header = JSON.parse(headerDecoder.decode(bytes.subarray(8, 8 + length)));
        paneBoundaries.set(header.pane_id, { key: [connectionID, header.pane_id, header.stream_id, header.channel_generation].join(":"), cursor: String(header.end_cursor), at: performance.now() });
        const size = bytes.length - 8 - length;
        const key = [connectionID, header.pane_id, header.stream_id, header.channel_generation, header.history_generation].join(":");
        const stream = streams.get(key) || { paneID: header.pane_id, bytes: 0, firstCursor: header.start_cursor, endCursor: null, lineTail: "", live: {} };
        if (stream.endCursor !== null && String(stream.endCursor) !== String(header.start_cursor)) cursorGaps += 1;
        stream.bytes += size;
        stream.endCursor = header.end_cursor;
        const lines = (stream.lineTail + headerDecoder.decode(bytes.subarray(8 + length))).split("\n");
        stream.lineTail = lines.pop().slice(-2048);
        for (const line of lines) {
          const match = /^([L]\d+):(\d{6}) /.exec(line);
          if (!match) continue;
          const sequence = Number(match[2]);
          const live = stream.live[match[1]] ||= { first: sequence, last: sequence - 1, count: 0, gaps: [] };
          if (sequence !== live.last + 1 && live.gaps.length < 16) live.gaps.push({ expected: live.last + 1, actual: sequence });
          live.last = sequence; live.count++;
        }
        streams.set(key, stream);
        receivedBytes += size;
      });
      return socket;
    },
  });
  let measurement = null;
  let layoutPhase = null;
  let lastLayoutSample = 0;
  const sampleLayout = (at) => {
    if (!measurement || !layoutPhase) return;
    const started = performance.now();
    const panes = [...document.querySelectorAll(".terminal-pane.active .pane-shell")].map(shell => {
      const host = shell.querySelector(".terminal-host");
      const live = host?.querySelector("canvas:not(.terminal-frame-hold)");
      const hold = host?.querySelector(".terminal-frame-hold");
      const hostRect = host?.getBoundingClientRect();
      const liveRect = live?.getBoundingClientRect();
      return { paneID: shell.dataset.paneId, hostWidth: hostRect?.width || 0,
        hostHeight: hostRect?.height || 0, hostTop: hostRect?.top || 0,
        liveWidth: liveRect?.width || 0, liveHeight: liveRect?.height || 0,
        liveTop: liveRect?.top || 0, backingWidth: live?.width || 0,
        backingHeight: live?.height || 0,
        liveVisible: !!live && getComputedStyle(live).visibility === "visible",
        holdVisible: !!hold && !hold.hidden, ready: shell.dataset.renderReady === "true" };
    });
    measurement.layout.push({ at, phase: layoutPhase, panes });
    if (measurement.layout.length > 1200) measurement.layout.shift();
    measurement.samplingMs += performance.now() - started;
    lastLayoutSample = at;
  };
  document.addEventListener("click", event => {
    const tab = event.target.closest?.(".tab[data-tab-id], .tab-overview-card-main[data-tab-id]");
    if (!measurement || !tab) return;
    const current = measurement;
    const action = { tabID: tab.dataset.tabId, at: performance.now(), durationMs: null };
    current.tabActions.push(action);
    const observe = () => {
      if (measurement !== current) return;
      if (document.querySelector(".terminal-pane.active")?.dataset.tabId === action.tabID) {
        action.durationMs = performance.now() - action.at;
      } else if (performance.now() - action.at < 5000) requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }, { capture: true, passive: true });
  let previous = performance.now();
  const tick = (now) => {
    if (measurement) {
      measurement.maxRafGapMs = Math.max(measurement.maxRafGapMs, now - previous);
      measurement.frames += 1;
      if (now - lastLayoutSample >= 100) sampleLayout(now);
    }
    previous = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  let longTasks = { count: 0, total: 0, max: 0 };
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      longTasks.count += 1; longTasks.total += entry.duration; longTasks.max = Math.max(longTasks.max, entry.duration);
    }
  }).observe({ type: "longtask", buffered: true });
  window.__loadObservation = {
    isOutputDrained(paneID) {
      const boundary = paneBoundaries.get(paneID);
      return !!boundary && acknowledgements.get(boundary.key) === boundary.cursor && performance.now() - boundary.at >= 300;
    },
    readHistoryHeaders(paneID, offset, count = 512, includePrefixes = false) {
      const terminal = [...terminals.values()].find(t => t.host?.closest(".pane-shell")?.dataset.paneId === paneID);
      if (!terminal) throw new Error("Observed PTY history is unavailable");
      const { native, handle } = terminal;
      const rows = native.ghostty_terminal_get_scrollback_length(handle);
      // Same public cell ABI as the built Ghostty wrapper (16 bytes per cell).
      // Read a bounded prefix only; never update/clean the terminal render state.
      const cols = terminal.cols;
      const bytes = cols * 16;
      const pointer = native.ghostty_wasm_alloc_u8_array(bytes) >>> 0;
      if (!pointer) throw new Error("History observation allocation failed");
      const headers = [];
      const prefixes = [];
      try {
        const end = Math.min(rows, offset + Math.min(512, count));
        for (let row = offset; row < end; row++) {
          const length = native.ghostty_terminal_get_scrollback_line(handle, row, pointer, cols);
          if (length < 0 || length > cols) throw new Error("History observation could not read retained row");
          const view = new DataView(native.memory.buffer);
          let prefix = "";
          for (let col = 0; col < Math.min(length, 24); col++) prefix += String.fromCodePoint(view.getUint32(pointer + col * 16, true) || 32);
          const match = prefix.match(/^([HL]\d+):(\d{6}) /);
          if (includePrefixes) prefixes.push({ row, prefix });
          if (match) headers.push({ row, stream: match[1], sequence: Number(match[2]) });
        }
        return { rows, nextOffset: end, headers, ...(includePrefixes ? { prefixes } : {}) };
      } finally { native.ghostty_wasm_free_u8_array(pointer, bytes); }
    },
    start() {
      previous = performance.now(); layoutPhase = null;
      measurement = { startedAt: previous, maxRafGapMs: 0, frames: 0, layout: [], tabActions: [], samplingMs: 0 };
    },
    phase(name) { layoutPhase = name; sampleLayout(performance.now()); },
    stop() {
      sampleLayout(performance.now());
      const result = measurement; measurement = null; layoutPhase = null; return result;
    },
    snapshot() {
      return {
        at: performance.now(), longTasks: { ...longTasks }, nativeCosts: structuredClone(nativeCosts), resizeTrace: resizeTrace.slice(),
        maxSockets, socketEvents: socketEvents.slice(),
        receivedBytes, cursorGaps, streams: [...streams.values()].map(({ lineTail, ...stream }) => stream), replays: [...replays.values()],
        inProgress: measurement ? { ...measurement, phase: layoutPhase } : null,
        sockets: [...sockets].filter(s => s.readyState === 0 || s.readyState === 1).length,
        terminals: [...terminals.values()].filter(t => t.host?.isConnected).map(t => ({
          paneID: t.host.closest(".pane-shell")?.dataset.paneId, cols: t.cols, rows: t.rows,
          configuredScrollbackBytes: t.scrollbackBytes,
          historyRows: t.native.ghostty_terminal_get_scrollback_length(t.handle),
        })),
        wasmMemoryBytes: [...new Set([...terminals.values()].map(t => t.native.memory))].reduce((n, m) => n + m.buffer.byteLength, 0),
        canvasPixels: [...document.querySelectorAll("canvas")].reduce((n, c) => n + c.width * c.height, 0),
        runtime: { ...(window.__webshellTerminalPerformance?.counters || window.__webshellTerminalPerformance || {}) },
      };
    },
  };
}
