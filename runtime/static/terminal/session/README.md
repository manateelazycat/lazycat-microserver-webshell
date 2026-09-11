# Terminal Session

## 职责

本模块是浏览器 pane session 的唯一组合边界，负责：

- 分配并推进 pane ID 序列，归一化初始终端尺寸。
- 创建相互隔离的扁平 session 初始状态。
- 组合 replay、resize 和 render snapshot 子控制器。
- 保存 session cleanup，不把 cleanup 数组暴露给业务对象。
- 按固定顺序幂等销毁 session，并拒绝销毁后的迟到 cleanup。

本模块不负责 WebSocket 协议、Unified 物理连接、历史同步、浏览器存储、Ghostty 渲染、resize 算法、输入分类或工作区布局。这些实现由对应责任域维护，并通过显式 lifecycle adapter 接入。

## 公开入口

外部只能从 `terminal/session/index.js` 导入：

- `createTerminalSessionController(options)`：创建模块 controller。
- `createTerminalSessionInstallationController(options)`：创建 pane 后按固定顺序接入各责任域、注册应用级 DOM 命令，并接收 presentation-ready 的跨模块副作用。
- `createTerminalStartupErrorController(options)`：查询并呈现当前 session 的启动错误，区分可重试网络错误、普通失败和 last-known-good frame。

controller 公开：

- `create(options)`：创建一个 session。
- `addCleanup(session, callback)`：注册 session 资源清理；session 已关闭时立即执行回调。
- `dispose(session)`：幂等销毁单个 session。
- `disposeAll(sessions)`：按同一销毁顺序批量幂等销毁 session；返回本次是否至少销毁了一个 session。
- `isDisposed(session)`：查询生命周期是否已完成销毁。

## 状态所有权

- `session_controller.js` 唯一持有 pane ID 序列，并组合 state 与 lifecycle。
- `session_state.js` 只创建初始状态；每次调用都生成独立数组、Promise 和子控制器。
- `terminalExitRetained` 记录当前页面已经观察到 Agent 保留的异常退出终态；它阻止后续 workspace apply 重新连接同一失效 pane，但不阻止刷新页面后的首次历史回放。
- `session_lifecycle.js` 通过模块私有 `WeakMap`/`WeakSet` 持有 cleanup 与 disposed 状态。
- transport、replay 和 `client:` 兼容历史字段暂时保持扁平；input、output、resize 和 presentation 字段虽然仍由 session state 提供初值，但只允许对应 controller 修改，其他模块必须使用公开 API。`resizeConnectionEpoch` 与 `resizeConnectionTransitionPending` 也只由 resize controller 修改；session state 仅把它们初始化为无连接状态，transport 不直接写入。

禁止其他模块直接修改 session lifecycle 的私有状态，也禁止重新在 `global-runtime.js` 建立 session cleanup 数组或复制局部销毁逻辑。

## 生命周期

销毁顺序必须保持：

1. 对 `client:` 请求 flush 尚未提交的 IndexedDB 历史写入；普通容器为无副作用操作。
2. 设置 `session.closed = true`。
3. reset replay 状态，并只 detach 当前 Unified logical stream。
4. 注销 `client:` scheduler lease。
5. 通过各模块 adapter 清理输入、连接、重试、resize、输出、presentation 和 `client:` 历史资源。
6. 取消 frame release，运行模块 cleanup。
7. 清 Canvas、dispose Ghostty、移除 pane DOM。

`closed` 必须早于 logical detach，因为 logical close 回调是同步的；否则会为正在主动销毁的 pane 重新安排 retry。单 pane 销毁不得关闭 Unified 物理连接或影响兄弟 logical stream。

## 文件清单

- `index.js`：唯一公开入口。
- `resource_factory.js`：创建 pane DOM、Ghostty Terminal/FitAddon、保帧 Canvas 和 IME 节点；不拥有 session 状态或资源清理。资源创建时禁止初始化聚焦，host 移除 contenteditable/tabindex，之后由 IME 安装唯一输入聚焦入口。
- `session_controller.js`：ID、初始尺寸、资源 factory、state 和 lifecycle 的组合控制器，并提供单个/批量销毁入口。
- `session_installation_controller.js`：presentation、output、IME、renderer、selection、TUI（含 Grok 触摸/右键/桌面选择）、mouse、clipboard（含 OSC 52 写入观察）、应用 paste、resize、input、context menu 和 transport 的显式安装编排；terminal host 的 paste listener 只把事件转发给注入的应用 paste controller，并维护 presentation-ready 到 input/diagnostics/transport 的局部接线。
- `session_installation_lifecycle.js`：pane 激活、focus 和 terminal host 原生 paste 转发 listener 的注册、迟到回调 guard 与清理。
- `startup_error_api.js`：按 target 查询 agent startup error，固定 `no-store`。
- `startup_error_controller.js`：启动错误分类、重连状态、错误面板/终端输出和 last-known-good frame 保护编排。
- `startup_error_lifecycle.js`：每个 session 的异步请求 generation 与 dispose fence，拒绝迟到错误覆盖新会话。
- `session_state.js`：完整扁平初始状态与子控制器实例。
- `session_lifecycle.js`：cleanup 所有权、迟到回调处理和严格销毁编排。
- `session_recovery_controller.js`：socket detach、历史回放 reset/resync 和 Unified/client 分支状态清理；通过显式回调连接 transport、presentation、output 与 IME，不显示回放中间帧。

## 依赖与验证

- 内部通过 `terminal/history/index.js`、`terminal/resize/index.js` 和 `terminal/rendering/index.js` 依赖现有 replay、resize 与 render snapshot API。
- DOM、Ghostty 和各责任域清理函数由调用方显式注入，模块不反向读取应用全局状态。
- 行为测试：`terminal_session_controller_test.mjs`、`terminal_session_installation_controller_test.mjs`（含原生 paste 转发、presentation-ready 副作用及 closed/dispose guard）、`terminal_startup_error_controller_test.mjs`、`terminal_session_protocol_controller_test.mjs`（含 connection epoch 到 resize transition 的接线）、`app_paste_controller_test.mjs`。
- 静态边界：`TestRuntimeTerminalSessionModuleBoundary`。
- 历史 guard：对应 `spec-tests` 场景 README、终端 history/transport 测试以及当前模块 README 中记录的 cursor、Unified、历史回放和 last-known-good frame 契约。

最小回归步骤：创建多个 tab/pane，关闭其中一个 pane，确认兄弟 pane 持续输出和输入；断网后恢复，确认已有画面未被清空；刷新并等待历史恢复，确认中间 replay 过程不可见。
