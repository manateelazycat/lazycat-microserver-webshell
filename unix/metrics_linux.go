//go:build linux

package unix

import (
	"context"
	"errors"
	"os"
	"path/filepath"
)

func (LocalPlatform) HostDiskNames(ctx context.Context) ([]string, error) {
	entries, err := os.ReadDir("/sys/block")
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		// /sys/block contains whole disks; a backing device excludes loop, zram,
		// device-mapper and software RAID layers without guessing disk names.
		if _, err := os.Stat(filepath.Join("/sys/block", entry.Name(), "device")); err == nil {
			names = append(names, entry.Name())
		}
	}
	if len(names) == 0 {
		return nil, errors.New("physical disk counters unavailable")
	}
	return names, nil
}
