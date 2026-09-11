# 场景 1：一个窗口新建标签后两端数量一致
ID: SC-CROSS-DEVICE-TAB-SYNC
Profile: standard
Gate: required
Given 两个授权浏览器窗口打开同一工作区，标签数量一致
When 用户在其中一个窗口新建一个标签
Then 另一个窗口自动同步新增标签，两个窗口的标签数量均比操作前增加一个且保持一致
