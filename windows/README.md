# Windows 本地终端适配

实现 Core 的 Platform：ConPTY、PowerShell、尺寸、活动状态和所属进程回收。只由本地终端入口调用；容器 Provider 仍是 Linux 服务。

- platform_windows.go：New 创建服务级 Job Object；每个 pane 在挂起状态创建，加入独立 Job 后才恢复运行，失败即拒绝启动。
- job_windows.go：句柄所有权、进程恢复与关闭。服务被强制结束时，由系统回收 Job 内后代；关闭 ConPTY 前先关闭管道，避免旧 Windows 的 ClosePseudoConsole 等待输出而卡住。
- ssh_windows.go：SSH exec 使用无交互 PowerShell、独立管道及挂起创建/先入 Job 再运行；TERM/KILL 关闭所属 Job，PTY 的 INT 通过 ConPTY 控制输入传递。ConPTY 不提供 POSIX termios，raw/no-echo 请求明确拒绝；其他传统终端控制字符/速率不作为已应用的 POSIX 设置承诺。
- activity_windows.go：只观察受管理 pane 的进程后代；PowerShell 在当前进程内包装原 prompt 上报目录，不修改用户 Profile。
- private_storage_windows.go：为客户端 SSH 的专用密钥目录/文件设置受保护 DACL，仅当前本机用户和 SYSTEM 可访问；不改父配置目录，权限设置失败由 SSH adapter 拒绝提供 SSH。

使用 github.com/charmbracelet/x/conpty 的固定版本；关闭顺序依据 [Microsoft ClosePseudoConsole 文档](https://learn.microsoft.com/en-us/windows/console/closepseudoconsole)。不自动提权，不按进程名批量终止，不把网络核心的提升权限带给 Shell。

库检查：在仓库根目录执行 `GOOS=windows go build ./windows ./localserver`。实际二进制由 PC 的 terminal-core/build.mjs 构建，入口调用 New，不使用裸 Platform 绕过服务级 Job。

必须实机验证 PowerShell Profile、Unicode、主题、resize、退出码、前台/后台子进程，以及父进程被结束时的回收；交叉编译不等于这些场景已验收。
