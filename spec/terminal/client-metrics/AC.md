# 场景 1：授权请求按需读取整机资源
ID: SC-CLIENT-HOST-METRICS-ON-DEMAND
Profile: draft
Gate: required
Given PC 或 hclient-cli 已启用接入且当前账号有权查看该客户端
When 首页查询该设备的资源状态
Then 返回该客户端整机的真实资源数据，不可读取的单项明确不可用
And SSH 开关不影响读取，已有终端会话不变
When 用户离开首页且没有其他查看者
Then 不再有后续指标采样，已开始的原生单次读取在有限时间内收尾

# 场景 2：旧账号或旧代次不能读取资源
ID: SC-CLIENT-HOST-METRICS-AUTHORIZATION
Profile: draft
Gate: required
Given 客户端已切换账号或重新启用接入
When 旧账号或旧代次的请求尝试读取该设备资源
Then 请求被拒绝且不返回资源数据，不触发后续采样
