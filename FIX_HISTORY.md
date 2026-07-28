# 历史修复与回归防护记录

本文档用于保存 `lazycat-microserver-webshell` 的架构基线、已确认的历史问题和防止问题复现的 guard。它不是发布日志，也不记录未经证实的猜测或已经否定的方案。

首版建立于 2026-07-27。初始历史条目根据仓库 Git 提交、当前实现和现有测试重建；后续每次 Bug 修复都应在同一次变更中更新本文档。

## 使用规则

### 开始任务前

1. 阅读 `AGENTS.md`、`README.md`、本文档和本次修改涉及的源码、调用方及测试。
2. 在“架构基线”和“长期 guard”中确认状态归属、协议边界、终端历史、平台输入和账号隔离要求。
3. 在“历史修复记录”中搜索相关模块、协议字段、事件类型、缓存字段或错误现象。
4. 修改终端渲染、重连、输入、移动端手势或 agent 时，先画清事件/数据时序，不能只根据最终画面修补表象。

### 修复 Bug 后

1. 在“历史修复记录”末尾新增条目，不覆盖旧条目。
2. 必须写清错误现象、触发条件、根因和最终实施方案，不能只写“已修复”。
3. 必须增加 guard。优先级依次为：行为测试、单元测试、协议/资源契约测试、可重复的设备验证。
4. 涉及终端状态机时，guard 至少覆盖正常路径和一个失败、重连、隐藏或跨账号边界。
5. 执行与改动直接相关的测试，并在风险允许时执行完整测试。无法验证的设备或宿主必须写明。
6. 如果修复改变了架构基线、稳定协议或验证方式，同时更新本文档前半部分。

### 历史记录维护

- 历史条目只追加，不静默删除。原记录有误时追加“更正”说明并引用原条目 ID。
- 一个问题跨浏览器、Provider 后端和 persistent agent 时使用一个主条目，完整记录端到端时序。
- 不能以吞掉错误、过滤日志或静默 fallback 代替根因修复。
- 重构只有在改变了故障边界或 guard 时才记入本文档；普通功能开发不作为历史修复记录。

## 当前架构基线

### 进程与路由

- `main.go` 启动仅监听 `127.0.0.1:8080` 的 Provider 服务，注册静态资源、实例、设置、附件、工作区、设备、版本和 WebSocket 路由。
- LPK 通过 `lzc-manifest.yml` 的 `/=exec://8080` 启动入口，并通过 `lightos.webshell` Resource Export 被 `lightos-admin` 发现。
- 页面静态资源位于 `runtime/static/`，随二进制一起打包。HTML 禁止缓存，CSS/JS/JSON/WASM 使用可重验证缓存策略。

### 管理端、Provider 与目标端边界

- `lightos-admin` 是实例发现、当前用户可见性和发布服务管理的权威入口；Provider 通过公开/白名单接口对接，不读取 Admin 私有状态。
- 对 LightOS 实例，Provider 后端通过 `lightosctl` 进入目标实例，并把 persistent agent 安装和运行在目标实例内。
- 对 `client:<client_instance_id>`，Provider 在服务端重新校验可见性、换取短期票据并代理到客户端本地终端服务。Device API URL、服务凭据和票据不得返回浏览器。
- 浏览器只处理现有 WebShell API 和 WebSocket 协议，不直接调用目标实例或客户端终端服务。

### 工作区与 persistent agent

- `workspace.go` 定义 tab、pane、分屏、活动状态、历史和 PTY 行为；`agent.go`/`agent_runtime.go` 负责 agent 协议、安装、启动、兼容检查和 attach。
- 工作区和 PTY 的权威状态位于目标实例的 persistent agent。Provider 进程重启或浏览器断开不应销毁兼容 agent 中的会话。
- agent scope 至少由完整 selector 和 account ID 组成。socket、缓存、启动错误和请求都必须使用同一 scope，防止同名实例或不同账号串会话。
- agent 协议版本不兼容时应明确报错或执行已设计的升级流程，不能把旧响应当成当前结构继续解析。

### 终端历史与渲染

