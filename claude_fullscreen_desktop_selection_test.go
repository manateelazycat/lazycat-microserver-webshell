package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestClaudeFullscreenDesktopSelectionBehavior(t *testing.T) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is required for JavaScript desktop selection behavior tests")
	}
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}
	modulePath := filepath.Join(workingDirectory, "runtime", "static", "claude_fullscreen_desktop_selection_adapter.js")
	runnerPath := filepath.Join(t.TempDir(), "claude_fullscreen_desktop_selection_test.mjs")
	runner := `
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const {
  installClaudeFullscreenDesktopSelectionAdapter,
  isClaudeFullscreenDesktopSelectionCandidate,
} = await import(pathToFileURL(modulePath).href);

assert.equal(isClaudeFullscreenDesktopSelectionCandidate(
  { command: "claude" },
  { mouseTracking: true, button: 0 },
), true, "Claude fullscreen primary mouse input must support local selection");
assert.equal(isClaudeFullscreenDesktopSelectionCandidate(
  { command: "claude" },
  { mouseTracking: false, button: 0 },
), false, "Claude default mode must preserve the existing selection path");
assert.equal(isClaudeFullscreenDesktopSelectionCandidate(
  { command: "codex" },
  { mouseTracking: true, button: 0 },
), false, "Codex must not inherit Claude desktop selection behavior");
assert.equal(isClaudeFullscreenDesktopSelectionCandidate(
  { command: "grok" },
  { mouseTracking: true, button: 0 },
), false, "Grok must not inherit Claude desktop selection behavior");
assert.equal(isClaudeFullscreenDesktopSelectionCandidate(
  { command: "claude" },
  { mouseTracking: true, button: 2 },
), false, "secondary mouse input belongs to the context menu adapter");
assert.equal(isClaudeFullscreenDesktopSelectionCandidate(
  { command: "claude" },
  { mouseTracking: true, button: 0, touchSelectionLayout: true },
), false, "mobile and wide-touch layouts must keep their touch selection state machine");
assert.equal(isClaudeFullscreenDesktopSelectionCandidate(
  { command: "claude" },
  { mouseTracking: true, button: 0, applicationModifier: true },
), false, "Ctrl, Alt, and Meta mouse input must remain available to Claude");

class FakeEventTarget {
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

const event = (type, values = {}) => ({ type, button: 0, buttons: 0, clientX: 10, clientY: 10, ...values });
const shell = new FakeEventTarget();
const documentTarget = new FakeEventTarget();
globalThis.document = documentTarget;
const claimed = [];
const clicks = [];
const cleanups = [];
installClaudeFullscreenDesktopSelectionAdapter({
  shell,
  shouldStart: (input) => input.button === 0 && input.local !== false,
  claimEvent: (input) => claimed.push(input.type),
  sendClick: (input) => clicks.push(input),
  registerCleanup: (callback) => cleanups.push(callback),
  moveThresholdPx: 4,
});

shell.emit("mousedown", event("mousedown", { buttons: 1, shiftKey: true }));
documentTarget.emit("mousemove", event("mousemove", { buttons: 1, clientX: 12, clientY: 11 }));
documentTarget.emit("mouseup", event("mouseup", { clientX: 12, clientY: 11 }));
shell.emit("click", event("click", { clientX: 12, clientY: 11 }));
assert.deepEqual(claimed, ["mousedown", "mousemove", "mouseup", "click"]);
assert.equal(clicks.length, 1, "a primary tap must still reach Claude");
assert.deepEqual(clicks[0], {
  clientX: 10,
  clientY: 10,
  shiftKey: true,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

shell.emit("mousedown", event("mousedown", { buttons: 1 }));
documentTarget.emit("mousemove", event("mousemove", { buttons: 1, clientX: 20, clientY: 20 }));
documentTarget.emit("mouseup", event("mouseup", { clientX: 20, clientY: 20 }));
shell.emit("click", event("click", { clientX: 20, clientY: 20 }));
assert.equal(clicks.length, 1, "a drag must stay local instead of sending a Claude click");
assert.deepEqual(claimed.slice(4), ["mousedown", "mousemove", "mouseup"]);

shell.emit("mousedown", event("mousedown", { button: 2, buttons: 2 }));
documentTarget.emit("mousemove", event("mousemove", { button: 2, buttons: 2, clientX: 30, clientY: 30 }));
documentTarget.emit("mouseup", event("mouseup", { button: 2, clientX: 30, clientY: 30 }));
assert.equal(claimed.length, 7, "secondary mouse input must remain isolated");

shell.emit("mousedown", event("mousedown", { buttons: 1, local: false }));
documentTarget.emit("mousemove", event("mousemove", { buttons: 1, clientX: 30, clientY: 30 }));
documentTarget.emit("mouseup", event("mouseup", { clientX: 30, clientY: 30 }));
assert.equal(claimed.length, 7, "unmatched tools must remain on the generic mouse path");

cleanups.forEach((callback) => callback());
shell.emit("mousedown", event("mousedown", { buttons: 1 }));
assert.equal(claimed.length, 7, "cleanup must detach the desktop selection adapter");
`
	if err := os.WriteFile(runnerPath, []byte(runner), 0o600); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", runnerPath, err)
	}
	command := exec.Command(nodePath, runnerPath, modulePath)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("Claude fullscreen desktop selection behavior failed: %v\n%s", err, output)
	}
}
