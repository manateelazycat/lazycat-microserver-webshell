# 场景 1：按模块和任务定位终端流量消费
ID: SC-TERMINAL-TRAFFIC-CONSUMPTION-BREAKDOWN
Profile: draft
Gate: required
Given 用户开启调试模式、网络监视器和流量消费统计，并有终端会话产生网络流量
When 用户查看右上角流量消费统计窗口
Then 窗口以固定类型、顺序和位置展示消费流量的模块、任务、当前速率、接收量、发送量和总量，数值变化时各行不重排
And 历史回放、实时输出、消费确认、用户输入、终端自动响应、尺寸同步、主题同步、连接保活、会话控制和服务端日志始终分别占用固定行
And 所有分类的接收量、发送量和总量分别与网络监视器对应的汇总值一致

# 场景 2：复制流量消费诊断数据
ID: SC-COPY-TRAFFIC-CONSUMPTION-JSON
Profile: draft
Gate: required
Given 用户正在查看流量消费统计窗口
When 用户点击标题右侧的复制按钮
Then 剪贴板得到包含格式版本、采集时间、网络总计和固定顺序分类明细的 JSON 数据
And 接收量、发送量和总量使用原始字节，当前速率使用每秒字节

# 场景 3：消费明细跟随网络监视器生命周期
ID: SC-TRAFFIC-CONSUMPTION-FOLLOWS-NETWORK-MONITOR
Profile: draft
Gate: required
Given 用户可以分别控制调试模式、网络监视器和流量消费统计
When 调试模式、网络监视器或流量消费统计中的任一必要开关关闭
Then 右上角不显示流量消费统计窗口
And 网络监视器关闭时消费分类与原总流量统计一同停止并清空
