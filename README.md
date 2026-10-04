# 懒猫微服 LightOS WebShell

本项目是懒猫微服 LightOS 的 WebShell Provider，用于在浏览器中连接、管理和使用 LightOS 实例内的终端环境。

它通过 LPK Resource Export 声明 `lightos.webshell` 能力，由 LightOS Admin 发现并打开。安装后，用户可以从 LightOS 的 WebShell 入口进入目标实例，直接在网页中进行命令行操作，并使用标签、分屏、文件传输、服务转发和快捷键等能力。

## 模块导航

服务端按职责分包，根目录 `main.go` 只组装依赖并选择 agent/Provider 入口。

| 模块 | 职责 |
| --- | --- |
| [core](core/README.md) | 工作区、PTY 会话逻辑、终端应答、历史、checkpoint、agent 协议和 Unified 流控 |
| [unix](unix/README.md) | Unix PTY/IPC 与现有 Linux Shell、进程扫描和回收实现 |
| [windows](windows/README.md) | ConPTY、PowerShell、活动状态及 Job Object 回收 |
| [provider](provider/README.md) | Linux HTTP 入口、鉴权、发现、容器/客户端转发、恢复和文件 |
| [localserver](localserver/README.md) | PC 本地服务、绑定门禁及共享 Unified 队列入口 |
| [localtools](localtools/README.md) | PC 编码和 nano 兼容适配 |
| [sshserver](sshserver/README.md) | 独立 SSH 协议与受控隧道，复用 Core PTY；仅由 PC/CLI 终端产物装配，默认关闭 |
| [internal](internal/README.md) | 服务端日志与字体等内部公共模块 |
| [runtime](runtime/README.md) | 运行资产及 Go checkpoint 的唯一 WASM 来源 |
| [runtime/static](runtime/static/README.md) | 浏览器前端模块 |

## 项目目标

LightOS WebShell 的目标是为懒猫微服提供一个开箱即用的网页终端：

- 面向 LightOS 实例，而不是普通独立服务器。
- 与 LightOS Admin、实例列表、服务转发和 LPK 安装流程集成。
- 在浏览器刷新、网络短暂断开或切换页面后，尽可能保留已有终端会话。
- 同时兼顾桌面端和移动端操作，提供标签页、分屏、历史回放、文件管理和快捷键体验。

## 主要功能

### 终端和会话

- 自动发现 LightOS 实例，并在多个运行中的实例之间切换。
- 在浏览器中打开实例内 Shell，支持原始终端输入输出、窗口尺寸同步和 WebSocket 连接。
- 容器实例的单个 WebShell 页面只使用 1 条页面级 Unified 终端 WebSocket。工作区内所有 tab/pane 始终作为 logical stream 注册到该连接；创建或关闭 pane 才改变 membership，tab 切换、聚焦和输入只更新优先级，不关闭或替换 logical stream。每个 pane 独立维护 history generation、cursor、sequence、checksum、resize 和重同步状态；单 pane 故障只重建该 logical stream。受管理的 `client:` PC target 使用同一套 Unified 模型。
- 使用实例内的持久 agent 管理终端工作区，刷新页面、重新打开页面或短暂断网后可重新连接到已有 tab 和 pane。
- 服务升级后优先复用兼容的旧 agent，尽量保留正在运行的终端会话；协议不兼容时会明确提示。
- 支持终端输出历史回放，减少重连后的上下文丢失。
- LightOS 实例端使用 PTY 原始字节范围游标同步历史。普通容器打开 pane logical stream 时，在同一 Unified WebSocket 上直接接收 persistent agent 的权威 `snapshot + live`；浏览器不读取本地历史、不发送本地 cursor range，也不使用 Cache API。snapshot 和恢复期间的实时字节会完整解析 ANSI、光标、模式、Kitty Graphics 和终端响应，但不提交中间 Canvas；服务端 replay complete、队列追平并完成最终 full render 后才显示。第一批字节不是首帧。
- 窗口尺寸、字号、字体、主题变化以及跨设备单击恢复尺寸时，只有确认终端几何确实变化才保留当前旧帧；后台 Ghostty 可继续渲染，当前尺寸的 full render 成功后一次性替换旧帧，不重新回放历史，也不等待 PTY 输出停顿。切换标签前会保留最后有效帧，激活后用当前状态的 full render 替换，避免黑屏。
- Ghostty 每帧先完整物化当前可见 viewport，再原子提交 canvas；任一活动屏幕或 scrollback 行临时不可用时保留上一帧并自动重试，不把缺失行绘制成黑区。
- 支持终端活动检测、自动标签命名、忙闲状态和当前工作目录显示。
- 支持从触摸端终端菜单导出当前 pane 的 Scrollback 长截图；从当前 viewport 连续导出到终端底部，首尾合成 WebShell 顶部信息和底部快捷键，超长内容按移动浏览器 Canvas 预算自动拆分。首版导出终端文本 cell，不包含 Kitty Graphics 图片。Android 直接保存，支持文件分享的宿主可调用系统分享。

