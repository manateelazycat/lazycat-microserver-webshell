# 服务端内部公共模块

- [serverlog](serverlog/README.md)：进程日志、脱敏、缓冲和转发。
- [pkg](pkg/README.md)：现有内部公共包。

只放跨业务复用的基础能力，不放平台接线、容器发现或终端会话所有权。新增独立模块时补 README，并避免让 Core 与 Provider 形成反向依赖。

在根目录执行 `go build ./internal/...`、`go vet ./internal/...`；真实调用行为随所属功能回归。
