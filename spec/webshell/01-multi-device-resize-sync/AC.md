# 场景 1：两个设备交替使用终端时尺寸与输入恢复正常
ID: SC-MULTI-DEVICE-RESIZE-SYNC
Profile: standard
Gate: required
Given 两个授权浏览器打开同一终端
When 用户交替调整窗口并在一次连接恢复期间输入命令
Then 终端尺寸适应最后使用的窗口，连接恢复后输入按顺序执行且不重复
