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
And 展开时顶部左侧显示向左的收起箭头，文件上传和菜单靠右，不显示终端预览选项
And 收起后终端不再预留左侧空白，左上角浮动显示向右的展开箭头

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
And 移动布局仍使用原有导航，终端预览按实例分组展示全部会话

# 场景 5：短暂连接失败后自动显示会话
ID: SC-DESKTOP-SESSION-AUTO-RECOVERY
Profile: draft
Gate: required
Given 用户首次打开新版 PC 工作区，部分实例的终端服务暂时无法连接
When 这些实例恢复可连接状态
Then 左侧栏和终端预览自动显示对应实例的会话，用户无需点击重试
And 等待恢复期间实例标题显示蓝点，已经显示的会话列表保持可用，没有会话时列表区域留空
And 实例停止时显示红点，连接完成后恢复运行状态圆点；列表不显示停止、连接或加载的文字占位，例行后台刷新不会让已连接实例反复变成蓝点
And 物理机会话无需先点击物理机实例即可自动显示，单个实例的慢请求不妨碍其他实例恢复

# 场景 6：系统顶部安全区不遮挡终端
ID: SC-DESKTOP-TOP-SAFE-AREA
Profile: draft
Gate: required
Given 用户在存在系统顶部安全区的平板或折叠屏上使用新版 PC 布局
When 用户展开或收起侧栏，或改变窗口尺寸
Then 侧栏和终端内容均处于系统栏下方，终端顶部不被遮挡，也没有重复预留的顶部空白

# 场景 7：切换和预览保持已确认的会话
ID: SC-DESKTOP-STABLE-SESSION-LIST
Profile: draft
Gate: required
Given 多个实例已有会话，用户已经查看过这些实例的会话列表
When 用户切换实例或打开终端预览，新工作区仍在加载
Then 界面保留已确认的会话，连接期间用蓝点表示状态，不显示加载文字或「暂无终端会话」
And 确认实例没有会话后，侧栏和分组预览的列表区域留空，不显示「暂无终端会话」
And 微服实例与物理机实例之间双向切换时，工作区确认前不闪现「新建终端」按钮；只有确认工作区为空后才显示空状态入口

# 场景 8：侧栏沿用传统会话操作
ID: SC-DESKTOP-SESSION-INTERACTIONS
Profile: draft
Gate: required
Given 用户在新版布局中打开多个终端会话，并已配置传统标签快捷键
When 用户通过快捷键切换或移动会话，通过右键菜单操作会话，并双击会话名称修改后确认
Then 这些操作与传统布局作用于同一个会话及其分屏，名称修改在原位置完成且刷新后保留
And Enter 或失焦保存名称，Escape 取消编辑

# 场景 9：会话和实例拖拽顺序保持可用
ID: SC-DESKTOP-VERTICAL-REORDER
Profile: draft
Gate: required
Given 用户有多个可访问实例，其中一个支持排序的实例包含至少三个会话
When 用户拖拽会话及实例分组改变上下顺序，并刷新页面
Then 会话的新顺序保留，会话仍属于原实例；实例分组顺序由服务端按账号保存，同账号其他设备重新读取目录后也显示该实例顺序
And 实例顺序与管理页和终端预览一致，实例内标签仍独立排序，保存失败恢复原实例顺序并提示
And 一次会话拖放只提交一个排序结果，取消或失败后仍有可用顺序

# 场景 10：追踪已知和未预置的 Agent 工具
ID: SC-DESKTOP-FOREGROUND-AGENT-TRACKING
Profile: draft
Gate: required
Given 已有会话中运行 Codex 或一个未预置名称的 Agent 工具
When 工具启动、退出或前台进程发生变化
Then 侧栏自动反映真实前台工具或入口名称及会话运行状态，无需先点击对应实例
And 工具名不包含其他命令参数或内联代码
And 用户切到同一实例的其他会话或其他实例后，未查看会话完成一轮工作时显示未读，Agent 无需退出；收起侧栏后仍继续追踪
And 返回查看对应会话后清除其未读，其他会话未读保留；首次读取已有状态和历史回放不产生新未读

