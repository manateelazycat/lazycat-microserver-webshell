# WebShell 单物理长连接统一复用执行方案与计划

状态：阶段 0 已完成，阶段 1 已完成首批 Provider 能力，阶段 2 已完成浏览器 Unified logical registry 和 Fast/Queue logical topology 退役；阶段 3 已完成首批物理健康检查与生命周期恢复

最后更新：2026-08-28

## 1. 文档结论

WebShell 终端传输统一为一条页面级物理 WebSocket。页面内全部 tab、pane 和会话始终作为独立逻辑流挂载在该连接上，持续接收实时输出并更新各自终端模型；只有当前 tab 的可见 pane 执行实时 Canvas 绘制，后台 tab 不做持续 Canvas presentation。

目标模型：

```text
一个 WebShell 页面 / 当前 target
  -> 1 条 Unified Terminal WebSocket
       -> pane-1 logical stream
       -> pane-2 logical stream
       -> pane-3 logical stream
       -> ...
```

当前活动 pane 只有输入和发送调度优先级差异，不再拥有独立 Fast 物理连接。tab 切换、pane 聚焦和分屏切换不得创建、关闭或替换物理 WebSocket，也不得执行 Fast/Queue logical handoff。

本方案保留每个 pane 必需的身份、generation、cursor、sequence、历史恢复和错误隔离状态；删除的是 Fast/Queue 两套物理角色、抢占、提升、启动门禁和交接状态，不是删除逻辑流的一致性保护。

## 2. 当前基线与改造动机

### 2.1 当前实现

普通容器当前使用页面级 `1 Unified`：

```text
Unified physical WebSocket
  -> 全 workspace pane logical membership
  -> 每 pane 独立 generation/cursor/retry/resync
  -> active pane 只更新 priority
```

浏览器已删除 Fast slot、promotion、Queue gate、startup FIFO 和 topology controller。现有 Unified wire path 继续具备：

- `replace-subscriptions` 原子同步逻辑成员；
- 每 pane 的 `stream_id` 和 `channel_generation`；
- `LCQ1` binary envelope；
- 每 pane history generation、绝对 cursor、sequence 和 checksum 校验；
- Provider 为每个 pane 持续 drain 上游 agent attach；
- 有界缓冲、公平时间片、`queue-turn-complete` 和 ACK；
- 单 pane `resync_required` 与独立恢复；
- Cache v2、history delta/snapshot 和最终 presentation commit；
- Queue 物理连接保活及独立退避。

当前剩余复杂度主要集中在：

- subscription revision ACK 和 stale revision fencing 尚未完成；
- per-pane credit 和明确控制帧优先级尚未完成；
- 后台 pane 模型持续更新与 Canvas presentation 抑制仍需最终验收；
- `client:` target 仍保留最多三条独立直连兼容；
- 12/32 pane、折叠屏、弱网和高输出压力验收尚未完成。

### 2.2 最终决策

不再限制“同时实时同步的逻辑会话数”。所有会话保持实时逻辑流，只限制浏览器到 Provider 的终端物理 WebSocket 数量为 1。

不采用“仅当前 tab 订阅、切 tab 后重新订阅”的方案，原因是它会新增后台暂停、切换追平、订阅 revision 和可见性恢复状态。统一全实时流更接近早期“一 pane 一 WebSocket”的行为，但把浏览器物理连接合并为一条，逻辑更稳定、迁移更直接。

### 2.3 必须区分的四层实时性

```text
服务端 PTY 实时运行和 drain
  -> 全部 pane 必须保持

浏览器传输实时接收
  -> 全部 pane 必须保持

Ghostty 终端模型实时解析和更新
  -> 全部 pane 必须保持

Canvas 实时绘制和 presentation
  -> 仅当前 tab 可见 pane 保持
```

后台 tab 不绘制不等于暂停其会话、丢弃输出或停止解析。切换到后台 tab 时，应基于已经更新到最新状态的 Ghostty 模型执行一次 full render，不得展示历史回放过程。

## 3. 目标、非目标与硬性边界

### 3.1 预期目标

1. 一个 WebShell 页面针对当前 target 任意时刻最多只有 1 条终端物理 WebSocket，包括 `CONNECTING`、`OPEN` 和 `CLOSING` 状态。
2. 页面内所有有效 pane 持续实时同步，不因所在 tab 不可见而停止 Provider drain、浏览器传输或终端模型更新。
3. 三分屏及更多分屏不需要抢占连接；每个可见 pane 都持续更新。
4. tab 切换和 pane 聚焦只改变 UI 可见性、输入 owner 和可选调度优先级，不改变连接或逻辑流 generation。
5. 折叠屏展开/收起只触发 viewport、geometry 和 presentation 流程；纯 resize 不触发 transport recovery。
6. 物理连接断开时只运行一个连接级退避；重连后一次恢复所有 logical stream，每 pane 独立按 cursor 续传或 resync。
7. 任意单 pane 的 cursor gap、历史 trim、缓冲过载、attach 失败或 render 失败不得关闭统一物理连接，也不得影响其他 pane。
8. 后台 tab 不持续绘制 Canvas，避免连接统一后将资源压力从 WebSocket 转移为无界渲染压力。
9. 全过程继续使用 persistent Agent/PTY、Ghostty Web、Cache v2 和现有 history 权威模型。

