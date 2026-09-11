# 终端 Viewport 模块

## 职责

本模块是浏览器终端 viewport 与移动软键盘布局状态的唯一 owner，维护 layout/visual viewport、屏幕尺寸、DPR、方向组成的 geometry signature、latest-only generation、视觉视口高度、参考高度、键盘 inset、客户端底部安全偏移、resize suppression 和终端输入 viewport lock。

模块负责在软键盘打开期间平移当前 Ghostty Canvas 与 composition preview，使光标保持在可见区域；移动触摸布局的 helper textarea 由 IME 保持固定锚点，不参与平移；负责移动快捷键栏跟随 iOS 键盘或客户端底部控件；负责阻止触摸布局中的多指缩放；负责窗口、跨屏 DPR、旋转以及 portrait-to-portrait 折叠/展开后的 latest-only 尺寸接管。单次探测经过两帧稳定检查并以 180ms fallback 收口；折叠 WebView 事件早于最终几何时，再以 `0/80/180/360/720ms` latest-only recovery probe 捕获迟到尺寸。

模块不拥有终端 resize epoch、Ghostty 网格、历史 replay、Cache API、WebSocket、Unified membership、输入队列、selection range 或 overview 状态。viewport 变化只调用现有 resize/presentation 命令并复用当前内存终端状态，禁止重新回放历史或显示任何历史、snapshot、resize 和重连中间帧。

## 公开入口与契约

外部只能从 `terminal/viewport/index.js` 导入。

- `createTerminalMobileViewportController()`：模块单一编排入口。
- `start()` / `dispose()`：幂等安装和清理全局 listener、timer 与 RAF。
- `usesInsets()`：当前平台和强制 PC 模式是否启用视觉视口 inset。
- `isKeyboardActive()` / `isResizeSuppressed()`：供 IME 和 resize 读取的只读门禁。
- `isGeometryClaimPending()`：供 presentation 读取的只读门禁；包含已排队 generation，也能在 viewport listener 尚未消费事件时通过最新浏览器 geometry 识别结构变化。
- `sync()` / `syncPan(session)`：同步 visual viewport 或单个 pane 的光标平移。
- `captureInputLock(session)` / `releaseInputLock(session)`：IME focus 生命周期使用的视口锁。
- `scheduleKeyboardDismissRecovery({ hadInputFocus })`：真实输入失焦或现有键盘 inset 需要清理时的有界恢复；同一时刻只保留一组定时任务。
- `cancelKeyboardDismissRecovery()`：新输入请求或 textarea 获焦时取消旧的收起恢复及过期输入锁释放帧。
- `handleLayoutChange()`：强制 PC/触摸布局变化后清理并重新计算。
- `snapshot()`：返回键盘状态、geometry generation、pending 状态和最后 geometry 的只读诊断快照，不允许外部修改内部状态。

## 状态所有权

`viewport_controller.js` 是 geometry signature/generation、viewport 高度、参考高度、inset、安全偏移、键盘 active、resize suppression、方向和当前 input lock session 的唯一修改者。`session.inputViewportLock` 只能由本 controller 通过公开 capture/release 命令修改；IME 只能请求命令，不能自行构造或推进锁状态。

resize 只能调用 `isResizeSuppressed()`，不能写 viewport 状态。presentation 只能读取 `isGeometryClaimPending()` 并延迟自己的被动 geometry 修复，不能推进 generation 或发起 claim。IME 只能读取 `isKeyboardActive()` 并调用锁、dismiss recovery 及其取消命令。selection、overview、移动菜单和标题只接收同步通知，不得反向推进 viewport generation。

## 生命周期

`viewport_lifecycle.js` 独占 window/document touch 与 gesture listener、window/visualViewport resize/scroll、orientation listener、键盘 suppression timer、dock timer、dismiss/orientation recovery timer 和 viewport RAF。`dispose()` 会移除全部 listener、取消 timer/RAF、释放 input lock，并拒绝迟到回调。

geometry、recovery probe 和键盘恢复使用 generation 检查；旧 sequence 的 timer/RAF 即使已经进入任务队列，也不能 claim 或修改当前 viewport 状态。结构性 width/screen/orientation/DPR 变化优先于 textarea focus 与旧键盘 inset，并释放错误 input lock/suppression；只有真实 keyboard active 才应用 iOS inset。软键盘期间非结构性 geometry claim 必须延迟，收起后只使用最终尺寸。全局事件安装必须幂等，不能因重复 `start()` 产生重复 resize 或键盘恢复。

## 文件清单

- `index.js`：唯一公开入口。
- `viewport_controller.js`：移动视觉视口、软键盘 inset、input lock、方向恢复和跨模块命令编排。
- `viewport_lifecycle.js`：全局 listener、timer 与 RAF 生命周期。
- `viewport_model.js`：geometry signature、结构变化/键盘变化判定、方向识别、底部 inset 和光标 pan 纯计算。
- `README.md`：职责、状态所有权、生命周期、依赖和回归约束。

## 依赖、guard 与最小回归

模块通过显式注入依赖 resize、IME DOM 命令、selection、overview、移动菜单和工作区只读查询；不得导入这些模块的内部实现，不得访问 transport/history/cache。

自动化测试：`terminal_viewport_controller_test.mjs` 覆盖 portrait-to-portrait 折叠、分阶段尺寸只提交最终 generation、键盘不 claim 和 dispose fence；`TestRuntimeTerminalViewportModuleBoundary` 固定单一公开入口、版本化静态资源、global runtime 接线和旧 viewport 状态/实现不得回流入口文件。真实回归由 `spec-tests/terminal/resize-sync` 和 `spec-tests/terminal/viewport` 覆盖跨设备 owner、折叠/展开及原子保帧。

最小真实回归：在 `debug123` 的桌面与移动页面加载当前工作区资源；移动端打开/收起软键盘并旋转视口，确认快捷键栏和光标可见、终端最终 Canvas 非空、没有 replay 中间帧或 `pageerror`；桌面 resize 保持正常；每个页面始终只有 1 条 Unified 物理 WebSocket。
