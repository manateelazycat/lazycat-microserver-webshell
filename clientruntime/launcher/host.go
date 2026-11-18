package launcher

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"maps"
	"net/rpc"
	"net/rpc/jsonrpc"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// HostOptions contains delegated bootstrap data, never SDK control credentials.
type HostOptions struct {
	Bootstrap                                                   json.RawMessage
	AdminURL, ProxyAddress, ProxyUser, ProxyPassword, StateRoot string
	Ready                                                       bool
}

type HostRegistration struct {
	ServiceName    string `json:"service_name"`
	Address        string `json:"address"`
	CredVal        string `json:"cred_val"`
	CredHeadername string `json:"cred_headername"`
}

type HostStart struct {
	HostRegistration
	Status map[string]any `json:"status"`
}

// HostRPC adapts the established launcher lifecycle to a standard private RPC.
// Legacy PC hosts retain the original launcher entry point and wire format.
type HostRPC struct {
	ctx                                  context.Context
	reader                               *io.PipeReader
	input                                *io.PipeWriter
	mu, writeMu, checkMu                 sync.Mutex
	config                               Config
	initialized, running, known, allowed bool
	state                                map[string]any
	address                              string
	failure                              error
	changed                              chan struct{}
	check                                chan map[string]any
	completed                            chan struct{}
}

type hostConnection struct {
	io.ReadCloser
	io.Writer
	cancel context.CancelFunc
}

func (c hostConnection) Read(p []byte) (int, error) {
	n, err := c.ReadCloser.Read(p)
	if err != nil {
		c.cancel()
	}
	return n, err
}
func (c hostConnection) Close() error { c.cancel(); return c.ReadCloser.Close() }

func RunHost(parent context.Context, input io.ReadCloser, output io.Writer) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	h := &HostRPC{ctx: ctx, reader: reader, input: writer, changed: make(chan struct{}), state: map[string]any{"enabled": true, "state": "starting"}}
	server := rpc.NewServer()
	if err := server.RegisterName("Host", h); err != nil {
		return err
	}
	go func() { <-ctx.Done(); writer.Close(); input.Close() }()
	server.ServeCodec(jsonrpc.NewServerCodec(hostConnection{input, output, cancel}))
	cancel()
	writer.Close()
	if h.completed != nil {
		<-h.completed
	}
	return nil
}

func (h *HostRPC) Init(options HostOptions, reply *HostStart) error {
	var config Config
	if err := json.Unmarshal(options.Bootstrap, &config); err != nil {
		return err
	}
	if config.InstanceID == "" || config.InstanceID == "." || config.InstanceID == ".." || filepath.Base(config.InstanceID) != config.InstanceID || !filepath.IsAbs(options.StateRoot) {
		return errors.New("invalid runtime state root")
	}
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	config.AdminURL, config.ProxyURL, config.RuntimeDir = options.AdminURL, "", filepath.Dir(executable)
	if options.ProxyAddress != "" {
		u := &url.URL{Scheme: "http", Host: options.ProxyAddress}
		if options.ProxyUser != "" {
			u.User = url.UserPassword(options.ProxyUser, options.ProxyPassword)
		}
		config.ProxyURL = u.String()
	}
	config.StateDir = filepath.Join(options.StateRoot, config.InstanceID)
	data, err := os.ReadFile(filepath.Join(config.RuntimeDir, "manifest.json"))
	if err == nil {
		err = json.Unmarshal(data, &config.Artifact)
	} else if os.IsNotExist(err) && config.Runtime != nil {
		config.Artifact, err = *config.Runtime, nil
	}
	if err != nil || !config.Artifact.valid() || config.Artifact.HostProtocol != 1 || !verifyLightosFile(executable, config.Artifact.BinarySHA256, config.Artifact.BinarySize) {
		return errors.New("host RPC runtime manifest required")
	}
	h.mu.Lock()
	if h.initialized {
		h.mu.Unlock()
		return errors.New("runtime already initialized")
	}
	h.initialized, h.config = true, config
	h.completed = make(chan struct{})
	if !h.known {
		h.allowed = options.Ready
	}
	h.mu.Unlock()
	reader := h.reader
	go func() {
		defer close(h.completed)
		err := Run(h.ctx, reader, h)
		reader.Close()
		h.mu.Lock()
		if err == nil {
			err = errors.New("runtime stopped")
		}
		h.failure = err
		h.state = map[string]any{"enabled": true, "state": "error", "last_error": err.Error(), "process_running": false}
		h.notify()
		h.mu.Unlock()
	}()
	h.writeMu.Lock()
	err = json.NewEncoder(h.input).Encode(config)
	h.mu.Lock()
	h.running = err == nil
	h.mu.Unlock()
	h.writeMu.Unlock()
	if err != nil {
		return err
	}
	if err = h.pulse(); err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	*reply = HostStart{HostRegistration{h.config.ServiceName, h.address, h.config.ServiceCredential, "x-lightos-client-terminal"}, maps.Clone(h.state)}
	return h.failure
}