### 3.2 非目标

- 不引入 `tmux`。
- 不引入或迁移到 `xterm.js`。
- 不修改 persistent Agent 的 PTY 生命周期和会话权威职责。
- 不把 HTTP 轮询、定时 attach 或周期性重连作为实时同步机制。
- 不通过清屏、销毁 Terminal、重建 PTY 或展示历史快速滚动掩盖恢复过程。
- 不在本阶段合并 Provider 到 Agent 的内部 attach；浏览器一条物理连接不等于 Provider 只维护一个上游 pane attach。
- 不让 tab 可见性成为服务端任务运行与否的依据。
- 不保证跨不同 target、不同账号 scope 或不同 Provider 的连接物理复用。target 或鉴权上下文改变时必须重建统一连接。

### 3.3 不可破坏的正确性边界

- 同一 pane 任一时刻只有一个有效 logical stream generation 可以写入对应 Ghostty session。
- 每个 binary frame 必须验证账号 scope、workspace、tab、pane、stream、channel generation、history generation、sequence、cursor 和 checksum。
- raw PTY 字节不连续时不得截断后继续解析；必须对该 pane 执行 delta 或 snapshot resync。
- replay、Cache warm restore、snapshot、resize settle 和断线追平期间不得渲染中间历史过程。
- 用户输入不能因重连被自动重复发送。除非后续实现服务端输入 ACK 和幂等 ID，否则连接状态不确定时沿用现有 at-most-once 边界。
- generated response、resize、theme、input lock 和普通用户输入必须按 pane 精确路由。
- 后台 pane 即使不绘制，也必须继续解析终端输出，以便生成必要的终端设备响应并保持模型状态正确。

## 4. 目标架构

### 4.1 总体数据流

```text
Browser page
  UnifiedTerminalConnection
    physical state: idle / connecting / open / backing_off / closed
    connection epoch
    logical stream registry
      pane-1 -> generation/cursor/sequence/output queue
      pane-2 -> generation/cursor/sequence/output queue
      pane-n -> generation/cursor/sequence/output queue
                 |
                 v
      /ws?transport_role=unified&protocol_version=2
                 |
                 v
Provider unified broker
  control/input priority queue
  fair pane output scheduler
  per-pane bounded buffer and credit
    pane-1 -> existing persistent-agent attach
    pane-2 -> existing persistent-agent attach
    pane-n -> existing persistent-agent attach
                 |
                 v
Persistent Agent
  PTY + process + history + authoritative cursor
```

### 4.2 单一物理连接所有者

浏览器只允许一个模块拥有终端物理 WebSocket：`UnifiedTerminalConnection`。它负责：

- 建立、关闭和重连唯一物理连接；
- 维护 connection epoch；
- 原子同步整个 workspace 的 logical stream 集合；
- 路由 binary 和 pane control；
- 连接级 ping/pong、退避和恢复；
- 暴露稳定的物理状态和指标；
- 在旧 socket 真实 close 前禁止创建替代 socket。

pane session、tab activation、resize observer、focus、visibility 和 renderer 不得直接创建、关闭或恢复物理 WebSocket，只能向统一连接上报逻辑状态或发送 pane control。

### 4.3 Logical stream 生命周期

只有以下事件允许增删 logical stream：

- workspace 初次加载；
- 创建 pane；
- 关闭 pane；
- 删除 tab；
- 服务端 workspace generation 改变；
- target 或账号 scope 改变；
- 统一连接重连后恢复完整集合。

以下事件不得增删 logical stream：

- tab 切换；
- pane 聚焦；
- pointerdown、focusin 或键盘输入；
- resize、orientationchange 或 visualViewport 变化；
- Canvas render pending；
- page visibility 在同一 JS context 内切换；
- 单 pane output 暂时落后。

`replace-subscriptions` 可以继续作为完整集合的原子同步协议，但不再因 tab 切换调用。实现应增加单调递增的 subscription revision；Provider 只接受当前连接 epoch 内的新 revision，旧 revision 的异步结果不得覆盖新集合。

### 4.4 调度优先级

