package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestTerminalSizeSyncBehavior(t *testing.T) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is required for JavaScript terminal size behavior tests")
	}
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}
	modulePath := filepath.Join(workingDirectory, "runtime", "static", "terminal_size_sync.js")
	runnerPath := filepath.Join(t.TempDir(), "terminal_size_sync_test.mjs")
	runner := `
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const {
  shouldSendTerminalSize,
  terminalSizeDiffersFromServer,
} = await import(pathToFileURL(modulePath).href);

const mobileSize = { cols: 52, rows: 24 };
assert.equal(shouldSendTerminalSize({
  ...mobileSize,
  lastSentCols: 52,
  lastSentRows: 24,
}), false, "unchanged size should stay deduplicated within one client");
assert.equal(shouldSendTerminalSize({
  ...mobileSize,
  lastSentCols: 52,
  lastSentRows: 24,
  force: true,
}), true, "mobile must reclaim a PTY resized by another client");
assert.equal(terminalSizeDiffersFromServer({
  ...mobileSize,
  serverCols: 160,
  serverRows: 48,
}), true, "PC-sized shared PTY must be observable from mobile");
assert.equal(terminalSizeDiffersFromServer({
  ...mobileSize,
  serverCols: 52,
  serverRows: 24,
}), false);
assert.equal(shouldSendTerminalSize({
  cols: 0,
  rows: 24,
  force: true,
}), false, "invalid terminal geometry must never be sent");
`
	if err := os.WriteFile(runnerPath, []byte(runner), 0o600); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", runnerPath, err)
	}
	command := exec.Command(nodePath, runnerPath, modulePath)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal size sync behavior failed: %v\n%s", err, output)
	}
}
