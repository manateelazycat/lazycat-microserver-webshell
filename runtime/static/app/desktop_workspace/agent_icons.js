import codex from "./agent_icons/codex.svg?url";
import claude from "./agent_icons/claude-code.svg?url";
import pi from "./agent_icons/pi.svg?url";
import gemini from "./agent_icons/gemini.svg?url";
import opencode from "./agent_icons/opencode.svg?url";
import goose from "./agent_icons/goose.svg?url";
import amp from "./agent_icons/amp.svg?url";
import qwen from "./agent_icons/qwen-code.svg?url";
import antigravity from "./agent_icons/antigravity-cli.svg?url";
import { isCodexTerminalIdentity } from "../../terminal/tui_adapters/codex/index.js";

// Keep the catalog and vector sources aligned with native AgentIcons.
const agents = new Map([
  ["codex", { name: "Codex", icon: codex }],
  ["claude-code", { name: "Claude Code", icon: claude }],
  ["pi", { name: "Pi", icon: pi }],
  ["gemini", { name: "Gemini CLI", icon: gemini }],
  ["opencode", { name: "OpenCode", icon: opencode }],
  ["goose", { name: "Goose", icon: goose }],
  ["amp", { name: "Amp", icon: amp }],
  ["qwen-code", { name: "Qwen Code", icon: qwen }],
  ["antigravity-cli", { name: "Antigravity CLI", icon: antigravity }],
]);
const aliases = new Map([
  ["claude", "claude-code"], ["qwen", "qwen-code"], ["agy", "antigravity-cli"],
]);
const packages = [
  ["codex", "@openai/codex"], ["claude-code", "@anthropic-ai/claude-code"],
  ["pi", "@mariozechner/pi-coding-agent"], ["gemini", "@google/gemini-cli"],
  ["opencode", "opencode-ai"], ["amp", "@sourcegraph/amp"], ["qwen-code", "@qwen-code/qwen-code"],
];

export function desktopAgentIdentity(pane) {
  if (isCodexTerminalIdentity(pane)) return agents.get("codex");
  const unquote = (value) => String(value || "").replace(/^(["'])(.*)\1$/, "$2");
  const tokens = (String(pane.processCommandLine || "").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map(unquote);
  const command = unquote(pane.command || tokens[0]).replace(/\\/g, "/").split("/").pop().replace(/\.exe$/i, "").toLowerCase();
  if (["node", "nodejs", "bun", "deno"].includes(command)) {
    // Match the actual script's package, never arbitrary command arguments or OSC titles.
    const script = String(tokens[1] || "").replace(/\\/g, "/");
    const match = packages.find(([, name]) => script.includes(`/node_modules/${name}/`));
    return match ? agents.get(match[0]) : null;
  }
  return agents.get(aliases.get(command) || command) || null;
}
