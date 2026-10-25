# 场景 1：不同入口保留一致的沉浸终端与系统信息
ID: SC-CLIENT-CHROME-STATUS-BAR
Profile: draft
Gate: required
Given 用户在支持官方导航与状态栏声明的 iOS 客户端使用 LightOS 和 WebShell
When 用户直接打开 WebShell，或从管理页进入 WebShell 并返回
Then WebShell 隐藏宿主导航和关闭按钮，系统时间与电量仍可见，入口切换不导致全屏配置互相覆盖
When 用户切换终端主题或将客户端切到后台后恢复
Then 沉浸布局和系统信息继续保留，状态栏背景与当前终端主题一致

# 场景 2：Android 系统状态栏不造成重复留白
ID: SC-CLIENT-CHROME-ANDROID-INSET
Profile: draft
Gate: required
Given 用户在 Android 懒猫客户端使用 LightOS
When 用户直接打开 WebShell、从管理页进入或返回管理页
Then 系统时间与电量保持可见，页面顶部不重复预留状态栏高度，工具栏内容紧接正常页面间距显示
And iOS 的系统时间、电量保持可见，底部区域与页面背景一致，不出现额外异色带
