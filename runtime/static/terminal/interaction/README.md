# 终端交互模块

## 职责

本目录负责终端本地交互责任域。当前包含上下文菜单、终端内容搜索、剪贴板和链接：桌面右键菜单、移动端操作菜单、菜单目标、搜索 query/match/index、逻辑行匹配、复制/粘贴、桌面拖选自动复制、中键粘贴、URL 识别/cell 命中/打开/复制，以及对应 listener/timer/异步操作的安装和清理。

选择范围、完整缓冲区选择状态和移动端选择手柄由 `terminal/selection/` 维护；终端 mouse protocol 与事件所有权由 `terminal/mouse/` 维护。它们只能通过本模块公开方法标记触摸候选、查询菜单/搜索状态或调用剪贴板/链接命令，不能直接修改菜单、搜索、剪贴板或链接内部状态。

## 公开入口与契约

外部只能从 `terminal/interaction/index.js` 导入：

- `createTerminalContextMenuController()`：唯一编排入口，公开 `start()`、`bindPane()`、`bindTab()`、`openMobile()`、`close()`、`closeMobile()`、`refreshMobile()`、`isDesktopOpen()`、`isMobileOpen()`、`isAnyOpen()`、`markTouchCandidate()`、`shouldSuppressContextMenu()` 和 `dispose()`。
- `createTerminalContextMenuView()`：模块内部 DOM 适配和测试入口。
- `createTerminalInteractionLifecycle()`：模块内部永久/动态 listener 管理和测试入口。
- `createTerminalSearchController()`：搜索状态与动作编排入口，公开 `start()`、`open()`、`openFromSelection()`、`close()`、`setQuery()`、`move()`、`refresh()`、`isOpen()` 和 `dispose()`。
- `createTerminalSearchView()`、`createTerminalSearchLifecycle()`：搜索 DOM 与 listener/延迟聚焦资源适配。
- `createTerminalClipboardController()`：公开 `start()`、`installSession()`、`copyText()`、`readText()`、`getSelectedText()`、`copySession()`、`pasteSession()`、`copyCurrentSelection()`、`bindDesktopSession()` 和 `dispose()`。`installSession()` 只观察 live `term.write` 中的 OSC 52 写入并复制到浏览器剪贴板，不认领鼠标或右键，不处理 history replay 的 `writeReplay`，也不响应 OSC 52 读取查询。
- `createBrowserClipboardAdapter()`：浏览器 Clipboard API、权限错误归一化和隐藏 textarea fallback。
- `createTerminalClipboardLifecycle()`：桌面拖选/中键 listener 的动态注册和清理。
- `createTerminalLinkController()`：链接识别、指针 cell 命中、打开和复制反馈入口，公开 `start()`、`findFirst()`、`findAtPosition()`、`open()`、`copy()` 和 `dispose()`。
- `findFirstTerminalURL()`、`findTerminalURLAtPosition()`：无状态 URL 匹配和终端逻辑行/cell 映射算法。
- `buildTerminalLogicalLines()`、`terminalFullBufferText()`、`terminalLogicalLineAt()`：无状态终端逻辑行模型，供搜索、链接以及尚在迁移中的选择代码读取。

调用方只注入只读 tab/pane 查询、活动 tab/session getter、选择文本/链接读取，以及复制、粘贴、搜索、截图、分屏、移动和关闭等显式命令。模块不直接修改 tab registry、pane registry 或终端 session 状态。

## 状态所有权

`context_menu_controller.js` 是以下状态的唯一 owner：

- 当前 desktop/mobile context target。
- 移动端菜单打开后 350ms 的误点击门禁。
- 最近触摸位置和 1400ms 合成 `contextmenu` 抑制窗口。
- 菜单动作的可用性判断和动作分派顺序。

`search_controller.js` 是 query、match 列表、当前 match index、搜索 session ID 和面板打开状态的唯一 owner。`search_model.js` 与 `terminal_text_model.js` 只执行无状态读取和匹配，不持有 session、DOM 或异步资源。

`clipboard_controller.js` 是复制、主动读取文本粘贴、桌面剪贴板交互和 OSC 52 写入落地的唯一 owner。选择文本和完整缓冲区状态通过 selection controller 的显式读取/清理命令注入；本模块不再直接修改 terminal session 的选择字段。异步读取完成后必须重新校验 dispose 和 session closed 状态。主动 `clipboard-read` 被拒绝时先显示可操作反馈，再通过注入命令聚焦原生 paste 目标；原生事件的文件/文本分流归 `app/paste`。TUI 通过 OSC 52 写出的选区只写入浏览器剪贴板，不弹出第二份复制 toast，也不把右键或拖选从 TUI 手中抢走。

`link_controller.js` 是链接打开、复制反馈和迟到复制结果 guard 的唯一 owner。`link_model.js` 只读取终端逻辑行和字符到 cell 映射，不持有 session、DOM、selection、socket 或异步资源。

