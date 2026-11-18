// Package launcher keeps LightOS business registration and live updates in the
// distributed runtime. Hosts retain process ownership and channel authorization.
package launcher

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	lightosterminal "lcmd-webshell/clientruntime/managedruntime"
	"path/filepath"
	"runtime"
	"time"
)

type Config struct {
	lightosterminal.Config
	AdminURL    string    `json:"admin_url"`
	AccessToken string    `json:"access_token"`
	ProxyURL    string    `json:"proxy_url"`
	RuntimeDir  string    `json:"runtime_dir"`
	Artifact    Artifact  `json:"artifact"`
	Runtime     *Artifact `json:"runtime"`
}
type command struct {
	Type      string `json:"type"`
	RequestID string `json:"request_id"`
}
type status struct {
	Enabled               bool   `json:"enabled"`
	State                 string `json:"state"`
	Platform              string `json:"platform"`
	Arch                  string `json:"arch"`
	InstanceID            string `json:"instance_id"`
	RunningVersion        string `json:"running_version"`
	InstalledVersion      string `json:"installed_version"`
	TargetVersion         string `json:"target_version"`
	RunningBinarySHA256   string `json:"running_binary_sha256"`
	InstalledBinarySHA256 string `json:"installed_binary_sha256"`
	TargetBinarySHA256    string `json:"target_binary_sha256"`
	UpdatePending         bool   `json:"update_pending"`
	ChannelConnected      bool   `json:"channel_connected"`
	LastError             string `json:"last_error,omitempty"`
	UpdateError           string `json:"update_error,omitempty"`
}
type prepared struct {
	folder   string
	artifact Artifact
	err      error
}

func (s *status) setRunning(a Artifact) {
	s.RunningVersion, s.RunningBinarySHA256 = a.version(), a.BinarySHA256
}
func (s *status) setInstalled(a Artifact) {
	s.InstalledVersion, s.InstalledBinarySHA256 = a.version(), a.BinarySHA256
}
func (s *status) setTarget(a Artifact) {
	s.TargetVersion, s.TargetBinarySHA256 = a.version(), a.BinarySHA256
}
func (s *status) awaitingTarget() bool {
	return s.TargetVersion != s.RunningVersion || s.TargetBinarySHA256 != s.RunningBinarySHA256
}

func Run(parent context.Context, input io.Reader, output io.Writer) (failure error) {
	defer func() {
		if failure != nil {
			_ = json.NewEncoder(output).Encode(map[string]any{"type": "error", "status": map[string]any{"enabled": true, "state": "error", "last_error": failure.Error()}})
		}
	}()
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), 64<<10)
	if !scanner.Scan() {
		return errors.New("private runtime configuration required")
	}
	var config Config
	if json.Unmarshal(scanner.Bytes(), &config) != nil || config.AccessToken == "" || !config.Artifact.valid() || !filepath.IsAbs(config.RuntimeDir) {
		return errors.New("invalid launcher configuration")
	}
	if err := rememberArtifact(config.AdminURL, config.RuntimeDir, config.Artifact); err != nil {
		return err
	}
	client, e := sessionClient(config)
	if e != nil {
		return e
	}
	defer client.CloseIdleConnections()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	controls := make(chan command, 8)
	go func() {
		defer cancel()
		for scanner.Scan() {
			var c command
			if json.Unmarshal(scanner.Bytes(), &c) != nil {
				return
			}
			select {
			case controls <- c:
			case <-ctx.Done():
				return
			}
		}
	}()
	defer func() {
		stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = sessionPost(stop, client, config, "unregister", map[string]any{"id": config.InstanceID, "terminal_epoch": config.ServiceEpoch}, nil)
	}()
	state := status{Enabled: true, State: "preparing", Platform: runtime.GOOS, Arch: runtime.GOARCH, InstanceID: config.InstanceID}
	state.setInstalled(config.Artifact)
	if config.Runtime != nil {
		state.setTarget(*config.Runtime)
	}
	if e = json.NewEncoder(output).Encode(map[string]any{"type": "status", "status": state}); e != nil {
		return e
	}
	downloads := make(chan prepared, 1)
	go func() {
		download, stop := context.WithTimeout(ctx, 5*time.Minute)
		defer stop()
		folder, artifact, err := ensureLightosArtifact(download, client, config.AdminURL, config.AccessToken, filepath.Dir(config.RuntimeDir), config.Runtime)
		select {
		case downloads <- prepared{folder, artifact, err}:
		case <-ctx.Done():
		}
	}()
	hostUntil := time.Now().Add(35 * time.Second)
	startupLease := time.NewTimer(35 * time.Second)
	defer startupLease.Stop()
	var selected prepared
