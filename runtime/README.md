# WebShell 运行资产

- `static/`：浏览器前端及固定 Ghostty WASM，入口说明见 [前端模块](static/README.md)。
- `fonts/`：随包字体与许可证。
- `assets.go`：Go 资源包 `runtimeassets`，通过 `go:embed static/ghostty-vt.wasm` 为 Core 提供同一份 WASM 字节。

将 checkpoint 实现移入 Core 后，不复制 WASM、不更换 ABI。Go agent 与 Vite 发布仍取自同一个 `static/ghostty-vt.wasm`；沿用原资源同步和校验脚本。

当前构建跟随主线 Ghostty 1.4，浏览器与 Go 从同一份 `runtime/static/ghostty-vt.wasm` 构建。快照协议、资源摘要与版本协商规则见下文。

此包只提供资产，不持有会话状态、网络连接或平台适配。构建继续在仓库根目录运行 `go build .` 和 `npm run build`，LPK 发布布局不变。资源兼容性需用真实快照导入验证，不能只比较文件存在。

当前合并版本为 Agent v57：使用 Ghostty 1.4 的 `ghostty-snapshot-v1`（GHOSTSNP）快照，同时保留客户端运行时分发、通用 PTY、任务回收及主线 agent 身份识别。当前 WASM 为 617239 字节，SHA-256 `5eb1c3c84ae118b4b8b9737ba45b1226c5b6dbb3ee84e3eb359fa7a495959614`。v51/v52 曾在两个分支表示不同实现，容器 Provider 为 v56/v57 声明新快照能力并协商该格式；原生客户端按实际工作区能力协商。显式保留 v56–v9 的 attach 和 v56–v27 的工作区恢复，旧核心继续原始历史回放，不自动替换 Agent 或重启任务。旧内存快照不导入新内核。
