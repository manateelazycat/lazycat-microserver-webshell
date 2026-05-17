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

func TestRuntimeDefaultMobileShortcutOrder(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	tabSnippet := `{ id: "tab", label: "Tab", ariaLabel: "Tab", data: "\t", inputKey: "tab" },`
	returnSnippet := `{ id: "return", label: "Return", ariaLabel: "Return", data: "\r", inputKey: "enter", kind: "primary" },`
	tabIndex := strings.Index(source, tabSnippet)
	returnIndex := strings.Index(source, returnSnippet)
	if tabIndex < 0 || returnIndex < 0 || tabIndex > returnIndex {
		t.Fatalf("default mobile shortcut order should place Tab before Return")
	}
}

func TestRuntimeMobileReturnShortcutRepeats(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const touchShortcutRepeatInitialDelayMs = 320;`,
		`const touchShortcutRepeatIntervalMs = 80;`,
		`["enter", "arrow_up", "arrow_down", "arrow_left", "arrow_right"].includes(String(shortcut?.inputKey || ""))`,
		`repeatTimer = window.setInterval(() => {`,
		`triggerMobileShortcut(shortcut, shortcutSession || activeSession(), { feedback: false });`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile return repeat guard missing %q", want)
		}
	}
}

func TestRuntimeMobileStickyModifiersApplyToTextInput(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const shouldApplyMobileStickyTextInput = (value, inputType = "") => {`,
		`type === "insertFromPaste" || type.includes("Composition")`,
		`return canApplyStickyModifierInput(value);`,
		`const consumeMobileStickyTextInput = (value) => {`,
		`const encoded = applyStickyModifierInput(value, {`,
		`clearMobileSticky();`,
		`const focusMobileKeyboardFromShortcut = (session = activeSession()) => {`,
		`targetSession.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;`,
		`focusTerminalInput(targetSession);`,
		`const inputData = applySticky ? consumeMobileStickyTextInput(rawData) : rawData;`,
		`last?.data === rawData || last?.rawData === rawData`,
		`applySticky: shouldApplyMobileStickyTextInput(data, type),`,
		`applySticky: shouldApplyMobileStickyTextInput(value, type),`,
		`focusMobileKeyboardFromShortcut(session);`,
		`hasMobileStickyModifiers()`,
		`&& canApplyStickyModifierInput(event.key)`,
		`sendTerminalTextInput(session, event.key, { applySticky: true });`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile sticky modifier guard missing %q", want)
		}
	}
}

