# 客户端应用传输适配

由 Webshell 维护，通过原 hportal 的 gRPC 服务注册和透明双向流承载一条 HTTP/WebSocket 连接，不改 SDK。每个 RPC 对应一个标准 net.Pipe，保留截止时间、背压、取消和连接隔离；不引入额外流复用。RPC EOF 关闭对应连接，业务内的 SSH 半关闭仍由 SSH 协议处理。

worker 使用私有 Unix listener 提供 gRPC，验证 SDK 注入的本代服务凭证。业务连接内部使用标准 TLS 1.3；worker 证书的公钥经认证心跳提供给 LightOS，客户端固定信任该证书。用途票据与本机授权准入仍由运行时验证。设备 API 外层 TLS 使用系统及平台公开 CA，不跳过证书验证。

本包是现有 Webshell 子模块中的公开 Go 接入包；Webshell 与 LightOS 构建使用已检出的源码及本地模块引用，不发布额外版本标签。hportal 不导入本包，不新增外部源码依赖。普通旧客户端继续走原 HTTP 接入。

验证须通过真实 SDK 的服务注册、替换、流取消/EOF、终端/文件/SSH/转发和撤权路径；编译或直接连接 Unix listener 不能代替完整接入验收。