- LightOS 实例终端历史以 persistent agent 保存的原始 PTY 字节为可信来源；浏览器渲染状态不是历史权威。
- 历史流使用 `history_generation` 和绝对 byte cursor 表示范围。服务端根据本地范围选择 `snapshot`、`delta` 或 `current`，所有 chunk 必须连续。
- IndexedDB 缓存按 selector 和 pane 隔离，并绑定 generation、base cursor、end cursor。缓存无效时可以丢弃并从 agent 重建，但不能把不连续缓存拼接到新 generation。
- `client:` PC target 保持其独立的完整历史协议，不能未经双方协议升级直接套用实例 agent 的增量假设。
- pane 只有在尺寸可测量、fit generation 与 replay generation 都是当前值、canvas 尺寸正确且回放完成后，才能标记为可展示。
- 终端渲染使用随包分发的 Ghostty Web 和明确的 `ghostty-vt.wasm` 路径。本项目禁止引入或仿制 `xterm.js`。

### 输入、移动端与 iOS

- 终端 helper textarea 的 focus、blur、IME、composition、generated response 和用户输入属于同一条状态链，修改时必须检查事件顺序和输入锁。
- iOS/宽触摸屏的键盘唤起必须发生在有效用户手势内。需要抢在终端手势消费者之前观察事件时，使用经过验证的 capture 顺序，不能改成异步延迟后再 focus。
- 单击选择、双击唤起键盘、拖动、长按、终端鼠标协议和快捷键会竞争同一批 touch 事件；修复其中一项必须防止破坏其余路径。
- `runtime/static/ios_terminal_host.js` 只处理 Lazycat iOS 宿主桥接行为，不应扩散为通用浏览器逻辑。

### 设置、附件与设备

- 设置由字体 store 统一持久化。部分更新必须保留未修改字段，并区分“未传”“显式 null”“显式空数组/空行”。
- 附件上传单批最多 32 个文件、单文件最大 2GB；下载一次最多 64 个条目。文件名、路径、符号链接和压缩目录都必须限制在授权目标范围内。
- 设备在线列表是按 account ID 隔离的短 TTL 心跳视图，不是持久设备数据库。`client_id` 不能脱离 account ID 单独作为全局键。

## 长期 guard

| 风险域 | 必须保持的不变量 | 修改时至少检查 |
| --- | --- | --- |
| 账号与 scope | HTTP、WebSocket、agent socket、输入锁、设备和缓存都按账号及完整 target 隔离 | 缺少账号头、跨账号、同名实例、`client:` target |
| agent 生命周期 | 兼容 agent 和 PTY 不因 Provider 重启丢失；安装/升级失败不能伪装成 ready | ping、缓存命中校验、启动超时、协议不兼容、信号继承 |
| 历史同步 | generation 一致、cursor 连续、trim 后绝对范围正确、snapshot/delta/current 选择正确 | 首次连接、刷新、断网重连、服务端 trim、本地缓存缺块 |
| 渲染就绪 | 隐藏 pane 不使用不可测尺寸；旧 fit/replay generation 不能让画面提前显示 | tab 切换、分屏、隐藏恢复、方向变化、Canvas context 恢复 |
| 用户输入 | 用户输入、IME 和终端自动响应分离；输入锁不能吞掉允许的 generated response | composition、粘贴、大输入、回放期间 DSR/OSC、锁过期 |
| 触摸与 iOS | 双击 focus 保持同步用户手势和 capture 顺序；单击、拖动和选择不误触键盘 | iOS WebView、宽触摸屏、长按、终端鼠标模式、快捷键 |
| 工作区恢复 | 最后 selector/tab 持久恢复；用户明确返回首页时清除恢复意图 | 超过 30 秒、WebView 重载、无效 URL、浏览器前进后退 |
| 设置 | PATCH 只更新显式字段，保留其他设置；null 与空值语义稳定 | 字体、scrollback、line height、移动/桌面快捷键 |
| 客户端终端 | 浏览器不可见票据和服务凭据；每次连接前重新验证可见性 | 下线、过期票据、403/401、Device API 失败、附件代理 |
| 依赖边界 | 不引入 `tmux`、`xterm.js` 或其改名/复制实现 | Go/npm/构建依赖、脚本、vendor、示例代码迁入 |

## 验证基线

常规 Go、协议和静态资源改动：

```sh
go test ./...
git diff --check
```

按风险补充验证：

