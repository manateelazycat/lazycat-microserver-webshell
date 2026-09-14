# 场景 1：终端显示参数与窗口调整平稳生效
ID: SC-TERMINAL-GEOMETRY-JITTER
Profile: standard
Gate: required
Given 用户已打开具有稳定内容的终端
When 用户调整字号、行距和窗口大小并切换标签
Then 终端画面持续可见并适应调整后的显示区域

# 场景 2：连续输出期间及时显示调整后的画面
ID: SC-TERMINAL-GEOMETRY-LIVE-OUTPUT
Profile: draft
Gate: required
Given 当前终端持续输出并已有可见画面
When 用户连续调整窗口或分屏尺寸后停止操作
Then 当前尺寸的完整画面就绪后及时显示，不因新输出持续保留旧占位帧
And 过渡期间旧画面不随容器等比例拉伸，历史和输出顺序保持正确

# 场景 3：含超链接的终端调整宽度后保持可用
ID: SC-TERMINAL-GEOMETRY-MANAGED-CONTENT
Profile: draft
Gate: required
Given 终端及其历史包含超链接、不同样式和组合字符
When 用户拖动分屏分割线缩窄或放宽终端，并重新打开该会话
Then 内容及超链接语义保持正确，终端仍能显示并继续交互
And 不因重排后的页面资源不足永久黑屏或反复连接失败
