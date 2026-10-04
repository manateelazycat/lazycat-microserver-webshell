export function requireManagedClientWorkspace(state) {
  if (!String(state?.selector || "").startsWith("client:")) return;
  if (!String(state?.workspace_generation || "").trim()
    || !state?.agent_capabilities?.includes("unified_terminal")) {
    throw new Error("请更新 PC 客户端并重新启用 LightOS 接入，当前终端服务不支持统一连接。");
  }
}
