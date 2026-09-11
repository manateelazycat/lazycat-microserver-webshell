# 场景 1：旧客户端的输入锁请求不阻塞其他连接
ID: SC-TERMINAL-INPUT-LOCK-LIFECYCLE
Profile: standard
Gate: required
Given 两个授权页面连接同一终端，其中一个使用旧客户端输入锁行为
When 旧客户端发出锁定请求后另一个页面输入命令
Then 另一个页面仍得到对应输出并可继续操作同一终端
