# 场景 1：终端键盘输入与控制操作保持可用
ID: SC-TERMINAL-INPUT
Profile: standard
Gate: required
Given 用户已打开可交互终端
When 用户连续执行命令、取消运行中的命令并输入大段文本
Then 输入得到对应输出，控制操作及大段文本输入后终端仍可继续使用
