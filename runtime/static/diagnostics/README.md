# Diagnostics 模块

## 职责

本目录负责 WebShell 前端的只读诊断能力：调试总控、错误日志、启动追踪、一次性初始化性能、性能任务采样、FPS/刷新率显示、终端网络流量监视、流量消费归因、会话历史回放消费校准和终端事件时间线。

诊断模块只观察应用状态并展示或记录结果，不得修改终端连接、历史、渲染、resize、输入、工作区或设备数据。设备心跳、强制 PC 模式等业务功能仍由各自模块维护，诊断模块只通过调试总控变更回调通知它们重新同步。

## 公开入口

外部只能从 `index.js` 导入：

- `createStartupDiagnostics()`：维护页面启动指标和启动追踪队列。
- `createDiagnosticsController()`：创建诊断模块唯一控制器。

控制器公开日志、性能记录、终端事件记录、运行时恢复事件记录、只读开关查询、网络 socket 快照同步、`start()` 和幂等 `dispose()`。外部不得深度导入本目录中的其他文件。

## 状态所有权

`diagnostics_controller.js` 是以下状态的唯一 owner：

- 调试模式、错误日志、网络监视器、流量消费统计、历史回放消费校准、FPS 监视器、性能任务和初始化性能开关。
- 初始化性能跟踪页面启动与当前进度最领先的候选终端 session。采集中 snapshot 会立即合并已到达的 startup metrics、startup trace 和候选 session 事件，并追加“等待下一步 · 上一事件”pending 行；pending 时长和页面总耗时每 250ms 渐进刷新。首次 `presentation_commit_complete` 到达后以该 session 冻结最终结果并停止 timer。面板复制按钮导出当前或最终完整时间线和白名单诊断详情，页面级 startup trace、物理 WebSocket 事件与逻辑层 socket 事件分别标记来源。连接时间线进一步拆分浏览器订阅发送、服务端 Agent ensure/validation、pane attach 进程启动、Agent workspace/pane/history snapshot 准备和 replay 接收阶段。
- 调试日志记录、去重索引和 console/window 捕获状态。
- 整段回放通过 `replay_batch_begin/received/applied` 记录接收和处理阶段；`replayBurstBytes` 表示服务端确认的聚合量，`aggregate=false` 表示期间因尺寸边界转为按序分段。大于等于 512 KiB 的 Worker 写入始终记录请求与完成耗时（仅初始化采集期间），方便确认 3.5MB 历史是否只产生一次解析请求；`replay_batch_applied.durationMs` 包括接收完成后的调度及处理等待，不等同于纯 CPU 时间。
- 初始化性能额外记录 Worker 创建/重建、init/resize/snapshot 往返与后台排队/执行耗时，write 记录至少 512 KiB、耗时至少 50ms 或失败的 RPC 明细。`wasmLoadMs` 包含 WASM 获取、编译及实例化，`engineCreateMs` 和 `snapshotMs` 分别表示原生终端创建和初始快照生成；Worker 与 UI 只交换各自测得的持续时间，不直接相减两侧时钟。RPC 耗时不等于主线程 CPU 时间。Worker 计时随初始化采集开关启停，首帧提交后停止。
- 多客户端尺寸诊断区分服务端确认、本地排队、本地提交与事务清理，保留 `claim`、远端 epoch、实际/目标尺寸、回放锁及控制权等待条件；清理事件中的 `cancelledScheduledTask` 可定位刚排队即被取消的更新。导出携带页面标识、浏览器、时间基准及 pane/tab/连接代际；跨设备时钟未校准时，应优先使用共享 resize epoch 对齐。事件完整保存，事件驱动的面板刷新间隔至少 100ms，现有 250ms ticker 补齐尾部，首次完成立即刷新并冻结。
- 性能任务样本、FPS RAF、网络监视器动态模块 generation、采样 timer、socket instrumentation、与总流量一致的消费分类，以及当前会话单次历史回放校准状态。
- 每个终端 session 的诊断时间线。时间线保存在模块内部 `WeakMap`，不写入业务 session 对象。
- 页面级运行时事件时间线和当前 `resumeGeneration`。运行时事件只保留有限条目，敏感字段在进入时间线前脱敏。