### 标签、分屏和搜索

- 支持多标签页、上下/左右分屏、窗格关闭、标签重命名和标签排序。
- 支持标签总览，可快速查看、切换、新建、关闭和拖拽排序标签。
- 标签总览使用已经提交的 live Canvas、有效 hold frame 或独立的持久图片缩略图；不会将缩略图导入终端历史，也不触发终端回放。
- 支持终端内容搜索、结果跳转、全选缓冲区、复制选区、粘贴和链接识别/复制。
- 支持上下文菜单和键盘快捷键操作。

### 文件管理

- 支持上传文件到目标实例 `/tmp`，上传成功后自动复制文件路径。
- 支持从剪贴板读取文件并上传。
- 支持浏览实例内文件系统，从当前终端目录开始打开文件管理器。
- 支持下载单个文件；下载多个文件或目录时自动打包为 zip。
- 上传单批最多 32 个文件，单文件最大 2GB；下载一次最多选择 64 个条目。

### 设置和外观

- 支持主题切换，主题列表来自 `runtime/static/appearance/themes.json`。
- 支持内置字体、自定义字体上传、字体删除和系统默认字体恢复。
- 支持滚动历史行数设置，范围为 100 到 100000 行。
- 支持桌面端鼠标选区自动复制开关。
- 可选保存普通 LightOS 实例的标签、分屏和工作目录；终端工作区丢失后创建不带旧历史的新会话。该能力默认关闭，也支持受管理的 `client:` PC target；只恢复布局和目录，不恢复旧历史或任务。
- 支持移动端像素级滚动开关。
- 支持手机快捷键和 PC 快捷键自定义、排序和恢复默认。
- 终端长截图底部显示固定彩虹渐变的 `Powered by LazyCat MicroServer LightOS`；品牌文案和截图专用图标不改变真实快捷键栏。

### 移动端体验

- 支持双行手机快捷键工具栏，可配置输入按键或动作。
- 支持移动端操作菜单、选择浮层、触摸选择、长按重复输入和触感反馈开关。
- 支持移动端标签总览和侧滑返回类交互。
- 服务更新提示在移动端使用底部确认面板，避免误触。

### LightOS 集成

- 支持服务转发配置，可把实例内 HTTP/HTTPS 服务发布为 LightOS 应用入口。
- 支持服务转发的标题、子域名、路径、图标和跳过认证设置。
- 通过 LightOS Admin 信息识别当前部署，并按账号隔离可访问实例。
- 支持服务端版本变化检测，升级后提示用户刷新并重新连接。

## 构建和部署

前置条件：

- Go 工具链。
- Node.js 20.19+ 或 22.12+，以及 npm。
- `lzc-cli`。
- 可安装 LPK 的懒猫微服环境。

首次克隆后初始化仓库固定的 Ghostty Web fork：

```sh
git submodule update --init --recursive
```

构建 LPK：

```sh
lzc-cli project release
```

`lzc-build.yml` 会先执行 `npm ci` 和 `npm run build`，使用 Vite 将 `runtime/static/` 源码构建到 `build/runtime/static/`。LPK 只复制 Vite 产物和 `runtime/fonts/`；`tools/verify-vite-build.mjs` 会拒绝超过 8 个 JavaScript 发布文件或夹带源码模块树的产物。本地只构建前端可执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

`ghostty-web/` 是固定到 `ponzS/ghostty-web` fork 的 submodule，也是唯一的 Ghostty WASM 源码来源。WebShell 仓库内的 `runtime/static/ghostty-web.js`、`ghostty-vt.wasm` 和许可证是发布资产。常规构建会校验这些文件，然后从 submodule 当前源码重建 WASM 并比较核心 section；子模块、Bun、Zig 或源码校验任一缺失都会阻止发布：

```sh
./tools/sync-ghostty-web-assets.sh --check
```

`--check-source` 是源码校验的显式入口。校验会执行 `bun run build:wasm`，再解析并比较两份 WASM 的核心 section 内容；自定义构建元数据不参与版本判断。submodule 根目录的 `ghostty-vt.wasm` 是被 Git 忽略的构建产物。

每次执行 `lzc-cli project release` 时，`lzc-build.yml` 都会调用 `--rebuild-wasm-only`，从当前 `ghostty-web` 源码重新构建 WASM 并复制到 `runtime/static/ghostty-vt.wasm`，然后才复制 runtime 并打包。该模式不会覆盖包含 WebShell 历史定制的 `runtime/static/ghostty-web.js`。只有有意更新 JavaScript bundle 时才执行 `--sync`；只有需要同时更新 JavaScript 和 WASM 时才执行 `--rebuild-wasm`。

