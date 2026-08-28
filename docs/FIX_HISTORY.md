# 历史修复与回归防护记录

本文档用于保存 `lazycat-microserver-webshell` 的架构基线、已确认的历史问题和防止问题复现的 guard。它不是发布日志，也不记录未经证实的猜测或已经否定的方案。

当前行为以本文前半部分“当前架构基线”和最新修复条目为准。后半部分历史条目保留当时的实现和现场证据；其中出现的“首批字节可见”、`cacheV2WarmFrameReady` 或方向变化重新回放等描述仅表示旧版本行为，均已被 `LCMD-20260819-02` 取代，不得作为新代码的设计依据。

首版建立于 2026-07-27。初始历史条目根据仓库 Git 提交、当前实现和现有测试重建；后续每次 Bug 修复都应在同一次变更中更新本文档。

## 使用规则

### 开始任务前

1. 阅读根目录的 `AGENTS.md`、`README.md`、本文档和本次修改涉及的源码、调用方及测试。
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
- 页面静态资源位于 `runtime/static/`，随二进制一起打包。HTML 禁止缓存并由 Provider 注入当前资源版本路径；独立 LPK 使用 `<lpk-version>-<content-revision>`，缺少构建元数据的内嵌/开发环境使用内容哈希。新页面通过该内容寻址的 `/assets/<asset-version>/` 读取 JS/CSS/JSON/WASM/manifest/图标并使用 immutable 缓存，旧 `/static/` 只保留兼容和可重验证策略。
- PWA Service Worker 由 Provider 注入当前 LPK 版本与资源基路径；当前版本的 immutable 静态资源执行 cache-first，版本 URL 变化负责更新，缓存未命中或旧版本资源才访问网络，非成功响应可以回退已有静态缓存。页面导航、`/api/*`、`/ws` 和终端虚拟 Cache URL 不进入 app-shell 缓存。

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
- agent 二进制升级必须先解包到目标目录同一文件系统内的独立 staging 目录，校验二进制与 manifest 后原子替换；不得用 tar 直接覆盖正在运行或已存在的 agent 文件。

### 终端历史与渲染

- LightOS 实例终端历史以 persistent agent 保存的原始 PTY 字节为可信来源；浏览器渲染状态不是历史权威。
- 普通容器实例的单个 WebShell 页面只维持 1 条页面级 Unified 终端 WebSocket。全部 pane 通过 `terminal_unified_membership.js` 维护 target-scoped logical membership，并使用 `UnifiedTerminalConnection` 复用该物理连接。创建/关闭 pane才增删 logical stream；tab 切换、pane 聚焦、输入和 resize 只更新 priority 或 pane自身状态，不关闭 logical stream，不经过 Fast slot、promotion、Queue gate 或 topology reset。每个 pane具有独立 stream ID、channel generation、history generation、cursor、sequence、checksum、retry 和 resync；单 pane异常不得关闭其他 logical stream。`CONNECTING`、`OPEN`、`CLOSING` 都占用唯一物理槽，旧 socket 真实 close 或达到 close fence 前不得创建替代 transport。`client:` target 暂未升级 unified 协议，继续保留最多 3 条独立直连调度。
- Unified 复用只发生在浏览器与 Provider 之间。Provider 为每个逻辑 pane 复用现有 agent attach、持续 drain 上游并按 pane 公平轮转；persistent agent 不修改，继续维护全部 PTY、任务、历史和 cursor。Unified broker 允许每个有效 logical stream 发送普通输入和 generated control，输入必须按 pane identity/generation 校验并经该 stream 的串行 agent writer。活动 pane 优先级只影响轮转顺序，不移除或暂停其他 pane；同一 pane 任意时刻仍只能由一个有效 channel generation 写入 Ghostty。
- 历史流使用 `history_generation` 和绝对 byte cursor 表示范围。服务端根据本地范围选择 `snapshot`、`delta` 或 `current`，所有 chunk 必须连续。
- 容器实例使用 Cache API v2 保存按账号 scope、完整 selector、workspace generation、tab、pane 和 history generation 隔离的不可变 PTY 字节块，并以 commit-last manifest 暴露已持久化 cursor。缓存无效时可以丢弃并从 agent 重建，但不能把不连续缓存拼接到新 generation。
- 容器页面从网络 workspace 响应取得完整账号 scope、selector、workspace、tab 和 pane 身份后，以 8 块滚动预读窗口从 Cache API 读取该精确身份下的 PTY 字节。历史区间和恢复期间排队的实时字节通过 Ghostty 专用 replay 写入完整解析，但不调度中间 Canvas render；WASM 输入缓冲区按实例复用。只有服务端 replay complete、cursor 连续、实时队列追平、fit 当前且最终 full render 成功后才显示；新增缓存字节的持久化在后台完成，不阻塞最终 Canvas。第一批字节不是首帧。窗口、字体、主题变化和跨设备单击恢复尺寸仅在确认 cols/rows 或 canvas backing store 变化后使用 presentation hold 保留旧帧；这些操作复用当前内存终端状态，不进入历史 replay 写入。hold 覆盖期间 Ghostty 继续按正常节流渲染，当前状态的 full render 成功后立即替换，不等待 PTY 输出安静，也不重新回放历史。切换 tab 前保存有效帧，激活后用当前状态的 full render 替换，不能显示黑屏。
- Ghostty renderer 在修改 canvas 前必须一次性物化当前可见活动屏幕和 scrollback 行；活动 viewport 每帧只导出一次。任一可见行缺失时保留上一帧和 dirty 状态，由事件驱动 scheduler 退避重试，失败帧不得触发成功 `onRender` 或 pane presented generation 推进。
- tab 总览不得只复制已经激活过的 live canvas。未激活 pane 可以按完整 cache-v2 身份读取已提交的图片缩略图，但缩略图只用于总览，不能参与终端启动显示、Ghostty 状态恢复或输入就绪判断。
- 服务端接受本地 range 时，`delta/current` 必须复用已经恢复的 Ghostty 状态，不得再次清空和重复回放本地 chunk。服务端返回 `snapshot` 时，保持已显示的同身份本地 canvas，先在内存收齐服务端 snapshot，再一次性重置并回放权威字节；本地缓存字节不得参与 snapshot 状态计算。
- 已经呈现且身份仍有效的终端画面是网络故障期间的 last-known-good 状态。HTTP 502、Agent 不可用、WebSocket close/error、workspace refresh 重试和历史 snapshot 等待不得清空或隐藏该画面；输入继续锁定。只有成功的权威 workspace 响应确认账号/实例/workspace/tab/pane 身份变化、pane 被删除，或收到与当前会话不匹配的数据时才能销毁旧呈现。
- `client:` PC target 保持其独立的 IndexedDB 和完整历史协议，不读取 Cache API v2，也不启用容器 warm replay；不能未经双方协议升级直接套用实例 agent 的增量假设。
- pane 只有在尺寸可测量、fit generation 与 replay generation 都是当前值、canvas 尺寸正确，且本地 warm replay 或服务端 replay 已完成当前可展示帧后，才能标记为可展示；输入仍必须等待服务端 replay 完成。
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
| 历史同步 | generation 一致、cursor 连续、trim 后绝对范围正确、snapshot/delta/current 选择正确；容器本地缓存必须绑定完整账号/workspace/tab/pane 身份 | 首次连接、刷新、断网重连、服务端 trim、本地缓存缺块、跨账号/实例/workspace/tab |
| 渲染就绪 | 隐藏 pane 不使用不可测尺寸；旧 fit/replay generation 不能让画面提前显示 | tab 切换、分屏、隐藏恢复、方向变化、Canvas context 恢复 |
| 用户输入 | 用户输入、IME 和终端自动响应分离；输入锁不能吞掉允许的 generated response | composition、粘贴、大输入、回放期间 DSR/OSC、锁过期 |
| 触摸与 iOS | 双击 focus 保持同步用户手势和 capture 顺序；单击、拖动和选择不误触键盘 | iOS WebView、宽触摸屏、长按、终端鼠标模式、快捷键 |
| 工作区恢复 | 最后 selector/tab 持久恢复；用户明确返回首页时清除恢复意图 | 超过 30 秒、WebView 重载、无效 URL、浏览器前进后退 |
| 设置 | PATCH 只更新显式字段，保留其他设置；null 与空值语义稳定 | 字体、scrollback、line height、移动/桌面快捷键 |
| 客户端终端 | 浏览器不可见票据和服务凭据；每次连接前重新验证可见性 | 下线、过期票据、403/401、Device API 失败、附件代理 |
| 浏览器连接池 | 普通容器只有 1 条 Unified 物理终端 WebSocket；Fast/Queue 迁移态逻辑必须共享同一 connection object；tab/pane 切换只改逻辑优先级，物理 close 确认前不得复用唯一槽；`client:` target 暂保留最多 3 条直连 | 首次进入、多 tab/32 分屏、Unified `CONNECTING/CLOSING`、逻辑成员替换、输入路由、断线/重连、折叠屏恢复 |
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

### LCMD-20260730-01：容器历史缓存存在但刷新后仍长期显示空终端

- 日期：2026-07-30
- 来源：WebShell 容器实例缓存体验现场反馈
- 影响模块：浏览器历史缓存、Ghostty replay/ready 状态机、Provider workspace/WebSocket 协议、persistent agent、PWA 静态资源
- 错误现象：IndexedDB 未被 iOS 清理时，刷新页面仍需要长时间等待空终端，无法在网络连接后快速看到已有历史；旧缓存路径在连接前读取全部 PTY 字节，且容器缓存只按 selector/pane 隔离，不能满足不同账号、workspace、tab 和历史 generation 的绝对隔离要求。
- 根因：旧缓存保存的是 PTY 原始字节而不是已渲染终端画面；`connectSession()` 在 WebSocket 前等待完整 IndexedDB 读取和待写事务，之后 Ghostty 仍要重新解析全部历史，canvas 又在 replay/fit/render 完成前保持隐藏。旧 IndexedDB 记录只有 selector/pane/generation，缺少账号 scope、workspace generation 和 tab 身份；单纯替换存储介质不会解决空白等待，也不能安全显示视觉状态。
- 实施方案：容器 agent 协议升级为 v7，workspace 和 replay 返回 cache protocol、opaque account scope、workspace generation、tab、pane 与 history generation，attach 无论 Cache API 是否可用都校验 workspace generation。浏览器容器路径改用独立 Cache API v2：只在连接前读取轻量 manifest，收到并验证 replay start 后并行显示精确 cursor 的视觉快照、流式回放不可变本地字节并暂存服务端 delta；replay、连续 cursor、缓存 commit、fit 和真实 canvas render 全部完成后才移除预览并开放输入。manifest 更新串行执行，字节/预览先写后提交 manifest，并增加超时降级、LRU/过期/孤立块清理和旧 generation 删除保护。Cache API 不可用时容器直接完整服务端 replay，绝不回退到隔离不足的 IndexedDB；`client:` 明确保留原 IndexedDB 协议且禁用预览。恢复链记录 manifest、WebSocket、preview、local/server replay、commit、真实 canvas/input ready 耗时及字节数，但不记录账号 scope 或终端内容。PWA Service Worker 只做静态资源 network-first/离线兜底，不缓存 API、WebSocket 或终端数据。
- Guard：`TestTerminalCacheV2Behavior` 执行 `terminal_cache_v2_test.mjs`，覆盖完整身份隔离、连续 cursor、缺块、preview checkpoint、manifest 并发回退、LRU/孤立块和旧 generation 删除；`TestRuntimeContainerCacheV2AndPWAContract` 固定容器/`client:` 分支、workspace attach 身份、预览输入锁、PWA network-only 与静态资源更新策略；`TestAgentHistoryReplayFramesIncludeSelectorAndPane`、`TestPaneForAttachRejectsStaleWorkspaceGeneration`、`TestTerminalCacheScopeIDSeparatesAccounts` 和 client terminal 测试覆盖服务端协议与边界。
- 验证结果：`node --check` 通过 `main.js`、`service-worker.js` 和 `terminal_cache_v2.js`；Node cache-v2 行为测试 7/7 通过；`go test ./...`、`git diff --check` 和 `lzc-cli project release` 通过。LPK 内确认包含 manifest、Service Worker、PWA 图标和 cache-v2 模块，且不包含 Node 测试文件。当前环境没有浏览器自动化运行时；iOS Safari、主屏 PWA、Lazycat WKWebView、Android WebView 和桌面浏览器 warm-cache 页面级时序仍需按根目录计划真机验收。
- 禁止复现：网络 replay 身份确认前不得显示本地历史；容器不得回退到旧 IndexedDB；不得省略账号 scope、完整 selector、workspace/tab/pane/history generation 或 cursor 任一校验；旧 Promise、图片 decode、canvas capture 和删除操作不得修改新 session/generation；缓存失败只能触发服务端完整 replay，不能阻止真实终端 ready；Service Worker 不得以 cache-first 长期固定旧主程序或缓存终端运行数据；`client:` 未升级桌面 agent 前不得启用 cache-v2/视觉预览。

### LCMD-20260730-02：LPK 升级后旧 Service Worker 继续返回旧前端资源

- 日期：2026-07-30
- 来源：WebShell LPK 更新后的静态资源现场反馈；续接 `LCMD-20260730-01`
- 影响模块：Provider 静态路由、LPK 构建、HTML 入口、ES module/WASM/主题资源和 PWA Service Worker
- 错误现象：更新 LPK 后刷新或重新打开页面仍可能执行旧 JS/CSS，只有手动删除浏览器缓存或 Website Data 才能加载新前端；旧代码会连带保留旧终端恢复逻辑。
- 根因：`index.html` 固定引用 `/static/main.js`、`/static/style.css` 等不变 URL；已经安装的旧 Service Worker 可以继续 cache-first 命中这些请求。把新版 Worker 改为 network-first 不能修复仍在控制页面的旧 Worker，而只给入口 `main.js` 增加 query 也不能覆盖其相对 ES module、WASM 和主题依赖。
- 实施方案：构建阶段从 `package.yml` 提取顶层 LPK version 并写入运行目录 `.lpk-version`；Provider 优先读取该版本，开发环境回退到 `package.yml`，最后回退稳定内容哈希。`index.html` 保持 `no-store`，由 Provider 把全部入口引用注入为 `/assets/<version>/...`；版本化静态路由只接受当前严格校验版本并使用 immutable 缓存，旧 `/static/` 保留兼容。`main.js` 的相对 import 自动继承版本目录，WASM 和主题显式相对 `import.meta.url`。根作用域 Service Worker 的响应也注入当前版本，cache name 和预缓存清单按版本切换，并继续将导航、API、WebSocket 和终端 Cache URL 排除。旧 Worker 不匹配 `/assets/`，因此当前 HTML 可以直接绕过其旧 `/static/` cache。
- Guard：`TestComputeAssetVersionUsesLPKVersionFile`、`TestComputeAssetVersionFallsBackToPackageVersion`、`TestComputeAssetVersionUsesStableContentFallback`、`TestBuildWritesPackageVersionForRuntimeAssets`、`TestHandleIndexInjectsLPKVersionedAssetBase`、`TestVersionedStaticFileServerRequiresExactVersion` 和 `TestServiceWorkerIsServedAtRootScope` 覆盖版本来源、构建产物、HTML/Worker 注入、错误版本、路径穿越与缓存头；`TestRuntimeContainerCacheV2AndPWAContract` 固定版本化入口和 `/assets/` network-first 契约。
- 验证结果：`node --check` 通过 `main.js`、`service-worker.js` 和 `terminal_cache_v2.js`；Node cache-v2 行为测试 7/7、`go test ./...`、`git diff --check` 和 `lzc-cli project release` 均通过。`1.0.1` LPK 内 `.lpk-version` 正确，包含 manifest、Service Worker 和 cache-v2 模块且不包含 Node 测试。浏览器旧 Worker 到新版本路径的页面级升级仍需桌面和真机矩阵验收。
- 禁止复现：不得把新页面入口改回不带版本的 `/static/`；不得只版本化 `main.js` 而遗漏其 module/WASM/JSON 依赖；不得让 Service Worker 缓存页面导航、API、WebSocket 或终端数据；每次发布不同内容的 LPK 必须提升 `package.yml` version，同版本重打包不属于可识别的升级边界。

### LCMD-20260730-03：v6 agent 升级 v7 时 tar 无法覆盖旧二进制

- 日期：2026-07-30
- 来源：安装 cache-v2/v7 LPK 后容器 WebShell `/api/workspace` 502 现场日志
- 影响模块：Provider persistent agent 安装、旧协议升级和容器 workspace 启动
- 错误现象：Provider 正确识别已运行的 `lcmd-webshell-agent-v6` 不兼容并生成 v7 归档，但远端执行 `tar -xpf - -C /` 时报告 `/usr/local/bin/lcmd-webshell-agent: 文件已存在`；安装没有 ready marker，Provider 等待新 agent 超时，最终 WebShell 无法打开。
- 根因：升级流程把归档直接解压到最终安装路径，依赖目标环境 tar 覆盖一个已经存在且可能正在运行的二进制。该覆盖语义在目标系统不成立；同时 `lightosctl exec` 可能不透传远端 tar 的退出码，因此 trace 会记录命令成功但仍因缺少 ready marker 判定安装未完成。
- 实施方案：安装脚本改为在 `/usr/local/bin/.lcmd-webshell-agent.install.<pid>` 创建同文件系统 staging 目录，先完整解包归档，检查 agent/manifest 均存在且 manifest 精确匹配期望值，再设置权限并用 `mv -f` 先原子替换 agent、最后提交 manifest。任何中途失败由 trap 清理 staging，旧最终文件保持不变或 manifest 保持旧值，后续请求可以安全重试。修复 LPK version 提升到 `1.0.1`。
- Guard：`TestAgentInstallScriptReplacesExistingBinary` 使用真实 `/bin/sh`、tar 和已有旧文件验证升级后内容、manifest、0755 权限及 staging 清理；`TestEnsureAgentBinaryInstalledVerifiesCacheHit` 禁止恢复直接 `tar -C /` 覆盖，并固定安装入口必须调用 staging 脚本。
- 验证结果：`TestAgentInstallScriptReplacesExistingBinary` 已通过真实 shell/tar/mv 覆盖旧文件场景；`node --check`、Node cache-v2 行为测试 7/7、`go test ./...`、`git diff --check` 和 `lzc-cli project release` 均通过。已生成并核对 `1.0.1` LPK。目标 LightOS 实例仍需安装该包后确认 v6 -> v7、workspace、WebSocket replay 和旧会话不复用提示。
- 禁止复现：不得直接向最终 agent 路径解包；不得在新二进制校验完成前写入新 manifest；不得把 lightosctl 命令退出码当作唯一成功依据，必须继续要求精确 ready marker。

### LCMD-20260730-04：warm cache 预览仍等到真实终端 ready 后才出现

- 日期：2026-07-30
- 来源：`1.0.1` warm-cache 页面现场反馈，终端右上角灰色连接点消失前始终空白
- 影响模块：浏览器 Cache API v2 preview 预读、WebSocket replay 身份确认、终端 preview/真实 canvas 切换和恢复性能指标
- 错误现象：本地已有终端字节缓存和视觉快照时，重新打开仍显示空终端；只有 history replay、fit 和真实 canvas render 完成、右上角灰点结束后才看到内容，视觉上等同没有首帧缓存。
- 根因：前端直到收到 `history-replay-start` 才开始从 Cache API 读取 preview Blob 并执行 PNG decode，无法利用 workspace/agent 连接等待时间。显示前还要求缓存的 cols、rows、DPR、主题、canvas width/height 与启动瞬间全部精确相等；移动浏览器 viewport settle、DPR 或 fit 的轻微变化会静默返回 false。cache-v2 分支调用 preview/replay 时 `replayVerified` 也尚未显式设为 identified，只依赖异步 Cache API 恰好晚于当前消息栈完成。
- 实施方案：读取 cache-v2 manifest 后立即异步读取 Blob，并用独立 `Image` 提前 decode，但不写入可见 DOM；prepared preview 绑定完整 cache identity、history generation、end cursor 和 prepare sequence。服务端 replay start 再次验证 selector/account scope/workspace/tab/pane/history generation/cursor 后，先设置 identified，再把已解码 object URL 同步交给 preview element。尺寸、DPR或主题不一致不再拒绝同身份预览，而由现有 `object-fit: contain` 和终端背景安全承载，真实 canvas ready 后单帧移除。session 关闭、cache reset/disable、身份变化和真实 canvas ready 都会撤销 prepared/shown URL。指标新增 preview prepared、layout match 和 miss reason。
- Guard：`TestRuntimeContainerCacheV2AndPWAContract` 固定 manifest 后预读、prepared preview 状态、服务端身份确认必须早于 `beginSessionCacheV2Replay`、恢复指标和“布局漂移不能作为拒绝同身份预览的理由”；现有 cache-v2 行为测试继续固定完整身份和 cursor 隔离。
- 验证结果：`node --check` 通过 `main.js`、`service-worker.js` 和 `terminal_cache_v2.js`；Node cache-v2 行为测试 7/7、`go test ./...`、`git diff --check` 和 `lzc-cli project release` 均通过。已核对 `1.0.2` LPK 的 `.lpk-version` 和前端资源，Node 测试未进入包。当前环境没有页面级浏览器运行时，真实 warm open 仍需观察 recovery metrics 中 `previewHit=true` 且 `previewVisibleMs < realCanvasVisibleMs`。
- 禁止复现：不得在 replay start 后才首次读取/解码 preview；预读结果不得在服务端完整身份确认前进入可见 DOM；不得因同一会话的 viewport、DPR、主题或 canvas 尺寸漂移直接放弃预览；不得让旧 prepare Promise 或 object URL 跨 session/generation 显示。

### LCMD-20260730-05：Cache API 图片存在但 snapshot 恢复期间仍保持空白

- 日期：2026-07-30
- 来源：`1.0.2` warm-cache 现场复验；浏览器诊断确认 5 个 manifest 均有 preview，Cache Storage 共 2013 个 key，精确对应 2003 个 chunk、5 个 manifest 和 5 个 preview
- 影响模块：容器 `history-replay-start` 分支、snapshot 缓存重置、preview 授权生命周期和恢复诊断
- 错误现象：Cache API 的字节块和图片记录都实际存在，但反复打开页面仍要等右上角灰色连接点消失后才显示画面；现有预览只在服务端接受本地范围并进入 `cache-v2 delta/current` 分支时调用，服务端选择 `snapshot` 时完全不会挂载图片。
- 根因：实现把“本地 PTY 字节是否可作为增量状态来源”和“同一会话视觉快照是否可作为不可交互等待画面”错误绑定为同一个条件。`snapshot` 表示本地字节不能参与状态恢复，并不表示已经通过服务端完整身份与 history generation 验证的 preview 属于其他会话；同时 snapshot 分支立即重置 manifest，会撤销仍在解码的 preview Promise。
- 实施方案：新增独立 preview replay 授权。`delta/current` 继续要求 manifest end 精确等于 `delta_from_cursor`；`snapshot` 只允许完整账号 scope、selector、workspace、tab、pane、history generation 全部匹配，且本地 end 不超过服务端 end 的 preview 显示。snapshot 仍完全使用服务端字节重建隐藏 Ghostty，不读取本地字节作为状态来源，输入继续锁到 replay、缓存提交、fit 和真实 canvas render 全部完成。已授权 preview 在 snapshot manifest 重置期间保留于内存；若图片仍在解码，重置等待该受限 Promise 结束后再删除旧 Cache 记录。新增不含身份和内容的 JSON `preview decision` 与 `preview visible` 日志，直接记录 sync mode、是否授权、是否已预解码和 DOM 图片是否完成挂载。LPK version 提升到 `1.0.3`。
- Guard：`TestRuntimeContainerCacheV2AndPWAContract` 固定 snapshot 顺序必须是终端 reset、服务端 identified、preview reveal、manifest reset，并要求 DOM reveal 绑定精确授权的 snapshot 对象；同时固定 snapshot 的服务端 end 上界、delta/current 的精确 cursor 和 preview prepare 跨 reset 保留规则。
- 验证结果：`node --check` 通过 `main.js`、`service-worker.js` 和 `terminal_cache_v2.js`；cache-v2 定向契约测试、完整 `go test ./...`、`git diff --check` 与 `lzc-cli project release` 均通过。已生成 `cloud.lazycat.webshell.lcmd-v1.0.3.lpk`，包内 `.lpk-version` 为 `1.0.3` 且包含 snapshot preview 授权代码，SHA-256 为 `15a730debe352009d4439f9f39e207b27cf3c278f69767446b1dfa76b3f504b8`。当前命令行环境仍没有页面级浏览器运行时，现场需要确认 `preview decision` 为 `authorized:true`、随后出现 `preview visible`，且 preview 在灰点消失前出现。
- 禁止复现：不得重新把 preview 可见性限定为 delta/current；snapshot preview 不得参与 Ghostty 状态恢复或开放输入；不得放宽完整身份/history generation 校验；不得显示 checkpoint 超前于服务端 end 的图片；不得让 snapshot manifest reset 抢先删除同一次已授权但仍在解码的 preview。

### LCMD-20260730-06：取消 preview 等待门槛，缓存字节直接恢复 Ghostty canvas

- 日期：2026-07-30
- 来源：`1.0.3` 现场复验仍然只有灰点消失后才显示内容；用户明确要求本地字节流直接渲染，网络成功后只接续增量
- 影响模块：容器启动恢复状态机、Ghostty canvas ready、Cache API chunk 读取、WebSocket delta/current/snapshot 合并和输入锁
- 错误现象：即使 Cache API 中存在完整字节和 preview，前端仍把任何可见内容绑定在服务端 replay 状态之后；连接或 agent attach 慢时，终端持续空白。图片 preview 路径增加了另一套授权、解码和 DOM 切换状态，却没有兑现“本地字节直接恢复终端”的目标。
- 根因：`replayComplete` 同时承担 canvas 可见和输入可用两个职责，导致本地 Ghostty 已经可以恢复时仍被 CSS 隐藏；cache-v2 字节直到 `history-replay-start` 后才读取，并且服务端 delta 分支会重置 Ghostty再回放一次。大量历史被拆成上千个 Cache 记录时，`readChunks` 又逐个串行 `cache.match()`，本地读取本身也会产生明显等待。
- 实施方案：在 workspace HTTP 响应提供完整当前身份、manifest 校验通过后，WebSocket 构造前立即启动 cache-v2 warm replay。32 路并发读取不可变 chunk，但严格按 cursor 顺序送入 Ghostty；本地 replay 到 manifest end 后直接 full render 并允许 canvas 在灰点存在时显示。新增独立 `cacheV2WarmReplayReady`，只放宽 canvas ready，`isSessionInputReady` 仍要求服务端 `replayComplete` 和 OPEN socket。服务端 `delta/current` 验证 generation/end cursor 后复用已恢复状态，仅追加网络字节；服务端 `snapshot` 保持当前本地 canvas，内存收齐完整权威 snapshot 后在同一任务内重置并批量回放，再等待缓存提交和最终 render 开放输入。warm replay 失败、身份不匹配、cursor 不连续、pane 销毁和 viewport 强制重放都会取消旧 Promise、隐藏不可信 canvas 并降级服务端 snapshot。启动不再预读或显示视觉 preview。LPK version 提升到 `1.0.4`。
- Guard：`TestRuntimeContainerCacheV2AndPWAContract` 固定本地 range 后、WebSocket 构造前启动 warm byte replay；固定 warm canvas 可以绕过 `replayComplete` 的显示门槛但绝不能进入输入门槛；固定 delta/current 复用已恢复状态、snapshot 完成后原子替换，以及启动链不得调用 preview prepare。`terminal_cache_v2_test.mjs` 新增并发读取测试，要求并发度生效但回调顺序仍严格连续。
- 验证结果：`node --check` 通过 `main.js`、`service-worker.js` 和 `terminal_cache_v2.js`；Node cache-v2 行为测试 8/8、完整 `go test ./...`、`git diff --check` 和 `lzc-cli project release` 均通过。已生成 `cloud.lazycat.webshell.lcmd-v1.0.4.lpk`，包内 `.lpk-version`、warm byte replay、snapshot 原子替换和 32 路并发读取代码均已核对，Node 测试文件未进入包，SHA-256 为 `8f02b77f5e49ee58ca0257f8b7858d5fc7f6402161973826e12709d855b4880e`。当前环境没有页面级浏览器运行时，现场应在灰点仍存在时先看到 canvas，并观察 `warm canvas ready`、`warm canvas visible` 日志早于最终 recovery metrics。
- 禁止复现：不得再次要求 WebSocket replay start/complete 才读取本地 cache-v2 字节或显示本地 Ghostty canvas；不得把 warm canvas ready 等同输入 ready；不得在 delta/current 已有 warm 状态时清空或重复回放本地字节；不得把本地字节叠加到服务端 snapshot；不得把并发 Cache 读取改成乱序回放；不得在缺少完整 workspace 身份时按 pane 最近记录猜测缓存。

### LCMD-20260730-07：首批缓存字节立即成帧，并补齐未激活 tab 总览

- 日期：2026-07-30
- 来源：`1.0.4` 现场复验；首个进入的 tab 已不受连接灰点阻塞，但仍先显示黑色终端，其他 tab 打开后可秒开；终端总览只有逐个打开过 tab 后才出现对应画面
- 影响模块：Cache API 分批读取、Ghostty warm render ready、workspace 后台预热、tab 总览缩略图和完整身份隔离
- 错误现象：首次进入页面时，本地字节 replay 必须读取并解析到 manifest end 后才第一次 full render，因此在此之前只能看到终端背景。总览直接复制 pane 的 live canvas；隐藏 tab 从未完成可测量 fit 和 replay，canvas 仍是空画布，导致用户必须逐个打开 tab 才能补齐总览。
- 根因：`cacheV2WarmReplayReady` 仍同时表示“已经产生可见本地帧”和“本地 range 已完整到达 manifest end”，没有更早的只读显示状态。Cache API `readChunks` 也未暴露并发批次边界，前端只能在全部读取结束后统一 flush。总览没有独立数据源，也没有使用 cache-v2 manifest 中已按完整身份提交的 preview 记录。
- 实施方案：`readChunks` 为每个有序回调增加 `chunkIndex/chunkCount/batchEnd`。warm replay 在批次结束时 flush 已排序字节，当前 Ghostty viewport 一旦出现可见内容就设置独立 `cacheV2WarmFrameReady`、同步 full render 并记录 `warm canvas first frame`；剩余 chunk 继续读取，只有到 manifest end 才设置 `cacheV2WarmReplayReady`。两个 warm 状态都只放宽 canvas 显示，输入继续只依赖 `replayComplete + renderReady + OPEN socket`。workspace 应用后后台为全部容器 pane 读取轻量 manifest 和总览图片；总览优先使用已完成的 live canvas，否则只在账号 scope、selector、workspace、tab、pane、history generation 全部匹配时使用缓存缩略图。总览图片不进入终端 DOM、启动恢复或同步计算。LPK version 提升到 `1.0.5`。
- Guard：Cache API Node 测试固定 32 路读取仍按 cursor 有序，并验证每个并发 batch 的末尾标记；`TestRuntimeContainerCacheV2AndPWAContract` 固定首批 frame 状态、可见内容检查、输入门禁不读取任何 warm 状态、总览 preview 的完整身份验证、snapshot 对象生命周期和 live canvas/cached preview 选择规则。
- 验证结果：`node --check` 通过 `main.js`、`service-worker.js` 和 `terminal_cache_v2.js`；Node cache-v2 行为测试 8/8、完整 `go test ./...`、`git diff --check` 和 `lzc-cli project release` 均通过。已生成 `cloud.lazycat.webshell.lcmd-v1.0.5.lpk`，包内 `.lpk-version`、首批 warm frame、总览缩略图身份校验、32 路读取 batch metadata 和测试文件排除均已核对，SHA-256 为 `f0195ecdc86bcf6e1bb1f7557b527cfc133e06d9f97b5a58baaa787f13a0eb78`。当前环境没有页面级浏览器运行时，现场仍需验证第一个 tab 不再先停留黑屏、未打开 tab 的总览直接出现，并确认总览不会跨完整身份显示旧图。
- 禁止复现：不得重新把第一次 canvas render 推迟到全部本地 chunk 完成；不得让 `cacheV2WarmFrameReady` 进入输入门禁或冒充 manifest end；不得在总览中无条件复制空 live canvas；不得按 pane ID、最近记录或缺失账号/workspace/tab/history 身份的 key 读取缩略图；总览 preview 不得重新进入终端启动显示链。

### LCMD-20260731-01：历史裁剪后 canvas 只显示底部内容，resize 才恢复

- 日期：2026-07-31
- 来源：`1.0.5` 现场复验；页面重载约 10% 概率出现终端上半部分纯黑且仍可滚动，继续输出时部分已存在历史从画面消失，调整窗口尺寸后无需重新拉取即可恢复受行数限制的完整历史
- 影响模块：Ghostty Screen/WASM scrollback ABI、WebShell 定制 Ghostty viewport 锚点、Cache API warm replay 批次刷新和 pane canvas 呈现状态
- 错误现象：缓存字节已经进入 Ghostty/WASM，但历史达到容量并裁剪旧页时，canvas 可能只在底部绘制最新一段内容，上方留下可滚动的黑区；刷新仍可能保持错误画面，只有 resize 触发整帧重绘后恢复。大量 warm replay 时首批之后的 chunk 也可能一直积压到最终 flush，削弱渐进显示并放大错误窗口。
- 根因：前端仅以 `getScrollbackLength()` 的差值判断新增历史；达到逻辑或物理容量后，新行进入历史与旧行裁剪同时发生，长度保持不变，viewport 因而没有随历史前进。Ghostty 已请求的 full render 又会被 replay 写入后的 rAF 取消逻辑清除。WebShell 只在首个可见 batch 和 manifest end 强制 flush/render，且 pane current 判断只绑定 fit/replay generation，没有绑定实际终端内容代际，旧 canvas 可以在内容继续变化后仍被视为 current。
- 实施方案：Ghostty `Screen` 增加可回绕的 `scrollback_generation`，普通屏幕每有一行进入历史即递增，并通过 C/WASM ABI 暴露；JS 使用无符号 generation 差值维护历史 viewport，generation 前进时要求 full redraw。容器 cache-v2 warm replay 在每个 32-chunk 有序批次末尾都强制 flush 并同步 full render，首个有内容批次仍单独标记 warm frame。pane 增加 terminal/pending/presented content generation，只有当前内容已真实绘制才允许 presentation 判定为 current；取消旧 rAF 时保留已有 full-render 意图，同步 full render 完成后再消费该意图。LPK version 提升到 `1.0.6`。
- Guard：Ghostty `Scrollback Viewport Stability` 测试覆盖可见 scrollback 长度保持不变时的历史锚点，以及活动屏幕删除行不得推进 generation；Ghostty `test-lib-vt` 覆盖 `Screen` 的普通滚屏、区域滚屏和 clear-to-history 计数。`TestRuntimeContainerCacheV2AndPWAContract` 固定每个 `batchEnd` 都 flush/render；`TestRuntimeTerminalCanvasResidueGuard` 固定 WASM generation 导出、定制 bundle 的无符号 generation 差值/full redraw、pane content generation 和 full-render 取消保留逻辑。
- 验证结果：Ghostty `prettier --check`、Biome、TypeScript、380 个 Bun 测试和正式 build 通过；`zig build test-lib-vt -Dtarget=x86_64-linux-gnu.2.28` 与 wasm32 ReleaseSmall 构建通过，WASM 导出表已确认包含 `ghostty_terminal_get_scrollback_generation`。WebShell 的 Node cache-v2 行为测试 8/8、相关 JavaScript 语法检查、完整 `go test ./...`、`git diff --check` 和 `lzc-cli project release` 均通过。已生成 `cloud.lazycat.webshell.lcmd-v1.0.6.lpk`，包内 `.lpk-version`、generation WASM 导出、逐 batch render 和 content generation 已核对，SHA-256 为 `b6b9608c53664faf161df32cc3293442be0bd20035e9358836d4cff69020f49c`。真实浏览器仍需复验长历史重载、持续输出、滚动停留和 resize 前后画面一致性。
- 禁止复现：不得再用保留历史长度代替历史前进量；达到 scrollback 上限后 generation 仍必须递增。不得在取消 replay rAF 时丢弃已请求的 full render；不得只渲染 warm replay 的首批和最终批次；不得在 presented content generation 落后时把 pane 视为 current。resize 只能作为恢复验证，不得成为正常渲染依赖。

### LCMD-20260731-02：LPK 热更新后 Provider 继续发布旧 JS/WASM

