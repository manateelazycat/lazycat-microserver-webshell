import { createServiceForwardingAPI } from "./service_forwarding_api.js";
import { createServiceForwardingLifecycle } from "./service_forwarding_lifecycle.js";
import {
  buildPublishServiceWarningMessage,
  buildServiceForwardPayload,
  isClientServiceForwardingTarget,
  normalizePublishedEntry,
  normalizePublishStatus,
  normalizeServiceForwardingTarget,
  normalizeServiceForwardSubdomain,
  parsePublishedEntryUpstream,
  serviceForwardEntryMatchesTarget,
} from "./service_forwarding_model.js";
import { createServiceForwardingView } from "./service_forwarding_view.js";

const staleOperationCode = "service_forwarding_stale_operation";

const createStaleOperationError = () => {
  const error = new Error("服务转发操作已失效。");
  error.code = staleOperationCode;
  return error;
};

const isStaleOperationError = (error) => error?.code === staleOperationCode;

export function createServiceForwardingController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseURL = windowObject?.location?.href,
  FormDataCtor = globalThis.FormData,
  FileCtor = globalThis.File,
  api = createServiceForwardingAPI({
    fetchImpl,
    baseURL,
    FormDataCtor,
    FileCtor,
  }),
  view = createServiceForwardingView({
    documentObject,
    EventCtor: windowObject?.Event || globalThis.Event,
  }),
  lifecycleFactory = createServiceForwardingLifecycle,
  getTarget = () => ({ selector: "", displayName: "" }),
  setFeedback = () => {},
  confirmDelete = async () => false,
  confirmPublicAccess = async () => false,
  openURL = () => {},
  closeSelect = () => {},
  consoleObject = globalThis.console,
} = {}) {
  let entries = [];
  let editingID = "";
  let busy = false;
  let selected = false;
  let started = false;
  let disposed = false;
  let refreshGeneration = 0;
  let operationGeneration = 0;
  let focusGeneration = 0;
  let focusTimer = 0;

  const currentTarget = () => normalizeServiceForwardingTarget(getTarget?.());
  const targetIsCurrent = (selector) => currentTarget().selector === selector;
  const operationIsCurrent = (generation, selector) => (
    !disposed
    && generation === operationGeneration
    && targetIsCurrent(selector)
  );

  const clearFocusTimer = () => {
    focusGeneration += 1;
    if (focusTimer) {
      windowObject?.clearTimeout?.(focusTimer);
      focusTimer = 0;
    }
  };

  const schedulePortFocus = () => {
    clearFocusTimer();
    const generation = focusGeneration;
    focusTimer = windowObject?.setTimeout?.(() => {
      focusTimer = 0;
      if (!disposed && generation === focusGeneration && view.isEditorOpen()) {
        view.focusPort();
      }
    }, 0) || 0;
  };

  const findEntry = (id) => {
    const normalizedID = String(id || "").trim();
    return entries.find((entry) => entry.id === normalizedID) || null;
  };

  const render = () => {
    if (disposed) {
      return;
    }
    const target = currentTarget();
    view.renderList(entries, {
      busy,
      targetAvailable: Boolean(target.selector),
    });
    view.setBusy(busy);
  };

  const setBusy = (nextBusy) => {
    busy = nextBusy === true && !disposed;
    render();
  };

  const closeEditor = () => {
    const wasOpen = view.isEditorOpen();
    clearFocusTimer();
    if (wasOpen) {
      closeSelect();
    }
    editingID = "";
    view.resetEditor();
  };

  const reportRefreshFailure = (error) => {
    if (!disposed && selected) {
      setFeedback(error?.message || "服务转发列表加载失败。", "error");
    }
  };

  const refresh = async ({ showFeedback = false } = {}) => {
    if (disposed || !view.isAvailable()) {
      return [];
    }
    const target = currentTarget();
    const generation = ++refreshGeneration;
    if (!target.selector) {
      entries = [];
      render();
      view.setStatus("");
      return [];
    }
    view.setStatus("正在加载服务转发...", "info");
    if (showFeedback) {
      setFeedback("");
    }
    try {
      const items = await api.list();
      if (disposed || generation !== refreshGeneration || !targetIsCurrent(target.selector)) {
        return entries.map((entry) => ({ ...entry }));
      }
      entries = items
        .map(normalizePublishedEntry)
        .filter((entry) => entry.id && serviceForwardEntryMatchesTarget(entry, target.selector));
      render();
      let warning = "";
      try {
        warning = buildPublishServiceWarningMessage(normalizePublishStatus(await api.status()));
      } catch (error) {
        warning = error?.message || "服务转发状态加载失败。";
      }
      if (disposed || generation !== refreshGeneration || !targetIsCurrent(target.selector)) {
        return entries.map((entry) => ({ ...entry }));
      }
      view.setStatus(warning, warning ? "warning" : "info");
      if (showFeedback) {
        setFeedback("服务转发列表已刷新。", "success");
      }
      return entries.map((entry) => ({ ...entry }));
    } catch (error) {
      if (disposed || generation !== refreshGeneration || !targetIsCurrent(target.selector)) {
        return entries.map((entry) => ({ ...entry }));
      }
      entries = [];
      render();
      view.setStatus(error?.message || "服务转发列表加载失败。", "error");
      if (showFeedback) {
        setFeedback(error?.message || "服务转发列表加载失败。", "error");
      }
      throw error;
    }
  };

  const refreshWhenSelected = () => {
    refresh().catch(reportRefreshFailure);
  };

  const openEditor = (entry = null) => {
    if (disposed || busy) {
      return false;
    }
    const normalized = entry ? normalizePublishedEntry(entry) : null;
    const target = currentTarget();
    const defaultTitle = target.displayName || target.selector.split("@", 1)[0] || "Service";
    const title = normalized?.title || defaultTitle;
    editingID = normalized?.id || "";
    view.openEditor({
      editing: Boolean(editingID),
      upstream: parsePublishedEntryUpstream(normalized?.upstream || ""),
      title,
      subdomain: normalized?.subdomain || normalizeServiceForwardSubdomain(title),
      skipAuth: normalized?.skip_auth === true,
      physicalTarget: isClientServiceForwardingTarget(target.selector),
    });
    view.setBusy(busy);
    schedulePortFocus();
    return true;
  };

  const assertCurrentOperation = (generation, selector) => {
    if (!operationIsCurrent(generation, selector)) {
      throw createStaleOperationError();
    }
  };

  const deploy = async () => {
    if (disposed || busy) {
      return false;
    }
    const target = currentTarget();
    const generation = ++operationGeneration;
    setBusy(true);
    let createdPublishID = "";
    try {
      if (!target.selector) {
        throw new Error("当前没有可用实例。");
      }
      const payload = buildServiceForwardPayload({
        editingID,
        form: view.readForm(),
      });
      if (isClientServiceForwardingTarget(target.selector)) {
        if (payload.skip_auth) {
          const confirmed = await confirmPublicAccess("跳过鉴权会让能够访问发布域名的人直接访问这台物理机可达的目标服务。确定公开吗？", {
            title: "公开物理机服务", okText: "确认公开", cancelText: "取消", danger: true,
          });
          assertCurrentOperation(generation, target.selector);
          if (!confirmed) return false;
        }
      }
      const status = normalizePublishStatus(await api.status());
      assertCurrentOperation(generation, target.selector);
      const warning = buildPublishServiceWarningMessage(status);
      if (warning) {
        throw new Error(warning);
      }
      const existingEntry = payload.id ? findEntry(payload.id) : null;
      if (payload.id && (!existingEntry || !serviceForwardEntryMatchesTarget(existingEntry, target.selector))) {
        throw new Error("无法编辑不属于当前实例的服务。");
      }
      const publishResult = payload.id
        ? await api.update({ id: payload.id, upstream: payload.upstream })
        : await api.create({ instance_name: target.selector, upstream: payload.upstream });
      const effectivePublishID = String(publishResult?.record?.id || payload.id || "").trim();
      if (!effectivePublishID) {
        throw new Error("服务转发创建失败。");
      }
      if (!payload.id) {
        createdPublishID = effectivePublishID;
      }
      if (!operationIsCurrent(generation, target.selector)) {
        if (createdPublishID) {
          await api.remove({ id: createdPublishID }).catch(() => {});
        }
        throw createStaleOperationError();
      }
      let installResult;
      try {
        installResult = await api.install({
          id: effectivePublishID,
          subdomain: payload.subdomain,
          title: payload.title,
          iconFile: payload.iconFile,
          skip_auth: payload.skip_auth,
        });
      } catch (error) {
        if (createdPublishID) {
          await api.remove({ id: createdPublishID }).catch(() => {});
        }
        throw error;
      }
      assertCurrentOperation(generation, target.selector);
      closeEditor();
      try {
        await refresh();
        assertCurrentOperation(generation, target.selector);
        setFeedback(installResult?.apk_build_warning ? "服务已部署，但 APK 生成失败。" : "服务已部署。", "success");
      } catch (error) {
        if (isStaleOperationError(error)) {
          throw error;
        }
        consoleObject?.warn?.(error);
        if (operationIsCurrent(generation, target.selector)) {
          setFeedback("服务已部署，但列表刷新失败。", "success");
          view.setStatus(error?.message || "服务转发列表刷新失败。", "error");
        }
      }
      return true;
    } catch (error) {
      if (!isStaleOperationError(error) && operationIsCurrent(generation, target.selector)) {
        const message = error?.message || "服务部署失败。";
        setFeedback(message, "error");
        view.setStatus(message, "error");
      }
      return false;
    } finally {
      if (operationIsCurrent(generation, target.selector)) {
        setBusy(false);
      }
    }
  };

  const deleteEntry = async (id = editingID) => {
    if (disposed || busy) {
      return false;
    }
    const target = currentTarget();
    const generation = ++operationGeneration;
    setBusy(true);
    try {
      const publishID = String(id || "").trim();
      if (!publishID) {
        return false;
      }
      const entry = findEntry(publishID);
      if (!entry || !serviceForwardEntryMatchesTarget(entry, target.selector)) {
        throw new Error("无法删除不属于当前实例的服务。");
      }
      const confirmed = await confirmDelete(`删除服务「${entry.title || entry.subdomain || entry.upstream}」？`, {
        title: "删除服务",
        okText: "删除",
        cancelText: "取消",
        danger: true,
      });
      assertCurrentOperation(generation, target.selector);
      if (!confirmed) {
        return false;
      }
      await api.remove({ id: publishID });
      assertCurrentOperation(generation, target.selector);
      if (editingID === publishID) {
        closeEditor();
      }
      await refresh();
      assertCurrentOperation(generation, target.selector);
      setFeedback("服务已删除。", "success");
      return true;
    } catch (error) {
      if (!isStaleOperationError(error) && operationIsCurrent(generation, target.selector)) {
        setFeedback(error?.message || "服务删除失败。", "error");
      }
      return false;
    } finally {
      if (operationIsCurrent(generation, target.selector)) {
        setBusy(false);
      }
    }
  };

  const handleListAction = (event) => {
    const action = view.resolveListAction(event);
    if (!action) {
      return;
    }
    const entry = findEntry(action.id);
    if (!entry) {
      return;
    }
    if (action.action === "open") {
      openURL(entry.app_url);
    } else if (action.action === "edit") {
      openEditor(entry);
    } else if (action.action === "delete") {
      deleteEntry(entry.id);
    }
  };

  const lifecycle = lifecycleFactory({
    elements: view.elements,
    handlers: {
      onAdd: () => openEditor(),
      onCancel: closeEditor,
      onDeleteCurrent: () => deleteEntry(),
      onListAction: handleListAction,
      onPortStepDown: () => view.stepPort(-1),
      onPortStepUp: () => view.stepPort(1),
      onSubmit: deploy,
      onTitleInput: () => {
        if (!editingID && !view.subdomainValue().trim()) {
          view.setSubdomain(normalizeServiceForwardSubdomain(view.titleValue()));
        }
      },
    },
  });

  return {
    closeEditor,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      selected = false;
      refreshGeneration += 1;
      operationGeneration += 1;
      lifecycle.dispose();
      closeEditor();
      entries = [];
      busy = false;
      view.resetEditor();
    },
    handleEscape(event) {
      if (event?.key !== "Escape" || !view.isEditorOpen()) {
        return false;
      }
      event.preventDefault?.();
      closeEditor();
      return true;
    },
    handleTargetChange() {
      if (disposed) {
        return;
      }
      refreshGeneration += 1;
      operationGeneration += 1;
      entries = [];
      busy = false;
      closeEditor();
      view.setStatus("");
      render();
      if (selected) {
        refreshWhenSelected();
      }
    },
    isEditorOpen() {
      return view.isEditorOpen();
    },
    refresh,
    render,
    setSelected(nextSelected) {
      if (disposed) {
        return;
      }
      const next = nextSelected === true;
      if (selected === next) {
        if (selected) {
          render();
        }
        return;
      }
      selected = next;
      if (!selected) {
        refreshGeneration += 1;
        return;
      }
      render();
      refreshWhenSelected();
    },
    snapshot() {
      const target = currentTarget();
      return {
        busy,
        disposed,
        editingID,
        entries: entries.map((entry) => ({ ...entry })),
        selected,
        target: { ...target },
      };
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      lifecycle.start();
      view.resetEditor();
      render();
    },
  };
}