# 场景 11：已有物理机会话自动兼容显示
ID: SC-DESKTOP-EXISTING-CLIENT-WORKSPACE
Profile: draft
Gate: required
Given 物理机已有终端会话且能够通过原有工作区正常访问
When 用户打开新版布局，后台查询无法使用附加的会话检查能力
Then 左侧栏自动显示原有会话，无需先点击物理机，也不误报必须更新 PC 客户端
And 原有会话的身份、分屏和正在运行的任务保持可用

# 场景 12：区分工作、未读结果和出错
ID: SC-DESKTOP-SESSION-WORK-STATUS
Profile: draft
Gate: required
Given 用户已有能够报告工作状态的 Agent 或其他 CLI 会话，并在同一实例的另一个会话或另一个实例中查看终端
When CLI 开始工作、完成一轮工作，随后另一轮执行出错
Then 对应会话的名称左侧依次显示像素转圈、绿色未读对钩和红点，不显示额外终端图标，名称位置不随状态变化
And 一轮工作在两次后台刷新之间完成时仍显示未读；等待输入或授权不显示成功完成或错误
And 用户查看完成的会话后只清除该会话的绿色未读提示，减少动态效果时工作状态仍可辨认

# 场景 14：会话名称利用侧栏宽度并保留首尾
ID: SC-DESKTOP-SESSION-LABEL-WIDTH
Profile: draft
Gate: required
Given 用户在新版 PC 侧栏中查看多个名称末尾不同的长会话名
When 用户查看这些会话并缩窄侧栏
Then 会话内容相对实例标题保留小幅左侧缩进以区分父子层级，悬停与选中背景左右留白一致，其余宽度充分利用，任务动画与标题字号大小一致，空闲时保留同宽位置，名称区域右沿与实例展开收起箭头右沿对齐
And Codex 等工具入口提示位于名称右侧，出现或消失时名称左侧起点不变，左侧任务状态仍正常显示
And 名称最多显示两行，一行不足时使用第二行；超过两行时在中间省略，保留开头和末尾以区分项目或文件名，悬停及重命名仍可读取完整名称
And 鼠标悬停出现关闭按钮后，原本单行的名称继续单行省略，原本两行的仍可使用两行，不能仅因关闭按钮占位而增加行高

# 场景 15：拖动分隔线调整侧栏宽度
ID: SC-DESKTOP-SIDEBAR-RESIZE
Profile: draft
Gate: required
Given 用户在新版 PC 布局中打开包含分屏的终端会话
When 用户左右拖动侧栏右侧的竖向分隔线，再缩窄窗口并刷新页面
Then 侧栏随拖动改变宽度且始终不超过窗口宽度的三分之一，刷新后恢复所选宽度并继续遵守上限
And 当前终端及其分屏保持可用，聚焦分隔线后也能通过键盘调整宽度

# 场景 16：侧栏选项菜单不被裁剪
ID: SC-DESKTOP-SIDEBAR-MENU-VIEWPORT
Profile: draft
Gate: required
Given 用户在新版 PC 布局中将侧栏调窄，顶部选项按钮靠近窗口左侧
When 用户打开选项菜单，并改变窗口尺寸后再次查看菜单
Then 菜单显示在按钮下方，可以超出侧栏范围；靠近窗口左缘时自动向右平移，菜单横向内容保持在可见窗口内
And 高度不足时菜单内可以滚动访问全部选项，菜单操作、点击外部及 Escape 关闭仍可用

# 场景 17：没有可靠任务状态时保持空状态
ID: SC-DESKTOP-SESSION-NO-WORK-STATUS
Profile: draft
Gate: required
Given 用户已有不报告任务状态的交互 CLI 会话，且该会话没有未读完成或错误状态
When 用户执行一条输入并让 CLI 保持驻留等待下一次输入，再退出 CLI
Then 会话名称左侧的任务状态位置始终留空，不因进程驻留显示转圈，也不因退出显示成功完成
And 不显示「未知」图标、文字或提示，前台工具名称与关闭运行中命令的保护仍然可用
