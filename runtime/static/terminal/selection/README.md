# 终端选择模块

## 职责

本目录负责终端文本选择的完整责任域：Ghostty selection manager 兼容补丁、选区 cell/range/text 算法、完整缓冲区选择状态、移动端选择工具栏与手柄、长按选择、拖动调整、边缘自动滚动，以及对应 listener、timer 和 disposable 的生命周期。

本模块不负责终端鼠标协议、TUI 身份识别、Clipboard API、搜索实现、输入传输、history replay、resize 或 Canvas presentation。调用方只能通过公开方法查询或修改选择，并把复制、粘贴、搜索、pane 激活和输入失焦作为显式命令注入。

## 公开入口与契约

外部只能从 `terminal/selection/index.js` 导入：

- `createTerminalSelectionController()`：唯一状态与编排入口，公开 `start()`、`installSession()`、`observeSession()`、`prepareManager()`、`syncRuntimeReferences()`、`selectAll()`、`selectStringAtCell()`、`clear()`、`clearFullBufferSelection()`、`getSelectedText()`、`hasSelection()`、`isFullBufferSelection()`、`cellFromPoint()`、`apply()`、`clearIfTapOutside()`、`update()`、`updateHandles()`、`updateAutoScroll()`、`stopAutoScroll()`、`isSheetOpen()`、`disposeSession()` 和 `dispose()`。
- `createTerminalSelectionView()`：选择工具栏、移动 overlay/handle 和 point-to-cell DOM 适配。
- `createTerminalSelectionLifecycle()`：永久与 session listener、timeout、interval 和 disposable 的幂等清理。
- `selection_model.js` 导出的 cell/range/text 函数：无状态选择算法和 Ghostty 行读取。

TUI adapter 和 mouse protocol 只能调用 controller 的 `cellFromPoint()`、`selectStringAtCell()`、`apply()`、`clearIfTapOutside()`、`updateHandles()`、`updateAutoScroll()` 与 `stopAutoScroll()`；不得直接修改 selection manager 或完整缓冲区选择状态。

`selectStringAtCell(session, cell)` 用触摸位置读取完整字形并扩选连续字符串，返回已应用的初始范围或 `null`。英文单词、文件名和路径保留内部连接符；中文以空白、标点和终端边框为边界。宽字符续格映射到完整字形，组合字符及 emoji 沿用原始字形文本；空白或边界字符只选当前位置，不强制补选下一格。只对明确的 active-screen 软换行拼接相邻行，不从满行外观推断历史行或 TUI 列的连接关系；扫描至多 32 行、相邻扩展至多 8192 个字形，不遍历完整历史。

长按后的手指拖动通过 `apply(..., { initialRange })` 扩展原范围，细微抖动或回到原字符串内不缩回两格；松手后的手柄继续使用普通 cell 选区调整，可缩小范围。`allowSingleCell` 只用于明确单格选择，复用 manager 现有 `webshellForceSelection` 兼容补丁。桌面双击字符串和普通拖选规则保持原路径。

## 状态所有权

`selection_controller.js` 是完整缓冲区选择、manager 补丁安装状态和所有选择命令的唯一 owner。完整缓冲区选择使用模块私有 `WeakSet`，不再写入共享 terminal session 字段。

`selection_view.js` 独占 `selectionSheet`、移动快捷键选择标记以及每个 session 的 overlay/handle DOM，并通过私有 `Map` 绑定 session。`selection_lifecycle.js` 独占 listener、timeout、interval 和 disposable；迟到 timer 在 session 或模块销毁后不得继续修改选择。

`selection_model.js` 不持有 DOM、session registry、timer、socket 或可变状态。

## 生命周期与清理

`start()` 幂等安装选择工具栏 listener。`installSession()` 必须位于输入 focus 安装之后、Claude/opencode/herdr/pi 专用触摸适配器和通用 mouse tracking 之前，以保持 iOS 同步双击 focus 与 TUI 手势所有权顺序。

每个 session 的 overlay、handle listener、长按 timeout、自动滚动 interval、scroll/selection disposable 和 manager 补丁恢复都由 `disposeSession()` 清理；该方法通过 terminal session lifecycle 注册并可重复调用。`dispose()` 会清理全部 session 与全局资源，后续动作全部拒绝。

## 文件清单

- `index.js`：单一公开入口。
- `selection_controller.js`：选择状态 owner、manager 补丁、命令编排、长按/手柄/自动滚动状态机。
- `selection_model.js`：cell 比较、范围归一化、前后 cell、选区包含判断和 Ghostty 选择文本提取。
- `selection_view.js`：工具栏、移动 overlay/handle、几何定位和 point-to-cell DOM 适配。
- `selection_lifecycle.js`：全局与 session listener、timeout、interval 和 disposable 生命周期。

## 依赖、guard 与最小回归

允许依赖 Ghostty 的公开 terminal/selection manager 读取接口、浏览器 DOM、布局只读判断和注入的选择命令。禁止创建 WebSocket、读取或写入 history/cache、触发 terminal reset/replay、拥有 resize epoch，或绕过 presentation guard 提交 Canvas。

相关测试为 `terminal_selection_controller_test.mjs`、触摸选择 Go guard、Claude fullscreen touch/desktop selection 隔离测试、剪贴板和上下文菜单测试。最小回归包括：普通选择复制、完整缓冲区复制、双击字符串、移动长按、手柄跨行、边缘自动滚动、点按选区外清除、工具栏复制/粘贴/搜索/清除、桌面自动复制、pane 销毁清理，以及 input focus -> 默认选择 -> TUI adapter -> 通用 mouse tracking 的安装顺序。

任何选择操作都不得清空终端、触发或显示 history replay、snapshot、resize 或重连中间过程。

长按字符串手工回归：手机和平板分别长按英文单词、文件路径、中文短句、宽字符右半格及组合字符，确认连续内容自动选中；在空白/标点处长按不带出相邻内容。确认长按后轻微移动仍保留初始范围，手柄可缩小/跨行调整；普通终端与 Claude/Codex/opencode 等已适配 TUI 均复用同一规则，滚动和双击键盘保持可用。产品口径见 `spec/terminal/touch-string-selection/`，不新增自动化场景代码。
