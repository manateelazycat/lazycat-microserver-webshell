# 终端鼠标协议模块

## 职责

本目录负责终端鼠标协议的工具无关责任域：读取 Ghostty mouse mode、Legacy/SGR 字节编码、桌面 press/move/release/wheel、触摸 mouse 序列、移动事件去重、本地 TUI 事件所有权，以及 listener 的 session 生命周期。

本模块不负责 TUI 身份识别、选择范围、Clipboard、输入队列、WebSocket、history replay、resize owner 或 Canvas presentation。Claude、opencode、herdr、pi 和 Grok 的身份判断必须留在各自调用方或 `terminal/tui_adapters/`；mouse controller 只接受 `isDeferredTouchClickSession()` 等显式策略，不得包含工具名或宽泛命令匹配。

## 公开入口与契约

外部只能从 `terminal/mouse/index.js` 导入：

- `createTerminalMouseController()`：唯一状态与编排入口，公开 `start()`、`trackingState()`、`hasTracking()`、`claimEvent()`、`encode()`、`sendWheel()`、`sendClick()`、`installSession()`、`disposeSession()` 和 `dispose()`。
- `createTerminalMouseLifecycle()`：session listener 与 cleanup 的幂等生命周期。
- `mouse_model.js` 导出的 mode、button、touch event 和 Legacy/SGR 编码函数：无 DOM、无 session registry 的纯协议模型。

TUI adapter 只能通过 controller 的 `hasTracking()`、`claimEvent()`、`sendWheel()` 和 `sendClick()` 协作；不得直接读取 controller 私有 `WeakSet` 或复制协议编码。

## 状态所有权

`mouse_controller.js` 独占本地事件所有权 `WeakSet`、每个 session 的 active button、最后 move 序列、touch identifier 和工具无关的延迟点击/滚动状态。调用方只注入 pane 激活、selection 清除、尺寸重申、输入发送、`isKeyboardClaimed(event)` 和 `shouldPreserveTouchDefault(event)` 查询。键盘双击由 IME 统一判断；本模块不持有第二套双击历史或聚焦许可，不再自行 focus/blur。IME 要求保留默认行为的第一下页面焦点交接和双击认领不得 `preventDefault`，也不发送延迟点击。已经发出的普通 mouse press 仍配对 release。页面已聚焦后的单击、滑动仍走延迟点击。

`mouse_lifecycle.js` 独占 shell/document listener 和清理函数。`mouse_model.js` 不持有 DOM、timer、session、socket 或可变全局状态。

## 生命周期与事件顺序

`installSession()` 幂等并按调用顺序安装 capture listener；session 销毁时 `disposeSession()` 必须移除 shell 与 document listener并清空临时状态。应用销毁时 `dispose()` 清理所有 session，后续编码、发送和事件认领全部失效。

安装顺序必须保持：input focus、默认 selection、工具专用 TUI adapter、通用 mouse、桌面 clipboard。工具 adapter 先调用 `claimEvent()` 后，通用 mouse 的 down/move/up/click-like 路径必须跳过同一事件。移动端双击键盘请求必须继续在同步 `touchend` 调用栈内完成，不得使用 RAF、timeout 或 Promise。

## 文件清单

- `index.js`：单一公开入口。
- `mouse_controller.js`：事件所有权、桌面/触摸状态机、TUI 命令适配和 session 编排。
- `mouse_model.js`：Ghostty mode、button/modifier、touch event 与 Legacy/SGR 编码。
- `mouse_lifecycle.js`：session listener 和幂等清理。

## 依赖、guard 与最小回归

允许依赖 Ghostty mode 读取、selection 的 point-to-cell 公开 API，以及注入的输入、尺寸和焦点命令。禁止创建/关闭 WebSocket、修改 history cursor、触发 replay/reset、拥有 resize epoch，或提交 Canvas presentation。

相关测试为 `terminal_mouse_controller_test.mjs`、`TestRuntimeTerminalMouseTrackingSequences`、Claude/opencode/herdr/pi 事件所有权 guard 和 Grok 双击键盘 guard。最小回归包括 Legacy/SGR press/release/move/wheel、桌面拖动跨 document、右键/点击抑制、触摸 press/move/release、工具 adapter claim、Grok 冷启动直接双击键盘、Grok 单击/滑动和 session 销毁清理。

任何 mouse 操作都不得清空终端、触发或显示 history replay、snapshot、resize 或重连中间过程。
