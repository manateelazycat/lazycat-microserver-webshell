# 终端渲染模块

## 职责与边界

本目录负责 Ghostty renderer adapter、runtime reset/suppression controller、Canvas presentation controller、Kitty graphics 适配、RenderSnapshot 和 frame release scheduler。它负责字体/行高度量、主题颜色映射、底部 viewport 归一化、cell seam/Powerline/块光标 patch、Ghostty 运行时安全 reset/清屏与 render suppression、render generation、full-render validation、last-known-good frame hold/release、Canvas context 恢复和 Kitty graphics 响应/像素适配，不负责历史、连接、工作区或 resize 权威。

完整画面只能在当前 identity、generation、viewport 和 presentation 条件都有效时提交。断网及等待重连时，已提交且未被修改事务退休的本地终端继续提供滚动、选择和复制；这些重绘不提交新的连接或回放代次。真正开始 replay、重置 Worker 或原子 resize 时才保护旧帧，禁止显示历史回放中间过程。桌面分屏、普通窗口 resize，以及已提交终端的字号/行高变化属于显式 live geometry：只要 replay 已提交且 pane 可见，当前 Ghostty Canvas 可以在服务端 ACK 前连续提交，不进入 hold。

`cancelHold({ restoreReady, releaseFrame })` 只取消 hold 编排，不能自行宣布首次呈现完成。只有显式 `restoreReady:true`、已有提交帧、replay/resize 门禁允许、可见且可测、Canvas 几何与 fit/replay/content generation 均匹配、没有待 full render 时才恢复 ready；`releaseFrame` 同样受此门禁限制。`restoreReady:false` 不触发 `onReady`，首次恢复必须由真实 full render commit 完成。该契约由场景 17 和 presentation 行为测试锁定。

字体族加载或其他原子几何变化期间，presentation hold 必须保持与 live renderer 相同的 DPR：hold canvas 的 backing width/height 按 CSS 尺寸乘以 renderer DPR 分配，并在绘制时保持正确的坐标变换。字号 setter 可能先让 live canvas 产生超出当前 host 的临时 CSS/backing 尺寸；现在由 metrics/resize live geometry 在同一任务内重新测量并 fit，保持 Canvas 可见。此前 `holdFrame()` 使用 CSS 宽高创建 hold canvas，且 CSS 使用 `image-rendering: auto`，高 DPR 设备会出现被平滑放大的模糊旧帧；该原子路径问题已通过 DPR=3 真实 `spec-tests/terminal/output` 验证修复。

## 公开入口与状态

外部只能从 `terminal/rendering/index.js` 导入 API。`createTerminalRendererAdapter()` 负责字形、字体与光标 patch；`createTerminalSurfaceController()` 是画布像素分配和最近标签缓存的唯一 owner；`createTerminalPresentationController()` 是 presentation 状态、提交门禁和生命周期的唯一 owner；`createTerminalPresentationState()` 只提供 session 初始化快照；`RenderSnapshot` 持有一次呈现身份；frame scheduler 持有 latest-only RAF；Kitty graphics 模块只维护图片协议 patch 所需状态。

## 画布资源与最近标签

`surface_controller.js` 在资源 factory 打开终端前调用 `prepare(term)`，让尚未访问的标签保持 live Canvas 为 0×0。首次显示后，当前标签的全部分屏允许分配和绘制；最近两个访问过的标签保留像素以便快速切回，其余标签归零释放。最近标签的 live/hold/cursor 总像素预算为 16 Mi pixels（RGBA 像素量约 64 MiB），超过预算时按最近访问顺序保留能容纳的标签；当前标签不参与这个后台预算。页面隐藏不清除当前标签的画布。

`surface_adapter.js` 只给显式 prepare 的终端接入 active/retained/released 状态，作用于随包 Ghostty 的 open、resize、绘制、清屏、光标闪烁及 dispose。创建期通过同步 open 作用域识别对应 renderer，禁止先分配 PC 尺寸的大画布再释放；普通未接入终端保持原行为。retained 状态保留像素但停止绘制和画布 resize；released 状态维持 0×0。`hasRenderSurfaceFrame()` 区分“终端曾完整呈现”和“当前画布仍有完整像素”，防止释放后被误判为已就绪或遮住持久预览。

