# WebSocket 三通道复用方案与执行计划

状态：普通容器 Unified transport 已完成第一批迁移态接入；最终删除 Fast/Queue 逻辑角色和真实设备验收待继续

最后更新：2026-08-28

> 本文记录 `1 Fast + 1 Queue` 的历史复用实现和迁移过程。新的单物理连接目标、阶段计划和最终验收标准以根目录 [TERMINAL_UNIFIED_WEBSOCKET_EXECUTION_PLAN.md](../TERMINAL_UNIFIED_WEBSOCKET_EXECUTION_PLAN.md) 为准；普通容器当前代码已进入 Unified 迁移态，不能将下文旧的双物理连接数量当作最终契约。

## 1. 问题与目标

一个 WebShell 页面可同时拥有多个 tab 和 pane。现有单 pane WebSocket 模型会让浏览器为多个 pane 建立并维持多条长连接；在部分移动设备或 WebView 中，连接、消息分发、终端解析和 Canvas 渲染压力会累积，最终表现为多会话集中断连或终端不可用。

本方案限制的是**浏览器到 Provider 的物理 WebSocket 数量**，不是服务端会话数量：

- 普通容器目标浏览器任何时候最多使用 2 条终端 WebSocket。
- 其中 1 条是页面级、单 pane 逻辑绑定的直连通道，1 条是页面级共享队列通道。
- persistent agent 继续维护全部 PTY、进程、终端历史、cursor 和工作区；浏览器端通道切换、后台 tab、队列积压或网络断开都不得停止任务。
- 队列通道是持续的 WebSocket 多路复用流，不是 HTTP 轮询，也不是频繁关闭、重建 pane WebSocket 的轮询方案。
- 不修改 persistent agent。本方案需要扩展的是 Provider 的 WebSocket 中转层和浏览器协议。

> 当前实现变更（2026-08-23）：普通容器目标已去掉第二条直连，只保留一个 Fast 和一个 Queue。首次初始化按稳定顺序将第一个 pane 分配给 Fast，其余 pane 统一进入 Queue；聚焦或操作 pane 时只替换 Fast 的逻辑绑定。下文早期关于双 Fast 的候选、启动顺序和 3 条连接数量均属于历史方案，不能作为当前代码契约。

目标是在一个 tab 有很多分屏时，让当前可见 pane 都能持续收到更新；用户不应为了查看最新内容而逐个点击非高速 pane。

## 2. 已确认的边界

### 2.1 不做的事情

- 不限制 persistent agent 所维护的 PTY 或服务端会话数量。
- 不暂停、杀死、迁移或重建后台任务。
- 不改动 persistent agent 的 socket 协议、PTY 生命周期或历史权威职责。
- 不采用 HTTP 轮询、定时重新 attach，或把关闭/重连作为公平调度手段。
- 不让一个 pane 同时从高速和队列两个通道向同一个浏览器终端实例写入。
- 后台 tab 可以作为 Queue 逻辑成员，但不抢占 Fast；它们按稳定队列顺序逐个初始化。
- 不为了限内存而直接丢弃任意一段 VT/ANSI 原始字节。

### 2.2 当前协议事实

当前 `/ws` 请求带有单一 `pane` 参数，Provider 的 `attachPersistentPane()` 最终为一个 pane 启动一次现有 agent attach。该通路向浏览器转发裸 binary PTY 字节和 JSON 控制帧；它本身不能把多个 pane 合到一个浏览器 WebSocket。

agent 已能持续维护 pane 历史，并通过 `history_generation`、绝对 byte cursor、`history-replay-start` 和 `history-replay-complete` 提供 snapshot、delta 或 current 同步。Provider 可在不改 agent 的前提下复用这些能力：它为各个逻辑 pane 建立或恢复既有 attach，并将多路输出封装后转发给浏览器的一条队列 WebSocket。

## 3. 目标架构

