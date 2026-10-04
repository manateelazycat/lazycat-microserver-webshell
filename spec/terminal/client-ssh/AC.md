# 场景 1：标准 SSH 登录获得独立的本机终端
ID: SC-CLIENT-SSH-INTERACTIVE-SHELL
Profile: draft
Gate: required
Given 当前活动账号拥有该物理机实例，已启用 SSH 并设置独立密码，微服接入端口可达
When 用户在标准 SSH 客户端中使用实例连接命令和正确密码登录
Then 用户进入目标电脑的独立交互终端，输入输出和窗口调整正常，退出结果可被 SSH 客户端接收
And 终端使用客户端进程所属的本机用户权限，不接管浏览器已有会话

# 场景 2：SSH 配置撤销不影响浏览器终端
ID: SC-CLIENT-SSH-CONFIG-REVOKE
Profile: draft
Gate: required
Given 该实例已有 SSH 连接、所属运行任务和正常使用的浏览器终端
When 用户关闭 SSH、修改密码或成功切换接入端口
Then 旧 SSH 连接断开，所属任务被回收，旧连接配置和迟到请求不能恢复访问
And 浏览器终端及其运行任务继续可用

# 场景 3：SSH 不绕过客户端账号门禁
ID: SC-CLIENT-SSH-ACCOUNT-BOUNDARY
Profile: draft
Gate: required
Given 客户端保存多个微服账号，当前账号启用了 SSH
When 其他账号尝试连接，或原账号在关闭接入、账号切换或授权失效后再次连接
Then 未获当前授权的连接被拒绝，不创建可使用的终端

# 场景 4：手动输入密码不被过早断开
ID: SC-CLIENT-SSH-AUTH-WAIT
Profile: draft
Gate: required
Given 当前账号的 SSH 已启用且可达，用户使用标准 SSH 客户端登录
When 用户确认主机指纹并在连接开始 15 秒后、120 秒内提交正确密码
Then 用户可以进入交互终端，不因等待超过 10 秒被关闭连接
And 若超过 120 秒仍未完成认证，连接被关闭，不能继续创建终端

# 场景 5：完整非空密码验证及升级兼容
ID: SC-CLIENT-SSH-PASSWORD-VERIFY
Profile: draft
Gate: required
Given 当前账号已设置非空 SSH 密码，包括短密码、空格、中文或超过 72 字节的密码
When 用户用正确密码、错误密码或空密码登录
Then 只有完整正确的密码可以进入终端，包括只在第 72 字节之后不同的错误密码也被拒绝
And 升级前已保存的密码无需重置即可使用

# 场景 6：执行命令并接收独立输出与退出结果
ID: SC-CLIENT-SSH-EXEC
Profile: draft
Gate: required
Given 所属账号已启用支持扩展能力的客户端 SSH
When 用户通过标准 SSH 执行非交互命令，输入二进制数据并等待完成
Then 命令以客户端本机用户权限执行，标准输入、输出和错误流保持正确，客户端收到退出码或退出信号
And 同一 SSH 连接上的多个命令可独立完成，交互 shell 与浏览器终端继续可用

# 场景 7：使用标准工具传输文件
ID: SC-CLIENT-SSH-FILES
Profile: draft
Gate: required
Given 所属账号已启用 SSH，目标目录可由客户端本机用户读写
When 用户用 SFTP、默认 SCP 和传统 SCP 上传下载文件及目录
Then 文件内容保持一致，支持包含空格和中文的名称，目录层次保持完整
And 本机权限不足时操作失败，中断传输不会被报告为完成

# 场景 8：TCP 转发和跳板按连接生命周期工作
ID: SC-CLIENT-SSH-TCP-FORWARD
Profile: draft
Gate: required
Given 所属账号已登录 SSH，客户端本机可访问测试 TCP 服务
When 用户分别建立本地、远端、动态转发及跳板连接并传输数据
Then 请求从预期端点到达目标，纯转发连接无需启动 shell，远端动态分配端口可被读取和取消
And 连接断开或 SSH 授权撤销后监听器及关联连接释放

# 场景 9：显式使用 Agent 和 X11 转发
ID: SC-CLIENT-SSH-AGENT-X11
Profile: draft
Gate: required
Given 用户的 SSH 发起端具有可用 SSH Agent 和 X11 显示服务器
When 用户显式请求 Agent 和 X11 转发并在目标电脑使用相应程序
Then 目标程序可通过当前连接访问用户 Agent 和显示服务器，不复制私钥到微服或目标电脑
And 原连接断开后转发凭据与通道失效，不因交互 shell 保留而继续授权

# 场景 10：重新认证后续接自己的交互终端
ID: SC-CLIENT-SSH-RESUME
Profile: draft
Gate: required
Given 用户的交互终端正在运行任务且客户端账号授权仍有效
When SSH 连接中断，用户在客户端终端进程持续运行期间重新认证并选择原会话续接
Then 原终端、运行任务和环境继续可用，用户可列出或手动终止自己的保留会话
And 同一终端拒绝并发附着，超过 1 MiB 的历史回放明确提示早期内容已丢弃
And 关闭 SSH、改密或成功换端口、账号切换、关闭整个客户端接入会回收保留会话，旧标识不能恢复访问

# 场景 11：终端参数按平台能力生效
ID: SC-CLIENT-SSH-TERMINAL-PARAMETERS
Profile: draft
Gate: required
Given 用户使用支持环境变量、PTY 模式和信号请求的 SSH 客户端
When 用户设置允许的语言环境、申请 PTY 参数、调整窗口并发送受支持的信号
Then 新建进程获得对应环境，Unix 的受支持终端模式和信号作用于所属任务，窗口变化继续生效
And Windows 使用 ConPTY 能力，不支持的 raw/no-echo 模式和信号明确拒绝，不冒充已应用
And 禁止的环境变量不能覆盖服务的认证或加载器环境

# 场景 12：暂时失联不结束用户任务
ID: SC-CLIENT-SSH-NETWORK-PAUSE
Profile: draft
Gate: required
Given 当前账号已通过验证并在交互 SSH 会话中运行任务
When 云端暂时无法验证身份、状态查询超时或 SSH 网络连接中断
Then 已启动的任务在客户端进程内继续运行，新远程连接等待重新验证
And 连接恢复并重新验证同一账号后可续接原会话；明确撤权仍立即回收
