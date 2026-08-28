import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalConnectionScheduler } from "./runtime/static/terminal_connection_scheduler.js";

const createHarness = ({ capacity = 3, online = true } = {}) => {
  let clock = 1000;
  let nextTimer = 1;
  const timers = new Map();
  const connections = [];
  const disconnections = [];
  const scheduler = createTerminalConnectionScheduler({
    capacity,
    now: () => clock,
    setTimer: (callback, delay) => {
      const id = nextTimer;
      nextTimer += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    retryDelay: (attempt) => 100 * (attempt + 1),
    connect: (session, lease) => connections.push({ session, lease }),
    disconnect: (session, reason, lease) => disconnections.push({ session, reason, lease }),
  });
  scheduler.setOnline(online);
  return {
    scheduler,
    connections,
    disconnections,
    timers,
    tick: (amount = 1) => { clock += amount; },
    runTimers: () => {
      const pending = Array.from(timers.values());
      timers.clear();
      for (const timer of pending) {
        timer.callback();
      }
    },
  };
};

const session = (id) => ({ id });
const demand = (priority, extra = {}) => ({ priority, generation: 1, ...extra });

test("scheduler does not require iterator helper methods", () => {
  const mapValues = Map.prototype.values;
  Map.prototype.values = function valuesWithoutIteratorHelpers() {
    const iterator = mapValues.call(this);
    return {
      next: () => iterator.next(),
      [Symbol.iterator]() {
        return this;
      },
    };
  };
  try {
    const harness = createHarness({ capacity: 1 });
    harness.scheduler.setGeneration(1);
    const pane = session("pane");
    harness.scheduler.register(pane);
    harness.scheduler.request(pane, demand(1));
    assert.equal(harness.connections.length, 1);
  } finally {
    Map.prototype.values = mapValues;
  }
});

test("never grants more than capacity and connecting leases occupy slots", () => {
  const harness = createHarness();
  harness.scheduler.setGeneration(1);
  const sessions = Array.from({ length: 6 }, (_, index) => session(`s${index}`));
  sessions.forEach((item) => {
    harness.scheduler.register(item);
    harness.scheduler.request(item, demand(4));
  });
  assert.equal(harness.connections.length, 3);
  assert.equal(harness.scheduler.snapshot().activeCount, 3);
  assert.equal(harness.scheduler.snapshot().counts.connecting, 3);
  assert.equal(harness.scheduler.snapshot().capacityInvariantViolations, 0);
});

test("capacity can shrink from three direct channels to two fast channels", () => {
  const harness = createHarness({ capacity: 3 });
  harness.scheduler.setGeneration(1);
  const panes = [session("pane-1"), session("pane-2"), session("pane-3")];
  panes.forEach((pane, index) => {
    harness.scheduler.register(pane);
    harness.scheduler.request(pane, demand(index + 1));
  });
  assert.equal(harness.scheduler.snapshot().activeCount, 3);
  harness.scheduler.setCapacity(2);
  assert.equal(harness.disconnections.length, 1);
  assert.equal(harness.disconnections[0].reason, "capacity_reduced");
  assert.equal(harness.scheduler.snapshot().activeCount, 3, "closing lease still occupies the old slot");
  harness.scheduler.notifyClosed(
    harness.disconnections[0].session,
    harness.disconnections[0].lease.leaseID,
    { reason: "capacity_reduced" },
  );
  assert.equal(harness.scheduler.snapshot().capacity, 2);
  assert.equal(harness.scheduler.snapshot().activeCount, 2);
});

test("active pane preempts the lowest-priority background lease", () => {
  const harness = createHarness();
  harness.scheduler.setGeneration(1);
  const low = [session("low-1"), session("low-2"), session("low-3")];
  low.forEach((item, index) => {
    harness.scheduler.register(item);
    harness.scheduler.request(item, demand(index === 2 ? 4 : 3));
  });
  const active = session("active");
  harness.scheduler.register(active);
  harness.scheduler.request(active, demand(1, { lastUserInteractionAt: 2000 }));
  assert.equal(harness.disconnections.length, 1);
  assert.equal(harness.disconnections[0].session, low[2]);
  assert.equal(harness.disconnections[0].reason, "scheduler_preempt");
  assert.equal(harness.connections.length, 3, "closing slot remains occupied");
  harness.scheduler.notifyClosed(low[2], harness.disconnections[0].lease.leaseID);
  assert.equal(harness.connections.at(-1).session, active);
});

test("visible panes rank above background panes", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const background = session("background");
  const visible = session("visible");
  harness.scheduler.register(background);
  harness.scheduler.register(visible);
  harness.scheduler.request(background, demand(4));
  harness.scheduler.request(visible, demand(2));
  assert.equal(harness.connections[0].session, background);
  harness.scheduler.release(background);
  harness.scheduler.notifyClosed(background, harness.disconnections[0].lease.leaseID);
  assert.equal(harness.connections.at(-1).session, visible);
});

