# 场景 1：客户端终端只允许当前活动账号访问
ID: SC-CLIENT-TERMINAL-ACTIVE-ACCOUNT
Profile: draft
Gate: required
Given PC 客户端保存多个账号，当前活动账号启用了 LightOS 接入
When 当前账号与其他账号分别请求该设备的终端、工作区或文件
Then 当前账号可访问，其他账号被拒绝
And 终端使用本机桌面用户权限，不获得网络核心的提升权限

# 场景 2：撤权后旧连接和迟到请求无法恢复访问
ID: SC-CLIENT-TERMINAL-REVOKE
Profile: draft
Gate: required
Given 客户端终端已有连接、运行任务和待处理的重连请求
When 用户关闭接入、切换账号、退出登录或登录失效
Then 旧连接断开，所属终端进程回收，其他系统进程不受影响
And 旧票据和迟到请求无法重新启动或访问终端
And 重新启用后不会复用旧账号的会话和历史

# 场景 3：重复请求不累积终端服务进程
ID: SC-CLIENT-TERMINAL-SINGLE-SERVICE
Profile: draft
Gate: required
Given 当前账号已启用客户端终端
When 多次心跳与并发连接重试到达
Then 同一启用代次只使用一个终端服务，已有会话继续可用
