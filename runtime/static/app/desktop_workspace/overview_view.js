import { desktopIcon } from "./workspace_view.js";

export function createDesktopOverviewView({ documentObject = document } = {}) {
  const sections = new Map();
  let entrance = null;
  return Object.freeze({
    animateEntrance() {
      entrance?.cancel();
      const root = documentObject.getElementById("tabOverview");
      const reducedMotion = documentObject.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches;
      entrance = root?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
        duration: reducedMotion ? 125 : 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    },
    render({ view, groups, activeTabId, paneSource }) {
      const grid = view.elements.grid;
      grid.classList.add("desktop-overview-groups");
      const wanted = new Set(groups.map((group) => group.selector));
      for (const [selector, section] of sections) {
        if (!wanted.has(selector)) {
          section.root.remove();
          sections.delete(selector);
        }
      }
      for (const child of [...grid.children]) {
        if (!child.dataset.desktopOverviewGroup) child.remove();
      }
      const previews = [];
      groups.forEach((group, index) => {
        let section = sections.get(group.selector);
        if (!section) {
          const root = documentObject.createElement("section");
          root.className = "desktop-overview-group";
          root.dataset.desktopOverviewGroup = group.selector;
          const header = documentObject.createElement("div");
          header.className = "desktop-overview-group-header";
          const title = documentObject.createElement("h2");
          const add = documentObject.createElement("button");
          add.type = "button";
          add.className = "desktop-workspace-icon";
          add.dataset.desktopOverviewCreate = group.selector;
          add.append(desktopIcon(documentObject, "add"));
          header.append(title, add);
          const cards = documentObject.createElement("div");
          cards.className = "desktop-overview-cards";
          const message = documentObject.createElement("p");
          message.className = "desktop-overview-message";
          root.append(header, cards, message);
          section = { root, title, add, cards, message, items: new Map() };
          sections.set(group.selector, section);
        }
        if (grid.children[index] !== section.root) grid.insertBefore(section.root, grid.children[index] || null);
        section.title.textContent = group.name;
        section.add.disabled = !group.running;
        section.add.title = `在 ${group.name} 新建终端会话`;
        section.add.setAttribute("aria-label", section.add.title);
        section.message.hidden = !group.message || (group.tabs.length > 0 && !group.error);
        section.message.textContent = group.message;
        const ids = new Set(group.tabs.map((tab) => tab.id));
        for (const [id, item] of section.items) {
          if (!ids.has(id)) {
            item.canvas.width = 0;
            item.canvas.height = 0;
            item.card.remove();
            section.items.delete(id);
          }
        }
        group.tabs.forEach((tab, position) => {
          let item = section.items.get(tab.id);
          if (!item) {
            const card = documentObject.createElement("div");
            card.className = "tab-overview-card";
            card.dataset.tabId = tab.id;
            card.dataset.instanceSelector = group.selector;
            const main = documentObject.createElement("button");
            main.type = "button";
            main.className = "tab-overview-card-main";
            main.dataset.tabId = tab.id;
            main.dataset.instanceSelector = group.selector;
            const preview = documentObject.createElement("div");
            preview.className = "tab-overview-preview";
            const canvas = documentObject.createElement("canvas");
            preview.append(canvas);
            const meta = documentObject.createElement("div");
            meta.className = "tab-overview-meta";
            const label = documentObject.createElement("span");
            label.className = "tab-overview-name";
            meta.append(label);
            const close = documentObject.createElement("button");
            close.type = "button";
            close.className = "tab-overview-card-close";
            close.dataset.tabOverviewClose = tab.id;
            close.dataset.instanceSelector = group.selector;
            close.textContent = "×";
            main.append(preview, meta);
            card.append(main, close);
            item = { card, main, canvas, label, close };
            section.items.set(tab.id, item);
          }
          const selected = group.active && tab.id === activeTabId;
          item.card.classList.toggle("active", selected);
          if (selected) item.card.setAttribute("aria-current", "true");
          else item.card.removeAttribute("aria-current");
          item.label.textContent = tab.label || tab.id;
          item.main.disabled = !group.running;
          item.close.disabled = !group.running;
          item.main.setAttribute("aria-label", `切换到 ${group.name} 的 ${item.label.textContent}`);
          item.close.setAttribute("aria-label", `关闭 ${item.label.textContent}`);
          if (section.cards.children[position] !== item.card) {
            section.cards.insertBefore(item.card, section.cards.children[position] || null);
          }
          previews.push({ canvas: item.canvas, tab });
        });
      });
      for (const { canvas, tab } of previews) view.drawPreview(canvas, tab, paneSource);
      if (!groups.length) {
        const empty = documentObject.createElement("p");
        empty.className = "desktop-overview-message";
        empty.textContent = "暂无可访问的实例";
        grid.append(empty);
      }
    },
    clear() {
      entrance?.cancel();
      sections.clear();
    },
  });
}
