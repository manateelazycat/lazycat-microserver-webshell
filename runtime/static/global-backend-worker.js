// Worker root: composition and lifetime only. No DOM or UI runtime imports.
import { createBackendWorkerRuntime, createTerminalEngine, queryTerminalText } from "./terminal/backend/worker/index.js";

export function startGlobalBackendWorker(scope = self) {
  const engine = createTerminalEngine();
  const runtime = createBackendWorkerRuntime({ scope, engine, queryText: queryTerminalText });
  runtime.start();
  return Object.freeze({ dispose: () => runtime.dispose() });
}

startGlobalBackendWorker();