```text
浏览器（单个 WebShell 页面，普通容器目标最多 2 条物理连接）
  ├─ Fast:   /ws?pane=<pane-a>       当前交互 pane，pane 专属
  └─ Queue:  /ws?mode=queue          其他 tab/pane 的复用流
                    |
                    v
          Provider queue broker / relay
          ├─ pane-c 既有 agent attach
          ├─ pane-d 既有 agent attach
          └─ pane-n 既有 agent attach
                    |
                    v
 persistent agent（不改动）：全部 PTY、历史、cursor、工作区持续运行
```

Provider 内部为队列成员维持的 agent attach 数量可以高于 3；这是服务端承担的中转、读取和缓冲成本。它不等同于浏览器的 WebSocket 数量，也不影响 agent 持续维护所有会话。

队列 WebSocket 断开后，Provider 应释放该浏览器订阅和不再需要的内部 attach，以避免无消费者时浪费中转资源；agent 中的 PTY、历史与任务继续运行。下一次连接依据浏览器已确认的 cursor 从 agent history 追平。

## 4. 通道资格与调度规则

### 4.1 范围

tab 与 pane 统一进入同一个页面级调度集合。队列成员可以来自任意 tab；切换 tab 只发送新的完整逻辑订阅集合，不撤销旧 tab 的会话维护，也不关闭 Queue 物理 WebSocket。

高速候选只有一个：当前输入/指针交互 pane 始终优先；首次初始化使用全局稳定顺序的第一个 pane。tab 切换和 pane 聚焦只改变 Fast 的逻辑绑定，物理连接继续复用。

### 4.2 分配

- **首次创建的硬性前置条件：唯一的 Fast 物理通道必须先确认 `OPEN`。** Fast 完成当前逻辑启动并稳定呈现，且工作区存在其他 pane 后，才允许创建 Queue WebSocket、启动 Queue broker 和提交首个 `replace-subscriptions`。后台 tab 或不可见 pane 没有 Canvas 首帧时，不得阻塞 Queue 物理通道；其 replay/最终画面继续由各自逻辑任务独立完成。
- 页面首次打开或切换 tab 时保持直连优先：先启动并完成 Fast 的逻辑启动，随后在 Fast 物理连接 `OPEN` 后创建 Queue WebSocket。若当前工作区只有一个 pane，不创建 Queue。
- 初始阶段 Fast 的真实 socket 仍由状态机重试；Queue 物理创建只依赖 Fast 物理 `OPEN`、逻辑 replay ready 和存在其他 pane，不依赖后台 Canvas 回调。Queue 已经存在后，普通 PTY 输出、一次 Canvas render pending、尺寸校验或下一帧内容 generation 推进不得撤销任何物理通道或 Queue 订阅。
- `Fast`：当前正在输入、鼠标操作或刚被显式选中的 pane；首次初始化时为全局稳定顺序的第一个 pane。它必须立即取得 pane 专属连接。
- `Queue`：Fast 之外的所有 tab/pane。只有一个成员时，它仍是持续实时流，效果等同一条专属连接。
- 只有在存在 Fast 之外的 pane 时才创建 Queue；不能为了凑满物理连接而建立无意义队列。

例如当前 tab 有 12 个可见 pane：

```text
Fast : pane-1（正在输入）
Queue: pane-2, pane-3, ... pane-12
```

`pane-8` 被点击、输入或获得操作焦点后：

```text
Fast : pane-8
Queue: 其余可见 pane，包括被 Fast 淘汰者
```

该提升只关闭 `pane-8` 的 Queue logical stream，并替换唯一 Fast 的逻辑绑定。Queue 物理 WebSocket 必须保持运行，不能因为一次优先级切换关闭并重建两条连接。切换不能在同一 pane 上并行写入两条流。浏览器必须先完成该 pane 的通道 generation 切换，再接收新通道的数据；迟到的旧 generation 数据一律丢弃。

### 4.3 队列公平性

队列不是先进先出的全局字节队列，而是按 pane 轮转的公平调度器：

```text
pane-3 -> pane-4 -> ... -> pane-12 -> pane-3 -> ...
```

