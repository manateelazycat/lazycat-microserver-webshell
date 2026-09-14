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