安装到目标设备：

```sh
lzc-cli app install dist/cloud.lazycat.webshell.lcmd-*.lpk
```

开发环境也可以直接构建并安装：

```sh
lzc-cli project deploy
```

安装完成后，在 LightOS Admin 的 WebShell Provider 列表中应能看到 `LCMD WebShell`。

## 测试

规格按 `runtime/static` 一级模块放在 `spec/<模块>/<场景>/REQ.md` 和 `AC.md`。场景实现和原说明保留在 `spec-tests/<模块>/<场景>/`，由唯一执行器按目标选择测试批次。

```sh
./run-ac.sh                         # 显示帮助
./run-ac.sh --all                   # 选择全部非 draft 场景；未接入的场景会明确失败
./run-ac.sh --dry-run --selector terminal/input  # 核对选择和映射，不启动测试
./run-ac.sh --selector terminal/input
./run-ac.sh --selector terminal/input --target android-emulator
./run-ac.sh --help
```

先读 [测试环境说明](spec-tests/ENVIRONMENT.md) 配置测试地址、认证、Google Chrome 和 X11 DISPLAY。账号及密码只从本地 `.env` 或运行环境注入，前端构建由入口自动准备。默认打开有界面的桌面及移动布局窗口。真机和模拟器操作使用独立安装的 `agent-device-mcp` skill 与 MCP，安装方式见测试环境说明。

桌面 `run-ac.sh` 批次自动构建当前工作树前端并固定快照；Android MCP 批次构建完整 LightOS LPK，经所选设备的网络通道安装到 `debug123`，再核对运行文件及设备实际加载的资源摘要。构建、安装或内容核验失败时停止验收，不回退远端旧代码。

单模块上下文通过 `spec-tests/task-context --module terminal/input` 读取；入口与目录说明见 [测试说明](spec-tests/README.md)。执行报告保留每个模块的状态、耗时和事件证据，发现或 dry run 成功不代表真实测试通过。

无论前台或后台运行，结束时最后一行都会显示“测试总用时”，包含构建、准备、执行和清理。`--json` 时该行写到 stderr，总秒数也记录在 JSON 的 `duration_seconds` 与 `summary.duration_seconds` 中。

## 技术说明

- 后端使用 Go 实现，Web UI 通过 `/=exec://8080` 由 LPK 启动。
- 终端会话通过实例内 persistent agent 管理，并通过 WebSocket 转发到浏览器。普通容器的单条 Unified transport 复用只发生在 Provider 中转层；persistent agent 不需要修改，仍持续维护所有 PTY、任务、历史和 cursor。所有 logical pane 都允许普通输入，Provider 按 pane identity、stream generation 和 channel generation 校验，并根据活动优先级公平调度。`client:` PC target 在本地进程内复用同一 broker 与会话核心，不启动 attach 子进程。
- 实例端终端历史由 persistent agent 作为可信数据源维护。普通容器只走服务端权威 snapshot/live，Ghostty 不绘制回放中间帧；`client:` PC target 同样使用服务端快照与原始历史回退，不再使用 IndexedDB；旧库只删除、不重新创建。
- 可选的重启恢复由 Provider 按账号和实例保存版本化工作区描述；只有 agent 的 workspace generation 已变化时才让当前协议 agent 原子重建标签、分屏和新 PTY。关闭时不访问恢复存储，存活 agent 仍按原链路继续使用。
- HTML 入口使用 `/assets/<lpk-version>-<content-revision>/` 静态资源路径。源码模块由 Vite 合并为有界数量的生产 bundle 后再写入 LPK；即使误用相同 LPK 版本重新发布，只要二进制或 runtime 内容变化，JS/CSS/bundle/WASM URL 也会变化。内容寻址资源可通过 HTTP immutable 缓存长期复用，旧 `/static/` 仅保留兼容。
- 页面不注册 Service Worker、不提供 Web App Manifest，也不维护 PWA app-shell。历史版本遗留的本 WebShell Worker 和已知缓存会在启动后精确清理，不参与终端启动、离线 fallback 或资源调度。
- 终端渲染使用项目内随包分发的 Ghostty Web 运行时资源。
- 本项目不使用 `tmux`，也不使用 `xterm.js`。

## 许可证

本项目代码使用 PolyForm Noncommercial License 1.0.0 授权，SPDX 标识为 `PolyForm-Noncommercial-1.0.0`。

这意味着本项目源码允许在非商业场景下使用、复制、修改和分发，但不能用于商业目的。禁止将本项目用于商业产品、商业服务、付费交付、商业集成或其他以商业收益为目的的场景。

完整许可证条款见 [LICENSE](./LICENSE)。第三方文件保留其原始许可证声明，例如 `runtime/static/ghostty-web.LICENSE` 和 `runtime/fonts/LICENSES/` 下的字体许可证。
