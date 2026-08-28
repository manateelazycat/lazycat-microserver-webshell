package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestTerminalCacheV2Behavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_cache_v2_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal cache-v2 tests failed: %v\n%s", err, output)
	}
}

func TestTerminalReplayControllerBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_replay_controller_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal replay controller tests failed: %v\n%s", err, output)
	}
}

func TestTerminalRenderSnapshotBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_render_snapshot_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal render snapshot tests failed: %v\n%s", err, output)
	}
}

func TestTerminalResizeControllerBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_resize_controller_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal resize controller tests failed: %v\n%s", err, output)
	}
}

func TestTerminalResizeSchedulerBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_resize_scheduler_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal resize scheduler tests failed: %v\n%s", err, output)
	}
}

func TestTerminalFrameReleaseSchedulerBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_frame_release_scheduler_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal frame release scheduler tests failed: %v\n%s", err, output)
	}
}

func TestTabActivationSchedulerBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "tab_activation_scheduler_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("tab activation scheduler tests failed: %v\n%s", err, output)
	}
}

func TestRuntimeResizeEpochAckGuard(t *testing.T) {
	source, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(source)
	for _, want := range []string{
		"TerminalResizeController",
		"resizeController.request({",
		"resizeController.acknowledge({",
		"resizeController.fail({",
		"session.resizeController.commit();",
		"createRenderSnapshot(session, { presented: true })",
		"session.renderSnapshot.equals(current)",
		"const resizeEpochSupported = pane.resizeEpochSupported !== false;",
		"resize_epoch: resizeEpoch",
		"pane.resizeAckPending = resizeEpochSupported;",
		"case \"resize-applied\":",
		"case \"resize-error\":",
		"const ackDimensions = {",
		"resize_ack_stale",
		"session.appliedResizeEpoch = epoch;",
		"const pendingResizeTarget = session.pendingResizeTarget;",
		"const terminalRenderAllowed = (session) => Boolean(",
		"replay_presentation_checkpoint_skipped",
		"recordTerminalSessionEvent(session, \"render_blocked\"",
		"reason: isPaneVisibleForSizing(session) ? \"presentation_validation\" : \"presentation_wait_measure\",",
		"const resizeRequestInFlight = Boolean(",
		"reusedPendingRequest: true,",
		"queuedBehindRequest: pane.requestedResizeEpoch,",
		"const terminalIsAlternateScreen = (term) => Boolean(",
		"term?.buffer?.active?.type === \"alternate\"",
		"const terminalResizeOutputQuietMs = 120;",
		"const terminalResizeOutputMaxHoldMs = 800;",
		"pane.resizeFenceActive = true;",
		"pane.resizeFenceTarget = {",
		"sendTerminalSize(pane, {",
		"dimensions: targetDimensions,",
		"const applyTerminalResizeFence = (session) => {",
		"terminalResizeOutputFlushBudgetBytes",
		"pane.resizeFenceDrainRemainingEntries = Array.isArray(pane.outputQueue)",
		"maxBytes: terminalResizeOutputFlushBudgetBytes,",
		"maxEntries: session.resizeFenceDrainRemainingEntries,",
		"scheduleRemainder: false,",
		"session.term.resize(target.cols, target.rows);",
		"beginTerminalRenderSuppression(session, \"resize\");",
		"endTerminalRenderSuppression(session, { render: false, reason: \"resize\" });",
		"const finishResizeOutputSettle = (session, reason = \"quiet\") => {",
		"session.resizeOutputSettleActive = true;",
		"resize_output_settle_start",
		"resize_output_settle_complete",
		"const resizeOutputSettleActive = session.resizeOutputSettleActive === true;",
		"const resizeTransitionActive = resizeOutputSettleActive || session.resizeFenceActive === true;",
		"const suppressRender = (deferRender || resizeTransitionActive) && !replayOutput;",
		"replayOutput ? \"write_replay\" : \"write_suppressed\"",
		"reason: \"legacy_resize\"",
		"session.term.writeReplay(data);",
		"session.resizeAckPending",
		"const commitTerminalPresentationIfReady = (session) => {",
		"const markPaneRenderedIfMeasurable = (session) => {",
		"const schedulePanePresentationRetry = (session, {",
		"presentationRetryPending: false,",
		"recordTerminalSessionEvent(session, \"presentation_render_failed\")",
		"recordTerminalSessionEvent(session, \"presentation_commit_complete\"",
		"const resizeProtocol = String(message.resize_protocol || \"\").trim();",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime resize epoch ACK guard missing %q", want)
		}
	}
	resizeBlock := sourceBetween(t, mainSource,
		"const resizePane = (pane, {",
		"const paneResizeScheduler = createTerminalResizeScheduler({")
	if !strings.Contains(resizeBlock, "shouldCommitAfterHold && !pane.resizeAckPending") {
		t.Fatal("resize presentation must not commit before resize ACK")
	}
	if !strings.Contains(resizeBlock, "!shouldCommitAfterHold && !pane.resizeAckPending") {
		t.Fatal("resize presentation must not settle before resize ACK")
	}
	if !strings.Contains(resizeBlock, "const resizeOutputSettlePending = pane.resizeOutputSettleActive === true;") ||
		!strings.Contains(resizeBlock, "!resizeOutputSettlePending") {
		t.Fatal("resize presentation must remain hidden while post-ACK PTY output settles")
	}
	applyIndex := strings.Index(mainSource, "const applyTerminalResizeFence = (session) => {")
	settleIndex := strings.Index(mainSource, "scheduleResizeOutputSettle(session)")
	if applyIndex < 0 || settleIndex < 0 || applyIndex > settleIndex {
		t.Fatal("resize ACK must enter the bounded output settle barrier before the final render")
	}
	writeIndex := strings.Index(mainSource, "const suppressRender = (deferRender || resizeTransitionActive) && !replayOutput;")
	if writeIndex < 0 || writeIndex < strings.Index(mainSource, "const writeSessionOutput = (") {
		t.Fatal("resize output must be render-suppressed while the settle barrier is active")
	}
}

func TestRuntimeCrossClientResizeDoesNotAutoReclaim(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		`const sendTerminalSize = (pane, { force = false, dimensions = null, claim = false } = {}) => {`,
		`...(claim ? { claim: true } : {}),`,
		`const applyObservedTerminalResize = (session, message) => {`,
		`const remoteEpoch = Boolean(requestedEpoch && BigInt(epoch) > BigInt(requestedEpoch));`,
		`applyObservedTerminalResize(session, message);`,
		`claimSize: true,`,
		`suppressTerminalResizeSend`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("cross-client resize ownership guard missing %q", want)
		}
	}
	ackBlock := sourceBetween(t, source,
		`const handleTerminalResizeApplied = (session, message) => {`,
		`const handleTerminalResizeError = (session, message) => {`,
	)
	remoteIndex := strings.Index(ackBlock, `const remoteEpoch = Boolean(`)
	applyIndex := strings.Index(ackBlock, `applyObservedTerminalResize(session, message);`)
	if !strings.Contains(ackBlock, "applyObservedTerminalResize(session, message);") {
		t.Fatal("same-epoch normalized resize ACK must be applied locally")
	}
	if remoteIndex < 0 || applyIndex < 0 {
		t.Fatal("resize ACK handling must include remote epoch adoption")
	}
	guardStart, guardEnd := remoteIndex, applyIndex
	if guardStart > guardEnd {
		guardStart, guardEnd = guardEnd, guardStart
	}
	if strings.Contains(ackBlock[guardStart:guardEnd], `resizePane(session, { forceSizeSync: true`) {
		t.Fatal("remote resize ACK must not automatically reclaim the local device size")
	}
	workspaceData, err := os.ReadFile("workspace.go")
	if err != nil {
		t.Fatalf("ReadFile(workspace.go) error = %v", err)
	}
	workspaceSource := string(workspaceData)
	for _, want := range []string{
		`resize_owner_active`,
		`!message.Claim`,
		`resizeOwner                *paneClient`,
		`ownerActive && !message.Claim && epoch != currentEpoch && source != owner`,
		`ownerReleased := p.resizeOwner == client`,
		`p.resizeOwner = nil`,
		`"type":         "resize-owner-released"`,
	} {
		if !strings.Contains(workspaceSource, want) {
			t.Fatalf("server resize owner lifecycle guard missing %q", want)
		}
	}
	agentData, err := os.ReadFile("agent.go")
	if err != nil {
		t.Fatalf("ReadFile(agent.go) error = %v", err)
	}
	attachBlock := sourceBetween(t, string(agentData),
		"func (d *agentDaemon) handleAttach(",
		"func runAgentRequestClient(")
	if strings.Contains(attachBlock, "pane.resize(request.Cols, request.Rows)") {
		t.Fatal("attaching a device must not resize the shared PTY outside resize owner arbitration")
	}
	for _, want := range []string{
		`const handleTerminalResizeOwnerReleased = (session, message) => {`,
		`case "resize-owner-released":`,
		`forceSizeSync: true,`,
		`const recoverStalledPanePresentation = (session, now = Date.now()) => {`,
		`terminalPresentationStallTimeoutMs`,
		`terminalPresentationStallReconnectLimit`,
		`recycleTerminalUnifiedSession(session, "presentation stalled after replay commit", { immediate: true });`,
		`recoverVisiblePanePresentations();`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("cross-device resize/presentation recovery guard missing %q", want)
		}
	}
}

func TestRuntimeTabActivationPresentationRecoveryGuard(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		"const deferPanePresentation = (session, reason = \"hidden\") => {",
		"const retryPendingPaneResize = (session, reason) => {",
		"const ensurePanePresentation = (session, {",
		"session.resizeFenceActive || session.resizeAckPending || session.resizeOutputSettleActive",
		"reason: \"history_replay_complete\"",
		"reason: \"queue_turn_complete\"",
		"schedulePanePresentationFrame(pane, \"tab_activated\")",
		"reason: \"resize_applied\"",
		"reason: \"resize_error\"",
		"terminalPresentationResizeRetryMs",
		"lastResizeRequestAt",
		"presentationValidationAttempts",
		"const schedulePanePresentationFrame = (session, reason = \"presentation_frame\") => {",
		"schedulePanePresentationFrame(session, geometryChanged ? \"resize_observer_geometry\" : \"resize_observer\")",
		"schedulePanePresentationFrame(session, \"render_callback\")",
		"const terminalPresentationValidationMaxMs = 250;",
		"const terminalFullRenderValidationMs = 32;",
		"const scheduleReplayPresentationCheckpoint = (session) => {",
		"session.replayPresentationCheckpointPending",
		"replay_presentation_checkpoint_skipped",
		"session.replayPresentationCheckpointTimer",
		`flow_control: "turn-ack-v1"`,
		`case "queue-turn-complete":`,
		`type: "queue-turn-ack"`,
		"data: `${pending.cursor.toString()}:${pending.sequence}`",
		`session.queueTurnReceivedCursor = null`,
		`session.queueTurnReceivedSequence = null`,
		`session.pendingQueueTurnAck = null`,
		`queue turn acknowledgement boundary does not match received output`} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime tab presentation recovery guard missing %q", want)
		}
	}

	ensureBlock := sourceBetween(t, source,
		"const ensurePanePresentation = (session, {",
		"const clearPaneFullRenderValidation = (session) => {")
	if !strings.Contains(ensureBlock, "!isPaneVisibleForSizing(session) || !isPaneMeasurable(session)") ||
		!strings.Contains(ensureBlock, "deferPanePresentation(session") {
		t.Fatal("hidden replay completion must defer presentation until the pane is visible and measurable")
	}
	if !strings.Contains(ensureBlock, "retryPendingPaneResize(session, reason);") ||
		!strings.Contains(ensureBlock, "schedulePaneResize(session, {") {
		t.Fatal("visible presentation recovery must wait for resize ACKs and re-enter the resize scheduler")
	}
	if strings.Contains(ensureBlock, "session.term.resize(") || strings.Contains(ensureBlock, "claim: true") {
		t.Fatal("presentation recovery must not bypass the resize fence or automatically claim another device's size")
	}
	retryBlock := sourceBetween(t, source,
		"const retryPendingPaneResize = (session, reason) => {",
		"const ensurePanePresentation = (session, {")
	if strings.Contains(retryBlock, "claim:") {
		t.Fatal("a presentation timeout must retry resize passively and never replay a stale explicit claim")
	}
	if strings.Contains(source, "const terminalPresentationValidationMaxMs = 1000;") {
		t.Fatal("tab presentation validation must not retain the one-second fallback delay")
	}

	replayBlock := sourceBetween(t, source,
		"const finishSessionHistoryReplayIfReady = (session) => {",
		"const discardSessionOutputBuffers = (session) => {")
	if !strings.Contains(replayBlock, "ensurePanePresentation(session, {") ||
		strings.Contains(replayBlock, "renderPaneFullNow(session);") {
		t.Fatal("history replay completion must use the visibility-aware presentation gate")
	}

	queueTurnBlock := sourceBetween(t, source,
		`case "queue-turn-complete":`,
		`case "agent-preparing":`)
	if !strings.Contains(queueTurnBlock, "ensurePanePresentation(session, {") {
		t.Fatal("Queue turn completion must use the same final presentation gate")
	}
}

func TestRuntimeReplayRetryBudgetPreservesPresentation(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		`const terminalReplayFailureLimit = 3;`,
		`const noteSessionReplayFailure = (session, reason = "replay_failed") => {`,
		`session.replayRetryPaused = true;`,
		`beginTerminalPresentationHold(session);`,
		`const resumeSessionReplayRetry = (session, reason = "user_recovery") => {`,
		`resumeSessionReplayRetry(pane, "user_recovery");`,
		`resumeSessionReplayRetry(pane, "network_online");`,
		`!replayRetryIsPaused(pane)`,
		`const nextConnectionState = replayRetryIsPaused(session)`,
		`replayRetryIsPaused(session)`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime replay retry budget guard missing %q", want)
		}
	}
	pauseBlock := sourceBetween(t, source,
		`const noteSessionReplayFailure = (session, reason = "replay_failed") => {`,
		`const resumeSessionReplayRetry = (session, reason = "user_recovery") => {`)
	for _, forbidden := range []string{
		`replayController.commit`,
		`historyStateReady = true`,
		`flushPendingInput`,
		`savePreview`,
		`putManifest`,
	} {
		if strings.Contains(pauseBlock, forbidden) {
			t.Fatalf("partial replay failure pause must remain presentation-only: found %q", forbidden)
		}
	}
}

func TestRuntimeTerminalMultiplexedIdentityGate(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		"const validateTerminalChannelMessageIdentity = (event, messageType = \"\", isBinary = false) => {",
		"const metadata = event?.queueMetadata;",
		"const expectedStreamID = String(session.unifiedStreamID).trim();",
		"return !isBinary && messageType === \"agent-preparing\";",
		"const rejectMismatchedChannelMessage = (event, messageType) => {",
		"session.resetOnNextReplay = true;",
		"beginTerminalPresentationHold(session);",
		"return (!selector || selector === session.name)",
		"every identity field that",
		"Terminal multiplexed message identity validation failed.",
		"if (!validateTerminalChannelMessageIdentity(event, message.type, false)) {",
		"if (!validateTerminalChannelMessageIdentity(event, \"\", true)) {",
		"rejectMismatchedChannelMessage(event, message.type);",
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime multiplexed terminal identity guard missing %q", want)
		}
	}
	messageBlock := sourceBetween(t, source,
		"currentSocket.addEventListener(\"message\", (event) => {",
		"currentSocket.addEventListener(\"close\", (event) => {")
	controlIndex := strings.Index(messageBlock, "validateTerminalChannelMessageIdentity(event, message.type, false)")
	binaryIndex := strings.Index(messageBlock, "validateTerminalChannelMessageIdentity(event, \"\", true)")
	switchIndex := strings.Index(messageBlock, "switch (message.type)")
	binaryReplayIndex := strings.Index(messageBlock, "if (!sessionReplayIsAuthorized(session) && !sessionReplayIsCommitted(session)) {")
	if controlIndex < 0 || binaryIndex < 0 || switchIndex < 0 || binaryReplayIndex < 0 {
		t.Fatal("multiplexed terminal identity gate must cover control and binary messages")
	}
	if controlIndex > switchIndex || binaryIndex > binaryReplayIndex {
		t.Fatal("multiplexed terminal identity must be checked before control dispatch or binary replay handling")
	}
}

func TestRuntimeTerminalDiagnosticTimelineGuard(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		"const recordTerminalSessionEvent = (session, type, details = {}) => {",
		"channelGeneration: Number(session.connectionChannelGeneration || 0),",
		"attachGeneration: Number(session.terminalReplayGeneration || 0),",
		"receivedCursor: session.receivedHistoryCursor?.toString?.() || \"\",",
		"if (timeline.length > 96) {",
		"recordTerminalSessionEvent(pane, \"resize_request\",",
		"recordTerminalSessionEvent(session, \"resize_applied\",",
		"recordTerminalSessionEvent(session, \"history_replay_start\",",
		"recordTerminalSessionEvent(session, \"history_replay_complete\",",
		"recordTerminalSessionEvent(session, \"full_render_complete\");",
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal diagnostic timeline missing %q", want)
		}
	}
}

func TestTerminalNetworkMonitorBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_network_monitor_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal network monitor tests failed: %v\n%s", err, output)
	}
}

func TestInstancesLoaderBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "instances_loader_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("instances loader tests failed: %v\n%s", err, output)
	}
}

func TestKittyGraphicsBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "kitty_graphics_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("Kitty Graphics tests failed: %v\n%s", err, output)
	}
}