工作区 tab/pane、终端选择范围、Ghostty、WebSocket、history cursor、resize epoch 和输入队列仍由各自模块拥有。本模块只读取注入的只读视图并调用显式命令。

## 生命周期与清理

`start()` 幂等注册桌面菜单、移动菜单、document 外部点击/Escape 和 window resize listener。`bindPane()` 保持 capture 抑制监听早于普通菜单展示监听；`bindTab()` 只绑定对应标签按钮。二者返回幂等 cleanup，pane/session 或 tab 销毁时必须立即调用。

搜索 `start()` 幂等安装 input、keydown 和三个按钮 listener；延迟聚焦 timer 由 `search_lifecycle.js` 独占。搜索 `dispose()` 会取消该 timer、移除 listener、隐藏面板并拒绝迟到动作。

剪贴板 `start()` 启用动态 session 绑定；`bindDesktopSession()` 返回幂等 cleanup，并由 terminal session lifecycle 持有。`clipboard_lifecycle.js` 统一清理 shell mousedown/auxclick 和 document mousemove/mouseup listener；`dispose()` 后迟到 Clipboard Promise 不得发送输入或修改选择 UI。

链接 `start()` 是幂等生命周期入口，不注册 listener。`dispose()` 递增异步 operation generation；已经开始但尚未完成的复制结果不得再显示反馈，后续 URL 查询、打开和复制都必须拒绝。

上下文菜单 `dispose()` 幂等移除永久和动态 listener，关闭两类菜单，清空移动菜单 DOM，并使后续绑定、触摸候选和菜单动作失效。整个模块不建立 RAF、observer 或 socket；所有异步动作错误只通过注入的反馈出口上报。

## 文件清单

- `index.js`：单一公开入口。
- `context_menu_controller.js`：状态 owner、动作可用性、动作编排、触摸抑制和 pane/tab 绑定入口。
- `context_menu_view.js`：上下文菜单 DOM 查询、分组显隐、定位、移动菜单构建和 aria/body 状态。
- `interaction_lifecycle.js`：永久与动态 DOM listener 的注册和幂等清理。
- `clipboard_adapter.js`：Clipboard API、权限错误和复制 fallback DOM。
- `clipboard_controller.js`：选择文本读取、复制/粘贴编排、bracketed paste、OSC 52 写入落地、迟到异步 guard 和桌面剪贴板手势状态。
- `clipboard_osc52_model.js`：OSC 52 分片拼接、BEL/ST 终止和 base64 文本解码纯函数；忽略读取查询和空 payload。
- `clipboard_lifecycle.js`：桌面拖选与中键 listener 的注册和幂等清理。
- `search_controller.js`：搜索状态 owner、打开/关闭、query 更新、结果移动和选区搜索编排。
- `search_view.js`：搜索面板 DOM 查询、输入值、计数和焦点适配。
- `search_lifecycle.js`：搜索 listener 和延迟聚焦 timer 的生命周期。
- `search_model.js`：大小写不敏感匹配和绝对行滚动算法。
- `terminal_text_model.js`：终端物理行到逻辑行、字符到 cell 坐标映射及完整缓冲区文本读取。
- `link_controller.js`：链接命令编排、浏览器打开参数、复制反馈和 dispose generation guard。
- `link_model.js`：URL scheme 匹配、尾部标点剥离和指针 cell 命中算法。

## 依赖、guard 与最小回归

允许依赖浏览器 DOM、工作区只读视图、选择/链接只读查询和显式业务命令。禁止依赖或修改 transport、history replay、Cache API v2、resize controller、Ghostty presentation 或输入 readiness。

相关测试为 `terminal_context_menu_controller_test.mjs`、`terminal_search_controller_test.mjs`、`terminal_clipboard_controller_test.mjs`、`app_paste_controller_test.mjs`、`terminal_link_controller_test.mjs`、Claude fullscreen 右键/桌面选择隔离测试、触摸选择 guard、长截图菜单 guard 和 `TestRuntimeTerminalInteractionModuleBoundary`。最小回归包括：pane/tab 桌面右键、普通及跨物理换行 URL、尾部标点剥离、指针 cell 命中、链接 `_blank/noopener/noreferrer` 打开、链接复制和迟到结果拒绝、搜索、普通/bracketed paste、完整缓冲区复制、Clipboard 权限失败后的反馈与原生焦点、桌面拖选自动复制、中键粘贴、pane 关闭或 dispose 后迟到读取不发送输入、Claude fullscreen 事件所有权，以及 dispose 后 listener/timer 不再触发。真实系统 paste 由 `tests-auto/16-attachment-native-paste/` 覆盖。

菜单和动作不得清空终端、触发历史 replay/reset、改变 resize owner 或展示 replay、snapshot、resize、重连的中间过程。