状态通过显式方法、只读查询和回调交互，不通过 `window` 可变字段共享。

## 生命周期

- `createDiagnosticsController()` 会读取持久化开关并立即恢复已启用的错误捕获，以覆盖早期启动错误。
- `start()` 绑定设置控件并启动当前已启用的采样器。
- 初始化性能 ticker 只在 controller 已启动、面板可见且状态为 `collecting` 时运行；完成、关闭初始化性能、关闭调试总控或 `dispose()` 都必须立即清理。
- 调试总控关闭时，FPS RAF、性能采样、网络采样 timer、socket 包装、console 包装和 window 错误监听必须全部停止。
- `dispose()` 可重复调用；所有 listener、timer、RAF、动态加载 generation 和 socket instrumentation 都必须清理。
- 网络监视器保持按需动态加载，未启用时不得进入 bootstrap 预加载或其他静态资源预取路径；消费明细只使用网络监视器已记录的字节，不创建新的流量观察范围。

## 文件清单

- `index.js`：模块唯一公开入口。
- `diagnostics_controller.js`：状态 owner 和模块编排。
- `diagnostics_lifecycle.js`：设置事件、初始化性能渐进刷新 timer、网络动态加载、timer 和 socket instrumentation 生命周期。
- `diagnostics_view.js`：诊断控件、日志、性能任务和网络面板 DOM 适配。
- `network_context.js`：把当前工作区的终端会话与逻辑连接转换为只读网络快照，不修改 session 或连接状态。
- `debug_log.js`：日志去重、脱敏、console/window 捕获和复制文本生成。
- `performance_meter.js`：FPS/刷新率 RAF 与 DOM 生命周期。
- `performance_tasks.js`：无 DOM 的性能任务采样器。
- `initialization_performance.js`：渐进收集页面启动指标和候选终端 session 初始化事件，按终端里程碑选择当前领先候选，构建 live rows、pending step 和动态总耗时；以第一个完成 presentation 的 session 作为最终结果并冻结。复制数据时仅导出白名单中的物理 WebSocket、逻辑层 socket、gate、generation、resize、replay 和 Canvas 几何详情。
- `network_monitor.js`：按会话记录 WebSocket 字节、按标签汇总速率与用量，并把同一批字节归因到固定顺序终端任务的采样器，按需加载；明细可复制为带格式版本的 JSON，并使用服务端实际历史量和本次应回放量校准单次回放消费。
- `startup_trace.js`：启动指标 owner 和追踪队列。
- `terminal_timeline.js`：终端/页面诊断时间线和 Ghostty runtime 计数适配。

## 依赖方向

`global-runtime.js -> diagnostics/index.js -> diagnostics_controller.js/network_context.js`。控制器和快照 adapter 可以依赖本目录内部实现；内部文件不得反向导入 `global-runtime.js`，也不得导入工作区、终端 transport 或渲染实现。终端连接状态只能通过 `getNetworkContext()` 提供的只读快照进入本模块。

## 测试与回归

- `initialization_performance_test.mjs`：初始化性能开关默认关闭、采集中 live rows/pending/动态计时、首个终端 session 选择、跨 pane 隔离和首次渲染后的冻结行为。
- `diagnostics_controller_test.mjs`：开关持久化、生命周期清理、迟到动态加载和业务回调边界。
- `terminal_network_monitor_test.mjs`：WebSocket 字节、会话/标签汇总、消费归因、速率和 dispose 行为。
- `runtime_shortcuts_test.go`：公开入口、版本化静态资源和 `global-runtime.js` 不再持有诊断实现的静态契约。