切换前由预览 owner 同步复制受限尺寸的缩略图，再允许释放源画布；编码与存储异步完成。释放只操作 UI 像素和绘制任务，不 reset Worker/WASM、不关闭连接、不丢弃终端数据或滚动位置、不触发历史回放。重新显示走已有完整帧和 replay/resize 门禁，已保留的像素可立即显示；离线本地浏览许可继续归 presentation owner。session cleanup 和页面 dispose 归零画布并取消预算检查 RAF。

随包 `ghostty-web.js` 含有子模块 TypeScript 源码之外的 WebShell 定制，因此本功能通过应用适配层扩展现有类，不重建覆盖该资产，也不修改 WASM 或协议。

renderer adapter 读取注入的字号、字体族、行高与工具背景映射 getter。presentation controller 读取注入的 replay/resize/visibility、当前设备 claim required 和 viewport geometry claim pending 门禁，并通过显式命令请求 viewport owner 确保必要的尺寸任务已安排，或请求 resize/transport 恢复；本机已观察到远端 owner，或 viewport 最终尺寸尚在稳定检查时，presentation 只能保留 last-known-good frame 并延迟 geometry 修复，不得先发送被动 resize。它不能自行推进 history cursor、发送 WebSocket 帧、声明 resize owner 或修改输入队列。`onReady` 只发出“当前画面已提交”的信号，pending input、startup trace 和 retry reset 由 `terminal/session/session_installation_controller.js` 接收并编排。presentation hold、full render complete 和 presentation commit 的诊断事件同时记录 live/hold Canvas CSS/backing 尺寸及 window/renderer DPR；presentation gate 事件记录 visibility、measure、fit、resize 和 retry 状态；retry 在当前 generation 内有明确上限。controller 的 `installSession()` 独占 Canvas context 和 Ghostty `onRender` listener，session 销毁或模块 dispose 时统一取消 validation/retry timer、RAF、frame release 和 listener。

live geometry 期间 `renderLiveGeometryNow()` 只提交当前 session 的真实 Canvas，不捕获 hold；Ghostty 因持续 output 已完成的 `onRender` 帧会直接进入当前 snapshot，不能再重复触发一次 full render。每帧的高体积 Canvas 诊断事件在该模式下省略，避免 debug 开关反过来制造主线程负载。常规 validation/retry 不在 live geometry 或不可见 pane 上自旋；若最终网络 resize 等待超时，presentation 只调用 resize owner 提供的同 epoch retry 命令，仍不直接发送 WebSocket。

本目录不建立 WebSocket、不访问业务 API，也不直接执行 history 写入、`term.resize()` 或输入发送；这些能力只能由运行时 owner 通过受限回调注入。

## 文件

- `render_probe.js`：渲染异常的被动检查模块。采集 Canvas/host/祖先布局、显示样式、尺寸、generation、呈现门禁和 UI 缓存帧内容数量；手动捕获时使用独立小 Canvas 读取区域统计，不修改源 Canvas，不触发 Worker 请求、resize、重绘或 replay。运行时销毁释放采样 Canvas。

- `screen_refresh_controller.js`：可插拔的显示兜底模块，由全局运行时注入会话枚举、presentation、resize 的只读检查及共享调度器。默认每秒检查可见 pane，进入/恢复显示或连接、回放、几何代际变化后稳定至少 500ms 补绘一次；之后仅对持续未提交的画面补绘，同一代际最多 3 次。遵守回放、resize、hold、Worker 帧就绪门禁，复用完整绘制，不清屏、不发送尺寸、不申请历史回放。正常画面不周期性重绘。关闭开关会撤销本模块定时器、事件监听、排队任务和会话观察状态；隐藏页面暂停，页面销毁释放全部资源。日志事件为 `screen_auto_refresh` 和 `screen_auto_refresh_exhausted`。无法识别所有像素层面的错误，不能修复错误的 VT 内容。

