import { isCodexTerminalIdentity } from "../../terminal/tui_adapters/codex/index.js";

const unquote = (value) => String(value || "").replace(/^(["'])(.*)\1$/, "$2");
const executableName = (value) => unquote(value).replace(/\\/g, "/").split("/").pop() || "";

// This describes the actual foreground entry point, not a list of AI brands.
// Only executable/module/script names are exposed; arbitrary arguments and
// inline code (python -c / node -e) must never become a visible session badge.
const foregroundName = (pane) => {
  const tokens = (String(pane.processCommandLine || "").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map(unquote);
  const command = executableName(pane.command || tokens[0]);
  const launcher = executableName(tokens[0] || command);
  if (!/^(?:node|nodejs|bun|deno|python(?:w|\d+(?:\.\d+)*)?|ruby|perl|dotnet)(?:\.exe)?$/i.test(launcher)) return command;
  let entry = "";
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (["-c", "-e", "--eval", "-p", "--print"].includes(token)) return command;
    if (token === "-m") return /^[A-Za-z_]\w*(?:\.\w+)*$/.test(tokens[index + 1] || "")
      ? tokens[index + 1].split(".")[0] : command;
    if (["--require", "-r", "--loader", "--experimental-loader", "--import", "--title", "-W", "-X"].includes(token)) {
      index += 1;
      continue;
    }
    if (token === "run" || (token === "exec" && /^dotnet(?:\.exe)?$/i.test(launcher))) continue;
    if (token.startsWith("-")) {
      if (token.includes("=") || ["--", "-u", "-B", "-E", "-I", "-O", "-OO", "-s", "-S", "-q", "-i",
        "-A", "--allow-all", "--no-warnings", "--no-deprecation", "--enable-source-maps", "--nolazy",
        "--use-strict", "--inspect", "--inspect-brk", "--experimental-strip-types"].includes(token)) continue;
      return command;
    }
    entry = token;
    break;
  }
  if (!entry) return command;
  const parts = entry.replace(/\\/g, "/").split("/");
  const packageIndex = parts.lastIndexOf("node_modules");
  if (packageIndex >= 0) {
    return parts[packageIndex + (parts[packageIndex + 1]?.startsWith("@") ? 2 : 1)] || command;
  }
  return executableName(entry).replace(/\.(?:js|cjs|mjs|py|rb|pl|dll)$/i, "") || command;
};

export function desktopSessionActivity(tab) {
  const panes = [...tab.panes.values()];
  const foreground = tab.panes.get(tab.activePaneId) || panes[0];
  const running = foreground && !foreground.closed && !foreground.terminalExited && !foreground.terminalExitRetained;
  const working = panes.some((pane) => !pane.closed && !pane.terminalExited
    && (pane.programState ? pane.programState === "working" : pane.busy === true));
  const error = panes.some((pane) => pane.programState === "error"
    || ((pane.terminalExited || pane.terminalExitRetained) && Number(pane.terminalExitCode || 0) !== 0));
  const unread = tab.hasNotification === true;
  const blocked = panes.some((pane) => pane.programState === "blocked");
  return {
    application: !running ? "" : isCodexTerminalIdentity(foreground) ? "Codex"
      : foreground.busy ? foregroundName(foreground) : "",
    busy: working,
    notification: unread,
    status: error ? "error" : working ? "working" : blocked ? "idle" : unread ? "unread" : "idle",
    statusLabel: error ? "执行出错" : working ? "正在工作" : blocked ? "等待输入或授权"
      : unread ? "已完成，未读" : "",
  };
}
