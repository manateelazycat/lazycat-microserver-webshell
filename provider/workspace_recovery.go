package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type workspaceRecoveryStore interface {
	Load(scope AgentScope, epoch string) (WorkspaceRecoveryDocument, bool, error)
	Save(scope AgentScope, document WorkspaceRecoveryDocument) error
	MergeActivity(scope AgentScope, epoch string, activity WorkspaceActivityState) error
}

type fileWorkspaceRecoveryStore struct {
	dir string
	mu  sync.Mutex
}

var workspaceRecoveryOperationLocks sync.Map

func workspaceRecoveryOperationLock(scope AgentScope) *sync.Mutex {
	value, _ := workspaceRecoveryOperationLocks.LoadOrStore(scope.CacheKey(), &sync.Mutex{})
	return value.(*sync.Mutex)
}

func newFileWorkspaceRecoveryStore(dir string) workspaceRecoveryStore {
	return &fileWorkspaceRecoveryStore{dir: strings.TrimSpace(dir)}
}

func resolveWorkspaceRecoveryDir(fontDir string, rootDir string) string {
	if parent := strings.TrimSpace(filepath.Dir(fontDir)); parent != "" && parent != "." {
		return filepath.Join(parent, "workspaces")
	}
	return filepath.Join(rootDir, ".webshell-data", "workspaces")
}

func (s *fileWorkspaceRecoveryStore) path(scope AgentScope) string {
	return filepath.Join(s.dir, scope.Hash()+".json")
}

func (s *fileWorkspaceRecoveryStore) Load(scope AgentScope, epoch string) (WorkspaceRecoveryDocument, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked(scope, epoch)
}

func (s *fileWorkspaceRecoveryStore) loadLocked(scope AgentScope, epoch string) (WorkspaceRecoveryDocument, bool, error) {
	epoch = strings.TrimSpace(epoch)
	if epoch == "" || s.dir == "" {
		return WorkspaceRecoveryDocument{}, false, nil
	}
	file, err := os.Open(s.path(scope))
	if errors.Is(err, os.ErrNotExist) {
		return WorkspaceRecoveryDocument{}, false, nil
	}
	if err != nil {
		return WorkspaceRecoveryDocument{}, false, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, WorkspaceRecoveryMaxBytes+1))
	if err != nil {
		return WorkspaceRecoveryDocument{}, false, err
	}
	if len(data) > WorkspaceRecoveryMaxBytes {
		return WorkspaceRecoveryDocument{}, false, errors.New("workspace recovery file is too large")
	}
	var document WorkspaceRecoveryDocument
	if err := json.Unmarshal(data, &document); err != nil {
		return WorkspaceRecoveryDocument{}, false, fmt.Errorf("decode workspace recovery file: %w", err)
	}
	if strings.TrimSpace(document.Epoch) != epoch {
		return WorkspaceRecoveryDocument{}, false, nil
	}
	if err := ValidateWorkspaceRecoveryDocument(document); err != nil {
		return WorkspaceRecoveryDocument{}, false, err
	}
	return document, true, nil
}

func (s *fileWorkspaceRecoveryStore) Save(scope AgentScope, document WorkspaceRecoveryDocument) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(scope, document)
}