每个 pane 在一轮中只获得固定字节预算或固定时间预算，以先到者为准。达到预算后立刻轮到下一个 pane。持续高频输出的 pane 不得独占队列；高速通道也不受队列流量影响。

每轮开始时，为该 pane 固定一个 `target_cursor`。该 pane 在本轮最多追平到该目标，新增输出留给下一轮，避免持续输出让一个 pane 永远无法结束本轮。预算、最大单帧和每轮最大时长应使用保守初值，并通过真机性能数据调节，不能写死为“尽可能全部发完”。

## 5. 队列外层协议

当前 `/ws` 是单 pane 裸 binary 流。队列端点需要一份版本化的、显式带逻辑流身份的外层协议，例如 `/ws?mode=queue&protocol_version=1`。具体 JSON 字段和二进制编码在实现前必须形成独立 protocol spec；以下是必须具备的语义，不是最终 wire 格式。

### 5.1 浏览器到 Provider 的控制帧

- `replace-subscriptions`：原子提交当前 tab 的完整 Queue 成员集合；每个订阅包含 pane/stream/channel generation、尺寸、主题、workspace/history 身份和浏览器本地 cursor。添加、移除、tab 切换和 generation 替换都通过这一条完整集合更新完成。
- `pane-control`：向指定逻辑 pane 发送 `ping`、generated input、`resize`、`theme` 或 `input_lock`。Provider 必须再次校验 pane/stream/channel generation；普通用户 input 返回错误。
- `queue-ping`：物理连接级健康检查，Provider 回复 `queue-pong`；正常 ping/pong 不进入调试错误日志。

普通用户输入只允许通过该 pane 的高速专属连接发送。队列成员被用户操作时，先完成提升与 replay ready，再解除该 pane 的输入锁；不能把输入插入共享队列而让交互排在其他输出之后。

### 5.2 Provider 到浏览器的帧

- `queue-state`/`queue-ready`/`queue-error`：物理 Queue 的准备、就绪和全局错误状态。一个物理错误只触发一次全局关闭与退避，不按 pane 重复计数。
- `pane-control`：把现有 agent 的 `history-replay-start`、`history-replay-complete`、`agent-preparing`、`connection-error`、`workspace-refresh-required`、`process-exit`、`pong` 等控制帧封装到指定 pane/stream/channel generation。
- binary `LCQ1` envelope：携带 `pane_id`、`stream_id`、`channel_generation`、`start_cursor`、`end_cursor` 和 PTY 原始字节。浏览器只接受匹配当前逻辑流且 cursor 连续的数据。
- `queue-turn-complete`：紧随该 pane 本次二进制时间片，浏览器在此边界对已通过 `writeReplay()` 解析的数据执行一次 full render。

Provider 将现有 agent 的文本控制帧按 pane 封装到队列协议中；浏览器不能再依据“收到裸 binary 就属于当前 session”作判断。高速端点可保留既有单 pane 协议，以减少切换期改动面。

### 5.3 身份和隔离

每个逻辑流必须校验当前既有的完整账号 scope、selector、workspace generation、tab、pane 和 history generation。`pane_id` 不是跨账号或跨 workspace 的全局授权依据。Provider 在 `subscribe`、`replace-subscriptions`、handoff 和重连时都必须重新执行可见性与工作区校验。

## 6. 一致性、缓冲与重同步

### 6.1 Provider 必须持续 drain 上游流

Provider 为队列 pane 建立既有 agent attach 后，必须持续读取其输出，不能只在该 pane 的轮次到来时才读取。否则上游 pipe、agent pane client 或 PTY 输出会发生反压，进而把前端公平调度变成服务端任务阻塞。

Provider 按 pane 保存尚未写入 Queue WebSocket 的有界数据和 cursor。agent 的 replay start 提供初始绝对 cursor，之后每一段真实输出按字节长度推进这个 Provider 流 cursor，replay complete 必须与该 cursor 一致。物理连接断开后不依赖 Provider 内存续传；浏览器用最后已应用的本地 cursor 重新 attach，由 agent 权威 history 提供 delta 或 snapshot。

