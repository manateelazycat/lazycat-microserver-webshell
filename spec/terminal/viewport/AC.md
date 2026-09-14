# 场景 1：移动视口变化后终端布局恢复正常
ID: SC-TERMINAL-VIEWPORT
Profile: standard
Gate: required
Given 用户在移动布局中打开已有内容的终端
When 用户打开和收起软键盘并改变屏幕方向或窗口尺寸
Then 终端内容保持可见，布局恢复且可以继续输入
And 软键盘改变显示区域时，过渡画面不把旧终端内容按容器比例缩放
