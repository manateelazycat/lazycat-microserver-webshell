# LCMD WebShell

LCMD WebShell 是一个 Lazycat Microserver WebShell provider。它通过 LPK Resource Export 声明 `lightos.webshell` 能力，由 lightos-admin 发现并打开：

```text
https://<provider-domain>/?name=<name>@<owner_deploy_id>
```

`name` query 参数使用 `<name>@<owner_deploy_id>` 格式。没有传入 `name` 时，前端会从 `lightosctl ps` 返回的实例中选择第一个 `running` 实例。

本仓库是单个 provider 项目，不包含 `examples/` 目录；构建、测试和安装命令都在仓库根目录执行。

## 项目结构

```text
.
├── package.yml
├── lzc-build.yml
├── lzc-manifest.yml
├── resources/
│   └── lightos.webshell/
│       └── default/
│           └── webshell-provider.json
├── main.go
├── agent.go
├── agent_runtime.go
├── workspace.go
├── workspace_test.go
└── runtime/
    └── static/
        ├── index.html
        ├── main.js
        ├── style.css
        ├── themes.json
        ├── ghostty-web.js
        └── ghostty-vt.wasm
```

- `main.go` 提供 HTTP 服务、静态资源、实例列表、本地 API 和 WebSocket 入口。
- `agent_runtime.go` 负责把当前二进制安装到目标 LightOS 实例并启动持久 agent。
- `agent.go` 实现实例内 agent 的 Unix socket 协议和 attach 通道。
- `workspace.go` 维护 workspace、tab、pane、PTY、历史回放、布局和活动状态。
- `runtime/static/` 是前端终端 UI，使用 vendored `ghostty-web` 静态资源。

## LPK 配置

`package.yml`：

```yaml
package: cloud.lazycat.webshell.lcmd
version: 0.1.15
name: LCMD WebShell
description: LCMD WebShell for LightOS
min_os_version: v1.5.2
permissions:
  required:
    - lightos.manage
locales:
  zh:
    name: LCMD WebShell
    description: LCMD WebShell for LightOS
```

`lzc-manifest.yml`：

```yaml
application:
  subdomain: demo-webshell
  routes:
    - /=exec://8080,/lzcapp/pkg/content/demo-webshell
```

`lzc-build.yml` 会构建 Linux amd64 Go 二进制到 `dist/content/demo-webshell`，并复制 `runtime/` 静态资源：

```yaml
buildscript: |
  set -eu
  CONTENT_DIR="./dist/content"
  rm -rf "$CONTENT_DIR"
  mkdir -p "$CONTENT_DIR/runtime"
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -buildvcs=false -o "$CONTENT_DIR/demo-webshell" .
  cp -R ./runtime/. "$CONTENT_DIR/runtime/"
contentdir: ./dist/content
resource_exports:
  - kind: lightos.webshell
    source: ./resources/lightos.webshell
```

WebShell provider 声明位于 `resources/lightos.webshell/default/webshell-provider.json`：

```json
{
  "support_home": true,
  "root_path": "/"
}
```

`support_home: true` 对应当前前端的“首页”入口。前端通过本地 `/api/lightos-admin-info` 获取 lightos-admin `base_url`，再跳转到 `view=home`。

## 运行模型

后端监听 `127.0.0.1:8080`，由 LPK 路由暴露到应用域名。浏览器打开页面后，前端先读取实例列表，再通过 `/api/workspace` 初始化或恢复指定实例的 workspace。

workspace 不保存在 provider 容器内。provider 后端会：

1. 使用 `/lzcinit/lightosctl ps` 获取实例和登录用户名。
2. 将当前二进制打包并通过 `lightosctl exec -i` 安装到目标实例：
   - `/usr/local/bin/lcmd-webshell-agent`
   - `/usr/local/bin/.lcmd-webshell-agent.manifest`
3. 在目标实例内启动 agent daemon，监听 `/tmp/lcmd-webshell-agent.sock`，日志写入 `/tmp/lcmd-webshell-agent.log`。
4. 通过 `lightosctl exec <selector> lcmd-webshell-agent agent request ...` 请求 workspace 状态和 tab/pane 操作。
5. 通过 `lightosctl exec -i <selector> lcmd-webshell-agent agent attach ...` 把浏览器 WebSocket 连接 attach 到指定 pane。

实例内 agent 直接持有 PTY、tab、pane、布局和输出历史。浏览器刷新或断开后，再次打开同一个 `<name>@<owner_deploy_id>` 会重新 attach 到该实例内的已有 workspace；显式关闭 pane/tab 时才会结束对应 PTY。provider 应用升级后，新二进制的 manifest 变化会触发重新安装 agent。

