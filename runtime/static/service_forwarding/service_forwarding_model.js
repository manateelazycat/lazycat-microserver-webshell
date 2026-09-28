export const normalizePublishedEntry = (item) => ({
  id: String(item?.id || "").trim(),
  token: String(item?.token || "").trim(),
  instance_name: String(item?.instance_name || "").trim(),
  upstream: String(item?.upstream || "").trim(),
  package_id: String(item?.package_id || "").trim(),
  app_domain: String(item?.app_domain || "").trim(),
  app_url: String(item?.app_url || "").trim(),
  subdomain: String(item?.subdomain || "").trim(),
  title: String(item?.title || "").trim(),
  skip_auth: Boolean(item?.skip_auth),
  installed_at: String(item?.installed_at || "").trim(),
  created_at: String(item?.created_at || "").trim(),
  upstream_url: String(item?.upstream_url || "").trim(),
});

export const normalizeServiceForwardingTarget = (target) => {
  if (typeof target === "string") {
    return { selector: target.trim(), displayName: "" };
  }
  return {
    selector: String(target?.selector || "").trim(),
    displayName: String(target?.displayName || "").trim(),
  };
};

export const isClientServiceForwardingTarget = (selector) => String(selector || "").trim().startsWith("client:");

export const serviceForwardEntryMatchesTarget = (entry, targetSelector) => {
  const entryName = String(entry?.instance_name || "").trim();
  const selector = String(targetSelector || "").trim();
  if (!entryName || !selector) {
    return false;
  }
  if (entryName === selector) {
    return true;
  }
  const bareSelector = selector.split("@", 1)[0];
  return !entryName.includes("@") && entryName === bareSelector;
};

export const normalizePublishStatus = (value) => ({
  ready: value?.ready === true,
  port: Number(value?.port || 0),
  warning_code: String(value?.warning_code || "").trim(),
});

export const buildPublishServiceWarningMessage = (status) => {
  if (!status || status.ready) {
    return "";
  }
  if (status.warning_code === "port_in_use" && status.port > 0) {
    return `主机端口 ${status.port} 已被占用，服务转发暂时不可用。`;
  }
  return "";
};

export const parsePublishedEntryUpstream = (rawValue) => {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return { protocol: "http", host: "127.0.0.1", port: 0, path: "" };
  }
  try {
    const parsed = new URL(raw);
    const protocol = String(parsed.protocol || "http:").replace(/:$/, "").toLowerCase() || "http";
    const defaultPort = protocol === "https" ? 443 : 80;
    const path = parsed.search
      ? `${parsed.pathname || "/"}${parsed.search}`
      : parsed.pathname && parsed.pathname !== "/"
        ? parsed.pathname
        : "";
    return {
      protocol,
      host: String(parsed.hostname || "127.0.0.1").trim() || "127.0.0.1",
      port: Number(parsed.port || defaultPort),
      path,
    };
  } catch (error) {
    return { protocol: "http", host: "127.0.0.1", port: 0, path: "" };
  }
};

export const normalizeServiceForwardSubdomain = (value) => (
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
);

export const buildServiceForwardUpstreamURL = ({ protocol, host, port, path } = {}) => {
  const scheme = String(protocol || "").trim().toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    throw new Error("请选择有效协议。");
  }
  const upstreamHost = String(host || "").trim();
  if (!upstreamHost) {
    throw new Error("请输入上游主机。");
  }
  const upstreamPort = Number(port || 0);
  if (!Number.isInteger(upstreamPort) || upstreamPort <= 0 || upstreamPort > 65535) {
    throw new Error("请输入 1-65535 之间的端口。");
  }
  let hostPart = upstreamHost;
  if (hostPart.includes(":") && !hostPart.startsWith("[") && !hostPart.endsWith("]")) {
    hostPart = `[${hostPart}]`;
  }
  let suffix = String(path || "").trim();
  if (suffix.includes("#")) {
    throw new Error("路径或查询参数不能包含 #。");
  }
  if (suffix && !suffix.startsWith("/") && !suffix.startsWith("?")) {
    suffix = `/${suffix}`;
  } else if (suffix.startsWith("?")) {
    suffix = `/${suffix}`;
  }
  const upstream = `${scheme}://${hostPart}:${upstreamPort}${suffix}`;
  try {
    const parsed = new URL(upstream);
    if (parsed.protocol !== `${scheme}:` || !parsed.hostname) {
      throw new Error("invalid upstream");
    }
    return upstream;
  } catch (error) {
    throw new Error("上游地址不是有效的 HTTP/HTTPS URL。");
  }
};

export const buildServiceForwardPayload = ({ editingID = "", form = {} } = {}) => {
  const title = String(form.title || "").trim();
  if (!title) {
    throw new Error("请输入显示名称。");
  }
  const subdomain = String(form.subdomain || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain)) {
    throw new Error("子域名只能包含小写字母、数字和连字符，且必须以字母或数字开头。");
  }
  const iconFile = form.iconFile || null;
  if (iconFile && iconFile.type && iconFile.type !== "image/png") {
    throw new Error("图标必须是 PNG 图片。");
  }
  return {
    id: String(editingID || "").trim(),
    upstream: buildServiceForwardUpstreamURL({
      protocol: form.protocol,
      host: form.host,
      port: Number(form.port || 0),
      path: form.path,
    }),
    title,
    subdomain,
    iconFile,
    skip_auth: form.skipAuth === true,
  };
};
