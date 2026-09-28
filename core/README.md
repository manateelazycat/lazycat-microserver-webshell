# 共用终端核心

本包拥有终端业务状态，不依赖 LightOS 设备发现、容器命令、PC UI 或平台实现。对外提供容器 agent、进程内 Local 工作区与同一套 Unified broker；本地 HTTP 门禁位于 localserver/。

## 入口与文件

- `runtime.go`：`NewRuntime`、`Platform`、`TargetAccess`、`QueueBackend`。启动入口注入依赖，每个 Runtime/工作区持有自己的适配器，不使用可变的全局平台注册表。
- `local*.go`：账号绑定的进程内入口、取消中的 PTY 启动清理、环境与目录元数据；有界管道替代本地 attach 子进程，不另写会话或回放算法。
- `shell_sessions.go` / `shell_options.go`：独立于浏览器工作区的交互 shell 集合，复用 Platform 的环境、PTY、尺寸及所属进程回收；SSH 的保留/附着策略由适配层持有。可选 `SSHPlatform` 提供命令、终端模式、信号和退出信号，不扩大容器 Platform 的必需接口。
- `command_session.go`：无 PTY 命令与独立 stdin/stdout/stderr 管道；进程等待与输出读取分离，关闭只作用于该命令所属资源。
- `agent.go`、`agent_cli.go`、`agent_protocol.go`、`agent_workspace.go`、`agent_attach.go`：原 `agent version/daemon/request/attach/reconcile` 入口、请求身份检查和帧协议。
- `types.go`、`workspace*.go`、`layout.go`：工作区、标签、分屏、活动状态、布局和显式重建。对外状态继续使用原 JSON 字段。
- `pane.go`、`pane_control.go`、`pane_resize.go`、`pane_replay.go`、`subscriber.go`：PTY 会话生命周期、输入、尺寸所有权、恢复与订阅队列。
- `history.go`、`queries.go`、`query_echo.go`、`private_control.go`：有界历史、主题/终端查询应答、生成输入回显过滤和私有元数据。
- `terminal_checkpoint*.go`：固定 WASM 的状态快照、gzip、诊断和原始历史 fallback；`terminal_checkpoint_allocation.go` 读取固定容量的原生分配记录。
- `checkpoint_log.go`：`LogCheckpointDiagnostic` 将收到的首次故障转记到当前进程日志，最多保留 512 个去重标识；不修改传输或恢复状态。
- `terminal_queue*.go`、`queue_protocol.go`、`queue_stream.go`：逻辑订阅、身份/游标校验、公平调度、窗口 ACK 和缓冲上限。
- `scope.go`、`transport_errors.go`、`process.go`：作用域标识和平台无关辅助逻辑。

## 依赖与接口边界

`Platform` 提供 PTY、等待、尺寸、进程结束、活动扫描和 agent IPC；`TargetAccess` 提供容器等目标的发现与命令接入；`QueueBackend.Open` 提供可关闭的 attach 字节流及诊断日志。容器后端仍运行原 lightosctl attach 命令，本地后端使用有界进程内管道；调度、ACK 和重放由同一核心维护。

Core 可以使用标准库及通用协议/解析库，并依赖 `internal/pkg/fonts` 的设置定义和 `runtime` 的嵌入资产。不得导入 `unix`、`windows` 或 `provider`，不得写入 `lightosctl`、`/proc`、Unix syscall 或具体 Shell 启动逻辑。

## 关键约束

- agent 的 selector/account 绑定校验保持不变；外部身份认证由 Provider 负责，不能将目标适配接口误当作授权。
- 工作区、pane 和快照状态保持独立；字段只在原有锁保护下修改，关闭与迟到输出不能交叉访问已释放解析器。
- `snapshot + live` 的游标边界、ACK、resize epoch、回放顺序和队列上限保持不变。
- 解析失败仅让该 pane 使用有界原始历史，不重启 PTY、不自动重建解析器。
- `AgentProtocolVersion` 位于 `agent.go`。v31 新增独立 shell 生命周期接口，v32 挂载可选 managed SSH 路由，v33 支持任意非空 SSH 密码与 120 秒交互认证，v34 增加可选按需整机指标，v35 统一物理机实例中文文案，v36 扩展客户端 SSH 命令、文件、转发、终端参数与续接，v37 将准入暂停与 SSH 任务生命周期分离；保持 v36/v35/v34/v33/v32/v31/v30/v29/v28/v27 的帧格式/内存快照 ABI，容器兼容列表由 Provider 维护。关闭 Local 后不得重新创建工作区；账号改变由上层创建新的生命周期。此版本号不表示已开放微服 SSH 端口。v38 修正原生分配边界并增加固定诊断 ABI。v39 保证复用的 WASM 页面单元格在创建时清零，WASM 指纹改变；v38 及之前版本仍显式兼容传输，但不能与 v39 互相导入旧内存快照。v40 增加物理机本机服务发布隧道，不改变 v39 的终端帧与 WASM 快照格式。

## 验证

`host_metrics.go` 仅定义客户端整机指标的可空数据类型及注入接口，不读系统资源、不创建采样任务。实际采样位于独立 `hostmetrics` module，Linux 磁盘选择由 Unix adapter 注入，容器入口不装配它。

在仓库根目录执行 `go build ./core`、`go build ./...`、`go vet ./...`。可交叉编译 Core 以检查平台依赖泄漏，但这不是整机平台支持验收。

运行验证使用真实 agent/PTY 和已有 REQ/AC，重点覆盖输入输出、主题查询、布局、尺寸、快照及 fallback。发布环境及浏览器手测方法见根 README 和 `spec-tests/ENVIRONMENT.md`。

原生分配诊断最多 8 条（首条和最新 7 条），只含申请大小、页面容量、偏移合法性及重试次数，不包含 URI 或终端正文。诊断 ABI 为 4 个头部 u32 加 8×32 个记录 u32；字段顺序见 `terminal_checkpoint_allocation.go`。operation：1=write、2=resize；stage：1=URI、2=ID、3=复制扩容；caller：1=重排、2=行复制；reason：1=缺少连续空间、2=元数据无效、3=扩容尝试。记录可能包含最终失败前已处理的分配不足；不可把记录数量当作解析器崩溃次数。只在实际进入原生调用且该调用链失败时读取。首次错误仍由 pane 保存并在重新接入时报告。

Unified 队列接收关键 checkpoint 诊断时转记当前应用日志；原生 daemon 仍写自己的独立日志。去重标识包含作用域、pane、创建时间、首次故障时间及 WASM 指纹。输入日志载荷上限 128 KiB，输出上限 64 KiB，超限明确标注省略。

WASM 页面初始化由 `tools/ghostty-page-initialization.patch` 在 `Page.initBuf` 统一处理，只清零新页面的单元格区；链接、字形和样式表沿用各自初始化。不得依赖 WASM 的 page allocator 返回全零内存。该约束覆盖初始化、重排、扩容和页面复制；不清空运行中的终端、既有历史或待恢复的完整内存快照。
