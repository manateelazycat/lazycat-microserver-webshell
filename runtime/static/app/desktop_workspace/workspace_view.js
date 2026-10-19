import { desktopSessionActivity } from "./session_presentation.js";

export const desktopIcon = (documentObject, name) => {
  const paths = {
    sidebar: "M9 4v16M4 4h16v16H4z",
    chevron: "m9 5 7 7-7 7",
    add: "M12 5v14M5 12h14",
    terminal: "m5 7 4 5-4 5M12 17h7",
    close: "m7 7 10 10M17 7 7 17",
    check: "m5 12 4 4 10-10",
  };
  const svg = documentObject.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = documentObject.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  return svg;
};

const sessionStatusIcon = (documentObject, status) => {
  if (status === "unread") return desktopIcon(documentObject, "check");
  const svg = documentObject.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("aria-hidden", "true");
  if (status === "error") {
    const dot = documentObject.createElementNS(svg.namespaceURI, "circle");
    dot.setAttribute("cx", "6"); dot.setAttribute("cy", "6"); dot.setAttribute("r", "3");
    svg.append(dot);
  } else if (status === "working") {
    svg.setAttribute("shape-rendering", "crispEdges");
    [[1, 1], [5, 1], [9, 1], [9, 5], [9, 9], [5, 9], [1, 9], [1, 5]].forEach(([x, y], index) => {
      const pixel = documentObject.createElementNS(svg.namespaceURI, "rect");
      pixel.setAttribute("x", String(x)); pixel.setAttribute("y", String(y));
      pixel.setAttribute("width", "2"); pixel.setAttribute("height", "2");
      pixel.style.animationDelay = `${index * -100}ms`;
      svg.append(pixel);
    });
  }
  return svg;
};