v21 的前台普通绘制由浏览器 RAF 与共享预算合并，不再叠加 33ms 固定限频。presentation 安装共享调度 hook，统一取消旧 RAF、节流 timer 和共享任务；隐藏页面及隐藏 pane 保留待绘制标记，恢复可见后由现有 presentation 路径提交。普通完整绘制在预算不足时推迟，同一 live geometry 的 resize + draw 保持原子。

Kitty 图形适配对不完整命令、传输总量、并发解码、图片缓存及 placement 数量设置上限；超限向终端程序回复协议错误。不完整超限命令以有界丢弃状态寻找结束符，不继续累积字符串。reset/删除/销毁会释放位图，迟到解码结果不得重新放回已清理的画面；PNG 尺寸和解压后字节量在分配前或读取过程中限制。

- `index.js`：唯一公开入口。
- `presentation_controller.js`：render generation、presentation gate、full-render validation/retry、retry exhausted 终态、hold 提交和 stall recovery 的唯一 owner。
- `presentation_state.js`：presentation session 字段的唯一初始化定义。
- `presentation_view.js`：live Canvas 清理、hold Canvas 挂载/复制/释放和 shell dataset DOM 适配；抓帧前会恢复被宿主清理路径意外脱离的模块自有 Canvas，并在 hold 事务期间同步 `terminalFrameHeld`/`renderRecovery` 状态。
- `presentation_lifecycle.js`：validation/retry timer、presentation RAF、frame release、Canvas context 和 `onRender` listener 生命周期。
- `renderer_adapter.js`：字体/行高度量、主题映射、底部 viewport、cell seam、Powerline 和块光标 patch 的唯一 owner。
- `surface_controller.js`：当前标签与最近两个标签的画布保留策略、后台像素预算、预览复制和资源释放编排。
- `surface_adapter.js`：只为已接入终端安装 Ghostty 画布生命周期适配，持有终端/renderer 的弱引用状态；不涉及 Worker 或传输。
- `cursor_renderer.js`：块状光标背景和覆盖文字的同步绘制。优先使用当前单元格实际显示背景作为文字色，对比不足时选黑/白；识别宽字符续格，沿用普通字形/Powerline 路径并裁剪至完整字符区域。只绘制副本，不修改原单元格；临时绕过选区和颜色映射后恢复状态，每个字符的 Canvas 状态恢复时同步恢复字体缓存，避免光标跨格覆盖时后续字符使用错误字体。随包渲染器的第四个文字绘制参数仍为像素滚动偏移。
- `runtime_controller.js`：Ghostty runtime reset、清屏、引用同步、首次 fit reset 和按 reason 幂等嵌套 render suppression 的唯一 owner；同一 reason 重复 begin 不增加底层 suppression depth，未知 reason end 不释放其他作用域；不决定 history replay 时机。
- `kitty_graphics.js`：Ghostty Kitty graphics patch、响应识别和像素尺寸。
- `terminal_render_snapshot.js`：render/presentation 快照和匹配校验。
- `terminal_frame_release_scheduler.js`：单 RAF 的 latest-only hold frame 释放。

## 验证

相关测试为 `terminal_presentation_controller_test.mjs`、`terminal_renderer_adapter_test.mjs`、`terminal_runtime_controller_test.mjs`、`kitty_graphics_test.mjs`、`terminal_render_snapshot_test.mjs`、`terminal_frame_release_scheduler_test.mjs` 及 runtime Canvas residue guard。presentation 测试必须覆盖 viewport claim pending 时不调度被动 resize、live geometry 不进入 hold、output render 不重复绘制和隐藏 pane 不创建 retry/validation 循环。最小回归是字体/行高变化、连续背景、Powerline、块光标、pixel scroll、快速切 tab、resize、折叠/跨屏、主题变化、runtime reset、Canvas context 恢复和断网恢复；live geometry 确认真实 Canvas 连续可见，其余原子恢复确认旧帧持续保留到当前 identity/generation 的最终完整画面提交。

任何 renderer patch 都不得清空终端、触发 replay/reset、改变 resize owner，或显示 history replay、snapshot、原子 resize、重连的中间过程。