最小回归步骤：开启调试模式后分别启用错误日志、网络监视器、流量消费统计、FPS、性能任务和初始化性能；打开一个首次加载的终端，确认初始化性能窗口在未完成时已经逐行展示事件，尾行指出上一完成步骤且等待时长和总耗时持续增长；点击“复制”获取当前时间线，重点检查 `render_blocked`、`presentation_ready_state` 的 `reason`、gate 状态、generation 和 Canvas 尺寸；首次 presentation commit 后 pending 行消失且数值冻结，持续输入、resize 和网络流量不会新增初始化样本。制造历史回放、实时输出和输入流量，确认消费分类合计与网络监视器总量相等；关闭调试总控，确认 ticker、全部面板和采样器停止；离开页面后确认 WebSocket 方法、console 方法和全局监听均恢复。真实回归由 `spec-tests/terminal/output` 在 reload 前安装 DOM probe，验证 collecting 到 complete 的渐进过程。
# 自动刷新屏幕开关

调试模式内的“自动刷新屏幕”独立控制 rendering 的可插拔补绘模块，默认开启。设置以 `<storagePrefix>.autoScreenRefresh` 保存在本浏览器 localStorage，读取失败使用默认值；关闭调试模式只隐藏入口，不改变该设置。diagnostics 只保存偏好并通知运行时，不实现定时检查或绘制。关闭补绘不影响正常输出、resize 和原有恢复机制。
# 字节 IO 日志

`byte_io_log.js` 是独立的有界、顺序日志收集器。调试模式中的“字节io日志”默认关闭，偏好保存为 `<storagePrefix>.byteIOLog`。开启后无需同时开启初始化性能或普通调试日志，就会采集接收、入队、输出批次、Worker RPC、解析、快照及绘制阶段。开启后重新进入页面可采集初始化；中途开启不补造先前耗时。

右上角“字节io”面板每 250ms 最多更新一次，显示最近 80 条；复制包含最多 4000 条、约 2M 字符的全部保留日志，附口径与淘汰数量。日志不合并相同类型事件，也不记录原始 PTY 内容。关闭选项/调试模式停止新采集和 UI 定时更新，销毁清空日志。逐帧/小批次 IO 事件不重复送往普通调试日志。

耗时口径：`receiveGapMs` 是浏览器交付相邻逻辑二进制帧的间隔，`receiveSpanMs` 是当前采集窗口/回放从首帧至当前帧的跨度，并非纯网络耗时；整段接收另看 `replay_batch_received`。`oldestQueueWaitMs/newestQueueWaitMs` 从入队至合并前，包含等待收齐、尺寸门禁及调度。`parseMs` 覆盖 Worker 的原生写入（含 WASM 输入复制），`snapshotMs` 包含历史状态更新及快照构造，二者均包含在 `workerExecutionMs` 内。`workerQueueMs` 从 Worker 的 message handler 起算，不包含该 handler 开始前的事件循环阻塞。`roundTripMs` 到主线程接到回复为止；其后 `frameUnpackMs`、`frameAcceptMs` 包含在 `rpcTotalMs` 中。`writeAwaitMs` 是输出批次等待完整写入流程返回的经过时间，不能作为主线程阻塞时间。`cacheEnqueueMs` 不包含异步存储完成时间；`renderCallMs` 是显式完整重绘调用耗时，不代表 GPU 最终显示时间。复制结果也包含这些口径，禁止把重叠字段相加。
# 终端渲染异常捕获

