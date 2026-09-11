# 场景 1：网络恢复后原终端继续显示实时输出
ID: SC-NETWORK-PRESENTATION-RECOVERY
Profile: draft
Gate: required
Given 用户已有可交互的终端及另一个独立会话
When 终端短暂断网并恢复，用户继续输入、切换标签和调整可用显示区域
Then 原终端无需刷新页面或重新创建即可显示实时输出及新的命令结果
And 其他会话仍可正常使用
