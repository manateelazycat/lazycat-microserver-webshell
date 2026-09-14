# 场景 1：自动补绘默认开启且可独立关闭
ID: SC-AUTO-SCREEN-REFRESH-TOGGLE
Profile: draft
Gate: required
Given 用户尚未设置自动刷新屏幕选项
When 用户进入 WebShell 并打开调试模式
Then 自动刷新屏幕选项为开启状态
When 用户关闭自动刷新屏幕选项
Then 停止该机制的定时检查及尚未执行的补绘
And 用户重新进入页面后该选项仍为关闭状态，正常终端输出继续显示

# 场景 2：恢复显示时补绘不干扰终端使用
ID: SC-AUTO-SCREEN-REFRESH-PRESENTATION
Profile: draft
Gate: required
Given 自动刷新屏幕已开启，终端已有可用于显示的完整内容
When 用户进入或恢复显示该终端
Then 在正常回放和尺寸同步完成后自动补绘可见区域
And 补绘保留终端内容及用户滚动位置，不改变其他设备的尺寸控制权
And 持续无法恢复时停止本轮补绘重试，不无限刷新
