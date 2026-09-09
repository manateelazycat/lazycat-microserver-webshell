export function createAgentProtocolUpdateView({ notice = null } = {}) {
  const translate = (key) => typeof globalThis.$t === "function" ? globalThis.$t(key) : key;
  let clickHandler = null;

  const handleClick = () => clickHandler?.();

  return Object.freeze({
    dispose() {
      notice?.removeEventListener?.("click", handleClick);
      clickHandler = null;
    },
    install(onClick) {
      clickHandler = typeof onClick === "function" ? onClick : null;
      notice?.addEventListener?.("click", handleClick);
    },
    render({ visible = false, updating = false } = {}) {
      if (!notice) {
        return;
      }
      notice.hidden = !visible;
      notice.disabled = updating;
      notice.setAttribute("aria-busy", updating ? "true" : "false");
      notice.textContent = updating
        ? translate("正在更新终端服务协议...")
        : translate("检测到终端服务协议待更新，点击查看详情");
    },
  });
}
