import { createFullscreenTuiTouchGesture } from "../common/index.js";

const stripCommandTokenQuotes = (value) => {
  const token = String(value || "").trim();
  if (token.length < 2) {
    return token;
  }
  const quote = token[0];
  return (quote === "\"" || quote === "'") && token[token.length - 1] === quote
    ? token.slice(1, -1)
    : token;
};

const commandLineTokens = (value) => (
  String(value || "").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
).map(stripCommandTokenQuotes);

const executableName = (value) => {
  const normalized = stripCommandTokenQuotes(value).replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

export const grokExecutableNamePattern = /^grok(?:-\d+(?:\.\d+){1,3})?$/i;

export const isGrokExecutableToken = (value) => grokExecutableNamePattern.test(executableName(value));

export const isOfficialGrokEntrypoint = (value) => {
  const normalized = stripCommandTokenQuotes(value).replace(/\\/g, "/");
  return isGrokExecutableToken(normalized) || /(?:^|\/)@xai-official\/grok(?:\/|$)/i.test(normalized);
};

export const isGrokTerminalIdentity = (session) => {
  if (isGrokExecutableToken(session?.command)) {
    return true;
  }
  const tokens = commandLineTokens(session?.processCommandLine);
  if (isOfficialGrokEntrypoint(tokens[0])) {
    return true;
  }
  const launcher = executableName(tokens[0]).toLowerCase();
  if (["node", "nodejs", "bun", "deno"].includes(launcher) && isOfficialGrokEntrypoint(tokens[1])) {
    return true;
  }
  return String(session?.title || "").trim().toLowerCase() === "grok";
};

export const isGrokTerminalSession = isGrokTerminalIdentity;

export const isGrokFullscreenTouchCandidate = (session, { mouseTracking = false } = {}) => (
  isGrokTerminalIdentity(session) && mouseTracking === true
);

export { createFullscreenTuiTouchGesture };