- 日期：2026-07-31
- 来源：`1.0.6` 现场复验仍出现 `LCMD-20260731-01`，用户怀疑 WASM 未更新；包内和工作区 WASM 均确认包含 `ghostty_terminal_get_scrollback_generation`
- 影响模块：Provider 版本化静态路由、首页与 Service Worker 注入、server revision 轮询、Ghostty WASM 初始化兼容性
- 错误现象：LPK 中 `ghostty-vt.wasm` 已是新文件，但升级后浏览器仍可能执行旧 `main.js`、旧 `ghostty-web.js` 和旧 WASM，继续出现历史只渲染底部、resize 后恢复；清理浏览器缓存后才可能切到新文件。
- 根因：Provider 在进程启动时只计算一次 `assetVersion` 和 `serverRevision`。LPK 热更新若没有重启 Provider，首页和 Service Worker 仍注入 `/assets/<旧版本>/`，静态 handler 也只接受旧版本 URL；该 URL 带一年 `immutable`，浏览器因此持续复用旧资源。固定 `serverRevision` 又使现有轮询无法发现 LPK 文件已经切换。Ghostty JS 对 generation ABI 缺失还会静默回退到 scrollback 长度差，使现场看不到明确的版本不兼容错误。
- 实施方案：Provider 每次请求都优先读取当前 `.lpk-version`/`package.yml`；首页、Service Worker 和 `/assets/` handler 使用同一次请求解析出的当前版本，版本切换后旧 asset URL 立即 404，新 URL 继续 immutable。对外 server revision 在稳定进程 revision 后拼入当前 asset version，workspace、activity 和 revision observation 全部使用动态值；前端也直接比较前后 revision，不能持久化 revision 状态的 target 同样能提示刷新。Ghostty 初始化强制要求 `ghostty_terminal_get_scrollback_generation`，缺失时抛出明确错误，并移除长度差 fallback。LPK version 提升到 `1.0.7`。
- Guard：`TestVersionedStaticFileServerTracksLPKVersionWithoutRestart` 模拟同一 handler 运行期间改写 `.lpk-version`，固定旧 URL 404/新 URL 200；`TestDynamicAssetResponsesTrackLPKVersionWithoutRestart` 固定首页、Service Worker 和 server revision 同步切换；`TestRuntimeTerminalCanvasResidueGuard` 固定 runtime WASM ABI 硬校验、禁止长度差 fallback，并要求前端主动比较 revision。Ghostty `Ghostty WASM compatibility` 测试覆盖缺失 generation 导出时必须失败。
- 验证结果：`go test ./...`、Node cache-v2 8/8、运行时 JavaScript 语法检查、Ghostty Prettier/Biome/TypeScript、两个仓库的 `git diff --check` 和 `lzc-cli project release` 均通过；当前环境没有 Bun，因此新增 Ghostty Bun 单测未单独执行，但同一兼容性分支已通过运行时 bundle 的 Node 构造测试。已生成 `cloud.lazycat.webshell.lcmd-v1.0.7.lpk`，SHA-256 为 `54be66f9c5d91cc4c78432f04d6e45207a14ba0d9dd10921ffcd6bc482715e8c`；包内 `.lpk-version` 为 `1.0.7`，WASM SHA-256 与工作区一致为 `04c1a6f1ae963c4665886073d275d373d1b1f3b81bf71952b4f4ff77c537129a`，导出表包含 generation API，JS bundle 包含硬校验、动态 revision 比较和无 fallback generation 逻辑。由于旧 `1.0.6` Provider 本身没有动态版本逻辑，如果平台升级 LPK 时不自动重启 Provider，从 `1.0.6` 升到 `1.0.7` 需要让 Provider 至少重启一次；新 Provider 生效后，后续纯前端资源版本切换无需依赖清理浏览器缓存。
- 禁止复现：不得在 Provider 启动时冻结对外 asset version；不得让旧版本 asset URL 在 `.lpk-version` 变化后继续返回新文件；不得只修改 Service Worker 而遗漏首页、静态 handler 和 server revision；不得在 generation ABI 缺失时退回 scrollback 长度差并继续运行。

### LCMD-20260731-03：普通 PTY 输出发生整屏位移时只重画底部脏行

- 日期：2026-07-31
- 来源：`1.0.7` 现场复验；多次刷新可高概率复现终端上半部分为可滚动黑区，且不只发生于初始化，Agent 持续输出内容时也会出现；调整窗口尺寸后无需重新获取字节即可恢复完整画面
- 影响模块：Ghostty Web canvas render 调度、WebShell 缓存回放、WebSocket PTY 批量输出和即时错误输出
- 错误现象：终端模型中仍保留受行数限制的历史内容，但 canvas 偶发只显示底部最新一段，上方为纯黑且仍可滚动；继续输出时已有画面也可能消失。resize 强制整帧绘制后内容立即恢复，说明不是 Cache API、IndexedDB、WASM 数据丢失或单纯首次 fit 失败。
- 根因：`scrollback_generation` 只能识别有新行进入历史，不能完整表达活动屏幕行删除、插入、滚动区域滚动及部分控制序列造成的多行像素位移。Ghostty renderer 的局部 dirty row 范围在这些组合状态下可能只覆盖底部新行；旧区域已被清除或发生逻辑位移，却没有被重新绘制，因此留下黑区。此前只在 generation 前进、回放批次结束或 resize 时要求 full render，普通 Agent 输出仍可能走不完整的局部重绘。
- 实施方案：所有进入 Ghostty 的 PTY 输出均在 write 后合并请求下一动画帧 full render；Ghostty Web 的 `writeInternal` 本身无条件设置 full-render 意图，WebShell 的队列批量输出与即时输出路径再显式固定该契约。缓存 replay 取消待执行 rAF 时保留 full-render 标记，并继续在有序批次边界同步整帧绘制。多个 write 在同一动画帧内只合并为一次整帧绘制，不按字节或单条 WebSocket 消息重复绘制。
- Guard：Ghostty `active-screen line edits do not move a history viewport` 同时断言 generation 不变、历史 viewport 不移动且下一帧仍必须 full render；`TestRuntimeTerminalCanvasResidueGuard` 要求定制 bundle 的每次 write 无条件 full render，要求 WebShell 队列和即时输出路径均显式请求 full render，并禁止恢复 generation-only 的 `this.requestRender({ full: s })`。
- 验证结果：`node --check` 通过 `runtime/static/main.js`、`runtime/static/ghostty-web.js`、`service-worker.js` 和 `terminal_cache_v2.js`；Node cache-v2 行为测试 8/8、完整 `go test ./...`、Ghostty Prettier/Biome/TypeScript 和两个仓库的 `git diff --check` 均通过。`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.8.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.8`，Ghostty write、WebShell 队列输出和即时输出的 full-render 路径均已核对；包内 WASM SHA-256 为 `04c1a6f1ae963c4665886073d275d373d1b1f3b81bf71952b4f4ff77c537129a` 且包含 generation 导出，LPK SHA-256 为 `223a2a5ca4e0c08e609667607c7a9484161c2c381ef32da97f23025992d7fa90`。当前环境没有 Bun，Ghostty Bun 单测无法执行；真实浏览器仍需复验多次刷新、长历史缓存回放和 Agent 持续输出期间不再出现黑区。
- 禁止复现：不得再以 scrollback generation 是否变化作为 PTY 输出需要整帧绘制的唯一条件；不得让 replay 的 rAF 取消路径清除尚未消费的 full-render 意图；不得把修复退化为逐字节同步绘制。resize 只能作为结果对照，不能成为恢复终端历史画面的正常依赖。

### LCMD-20260731-04：越界 viewport 导致终端上半屏被当作不存在的历史行

- 日期：2026-07-31
- 来源：`1.0.8` 现场稳定复现；续接 `LCMD-20260731-03`，全量 full render 后问题仍存在
- 影响模块：Ghostty Web viewport/平滑滚动状态、Canvas renderer、定制 WASM RenderState ABI、WebShell 运行时 bundle
- 错误现象：刷新、缓存回放或 Agent 持续输出时，终端偶发且可稳定复现上半部分纯黑、仅底部显示最新内容；黑区仍可滚动，但高度小于真实历史。继续 full render 无法恢复，调整窗口大小后立即恢复，且无需重新拉取历史字节。
- 根因：Ghostty Web renderer 信任传入的 `viewportY`，没有在每帧绘制前按当前 `scrollbackLength` 重新约束。当回放、平滑滚动、history trim 或尺寸/状态切换留下 `viewportY`/`targetViewportY` 大于当前历史长度时，顶部行会计算出负的 scrollback offset；取行返回 `null`，而 full render 已先清空 canvas，因此顶部保持纯黑，只在底部绘制活动屏幕。WebShell 的 `resizePane()` 会通过 `restoreTerminalViewport()` clamp 这两个值，所以 resize 看似“重新渲染历史”并立即恢复。另一个一致性风险是定制 `ghostty_render_state_get_viewport` 在 `RenderState.update()` 后仍绕过官方 `row_data`，直接读取 `active.pages`，使页重排时导出帧不再遵循 Ghostty 的 viewport 快照。
- 实施方案：Canvas renderer 每次绘制前调用 Terminal 的 `normalizeViewportBounds()`，原子地把当前 viewport 和平滑滚动 target 限制到 `[0, scrollbackLength]`，再计算历史 offset、fractional scroll 和 scrollbar；运行时定制 bundle 同步相同逻辑。WASM viewport 与 grapheme 导出改为只读取官方 `RenderState.row_data` 中已复制的 raw cell、style 和 grapheme，不再重新 pin `active.pages`。Ghostty Web 增加 render-state freshness 标记，在 write/resize 后失效、update 后提交；直接调用 `getViewport/getGrapheme` 时只在快照过期时补一次 update，保持旧 API 的即时读取语义且避免每个 grapheme 重复同步。LPK version 提升到 `1.0.9` 并携带新 WASM。
- Guard：Ghostty `render clamps stale viewport state to retained scrollback bounds` 人为注入越界 viewport/target 并要求一次 render 即同时修正；Zig `render state viewport export follows the official viewport snapshot` 将 Ghostty viewport 固定在 history top，要求导出结果与 `RenderState.row_data` 相同且明确不同于 active area；既有 Grapheme Cluster Support 测试固定 write 后直接读取 viewport/grapheme 仍返回新内容；WebShell `TestRuntimeTerminalCanvasResidueGuard` 固定运行时 bundle 必须在 renderer 入口调用 `normalizeViewportBounds()`，并保留 render-state freshness guard。
- 验证结果：Ghostty WASM `ReleaseSmall wasm32-freestanding` 重新构建通过；Zig `test-lib-vt -Dtarget=x86_64-linux-musl -Dtest-filter='render state viewport export follows the official viewport snapshot'` 通过；Ghostty Web 全量 Bun 测试 `382/382`、Prettier、Biome、TypeScript 和 Vite production build 通过，包含 ESC reset/滚屏压力测试及越界 viewport 回归。`node --check runtime/static/ghostty-web.js`、完整 `go test ./...` 和两个仓库 `git diff --check` 通过。`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.9.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.9`；包内 WASM SHA-256 为 `65a99188312ad92780b3af2fa410b8af395536dfe1e777ec24573d8be1436f16`，运行时 Ghostty bundle SHA-256 为 `1a8cf2df40b252eca546bf0e943cfd1b74990dc77407f8a914e6e9f169ae49e5`，LPK SHA-256 为 `e2004f2a13bc9b06caf8aaaae2ffbc312e6204acc838489e6526a6513def445c`。真实浏览器仍需复验连续刷新、缓存首帧和 Agent 持续输出期间不再出现顶部黑区。
- 禁止复现：renderer 不得用未经当前 scrollback 长度校验的 viewport 计算历史 offset；修复不得只放在 resize、首次 fit 或 WebShell 外层，因为普通输出和库调用同样会进入该状态；WASM `render_state_get_viewport/get_grapheme` 不得再次绕过 `RenderState.row_data` 直接读取活动 PageList。

### LCMD-20260731-05：502/Agent 故障期间销毁终端最后一帧并中断恢复

- 日期：2026-07-31
- 来源：现场反馈；终端运行中偶发突然黑屏，控制台同时出现 workspace 502，PWA 无法保留离线终端观感
- 影响模块：Provider 到 persistent agent 的 HTTP/WebSocket 控制面、浏览器 workspace 重试、PTY 退出协议、Ghostty canvas 呈现和历史增量恢复
- 错误现象：Agent、`lightosctl`、socket 或 workspace 请求短暂不可用时，部分 attach 基础设施错误被包装为非重试 `process-exit`。浏览器收到后先删除历史缓存并销毁 pane，再只请求一次 workspace；该请求若返回 502，页面永久留下黑屏。历史校验和缓存重放失败还会通过 `markPaneRenderPending()` 主动 clear renderer/canvas，并由 `renderReady=false` CSS 隐藏已经成功呈现的画面。普通 WebSocket 重连虽然支持 `current/delta`，这些破坏性分支却会丢弃本地 cursor 并退化为黑屏 snapshot。
- 根因：连接、同步、呈现和会话身份共用同一套 ready/reset 状态；基础设施故障与权威 PTY 退出没有稳定协议边界；workspace refresh 没有持续退避重试；pane 销毁发生在权威 workspace 确认之前。
- 实施方案：Provider attach 的 Agent ensure、pipe、start 和转发错误统一发送可重试 `connection-error`，pane not found 改为请求 workspace refresh；真实 PTY 退出帧标记为 authoritative。浏览器增加独立 workspace 指数退避重试，网络恢复时恢复全部已有 pane；`connection-error` 和普通 close/error 只断开、锁输入并使用现有 history generation/cursor 重连，继续优先选择 `current/delta`。非重试 `process-exit` 只标记 pending exit并保留最终画面，成功 workspace 响应确认 pane 不存在后才执行原有 cache/pane 清理。`markPaneSyncPending()` 不再清 canvas；CSS 只隐藏从未产生过真实帧的 canvas。已有画面需要 snapshot 时先收齐网络字节，并用独立 canvas 冻结旧帧覆盖 reset/replay，成功 render 后再释放；失败继续保留旧帧。身份不匹配仍立即调用独立的 presentation invalidation，维持跨账号、实例和会话隔离。LPK version 提升到 `1.0.10`。
- Guard：`TestAgentConnectionErrorPayloadIsRetryable`、`TestAgentAttachInfrastructureFailuresDoNotMasqueradeAsPaneExit` 固定基础设施错误协议；`TestRuntimeOfflineFrameAndWorkspaceRetryGuard` 固定 workspace 持续重试、`connection-error` 非破坏处理、process exit 延迟销毁、snapshot 旧帧冻结和网络恢复全 pane 重连；`TestRuntimeTerminalCanvasResidueGuard` 禁止 `markPaneSyncPending()` 重新调用 renderer clear、canvas clear 或 runtime reset，并固定 `hasPresentedFrame` CSS 门禁。既有 history sync 测试继续固定 generation/cursor 合法时选择 `current/delta`，范围失效时才选择 snapshot。
- 验证结果：`node --check runtime/static/main.js`、完整 `go test ./...` 和 `git diff --check` 通过；`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.10.lpk`。包内 `package.yml` 与 `.lpk-version` 均为 `1.0.10`，`main.js` 包含 workspace 15 秒封顶退避、`connection-error`、pending exit、snapshot frame hold 和 `markPaneSyncPending`，CSS 包含 `hasPresentedFrame` 门禁，Provider 二进制包含 `connection-error` 与 `workspace-refresh-required`。LPK SHA-256 为 `7be6c5aeb799209fce920994ec4bd8823b69b87df89284ca13360e513bb7b40d`。当前环境没有针对实际 Lazycat WebView 的网络/Agent 故障注入能力，仍需现场验证运行中制造 workspace 502、短时停止 Agent 和服务恢复后的 delta 字节数、画面连续性及输入解锁。
- 禁止复现：不得把 Agent/Provider/网络错误重新编码为权威 pane exit；不得在 workspace 成功确认前删除 pane 或缓存；不得让 502、重连或 snapshot 等待清空/隐藏已有同身份帧；不得为了恢复连接无条件设置 `history_replay_mode=snapshot`。增量数据只能追加到完全匹配的 account scope、selector、workspace generation、tab、pane 和 history generation。

### LCMD-20260731-06：可见历史行非原子读取导致 full render 提交黑区

- 日期：2026-07-31
- 来源：`1.0.10` 前后现场稳定复现；刷新或 Agent 持续输出时偶发只显示底部最新字节，上半区域为可滚动黑区，resize 后恢复；补充观察到旧版本断流恢复会先黑屏再只绘制新字节
- 影响模块：Ghostty Web RenderState/Canvas renderer、事件驱动 render scheduler、WebShell 同步 full render 与离线帧保留
- 错误现象：终端模型和历史 cursor 未丢失，但一次 full render 可以先清空 canvas，再逐行读取活动屏幕或 scrollback；任一可见行临时返回 `null` 时，该行保持黑色，renderer 仍清除 dirty 状态并把帧报告为成功。活动屏幕底部路径虽已有一次 `getViewport()` 快照，滚动历史、fractional viewport、hover 扫描和部分重绘仍会重复跨 WASM 读取；源码还保留常驻 60 FPS loop，与实际发布 bundle 的按需调度不一致。断流清屏属于 `LCMD-20260731-05` 的独立问题，本条继续固定网络故障不得破坏最后一帧。
- 根因：canvas 提交与终端行读取不是一个事务。full clear 发生在所有可见行确认可用之前；失败行没有 retry 语义，`getViewport()` 导出失败还会返回旧 cell pool。`getLine()` 每行重新导出整个 viewport，full render 接近 `O(rows² × cols)`，放大大量缓存 replay 和持续输出时的时序窗口。fractional viewport 若直接拿浮点值判断历史/活动屏幕边界，还可能请求等于 scrollback length 的越界行。
- 实施方案：Ghostty renderer 每帧先物化完整可见窗口：活动屏幕只调用一次 `getViewport()` 并复制 grapheme 文本，scrollback 中每个可见行只读取一次，统一使用整数 viewport line 映射；移动端 fractional scroll 额外物化顶部半行。所有行成功后才允许 resize/full clear、逐行绘制、`clearDirty()` 和 `onRender`。任一行缺失时直接返回失败，保持 last-known-good canvas 和 dirty 状态，并由 Terminal 以 16ms 到 250ms 退避强制重试；新输出会立即抢占退避。`getViewport()` 只接受完整 cell 数，RenderState freshness 在 write/resize 后失效并在同帧复用。Ghostty TypeScript 源码同步切换为发布 bundle 已使用的按需 render scheduler；WebShell `renderPaneFullNow()` 只在 `renderNow(true)` 实际成功时返回成功，并在同步渲染前取消旧 retry timer。LPK version 提升到 `1.0.11`。
- Guard：Ghostty `CanvasRenderer > Atomic viewport materialization` 覆盖单帧只导出一次活动 viewport、历史缺行时零 canvas 提交/不清 dirty、fractional viewport 不请求越界 offset；`failed frame materialization preserves render state and retries` 固定失败不触发 `onRender`、保留 full-render 意图并建立退避，成功后清理 retry。WebShell `TestRuntimeTerminalCanvasResidueGuard` 固定 materialization 必须早于 canvas clear，禁止提交阶段重新读取历史行，并固定 retry、同步 full render 返回值及断流不清屏边界。
- 验证结果：Ghostty Prettier、Biome、TypeScript、386 项 Bun 全量测试和 Vite production build 通过；WebShell `runtime/static/main.js`/`ghostty-web.js` 语法检查、Node cache-v2 行为测试和完整 `go test ./...` 通过。`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.11.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.11`，包含原子 materialization、退避 retry、同步 render 返回值和 `connection-error` 保帧路径。运行时 bundle SHA-256 为 `428c3daf38f1183d3a5eb633a46b3ac6d4894db2a2b303fc29cca534d9362182`，WASM SHA-256 为 `65a99188312ad92780b3af2fa410b8af395536dfe1e777ec24573d8be1436f16`，LPK SHA-256 为 `979bb6999200e653c9254c1ac8d54a757ac3259e17dd94b69c317db3be097d56`。真实浏览器仍需复验连续刷新、断流恢复、长历史滚动和 Agent 持续输出时不再出现部分黑屏。
- 禁止复现：不得在所有可见行准备完成前清空或部分提交 canvas；行读取失败不得调用 `clearDirty()`、发出成功 `onRender` 或隐藏最后一帧；不得让 full render 按行重复导出活动 viewport；fractional viewport 不得以浮点边界请求 `scrollbackLength` 行。断流、502 和重连仍不得调用 renderer clear 或 presentation invalidation。冷历史按需解析属于后续 Cache v3/row-block 架构，不能用未经 checkpoint 的原始 PTY 字节裁剪替代本条修复。

### LCMD-20260731-07：受保护 PWA manifest 反复 401 且首屏恢复被启动瀑布和碎片缓存拖慢

- 日期：2026-07-31
- 来源：`1.0.11` 现场反馈；几乎每次刷新都出现 `/assets/1.0.11/manifest.webmanifest` 401，同时首次进入页面明显慢于同页后续 tab
- 影响模块：LightOS 外层 Cookie 鉴权、PWA manifest、Service Worker 静态资源策略、浏览器 bootstrap、Cache API v2 字节块布局和恢复指标
- 错误现象：浏览器反复请求版本化 manifest 并收到 401，PWA 安装元数据不可用；同版本刷新仍先等待代理返回 JS/CSS/WASM/JSON。终端缓存恢复要等 Ghostty WASM、主题、设置、自定义字体、实例列表和启动输入锁依次完成后才请求 workspace；workspace 应用前还创建一个随后因权威 cache identity 到达而销毁的临时 pane。历史缓存虽然只有数百 KB，却可能积累上千个小 Cache 条目，放大首次 warm replay 的 `Cache.match()` 开销。
- 根因：Web App Manifest link 未声明 `crossorigin="use-credentials"`，浏览器按 manifest 的默认 credentials mode 省略同源认证 Cookie，401 由 Provider 之前的 LightOS 代理返回。Service Worker 对已经带 LPK 版本且服务端声明 immutable 的资源仍执行 network-first，并且只在 fetch 抛异常时回退缓存，401/502 会直接返回。bootstrap 在模块顶层先 await WASM，之后串行请求主题、设置和字体、实例、输入锁、workspace；Cache v2 又把每次小输出提交为独立不可变块，没有尾块合并或旧 manifest 压缩。
- 实施方案：manifest link 增加 `crossorigin="use-credentials"`。Service Worker 对当前 `assetBase` 先查当前版本 app-shell cache，命中立即返回；缓存未命中才联网，网络非 2xx 或异常时回退已有静态响应，导航/API/WebSocket/终端虚拟 URL 仍保持 network-only。Ghostty 初始化改为启动即发起但不阻塞模块定义；主题、设置、实例、启动输入锁并行，URL 已有 selector 时 workspace 与实例列表并行请求；初始设置先应用 scrollback、主题关联和字体族，自定义字体文件后台加载。删除启动时必然被权威 workspace identity 淘汰的临时 pane，workspace 应用后优先预读活动 pane manifest，只连接活动 tab，其他总览图片延后到 idle。Cache v2 后续追加会把连续小块合并到约 128KB 尾块；网络同步和输入就绪完成后在 idle 中按完整身份与 history generation 压缩旧碎片，仍坚持新块先写、manifest 后提交、旧块最后删除。恢复日志补充从 navigation/module、WASM、设置、实例、workspace 到真实 canvas 的页面级时间点。LPK version 提升到 `1.0.12`。
- Guard：`TestRuntimeContainerCacheV2AndPWAContract` 固定 manifest credentials、当前版本 cache-first、非成功响应回退、启动并行、活动 pane 优先、隐藏 tab 延后和 compaction 调度；`TestRuntimeMobileDeployRestartUsesBottomSheet` 禁止恢复初始临时 pane；`terminal_cache_v2_test.mjs` 新增小 append 自动合并和旧碎片压缩测试，覆盖 cursor 顺序、preview 保留、替换块数量及压缩前后字节一致。
- 验证结果：`node --check` 通过 `main.js`、`service-worker.js` 和 `terminal_cache_v2.js`；Node cache-v2 行为测试 10/10、完整 `go test ./...` 和 `git diff --check` 通过。`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.12.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.12`，并确认包含 manifest credentials、当前版本 cache-first、并行 bootstrap、活动 pane manifest 预读和 Cache v2 compaction。包内 `main.js` SHA-256 为 `1bd8262c7ed55dbba18e3df3abf6f43de8164d9fc6efb8e25410f24d3ae15da4`，Service Worker 为 `63ef55510a15e64f94b53b15a34f8f9ac9a0fdc96400947546a7d41ccfa695ef`，Cache v2 为 `7dd0ca2fd4f09162f56870b7f97cafa8438ebe7865f66e6ccee8ab79392a22a2`，LPK 为 `78fbbe5ad4a8b9f2fb775012c85435691e4a0ef86be251ff9fc8ec7fd26e65c9`。真实 LightOS 域名仍需在安装后确认 manifest 不再 401，并用新增 `pageWorkspaceRequestStartMs`、`pageWorkspaceReadyMs`、`pageRealCanvasVisibleMs` 对比连续刷新时序。
- 禁止复现：受保护的 manifest 不得恢复为省略 credentials；当前版本 immutable 资源不得重新执行每次刷新 network-first；非 2xx 静态响应不得覆盖可用本地 app shell。不得在 workspace 完整身份到达前读取或显示终端历史，不得让 warm canvas 解锁输入；后台字体、总览和缓存压缩不得进入活动 pane 首帧关键路径。压缩不得改变 cursor、generation、preview checkpoint 或完整账号/workspace/tab/pane 身份，也不得在 manifest 提交前删除旧块。

### LCMD-20260803-01：嵌入终端覆盖最后工作区并持久化嵌入模式

- 日期：2026-08-03
- 来源：Safari 客户现场反馈；第三方应用终端使用 `embed=1`，关闭应用后 LightOS 恢复到第三方实例且右上角选项栏不显示
- 影响模块：`runtime/static/main.js` 工作区恢复状态、页面生命周期写入和 5 秒恢复心跳
- 错误现象：第三方应用打开 `abc` 实例的嵌入终端后，WebShell 的 `pageshow`、`pagehide`、`beforeunload`、`visibilitychange` 或定时心跳可能把它写成最后工作区；随后从 LightOS 根页面恢复时直接进入该实例，并因保存 URL 含 `embed=1` 持续隐藏右上角选项栏。
- 根因：所有生命周期写入最终都会调用 `persistWorkspaceRestoreState`，但该函数没有区分临时终端，也原样保存当前 URL 的 `embed` 参数。共享 localStorage 单槽因此采用“最后写入者获胜”，Safari 的页面挂起和恢复时序只提高了第三方页面最后写入的概率。
- 实施方案：在最底层 `persistWorkspaceRestoreState` 对 `last` 去除首尾空白并忽略大小写，值等于 `false` 时直接跳过写入且保留原有恢复状态；其他页面保存前统一删除 `view`、`embed` 和 `last`，只持久化可独立打开的普通 WebShell URL。读取旧状态时拒绝并清除 URL 中含 `last=false` 的无效记录，避免直接打开 `/webshell/` 时继续恢复已被旧版本污染的临时实例。
- Guard：`TestRuntimePersistsWorkspaceForLightOSHomeReload` 固定 `last=false` 的底层写入门禁、旧状态清理以及 `embed`/`last` 参数删除；所有生命周期和定时写入继续只经 `persistWorkspaceRestoreState` 更新共享恢复槽。
- 验证结果：`go test ./...`、`node --check runtime/static/main.js`、Node 隔离状态模拟（`last=false` 不写入、普通 embed 去参数保存、旧 `last=false` 清除）、`git diff --check` 通过。
- 禁止复现：不得在各生命周期事件中绕过统一持久化入口；`last=false` 页面不得写入或清空已有最后工作区；允许保存的恢复 URL 不得包含 `embed`、`last` 或 `view`。

### LCMD-20260803-02：Agent 空响应、并发冷启动与 socket 争用导致 WebShell 启动失败

- 日期：2026-08-03
- 来源：客户截图、根目录现场日志与测试机确定性故障注入；续接 `LCMD-20260730-03` 和 `LCMD-20260731-05`
- 影响模块：Provider persistent agent 请求/安装/启动、目标实例 daemon/socket、并发 workspace/WebSocket 冷启动和浏览器启动错误面板
- 错误现象：把目标实例 `/usr/local/bin/lcmd-webshell-agent` 替换为空脚本并保持 manifest 不变后，WebShell 可稳定出现 `invalid agent response: unexpected end of JSON input: output=<empty>`。并发冷启动还可能启动多个同 scope daemon，互相删除或抢占 socket，产生 `EOF`、502、socket bind 冲突或启动命令已经返回 ready 但 daemon 尚未 listen 的假成功；已有 warm frame 时真实启动错误只写入控制台，页面没有错误面板。
- 根因：`agent request` 客户端把 Unix socket 零字节 EOF 当作成功，Provider 随后直接对空 stdout 做 JSON 解码；安装 cache 只比较可执行权限与 manifest 文本，没有核对最终 agent 二进制 SHA-256，因此被替换的空脚本仍被视为已安装。同 scope 的 ensure/install/start 没有共享 flight，HTTP/WebSocket 请求取消又会取消各自启动；starter 与 daemon 都会无条件删除 socket，daemon 没有跨进程锁，starter 在后台命令提交后立即打印 ready。`lightosctl` 使用的现有 exec-stream 仅定义 stdin/stdout/stderr/control 字节流，control 在 core 端被丢弃，没有可供调用方读取的远端退出码，不能把本地流正常结束等同于远端脚本成功。
- 实施方案：`agent request` 在 socket 响应为零字节时返回 `io.ErrUnexpectedEOF`，Provider 在 JSON 解码前单独拒绝空响应。manifest 解析必须得到当前协议和合法 SHA-256；每次 install cache 命中都在目标实例用 `sha256sum` 或 BusyBox fallback 校验实际 agent，staging 解包后也先校验 payload SHA，再原子替换 agent 和 manifest。Provider 新增按完整 scope key 的共享 ensure flight，使用独立 60 秒后台 context；单个调用方取消只停止等待，32 路冷启动只执行一次 resolve/install/start。daemon 对 `<socket>.lock` 持有非阻塞 `flock`，获得锁后才清理不可连接的 stale socket；退出时通过 inode 身份只删除自己创建的 socket。starter 不再删除 socket，向 daemon 传递本次唯一 ready 文件并等待 marker 内容精确匹配且子进程仍存活；daemon 仅在 bind/listen、socket stat/chmod 全部完成后原子写 ready。跨 Provider 启动竞争失败后再次 ping，若另一 daemon 已就绪则直接复用。warm/last-known-good frame 保持不被终端错误文本覆盖，但同时显示启动错误面板。LPK version 提升到 `1.0.13`。
- Guard：`TestRunAgentRequestClientRejectsEmptyResponse`、`TestParsePersistentAgentResponseRejectsEmptyOutput` 固定空响应失败；`TestAgentInstallScriptRejectsPayloadHashMismatch` 和 `TestEnsureAgentBinaryInstalledVerifiesCacheHit` 固定实际 SHA 校验与 staging 原子替换；`TestPersistentAgentEnsureCoordinatorSharesConcurrentColdStart` 以 32 路调用固定单 flight，`TestPersistentAgentEnsureCoordinatorCallerCancellationDoesNotCancelSharedStart` 固定请求取消边界；`TestReconcileAgentDaemonsPreservesSocketOwnerAndStopsDuplicates`、`TestReconcileAgentDaemonsStopsAllOrphansWhenSocketIsMissing` 和 `TestAgentDaemonArgsMatchRequiresExactScope` 固定升级时只保留 socket 真实 owner、socket 缺失时清理全部孤儿且不跨 scope 杀进程；`TestAgentDaemonLockAllowsOnlyOneOwner`、`TestAgentDaemonSocketCleanupPreservesReplacementOwner`、`TestRemoveStaleAgentSocketRejectsActiveListener`、`TestRemoveStaleAgentSocketRemovesClosedListener` 和 `TestWriteAgentReadyFileIsAtomicAndExact` 固定 daemon 锁、socket 所有权、stale 清理和 ready 合同；`TestStartPersistentAgentChecksExecutableBeforeReadyMarker` 禁止 starter 重新删除 socket或提前 ready；`TestRuntimeOfflineFrameAndWorkspaceRetryGuard` 固定 warm frame 保留且错误面板可见。
- 验证结果：`node --check runtime/static/main.js`、完整 `go test -race ./...` 和 `git diff --check` 通过。本机真实进程验收中，一个 daemon 完成 ready 后 32 路并发 ping 全部成功，32 个同 socket 重复 daemon 全部被锁拒绝，主 daemon 最终 ping 继续成功。测试机从 17 字节故障脚本、3 个同 scope 孤儿 daemon 且 socket 缺失的状态原地升级后恢复：agent SHA-256 为 `6747abf65066867ff3cd3187a36dd7c8c4020bf685a4c331c09100fe7f068360`，reconcile 清理旧孤儿后同 scope 仅 1 个 daemon，socket 与 lock 存在，32 路并发请求零失败；用户确认截图复现链和 WebShell 修复验收通过。`lzc-cli project release` 生成 `cloud.lazycat.webshell.lcmd-v1.0.13.lpk`，包内版本为 `1.0.13`，LPK SHA-256 为 `895053f508e20d7d5524cfd7c4d34c52b7afd91241a1b7b3c6b78e309b4dbe0f`。
- 禁止复现：不得把零字节 agent stdout 当作成功或继续交给 JSON 解码；不得仅凭 manifest 文本跳过实际二进制 SHA 校验；同 scope 启动不得绑定任一请求的取消生命周期或并发执行 install/start；starter 不得删除 daemon socket或在 listen 前打印 ready；daemon 不得在未持有 scope 锁时清理 socket，退出时不得删除其他进程替换后的 socket；不得因为已有 warm frame 就隐藏真实启动错误。远端退出码在 exec-stream 协议正式定义前不得伪造，关键脚本必须继续用可验证的精确成功 marker。

### LCMD-20260804-01：实例重启残留 agent socket 阻断 WebShell 自愈

- 日期：2026-08-04
- 来源：安装桌面的 LightOS 实例进入 WebShell 现场截图；续接 `LCMD-20260803-02`
- 影响模块：`agent_reconcile_linux.go`、persistent agent reconcile/start 链路、实例重启后的 `/tmp/lcmd-webshell-agent-*.sock`
- 错误现象：实例重启后 `/tmp` 中保留旧 agent Unix socket，但原 daemon 已退出；WebShell reconcile 连接该路径得到 `connect: connection refused` 后直接失败，后续重复进程清理、stale socket 删除和新 daemon 启动均不会执行，页面持续显示启动错误。
- 根因：`activeAgentSocketPID` 把所有 Unix socket connect 错误都视为致命错误，没有区分仍有活跃 listener 的 socket 与 inode 存在但已无 listener 的 `ECONNREFUSED` stale socket；LightOS 的 `/tmp` 不随实例重启清空，使该状态可以稳定跨重启保留。
- 实施方案：Linux reconcile 在 socket 类型校验通过后，只把 `ECONNREFUSED` 以及 `Lstat` 与 connect 之间路径消失的 `ENOENT` 解释为当前没有活跃 socket owner，继续按 scope 清理孤儿 daemon并进入既有启动流程；权限错误、非 socket 文件和其他未知连接错误继续显式失败。daemon 启动仍由已有 `removeStaleAgentSocket` 在持有 scope lock 后删除 stale inode，不在 reconcile 中绕过锁抢先删除。LPK version 提升到 `1.0.16`。
- Guard：`TestReconcileAgentDaemonsAcceptsRefusedStaleSocket` 创建关闭 listener 后仍保留 inode 的确定性 `ECONNREFUSED` 状态，固定 reconcile 成功且后续 daemon stale 清理可以继续；既有 `TestReconcileAgentDaemonsPreservesSocketOwnerAndStopsDuplicates` 继续固定活跃 owner 不被终止。
- 验证结果：`go test ./... -run 'Test(ReconcileAgentDaemons|RemoveStaleAgentSocket)' -count=1`、新增 stale socket 测试连续 10 次运行、`go test -race ./...`、`git diff --check` 和工作区根目录 `./lightos-build.sh` 通过。构建产物 `local-lcmd-webshell.lpk` 版本为 `1.0.16`，LPK SHA-256 为 `f38482f47fb3a5ddf4db8ee5d245603b052180867c80a9a8e673c730bdff02d3`，内嵌二进制 SHA-256 为 `91361264d8bb1dd6b86a326dd8c819a9b1e63fa0f766f6a3b8fda1a5ee6c38ab`。实际 LightOS 实例仍需在保留 `/tmp/lcmd-webshell-agent-*.sock` 后重启并复验 WebShell 自动恢复。
- 禁止复现：不得把 `ECONNREFUSED` stale socket 再次作为 reconcile 的终止条件；不得吞掉权限、路径类型或未知连接错误；不得在未持有 daemon scope lock 时删除 socket。