### 6.2 不可直接丢弃 VT 字节

队列积压超过单 pane 缓冲上限时，Provider 不能截断一段原始 PTY 字节后继续发送。这样可能切断 ESC/CSI/UTF-8/Kitty 控制序列，导致终端状态损坏。

过载处理应为：

1. 停止把该 pane 的旧缓冲继续当作可交付数据，并终止对应内部 attach；
2. 标记该 pane 为 `resync-required`，保留浏览器最后确认的 cursor；
3. 下次该 pane 获得队列时间片或提升为高速时，重新使用现有 agent history 请求 delta；若历史已经 trim，则请求 snapshot；
4. 浏览器对 delta 连续追加；对 snapshot 保留 last-known-good 画面，在内存完整重放并最终 full render 成功后原子替换；
5. 只有新 generation、cursor 和最终渲染全部确认后，才清除 `resync-required`。

这利用现有 agent 的历史权威和 cursor 协议恢复正确状态，不改变 agent，也不让浏览器解析不连续数据。

### 6.3 高速/队列切换

提升队列 pane 到高速时：

1. 浏览器关闭该 pane 的旧 Queue logical socket，使旧 channel generation 立即失效；
2. `replace-subscriptions` 撤销该逻辑流，迟到的旧 generation 帧在浏览器路由层丢弃；
3. 浏览器使用当前 session 已应用的 history generation/cursor 建立高速单 pane attach；agent 以 delta/current 或 snapshot 追平切换窗口；
4. 浏览器完成 `writeReplay()`、实时队列追平和一次最终 full render 后，才允许输入。

降级高速 pane 到队列时执行对称步骤：先关闭/失效旧高速 generation，再以浏览器最终 cursor 订阅队列。高速与队列在 Provider 内部短暂同时存在可以用于安全交接，但浏览器的同一个 Ghostty session 在任一时刻只能接受一个已验证 generation 的字节流。

现有 Cache API v2、cursor、`writeReplay()`、最终 full render 和 last-known-good 画面语义全部保留；本方案不能以清屏或创建新终端实例来掩盖通道切换。

## 7. 错误处理与可观测性

- 物理 Queue WebSocket 断开时，当前 tab 所有队列 pane 进入可恢复连接状态；现有连接状态机按退避重连 Queue 本身，而非为每个 pane 创建浏览器物理连接。
- 单个逻辑 pane 出错时，不应关闭其他队列 pane；Provider 发出带 pane/stream/generation 的 `error`，该 pane 单独重同步或等待下一次订阅。
- 高速通道失败只影响对应 pane；该 pane 可在重试间隙降级到 Queue，但必须经过上节的 generation/handoff 边界。
- 离线、后台恢复、连接建立超时和异步前置失败继续沿用现有重试状态机。`connecting` 显示呼吸灰点，真实 `reconnecting` 显示呼吸红点，`offline`/不可恢复错误显示静态红点；被调度停放的 pane 不显示错误红点。
- 调试日志仅记录关键事件：订阅变化、提升/降级、时间片、缓冲高水位、resync、cursor 不连续、网络错误、重试和协议错误。不得记录正常轮转、每个 ping/pong 或每个 data 帧，避免日志窗口刷屏。

新增指标至少包括：浏览器物理连接数、当前 Fast/Queue 成员数、队列轮次耗时、每 pane 等待时长、target cursor 追平率、缓冲高水位、resync 次数、handoff 耗时、真实断线率和浏览器主线程长任务。指标不得携带终端内容、账号 scope 或命令文本。

## 8. 执行计划

当前进度：阶段 0 至阶段 3 及 [初始化状态机修复方案](WEBSOCKET_INITIALIZATION_STATE_MACHINE_REPAIR_PLAN.md) 已实现。浏览器由单一 controller 严格推进 `Fast -> Queue`，每个 Queue pane 启动任务都有有限结算；现阶段进入阶段 4 的目标设备验收。普通容器继续保持 persistent agent 零改动、浏览器 `1 Fast + 1 Queue`、无 HTTP 轮询与无周期性 pane WebSocket 重建；`client:` 独立目标仍使用兼容的直连调度。