func TestRuntimeContainerCacheV2AndPWAContract(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(main.js) error = %v", err)
	}
	cacheData, err := os.ReadFile("runtime/static/terminal_cache_v2.js")
	if err != nil {
		t.Fatalf("ReadFile(terminal_cache_v2.js) error = %v", err)
	}
	workerData, err := os.ReadFile("runtime/static/service-worker.js")
	if err != nil {
		t.Fatalf("ReadFile(service-worker.js) error = %v", err)
	}
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(index.html) error = %v", err)
	}
	overviewPreviewData, err := os.ReadFile("runtime/static/terminal_overview_preview.js")
	if err != nil {
		t.Fatalf("ReadFile(terminal_overview_preview.js) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(style.css) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		`import { createInstancesLoader } from "./instances_loader.js";`,
		`import { createTerminalCacheV2 } from "./terminal_cache_v2.js";`,
		`import { createTerminalResizeScheduler } from "./terminal_resize_scheduler.js";`,
		`isClientInstanceName(session.name)`,
		`sessionHasTerminalCacheV2Protocol`,
		`sessionUsesLegacyHistoryCache = (session) => Boolean(session && isClientInstanceName(session.name))`,
		`socketUrl.searchParams.set("cache_protocol_version"`,
		`socketUrl.searchParams.set("workspace_generation"`,
		`validateSessionCacheV2ReplayIdentity`,
		`startSessionCacheV2WarmReplay`,
		`session.cacheV2WarmReplayReady`,
		`[terminal-cache-v2] warm replay ready`,
		"const terminalReplayWriteBatchBytes = 512 * 1024;",
		`const terminalCacheV2FlushBytes = 1 * 1024 * 1024;`,
		`const terminalCacheV2ReplayTimeoutMs = 2 * 1000;`,
		`const terminalCacheV2CompactionTargetBytes = 1 * 1024 * 1024;`,
		`prepareTabOverviewCachePreviews`,
		`pane.tabId !== activeTabId || !pane.renderReady || !pane.hasPresentedFrame`,
		`const liveFrame = pane?.renderReady && pane?.hasPresentedFrame ? liveCanvas : null;`,
		`const heldFrame = sessionTerminalFrameHoldIsCurrent(pane) ? pane.terminalFrameHold : null;`,
		`terminalFrameHoldIdentity`,
		`scheduleWorkspaceTabOverviewCachePreviews();`,
		`const loadPaneTabOverviewPreviewManifest = async (pane) => {`,
		`terminalCacheV2.loadManifest(expected)`,
		`Terminal cache overview manifest read timed out.`,
		`const sessionCanCaptureCacheV2Preview = (session) => {`,
		`scheduleSessionCacheV2PreviewCapture(session, { immediate: true });`,
		`const allowRecentOutput = session.cacheV2PreviewCaptureAllowRecentOutput === true;`,
		`const scheduleSessionCacheV2PreviewCapture = (session, { immediate = false } = {}) => {`,
		`session.cacheV2PreviewCaptureAllowRecentOutput = true;`,
		`session.connectionChannel !== "unified"`,
		`const scheduleTerminalCacheV2OrphanPreviewCleanup = () => {`,
		`terminalCacheV2.cleanupOrphanedPreviews({`,
		`clearSessionCacheV2OverviewPreview(session);`,
		`scheduleTabOverviewRender();`,
		`sessionCacheV2OverviewPreviewMatches`,
		`[terminal-cache-v2] overview preview load failed`,
		`applySessionCacheV2ServerSnapshot`,
		`session.cacheV2ServerSnapshotPending`,
		`beginSessionCacheV2Replay`,
		`|| !sessionReplayIsCommitted(session)`,
		`session.renderReady`,
		`session.shellEl?.dataset.previewReady !== "true"`,
		`requestTerminalStoragePersistence`,
		`[terminal-cache-v2] recovery metrics`,
		`workspaceReadyMs`,
		`localReplayBytes`,
		`serverReplayBytes`,
		`previewPreparedMs`,
		`previewLayoutMatch`,
		`previewMissReason`,
		`pageRealCanvasVisibleMs`,
		`const ghosttyInitPromise = initGhostty`,
		`loadSettings({ deferFontLoad: true })`,
		`const requestBootstrapWorkspace = () => {`,
		`const workspacePromise = (activeName ? requestBootstrapWorkspace() : instancesPromise.then(requestBootstrapWorkspace))`,
		`prepareSessionHistoryCache(activePane)`,
		`scheduleWorkspaceTabOverviewCachePreviews`,
		`connectPendingSessionsForTab(nextActiveTab, { allowHidden: true })`,
		`terminalCacheV2.compact(identity`,
		`navigator.serviceWorker.register("./service-worker.js"`,
		`withTerminalCacheProgressTimeout((reportProgress) => terminalCacheV2.readChunks`,
		`Terminal warm cache replay made no progress.`,
		`Terminal cache replay made no progress.`,
		`historyCacheReplayCommitSeq: 0,`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime cache-v2 guard missing %q", want)
		}
	}
	overviewPreviewSource := string(overviewPreviewData)
	for _, want := range []string{
		`const preview = await this.cache.loadPreview(snapshot);`,
		`(currentHistoryGeneration && currentHistoryGeneration !== String(snapshot.historyGeneration || "").trim())`,
		`this.matches(pane, prepared)`,
	} {
		if !strings.Contains(overviewPreviewSource, want) {
			t.Fatalf("terminal overview preview isolation guard missing %q", want)
		}
	}
	finishReplayBlock := sourceBetween(t, mainSource,
		"const finishSessionHistoryReplayIfReady = (session) => {",
		"const discardSessionOutputBuffers = (session) => {")
	commitIndex := strings.Index(finishReplayBlock, "const commit = flushSessionHistoryCacheWrites(session);")
	replayReadyIndex := strings.Index(finishReplayBlock, "session.replayComplete = true;")
	if commitIndex < 0 || replayReadyIndex <= commitIndex {
		t.Fatal("runtime history replay must start cache persistence before presenting the final canvas")
	}
	for _, want := range []string{
		`const commitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;`,
		`session.historyCacheReplayCommitSeq === commitSeq`,
		`session.historyCacheReplayCommitSeq = Number(session.historyCacheReplayCommitSeq || 0) + 1;`,
	} {
		if !strings.Contains(finishReplayBlock, want) && !strings.Contains(mainSource, want) {
			t.Fatalf("runtime background cache commit generation guard missing %q", want)
		}
	}
	if strings.Contains(finishReplayBlock[commitIndex:replayReadyIndex], "return false;") || strings.Contains(finishReplayBlock, "finishSessionHistoryReplayIfReady(session);") {
		t.Fatal("runtime final canvas must not wait for the background cache commit")
	}
	cacheSource := string(cacheData)
	appendBlock := sourceBetween(t, cacheSource,
		"const append = async (sourceIdentity, generation, chunks, { limitBytes, historyWindowLines = null } = {}) => {",
		"const readChunks = async (manifest, onChunk) => {")
	chunkPut := strings.Index(appendBlock, "await putChunk(store, identity, stored);")
	manifestPut := strings.Index(appendBlock, "await putManifest(store, manifest);")
	if chunkPut < 0 || manifestPut < 0 {
		t.Fatal("cache-v2 must write immutable bytes before committing its manifest")
	}
	if chunkPut > manifestPut {
		t.Fatal("cache-v2 append must commit its byte block before the manifest")
	}
	for _, want := range []string{
		`cacheScopeID: requiredText`,
		`workspaceGeneration: requiredText`,
		`tabID: requiredText`,
		`paneID: requiredText`,
		`historyGeneration: source.historyGeneration`,
		`checkpointCursor > endCursor`,
		`preview: previous.preview`,
		`const defaultReadConcurrency = 8;`,
		`const defaultWriteBlockBytes = 1 * 1024 * 1024;`,
		`const defaultCompactionMinChunks = 2;`,
		`const pending = new Map();`,
		`const fillReadAhead = () => {`,
		`pending.set(chunkIndex, loadChunk(normalized.chunks[chunkIndex]).then(`,
		`pending.delete(chunkIndex);`,
		`batchEnd: chunkIndex === normalized.chunks.length - 1`,
		`const compact = (sourceIdentity, {`,
		`compactedFromChunks: manifest.chunks.length`,
	} {
		if !strings.Contains(cacheSource, want) {
			t.Fatalf("cache-v2 isolation guard missing %q", want)
		}
	}
	workerSource := string(workerData)
	if !strings.Contains(workerSource, "${assetBase}tab_activation_scheduler.js") {
		t.Fatal("service worker must precache the tab activation scheduler")
	}
	if !strings.Contains(workerSource, "${assetBase}terminal_frame_release_scheduler.js") {
		t.Fatal("service worker must precache the terminal frame release scheduler")
	}
	if !strings.Contains(workerSource, "${assetBase}terminal_resize_scheduler.js") {
		t.Fatal("service worker must precache the terminal resize scheduler")
	}
	if !strings.Contains(workerSource, "${assetBase}terminal_resize_controller.js") {
		t.Fatal("service worker must precache the terminal resize controller")
	}
	if !strings.Contains(workerSource, "${assetBase}terminal_render_snapshot.js") {
		t.Fatal("service worker must precache terminal render snapshots")
	}
	if !strings.Contains(workerSource, "${assetBase}terminal_overview_preview.js") {
		t.Fatal("service worker must precache the terminal overview preview controller")
	}
	if !strings.Contains(mainSource, `import { TerminalOverviewPreviewController } from "./terminal_overview_preview.js";`) {
		t.Fatal("runtime must isolate terminal overview preview lifecycle in its controller module")
	}
	if !strings.Contains(mainSource, `resetSessionHistoryCache(session, historyGeneration, deltaFromCursor);`) || strings.Contains(mainSource, `;(session, historyGeneration, deltaFromCursor);`) {
		t.Fatal("cold snapshot replay must reset its cache manifest before appending history")
	}
	if !strings.Contains(workerSource, "${assetBase}terminal_fast_integrity.js") || !strings.Contains(workerSource, "${assetBase}terminal_replay_controller.js") {
		t.Fatal("service worker must precache replay integrity modules")
	}
	if !strings.Contains(workerSource, "${assetBase}instances_loader.js") {
		t.Fatal("service worker must precache the instances loader")
	}
	if !strings.Contains(workerSource, "${assetBase}kitty_graphics.js") {
		t.Fatal("service worker must precache Kitty Graphics support")
	}
	for _, want := range []string{
		`${assetBase}fullscreen_tui_touch.js`,
		`${assetBase}fullscreen_tui_touch_adapter.js`,
		`${assetBase}opencode_fullscreen_touch.js`,
		`${assetBase}opencode_fullscreen_touch_adapter.js`,
		`${assetBase}herdr_fullscreen_touch.js`,
		`${assetBase}herdr_fullscreen_touch_adapter.js`,
	} {
		if !strings.Contains(workerSource, want) {
			t.Fatalf("service worker must precache fullscreen TUI asset %q", want)
		}
	}
	for _, want := range []string{
		`url.pathname.includes("/api/")`,
		`url.pathname.endsWith("/ws")`,
		`url.pathname.includes("/__terminal_cache__/")`,
		`request.mode === "navigate"`,
		`url.pathname.includes("/assets/")`,
		`const assetVersion = "__LCMD_ASSET_VERSION__";`,
		`const assetBase = "__LCMD_ASSET_BASE__";`,
		`credentials: "same-origin"`,
		`const cached = await cache.match(request);`,
		`const currentVersionAsset = url.pathname.startsWith(assetBase);`,
		`if (currentVersionAsset && cached) {`,
		`const response = await fetch(request);`,
		`return cached || response;`,
	} {
		if !strings.Contains(workerSource, want) {
			t.Fatalf("service worker network-only guard missing %q", want)
		}
	}
	if !strings.Contains(string(indexData), `rel="manifest" href="__LCMD_ASSET_BASE__manifest.webmanifest" crossorigin="use-credentials"`) {
		t.Fatal("PWA manifest link is missing")
	}
	if !strings.Contains(string(indexData), `rel="apple-touch-icon" href="__LCMD_ASSET_BASE__icon-192.png"`) {
		t.Fatal("PWA Apple touch icon link is missing")
	}
	if strings.Contains(string(indexData), `./static/`) {
		t.Fatal("runtime index must not reference the legacy unversioned static path")
	}
	manifestData, err := os.ReadFile("runtime/static/manifest.webmanifest")
	if err != nil {
		t.Fatalf("ReadFile(manifest.webmanifest) error = %v", err)
	}
	for _, want := range []string{`"icon-192.png"`, `"icon-512.png"`, `"display": "standalone"`} {
		if !strings.Contains(string(manifestData), want) {
			t.Fatalf("PWA manifest guard missing %q", want)
		}
	}
	for _, path := range []string{"runtime/static/icon-192.png", "runtime/static/icon-512.png"} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("PWA icon %s is unavailable: %v", path, err)
		}
	}
	if !strings.Contains(string(styleData), ".terminal-cache-preview") {
		t.Fatal("terminal cache preview layer CSS is missing")
	}
	historyRangeIndex := strings.Index(mainSource, `const historyConnectRange = sessionHistoryRangeForConnect(session);`)
	warmStartIndex := strings.Index(mainSource, `const cacheV2WarmReplayStarted = cacheV2WarmSnapshot`)
	fastSocketStartIndex := strings.Index(mainSource, `currentSocket = new WebSocket(socketUrl.toString());`)
	multiplexedSocketStartIndex := strings.Index(mainSource, `currentSocket = multiplexedConnection.open({`)
	if historyRangeIndex < 0 || warmStartIndex < 0 || fastSocketStartIndex < 0 || multiplexedSocketStartIndex < 0 || historyRangeIndex > warmStartIndex || warmStartIndex > fastSocketStartIndex || warmStartIndex > multiplexedSocketStartIndex {
		t.Fatal("cache-v2 byte replay must start from the validated local range before WebSocket construction")
	}
	cacheV2ReplayBlock := sourceBetween(t, mainSource,
		`} else if (historyConnectRange.source === "cache-v2") {`,
		"} else {\n                    rejectHistorySync(\"unknown local history source\");")
	for _, want := range []string{
		`if (sessionCacheV2WarmReplayMatchesSnapshot(session, snapshot)) {`,
		`setSessionReplayAuthorization(session, "identified");`,
		`} else {`,
		`beginSessionCacheV2Replay(session, snapshot, deltaFromCursor, currentSocket, rejectHistorySync);`,
	} {
		if !strings.Contains(cacheV2ReplayBlock, want) {
			t.Fatalf("cache-v2 warm delta reuse guard missing %q", want)
		}
	}
	snapshotReplayBlock := sourceBetween(t, mainSource,
		`if (syncMode === "snapshot") {`,
		`} else {
                  if (!historyConnectRange`)
	for _, want := range []string{
		`const keepWarmState = Boolean(`,
		`sessionCacheV2WarmReplayMatchesSnapshot(session, snapshot)`,
		`snapshot.historyGeneration === historyGeneration`,
		`snapshot.endCursor <= serverEndCursor`,
		`const stageServerSnapshot = keepWarmState || session.hasPresentedFrame;`,
		`session.cacheV2ServerSnapshotPending = true;`,
	} {
		if !strings.Contains(snapshotReplayBlock, want) {
			t.Fatalf("snapshot staged-state guard missing %q", want)
		}
	}
	completeReplayBlock := sourceBetween(t, mainSource,
		`case "history-replay-complete":`,
		`case "agent-preparing":`)
	if !strings.Contains(completeReplayBlock, `applySessionCacheV2ServerSnapshot(session, currentSocket, rejectHistorySync);`) {
		t.Fatal("completed server snapshot must atomically replace the staged terminal state")
	}
	warmReplayBlock := sourceBetween(t, mainSource,
		"const stageSessionCacheV2WarmReplay = (session, snapshot) => {",
		"const applySessionCacheV2ServerSnapshot = (session, currentSocket, rejectHistorySync) => {")
	for _, want := range []string{
		`const runSessionCacheV2WarmReplay = (session, snapshot) => {`,
		`const startSessionCacheV2WarmReplay = (session, snapshot) => {`,
		`terminalCacheV2.readChunks(snapshot`,
		`flushSessionOutput(session, { force: true });`,
		`session.cacheV2WarmReplayReady = true;`,
		`markSessionCacheV2RecoveryMetric(session, "localReplayCompleteAt");`,
		`if (!session.cacheV2ServerSnapshotPending) {`,
		`drainSessionCacheV2NetworkQueue(session);`,
	} {
		if !strings.Contains(warmReplayBlock, want) {
			t.Fatalf("warm byte replay guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`batchEnd`,
		`cacheV2WarmFrameReady`,
		`terminalHasVisibleContent`,
		`localFirstFrameAt`,
		`renderPaneFullNow(session);`,
		`warm canvas`,
	} {
		if strings.Contains(warmReplayBlock, forbidden) {
			t.Fatalf("warm byte replay must stay hidden and unrendered, found %q", forbidden)
		}
	}
	renderReadyBlock := sourceBetween(t, mainSource,
		"const markPaneRenderedIfMeasurable = (session) => {",
		"const requestPaneFullRender = (session) => {")
	for _, want := range []string{
		`|| !sessionReplayIsCommitted(session)`,
	} {
		if !strings.Contains(renderReadyBlock, want) {
			t.Fatalf("completed replay presentation guard missing %q", want)
		}
	}
	inputReadyBlock := sourceBetween(t, mainSource,
		"const isSessionInputReady = (session) => (",
		"const sendSessionInputChunk = (session, data, { generated = false } = {}) => {")
	if !strings.Contains(inputReadyBlock, `sessionReplayIsCommitted(session)`) ||
		strings.Contains(inputReadyBlock, `session.renderReady`) ||
		strings.Contains(inputReadyBlock, `cacheV2WarmReplayReady`) {
		t.Fatal("terminal input readiness must not depend on the presentation frame")
	}
	prepareCacheBlock := sourceBetween(t, mainSource,
		"const prepareSessionHistoryCache = async (session) => {",
		"const flushSessionHistoryCacheWrites = (session) => {")
	failWarmReplayBlock := sourceBetween(t, mainSource,
		"const failSessionCacheV2WarmReplay = (session, replaySeq, error) => {",
		"const stageSessionCacheV2WarmReplay = (session, snapshot) => {")
	for _, want := range []string{
		`beginTerminalPresentationHold(session);`,
		`disableSessionHistoryCache(session, error);`,
		`noteSessionReplayFailure(session, error?.message || "local_cache_replay_failed")`,
	} {
		if !strings.Contains(failWarmReplayBlock, want) {
			t.Fatalf("cache warm failure fallback missing %q", want)
		}
	}
	queueAckResetBlock := sourceBetween(t, mainSource,
		"session.replayComplete = false;",
		"if (!cacheV2WarmReplayStarted) {")
	for _, want := range []string{
		`session.queueTurnReceivedCursor = null`,
		`session.queueTurnReceivedSequence = null`,
	} {
		if !strings.Contains(queueAckResetBlock, want) {
			t.Fatalf("queue ACK boundary reset missing %q", want)
		}
	}
	if strings.Contains(prepareCacheBlock, `prepareSessionCacheV2Preview(session, snapshot)`) {
		t.Fatal("container startup must replay cached bytes instead of waiting on a visual preview")
	}
	overviewBlock := sourceBetween(t, mainSource,
		"const loadPaneTabOverviewPreviewManifest = async (pane) => {",
		"const drawTabOverviewFallback = (ctx, x, y, width, height, colors) => {")
	for _, want := range []string{
		`const historyGeneration = String(pane?.historyGeneration || "").trim();`,
		`const expected = sessionTerminalCacheV2Identity(pane, historyGeneration);`,
		`terminalCacheV2.identityMatches(expected, snapshot, { requireHistory: Boolean(historyGeneration) })`,
	} {
		if !strings.Contains(overviewBlock, want) {
			t.Fatalf("tab overview cache preview guard missing %q", want)
		}
	}
	if strings.Contains(overviewBlock, `if (!historyGeneration || !sessionUsesTerminalCacheV2(pane))`) {
		t.Fatal("cold-start overview preview must load the pane manifest before hidden panes receive a history generation")
	}
	drawOverviewBlock := sourceBetween(t, mainSource,
		"const drawPaneOverviewPreview = (ctx, pane, x, y, width, height, colors) => {",
		"const drawLayoutOverviewPreview = (ctx, tab, node, x, y, width, height, colors) => {")
	for _, want := range []string{
		`const liveFrame = pane?.renderReady && pane?.hasPresentedFrame ? liveCanvas : null;`,
		`const heldFrame = sessionTerminalFrameHoldIsCurrent(pane) ? pane.terminalFrameHold : null;`,
		`pane?.tabId === activeTabId`,
		`liveFrame || cachedPreview || heldFrame`,
		`cachedPreview || heldFrame || (!sessionUsesTerminalCacheV2(pane) ? liveFrame : null)`,
		`sessionCacheV2OverviewPreviewMatches(pane, pane?.cacheV2OverviewPreview)`,
	} {
		if !strings.Contains(drawOverviewBlock, want) {
			t.Fatalf("tab overview must use an identity-checked cached preview for unopened tabs: missing %q", want)
		}
	}

	for _, marker := range []string{
		`  const applyTerminalFont = () => {`,
		`  const setTerminalFontSize = (size) => {`,
	} {
		end := `  const adjustTerminalFontSize = (delta) =>`
		if marker == `  const applyTerminalFont = () => {` {
			end = `  const syncFontEditControls = () => {`
		}
		body := sourceBetween(t, mainSource, marker, end)
		holdIndex := strings.Index(body, `beginTerminalPresentationHold(pane);`)
		fontUpdate := `pane.term.options.fontFamily = terminalOptionsBase.fontFamily;`
		if marker != `  const applyTerminalFont = () => {` {
			fontUpdate = `pane.term.options.fontSize = terminalFontSize;`
		}
		fontIndex := strings.Index(body, fontUpdate)
		if holdIndex < 0 || fontIndex < 0 || holdIndex > fontIndex {
			t.Fatalf("font changes must hold the prior terminal frame before updating Ghostty options")
		}
		if marker == `  const setTerminalFontSize = (size) => {` {
			for _, want := range []string{
				`const metricsGeneration = Number(session.fontMetricsGeneration || 0) + 1;`,
				`window.requestAnimationFrame(() => refresh(true));`,
				`window.setTimeout(() => refresh(true), 240);`,
			} {
				if !strings.Contains(mainSource, want) {
					t.Fatalf("font resize stabilization guard missing %q", want)
				}
			}
		}
	}
}

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

func TestRuntimeHomeNavigationUsesResolvedAdminURL(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"let lightOSHomeURLPromise = null;",
		"const normalizeLightOSHomeURL = (value) => {",
		`const targetURL = new URL(homeURL, window.location.href);`,
		`fetch("./api/lightos-admin-info", { cache: "no-store" })`,
		"lightOSHomeURL = normalizeLightOSHomeURL(info?.home_url);",
		"const lightOSHomeURLWithMobileRemoteDesktopPreference = (value) => {",
		`targetURL.searchParams.set("mobile_remote_desktop", mobileRemoteDesktopEnabled ? "1" : "0");`,
		"const targetURL = lightOSHomeURLWithMobileRemoteDesktopPreference(await loadLightOSHomeURL());",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime home navigation guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		"buildCurrentOriginHomeURL",
		`new URL("/", window.location.origin)`,
		"buildExplicitHomeURL",
		"resolveReferrerHomeURL",
		"document.referrer",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime home navigation must not use %q", forbidden)
		}
	}
}

