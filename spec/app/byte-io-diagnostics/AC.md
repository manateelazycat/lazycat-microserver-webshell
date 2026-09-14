# 场景 1：开启后观察有时间口径的字节日志
ID: SC-BYTE-IO-DIAGNOSTICS-CAPTURE
Profile: draft
Gate: required
Given 用户尚未设置字节io日志选项
When 用户打开调试模式
Then 字节io日志选项默认关闭
When 用户启用字节io日志并进入有历史内容的终端
Then 右上角出现标题为字节io的窗口，按顺序显示字节接收、排队及解析相关的字节量与耗时
And 日志可以区分会话、连接与回放，且区分接收间隔、解析处理和异步等待
When 用户关闭字节io日志或调试模式
Then 停止采集并隐藏窗口，正常终端输出继续工作

# 场景 2：复制全部保留日志用于分析
ID: SC-BYTE-IO-DIAGNOSTICS-COPY
Profile: draft
Gate: required
Given 字节io日志已经采集到终端处理事件
When 用户点击标题右侧的复制所有日志
Then 剪贴板包含全部保留事件及耗时口径说明，不仅包含窗口当前显示的部分
And 达到日志容量限制时复制结果注明丢弃的旧事件数量，不包含终端原始内容