### 阶段 0：冻结契约与验收基线

状态：已完成首版协议与自动化验收基线；真实设备改造前后的性能基线仍需在阶段 4 补录。

1. 将本文作为设计基线，并补充一份精确的 queue wire protocol spec。
2. 记录当前三条 pane 专属连接租约实现的断线率、连接峰值、CPU、内存和长任务基线。
3. 明确兼容版本、灰度范围和回退方式。回退必须回到当前“三条 pane 专属连接”的调度器，不能回到无限连接。
4. 先确认现有 agent attach 的 live 输出 cursor 推导、history trim、多个 attach、resize 和 detach 行为，再开始编码。

完成标准：协议字段、状态机、错误码、缓冲上限、时间片初值和测试矩阵经过评审；明确 persistent agent 零改动。

### 阶段 1：Provider 队列 relay

状态：已完成首版。实现位于 `terminal_queue.go`，现有 persistent agent 协议和生命周期未修改。

1. 新增独立 Queue WebSocket 端点，不改变现有单 pane `/ws` 的兼容行为。
2. 实现鉴权、完整身份校验、订阅原子替换、一个 pane 一个内部 attach、持续 drain 和有界缓冲。
3. 将 agent 的 replay 控制帧与二进制帧封装成 versioned queue frame，建立 stream/channel generation 和绝对 cursor 记录。
4. 实现按 pane 公平轮转、固定 target cursor、时间/字节预算和单 pane 独立错误隔离。
5. 实现过载 `resync-required`：不连续流不得直接送浏览器，必须走 delta 或 snapshot 恢复。

完成标准：Provider 单元和集成测试覆盖 12 个逻辑 pane、一个持续输出 pane、history trim、内部 attach 失败、队列连接断开、重连和账号/workspace 隔离；不修改 `agent.go` 中 persistent agent 逻辑。

### 阶段 2：浏览器 1 Fast + 1 Queue 调度器

状态：已实施页面级 transport 版本。实现位于 `runtime/static/terminal_connection_scheduler.js`、`terminal_queue_connection.js`、`terminal_topology_controller.js`、Provider `terminal_queue.go` 和 `main.js`。

1. 将现有最多 3 个 pane 专属租约改造为 1 个稳定 `fast` transport 加 1 个稳定 `queue` transport，两条物理连接均按页面 target 生命周期管理。
2. 调度器按 `Fast -> Queue` 的物理顺序启动。Fast 先完成逻辑启动；Fast 物理 socket 确认 `OPEN`、逻辑 replay ready 且存在其他 pane 后，才创建 Queue WebSocket和发送 `replace-subscriptions`。后台 pane 的 Canvas 首帧不阻塞 Queue；当前工作区只有一个 pane 时永远不创建 Queue。
3. 当前 tab 布局变化、焦点、输入和 tab 切换只驱动两条 transport 的逻辑绑定变化，而非创建或销毁物理连接。
4. 将 Queue frame 路由到对应 session，并让每个 pane 独立维护 `stream_id`、`channel_generation` 和已应用 cursor。
5. 队列数据走 `writeReplay()`/受控 flush，轮次完成再请求最终 full render；高速数据保持现有实时写入路径。
6. 保持 Cache API v2、输入锁、last-known-good canvas、连接状态点和调试日志语义。

完成标准：跨多个 tab 的 12 pane 场景中，普通容器浏览器 Network 面板稳定不超过 2 条终端 WebSocket；非 Fast pane 不经点击也持续初始化并显示新内容；切 tab 不触发两条物理连接重建。

### 阶段 3：可靠交接与压力保护

状态：已完成首版自动化路径，包括 generation 栅栏、cursor 连续性、per-pane 缓冲、过载重同步、关闭确认和 Queue 时间片延迟渲染；真实 ANSI/TUI/Kitty 和慢设备压力仍属于阶段 4 验收。

