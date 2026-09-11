# 终端 Resize 模块

## 职责

本模块是终端几何事务的唯一 owner，维护 requested、applied、presented 三阶段中的 requested/applied 状态、resize epoch、跨设备 owner observation、ACK fence、输出 settle、DOM fit、ResizeObserver、Ghostty `onResize`、tab RAF 调度和桌面交互式 live geometry 状态。

模块不拥有 WebSocket 建立、关闭或重连，不决定历史 replay/snapshot，不维护 Unified membership，也不直接管理输入队列。它只通过注入的 transport 命令发送 resize 控制帧，通过 rendering 公开命令提交 presentation hold 和最终 full render。

当 fit 得出的 cols/rows、Canvas backing size、presentation generation 和 ACK/fence 状态都没有变化时，controller 必须走稳定几何快速路径：不捕获/恢复 viewport、不重置 host scroll、不重新定位 IME、不更新选区手柄，也不触发 full render。当前设备已经成功 claim 且没有新的 owner observation 时，重复点击、focus 和鼠标事件不得再次发送相同 claim；只有尺寸变化、远端 epoch/owner release 或明确的设备接管才重新进入 resize 事务。

当前设备接管必须使用 `claimForCurrentDevice()`、`claimTabForCurrentDevice()` 或 `claimActiveTabForCurrentDevice()`。如果显式 claim 到达时已有普通 resize 等待 ACK，controller 必须记录 latest-only pending claim，并在 ACK 或 `resize_owner_active` 后使用最新可测 DOM 几何升级为新的 claim；不得被同 target 去重吞掉，也不得先显示远端 owner 的过渡尺寸。`resizePane()` 统一拒绝在已有可见帧且观察到远端 owner 后发送被动 geometry/force-sync 帧；本设备已成功 claim 后，后续迟到几何修正必须继承 `claim:true`，不能降级为普通 resize。`isCurrentDeviceClaimRequired()` 只向 presentation 暴露远端 owner observation 的只读门禁；`schedulePresentationResize()` 在本设备已经 claim 后会为字体/行高等迟到 geometry 修正保留 claim 语义。tab、pane、页面恢复和 viewport 只发布使用意图，不能自行修改 claim/epoch 字段。

普通原子 resize 在 ACK 前不得切换本地 Ghostty 网格。matching ACK 到达时必须重新冻结当前 output queue 的完整 entry 数量，把 ACK 前已经收到的全部字节先按旧网格排空；ACK handler 返回后收到的字节才属于新网格。不得沿用发送请求时的旧队列计数，否则 F11、切 tab 或折叠等场景中 ACK 前迟到字节会被新 cols/rows 解析，产生临时旧行、乱码或疑似串会话内容。

桌面分屏拖拽、普通桌面窗口 resize，以及已有稳定画面上的字号/行高变化，是明确的 live geometry 例外：本地 Ghostty 网格/Canvas 可在服务端 ACK 前按当前 DOM 和字体 metrics 乐观重排，live Canvas 始终可见且顶部锚定。该例外只改变交互期间的本地呈现，不改变服务端 owner、resize epoch 或最终尺寸权威；replay、重连、首次恢复、tab 激活修复、字体族资源加载及非交互式几何校正仍走上述 ACK fence 与原子呈现。

远端尺寸只作为 observation，本设备只有在明确的 pointer、focus、viewport 或 owner release 边界才重新 claim。snapshot、重连、历史恢复和非 live 的 resize 中间过程都不得显示，也不得通过重新 replay 历史掩盖几何问题。

replay、重连、字体族加载和其他原子恢复事务期间显示的 last-known-good hold frame 不能降低清晰度：hold canvas 的 backing dimensions 已按 CSS 尺寸乘当前 renderer DPR 分配，并通过真实 DPR=3 回归验证。字号/行高等 live geometry 不捕获、不显示也不缩放 hold Canvas。

分屏条交互式拖拽必须通过 `beginTabInteractiveResize()` / `updateTabInteractiveResize()` / `endTabInteractiveResize()` 建立显式事务。开始时取消旧 scheduler 和可能残留的 hold；拖动中由 workspace 每个布局 RAF 通知 update，本模块以 80ms 上限节流本地 fit/full render，并用 trailing timer 保证最后一次被节流的 DOM 尺寸不会长期落后。此时 `resizePane()`、`schedulePane()` 和 ResizeObserver 的迟到工作必须被 live geometry fence 拒绝，但 live output 仍可提交到当前 Canvas。结束时强制一次最终本地 fit，并以 `claim:true` 提交最终尺寸。不得为每个 pointermove 创建 resize epoch、ACK、output fence 或原子 presentation hold。

