# 本地终端 HTTP 服务

Start 接收受信任管理层提供的微服、账号、设备、启用代次和独立随机密钥，只监听 127.0.0.1 的随机端口。PC 入口注入 Unix/Windows 平台；本包不安装 agent、不访问 lightos-admin 私有实现，不负责账号登录或二进制重启。

- server.go / auth.go：生命周期与门禁。业务请求同时校验网关凭据、可信微服头、HMAC 票据的实例/账号/设备/代次及过期时间。
- `StartWithServices` 注入独立 SSH 与整机指标能力；未装配的能力不可访问。`metrics.go` 的 GET `/metrics` 在普通终端门禁后按请求调用 `core.HostMetricsSource`，3 秒请求时限，追加代次摘要，无计时器或后台采样；不打开或关闭终端会话。PC/CLI 在各自入口注入独立 `hostmetrics` module，容器不导入采样依赖。
- `StartWithSSH` 可注入独立 SSH handler。仅 `/ssh/` 路由交给它，在此之前仍校验 gateway credential 和可信微服头，handler 再校验用途专属票据；普通路由保留既有 Webshell 票据。根模块不导入 SSH 依赖，默认 `Start` 不提供 SSH。
- `publish.go` 在同一回环 HTTP listener 上提供 `/publish/connect` 二进制 WebSocket 隧道。它只接受管理端签发、绑定实例/账号/设备/启用代次/发布记录和目标地址的用途专属短期票据；物理机向票据指定的 HTTP/HTTPS 上游主机与端口拨号，不新增局域网监听端口。已建立的隧道随本服务关闭或网关撤权结束，普通浏览器终端和 SSH 协议不复用此入口。
- 可选 `Config.AdmissionAllowed` 只控制新业务请求，不关闭已有 WebSocket 或 PTY。暂停时仍允许经过原有网关及专用票据鉴权的 `/ssh/status`、`/ssh/config`，以便查询状态和明确撤权；普通终端和 SSH 隧道新接入返回不可用。容器未注入此门禁时保持原行为。
- queue.go：一条 Unified WebSocket 复用所有 pane，直接调用 Core broker 和进程内 attach，不启动附加 agent。连接就绪时发送与容器一致的 `queue-ready`（`state: open`）；不能用 `queue-state` 代替，否则公共前端不会进入就绪状态，也不会正常启动心跳。
- legacy.go：保留现有 MCP 单 pane 接口，只转换帧，不维护另一套 PTY/历史。
- files.go：保留客户端的系统根目录视图及路径格式，按桌面用户权限执行文件操作。上传到独立临时目录，不覆盖已有文件。

/__terminal_identity 只返回随机挑战的 HMAC 证明，不授予业务访问；宿主网关在同一 TCP 连接上先验证它，再注入凭据和转发请求，防止失效路由误转发到复用端口的其他服务。

Close 先撤权并断开 HTTP/WebSocket，再关闭 Core。Core 取消信号也覆盖仍在创建中的 PTY。票据密钥不写入命令行、日志或持久状态；重新启用必须创建新绑定，不能复用旧账号历史。Core 的窗口/ACK、主题、快照、WASM 和 fallback 与容器一致。

启用可选 SSH handler 时，Close 也关闭其生命周期；SSH 自己的配置关闭只回收 SSH，不触碰浏览器工作区。协议见 `../sshserver/PROTOCOL.md`；本包不处理密码、SSH 握手或转发端口。

库检查：`go build ./localserver`、`go vet ./localserver`。真实验证包括授权失败、两个以上 pane 的单连接、大输出流控、压缩恢复、图形回退、文件及退出；PC 管理和 hportal 网络路径另需完整联测。
