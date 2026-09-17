# 场景 1：并行准备连接且在终端就绪后接入
ID: SC-PARALLEL-CONNECTION-PREPARATION
Profile: draft
Gate: required
Given 用户打开明确指定普通 LightOS 容器的 WebShell 页面
When 页面开始初始化并请求工作区
Then 物理 WebSocket 连接准备同时发起，不必等待工作区返回或 Worker 初始化完成
And 首次登记工作区 pane 时复用已为相同目标准备的物理连接，不重新握手或再次等待 Agent 准备
When 前端 pane、配置和尺寸就绪且服务端准备完成并允许协议接入
Then 才发送 pane 订阅并开始终端恢复
And 终端在完成既有状态恢复和尺寸确认后正常显示并允许输入

# 场景 2：未使用的预连接随启动失效而清理
ID: SC-CANCEL-UNUSED-PREPARATION
Profile: draft
Gate: required
Given 页面已为所选普通容器启动物理连接准备，但尚未订阅 pane
When 初始化失败、工作区为空、目标切换或页面退出
Then 不再保留该次无用的连接，迟到的回调不能接入旧目标或关闭替换后的连接
And 预连接失败时，后续有效终端仍可通过既有正式接入与恢复流程重新连接