func TestRuntimeMobileIMECompositionPreviewVisible(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const terminalTextareaCompositionText = (session) => {`,
		`const compositionText = session.composingIME ? terminalTextareaCompositionText(session) : "";`,
		`const compositionColumns = Array.from(compositionText || " ").length;`,
		"textarea.style.width = `${Math.max(width, compositionColumns * width)}px`;",
		`textarea.style.outline = "0";`,
		`textarea.style.boxShadow = "none";`,
		`textarea.style.webkitAppearance = "none";`,
		`textarea.style.opacity = session.composingIME && compositionText ? "1" : "0";`,
		`textarea.style.color = session.composingIME && compositionText ? activeTheme.foreground : "transparent";`,
		`textarea.style.background = session.composingIME && compositionText ? activeTheme.background : "transparent";`,
		`if (event.data && terminalTextareaCompositionText(session) !== event.data) {`,
		`textarea.value = event.data;`,
		`const committedText = event.data || terminalTextareaCompositionText(session);`,
		`if (committedText) {`,
		`sendTerminalTextInput(session, committedText, { dedupe: true });`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile IME composition preview guard missing %q", want)
		}
	}
}

func TestRuntimeTouchShortcutLayoutKeepsDesktopPCHidden(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	mainWantSnippets := []string{
		`const mobileLayoutQuery = window.matchMedia?.("(max-width: 640px)");`,
		`const touchShortcutLayoutQuery = window.matchMedia?.("(hover: none), (pointer: coarse)");`,
		`const isMobileLayout = () => Boolean(mobileLayoutQuery?.matches);`,
		`const isTouchShortcutLayout = () => Boolean(touchShortcutLayoutQuery?.matches);`,
		`if (!mobileActionSheet || !mobileActionGrid || !isTouchShortcutLayout()) {`,
		`if (!isTouchShortcutLayout()) {`,
	}
	for _, want := range mainWantSnippets {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime touch shortcut guard missing %q", want)
		}
	}

	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)
	styleWantSnippets := []string{
		`@media (hover: none), (pointer: coarse) {`,
		`  .mobile-shortcuts {`,
		`    display: flex;`,
		`@media (hover: none) and (min-width: 641px), (pointer: coarse) and (min-width: 641px) {`,
		`  .mobile-shortcut-row {`,
		`    justify-content: center;`,
		`@media (hover: hover) and (pointer: fine) {`,
		`  .mobile-shortcuts {`,
		`    display: none;`,
	}
	for _, want := range styleWantSnippets {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime touch shortcut CSS guard missing %q", want)
		}
	}
}

func TestRuntimeWebSocketURLUsesWebSocketProtocols(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const webSocketURL = (path) => {`,
		`url.protocol = "wss:";`,
		`url.protocol = "ws:";`,
		`url.protocol !== "ws:" && url.protocol !== "wss:"`,
		`const socketUrl = webSocketURL("./ws");`,
		`const currentSocket = new WebSocket(socketUrl.toString());`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime websocket URL guard missing %q", want)
		}
	}
}

func TestRuntimeTerminalOutputBatchingGuard(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const terminalOutputFlushFallbackMs = 32;",
		"const maxQueuedTerminalOutputBytes = 4 * 1024 * 1024;",
		"const clearSessionOutputFlushSchedule = (session) => {",
		"const flushSessionOutput = (session, { force = false } = {}) => {",
		"window.requestAnimationFrame(flush);",
		"session.outputQueue.push(entry);",
		"flushSessionOutput(session, { force: true });",
		"writeSessionImmediateOutput(session, `\\r\\n[webshell error] ${error.message}\\r\\n`);",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal batching guard missing %q", want)
		}
	}
}

func TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const resizeTabForCurrentDevice = (tab) => {",
		"const resizeActiveTabForCurrentDevice = () => resizeTabForCurrentDevice(currentTab());",
		"syncTabMobilePixelScroll(tab);",
		"resizeActiveTabForCurrentDevice();",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime tab resize guard missing %q", want)
		}
	}

	forbiddenSnippets := []string{
		"const resizeAllTabsForCurrentDevice = () => {",
		"paneEl.classList.add(\"active\");",
		"classList.toggle(\"active\", tab.id === visibleTabId)",
		"visibleTabId = activeTabId",
	}
	for _, forbidden := range forbiddenSnippets {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime tab resize regression detected: found %q", forbidden)
		}
	}
}

func TestRuntimeTabOverviewRerendersAndFallsBackToWorkspaceTabs(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const getOrderedTabs = () => {",
		"const orderedIDs = new Set(ordered.map((tab) => tab.id));",
		"for (const tab of tabs.values()) {",
		"if (!orderedIDs.has(tab.id)) {",
		"scheduleTabOverviewRender();",
		"renderTabOverview();",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime tab overview guard missing %q", want)
		}
	}

	openTabOverviewIndex := strings.Index(source, "const openTabOverview = () => {")
	if openTabOverviewIndex < 0 {
		t.Fatal("openTabOverview definition not found")
	}
	renderIndex := strings.Index(source[openTabOverviewIndex:], "renderTabOverview();")
	scheduleIndex := strings.Index(source[openTabOverviewIndex:], "scheduleTabOverviewRender();")
	if renderIndex < 0 || scheduleIndex < 0 || renderIndex > scheduleIndex {
		t.Fatalf("openTabOverview should schedule a follow-up overview render after the initial render")
	}
}

func TestRuntimeMobileEdgeSwipeOpensTabOverview(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"let mobileOverviewEdgeSwipe = null;",
		"const mobileOverviewSwipeEdgeWidth = 24;",
		"const mobileOverviewSwipeAxisThreshold = 12;",
		"const mobileOverviewSwipeOpenDistance = 56;",
		"const mobileOverviewSwipeMaxVerticalTravel = 40;",
		`const mobileOverviewHistoryGuardStateKey = "webshellMobileOverviewGuard";`,
		"const ensureMobileOverviewHistoryGuard = () => {",
		"window.history.pushState(withMobileOverviewHistoryGuard(state), \"\", window.location.href);",
		"const openTabOverviewFromHistoryBack = () => {",
		"if (openTabOverviewFromHistoryBack()) {",
		"const hasBlockingOverviewGestureOverlayOpen = () => Boolean(",
		"const handleMobileOverviewEdgeSwipeStart = (event) => {",
		`edge = "left";`,
		`edge = "right";`,
		`const directedDeltaX = mobileOverviewEdgeSwipe.edge === "left" ? deltaX : -deltaX;`,
		"openTabOverview();",
		`document.addEventListener("touchstart", handleMobileOverviewEdgeSwipeStart, { capture: true, passive: true });`,
		`document.addEventListener("touchmove", handleMobileOverviewEdgeSwipeMove, { capture: true, passive: false });`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile overview edge swipe guard missing %q", want)
		}
	}
}
