export {
  createFullscreenTuiTouchGesture,
  installFullscreenTuiTouchAdapter,
  resolveFullscreenTuiTouchCompletion,
} from "./common/index.js";
export {
  createClaudeFullscreenTouchGesture,
  installClaudeFullscreenContextMenuAdapter,
  installClaudeFullscreenDesktopSelectionAdapter,
  installClaudeFullscreenTouchAdapter,
  isClaudeFullscreenContextMenuCandidate,
  isClaudeFullscreenDesktopSelectionCandidate,
  isClaudeFullscreenTouchCandidate,
  isClaudeTerminalIdentity,
  resolveClaudeFullscreenTouchCompletion,
} from "./claude/index.js";
export {
  installOpencodeFullscreenTouchAdapter,
  isOpencodeFullscreenTouchCandidate,
  isOpencodeTerminalIdentity,
} from "./opencode/index.js";
export {
  installHerdrFullscreenTouchAdapter,
  isHerdrFullscreenTouchCandidate,
  isHerdrTerminalIdentity,
} from "./herdr/index.js";
export {
  installPiFullscreenTouchAdapter,
  isPiFullscreenTouchCandidate,
  isPiTerminalIdentity,
} from "./pi/index.js";
export {
  grokExecutableNamePattern,
  installGrokFullscreenContextMenuAdapter,
  installGrokFullscreenDesktopSelectionAdapter,
  installGrokFullscreenTouchAdapter,
  isGrokExecutableToken,
  isGrokFullscreenContextMenuCandidate,
  isGrokFullscreenDesktopSelectionCandidate,
  isGrokFullscreenTouchCandidate,
  isGrokTerminalIdentity,
  isGrokTerminalSession,
  isOfficialGrokEntrypoint,
} from "./grok/index.js";
export { createTerminalTUIAdapterInstaller } from "./installation_controller.js";
