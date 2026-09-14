package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

const terminalMemoryCheckpointProtocol = "ghostty-memory-v1"
const terminalCheckpointMaxMemory = 256 << 20
const terminalCheckpointMaxCompressed = 16 << 20

//go:embed runtime/static/ghostty-vt.wasm
var terminalCheckpointWASM []byte

var checkpointRuntime struct {
	sync.Once
	runtime  wazero.Runtime
	compiled wazero.CompiledModule
	err      error
}

type terminalMemoryCheckpoint struct {
	Protocol        string `json:"protocol"`
	WASMSHA256      string `json:"wasm_sha256"`
	MemorySHA256    string `json:"memory_sha256"`
	MemoryBytes     uint32 `json:"memory_bytes"`
	Handle          uint32 `json:"handle"`
	Stack           uint32 `json:"stack"`
	Cols            int    `json:"cols"`
	Rows            int    `json:"rows"`
	ScrollbackLines int    `json:"scrollback_lines"`
	ScrollbackBytes uint32 `json:"scrollback_bytes"`
	Cursor          string `json:"cursor"`
	Parts           int    `json:"parts"`
	Compressed      []byte `json:"-"`
}

// Each pane owns one isolated module. All calls use the pane mutex, including
// snapshot, resize and close; a checkpoint is taken only between completed WASM
// calls. A nil module is terminal: disposal must never allow another WASM call.
type terminalCheckpointEngine struct {
	module                 api.Module
	handle                 uint32
	cols, rows, scrollback int
	capacity               uint32
	pending                []byte
	err                    error
	legacyGraphics         bool
	resizeObservations     []checkpointResizeObservation
	skippedResizes         uint64
}

