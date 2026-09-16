# 终端历史模块

## v17 状态基线

普通容器的新页面协商 `checkpoint_protocol=ghostty-memory-v1`。Agent 用同一份固定构建的 Ghostty WASM 在每个 PTY 内持续维护独立终端状态；原始历史仍有界保留给旧客户端。attach 在 pane 锁内取得状态及游标并注册实时订阅，随后以有界控制帧传输 gzip 状态，最后发送历史开始/完成以及该游标之后的字节。尚未结束的 UTF-8/控制序列保留为基线后的原始增量，不从半截 UI 解码状态恢复。

`terminal_checkpoint_runtime.go` 持有 Agent 模块，`worker/memory_checkpoint.js` 在新建的独立 WASM 实例中导入。快照包含固定构建的线性内存、唯一可变全局栈指针、terminal handle、网格和游标，因此覆盖两套屏幕、保存光标和解析器状态；这是内部 ABI，不是跨版本语义序列化。WASM SHA-256、内存 SHA-256、长度、分片顺序和恢复游标必须全部匹配，失败走现有恢复错误路径，不能标作就绪。构建脚本显式导出并校验全局布局；引擎变化必须重新审查 ABI 并更新服务端协议。

模块内存上限 256 MiB，压缩快照上限 16 MiB，分片 64 KiB；后台保留的未完成控制序列上限 1 MiB。Worker 校验后限长解压、在当前连接代次内导入，初始 clear 在导入前完成，尺寸操作和增量在导入后顺序执行，呈现须等待这些操作结束。恢复在 Worker 中执行，主线程不解压大内存。主题默认值通过独立桥接覆盖，程序设置的动态颜色保留。

旧 Agent、未协商的浏览器和客户端主机终端保持原路径；检测到 Kitty 图形协议的 pane 停用影子引擎并使用原始历史，当前基线不宣称包含独立 UI 图形资源。Agent 维护状态会增加解析与内存成本，不是零开销。原始字节裁剪仍存在，但不会再用于支持新基线的普通 TUI 首屏恢复。

## 职责

本目录负责 replay identity、cursor、sequence、authorization、checkpoint 和最终提交门禁。普通容器只消费同一 Unified WebSocket 上由 persistent agent 提供的权威 `snapshot + live`；本目录不再包含 Cache API、warm replay、preview、manifest、compaction 或浏览器持久化逻辑。

`client:` target 尚未升级 Unified 协议，因此继续通过独立 IndexedDB store 保存兼容历史范围。该兼容路径必须由 `isClientTarget()` 精确隔离，普通容器不得调用其 prepare/range/reset 或写入存储。

任何 replay、snapshot、resize 或重连中间过程都不得进入可见 Canvas。

## 公开入口与契约

外部只能从 `terminal/history/index.js` 导入：

- `TerminalReplayController`、`ClientTerminalReplayAdapter`：校验 request/connection identity、cursor、sequence 和完成边界。
- `createTerminalSessionReplayController()`：拥有 replay authorization、失败暂停、connect range 查询和最终 commit transaction。
- `createClientTerminalHistoryController()`：`client:` IndexedDB 历史的唯一 controller；普通容器调用必须为无副作用 false/null。
- `createTerminalHistoryCache()`：IndexedDB store 原语，仅由 client history controller 使用。
- checkpoint API：能力与 payload 校验。

普通容器 Unified open 必须携带 `workspace_generation`，不得携带 `history_generation`、`local_base_cursor` 或 `local_end_cursor`。snapshot 必须先在 render suppression 下 reset Ghostty，`history_replay_complete` 只表示 replay 数据已接收；只有 `receivedHistoryCursor` 与目标 cursor 追平、output queue 排空、cursor 连续且最终 full render 成功后才提交。`replay_output_drained` 是浏览器 output 已追平 replay 边界的诊断事件，不能替代 presentation commit。

## 状态所有权与生命周期

`session_replay_controller.js` 是 session replay authorization、失败次数/暂停、commit phase 和最终 presentation 请求的唯一 owner；`session_replay_lifecycle.js` 独占 checkpoint timer。

