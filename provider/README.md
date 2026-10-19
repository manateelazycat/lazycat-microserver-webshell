# LightOS WebShell 接入层

本包维护既有 Linux Provider：实例发现、鉴权、HTTP 路由、容器 agent 接入及外部资源。它不是供 PC 直接嵌入的终端核心。

## 入口与文件

- `server.go`：`Run(*core.Runtime)`、HTTP 监听与路由。根入口负责创建 Runtime。
- `instances.go`、`authorization.go`、`admin.go`、`publish.go`：实例列表、账号可见性、LightOS Admin 对接及服务发布。
- `assets.go`、`static_compression.go`：前端资源、缓存策略、内容版本和旧 Service Worker 兼容。
- `container_backend.go`、`container_activity.go`：实现 Core 的目标/队列后端接口，集中 `lightosctl` 命令与远程活动扫描。
- `agent_runtime.go`、`agent_protocol_update.go`：agent 安装、版本检查、复用、更新和原 attach 路径。
- `terminal_queue.go`：Unified WebSocket 的 HTTP 鉴权、升级、准备与控制分派；队列算法属于 Core。
- `workspace.go`、`workspace_recovery.go`：工作区 HTTP 接口与按账号/实例保存的可选重启恢复描述。
- `client_terminal.go`、`client_recovery.go`：PC 票据/Unified 转发与可选布局恢复，共用账号隔离的文档存储，不引用容器安装逻辑。
- `attachments.go`、`settings.go`、`devices.go`：原文件、设置和设备接口。
- `dependencies.go`：显式列出沿用原调用形式的 Core/Unix/日志接口别名，便于审查跨包依赖。

## 边界与约束

本包依赖 Core、Unix 适配和内部公共模块；不得引用 lightos-admin 的内部 Go 包或私有实现。Core 不反向导入本包。

保留原账号、selector 与票据验证次序；HTTP 路径、头、状态码和 WebSocket 消息不因文件迁移改变。容器的用户名选择与用户切换脚本保持原有规则。

v35 显式兼容 v34/v33/v32/v31/v30/v29/v28/v27 及原容器兼容版本，版本升级不自动终止兼容的容器 agent。客户端的可选按需指标接口不改变容器入口和 v30 的 Local `queue-ready` 握手。二进制名、`agent` 子命令及 LPK 内的 `runtime/` 布局保持不变；Provider 不编入独立 SSH module。

版本是否最新、是否可 attach、是否支持工作区恢复、是否可导入内存快照是不同判断：v27/v28/v29/v30/v31/v32/v33/v34 继续提供标签排序和工作区恢复，v26/v27/v28/v29/v30/v31/v32/v33/v34/v35 使用同一快照 WASM；更早的兼容 agent 沿用字节回放。以后升级不能只修改版本常量而漏掉这些能力边界。

## 验证

根目录执行 `go build .`、`go vet ./...`、`npm run build`。既有 `lzc-build.yml` 和 lightos-admin 的 `lightos-build.sh` 继续使用同一构建入口及内嵌校验。

实际功能回归按 `spec-tests/ENVIRONMENT.md` 绑定设备/账号，检查容器列表、授权、工作区、文件、统一连接和重连；未在真实环境执行的内容不能标记通过。

当前推荐 Agent 协议为 v48，显式保留 v47/v46/v45/v44/v43/v42/v41/v40/v39 及既有版本的 attach 兼容和工作区恢复能力。v39/v40/v41/v42/v43/v44/v45/v46/v47/v48 共用初始化复用页面单元格的 WASM；容器启动 attach 时仅与这些版本协商内存快照，旧 Agent 使用原始字节回放，不自动替换或停止旧进程。v38 及之前的旧快照不能导入这些版本。v40 的物理机服务发布隧道不改变容器终端协议；v41 只调整客户端运行时代码归属；v42 新增浏览器光标样式设置；v43 修正物理机 activity 采集；v44 增加只读工作区查询，v45 刷新只读查询中已有 pane 的进程身份，v46 增加物理机工作区读取兼容，v47 增加历史代次和输出游标，v48 增加应用生命周期及累计完成次数。物理机采用新版终端核心后提供对应的新增元数据；终端帧、快照和 WASM 保持兼容。兼容的旧 Agent 不自动替换或停止。

`program_status` 是可选对象，转发旧终端响应时必须保留字段缺失，不能补成零值对象，否则浏览器会误以为旧核心已经提供应用状态而关闭实时信号兼容。旧核心的当前连接由浏览器旁路观察实时生命周期控制序列；后台实例完整状态需要核心提供 v48 元数据。

`workspace_inspection.go` 提供 `GET /api/workspace?name=<selector>&inspect=1`，沿用容器/物理机的授权和账号隔离。容器使用支持检查的 Agent `inspect`，按实际版本补齐已有排序能力；物理机通过 `client_workspace_inspection.go` 优先读取 `/workspace/inspect`，仅当终端服务的这个路由确实返回 404/405 时兼容读取既有 `/workspace`。票据服务的 404/405、认证失败和其他请求错误不能被误判成客户端版本问题。

物理机兼容路径不调用重启恢复，不发送激活、尺寸、滚动历史修改或重建动作；旧核心保留原有首次读取默认工作区的初始化语义。这里只按 Provider、账号及 selector 缓存一分钟的路由选择，不缓存票据或会话内容；记录在兼容读取之前建立，避免慢请求每次重试都重复探测缺失路由。过期后重新检查专用接口，服务升级或重启后可以自行恢复。不得仅凭检查路由缺失要求更新 PC 客户端，也不自动替换正在工作的客户端进程。

`settings.go` 的 `GET /api/settings` 返回 `terminal_cursor_style`；既有字段级更新入口 `PUT /api/settings` 接受 `block`、`bar`、`underline`，未提供或传入 `null` 时不修改该字段，其他值返回 400。设置沿用字体目录内的原子存储，光标样式不下发 PTY、不触发重放。手工验证样式保存、刷新、修改其他设置后保留样式，以及无效值不会覆盖已有配置。

容器 Unified 转发复用 Core 的 `LogCheckpointDiagnostic`；原 attach 转发也在收到结构化故障时调用同一去重入口，因此首次解析故障进入应用汇总日志，不要求浏览器开启调试。不转发整个 Agent 日志文件，也不更改消息、ACK、尺寸边界或 PTY 生命周期。

v44 增加 `mobile_pre_input_enabled` 设置：GET 返回布尔值，PUT 支持字段级修改，缺失或 null 保持原值，旧配置默认关闭。它仅控制移动端预输入显示，不下发 PTY。显式保留 v43 及既有版本的 attach、工作区恢复和内存快照兼容；无须更新旧 Agent 即可使用此界面能力。
