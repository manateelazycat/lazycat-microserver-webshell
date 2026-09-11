# 终端传输模块

## 职责与边界

本目录负责 session 连接生命周期、WebSocket 协议事件接线、重连策略、logical membership、pane retry、`client:` 直连调度、Fast 完整性帧、Queue/Unified 协议、Unified 物理连接 owner 和健康检查。普通容器只能有一条 Unified 物理 WebSocket；pane 只拥有 logical stream。`client:` target 继续最多三条独立直连，不能套用容器缓存或 Unified 假设。

传输层不拥有历史权威、Canvas 可见性、resize 提交、输入展示或输入锁；`session_protocol_controller.js` 只负责把连接事件路由到注入的 history/output/resize/presentation 命令，不持有这些模块的状态。每次建立新 logical connection 时，它在推进 `session.connectionEpoch` 后、安装新 socket 生命周期前调用 resize 的公开 `beginConnection()`，使旧 connection resize 事务失效；不得直接清理或迁移 resize 字段。单 pane 的协议、sequence、checksum 或 resync 错误不得关闭物理 Unified 连接或影响兄弟 stream。`websocket_url.js` 只提供无状态 URL 转换，不创建 socket。滚动升级期间旧页面发送的 `input_lock` 只允许在 Provider 协议边界被接受并无状态忽略，不得转发给 agent 或改变 pane。

普通容器恢复时先接入当前可见标签，待其历史提交后再每批接入两个后台回放。已有 logical stream 保持订阅，用户激活标签时立即提升接入优先级；前台等待和后台占位均有期限，避免故障 pane 饿死其他标签。回放是否提交通过 history 的注入 getter 读取，传输层不修改其状态。延后接入 timer 由 transport lifecycle 持有并在销毁时清理。CRC 校验使用共享查找表，协议多项式与校验失败处理不变。

## 公开入口与状态

attach 进展检测由 `session_connection_lifecycle.js` 私有 `WeakMap` 独占。`checkAttachReady()` 与 timer 共用同一判定：有效的 received/applied cursor 前进以及 replay 进入 replaying/awaiting_commit 可更新进展；无进展默认 8 秒超时，单次 attach 总时限默认 60 秒。agent preparing 可使用既有 45 秒等待窗口，但同 socket/epoch 重装 timer 不能重置总期限。ping、focus、resize 不算回放进展；旧 timer 必须同时匹配当前 watch、socket、connection epoch 且 session 未关闭。replay 提交清理 attach watch；Canvas 最终呈现仍由 rendering 的有界验证/retry 负责，不把传输 ready 当作可见画面完成。`session_connection_controller.js` 的用户健康检查只能调用该公开查询，不再另外维护固定 8 秒判定。

外部只能从 `terminal/transport/index.js` 导入 API。`unified_transport_controller.js` 是页面唯一 Unified 物理连接、target、close fence、恢复任务和 watchdog 的 owner。这里的物理 WebSocket 是浏览器实际创建的单个底层长连接；每个 pane 通过 `terminal_queue_connection.js` 的逻辑层 socket 加入独立 stream，逻辑层 socket 的 `open` 事件会分别通知对应 pane，但不会创建新的物理 WebSocket。`transport_runtime_controller.js` 独占 logical membership、channel generation、pane retry、可视顺序、direct demand generation 和 scheduler lease 编排；`transport_runtime_lifecycle.js` 独占 priority/retry timer、measurement RAF 和 logical sync microtask；`session_connection_controller.js` 是 pane 健康与失败分流 owner，`session_connection_lifecycle.js` 独占 connect、health、attach-ready、resume-probe 和 reconnect timer。所有 socket、timer 和迟到回调必须按 close fence、generation、target 和 logical identity 清理或拒绝。异常断线建立的 close fence 在旧 socket 真正关闭或 fence 超时前不得清除，也不得创建替代物理连接。logical attach/replay/resize retry 只写灰色 `reconnecting`，只有明确网络/物理 WebSocket 故障才写 `network-error`。
物理 Unified WebSocket 已打开后新增 logical stream 时，必须先通过 `replace-subscriptions` 向 Provider 发布完整 membership，再允许发送该 identity 的 `set-priority` 或 `pane-control`。初始化诊断依次记录浏览器发送订阅、服务端完成 Agent ensure/validation、每个 pane 的 attach 进程启动、Agent 内部 workspace/pane/history snapshot 准备完成和 replay 开始；这些阶段帧只携带时间、耗时、序号和数量，不携带命令、PTY 内容或鉴权数据。Queue 首次 `queue-ready` 同时发布运行中与当前包携带的 Agent 协议版本；版本判断不假设升级或降级方向。兼容旧版本必须继续 attach、输入和显示原会话，只以 `updateAvailable=true` 展示非阻塞更新入口；当前 v12 明确兼容 v11、v10 和 v9。只有不在兼容表内的版本才设置 `updateRequired=true` 并暂停 attach。初始化或重连路径不得自行执行 `replace-active`，破坏性 Agent 替换只能由用户确认后的显式协议更新接口触发，不使用轮询。订阅更新 microtask 未完成时，priority 只更新本地 subscription；`replace-subscriptions` 成功后再补发已有 stream 的必要 priority 变化，避免 Provider 在 stream 尚未注册时拒绝控制帧。

