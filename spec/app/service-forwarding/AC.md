# 场景 1：服务转发只展示实际服务记录
ID: SC-SERVICE-FORWARDING-LIST-CONTENT
Profile: draft
Gate: required
Given 用户打开设置中的服务转发页
When 当前实例尚未返回服务列表或没有服务记录
Then 不显示「正在加载服务转发」或空状态占位文字，也不显示空列表边框
When 当前实例的服务记录加载完成
Then 直接显示对应服务及其操作入口
And 再次刷新同一实例时已有记录保持可见，刷新完成后更新，不插入加载提示
And 中英文界面遵循相同的显示行为，请求失败或服务配置异常仍提供反馈