创建 shell 时会根据 `lightosctl ps` 中的 `username` 切换到实例用户；当用户名为空或为 `root` 时保持 root 兼容。每个 pane 启动时都会执行 Catlink shell 环境初始化：

```sh
if [ -f /run/catlink/shell-env.sh ]; then
  . /run/catlink/shell-env.sh
fi
```

## 本地接口

### 实例和管理信息

```http
GET /api/instances
```

返回 `/lzcinit/lightosctl ps` 的实例 JSON 数组。前端用 `name + "@" + owner_deploy_id` 拼接 selector，并只进入 `running` 实例。

```http
GET /api/lightos-admin-info
```

返回 `/lzcinit/lightosctl system admin-info --json` 的结果。当前前端主要使用其中的 `base_url` 实现返回 LightOS 首页。

### Workspace

```http
GET /api/workspace?name=<name>@<owner_deploy_id>&cols=120&rows=32
```

确保目标实例内 agent 已安装并运行，然后返回 workspace 状态：

```json
{
  "selector": "demo@cloud.lazycat.lightos.entry",
  "server_revision": "<revision>",
  "active_tab_id": "tab-1",
  "tabs": []
}
```

```http
POST /api/workspace?name=<name>@<owner_deploy_id>&cols=120&rows=32
Content-Type: application/json
```

请求体包含 `action` 和动作参数。当前支持的动作包括：

- `create_tab`
- `rename_tab`
- `close_tab`
- `close_other_tabs`
- `split_pane`
- `close_pane`
- `move_pane_to_tab`
- `move_tab`
- `activate_tab`
- `activate_pane`
- `update_layout`

```http
GET /api/workspace/activity?name=<name>@<owner_deploy_id>&cols=120&rows=32
```

刷新并返回 pane 活动状态，包括 TTY、前台命令、命令行、当前目录、是否 busy 等信息。tab 自动标题也依赖这些活动信息。

### Server Revision

```http
GET /api/server-revision?name=<name>@<owner_deploy_id>&client_id=<client_id>
```

返回当前服务端修订标识。前端轮询该接口判断 provider 是否已升级；如果同一个客户端在目标实例内记录到的 revision 发生变化，会提示用户刷新。

可选 query 参数 `terminal_input_blocked=true|false` 用于在刷新提示期间阻止对应客户端继续向终端写入输入。

### WebSocket

```text
GET /ws?name=<name>@<owner_deploy_id>&pane=<pane_id>&cols=120&rows=32&client_id=<client_id>
```

WebSocket binary frame 用于终端原始输入输出。text frame 用于控制消息：

```json
{ "type": "input", "data": "..." }
{ "type": "resize", "cols": 120, "rows": 32 }
{ "type": "input_lock", "blocked": true }
{ "type": "ping" }
{ "type": "detach" }
```

服务端会发送 `history-replay-start`、历史 binary 数据、`history-replay-complete` 和 `process-exit` 等控制消息。

## 构建与验证

前置条件：

- Go 工具链。
- `lzc-cli`，用于构建 LPK。
- 可安装 LPK 的 Lazycat Microserver 环境。
- 目标环境中至少有一个 `running` 状态的 LightOS 实例。

运行测试：

```sh
go test ./...
```

构建 LPK：

```sh
lzc-cli project release
```

安装到目标环境：

```sh
<install-lpk-command> dist/cloud.lazycat.webshell.lcmd-*.lpk
```

`<install-lpk-command>` 替换为当前开发环境支持的 LPK 安装命令。安装后，在 lightos-admin 的 WebShell provider 列表中确认 `LCMD WebShell` 已出现。打开某个 LightOS 实例的 WebShell 时，页面 URL 应包含完整实例 selector：

```text
?name=<name>@<owner_deploy_id>
```

## 常见问题

- provider 没出现在列表：检查 `lzc-build.yml` 是否导出 `lightos.webshell`，以及 `webshell-provider.json` 是否位于 `resources/lightos.webshell/default/`。
- 无法列出或进入实例：检查 `package.yml` 是否声明 `lightos.manage` 权限。
- 页面找不到实例：确认目标环境中存在 `running` 状态的 LightOS 实例。
- 终端刷新后提示重新加载：provider 二进制或静态资源已升级，按页面提示刷新后会重新 attach。
- 新 pane 没有预期环境变量：检查目标实例内 `/run/catlink/shell-env.sh` 是否存在且可被 shell 读取。
