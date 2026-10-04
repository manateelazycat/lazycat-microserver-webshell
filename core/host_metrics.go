package core

import "context"

// HostMetrics describes an on-demand machine snapshot, not terminal-process use.
// Nil components are unavailable; zero values in a present component are real.
type HostMetrics struct {
	Generation  string      `json:"generation"`
	SampledAtMS int64       `json:"sampled_at_ms"`
	CPU         *HostCPU    `json:"cpu"`
	Memory      *HostMemory `json:"memory"`
	IO          *HostIO     `json:"io"`
}

type HostCPU struct {
	TotalSeconds float64 `json:"total_seconds"`
	BusySeconds  float64 `json:"busy_seconds"`
	LogicalCount int     `json:"logical_count"`
}

type HostMemory struct {
	UsedBytes  uint64 `json:"used_bytes"`
	TotalBytes uint64 `json:"total_bytes"`
}

type HostIO struct {
	ReadBytes  uint64 `json:"read_bytes"`
	WriteBytes uint64 `json:"write_bytes"`
	DeviceSet  string `json:"device_set"`
}

type HostMetricsSource interface {
	Snapshot(context.Context) (HostMetrics, error)
}

// Linux supplies a physical-disk selection to avoid counting partitions and
// stacked mapper/RAID devices twice. Other systems use the native collector.
type HostDiskSelector interface {
	HostDiskNames(context.Context) ([]string, error)
}