test("a visible P2 pane preempts a background P3 lease", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const background = session("background");
  const visible = session("visible");
  harness.scheduler.register(background);
  harness.scheduler.register(visible);
  harness.scheduler.request(background, demand(3));
  harness.scheduler.request(visible, demand(2));
  assert.equal(harness.disconnections[0].session, background);
  assert.equal(harness.disconnections[0].reason, "scheduler_preempt");
});

test("four visible panes keep only three leases and clicking the fourth preempts one", () => {
  const harness = createHarness();
  harness.scheduler.setGeneration(1);
  const panes = Array.from({ length: 4 }, (_, index) => session(`pane-${index}`));
  panes.forEach((pane, index) => {
    harness.scheduler.register(pane);
    harness.scheduler.request(pane, demand(index === 0 ? 1 : 2, { lastBecameVisibleAt: 100 + index }));
  });
  assert.equal(harness.connections.length, 3);
  assert.equal(harness.connections.some(({ session: connected }) => connected === panes[3]), false);
  harness.scheduler.request(panes[3], demand(0, { immediate: true, lastUserInteractionAt: 5000 }));
  assert.equal(harness.disconnections.length, 1);
  harness.scheduler.notifyClosed(harness.disconnections[0].session, harness.disconnections[0].lease.leaseID);
  assert.equal(harness.connections.at(-1).session, panes[3]);
  assert.equal(harness.scheduler.snapshot().activeCount, 3);
});

test("equal-priority requests do not churn healthy leases", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const first = session("first");
  const second = session("second");
  harness.scheduler.register(first);
  harness.scheduler.register(second);
  harness.scheduler.request(first, demand(2, { lastUserInteractionAt: 1 }));
  harness.scheduler.request(second, demand(2, { lastUserInteractionAt: 9999 }));
  assert.equal(harness.disconnections.length, 0);
  assert.equal(harness.scheduler.currentLease(first)?.leaseID, 1);
});

test("stale generation demand is ignored after a rapid tab switch", () => {
  const harness = createHarness({ capacity: 1 });
  const stale = session("stale");
  const current = session("current");
  harness.scheduler.register(stale);
  harness.scheduler.register(current);
  harness.scheduler.setGeneration(2);
  harness.scheduler.request(stale, demand(0, { generation: 1 }));
  harness.scheduler.request(current, demand(1, { generation: 2 }));
  assert.deepEqual(harness.connections.map(({ session: item }) => item), [current]);
});

test("preempted sessions become parked without backoff", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const background = session("background");
  const active = session("active");
  harness.scheduler.register(background);
  harness.scheduler.register(active);
  harness.scheduler.request(background, demand(4));
  harness.scheduler.request(active, demand(0));
  harness.scheduler.notifyClosed(background, harness.disconnections[0].lease.leaseID);
  const state = harness.scheduler.snapshot().sessions.find(({ session: item }) => item === background);
  assert.equal(state.status, "parked");
  assert.equal(harness.timers.size, 0);
});

test("the only surviving preempted session reclaims the Fast slot when the active lease closes", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const survivor = session("survivor");
  const replacement = session("replacement");
  harness.scheduler.register(survivor);
  harness.scheduler.register(replacement);
  harness.scheduler.request(survivor, demand(4));
  harness.scheduler.request(replacement, demand(0));
  const closingLease = harness.disconnections[0].lease.leaseID;
  harness.scheduler.notifyClosed(survivor, 1);
  assert.equal(harness.scheduler.currentLease(replacement)?.leaseID, 2);
  harness.scheduler.unregister(replacement, "session_closed");
  harness.scheduler.notifyClosed(replacement, closingLease + 1, { reason: "session_closed" });
  assert.equal(harness.connections.at(-1).session, survivor);
  assert.equal(harness.scheduler.snapshot().sessions.find(({ session: item }) => item === survivor).status, "connecting");
});

test("a pane reactivated before its preempt close immediately queues again", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const first = session("first");
  const second = session("second");
  harness.scheduler.register(first);
  harness.scheduler.register(second);
  harness.scheduler.request(first, demand(4));
  harness.scheduler.request(second, demand(0));
  const closingLease = harness.disconnections[0].lease.leaseID;
  harness.scheduler.setGeneration(2);
  harness.scheduler.request(first, demand(1, { generation: 2, immediate: true }));
  harness.scheduler.request(second, demand(3, { generation: 2 }));
  harness.scheduler.notifyClosed(first, closingLease);
  assert.equal(harness.connections.at(-1).session, first);
});

test("network failure enters backoff and queues again after the timer", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const pane = session("pane");
  harness.scheduler.register(pane);
  harness.scheduler.request(pane, demand(1));
  const leaseID = harness.scheduler.currentLease(pane).leaseID;
  assert.equal(harness.scheduler.notifyFailure(pane, leaseID, new Error("network")), true);
  assert.equal(harness.scheduler.snapshot().counts.backoff, 1);
  assert.equal(harness.timers.size, 1);
  harness.runTimers();
  assert.equal(harness.connections.length, 2);
});

test("parked sessions do not start retry timers", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const active = session("active");
  const parked = session("parked");
  harness.scheduler.register(active);
  harness.scheduler.register(parked);
  harness.scheduler.request(active, demand(1));
  harness.scheduler.request(parked, demand(4));
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.scheduler.snapshot().sessions.find(({ session: item }) => item === parked).status, "queued");
});

