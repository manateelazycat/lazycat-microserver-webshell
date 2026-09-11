# 终端输入模块

## 职责

本模块负责终端用户输入与 generated response 的分类、发送队列、字节预算、WebSocket 背压、pending lease 过期和 `term.onData` 生命周期。输入是否可发送只由 replay commit、logical channel/lease、socket 和 resize ACK 共同决定，不依赖 Canvas `renderReady`。

本模块不拥有 WebSocket 建立、关闭或重连，不决定 history replay、resize 或 presentation，也不实现应用弹窗输入锁、快捷键 UI、selection、Clipboard API 或原生 paste 的文件/文本业务分流。应用更新提示不得向 session、Provider、agent 或 pane 创建输入 blocker；触控弹窗依赖遮罩和焦点隔离。IME/composition、helper textarea 与移动键盘由 `ime/` 子域独立维护；连接健康、尺寸、主题、viewport 和用户活动只通过注入的公开命令或只读 getter 使用。移动端 `inputViewportLock` 仅属于 viewport 几何同步，不阻止字符发送，也不在本次协议删除范围内。

## 公开入口与契约

外部只能从 `terminal/input/index.js` 导入。

- `createTerminalInputController()`：模块单一编排入口，提供 `installSession()`、`send()`、`sendOrQueue()`、`flushPending()`、generated response/suppression、pending expiry 和幂等销毁。
- `createTerminalInputLifecycle()`：管理 input flush/pump/pending-expiry timer 和 Ghostty `onData` disposable。
- `isGeneratedTerminalResponse()`、`isGeneratedTerminalResponseTail()`、`splitTerminalInputChunks()`、`buildTerminalInputQueueItems()`：无状态协议识别和 Unicode/字节预算算法。
- `createTerminalIMEController()`：管理 helper textarea、composition、Android native delete、paste/beforeinput 去重、focus/blur、同步双击键盘和 host 输入隔离；textarea 原生 paste 只转发给注入的应用级 paste controller。
- `createTerminalIMELifecycle()` 与 IME model：管理 session listener/timer/RAF，并提供 sentinel、delete 类型、composition 候选和平台识别纯函数。
- `createMobileShortcutsController()`：管理移动终端快捷键栏、sticky modifier、触感反馈、触摸长按重复和键盘保活；动作通过显式回调交给应用层。
- `createMobileShortcutsLifecycle()`：管理快捷键按钮 listener、重复 timeout/interval 和销毁。

用户输入与 generated response 必须显式分类。generated payload 带 `generated: true`，普通输入继续带当前 cols/rows、pixel size 和已应用 resize epoch。单 pane 输入失败只能触发该 pane 的 logical 恢复，不能关闭 Unified 物理连接。

## 状态所有权

`input_controller.js` 是 `pendingInput*`、`inputBuffer*`、`inputQueue*`、`suppressGeneratedTerminalInputUntil` 和 `processingGeneratedTerminalResponses` 的唯一运行时修改者。session state 只负责建立初始字段，transport/history/resize/rendering 只能通过 controller 公开 API 观察或触发输入动作。不存在跨页面或跨 attach 的输入锁状态。

`input_lifecycle.js` 独占三个 input timer 和 `term.onData` disposable。`input_model.js` 不保存业务状态。

`ime/ime_controller.js` 是 `composingIME`、composition 候选、post-composition 去重、native delete、主动聚焦与 touch claim、helper textarea anchor 和 paste 去重的唯一修改者；`ime_lifecycle.js` 独占对应 session listener、timer 与 RAF。有效用户请求直接同步聚焦，不通过跨模块的时限许可；被动恢复不能抢焦点。TUI 和 mouse 取消触摸默认行为前必须读取 `shouldPreserveTouchDefault(event)`。

## 生命周期

`installSession()` 绑定一个 session 的 Ghostty data listener，并把 disposable 注册到 session cleanup。pane close 会先清 pending/buffer/queue 和 timer，再移除 listener；页面 `dispose()` 会清理所有仍存在 session 并拒绝迟到 timer/data callback。

pending input 的过期 timer 绑定当前 logical channel generation 或 client lease。lease 变化时暂停而不是丢弃用户输入；当前 lease 仍在 replay 或等待 resize ACK 时只触发连接健康恢复并重新计时。resize ACK ready gate 只允许等待当前 connection 的事务：connection transition 必须由 resize owner 退休旧 ACK 并迁移 latest claim，输入模块不自行清除 `resizeAckPending`，新 replay/resize 完成后按原顺序 flush。

## 文件清单

- `index.js`：唯一公开入口。
- `input_controller.js`：输入分类、ready gate、队列、背压、pending expiry、payload 和 session 编排。
- `input_lifecycle.js`：timer 与 Ghostty `onData` disposable 生命周期。
- `input_model.js`：generated response 识别、Unicode 安全分块和字节预算纯函数。
- `key_overrides/`：Ghostty custom key handler、Alt ESC 前缀、backtab 和 sticky modifier 转换；目录根部有独立 README 和公开入口。
- `ime/`：已迁移的 IME、helper textarea、移动键盘手势与 iOS 宿主子域，目录根部有独立 README 和公开入口。
- `mobile_shortcuts/`：移动快捷键 UI 与交互子域，目录根部有独立 README 和公开入口。
- `../policy/`：终端身份和 fullscreen/滚动策略子域，目录根部有独立 README 和公开入口。

## 依赖、guard 与最小回归

依赖方向为 app/workspace -> input -> transport/resize/theme/viewport 的注入接口；input 不得深度导入 app/paste、attachments、transport、history、rendering 或 resize 实现。IME 只能通过 `sendInput`、`pasteText`、`handleNativePaste`、resize 和 viewport 的注入命令交互。

自动化测试：`terminal_input_controller_test.mjs`、`terminal_ime_controller_test.mjs`、`terminal_mobile_shortcuts_controller_test.mjs`、`app_paste_controller_test.mjs`、`TestTerminalInputControllerBehavior`、`TestRuntimeTerminalInputModuleBoundary`、移动快捷键行为与边界 guard，以及 large paste、generated response、input readiness、旧 `input_lock` no-op、IME composition、Android delete、同步双击和 session cleanup guard。真实跨 attach 回归由 `spec-tests/terminal/input-lock-lifecycle` 覆盖，真实系统文本/图片和文件 paste 由 `spec-tests/app/paste` 覆盖。

最小真实回归：在 `debug123` 验证普通输入、Enter/Ctrl-C、长文本粘贴、generated DSR/Kitty response、断线或 logical stream 重建期间输入排队及恢复；确认 resize ACK 前不发送携带新网格的用户输入，历史回放中间过程不可见，单页仍只有一条 Unified 物理 WebSocket，console/pageerror/API error 为零。

## 恢复边界的输入顺序

resize ACK 可在 presentation/onReady 之前打开输入 gate。sendOrQueue 必须先按顺序转交旧 pendingInput，再接受新文字/回车；不能让新输入绕过恢复期间积累的前缀。flushPending 只移除 send 已接受的条目，失败时保留尚未接受的数据和字节预算。真实基线与验证由 spec-tests/investigations/network-presentation-recovery 和 terminal/resize-sync 记录。
