# 场景 1：桌面标签拖拽后持久化顺序
ID: SC-WORKSPACE-TAB-REORDER-DESKTOP
Profile: standard
Gate: required
Given 用户在桌面布局中打开包含至少三个标签的工作区，其中待拖动标签不是活动标签
When 用户把待拖动标签拖到标签栏中的新位置并释放
Then 待拖动标签成为活动标签，标签栏立即显示新顺序且一次拖放只提交一个排序结果
And 用户刷新页面后仍看到相同的标签顺序和活动标签

# 场景 2：移动、平板与强制 PC 触摸边界
ID: SC-WORKSPACE-TAB-REORDER-TOUCH
Profile: standard
Gate: required
Given 用户在触摸设备的普通移动布局、折叠屏或平板宽屏布局中打开包含多个标签的工作区
When 用户在宽屏布局中直接横向滑动溢出的标签栏，或长按标签后拖动
Then 普通移动布局继续通过终端总览展示标签且不提供顶部标签拖拽
And 宽屏布局直接横滑可以浏览溢出标签且不改变标签顺序
And 宽屏布局和强制 PC 模式允许长按重排，释放后新顺序在刷新页面后保持