### LCMD-20260806-01：v6 活跃 agent 被保留导致 v7 无法接管 socket

- 日期：2026-08-06
- 来源：旧版本升级到 `1.0.16` 后的现场截图 `微信图片_20260806153141_166_8.png`；续接 `LCMD-20260730-03`、`LCMD-20260803-02` 和 `LCMD-20260804-01`
- 影响模块：Provider agent 协议识别、安装后 reconcile、目标实例活跃 daemon/socket 和 v6 -> v7 原地升级
- 错误现象：旧版本已有 `lcmd-webshell-agent-v6` daemon 时，Provider 能识别协议不兼容并成功原子安装 v7 二进制，但普通 reconcile 输出清理 0 个进程；随后 v7 daemon 在 readiness 前以状态 1 退出，WebShell 稳定显示启动错误。重启 LightOS 后旧 v6 进程消失，新 v7 才能启动，因此表现为所有旧版本升级用户必现、重启后恢复。
- 根因：安装只替换 `/usr/local/bin/lcmd-webshell-agent` 路径，已经运行的 v6 进程继续执行旧 inode 并持有 Unix socket。reconcile 无条件保留 socket 的活跃 owner，没有区分该 owner 是否仍使用兼容协议；新 v7 daemon 获得自身锁后发现旧 socket 仍可连接，按既有安全守卫返回 `agent socket is already accepting connections` 并退出。安装前协议结果也不能直接授权稍后终止进程，因为跨 Provider 竞争期间该 socket 可能已经被兼容 v7 owner 接管。
- 实施方案：协议不兼容改为可通过 `errors.As` 识别的结构化错误，普通超时、EOF、权限或 JSON 错误不再通过字符串命中升级分支。安装和普通 reconcile 后重新 ping 当前 socket；只有这次最新 ping 仍明确返回不兼容协议时，Provider 才调用新 `agent reconcile --replace-active`。替换模式要求 socket peer PID 必须同时出现在相同 socket、selector 和 account 的精确 daemon 进程集合中，否则显式拒绝；目标端在发信号前还会直接 ping socket 复核协议，若并发 Provider 已完成 v7 接管则返回并保留该 owner。确认仍为旧协议后只结束当前活跃 PID，先 SIGTERM、超时再 SIGKILL 并等待退出；同 scope 孤儿由此前的普通 reconcile 清理，随后由现有 daemon 锁和 stale socket 清理接管启动。默认 reconcile 继续保留活跃兼容 owner，跨账号 owner、普通连接故障和并发期间已经启动的 v7 都不会被替换。LPK version 提升到 `1.0.17`。
- Guard：`TestParsePersistentAgentResponseClassifiesProtocolMismatch` 固定只有结构化协议错误可以授权替换；`TestReconcileAgentDaemonsReplacesActiveOwnerAfterProtocolMismatch` 固定先由普通模式清理同 scope 孤儿、再由显式模式结束旧协议活跃 owner；`TestReconcileAgentDaemonsPreservesCompatibleOwnerDuringReplacementRace` 固定目标端复核发现 v7 后不再执行过期的替换意图；`TestReconcileAgentDaemonsRejectsReplacingDifferentScopeOwner` 固定跨账号 socket owner 不被终止；`TestReconcileAgentDaemonsPreservesSocketOwnerAndStopsDuplicates` 继续固定默认模式保留兼容 owner；`TestEnsurePersistentAgentPingsBeforeInstalling` 固定替换入口位于安装后最新 ping 的协议类型守卫内。
- 验证结果：协议、notice、启动和 reconcile 定向测试通过；活跃旧 owner 替换、并发 v7 owner 保留、跨 scope 拒绝和默认保留测试连续 20 次通过；完整 `go test -race ./...` 与 `git diff --check` 通过。使用 `843f2bf~1` 构建真实 v6 agent、当前源码构建 v7 agent 的临时升级验证中，v7 request 先收到 `lcmd-webshell-agent-v6`，`reconcile --replace-active` 精确移除 1 个旧 owner，随后新 daemon ping 返回 `lcmd-webshell-agent-v7`。工作区根目录 `./lightos-build.sh` 通过，`local-lcmd-webshell.lpk` 内版本为 `1.0.17`，LPK SHA-256 为 `89fd162e6cce87291970ac561acc4b911659e2d1fed25f1c266b82de64e2be55`，内嵌二进制 SHA-256 为 `b3d08dde789faf7eac6d406e6bc68ca4d97559f0e144643630f24e265d426ea5`；Admin LPK SHA-256 为 `b32ec6b269909aa57683b92a832a7b4114aed464898237b1f3bc66e041ac6212`。
- 禁止复现：不得仅凭安装前的旧协议结果或错误字符串终止活跃 daemon；不得让超时、EOF、权限、空响应或未知协议解析错误进入 `--replace-active`；替换前不得省略 socket peer PID 与完整 selector/account scope 的一致性校验；普通 reconcile 不得重新杀死兼容的活跃 owner。

### LCMD-20260806-02：频繁 resize 切换 tab 产生 Canvas 残影并偶发卡顿

- 日期：2026-08-06
- 来源：用户现场截图 `截图_2026-08-06_13-45-35.png`、Electron 日志与用户对 resize 行为的补充观察
- 影响模块：WebShell `ResizeObserver`、分屏拖动、窗口/tab 激活布局、Ghostty Web Canvas 渲染和 WASM resize/write 时序
- 错误现象：连续调整 WebShell 窗口或 pane 宽高后切换到下一个 tab，上一个 tab 的部分画面会以不规则形状残留到当前 tab；再次调整窗口或重开窗口后恢复，少数情况下 renderer 主线程高负载导致窗口卡死。用户观察到每次 resize 都会让终端内容从顶部重新滚到底部，说明 resize 期间重复 full-render/reflow 正在争用主线程。
- 根因：ResizeObserver、分屏拖动、tab 激活和 window settle 路径可以在同一 pane 上重复提交 resize；每次提交都会触发 Ghostty WASM reflow 和整帧绘制，旧的 Canvas 帧可能在新尺寸提交前被清空，tab 切换又可能在下一帧才完成 fit/render，形成跨 tab 合成残影。resize 与 PTY write 没有明确的原子边界时，WASM 重分配 buffer 期间的写入会与 renderer 读取交错；隐藏 tab 仍持续调度 Canvas RAF，进一步放大主线程负载和 XSync timeout 概率。
- 实施方案：新增按 pane 合并 resize 请求的 `terminal_resize_scheduler.js`，以约 80ms throttle 和 120ms settle 保留最后一次尺寸，`immediate` 只应用最新请求。resize 前复制最后一帧到 frame-hold Canvas，并在尺寸或 Canvas 变化期间保持旧帧可见，成功的 full-render 通过现有 presentation generation 校验后才释放；失败时保留旧帧并进入既有 validation/retry。tab 激活先同步切换 DOM active 状态，再在同一任务中对目标 tab 做最终 fit/full-render；隐藏 pane 继续解析 PTY 数据但取消待执行 Canvas RAF，激活时再做整帧绘制。Ghostty bundle 在 resize 前取消待执行 render，resize 期间把输入写入队列，完成后通过正常 `writeInternal` 路径 flush，dispose 时清空队列；Canvas 尺寸变化但列行数不变时也调用 renderer resize，避免物理尺寸不同步。
- Guard：新增 `terminal_resize_scheduler_test.mjs` 覆盖快速 resize 合并、trailing settle、immediate 覆盖旧请求和 cancel；`TestTerminalResizeSchedulerBehavior` 接入 Go 测试；`TestRuntimeTerminalCanvasResidueGuard` 与 `TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs` 固定 frame-hold、Canvas 尺寸 resize、隐藏 pane RAF 取消、tab 同步激活和 Ghostty resize/write 队列保护；Service Worker precache guard 固定新模块随 runtime 发布。
- 验证结果：`node --check` 通过 `main.js`、`ghostty-web.js` 和 `service-worker.js`；Node resize scheduler 与 terminal cache-v2 行为测试 13/13 通过；`TestRuntimeTerminalCanvasResidueGuard`、`TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs`、`TestTerminalResizeSchedulerBehavior` 及完整 `go test ./...` 通过；`git diff --check` 通过。当前尚未完成真实 Electron 连续拖拽 resize/tab 切换压力截图，因此实机残影和卡死概率仍需在目标 LightOS 环境复验。
- 禁止复现：不得恢复每个 ResizeObserver 回调直接调用 `term.resize()`；不得在 resize 尚未完成时清空或隐藏唯一可见旧帧；不得让隐藏 tab 持续运行 Canvas render loop；不得在 Ghostty buffer 可能重分配时直接写 WASM；不得把列行数不变误认为 Canvas 物理尺寸已经同步。

### LCMD-20260807-01：resize 中间 full-render 暴露终端从顶部滚到底部的重排过程

- 日期：2026-08-07
- 来源：LCMD-20260806-02 修复后的用户复验；残影不再复现，但连续 resize 仍能看到终端内容从顶部逐步滚到下方
- 影响模块：`terminal_resize_scheduler.js` settle 调度、WebShell Canvas frame-hold、PTY 输出期间的 render 请求
- 错误现象：调整窗口尺寸时，终端模型最终位置正确，但用户能看到每个中间尺寸的重排/full-render 过程；页面首帧使用缓存时没有同样的可见滚动，因此问题集中在 resize 的展示提交策略，而不是终端 viewport 最终值错误。
- 根因：原 scheduler 虽然合并请求，但 throttle frame 也会立即调用 `resizePane()`、同步 full-render 并释放 frame-hold。连续拖拽期间每个中间尺寸都被提交给用户；resize 同时到达的 PTY 输出又会请求新的 Canvas RAF，使中间帧更容易暴露。该行为不是 FlashList 能解决的列表排序问题，而是“模型更新”和“可见帧提交”没有分成两个阶段。
- 实施方案：scheduler 增加 `settled` 上下文。throttle frame 只更新 Ghostty/WASM 尺寸并保留旧 raster frame，settle timer 始终执行最后一次提交；单次 resize 也保证有 trailing settled commit。pane 增加 `resizePresentationHold`，full-render 回调在 hold 期间只更新已呈现 generation，不释放旧帧。resize hold 期间到达的输出仍写入终端模型，但取消其待执行 Canvas RAF，并标记最新 content generation 必须在最终提交时 full-render；最终 render 成功后才释放 hold。
- Guard：resize scheduler Node 测试新增中间 `{ settled: false }`、最终 `{ settled: true }` 以及单次 resize trailing commit；`TestRuntimeTerminalCanvasResidueGuard` 固定 `resizePresentationHold`、settled scheduler apply、resize 期间延后 render 和最终 full-render 条件。
- 验证结果：`node --check` 通过；resize scheduler 与 terminal cache-v2 Node 测试 14/14 通过，其中 scheduler 4/4；目标 Go 静态 guard、完整 `go test ./...`、`go test -race ./...` 和 `git diff --check` 通过；真实 Electron 连续拖拽压力截图仍需在目标 LightOS 环境复验。
- 禁止复现：不得在 resize burst 的 throttle frame 释放用户可见旧帧；不得让 resize 期间的 PTY 输出抢占中间 Canvas 提交；settle timer 不得被中间 frame 取消；最终提交必须覆盖 resize 期间积累的最新终端内容。

### LCMD-20260807-02：resize hold 快照被拉伸并暴露底层中间重排

- 日期：2026-08-07
- 来源：LCMD-20260807-01 修复后的用户复验；残影已消失，但仍能看到短距离快速滚动和闪烁
- 影响模块：WebShell frame-hold Canvas、pane resize scheduler、window resize 与 ResizeObserver 提交路径
- 错误现象：resize 时旧终端内容没有稳定停留在原位置，而是出现一小段快速位移；底部缓存快照看似存在但视觉上不起作用。不同尺寸事件结束后偶尔还会出现一次额外的最终帧闪烁。
- 根因：hold Canvas 原先使用 `width: 100%`、`height: 100%` 和 `object-fit: contain`，窗口尺寸变化时浏览器会缩放旧位图，终端行高和底部锚点随容器连续变化。与此同时 throttle 回调仍实际执行 `term.resize()`、full-render 和 PTY resize，快照只是遮盖了这些中间重排；`window.resize` 自己的 settle timer 又和 ResizeObserver scheduler 形成第二个最终提交来源。根因是展示快照、终端模型更新和 PTY 尺寸通知没有形成单一的 settled 提交边界，不是普通列表虚拟化问题。
- 实施方案：hold 快照先按当前 Canvas 的 CSS 逻辑尺寸重采样，保持全容器盒子但使用 `object-fit: none`、`object-position: left bottom`，避免随新窗口缩放；scheduler 的非 settled 回调只保留 hold，不执行终端 resize/render，`resizePane` 自身也拒绝 hold 期间的非 settled 旁路调用，最终 settle 才一次性应用尺寸、恢复 viewport、通知 PTY 并提交 full-render；最终选项合并整个 burst，避免早期强制渲染标志丢失；window resize 改为直接进入同一个 pane scheduler，移除独立 settle timer。
- Guard：scheduler 测试固定最终提交合并早期选项；`TestRuntimeTerminalCanvasResidueGuard` 固定逻辑像素快照、非 settled 路径和 hold 几何；`TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs` 固定不存在第二个 `activeTabResizeTimer`。
- 验证结果：Node terminal cache-v2 与 resize scheduler 测试 14/14 通过；完整 `go test ./...`、`go test -race ./...`、JS `node --check` 和 `git diff --check` 通过。真实 Electron 连续拖拽和 tab 切换压力截图仍需在目标 LightOS 环境复验。
- 禁止复现：不得在 resize burst 的非 settled 回调执行 `term.resize()`、full-render 或 PTY resize；不得用 `contain` 拉伸 hold 位图；不得恢复独立 window settle timer；最终可见帧只能由 scheduler 的 settled 提交释放旧帧。

### LCMD-20260807-03：移动端键盘输入被 resize presentation hold 长时间阻塞

- 日期：2026-08-07
- 来源：LCMD-20260807-02 修复后的用户复验；PC 输入正常，多台移动设备出现输入无响应、延迟数分钟或不显示
- 影响模块：移动端 visual viewport/IME resize、输入 pending/queue、pane `renderReady` 与 resize presentation hold
- 错误现象：移动端键盘弹出或收起后，输入事件有时已经进入本地 pending 队列，但迟迟没有通过 WebSocket 发送；即使连接正常，也可能因为 `renderReady=false` 无法 flush。PC 不触发移动键盘 viewport 链路，因此不受影响。
- 根因：`isSessionInputReady` 同时要求网络连接已 ready 和终端画面 `renderReady=true`。移动键盘调整 viewport 时 window resize 会先把 pane 置为 presentation hold；此前 hold 在键盘抑制期间可能无法进入 settled resize，键盘收起后的直接 resize 又被非 settled 门禁拒绝，导致 `renderReady` 长时间保持 false。输入传输状态与画面展示状态被错误绑定。
- 实施方案：输入 readiness 只依赖 replay 已完成、preview 未显示和 WebSocket OPEN，不再依赖 `renderReady`；移动 IME viewport 抑制期间不创建 terminal resize hold；移动设备恢复尺寸统一通过 scheduler 的 immediate settled 路径提交，确保旧 hold 能释放。键盘 viewport 的滚动/平移继续由专用 inset/pan 逻辑处理。
- Guard：容器契约测试固定 input readiness 不包含 `session.renderReady`；`TestRuntimeTerminalCanvasResidueGuard` 固定 IME 抑制期间跳过 resize hold；`TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs` 固定移动设备恢复调用 scheduler immediate。
- 验证结果：Node 14/14、完整 `go test ./...`、`go test -race ./...`、JS `node --check` 和 `git diff --check` 通过；真实移动设备输入和键盘收放压力仍需在目标 LightOS 环境复验。
- 禁止复现：不得用 Canvas 展示状态阻塞已连接终端的用户输入；IME viewport 变化期间不得创建或永久保留 terminal resize hold；移动端尺寸恢复必须经过 settled 提交释放 hold。

### LCMD-20260810-01：Ghostty-Web 终端忽略 Kitty Graphics 原始图片序列