func TestRuntimeShowsClientSettingsOnlyInIndependentClient(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	workerData, err := os.ReadFile("runtime/static/service-worker.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/service-worker.js) error = %v", err)
	}
	bridgeData, err := os.ReadFile("runtime/static/vendor/lzc-mobile-bridge-0.0.2.js")
	if err != nil {
		t.Fatalf("ReadFile(lzc-mobile-bridge) error = %v", err)
	}

	indexSource := string(indexData)
	for _, want := range []string{
		`id="settingsMenuButton"`,
		`id="clientSettingsMenuButton" type="button" hidden`,
		`<span class="instance-switcher-item-name">客户端设置</span>`,
		`<span class="instance-switcher-item-meta">打开客户端设置</span>`,
	} {
		if !strings.Contains(indexSource, want) {
			t.Fatalf("runtime client settings entry missing %q", want)
		}
	}
	if strings.Index(indexSource, `id="clientSettingsMenuButton"`) < strings.Index(indexSource, `id="settingsMenuButton"`) {
		t.Fatal("client settings entry must stay directly below WebShell settings")
	}

	mainSource := string(mainData)
	for _, want := range []string{
		`from "./vendor/lzc-mobile-bridge-0.0.2.js";`,
		`if (!await isIndependentClient())`,
		`clientSettingsMenuButton.hidden = false;`,
		`openConfigurationPage().catch`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime client settings behavior missing %q", want)
		}
	}
	if !strings.Contains(string(styleData), `.instance-switcher-action[hidden]`) {
		t.Fatal("hidden client settings entry must stay out of the switcher layout")
	}
	if !strings.Contains(string(workerData), `${assetBase}vendor/lzc-mobile-bridge-0.0.2.js`) {
		t.Fatal("service worker must cache the mobile bridge module with the app shell")
	}
	if !strings.Contains(string(bridgeData), `isIndependentClient: "IsIndependentClient"`) ||
		!strings.Contains(string(bridgeData), `openConfigurationPage: "OpenConfigurationPage"`) {
		t.Fatal("vendored lzc-mobile-bridge must expose client configuration methods")
	}

	packageData, err := os.ReadFile("package.yml")
	if err != nil {
		t.Fatalf("ReadFile(package.yml) error = %v", err)
	}
	assetVersion := packageVersion(packageData)
	handler := versionedStaticFileServer("runtime/static", func() string { return assetVersion })
	recorder := httptest.NewRecorder()
	requestPath := "/assets/" + assetVersion + "/vendor/lzc-mobile-bridge-0.0.2.js"
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, requestPath, nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("versioned mobile bridge status = %d, want 200", recorder.Code)
	}
	if got := recorder.Header().Get("Content-Type"); got != "text/javascript; charset=utf-8" {
		t.Fatalf("versioned mobile bridge Content-Type = %q", got)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("versioned mobile bridge Cache-Control = %q", got)
	}
}

func TestRuntimeIOSHostAlwaysHidesCloseButton(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	index := string(indexData)
	hostScript := `<script src="__LCMD_ASSET_BASE__ios_terminal_host.js"></script>`
	if !strings.Contains(index, hostScript) {
		t.Fatalf("runtime index missing iOS terminal host script")
	}
	if strings.Index(index, hostScript) > strings.Index(index, `<script type="module" src="__LCMD_ASSET_BASE__main.js"></script>`) {
		t.Fatalf("iOS terminal host script must load before the terminal module")
	}

	scriptData, err := os.ReadFile("runtime/static/ios_terminal_host.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/ios_terminal_host.js) error = %v", err)
	}
	source := string(scriptData)
	for _, want := range []string{
		`const lazycatIOSUserAgent = "Lazycat_103";`,
		`const closeButtonBridgeName = "SetCloseBtnShowStatus";`,
		`bridge.postMessage({ params: [false] });`,
		`document.addEventListener("DOMContentLoaded", reinforceHiddenCloseButton, { once: true });`,
		`window.addEventListener("pageshow", reinforceHiddenCloseButton);`,
		`window.addEventListener("focus", reinforceHiddenCloseButton);`,
		`document.addEventListener("visibilitychange", () => {`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("iOS terminal host guard missing %q", want)
		}
	}
	if strings.Contains(source, "params: [true]") {
		t.Fatalf("terminal page must never show the iOS host close button")
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
		`id="settingsDeviceHeartbeatToggle"`,
		"设备心跳",
		"定期上报当前设备在线状态，默认关闭",
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
	onlineDevicesButton := strings.Index(index, `id="settingsOnlineDevicesButton"`)
	deviceHeartbeatToggle := strings.Index(index, `id="settingsDeviceHeartbeatToggle"`)
	performanceMeterToggle := strings.Index(index, `id="settingsPerformanceMeterToggle"`)
	if onlineDevicesButton < 0 || deviceHeartbeatToggle < onlineDevicesButton || performanceMeterToggle < deviceHeartbeatToggle {
		t.Fatal("device heartbeat toggle must appear directly after online devices in debug options")
	}
	if strings.Contains(sourceBetween(t, index, `id="settingsDeviceHeartbeatToggle"`, `id="settingsPerformanceMeterToggle"`), " checked") {
		t.Fatal("device heartbeat toggle must default to disabled")
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
		`const settingsDeviceHeartbeatToggle = document.getElementById("settingsDeviceHeartbeatToggle");`,
		"const deviceHeartbeatStorageKey = `${storagePrefix}.deviceHeartbeat`;",
		`let deviceHeartbeatEnabled = window.localStorage.getItem(deviceHeartbeatStorageKey) === "true";`,
		"settingsDeviceHeartbeatToggle.checked = deviceHeartbeatEnabled;",
		"settingsDeviceHeartbeatToggle.disabled = !debugModeEnabled;",
		"if (debugModeEnabled && deviceHeartbeatEnabled) {",
		"if (disposed || !debugModeEnabled || !deviceHeartbeatEnabled || navigator.onLine === false) {",
		"if (!debugModeEnabled || !deviceHeartbeatEnabled) {",
		`settingsDeviceHeartbeatToggle?.addEventListener("change", () => {`,
		`window.localStorage.setItem(deviceHeartbeatStorageKey, deviceHeartbeatEnabled ? "true" : "false");`,
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

func TestRuntimeDebugModeControlsDebugTools(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	index := string(indexData)
	for _, want := range []string{
		`id="settingsMobileRemoteDesktopToggle"`,
		"允许移动端启用远程桌面",
		"允许在 LightOS 移动端首页显示远程桌面入口，默认关闭",
	} {
		if !strings.Contains(index, want) {
			t.Fatalf("runtime mobile remote desktop debug option missing %q", want)
		}
	}
	debugStart := strings.Index(index, `id="settingsDebugOptions" hidden`)
	remoteDesktopToggle := strings.Index(index, `id="settingsMobileRemoteDesktopToggle"`)
	debugEnd := -1
	if debugStart >= 0 {
		debugEnd = strings.Index(index[debugStart:], `id="settingsPanelTheme"`)
	}
	if debugStart < 0 || debugEnd < 0 || remoteDesktopToggle < debugStart || remoteDesktopToggle > debugStart+debugEnd {
		t.Fatal("mobile remote desktop toggle must remain inside the debug options panel")
	}
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
		"mountPerformanceMeter();",
		"unmountPerformanceMeter();",
		"const performanceMeterActive = debugModeEnabled && performanceMeterEnabled;",
		"const performanceTasksActive = debugModeEnabled && performanceTasksEnabled;",
		"performanceTaskMonitor.setEnabled(performanceTasksActive);",
		"settingsPerformanceMeterToggle.disabled = !debugModeEnabled;",
		"settingsPerformanceTasksToggle.disabled = !debugModeEnabled;",
		"syncDebugLogCapture();",
		"applyPerformanceMeterVisibility();",
		"applyPerformanceTaskMeterVisibility();",
		"applyTerminalNetworkMonitorVisibility();",
		"stopDeviceHeartbeat();",
		"if (debugModeEnabled && deviceHeartbeatEnabled) {",
		"closeDevicePanel();",
		"if (!debugModeEnabled) {\n      return;\n    }\n    closeContextMenu();",
		"performanceMeterEnabled = settingsPerformanceMeterToggle.checked;",
		"performanceTasksEnabled = settingsPerformanceTasksToggle.checked;",
		`const mobileRemoteDesktopStorageKey = "lightos-mobile-remote-desktop-enabled";`,
		`let mobileRemoteDesktopEnabled = window.localStorage.getItem(mobileRemoteDesktopStorageKey) === "true";`,
		"syncSettingsMobileRemoteDesktopToggle();",
		`settingsMobileRemoteDesktopToggle?.addEventListener("change", () => {`,
		`window.localStorage.setItem(mobileRemoteDesktopStorageKey, mobileRemoteDesktopEnabled ? "true" : "false");`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime debug mode guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		"performanceMeterEnabled = false;",
		"performanceTasksEnabled = false;",
		"mobileRemoteDesktopEnabled = false;",
		"window.localStorage.removeItem(mobileRemoteDesktopStorageKey)",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime debug mode must not gate feature state with %q", forbidden)
		}
	}
}

func TestRuntimeForcePCModeOverridesTopLevelLayoutChecks(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	index := string(indexData)
	for _, want := range []string{
		`id="settingsMobileRemoteDesktopToggle"`,
		"允许移动端启用远程桌面",
		`id="settingsForcePCModeToggle"`,
		"强制 PC 模式",
	} {
		if !strings.Contains(index, want) {
			t.Fatalf("runtime force PC option missing %q", want)
		}
	}

	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		"const forcePCModeStorageKey = `${storagePrefix}.forcePCMode`;",
		`let forcePCModeEnabled = window.localStorage.getItem(forcePCModeStorageKey) === "true";`,
		"const isForcePCModeActive = () => debugModeEnabled && forcePCModeEnabled;",
		"const isMobileLayout = () => !isForcePCModeActive() && Boolean(mobileLayoutQuery?.matches);",
		"const isTouchShortcutLayout = () => !isForcePCModeActive() && Boolean(touchShortcutLayoutQuery?.matches);",
		"const usesMobileViewportInsets = () => !isForcePCModeActive() && (isIOSPlatform() || isAndroidPlatform());",
		`settingsForcePCModeToggle?.addEventListener("change", () => {`,
		"syncForcePCModeState();",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime force PC top-level guard missing %q", want)
		}
	}

	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)
	for _, want := range []string{
		"body.force-pc-mode .tabs {",
		"body.force-pc-mode .settings-modal {",
		"body.force-pc-mode .mobile-shortcuts,",
		"body.force-pc-mode .app-shell,",
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime force PC style guard missing %q", want)
		}
	}
}

func TestRuntimePerformanceMeterIsLazilyMounted(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	indexSource := string(indexData)
	for _, forbidden := range []string{
		`id="performanceMeter"`,
		`id="performanceMeterFps"`,
		`id="performanceMeterRefresh"`,
		"-- FPS",
	} {
		if strings.Contains(indexSource, forbidden) {
			t.Fatalf("runtime FPS meter must not be mounted in initial HTML with %q", forbidden)
		}
	}

	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		"let performanceMeter = null;",
		"const mountPerformanceMeter = () => {",
		"if (performanceMeter?.isConnected) {",
		`meter.id = "performanceMeter";`,
		`fps.id = "performanceMeterFps";`,
		`refresh.id = "performanceMeterRefresh";`,
		"terminalArea.appendChild(meter);",
		"const unmountPerformanceMeter = () => {",
		"performanceMeter?.remove();",
		"performanceMeter = null;",
		"performanceMeterFps = null;",
		"performanceMeterRefresh = null;",
		"mountPerformanceMeter();",
		"stopPerformanceMeter();",
		"unmountPerformanceMeter();",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime lazy FPS meter guard missing %q", want)
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

func TestRuntimeDesktopAltPrintableKeysSendMetaEscapePrefix(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const isPrintableAsciiCharacter = (value) => {",
		"const terminalAltMetaInputFromEvent = (event) => {",
		"if (!(event instanceof KeyboardEvent) || !event.altKey || event.ctrlKey || event.metaKey) {",
		`event.getModifierState?.("AltGraph")`,
		"key = shortcutKeyFromEventCode(event);",
		"key = applyStickyShiftInput(key) || key;",
		"return `\\x1b${key}`;",
		"const altMetaInput = terminalAltMetaInputFromEvent(event);",
		"term.input(altMetaInput, true);",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime desktop alt meta guard missing %q", want)
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
		`focusTerminalInput(session, { requestMobileKeyboard: true });`,
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

func TestRuntimeTerminalSettingsPhysicalMachineInfo(t *testing.T) {
	data, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	source := string(data)
	clientTitle := strings.Index(source, `id="settingsPhysicalMachineTitle"`)
	multiScreenTitle := strings.Index(source, `id="settingsMultiScreenOutputTitle"`)
	if clientTitle < 0 || multiScreenTitle < 0 || clientTitle >= multiScreenTitle {
		t.Fatal("physical machine information must appear above multi-screen output information")
	}
	const want = "在懒猫微服 PC 客户端中启用「接入 LightOS」后，这台物理机将作为客户端实例接入 LightOS，并允许你从 LightOS 访问其终端和相关资源。"
	if !strings.Contains(source, want) {
		t.Fatalf("physical machine information text missing %q", want)
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

func TestRuntimeDesktopShortcutsBarSetting(t *testing.T) {
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	indexSource := string(indexData)
	mouseSection := sourceBetween(t, indexSource, `<section class="settings-section" aria-labelledby="settingsMouseTitle">`, `<section class="settings-section" aria-labelledby="settingsDesktopShortcutsBarTitle">`)
	if strings.Contains(mouseSection, `settingsDesktopShortcutsBarToggle`) {
		t.Fatal("desktop shortcuts bar option must not be nested in the mouse settings section")
	}
	shortcutsSection := sourceBetween(t, indexSource, `<section class="settings-section" aria-labelledby="settingsDesktopShortcutsBarTitle">`, `<section class="settings-section" aria-labelledby="settingsMultiScreenOutputTitle">`)
	for _, want := range []string{
		`<h3 id="settingsDesktopShortcutsBarTitle">快捷键栏</h3>`,
		`id="settingsDesktopShortcutsBarToggle"`,
		`在PC中开启底部快捷键栏`,
		`type="checkbox" />`,
	} {
		if !strings.Contains(shortcutsSection, want) {
			t.Fatalf("desktop shortcuts bar option missing %q from its settings section", want)
		}
	}
	if strings.Contains(shortcutsSection, `id="settingsDesktopShortcutsBarToggle" type="checkbox" checked`) {
		t.Fatal("desktop shortcuts bar must default to disabled")
	}

	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		`const settingsDesktopShortcutsBarToggle = document.getElementById("settingsDesktopShortcutsBarToggle");`,
		`let desktopShortcutsBarEnabled = false;`,
		`desktopShortcutsBarEnabled = state?.desktop_shortcuts_bar_enabled === true;`,
		`document.body.classList.toggle("desktop-shortcuts-bar-enabled", desktopShortcutsBarEnabled);`,
		`body: JSON.stringify({ desktop_shortcuts_bar_enabled: enabled }),`,
		`resizeActiveTabForCurrentDevice();`,
		`settingsDesktopShortcutsBarToggle?.addEventListener("change", () => {`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("desktop shortcuts bar runtime guard missing %q", want)
		}
	}

	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)
	for _, want := range []string{
		`@media (hover: hover) and (pointer: fine) {`,
		`body.desktop-shortcuts-bar-enabled .mobile-shortcuts {`,
		`body.desktop-shortcuts-bar-enabled .app-shell {`,
		`inset: 0 0 var(--mobile-shortcuts-total-height) 0;`,
		`body.desktop-shortcuts-bar-enabled .selection-sheet {`,
		`body.desktop-shortcuts-bar-enabled .network-banner {`,
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("desktop shortcuts bar CSS guard missing %q", want)
		}
	}
}

func TestRuntimeDesktopShortcutsDoNotRetainButtonFocus(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	bindBody := sourceBetween(t, source, `  const bindMobileShortcutButton = (button, shortcut) => {`, `  const renderMobileShortcuts = () => {`)
	for _, want := range []string{
		`button.addEventListener("mousedown", (event) => {`,
		`if (!isDesktopShortcutBarLayout()) {`,
		`event.preventDefault();`,
		`rememberShortcutSession();`,
		`button.blur();`,
	} {
		if !strings.Contains(bindBody, want) {
			t.Fatalf("desktop shortcut focus isolation guard missing %q", want)
		}
	}
	if !strings.Contains(source, `const isDesktopShortcutBarLayout = () => desktopShortcutsBarEnabled && !isTouchShortcutLayout();`) {
		t.Fatal("desktop shortcut layout guard is missing")
	}
	for _, forbidden := range []string{
		`const desktopShortcutPendingModifiers =`,
		`const activeShortcutModifiers =`,
		`event.pointerType === "mouse" && isDesktopShortcutBarLayout()`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("desktop shortcut focus fix must not replace mobile sticky state, found %q", forbidden)
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
		`if (!requiresTouchKeyboardDoubleTap() || event.touches.length !== 1 || !isTerminalTouchTarget(event.target)) {`,
		`if (!requiresTouchKeyboardDoubleTap() || !mobileTapTouchState) {`,
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime wide touch keyboard double-tap guard missing %q", want)
		}
	}
}

func TestRuntimeTouchKeyboardFocusPrecedesTouchConsumers(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	inputFocus := sourceBetween(t, source, `  const installTerminalInputFocus = (session) => {`, `  const installTerminalHostViewportGuard = (session) => {`)

	for _, want := range []string{
		`const shell = session?.shellEl;`,
		`const isTerminalTouchTarget = (target) => target instanceof Element && target.closest(".terminal-host") === host;`,
		`shell.addEventListener("touchstart", startMobileTap, { capture: true, passive: true });`,
		`shell.addEventListener("touchmove", moveMobileTap, { capture: true, passive: true });`,
		`shell.addEventListener("touchend", finishMobileTap, { capture: true, passive: false });`,
		`shell.addEventListener("touchend", settleMobileTap);`,
		`shell.addEventListener("touchcancel", cancelMobileTap, { capture: true, passive: true });`,
		`if (finishState?.event === event && !finishState.isDoubleTap) {`,
		`blurTerminalInput(session);`,
	} {
		if !strings.Contains(inputFocus, want) {
			t.Fatalf("runtime touch keyboard focus must observe gestures before terminal consumers, missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`host.addEventListener("touchstart"`,
		`host.addEventListener("touchmove"`,
		`host.addEventListener("touchend"`,
		`host.addEventListener("touchcancel"`,
	} {
		if strings.Contains(inputFocus, forbidden) {
			t.Fatalf("runtime touch keyboard focus must not depend on host bubbling, found %q", forbidden)
		}
	}

	finishMobileTap := sourceBetween(t, inputFocus, `    const finishMobileTap = (event) => {`, `    const cancelMobileTap = () => {`)
	if !strings.Contains(finishMobileTap, `forceMobileFocusTransition: true,`) {
		t.Fatal("runtime touch keyboard focus must run directly from touchend")
	}
	for _, forbidden := range []string{"requestAnimationFrame", "setTimeout", "Promise"} {
		if strings.Contains(finishMobileTap, forbidden) {
			t.Fatalf("runtime touch keyboard focus must stay synchronous with touchend, found %q", forbidden)
		}
	}

	installInputFocus := strings.Index(source, `installTerminalInputFocus(session);`)
	installMouseTracking := strings.Index(source, `installTerminalMouseTracking(session);`)
	if installInputFocus < 0 || installMouseTracking < 0 || installInputFocus > installMouseTracking {
		t.Fatal("runtime touch keyboard capture listener must be installed before terminal mouse tracking")
	}
	focusPosition := strings.Index(finishMobileTap, `focusTerminalInput(session, {`)
	preventPosition := strings.Index(finishMobileTap, `event.preventDefault();`)
	if focusPosition < 0 || preventPosition < 0 || focusPosition > preventPosition {
		t.Fatal("runtime touch keyboard focus must run before cancelling the Android touchend default action")
	}
}

func TestRuntimeAndroidKeyboardFocusStaysAboveCachedFrame(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(main.js) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(style.css) error = %v", err)
	}
	rendererData, err := os.ReadFile("runtime/static/ghostty-web.js")
	if err != nil {
		t.Fatalf("ReadFile(ghostty-web.js) error = %v", err)
	}
	mainSource := string(mainData)
	styleSource := string(styleData)
	rendererSource := string(rendererData)

	inputPosition := strings.Index(mainSource, `textarea.style.zIndex = "3";`)
	if inputPosition < 0 {
		t.Fatal("terminal helper textarea must stay above cached frame layers")
	}
	if !strings.Contains(mainSource, `terminalPreview.className = "terminal-cache-preview"`) {
		t.Fatal("terminal cache preview element is missing")
	}
	for _, want := range []string{
		`.terminal-host textarea {`,
		`position: absolute;`,
		`z-index: 3;`,
		`.terminal-cache-preview,`,
		`z-index: 1;`,
		`.terminal-composition-preview {`,
		`z-index: 2;`,
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime Android keyboard layer guard missing %q", want)
		}
	}
	if !strings.Contains(rendererSource, `this.canvas = document.createElement("canvas")`) ||
		!strings.Contains(rendererSource, `this.textarea = document.createElement("textarea")`) {
		t.Fatal("Ghostty terminal must keep canvas and helper textarea creation visible to the layer guard")
	}
	if strings.Index(rendererSource, `this.canvas = document.createElement("canvas")`) > strings.Index(rendererSource, `this.textarea = document.createElement("textarea")`) {
		t.Fatal("Ghostty helper textarea must remain associated with the canvas layer")
	}
	inputFocus := sourceBetween(t, mainSource, `  const requestAndroidSoftKeyboard = (textarea) => {`, `  const blurTerminalInput = (session) => {`)
	for _, want := range []string{
		`const keyboard = navigator.virtualKeyboard;`,
		`forceMobileFocusTransition = false,`,
		`const activateAndroidKeyboard = requestMobileKeyboard && isAndroidPlatform();`,
		`&& forceMobileFocusTransition`,
		`&& document.activeElement === textarea`,
		`textarea.blur();`,
		`textarea.style.pointerEvents = "auto";`,
		`textarea.focus({ preventScroll: true });`,
		`requestAndroidSoftKeyboard(textarea);`,
	} {
		if !strings.Contains(inputFocus, want) {
			t.Fatalf("runtime Android keyboard activation guard missing %q", want)
		}
	}
}