- agent、工作区或历史：覆盖首次 attach、snapshot、delta、current、trim、断线重连和关闭 pane 清理。
- 前端终端：覆盖活动 pane、隐藏 pane、tab 切换、分屏、页面刷新和 Canvas context 恢复。
- 移动端输入：至少验证单击、双击、拖动、长按、IME、快捷键和键盘收起；iOS 专属修复必须在 Lazycat iOS 宿主验证。
- 客户端终端：覆盖可见性校验、票据失败、WebSocket 代理、完整历史和附件代理。
- manifest、runtime 或打包内容：执行 `lzc-cli project release`，确认 Resource Export、WASM、字体、主题和许可证资源齐全。

## 历史修复记录

### LCMD-20260722-01：工作区恢复状态 30 秒后失效

- 日期：2026-07-22
- 来源：commit `dd22f0db8fc7093dab465596c565aa7f8a22e8c8`
- 影响模块：`runtime/static/main.js`、LightOS 管理页与 Provider 的恢复状态
- 错误现象：用户离开页面、折叠屏触发 WebView 重载或后台停留超过 30 秒后，Provider 无法恢复最后使用的实例和 tab。
- 根因：`webshell.workspaceRestore` 被设计成 30 秒 TTL，但这个状态表达的是持续的工作区选择，而不是短期跳转令牌。
- 实施方案：移除 TTL，保存 version、selector、tab、URL 和 `updatedAt`；启动时补全缺失 query；用户明确返回首页时通过抑制标记清除恢复状态，同时继续触碰活动历史缓存避免误判为孤儿数据。
- Guard：`TestRuntimePersistsWorkspaceForLightOSHomeReload` 验证持久状态、显式首页清理及禁止重新引入 TTL。
- 禁止复现：不得重新加入短过期时间；不得让普通刷新等同于用户主动退出工作区。

### LCMD-20260724-01：隐藏终端使用过期尺寸/回放状态提前显示

- 日期：2026-07-24
- 来源：commit `86f137bc5c88d7c72f40987b61f2cb039b8df70f`
- 影响模块：`runtime/static/main.js`、Ghostty Web 初始化、tab/pane resize 与历史回放
- 错误现象：隐藏 tab/pane 恢复、历史回放或尺寸变化后可能显示残留、空白或与当前终端尺寸不一致的画面；定时 full-render 仍可能把旧状态标记为 ready。
- 根因：就绪判断只依赖宽松的 render/timer 条件，没有把一次呈现绑定到实际可测量的 fit generation 和本次 replay generation；隐藏 pane 的尺寸不可测，旧帧可能通过 watchdog 被展示。
- 实施方案：显式传入随包 WASM 路径；引入 measured/pending/presented fit 与 replay generation；使用 ResizeObserver 和 canvas 尺寸校验；回放和尺寸仍未完成时保持画面隐藏；移除周期性 full-render/watchdog 作为就绪依据。
- Guard：`TestRuntimeTerminalCanvasResidueGuard`、`TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs`、`TestRuntimeMobileOrientationReplaysVisibleTerminalAfterViewportSettle`。
- 禁止复现：不得临时激活所有 tab 来获得尺寸；不得仅凭进程时间、定时器或一次 render 回调将 pane 标记为 ready。

### LCMD-20260726-01：iOS 双击未能恢复终端键盘焦点

- 日期：2026-07-26
- 来源：commit `a6cba71fdc22fae4cb726f11dd5084b0dcedfa56`
- 影响模块：`runtime/static/main.js`、触摸手势与终端 helper textarea focus
- 错误现象：iOS/宽触摸屏上双击终端后键盘有时不弹出，尤其在终端自身的 touch 消费、选择或鼠标跟踪逻辑先处理事件时复现。
- 根因：双击监听依赖 terminal host 的冒泡阶段，可能被更早的终端消费者阻断；并且把 focus 延迟到 `requestAnimationFrame` 后会离开 iOS 认可的同步用户手势上下文。
- 实施方案：在 pane shell 的 capture 阶段先记录 touchstart/move/end；只接受来自当前 terminal host 的触点；确认双击后在 `touchend` 中同步 focus；单击在后续冒泡阶段 settle 为 blur，并在 session 销毁时清理监听器。
- Guard：`TestRuntimeTouchKeyboardRequiresDoubleTapOnWideTouchScreens`、`TestRuntimeTouchKeyboardFocusPrecedesTouchConsumers`。
- 禁止复现：双击 focus 路径不得重新使用 `requestAnimationFrame`、`setTimeout` 或 Promise；不得退回依赖 host 冒泡监听。

