import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalUnifiedHealthWatchdog } from "./runtime/static/terminal_unified_health.js";

const connection = ({ state = 1, lastPongAt = 0, pingResult = true } = {}) => {
  const calls = { ping: 0, close: [] };
  const value = {
    state,
    lastPongAt,
    calls,
    snapshot() {
      return {
        physicalReadyState: this.state,
        physicalLastPongAt: this.lastPongAt,
      };
    },
    ping() {
      calls.ping += 1;
      return pingResult;
    },
    close(code, reason) {
      calls.close.push([code, reason]);
      this.state = 2;
    },
  };
  return value;
};

const harness = (options = {}) => {
  let now = 1000;
  const disconnected = [];
  const unhealthy = [];
  const watchdog = createTerminalUnifiedHealthWatchdog({
    intervalMs: 4000,
    pongTimeoutMs: 12000,
    transitionTimeoutMs: 12000,
    now: () => now,
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
    onDisconnected: (reason, current) => disconnected.push([reason, current]),
    onUnhealthy: (reason, current) => unhealthy.push([reason, current]),
    ...options,
  });
  return {
    watchdog,
    disconnected,
    unhealthy,
    advance(ms) {
      now += ms;
      return now;
    },
    now: () => now,
  };
};

test("unified watchdog uses a four second check interval", () => {
  const { watchdog } = harness();
  watchdog.start();
  assert.equal(watchdog.snapshot().intervalMs, 4000);
  assert.equal(watchdog.snapshot().pongTimeoutMs, 12000);
  assert.equal(watchdog.snapshot().transitionTimeoutMs, 12000);
});

test("an open unified transport is not retried while pong remains healthy", () => {
  const { watchdog, disconnected, unhealthy, advance, now } = harness();
  const current = connection();
  watchdog.setConnection(current);
  assert.equal(watchdog.check().action, "ping");
  current.lastPongAt = now();
  advance(4000);
  assert.equal(watchdog.check().action, "ping");
  assert.equal(current.calls.close.length, 0);
  assert.equal(disconnected.length, 0);
  assert.equal(unhealthy.length, 0);
});

test("missing or closed unified transport requests recovery immediately", () => {
  const { watchdog, disconnected } = harness();
  assert.equal(watchdog.check("interval").action, "retry");
  const closed = connection({ state: 3 });
  watchdog.setConnection(closed);
  assert.equal(watchdog.check("interval").action, "retry");
  assert.deepEqual(disconnected.map(([reason]) => reason), [
    "unified_interval_missing",
    "unified_interval_closed",
  ]);
});

test("an open transport closes only after a real pong timeout", () => {
  const { watchdog, unhealthy, advance } = harness();
  const current = connection();
  watchdog.setConnection(current);
  assert.equal(watchdog.check().action, "ping");
  advance(4000);
  assert.equal(watchdog.check().action, "awaiting_pong");
  advance(8000);
  assert.equal(watchdog.check().action, "close");
  assert.deepEqual(current.calls.close, [[4001, "unified_pong_timeout"]]);
  assert.equal(unhealthy.length, 1);
});

test("connecting and closing transitions are tolerated until their deadline", () => {
  const { watchdog, advance } = harness();
  const current = connection({ state: 0 });
  watchdog.setConnection(current);
  advance(8000);
  assert.equal(watchdog.check().action, "waiting");
  advance(4000);
  assert.equal(watchdog.check().action, "close");
  assert.deepEqual(current.calls.close, [[4001, "unified_connect_timeout"]]);
});

test("paused background checks never close or retry a healthy transport", () => {
  let paused = true;
  const { watchdog, disconnected, advance } = harness({ isPaused: () => paused });
  const current = connection();
  watchdog.setConnection(current);
  advance(30000);
  assert.equal(watchdog.check().action, "paused");
  assert.equal(current.calls.ping, 0);
  assert.equal(current.calls.close.length, 0);
  assert.equal(disconnected.length, 0);
  paused = false;
  assert.equal(watchdog.probe("resume").action, "ping");
});

test("a failed physical ping closes once instead of entering a retry loop", () => {
  const { watchdog, unhealthy } = harness();
  const current = connection({ pingResult: false });
  watchdog.setConnection(current);
  assert.equal(watchdog.check().action, "close");
  assert.deepEqual(current.calls.close, [[4001, "unified_ping_failed"]]);
  assert.equal(unhealthy.length, 1);
});
