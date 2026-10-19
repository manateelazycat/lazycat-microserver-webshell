// Older terminal cores forward the same OSC lifecycle signals without exposing
// metadata. Observe successful live writes only, never historical replay.
export function createProgramStatusObserver(initial = {}) {
  const decoder = new TextDecoder();
  let scanner = 0, pending = "", overflow = false, source = 0, spinner = false;
  let state = initial.programState || "", revision = BigInt(initial.programRevision || 0), completed = BigInt(initial.programCompleted || 0);
  const set = (next, priority) => {
    if (priority < source) return;
    source = priority;
    if (state === next) return;
    if (next === "done" || (next === "idle" && state === "working")) completed += 1n;
    state = next;
    revision += 1n;
  };
  const clear = () => {
    if (state !== "error") set("", source);
    source = 0; spinner = false;
  };
  const observe = (value) => {
    const separator = value.indexOf(";");
    if (separator < 0) return;
    const code = value.slice(0, separator), body = value.slice(separator + 1);
    if (code === "7501") {
      const next = body.split(":").find((field) => field.startsWith("state="))?.slice(6);
      if (["idle", "working", "blocked", "done", "error"].includes(next)) set(next, 3);
      else if (next === "clear") clear();
    } else if (code === "21337") {
      const field = body.split(";", 1)[0];
      const next = field.startsWith("status=") ? field.slice(7) : null;
      if (next === "Working") set("working", 2);
      else if (next === "Waiting") set("blocked", 2);
      else if (next === "Error") set("error", 2);
      else if (next === "Idle") set(state === "working" ? "done" : "idle", 2);
      else if (next === "" && source <= 2) clear();
    } else if (code === "9") {
      const [type, progress] = body.split(";");
      if (type !== "4") return;
      if (["1", "3"].includes(progress)) set("working", 2);
      else if (progress === "2") set("error", 2);
      else if (progress === "4") set("blocked", 2);
      else if (progress === "0") {
        if (state === "working") set("done", 2);
        else if (!["done", "error"].includes(state)) set("idle", 2);
      }
    } else if (code === "133") {
      const [type, exitCode] = body.split(";");
      if (type === "C") set("working", 1);
      else if (type === "D" && (exitCode === undefined || /^-?\d+$/.test(exitCode))) {
        set(exitCode !== undefined && Number(exitCode) !== 0 ? "error" : "done", 1);
      }
    } else if (["0", "2"].includes(code) && source <= 1) {
      const title = body.trim();
      const spinning = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(title);
      if (/^(?:\[\s*[!.]\s*\]\s*)?(?:action required|waiting for (?:input|permission|approval))\b/i.test(title)) set("blocked", 1);
      else if (spinning || /^(?:working|thinking|running|processing|starting)(?:\s*[|·—-]|$)/i.test(title)) set("working", 1);
      else if (/^(?:error|failed)(?:\s*[|·—-]|$)/i.test(title)) set("error", 1);
      else if (/^(?:ready|idle|done|complete|completed)(?:\s*[|·—-]|$)/i.test(title) || (spinner && state === "working" && title)) {
        if (state === "working") set("done", 1);
        else if (!["done", "error"].includes(state)) set("idle", 1);
      }
      spinner = spinning;
    }
  };
  return Object.freeze({
    write(data) {
      const before = revision;
      const text = typeof data === "string" ? data : decoder.decode(data, { stream: true });
      for (const character of text) {
        if (scanner === 0) { if (character === "\x1b") scanner = 1; }
        else if (scanner === 1) {
          if (character === "]") { scanner = 2; pending = ""; overflow = false; }
          else if (["P", "_", "^", "X"].includes(character)) scanner = 4;
          else if (character !== "\x1b") scanner = 0;
        } else if (scanner === 2 || scanner === 3) {
          if (character === "\x07" || (scanner === 3 && character === "\\")) {
            if (!overflow) observe(pending);
            scanner = 0; pending = "";
            continue;
          }
          if (scanner === 3) overflow = true;
          if (character === "\x1b") scanner = 3;
          else {
            scanner = 2;
            if (!overflow && pending.length < 4096) pending += character;
            else overflow = true;
          }
        } else if (scanner === 4) { if (character === "\x1b") scanner = 5; }
        else if (scanner === 5) {
          if (character === "\\") scanner = 0;
          else if (character !== "\x1b") scanner = 4;
        }
      }
      return { state, revision: revision.toString(), completed: completed.toString(), changed: revision !== before };
    },
  });
}
