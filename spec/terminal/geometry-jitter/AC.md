# 场景 1：终端显示参数与窗口调整平稳生效
ID: SC-TERMINAL-GEOMETRY-JITTER
Profile: standard
Gate: required
Given 用户已打开具有稳定内容的终端
When 用户调整字号、行距和窗口大小并切换标签
Then 终端画面持续可见并适应调整后的显示区域
