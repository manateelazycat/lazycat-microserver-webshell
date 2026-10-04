# 按需整机资源采样

独立 Go module，仅由 PC / hclient-cli 的 terminal-core 装配；容器、hportal 网络核心和移动端不导入本模块。依赖 gopsutil v4.26.8 获取操作系统公开的累计 CPU、内存及磁盘计数，不执行 shell 命令来模拟指标。

- `New(platform)` 不创建定时器或后台任务；`Snapshot(ctx)` 只在已通过门禁的 HTTP 请求内执行，等待采样锁可取消，同一秒内复用原始样本以合并多页面请求。
- 协议类型及采样接口位于 `core/host_metrics.go`；HTTP 门禁与请求超时在 `localserver/metrics.go`，本模块不处理账号、SSH 或终端会话。
- CPU 返回累计总时间/忙时间，Linux 不重复计算 guest；内存返回操作系统定义的已用和总量。Linux 磁盘选择由 `unix/metrics_linux.go` 注入，只计有 backing device 的整盘，不叠加分区和 mapper/RAID 虚拟层；macOS/Windows 沿用库的系统磁盘计数。权限或平台不支持时对应字段为 null。
- 只向上层返回汇总数值和磁盘集合摘要，不返回硬件序列号、路径、进程命令行。采样时间使用本生命周期的单调时间；接入代次摘要由 localserver 添加。
- 前端持有各自的差分基线；首个 CPU/I/O 样本不伪装成零。无请求时不持续采样，已有原生系统调用的取消能力受平台限制，但不会续发采样。

在此目录执行 `go build ./...`、`go vet ./...`；客户端产物须通过 PC/CLI 构建脚本。跨平台编译不等于真机指标或页面生命周期验收。
