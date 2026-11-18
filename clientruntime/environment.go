package main

import (
	"os"
	"strings"
)

func clearRuntimeEnvironment() {
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		switch strings.ToLower(key) {
		case "http_proxy", "https_proxy", "all_proxy", "no_proxy", "socks_proxy", "ws_proxy", "wss_proxy", "electron_run_as_node":
			_ = os.Unsetenv(key)
		}
	}
}
