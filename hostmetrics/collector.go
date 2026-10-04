// Package hostmetrics samples only when an authenticated caller asks for data.
// This separate module is linked into PC/CLI terminals, not container agents.
package hostmetrics

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"math"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/mem"
	"lcmd-webshell/core"
)

type Collector struct {
	gate     chan struct{}
	started  time.Time
	last     time.Time
	cached   core.HostMetrics
	selector core.HostDiskSelector
}

// New creates no timer, goroutine, shell, or sampling loop.
func New(platform core.Platform) *Collector {
	selector, _ := platform.(core.HostDiskSelector)
	return &Collector{gate: make(chan struct{}, 1), started: time.Now(), selector: selector}
}

func (c *Collector) Snapshot(ctx context.Context) (core.HostMetrics, error) {
	select {
	case c.gate <- struct{}{}:
		defer func() { <-c.gate }()
	case <-ctx.Done():
		return core.HostMetrics{}, ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return core.HostMetrics{}, err
	}
	// Concurrent viewers may share a fresh raw snapshot, never a rate baseline.
	if !c.last.IsZero() && time.Since(c.last) < time.Second {
		return c.cached, nil
	}
	value := core.HostMetrics{}
	if times, err := cpu.TimesWithContext(ctx, false); err == nil && len(times) == 1 {
		t := times[0]
		total := t.User + t.System + t.Nice + t.Idle + t.Iowait + t.Irq + t.Softirq + t.Steal
		if runtime.GOOS != "linux" {
			total += t.Guest + t.GuestNice
		}
		busy := total - t.Idle - t.Iowait
		if finite(total) && finite(busy) && total > 0 && busy >= 0 && busy <= total {
			value.CPU = &core.HostCPU{TotalSeconds: total, BusySeconds: busy, LogicalCount: runtime.NumCPU()}
		}
	}
	if ctx.Err() == nil {
		if memory, err := mem.VirtualMemoryWithContext(ctx); err == nil && memory.Total > 0 && memory.Used <= memory.Total {
			value.Memory = &core.HostMemory{UsedBytes: memory.Used, TotalBytes: memory.Total}
		}
	}
	if ctx.Err() == nil {
		value.IO = c.readIO(ctx)
	}
	if err := ctx.Err(); err != nil {
		return core.HostMetrics{}, err
	}
	c.last = time.Now()
	value.SampledAtMS = c.last.Sub(c.started).Milliseconds()
	c.cached = value
	return value, nil
}

func (c *Collector) readIO(ctx context.Context) *core.HostIO {
	var names []string
	if c.selector != nil {
		var err error
		names, err = c.selector.HostDiskNames(ctx)
		if err != nil || len(names) == 0 {
			return nil
		}
	} else if runtime.GOOS == "linux" {
		return nil // Never fall back to summing partitions and their parent disks.
	}
	counts, err := disk.IOCountersWithContext(ctx, names...)
	if err != nil || len(counts) == 0 {
		return nil
	}
	value := &core.HostIO{}
	devices := make([]string, 0, len(counts))
	for name, count := range counts {
		if math.MaxUint64-value.ReadBytes < count.ReadBytes || math.MaxUint64-value.WriteBytes < count.WriteBytes {
			return nil
		}
		value.ReadBytes += count.ReadBytes
		value.WriteBytes += count.WriteBytes
		devices = append(devices, name)
	}
	sort.Strings(devices)
	digest := sha256.Sum256([]byte(strings.Join(devices, "\x00")))
	value.DeviceSet = hex.EncodeToString(digest[:])
	return value
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
