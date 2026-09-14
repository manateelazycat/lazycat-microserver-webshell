# 场景 1：连续大量输出期间终端内容与交互保持稳定
ID: SC-TERMINAL-OUTPUT
Profile: standard
Gate: required
Given 用户已打开持续可交互的终端
When 终端持续输出大量内容，用户同时输入并调整窗口或切换标签
Then 输出保持完整可见，操作后终端仍可继续交互

# 场景 2：编辑器连续滚动后保持内容排列
ID: SC-TERMINAL-OUTPUT-EDITOR-SCROLL
Profile: draft
Gate: required
Given 用户在终端中用 Vim 或 LazyVim 打开包含多屏内容的文件
When 用户快速连续按 Ctrl+D 或 Ctrl+U 并停止操作
Then 正文、缩进及行号保持正确排列，无需点击异常行或调整窗口大小恢复
And 用户仍可继续正常操作编辑器

# 场景 3：尺寸过渡结束后剩余输出自动推进
ID: SC-TERMINAL-OUTPUT-RESIZE-HANDOFF
Profile: draft
Gate: required
Given 终端正在处理尺寸变化期间的输出，且已有尚未处理的内容
When 用户再次调整尺寸后停止操作，并且当前尺寸处理允许继续输出
Then 已收到的剩余内容按顺序显示，不依赖新的网络数据或再次操作
And 不提前确认未消费的数据，不跳过仍然有效的尺寸边界

# 场景 4：持续动画无需额外操作即可更新
ID: SC-TERMINAL-OUTPUT-LIVE-ANIMATION
Profile: draft
Gate: required
Given 用户打开有持续状态动画的 TUI，终端尺寸已经稳定
When 程序持续更新动画并且用户输入内容
Then 动画与输入反馈持续更新，不等待输出安静或额外操作唤醒
And 原始输出保持完整和有序，不通过自动重连维持正常动画

# 场景 5：同步屏幕更新保持内容与光标一致
ID: SC-TERMINAL-OUTPUT-SYNCHRONIZED-PRESENTATION
Profile: draft
Gate: required
Given 终端程序使用同步屏幕更新，且一次更新分多次到达
When 程序重绘内容并移动光标后结束这次更新
Then 完整内容和最终光标位置一起显示，中间移动不被当成完成画面
And 如果结束标记异常缺失，终端仍能继续消费输出且不会永久停止显示
