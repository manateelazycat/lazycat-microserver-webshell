# 物理机实例 SSH 扩展使用与手动测试

本页适用于客户端终端协议 v37。PC 与 hclient-cli 必须使用包含该版本终端核心的新构建；仅更新 LightOS 管理页不会更新电脑上的 SSH 实现。连接仍使用实例 SSH 设置窗口中的域名、端口、账号和独立密码。

下文以 SSH 配置别名 `lightos-pc` 为例，在**发起连接的电脑**的 `~/.ssh/config` 配置：

```sshconfig
Host lightos-pc
    HostName <实例设置中的域名>
    Port <实例设置中的端口>
    User <所属微服账号>
```

首次连接仍应核对设置窗口中的主机指纹。以下操作使用目标电脑当前客户端进程的本机用户权限。

## 命令执行

```sh
ssh lightos-pc 'whoami'
ssh lightos-pc 'printf output; printf error >&2; exit 7'
echo $?
printf 'input\n' | ssh lightos-pc 'cat'
ssh -tt lightos-pc 'stty size'
```

Linux/macOS 使用本机账号 shell 的 `-c`，无 PTY 时 stdout/stderr 独立，输入 EOF 不提前杀死仍在输出的命令。有 PTY 时遵循终端的回显和换行规则。Windows 无 PTY 时使用 PowerShell `-NonInteractive -Command`，有 PTY 时允许交互；输入输出编码设置为 UTF-8。命令需采用 PowerShell 语法，例如 `ssh lightos-pc 'Write-Output hello; exit 7'`；Windows 本机调用者的 `$LASTEXITCODE` 是 SSH 退出码。

同一 SSH 连接支持多个 session，可使用 OpenSSH ControlMaster；一个命令退出不关闭其他通道。非交互命令默认随连接断开结束，需要保留长任务时在可续接的交互终端中运行。

## 文件传输

```sh
sftp lightos-pc
scp ./example.txt lightos-pc:example.txt
scp lightos-pc:example.txt ./download.txt
scp -r ./folder lightos-pc:folder
scp -O -r -p ./folder lightos-pc:legacy-folder
```

SFTP 起始目录为本机用户主目录，可按该用户权限访问其他路径，不额外沙箱到浏览器目录。现代 SCP 默认使用 SFTP；`-O` 使用内建传统 SCP，不要求目标电脑另行安装 scp。传统协议支持文件、目录、权限/时间保存，拒绝协议无法表示或具有路径分隔符的条目名称；特殊文件不传输。文件大小受磁盘、用户权限和客户端资源约束，协议流式处理，不将整个文件装入内存。中断可能留下部分文件，可由用户重新上传或清理。

Windows 远程路径建议使用正斜杠，如 `C:/Users/用户/Downloads/file.txt`。权限模式与符号链接遵循 Windows 文件系统语义，不能把 Unix chmod 位等同于 Windows ACL。

手测上传/下载时对比文件摘要，至少覆盖二进制、中文/空格名称、目录递归、不可写目录和传输中断。

## TCP 转发与跳板

```sh
# 在发起端监听 18080，转至目标电脑可访问的 127.0.0.1:8080
ssh -N -L 18080:127.0.0.1:8080 lightos-pc

# 在目标电脑回环地址监听 18081，转至发起端的 127.0.0.1:8080
ssh -N -R 18081:127.0.0.1:8080 lightos-pc

# 发起端 SOCKS 代理，目的地由目标电脑访问
ssh -N -D 1080 lightos-pc

# 通过该电脑访问其网络里的另一台 SSH 主机
ssh -J lightos-pc user@another-host
```

`-R` 的监听位置是目标物理机，不是微服；默认回环，显式 `-R 0.0.0.0:...` 或指定地址时按本机权限绑定。TCP 目的地址允许为目标电脑可访问的地址。转发不绕过其防火墙或系统权限，也不提供 UDP、Unix socket 转发。

纯 `-N` 转发在成功申请转发后不受“必须启动 shell”的时限限制。每 SSH 连接最多 32 个通道、16 个远端 listener；取消远端转发释放 listener，断开连接释放其全部转发。测试时分别验证数据到达、`-R 0:...` 分配端口、取消后可重新绑定及断开后的端口释放。

## Agent 与 X11

```sh
ssh -A lightos-pc 'ssh-add -L'
ssh -X lightos-pc
# 进入目标终端后运行本机已安装的 X11 程序，如 xdpyinfo
```

