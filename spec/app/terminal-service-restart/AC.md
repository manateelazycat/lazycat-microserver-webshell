# 场景 1：确认更新后以新终端重新开始
ID: SC-CONFIRMED-SERVICE-RESTART
Profile: draft
Gate: required
Given 当前目标存在可用的服务更新，用户已打开终端，目标的 Shell 环境可正常启动
When 用户确认更新终端服务
Then 旧终端操作不再继续作用于新服务，更新成功后页面重新加载并显示可交互的新终端
And 更新失败时用户得到错误提示，页面可以通过重新加载重新进入当前实际可用的服务
