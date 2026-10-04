# 物理机实例适配

客户端与容器复用同一套 terminal/ 会话、单 WebSocket Unified 调度、主题、流控及 checkpoint/replay。这里不再维护另一套终端引擎或直连调度器。

- index.js：唯一入口。
- capabilities.js：要求客户端返回 workspace_generation 和 unified_terminal 能力；旧客户端给出明确升级提示，不回退到旧缓存协议。
- retirement.js：只请求删除旧 IndexedDB 历史数据库，不调用 open，不创建定时读写/心跳任务；存储不可用不能阻止终端启动。

global-runtime.js 只组装公共控制器并调用上述适配。服务端目标转发属于 provider/client_terminal.go；本地服务属于 localserver/。

回归：客户端和容器均为一个工作区一条 WebSocket；多标签/分屏、刷新、断线、主题、快照和原始历史回退一致。关闭旧页面后检查终端历史旧库可删除，新页面不重建该库。公共总览功能的 `lcmd-webshell-overview-previews-v1` 缩略图库保留，不参与终端回放。构建通过不能代替真实客户端验收。
