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
- `AgentProtocolVersion` 位于 `agent.go`。v31 新增独立 shell 生命周期接口，v32 挂载可选 managed SSH 路由，v33 支持任意非空 SSH 密码与 120 秒交互认证，v34 增加可选按需整机指标，v35 统一物理机实例中文文案，v36 扩展客户端 SSH 命令、文件、转发、终端参数与续接，v37 将准入暂停与 SSH 任务生命周期分离；保持 v36/v35/v34/v33/v32/v31/v30/v29/v28/v27 的帧格式/内存快照 ABI，容器兼容列表由 Provider 维护。关闭 Local 后不得重新创建工作区；账号改变由上层创建新的生命周期。此版本号不表示已开放微服 SSH 端口。v38 修正原生分配边界并增加固定诊断 ABI。v39 保证复用的 WASM 页面单元格在创建时清零，WASM 指纹改变；v38 及之前版本仍显式兼容传输，但不能与 v39 互相导入旧内存快照。v40 增加物理机本机服务发布隧道，不改变 v39 的终端帧与 WASM 快照格式。v41 将客户端运行时装配、父管道管理和构建工具归入独立 clientruntime 模块；保持 v40 的帧、发布及 SSH 协议，v39/v40/v41 共用 WASM 快照格式。

## 验证

v43 修正物理机 activity：Linux 本地 TTY 路径归一化、macOS 完整命令行、Windows 应用启动器身份选择。保留当前版本的终端帧、SSH、发布协议和 WASM，Provider 显式保留 v42 及既有版本的兼容能力；物理机需运行重建后的客户端终端核心才能应用采集修复。

v42 新增浏览器光标样式的设置持久化；终端帧、发布和 SSH 协议保持兼容，WASM 与 v39/v40/v41 相同。Provider 显式保留 v41 的 attach、工作区恢复和内存快照协商能力；Core 不负责浏览器光标绘制。

v44 新增 Agent `inspect` 与 `Local.Inspect()`，只返回已存在工作区的会话和分屏元数据；尚未初始化的工作区返回空列表，不创建 PTY、不修改滚动历史、不执行重启恢复。两者沿用 selector/account 和关闭状态校验。终端帧及 WASM 仍与 v43 相同，Provider 显式保留 v43 的已有能力。

v45 的只读检查通过注入的活动采集能力刷新已有 pane 的进程身份和工作目录，使后台实例中的 Codex 等进程也能被追踪；采集在 daemon 锁外进行，不创建工作区、PTY 或连接。`Local.Inspect()` 同时返回已有的会话排序能力。终端帧和 WASM 保持兼容，Provider 显式保留 v44 的已有能力。

v46 在 Provider 侧兼容已部署物理机的既有工作区读取接口，避免把可选检查路由缺失误报为必须更新 PC 客户端。Core 的会话、终端帧和 WASM 不变，Provider 显式保留 v45 的已有能力；这项兼容读取不要求替换正在工作的旧物理机终端核心。

v47 在 pane 元数据中提供 `history_generation` 和十进制字符串 `output_offset`。两者在已有 pane 锁内读取，直接复用历史代次与单调输出游标；裁剪历史不会使游标回退，也不读取或传输终端正文。浏览器可通过工作区查询追踪后台会话的新输出，无需建立额外终端连接。Provider 显式保留 v46 的已有能力，终端帧、回放和 WASM 保持兼容。

v48 的 `program_status.go` 在已有输出锁内旁路观察应用生命周期：OSC 7501、iTerm 状态、OSC 9;4 进度、OSC 133 命令边界，以及标题的明确工作/就绪/出错状态和进度字符。结构化生命周期优先于标题，不用输出停顿推测完成，不改变原有字节流。扫描器跳过其他控制字符串，OSC 暂存上限 4096 字节；不记录标题正文、通知正文或应用参数。每个 pane 返回可选 `program_status`（状态、修订、累计完成次数和最后完成的输出位置），代次由历史身份隔离，短任务在两次查询之间完成仍保留计数。完成位置供浏览器排除已经查看但元数据晚到的结果；退出清理保留尚未被后续状态替代的错误。采集确认前台进程已结束时撤销过时的工作/阻塞状态，忽略晚于采集开始的新状态。Provider 显式保留 v47 的已有能力，终端帧及 WASM 不变。