全部 stream 始终实时，优先级只决定公平轮转顺序，不决定是否订阅：

```text
P0  用户输入、generated response、resize、ACK、ping/pong 等控制帧
P1  当前获得键盘输入的 pane 输出
P2  当前 tab 其他可见 pane 输出
P3  后台 tab pane 输出
```

优先级变化不得生成新 stream、推进 channel generation 或清空输出队列。没有优先级提示时，Provider 必须退化为所有 pane 公平轮转，不能停止任何 pane。

为避免单 pane 独占单条 WebSocket：

- 协议允许的单个 binary frame 上限继续遵守现有 flow-control 契约；
- live 调度初始建议每 pane 每轮最多 64 KiB 或 4ms，以先到者为准；
- 超过预算后立刻轮到下一个可发送 pane；
- 当前活动 pane 可以获得更高权重，但不能无限连续发送；
- 控制帧必须在下一个 binary chunk 边界前获得发送机会；
- 所有预算必须可配置并通过真机数据调整。

### 4.5 前端解析和绘制

统一连接收到 binary 后只执行校验、分流和入队，不在 WebSocket message callback 中执行无界 Ghostty parse 或 Canvas render。

每 pane 保持现有 byte、entry 和 time budget drain：

```text
frame validate
  -> pane output queue
  -> bounded Ghostty write/writeReplay
  -> model cursor commit
  -> transport ACK/credit
  -> visible pane: RAF 合并 render
  -> hidden pane: 保持 presentation suppressed
```

后台 pane 的模型更新不得触发持续 Canvas backing-store 分配、preview 捕获或 full render。切换 tab 时：

1. 保留目标 pane 身份匹配的 last-known-good frame；
2. 确认该 pane 输出 drain 已追到当前已接收边界；
3. 对当前模型执行一次最终 full render；
4. 验证 geometry、history generation、cursor 和 render generation；
5. 原子 presentation commit；
6. 不展示任何历史解析或中间 Canvas。

如果浏览器后台节流导致输出积压，恢复后仍按有界批次更新模型，并在最终追平后一次呈现，不能为了“实时”在前台展示追赶过程。

### 4.6 Resize 与折叠屏规则

- 只有当前 tab 可见且可测量的 pane参与实时 geometry 测量和 resize claim。
- 后台 tab 保留最后确认的 PTY geometry；输出仍按该 geometry 解析。
- 折叠屏展开、收起、方向变化和 visualViewport.resize 只更新 latest geometry target。
- 每 pane继续保持单 in-flight resize 和 latest pending target。
- resize ACK、settle 和 full render 期间保留 last-known-good frame。
- 纯 viewport 变化不得调用 transport invalidation、关闭统一 socket或推进 connection epoch。
- 只有真实 socket close/error、鉴权失效、target 改变或明确网络离线才允许进入 transport recovery。
- `pageshow`、`visibilitychange` 和 focus 恢复最多执行 socket probe；socket 健康时不能重建连接。

### 4.7 物理断线恢复

统一物理连接断开时：

1. 记录一次 connection-level failure；
2. 所有 session 保留 Ghostty 模型、Canvas、last-known-good frame 和已应用 cursor；
3. 不清屏、不重建 Terminal、不逐 pane 建立浏览器 WebSocket；
4. 只启动一个带抖动的指数退避；
5. 新 socket 必须等待旧 socket 真实 close；
6. 新连接建立后发送带 subscription revision 的完整 stream 集合；
7. 每 pane携带最后已应用的 history generation/cursor/sequence；
8. Provider 分别返回 current、delta 或 snapshot；
9. 单 pane gap 只重同步该 pane；
10. 每 pane完成连续性校验和最终 full render 后独立恢复 presentation/input 状态。

统一连接是一个物理故障域，但不是一个逻辑恢复故障域。一个 pane 恢复失败不得阻塞其余 pane，也不得让整个连接反复关闭。

## 5. Unified 协议调整

### 5.1 协议演进原则

优先扩展现有 Queue 协议，不重新发明另一套 envelope：

- 保留 `replace-subscriptions`、`pane-control`、`LCQ1`、`queue-turn-complete` 和现有 cursor/generation 字段；
- 将 transport role 从 `queue`/`fast` 收敛为 versioned `unified`；
- Queue broker 从“后台输出通道”升级为“全 pane 双向终端 broker”；
- 新旧客户端通过 capability/protocol version 明确协商，不依赖猜测；
- 灰度期间服务端继续兼容 `1 Fast + 1 Queue`，但同一页面实例只能运行一种 topology。

### 5.2 浏览器到 Provider

至少支持：

