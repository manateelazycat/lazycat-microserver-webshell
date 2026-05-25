package main

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestCachedAgentRuntimeArchiveReusesSuccessfulBuild(t *testing.T) {
	agentRuntimeArchiveCache.Lock()
	previousReady := agentRuntimeArchiveCache.ready
	previousPayload := agentRuntimeArchiveCache.payload
	previousManifest := agentRuntimeArchiveCache.manifest
	agentRuntimeArchiveCache.ready = false
	agentRuntimeArchiveCache.payload = nil
	agentRuntimeArchiveCache.manifest = ""
	agentRuntimeArchiveCache.Unlock()
	t.Cleanup(func() {
		agentRuntimeArchiveCache.Lock()
		agentRuntimeArchiveCache.ready = previousReady
		agentRuntimeArchiveCache.payload = previousPayload
		agentRuntimeArchiveCache.manifest = previousManifest
		agentRuntimeArchiveCache.Unlock()
	})

	firstPayload, firstManifest, err := cachedAgentRuntimeArchive()
	if err != nil {
		t.Fatalf("first cachedAgentRuntimeArchive() returned error: %v", err)
	}
	secondPayload, secondManifest, err := cachedAgentRuntimeArchive()
	if err != nil {
		t.Fatalf("second cachedAgentRuntimeArchive() returned error: %v", err)
	}

	if firstManifest == "" {
		t.Fatal("expected non-empty manifest")
	}
	if firstManifest != secondManifest {
		t.Fatalf("expected cached manifest %q, got %q", firstManifest, secondManifest)
	}
	if len(firstPayload) == 0 {
		t.Fatal("expected non-empty payload")
	}
	if len(firstPayload) != len(secondPayload) || &firstPayload[0] != &secondPayload[0] {
		t.Fatal("expected second call to reuse cached payload")
	}
}

func TestEnsurePersistentAgentReportsScopeOnReadyTimeout(t *testing.T) {
	scope := normalizeAgentScope("openclaw-86253ff1acf29126@cloud.lazycat.totoro", "c")
	err := fmt.Errorf("persistent webshell agent did not become ready: selector=%s account=%s socket=%s log=%s", scope.Selector, scope.AccountID, scopedAgentSocketPath(scope), scopedAgentLogPath(scope))
	if !strings.Contains(err.Error(), scope.Selector) || !strings.Contains(err.Error(), "socket=/tmp/lcmd-webshell-agent-") {
		t.Fatalf("expected scope details in error, got %v", err)
	}
}

func TestEnsurePersistentAgentPingsBeforeInstalling(t *testing.T) {
	data, err := os.ReadFile("agent_runtime.go")
	if err != nil {
		t.Fatalf("ReadFile(agent_runtime.go) error = %v", err)
	}
	source := string(data)
	start := strings.Index(source, "func ensurePersistentAgent(ctx context.Context, scope agentScope) (string, error) {")
	end := strings.Index(source, "func cachedInstanceUsername(ctx context.Context, selector string) (string, error) {")
	if start < 0 || end < 0 || end <= start {
		t.Fatal("ensurePersistentAgent source block not found")
	}
	block := source[start:end]
	pingIndex := strings.Index(block, "pingPersistentAgentError(ctx, scope)")
	installIndex := strings.Index(block, "ensureAgentBinaryInstalled(ctx, scope, trace)")
	if pingIndex < 0 || installIndex < 0 {
		t.Fatalf("expected ensurePersistentAgent to contain pre-install ping and install call")
	}
	if pingIndex > installIndex {
		t.Fatal("ensurePersistentAgent should ping an existing agent before installing a new binary")
	}
	for _, want := range []string{
		"if persistentAgentRunningCached(scope) {",
		`trace.add("pre-install ping succeeded")`,
		`trace.add("pre-install ping failed: %v", err)`,
		"rememberIncompatiblePersistentAgentNotice(scope, err)",
	} {
		if !strings.Contains(block, want) {
			t.Fatalf("ensurePersistentAgent reuse guard missing %q", want)
		}
	}
}

func TestPersistentAgentNoticeIsConsumedOnce(t *testing.T) {
	scope := normalizeAgentScope("demo@owner", "account-a")
	key := scope.cacheKey()
	persistentAgentCache.Lock()
	previous, hadPrevious := persistentAgentCache.notices[key]
	delete(persistentAgentCache.notices, key)
	persistentAgentCache.Unlock()
	t.Cleanup(func() {
		persistentAgentCache.Lock()
		if hadPrevious {
			persistentAgentCache.notices[key] = previous
		} else {
			delete(persistentAgentCache.notices, key)
		}
		persistentAgentCache.Unlock()
	})

	rememberIncompatiblePersistentAgentNotice(scope, fmt.Errorf("unsupported agent protocol %q", "old"))

	if got := consumePersistentAgentNotice(scope); !strings.Contains(got, "旧终端会话无法复用") {
		t.Fatalf("consumePersistentAgentNotice() = %q, want protocol notice", got)
	}
	if got := consumePersistentAgentNotice(scope); got != "" {
		t.Fatalf("second consumePersistentAgentNotice() = %q, want empty", got)
	}
}
