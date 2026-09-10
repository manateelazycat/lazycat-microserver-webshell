# 应用级原生粘贴编排

## 职责

`paste/` 负责一次浏览器原生 `paste` 事件在附件上传和终端文本输入之间的唯一分流：文件优先，文本降级；文件上传完成后把远端路径发送回触发操作的原 pane。

本模块不读取 Async Clipboard API，不拥有附件上传、终端输入队列、WebSocket、pane registry、IME composition 或文件选择器 UI。主动剪贴板读取仍由 terminal interaction/attachments 各自负责；上传和输入通过注入的公开命令完成。

## 公开入口和契约

外部只能从 `app/index.js` 导入：

- `createAppPasteController()`：公开 `start()`、`handleNativePaste(session, event)`、`handleDroppedFiles(session, files)` 和幂等 `dispose()`。
- `nativePasteFiles()`：从 `DataTransferItemList`/`FileList` 提取一次去重后的文件列表。
- `nativePasteText()`：读取原生事件携带的 `text/plain`。
- `formatPastedAttachmentPaths()`：把远端路径格式化为不会携带 CR/LF 的 POSIX shell 参数序列。

`handleNativePaste()` 同步决定事件是否被消费并返回 `{ handled, kind, text, files, completion }`；异步上传和路径输入通过 `completion` 报告结果。文件数据存在时不得同时发送派生文本。`handleDroppedFiles()` 复用同一条上传和原 pane 路径写入，不拥有 drag/drop 或文件选择器事件；桌面拖放和移动端「上传文件」都把选中的文件交给它。

## 状态所有权和生命周期

`paste_controller.js` 是以下状态的唯一 owner：

- controller 的 started/disposed 状态和 dispose generation。
- 已处理原生事件的 `WeakSet`，避免同一事件在 textarea/host 两层重复处理。
- 尚未完成的上传 continuation；每个 continuation 捕获触发时 session 和 controller generation。

上传完成后必须同时确认 controller 未销毁、generation 未变化、session 未关闭且仍由 workspace registry 持有，才能发送路径。`dispose()` 递增 generation 并拒绝所有迟到 continuation，不取消由附件模块拥有的 XHR。

## 文件清单

- `index.js`：子模块公开入口。
- `paste_model.js`：文件提取、文本读取和路径格式化纯函数。
- `paste_controller.js`：事件消费、文件/文本分流、异步 guard 和反馈编排。

## 依赖和验证

依赖方向为 `global-runtime -> app/paste -> 注入的 attachments/terminal 命令`。模块不得深度导入附件、终端、workspace 或全局 runtime 实现。

行为测试为 `tests/app_paste_controller_test.mjs`。真实回归为 `tests-auto/16-attachment-native-paste/`、`tests-auto/21-attachment-file-drop/` 和 `tests-auto/25-attachment-mobile-upload-path/`，覆盖 PC/mobile 原生文本、系统 PNG、DataTransfer 文件、桌面手动上传后粘贴、桌面拖放、移动端文件选择上传、真实 Provider/PTY/API、Canvas 和 Unified WebSocket。
