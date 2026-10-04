package core

import "strings"

// LocalEnvironment preserves the user's shell configuration, but never passes
// the desktop application's private proxy settings to interactive programs.
func LocalEnvironment(source []string) []string {
	env := make([]string, 0, len(source)+2)
	for _, entry := range source {
		key, _, _ := strings.Cut(entry, "=")
		switch strings.ToLower(key) {
		case "http_proxy", "https_proxy", "all_proxy", "no_proxy", "socks_proxy", "ws_proxy", "wss_proxy",
			"electron_run_as_node", "term", "colorterm":
			continue
		}
		env = append(env, entry)
	}
	return append(env, "TERM=xterm-256color", "COLORTERM=truecolor")
}