- `client-hello`：协议版本、能力、workspace identity 和恢复信息；
- `replace-subscriptions`：当前 workspace 全部 pane 的原子集合；
- `pane-input`：普通用户输入，包含 pane/stream/generation 和可选 input sequence；
- `pane-control`：generated input、resize、theme、input lock、pane ping；
- `set-priority`：可选活动 pane/当前 tab 调度提示，不改变订阅；
- `turn-ack`/`credit-update`：确认已按序进入 Ghostty 的 cursor/sequence；
- `connection-ping`：统一物理连接健康检查。

Provider 必须对 `pane-input` 重做账号、workspace、pane、stream 和 generation 校验。不能因为输入来自同一物理连接就信任 pane ID。

同一 pane 的普通输入和 generated response 必须经过该 pane 的串行上游 writer，避免并发写 agent attach 造成字节交错。WebSocket 异常关闭后不得自动重发状态不确定的用户输入。

### 5.3 Provider 到浏览器

至少支持：

- `server-hello`/`unified-ready`：协商结果和 connection epoch；
- `subscriptions-applied`：已生效 revision 和每 pane 状态；
- `pane-control`：现有 history、resize、process、health 和错误控制帧；
- `LCQ1` binary：显式 pane/stream/generation/cursor/sequence/checksum；
- `queue-turn-complete`：该 pane 本轮边界；
- `resync-required`：仅影响指定 pane；
- `connection-error`：仅用于真实物理或协议级故障。

普通调度拥塞、pane 等待轮次、后台不绘制和 tab 切换都不是 connection error，不得显示为 reconnecting。

### 5.4 能力与兼容

建议能力位：

```text
unified_transport_v2
bidirectional_pane_input
per_pane_credit
per_pane_resync
priority_hint
subscription_revision
```

迁移顺序先覆盖普通容器 target。`client:` target 需要确认其路由和上游 attach 是否支持同一 broker；不支持时可以在灰度阶段使用旧直连 fallback，但最终完成标准是每个支持的当前 target 都只有一条终端物理连接。不得把 fallback 静默伪装成 unified 成功。

## 6. 浏览器模块改造

### 6.1 新增统一连接模块

当前版本化模块：

```text
runtime/static/terminal_unified_connection.js
runtime/static/terminal_unified_membership.js
```

模块职责仅包括：

- 单物理 WebSocket；
- logical stream registry；
- envelope encode/decode；
- subscription revision；
- pane routing；
- physical reconnect/backoff；
- ping/pong；
- flow control/credit；
- snapshot 和指标。

不得把 tab DOM、Ghostty presentation、workspace mutation 或 resize 测量直接耦合进该模块。

### 6.2 main.js 集成边界

`main.js` 负责把 workspace pane 映射为 logical stream descriptor，并处理对应 session 数据。它不再维护：

- `terminalFastConnections`；
- `terminalFastPhysicalReadyStates`；
- Fast slot/attempt/lease；
- Queue 物理连接与 Fast 物理连接的启动顺序；
- Queue -> Fast promotion；
- Fast -> Queue handoff；
- 因 Fast 缺失触发的 page-wide topology recovery。

保留并复用：

- session identity 和 channel generation 校验；
- Cache v2；
- output drain 和 replay suppression；
- resize fence；
- last-known-good frame；
- input queue 的 generation fencing；
- per-pane retry/resync 状态；
- terminal network monitor。

### 6.3 旧模块退役结果

基础手动验收通过后已完成普通容器旧 logical topology 退役，不再保留页面运行时 feature flag 双实例化：

```text
普通容器
  -> UnifiedTerminalConnection + UnifiedMembership

client: target
  -> 独立 direct scheduler 兼容路径
```

已删除或收敛：

- `terminal_connection_scheduler.js` 仅由 `client:` target 懒创建，不参与普通容器；
- 删除 `terminal_topology_controller.js` 及其 Fast/Queue topology 测试；
- `terminal_queue_connection.js` 删除 Queue gate、startup FIFO/latch，只作为 Unified 复用的 versioned LCQ1 wire implementation；
- `main.js` 删除 Fast 物理状态、Queue gate、promotion 和 topology reset；
- Network Monitor 删除 Fast/Queue 双通道布局，只保留 Unified 单槽和 client direct 三槽。

Provider 继续兼容旧 Queue/Fast role，避免旧客户端在升级窗口内失效；浏览器普通容器不再请求或实例化这些角色。

## 7. Provider 改造

### 7.1 Broker 双向化

以现有 `terminal_queue.go` 为基础：

