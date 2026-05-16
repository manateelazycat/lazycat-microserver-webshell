package main

import (
	"os"
	"strings"
	"testing"
)

func TestRuntimeShortcutDefaultsGuardMacAndAltMappings(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const isMacPlatform = () => {",
		"navigator.userAgentData?.platform",
		"const macShortcut = (mac, fallback) => isMacPlatform() ? mac : fallback;",
		`command: "super",`,
		`cmd: "super",`,
		`option: "alt",`,
		"const shortcutKeyFromEventCode = (event) => {",
		"if (isMacPlatform() && event.altKey) {",
		"key = shortcutKeyFromEventCode(event) || key;",
		`copy_terminal: macShortcut("Command + c", "Ctrl + Shift + c"),`,
		`paste_terminal: macShortcut("Command + v", "Ctrl + Shift + v"),`,
		`last_tab: macShortcut("Option + 0", "Alt + 0"),`,
		`select_up: macShortcut("Option + k", "Alt + k"),`,
		`select_down: macShortcut("Option + j", "Alt + j"),`,
		`select_left: macShortcut("Option + h", "Alt + h"),`,
		`select_right: macShortcut("Option + l", "Alt + l"),`,
		`close_pane: macShortcut("Ctrl + Option + q", "Ctrl + Alt + q"),`,
		"shortcutDefinitions[`tab_${index}`] = macShortcut(`Option + ${index}`, `Alt + ${index}`);",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime shortcut guard missing %q", want)
		}
	}
}

func TestRuntimeShortcutSettingsGuardDesktopShortcutEditor(t *testing.T) {
	for _, path := range []string{"runtime/static/index.html", "runtime/static/main.js"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile(%s) error = %v", path, err)
		}
		source := string(data)
		wantSnippets := map[string][]string{
			"runtime/static/index.html": {
				`data-settings-tab="desktop-shortcuts">PC快捷键设置`,
				`id="settingsDesktopShortcutAddButton"`,
				`id="settingsDesktopShortcutResetButton"`,
				`id="settingsDesktopShortcutList"`,
				`id="desktopShortcutEditor"`,
				`id="desktopShortcutCaptureInput"`,
			},
			"runtime/static/main.js": {
				`const settingsDesktopShortcutAddButton = document.getElementById("settingsDesktopShortcutAddButton");`,
				`const defaultDesktopShortcutsConfig = [`,
				`const rebuildShortcutActionMap = () => {`,
				`body: JSON.stringify({ desktop_shortcuts: reset ? null : serializeDesktopShortcuts(nextShortcuts) }),`,
				`settingsDesktopShortcutAddButton?.addEventListener("click", () => openDesktopShortcutEditor({ index: -1 }));`,
				`submitDesktopShortcutEditor();`,
			},
		}
		for _, want := range wantSnippets[path] {
			if !strings.Contains(source, want) {
				t.Fatalf("%s desktop shortcut guard missing %q", path, want)
			}
		}
	}
}
