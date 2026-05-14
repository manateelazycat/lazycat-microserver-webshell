# Lazycat Microserver WebShell Provider

本文档面向第三方 WebShell provider 开发者，融合了示例仓库说明和 WebShell Provider 对接规范。WebShell provider 是普通 LPK 应用，负责自己的页面、后端、终端会话、tab、pane、tmux、zellij 或其他运行时能力。lightos-admin 负责发现 provider、按 LightOS 实例选择 provider，并在用户点击 WebShell 时打开对应 provider 页面。

## 开发入口

WebShell provider 通过 LPK Resource Export 声明自己提供 WebShell 能力。provider 应作为普通 LPK 暴露应用入口，lightos-admin 会根据声明发现 provider，并用实例 selector 打开 provider 页面：

```text
https://<provider-domain>/?name=<name>@<owner_deploy_id>
```

`name` query 参数固定使用 `<name>@<owner_deploy_id>` 格式。provider 不应依赖 lightos-admin 源码或内部路由；公开入口契约只有 provider 应用 URL 加 `name` 参数。

如果需要参考完整示例，可以从 `~/webshell-provider-examples/examples/demo-webshell` 开始。它是最小 PTY 桥接示例，覆盖 provider 声明、实例 selector、`lightosctl exec`、Catlink 和 Publish API。`zellij-webshell` 展示如何接入已有 Web terminal/session manager，但它包含 zellij Web UI 的专属代理、自动登录和路径适配，不是最小模板。

## 基本结构

一个 WebShell provider 通常由以下部分组成：

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
└── runtime/
```

推荐职责划分：

- 前端负责终端渲染、实例选择、tab/pane UI、主题、快捷键和 WebSocket 连接。
- 后端负责 HTTP 页面服务、WebSocket 到 PTY 的桥接、调用 `lightosctl` 进入实例、维护 provider 自己的会话状态。
- WebShell 内部协议由 provider 自己定义，lightos-admin 只打开 provider 的应用入口。

应用入口示例：

```yaml
application:
  subdomain: example-webshell
  routes:
    - /=exec://8080,/lzcapp/pkg/content/example-webshell
```

## 声明 WebShell Provider

provider 通过 LPK Resource Export 声明自己提供 WebShell 能力。源码目录建议放置为：

```text
resources/lightos.webshell/default/webshell-provider.json
```

`lzc-build.yml` 直接引用该静态资源目录：

```yaml
resource_exports:
  - kind: lightos.webshell
    source: ./resources/lightos.webshell
```

`webshell-provider.json` 示例：

```json
{
  "support_home": false,
  "root_path": "/"
}
```

字段说明：

- `support_home`：第三方 provider 建议使用 `false`。为 `false` 时，lightos-admin 会在新窗口打开该 provider。`true` 仅用于 provider 明确支持在同一页面内承载 lightos-admin 返回体验的场景。
- `root_path`：provider 页面入口路径，必须以 `/` 开头。普通独立 LPK 通常使用 `/`；和其他页面共用域名时使用自己的路径前缀，例如 `/webshell/`。lightos-admin 会使用 provider 应用域名和 `root_path` 拼接入口 URL，再追加 `?name=<name>@<owner_deploy_id>`。

非根路径示例：

```json
{
  "support_home": false,
  "root_path": "/webshell/"
}
```

对应的应用路由可以按前缀挂载：

```yaml
application:
  routes:
    - /webshell/=exec://8080,/lzcapp/pkg/content/example-webshell
```

provider 后端需要服务 `/webshell/` 页面入口，以及 `/webshell/static/...`、`/webshell/ws` 等自身资源或接口路径。使用相对路径可以减少前缀适配工作。

LPK 的 `package.yml` 中应提供可展示名称，并为中文环境提供 `locales.zh.name`：

```yaml
package: cloud.lazycat.webshell.demo
version: 0.1.0
name: Demo WebShell
description: Demo LightOS WebShell provider
hidden_from_launcher: true
permissions:
  required:
    - lightos.manage
locales:
  zh:
    name: 演示 WebShell
    description: LightOS WebShell provider 演示
```

如果该 provider 不支持直接从微服启动器进入，可以设置 `hidden_from_launcher: true`。

## 访问 LightOS 实例

需要访问 LightOS 实例的 provider 应声明权限：

```yaml
permissions:
  required:
    - lightos.manage