func TestRuntimeMobileKeyboardPanTracksRenderedTerminal(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(main.js) error = %v", err)
	}
	source := string(data)
	renderListener := sourceBetween(t, source,
		`const renderDisposable = typeof term.onRender === "function" ? term.onRender(() => {`,
		`    if (renderDisposable && typeof renderDisposable.dispose === "function") {`,
	)
	markPosition := strings.Index(renderListener, `markPaneRenderedIfMeasurable(session);`)
	panPosition := strings.Index(renderListener, `syncTerminalViewportPan(session);`)
	if markPosition < 0 || panPosition < 0 || panPosition < markPosition {
		t.Fatal("terminal render completion must refresh the mobile keyboard pan after committing the rendered cursor")
	}
	lockBranch := sourceBetween(t, source,
		`const captureTerminalInputViewportLock = (session) => {`,
		`const isKeyboardLikeViewportHeightChange = (previousHeight, nextHeight, { orientationChanged = false } = {}) => {`,
	)
	if strings.Contains(lockBranch, `panY:`) {
		t.Fatal("IME viewport lock must not freeze the cursor-driven terminal pan")
	}
	for _, want := range []string{
		`const keyboardOpenedAfterLock = Boolean(`,
		`inputLock.session.inputViewportLock = {`,
		`keyboardActive: true,`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("IME viewport lock must rebase after a delayed keyboard open, missing %q", want)
		}
	}
}