1. 新增 unified transport role 和能力协商；
2. 允许当前活动 pane 及全部其他 pane 同时订阅；
3. 增加经过身份校验的普通 `pane-input`；
4. 为每 pane 串行化普通输入、generated response 和其他上游控制；
5. 保留每 pane 独立 attach、持续 drain、有界缓冲和 cursor；
6. 控制/输入优先队列与 pane output 公平调度分离；
7. 增加 priority hint，但优先级不能成为暂停条件；
8. 单 pane失败只移除/恢复该 stream，不关闭统一 WebSocket；
9. 连接关闭时释放 Provider 浏览器订阅和内部 attach，不销毁 Agent PTY/history。

### 7.2 公平性与背压

必须覆盖：

- 一个 pane持续高速输出时，其他 pane 仍获得有界发送机会；
- 用户输入和 resize ACK 不被大 binary frame 长时间阻塞；
- Provider 每 pane buffer 和总 buffer 均有硬上限；
- soft watermark 优先通过 credit/pause 降速；
- hard limit 只对对应 pane触发 `resync-required`；
- 不允许截断 ESC、CSI、UTF-8 或 Kitty 数据后继续发送；
- WebSocket 写失败只计一次物理失败；
- 任何 goroutine 不得绕过单一 socket writer 并发写 WebSocket。

### 7.3 鉴权与隔离

- 统一连接只能订阅当前账号和 workspace 可见的 pane；
- `replace-subscriptions` 中任一非法成员不能导致其他合法成员身份降级；
- 输入必须重新验证 pane 仍存在且属于当前 workspace generation；
- target 改变、登出、账号切换或 workspace 失效必须关闭旧 unified connection；
- 日志和指标不得记录终端内容、命令、token、cookie 或完整账号 scope。

## 8. 执行计划

### 阶段 0：冻结契约与建立基线

状态：已完成第一批契约冻结和自动化基线

任务：

- [x] 将本文作为统一连接设计基线，评审协议字段和状态机。
- [ ] 记录现有 `1 Fast + 1 Queue` 的连接数、输入延迟、输出等待、CPU、内存、长任务、resync 和折叠恢复数据。
- [ ] 增加 Network Monitor 的逻辑 stream 数、每 pane吞吐、调度等待和 hidden render 次数。
- [ ] 明确普通容器和 `client:` target 的 capability/fallback 矩阵。
- [ ] 冻结 feature flag、灰度和回退规则。
- [x] 为“纯 resize 不重连”和“tab 切换不创建第二条物理 socket”建立自动化 guard。

完成标准：协议、兼容、指标、回退和测试矩阵通过评审；所有性能结论有改造前基线。

### 阶段 1：Provider Unified Broker

状态：已完成 unified role、普通输入、优先级提示和全 workspace pane订阅；subscription revision、credit 和完整 broker fencing 待继续

任务：

- [x] 在现有 Queue broker 上新增 `unified` transport role，复用当前 versioned envelope。
- [x] 实现全 workspace pane订阅，不区分 Fast/Queue 成员。
- [x] 实现普通 `pane-input`/`pane-control` 输入和 per-pane 串行 writer。
- [ ] 实现控制优先、活动 pane加权和其他 pane公平轮转。
- [x] 保留现有 per-pane turn ACK、buffer、cursor、sequence 和 resync。
- [ ] 实现 subscription revision ACK 和旧 revision fencing。
- [x] 增加统一连接级 ping/pong、close fence，并复用现有退避控制语义。
- [x] 保持旧 Queue/Fast 协议兼容，普通容器默认请求 unified role。

完成标准：Provider 测试可在一条 WebSocket 上同时运行至少 32 个 pane，三个持续输出 pane无饥饿，普通输入准确进入指定 PTY，单 pane失败不影响其他 pane。

### 阶段 2：浏览器 Unified Connection

状态：已完成单物理连接、全 pane logical registry 和 Fast/Queue 逻辑状态退役；subscription revision 待继续

任务：

- [x] 新增 `terminal_unified_connection.js` 及独立 Node 行为测试。
- [x] 复用经验证的单物理 socket 状态机、真实 close fence 和 keep-alive。
- [x] 实现全 pane logical registry 和 envelope 路由；subscription revision 待阶段 1 fencing 一并完成。
- [x] 将普通输入、generated response、resize、theme、ping 和 output 接入 unified stream。
- [x] 复用现有有界 output drain、turn ACK、cursor 和 generation gate。
- [x] 保证 tab 切换、pane 聚焦和分屏调整不修改 logical membership。
- [x] Network Monitor 在 unified 模式只显示一个物理通道。
- [x] Service Worker 增加新版本化模块资源；旧客户端缓存不能加载半套协议。

完成标准：feature flag 开启时，任意 tab/pane 数量下浏览器始终只有一条终端物理 WebSocket；所有 pane 持续收到并解析实时输出。

### 阶段 3：后台绘制抑制与折叠恢复

状态：首批物理健康检查与生命周期恢复已完成；后台绘制抑制和真机折叠验收待继续

