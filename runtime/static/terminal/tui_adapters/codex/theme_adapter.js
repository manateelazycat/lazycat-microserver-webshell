const unquote = (value) => {
  const text = String(value || "").trim();
  return text.length > 1 && ["\"", "'"].includes(text[0]) && text[text.length - 1] === text[0]
    ? text.slice(1, -1)
    : text;
};

const executableName = (value) => unquote(value).replace(/\\/g, "/").split("/").pop();
const isCodexExecutable = (value) => /^codex(?:-\d+(?:\.\d+){1,3})?(?:\.exe)?$/i.test(executableName(value));

export const isCodexTerminalIdentity = (session) => {
  if (!session || session.closed || session.terminalExitRetained) return false;
  // Use foreground process metadata, never a user-controlled or stale OSC title.
  if (isCodexExecutable(session.command)) return true;
  const tokens = (String(session.processCommandLine || "").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map(unquote);
  if (isCodexExecutable(tokens[0])) return true;
  return /^(?:node|nodejs|bun|deno)(?:\.exe)?$/i.test(executableName(tokens[0]))
    && (
      // npm exposes the official launcher through bin/codex symlinks. Activity
      // reports that invocation path, not the resolved @openai package path.
      isCodexExecutable(tokens[1])
      || /(?:^|\/)@openai\/codex\/bin\/codex\.js$/i.test(String(tokens[1] || "").replace(/\\/g, "/"))
    );
};

const parseRGB = (value) => {
  const hex = String(value || "").replace(/^#/, "");
  return /^[\da-f]{6}$/i.test(hex)
    ? [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    : null;
};

// Codex rust-v0.154.0: tui/src/style.rs::user_message_bg_rgb and color.rs::blend.
// Match Rust's f32 arithmetic and truncation, rather than rounding CSS channels.
const composerBackground = (background) => {
  const f = Math.fround;
  const light = f(f(f(0.299) * background[0]) + f(f(0.587) * background[1]));
  const isLight = f(light + f(f(0.114) * background[2])) > 128;
  const alpha = f(isLight ? 0.04 : 0.12);
  const foreground = isLight ? 0 : 255;
  return background.map((channel) => Math.trunc(f(f(foreground * alpha) + f(channel * f(1 - alpha)))));
};

/** Exact, background-only compatibility mapping for Codex's terminal-derived fill. */
export function createCodexThemeAdapter({ getThemes = () => [] } = {}) {
  const cache = new WeakMap();

  return Object.freeze({
    getBackgroundColorMap(session, terminalTheme) {
      if (!isCodexTerminalIdentity(session)) return null;
      const target = String(terminalTheme?.background || "");
      const base = String(session.baseTheme?.xterm?.background || session.baseTheme?.background || "");
      const previous = cache.get(session);
      if (previous?.target === target && previous.base === base) return previous.map;
      const targetRGB = parseRGB(target);
      if (!targetRGB) return null;
      const next = composerBackground(targetRGB);
      const css = `rgb(${next[0]}, ${next[1]}, ${next[2]})`;
      const map = new Map();
      // A restored session may have started Codex under another catalog theme.
      // Match the raw fill instead of guessing the process's startup theme.
      for (const source of [base, target, ...getThemes().map((theme) => theme.xterm?.background || theme.background)]) {
        const rgb = parseRGB(source);
        if (rgb) map.set(composerBackground(rgb).join(","), css);
      }
      cache.set(session, { target, base, map });
      return map;
    },
  });
}