export function createDesktopWorkspaceView({ documentObject = document, windowObject = window } = {}) {
  const shell = documentObject.querySelector(".app-shell");
  const area = documentObject.getElementById("terminalArea");
  const sidebar = documentObject.createElement("aside");
  sidebar.className = "desktop-workspace-sidebar";
  sidebar.setAttribute("aria-label", "实例和终端会话");
  sidebar.id = "desktopWorkspaceSidebar";
  sidebar.hidden = true;
  const toolbar = documentObject.createElement("div");
  toolbar.className = "desktop-workspace-toolbar";
  const list = documentObject.createElement("nav");
  list.className = "desktop-workspace-list";
  list.setAttribute("aria-label", "实例和终端会话");
  const footer = documentObject.createElement("div");
  footer.className = "desktop-workspace-footer";
  const iconButton = (name, label, action) => {
    const button = documentObject.createElement("button");
    button.type = "button";
    button.className = "desktop-workspace-icon";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.dataset.desktopAction = action;
    button.append(desktopIcon(documentObject, name));
    return button;
  };
  const collapse = iconButton("sidebar", "收起侧栏", "collapse");
  collapse.setAttribute("aria-controls", sidebar.id);
  collapse.setAttribute("aria-expanded", "true");
  toolbar.append(collapse);
  sidebar.append(toolbar, list, footer);
  const expand = iconButton("sidebar", "展开侧栏", "expand");
  expand.classList.add("desktop-workspace-expand");
  expand.setAttribute("aria-controls", sidebar.id);
  expand.setAttribute("aria-expanded", "false");
  expand.hidden = true;
  shell.prepend(sidebar, expand);
  const relocations = ["tabOverviewToggle", "attachmentToggle", "instanceSwitcher", "terminalNetworkMonitor"]
    .map((id) => {
      const element = documentObject.getElementById(id);
      const anchor = documentObject.createComment(`desktop-workspace:${id}`);
      element.before(anchor);
      return { element, anchor };
    });
  const sections = new Map();
  const originalLabels = new Map();
  let active = false;
  let collapsed = false;
  let areaAnimation = null;
  let sectionSequence = 0;

  const syncLabels = () => {
    const replacements = {
      "rename-tab": "重命名会话", "close-tab": "关闭会话", "close-other-tabs": "关闭其他会话",
      "move-pane-new-tab": "移动窗格到新会话",
      "move-tab-first": "移到最上方", "move-tab-left": "上移会话",
      "move-tab-right": "下移会话", "move-tab-last": "移到最下方",
    };
    for (const [action, text] of Object.entries(replacements)) {
      const element = documentObject.querySelector(`#contextMenu [data-action="${action}"]`);
      if (!element) continue;
      if (!originalLabels.has(element)) originalLabels.set(element, element.textContent);
      element.textContent = active ? text : originalLabels.get(element);
    }
  };

  const setCollapsed = (value, { animate = true } = {}) => {
    // Capture the presented position so repeated clicks continue the transition.
    const before = area.getBoundingClientRect();
    areaAnimation?.cancel();
    if (!animate) sidebar.style.transition = "none";
    collapsed = value;
    documentObject.body.classList.toggle("desktop-workspace-collapsed", active && collapsed);
    sidebar.inert = collapsed;
    expand.hidden = !active || !collapsed;
    collapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (!animate) {
      sidebar.getBoundingClientRect();
      sidebar.style.removeProperty("transition");
    }
    if (active && animate && !windowObject.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const delta = before.left - area.getBoundingClientRect().left;
      if (delta && area.animate) areaAnimation = area.animate([
        { transform: `translateX(${delta}px)` }, { transform: "translateX(0)" },
      ], { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
    }
  };

  const createSection = (selector) => {
    const root = documentObject.createElement("section");
    root.className = "desktop-workspace-instance";
    root.dataset.selector = selector;
    const header = documentObject.createElement("div");
    header.className = "desktop-workspace-instance-header";
    const toggle = iconButton("chevron", "收起实例", "toggle");
    const add = iconButton("add", "新建终端会话", "create");
    const name = documentObject.createElement("button");
    name.type = "button";
    name.className = "desktop-workspace-instance-name";
    name.dataset.desktopAction = "instance";
    const status = documentObject.createElement("span");
    status.className = "instance-switcher-item-status-dot";
    name.append(status, documentObject.createElement("span"));
    const wrapper = documentObject.createElement("div");
    wrapper.className = "desktop-workspace-sessions-wrapper";
    const sessions = documentObject.createElement("div");
    sessions.className = "desktop-workspace-sessions";
    sessions.id = `desktopWorkspaceSessions-${++sectionSequence}`;
    toggle.setAttribute("aria-controls", sessions.id);
    const message = documentObject.createElement("button");
    message.type = "button";
    message.className = "desktop-workspace-message";
    message.dataset.desktopAction = "retry";
    sessions.append(message);
    wrapper.append(sessions);
    header.append(name, add, toggle);
    root.append(header, wrapper);
    list.append(root);
    const section = { root, toggle, add, name, status, wrapper, sessions, message, rows: new Map() };
    sections.set(selector, section);
    return section;
  };

  const createRow = (section, tab) => {
    const row = documentObject.createElement("div");
    row.className = "desktop-workspace-session";
    row.dataset.tabId = tab.id;
    const button = documentObject.createElement("button");
    button.type = "button";
    button.className = "desktop-workspace-session-select";
    button.dataset.desktopAction = "select";
    const status = documentObject.createElement("span");
    status.className = "desktop-workspace-session-state";
    status.setAttribute("role", "img");
    status.setAttribute("aria-hidden", "true");
    const label = documentObject.createElement("span");
    label.className = "desktop-workspace-session-label";
    button.append(status, desktopIcon(documentObject, "terminal"), label);
    const close = iconButton("close", "关闭会话", "close");
    const application = documentObject.createElement("span");
    application.className = "desktop-workspace-session-application";
    application.hidden = true;
    row.append(button, application, close);
    const entry = { row, button, label, close, application, status };
    section.rows.set(tab.id, entry);
    return entry;
  };

  return Object.freeze({
    sidebar, expand, list,
    getRenameAnchor(selector, tabId) {
      const entry = sections.get(selector)?.rows.get(tabId);
      return entry ? { button: entry.button, label: entry.label, viewport: list } : null;
    },
    revealSession(selector, tabId) {
      const section = sections.get(selector);
      if (!section) return;
      section.wrapper.style.transition = "none";
      section.root.classList.remove("is-collapsed");
      section.wrapper.inert = false;
      section.wrapper.getBoundingClientRect();
      section.wrapper.style.removeProperty("transition");
      section.rows.get(tabId)?.row.scrollIntoView({ block: "nearest" });
    },
    isCollapsed: () => collapsed,
    setCollapsed,
    setActive(value) {
      active = value;
      documentObject.body.classList.toggle("desktop-workspace-mode", active);
      sidebar.hidden = !active;
      for (const { element, anchor } of relocations) {
        if (active) {
          if (element.id === "terminalNetworkMonitor") footer.append(element);
          else toolbar.insertBefore(element, collapse);
        } else anchor.after(element);
      }
      documentObject.getElementById("instanceSwitcherList")?.previousElementSibling
        ?.classList.toggle("desktop-workspace-duplicate", active);
      syncLabels();
      setCollapsed(collapsed, { animate: false });
      const overviewAdd = documentObject.getElementById("tabOverviewNewTab");
      if (overviewAdd) {
        const label = active ? "新建终端会话" : "新建标签";
        overviewAdd.title = label;
        overviewAdd.setAttribute("aria-label", label);
      }
    },
    render(groups, activeTabId, closedGroups) {
      if (!active) return;
      const wanted = new Set(groups.map((group) => group.selector));
      for (const [selector, section] of sections) {
        if (!wanted.has(selector)) {
          section.root.remove();
          sections.delete(selector);
        }
      }
      groups.forEach((group, index) => {
        const section = sections.get(group.selector) || createSection(group.selector);
        if (list.children[index] !== section.root) list.insertBefore(section.root, list.children[index] || null);
        section.root.classList.toggle("is-active-instance", group.active);
        const isClosed = closedGroups.has(group.selector);
        section.root.classList.toggle("is-collapsed", isClosed);
        section.wrapper.inert = isClosed;
        section.toggle.setAttribute("aria-expanded", String(!isClosed));
        section.toggle.title = `${isClosed ? "展开" : "收起"} ${group.name}`;
        section.toggle.setAttribute("aria-label", section.toggle.title);
        section.name.lastChild.textContent = group.name;
        section.name.title = group.name;
        section.status.dataset.status = group.running ? "running" : "stopped";
        section.status.setAttribute("aria-label", group.running ? "运行中" : "已停止");
        section.name.setAttribute("aria-disabled", String(!group.running));
        section.add.disabled = !group.running;
        section.add.title = `在 ${group.name} 新建终端会话`;
        section.add.setAttribute("aria-label", section.add.title);
        if (isClosed) return;
        const ids = new Set(group.tabs.map((tab) => tab.id));
        for (const [id, entry] of section.rows) {
          if (!ids.has(id)) {
            entry.row.remove();
            section.rows.delete(id);
          }
        }
        group.tabs.forEach((tab, position) => {
          const entry = section.rows.get(tab.id) || createRow(section, tab);
          entry.row.dataset.reorderable = String(group.canReorder);
          const label = tab.label || tab.id;
          const activity = desktopSessionActivity(tab);
          if (entry.status.dataset.state !== activity.status) {
            entry.status.dataset.state = activity.status;
            entry.status.replaceChildren(...(activity.status === "idle" ? [] : [sessionStatusIcon(documentObject, activity.status)]));
          }
          entry.status.setAttribute("aria-hidden", String(activity.status === "idle"));
          entry.status.setAttribute("aria-label", activity.statusLabel);
          entry.application.hidden = !activity.application;
          entry.application.textContent = activity.application;
          entry.application.title = activity.application;
          entry.row.classList.toggle("has-notification", activity.notification);
          entry.row.classList.toggle("is-busy", activity.busy);
          if (entry.label.textContent !== label) entry.label.textContent = label;
          entry.button.title = activity.statusLabel ? `${label} · ${activity.statusLabel}` : label;
          entry.button.setAttribute("aria-label", entry.button.title);
          entry.button.disabled = !group.running;
          entry.close.disabled = !group.running;
          entry.close.setAttribute("aria-label", `关闭 ${label}`);
          const selected = group.active && tab.id === activeTabId;
          entry.row.classList.toggle("is-active", selected);
          if (selected) entry.button.setAttribute("aria-current", "page");
          else entry.button.removeAttribute("aria-current");
          if (section.sessions.children[position] !== entry.row) {
            section.sessions.insertBefore(entry.row, section.sessions.children[position] || null);
          }
        });
        section.message.hidden = group.tabs.length > 0 && !group.error;
        section.message.disabled = !group.error;
        section.message.textContent = group.message;
      });
    },
    dispose() {
      areaAnimation?.cancel();
      this.setActive(false);
      sidebar.remove();
      expand.remove();
      for (const { anchor } of relocations) anchor.remove();
      sections.clear();
    },
  });
}