### LCMD-20260727-01：Claude fullscreen 触摸滚动与 iOS 双击键盘冲突

- 日期：2026-07-27
- 来源：Claude Code fullscreen 移动端现场问题及第一次修复回归
- 影响模块：`runtime/static/main.js`、移动端触摸选择、终端鼠标协议与 iOS helper textarea focus
- 错误现象：Claude Code 默认模式可正常触摸滚动，但 fullscreen 开启终端鼠标跟踪后，单指上下滑动被解释成按下并拖动，表现为扩展文本选区；第一次把 Claude 兼容逻辑加入全局触摸链后，iOS 双击又无法展开键盘，回档后恢复。
- 根因：默认选择、iOS 双击 focus 和通用终端 mouse tracking 竞争同一批 `touchstart/move/end`。第一次修复没有建立事件所有权，第二次 `touchend` 在 iOS 同步 focus 后仍可能继续发送 Claude press/release 并重申终端尺寸，破坏软键盘激活；同时 Claude 特例进入全局 mouse tracking 会扩大到 Codex、Grok 和其他已经稳定的 TUI。
- 实施方案：新增 Claude fullscreen 独立触摸状态机和 DOM adapter，仅在精确识别 Claude、alternate screen 与 mouse tracking 同时成立的手势开始时锁定接管。单指移动达到 8px 后发送 wheel，450ms 长按进入现有 WebShell 本地选择并复用选择手柄、复制操作栏和自动滚动；普通 tap 延迟到 `touchend` 发送点击。iOS 键盘 capture 层用 `WeakSet` 标记已认领的双击 `touchend`，Claude adapter 消费标记后不执行鼠标准备、不发送任何鼠标字节。adapter 安装顺序固定在默认选择之后、通用 mouse tracking 之前，未匹配会话直接返回原路径。
- Guard：`TestClaudeFullscreenTouchBehavior` 执行 JavaScript 状态机和 adapter，覆盖 Claude npm/native/title 识别、Codex/Grok 排除、tap、wheel、长按选择以及键盘认领后零鼠标输出；`TestRuntimeClaudeFullscreenTouchAdapterIsolation` 固定 input focus、默认选择、Claude adapter、通用 mouse tracking 的安装顺序，并禁止通用 mouse tracking 出现 Claude 分支。现有 `TestRuntimeTouchKeyboardFocusPrecedesTouchConsumers`、`TestRuntimeGrokMouseTrackingPreservesMobileDoubleTapKeyboard` 继续通过。
- 验证结果：`go test ./...`、三个相关 JavaScript 文件的 `node --input-type=module --check`、`git diff --check` 和 `lzc-cli project release` 通过，新增模块已进入 LPK 静态资源构建。真实 Lazycat iOS WebView 仍需复验 Claude fullscreen 双击键盘、滑动、长按复制栏，并同时检查 IME、移动快捷键、Claude default、Codex 和 Grok。
- 禁止复现：键盘层认领的 `touchend` 后不得发送 Claude 鼠标序列或执行终端尺寸重申；不得把 Claude fullscreen 分支重新并入默认选择或通用 mouse tracking；不得在 `touchend` 重新判定手势归属；不得用宽泛的命令或标题子串匹配 Claude。

### LCMD-20260728-01：PC 连接后移动端无法重新取得 Claude 触摸模式

