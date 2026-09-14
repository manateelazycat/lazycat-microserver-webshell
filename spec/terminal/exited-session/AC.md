# 场景 1：刷新失败终端后仍可查看原始错误
ID: SC-EXITED-SESSION-STABLE-ERROR
Profile: draft
Gate: required
Given 最后一个终端异常退出并保留了失败前的输出
When 用户重新打开页面
Then 页面显示保留的输出及退出原因，并提供重新创建入口
And 不持续等待已退出终端的尺寸确认，不反复自动重连同一失败终端

# 场景 2：明确重新创建后恢复操作
ID: SC-EXITED-SESSION-RECREATE
Profile: draft
Gate: required
Given 失败终端的错误已显示，导致启动失败的环境条件已恢复
When 用户点击重新创建终端
Then 所在标签和分屏位置显示新的可交互终端，其他运行中的终端不受影响
And 新终端若再次退出则显示新的失败结果，不自动反复重新创建
