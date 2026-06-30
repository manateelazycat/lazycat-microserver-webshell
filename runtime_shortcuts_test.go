package main

import (
	"os"
	"strings"
	"testing"
)

func sourceBetween(t *testing.T, source, start, end string) string {
	t.Helper()
	startIndex := strings.Index(source, start)
	if startIndex < 0 {
		t.Fatalf("source missing start marker %q", start)
	}
	bodyStart := startIndex + len(start)
	endIndex := strings.Index(source[bodyStart:], end)
	if endIndex < 0 {
		t.Fatalf("source missing end marker %q after %q", end, start)
	}
	return source[bodyStart : bodyStart+endIndex]
}

func TestRuntimeFontURLsStayRelativeToProviderEntry(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const fontFileURLPath = (id) => `api/settings/fonts/${encodeURIComponent(id)}/file`;",
		"url: String(font?.url || fontFileURLPath(id)).trim(),",
		"new URL(font.url || fontFileURLPath(font.id), window.location.href).toString();",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime font URL guard missing %q", want)
		}
	}
	if strings.Contains(source, "`/api/settings/fonts/") || strings.Contains(source, `"/api/settings/fonts/`) {
		t.Fatalf("runtime font URLs must stay relative to provider entry, got source: %s", source)
	}
}

func TestRuntimeHomeNavigationUsesCurrentOrigin(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const buildCurrentOriginHomeURL = () => {",
		`const targetURL = new URL("/", window.location.origin);`,
		`targetURL.searchParams.set("view", "home");`,
		"lightOSHomeURL = buildCurrentOriginHomeURL();",
		"const targetURL = await loadLightOSHomeURL();",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime home navigation guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`fetch("./api/lightos-admin-info"`,
		"buildExplicitHomeURL",
		"resolveReferrerHomeURL",
		"loadLightOSAdminBaseURL",
		"loadLightOSAdminInfo",
		"lightOSAdminInfo",
		"lightOSAdminBaseURL",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime home navigation must not use %q", forbidden)
		}
	}
}

func TestRuntimeDeviceManagementStaticGuards(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	index := string(indexData)
	for _, want := range []string{
		`id="settingsDebugModeToggle"`,
		`id="settingsDebugOptions" hidden`,
		`id="settingsOnlineDevicesButton"`,
		`class="settings-debug-action"`,
		"在线设备",
		"查看当前正在连接的设备",
		`id="deviceBackdrop"`,
		`id="deviceBack"`,
		`class="settings-back"`,
		`id="deviceList"`,
	} {
		if !strings.Contains(index, want) {
			t.Fatalf("runtime device management index guard missing %q", want)
		}
	}
	if strings.Contains(index, `id="deviceMenuButton"`) {
		t.Fatalf("runtime device management must not expose online devices in the top-right menu")
	}
	if strings.Contains(index, `id="settingsOnlineDevicesToggle"`) {
		t.Fatalf("runtime device management must not render online devices as a checkbox toggle")
	}

	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(mainData)
	for _, want := range []string{
		"const deviceHeartbeatIntervalMs = 1500;",
		"const deviceListRefreshIntervalMs = 500;",
		"function loadStableClientID() {",
		"const serverRevisionClientID = loadStableClientID();",
		"const currentDeviceInfo = () => {",
		"client_id: serverRevisionClientID,",
		`new URL("./api/devices/heartbeat", window.location.href).toString();`,
		`new URL("./api/devices/offline", window.location.href).toString();`,
		"const startDeviceHeartbeat = () => {",
		"const refreshDeviceList = async () => {",
		"const stopDeviceListRefresh = () => {",
		"const closeDevicePanel = () => {",
		"stopDeviceListRefresh();",
		`const settingsOnlineDevicesButton = document.getElementById("settingsOnlineDevicesButton");`,
		`deviceBack?.addEventListener("click", closeDevicePanel);`,
		"const deviceListContentSignature = (devices) => JSON.stringify",
		"joined_at: String(device?.joined_at || \"\").trim(),",
		"if (nextSignature === deviceListSignature) {",
		"暂无正在连接的设备",
		`settingsOnlineDevicesButton?.addEventListener("click", openDevicePanel);`,
		`document.addEventListener("visibilitychange", () => {`,
		`window.addEventListener("pageshow", () => {`,
		`window.addEventListener("pagehide", () => {`,
		"sendDeviceOfflineBeacon();",
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime device management main guard missing %q", want)
		}
	}
	if strings.Contains(source, "deviceMenuButton") {
		t.Fatalf("runtime device management must not keep deviceMenuButton wiring")
	}
	for _, forbidden := range []string{
		"settingsOnlineDevicesToggle",
		"onlineDevicesDebugEnabled",
		"syncSettingsOnlineDevicesToggle",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime device management must not keep online devices checkbox state %q", forbidden)
		}
	}

	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	style := string(styleData)
	for _, want := range []string{
		".device-panel",
		".device-list",
		"border: 1px dashed var(--panel-border);",
		"background: var(--panel-subtle-bg);",
		".device-item",
		"background: var(--panel-bg);",
		".settings-debug-options",
		".settings-debug-action",
	} {
		if !strings.Contains(style, want) {
			t.Fatalf("runtime device management style guard missing %q", want)
		}
	}
	deviceStyle := sourceBetween(t, style, ".device-panel", ".settings-section-head")
	for _, forbidden := range []string{"gradient", "animation:"} {
		if strings.Contains(deviceStyle, forbidden) {
			t.Fatalf("runtime device management style must not contain %q", forbidden)
		}
	}
}

func TestRuntimeInstanceSwitcherListScrollsWhenManyInstances(t *testing.T) {
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	style := string(styleData)
	listStyle := sourceBetween(t, style, ".instance-switcher-list {", ".instance-switcher-list::-webkit-scrollbar")
	for _, want := range []string{
		"max-height: clamp(160px, calc(100dvh - 220px), 340px);",
		"overflow-y: auto;",
		"overscroll-behavior: contain;",
		"scrollbar-width: thin;",
		"-webkit-overflow-scrolling: touch;",
	} {
		if !strings.Contains(listStyle, want) {
			t.Fatalf("runtime instance switcher list scroll guard missing %q", want)
		}
	}
}

func TestRuntimeDebugModeOnlyTogglesOptionsList(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		"const debugModeStorageKey = `${storagePrefix}.debugMode`;",
		`const settingsDebugOptions = document.getElementById("settingsDebugOptions");`,
		"settingsDebugOptions.hidden = !debugModeEnabled;",
		`let performanceMeterEnabled = window.localStorage.getItem(performanceMeterStorageKey) === "true";`,
		`let performanceTasksEnabled = window.localStorage.getItem(performanceTasksStorageKey) === "true";`,
		"meter.hidden = !performanceMeterEnabled;",
		"performanceTaskMonitor.setEnabled(performanceTasksEnabled);",
		"performanceMeterEnabled = settingsPerformanceMeterToggle.checked;",
		"performanceTasksEnabled = settingsPerformanceTasksToggle.checked;",
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime debug mode guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		"debugModeEnabled && window.localStorage.getItem(performanceMeterStorageKey)",
		"debugModeEnabled && window.localStorage.getItem(performanceTasksStorageKey)",
		"debugModeEnabled && performanceMeterEnabled",
		"debugModeEnabled && performanceTasksEnabled",
		"debugModeEnabled && settingsPerformanceMeterToggle.checked",
		"debugModeEnabled && settingsPerformanceTasksToggle.checked",
		"performanceMeterEnabled = false;",
		"performanceTasksEnabled = false;",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime debug mode must not gate feature state with %q", forbidden)
		}
	}
}

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
		`close_other_tabs: "Ctrl + Shift + q",`,
		`rename_tab: "Ctrl + Shift + r",`,
		`attachment_clipboard: "Ctrl + Shift + a",`,
		`attachment_file: macShortcut("Command + Shift + e", "Ctrl + Shift + e"),`,
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