func (s *fileWorkspaceRecoveryStore) saveLocked(scope AgentScope, document WorkspaceRecoveryDocument) error {
	if s.dir == "" || strings.TrimSpace(document.Epoch) == "" {
		return nil
	}
	if err := ValidateWorkspaceRecoveryDocument(document); err != nil {
		return err
	}
	data, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if len(data) > WorkspaceRecoveryMaxBytes {
		return errors.New("workspace recovery document is too large")
	}
	path := s.path(scope)
	if existing, readErr := os.ReadFile(path); readErr == nil && bytes.Equal(existing, data) {
		return nil
	}
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(s.dir, ".workspace-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

func (s *fileWorkspaceRecoveryStore) MergeActivity(scope AgentScope, epoch string, activity WorkspaceActivityState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	document, found, err := s.loadLocked(scope, epoch)
	if err != nil || !found {
		return err
	}
	panes := make(map[string]*WorkspaceRecoveryPane)
	for tabIndex := range document.Tabs {
		for paneIndex := range document.Tabs[tabIndex].Panes {
			pane := &document.Tabs[tabIndex].Panes[paneIndex]
			panes[pane.ID] = pane
		}
	}
	changed := false
	for _, summary := range activity.Panes {
		pane := panes[summary.ID]
		cwd := NormalizeRecoveryCWD(summary.CWD)
		if pane != nil && cwd != "" && pane.CWD != cwd {
			pane.CWD = cwd
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return s.saveLocked(scope, document)
}

func (s *pluginServer) saveWorkspaceRecovery(scope AgentScope, epoch string, state WorkspaceState) {
	if strings.TrimSpace(epoch) == "" || s.workspaceRecovery == nil {
		return
	}
	document := WorkspaceRecoveryDocumentFromState(epoch, state)
	if err := s.workspaceRecovery.Save(scope, document); err != nil {
		log.Printf("workspace recovery save failed: scope=%s err=%v", scope.Selector, err)
	}
}

func (s *pluginServer) requestWorkspaceStateWithRecovery(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int, epoch string) (WorkspaceState, error) {
	if s.workspaceRecovery == nil || strings.TrimSpace(epoch) == "" {
		return requestAgentWorkspaceState(ctx, scope, cols, rows, terminalScrollback)
	}
	operationLock := workspaceRecoveryOperationLock(scope)
	operationLock.Lock()
	defer operationLock.Unlock()
	state, version, err := requestAgentWorkspaceStateWithVersion(ctx, scope, cols, rows, terminalScrollback)
	if err != nil {
		return WorkspaceState{}, err
	}
	document, found, loadErr := s.workspaceRecovery.Load(scope, epoch)
	if loadErr != nil {
		log.Printf("workspace recovery load failed: scope=%s err=%v", scope.Selector, loadErr)
		found = false
	}
	if found && document.WorkspaceGeneration != state.WorkspaceGeneration {
		if !supportsWorkspaceRecovery(version) {
			return WorkspaceState{}, &unsupportedAgentProtocolError{version: version}
		}
		state, err = requestAgentWorkspaceRestore(ctx, scope, cols, rows, terminalScrollback, document)
		if err != nil {
			return WorkspaceState{}, err
		}
	}
	s.saveWorkspaceRecovery(scope, epoch, state)
	return state, nil
}

func (s *pluginServer) requestWorkspaceActionWithRecovery(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int, epoch string, action WorkspaceActionRequest) (WorkspaceState, error) {
	if s.workspaceRecovery == nil || strings.TrimSpace(epoch) == "" {
		return requestAgentWorkspaceAction(ctx, scope, cols, rows, terminalScrollback, action)
	}
	operationLock := workspaceRecoveryOperationLock(scope)
	operationLock.Lock()
	defer operationLock.Unlock()
	document, found, loadErr := s.workspaceRecovery.Load(scope, epoch)
	if loadErr != nil {
		log.Printf("workspace recovery load before action failed: scope=%s err=%v", scope.Selector, loadErr)
		found = false
	}
	state, version, err := requestAgentWorkspaceActionWithVersion(ctx, scope, cols, rows, terminalScrollback, action)
	if err != nil {
		return WorkspaceState{}, err
	}
	if found && document.WorkspaceGeneration != state.WorkspaceGeneration {
		if !supportsWorkspaceRecovery(version) {
			return WorkspaceState{}, &unsupportedAgentProtocolError{version: version}
		}
		if _, err := requestAgentWorkspaceRestore(ctx, scope, cols, rows, terminalScrollback, document); err != nil {
			return WorkspaceState{}, err
		}
		state, _, err = requestAgentWorkspaceActionWithVersion(ctx, scope, cols, rows, terminalScrollback, action)
		if err != nil {
			return WorkspaceState{}, err
		}
	}
	s.saveWorkspaceRecovery(scope, epoch, state)
	return state, nil
}

func (s *pluginServer) mergeWorkspaceRecoveryActivity(scope AgentScope, epoch string, activity WorkspaceActivityState) {
	if strings.TrimSpace(epoch) == "" || s.workspaceRecovery == nil {
		return
	}
	if err := s.workspaceRecovery.MergeActivity(scope, epoch, activity); err != nil {
		log.Printf("workspace recovery activity merge failed: scope=%s err=%v", scope.Selector, err)
	}
}

func (s *pluginServer) requestWorkspaceActivityWithRecovery(ctx context.Context, scope AgentScope, cols, rows, terminalScrollback int, epoch string) (WorkspaceActivityState, error) {
	if s.workspaceRecovery == nil || strings.TrimSpace(epoch) == "" {
		return requestAgentWorkspaceActivity(ctx, scope, cols, rows, terminalScrollback)
	}
	operationLock := workspaceRecoveryOperationLock(scope)
	operationLock.Lock()
	defer operationLock.Unlock()
	activity, err := requestAgentWorkspaceActivity(ctx, scope, cols, rows, terminalScrollback)
	if err != nil {
		return WorkspaceActivityState{}, err
	}
	s.mergeWorkspaceRecoveryActivity(scope, epoch, activity)
	return activity, nil
}
