# 场景 1：连续大量输出期间终端内容与交互保持稳定
ID: SC-TERMINAL-OUTPUT
Profile: standard
Gate: required
Given 用户已打开持续可交互的终端
When 终端持续输出大量内容，用户同时输入并调整窗口或切换标签
Then 输出保持完整可见，操作后终端仍可继续交互
