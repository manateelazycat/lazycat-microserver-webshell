# 终端总览模块

## 职责

本目录负责标签总览的打开/关闭、卡片渲染、分屏 Canvas 缩略图、标签选择/关闭/拖拽排序、移动端边缘手势和浏览器历史 guard。

总览只观察工作区 tab/pane，并通过显式命令请求新建、激活、关闭和移动标签。它不建立 WebSocket、不修改 history cursor、不读取或保存 PTY 字节、不恢复 Ghostty 状态，也不决定输入是否 ready。

## 公开入口与契约

外部只能从 `terminal/overview/index.js` 导入：

- `createTerminalOverviewController()`：唯一编排入口，公开 `start()`、`open()`、`close()`、`isOpen()`、`scheduleRender()`、`capturePreview()`、`captureAllPreviews()`、`deletePreview()`、`consumeHistoryBack()`、`updateWorkspaceLocation()` 和 `dispose()`。
- `createTerminalOverviewView()`、`createTerminalOverviewLifecycle()`：内部组合与测试入口。
- `createTerminalOverviewPreviewController()`：缩略图 capture/load/decode 的 generation 与生命周期 owner。
- `createTerminalOverviewPreviewStore()`：独立 IndexedDB 图片记录 store；只接受 identity、图片 Blob 和尺寸元数据。

controller 独占打开状态、render/focus RAF、拖拽/长按/placeholder/自动滚动、重排 timer、移动边缘手势和历史 guard。view 独占 DOM/Canvas 绘制，lifecycle 独占永久与临时 listener。

总览 preview 只能作为总览缩略图。来源优先级固定为：已完成提交的 live Canvas、identity 仍有效的 `terminal-frame-hold`、独立 IndexedDB 中同 selector/workspace/tab/pane identity 的图片 Blob。持久缩略图只能从 replay 已提交且 presentation 当前的 live Canvas 捕获；history generation 已知后必须严格匹配。三类来源都不存在时才显示空缩略图。

IndexedDB 数据库 `lcmd-webshell-overview-previews-v1` 最多保留 64 项并清理 30 天未更新记录。它不保存 raw PTY、history chunk、cursor、terminal checkpoint、Ghostty buffer 或 Cache API 状态，也不能参与 snapshot、replay、resize、输入 ready 或连接恢复。它与 `client:` 的 IndexedDB 历史兼容数据库是两个独立责任域。

## 状态所有权

`overview_controller.js` 独占总览打开状态、render/focus RAF、拖拽和移动手势。`preview_controller.js` 独占每个 pane 的 capture/load generation、debounce timer 和已解码图片生命周期；`preview_store.js` 独占 IndexedDB transaction、容量与过期清理。外部只能提供只读 capture 授权和已提交 Canvas，不能直接修改这些状态。

## 生命周期与清理

`start()` 幂等注册 listener 并启动过期记录清理；稳定 presentation 以 320ms 有界节流捕获最新缩略图，持续输出不会无限推迟落盘，页面隐藏时可做一次尽力而为的即时捕获。全局 runtime 在 terminal live geometry 期间拒绝 capture 授权，避免为每个拖拽帧编码 Canvas；最终几何提交后由稳定 presentation 补一次最新预览。pane 被真实删除时删除对应记录；应用整体 dispose 只关闭数据库连接，不清空仍有效记录。

`dispose()` 取消所有 RAF/timer、结束拖拽、关闭已解码图片、使 capture/load generation 失效、移除 listener 并关闭总览。迟到的 encode、IndexedDB request 或 image decode 不得修改 UI 或覆盖新 identity。history generation 变更后的旧图片只是不再展示，不通过无条件 key 删除，避免迟到清理误删同 pane 的新 generation 图片；后续 capture 或 TTL/容量清理负责回收。

## 文件清单

- `index.js`：单一公开入口。
- `overview_controller.js`：状态 owner、缩略图来源选择、拖拽排序、历史 guard 和移动端手势。
- `overview_lifecycle.js`：DOM listener 注册和幂等清理。
- `overview_view.js`：DOM 查询、卡片构建、响应式网格和分屏 Canvas 绘制。
- `preview_controller.js`：已提交 Canvas 的有界编码、持久图片加载/解码和 latest-only guard。
- `preview_store.js`：独立 IndexedDB 图片记录、identity key、容量和过期清理。

## 依赖与验证

允许依赖浏览器 DOM、工作区只读视图、presentation frame 查询、独立图片 Blob store 和显式工作区命令；禁止依赖 transport、PTY history store、replay、resize controller 或输入状态机。

相关测试为 `terminal_overview_controller_test.mjs`、`terminal_overview_preview_test.mjs`、`TestRuntimeTerminalOverviewModuleBoundary` 和 `spec-tests/terminal/overview-preview`。最小回归包括 live/hold/persisted 来源优先级、跨 reload 后台 tab 预览、identity/history generation 隔离、迟到 encode/decode、切换/关闭/新建标签、桌面拖拽、触摸长按拖拽、双侧边缘打开、浏览器返回键和 dispose 资源清理。

任何路径都不得显示历史 replay、snapshot、原子 resize 或重连中间过程，也不能把它们保存为缩略图；live geometry 期间同样不做中间帧编码。