func checkpointHash(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func newTerminalCheckpointEngine(cols, rows, lines int) (*terminalCheckpointEngine, error) {
	checkpointRuntime.Do(func() {
		ctx := context.Background()
		checkpointRuntime.runtime = wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfigCompiler().WithMemoryLimitPages(4096).WithCloseOnContextDone(true))
		_, checkpointRuntime.err = checkpointRuntime.runtime.NewHostModuleBuilder("env").NewFunctionBuilder().WithFunc(func(uint32, uint32) {}).Export("log").Instantiate(ctx)
		if checkpointRuntime.err == nil {
			checkpointRuntime.compiled, checkpointRuntime.err = checkpointRuntime.runtime.CompileModule(ctx, terminalCheckpointWASM)
		}
	})
	if checkpointRuntime.err != nil {
		return nil, checkpointRuntime.err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	module, err := checkpointRuntime.runtime.InstantiateModule(ctx, checkpointRuntime.compiled, wazero.NewModuleConfig().WithName(""))
	if err != nil {
		return nil, err
	}
	e := &terminalCheckpointEngine{module: module, cols: cols, rows: rows, scrollback: lines}
	if module.ExportedGlobal("__webshell_checkpoint_stack") == nil {
		e.close()
		return nil, errors.New("checkpoint WASM ABI unavailable")
	}
	e.capacity = e.scrollbackCapacity(cols, rows)
	config := make([]byte, 80)
	binary.LittleEndian.PutUint32(config, e.capacity)
	ptr, err := e.call("ghostty_wasm_alloc_u8_array", uint64(len(config)))
	if err == nil && ptr != 0 {
		module.Memory().Write(uint32(ptr), config)
		var handle uint64
		handle, err = e.call("ghostty_terminal_new_with_config", uint64(cols), uint64(rows), ptr)
		e.handle = uint32(handle)
		_, _ = e.call("ghostty_wasm_free_u8_array", ptr, uint64(len(config)))
	}
	if err != nil || e.handle == 0 {
		e.close()
		return nil, fmt.Errorf("create checkpoint terminal failed: %v", err)
	}
	return e, nil
}

func (e *terminalCheckpointEngine) call(name string, args ...uint64) (uint64, error) {
	if e == nil || e.module == nil || e.module.IsClosed() {
		return 0, errors.New("checkpoint terminal is closed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	fn := e.module.ExportedFunction(name)
	if fn == nil {
		return 0, fmt.Errorf("checkpoint export unavailable: %s", name)
	}
	values, err := fn.Call(ctx, args...)
	if err != nil {
		return 0, err
	}
	if len(values) == 0 {
		return 0, nil
	}
	return values[0], nil
}

func (e *terminalCheckpointEngine) scrollbackCapacity(cols, rows int) uint32 {
	n := int64(e.scrollback+max(1, rows))*int64(max(1, cols)+64)*16 + (512 << 10)
	return uint32(min(int64(terminalCheckpointMaxMemory/2), max(int64(1<<20), n)))
}

func (e *terminalCheckpointEngine) write(data []byte) {
	if e == nil || e.module == nil || e.err != nil || e.legacyGraphics {
		return
	}
	input := data
	if len(e.pending) > 0 {
		input = append(e.pending, data...)
	}
	if bytes.Contains(input, []byte("\x1b_G")) {
		e.legacyGraphics = true
		e.pending = nil
		e.close()
		return
	}
	boundary := terminalCheckpointBoundary(input)
	e.pending = append([]byte(nil), input[boundary:]...)
	if len(e.pending) > 1<<20 {
		e.err = errors.New("checkpoint control sequence exceeds limit")
		return
	}
	if boundary == 0 {
		return
	}
	ptr, err := e.call("ghostty_wasm_alloc_u8_array", uint64(boundary))
	if err != nil || ptr == 0 {
		e.err = fmt.Errorf("checkpoint allocation failed: %v", err)
		return
	}
	if !e.module.Memory().Write(uint32(ptr), input[:boundary]) {
		e.err = errors.New("checkpoint input is out of bounds")
		return
	}
	ok, err := e.call("ghostty_terminal_write", uint64(e.handle), ptr, uint64(boundary))
	_, _ = e.call("ghostty_wasm_free_u8_array", ptr, uint64(boundary))
	if err != nil || ok != 1 {
		e.err = fmt.Errorf("checkpoint parser failed: %v", err)
		return
	}
	// A shadow parser must never inject responses or retain an unbounded query queue.
	for count := 0; count < 4096; count++ {
		ready, err := e.call("ghostty_terminal_has_response", uint64(e.handle))
		if err != nil {
			e.err = err
			return
		}
		if ready == 0 {
			return
		}
		// read_response consumes one response; buffer size matches the bridge API.
		buf, err := e.call("ghostty_wasm_alloc_u8_array", 65536)
		if err != nil || buf == 0 {
			e.err = errors.New("checkpoint response allocation failed")
			return
		}
		_, err = e.call("ghostty_terminal_read_response", uint64(e.handle), buf, 65536)
		_, _ = e.call("ghostty_wasm_free_u8_array", buf, 65536)
		if err != nil {
			e.err = err
			return
		}
	}
	e.err = errors.New("checkpoint response queue exceeded limit")
}

func (e *terminalCheckpointEngine) resize(cols, rows, lines int) {
	if e != nil && e.err != nil {
		e.skippedResizes++
	}
	if e == nil || e.module == nil || e.err != nil || e.legacyGraphics {
		return
	}
	startedAt := time.Now()
	observation := checkpointResizeObservation{AtUnixMS: startedAt.UnixMilli(), FromCols: e.cols, FromRows: e.rows,
		ToCols: cols, ToRows: rows, MemoryBefore: e.memoryBytes()}
	defer func() {
		observation.DurationMS = float64(time.Since(startedAt).Microseconds()) / 1000
		observation.MemoryAfter = e.memoryBytes()
		if e.err != nil {
			observation.Error = e.err.Error()
		}
		e.resizeObservations = append(e.resizeObservations, observation)
		if len(e.resizeObservations) > 8 {
			e.resizeObservations = e.resizeObservations[len(e.resizeObservations)-8:]
		}
	}()
	e.scrollback = lines
	capacity := e.scrollbackCapacity(cols, rows)
	if capacity > e.capacity {
		_, e.err = e.call("ghostty_terminal_set_scrollback_limit", uint64(e.handle), uint64(capacity))
		e.capacity = capacity
	}
	if e.err != nil {
		return
	}
	if cols != e.cols || rows != e.rows {
		ok, err := e.call("ghostty_terminal_resize", uint64(e.handle), uint64(cols), uint64(rows))
		if err != nil || ok != 1 {
			if err != nil {
				e.err = fmt.Errorf("checkpoint resize failed: %w", err)
			} else {
				observation.NativeError = e.nativeResizeError()
				e.err = fmt.Errorf("checkpoint resize failed: native=%s result=%d from=%dx%d to=%dx%d memory=%d limit=%d",
					observation.NativeError, ok, e.cols, e.rows, cols, rows, e.memoryBytes(), terminalCheckpointMaxMemory)
			}
			return
		}
		e.cols, e.rows = cols, rows
	}
}

func (e *terminalCheckpointEngine) snapshot(cursor uint64) (*terminalMemoryCheckpoint, error) {
	if e == nil {
		return nil, errors.New("checkpoint terminal is closed")
	}
	if e.err != nil {
		return nil, e.err
	}
	if e.legacyGraphics {
		return nil, nil
	}
	if e.module == nil || e.module.IsClosed() {
		return nil, errors.New("checkpoint terminal is closed")
	}
	memory, ok := e.module.Memory().Read(0, e.module.Memory().Size())
	if !ok || len(memory) > terminalCheckpointMaxMemory {
		return nil, errors.New("checkpoint memory exceeds limit")
	}
	var compressed bytes.Buffer
	zip, _ := gzip.NewWriterLevel(&compressed, gzip.BestSpeed)
	if _, err := zip.Write(memory); err != nil {
		return nil, err
	}
	if err := zip.Close(); err != nil {
		return nil, err
	}
	if compressed.Len() > terminalCheckpointMaxCompressed {
		return nil, errors.New("compressed checkpoint exceeds limit")
	}
	return &terminalMemoryCheckpoint{Protocol: terminalMemoryCheckpointProtocol,
		WASMSHA256: checkpointHash(terminalCheckpointWASM), MemorySHA256: checkpointHash(memory), MemoryBytes: uint32(len(memory)),
		Handle: e.handle, Stack: uint32(e.module.ExportedGlobal("__webshell_checkpoint_stack").Get()),
		Cols: e.cols, Rows: e.rows, ScrollbackLines: e.scrollback, ScrollbackBytes: e.capacity,
		Cursor: fmt.Sprint(cursor - uint64(len(e.pending))), Compressed: compressed.Bytes()}, nil
}

func (e *terminalCheckpointEngine) close() {
	if e != nil && e.module != nil {
		_ = e.module.Close(context.Background())
		e.module = nil
		e.pending = nil
	}
}

// Return the last boundary at which a new UI decoder/interceptor can begin.
// Partial UTF-8 and control strings remain ordinary replay bytes after the checkpoint.
func terminalCheckpointBoundary(data []byte) int {
	state, safe := byte(0), 0
	osc := false
	for i := 0; i < len(data); {
		b := data[i]
		if state == 0 && b >= utf8.RuneSelf {
			if !utf8.FullRune(data[i:]) {
				break
			}
			_, size := utf8.DecodeRune(data[i:])
			i += size
			safe = i
			continue
		}
		i++
		if b == 0x18 || b == 0x1a {
			state = 0
		}
		switch state {
		case 0:
			if b == 0x1b {
				state = 1
			}
		case 1:
			switch b {
			case '[':
				state = 2
			case ']', 'P', '_', '^', 'X':
				state = 3
				osc = b == ']'
			default:
				if b >= 0x30 && b <= 0x7e {
					state = 0
				}
			}
		case 2:
			if b == 0x1b {
				state = 1
			} else if b >= 0x40 && b <= 0x7e {
				state = 0
			}
		case 3:
			if b == 0x1b {
				state = 4
			} else if osc && b == 7 {
				state = 0
			}
		case 4:
			if b == '\\' {
				state = 0
			} else if b != 0x1b {
				state = 3
			}
		}
		if state == 0 {
			safe = i
		}
	}
	return safe
}