func TestRuntimeInitializationFocusCannotOverrideMobileKeyboard(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(main.js) error = %v", err)
	}
	source := string(data)
	inputFocus := sourceBetween(t, source,
		`  const focusTerminalInput = (session, {`,
		`  const blurTerminalInput = (session) => {`,
	)
	for _, want := range []string{
		`focusSource = "user",`,
		`focusSource === "system"`,
		`if (document.activeElement !== textarea) {`,
		`return false;`,
		`positionTerminalInput(session);`,
	} {
		if !strings.Contains(inputFocus, want) {
			t.Fatalf("mobile system focus isolation missing %q", want)
		}
	}
	if strings.Contains(sourceBetween(t, inputFocus,
		`// Initialization and connection callbacks must not steal or blur a mobile user gesture.`,
		`if (requiresTouchKeyboardDoubleTap() && performance.now() > Number(session?.allowMobileKeyboardFocusUntil || 0)) {`,
	), `blurTerminalInput(session);`) {
		t.Fatal("mobile system focus path must not blur the active user input")
	}
	if !strings.Contains(source, `term.focus = () => focusTerminalInput(session, { focusSource: "system" });`) {
		t.Fatal("terminal system focus calls must use the non-stealing focus source")
	}
	openBranch := sourceBetween(t, source,
		`currentSocket.addEventListener("open", () => {`,
		`currentSocket.addEventListener("message", (event) => {`,
	)
	if !strings.Contains(openBranch, `session.term.focus();`) {
		t.Fatal("socket open should retain desktop focus behavior through the guarded terminal focus wrapper")
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

func TestRuntimeTerminalScrollbackSettingPersistence(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	mainSource := string(mainData)
	indexSource := string(indexData)

	for _, want := range []string{
		`id="settingsScrollbackInput"`,
		`id="settingsScrollbackResetButton"`,
		`id="settingsFeedback" aria-live="polite"`,
	} {
		if !strings.Contains(indexSource, want) {
			t.Fatalf("runtime scrollback setting index guard missing %q", want)
		}
	}
	for _, want := range []string{
		`const defaultTerminalScrollback = 1000;`,
		`const applyTerminalScrollback = () => {`,
		`pane.term.options.scrollback = terminalOptionsBase.scrollback;`,
		`applyTerminalScrollback();`,
		`keepalive,`,
		`setSettingsFeedback(error.message || "滚动历史设置无效。", "error");`,
		`setSettingsFeedback("滚动历史设置已保存，刷新或新建终端后生效。", "success");`,
		`setSettingsFeedback(error.message || "滚动历史设置保存失败。", "error");`,
		`setSettingsFeedback("滚动历史已恢复默认，刷新或新建终端后生效。", "success");`,
		`setSettingsFeedback(error.message || "滚动历史恢复默认失败。", "error");`,
		`const flushPendingTerminalScrollbackSave = () => {`,
		`saveTerminalScrollbackFromInput({ keepalive: true, showFeedback: false })`,
		`window.addEventListener("pagehide", () => {`,
		`window.addEventListener("beforeunload", (event) => {`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime scrollback setting persistence guard missing %q", want)
		}
	}
	beforeUnload := sourceBetween(t, mainSource, `window.addEventListener("beforeunload", (event) => {`, `disposed = true;`)
	if !strings.Contains(beforeUnload, `flushPendingTerminalScrollbackSave();`) {
		t.Fatal("beforeunload must flush pending scrollback before any early return")
	}
	if strings.Index(beforeUnload, `flushPendingTerminalScrollbackSave();`) > strings.Index(beforeUnload, `hasCachedBusyPane()`) {
		t.Fatal("beforeunload scrollback flush must run before the busy-pane confirmation branch")
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
		`focusTerminalInput(targetSession, { requestMobileKeyboard: true });`,
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
		`const syncTerminalCompositionPreview = (session, {`,
		`maxWidth = width,`,
		`if (session.terminalHost && preview.parentElement !== session.terminalHost) {`,
		`session.terminalHost.appendChild(preview);`,
		`const text = session.composingIME ? terminalTextareaCompositionText(session) : "";`,
		`preview.textContent = text;`,
		"preview.style.left = `${x}px`;",
		"preview.style.maxWidth = `${Math.max(maxWidth, width, 2)}px`;",
		`preview.style.color = activeTheme.foreground;`,
		`preview.style.background = activeTheme.background;`,
		`const hostWidth = Math.max(width, Number(session.terminalHost?.clientWidth) || (Number(term.cols) || 1) * width);`,
		`const hostHeight = Math.max(height, Number(session.terminalHost?.clientHeight) || (Number(term.rows) || 1) * height);`,
		`const preserveAnchor = document.activeElement === textarea;`,
		`const previousAnchor = preserveAnchor ? session.terminalInputAnchor : null;`,
		`session.terminalInputAnchor = { top: anchorTop, indent: anchorIndent };`,
		`textarea.setAttribute("rows", "1");`,
		`textarea.setAttribute("wrap", "off");`,
		`textarea.style.left = "0px";`,
		"textarea.style.width = `${Math.max(hostWidth, 2)}px`;",
		"textarea.style.minHeight = `${height}px`;",
		"textarea.style.maxHeight = `${height}px`;",
		`textarea.style.opacity = "0.01";`,
		`textarea.style.outline = "0";`,
		`textarea.style.boxShadow = "none";`,
		`textarea.style.webkitAppearance = "none";`,
		`textarea.style.overflowY = "hidden";`,
		`textarea.style.overflowWrap = "normal";`,
		`textarea.style.wordBreak = "normal";`,
		"textarea.style.textIndent = `${anchorIndent}px`;",
		`textarea.scrollTop = 0;`,
		`maxWidth: Math.max(width, hostWidth - previewLeft),`,
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
		`const captureTerminalInputViewportLock = (session) => {`,
		`syncMobileVisualViewport({ detectOrientation: false, ignoreTerminalInputLock: true });`,
		`session.inputViewportLock = {`,
		`const releaseTerminalInputViewportLock = (session, { resync = true } = {}) => {`,
		`const activeTerminalInputViewportLock = () => {`,
		`if (!session?.inputViewportLock || document.activeElement !== textarea) {`,
		`if (composing && !session.inputViewportLock) {`,
		`captureTerminalInputViewportLock(session);`,
		`releaseTerminalInputViewportLock(session);`,
		`const syncMobileVisualViewport = ({ detectOrientation = true, ignoreTerminalInputLock = false } = {}) => {`,
		`let inputLock = ignoreTerminalInputLock ? null : activeTerminalInputViewportLock();`,
		`nextHeight - inputLock.viewportHeight > mobileKeyboardInsetThresholdPx`,
		`releaseTerminalInputViewportLock(inputLock.session, { resync: false });`,
		`const appliedHeight = inputLock?.viewportHeight || nextHeight;`,
		`syncTerminalViewportPan(inputLock.session);`,
		`const compositionPreview = document.createElement("span");`,
		`compositionPreview.className = "terminal-composition-preview";`,
		`terminalHost.appendChild(compositionPreview);`,
		`setTerminalTextareaCompositionText(session, event.data);`,
		`const clearTerminalPostCompositionInput = (session) => {`,
		`session.pendingCompositionInput = null;`,
		`const normalizeTerminalCompositionTextCandidates = (...values) => {`,
		`const terminalCompositionPreeditCandidates = (session, ...extraValues) => normalizeTerminalCompositionTextCandidates(`,
		`const isTerminalPostCompositionInputAlreadySent = (session, committed) => {`,
		`const armTerminalPostCompositionInput = (session, { preedit = "", preedits = [], committed = "", sent = false, suppressSeparator = false } = {}) => {`,
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
		`textarea.value = terminalInputDeleteBuffer;`,
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
	for _, forbidden := range []string{
		`const inputWidth = Math.max(width, hostWidth - left);`,
		"textarea.style.width = `${Math.max(inputWidth, 2)}px`;",
		"textarea.style.width = `${Math.max(width, 2)}px`;",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("runtime mobile IME helper textarea must not shrink to the remaining terminal row: %q", forbidden)
		}
	}
	if strings.Contains(source, `host.addEventListener("compositionupdate", () => scheduleTerminalHostViewportReset(session`) {
		t.Fatalf("runtime mobile IME preview should not keep host composition listeners active")
	}
	if strings.Contains(source, `const committedText = event.data || terminalTextareaCompositionText(session);`) {
		t.Fatalf("runtime mobile IME compositionend must not send preedit text when event.data is empty")
	}
	setComposingBranch := sourceBetween(t, source,
		`const setTerminalInputComposing = (session, composing) => {`,
		`  const clearTerminalPostCompositionInput = (session) => {`,
	)
	if strings.Contains(setComposingBranch, `releaseTerminalInputViewportLock(session);`) {
		t.Fatalf("runtime mobile IME viewport lock must survive compositionend until keyboard focus ends")
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
		`overflow-wrap: normal;`,
		`pointer-events: none;`,
		`word-break: normal;`,
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
		`const isMobileLayout = () => !isForcePCModeActive() && Boolean(mobileLayoutQuery?.matches);`,
		`const isTouchShortcutLayout = () => !isForcePCModeActive() && Boolean(touchShortcutLayoutQuery?.matches);`,
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
		`    justify-content: flex-start;`,
		`    justify-content: safe center;`,
		`    scroll-padding-inline: 8px;`,
		`.mobile-shortcut-row[data-mobile-shortcut-row="bottom"] button[data-kind="menu"] {`,
		`    margin-left: 8px;`,
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

func TestRuntimeTouchSelectionUsesTouchLayout(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		`let lastTerminalTouchContextMenuCandidate = null;`,
		`const isTouchSelectionLayout = () => isMobileLayout() || isTouchShortcutLayout();`,
		`const markTerminalTouchContextMenuCandidate = (touch) => {`,
		`const isRecentTerminalTouchContextMenu = (event) => {`,
		`const shouldSuppressTerminalContextMenu = (event) =>`,
		`isMobileLayout() || (isTouchSelectionLayout() && isRecentTerminalTouchContextMenu(event));`,
		`markTerminalTouchContextMenuCandidate(touch);`,
		`if (!shouldSuppressTerminalContextMenu(event)) {`,
		`if (shouldSuppressTerminalContextMenu(event)) {`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime touch selection guard missing %q", want)
		}
	}

	selectionBody := sourceBetween(t, mainSource, `  const mobileSelectionAutoScrollIntent = (session, clientY) => {`, `  const clearReconnectTimer = (session) => {`)
	for _, want := range []string{
		`if (session?.closed || !isTouchSelectionLayout()) {`,
		`if (!isTouchSelectionLayout() || event.touches.length !== 1) {`,
		`if (!state || touchState !== state || state.selecting || !isTouchSelectionLayout() || session.closed) {`,
		`!isTouchSelectionLayout()`,
	} {
		if !strings.Contains(selectionBody, want) {
			t.Fatalf("runtime touch selection body missing %q", want)
		}
	}
	if strings.Contains(selectionBody, `!isMobileLayout()`) {
		t.Fatal("runtime touch selection body must not restrict long-press selection to narrow mobile layout")
	}

	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	styleSource := string(styleData)
	touchStyle := sourceBetween(t, styleSource, "@media (hover: none), (pointer: coarse) {\n  .attachment-browser-backdrop {", `@media (hover: none) and (min-width: 641px), (pointer: coarse) and (min-width: 641px) {`)
	for _, want := range []string{
		`.mobile-selection-overlay {` + "\n" + `    position: absolute;`,
		`.mobile-selection-handle {` + "\n" + `    position: absolute;`,
		`.mobile-selection-handle-knob {`,
	} {
		if !strings.Contains(touchStyle, want) {
			t.Fatalf("runtime touch CSS must expose mobile selection handles on tablets, missing %q", want)
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
		`const usesMobileViewportInsets = () => !isForcePCModeActive() && (isIOSPlatform() || isAndroidPlatform());`,
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

func TestRuntimePersistsWorkspaceForLightOSHomeReload(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		`const workspaceRestoreStorageKey = "webshell.workspaceRestore";`,
		`String(searchParams?.get("last") || "").trim().toLowerCase() === "false"`,
		`workspaceRestoreDisabled(new URL(restoreURL, window.location.origin).searchParams)`,
		`restoreInitialWorkspaceLocation();`,
		`params.delete("view");`,
		`const rememberWorkspaceRestoreState = () => {`,
		`persistWorkspaceRestoreState(activeName, activeTabId);`,
		`workspaceRestoreDisabled(targetURL.searchParams)`,
		`targetURL.searchParams.delete("embed");`,
		`targetURL.searchParams.delete("last");`,
		`version: 1,`,
		"url: `${targetURL.pathname}${targetURL.search}${targetURL.hash}`",
		`updatedAt: Date.now(),`,
		`suppressWorkspaceRestoreOnce = true;`,
		`clearWorkspaceRestoreState();`,
		`workspaceRestoreHeartbeatTimer = window.setInterval(() => {`,
		`touchAllSessionHistoryCaches();`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime Lazycat shell reload guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`const workspaceRestoreTTL =`,
		`expiresAt: Date.now() + workspaceRestoreTTL`,
		`const expiresAt = Number(state?.expiresAt || 0);`,
	} {
		if strings.Contains(mainSource, forbidden) {
			t.Fatalf("runtime workspace restore state must remain persistent, found %q", forbidden)
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
		`currentSocket = new WebSocket(socketUrl.toString());`,
		`currentSocket = multiplexedConnection.open({`,
		`socketURL.searchParams.set("mode", "unified");`,
		`socketUrl.searchParams.set("transport_role", "unified");`,
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
		"const terminalOutputFlushMaxEntries = 8;",
		"const terminalOutputFlushTimeBudgetMs = 12;",
		"terminalRenderSuppressionReasons",
		"beginTerminalRenderSuppression(session, \"replay\");",
		"beginTerminalRenderSuppression(pane, \"resize\");",
		"endTerminalRenderSuppression(session, { render: false, reason: \"replay\" });",
		"endTerminalRenderSuppression(session, { render: false, reason: \"resize\" });", "const terminalOutputQueueSoftLimitBytes = 1 * 1024 * 1024;",
		"const terminalOutputMeasureChunkChars = 32 * 1024;",
		"const terminalOutputMeasureBuffer = new Uint8Array(terminalOutputMeasureChunkChars * 4);",
		"const maxQueuedTerminalOutputBytes = 4 * 1024 * 1024;",
		"const clearSessionOutputFlushSchedule = (session) => {",
		"const terminalOutputByteChunkEnd = (data, start, maxBytes) => {",
		"textEncoder.encodeInto(data.slice(offset, end), terminalOutputMeasureBuffer)",
		"const utf8ByteLengthForCodePoint = (codepoint) => (",
		"const byteLength = utf8ByteLengthForCodePoint(codepoint);",
		"const finishSessionHistoryReplayIfReady = (session) => {",
		"const flushSessionOutput = (session, {",
		"maxBytes = 0,",
		"maxEntries = 0,",
		"maxTimeMs = 0,",
		"recordTerminalRuntimeMetric(\"forceFlushBytes\", flushBytes);",
		"window.requestAnimationFrame(flush);",
		"session.outputQueue.push({",
		"outputQueueGeneration: 0,",
		"queueGeneration: session.outputQueueGeneration,",
		"replayController.beginLegacy({",
		"replayController.completeLegacy({",
		"session.replayControllerLegacyActive = true;",
		"session.replayControllerLegacyActive = false;",
		"pane.replayController?.reset();",
		"replayController.begin({",
		"replayController.beginLegacy({",
		"replayController.completeLegacy({",
		"session.replayControllerLegacyActive = false;",
		"session.queueReplayControllerActive = false;",
		"session.queueReplayControllerLegacy = false;",
		"const metadata = event.queueMetadata || {};",
		"metadata.sequence",
		"replayController.acceptBinary({",
		"replayController.complete({",
		"replayController.commit()",
		"connectionEpoch",
		"channelGeneration",
		"historyGeneration",
		"outputIdentityMismatch",
		"staleOutputQueueDrops",
		"beginTerminalPresentationHold(session);",
		"session.outputQueueGeneration = Number(session.outputQueueGeneration || 0) + 1;",
		"outputData.byteLength > outputChunkBytes",
		"entry.replayOutput",
		"? terminalReplayWriteBatchBytes",
		"finishSessionHistoryReplayIfReady(session) || flushSessionOutput(session);",
		"const trySendPendingQueueTurnAck = (session) => {",
		"session.pendingQueueTurnAck = null;",
		"queue_turn_ack_pending",
		"queue_turn_ack_sent",
		"flushSessionOutput(session, {",
		"maxTimeMs: terminalOutputFlushTimeBudgetMs,",
		"const handleTerminalOutputOverload = (session, reason) => {",
		"requestSessionHistoryReplay(session);",
		"const genericWebSocketStartupFallbacks = new Set([",
		"const isGenericWebSocketStartupFallback = (message) =>",
		"if (isGenericWebSocketStartupFallback(fallback)) {",
		"retrySessionConnectionAfterFailure(session, error, { allowHidden: true });",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime terminal batching guard missing %q", want)
		}
	}
	queueTurnBlock := sourceBetween(t, source,
		`case "queue-turn-complete":`,
		`case "agent-preparing":`)
	if strings.Contains(queueTurnBlock, "flushSessionOutput(session, { force: true });") {
		t.Fatal("Queue turn completion must not use an unbounded force flush")
	}
	if strings.Contains(source, "message exceeds maxTerminalOutputMessageBytes") || strings.Contains(source, "const maxTerminalOutputMessageBytes") {
		t.Fatal("a legal large output message must be split instead of rejected by message size")
	}
	if strings.Contains(source, "writeSessionWebShellError(session, message || fallback);") {
		t.Fatal("generic websocket startup fallbacks should not be written as terminal errors")
	}
}

func TestRuntimeTerminalHistoryRangeSyncAndCache(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	cacheData, err := os.ReadFile("runtime/static/terminal_history_cache.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/terminal_history_cache.js) error = %v", err)
	}
	mainSource := string(mainData)
	cacheSource := string(cacheData)

	mainSnippets := []string{
		`import { createTerminalHistoryCache } from "./terminal_history_cache.js";`,
		`const terminalHistoryCacheFlushBytes = 256 * 1024;`,
		`const terminalHistoryCacheFlushDelayMs = 50;`,
		`historyGeneration: "",`,
		`localBaseCursor: 0n,`,
		`receivedHistoryCursor: 0n,`,
		`appliedHistoryCursor: 0n,`,
		`persistedHistoryCursor: 0n,`,
		`socketUrl.searchParams.set("history_generation", historyConnectRange.generation);`,
		`socketUrl.searchParams.set("local_base_cursor", historyConnectRange.baseCursor.toString());`,
		`socketUrl.searchParams.set("local_end_cursor", historyConnectRange.endCursor.toString());`,
		`const modernHistoryProtocol = Boolean(historyGeneration && syncMode);`,
		`const historyConnectRange = sessionHistoryRangeForConnect(session);`,
		`const trackHistory = kind === "bytes" && session.historyProtocolActive;`,
		`disableSessionHistoryCache(session);`,
		`["snapshot", "delta", "current"].includes(syncMode)`,
		`historyConnectRange.source === "memory"`,
		`historyConnectRange.source === "cache"`,
		`queueSessionHistoryCacheWrite(session, data, batch.historyStartCursor, batch.historyEndCursor);`,
		`postWorkspaceAction("close_pane"`,
		`.then(() => destroySessionHistoryCache(pane))`,
		`flushAllSessionHistoryCaches();`,
	}
	for _, want := range mainSnippets {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime terminal history sync guard missing %q", want)
		}
	}
	for _, want := range []string{
		"const recordTerminalRuntimeMetric = (name, value = 1) => {",
		"const recordTerminalRuntimeMaxMetric = (name, value = 0) => {",
		"outputOverloads",
		"terminalOutputBatches",
		"terminalOutputBytes",
		"outputQueuedBytes",
		"outputQueuePeakBytes",
		"recordTerminalRuntimeMaxMetric(\"outputQueuePeakBytes\", session.outputQueueSize);",
		"session.outputQueueSize + byteLength > maxQueuedTerminalOutputBytes",
		"session.historyCacheWriteQueue.push({ startCursor, endCursor, data });",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime terminal performance guard missing %q", want)
		}
	}
	if strings.Contains(mainSource, "const copy = new Uint8Array(data);") {
		t.Fatal("terminal history cache queue must not copy already-owned output views")
	}

	cacheSnippets := []string{
		`database.createObjectStore("streams", { keyPath: "scopeKey" });`,
		`database.createObjectStore("chunks", { keyPath: "id" });`,
		`const scopeKeyFor = (selector, paneId) => JSON.stringify([`,
		`if (output[index - 1].endCursor !== output[index].startCursor)`,
		`const transaction = db.transaction(["streams", "chunks"], "readwrite");`,
		`stream.endCursor = chunk.endCursor.toString();`,
		`streamStore.put(stream);`,
		`const reset = async (selector, paneId, generation, cursor) => {`,
		`const cleanupExpired = async ({ now = Date.now() } = {}) => {`,
	}
	for _, want := range cacheSnippets {
		if !strings.Contains(cacheSource, want) {
			t.Fatalf("runtime terminal history cache guard missing %q", want)
		}
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
	wasmData, err := os.ReadFile("runtime/static/ghostty-vt.wasm")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/ghostty-vt.wasm) error = %v", err)
	}
	kittyData, err := os.ReadFile("runtime/static/kitty_graphics.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/kitty_graphics.js) error = %v", err)
	}
	mainSource := string(mainData)
	styleSource := string(styleData)
	rendererSource := string(rendererData)
	kittySource := string(kittyData)

	for _, want := range []string{
		"getScrollbarWidth() {",
		"return 3 + 5 * this.scrollbarHoverProgress;",
		"SCROLLBAR_HOVER_SENSOR_SIZE = 24",
		"SCROLLBAR_HOVER_ANIMATION_MS = 160",
		"setScrollbarHoverProgress",
		"updateScrollbarHover(g.clientX)",
		"scrollbarHoverAnimationFrame && (cancelAnimationFrame",
		"this.scrollbarHoverActive ? this.showScrollbar() : this.hideScrollbar();",
		"g.touch ? 18 : 8",
		"i = this.getScrollbarWidth()",
		"if (I < N || I > i)",
	} {
		if !strings.Contains(rendererSource, want) && !strings.Contains(mainSource, want) {
			t.Fatalf("runtime scrollbar hover expansion guard missing %q", want)
		}
	}

	mainSnippets := []string{
		"const terminalRuntimeClearSequence = \"\\x1b[2J\\x1b[3J\\x1b[H\";",
		"const clearTerminalCanvasPixels = (session) => {",
		"const canvas = term?.canvas || term?.renderer?.getCanvas?.();",
		"ctx.fillStyle = activeTheme?.background || terminalOptionsBase.theme?.background || \"#000000\";",
		"ctx.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);",
		"const advanceTerminalContentGeneration = (session) => {",
		"session.terminalContentGeneration = Number(session.terminalContentGeneration || 0) + 1;",
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
		"const markPaneSyncPending = (session) => {",
		"session.fullRenderPending = false;",
		"const invalidatePanePresentation = (session) => {",
		"session.term?.renderer?.clear?.();",
		"clearTerminalCanvasPixels(session);",
		"const holdSessionTerminalFrame = (session) => {",
		"const releaseSessionTerminalFrame = (session) => {",
		"const beginTerminalPresentationHold = (session) => {",
		"presentationCommitPending: false,",
		"session.shellEl.dataset.hasPresentedFrame = session.hasPresentedFrame ? \"true\" : \"false\";",
		"const markPaneRenderedIfMeasurable = (session) => {",
		"const commitTerminalPresentationIfReady = (session) => {",
		"!session.fullRenderPending",
		"const schedulePanePresentationRetry = (session, {",
		"presentationRetryPending: false,",
		"recordTerminalSessionEvent(session, \"presentation_render_failed\")",
		"recordTerminalSessionEvent(session, \"presentation_commit_complete\"",
		"|| session.activationFitPending",
		"!sessionReplayIsCommitted(session)",
		"session.pendingRenderFitGeneration !== session.measuredFitGeneration",
		"session.pendingRenderReplayGeneration !== session.terminalReplayGeneration",
		"session.pendingRenderContentGeneration !== session.terminalContentGeneration",
		"session.presentedContentGeneration === session.terminalContentGeneration",
		"terminalCanvasMatchesExpectedSize(session)",
		"session.hasPresentedFrame = true;",
		"!session.renderReady && !session.resizePresentationHold",
		"setPaneRenderReady(session, true);",
		"const panePresentationIsCurrent = (session) => {",
		"session.renderSnapshot.equals(current)",
		"const cancelPendingTerminalRender = (term) => {",
		"if (term.renderRetryTimer !== undefined) {",
		"window.clearTimeout(term.renderRetryTimer);",
		"const renderPaneFullNow = (session) => {",
		"session.pendingRenderFitGeneration = session.measuredFitGeneration;",
		"session.pendingRenderReplayGeneration = session.terminalReplayGeneration;",
		"session.pendingRenderContentGeneration = session.terminalContentGeneration;",
		"const fullRenderRequested = term.renderFullNextFrame === true;",
		"term.renderFullNextFrame = fullRenderRequested;",
		"const rendered = term.renderNow(true) !== false;",
		"recordTerminalSessionEvent(session, \"full_render_failed\");",
		"return rendered;",
		"const schedulePaneFullRenderValidation = (session, { forceHistory = false } = {}) => {",
		"const scrollbackLength = Math.max(0, Number(session.term?.getScrollbackLength?.() || 0));",
		"if (forceHistory && scrollbackLength > 0 && !presentationBlockedByResize && isPaneVisibleForSizing(session)) {",
		"ensurePanePresentation(session, {",
		"!panePresentationIsCurrent(session)",
		"const installTerminalCanvasRecovery = (session) => {",
		"canvas.addEventListener(\"contextlost\", handleContextLost);",
		"canvas.addEventListener(\"contextrestored\", handleContextRestored);",
		"session.shellEl.dataset.connection = \"open\";",
		"setPaneRenderReady(session, false);",
		"shellEl.dataset.renderReady = \"false\";",
		"initialRuntimeResetDone: false,",
		"measuredFitGeneration: 0,",
		"terminalReplayGeneration: 0,",
		"terminalContentGeneration: 0,",
		"pendingRenderContentGeneration: 0,",
		"presentedContentGeneration: 0,",
		"presentedFitGeneration: 0,",
		"presentedReplayGeneration: 0,",
		"fullRenderPending: false,",
		"fullRenderValidationTimer: 0,",
		"hasPresentedFrame: false,",
		"workspaceExitPending: false,",
		"activationFitPending: false,",
		"resizePresentationHold: false,",
		"import { createTerminalResizeScheduler } from \"./terminal_resize_scheduler.js\";",
		"const terminalResizeThrottleMs = 80;",
		`import { isKittyGraphicsResponse, installKittyGraphicsSupport, terminalPixelSize } from "./kitty_graphics.js";`,
		"installKittyGraphicsSupport(Terminal);",
		"const paneResizeScheduler = createTerminalResizeScheduler({",
		"const schedulePaneResize = (pane, options = {}, scheduleOptions = {}) => {",
		"if (isMobileKeyboardResizeSuppressed()) {",
		"Skip terminal resize holds while the mobile IME changes the viewport.",
		"const deferHiddenPaneRender = (session) => {",
		"const commitTerminalPresentationNow = (session) => {",
		"holdSessionTerminalFrame(pane);",
		"const ratio = Math.max(",
		"ctx.drawImage(source, 0, 0, hold.width, hold.height);",
		"const dimensionsWillChange = !dimensionsEqualTerminalSize(pane, fittedDimensions) || canvasNeedsResize;",
		"settlePresentation,",
		"const shouldSettlePresentation = settlePresentation === true",
		"if (!shouldSettlePresentation && pane.resizePresentationHold) {",
		"apply: (pane, options, { settled = true } = {}) => {",
		"if (!settled) {",
		"settlePresentation: true,",
		"settlePresentation: !session.resizePresentationHold,",
		"const shouldCommitAfterHold = pane.resizePresentationHold && pane.hasPresentedFrame;",
		"requestPaneFullRender(pane);",
		"commitTerminalPresentationNow(pane);",
		"cancelScheduledPaneResize(session);",
		"cleanupCallbacks: [],",
		"installTerminalCanvasRecovery(session);",
		"installTerminalResizeObserver(session);",
		"clearTerminalRuntimeBuffer(session);",
		"clearTerminalCanvasPixels(session);",
		`const renderDisposable = typeof term.onRender === "function" ? term.onRender(() => {`,
		"markPaneRenderedIfMeasurable(session);",
		"syncTerminalViewportPan(session);",
		"const resetTerminalForHistoryReplay = (session) => {",
		"beginTerminalRenderSuppression(session, \"replay\");",
		"session.resetOnNextReplay = false;",
		"if (!resetTerminalRuntimeState(session)) {",
		"const disposePane = (pane) => {",
		"clearTerminalCanvasPixels(pane);",
		"requestPaneFullRender(session);",
		"renderPaneFullNow(session);",
		"const replayWriter = (replayOutput || suppressRender) && typeof session.term.writeReplay === \"function\";",
		"((replayOutput || suppressRender) && !replayWriter)",
		"|| (!replayOutput && !suppressRender && deferHiddenPaneRender(session))",
		"cancelPendingTerminalRender(session.term);",
		"schedulePaneFullRenderValidation(session);",
		"reason: isPaneVisibleForSizing(session) ? \"presentation_validation\" : \"presentation_wait_measure\",",
	}
	for _, want := range mainSnippets {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime terminal canvas residue guard missing main snippet %q", want)
		}
	}
	for _, want := range []string{
		`if (syncMode === "snapshot") {`,
		`if (!resetTerminalForHistoryReplay(session)) {`,
		`if (historyConnectRange.source === "memory") {`,
		`if (!session.historyStateReady || session.appliedHistoryCursor !== deltaFromCursor) {`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime terminal replay mode guard missing %q", want)
		}
	}
	resetReplayBlock := sourceBetween(t, mainSource,
		"  const resetTerminalForHistoryReplay = (session) => {",
		"  const requestSessionHistoryReplay = (session) => {")
	for _, want := range []string{
		"terminalPaneHasKnownSize(session)",
		`session.lastHistoryResetFailureReason = "terminal_size_unavailable";`,
		`session.lastHistoryResetFailureReason = "runtime_reset_failed";`,
	} {
		if !strings.Contains(resetReplayBlock, want) {
			t.Fatalf("hidden terminal history replay guard missing %q", want)
		}
	}
	if strings.Contains(resetReplayBlock, "measuredFitGeneration || 0) <= 0") {
		t.Fatal("hidden pane history replay must not require a visible DOM fit generation")
	}
	for _, forbidden := range []string{
		"initialFitResetDone",
		"scheduleTerminalFullRenderWatchdog",
		"terminalFullRenderWatchdogIntervalMs",
		"installTerminalFullRenderGuard",
		"if (session.initialCols > 0 && session.initialRows > 0)",
	} {
		if strings.Contains(mainSource, forbidden) {
			t.Fatalf("runtime terminal replay regression detected: found %q", forbidden)
		}
	}

	styleSnippets := []string{
		`.pane-shell[data-render-ready="false"][data-has-presented-frame="false"] .terminal-host > canvas:not(.terminal-frame-hold) {`,
		"visibility: hidden;",
		".terminal-frame-hold",
		"object-fit: none;",
		"object-position: left bottom;",
	}
	for _, want := range styleSnippets {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime terminal canvas residue guard missing style snippet %q", want)
		}
	}

	rendererSnippets := []string{
		"const GHOSTTY_WASM_WRITE_CHUNK_BYTES = 128 * 1024;",
		"const GHOSTTY_WASM_WRITE_STRING_CHARS = 32 * 1024;",
		"const GHOSTTY_OUTPUT_RENDER_INTERVAL_MS = 33;",
		"const GHOSTTY_TEXT_ENCODER = new TextEncoder();",
		"Failed to allocate terminal input buffer",
		"this.inputBufferPtr = 0",
		"ensureInputBuffer(A)",
		"this.exports.ghostty_terminal_write(this.handle, this.inputBufferPtr, E.byteLength)",
		"this.exports.ghostty_wasm_free_u8_array(this.inputBufferPtr, this.inputBufferSize)",
		"this.writeBytes(A);",
		"writeReplay(A)",
		"this.renderSuppressionDepth += 1",
		"this.renderSuppressionDepth === 0 && A && this.isOpen && !this.isDisposed",
		"this.renderSuppressionDepth > 0",
		"this.renderFullNextFrame = !0",
		"this.renderThrottleTimer = void 0",
		"this.lastRenderAt = performance.now()",
		"async function oA(A)",
		"R || (R = await q.load(A))",
		"Incompatible Ghostty WASM: missing ghostty_terminal_get_scrollback_generation",
		"this.scrollbackByteCapacity = this.estimateScrollbackBytes(g, E)",
		"this.exports.ghostty_terminal_set_scrollback_limit(this.handle, g)",
		"this.ensureScrollbackCapacity(A, B)",
		"ghostty_terminal_get_scrollback_generation",
		"getScrollbackGeneration()",
		"this.renderStateCurrent = !1",
		"ensureRenderStateCurrent()",
		"this.renderDirtyState = O.FULL",
		"this.renderDirtyState = A",
		"this.renderDirtyState = O.NONE",
		"N = s - C >>> 0",
		"this.requestRender({ full: !0 })",
		"normalizeViewportBounds(A = this.viewportY)",
		"E.normalizeViewportBounds(requestedViewportY)",
		"this.ctx.fillRect(0, 0, this.canvas.width / this.devicePixelRatio, this.canvas.height / this.devicePixelRatio)",
		"this.ctx.fillRect(0, C, this.canvas.width / this.devicePixelRatio, this.metrics.height)",
		"i.text = D.grapheme_len > 0 && typeof A.getGraphemeString == \"function\" ? A.getGraphemeString(Math.floor(I / B.cols), I % B.cols) : String.fromCodePoint(D.codepoint || 32)",
		"text: I[w + 14] > 0 && typeof this.getScrollbackGraphemeString == \"function\" ? this.getScrollbackGraphemeString(A, i) : String.fromCodePoint(D.getUint32(w, !0) || 32)",
		"const text = typeof A.text == \"string\" ? A.text",
		"materializeViewportLines(A, B, g, E, C)",
		"const W = this.materializeViewportLines(A, D, g, i, E);",
		"if (!this.renderer.render(this.wasmTerm, A, this.viewportY, this, this.scrollbarOpacity))",
		"this.scheduleRenderRetry()",
		"this.renderRetryDelayMs = Math.min(250, A * 2)",
		"this.renderRetryTimer = window.setTimeout",
		"this.cancelRenderLoop(), this.isResizing = !0;",
		"if (this.isResizing)",
		"this.writeQueue || (this.writeQueue = []), this.writeQueue.push(A)",
		"this.flushWriteQueue();",
		"this.writeQueue && (this.writeQueue.length = 0)",
		"this.writeInternal(A);",
		"Terminal resize failed:",
		"this.graphemeBuffer = null",
		"const recordTerminalPerformance = (name, value = 1) => {",
		"max(counter, value = 0) {",
		"const recordTerminalTiming = (name, duration) => {",
		"wasmInputBytes",
		"wasmWriteCalls",
		"wasmWrite",
		"renderFrames",
		"fullRenderFrames",
		"incrementalRenderFrames",
		"canvasRender",
		"this.lastRenderFont = \"\"",
		"this.fontSize = A, this.lastRenderFont = \"\", this.metrics = this.measureFont();",
		"this.fontFamily = A, this.lastRenderFont = \"\", this.metrics = this.measureFont();",
		"this.rgbCache = new Map()",
		"this.rgbCache.size >= 512",
		"text === \" \" && !(A.flags & (e.UNDERLINE | e.STRIKETHROUGH)) && A.hyperlink_id !== this.hoveredHyperlinkId",
	}
	for _, want := range []string{
		"function installKittyGraphicsSupport",
		"var KITTY_TEXT_DECODE_CHUNK_BYTES = 128 * 1024;",
		"this.decoder = new TextDecoder();",
		"this.decoder.decode(data.subarray(offset, end), { stream: true })",
		"createImageBitmap",
		`type: "image/png"`,
		"graphics.consume(",
		"graphics.getPlacements()",
		"ctx.drawImage(",
		"terminal.requestRender({ full: true })",
		"terminal.input(response, true)",
		"const prefixLength = this.terminalControlBuffer.length;",
		"this.terminalControlBuffer = this.incompleteTerminalControlSuffix(combined);",
		"incompleteTerminalControlSuffix(data)",
		"this.decoder.decode()",
	} {
		if !strings.Contains(kittySource, want) {
			t.Fatalf("runtime Kitty Graphics guard missing %q", want)
		}
	}
	for _, want := range rendererSnippets {
		if !strings.Contains(rendererSource, want) {
			t.Fatalf("runtime terminal canvas residue guard missing renderer snippet %q", want)
		}
	}
	wasmWriteBlock := sourceBetween(t, rendererSource,
		"  writeBytes(A) {",
		"  resize(A, B) {")
	if strings.Contains(wasmWriteBlock, "ghostty_wasm_alloc_u8_array") || strings.Contains(wasmWriteBlock, "ghostty_wasm_free_u8_array") {
		t.Fatal("runtime Ghostty write hot path must reuse its instance input buffer")
	}
	if strings.Contains(rendererSource, "C !== void 0 && s !== void 0 ? s - C >>> 0") {
		t.Fatal("runtime must not silently fall back to scrollback length when generation ABI is missing")
	}
	queuedOutputBlock := sourceBetween(t, mainSource,
		"const writeTerminalOutputBatch =",
		"const finishSessionHistoryReplayIfReady =")
	for _, want := range []string{
		`const replayWriter = (replayOutput || suppressRender) && typeof session.term.writeReplay === "function";`,
		`session.term.writeReplay(data);`,
		`session.term.write(data);`,
		`if (!replayWriter && terminalRenderAllowed(session)) {`,
		`session.term.requestRender?.({ throttle: true });`,
		`((replayOutput || suppressRender) && !replayWriter)`,
		`|| (!replayOutput && !suppressRender && deferHiddenPaneRender(session))`,
	} {
		if !strings.Contains(queuedOutputBlock, want) {
			t.Fatalf("runtime queued PTY replay/render guard missing %q", want)
		}
	}
	writeReplayIndex := strings.Index(queuedOutputBlock, `session.term.writeReplay(data);`)
	normalWriteIndex := strings.Index(queuedOutputBlock, `session.term.write(data);`)
	renderIndex := strings.Index(queuedOutputBlock, `session.term.requestRender?.({ throttle: true });`)
	contentGenerationIndex := strings.Index(queuedOutputBlock, `advanceTerminalContentGeneration(session);`)
	if writeReplayIndex < 0 || normalWriteIndex < 0 || renderIndex <= normalWriteIndex || contentGenerationIndex <= renderIndex {
		t.Fatal("runtime queued PTY output must split replay writes from rendered live writes")
	}
	assertOutputRender := func(label, startMarker, endMarker string) {
		t.Helper()
		start := strings.Index(mainSource, startMarker)
		if start < 0 {
			t.Fatalf("runtime %s output guard missing start marker %q", label, startMarker)
		}
		endOffset := strings.Index(mainSource[start:], endMarker)
		if endOffset < 0 {
			t.Fatalf("runtime %s output guard missing end marker %q", label, endMarker)
		}
		body := mainSource[start : start+endOffset]
		writeIndex := strings.Index(body, `measurePerformanceTask("terminal render", () => session.term.write(data));`)
		renderIndex := strings.Index(body, `session.term.requestRender?.({ throttle: true });`)
		contentGenerationIndex := strings.Index(body, `advanceTerminalContentGeneration(session);`)
		if writeIndex < 0 || renderIndex <= writeIndex || contentGenerationIndex <= renderIndex {
			t.Fatalf("runtime %s output must write, request a throttled render, then advance content generation", label)
		}
	}
	assertOutputRender(
		"immediate PTY",
		"const writeSessionImmediateOutput =",
		"const readAgentStartupError =",
	)
	presentationBlock := sourceBetween(t, mainSource,
		"const beginTerminalPresentationHold = (session) => {",
		"const hideSessionTerminalPreview = (session) => {")
	if strings.Contains(presentationBlock, "scheduleTerminalPresentationCommit") || strings.Contains(presentationBlock, "terminalPresentationQuietMs") {
		t.Fatal("presentation hold must not wait for an output quiet window")
	}
	resizeBlock := sourceBetween(t, mainSource,
		"const resizePane = (pane, {",
		"const paneResizeScheduler = createTerminalResizeScheduler({")
	holdIndex := strings.Index(resizeBlock, "if (shouldHoldFrame) {")
	beginIndex := strings.Index(resizeBlock, "beginTerminalPresentationHold(pane);")
	dimensionsIndex := strings.Index(resizeBlock, "const dimensionsWillChange = !dimensionsEqualTerminalSize(pane, fittedDimensions) || canvasNeedsResize;")
	commitIndex := strings.Index(resizeBlock, "commitTerminalPresentationNow(pane);")
	if dimensionsIndex < 0 || holdIndex <= dimensionsIndex || beginIndex <= holdIndex || commitIndex <= beginIndex {
		t.Fatal("resize must enter a presentation hold only after confirming a geometry change, then commit its full render directly")
	}
	scheduleResizeBlock := sourceBetween(t, mainSource,
		"const schedulePaneResize = (pane, options = {}, scheduleOptions = {}) => {",
		"const cancelScheduledPaneResize = (pane) => {")
	if strings.Contains(scheduleResizeBlock, "beginTerminalPresentationHold") {
		t.Fatal("scheduling a resize must not freeze a current terminal before its geometry is measured")
	}
	resizeOutputBlock := sourceBetween(t, mainSource,
		"const writeTerminalOutputBatch = (session, data, replayOutput, allowGeneratedInput, suppressRender = false) => {",
		"const finishSessionHistoryReplayIfReady =")
	if strings.Contains(resizeOutputBlock, "deferPaneRenderDuringResize") {
		t.Fatal("normal PTY output must continue rendering while a presentation frame is held")
	}
	tabSwitchBlock := sourceBetween(t, mainSource,
		"const setActiveTab = (tabId, { focus = true, remember = true, rememberRecent = true } = {}) => {",
		"const renderLeaf = (tab, node) => {")
	preserveIndex := strings.Index(tabSwitchBlock, "preserveTabTerminalFrames(previousTab);")
	preserveTargetIndex := strings.Index(tabSwitchBlock, "preserveTabTerminalFrames(tab, { onlyIfStale: true });")
	activateIndex := strings.Index(tabSwitchBlock, "activeTabId = tab.id;")
	visualIndex := strings.Index(tabSwitchBlock, `item.button?.classList.toggle("active", isActive);`)
	deferredIndex := strings.Index(tabSwitchBlock, "tabActivationScheduler.schedule(tab.id, [")
	if preserveIndex < 0 || preserveTargetIndex < 0 || activateIndex < 0 || visualIndex < 0 || deferredIndex < 0 ||
		preserveIndex > preserveTargetIndex || preserveTargetIndex > activateIndex || activateIndex > visualIndex || visualIndex > deferredIndex ||
		!strings.Contains(tabSwitchBlock, "pane.terminalFrameHeld") {
		t.Fatal("tab switching must preserve both outgoing and incoming frames before visual selection, then defer terminal activation")
	}
	if !strings.Contains(tabSwitchBlock, "const presentationCurrent = panePresentationStateIsCurrent(pane);") {
		t.Fatal("tab activation must use hidden-safe presentation state instead of measurable visibility")
	}
	if !strings.Contains(tabSwitchBlock, "pane.activationFitPending = !presentationCurrent;") {
		t.Fatal("tab activation must preserve current panes without forcing a full render")
	}
	if strings.Contains(tabSwitchBlock, "pane.activationFitPending = !wasActive || !panePresentationIsCurrent(pane);") {
		t.Fatal("tab activation must not unconditionally invalidate a target pane")
	}
	if !strings.Contains(tabSwitchBlock, "const presentationCurrent = panePresentationStateIsCurrent(pane);") {
		t.Fatal("tab activation must use hidden-safe presentation state instead of measurable visibility")
	}
	if !strings.Contains(tabSwitchBlock, "pane.activationFitPending = !presentationCurrent;") {
		t.Fatal("tab activation must preserve current panes without forcing a full render")
	}
	if !strings.Contains(tabSwitchBlock, "if (!presentationCurrent) {") {
		t.Fatal("tab activation must only clear readiness for stale panes")
	}
	if !strings.Contains(tabSwitchBlock, "if (!wasActive && pane.terminalFrameHeld)") {
		t.Fatal("stale tab activation must retain the held frame while entering presentation recovery")
	}
	if strings.Contains(tabSwitchBlock, "pane.terminalFrameHeld);\n          pane.resizePresentationHold") {
		t.Fatal("tab activation must not clear readiness merely because a held frame is already protecting the pane")
	}
	visibleResizeBlock := sourceBetween(t, mainSource,
		"const scheduleVisibleTabResize = (tab, { immediate = false } = {}) => {",
		"const scheduleActiveTabWindowResize = () => {")
	if !strings.Contains(visibleResizeBlock, "if (panePresentationStateIsCurrent(pane) && !pane.activationFitPending) {") {
		t.Fatal("tab activation resize must skip a pane whose hidden-safe presentation state is current")
	}
	for _, forbidden := range []string{
		"scheduleVisibleTabResize(tab, { immediate: true });",
		"syncTerminalConnectionDemands(",
	} {
		visualPrefix := tabSwitchBlock[:deferredIndex]
		if strings.Contains(visualPrefix, forbidden) {
			t.Fatalf("tab visual selection must not synchronously run terminal initialization %q", forbidden)
		}
	}
	holdBlock := sourceBetween(t, mainSource,
		"const terminalFrameHoldIdentity = (session) => ({",
		"const beginTerminalPresentationHold = (session) => {")
	for _, want := range []string{
		`selector: String(session?.name || "").trim()`,
		`tabID: String(session?.tabId || "").trim()`,
		`paneID: String(session?.id || "").trim()`,
		`workspaceIdentity: workspaceCacheV2IdentityKey(session?.cacheV2WorkspaceIdentity)`,
		`historyGeneration: String(session?.historyGeneration || "").trim()`,
		`session.terminalFrameHoldIdentity = terminalFrameHoldIdentity(session);`,
		`session.terminalFrameHoldIdentity = null;`,
	} {
		if !strings.Contains(holdBlock, want) {
			t.Fatalf("held terminal overview frame identity guard missing %q", want)
		}
	}
	for _, want := range []string{
		"const panePresentationStateIsCurrent = (session) => {",
		"const panePresentationIsCurrent = (session) => {",
		"return isPaneMeasurable(session)",
		"terminalCanvasMatchesExpectedSize(session)",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("presentation current checks must separate hidden state from measurable geometry: missing %q", want)
		}
	}
	frameReleaseBlock := sourceBetween(t, mainSource,
		"const scheduleSessionTerminalFrameRelease = (session) => {",
		"const setPaneRenderReady = (session, ready) => {")
	for _, want := range []string{
		"terminalFrameReleaseScheduler.schedule(session, {",
		"session.tabId === activeTabId",
		"Number(session.renderGeneration || 0) === renderGeneration",
		"panePresentationIsCurrent(session)",
		"release: () => releaseSessionTerminalFrame(session)",
	} {
		if !strings.Contains(frameReleaseBlock, want) {
			t.Fatalf("terminal frame release must wait for a current composited presentation: missing %q", want)
		}
	}
	setReadyBlock := sourceBetween(t, mainSource,
		"const setPaneRenderReady = (session, ready) => {",
		"const panePresentationIsCurrent = (session) => {")
	if strings.Contains(setReadyBlock, "releaseSessionTerminalFrame(session);") {
		t.Fatal("render completion must not synchronously remove the last-known-good frame")
	}
	for _, want := range []string{
		"terminalFrameReleaseScheduler.cancel(session);",
		"scheduleSessionTerminalFrameRelease(session);",
	} {
		if !strings.Contains(setReadyBlock, want) {
			t.Fatalf("render readiness must coordinate delayed held-frame release: missing %q", want)
		}
	}
	previewBlock := sourceBetween(t, mainSource,
		"const captureSessionCacheV2Preview = async (session, captureSeq) => {",
		"const scheduleSessionCacheV2Compaction = (session) => {")
	for _, want := range []string{
		"const terminalCacheV2PreviewDelayMs = 3000;",
		"const terminalCacheV2PreviewRefreshMs = 2000;",
		"const sessionHasCurrentPresentedFrame = (session) => {",
		"session.hasPresentedFrame !== true",
		"session.presentedHistoryCursor !== session.appliedHistoryCursor",
		"if (!sessionHasCurrentPresentedFrame(session)) {",
		"const renderGeneration = Number(session.renderGeneration || 0);",
		"Number(session.renderGeneration || 0) !== renderGeneration",
		"performance.now() - Number(session.lastTerminalOutputAt || 0) < terminalCacheV2PreviewDelayMs",
		"window.requestIdleCallback(capture, { timeout: 1500 })",
		"await terminalCacheV2.savePreview(identity, session.historyGeneration, cursor, blob, {",
		"clearSessionCacheV2OverviewPreview(session);",
		"scheduleTabOverviewRender();",
		"session.cacheV2PreviewCapturePending = true;",
		"session.cacheV2PreviewCaptureRunning",
		"session.cacheV2PreviewCapturePending && !session.closed",
	} {
		if !strings.Contains(previewBlock, want) && !strings.Contains(mainSource, want) {
			t.Fatalf("cache preview must stay outside the active output render path: missing %q", want)
		}
	}
	if strings.Count(previewBlock, "performance.now() - Number(session.lastTerminalOutputAt || 0) < terminalCacheV2PreviewDelayMs") < 2 {
		t.Fatal("cache preview must recheck terminal output activity before and after image encoding")
	}
	if strings.Contains(rendererSource, "this.requestRender({ full: s })") {
		t.Fatal("terminal writes must not depend on scrollback generation alone for full redraws")
	}
	renderBlock := sourceBetween(t, rendererSource,
		"render(A, B = !1, g = 0, E, C = 1) {",
		"renderLine(A, B, g, E = 0) {")
	materializeIndex := strings.Index(renderBlock, "const W = this.materializeViewportLines(A, D, g, i, E);")
	canvasClearIndex := strings.Index(renderBlock, "B && (this.ctx.fillStyle = this.theme.background")
	if materializeIndex < 0 || canvasClearIndex < 0 || materializeIndex >= canvasClearIndex {
		t.Fatal("runtime renderer must materialize every visible row before clearing or committing the canvas")
	}
	if strings.Contains(renderBlock, "c = E.getScrollbackLine(F)") || strings.Contains(renderBlock, "c = A.getLine(F)") {
		t.Fatal("runtime renderer must not re-read terminal rows while committing a materialized frame")
	}
	if !strings.Contains(string(wasmData), "ghostty_terminal_get_scrollback_generation") {
		t.Fatal("vendored Ghostty WASM must export scrollback generation")
	}
	if !strings.Contains(mainSource, `const ghosttyInitPromise = initGhostty(runtimeAssetURL("./ghostty-vt.wasm"))`) {
		t.Fatal("runtime must explicitly initialize ghostty-web with the vendored WASM resource")
	}
	if !strings.Contains(mainSource, `const revisionChanged = Boolean(currentServerRevision && currentServerRevision !== nextRevision);`) {
		t.Fatal("runtime must detect an asset revision change even when the target cannot persist reload state")
	}
	if !strings.Contains(mainSource, `fetch(runtimeAssetURL("./themes.json"))`) {
		t.Fatal("runtime theme catalog must inherit the LPK-versioned asset path")
	}
	markSyncBlock := sourceBetween(t, mainSource,
		"const markPaneSyncPending = (session) => {",
		"const invalidatePanePresentation = (session) => {")
	for _, forbidden := range []string{"renderer?.clear", "clearTerminalCanvasPixels", "resetTerminalRuntimeState"} {
		if strings.Contains(markSyncBlock, forbidden) {
			t.Fatalf("transient terminal sync must preserve the last frame; found %q", forbidden)
		}
	}
}