func (h *HostRPC) Status(_ struct{}, reply *map[string]any) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	*reply = maps.Clone(h.state)
	return nil
}

func (h *HostRPC) State(allowed bool, _ *struct{}) error {
	h.mu.Lock()
	h.allowed, h.known = allowed, true
	running := h.running
	h.mu.Unlock()
	if running {
		return h.pulse()
	}
	return nil
}

func (h *HostRPC) pulse() error {
	h.writeMu.Lock()
	defer h.writeMu.Unlock()
	h.mu.Lock()
	action := "pause"
	if h.allowed {
		action = "renew"
	}
	h.mu.Unlock()
	return json.NewEncoder(h.input).Encode(command{Type: action})
}

// Next renews host admission before waiting. A suspended/dead host cannot keep
// renewing; the established launcher/worker leases still fail closed.
func (h *HostRPC) Next(previous string, reply *HostStart) error {
	h.mu.Lock()
	running := h.running
	h.mu.Unlock()
	if !running {
		return errors.New("runtime not initialized")
	}
	if err := h.pulse(); err != nil {
		return err
	}
	timer := time.NewTimer(15 * time.Second)
	defer timer.Stop()
	for {
		h.mu.Lock()
		if h.failure != nil {
			err := h.failure
			h.mu.Unlock()
			return err
		}
		if h.address != "" && h.address != previous {
			*reply = HostStart{HostRegistration{h.config.ServiceName, h.address, h.config.ServiceCredential, "x-lightos-client-terminal"}, maps.Clone(h.state)}
			h.mu.Unlock()
			return nil
		}
		changed := h.changed
		h.mu.Unlock()
		select {
		case <-changed:
		case <-timer.C:
			h.mu.Lock()
			defer h.mu.Unlock()
			*reply = HostStart{HostRegistration{h.config.ServiceName, h.address, h.config.ServiceCredential, "x-lightos-client-terminal"}, maps.Clone(h.state)}
			return h.failure
		case <-h.ctx.Done():
			return h.ctx.Err()
		}
	}
}

func (h *HostRPC) Check(_ struct{}, reply *map[string]any) error {
	h.checkMu.Lock()
	defer h.checkMu.Unlock()
	h.mu.Lock()
	if h.failure != nil || !h.running {
		err := h.failure
		if err == nil {
			err = errors.New("runtime not initialized")
		}
		h.mu.Unlock()
		return err
	}
	result := make(chan map[string]any, 1)
	h.check = result
	h.mu.Unlock()
	defer func() { h.mu.Lock(); h.check = nil; h.mu.Unlock() }()
	h.writeMu.Lock()
	err := json.NewEncoder(h.input).Encode(command{Type: "check", RequestID: "host-rpc"})
	h.writeMu.Unlock()
	if err != nil {
		return err
	}
	for {
		h.mu.Lock()
		failure, changed := h.failure, h.changed
		h.mu.Unlock()
		if failure != nil {
			return failure
		}
		select {
		case state := <-result:
			*reply = state
			if detail, _ := state["update_error"].(string); detail != "" {
				return errors.New(detail)
			}
			return nil
		case <-changed:
		case <-h.ctx.Done():
			return h.ctx.Err()
		}
	}
}

func (h *HostRPC) Write(data []byte) (int, error) {
	var message struct {
		Type      string         `json:"type"`
		RequestID string         `json:"request_id"`
		Address   string         `json:"address"`
		Status    map[string]any `json:"status"`
	}
	if err := json.Unmarshal(data, &message); err != nil {
		return 0, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.state = message.Status
	h.state["process_running"] = true
	if message.Address != "" {
		h.address = message.Address
	}
	if message.Type == "error" {
		detail, _ := message.Status["last_error"].(string)
		h.failure = errors.New(detail)
	}
	if message.Type == "result" && message.RequestID == "host-rpc" && h.check != nil {
		h.check <- maps.Clone(h.state)
	}
	h.notify()
	return len(data), nil
}

func (h *HostRPC) notify() { close(h.changed); h.changed = make(chan struct{}) }