`client_history_controller.js` 独占 `client:` load/reset/write/flush/touch/delete、timer 和迟到 Promise guard。session dispose 会先 flush 客户端历史，再取消其 schedule；普通容器不会创建任何浏览器历史任务。

兼容缓存每个会话只允许一笔写入进行中，后续字节留在有界队列，完成后再提交。写入在创建时固定 reset Promise，避免后来产生的 reset 反向等待该写入而成环；过期 generation 的失败不禁用新缓存。暂存最多 4 MiB / 8192 条，复制独立字节片段避免小尾片持有整个网络包；存储无法跟上时沿用缓存故障禁用路径，当前终端输出仍继续。touch 请求也按会话合并，销毁释放未提交队列与 snapshot 引用。

## 文件清单

- `index.js`：唯一公开入口。
- `terminal_replay_controller.js`：现代 replay identity/cursor/sequence 校验。
- `session_replay_state.js`：cursor、authorization、commit 和 client connect range 的纯状态查询。
- `session_replay_lifecycle.js`：checkpoint timer 和 generation/dispose guard。
- `session_replay_controller.js`：replay 失败暂停和最终提交编排。
- `client_terminal_replay.js`：`client:` 原始二进制 replay 适配。
- `client_history_controller.js`：`client:` IndexedDB 历史 controller。
- `terminal_history_cache.js`：IndexedDB store 原语。
- `terminal_checkpoint.js`：checkpoint 能力和数据校验。

## 依赖与验证

history 不建立 WebSocket、不操作 Canvas、不拥有 resize 或输入状态。相关测试为 `terminal_session_protocol_controller_test.mjs`、`terminal_session_replay_controller_test.mjs`、`terminal_replay_controller_test.mjs`、`client_terminal_history_controller_test.mjs`、`terminal_checkpoint_test.mjs` 和 `TestRuntimeTerminalHistoryModuleBoundary`。

最小回归：普通容器首次进入/刷新/断线重连只走服务端 snapshot；Unified open 无本地 range；snapshot 中间帧不可见；`client:` cache/memory range 仍连续；任一迟到 generation、cursor 不连续或 identity 不匹配都拒绝提交且不影响兄弟 stream。

## Agent v27 的原始历史 fallback 与故障日志

正常 pane 仍用服务端状态快照加快加载。某个 pane 的 checkpoint 解析器写入或尺寸处理失败后，停止使用该解析器；后续 attach 跳过它的快照请求，直接从现有原始历史生成回放并订阅实时输出。故障隔离在该 pane 内，其他 pane 继续使用健康快照；已有连接继续收到实时输出，不因影子解析器故障强制断开。PTY、用户程序和 Agent 不重启。

原始历史严格保持 `行数 × 350` 字节上限，不推迟裁剪、不额外保存健康快照、不维护输出重放日志，也不创建新解析器尝试恢复。失败后的每次连接使用保留历史的完整范围及明确游标边界。该 fallback 优先恢复可用性，不能补回已裁剪的画面和终端模式，也不能保证前端能避开相同解析缺陷。

服务端每个 pane 只保存一份首次故障报告，包含真实原生错误、调用范围、输入 SHA-256、解析输入长度、内存、几何、历史范围和近期尺寸记录。`terminal-checkpoint-diagnostic` 实时通知已有连接，并在后续 attach 再次提供证据；`history-replay-start` 的 `recovery_baseline=raw-history`、`checkpoint_fallback=parser_failed` 标记实际回放路径。重复连接不是新的解析崩溃。

fallback 不新增 Toast、弹窗、横幅或状态警告；原因和路径只进入错误日志及诊断记录。错误日志窗口未打开时也按既有有界容量保留，复制和下载包含完整 JSON；渲染异常捕获保留对应摘要。日志不导出原始终端正文或完整解析器内存，调用范围不能当作精确报错字节。WASM 沿用 v26，v26/v27 内存快照兼容；更早版本只协商字节回放。