- 日期：2026-07-28
- 来源：Claude fullscreen 跨 PC/移动端现场回归；续接 `LCMD-20260727-01`
- 影响模块：共享 PTY 尺寸、浏览器 resize 去重、Claude fullscreen adapter 与 iOS 双击 focus
- 错误现象：Claude fullscreen 只在手机使用时滑动和双击键盘正常；同一 pane 被 PC 打开后，手机返回会继续显示并使用 PC 交互模式，列表无法触摸滚动，iOS 双击也无法展开键盘。
- 根因：pane 的 PTY 尺寸是所有 attach 客户端共享的最后写入状态，但 `sendTerminalSize` 只与当前浏览器的 `lastSentCols/Rows` 比较。手机曾发送窄尺寸后，PC 把共享 PTY 改为宽尺寸；手机恢复前台时本地 cols/rows 没变，因此 resize 被错误去重，服务端继续保持 PC 尺寸。Claude 随尺寸变化重绘后，移动端本地 alternate-screen 状态可能与 fullscreen 语义暂时不一致；旧 adapter 把该客户端派生状态作为硬门槛，于是触摸落入通用 mouse tracking，重新发送 press/move/release，并在 iOS 同步 focus 后破坏键盘激活。
- 实施方案：增加可强制发送的终端尺寸声明，socket 打开、移动端 `visibilitychange`/`focus`/`pageshow` 和终端 `touchstart` 时由当前客户端重新声明本地尺寸；activity 返回的 pane cols/rows 作为服务端尺寸观测值保存，不能再把 `lastSentCols/Rows` 当作共享 PTY 权威状态。Claude adapter 改为只要求精确 Claude 身份和 mouse tracking，alternate-screen 仅是渲染器内部状态，不再决定触摸所有权；Claude default 因未开启 mouse tracking 继续走原路径，Codex、Grok 和其他 TUI 仍被身份 guard 排除。
- Guard：`TestTerminalSizeSyncBehavior` 覆盖同客户端尺寸去重、PC 改写后 force claim、服务端尺寸差异和无效尺寸；`TestRuntimeTerminalSizeClaimSurvivesCrossClientResize` 固定 socket、移动端生命周期和首个 touch 的尺寸声明顺序；`TestClaudeFullscreenTouchBehavior` 增加 alternate-screen 不一致时 Claude + mouse tracking 仍接管，以及 Claude default/Codex 排除。现有 iOS、Grok、通用 mouse tracking 和隐藏 pane resize 测试继续通过。
- 验证结果：`go test ./...`、相关 JavaScript 语法检查、`git diff --check` 和 `lzc-cli project release` 通过；真实 Lazycat iOS WebView 仍需按“手机打开 Claude fullscreen -> PC 打开同一 pane -> 手机回到前台”顺序复验第一次滑动、第一次双击、长按选择、IME、Claude default、Codex 和 Grok。
- 禁止复现：不得用单客户端 `lastSentCols/Rows` 推断共享 PTY 当前尺寸；移动端重新活跃时必须能够声明尺寸所有权；不得重新把 alternate-screen replay 状态作为 Claude fullscreen 触摸硬门槛；不得在通用 PC mouse move 路径强制发送 resize。

### LCMD-20260728-02：Claude fullscreen 鼠标右键无法打开 WebShell 选项栏

- 日期：2026-07-28
- 来源：Claude Code fullscreen 桌面端现场问题；续接 `LCMD-20260727-01`
- 影响模块：Claude fullscreen adapter、通用终端 mouse tracking 与 WebShell context menu
- 错误现象：Claude Code 默认模式可以通过鼠标右键打开 WebShell 选项栏，进入 fullscreen 后右键没有任何选项栏；复制、粘贴、全选、搜索等现有菜单操作无法使用。
- 根因：Claude fullscreen 开启终端 mouse tracking 后，通用 mouse tracking 在 capture 阶段拦截右键 `mousedown`、`mouseup`、`auxclick` 和 `contextmenu`，将右键 press/release 发送给 PTY，并通过 `stopImmediatePropagation` 阻止事件到达后安装的 WebShell context menu 监听器。
- 实施方案：新增 Claude fullscreen 独立右键 adapter，仅在精确 Claude 身份、mouse tracking、真实鼠标右键且现有移动端 context menu guard 未要求抑制时声明事件所有权；右键按下、按住移动、释放、`auxclick` 和 `contextmenu` 都不再发送到 PTY。通用 mouse tracking 只识别中性的 `WeakSet` 事件所有权标记并跳过，不包含 Claude 分支；`contextmenu` 继续传播给现有 WebShell 选项栏。Claude 左键、滚轮、移动端长按、Claude default、Codex、Grok 和其他 TUI 保持原路径。
- Guard：`TestClaudeFullscreenContextMenuBehavior` 覆盖 Claude fullscreen 右键、完整按下/移动/释放序列、Claude default、Codex、左键、移动端 context menu 抑制与清理；`TestRuntimeClaudeFullscreenContextMenuIsolation` 固定 Claude adapter 在通用 mouse tracking 前安装，并禁止通用 mouse tracking 出现 Claude 专用判断。
- 验证结果：`go test ./...`、相关 JavaScript 语法检查、`git diff --check` 和 `lzc-cli project release` 通过；真实桌面浏览器仍需复验 Claude fullscreen 无选区和有选区时的右键菜单，以及左键、滚轮、拖动、Claude default、Codex 和 Grok。
- 禁止复现：不得在通用 mouse tracking 中直接加入 Claude 右键分支；不得只放行 `contextmenu` 而继续向 PTY 发送同一右键手势的 press/release；不得把触摸长按生成的 context menu 误判为真实鼠标右键。

