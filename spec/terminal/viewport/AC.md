# 场景 1：移动视口变化后终端布局恢复正常
ID: SC-TERMINAL-VIEWPORT
Profile: standard
Gate: required
Given 用户在移动布局中打开已有内容的终端
When 用户打开和收起软键盘并改变屏幕方向或窗口尺寸
Then 终端内容保持可见，布局恢复且可以继续输入
And 软键盘改变显示区域时，过渡画面不把旧终端内容按容器比例缩放

# 场景 2：首次进入移动客户端无需触摸即可显示终端
ID: SC-TERMINAL-VIEWPORT-FIRST-PRESENTATION
Profile: draft
Gate: required
Given 用户首次打开移动客户端中的终端页面，客户端显示区域在终端创建前后发生变化，服务端会话可接入
When 页面加载并接收终端内容，用户不点击、不调整字号、不旋转设备
Then 页面自动完成布局并显示终端内容，不长期停留在黑屏等待状态
And 持续输出不妨碍首次画面完成，正常回放和尺寸同步期间不显示不完整过渡画面
And 初始化完成后仍遵守多窗口尺寸控制规则，不因被动输出反复接管其他窗口的尺寸