网络 resize 每个 pane 同时只能有一个本地 epoch 在途。新尺寸只覆盖 `pendingResizeTarget`，当前 ACK 后再发送最新目标；超时重试必须复用当前 `requestedResizeEpoch`，不能分配新 epoch 让迟到 ACK 变成 stale。桌面 window resize 复用同一 live geometry 状态，以 settle timer 结束并提交最终尺寸。

resize 请求状态机严格绑定当前 logical `connectionEpoch`。transport 在每次新连接推进 epoch 后必须先调用 `beginConnection()`：旧连接的 ACK/fence/settle 和 `TerminalResizeController` 立即退休，迟到回调不能修改新连接；可见 pane 的 latest target、在途显式 claim 或已确认的本设备 owner 意图会在新 replay 给出服务端 epoch/geometry 后至多重放一次。隐藏 pane 不自动抢占，只保留 `sizeClaimRequired`，等待显式使用意图。新请求 epoch 必须大于旧请求和 replay epoch，输入模块只有在新连接 resize ACK 完成后才可 flush pending input。只有 `resizeAckPending=true` 的本地请求才能推进 `TerminalResizeController`；另一设备的更高 epoch 是 remote observation，已应用 remote ACK 的重复广播必须幂等接受，不能再次拿旧本地 request ID 校验并制造 mismatch warning。

## 公开入口与契约

外部只能从 `terminal/resize/index.js` 导入。

- `createTerminalResizeController()`：模块单一编排入口。公开尺寸读取、可测量判断、resize/claim/reassert、当前 pane/tab 设备接管、协议 ACK/error/owner 处理、输出 settle、tab 调度、session 安装和幂等销毁。
- `beginConnection(session, { connectionEpoch })`：transport 推进 logical connection epoch 后的唯一 resize transition 入口；幂等退休旧事务，并把仍有效的可见 target/claim 意图迁移到新 replay 边界。
- `beginTabInteractiveResize()` / `updateTabInteractiveResize()` / `endTabInteractiveResize()`：幂等管理 tab 内各 session 的 live geometry；只做本地网格/Canvas 重排与最终尺寸提交，不拥有布局比例，也不自行持久化 workspace。
- `beginMetricsLiveGeometry()` / `updateMetricsLiveGeometry()` / `endMetricsLiveGeometry()`：供 metrics owner 管理单 session 的字号/行高 live source；可与分屏/window source 重叠，任一 source 结束都不能提前终止另一 source。
- `scheduleTabLiveGeometry()`：桌面 window resize 的 live geometry + trailing commit 入口。
- `resendPendingSize()`：只重发当前在途 epoch 与 target，不创建新事务。
- `TerminalResizeController`：单个 resize 请求的 epoch/ACK/settle 纯状态机，由高层 controller 持有。
- `createTerminalResizeScheduler()`：latest-only 的 throttle/settle 调度器。
- `shouldSendTerminalSize()`、`terminalSizeDiffersFromServer()`：无状态尺寸判断。
- geometry/viewport 导出只提供机械查询与恢复，不承担事务编排。

`resize_controller.js` 的默认 `sendControl` 只通过当前 session socket 序列化 resize 控制帧；调用方可以在需要时注入受限 transport adapter，但 `global-runtime.js` 不再实现或注入 JSON 发送逻辑。单 pane resize 失败不得关闭 Unified 物理连接或影响其他 logical stream。rendering 注入只接收 hold、ready 和 full-render 命令，不得反向推进 resize epoch。

## 状态所有权

`resize_controller.js` 是以下状态的唯一修改者：`requestedResizeEpoch`、`appliedResizeEpoch`、requested/server geometry、`pendingResizeTarget`、`resizeAckPending`、`resizeConnectionEpoch`、`resizeConnectionTransitionPending`、`resizeFence*`、`resizeOutputSettle*`、`measuredFitGeneration`、`sizeClaimRequired`、`sizeClaimed`、`requestedResizeClaim`、`pendingSizeClaim*` 和 observer 记录尺寸。presentation 只读取这些门禁并在 render 成功后推进 `presentedResizeEpoch`；transport 只能调用 `beginConnection()`，不能直接写这些字段。

