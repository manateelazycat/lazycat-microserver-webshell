# 终端运行时管理

本模块负责启动配置、独占进程锁、私有 IPC、续期和退出管理，PTY 与业务逻辑由注入的运行时维护。

worker 创建私有临时目录和 Unix 域套接字，Linux、macOS 与 Windows 使用同一 IPC 接口；HTTP/WebSocket 入口不监听 TCP。地址只出现在父子管道的启动响应中，不上传 LightOS。应用网关在转发业务前执行同连接挑战验证，再注入受限服务凭证。

启动后接收续期消息；35 秒未收到续期或收到 pause 时暂停新接入，保留已运行的终端任务。父管道关闭时结束运行时、回收所属任务并删除套接字目录。状态目录必须为绝对路径。

宿主独立维护原版 SDK 应用入口的有效期，launcher v4 在服务端认证后续期 worker；业务心跳不能代替宿主授权。status 查询忙闲与准入状态，包含断线后保留的 SSH 任务，不创建新终端。私有启动响应含敏感信息，不应输出到普通日志。

当前 v48 worker 用私有 Unix gRPC listener 接入原 SDK。业务 HTTP listener 来自 clienttransport 的标准 TLS 隧道，公钥证书只经认证心跳登记；worker 不监听终端 TCP 端口。私有地址使用 unix: 原生目标形式，兼容 Unix 绝对路径与 Windows 盘符路径。