`applyCursorStyle()` 只更新注入的现有终端显示选项并合并一次完整重绘，清除静止光标留下的旧形状；不测量字体、不 fit、不 resize、不捕获 hold。新终端从 settings getter 读取样式。手工验证深浅主题、普通/彩色/反色文字、中文/emoji/组合字符、Powerline、选区重叠及三种样式互换，确认光标移开恢复原配色且相邻字形完整。产品口径见 `spec/terminal/cursor-appearance/`。

工具专用背景映射由 `getBackgroundColorMap(session, terminalTheme)` 注入。renderer 在绘制前同步，映射切换时完整重绘；activity 观察到前台进程变化后经 `syncBackgroundColors()` 更新，并由运行时按 presentation 门禁请求重绘。映射仅作用于实际背景绘制，合并行背景、cell seam、像素滚动一致；前景与选择色保留原路径。Codex 的识别、已知颜色和混色规则归 `tui_adapters/codex/`。不增加进程轮询或更改 VT 数据。

## 旧帧停滞调查

历史调查用例与条件位于 spec-tests/investigations/network-presentation-recovery。离线浏览由 presentation owner 记录最近一次完整提交的 backend、generation 和会话身份：连接退休后允许该本地缓冲区重绘，不能据此恢复输入许可或推进 replay commit。开始 hold、替换缓冲区或身份变化会退休这项许可；失败或部分回放不获得本地浏览许可。切换标签和等待网络期间的 fit 不把可浏览终端转成静态占位；收到回放开始消息后才保护画面并恢复权威内容。

闲置 hold Canvas 的 backing store 保持 0×0，捕获时才按当前 host/DPR 分配；释放时销毁位图缓冲。不得将此操作用于仍在展示的 hold 或 live Canvas。

本轮画布修复的本地检查为修改模块的 `node --check`、`npm run build` 和 `git diff --check`。真实验证待开发者部署当前 LPK 后进行：22 个标签、DPR 1/3、已有 5000 行输出、最近标签来回切换、被回收标签返回、离线滚动/复制、可见分屏及总览预览。核对画布像素、实际内存和切换耗时，并确认没有新增 Worker 初始化、物理连接或完整历史回放；静态构建不能作为 iOS 崩溃修复验收。

占位诊断由 presentation owner 的弱引用表记录复制次数、单次复制耗时和持续时间；原有释放检查失败时记录阻塞条件。render probe 仅被动读取这些字段及 resize snapshot，不增加轮询或触发呈现。占位实现是 Canvas drawImage，不生成 PNG。

连续 resize 的呈现：可见 pane 在渲染抑制期间仍接收 Worker 完整视口，抑制只阻止 Canvas 提交。旧帧保持捕获时的 CSS 像素尺寸，由宿主裁剪，不随窗口或键盘改变拉伸。有效画面提交后在下一次 RAF 检查释放，后续提交仅更新检查条件，不重置等待；普通新输出的 fullRenderPending 不阻止释放，连接、Worker、回放、尺寸代次和原生 resize 门禁仍需通过。交互式 live geometry 已允许提前显示的完整画面不再被旧 ACK 等待遮挡。重建 Worker 前先保护画面并退休 ready 状态。

普通输出完成后直接保留一次绘制任务，呈现校验不承担动画驱动，也不会因新输出反复后移已有校验。每次实际 Canvas 绘制直接提交该帧的内容代际和消费游标；仅当几何及回放代际已经一致时，允许完整画面落后于最新解析进度。同步输出持有期间暂缓呈现，不阻塞解析 ACK。

首次适配等待当前设备尺寸时，presentation 先调用 viewport owner 的幂等 ensure 命令，再等待实际保留的任务，避免把无人处理的 geometry 差异当作在途任务。正常 follower 仍走被动尺寸同步，不根据输出直接 claim。等待事件包含 viewport owner 的目标、当前 geometry、实际调度状态与延后原因；同一连接/Worker/回放/视口代次及门禁状态下每秒最多保留一次相同等待记录。重试耗尽只报告一次，后续输出仍能检查门禁并继续呈现，不继续增长耗尽计数或安排额外重试。
