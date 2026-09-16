# Settings 模块

## 职责

`settings/` 是前端设置域的唯一状态 owner，负责服务端设置快照、字段级 PATCH 持久化、终端字体注册、设置面板导航、重启恢复开关、手机/PC 快捷键编辑器以及本模块的 listener、timer、拖拽和异步请求生命周期。

本模块不持有 tab、pane、session、WebSocket、history、replay、resize 或 Canvas 呈现状态。字体、字号、行高、scrollback 和移动布局变化只通过构造参数中的显式回调交给终端运行时适配层。设置变化不得触发、管理或展示历史回放过程。

## 公开入口

外部只能从 `settings/index.js` 导入：

- `createSettingsController(options)`：创建设置控制器。
- 终端输入层需要的纯快捷键契约，例如 `getShortcutKeyFromEvent`、`resolveMobileShortcutInputData` 和 `BACKTAB_SEQUENCE`。
- 终端初始化需要的只读默认值和归一化函数。

controller 对外提供只读快照/getter、`start()`、`load()`、`open()`、`close()`、`openTheme()`、`flushPending()`、`dispose()` 和快捷键解析/字号命令。返回的数组与对象均为副本，调用方不能反向修改设置状态。

## 状态所有权

`settings_controller.js` 独占以下可变状态：

- 服务端设置 snapshot 和本地字号、强制 PC、移动远程桌面偏好。
- PATCH 串行队列、pending 字段 overlay、请求 generation 和 AbortController。
- 字体编辑选择、两套快捷键编辑器、手机快捷键拖拽状态。
- 面板移动导航状态、focus/scroll/debounce timer 和 scrollback keepalive 值。
- PC 快捷键到动作的派生索引。

`global-runtime.js` 只通过 getter 消费状态，并在显式适配回调中更新现有终端运行时。

## PATCH 契约

- 每次保存只发送被修改的字段，禁止构造完整设置快照覆盖其他字段。
- `terminal_font_id: ""` 表示系统默认字体。
- `mobile_shortcuts: null`、`desktop_shortcuts: null` 表示恢复默认。
- `[[], []]` 和 `[]` 分别表示显式空手机/PC 快捷键配置。
- 手机快捷键 `text` 原样保留空格、换行和制表符，不得 `trim()`。
- 并发修改通过 pending overlay 防止较早 PATCH 响应覆盖尚未完成的较新字段。
- 行高 PATCH 响应不重复注册或刷新未变化的字体族，避免在行高 live geometry 结束后额外开启 presentation hold；字体选择、上传、删除和初始 load 仍执行字体注册。
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

相关 guard：`settings_controller_test.mjs`、`workspace_test.go` 的 PATCH 语义测试、`TestRuntimeSettingsModuleBoundary`、终端快捷键/字体/scrollback 静态契约和版本化资源/LPK 内容检查。

最小回归步骤：加载设置、切换布尔项、修改字号/行高/scrollback、上传和删除字体、保存/重置/清空两套快捷键、关闭并重新打开面板、触发 pagehide，再确认终端当前画面没有出现历史回放中间过程。