- 日期：2026-08-10
- 来源：用户要求在当前 Ghostty-Web WebShell 终端中直接渲染项目根目录 `image.png`，而不是字符画或外部图片查看器
- 发布：LPK version `1.0.21`（`1.0.18` 初版未正确隔离 Kitty generated input，`1.0.19` 仍依赖浏览器经 WebSocket 回传探测回复，`1.0.20` 未同步 ANSI 整屏清除到图片图层；版本化静态资源 immutable，因此每次现场协议修正均提升版本）
- 影响模块：WebShell `runtime/static/kitty_graphics.js`、`main.js`、resize 消息与 Go PTY/Agent 尺寸链路，以及 Service Worker 静态资源预缓存；Ghostty Web/WASM 仅作为能力边界背景
- 错误现象：PTY 输出中的 Kitty Graphics APC（`ESC _ G ... ESC \`）被 Ghostty-Web WASM 构建忽略，`kitty icat` 无法在终端 Canvas 中显示原始 PNG；使用 `xdg-open` 只能启动外部程序，不能满足终端内渲染要求。初版接入后，Kitty 探测回复若未标记为内部 generated input，还会被 shell 回显为 `Gi=1;OK`。图片显示成功后，shell 的 `Ctrl+L`/`clear` 只让 Ghostty 清除字符网格，独立绘制的 Kitty 图片仍残留在 Canvas 上。
- 根因：原生 Ghostty 虽支持 Kitty Graphics，但当前 ghostty-web WASM 构建把 `oniguruma` 设为 false，连带禁用 Kitty Graphics；其 Canvas 层也没有图片放置绘制接口。WebShell 还维护了包含历史回放和 resize/write 队列修复的定制 Ghostty bundle，直接替换 bundle 会覆盖这些定制。另一个独立问题是 Kitty 0.48.2 的 `icat` 直接读取 Linux PTY `TIOCGWINSZ.ws_xpixel/ws_ypixel`，而原链路只设置了行列，像素字段为 0。图片适配器最初只挂接 JavaScript `Terminal.clear()`/`reset()`，但 shell 的 `Ctrl+L` 是由 PTY 输出 `CSI 2 J` 等 ANSI 序列驱动，不会调用这些方法。
- 实施方案：不修改 Ghostty WASM 和 `ghostty-web` 源码仓库，在 WebShell 运行时新增独立 `kitty_graphics.js` 适配器，以 Terminal 原型包装方式接入现有定制 bundle，按顺序把普通文本交给 WASM、把图片 APC 交给图片管理器，并通过异步 `createImageBitmap` 解码后在同一 Canvas 上按终端光标单元格绘制。支持 `a=T`/`a=t`/`a=p`/`a=d`、`f=100` PNG、Kitty 0.48 `icat` 实际输出的 `f=24`/`f=32` 原始像素与 `o=z` 压缩、`m=1/0` 分块、图片/placement 生命周期和单元格尺寸。Go PTY 输出过滤器直接消费 `a=q` 探测 APC，在同一 PTY 内同步回复：只声明浏览器可读取的直接传输，不误报服务器临时文件或共享内存；回复不再经过浏览器 `Terminal.input`、WebSocket 输入队列或 shell。浏览器将 Canvas CSS 像素尺寸随 resize/input 发送，Go PTY/持久 Agent 写入 `Winsize.X/Y`，使 Kitty 能获取窗口像素大小；同时兼容拦截 `CSI 14 t` 并回复 `CSI 4;height;width t`。图片适配器持续观察交给终端的普通输出，跨分块识别 `CSI 2 J`、`CSI 3 J` 和 RIS 全复位并清除图片 placement，局部 `CSI J` 不误删图片。Service Worker 将新模块加入 app-shell 预缓存。
- Guard：`kitty_graphics_test.mjs` 覆盖 APC 不泄漏到 WASM、图片查询响应与传输方式筛选、完整及跨输出分块的终端像素尺寸查询、真实 PNG base64 分块、Kitty `icat` zlib RGB 分块、光标坐标和 `drawImage` 尺寸，以及跨输出分块的整屏擦除和局部擦除保留；`TestKittyGraphicsBehavior` 接入 Go 测试；`TestTerminalPaneTracksKittyGraphicsQueryResponses` 固定 Go 后端消费完整/分块 Kitty 查询、直接传输返回 `OK`、临时文件返回 `EINVAL`，并禁止任何探测 APC 或回复进入浏览器/shell；`TestTerminalPaneResizeAppliesPixelSizeToPTY` 固定 `Winsize.X/Y`；`TestTerminalSizeSyncBehavior` 固定像素尺寸变化不能被行列去重；`TestRuntimeTerminalCanvasResidueGuard` 固定运行时模块、安装入口和 Kitty Graphics 关键能力字符串；Service Worker guard 固定新模块进入预缓存。
- 验证结果：运行时 `node --test kitty_graphics_test.mjs` 7/7 通过；相关 Go guard、完整 `go test ./...`、`node --check` 和 `git diff --check` 通过；实测 Kitty 0.48.2 的 stream 输出为 `f=24,o=z`，已用真实项目根目录 PNG 做解码回放，确认图片放置为光标 `(2,3)`、`20x10` 单元格；`ghostty-web` 仓库保持零改动。当前仍需在目标 WebShell 页面重启后刷新静态资源，执行真实 `kitty +kitten icat ./image.png` 后按 `Ctrl+L` 做最终复验。
- 禁止复现：不得用字符画代替 Kitty Graphics；不得直接覆盖 WebShell 定制 `ghostty-web.js` bundle；不得绕过 PNG 分块状态机把 APC 发送给 WASM；图片存在时不得仅做局部 Canvas 重绘导致透明 PNG 重复合成或残留；新增静态模块必须同步 Service Worker 预缓存和版本化资源发布。

### LCMD-20260810-02：Kitty Graphics 图片未跟随终端回滚视口

- 日期：2026-08-10
- 来源：用户现场复验：图片显示后拖动终端滚动条，图片位置固定，未与字符内容同步移动
- 影响模块：`runtime/static/kitty_graphics.js` 图片 placement 绘制与 Ghostty-Web renderer viewport
- 根因：placement 只保存活动屏幕 `cellY`，绘制时没有使用终端 scrollback 长度和 `viewportY` 换算；滚动渲染也只在底部视口绘制图片。
- 实施方案：记录 placement 的绝对缓冲行号；每次 renderer 绘制按 `absoluteRow - scrollbackLength + viewportY` 计算屏幕行，并在任意 viewport 强制完整重绘后绘制图片。
- Guard：`kitty_graphics_test.mjs` 新增 scroll viewport 测试，验证回滚 2 行后图片从第 3 行移动到第 5 行；原有整屏清除、局部清除、PNG 和 Kitty `icat` 压缩流测试继续通过。
- 验证结果：Node Kitty 测试 8/8 通过，JavaScript 语法检查和 `git diff --check` 通过；待安装 `1.0.22` 后在目标 WebShell 实机滚动复验。

### LCMD-20260810-03：Kitty 图片未占用字符网格导致后续提示符被遮挡

- 日期：2026-08-10
- 来源：用户安装 `1.0.22` 后复验：图片已随滚动条移动，但回车后的下一行出现在图片下层
- 影响模块：`runtime/static/kitty_graphics.js` Kitty placement 光标移动语义
- 根因：Kitty 0.48.2 `icat` 在图片 APC 后只输出一个尾随 CRLF，依赖 Graphics Protocol 默认 `C=0` 先把终端光标移动到图片网格之后；运行时适配器此前忽略 `C`，Canvas 图片没有在字符网格中占用对应行。
- 实施方案：对齐 Ghostty 原生 Kitty Graphics 行为。`C=0` 时根据 `r`，或根据 `s/v`、PNG IHDR 与终端单元格尺寸计算图片网格行列，按图片行数注入 IND 以正确处理屏幕底部和 scrollback，再定位到图片右侧；`C=1` 和虚拟 placement 不移动光标。移动序列在 APC 与后续普通文本之间同步交给 VT parser，避免异步图片解码打乱顺序。
- Guard：新增默认光标移动和 `C=1` 测试，固定图片 APC 后的 VT 字节顺序；Kitty Graphics Node 测试共 10/10 通过。
- 验证结果：抓取 Kitty 0.48.2 `icat --transfer-mode=stream` 的真实 PTY 输出，确认传输为 `a=T,f=24,o=z,s=800,v=551` 且 APC 后仅有 CRLF；完整 Go 测试、竞态测试、JavaScript 语法检查和 `git diff --check` 通过。待安装 `1.0.23` 后实机复验提示符位置。

### LCMD-20260810-04：Kitty 图片左侧出现额外空白

- 日期：2026-08-10
- 来源：用户安装 `1.0.23` 后现场复验：图片可随终端滚动且后续文字位于图片下方，但图片左侧仍出现额外空白，未贴合终端左边缘
- 影响模块：`runtime/static/kitty_graphics.js` Kitty placement 坐标和源图裁剪绘制
- 根因：Kitty Graphics 协议的大写 `X/Y` 表示当前字符格内的像素偏移，小写 `x/y/w/h` 表示源图裁剪矩形；运行时适配器错误地把 `X/Y` 加到字符列/行，把 `x/y` 当作目标像素偏移并把 `w/h` 当作目标尺寸。`icat` 为单元格对齐发送 `X=2` 时，2 像素会被放大成 2 个字符格，形成明显的左侧空白。
- 实施方案：placement 固定以 Ghostty 当前光标字符格为原点，大写 `X/Y` 仅作为 Canvas 目标像素偏移；小写 `x/y/w/h` 按协议裁剪源图，`c/r` 单独决定目标字符格尺寸，只指定一个维度时按源图比例推导另一个维度。保留 `icat` 在 APC 前发送 `CR` 后从第 0 列放置全宽图片的顺序语义。
- Guard：`kitty_graphics_test.mjs` 将 `X=3,Y=4` 固定为 3/4 像素目标偏移，新增小写源图裁剪九参数 `drawImage` 测试，并模拟真实 `icat` 的 `CR + APC` 顺序，要求全宽图片最终绘制坐标严格为 `x=0`；Kitty Graphics Node 测试共 12/12 通过。
- 验证结果：`node --test kitty_graphics_test.mjs` 12/12、相关 JavaScript 语法检查、完整 `go test ./...`、`go test -race ./...` 和 `git diff --check` 通过。`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.24.lpk`，包内 `.lpk-version` 与 `package.yml` 均为 `1.0.24`，包含修正后的 Kitty placement 坐标和源图裁剪代码且不包含 Node 测试文件；LPK SHA-256 为 `3f9448dee59caa0090100c3da399c66f13d1b357dba454e75a9f21393bdac4aa`。

### LCMD-20260810-05：同版本 WebShell 更新继续命中旧 WASM

- 日期：2026-08-10
- 来源：用户怀疑 WebShell 更新后前端通常不会更新 `ghostty-vt.wasm`，对构建、LPK 内容、静态响应与 Service Worker 缓存链进行核查
- 影响模块：LPK 静态资源版本、Service Worker app-shell cache、Ghostty WASM 构建与 WebShell runtime 同步
- 错误现象：独立 WebShell LPK 如果在内容变化后复用相同 `package.yml` 版本，页面刷新和部署重启提示仍请求相同 `/assets/<version>/ghostty-vt.wasm`。该响应被声明为一年 immutable，Service Worker 又对当前版本资源 cache-first，因此浏览器会持续返回旧 WASM。另一个独立风险是 WebShell 发布脚本只复制现有 `runtime/`，不会构建或校验 `ghostty-web/ghostty-vt.wasm`，源码 WASM 与随包 WASM 可能依赖人工同步。
- 根因：静态资源身份只包含声明版本，没有包含实际内容摘要；同 URL 与 immutable/cache-first 合同要求内容永不变化，但构建脚本没有强制版本唯一性。Ghostty Web 和 WebShell 是两个独立源码目录，根构建入口此前没有任何跨目录哈希 guard。
- 实施方案：LPK 构建在二进制和 runtime 复制完成后生成 `.lpk-content-revision`，Provider 将资源版本统一组成 `<lpk-version>-<24位内容摘要>`；声明版本或内容摘要任一变化都会使旧 URL 立即 404，并生成新的 Service Worker cache。缺少构建元数据的 Admin 内嵌和开发环境继续使用现有内容哈希回退。WebShell 仓库新增 `tools/sync-ghostty-web-assets.sh` 并由 `lzc-build.yml` 直接执行 `--check`：相邻 Ghostty 源码可用时比较源 WASM 与随包 WASM，独立检出时至少验证随包 WASM 文件头；`--sync` 只构建 JavaScript 并同步现有 WASM/许可证，`--rebuild-wasm` 仅用于 Ghostty 子模块、patch 或 ABI 变化。LPK version 提升到 `1.0.25`。
- Guard：`TestComputeAssetVersionUsesLPKVersionAndContentRevision` 固定声明版本与内容摘要组合；`TestVersionedStaticFileServerTracksSameVersionContentWithoutRestart` 固定同版本摘要变化后旧 URL 404、新 URL 200；`TestBuildWritesPackageVersionForRuntimeAssets` 固定 LPK 执行仓库内 WASM 校验并同时生成版本与内容摘要元数据。
- 验证结果：定向及完整 `go test ./...`、`go test -race ./...`、Kitty Graphics Node 测试 12/12、相关 JavaScript 语法检查、shell 语法检查和 `git diff --check` 通过；`tools/sync-ghostty-web-assets.sh --check` 确认两份 WASM SHA-256 均为 `65a99188312ad92780b3af2fa410b8af395536dfe1e777ec24573d8be1436f16`，并验证 Ghostty 源码目录缺失时仍能检查随包 WASM 文件头。`lzc-cli project release` 生成 `dist/cloud.lazycat.webshell.lcmd-v1.0.25.lpk`，LPK SHA-256 为 `ec71e36d8151d667802e71735021410ae5f6448cabfaba00128e8dc2b3cd9dcb`；包内 `.lpk-version` 为 `1.0.25`，`.lpk-content-revision` 为 `ee3bd1377d40d1890b8a9167f340712ef8a55b50f9d041cca32ab4b8046980b8`。运行包内 Provider 后，首页和 Service Worker 均注入 `1.0.25-ee3bd1377d40d1890b8a9167`，对应 WASM 返回 `application/wasm` 与 `public, max-age=31536000, immutable`。
- 禁止复现：不得让 immutable 资源 URL 只依赖可复用的人工版本号；不得把同 URL 指向不同 JS/WASM 内容；不得让 LPK 构建跳过仓库内 Ghostty WASM 校验；纯 TypeScript 修改不得无条件触发昂贵的 WASM 重建。

### LCMD-20260812-01：高频终端输出导致主线程高 CPU 和超大批次内存风险

- 日期：2026-08-12
- 来源：Codex/Agent WebShell 高频实时输出 CPU 现场问题
- 影响模块：`runtime/static/main.js`、`runtime/static/ghostty-web.js`、`runtime/static/kitty_graphics.js`、运行时静态 guard
- 错误现象：终端持续输出时 CPU 从个位数升至 50%～70%；异常大输出可能形成超大前端队列、一次性 WASM 分配和主线程长任务。
- 根因：每个输出批次都请求整屏 Canvas 渲染；`force flush` 可以无上限合并队列；Ghostty WASM 写入入口没有单次输入边界和分配失败检查；Kitty 适配器为每个二进制块创建完整字符串并扫描控制序列。
- 实施方案：WASM 写入按 128 KiB/32 KiB 字符块处理并检查分配失败；所有 flush 批次保持 128 KiB 上限；输出消息和队列设置 4 MiB 硬边界，过载通过历史游标重同步恢复；普通输出改为 33ms 合并渲染请求，结构性事件继续 full render；普通输出交由 Ghostty dirty 状态决定脏行/整屏；Kitty 使用复用 `TextDecoder` 的 128 KiB 流式解码。
- Guard：`TestRuntimeTerminalOutputBatchingGuard` 固定输出软/硬限制、force flush 分片和过载重同步；`TestRuntimeTerminalCanvasResidueGuard` 固定 WASM 分片、分配失败保护、渲染限频和 dirty/full 渲染边界；`kitty_graphics_test.mjs` 继续覆盖跨 chunk 控制序列与图片行为。
- 验证结果：核心改造阶段的 `go test ./...`、`go test -race ./...`、Kitty Graphics Node 测试、相关运行时 JS `node --check` 和 `git diff --check` 已通过。本轮控制边界、指标、零拷贝与 Canvas 热路径收尾尚待统一回归；真实浏览器 CPU、内存峰值和长任务时长仍需在目标 WebShell 页面使用纯文本、ANSI/TUI 和 Kitty 输出分别录制 Performance profile。
- 禁止复现：不得恢复无上限 `force flush` 合并；不得绕过统一 WASM 分片入口；输出过载不得静默丢弃且必须能够通过历史游标恢复；普通高频输出不得重新强制每批 full Canvas render；Kitty 不得每 chunk 新建完整解码器或把大块二进制一次性转成字符串。
- 后续收尾：Kitty 控制扫描只保留未完成的 `ESC`/`CSI` 尾巴，普通文本在控制序列后恢复快速路径，并复用流式 `TextDecoder` 保证跨二进制分片 UTF-8 不损坏；输出队列在入队前执行 4 MiB 硬阈值，性能指标增加峰值语义且所有指标访问带兼容 guard；历史缓存队列复用已有不可变 `Uint8Array` 视图，持久化边界仍由 Cache API/IndexedDB 完成复制；大文本字节数测量改为固定缓冲分片编码，避免为整条字符串分配等长临时字节数组；Canvas 空格快速路径保留悬停超链接装饰例外。

### LCMD-20260813-01：调试模式增加移动端远程桌面入口开关

- 日期：2026-08-13
- 来源：用户需求
- 影响模块：`runtime/static/index.html`、`runtime/static/main.js`、LightOS 首页返回链路
- 错误现象：移动端远程桌面入口默认隐藏，缺少调试模式下可控的恢复入口。
- 根因：WebShell 只有调试模式总开关，没有独立保存并传递移动端远程桌面授权的设置。
- 实施方案：在调试选项中增加默认关闭的“允许移动端启用远程桌面”开关；设置值保存在本地，返回 LightOS 首页时通过一次性查询参数同步，首页消费后立即清理参数。
- Guard：`TestRuntimeDebugModeOnlyTogglesOptionsList` 固定开关位于调试选项、默认读取关闭并持久化；`TestRuntimeHomeNavigationUsesResolvedAdminURL` 固定返回首页携带开关值。
- 验证结果：运行时包版本提升至 `1.0.27`；`node --check runtime/static/main.js`、`go test ./... -run 'TestRuntime(DebugModeOnlyTogglesOptionsList|HomeNavigationUsesResolvedAdminURL)' -count=1` 和完整 `go test ./... -count=1` 通过；LightOS 首页定向测试另行通过。
- 禁止复现：不得默认开启移动端远程桌面；不得把开关状态混入性能监视器或调试模式总开关；不得长期把设置值暴露在首页 URL 中。

### LCMD-20260813-02：opencode 与 herdr fullscreen TUI 在移动端无法滚动

- 日期：2026-08-13
- 来源：用户现场问题
- 影响模块：`runtime/static/main.js`、fullscreen TUI 触摸适配、移动端终端 mouse tracking
- 错误现象：opencode、herdr 等 fullscreen TUI 在手机上上下滑动时，列表不滚动，历史对话无法查看；单指手势被通用终端 mouse tracking 当成按下/拖动。
- 根因：现有 Claude fullscreen 触摸适配只识别 Claude，其他开启终端鼠标跟踪的 TUI 继续进入通用 touch mouse 路径，发送 press/move/release 而不是把位移转换为终端 wheel 事件。
- 实施方案：保留 Claude 现有专用适配和 Grok 既有行为；新增独立的 `opencode_fullscreen_touch.*` 与 `herdr_fullscreen_touch.*` 模块，分别负责各自命令/标题识别和安装入口。二者只共享不含工具身份判断的底层触摸手势机械模块：单指移动超过阈值后按终端行高累积并发送 wheel，tap 发送 click，长按复用 WebShell 本地选择；适配器按“默认选择 -> Claude -> opencode -> herdr -> 通用 mouse tracking”顺序安装，未匹配会话保持原路径。
- Guard：`TestOpencodeAndHerdrFullscreenTouchAdapters` 覆盖两种工具的命令、路径、Node launcher、标题识别、互斥匹配和 wheel 手势；`TestRuntimeOpencodeHerdrFullscreenTouchAdapterIsolation` 固定独立模块、安装顺序，并禁止 Claude 和通用 mouse tracking 出现 opencode/herdr 分支。
- 验证结果：定向 Go/Node 行为测试、完整 `go test ./... -count=1`、`node --check`（新增模块、`main.js`、Service Worker）和 `git diff --check` 均通过；真实 iOS Safari、Lazycat WKWebView 与 Android WebView 仍需按设备矩阵复验 opencode/herdr 的滑动、点击、长按选择、双击键盘以及 Claude/Grok 回归。
- 禁止复现：不得把 opencode/herdr 身份判断并入 Claude、Grok 或通用 mouse tracking；不得在通用路径中增加针对工具名称的分支；不得在未确认工具身份和 mouse tracking 的情况下抢占所有 TUI 触摸事件；工具行为变化时只修改对应工具适配层。

### LCMD-20260814-01：中文预编辑文本增长导致终端逐级上移

- 日期：2026-08-14
- 来源：用户现场问题；中文输入法处于未确认 composition 状态时，每增加若干中文字符页面底部留白继续增大，终端内容被逐级向上推
- 影响模块：`runtime/static/main.js` 终端 helper textarea、IME composition 预览、移动端 `visualViewport` 键盘避让与终端 viewport pan
- 错误现象：英文输入或短中文预编辑时终端位置稳定；中文预编辑文本持续增长后，输入区域看似不断增高，页面底部出现越来越大的空白。实际 textarea CSS 高度没有主动增加，未确认文本也尚未发送到 PTY。
- 根因：Ghostty helper textarea 被定位在终端光标处并限制为一个字符格宽，但浏览器仍需在该原生可编辑控件内维护完整 IME 预编辑值和组合光标。部分移动 WebView/IME 会随狭窄控件中的预编辑内容增长调整内部组合光标、候选窗锚点或 `visualViewport`；WebShell 又把这些 composition 期间的瞬时 viewport 高度/inset 变化当成键盘几何变化，更新底部 dock 并重新计算 `terminalViewportPanY`，从而把宿主波动逐级放大为终端上移和底部留白。现有 host viewport guard 只清理 `terminal-host` 的滚动和多余节点，没有固定 textarea 自身的单行几何，也没有为 composition 建立稳定 viewport 基线。
- 实施方案：helper textarea 显式设置 `rows=1`、`wrap=off`、固定且相同的 height/min-height/max-height、禁止纵向 overflow/wrap，并使用从当前光标到终端右边界的稳定宽度，不再保持单字符格宽；预编辑预览继续由独立绝对定位元素绘制并限制在剩余终端宽度。composition 开始前先同步一次真实键盘 viewport，然后锁定当前 viewport height、reference height、键盘 inset、安全偏移和终端 pan；composition update 期间忽略后续 IME 瞬时 viewport 波动，composition end、blur、session 清理或方向变化时释放锁并重新同步真实 viewport。保留原生 composition 默认行为和现有重复上屏去重，不通过清空 textarea 或 `preventDefault()` 修复。
- Guard：扩展 `TestRuntimeMobileIMECompositionPreviewVisible`，固定单行 textarea 属性、稳定宽高、预览边界、composition viewport 锁的捕获/应用/释放路径，并禁止恢复成单字符格宽；原有 guard 继续禁止 composition 分支清空 textarea、镜像写入 `event.data` 或阻止默认事件。
- 验证结果：IME/resize 定向 Go 测试、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、`node --check runtime/static/main.js`、Service Worker JavaScript 语法检查和 `git diff --check` 通过。真实 iOS Safari、Lazycat WKWebView、Android WebView 与 Windows WebView 仍需复验连续中文预编辑、候选词切换、删除、语音输入、确认上屏、键盘收起和屏幕旋转。
- 禁止复现：终端 helper textarea 不得恢复为单字符格宽的多字符原生预编辑载体；composition 文本长度不得改变 textarea 块方向尺寸；composition 期间不得把 IME 候选窗引起的 viewport 波动继续累加到 terminal pan 或移动底部 dock；不得以阻止原生 composition 默认行为换取几何稳定。

### LCMD-20260814-02：终端行尾继续中文输入仍触发一次上移

- 日期：2026-08-14
- 来源：LCMD-20260814-01 修复后的用户复验；普通位置已稳定，但单行最后一个中文字符后继续输入仍会向上移动
- 影响模块：`runtime/static/main.js` helper textarea 锚点、中文 composition 生命周期和移动端 viewport 锁
- 错误现象：上一版把 textarea 宽度改为“终端光标到行尾的剩余宽度”，所以问题不再每个字符触发，而是在光标到达行尾、textarea 再次退化为一个字符格宽时触发。每个候选确认后的 `compositionend` 还会释放锁，下一次 `compositionstart` 把已经发生的上移重新保存为新基线。
- 根因：原生 IME 输入载体仍随终端光标列/行移动，且其几何边界在行尾变窄；composition 预览虽然独立绘制，但浏览器仍会为原生 textarea 的组合光标和候选窗执行避让。viewport 锁按单次 composition 生命周期工作，无法覆盖连续中文候选之间的焦点会话。
- 实施方案：textarea 在焦点会话内固定在首次输入位置，使用终端整行宽度和固定高度，并通过 text indent 保留初始候选锚点；终端光标位置只更新独立 `.terminal-composition-preview`。viewport 锁改为焦点会话级，compositionend 不释放，只有 textarea 失焦、键盘检测到真实收起、方向变化或 session 清理才释放；键盘重新收起时仍允许真实 viewport 恢复。
- Guard：扩展 `TestRuntimeMobileIMECompositionPreviewVisible`，禁止恢复按光标剩余宽度计算的 textarea、固定焦点锚点和整行宽度，并固定 compositionend 不释放 viewport 锁、blur/keyboard close/方向变化释放锁。
- 验证结果：本轮定向 Go IME/resize 测试、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、`node --check runtime/static/main.js`、Service Worker JavaScript 语法检查和 `git diff --check` 均通过。真实 iOS Safari、Lazycat WKWebView、Android WebView 与 Windows WebView 仍需复验连续中文、行尾换行、候选切换、删除、语音输入、键盘收起和旋转。
- 禁止复现：textarea 不得再次跟随终端光标列缩小或跟随光标行移动；不得在每个 `compositionend` 释放并重建 viewport 基线；不得让候选预览承担原生 IME 输入载体职责；不得通过阻止 composition 默认事件修复几何问题。

### LCMD-20260814-03：Android 首次进入首帧预览覆盖输入框导致双击不弹键盘

- 日期：2026-08-14
- 来源：用户现场问题；首帧缓存优化后的 Android WebView 首次进入终端页面
- 影响模块：`runtime/static/main.js`、`runtime/static/style.css`、Ghostty helper textarea 与缓存首帧预览层
- 错误现象：Android 首次进入 WebShell 终端时，双击事件和顶部提示均有反应，但软键盘不展开；新建 tab 或等待并返回原 tab 后恢复。问题集中在缓存首帧仍显示、真实 canvas 尚未 ready 的时间窗口。
- 根因：Ghostty 先将 canvas 和 helper textarea 添加到 `terminal-host`，WebShell 再追加缓存预览图。预览图与 textarea 原先同为 `z-index: 1`，后置预览因此覆盖原生编辑控件。`pointer-events:none` 允许双击穿透并触发同步 `focus()`，但部分 Android WebView 不会为被覆盖的 textarea 拉起输入法。首帧优化提前显示预览，扩大了该窗口。
- 实施方案：helper textarea 固定为绝对定位并提升到 `z-index: 3`，高于缓存预览/frame-hold (`z-index: 1`) 和 composition 预览 (`z-index: 2`)；保留预览层不可交互属性与双击 capture 同步 focus 路径。
- Guard：新增 `TestRuntimeAndroidKeyboardFocusStaysAboveCachedFrame`，固定 textarea 层级、预览层层级及 Ghostty canvas/textarea 结构；原有 `TestRuntimeTouchKeyboardRequiresDoubleTapOnWideTouchScreens`、`TestRuntimeTouchKeyboardFocusPrecedesTouchConsumers` 继续覆盖手势授权和同步 focus。
- 验证结果：定向触摸键盘 Go 测试、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、`node --check`（`main.js`、`ghostty-web.js`、Service Worker、Cache API runtime）和 `git diff --check` 通过；`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.27.lpk`。真实 Android WebView 首次进入缓存命中场景仍需实机复验。
- 禁止复现：缓存首帧、frame-hold 或 composition 预览不得覆盖 helper textarea；不得通过移除同步 focus 或放开预览 pointer events 来修复键盘；输入控件层级调整不能破坏终端触摸事件穿透。

### LCMD-20260814-04：键盘态首次自动换行后最新终端行被底部栏遮挡

- 日期：2026-08-14
- 来源：中文 IME 几何稳定修复后的用户现场复验；首次输入超过键盘态可见终端底线时出现
- 发布：LPK version `1.0.28`
- 影响模块：`runtime/static/main.js` 移动端 terminal viewport pan、Ghostty `onRender` 与 PTY 输出回显
- 错误现象：键盘首次展开后，输入内容在底部发生自动换行时，终端最新一行继续落到移动快捷栏下方；收起键盘、手动滚到底部并重新展开后，后续换行和输出又能持续显示在底部栏上方。
- 根因：Ghostty 的逻辑 viewport 始终保持在底部，问题不在 `viewportY` 或 scrollback。键盘态通过 `terminalViewportPanY` 对 Canvas、textarea 和 composition preview 应用额外 `translateY`，但该平移只在 visual viewport、pane resize 和输入锁同步时计算。PTY 回显、自动换行或整屏滚动更新光标后，成功 render 没有重新计算平移，因此首次键盘会话继续使用键盘刚展开时的旧光标基线；手动滚动和重新展开键盘会触发几何同步，所以看似恢复。
- 实施方案：在 Ghostty 成功 `onRender` 回调完成 pane presentation generation 提交后同步 `syncTerminalViewportPan(session)`，让 PTY 回显、换行、滚屏和渲染重试都以已经提交的最新光标重新计算键盘避让。保持现有用户输入时回到底部的语义，不对普通后台输出全局强制 `scrollToBottom()`，避免破坏用户主动查看历史。
- Guard：新增 `TestRuntimeMobileKeyboardPanTracksRenderedTerminal`，固定成功 render 必须在 presentation 提交后同步键盘平移；`TestRuntimeTerminalCanvasResidueGuard` 同时固定该回调继续保留 pane 呈现代际提交。
- 验证结果：定向键盘、IME 与 Canvas guard、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、运行时 JavaScript `node --check` 和 `git diff --check` 均通过；`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.28.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.28`，LPK SHA-256 为 `a0441a3e70b49805ec04e4f485d78d344840e5373c866529138dec3cf4654790`。真实 Android WebView 仍需复验“键盘首次展开 -> 输入到自动换行 -> 连续输出”的底部可见性。
- 禁止复现：不得只在 viewport resize 时计算键盘平移；不得以每次输出强制滚到底部代替视觉避让同步；不得让平移更新早于 Ghostty 成功提交最新光标的 render。

### LCMD-20260814-05：Android helper textarea 获得焦点但首次双击仍不启动输入法

- 日期：2026-08-14
- 来源：LCMD-20260814-03 层级修复后的 Android 实机复验；顶部双击提示有状态反应但软键盘仍不展开
- 发布：LPK version `1.0.28`
- 影响模块：`runtime/static/main.js` 双击 capture、helper textarea focus transaction 与 Android Virtual Keyboard 激活
- 错误现象：Android 首次进入终端后双击事件能够被页面识别，textarea 甚至可能成为 `document.activeElement`，但 WebView 没有启动软键盘；新建 tab 造成输入控件焦点切换后，原 tab 也可能恢复。
- 根因：提高 textarea 层级只解决了首帧预览覆盖，仍不足以满足部分 Android WebView 的输入法激活条件。双击路径原先先取消 `touchend` 默认行为，再对长期保持 `pointer-events:none` 的透明 textarea 调用 `focus()`；当 WebView 只提交 DOM 焦点却没有启动 IME 时，后续对同一 active element 重复 `focus()` 也不会形成新的输入连接。
- 实施方案：为明确的移动键盘请求增加独立 focus transaction。Android 双击在同步用户手势内先临时开放 textarea pointer hit-test，必要时对已经 active 但未组成输入的控件执行真实 blur/focus 过渡，完成 focus 后调用可用的 `navigator.virtualKeyboard.show()`，最后恢复不可交互样式并取消 touch 默认行为。普通程序化 terminal focus 不进入该路径；移动快捷键只请求键盘、不强制 blur/refocus，避免已展开键盘闪动。缓存预览、frame-hold 和 composition preview 的既有层级保持不变。
- Guard：扩展 `TestRuntimeTouchKeyboardFocusPrecedesTouchConsumers`，固定键盘 focus 发生在 `touchend.preventDefault()` 之前且保持同步；扩展 `TestRuntimeAndroidKeyboardFocusStaysAboveCachedFrame`，固定 Android focus transaction、临时 pointer 激活、blur/focus 恢复和 Virtual Keyboard 可选调用。
- 验证结果：定向触摸键盘、IME 与缓存层级 guard、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、运行时 JavaScript `node --check` 和 `git diff --check` 均通过；`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.28.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.28`，LPK SHA-256 为 `a0441a3e70b49805ec04e4f485d78d344840e5373c866529138dec3cf4654790`。真实 Android WebView 仍需在首次进入、缓存命中和无缓存三个场景复验第一次双击，并回归单击、拖动、长按选择、Claude/Grok/opencode/herdr 触摸路径。
- 禁止复现：不得把异步 retry 作为首次键盘 focus 的主路径；不得在 `preventDefault()` 后才请求 Android 输入法；不得让普通 tab 激活或移动快捷键无条件执行 blur/refocus；不得恢复 textarea 被首帧层覆盖的层级。

### LCMD-20260814-06：首次交互被晚到初始化焦点和错误 IME pan 锁覆盖

- 日期：2026-08-14
- 来源：`LCMD-20260814-04`、`LCMD-20260814-05` 实机复验；两个问题首次进入仍存在，但切换 tab 并重新聚焦一到两次后同时恢复
- 发布：LPK version `1.0.29`
- 影响模块：`runtime/static/main.js` workspace/tab 初始化、WebSocket open、移动端 helper textarea focus、IME viewport 锁和 terminal viewport pan
- 错误现象：缓存首帧显示后立即双击，顶部提示能识别手势但 Android 键盘仍可能不展开；键盘成功展开后第一次输入到自动换行，最新一行仍可能落到底部快捷栏下方。切换 tab 或重复失焦/聚焦会释放旧状态，连接和尺寸初始化稳定后两个问题消失。
- 根因：首帧优化把视觉可见时间提前到 workspace、首次 fit、warm replay 和 WebSocket open 尚未全部结束的窗口，但初始化回调仍拥有输入焦点副作用。`setActivePane()` 的 rAF 和 WebSocket `open` 会晚到调用通用 `term.focus()`；在触摸布局中，调用落在 600ms 授权窗口内会在非用户手势中建立只有 DOM focus 的输入状态，落在窗口外又会主动执行 blur，均可覆盖刚完成的双击键盘事务。另一个独立状态错误是焦点会话级 `inputViewportLock` 同时保存了 `panY`，所以成功 render 后虽然重新同步，自动换行后的光标仍只能得到旧平移；锁若在 Android 键盘 viewport 收缩前建立，还会保存 `keyboardActive=false` 并忽略随后真实的键盘展开几何。
- 实施方案：给 terminal focus 增加明确来源，双击和移动快捷键保持同步 `user` 请求；workspace、tab 激活和 WebSocket open 统一经 `system` focus，触摸布局中的 system 路径只在 textarea 已经 active 时维护位置，不再 focus 或 blur，桌面焦点行为保持不变。IME 锁只保存 viewport height、reference height、inset、安全偏移和 keyboard active，不再保存光标驱动的 `panY`；render 后始终按锁定几何与最新 Ghostty 光标动态计算 pan。锁在键盘尚未展开时建立且随后检测到真实 viewport 收缩，会一次性升级为键盘态基线，再继续屏蔽候选窗抖动。
- Guard：新增 `TestRuntimeInitializationFocusCannotOverrideMobileKeyboard`，固定初始化/连接焦点使用 system 来源且不得进入移动端 blur；扩展 `TestRuntimeMobileKeyboardPanTracksRenderedTerminal`，禁止 viewport 锁保存 `panY` 并固定延迟键盘展开时的锁升级；更新 `TestRuntimeMobileIMECompositionPreviewVisible`，移除错误的固定 pan guard。既有双击同步 focus、Android 缓存层级、中文 composition、tab resize 和 fullscreen TUI 触摸 guard 继续回归。
- 验证结果：定向初始化焦点、Android 键盘、IME 与 terminal pan guard、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、运行时 JavaScript `node --check` 和 `git diff --check` 均通过；`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.29.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.29`，运行时包含 system/user focus 隔离、延迟键盘锁升级和 render 后动态 pan，且不再包含固定 `panY` 锁。LPK SHA-256 为 `1e504ad558edbdc08b919716eefaddabb5c541fcc35e282a610bb48ac54140ae`。真实 Android WebView 仍需复验首次进入缓存命中/无缓存、第一次双击、立即输入到自动换行及初始化期间连接完成的交错时序。
- 禁止复现：移动端初始化、连接、replay、resize 或 tab 激活任务不得取得用户键盘焦点所有权；无用户手势的 system focus 不得 blur 已有输入；IME viewport 锁不得包含随光标变化的 pan；键盘打开前捕获的非键盘基线不得屏蔽随后真实的键盘收缩事件。

### LCMD-20260814-07：首次进入时实例发现短暂 502 导致启动失败

- 日期：2026-08-14
- 来源：用户现场问题；WebShell 首次打开偶发显示 `Failed to load instances (502)`，强制刷新后恢复
- 发布：LPK version `1.0.30`
- 影响模块：Provider `/api/instances`、LightOS Admin 实例发现接口、前端 bootstrap 实例加载
- 错误现象：应用或 LightOS Admin 刚启动时，WebShell 首次请求实例列表可能收到 502，前端立即进入致命启动错误；稍后强制刷新会重新请求并恢复。该接口已使用 `cache: no-store`，Service Worker 也明确绕过 `/api/*`，因此现象不是浏览器缓存命中旧响应。
- 根因：Provider 获取可见实例依赖 `lightosctl system admin-info --json`、Admin `/api/webshell/instances` 和 `/api/client-instances` 三个启动依赖，任一步短暂未就绪都会失败；原实现还为两个 Admin 接口分别重复解析一次 admin-info，并把上游状态和失败阶段统一压成 502。前端 `loadInstances()` 只请求一次，失败后直接拒绝 bootstrap 的 `instancesPromise`，没有等待依赖完成的恢复窗口；强制刷新只是把同一请求推迟到 Admin 和路由已经 ready 的时刻。
- 实施方案：Provider 在一次 `/api/instances` 请求内只复用一次成功解析的 Admin 信息，分别标记 `admin-info`、`webshell-instances`、`client-instances` 以及 `resolve/transport/upstream/decode` 错误种类；admin-info、网络错误和上游 502/503/504 使用 100ms、300ms 的有限重试，上游 4xx 原样返回且不重试，并记录不含身份凭据的阶段、状态与重试次数。浏览器新增独立实例加载器，对网络错误和 502/503/504 使用 250ms、750ms、1500ms、3000ms 退避，所有并发调用共享同一个 Promise；读取 Provider 响应正文并在最终错误中保留真实阶段，页面销毁时取消等待和请求，只有重试耗尽才让 bootstrap 进入错误页。
- Guard：`TestHandleInstancesRetriesTransientDependenciesAndReusesAdminInfo` 固定同一请求共享 Admin 信息并恢复两个上游瞬时错误；`TestHandleInstancesRetriesAdminInfoStartupFailure`、`TestHandleInstancesRetriesTransportFailure` 固定启动与网络重试；`TestHandleInstancesPreservesAuthorizationFailureWithoutRetry` 固定 401/403 状态和零重试；`TestHandleInstancesReportsDecodeStageWithoutRetry` 固定无效 JSON 的阶段；`TestInstancesLoaderBehavior` 执行 `instances_loader_test.mjs`，覆盖 502/503/504、网络错误、4xx、单飞 Promise、最终正文和无效 JSON。静态资源 guard 同时固定主入口导入和 Service Worker 预缓存新加载器。
- 验证结果：实例加载 Node 行为测试 5/5、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、运行时 JavaScript `node --check` 和 `git diff --check` 通过；`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.30.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.30`，包含实例加载器和对应 Service Worker 预缓存声明且不包含 Node 测试文件。LPK SHA-256 为 `e4bf78109f60f345b89b362319d8abc85999a129edf5d99ec3ded5a7c02af789`。
- 禁止复现：不得让首次可恢复的 502 立即击穿 bootstrap；不得对 400/401/403/404 或 JSON 解码错误盲目重试；不得为同一次实例列表请求重复解析成功的 admin-info；不得吞掉客户端实例接口失败或回退到本地 `lightosctl ps`，否则会隐藏 PC 实例或绕过 LightOS Admin 的账号可见性边界；API 响应不得进入 Service Worker 缓存。

### LCMD-20260819-01：过期 Ghostty 本地构建物导致 WebShell 发布误判

- 日期：2026-08-19
- 来源：`./lightos-build.sh` 构建失败；随后按源码、Git 历史和实际 WASM 内容重新核对
- 影响模块：`tools/sync-ghostty-web-assets.sh`、LPK 发布构建与相邻 `ghostty-web` 开发仓库
- 错误现象：相邻 `ghostty-web/ghostty-vt.wasm` 与 WebShell 随包 WASM 的整文件摘要不同，旧校验直接判定未同步并阻塞发布。根目录文件随后确认是被 `.gitignore` 排除的本地构建产物，并不对应某个 Git 提交。
- 根因：旧校验没有从当前源码重建 WASM，只比较了两个现存构建物的摘要，因此把过期本地输出误当成源码差异。使用当前 `ghostty-web` 源码、patch、Ghostty 子模块和 Zig 0.15.2 重新构建后，生成的 423873 字节 WASM 与 WebShell 随包文件逐字节一致。WebShell 的 `ghostty-web.js` 另有移动端像素滚动、resize、渲染限频和 Canvas 热路径等历史定制，不能据此直接覆盖。
- 实施方案：新增 `tools/compare-wasm-content.mjs`，按 WebAssembly 二进制结构解析并逐字节比较所有非自定义核心 section，不使用整文件摘要推断源码版本。`--check-source` 先运行当前源码的 `build:wasm` 再比较，允许仅自定义构建元数据不同；`--check` 验证发布资产完整性，并在相邻源构建物存在时提供非阻塞的内容比较提示。普通 `--sync` 在源 WASM 核心内容不一致时拒绝覆盖，并且不再复制未重建的 WASM；`--rebuild-wasm` 才重建并同步完整资产。
- Guard：`TestGhosttyAssetCheckRebuildsAndComparesWasmCoreContent` 使用假的构建命令证明源码检查确实先重建，并覆盖“核心内容相同但自定义 section 不同”成功以及核心 section 不同失败两种情况；既有运行时 guard 继续固定 WebShell 定制 bundle 行为。
- 验证结果：使用当前源码、patch、Ghostty 子模块和 Zig 0.15.2 执行真实 `--check-source` 后，两份 423873 字节 WASM 完整内容一致。Ghostty Web 全量 Bun 测试 386/386、TypeScript、Biome 和 Prettier 通过；WebShell 定向 guard、完整 `go test ./... -count=1`、`go test -race ./... -count=1`、脚本语法、比较器语法和 `git diff --check` 通过。根目录 `./lightos-build.sh` 成功生成本地 WebShell LPK 与 `cloud.lazycat.lightos.entry-v0.3.56-501.lpk`，并通过内嵌 WebShell 内容校验。
- 禁止复现：不得使用未重建、被 Git 忽略的 `ghostty-vt.wasm` 判断源码版本；不得把整文件摘要差异直接等同于 WASM 核心代码差异；不得在普通同步路径用本地临时 WASM 覆盖 WebShell 随包文件；不得直接覆盖 WebShell 定制 `ghostty-web.js`。

### LCMD-20260819-02：历史回放首帧和尺寸变化暴露 PTY 重排过程

- 日期：2026-08-19
- 来源：用户现场复验；长历史终端首次进入、窗口/字体变化及跨设备使用场景
- 发布：LPK version `1.0.31`
- 影响模块：`runtime/static/main.js`、Cache API v2 warm replay、Ghostty Canvas presentation、跨设备终端尺寸同步
- 错误现象：长历史进入终端时能看到内容从旧字节逐步滚到底部；窗口大小或字体变化时会再次看到 PTY 状态重排；同一 tab 在手机和 PC 间切换后，服务端 PTY 尺寸可能停留在上一个设备的分辨率。
- 根因：按 `baseCursor` 顺序读到的第一批历史字节曾被误当成首帧，并在回放中暴露中间 render；尺寸或字体变化直接触发 Ghostty resize/full render，旧 Canvas 没有覆盖整个状态变更窗口；跨设备仅在输入、鼠标或窗口变化时才声明当前尺寸。
- 实施方案：Cache API v2 使用 1 MiB chunk、compaction 和 replay write budget；warm replay 期间只写 Ghostty/WASM，不渲染 live canvas，服务端 replay complete 后只做一次最终 full render。窗口、字号、字体、主题、方向变化和跨设备单击统一使用 presentation hold：先保留旧帧，再更新当前 Ghostty 状态和 PTY 输出，安静窗口后提交最终 full render；单击终端先按当前设备重新 fit，再强制发送当前 cols/rows/pixel size，不关闭 WebSocket、不重新回放历史。普通实时输出仍保持 128 KiB batching budget。
- Guard：`TestRuntimeTerminalCanvasResidueGuard` 固定 replay complete 和 presentation hold 门禁；`TestRuntimeTerminalSizeClaimSurvivesCrossClientResize` 固定单击 pointerdown、当前设备 fit 和强制 resize；`TestRuntimeMobileOrientationKeepsTerminalStateAfterViewportSettle` 固定方向变化不触发历史重放；`terminal_cache_v2_test.mjs` 固定 1 MiB Cache v2 默认 chunk。
- 验证结果：`node --check runtime/static/main.js`、`node --check runtime/static/terminal_cache_v2.js`、Cache v2 Node tests、定向 WebShell Go guard 和 `git diff --check` 通过。掉帧、TUI 动画和切 Tab 的视觉表现不在本条修复范围，需单独分析。
- 禁止复现：第一批缓存字节不得作为 live canvas 首帧；resize、字体、主题、方向和单击尺寸恢复不得调用历史重放或清空当前 Ghostty 状态；presentation hold 未完成前不得释放旧帧；跨设备点击必须先 fit 当前设备再发送尺寸声明。

### LCMD-20260819-03：presentation hold 阻塞持续 TUI 渲染且切 tab 短暂黑屏

- 日期：2026-08-19
- 发布：LPK version `1.0.32`
- 来源：`LCMD-20260819-02` 现场复验；Codex 等持续 TUI 输出时 working 渐变和计时周期性掉帧，计时可从 `30s` 跳到 `35s`；切换已有 tab 时先出现黑屏。
- 影响模块：`runtime/static/main.js` 的 Ghostty Canvas presentation、Tab 激活、跨设备尺寸声明和 Cache API v2 preview。
- 错误现象：单击终端、切换 tab 或请求 resize 后，即使尺寸没有变化，当前 canvas 仍进入 presentation hold。持续 PTY 输出会不断取消已排队的 render，并重新等待输出安静窗口，导致终端数秒只显示旧帧，随后一次跳到最新 TUI 状态。inactive tab 使用 `display:none`，激活时又无条件 `hideUntilRender`，旧 canvas 不能稳定作为可显示位图，因而短暂呈现黑色背景。持续输出下每次 Cache API append 还会在很短延迟后触发 Canvas PNG preview，放大主线程竞争。
- 根因：`schedulePaneResize()` 和跨设备单击在尚未测量当前 `cols/rows`/canvas 前无条件开始 hold；`deferPaneRenderDuringResize()` 对每批输出取消 Ghostty render 并重置最终提交时机。Tab 切换只在激活后处理画面，错过了隐藏前复制有效帧的时机。preview 截图没有要求输出静止或浏览器空闲。
- 实施方案：hold 只在 `resizePane()` 已确认终端尺寸或 canvas backing store 将变化后创建；hold 仅覆盖可见画面，Ghostty 在其下继续使用正常节流 render，尺寸更新后的 full render 立即提交，不再等待 PTY 安静窗口，也不在普通输出路径取消 render。跨设备单击仍强制发送当前尺寸，但尺寸未变时不冻结画面。切出 tab 前复制最后有效 frame；切回时保持该 frame 直至一次当前状态的 full render 成功，避免黑屏。Cache API 字节仍按 1 MiB/1 秒策略持久化；preview 改为连续 3 秒无终端输出后才在 `requestIdleCallback` 中编码，并在编码前后复查输出活跃性。
- Guard：扩展 `TestRuntimeTerminalCanvasResidueGuard`，固定 hold 发生在几何测量之后、无安静窗口、hold 中普通输出不取消 render、tab 在隐藏前保留 frame、preview 的空闲/静止门禁；扩展 `TestRuntimeTerminalSizeClaimSurvivesCrossClientResize`，固定无尺寸变化的 size claim 不直接进入 hold。`terminal_cache_v2_test.mjs` 和 `terminal_resize_scheduler_test.mjs` 继续覆盖 Cache v2 连续 cursor/1 MiB block 与 resize 合并行为。
- 验证结果：`node --check runtime/static/main.js`、`node --test terminal_cache_v2_test.mjs terminal_resize_scheduler_test.mjs`（15/15）、`go test ./...`、`git diff --check` 通过。当前环境没有真实浏览器性能录制能力，仍需在持续 Codex TUI 输出、跨 PC/手机尺寸、字体变化和多 tab 切换下复验帧连续性及主线程长任务。
- 禁止复现：不得让单击、tab 激活或仅排队 resize 在尚未确认几何变化时开始 presentation hold；不得在 hold 中对每批普通输出取消 Ghostty render 或依赖输出安静窗口；不得在 tab 已被 `display:none` 后才尝试获得唯一的旧帧；不得在持续输出期间高频编码 Cache API preview。

### LCMD-20260819-04：历史恢复仍按普通写入调度渲染并重复分配 WASM 缓冲区

- 日期：2026-08-19
- 发布：LPK version `1.0.33`
- 来源：长历史首次进入性能优化；用户确认“无渲染”必须表示完整解析后延迟 Canvas 提交，不能跳过正在输出的 Codex/Agent 状态
- 影响模块：`runtime/static/ghostty-web.js`、`runtime/static/main.js`、Cache API v2 读取流水线、历史恢复完成门禁
- 错误现象：历史 Canvas 虽已隐藏，但每批 replay 仍调用普通 `Terminal.write()` 并请求渲染，随后由 WebShell 取消 RAF；WASM 每个 128 KiB 子块还会重复分配和释放输入内存。Cache API 一次并发读取 32 块并等待整批完成才开始顺序消费，大历史会形成明显的首块等待、内存峰值和 GC 压力。固定 2 秒绝对超时还可能中断仍在持续前进的正常恢复。
- 根因：终端模型解析与 Canvas 展示调度没有独立入口，历史恢复只能复用普通实时写入后再撤销渲染；WASM 输入内存生命周期绑定单个子块；Cache 读取采用批次屏障而不是有界流水线；最终 replay ready 又等待本地 Cache commit，把非权威持久化延迟加入可见时间。
- 实施方案：Ghostty 增加 `writeReplay()`，仍完整经过 Kitty Graphics、VT/ANSI parser、光标/模式、标题、响铃和 generated response 处理，但在调用栈内抑制 render 调度；普通 `write()` 保持现有 128 KiB/33ms 实时节流。GhosttyTerminal 增加按需扩容、实例级复用的 WASM 输入缓冲区，释放终端时统一释放。Cache API 默认使用 8 块滚动预读窗口，按 cursor 消费一块即补读一块；2 秒限制改为无 cursor 进展超时。恢复期间服务端新增字节继续进入现有队列，历史与队列都通过 replay 写入追平，随后一次 full render 并切回普通实时输出。Cache commit 在追平后后台完成，失败只禁用本地缓存，不阻塞最终 Canvas；commit generation 序号隔离断线和下一轮恢复，迟到 Promise 不得清除新一轮状态。
- Guard：`terminal_cache_v2_test.mjs` 固定 8 块默认窗口、在首块回调尚未结束时继续补读后续块、cursor 顺序和最终边界；`TestRuntimeContainerCacheV2AndPWAContract` 固定滚动预读结构、无进度超时和后台 commit 不阻塞最终显示；`TestRuntimeTerminalCanvasResidueGuard` 固定 `writeReplay()` 渲染抑制、WASM 输入缓冲区复用和 replay/live 写入分流；既有输出 batching guard 继续固定普通实时输出的 128 KiB 预算与 33ms 渲染节流。
- 验证结果：`node --check` 通过 `main.js`、`terminal_cache_v2.js` 和 `ghostty-web.js`；Cache API v2、resize、Kitty Graphics、实例加载 Node 测试 35/35 通过；完整 `go test ./... -count=1`、`go test -race ./... -count=1`、Ghostty 资产校验和 `git diff --check` 通过。`lzc-cli project release` 已生成 `cloud.lazycat.webshell.lcmd-v1.0.33.lpk`，包内 `package.yml` 与 `.lpk-version` 均为 `1.0.33`，运行时包含 replay 专用写入、滚动预读、无进度超时和后台 commit generation guard；LPK SHA-256 为 `5facc2feb5969116dd2ec9cbcbfef8b1202b29e2d6ffe6f1b54daa6aaf6fe8e2`。真实浏览器仍需使用无缓存、warm cache、大历史且 Codex 持续输出三种场景记录恢复耗时和主线程长任务。
- 禁止复现：不得把 replay 写入理解为跳过终端解析或丢弃恢复期间的实时字节；不得让普通实时输出进入 replay 渲染抑制；不得在每个 WASM 子块重复申请/释放输入内存；Cache 预读不得乱序消费或恢复整批屏障；有持续 cursor 进展时不得因固定总时长中断；本地 Cache commit 不得重新成为最终 Canvas 的可见门槛。

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

### LCMD-20260820-01：WebSocket 断连状态、重试语义与错误诊断补全

- 日期：2026-08-20
- 来源：用户反馈；WebShell 右上角出现静态红点后终端无法继续使用，现场未能稳定复现
- 影响模块：`runtime/static/main.js` 的终端 WebSocket、网络恢复、设备状态心跳、版本检查和调试设置；`runtime/static/index.html`、`runtime/static/style.css` 的调试日志界面
- 错误现象：连接建立卡住时没有超时；缓存/历史等异步前置失败后可能只显示启动错误而不再重试；后台或离线恢复路径不完整；重连红点与普通错误红点语义混淆；设备心跳默认运行；版本查询使用循环轮询；用户无法看到足够的网络和重试上下文
- 根因：连接状态、连接建立中和重连状态没有统一状态机；可恢复错误没有统一进入退避重试；建立阶段缺少明确超时；网络离线只更新提示而没有覆盖全部会话；设备心跳和版本检查生命周期未按调试/挂载语义收敛
- 实施方案：增加 12 秒 WebSocket 建立超时，并将 WebSocket close/error、健康检查、ping、历史同步、异步连接前置失败统一导向 `reconnecting` 与已有退避/抖动重试；后台会话允许重试，离线会话显示 `offline`，网络恢复后重连全部工作区会话。`reconnecting` 使用红色呼吸点，`offline`、`closed`、不可恢复 `error` 使用静态红点，初次 `connecting` 不显示红点。设备心跳仅在调试模式启用，关闭调试或卸载时停止；版本检查改为页面挂载约 1 秒后的单次请求。调试模式新增默认关闭的错误日志开关，开启后在终端右上角显示最大高度、可滚动日志窗口，保留最多 200 条，捕获关键连接/网络/异步错误、重试和控制台错误；同一类控制台警告在 5 秒内去重，不记录正常轮询成功日志
- Guard：更新 `TestRuntimeTerminalOutputBatchingGuard`；新增 `TestRuntimeConnectionStateDiagnosticsAndOneShotRevisionGuard`，固定连接建立超时、异步失败重试、状态点语义、心跳开关、单次版本查询、日志捕获/去重及日志窗口滚动限制；既有 `TestRuntimeOfflineFrameAndWorkspaceRetryGuard`、`TestRuntimeWebSocketReconnectHealthGuard` 继续覆盖后台、离线和健康检查恢复
- 验证结果：`node --check runtime/static/main.js`、`go test ./...`、`git diff --check` 通过
- 禁止复现：不得把可恢复断连标记为静态错误后停止重试；不得在连接建立、异步前置或后台/网络恢复路径丢失重试；设备心跳不得在非调试模式默认启动；版本查询不得恢复为循环轮询；日志不得记录成功轮询或因重复控制台警告刷屏；暂不实现单 WebSocket 多路复用，也不改为只连接活动 tab

### LCMD-20260820-02：初次连接被错误标记为重连红点

- 日期：2026-08-20
- 来源：`LCMD-20260820-01` 上线后现场观察；进入 WebShell 时尚在建立 WebSocket 和等待 PTY 回放，右上角已显示红色呼吸点
- 影响模块：`runtime/static/main.js` 的终端连接状态映射；`runtime/static/style.css` 的连接状态点
- 错误现象：初次打开终端的正常连接与 PTY 回放阶段显示红色呼吸点，容易被误判为网络异常重试
- 根因：`sessionConnectingState()` 把 `reconnectAttempts` 和 `reconnectPending` 作为视觉状态推断依据；这两个调度字段不能表达“是否已发生断线”这一语义
- 实施方案：增加独立的 `connectionRetrying` 状态，仅在 WebSocket 实际断开或开始退避重试时置为真，回放完成时清除。初次连接和 PTY 回放维持 `connecting`，样式改为呼吸灰点；真实 `reconnecting` 保持呼吸红点
- Guard：扩展 `TestRuntimeConnectionStateDiagnosticsAndOneShotRevisionGuard`，固定首次连接状态不依赖重试计数且 `connecting`、`reconnecting` 均有状态点样式
- 验证结果：`node --check runtime/static/main.js`、`go test ./...`、`node --test terminal_cache_v2_test.mjs terminal_resize_scheduler_test.mjs`、`git diff --check` 通过
- 禁止复现：首次 WebSocket 连接、agent preparing 和 PTY 历史回放不得显示红色重连状态点；只有已发生连接异常并调度重试时才可使用 `reconnecting`

### LCMD-20260820-03：PC 底部快捷键栏缺少独立开关

- 日期：2026-08-20
- 来源：用户需求
- 影响模块：终端设置、底部快捷键栏和终端可用视口尺寸
- 错误现象：底部快捷键栏仅在触摸布局出现，PC 用户不能主动保持该栏可见。
- 根因：快捷键栏的显示条件只由触摸媒体查询控制，没有独立的 PC 设置和持久化状态。
- 实施方案：在“终端设置 > 鼠标”下方新增独立的“快捷键栏”设置模块，提供默认关闭的“在PC中开启底部快捷键栏”；设置通过 `api/settings` 持久化。开启后，PC 复用现有快捷键栏并同步为终端、选择菜单、网络提示和通知预留底部空间；触摸设备的既有行为不变。
- Guard：`TestRuntimeDesktopShortcutsBarSetting`、`TestHandleSettingsDefaultsDesktopMouseClipboardMobilePixelScrollAndDoubleTapReminderEnabled` 和 `TestHandleSettingsPatchDesktopMouseClipboardMobilePixelScrollAndDoubleTapReminderPreservesFontAndScrollback`。
- 验证结果：`node --check runtime/static/main.js`、`go test ./...`、`node --test terminal_cache_v2_test.mjs terminal_resize_scheduler_test.mjs` 和 `git diff --check` 通过。
- 禁止复现：PC 快捷键栏必须默认关闭；开启后不得遮挡终端内容或底部浮层；触摸布局不得因该 PC 开关改变既有显示行为。

### LCMD-20260820-04：PC 快捷键按钮持续接收实体回车

- 日期：2026-08-20
- 来源：用户现场反馈；PC 单击底部快捷键后，连续按实体回车会反复执行刚才的快捷键，点击页面空白处后才恢复。
- 影响模块：`runtime/static/main.js` 的底部快捷键栏按钮焦点管理。
- 错误现象：PC 单击任意快捷键按钮后，按钮持续保留浏览器焦点，实体回车被浏览器解释为再次激活该按钮。
- 根因：PC 鼠标按下时没有阻止按钮获得焦点；现有触摸路径不会产生相同的键盘焦点问题。
- 实施方案：仅在 PC 快捷键栏的鼠标按下路径阻止默认聚焦，并记住当前终端会话；快捷键点击完成后对按钮执行失焦兜底。移动端触摸、笔输入、长按重复和粘滞键逻辑保持不变。
- Guard：`TestRuntimeDesktopShortcutsDoNotRetainButtonFocus`；既有 `TestRuntimeMobileShortcutsPreserveKeyboardExceptMenu` 和 `TestRuntimeMobileReturnShortcutRepeats` 继续覆盖移动端行为。
- 验证结果：`node --check runtime/static/main.js`、`go test ./...`、`node --test terminal_cache_v2_test.mjs terminal_resize_scheduler_test.mjs` 和 `git diff --check` 通过。
- 禁止复现：PC 单击快捷键后实体回车不得再次激活该按钮；不得通过改变移动端粘滞键、触摸焦点或长按重复语义修复此问题。

### LCMD-20260820-05：单页面终端 WebSocket 缺少连接容量治理

- 日期：2026-08-20
- 来源：用户现场反馈；同一 WebShell 页面打开较多 tab/分屏后，全部终端可能同时断连
- 影响模块：`runtime/static/main.js` 的 pane WebSocket 生命周期、tab/pane 激活、输入与离线恢复；新增 `runtime/static/terminal_connection_scheduler.js`
- 错误现象：每个 pane 独立持有和重试 WebSocket，页面连接数随 tab/分屏数量增长；当前会话与后台会话没有统一容量、优先级和抢占边界，无法验证降低长连接数量是否能改善集中断线。
- 根因：连接建立、健康重试、历史重放、用户输入、页面恢复和销毁路径分别直接控制 `connectSession()`/`socket.close()`，缺少集中式租约状态机；旧异步回调也没有独立于 pane 对象的租约 generation。
- 实施方案：增加单页面容量为 3 的 pane 专属 WebSocket 租约调度器，`CONNECTING`、`OPEN` 和等待 close 的 `CLOSING` 都占用 slot；仅调度器授予租约后可以调用 `connectSession()`。当前活动/交互 pane 使用 P0/P1，当前 tab 其他可见 pane 使用 P2，后台 pane 使用 P3/P4；P0-P2 可以抢占更低优先级租约，关闭确认前不分配第四条连接。被抢占 pane 进入 `parked`，保留 Ghostty、Canvas、Cache API v2 和 cursor，不显示红点、不启动重试；用户点击或输入后立即提升，parked 输入沿用顺序队列但限制为 256 KiB/10 秒，超限或超时明确提示。每次租约使用单调递增 `leaseID`，WebSocket open/message/error/close、replay ready 和异步连接前置都校验当前租约。网络失败进入 scheduler backoff，离线停止新连接，在线前先刷新全部 demand，再只连接最高优先级的三个 pane。
- Guard：新增 `terminal_connection_scheduler_test.mjs`，覆盖容量、CONNECTING/CLOSING 计数、P0/P2 抢占、四分屏、稳定同级、tab generation、parked、backoff、离线、迟到 leaseID、注销和输入提升；新增 `TestRuntimeTerminalConnectionSchedulerGuard`，固定 `connectSession()` 唯一调用点、service worker 预缓存、生命周期注册/注销、parked 语义及输入 lease 校验。
- 验证结果：`node --check runtime/static/main.js runtime/static/terminal_connection_scheduler.js`、全部 Node 测试和 `go test ./... -count=1` 通过；真实多 tab/四分屏断线率仍需在现场设备与代理链路上对比验证。
- 禁止复现：不得绕过 scheduler 直接连接或重试；不得在收到 close 前复用 closing slot；主动抢占不得设置 `connectionRetrying`、显示红点、清空终端状态或进入 backoff；旧租约回调不得写入新租约；不得把本方案改成单 WebSocket 多路复用。

### LCMD-20260821-01：两条高速连接加一条队列连接服务当前 tab 多分屏

- 日期：2026-08-21
- 来源：用户对 12 分屏人工验收后的方案调整；三条 pane 专属连接只能让非租约 pane 在点击提升后更新，要求在浏览器仍保持最多三条长连接的前提下持续照顾当前 tab 其余可见 pane
- 影响模块：Provider `/ws` 路由与新增 `terminal_queue.go`；浏览器 `terminal_connection_scheduler.js`、新增 `terminal_queue_connection.js`、`main.js` 的通道调度、回放、输入和渲染；Service Worker 与协议/静态 guard
- 错误现象：三条 pane 专属连接虽限制了浏览器连接数，但同一 tab 有 12 个分屏时，未持有租约的 pane 必须点击后才能通过历史追平看到新内容；若简单继续增加独立 WebSocket，会重新触发部分手机/WebView 在长连接过多时全部会话断开的风险。
- 根因：浏览器连接容量治理只有 pane 专属租约，没有一条能承载多个逻辑 pane 的持续流；非 Fast pane 的服务端任务和历史仍正常运行，但浏览器没有订阅其增量。与此同时，Queue 若在 Fast 未用满、Fast 正在连接/关闭或旧 Queue 尚未真实关闭时提前建立，会让普通 pane 错误进入低速通道或短暂突破三条物理连接上限。
- 实施方案：容器 target 改为 2 条 Fast 专属连接加 1 条 Queue 物理连接；`client:` target 暂时继续 3 条直连。只有当前活动 tab 的两个 Fast 租约均处于 `open/leased`、存在剩余可见候选、没有 Queue 正在关闭时才允许创建 Queue；Fast 为 `connecting/closing`、少于两个有效租约、候选为空、离线或后台 tab 时立即关闭/禁止 Queue。浏览器 Queue 模块用一个物理 WebSocket 承载多个带 `pane_id`、`stream_id`、`channel_generation` 的逻辑 socket，并以 `replace-subscriptions` 原子更新成员；最后一个逻辑流关闭或 target 改变后，第三个槽必须等待 `connection.closed` 的真实物理 close 事件才能重建。Provider 不修改 persistent agent，而是为各逻辑 pane 启动现有 attach、持续读取上游、使用每 pane 4 MiB 有界缓冲，并按固定 sequence target、256 KiB 或 8ms 预算公平轮转；每个二进制时间片后发送 `queue-turn-complete`，浏览器使用 `writeReplay()` 解析该时间片并只在轮次边界 full render。队列普通输入被拒绝，用户点击/输入先关闭旧逻辑 generation 并提升到 Fast；generated input、resize、theme 和 input lock 仍可走 Queue。cursor 不连续或缓冲过载只让对应 pane 收到 `resync_required`，停止该内部 attach并用 agent 权威 history 的 delta/snapshot 重建，不关闭其他 Queue pane。物理 Queue 错误只计一次全局退避，单 pane resync 独立处理。
- Guard：新增 `terminal_queue_test.go` 覆盖二进制 envelope、HTTP 401/`client:` 400、固定轮次公平性、`queue-turn-complete` 紧随二进制时间片、普通输入拒绝和 replay cursor 连续/错误重同步；新增 `terminal_queue_connection_test.mjs` 覆盖硬门禁、单物理连接多逻辑流、身份路由、迟到 generation、cursor 连续性、物理错误只触发一次、最后逻辑流关闭等待真实 close；扩展 `terminal_connection_scheduler_test.mjs` 和 `TestRuntimeTerminalConnectionSchedulerGuard`，固定动态 2/3 容量、`CONNECTING/CLOSING` 占槽、Queue closing Promise、`writeReplay()` 延迟渲染及 Service Worker 预缓存。
- 验证结果：`node --check` 通过 `main.js`、Service Worker、Fast scheduler 和 Queue connection；Node Cache v2、resize、Kitty Graphics、实例加载、Fast scheduler 与 Queue connection 行为测试 64/64 通过；完整 `go test ./... -count=1`、`go test -race ./... -count=1` 和 `git diff --check` 通过。本地 Provider 入口和两个新增版本化模块返回 200、`application/javascript` 与 immutable 缓存头，Service Worker 已包含两模块。`terminal-browser` 因当前终端不支持其所需 Kitty 图片协议而无法启动，因此未完成真实页面自动化。用户此前已人工验证三条专属连接版本的基本连接管理；`2 Fast + 1 Queue` 仍需在目标 Android WebView、Lazycat WKWebView 和桌面浏览器以 3、4、12 分屏验证 Network 面板始终不超过三条终端 WebSocket、非 Fast pane 无需点击即可更新、点击提升速度、断线率、CPU、内存和长任务。
- 禁止复现：两条 Fast 未同时 `open/leased` 时绝对不得创建 Queue；Queue `CONNECTING/CLOSING` 必须占用第三个槽；不得在旧物理 close 确认前创建替代 Queue；不得让后台 tab 或当前活动 pane进入 Queue；不得让同一 pane 的 Fast/Queue generation 双写 Ghostty；不得把 Queue 改成 HTTP 轮询、频繁关闭重建 pane WebSocket，或修改 persistent agent 才能工作；不得截断不连续 VT 字节后继续发送。

### LCMD-20260821-02：调试模式按需启用 WebSocket 网络监视器

- 日期：2026-08-21
- 来源：用户需求；需要在真机上直接确认三条浏览器 WebSocket 通道和流量是否符合预期，同时明确未开启时不能为调试增加运行开销。
- 影响模块：终端调试设置和右上角 overlay；新增 `runtime/static/terminal_network_monitor.js`；Fast/Queue 物理 WebSocket 的可选统计接入。
- 需求现象：浏览器开发者工具在部分移动 WebView 中不可用，现场无法直观看到两条 Fast 与一条 Queue 是否启用、当前 MB/s 和本页监视期间累计 MB；若把统计监听做成常驻逻辑，又会反过来增加被诊断设备的消息处理开销。
- 实施方案：调试选项新增默认关闭的“网络监视器”，开启后才动态 import 独立模块、挂载当前物理 WebSocket、包装其 `send()`/`close()` 并监听接收消息，每秒采样一次。面板显示容器目标的“直连通道 1 / 直连通道 2 / 队列通道”，`client:` 目标显示三条直连通道，状态覆盖未启用、连接中、已启用、关闭中和异常；当前接收/发送/合计流量使用十进制 MB/s，累计流量使用十进制 MB。Queue 只统计一次物理帧，不按逻辑 pane 重复累计。关闭监视器或调试模式后立即清除采样 timer、移除事件监听、恢复原始 WebSocket 方法并释放累计状态。
- 调试总控：调试模式关闭时保留 FPS、性能任务、错误日志和网络监视器子开关的持久化偏好，但停止对应 RAF、采样 timer、性能采集、console/window 错误监听、设备心跳和在线设备刷新，并关闭在线设备窗口；重新开启时按保存偏好恢复。只有“允许移动端启用远程桌面”的授权状态独立于总控，关闭调试模式不得清除或禁用该授权。
- 开销边界：主入口不静态 import 监视器，Service Worker 不预缓存该模块；未开启时不下载模块、不安装 WebSocket 消息监听、不包装 `send()`、不累计字节且不运行采样 timer。浏览器只能观察应用层 WebSocket payload，统计值不包含不可见的 WebSocket/TCP/TLS 协议头。
- Guard：新增 `terminal_network_monitor_test.mjs`，覆盖 UTF-8/二进制字节、`2 Fast + 1 Queue`、三直连、MB 换算和 dispose 后停止统计并恢复 socket；新增 `TestTerminalNetworkMonitorBehavior` 与 `TestRuntimeTerminalNetworkMonitorIsOptIn`，固定默认关闭、动态 import、禁止 Service Worker 预取、Queue 物理帧单次统计及可拆卸探针；更新 `TestRuntimeDebugModeControlsDebugTools`，固定调试总控停止全部调试运行功能且不清除移动端远程桌面授权。
- 验证结果：`node --check` 通过 `main.js`、Service Worker、Queue connection 和网络监视器模块；Node Cache v2、实例加载、Kitty Graphics、resize、Fast scheduler、Queue connection 与网络监视器行为测试 68/68 通过；`go test ./... -count=1`、`go test -race ./... -count=1`、Ghostty 资源校验和 `git diff --check` 通过。无头 Chrome 在全新 browser context 验证默认关闭时不请求 `terminal_network_monitor.js`，开启后显示“直连通道 1 / 直连通道 2 / 队列通道”，关闭调试总控后网络/FPS/性能/日志面板全部关闭且 console 捕获恢复，同时远程桌面授权和子开关偏好保留。1280×800 桌面和 390×844 移动 viewport 均无面板或文字溢出。当前本地 Provider 无 LightOS account header，无法建立真实终端 WebSocket，因此真实 MB/s、累计 MB 和连接状态变化仍需在目标设备验证。
- 禁止复现：不得把网络监视器改成主入口静态依赖、Service Worker 预缓存或常驻定时器；不得在开关关闭时监听每条 WebSocket message/send；不得把 Queue 逻辑转发次数计为物理网络流量；不得把 payload 统计宣称为包含协议头的真实链路流量；不得让任何调试采集、窗口或轮询在调试总控关闭后继续运行，也不得因此清除移动端远程桌面授权。

#### 2026-08-21 通道流量拆分

- 现象：网络监视器只展示三条物理 WebSocket 的连接状态，以及所有通道合计后的实时流量和累计流量，无法判断具体是哪一条直连通道或队列通道产生了网络开销。
- 根因：采集模块已经为每条物理通道独立维护收发字节和采样速率，但 UI 只消费了顶层合计字段，没有展示通道级快照。
- 实施方案：通道快照补充各自的合计字节和合计速率；每条通道在状态下方分别显示当前流量、已使用流量，以及接收/发送的实时和累计明细。底部保留所有通道合计，采样周期、物理 socket 监听和按需动态加载机制不变。
- 回归 guard：Node 行为测试断言三条通道的收发、实时和累计数据彼此隔离；Go 静态 guard 固定通道级合计字段与展示样式。监视器未启用或调试总控关闭时仍不得加载模块、监听 socket 或启动采样 timer。
- 验证结果：`node --check`、网络监视器 Node 行为测试 4/4、完整 `go test ./... -count=1`、`go test -race ./... -count=1` 和 `git diff --check` 均通过。无头 Chromium 在 1280×800 与 390×844 视口确认三条通道明细完整显示，面板 `scrollWidth === clientWidth` 且 `scrollHeight === clientHeight`，无文字或容器溢出。

### LCMD-20260821-03：Queue 逻辑会话连接失败后丢失自动重试

- 日期：2026-08-21
- 来源：用户真机反馈；同一 tab 打开较多分屏后，部分 Queue pane 永久黑屏，只有点击并提升到直连通道后才恢复。
- 影响模块：`runtime/static/main.js` 的 Queue 逻辑连接启动与重试调度。
- 错误现象：Queue pane 在异步连接准备期间遇到通道或调度状态变化时，`connectSession()` 可以正常返回 `false`；该 pane 随后没有 socket、没有重试 timer，也不会再次订阅 Queue，直到点击或其他外部调度事件重新唤醒。
- 根因：`connectTerminalQueueSession()` 在 Promise `.then()` 中先调用 `scheduleTerminalQueueSync()`，却直到后续 `.finally()` 才清除 `queueConnectPending`。reconcile microtask 先执行并因 pending 为真跳过该 pane；finally 清除 pending 后没有再次调度，形成确定性的丢失唤醒竞态。分屏越多，历史缓存准备和通道 generation 变化并发越多，越容易进入该分支。
- 实施方案：连接未启动或抛错时只记录需要重试；统一在 `.finally()` 中先清除当前 generation 的 `queueConnectPending`，再调度 Queue backoff/reconcile。保留原有 Queue 物理连接、单 pane resync、两条直连门禁和事件驱动机制，不新增轮询或服务端改动。
- 回归 guard：新增 `TestRuntimeTerminalQueueConnectRetrySettlesPendingBeforeReschedule`，截取 Queue 连接函数并固定只有一个重试调度出口，且该出口必须位于 finally 的 pending 清理之后。
- 验证结果：`node --check runtime/static/main.js`、Queue/Fast/Cache Node 行为测试 40/40、针对性 Go guard、完整 `go test ./... -count=1`、`go test -race ./... -count=1` 和 `git diff --check` 均通过。
- 禁止复现：Queue 逻辑连接的任何异步失败、取消或返回 `false` 路径，不得在 `queueConnectPending` 清除前安排同一 pane 的 reconcile；不得依赖用户点击、tab 切换或周期轮询才能恢复。

#### Queue 本地缓存 FIFO 准备

- 现象：Queue 必须优先复用本地缓存，避免向 Provider 重拉已存在的历史；但多个 pane 同时独立读取 manifest、提交缓存和 warm replay，会在移动端造成并发 Cache API/IndexedDB 压力并扩大连接状态窗口。
- 根因：此前把“不能并发缓存准备”误改为“Queue 不使用缓存”，虽然缩小了状态窗口，却丢失了本地命中和 delta 回放，反而增加服务端回放流量。
- 初版问题：32 分屏真机验证只显示约 10 个 pane，其余 pane 黑屏；点击后提升到直连通道能够恢复。原实现把“manifest 读取、逻辑订阅建立、Cache v2 warm replay 完成”全部放入一个 FIFO 任务。后排 pane 在前排完整历史回放期间没有逻辑订阅和独立错误/重试状态，表现为必须点击才能被直连调度唤醒。
- 定时器问题：若先建立全部逻辑订阅、再串行读取本地缓存，后排 pane 又会在等待 FIFO 时被 8 秒 attach-ready 或 25 秒 socket health 定时器误判为失败，重新关闭 Queue 逻辑流，形成新的黑屏循环。
- 实施方案：Queue 保持本地缓存优先和 cursor delta 协议，但拆成两个连续的 FIFO 阶段。第一阶段串行读取 manifest、确认既有缓存写入，并立即建立对应 pane 的共享 Queue 逻辑订阅；第二阶段再串行执行 Cache v2 `readChunks()` warm replay。等待本地缓存的 pane 仍保有有效逻辑订阅，Provider delta 进入既有有界网络缓冲；等其轮到 warm replay 后与本地历史连续合并。等待 FIFO 本地缓存时暂停该 pane 的 attach/health 超时，实际开始读取后恢复 attach 限时，而缓存读取自身保留 2 秒无进度超时。缓存未命中、缓存失败、升级 Fast、tab 切换、物理 Queue 关闭和旧 generation 都会释放任务并重新 reconcile。工作区加载不再自动并发预读全部 tab 总览缓存，避免与 Queue 首次恢复竞争。
- 回归 guard：新增 `createTerminalQueueTaskQueue()` 的 FIFO/最大并发和“前一任务失败仍释放下一任务”Node 测试；`TestRuntimeTerminalQueueConnectSerializesAsyncCachePreparation` 固定 Queue 分阶段建立逻辑订阅、本地缓存串行回放、超时延期和未测量 pane 的自动尺寸调度。
- 验证结果：`node --check` 通过；Queue/Fast/Cache/resize Node 行为测试 46/46 通过；完整 `go test ./... -count=1`、`go test -race ./... -count=1` 和 `git diff --check` 通过。仍待在目标设备以单 tab 32 分屏验证所有 pane 自动完成首次回放、全程仅 2 Fast + 1 Queue 物理 WebSocket，且不点击任何黑屏 pane。
- 禁止复现：不得为避免并发而禁用 Queue 本地缓存或无条件请求 snapshot；不得让两个 Queue pane 同时执行 manifest 读取或 Cache v2 warm replay；不得把完整 FIFO 缓存回放当作建立逻辑订阅的前置条件；不得让等待 FIFO 的 pane 因 attach/health 定时器被关闭；不得让单个缓存失败阻塞 FIFO 后续任务。

### LCMD-20260821-04：终端初始化并发抢占与 Queue pane 悬空黑屏

- 日期：2026-08-21
- 来源：用户在单 tab 多分屏真机复测；打开终端后仍有 Queue pane 黑屏，点击后提升至直连即可显示，同时两条直连 pane 的首次就绪速度被 Queue 初始化拖慢。
- 根因：Fast scheduler 容量为 2 时会并发启动 Fast A/Fast B；Queue gate 又把 Fast WebSocket `open/leased` 当作就绪，因而在 PTY 回放、Cache API 读取、Ghostty 解析和首帧渲染尚未结束时就建立第三条物理连接并开始 Queue 工作。此前 Queue FIFO 还在逻辑订阅建立后立即释放当前任务；异步取消、关闭或旧 generation 可让 pane 保留逻辑 socket 但没有后续启动任务，且等待本地缓存时暂停的健康检查无法将它确定地转入重试，形成永久黑屏。
- 实施方案：启动顺序改为严格 `Fast A -> Fast B -> Queue`。Fast A 仅在当前 generation 的 PTY/history replay 完成、实时数据追平、尺寸可用且最终 full render 已提交后放行 Fast B；Fast B 达到同一标准后才允许创建 Queue 物理 WebSocket。Queue gate 只接受两个 Fast 的 `presentation ready`，不接受 socket open 或 lease 状态。每个 Queue pane 将“缓存准备、逻辑订阅、PTY/history replay、最终首帧”作为一个 FIFO 任务；只有当前 pane 成功呈现、关闭、取消或失败后才结算任务并允许下一个 pane 开始。失败/取消统一释放 waiter、移除逻辑流并立即重新 reconcile，不能遗留有 socket 无任务的悬空状态。运行期既有 Queue pane 的持续输出仍由同一条 Queue WebSocket 实时承载，不引入 HTTP 轮询，不修改 persistent agent。
- 回归 guard：Queue Node 测试要求两个 Fast 均为 `ready` 才允许创建 Queue；Go guard 固定 Fast presentation gate、`Fast A -> Fast B` 放行、Queue startup waiter 以及成功/关闭两条结算路径；既有 FIFO 行为测试继续确保单任务失败不阻塞后续任务。
- 验证结果：`node --check`、Fast scheduler 与 Queue Node 行为测试 31/31、针对性 `go test ./...` 和 `git diff --check` 通过。仍需在目标设备以单 tab 32 分屏验证：直连 1 先就绪、直连 2 随后就绪、Queue 最后启动；不点击任一 Queue pane 时所有 pane 最终呈现或显示可诊断重试状态，浏览器物理终端 WebSocket 始终不超过 3 条。
- 禁止复现：不得重新以 Fast socket `open`、`leased` 或容量已占满作为 Queue 启动条件；不得并发启动 Fast A/Fast B 或在 Fast B 首帧前创建 Queue；不得让 Queue pane 在未呈现、未失败且无 waiter 的状态占据逻辑流；不得把启动串行化扩大为运行期输出轮询或修改 persistent agent。

### LCMD-20260821-05：Fast 槽位竞态导致全通道重建和 Queue 黑屏

- 日期：2026-08-21
- 来源：32 分屏真机复测；网络监视器显示直连通道 1/2 在初始化和点击 pane 时反复从连接中变为关闭。点击 Queue pane 后，两个直连和 Queue 物理连接都被关闭并重建，仍有部分 Queue pane 永久黑屏。
- 根因：Fast 候选在每次 `syncTerminalConnectionDemands()` 时从异步尺寸测量和活动 pane 重新计算。`panePresentationIsCurrent()` 又把正常 PTY 输出到下一帧 Canvas 完成之间的短暂 content generation 差异解释为 Fast 未就绪，于是主动以 `fast_bootstrap_wait` 释放仍在初始化或正常运行的 Fast。Queue gate 同样依赖这个瞬态条件，任何一次重算都会关闭已有 Queue 流。点击 Queue pane 时，`pointerdown`、active pane health check 和 `focusin` 可重复触发全局重算；新候选尚未就绪时，原两个 Fast 与 Queue 会被整体撤销，形成三条物理连接一起重建。Queue Cache v2 warm replay 虽暂停 health timeout，但 8 秒 attach-ready timeout 仍会取消正常缓存回放中的 pane。
- 实施方案：新增按当前 target/tab 归属的稳定 Fast A/Fast B 槽位。首个 Fast 完成当前 lease/replay 的最终首帧后才分配第二槽；后续普通输出、内容 generation 变化和一次 render pending 不得释放已分配槽位。Queue gate 仅控制第一次创建；已有 Queue 在 Fast 瞬态渲染状态变化或一次受控 Fast 交接时保留原物理连接及其逻辑成员。点击 Queue pane 时只将它提升到 Fast A，保留最近使用的另一 Fast，并在真实 close 确认后替换被淘汰的 LRU Fast；仅关闭该 pane 的旧 Queue logical stream。`setActivePane()` 去重 pointer/focus 的重复调度。Queue warm replay 期间同时延后 attach-ready timer 和同步健康检查，缓存读取完成后再恢复 attach 期限。
- 回归 guard：扩展 `TestRuntimeTerminalConnectionSchedulerGuard`，禁止恢复 `fast_presentation_lost` 的通道释放；新增 `TestRuntimeTerminalFastSlotHandoffPreservesQueueTransport` 固定稳定槽位、单 Fast 替换、Queue 保留以及单次 pointer 调度；扩展 Queue 缓存测试，固定 attach-ready/synchronous health 两条超时路径在 warm replay 中暂停。
- 验证结果：`node --check runtime/static/main.js`、Fast scheduler 与 Queue connection Node 测试 31/31、针对性 Go guard 通过。仍需在目标设备用单 tab 32 分屏验证：首次顺序为 Fast A、Fast B、Queue；点击 Queue pane 时网络监视器只显示一条 Fast 关闭/替换，另一 Fast 与 Queue 始终保持开启；无需点击任何其余 pane，全部最终完成首帧。
- 禁止复现：不得把持续输出或 `panePresentationIsCurrent()` 的短暂失配作为 Fast lease/Queue 物理连接的释放原因；不得在一次 Queue -> Fast 提升中关闭未被淘汰的 Fast 或 Queue 物理连接；不得让 pointer、health check 和 focus 为同一点击重复发起全局连接重算；不得在 Queue Cache v2 warm replay 期间触发 attach-ready timeout。

### LCMD-20260821-06：初始化拓扑缺少唯一所有者导致 Fast 抖动与 Queue 永久黑屏

- 日期：2026-08-21
- 来源：`LCMD-20260821-05` 后的 32 分屏真机复测；直连通道 1/2 在“连接中、已启用、已关闭”之间快速跳变，Queue 最终仅少量 pane 有首帧，其余 pane 无灰点、无重试且点击后才恢复。
- 影响模块：浏览器 `runtime/static/main.js` 的容器终端初始化与连接生命周期；新增 `runtime/static/terminal_topology_controller.js`；Queue transport、Network Monitor、Service Worker 和对应 Node/Go guard。Provider 与 persistent agent 不修改。
- 错误现象：多个 resize、首帧、replay、焦点、健康检查和 tab 激活入口同时调用全局 demand reconcile；任一次候选重算都可能撤销还在启动的 Fast lease。Queue 启动任务把 Cache API、逻辑订阅、PTY/history 回放和 Canvas 最终首帧持有在同一个无期限 FIFO 中；一个 pane 漏掉最终 render 后，后续全部 pane 失去启动机会。部分未及时测量的 pane 又根本不会成为候选，因而初始状态完全黑屏。
- 根因：Fast/Queue 拓扑没有唯一所有者，稳定 slot 变量不足以约束所有异步回调；Queue 物理连接会在最后一个逻辑流短暂移除时自动关闭；Queue waiter 没有覆盖 render 漏回调这一终态；监视器按附着顺序而非 controller slot 标识通道，难以定位上述竞态。
- 实施方案：新增纯前端 `TerminalTopologyController`，以 target/tab `epoch`、Fast A/B stable slot、attempt ID 和 Queue transport attempt 作为唯一拓扑状态。容器目标首次初始化严格为“活动 pane 可测量 -> Fast A 最终首帧 -> Fast B 最终首帧 -> Queue 物理连接 -> Queue pane FIFO”；普通输出、render pending、resize、health check 和 focus 只上报状态，不再释放或重排 Fast/Queue。旧 epoch/attempt 回调直接忽略；Fast 失败只保留同一阶段、同一 pane 交给原 scheduler 退避重试。Queue 物理连接支持显式 `connect()` 与 `keepAliveWhenEmpty`，单 pane 重试或提升 Fast 只关闭对应 logical stream，不关闭第三条物理 WebSocket。每个 Queue 启动项采用 40 秒有限 latch，`ready`、`cancelled`、`failed`、`timed_out` 都只结算一次并释放 Cache/warm replay FIFO；超时只重排当前 pane，后续 pane 立即继续。未测量 pane 显示 `awaiting_measurement` 灰点，并通过最多四次 `requestAnimationFrame` 尺寸确认自动进入流程，不产生网络轮询。Network Monitor 使用 controller stable slot 显示“直连通道 1 / 直连通道 2 / 队列通道”。
- Guard：新增 `terminal_topology_controller_test.mjs`，覆盖 32 pane 严格阶段、活动 pane 测量门禁、重复 render 无抖动、延迟测量自动入队、旧 epoch/attempt 忽略、Fast 失败保持阶段及仅淘汰一个 LRU Fast；扩展 `terminal_queue_connection_test.mjs`，覆盖有限启动 latch 与超时后 FIFO 前进、空 logical stream 保持物理 Queue；扩展 `terminal_network_monitor_test.mjs`，覆盖稳定 Fast slot；更新 `TestRuntimeTerminalTopologyControllerOwnsFastQueueHandoff`、Queue FIFO 和静态资源 guard。
- 验证结果：`node --check runtime/static/main.js runtime/static/terminal_topology_controller.js runtime/static/terminal_queue_connection.js runtime/static/terminal_network_monitor.js`、完整 Node 行为测试、`go test ./... -count=1`、`go test -race ./... -count=1` 与 `git diff --check` 通过。仍需在目标 Android WebView、Lazycat WKWebView 与桌面浏览器以单 tab 3、12、32 分屏进行实机验收。
- 禁止复现：容器目标的 Fast lease、Queue physical transport 和 Queue logical membership 只能由 controller 分配或释放；不得恢复 `fast_bootstrap_wait` 全局撤销路径；Fast A 当前最终首帧前不得启动 Fast B，两个 Fast 当前最终首帧前不得创建 Queue 或运行 Queue Cache FIFO；Queue 最后一个 logical stream 临时关闭不得关闭物理 transport；单个 Queue pane 不能无限占用 FIFO，也不得依赖点击、HTTP 轮询或服务端 agent 改动才能恢复；初始化期间每个可见 pane 必须处于明确的灰点等待、重试或 ready 状态，禁止无状态黑屏。

### LCMD-20260821-07：Queue logical pane 干扰物理连接退避

- 日期：2026-08-21
- 来源：`LCMD-20260821-06` 收尾检查；需要确保 Queue 的物理重连计数不会被任一 logical pane 的 replay 或同步状态影响。
- 影响模块：`runtime/static/main.js` 的 Queue physical transport 退避和 logical pane 同步路径。
- 错误现象：Queue physical transport 的 `OPEN` 快照会在 logical stream 增减时重复发出，导致重连计数被非物理事件重置；同时 logical pane 的同步调度会取消物理退避定时器。一次真实物理断开后，定时器可能被清掉，或在到期后因计数仍大于零反复安排等待而不发起新的连接，Queue pane 因而没有可恢复的 transport。
- 根因：物理连接状态与 logical pane 状态共用了同一个 state callback 和调度入口，却没有区分真实 readyState 迁移与 logical membership 更新；退避定时器也暴露给了 logical reconcile。
- 实施方案：记录 Queue 的上一次物理 readyState，仅在真实 `OPEN`/`CLOSED` 迁移时重置或递增重连计数。主动关闭 Queue physical transport 时清空旧 epoch 的退避。物理退避定时器到期后以明确的 `afterBackoff` 标记只执行一次新的连接尝试；logical Queue 同步不再读取、清除或重新安排该定时器和计数。
- 回归 guard：`TestRuntimeTerminalTopologyControllerOwnsFastQueueHandoff` 固定物理状态迁移、退避到期重试、replay 隔离及 logical synchronize 不得触碰 physical backoff。
- 验证结果：`node --check runtime/static/main.js runtime/static/terminal_topology_controller.js runtime/static/terminal_queue_connection.js runtime/static/terminal_network_monitor.js`、Node 行为测试 60/60、`go test ./... -count=1`、`go test -race ./... -count=1` 与 `git diff --check` 均通过。真实目标实例仍需验证一次 Queue 物理断开后的退避、自动重连及全部 logical pane 自动恢复。
- 禁止复现：不得从 replay complete、逻辑流增删、Queue FIFO、pane 重试或普通 reconcile 修改 Queue physical reconnect attempts；不得让 logical pane 调度取消或替代物理 transport 的退避定时器。

### LCMD-20260821-08：冷启动窗口顺序与视觉布局不一致

- 日期：2026-08-21
- 来源：32 分屏真机复测；首次打开时直连与 Queue pane 的加载顺序看起来随机，服务端最后活动的 pane 会抢占左上窗口。
- 影响模块：`runtime/static/main.js` 的活动 tab 布局测量，以及 `runtime/static/terminal_topology_controller.js` 的 Fast/Queue 冷启动候选排序。
- 错误现象：冷启动候选优先按保存的 active pane、历史交互、输出时间和服务端创建顺序选择。`PaneIDs` 是创建顺序而不是布局视觉顺序，因此两个直连与 Queue FIFO 不会按用户正在看的第一行从左到右加载。
- 根因：运行期交互优先级被直接复用于没有用户操作的首轮初始化，控制器没有接收冻结的视觉位置序列。
- 实施方案：当前 tab 全部可见 pane 完成有效 fit 与 `getBoundingClientRect()` 位置确认后，前端按 top、left、布局树顺序和 pane ID 生成稳定视觉序列。一个拓扑 epoch 仅首次启用此序列：视觉第一个和第二个 pane 依次成为直连通道 1、2；两个最终首帧完成后，剩余 pane 以同一序列加入 Queue FIFO。Queue 首次候选会带 `initialization` 标记交给运行时；在其排入 Queue microtask 前，普通 refresh 的活动/LRU 候选不得覆盖该标记快照。首次候选已实际交接后永久退出冷启动排序，继续沿用已有用户交互/LRU 提升规则。Cache API 继续保持尽力命中，单 pane 缓存未命中或超时即时回退 snapshot，不成为全局初始化门禁。
- 回归 guard：`terminal_topology_controller_test.mjs` 覆盖 stored active pane 不得抢占视觉首个 pane、直连 1/2 与 Queue FIFO 的连续视觉次序、普通 refresh 生成独立运行期候选但不得替换首轮标记快照，以及 Queue 启动后不重新进入冷启动排序；Go 静态 guard 固定几何排序、首次候选保护和控制器启动边界。
- 验证结果：`node --check runtime/static/main.js runtime/static/terminal_topology_controller.js runtime/static/terminal_queue_connection.js runtime/static/terminal_network_monitor.js`、Node 行为测试 61/61、`go test ./... -count=1`、`go test -race ./... -count=1` 与 `git diff --check` 均通过。仍需在目标设备以 12、32 分屏确认首次打开的实际首帧严格按第一行从左到右、再依次进入后续视觉位置；缓存命中继续保持尽力而为，不阻塞首帧。
- 禁止复现：不得用 `activePaneID`、历史输出或服务端 `PaneIDs` 替代没有用户操作时的冷启动视觉次序；不得在运行期普通 refresh 重新启用冷启动排序；不得为等待全量缓存命中阻塞任一 Fast 或 Queue pane 的建立。

### LCMD-20260823-01：tab 切换重建物理连接与后台 Queue 队首阻塞

- 日期：2026-08-23
- 来源：用户确认切换已打开 tab 时网络监视器显示直连通道未启用、灰点重新出现，并要求 tab 与 pane 统一使用页面级三通道模型。
- 错误现象：旧拓扑把 `tabID` 作为物理连接上下文。切 tab 会关闭两条 Fast 和 Queue，再重新创建；实际终端可能仍显示旧 Canvas，但连接确实被重建。后台 tab pane 不能加入 Queue，隐藏 pane 的 Canvas 首帧又可能不可测量，导致全局初始化或 Queue FIFO 长时间等待，失败后需要点击才能恢复。网络监视器按临时 pane socket 附着，旧 socket 占槽时新 socket 可能漏记。
- 根因：物理 transport 生命周期和逻辑 pane 绑定耦合；Fast 只有单 pane URL，无法在不断开 socket 的情况下换绑；Queue 连接与活动 tab 绑定；Queue startup latch 把不可见 pane 的最终 Canvas 当成 FIFO 结算条件；监视器没有按稳定 slot 替换旧附着。
- 实施方案：
  1. Provider 为 `transport_role=fast` 提供同一版本化复用协议，Fast broker 最多一个逻辑订阅并允许普通输入；Queue broker 继续多路公平轮转和输入限制，persistent agent 与 PTY 生命周期不变。
  2. 浏览器页面级维护 2 个稳定 Fast transport 和 1 个稳定 Queue transport。controller 的 epoch 只在 target、离线或页面重置时变化；tab 切换只发送新的逻辑订阅集合，健康物理 WebSocket 不关闭。
  3. 全部 tab/pane 展平为全局初始化顺序：活动 tab 视觉顺序优先，其余 tab 按工作区顺序加入 Queue。Fast 失败保留原 slot 并由 scheduler 退避重试，Queue 逻辑失败释放 FIFO 后重新入队，任何可恢复错误都不能永久黑屏。
  4. 后台 Queue pane 在 replay、cursor 连续后即可结算启动任务，不等待不可测量 Canvas；激活 tab 时复用内存终端状态执行当前尺寸 full render。
  5. 网络监视器直接绑定三个稳定 physical transport；同一稳定 slot 发现新 socket 时先替换旧附着，保留累计流量。
- 回归 guard：`terminal_topology_controller_test.mjs` 覆盖跨 tab 全局 Queue、tab 切换不发 `stop-queue-transport`、target 切换才重置物理 transport、Fast 失败留在同一 slot、Queue 物理失败只重试一条 transport；`terminal_queue_test.go` 覆盖 Fast broker 单订阅和普通输入；`runtime_shortcuts_test.go` 固定页面级 `transport_role`、全局视觉排序和稳定 monitor socket；Node 60/60、Go 全量测试和 `git diff --check` 通过。
- 待验证：尚未在目标 Android WebView、Lazycat WKWebView 和桌面浏览器进行多 tab、32 pane、主动断网/恢复和高频输出真机验收。
- 禁止复现：不得恢复 `terminalQueueTabID` 或用活动 tab 变化关闭三条物理 WebSocket；不得把后台 pane 的不可测量 Canvas 作为 Queue FIFO 的唯一结算条件；不得让 Fast 复用 transport 接受超过一个逻辑 pane；不得让单 pane 失败从重试队列消失。

### LCMD-20260823-02：resize 后旧尺寸字节进入新网格

- 日期：2026-08-23
- 来源：用户现场反馈；WebShell 调整窗口大小后出现字符位置错乱、乱码、旧行，新 tab 或 tab 选项偶尔显示旧内容。
- 影响模块：`workspace.go`、`agent.go`、`agent_runtime.go` 的 PTY resize/attach 输出顺序；`runtime/static/main.js` 的尺寸同步、presentation hold、输入就绪和历史回放门禁；`workspace_test.go`、`runtime_shortcuts_test.go`。
- 错误现象：浏览器先切换 Ghostty 字符网格，resize 控制随后异步到达 Provider/agent；PTY 输出没有几何 epoch，前端也把最近测量值直接当作服务端已应用尺寸。resize 与持续 TUI 输出交错时，旧尺寸下的输出可能按新网格解析；presentation hold 或历史回放期间又可能把未确认的画面当作当前帧。
- 根因：同一 pane 的字节已经有 pane/channel 归属，但没有 resize geometry 归属。`channel_generation` 只能防止 Fast/Queue 迟到通道写错 session，不能证明输出属于哪一个 PTY 尺寸；请求、PTY 应用和 Canvas 呈现也没有独立状态。
- 实施方案：
  - `terminalControlMessage` 增加字符串 `resize_epoch`；pane 维护单调的 `resizeEpoch`，resize 请求由 `resizeMu` 串行处理，旧 epoch 拒绝、同 epoch 同尺寸幂等、冲突返回 `resize-error`。
  - PTY `Setsize`、`resize-applied` 控制帧和后续输出广播共享 `outputMu` 有序边界；同一 pane 的 ACK 在后续二进制输出前进入客户端队列，并广播给当前 attach clients。
  - 历史启动帧声明 `resize_protocol=epoch-v1` 并携带当前 epoch/尺寸；未声明的旧 agent 或 `client:` 终端明确降级为 legacy，不让浏览器永久等待 ACK。
  - 浏览器拆分 requested/applied/presented resize epoch，发送 resize 后不再提前更新 `serverCols/serverRows`；ACK 前保持旧画面并锁定普通输入，ACK 后执行 full render，只有 render 成功才推进 `presentedResizeEpoch` 和 `renderReady`。迟到或不匹配 ACK 不得推进当前 pane。
  - Queue 保持已有 `channel_generation` 和有序文本/二进制 relay；resize epoch 不替代通道 generation。历史 resize timeline、geometry fingerprint 和跨设备 owner/lease 本轮不伪造，仍按方案文档的 `geometry_unknown`/后续阶段处理。
- Guard：新增 `TestTerminalPaneResizeEpochIsMonotonicIdempotentAndOrdered`，覆盖成功 ACK、后续输出顺序、重复 epoch 幂等、旧 epoch 拒绝和冲突；新增 `TestRuntimeResizeEpochAckGuard`，固定浏览器 epoch、ACK 门禁、presented epoch 和不可提前提交 hold；既有 Queue/Fast、历史、Cache v2 和 Canvas guard 继续生效。
- 验证结果：`node --check runtime/static/main.js`、`go test ./...`、`go test -race ./...`、`git diff --check` 通过。尚未完成真实桌面/WebView 持续 TUI 输出与拖拽 resize 验收，历史 geometry timeline 和跨设备 owner/lease 仍需后续阶段实施。
- 禁止复现：不得把 `lastSentCols/lastSentRows` 或 `requested` 状态当作 PTY 已应用尺寸；不得在 ACK 前解锁普通输入、推进 presented epoch 或提交新的 presentation frame；不得让旧 epoch resize 回退 PTY；不得把 `channel_generation` 当作 `resize_epoch`；旧 agent 不支持 epoch 时不得静默伪装成强一致模式。

### LCMD-20260823-03：历史回放 reset 门禁与 Queue 逻辑重试退避

- 日期：2026-08-23
- 来源：真机日志显示 Queue 物理通道保持 `physical=1`，但逻辑 pane 因 `terminal reset failed` 反复关闭；多个 pane 同时失败时红点/黑屏无法自行恢复。
- 根因：历史回放 reset 错误地要求 `measuredFitGeneration > 0`，把尚未完成可见 DOM 测量误判为运行时不可用；Queue logical close 后立即重新进入候选，缺少 pane 级退避和失败状态清理，容易在同一事件循环反复重建逻辑流。
- 实施方案：历史回放只要求 Ghostty runtime、当前 target 和已知逻辑尺寸，隐藏 pane 可以先完成 replay，Canvas fit 仍由激活/可测量阶段负责；记录 `terminal_size_unavailable`、`runtime_reset_failed` 等明确失败原因并写入诊断日志。Queue pane 增加独立指数退避（500ms 起、最大 10s），退避期间排除候选、显示红色重试状态，计时器到期后由事件驱动重新入队；逻辑失败不关闭物理 Queue，物理 close 后清理 `queueConnectPending/queueTaskState`，成功 replay 清零 pane 退避。
- 初始化门禁：Queue 物理 WebSocket 只有在 Fast A/B 的物理连接和逻辑 replay 都 ready 后创建，严格保持 `Fast A -> Fast B -> Queue`。
- 回归 guard：更新拓扑 Node 测试，固定 Fast 逻辑 ready 前不得创建 Queue；Queue 连接/物理连接测试和完整 Go 静态 guard 继续覆盖单物理连接、多逻辑 pane、失败后自动恢复及无永久黑屏路径。
- 验证结果：`node --check runtime/static/main.js runtime/static/terminal_topology_controller.js`、`node --test terminal_queue_connection_test.mjs terminal_topology_controller_test.mjs`（31/31）、`go test ./... -count=1` 和 `git diff --check` 通过。仍需目标 Android/WebView 真机验证断网恢复、cache-v2 reset 失败和 32 分屏全部自动重试。
- 禁止复现：不得再以 `measuredFitGeneration` 作为隐藏 pane 历史回放硬门禁；不得让 Queue logical 失败同步重置物理退避或立即无限重连；不得让任一 Fast 物理 OPEN 在逻辑 replay 未 ready 前启动 Queue；任何可恢复 close/error 都必须最终回到灰色等待、红色退避或 ready，不能永久黑屏。

### LCMD-20260823-04：普通容器拓扑收敛为一条直连加一条队列

- 日期：2026-08-23
- 来源：用户要求进一步降低移动端/WebView 的长连接和初始化复杂度，去掉第二条直连通道。
- 实施方案：普通容器目标的页面级物理拓扑改为 `Fast -> Queue`，Fast scheduler 容量从 2 降为 1；当前活动或正在操作的 pane 独占唯一 Fast 槽位，其他 tab/pane 通过同一条 Queue WebSocket 的逻辑 stream 复用。Queue 物理创建只等待唯一 Fast pane 的物理 OPEN 和逻辑 replay ready；Queue pane 的缓存优先、FIFO、独立退避和物理连接保活规则不变。网络监视器的 multiplexed 布局只展示“直连通道 1”和“队列通道”。
- 兼容边界：`client:` 独立目标不使用 Queue，继续使用其原有直连 scheduler；本次不把两种传输模型强行合并。
- 回归 guard：拓扑测试覆盖单 Fast 完成后才创建 Queue、tab 切换只替换一个 Fast 逻辑绑定、物理 Queue 失败不影响唯一 Fast；网络监视器测试覆盖普通容器仅显示一个直连通道和一个队列通道。Go 静态 guard 固定容量为 1、单 Fast 槽位和 `Fast -> Queue` 阶段。
- 验证结果：Node 拓扑、网络监视器和 scheduler 测试 40/40 通过；`go test ./... -count=1` 通过。仍需目标 Android/WebView 真机验证 1 条 Fast + 1 条 Queue 下的 32 分屏、tab 切换、Fast 提升和断网恢复。
- 禁止复现：普通容器不得重新创建 Fast B、第二条 Fast 物理 WebSocket或在监视器中显示不存在的直连通道 2；不能因为减少 Fast 数量而取消 Queue pane 的自动重试、缓存优先或永久黑屏保护。

### LCMD-20260823-05：单 Fast 语义与终端总览预览持久化

- 日期：2026-08-23
- 来源：用户要求明确单通道语义，并修复重新打开终端后总览预览为空的问题。
- 实施方案：普通容器拓扑统一命名为 `Fast -> Queue`，不再使用 `Fast A/Fast B` 阶段或语义。冷启动按全局稳定视觉顺序将第一个 pane 分配给 Fast，其余 pane 按 Queue FIFO 逐个初始化；用户聚焦 pane 时只替换唯一 Fast 的逻辑绑定，不新增物理连接。
- 预览持久化：每次 pane 的稳定渲染和历史缓存提交后继续以去抖方式捕获终端画面并写入 Cache API v2；后台 Queue pane 即使没有可见 Canvas fit，只要 replay、终端尺寸和缓存 cursor 已就绪，也走独立预览捕获门禁，不需要切换 tab。预览保存成功后刷新总览预览状态。workspace state 应用完成后，以当前有效 tab/pane 集合核对同一 workspace 的缓存 manifest，仅删除已不存在 pane 的预览对象，保留仍存在 pane 的历史字节缓存，避免冷启动时总览只能显示“无预览”。
- 回归 guard：拓扑阶段只允许 `fast_starting`/`fast_ready` 和 `Fast -> Queue`；Cache v2 测试覆盖孤儿预览删除不影响 live pane 和历史 chunks；运行时 guard 固定单 Fast 槽位、单 Fast 物理连接、Queue FIFO 初始化和预览清理调用。
- 禁止复现：不得恢复 `Fast A/Fast B` 或第二条普通直连；不得要求用户点击 pane 才开始初始化或生成总览预览；不得为了清理预览删除仍存在 pane 的历史缓存；不得让预览持久化阻塞 Queue 初始化。

### LCMD-20260823-06：网络监视器与调试日志视觉语义统一

- 日期：2026-08-23
- 来源：用户反馈；普通容器只有一条 Fast 直连通道，但监视器仍显示“直连通道 1”，调试日志窗口整体红色导致普通信息和警告看起来像错误。
- 影响模块：`runtime/static/main.js`、`runtime/static/terminal_network_monitor.js`、`runtime/static/style.css` 及网络监视器静态/行为 guard。
- 实施方案：普通容器的 multiplexed 监视器标签统一为“直连通道”，`client:` 三条独立直连标签保持编号兼容。调试日志窗口复用网络监视器的青色边框、背景、正文和按钮配色；信息、警告和错误正文均保持中性色，只有错误行在正文前插入红色“错误”标签，不再用整行红色表达级别。
- 回归 guard：网络监视器 Node 测试固定普通布局只显示“直连通道 / 队列通道”，直接目标仍显示三条编号通道；Go 静态 guard 固定普通标签、青色面板调色板和错误标签 DOM/CSS，同时禁止旧的整面板红色背景。
- 验证结果：`node --check` 通过 `main.js` 和网络监视器模块；网络监视器 Node 行为测试 6/6、全部 Node 用例 92/92、`go test ./... -count=1`、`go test -race ./... -count=1` 与 `git diff --check` 均通过。真实设备只需确认日志长文本滚动和错误标签在窄屏不溢出。
- 禁止复现：普通容器不得恢复“直连通道 1”或不存在的第二条普通直连；不得让 `warn`/`info` 日志使用红色或黄色整行样式；错误突出必须通过独立标签完成，不能把整个日志面板渲染成错误态。

### LCMD-20260823-07：终端总览预览不能只依赖当前 tab

- 日期：2026-08-23
- 来源：用户反馈；终端总览只显示当前正在查看 tab 的预览，其他 tab 没有预览或保持“无预览”。
- 根因：后台 tab 的总览绘制优先使用隐藏 pane 的 live canvas，而缓存预览准备只在 pane 尚未 render-ready 时触发；同时首次截图必须等待 3 秒无输出并进入 idle 回调，Queue 持续输出时该任务可能一直被取消或延后。回放完成后 `historyCacheSnapshot` 会被清空，但 `historyCacheLoaded` 仍为 true，导致总览预览读取无法再次加载 manifest。
- 实施方案：普通容器后台 tab 的卡片始终优先使用身份校验后的 Cache API v2 预览，当前 tab 才优先使用有效 live canvas；`client:` 没有 Cache API v2 时保留有效 live canvas 回退。总览预览通过独立的 `loadPaneTabOverviewPreviewManifest` 按当前 pane identity 重新读取 manifest，不依赖一次性的 `historyCacheSnapshot`。每个 Queue pane 完成 replay 后立即安排一次首个预览捕获，不等待输出静默窗口；后续输出继续采用原有延迟和 idle 节流，保持截图开销受控。总览关闭时也持续准备所有 tab 的缓存预览，打开总览不再临时从当前 tab 开始准备。
- 回归 guard：`TestRuntimeContainerCacheV2AndPWAContract` 固定后台 tab 缓存准备、独立 manifest 读取、当前 tab live canvas 选择、全局预览准备和 Queue replay 后立即捕获；已有 Cache v2 身份匹配测试继续防止跨 pane/跨 workspace 预览串用。
- 验证结果：`node --check runtime/static/main.js`、全部 Node 用例 92/92、Cache v2 行为测试 12/12、`go test ./... -count=1`、`go test -race ./... -count=1` 与 `git diff --check` 均通过。目标设备需确认多 tab 总览中每个卡片都有对应历史画面，且持续输出时预览最终会更新。
- 禁止复现：不得用隐藏 tab 的 live canvas 代替其持久化预览；不得把 3 秒静默窗口作为后台 tab 首个预览的硬门禁；不得只在总览打开后才开始准备非当前 tab 的预览。

### 2026-08-23 Queue transport cleanup after workspace removal

- Fixed topology reconciliation so a Queue physical connection is stopped as soon as the workspace has no non-Fast pane candidates.
- This closes the retained `keepAliveWhenEmpty` transport after tabs/panes are removed, allowing the surviving pane to reclaim Fast without waiting for a stale Queue generation.
- Added regression coverage for pruning all Queue panes and for a promoted Fast pane being removed before the parked Fast pane is reassigned.

### 2026-08-23 Single-pane Fast recovery and intentional close semantics

- Fixed `session_closed` Queue logical closes being treated as retryable network failures. Destroyed panes now close with the terminal already marked closed, so they cannot re-enter Queue retry or keep a stale logical stream alive.
- When a higher-priority pane disappears and no other active/non-parked demand remains, a preempted surviving pane automatically reclaims the single Fast slot. This prevents the last session from staying parked until pending input expires.
- Closing a tab now explicitly re-runs connection-demand reconciliation, allowing the topology to close Queue when only one Fast pane remains and to start Queue again when a new pane is added.
- If the final surviving pane was on Queue, the topology first promotes it to Fast and only then closes the Queue physical transport; a one-pane workspace therefore never intentionally keeps both channels enabled.
- Diagnostic details identify the three hierarchy levels explicitly: `会话`, `tab`, and `分屏`.
- Regression coverage now includes idle-pool Fast recovery and keeps Queue open during Fast replacement when other panes still exist.

### 2026-08-23 Fast lease handoff must not expire queued input

- 来源：用户现场日志；唯一 Fast lease 在 `tab-1/pane-1` 与 `tab-18/pane-19` 之间切换后，`pane-1` 报告“终端输入等待连接超时”，局部终端无法继续输入。
- 根因：Fast 抢占只关闭逻辑 stream，物理 Fast/Queue transport 仍然健康；但 pane 的待发送输入使用了一个与 lease 无关的一次性 10 秒计时器。输入在旧 lease 上排队后，主动抢占、缓存准备和新 lease 回放继续消耗旧计时窗口，旧 timer 可能在新 stream ready 前清空输入。旧 timer 的迟到回调也没有校验当前 lease 或 channel generation。
- 实施方案：待发送输入超时现在绑定当前 `leaseID` 和 `connectionChannelGeneration`，并使用 token 防止旧回调修改新状态。Fast 逻辑 stream 被主动停放或连接异常时暂停计时；新 lease 分配后重新开始计时。当前 lease 仍在缓存准备、历史回放或 resize ACK 阶段时，不再丢弃用户输入，而是触发既有连接健康检查并继续等待正常重试/回放完成；回放 ready 后由统一 flush 路径发送并清理计时器。
- 回归 guard：`runtime_shortcuts_test.go` 固定 lease-bound token、暂停/恢复函数、generation 校验以及“恢复中的当前 lease 不得清空输入”；Node scheduler/topology tests 继续覆盖 Fast 抢占、快速 tab 切换、关闭确认和 Queue 物理连接保持。`node --check` 和 61 项连接/拓扑相关 Node 测试通过。
- 验证结果：`node --check runtime/static/main.js`、`node --test terminal_connection_scheduler_test.mjs terminal_topology_controller_test.mjs terminal_queue_connection_test.mjs terminal_network_monitor_test.mjs`、`go test ./...`、`git diff --check` 通过。尚未完成真实设备上 A→B→A tab 快速切换、两个分屏连续输入和慢回放场景验证。
- 禁止复现：不得让逻辑 Fast 抢占沿用旧 lease 的输入超时；不得让迟到 timer 清空新 lease 的输入；不得把缓存/回放未完成直接视为永久失败；物理 transport 未关闭时不得触发页面级连接池重建。

### 2026-08-24 Closed Fast pane must release its topology slot

- 来源：用户现场日志；频繁创建和关闭 tab 后，Queue 仍保持物理连接，但部分终端永久无法输入，刷新页面才恢复。
- 根因：`disposePane()` 先将 pane 标记为 closed，拓扑刷新随后为已删除的 Fast pane 发出 `stop-fast`。运行时命令处理以 `session.closed` 为由直接返回，没有发送 `fastStopped` 确认；控制器因此一直保留已删除 pane 的 Fast assignment，后续 pane 只能停留在 Queue。Queue 可以输出但普通输入需要 Fast，最终表现为局部终端卡死。
- 实施方案：`start-fast`/`stop-fast` 遇到已关闭或已切换目标的 pane 时，先幂等释放残留 scheduler lease，再使用命令携带的 `epoch`、`attemptID` 和 `paneID` 确认拓扑 assignment 已停止。物理逻辑流仍由 scheduler 的 close 回调完成真正释放，替换请求会在连接安全关闭后继续，不会重复创建物理 WebSocket。
- 回归 guard：拓扑 Node 测试覆盖连续删除当前 Fast pane 直到只剩最后一个 pane、重新分配存活 pane，并确认最终单 pane 状态不会保留 Queue；Go 静态 guard 固定关闭 pane 命令确认边界。
- 验证结果：相关 78 项终端 Node 测试、`go test ./... -count=1`、`go test -race ./...`、`node --check` 和 `git diff --check` 通过。仓库级 `node --test` 额外收集 `ghostty-web` 的 Bun/TypeScript 测试，当前 Node 运行器不支持 `bun:` 协议且缺少其构建模块，因此该命令有 19 项环境性失败，不涉及本次终端代码。
- 禁止复现：不得因 pane 已 closed 而丢弃 `stop-fast`/`start-fast` 确认；不得让已删除 pane 出现在 `fastSlots`；不得以刷新页面作为恢复 Fast 槽位的必要条件；物理 transport 未关闭时不得重建整页连接池。

### 2026-08-24：多路复用终端消息增加会话所有者二次门禁

- 来源：终端历史串会话修复方案执行；需要把“传输层已路由”与“终端实例允许写入”明确分成两道边界。
- 错误风险：Queue/Fast 多路复用层虽然按 `pane_id`、`stream_id` 和 `channel_generation` 路由消息，但主终端处理器此前只依赖 `currentSocket` 和连接状态。若旧逻辑流的迟到回调、错误 relay 或异步消息绕过传输层路由，仍可能进入当前 Ghostty 的控制或二进制输出路径。
- 根因：会话身份校验没有在最终写入者处形成统一的硬门禁；`queueMetadata` 只用于传输层分发，没有在 `connectSession` 的消息处理闭包中再次核对当前 pane 的 stream/generation。
- 实施方案：为多路复用连接增加 `validateTerminalChannelMessageIdentity`。控制帧和二进制帧在进入 replay、resize、输出和完成处理前，必须匹配当前 session 的 pane、stream 和 channel generation；唯一允许无 pane 元数据的消息是物理 Queue 广播的 `agent-preparing`。不匹配时走当前 session 的身份拒绝和重连路径，先保留身份匹配的 last-known-good 帧并锁定呈现，再丢弃当前输出；不能写入 Ghostty，也不能修改其他 pane。
- Guard：`TestRuntimeTerminalMultiplexedIdentityGate` 固定控制帧和二进制帧都经过最终写入者门禁，并要求身份拒绝进入 presentation hold；`terminal_queue_connection_test.mjs` 固定二进制事件携带精确的 pane/stream/generation/cursor 元数据，并继续验证不同 pane 不互相收帧。
- 验证结果：`node --check runtime/static/main.js`、`node --test terminal_queue_connection_test.mjs`（16/16）、连接/拓扑相关 Node 测试（74/74）、`go test ./... -count=1`、相关 Go guard 和 `git diff --check` 通过。
- 禁止复现：不得只依赖 Queue connection 的 map 路由；不得在缺少或不匹配 `queueMetadata` 时把多路复用二进制数据写入当前终端；不得把物理广播控制误当作某个 pane 的历史或 PTY 字节。

### 2026-08-24：resize 本地网格延后到服务端 ACK 后切换

- 来源：继续处理 resize 后旧尺寸字节进入新网格的问题；仅有 `resize_epoch` ACK 和 presentation hold 仍不能阻止本地终端在 ACK 前改变解析网格。
- 错误现象：resize/字体/分屏尺寸变化时，服务端 resize 尚未应用，前端 Ghostty 已切换到新 cols/rows；此前已到达或正在排队的 PTY 字节随后按新网格解析，持续 TUI 下可能出现错位、旧行和类似 replay 的视觉变化。
- 根因：请求尺寸、PTY 应用尺寸和本地 Ghostty 网格在同一 `resizePane` 调用中被推进；presentation hold 只隐藏画面，不能修正终端模型已经使用错误几何解析字节的问题。
- 实施方案：活动且已完成 replay 的 epoch-aware 连接在检测到几何变化后创建 `resizeFenceTarget`，先强制排空当前输出，再发送带目标几何的 resize 请求，但暂不调用本地 `term.resize`。ACK 按 WebSocket/Provider 输出顺序到达后，先在旧网格处理 ACK 前已排队字节，再一次性应用目标网格、恢复 viewport、请求 full render，并由既有 presentation hold 在完整帧成功后提交。迟到 ACK、竞争 owner 的不同几何或 resize error 不会应用过期 target；无 epoch 的旧 agent/client 继续走 legacy 路径。
- Guard：`TestRuntimeResizeEpochAckGuard` 固定 defer fence、目标几何发送、ACK 后排空和本地 resize 顺序；既有 `TestRuntimeTerminalCanvasResidueGuard`、resize scheduler、Queue/Fast 和历史 cursor guard 继续覆盖呈现与连接边界。
- 验证结果：`node --check runtime/static/main.js`、相关 Go guard、Queue/连接 Node 测试、完整 `go test ./... -count=1`、`go test -race ./...` 和 `git diff --check` 通过；真实设备上的持续 TUI resize、字号变化和快速切 tab 仍需安装包后完成视觉验收。
- 禁止复现：不得在 epoch-aware resize ACK 前调用本地 `term.resize`；不得把请求尺寸当作已应用尺寸；不得在旧阶段输出未排空前提交新网格；不得让无 epoch 的 legacy 连接永久等待 ACK。

### 2026-08-24：resize 后 PTY 实时重绘增加有界呈现屏障

- 来源：设备验收发现 resize/字号变化后仍可看到全屏 TUI 从顶部逐批重绘到底部；该路径不是历史字节反向顺序问题，而是 resize ACK 后的实时 PTY 输出走普通 `term.write()` 并按帧提交。
- 根因：resize fence 在 ACK 后立即执行 full render，但应用收到 `SIGWINCH` 后产生的后续实时重绘会在 presentation hold 解除后分批可见；`writeReplay()` 只覆盖真正 history replay 或显式 suppressRender 的输出。
- 实施方案：ACK 后进入 `resize_output_settle` 状态，默认等待 120ms 输出静默，最长 800ms。屏障期间 PTY 字节仍严格按正序解析，并通过 `writeReplay()` 抑制中间 Canvas；诊断时间线将这类写入记为 `write_suppressed`，与真正历史回放的 `write_replay` 区分。静默或到达上限后强制排空队列、执行一次 full render，再原子解除 presentation hold。断线、历史 resync、resize error 和取消 resize 时清理 timer 与屏障。
- 性能边界：不复制或反向重放字节，只增加一个有界 timer 和同一 session 的暂存队列；正常 resize 最多增加一个短暂呈现等待，持续输出不会无限等待。
- Guard：`TestRuntimeResizeEpochAckGuard` 固定 ACK 后进入 settle barrier、settle 期间 `suppressRender` 和最终 full render 的顺序。
- 待现场验收：持续 `watch`/全屏 TUI、快速拖拽窗口和反复调整字号，确认只看到旧帧到最终帧的切换，不出现逐批滚屏；同时确认真正 history replay 仍只产生一次最终帧。

### 2026-08-24：增加终端会话事件时间线

- 来源：需要在设备现场区分实时 PTY 重绘、真正 history replay、身份拒绝重连和 Canvas full-render 缺口，避免再次只根据画面推断根因。
- 实施方案：每个 pane 保存最多 96 条短事件，记录 `channel/attach/history generation`、resize epoch、received/applied/presented cursor 和事件名。覆盖 resize request/applied、resize fence、term resize、history replay start/reset/write/complete、socket connect/close、Queue recycle、presentation hold 和 full-render request/start/failed/complete。默认不记录 PTY 内容、命令、账号隐私或票据；开启调试日志时只输出 pane 定位和事件名。
- Guard：`TestRuntimeTerminalDiagnosticTimelineGuard` 固定时间线字段、96 条上限以及 resize、replay 和 full-render 关键事件入口。
- 验证结果：`node --check runtime/static/main.js`、Node 终端测试、Go 全量测试和 `git diff --check` 通过；事件时间线仍需在真实设备复现一次 resize/live redraw 与 replay 对比现场。

### 2026-08-24：多设备 resize 互相抢占导致分辨率闪烁

- 来源：用户回归反馈；PC 与移动端同时打开同一 WebShell 时，所有设备的终端画面持续在移动端和 PC 分辨率之间闪烁。
- 错误现象：一台设备发送 resize 后，另一台设备收到更大的 `resize-applied`。旧前端把该远端尺寸差异当成本机必须立即 reclaim 的信号，随后再次发送本机尺寸；两个客户端不断交替成为 PTY 最后写入者，导致 Ghostty 网格、PTY `Winsize` 和全屏 TUI 重绘在两种分辨率间来回切换。
- 根因：共享 PTY 的最后写入尺寸没有区分“被动观察”与“用户主动 claim”。`resize_epoch` 解决了同一连接的顺序，却没有提供跨设备所有权语义；服务端也接受任意新 epoch 的被动 resize，因此前端的自动回抢形成反馈环。
- 实施方案：resize 控制帧增加可选 `claim` 字段。已有 resize owner 时，服务端拒绝没有 `claim` 的新 epoch，并返回 `resize_owner_active` 及当前应用尺寸；显式窗口/分屏尺寸变化、点击终端、鼠标输入和移动端触摸 claim 路径才发送 `claim: true`。前端收到远端 ACK 或 `resize_owner_active` 后把共享尺寸作为本地观察值，使用 resize fence 更新 Ghostty，但不自动把本机尺寸写回；应用远端尺寸时抑制 `term.onResize` 的二次发送。旧客户端的 input+尺寸兼容路径只允许与当前 owner 尺寸一致，不会因为每次输入触发错误或改写 PTY。
- 回归 guard：`TestRuntimeCrossClientResizeDoesNotAutoReclaim` 固定前端远端 ACK 不得调用自动 reclaim、服务端必须存在 owner guard；扩展 `TestTerminalPaneResizeEpochIsMonotonicIdempotentAndOrdered` 固定被动新 epoch 返回 `resize_owner_active` 且不改变 owner 尺寸；`TestTerminalControlInputCannotPassivelyResizeOwnedPane` 防止旧 input+尺寸路径绕过 owner guard；`terminal_resize_scheduler_test.mjs` 固定 `claimSize` 在节流合并后仍保留。新增 `scripts/test-multi-device-resize.sh`，执行定向 Go 测试、运行时语法检查、resize scheduler 测试和 `git diff --check`。
- 验证结果：`./scripts/test-multi-device-resize.sh` 通过；覆盖测试固定 resize ACK、owner 拒绝和本地远端尺寸应用顺序。真实桌面浏览器、Android WebView 和 Lazycat iOS 宿主仍需用 PC+移动端同时持续输出场景验收。
- 禁止复现：不得把远端尺寸差异自动转换为本机 claim；不得让无 `claim` 的新 epoch 覆盖已有 owner；不得在本地应用远端尺寸时由 `term.onResize` 再发 resize；显式用户交互仍必须先 claim 当前设备尺寸。

### 2026-08-24：切换 tab 后 replay 已完成但最终帧未提交

- 来源：用户现场反馈；部分已初始化 tab 在切换后永久黑屏，只有点击 pane 才恢复。点击会同时触发 focus、尺寸 claim、连接优先级调整和 full render，因此此前容易误判为连接或 PTY replay 失败。
- 根因：隐藏 tab 的 history replay 完成后直接调用 `renderNow(true)`，但隐藏 Canvas 没有可提交的真实尺寸；之后 tab 激活虽会调度 fit/resize，却没有一条统一链路保证 resize ACK、post-ACK 输出屏障和最终 full render 全部完成。若首次隐藏 render 无效，或激活时仍停在 `resizeFenceActive` / `resizeAckPending`，pane 会保持 `renderReady=false` 且没有后续主动提交，最终只能靠用户点击触发另一条恢复路径。
- 实施方案：新增统一的 pane presentation gate。隐藏或不可测量 pane 只登记 `presentation_deferred`，不再假装完成 live Canvas render；history replay 完成、Queue turn 完成、tab 激活后的稳定帧、resize ACK、resize error 和 post-ACK output settle 都进入同一 gate。gate 仅在 pane 可见、可测量、Canvas 几何匹配且 resize fence/ACK/settle 全部结束后请求最终 full render；否则通过既有 resize scheduler 和有上限的 validation backoff 继续检查。长期未返回的本设备 resize ACK 会重发保存的 fence 目标，但不会直接修改本地 Ghostty 网格。
- 跨设备边界：presentation 恢复路径不得直接调用 `term.resize`，不得自动发送或重放 `claim: true`，不得把远端 observed resize 转换为本设备 reclaim。即使原 fence 来自一次显式交互，超时恢复也只做被动 resize 重发；`resize_owner_active` 采用服务端返回尺寸并停止回抢，重新 claim 必须来自新的点击、触摸或显式尺寸变化。
- Guard：新增 `TestRuntimeTabActivationPresentationRecoveryGuard`，固定 replay/Queue/tab/resize 进入统一 gate，隐藏 pane 必须 defer，resize pending 必须等待 ACK 并复用 resize scheduler，同时禁止 gate 绕过 fence 或主动抢占远端尺寸。既有 resize epoch、跨设备 owner、Canvas residue 和 Queue FIFO guard 继续覆盖旧问题。
- 验证结果：`node --check runtime/static/main.js runtime/static/terminal_topology_controller.js`、79 项连接/拓扑/Queue/cache/resize Node 测试、定向 presentation/resize/跨设备 Go guard、`go test ./... -count=1`、`go test -race ./...` 和 `git diff --check` 均通过。真机仍需覆盖“后台 tab replay 完成后首次切入不点击”和“PC/手机同时打开后反复切 tab”两组场景。
- 禁止复现：不得依赖点击、Fast 提升或刷新浏览器才能显示 replay 完成的 pane；不得在隐藏 Canvas 上把无效 render 当作已呈现；不得在 resize ACK 前切换本地网格；不得为了消除黑屏回退跨设备尺寸 owner/claim 保护。

### 2026-08-24：切换 tab 的呈现退避过长

- 来源：上一条黑屏修复后的设备体验；功能最终能恢复，但部分 tab 切换仍需要接近 1 秒才显示。
- 根因：呈现验证使用 `80ms -> 160ms -> 320ms -> 640ms -> 1000ms` 的退避检查，布局稳定和 Ghostty 下一帧渲染事件没有直接唤醒同一条 presentation gate；用户体感因此被定时器间隔放大。这个等待与 resize ACK 的传输重试混在同一恢复感受中，但两者不是同一个故障。
- 实施方案：将呈现验证改为短序列 `32ms -> 64ms -> 128ms -> 250ms`，最大兜底 250ms；tab 激活后的下一帧、ResizeObserver 几何变化和 Ghostty `onRender` 未提交事件都主动调用统一 presentation gate。resize ACK 重发单独保留 1200ms 的传输 watchdog，并继续被动重发，不携带旧 `claim`。
- 安全边界：短时验证只负责触发 fit/full render，不直接调用 `term.resize`；本地网格仍只能在合法 `resize-applied` ACK 后切换，远端尺寸仍不能自动 reclaim。ACK 未到时保留旧帧或缓存预览，不能以提前渲染制造黑屏或跨设备分辨率回弹。
- Guard：扩展 `TestRuntimeTabActivationPresentationRecoveryGuard`，固定短验证上限、ResizeObserver/onRender 事件触发和禁止一秒级 fallback；既有 resize epoch、跨设备 owner、Canvas residue 和 Queue FIFO guard 继续覆盖旧问题。
- 验证结果：`node --check runtime/static/main.js runtime/static/terminal_topology_controller.js`、79 项终端连接/拓扑/Queue/cache/resize Node 测试、`go test ./... -count=1`、`go test -race ./...`、`./scripts/test-multi-device-resize.sh` 和 `git diff --check` 均通过；真机仍需确认切换已完成 replay 的 tab 在首帧或合法 resize ACK 后立即显示。
- 禁止复现：不得重新引入一秒级呈现退避；不得用降低 ACK 安全边界换取切 tab 速度；不得让渲染验证定时器成为唯一的 tab 激活触发源。

### 2026-08-25：Agent 持续输出期间终端总览预览消失

- 来源：用户现场反馈；静态会话可以显示终端预览，但会话中 Agent 持续输出时总览卡片变为“无预览”，停止输出后才恢复。
- 根因：Cache v2 `append()` 每次提交历史字节都会把 manifest 的 `preview` 置空并删除旧图片，而新截图要等待输出静默窗口和浏览器空闲；持续输出不断重置捕获计时器，形成“旧图已删、新图未生成”的失效窗口。总览读取还要求 `preview.checkpointCursor === manifest.endCursor`，因此任何落后于最新历史的快照都会被当成无效。
- 实施方案：预览改为 last-known-good 语义。历史 append 保留同一完整身份下的旧 preview，`normalizeManifest`/`loadPreview` 允许 `checkpointCursor <= endCursor`；新截图仍必须以当前已持久化 cursor 原子保存，成功后才替换旧图片，reset、删除 pane 和孤儿清理仍会删除预览。前端捕获改为 2 秒有界节流，任务串行执行并采用 pending/latest-wins；Agent 输出期间继续显示旧图，捕获失败不清空旧图，停止输出后下一次提交会追上最终状态。
- 安全边界：账号、selector、workspace、tab、pane、history generation 身份校验保持不变；旧预览只用于总览视觉展示，不能进入 Ghostty 历史恢复或终端状态恢复。预览 cursor 只能落后，不能超前 manifest end cursor。
- Guard：`terminal_cache_v2_test.mjs` 新增持续输出期间保留旧预览、随后原子替换新预览的测试；`TestRuntimeContainerCacheV2AndPWAContract` 固定 stale cursor 边界、节流刷新、串行捕获和失败保留语义；新增 `scripts/test-terminal-live-preview.sh` 运行语法检查、Cache v2 Node 测试、运行时契约和 diff 检查。
- 验证结果：`./scripts/test-terminal-live-preview.sh` 通过（13 项 Cache v2 测试）；真实 Agent 持续输出、多设备总览和移动端 WebView 仍需在安装包环境做视觉验收。
- 禁止复现：不得在 append 时删除仍属于当前 pane/history generation 的 last-known-good preview；不得以 preview cursor 落后为由在总览显示“无预览”；不得放宽跨账号、workspace、tab、pane 或 history generation 校验；不得让预览读取结果参与终端恢复；不得为追求实时性在每批 PTY 输出中同步 PNG 编码。

### 2026-08-25：统一终端 render 请求诊断与同帧 reason 合并

- 来源：终端一致性与调度优化执行计划 Phase 0/Phase 1；为后续 live output scheduler 建立可观测基线。
- 影响模块：`ghostty-web/lib/terminal.ts`、`ghostty-web/lib/terminal.test.ts`。
- 实施方案：为 `Terminal.requestRender()` 增加可选 `reason`，在一个 animation frame 内合并多个 output、resize、selection、cursor 和 explicit 请求；保留 full render 优先级。新增 `getRenderDiagnostics()`，统计 render request、scheduled frame、render attempt、成功 frame、full/partial render 以及当前和上一次合并的 reason。失败 materialization 继续保留 full redraw 和 retry，不改变 PTY write 时序或现有公开调用兼容性。
- 回归 guard：新增 `coalesces render requests and records merged reasons`，固定三个同帧请求只排一个 frame、reason 顺序和 full render 合并；既有失败 materialization retry 测试继续固定失败帧不触发成功 `onRender`。
- 验证结果：定向测试 `bun test lib/terminal.test.ts -t 'coalesces render requests'` 通过；`git diff --check` 通过。直接运行完整 `terminal.test.ts` 时，当前命令环境缺少项目测试预期的 Happy DOM 初始化，已有 DOM 测试出现环境基线失败；该环境问题与本次 render 诊断改动无关，后续需按项目正确测试入口复验完整套件。
- 禁止复现：不得让 render reason 合并改变 live/replay 字节处理顺序；不得让失败 render 触发成功 render event 或清除 full redraw 状态；不得删除 diagnostics 中的 session/generation 维度扩展入口；后续 output scheduler 必须复用该 render 合并边界。

### 2026-08-25：Live output scheduler 基础设施

- 来源：终端一致性与调度优化执行计划 Phase 2；为高输出场景建立可验证的分帧工作队列。
- 影响模块：`ghostty-web/lib/terminal-work-scheduler.ts`、`ghostty-web/lib/terminal-work-scheduler.test.ts`、`ghostty-web/lib/index.ts`。
- 实施方案：新增 FIFO 字节 scheduler，默认每帧最多处理 `256 KiB`、最多 8 次 write；超过单帧预算的输入会被分片，保留字节顺序。支持 cancel/dispose、queued bytes/writes、frame/write/byte、失败和最后帧预算 diagnostics。
- 接入边界：本阶段没有替换 `Terminal.write()` 的同步路径，echo、DSR/DA、response 和 callback 顺序不变。live-output 接入保持关闭，待 WebShell 入口完成 session identity/generation 绑定后再启用。
- 回归 guard：新增 4 项 scheduler 单测，覆盖 FIFO 与预算、大块分片、取消丢弃、异常后保留队列并可重试。
- 验证结果：`bun test lib/terminal-work-scheduler.test.ts`（4/4）、`bun run typecheck`、`git diff --check` 通过；上一阶段完整 `terminal.test.ts`（153/153）和 `go test ./...` 已通过，本阶段未修改其行为路径。
- 禁止复现：不得把 scheduler 当作跨会话隔离方案；不得丢弃或重复字节；不得在未验证 response 时序前异步化所有 `Terminal.write()`；session 销毁必须取消队列，异常不得让 scheduler 永久卡死。

### 2026-08-25：Runtime live output queue generation guard

- 来源：终端一致性与调度优化执行计划 Phase 2；修复旧 rAF/timeout 或 replay reset 后的输出队列继续写入当前 session 的风险。
- 影响模块：`runtime/static/main.js`、`runtime_shortcuts_test.go`。
- 实施方案：每个 session 的 output queue 使用单调 `outputQueueGeneration`；入队条目保存 generation；flush 前验证队列条目全部属于当前 generation；`discardSessionOutputBuffers()` 清空队列并递增 generation；stale queue 被丢弃并记录 `staleOutputQueueDrops`。
- 安全边界：不改变既有 live/replay/suppressRender 分流、output batching、history cursor 或 Terminal 同步 write；不会把 replay 数据送入 live scheduler，也不会跨 session 共用队列。
- 回归 guard：扩展 `TestRuntimeTerminalOutputBatchingGuard`，固定 generation 初始化、入队绑定、flush 校验、discard 递增和 stale-drop metric。
- 验证结果：`node --check runtime/static/main.js`、`go test ./...`、连接 scheduler 20 项、Queue 16 项、topology 20 项、Cache v2 13 项、resize 5 项、network monitor 6 项、`./scripts/test-multi-device-resize.sh`、`./scripts/test-terminal-live-preview.sh` 和 `git diff --check` 均通过。
- 已知风险：generation guard 只解决旧队列归属，不能替代 session identity、generation/sequence/cursor/checksum 的端到端帧校验；新的 `TerminalWorkScheduler` 仍未接入 WASM write。
- 禁止复现：不得删除 generation 校验以追求输出吞吐；不得让 session dispose、history reset 或 reconnect 后的旧 callback 写入当前终端；不得把 stale queue 当作合法 replay 数据恢复。

### 2026-08-25：Queue binary frame sequence/checksum 校验

- 来源：终端一致性与调度优化执行计划 Phase 4；进一步收紧 Queue relay 到 Terminal 前的帧边界。
- 影响模块：`runtime/static/terminal_queue_connection.js`、`terminal_queue_connection_test.mjs`、`runtime_shortcuts_test.go`。
- 实施方案：在 pane、stream、channel generation 和 cursor 连续性基础上，增加可选 `sequence` 连续性校验、CRC32 payload checksum 校验和 `history_generation` 匹配；旧服务端省略这些字段时保持兼容。
- 失败行为：sequence 跳号、checksum 非法/不匹配、history generation 不一致、长度或 cursor 不连续时，只让当前逻辑流进入 `connection-error`/`resync_required`，payload 不分发到 Terminal，其他 Queue pane 不受影响。
- 回归 guard：新增 Queue 测试覆盖首帧 sequence/checksum、重排和篡改帧拒绝；扩展 `runtime_shortcuts_test.go` 固定解析、校验和 generation 保护存在。
- 验证结果：Queue 测试 17/17；Queue module、Queue test、main runtime `node --check`；`go test ./...`；`git diff --check` 均通过。
- 已知风险：Fast 直连帧和服务端发送策略仍需后续继续收紧；可选字段未被服务端强制发送前，checksum 不能覆盖所有传输路径。
- 禁止复现：不得接受 sequence 跳号或 checksum 错误的 payload；不得把可选校验缺失伪装成已验证；不得因一个 Queue pane 的坏帧关闭或污染其他 pane。

### 2026-08-25：Fast identity partial-field boundary and malformed sequence guard

- 来源：终端一致性与调度优化执行计划 Phase 4；继续收紧 Fast replay/control 和 Queue binary 的字段语义。
- 影响模块：`runtime/static/main.js`、`runtime/static/terminal_queue_connection.js`、`terminal_queue_connection_test.mjs`、`runtime_shortcuts_test.go`。
- 实施方案：Fast replay/control 消息中只要出现 `selector` 或 `pane_id`，该字段就必须分别匹配当前 Terminal owner；只有两个字段都缺失时才允许 legacy 兼容。Queue 首帧区分 sequence 缺失与非法值，非法值不能降级为无 sequence 的旧协议。
- 失败行为：Fast 身份不匹配时清空未确认输出、保持 presentation hold 并重连；Queue 非法或跳号 sequence 不分发 payload，当前 logical stream 进入 resync/error。
- 回归 guard：新增非法首帧 sequence 测试；runtime shortcut test 固定 Fast partial-field 校验和 Queue sequence mode guard。
- 验证结果：Queue 测试 18/18；main、Queue module、Queue test `node --check`；`go test ./...`；`git diff --check` 均通过。
- 已知风险：Fast binary output 仍是服务端裸 payload，未具备可选 sequence/checksum envelope；该限制已明确记录，不能假设 Queue 校验自动覆盖 Fast。
- 禁止复现：不得把存在但错误的身份字段当作 legacy；不得把非法 sequence 当作字段缺失；不得在校验失败后继续向 Ghostty 写入 payload。

### 2026-08-25：Cache v2 manifest history identity validation

- 来源：终端一致性与调度优化执行计划 Phase 4；修复缓存 manifest 在指定历史代次下可能解析到旧 manifest 的边界。
- 影响模块：`runtime/static/terminal_cache_v2.js`、`terminal_cache_v2_test.mjs`。
- 实施方案：调用方提供 `historyGeneration` 时，manifest identity comparison 强制启用 history 比较；未指定 generation 的 pane-level manifest lookup 仍可读取当前 manifest。`deletePane()` 先读取 pane 当前 manifest，再比较旧 generation，避免旧删除请求删除新 generation。
- 失败行为：history generation 不匹配时拒绝 manifest；旧 generation 删除返回 `false` 且保留新 manifest；上层缓存 replay 可回退网络同步。
- 回归 guard：新增跨 history generation manifest 拒绝测试，并保留旧 generation 删除不影响新 generation 的测试。
- 验证结果：Cache v2 测试 14/14；Cache module、Cache test `node --check`；`git diff --check` 通过。
- 已知风险：immutable chunk 目前只做长度和 cursor 范围校验，尚未保存每块 checksum；Fast 裸 binary output 同样尚未具备 sequence/checksum envelope。
- 禁止复现：不得用 pane identity 覆盖明确的 history identity；不得在旧 generation 校验失败后删除当前 manifest；不得把 manifest mismatch 当作可安全 replay 的数据。

### 2026-08-25：Fast binary `LCF1` integrity envelope

- Fast 直连在 `integrity_protocol=fast-v1` 协商后，为 replay 和 live binary payload 添加 `LCF1` header；payload 本身不变。
- Header 严格绑定 selector、pane、history generation、sequence、start/end cursor、length 和 CRC32 checksum。
- 旧请求继续兼容裸 binary；新客户端遇到缺 envelope、身份不匹配、cursor/sequence 不连续、长度错误或 checksum 错误时停止写入并重新同步。
- Fast replay focused 回归新增 `LCF1` header 检查，验证 delta replay 首帧从 `deltaFrom` 开始，sequence 为 1，end cursor 与 payload length 一致。
- 新增 `TerminalResizeController` 及 focused tests，覆盖 request/ACK/settle/commit 顺序、stale ACK、stale callback、error 和非法 geometry。
- Queue modern replay 已接入 `ReplayController`：有 sequence 的 `LCQ1` binary frame 使用 Queue transport 已验证的 `queueMetadata` 驱动 sequence/cursor/length/identity 校验；旧 Queue 缺 sequence 时明确 reset controller 并保留 legacy 兼容路径。连接换代、resync、pane dispose 和 page dispose 均重置 replay controller。
- 字号/字体切换现在使用 `fontMetricsGeneration` 防止旧延迟回调覆盖新字号，并在当前帧、80ms、240ms 重新测量 renderer metrics、执行 fit、发送最新尺寸和 full render；修复放大字号后必须点击一次才恢复底部内容与排版的问题。- 新增 `RenderSnapshot` 及 focused tests，将 content/history generation、cursor、resize epoch、geometry、fit/replay/render generation 和 canvas materialization 冻结为不可变对象；presentation-current 判断现在会拒绝与当前 session 状态不一致的已提交 snapshot。


- 来源：终端一致性与调度优化执行计划 Phase 4；补齐 Queue 客户端已有校验对应的服务端字段。
- 影响模块：`terminal_queue.go`、`terminal_queue_test.go`。
- 实施方案：Queue `LCQ1` binary header 为每个 payload 发送 `sequence`、cursor 起止、CRC32 checksum；订阅包含 history generation 时同时发送该 generation。payload 本身保持不变。
- 失败行为：Queue stream 不能维护连续 cursor 时停止当前 logical stream；客户端对缺帧、重排、长度错误、checksum mismatch 或 generation mismatch 拒绝 payload 并重新同步。
- 回归 guard：新增 Go 测试验证 sequence、checksum 和 history generation；既有 Queue JS 18 项校验测试继续保留。
- 验证结果：`go test ./...`、Queue connection 18/18、Cache v2 15/15 和 `git diff --check` 通过。
- 已知风险：Fast 裸 binary output 仍无等价 envelope；旧服务端 Queue 帧仍按客户端可选字段兼容。
- 重要修正：binary sequence 与文本控制帧的内部队列顺序分离，控制帧交错在两个 binary payload 之间时不会制造客户端可见的 sequence 跳号。
- 禁止复现：不得只在客户端校验而不发送服务端字段；不得把 sequence/checksum 缺失的 Queue 新帧宣称为完整性已验证；不得修改 envelope payload 字节导致终端语义变化。

### 2026-08-25：Cache v2 immutable chunk CRC32 validation

- 来源：终端一致性与调度优化执行计划 Phase 4；补足 Cache v2 immutable byte block 的内容完整性校验。
- 影响模块：`runtime/static/terminal_cache_v2.js`、`terminal_cache_v2_test.mjs`。
- 实施方案：新写入 chunk 在 manifest 中记录 CRC32，并在 Cache response header 保存 checksum；append tail merge、replay read 和 compaction 对 checksum 进行校验或重新计算。
- 失败行为：带 checksum 的 chunk 内容篡改、长度错误或 cursor 范围错误时拒绝 replay；旧 manifest 缺少 checksum 时保持兼容，仅执行长度/cursor 校验。
- 回归 guard：新增篡改 immutable block 测试；已有连续 cursor、缺块、compaction、并发 read-ahead 和旧缓存兼容测试继续保留。
- 验证结果：Cache v2 测试 15/15；Cache module、Cache test `node --check`；最终全量 Ghostty、Go、runtime 回归需继续通过。
- 已知风险：旧缓存块不会自动变成已验证块，需自然重写或 compaction；Fast 裸 binary output 仍无 sequence/checksum envelope。
- 禁止复现：不得只检查 chunk 长度而跳过已有 checksum；不得在 checksum mismatch 后继续向 replay/Terminal 提供数据；不得将旧无 checksum chunk 标记为 checksum 已验证。

### 2026-08-25：终端总览后台会话退化为无预览

- 来源：用户现场反馈；终端总览始终只有当前 tab 显示预览，切换后原 tab 立即变为“无预览”。
- 根因：tab 切换前虽然通过 `preserveTabTerminalFrames()` 保存了最后有效 Canvas，但总览从未读取 `terminalFrameHold`。cache-v2 后台 pane 又被明确禁止使用 live Canvas，只允许异步持久化 preview；preview 尚未捕获、加载或暂时不可用时因此没有任何可绘制来源。
- 实施方案：后台总览保持已验证 Cache v2 preview 为首选，缺失时使用切换前冻结的 held frame；当前 tab 仍优先使用 live Canvas。held frame 保存 selector、tab、pane、cache epoch、workspace identity 和 history generation，绘制前全部重新匹配；释放 frame 时同步清除身份。cache-v2 后台 pane 仍不允许退回可能继续变化或已经 stale 的 live Canvas。
- 安全边界：held frame 仅参与总览 Canvas 绘制，不参与 Ghostty 状态恢复、history replay、输入 readiness 或 cache manifest；pane 关闭、workspace/cache epoch 或 history generation 变化后旧帧不能复用。
- Guard：扩展 `TestRuntimeContainerCacheV2AndPWAContract` 和 `TestRuntimeTerminalCanvasResidueGuard`，固定总览 source 优先级、held frame 身份字段、保存/释放行为，以及 cache-v2 后台 live Canvas 禁用边界。
- 验证结果：`node --check runtime/static/main.js`、定向 runtime guard、`./scripts/test-terminal-live-preview.sh`（Cache v2 15/15）、`go test ./... -count=1` 和 `git diff --check` 通过；真实 Lazycat 桌面及移动端总览仍需视觉验收。
- 禁止复现：不得再次保存旧 tab 帧却不提供给总览；不得以放开后台 live Canvas 或放松 cache identity 校验修复空预览；不得让 held frame 跨 selector、workspace、tab、pane 或 history generation 展示。

### 2026-08-25：首次终端可见时间线与错误日志重复折叠

- 来源：用户反馈应用打开和首次终端显示体感略慢，需要区分页面初始化、workspace、连接、preview、PTY replay、Canvas 提交及输入 ready 的耗时，同时避免诊断日志刷屏。
- 实施方案：错误日志增加从模块启动开始保留的 startup trace，记录 Ghostty WASM、主题、设置、实例、workspace 请求/应用、cache manifest、WebSocket、replay 开始/完成、preview 准备、Terminal write、真实 Canvas 和输入 ready。所有时间使用相对模块启动毫秒；Terminal write 只在首次恢复至真实 Canvas 可见之间记录 payload 字节数与同步 write 耗时，不记录内容。预览 PNG capture 另行记录开始、完成、耗时和 Blob 大小，用于确认截图是否发生在首帧之后。重复日志不再静默丢弃，而是在同一 dedupe key 的一行显示 `xN`，第 2 次及每 10 次刷新 UI；达到 200 行后同步修正折叠索引。
- 安全边界：启动 trace 不记录账号 scope、token、cookie、PTY 内容或缓存字节内容；preview 只记录准备完成事件，不进入终端 readiness。诊断关闭时只保留有界 startup trace，普通 console/error 日志仍不采集。
- Guard：更新 `TestRuntimeConnectionStateDiagnosticsAndOneShotRevisionGuard` 固定 retained startup trace、重复计数和有界淘汰结构；既有 cache-v2 runtime guard 固定 startup 初始化仍并行执行。
- 验证结果：`node --check runtime/static/main.js`、定向 runtime tests、`go test ./... -count=1` 和 `git diff --check` 通过。真实宿主下一步根据日志中相邻阶段差值判断主要等待发生在 WASM、workspace/attach、cache/replay、write 还是 presentation。
- 禁止复现：不得为诊断同步读取缓存或终端内容；不得让日志渲染进入每个 PTY chunk 的热路径；不得用完全丢弃重复项替代可观察的折叠计数；不得让诊断事件成为终端状态来源。

### 2026-08-25：冷启动后台会话无法读取持久化总览预览

- 来源：用户现场反馈；会话预览在当前页面内切换后可以保留，但关闭窗口重新打开应用时，除当前会话外全部显示“无预览”，必须逐个打开后才恢复。
- 根因：后台 pane 在冷启动时尚未 attach，`historyGeneration` 为空；`loadPaneTabOverviewPreviewManifest()` 把非空 generation 作为读取 Cache API manifest 的前置条件，因此根本没有读取已经按 workspace/tab/pane 持久化的 preview。点击会话后 replay 填入 generation，加载入口才放行，形成“必须访问一次”的假象。
- 实施方案：冷启动未 attach pane 使用完整 account scope、selector、workspace generation、tab 和 pane identity 读取 pane-level 当前 manifest，并采用 manifest 中已提交的 history generation 验证 preview 路径、cursor 和图片记录。若 pane 已通过 replay 获得 history generation，则 manifest、prepared preview 和异步 decode 完成检查全部恢复严格 generation 相等；generation 从空变为已知且不匹配时拒绝并关闭旧图片。
- 安全边界：没有放宽跨账号、selector、workspace、tab 或 pane 身份；未知 generation 只允许读取该精确 pane 的当前 manifest，不能按最近记录或 pane ID 模糊查找。preview 仍只用于总览，不能参与 Ghostty replay、输入 ready 或终端状态恢复。
- Guard：更新 `TestRuntimeContainerCacheV2AndPWAContract`，明确禁止恢复 `!historyGeneration` 早退，固定 pane-level manifest lookup、可选 generation identity check，以及 decode 完成后“generation 已知则严格相等”的 stale guard。Cache v2 15 项测试继续覆盖完整身份隔离和跨 generation 拒绝。
- 验证结果：`node --check runtime/static/main.js`、`./scripts/test-terminal-live-preview.sh`（Cache v2 15/15）、`go test ./... -count=1` 和 `git diff --check` 通过；真实宿主需关闭窗口后重新进入，确认未打开的后台会话立即显示上一轮持久化预览。
- 禁止复现：不得要求后台 pane 先 attach 才允许读取其精确 pane manifest；不得把未知 generation 当成任意 generation 的模糊缓存查询；一旦服务端 generation 已知，不得继续展示不同 generation 的旧 preview。

### 2026-08-26：降低终端滚动历史默认值

- 来源：用户反馈默认历史回放较慢，首次打开或重连时等待时间较长。
- 实施方案：前端和服务端默认 `terminal_scrollback` 从 5000 行统一调整为 1000 行；已有设置文件中的合法值不迁移、不覆盖，仅新安装、缺失/非法设置和“恢复默认”使用 1000 行。滚动历史仍按约 350 bytes/行换算为服务端和浏览器缓存的字节上限，因此默认回放数据量约降至原来的五分之一。
- 兼容边界：用户主动保存的 5000 行或其他合法值继续保留；设置变更仍会使不匹配的本地历史缓存失效并按新的 history window 重建，避免旧范围与新设置混用。
- 回归 guard：`internal/pkg/fonts/store_test.go` 固定默认值为 1000 且验证升级读取已有 5000 行设置不变；`TestRuntimeTerminalScrollbackSettingPersistence` 固定前端默认值；现有服务端 workspace/agent 参数测试继续覆盖设置值向 PTY 传递。
- 历史重放提速方向：默认值调整直接减少 snapshot 和 Cache v2 replay 的字节量；进一步优化应优先使用启动 trace 分解 WASM 初始化、workspace/attach、网络传输、Cache read、Ghostty parser/write 和最终 render 的耗时，再针对最大阶段做增量回放、首屏 checkpoint 或批量解析，不能跳过 cursor/generation 校验或在 replay 中恢复为无界全量加载。
- 验证结果：`go test ./... -count=1`、`go test -race ./...`、`node --check runtime/static/main.js`、81 项 Cache/连接/Queue/拓扑/resize Node 测试和 `git diff --check` 通过；真实设备需比较升级前后冷启动、断线重连和 1000/5000 行用户设置的回放耗时。
- 禁止复现：不得通过升级直接覆盖已有用户的滚动历史设置；不得只修改前端默认而遗漏服务端默认；不得把 1000 行误解为严格物理行数，实际容量仍是按字节近似；不得为了提速取消历史身份、cursor 连续性或最终完整渲染校验。

### 2026-08-26：限制 resize 期间的同步输出峰值并统一渲染 suppression

- 来源：用户反馈 pi/Codex 等 TUI 在快速拖拽窗口或调整字号后终端卡死，同时历史恢复和 resize 期间仍可能看到快速变化的中间画面。
- 根因：resize fence、resize settle、Cache warm replay 和队列完成路径存在多个 `flushSessionOutput(session, { force: true })`，可能在一个主线程任务中同步排空大量 PTY/TUI 输出；resize ACK 前后的输出边界也没有使用有界 drain 明确分开。Ghostty 的旧 `writeReplay()` 只抑制部分写入触发的 render request，`Terminal.reset()` 的 `renderer.clear()`、`renderNow()`、render RAF 仍可能绕过 replay 的可见性边界。
- 实施方案：前端新增 resize 专用 64 KiB flush budget，并让 `flushSessionOutput()` 支持 byte/entry 上限和排空结果；resize fence 在发送请求时冻结 ACK 前队列条目边界，只在旧 geometry 下分批排空该前缀，之后切换本地 geometry，ACK 后输出留在 resize settle 队列中按预算处理。settle barrier 也使用冻结前缀，持续 live output 不会让 barrier 永久等待。新增 `forceFlushBytes`、`forceFlushPeakBytes` 和 force flush 耗时指标。终端事件的 identity、generation、cursor、resize、replay、presentation 和队列边界详情同步进入调试错误日志；事件仍按既有 dedupe 规则折叠，不记录 PTY 内容、命令文本或票据。
- Ghostty 保护：增加嵌套的 `beginRenderSuppression()`/`endRenderSuppression()`。suppression 期间保留 pending full render，但阻止 RAF 和 `renderNow()` 触碰 renderer；`reset()` 不再直接清空 Canvas。WebShell 在 history replay reset、deferred resize 和最终 replay commit 之间维护 suppression transaction，保留现有 `Terminal.write()` 同步语义和 cursor/generation barrier。
- 安全边界：该修复只限制客户端解析/呈现峰值，不暂停或销毁服务端 Agent/PTY/session，不改变 Queue payload、Fast envelope、服务端 history 权威性或 Cache v2 identity。旧协议继续走兼容路径；如果新 Ghostty suppression API 不可用，WebShell 仍保留原有 `writeReplay()` fallback。
- 回归 guard：更新 `runtime_shortcuts_test.go`，固定 resize 输出预算、ACK 前缀分批排空、resize transition suppression 和 replay reset suppression；新增 Ghostty `Terminal` 测试覆盖嵌套 suppression 下 renderer 不被调用以及 suppression 释放后可执行最终 render。
- 验证结果：`node --check runtime/static/main.js`、根仓库 `go test ./... -count=1`、终端 Node 测试 33/33、Ghostty `bun run typecheck`、`bun test lib/terminal.test.ts`（155/155）和 `git diff --check` 通过。尚待真实桌面浏览器、Lazycat WebView、pi/Codex 持续输出、快速 resize 和字号调整手测。
- 禁止复现：不得将 resize 期间的 force flush 恢复为无界同步排空；不得把 ACK 后新输出按旧 geometry 解析；不得在 replay/resize suppression 期间调用 renderer.clear/renderNow 绕过 gate；不得把 suppression 或旧帧保护误当作服务端 session 保活机制；不得通过清空 PTY、重建 Agent/session 或丢弃历史掩盖卡死和重放问题。

### LCMD-20260826-01：发布构建每次重建并同步 Ghostty WASM

- 日期：2026-08-26
- 来源：用户要求；发布流程审计发现 `lzc-build.yml` 原先只执行 `tools/sync-ghostty-web-assets.sh --check`
- 影响模块：`lzc-build.yml`、`tools/sync-ghostty-web-assets.sh`、`runtime/static/ghostty-vt.wasm`
- 错误现象：直接执行 `lightos-build.sh` 时虽然会从当前源码重建并比较 WASM，但不会更新 `runtime/static/ghostty-vt.wasm`；发布包可能继续携带旧的 WASM。只修改 `ghostty-web` 源码后，发布流程无法保证随包 WASM 一定来自本次源码构建。
- 根因：`--check` 的职责是校验，不会复制重建产物；构建脚本在打包前只调用了该校验模式。
- 实施方案：新增 `--rebuild-wasm-only`，每次执行 `bun run build:wasm`，确认源产物存在后复制到 `runtime/static/ghostty-vt.wasm`，再执行核心 section 校验。`lzc-build.yml` 改为在每次 LPK 构建时调用该模式。该模式只更新 WASM，不覆盖 `runtime/static/ghostty-web.js`，以保留 WebShell 的历史定制 bundle；原有 `--rebuild-wasm` 仍用于有意同时同步 JavaScript 和 WASM 的场景。
- Guard：更新 `TestBuildWritesPackageVersionForRuntimeAssets`，固定 LPK buildscript 必须调用 `--rebuild-wasm-only` 且不得调用 `--check`；更新 Ghostty 资产同步脚本契约，固定新模式存在、执行 `build:wasm`、复制 WASM 并保留定制 JavaScript。
- 验证结果：本次执行 `node --check runtime/static/main.js`、相关 Go 测试、shell 语法检查和 `git diff --check`。
- 禁止复现：发布构建不得只校验而不更新 WASM；不得让 WASM 更新模式覆盖 WebShell 定制 `ghostty-web.js`；不得在 WASM 构建失败或未生成产物时继续打包。

### LCMD-20260826-02：Ghostty suppression bundle 使用未定义变量导致终端黑屏

- 日期：2026-08-26
- 来源：用户现场错误日志；`writeReplay()` 收尾时报 `Uncaught ReferenceError: render is not defined`
- 影响模块：`runtime/static/ghostty-web.js` 的 `endRenderSuppression()`、历史 replay 和终端 presentation
- 错误现象：终端打开后一直黑屏。历史或队列输出进入 `writeReplay()` 后，在 `endRenderSuppression()` 中抛出异常，后续 flush 和最终 Canvas presentation 无法完成。
- 根因：TypeScript 源码中的参数已被压缩器重命名为 `A`，但随包定制 bundle 的函数体仍引用原参数名 `render`；该错误只在实际运行 `endRenderSuppression()` 时暴露，静态语法检查无法发现。
- 实施方案：修正随包 `runtime/static/ghostty-web.js`，使压缩后的 `endRenderSuppression()` 使用参数 `A`；保留 TypeScript 源码现有正确实现。新增发布资产 guard，直接检查随包 bundle 中的压缩变量引用，避免只验证源码而遗漏定制运行时 bundle。
- Guard：`TestRuntimeTerminalCanvasResidueGuard` 固定 bundle 中 `endRenderSuppression()` 使用 `A`、检查 suppression 深度和最终 render 条件；现有 replay、resize suppression 和 Ghostty 单元测试继续覆盖正常渲染路径。
- 验证结果：`node --check runtime/static/ghostty-web.js`、`node --check runtime/static/main.js`、`go test ./... -count=1`、shell 语法检查和 `git diff --check` 通过。

### LCMD-20260826-03：高频输出触发 Queue 无界排空与大消息误重同步

- 日期：2026-08-26
- 来源：用户反馈；高频输出或单次提交块过大时终端右上角出现红点、输出短暂停止，移动端更容易复现；切换并聚焦其他会话时旧会话也可能短暂停止后恢复。
- 影响模块：`runtime/static/main.js`、`terminal_queue.go`、`workspace.go`、对应 Go/runtime guard。
- 根因：Queue `queue-turn-complete` 到达后，浏览器调用 `flushSessionOutput(session, { force: true })`，在单个 WebSocket message task 内无界执行 Ghostty/WASM 输出处理，导致移动端主线程长任务延迟 Queue ACK、后续 WebSocket 事件、输入和连接调度。另一个路径先按整条消息大小判断 4 MiB 上限，合法的大消息尚未拆分就触发 history replay，导致正常的短时背压被误报为 reconnecting。
- 实施方案：浏览器输出 drain 增加 byte、entry 和 time budget；Queue turn 只登记待确认 cursor/sequence，输出按序进入 Ghostty 且队列排空后才发送 ACK，ACK 不等待 Canvas 绘制。合法大消息先按现有 replay/live batch 拆分，4 MiB 仅保护累计队列内存。Agent replay 和 Queue binary payload 最终采用 512 KiB 分片，以兼顾隐藏 replay 的追赶速度；Queue 分片保持 cursor、sequence、history generation 和 checksum 连续。现有 Queue turn ACK 提供第一阶段兼容背压，modern credit/consume confirmation 和 Fast 对等流控留待指标证明需要后继续实施。
- 安全边界：不改变 Queue `LCQ1`、Fast 原始 payload、legacy/旧 Agent fallback、persistent Agent/PTY、服务端 history 或 Cache v2 权威归属；分片入队失败时不推进未入队数据的浏览器 cursor；错误日志不记录 PTY 内容、命令文本或凭据。
- 回归 guard：`TestTerminalQueueBinaryPayloadIsSplitIntoContinuousFrames` 验证 Queue binary frame 不超过 512 KiB 且 cursor/sequence 连续；`TestAgentHistoryReplayUsesBoundedChunks` 验证 Agent replay 大块拆分；`TestRuntimeTerminalOutputBatchingGuard` 固定 byte/entry/time drain、pending Queue ACK、合法大消息拆分和禁止 Queue turn 无界 force flush。
- 验证结果：`node --check runtime/static/main.js`、相关 Queue/Agent/runtime 定向测试通过；完整 Go、Node 终端回归和真实桌面/移动端高输出、Queue ACK、切 tab 场景仍待执行和手动验收。
- 禁止复现：不得在 Queue turn 回调中恢复无界 `flushSessionOutput(..., { force: true })`；不得因为合法单消息较大直接请求 history replay；不得在 Ghostty 尚未按序解析 turn 数据前发送 ACK；不得通过关闭 PTY/session、清空 history 或丢弃输出掩盖背压。

### LCMD-20260826-04：resize/replay 事务间中间帧泄漏且回放吞吐过低

- 日期：2026-08-26
- 来源：用户手动验收；初次进入终端通常不明显，但 resize 或字号变化后会看到明显历史重放；回放期间再次 resize 会立即隐藏中间画面并跳到最新底部。
- 影响模块：`runtime/static/main.js`、输出流控参数、replay/resize presentation suppression。
- 根因：本轮输出流控第一批把 replay chunk 从 256 KiB 降到 64 KiB，并把默认 drain entry 限制为 1，合法 replay 的解析速度明显下降，使 resize 触发的 TUI 输出更容易在浏览器中形成长时间可见的逐块变化。更重要的是，原 presentation 门禁只在单次 `writeReplay()` 或本地 `term.resize()` 临界区生效；replay start 到 replay commit、resize fence 到 resize output settle 之间没有持有跨 task 的统一 suppression。多个流程共用一个布尔状态时，replay 与 resize 并发还可能互相提前释放门禁。第二次 resize 恰好重新建立 hold/suppression，因此会掩盖第一轮门禁泄漏并立即显示最新画面。
- 实施方案：`history-replay-start` 建立持续到 replay commit 的 `replay` suppression；resize fence 建立持续到 resize output settle 完成的 `resize` suppression；WebShell wrapper 以 reason set 管理两个独立 owner，只有全部 owner 释放后才调用 Ghostty end suppression。legacy resize 也纳入同一 `resize` suppression 生命周期。replay batch、Agent history replay chunk 和 Queue binary payload 恢复为 512 KiB，live output 仍使用较小 byte/time budget，避免把保护门禁与 live 交互延迟混为一谈。失败、detach、重连和 settle 清理路径按对应 reason 释放，避免黑屏或永久隐藏。
- 安全边界：suppression 只延迟 Canvas presentation，不停止 PTY、不丢 history、不推进 cursor/ready；Queue `LCQ1`、Fast payload 和 legacy 协议不变；replay 仍必须按序完成后才能 commit，Canvas 不参与 Queue ACK。
- 回归 guard：扩展 runtime guard 固定 reason-based suppression、replay/resize 生命周期、legacy resize suppression 和 512 KiB replay budget；保留 Queue/Agent 分片连续性、presentation gate、resize fence 和 Ghostty suppression 测试。
- 验证结果：`node --check runtime/static/main.js`、`go test ./... -count=1`、终端 Node 92/92、`git diff --check` 和 `/home/ponzs/Desktop/os-dev/lightos-build.sh` 构建验证已通过；本地 WebShell LPK 为 `dist/local-lcmd-webshell.lpk`，LightOS Admin LPK 为 `../lightos-admin/dist/cloud.lazycat.lightos.entry-v0.3.57-229.lpk`。用户手动验收必须重新覆盖初次进入、resize、字号变化、pi、Codex、持续输出和第二次 resize。
- 禁止复现：不得只提高 replay 上限而释放中间 Canvas；不得只依赖单个 `writeReplay()` 的局部 suppression；不得让 replay 或 resize 任一流程提前释放另一流程的 suppression；不得把第二次 resize 的即时恢复当作第一轮实现正确的依据。

### LCMD-20260826-05：不存在的容器仍进入 agent 安装启动循环

- 日期：2026-08-26
- 来源：LightOS 客户日志；persistent agent pre-install ping 已返回 `container does not exist`，但仍继续执行 agent install、daemon reconcile 和 readiness ping。
- 影响模块：`agent_runtime.go` 的 persistent agent ensure 流程。
- 错误现象：Debian 实例已停止或被删除时，WebShell 请求反复触发针对不存在容器的管理操作，持续产生 `nsenter`、`runc state` 和 agent 安装失败日志。
- 根因：首次 pre-install ping 的错误没有区分“临时 agent 故障”和“目标容器不存在”；后者仍沿用普通恢复路径，继续安装并启动 agent。
- 实施方案：新增 `isContainerUnavailableError`，仅当错误明确包含 `container does not exist` 时，在 `ensurePersistentAgentOnce` 中立即返回，跳过安装、daemon reconcile 和启动就绪轮询。其他 agent/网络临时错误继续使用原有自动恢复路径。
- 回归 guard：`TestContainerUnavailableErrorStopsAgentEnsure` 验证错误分类边界；`TestEnsurePersistentAgentStopsBeforeInstallForMissingContainer` 固定不可用判断位于 agent 安装调用之前。
- 验证结果：`gofmt`、`go test ./...`（项目根目录）和 `git diff --check` 通过；未修改前端、Queue 协议或 LightOS 生命周期配置。
- 禁止复现：收到明确的 `container does not exist` 后不得继续安装、启动或 readiness 重试；普通临时 agent 故障不得被该判断一并终止。

### LCMD-20260826-06：冷启动后台黑色 Canvas 覆盖已有终端预览

- 来源：用户反馈；退出 WebShell 后重新进入时，已有终端预览先正常显示，随后被此前从未打开过的终端黑色预览覆盖。
- 影响模块：`runtime/static/main.js` Cache v2 预览捕获与终端总览。
- 根因：后台 Queue pane 在历史回放完成后会立即安排 PNG 捕获；捕获门禁只验证 Canvas 已有尺寸和 replay/cache cursor 状态，没有验证 Canvas 是否经过真实 full render/presentation。Ghostty 初始化产生的纯背景 Canvas 因此被当作合法新预览保存，原有 last-known-good 预览被原子替换。
- 实施方案：新增当前呈现帧门禁，要求 `hasPresentedFrame`、fit/replay/content generation、presented history cursor 与当前状态一致，且 Canvas 尺寸匹配；截图编码前后再次校验 render generation、content generation 和 presented cursor。未打开或未真实更新的后台 pane 不得写入 preview，Cache v2 继续保留旧预览；真实呈现的合法全黑终端仍允许保存。
- 回归 guard：`TestRuntimeTerminalCanvasResidueGuard` 固定预览捕获必须经过 `sessionHasCurrentPresentedFrame`、`hasPresentedFrame`、presented cursor 和 render generation 校验；既有 Cache v2 测试继续覆盖旧预览在 append 后保留及身份隔离。
- 验证结果：`go test ./... -run TestRuntimeTerminalCanvasResidueGuard -count=1`、`node --test terminal_cache_v2_test.mjs`（17/17）、`node --check runtime/static/main.js` 和 `git diff --check` 通过；现场需覆盖冷启动、未打开后台 pane、打开后首次真实渲染、合法全黑终端和 Agent 持续输出场景。
- 禁止复现：不得仅按 Canvas 尺寸或像素颜色判断预览有效；不得让未呈现的初始化黑帧覆盖旧图；不得因保留旧预览而放宽账号、workspace、tab、pane 或 history generation 身份校验。

### LCMD-20260826-07：快速切换 tab 时视觉状态被终端初始化阻塞

- 日期：2026-08-26
- 来源：用户手动验收；连续快速点击 tab 时，tab 栏选中状态和 pane 可见性存在明显拖延，体感上要等待目标终端初始化后才完成切换。
- 影响模块：`runtime/static/main.js` tab 激活流程、`runtime/static/tab_activation_scheduler.js`、Service Worker 资产清单和运行时 guard。
- 错误现象：点击 tab 后虽然代码已修改 `.active`，但浏览器迟迟不能绘制该状态；终端较多、目标 pane 尚未测量或连接拓扑需要 Fast/Queue handoff 时更明显。
- 根因：`setActiveTab()` 在同一个事件任务内继续同步执行 Canvas held-frame 处理、所有 pane 光标状态同步、立即 resize/fit、presentation 恢复、连接需求遍历和拓扑布局读取。DOM 选中态只有在整个长任务返回后才能绘制，因此被终端初始化工作间接阻塞；连续点击还会为已经切走的中间 tab 重复执行初始化。
- 实施方案：保留切走前 last-known-good frame 的同步保护，随后立即只更新目标/前一 tab 的可见性、选中 class、ARIA、通知和基础激活状态。新增模块化 latest-only tab activation scheduler，把 pane 状态/focus、resize/presentation、连接拓扑和服务端 activate action 拆成三个跨 frame/task 的阶段；每次点击递增 generation 并取消旧 frame/timer，阶段执行前还校验 instance generation、active tab ID 和 tab 对象身份。延迟 focus 同样校验当前 tab/pane，防止旧回调抢回输入焦点。`activate_tab` 按 workspace generation 串行持久化，跳过尚未发送且已经失活的 tab，并禁止其响应重新执行完整 workspace apply，避免旧响应回滚 optimistic UI；已经在途的旧请求之后必然跟随最终 tab 请求，保证服务端最终状态顺序。
- 安全边界：异步化只调整浏览器 UI 和初始化调度，不改变服务端 workspace/tab/session 权威状态，不销毁 PTY/history，不修改 replay、Queue/Fast envelope、cursor 或 ACK 语义；held frame 仍在隐藏旧 pane 前建立，历史 replay 仍受现有 suppression gate 保护。
- 回归 guard：`tab_activation_scheduler_test.mjs` 覆盖首阶段必须跨过 frame 和 task、快速切换 latest-only、阶段间主动 yield 和 cancel；`TestRuntimeTerminalCanvasResidueGuard`、`TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs` 固定视觉提交顺序、禁止同步 immediate resize、instance generation fencing、延迟 focus fencing、`activate_tab` 串行 optimistic 持久化和 Service Worker 预缓存。
- 验证结果：`node --check runtime/static/main.js`、`node --check runtime/static/tab_activation_scheduler.js`、scheduler Node 4/4、完整终端 Node 96/96、`go test ./... -count=1` 和 `git diff --check` 已通过；用户已完成目标环境手动验收，快速切换 tab 的状态响应符合预期。
- 禁止复现：不得把 resize/fit、连接拓扑重排或服务端 action 放回 tab 点击的同步视觉阶段；不得让已失活 tab 的 generation 继续 focus、resize 或覆盖连接需求；不得为了切换速度跳过 held frame 或放宽 replay presentation gate。

### LCMD-20260826-08：鼠标接近右侧时滚动条无法稳定拖拽

- 日期：2026-08-26
- 来源：用户反馈；终端滚动条过窄，鼠标接近右侧时难以准确抓住并拖动。
- 影响模块：`ghostty-web/lib/renderer.ts`、`ghostty-web/lib/terminal.ts`、`runtime/static/ghostty-web.js`。
- 错误现象：终端滚动条默认视觉宽度较窄，尤其在指针从终端内容区靠近右侧时，命中窗口小，拖拽容易落到文本选择或其他终端交互上。
- 根因：滚动条绘制宽度与鼠标命中范围固定，未利用用户已经接近右侧这一明确意图，也没有为宽度变化提供过渡状态；运行包中的定制 bundle 使用了约 3px 的绘制宽度。
- 实施方案：保留 3px 默认视觉宽度，增加 24px 右侧感应区。指针进入感应区后，滚动条在 160ms 内使用缓出动画平滑展开到 8px，右边缘保持固定并向左扩展；离开终端后反向收回。鼠标命中和拖拽按最大 8px 范围处理，触摸滚动继续保留现有 18px 命中范围；动画在释放拖拽、离开和销毁时可取消。Canvas 清理跟随当前绘制宽度，宽度过渡期间执行完整重绘，避免黑色区域和收回残影。
- 回归 guard：`CanvasRenderer > Scrollbar hover sizing` 固定 3px 默认、5.5px 中间值和 8px 展开值；`TestRuntimeTerminalCanvasResidueGuard` 固定感应区、动画参数、源码/运行 bundle 的展开 API、最大命中区域和离开收回路径。
- 验证结果：`bun run typecheck`、`bun test lib/renderer.test.ts`（10/10）、`node --check runtime/static/ghostty-web.js`、`node --check runtime/static/main.js` 和 `git diff --check` 通过。尚未在真实桌面浏览器及 Lazycat WebView 进行鼠标/触摸视觉验收。
- 禁止复现：不得只加宽绘制而保留窄命中区域；不得在动画中改变终端 Canvas 尺寸、列数、行数或滚动比例；不得无条件按最大展开宽度清理并覆盖终端内容；宽度过渡必须完整重绘以恢复旧区域；不得让滚动条 hover 动画进入触摸滚动或其他设置面板滚动条路径。

### LCMD-20260827-01：调试模式增加强制 PC 模式

- 日期：2026-08-27
- 来源：用户需求
- 影响模块：`runtime/static/index.html`、`runtime/static/main.js`、`runtime/static/style.css`
- 错误现象：移动设备打开 WebShell 时，界面和交互会按触摸设备切换为移动端；调试场景缺少在同一设备上统一复现 PC 端布局和交互的选项。
- 根因：移动端分支由现有顶层布局判断和 CSS 媒体查询共同控制，缺少独立的调试模式覆盖状态。
- 实施方案：在调试选项中新增默认关闭的“强制 PC 模式”，使用独立 localStorage 保存；开启且调试总开关有效时，现有 `isMobileLayout()` 和 `isTouchShortcutLayout()` 统一返回 PC 结果，并通过根节点样式覆盖媒体查询改变的头部、设置、附件、总览和底部区域布局。切换时复用已有终端 resize 和视图刷新；原有“允许移动端启用远程桌面”选项及其独立状态保持不变。
- Guard：`TestRuntimeForcePCModeOverridesTopLevelLayoutChecks` 固定两个调试选项同时存在、强制模式默认读取关闭且持久化、顶层布局判断和根节点样式覆盖；`node --check runtime/static/main.js`、`git diff --check` 固定资源语法和空白契约。
- 验证结果：`go test ./... -count=1`、`node --test terminal_cache_v2_test.mjs terminal_resize_scheduler_test.mjs terminal_connection_scheduler_test.mjs terminal_queue_connection_test.mjs terminal_topology_controller_test.mjs`（81 项通过）、`node --check runtime/static/main.js`、`node --check runtime/static/service-worker.js` 和 `git diff --check` 通过；真实 Android WebView、iOS WebView 和触摸桌面浏览器仍需按设置切换、终端输入、滚动、选择、弹层、设置窗口、文件管理和终端尺寸变化步骤复验。
- 禁止复现：不得删除或复用移动远程桌面开关；不得把强制 PC 逻辑散落到各个移动交互实现中；不得让强制模式默认开启；不得清除用户保存的强制模式状态或移动远程桌面状态。

### LCMD-20260827-02：鸿蒙迭代器兼容性导致终端连接调度崩溃

- 日期：2026-08-27
- 来源：鸿蒙设备运行日志
- 影响模块：`runtime/static/terminal_connection_scheduler.js`
- 错误现象：页面初始化完成后，终端连接拓扑阶段抛出 `records.values(...).some is not a function`，终端持续出现 `render_blocked`，无法显示内容。
- 根因：`Map.prototype.values()` 返回的是迭代器；当前 Node 测试环境提供了 Iterator Helpers，因此 `.some()` 未暴露问题，但鸿蒙运行时的迭代器没有该方法。
- 实施方案：将 `records.values().some(...)` 改为 `Array.from(records.values()).some(...)`，只依赖通用的迭代器协议，保持连接调度和容量逻辑不变。
- 回归 guard：`terminal_connection_scheduler_test.mjs` 新增“scheduler does not require iterator helper methods”，测试中主动替换 `Map.prototype.values()` 为不带 Iterator Helpers 的兼容迭代器；同时运行完整 Node 终端调度测试和 Go 测试。
- 验证结果：`node --test terminal_connection_scheduler_test.mjs terminal_cache_v2_test.mjs terminal_resize_scheduler_test.mjs terminal_queue_connection_test.mjs terminal_topology_controller_test.mjs`（82 项通过）、定向 Go runtime guard、`node --check runtime/static/terminal_connection_scheduler.js` 和 `git diff --check` 已通过；鸿蒙设备仍需重新进入 WebShell，确认连接拓扑完成、终端首帧和持续输出正常。
- 禁止复现：不得直接对 `Map`/`Set` 的 iterator 调用 `.some()`、`.filter()`、`.map()` 等 Iterator Helpers；跨 WebView、鸿蒙和旧浏览器的集合遍历必须使用 `Array.from(...)` 或普通 `for...of`。

### LCMD-20260827-04：Android 豆包确认英文后退格无法连续删除

- 日期：2026-08-27
- 来源：用户复现；英文处于预编辑状态时可连续删除，确认后末尾出现一个空格，长按退格最多删除一个字符后停止。
- 影响模块：`runtime/static/main.js` 的 helper textarea、post-composition 去重和 Android `beforeinput`/`input` 事件链。
- 根因：预编辑期间 textarea 由 Android IME 原生维护，里面有整段预编辑文本，所以长按删除始终有可编辑内容。确认后 WebShell 把 textarea 缩减为一个零宽哨兵；第一次退格删除这个唯一字符后，原生编辑缓冲到达起点，Android/豆包便停止本次长按自动重复。WebShell 每次重新聚焦或同步又补回一个哨兵，因此表现为“每次重新长按只能删一个”。确认后的空格是豆包在英文 composition 提交后独立派发的候选确认分隔符，原有 post-composition 去重只识别重复提交文本，未识别该分隔符，所以空格被发送到了 PTY。
- 实施方案：把单字符哨兵改为 256 个零宽字符组成的原生删除缓冲区；这些字符会被现有 strip 逻辑全部剥离，不会进入 PTY。`terminal-host` 在 capture 阶段统一接管 helper textarea 的 `beforeinput`，确保比 Ghostty 原始同元素监听器更早消费事件。确认态后退删除在 `beforeinput` 阶段发送一个 `\x7f`，但保留原生 textarea 删除，不调用 `preventDefault()`；删除保持期间，`positionTerminalInput()`、`input` 和布局同步不得重写 textarea。连续删除事件每次延长保持窗口，约 900ms 无新删除后才一次性补满缓冲区，以覆盖 Android 长按从首个删除到自动重复开始的延迟；`input` 事件只作为没有 `beforeinput` 时的兜底并避免重复发送。composition 态仍交给 IME。英文 composition 提交后的 350ms post-composition 去重窗口额外识别一次独立 ASCII 空格，无论它在 `beforeinput` 是否仍标记 composing，都只作为候选确认分隔符消费；窗口外的普通终端空格不受影响。
- 回归 guard：新增 `TestRuntimeTerminalConfirmedIMEDeleteUsesNativeMutation`，固定 256 字符删除缓冲、后退删除分支位于通用 composing 分支之前、删除路径不得调用 `preventDefault()` 或重写 textarea、必须使用删除保持定时器和 `\x7f` 输出，并固定 host capture 先于 Ghostty 同元素监听器接管 `beforeinput`。
- 验证结果：已通过 JavaScript 语法检查、相关 Go runtime guard 和 `git diff --check`；真实 Android WebView/豆包输入法仍需复验英文确认、确认后的空格、长按退格连续删除和中文预编辑删除。
- 禁止复现：确认态长按删除不得每次立即重写 textarea 哨兵；不得让页面 capture 与 Ghostty `InputHandler` 同时消费同一 `beforeinput`；不得以全局删除空格破坏用户在终端中输入的真实空格；不得破坏中文预编辑的原生 composition mutation。

### LCMD-20260828-01：普通容器终端物理连接收敛为 Unified transport

- 日期：2026-08-28
- 来源：用户确认统一单长连接方案；折叠屏展开/收起后全部 WebShell 会话黑屏的故障范围分析。
- 影响模块：`terminal_queue.go`、`main.go`、`runtime/static/main.js`、`terminal_queue_connection.js`、新增 `terminal_unified_connection.js`、Network Monitor、Service Worker 和连接协议测试。
- 错误现象与架构问题：此前普通容器使用 `1 Fast + 1 Queue` 两条页面级物理 WebSocket。虽然大多数 pane 已通过 Queue 复用，活动 pane仍需要独立 Fast transport；Fast close、Queue 保活、promotion、topology epoch 和页面恢复共同参与状态迁移。移动 WebView 或折叠屏生命周期导致 Fast 短暂异常时，故障可能被升级成全拓扑恢复，使所有 pane同时进入 replay/presentation hold 并表现为集中黑屏。
- 根因：物理 transport 角色与 logical pane 优先级耦合。活动 pane的低延迟需求被实现成单独物理连接，而不是同一复用连接内的输入权限和调度优先级；因此 Fast/Queue 各有连接和恢复状态，tab/pane交接还要跨 channel generation。
- 实施方案：Provider 现有 Queue broker 新增 `unified` role，复用 `LCQ1`、per-pane cursor/sequence/checksum、持续 agent drain、有界缓冲、turn ACK 和独立 resync，同时允许最多 1024 个 logical stream 发送普通输入；每个输入继续校验 pane/stream/channel generation 并经 stream 的串行 agent frame writer。新增 `set-priority` 提示，Provider 按优先级和稳定 order 排序每轮，但每个 pane仍受既有 byte/time budget 限制。浏览器新增 `UnifiedTerminalConnection`，在普通容器迁移态让原 Fast/Queue logical stream 共享同一 connection object 和唯一 `transport_role=unified` WebSocket；Queue gate 关闭时只移除 Queue logical stream，不关闭健康 Unified socket。Network Monitor 新增只含“统一通道”的单槽布局，Service Worker 预缓存新模块。`visibilitychange`、window focus 和 `pageshow` 不再因唯一 Fast logical owner 短暂缺失调用 page-wide `invalidateTransport/transportFailure`，只对不可用的 Unified owner 执行独立重试；纯 viewport/方向变化继续只处理 geometry 和 presentation。`client:` target 暂保留旧直连兼容路径。
- 安全边界：本阶段不删除成熟的 Fast/Queue logical replay、Cache v2、per-pane retry 和 presentation gate，只先合并物理故障域；同一 pane仍只有一个有效 generation 写入 Ghostty。历史 replay 继续完全隐藏；单 pane cursor/attach/overload 错误不得关闭统一物理连接；普通输入在身份不匹配时必须拒绝。旧 Queue/Fast 服务端角色继续兼容灰度客户端，同一页面只能创建一种物理 topology。
- 回归 guard：`terminal_queue_connection_test.mjs` 新增三个 logical pane 只创建一个物理 socket、普通 pane control 和 priority hint；`terminal_queue_test.go` 覆盖 unified 多 stream 普通输入和活动优先级不移除其他 pane；`terminal_network_monitor_test.mjs` 固定 unified 只有一个物理监视槽；`TestRuntimeTerminalConnectionSchedulerGuard` 和 Service Worker guard 固定 Unified 模块、共享 connection object、lifecycle 不得全 topology reset 与资源预缓存。
- 验证结果：`node --test *_test.mjs`（149/149）、`go test ./... -count=1`、`go test -race ./... -count=1`、相关 JavaScript 语法检查、`git diff --check` 和 `lzc-cli project release` 通过；已生成 `/home/ponzs/Desktop/os-dev/lazycat-microserver-webshell/cloud.lazycat.webshell.lcmd-v1.0.39.lpk`。真实 Android、鸿蒙和 Lazycat 折叠屏设备仍需验证三分屏持续输出、输入延迟、连续展开/收起及网络断线恢复。迁移后还需阶段性删除 Fast/Queue logical promotion/topology gate，并完成后台 tab 模型持续更新、仅可见 tab Canvas 绘制的最终架构。
- 禁止复现：普通容器不得为 Fast 和 Queue 创建两个不同的物理 WebSocket；不得因 Queue logical 成员为空关闭仍承载 Fast logical stream 的 Unified socket；不得把 priority hint 变成暂停后台 pane；不得为了单连接取消 per-pane cursor/generation/identity 校验或展示历史回放；`client:` 未完成协议升级前不得伪装为 unified。

### LCMD-20260828-02：Unified 首连和新增 pane 重试回调导致终端卡死

- 日期：2026-08-28
- 来源：用户真机调试日志；首次进入后创建新 tab/分屏，终端无法输入并且后续 pane 黑屏。
- 错误现象：Unified transport 冷启动时反复出现 `unified_transport_created_closed`，随后 `terminal_queue_connection.js` 抛出 `ReferenceError: connection is not defined`。修复第一处后，新 tab/分屏的 logical close 仍可能触发同样未定义变量，导致 Fast lease 卡在 closing，后续 pane 无法取得连接和输入状态。
- 根因：物理健康 watchdog 在 logical stream 尚未真正创建物理 WebSocket 时，把正常初始 `CLOSED` 当作故障并立即触发 topology recovery；物理错误回调还在连接对象完成初始化前引用 `api`。同时，logical close handler 将物理连接变量名写成未定义的 `connection`，并且 physical `error`、`close`、wrapper `closed.finally` 多条路径没有统一 owner-first 去重。
- 实施方案：Unified watchdog 只有在物理连接进入 `CONNECTING`/`OPEN` 后启动；固定每 4 秒检查、物理 ping/pong、12 秒 pong/状态迁移超时，健康 OPEN 不重试。`terminal_queue_connection.js` 使用延迟初始化的 API 引用，并在 physical close 时先通知 `onPhysicalClose` owner，再 fan-out logical close。`main.js` 捕获 `currentMultiplexedConnection`，由 `handleTerminalUnifiedPhysicalDisconnect()` 使用 WeakSet 只处理一次；异常恢复先建立旧 socket close fence，再以 scheduler `invalidateTransport(..., { immediate: true })` 清除 backoff并立即重建。新 tab/分屏的正常 logical handoff 不进入物理恢复，仍按原 lease/replay/输入就绪流程完成。
- 回归 guard：`terminal_unified_health_test.mjs` 覆盖 4 秒周期、健康 pong、CLOSED/缺失立即恢复、pong 超时、CONNECTING 超时、后台暂停和 ping 失败；`terminal_queue_connection_test.mjs` 覆盖物理 ping/pong、physical close owner-first、三 pane 单 socket；`terminal_connection_scheduler_test.mjs` 覆盖 immediate transport invalidation；`TestRuntimeTerminalConnectionSchedulerGuard` 固定 watchdog 只在真实 transport 建立后启动、物理 close owner、逻辑 close 使用 captured connection；静态资源 guard 固定 watchdog 进入 Service Worker。
- 验证结果：Node 全量 159/159（本次新增后定向 58 项通过）、`go test ./... -count=1`、`go test -race ./... -count=1`、JavaScript 语法检查、`git diff --check` 和 `lzc-cli project release` 通过。LPK 需要安装后重新验证首次进入、创建 tab、创建分屏、连续输入和物理断线复活。
- 禁止复现：不得在 socket 尚未由 logical stream 启动前把 `CLOSED` 当成异常；不得在模块 API 初始化前引用 wrapper 变量；不得让 physical error/close/finally 各自重建连接；不得让 logical handoff 误触发 physical recovery；不得在重试前清空 last-known-good frame、展示历史回放或丢弃 pane 的 cursor/generation。

### LCMD-20260828-03：移除普通容器 Fast/Queue logical topology

- 日期：2026-08-28
- 来源：Unified 单物理连接版本完成手动基础验收后，按执行计划进入旧逻辑迁移层退役阶段。
- 架构问题：物理连接虽然已经统一，但浏览器仍通过唯一 Fast lease、Queue gate、promotion、bootstrap phase 和 topology controller 决定 pane 何时加入同一 socket。tab/pane 聚焦仍会关闭一个 logical stream再建立另一个 logical stream，保留了旧双角色的状态数量和 handoff 故障面；新增 pane还要等待 Fast replay/Queue FIFO，与“全 workspace pane 常驻 Unified membership”的最终模型不一致。
- 实施方案：新增 `terminal_unified_membership.js`，按 target维护全 workspace pane registry。所有具有已知终端尺寸的 pane 始终作为 `unified` logical stream 注册；创建/关闭 pane才改变 membership revision，tab 切换、聚焦和输入只通过 `set-priority` 更新优先级。普通容器不再注册 connection scheduler lease，不再使用 Fast slot、promotion、Queue gate、Queue startup FIFO 或 topology reset；每个 pane独立分配 `unifiedStreamID`、channel generation 和 retry timer，logical resync只关闭并重建当前 pane。物理 error/close仍由唯一 Unified owner、watchdog 和 close fence恢复全部 membership。删除 `terminal_topology_controller.js` 及其测试，删除 Queue gate/task queue/startup latch 辅助代码；Network Monitor 只保留 `unified` 单槽和 `client:` `direct` 三槽。`client:` target 的三直连 scheduler保持兼容，不纳入本阶段协议升级。
- 安全边界：LCQ1、turn ACK、cursor、sequence、checksum、history generation、Cache v2、resize transaction、presentation gate和 persistent Agent/PTY 权威均保持不变；底层 `terminal_queue_connection.js` 名称仅表示沿用的 versioned wire implementation，不再表示浏览器 Queue logical role。历史 replay仍必须完整解析且只呈现最终帧；单 pane重同步不得关闭其他 pane或物理 socket。
- 回归 guard：新增 `terminal_unified_membership_test.mjs`，覆盖三 pane常驻、tab/focus 只改变 priority、不改变 revision、pane/target 增删和无尺寸 pane过滤；更新 `TestRuntimeTerminalConnectionSchedulerGuard`，禁止 `main.js` 和 Service Worker恢复 topology controller、Fast connection array、Queue connection/gate、promotion和 Queue channel，并固定 scheduler仅在创建 `client:` session时注册；删除旧 topology/FIFO测试。Unified connection测试继续固定多 pane单物理 socket、priority、owner-first close和 logical close保活。
- 验证结果：Node 全量 137/137、`go test ./... -count=1`、`go test -race ./... -count=1`、相关 JavaScript 语法检查、`git diff --check` 和 `lzc-cli project release` 已通过；新 LPK 的 `content.tar` 包含 `terminal_unified_membership.js` 且不再包含 `terminal_topology_controller.js`。目标设备创建/关闭多 tab/pane、单 pane resync和断网恢复仍需安装本包后验收。
- 禁止复现：普通容器不得重新引入 Fast/Queue membership角色、Fast lease/promotion、Queue gate/FIFO或 topology reset；不得因 tab/focus/input改变 logical membership；不得让单 pane retry关闭 Unified physical socket；不得把 `client:` 三直连兼容路径误用于普通容器。

### LCMD-20260828-04：Unified demand 路由条件丢失导致 main.js 无法加载

- 日期：2026-08-28
- 来源：用户安装 Fast/Queue logical topology 退役版本后，浏览器控制台报告 `Uncaught SyntaxError: Unexpected token ';' main.js:11122`，终端页面无法初始化。
- 错误现象：`syncTerminalConnectionDemands()` 中 `client:` scheduler 分支缺少 `if (isClientInstanceName(activeName)) {`，残留的右花括号提前结束函数；浏览器在后续 `};` 处停止解析，因此所有 WebShell 会话均未进入加载流程。
- 根因：将 connection scheduler 改为仅供 `client:` 懒创建时，精确文本替换误删了条件行但保留分支主体和右花括号。原静态 guard 只分别确认 scheduler 和 Unified 调用字符串存在，没有验证它们位于同一个完整函数内且调用顺序受 target 分支保护；`node --check` 又因文件外层异步回调的花括号被错误配平而未拦截该结构破坏。
- 实施方案：恢复 `if (isClientInstanceName(activeName))` 分支，使 `client:` 调用 `syncClientTerminalConnectionDemands()` 后返回，普通容器继续调用 `refreshTerminalUnifiedMembership()`。新增函数级 source boundary guard，固定 disposed gate、client target guard、client scheduler调用和 Unified membership刷新顺序；同时使用 `node --input-type=module --check` 和本机 Chrome加载静态模块验证浏览器解析。
- 回归结果：Node 全量 137/137、Go 全量、Go race、script/module 两种 Node 解析、Chrome实际模块加载和 `git diff --check` 均通过；已重新生成 `cloud.lazycat.webshell.lcmd-v1.0.39.lpk`，SHA-256 为 `f81cd330e5f2f464c4aa7b7bee3fe24c76c4e79125564d02b065b39c89ee7616`。
- 禁止复现：不得用零散字符串存在性代替函数结构验证；修改 target 分支或花括号后必须同时执行模块模式解析和浏览器解析；普通容器不得进入 client scheduler，`client:` target 不得落入 Unified membership路径。

### LCMD-20260828-05：Unified pong 状态回调形成空闲流量循环

- 日期：2026-08-28
- 来源：用户反馈所有会话静态、没有任务和输出时，Network Monitor 仍显示流量每秒快速增长。
- 错误现象：普通容器所有 pane 无输出时，统一 WebSocket 持续发送和接收大量 `queue-ping`/`queue-pong`，同时反复发送 `set-priority` 和订阅相关控制帧；流量与实际终端输出不匹配。
- 根因：Unified watchdog 的健康探针本应按 4 秒周期发送一次 `queue-ping`。Provider 返回 `queue-pong` 后，`terminal_queue_connection.js` 更新 `physicalLastPongAt` 并调用 `emitState()`；`main.js` 将每次状态回调中 `physicalReadyState === OPEN` 都误判为“刚打开”，立即再次 `probe("transport_open")`。于是形成无延迟的 `ping -> pong -> OPEN state callback -> ping` 循环。每次回调又会执行 Unified membership 同步，向每个 pane 重复发送 priority 控制帧。正常 4 秒保活本身只有极少字节，不能造成该流量量级。
- 实施方案：`queue-pong` 只更新时间戳，不再产生物理状态回调；Unified owner 增加 `observedPhysicalReadyState`，仅在非 OPEN到OPEN的真实状态边沿执行首个 health probe 和 membership sync；`setPriority` 为每个 logical stream 增加最后发送优先级缓存，同一优先级不再重复发送控制帧。
- 回归 guard：连接测试验证 pong 更新健康时间但不增加状态通知；Unified 多 pane测试验证重复 priority 不增加物理 socket发送帧；运行时 guard固定真实 OPEN边沿判断；全量测试继续覆盖 4 秒 watchdog、健康 pong、物理恢复和单物理 socket。
- 验证结果：定向 Node 31/31、Node 全量 137/137、Go 全量、Go race、script/module 两种语法检查和 `git diff --check` 均通过；已重新生成 `cloud.lazycat.webshell.lcmd-v1.0.39.lpk`，SHA-256 为 `b86a903a910184a2b106929663fefbcd8865ca7004de23b51c960c0b82830c6c`。
- 禁止复现：pong、普通业务消息和无输出状态不得触发立即重连、membership重发或 priority 重发；保活只能由独立 4 秒 watchdog驱动；不得把每次 `OPEN` 状态快照当作 OPEN 边沿。

### LCMD-20260828-06：Network Monitor Unified 明细与总计重复

- 日期：2026-08-28
- 来源：用户要求移除普通容器 Network Monitor 中与总计数据完全相同的 Unified 通道明细，并增加标题右侧连接状态指示。
- 实施方案：Unified 模式继续跟踪唯一物理 socket并累计总接收、总发送、总速率和总使用量，但 `snapshot().channels` 不再暴露重复的 Unified 明细行；`client:` 的三个直连通道仍保留明细。Network Monitor 标题增加状态小圆点：正常为绿色，异常为红色，连接中或重试中为灰色，悬停和无障碍标签同步显示状态。
- 回归 guard：Unified 测试验证不渲染通道行但总字节和速率仍准确；状态测试覆盖正常、异常、连接中和重试中；静态 guard固定状态点 DOM、Unified 空明细数组、隐藏通道仍参与总计和状态聚合。
- 验证结果：定向 Node 6/6、Node 全量 138/138、Go 全量、Go race、script/module 两种语法检查和 `git diff --check` 均通过；已重新生成 `cloud.lazycat.webshell.lcmd-v1.0.39.lpk`，SHA-256 为 `600f3451d6cefa4fc108490f523bf64a842ace3f1591468ff547d8cb6da67f57`。
- 禁止复现：移除 Unified 明细不得清空或停止采样物理 socket；标题状态不得根据流量大小猜测网络状态，必须使用真实连接状态。