v2 进一步保留回放范围、裁剪标识、批次接收/消费事件、终端模式、折行标记与输入缓冲状态。在回放开始、排空、每轮首次呈现和自动补绘后立即采集已有缓存状态；帧尚未就绪时仍明确标记过时数据，不补发 Worker 请求。`replay_control_evidence.js` 在当前 tab 的回放入队后、Kitty 处理前被动扫描 ASCII ESC 序列，按类别统计清屏/光标/滚动/模式控制，保留前 12、后 24 个控制及相对位置；不保留正文或 OSC/DCS/APC 等字符串载荷。最多 128 个控制类别，超限记录省略数；CSI 参数超过 64 字符时标注溢出。扫描不是 VT 仿真器、不完整支持所有控制编码，也不知道截断之前的控制状态。`fromStart`、`bytesObserved`、`expectedBytes`、`sizeMatches` 用于判断采集完整性，`scanMs` 单列诊断增加的主线程扫描时间。观察函数只在该开关开启且属于当前 tab 时处理字节。

`terminal_render_capture.js` 管理独立开关、当前 tab 事件筛选、每秒状态采样、手动捕获和复制。选项 `<storagePrefix>.terminalRenderCapture` 默认关闭，依赖调试模式；关闭、销毁及协议替换时停止计时。页面隐藏时暂停周期采样。窗口显示最近 18 条摘要，复制包含最多 2000 条、约 2M 字符的完整记录，裁剪时注明旧记录数量。切换 tab 后采集新 tab，旧记录保留原 tab/pane 身份。

v3 的 `liveOutputEvidence` 在相同开关下扫描实时字节，补充插入／删除行、插入／删除／擦除字符、重复字符、滚动和滚动区域设置，以及 CR/LF/HT/BS 计数。保留末尾 96 条控制，偏移相对于 `baseCursor`；游标不连续或会话身份改变时重新开始扫描。既不保留正文，也不把该扫描器当作 VT 仿真器。

v4 增加 `write_byte_comparison`：在每次输出批次进入 `term.write/writeReplay` 前与 `writeInternal` 送入 Worker 前，记录 UTF-8 字节数量、指纹、CR/LF 数量、逐字节相等结果及掩码差异位置。特别标明差异是否完全由 LF 前插入 CR 构成，并记录 `convertEol`。日志不导出正文、不替换数据、不增加等待；只有原渲染捕获开关开启且属于当前 tab 时才采集，每侧最多保留 256 KiB 临时字节。超限、重叠调用及未完成写入明确标记；Kitty 拦截和 UTF-8 跨批缓冲可能造成合理差异，不能只凭 unequal 判错。采集异常不会中断终端写入，关闭开关后忽略在途结果。

手动捕获、复制及下载增加串行 `diagnose` RPC；周期采样仍只读 UI。`cell_evidence` 用 `captureID` 关联当时页面记录，对照原生活动屏幕、原生 RenderState 和 UI 缓存。新 WASM 接口只读两种原生单元格，不调用 update/markClean，不触发 resize、呈现或回放。逐行 FNV 指纹包含码点、宽度和组合字符信息，日志只保留指纹及占格分布，不导出原文；颜色不包含在该指纹中。行列均从 0 开始，只有尺寸和版本匹配时才比较 UI 与 Worker。每窗格上限 50000 格，诊断超时为 3 秒且不使终端失败；并发手动操作复用正在进行的捕获，导出等待完成。关闭功能后忽略在途结果。诊断仍会产生扫描、传输和排队开销，耗时单列记录。

rendering 的 `render_probe.js` 只读 DOM、presentation/resize 检查结果及 backend 的 `getRenderDiagnostics()`。后者只读 UI 缓存，按当前滚动位置统计逐行非空字符、可见字形候选、背景色不同的单元格；不调用 `getViewport()`、不读 Worker 新帧，不补取缺失历史。每次最多采样 256 行、约 50000 个单元格，并输出步长；过时帧和缺失行保留明确状态。字形候选不完整模拟字体、装饰、图片或复杂终端样式，不能据此认定画面一定正确。

