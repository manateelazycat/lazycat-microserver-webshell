# 场景 1：运行中的 Codex 输入区域连续跟随主题
ID: SC-CODEX-THEME-FOLLOWING
Profile: draft
Gate: required
Given 用户在 WebShell 默认终端配色模式下运行 Codex，输入框中有未提交文字
When 用户在主题选择器中连续切换不同深色和浅色主题
Then 输入框及使用相同派生背景的区域立即适配当前主题，无需重启 Codex
And 未提交文字和会话状态保持不变

# 场景 2：启动时机和重新进入不影响主题跟随
ID: SC-CODEX-THEME-REENTRY
Profile: draft
Gate: required
Given 用户先切换 WebShell 主题再启动 Codex，随后刷新页面或重新连接同一进程
When 用户再次切换 WebShell 主题
Then Codex 输入框及使用相同派生背景的区域跟随当前主题，无需重启 Codex

# 场景 3：其他程序保持自身显式配色
ID: SC-CODEX-THEME-ISOLATION
Profile: draft
Gate: required
Given 用户在另一个会话或退出 Codex 后运行其他程序，该程序使用与 Codex 输入框相同的显式背景色
When 用户切换 WebShell 主题
Then 该程序的显式背景色不因 Codex 适配发生变化
