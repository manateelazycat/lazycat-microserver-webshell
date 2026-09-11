# 终端 Output 真实环境回归

规格：[REQ](../../../spec/terminal/output/REQ.md) · [AC](../../../spec/terminal/output/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/output`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / mobile / multi-device / lifecycle
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、Chrome 和 Ghostty WASM
- 相关模块和源码入口：`runtime/static/terminal/transport/session_protocol_controller.js`、`runtime/static/terminal/output/`、`runtime/static/terminal/rendering/`、`runtime/static/terminal/resize/`、`runtime/static/diagnostics/initialization_performance.js`、`runtime/static/diagnostics/diagnostics_lifecycle.js`、`runtime/static/diagnostics/diagnostics_view.js`

## 触发条件

在真实 WebShell workspace 中，对同一 pane 依次执行普通输出、约 1.5 MiB 大块输出、持续输出期间切换隐藏 tab，以及持续输出期间改变 viewport/resize。测试使用两个独立窗口，并把当前工作区的版本化前端资源映射到页面。

启用 `WEBSHELL_ENABLE_INITIALIZATION_PERFORMANCE=1` 时，测试还会在页面初始化前安装只读 DOM probe 并重新加载两个页面，采集初始化面板从 `collecting` 到 `complete` 的逐帧变化。

## 用户可见问题

历史回放或持续输出期间可能出现首次显示慢、Canvas 中间帧暴露、resize 后黑屏、输出丢失或 Unified physical WebSocket 被重复创建。移动端已确认另一类表现：`history_replay_complete` 和 `replay_output_drained` 均已完成，但初始 presentation 在 `resize_applied` 后没有及时提交；用户聚焦或下一次 resize 触发 full render 后，之前已应用的历史内容才显示。字体族等原子事务还可能出现 hold 模糊；字号/行高和桌面窗口 resize 已迁移到 live Canvas，由场景 10/13 验证。`queue_turn_complete` 还可能触发重复 full render，放大持续输出期间的主线程调度压力。

初始化性能面板当前虽然持续收到采集事件，但 `collecting` snapshot 固定返回空 rows 和 `totalMs=0`，所以只有首个 `presentation_commit_complete` 到达后才一次性显示完整时间线。初始化卡住时用户看不到最后完成步骤、当前等待时长和实时总耗时。

## 预防的回归

- 输出最终到达当前 Ghostty 内存状态。
- replay、resize、隐藏 tab 和恢复期间不暴露不稳定的中间 Canvas。
- output queue 不发生 overload 或 stale output drop。
- 输出压力前后每个页面仍只有一条 Unified physical WebSocket。
- `queue_turn_complete` 不直接启动新的 presentation full render。
- 初始化未完成时，每个已到达事件必须立即追加到面板；最后一行显示当前等待阶段及动态计时。
- `collecting` 状态的总耗时必须随时钟增长；完成后 pending 行消失，时间线和总耗时冻结。
- 渐进刷新 timer 必须在完成、关闭开关、关闭调试模式和 dispose 时清理。

## 修复前基线

- 2026-09-02 真实 `terminal/output` 基线通过，但观察到移动端 `rejected stale resize ACK` warning。该 warning 表示旧 resize ACK 被 generation fence 拒绝，符合旧 ACK 不得覆盖新 geometry 的安全语义，不应作为测试失败。
- 基线测试覆盖约 1.5 MiB 实时输出，不覆盖初始打开时的 350KB 历史 replay，也不直接统计 `queue_turn_complete` 与 full render 的关联。
- 基线的 presentation observer 在终端已经打开后启动，不能证明首次 replay 阶段的用户可见 Canvas commit 次数为零。
- 2026-09-04 初始化性能渐进渲染修复前基线按预期失败，命令为 `HEADLESS=1 WEBSHELL_ENABLE_INITIALIZATION_PERFORMANCE=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/runtime/static" node spec-tests/run-playwright.mjs spec-tests/terminal/output/test.mjs`，产物为 `artifacts/2026-09-04T07-49-30-748Z/`。desktop probe 在约 2249.5ms 捕获到 `采集中 / 0.0ms / 0 行`，下一次可见变化已经是约 4876ms 的 `已完成 / 2651ms / 106 行`；不存在任何 progressive pending row，真实断言失败。截图显示最终面板正常，JSONL/terminal timeline 证明采集期间 Provider、Unified 和 replay 事件持续到达，根因边界锁定在 initialization performance snapshot/render。
- `node --test tests/initialization_performance_test.mjs` 修复前同样按预期失败：记录第一条 startup event 后 collecting snapshot 仍没有对应 row。
- 2026-09-04 完整回归 `artifacts/2026-09-04T10-10-58-479Z/` 在输出动作前等待 `data-connection=open` 超时。desktop/mobile active pane 均已 `renderReady=true`、`hasPresentedFrame=true`、`data-connection-retrying=false`，Canvas 非空且 socket 持续收消息；只有应用 resume deadline 留下非权威的 `data-connection=reconnecting`。该失败与输出链路无关，属于过时前置断言。

## 已确认根因

修复前，`session_protocol_controller.js` 在收到 Unified `queue-turn-complete` 后直接调用 `terminalPresentation.ensure()`，可能为每个 queue turn 启动 presentation 检查和 full render。该路径与真实日志中的重复 `full_render_*` 事件相符。

## 实施方案

移除 `queue-turn-complete` 处理中的直接 `terminalPresentation.ensure()` 调用。queue turn 仍由 `terminalOutput.completeQueueTurn()` 校验和 drain；output flush 在实际写入后通过既有的 presentation validation 进行合并调度。保留 queue turn ACK、cursor、channel generation 和错误恢复语义。

P0-1 的本地 Go 实现将相邻 history chunk 合并到有界的 `historyReplayChunk` 后再发送，保留 replay control frame、绝对 cursor、fast integrity sequence 和 replay/live 顺序。该实现需要部署到真实 Provider 后，才能通过 `spec-tests` 验证浏览器实际收到的 frame 数变化。

P0-4 的 hold 修复已将 hold canvas backing 尺寸改为 CSS 尺寸乘当前 renderer DPR，并使用对应 transform 绘制；该修复只处理画质，不改变 presentation 唤醒、resize epoch 或 replay 顺序。

初始化性能渐进渲染方案：collector 在未完成时基于当前 startup metrics、startup events 和进度最领先的 terminal session 构建 live snapshot，追加一条带实时等待时长的 pending 行；独立 diagnostics lifecycle 以有界 interval 驱动总耗时刷新，完成后立即停止。最终首个 presentation commit 仍是唯一冻结边界，不改变业务初始化流程。

当前测试边界调整：初始进入和临时 tab 返回只等待真实 terminal host 可见，不再要求非权威展示属性恰好为 `open`。场景仍必须完成普通输出、约 1.5MiB 输出、隐藏 tab 持续输出和 resize 持续输出，并验证 Canvas 改变、presentation `unsafe=0`、output overload/stale drop 为 0、前后每页只有一条活跃 Unified socket；因此不会把真实输出、渲染或连接故障误判为通过。

## 验证预期

- 普通、1.5MiB、隐藏 tab 和 resize 期间的真实 PTY 输出全部完成。
- presentation `unsafe=0`，Canvas 非空且内容改变，output overload/stale drop 为 0。
- desktop/mobile 前后各只有一条 active Unified socket，初始化性能可选采样完成后冻结。
- API、WebShell asset、console error 和 pageerror 为零。

## 验证结果

2026-09-02 修复后验证：

- `node --test tests/terminal_session_protocol_controller_test.mjs tests/terminal_output_controller_test.mjs tests/terminal_presentation_controller_test.mjs tests/terminal_presentation_view_test.mjs tests/terminal_resize_controller_test.mjs tests/terminal_unified_transport_controller_test.mjs tests/app_runtime_recovery_controller_test.mjs`：相关用例通过。
- `node --test tests/*.mjs`：399 项通过。
- `go test ./...`：通过；新增 Go 测试验证相邻 history chunk 合并后内容顺序保持不变，原有 frame 上限和 fast integrity 测试通过。
- 真实 `terminal/output`：默认 DPR=1 场景通过；`unsafe=0`、`overloads=0`、`staleDrops=0`，desktop/mobile 各保持 1 条 Unified physical WebSocket。本次已额外保存 desktop/mobile `presentation-probe.json`，用于记录目标 pane 的初始状态、live/hold Canvas 尺寸和 DPR；该测试仍不是初始 350KB replay 的专用验收。
- 真实 `terminal/output` 高 DPR 回归：设置 `WEBSHELL_MOBILE_DEVICE_SCALE_FACTOR=3` 后场景通过，mobile live/hold backing ratio 均为 `3`；hold 1x backing 问题的修复已得到真实场景验证。resize hold 与 live/host 的 CSS 尺寸短暂不一致仍待处理。
- 真实测试仍观察到 mobile 的 stale resize ACK warning；旧 ACK 被 generation fence 拒绝，未改变最终 geometry，当前不作为失败处理。
- 诊断采样结果：默认 DPR=1 的成功运行中，resize hold 出现过 live `1440x855`/hold `1440x862` 和 live `390x722`/hold `390x726` 的短暂尺寸差异。使用 `WEBSHELL_MOBILE_DEVICE_SCALE_FACTOR=3` 的诊断运行捕获到 live backing ratio 约为 `3`、可见 hold backing ratio 为 `1`，但在既有临时 tab 激活等待处失败，不能作为完整功能回归。
- P0-0 诊断补齐：已接入 presentation 事件中的 live/hold Canvas 尺寸与 DPR 字段，并让 `spec-tests` 从页面初始化阶段保存 desktop/mobile probe。
- 默认 DPR=1 的 `terminal/output` 重跑通过：`unsafe=0`、`overloads=0`、`staleDrops=0`、desktop/mobile 各 1 条 Unified physical WebSocket。
- 高 DPR 诊断：`WEBSHELL_MOBILE_DEVICE_SCALE_FACTOR=3` 下 live backing ratio 约为 3、可见 hold backing ratio 为 1；完整场景在临时 tab 激活等待处失败，不能作为功能通过，但 probe 已保存。
- `WEBSHELL_ENABLE_INITIALIZATION_PERFORMANCE=1` 可用于真机回归；若测试机 HTML 已部署初始化性能面板，场景会断言两个窗口均在首次渲染后显示已完成和总耗时，并确认持续输出/resize 后总耗时不变。若测试机仍返回旧版 HTML，产物中的 `initializationPerformance.available` 会为 `false`，该项只记录兼容性边界，不会误判当前静态 JS。
- 早期验证时测试机仍返回旧版 HTML，当时只能确认新 JS 未破坏连接、输出和渲染流程，不能验收面板 DOM；该限制已由下方 2026-09-04 最新真实回归解除。
- 2026-09-04 初始化渐进渲染首次修复后运行在新增断言之前被既有移动 presentation 门槛拦截：`pane-5` 从 socket open 到首帧 commit 为 2942ms，超过 2 秒，产物为 `artifacts/2026-09-04T07-52-12-895Z/`；日志显示 replay/output 正常并伴随已有 stale resize ACK warning，未修改断言或增加等待。
- 同命令原样重跑通过，产物为 `artifacts/2026-09-04T07-53-08-224Z/`；随后把 view 从全列表重建优化为稳定前缀复用/只更新 pending 尾行，再次通过，最终产物为 `artifacts/2026-09-04T07-55-01-095Z/`。
- 最新成功运行中 desktop/mobile 分别捕获 63/47 个 `collecting` 变化样本，其中 62/46 个样本带 progressive pending 行；总耗时从首批几十毫秒持续增长到最终 desktop `5394ms`、mobile `2727ms`。完成后 pending 行消失，最终 rows 为 115/106；持续输出和 resize 完成后总耗时仍分别保持 `5394ms`/`2727ms`，证明冻结边界有效。`overloads=0`、`staleDrops=0`。
- 当前测试机 HTML 已包含初始化性能面板，最新回归同时验证了真实 DOM 的渐进 rows、pending 状态、动态总计时和完成后冻结，不再处于“仅映射 JS、无法验收面板”的旧限制。
- `node --test tests/*.mjs`：423 项通过；collector 的 Node 回归覆盖首条事件立即出现、`refresh()` 推进 pending/总耗时、候选 session 选择、完成后 pending 消失和冻结，diagnostics controller 回归覆盖 ticker 在完成时清理。
- `go test ./... -skip '^TestRuntimeTerminalCanvasResidueGuard$'`：通过。跳过项是仓库 HEAD 已存在且与本次无关的 CSS guard（要求 `object-fit: none`，当前产品样式为 `contain`）；未为本功能放宽或删除该断言。
- `lzc-cli project release`：通过，生成 39 MiB `webshell-progressive-initialization.lpk`。
- `git diff --check`：通过。
- 当前用户结果前置修正后独立通过，并在最终全量的 `artifacts/2026-09-04T11-13-07-841Z/` 再次通过普通/1.5MiB/隐藏 tab/resize 输出、`unsafe=0`、零 overload/stale drop、Canvas 变化和唯一 Unified socket 门禁。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 \
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/output/test.mjs
```

高 DPR 诊断可临时设置 `WEBSHELL_MOBILE_DEVICE_SCALE_FACTOR=3`；该参数只改变 Playwright mobile context 的测试设备像素比，默认不设置时仍为 `1`。

`WEBSHELL_CAPTURE_TERMINAL_TIMELINE=1` 会在页面初始化前打开 debug timeline，并将结构化终端事件写入 `desktop/mobile-terminal-timeline.json`；不设置时仍保存 initial/final timeline 快照，但不要求页面显示 debug 日志。

## 产物与失败诊断

运行产物位于本目录的 `artifacts/<run-id>/`，包括 `events.jsonl`、截图、trace、`desktop/mobile-presentation-probe.json`、`desktop/mobile-terminal-timeline.json`、`desktop/mobile-terminal-timeline-initial.json` 和失败摘要。probe 从页面初始化阶段开始采集目标 active pane 的 `connection`、`renderReady`、`hasPresentedFrame`、live/hold CSS 与 backing 尺寸以及设备 DPR；成功和失败场景都会保存。启用 timeline 捕获时，terminal timeline 会同时保存每个 pane 的结构化 presentation/replay/resize 事件。重点检查 `presentation.unsafe`、`metrics.overloads`、`metrics.staleDrops`、Unified socket 数量、console/pageerror 和相关终端时间线。

## 已知限制

- 已有可选的高 DPR 诊断参数 `WEBSHELL_MOBILE_DEVICE_SCALE_FACTOR`，默认值为 `1`；使用 `3` 时只用于采集 live/hold backing ratio，不代表产品运行时 DPR 配置。
- P0-4/P1-3 的移动端初始 presentation 问题尚未修复：已记录 replay drain、`resize_applied` 到最终 `presentation_commit_complete` 的长间隔，以及 focus/字体变化触发 full render 后恢复的现象。
- 状态点只在尚未产生稳定 presentation 帧，或 session 明确处于 connecting、实际 connection retry、offline/error/network-error/closed 时显示。`data-render-recovery` 继续记录内部 presentation retry 供诊断使用，但不控制用户可见状态点；健康 socket 在已有稳定帧后，即使内部短暂 `renderReady=false` 或安排 presentation retry，也不会显示灰点。普通 output、queue turn、resize、viewport 和字体事务不会重新显示。
- 字体族及其他原子事务的 hold canvas backing store 已按 renderer DPR 修复并通过 DPR=3 真实场景验证。字号/行高现在直接显示 live Canvas，其 setter/metrics 中间几何和最终收敛由 `spec-tests/terminal/geometry-jitter` 验证，不再依赖 hold 遮挡。
- 当前测试没有在初始历史 replay 之前安装 observer，不能单独证明 replay 期间用户可见 Canvas commit 为零。
- 当前测试使用实时 1.5 MiB 输出，不等价于重新 attach 时的 350KB 历史 replay。
- 当前测试允许并记录 stale resize ACK warning；后续应继续确认 warning 对应旧 ACK 且不会改变当前 geometry，而不是简单删除 warning 或放宽断言。
- 当前 `spec-tests/terminal/geometry-jitter` 已包含桌面字号、真实行高修改/恢复、移动端 `Zoom+`/`Zoom-` 和逐帧 CSS/backing/DPR 日志；字号/行高断言 live Canvas 持续可见，tab/replay 等原子路径仍检查 hold 安全。
- P0-5 当前已有 Node 协议回归断言和真实 output 安全回归，但仍需要采集并减少真实 full render 次数，才能完成端到端验收。