v53 增加 `agy` / `antigravity-cli` 可执行名到 `antigravity-cli` 身份的映射，直接前台与 DI 后台使用相同的进程证据链；不通过名字推断工作状态。Provider 显式保留 v52 的已有兼容能力，终端帧及 WASM 不变。

v52 增加可选 `pane.agent = {id,name,source}`，身份与 `program_status` 回合状态完全独立。Linux 通过前台进程的可执行名/已知运行时入口识别；DI 的 `d`/`di` 通过内核双向 Unix socket peer 与相同可执行映像或规范化路径关联后台 daemon，再读取当前子 PTY 的前台进程。无证据、断开或退出时省略身份，客户端继续显示普通 `command`。不读取环境、任务参数、DI 启动 JSON 或历史文字；保留命令字段但 Linux 不再提供完整参数。扫描总计 1.5 秒，socket诊断限制 250ms/2MiB，FD最多256项，子代最多16轮。网络帧及 WASM 不变，Provider 显式兼容 v51/v50；旧 Provider 需同步更新以透传新字段，兼容旧 daemon 不会被自动替换。

v51 停止用 OSC 133 A/B/C/D 语义区段推断 agent 工作或完成：Pi 等 TUI 空闲重绘以及 di 历史重放也会发送这些标记。明确的 OSC 7501、iTerm 状态、OSC 9;4 和标题状态继续按原优先级生效。CAN/SUB 取消不完整控制字符串，保证后续清理信号可被解析。帧、元数据和 WASM 不变，Provider 显式保留 v50 的已有能力；不自动停止已有终端服务或后台任务。

v49 增加 Provider 对管理端公开账号实例顺序接口的桥接，不增加 Core 消息或工作区字段。Provider 显式保留 v48 的 attach、标签排序、恢复及 v39 起的 WASM 快照兼容；排序不更新运行中的终端核心，不修改实例内标签顺序。

v50 在 `queries.go` 的 PTY 查询入口回答 OSC 7501 `7501;?` 能力探测，接受 BEL/ST 结束并用 ST 应答。应答通过现有受控生成输入路径完成，先于同一输出流中后续的 DA sentinel，不依赖浏览器连接，也不在历史回放时重新执行。这样遵循该协议的任意 CLI 能自动启用既有 `program_status` 上报；不设置工具专用环境变量，不解析任务正文。浏览器不再把前台进程驻留当作工作中，也不把 busy 结束推测成成功未读；无可靠任务状态时图标及提示留空，进程名和关闭保护不变。帧、元数据和 WASM 不变，Provider 显式保留 v49 的已有兼容能力；旧核心需要显式更新后才具备能力应答。

v51 把终端核心升级为 Ghostty 1.4 lib-vt，checkpoint 由整块线性内存镜像（`ghostty-memory-v1`）改为可移植的官方快照 `ghostty-snapshot-v1`（`GHOSTSNP`），WASM 随之变化。v51 Agent 只对 `ghostty-snapshot-v1` 请求输出 checkpoint；旧原生客户端仍请求 `ghostty-memory-v1` 时 Provider 只把该参数传给 v39–v50 Agent，v51 则回放原始历史。Local 及 v51 Agent 工作区通过 `agent_capabilities` 公布 `ghostty_snapshot_v1`，原生客户端据此决定是否请求快照；浏览器随服务端发布，始终请求快照。Provider 显式保留 v50 的 attach 与工作区恢复兼容。

客户端运行时分支的历史版本另有以下变更：

v44 将完整 WebShell 补丁构建与普通 Ghostty 构建的 Zig 缓存隔离，采用干净构建的 WASM 指纹。终端帧和 checkpoint 格式保持不变，但 v39–v43 的旧指纹不参与新浏览器的内存快照协商；这些 Agent 保留 attach、工作区恢复和原始字节回放。v43 的认证持续通道能力保持不变。Go 解析器与浏览器继续共用 `runtime/static/ghostty-vt.wasm`，不得跨不同指纹导入堆状态。

