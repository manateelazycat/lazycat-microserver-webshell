# 终端渲染模块

## 职责与边界

本目录负责 Ghostty renderer adapter、runtime reset/suppression controller、Canvas presentation controller、Kitty graphics 适配、RenderSnapshot 和 frame release scheduler。它负责字体/行高度量、主题颜色映射、底部 viewport 归一化、cell seam/Powerline/块光标 patch、Ghostty 运行时安全 reset/清屏与 render suppression、render generation、full-render validation、last-known-good frame hold/release、Canvas context 恢复和 Kitty graphics 响应/像素适配，不负责历史、连接、工作区或 resize 权威。

完整画面只能在当前 identity、generation、viewport 和 presentation 条件都有效时提交；失败、重连、snapshot 等待或 replay/原子 resize 事务期间必须保留旧帧，禁止显示历史回放中间过程。桌面分屏、普通窗口 resize，以及已提交终端的字号/行高变化属于显式 live geometry：只要 replay 已提交且 pane 可见，当前 Ghostty Canvas 可以在服务端 ACK 前连续提交，不进入 hold。

`cancelHold({ restoreReady, releaseFrame })` 只取消 hold 编排，不能自行宣布首次呈现完成。只有显式 `restoreReady:true`、已有提交帧、replay/resize 门禁允许、可见且可测、Canvas 几何与 fit/replay/content generation 均匹配、没有待 full render 时才恢复 ready；`releaseFrame` 同样受此门禁限制。`restoreReady:false` 不触发 `onReady`，首次恢复必须由真实 full render commit 完成。该契约由场景 17 和 presentation 行为测试锁定。

字体族加载或其他原子几何变化期间，presentation hold 必须保持与 live renderer 相同的 DPR：hold canvas 的 backing width/height 按 CSS 尺寸乘以 renderer DPR 分配，并在绘制时保持正确的坐标变换。字号 setter 可能先让 live canvas 产生超出当前 host 的临时 CSS/backing 尺寸；现在由 metrics/resize live geometry 在同一任务内重新测量并 fit，保持 Canvas 可见。此前 `holdFrame()` 使用 CSS 宽高创建 hold canvas，且 CSS 使用 `image-rendering: auto`，高 DPR 设备会出现被平滑放大的模糊旧帧；该原子路径问题已通过 DPR=3 真实 `spec-tests/terminal/output` 验证修复。

## 公开入口与状态

外部只能从 `terminal/rendering/index.js` 导入 API。`createTerminalRendererAdapter()` 是 renderer patch 的唯一安装入口；`createTerminalPresentationController()` 是 presentation 状态、提交门禁和生命周期的唯一 owner；`createTerminalPresentationState()` 只提供 session 初始化快照；`RenderSnapshot` 持有一次呈现身份；frame scheduler 持有 latest-only RAF；Kitty graphics 模块只维护图片协议 patch 所需状态。

renderer adapter 只读取注入的字号、字体族和行高 getter。presentation controller 只读取注入的 replay/resize/visibility、当前设备 claim required 和 viewport geometry claim pending 门禁，并通过显式命令请求 resize 或 transport 恢复；本机已观察到远端 owner，或 viewport 最终尺寸尚在稳定检查时，presentation 只能保留 last-known-good frame 并延迟 geometry 修复，不得先发送被动 resize。它不能自行推进 history cursor、发送 WebSocket 帧、声明 resize owner 或修改输入队列。`onReady` 只发出“当前画面已提交”的信号，pending input、startup trace 和 retry reset 由 `terminal/session/session_installation_controller.js` 接收并编排。presentation hold、full render complete 和 presentation commit 的诊断事件同时记录 live/hold Canvas CSS/backing 尺寸及 window/renderer DPR；presentation gate 事件记录 visibility、measure、fit、resize 和 retry 状态；retry 在当前 generation 内有明确上限。controller 的 `installSession()` 独占 Canvas context 和 Ghostty `onRender` listener，session 销毁或模块 dispose 时统一取消 validation/retry timer、RAF、frame release 和 listener。

