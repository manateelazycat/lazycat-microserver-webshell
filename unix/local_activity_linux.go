//go:build linux

package unix

import (
	"context"
	"strings"

	"lcmd-webshell/core"
)

// Local PTYs retain the short tty name used by the desktop workspace. The
// Linux scanner uses the absolute path reported by /proc/<pid>/fd/0.
func (LocalPlatform) ScanActivities(ctx context.Context, ttys []string) (map[string]core.PaneActivity, error) {
	paths := make([]string, 0, len(ttys))
	for _, tty := range ttys {
		paths = append(paths, "/dev/"+strings.TrimPrefix(tty, "/dev/"))
	}
	activities, err := ScanLocalActivities(ctx, paths)
	if err != nil {
		return nil, err
	}
	result := make(map[string]core.PaneActivity, len(ttys))
	for index, tty := range ttys {
		if activity, ok := activities[paths[index]]; ok {
			activity.TTY = tty
			result[tty] = activity
		}
	}
	return result, nil
}
