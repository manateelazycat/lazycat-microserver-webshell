package main

import (
	"fmt"
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