live geometry 期间 `renderLiveGeometryNow()` 只提交当前 session 的真实 Canvas，不捕获 hold；Ghostty 因持续 output 已完成的 `onRender` 帧会直接进入当前 snapshot，不能再重复触发一次 full render。每帧的高体积 Canvas 诊断事件在该模式下省略，避免 debug 开关反过来制造主线程负载。常规 validation/retry 不在 live geometry 或不可见 pane 上自旋；若最终网络 resize 等待超时，presentation 只调用 resize owner 提供的同 epoch retry 命令，仍不直接发送 WebSocket。

本目录不建立 WebSocket、不访问业务 API，也不直接执行 history 写入、`term.resize()` 或输入发送；这些能力只能由运行时 owner 通过受限回调注入。

## 文件

- `index.js`：唯一公开入口。
- `presentation_controller.js`：render generation、presentation gate、full-render validation/retry、retry exhausted 终态、hold 提交和 stall recovery 的唯一 owner。
- `presentation_state.js`：presentation session 字段的唯一初始化定义。
- `presentation_view.js`：live Canvas 清理、hold Canvas 挂载/复制/释放和 shell dataset DOM 适配；抓帧前会恢复被宿主清理路径意外脱离的模块自有 Canvas，并在 hold 事务期间同步 `terminalFrameHeld`/`renderRecovery` 状态。
- `presentation_lifecycle.js`：validation/retry timer、presentation RAF、frame release、Canvas context 和 `onRender` listener 生命周期。
- `renderer_adapter.js`：字体/行高度量、主题映射、底部 viewport、cell seam、Powerline 和块光标 patch 的唯一 owner。
- `runtime_controller.js`：Ghostty runtime reset、清屏、引用同步、首次 fit reset 和按 reason 幂等嵌套 render suppression 的唯一 owner；同一 reason 重复 begin 不增加底层 suppression depth，未知 reason end 不释放其他作用域；不决定 history replay 时机。
- `kitty_graphics.js`：Ghostty Kitty graphics patch、响应识别和像素尺寸。
- `terminal_render_snapshot.js`：render/presentation 快照和匹配校验。
- `terminal_frame_release_scheduler.js`：跨双 RAF 的 latest-only hold frame 释放。

## 验证

相关测试为 `terminal_presentation_controller_test.mjs`、`terminal_renderer_adapter_test.mjs`、`terminal_runtime_controller_test.mjs`、`kitty_graphics_test.mjs`、`terminal_render_snapshot_test.mjs`、`terminal_frame_release_scheduler_test.mjs` 及 runtime Canvas residue guard。presentation 测试必须覆盖 viewport claim pending 时不调度被动 resize、live geometry 不进入 hold、output render 不重复绘制和隐藏 pane 不创建 retry/validation 循环。最小回归是字体/行高变化、连续背景、Powerline、块光标、pixel scroll、快速切 tab、resize、折叠/跨屏、主题变化、runtime reset、Canvas context 恢复和断网恢复；live geometry 确认真实 Canvas 连续可见，其余原子恢复确认旧帧持续保留到当前 identity/generation 的最终完整画面提交。

任何 renderer patch 都不得清空终端、触发 replay/reset、改变 resize owner，或显示 history replay、snapshot、原子 resize、重连的中间过程。

## 旧帧停滞调查

永久旧帧尚未稳定复现。保留原有 presentation/hold 释放逻辑；本轮未验证的候选变更已撤回。调查用例与条件位于 spec-tests/investigations/network-presentation-recovery，后续由真实失败截图、cursor、resize/connection epoch 和 trace 再决定修复，不认定断网为根因。

闲置 hold Canvas 的 backing store 保持 0×0，捕获时才按当前 host/DPR 分配；释放时销毁位图缓冲。不得将此操作用于仍在展示的 hold 或 live Canvas。
