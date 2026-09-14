# 场景 1：按工作区和标签查看网络流量
ID: SC-NETWORK-TRAFFIC-BY-WORKSPACE-AND-TAB
Profile: draft
Gate: required
Given 用户同时开启调试模式和网络监听器，并有多个标签和会话产生网络流量
When 用户查看桌面端或移动端的终端工作区
Then 顶部栏在不遮挡终端内容的位置显示所有会话合计的当前流量、已使用流量和网络状态
And 桌面端每个标签名称下方以简短摘要显示该标签内全部会话合计的当前流量和已使用流量

# 场景 2：网络监听仅在双重开关开启时运行
ID: SC-NETWORK-MONITOR-DEBUG-GATE
Profile: draft
Gate: required
Given 用户可以分别控制调试模式和网络监听器
When 调试模式或网络监听器中的任一开关处于关闭状态
Then 顶部栏和标签页不显示网络统计
And 网络流量采样、会话连接监听和刷新定时任务停止运行
