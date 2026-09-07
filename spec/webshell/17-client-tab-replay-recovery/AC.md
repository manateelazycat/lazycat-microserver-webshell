# 场景 1：客户端终端多标签历史恢复后仍可交互
ID: SC-CLIENT-TAB-REPLAY-RECOVERY
Profile: standard
Gate: required
Given 授权且在线的客户端终端拥有多个含不同历史长度的标签
When 用户刷新、切换标签并重连后继续输入
Then 每个标签恢复自己的终端内容并响应后续输入