func TestRuntimePasteShortcutUsesNativePasteEvent(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const isShiftInsertPasteShortcutEvent = (event) => {`,
		`return (key === "insert" || keyCode === 45) && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;`,
		`const isNativePasteShortcutEvent = (event) => {`,
		`const key = normalizeShortcutKeyToken(shortcutKeyFromEventCode(event) || event.key);`,
		`const keyCode = Number(event.keyCode || event.which || 0);`,
		`if ((key !== "v" && keyCode !== 86) || event.altKey) {`,
		`const ctrlShiftPaste = event.ctrlKey && event.shiftKey && !event.metaKey;`,
		`return (event.metaKey && !event.ctrlKey) || ctrlShiftPaste;`,
		`return event.ctrlKey && !event.metaKey;`,
		`const focusTerminalForNativePasteShortcut = (session = activeSession()) => {`,
		`focusTerminalInput(session);`,
		`case "paste_terminal":`,
		`focusTerminalForNativePasteShortcut();`,
		`if (action === "paste_terminal") {`,
		`focusTerminalForNativePasteShortcut();`,
		`throw new Error("当前页面策略禁止主动读取剪贴板，请使用系统粘贴快捷键。");`,
		`textarea.addEventListener("paste", (event) => {`,
		`pasteIntoSession(session, text).catch((error) => showToast(error.message));`,
		`terminalHost.addEventListener("paste", (event) => {`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime native paste shortcut guard missing %q", want)
		}
	}

	ghosttyData, err := os.ReadFile("runtime/static/ghostty-web.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/ghostty-web.js) error = %v", err)
	}
	ghosttySource := string(ghosttyData)
	for _, want := range []string{
		`A.shiftKey && !A.ctrlKey && !A.altKey && !A.metaKey && (A.code === "Insert" || A.key === "Insert" || A.keyCode === 45)`,
		`A.metaKey && A.code === "KeyC")`,
	} {
		if !strings.Contains(ghosttySource, want) {
			t.Fatalf("ghostty native paste shortcut passthrough missing %q", want)
		}
	}

	earlyNativePasteBranch := sourceBetween(t, source,
		`if (isNativePasteShortcutEvent(event)) {`,
		`    if (runTerminalFontSizeShortcut(event)) {`,
	)
	for _, want := range []string{
		`focusTerminalForNativePasteShortcut();`,
		`closeContextMenu();`,
		`event.stopPropagation();`,
		`event.stopImmediatePropagation?.();`,
		`return;`,
	} {
		if !strings.Contains(earlyNativePasteBranch, want) {
			t.Fatalf("runtime early native paste branch missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`pasteIntoSession(`,
		`readClipboardText(`,
		`event.preventDefault();`,
		`runShortcutAction(`,
		`shortcutActionMap.get`,
	} {
		if strings.Contains(earlyNativePasteBranch, forbidden) {
			t.Fatalf("runtime early native paste branch must not contain %q", forbidden)
		}
	}

	shiftInsertPasteBranch := sourceBetween(t, source,
		`if (isShiftInsertPasteShortcutEvent(event)) {`,
		`    if (isNativePasteShortcutEvent(event)) {`,
	)
	for _, want := range []string{
		`event.preventDefault();`,
		`event.stopPropagation();`,
		`event.stopImmediatePropagation?.();`,
		`focusTerminalForNativePasteShortcut();`,
		`closeContextMenu();`,
		`pasteIntoSession().catch((error) => showToast(error.message));`,
		`return;`,
	} {
		if !strings.Contains(shiftInsertPasteBranch, want) {
			t.Fatalf("runtime Shift+Insert paste branch missing %q", want)
		}
	}

	nativePasteBranch := sourceBetween(t, source,
		`if (action === "paste_terminal") {`,
		`    event.preventDefault();`,
	)
	for _, want := range []string{
		`focusTerminalForNativePasteShortcut();`,
		`closeContextMenu();`,
		`return;`,
	} {
		if !strings.Contains(nativePasteBranch, want) {
			t.Fatalf("runtime native paste shortcut branch missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`pasteIntoSession(`,
		`readClipboardText(`,
		`event.preventDefault();`,
		`document.activeElement`,
		`isNativePasteShortcutEvent(event)`,
	} {
		if strings.Contains(nativePasteBranch, forbidden) {
			t.Fatalf("runtime native paste shortcut branch must not contain %q", forbidden)
		}
	}

	pasteShortcutActionBranch := sourceBetween(t, source,
		`case "paste_terminal":`,
		`      case "search_terminal":`,
	)
	if !strings.Contains(pasteShortcutActionBranch, `focusTerminalForNativePasteShortcut();`) {
		t.Fatalf("runtime paste shortcut action should focus terminal for native paste")
	}
	for _, forbidden := range []string{
		`pasteIntoSession(`,
		`readClipboardText(`,
	} {
		if strings.Contains(pasteShortcutActionBranch, forbidden) {
			t.Fatalf("runtime paste shortcut action must not contain %q", forbidden)
		}
	}
}

func TestRuntimeDesktopDoubleClickInlineRenamesTab(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(mainData)
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)

	wantMainSnippets := []string{
		"let inlineTabRenameState = null;",
		"const beginInlineTabRename = (tabId) => {",
		"if (isMobileLayout()) {",
		`input.className = "tab-rename-input";`,
		`input.addEventListener("blur", () => {`,
		`finishInlineTabRename({ commit: true }).catch((error) => showToast(error.message));`,
		`button.addEventListener("dblclick", (event) => {`,
		"beginInlineTabRename(tab.id);",
		"commitTabRename(state.tabId, nextLabel, { optimistic: true });",
		`postWorkspaceAction("rename_tab", { tab_id: tabId, label: normalized }, optimistic ? { focus: false, preferStateActiveTab: false } : {});`,
		`if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {`,
	}
	for _, want := range wantMainSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime inline tab rename guard missing %q", want)
		}
	}

	wantStyleSnippets := []string{
		".tab.renaming .tab-label",
		".tab-rename-input",
		"position: fixed;",
		"border: 1px solid var(--input-focus-border);",
	}
	for _, want := range wantStyleSnippets {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime inline tab rename style missing %q", want)
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
				`{ id: "close-other-tabs", label: "关闭其他标签", action: "close_other_tabs", shortcut: shortcutDefinitions.close_other_tabs },`,
				`{ id: "rename-tab", label: "重命名标签", action: "rename_tab", shortcut: shortcutDefinitions.rename_tab },`,
				`{ id: "attachment-clipboard", label: "从剪贴板导入附件", action: "attachment_clipboard", shortcut: shortcutDefinitions.attachment_clipboard },`,
				`{ id: "attachment-file", label: "上传附件文件", action: "attachment_file", shortcut: shortcutDefinitions.attachment_file },`,
				`const rebuildShortcutActionMap = () => {`,
				`case "close_other_tabs":`,
				`case "rename_tab":`,
				`case "attachment_clipboard":`,
				`case "attachment_file":`,
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

func TestRuntimeAttachmentBrowserStartsAtRootForClientInstances(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const isClientInstanceName = (name = activeName) => String(name || "").trim().startsWith("client:");`,
		`const startPath = isClientInstanceName() ? "/" : String(activeSession()?.cwd || "").trim() || "/";`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime attachment browser client root guard missing %q", want)
		}
	}
}

func TestRuntimeMobileSettingsUsesListNavigation(t *testing.T) {
	wantSnippets := map[string][]string{
		"runtime/static/index.html": {
			`id="settingsMobileNav"`,
			`role="list" aria-label="设置分类" hidden`,
		},
		"runtime/static/main.js": {
			`const settingsMobileNav = document.getElementById("settingsMobileNav");`,
			`let settingsMobileView = "detail";`,
			`const renderSettingsMobileNav = () => {`,
			`button.dataset.settingsMobileNavTab = tabID;`,
			`settingsMobileView = isMobileLayout() ? "index" : "detail";`,
			`const openSettingsMobileDetail = (tabID, { focus = true } = {}) => {`,
			`openSettingsMobileIndex();`,
			`openSettingsMobileDetail(item.dataset.settingsMobileNavTab);`,
		},
		"runtime/static/style.css": {
			`.settings-mobile-nav`,
			`.settings-tabs {` + "\n" + `    display: none;`,
			`.settings-panel[data-mobile-settings-view="index"] .settings-body`,
		},
	}

	for path, snippets := range wantSnippets {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile(%s) error = %v", path, err)
		}
		source := string(data)
		for _, want := range snippets {
			if !strings.Contains(source, want) {
				t.Fatalf("runtime mobile settings navigation guard missing %q in %s", want, path)
			}
		}
	}
}

func TestRuntimeMobileDoubleTapReminderSetting(t *testing.T) {
	wantSnippets := map[string][]string{
		"runtime/static/index.html": {
			`id="settingsMobileDoubleTapReminderToggle"`,
			`双击屏幕提醒`,
			`熟悉手机双击进入编辑的操作后,可以关闭这个选项`,
		},
		"runtime/static/main.js": {
			`const settingsMobileDoubleTapReminderToggle = document.getElementById("settingsMobileDoubleTapReminderToggle");`,
			`let mobileDoubleTapReminderEnabled = true;`,
			`mobileDoubleTapReminderEnabled = state?.mobile_double_tap_reminder_enabled !== false;`,
			`body: JSON.stringify({ mobile_double_tap_reminder_enabled: enabled }),`,
			`if (!mobileDoubleTapReminderEnabled || !requiresTouchKeyboardDoubleTap()) {`,
			`const activePaneDirectoryLabel = () => {`,
			`: activePaneDirectoryLabel() || String(currentTab()?.label || "终端").trim() || "终端";`,
			`settingsMobileDoubleTapReminderToggle?.addEventListener("change", () => {`,
		},
	}

	for path, snippets := range wantSnippets {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile(%s) error = %v", path, err)
		}
		source := string(data)
		for _, want := range snippets {
			if !strings.Contains(source, want) {
				t.Fatalf("runtime mobile double tap reminder setting guard missing %q in %s", want, path)
			}
		}
	}
}

func TestRuntimeTouchKeyboardRequiresDoubleTapOnWideTouchScreens(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const requiresTouchKeyboardDoubleTap = () => isTouchShortcutLayout();`,
		`if (requiresTouchKeyboardDoubleTap() && performance.now() > Number(session?.allowMobileKeyboardFocusUntil || 0)) {`,
		`if (requiresTouchKeyboardDoubleTap()) {`,
		`session.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;`,
		`if (!requiresTouchKeyboardDoubleTap() || event.touches.length !== 1) {`,
		`if (!requiresTouchKeyboardDoubleTap() || !mobileTapTouchState) {`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime wide touch keyboard double-tap guard missing %q", want)
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
	continueSnippet := `{ id: "continue", label: "Continue", ariaLabel: "Continue", text: "continue", data: "continue", kind: "primary" },`
	returnSnippet := `{ id: "return", label: "Return", ariaLabel: "Return", data: "\r", inputKey: "enter", kind: "primary" },`
	tabIndex := strings.Index(source, tabSnippet)
	continueIndex := strings.Index(source, continueSnippet)
	returnIndex := strings.Index(source, returnSnippet)
	if tabIndex < 0 || continueIndex < 0 || returnIndex < 0 || tabIndex > continueIndex || continueIndex > returnIndex {
		t.Fatalf("default mobile shortcut order should place Tab before Continue before Return")
	}
}

func TestRuntimeMobileShortcutTextButtons(t *testing.T) {
	for _, path := range []string{"runtime/static/index.html", "runtime/static/main.js"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile(%s) error = %v", path, err)
		}
		source := string(data)
		wantSnippets := map[string][]string{
			"runtime/static/index.html": {
				`value="text"`,
				`id="mobileShortcutTextField"`,
				`id="mobileShortcutTextInput"`,
			},
			"runtime/static/main.js": {
				`const mobileShortcutTextInput = document.getElementById("mobileShortcutTextInput");`,
				`text: typeof shortcut.text === "string" ? shortcut.text : "",`,
				`item.text = text;`,
				`setSelectedMobileShortcutType(isAction ? "action" : isText ? "text" : "input");`,
				`shortcut.text = text;`,
				`normalizeMobileShortcutTextData(shortcut.text);`,
			},
		}
		for _, want := range wantSnippets[path] {
			if !strings.Contains(source, want) {
				t.Fatalf("%s mobile shortcut text guard missing %q", path, want)
			}
		}
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

func TestRuntimeTerminalRendererCellSeamPatch(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const installRendererCellSeamPatch = (session) => {`,
		`renderer.webshellOriginalRenderCellBackground = renderer.renderCellBackground.bind(renderer);`,
		`renderer.renderCellBackground = (cell, column, row, offsetY = 0) => {`,
		`renderer.webshellOriginalRenderCellBackground(cell, column, row, offsetY);`,
		`const bleed = terminalCellBleedPx(renderer);`,
		`const terminalCanvasPixelPx = (renderer) => {`,
		`const terminalAlignToCanvasPixel = (renderer, value, mode = "round") => {`,
		`return Math.floor(scaled) * pixel;`,
		`return Math.ceil(scaled) * pixel;`,
		`const terminalCellFlagInverse = 16;`,
		`const terminalCellFlagInvisible = 32;`,
		`const terminalCellFlagFaint = 128;`,
		`const terminalCellBackgroundRGB = (cell) => {`,
		`const terminalSameRGB = (left, right) =>`,
		`const terminalLineCellAt = (renderer, row, column) => {`,
		`const renderTerminalMergedLineBackgrounds = (renderer, line, row, columns, offsetY = 0) => {`,
		`const rawY = row * height + offsetY;`,
		`const y = terminalAlignToCanvasPixel(renderer, rawY, "floor");`,
		`const bottom = terminalAlignToCanvasPixel(renderer, rawY + height, "ceil");`,
		`const fillHeight = Math.max(terminalCanvasPixelPx(renderer), bottom - y);`,
		`renderer.ctx.fillRect(segmentStart * width, y, (segmentEnd - segmentStart) * width, fillHeight);`,
		`const leftCell = terminalLineCellAt(renderer, row, column - 1);`,
		`const bleedLeft = terminalSameRGB(rgb, terminalCellBackgroundRGB(leftCell)) ? bleed : 0;`,
		`renderer.ctx.fillRect(x, y, width * cellWidth + bleedLeft + bleedRight, height);`,
		`renderer.renderCursor = (column, row) => {`,
		`if (renderer.cursorStyle !== "block") {`,
		`renderer.ctx.fillRect(column * width - bleed, row * height, width + bleed * 2, height);`,
		`const terminalPowerlineShape = (renderer, cell, column, row) => {`,
		`if (text === "\uE0B6") {`,
		`if (text === "\uE0B4") {`,
		`if (text === "\uE0B0") {`,
		`const rawTop = row * height + offsetY;`,
		`const y = terminalAlignToCanvasPixel(renderer, rawTop, "ceil");`,
		`height: Math.max(terminalCanvasPixelPx(renderer), bottom - y),`,
		`const drawTerminalPowerlineRoundCap = (renderer, direction, cell, column, row, offsetY = 0) => {`,
		`renderer.ctx.rect(box.x - bleed, box.y, box.width + bleed * 2, box.height);`,
		`renderer.ctx.ellipse(`,
		`const drawTerminalPowerlineArrow = (renderer, direction, cell, column, row, offsetY = 0) => {`,
		`const pixel = terminalCanvasPixelPx(renderer);`,
		`const baseBleed = Math.max(bleed, pixel);`,
		`const baseOuter = direction === "right" ? box.x - baseBleed : box.x + box.width + baseBleed;`,
		`const clipLeft = Math.min(baseOuter, tip) - pixel;`,
		`renderer.ctx.clip();`,
		`renderer.ctx.moveTo(baseOuter, box.y);`,
		`renderer.ctx.lineTo(tip, box.y + box.height / 2);`,
		`const drawTerminalPowerlineShape = (renderer, shape, cell, column, row, offsetY = 0) => {`,
		`renderer.renderCellText = (cell, column, row, offsetY = 0) => {`,
		`drawTerminalPowerlineShape(renderer, shape, cell, column, row, offsetY)`,
		`renderer.renderLine = (line, row, columns, offsetY = 0) => {`,
		`renderTerminalMergedLineBackgrounds(renderer, line, row, columns, offsetY)`,
		`installRendererCellSeamPatch(session);`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal renderer cell seam patch missing %q", want)
		}
	}
}

func TestRuntimeTerminalSelectionCopySkipsWideCellPlaceholders(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const terminalSelectionText = (manager) => {`,
		`const terminalSelectionCellText = (manager, cell, absoluteRow, column, scrollback) => {`,
		`if (Number(cell?.width ?? 1) === 0) {`,
		`return { text: "", content: false };`,
		`manager.wasmTerm?.getScrollbackGraphemeString?.(absoluteRow, column)`,
		`manager.wasmTerm?.getGraphemeString?.(absoluteRow - scrollback, column)`,
		`lineText += cellText.text;`,
		`if (cellText.content) {`,
		`lineText = lastContentLength >= 0 ? lineText.substring(0, lastContentLength) : "";`,
		`manager.webshellOriginalGetSelection = manager.getSelection;`,
		`manager.getSelection = function (...args) {`,
		`return terminalSelectionText(this);`,
		`installSelectionManagerCopyPatch(session);`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal selection copy guard missing %q", want)
		}
	}
}

func TestRuntimeTerminalRendererBaselinePatch(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		`const terminalBaselineSampleText = "\uF303\uF017Hg|pqyj\u00C5\u00C9()[]{}0123456789";`,
		`const terminalAdjustedFontMetrics = (renderer, metrics) => {`,
		`const measured = context.measureText(terminalBaselineSampleText);`,
		`const nextBaseline = Math.round((nextHeight + ascent - descent) / 2);`,
		`const installRendererBaselinePatch = (session) => {`,
		`renderer.webshellOriginalMeasureFont = renderer.measureFont.bind(renderer);`,
		`renderer.measureFont = () => terminalAdjustedFontMetrics(renderer, renderer.webshellOriginalMeasureFont());`,
		`renderer.metrics = renderer.measureFont();`,
		`installRendererBaselinePatch(session);`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal renderer baseline patch missing %q", want)
		}
	}
}

func TestRuntimeTerminalLineHeightSetting(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	mainSource := string(mainData)
	indexSource := string(indexData)
	styleSource := string(styleData)

	for _, want := range []string{
		`id="settingsLineHeightInput"`,
		`id="settingsLineHeightResetButton"`,
		`min="100" max="160"`,
		`class="settings-number-stepper"`,
		`data-number-step="up" data-number-target="settingsLineHeightInput"`,
		`data-number-step="down" data-number-target="settingsScrollbackInput"`,
	} {
		if !strings.Contains(indexSource, want) {
			t.Fatalf("runtime line height setting index guard missing %q", want)
		}
	}
	for _, want := range []string{
		`const settingsLineHeightInput = document.getElementById("settingsLineHeightInput");`,
		`const defaultTerminalLineHeightPercent = 100;`,
		`const maxTerminalLineHeightPercent = 160;`,
		`let terminalLineHeightPercent = defaultTerminalLineHeightPercent;`,
		`const normalizeTerminalLineHeightPercent = (value) => {`,
		`terminalLineHeightPercent = normalizeTerminalLineHeightPercent(state?.terminal_line_height_percent);`,
		`body: JSON.stringify({ terminal_line_height_percent: percent }),`,
		`settingsLineHeightInput?.addEventListener("input", scheduleTerminalLineHeightSave);`,
		`const terminalLineHeightRatio = () => normalizeTerminalLineHeightPercent(terminalLineHeightPercent) / defaultTerminalLineHeightPercent;`,
		`const applyTerminalLineHeightToMetrics = (metrics) => {`,
		`return terminalAdjustedFontMetrics(`,
		`const terminalEstimatedSizeForElement = (element) => {`,
		`const terminalOptions = (overrides = {}) =>`,
		`const createPaneSession = (tab, instanceName, { id = "", connect = true, cols = 0, rows = 0 } = {}) =>`,
		`pendingConnect: Boolean(connect),`,
		`const connectPendingSession = (session, { allowHidden = false } = {}) => {`,
		`createPaneSession(tab, targetName, { id: paneState.id, connect: true, cols: paneState.cols, rows: paneState.rows });`,
		`const stepSettingsNumberInput = (button) => {`,
		`input.stepUp();`,
		`settingsPanel?.addEventListener("click", (event) => {`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime line height setting main guard missing %q", want)
		}
	}
	for _, want := range []string{
		`.settings-number-stepper`,
		`appearance: textfield;`,
		`.settings-number-input::-webkit-inner-spin-button`,
		`.settings-number-stepper-button.up::before`,
		`.settings-number-stepper-button.down::before`,
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime line height setting style guard missing %q", want)
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
		`const shouldApplyMobileStickyCompositionInput = (value) => {`,
		`codePoint >= 0x20 && codePoint <= 0x7e;`,
		`const focusMobileKeyboardFromShortcut = (session = activeSession()) => {`,
		`targetSession.allowMobileKeyboardFocusUntil = performance.now() + mobileKeyboardFocusAllowWindowMs;`,
		`focusTerminalInput(targetSession);`,
		`const inputData = applySticky ? consumeMobileStickyTextInput(rawData) : rawData;`,
		`last?.data === rawData || last?.rawData === rawData`,
		`applySticky: shouldApplyMobileStickyTextInput(data, type),`,
		`applySticky: shouldApplyMobileStickyTextInput(value, type),`,
		`applySticky: shouldApplyMobileStickyCompositionInput(data),`,
		`applySticky: shouldApplyMobileStickyCompositionInput(compositionValue),`,
		`applySticky: shouldApplyMobileStickyCompositionInput(committedText),`,
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
		`if (!clean) {`,
		`const keep = new Set([session.term?.canvas, session.term?.textarea, session.compositionPreview].filter(Boolean));`,
		`scheduleTerminalHostViewportReset(session, { clean: true });`,
		`const textareaText = textarea ? stripTerminalInputSentinel(textarea.value) : "";`,
		`if (session.composingIME && typeof session.compositionText === "string") {`,
		`return session.compositionText || textareaText;`,
		`const setTerminalTextareaCompositionText = (session, text) => {`,
		`session.compositionText = normalized;`,
		`const setTerminalCompositionPreviewVisible = (session, visible) => {`,
		`const syncTerminalCompositionPreview = (session, { x = 0, y = 0, width = 1, height = 16 } = {}) => {`,
		`if (session.terminalHost && preview.parentElement !== session.terminalHost) {`,
		`session.terminalHost.appendChild(preview);`,
		`const text = session.composingIME ? terminalTextareaCompositionText(session) : "";`,
		`preview.textContent = text;`,
		"preview.style.left = `${x}px`;",
		`preview.style.color = activeTheme.foreground;`,
		`preview.style.background = activeTheme.background;`,
		`textarea.style.opacity = "0.01";`,
		`textarea.style.outline = "0";`,
		`textarea.style.boxShadow = "none";`,
		`textarea.style.webkitAppearance = "none";`,
		`syncTerminalCompositionPreview(session, { x: left, y: top, width, height });`,
		`const detachTerminalHostCompositionListeners = (session) => {`,
		`["compositionstart", "compositionStartListener"],`,
		`host.removeEventListener(type, listener);`,
		`handler.webshellCompositionDetached = true;`,
		`const installTerminalHostInputIsolation = (session) => {`,
		`host.removeAttribute("contenteditable");`,
		`detachTerminalHostCompositionListeners(session);`,
		`const blockedHostInputEvents = ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend"];`,
		`event.stopImmediatePropagation();`,
		`installTerminalHostInputIsolation(session);`,
		`const compositionPreview = document.createElement("span");`,
		`compositionPreview.className = "terminal-composition-preview";`,
		`terminalHost.appendChild(compositionPreview);`,
		`setTerminalTextareaCompositionText(session, event.data);`,
		`const clearTerminalPostCompositionInput = (session) => {`,
		`session.pendingCompositionInput = null;`,
		`const normalizeTerminalCompositionTextCandidates = (...values) => {`,
		`const terminalCompositionPreeditCandidates = (session, ...extraValues) => normalizeTerminalCompositionTextCandidates(`,
		`const isTerminalPostCompositionInputAlreadySent = (session, committed) => {`,
		`const armTerminalPostCompositionInput = (session, { preedit = "", preedits = [], committed = "", sent = false } = {}) => {`,
		`const preeditCandidates = normalizeTerminalCompositionTextCandidates(preedits, preedit);`,
		`preedit: preeditCandidates[0] || "",`,
		`preedits: preeditCandidates,`,
		`committed: stripTerminalInputSentinel(committed),`,
		`sent: Boolean(sent),`,
		`expiresAt: performance.now() + 350,`,
		`const resolveTerminalPostCompositionInput = (session, value) => {`,
		`const pending = session?.pendingCompositionInput;`,
		`const preedits = normalizeTerminalCompositionTextCandidates(pending.preedits, pending.preedit);`,
		"preedits.some((preedit) => rawValue === `${preedit}${committed}`)",
		`const preeditPrefix = preedits.find((preedit) => rawValue.startsWith(preedit) && rawValue.length > preedit.length);`,
		`preedits.includes(rawValue.slice(preeditPrefix.length))`,
		`data = rawValue.slice(preeditPrefix.length);`,
		`if (!data) {`,
		`const rememberTerminalPostCompositionSentInput = (session, pending, committed) => {`,
		`const committedText = stripTerminalInputSentinel(committed);`,
		`sent: true,`,
		`if (data && session?.composingIME && (type === "insertText" || type === "insertReplacementText")) {`,
		`const compositionValue = data ? resolveTerminalPostCompositionInput(session, data) : null;`,
		`? resolveTerminalPostCompositionInput(session, value)`,
		`rememberTerminalPostCompositionSentInput(session, pendingComposition, compositionValue);`,
		`clearTerminalPostCompositionInput(session);`,
		`const preeditText = terminalTextareaCompositionText(session);`,
		`const textareaPreeditText = stripTerminalInputSentinel(textarea.value);`,
		`const preeditCandidates = terminalCompositionPreeditCandidates(session, preeditText, textareaPreeditText);`,
		`const committedText = typeof event.data === "string" ? stripTerminalInputSentinel(event.data) : "";`,
		`const committedAlreadySent = isTerminalPostCompositionInputAlreadySent(session, committedText);`,
		`armTerminalPostCompositionInput(session, {`,
		`preedits: preeditCandidates,`,
		`committed: committedText,`,
		`sent: Boolean(committedText),`,
		`textarea.value = terminalInputSentinel;`,
		`const fallbackValue = stripTerminalInputSentinel(textarea.value);`,
		`const compositionValue = resolveTerminalPostCompositionInput(session, fallbackValue);`,
		`if (committedText && !committedAlreadySent) {`,
		`sendTerminalTextInput(session, committedText, {`,
		`applySticky: shouldApplyMobileStickyCompositionInput(committedText),`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile IME composition preview guard missing %q", want)
		}
	}
	if strings.Contains(source, `textarea.value = event.data;`) {
		t.Fatalf("runtime mobile IME preview should not mirror composition text into textarea.value")
	}
	if strings.Contains(source, `host.addEventListener("compositionupdate", () => scheduleTerminalHostViewportReset(session`) {
		t.Fatalf("runtime mobile IME preview should not keep host composition listeners active")
	}
	if strings.Contains(source, `const committedText = event.data || terminalTextareaCompositionText(session);`) {
		t.Fatalf("runtime mobile IME compositionend must not send preedit text when event.data is empty")
	}
	compositionBeforeInputBranch := sourceBetween(t, source,
		`if (type === "insertCompositionText" || type === "deleteCompositionText" || event.isComposing) {`,
		`    positionTerminalInput(session);`,
	)
	for _, forbidden := range []string{
		`event.preventDefault();`,
		`textarea.value = "";`,
		`textarea.value = event.data;`,
	} {
		if strings.Contains(compositionBeforeInputBranch, forbidden) {
			t.Fatalf("runtime mobile IME beforeinput composition branch must not contain %q", forbidden)
		}
	}
	compositionUpdateBranch := sourceBetween(t, source,
		`textarea.addEventListener("compositionupdate", (event) => {`,
		`    }, { capture: true });`,
	)
	for _, forbidden := range []string{
		`event.preventDefault();`,
		`textarea.value = "";`,
		`textarea.value = event.data;`,
	} {
		if strings.Contains(compositionUpdateBranch, forbidden) {
			t.Fatalf("runtime mobile IME compositionupdate handler must not contain %q", forbidden)
		}
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)
	for _, want := range []string{
		`.terminal-composition-preview {`,
		`pointer-events: none;`,
		`.terminal-composition-preview[hidden]`,
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime mobile IME composition preview CSS guard missing %q", want)
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

func TestRuntimeSmallDesktopWindowKeepsTabBar(t *testing.T) {
	data, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	source := string(data)
	want := `@media (max-width: 640px) and (hover: none) and (pointer: coarse) {`
	if !strings.Contains(source, want) {
		t.Fatalf("runtime small-window tab bar guard missing %q", want)
	}
	guardedHeaderCSS := sourceBetween(t, source, want, `@media (max-width: 640px) {`)
	for _, want := range []string{
		`.tabs {` + "\n" + `    display: none;`,
		`.mobile-active-tab-title {` + "\n" + `    display: block;`,
	} {
		if !strings.Contains(guardedHeaderCSS, want) {
			t.Fatalf("runtime small-window tab bar guard block missing %q", want)
		}
	}
	narrowCSS := sourceBetween(t, source, `@media (max-width: 640px) {`, `@media (hover: none), (pointer: coarse) {`)
	for _, forbidden := range []string{
		`.tabs {` + "\n" + `    display: none;`,
		`.mobile-active-tab-title {` + "\n" + `    display: block;`,
	} {
		if strings.Contains(narrowCSS, forbidden) {
			t.Fatalf("runtime desktop small-window CSS must not force mobile tab header with %q", forbidden)
		}
	}
}

func TestRuntimeMobileViewportZoomDisabled(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	indexSource := string(indexData)
	for _, want := range []string{
		`maximum-scale=1`,
		`minimum-scale=1`,
		`user-scalable=no`,
	} {
		if !strings.Contains(indexSource, want) {
			t.Fatalf("runtime viewport zoom guard missing %q", want)
		}
	}

	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	if !strings.Contains(string(styleData), `touch-action: pan-x pan-y;`) {
		t.Fatal("runtime touch layout should disable browser pinch zoom while preserving panning")
	}
	if !strings.Contains(string(styleData), `.instance-switcher-panel {`) ||
		!strings.Contains(string(styleData), `touch-action: pan-y;`) {
		t.Fatal("runtime instance switcher panel should preserve scroll without allowing pinch zoom")
	}

	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		`const shouldPreventMobileViewportZoom = () => isMobileLayout() || isTouchShortcutLayout() || usesMobileViewportInsets();`,
		`const preventMobileViewportZoom = (event) => {`,
		`if (!shouldPreventMobileViewportZoom()) {`,
		`String(event.type || "").startsWith("gesture") || touchCount > 1`,
		`window.addEventListener("touchstart", preventMobileViewportZoom, { capture: true, passive: false });`,
		`window.addEventListener("touchmove", preventMobileViewportZoom, { capture: true, passive: false });`,
		`window.addEventListener("gesturestart", preventMobileViewportZoom, { capture: true, passive: false });`,
		`window.addEventListener("gesturechange", preventMobileViewportZoom, { capture: true, passive: false });`,
		`window.addEventListener("gestureend", preventMobileViewportZoom, { capture: true, passive: false });`,
		`document.addEventListener("touchstart", preventMobileViewportZoom, { capture: true, passive: false });`,
		`document.addEventListener("touchmove", preventMobileViewportZoom, { capture: true, passive: false });`,
		`document.addEventListener("gesturestart", preventMobileViewportZoom, { capture: true, passive: false });`,
		`document.addEventListener("gesturechange", preventMobileViewportZoom, { capture: true, passive: false });`,
		`document.addEventListener("gestureend", preventMobileViewportZoom, { capture: true, passive: false });`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime mobile viewport zoom JS guard missing %q", want)
		}
	}
}

func TestRuntimeMobileBottomSafeAreaKeepsShortcutsAboveControls(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		`const isAndroidPlatform = () => {`,
		`const usesMobileViewportInsets = () => isIOSPlatform() || isAndroidPlatform();`,
		`const supportsViewportInsets = usesMobileViewportInsets();`,
		`const useKeyboardInset = isIOSPlatform();`,
		`const measuredBottomInset = measureMobileViewportBottomInset();`,
		`const mobileKeyboardDismissRecoveryDelays = [0, 80, 180, 360, 720, 1200];`,
		`const shouldTrustReferenceInset = isTouchShortcutLayout() && (`,
		`const measuredInset = Math.max(measuredBottomInset, shouldTrustReferenceInset ? measuredReferenceInset : 0);`,
		`const measureMobileViewportBottomInset = () => {`,
		`const scheduleMobileKeyboardDismissRecovery = () => {`,
		`textarea.addEventListener("blur", () => {`,
		`syncMobileVisualViewport({ detectOrientation: false });`,
		`applyMobileViewportInsets(0, nextSafeOffset, { keyboardActive: false });`,
		`scheduleMobileKeyboardDismissRecovery();`,
		`const nextInset = useKeyboardInset && measuredInset > mobileKeyboardInsetThresholdPx ? measuredInset : 0;`,
		`const applyMobileViewportInsets = (nextInset, nextSafeOffset, { animateDock = true, keyboardActive = null } = {}) => {`,
		`const isMobileKeyboardResizeSuppressed = () => (`,
		`syncActiveTerminalViewportForKeyboard();`,
		`const cursor = term?.wasmTerm?.getCursor?.();`,
		`const cursorBottom = Math.ceil((cursorRow + 1) * cellHeight);`,
		`const overflowPastViewport = Math.max(0, cursorBottom + cellHeight - visibleHeight);`,
		"document.documentElement.style.setProperty(\"--mobile-client-bottom-safe-offset\", `${safeOffset}px`);",
		`const syncMobileKeyboardDockTransform = (inset, safeOffset) => {`,
		`mobileShortcuts.style.transform = ` + "`translate3d(0, -${inset}px, 0)`" + `;`,
		`document.body.classList.add("mobile-keyboard-dock-moving");`,
		`window.visualViewport?.addEventListener("resize", syncMobileVisualViewport);`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime mobile keyboard inset guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`const lzcNavigationBarSchemeStatusBarOnly = "statusBarOnly";`,
		`const syncLzcIOSShellLayout = () => {`,
		`callLzcBridge("SetFullScreen");`,
		`callLzcBridge("SetCloseBtnShowStatus", false);`,
	} {
		if strings.Contains(mainSource, forbidden) {
			t.Fatalf("runtime should not force Lazycat shell top layout, found %q", forbidden)
		}
	}

	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	indexSource := string(indexData)
	if !strings.Contains(indexSource, `viewport-fit=cover`) {
		t.Fatal("runtime viewport must opt into safe-area cover rendering")
	}
	if !strings.Contains(indexSource, `name="lzcapp-navigation-bar-scheme" content="hidden"`) {
		t.Fatal("runtime Lazycat shell navigation bar should stay hidden to avoid top safe-area gap")
	}

	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)
	wantSnippets := []string{
		`--lzc-safe-area-inset-bottom: var(--lzc-safe-area-bottom, env(safe-area-inset-bottom, 0px));`,
		`--mobile-client-bottom-safe-offset: 0px;`,
		`--mobile-device-bottom-safe-offset: max(var(--lzc-safe-area-inset-bottom), var(--mobile-client-bottom-safe-offset));`,
		`--mobile-shortcuts-total-height: var(--mobile-shortcuts-content-height);`,
		`--mobile-shortcuts-bottom-padding: 8px;`,
		`--mobile-bottom-dock-offset: var(--mobile-device-bottom-safe-offset);`,
		`--mobile-bottom-overlay-offset: calc(var(--mobile-shortcuts-total-height) + 12px + var(--mobile-bottom-dock-offset));`,
		`body.mobile-keyboard-visible {`,
		`  --mobile-bottom-dock-offset: var(--mobile-keyboard-inset-bottom);`,
		`bottom: 0;`,
		`transform: translate3d(0, calc(0px - var(--mobile-bottom-dock-offset)), 0);`,
		`transition: transform 0.18s ease-out;`,
		`body.mobile-keyboard-dock-moving .mobile-shortcuts {`,
		`  will-change: transform;`,
		`padding: 8px max(5px, var(--lzc-safe-area-inset-right)) var(--mobile-shortcuts-bottom-padding) max(5px, var(--lzc-safe-area-inset-left));`,
		`background: var(--terminal-bg);`,
		`bottom: var(--mobile-bottom-overlay-offset);`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime mobile bottom safe-area CSS guard missing %q", want)
		}
	}

	forbiddenSnippets := []string{
		`76px + var(--lzc-safe-area-inset-bottom)`,
		`88px + var(--lzc-safe-area-inset-bottom)`,
		`bottom: var(--mobile-keyboard-inset-bottom);`,
		`--mobile-shortcuts-bottom-padding: calc(8px + var(--lzc-safe-area-inset-bottom))`,
		`--mobile-shortcuts-bottom-padding: calc(8px + var(--mobile-bottom-safe-area))`,
	}
	for _, forbidden := range forbiddenSnippets {
		if strings.Contains(styleSource, forbidden) {
			t.Fatalf("runtime mobile bottom safe-area CSS should use semantic variables, found %q", forbidden)
		}
	}
}

func TestRuntimeMobileShortcutsPreserveKeyboardExceptMenu(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		`const shouldPreserveMobileKeyboardForShortcut = (shortcut) => String(shortcut?.action || "") !== "open_mobile_menu";`,
		`const isMobileTerminalKeyboardActive = (session = activeSession()) => {`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile shortcut keyboard guard missing %q", want)
		}
	}

	bindBody := sourceBetween(t, source, `  const bindMobileShortcutButton = (button, shortcut) => {`, `  const renderMobileShortcuts = () => {`)
	for _, want := range []string{
		`const preserveMobileKeyboardOnTouchStart = (event) => {`,
		`!shouldPreserveMobileKeyboardForShortcut(shortcut)`,
		`if (event.cancelable) {`,
		`event.preventDefault();`,
		`button.addEventListener("touchstart", preserveMobileKeyboardOnTouchStart, { capture: true, passive: false });`,
	} {
		if !strings.Contains(bindBody, want) {
			t.Fatalf("runtime mobile shortcut bind should preserve keyboard, missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`restoreMobileKeyboardAfterShortcut`,
		`requestAnimationFrame(() => {`,
		`button.addEventListener("focus"`,
	} {
		if strings.Contains(bindBody, forbidden) {
			t.Fatalf("runtime mobile shortcut bind should not restore keyboard after blur, found %q", forbidden)
		}
	}

	menuBody := sourceBetween(t, source, `  const openMobileActionSheet = () => {`, `  const runMobileContextAction = (action) => {`)
	if !strings.Contains(menuBody, `blurMobileKeyboard();`) {
		t.Fatal("runtime mobile Menu shortcut should still hide the keyboard before opening the action sheet")
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
		"const terminalOutputFlushBudgetBytes = 128 * 1024;",
		"const maxQueuedTerminalOutputBytes = 4 * 1024 * 1024;",
		"const clearSessionOutputFlushSchedule = (session) => {",
		"const terminalOutputByteChunkEnd = (data, start, maxBytes) => {",
		"const finishSessionHistoryReplayIfReady = (session) => {",
		"const flushSessionOutput = (session, { force = false } = {}) => {",
		"window.requestAnimationFrame(flush);",
		"session.outputQueue.push({",
		"outputData.byteLength > terminalOutputFlushBudgetBytes",
		"finishSessionHistoryReplayIfReady(session) || flushSessionOutput(session);",
		"flushSessionOutput(session, { force: true });",
		"const genericWebSocketStartupFallbacks = new Set([",
		"const isGenericWebSocketStartupFallback = (message) =>",
		"if (isGenericWebSocketStartupFallback(fallback)) {",
		"showSessionStartupError(session, error.message || \"WebSocket connection failed.\");",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal batching guard missing %q", want)
		}
	}
	if strings.Contains(source, "writeSessionWebShellError(session, message || fallback);") {
		t.Fatal("generic websocket startup fallbacks should not be written as terminal errors")
	}
}

func TestRuntimeTerminalCanvasResidueGuard(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	rendererData, err := os.ReadFile("runtime/static/ghostty-web.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/ghostty-web.js) error = %v", err)
	}
	mainSource := string(mainData)
	styleSource := string(styleData)
	rendererSource := string(rendererData)

	mainSnippets := []string{
		"const terminalRuntimeClearSequence = \"\\x1b[2J\\x1b[3J\\x1b[H\";",
		"const clearTerminalCanvasPixels = (session) => {",
		"const canvas = term?.canvas || term?.renderer?.getCanvas?.();",
		"ctx.fillStyle = activeTheme?.background || terminalOptionsBase.theme?.background || \"#000000\";",
		"ctx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);",
		"const clearTerminalRuntimeBuffer = (session) => {",
		"term.wasmTerm.write(terminalRuntimeClearSequence);",
		"term.viewportY = 0;",
		"term.targetViewportY = 0;",
		"const resetTerminalAfterInitialFit = (session) => {",
		"resetTerminalRuntimeState(session);",
		"const syncTerminalRuntimeReferences = (session) => {",
		"term.selectionManager.wasmTerm = term.wasmTerm;",
		"term.linkDetector?.invalidateCache?.();",
		"const resetTerminalRuntimeState = (session) => {",
		"term.reset();",
		"syncTerminalRuntimeReferences(session);",
		"clearTerminalRuntimeBuffer(session);",
		"clearTerminalCanvasPixels(session);",
		"const setPaneRenderReady = (session, ready) => {",
		"session.shellEl.dataset.renderReady = session.renderReady ? \"true\" : \"false\";",
		"const markPaneRenderPending = (session) => {",
		"session.term?.renderer?.clear?.();",
		"clearTerminalCanvasPixels(session);",
		"const markPaneRenderedIfMeasurable = (session) => {",
		"session.replayCompletionPending",
		"setPaneRenderReady(session, true);",
		"session.shellEl.dataset.connection = \"open\";",
		"clearTerminalCanvasPixels(session);",
		"shellEl.dataset.renderReady = \"false\";",
		"initialFitResetDone: false,",
		"cleanupCallbacks: [],",
		"clearTerminalRuntimeBuffer(session);",
		"clearTerminalCanvasPixels(session);",
		"term.onRender(() => markPaneRenderedIfMeasurable(session))",
		"const resetTerminalForHistoryReplay = (session) => {",
		"markPaneRenderPending(session);",
		"session.resetOnNextReplay = false;",
		"if (!resetTerminalRuntimeState(session)) {",
		"const disposePane = (pane) => {",
		"clearTerminalCanvasPixels(pane);",
		"requestPaneFullRender(session);",
	}
	for _, want := range mainSnippets {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime terminal canvas residue guard missing main snippet %q", want)
		}
	}
	replayStartSnippet := `case "history-replay-start":
                if (!validateReplayMessage(message)) {
                  rejectMismatchedReplay(message);
                  return;
                }
                session.agentPreparing = false;
                if (!resetTerminalForHistoryReplay(session)) {`
	if !strings.Contains(mainSource, replayStartSnippet) {
		t.Fatal("runtime terminal replay start must reset Ghostty state before accepting replay output")
	}

	styleSnippets := []string{
		`.pane-shell[data-render-ready="false"] .terminal-host canvas {`,
		"visibility: hidden;",
	}
	for _, want := range styleSnippets {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime terminal canvas residue guard missing style snippet %q", want)
		}
	}

	rendererSnippets := []string{
		"this.ctx.fillRect(0, 0, this.canvas.width / this.devicePixelRatio, this.canvas.height / this.devicePixelRatio)",
		"this.ctx.fillRect(0, C, this.canvas.width / this.devicePixelRatio, this.metrics.height)",
		"i.text = D.grapheme_len > 0 && typeof A.getGraphemeString == \"function\" ? A.getGraphemeString(Math.floor(I / B.cols), I % B.cols) : String.fromCodePoint(D.codepoint || 32)",
		"text: I[w + 14] > 0 && typeof this.getScrollbackGraphemeString == \"function\" ? this.getScrollbackGraphemeString(A, i) : String.fromCodePoint(D.getUint32(w, !0) || 32)",
		"typeof A.text == \"string\" ? N = A.text",
	}
	for _, want := range rendererSnippets {
		if !strings.Contains(rendererSource, want) {
			t.Fatalf("runtime terminal canvas residue guard missing renderer snippet %q", want)
		}
	}
}

func TestRuntimeWebSocketReconnectHealthGuard(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const terminalWebSocketPingIntervalMs = 10 * 1000;",
		"const terminalWebSocketHealthTimeoutMs = 25 * 1000;",
		"const terminalResumeProbeTimeoutMs = 1500;",
		"const terminalUserRecoveryThrottleMs = 1500;",
		"const terminalAttachReadyTimeoutMs = 8 * 1000;",
		"const terminalAgentPrepareTimeoutMs = 45 * 1000;",
		"const terminalReconnectBaseDelayMs = 500;",
		"const healthTimeout = session.agentPreparing ? terminalAgentPrepareTimeoutMs : terminalWebSocketHealthTimeoutMs;",
		"const attachReadyTimeout = Number(session.attachReadyTimeoutMs || 0) || terminalAttachReadyTimeoutMs;",
		"const isSessionInputReady = (session) => (",
		"const checkSessionConnectionHealth = (session, { connect = true, force = false, allowHidden = false } = {}) => {",
		"const probeOpenSessionSocket = (session, { allowHidden = false } = {}) => {",
		"socket.send(JSON.stringify({ type: \"ping\" }));",
		"Terminal WebSocket resume probe timed out",
		"const recoverVisibleSessionsFromUserGesture = () => {",
		"reconnectVisibleSessions({ allowHidden: true, probe: true });",
		"flushPendingInput(session);",
		"if (session.resumeProbeTimer && force) {",
		"startSocketHealthMonitor(session, currentSocket);",
		"startAttachReadyTimer(session, currentSocket);",
		"case \"agent-preparing\":",
		"session.agentPreparing = true;",
		"startAttachReadyTimer(session, currentSocket, terminalAgentPrepareTimeoutMs);",
		"clearAttachReadyTimer(session);",
		"clearSocketResumeProbeTimer(session);",
		"session.shellEl.dataset.connection = \"open\";",
		"message.retryable === true",
		"window.addEventListener(\"pageshow\", () => {",
		"checkSessionConnectionHealth(pane, { connect: true, force: true, allowHidden });",
		"document.addEventListener(\"pointerdown\", recoverVisibleSessionsFromUserGesture, { capture: true, passive: true });",
		"document.addEventListener(\"touchstart\", recoverVisibleSessionsFromUserGesture, { capture: true, passive: true });",
		"checkSessionConnectionHealth(session, { connect: true, force: userInput, allowHidden: userInput })",
		"document.hidden",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime websocket reconnect health guard missing %q", want)
		}
	}
}

func TestRuntimeTerminalMouseTrackingSequences(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const terminalMouseLegacyCoordinateLimit = 95;",
		"const terminalMouseModeEnabled = (term, mode) => {",
		"term.getMode(mode, false) === true",
		"const terminalMouseTrackingState = (session) => {",
		"const normal = terminalMouseModeEnabled(term, 1000);",
		"const drag = terminalMouseModeEnabled(term, 1002);",
		"const any = terminalMouseModeEnabled(term, 1003);",
		"sgr: terminalMouseModeEnabled(term, 1006),",
		"tracking = tracking || term.hasMouseTracking?.() === true;",
		"const encodeTerminalMouseSequence = (session, event, action, button = -1) => {",
		"return `\\x1b[<${buttonCode};${x};${y}${suffix}`;",
		"return encodeTerminalLegacyMouseSequence(buttonCode, x, y);",
		"const installTerminalMouseTracking = (session) => {",
		"sendOrQueueInput(session, sequence);",
		"const terminalMouseEventFromTouch = (event, touch = null) => ({",
		"const handleTouchStart = (event) => {",
		"sendMouseSequence(terminalMouseEventFromTouch(event, touch), \"press\", 0);",
		"sendMouseSequence(terminalMouseEventFromTouch(event, touch), \"move\", 0);",
		"sendMouseSequence(terminalMouseEventFromTouch(event, touch), \"release\", 0);",
		"shell.addEventListener(\"mousedown\", handleMouseDown, { capture: true, passive: false });",
		"shell.addEventListener(\"touchstart\", handleTouchStart, { capture: true, passive: false });",
		"shell.addEventListener(\"touchmove\", handleTouchMove, { capture: true, passive: false });",
		"shell.addEventListener(\"touchend\", finishTouchMouse, { capture: true, passive: false });",
		"shell.addEventListener(\"wheel\", handleWheel, { capture: true, passive: false });",
		"document.addEventListener(\"mouseup\", handleMouseUp, { capture: true, passive: false });",
		"shell.addEventListener(\"contextmenu\", handleClickLike, { capture: true, passive: false });",
		"|| terminalMouseTrackingState(session)",
		"installTerminalMouseTracking(session);",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal mouse tracking support missing %q", want)
		}
	}
}

func TestRuntimeTerminalInputChunksLargePaste(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const terminalInputChunkChars = 16 * 1024;",
		"const terminalInputPumpChunkBudget = 4;",
		"const terminalInputBackpressureBytes = 512 * 1024;",
		"const maxBufferedInputBytes = 64 * 1024;",
		"const maxQueuedInputBytes = 16 * 1024 * 1024;",
		"const splitTerminalInputChunks = (data, chunkChars = terminalInputChunkChars) => {",
		"const buildTerminalInputQueueItems = (data, { generated = false, maxBytes = Infinity } = {}) => {",
		"const sendSessionInputChunk = (session, data, { generated = false } = {}) => {",
		"const enqueueSessionInput = (session, data, { generated = false, front = false } = {}) => {",
		"const pumpQueuedInput = (session) => {",
		"Number(session.socket.bufferedAmount || 0)",
		"sendSessionInputChunk(session, item.data, { generated: item.generated })",
		"enqueueSessionInput(session, data);",
		"if (session.inputBuffer) {",
		"scheduleQueuedInputPump(session);",
		"scheduleQueuedInputPump(session, terminalInputBackpressureDelayMs);",
		"const data = bracketed ? `\\x1b[200~${value}\\x1b[201~` : value;",
		"sendOrQueueInput(session, data);",
		`textarea.addEventListener("paste", (event) => {`,
		"event.stopImmediatePropagation();",
		"inputQueue: [],",
		"inputPumpTimer: 0,",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal large paste guard missing %q", want)
		}
	}
	if strings.Contains(source, "session.term.paste(value);") {
		t.Fatal("runtime paste path should not send large clipboard content through terminal paste directly")
	}
}

func TestRuntimeBeforeInputPasteUsesPastePath(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	branch := sourceBetween(t, source,
		`} else if (type === "insertFromPaste") {`,
		`    } else if (event.data) {`,
	)
	for _, want := range []string{
		`const text = event.dataTransfer?.getData("text/plain") || event.data || "";`,
		`event.preventDefault();`,
		`pasteIntoSession(session, text).catch((error) => showToast(error.message));`,
		`return;`,
	} {
		if !strings.Contains(branch, want) {
			t.Fatalf("runtime beforeinput paste branch missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`data = event.dataTransfer?.getData("text/plain") || event.data || "";`,
		`sendTerminalTextInput(session, text`,
	} {
		if strings.Contains(branch, forbidden) {
			t.Fatalf("runtime beforeinput paste branch must not contain %q", forbidden)
		}
	}
}

func TestRuntimeUserInputHoldsCursorVisible(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	for _, want := range []string{
		`const terminalCursorBlinkHoldMs = 700;`,
		`const holdTerminalCursorVisible = (session) => {`,
		`window.clearTimeout(session.cursorBlinkHoldTimer);`,
		`renderer.cursorVisible = true;`,
		`term.options.cursorBlink = false;`,
		`term.requestRender?.();`,
		`session.cursorBlinkHoldTimer = window.setTimeout(() => {`,
		`syncCursorBlinkState();`,
		`}, terminalCursorBlinkHoldMs);`,
		`cursorBlinkHoldTimer: 0,`,
		`holdTerminalCursorVisible(session);`,
		`window.clearTimeout(pane.cursorBlinkHoldTimer);`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime cursor blink hold guard missing %q", want)
		}
	}

	inputBranch := sourceBetween(t, source,
		`if (session.replayOutputDepth > 0) {`,
		`    term.onResize(() => {`,
	)
	if !strings.Contains(inputBranch, `holdTerminalCursorVisible(session);`) ||
		!strings.Contains(inputBranch, `sendOrQueueInput(session, data`) {
		t.Fatal("runtime user input branch should hold cursor visible before sending input")
	}
}

func TestRuntimeGeneratedTerminalResponsesAreMarked(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const generatedTerminalResponseTailPattern =",
		`[\d{1,4};\d{1,4}R|\[\d{1,4}R`,
		`|\dR)+$/`,
		"const isGeneratedTerminalResponseTail = (data) => (",
		"generatedTerminalResponseTailPattern.test(data)",
		"const armGeneratedInputSuppression = (session, durationMs = 1000) => {",
		"const armAllGeneratedInputSuppression = (durationMs = 1000) => {",
		"const generatedResponseTail = isGeneratedTerminalResponseTail(data);",
		"return generatedResponse || generatedResponseTail;",
		"if (!generated && shouldSuppressGeneratedTerminalInput(session, data)) {",
		"if (shouldSuppressGeneratedTerminalInput(session, data)) {",
		"session.processingGeneratedTerminalResponses = true;",
		"session.processingGeneratedTerminalResponses = false;",
		"const payload = { type: \"input\", data, ...terminalThemePayload() };",
		"payload.generated = true;",
		"payload.cols = cols;",
		"payload.rows = rows;",
		"session.socket.send(JSON.stringify(payload));",
		"socketUrl.searchParams.set(\"fg\", themePayload.foreground);",
		"socketUrl.searchParams.set(\"bg\", themePayload.background);",
		"socketUrl.searchParams.set(\"cursor\", themePayload.cursor);",
		"sendTerminalTheme(session);",
		"const generatedResponse = isGeneratedTerminalResponse(data);",
		"if (generatedResponse || generatedResponseTail) {",
		"sendSessionInput(session, data, { immediate: true, generated: true });",
		"if (session.processingGeneratedTerminalResponses || generatedResponse) {",
		"if (generatedResponseTail) {",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime generated terminal response guard missing %q", want)
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
		"const isPaneVisibleForSizing = (pane) => {",
		"const resizePane = (pane, { visibleOnly = true } = {}) => {",
		"return false;",
		"pane.fitAddon?.proposeDimensions?.();",
		"const scheduleVisibleTabResize = (tab) => {",
		"window.setTimeout(() => resizeTabForCurrentDevice(tab), 80);",
		"scheduleVisibleTabResize(tab);",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime tab resize guard missing %q", want)
		}
	}

	visibilityIndex := strings.Index(source, "const isPaneVisibleForSizing = (pane) => {")
	resizeIndex := strings.Index(source, "const resizePane = (pane, { visibleOnly = true } = {}) => {")
	resetIndex := strings.Index(source, "resetTerminalHostViewport(pane, { clean: true });")
	if visibilityIndex < 0 || resizeIndex < 0 || resetIndex < 0 || !(visibilityIndex < resizeIndex && resizeIndex < resetIndex) {
		t.Fatalf("runtime hidden pane resize guard is not before terminal viewport reset")
	}

	activeTabIndex := strings.Index(source, "const setActiveTab = (tabId, { focus = true, remember = true, rememberRecent = true } = {}) => {")
	if activeTabIndex < 0 {
		t.Fatalf("runtime setActiveTab is missing")
	}
	scheduleIndex := strings.Index(source[activeTabIndex:], "scheduleVisibleTabResize(tab);")
	if scheduleIndex < 0 {
		t.Fatalf("runtime setActiveTab does not schedule visible tab resize")
	}

	forbiddenSnippets := []string{
		"const resizeAllTabsForCurrentDevice = () => {",
		"paneEl.classList.add(\"active\");",
		"classList.toggle(\"active\", tab.id === visibleTabId)",
		"visibleTabId = activeTabId",
		"needsVisibleResize",
	}
	for _, forbidden := range forbiddenSnippets {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime tab resize regression detected: found %q", forbidden)
		}
	}
}

func TestRuntimeMobileOrientationReplaysVisibleTerminalAfterViewportSettle(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const mobileOrientationViewportRecoveryDelays = [0, 80, 180, 360, 720];",
		"const mobileOrientationHistoryReplayDelayMs = 900;",
		"const currentMobileViewportOrientation = () => {",
		"const rememberMobileViewportOrientationChange = () => {",
		"const scheduleMobileOrientationViewportRecovery = () => {",
		"if (rememberMobileViewportOrientationChange() || mobileOrientationRecoveryTimer) {",
		"const shouldRecoverOrientation = orientationChanged || (detectOrientation && mobileOrientationRecoveryTimer);",
		"syncMobileVisualViewport({ detectOrientation: false });",
		"replayActiveTabFromServerAfterViewportChange();",
		"const resetTerminalForHistoryReplay = (session) => {",
		"resetTerminalRuntimeState(session)",
		"session.initialFitResetDone = true;",
		"const requestSessionHistoryReplay = (session) => {",
		"session.resetOnNextReplay = true;",
		"socket.close(4000, \"viewport changed\");",
		"const replayActiveTabFromServerAfterViewportChange = () => {",
		"resetTerminalForHistoryReplay(session)",
		"window.addEventListener(\"orientationchange\", handleMobileOrientationChange);",
		"window.screen?.orientation?.addEventListener?.(\"change\", handleMobileOrientationChange);",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile orientation replay guard missing %q", want)
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

	clickBranch := sourceBetween(t, source,
		`tabOverview?.addEventListener("click", (event) => {`,
		`  });`,
	)
	for _, want := range []string{
		`const cardButton = target instanceof Element ? target.closest(".tab-overview-card-main") : null;`,
		`selectTabFromOverview(cardButton.dataset.tabId);`,
		`const card = target instanceof Element ? target.closest(".tab-overview-card") : null;`,
		`selectTabFromOverview(card.dataset.tabId);`,
	} {
		if !strings.Contains(clickBranch, want) {
			t.Fatalf("runtime tab overview click guard missing %q", want)
		}
	}
}

func TestRuntimeMobileDeployRestartUsesBottomSheet(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	mainSource := string(mainData)
	indexSource := string(indexData)
	styleSource := string(styleData)

	wantMainSnippets := []string{
		`const mobileCloseConfirmActions = document.getElementById("mobileCloseConfirmActions");`,
		`const confirmMobileSheet = ({ title = "确认操作？", message = "", okText = "确认", cancelText = "取消", actionsLayout = "horizontal", initialFocus = "cancel" } = {}) =>`,
		`mobileCloseConfirmActions.dataset.layout = actionsLayout === "vertical-ok-first" ? "vertical-ok-first" : "horizontal";`,
		`armAllGeneratedInputSuppression(2000);`,
		`const restart = isMobileLayout()`,
		`? await confirmMobileSheet({ ...restartDialogOptions, actionsLayout: "vertical-ok-first" })`,
		`: await openDialog(restartDialogOptions);`,
		`discardAllTerminalInputBuffers();`,
		`const clearStartupServerRevisionInputLock = async () => {`,
		`await clearStartupServerRevisionInputLock().catch(() => {});`,
		`const ensureInitialInteractiveTab = ({ focus = true } = {}) => {`,
		`paneId: "pane-1",`,
		`ensureInitialInteractiveTab({ focus: true });`,
	}
	for _, want := range wantMainSnippets {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime mobile deploy restart guard missing %q", want)
		}
	}
	if strings.Contains(mainSource, `setAllTerminalInputLocked(false);
        deployRestartDialogOpen = false;
        suppressBeforeUnloadForNavigation();`) {
		t.Fatal("restart reload path should keep local input blocked until navigation")
	}
	if strings.Contains(mainSource, `await setServerRevisionInputLocked(false).catch(() => {});
        setAllTerminalInputLocked(false);
        discardAllTerminalInputBuffers();
        suppressBeforeUnloadForNavigation();
        window.location.reload();`) {
		t.Fatal("restart reload path should keep server input blocked until websocket disconnect")
	}
	if !strings.Contains(indexSource, `class="mobile-close-confirm-actions" id="mobileCloseConfirmActions"`) {
		t.Fatal("mobile close confirm actions container should have a stable id")
	}
	for _, want := range []string{
		`.mobile-close-confirm-actions[data-layout="vertical-ok-first"]`,
		`.mobile-close-confirm-actions[data-layout="vertical-ok-first"] .mobile-close-confirm-ok`,
		`order: -1;`,
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime mobile deploy restart CSS guard missing %q", want)
		}
	}
}

func TestRuntimeMobileRunningCommandConfirmUsesVerticalButtons(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	start := strings.Index(source, "const confirmCloseRunningCommand = (message, options = {}) => {")
	if start < 0 {
		t.Fatal("confirmCloseRunningCommand definition not found")
	}
	end := strings.Index(source[start:], "return confirmDialog(message, options);")
	if end < 0 {
		t.Fatal("confirmCloseRunningCommand desktop fallback not found")
	}
	block := source[start : start+end]
	for _, want := range []string{
		`title: "检测到后台进程",`,
		`actionsLayout: "vertical-ok-first",`,
	} {
		if !strings.Contains(block, want) {
			t.Fatalf("mobile running command confirm guard missing %q", want)
		}
	}
}

func TestRuntimeMobileEdgeSwipeOpensTabOverview(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)

	wantSnippets := []string{
		"let mobileOverviewEdgeSwipe = null;",
		"const mobileOverviewSwipeEdgeWidth = 24;",
		"const mobileOverviewSwipeAxisThreshold = 12;",
		"const mobileOverviewSwipeNativeBackBlockDistance = 4;",
		"const mobileOverviewSwipeOpenDistance = 56;",
		"const mobileOverviewSwipeMaxVerticalTravel = 40;",
		`const mobileOverviewHistoryGuardStateKey = "webshellMobileOverviewGuard";`,
		"const ensureMobileOverviewHistoryGuard = () => {",
		"window.history.pushState(withMobileOverviewHistoryGuard(state), \"\", window.location.href);",
		"const refreshMobileOverviewHistoryGuardForUserGesture = () => {",
		"window.history.replaceState(withMobileOverviewHistoryGuard(state), \"\", window.location.href);",
		"const openTabOverviewFromHistoryBack = () => {",
		"if (openTabOverviewFromHistoryBack()) {",
		"const hasBlockingOverviewGestureOverlayOpen = () => Boolean(",
		"const handleMobileOverviewEdgeSwipeStart = (event) => {",
		"refreshMobileOverviewHistoryGuardForUserGesture();",
		`edge = "left";`,
		`edge = "right";`,
		`const directedDeltaX = mobileOverviewEdgeSwipe.edge === "left" ? deltaX : -deltaX;`,
		"directedDeltaX >= mobileOverviewSwipeNativeBackBlockDistance && absX > absY",
		"openTabOverview();",
		`document.addEventListener("touchstart", handleMobileOverviewEdgeSwipeStart, { capture: true, passive: true });`,
		`document.addEventListener("touchmove", handleMobileOverviewEdgeSwipeMove, { capture: true, passive: false });`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile overview edge swipe guard missing %q", want)
		}
	}
	if !strings.Contains(styleSource, "overscroll-behavior-x: none;") {
		t.Fatal("runtime mobile overview edge swipe should disable native horizontal overscroll navigation")
	}
}

func TestRuntimeMobileOverviewDragAndSelectionToolbar(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	indexSource := string(indexData)

	for _, want := range []string{
		"let tabOverviewDragState = null;",
		"const tabOverviewDragHoldDelayMs = 320;",
		"const animateTabOverviewReorder = (beforeRects) => {",
		"const updateTabOverviewDragAutoScroll = (state) => {",
		`if (state.pointerType !== "mouse" && !state.dragReady) {`,
		"finishTabOverviewDrag({ cancel: true });",
		`document.addEventListener("touchmove", handleTabOverviewDragTouchMove, { capture: true, passive: false });`,
		"const moveTabToOverviewIndex = async",
		`postWorkspaceAction("move_tab", { tab_id: tabId, position });`,
		"bindTabOverviewCardDrag(card);",
		`card.addEventListener("pointerdown", handleTabOverviewCardPointerDown);`,
		`case "new_tab":`,
		`case "close_tab":`,
		`case "rename_tab":`,
		`case "next_tab":`,
		`case "previous_tab":`,
		`case "vertical_split":`,
		`case "horizontal_split":`,
		`case "tab_overview":`,
		`case "search_terminal":`,
		`case "attachment":`,
		"const openSearchFromSelection = (session = activeSession()) => {",
		"const positionSelectionSheet = (session = activeSession()) => {",
		"const openMobileCustomSelect = (select) => {",
		`select.addEventListener("touchstart", handleMobileCustomSelectOpenEvent, { capture: true, passive: false });`,
		`select.addEventListener("pointerdown", handleMobileCustomSelectOpenEvent, { capture: true, passive: false });`,
		`event.preventDefault();`,
		`event.stopPropagation();`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime mobile overview/selection guard missing %q", want)
		}
	}
	for _, want := range []string{
		`data-selection-action="copy">复制`,
		`data-selection-action="paste">粘贴`,
		`data-selection-action="search">搜索`,
	} {
		if !strings.Contains(indexSource, want) {
			t.Fatalf("runtime mobile selection toolbar markup missing %q", want)
		}
	}
	for _, want := range []string{
		".tab-overview-card-placeholder",
		"body.is-tab-overview-dragging",
		".tab-overview-card.is-reordering",
		"touch-action: pan-y;",
		"touch-action: none;",
		".selection-sheet button:not(:last-child)::after",
		"background: rgba(24, 24, 24, 0.96);",
		".mobile-custom-select-popover",
		".mobile-custom-select-option.is-selected",
		"appearance: none;",
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime mobile overview/selection CSS guard missing %q", want)
		}
	}
}
