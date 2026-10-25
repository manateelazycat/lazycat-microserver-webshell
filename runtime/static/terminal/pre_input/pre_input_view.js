const icons = {
  add: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  album: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6"/>',
};

export function createPreInputView({ documentObject, host, translate = (text) => text }) {
  const node = (tag, className) => {
    const element = documentObject.createElement(tag);
    element.className = className;
    return element;
  };
  const icon = (name) => {
    const element = node("span", "pre-input-icon");
    element.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
    return element;
  };
  const button = (name, label, className = "") => {
    const element = node("button", `pre-input-button ${className}`);
    element.type = "button";
    element.setAttribute("aria-label", translate(label));
    element.title = translate(label);
    element.append(icon(name));
    return element;
  };
  const root = node("section", "pre-input");
  root.hidden = true;
  root.setAttribute("aria-label", translate("终端预输入"));
  const surface = node("div", "pre-input-surface");
  const tray = node("div", "pre-input-tray");
  tray.hidden = true;
  tray.setAttribute("aria-label", translate("待发送附件"));
  const row = node("div", "pre-input-row");
  const tools = button("add", "添加附件", "pre-input-tools");
  tools.setAttribute("aria-expanded", "false");
  tools.setAttribute("aria-controls", "preInputToolbar");
  const text = node("textarea", "pre-input-text");
  text.rows = 1;
  text.placeholder = translate("输入文字，发送到终端");
  text.setAttribute("aria-label", translate("终端预输入"));
  text.setAttribute("autocapitalize", "off");
  text.setAttribute("autocorrect", "off");
  text.spellcheck = false;
  const send = button("send", "发送到终端", "pre-input-send");
  send.hidden = true;
  row.append(tools, text, send);
  surface.append(tray, row);
  const toolbar = node("div", "pre-input-toolbar");
  toolbar.id = "preInputToolbar";
  toolbar.hidden = true;
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", translate("添加附件"));
  const album = button("album", "相册", "pre-input-action");
  const file = button("file", "文件", "pre-input-action");
  for (const [element, label] of [[album, "相册"], [file, "文件"]]) {
    const caption = node("span", "pre-input-action-label");
    caption.textContent = translate(label);
    element.append(caption);
  }
  toolbar.append(album, file);
  const status = node("div", "pre-input-status");
  // Messages are already localized before combining them with user filenames.
  status.setAttribute("translate", "no");
  status.hidden = true;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const picker = (accept = "") => {
    const element = node("input", "pre-input-picker");
    element.type = "file";
    element.multiple = true;
    element.hidden = true;
    if (accept) element.accept = accept;
    return element;
  };
  const albumInput = picker("image/*");
  const fileInput = picker();
  root.append(surface, status, toolbar, albumInput, fileInput);
  host.append(root);
  let renderedEntries = [];
  let renderedBusy = false;
  let renderedText = "";

  const resizeText = () => {
    if (root.hidden) return;
    text.style.height = "0px";
    text.style.height = `${Math.min(128, Math.max(24, text.scrollHeight))}px`;
  };

  return {
    root, text, tools, send, toolbar, album, file, albumInput, fileInput,
    resizeText,
    render({ visible, draft, busy, toolbarOpen, available }) {
      const becameVisible = root.hidden && visible;
      root.hidden = !visible;
      host.classList.toggle("has-pre-input", visible);
      documentObject.body.classList.toggle("mobile-pre-input-visible", visible);
      if (!visible && root.contains(documentObject.activeElement)) documentObject.activeElement.blur();
      if (text.value !== draft.text) text.value = draft.text;
      text.readOnly = busy;
      text.disabled = !available;
      root.setAttribute("aria-busy", String(busy));
      tools.disabled = busy || !available;
      album.disabled = busy || !available;
      file.disabled = busy || !available;
      send.hidden = !draft.text.length && !draft.entries.length;
      send.disabled = busy || !available;
      tools.setAttribute("aria-expanded", String(toolbarOpen));
      toolbar.hidden = !toolbarOpen || !visible;
      status.textContent = draft.status;
      status.dataset.tone = draft.error ? "error" : "progress";
      status.hidden = !draft.status;
      tray.hidden = !draft.entries.length;
      if (renderedBusy !== busy || renderedEntries.length !== draft.entries.length
        || renderedEntries.some((entry, index) => entry !== draft.entries[index])) {
        tray.replaceChildren();
        for (const entry of draft.entries) {
          const card = node("div", "pre-input-attachment");
          card.setAttribute("translate", "no");
          card.title = entry.file.name;
          if (entry.preview) {
            const image = node("img", "pre-input-thumbnail");
            image.src = entry.preview;
            image.alt = entry.file.name;
            card.append(image);
          } else {
            card.append(icon("file"));
          }
          const name = node("span", "pre-input-filename");
          name.textContent = entry.file.name;
          const remove = node("button", "pre-input-remove");
          remove.type = "button";
          remove.append(icon("close"));
          remove.dataset.removeAttachment = entry.id;
          remove.disabled = busy;
          remove.setAttribute("aria-label", `${translate("移除附件")} ${entry.file.name}`);
          card.append(name, remove);
          tray.append(card);
        }
        renderedEntries = [...draft.entries];
        renderedBusy = busy;
      }
      if (becameVisible || renderedText !== draft.text) resizeText();
      renderedText = draft.text;
    },
    dispose() {
      root.remove();
      host.classList.remove("has-pre-input");
      documentObject.body.classList.remove("mobile-pre-input-visible");
    },
  };
}