```

拥有 `lightos.manage` 后，provider 可以在自己的后端进程中调用 `lightosctl` 访问实例。

列出实例：

```sh
/lzcinit/lightosctl ps
```

`lightosctl ps` 输出 JSON 数组。每个实例包含 `name`、`owner_deploy_id`、`status` 等字段。provider 应使用以下规则拼接 selector：

```text
<name>@<owner_deploy_id>
```

响应示例：

```json
[
  {
    "name": "demo",
    "owner_deploy_id": "cloud.lazycat.lightos.entry",
    "status": "running"
  }
]
```

provider 应把 `name` 和 `owner_deploy_id` 作为稳定 selector 字段，`status` 可用于过滤可进入的实例。

进入实例 shell：

```sh
/lzcinit/lightosctl exec -ti '<name>@<owner_deploy_id>' /bin/sh
```

后端通常使用 PTY 启动该命令，再通过 WebSocket 与浏览器交换终端输入输出。窗口尺寸变化时，provider 自行调整 PTY size。

Go 示例：

```go
cmd := exec.CommandContext(ctx, "/lzcinit/lightosctl", "exec", "-ti", selector, "/bin/sh")
cmd.Env = append(os.Environ(), "TERM=xterm-256color")
ptyFile, err := pty.Start(cmd)
```

## 转发实例内 HTTP 服务

如果 provider 需要把实例内的 HTTP 服务暴露给自己的页面，例如 zellij web、ttyd 或其他 Web terminal，可以使用 `lightosctl forward`：

```sh
/lzcinit/lightosctl forward -L 127.0.0.1:19082:127.0.0.1:39082 '<name>@<owner_deploy_id>'
```

`lightosctl forward` 依赖 LZCOS v1.5.3 或更新版本。`-L` 会在 provider 进程所在网络空间监听本地端口，并把连接转发到目标实例内的 TCP 服务。provider 后端可以再把浏览器请求反向代理到 `127.0.0.1:19082`。

`forward` 进程会绑定实例生命周期；实例停止或消失后会自动退出。provider 应在需要访问对应实例服务时启动 forward，并在 provider 退出或不再需要时结束对应进程。

## 会话状态维护

provider 应尽量把终端会话、tab、pane、当前工作目录、环境变量等运行状态维护在目标 LightOS 实例内，例如使用实例内的 tmux、zellij 或 provider 自己部署在实例内的会话管理进程。provider LPK 自身的后端进程建议只负责页面服务、WebSocket 转发、会话发现和 attach。

这样 provider 升级、重启或重新部署时，浏览器连接可以重新 attach 到实例内已有会话，用户正在运行的命令和已打开的 tab/pane 不会因为 provider 进程退出而丢失。provider 需要在重新连接时根据 `<name>@<owner_deploy_id>` 找到对应实例内的会话，并恢复前端展示状态。

`demo-webshell` 不维护持久会话。页面重连只会重新连接示例后端，不保证用户命令和 shell 状态保留。

## 终端尺寸同步

前端应在打开终端和窗口尺寸变化时，把当前终端列数和行数发送给后端。使用 ghostty-web 时，列数和行数来自 `terminal.cols` 和 `terminal.rows`：

```js
const sendResize = () => {
  socket.send(`resize:${terminal.cols},${terminal.rows}`);
};

