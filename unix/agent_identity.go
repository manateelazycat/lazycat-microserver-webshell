package unix

import (
	"lcmd-webshell/core"
	"path/filepath"
	"strings"
)

// Only executable names and known package entrypoints establish identity. Never
// search free-form arguments, titles, history or a DI session's launch label.
func identifyAgent(executable, launcher string) *core.AgentIdentity {
	name := filepath.Base(strings.TrimPrefix(executable, "-"))
	id, display := "", ""
	switch name {
	case "codex":
		id, display = "codex", "Codex"
	case "claude", "claude-code", "claude.exe":
		id, display = "claude-code", "Claude Code"
	case "pi", "omp", "oh-my-pi":
		id, display = "pi", "Pi"
	case "gemini":
		id, display = "gemini", "Gemini CLI"
	case "opencode":
		id, display = "opencode", "OpenCode"
	case "aider":
		id, display = "aider", "Aider"
	case "goose":
		id, display = "goose", "Goose"
	case "amp":
		id, display = "amp", "Amp"
	case "agy", "antigravity-cli":
		id, display = "antigravity-cli", "Antigravity CLI"
	case "qwen":
		id, display = "qwen-code", "Qwen Code"
	case "node", "nodejs", "bun", "python", "python3":
		path := filepath.ToSlash(launcher)
		switch {
		case strings.HasSuffix(path, "/@openai/codex/bin/codex.js"):
			id, display = "codex", "Codex"
		case strings.HasSuffix(path, "/@anthropic-ai/claude-code/cli.js"):
			id, display = "claude-code", "Claude Code"
		case strings.HasSuffix(path, "/@mariozechner/pi-coding-agent/dist/cli.js"),
			strings.HasSuffix(path, "/@earendil-works/pi-coding-agent/dist/bundle/cli.js"),
			strings.HasSuffix(path, "/@oh-my-pi/pi-coding-agent/dist/cli.js"),
			strings.HasSuffix(path, "/@oh-my-pi/pi-coding-agent/dist/bundle/cli.js"):
			id, display = "pi", "Pi"
		case strings.HasSuffix(path, "/@google/gemini-cli/dist/index.js"):
			id, display = "gemini", "Gemini CLI"
		case strings.HasSuffix(path, "/@qwen-code/qwen-code/cli.js"):
			id, display = "qwen-code", "Qwen Code"
		default:
			switch filepath.Base(path) {
			case "pi", "omp", "oh-my-pi":
				id, display = "pi", "Pi"
			}
		}
	}
	if id == "" {
		return nil
	}
	return &core.AgentIdentity{ID: id, Name: display, Source: "process"}
}