func TestRuntimeOfflineFrameAndWorkspaceRetryGuard(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	mainSource := string(mainData)
	for _, want := range []string{
		"const workspaceRefreshRetryBaseDelayMs = 500;",
		"const workspaceRefreshRetryMaxDelayMs = 15 * 1000;",
		"const scheduleWorkspaceRefreshRetry = ({",
		"const refreshWorkspaceWithRetry = async (options = {}) => {",
		"workspaceRefreshRetryAttempts = Math.min(20, workspaceRefreshRetryAttempts + 1);",
		"scheduleWorkspaceRefreshRetry(context);",
		"case \"connection-error\":",
		"scheduleReconnect(session, { immediate: true });",
		"session.workspaceExitPending = true;",
		"refreshWorkspaceWithRetry({ focus: shouldFocusAfterExit })",
		"const stageServerSnapshot = keepWarmState || session.hasPresentedFrame;",
		"holdSessionTerminalFrame(session);",
		"reconnectWorkspaceSessions({ allowHidden: true });",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("offline terminal recovery guard missing %q", want)
		}
	}
	exitBlock := sourceBetween(t, mainSource,
		`case "process-exit":`,
		"        } catch (error) {")
	for _, forbidden := range []string{"destroySessionHistoryCache(session);", "disposePane(session);"} {
		if strings.Contains(exitBlock, forbidden) {
			t.Fatalf("process exit must wait for authoritative workspace refresh before %q", forbidden)
		}
	}
	connectionErrorBlock := sourceBetween(t, mainSource,
		`case "connection-error":`,
		`case "pong":`)
	for _, forbidden := range []string{"resetTerminalForHistoryReplay", "invalidatePanePresentation", "clearTerminalCanvasPixels", "resetOnNextReplay"} {
		if strings.Contains(connectionErrorBlock, forbidden) {
			t.Fatalf("retryable connection errors must preserve the last frame; found %q", forbidden)
		}
	}
	startupErrorBlock := sourceBetween(t, mainSource,
		"const showSessionStartupError = async (session, fallback = \"\") => {",
		"const detachSessionSocket =")
	warmFrameBlock := sourceBetween(t, startupErrorBlock,
		"if (session.hasPresentedFrame) {",
		"writeSessionWebShellError(session, message);")
	if !strings.Contains(warmFrameBlock, "showStartupErrorPanel(message);") {
		t.Fatal("warm-frame startup failures must remain visible in the startup error panel")
	}
	if strings.Contains(warmFrameBlock, "writeSessionImmediateOutput") {
		t.Fatal("warm-frame startup failures must not overwrite the preserved terminal frame")
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
		"const workspaceRefreshRetryBaseDelayMs = 500;",
		"const workspaceRefreshRetryMaxDelayMs = 15 * 1000;",
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
		"case \"connection-error\":",
		"const reconnectWorkspaceSessions = ({ allowHidden = true } = {}) => {",
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

func TestRuntimeConnectionStateDiagnosticsAndOneShotRevisionGuard(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	mainSource := string(mainData)
	styleSource := string(styleData)
	indexSource := string(indexData)

	for _, want := range []string{
		"const terminalWebSocketConnectTimeoutMs = 12 * 1000;",
		"const startSocketConnectTimer = (session, currentSocket) => {",
		"closeSessionSocketForReconnect(session, currentSocket, `Terminal WebSocket connect timed out",
		"const retrySessionConnectionAfterFailure = (session, error, { allowHidden = true } = {}) => {",
		"connectPendingSession(session, { allowHidden: allowHidden || force });",
		"const started = await connectSession(session, {",
		"terminalConnectionScheduler = createTerminalConnectionScheduler({",
		"const sessionConnectingState = (session) => (\n    session?.connectionRetrying === true ? \"reconnecting\" : \"connecting\"",
		"connectionRetrying: false,",
		"session.connectionRetrying = true;",
		"session.connectionRetrying = false;",
		"session.shellEl.dataset.connection = \"offline\";",
		"session.shellEl.dataset.connection = \"reconnecting\";",
		"session.connectionCloseReason = \"\";",
		"session.connectionRetrying = false;",
		"session.reconnectPending = false;",
		"\"终端连接将在重试\"",
		"appendDebugError(\"终端连接建立失败\"",
		"const debugLogStorageKey = `${storagePrefix}.debugLog`;",
		"const debugLogEntryLimit = 200;",
		"const debugLogDedupWindowMs = 5000;",
		"const debugLogLastSeen = new Map();",
		"const appendDebugLog = (level, message, details = \"\", { dedupeKey = \"\", retainWhenDisabled = false } = {}) => {",
		"const appendDebugError = (message, details = \"\") => appendDebugLog(\"error\", message, details);",
		"const appendDebugWarning = (message, details = \"\") => appendDebugLog(\"warn\", message, details);",
		"const appendStartupTrace = (event, details = \"\", { dedupeKey = event } = {}) => {",
		"entry.count = Number(entry.count || 1) + 1;",
		"count.textContent = `x${entry.count}`;",
		"debugLogLastSeen.clear();",
		"session.startupTraceActive = true;",
		"if (session.startupTraceActive) {",
		"[preview] PNG capture 完成",
		"const dedupeKey = `console:${level}:",
		"debugLogPanel.hidden = !debugModeEnabled || !debugLogEnabled;",
		"const removed = debugLogEntries.length - debugLogEntryLimit;",
		"debugLogEntries.splice(0, removed);",
		"const debugLogClipboardText = () => debugLogEntries",
		"debugLogCopy?.addEventListener(\"click\", async () => {",
		"showToast(\"暂无可复制的调试日志。\");",
		"showToast(\"调试日志已复制。\");",
		"showToast(\"复制调试日志失败。\");",
		"console[method] = capture;",
		"window.addEventListener(\"error\", handleDebugWindowError, true);",
		"window.addEventListener(\"unhandledrejection\", handleDebugUnhandledRejection);",
		"window.removeEventListener(\"error\", handleDebugWindowError, true);",
		"window.removeEventListener(\"unhandledrejection\", handleDebugUnhandledRejection);",
		"const handleDeviceHeartbeatError = (error) => {",
		"if (disposed || !debugModeEnabled || !deviceHeartbeatEnabled || navigator.onLine === false)",
		"const stopDeviceHeartbeat = () => {",
		"postDeviceHeartbeat().catch(handleDeviceHeartbeatError);",
		"if (debugModeEnabled && deviceHeartbeatEnabled) {\n      startDeviceHeartbeat();\n    }",
		"const scheduleInitialServerRevisionCheck = () => {",
		"serverRevisionInitialCheckTimer = window.setTimeout(() => {",
		"scheduleInitialServerRevisionCheck();",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime connection diagnostics guard missing %q", want)
		}
	}
	if strings.Contains(mainSource, "serverRevisionRefreshTimer") {
		t.Fatal("server revision must not keep a refresh loop timer")
	}
	initialRevisionBlock := sourceBetween(t, mainSource,
		"const scheduleInitialServerRevisionCheck = () => {",
		"const fetchWorkspaceState = async (name = activeName) => {")
	if strings.Count(initialRevisionBlock, "refreshServerRevision().catch(") != 1 {
		t.Fatal("initial server revision check must perform exactly one delayed request")
	}
	for _, want := range []string{
		`.pane-shell[data-connection="connecting"]::after`,
		`.pane-shell[data-connection="reconnecting"]::after`,
		`animation: pane-connection-breathe 1.35s ease-in-out infinite;`,
		`@keyframes pane-connection-breathe`,
		`.pane-shell[data-connection="offline"]::after`,
		`.pane-shell[data-connection="closed"]::after`,
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime connection indicator style guard missing %q", want)
		}
	}
	for _, want := range []string{
		`id="settingsDebugLogToggle"`,
		`id="debugLogPanel"`,
		`id="debugLogList"`,
		`id="debugLogCopy"`,
		`id="debugLogClear"`,
	} {
		if !strings.Contains(indexSource, want) {
			t.Fatalf("runtime debug log index guard missing %q", want)
		}
	}
	for _, want := range []string{
		".debug-log-panel {",
		"max-height: min(46vh, 360px);",
		".debug-log-panel-actions {",
		".debug-log-copy,",
		".debug-log-list {",
		"overflow: auto;",
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime debug log style guard missing %q", want)
		}
	}
}