`host_metrics.go` 仅定义客户端整机指标的可空数据类型及注入接口，不读系统资源、不创建采样任务。实际采样位于独立 `hostmetrics` module，Linux 磁盘选择由 Unix adapter 注入，容器入口不装配它。

在仓库根目录执行 `go build ./core`、`go build ./...`、`go vet ./...`。可交叉编译 Core 以检查平台依赖泄漏，但这不是整机平台支持验收。

运行验证使用真实 agent/PTY 和已有 REQ/AC，重点覆盖输入输出、主题查询、布局、尺寸、快照及 fallback。发布环境及浏览器手测方法见根 README 和 `spec-tests/ENVIRONMENT.md`。

原生分配诊断 ABI（4 个头部 u32 加 8×32 个记录 u32，字段顺序见 `terminal_checkpoint_allocation.go`）在 Ghostty 1.4 上保留导出但恒为空：旧版为定位页面分配故障而打的引擎补丁已随上游重写移除，读取方必须把零记录视为“无原生证据”而非“无故障”。首次错误仍由 pane 保存并在重新接入时报告。

Unified 队列接收关键 checkpoint 诊断时转记当前应用日志；原生 daemon 仍写自己的独立日志。去重标识包含作用域、pane、创建时间、首次故障时间及 WASM 指纹。输入日志载荷上限 128 KiB，输出上限 64 KiB，超限明确标注省略。

Checkpoint 引擎与浏览器、原生客户端共用 `ghostty-web` 以 `-Dcpu=generic` 构建的 Ghostty 1.4 lib-vt WASM（补丁 `ghostty-web/patches/ghostty-1.4-webshell.patch` 加 `ghostty-web/wasm/webshell_abi.zig`）。页面清零由上游 `WasmPagePool` 及 `PageList` 对复用槽的 `@memset` 保证，不再维护本地页面初始化补丁。快照为官方 `GHOSTSNP`，经 `ghostty_terminal_snapshot_encode` 导出并 gzip 分片；协议名 `ghostty-snapshot-v1`。

主线 v44 增加 Provider 侧移动端预输入开关持久化；此前在本分支合并为 v54。终端帧、SSH、发布协议及快照格式不变，旧 Agent 的连接与工作区恢复继续兼容，快照仍按下方实际构建范围协商。

v51 开始，原生运行时状态使用 LightOS LPK 版本并保留产物摘要；launcher v5、host_protocol 1、终端帧、SSH/发布及 checkpoint 格式不变，显式保留 v50/v49/v48 和既有 attach 兼容列表。

Agent v52 开始，本机平台经 hportal 纯 PTY 模块复用底层库，Core 的平台边界、终端帧和 checkpoint 不变。退出结果继续使用真实进程状态；Provider 显式保留 v51 attach/工作区能力，不把新 SDK 网络服务作为依赖。

Agent v58 启用随包 Ghostty 官方 Kitty Graphics 和 Wuffs PNG 解码。原生与 Web 共用官方图片存储、布局、占位解析和动画；平台仅复制像素并按 RenderState 分层绘制。维护补丁与 ABI 位于 `ghostty-web/patches/ghostty-wasm-graphics.patch`、`ghostty-web/wasm/webshell_images.zig` 和 `webshell_abi.zig`。仅接受 direct 传输，拒绝读取客户端本地文件和共享内存。新建本地/容器 PTY 使用 `TERM_PROGRAM=LightOS-Ghostty`，不修改已有进程环境。

CSI/Kitty 查询由服务端相同核心按输出顺序应答，不依赖已连接的客户端，也不重复接受客户端应答；OSC 7501 和颜色查询保留原入口。图片会话仍按既有合同使用原始历史回放，不新增图形资源 checkpoint 恢复承诺。非图形会话继续使用 `ghostty-snapshot-v1`（GHOSTSNP）。实际 WASM 指纹由分发清单记录，不跨不兼容构建恢复。

Provider 显式保留 v57–v9 的 attach 和 v57–v27 的工作区恢复；v56/v57 的 GHOSTSNP 协商能力不变。旧核心不自动替换，用户进程不自动重启。终端图片的跨客户端验收合同见 `spec/terminal/inline-images/`；构建检查不代替真实 Codex 会话验收。