任务：

- [ ] 全部 pane实时更新 Ghostty 模型，后台 tab 禁止持续 Canvas presentation。
- [ ] tab 激活后从当前模型执行一次最终 full render，禁止展示追赶过程。
- [ ] resize observer 只处理当前 tab 可见 pane，后台 pane保留最后 geometry。
- [x] orientationchange、visualViewport.resize、visibilitychange 和 pageshow 不再因 Fast 缺失升级为全 topology reset。
- [x] 删除 lifecycle 恢复事件触发“Fast 不可用即 page-wide topology reset”的路径。
- [x] socket 健康时页面恢复只 probe；不可用时只重试唯一 Unified owner。
- [ ] 断线时保留所有 last-known-good frame，并按 pane独立完成恢复 presentation。
- [x] 增加 WebView context 重建与同 context fold resize 两类诊断。
- [x] 增加 Unified 物理 watchdog：4 秒检查、物理 ping/pong、半开超时、CONNECTING/CLOSING 超时和单 owner 关闭去重。
- [x] 物理 error/close 先通知 Unified owner，再通知 logical pane；立即恢复清除 scheduler backoff，旧 socket 通过真实 close fence 后才允许替代连接。
- [x] 冷启动在 logical stream 建立物理 socket 前不启动 watchdog，避免将正常初始 CLOSED 误判为故障。
- [x] 修复新 tab/分屏 logical close 路径使用未定义物理 connection 导致 lease 卡死和后续 pane 黑屏的问题。

完成标准：折叠屏连续展开/收起不触发健康 socket 重建；被宿主强制关闭时只重连一条 socket；4 秒内检查 Unified 物理状态；异常 error/close 立即进入唯一恢复流程；健康 OPEN + pong 不重试；冷启动首帧不因 watchdog 自杀；创建 tab/pane 后 logical handoff 不抛异常且新 pane 可输入。

### 阶段 4：灰度切流与旧拓扑退役

状态：普通容器默认 Unified 和旧逻辑 topology 退役已完成；灰度、`client:` 适配和稳定观察期待继续

任务：

- [ ] 开发/调试模式默认开启 unified，保留运行时一键回退。
- [ ] 按设备、Provider capability 和用户比例灰度。
- [ ] 对比连接数、输入延迟、调度等待、长任务、CPU、内存、断线率和 resync 率。
- [x] 普通容器默认停止创建独立 Fast/Queue 物理 transport，只创建 Unified transport。
- [ ] 完成 `client:` target unified 适配，或明确阻塞原因和临时 fallback 可见提示。
- [x] 删除 Fast slot、promotion、Fast -> Queue gate 和双物理恢复状态。
- [x] 更新 Network Monitor、现有设计文档和 `docs/FIX_HISTORY.md`。
- [ ] 清理旧 feature flag 前完成至少一个稳定版本观察期。

完成标准：默认路径不再实例化 Fast/Queue topology；目标环境稳定运行；回退窗口结束后旧状态机和无用静态资源被删除。

### 阶段 5：压力验收与收尾

状态：未开始

任务：

- [ ] 1、3、12、32 pane 的空闲、普通输出和持续高输出测试。
- [ ] 多 tab、多分屏、快速切换、连续输入和同时 resize。
- [ ] 断网、弱网、网络切换、WebSocket close、Provider 重启和 Agent history trim。
- [ ] 折叠屏至少连续 20 次展开/收起，覆盖前台、后台和锁屏恢复。
- [ ] Android WebView、鸿蒙 WebView、Lazycat WebView 和桌面浏览器验收。
- [ ] pi、Codex、Claude、Opencode 等 fullscreen TUI 及普通 shell 验收。
- [ ] 长时间 Agent 输出、合法全黑终端、alternate screen、Kitty Graphics 和大块 Unicode 输出。
- [x] 完整 Go/Node 测试、race 测试、语法检查、静态资源和 LPK 打包校验。

完成标准：全部自动化 guard、压力场景和目标设备验收通过，预期指标达标，无永久黑屏、输入错投、重复输入、串流、丢字节或历史回放可见。

## 9. 自动化测试计划

### 9.1 Provider 测试

- 一个 unified WebSocket 同时注册 1、3、12、32 个 logical stream；
- 所有 pane持续输出时按权重公平轮转且无饥饿；
- 单 pane大块输出不阻塞其他 pane输入和控制帧；
- 普通输入、generated response、resize 和 theme 路由到正确 pane；
- 非法 workspace/pane/generation 输入被拒绝；
- subscription revision 乱序、重复和 stale frame 被忽略；
- per-pane buffer soft/hard limit 和 credit pause/resume；
- 单 pane cursor gap/trim/attach failure 只触发该 pane resync；
- socket writer 单所有者，无并发 WebSocket write；
- unified disconnect 释放内部 attach但不销毁 Agent PTY/history；
- race detector 覆盖 subscribe、input、output、remove 和 close 并发。

