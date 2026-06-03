const defaultSampleWindowMs = 8000;
const defaultEmitIntervalMs = 500;
const defaultMaxSamplesPerTask = 240;

const now = () => (
  globalThis.performance && typeof globalThis.performance.now === "function"
    ? globalThis.performance.now()
    : Date.now()
);

export function createPerformanceTaskMonitor({
  sampleWindowMs = defaultSampleWindowMs,
  emitIntervalMs = defaultEmitIntervalMs,
  maxSamplesPerTask = defaultMaxSamplesPerTask,
  onChange = null,
} = {}) {
  const samplesByName = new Map();
  let enabled = false;
  let emitTimer = 0;

  const safeSampleWindowMs = Math.max(1000, Number(sampleWindowMs) || defaultSampleWindowMs);
  const safeEmitIntervalMs = Math.max(100, Number(emitIntervalMs) || defaultEmitIntervalMs);
  const safeMaxSamplesPerTask = Math.max(10, Number(maxSamplesPerTask) || defaultMaxSamplesPerTask);

  const trimSamples = (samples, timestamp = now()) => {
    const cutoff = timestamp - safeSampleWindowMs;
    while (samples.length > 0 && samples[0].at < cutoff) {
      samples.shift();
    }
    while (samples.length > safeMaxSamplesPerTask) {
      samples.shift();
    }
  };

  const trimAllSamples = () => {
    const timestamp = now();
    for (const [name, samples] of samplesByName.entries()) {
      trimSamples(samples, timestamp);
      if (samples.length === 0) {
        samplesByName.delete(name);
      }
    }
  };

  const emitChange = () => {
    if (!enabled || typeof onChange !== "function" || emitTimer) {
      return;
    }
    emitTimer = globalThis.setTimeout(() => {
      emitTimer = 0;
      if (enabled) {
        onChange();
      }
    }, safeEmitIntervalMs);
  };

  const clear = () => {
    samplesByName.clear();
    if (emitTimer) {
      globalThis.clearTimeout(emitTimer);
      emitTimer = 0;
    }
  };

  const record = (name, durationMs) => {
    if (!enabled) {
      return;
    }
    const normalizedName = String(name || "").trim();
    const duration = Number(durationMs);
    if (!normalizedName || !Number.isFinite(duration)) {
      return;
    }
    const timestamp = now();
    let samples = samplesByName.get(normalizedName);
    if (!samples) {
      samples = [];
      samplesByName.set(normalizedName, samples);
    }
    samples.push({ at: timestamp, ms: Math.max(0, duration) });
    trimSamples(samples, timestamp);
    emitChange();
  };

  const measure = (name, fn) => {
    if (!enabled || typeof fn !== "function") {
      return fn();
    }
    const start = now();
    try {
      const result = fn();
      if (result && typeof result.finally === "function") {
        return result.finally(() => record(name, now() - start));
      }
      record(name, now() - start);
      return result;
    } catch (error) {
      record(name, now() - start);
      throw error;
    }
  };

  const snapshot = ({ limit = 10 } = {}) => {
    trimAllSamples();
    const rows = [];
    for (const [name, samples] of samplesByName.entries()) {
      let total = 0;
      let max = 0;
      for (const sample of samples) {
        total += sample.ms;
        max = Math.max(max, sample.ms);
      }
      const count = samples.length;
      if (count > 0) {
        rows.push({
          name,
          count,
          total,
          max,
          avg: total / count,
        });
      }
    }
    rows.sort((left, right) => right.total - left.total || right.max - left.max || left.name.localeCompare(right.name));
    return rows.slice(0, Math.max(1, Number(limit) || 10));
  };

  return {
    isEnabled() {
      return enabled;
    },
    setEnabled(nextEnabled) {
      const next = nextEnabled === true;
      if (enabled === next) {
        return;
      }
      enabled = next;
      clear();
      if (enabled && typeof onChange === "function") {
        onChange();
      }
    },
    clear,
    record,
    measure,
    snapshot,
  };
}