手动捕获/复制时才在独立 64×64 Canvas 上缩小采样 live Canvas；hold 生效时也采样 hold Canvas。输出自上而下四个区域的透明、近黑和量化颜色分布，不导出像素或原始终端文本；薄字形可能被缩小采样遗漏，正常黑色背景不能被自动判作故障。DOM 遮挡、CSS 合成与 GPU 最终显示可能不同于 Canvas 读回结果，日志只提供线索。诊断不改变正常自动补绘开关，并记录其当前值。
# 调试日志下载

历史回放消费校准同时支持原始回放与 `ghostty-memory-v1`：在历史开始通知之前收到的快照分片按压缩有效载荷累计，开始通知保留这些字节，再累加原始增量。期望量依据协议的 64 KiB 分片尺寸、声明分片数和最后一片长度计算；完成通知中的原始字节数不能覆盖快照部分。缺少分片或中途开始采样时标注 `incomplete`，避免把未观察到的流量显示成正常零消费。这里不计 Base64/JSON 封装，与网络监视器的 WebSocket 总载荷统计口径不同。

五个具有复制入口的诊断窗口均在复制按钮左侧提供下载：终端渲染异常捕获、字节 IO、初始化性能、流量消费统计和调试日志。controller 的 `exportLog` 统一提供复制及下载的导出文本；渲染捕获保留手动导出时补抓当前状态的行为。`log_download.js` 生成 UTF-8 Markdown Blob，文件名为 `webshell-<类型>-<UTC时间>-log.md`，不额外改写内容、不读取剪贴板或上传。对象 URL 在下载发起后延迟释放，模块销毁时清理剩余 URL 与计时器。没有数据时不生成空文件。

v5 增加 resize 故障与等待诊断：服务端 ACK 和快照失败响应附带快照内存／上限、快照与 PTY 尺寸、最近 8 次 resize 的耗时和内存变化、原生错误名及失效后跳过次数。失败写入错误日志；占位帧或输出 settle 超过 1 秒后结束时写入警告。渲染捕获包含 Canvas 复制耗时、占位累计时间、释放失败条件、resize 队列边界数及 settle 剩余时间。800ms settle 上限只约束静默等待，日志不把它解释为整个占位过程上限。诊断不清除错误、不修改 resize／重连策略、不移除占位 Canvas。

v6 仅增强前端观察。`checkpoint_failure_evidence.js` 在现有捕获开关和当前标签筛选之后接收已有事件，不注册网络、Worker 或计时任务，不写 session。导出的 `checkpoint_failure_evidence` 独立保留最多 32 个会话身份的首次错误、最新错误、首次错误之前最后一次未报错的服务端样本，以及当时和最近各 48 条连接／回放／尺寸事件；普通 2M 字符日志淘汰不会删除这些证据。超过独立容量的错误报告数、上下文裁剪数和 8192 字符错误文本上限均有标记。暂时关闭再开启捕获不会覆盖首次错误，重新载入页面会清空；`captureWindow` 和窗口开始时间表示采集间断，不补造未观察到的过程。

`checkpoint_evidence_scope` 明确证据边界：首次观察不等于首次故障，服务端 `observed_unix_ms`／`history_cursor` 属于诊断采样时刻，`scrollback_lines` 是配置上限。相同错误文本的重复报告不能认定为多次新崩溃；没有错误的样本也不证明服务端引擎完全健康。现有 Agent 不提供触发输入、故障地址／指令偏移、故障内存、首次故障时间／游标及实际历史占用，这些字段明确列为不可获得。`classification` 只按原始错误文本分类，通用错误日志改称“服务端终端快照异常”，同时保留控制消息类型。

每秒快照补充现有连接状态、逻辑连接代次、回放阶段、暂停与失败次数，使用 evidenceID 关联独立首次错误；不重复塞入整份固定证据。缺少 `checkpoint_diagnostics` 的旧错误响应仍记录其错误文本。复制与下载共用 v6 导出；正常关闭开关停止采集，服务端请求、重连、回放、尺寸、Canvas hold 释放及 Agent 版本均不因本次诊断改变。
