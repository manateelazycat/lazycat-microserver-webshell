# 场景 1：桌面 opencode 使用 WebShell 选区
ID: SC-OPENCODE-DESKTOP-WEBSHELL-SELECTION
Profile: draft
Gate: required
Given 用户在桌面 WebShell 中运行 opencode，界面中有可选文字
When 用户拖选文字并执行复制
Then WebShell 显示选区并复制所选文字，opencode 自带的选中复制操作不会重复出现
And 普通左键点击及上下滚动仍可操作 opencode

# 场景 2：桌面 opencode 使用 WebShell 右键菜单
ID: SC-OPENCODE-DESKTOP-WEBSHELL-MENU
Profile: draft
Gate: required
Given 用户在桌面 WebShell 中运行 opencode
When 用户在终端画面单击鼠标右键
Then WebShell 的右键菜单打开，opencode 不会同时处理这次右键操作
