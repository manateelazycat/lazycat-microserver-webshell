# Settings 模块

## 职责

`settings/` 是前端设置域的唯一状态 owner，负责服务端设置快照、字段级 PATCH 持久化、终端字体注册、设置面板导航、重启恢复开关、手机/PC 快捷键编辑器以及本模块的 listener、timer、拖拽和异步请求生命周期。

本模块不持有 tab、pane、session、WebSocket、history、replay、resize 或 Canvas 呈现状态。字体、字号、行高、scrollback 和移动布局变化只通过构造参数中的显式回调交给终端运行时适配层。设置变化不得触发、管理或展示历史回放过程。

字体模块下方先显示光标样式，再显示字体大小。字体大小复用历史行数的数字输入、上下增减和恢复默认控件，打开时显示当前字号；输入范围沿用 10–32px，恢复默认为 16px。手动输入停止 360ms 或触发 change 后，统一调用 `setTerminalFontSize()`，沿用本机字号存储和现有 metrics 生效流程；快捷键调字号也同步更新输入框。关闭面板及 pagehide 提交尚未应用的有效字号，dispose 清除待提交计时器。服务端设置响应不覆盖正在等待提交的字号输入。

光标样式文本下拉框提供块状、竖线和下划线，默认块状，沿用快捷键编辑器的选择框样式及移动端展开选项交互。`terminalCursorStyle` 属于设置快照，`getTerminalCursorStyle()` 供新建终端读取，`onTerminalCursorStyleChange` 将现有终端的显示更新交给 rendering owner。选项使用原生 select 支持键盘选择。

## 公开入口

外部只能从 `settings/index.js` 导入：

- `createSettingsController(options)`：创建设置控制器。
- 终端输入层需要的纯快捷键契约，例如 `getShortcutKeyFromEvent`、`resolveMobileShortcutInputData` 和 `BACKTAB_SEQUENCE`。
- 终端初始化需要的只读默认值和归一化函数。

controller 对外提供只读快照/getter、`start()`、`load()`、`open()`、`close()`、`openTheme()`、`flushPending()`、`dispose()` 和快捷键解析/字号命令。返回的数组与对象均为副本，调用方不能反向修改设置状态。

`getDesktopShortcutHint(action)` 返回当前配置对应的按键显示文本，供传统标签菜单和新版侧栏菜单复用；新版将左右移动的显示名称转为上下移动，动作值和用户自定义按键保持不变。

## 状态所有权

`settings_controller.js` 独占以下可变状态：

- 服务端设置 snapshot 和本地字号、强制 PC、移动远程桌面偏好。
- 本地传统 PC 布局偏好：`legacyPCLayoutEnabled` 默认关闭，保存在本浏览器的 `webshell.legacyPCLayout`，仅调试模式下生效，通过 `onLegacyPCLayoutChange` 通知布局 owner；服务端设置响应不得覆盖它。PC 快捷键动作在新版布局中以会话名称展示，动作值及用户自定义名称保持不变。
- PATCH 串行队列、pending 字段 overlay、请求 generation 和 AbortController。
- 字体编辑选择、两套快捷键编辑器、手机快捷键拖拽状态。
- 面板移动导航状态、focus/scroll/debounce timer 和 scrollback keepalive 值。
- PC 快捷键到动作的派生索引。

手机快捷键列表通过指针编号分别跟踪长按拖拽与滚动。触摸短按编辑按钮仍进入编辑器；移动超过阈值会取消长按并滚动设置面板。拖拽时另一根手指可独立滚动，拖到面板边缘也会持续滚动并更新插入位置。列表触摸滚动由设置模块维护，包含松手后的惯性；离开页面、关闭设置和销毁 controller 时必须停止计时器、动画帧并恢复被拖动的 DOM。

`global-runtime.js` 只通过 getter 消费状态，并在显式适配回调中更新现有终端运行时。

## PATCH 契约

- 每次保存只发送被修改的字段，禁止构造完整设置快照覆盖其他字段。
- `terminal_font_id: ""` 表示系统默认字体。
- `mobile_shortcuts: null`、`desktop_shortcuts: null` 表示恢复默认。
- `[[], []]` 和 `[]` 分别表示显式空手机/PC 快捷键配置。
- 手机快捷键 `text` 原样保留空格、换行和制表符，不得 `trim()`。
- 并发修改通过 pending overlay 防止较早 PATCH 响应覆盖尚未完成的较新字段。
- 行高 PATCH 响应不重复注册或刷新未变化的字体族，避免在行高 live geometry 结束后额外开启 presentation hold；字体选择、上传、删除和初始 load 仍执行字体注册。
- 光标样式只保存 `terminal_cursor_style`，复用串行队列和失败回滚；保存响应不刷新字体，显示变化只请求完整重绘，不调整终端尺寸。保存期间禁用样式选项，失败时回滚设置和现有终端样式并提示错误。
- 重启恢复开关保存成功后只通过显式回调请求当前普通实例刷新一次 workspace，由服务端建立首份恢复描述；客户端物理机不触发该刷新。

## 生命周期

1. `start()` 注册模块 listener、渲染本地默认状态并启动独立客户端能力检测。
2. `load()` 读取 `api/settings`；generation 不匹配或 dispose 后的响应不得提交。
3. `open()` 只协调公开的 appearance、devices、instances 和 service forwarding 回调。
4. `pagehide` 通过字段级 keepalive PATCH 刷新尚未保存的 scrollback。
5. `dispose()` 清除 timer、拖拽临时 listener、永久 listener、FontFace、请求和迟到回调。

## 文件清单

- `index.js`：唯一公开入口。
- `settings_controller.js`：设置快照、持久化队列、跨子模块编排和生命周期 owner。
- `settings_api.js`：仅访问 Provider 相对路径下的 settings/font API。
- `settings_model.js`：默认值、归一化、序列化、快捷键解析和不可变副本。
- `settings_view.js`：DOM 查询、渲染、表单读写和拖拽 DOM 适配。
- `settings_lifecycle.js`：永久/临时 listener 注册与统一清理。
- `font_registry.js`：FontFace 加载、generation 校验和销毁。
- `shortcut_editor.js`：两套快捷键编辑器的纯校验和列表变换。

## 依赖与验证

依赖方向为 `global-runtime.js -> settings/index.js -> controller -> api/model/view/lifecycle/font_registry/shortcut_editor`。内部文件不得被模块外深度导入。

相关 guard：`settings_controller_test.mjs`、`workspace_test.go` 的 PATCH 语义测试、`TestRuntimeSettingsModuleBoundary`、终端快捷键/字体/scrollback 静态契约和版本化资源/LPK 内容检查。触摸排序、边缘滚动与双指滚动需要在真实移动浏览器中手工核对。

最小回归步骤：加载设置、切换布尔项、修改字号/行高/scrollback、上传和删除字体、保存/重置/清空两套快捷键、关闭并重新打开面板、触发 pagehide，再确认终端当前画面没有出现历史回放中间过程。

光标样式手工回归：在多个已有终端间选择三种样式，新建终端并刷新页面确认保留；阻断设置保存请求确认选项和终端一起回滚且错误可见；输入内容与会话状态保持完整。产品口径见 `spec/terminal/cursor-appearance/`，本次不新增自动化场景代码。

字号手工回归：先用已有快捷键调整字号再打开设置，确认输入框与实际字号一致；手动输入、点击增减及恢复默认后确认即时生效，重开设置/刷新保留；编辑途中使用快捷键不会被旧计时器覆盖，非法值提交后恢复原字号并提示错误。产品口径见 `spec/app/terminal-font-size-settings/`。