test("offline blocks connects and online grants only the top three", () => {
  const harness = createHarness({ online: false });
  harness.scheduler.setGeneration(1);
  const panes = Array.from({ length: 5 }, (_, index) => session(`pane-${index}`));
  panes.forEach((pane, index) => {
    harness.scheduler.register(pane);
    harness.scheduler.request(pane, demand(index));
  });
  assert.equal(harness.connections.length, 0);
  harness.scheduler.setOnline(true);
  assert.deepEqual(harness.connections.map(({ session: item }) => item), panes.slice(0, 3));
});

test("closing slots remain occupied until close confirmation", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const oldPane = session("old");
  const newPane = session("new");
  harness.scheduler.register(oldPane);
  harness.scheduler.register(newPane);
  harness.scheduler.request(oldPane, demand(4));
  harness.scheduler.request(newPane, demand(0));
  assert.equal(harness.connections.length, 1);
  assert.equal(harness.scheduler.snapshot().counts.closing, 1);
  harness.scheduler.notifyClosed(oldPane, harness.disconnections[0].lease.leaseID);
  assert.equal(harness.connections.length, 2);
});

test("late callbacks from an old lease are ignored", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const pane = session("pane");
  harness.scheduler.register(pane);
  harness.scheduler.request(pane, demand(1));
  const firstLease = harness.scheduler.currentLease(pane).leaseID;
  harness.scheduler.notifyFailure(pane, firstLease, new Error("first"));
  harness.runTimers();
  const secondLease = harness.scheduler.currentLease(pane).leaseID;
  assert.notEqual(firstLease, secondLease);
  assert.equal(harness.scheduler.notifyOpen(pane, firstLease), false);
  assert.equal(harness.scheduler.notifyClosed(pane, firstLease), false);
  assert.equal(harness.scheduler.currentLease(pane).leaseID, secondLease);
});

test("physical transport invalidation clears leases without disconnecting dead sockets", () => {
  const harness = createHarness({ capacity: 2 });
  harness.scheduler.setGeneration(1);
  const panes = [session("pane-1"), session("pane-2")];
  panes.forEach((pane) => {
    harness.scheduler.register(pane);
    harness.scheduler.request(pane, demand(1));
  });
  assert.equal(harness.scheduler.snapshot().activeCount, 2);
  assert.equal(harness.scheduler.invalidateTransport("network_resume"), true);
  assert.equal(harness.disconnections.length, 0);
  assert.equal(harness.scheduler.snapshot().activeCount, 0);
  assert.equal(harness.timers.size, 2);
  harness.runTimers();
  assert.equal(harness.connections.length, 4);
});

test("physical transport immediate invalidation clears backoff and reconnects in the same task", () => {
  const harness = createHarness({ capacity: 2 });
  harness.scheduler.setGeneration(1);
  const panes = [session("pane-1"), session("pane-2")];
  panes.forEach((pane) => {
    harness.scheduler.register(pane);
    harness.scheduler.request(pane, demand(1));
  });
  assert.equal(harness.scheduler.invalidateTransport("unified_closed", { immediate: true }), true);
  assert.equal(harness.scheduler.snapshot().counts.backoff, 0);
  assert.equal(harness.scheduler.snapshot().activeCount, 2);
  assert.equal(harness.connections.length, 4);
});

test("unregister clears demand and retry timers", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const pane = session("pane");
  harness.scheduler.register(pane);
  harness.scheduler.request(pane, demand(1));
  const leaseID = harness.scheduler.currentLease(pane).leaseID;
  harness.scheduler.notifyFailure(pane, leaseID, new Error("network"));
  assert.equal(harness.timers.size, 1);
  harness.scheduler.unregister(pane);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.scheduler.snapshot().sessions.length, 0);
});

test("unregister waits for a closing lease before removing the record", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const pane = session("pane");
  harness.scheduler.register(pane);
  harness.scheduler.request(pane, demand(1));
  const leaseID = harness.scheduler.currentLease(pane).leaseID;
  harness.scheduler.unregister(pane);
  assert.equal(harness.scheduler.snapshot().activeCount, 1);
  assert.equal(harness.scheduler.snapshot().sessions[0].status, "releasing");
  harness.scheduler.notifyClosed(pane, leaseID);
  assert.equal(harness.scheduler.snapshot().sessions.length, 0);
});

test("user input promotes a parked pane to P0", () => {
  const harness = createHarness({ capacity: 1 });
  harness.scheduler.setGeneration(1);
  const active = session("active");
  const parked = session("parked");
  harness.scheduler.register(active);
  harness.scheduler.register(parked);
  harness.scheduler.request(active, demand(1));
  harness.scheduler.request(parked, demand(4));
  harness.tick(100);
  harness.scheduler.request(parked, demand(0, { immediate: true, reason: "user_input", lastUserInteractionAt: 5000 }));
  assert.equal(harness.disconnections[0].session, active);
  assert.equal(harness.disconnections[0].reason, "scheduler_preempt");
});
