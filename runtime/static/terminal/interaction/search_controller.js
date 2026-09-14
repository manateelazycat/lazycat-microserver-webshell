import { createTerminalSearchLifecycle } from "./search_lifecycle.js";
import { findTerminalSearchMatches, scrollTerminalToAbsoluteRow } from "./search_model.js";
import { createTerminalSearchView } from "./search_view.js";

export function createTerminalSearchController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  view = null,
  lifecycleFactory = createTerminalSearchLifecycle,
  getActiveSession = () => null,
  getSearchSeed = () => "",
  closeContextMenu = () => {},
  refreshOverlayLayout = () => {},
  focusSession = (session) => session?.term?.focus?.(),
  showToast = () => {},
  findMatches = findTerminalSearchMatches,
  scrollToAbsoluteRow = scrollTerminalToAbsoluteRow,
} = {}) {
  const searchView = view || createTerminalSearchView({ documentObject });
  const state = {
    open: false,
    query: "",
    matches: [],
    index: -1,
    sessionId: "",
  };
  let started = false;
  let disposed = false;
  let queryGeneration = 0;
  let queryPending = null;
  let queryAgain = false;

  const updateCount = () => {
    const total = state.query ? state.matches.length : 0;
    searchView.setCount(total > 0 ? state.index + 1 : 0, total);
  };

  const selectCurrentMatch = () => {
    const session = getActiveSession();
    const match = state.matches[state.index];
    if (!session?.term || !match) {
      updateCount();
      return false;
    }
    const viewportRow = scrollToAbsoluteRow(session.term, match.row);
    session.term.select?.(match.col, viewportRow, Math.max(1, match.length));
    updateCount();
    return true;
  };

  const rebuildMatches = async () => {
    const generation = ++queryGeneration;
    const session = getActiveSession();
    if (queryPending?.session === session) { queryAgain = true; return; }
    queryAgain = false;
    state.matches = [];
    state.index = -1;
    state.sessionId = session?.id || "";
    if (!session?.term || !state.query) {
      updateCount();
      return;
    }
    const query = state.query;
    const pending = { session };
    queryPending = pending;
    try {
      const matches = session.term.wasmTerm?.isRemote
        ? await session.term.wasmTerm.search(query)
        : findMatches(session.term, query);
      if (disposed || generation !== queryGeneration || getActiveSession() !== session || !state.open) return;
      state.matches = matches;
    } catch (error) {
      if (!disposed && !session.closed && getActiveSession() === session && generation === queryGeneration && error?.code !== "BACKEND_CANCELLED") {
        showToast(error?.code === "TOO_MANY_MATCHES" ? "匹配结果过多，请缩小搜索范围。" : "搜索未完成，请稍后重试。");
      }
      return;
    } finally {
      if (queryPending === pending) {
        queryPending = null;
        if (queryAgain) {
          queryAgain = false;
          if (!disposed && state.open) rebuildMatches();
        }
      }
    }
    state.index = state.matches.length > 0 ? 0 : -1;
    selectCurrentMatch();
    updateCount();
  };

  const setQuery = (value, { select = false } = {}) => {
    if (disposed) {
      return;
    }
    state.query = String(value || "");
    searchView.setQuery(state.query, { select });
    rebuildMatches();
  };

  const close = ({ focus = true } = {}) => {
    if (disposed) {
      return;
    }
    state.open = false;
    queryGeneration += 1;
    queryAgain = false;
    searchView.close();
    refreshOverlayLayout();
    if (focus) {
      focusSession(getActiveSession());
    }
  };

  const move = (delta) => {
    if (disposed || state.matches.length === 0) {
      return false;
    }
    state.index = (state.index + delta + state.matches.length) % state.matches.length;
    return selectCurrentMatch();
  };

  const open = () => {
    if (disposed || !searchView.canOpen()) {
      return false;
    }
    closeContextMenu();
    state.open = true;
    searchView.open(state.query);
    refreshOverlayLayout();
    lifecycle.focusInput(() => searchView.focusAndSelect());
    rebuildMatches();
    return true;
  };

  const lifecycle = lifecycleFactory({
    windowObject,
    elements: searchView.elements,
    handlers: {
      onClose: () => close(),
      onInput: (event) => setQuery(event?.target?.value ?? searchView.readQuery()),
      onInputKeydown: (event) => {
        if (event?.key === "Enter") {
          event.preventDefault?.();
          move(event.shiftKey ? -1 : 1);
        } else if (event?.key === "Escape") {
          event.preventDefault?.();
          close();
        }
      },
      onNext: () => move(1),
      onPrevious: () => move(-1),
    },
  });

  return Object.freeze({
    close,
    dispose() {
      if (disposed) {
        return;
      }
      lifecycle.dispose();
      disposed = true;
      state.open = false;
      state.matches = [];
      state.index = -1;
      state.sessionId = "";
      searchView.dispose();
    },
    isOpen() {
      return state.open && searchView.isOpen();
    },
    move,
    open,
    async openFromSelection(session = getActiveSession()) {
      if (disposed) {
        return false;
      }
      let query;
      try { query = String(await getSearchSeed(session) || "").replace(/\s+/g, " ").trim().slice(0, 200); }
      catch { showToast("读取选区失败，请重试。"); return false; }
      if (disposed || session.closed || getActiveSession() !== session) return false;
      if (!query) {
        showToast("没有可搜索的选区。");
        return false;
      }
      if (!open()) {
        return false;
      }
      setQuery(query, { select: true });
      return true;
    },
    refresh() {
      if (!disposed && state.open) {
        rebuildMatches();
      }
    },
    setQuery,
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start();
    },
  });
}
