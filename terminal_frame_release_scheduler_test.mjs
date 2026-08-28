import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalFrameReleaseScheduler } from "./runtime/static/terminal_frame_release_scheduler.js";

const createHarness = () => {
  let nextHandle = 1;
  const frames = new Map();
  const releases = [];
  const scheduler = createTerminalFrameReleaseScheduler({
    requestFrame: (callback) => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => frames.delete(handle),
  });
  const runFrame = () => {
    const callbacks = Array.from(frames.values());
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  return { scheduler, frames, releases, runFrame };
};

test("held terminal frame survives one paint opportunity before release", () => {
  const harness = createHarness();
  const pane = {};
  harness.scheduler.schedule(pane, {
    shouldRelease: () => true,
    release: () => harness.releases.push("released"),
  });

  harness.runFrame();
  assert.deepEqual(harness.releases, []);
  assert.equal(harness.frames.size, 1);

  harness.runFrame();
  assert.deepEqual(harness.releases, ["released"]);
});

test("a new presentation hold cancels a pending frame release", () => {
  const harness = createHarness();
  const pane = {};
  harness.scheduler.schedule(pane, {
    shouldRelease: () => true,
    release: () => harness.releases.push("stale"),
  });
  harness.runFrame();
  harness.scheduler.cancel(pane);
  harness.runFrame();

  assert.deepEqual(harness.releases, []);
});

test("latest frame release supersedes an older callback", () => {
  const harness = createHarness();
  const pane = {};
  harness.scheduler.schedule(pane, {
    shouldRelease: () => true,
    release: () => harness.releases.push("old"),
  });
  harness.scheduler.schedule(pane, {
    shouldRelease: () => true,
    release: () => harness.releases.push("new"),
  });
  harness.runFrame();
  harness.runFrame();

  assert.deepEqual(harness.releases, ["new"]);
});

test("release guard keeps the last-known-good frame when presentation changed", () => {
  const harness = createHarness();
  const pane = {};
  let current = true;
  harness.scheduler.schedule(pane, {
    shouldRelease: () => current,
    release: () => harness.releases.push("released"),
  });
  harness.runFrame();
  current = false;
  harness.runFrame();

  assert.deepEqual(harness.releases, []);
});