1. 实现 Queue <-> Fast 的 cursor handoff、generation 栅栏、迟到帧丢弃、delta/current/snapshot 三分支和输入解锁时序。
2. 实现 per-pane 有界缓冲、确认回收、过载重同步和 history trim 回退。
3. 验证连续输出、ANSI/UTF-8/Kitty 跨帧、窗口 resize、tab 切换、浏览器后台/前台、离线/在线和 Provider 重启。
4. 对慢设备设置渲染合并策略，防止 Queue 轮转本身制造主线程渲染风暴。

完成标准：任一切换、积压或重连下不发生双写、字节乱序、cursor 倒退、终端状态损坏、输入误投递或任务中断。

### 阶段 4：灰度与验收

状态：待执行。当前实现尚未提交或推送，也未形成发布包；先在本地和目标设备完成验证，再决定发布范围。

1. 先在出现集中断连的目标手机/WebView 小范围安装验证；出现 cursor/协议一致性错误时回退到三条 pane 专属连接版本。
2. 对比 3 个、4 个、12 个 pane；纯文本高频输出、Codex/TUI、ANSI、Kitty Graphics、空闲和后台恢复场景。
3. 记录断线率、连接数、队列 pane 新内容可见延迟、首次/切换追平耗时、CPU、内存和长任务。
4. 达到验收门槛后逐步扩大范围；任何 cursor/协议一致性错误立即停止扩大并回退到三条专属连接模式。

完成标准：真实设备证明浏览器连接稳定不超过 3 条，用户无需点击队列 pane 即可看到更新，且后台任务与终端历史未受影响。

## 9. 自动化与人工验收矩阵

自动化必须至少覆盖：

- 物理 WebSocket 上限始终为 3；`CONNECTING`、`OPEN`、`CLOSING` 都计入容量。
- 两个高速 pane 与 N 个队列 pane 的 LRU 提升/降级、公平轮转和 tab 切换订阅替换。
- 一个队列 pane 永久高频输出时，其他 queue pane 仍在可接受轮次内获得数据。
- agent replay 的 snapshot、delta、current，cursor 连续、history trim、late frame、generation 不匹配和 internal attach 失败。
- Queue 断线只重连一条物理连接；单 pane 错误不拖垮其他 pane。
- Fast/Queue handoff 期间无并行写入、无重复写入、输入只在高速 replay ready 后发送。
- 离线、后台、恢复、resize、Cache API v2、last-known-good canvas、ANSI/UTF-8/Kitty Graphics 和账号隔离。

人工真机验收至少覆盖 Android WebView、Lazycat WKWebView、桌面浏览器，以及一个容易复现多连接失败的设备。重点观察 12 分屏下的内容新鲜度、点击提升速度、滚动和输入响应、连接状态点、调试日志可读性和后台任务连续性。

## 10. 发布前不变量

1. 普通容器浏览器终端物理 WebSocket 不超过 2 条：最多 1 Fast + 1 Queue。
2. **首次创建 Queue 前，唯一 Fast 必须完成启动 generation 的 replay 和最终呈现；不得提前创建 Queue broker、提交首个 Queue 订阅或启动 Queue 本地缓存任务。运行中的 Queue 不得因普通输出、一次 render pending 或 Fast 逻辑绑定替换而关闭。**
3. persistent agent 持续维护全部会话；本方案不修改 agent。
4. Provider 必须持续 drain 队列 pane 的内部输出，不能让队列调度反压 PTY。
5. 一个 pane 在浏览器端任意时刻只能有一个有效通道 generation 写入 Ghostty。
6. 原始终端字节只可按连续 cursor 交付；过载必须重同步，不能截断后续传。
7. Queue 可服务所有 tab 的逻辑 pane；后台 tab 按队列顺序初始化，不得因为未被点击而永久停留在黑屏。
8. 当前交互 pane 必须优先升入 Fast；输入不进入共享队列等待。
9. 任何队列、缓冲或重连失败都不得停止后台任务，且必须保留可诊断错误状态。
