# 场景 1：横屏菜单收缩后所有选项仍可访问
ID: SC-INSTANCE-SWITCHER-LANDSCAPE-SCROLL
Profile: draft
Gate: required
Given 用户在小屏手机的移动布局中打开右上角菜单，菜单内容超过横屏下的可用高度
When 用户切换到横屏或缩小窗口高度，并纵向滚动菜单
Then 菜单自动收缩到当前可用高度，底部不被快捷键栏或安全区域遮挡
And 用户可以滚动访问首页、设置及最后一个实例选项，并正常选择可用入口

# 场景 2：快捷键为空时菜单仍适应可用高度
ID: SC-INSTANCE-SWITCHER-EMPTY-SHORTCUTS
Profile: draft
Gate: required
Given 用户在小屏手机的移动布局中使用空快捷键配置
When 用户打开右上角菜单并改变屏幕方向
Then 菜单可以使用快捷键栏释放的空间，底部仍保持在可操作的显示区域内
And 内容超出当前可用高度时仍可以纵向滚动访问全部选项
