# 场景 1：从左侧栏访问全部实例的会话
ID: SC-DESKTOP-INSTANCE-SESSIONS
Profile: draft
Gate: required
Given 用户可访问容器和物理机，两个实例均已有终端会话，其中一个会话包含两个分屏
When 用户打开 PC 工作区并选择左侧栏中另一个实例的该会话
Then 左侧栏按实例显示所有已打开会话，终端区域显示选中会话并保留两个分屏的排列
And 读取左侧栏列表不额外创建终端会话

# 场景 2：收起侧栏释放终端空间
ID: SC-DESKTOP-SIDEBAR-COLLAPSE
Profile: draft
Gate: required
Given 用户首次打开新 PC 布局，侧栏及实例分组均展开
When 用户收起侧栏，再通过唯一保留的展开按钮恢复侧栏
Then 终端先使用释放的空间，再适配恢复后的空间，当前会话和分屏保持可用

# 场景 3：预览按实例展示全部会话
ID: SC-DESKTOP-GROUPED-OVERVIEW
Profile: draft
Gate: required
Given 多个可访问实例已有终端会话，部分会话已有预览画面
When 用户打开新版 PC 终端预览并选择另一实例的会话
Then 预览按实例名分组展示全部会话，选择后进入对应实例的对应会话
And 缺少预览画面的会话显示无预览，读取预览不额外创建终端会话

# 场景 4：传统 PC 布局与移动布局保持可用
ID: SC-DESKTOP-LEGACY-LAYOUT
Profile: draft
Gate: required
Given 用户有已打开的会话，传统 PC 布局开关默认关闭
When 用户在调试模式中开启传统 PC 布局，再关闭该开关
Then 界面先恢复原 PC 顶部栏、标签和实例菜单，再回到新版侧栏布局，已有会话保持可用
And 移动布局仍使用原有导航和预览方式
