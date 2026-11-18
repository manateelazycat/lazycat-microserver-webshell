// Package lightosterminal owns the client terminal's private parent protocol
// and lifecycle. The host owns hportal service authorization and leases.
package lightosterminal

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"lcmd-webshell/clienttransport"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const CredentialHeader = "x-lightos-client-terminal"
const ServicePrefix = "cloud.lazycat.lightos.client-terminal.managed."
const leaseDuration = 35 * time.Second

type Config struct {
	InstanceID        string `json:"instance_id"`
	AccountID         string `json:"account_id"`
	BoxID             string `json:"box_id"`
	DeviceID          string `json:"device_id"`
	StateDir          string `json:"state_dir"`
	ServiceCredential string `json:"service_credential"`
	ServiceEpoch      string `json:"service_epoch"`
	ServiceName       string `json:"service_name"`
}
type Binding struct {
	InstanceID, AccountID, BoxID, DeviceID, Epoch, Secret, Credential, StateDir string
	ServiceName                                                                 string
	AdmissionAllowed                                                            func() bool
	Listener                                                                    net.Listener
}
type Service interface {
	Address() string
	Close()
}
type Factory func(context.Context, Binding) (Service, error)

type leaseControl struct {
	Type       string `json:"type"`
	RequestID  string `json:"request_id,omitempty"`
	generation uint64
}

type Registration struct {
	ServiceName      string `json:"terminal_service_name"`
	Secret           string `json:"terminal_secret"`
	CredentialHeader string `json:"terminal_cred_header"`
	Credential       string `json:"terminal_cred_value"`
	Epoch            string `json:"terminal_epoch"`
	Protocol         string `json:"terminal_protocol"`
	Certificate      string `json:"terminal_certificate,omitempty"`
}

// Run reads one configuration followed by renew messages from a private parent
// pipe. EOF, malformed controls and context cancellation close the process.
// Missing renewals pause new admission without ending owned terminal tasks.
func Run(ctx context.Context, input io.Reader, output io.Writer, protocol string, factory Factory) error {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), 64<<10)
	if !scanner.Scan() {
		return errors.New("terminal startup configuration is required")
	}
	var config Config
	if err := json.Unmarshal(scanner.Bytes(), &config); err != nil {
		return errors.New("invalid terminal startup configuration")
	}
	if err := config.validate(); err != nil {
		return err
	}
	if err := os.MkdirAll(config.StateDir, 0700); err != nil {
		return err
	}
	unlock, err := acquireLock(filepath.Join(config.StateDir, "terminal-core.lock"))
	if err != nil {
		return err
	}
	defer unlock()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var admission atomic.Bool
	var gateMu sync.Mutex
	var admissionGeneration uint64
	binding := Binding{InstanceID: config.InstanceID, AccountID: config.AccountID, BoxID: config.BoxID, DeviceID: config.DeviceID, StateDir: config.StateDir, AdmissionAllowed: admission.Load, ServiceName: config.ServiceName}
	binding.Epoch, binding.Credential = config.ServiceEpoch, config.ServiceCredential
	for _, target := range []*string{&binding.Secret} {
		data := make([]byte, 32)
		if _, err := rand.Read(data); err != nil {
			return err
		}
		*target = base64.RawURLEncoding.EncodeToString(data)
	}
	listener, address, cleanup, err := openPrivateIPC()
	if err != nil {
		return err
	}
	defer cleanup()
	business, certificate, err := clienttransport.Listen(ctx, listener, config.ServiceName, config.ServiceCredential)
	if err != nil {
		return err
	}
	defer business.Close()
	binding.Listener = business
	service, err := factory(ctx, binding)
	if err != nil {
		return err
	}
	defer service.Close()
	registration := Registration{ServiceName: config.ServiceName, Secret: binding.Secret,
		CredentialHeader: CredentialHeader, Credential: binding.Credential, Epoch: binding.Epoch, Protocol: protocol, Certificate: certificate}
	admission.Store(true)
	if err := json.NewEncoder(output).Encode(map[string]any{"type": "ready", "protocol": protocol, "registration": registration, "address": address}); err != nil {
		return err
	}
	controls := make(chan leaseControl, 4)
	go func() {
		defer cancel()
		for scanner.Scan() {
			var message leaseControl
			if json.Unmarshal(scanner.Bytes(), &message) != nil || message.Type != "renew" && message.Type != "pause" && message.Type != "status" && message.Type != "prepare_update" && message.Type != "cancel_update" {
				return
			}
			gateMu.Lock()
			if message.Type == "pause" {
				admission.Store(false)
				admissionGeneration++
			}
			message.generation = admissionGeneration
			gateMu.Unlock()
			select {
			case controls <- message:
			case <-ctx.Done():
				return
			}
		}
	}()
	timer := time.NewTimer(leaseDuration)
	leaseUntil := time.Now().Add(leaseDuration)
	var authorizedGeneration uint64
	updateReserved := false
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-timer.C:
			gateMu.Lock()
			admission.Store(false)
			admissionGeneration++
			gateMu.Unlock()
		case control := <-controls:
			if control.Type == "prepare_update" {
				gateMu.Lock()
				admission.Store(false)
				gateMu.Unlock()
				busy := true
				if b, ok := service.(interface{ Busy() bool }); ok {
					busy = b.Busy()
				}
				gateMu.Lock()
				updateReserved = !busy
				if busy && authorizedGeneration == admissionGeneration && time.Now().Before(leaseUntil) {
					admission.Store(true)
				}
				gateMu.Unlock()
				if err := json.NewEncoder(output).Encode(map[string]any{"type": "update_ready", "request_id": control.RequestID, "ready": !busy}); err != nil {
					return err
				}
				continue
			}
			if control.Type == "cancel_update" {
				gateMu.Lock()
				updateReserved = false
				if authorizedGeneration == admissionGeneration && time.Now().Before(leaseUntil) {
					admission.Store(true)
				}
				gateMu.Unlock()
				continue
			}
			if control.Type == "status" {
				busy := true
				if serviceBusy, ok := service.(interface{ Busy() bool }); ok {
					busy = serviceBusy.Busy()
				}
				if err := json.NewEncoder(output).Encode(map[string]any{"type": "status", "busy": busy, "channel_connected": admission.Load()}); err != nil {
					return err
				}
				continue
			}
			if control.Type == "pause" {
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				continue
			}
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(leaseDuration)
			leaseUntil = time.Now().Add(leaseDuration)
			gateMu.Lock()
			if admissionGeneration == control.generation {
				authorizedGeneration = control.generation
				if !updateReserved {
					admission.Store(true)
				}
			}
			gateMu.Unlock()
		}
	}
}

func (c Config) validate() error {
	for _, v := range []string{c.InstanceID, c.AccountID, c.BoxID, c.DeviceID, c.StateDir, c.ServiceCredential, c.ServiceEpoch, c.ServiceName} {
		if strings.TrimSpace(v) == "" || strings.ContainsAny(v, "\r\n") {
			return errors.New("terminal scope or channel is incomplete")
		}
	}
	if !filepath.IsAbs(c.StateDir) {
		return errors.New("terminal state directory must be absolute")
	}
	for _, ch := range c.InstanceID {
		if !strings.ContainsRune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.", ch) {
			return fmt.Errorf("invalid terminal instance id")
		}
	}
	return nil
}
