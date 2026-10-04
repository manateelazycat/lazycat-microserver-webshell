# 服务端诊断日志

由原根目录 `server_log.go` 迁入，维护进程级日志 hub、脱敏、有界订阅和转发。`log.go` 保留原逻辑；`writer.go` 提供 `NewWriter(source)`，调用方不直接操作 hub。

Provider 使用 `Enabled`、`StartForwarder`、`ParseSince`、`ParseAfter`；容器 attach 日志通过 `QueueLog` 接口传给 Core，写入完成后调用 `Flush`。

仅依赖标准库和 Core 的共享队列协议版本，不拥有终端进程或授权。保留原日志顺序、级别判定和敏感信息处理，不向客户端额外输出凭据。

根目录执行 `go build ./internal/serverlog`；诊断日志的真实转发随终端连接及日志下载功能验证。