### LCMD-20260728-03：Claude fullscreen 内部选区无法通过 WebShell 菜单复制

- 日期：2026-07-28
- 来源：`LCMD-20260728-02` 现场复验后的复制问题
- 影响模块：Claude fullscreen 桌面鼠标适配、Ghostty 本地选择、通用 mouse tracking 与桌面剪贴板
- 错误现象：Claude fullscreen 已能打开 WebShell 右键菜单，但普通左键拖动形成的高亮属于 Claude TUI 内部选区；点击菜单“复制”时 WebShell 的 `term.getSelection()` 为空，提示没有可复制选区或无法写入期望文本。
- 根因：Claude fullscreen 的 mouse tracking 在 `mousedown` 阶段取得左键手势所有权，press/move/release 全部发送给 PTY，Ghostty 本地 selection manager 无法建立选区。Claude 内部高亮状态不属于终端协议输出，也没有可供浏览器读取的文本范围；右键菜单只能复制 WebShell/Ghostty 本地选区，不能反向读取 Claude 进程内部状态。
- 实施方案：新增 Claude fullscreen 独立桌面选择 adapter，仅在精确 Claude 身份、mouse tracking 和非触摸选择布局中接管普通左键序列。按下后暂缓向 PTY 发送；移动未达到 4px 时在松开后补发原坐标和修饰键的 Claude press/release，保持点击功能；达到阈值后整段拖动留给 Ghostty 建立可复制的本地选区，不向 PTY 发送残缺鼠标序列。`Ctrl`、`Alt`、`Meta/Command` 修饰的左键继续走 Claude 原生 mouse tracking，移动端继续使用独立触摸 adapter 的滑动、双击键盘和长按选择。桌面选择和右键 adapter 共用中性的 `WeakSet` 事件所有权，通用 mouse tracking 不包含 Claude 判断；Codex、Grok、Claude default 和其他 TUI 不匹配。
- Guard：`TestClaudeFullscreenDesktopSelectionBehavior` 覆盖点击补发、拖动本地选择、右键隔离、触摸布局排除、Claude default、Codex、Grok、应用修饰键和 cleanup；`TestRuntimeClaudeFullscreenDesktopSelectionIsolation` 固定“右键 adapter -> 桌面选择 adapter -> 通用 mouse tracking -> 桌面剪贴板”的安装顺序，并要求通用 mouse tracking 在 down/move/up/click-like 阶段尊重本地事件所有权且不包含 Claude 分支。现有触摸、iOS 双击、跨客户端尺寸、右键菜单和 Grok guard 继续通过。
- 验证结果：`go test ./...`、相关 JavaScript 语法检查、`git diff --check` 和 `lzc-cli project release` 通过；真实桌面浏览器仍需复验 Claude fullscreen 单击、普通拖选、右键复制、自动复制开关、滚轮和修饰键鼠标，移动端仍需复验滑动、双击键盘、长按复制与 IME，并回归 Claude default、Codex 和 Grok。
- 禁止复现：不得尝试从 Claude 内部高亮反推文本；不得向 PTY 发送本地拖选手势的部分 press/move/release；不得让桌面选择 adapter 在触摸选择布局、Claude default、Codex、Grok 或其他 TUI 中启动；不得为复制修改移动端长按或 iOS 同步 focus 链路。

## 新增记录模板

```md
### LCMD-YYYYMMDD-NN：问题标题

- 日期：YYYY-MM-DD
- 来源：commit/PR/issue/现场问题编号
- 影响模块：浏览器、Provider 后端、agent、客户端终端或目标环境
- 错误现象：用户可见结果、触发条件和影响范围
- 根因：导致错误的状态、协议、时序、权限、缓存或平台原因
- 实施方案：最终采用的修复及关键顺序/边界
- Guard：新增或更新的测试名称；无法自动化时写设备和可重复步骤
- 验证结果：执行的命令、设备/浏览器/系统和结果
- 禁止复现：后续修改不得破坏的不变量
```
