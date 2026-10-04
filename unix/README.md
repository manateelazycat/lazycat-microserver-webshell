# Unix 平台适配

实现 Core 的系统操作接口，不拥有历史、工作区或 WebSocket 调度。Linux 容器路径和 PC 本地路径分别组装，不复用容器的用户切换脚本来启动 PC Shell。

## 文件与入口

- platform_linux.go、shell_linux.go、activity_linux.go：原 Linux 容器平台、用户切换、Shell 引导和 /proc 活动查询。
- platform_unix.go、pty_unix.go、ipc_unix.go、listener_unix.go：Unix 共用的原 agent PTY、等待和 IPC 原语。
- local_unix.go：LocalPlatform，以桌面用户启动默认 Shell，保留系统 rc；Linux 交互非 login，macOS 交互 login。nano shim 仅通过 PATH 注入。
- local_process_unix.go：关闭本地 PTY 前，回收所属 session 和当前可确认的后代；不按可执行名杀进程。
- ssh_unix.go、ssh_modes_*.go：SSH 专用命令及 PTY 启动；无 PTY 使用独立 session/process group，PTY 启动前应用尺寸与系统支持的 RFC 4254 termios。信号针对所属终端前台进程组或无 PTY 命令组；不改变浏览器平台启动路径。
- platform_darwin.go、activity_darwin.go：macOS 平台及 ps/lsof 活动查询；不依赖 /proc。
- agent_reconcile_linux.go：原 Linux 持久 agent 的身份核对与回收。PC 使用管理层的私有父管道，不调用此扫描逻辑。

## 约束与验证

`metrics_linux.go` 仅为 `LocalPlatform` 提供 `/sys/block` 整盘选择，排除分区、loop 和虚拟叠加层；仅在指标请求内调用，不参与容器资源统计或后台扫描。macOS 的指标由独立 hostmetrics module 委托原生采样库读取，不使用 Linux 路径。

依赖方向为 Unix → Core；Core 不反向导入。系统专属文件通过 build tags 或平台后缀隔离。容器原有脚本与 Process.Kill 行为保持不变；本地模式使用独立的 PTY/session 回收和编码兼容适配。

Linux 执行 `go build ./unix`、`go vet ./unix`；macOS 库可用 `GOOS=darwin go build ./unix` 检查。真实回归需隔离用户 HOME，检查 rc、代理环境、CWD、resize、编码、关闭和父进程退出。进程有意自行脱离 session/父子关系或提权后，不按名称强行猜测归属；该边界需在实机审核。
