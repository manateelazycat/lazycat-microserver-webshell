// deleteDatabase never creates a database. Do not probe with indexedDB.open().
export function retireClientTerminalHistory(windowObject = globalThis) {
  try {
    const indexedDB = windowObject.indexedDB;
    if (!indexedDB || typeof indexedDB.deleteDatabase !== "function") return;
    const request = indexedDB.deleteDatabase("lcmd-webshell-terminal-history");
    request.onerror = () => {};
    // An old open page may hold the database. Leave deletion pending; no timer,
    // new connection, cache writes or reload are needed in this page.
    request.onblocked = () => {};
  } catch {}
}