Agent v12 的权威 `process-exit` 可以携带 `retained=true`。这表示异常退出的最后一个 pane 已作为稳定故障结果保留：页面必须停止 workspace refresh 和 pane reconnect，展示现有输出/启动错误；刷新页面时允许一次历史回放，随后再次收到同一退出终态。普通退出仍按原流程移除 pane 并刷新 workspace。

## 文件

- `index.js`：唯一公开入口。
- `session_connection_controller.js`：pane 连接健康判断、direct/unified 重连分流和 scheduler 协作。
- `session_connection_lifecycle.js`：connect/health/attach/resume/reconnect timer、默认 ping JSON serializer 与迟到 socket guard。
- `session_protocol_controller.js`：建立当前 lease/logical stream 的 WebSocket、推进 connection epoch 并通知 resize connection transition，绑定 open/message/close/error 生命周期，并把 history、binary output、Queue ACK 和进程状态事件路由到显式依赖；`queue-turn-complete` 只交给 output controller 做 cursor/ACK 边界处理，不直接启动 presentation full render；不拥有跨模块状态。
- `transport_runtime_controller.js`：logical membership、pane retry、Unified stream generation、可视优先级和 `client:` direct scheduler 编排。
- `transport_runtime_lifecycle.js`：连接优先级衰减、logical retry timer、测量 RAF、sync microtask 和 session 清理。
- `unified_transport_controller.js`：页面级 Unified 物理连接、target、close fence、watchdog 和恢复生命周期。
- `terminal_connection_scheduler.js`：`client:` 独立连接配额调度。
- `terminal_fast_integrity.js`：Fast frame 编解码与校验。
- `terminal_queue_connection.js`：Queue/Unified 共享帧协议和连接实现。
- `terminal_unified_connection.js`：单物理连接与 logical stream API。
- `terminal_unified_health.js`：物理连接 watchdog。
- `terminal_unified_membership.js`：workspace pane membership 与 priority。
- `websocket_url.js`：页面 endpoint 到 `ws:`/`wss:` 的 URL 解析和协议校验纯函数，以及 Unified endpoint 的 transport query 构造；不创建 socket。
- `theme_controller.js`：校验已打开的 session socket 并发送 appearance 提供的终端主题 payload；不拥有主题状态或连接生命周期。

## 验证

行为测试包括 `terminal_session_connection_controller_test.mjs`、`terminal_transport_runtime_controller_test.mjs`、`terminal_unified_transport_controller_test.mjs`、`terminal_connection_scheduler_test.mjs`、`terminal_queue_connection_test.mjs`、`terminal_unified_health_test.mjs`、`terminal_unified_membership_test.mjs`、`terminal_fast_integrity_test.mjs`、`terminal_websocket_url_test.mjs` 和 `terminal_theme_controller_test.mjs`。最小回归是同容器创建多个 pane、关闭一个 pane、断网恢复，以及 `client:` 四 pane 争用三条直连；确认新增 stream 的首个 identity 帧是 `replace-subscriptions`、其后才允许 priority/control，旧 `input_lock` 不产生 agent frame，旧物理 close fence 完成前不会创建替代连接、普通容器始终只有一条物理连接且兄弟 pane 不受影响。真实兼容回归见 `spec-tests/terminal/input-lock-lifecycle`。
