# 场景 1：输入和选择文本时终端画面保持稳定
ID: SC-TERMINAL-INTERACTION-JITTER
Profile: standard
Gate: required
Given 桌面终端已有稳定内容
When 用户点击终端、输入命令并拖动选择文本
Then 命令产生对应输出，输入和选择期间画面不跳动或短暂隐藏