func TestRuntimeTerminalConnectionSchedulerGuard(t *testing.T) {
	readSource := func(path string) string {
		t.Helper()
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile(%s) error = %v", path, err)
		}
		return string(data)
	}
	mainSource := readSource("runtime/static/main.js")
	schedulerSource := readSource("runtime/static/terminal_connection_scheduler.js")
	unifiedSource := readSource("runtime/static/terminal_unified_connection.js")
	healthSource := readSource("runtime/static/terminal_unified_health.js")
	membershipSource := readSource("runtime/static/terminal_unified_membership.js")
	queueSource := readSource("runtime/static/terminal_queue_connection.js")
	serviceWorkerSource := readSource("runtime/static/service-worker.js")

	for _, want := range []string{
		`import { createTerminalUnifiedMembership } from "./terminal_unified_membership.js";`,
		"const terminalUnifiedMembership = createTerminalUnifiedMembership();",
		"const refreshTerminalUnifiedMembership = ({",
		"const reconcileTerminalUnifiedMembership = () => {",
		"const connectTerminalUnifiedSession = (session) => {",
		"const detachTerminalUnifiedSession = (session, reason = \"membership_removed\") => {",
		"const scheduleTerminalUnifiedPaneRetry = (session, reason, { immediate = false } = {}) => {",
		"session.connectionChannel = \"unified\";",
		"session.unifiedStreamID = terminalUnifiedStreamID(session, generation);",
		"terminalUnifiedConnection?.setPriority(paneID, priority);",
		"const ensureTerminalUnifiedConnection = (targetName) => {",
		"handleTerminalUnifiedPhysicalDisconnect(observedConnection, reason);",
		"closeTerminalUnifiedConnection(\"transport_recovery\");",
		"const terminalUnifiedHealthCheckIntervalMs = 4 * 1000;",
		"let observedPhysicalReadyState = WebSocket.CLOSED;",
		"const previousPhysicalReadyState = observedPhysicalReadyState;",
		"const becameOpen = state.physicalReadyState === WebSocket.OPEN",
		"if (becameOpen) {",
		"terminalUnifiedHealthWatchdog?.probe(\"transport_open\");",
		"terminalConnectionScheduler = createTerminalConnectionScheduler({",
		"if (isClientInstanceName(instanceName)) {",
		"ensureClientTerminalConnectionScheduler().register(session);",
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("unified runtime guard missing %q", want)
		}
	}
	syncDemandBlock := sourceBetween(t, mainSource,
		"const syncTerminalConnectionDemands = ({",
		"const stopTerminalScrollAnimation = (term) => {",
	)
	for _, want := range []string{
		"if (disposed) {",
		"if (isClientInstanceName(activeName)) {",
		"syncClientTerminalConnectionDemands({ reason, interactionSession });",
		"refreshTerminalUnifiedMembership({ reason, interactionSession });",
	} {
		if !strings.Contains(syncDemandBlock, want) {
			t.Fatalf("unified demand routing guard missing %q", want)
		}
	}
	clientBranch := strings.Index(syncDemandBlock, "if (isClientInstanceName(activeName)) {")
	clientSync := strings.Index(syncDemandBlock, "syncClientTerminalConnectionDemands({ reason, interactionSession });")
	unifiedSync := strings.Index(syncDemandBlock, "refreshTerminalUnifiedMembership({ reason, interactionSession });")
	if clientBranch < 0 || clientSync < clientBranch || unifiedSync < clientSync {
		t.Fatal("terminal demand routing must keep client scheduler behind its target guard before Unified membership refresh")
	}
	for _, forbidden := range []string{
		"terminal_topology_controller.js",
		"createTerminalTopologyController",
		"terminalTopologyController",
		"terminalFastConnections",
		"terminalQueueConnection",
		"start-queue-transport",
		"sync-queue-candidates",
		"promote_to_fast",
		`connectionChannel === "queue"`,
		`channel: "queue"`,
		"createTerminalQueueStartupLatch",
	} {
		if strings.Contains(mainSource, forbidden) {
			t.Fatalf("ordinary container runtime retains obsolete Fast/Queue topology %q", forbidden)
		}
	}
	if count := strings.Count(mainSource, "connectSession(session,"); count != 2 {
		t.Fatalf("connectSession must only be called by unified membership and client direct scheduler, count=%d", count)
	}
	for _, want := range []string{
		"export const createTerminalUnifiedMembership = () => {",
		"const membershipChanged = targetChanged || added.length > 0 || removed.length > 0;",
		"if (membershipChanged) {",
		"priorities.push({ pane, priority });",
	} {
		if !strings.Contains(membershipSource, want) {
			t.Fatalf("unified membership module guard missing %q", want)
		}
	}
	for _, want := range []string{
		"export const createTerminalUnifiedConnection = ({",
		"keepAliveWhenEmpty: true,",
		`physicalRole: "unified"`,
	} {
		if !strings.Contains(unifiedSource, want) {
			t.Fatalf("unified connection guard missing %q", want)
		}
	}
	for _, want := range []string{
		"export const createTerminalUnifiedHealthWatchdog = ({",
		"current.ping?.()",
		"unified_pong_timeout",
		"state === socketClosed",
	} {
		if !strings.Contains(healthSource, want) {
			t.Fatalf("unified health guard missing %q", want)
		}
	}
	for _, want := range []string{
		"const normalizeCapacity = (value) => Math.max(1",
		`requestDisconnect(victim, "scheduler_preempt");`,
		"record.status = \"backoff\";",
	} {
		if !strings.Contains(schedulerSource, want) {
			t.Fatalf("client direct scheduler guard missing %q", want)
		}
	}
	if strings.Contains(queueSource, "physicalLastPongAt = Date.now();\n          emitState();") {
		t.Fatal("queue-pong must update physical health without emitting a transport state change")
	}
	if strings.Contains(mainSource, "if (state.physicalReadyState === WebSocket.OPEN) {\n          terminalUnifiedHealthWatchdog?.probe(\"transport_open\");") {
		t.Fatal("Unified owner must not probe on every OPEN snapshot")
	}
	if !strings.Contains(serviceWorkerSource, "terminal_unified_membership.js") {
		t.Fatal("service worker must precache terminal_unified_membership.js")
	}
	if strings.Contains(serviceWorkerSource, "terminal_topology_controller.js") {
		t.Fatal("service worker must not retain the deleted topology controller")
	}
}

func TestRuntimeTerminalNetworkMonitorIsOptIn(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	monitorData, err := os.ReadFile("runtime/static/terminal_network_monitor.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/terminal_network_monitor.js) error = %v", err)
	}
	queueData, err := os.ReadFile("runtime/static/terminal_queue_connection.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/terminal_queue_connection.js) error = %v", err)
	}
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	styleData, err := os.ReadFile("runtime/static/style.css")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/style.css) error = %v", err)
	}
	serviceWorkerData, err := os.ReadFile("runtime/static/service-worker.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/service-worker.js) error = %v", err)
	}
	mainSource := string(mainData)
	monitorSource := string(monitorData)
	queueSource := string(queueData)
	indexSource := string(indexData)
	styleSource := string(styleData)
	serviceWorkerSource := string(serviceWorkerData)

	for _, want := range []string{
		`id="settingsNetworkMonitorToggle"`,
		`id="terminalNetworkMonitor"`,
		`id="terminalNetworkMonitorStatus"`,
		`aria-label="未启用"`,
		`id="terminalNetworkMonitorUsage"`,
		`网络监视器`,
		`0.000 MB/s`,
		`0.000 MB`,
	} {
		if !strings.Contains(indexSource, want) {
			t.Fatalf("runtime terminal network monitor index guard missing %q", want)
		}
	}
	for _, want := range []string{
		"const networkMonitorStorageKey = `${storagePrefix}.networkMonitor`;",
		`let networkMonitorEnabled = window.localStorage.getItem(networkMonitorStorageKey) === "true";`,
		"const terminalNetworkMonitorEffectiveStatus = (snapshot) => {",
		"if (navigator.onLine === false) {",
		"return \"retrying\";",
		"terminalNetworkMonitorChannels.hidden = channels.length === 0;",
		"const terminalNetworkMonitorShouldRun = () => debugModeEnabled && networkMonitorEnabled && !disposed;",
		"terminalNetworkMonitor.setLayout(isClientInstanceName(activeName) ? \"direct\" : \"unified\");",
		`terminalNetworkMonitorModulePromise ||= import("./terminal_network_monitor.js");`,
		"terminalNetworkMonitor.attachSocket(unifiedSocket, { kind: \"unified\" });",
		"terminalNetworkMonitor?.dispose();",
		"window.clearInterval(terminalNetworkMonitorSampleTimer);",
		"window.setInterval(() => {",
		`settingsNetworkMonitorToggle?.addEventListener("change", () => {`,
		`window.localStorage.setItem(networkMonitorStorageKey, networkMonitorEnabled ? "true" : "false");`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime terminal network monitor main guard missing %q", want)
		}
	}
	if strings.Contains(mainSource, `import { createTerminalNetworkMonitor } from "./terminal_network_monitor.js";`) {
		t.Fatal("terminal network monitor must remain dynamically loaded only after opt-in")
	}
	if strings.Contains(serviceWorkerSource, "terminal_network_monitor.js") {
		t.Fatal("service worker must not prefetch the opt-in terminal network monitor")
	}
	for _, want := range []string{
		"export const terminalNetworkPayloadBytes = (payload) => {",
		"const renderedChannels = () => currentLayout === \"direct\" ? channels : [];",
		"const monitorStatus = () => {",
		"status: monitorStatus(),",
		"const totals = () => channels.reduce((result, channel) => ({",
		"const wrappedClose = function closeWithNetworkMeasurement(...args) {",
		"socket.addEventListener(type, listener);",
		"socket.removeEventListener(type, listener);",
		"delete socket.send;",
		"delete socket.close;",
		"detachAll({ emitChange: false });",
		"receivedBytesPerSecond",
		"sentBytesPerSecond",
		"totalBytes: channel.receivedBytes + channel.sentBytes",
		"bytesPerSecond: channel.receivedBytesPerSecond + channel.sentBytesPerSecond",
		"status: monitorStatus(),",
	} {
		if !strings.Contains(monitorSource, want) {
			t.Fatalf("terminal network monitor module guard missing %q", want)
		}
	}
	if !strings.Contains(queueSource, "getPhysicalSocket() {") {
		t.Fatal("terminal queue connection must expose its physical socket only for opt-in instrumentation")
	}
	if strings.Contains(styleSource, ".terminal-pane {\n  position: absolute;\n  inset: 0;\n  display: none;") {
		t.Fatal("tab switching must not tear down terminal pane layout with display:none")
	}
	for _, want := range []string{
		".terminal-pane {",
		"visibility: hidden;",
		"pointer-events: none;",
		".terminal-pane.active {",
		"visibility: visible;",
		"pointer-events: auto;",
		".terminal-network-monitor-title {",
		".terminal-network-monitor-status-dot {",
		".terminal-network-monitor-status-dot[data-state=\"open\"] {",
		".terminal-network-monitor-status-dot[data-state=\"error\"] {",
		".terminal-network-monitor-channel-metric-value {",
		".terminal-network-monitor-channel-detail {",
		".terminal-network-monitor-summary {",
		"font-variant-numeric: tabular-nums;",
		".debug-log-panel {",
		"border: 1px solid color-mix(in srgb, var(--terminal-fg) 28%, transparent);",
		"background: color-mix(in srgb, var(--terminal-bg) 86%, transparent);",
		"color: var(--terminal-fg);",
		".debug-log-entry-level-error {",
		".debug-log-entry-message {",
	} {
		if !strings.Contains(styleSource, want) {
			t.Fatalf("runtime terminal network monitor style guard missing %q", want)
		}
	}
	networkThemeBlock := sourceBetween(t, styleSource,
		".terminal-network-monitor {",
		".debug-log-panel {")
	debugThemeBlock := sourceBetween(t, styleSource,
		".debug-log-panel {",
		".terminal-composition-preview {")
	for _, block := range []struct {
		name   string
		source string
	}{
		{name: "network monitor", source: networkThemeBlock},
		{name: "debug log", source: debugThemeBlock},
	} {
		for _, want := range []string{
			"border: 1px solid color-mix(in srgb, var(--terminal-fg) 28%, transparent);",
			"background: color-mix(in srgb, var(--terminal-bg) 86%, transparent);",
			"color: var(--terminal-fg);",
		} {
			if !strings.Contains(block.source, want) {
				t.Fatalf("%s must follow the active terminal theme: missing %q", block.name, want)
			}
		}
		for _, forbidden := range []string{"#22d3ee", "#062c33", "#cffafe", "#fde68a"} {
			if strings.Contains(block.source, forbidden) {
				t.Fatalf("%s must not retain the fixed cyan palette %q", block.name, forbidden)
			}
		}
	}
	if strings.Contains(styleSource, "background: color-mix(in srgb, #450a0a 88%, var(--terminal-bg));") {
		t.Fatal("debug log panel must use the network monitor palette instead of an all-red background")
	}
	for _, want := range []string{
		`const level = entry.level === "error" ? document.createElement("span") : null;`,
		`level.textContent = "错误";`,
		`row.append(time);`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime debug log error-label guard missing %q", want)
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

func TestRuntimeClaudeFullscreenTouchAdapterIsolation(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	adapterData, err := os.ReadFile("runtime/static/claude_fullscreen_touch_adapter.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/claude_fullscreen_touch_adapter.js) error = %v", err)
	}
	mainSource := string(mainData)
	adapterSource := string(adapterData)

	for _, want := range []string{
		`import { isClaudeFullscreenTouchCandidate } from "./claude_fullscreen_touch.js";`,
		`import { installClaudeFullscreenTouchAdapter } from "./claude_fullscreen_touch_adapter.js";`,
		`const mobileKeyboardClaimedTouchEnds = new WeakSet();`,
		`mobileKeyboardClaimedTouchEnds.add(event);`,
		`isClaudeFullscreenTouchCandidate(session, {`,
		`mouseTracking: Boolean(terminalMouseTrackingState(session)),`,
		`const installClaudeTerminalTouchAdapter = (session) => {`,
		`consumeKeyboardClaim: (event) => mobileKeyboardClaimedTouchEnds.delete(event),`,
		`moveThresholdPx: touchShortcutMoveThresholdPx,`,
		`longPressDelayMs: touchSelectionLongPressDelayMs,`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime Claude fullscreen adapter guard missing %q", want)
		}
	}
	claudeTouchSession := sourceBetween(
		t,
		mainSource,
		`  const isClaudeFullscreenTouchSession = (session) => (`,
		`  const terminalMouseButtonFromEvent = (event) => {`,
	)
	if strings.Contains(claudeTouchSession, "AlternateScreen") || strings.Contains(claudeTouchSession, "alternateScreen") {
		t.Fatal("Claude fullscreen touch ownership must not depend on replayed alternate-screen state")
	}

	installInputFocus := strings.Index(mainSource, `installTerminalInputFocus(session);`)
	installMobileSelection := strings.Index(mainSource, `installMobileTouchSelection(session);`)
	installClaudeAdapter := strings.Index(mainSource, `installClaudeTerminalTouchAdapter(session);`)
	installMouseTracking := strings.Index(mainSource, `installTerminalMouseTracking(session);`)
	if installInputFocus < 0 || installMobileSelection < 0 || installClaudeAdapter < 0 || installMouseTracking < 0 {
		t.Fatal("runtime terminal touch installation order is incomplete")
	}
	if !(installInputFocus < installMobileSelection && installMobileSelection < installClaudeAdapter && installClaudeAdapter < installMouseTracking) {
		t.Fatal("runtime terminal touch order must be input focus, default selection, Claude adapter, generic mouse tracking")
	}

	genericMouseTracking := sourceBetween(
		t,
		mainSource,
		`  const installTerminalMouseTracking = (session) => {`,
		`  const compareSelectionCells = (left, right) => {`,
	)
	if strings.Contains(strings.ToLower(genericMouseTracking), "claude") {
		t.Fatal("generic terminal mouse tracking must not contain Claude-specific branches")
	}
	defaultSelection := sourceBetween(
		t,
		mainSource,
		`  const installMobileTouchSelection = (session) => {`,
		`  const installClaudeTerminalTouchAdapter = (session) => {`,
	)
	if !strings.Contains(defaultSelection, `|| terminalMouseTrackingState(session)`) {
		t.Fatal("default mobile selection must preserve its existing mouse-tracking guard")
	}

	for _, want := range []string{
		`stopEvent(event, { preventDefault: false });`,
		`const keyboardClaimed = consumeKeyboardClaim(event);`,
		`stopEvent(event, { preventDefault: !keyboardClaimed });`,
		`if (outcome === "keyboard" || outcome === "scrolling") {`,
		`const steps = gesture.takeWheelSteps(rowHeight(), 10);`,
		`if (clearSelectionIfTapOutside(touch) || hasSelection()) {`,
	} {
		if !strings.Contains(adapterSource, want) {
			t.Fatalf("Claude fullscreen touch adapter isolation missing %q", want)
		}
	}
}

func TestRuntimeOpencodeHerdrFullscreenTouchAdapterIsolation(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	for _, want := range []string{
		`import { isOpencodeFullscreenTouchCandidate } from "./opencode_fullscreen_touch.js";`,
		`import { installOpencodeFullscreenTouchAdapter } from "./opencode_fullscreen_touch_adapter.js";`,
		`import { isHerdrFullscreenTouchCandidate } from "./herdr_fullscreen_touch.js";`,
		`import { installHerdrFullscreenTouchAdapter } from "./herdr_fullscreen_touch_adapter.js";`,
		`const installOpencodeTerminalTouchAdapter = (session) => {`,
		`const installHerdrTerminalTouchAdapter = (session) => {`,
		`installOpencodeTerminalTouchAdapter(session);`,
		`installHerdrTerminalTouchAdapter(session);`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime opencode/herdr adapter guard missing %q", want)
		}
	}
	claudeSource := sourceBetween(t, source, `  const installClaudeTerminalTouchAdapter = (session) => {`, `  const installFullscreenTuiTerminalTouchAdapter = (session, candidate, installer) => {`)
	if strings.Contains(claudeSource, "Opencode") || strings.Contains(claudeSource, "Herdr") {
		t.Fatal("Claude touch adapter must not contain opencode/herdr branches")
	}
	genericSource := sourceBetween(t, source, `  const installTerminalMouseTracking = (session) => {`, `  const compareSelectionCells = (left, right) => {`)
	if strings.Contains(strings.ToLower(genericSource), "opencode") || strings.Contains(strings.ToLower(genericSource), "herdr") {
		t.Fatal("generic mouse tracking must not contain opencode/herdr-specific branches")
	}
	installSelection := strings.Index(source, `installMobileTouchSelection(session);`)
	installClaude := strings.Index(source, `installClaudeTerminalTouchAdapter(session);`)
	installOpencode := strings.Index(source, `installOpencodeTerminalTouchAdapter(session);`)
	installHerdr := strings.Index(source, `installHerdrTerminalTouchAdapter(session);`)
	installPi := strings.Index(source, `installPiTerminalTouchAdapter(session);`)
	installMouse := strings.Index(source, `installTerminalMouseTracking(session);`)
	if installSelection < 0 || installClaude < 0 || installOpencode < 0 || installHerdr < 0 || installPi < 0 || installMouse < 0 {
		t.Fatal("fullscreen TUI touch installation order is incomplete")
	}
	if !(installSelection < installClaude && installClaude < installOpencode && installOpencode < installHerdr && installHerdr < installPi && installPi < installMouse) {
		t.Fatal("tool-specific fullscreen TUI adapters must precede generic mouse tracking")
	}
}

func TestRuntimeClaudeFullscreenContextMenuIsolation(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	for _, want := range []string{
		`from "./claude_fullscreen_context_menu_adapter.js";`,
		`const terminalLocalMouseClaimedEvents = new WeakSet();`,
		`const isClaudeFullscreenContextMenuEvent = (session, event) => (`,
		`contextMenuSuppressed: shouldSuppressTerminalContextMenu(event),`,
		`const installClaudeTerminalContextMenuAdapter = (session) => {`,
		`claimEvent: (event) => terminalLocalMouseClaimedEvents.add(event),`,
		`if (terminalLocalMouseClaimedEvents.has(event)) {`,
		`installClaudeTerminalContextMenuAdapter(session);`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime Claude fullscreen context menu isolation missing %q", want)
		}
	}

	installClaudeTouch := strings.Index(source, `installClaudeTerminalTouchAdapter(session);`)
	installClaudeContextMenu := strings.Index(source, `installClaudeTerminalContextMenuAdapter(session);`)
	installMouseTracking := strings.Index(source, `installTerminalMouseTracking(session);`)
	if installClaudeTouch < 0 || installClaudeContextMenu < 0 || installMouseTracking < 0 {
		t.Fatal("runtime Claude context menu installation order is incomplete")
	}
	if !(installClaudeTouch < installClaudeContextMenu && installClaudeContextMenu < installMouseTracking) {
		t.Fatal("Claude context menu ownership must be installed before generic mouse tracking")
	}

	genericMouseTracking := sourceBetween(
		t,
		source,
		`  const installTerminalMouseTracking = (session) => {`,
		`  const compareSelectionCells = (left, right) => {`,
	)
	if strings.Contains(strings.ToLower(genericMouseTracking), "claude") {
		t.Fatal("generic terminal mouse tracking must not contain Claude-specific context menu branches")
	}
}

