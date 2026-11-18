# 原生运行时启动器

`Run` 从私有父子管道读取宿主配置，并从同一平台产物启动 worker。启动器负责限实例凭据的 LightOS 注册与心跳、可信下载、兼容缓存回退及空闲时替换 worker；`session.go` 只使用实例凭据，不接收宿主控制密钥。

历史 launcher v4 使用 worker 创建的私有 Unix 域套接字承载 HTTP/WebSocket。套接字地址仅经父子管道交给宿主，更新后通知宿主更换地址；地址不进入业务状态、LightOS 注册或普通日志。CLI/PC 通过原版 hportal 的应用扩展点接入，不需要公共管理 RPC 或新增网络通道协议。

宿主 renew/pause 独立控制接入权限。父管道 EOF 先关闭 worker，再尝试注销远端实例；worker 异常退出报告错误，不循环重启。忙闲检查包含 PTY、保留的 SSH 任务与发布连接。更新使用独立不可变目录，不覆盖正在运行的文件；只有空闲并停止旧 worker 后才能启动新版。运行中的 launcher 在下次显式启用时更新。

验证使用实际 LightOS bootstrap/session API、原版 SDK 应用入口和私有 IPC，覆盖终端、文件、指标、SSH、发布、撤权及两个版本间的任务安全更新。`GOWORK=off go -C clientruntime test ./...` 用于编译检查；`node clientruntime/release.mjs` 构建七平台矩阵。交叉编译不能替代平台真机验收，完整联调需要已认证设备及同源 LightOS LPK。

缓存启动先接收当前 bootstrap 的目标清单，准备并校验产物后才创建 worker 和注册业务。`preparing` 状态只经父子管道报告；准备期间必须持续收到宿主 renew，EOF、pause 或失去续期均取消准备。请求认证分别由宿主与限实例会话注入。父级检查只保留一个待完成请求 ID，迟到结果不会覆盖新的检查。

launcher v5 使用原 SDK 注册的应用 gRPC 流；worker 的首包登记含本代公开 TLS 证书，证书与终端 secret 在心跳中一起更新。SDK 路由只在 worker 地址变化时由宿主登记，周期续权不再更换 SDK 连接。每次启用的服务名不同，同次启用的 worker 热更新使用原 SDK 同名替换。

运行时 v49 在 launcher/worker 进程入口统一清理内部代理环境变量及 ELECTRON_RUN_AS_NODE，宿主和 worker 启动器不再重复过滤；nano/version 模式保留调用方环境。微服代理仍由私有 proxy_url 配置显式提供，用户 shell 配置行为不变。CLI/PC 透传 bootstrap 扩展字段，launcher v5 控制协议保持兼容。

### 私有宿主 RPC（host_protocol 1）

同一二进制的 host 模式在父子 stdin/stdout 上使用标准库 net/rpc/jsonrpc。Init 交付限实例 bootstrap、本机 state root 和显式代理；Status、Check 提供运行时自己的状态与同步更新结果。Next 返回 SDK 登记参数和地址变化，最长等待 15 秒，每次请求按最新 SDK 状态续期已有 35 秒宿主准入；State 即时暂停或恢复准入。宿主被冻结、退出或管道关闭时不会继续续期。

旧 launcher 模式保留兼容。新的 RPC 适配位于运行时内，复用已有 Run 的业务、缓存、任务安全更新与退出流程。RPC 使用标准库关联响应；超时调用的结果不会成为后续请求的响应。明确取消时宿主关闭管道并确认实际进程退出，不增加本机 TCP 控制端口。

host 入口只接受包含 host_protocol 1 的本机清单；首次迁移重新下载支持该入口的产物。七平台仍各一份二进制，旧 PC 与新 CLI 分别调用其兼容入口。终端协议 v50 显式保留 v49/v48 attach 兼容，终端/SSH/转发业务未改变。

### LPK 版本与产物摘要

LightOS 打包时用最终 package.yml 版本调用 merge-release.mjs 的 --version 参数，给七平台清单写入一致的 version。独立 Webshell 构建和旧清单可省略该字段；缺失时 launcher 保留旧摘要版本标识，不把未知缓存标成当前 LPK。

running_version、installed_version、target_version 报告各自产物的 LPK 版本，对应的 *_binary_sha256 保留具体产物摘要。目标按 LightOS 当前 LPK 同步，包括回退；相同版本不同摘要仍准备目标文件。相同二进制跨版本复用只更新已校验清单和版本归属，保留 worker 与现有任务。文件路径继续按摘要隔离；活动任务安全切换、授权撤销和失败回退保持。

旧 host/launcher 的版本显示逻辑仍属于旧进程；下载新版 worker 后，下次关闭再显式启用才使用新 host/launcher 的状态格式。新入口协议保持 launcher 5 / host_protocol 1，Agent v51 显式兼容 v50/v49/v48。
