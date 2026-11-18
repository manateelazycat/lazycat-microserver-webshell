import { createInstancesLifecycle } from "./instances_lifecycle.js";
import { createInstancesLoader } from "./instances_loader.js";
import {
  findInstanceBySelector,
  firstRunningInstanceSelector,
  instanceDisplayName,
  isRunningInstance,
  readInstanceTargetName,
} from "./instances_model.js";
import {
  createInstancesNavigation,
  withMobileRemoteDesktopPreference,
} from "./instances_navigation.js";
import { createInstancesView } from "./instances_view.js";

const cloneInstances = (instances) => (
  (Array.isArray(instances) ? instances : []).map((item) => ({ ...item }))
);

const abortError = () => {
  const error = new Error("Instance controller was disposed");
  error.name = "AbortError";
  return error;
};

export function createInstancesController({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  AbortControllerCtor = globalThis.AbortController,
  isEmbedMode = false,
  loader = null,
  loaderFactory = createInstancesLoader,
  navigation = null,
  navigationFactory = createInstancesNavigation,
  view = createInstancesView({ documentObject, windowObject }),
  lifecycleFactory = createInstancesLifecycle,
  getActiveName = () => "",
  setActiveName = () => 0,
  updateLocation = () => {},
  onSwitchTarget = async () => {},
  onInstancesChange = () => {},
  onSameTargetNavigation = () => {},
  consumePopState = () => false,
  prepareSwitcherOpen = () => {},
  prepareHomeNavigation = () => {},
  commitHomeNavigation = () => {},
  rollbackHomeNavigation = () => {},
  getMobileRemoteDesktopEnabled = () => false,
  showToast = () => {},
  consoleObject = globalThis.console,
} = {}) {
  let started = false;
  let disposed = false;
  let instances = [];
  let loadGeneration = 0;
  let loadInflight = null;
  let switcherGeneration = 0;

  const applyInstances = (nextInstances) => {
    if (disposed) {
      return;
    }
    instances = cloneInstances(nextInstances);
    render();
    onInstancesChange();
  };

  const instancesLoader = loader || loaderFactory({
    fetchImpl,
    isDisposed: () => disposed,
    onRetry: ({ attempt, delay, error }) => {
      consoleObject?.warn?.("[instances] startup request retry", {
        attempt,
        delay,
        status: Number(error?.status) || 0,
      });
    },
  });
  const instancesNavigation = navigation || navigationFactory({
    fetchImpl,
    baseURL: windowObject?.location?.href,
    AbortControllerCtor,
  });

  const render = () => {
    if (disposed) {
      return;
    }
    view.renderList?.({
      instances,
      activeName: String(getActiveName?.() || "").trim(),
    });
  };

  const closeSwitcher = () => {
    switcherGeneration += 1;
    view.closeSwitcher?.();
  };

  const load = () => {
    if (disposed) {
      return Promise.reject(abortError());
    }
    if (loadInflight) {
      return loadInflight.promise;
    }
    const generation = ++loadGeneration;
    let pending;
    try {
      pending = instancesLoader.load();
    } catch (error) {
      pending = Promise.reject(error);
    }
    const promise = Promise.resolve(pending).then((nextInstances) => {
      if (disposed || generation !== loadGeneration) {
        throw abortError();
      }
      applyInstances(nextInstances);
      return nextInstances;
    });
    loadInflight = { generation, promise };
    promise.finally(() => {
      if (loadInflight?.generation === generation) {
        loadInflight = null;
      }
    }).catch(() => {});
    return promise;
  };

  const loadDefaultName = async () => {
    const available = instances.length > 0 ? instances : await load();
    const targetName = firstRunningInstanceSelector(available);
    if (!targetName) {
      throw new Error("No running LightOS instance found");
    }
    return targetName;
  };

  const openSwitcher = async () => {
    if (disposed || isEmbedMode || !view.isAvailable?.()) {
      return;
    }
    prepareSwitcherOpen?.();
    const generation = ++switcherGeneration;
    view.openSwitcher?.();
    view.setFeedback?.("");
    try {
      await load();
      if (!disposed && generation === switcherGeneration && view.isSwitcherOpen?.()) {
        render();
      }
    } catch (error) {
      if (!disposed && generation === switcherGeneration && error?.name !== "AbortError") {
        view.setFeedback?.(error?.message || String(error));
      }
    }
  };

  const switchTo = async (nextName, { updateURL = true, replaceURL = false } = {}) => {
    const normalized = String(nextName || "").trim();
    if (disposed || !normalized || normalized === String(getActiveName?.() || "").trim()) {
      return;
    }
    closeSwitcher();
    const task = onSwitchTarget?.(normalized, { updateURL, replaceURL });
    render();
    await task;
    render();
  };

  const refresh = async () => {
    const available = await load();
    let activeName = String(getActiveName?.() || "").trim();
    if (!activeName) {
      activeName = await loadDefaultName();
      setActiveName?.(activeName);
      updateLocation?.(activeName, { replace: true, tabId: "" });
    }
    const active = findInstanceBySelector(available, activeName);
    if (!active) {
      throw new Error("Requested LightOS instance is unavailable.");
    }
    if (!isRunningInstance(active)) {
      const fallbackName = firstRunningInstanceSelector(available);
      if (!fallbackName) {
        throw new Error("No running LightOS instance found");
      }
      setActiveName?.(fallbackName);
      updateLocation?.(fallbackName, { replace: true, tabId: "" });
    }
    render();
    return cloneInstances(instances);
  };

  const navigateHome = async () => {
    if (disposed) {
      return false;
    }
    prepareHomeNavigation?.();
    closeSwitcher();
    view.setHomeBusy?.(true);
    try {
      const homeURL = await instancesNavigation.loadHomeURL();
      if (disposed) {
        return false;
      }
      const targetURL = withMobileRemoteDesktopPreference(
        homeURL,
        getMobileRemoteDesktopEnabled?.() === true,
        windowObject?.location?.href,
      );
      commitHomeNavigation?.();
      windowObject?.location?.assign?.(targetURL);
      return true;
    } catch (error) {
      if (disposed || error?.name === "AbortError") {
        return false;
      }
      rollbackHomeNavigation?.();
      view.setHomeBusy?.(false);
      showToast?.(error?.message || "无法返回首页");
      return false;
    }
  };

  const handlePopState = () => {
    if (disposed || consumePopState?.() === true) {
      return;
    }
    const nextParams = new URLSearchParams(windowObject?.location?.search || "");
    const nextName = readInstanceTargetName(nextParams);
    const nextTab = String(nextParams.get("tab") || "").trim();
    if (!nextName) {
      return;
    }
    if (nextName === String(getActiveName?.() || "").trim()) {
      onSameTargetNavigation?.(nextTab);
      return;
    }
    switchTo(nextName, { updateURL: false }).catch((error) => {
      showToast?.(error?.message || String(error));
    });
  };

  const lifecycle = lifecycleFactory({
    documentObject,
    windowObject,
    elements: view.elements,
    handlers: {
      onViewportChange: () => view.scheduleSwitcherPosition?.(),
      onDocumentKeyDown: (event) => {
        if (event.key === "Escape") {
          closeSwitcher();
        }
      },
      onDocumentPointerDown: (event) => {
        if (view.isSwitcherOpen?.() && !view.containsTarget?.(event.target)) {
          closeSwitcher();
        }
      },
      onNavigateHome: () => {
        navigateHome().catch((error) => showToast?.(error?.message || "无法返回首页"));
      },
      onPopState: handlePopState,
      onSelectInstance: (event) => {
        const nextName = view.selectedNameFromEvent?.(event);
        if (!nextName) {
          return;
        }
        switchTo(nextName).catch((error) => showToast?.(error?.message || String(error)));
      },
      onToggleSwitcher: () => {
        if (isEmbedMode) {
          return;
        }
        if (view.isSwitcherOpen?.()) {
          closeSwitcher();
        } else {
          openSwitcher().catch(() => {});
        }
      },
    },
  });

  return {
    closeSwitcher,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      loadGeneration += 1;
      loadInflight = null;
      switcherGeneration += 1;
      instancesLoader.dispose?.();
      instancesNavigation.dispose?.();
      lifecycle.dispose?.();
      view.dispose?.();
      instances = [];
    },
    getActiveDisplayName() {
      return instanceDisplayName(findInstanceBySelector(instances, getActiveName?.()));
    },
    getActiveInstance() {
      const active = findInstanceBySelector(instances, getActiveName?.());
      return active ? { ...active } : null;
    },
    handleActiveTargetChange: render,
    isSwitcherOpen: () => view.isSwitcherOpen?.() === true,
    load,
    loadDefaultName,
    navigateHome,
    openSwitcher,
    refresh,
    snapshot() {
      return {
        activeName: String(getActiveName?.() || "").trim(),
        disposed,
        instances: cloneInstances(instances),
        navigation: instancesNavigation.snapshot?.() || null,
        started,
        switcherOpen: view.isSwitcherOpen?.() === true,
      };
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      render();
      lifecycle.start?.();
    },
    switchTo,
  };
}
