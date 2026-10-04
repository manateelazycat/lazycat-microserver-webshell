# 场景 1：局部更新挤满历史后恢复完整界面
ID: SC-STATE-CHECKPOINT-TRUNCATED-HISTORY
Profile: draft
Gate: required
Given 服务端解析正常且支持状态恢复的终端已经显示完整主体，并持续进行局部更新直到历史达到上限
When 用户在新页面进入同一个终端
Then 主体及当前局部更新均可见，无需调整窗口尺寸
And 光标、终端模式和后续输入输出继续正常工作

# 场景 2：恢复和尺寸变化期间输出连续
ID: SC-STATE-CHECKPOINT-ORDERED-OUTPUT
Profile: draft
Gate: required
Given 多个窗口共享一个支持状态恢复的终端，程序持续输出
When 新窗口进入并发生用户尺寸调整
Then 基线之后的输出按顺序显示，既不重复也不丢失
And 恢复中间帧不可见，其他会话保持独立

# 场景 3：恢复保留主题与程序配色
ID: SC-STATE-CHECKPOINT-COLORS
Profile: draft
Gate: required
Given 用户设置了终端主题，程序也主动设置了部分颜色
When 用户通过状态恢复重新进入终端
Then 当前浏览器的默认配色和程序主动设置的颜色均保留

# 场景 4：解析失效后使用原始历史继续会话
ID: SC-STATE-CHECKPOINT-RAW-HISTORY-FALLBACK
Profile: draft
Gate: required
Given 容器或受管理的 PC 客户端终端的服务端解析状态已失效，PTY 和程序仍运行且存在可回放历史
When 用户打开或重新连接该会话
Then 会话自动回放保留的原始历史并继续接收实时输出，不因服务端快照错误持续拒绝连接
And 已连接会话的实时输出继续，原有程序不被重启，其他会话仍使用正常状态恢复
And 原始历史不超过配置行数 × 350 字节，不另行累积恢复历史
And fallback 不新增普通界面提示，错误日志可导出原始故障与回放路径
