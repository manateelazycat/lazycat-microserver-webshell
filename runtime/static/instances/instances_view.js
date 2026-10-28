import {
  instanceDisplayName,
  instanceSelector,
  isRunningInstance,
} from "./instances_model.js";
import { createInstancesMenuPositioner } from "./instances_menu_position.js";

export function createInstancesView({ documentObject = globalThis.document, windowObject = globalThis.window } = {}) {
  const byID = (id) => documentObject?.getElementById?.(id) || null;
  const elements = {
    root: byID("instanceSwitcher"),
    button: byID("instanceSwitcherButton"),
    panel: byID("instanceSwitcherPanel"),
    list: byID("instanceSwitcherList"),
    feedback: byID("instanceSwitcherFeedback"),
    homeButton: byID("homeMenuButton"),
  };
  const menuPosition = createInstancesMenuPositioner({ documentObject, windowObject, elements });

  return {
    elements,
    closeSwitcher() {
      elements.root?.classList?.remove?.("is-open");
      if (elements.panel) {
        elements.panel.hidden = true;
      }
      menuPosition.close();
      elements.button?.setAttribute?.("aria-expanded", "false");
    },
    containsTarget(target) {
      return Boolean(target && (elements.root?.contains?.(target) || elements.panel?.contains?.(target)));
    },
    dispose() {
      this.closeSwitcher();
      this.setFeedback("");
      this.setHomeBusy(false);
      if (elements.list) {
        elements.list.textContent = "";
      }
    },
    isAvailable() {
      return Boolean(elements.root && elements.panel && elements.button && elements.list);
    },
    isSwitcherOpen() {
      return Boolean(elements.panel && !elements.panel.hidden);
    },
    openSwitcher() {
      elements.root?.classList?.add?.("is-open");
      if (elements.panel) {
        elements.panel.hidden = false;
      }
      menuPosition.open();
      elements.button?.setAttribute?.("aria-expanded", "true");
    },
    scheduleSwitcherPosition: menuPosition.schedule,
    renderList({ instances = [], activeName = "" } = {}) {
      if (!elements.list || !documentObject?.createElement) {
        return;
      }
      elements.list.textContent = "";
      for (const item of instances) {
        const selector = instanceSelector(item);
        if (!selector) {
          continue;
        }
        const option = documentObject.createElement("button");
        option.type = "button";
        option.className = "instance-switcher-item";
        option.dataset.name = selector;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", selector === activeName ? "true" : "false");
        if (!isRunningInstance(item)) {
          option.disabled = true;
        }

        const statusDot = documentObject.createElement("span");
        statusDot.className = "instance-switcher-item-status-dot";
        statusDot.dataset.status = item.status || "unknown";

        const body = documentObject.createElement("span");
        body.className = "instance-switcher-item-body";
        const name = documentObject.createElement("span");
        name.className = "instance-switcher-item-name";
        name.textContent = instanceDisplayName(item);
        const meta = documentObject.createElement("span");
        meta.className = "instance-switcher-item-meta";
        meta.textContent = item.status || "unknown";
        body.append(name, meta);
        option.append(statusDot, body);
        elements.list.appendChild(option);
      }
    },
    selectedNameFromEvent(event) {
      const item = event?.target?.closest?.(".instance-switcher-item");
      if (!item || item.disabled) {
        return "";
      }
      return String(item.dataset?.name || "").trim();
    },
    setFeedback(message) {
      if (!elements.feedback) {
        return;
      }
      const text = String(message || "").trim();
      elements.feedback.textContent = text;
      elements.feedback.hidden = !text;
    },
    setHomeBusy(busy) {
      if (elements.homeButton) {
        elements.homeButton.disabled = busy === true;
      }
    },
  };
}
