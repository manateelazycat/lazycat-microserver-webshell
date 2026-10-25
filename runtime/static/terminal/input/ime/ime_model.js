export const terminalInputSentinel = "\u200b";
export const terminalInputDeleteBufferLength = 256;
export const terminalInputDeleteBuffer = terminalInputSentinel.repeat(terminalInputDeleteBufferLength);

export const stripTerminalInputSentinel = (value) => (
  String(value || "").split(terminalInputSentinel).join("")
);

export const isBackwardDeleteInputType = (type) => (
  type === "deleteContentBackward"
  || type === "deleteWordBackward"
  || type === "deleteSoftLineBackward"
  || type === "deleteHardLineBackward"
);

export const isForwardDeleteInputType = (type) => (
  type === "deleteContentForward" || type === "deleteWordForward"
);

export const normalizeTerminalCompositionTextCandidates = (...values) => {
  const seen = new Set();
  const candidates = [];
  const add = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        add(item);
      }
      return;
    }
    const normalized = stripTerminalInputSentinel(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };
  for (const value of values) {
    add(value);
  }
  return candidates.sort((left, right) => right.length - left.length);
};

export const isIOSPlatform = (navigatorObject = globalThis.navigator) => {
  const platform = String(navigatorObject?.userAgentData?.platform || navigatorObject?.platform || "");
  const userAgent = String(navigatorObject?.userAgent || "");
  if (/\b(iPhone|iPad|iPod)\b/i.test(platform) || /\b(iPhone|iPad|iPod)\b/i.test(userAgent)) {
    return true;
  }
  return /\bMac/i.test(platform) && Number(navigatorObject?.maxTouchPoints || 0) > 1;
};

export const isAndroidPlatform = (navigatorObject = globalThis.navigator) => {
  const platform = String(navigatorObject?.userAgentData?.platform || navigatorObject?.platform || "");
  const userAgent = String(navigatorObject?.userAgent || "");
  return /\bAndroid\b/i.test(platform) || /\bAndroid\b/i.test(userAgent);
};