### 9.2 浏览器连接模块测试

- 任意 logical stream 数量只有一个物理 WebSocket；
- `CONNECTING`、`CLOSING` 也占用唯一物理槽；
- 旧 socket 真实 close 前不能创建替代 socket；
- tab 切换、focus、resize 和普通 output 不创建或关闭 socket；
- workspace pane增删只更新 subscription revision；
- stale epoch/revision/generation frame 不写入 session；
- per-pane cursor、sequence 和 checksum 独立；
- 单 pane resync 不重连物理 socket；
- physical close 只启动一个退避 timer；
- reconnect 使用全部 pane最终已应用 cursor；
- close 期间用户输入不被自动重复发送；
- 网络监视器只统计一个物理通道，binary frame 不重复计数。

### 9.3 Presentation 与生命周期测试

- hidden tab output 更新模型但不持续 render；
- 激活 hidden tab 只展示最终 full render，不展示历史追赶；
- 三分屏三个 pane同时持续更新；
- 快速 tab 切换不会暴露旧 tab Canvas 或中间黑帧；
- orientationchange/visualViewport.resize 不推进 connection epoch；
- pageshow/visibilitychange 在 socket OPEN 时不重连；
- resize ACK 延迟期间保留 last-known-good frame；
- WebView context 重建后从 Cache/history 静默恢复；
- 合法全黑终端不能被误判为未渲染；
- background drain 产生的终端设备响应仍正确发送。

### 9.4 静态回归 Guard

新增 Go 静态 guard，固定：

- 普通容器 unified 模式物理连接容量为 1；
- unified 模式不实例化 Fast scheduler/topology；
- tab、focus、resize 路径不得调用物理 close/invalidate；
- Provider unified 支持 `pane-input` 且执行身份校验；
- hidden pane render suppression 不阻止 Ghostty model write；
- history replay 过程始终不可见；
- Service Worker 同步缓存版本化 unified 模块；
- 禁止引入 `tmux` 和 `xterm.js`。

## 10. 可观测性

### 10.1 连接级指标

- 物理 WebSocket 当前数和峰值；
- connection epoch、open/close/reconnect 次数；
- close code、退避次数和恢复耗时；
- 总收发 bytes/s、累计字节和 WebSocket 写等待；
- subscription revision 和 logical stream 数；
- ping/pong RTT。

### 10.2 Pane 级指标

- output queue bytes/entries/peak；
- 调度等待时间和每轮发送字节；
- Ghostty drain 字节、耗时和让出次数；
- cursor/sequence gap、credit pause 和 resync 次数；
- input enqueue/write 延迟；
- hidden render suppression 次数；
- full render、presentation commit 和 last-known-good 使用次数。

### 10.3 折叠和生命周期诊断

记录但不包含终端内容：

```text
orientationchange
window/visualViewport resize
visibilitychange
pagehide/pageshow + persisted
navigator.onLine
document.wasDiscarded
navigation type
viewport/screen geometry
connection epoch + readyState
subscription revision
resize epoch
presentation transaction
```

诊断必须能区分：纯 viewport resize、socket 被宿主关闭、页面进入 BFCache、WebView/Activity 重建和真正网络离线。

## 11. 验收标准与预期目标

### 11.1 功能目标

- 当前 target 下终端物理 WebSocket 峰值严格为 1。
- 创建/关闭 pane可以更新 logical membership，但不重建健康物理 socket。
- tab 切换、pane 聚焦、输入和分屏调整不改变物理连接。
- 所有 pane持续接收实时输出并更新终端模型。
- 当前 tab 所有可见 pane实时绘制，不要求点击后才更新。
- 后台 tab 不持续 Canvas 绘制；切回后首个可见画面是最新最终状态。
- 单 pane异常不影响其他 pane，不触发物理重连。
- 物理断线后全部 pane可自动恢复，且恢复过程不展示历史回放。

### 11.2 性能目标

以阶段 0 的 `1 Fast + 1 Queue` 真机基线为比较对象：

- 物理终端 WebSocket 数从最多 2 降为 1；
- tab/pane 切换期间物理 open/close 次数降为 0；
- 当前活动 pane输入到本地 echo 的 p95 不劣于基线 20%；
- 三个持续输出 pane均无可观察饥饿；
- 12/32 pane 场景中调度等待有界，单个高输出 pane不能无限占用 writer；
- 后台 tab Canvas render 次数接近 0，仅允许显式 preview、设置变化或激活前最终 render；
- 单次浏览器 output drain 不形成无界长任务；
- Provider 和浏览器缓冲内存均受 per-pane 及 aggregate hard limit 约束；
- unified 模式断线率、resync 率和永久黑屏率不高于基线。

