# 场景 1：移动端上下滑动浏览 Codex 全屏会话
ID: SC-CODEX-FULLSCREEN-TOUCH-SCROLL
Profile: draft
Gate: required
Given 用户在移动端 WebShell 中打开正在运行的 Codex 全屏会话，且会话内容超出可见区域
When 用户在终端画面向上和向下滑动
Then Codex 会话内容沿对应方向滚动，可浏览当前画面外的内容

# 场景 2：Codex 全屏会话使用 WebShell 选区与菜单
ID: SC-CODEX-FULLSCREEN-WEBSHELL-SELECTION
Profile: draft
Gate: required
Given 用户在 WebShell 中打开正在运行的 Codex 全屏会话
When 用户在移动端长按文本，或在桌面拖选文本并右键
Then 用户可使用 WebShell 的选区和相应操作菜单
And Codex 自带的选中及右键操作不会与 WebShell 操作重复出现
