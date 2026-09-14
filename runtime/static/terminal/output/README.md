# 终端输出模块

## 职责

本模块负责浏览器端终端输出队列、输出 generation、replay/live/suppressed 分类、有界 drain、Ghostty 写入、Queue turn ACK 和输出过载重同步。所有 PTY 字节必须保持原顺序；合法大消息先分片再入队，4 MiB 上限只保护累计队列内存。

PTY 输出保留原始 CR/LF 语义，终端配置必须关闭 `convertEol`。Kitty 处理层解码为字符串后仍不得向 LF 前补 CR，否则 Neovim 的局部换行会回到行首并覆盖行号区。页面自身的多行错误提示由提示生产者明确使用 CRLF；实时输出和历史回放均不做这类文本换行转换。

本模块不建立、关闭或重连 WebSocket，不决定 history replay 身份与 commit，不拥有 resize epoch、Canvas presentation、Cache API 或输入队列。transport 只向模块提交已通过身份、sequence、checksum 和 cursor 校验的 payload；history、resize、rendering、input 和 IME 只通过注入的公开命令协作。

任何 history replay、snapshot、resize 或重连中间过程都不得因输出 drain 可见。replay 和 resize suppression 由对应 owner 决定，输出模块只按每个队列条目携带的显式分类选择 `writeReplay()` 或普通 `write()`。

## 公开入口与契约

外部只能从 `terminal/output/index.js` 导入。

- `createTerminalOutputController()`：唯一编排入口，提供 `installSession()`、`write()`、`writeImmediate()`、`flush()`、`scheduleFlush()`、`discard()`、Queue turn 边界处理、只读队列快照和幂等销毁。
- `createTerminalOutputLifecycle()`：独占 output RAF/timeout 调度和清理。
- `terminalOutputByteLength()`、`terminalOutputByteChunkEnd()`、`splitTerminalOutputText()`、`coalesceTerminalOutputBatch()`：无状态字节测量、Unicode/UTF-8 安全分片和批次合并算法。
- `MAX_QUEUED_TERMINAL_OUTPUT_BYTES`：供 history 的网络暂存队列复用同一 4 MiB 内存 guard，不表示 history 状态归 output 所有。

Queue turn complete 只登记待确认 cursor/sequence。窗口协议在 `appliedHistoryCursor` 越过已接收边界后累计确认已消费的轮次，不等待后续队列排空或 Canvas 绘制；旧 `turn-ack-v1` 仍要求队列为空且游标恰好到达边界。默认 ACK serializer 由 `output_controller.js` 持有，会再次校验当前 socket、Unified channel、connection epoch 和 channel generation 后才发送 JSON；单 pane ACK 失败只能请求该 logical stream 恢复，不能关闭 Unified 物理连接或影响兄弟 pane。output lifecycle 对每个 pane 只允许一个待执行的 RAF/fallback timer；重复 schedule 不创建新任务，flush 入口会清理另一句柄。

普通回放轮次受 512 KiB / 12ms 局部预算约束，并服从页面共享调度器剩余预算。普通 Ghostty 写入最多 64 KiB，相邻兼容条目合并后逐批解析；live 输出每轮最多 8 批。显式 `maxEntries` 仍按入队条目计数，保留 resize ACK fence 的冻结边界；`force` 也必须有界，调用者根据返回值继续排空。队列同时限制 4 MiB 和 8192 个条目。普通输出与 startup error 共用按序队列，不能因立即显示错误而越过尚未处理的 PTY 数据。

Unified snapshot 协商到 `replay_burst_bytes` 时，`replay_batch.js` 将不超过 **3,500,000 字节（包含等于）** 的整段历史暂存在上述输出队列。身份、sequence、checksum、cursor 与完成通知校验通过后，一次合并并提交给该 pane 的 Worker；该批合并不受 64 KiB 分片和普通合并时间预算打断。后续 live 字节通过独立 batch 标记隔离，只有实际解析完成才推进游标和最终 Queue ACK。接收期间的尺寸边界 force drain 会退出整段聚合，按原网格顺序分段处理；这不会取消服务端的有界连续传输。超过上限或未协商的后端使用原分批路径，4 MiB 队列上限保持有效。

页面共享调度器由全局运行时注入，output lifecycle 只提交/取消本会话的 output 任务；不可见会话仍公平解析，隐藏页面不绘制 Canvas。matching resize ACK 后的冻结排空只由 resize owner 通过 force 命令推进，普通输出等待网格切换；settle 冻结排空同样独占，避免剩余条目计数被其他任务消费而失效。