绝对延迟阈值应在阶段 0 根据目标设备和网络环境补充，不能用桌面开发机数据替代移动 WebView 标准。

### 11.3 折叠屏目标

- 同一 JS context 内连续折叠 20 次，健康 unified socket 不因 resize 被重建；
- 宿主强制关闭 socket 时，每次只产生一个替代连接和一个 connection epoch；
- 折叠前所有 pane的 last-known-good frame 均保留；
- 展开/收起后当前 tab 所有可见 pane最终呈现；
- 不出现永久纯黑 Canvas、全部 session 卡在 reconnecting、历史快速滚动或输入写错 pane。

### 11.4 完成定义

以下条件全部满足才算方案完成：

- Provider 和浏览器默认使用 unified transport；
- 普通容器不再创建 Fast 物理连接；
- `client:` target 已支持 unified，或存在经过确认且用户可见的临时兼容边界；
- Fast/Queue promotion 和 topology reset 旧代码完成删除；
- 自动化、race、静态 guard 和目标设备测试通过；
- `docs/FIX_HISTORY.md` 和相关旧计划文档已更新到新基线；
- Network Monitor 和诊断日志能证明物理连接恒为 1；
- 灰度观察期无输入错投、字节串流、历史污染、永久黑屏或不可恢复断线。

## 12. 风险与缓解

### 12.1 单物理故障域

风险：一条 WebSocket 断开会同时中断全部 pane 的浏览器传输。

缓解：连接级单次重试、per-pane cursor 恢复、last-known-good frame、独立 resync，以及禁止单 pane错误关闭物理连接。当前 Queue 已承载大多数 pane，统一不会改变服务端 PTY 的独立性。

### 12.2 WebSocket 全局有序导致队头阻塞

风险：一个 pane的大帧或持续输出阻塞活动 pane。

缓解：控制优先队列、较小 live chunk、每 pane字节/时间预算、加权公平轮转、浏览器有界 drain 和 per-pane credit。

### 12.3 后台模型更新占用 CPU

风险：虽然不绘制 Canvas，但大量后台 pane的 Ghostty 解析仍可能占用主线程。

缓解：有界协作式 drain、批次让出、后台较低调度权重、禁用后台 preview/full render、Provider credit。第一版不暂停逻辑流；只有真实压力数据证明必要时，后续才设计自适应降速，不能重新引入 tab handoff。

### 12.4 输入协议扩展

风险：现有 Queue 普通输入限制被移除后，输入身份或顺序错误会产生严重影响。

缓解：每帧完整鉴权、per-pane 串行 writer、generation fencing、活动 owner 检查、断线不自动重发不确定输入，并增加输入错投/重复压力测试。

### 12.5 灰度期间双 topology 共存

风险：新旧模块同时运行会突破连接上限或双写同一 Terminal。

缓解：页面启动时一次性选择 topology，feature flag 不允许运行中原地切换；切换必须 reload，并由自动化 guard 固定新旧连接所有者互斥。

## 13. 回退方案

灰度期间保留 `1 Fast + 1 Queue` 作为版本级 fallback：

1. 通过启动前 feature flag 选择旧 topology；
2. 不在同一页面运行中从 unified 热切换到旧 topology；
3. 回退必须 reload，先确保 unified socket 真实 close；
4. 服务端协议版本保持向后兼容；
5. 回退不允许恢复早期“一 pane 一物理 WebSocket”的无限连接模式；
6. 回退原因、设备、close code、resync 和性能指标必须记录；
7. 旧 topology 仅在灰度观察期保留，不能成为长期双维护架构。

## 14. 实施后的简化结果

预期删除的状态维度：

```text
Fast physical slot
Fast scheduler capacity/lease
Fast attempt ID
Fast -> Queue bootstrap gate
Queue -> Fast promotion
Fast/Queue handoff
Fast failure page-wide topology reset
Fast/Queue 双物理 close fence
tab/focus 驱动的 transport reconcile
```

继续保留的必要状态：

```text
1 个 physical connection epoch
1 个 subscription revision
N 个 logical stream generation
N 个 history generation/cursor/sequence
N 个 bounded output queue/credit
N 个 presentation/resize transaction
```

最终复杂度与 pane 数量仍然线性相关，因为每个会话必须独立保证身份、顺序和历史正确性；但连接角色、切换和恢复路径从两套收敛为一套，tab 和 pane操作不再参与 transport 生命周期。这是本方案主要的逻辑层收益。
