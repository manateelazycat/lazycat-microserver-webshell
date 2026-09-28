export function createServiceForwardingView({
  documentObject = globalThis.document,
  EventCtor = globalThis.Event,
} = {}) {
  const byID = (id) => documentObject?.getElementById?.(id) || null;
  const elements = {
    addButton: byID("serviceForwardAddButton"),
    cancelButton: byID("serviceForwardCancelButton"),
    deleteButton: byID("serviceForwardDeleteButton"),
    editor: byID("serviceForwardEditor"),
    editorScrim: byID("serviceForwardEditorScrim"),
    form: byID("serviceForwardForm"),
    formTitle: byID("serviceForwardFormTitle"),
    hostInput: byID("serviceForwardHostInput"),
    iconInput: byID("serviceForwardIconInput"),
    list: byID("serviceForwardList"),
    pathInput: byID("serviceForwardPathInput"),
    portInput: byID("serviceForwardPortInput"),
    portStepDown: byID("serviceForwardPortStepDown"),
    portStepUp: byID("serviceForwardPortStepUp"),
    protocolInput: byID("serviceForwardProtocolInput"),
    skipAuthInput: byID("serviceForwardSkipAuthInput"),
    status: byID("serviceForwardStatus"),
    subdomainInput: byID("serviceForwardSubdomainInput"),
    submitButton: byID("serviceForwardSubmitButton"),
    titleInput: byID("serviceForwardTitleInput"),
  };

  const setValue = (element, value) => {
    if (element) {
      element.value = String(value ?? "");
    }
  };

  const staticControls = () => [
    elements.addButton,
    elements.protocolInput,
    elements.hostInput,
    elements.portInput,
    elements.portStepUp,
    elements.portStepDown,
    elements.pathInput,
    elements.titleInput,
    elements.subdomainInput,
    elements.iconInput,
    elements.skipAuthInput,
    elements.deleteButton,
    elements.cancelButton,
    elements.submitButton,
  ];

  return {
    elements,
    focusPort() {
      elements.portInput?.focus?.();
    },
    isAvailable() {
      return Boolean(elements.list);
    },
    isEditorOpen() {
      return Boolean(elements.editor && !elements.editor.hidden);
    },
    openEditor({ editing = false, upstream = {}, title = "", subdomain = "", skipAuth = false, physicalTarget = false } = {}) {
      if (elements.editor) {
        elements.editor.hidden = false;
      }
      if (elements.form) {
        elements.form.hidden = false;
      }
      if (elements.formTitle) {
        elements.formTitle.textContent = editing ? "编辑服务" : "添加服务";
      }
      setValue(elements.protocolInput, upstream.protocol === "https" ? "https" : "http");
      setValue(elements.hostInput, upstream.host || "127.0.0.1");
      if (elements.hostInput) {
        elements.hostInput.title = physicalTarget ? "目标地址由物理机访问，可填写主机名、局域网或公网 IP" : "";
        elements.hostInput.placeholder = physicalTarget ? "127.0.0.1 / 192.168.1.10 / example.com" : "127.0.0.1";
      }
      setValue(elements.portInput, upstream.port > 0 ? upstream.port : "");
      setValue(elements.pathInput, upstream.path || "");
      setValue(elements.titleInput, title);
      setValue(elements.subdomainInput, subdomain);
      setValue(elements.iconInput, "");
      if (elements.skipAuthInput) {
        elements.skipAuthInput.checked = skipAuth === true;
      }
      if (elements.deleteButton) {
        elements.deleteButton.hidden = !editing;
      }
    },
    readForm() {
      return {
        protocol: elements.protocolInput?.value,
        host: elements.hostInput?.value,
        port: elements.portInput?.value,
        path: elements.pathInput?.value,
        title: elements.titleInput?.value,
        subdomain: elements.subdomainInput?.value,
        iconFile: elements.iconInput?.files?.[0] || null,
        skipAuth: elements.skipAuthInput?.checked === true,
      };
    },
    renderList(entries, { busy = false, targetAvailable = false } = {}) {
      if (!elements.list || !documentObject) {
        return;
      }
      elements.list.textContent = "";
      if (!targetAvailable) {
        const empty = documentObject.createElement("div");
        empty.className = "settings-service-forward-empty";
        empty.textContent = "当前没有可用实例。";
        elements.list.appendChild(empty);
        return;
      }
      if (!entries?.length) {
        const empty = documentObject.createElement("div");
        empty.className = "settings-service-forward-empty";
        empty.textContent = "暂无服务转发。";
        elements.list.appendChild(empty);
        return;
      }
      for (const entry of entries) {
        const item = documentObject.createElement("div");
        item.className = "settings-service-forward-item";
        item.dataset.forwardId = entry.id;

        const main = documentObject.createElement("div");
        main.className = "settings-service-forward-main";

        const title = documentObject.createElement("div");
        title.className = "settings-service-forward-title";
        title.textContent = entry.title || entry.subdomain || entry.package_id || entry.upstream || "未命名服务";

        const meta = documentObject.createElement("div");
        meta.className = "settings-service-forward-meta";
        meta.textContent = entry.upstream || "未设置上游地址";

        const state = documentObject.createElement("div");
        state.className = "settings-service-forward-state";
        const stateParts = [];
        if (entry.installed_at && entry.subdomain) {
          stateParts.push(`已部署：${entry.subdomain}`);
        } else {
          stateParts.push("未安装应用入口");
        }
        if (entry.skip_auth) {
          stateParts.push("不使用账号保护");
        }
        state.textContent = stateParts.join(" · ");

        main.append(title, meta, state);

        const actions = documentObject.createElement("div");
        actions.className = "settings-service-forward-item-actions";

        const openButton = documentObject.createElement("button");
        openButton.type = "button";
        openButton.className = "settings-text-button";
        openButton.dataset.action = "open";
        openButton.textContent = "打开";
        openButton.disabled = busy || !entry.app_url;

        const editButton = documentObject.createElement("button");
        editButton.type = "button";
        editButton.className = "settings-text-button";
        editButton.dataset.action = "edit";
        editButton.textContent = "编辑";
        editButton.disabled = busy;

        const deleteButton = documentObject.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "settings-text-button danger";
        deleteButton.dataset.action = "delete";
        deleteButton.textContent = "删除";
        deleteButton.disabled = busy;

        actions.append(openButton, editButton, deleteButton);
        item.append(main, actions);
        elements.list.appendChild(item);
      }
    },
    resetEditor() {
      if (elements.editor) {
        elements.editor.hidden = true;
      }
      if (elements.form) {
        elements.form.hidden = true;
      }
      if (elements.formTitle) {
        elements.formTitle.textContent = "添加服务";
      }
      setValue(elements.protocolInput, "http");
      setValue(elements.hostInput, "127.0.0.1");
      setValue(elements.portInput, "");
      setValue(elements.pathInput, "");
      setValue(elements.titleInput, "");
      setValue(elements.subdomainInput, "");
      setValue(elements.iconInput, "");
      if (elements.skipAuthInput) {
        elements.skipAuthInput.checked = false;
      }
      if (elements.deleteButton) {
        elements.deleteButton.hidden = true;
      }
    },
    resolveListAction(event) {
      const button = event?.target?.closest?.("button[data-action]") || null;
      if (!button || button.disabled) {
        return null;
      }
      const item = button.closest?.(".settings-service-forward-item") || null;
      return {
        action: String(button.dataset?.action || ""),
        id: String(item?.dataset?.forwardId || "").trim(),
      };
    },
    setBusy(busy) {
      for (const control of staticControls()) {
        if (control) {
          control.disabled = busy === true;
        }
      }
    },
    setStatus(message, tone = "info") {
      if (!elements.status) {
        return;
      }
      const text = String(message || "").trim();
      elements.status.hidden = !text;
      elements.status.textContent = text;
      elements.status.dataset.tone = tone;
    },
    setSubdomain(value) {
      setValue(elements.subdomainInput, value);
    },
    stepPort(delta) {
      if (!elements.portInput) {
        return;
      }
      const current = Number(elements.portInput.value || 0);
      const fallback = elements.protocolInput?.value === "https" ? 443 : 80;
      const base = Number.isFinite(current) && current > 0 ? current : fallback;
      const next = Math.max(1, Math.min(65535, Math.round(base) + Number(delta || 0)));
      elements.portInput.value = String(next);
      if (typeof EventCtor === "function") {
        elements.portInput.dispatchEvent?.(new EventCtor("input", { bubbles: true }));
      }
    },
    subdomainValue() {
      return String(elements.subdomainInput?.value || "");
    },
    titleValue() {
      return String(elements.titleInput?.value || "");
    },
  };
}