terminal.onResize(({ cols, rows }) => {
  socket.send(`resize:${cols},${rows}`);
});
```

后端收到 resize 消息后，对当前 PTY 调整窗口尺寸：

```go
if strings.HasPrefix(message, "resize:") {
	cols, rows := parseTerminalSize(strings.TrimPrefix(message, "resize:"))
	if cols > 0 && rows > 0 {
		_ = pty.Setsize(ptyFile, &pty.Winsize{
			Cols: uint16(cols),
			Rows: uint16(rows),
		})
	}
}
```

初始连接时也可以把尺寸放在 WebSocket query 中：

```text
/ws?name=<name>@<owner_deploy_id>&cols=120&rows=32
```

## 访问 lightos-admin 跨域 API

provider 后端通过 `lightosctl system admin-info --json` 获取 lightos-admin 域名。已安装的 WebShell provider 可以从自己的应用域名跨域访问 lightos-admin `/unsafe_api/*` 接口，lightos-admin 会按已安装 provider 的 `entry_url` 校验 `Origin` 并返回 CORS 响应头。

`/unsafe_api/webshell/*` 和 `/unsafe_api/publish/*` 是提供给 WebShell provider 的公开对接接口。provider 不应直接调用 lightos-admin 其他 `/api/*` 内部接口。Catlink attach frame 使用 `/api/webshell/catlink/provider-frame`，因为它是浏览器 iframe 页面入口；需要读取 JSON 状态时使用 `/unsafe_api/webshell/catlink/provider-status`。

provider 前端不需要在 URL 中接收 lightos-admin 域名。建议由 provider 后端提供一个本地 API，执行：

```sh
/lzcinit/lightosctl system admin-info --json
```

并向前端返回 lightos-admin 的 `base_url`。

前端请求示例：

```js
const url = `https://${lightosAdminDomain}/unsafe_api/webshell/catlink/provider-status?name=${encodeURIComponent(instanceName)}`;
const response = await fetch(url, {
  credentials: "include",
});
```

跨域请求必须带当前用户会话凭据，因此需要设置 `credentials: "include"`。`/unsafe_api/*` 只包含 WebShell provider 对接所需的白名单接口，不等同于 lightos-admin 内部 `/api/*`。

示例中的 WebSocket Origin 校验为了演示保持简化。生产 provider 应结合自身风险模型决定是否增加额外 Origin 校验；LPK 应用本身仍受 Lazycat Microserver 登录保护。

## Catlink 初始化

Catlink 客户端 attach 由 lightos-admin 统一管理。provider 负责把实例内 shell 环境接入 Catlink，并在页面内嵌 lightos-admin 提供的隐藏 iframe 触发客户端 attach。

WebShell provider 创建实例 shell 环境时执行实例内初始化脚本：

```sh
if [ -f /run/catlink/shell-env.sh ]; then
  . /run/catlink/shell-env.sh
fi
```

对于 tmux、zellij 等持久会话，provider 需要把该脚本导出的环境同步到对应会话管理器中，保证新建 pane/tab 也能继承 Catlink 环境。

### 客户端 Attach Frame

页面中引入 provider 自己分发的 Catlink bridge 脚本：

```html
<script src="./static/lightos-catlink-provider.js"></script>
```

该脚本根据当前实例 selector 创建隐藏 iframe：

```html
<iframe
  src="https://<lightos-admin-domain>/api/webshell/catlink/provider-frame?name=<name>@<owner_deploy_id>"
  hidden
  aria-hidden="true"
  tabindex="-1"
></iframe>
```

`provider-frame` 只负责执行必要的客户端 attach 操作，不提供 provider UI。它会根据 lightos-admin 中该实例的 Catlink 配置决定是否 attach，并固定连接 lightos-admin 所在 server。

脚本需要在切换实例时去重更新 iframe。对同一个 `<name>@<owner_deploy_id>`，已经存在相同 `src` 的 iframe 时不重复创建。

### Catlink 状态 API

如果 provider 需要展示 Catlink 状态，可调用：

```http
GET https://<lightos-admin-domain>/unsafe_api/webshell/catlink/provider-status?name=<name>@<owner_deploy_id>
```

响应示例：

```json
{
  "enabled": true,
  "status": "connected",
  "server_host": "lightos.example.com",
  "required_version": "v0.6.9",
  "active_version": "v0.6.11",
  "message": "Local Catlink is connected for this server.",
  "updated_at": "2026-05-12T07:00:00Z"
}
```

`status` 枚举：

- `unknown`
- `disabled`
- `unsupported`
- `checking`
- `installing`
- `connected`
- `pending`
- `unavailable`
- `error`

## Publish API

provider 可以调用 lightos-admin 的 `/unsafe_api/publish/services` 接口，为当前实例内的 HTTP 服务创建可访问应用。创建服务会自动生成并安装对应 Shell LPK。

`upstream` 表示在目标 LightOS 实例内可访问的 HTTP 地址。`app_url` 是生成后给用户打开的完整应用访问地址，通常应使用当前 Lazycat Microserver 下可用的应用域名；该域名需要由 provider UI、用户输入或上层系统明确提供，lightos-admin 不会根据 `package_id` 自动推导。`package_id` 应使用稳定、唯一的应用包 ID；同一个 `package_id` 再次创建会更新现有服务。`skip_auth=true` 会让发布服务跳过登录保护，仅应在明确需要公开访问时使用。

### 查看 Publish 服务状态

```http
GET https://<lightos-admin-domain>/unsafe_api/publish/status
```

响应示例：

```json
{
  "ready": true
}
```

### 列出服务

```http
GET https://<lightos-admin-domain>/unsafe_api/publish/services
```

响应示例：

```json
{
  "services": [
    {
      "id": "publish-id",
      "instance_name": "demo@cloud.lazycat.lightos.entry",
      "upstream": "http://127.0.0.1:8080",
      "package_id": "cloud.lazycat.app.my-service",
      "app_url": "https://my-service.example.com",
      "title": "My Service",
      "skip_auth": false
    }
  ]
}
```

### 创建或更新服务

```http
POST https://<lightos-admin-domain>/unsafe_api/publish/services
Content-Type: multipart/form-data
```

表单字段：

- `instance_name`：完整实例 selector，例如 `demo@cloud.lazycat.lightos.entry`
- `upstream`：实例内可访问的 HTTP 地址，例如 `http://127.0.0.1:8080`
- `package_id`：服务应用包 ID，例如 `cloud.lazycat.app.my-service`
- `app_url`：完整访问地址，例如 `https://my-service.example.com`
- `title`：应用标题
- `skip_auth`：是否跳过登录保护
- `icon`：可选 PNG 图标文件

响应示例：

```json
{
  "id": "publish-id",
  "instance_name": "demo@cloud.lazycat.lightos.entry",
  "upstream": "http://127.0.0.1:8080",
  "package_id": "cloud.lazycat.app.my-service",
  "app_url": "https://my-service.example.com",
  "title": "My Service",
  "skip_auth": false
}
```

同一个 `package_id` 已存在时，该请求更新现有服务。

### 删除服务

```http
DELETE https://<lightos-admin-domain>/unsafe_api/publish/services/<id>
```

删除服务会同时卸载对应 Shell LPK。

## 示例构建与验证

参考示例位于 `~/webshell-provider-examples/examples/`。

前置条件：

- Go 工具链。
- `lzc-cli`，用于构建 LPK。
- 可安装 LPK 的 Lazycat Microserver 环境。
- 目标环境中至少有一个 `running` 状态的 LightOS 实例。
- 当前示例构建目标为 Linux amd64。
- 构建 `zellij-webshell` 时，需要本机可用的 Linux amd64 `zellij` 二进制。

构建 demo provider：

```sh
cd ~/webshell-provider-examples/examples/demo-webshell
lzc-cli project release
```

构建 zellij provider：

```sh
cd ~/webshell-provider-examples/examples/zellij-webshell
ZELLIJ_BIN="$(command -v zellij)" lzc-cli project release
```

安装到目标环境：

```sh
cd ~/webshell-provider-examples/examples/demo-webshell
<install-lpk-command> dist/cloud.lazycat.webshell.demo-v0.1.0.lpk

cd ../zellij-webshell
<install-lpk-command> dist/cloud.lazycat.webshell.zellij-v0.1.0.lpk
```

`<install-lpk-command>` 替换为当前开发环境支持的 LPK 安装命令。

安装后，在 lightos-admin 的 WebShell provider 列表中确认 provider 已出现。打开某个 LightOS 实例的 WebShell 时，provider 页面 URL 应包含完整实例 selector：

```text
?name=<name>@<owner_deploy_id>
```

Go 编译验证：

```sh
cd ~/webshell-provider-examples/examples/demo-webshell
go test ./...

cd ../zellij-webshell
go test ./...
```

## 常见问题

- provider 没出现在列表：检查 `resource_exports` 是否导出 `lightos.webshell`，以及 `webshell-provider.json` 是否位于 `resources/lightos.webshell/default/`。
- 无法列出或进入实例：检查 `package.yml` 是否声明 `lightos.manage` 权限。
- 页面找不到实例：确认目标环境中存在 `running` 状态的 LightOS 实例。
- Catlink 或 Publish API 请求失败：跨域请求需要当前用户登录态，并设置 `credentials: "include"`。
