# 场景 1：重复点击终端不引起画面抖动
ID: SC-TERMINAL-CLICK-JITTER
Profile: standard
Gate: required
Given 桌面终端已有稳定内容且窗口尺寸不变
When 用户在同一终端连续点击
Then 已有画面持续可见，终端位置和尺寸保持稳定