`resize_controller.js` 还独占 interactive source、metrics source 和 live session 集合、本地重排节流时间、trailing fit timer 和桌面 window settle timer；workspace/metrics 只能通过各自公开命令开始/update/结束事务，不能修改这些状态。只有所有 source 都结束后才能发送最终 target；ACK 完成后才能退出 live session。`resize_lifecycle.js` 独占普通 scheduler timer/RAF、ResizeObserver、Ghostty `onResize` disposable、owner/pending-target RAF 和 tab RAF。`geometry_state.js` 与 `viewport_controller.js` 不保存业务状态。

## 生命周期与清理

`installSession()` 为 pane 安装 ResizeObserver 和 Ghostty `onResize`，两者都注册到 session cleanup。新 logical connection 在 socket/timer 安装前调用 `beginConnection()`，replay start 再采用服务端 resize 基线并调度迁移后的 latest-only 意图。`cancelPane()` 取消 scheduler、session RAF、live geometry/trailing fit、output settle 和 presentation hold；`cancelTab()` 取消 tab RAF 与 window settle timer；`dispose()` 拒绝迟到 observer/timer/RAF 并清理全部模块资源。

移动键盘 viewport suppression 仍由输入/页面层拥有，只通过注入 getter 阻止 resize 事务。模块销毁或 pane 关闭后，任何 ACK、timer、observer、RAF 或 terminal resize callback 都不得修改 session 或 Canvas。

## 文件清单

- `index.js`：唯一公开入口。
- `resize_controller.js`：resize 协议（含默认控制帧序列化）、fence/settle、稳定几何快速路径、设备 claim 去重、DOM fit、tab/session 编排。
- `resize_lifecycle.js`：scheduler、timer、RAF、ResizeObserver 和 Ghostty disposable 生命周期。
- `geometry_state.js`：尺寸、epoch、Canvas、DOM 可测量性和 target 比较纯函数。
- `viewport_controller.js`：resize 前后 viewport 快照与恢复。
- `terminal_resize_controller.js`：单事务 requested/applied/settled/committed 状态机。
- `terminal_resize_scheduler.js`：latest-only throttle/settle 调度。
- `terminal_size_sync.js`：发送去重与本地/服务端差异判断。

## 依赖、guard 与最小回归

模块依赖 Ghostty terminal/fit adapter 的机械 API、rendering 公开命令、output 的队列计数/queued bytes/有界 flush 命令和 transport resize 发送命令；不得读取 `session.outputQueue*`，也不得导入 history/cache/output/transport 内部实现。

自动化测试：`terminal_resize_controller_test.mjs`（含默认控制帧 serializer、普通 resize 的 claim 升级、owner 拒绝保帧重试、matching ACK 前全部 output entry 使用旧网格排空、interactive/metrics source 重叠、live geometry/trailing fit、window settle、单 in-flight/latest target、同 epoch 重试、remote ACK 幂等，以及 pending/settled owner 跨 connection transition 的重放、迟到 ACK 和隐藏 pane 不抢占）、`terminal_resize_scheduler_test.mjs`、`terminal_size_sync_test.go`、`TestRuntimeResizeEpochAckGuard`、`TestRuntimeCrossClientResizeDoesNotAutoReclaim`、`TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs` 和 resize 模块边界 guard。真实物理断线期间的 claim/输入恢复由 `spec-tests/terminal/resize-sync` 覆盖。

最小真实回归：在 `debug123` 同一 pane 持续输出时改变窗口尺寸、分屏比例、字号、行高、tab、字体族和主题；桌面分屏/窗口及字号/行高变化要确认 live Canvas 顶部不变、几何有界跟随、hold 始终隐藏且最终只提交最新尺寸（`spec-tests/terminal/geometry-jitter`、`spec-tests/workspace/split-divider`），其他原子 resize/字体族加载要确认 backing store 变化前 hold 已可见、ACK 前本地 cols/rows 不变、最终画面非空且没有 replay 中间帧。手机与桌面交替 claim 同一 pane 时远端 observation 不自动反抢；连续同设备点击不得新增 resize frame、改变 Canvas 几何或短暂隐藏已呈现画面；全程普通容器页面只有一条 Unified 物理 WebSocket，console/pageerror/API error 为零。
