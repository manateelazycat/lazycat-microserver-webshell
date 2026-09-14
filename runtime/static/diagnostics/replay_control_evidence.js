// Observe ASCII ESC controls without retaining printable text or control-string payloads.
// This is evidence about the retained byte stream, not a second terminal emulator.
export function createReplayControlEvidence(expectedBytes = null, fromStart = false, { source = "raw_replay_before_kitty", tailLimit = 24 } = {}) {
  let bytes = 0, scanMs = 0, active = true, state = "ground", body = "", stringKind = "";
  let escapeAt = 0, malformedCSI = 0, overflowCSI = 0, printableBytes = 0, controlKinds = 1, omittedControls = 0;
  const counts = { "CSI m": 0 }, first = [], last = [];
  const note = (control, at, category = control) => {
    if (counts[category]) counts[category] += 1;
    else if (controlKinds < 128) { counts[category] = 1; controlKinds += 1; }
    else omittedControls += 1;
    if (first.length < 12) first.push({ at, control });
    last.push({ at, control });
    if (last.length > tailLimit) last.shift();
  };
  return {
    consume(data) {
      if (!active || !(data instanceof Uint8Array)) return;
      const at = performance.now();
      for (const byte of data) {
        const offset = bytes++;
        if (state === "string") {
          if (byte === 27) state = "string_escape";
          else if (byte === 7 && stringKind === "]") state = "ground";
          continue;
        }
        if (state === "string_escape") {
          state = byte === 92 ? "ground" : byte === 27 ? "string_escape" : "string";
          continue;
        }
        if (byte === 24 || byte === 26) { state = "ground"; body = ""; continue; }
        if (byte === 27) { state = "escape"; escapeAt = offset; body = ""; continue; }
        if (state === "escape") {
          const char = String.fromCharCode(byte);
          if (char === "[") state = "csi";
          else if ("]P_X^".includes(char)) { state = "string"; stringKind = char; }
          else {
            if (["c", "7", "8", "D", "M", "E"].includes(char)) note(`ESC ${char}`, escapeAt);
            state = "ground";
          }
          continue;
        }
        if (state === "csi" || state === "csi_overflow") {
          if (byte >= 64 && byte <= 126) {
            const final = String.fromCharCode(byte);
            if (state !== "csi_overflow") {
              if (/^[?<=>]?[0-9;: ]*$/.test(body)) {
                // Attribute/color changes can be numerous: count without retaining parameters.
                if (final === "m") counts["CSI m"] = (counts["CSI m"] || 0) + 1;
                else if ("HfJKrshluABCDEFGdSTLMPX@b`aen".includes(final)) note(`CSI ${body}${final}`, escapeAt,
                  "HfABCDEFGdSTLMPX@b`ae".includes(final) ? `CSI ${final}` : `CSI ${body}${final}`);
              } else malformedCSI += 1;
            }
            state = "ground"; body = "";
          } else if (byte >= 32 && byte <= 63 && state !== "csi_overflow") {
            if (body.length < 64) body += String.fromCharCode(byte);
            else { state = "csi_overflow"; overflowCSI += 1; body = ""; }
          }
          continue;
        }
        if (byte >= 32 && byte !== 127) printableBytes += 1;
        else if ([8, 9, 10, 13].includes(byte)) counts[`C0 ${byte}`] = (counts[`C0 ${byte}`] || 0) + 1;
      }
      scanMs += performance.now() - at;
    },
    finish() { active = false; },
    snapshot() {
      return { source, fromStart, bytesObserved: bytes, expectedBytes,
        complete: !active, sizeMatches: expectedBytes === null ? null : bytes === expectedBytes,
        printableBytes, scanMs: Math.round(scanMs * 100) / 100, trailingState: state,
        malformedCSI, overflowCSI, omittedControls, counts: { ...counts }, first: first.slice(), last: last.slice() };
    },
  };
}
