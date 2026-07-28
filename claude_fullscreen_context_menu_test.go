package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestClaudeFullscreenContextMenuBehavior(t *testing.T) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is required for JavaScript context menu behavior tests")
	}
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}
	modulePath := filepath.Join(workingDirectory, "runtime", "static", "claude_fullscreen_context_menu_adapter.js")
	runnerPath := filepath.Join(t.TempDir(), "claude_fullscreen_context_menu_test.mjs")
	runner := `
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const {
  installClaudeFullscreenContextMenuAdapter,
  isClaudeFullscreenContextMenuCandidate,
} = await import(pathToFileURL(modulePath).href);

assert.equal(isClaudeFullscreenContextMenuCandidate(
  { command: "claude" },
  { mouseTracking: true, button: 2 },
), true, "Claude fullscreen secondary click must stay local");
assert.equal(isClaudeFullscreenContextMenuCandidate(
  { command: "claude" },
  { mouseTracking: false, button: 2 },
), false, "Claude default mode must preserve the existing context menu path");
assert.equal(isClaudeFullscreenContextMenuCandidate(
  { command: "codex" },
  { mouseTracking: true, button: 2 },
), false, "Codex must not inherit the Claude context menu adapter");
assert.equal(isClaudeFullscreenContextMenuCandidate(
  { command: "claude" },
  { mouseTracking: true, button: 0 },
), false, "primary clicks must still reach Claude");
assert.equal(isClaudeFullscreenContextMenuCandidate(
  { command: "claude" },
  { mouseTracking: true, button: 2, contextMenuSuppressed: true },
), false, "touch-generated context menus must keep the mobile selection path");

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

const shell = new FakeEventTarget();
const documentTarget = new FakeEventTarget();
globalThis.document = documentTarget;
const claimed = [];
const cleanups = [];
installClaudeFullscreenContextMenuAdapter({
  shell,
  shouldStart: (event) => event.button === 2 && event.local !== false,
  claimEvent: (event) => claimed.push(event.type),
  registerCleanup: (callback) => cleanups.push(callback),
});

shell.emit("mousedown", { type: "mousedown", button: 0 });
assert.deepEqual(claimed, [], "left mouse input must not be claimed");
shell.emit("mousedown", { type: "mousedown", button: 2 });
documentTarget.emit("mousemove", { type: "mousemove", buttons: 2 });
documentTarget.emit("mouseup", { type: "mouseup", button: 2 });
shell.emit("contextmenu", { type: "contextmenu", button: 2 });
shell.emit("auxclick", { type: "auxclick", button: 2 });
assert.deepEqual(claimed, ["mousedown", "mousemove", "mouseup", "contextmenu", "auxclick"]);

shell.emit("mousedown", { type: "mousedown", button: 2, local: false });
documentTarget.emit("mousemove", { type: "mousemove", buttons: 2 });
documentTarget.emit("mouseup", { type: "mouseup", button: 2 });
assert.equal(claimed.length, 5, "unmatched sessions must stay on the generic mouse path");

cleanups.forEach((callback) => callback());
shell.emit("contextmenu", { type: "contextmenu", button: 2 });
assert.equal(claimed.length, 5, "cleanup must detach the Claude context menu adapter");
`
	if err := os.WriteFile(runnerPath, []byte(runner), 0o600); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", runnerPath, err)
	}
	command := exec.Command(nodePath, runnerPath, modulePath)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("Claude fullscreen context menu behavior failed: %v\n%s", err, output)
	}
}