Agent 转发由 `-A` 显式启用，目标进程通过 `SSH_AUTH_SOCK` 请求发起端签名，私钥不复制到目标电脑或微服。Unix 使用私有 socket，Windows 使用仅当前用户和 SYSTEM 可访问的命名管道；Windows 应使用支持该 agent socket 形式的 OpenSSH 工具。

X11 需要发起端具有显示服务器和有效授权。`-X`/`-Y` 的信任策略由发起端 OpenSSH 决定；目标侧提供回环 DISPLAY 和临时 Xauthority，使用发起端提供的伪 cookie。macOS/Windows 发起端需自行安装并启动 XQuartz 等 X11 服务器；客户端不会安装显示服务器。

Agent/X11 的 listener、临时凭据和通道随原 session/连接结束。它们不随终端保留跨连接延续；重新附着旧 shell 时，旧 `SSH_AUTH_SOCK`、DISPLAY/XAUTHORITY 路径已失效，需要这些能力时新建带转发的 shell。

## 断线续接

普通 `ssh lightos-pc` 创建独立交互 shell，并在登录提示中显示会话 ID；也可主动命名：

```sh
ssh -tt lightos-pc lightos-session new build-job
ssh lightos-pc lightos-session list
ssh -tt lightos-pc lightos-session attach build-job
ssh lightos-pc lightos-session kill build-job
```

在交互会话内启动长任务，然后断开 SSH（例如 OpenSSH 换行后输入 `~.`），再次认证并 attach。`lightos-session` 是 SSH 服务识别的远程管理命令，不是在目标 shell 中安装的可执行文件。

- 保留同一个 PTY、shell、环境及运行任务，默认不自动选择或抢占已有会话；已附着会话再次 attach 会明确拒绝。
- 断线后不按时间自动结束任务；最多 32 个终端。正常退出后移除，断线后自行退出的会话可读取最终输出和退出结果；名额用尽时优先清理最早退出的记录，不清理运行中的任务。无需的会话可使用 `lightos-session kill` 清理。
- 每个终端回放最近 1 MiB 原始终端输出；超出后提示早期输出缺失。这是有限历史回放，不是完整屏幕状态快照，交互应用必要时自行刷新画面。
- 暂时无法验证云端账号时停止新接入，已启动的交互任务继续在本机运行；恢复验证同一账号后才能重新附着。关闭 SSH、改密或成功换端口、切换账号及父进程退出仍回收保留会话。客户端进程重启后不能恢复旧任务。
- 不恢复旧 TCP/Agent/X11 连接、SFTP 文件传输或客户端进程重启前的任务；没有静默保存明文凭据。

手测需确认进程 PID、环境变量和长任务仍相同，同时验证第二个 attach 被拒绝、kill 生效，以及关闭 SSH 后旧 ID 不再可用。

## 环境、信号与终端参数

允许 SSH `env` 请求中的 LANG、LANGUAGE、LC_*、TERM、COLORTERM，限制数量和总长度；不接受覆盖 HOME、PATH、加载器、代理或认证凭据变量。环境只在新建进程时应用，续接已有 shell 不改变它的环境。PTY 的 TERM 以 pty-req 为准。

Unix 在 PTY 启动前应用系统支持的 RFC 4254 控制字符、输入/输出/本地/控制标志和速度；不存在的系统模式按协议忽略。支持 RFC 的 ABRT/ALRM/FPE/HUP/ILL/INT/KILL/PIPE/QUIT/SEGV/TERM/USR1/USR2 信号，PTY 作用于前台进程组，无 PTY 作用于命令组，并返回退出信号。Ctrl-C 输入路径继续可用。

Windows 使用 ConPTY；明确请求关闭 ISIG/ICANON/ECHO 的 raw/no-echo 设置会被拒绝，其他 POSIX 控制字符/速度不能视作已在 Windows 应用。INT 仅用于 PTY，TERM/KILL 终止该会话的 Job，其他信号拒绝。请分别在 Linux、macOS、Windows 检查 resize、交互程序、信号和退出结果。

## 手测边界

开发检查和回环协议冒烟不代替真实微服链路。最后手测应使用新客户端产物，覆盖 PC/hclient-cli、目标 OS、所属账号与其他账号、关闭/改密/换端口、浏览器终端不受影响，以及上述文件、转发和续接流程。无需为这批功能重新配置系统 sshd。
