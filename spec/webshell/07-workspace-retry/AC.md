# 场景 1：工作区暂时读取失败后可以恢复
ID: SC-WORKSPACE-RETRY
Profile: standard
Gate: required
Given 用户的工作区仍存在且可访问
When 页面的一次工作区读取失败后再次读取成功
Then 工作区恢复显示可用终端，用户无需重新创建工作区
