# 外观模块

## 职责

`appearance/` 负责浏览器侧的主题目录、当前主题、主题持久化、页面 CSS 变量、浏览器 `theme-color`、主题选择器、设置页主题列表，以及这些 DOM、手势、滚动条、异步请求和 listener 的生命周期。宿主接入与 lzc-music 一致：初始 HTML 使用 `lzcapp-navigation-bar-scheme=hidden`、`lzcapp-disable-dark=true`、`mobile-web-app-capable=yes` 和 `apple-mobile-web-app-status-bar-style=black-translucent`，安全区读取宿主变量并回退到浏览器 env；不调用全屏/控制栏切换，也不单独覆盖 Android inset。既有 iOS 关闭按钮隐藏由宿主接入脚本维护，主题变化只同步页面颜色和 `theme-color`。

本模块当前只接管主题责任域。字体文件、字体选择、字号、行高和 scrollback 由 `settings/` 与终端 metrics/resize 模块维护，通过公开契约接入，不能重新把实现放回 `global-runtime.js`。

本模块不负责 tab/pane、终端 session、Ghostty renderer、WebSocket、历史、缓存、resize、输入或 Canvas presentation。主题变化只通过 `onThemeChange(theme, previousTheme)` 发布；外部 rendering 适配层负责使用既有 presentation hold 更新终端。主题变化不得触发历史 replay，更不得显示历史回放过程。

## 公开入口与契约

外部只能从 `appearance/index.js` 导入 `createAppearanceController(options)`。

Controller 的主要公开 API：

- `start()` / `dispose()`：幂等启动和销毁模块。
- `load()`：从随版本资源加载 `themes.json`；并发调用共享同一 Promise，dispose 或 generation 变化会拒绝迟到结果。
- `getActiveTheme()`：返回当前主题副本，调用方不得修改模块内部状态。
- `getTerminalTheme()`：返回供 Ghostty options 使用的主题副本。
- `getTerminalThemePayload()`：返回标准化的 `foreground`、`background`、`cursor` 协议颜色。
- `applyTheme(themeID)`：提交主题、持久化、更新文档与列表，然后发布主题变更回调。
- `openPicker()` / `closePicker()` / `isPickerOpen()`：管理移动主题选择器。
- `renderSettingsThemes()` / `hideSettingsScrollbar()`：供 settings 面板通过公开 API 协调主题视图。
- `handleResize()`：重新测量并绘制主题卡片，不触碰终端 resize。
- `snapshot()`：返回不可变测试/诊断快照。

`onThemeChange` 是唯一终端集成出口。回调收到主题副本；appearance 不读取 session registry，也不直接调用 renderer、socket、replay 或 resize API。

## 状态所有权

`appearance_controller.js` 是以下状态的唯一 owner：

- 主题 catalog 与 active theme。
- localStorage key 和 catalog request generation/AbortController。
- picker 打开后的 focus timer。
- 自定义滚动条 RAF、drag pointer、thumb offset 和 hover 状态。
- 移动端边缘滑动状态。
- 设置页主题滚动条 hide timer。
- lifecycle、start 和 dispose 状态。

`appearance_view.js` 只缓存本模块 DOM 引用并执行同步 DOM 适配；`theme_preview.js` 只测量和绘制 Canvas；`theme_model.js` 只执行主题归一化、复制与颜色转换；它们都不能成为业务状态 owner。

## 生命周期与清理

`start()` 只注册一次 picker、两个主题列表、设置主题滚动、touch、pointer 和 window drag listener，并渲染当前 fallback/stored theme。`load()` 使用版本化模块 URL 解析同目录 `themes.json`，成功后原子替换 catalog；失败保留内置 fallback。

`closePicker()` 会取消迟到 focus、结束 drag、清理 hover/edge swipe 并同步滚动条。`dispose()` 会：

- abort catalog 请求并递增 generation。
- 移除全部模块 listener。
- 取消 focus timer、scroll hide timer 和 scrollbar RAF。
- 关闭 picker，结束 drag 并清理 DOM transient class。
- 拒绝 dispose 后的主题提交和迟到 catalog 结果。

## 文件清单

- `index.js`：唯一公开入口。
- `appearance_controller.js`：主题状态、模块编排、generation、公开 API 和资源清理。
- `appearance_lifecycle.js`：picker、列表、scroll、touch、pointer 和 window listener 的注册与移除。
- `appearance_view.js`：主题 DOM、CSS variables、浏览器 theme-color、列表和滚动条适配。
- `theme_catalog.js`：内置 fallback catalog、版本化 `themes.json` URL 和可取消 loader。
- `theme_model.js`：主题复制、选择、归一化和终端颜色纯函数。
- `theme_preview.js`：主题卡片测量与 Canvas 绘制。
- `runtime_controller.js`：主题变更到 live terminal 的 presentation hold、颜色映射、光标保持和广播；不执行历史回放或连接管理。
- `themes.json`：随版本发布的主题 catalog 数据。

## 依赖方向与回归

模块只依赖浏览器标准 API 和自身文件。外部通过回调提供弹层互斥、移动布局判断、picker backdrop 后的 pane 聚焦和终端主题应用；模块不得反向导入 diagnostics、devices、instances、settings、workspace 或 terminal 实现。

相关 guard：

- `appearance_controller_test.mjs` 覆盖 catalog 单飞、stored theme、不可变快照、主题提交、终端颜色、dispose、listener、滚动/触摸和迟到请求。
- `TestRuntimeAppearanceModuleBoundary` 固定公开入口、README、controller/lifecycle 状态边界、版本化 catalog URL、`global-runtime.js` 公开集成和旧实现删除。
- 现有终端 presentation、OSC 颜色、IME composition preview 和设置测试继续保护外部适配行为。

最小回归：桌面设置页切换主题；移动主题 picker 点击、左边缘右滑关闭和自定义滚动条拖动；刷新后确认选择持久化；切换主题时确认全部 pane 保留旧帧直至当前内存状态完成 full render，且网络、断线或主题变化期间都不出现历史回放过程。