解析异常会停止该会话的 drain，保留最后确认游标，并交给 session health owner 有限恢复。由于 WASM 可能已消费部分字节，不在同一运行时重放失败 batch；新连接/历史恢复调用 discard 后解除失败门禁。reset/dispose 后不得推进旧 batch 的 cursor。写入成功的判定要求随包 WASM 的 write/resize 返回状态接口与 JavaScript 同步发布。

输出写入后的宿主复位显式标记 source=output，由 IME 在移动触摸布局下跳过；移动端输入框使用固定 CSS 锚点，positionInput 仅在 composition 期间更新独立预览，不因普通输出改写输入值和选区。桌面宿主复位和光标定位维持原行为。

## 状态所有权

Worker 写入是异步确认：flush 返回完成 Promise（无法开始时返回 false）。在途条目继续计入队列，直到后台成功回复才出队并推进 cursor。每个 pane 只允许一个 drain 进行中；resize fence/settle await 同一 drain 后再扣减冻结条目数。输出回调在代际切换后不得推进新连接；旧 Worker 取消只退休旧操作，不触发新一轮错误恢复。

输出调度的推进责任始终属于 output。flush 入口先消费并清理本次 RAF/timer 唤醒，再判断在途写入和 resize 门禁；撞上在途写入的请求共享原 Promise，由其收尾继续推进。每轮收尾按当前队列、回放和 resize 门禁重新判断是否调度，不沿用旧 resize 批次的 `scheduleRemainder:false` 永久停发。resize 未解除边界时仍禁止普通排空，解除后无需新网络数据或用户操作才能继续。

`output_controller.js` 是 `outputQueue`、`outputQueueSize`、`outputQueueGeneration`、`outputOverloadPending`、`queueTurnReceived*` 和 `pendingQueueTurnAck` 的唯一修改者。session state 只提供初始字段；resize 只能调用 `getQueueEntryCount()`、`getQueuedBytes()`、`flush()` 和 `scheduleFlush()`，不得读取或修改队列数组。

`output_lifecycle.js` 是 `outputFlushFrame` 和 `outputFlushTimer` 的唯一修改者。`output_model.js` 不保存业务状态。

## 生命周期

`installSession()` 注册 pane。session 销毁时由 terminal session lifecycle 调用 `disposeSession()`，先取消 RAF/timeout，再递增 generation、清空队列和 pending ACK；旧 callback、旧 connection epoch、旧 channel generation、旧 selector/pane/history generation 的条目不得写入当前终端。

应用销毁调用 `dispose()`，清理所有已安装 session 并拒绝后续写入。输出过载会进入既有权威 history resync，不得静默丢弃后继续显示不连续状态。

## 文件清单

- `index.js`：唯一公开入口。
- `output_controller.js`：队列、分类、drain、Ghostty 写入、过载、Queue turn ACK 编排及默认 ACK 协议序列化。
- `output_lifecycle.js`：RAF/timeout 生命周期。
- `output_model.js`：字节测量、分片、cursor 解析和批次合并纯函数。
- `replay_batch.js`：整段 snapshot 聚合的容量协商、接收完成与解析状态；实际字节仍由 output 队列持有。

## 依赖、guard 与最小回归

依赖方向为 history/transport/resize -> output -> Ghostty/rendering/input/IME 的显式注入接口。output 不得深度导入 history、transport、resize、rendering 或 input 实现。

自动化测试：`terminal_output_controller_test.mjs`（含默认 ACK serializer 的身份校验）、`TestTerminalOutputControllerBehavior`、`TestRuntimeTerminalOutputModuleBoundary`、`TestRuntimeTerminalOutputBatchingGuard`、Queue frame/cursor/checksum 和 resize bounded drain guard。`spec-tests/terminal/output` 在真实 Provider/agent/PTY 上覆盖普通输出、1.5 MiB 大块输出、隐藏 tab、resize、Canvas 原子呈现、模块资源和单 Unified 连接。

最小真实回归：在 `debug123` 持续输出唯一 marker，覆盖普通输出、隐藏 tab、切换 tab、resize、历史 reconnect 和至少一个大块输出；确认字节顺序完整、Queue ACK 在解析完成后发送、Canvas 非空、pending/hold 采样无 unsafe、页面只有一条 Unified 物理 WebSocket，console/pageerror/API error 为零。

v21 的普通实时输出走正常写入与按帧调度，不因 Unified 通道本身调用 writeReplay。回放／尺寸边界仍可显式抑制。Worker 消费确认只携带状态元数据，output 在实际消费后记录该 revision 对应的字节游标与内容代际；画面生成及展示独立推进。窗口 ACK 账本有界，能够确认前面的已消费边界，即使后面还在继续入队；关闭、重连与 discard 清除旧账本。
