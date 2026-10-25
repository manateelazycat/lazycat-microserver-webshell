// Package lightosterminal owns the client terminal's private parent protocol
// and lifecycle. The PC terminal gateway owns service registration and leases.
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
	"log"
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
	GatewayAddress    string `json:"gateway_address"`
	GatewayCredential string `json:"gateway_credential"`
}
type Binding struct {
	InstanceID, AccountID, BoxID, DeviceID, Epoch, Secret, Credential, StateDir string
	AdmissionAllowed                                                            func() bool
}
type Service interface {
	Address() string
	Close()
}
type Factory func(context.Context, Binding) (Service, error)

type leaseControl struct {
	Type              string `json:"type"`
	GatewayAddress    string `json:"gateway_address"`
	GatewayCredential string `json:"gateway_credential"`
	generation        uint64
}

type Registration struct {
	ServiceName      string `json:"terminal_service_name"`
	Secret           string `json:"terminal_secret"`
	CredentialHeader string `json:"terminal_cred_header"`
	Credential       string `json:"terminal_cred_value"`
	Epoch            string `json:"terminal_epoch"`
	Protocol         string `json:"terminal_protocol"`
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
	binding := Binding{InstanceID: config.InstanceID, AccountID: config.AccountID, BoxID: config.BoxID, DeviceID: config.DeviceID, StateDir: config.StateDir, AdmissionAllowed: admission.Load}
	for _, target := range []*string{&binding.Epoch, &binding.Secret, &binding.Credential} {
		data := make([]byte, 32)
		if _, err := rand.Read(data); err != nil {
			return err
		}
		*target = base64.RawURLEncoding.EncodeToString(data)
	}
	service, err := factory(ctx, binding)
	if err != nil {
		return err
	}
	defer service.Close()
	registration := Registration{ServiceName: ServicePrefix + config.InstanceID + "." + binding.Epoch, Secret: binding.Secret,
		CredentialHeader: CredentialHeader, Credential: binding.Credential, Epoch: binding.Epoch, Protocol: protocol}
	if err := register(ctx, config, service.Address(), registration); err != nil {
		return err
	}
	admission.Store(true)
	defer func() {
		service.Close()
		_ = register(context.Background(), config, "", registration)
	}()
	if err := json.NewEncoder(output).Encode(map[string]any{"type": "ready", "protocol": protocol, "registration": registration}); err != nil {
		return err
	}
	controls := make(chan leaseControl, 4)
	go func() {
		defer cancel()
		for scanner.Scan() {
			var message leaseControl
			if json.Unmarshal(scanner.Bytes(), &message) != nil || message.Type != "renew" && message.Type != "pause" {
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
			if control.GatewayAddress != "" && control.GatewayCredential != "" &&
				(control.GatewayAddress != config.GatewayAddress || control.GatewayCredential != config.GatewayCredential) {
				config.GatewayAddress = control.GatewayAddress
				config.GatewayCredential = control.GatewayCredential
			}
			// Every authenticated renewal also extends the independent route lease.
			err := register(ctx, config, service.Address(), registration)
			if err != nil {
				admission.Store(false)
				// Gateway failure affects new admission, not existing tasks.
				log.Print("terminal gateway registration will retry on the next authenticated renewal")
			} else {
				gateMu.Lock()
				if admissionGeneration == control.generation {
					admission.Store(true)
				}
				gateMu.Unlock()
			}
		}
	}
}

func (c Config) validate() error {
	for _, v := range []string{c.InstanceID, c.AccountID, c.BoxID, c.DeviceID, c.StateDir, c.GatewayAddress, c.GatewayCredential} {
		if strings.TrimSpace(v) == "" || strings.ContainsAny(v, "\r\n") {
			return errors.New("terminal scope or gateway is incomplete")
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
