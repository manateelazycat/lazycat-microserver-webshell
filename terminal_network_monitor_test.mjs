import assert from "node:assert/strict";
import test from "node:test";

import {
  createTerminalNetworkMonitor,
  terminalNetworkMegabytes,
  terminalNetworkPayloadBytes,
} from "./runtime/static/terminal_network_monitor.js";

class FakeWebSocket {
  constructor(readyState = 0) {
    this.readyState = readyState;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 2;
  }

  dispatch(type, event = {}) {
    for (const listener of Array.from(this.listeners.get(type) || [])) {
      listener({ type, target: this, ...event });
    }
  }
}

test("network monitor counts UTF-8 and binary WebSocket payload bytes in decimal MB", () => {
  assert.equal(terminalNetworkPayloadBytes("终端"), 6);
  assert.equal(terminalNetworkPayloadBytes(new Uint8Array([1, 2, 3])), 3);
  assert.equal(terminalNetworkPayloadBytes(new ArrayBuffer(4)), 4);
  assert.equal(terminalNetworkMegabytes(1_500_000), 1.5);
});

test("unified targets keep physical totals without rendering a duplicate channel row", () => {
  let now = 0;
  const monitor = createTerminalNetworkMonitor({ layout: "unified", now: () => now });
  const unified = new FakeWebSocket(1);
  assert.equal(monitor.attachSocket(unified, { kind: "unified" }).index, 0);
  assert.equal(monitor.attachSocket(new FakeWebSocket(1), { kind: "unified" }), null);
  const openState = monitor.snapshot();
  assert.equal(openState.layout, "unified");
  assert.equal(openState.status, "open");
  assert.deepEqual(openState.channels, []);
  unified.send("hello");
  unified.dispatch("message", { data: new Uint8Array([1, 2, 3]).buffer });
  assert.deepEqual(monitor.snapshot().channels, []);
  now = 1000;
  const state = monitor.sample();
  assert.equal(state.sentBytes, 5);
  assert.equal(state.receivedBytes, 3);
  assert.equal(state.totalBytes, 8);
});

test("monitor summary status distinguishes healthy, abnormal, connecting, and retrying sockets", () => {
  const monitor = createTerminalNetworkMonitor({ layout: "unified", now: () => 0 });
  const socket = new FakeWebSocket(0);
  monitor.attachSocket(socket, { kind: "unified" });
  assert.equal(monitor.snapshot().status, "connecting");
  socket.readyState = 1;
  socket.dispatch("open");
  assert.equal(monitor.snapshot().status, "open");
  socket.dispatch("error");
  assert.equal(monitor.snapshot().status, "error");

  const retryMonitor = createTerminalNetworkMonitor({ layout: "unified", now: () => 0 });
  const retrySocket = new FakeWebSocket(1);
  retryMonitor.attachSocket(retrySocket, { kind: "unified" });
  retrySocket.close();
  assert.equal(retryMonitor.snapshot().status, "retrying");
});

test("disposing the monitor removes listeners and restores WebSocket methods without further counting", () => {
  let now = 0;
  const socket = new FakeWebSocket(1);
  const originalSend = socket.send;
  const originalClose = socket.close;
  const monitor = createTerminalNetworkMonitor({ layout: "direct", now: () => now });
  monitor.attachSocket(socket, { kind: "fast" });
  socket.send("before");
  socket.dispatch("message", { data: "before" });
  socket.close();
  assert.equal(monitor.snapshot().channels[0].state, "closing");
  monitor.dispose();

  assert.equal(socket.send, originalSend);
  assert.equal(socket.close, originalClose);
  socket.send("after");
  socket.dispatch("message", { data: "after" });
  now = 1000;
  const state = monitor.sample();
  assert.equal(state.totalBytes, 12);
});

test("direct targets expose three direct channels instead of a queue slot", () => {
  const monitor = createTerminalNetworkMonitor({ layout: "direct", now: () => 0 });
  const sockets = [new FakeWebSocket(1), new FakeWebSocket(1), new FakeWebSocket(1)];
  for (const socket of sockets) {
    assert.ok(monitor.attachSocket(socket, { kind: "fast" }));
  }
  assert.equal(monitor.attachSocket(new FakeWebSocket(1), { kind: "fast" }), null);
  assert.deepEqual(monitor.snapshot().channels.map((channel) => channel.label), [
    "直连通道 1",
    "直连通道 2",
    "直连通道 3",
  ]);
});

test("stable monitor slots replace a closing socket without losing channel counters", () => {
  let now = 0;
  const monitor = createTerminalNetworkMonitor({ layout: "direct", now: () => now });
  const oldSocket = new FakeWebSocket(1);
  const newSocket = new FakeWebSocket(1);
  monitor.attachSocket(oldSocket, { kind: "fast", slot: 0 });
  oldSocket.send("old");
  monitor.attachSocket(newSocket, { kind: "fast", slot: 0 });
  newSocket.send("new");
  newSocket.dispatch("message", { data: new Uint8Array([1, 2]).buffer });
  now = 1000;
  const state = monitor.sample();
  assert.equal(state.channels[0].active, true);
  assert.equal(state.channels[0].totalBytes, 8);
  assert.equal(state.channels[0].sentBytes, 6);
  assert.equal(state.channels[0].receivedBytes, 2);
});