preparing:
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-startupLease.C:
			return errors.New("host authorization expired during runtime preparation")
		case c := <-controls:
			if c.Type != "renew" {
				return errors.New("host authorization paused during runtime preparation")
			}
			hostUntil = time.Now().Add(35 * time.Second)
			startupLease.Reset(35 * time.Second)
		case selected = <-downloads:
			break preparing
		}
	}
	startupLease.Stop()
	if selected.err != nil {
		return selected.err
	}
	spawn := func(folder string, artifact Artifact) (*worker, error) {
		return startWorker(ctx, folder, artifact, config.Config)
	}
	child, e := spawn(selected.folder, selected.artifact)
	if e != nil {
		return e
	}
	defer func() {
		if child != nil {
			child.stop()
		}
	}()
	state.setRunning(selected.artifact)
	state.setInstalled(selected.artifact)
	state.setTarget(selected.artifact)
	state.UpdateError = selected.artifact.updateError
	if selected.artifact.target != nil {
		state.setTarget(*selected.artifact.target)
	}
	state.UpdatePending = state.awaitingTarget()
	emit := func(kind, id string) error {
		_, state.ChannelConnected, _ = child.state()
		state.ChannelConnected = state.ChannelConnected && child.alive()
		return json.NewEncoder(output).Encode(map[string]any{"type": kind, "request_id": id, "status": state, "address": child.ipcAddress()})
	}
	hint, e := heartbeat(ctx, client, config, child)
	if e != nil {
		return e
	}
	_ = child.send(command{Type: "renew"})
	_ = child.send(command{Type: "status"})
	state.State = "ready"
	if e = emit("ready", ""); e != nil {
		return e
	}
	currentFolder, currentArtifact := selected.folder, selected.artifact
	lastHeartbeat, lastCheck := time.Now(), time.Time{}
	hostReady := true
	downloading := false
	var pending *prepared
	var requestID string
	answer := func() {
		if requestID != "" {
			_ = emit("result", requestID)
		}
		requestID = ""
	}
	prepare := func() {
		if downloading {
			return
		}
		if hint != nil && hint.valid() && hint.BinarySHA256 == currentArtifact.BinarySHA256 {
			if hint.Version != currentArtifact.Version || pending != nil {
				if err := rememberArtifact(config.AdminURL, currentFolder, *hint); err != nil {
					state.UpdateError = err.Error()
					answer()
					return
				}
				currentArtifact = *hint
			}
			state.setRunning(currentArtifact)
			state.setInstalled(currentArtifact)
			state.setTarget(currentArtifact)
			pending = nil
			state.UpdatePending = false
			state.UpdateError = ""
			answer()
			return
		}
		downloading = true
		lastCheck = time.Now()
		target := hint
		if target != nil && target.valid() {
			state.setTarget(*target)
			state.UpdatePending = state.awaitingTarget()
		}
		go func() {
			download, stop := context.WithTimeout(ctx, 5*time.Minute)
			defer stop()
			folder, a, err := ensureLightosArtifact(download, client, config.AdminURL, config.AccessToken, filepath.Dir(config.RuntimeDir), target)
			select {
			case downloads <- prepared{folder, a, err}:
			case <-ctx.Done():
			}
		}()
	}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-child.done:
			return errors.New("runtime worker exited; enable access again to restart")
		case c := <-controls:
			switch c.Type {
			case "renew":
				hostUntil = time.Now().Add(35 * time.Second)
				hostReady = true
			case "pause":
				hostReady = false
				_ = child.send(c)
				state.State = "waiting-for-network"
			case "check":
				requestID = c.RequestID
				lastHeartbeat = time.Time{}
				lastCheck = time.Time{}
			default:
				return errors.New("invalid launcher control")
			}
		case result := <-downloads:
			downloading = false
			if result.err != nil {
				state.UpdateError = result.err.Error()
				answer()
				_ = emit("status", "")
				continue
			}
			state.setInstalled(result.artifact)
			state.setTarget(result.artifact)
			state.UpdateError = result.artifact.updateError
			if result.artifact.target != nil {
				state.setTarget(*result.artifact.target)
			}
			state.UpdatePending = state.awaitingTarget()
			if result.artifact.BinarySHA256 != currentArtifact.BinarySHA256 {
				pending = &result
			}
			answer()
			_ = emit("status", "")
		case <-ticker.C:
		}
		if !time.Now().Before(hostUntil) {
			hostReady = false
			state.State = "waiting-for-host"
			_ = child.send(command{Type: "pause"})
		}
		if !hostReady {
			_ = emit("status", "")
			continue
		}
		if time.Since(lastHeartbeat) >= 15*time.Second {
			lastHeartbeat = time.Now()
			hint, e = heartbeat(ctx, client, config, child)
			if e != nil {
				state.LastError = "LightOS authentication or connection unavailable"
				state.State = "reconnecting"
				_ = child.send(command{Type: "pause"})
				_ = emit("status", "")
				var response *lightosHTTPError
				if errors.As(e, &response) && (response.status == 401 || response.status == 403) {
					return errors.New("runtime authorization revoked; enable access again")
				}
				continue
			}
			state.LastError = ""
			state.State = "ready"
			_ = child.send(command{Type: "renew"})
			_ = child.send(command{Type: "status"})
			if time.Since(lastCheck) >= time.Minute {
				prepare()
			}
			_ = emit("status", "")
		}
		if pending != nil && state.State == "ready" && child.prepareUpdate(ctx) {
			oldFolder, oldArtifact := currentFolder, currentArtifact
			child.stop()
			if child.alive() {
				return errLightosStop
			}
			next := pending
			pending = nil
			child, e = spawn(next.folder, next.artifact)
			if e != nil {
				if hint == nil || hint.TerminalProtocol != oldArtifact.TerminalProtocol {
					return fmt.Errorf("updated runtime failed: %w", e)
				}
				child, e = spawn(oldFolder, oldArtifact)
				if e != nil {
					return e
				}
				state.UpdateError = "Updated runtime failed; using the compatible previous version"
			} else {
				currentFolder, currentArtifact = next.folder, next.artifact
			}
			state.setRunning(currentArtifact)
			state.UpdatePending = state.awaitingTarget()
			hint, e = heartbeat(ctx, client, config, child)
			if e != nil {
				return e
			}
			_ = child.send(command{Type: "renew"})
			_ = child.send(command{Type: "status"})
			_ = emit("status", "")
		} else if pending != nil {
			_ = child.send(command{Type: "cancel_update"})
		}
	}
}
