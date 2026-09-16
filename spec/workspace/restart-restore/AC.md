# 场景 1：重启后按原工作区创建新会话
ID: SC-RESTORE-WORKSPACE-AFTER-RESTART
Profile: draft
Gate: required
Given 用户已开启重启恢复，并在普通 LightOS 实例中打开多个标签和分屏，各会话位于不同工作目录
When 原终端工作区在 WebShell 重启后已无法继续使用，用户再次打开同一实例
Then 标签顺序、名称、分屏结构和活动位置恢复，每个会话在最后已知的工作目录中重新创建
And 重启前的终端输出和滚动历史不恢复

# 场景 2：关闭时保持既有工作区行为
ID: SC-KEEP-CURRENT-BEHAVIOR-WHEN-DISABLED
Profile: draft
Gate: required
Given 用户未开启重启恢复
When 用户使用普通 LightOS 实例或客户端物理机终端，并经历 WebShell 重启或重新连接
Then WebShell 继续沿用既有的会话与重连行为，不根据本功能保存的数据重建工作区

# 场景 3：存活会话继续使用
ID: SC-KEEP-LIVE-SESSIONS-AFTER-RESTART
Profile: draft
Gate: required
Given 用户已开启重启恢复，并且 WebShell 重启后原终端会话仍然存活
When 用户再次打开同一普通 LightOS 实例
Then 用户继续使用原有标签、会话和运行中的任务，不创建替代会话
