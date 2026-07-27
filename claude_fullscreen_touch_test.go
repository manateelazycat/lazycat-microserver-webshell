package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestClaudeFullscreenTouchBehavior(t *testing.T) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is required for JavaScript touch behavior tests")
	}
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}
	statePath := filepath.Join(workingDirectory, "runtime", "static", "claude_fullscreen_touch.js")
	adapterPath := filepath.Join(workingDirectory, "runtime", "static", "claude_fullscreen_touch_adapter.js")
	runnerPath := filepath.Join(t.TempDir(), "claude_fullscreen_touch_test.mjs")
	runner := `
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [statePath, adapterPath] = process.argv.slice(2);
const stateModule = await import(pathToFileURL(statePath).href);
const adapterModule = await import(pathToFileURL(adapterPath).href);
const {
  createClaudeFullscreenTouchGesture,
  isClaudeTerminalIdentity,
  resolveClaudeFullscreenTouchCompletion,
} = stateModule;
const { installClaudeFullscreenTouchAdapter } = adapterModule;

assert.equal(isClaudeTerminalIdentity({ command: "/usr/local/bin/claude" }), true);
assert.equal(isClaudeTerminalIdentity({
  processCommandLine: "node /opt/lib/node_modules/@anthropic-ai/claude-code/cli.js",
}), true);
assert.equal(isClaudeTerminalIdentity({
  processCommandLine: "/home/test/.local/share/claude/versions/1.2.3",
}), true);
assert.equal(isClaudeTerminalIdentity({ title: "Claude Code" }), true);
assert.equal(isClaudeTerminalIdentity({ command: "codex", title: "Codex" }), false);
assert.equal(isClaudeTerminalIdentity({ command: "grok", title: "Grok" }), false);
assert.equal(isClaudeTerminalIdentity({ command: "claude-helper", title: "shell" }), false);

const gesture = createClaudeFullscreenTouchGesture({ moveThresholdPx: 8 });
gesture.start({ identifier: 1, clientX: 20, clientY: 100 });
assert.equal(gesture.snapshot().phase, "pending");
gesture.move({ identifier: 1, clientX: 20, clientY: 70 });
assert.equal(gesture.snapshot().phase, "scrolling");
assert.equal(gesture.takeWheelSteps(10), 3);
assert.equal(gesture.finish(1), "scrolling");

gesture.start({ identifier: 2, clientX: 10, clientY: 10 });
assert.equal(gesture.beginSelection(), true);
assert.equal(gesture.snapshot().phase, "selecting");
assert.equal(gesture.finish(2), "selecting");
assert.equal(resolveClaudeFullscreenTouchCompletion("tap", { keyboardClaimed: true }), "keyboard");
assert.equal(resolveClaudeFullscreenTouchCompletion("tap", { keyboardClaimed: false }), "tap");

globalThis.window = globalThis;

class FakeShell {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  emit(type, event) {
    for (const listener of [...(this.listeners.get(type) || [])]) {
      listener(event);
    }
  }
}

const touch = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
const touchEvent = (type, { touches = [], changedTouches = [], keyboardClaimed = false } = {}) => ({
  type,
  touches,
  changedTouches,
  keyboardClaimed,
  cancelable: true,
  preventDefaultCalls: 0,
  stopPropagationCalls: 0,
  stopImmediatePropagationCalls: 0,
  preventDefault() {
    this.preventDefaultCalls += 1;
  },
  stopPropagation() {
    this.stopPropagationCalls += 1;
  },
  stopImmediatePropagation() {
    this.stopImmediatePropagationCalls += 1;
  },
});

const createHarness = ({ longPressDelayMs = 1000, selected = false } = {}) => {
  const shell = new FakeShell();
  const cleanups = [];
  const state = {
    selected,
    prepared: 0,
    clicks: 0,
    wheelSteps: [],
    selections: [],
    selectionHandles: 0,
    blurred: 0,
    suppressed: 0,
  };
  installClaudeFullscreenTouchAdapter({
    shell,
    shouldStart: () => true,
    cellFromPoint: (clientX, clientY) => ({
      col: Math.floor(clientX / 10),
      row: Math.floor(clientY / 10),
      absoluteRow: Math.floor(clientY / 10),
    }),
    activatePane: () => {},
    markContextMenuCandidate: () => {},
    blurInput: () => {
      state.blurred += 1;
    },
    suppressTouchScroll: () => {
      state.suppressed += 1;
    },
    applySelection: (start, end) => {
      state.selected = true;
      state.selections.push({ start, end });
    },
    updateSelectionHandles: () => {
      state.selectionHandles += 1;
    },
    updateSelectionAutoScroll: () => {},
    stopSelectionAutoScroll: () => {},
    clearSelectionIfTapOutside: () => false,
    hasSelection: () => state.selected,
    consumeKeyboardClaim: (event) => event.keyboardClaimed === true,
    prepareMouseInput: () => {
      state.prepared += 1;
    },
    rowHeight: () => 10,
    sendWheel: (steps) => {
      state.wheelSteps.push(steps);
    },
    sendClick: () => {
      state.clicks += 1;
    },
    registerCleanup: (callback) => cleanups.push(callback),
    moveThresholdPx: 8,
    longPressDelayMs,
  });
  return {
    shell,
    state,
    cleanup: () => cleanups.forEach((callback) => callback()),
  };
};

{
  const harness = createHarness();
  const point = touch(10, 20, 100);
  const start = touchEvent("touchstart", { touches: [point] });
  harness.shell.emit("touchstart", start);
  assert.equal(start.preventDefaultCalls, 0, "touchstart must preserve the iOS user gesture");
  const end = touchEvent("touchend", { changedTouches: [point] });
  harness.shell.emit("touchend", end);
  assert.equal(harness.state.clicks, 1);
  assert.equal(harness.state.prepared, 1);
  harness.cleanup();
}

{
  const harness = createHarness();
  const point = touch(11, 20, 100);
  harness.shell.emit("touchstart", touchEvent("touchstart", { touches: [point] }));
  const end = touchEvent("touchend", { changedTouches: [point], keyboardClaimed: true });
  harness.shell.emit("touchend", end);
  assert.equal(end.preventDefaultCalls, 0, "keyboard-owned touchend must not be cancelled by Claude");
  assert.equal(harness.state.clicks, 0, "keyboard-owned touchend must emit no click");
  assert.deepEqual(harness.state.wheelSteps, []);
  assert.equal(harness.state.prepared, 0, "keyboard-owned touchend must emit no mouse preparation");
  harness.cleanup();
}

{
  const harness = createHarness();
  const startPoint = touch(12, 20, 100);
  harness.shell.emit("touchstart", touchEvent("touchstart", { touches: [startPoint] }));
  harness.shell.emit("touchmove", touchEvent("touchmove", { touches: [touch(12, 20, 70)] }));
  harness.shell.emit("touchmove", touchEvent("touchmove", { touches: [touch(12, 20, 50)] }));
  harness.shell.emit("touchend", touchEvent("touchend", { changedTouches: [touch(12, 20, 50)] }));
  assert.deepEqual(harness.state.wheelSteps, [3, 2]);
  assert.equal(harness.state.clicks, 0);
  assert.equal(harness.state.prepared, 1, "one scroll gesture must reassert mouse size once");
  harness.cleanup();
}

{
  const harness = createHarness({ longPressDelayMs: 1 });
  const startPoint = touch(13, 20, 100);
  harness.shell.emit("touchstart", touchEvent("touchstart", { touches: [startPoint] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(harness.state.selections.length, 1, "long press must begin local selection");
  harness.shell.emit("touchmove", touchEvent("touchmove", { touches: [touch(13, 40, 120)] }));
  harness.shell.emit("touchend", touchEvent("touchend", { changedTouches: [touch(13, 40, 120)] }));
  assert.equal(harness.state.selections.length, 2);
  assert.equal(harness.state.selectionHandles, 1);
  assert.equal(harness.state.clicks, 0);
  assert.ok(harness.state.blurred > 0);
  harness.cleanup();
}

{
  const harness = createHarness({ selected: true });
  const point = touch(14, 20, 100);
  harness.shell.emit("touchstart", touchEvent("touchstart", { touches: [point] }));
  harness.shell.emit("touchend", touchEvent("touchend", { changedTouches: [point] }));
  assert.equal(harness.state.clicks, 0, "tap inside local selection must not reach the TUI");
  harness.cleanup();
}
`
	if err := os.WriteFile(runnerPath, []byte(runner), 0o600); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", runnerPath, err)
	}
	command := exec.Command(nodePath, runnerPath, statePath, adapterPath)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("Claude fullscreen touch behavior failed: %v\n%s", err, output)
	}
}
