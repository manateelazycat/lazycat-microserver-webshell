package provider

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

func scanContainerActivities(ctx context.Context, selector string, ttys []string) (map[string]PaneActivity, error) {
	result, uniqueTTYs := NormalizeActivityTTYs(ttys)
	if len(uniqueTTYs) == 0 {
		return result, nil
	}

	scanCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	output, err := exec.CommandContext(scanCtx, lightosctlPath, "exec", selector, "/bin/sh", "-lc", ProcScanScript).CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return result, err
		}
		return result, fmt.Errorf("%w: %s", err, text)
	}
	processes := ParseProcScanOutput(output)
	for _, tty := range uniqueTTYs {
		result[tty] = ResolveTTYActivity(tty, processes)
	}
	return result, nil
}
