# 终端输出模块

## 职责

本模块负责浏览器端终端输出队列、输出 generation、replay/live/suppressed 分类、有界 drain、Ghostty 写入、Queue turn ACK 和输出过载重同步。所有 PTY 字节必须保持原顺序；合法大消息先分片再入队，4 MiB 上限只保护累计队列内存。

本模块不建立、关闭或重连 WebSocket，不决定 history replay 身份与 commit，不拥有 resize epoch、Canvas presentation、Cache API 或输入队列。transport 只向模块提交已通过身份、sequence、checksum 和 cursor 校验的 payload；history、resize、rendering、input 和 IME 只通过注入的公开命令协作。

任何 history replay、snapshot、resize 或重连中间过程都不得因输出 drain 可见。replay 和 resize suppression 由对应 owner 决定，输出模块只按每个队列条目携带的显式分类选择 `writeReplay()` 或普通 `write()`。

## 公开入口与契约

外部只能从 `terminal/output/index.js` 导入。

- `createTerminalOutputController()`：唯一编排入口，提供 `installSession()`、`write()`、`writeImmediate()`、`flush()`、`scheduleFlush()`、`discard()`、Queue turn 边界处理、只读队列快照和幂等销毁。
- `createTerminalOutputLifecycle()`：独占 output RAF/timeout 调度和清理。
- `terminalOutputByteLength()`、`terminalOutputByteChunkEnd()`、`splitTerminalOutputText()`、`coalesceTerminalOutputBatch()`：无状态字节测量、Unicode/UTF-8 安全分片和批次合并算法。
- `MAX_QUEUED_TERMINAL_OUTPUT_BYTES`：供 history 的网络暂存队列复用同一 4 MiB 内存 guard，不表示 history 状态归 output 所有。

Queue turn complete 只登记待确认 cursor/sequence。只有对应输出已经按序写入 Ghostty、输出队列为空且 `appliedHistoryCursor` 到达边界后才发送 ACK；ACK 不等待 Canvas 绘制。默认 ACK serializer 由 `output_controller.js` 持有，会再次校验当前 socket、Unified channel、connection epoch 和 channel generation 后才发送 JSON；单 pane ACK 失败只能请求该 logical stream 恢复，不能关闭 Unified 物理连接或影响兄弟 pane。output lifecycle 对每个 pane 只允许一个待执行的 RAF/fallback timer；重复 schedule 不创建新任务，flush 入口会清理另一句柄。

大历史回放不使用 live 输出默认的每轮 8 条限制；默认回放轮次受 512 KiB / 12ms 预算约束。单次 Ghostty 写入切成最多 32 KiB 的片段，相邻兼容条目在写入前合并，每次实际解析后重新检查耗时，避免大量原始小帧拖成数千次 RAF，也避免一次大 parse 独占主线程。显式 `maxEntries` 仍按入队原始条目计数，保留 resize ACK fence 的冻结边界；显式 force 且无预算的调用保持完整 drain 语义。写入回调中新增的输出按序保留，reset/dispose 后不得推进旧 batch 的 cursor。

输出写入后的宿主复位显式标记 source=output，由 IME 在移动触摸布局下跳过；移动端输入框使用固定 CSS 锚点，positionInput 仅在 composition 期间更新独立预览，不因普通输出改写输入值和选区。桌面宿主复位和光标定位维持原行为。

## 状态所有权

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

## 依赖、guard 与最小回归

依赖方向为 history/transport/resize -> output -> Ghostty/rendering/input/IME 的显式注入接口。output 不得深度导入 history、transport、resize、rendering 或 input 实现。

自动化测试：`terminal_output_controller_test.mjs`（含默认 ACK serializer 的身份校验）、`TestTerminalOutputControllerBehavior`、`TestRuntimeTerminalOutputModuleBoundary`、`TestRuntimeTerminalOutputBatchingGuard`、Queue frame/cursor/checksum 和 resize bounded drain guard。`spec-tests/terminal/output` 在真实 Provider/agent/PTY 上覆盖普通输出、1.5 MiB 大块输出、隐藏 tab、resize、Canvas 原子呈现、模块资源和单 Unified 连接。

最小真实回归：在 `debug123` 持续输出唯一 marker，覆盖普通输出、隐藏 tab、切换 tab、resize、历史 reconnect 和至少一个大块输出；确认字节顺序完整、Queue ACK 在解析完成后发送、Canvas 非空、pending/hold 采样无 unsafe、页面只有一条 Unified 物理 WebSocket，console/pageerror/API error 为零。
