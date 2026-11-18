package launcher

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

var errLightosStop = errors.New("runtime did not stop; replacement is blocked")

func randomID() string { return strings.ReplaceAll(uuid.NewString(), "-", "") }

type worker struct {
	cmd             *exec.Cmd
	input           io.WriteCloser
	mu              sync.Mutex
	writeMu         sync.Mutex
	registration    map[string]any
	busy, connected bool
	ready           chan error
	done            chan struct{}
	update          chan bool
	requestID       string
	address         string
}

func startWorker(ctx context.Context, folder string, manifest Artifact, config any) (*worker, error) {
	executable := filepath.Join(folder, manifest.Binary)
	if !verifyLightosFile(executable, manifest.BinarySHA256, manifest.BinarySize) {
		return nil, errors.New("runtime checksum mismatch")
	}
	cmd := exec.Command(executable, "worker")
	configureChild(cmd)
	input, e := cmd.StdinPipe()
	if e != nil {
		return nil, e
	}
	output, e := cmd.StdoutPipe()
	if e != nil {
		input.Close()
		return nil, e
	}
	// Diagnostic output is bounded; stdout is private and contains credentials.
	cmd.Stderr = io.Discard
	c := &worker{cmd: cmd, input: input, busy: true, ready: make(chan error, 1), done: make(chan struct{})}
	if e = cmd.Start(); e != nil {
		input.Close()
		return nil, e
	}
	outputDone := make(chan struct{})
	go func() {
		defer close(outputDone)
		defer output.Close()
		scanner := bufio.NewScanner(output)
		scanner.Buffer(make([]byte, 4096), 65536)
		first := true
		for scanner.Scan() {
			var msg struct {
				Type         string         `json:"type"`
				Protocol     string         `json:"protocol"`
				Registration map[string]any `json:"registration"`
				Busy         bool           `json:"busy"`
				Connected    bool           `json:"channel_connected"`
				RequestID    string         `json:"request_id"`
				Ready        bool           `json:"ready"`
				Address      string         `json:"address"`
			}
			if json.Unmarshal(scanner.Bytes(), &msg) != nil {
				break
			}
			c.mu.Lock()
			if first {
				if msg.Type != "ready" || msg.Protocol != manifest.TerminalProtocol || msg.Registration["terminal_epoch"] == nil || !strings.HasPrefix(msg.Address, "unix:") {
					c.mu.Unlock()
					c.ready <- errors.New("invalid runtime startup response")
					return
				}
				first = false
				c.registration = msg.Registration
				c.address = msg.Address
				c.connected = true
				c.ready <- nil
			} else if msg.Type == "status" {
				c.busy = msg.Busy
				c.connected = msg.Connected
			} else if msg.Type == "update_ready" && msg.RequestID == c.requestID && c.update != nil {
				select {
				case c.update <- msg.Ready:
				default:
				}
			}
			c.mu.Unlock()
		}
		if first {
			select {
			case c.ready <- errors.New("runtime stopped before ready"):
			default:
			}
		}
	}()
	go func() { <-outputDone; _ = cmd.Wait(); close(c.done) }()
	if e = c.send(config); e != nil {
		c.stop()
		return nil, e
	}
	select {
	case e = <-c.ready:
		if e != nil {
			c.stop()
			return nil, e
		}
		return c, nil
	case <-time.After(15 * time.Second):
		c.stop()
		return nil, errors.New("runtime startup timed out")
	case <-ctx.Done():
		c.stop()
		return nil, ctx.Err()
	}
}
func (c *worker) send(value any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return json.NewEncoder(c.input).Encode(value)
}
func (c *worker) stop() {
	c.input.Close()
	select {
	case <-c.done:
		return
	case <-time.After(4 * time.Second):
		_ = c.cmd.Process.Kill()
	}
	select {
	case <-c.done:
	case <-time.After(2 * time.Second):
	}
}
func (c *worker) alive() bool {
	select {
	case <-c.done:
		return false
	default:
		return true
	}
}
func (c *worker) state() (bool, bool, map[string]any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	r := make(map[string]any)
	for k, v := range c.registration {
		r[k] = v
	}
	return c.busy, c.connected, r
}
func (c *worker) prepareUpdate(ctx context.Context) bool {
	c.mu.Lock()
	if c.update != nil {
		c.mu.Unlock()
		return false
	}
	c.update = make(chan bool, 1)
	c.requestID = randomID()
	id, ch := c.requestID, c.update
	c.mu.Unlock()
	defer func() { c.mu.Lock(); c.update = nil; c.requestID = ""; c.mu.Unlock() }()
	if c.send(map[string]any{"type": "prepare_update", "request_id": id}) != nil {
		return false
	}
	select {
	case ready := <-ch:
		return ready
	case <-time.After(5 * time.Second):
		return false
	case <-ctx.Done():
		return false
	case <-c.done:
		return false
	}
}

func (c *worker) ipcAddress() string { c.mu.Lock(); defer c.mu.Unlock(); return c.address }
