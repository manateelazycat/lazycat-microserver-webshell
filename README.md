# 懒猫微服 LightOS WebShell

本项目是懒猫微服 LightOS 的 WebShell Provider，用于在浏览器中连接、管理和使用 LightOS 实例内的终端环境。

它通过 LPK Resource Export 声明 `lightos.webshell` 能力，由 LightOS Admin 发现并打开。安装后，用户可以从 LightOS 的 WebShell 入口进入目标实例，直接在网页中进行命令行操作，并使用标签、分屏、文件传输、服务转发和快捷键等能力。

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
- 容器实例的单个 WebShell 页面只使用 1 条页面级 Unified 终端 WebSocket。工作区内所有 tab/pane 始终作为 logical stream 注册到该连接；创建或关闭 pane 才改变 membership，tab 切换、聚焦和输入只更新优先级，不关闭或替换 logical stream。每个 pane 独立维护 history generation、cursor、sequence、checksum、resize 和重同步状态；单 pane 故障只重建该 logical stream。`client:` PC target 暂时继续使用最多 3 条独立直连。
- 使用实例内的持久 agent 管理终端工作区，刷新页面、重新打开页面或短暂断网后可重新连接到已有 tab 和 pane。
- 服务升级后优先复用兼容的旧 agent，尽量保留正在运行的终端会话；协议不兼容时会明确提示。
- 支持终端输出历史回放，减少重连后的上下文丢失。
- LightOS 实例端使用 PTY 原始字节范围游标同步历史；容器页面在 workspace HTTP 响应确认账号、实例、workspace、tab 和 pane 身份后，从 Cache API v2 使用 8 块滚动预读恢复对应 history generation。本地历史和恢复期间排队的实时字节都会完整解析 ANSI、光标、模式、Kitty Graphics 和终端响应，但不提交中间 Canvas；追平服务端 `endCursor` 后只执行一次最终 full render，再切回普通实时渲染。第一批字节不是首帧。
- 窗口尺寸、字号、字体、主题变化以及跨设备单击恢复尺寸时，只有确认终端几何确实变化才保留当前旧帧；后台 Ghostty 可继续渲染，当前尺寸的 full render 成功后一次性替换旧帧，不重新回放历史，也不等待 PTY 输出停顿。切换标签前会保留最后有效帧，激活后用当前状态的 full render 替换，避免黑屏。
- Ghostty 每帧先完整物化当前可见 viewport，再原子提交 canvas；任一活动屏幕或 scrollback 行临时不可用时保留上一帧并自动重试，不把缺失行绘制成黑区。
- 支持终端活动检测、自动标签命名、忙闲状态和当前工作目录显示。
- 支持从触摸端终端菜单导出当前 pane 的 Scrollback 长截图；从当前 viewport 连续导出到终端底部，首尾合成 WebShell 顶部信息和底部快捷键，超长内容按移动浏览器 Canvas 预算自动拆分。首版导出终端文本 cell，不包含 Kitty Graphics 图片。Android 直接保存，支持文件分享的宿主可调用系统分享。

### 标签、分屏和搜索

- 支持多标签页、上下/左右分屏、窗格关闭、标签重命名和标签排序。
- 支持标签总览，可快速查看、切换、新建、关闭和拖拽排序标签。
- 标签总览会按完整 cache-v2 身份读取未激活 pane 已提交的缩略图，因此不需要先逐个打开 tab 才能显示历史画面；缩略图不参与终端启动或同步状态。
- 支持终端内容搜索、结果跳转、全选缓冲区、复制选区、粘贴和链接识别/复制。
- 支持上下文菜单和键盘快捷键操作。

### 文件管理

- 支持上传文件到目标实例 `/tmp`，上传成功后自动复制文件路径。
- 支持从剪贴板读取文件并上传。
- 支持浏览实例内文件系统，从当前终端目录开始打开文件管理器。
- 支持下载单个文件；下载多个文件或目录时自动打包为 zip。
- 上传单批最多 32 个文件，单文件最大 2GB；下载一次最多选择 64 个条目。

### 设置和外观

- 支持主题切换，主题列表来自 `runtime/static/themes.json`。
- 支持内置字体、自定义字体上传、字体删除和系统默认字体恢复。
- 支持滚动历史行数设置，范围为 100 到 100000 行。
- 支持桌面端鼠标选区自动复制开关。
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

## 技术说明

- 后端使用 Go 实现，Web UI 通过 `/=exec://8080` 由 LPK 启动。
- 终端会话通过实例内 persistent agent 管理，并通过 WebSocket 转发到浏览器。普通容器的单条 Unified transport 复用只发生在 Provider 中转层；persistent agent 不需要修改，仍持续维护所有 PTY、任务、历史和 cursor。所有 logical pane 都允许普通输入，Provider 按 pane identity、stream generation 和 channel generation 校验，并根据活动优先级公平调度。`client:` PC target 仍由最多三条独立直连兼容。
- 实例端终端历史由 persistent agent 作为可信数据源维护。容器浏览器使用 Cache API v2 在后台恢复字节，Ghostty 通过复用的 WASM 输入缓冲区批量解析历史，不绘制中间帧；服务端 replay complete、实时队列追平并完成最终 full render 后才显示 live canvas。新增 Cache 字节的持久化继续在后台完成，不阻塞本次 Canvas 显示。`client:` PC target 继续使用 IndexedDB 与原完整历史回放协议，暂不启用容器 cache-v2 warm replay。
- HTML 入口使用 `/assets/<lpk-version>-<content-revision>/` 静态资源路径。即使误用相同 LPK 版本重新发布，只要二进制或 runtime 内容变化，JS/CSS/module/WASM URL 和 Service Worker cache 名称也会变化；内容寻址资源可长期缓存，旧 `/static/` 仅保留兼容。
- PWA Service Worker 对当前 LPK 版本的 immutable 静态 app shell 使用 cache-first，版本 URL 变化负责主动更新；缓存未命中才联网，终端 API、WebSocket 和 Cache API 虚拟记录始终绕过 Service Worker。
- 终端渲染使用项目内随包分发的 Ghostty Web 运行时资源。
- 本项目不使用 `tmux`，也不使用 `xterm.js`。

## 许可证

本项目代码使用 PolyForm Noncommercial License 1.0.0 授权，SPDX 标识为 `PolyForm-Noncommercial-1.0.0`。

这意味着本项目源码允许在非商业场景下使用、复制、修改和分发，但不能用于商业目的。禁止将本项目用于商业产品、商业服务、付费交付、商业集成或其他以商业收益为目的的场景。

完整许可证条款见 [LICENSE](./LICENSE)。第三方文件保留其原始许可证声明，例如 `runtime/static/ghostty-web.LICENSE` 和 `runtime/fonts/LICENSES/` 下的字体许可证。