func TestRuntimeClaudeFullscreenDesktopSelectionIsolation(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	for _, want := range []string{
		`from "./claude_fullscreen_desktop_selection_adapter.js";`,
		`const isClaudeFullscreenDesktopSelectionEvent = (session, event) => (`,
		`touchSelectionLayout: isTouchSelectionLayout(),`,
		`applicationModifier: Boolean(event?.ctrlKey || event?.altKey || event?.metaKey),`,
		`const installClaudeTerminalDesktopSelectionAdapter = (session) => {`,
		`claimEvent: (event) => terminalLocalMouseClaimedEvents.add(event),`,
		`const press = encodeTerminalMouseSequence(session, event, "press", 0);`,
		`const release = encodeTerminalMouseSequence(session, event, "release", 0);`,
		`moveThresholdPx: desktopSelectionCopyMoveThresholdPx,`,
		`installClaudeTerminalDesktopSelectionAdapter(session);`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime Claude fullscreen desktop selection isolation missing %q", want)
		}
	}

	installContextMenu := strings.Index(source, `installClaudeTerminalContextMenuAdapter(session);`)
	installDesktopSelection := strings.Index(source, `installClaudeTerminalDesktopSelectionAdapter(session);`)
	installMouseTracking := strings.Index(source, `installTerminalMouseTracking(session);`)
	installDesktopClipboard := strings.Index(source, `installDesktopMouseClipboard(session);`)
	if installContextMenu < 0 || installDesktopSelection < 0 || installMouseTracking < 0 || installDesktopClipboard < 0 {
		t.Fatal("runtime Claude desktop selection installation order is incomplete")
	}
	if !(installContextMenu < installDesktopSelection && installDesktopSelection < installMouseTracking && installMouseTracking < installDesktopClipboard) {
		t.Fatal("Claude desktop selection ownership must precede generic mouse tracking and desktop clipboard handling")
	}

	genericMouseTracking := sourceBetween(
		t,
		source,
		`  const installTerminalMouseTracking = (session) => {`,
		`  const compareSelectionCells = (left, right) => {`,
	)
	if strings.Contains(strings.ToLower(genericMouseTracking), "claude") {
		t.Fatal("generic terminal mouse tracking must not contain Claude-specific desktop selection branches")
	}
	if strings.Count(genericMouseTracking, `terminalLocalMouseClaimedEvents.has(event)`) < 4 {
		t.Fatal("generic terminal mouse tracking must honor local ownership for down, move, up, and click-like events")
	}
}

func TestRuntimeTerminalSizeClaimSurvivesCrossClientResize(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	for _, want := range []string{
		`from "./terminal_size_sync.js";`,
		`const sendTerminalSize = (pane, { force = false, dimensions = null, claim = false } = {}) => {`,
		`shouldSendTerminalSize({`,
		`const claimTerminalSize = (pane, { force = false } = {}) => {`,
		`const claimTerminalSizeForCurrentDevice = (pane) => {`,
		`forceSizeSync: true,`,
		`settlePresentation: true,`,
		`sendTerminalSize(pane, { force: true, claim: true });`,
		`pane.serverCols = Math.max(0, Math.floor(Number(paneState.cols) || 0));`,
		`pane.serverRows = Math.max(0, Math.floor(Number(paneState.rows) || 0));`,
		`pane.serverPixelWidth = Math.max(0, Math.floor(Number(paneState.pixel_width) || 0));`,
		`pane.serverPixelHeight = Math.max(0, Math.floor(Number(paneState.pixel_height) || 0));`,
		`pane.sizeClaimRequired = terminalSizeDiffersFromServer({`,
		`resizePane(session, { forceSizeSync: true });`,
		`prepareMouseInput: () => claimTerminalSize(session, { force: true }),`,
		`const claimCurrentDeviceTerminalSize = (event) => {`,
		`claimTerminalSizeForCurrentDevice(session);`,
		`shell.addEventListener("pointerdown", claimCurrentDeviceTerminalSize, { capture: true, passive: true });`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime cross-client terminal size claim missing %q", want)
		}
	}
	claimBlock := sourceBetween(t, source,
		`const claimTerminalSizeForCurrentDevice = (pane) => {`,
		`const resizeTabForCurrentDevice = (tab, options = {}) => {`)
	if strings.Contains(claimBlock, `beginTerminalPresentationHold(pane);`) {
		t.Fatal("a size claim without a geometry change must not freeze terminal rendering")
	}

	startMobileTap := sourceBetween(
		t,
		source,
		`    const startMobileTap = (event) => {`,
		`    const moveMobileTap = (event) => {`,
	)
	claimIndex := strings.Index(startMobileTap, `claimTerminalSizeForCurrentDevice(session);`)
	blurIndex := strings.Index(startMobileTap, `blurTerminalInput(session);`)
	if claimIndex < 0 || blurIndex < 0 || claimIndex > blurIndex {
		t.Fatal("mobile touchstart must fit and reclaim terminal size before keyboard and touch consumers")
	}

	for _, marker := range []string{
		`document.addEventListener("visibilitychange", () => {`,
		`window.addEventListener("focus", () => {`,
		`window.addEventListener("pageshow", () => {`,
	} {
		body := sourceBetween(t, source, marker, `  });`)
		if !strings.Contains(body, `claimTerminalSize(activeSession());`) {
			t.Fatalf("runtime lifecycle size claim missing after %q", marker)
		}
	}
}

func TestRuntimeGrokMouseTrackingPreservesMobileDoubleTapKeyboard(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	detectionStart := strings.Index(source, "const grokExecutableNamePattern =")
	detectionEnd := strings.Index(source, "const terminalMouseModeEnabled =")
	if detectionStart < 0 || detectionEnd <= detectionStart {
		t.Fatal("runtime Grok terminal detection guard is missing")
	}
	detection := source[detectionStart:detectionEnd]
	for _, want := range []string{
		`const grokExecutableNamePattern = /^grok(?:-\d+(?:\.\d+){1,3})?$/i;`,
		`const isGrokTerminalSession = (session) => {`,
		`isGrokExecutableToken(session?.command)`,
		`isOfficialGrokEntrypoint(commandTokens[0])`,
		`["node", "nodejs", "bun", "deno"].includes(launcher)`,
		`String(session?.title || "").trim().toLowerCase() === "grok"`,
	} {
		if !strings.Contains(detection, want) {
			t.Fatalf("runtime Grok terminal detection missing %q", want)
		}
	}
	if strings.Contains(detection, `.includes("grok")`) {
		t.Fatal("runtime Grok terminal detection must not use a broad substring match")
	}

	focusStart := strings.Index(source, "const finishGrokTouchKeyboardTap =")
	if focusStart < 0 {
		t.Fatal("runtime Grok touch keyboard focus guard is missing")
	}
	focusEnd := strings.Index(source[focusStart:], "const handleMouseDown =")
	if focusEnd < 0 {
		t.Fatal("runtime Grok touch keyboard focus guard has no bounded end")
	}
	focusBranch := source[focusStart : focusStart+focusEnd]
	for _, want := range []string{
		`event.type === "touchend"`,
		`Math.abs(touch.clientX - grokTouchKeyboardState.startX) < touchShortcutMoveThresholdPx`,
		`Math.abs(touch.clientY - grokTouchKeyboardState.startY) < touchShortcutMoveThresholdPx`,
		`now - grokTouchKeyboardState.startedAt <= mobileKeyboardDoubleTapDelayMs`,
		`now - previousTapAt <= mobileKeyboardDoubleTapDelayMs`,
		`Math.hypot(dx, dy) < touchShortcutMoveThresholdPx * 2`,
		`isGrokTerminalSession(session)`,
		`terminalMouseTrackingState(session)`,
		`sendMouseSequence(mouseEvent, "press", 0);`,
		`sendMouseSequence(mouseEvent, "release", 0);`,
		`resetGrokTouchKeyboardState(true);`,
		`session.allowMobileKeyboardFocusUntil = now + mobileKeyboardFocusAllowWindowMs;`,
		`requestMobileKeyboard: true,`,
		`forceMobileFocusTransition: true,`,
	} {
		if !strings.Contains(focusBranch, want) {
			t.Fatalf("runtime Grok touch keyboard focus missing %q", want)
		}
	}
	if strings.Contains(focusBranch, "requestAnimationFrame") {
		t.Fatal("runtime Grok touch keyboard focus must stay synchronous with touchend")
	}
	for _, want := range []string{
		`touchMouseState.deferredClick = requiresTouchKeyboardDoubleTap() && isGrokTerminalSession(session);`,
		`if (touchMouseState.deferredClick) {`,
		`session.allowMobileKeyboardFocusUntil = 0;`,
		`blurTerminalInput(session);`,
		`const flushGrokTouchWheel = (event, touch) => {`,
		`grokTouchKeyboardState.wheelRemainderY += previousY - touch.clientY;`,
		`sendMouseSequence(wheelEvent, "wheel");`,
		`flushGrokTouchWheel(event, touch);`,
		`finishGrokTouchKeyboardTap(event, touch);`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime Grok mouse tracking compatibility missing %q", want)
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

func TestRuntimeTerminalConfirmedIMEDeleteUsesNativeMutation(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)
	deleteBranchStart := strings.Index(source, "if (\n      isBackwardDeleteInputType(type)")
	compositionBranchStart := strings.Index(source, `if (type === "insertCompositionText" || type === "deleteCompositionText" || event.isComposing) {`)
	if deleteBranchStart < 0 || compositionBranchStart < 0 || deleteBranchStart >= compositionBranchStart {
		t.Fatal("confirmed IME native-delete branch must run before the generic composition branch")
	}
	deleteBranch := sourceBetween(t, source,
		"if (\n      isBackwardDeleteInputType(type)",
		`if (session?.nativeDeleteInputPending) {`,
	)
	for _, want := range []string{
		`clearTerminalPostCompositionInput(session);`,
		`const terminalInputDeleteBufferLength = 256;`,
		`const terminalInputDeleteBuffer = terminalInputSentinel.repeat(terminalInputDeleteBufferLength);`,
		`const terminalNativeDeleteIdleResetMs = 900;`,
		`armTerminalNativeDeleteInput(session);`,
		`sendTerminalTextInput(session, "\x7f");`,
		`event.stopImmediatePropagation();`,
		`const interceptTerminalTextareaBeforeInput = (event) => {`,
		`handleTerminalBeforeInput(session, event);`,
		`host.addEventListener("beforeinput", interceptTerminalTextareaBeforeInput, { capture: true });`,
		`pending.suppressSeparator && rawValue === " "`,
		`suppressSeparator: isTerminalASCIICompositionCommit(committedText),`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime confirmed IME delete guard missing %q", want)
		}
	}
	if strings.Contains(deleteBranch, "event.preventDefault()") {
		t.Fatal("confirmed IME backspace must allow native textarea deletion")
	}
	if strings.Contains(deleteBranch, "textarea.value =") {
		t.Fatal("confirmed IME backspace must not rewrite the textarea during auto-repeat")
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
		`if (terminalRenderAllowed(session)) {`,
		`term.requestRender?.();`,
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
		"payload.pixel_width = pixelWidth;",
		"payload.pixel_height = pixelHeight;",
		"if (isKittyGraphicsResponse(data)) {",
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
		"const resizeTabForCurrentDevice = (tab, options = {}) => {",
		"const resizeActiveTabForCurrentDevice = (options = {}) => resizeTabForCurrentDevice(currentTab(), options);",
		"syncTabMobilePixelScroll(tab);",
		"scheduleActiveTabWindowResize();",
		"const isPaneVisibleForSizing = (pane) => {",
		"const resizePane = (pane, {",
		"visibleOnly = true,",
		"forceSizeSync = false,",
		"const failedPaneFit = (measurable = false) => ({",
		"ok: false,",
		"pane.fitAddon?.proposeDimensions?.();",
		"const viewport = captureTerminalViewport(pane.term);",
		"const canvasNeedsResize = !terminalCanvasMatchesExpectedSize(pane, fittedDimensions);",
		"if (dimensionsWillChange) {",
		"pane.term.resize(fittedDimensions.cols, fittedDimensions.rows);",
		"restoreTerminalViewport(pane.term, viewport);",
		"pane.measuredFitGeneration = Number(pane.measuredFitGeneration || 0) + 1;",
		"pane.activationFitPending = false;",
		"ok: true,",
		"const installTerminalResizeObserver = (session) => {",
		"const observer = new ResizeObserver(() => {",
		"observer.observe(session.terminalHost);",
		"schedulePaneResize(session, {",
		"const scheduleTabResize = (tab, options = {}, scheduleOptions = {}) => {",
		"const paneResizeScheduler = createTerminalResizeScheduler({",
		"if (allowHidden && Number(session.measuredFitGeneration || 0) > 0) {",
		"!sessionHasTerminalConnectionSize(session) ||",
		"const scheduleVisibleTabResize = (tab, { immediate = false } = {}) => {",
		"scheduleTabResize(tab, options, { immediate: true });",
		"tab.resizeFrame = window.requestAnimationFrame(() => {",
		"const scheduleActiveTabWindowResize = () => {",
		"scheduleTabResize(currentTab(), {",
		"const shouldResizeTerminal = supportsViewportInsets && isTouchShortcutLayout();",
		"if (shouldResizeTerminal && (heightChanged || insetChanged || safeOffsetChanged)) {",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime tab resize guard missing %q", want)
		}
	}
	if strings.Contains(source, "activeTabResizeTimer") {
		t.Fatal("window resize must not maintain a second terminal settle timer")
	}

	visibilityIndex := strings.Index(source, "const isPaneVisibleForSizing = (pane) => {")
	resizeIndex := strings.Index(source, "const resizePane = (pane, {")
	resetIndex := strings.Index(source, "resetTerminalHostViewport(pane, { clean: true });")
	if visibilityIndex < 0 || resizeIndex < 0 || resetIndex < 0 || !(visibilityIndex < resizeIndex && resizeIndex < resetIndex) {
		t.Fatalf("runtime hidden pane resize guard is not before terminal viewport reset")
	}

	activeTabBlock := sourceBetween(t, source,
		"const setActiveTab = (tabId, { focus = true, remember = true, rememberRecent = true } = {}) => {",
		"const renderLeaf = (tab, node) => {")
	for _, want := range []string{
		`import { createTabActivationScheduler } from "./tab_activation_scheduler.js";`,
		`measurePerformanceTask("tab switch visual"`,
		"const visuallyChangedTabs = new Set([previousTab, tab]);",
		"tabActivationScheduler.schedule(tab.id, [",
		`measurePerformanceTask("tab activation state"`,
		`measurePerformanceTask("tab activation resize"`,
		`scheduleVisibleTabResize(tab, { immediate: false });`,
		`measurePerformanceTask("tab activation membership"`,
		"activeInstanceGeneration === activationInstanceGeneration",
		"activeTabId !== tab.id",
		"tab.activePaneId !== activePane?.id",
		"const persistActiveWorkspaceTab = (tabID) => {",
		"const activeTabPersistenceChains = new Map();",
		"activeTabId !== tabID",
		"applyResponse: false",
		"if (applyResponse) {",
		"tabActivationScheduler.dispose();",
	} {
		if !strings.Contains(source, want) && !strings.Contains(activeTabBlock, want) {
			t.Fatalf("runtime asynchronous tab activation guard missing %q", want)
		}
	}
	if strings.Contains(activeTabBlock, "scheduleVisibleTabResize(tab, { immediate: true });") {
		t.Fatal("tab activation must not synchronously resize terminal panes before the visual selection frame")
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

func TestRuntimeMobileOrientationKeepsTerminalStateAfterViewportSettle(t *testing.T) {
	data, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	source := string(data)

	wantSnippets := []string{
		"const mobileOrientationViewportRecoveryDelays = [0, 80, 180, 360, 720];",
		"const mobileOrientationFinalSettleMs = 900;",
		"const currentMobileViewportOrientation = () => {",
		"const rememberMobileViewportOrientationChange = () => {",
		"const scheduleMobileOrientationViewportRecovery = () => {",
		"if (rememberMobileViewportOrientationChange() || mobileOrientationRecoveryTimer) {",
		"const shouldRecoverOrientation = orientationChanged || (detectOrientation && mobileOrientationRecoveryTimer);",
		"syncMobileVisualViewport({ detectOrientation: false });",
		"resizeActiveTabForCurrentDevice();",
		"window.addEventListener(\"orientationchange\", handleMobileOrientationChange);",
		"window.screen?.orientation?.addEventListener?.(\"change\", handleMobileOrientationChange);",
	}
	for _, want := range wantSnippets {
		if !strings.Contains(source, want) {
			t.Fatalf("runtime mobile orientation state-preservation guard missing %q", want)
		}
	}
	for _, forbidden := range []string{
		"replayActiveTabFromServerAfterViewportChange",
		"mobileOrientationHistoryReplayDelayMs",
		"socket.close(4000, \"viewport changed\")",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("orientation recovery must not trigger history replay, found %q", forbidden)
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
		`const requestBootstrapWorkspace = () => {`,
		`const startupInputUnlockPromise = instancesPromise`,
		`ghosttyInitPromise,`,
		`applyWorkspaceRefresh(workspaceOutcome.result, { focus: true });`,
	}
	for _, want := range wantMainSnippets {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("runtime mobile deploy restart guard missing %q", want)
		}
	}
	if strings.Contains(mainSource, `ensureInitialInteractiveTab`) {
		t.Fatal("startup must not create a disposable terminal before authoritative workspace identity arrives")
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

func TestRuntimeTerminalLongScreenshotContract(t *testing.T) {
	mainData, err := os.ReadFile("runtime/static/main.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/main.js) error = %v", err)
	}
	moduleData, err := os.ReadFile("runtime/static/terminal_long_screenshot.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/terminal_long_screenshot.js) error = %v", err)
	}
	indexData, err := os.ReadFile("runtime/static/index.html")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/index.html) error = %v", err)
	}
	workerData, err := os.ReadFile("runtime/static/service-worker.js")
	if err != nil {
		t.Fatalf("ReadFile(runtime/static/service-worker.js) error = %v", err)
	}
	mainSource := string(mainData)
	moduleSource := string(moduleData)
	indexSource := string(indexData)
	workerSource := string(workerData)
	contractSource := mainSource + "\n" + moduleSource
	if strings.Contains(indexSource, `class="mobile-shortcuts-brand"`) {
		t.Fatal("brand text must be screenshot-only, not live footer DOM")
	}
	if !strings.Contains(workerSource, "`${assetBase}terminal_long_screenshot.js`,") {
		t.Fatal("service worker must precache terminal_long_screenshot.js")
	}

	for _, want := range []string{
		`data-action="capture-long-screenshot">截取长图`,
		`import { createTerminalLongScreenshot } from "./terminal_long_screenshot.js";`,
		`item.hidden = (action === "capture-long-screenshot" && !isTouchShortcutLayout())`,
		`button.dataset.kind = shortcut.kind;`,
		`const { runLongScreenshot } = createTerminalLongScreenshot({`,
		`runLongScreenshot(tabs.get(target.tabId)?.panes.get(target.paneId));`,
		`export const captureTerminalGeometry =`,
		`export const terminalGeometryMatches =`,
		`export const planTerminalScreenshotParts =`,
		`export const snapshotTerminalRows =`,
		`export const drawTerminalRows =`,
		`const DEFAULT_MAX_PARTS = 4;`,
		`SCREENSHOT_RANGE_TOO_LARGE`,
		`current.resizeEpoch === snapshot.resizeEpoch`,
		`current.fontMetricsGeneration === snapshot.fontMetricsGeneration`,
		`current.themeFingerprint === snapshot.themeFingerprint`,
		`Match Ghostty's two-pass line renderer`,
		`let captureActive = false;`,
		`Powered by LazyCat MicroServer LightOS`,
		`files.length === 1`,
		`return "saved";`,
	} {
		if !strings.Contains(contractSource, want) && !strings.Contains(indexSource, want) {
			t.Fatalf("runtime terminal long screenshot guard missing %q", want)
		}
	}

	captureBlock := moduleSource
	for _, forbidden := range []string{
		"scrollToTop(",
		"scrollToBottom(",
		"requestSessionHistoryReplay(",
		"resetTerminalForHistoryReplay(",
		"foreignObject",
		"roundRect(",
	} {
		if strings.Contains(captureBlock, forbidden) {
			t.Fatalf("long screenshot must not mutate the live terminal or use unsafe rasterization, found %q", forbidden)
		}
	}
}

func TestTerminalLongScreenshotBehavior(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is unavailable")
	}
	command := exec.Command(node, "--test", "terminal_long_screenshot_test.mjs")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("terminal long screenshot tests failed: %v\n%s", err, output)
	}
}
